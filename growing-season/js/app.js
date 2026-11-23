/* Growing Season Planner. Four planning tools built on Songrove Botanicals' synthetic case studies (data: window.GS).
   Planting date: b05's two-hinge pollen-viability model on a simulated seasonal climate (when to plant so maize
     flowers before the heat). Solar panels: b03's shade-yield slopes and canopy-temperature tipping point.
   Pollinators: b08's per-crop saturating visitation response. Rotation: b10's intercrop LER vs nitrogen and the
     cover-crop legacy by climate. All the studies are synthetic: simulated data with planted truths. */
"use strict";
(function () {
  const GS = window.GS || {}, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sg = (v, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
  const pc = (v, d = 0) => sg(v, d) + "%";
  const C = { navy: "#062F4F", forest: "#0D7A3C", terra: "#A54A28", brass: "#A97E2C", sky: "#439CCC", mist: "#9FB6C6", plum: "#6B4E7A" };
  const SER = [C.forest, C.sky, C.brass, C.terra, C.navy];
  const nice = (s) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const RES = "https://research.stellargrove.com/songrove/";
  function sliderHTML(prefix, id, label, min, max, step, val, f) {
    return `<label class="param"><span class="pl">${label}</span><output id="${prefix}o-${id}">${f(val)}</output>` +
      `<input type="range" data-${prefix}="${id}" min="${min}" max="${max}" step="${step}" value="${val}" style="--fill:${100 * (val - min) / (max - min)}%"></label>`;
  }
  function syncSlider(prefix, id, val, min, max, f) {
    const i = document.querySelector(`[data-${prefix}="${id}"]`); if (i) { i.value = val; i.style.setProperty("--fill", (100 * (val - min) / (max - min)) + "%"); }
    const o = document.getElementById(`${prefix}o-${id}`); if (o) o.textContent = f(val);
  }
  const seg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-${attr}="${v}" class="${String(cur) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const missing = (what) => `<main class="main"><div class="missing">The ${what} data hasn't been built yet. On the Mac: <code>cd ~/stellar-grove/tara && uv run python ../bitstaemr/apps/growing-season/build_data.py</code></div></main>`;
  const study = (slug, name) => `<a href="${RES}${slug}/">${name}</a>`;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function normals(n, seed) { const u = rng(seed), out = new Float64Array(n); for (let i = 0; i < n; i += 2) { const r = Math.sqrt(-2 * Math.log(u() || 1e-12)), t = 2 * Math.PI * u(); out[i] = r * Math.cos(t); if (i + 1 < n) out[i + 1] = r * Math.sin(t); } return out; }
  const DATE = (doy) => new Date(2026, 0, doy).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // ======================================================================= planting date (b05)
  const P = GS.pollen;
  const P_SL = [["plant", "Planting date", 91, 182, 1, DATE], ["dtf", "Days from planting to flowering", 50, 85, 1, (v) => v + " days"],
    ["peak", "Hottest-week afternoon high, normal year", 27, 37, 0.5, (v) => v.toFixed(1) + " °C"], ["rh", "Afternoon humidity at flowering", 0.25, 0.85, 0.01, (v) => Math.round(100 * v) + "%"],
    ["warm", "Warming on top of the normal year", 0, 3, 0.5, (v) => "+" + v.toFixed(1) + " °C"],
    ["spring", "Last spring frost", 75, 140, 1, DATE], ["fall", "First fall frost", 255, 320, 1, DATE]];
  const P_DEF = { plant: 121, dtf: 65, peak: 32, rh: 0.7, warm: 0, spring: 105, fall: 288 };
  const MATURE = 60; // days from flowering to a mature crop
  let PS = Object.assign({}, P_DEF);
  const SEASONS = 300, FLOWER = 14, HOT = 205;
  const NZ = normals(SEASONS * (1 + 2 * FLOWER), 260105);
  const es = (t) => 0.6108 * Math.exp(17.27 * t / (t + 237.3));
  const viab = (T, V) => P.a + P.bT * Math.max(0, T - P.cT) + P.bV * Math.max(0, V - P.cV);
  const climT = (doy, peak) => peak - 13 * (1 - Math.cos(2 * Math.PI * (doy - HOT) / 365));
  function flowering(plant, s) {
    // simulated seasons: the normal-year curve, a season-wide anomaly (sd 1 °C), daily weather (sd 2.3 °C), humidity sd 8 points (as in b05)
    let loss = 0, bad = 0; const f0 = plant + s.dtf;
    for (let k = 0; k < SEASONS; k++) {
      const o = k * (1 + 2 * FLOWER), an = NZ[o];
      for (let d = 0; d < FLOWER; d++) {
        const T = climT(f0 + d, s.peak) + s.warm + an + 2.3 * NZ[o + 1 + 2 * d];
        const h = Math.min(0.95, Math.max(0.15, s.rh + 0.08 * NZ[o + 2 + 2 * d]));
        const v = Math.min(100, Math.max(0, viab(T, es(T) * (1 - h))));
        loss += 1 - v / P.base; if (v < 0.75 * P.base) bad++;
      }
    }
    const n = SEASONS * FLOWER; return { loss: 100 * loss / n, bad: bad / n, tFlower: climT(f0 + FLOWER / 2, s.peak) + s.warm };
  }
  function renderPollen(u) {
    if (!P) { $("#view").innerHTML = missing("planting-date"); return; }
    PS = Object.assign({}, P_DEF); P_SL.forEach(([k]) => { if (u.has(k) && isFinite(+u.get(k))) PS[k] = +u.get(k); });
    $("#view").innerHTML = `
      <aside class="panel side">
        <h3 class="sub first">Your site</h3>
        ${seg("prh", [["0.7", "Humid or irrigated"], ["0.42", "Dry or rainfed"]], [0.7, 0.42].includes(PS.rh) ? PS.rh : "")}
        ${P_SL.slice(2).map(([k, l, a, b, st, f]) => sliderHTML("p", k, l, a, b, st, PS[k], f)).join("")}
        <h3 class="sub">Your crop</h3>
        ${P_SL.slice(0, 2).map(([k, l, a, b, st, f]) => sliderHTML("p", k, l, a, b, st, PS[k], f)).join("")}
        <p class="hint">Field maize. Pollen loses viability above about ${P.cT.toFixed(1)} °C or ${P.cV.toFixed(2)} kPa of vapour-pressure deficit, so the same heat hurts more in dry air. The season's weather is simulated around the normal-year curve you set.</p>
      </aside><main class="main" id="pMain"></main>`;
    updatePollen();
  }
  function updatePollen() {
    const now = flowering(PS.plant, PS), dates = [], base = [], hot = [], wTo = PS.warm > 0 ? PS.warm : 2;
    const S0 = Object.assign({}, PS, { warm: 0 }), SW = Object.assign({}, PS, { warm: wTo });
    for (let d = 91; d <= 182; d += 1) { dates.push(d); base.push(flowering(d, S0).loss); hot.push(flowering(d, SW).loss); }
    const cur = PS.warm > 0 ? hot : base, last = PS.fall - PS.dtf - MATURE, okD = (d) => d >= PS.spring && d <= last;
    const feas = cur.map((v, i) => (okD(dates[i]) ? v : Infinity)), anyOk = feas.some(isFinite), iBest = anyOk ? feas.indexOf(Math.min(...feas)) : 0;
    let i0 = iBest, i1 = iBest; while (i0 > 0 && feas[i0 - 1] <= cur[iBest] + 2) i0--; while (i1 < cur.length - 1 && feas[i1 + 1] <= cur[iBest] + 2) i1++;
    const ok = dates.slice(i0, i1 + 1), iNow = dates.indexOf(PS.plant);
    const fl = PS.plant + PS.dtf;
    // the study's own anthesis days: now vs +2 °C at the same humidity
    const D = P.days, ev = (w) => { let bad = 0, l = 0, dry = 0, nd = 0, hum = 0, nh = 0; for (const [t, h, hu] of D) { const T = t + w, v = viab(T, es(T) * (1 - h)); if (v < 0.75 * P.base) bad++; l += Math.min(100, Math.max(0, v)); if (hu) { nh++; if (v < 60) hum++; } else { nd++; if (v < 60) dry++; } } return { bad: bad / D.length, loss: 100 - l / D.length / P.base * 100, dry: dry / nd, hum: hum / nh }; };
    const e0 = ev(0), e2 = ev(P.warming);
    $("#pMain").innerHTML = `
      <div class="ph"><div><div class="kick">Planting date · heat at flowering</div>
        <h1>Plant on ${DATE(PS.plant)} and the crop flowers around ${DATE(fl)}, losing ${now.loss.toFixed(0)}% of its pollen viability</h1>
        ${okD(PS.plant) ? "" : `<div class="warnline">${PS.plant < PS.spring ? "Before your last spring frost" : `Too late: the crop wouldn't mature (about ${PS.dtf + MATURE} days) before the ${DATE(PS.fall)} frost`}</div>`}
        <div class="meta">${PS.dtf} days to flowering · normal flowering-week high ${now.tFlower.toFixed(1)} °C · humidity ${Math.round(100 * PS.rh)}%${PS.warm ? ` · +${PS.warm.toFixed(1)} °C warming` : ""} · ${SEASONS} simulated seasons</div></div></div>
      <div class="tiles">
        <div class="tile ${now.loss > 25 ? "bad" : now.loss > 12 ? "warn" : "good"}"><div class="sv">${now.loss.toFixed(0)}%</div><div class="sl">Average pollen viability lost while flowering</div></div>
        <div class="tile ${now.bad > 0.4 ? "bad" : now.bad > 0.15 ? "warn" : "good"}"><div class="sv">${Math.round(100 * now.bad)}%</div><div class="sl">Flowering days losing more than a quarter of viability</div></div>
        ${anyOk ? `<div class="tile good"><div class="sv">${DATE(ok[0])}${ok.length > 1 ? "–" + DATE(ok[ok.length - 1]) : ""}</div><div class="sl">Best planting window between your frosts (within 2 points of the least loss, ${cur[iBest].toFixed(0)}%)</div></div>`
          : `<div class="tile bad"><div class="sv">None</div><div class="sl">No planting date clears the spring frost and matures before the fall frost</div></div>`}
        <div class="tile"><div class="sv">${sg(hot[iNow] - base[iNow])} pts</div><div class="sl">Extra viability lost on your date with +${wTo.toFixed(1).replace(".0", "")} °C of warming</div></div>
      </div>
      <section class="card"><h3>Pollen viability lost, by planting date</h3><div class="chart"><canvas id="pChart"></canvas></div>
        <p class="note">Average share of pollen viability lost over the two flowering weeks, across simulated seasons; grey dates fall before your last spring frost or too late to mature (${MATURE} days after flowering) before the first fall frost. Planting so flowering misses the hottest weeks (around ${DATE(HOT)} in this model) is the main lever.</p></section>
      <section class="card"><h3>Why humidity matters</h3><div class="chart sm"><canvas id="pCurve"></canvas></div>
        <table class="tbl"><thead><tr><th>The study's flowering days</th><th class="num">Today</th><th class="num">+${P.warming.toFixed(0)} °C</th></tr></thead><tbody>
          <tr><td>Days losing more than a quarter of viability</td><td class="num">${Math.round(100 * e0.bad)}%</td><td class="num">${Math.round(100 * e2.bad)}%</td></tr>
          <tr><td>Average viability lost</td><td class="num">${e0.loss.toFixed(0)}%</td><td class="num">${e2.loss.toFixed(0)}%</td></tr>
          <tr><td>Dry-site days with viability under 60%</td><td class="num">${Math.round(100 * e0.dry)}%</td><td class="num">${Math.round(100 * e2.dry)}%</td></tr>
          <tr><td>Humid-site days with viability under 60%</td><td class="num">${Math.round(100 * e0.hum)}%</td><td class="num">${Math.round(100 * e2.hum)}%</td></tr></tbody></table>
        <p class="note">Fitted viability by afternoon high at three humidities: above ${P.cT.toFixed(1)} °C each degree costs ${Math.abs(P.bT).toFixed(1)} points, and each kPa of vapour-pressure deficit above ${P.cV.toFixed(2)} costs ${Math.abs(P.bV).toFixed(0)} more. The table re-scores the study's ${D.length} simulated flowering days, warmed at the same humidity. From ${study("b05_maize_pollen_heat_vpd", "B05 · Maize pollen at anthesis")}.</p></section>`;
    new Plot($("#pChart")).set({ x: { min: 91, max: 182, ticks: [91, 105, 121, 135, 152, 166, 182], labels: { 91: "Apr 1", 105: "Apr 15", 121: "May 1", 135: "May 15", 152: "Jun 1", 166: "Jun 15", 182: "Jul 1" }, hoverLabel: "Planted", hoverFormat: DATE },
      y: { label: "Pollen viability lost (%)", min: 0, hoverDecimals: 1, unit: "%" },
      layers: [{ name: "Normal year", x: dates, y: base, color: C.forest, width: PS.warm ? 1.6 : 2.6, dash: !!PS.warm },
               { name: `With +${wTo.toFixed(1).replace(".0", "")} °C warming`, x: dates, y: hot, color: C.terra, width: PS.warm ? 2.6 : 1.6, dash: !PS.warm }],
      bands: [...(anyOk ? [{ x0: ok[0], x1: ok[ok.length - 1] + 0.01, color: "rgba(13,122,60,.10)" }] : []),
        ...(PS.spring > 91 ? [{ x0: 91, x1: Math.min(182, PS.spring), color: "rgba(120,130,140,.13)" }] : []),
        ...(last < 182 ? [{ x0: Math.max(91, last), x1: 182, color: "rgba(120,130,140,.13)" }] : [])],
      vlines: [{ x: PS.plant, color: C.navy, label: "your date" }],
      markers: [{ x: PS.plant, y: now.loss, color: C.navy, fill: "#fff", r: 5 }] });
    const Ts = [], ys = [[], [], []], rhs = [0.42, 0.7, PS.rh];
    for (let t = 26; t <= 40.01; t += 0.25) { Ts.push(t); rhs.forEach((h, i) => ys[i].push(Math.min(100, Math.max(0, viab(t, es(t) * (1 - h)))))); }
    new Plot($("#pCurve")).set({ x: { label: "Afternoon high (°C)", min: 26, max: 40, decimals: 0, hoverLabel: "High", unit: " °C" },
      y: { label: "Pollen viability (%)", min: 0, max: 100, hoverDecimals: 0, unit: "%" },
      layers: [{ name: "Dry air (42%)", x: Ts, y: ys[0], color: C.terra, width: 2 }, { name: "Humid air (70%)", x: Ts, y: ys[1], color: C.sky, width: 2 },
               ...([0.42, 0.7].includes(PS.rh) ? [] : [{ name: `Your site (${Math.round(100 * PS.rh)}%)`, x: Ts, y: ys[2], color: C.navy, width: 2.6 }])],
      vlines: [{ x: P.cT, color: C.mist, label: P.cT.toFixed(1) + " °C" }] });
    writeHash("plant", PS, P_DEF);
  }

  // ======================================================================= solar panels (b03)
  const B = GS.panels;
  const CROPS = [["fruit_berry", "Fruit & berries"], ["leafy", "Leafy greens"], ["root_tuber", "Roots & tubers"], ["c3_cereal", "Wheat & other C3 cereals"], ["c4_maize", "Maize"]];
  const B_DEF = { crop: "leafy", shade: 25, spei: 0, size: 1 };
  let BS = Object.assign({}, B_DEF);
  const sizeF = (v) => { const h = Math.pow(2, v); return (h < 1 ? h.toFixed(2) : h < 10 ? h.toFixed(1) : h.toFixed(0)) + " ha"; };
  function yieldAt(crop, sh, spei) {
    const sl = B.slopes[crop]; let y = sl * (crop === "fruit_berry" ? Math.min(sh, B.kink) : sh);
    if (crop === "fruit_berry") y += B.above30 * Math.max(0, sh - B.kink);
    return y + B.drought * Math.max(0, -spei) * sh;
  }
  const tempAt = (lx) => B.tempA + B.tempB1 * (lx - B.tempC) + B.tempB2 * Math.max(0, lx - B.tempC);
  function maxShade(crop, spei) { let best = 0; for (let s = 0; s <= 60.001; s += 0.1) if (yieldAt(crop, s, spei) >= B.tol) best = s; return best; }
  function renderPanels(u) {
    if (!B) { $("#view").innerHTML = missing("solar-panel"); return; }
    BS = Object.assign({}, B_DEF); ["shade", "spei", "size"].forEach((k) => { if (u.has(k) && isFinite(+u.get(k))) BS[k] = +u.get(k); });
    if (CROPS.some(([k]) => k === u.get("crop"))) BS.crop = u.get("crop");
    $("#view").innerHTML = `
      <aside class="panel side">
        <h3 class="sub first">The crop under the panels</h3>
        <div class="presets">${CROPS.map(([k, l]) => `<button type="button" class="chip${BS.crop === k ? " on" : ""}" data-bc="${k}">${l}</button>`).join("")}</div>
        <h3 class="sub">The array</h3>
        ${sliderHTML("b", "shade", "Light blocked by the panels (PAR reduction)", 0, 60, 1, BS.shade, (v) => v + "%")}
        ${sliderHTML("b", "size", "Size of the installation", -2, 4, 0.1, BS.size, sizeF)}
        <h3 class="sub">The season</h3>
        ${sliderHTML("b", "spei", "Drought index (SPEI; below 0 is drier)", -2.5, 1.5, 0.1, BS.spei, (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1))}
        <p class="hint">Agrivoltaics: crops grown under solar panels. Shade costs most crops some yield, helps fruit up to about ${B.kink}% shade, and pays more in dry years.</p>
      </aside><main class="main" id="bMain"></main>`;
    updatePanels();
  }
  function updatePanels() {
    const lab = CROPS.find(([k]) => k === BS.crop)[1], y = yieldAt(BS.crop, BS.shade, BS.spei), dT = tempAt(BS.size);
    const lim = maxShade(BS.crop, 0), limNow = maxShade(BS.crop, BS.spei), zero = Math.pow(2, B.tempC - B.tempA / (B.tempB1 + B.tempB2));
    $("#bMain").innerHTML = `
      <div class="ph"><div><div class="kick">Solar panels · shade and microclimate</div>
        <h1>${lab} under ${BS.shade}% shade: ${pc(y, 1)} yield vs open field</h1>
        <div class="meta">${sizeF(BS.size)} installation · drought index ${BS.spei.toFixed(1)} · canopy ${sg(dT, 1)} °C vs open field</div></div></div>
      <div class="tiles">
        <div class="tile ${y < B.tol ? "bad" : y < 0 ? "warn" : "good"}"><div class="sv">${pc(y, 1)}</div><div class="sl">Yield vs the same crop in the open</div></div>
        <div class="tile"><div class="sv">${lim.toFixed(0)}%</div><div class="sl">Most shade within a ${Math.abs(B.tol)}% yield loss, normal year</div></div>
        <div class="tile"><div class="sv">${limNow.toFixed(0)}%</div><div class="sl">Most shade within ${Math.abs(B.tol)}% loss in this season's weather</div></div>
        <div class="tile ${dT > 0 ? "bad" : "good"}"><div class="sv">${sg(dT, 1)} °C</div><div class="sl">Canopy air temperature vs open field at this size</div></div>
      </div>
      <section class="card"><h3>Yield response to shade, by crop</h3><div class="chart"><canvas id="bChart"></canvas></div>
        <table class="tbl"><thead><tr><th>Crop</th><th class="num">Most shade at ≤${Math.abs(B.tol)}% loss, normal year</th><th class="num">This season</th></tr></thead><tbody>
          ${CROPS.map(([k, l]) => `<tr${k === BS.crop ? ' class="hl"' : ""}><td>${l}</td><td class="num">${maxShade(k, 0).toFixed(0)}%</td><td class="num">${maxShade(k, BS.spei).toFixed(0)}%</td></tr>`).join("")}</tbody></table>
        <p class="note">Fitted yield change by crop group (lines; the selected crop's paired observations as dots). In drought each % of shade is worth ${(B.drought * 1.5).toFixed(2)} yield points more at SPEI −1.5, so panels partly hedge dry years.</p></section>
      <section class="card"><h3>Bigger arrays run warmer</h3><div class="chart sm"><canvas id="bTemp"></canvas></div>
        <p class="note">Canopy cooling under panels flattens and then reverses beyond about ${Math.pow(2, B.tempC).toFixed(1)} ha; past roughly ${zero.toFixed(0)} ha the crop sits in warmer air than the open field. From ${study("b03_agrivoltaics_tipping_point", "B03 · Agrivoltaics")}.</p></section>`;
    const xs = []; for (let s = 0; s <= 60.001; s += 0.5) xs.push(s);
    const obs = B.obs.filter((o) => o[0] === BS.crop);
    new Plot($("#bChart")).set({ x: { label: "Light blocked by panels (%)", min: 0, max: 60, decimals: 0, hoverLabel: "Shade", unit: "%" },
      y: { label: "Yield vs open field (%)", hoverDecimals: 1, unit: "%" },
      layers: [{ name: lab + " (observations)", kind: "points", x: obs.map((o) => o[1]), y: obs.map((o) => o[2]), color: C.mist, size: 4, alpha: 0.8 },
        ...CROPS.map(([k, l], i) => ({ name: l, x: xs, y: xs.map((s) => yieldAt(k, s, BS.spei)), color: SER[i], width: k === BS.crop ? 3 : 1.3, alpha: k === BS.crop ? 1 : 0.6 }))],
      hlines: [{ y: 0, color: C.mist, solid: true, width: 1 }, { y: B.tol, color: C.brass, label: `${Math.abs(B.tol)}% loss`, left: true, below: true }],
      markers: [{ x: BS.shade, y, color: C.navy, fill: "#fff", r: 5 }] });
    const lx = []; for (let v = -2; v <= 4.001; v += 0.05) lx.push(v);
    new Plot($("#bTemp")).set({ x: { label: "Installation size (ha, doubling scale)", min: -2, max: 4, ticks: [-2, -1, 0, 1, 2, 3, 4], labels: { "-2": "0.25", "-1": "0.5", 0: "1", 1: "2", 2: "4", 3: "8", 4: "16" }, hoverLabel: "Size", hoverFormat: sizeF },
      y: { label: "Canopy temperature vs open (°C)", hoverDecimals: 2, unit: " °C" },
      layers: [{ name: "Fitted difference", x: lx, y: lx.map(tempAt), color: C.terra, width: 2.4 }],
      hlines: [{ y: 0, color: C.mist, solid: true, width: 1 }], markers: [{ x: BS.size, y: dT, color: C.navy, fill: "#fff", r: 5 }] });
    writeHash("panels", BS, B_DEF);
  }

  // ======================================================================= pollinators (b08)
  const BE = GS.bees;
  const E_DEF = { crop: "blueberry", v: -1 };
  let ES = Object.assign({}, E_DEF);
  const resp = (v, c) => 1 - c.D + c.D * v / (v + c.K);
  function renderBees(u) {
    if (!BE) { $("#view").innerHTML = missing("pollinator"); return; }
    ES = Object.assign({}, E_DEF);
    if (BE.crops.some((c) => c.crop === u.get("crop"))) ES.crop = u.get("crop");
    if (u.has("v") && isFinite(+u.get("v"))) ES.v = +u.get("v");
    drawBees();
  }
  function drawBees() {
    const c = BE.crops.find((x) => x.crop === ES.crop); if (ES.v < 0) ES.v = +c.vMed.toFixed(1);
    $("#view").innerHTML = `
      <aside class="panel side">
        <h3 class="sub first">The crop</h3>
        <label class="param"><span class="pl">Crop</span><select data-ec="1" class="sel">${BE.crops.slice().sort((a, b) => a.crop.localeCompare(b.crop)).map((x) => `<option value="${x.crop}"${x.crop === ES.crop ? " selected" : ""}>${nice(x.crop)}</option>`).join("")}</select></label>
        ${sliderHTML("e", "v", "Bee visits per flower per day", 0, 30, 0.1, ES.v, (v) => v.toFixed(1))}
        <div class="presets"><button type="button" class="chip sm" data-ev="${c.vMed}">Typical farm (${c.vMed.toFixed(1)})</button><button type="button" class="chip sm" data-ev="${c.vTop}">Top-tenth farm (${c.vTop.toFixed(1)})</button></div>
        <p class="hint">More hives or more wild habitat raise visits; the gain depends on how much the crop needs pollinators and how quickly extra visits stop helping.</p>
      </aside><main class="main" id="eMain"></main>`;
    updateBees();
  }
  function updateBees() {
    const c = BE.crops.find((x) => x.crop === ES.crop), now = resp(ES.v, c), top = resp(Math.max(ES.v, c.vTop), c), full = 1;
    const q = 0.9, rq = (q - 1 + c.D) / c.D, v90 = c.D <= 1 - q ? 0 : rq >= 1 ? Infinity : c.K * rq / (1 - rq);
    const gainTop = resp(c.vTop, c) / resp(c.vMed, c) - 1, ranked = BE.crops.map((x) => ({ x, g: resp(x.vTop, x) / resp(x.vMed, x) - 1 })).sort((a, b) => b.g - a.g);
    const nLim = BE.crops.filter((x) => x.limited).length;
    $("#eMain").innerHTML = `
      <div class="ph"><div><div class="kick">Pollinators · would more bees pay?</div>
        <h1>${nice(c.crop)} at ${ES.v.toFixed(1)} visits a day reaches ${Math.round(100 * now)}% of its fully pollinated yield</h1>
        <div class="meta">${Math.round(100 * c.D)}% of the yield depends on pollination · half the benefit by ${c.K.toFixed(1)} visits a flower a day · ${c.limited ? "pollination-limited" : "not pollination-limited"} in the study</div></div></div>
      <div class="tiles">
        <div class="tile ${now < 0.8 ? "bad" : now < 0.93 ? "warn" : "good"}"><div class="sv">${Math.round(100 * now)}%</div><div class="sl">Of the fully pollinated yield at these visits</div></div>
        <div class="tile"><div class="sv">${pc(100 * (top / now - 1), 0)}</div><div class="sl">Yield gain from matching the top tenth of farms (${c.vTop.toFixed(1)} visits)</div></div>
        <div class="tile"><div class="sv">${Math.round(100 * c.closable)}%</div><div class="sl">Share of this crop's yield gap that more visits could close</div></div>
        <div class="tile"><div class="sv">${v90 === 0 ? "any" : isFinite(v90) ? v90.toFixed(1) : "—"}</div><div class="sl">Visits a flower a day for 90% of the fully pollinated yield</div></div>
      </div>
      <section class="card"><h3>Yield vs bee visits: ${esc(nice(c.crop))}</h3><div class="chart"><canvas id="eChart"></canvas></div>
        <p class="note">Yield as a share of what the same farm would get fully pollinated (100%). Each dot is a simulated farm; the line is the fitted response. Farms well below the line are held back by something other than pollination: water, nutrients, management. Moving a typical farm to top-tenth visits adds ${pc(100 * gainTop, 0)} for this crop.</p></section>
      <section class="card"><h3>Where more bees pay most</h3>
        <table class="tbl"><thead><tr><th>Crop</th><th class="num">Depends on pollination</th><th class="num">Typical to top-tenth visits</th></tr></thead><tbody>
          ${ranked.slice(0, 8).map(({ x, g }) => `<tr${x.crop === c.crop ? ' class="hl"' : ""}><td><button type="button" class="link" data-ecrop="${x.crop}">${nice(x.crop)}</button></td><td class="num">${Math.round(100 * x.D)}%</td><td class="num">${pc(100 * g, 0)}</td></tr>`).join("")}</tbody></table>
        <p class="note">${nLim} of ${BE.crops.length} crops are pollination-limited (raising the typical farm to top-tenth visitation adds at least ${Math.round(100 * BE.limitedRule)}%). From ${study("b08_pollinator_limited_yield", "B08 · Pollinator-limited yield")}.</p></section>`;
    const xmax = Math.max(30, ...c.farms.map((f) => f[0])), xs = []; for (let v = 0; v <= xmax + 0.001; v += xmax / 200) xs.push(v);
    new Plot($("#eChart")).set({ x: { label: "Bee visits per flower per day", min: 0, max: xmax, decimals: 0, hoverLabel: "Visits", hoverDecimals: 1 },
      y: { label: "Yield vs fully pollinated (%)", min: 0, hoverDecimals: 0, unit: "%" },
      layers: [{ name: "Simulated farms", kind: "points", x: c.farms.map((f) => f[0]), y: c.farms.map((f) => 100 * f[1] / c.a), color: C.mist, size: 5, alpha: 0.9 },
               { name: "Fitted response", x: xs, y: xs.map((v) => 100 * resp(v, c)), color: C.forest, width: 2.6 }],
      hlines: [{ y: 100, color: C.mist, solid: true, width: 1 }],
      vlines: [{ x: c.vMed, color: C.mist, label: "typical" }, { x: c.vTop, color: C.brass, label: "top tenth", row: 1 }],
      markers: [{ x: ES.v, y: 100 * now, color: C.navy, fill: "#fff", r: 5 }] });
    writeHash("bees", ES, { crop: E_DEF.crop, v: +c.vMed.toFixed(1) });
  }

  // ======================================================================= rotation (b10)
  const R = GS.rotation;
  const PAIRS = [["maize_soybean", "Maize + soybean"], ["maize_peanut", "Maize + peanut"], ["wheat_faba", "Wheat + faba bean"], ["wheat_maize", "Wheat + maize"], ["millet_cowpea", "Millet + cowpea"]];
  const CLIM = [["tropical", "Tropical"], ["continental", "Continental"], ["temperate", "Temperate"], ["dry", "Dry"]];
  const R_DEF = { pair: "maize_soybean", n: 120, clim: "temperate", cover: "legume" };
  let RS = Object.assign({}, R_DEF);
  const ler = (p, n) => R.lerIcpt[p] + R.lerSlope * n;
  const legacy = (cl, cov) => 100 * (Math.exp(R.climate[cl] + (cov === "legume" ? R.legume : 0)) - 1);
  function renderRotation(u) {
    if (!R) { $("#view").innerHTML = missing("rotation"); return; }
    RS = Object.assign({}, R_DEF);
    if (u.has("n") && isFinite(+u.get("n"))) RS.n = +u.get("n");
    if (PAIRS.some(([k]) => k === u.get("pair"))) RS.pair = u.get("pair");
    if (CLIM.some(([k]) => k === u.get("clim"))) RS.clim = u.get("clim");
    if (["legume", "grass"].includes(u.get("cover"))) RS.cover = u.get("cover");
    $("#view").innerHTML = `
      <aside class="panel side">
        <h3 class="sub first">This season: intercrop</h3>
        <div class="presets">${PAIRS.map(([k, l]) => `<button type="button" class="chip${RS.pair === k ? " on" : ""}" data-rp="${k}">${l}</button>`).join("")}</div>
        ${sliderHTML("r", "n", "Nitrogen fertilizer", 0, 300, 10, RS.n, (v) => v + " kg/ha")}
        <h3 class="sub">Over winter: cover crop</h3>
        <span class="pl">Climate</span>
        ${seg("rc", CLIM, RS.clim)}
        ${seg("rv", [["grass", "Grass or mix"], ["legume", "Legume"]], RS.cover)}
        <p class="hint">Growing two crops together uses land more efficiently than growing them apart, most of all with little fertilizer. A cover crop's effect on the next crop depends on whether it leaves the soil short of water.</p>
      </aside><main class="main" id="rMain"></main>`;
    updateRotation();
  }
  function updateRotation() {
    const l = ler(RS.pair, RS.n), lab = PAIRS.find(([k]) => k === RS.pair)[1], n12 = (1.2 - R.lerIcpt[RS.pair]) / R.lerSlope, lg = legacy(RS.clim, RS.cover);
    const cl = CLIM.find(([k]) => k === RS.clim)[1];
    $("#rMain").innerHTML = `
      <div class="ph"><div><div class="kick">Rotation · intercrops and cover crops</div>
        <h1>${lab} at ${RS.n} kg N: one hectare does the work of ${l.toFixed(2)} hectares grown separately</h1>
        <div class="meta">land equivalent ratio ${l.toFixed(2)} · then a ${RS.cover === "legume" ? "legume" : "grass or mixed"} cover crop in a ${cl.toLowerCase()} climate: ${pc(lg)} on the next crop</div></div></div>
      <div class="tiles">
        <div class="tile ${l >= 1.2 ? "good" : l >= 1 ? "warn" : "bad"}"><div class="sv">${l.toFixed(2)}</div><div class="sl">Land equivalent ratio (above 1 beats growing the crops apart)</div></div>
        <div class="tile"><div class="sv">${Math.round(100 * (1 - 1 / l))}%</div><div class="sl">Less land for the same harvest</div></div>
        <div class="tile"><div class="sv">${n12 > 0 ? Math.round(n12) + " kg" : "none"}</div><div class="sl">Nitrogen at which the advantage falls below 1.2</div></div>
        <div class="tile ${lg >= 0 ? "good" : "bad"}"><div class="sv">${pc(lg)}</div><div class="sl">Next crop's yield after this cover crop</div></div>
      </div>
      <section class="card"><h3>Intercropping pays most with little fertilizer</h3><div class="chart"><canvas id="rChart"></canvas></div>
        <p class="note">Fitted land equivalent ratio by nitrogen input (the selected pair's simulated experiments as dots). Each 100 kg N/ha lowers it by ${Math.abs(100 * R.lerSlope).toFixed(2)}.</p></section>
      <section class="card"><h3>Cover-crop legacy on the next crop, by climate</h3><div class="chart sm"><canvas id="rBars"></canvas></div>
        <p class="note">Grass or mixed covers help in the tropics and hurt in dry and temperate zones, mostly by drawing down soil water before sowing; legumes add about ${pc(100 * (Math.exp(R.legume) - 1))} everywhere. From ${study("b10_intercropping_cover_legacy", "B10 · Intercropping and cover-crop legacies")}.</p></section>`;
    const ns = []; for (let n = 0; n <= 300; n += 5) ns.push(n);
    const obs = R.lerObs.filter((o) => o[0] === RS.pair);
    new Plot($("#rChart")).set({ x: { label: "Nitrogen fertilizer (kg/ha)", min: 0, max: 300, decimals: 0, hoverLabel: "N", unit: " kg" },
      y: { label: "Land equivalent ratio", min: 0.9, hoverDecimals: 2 },
      layers: [{ name: lab + " (experiments)", kind: "points", x: obs.map((o) => o[1]), y: obs.map((o) => o[2]), color: C.mist, size: 5, alpha: 0.9 },
        ...PAIRS.map(([k, pl], i) => ({ name: pl, x: ns, y: ns.map((n) => ler(k, n)), color: SER[i], width: k === RS.pair ? 3 : 1.3, alpha: k === RS.pair ? 1 : 0.6 }))],
      hlines: [{ y: 1, color: C.mist, solid: true, width: 1, label: "no advantage", left: true }, { y: 1.2, color: C.brass, label: "1.2", left: true }],
      markers: [{ x: RS.n, y: l, color: C.navy, fill: "#fff", r: 5 }] });
    const xs = [], ys = [], cols = [], labels = {}, hl = {};
    CLIM.forEach(([k, cl2], i) => { labels[i * 3 + 0.5] = cl2; ["grass", "legume"].forEach((cv, j) => { const x = i * 3 + j; xs.push(x); ys.push(legacy(k, cv)); cols.push(k === RS.clim && cv === RS.cover ? C.navy : cv === "legume" ? C.forest : C.brass); hl[x] = cl2 + ", " + (cv === "legume" ? "legume" : "grass or mix"); }); });
    new Plot($("#rBars")).set({ x: { min: -0.7, max: 10.7, ticks: [0.5, 3.5, 6.5, 9.5], labels, hoverLabel: "Cover", hoverFormat: (x) => hl[x] },
      y: { label: "Next crop's yield (%)", hoverDecimals: 1, unit: "%" },
      layers: [{ name: "Grass or mix", kind: "bars", x: xs, y: ys, color: C.brass, colors: cols }, { name: "Legume", kind: "bars", x: [], y: [], color: C.forest }, { name: "Your choice", kind: "bars", x: [], y: [], color: C.navy }],
      hlines: [{ y: 0, color: C.mist, solid: true, width: 1 }] });
    writeHash("rotation", RS, R_DEF);
  }

  // ======================================================================= shell
  function writeHash(tab, s, d) {
    const u = new URLSearchParams({ tab });
    Object.keys(d).forEach((k) => { if (s[k] !== d[k]) u.set(k, typeof s[k] === "number" ? +s[k].toFixed(4) : s[k]); });
    history.replaceState(null, "", "#/?" + u.toString());
  }
  const TABS = { plant: renderPollen, panels: renderPanels, bees: renderBees, rotation: renderRotation };
  function route() {
    const u = new URLSearchParams(location.hash.replace(/^#\/?\??/, "")), tab = TABS[u.get("tab")] ? u.get("tab") : "plant";
    document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    TABS[tab](u);
  }
  document.addEventListener("input", (e) => {
    const t = e.target, ds = t.dataset;
    if (ds.p) { const d = P_SL.find((x) => x[0] === ds.p); PS[ds.p] = +t.value; syncSlider("p", ds.p, PS[ds.p], d[2], d[3], d[5]);
      if (ds.p === "rh") document.querySelectorAll("[data-prh]").forEach((b) => b.classList.toggle("on", +b.dataset.prh === PS.rh)); updatePollen(); }
    else if (ds.b) { BS[ds.b] = +t.value; syncSlider("b", ds.b, BS[ds.b], +t.min, +t.max, ds.b === "size" ? sizeF : ds.b === "shade" ? (v) => v + "%" : (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1)); updatePanels(); }
    else if (ds.e) { ES.v = +t.value; syncSlider("e", "v", ES.v, 0, 30, (v) => v.toFixed(1)); updateBees(); }
    else if (ds.r) { RS.n = +t.value; syncSlider("r", "n", RS.n, 0, 300, (v) => v + " kg/ha"); updateRotation(); }
  });
  document.addEventListener("change", (e) => { if (e.target.dataset.ec) { ES.crop = e.target.value; ES.v = -1; drawBees(); } });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return; const ds = t.dataset;
    const on = (attr) => document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.classList.toggle("on", b === t));
    if (ds.tab) { history.pushState(null, "", "#/?tab=" + ds.tab); route(); }
    else if (ds.prh) { PS.rh = +ds.prh; on("prh"); syncSlider("p", "rh", PS.rh, 0.25, 0.85, P_SL[3][5]); updatePollen(); }
    else if (ds.bc) { BS.crop = ds.bc; on("bc"); updatePanels(); }
    else if (ds.ev) { ES.v = +(+ds.ev).toFixed(1); syncSlider("e", "v", ES.v, 0, 30, (v) => v.toFixed(1)); updateBees(); }
    else if (ds.ecrop) { ES.crop = ds.ecrop; ES.v = -1; drawBees(); }
    else if (ds.rp) { RS.pair = ds.rp; on("rp"); updateRotation(); }
    else if (ds.rc) { RS.clim = ds.rc; on("rc"); updateRotation(); }
    else if (ds.rv) { RS.cover = ds.rv; on("rv"); updateRotation(); }
  });
  window.addEventListener("hashchange", route); window.addEventListener("popstate", route);
  $("#gen").textContent = GS.built ? `Built ${GS.built}.` : "";
  route();
})();
