/* Modelling Playground: the models. Equations and defaults match the worked explainers in
   tara/books/concrete_mathematics (research.stellargrove.com/explainers/), where each is derived and checked. */
"use strict";
const M = {};
M.linspace = (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? a : a + (b - a) * i / (n - 1)));
M.range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
M.fact = (k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
M.rk4 = (f, y0, t0, t1, n) => {
  const h = (t1 - t0) / n, d = y0.length, t = [t0], y = y0.map((v) => [v]);
  let cur = y0.slice();
  for (let i = 0; i < n; i++) {
    const tt = t0 + i * h, add = (a, b, s) => a.map((v, j) => v + s * b[j]);
    const k1 = f(tt, cur), k2 = f(tt + h / 2, add(cur, k1, h / 2)), k3 = f(tt + h / 2, add(cur, k2, h / 2)), k4 = f(tt + h, add(cur, k3, h));
    cur = cur.map((v, j) => Math.max(0, v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])));
    t.push(tt + h);
    for (let j = 0; j < d; j++) y[j].push(cur[j]);
  }
  return { t, y };
};
M.root = (g, a, b) => {
  let fa = g(a);
  for (let i = 0; i < 200; i++) { const m = (a + b) / 2, fm = g(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
};
M.rng = (seed) => { let s = seed >>> 0 || 1; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// Vector field samples on a grid for phase planes; arrow length scaled by speed (log-compressed).
M.field = (f, x0, x1, y0, y1, nx, ny) => {
  const out = { kind: "field", x: [], y: [], u: [], v: [], m: [] };
  const sx = (x1 - x0), sy = (y1 - y0);
  let mags = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = x0 + (i + 0.5) / nx * sx, y = y0 + (j + 0.5) / ny * sy, d = f(0, [x, y]);
    const u = d[0] / sx, v = d[1] / sy, m = Math.hypot(u, v);
    out.x.push(x); out.y.push(y); out.u.push(u); out.v.push(v); mags.push(m);
  }
  const mx = Math.max.apply(null, mags) || 1;
  out.m = mags.map((m) => (m > 0 ? 0.35 + 0.65 * Math.log1p(9 * m / mx) / Math.log(10) : 0));
  return out;
};
const C = SG.series;

const MODELS = [
  // ---------------------------------------------------------------------------------------------------
  {
    id: "logistic", title: "From order to chaos", short: "Logistic map",
    chapter: "Chapter 10 · Dynamical systems", explainer: "ch10_logistic_map",
    question: "One equation, one dial: how does a simple population rule produce cycles and chaos?",
    params: [
      { id: "r", label: "Growth rate r", min: 2.5, max: 4, step: 0.005, value: 3.2, dec: 3 },
      { id: "x0", label: "Starting population", min: 0.01, max: 0.99, step: 0.01, value: 0.2, dec: 2 },
    ],
    presets: [
      { label: "Settles", values: { r: 2.8 } }, { label: "2-cycle", values: { r: 3.2 } },
      { label: "4-cycle", values: { r: 3.5 } }, { label: "Chaos", values: { r: 3.9 } },
      { label: "Window of order", values: { r: 3.83 } }, { label: "Full chaos", values: { r: 4 } },
    ],
    hint: "Watch the dashed orbit, started just 0.001 away. In chaos the two part ways within a few years. On the bifurcation view, click anywhere to jump to that r.",
    views: [
      { id: "time", label: "Over time", spec(p) {
        const orbit = (x) => { const o = [x]; for (let i = 0; i < 60; i++) { x = p.r * x * (1 - x); o.push(x); } return o; };
        const n = M.range(0, 60);
        return { x: { label: "Year", decimals: 0, min: 0, max: 60 }, y: { label: "Population x", min: 0, max: 1 },
          layers: [{ name: "Start x0", x: n, y: orbit(p.x0), color: C[0] },
                   { name: "Start x0 + 0.001", x: n, y: orbit(p.x0 + 0.001), color: C[1], dash: true, width: 1.6 }] };
      } },
      { id: "cobweb", label: "Cobweb", spec(p) {
        const xs = M.linspace(0, 1, 201), cx = [], cy = [];
        let x = p.x0; cx.push(x); cy.push(0);
        for (let i = 0; i < 80; i++) { const y = p.r * x * (1 - x); cx.push(x, y); cy.push(y, y); x = y; }
        return { hoverMode: "xy", x: { label: "This year x", min: 0, max: 1 }, y: { label: "Next year", min: 0, max: 1 },
          layers: [{ name: "Next = r·x(1 − x)", x: xs, y: xs.map((v) => p.r * v * (1 - v)), color: C[0], width: 2.5, hover: false },
                   { name: "No change", x: [0, 1], y: [0, 1], color: "#9FB6C6", dash: true, width: 1.5, hover: false },
                   { name: "Orbit", x: cx, y: cy, color: C[1], width: 1.3, alpha: 0.9, hover: false }],
          markers: [{ x: p.x0, y: 0, color: C[1], r: 4 }] };
      } },
      { id: "bif", label: "Bifurcation", spec(p, set) {
        if (!M._bif) {
          const X = [], Y = [];
          for (let k = 0; k <= 700; k++) {
            const r = 2.5 + 1.5 * k / 700; let x = 0.3;
            for (let i = 0; i < 400; i++) x = r * x * (1 - x);
            for (let i = 0; i < 120; i++) { x = r * x * (1 - x); X.push(r); Y.push(x); }
          }
          M._bif = { X, Y };
        }
        return { hoverMode: "xy", x: { label: "Growth rate r", min: 2.5, max: 4, hoverLabel: "r" },
          y: { label: "Long-run population", min: 0, max: 1, hoverLabel: "x" },
          layers: [{ kind: "points", x: M._bif.X, y: M._bif.Y, color: SG.navy, alpha: 0.35, size: 1.3 }],
          vlines: [{ x: p.r, color: SG.terracotta, solid: true, width: 2, label: "r = " + p.r.toFixed(3) }],
          onClick: (r) => set({ r }), clickHint: "Click to set r here" };
      } },
    ],
    stats(p) {
      let x = 0.2, i, s = 0;
      for (i = 0; i < 1000; i++) x = p.r * x * (1 - x);
      for (i = 0; i < 20000; i++) { x = p.r * x * (1 - x); s += Math.log(Math.abs(p.r * (1 - 2 * x)) + 1e-300); }
      const lyap = s / 20000;
      let y = 0.2; for (i = 0; i < 5000; i++) y = p.r * y * (1 - y);
      const o = [y]; for (i = 0; i < 64; i++) { y = p.r * y * (1 - y); o.push(y); }
      let per = 0; for (i = 1; i <= 64; i++) if (Math.abs(o[i] - o[0]) < 1e-7) { per = i; break; }
      return [["Long-run pattern", per === 1 ? "steady" : per ? per + "-cycle" : "chaotic"],
              ["Lyapunov exponent", lyap, "", 3, lyap > 0 ? "bad" : "good"],
              ["Fixed point 1 − 1/r", 1 - 1 / p.r, "", 3]];
    },
  },
  // ---------------------------------------------------------------------------------------------------
  {
    id: "predprey", title: "Predators, prey and enrichment", short: "Predator–prey",
    chapter: "Chapter 10 · Dynamical systems", explainer: "ch10_predator_prey",
    question: "Feed the prey more and the system can tip into wild boom–bust cycles. Why?",
    params: [
      { id: "K", label: "Prey carrying capacity K", min: 0.5, max: 8, step: 0.1, value: 5, dec: 1 },
      { id: "m", label: "Predator death rate m", min: 0.05, max: 0.3, step: 0.01, value: 0.2, dec: 2 },
      { id: "x0", label: "Starting prey", min: 0.1, max: 8, step: 0.1, value: 1, dec: 1 },
      { id: "y0", label: "Starting predators", min: 0.1, max: 4, step: 0.1, value: 0.5, dec: 1 },
    ],
    presets: [
      { label: "Steady (K 2.5)", values: { K: 2.5, m: 0.2 } }, { label: "Cycles (K 5)", values: { K: 5, m: 0.2 } },
      { label: "Big swings (K 8)", values: { K: 8, m: 0.2 } }, { label: "Predators starve", values: { K: 0.7, m: 0.2 } },
    ],
    hint: "On the phase plane, click anywhere to release a new pair of populations there. Past the Hopf point every start ends on the same loop.",
    _rhs(p) { const r = 1, a = 1, h = 0.5, e = 0.5;
      return (t, z) => { const g = a * z[0] / (1 + a * h * z[0]); return [r * z[0] * (1 - z[0] / p.K) - g * z[1], e * g * z[1] - p.m * z[1]]; }; },
    _eq(p) { const a = 1, h = 0.5, e = 0.5; const xs = e > p.m * h ? p.m / (a * (e - p.m * h)) : NaN;
      return { xs, ys: xs < p.K ? (1 - xs / p.K) * (1 + a * h * xs) / a : 0, kh: 2 * xs + 1 / (a * h) }; },
    views: [
      { id: "time", label: "Over time", spec(p) {
        const s = M.rk4(this.model._rhs(p), [p.x0, p.y0], 0, 300, 3000);
        return { x: { label: "Time", decimals: 0, min: 0, max: 300 }, y: { label: "Population", min: 0 },
          layers: [{ name: "Prey", x: s.t, y: s.y[0], color: C[2] }, { name: "Predators", x: s.t, y: s.y[1], color: C[4] }] };
      } },
      { id: "phase", label: "Phase plane", spec(p, set) {
        const f = this.model._rhs(p), q = this.model._eq(p), s = M.rk4(f, [p.x0, p.y0], 0, 300, 3000);
        const xmax = Math.max(p.K, Math.max.apply(null, s.y[0])) * 1.08, ymax = Math.max(1, Math.max.apply(null, s.y[1]) * 1.15, q.ys * 1.4 || 0);
        const nx = M.linspace(0.001, p.K, 120), ny = nx.map((x) => (1 - x / p.K) * (1 + 0.5 * x));
        const layers = [M.field(f, 0, xmax, 0, ymax, 18, 12),
          { name: "Trajectory", x: s.y[0], y: s.y[1], color: C[0], width: 2.2, hover: false },
          { name: "Prey nullcline", x: nx, y: ny, color: C[2], dash: true, width: 1.6, hover: false }];
        const vl = isFinite(q.xs) && q.xs < xmax ? [{ x: q.xs, color: C[4], label: "Predator nullcline" }] : [];
        const mk = [{ x: p.x0, y: p.y0, color: C[0], label: "start" }];
        if (isFinite(q.xs) && q.xs < p.K) mk.push({ x: q.xs, y: q.ys, color: SG.terracotta, fill: q.xs ? "#fff" : "#fff", label: "equilibrium" });
        return { hoverMode: "xy", x: { label: "Prey", min: 0, max: xmax }, y: { label: "Predators", min: 0, max: ymax },
          layers, vlines: vl, markers: mk, onClick: (x, y) => set({ x0: x, y0: y }), clickHint: "Click to start here" };
      } },
    ],
    stats(p) {
      const q = this._eq(p), s = M.rk4(this._rhs(p), [p.x0, p.y0], 0, 300, 3000), tail = s.y[0].slice(2000);
      const mn = Math.min.apply(null, tail), mx = Math.max.apply(null, tail);
      const beh = !(q.xs < p.K) ? "predators die out" : p.K < q.kh ? "settles to equilibrium" : "boom–bust cycle";
      return [["Behaviour", beh, "", null, beh === "boom–bust cycle" ? "bad" : beh === "predators die out" ? "bad" : "good"],
              ["Hopf point K", q.kh, "", 2], ["Prey equilibrium x*", q.xs, "", 2],
              ["Late prey range", mn.toFixed(2) + "–" + mx.toFixed(2)]];
    },
  },
  // ---------------------------------------------------------------------------------------------------
  {
    id: "competition", title: "Competition: coexist or exclude?", short: "Competing species",
    chapter: "Chapter 2 · Equilibrium", explainer: "ch02_competition",
    question: "Two species, one food supply. When can both survive, and when does history decide the winner?",
    params: [
      { id: "a12", label: "Effect of y on x (α₁₂)", min: 0, max: 2, step: 0.05, value: 0.5, dec: 2 },
      { id: "a21", label: "Effect of x on y (α₂₁)", min: 0, max: 2, step: 0.05, value: 0.6, dec: 2 },
      { id: "x0", label: "Starting x", min: 1, max: 160, step: 1, value: 10, dec: 0 },
      { id: "y0", label: "Starting y", min: 1, max: 160, step: 1, value: 10, dec: 0 },
    ],
    presets: [
      { label: "Coexist", values: { a12: 0.5, a21: 0.6, x0: 10, y0: 10 } },
      { label: "x wins", values: { a12: 0.5, a21: 1.4, x0: 10, y0: 60 } },
      { label: "History decides", values: { a12: 1.5, a21: 1.6, x0: 40, y0: 30 } },
      { label: "Identical needs", values: { a12: 1, a21: 1, x0: 20, y0: 60 } },
    ],
    hint: "Click the phase plane to drop in a new starting mix. With strong mutual competition, starts on either side of the saddle end at different corners.",
    _k: { r1: 1, r2: 0.8, K1: 100, K2: 80 },
    _rhs(p) { const k = this._k; return (t, z) => [k.r1 * z[0] * (1 - (z[0] + p.a12 * z[1]) / k.K1), k.r2 * z[1] * (1 - (z[1] + p.a21 * z[0]) / k.K2)]; },
    _out(p) { const k = this._k, xi = k.K1 > p.a12 * k.K2, yi = k.K2 > p.a21 * k.K1, det = 1 - p.a12 * p.a21;
      const xs = (k.K1 - p.a12 * k.K2) / det, ys = (k.K2 - p.a21 * k.K1) / det, ok = Math.abs(det) > 1e-9 && xs > 0 && ys > 0;
      return { out: xi && yi ? "coexist" : xi ? "x wins" : yi ? "y wins" : ok ? "depends on the start" : "x and y tie (neutral)", xs, ys, ok }; },
    views: [
      { id: "phase", label: "Phase plane", spec(p, set) {
        const k = this.model._k, f = this.model._rhs(p), o = this.model._out(p);
        const s = M.rk4(f, [p.x0, p.y0], 0, 80, 800), lim = 130;
        const layers = [M.field(f, 0, lim, 0, lim, 18, 13),
          { name: "x stops growing", x: [k.K1, 0], y: [0, p.a12 > 0 ? k.K1 / p.a12 : 1e6], color: C[0], dash: true, width: 1.6, hover: false },
          { name: "y stops growing", x: [0, p.a21 > 0 ? k.K2 / p.a21 : 1e6], y: [k.K2, 0], color: C[1], dash: true, width: 1.6, hover: false },
          { name: "Trajectory", x: s.y[0], y: s.y[1], color: SG.navy, width: 2.4, hover: false }];
        const mk = [{ x: p.x0, y: p.y0, color: SG.navy, label: "start" }];
        if (o.ok) mk.push({ x: o.xs, y: o.ys, color: SG.terracotta, label: o.out === "coexist" ? "coexistence" : "saddle" });
        return { hoverMode: "xy", x: { label: "Species x (thousands)", min: 0, max: lim }, y: { label: "Species y (thousands)", min: 0, max: lim },
          layers, markers: mk, onClick: (x, y) => set({ x0: Math.round(x), y0: Math.round(y) }), clickHint: "Click to start here" };
      } },
      { id: "time", label: "Over time", spec(p) {
        const s = M.rk4(this.model._rhs(p), [p.x0, p.y0], 0, 80, 800);
        return { x: { label: "Time", decimals: 0, min: 0, max: 80 }, y: { label: "Thousands", min: 0 },
          layers: [{ name: "Species x", x: s.t, y: s.y[0], color: C[0] }, { name: "Species y", x: s.t, y: s.y[1], color: C[1] }] };
      } },
    ],
    stats(p) {
      const o = this._out(p);
      return [["Outcome", o.out, "", null, o.out === "coexist" ? "good" : ""], ["Interior x*", o.ok ? o.xs : "none", "", 1],
              ["Interior y*", o.ok ? o.ys : "none", "", 1], ["α₁₂ · α₂₁", p.a12 * p.a21, "", 2, p.a12 * p.a21 > 1 ? "bad" : ""]];
    },
  },
  // ---------------------------------------------------------------------------------------------------
  {
    id: "extinction", title: "Why small populations die out", short: "Extinction risk",
    chapter: "Chapter 5 · Birth and death", explainer: "ch05_extinction",
    question: "A colony that grows on average can still vanish. How many founders does it take to be safe?",
    params: [
      { id: "lam", label: "Birth rate λ", min: 0.2, max: 2, step: 0.05, value: 1, dec: 2, unit: "/yr" },
      { id: "mu", label: "Death rate μ", min: 0.2, max: 2, step: 0.05, value: 0.8, dec: 2, unit: "/yr" },
      { id: "n0", label: "Founders", min: 1, max: 40, step: 1, value: 5, dec: 0 },
      { id: "seed", hidden: true, min: 1, max: 2147483646, step: 1, value: 7, dec: 0 },
    ],
    presets: [
      { label: "5 founders", values: { lam: 1, mu: 0.8, n0: 5 } }, { label: "14 founders", values: { lam: 1, mu: 0.8, n0: 14 } },
      { label: "Fast growth", values: { lam: 1.5, mu: 0.8, n0: 5 } }, { label: "Shrinking", values: { lam: 0.8, mu: 1, n0: 20 } },
    ],
    actions: [{ label: "Simulate 40 new colonies", values: (p) => ({ seed: (p.seed * 48271) % 2147483647 }) }],
    hint: "Each line is one colony, simulated event by event. Red lines went extinct. Re-run to see how much chance alone decides.",
    _sim(p, runs, T) {
      const rnd = M.rng(p.seed), paths = [];
      for (let k = 0; k < runs; k++) {
        let n = p.n0, t = 0; const tx = [0], ty = [n];
        while (t < T && n > 0 && n < 2000) {
          const rate = (p.lam + p.mu) * n; t += -Math.log(1 - rnd()) / rate;
          if (t > T) break;
          n += rnd() < p.lam / (p.lam + p.mu) ? 1 : -1; tx.push(t); ty.push(n);
        }
        tx.push(n > 0 ? T : tx[tx.length - 1]); ty.push(n);
        paths.push({ x: tx, y: ty, dead: n === 0, end: n });
      }
      return paths;
    },
    _pe(p, s) { const l = p.lam, m = p.mu; if (s === 0) return 0;
      const q = Math.abs(l - m) < 1e-9 ? l * s / (1 + l * s) : m * (Math.exp((l - m) * s) - 1) / (l * Math.exp((l - m) * s) - m);
      return Math.pow(q, p.n0); },
    views: [
      { id: "paths", label: "Simulated colonies", spec(p) {
        const paths = this.model._sim(p, 40, 30), dead = paths.filter((q) => q.dead), alive = paths.filter((q) => !q.dead);
        const ymax = Math.max(20, 6 * p.n0);  // zoomed on the small sizes where extinctions happen; big colonies run off the top
        const line = (q, d) => ({ x: q.x, y: q.y, step: true, color: d ? SG.terracotta : SG.navy, alpha: d ? 0.9 : 0.28, width: d ? 2 : 1.3, hover: false });
        return { hoverMode: "xy", x: { label: "Years", min: 0, max: 30, decimals: 0 }, y: { label: "Colony size", min: 0, max: ymax, hoverLabel: "Size" },
          layers: alive.map((q) => line(q, false)).concat(dead.map((q) => line(q, true)),
            [{ name: "Went extinct (" + dead.length + ")", x: [], y: [], color: SG.terracotta }, { name: "Survived (" + alive.length + ")", x: [], y: [], color: SG.navy }]) };
      } },
      { id: "risk", label: "Risk over time", spec(p) {
        const t = M.linspace(0, 30, 301), ult = Math.pow(Math.min(1, p.mu / p.lam), p.n0);
        const paths = this.model._sim(Object.assign({}, p, { seed: p.seed + 101 }), 400, 30);
        const yrs = M.range(0, 30), share = yrs.map((y) => 100 * paths.filter((q) => q.dead && q.x[q.x.length - 1] <= y).length / paths.length);
        return { x: { label: "Years", min: 0, max: 30, decimals: 0 }, y: { label: "% of colonies extinct", min: 0, max: 100, unit: "%", hoverDecimals: 1 },
          layers: [{ name: "Formula", x: t, y: t.map((s) => 100 * this.model._pe(p, s)), color: C[0], width: 2.5 },
                   { name: "400 simulated colonies", x: yrs, y: share, color: C[1], kind: "line", dash: true, width: 2 }],
          hlines: [{ y: 100 * ult, color: SG.terracotta, label: "eventually " + (100 * ult).toFixed(0) + "%" }] };
      } },
    ],
    stats(p) {
      const ult = Math.pow(Math.min(1, p.mu / p.lam), p.n0);
      const need = p.mu < p.lam ? Math.ceil(Math.log(0.05) / Math.log(p.mu / p.lam)) : "never";
      const sim = this._sim(p, 40, 30), dead = sim.filter((q) => q.dead).length;
      return [["Eventual extinction", 100 * ult, "%", 1, ult > 0.2 ? "bad" : "good"], ["Founders for 95% safety", need, "", 0],
              ["Expected size in 10 years", p.n0 * Math.exp((p.lam - p.mu) * 10), "", 1], ["Extinct in this run", dead + " of 40"]];
    },
  },
  // ---------------------------------------------------------------------------------------------------
  {
    id: "checkout", title: "How many checkouts to open", short: "Checkout queues",
    chapter: "Chapter 6 · Stationary distributions", explainer: "ch06_checkout_lines",
    question: "Shoppers arrive at random. How many lanes keep the wait short without paying idle cashiers?",
    params: [
      { id: "lam", label: "Arrivals", min: 0.2, max: 4, step: 0.1, value: 1.8, dec: 1, unit: "/min" },
      { id: "s", label: "Mean service time", min: 0.5, max: 5, step: 0.1, value: 2, dec: 1, unit: " min" },
      { id: "c", label: "Open lanes", min: 1, max: 12, step: 1, value: 4, dec: 0 },
    ],
    presets: [
      { label: "Busy (4 lanes)", values: { lam: 1.8, s: 2, c: 4 } }, { label: "One more lane", values: { lam: 1.8, s: 2, c: 5 } },
      { label: "Lunch rush", values: { lam: 3, s: 2, c: 7 } }, { label: "Quiet morning", values: { lam: 0.6, s: 2, c: 2 } },
    ],
    hint: "Waits explode as the cashiers approach 100% busy. Compare 4 and 5 lanes in the busy case: one extra cashier cuts the wait several-fold.",
    _q(lam, s, c) {
      const mu = 1 / s, a = lam / mu, rho = a / c;
      if (rho >= 1) return { stable: false, a, rho };
      let sum = 0; for (let k = 0; k < c; k++) sum += Math.pow(a, k) / M.fact(k);
      const top = Math.pow(a, c) / M.fact(c) / (1 - rho), Cw = top / (sum + top), p0 = 1 / (sum + top);
      return { stable: true, a, rho, C: Cw, p0, mu, Wq: Cw / (c * mu - lam), tail2: Cw * Math.exp(-(c * mu - lam) * 2) };
    },
    views: [
      { id: "dist", label: "Line length", spec(p) {
        const q = this.model._q(p.lam, p.s, p.c), n = M.range(0, 30);
        const y = q.stable ? n.map((k) => 100 * q.p0 * (k <= p.c ? Math.pow(q.a, k) / M.fact(k) : Math.pow(q.a, p.c) / M.fact(p.c) * Math.pow(q.rho, k - p.c))) : n.map(() => 0);
        return { x: { label: "Customers at the checkouts", min: -0.6, max: 30.6, decimals: 0, hoverLabel: "Customers" },
          y: { label: "Probability (%)", min: 0, unit: "%", hoverDecimals: 1 },
          layers: [{ name: "Probability", kind: "bars", x: n, y, color: C[0], colors: n.map((k) => (k > p.c ? C[1] : C[0])) }],
          vlines: [{ x: p.c + 0.5, color: SG.terracotta, label: q.stable ? "queue starts" : "unstable: the line grows without limit" }] };
      } },
      { id: "lanes", label: "Wait by lanes", spec(p) {
        const lo = Math.max(1, Math.floor(p.lam * p.s) + 1), lanes = M.range(lo, lo + 7);
        const w = lanes.map((c) => this.model._q(p.lam, p.s, c).Wq);
        return { x: { label: "Open lanes", min: lo - 0.6, max: lo + 7.6, decimals: 0, hoverLabel: "Lanes" },
          y: { label: "Mean wait (minutes)", min: 0, unit: " min", hoverDecimals: 2 },
          layers: [{ name: "Mean wait", kind: "bars", x: lanes, y: w, color: "#9FB6C6", colors: lanes.map((c) => (c === p.c ? SG.navy : "#9FB6C6")) }] };
      } },
    ],
    stats(p) {
      const q = this._q(p.lam, p.s, p.c);
      if (!q.stable) return [["Status", "unstable: the line grows without limit", "", null, "bad"], ["Cashiers needed (load)", q.a, "", 2]];
      return [["Mean wait", q.Wq, " min", 2, q.Wq > 2 ? "bad" : "good"], ["Chance of waiting", 100 * q.C, "%", 0],
              ["Waits over 2 min", 100 * q.tail2, "%", 0], ["Utilisation", 100 * q.rho, "%", 0]];
    },
  },
  // ---------------------------------------------------------------------------------------------------
  {
    id: "harvest", title: "Harvesting a fishery", short: "Fishery economics",
    chapter: "Chapter 3 · Optimisation", explainer: "ch03_optimal_harvest",
    question: "What stock should an owner keep in the sea, and why does open access fish it down?",
    params: [
      { id: "d", label: "Discount rate δ", min: 0, max: 0.6, step: 0.01, value: 0.05, dec: 2 },
      { id: "c", label: "Cost per unit effort", min: 0, max: 60, step: 1, value: 20, dec: 0 },
      { id: "r", label: "Growth rate r", min: 0.2, max: 1, step: 0.05, value: 0.5, dec: 2 },
    ],
    presets: [
      { label: "Base case", values: { d: 0.05, c: 20, r: 0.5 } }, { label: "No costs", values: { d: 0.05, c: 0, r: 0.5 } },
      { label: "Impatient owner", values: { d: 0.3, c: 20, r: 0.5 } }, { label: "Fish it out", values: { d: 0.6, c: 0, r: 0.5 } },
    ],
    hint: "Discounting pulls the best stock down; fishing costs push it up. With no costs and δ above r, the 'optimal' plan is to fish the stock out.",
    _k: { K: 100, P: 1, q: 1 },
    _calc(p) {
      const { K, P, q } = this._k, r = p.r, c = p.c, d = Math.max(p.d, 1e-9);
      const F = (x) => r * x * (1 - x / K), prof = (x) => (P - c / (q * x)) * F(x);
      let xs;
      if (c === 0) xs = Math.max(0, K / 2 * (1 - d / r));
      else { const xoa = c / (P * q);
        if (xoa >= K) xs = K;
        else xs = M.root((x) => r * (1 - 2 * x / K) + (c / (q * x * x)) * F(x) / (P - c / (q * x)) - d, xoa * (1 + 1e-9) + 1e-12, K * (1 - 1e-12)); }
      return { F, prof, xs, xoa: Math.min(c / (P * q), K) };
    },
    views: [
      { id: "profit", label: "Profit by stock", spec(p) {
        const z = this.model._calc(p), x = M.linspace(1, 100, 199);
        return { x: { label: "Stock (thousand tonnes)", min: 0, max: 100, decimals: 0, hoverLabel: "Stock" },
          y: { label: "$M a year", min: -5, max: 15, unit: " $M/yr", hoverDecimals: 2 },
          layers: [{ name: "Sustained profit", x, y: x.map((v) => Math.max(z.prof(v), -5)), color: C[0], width: 2.5 }],
          vlines: [{ x: z.xs, color: SG.forest, solid: true, width: 2, label: "optimal " + z.xs.toFixed(0) },
                   { x: 50, color: C[1], label: "max yield", row: 1 },
                   { x: z.xoa, color: SG.terracotta, label: "open access", row: 2 }],
          hlines: [{ y: 0, color: "#9FB6C6", solid: true, width: 1 }] };
      } },
      { id: "catch", label: "Growth & catch", spec(p) {
        const z = this.model._calc(p), x = M.linspace(0, 100, 201);
        return { x: { label: "Stock (thousand tonnes)", min: 0, max: 100, decimals: 0, hoverLabel: "Stock" },
          y: { label: "Thousand tonnes a year", min: 0, hoverDecimals: 2 },
          layers: [{ name: "Natural growth F(x)", x, y: x.map(z.F), color: C[2], width: 2.5 }],
          markers: [{ x: z.xs, y: z.F(z.xs), color: SG.forest, label: "optimal catch " + z.F(z.xs).toFixed(1) },
                    { x: z.xoa, y: z.F(z.xoa), color: SG.terracotta, label: "open access" }] };
      } },
    ],
    stats(p) {
      const z = this._calc(p);
      return [["Optimal stock", z.xs, " k t", 1], ["Sustained catch", z.F(z.xs), " k t/yr", 2],
              ["Profit at that stock", z.prof(z.xs), " $M/yr", 2, z.prof(z.xs) > 0 ? "good" : "bad"], ["Open-access stock", z.xoa, " k t", 0]];
    },
  },
];
MODELS.forEach((m) => m.views.forEach((v) => { v.model = m; }));
