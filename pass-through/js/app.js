/* Who Pays? Three pass-through simulators built on Stellar Grove's econ research (data: window.PT).
   Tariffs: shelf price and incidence from the import content, the exporter's absorption and the currency.
   Gas: tara's fitted asymmetric error-correction model of weekly pump prices on crude (rises vs falls).
   Mergers: logit demand with Bertrand pricing (tara's planted market), solved in the browser. */
"use strict";
(function () {
  const PT = window.PT || {}, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(100 * v).toFixed(d) + "%";
  const usd = (v, d = 2) => (v < 0 ? "−$" : "$") + Math.abs(v).toFixed(d);
  const MON = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const fy = (m) => +m.slice(0, 4) + (+m.slice(5, 7) - 1) / 12;
  const C = { navy: "#062F4F", forest: "#0D7A3C", terra: "#A54A28", brass: "#A97E2C", sky: "#439CCC", mist: "#9FB6C6" };
  function sliderHTML(prefix, id, label, min, max, step, val, f) {
    return `<label class="param"><span class="pl">${label}</span><output id="${prefix}o-${id}">${f(val)}</output>` +
      `<input type="range" data-${prefix}="${id}" min="${min}" max="${max}" step="${step}" value="${val}" style="--fill:${100 * (val - min) / (max - min)}%"></label>`;
  }
  function syncSlider(prefix, id, val, min, max, f) {
    const i = document.querySelector(`[data-${prefix}="${id}"]`); if (i) { i.value = val; i.style.setProperty("--fill", (100 * (val - min) / (max - min)) + "%"); }
    const o = document.getElementById(`${prefix}o-${id}`); if (o) o.textContent = f(val);
  }
  const missing = (what) => `<main class="main"><div class="missing">The ${what} data hasn't been built yet. On the Mac: <code>cd ~/stellar-grove/tara && uv run python ../bitstaemr/apps/pass-through/build_data.py</code></div></main>`;

  // ======================================================================= tariffs
  const T = PT.tariffs;
  const T_SL = [["tau", "Tariff rate", 0, 1, 0.01, (v) => Math.round(100 * v) + "%"], ["theta", "Imported content of the shelf price", 0.05, 1, 0.05, (v) => Math.round(100 * v) + "%"],
    ["abs", "Share of the tariff the exporter absorbs", 0, 1, 0.01, (v) => Math.round(100 * v) + "%"], ["fx", "Exporter's currency vs the dollar", -0.2, 0.2, 0.01, (v) => (v > 0 ? "+" : "") + Math.round(100 * v) + "%"],
    ["rho", "Share of cost increases retailers pass on", 0, 1, 0.05, (v) => Math.round(100 * v) + "%"], ["p0", "Shelf price today", 5, 500, 5, (v) => "$" + v]];
  const T_PRESETS = [
    ["2018–19 China tariffs (research)", { tau: 0.18, abs: T ? Math.max(0, -T.phases[1].est / 100 / T.tariffRise) : 0.144, fx: 0 }],
    ["Same, against the pre-2018 trend", { tau: 0.18, abs: 0, fx: 0 }],
    ["Same, with the yuan's 8% slide", { tau: 0.18, abs: T ? Math.max(0, -T.phases[1].est / 100 / T.tariffRise) : 0.144, fx: -0.08 }],
    ["A 50% tariff, no absorption", { tau: 0.5, abs: 0, fx: 0 }],
  ];
  const T_DEF = Object.assign({ theta: 0.5, rho: 1, p0: 100, ev: "2018" }, T_PRESETS[0][1]);
  let TS = Object.assign({}, T_DEF);
  function tariffCalc(s) {
    const imp0 = s.theta * s.p0;                          // import cost inside today's shelf price
    const exPrice = imp0 * (1 - s.abs * s.tau) * (1 + s.fx); // exporter's dollar price after its cut and the currency move
    const landed = exPrice * (1 + s.tau), dCost = landed - imp0, dShelf = s.rho * dCost;
    const duty = exPrice * s.tau;                         // collected at the border per unit
    // incidence of the duty: exporters bear their price cut; the rest falls on U.S. importers/retailers and consumers
    const byExporter = Math.min(duty, imp0 * s.abs * s.tau), usSide = duty - byExporter;
    return { imp0, exPrice, landed, dCost, dShelf, duty, byExporter, consumers: Math.max(0, Math.min(usSide, s.rho * usSide)), firms: usSide * (1 - s.rho) };
  }
  function renderTariff(u) {
    if (!T) { $("#view").innerHTML = missing("tariff"); return; }
    TS = Object.assign({}, T_DEF);
    T_SL.forEach(([k]) => { if (u.has(k) && isFinite(+u.get(k))) TS[k] = +u.get(k); });
    if (["2018", "now"].includes(u.get("ev"))) TS.ev = u.get("ev");
    $("#view").innerHTML = `
      <aside class="panel side">
        <div class="lbl">Start from</div>
        <div class="presets">${T_PRESETS.map(([l], i) => `<button type="button" class="chip" data-tp="${i}">${esc(l)}</button>`).join("")}</div>
        <h3 class="sub">The tariff</h3>${T_SL.slice(0, 4).map(([k, l, a, b, st, f]) => sliderHTML("t", k, l, a, b, st, TS[k], f)).join("")}
        <h3 class="sub">The product</h3>${T_SL.slice(4).map(([k, l, a, b, st, f]) => sliderHTML("t", k, l, a, b, st, TS[k], f)).join("")}
        <p class="hint">Exporter absorption is the research's key measurement: BLS import prices exclude the tariff, so a fall in China's prices relative to other countries' shows how much exporters ate.</p>
      </aside><main class="main" id="tMain"></main>`;
    updateTariff();
  }
  function updateTariff() {
    const R = tariffCalc(TS), tot = R.byExporter + R.consumers + R.firms || 1, shelf1 = TS.p0 + R.dShelf;
    const on = T_PRESETS.findIndex(([, v]) => Object.keys(v).every((k) => Math.abs(TS[k] - v[k]) < 1e-6));
    document.querySelectorAll("[data-tp]").forEach((b, i) => b.classList.toggle("on", i === on));
    const ph = T.phases, usLevel = 1 - Math.min(1, Math.max(0, -ph[1].est / 100 / T.tariffRise));
    $("#tMain").innerHTML = `
      <div class="ph"><div><div class="kick">Tariffs · who pays</div><h1>A $${TS.p0} item goes to ${usd(shelf1)} (${pct(R.dShelf / TS.p0)})</h1>
        <div class="meta">${Math.round(100 * TS.tau)}% tariff on imports worth ${Math.round(100 * TS.theta)}% of the shelf price · exporter absorbs ${Math.round(100 * TS.abs)}% · ${TS.fx ? "currency " + pct(TS.fx, 0) + " · " : ""}retailers pass on ${Math.round(100 * TS.rho)}%</div></div></div>
      <div class="tiles">
        <div class="tile"><div class="sv">${usd(R.duty)}</div><div class="sl">Duty collected at the border on this item</div></div>
        <div class="tile ${R.dShelf > 0 ? "bad" : "good"}"><div class="sv">${usd(R.dShelf)}</div><div class="sl">Added to the shelf price</div></div>
        <div class="tile"><div class="sv">${Math.round(100 * (R.consumers + R.firms) / tot)}%</div><div class="sl">Of the duty paid on the U.S. side</div></div>
        <div class="tile"><div class="sv">${Math.round(100 * usLevel)}%</div><div class="sl">U.S. share the research measured for 2018–19 (85%–100% by baseline)</div></div>
      </div>
      <section class="card"><h3>Who pays the ${usd(R.duty)} duty</h3>
        <div class="split">${[[R.consumers, C.terra, "U.S. consumers"], [R.firms, C.brass, "U.S. importers and retailers"], [R.byExporter, C.navy, "Foreign exporter"]]
          .map(([v, col, l]) => `<span style="flex-grow:${Math.max(v, 0.0001)};background:${col}" title="${l}: ${usd(v)}">${v / tot > 0.08 ? Math.round(100 * v / tot) + "%" : ""}</span>`).join("")}</div>
        <div class="legend2"><span><i style="background:${C.terra}"></i>U.S. consumers ${usd(R.consumers)}</span><span><i style="background:${C.brass}"></i>U.S. importers and retailers ${usd(R.firms)}</span><span><i style="background:${C.navy}"></i>Foreign exporter ${usd(R.byExporter)}</span></div>
        <p class="note">The exporter "pays" by cutting its pre-tariff price; everything else is paid in the U.S., by consumers through higher prices or by importers and retailers through thinner margins.${TS.fx ? ` The currency move changes the dollar cost by ${usd(R.imp0 * TS.fx)} before the duty, separate from who pays the duty.` : ""}</p></section>
      <section class="card"><div class="tabs"><button type="button" data-tev="2018" class="${TS.ev === "2018" ? "on" : ""}">The evidence: 2016–2020</button>
        <button type="button" data-tev="now" class="${TS.ev === "now" ? "on" : ""}">2016 to now</button></div>
        <div class="chart"><canvas id="tChart"></canvas></div>
        <table class="tbl"><thead><tr><th>Phase</th><th class="num">vs Jan–Jun 2018</th><th class="num">95% CI</th></tr></thead><tbody>
          ${ph.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${p.est > 0 ? "+" : ""}${p.est.toFixed(1)}%</td><td class="num">${p.lo.toFixed(1)} to ${p.hi > 0 ? "+" : ""}${p.hi.toFixed(1)}</td></tr>`).join("")}</tbody></table>
        <p class="note">China's pre-tariff import prices relative to Canada, Mexico, Japan and the EU (log points × 100, June 2018 = 0); shaded: the 2018–20 tariff phases. With an ${Math.round(100 * T.tariffRise)}% average tariff rise, a ${Math.abs(ph[1].est).toFixed(1)}% relative fall means exporters absorbed about ${Math.round(100 * (1 - usLevel))}%; against the pre-2018 downward trend (dotted), they absorbed nothing. Data retrieved ${T.retrieved}.</p></section>`;
    drawTariff();
    writeHash("tariff", TS, T_DEF);
  }
  function drawTariff() {
    const end = TS.ev === "2018" ? 2021 : 9999, idx = T.months.map((m, i) => i).filter((i) => fy(T.months[i]) < end);
    const xs = idx.map((i) => fy(T.months[i])), tr0 = fy(T.trend.start);
    const trX = xs.filter((x) => x <= 2021), trY = trX.map((x) => T.trend.icpt + T.trend.slope * Math.round((x - tr0) * 12));
    const ticks = []; for (let y = 2016; y <= Math.floor(xs[xs.length - 1]); y++) ticks.push(y);
    new Plot($("#tChart")).set({ x: { min: 2016, max: xs[xs.length - 1] + 0.1, ticks, plain: true, hoverLabel: "Month" },
      y: { label: "Log points vs Jun 2018 (×100)", hoverDecimals: 1 },
      bands: T.phases.map((p) => ({ x0: fy(p.from), x1: fy(p.to) + 1 / 12, color: "rgba(165,74,40,.10)" })).concat(TS.ev === "now" ? [{ x0: 2025.08, x1: xs[xs.length - 1] + 0.1, color: "rgba(165,74,40,.10)" }] : []),
      layers: [{ name: "China vs other countries", x: xs, y: idx.map((i) => T.rel[i]), color: C.navy, width: 2.4 },
               { name: "Yuan vs dollar (up = stronger yuan)", x: xs, y: idx.map((i) => (T.fx[i] == null ? NaN : -T.fx[i])), color: C.brass, width: 1.4, dash: true },
               { name: "Pre-2018 trend", x: trX, y: trY, color: C.mist, width: 1.4, dash: true, hover: false }],
      hlines: [{ y: 0, color: "#9FB6C6", solid: true, width: 1 }] });
  }

  // ======================================================================= gasoline
  const G = PT.gasoline;
  const G_DEF = { move: 10, gal: 15, dir: 1 };
  let GS = Object.assign({}, G_DEF);
  function gasPath(sign, shockC) {
    // tara's econ/gasoline simulate(): response of retail (cents) to a permanent crude move, from equilibrium
    const K = G.K, P = G.P, n = G.weeks + K + P + 2, c = new Array(n).fill(0), g = new Array(n).fill(0);
    for (let t = K + P + 1; t < n; t++) c[t] = sign * shockC;
    const dc = c.map((v, t) => v - (t ? c[t - 1] : 0));
    for (let t = K + P + 1; t < n; t++) {
      let x = G.lam * (g[t - 1] - G.b1 * c[t - 1]);
      for (let k = 0; k <= K; k++) x += G.up[k] * Math.max(dc[t - k], 0) + G.dn[k] * Math.min(dc[t - k], 0);
      for (let k = 1; k <= P; k++) x += G.dg[k - 1] * (g[t - k] - g[t - k - 1]);
      g[t] = g[t - 1] + x;
    }
    return g.slice(K + P + 1, K + P + 1 + G.weeks + 1);
  }
  function renderGas(u) {
    if (!G) { $("#view").innerHTML = missing("gasoline"); return; }
    GS = Object.assign({}, G_DEF);
    ["move", "gal"].forEach((k) => { if (u.has(k) && isFinite(+u.get(k))) GS[k] = +u.get(k); });
    if (u.get("dir") === "-1") GS.dir = -1;
    $("#view").innerHTML = `
      <aside class="panel side">
        <h3 class="sub first">The shock</h3>
        <div class="seg"><button type="button" data-gd="1" class="${GS.dir > 0 ? "on" : ""}">Crude rises</button><button type="button" data-gd="-1" class="${GS.dir < 0 ? "on" : ""}">Crude falls</button></div>
        ${sliderHTML("g", "move", "Change in crude oil, $ a barrel", 1, 40, 1, GS.move, (v) => "$" + v)}
        ${sliderHTML("g", "gal", "Your tank, gallons", 5, 30, 1, GS.gal, (v) => v + " gal")}
        <p class="hint">A $1 a barrel move is 2.4¢ a gallon of crude (42 gallons a barrel). The model is the research's error-correction fit on weekly U.S. averages, 1991 to now.</p>
      </aside><main class="main" id="gMain"></main>`;
    updateGas();
  }
  function updateGas() {
    const shockC = GS.move * 100 / 42, up = gasPath(1, shockC), dn = gasPath(-1, shockC).map((v) => -v), lr = G.b1 * shockC;
    const mine = GS.dir > 0 ? up : dn, wk = (k) => mine[Math.min(k, mine.length - 1)];
    const at = (arr, k) => arr[k] / lr;
    $("#gMain").innerHTML = `
      <div class="ph"><div><div class="kick">Gas prices · rockets and feathers</div>
        <h1>A $${GS.move} ${GS.dir > 0 ? "rise" : "fall"} in crude moves the pump ${(lr).toFixed(0)}¢ a gallon in the long run</h1>
        <div class="meta">${Math.round(100 * at(mine, 2))}% of that arrives within 2 weeks, ${Math.round(100 * at(mine, 4))}% within 4 · long-run pass-through ${G.b1.toFixed(2)}¢ per 1¢ of crude · pump prices close ${(-100 * G.lam).toFixed(0)}% of any gap each week</div></div></div>
      <div class="tiles">
        <div class="tile"><div class="sv">${(GS.dir * wk(2)).toFixed(0)}¢</div><div class="sl">At the pump after 2 weeks</div></div>
        <div class="tile"><div class="sv">${(GS.dir * lr).toFixed(0)}¢</div><div class="sl">At the pump in the long run</div></div>
        <div class="tile ${GS.dir > 0 ? "bad" : "good"}"><div class="sv">${usd(GS.dir * lr * GS.gal / 100)}</div><div class="sl">Per ${GS.gal}-gallon fill-up, once it's all through</div></div>
        <div class="tile"><div class="sv">p = ${G.pAsym.toFixed(2)}</div><div class="sl">Rises vs falls, first four weeks: not statistically different</div></div>
      </div>
      <section class="card"><h3>Week by week: rises vs falls</h3><div class="chart"><canvas id="gChart"></canvas></div>
        <table class="tbl"><thead><tr><th>Weeks after</th>${[1, 2, 4, 8, 12].map((k) => `<th class="num">${k}</th>`).join("")}</tr></thead><tbody>
          <tr><td>Crude rises</td>${[1, 2, 4, 8, 12].map((k) => `<td class="num">${Math.round(100 * at(up, k))}%</td>`).join("")}</tr>
          <tr><td>Crude falls</td>${[1, 2, 4, 8, 12].map((k) => `<td class="num">${Math.round(100 * at(dn, k))}%</td>`).join("")}</tr></tbody></table>
        <p class="note">Share of the long-run pump change reached each week. Rises reach the pump a little faster at first, but falls catch up within about a month; at the national weekly level, "rockets and feathers" is a short lag, not a lasting gap. Today the pump is ${G.gapNow > 0 ? "+" : ""}${G.gapNow.toFixed(0)}¢ ${G.gapNow >= 0 ? "above" : "below"} the level crude implies.</p></section>
      <section class="card"><h3>Pump vs crude, 2005 to now</h3><div class="chart"><canvas id="gHist"></canvas></div>
        <p class="note">Weekly U.S. average regular gasoline and WTI crude (7-day average, in cents a gallon). Data retrieved ${G.retrieved}.</p></section>`;
    const w = up.map((_, k) => k);
    new Plot($("#gChart")).set({ x: { label: "Weeks after the change in crude", min: 0, max: G.weeks, decimals: 0, hoverLabel: "Week" },
      y: { label: "Change at the pump (¢ a gallon)", hoverDecimals: 1, unit: "¢" },
      layers: [{ name: `Crude rises $${GS.move}`, x: w, y: up, color: C.terra, width: GS.dir > 0 ? 3 : 1.8 },
               { name: `Crude falls $${GS.move} (shown as size)`, x: w, y: dn, color: C.navy, width: GS.dir < 0 ? 3 : 1.8 }],
      hlines: [{ y: lr, color: C.brass, label: "long run " + lr.toFixed(0) + "¢" }] });
    const xs = G.dates.map((d) => +d.slice(0, 4) + (+d.slice(5, 7) - 1) / 12 + (+d.slice(8, 10) - 1) / 365);
    const ticks = []; for (let y = 2005; y <= Math.floor(xs[xs.length - 1]); y += 5) ticks.push(y);
    new Plot($("#gHist")).set({ x: { min: 2005, max: xs[xs.length - 1] + 0.1, ticks, plain: true, hoverLabel: "Year", hoverDecimals: 2 },
      y: { label: "Cents a gallon", min: 0, hoverDecimals: 0, unit: "¢" },
      layers: [{ name: "Regular gasoline", x: xs, y: G.gas, color: C.terra, width: 1.6 }, { name: "Crude oil (WTI)", x: xs, y: G.crude, color: C.navy, width: 1.6 }] });
    writeHash("gas", GS, G_DEF);
  }

  // ======================================================================= mergers
  const M = PT.merger;
  const M_DEF = { m: "0,1", eff: 0, est: "iv" };
  let MS = Object.assign({}, M_DEF);
  function shares(p, d, a) { const u = p.map((x, j) => Math.exp(d[j] - a * x)), s = u.reduce((t, v) => t + v, 0); return u.map((v) => v / (1 + s)); }
  function equilibrium(c, d, a, owner) {
    let p = c.map((x) => x + 1 / a);
    for (let it = 0; it < 5000; it++) {
      const s = shares(p, d, a), S = p.map((_, j) => s.reduce((t, v, k) => t + (owner[k] === owner[j] ? v : 0), 0));
      const pn = c.map((x, j) => x + 1 / (a * (1 - S[j])));
      if (Math.max(...pn.map((v, j) => Math.abs(v - p[j]))) < 1e-10) return pn;
      p = p.map((v, j) => 0.5 * v + 0.5 * pn[j]);
    }
    return p;
  }
  const cs = (p, d, a) => Math.log(1 + p.reduce((t, x, j) => t + Math.exp(d[j] - a * x), 0)) / a;  // logit consumer surplus per buyer
  function mergerCalc(s) {
    const n = M.firms.length, merging = s.m.split(",").filter((x) => x !== "").map(Number), A = M.alpha;
    const own0 = M.firms.map((_, j) => j), own1 = own0.map((j) => (merging.includes(j) ? merging[0] : j));
    const p0 = equilibrium(M.cost, M.delta, A, own0), s0 = shares(p0, M.delta, A);
    const c1 = M.cost.map((c, j) => (merging.includes(j) ? c * (1 - s.eff) : c));
    const p1 = merging.length > 1 ? equilibrium(c1, M.delta, A, own1) : p0, s1 = shares(p1, M.delta, A);
    // the analyst's view: invert shares at the estimated alpha (Berry) and back costs out of the first-order conditions
    const ah = s.est === "ols" ? M.alphaOls : s.est === "true" ? A : M.alphaIv, out0 = 1 - s0.reduce((t, v) => t + v, 0);
    const S0f = p0.map((_, j) => s0.reduce((t, v, k) => t + (own0[k] === own0[j] ? v : 0), 0));
    const dh = s0.map((v, j) => Math.log(v / out0) + ah * p0[j]), ch = p0.map((x, j) => x - 1 / (ah * (1 - S0f[j])));
    const pHat = merging.length > 1 ? equilibrium(ch.map((c, j) => (merging.includes(j) ? c * (1 - s.eff) : c)), dh, ah, own1) : p0;
    const inside = s0.map((v) => v / (1 - out0)), hhi = inside.reduce((t, v) => t + (100 * v) ** 2, 0);
    let dhhi = 0; for (let a = 0; a < merging.length; a++) for (let b = a + 1; b < merging.length; b++) dhhi += 2 * 100 * inside[merging[a]] * 100 * inside[merging[b]];
    let guppi = null, cmcr = null;
    if (merging.length === 2) {
      const [i, k] = merging, Dik = s0[k] / (1 - s0[i]), Dki = s0[i] / (1 - s0[k]), mi = (p0[i] - M.cost[i]) / p0[i], mk = (p0[k] - M.cost[k]) / p0[k];
      guppi = [Dik * (p0[k] - M.cost[k]) / p0[i], Dki * (p0[i] - M.cost[i]) / p0[k]];
      cmcr = [(mi * Dik * Dki + mk * Dik * p0[k] / p0[i]) / ((1 - mi) * (1 - Dik * Dki)), (mk * Dik * Dki + mi * Dki * p0[i] / p0[k]) / ((1 - mk) * (1 - Dik * Dki))];
    }
    const rivals = own0.filter((j) => !merging.includes(j)), wr = rivals.reduce((t, j) => t + s0[j], 0);
    const rivalRise = rivals.reduce((t, j) => t + s0[j] * (p1[j] / p0[j] - 1), 0) / (wr || 1);
    const dCS = (cs(p1, M.delta, A) - cs(p0, M.delta, A)) * M.marketSize;   // per market-period, in $
    return { merging, p0, s0, p1, s1, pHat, out0, hhi, dhhi, guppi, cmcr, rivalRise, dCS, ah };
  }
  function renderMerger(u) {
    if (!M) { $("#view").innerHTML = missing("merger"); return; }
    MS = Object.assign({}, M_DEF);
    if (u.get("m") != null && /^[0-5](,[0-5])*$|^$/.test(u.get("m"))) MS.m = u.get("m");
    if (u.has("eff") && isFinite(+u.get("eff"))) MS.eff = Math.max(0, Math.min(0.3, +u.get("eff")));
    if (["iv", "ols", "true"].includes(u.get("est"))) MS.est = u.get("est");
    $("#view").innerHTML = `
      <aside class="panel side">
        <div class="lbl">Who merges? (pick two or more)</div>
        <div class="firms" id="firms"></div>
        ${sliderHTML("m", "eff", "Marginal-cost savings for the merged firms", 0, 0.3, 0.005, MS.eff, (v) => (100 * v).toFixed(1) + "%")}
        <div class="lbl">How the analyst measures price sensitivity</div>
        <div class="seg"><button type="button" data-me="iv">Instrumented</button><button type="button" data-me="ols">Naive OLS</button><button type="button" data-me="true">The truth</button></div>
        <p class="hint">A simulated market of six firms with logit demand and Bertrand pricing (tara's merger study). The "true" result uses the planted demand; the analyst's simulation uses the estimated price sensitivity, as a competition agency would.</p>
      </aside><main class="main" id="mMain"></main>`;
    updateMerger();
  }
  function updateMerger() {
    const R = mergerCalc(MS), mg = R.merging, n = M.firms.length;
    $("#firms").innerHTML = M.firms.map((f, j) => `<button type="button" class="firm ${mg.includes(j) ? "on" : ""}" data-mf="${j}">${esc(f)}<small>${(100 * R.s0[j]).toFixed(1)}% share</small></button>`).join("");
    document.querySelectorAll("[data-me]").forEach((b) => b.classList.toggle("on", b.dataset.me === MS.est));
    const names = mg.map((j) => M.firms[j]).join(" + ") || "No one";
    const avgMerged = mg.length > 1 ? mg.reduce((t, j) => t + R.s0[j] * (R.p1[j] / R.p0[j] - 1), 0) / mg.reduce((t, j) => t + R.s0[j], 0) : 0;
    const post = R.hhi + R.dhhi, flag = post > 1800 && R.dhhi > 100;
    $("#mMain").innerHTML = mg.length < 2 ? `<div class="missing">Pick at least two firms to merge.</div>` : `
      <div class="ph"><div><div class="kick">Mergers · simulated market · ${esc(names)} combine</div><h1>${mg.map((j) => `${esc(M.firms[j])} ${pct(R.p1[j] / R.p0[j] - 1)}`).join(", ")}</h1>
        <div class="meta">${MS.eff ? `with ${(100 * MS.eff).toFixed(1)}% cost savings · ` : ""}rivals ${pct(R.rivalRise, 2)} · analyst's estimate of price sensitivity ${R.ah.toFixed(3)} (true ${M.alpha})</div></div></div>
      <div class="tiles">
        <div class="tile ${flag ? "bad" : ""}"><div class="sv">+${Math.round(R.dhhi).toLocaleString()}</div><div class="sl">Change in HHI, to ${Math.round(post).toLocaleString()}${flag ? " (presumed anticompetitive, 2023 Guidelines)" : ""}</div></div>
        <div class="tile"><div class="sv">${R.guppi ? R.guppi.map((g) => (100 * g).toFixed(1) + "%").join(" / ") : "—"}</div><div class="sl">GUPPI${R.guppi ? "" : " (two-firm mergers)"}; above ~5% usually draws scrutiny</div></div>
        <div class="tile"><div class="sv">${R.cmcr ? R.cmcr.map((g) => (100 * g).toFixed(1) + "%").join(" / ") : "—"}</div><div class="sl">Cost savings needed to keep prices flat${R.cmcr ? "" : " (two-firm mergers)"}</div></div>
        <div class="tile ${R.dCS < 0 ? "bad" : "good"}"><div class="sv">${R.dCS < 0 ? "−" : "+"}$${Math.abs(R.dCS / 1e3).toFixed(0)}k</div><div class="sl">Change in consumer welfare per market per quarter</div></div>
      </div>
      <section class="card"><h3>Prices before and after</h3><div class="chart"><canvas id="mChart"></canvas></div>
        <div class="tw"><table class="tbl"><thead><tr><th>Firm</th><th class="num">Price now</th><th class="num">Share</th><th class="num">After (truth)</th><th class="num">Analyst's simulation</th><th class="num">Share after</th></tr></thead><tbody>
        ${M.firms.map((f, j) => `<tr class="${mg.includes(j) ? "merged" : ""}"><td>${esc(f)}${mg.includes(j) ? " *" : ""}</td><td class="num">${usd(R.p0[j])}</td><td class="num">${(100 * R.s0[j]).toFixed(1)}%</td>
          <td class="num">${usd(R.p1[j])} (${pct(R.p1[j] / R.p0[j] - 1)})</td><td class="num">${usd(R.pHat[j])}</td><td class="num">${(100 * R.s1[j]).toFixed(1)}%</td></tr>`).join("")}
        </tbody></table></div>
        <p class="note">* merging firms. Not buying at all holds ${(100 * R.out0).toFixed(1)}% today. The naive estimate understates price sensitivity (firms charge more where demand is strong), which makes customers look captive and overstates the price rise. Defaults reproduce the research: Ardent + Brio +7.1% / +8.2%.</p></section>`;
    if (mg.length < 2) { writeHash("merger", MS, M_DEF); return; }
    const xs = M.firms.map((_, j) => j);
    new Plot($("#mChart")).set({ x: { min: -0.6, max: n - 0.4, ticks: xs, labels: M.firms, hoverLabel: "Firm" }, y: { label: "Price change (%)", hoverDecimals: 2, unit: "%" },
      layers: [{ name: "True price change", kind: "bars", x: xs, y: xs.map((j) => 100 * (R.p1[j] / R.p0[j] - 1)), color: C.terra, colors: xs.map((j) => (mg.includes(j) ? C.terra : C.mist)) },
               { name: "Analyst's simulation", x: xs, y: xs.map((j) => 100 * (R.pHat[j] / R.p0[j] - 1)), color: C.navy, width: 0.01, hover: true }],
      markers: xs.map((j) => ({ x: j, y: 100 * (R.pHat[j] / R.p0[j] - 1), color: C.navy, fill: "#fff", r: 5 })),
      hlines: [{ y: 0, color: "#9FB6C6", solid: true, width: 1 }] });
    writeHash("merger", MS, M_DEF);
  }

  // ======================================================================= shell
  function writeHash(tab, s, d) {
    const u = new URLSearchParams({ tab });
    Object.keys(d).forEach((k) => { if (s[k] !== d[k]) u.set(k, typeof s[k] === "number" ? +s[k].toFixed(4) : s[k]); });
    history.replaceState(null, "", "#/?" + u.toString());
  }
  function route() {
    const u = new URLSearchParams(location.hash.replace(/^#\/?\??/, "")), tab = ["gas", "merger"].includes(u.get("tab")) ? u.get("tab") : "tariff";
    document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    ({ tariff: renderTariff, gas: renderGas, merger: renderMerger })[tab](u);
  }
  document.addEventListener("input", (e) => {
    const t = e.target, ds = t.dataset;
    if (ds.t) { const d = T_SL.find((x) => x[0] === ds.t); TS[ds.t] = +t.value; syncSlider("t", ds.t, TS[ds.t], d[2], d[3], d[5]); updateTariff(); }
    else if (ds.g) { GS[ds.g] = +t.value; syncSlider("g", ds.g, GS[ds.g], +t.min, +t.max, ds.g === "move" ? (v) => "$" + v : (v) => v + " gal"); updateGas(); }
    else if (ds.m === "eff") { MS.eff = +t.value; syncSlider("m", "eff", MS.eff, 0, 0.3, (v) => (100 * v).toFixed(1) + "%"); updateMerger(); }
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return; const ds = t.dataset;
    if (ds.tab) { history.pushState(null, "", "#/?tab=" + ds.tab); route(); }
    else if (ds.tp != null) { Object.assign(TS, T_PRESETS[+ds.tp][1]); T_SL.forEach(([k, , a, b, , f]) => syncSlider("t", k, TS[k], a, b, f)); updateTariff(); }
    else if (ds.tev) { TS.ev = ds.tev; updateTariff(); }
    else if (ds.gd) { GS.dir = +ds.gd; document.querySelectorAll("[data-gd]").forEach((b) => b.classList.toggle("on", b === t)); updateGas(); }
    else if (ds.mf != null) { const j = +ds.mf, cur = MS.m.split(",").filter((x) => x !== "").map(Number); const nx = cur.includes(j) ? cur.filter((x) => x !== j) : cur.concat(j).sort((a, b) => a - b); MS.m = nx.join(","); updateMerger(); }
    else if (ds.me) { MS.est = ds.me; updateMerger(); }
  });
  window.addEventListener("hashchange", route); window.addEventListener("popstate", route);
  $("#gen").textContent = PT.built ? `Built ${PT.built}.` : "";
  route();
})();
