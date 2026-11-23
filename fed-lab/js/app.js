/* Fed Policy Lab. Data: window.FED (monthly, from FRED via build_data.py).
   Policy rules (Fed Monetary Policy Report form): i = r* + π + a(π − π*) + θ(u* − u), with π = core PCE inflation over
   12 months and u* the CBO natural rate; optional inertia i_t = ρ·i_{t−1} + (1 − ρ)·max(rule_t, 0.125).
   Recession signal (Estrella–Mishkin): probit of "in recession h months from now" on the 10-year minus 3-month spread. */
"use strict";
(function () {
  const F = window.FED, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const N = F.months.length;
  const X = F.months.map((m) => +m.slice(0, 4) + (+m.slice(5, 7) - 1) / 12);  // fractional years
  const MON = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const fx = (v, d = 2) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));
  const signed = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);

  // recessions as [x0, x1] bands
  const BANDS = []; (function () { let a = null; F.rec.forEach((r, i) => { if (r === 1 && a == null) a = X[i]; if (r !== 1 && a != null) { BANDS.push({ x0: a, x1: X[i] }); a = null; } });
    if (a != null) BANDS.push({ x0: a, x1: X[N - 1] + 1 / 12 }); })();
  const bandsIn = (x0) => BANDS.filter((b) => b.x1 > x0).map((b) => ({ x0: Math.max(b.x0, x0), x1: b.x1, color: "rgba(6,47,79,.09)" }));

  // ---------------------------------------------------------------- policy rules
  const RULES = {
    taylor: { label: "Taylor (1993)", rs: 0.5, tgt: 2, a: 0.5, th: 1, rho: 0 },
    balanced: { label: "Balanced approach", rs: 0.5, tgt: 2, a: 0.5, th: 2, rho: 0 },
    inertial: { label: "Inertial (balanced, smoothed)", rs: 0.5, tgt: 2, a: 0.5, th: 2, rho: 0.85 },
    hawk: { label: "Hawk", rs: 1.0, tgt: 2, a: 1.0, th: 0.5, rho: 0 },
    dove: { label: "Dove", rs: 0, tgt: 2.5, a: 0.25, th: 2.5, rho: 0 },
  };
  const R_DEF = Object.assign({ start: 2000, view: "rate" }, RULES.balanced); delete R_DEF.label;
  const START = [1990, 2000, 2008, 2019];
  let R = Object.assign({}, R_DEF);
  const valid = []; for (let i = 0; i < N; i++) if (F.ff[i] != null && F.pi[i] != null && F.u[i] != null && F.un[i] != null && X[i] >= 1990) valid.push(i);

  function ruleSeries(p) {
    const raw = valid.map((i) => p.rs + F.pi[i] + p.a * (F.pi[i] - p.tgt) + p.th * (F.un[i] - F.u[i]));
    if (!p.rho) return { raw, path: raw };
    const path = [F.ff[valid[0]]];
    for (let k = 1; k < raw.length; k++) path.push(p.rho * path[k - 1] + (1 - p.rho) * Math.max(raw[k], 0.125));
    return { raw, path };
  }
  function ruleStats(p) {
    const { raw, path } = ruleSeries(p), gap = path.map((v, k) => v - F.ff[valid[k]]);
    let worst = -Infinity, wi = -1, behind = 0;
    valid.forEach((i, k) => { if (X[i] >= 2021 && X[i] < 2024) { if (gap[k] > worst) { worst = gap[k]; wi = i; } if (gap[k] > 1) behind++; } });
    const last = valid.length - 1, li = valid[last];
    return { raw, path, gap, worst, wi, behind, now: path[last], ff: F.ff[li], gapNow: gap[last], li };
  }
  const RS = [["rs", "Neutral real rate r*", -1, 3, 0.25, (v) => v.toFixed(2) + "%"], ["tgt", "Inflation target π*", 1, 4, 0.25, (v) => v.toFixed(2) + "%"],
    ["a", "Response to inflation gap", 0, 1.5, 0.05, (v) => v.toFixed(2)], ["th", "Response to unemployment gap", 0, 3, 0.25, (v) => v.toFixed(2)],
    ["rho", "Inertia (smoothing)", 0, 0.95, 0.05, (v) => (v ? v.toFixed(2) : "none")]];

  function renderRules(u) {
    R = Object.assign({}, R_DEF);
    RS.forEach(([k]) => { if (u.has(k) && isFinite(+u.get(k))) R[k] = +u.get(k); });
    if (START.includes(+u.get("start"))) R.start = +u.get("start");
    if (["rate", "gap", "inputs"].includes(u.get("view"))) R.view = u.get("view");
    $("#view").innerHTML = `
      <aside class="panel side">
        <div class="lbl">Start from a rule</div>
        <div class="presets">${Object.entries(RULES).map(([k, r]) => `<button type="button" class="chip" data-rule="${k}">${esc(r.label)}</button>`).join("")}</div>
        <h3 class="sub">Your rule</h3>
        ${RS.map(([k, l, mn, mx, st, f]) => `<label class="param"><span class="pl">${l}</span><output id="o-${k}">${f(R[k])}</output>
          <input type="range" data-r="${k}" min="${mn}" max="${mx}" step="${st}" value="${R[k]}" style="--fill:${100 * (R[k] - mn) / (mx - mn)}%"></label>`).join("")}
        <div class="formula" id="formula"></div>
        <p class="hint">Inflation is core PCE over 12 months; the unemployment gap uses CBO's natural rate. Inertia moves the rate only part of the way to the rule each month, as the Fed tends to.</p>
      </aside>
      <main class="main" id="rMain"></main>`;
    updateRules();
  }
  function updateRules() {
    const S = ruleStats(R), li = S.li, match = Object.keys(RULES).find((k) => ["rs", "tgt", "a", "th", "rho"].every((x) => Math.abs(RULES[k][x] - R[x]) < 1e-9));
    document.querySelectorAll("[data-rule]").forEach((b) => b.classList.toggle("on", b.dataset.rule === match));
    $("#formula").innerHTML = `<b>i</b> = ${R.rs.toFixed(2)} + π + ${R.a.toFixed(2)}(π − ${R.tgt.toFixed(2)}) + ${R.th.toFixed(2)}(u* − u)${R.rho ? `<br>smoothed with ρ = ${R.rho.toFixed(2)}` : ""}`;
    $("#rMain").innerHTML = `
      <div class="ph"><div><div class="kick">Policy rules · ${match ? esc(RULES[match].label) : "your own rule"}</div>
        <h1>The rule says ${fx(S.now)}%. The Fed is at ${fx(S.ff)}%.</h1>
        <div class="meta">${MON(F.months[li])} · core PCE inflation ${fx(F.pi[li], 1)}% · unemployment ${fx(F.u[li], 1)}% vs a natural rate of ${fx(F.un[li], 1)}%</div></div></div>
      <div class="tiles">
        <div class="tile ${Math.abs(S.gapNow) < 0.5 ? "good" : "warn"}"><div class="sv">${signed(S.gapNow, 2)} pts</div><div class="sl">Rule minus the actual rate today (${S.gapNow > 0 ? "policy looser than the rule" : "policy tighter than the rule"})</div></div>
        <div class="tile bad"><div class="sv">${signed(S.worst, 1)} pts</div><div class="sl">Worst shortfall in 2021–23 (${S.wi >= 0 ? MON(F.months[S.wi]) : "—"})</div></div>
        <div class="tile"><div class="sv">${S.behind} months</div><div class="sl">With policy more than a point looser than the rule, 2021–23</div></div>
      </div>
      <section class="card"><div class="tabs">
        ${[["rate", "Rule vs the funds rate"], ["gap", "Behind the curve"], ["inputs", "Inflation and jobs"]].map(([k, l]) => `<button type="button" data-rv="${k}" class="${R.view === k ? "on" : ""}">${l}</button>`).join("")}
        <span class="spacer"></span>${START.map((y) => `<button type="button" class="chip sm ${R.start === y ? "on" : ""}" data-start="${y}">${y}–now</button>`).join("")}</div>
        <div class="chart"><canvas id="rChart"></canvas></div><p class="note" id="rNote"></p></section>`;
    drawRules(S);
    writeHash("rules", R, R_DEF);
  }
  function drawRules(S) {
    const ks = valid.map((i, k) => k).filter((k) => X[valid[k]] >= R.start), xs = ks.map((k) => X[valid[k]]);
    const xa = { label: "", min: xs[0], max: xs[xs.length - 1] + 0.1, ticks: ticksFor(R.start), plain: true, hoverLabel: "Month" };
    const plot = new Plot($("#rChart"));
    const hoverX = (layers) => layers;
    if (R.view === "rate") {
      const layers = [{ name: "Fed funds rate", x: xs, y: ks.map((k) => F.ff[valid[k]]), color: SG.navy, width: 2.5 },
        { name: R.rho ? "Your rule (smoothed)" : "Your rule", x: xs, y: ks.map((k) => S.path[k]), color: "#A54A28", width: 2.2 }];
      if (R.rho) layers.push({ name: "Unsmoothed rule", x: xs, y: ks.map((k) => S.raw[k]), color: "#C9A27A", width: 1.2, dash: true });
      plot.set({ x: xa, y: { label: "Percent", hoverDecimals: 2, unit: "%" }, layers: hoverX(layers), bands: bandsIn(R.start), hlines: [{ y: 0, color: "#9FB6C6", solid: true, width: 1 }] });
      $("#rNote").textContent = "Shaded: NBER recessions. A rule can go below zero when the economy is weak; the actual rate can't (by much), which is why the Fed used asset purchases in 2009–15 and 2020–21.";
    } else if (R.view === "gap") {
      plot.set({ x: xa, y: { label: "Rule minus actual (points)", hoverDecimals: 2 }, bands: bandsIn(R.start),
        layers: [{ name: "Rule minus actual", x: xs, y: ks.map((k) => S.gap[k]), color: "#A54A28", width: 2.2 }],
        hlines: [{ y: 0, color: SG.navy, solid: true, width: 1.2 }, { y: 1, color: "#A97E2C", label: "1 point behind" }] });
      $("#rNote").textContent = "Above zero: the rule called for a higher rate than the Fed set (policy looser than the rule). The research counts months more than a point above as 'behind the curve'.";
    } else {
      plot.set({ x: xa, y: { label: "Percent", hoverDecimals: 2, unit: "%" }, bands: bandsIn(R.start),
        layers: [{ name: "Core PCE inflation", x: xs, y: ks.map((k) => F.pi[valid[k]]), color: "#A54A28", width: 2.2 },
                 { name: "Unemployment", x: xs, y: ks.map((k) => F.u[valid[k]]), color: SG.navy, width: 2.2 },
                 { name: "Natural rate (CBO)", x: xs, y: ks.map((k) => F.un[valid[k]]), color: "#9FB6C6", width: 1.6, dash: true }],
        hlines: [{ y: R.tgt, color: "#A97E2C", label: R.tgt.toFixed(2) + "% target" }] });
      $("#rNote").textContent = "The two gaps the rule reacts to: inflation against the target, and unemployment against its natural rate.";
    }
  }
  function ticksFor(start) { const step = start >= 2015 ? 1 : start >= 2005 ? 2 : 5, t = []; for (let y = Math.ceil(start / step) * step; y <= X[N - 1]; y += step) t.push(y); return t; }

  // ---------------------------------------------------------------- recession signal
  const C_DEF = { h: 12, view: "spread" };
  let C = Object.assign({}, C_DEF);
  const recLast = (function () { const m = F.lastObs.USREC; return F.months.indexOf(m); })();
  const sIdx = []; for (let i = 0; i < N; i++) if (F.spread[i] != null && X[i] >= 1982) sIdx.push(i);
  function phi(z) { return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); }
  function Phi(z) {  // Abramowitz–Stegun 7.1.26 erf
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }
  function probit(xs, ys) {
    let a = 0, b = 0;
    for (let it = 0; it < 50; it++) {
      let s00 = 0, s01 = 0, s11 = 0, t0 = 0, t1 = 0;
      for (let k = 0; k < xs.length; k++) {
        const e = a + b * xs[k], p = Math.min(1 - 1e-10, Math.max(1e-10, Phi(e))), d = Math.max(phi(e), 1e-12);
        const w = d * d / (p * (1 - p)), z = e + (ys[k] - p) / d;
        s00 += w; s01 += w * xs[k]; s11 += w * xs[k] * xs[k]; t0 += w * z; t1 += w * z * xs[k];
      }
      const det = s00 * s11 - s01 * s01, na = (s11 * t0 - s01 * t1) / det, nb = (s00 * t1 - s01 * t0) / det;
      const done = Math.abs(na - a) + Math.abs(nb - b) < 1e-10; a = na; b = nb; if (done) break;
    }
    return { a, b };
  }
  function auc(ps, ys) {
    const pos = [], neg = []; ps.forEach((p, k) => (ys[k] ? pos : neg).push(p));
    let s = 0; pos.forEach((p) => neg.forEach((q) => { s += p > q ? 1 : p === q ? 0.5 : 0; }));
    return pos.length && neg.length ? s / (pos.length * neg.length) : NaN;
  }
  function curveFit(h) {
    const xs = [], ys = [], at = [];
    sIdx.forEach((i) => { const j = i + h; if (j <= recLast && F.rec[j] != null) { xs.push(F.spread[i]); ys.push(F.rec[j]); at.push(i); } });
    const m = probit(xs, ys), ps = xs.map((x) => Phi(m.a + m.b * x));
    return Object.assign(m, { n: xs.length, auc: auc(ps, ys), at });
  }
  function episodes() {
    const eps = []; let a = null, prev = null;
    sIdx.forEach((i) => { const neg = F.spread[i] < 0; if (neg && a == null) a = i; if (!neg && a != null) { eps.push([a, prev]); a = null; } prev = i; });
    if (a != null) eps.push([a, sIdx[sIdx.length - 1]]);
    const merged = [];
    eps.forEach(([s0, s1]) => { if (merged.length && s0 - merged[merged.length - 1][1] <= 3) merged[merged.length - 1][1] = s1; else merged.push([s0, s1]); });
    const starts = []; for (let i = 1; i <= recLast; i++) if (F.rec[i] === 1 && F.rec[i - 1] === 0) starts.push(i);
    return merged.map(([s0, s1]) => {
      let mn = Infinity; for (let i = s0; i <= s1; i++) if (F.spread[i] != null) mn = Math.min(mn, F.spread[i]);
      const nxt = starts.find((r) => r > s0), lead = nxt != null ? nxt - s0 : null, followed = lead != null && lead <= 24;
      return { s0, s1, months: s1 - s0 + 1, min: mn, rec: followed ? nxt : null, lead: followed ? lead : null, open: recLast - s0 < 24 && !followed };
    }).filter((e) => e.months >= 2);
  }
  const EPS = episodes();

  function renderCurve(u) {
    C = Object.assign({}, C_DEF);
    if (u.has("h") && isFinite(+u.get("h"))) C.h = Math.max(3, Math.min(24, Math.round(+u.get("h"))));
    if (["spread", "prob", "curve"].includes(u.get("view"))) C.view = u.get("view");
    $("#view").innerHTML = `
      <aside class="panel side">
        <h3 class="sub first">The question</h3>
        <label class="param"><span class="pl">Will we be in recession in…</span><output id="o-h">${C.h} months</output>
          <input type="range" data-c="h" min="3" max="24" step="1" value="${C.h}" style="--fill:${100 * (C.h - 3) / 21}%"></label>
        <p class="hint">The model is refitted on every move: a probit of "in recession ${C.h} months from now" on the 10-year minus 3-month Treasury spread, 1982 to the latest month whose outcome is known.</p>
        <div class="formula" id="cformula"></div>
      </aside>
      <main class="main" id="cMain"></main>`;
    updateCurve();
  }
  function updateCurve() {
    const M = curveFit(C.h), li = sIdx[sIdx.length - 1], sNow = F.spread[li], pNow = Phi(M.a + M.b * sNow);
    const closed = EPS.filter((e) => !e.open), called = closed.filter((e) => e.rec != null).length;
    $("#o-h").textContent = C.h + " months";
    $("#cformula").innerHTML = `P(recession in ${C.h} months) = Φ(${M.a.toFixed(2)} ${M.b < 0 ? "−" : "+"} ${Math.abs(M.b).toFixed(2)} × spread)<br>${M.n} months · in-sample AUC ${M.auc.toFixed(2)}`;
    $("#cMain").innerHTML = `
      <div class="ph"><div><div class="kick">Recession signal · yield curve</div>
        <h1>${Math.round(100 * pNow)}% chance of a recession ${C.h} months from now</h1>
        <div class="meta">${MON(F.months[li])} spread: ${signed(sNow, 2)} points (10-year minus 3-month Treasury, monthly average) · recession dates through ${MON(F.lastObs.USREC)}</div></div></div>
      <div class="tiles">
        <div class="tile"><div class="sv">${signed(sNow, 2)}</div><div class="sl">Today's spread (negative = inverted)</div></div>
        <div class="tile"><div class="sv">${M.b.toFixed(2)}</div><div class="sl">Probit slope: each point of spread moves the odds this much</div></div>
        <div class="tile"><div class="sv">${M.auc.toFixed(2)}</div><div class="sl">In-sample AUC (1 = perfect ranking, 0.5 = coin flip)</div></div>
        <div class="tile"><div class="sv">${called} of ${closed.length}</div><div class="sl">Completed inversions followed by a recession within 24 months</div></div>
      </div>
      <section class="card"><div class="tabs">
        ${[["spread", "Spread and recessions"], ["prob", "Probability over time"], ["curve", "Probability by spread"]].map(([k, l]) => `<button type="button" data-cv="${k}" class="${C.view === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="chart"><canvas id="cChart"></canvas></div><p class="note" id="cNote"></p></section>
      <section class="card"><h3>Every inversion since 1982</h3><div class="tw"><table class="tbl"><thead><tr><th>Inverted</th><th>Months</th><th>Deepest</th><th>What followed</th></tr></thead><tbody>
        ${EPS.map((e) => `<tr><td>${MON(F.months[e.s0])} – ${MON(F.months[e.s1])}</td><td>${e.months}</td><td>${signed(e.min, 2)}</td>
          <td class="${e.rec != null ? "rec" : e.open ? "" : "miss"}">${e.rec != null ? `Recession from ${MON(F.months[e.rec])} (${e.lead} months later)` : e.open ? "Too soon to tell" : "No recession within 24 months"}</td></tr>`).join("")}
        </tbody></table></div>
        <p class="note">An inversion interrupted for three months or less counts as one episode, as in the <a href="https://research.stellargrove.com/econ/yield_curve/">yield-curve research</a>. In-sample fits flatter the signal; the research's out-of-sample AUC at 12 months is 0.69, and its probabilities run high in real time, so read the level as a ranking of risk.</p></section>`;
    drawCurve(M, sNow, pNow);
    writeHash("curve", C, C_DEF);
  }
  function drawCurve(M, sNow, pNow) {
    const plot = new Plot($("#cChart"));
    const xs = sIdx.map((i) => X[i]), xa = { label: "", min: 1982, max: X[N - 1] + 0.1, ticks: ticksFor(1985), plain: true, hoverLabel: "Month" };
    if (C.view === "spread") {
      plot.set({ x: xa, y: { label: "Spread (points)", hoverDecimals: 2 }, bands: bandsIn(1982),
        layers: [{ name: "10-year minus 3-month", x: xs, y: sIdx.map((i) => F.spread[i]), color: SG.navy, width: 1.8 }],
        hlines: [{ y: 0, color: "#A54A28", solid: true, width: 1.2, label: "inverted below" }] });
      $("#cNote").textContent = "Shaded: NBER recessions. Lead times from the start of an inversion to a recession have ranged from about 9 to 17 months.";
    } else if (C.view === "prob") {
      plot.set({ x: xa, y: { label: `Chance of recession in ${C.h} months (%)`, min: 0, max: 100, hoverDecimals: 0, unit: "%" }, bands: bandsIn(1982),
        layers: [{ name: "Model probability", x: xs, y: sIdx.map((i) => 100 * Phi(M.a + M.b * F.spread[i])), color: "#A54A28", width: 2 }] });
      $("#cNote").textContent = `The probability the model gives at each month, for a recession ${C.h} months later. Compare where it rises with the shaded recessions ${C.h} months to the right.`;
    } else {
      const sx = []; for (let s = -3; s <= 4.001; s += 0.05) sx.push(+s.toFixed(2));
      plot.set({ x: { label: "Spread (points)", min: -3, max: 4, hoverLabel: "Spread", hoverDecimals: 2 }, y: { label: "Chance of recession (%)", min: 0, max: 100, hoverDecimals: 0, unit: "%" },
        layers: [{ name: `In recession ${C.h} months later`, x: sx, y: sx.map((s) => 100 * Phi(M.a + M.b * s)), color: SG.navy, width: 3 }],
        vlines: [{ x: 0, color: "#9FB6C6", label: "inverted ←", row: 2 }],
        markers: [{ x: sNow, y: 100 * pNow, color: SG.navy, fill: SG.gold, r: 6, label: "today " + Math.round(100 * pNow) + "%" }] });
      $("#cNote").textContent = "The fitted curve: a deeper inversion means a higher chance of recession at your chosen horizon.";
    }
  }

  // ---------------------------------------------------------------- routing and events
  function writeHash(tab, s, d) {
    const u = new URLSearchParams({ tab });
    Object.keys(d).forEach((k) => { if (s[k] !== d[k]) u.set(k, s[k]); });
    history.replaceState(null, "", "#/?" + u.toString());
  }
  function route() {
    const u = new URLSearchParams(location.hash.replace(/^#\/?\??/, "")), tab = u.get("tab") === "curve" ? "curve" : "rules";
    document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    (tab === "curve" ? renderCurve : renderRules)(u);
  }
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.r) { const d = RS.find((x) => x[0] === t.dataset.r); R[d[0]] = +t.value; $("#o-" + d[0]).textContent = d[5](R[d[0]]);
      t.style.setProperty("--fill", (100 * (R[d[0]] - d[2]) / (d[3] - d[2])) + "%"); updateRules(); }
    else if (t.dataset.c === "h") { C.h = +t.value; t.style.setProperty("--fill", (100 * (C.h - 3) / 21) + "%"); updateCurve(); }
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.tab) { history.pushState(null, "", "#/?tab=" + t.dataset.tab); route(); }
    else if (t.dataset.rule) { Object.assign(R, RULES[t.dataset.rule]); delete R.label;
      RS.forEach(([k, , mn, mx, , f]) => { const i = document.querySelector(`[data-r="${k}"]`); i.value = R[k]; i.style.setProperty("--fill", (100 * (R[k] - mn) / (mx - mn)) + "%"); $("#o-" + k).textContent = f(R[k]); });
      updateRules(); }
    else if (t.dataset.start) { R.start = +t.dataset.start; updateRules(); }
    else if (t.dataset.rv) { R.view = t.dataset.rv; updateRules(); }
    else if (t.dataset.cv) { C.view = t.dataset.cv; updateCurve(); }
  });
  window.addEventListener("hashchange", route);
  window.addEventListener("popstate", route);
  $("#gen").textContent = `Data through ${MON(F.lastObs.FEDFUNDS)} (fed funds), ${MON(F.lastObs.PCEPILFE)} (inflation), ${MON(F.lastObs.T10Y3M)} (spread); built ${F.built}.`;
  route();
})();
