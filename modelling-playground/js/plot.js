/* Modelling Playground: a small canvas chart engine (lines, step lines, points, bars, vector fields,
   reference lines, hover readout, click-to-set). No dependencies, so the app works offline. */
"use strict";
const SG = {
  navy: "#062F4F", night: "#0B3D63", forest: "#0D7A3C", gold: "#F2D15C", ink: "#0D1C24", muted: "#4A5E6D",
  grid: "#E3E9EC", line: "#D5DEE3", terracotta: "#A54A28",
  series: ["#1D5B92", "#A97E2C", "#1F6F3D", "#439CCC", "#9E366F", "#6A55B8"],
};

function niceTicks(min, max, n) {
  const span = max - min;
  if (!(span > 0) || !isFinite(span)) return [min];
  const raw = span / (n || 6), mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

function fmtNum(v, dec) {
  if (typeof v !== "number") return String(v);
  if (!isFinite(v)) return "—";
  if (dec != null) return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 10) return String(+v.toFixed(1));
  if (a >= 1) return String(+v.toFixed(2));
  if (a === 0) return "0";
  return String(+v.toPrecision(3));
}

class Plot {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.spec = null; this.hover = null; this.box = null;
    canvas.addEventListener("mousemove", (e) => { this.hover = this.pos(e); this.draw(); });
    canvas.addEventListener("mouseleave", () => { this.hover = null; this.draw(); });
    canvas.addEventListener("click", (e) => {
      const p = this.pos(e);
      if (this.spec && this.spec.onClick && p.inside) this.spec.onClick(this.ix(p.px), this.iy(p.py));
    });
    if (window.ResizeObserver) new ResizeObserver(() => this.draw()).observe(canvas);
    else window.addEventListener("resize", () => this.draw());
  }
  pos(e) {
    const r = this.c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, b = this.box;
    return { px, py, inside: !!b && px >= b.l && px <= b.r && py >= b.t && py <= b.b };
  }
  set(spec) {
    const ax = (key, fixed) => {
      const a = Object.assign({}, fixed || {});
      if (a.min == null || a.max == null) {
        let lo = Infinity, hi = -Infinity;
        for (const s of spec.layers || []) {
          const arr = s[key] || [];
          for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
        }
        if (!isFinite(lo)) { lo = 0; hi = 1; }
        if (lo === hi) { lo -= 1; hi += 1; }
        const pad = key === "y" && a.pad !== false ? (hi - lo) * 0.06 : 0;
        if (a.min == null) a.min = lo - (lo > 0 && lo - pad < 0 ? lo : pad);
        if (a.max == null) a.max = hi + pad;
      }
      return a;
    };
    this.spec = Object.assign({}, spec, { x: ax("x", spec.x), y: ax("y", spec.y) });
    this.c.style.cursor = spec.onClick ? "crosshair" : "default";
    this.draw();
  }
  sx(v) { const b = this.box, x = this.spec.x; return b.l + (v - x.min) / (x.max - x.min) * (b.r - b.l); }
  sy(v) { const b = this.box, y = this.spec.y; return b.b - (v - y.min) / (y.max - y.min) * (b.b - b.t); }
  ix(px) { const b = this.box, x = this.spec.x; return x.min + (px - b.l) / (b.r - b.l) * (x.max - x.min); }
  iy(py) { const b = this.box, y = this.spec.y; return y.min + (b.b - py) / (b.b - b.t) * (y.max - y.min); }

  draw() {
    const c = this.c, ctx = this.ctx, s = this.spec;
    const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!s) return;
    const narrow = w < 520;
    const l0 = narrow ? 46 : 60, legRows = this.legendRows(l0, w - 14);
    this.box = { l: l0, r: w - 14, t: legRows ? 10 + legRows * 20 + 6 : 14, b: h - (narrow ? 40 : 46) };
    const b = this.box;
    ctx.font = "12px Montserrat, system-ui, sans-serif";
    ctx.textBaseline = "middle";

    // grid + ticks
    const xt = s.x.ticks || niceTicks(s.x.min, s.x.max, narrow ? 4 : 7), yt = s.y.ticks || niceTicks(s.y.min, s.y.max, narrow ? 4 : 6);
    ctx.strokeStyle = SG.grid; ctx.lineWidth = 1; ctx.fillStyle = SG.muted;
    ctx.textAlign = "right";
    for (const v of yt) {
      const y = Math.round(this.sy(v)) + 0.5; if (y < b.t - 1 || y > b.b + 1) continue;
      ctx.beginPath(); ctx.moveTo(b.l, y); ctx.lineTo(b.r, y); ctx.stroke();
      ctx.fillText(fmtNum(v, s.y.decimals), b.l - 8, y);
    }
    ctx.textAlign = "center";
    for (const v of xt) {
      const x = Math.round(this.sx(v)) + 0.5; if (x < b.l - 1 || x > b.r + 1) continue;
      ctx.beginPath(); ctx.moveTo(x, b.t); ctx.lineTo(x, b.b); ctx.stroke();
      ctx.fillText(s.x.plain ? String(v) : fmtNum(v, s.x.decimals), x, b.b + 14);
    }
    ctx.strokeStyle = SG.line; ctx.beginPath(); ctx.moveTo(b.l, b.b + 0.5); ctx.lineTo(b.r, b.b + 0.5); ctx.stroke();
    ctx.fillStyle = SG.ink; ctx.font = "600 12px Montserrat, system-ui, sans-serif";
    if (s.x.label) ctx.fillText(s.x.label, (b.l + b.r) / 2, b.b + 32);
    if (s.y.label) {
      ctx.save(); ctx.translate(14, (b.t + b.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(s.y.label, 0, 0); ctx.restore();
    }

    ctx.save(); ctx.beginPath(); ctx.rect(b.l, b.t, b.r - b.l, b.b - b.t); ctx.clip();
    for (const L of s.layers || []) this.layer(L);
    for (const v of s.vlines || []) this.ref("v", v);
    for (const v of s.hlines || []) this.ref("h", v);
    for (const m of s.markers || []) this.marker(m);
    ctx.restore();
    this.legend();
    if (this.hover && this.hover.inside) this.readout();
  }

  layer(L) {
    const ctx = this.ctx, n = (L.x || []).length;
    const col = L.color || SG.series[0];
    if (L.kind === "points") {
      ctx.fillStyle = col; ctx.globalAlpha = L.alpha == null ? 1 : L.alpha;
      const r = L.size || 1.2;
      for (let i = 0; i < n; i++) ctx.fillRect(this.sx(L.x[i]) - r / 2, this.sy(L.y[i]) - r / 2, r, r);
      ctx.globalAlpha = 1; return;
    }
    if (L.kind === "bars") {
      const xs = L.x, bw = Math.max(1, Math.abs(this.sx(xs[1] != null ? xs[1] : xs[0] + 1) - this.sx(xs[0])) * (L.width || 0.78));
      for (let i = 0; i < n; i++) {
        const x = this.sx(xs[i]), y0 = this.sy(Math.max(this.spec.y.min, 0)), y1 = this.sy(L.y[i]);
        ctx.fillStyle = (L.colors && L.colors[i]) || col;
        ctx.fillRect(x - bw / 2, Math.min(y0, y1), bw, Math.abs(y1 - y0));
      }
      return;
    }
    if (L.kind === "field") {
      ctx.strokeStyle = L.color || "#8FA6B5"; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        const x = this.sx(L.x[i]), y = this.sy(L.y[i]), a = Math.atan2(-L.v[i], L.u[i]), len = 13 * (L.m ? L.m[i] : 1);
        if (!(len > 0.5)) continue;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(a - 0.5) * 4.5, y2 - Math.sin(a - 0.5) * 4.5);
        ctx.lineTo(x2 - Math.cos(a + 0.5) * 4.5, y2 - Math.sin(a + 0.5) * 4.5); ctx.closePath(); ctx.fill();
      }
      return;
    }
    // line (default)
    ctx.strokeStyle = col; ctx.lineWidth = L.width || 2; ctx.globalAlpha = L.alpha == null ? 1 : L.alpha;
    ctx.setLineDash(L.dash ? [6, 4] : []); ctx.lineJoin = "round";
    ctx.beginPath();
    let pen = false, px = 0;
    for (let i = 0; i < n; i++) {
      const xv = L.x[i], yv = L.y[i];
      if (!isFinite(xv) || !isFinite(yv)) { pen = false; continue; }
      const X = this.sx(xv), Y = this.sy(yv);
      if (!pen) { ctx.moveTo(X, Y); pen = true; }
      else if (L.step) { ctx.lineTo(X, this.sy(L.y[i - 1])); ctx.lineTo(X, Y); }
      else ctx.lineTo(X, Y);
      px = X;
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  ref(dir, r) {
    const ctx = this.ctx, b = this.box;
    ctx.strokeStyle = r.color || SG.navy; ctx.lineWidth = r.width || 1.5; ctx.setLineDash(r.solid ? [] : [5, 4]);
    ctx.beginPath();
    if (dir === "v") { const x = this.sx(r.x); ctx.moveTo(x, b.t); ctx.lineTo(x, b.b); }
    else { const y = this.sy(r.y); ctx.moveTo(b.l, y); ctx.lineTo(b.r, y); }
    ctx.stroke(); ctx.setLineDash([]);
    if (r.label) {
      ctx.font = "600 11px Montserrat, system-ui, sans-serif"; ctx.fillStyle = r.color || SG.navy;
      if (dir === "v") { const x = this.sx(r.x); const right = x > (b.l + b.r) / 2; ctx.textAlign = right ? "right" : "left"; ctx.fillText(r.label, x + (right ? -5 : 5), b.t + 10 + (r.row || 0) * 15); }
      else { ctx.textAlign = "right"; ctx.fillText(r.label, b.r - 4, this.sy(r.y) - 9); }
    }
  }

  marker(m) {
    const ctx = this.ctx, x = this.sx(m.x), y = this.sy(m.y);
    ctx.beginPath(); ctx.arc(x, y, m.r || 5, 0, Math.PI * 2);
    ctx.fillStyle = m.fill || "#fff"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = m.color || SG.navy; ctx.stroke();
    if (m.label) {
      ctx.font = "600 11px Montserrat, system-ui, sans-serif"; ctx.fillStyle = m.color || SG.navy; ctx.textAlign = "left";
      ctx.fillText(m.label, x + 8, y - 9);
    }
  }

  // Legend sits above the plot area (never over the data); rows wrap to the chart width.
  legendRows(l, r) {
    const items = ((this.spec && this.spec.layers) || []).filter((L) => L.name);
    if (!items.length) return 0;
    const ctx = this.ctx; ctx.font = "500 12px Montserrat, system-ui, sans-serif";
    let rows = 1, x = l;
    items.forEach((L) => { const wd = ctx.measureText(L.name).width + 30; if (x + wd > r && x > l) { rows++; x = l; } x += wd; });
    return rows;
  }

  legend() {
    const items = (this.spec.layers || []).filter((L) => L.name);
    if (!items.length) return;
    const ctx = this.ctx, b = this.box;
    ctx.font = "500 12px Montserrat, system-ui, sans-serif"; ctx.textAlign = "left";
    let x = b.l, y = 14;
    const widths = items.map((L) => ctx.measureText(L.name).width + 30);
    items.forEach((L, i) => {
      if (x + widths[i] > b.r && x > b.l) { x = b.l; y += 20; }
      ctx.strokeStyle = L.color || SG.series[0]; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 3;
      ctx.setLineDash(L.dash ? [5, 3] : []);
      if (L.kind === "points" || L.kind === "bars") ctx.fillRect(x, y - 4, 14, 8);
      else { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 16, y); ctx.stroke(); }
      ctx.setLineDash([]); ctx.fillStyle = SG.ink; ctx.fillText(L.name, x + 20, y + 1);
      x += widths[i];
    });
  }

  readout() {
    const ctx = this.ctx, s = this.spec, b = this.box, hv = this.hover;
    const lines = [];
    let gx = null;
    const series = (s.layers || []).filter((L) => L.name && (L.kind === "line" || L.kind == null || L.kind === "bars") && L.hover !== false && L.x && L.x.length > 1 && L.x[1] > L.x[0]);
    if (series.length && s.hoverMode !== "xy") {
      const xv = this.ix(hv.px);
      for (const L of series) {
        let lo = 0, hi = L.x.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L.x[mid] < xv) lo = mid; else hi = mid; }
        const i = Math.abs(L.x[lo] - xv) <= Math.abs(L.x[hi] - xv) ? lo : hi;
        if (gx == null) { gx = L.x[i]; lines.push([s.x.hoverLabel || s.x.label || "x", s.x.plain ? String(L.x[i]) : fmtNum(L.x[i], s.x.hoverDecimals)]); }
        lines.push([L.name, fmtNum(L.y[i], s.y.hoverDecimals) + (s.y.unit || ""), L.color || SG.series[0]]);
        if (L.kind !== "bars") {
          ctx.beginPath(); ctx.arc(this.sx(L.x[i]), this.sy(L.y[i]), 4, 0, Math.PI * 2);
          ctx.fillStyle = L.color || SG.series[0]; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
      ctx.strokeStyle = "rgba(6,47,79,.25)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(this.sx(gx) + 0.5, b.t); ctx.lineTo(this.sx(gx) + 0.5, b.b); ctx.stroke();
    } else {
      lines.push([s.x.hoverLabel || s.x.label || "x", fmtNum(this.ix(hv.px))]);
      lines.push([s.y.hoverLabel || s.y.label || "y", fmtNum(this.iy(hv.py))]);
    }
    if (s.onClick && s.clickHint) lines.push([s.clickHint, ""]);
    ctx.font = "500 12px Montserrat, system-ui, sans-serif";
    const tw = Math.max.apply(null, lines.map((l) => ctx.measureText(l[0] + (l[1] ? ":  " + l[1] : "")).width)) + 26;
    const th = lines.length * 18 + 10;
    let tx = hv.px + 14, ty = hv.py + 14;
    if (tx + tw > b.r) tx = hv.px - tw - 14;
    if (ty + th > b.b) ty = hv.py - th - 10;
    ctx.fillStyle = "rgba(6,47,79,.94)"; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tx, ty, tw, th, 6); else ctx.rect(tx, ty, tw, th);
    ctx.fill();
    ctx.textAlign = "left";
    lines.forEach((l, i) => {
      const y = ty + 14 + i * 18;
      let x = tx + 10;
      if (l[2]) { ctx.fillStyle = l[2]; ctx.fillRect(x, y - 4, 8, 8); x += 14; }
      ctx.fillStyle = l[1] ? "#D5DEE3" : "#F2D15C";
      ctx.fillText(l[0] + (l[1] ? ":" : ""), x, y);
      if (l[1]) { ctx.fillStyle = "#fff"; ctx.font = "600 12px Montserrat, system-ui, sans-serif";
        ctx.fillText(l[1], x + ctx.measureText(l[0] + ":  ").width - 2, y); ctx.font = "500 12px Montserrat, system-ui, sans-serif"; }
    });
  }
}
