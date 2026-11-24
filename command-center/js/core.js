/* core.js — helpers, formatting, icons, components and a small theme-aware canvas chart engine */
const SYS = window.CB_SYSTEM;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("cbcc-" + k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("cbcc-" + k, v); } catch (e) {} },
};
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

const fmt = {
  n: (v, d = 0) => v == null || isNaN(v) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }),
  pct: (v, d = 0) => v == null || isNaN(v) ? "—" : (v * 100).toFixed(d) + "%",
  big: (v) => {
    if (v == null || isNaN(v)) return "—";
    const a = Math.abs(v), s = v < 0 ? "−$" : "$";
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
    if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + "K";
    return s + a.toFixed(0);
  },
  signedBig: (v) => (v > 0 ? "+" : "") + fmt.big(v),
  time: (d) => d.toLocaleString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }),
  day: (d) => d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }),
  clock: (d) => d.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false }),
  ago: (h) => h < 1 ? Math.max(1, Math.round(h * 60)) + "m" : h < 48 ? h.toFixed(h < 10 ? 1 : 0) + "h" : Math.round(h / 24) + "d",
};

/* ---------- lookups */
const UNITS = SYS.units;
const UIX = Object.fromEntries(UNITS.map((u, i) => [u.id, i]));
const FAC = Object.fromEntries(SYS.facilities.map((f, i) => [f.id, { ...f, idx: i }]));
const FACS = SYS.facilities;
const isBedUnit = (u) => !["ed", "or", "pacu"].includes(u.kind);
const visibleUnits = UNITS.filter((u) => !u.parent);
const facUnits = (fid) => UNITS.map((u, i) => [u, i]).filter(([u]) => u.facility === fid && !u.parent);
const facBeds = (fid) => UNITS.reduce((s, u) => s + (u.facility === fid && isBedUnit(u) ? u.beds : 0), 0);
const KIND_LABEL = { ed: "Emergency", or: "Operating rooms", pacu: "Recovery", medsurg: "Medical-surgical", tele: "Telemetry",
  onc: "Oncology", surg: "Surgical", ortho: "Orthopedics", neuro: "Neuroscience", pcu: "Progressive care", icu: "Intensive care",
  ld: "Labor & delivery", mb: "Mother-baby", nicu: "Neonatal ICU", peds: "Pediatrics", psych: "Behavioral health",
  obs: "Observation", rehab: "Rehabilitation" };
const FAC_KIND = { main: "Tertiary medical center", community: "Community hospital", fsed: "Freestanding ED", asc: "Ambulatory surgery center",
  rehab: "Inpatient rehabilitation", behavioral: "Behavioral health hospital" };

function occColor(o) {
  return o >= 0.95 ? "var(--crit)" : o >= 0.88 ? "var(--warn)" : o >= 0.75 ? "var(--primary)" : "var(--ok)";
}
function occClass(o) { return o >= 0.95 ? "crit" : o >= 0.88 ? "warn" : "ok"; }

/* ---------- icons */
const ICON = {
  pulse: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>',
  bed: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/></svg>',
  heart: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  cloud: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/></svg>',
  dollar: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.5 0-4 1.2-4 3s1.6 2.6 4 3.2 4.2 1.4 4.2 3.3-1.7 3.2-4.2 3.2c-2.2 0-3.9-.8-4.7-2.3"/></svg>',
  book: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
  flask: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/></svg>',
  grid: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  spark: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/></svg>',
  plug: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/></svg>',
  users: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.3.3 3.9 2 4.5 4.5"/></svg>',
  trend: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
};

/* ---------- components */
function kpi(label, value, sub = "", cls = "") {
  return `<div class="card kpi ${cls}"><div class="lab">${label}</div><div class="val">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}
function bar(frac, color, extra = "") {
  const w = Math.max(0, Math.min(1, frac)) * 100;
  return `<div class="bar-track ${extra}"><div class="bar-fill" style="width:${w.toFixed(1)}%;background:${color}"></div></div>`;
}
function chip(text, cls = "") { return `<span class="chip ${cls}">${text}</span>`; }
function seg(id, options, value) {
  return `<div class="seg" id="${id}">${options.map(([v, l]) => `<button data-v="${esc(v)}" class="${String(v) === String(value) ? "on" : ""}">${l}</button>`).join("")}</div>`;
}
function onSeg(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$("button", el).forEach((x) => x.classList.toggle("on", x === b));
    fn(b.dataset.v);
  });
}
function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

/* ---------- charts: a small canvas engine that reads the theme's CSS variables */
const charts = new Set();
function destroyCharts() { charts.forEach((c) => c.destroy()); charts.clear(); }
function chartTheme() {
  return { text: cssVar("--muted-fg"), fg: cssVar("--fg"), grid: cssVar("--grid"), border: cssVar("--border"), card: cssVar("--card"),
    font: getComputedStyle(document.body).fontFamily };
}
function withAlpha(c, a) {
  if (c.startsWith("var(")) c = cssVar(c.slice(4, -1));
  const h = c.replace("#", "");
  if (h.length !== 6 && h.length !== 3) return c;
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function col(c) { return c && c.startsWith("var(") ? cssVar(c.slice(4, -1)) : c; }
function niceTicks(min, max, n) {
  const span = max - min;
  if (!(span > 0) || !isFinite(span)) return [min];
  const raw = span / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

/* spec: { type: "line" | "bar", n (points), xLabel(i) -> string, xTicks: [i...], series: [{name, y, color, width, dash, fill}],
   bands: [{lo, hi, color}], hlines: [{y, label, color}], vlines: [{x, label, color}], yMin, yMax, yFmt, stacked,
   bars: {labels, values, colors} for type bar, horizontal }  */
class CanvasChart {
  constructor(canvas, spec) {
    this.c = canvas; this.spec = spec; this.hover = null;
    this.onMove = (e) => { const r = this.c.getBoundingClientRect(); this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; this.draw(); };
    this.onLeave = () => { this.hover = null; this.draw(); };
    this.onClick = (e) => { if (this.spec.onClick && this.hi != null) this.spec.onClick(this.hi); };
    canvas.addEventListener("mousemove", this.onMove);
    canvas.addEventListener("mouseleave", this.onLeave);
    canvas.addEventListener("click", this.onClick);
    this.ro = window.ResizeObserver ? new ResizeObserver(() => this.draw()) : null;
    if (this.ro) this.ro.observe(canvas.parentElement || canvas);
    charts.add(this);
    this.draw();
  }
  update(spec) { this.spec = Object.assign(this.spec, spec); this.draw(); }
  destroy() {
    this.c.removeEventListener("mousemove", this.onMove); this.c.removeEventListener("mouseleave", this.onLeave);
    this.c.removeEventListener("click", this.onClick);
    if (this.ro) this.ro.disconnect();
  }
  draw() {
    const s = this.spec, c = this.c, box = c.parentElement.getBoundingClientRect();
    const W = Math.max(50, box.width), H = Math.max(50, box.height), dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + "px"; c.style.height = H + "px";
    }
    const ctx = c.getContext("2d"), T = chartTheme();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `11px ${T.font}`;
    if (s.type === "bar" && s.horizontal) return this.drawHBar(ctx, W, H, T);
    const n = s.n || (s.bars ? s.bars.values.length : (s.series && s.series[0] ? s.series[0].y.length : 0));
    if (!n) return;
    let lo = s.yMin, hi = s.yMax;
    if (lo == null || hi == null) {
      let a = Infinity, b = -Infinity;
      const scan = (arr) => { for (const v of arr) if (isFinite(v)) { if (v < a) a = v; if (v > b) b = v; } };
      (s.series || []).forEach((x) => scan(x.y));
      (s.bands || []).forEach((x) => { scan(x.lo); scan(x.hi); });
      (s.hlines || []).forEach((x) => scan([x.y]));
      if (s.bars) scan(s.bars.values.concat([0]));
      if (!isFinite(a)) { a = 0; b = 1; }
      if (a === b) { a -= 1; b += 1; }
      const pad = (b - a) * 0.08;
      if (lo == null) lo = s.zero ? Math.min(0, a) : a - pad;
      if (hi == null) hi = b + pad;
    }
    const ticks = niceTicks(lo, hi, s.yTicks || 4), yFmt = s.yFmt || ((v) => fmt.n(v, Math.abs(hi - lo) < 5 ? 1 : 0));
    let lw = 0; ticks.forEach((t) => { lw = Math.max(lw, ctx.measureText(yFmt(t)).width); });
    const legendH = s.legend && s.series && s.series.some((x) => x.name) ? 18 : 0;
    const L = { l: lw + 12, r: W - 10, t: 8 + legendH, b: H - (s.noX ? 6 : 22) };
    this.L = L;
    const X = s.type === "bar" ? (i) => L.l + (i + 0.5) * (L.r - L.l) / n : (i) => L.l + (n <= 1 ? 0 : i * (L.r - L.l) / (n - 1));
    const Y = (v) => L.b - (v - lo) / (hi - lo) * (L.b - L.t);
    // grid + y labels
    ctx.strokeStyle = T.grid; ctx.fillStyle = T.text; ctx.lineWidth = 1; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ticks.forEach((t) => { if (t < lo - 1e-9 || t > hi + 1e-9) return; const y = Math.round(Y(t)) + .5; ctx.beginPath(); ctx.moveTo(L.l, y); ctx.lineTo(L.r, y); ctx.stroke(); ctx.fillText(yFmt(t), L.l - 6, y); });
    // x labels
    if (!s.noX && s.xLabel) {
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      const xt = s.xTicks || niceTicks(0, n - 1, Math.min(8, Math.floor((L.r - L.l) / 70))).filter((v) => Number.isInteger(v));
      xt.forEach((i) => { if (i >= 0 && i < n) ctx.fillText(s.xLabel(i), X(i), L.b + 6); });
    }
    // vlines (e.g. "now")
    (s.vlines || []).forEach((v) => {
      ctx.strokeStyle = col(v.color) || T.text; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(v.x), L.t); ctx.lineTo(X(v.x), L.b); ctx.stroke(); ctx.setLineDash([]);
      if (v.label) { ctx.fillStyle = col(v.color) || T.text; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(v.label, X(v.x) + 4, L.t); }
    });
    (s.bands || []).forEach((b) => {
      ctx.fillStyle = withAlpha(col(b.color), b.alpha || .16); ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.lineTo(X(i), Y(b.hi[i]));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(b.lo[i]));
      ctx.closePath(); ctx.fill();
    });
    if (s.type === "bar" && s.bars) {
      const bw = Math.max(2, (L.r - L.l) / n * .66);
      s.bars.values.forEach((v, i) => {
        ctx.fillStyle = col((s.bars.colors && s.bars.colors[i]) || s.bars.color || "var(--c1)");
        const y0 = Y(Math.max(lo, 0)), y1 = Y(v);
        ctx.fillRect(X(i) - bw / 2, Math.min(y0, y1), bw, Math.abs(y1 - y0));
      });
    }
    (s.hlines || []).forEach((h) => {
      ctx.strokeStyle = col(h.color) || T.text; ctx.setLineDash(h.solid ? [] : [5, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.l, Y(h.y)); ctx.lineTo(L.r, Y(h.y)); ctx.stroke(); ctx.setLineDash([]);
      if (h.label) { ctx.fillStyle = col(h.color) || T.text; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(h.label, L.r, Y(h.y) - 2); }
    });
    (s.series || []).forEach((sr) => {
      const color = col(sr.color || "var(--c1)");
      if (sr.area) {
        ctx.fillStyle = withAlpha(color, .14); ctx.beginPath(); ctx.moveTo(X(0), Y(Math.max(lo, 0)));
        sr.y.forEach((v, i) => ctx.lineTo(X(i), Y(v))); ctx.lineTo(X(sr.y.length - 1), Y(Math.max(lo, 0))); ctx.fill();
      }
      if (sr.width !== 0) {
        ctx.strokeStyle = color; ctx.lineWidth = sr.width || 2; ctx.setLineDash(sr.dash ? [5, 4] : []); ctx.lineJoin = "round";
        ctx.beginPath(); let pen = false;
        sr.y.forEach((v, i) => { if (!isFinite(v)) { pen = false; return; } if (sr.step && pen) ctx.lineTo(X(i), Y(sr.y[i - 1])); pen ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); pen = true; });
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (sr.dots) { ctx.fillStyle = color; sr.y.forEach((v, i) => { if (isFinite(v) && (sr.dots === true || sr.dots[i])) { ctx.beginPath(); ctx.arc(X(i), Y(v), 3, 0, 7); ctx.fill(); } }); }
    });
    if (legendH) {
      let x = L.l; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      s.series.filter((x) => x.name).forEach((sr) => {
        ctx.fillStyle = col(sr.color || "var(--c1)"); ctx.fillRect(x, 7, 12, 3);
        ctx.fillStyle = T.text; ctx.fillText(sr.name, x + 16, 9); x += 26 + ctx.measureText(sr.name).width;
      });
    }
    // hover readout
    this.hi = null;
    if (this.hover && this.hover.x >= L.l && this.hover.x <= L.r && this.hover.y >= L.t - 4 && this.hover.y <= L.b + 4) {
      let i = s.type === "bar" ? Math.floor((this.hover.x - L.l) / ((L.r - L.l) / n)) : Math.round((this.hover.x - L.l) / ((L.r - L.l) / Math.max(n - 1, 1)));
      i = Math.max(0, Math.min(n - 1, i)); this.hi = i;
      ctx.strokeStyle = T.border; ctx.beginPath(); ctx.moveTo(X(i), L.t); ctx.lineTo(X(i), L.b); ctx.stroke();
      const lines = [];
      if (s.xLabel) lines.push([s.xLabel(i, true), null]);
      (s.series || []).forEach((sr) => { if (isFinite(sr.y[i]) && !sr.noHover) lines.push([(sr.name || "Value") + ": " + yFmt(sr.y[i], true), col(sr.color || "var(--c1)")]); });
      (s.bands || []).forEach((b) => { if (b.name) lines.push([b.name + ": " + yFmt(b.lo[i], true) + "–" + yFmt(b.hi[i], true), col(b.color)]); });
      if (s.bars) lines.push([(s.bars.name || "Value") + ": " + yFmt(s.bars.values[i], true), col((s.bars.colors && s.bars.colors[i]) || s.bars.color || "var(--c1)")]);
      if (s.hoverExtra) s.hoverExtra(i).forEach((l) => lines.push([l, null]));
      this.tooltip(ctx, lines, X(i), L, W, T);
    }
  }
  tooltip(ctx, lines, x, L, W, T) {
    ctx.font = `11px ${T.font}`;
    let w = 0; lines.forEach(([t]) => { w = Math.max(w, ctx.measureText(t).width); });
    w += 20; const h = lines.length * 16 + 10;
    let bx = x + 10; if (bx + w > W - 4) bx = x - w - 10;
    const by = L.t + 4;
    ctx.fillStyle = T.card; ctx.strokeStyle = T.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, h, 6) : ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
    lines.forEach(([t, c], k) => {
      ctx.fillStyle = c || T.fg; ctx.font = (k === 0 ? "600 " : "") + `11px ${T.font}`;
      if (c) { ctx.fillRect(bx + 8, by + 12 + k * 16, 6, 6); ctx.fillStyle = T.fg; }
      ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(t, bx + (c ? 18 : 8), by + 15 + k * 16);
    });
  }
  drawHBar(ctx, W, H, T) {
    const s = this.spec, b = s.bars, n = b.values.length;
    let lw = 0; b.labels.forEach((l) => { lw = Math.max(lw, ctx.measureText(l).width); });
    const L = { l: lw + 12, r: W - 60, t: 4, b: H - 4 }, rowH = (L.b - L.t) / n;
    const mn = Math.min(0, ...b.values), mx = Math.max(0, ...b.values, s.xMax || 0);
    const X = (v) => L.l + (v - mn) / ((mx - mn) || 1) * (L.r - L.l);
    const f = s.yFmt || ((v) => fmt.n(v));
    b.values.forEach((v, i) => {
      const y = L.t + i * rowH + rowH * .18, h = rowH * .64;
      ctx.fillStyle = T.text; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(b.labels[i], L.l - 6, y + h / 2);
      ctx.fillStyle = col((b.colors && b.colors[i]) || b.color || "var(--c1)");
      ctx.fillRect(Math.min(X(0), X(v)), y, Math.abs(X(v) - X(0)), h);
      ctx.fillStyle = T.fg; ctx.textAlign = "left"; ctx.fillText(f(v), Math.max(X(0), X(v)) + 6, y + h / 2);
    });
    if (mn < 0) { ctx.strokeStyle = T.border; ctx.beginPath(); ctx.moveTo(X(0), L.t); ctx.lineTo(X(0), L.b); ctx.stroke(); }
  }
}
function chart(id, spec) { const c = document.getElementById(id); return c ? new CanvasChart(c, spec) : null; }
function canvasBox(id, cls = "") { return `<div class="chart-box ${cls}"><canvas id="${id}"></canvas></div>`; }
