/* Front Office Workbench: Contract value. Projects a hitter's wOBA with tara's aging curve, converts it to WAR
   (aging_curves research: (wOBA − league) ÷ 1.2 × PA + 20 replacement runs per 600 PA, ÷ 10 runs per win, plus
   optional position and defense runs) and values it against a contract offer. Uses window.FOAPP from app.js. */
"use strict";
window.Contract = (function () {
  const A = window.FO_AGING, D = window.FO, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const HIT = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
  // Standard positional adjustments, runs per full season (600 PA here). An assumption, not from tara's research.
  const POSADJ = { none: 0, C: 12.5, SS: 7.5, "2B": 2.5, "3B": 2.5, CF: 2.5, LF: -7.5, RF: -7.5, "1B": -12.5, DH: -17.5 };
  const SIGN = D.seasons[D.seasons.length - 1] + 1;
  const DEF = { cid: 0, base: "blend", age: 30, woba: 0.36, pa: 600, pos: "none", def: 0, yrs: 5, aav: 25, dpw: 9, g: 0, r: 0, curve: "corrected" };
  let s = Object.assign({}, DEF), plots = {}, view = "value", drawn = false;

  const F = {
    $m: (v) => (v < 0 ? "−$" : "$") + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 1) + "M",
    w: (v) => v.toFixed(3).replace(/^0/, ""),
    war: (v) => v.toFixed(1),
  };
  const app = () => window.FOAPP;

  // ---------- model
  function deltaAt(age, key) {
    const c = A.curves[key], i = c.ages.indexOf(age);
    if (i >= 0) return c.delta[i];
    return age < c.ages[0] ? c.delta[0] : c.delta[c.delta.length - 1];
  }
  function hist(id) {
    return D.seasons.map((y) => app().byKey.get(id + "-" + y)).filter((r) => r && HIT.includes(r.group) && r.v.woba != null);
  }
  function baseline(id, how) {
    const h = hist(id); if (!h.length) return null;
    const lastRow = h[h.length - 1];
    if (how === "last") return { woba: lastRow.v.woba, from: lastRow.season, note: `${lastRow.season} wOBA` };
    if (how === "xlast") return lastRow.v.xwoba != null ? { woba: lastRow.v.xwoba, from: lastRow.season, note: `${lastRow.season} expected wOBA` } : null;
    // Marcel-style: last three seasons weighted 5/4/3 by PA, regressed toward league average (240 weighted PA ≈ Marcel's 1,200)
    const yrs = h.filter((r) => r.season > lastRow.season - 3), wts = { 0: 1, 1: 0.8, 2: 0.6 };
    let num = 0, den = 0;
    yrs.forEach((r) => { const w = wts[lastRow.season - r.season] * r.pa; num += w * r.v.woba; den += w; });
    const R = 240;
    return { woba: (num + R * A.lg) / (den + R), from: lastRow.season,
      note: `${yrs.map((r) => r.season).join(", ")} wOBA, weighted 5/4/3 and regressed to league average` };
  }
  function defaultsFor(id) {
    const h = hist(id); if (!h.length) return {};
    const lastRow = h[h.length - 1], o = { cid: id, pos: lastRow.group, pa: 600 };
    const ageNow = app().age(id, lastRow.season);
    if (ageNow != null) o.age = ageNow + (SIGN - lastRow.season);
    o.def = lastRow.group === "C" ? Math.round(lastRow.v.framing || 0) : lastRow.group === "DH" ? 0 : Math.round(0.8 * (lastRow.v.oaa || 0));
    return o;
  }
  function project() {
    let w = s.woba, rows = [], pv = 0, pc = 0, disc = 0;
    const posRuns = (POSADJ[s.pos] || 0) * s.pa / 600;
    for (let y = 1; y <= s.yrs; y++) {
      const age = s.age + y - 1;
      if (y > 1) w += deltaAt(age - 1, s.curve);
      const bat = (w - A.lg) / A.wobaScale * s.pa, repl = A.replRuns * s.pa / 600;
      const war = (bat + repl + posRuns + s.def) / A.runsPerWin;
      const price = s.dpw * Math.pow(1 + s.g / 100, y - 1), value = war * price, d = 1 / Math.pow(1 + s.r / 100, y - 1);
      rows.push({ y, season: SIGN + y - 1, age, woba: w, bat, repl, posRuns, def: s.def, war, price, value, salary: s.aav, surplus: value - s.aav, d });
      pv += value * d; pc += s.aav * d; disc += d;
    }
    const war = rows.reduce((a, r) => a + r.war, 0);
    return { rows, war, pv, pc, surplus: pv - pc, breakeven: pv / disc };
  }

  // ---------- state <-> hash
  const NUM = ["cid", "age", "woba", "pa", "def", "yrs", "aav", "dpw", "g", "r"];
  function fromParams(u) {
    s = Object.assign({}, DEF);
    NUM.forEach((k) => { if (u.has(k) && isFinite(+u.get(k))) s[k] = +u.get(k); });
    ["base", "pos", "curve"].forEach((k) => { if (u.get(k)) s[k] = u.get(k); });
    if (!POSADJ.hasOwnProperty(s.pos)) s.pos = "none";
    if (!A.curves[s.curve]) s.curve = "corrected";
    if (s.cid && !hist(s.cid).length) s.cid = 0;
    if (s.cid && !u.has("age")) Object.assign(s, defaultsFor(s.cid));
    if (s.cid && !u.has("woba") && s.base !== "custom") applyBase();
    else if (s.cid && s.base !== "custom") { const b = baseline(s.cid, s.base); if (b) s.baseNote = b.note; }
  }
  function applyBase() {
    const b = baseline(s.cid, s.base);
    if (!b) return;
    // age the baseline from its season to the signing season with the curve
    const ageThen = app().age(s.cid, b.from);
    let w = b.woba;
    if (ageThen != null) for (let a = ageThen; a < s.age; a++) w += deltaAt(a, s.curve);
    s.woba = Math.round(w * 1000) / 1000;
    s.baseNote = b.note;
  }
  function writeHash() {
    const u = new URLSearchParams({ tab: "contract" });
    Object.keys(DEF).forEach((k) => { if (s[k] !== DEF[k]) u.set(k, s[k]); });
    history.replaceState(null, "", "#/?" + u.toString());
  }

  function winLink(first) {
    const add = Math.max(0, Math.round(first.war * 2) / 2), h = s.cid ? hist(s.cid) : [], team = h.length ? h[h.length - 1].team : "";
    const club = { OAK: "ATH", ARI: "AZ", CHW: "CWS", WSN: "WSH", TBR: "TB", SDP: "SD", SFG: "SF", KCR: "KC" }[team] || team;
    return "add=" + add + "&dpw=" + s.dpw + (club && window.FO_WINS.clubs.some((c) => c.abbr === club) ? "&club=" + club : "");
  }

  // ---------- UI
  const sliders = [
    ["age", "Age at signing", 20, 40, 1, (v) => v],
    ["woba", "Projected wOBA at signing", 0.25, 0.45, 0.001, F.w],
    ["pa", "Plate appearances per season", 300, 700, 10, (v) => v],
    ["def", "Defense, runs per season", -20, 20, 1, (v) => (v > 0 ? "+" : "") + v],
    ["yrs", "Contract years", 1, 10, 1, (v) => v],
    ["aav", "Salary per year", 1, 60, 0.5, (v) => "$" + v + "M"],
    ["dpw", "Market price of a win", 5, 15, 0.5, (v) => "$" + v + "M"],
    ["g", "Price-of-a-win growth per year", 0, 8, 0.5, (v) => v + "%"],
    ["r", "Discount rate", 0, 10, 0.5, (v) => v + "%"],
  ];
  function slider(k) {
    const [id, label, min, max, step, f] = sliders.find((x) => x[0] === k);
    return `<label class="param"><span class="pl">${label}</span><output id="co-${id}">${f(s[id])}</output>` +
      `<input type="range" data-c="${id}" min="${min}" max="${max}" step="${step}" value="${s[id]}" style="--fill:${100 * (s[id] - min) / (max - min)}%"></label>`;
  }
  function hitterOptions() {
    const seen = new Map();
    D.rows.forEach((r) => { if (HIT.includes(r.group) && (!seen.has(r.id) || seen.get(r.id).season < r.season)) seen.set(r.id, r); });
    return [...seen.values()].sort((a, b) => app().name(a.id).localeCompare(app().name(b.id)))
      .map((r) => `<option value="${esc(app().name(r.id))} (${r.group}, ${r.season})" data-id="${r.id}"></option>`).join("");
  }

  function render(u) {
    fromParams(u);
    const root = $("#contractView");
    root.innerHTML = `
      <aside class="picker cpanel">
        <div class="lbl">Player</div>
        <input id="cPlayer" list="cHitters" placeholder="Search a hitter, or leave blank" value="${s.cid ? esc(app().name(s.cid)) : ""}" autocomplete="off" />
        <datalist id="cHitters">${hitterOptions()}</datalist>
        <div class="cbtns">${s.cid ? `<button type="button" class="link" id="cCustom">Use a custom player</button>` : `<span class="hint2">Custom player: set age and wOBA below.</span>`}</div>
        ${s.cid ? `<label class="sel"><span class="lbl">Starting point</span><select id="cBase">
          <option value="blend" ${s.base === "blend" ? "selected" : ""}>Last 3 seasons, weighted and regressed</option>
          <option value="last" ${s.base === "last" ? "selected" : ""}>Last season's wOBA</option>
          <option value="xlast" ${s.base === "xlast" ? "selected" : ""}>Last season's expected wOBA</option>
          <option value="custom" ${s.base === "custom" ? "selected" : ""}>My own number</option></select></label>` : ""}
        <h3 class="sub">The player</h3>
        ${slider("age")}${slider("woba")}${slider("pa")}
        <label class="sel"><span class="lbl">Position adjustment</span><select id="cPos">
          ${Object.keys(POSADJ).map((k) => `<option value="${k}" ${k === s.pos ? "selected" : ""}>${k === "none" ? "None (batting only)" : k + "  (" + (POSADJ[k] > 0 ? "+" : "") + POSADJ[k] + " runs)"}</option>`).join("")}
        </select></label>
        ${slider("def")}
        <h3 class="sub">The offer</h3>
        ${slider("yrs")}${slider("aav")}
        <h3 class="sub">The market</h3>
        ${slider("dpw")}${slider("g")}${slider("r")}
        <label class="sel"><span class="lbl">Aging curve</span><select id="cCurve">
          <option value="corrected" ${s.curve === "corrected" ? "selected" : ""}>Survivor-bias corrected (peak ${A.curves.corrected.peak})</option>
          <option value="survivors" ${s.curve === "survivors" ? "selected" : ""}>Survivors only (peak ${A.curves.survivors.peak})</option></select></label>
        <button type="button" class="link" id="cReset">Reset to the research defaults</button>
      </aside>
      <main class="card" id="cMain"></main>`;
    drawn = true;
    update();
  }

  function update() {
    const P = project(), m = $("#cMain"), first = P.rows[0], lastR = P.rows[P.rows.length - 1];
    const who = s.cid ? app().name(s.cid) : `A .${Math.round(s.woba * 1000)} hitter`;
    const tone = P.surplus >= 0 ? "good" : "bad";
    m.innerHTML = `
      <div class="ph"><div><div class="kick">Contract value · signs for ${SIGN}</div><h1>${esc(who)}</h1>
        <div class="meta">${s.yrs} years × $${s.aav}M = $${(s.yrs * s.aav).toFixed(0)}M · ages ${first.age}–${lastR.age}` +
        `${s.cid && s.baseNote && s.base !== "custom" ? ` · starts from ${esc(s.baseNote)}` : ""}</div></div>` +
        `<div class="phb">${s.cid ? `<button type="button" class="btn" data-goplayer="${s.cid}">Player analysis →</button>` : ""}` +
        `<button type="button" class="btn" data-gowin="${winLink(first)}">Year-1 wins at the gate →</button></div></div>` + `
      <div class="ctiles">
        <div class="ct"><div class="sv">${F.war(P.war)}</div><div class="sl">Projected WAR over ${s.yrs} years</div></div>
        <div class="ct"><div class="sv">${F.$m(P.pv)}</div><div class="sl">What that's worth${s.r ? " (present value)" : ""}</div></div>
        <div class="ct"><div class="sv">${F.$m(P.pc)}</div><div class="sl">What it costs${s.r ? " (present value)" : ""}</div></div>
        <div class="ct ${tone}"><div class="sv">${F.$m(P.surplus)}</div><div class="sl">${P.surplus >= 0 ? "Surplus value to the club" : "Overpay"}</div></div>
        <div class="ct"><div class="sv">${F.$m(P.breakeven)}</div><div class="sl">Break-even salary per year</div></div>
      </div>
      <section class="panel"><div class="tabs ctabs">
        <button type="button" data-cv="value" class="${view === "value" ? "on" : ""}">Value vs salary</button>
        <button type="button" data-cv="path" class="${view === "path" ? "on" : ""}">wOBA path</button>
        <button type="button" data-cv="curve" class="${view === "curve" ? "on" : ""}">Aging curve</button></div>
        <div class="chart"><canvas id="cChart"></canvas></div></section>
      <section class="panel"><h3>Year by year</h3><div class="tw2"><table class="ars ctable"><thead><tr>
        <th>Season</th><th>Age</th><th>wOBA</th><th>Batting runs</th><th>Pos + def</th><th>WAR</th><th>$/WAR</th><th>Value</th><th>Salary</th><th>Surplus</th></tr></thead><tbody>
        ${P.rows.map((r) => `<tr><td>${r.season}</td><td>${r.age}</td><td>${F.w(r.woba)}</td><td>${(r.bat > 0 ? "+" : "") + r.bat.toFixed(1)}</td>` +
          `<td>${((r.posRuns + r.def) > 0 ? "+" : "") + (r.posRuns + r.def).toFixed(1)}</td><td><b>${F.war(r.war)}</b></td><td>$${r.price.toFixed(1)}M</td>` +
          `<td>${F.$m(r.value)}</td><td>${F.$m(r.salary)}</td><td class="${r.surplus >= 0 ? "gain" : "loss"}">${F.$m(r.surplus)}</td></tr>`).join("")}
        <tr class="tot"><td>Total</td><td></td><td></td><td></td><td></td><td><b>${F.war(P.war)}</b></td><td></td><td>${F.$m(P.rows.reduce((a, r) => a + r.value, 0))}</td>` +
        `<td>${F.$m(s.aav * s.yrs)}</td><td class="${P.surplus >= 0 ? "gain" : "loss"}">${F.$m(P.rows.reduce((a, r) => a + r.surplus, 0))}</td></tr>
        </tbody></table></div>
        <p class="note">WAR = ((wOBA − league ${F.w(A.lg)}) ÷ ${A.wobaScale} × PA + ${A.replRuns} replacement runs per 600 PA + position + defense) ÷ ${A.runsPerWin} runs per win,
        as in the <a href="https://research.stellargrove.com/baseball/aging_curves/">aging-curves research</a>. wOBA changes each year by the ${s.curve === "corrected" ? "survivor-bias corrected" : "survivors-only"} curve.
        Position adjustments are standard per-season values and defense is held flat; both are assumptions. ${s.r ? "Totals in the tiles are discounted to signing; the table's total row is not." : ""}</p>
      </section>`;
    plots.c = new Plot($("#cChart"));
    drawChart(P);
    writeHash();
  }

  function drawChart(P) {
    if (view === "value") {
      const xs = P.rows.map((r) => r.season);
      plots.c.set({ x: { label: "Season", min: xs[0] - 0.6, max: xs[xs.length - 1] + 0.6, ticks: xs, plain: true, hoverLabel: "Season" },
        y: { label: "$ millions", min: Math.min(0, ...P.rows.map((r) => r.value)) * 1.1, max: Math.max(s.aav, ...P.rows.map((r) => r.value)) * 1.15, hoverDecimals: 1, unit: "M" },
        layers: [{ name: "Value of projected WAR", kind: "bars", x: xs, y: P.rows.map((r) => r.value), color: SG.forest,
                   colors: P.rows.map((r) => (r.value >= r.salary ? "#0D7A3C" : "#A54A28")) },
                 { name: "Salary", x: [xs[0] - 0.5].concat(xs, [xs[xs.length - 1] + 0.5]), y: [s.aav].concat(xs.map(() => s.aav), [s.aav]), color: SG.navy, width: 2.5, hover: false }],
        hlines: [{ y: 0, color: "#9FB6C6", solid: true, width: 1 }] });
    } else if (view === "path") {
      const h = s.cid ? hist(s.cid) : [];
      const hx = h.map((r) => r.season), hy = h.map((r) => r.woba == null ? r.v.woba : r.v.woba);
      const px = P.rows.map((r) => r.season), py = P.rows.map((r) => r.woba);
      const all = hy.concat(py, [A.lg]), lo = Math.min(...all) - 0.02, hi = Math.max(...all) + 0.02;
      const xs0 = (hx.length ? hx[0] : px[0]) - 0.5, xs1 = px[px.length - 1] + 0.5;
      const ticks = []; for (let y = Math.ceil(xs0); y <= xs1; y++) ticks.push(y);
      plots.c.set({ x: { label: "Season", min: xs0, max: xs1, ticks, plain: true, hoverLabel: "Season" },
        y: { label: "wOBA", min: lo, max: hi, decimals: 3, hoverDecimals: 3 },
        layers: (hx.length ? [{ name: "Actual", x: hx, y: hy, color: SG.navy, width: 3 }] : []).concat(
          [{ name: "Projected", x: (hx.length ? [hx[hx.length - 1]] : []).concat(px), y: (hx.length ? [hy[hy.length - 1]] : []).concat(py), color: SG.forest, dash: true, width: 3 }]),
        hlines: [{ y: A.lg, color: "#A97E2C", label: "league average " + F.w(A.lg) }],
        markers: px.map((x, i) => ({ x, y: py[i], color: SG.forest, r: 4 })).concat(hx.map((x, i) => ({ x, y: hy[i], color: SG.navy, r: 4 }))) });
    } else {
      const c = A.curves.corrected, r = A.curves.survivors;
      plots.c.set({ x: { label: "Age", min: c.ages[0] - 0.5, max: c.ages[c.ages.length - 1] + 0.5, ticks: c.ages, plain: true, hoverLabel: "Age" },
        y: { label: "wOBA vs peak (points)", hoverDecimals: 0 },
        layers: [{ name: "Survivors only", x: r.ages, y: r.level.map((v) => 1000 * v), color: "#9FB6C6", dash: true, width: 2 },
                 { name: "Survivor-bias corrected", x: c.ages, y: c.level.map((v) => 1000 * v), color: SG.navy, width: 3 }],
        vlines: [{ x: s.age, color: SG.forest, label: "signs at " + s.age, row: 2 }, { x: s.age + s.yrs - 1, color: SG.terracotta, label: "ends at " + (s.age + s.yrs - 1), row: 3 }],
        hlines: [{ y: 0, color: "#C9D3DA", solid: true, width: 1 }] });
    }
  }

  // ---------- events (only while the contract view is showing)
  function onInput(e) {
    const k = e.target.dataset.c; if (!k) return;
    s[k] = +e.target.value;
    const sl = sliders.find((x) => x[0] === k);
    $("#co-" + k).textContent = sl[5](s[k]);
    e.target.style.setProperty("--fill", (100 * (s[k] - sl[2]) / (sl[3] - sl[2])) + "%");
    if (k === "woba" && s.cid && s.base !== "custom") { s.base = "custom"; const b = $("#cBase"); if (b) b.value = "custom"; }
    if (k === "age" && s.cid && s.base !== "custom") { applyBase(); syncSlider("woba"); }
    update();
  }
  function syncSlider(k) {
    const inp = document.querySelector(`[data-c="${k}"]`), sl = sliders.find((x) => x[0] === k);
    if (inp) { inp.value = s[k]; inp.style.setProperty("--fill", (100 * (s[k] - sl[2]) / (sl[3] - sl[2])) + "%"); }
    $("#co-" + k).textContent = sl[5](s[k]);
  }
  function rerender(extra) {
    const u = new URLSearchParams(); Object.keys(DEF).forEach((k) => { if (s[k] !== DEF[k]) u.set(k, s[k]); });
    Object.entries(extra || {}).forEach(([k, v]) => (v == null ? u.delete(k) : u.set(k, v)));
    render(u);
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === "cPlayer") {
      const opt = [...document.querySelectorAll("#cHitters option")].find((o) => o.value === t.value);
      if (opt) rerender({ cid: opt.dataset.id, age: null, woba: null, pos: null, def: null, pa: null, base: s.base === "custom" ? null : s.base });
    } else if (t.id === "cBase") { s.base = t.value; if (s.base !== "custom") applyBase(); syncSlider("woba"); update(); }
    else if (t.id === "cPos") { s.pos = t.value; update(); }
    else if (t.id === "cCurve") { s.curve = t.value; if (s.cid && s.base !== "custom") { applyBase(); syncSlider("woba"); } update(); }
  }
  function onClick(e) {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.cv) { view = t.dataset.cv; document.querySelectorAll("[data-cv]").forEach((b) => b.classList.toggle("on", b === t)); drawChart(project()); }
    else if (t.id === "cCustom") rerender({ cid: null, base: null, pos: null, def: null });
    else if (t.id === "cReset") render(new URLSearchParams(s.cid ? { cid: s.cid } : {}));
  }
  return {
    render, bind(root) { root.addEventListener("input", onInput); root.addEventListener("change", onChange); root.addEventListener("click", onClick); },
    _project: () => project(), _state: () => s,
  };
})();
