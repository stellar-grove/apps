/* live.js — the running simulation: clock, census path, environment, monitored patients, alerts, money, events */
const P = CBSim.plan(SYS);
const START = new Date(Date.UTC(2026, 10, 30, 6)); // Monday 30 Nov 2026, 06:00
const HISTORY_H = 24 * 14;
const HOUR0 = 6; // START's hour of the week (Monday 06:00)
const MONITORED = UNITS.map((u, i) => i).filter((i) => isBedUnit(UNITS[i]) && (SYS.monitoring.hazard[UNITS[i].kind] || 0) > 0);
const ICU_FOR = { CBMC: ["MICU", "SICU", "CVICU"], WCH: ["WICU", "MICU"], MFE: ["MICU"], HPS: ["SICU", "MICU"], ERH: ["MICU"], KBH: ["MICU"] };
const RULES = {
  std: { label: "NEWS2 ≥ 5 or any red score", test: (h) => h.at(-1).news2 >= 5 || h.at(-1).red },
  sustained: { label: "NEWS2 ≥ 5 sustained 1 h", test: (h) => h.length >= 4 && h.slice(-4).every((r) => r.news2 >= 5) },
  high: { label: "NEWS2 ≥ 7", test: (h) => h.at(-1).news2 >= 7 },
};

const Live = {
  t: 0, playing: false, speed: Number(store.get("speed", 2)), timer: null, listeners: new Set(),
  effects: [], scenarioName: "Normal operations",
  monitor: store.get("monitor", "continuous"), rule: store.get("rule", "sustained"),
  now() { return CBSim.addHours(START, this.t); },

  init() {
    this.R = CBSim.rng(SYS.seed + 7);
    const warm = CBSim.warmStart(P, START);
    this.state = new CBSim.State(P, warm, true, SYS.seed + 11);
    this.days = CBSim.dailyDrivers(SYS, START, 420, true, CBSim.rng(SYS.seed + 13));
    this.history = [];
    this.events = [];
    this.alerts = [];
    this.alertSeq = 0; this.pid = 0;
    this.patients = new Map(MONITORED.map((u) => [u, []]));
    this.stats = { events: 0, caught: 0, early: 0, falseAlerts: 0, trueAlerts: 0, patientHours: 0, leads: [] };
    this.finA = CBSim.unitFinance(P);
    this.days_ = new Map(); // date string -> money accumulator
    this.quarter = 0;
    this.block = null;
    this.mods = []; this.modVer = 0;
    this.messages = []; this.msgSeq = 0;
    this.discharges = []; this.dischargedAt = new Map(); this.transferredAt = new Map();
    this.dSnaps = []; this.dEval = { y: [], p: [], unitAbs: [], unitNaive: [], snaps: 0 };
    this.fcPending = []; this.fcScores = [];
    this.syncPatients(true);
    // seed 24 h of history so charts have context
    for (let k = 0; k < 24; k++) this.advance(true);
    this.log("info", "Command center online", `${SYS.name}: ${FACS.length} facilities, ${UNITS.filter((u) => isBedUnit(u)).reduce((s, u) => s + u.beds, 0)} beds.`);
  },

  /* environment for the next 48 h from hour t0, with the active scenario effects shifted to that block */
  envBlock() {
    if (this.block && this.t >= this.block.t0 && this.t < this.block.t0 + this.block.hours && this.block.ver === this.effVer + "/" + this.modVer) return this.block;
    const t0 = this.t, hours = 48, at = CBSim.addHours(START, t0);
    const d0 = Math.round((CBSim.dayStart(at) - CBSim.dayStart(START)) / 864e5);
    const days = this.days.slice(d0, d0 + 6).map((d) => ({ ...d }));
    const sc = { effects: this.effects.map((e) => shiftEffect(e, -t0)) };
    dailyApply(days, this.effects, at);
    const env = CBSim.modEnv(P, CBSim.environment(P, at, hours, sc, true, this.R, days), this.mods, t0);
    this.block = { t0, hours, env, ver: this.effVer + "/" + this.modVer };
    return this.block;
  },
  effVer: 0,
  /* today's weather drivers, including any scenario overrides in the current block */
  today() {
    const blk = this.block, at = this.now();
    if (blk) { const i = Math.round((CBSim.dayStart(at) - CBSim.dayStart(CBSim.addHours(START, blk.t0))) / 864e5); if (blk.env.days[i]) return blk.env.days[i]; }
    return this.days[Math.round((CBSim.dayStart(at) - CBSim.dayStart(START)) / 864e5)];
  },

  setScenario(name, effects) {
    this.effects = effects.map((e) => shiftEffect(e, this.t));
    this.effVer++; this.scenarioName = name;
    this.log(effects.length ? "warn" : "info", effects.length ? `Scenario started: ${name}` : "Scenario cleared", effects.length ? describeEffects(effects) : "Back to normal operations.");
    this.emit();
  },

  advance(quiet) {
    // structural levers (surge beds, overflow routes) active this hour
    const act = this.mods.filter((m) => (m.type === "beds" || m.type === "overflow") && this.t >= m.start && this.t < m.end);
    const sig = act.map((m) => m.id).join(",");
    if (sig !== this._modSig) { this._modSig = sig; this.state.P = CBSim.modPlan(P, act); }
    if (this.mods.some((m) => this.t === m.end)) { this.log("info", "Lever ended", this.mods.filter((m) => this.t === m.end).map((m) => m.label).filter((v, i, a) => a.indexOf(v) === i).join("; ")); }
    if (this.now().getUTCHours() === 7) this.dailyHuddle(quiet);
    const blk = this.envBlock(), k = this.t - blk.t0, env = blk.env;
    const how = CBSim.hourOfWeek(this.now());
    const prevDiv = this.history.length ? this.history.at(-1).sat : null;
    const f = this.state.step(how, env, k);
    const C = Float64Array.from(this.state.C);
    // money
    const key = CBSim.dayStart(this.now()).toISOString().slice(0, 10);
    if (!this.days_.has(key)) this.days_.set(key, CBSim.newAcc(P.U));
    CBSim.hourMoney(P, this.finA, C, f.cases, env.callout[k], null, this.days_.get(key));
    if (this.days_.size > 40) this.days_.delete(this.days_.keys().next().value);
    // ED saturation per ED group
    const sat = {};
    UNITS.forEach((u, i) => {
      if (u.kind === "ed" && !u.parent && u.capped === false) {
        let occ = 0; UNITS.forEach((w, j) => { if (P.group[j] === i) occ += C[j]; });
        sat[u.id] = occ / u.beds >= SYS.ed_divert_at;
      }
    });
    const rec = { t: this.t, C, B: f.boarding, div: f.diverted, lost: f.lost, arrived: f.arrived, cases: f.cases, home: f.home, sat,
      resp: env.resp[k], temp: this.today().temp, snow: this.today().snow,
      callout: env.callout[k], arrMult: env.arr[k][UIX.ED] };
    this.history.push(rec);
    if (this.history.length > HISTORY_H) this.history.shift();
    if (!quiet) {
      Object.keys(sat).forEach((id) => {
        if (prevDiv && sat[id] !== prevDiv[id]) this.log(sat[id] ? "crit" : "ok", `${UNITS[UIX[id]].name} ${sat[id] ? "on diversion" : "off diversion"}`,
          sat[id] ? `Patients ≥ ${SYS.ed_divert_at}× bays; ambulances are being redirected.` : "Back below the diversion threshold.");
      });
      const lostN = f.lost.reduce((a, b) => a + b, 0);
      if (lostN > 0) {
        const where = UNITS.filter((u, i) => f.lost[i] > 0).map((u) => u.name).join(", ");
        this.log("warn", `${lostN} transfer${lostN > 1 ? "s" : ""} declined`, `No bed in ${where} or its overflow units.`);
      }
      const edb = f.boarding[UIX.ED];
      if (edb >= 8 && (!this._edbWarn || this.t - this._edbWarn > 12)) { this._edbWarn = this.t; this.log("warn", `${edb} patients boarding in the main ED`, "Admitted patients are waiting for inpatient beds."); }
    }
    this.syncPatients(false, f, quiet);
    for (let q = 0; q < 4; q++) this.tickPatients(this.t + q / 4 + 0.25, quiet);
    this.t++;
    this.scoreForecasts();
  },

  /* Keep each monitored unit's patient list equal to its census. Leavers are the patients most overdue for
     their planned discharge; up to the engine's HOME exits are discharged (ADT A03), the rest transfer and are
     re-admitted where the engine moved patients (A02), and new external arrivals are admitted (A01). */
  syncPatients(initial, f, quiet) {
    const pool = [];
    const due = (p) => (p.stay ? p.stay.end : this.t);
    // a planned discharge the hospital couldn't make (no ride, no placement, labs pending) slips to the next day
    if (!initial) for (const list of this.patients.values()) list.forEach((p) => {
      if (!p.stay || p.stay.end >= this.t - 6) return;
      p.stay.end += 24; p.stay.slips = (p.stay.slips || 0) + 1;
      // after a second slip the order is rewritten for the new day (a stale order no longer means "leaving soon")
      if (p.stay.slips >= 2) p.stay.order = this.R.u() < SYS.discharge.order_prob ? p.stay.end - (2 + this.R.u() * 28) : null;
    });
    for (const u of MONITORED) {
      const list = this.patients.get(u), want = Math.round(this.state.C[u]);
      // gross exits this hour = census before + admissions in - census after (not just the net change)
      const n = Math.min(list.length, Math.max(0, list.length - want + (f && !initial ? Math.round(f.cases[u]) : 0)));
      if (n > 0) {
        const homeN = initial || !f ? n : Math.min(n, Math.round(f.home[u]));
        list.sort((a, b) => due(a) - due(b));
        for (let k = 0; k < n; k++) {
          const p = list.shift();
          if (k < homeN) this.discharge(p, u, quiet); else { p.fromU = u; pool.push(p); }
        }
      }
    }
    for (const u of MONITORED) {
      const list = this.patients.get(u), want = Math.round(this.state.C[u]);
      let tin = f ? Math.round(f.cases[u] - f.arrived[u]) : 0;
      while (list.length < want) {
        let p;
        if (pool.length && tin > 0) {
          p = pool.shift(); tin--; this.transferredAt.set(p.id, this.t);
          this.closeAlerts(p.id, "transferred");
          p.alertOpen = false; p.uix = u; p.unit = UNITS[u].id; p.bed = bedLabel(UNITS[u], list.length);
          CBSim.planStay(SYS, this.R, p, UNITS[u], this.t, HOUR0, false, true);
          this.adt("A02", p, p.fromU, u);
        } else {
          p = new CBSim.Patient(SYS, this.R, UNITS[u], this.t, "P" + String(++this.pid).padStart(5, "0"));
          p.uix = u; p.phase = Math.floor(this.R.u() * 16); p.bed = bedLabel(UNITS[u], list.length);
          p.mrn = "CB" + String(4100000 + this.pid * 37 % 900000);
          CBSim.planStay(SYS, this.R, p, UNITS[u], this.t, HOUR0, initial, false);
          if (initial && p.det && p.det.onset < this.t) p.det = null; // nobody starts mid-deterioration
          if (!initial) this.adt("A01", p, null, u);
        }
        list.push(p);
      }
    }
    pool.forEach((p) => { this.transferredAt.set(p.id, this.t); this.closeAlerts(p.id, "transferred"); this.adt("A02", p, p.fromU, null); });
  },

  discharge(p, u) {
    this.closeAlerts(p.id, "discharged");
    this.adt("A03", p, u, null);
    if (p.stay) {
      this.discharges.push({ t: this.t, u, drg: p.stay.drg, weight: p.stay.weight, gmlos: p.stay.gmlos, los: (this.t - p.stay.admit) / 24, fac: UNITS[u].facility });
      if (this.discharges.length > 4000) this.discharges.shift();
    }
    this.dischargedAt.set(p.id, this.t);
  },

  /* 07:00: score every patient's chance of going home in 24 h (the morning bed huddle), and forecast census */
  dailyHuddle(quiet) {
    const items = [];
    for (const [u, list] of this.patients) list.forEach((p) => { if (p.stay) items.push({ pid: p.id, u, p: CBSim.dischargeProb(SYS, CBSim.dischargeFeatures(p, this.t, HOUR0)) }); });
    this.dSnaps.push({ t: this.t, items });
    if (!quiet) {
      const main = mainCensusNow();
      forecast({ hours: 72, paths: 40, quiet: true, onDone: (r) => {
        const pick = (h) => ({ h, p10: r.q.main.p10[h - 1], p50: r.q.main.p50[h - 1], p90: r.q.main.p90[h - 1] });
        this.fcPending.push({ t0: r.t0, now: main, hs: [pick(24), pick(48), pick(72)] });
      } });
    }
  },

  /* score huddle predictions after 24 h and census forecasts when their hour arrives */
  scoreForecasts() {
    while (this.dSnaps.length && this.dSnaps[0].t + 24 <= this.t) {
      const sn = this.dSnaps.shift(), byU = new Map();
      sn.items.forEach((it) => {
        const d = this.dischargedAt.get(it.pid), went = d != null && d > sn.t - 1 && d <= sn.t + 23;
        const tr = this.transferredAt.get(it.pid), moved = tr != null && tr >= sn.t && tr <= sn.t + 23;
        if (!went && (moved || !this.findPatient(it.pid))) return; // transferred to another unit: censored, as in the research
        this.dEval.y.push(went ? 1 : 0); this.dEval.p.push(it.p);
        const b = byU.get(it.u) || { pred: 0, act: 0, n: 0 }; b.pred += it.p; b.act += went ? 1 : 0; b.n++; byU.set(it.u, b);
      });
      byU.forEach((b, u) => { this.dEval.unitAbs.push(Math.abs(b.pred - b.act)); this.dEval.unitNaive.push(Math.abs(b.n / (UNITS[u].los_h / 24) - b.act)); });
      this.dEval.snaps++;
      if (this.dEval.y.length > 20000) { this.dEval.y.splice(0, 5000); this.dEval.p.splice(0, 5000); }
    }
    this.fcPending = this.fcPending.filter((fc) => {
      fc.hs = fc.hs.filter((h) => {
        if (this.t < fc.t0 + h.h) return true;
        const rec = this.history.find((r) => r.t === fc.t0 + h.h - 1);
        if (rec) this.fcScores.push({ t0: fc.t0, h: h.h, ...h, actual: mainCensus(rec.C), now: fc.now });
        return false;
      });
      return fc.hs.length > 0;
    });
    if (this.fcScores.length > 600) this.fcScores.splice(0, 100);
  },

  /* HL7 v2 ADT / ORU events for the integration feed */
  adt(type, p, fromU, toU, extra) {
    this.messages.unshift({ seq: ++this.msgSeq, t: this.t + (this._subhour || 0), type, pid: p.id, mrn: p.mrn || p.id, name: p.name, age: p.age,
      from: fromU != null ? UNITS[fromU].id : null, to: toU != null ? UNITS[toU].id : null, bed: p.bed, drg: p.stay ? p.stay.drg : null, extra });
    if (this.messages.length > 400) this.messages.pop();
  },

  /* operational levers (recommended actions) */
  applyLever(lv) {
    const id = lv.id + "@" + this.t;
    lv.mods.forEach((m) => this.mods.push({ ...m, id, label: lv.label, start: this.t, end: this.t + lv.hours }));
    this.modVer++; this._modSig = null;
    this.log("ok", `Lever applied: ${lv.label}`, `For the next ${lv.hours} h. ${lv.blurb}`);
    this.emit();
  },
  activeLevers() {
    const seen = new Map();
    this.mods.filter((m) => this.t < m.end).forEach((m) => seen.set(m.id, m));
    return [...seen.values()];
  },

  tickPatients(h, quiet) {
    this.quarter++;
    const rule = RULES[this.rule] || RULES.std;
    for (const u of MONITORED) {
      const list = this.patients.get(u);
      for (let j = list.length - 1; j >= 0; j--) {
        const p = list[j];
        const rd = p.tick(SYS, this.R, h);
        this.stats.patientHours += 0.25;
        const visible = this.monitor === "continuous" || (this.quarter - p.phase) % 16 === 0;
        if (visible) {
          p.seen = (p.seen || []); p.seen.push(rd); if (p.seen.length > 8) p.seen.shift();
          p.last = rd;
          const on = this.monitor === "continuous" ? rule.test(p.seen) : (this.rule === "high" ? rd.news2 >= 7 : (rd.news2 >= 5 || rd.red));
          if (on && !p.alertOpen) this.raise(p, rd, h, quiet);
          if (!on && p.alertOpen) { p.alertOpen = false; const a = this.alerts.find((x) => x.pid === p.id && x.status === "open"); if (a) a.status = "cleared"; }
        }
        if (p.event) {
          this.stats.events++;
          const caught = p.firstAlert != null;
          if (caught) { this.stats.caught++; this.stats.leads.push(p.det.tEvent - p.firstAlert); }
          if (!quiet) this.log("crit", `Rapid response: ${p.name}, ${UNITS[u].name}`,
            `${patternLabel(p.det.pattern)}. ${caught ? `Alerted ${(p.det.tEvent - p.firstAlert).toFixed(1)} h earlier.` : "No early-warning alert fired."}`, p.id);
          this.transferToIcu(p, u, j, "event");
        }
      }
    }
  },

  raise(p, rd, h, quiet) {
    p.alertOpen = true;
    const truth = !!(p.det && h >= p.det.onset);
    if (truth) { this.stats.trueAlerts++; if (p.firstAlert == null) p.firstAlert = h; } else this.stats.falseAlerts++;
    const a = { id: ++this.alertSeq, pid: p.id, uix: p.uix, t: h, score: rd.news2, red: rd.red, qsofa: rd.qsofa, status: "open", truth };
    this._subhour = h - this.t; this.adt("ORU", p, p.uix, null, rd); this._subhour = 0;
    this.alerts.unshift(a);
    if (this.alerts.length > 200) this.alerts.pop();
    if (!quiet && rd.news2 >= 7) this.log("warn", `NEWS2 ${rd.news2}: ${p.name}`, `${UNITS[p.uix].name} · bed ${p.bed}`, p.id);
  },

  escalate(pid) {
    const found = this.findPatient(pid); if (!found) return;
    const { p, u, j } = found;
    const truth = p.det && this.t >= p.det.onset;
    this.alerts.filter((a) => a.pid === pid && a.status === "open").forEach((a) => { a.status = truth ? "escalated" : "false alarm"; });
    if (truth) {
      this.stats.early++;
      this.log("ok", `Early escalation: ${p.name}`, `${patternLabel(p.det.pattern)} caught ${(p.det.tEvent - this.t).toFixed(1)} h before the predicted crisis. Moving to ICU.`, p.id);
      this.transferToIcu(p, u, j, "early");
    } else {
      p.alertOpen = false;
      this.log("info", `Assessed: ${p.name}`, "Rapid response team found the patient stable. Alert closed as a false alarm.", p.id);
    }
    this.emit();
  },
  closeAlerts(pid, status) { this.alerts.forEach((a) => { if (a.pid === pid && (a.status === "open" || a.status === "acknowledged")) a.status = status; }); },
  acknowledge(id) { const a = this.alerts.find((x) => x.id === id); if (a) a.status = "acknowledged"; this.emit(); },

  transferToIcu(p, u, j, why) {
    const fac = UNITS[u].facility, C = this.state.C;
    const dest = (ICU_FOR[fac] || ["MICU"]).map((id) => UIX[id]).find((d) => d !== u && C[d] < UNITS[d].beds);
    this.patients.get(u).splice(j, 1);
    this.closeAlerts(p.id, why === "early" ? "escalated" : "rapid response");
    let bsum = 0; for (let v = 0; v < P.U; v++) bsum += this.state.B[u][v];
    if (dest != null && C[u] - bsum >= 1) {
      C[u] -= 1; C[dest] += 1;
      p.uix = dest; p.unit = UNITS[dest].id; p.det = null; p.event = false; p.alertOpen = false; p.firstAlert = null;
      p.base.hr -= 6; p.bed = bedLabel(UNITS[dest], this.patients.has(dest) ? this.patients.get(dest).length : 0);
      CBSim.planStay(SYS, this.R, p, UNITS[dest], this.t, HOUR0, false, true);
      this.adt("A02", p, u, dest); this.transferredAt.set(p.id, this.t);
      if (this.patients.has(dest)) this.patients.get(dest).push(p);
    } else if (why === "event") this.log("crit", "No ICU bed available", `${p.name} is being stabilized on ${UNITS[u].name}.`);
  },

  findPatient(pid) {
    for (const [u, list] of this.patients) { const j = list.findIndex((p) => p.id === pid); if (j >= 0) return { p: list[j], u, j }; }
    return null;
  },
  allPatients() { const out = []; for (const list of this.patients.values()) out.push(...list); return out; },

  log(level, title, body, pid) {
    this.events.unshift({ t: this.t, level, title, body, pid });
    if (this.events.length > 300) this.events.pop();
  },

  play() { if (this.playing) return; this.playing = true; this.loop(); this.emit(); },
  pause() { this.playing = false; clearTimeout(this.timer); this.emit(); },
  loop() {
    if (!this.playing) return;
    const steps = this.speed >= 6 ? 3 : 1;
    for (let k = 0; k < steps; k++) this.advance(false);
    this.emit();
    this.timer = setTimeout(() => this.loop(), 1000 * steps / this.speed);
  },
  step(h = 1) { for (let k = 0; k < h; k++) this.advance(false); this.emit(); },
  setSpeed(s) { this.speed = s; store.set("speed", s); },
  reset() { this.pause(); this.t = 0; this.effects = []; this.effVer++; this.scenarioName = "Normal operations"; this._modSig = null; this.init(); this.emit(); },

  /* shareable state: everything needed to rebuild this moment from the seed */
  shareState() { return { t: this.t, e: this.effects, n: this.scenarioName, m: this.monitor, r: this.rule, mods: this.mods }; },
  restore(s) {
    this.pause(); this.t = 0; this.effVer++; this._modSig = null; this.init();
    this.effects = s.e || []; this.scenarioName = s.n || "Normal operations"; this.monitor = s.m || this.monitor; this.rule = s.r || this.rule;
    this.mods = s.mods || []; this.effVer++; this.modVer++;
    while (this.t < (s.t || 0)) this.advance(false);
    this.emit();
  },

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this.listeners.forEach((fn) => fn()); });
  },
};

/* heat and snow act on whole days: apply effects (hours from START) to a day list that begins at dayStart(at) */
function dailyApply(days, effAbs, at) {
  const off = (CBSim.dayStart(at) - START) / 3600e3;
  CBSim.applyScenario(days, { effects: effAbs.map((e) => shiftEffect(e, -off)) });
}
function shiftEffect(e, dh) {
  const o = { ...e, start_h: e.start_h + dh };
  if (e.end_h != null) o.end_h = e.end_h + dh;
  return o;
}
function describeEffects(effects) {
  return effects.map((e) => e.type === "resp" ? `respiratory index → ${e.level.toFixed(2)} over ${e.ramp_h} h`
    : e.type === "heat" ? `highs of ${e.temp}°F for ${Math.round((e.end_h - e.start_h) / 24)} days`
    : e.type === "snow" ? `${e.inches} in of snow`
    : e.type === "mci" ? `${e.patients} trauma patients over ${e.hours} h` : e.type).join("; ") + ".";
}
function patternLabel(p) { return { sepsis: "Sepsis", respiratory: "Respiratory failure", hemorrhage: "Hemorrhage", cardiac: "Arrhythmia" }[p] || p; }
function bedLabel(u, k) { return u.id + "-" + String(k + 1).padStart(2, "0"); }

/* ---------- derived views of the live state */
function snapshot(rec = Live.history.at(-1)) {
  const C = rec.C, B = rec.B;
  const fac = {};
  FACS.forEach((f) => { fac[f.id] = { census: 0, beds: 0, board: 0, ed: 0, edBays: 0 }; });
  UNITS.forEach((u, i) => {
    const F = fac[u.facility];
    if (isBedUnit(u)) { F.census += C[i]; F.beds += u.beds; }
    if (u.kind === "ed") { F.ed += C[i]; if (!u.parent) F.edBays += u.beds; }
    F.board += B[i];
  });
  let census = 0, beds = 0; Object.values(fac).forEach((f) => { census += f.census; beds += f.beds; });
  const mainIdx = UNITS.map((u, i) => i).filter((i) => UNITS[i].facility === "CBMC" && isBedUnit(UNITS[i]));
  const main = mainIdx.reduce((s, i) => s + C[i], 0) / mainIdx.reduce((s, i) => s + UNITS[i].beds, 0);
  return { C, B, fac, census, beds, main, edMain: C[UIX.ED] + C[UIX.EDT], edBoard: B[UIX.ED] + B[UIX.EDT], rec };
}
function bedsNow(i) { return Live.state && Live.state.P ? Live.state.P.beds[i] : UNITS[i].beds; }
function unitOcc(i, C) { const b = bedsNow(i); return b ? (C[i] + (UNITS[i].id === "ED" ? C[UIX.EDT] : 0)) / b : 0; }
function series(fn, hours = 48) { return Live.history.slice(-hours).map(fn); }
function mainOcc(rec) {
  let c = 0, b = 0; UNITS.forEach((u, i) => { if (u.facility === "CBMC" && isBedUnit(u)) { c += rec.C[i]; b += u.beds; } });
  return c / b;
}
function moneyFor(days) {
  const keys = [...Live.days_.keys()].slice(-days), acc = CBSim.newAcc(P.U);
  keys.forEach((k) => { const a = Live.days_.get(k); Object.keys(acc).forEach((f) => { for (let i = 0; i < P.U; i++) acc[f][i] += a[f][i]; }); });
  return acc;
}

/* ---------- Monte Carlo forecast from the live state: in a Web Worker when the browser allows it ---------- */
let WORKER = null, WORKER_OK = true, FC_SEQ = 0;
const FC_JOBS = new Map();
function worker() {
  if (!WORKER_OK) return null;
  if (WORKER) return WORKER;
  try {
    WORKER = new Worker("js/worker.js");
    WORKER.onmessage = (e) => {
      const job = FC_JOBS.get(e.data.id); if (!job) return;
      if (e.data.progress != null) { if (job.onProgress) job.onProgress(e.data.progress); return; }
      FC_JOBS.delete(e.data.id); job.finish(e.data.result);
    };
    WORKER.onerror = () => { WORKER_OK = false; WORKER = null; const jobs = [...FC_JOBS.values()]; FC_JOBS.clear(); jobs.forEach((j) => j.fallback()); };
  } catch (err) { WORKER_OK = false; WORKER = null; }
  return WORKER;
}
function forecast({ hours = 72, paths = 120, effects = null, mods = null, onDone, onProgress }) {
  const t0 = Live.t, at = Live.now();
  const d0 = Math.round((CBSim.dayStart(at) - CBSim.dayStart(START)) / 864e5);
  const days = Live.days.slice(d0, d0 + Math.ceil(hours / 24) + 3).map((d) => ({ ...d }));
  const abs = effects || Live.effects, sc = { effects: abs.map((e) => shiftEffect(e, -t0)) };
  dailyApply(days, abs, at);
  const allMods = (mods || []).concat(Live.mods.filter((m) => m.end > t0));
  const env = CBSim.modEnv(P, CBSim.environment(P, at, hours, sc, true, CBSim.rng(SYS.seed + 3), days), allMods, t0);
  const structural = allMods.filter((m) => (m.type === "beds" || m.type === "overflow") && m.start < t0 + hours);
  const o = { at: at.getTime(), hours, paths, env, mods: structural, C: Array.from(Live.state.C), B: Live.state.B.map((r) => Array.from(r)),
    Q: Array.from(Live.state.Q), seed: SYS.seed + t0 };
  const finish = (res) => { res.at = new Date(res.at); res.env = env; res.t0 = t0; onDone(res); };
  const fallback = () => setTimeout(() => finish(CBSim.forecastCore(CBSim.modPlan(P, structural), o)), 0);
  const w = worker();
  if (!w) { fallback(); return; }
  const id = ++FC_SEQ;
  FC_JOBS.set(id, { finish, fallback, onProgress });
  w.postMessage({ id, ...o });
}
function mainCensus(C) { let c = 0; UNITS.forEach((u, i) => { if (u.facility === "CBMC" && isBedUnit(u)) c += C[i]; }); return c; }
function mainCensusNow() { return mainCensus(Live.state.C); }

/* ---------- levers the Actions page evaluates (each lasts `hours` from now) */
const LEVERS = [
  { id: "surge", label: "Open 12 flex beds on 6 North", hours: 48, cost: "Staffed with agency nurses at the 1:5 ratio",
    blurb: "Converts a closed wing into 12 medicine beds and points telemetry and observation overflow at it.",
    mods: [{ type: "beds", unit: "6N", n: 12 }, { type: "overflow", units: ["7N", "OBS", "8N"], to: ["6N"] }] },
  { id: "dbn", label: "Discharge-before-noon push", hours: 48, cost: "Hospitalist and case-management time",
    blurb: "Rounds early on medicine, telemetry, oncology and observation so ready patients leave sooner (stays −8%).",
    mods: [{ type: "los", units: ["4N", "5N", "6N", "7N", "8N", "OBS"], mult: 0.92 }] },
  { id: "elective", label: "Postpone half of elective surgery", hours: 48, cost: "Lost and deferred surgical revenue",
    blurb: "Halves scheduled main-campus OR cases, freeing surgical and ICU beds.",
    mods: [{ type: "arr", units: ["OR"], mult: 0.5 }] },
  { id: "westshore", label: "Overflow medicine patients to Westshore", hours: 48, cost: "Transport and a less specialized unit",
    blurb: "Lets full main-campus medicine, telemetry and observation units place patients on Westshore Medical-Surgical.",
    mods: [{ type: "overflow", units: ["4N", "5N", "6N", "7N", "OBS"], to: ["WMS"] }] },
  { id: "stepdown", label: "Faster ICU step-down rounds", hours: 48, cost: "Intensivist time; slightly more step-down load",
    blurb: "Twice-daily ICU step-down rounds shorten ICU stays by 10%.",
    mods: [{ type: "los", units: ["MICU", "SICU", "CVICU", "NSICU"], mult: 0.9 }] },
];

/* annual mean-field plan (deterministic), computed once */
let ANNUAL = null;
function annualPlan() {
  if (ANNUAL) return ANNUAL;
  const start = new Date(Date.UTC(2027, 0, 1));
  const init = CBSim.warmStart(P, start);
  const r = CBSim.run(P, start, 365 * 24, { stochastic: false, init });
  ANNUAL = { start, r };
  return ANNUAL;
}
function annualFinance(opt) {
  const { start, r } = annualPlan();
  const A = CBSim.unitFinance(P, opt), months = [];
  let cur = null, acc = null; const total = CBSim.newAcc(P.U);
  for (let t = 0; t < r.census.length; t++) {
    const m = CBSim.addHours(start, t).getUTCMonth();
    if (m !== cur) { cur = m; acc = CBSim.newAcc(P.U); months.push({ m, acc, occ: 0, n: 0 }); }
    CBSim.hourMoney(P, A, r.census[t], r.cases[t], r.env.callout[t], opt, acc);
    CBSim.hourMoney(P, A, r.census[t], r.cases[t], r.env.callout[t], opt, total);
    const mm = months.at(-1); mm.occ += mainOcc({ C: r.census[t] }); mm.n++;
  }
  return { total, months: months.map((x) => ({ m: x.m, acc: x.acc, pl: CBSim.pl(P, x.acc), occ: x.occ / x.n })), r };
}

/* ---------- staffing: 12-hour shifts (07:00, 19:00), core RNs budgeted per unit, float pool, overtime, agency */
const SHIFT_H = 12;
const FLOAT_POOL = { CBMC: 14, WCH: 4, MFE: 1, HPS: 1, ERH: 2, KBH: 2 };
const STAFF_UNITS = UNITS.map((u, i) => i).filter((i) => !UNITS[i].parent && UNITS[i].beds > 0 && !["or", "pacu"].includes(UNITS[i].kind));
const PRIORITY_KIND = { icu: 0, nicu: 0, ed: 1, pcu: 2, ld: 2, tele: 3 };
/* The staffing grid: core RNs per unit for each day-of-week x shift, set to cover the highest hourly census of a
   typical (mean-field) week in that shift slot, the way a nursing office builds its grid from history. */
let GRID = null;
function staffingGrid() {
  if (GRID) return GRID;
  const mon = new Date(Date.UTC(2026, 10, 30, 7)); // a Monday 07:00 in the same season as the live run
  const r = CBSim.run(P, mon, 168, { stochastic: false, init: CBSim.warmStart(P, mon) });
  GRID = UNITS.map(() => Array.from({ length: 14 }, () => 0)); // slot = dow*2 + (night ? 1 : 0), dow Monday = 0
  r.census.forEach((C, t) => {
    const slot = Math.floor(t / SHIFT_H) % 14;
    STAFF_UNITS.forEach((i) => { GRID[i][slot] = Math.max(GRID[i][slot], unitCensus(i, C)); });
  });
  STAFF_UNITS.forEach((i) => { GRID[i] = GRID[i].map((c) => Math.max(1, Math.ceil(c / UNITS[i].rn_ratio - 0.15))); });
  return GRID;
}
function slotOf(d) { // shift slot for a time: day shift 07-19, night 19-07 (belongs to the day it started)
  const s = shiftStart(d); return CBSim.weekday(s) * 2 + (s.getUTCHours() === 19 ? 1 : 0);
}
function scheduledRN(i, d) { return staffingGrid()[i][slotOf(d || Live.now())]; }
function unitCensus(i, C) { return C[i] + (UNITS[i].id === "ED" ? C[UIX.EDT] : 0); }
function rnNeeded(i, census) { return Math.ceil(Math.max(0, census) / UNITS[i].rn_ratio - 1e-9); }
/* staffing at one hour of history: core on shift (after call-outs), needed at ratio, gap */
function staffingAt(rec) {
  const d = CBSim.addHours(START, rec.t);
  return STAFF_UNITS.map((i) => {
    const sched = scheduledRN(i, d), out = Math.round(sched * (rec.callout || 0)), on = sched - out;
    const census = unitCensus(i, rec.C), need = rnNeeded(i, census);
    return { i, sched, out, on, census, need, gap: need - on, staffedBeds: Math.floor(on * UNITS[i].rn_ratio) };
  });
}
function shiftStart(d) { // most recent 07:00 or 19:00
  const h = d.getUTCHours(), base = CBSim.dayStart(d);
  return h >= 19 ? CBSim.addHours(base, 19) : h >= 7 ? CBSim.addHours(base, 7) : CBSim.addHours(base, -5);
}
function shiftLabel(d) { return fmt.day(d).split(",")[0] + " " + (d.getUTCHours() === 7 ? "day" : "night"); }
/* shift outlook from a forecast: for each upcoming shift, the 75th-percentile peak census -> RNs needed,
   compared with the scheduled core less expected call-outs; then fill gaps by float pool, overtime, agency */
function shiftOutlook(res, nShifts = 6, q = "p75") {
  const s0 = shiftStart(res.at), shifts = [];
  for (let k = 0; k < nShifts; k++) {
    const a = CBSim.addHours(s0, k * SHIFT_H), b = CBSim.addHours(a, SHIFT_H);
    const ta = Math.max(0, Math.round((a - res.at) / 3600e3)), tb = Math.min(res.hours, Math.round((b - res.at) / 3600e3));
    if (tb <= ta) break;
    let callout = 0; for (let t = ta; t < tb; t++) callout = Math.max(callout, res.env.callout[t]);
    const units = STAFF_UNITS.map((i) => {
      let peak = 0, med = 0;
      for (let t = ta; t < tb; t++) { peak = Math.max(peak, res.unitQ[i][q][t]); med = Math.max(med, res.unitQ[i].p50[t]); }
      const sched = scheduledRN(i, a), on = sched - Math.round(sched * callout), need = rnNeeded(i, Math.round(peak));
      return { i, sched, on, need, peak, med, gap: need - on };
    });
    shifts.push({ start: a, label: shiftLabel(a), now: k === 0, callout, units, plan: fillPlan(units) });
  }
  return shifts;
}
function fillPlan(units) {
  const pool = { ...FLOAT_POOL }, otLeft = {};
  const rows = units.filter((x) => x.gap > 0).sort((a, b) => (PRIORITY_KIND[UNITS[a.i].kind] ?? 9) - (PRIORITY_KIND[UNITS[b.i].kind] ?? 9) || b.gap - a.gap)
    .map((x) => {
      const f = UNITS[x.i].facility;
      if (otLeft[f] == null) otLeft[f] = Math.round(units.filter((y) => UNITS[y.i].facility === f).reduce((s, y) => s + y.sched, 0) * SYS.ot_pool);
      let g = x.gap; const fl = Math.min(g, pool[f] || 0); pool[f] -= fl; g -= fl;
      const ot = Math.min(g, otLeft[f]); otLeft[f] -= ot; g -= ot;
      const cost = (ot * SYS.ot_mult + g * SYS.agency_mult) * SYS.rn_hourly * SHIFT_H;
      return { ...x, float: fl, ot, agency: g, cost };
    });
  return { rows, cost: rows.reduce((s, r) => s + r.cost, 0), floatLeft: pool,
    totals: rows.reduce((t, r) => ({ float: t.float + r.float, ot: t.ot + r.ot, agency: t.agency + r.agency }), { float: 0, ot: 0, agency: 0 }) };
}
/* share of hours each unit's core staff covered its census at ratio, over the last n hours */
function ratioCompliance(n = 24) {
  const h = Live.history.slice(-n), out = {};
  STAFF_UNITS.forEach((i) => { out[i] = { ok: 0, over: 0, rnHoursShort: 0 }; });
  h.forEach((rec) => staffingAt(rec).forEach((s) => { const o = out[s.i]; if (s.gap <= 0) o.ok++; else { o.over++; o.rnHoursShort += s.gap; } }));
  Object.values(out).forEach((o) => { o.share = h.length ? o.ok / h.length : 1; });
  return out;
}
/* staffed capacity of a set of units as a share of their beds (core on shift x ratio) */
function staffedShare(idx, callout = 0, d) {
  let s = 0, b = 0;
  idx.forEach((i) => { if (!STAFF_UNITS.includes(i)) return; const sched = scheduledRN(i, d); s += Math.min(UNITS[i].beds, Math.floor((sched - Math.round(sched * callout)) * UNITS[i].rn_ratio)); b += UNITS[i].beds; });
  return b ? s / b : 0;
}
