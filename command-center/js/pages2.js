/* pages2.js — bed planning (discharge predictions, forecast scoring), recommended actions, integration feed,
   case mix and budget, the project page. Same contract as pages.js: render(view) returns refresh(). */

/* ============================================================ Bed planning */
function renderBeds(view) {
  const ref = SYS.reference.discharge, bt = SYS.reference.backtest;
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Bed planning</div><h1>Discharges and capacity, next 24 hours</h1>
      <p>Every inpatient is scored each hour with the discharge model trained in the research (logistic regression on days in vs expected stay, discharge order, vital signs, oxygen and the weekend). At 07:00 each day the app freezes the scores for the bed huddle and checks them 24 hours later, and it scores its own census forecasts the same way.</p></div>
      <div class="row">${scenarioChip()}</div></div>
    <div class="grid g5" id="bpKpis"></div>
    <div class="stack mt">
      <div class="card"><div class="card-h"><div><h2>By unit</h2><p>Expected discharges = sum of each patient's probability. Projected free beds = empty beds now + expected discharges.</p></div></div>
        <div class="table-wrap"><table id="bpUnits"></table></div></div>
      <div class="card"><div class="card-h"><div><h2>Likely to go home</h2><p>Highest probability first. Click for the patient.</p></div></div>
        <div class="table-wrap"><table id="bpList"></table></div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-h"><div><h2>Is the discharge model right?</h2><p>Scored on this session's huddles, against the research's held-out test (AUC ${ref.auc.toFixed(3)}).</p></div></div>
        <div id="bpModel"></div>${canvasBox("bpCal", "short")}</div>
      <div class="card"><div class="card-h"><div><h2>Are the census forecasts right?</h2><p>Each 07:00 forecast of main-campus census, scored when the hour arrives. Research backtest: ${Math.round(bt["24"].coverage * 100)}% / ${Math.round(bt["72"].coverage * 100)}% of actuals inside the 80% band at 24 h / 72 h.</p></div></div>
        <div id="bpFc"></div>${canvasBox("bpFcChart", "short")}</div>
    </div>`;
  $("#bpList").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-pid]"); if (tr) location.hash = "#/patient/" + tr.dataset.pid; });
  const cal = chart("bpCal", { type: "line", series: [], yMin: 0, yMax: 1, yFmt: (v) => fmt.pct(v) });
  const fcc = chart("bpFcChart", { type: "line", series: [], legend: true });
  const refresh = () => {
    const pts = Live.allPatients().filter((p) => p.stay);
    const scored = pts.map((p) => ({ p, prob: CBSim.dischargeProb(SYS, CBSim.dischargeFeatures(p, Live.t, HOUR0)) }));
    const exp = scored.reduce((s, x) => s + x.prob, 0), orders = pts.filter((p) => p.stay.order !== null && Live.t >= p.stay.order).length;
    const over = pts.filter((p) => (Live.t - p.stay.admit) / 24 > p.stay.gmlos).length;
    const E = Live.dEval, auc = E.y.length > 30 ? CBSim.aucOf(E.y, E.p) : NaN;
    const mae = E.unitAbs.length ? E.unitAbs.reduce((a, b) => a + b, 0) / E.unitAbs.length : NaN;
    const naive = E.unitNaive.length ? E.unitNaive.reduce((a, b) => a + b, 0) / E.unitNaive.length : NaN;
    $("#bpKpis").innerHTML = kpi("Expected discharges, 24 h", fmt.n(exp), `${pts.length} monitored inpatients`, "accent") +
      kpi("Discharge orders written", fmt.n(orders), "Patients with an order not yet gone") +
      kpi("Past expected stay", fmt.n(over), "Days in beyond the diagnosis group's GMLOS") +
      kpi("Live model AUC", isNaN(auc) ? "—" : auc.toFixed(3), E.snaps ? `${E.snaps} huddle${E.snaps > 1 ? "s" : ""} scored, ${fmt.n(E.y.length)} patient-days` : "First score after 24 h of play") +
      kpi("Unit-day error", isNaN(mae) ? "—" : mae.toFixed(2), isNaN(naive) ? "discharges per unit per day" : `vs ${naive.toFixed(2)} for census ÷ length of stay`);
    // by unit
    const byU = new Map();
    scored.forEach(({ p, prob }) => { const b = byU.get(p.uix) || { exp: 0, n: 0, likely: 0, orders: 0 }; b.exp += prob; b.n++; if (prob >= .5) b.likely++; if (p.stay.order !== null && Live.t >= p.stay.order) b.orders++; byU.set(p.uix, b); });
    let html = `<thead><tr><th>Unit</th><th class="r">Census</th><th class="r">Beds</th><th class="r">Empty now</th><th class="r">Expected discharges</th><th class="r">≥ 50% likely</th><th class="r">Orders</th><th class="r">Projected free</th></tr></thead><tbody>`;
    let fac = null;
    MONITORED.forEach((i) => {
      const u = UNITS[i], b = byU.get(i) || { exp: 0, n: 0, likely: 0, orders: 0 }, beds = bedsNow(i), empty = Math.max(0, beds - Live.state.C[i]);
      if (u.facility !== fac) { fac = u.facility; html += `<tr class="grp"><td colspan="8">${esc(FAC[fac].name)}</td></tr>`; }
      const free = empty + b.exp;
      html += `<tr><td>${esc(u.name)}</td><td class="r num">${fmt.n(Live.state.C[i])}</td><td class="r num">${beds}</td><td class="r num ${empty < 1 ? "txt-risk" : ""}">${fmt.n(empty)}</td>
        <td class="r num">${b.exp.toFixed(1)}</td><td class="r num">${b.likely}</td><td class="r num">${b.orders}</td><td class="r num"><b>${free.toFixed(0)}</b></td></tr>`;
    });
    $("#bpUnits").innerHTML = html + "</tbody>";
    $("#bpList").innerHTML = `<thead><tr><th>Patient</th><th>Unit</th><th>Diagnosis group</th><th class="r">Day / GMLOS</th><th class="r">P(home 24 h)</th></tr></thead><tbody>` +
      scored.sort((a, b) => b.prob - a.prob).slice(0, 16).map(({ p, prob }) => `<tr class="click" data-pid="${p.id}"><td><b>${esc(p.name)}</b> <span class="muted small">${p.age}</span>${p.stay.order !== null && Live.t >= p.stay.order ? ' <span class="chip ok">order</span>' : ""}</td>
        <td class="small">${esc(UNITS[p.uix].name)}</td><td class="small" title="${esc(p.stay.title)}">${esc(p.stay.drg)} · ${esc(p.stay.title)}</td>
        <td class="r num small">${((Live.t - p.stay.admit) / 24).toFixed(1)} / ${p.stay.gmlos}</td><td class="r"><span class="prob" style="--p:${prob}">${fmt.pct(prob)}</span></td></tr>`).join("") + "</tbody>";
    // model scoring
    if (E.y.length > 30) {
      const bins = 8, sorted = E.p.map((p, i) => [p, E.y[i]]).sort((a, b) => a[0] - b[0]), per = Math.ceil(sorted.length / bins), pr = [], ob = [];
      for (let k = 0; k < bins; k++) { const sl = sorted.slice(k * per, (k + 1) * per); if (!sl.length) continue; pr.push(sl.reduce((a, x) => a + x[0], 0) / sl.length); ob.push(sl.reduce((a, x) => a + x[1], 0) / sl.length); }
      const meanP = E.p.reduce((a, b) => a + b, 0) / E.p.length, rate = E.y.reduce((a, b) => a + b, 0) / E.y.length;
      $("#bpModel").innerHTML = `<div class="fc-stats three"><div class="stat"><span>AUC (live / research)</span><b>${auc.toFixed(3)} / ${ref.auc.toFixed(3)}</b></div>
        <div class="stat"><span>Predicted vs actual rate</span><b>${fmt.pct(meanP, 1)} / ${fmt.pct(rate, 1)}</b></div><div class="stat"><span>Unit-day error vs naive</span><b>${mae.toFixed(2)} / ${naive.toFixed(2)}</b></div></div>
        <p class="small muted">Calibration by predicted-probability bin: dots on the diagonal mean "40% likely" really goes home 40% of the time. The live score sits below the research's: here the census engine decides how many leave each hour (the most overdue go first) and vitals come from the monitoring model, rather than the research's planted stays and recovery curve.</p>`;
      cal.update({ n: pr.length, series: [{ name: "Perfect", y: pr, color: "var(--muted-fg)", dash: true, width: 1 }, { name: "Observed", y: ob, color: "var(--c1)", dots: true }],
        xLabel: (i) => fmt.pct(pr[i]), yMin: 0, yMax: 1 });
    } else {
      $("#bpModel").innerHTML = `<div class="empty small">Scores appear 24 hours after the first 07:00 huddle. Press play (24× is quickest).</div>`;
    }
    const S = Live.fcScores.filter((x) => x.h === 24).slice(-30), all = Live.fcScores;
    if (S.length) {
      const cov = (h) => { const a = all.filter((x) => x.h === h); return a.length ? a.filter((x) => x.actual >= x.p10 && x.actual <= x.p90).length / a.length : NaN; };
      const err = (h, k) => { const a = all.filter((x) => x.h === h); return a.length ? a.reduce((s, x) => s + Math.abs(x[k] - x.actual), 0) / a.length : NaN; };
      $("#bpFc").innerHTML = `<div class="fc-stats three"><div class="stat"><span>80% band coverage, 24 h / 72 h</span><b>${fmt.pct(cov(24))} / ${isNaN(cov(72)) ? "—" : fmt.pct(cov(72))}</b></div>
        <div class="stat"><span>Median error, 24 h</span><b>${err(24, "p50").toFixed(1)} pts</b></div><div class="stat"><span>Persistence error, 24 h</span><b>${err(24, "now").toFixed(1)} pts</b></div></div>
        <p class="small muted">${all.length} forecast-hours scored. Coverage near 80% means the bands are honest; beating persistence means the forecast knows more than "tomorrow looks like today".</p>`;
      fcc.update({ n: S.length, xLabel: (i, long) => fmt.day(CBSim.addHours(START, S[i].t0 + 23)), bands: [{ lo: S.map((x) => x.p10), hi: S.map((x) => x.p90), color: "var(--c1)", name: "80% band" }],
        series: [{ name: "Forecast median", y: S.map((x) => x.p50), color: "var(--c1)", dots: true, width: 0 }, { name: "Actual", y: S.map((x) => x.actual), color: "var(--risk)", dots: true, width: 1 }], yMin: undefined });
    } else {
      $("#bpFc").innerHTML = `<div class="empty small">Forecasts are made at 07:00 and scored 24, 48 and 72 hours later. Press play.</div>`;
    }
  };
  refresh();
  return refresh;
}

/* ============================================================ Recommended actions */
let ACT = { res: null, t: -1, running: false };
function renderActions(view) {
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Recommended actions</div><h1>What should we do about the next 72 hours?</h1>
      <p>Each lever is simulated forward from this exact hour (60 Monte Carlo paths, 72 hours, with the active scenario) and compared with doing nothing. Ranked by how much ED boarding, diversion and declined transfers it removes. Apply one to put it into the live simulation for 48 hours.</p></div>
      <div class="row">${scenarioChip()}<button class="btn primary" id="acRun">Re-evaluate</button></div></div>
    <div id="acActive"></div>
    <div class="card"><div class="card-h"><div><h2>Pressure if we do nothing</h2><p id="acSub">Simulating…</p></div><span class="progress-inline" id="acProg"></span></div><div class="fc-stats five" id="acBase"></div></div>
    <div class="stack mt" id="acList"></div>`;
  const run = () => {
    if (ACT.running) return; ACT.running = true; $("#acRun").disabled = true;
    const jobs = [{ id: "none", label: "Do nothing", mods: [] }].concat(LEVERS.map((l) => ({ ...l, mods: l.mods.map((m) => ({ ...m, start: Live.t, end: Live.t + l.hours })) })));
    const out = {}; let k = 0;
    const next = () => {
      if (k >= jobs.length) { ACT = { res: out, t: Live.t, running: false }; const b = $("#acRun"); if (b) b.disabled = false; const p = $("#acProg"); if (p) p.textContent = ""; draw(); return; }
      const j = jobs[k++]; const p = $("#acProg"); if (p) p.textContent = `Simulating ${k}/${jobs.length}: ${j.label}…`;
      forecast({ hours: 72, paths: 60, mods: j.mods, onDone: (r) => { out[j.id] = r; next(); } });
    };
    next();
  };
  $("#acRun").addEventListener("click", run);
  $("#acList").addEventListener("click", (e) => { const b = e.target.closest("button[data-apply]"); if (b) { Live.applyLever(LEVERS.find((l) => l.id === b.dataset.apply)); ACT.t = -99; route(); } });
  const pressure = (r) => r.divMean + r.edBoardPeak + r.lost;
  const draw = () => {
    const R = ACT.res; if (!R || !$("#acBase")) return;
    const b = R.none, beds = facBeds("CBMC");
    $("#acSub").textContent = `${b.paths} paths from ${fmt.time(b.at)} · ${Live.scenarioName}${ACT.t !== Live.t ? ` · ${Live.t - ACT.t} h old` : ""}`;
    $("#acBase").innerHTML = `<div class="stat"><span>Main-campus peak (median)</span><b>${fmt.pct(b.q.main.peakP50 / beds)}</b></div><div class="stat"><span>Main ED boarders, peak</span><b>${fmt.n(b.edBoardPeak)}</b></div>
      <div class="stat"><span>Main ED diversion</span><b>${fmt.n(b.divMean, 1)} h</b></div><div class="stat"><span>Transfers declined</span><b>${fmt.n(b.lost, 1)}</b></div><div class="stat"><span>Operating income, 72 h</span><b>${fmt.big(b.operating)}</b></div>`;
    const rows = LEVERS.map((l) => ({ l, r: R[l.id], gain: pressure(b) - pressure(R[l.id]), dOp: R[l.id].operating - b.operating })).sort((x, y) => y.gain - x.gain);
    const active = new Set(Live.activeLevers().map((m) => m.id.split("@")[0]));
    $("#acList").innerHTML = rows.map(({ l, r, gain, dOp }, i) => {
      const d = (a, c, f, worseUp = true) => { const v = c - a; const cls = Math.abs(v) < 1e-9 ? "" : (worseUp ? v > 0 : v < 0) ? "txt-risk" : "txt-ok"; return `<span class="${cls}">${v > 0 ? "+" : v < 0 ? "−" : "±"}${f(Math.abs(v))}</span>`; };
      return `<div class="card action ${i === 0 && gain > 0.5 ? "top" : ""}"><div class="act-rank">${i + 1}</div>
        <div class="act-body"><div class="row"><h3>${esc(l.label)}</h3>${i === 0 && gain > 0.5 ? chip("Recommended", "ok") : ""}${gain <= 0.5 ? chip("Little effect now", "") : ""}${active.has(l.id) ? chip("Active", "warn") : ""}</div>
          <p class="small muted">${esc(l.blurb)} <i>Trade-off: ${esc(l.cost)}.</i></p>
          <div class="act-metrics">
            <div><span>Boarders, peak</span><b>${fmt.n(r.edBoardPeak)}</b> ${d(b.edBoardPeak, r.edBoardPeak, (x) => fmt.n(x))}</div>
            <div><span>ED diversion</span><b>${fmt.n(r.divMean, 1)} h</b> ${d(b.divMean, r.divMean, (x) => fmt.n(x, 1))}</div>
            <div><span>Transfers declined</span><b>${fmt.n(r.lost, 1)}</b> ${d(b.lost, r.lost, (x) => fmt.n(x, 1))}</div>
            <div><span>Main-campus peak</span><b>${fmt.pct(r.q.main.peakP50 / beds)}</b> ${d(b.q.main.peakP50 / beds, r.q.main.peakP50 / beds, (x) => (x * 100).toFixed(1) + " pts")}</div>
            <div><span>Operating income, 72 h</span><b>${fmt.big(r.operating)}</b> ${d(b.operating, r.operating, fmt.big, false)}</div>
          </div></div>
        <div><button class="btn primary" data-apply="${l.id}" ${active.has(l.id) ? "disabled" : ""}>Apply for ${l.hours} h</button></div></div>`;
    }).join("");
  };
  const refresh = () => {
    const act = Live.activeLevers();
    $("#acActive").innerHTML = act.length ? `<div class="callout mb">Active levers: ${act.map((m) => `<b>${esc(m.label)}</b> (${m.end - Live.t} h left)`).join(" · ")}</div>` : "";
    if (ACT.res) { const s = $("#acSub"); if (s && ACT.t !== Live.t) draw(); }
  };
  refresh();
  if (!ACT.res || Live.t - ACT.t > 6) run(); else draw();
  return refresh;
}

/* ============================================================ Integration feed (HL7 v2 and FHIR R4) */
let FEED = { fmt: store.get("feedfmt", "hl7"), types: "all", sel: null };
const ADT_LABEL = { A01: "Admit", A02: "Transfer", A03: "Discharge", ORU: "Vital signs (alert)" };
function hl7Time(h) { const d = CBSim.addHours(START, h); return d.toISOString().replace(/[-:T]/g, "").slice(0, 12); }
function hl7(m) {
  const ts = hl7Time(m.t), fac = (u) => (u ? UNITS[UIX[u]].facility : ""), nm = m.name.replace(".", "").split(" ");
  const msh = `MSH|^~\\&|CB_SIM|${fac(m.to || m.from) || "CBH"}|COMMAND_CENTER|CBH|${ts}||${m.type === "ORU" ? "ORU^R01" : "ADT^" + m.type}|MSG${String(m.seq).padStart(7, "0")}|P|2.5.1`;
  const pid = `PID|1||${m.mrn}^^^CBH^MR||${nm[1] || "X"}^${nm[0]}||${(2026 - m.age)}0101|U`;
  if (m.type === "ORU") {
    const r = m.extra, obx = [["8867-4", "Heart rate", r.hr, "/min"], ["8480-6", "Systolic blood pressure", r.sbp, "mm[Hg]"], ["9279-1", "Respiratory rate", r.rr, "/min"],
      ["59408-5", "Oxygen saturation by pulse oximetry", r.spo2, "%"], ["8310-5", "Body temperature", r.temp, "Cel"]]
      .map(([c, n, v, u], i) => `OBX|${i + 1}|NM|${c}^${n}^LN||${v}|${u}|||||F|||${ts}`);
    obx.push(`OBX|6|NM|NEWS2^National Early Warning Score 2^L||${r.news2}|{score}|0-4|${r.news2 >= 7 ? "HH" : "H"}|||F|||${ts}`);
    return [msh, pid, `PV1|1|I|${m.from}^^${m.bed}^${fac(m.from)}`, `OBR|1|||VITALS^Vital signs panel^L|||${ts}`].concat(obx).join("\n");
  }
  const loc = m.type === "A03" ? m.from : m.to || "OR";
  const f = []; // PV1 by field number: 2 class, 3 location, 6 prior location, 36 discharge disposition, 44 admit / 45 discharge time
  f[1] = "1"; f[2] = "I"; f[3] = `${loc || ""}^^${m.bed || ""}^${fac(loc) || ""}`;
  if (m.type === "A02" && m.from) f[6] = `${m.from}^^^${fac(m.from)}`;
  if (m.type === "A03") { f[36] = "01"; f[45] = ts; } else if (m.type === "A01") f[44] = ts;
  const pv1 = "PV1|" + Array.from({ length: f.length - 1 }, (_, i) => f[i + 1] || "").join("|");
  const evn = `EVN|${m.type}|${ts}`, dg1 = m.drg ? `\nDRG|${m.drg}^MS-DRG^MSDRG` : "";
  return [msh, evn, pid, pv1].join("\n") + dg1;
}
function fhir(m) {
  const when = CBSim.addHours(START, m.t).toISOString(), ref = { reference: `Patient/${m.mrn}`, display: m.name };
  if (m.type === "ORU") {
    const r = m.extra, obs = (code, disp, v, unit, ucum) => ({ resource: { resourceType: "Observation", status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }] }],
      code: { coding: [{ system: "http://loinc.org", code, display: disp }] }, subject: ref, effectiveDateTime: when,
      valueQuantity: { value: v, unit, system: "http://unitsofmeasure.org", code: ucum } } });
    return { resourceType: "Bundle", type: "collection", timestamp: when, entry: [
      obs("8867-4", "Heart rate", r.hr, "beats/min", "/min"), obs("8480-6", "Systolic blood pressure", r.sbp, "mmHg", "mm[Hg]"),
      obs("9279-1", "Respiratory rate", r.rr, "breaths/min", "/min"), obs("59408-5", "Oxygen saturation by pulse oximetry", r.spo2, "%", "%"),
      obs("8310-5", "Body temperature", r.temp, "Cel", "Cel"),
      { resource: { resourceType: "RiskAssessment", status: "final", subject: ref, occurrenceDateTime: when, method: { text: "NEWS2 (RCP 2017)" },
        prediction: [{ outcome: { text: "Clinical deterioration" }, qualitativeRisk: { text: r.news2 >= 7 ? "high" : r.news2 >= 5 ? "medium" : "low-medium" } }],
        note: [{ text: `NEWS2 ${r.news2}${r.red ? " (single parameter scored 3)" : ""}; qSOFA ${r.qsofa}` }] } }] };
  }
  const loc = m.type === "A03" ? m.from : m.to;
  return { resourceType: "Encounter", id: `enc-${m.pid}`, status: m.type === "A03" ? "finished" : "in-progress",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IMP", display: "inpatient encounter" },
    subject: ref, period: m.type === "A03" ? { end: when } : { start: when },
    location: [loc ? { location: { display: `${UNITS[UIX[loc]].name}, bed ${m.bed || "—"}` }, status: m.type === "A03" ? "completed" : "active" } : { location: { display: "Perioperative / other" }, status: "active" }]
      .concat(m.type === "A02" && m.from ? [{ location: { display: UNITS[UIX[m.from]].name }, status: "completed" }] : []),
    hospitalization: m.type === "A03" ? { dischargeDisposition: { text: "Home or post-acute" } } : undefined,
    meta: { tag: [{ system: "urn:cb-sim:event", code: `ADT-${m.type}`, display: ADT_LABEL[m.type] }] },
    extension: m.drg ? [{ url: "urn:cb-sim:ms-drg", valueString: m.drg }] : undefined };
}
function renderFeed(view) {
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Integration</div><h1>HL7 and FHIR feed</h1>
      <p>Every admission, transfer and discharge in the simulation emits an HL7 v2.5.1 ADT message (A01, A02, A03), and every early-warning alert an ORU^R01 vital-signs result with LOINC codes, the way a command center listens to the EHR. Switch to FHIR R4 to see the same events as Encounter and Observation resources. All identifiers are synthetic.</p></div>
      <div class="row">${seg("fdFmt", [["hl7", "HL7 v2"], ["fhir", "FHIR R4"]], FEED.fmt)}<button class="btn" id="fdDl">Download NDJSON</button></div></div>
    <div class="grid g4" id="fdKpis"></div>
    <div class="grid g-1-2 mt">
      <div class="card"><div class="card-h"><div><h3>Messages</h3></div>${seg("fdType", [["all", "All"], ["A01", "A01"], ["A02", "A02"], ["A03", "A03"], ["ORU", "ORU"]], FEED.types)}</div><div class="msg-list" id="fdList"></div></div>
      <div class="card"><div class="card-h"><div><h3 id="fdTitle">Message</h3><p id="fdMeta"></p></div><button class="btn small" id="fdCopy">Copy</button></div><pre class="code" id="fdBody"></pre></div>
    </div>`;
  onSeg("fdFmt", (v) => { FEED.fmt = v; store.set("feedfmt", v); refresh(); });
  onSeg("fdType", (v) => { FEED.types = v; refresh(); });
  $("#fdList").addEventListener("click", (e) => { const r = e.target.closest("[data-seq]"); if (r) { FEED.sel = Number(r.dataset.seq); refresh(); } });
  $("#fdCopy").addEventListener("click", () => { try { navigator.clipboard.writeText($("#fdBody").textContent); toast("Copied"); } catch (e) {} });
  $("#fdDl").addEventListener("click", () => {
    const lines = Live.messages.slice().reverse().map((m) => JSON.stringify(FEED.fmt === "fhir" ? fhir(m) : { hl7: hl7(m) }));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "application/x-ndjson" }));
    a.download = `calloway-bay-${FEED.fmt}-${Live.t}.ndjson`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const refresh = () => {
    const M = Live.messages, last24 = M.filter((m) => m.t > Live.t - 24);
    const cnt = (t) => last24.filter((m) => m.type === t).length;
    $("#fdKpis").innerHTML = kpi("Admissions (A01), 24 h", fmt.n(cnt("A01"))) + kpi("Transfers (A02), 24 h", fmt.n(cnt("A02"))) + kpi("Discharges (A03), 24 h", fmt.n(cnt("A03"))) + kpi("Vital-sign alerts (ORU), 24 h", fmt.n(cnt("ORU")));
    const list = M.filter((m) => FEED.types === "all" || m.type === FEED.types).slice(0, 80);
    if (FEED.sel == null || !M.find((m) => m.seq === FEED.sel)) FEED.sel = list[0] ? list[0].seq : null;
    $("#fdList").innerHTML = list.map((m) => `<div class="msg-row ${m.seq === FEED.sel ? "on" : ""}" data-seq="${m.seq}"><span class="msg-type t-${m.type}">${m.type}</span>
      <div><b>${esc(m.name)}</b> <span class="small muted">${esc(m.mrn)}</span><div class="small muted">${m.type === "A02" ? `${esc(m.from || "?")} → ${esc(m.to || "OR / other")}` : esc(m.to || m.from || "")}${m.type === "ORU" ? ` · NEWS2 ${m.extra.news2}` : ""}</div></div>
      <span class="small muted num">${fmt.clock(CBSim.addHours(START, m.t))}</span></div>`).join("") || '<div class="empty small">No messages yet. Press play.</div>';
    const m = M.find((x) => x.seq === FEED.sel);
    if (m) {
      $("#fdTitle").textContent = `${FEED.fmt === "hl7" ? (m.type === "ORU" ? "ORU^R01" : "ADT^" + m.type) : (m.type === "ORU" ? "Bundle (Observation × 5, RiskAssessment)" : "Encounter")} · ${ADT_LABEL[m.type]}`;
      $("#fdMeta").textContent = `${m.name} · ${fmt.time(CBSim.addHours(START, m.t))}`;
      $("#fdBody").textContent = FEED.fmt === "hl7" ? hl7(m).replace(/\n/g, "\r\n") : JSON.stringify(fhir(m), null, 2);
    }
  };
  refresh();
  return refresh;
}
function toast(msg) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.innerHTML = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ============================================================ Case mix and budget (added to Finance > Live) */
function caseMixHtml(days) {
  const since = Live.t - days * 24, D = Live.discharges.filter((d) => d.t > since);
  if (!D.length) return '<div class="empty small">No discharges yet in this period.</div>';
  const cmi = D.reduce((s, d) => s + d.weight, 0) / D.length, losIdx = D.reduce((s, d) => s + d.los, 0) / D.reduce((s, d) => s + d.gmlos, 0);
  const excess = D.reduce((s, d) => s + Math.max(0, d.los - d.gmlos), 0), pay = D.reduce((s, d) => s + d.weight, 0) * SYS.drg_base_rate;
  const byU = new Map(); D.forEach((d) => { const b = byU.get(d.u) || { n: 0, w: 0, los: 0, g: 0 }; b.n++; b.w += d.weight; b.los += d.los; b.g += d.gmlos; byU.set(d.u, b); });
  const byDrg = new Map(); D.forEach((d) => { const b = byDrg.get(d.drg) || { n: 0, w: d.weight }; b.n++; byDrg.set(d.drg, b); });
  const titles = {}; Object.values(SYS.drgs).forEach((l) => l.forEach((r) => { titles[r.code] = r.title; }));
  return `<div class="fc-stats four"><div class="stat"><span>Discharges</span><b>${fmt.n(D.length)}</b></div><div class="stat"><span>Case-mix index</span><b>${cmi.toFixed(2)}</b></div>
      <div class="stat"><span>LOS index (actual ÷ GMLOS)</span><b>${losIdx.toFixed(2)}</b></div><div class="stat"><span>DRG payment estimate</span><b>${fmt.big(pay)}</b></div></div>
    <p class="small muted">${fmt.n(excess, 0)} excess days beyond each group's expected stay. Payment = Σ weight × $${fmt.n(SYS.drg_base_rate)} illustrative base rate; weights and GMLOS are approximate, for illustration.</p>
    <div class="grid g2 cm-grid"><div class="table-wrap"><table><thead><tr><th>Unit</th><th class="r">Disch.</th><th class="r">CMI</th><th class="r">LOS index</th></tr></thead><tbody>
      ${[...byU.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([u, b]) => `<tr><td>${esc(UNITS[u].name)}</td><td class="r num">${b.n}</td><td class="r num">${(b.w / b.n).toFixed(2)}</td><td class="r num ${b.los / b.g > 1.15 ? "txt-risk" : ""}">${(b.los / b.g).toFixed(2)}</td></tr>`).join("")}</tbody></table></div>
    <div class="table-wrap"><table><thead><tr><th>MS-DRG</th><th class="r">Disch.</th><th class="r">Weight</th></tr></thead><tbody>
      ${[...byDrg.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([c, b]) => `<tr><td class="small"><b>${c}</b> ${esc(titles[c].length > 38 ? titles[c].slice(0, 38) + "…" : titles[c])}</td><td class="r num">${b.n}</td><td class="r num">${b.w.toFixed(2)}</td></tr>`).join("")}</tbody></table></div></div>`;
}
/* flexible budget: the annual plan's December run-rate, flexed to actual patient-days for variable costs */
function budgetHtml(acc, days) {
  const plan = annualFinance(), dec = plan.months.find((m) => m.m === 11), dDays = 31;
  const b = dec.pl, bAcc = dec.acc, pdB = bAcc.pdays.reduce((a, x) => a + x, 0) / dDays * days;
  const actual = CBSim.pl(P, acc), pdA = acc.pdays.reduce((a, x) => a + x, 0), flexF = pdB ? pdA / pdB : 1;
  const line = (lab, budget, flexed, act, revenue) => {
    const v = act - flexed, fav = revenue ? v >= 0 : v <= 0;
    return `<tr><td>${lab}</td><td class="r num">${fmt.big(budget)}</td><td class="r num">${fmt.big(flexed)}</td><td class="r num">${fmt.big(act)}</td><td class="r num ${Math.abs(v) < 1 ? "" : fav ? "txt-ok" : "txt-risk"}">${fmt.signedBig(v)} ${Math.abs(v) < 1 ? "" : fav ? "F" : "U"}</td></tr>`;
  };
  const per = (k) => b[k] / dDays * days;
  return `<table><thead><tr><th>Line</th><th class="r">Static budget</th><th class="r">Flexed to volume</th><th class="r">Actual</th><th class="r">Variance</th></tr></thead><tbody>
    <tr><td>Patient-days</td><td class="r num">${fmt.n(pdB)}</td><td class="r num">${fmt.n(pdA)}</td><td class="r num">${fmt.n(pdA)}</td><td class="r num">${pdA - pdB >= 0 ? "+" : ""}${fmt.n(pdA - pdB)} vs static</td></tr>
    ${line("Net patient revenue", per("net"), per("net") * flexF, actual.net, true)}
    ${line("Nursing: core", per("core"), per("core"), actual.core)}
    ${line("Nursing: overtime + agency", per("ot") + per("agency"), (per("ot") + per("agency")) * flexF, actual.ot + actual.agency)}
    ${line("Supplies, drugs & food", per("supplies"), per("supplies") * flexF, actual.supplies)}
    ${line("Fixed costs", per("fixed"), per("fixed"), actual.fixed)}
    ${line("Operating income", per("operating"), per("revenue") * flexF - per("core") - (per("ot") + per("agency") + per("supplies")) * flexF - per("fixed"), actual.operating, true)}
  </tbody></table><p class="small muted">Budget: the annual plan's December run-rate for ${days} day${days > 1 ? "s" : ""}. Revenue, overtime/agency and supplies flex with patient-days; core nursing and fixed costs don't. F = favorable, U = unfavorable.</p>`;
}

/* ============================================================ About this project */
function renderAbout(view) {
  const checks = SYS.reference.checks;
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">About this project</div><h1>How it's built, and how it's checked</h1>
      <p>A hospital command center on a fictional health system, built to show the whole path from a simulation model to a working operations tool: modelling, forecasting, machine learning, healthcare data standards, operational finance and the engineering to verify and ship it.</p></div>
      <div class="row"><button class="btn primary" id="abTour">Take the 2-minute tour</button></div></div>
    <div class="card"><h2>Architecture</h2>
      <svg class="arch" viewBox="0 0 1000 300" role="img" aria-label="Architecture diagram">
        ${archBox(10, 30, 260, 110, "tara · census_sim (Python)", ["system.py: one definition", "engine · environment · monitoring", "discharge model · finance", "analysis.py + 10 truth checks"])}
        ${archBox(10, 170, 260, 100, "research.stellargrove.com", ["Results page, figures, tables", "Hospital Operations section"])}
        ${archBox(310, 30, 260, 110, "build_data.py + check.js", ["system.json + reference numbers", "JS engine must match Python", "(annual P&L to ~1e-14)"])}
        ${archBox(620, 30, 360, 240, "Command Center (this app, static)", ["sim.js: engine port, discharge model", "worker.js: Monte Carlo off the main thread", "live.js: clock, patients, alerts, ADT/ORU", "pages: census, staffing, beds, watch,", "actions, environment, finance, feed", "core.js: theme-aware canvas charts", "No framework, no CDN, works offline"])}
        ${archBox(310, 170, 260, 100, "publish.sh → GitHub Actions", ["PR + squash-merge per repo", "Pages deploy to public repos"])}
        <path d="M270 85 H306" class="arch-arrow" marker-end="url(#ah)"/><path d="M570 85 H616" class="arch-arrow" marker-end="url(#ah)"/>
        <path d="M140 140 V166" class="arch-arrow" marker-end="url(#ah)"/><path d="M440 140 V166" class="arch-arrow" marker-end="url(#ah)"/><path d="M570 220 H616" class="arch-arrow" marker-end="url(#ah)"/>
        <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--muted-fg)"/></marker></defs>
      </svg></div>
    <div class="grid g2 mt">
      <div class="card"><h2>What it demonstrates</h2><ul class="checks">
        <li><div><b>Stochastic simulation:</b> 34 units, six sites, boarding, overflow, diversion; Monte Carlo and mean-field.</div></li>
        <li><div><b>Forecasting with honest uncertainty:</b> backtested 80% bands, live self-scoring against persistence.</div></li>
        <li><div><b>Applied ML:</b> a discharge-prediction model with held-out AUC, calibration and unit-level error, scored again live.</div></li>
        <li><div><b>Clinical decision support:</b> NEWS2 and qSOFA from the published tables; alarm-burden trade-offs measured.</div></li>
        <li><div><b>Operations research:</b> staffing grids, float-pool / overtime / agency fill plans, and levers simulated before you pull them.</div></li>
        <li><div><b>Healthcare finance:</b> unit contribution, payer-mix collections, MS-DRG case mix, flexible budget variance, annual P&amp;L.</div></li>
        <li><div><b>Interoperability:</b> HL7 v2 ADT/ORU and FHIR R4 Encounter / Observation output with LOINC codes.</div></li>
        <li><div><b>Engineering:</b> one model definition shared by Python and JS, cross-checked in CI; Web Worker; shareable state in the URL; light/dark.</div></li>
      </ul></div>
      <div class="card"><h2>Verification</h2><ul class="checks">${checks.map((c) => `<li class="${c.pass ? "" : "bad"}"><div><b>${esc(c.check)}</b> <span class="small muted">${esc(c.result)}</span></div></li>`).join("")}
        <li id="abJs"><div>Checking the JavaScript engine against Python…</div></li></ul>
        <p class="small muted">Research and method: <a href="https://research.stellargrove.com/hospital/command_center/" target="_blank" rel="noopener">research.stellargrove.com/hospital/command_center/</a>. Everything is simulated; Calloway Bay Health is fictional.</p></div>
    </div>`;
  $("#abTour").addEventListener("click", () => Tour.start());
  setTimeout(() => { const r = crossCheck(), li = $("#abJs"); if (li) li.innerHTML = `<div><b>JavaScript engine matches Python in this browser</b> <span class="small muted">largest unit difference ${r.maxDiff.toExponential(1)} patients</span></div>`; }, 30);
  return () => {};
}
function archBox(x, y, w, h, title, lines) {
  return `<g class="arch-box"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text x="${x + 14}" y="${y + 24}" class="arch-t">${esc(title)}</text>
    ${lines.map((l, i) => `<text x="${x + 14}" y="${y + 46 + i * 19}" class="arch-l">${esc(l)}</text>`).join("")}</g>`;
}
