/* pages.js — the views. Each render(view, ...) draws the page and returns a refresh() the router calls on every
   simulated hour, so live numbers update without rebuilding the page. */

const H_LABEL = (start) => (i, long) => { const d = CBSim.addHours(start, i); return long ? fmt.time(d) : (d.getUTCHours() === 0 ? fmt.day(d).split(",")[0] : fmt.clock(d)); };
const histLabel = () => { const h = Live.history.slice(-48); return (i, long) => { const d = CBSim.addHours(START, h[i] ? h[i].t : 0); return long ? fmt.time(d) : (d.getUTCHours() === 0 ? fmt.day(d).split(",")[0] : fmt.clock(d)); }; };
const levelChip = { crit: "risk", warn: "warn", ok: "ok", info: "" };

/* ============================================================ Overview */
function renderOverview(view) {
  view.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">${esc(SYS.name)} · live</div><h1>System command center</h1>
        <p>Census, capacity, early warnings and money across six sites, updated every simulated hour. Press play in the top bar, or step an hour at a time.</p></div>
      <div class="row" id="ovScenario"></div>
    </div>
    <div class="grid g5" id="ovKpis"></div>
    <div class="grid g-2-1 mt">
      <div class="card"><div class="card-h"><div><h2>Facilities</h2><p>Inpatient occupancy by site. Click a site to open its census board.</p></div><div class="legend" id="ovLegend"></div></div>
        <div class="map-wrap"><svg class="sysmap" id="ovMap" viewBox="0 0 1000 560" role="img" aria-label="System map"></svg></div>
        <div class="fac-list" id="ovFacs"></div></div>
      <div class="card feed-card"><div class="card-h"><div><h2>Live feed</h2><p>Diversions, declined transfers, rapid responses, scenario events.</p></div></div><div class="feed" id="ovFeed"></div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-h"><div><h3>Main-campus occupancy, last 48 h</h3><p>500 inpatient beds at Calloway Bay Medical Center</p></div></div>${canvasBox("ovOcc")}</div>
      <div class="card"><div class="card-h"><div><h3>Main ED, last 48 h</h3><p>Patients in the department and admitted patients boarding for a bed</p></div></div>${canvasBox("ovEd")}</div>
    </div>`;
  legendOcc($("#ovLegend"));
  const mainBedIdx = UNITS.map((u, i) => i).filter((i) => UNITS[i].facility === "CBMC" && isBedUnit(UNITS[i]));
  const occ = chart("ovOcc", { type: "line", series: [{ name: "Occupancy", y: [], color: "var(--c1)", area: true }], yFmt: (v) => v.toFixed(0) + "%", yMin: 60, yMax: 100 });
  const ed = chart("ovEd", { type: "line", legend: true, series: [{ name: "In department", y: [], color: "var(--c1)" }, { name: "Boarding", y: [], color: "var(--risk)", area: true }],
    hlines: [{ y: UNITS[UIX.ED].beds, label: "bays", color: "var(--muted-fg)" }, { y: UNITS[UIX.ED].beds * SYS.ed_divert_at, label: "diversion", color: "var(--risk)" }], yMin: 0 });
  $("#ovMap").addEventListener("click", (e) => { const g = e.target.closest("[data-fac]"); if (g) location.hash = "#/census/" + g.dataset.fac; });
  const refresh = () => {
    const s = snapshot(), week = moneyFor(7), pl = CBSim.pl(P, week), open = Live.alerts.filter((a) => a.status === "open").length;
    const mainDiv = s.rec.sat.ED;
    const prev = Live.history.at(-25) ? mainOcc(Live.history.at(-25)) : s.main;
    const div = Object.entries(s.rec.sat).filter(([, v]) => v).map(([k]) => UNITS[UIX[k]].name);
    $("#ovKpis").innerHTML =
      kpi(`${ICON.bed} System census`, `${fmt.n(s.census)} <span class="of">/ ${fmt.n(s.beds)}</span>`, `${fmt.pct(s.census / s.beds)} of inpatient beds`) +
      kpi(`${ICON.trend} Main campus`, fmt.pct(s.main), `${s.main - prev >= 0 ? "▲" : "▼"} ${Math.abs((s.main - prev) * 100).toFixed(1)} pts vs 24 h ago`, s.main >= .9 ? "alert" : "accent") +
      kpi(`${ICON.pulse} Main ED`, `${fmt.n(s.edMain)} <span class="of">/ ${UNITS[UIX.ED].beds} bays</span>`, mainDiv ? `<span class="txt-risk">On ambulance diversion</span>` : div.length ? `<span class="txt-warn">${esc(div.join(", "))} diverting</span>` : `${fmt.n(s.edBoard)} boarding for a bed`, mainDiv ? "alert" : "") +
      kpi(`${ICON.heart} Early warnings`, `${open} open`, `${Live.stats.caught}/${Live.stats.events} deteriorations caught early`, open >= 6 ? "alert" : "") +
      kpi(`${ICON.dollar} Operating income, 7 days`, fmt.big(pl.operating), `${fmt.pct(pl.margin, 1)} margin on ${fmt.big(pl.revenue)}`, pl.operating < 0 ? "alert" : "");
    $("#ovScenario").innerHTML = scenarioChip();
    drawMap($("#ovMap"), s);
    $("#ovFacs").innerHTML = FACS.map((f) => {
      const F = s.fac[f.id], o = F.beds ? F.census / F.beds : 0;
      return `<a class="fac-row" href="#/census/${f.id}"><div><b>${esc(f.name)}</b><span class="muted small">${esc(FAC_KIND[f.kind])}</span></div>
        <div class="fac-bar">${bar(o, occColor(o))}</div><div class="num r">${fmt.n(F.census)}/${F.beds}</div><div class="num r ${occClass(o)}-txt">${fmt.pct(o)}</div></a>`;
    }).join("");
    $("#ovFeed").innerHTML = feedHtml(Live.events.slice(0, 40));
    const h = Live.history.slice(-48);
    occ.update({ series: [{ name: "Occupancy", y: h.map((r) => mainOcc(r) * 100), color: "var(--c1)", area: true },
      { name: "Staffed capacity", y: h.map((r) => staffedShare(mainBedIdx, r.callout, CBSim.addHours(START, r.t)) * 100), color: "var(--c2)", dash: true, width: 1.5 }],
      hlines: [{ y: 90, label: "90%", color: "var(--warn)" }], legend: true, xLabel: histLabel(), n: h.length });
    ed.update({ series: [{ name: "In department", y: h.map((r) => r.C[UIX.ED] + r.C[UIX.EDT]), color: "var(--c1)" }, { name: "Boarding", y: h.map((r) => r.B[UIX.ED]), color: "var(--risk)", area: true }], xLabel: histLabel(), n: h.length });
  };
  refresh();
  return refresh;
}

function legendOcc(el) {
  el.innerHTML = [["var(--ok)", "< 75%"], ["var(--primary)", "75–88%"], ["var(--warn)", "88–95%"], ["var(--crit)", "≥ 95%"]]
    .map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join("");
}
function scenarioChip() {
  const on = Live.effects.length;
  return `<a href="#/environment" class="chip ${on ? "warn" : "ok"} big-chip">${on ? "⚠" : "●"} ${esc(Live.scenarioName)}</a>`;
}
function feedHtml(list) {
  if (!list.length) return '<div class="empty small">Nothing yet. Press play.</div>';
  return list.map((e) => `<div class="feed-row lvl-${e.level}">
    <div class="feed-dot"></div>
    <div><div class="feed-t">${e.pid ? `<a href="#/patient/${e.pid}">${esc(e.title)}</a>` : esc(e.title)}</div><div class="small muted">${esc(e.body || "")}</div></div>
    <div class="small muted num">${fmt.time(CBSim.addHours(START, e.t)).replace(/^\w+, /, "")}</div></div>`).join("");
}

function drawMap(svg, s) {
  // roads from every offsite to the main campus, then site nodes sized by beds and ringed by occupancy
  const main = FAC.CBMC, X = (f) => 70 + f.x * 860, Y = (f) => 40 + f.y * 480;
  const ring = (cx, cy, r, frac, color) => {
    const a = Math.min(frac, 0.9999) * 2 * Math.PI, x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
    return `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
  };
  let out = `<defs><pattern id="mapgrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern></defs>
    <rect x="0" y="0" width="1000" height="560" fill="url(#mapgrid)" rx="10"/>
    <path d="M0 470 C 180 430, 260 520, 420 500 S 700 420, 1000 470 L1000 560 L0 560 Z" fill="var(--water)"/>`;
  FACS.forEach((f) => { if (f.id !== "CBMC") out += `<line x1="${X(main)}" y1="${Y(main)}" x2="${X(f)}" y2="${Y(f)}" class="road"/>`; });
  FACS.forEach((f) => {
    const F = s.fac[f.id], o = F.beds ? F.census / F.beds : 0, r = 16 + Math.sqrt(F.beds) * 2.2, cx = X(f), cy = Y(f);
    const ed = F.edBays ? `<text x="${cx}" y="${cy + r + 34}" class="map-sub">ED ${fmt.n(F.ed)}/${F.edBays}${s.rec.sat[UNITS.find((u) => u.facility === f.id && u.kind === "ed" && !u.parent)?.id] ? " · DIVERT" : ""}</text>` : "";
    out += `<g class="map-node" data-fac="${f.id}" tabindex="0">
      <circle cx="${cx}" cy="${cy}" r="${r + 9}" class="halo ${o >= .95 ? "pulse" : ""}" style="--c:${occColor(o)}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" class="node-bg"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--muted)" stroke-width="7"/>
      ${ring(cx, cy, r, o, occColor(o))}
      <text x="${cx}" y="${cy + 5}" class="map-pct">${fmt.pct(o)}</text>
      <text x="${cx}" y="${cy + r + 19}" class="map-name">${esc(f.name.replace(/ (Medical Center|Community Hospital|Freestanding ED|Surgery Center|Rehabilitation Hospital|Behavioral Health)$/, ""))}</text>${ed}
    </g>`;
  });
  svg.innerHTML = out;
}

/* ============================================================ Census & forecast */
let FC = { hours: 72, result: null, running: false, scope: null };
function renderCensus(view, fid) {
  const scope = fid && FAC[fid] ? fid : "system";
  const tabs = [["system", "All facilities"]].concat(FACS.map((f) => [f.id, f.name.replace(/ (Medical Center|Community Hospital|Freestanding ED|Surgery Center|Rehabilitation Hospital|Behavioral Health)$/, "")]));
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Census &amp; forecast</div><h1>${scope === "system" ? "All facilities" : esc(FAC[scope].name)}</h1>
      <p>${scope === "system" ? "Every unit in the system, live. The forecast runs Monte Carlo paths forward from this exact hour, with the active scenario." : esc(FAC[scope].blurb)}</p></div>
      <div class="row">${scenarioChip()}</div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/census${k === "system" ? "" : "/" + k}" class="${k === scope ? "on" : ""}">${esc(l)}</a>`).join("")}</div>
    <div class="grid g4" id="ceKpis"></div>
    <div class="card mt">
      <div class="card-h"><div><h2>Forecast</h2><p id="fcSub">Median and 10–90% band across simulated paths.</p></div>
        <div class="row">${seg("fcH", [[24, "24 h"], [72, "3 days"], [168, "7 days"]], FC.hours)}<button class="btn primary" id="fcRun">Re-run</button></div></div>
      <div class="grid g-2-1"><div>${canvasBox("fcChart", "tall")}<div class="progress" id="fcProg"></div></div><div id="fcStats" class="fc-stats"></div></div>
    </div>
    <div class="card mt"><div class="card-h"><div><h2>Unit board</h2><p>Census, beds and patients waiting to move (boarding). The last column is the forecast chance the unit fills within the horizon.</p></div><div class="legend" id="ceLegend"></div></div>
      <div class="table-wrap"><table id="ceTable"></table></div></div>`;
  legendOcc($("#ceLegend"));
  const fc = chart("fcChart", { type: "line", series: [], legend: true, yMin: 0 });
  const runFc = () => {
    if (FC.running) return;
    FC.running = true; $("#fcRun").disabled = true;
    forecast({ hours: FC.hours, paths: 120, onProgress: (p) => { const el = $("#fcProg"); if (el) el.style.width = (p * 100).toFixed(0) + "%"; },
      onDone: (res) => { FC.result = res; FC.t = Live.t; FC.running = false; const b = $("#fcRun"); if (b) b.disabled = false; const el = $("#fcProg"); if (el) el.style.width = "0"; drawFc(); drawTable(); } });
  };
  const drawFc = () => {
    const r = FC.result; if (!r || !$("#fcChart")) return;
    const key = scope === "system" ? "system" : scope, q = r.q[key];
    const beds = scope === "system" ? FACS.reduce((s, f) => s + facBeds(f.id), 0) : facBeds(scope);
    const asPct = beds > 0;
    const f = (v) => asPct ? v / beds * 100 : v;
    fc.update({ n: r.hours, xLabel: H_LABEL(r.at), bands: [{ lo: q.p10.map(f), hi: q.p90.map(f), color: "var(--c1)", name: "10–90%" }],
      series: [{ name: "Median", y: q.p50.map(f), color: "var(--c1)" }], yMin: asPct ? Math.max(0, Math.floor(Math.min(...q.p10.map(f)) / 5) * 5 - 5) : 0,
      yMax: asPct ? 100 : undefined, yFmt: (v) => asPct ? v.toFixed(0) + "%" : fmt.n(v),
      hlines: asPct ? [{ y: 90, label: "90%", color: "var(--warn)" }, { y: staffedShare(UNITS.map((u, i) => i).filter((i) => isBedUnit(UNITS[i]) && (scope === "system" || UNITS[i].facility === scope))) * 100, label: "staffed capacity", color: "var(--c2)" }] : [] });
    const peakFrac = (x) => fmt.pct(x / beds);
    const over90 = q.peaks.filter((p) => p / beds >= .9).length / q.peaks.length;
    $("#fcSub").textContent = `${r.paths} paths from ${fmt.time(r.at)} · ${Live.scenarioName}${FC.t !== Live.t ? ` · ${Live.t - FC.t} h old` : ""}`;
    $("#fcStats").innerHTML = `
      <div class="stat"><span>Median peak</span><b>${asPct ? peakFrac(q.peakP50) : fmt.n(q.peakP50)}</b></div>
      <div class="stat"><span>Bad-case peak (90th pct)</span><b>${asPct ? peakFrac(q.peakP90) : fmt.n(q.peakP90)}</b></div>
      <div class="stat"><span>Chance the peak tops 90%</span><b>${fmt.pct(over90)}</b></div>
      ${scope === "system" || scope === "CBMC" ? `<div class="stat"><span>Main ED boarders, peak</span><b>${fmt.n(r.edBoardPeak)}</b></div>
      <div class="stat"><span>Main ED diversion</span><b>${fmt.n(r.divMean, 1)} h</b></div>` : ""}
      <div class="stat"><span>Transfers declined</span><b>${fmt.n(r.lost, 1)}</b></div>
      <div class="stat"><span>System operating income</span><b>${fmt.big(r.operating)}</b></div>`;
  };
  const drawTable = () => {
    const s = snapshot(), last24 = Live.history.slice(-24), r = FC.result;
    const staff = Object.fromEntries(staffingAt(Live.history.at(-1)).map((x) => [x.i, x]));
    const fids = scope === "system" ? FACS.map((f) => f.id) : [scope];
    let rows = `<thead><tr><th>Unit</th><th>Type</th><th class="r">Census</th><th class="r">Beds</th><th style="width:22%">Occupancy</th><th class="r" title="Core RNs on shift / RNs needed at the unit's ratio">RNs on / need</th><th class="r">Boarding</th><th class="r">Admitted, 24 h</th><th class="r">Discharged, 24 h</th><th class="r">Forecast peak</th><th class="r">P(full)</th></tr></thead><tbody>`;
    fids.forEach((f) => {
      const units = facUnits(f);
      let wing = null;
      rows += `<tr class="grp"><td colspan="11">${esc(FAC[f].name)} <span class="muted small">· ${esc(FAC_KIND[FAC[f].kind])}</span></td></tr>`;
      units.forEach(([u, i]) => {
        if (u.wing !== wing && scope !== "system") { wing = u.wing; rows += `<tr class="sub"><td colspan="11">${esc(wing)}</td></tr>`; }
        const c = s.C[i] + (u.id === "ED" ? s.C[UIX.EDT] : 0), o = unitOcc(i, s.C);
        const inn = last24.reduce((a, h) => a + h.cases[i], 0), out = last24.reduce((a, h) => a + h.home[i], 0);
        const pf = r ? r.unitFull[i] : null, pk = r ? r.unitPeak[i] : null;
        const status = !u.capped ? (s.rec.sat[u.id] ? chip("Diversion", "risk") : "") : o >= 1 ? chip("Full", "risk") : o >= .95 ? chip("Tight", "warn") : "";
        rows += `<tr><td><b>${esc(u.name)}</b> ${status}</td><td class="muted small">${esc(KIND_LABEL[u.kind] || u.kind)}</td>
          <td class="r num">${fmt.n(c)}</td><td class="r num">${bedsNow(i)}${bedsNow(i) > u.beds ? ' <span class="chip warn">surge</span>' : ""}${u.capped ? "" : " bays"}</td>
          <td><div class="occ">${staffBar(o, staff[i], u)}<span class="small muted num">${fmt.pct(o)}</span></div></td>
          <td class="r num">${staff[i] ? `<span class="${staff[i].gap > 0 ? "txt-risk" : ""}">${staff[i].on}/${staff[i].need}</span>` : "—"}</td>
          <td class="r num ${s.B[i] >= 3 ? "txt-risk" : ""}">${fmt.n(s.B[i])}</td><td class="r num">${fmt.n(inn)}</td><td class="r num">${fmt.n(out)}</td>
          <td class="r num">${pk == null ? "…" : fmt.n(pk)}</td>
          <td class="r num">${pf == null || !u.capped || u.kind === "or" || u.kind === "pacu" ? "—" : `<span class="pf" style="--p:${pf}">${fmt.pct(pf)}</span>`}</td></tr>`;
      });
    });
    $("#ceTable").innerHTML = rows + "</tbody>";
  };
  const kpis = () => {
    const s = snapshot();
    const key = scope;
    const F = key === "system" ? { census: s.census, beds: s.beds, board: Object.values(s.fac).reduce((a, f) => a + f.board, 0) } : s.fac[key];
    const h24 = Live.history.slice(-24);
    const idx = UNITS.map((u, i) => i).filter((i) => key === "system" || UNITS[i].facility === key);
    const adm = h24.reduce((a, h) => a + idx.reduce((b, i) => b + h.arrived[i], 0), 0), dis = h24.reduce((a, h) => a + idx.reduce((b, i) => b + h.home[i], 0), 0);
    const o = F.beds ? F.census / F.beds : 0;
    $("#ceKpis").innerHTML = kpi("Inpatient census", `${fmt.n(F.census)} <span class="of">/ ${fmt.n(F.beds)}</span>`, `${fmt.pct(o)} occupied`, o >= .9 ? "alert" : "accent") +
      kpi("Waiting for a bed", fmt.n(F.board), "Patients boarding in their current unit") +
      kpi("Arrivals, last 24 h", fmt.n(adm), "External arrivals admitted to a bed or bay") +
      kpi("Discharges, last 24 h", fmt.n(dis), "Left the system (home or post-acute)");
  };
  onSeg("fcH", (v) => { FC.hours = Number(v); runFc(); });
  $("#fcRun").addEventListener("click", runFc);
  kpis(); drawTable();
  if (!FC.result || FC.result.hours !== FC.hours || Live.t - FC.t > 6) runFc(); else drawFc();
  return () => { kpis(); drawTable(); if (FC.result) { const el = $("#fcSub"); if (el && FC.t !== Live.t) el.textContent = el.textContent.replace(/ · \d+ h old$/, "") + ` · ${Live.t - FC.t} h old`; } };
}

/* ============================================================ Patient watch */
function staffBar(o, st, u) {
  const mark = st && u.beds ? `<i class="staff-mark" style="left:${Math.min(100, st.staffedBeds / u.beds * 100).toFixed(1)}%" title="Staffed for ${st.staffedBeds} of ${u.beds}"></i>` : "";
  return `<div class="bar-track">${mark}<div class="bar-fill" style="width:${(Math.min(1, o) * 100).toFixed(1)}%;background:${occColor(o)}"></div></div>`;
}

/* ============================================================ Staffing */
let SF = { result: null, t: -1, running: false, shift: 0, q: "p75" };
function renderStaffing(view) {
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Staffing</div><h1>Nurse staffing overlay</h1>
      <p>Each unit has a staffing grid: core RNs for every day and 12-hour shift (07:00, 19:00), set from a typical week's census at the unit's patients-per-RN ratio. When census or call-outs open a gap, the plan fills it from the site's float pool, then overtime, then agency.</p></div>
      <div class="row">${scenarioChip()}<button class="btn primary" id="sfRun">Refresh outlook</button></div></div>
    <div class="grid g5" id="sfKpis"></div>
    <div class="card mt"><div class="card-h"><div><h2>Shift outlook</h2><p id="sfSub">RNs short (red) or spare (green) per unit. Click a shift for its fill plan.</p></div>
        <div class="row"><span class="progress-inline" id="sfProg"></span><span class="small muted">Plan to</span>${seg("sfQ", [["p50", "Median census"], ["p75", "75th percentile"]], SF.q)}</div></div>
      <div class="table-wrap"><table id="sfGrid" class="shift-grid"></table></div></div>
    <div class="grid g-2-1 mt">
      <div class="card"><div class="card-h"><div><h2 id="sfPlanTitle">Fill plan</h2><p>Float pool first (already on payroll), then overtime at ${SYS.ot_mult}×, then agency at ${SYS.agency_mult}×.</p></div></div><div class="table-wrap"><table id="sfPlan"></table></div></div>
      <div class="card"><div class="card-h"><div><h3>RNs on shift vs needed, system</h3><p>Last 48 h; dashed = core RNs on shift after call-outs</p></div></div>${canvasBox("sfChart", "tall")}</div>
    </div>
    <div class="card mt"><div class="card-h"><div><h2>Ratio compliance, last 24 h</h2><p>Share of hours each unit's core staff covered its census at ratio, and RN-hours that had to come from float, overtime or agency.</p></div></div>
      <div class="table-wrap"><table id="sfComp"></table></div></div>`;
  const ch = chart("sfChart", { type: "line", series: [], legend: true, yMin: 0 });
  const run = () => {
    if (SF.running) return; SF.running = true; $("#sfRun").disabled = true;
    forecast({ hours: 84, paths: 100, onProgress: (p) => { const el = $("#sfProg"); if (el) el.textContent = `Forecasting… ${Math.round(p * 100)}%`; },
      onDone: (res) => { SF = { ...SF, result: res, t: Live.t, running: false, outlook: shiftOutlook(res, 6, SF.q) }; const b = $("#sfRun"); if (b) b.disabled = false; const el = $("#sfProg"); if (el) el.textContent = ""; drawOutlook(); } });
  };
  $("#sfRun").addEventListener("click", run);
  onSeg("sfQ", (v) => { SF.q = v; if (SF.result) { SF.outlook = shiftOutlook(SF.result, 6, v); drawOutlook(); } });
  $("#sfGrid").addEventListener("click", (e) => { const th = e.target.closest("[data-shift]"); if (th) { SF.shift = Number(th.dataset.shift); drawOutlook(); } });
  const drawOutlook = () => {
    const O = SF.outlook; if (!O || !$("#sfGrid")) return;
    const k = Math.min(SF.shift, O.length - 1);
    $("#sfSub").textContent = `${SF.result.paths} paths from ${fmt.time(SF.result.at)} · ${Live.scenarioName}${SF.t !== Live.t ? ` · ${Live.t - SF.t} h old` : ""} · planning to each shift's ${SF.q === "p50" ? "median" : "75th-percentile"} peak census. Cells show RNs short (−) or spare (+) against the grid.`;
    let html = `<thead><tr><th>Unit</th><th class="r">Ratio</th>${O.map((s, j) => `<th class="r shift-h ${j === k ? "sel" : ""}" data-shift="${j}">${esc(s.label)}${s.now ? " <span class='chip'>now</span>" : ""}${s.callout ? `<div class="small txt-warn">${fmt.pct(s.callout)} call-outs</div>` : ""}<div class="small muted">${fmt.big(s.plan.cost)}</div></th>`).join("")}</tr></thead><tbody>`;
    let fac = null;
    STAFF_UNITS.forEach((i, row) => {
      const u = UNITS[i];
      if (u.facility !== fac) { fac = u.facility; html += `<tr class="grp"><td colspan="${2 + O.length}">${esc(FAC[fac].name)}</td></tr>`; }
      html += `<tr><td>${esc(u.name)}</td><td class="r num muted">1:${u.rn_ratio}</td>` + O.map((s, j) => {
        const x = s.units[row], g = x.gap;
        const cls = g >= 2 ? "g-crit" : g === 1 ? "g-warn" : g <= -2 ? "g-spare" : "g-ok";
        return `<td class="r num cell ${cls} ${j === k ? "sel" : ""}" title="${esc(u.name)}, ${esc(s.label)}: census up to ${x.peak.toFixed(0)} (median ${x.med.toFixed(0)}), ${x.need} RNs needed, ${x.on} on the grid">${g > 0 ? "−" + g : g < 0 ? "+" + -g : "✓"}<span class="cell-sub">${x.on}/${x.need}</span></td>`;
      }).join("") + "</tr>";
    });
    $("#sfGrid").innerHTML = html + "</tbody>";
    const P = O[k].plan;
    $("#sfPlanTitle").textContent = `Fill plan: ${O[k].label}`;
    $("#sfPlan").innerHTML = `<thead><tr><th>Unit</th><th class="r">Short</th><th class="r">Float</th><th class="r">Overtime</th><th class="r">Agency</th><th class="r">Premium cost</th></tr></thead><tbody>` +
      (P.rows.length ? P.rows.map((r) => `<tr><td>${esc(UNITS[r.i].name)} <span class="muted small">${esc(FAC[UNITS[r.i].facility].name.split(" ")[0])}</span></td><td class="r num txt-risk">${r.gap}</td><td class="r num">${r.float || ""}</td><td class="r num txt-warn">${r.ot || ""}</td><td class="r num txt-risk">${r.agency || ""}</td><td class="r num">${fmt.big(r.cost)}</td></tr>`).join("")
        + `<tr class="tot"><td>Total</td><td class="r num">${P.rows.reduce((s, r) => s + r.gap, 0)}</td><td class="r num">${P.totals.float}</td><td class="r num">${P.totals.ot}</td><td class="r num">${P.totals.agency}</td><td class="r num">${fmt.big(P.cost)}</td></tr>`
        : `<tr><td colspan="6" class="empty small">No gaps this shift: core staffing covers the forecast census.</td></tr>`) +
      `</tbody>` + `<tfoot><tr><td colspan="6" class="small muted">Float pool left: ${Object.entries(P.floatLeft).filter(([, v]) => v > 0).map(([f, v]) => `${esc(FAC[f].name.split(" ")[0])} ${v}`).join(" · ") || "none"}</td></tr></tfoot>`;
  };
  const refresh = () => {
    const now = staffingAt(Live.history.at(-1)), on = now.reduce((s, x) => s + x.on, 0), need = now.reduce((s, x) => s + x.need, 0);
    const short = now.filter((x) => x.gap > 0), comp = ratioCompliance(24);
    const prem = moneyFor(1), pl = CBSim.pl(P, prem);
    const covered = STAFF_UNITS.reduce((s, i) => s + comp[i].share, 0) / STAFF_UNITS.length;
    $("#sfKpis").innerHTML = kpi("RNs on shift (core)", fmt.n(on), `${now.reduce((s, x) => s + x.out, 0)} called out`) +
      kpi("RNs needed now", fmt.n(need), `at each unit's patients-per-RN ratio`, need > on ? "alert" : "accent") +
      kpi("Units short right now", `${short.length} <span class="of">/ ${STAFF_UNITS.length}</span>`, short.length ? esc(short.sort((a, b) => b.gap - a.gap).slice(0, 3).map((x) => UNITS[x.i].name).join(", ")) : "All units covered by core staff") +
      kpi("Ratio compliance, 24 h", fmt.pct(covered), "Average share of hours covered by core staff") +
      kpi("Overtime + agency today", fmt.big(pl.ot + pl.agency), `${fmt.pct((pl.ot + pl.agency) / ((pl.core + pl.ot + pl.agency) || 1), 1)} of nursing spend`);
    const h = Live.history.slice(-48), series = h.map((r) => staffingAt(r));
    ch.update({ n: h.length, xLabel: histLabel(), series: [
      { name: "RNs needed", y: series.map((s) => s.reduce((a, x) => a + x.need, 0)), color: "var(--risk)" },
      { name: "Core on shift", y: series.map((s) => s.reduce((a, x) => a + x.on, 0)), color: "var(--c1)", dash: true, step: true }], yMin: undefined });
    $("#sfComp").innerHTML = `<thead><tr><th>Unit</th><th>Facility</th><th class="r">Grid RNs now</th><th style="width:30%">Hours covered at ratio</th><th class="r">Hours short</th><th class="r">RN-hours filled</th></tr></thead><tbody>` +
      STAFF_UNITS.map((i) => { const c = comp[i]; return `<tr><td>${esc(UNITS[i].name)}</td><td class="small muted">${esc(FAC[UNITS[i].facility].name)}</td><td class="r num">${scheduledRN(i)}</td>
        <td><div class="occ">${bar(c.share, c.share >= .95 ? "var(--ok)" : c.share >= .75 ? "var(--warn)" : "var(--crit)")}<span class="small muted num">${fmt.pct(c.share)}</span></div></td>
        <td class="r num ${c.over ? "txt-risk" : ""}">${c.over}</td><td class="r num">${c.rnHoursShort || ""}</td></tr>`; }).join("") + "</tbody>";
    if (SF.outlook) drawOutlook();
  };
  refresh();
  if (!SF.result || Live.t - SF.t > 6) run(); else drawOutlook();
  return refresh;
}

function renderPatients(view) {
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Patient watch</div><h1>Early-warning monitor</h1>
      <p>Every inpatient's simulated vital signs, scored with NEWS2 (and qSOFA for sepsis). A few patients are quietly deteriorating; catch them before they crash. Escalate to send the rapid-response team.</p></div></div>
    <div class="card settings"><div class="row wrap-gap">
      <div><div class="small muted">Monitoring</div>${seg("pwMode", [["continuous", "Continuous (every 15 min)"], ["q4h", "Spot checks every 4 h"]], Live.monitor)}</div>
      <div><div class="small muted">Alert rule</div>${seg("pwRule", Object.entries(RULES).map(([k, r]) => [k, r.label]), Live.rule)}</div>
    </div></div>
    <div class="grid g5 mt" id="pwKpis"></div>
    <div class="grid g-2-1 mt">
      <div class="card"><div class="card-h"><div><h2>Watch list</h2><p>Highest NEWS2 first, on the latest reading the chosen schedule would have taken.</p></div>
        <input class="input" id="pwFilter" placeholder="Filter by unit or name" style="max-width:220px"></div>
        <div class="table-wrap"><table id="pwTable"></table></div></div>
      <div class="card"><div class="card-h"><div><h2>Alert queue</h2><p>Open alerts. Escalate or acknowledge.</p></div></div><div id="pwAlerts" class="alerts"></div></div>
    </div>`;
  onSeg("pwMode", (v) => { Live.monitor = v; store.set("monitor", v); Live.emit(); });
  onSeg("pwRule", (v) => { Live.rule = v; store.set("rule", v); Live.emit(); });
  let filter = "";
  $("#pwFilter").addEventListener("input", (e) => { filter = e.target.value.toLowerCase(); refresh(); });
  $("#pwTable").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-pid]"); if (tr) location.hash = "#/patient/" + tr.dataset.pid; });
  $("#pwAlerts").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    if (b.dataset.act === "esc") Live.escalate(b.dataset.pid); else Live.acknowledge(Number(b.dataset.id));
  });
  const refresh = () => {
    const pts = Live.allPatients().filter((p) => p.last);
    const st = Live.stats, open = Live.alerts.filter((a) => a.status === "open" && Live.findPatient(a.pid));
    const fp = st.patientHours ? st.falseAlerts / (st.patientHours / 24) * 100 : 0;
    const leads = [...st.leads].sort((a, b) => a - b);
    $("#pwKpis").innerHTML = kpi("Monitored patients", fmt.n(pts.length), `${MONITORED.length} inpatient units`) +
      kpi("Open alerts", fmt.n(open.length), `${open.filter((a) => a.score >= 7).length} with NEWS2 ≥ 7`, open.length >= 6 ? "alert" : "") +
      kpi("Caught before crisis", st.events + st.early ? `${st.caught + st.early}/${st.events + st.early}` : "—", `${st.early} escalated early, ${st.events} rapid-response calls`) +
      kpi("Median warning", leads.length ? quantile(leads, .5).toFixed(1) + " h" : "—", "Alert to crisis, for alerted crises") +
      kpi("False alerts", fmt.n(fp, 1), "per 100 patient-days, this session");
    const rows = pts.filter((p) => !filter || (UNITS[p.uix].name + " " + p.name + " " + p.bed).toLowerCase().includes(filter))
      .sort((a, b) => b.last.news2 - a.last.news2 || b.last.hr - a.last.hr).slice(0, 30);
    $("#pwTable").innerHTML = `<thead><tr><th>Patient</th><th>Unit · bed</th><th class="r">NEWS2</th><th class="r">HR</th><th class="r">BP</th><th class="r">RR</th><th class="r">SpO₂</th><th class="r">Temp</th><th class="r">qSOFA</th><th class="r">Read</th></tr></thead><tbody>` +
      rows.map((p) => { const r = p.last; return `<tr class="click" data-pid="${p.id}"><td><b>${esc(p.name)}</b> <span class="muted small">${p.age}</span></td>
        <td class="small">${esc(UNITS[p.uix].name)} · ${esc(p.bed)}</td><td class="r">${newsChip(r.news2, r.red)}</td>
        <td class="r num ${r.hr > 110 || r.hr <= 50 ? "txt-risk" : ""}">${r.hr}</td><td class="r num ${r.sbp <= 100 ? "txt-risk" : ""}">${r.sbp}</td>
        <td class="r num ${r.rr >= 21 ? "txt-risk" : ""}">${r.rr}</td><td class="r num ${r.spo2 <= 93 ? "txt-risk" : ""}">${r.spo2}${r.o2 ? '<span class="o2">O₂</span>' : ""}</td>
        <td class="r num ${r.temp >= 38.1 ? "txt-risk" : ""}">${r.temp.toFixed(1)}</td><td class="r num">${r.qsofa >= 2 ? chip(r.qsofa, "risk") : r.qsofa}</td>
        <td class="r small muted">${fmt.ago(Live.t - r.t + 0.01)}</td></tr>`; }).join("") + "</tbody>";
    $("#pwAlerts").innerHTML = open.length ? open.slice(0, 25).map((a) => {
      const f = Live.findPatient(a.pid); if (!f) return "";
      return `<div class="alert-row ${a.score >= 7 ? "hi" : ""}"><div class="alert-score">${a.score}</div>
        <div><a href="#/patient/${a.pid}"><b>${esc(f.p.name)}</b></a><div class="small muted">${esc(UNITS[f.p.uix].name)} · ${esc(f.p.bed)} · ${fmt.ago(Live.t - a.t + 0.01)}${a.red ? " · red score" : ""}${a.qsofa >= 2 ? " · qSOFA " + a.qsofa : ""}</div></div>
        <div class="row nowrap"><button class="btn small primary" data-act="esc" data-pid="${a.pid}">Escalate</button><button class="btn small" data-act="ack" data-id="${a.id}">Ack</button></div></div>`;
    }).join("") : '<div class="empty small">No open alerts.</div>';
  };
  refresh();
  return refresh;
}
function newsChip(s, red) { const c = s >= 7 ? "risk" : s >= 5 || red ? "warn" : s >= 1 ? "" : "ok"; return `<span class="chip news ${c}">${s}</span>`; }

function renderPatient(view, pid) {
  const draw = () => {
    const f = Live.findPatient(pid);
    if (!f) { view.innerHTML = `<div class="card empty">This patient has left the unit (discharged, or moved and re-admitted under a new record). <a href="#/patients">Back to the watch list</a></div>`; return null; }
    return f.p;
  };
  let p = draw(); if (!p) return () => {};
  let reveal = false;
  view.innerHTML = `
    <div class="page-head"><div class="mem-head"><div class="avatar">${esc(p.name.split(" ").map((x) => x[0]).join(""))}</div>
      <div><div class="eyebrow">Patient ${esc(p.id)} · synthetic</div><h1>${esc(p.name)}</h1><div class="facts" id="ptFacts"></div></div></div>
      <div class="row"><button class="btn" id="ptReveal">Reveal planted truth</button><button class="btn primary" id="ptEsc">Escalate to rapid response</button></div></div>
    <div id="ptTruth"></div>
    <div class="grid g5" id="ptKpis"></div>
    <div class="card mt"><div class="card-h"><div><h2>NEWS2</h2><p>Continuous readings (line) and the readings a 4-hourly schedule would see (dots). Dashed: alert thresholds.</p></div></div>${canvasBox("ptNews")}</div>
    <div class="grid g3 mt">
      <div class="card"><h3>Heart rate</h3>${canvasBox("ptHr", "short")}</div>
      <div class="card"><h3>Systolic BP</h3>${canvasBox("ptBp", "short")}</div>
      <div class="card"><h3>Respiratory rate</h3>${canvasBox("ptRr", "short")}</div>
      <div class="card"><h3>SpO₂</h3>${canvasBox("ptSp", "short")}</div>
      <div class="card"><h3>Temperature</h3>${canvasBox("ptTe", "short")}</div>
      <div class="card"><h3>NEWS2 breakdown, latest</h3><div id="ptParts"></div></div>
    </div>`;
  $("#ptEsc").addEventListener("click", () => Live.escalate(pid));
  $("#ptReveal").addEventListener("click", () => { reveal = !reveal; refresh(); });
  const mk = (id, key, color, lines) => chart(id, { type: "line", series: [{ y: [], color, name: key }], hlines: lines, noX: false });
  const cN = chart("ptNews", { type: "line", series: [], hlines: [{ y: 5, color: "var(--warn)", label: "5" }, { y: 7, color: "var(--risk)", label: "7" }], yMin: 0 });
  const cs = {
    hr: mk("ptHr", "HR", "var(--c1)", [{ y: 90, color: "var(--muted-fg)" }, { y: 130, color: "var(--risk)" }]),
    sbp: mk("ptBp", "SBP", "var(--c2)", [{ y: 100, color: "var(--risk)" }]),
    rr: mk("ptRr", "RR", "var(--c3)", [{ y: 21, color: "var(--risk)" }]),
    spo2: mk("ptSp", "SpO₂", "var(--c4)", [{ y: 92, color: "var(--risk)" }]),
    temp: mk("ptTe", "Temp", "var(--c5)", [{ y: 38, color: "var(--risk)" }]),
  };
  const refresh = () => {
    const f = Live.findPatient(pid);
    if (!f) { draw(); return; }
    p = f.p;
    const h = p.history.slice(-96), r = h.at(-1);
    const lab = (i, long) => { const d = CBSim.addHours(START, h[i].t); return long ? fmt.time(d) : fmt.clock(d); };
    $("#ptFacts").innerHTML = `<div><span>Age</span>${p.age}</div><div><span>Unit</span>${esc(UNITS[p.uix].name)}</div><div><span>Bed</span>${esc(p.bed)}</div><div><span>Facility</span>${esc(FAC[UNITS[p.uix].facility].name)}</div><div><span>Oxygen</span>${p.o2 ? "Supplemental" : "Room air"}</div>`;
    $("#ptKpis").innerHTML = kpi("NEWS2", newsChip(r.news2, r.red)) + kpi("Heart rate", r.hr + " <span class='of'>bpm</span>") + kpi("Blood pressure", r.sbp + " <span class='of'>mmHg sys</span>") +
      kpi("Resp · SpO₂", `${r.rr} · ${r.spo2}%`) + kpi("Temperature", r.temp.toFixed(1) + " °C", r.confused ? "<span class='txt-risk'>New confusion</span>" : "Alert");
    const spot = h.map((x) => Math.round(x.t * 4) % 16 === p.phase ? x.news2 : NaN);
    cN.update({ n: h.length, xLabel: lab, series: [{ name: "Continuous", y: h.map((x) => x.news2), color: "var(--c4)", step: true }, { name: "4-hourly", y: spot, color: "var(--c1)", dots: true, width: 0 }], legend: true });
    Object.entries(cs).forEach(([k, c]) => c.update({ n: h.length, xLabel: lab, series: [{ name: k.toUpperCase(), y: h.map((x) => x[k]), color: c.spec.series[0].color }] }));
    const names = ["Respiration", "SpO₂", "Oxygen", "Systolic BP", "Pulse", "Consciousness", "Temperature"], parts = CBSim.news2(r).parts;
    $("#ptParts").innerHTML = names.map((n, i) => `<div class="part"><span>${n}</span><div class="dots">${[0, 1, 2, 3].map((k) => `<i class="${k < parts[i] ? "on s" + parts[i] : ""}"></i>`).join("")}</div><b>${parts[i]}</b></div>`).join("");
    $("#ptTruth").innerHTML = reveal ? `<div class="callout mb">${p.det ? `<b>Planted:</b> ${patternLabel(p.det.pattern)}, starting ${fmt.time(CBSim.addHours(START, p.det.onset))}; crisis due ${fmt.time(CBSim.addHours(START, p.det.tEvent))} (${(p.det.tEvent - Live.t).toFixed(1)} h from now).` : "<b>Planted:</b> no deterioration scheduled for this patient during this stay."}</div>` : "";
    $("#ptReveal").textContent = reveal ? "Hide planted truth" : "Reveal planted truth";
  };
  refresh();
  return refresh;
}

/* ============================================================ Environment & scenarios */
let CMP = null;
function renderEnvironment(view) {
  const presets = SYS.scenarios;
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Environment &amp; scenarios</div><h1>What's coming, and what if</h1>
      <p>Season, weather and events change how many patients arrive and how long they stay. Weather and the respiratory season are synthetic. Start a scenario in the live simulation, or compare it with the baseline first.</p></div>
      <div class="row">${scenarioChip()}${Live.effects.length ? '<button class="btn" id="envClear">Clear scenario</button>' : ""}</div></div>
    <div class="grid g5" id="envKpis"></div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-h"><div><h3>Next 14 days: daily high</h3><p>Synthetic weather for this simulation; dashed line is the heat threshold</p></div></div>${canvasBox("envTemp", "short")}</div>
      <div class="card"><div class="card-h"><div><h3>Respiratory index</h3><p>1.0 = summer baseline; the season peaks in late January</p></div></div>${canvasBox("envResp", "short")}</div>
    </div>
    <h2 class="mt2">Scenarios</h2>
    <div class="grid g4 mt" id="envPresets">${presets.filter((s) => s.id !== "baseline").map((s) => `
      <div class="card scen"><div class="scen-ico">${{ resp: "🫁", heat: "☀", blizzard: "❄", mci: "🚑" }[s.id] || "•"}</div><h3>${esc(s.name)}</h3><p class="small muted">${esc(s.blurb)}</p>
        <div class="row mt"><button class="btn primary small" data-run="${s.id}">Start now</button><button class="btn small" data-cmp="${s.id}">Compare</button></div></div>`).join("")}</div>
    <div class="card mt"><div class="card-h"><div><h2>Build your own</h2><p>Effects start this many hours from now. Leave a control at zero to skip it.</p></div></div>
      <div class="builder">
        ${slider("bResp", "Respiratory index", 1, 2.4, 0.05, 1.0, (v) => v <= 1.0001 ? "off" : v.toFixed(2))}
        ${slider("bHeat", "Heat wave high (°F)", 85, 110, 1, 85, (v) => v <= 85 ? "off" : v + "°F")}
        ${slider("bHeatD", "Heat wave days", 1, 7, 1, 3, (v) => v + " d")}
        ${slider("bSnow", "Snowfall (in)", 0, 24, 1, 0, (v) => v ? v + " in" : "off")}
        ${slider("bMci", "Mass-casualty patients", 0, 80, 5, 0, (v) => v ? v : "off")}
        ${slider("bAt", "Starts in", 0, 72, 6, 12, (v) => v + " h")}
      </div>
      <div class="row mt"><button class="btn primary" id="bRun">Start now</button><button class="btn" id="bCmp">Compare with baseline</button></div></div>
    <div class="card mt" id="cmpCard" style="${CMP ? "" : "display:none"}"><div class="card-h"><div><h2 id="cmpTitle">Scenario vs baseline</h2><p id="cmpSub">Main-campus occupancy over the next 7 days, 100 paths each.</p></div><div class="progress-inline" id="cmpProg"></div></div>
      <div class="grid g-2-1"><div>${canvasBox("cmpChart", "tall")}</div><div class="table-wrap"><table id="cmpTable"></table></div></div></div>
    <div class="card mt"><div class="card-h"><div><h2>Unit sensitivities</h2><p>How each unit's arrivals respond (planted in the model). Current multiplier includes today's season, weather and scenario.</p></div></div>
      <div class="table-wrap"><table id="envSens"></table></div></div>`;
  bindSliders(view);
  const temp = chart("envTemp", { type: "line", series: [] });
  const resp = chart("envResp", { type: "line", series: [] });
  const custom = () => {
    const at = Number($("#bAt").value), eff = [], rv = Number($("#bResp").value), ht = Number($("#bHeat").value), sn = Number($("#bSnow").value), mc = Number($("#bMci").value);
    if (rv > 1.0001) eff.push({ type: "resp", start_h: at, ramp_h: 48, level: rv });
    if (ht > 85) eff.push({ type: "heat", start_h: at, end_h: at + 24 * Number($("#bHeatD").value), temp: ht });
    if (sn > 0) eff.push({ type: "snow", start_h: at, inches: sn });
    if (mc > 0) eff.push({ type: "mci", start_h: at, hours: 3, patients: mc, unit: "EDT" });
    return eff;
  };
  const presetEffects = (id) => {
    const s = presets.find((x) => x.id === id), first = s.effects.length ? Math.min(...s.effects.map((e) => e.start_h)) : 0;
    // presets are written for a Monday-midnight start; run them from now, keeping their spacing but starting within 12 h
    const lead = Math.min(first, 12);
    return s.effects.map((e) => shiftEffect(e, lead - first));
  };
  $("#envPresets").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.run) { Live.setScenario(presets.find((x) => x.id === b.dataset.run).name, presetEffects(b.dataset.run)); route(); }
    if (b.dataset.cmp) compare(presets.find((x) => x.id === b.dataset.cmp).name, presetEffects(b.dataset.cmp));
  });
  $("#bRun").addEventListener("click", () => { const e = custom(); if (e.length) { Live.setScenario("Custom scenario", e); route(); } });
  $("#bCmp").addEventListener("click", () => { const e = custom(); if (e.length) compare("Custom scenario", e); });
  if ($("#envClear")) $("#envClear").addEventListener("click", () => { Live.setScenario("Normal operations", []); route(); });
  const cmpChart = chart("cmpChart", { type: "line", series: [], legend: true });
  function compare(name, effects) {
    $("#cmpCard").style.display = ""; $("#cmpTitle").textContent = `${name} vs baseline`; $("#cmpTable").innerHTML = ""; $("#cmpProg").textContent = "Running baseline…";
    forecast({ hours: 168, paths: 100, effects: [], onDone: (base) => {
      $("#cmpProg").textContent = "Running scenario…";
      forecast({ hours: 168, paths: 100, effects: effects.map((e) => shiftEffect(e, Live.t)), onDone: (sc) => { CMP = { name, base, sc }; $("#cmpProg").textContent = ""; drawCmp(); } });
    } });
  }
  function drawCmp() {
    if (!CMP || !$("#cmpChart")) return;
    const { base, sc, name } = CMP, beds = facBeds("CBMC"), f = (a) => a.map((v) => v / beds * 100);
    $("#cmpTitle").textContent = `${name} vs baseline`;
    cmpChart.update({ n: 168, xLabel: H_LABEL(base.at), yFmt: (v) => v.toFixed(0) + "%", hlines: [{ y: 90, label: "90%", color: "var(--warn)" }],
      bands: [{ lo: f(base.q.main.p10), hi: f(base.q.main.p90), color: "var(--c1)" }, { lo: f(sc.q.main.p10), hi: f(sc.q.main.p90), color: "var(--risk)" }],
      series: [{ name: "Baseline", y: f(base.q.main.p50), color: "var(--c1)" }, { name, y: f(sc.q.main.p50), color: "var(--risk)" }] });
    const row = (l, a, b, fm, worseUp = true) => { const d = b - a; const bad = worseUp ? d > 0 : d < 0; return `<tr><td>${l}</td><td class="r num">${fm(a)}</td><td class="r num">${fm(b)}</td><td class="r num ${Math.abs(d) > 1e-9 ? (bad ? "txt-risk" : "txt-ok") : ""}">${d >= 0 ? "+" : "−"}${fm(Math.abs(d)).replace("−", "")}</td></tr>`; };
    const p = (x) => fmt.pct(x / beds, 1);
    $("#cmpTable").innerHTML = `<thead><tr><th>Next 7 days</th><th class="r">Baseline</th><th class="r">Scenario</th><th class="r">Change</th></tr></thead><tbody>
      ${row("Main campus, median peak", base.q.main.peakP50, sc.q.main.peakP50, p)}
      ${row("Main campus, 90th pct peak", base.q.main.peakP90, sc.q.main.peakP90, p)}
      ${row("Main ED boarders, peak", base.edBoardPeak, sc.edBoardPeak, (x) => fmt.n(x))}
      ${row("Main ED diversion (h)", base.divMean, sc.divMean, (x) => fmt.n(x, 1))}
      ${row("Transfers declined", base.lost, sc.lost, (x) => fmt.n(x, 1))}
      ${row("Overtime + agency", base.agency, sc.agency, fmt.big)}
      ${row("Operating income", base.operating, sc.operating, fmt.big, false)}</tbody>`;
  }
  const refresh = () => {
    const rec = Live.history.at(-1), today = Live.today();
    $("#envKpis").innerHTML = kpi(`${ICON.cloud} Today's high`, today.temp.toFixed(0) + "°F", today.temp > SYS.climate.heat_threshold ? "<span class='txt-risk'>Above heat threshold</span>" : "Below heat threshold") +
      kpi("Snow", today.snow ? today.snow.toFixed(1) + " in" : "None", rec.callout ? `${fmt.pct(rec.callout)} of nurses calling out` : "Full staffing") +
      kpi("Respiratory index", rec.resp.toFixed(2), rec.resp > 1.3 ? "Respiratory season is active" : "Low respiratory activity") +
      kpi("Main ED arrival multiplier", "×" + rec.arrMult.toFixed(2), "vs a typical day at this hour") +
      kpi("Scenario", esc(Live.scenarioName), Live.effects.length ? esc(describeEffects(Live.effects.map((e) => shiftEffect(e, -Live.t)))) : "No events active");
    const d0 = Math.round((CBSim.dayStart(Live.now()) - CBSim.dayStart(START)) / 864e5);
    const days = Live.days.slice(d0, d0 + 14).map((d) => ({ ...d }));
    dailyApply(days, Live.effects, Live.now());
    const lab = (i, long) => long ? fmt.day(days[i].date) : fmt.day(days[i].date).split(",")[0];
    temp.update({ n: days.length, xLabel: lab, series: [{ name: "High °F", y: days.map((d) => d.temp), color: "var(--c2)", dots: true }], hlines: [{ y: SYS.climate.heat_threshold, color: "var(--risk)", label: "heat" }],
      hoverExtra: (i) => days[i].snow ? [`Snow: ${days[i].snow.toFixed(1)} in`] : [] });
    resp.update({ n: days.length, xLabel: lab, series: [{ name: "Index", y: days.map((d) => d.resp), color: "var(--c5)", area: true }], yMin: 0.9, yFmt: (v) => v.toFixed(2) });
    const env = Live.block.env, k = Live.t - Live.block.t0;
    $("#envSens").innerHTML = `<thead><tr><th>Unit</th><th>Facility</th><th class="r">Respiratory</th><th class="r">Heat</th><th class="r">Snow day</th><th class="r">After snow</th><th class="r">Stay length vs flu peak</th><th class="r">Arrivals now</th></tr></thead><tbody>` +
      visibleUnits.filter((u) => u.arrivals > 0 || Object.keys(u.env).length).map((u) => {
        const i = UIX[u.id], e = u.env, m = env.arr[Math.min(k, env.arr.length - 1)][i];
        const pc = (v) => v ? (v > 0 ? "+" : "") + (v * 100).toFixed(0) + "%" : "—";
        return `<tr><td>${esc(u.name)}</td><td class="small muted">${esc(FAC[u.facility].name)}</td>
          <td class="r num">${pc((e.resp || 0) * SYS.respiratory.k * SYS.respiratory.amplitude)}</td><td class="r num">${e.heat ? pc(e.heat * SYS.climate.heat_per_deg * 10) + "/10°F" : "—"}</td>
          <td class="r num">${pc(-(e.snow_day || 0))}</td><td class="r num">${pc(e.snow_after || 0)}</td><td class="r num">${pc(e.los_resp || 0)}</td>
          <td class="r num ${m > 1.05 ? "txt-risk" : m < .95 ? "txt-ok" : ""}">×${m.toFixed(2)}</td></tr>`;
      }).join("") + "</tbody>";
    drawCmp();
  };
  refresh();
  return refresh;
}
function slider(id, label, min, max, step, val, f) {
  return `<label class="sl"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" data-f="${id}"><b id="${id}V">${f(val)}</b></label>`;
}
const SLIDER_FMT = {};
function bindSliders(view) {
  $$('input[type="range"]', view).forEach((el) => {
    const out = $("#" + el.id + "V");
    const fmtf = { bResp: (v) => v <= 1.0001 ? "off" : v.toFixed(2), bHeat: (v) => v <= 85 ? "off" : v + "°F", bHeatD: (v) => v + " d", bSnow: (v) => v ? v + " in" : "off", bMci: (v) => v ? v : "off", bAt: (v) => v + " h",
      aRn: (v) => "$" + v + "/h", aAg: (v) => v.toFixed(1) + "×", aFix: (v) => (v > 0 ? "+" : "") + v + "%", aCom: (v) => (v > 0 ? "+" : "") + v + " pts" }[el.id] || SLIDER_FMT[el.id] || ((v) => v);
    el.addEventListener("input", () => { out.textContent = fmtf(Number(el.value)); });
  });
}

/* ============================================================ Finance */
let FIN = { period: "7", rn: SYS.rn_hourly, ag: SYS.agency_mult, fix: 0, com: 0 };
function renderFinance(view, tab) {
  tab = tab === "annual" ? "annual" : "live";
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Finance</div><h1>${tab === "live" ? "Unit economics, live" : "Annual plan"}</h1>
      <p>${tab === "live" ? "Net revenue, supplies and nursing by unit as the simulation runs. Core nurses are paid whatever the census; anything above budget is overtime, then agency." : "A deterministic year (2027) under the seasonal respiratory curve and typical weather. Change the assumptions to see the P&L move."}</p></div></div>
    <div class="tabs"><a href="#/finance" class="${tab === "live" ? "on" : ""}">Live operations</a><a href="#/finance/annual" class="${tab === "annual" ? "on" : ""}">Annual plan</a></div>
    <div id="finBody"></div>`;
  return tab === "live" ? financeLive($("#finBody")) : financeAnnual($("#finBody"));
}
function financeLive(el) {
  el.innerHTML = `
    <div class="row mb">${seg("finP", [["1", "Today"], ["7", "Last 7 days"], ["40", "Since start"]], FIN.period)}<span class="small muted" id="finNote"></span></div>
    <div class="grid g5" id="finKpis"></div>
    <div class="grid g-2-1 mt">
      <div class="card"><div class="card-h"><div><h3>Operating income by day</h3><p>Whole system; darker bar is today so far</p></div></div>${canvasBox("finDaily")}</div>
      <div class="card"><div class="card-h"><div><h3>By facility</h3></div></div><div class="table-wrap"><table id="finFac"></table></div></div>
    </div>
    <div class="stack mt">
      <div class="card" id="finCase"><div class="card-h"><div><h2>Case mix</h2><p>MS-DRG groups of patients discharged in the period.</p></div></div><div id="finCm"></div></div>
      <div class="card"><div class="card-h"><div><h2>Budget vs actual</h2><p>Flexible budget: variable lines flexed to actual patient-days.</p></div></div><div class="table-wrap" id="finBud"></div></div>
    </div>
    <div class="card mt"><div class="card-h"><div><h2>Unit economics</h2><p>Contribution = net revenue − supplies − nursing. Operating = contribution − fixed costs (other labour, overhead, depreciation).</p></div></div>
      <div class="table-wrap"><table id="finUnits"></table></div></div>`;
  onSeg("finP", (v) => { FIN.period = v; refresh(); });
  const daily = chart("finDaily", { type: "bar", bars: { values: [] }, yFmt: (v) => fmt.big(v), zero: true });
  const refresh = () => {
    const acc = moneyFor(Number(FIN.period)), pl = CBSim.pl(P, acc), rows = CBSim.unitRows(P, acc);
    const hrs = Math.min(Live.history.length, Number(FIN.period) * 24);
    $("#finNote").textContent = `${Math.min([...Live.days_.keys()].length, Number(FIN.period))} simulated day(s)`;
    const nursing = pl.core + pl.ot + pl.agency;
    $("#finKpis").innerHTML = kpi("Net patient revenue", fmt.big(pl.net), `${fmt.big(pl.gross)} gross charges`) +
      kpi("Nursing", fmt.big(nursing), `${fmt.pct((pl.ot + pl.agency) / (nursing || 1), 1)} overtime + agency`, (pl.ot + pl.agency) / (nursing || 1) > .15 ? "alert" : "") +
      kpi("Supplies, drugs & food", fmt.big(pl.supplies), `${fmt.pct(pl.supplies / (pl.net || 1))} of net revenue`) +
      kpi("Operating income", fmt.big(pl.operating), `after ${fmt.big(pl.fixed)} fixed costs`, pl.operating < 0 ? "alert" : "accent") +
      kpi("Operating margin", fmt.pct(pl.margin, 1), "incl. other operating revenue");
    const keys = [...Live.days_.keys()].slice(-14);
    const vals = keys.map((k) => CBSim.pl(P, Live.days_.get(k)).operating);
    daily.update({ n: vals.length, bars: { values: vals, colors: vals.map((v, i) => i === vals.length - 1 ? "var(--primary-2)" : v < 0 ? "var(--risk)" : "var(--c1)"), name: "Operating income" },
      xLabel: (i, long) => { const d = new Date(keys[i] + "T00:00:00Z"); return long ? fmt.day(d) : fmt.day(d).split(", ")[1]; }, xTicks: vals.map((_, i) => i) });
    const nd = Math.max(1, Math.min([...Live.days_.keys()].length, Number(FIN.period)));
    $("#finCm").innerHTML = caseMixHtml(nd);
    if (!FIN._budT || Live.t - FIN._budT >= 1) { FIN._budT = Live.t; $("#finBud").innerHTML = budgetHtml(acc, hrs / 24); }
    $("#finFac").innerHTML = `<thead><tr><th>Facility</th><th class="r">Revenue</th><th class="r">Operating</th><th class="r">Margin</th></tr></thead><tbody>` +
      FACS.map((f) => { const m = UNITS.map((u) => u.facility === f.id), q = CBSim.pl(P, acc, m); return `<tr><td>${esc(f.name)}</td><td class="r num">${fmt.big(q.revenue)}</td><td class="r num ${q.operating < 0 ? "txt-risk" : ""}">${fmt.big(q.operating)}</td><td class="r num">${fmt.pct(q.margin, 1)}</td></tr>`; }).join("") + "</tbody>";
    let html = `<thead><tr><th>Unit</th><th class="r">Patient-days</th><th class="r">Cases</th><th class="r">Net revenue</th><th class="r">Supplies</th><th class="r">Core RN</th><th class="r">Overtime</th><th class="r">Agency</th><th class="r">Contribution</th><th class="r">Fixed</th><th class="r">Operating</th></tr></thead><tbody>`;
    FACS.forEach((f) => {
      html += `<tr class="grp"><td colspan="11">${esc(f.name)}</td></tr>`;
      rows.filter((r) => r.facility === f.id).forEach((r) => {
        const u = UNITS[UIX[r.id]]; if (u.parent) return;
        const kid = UNITS.findIndex((x) => x.parent === u.id); const k = kid >= 0 ? rows[kid] : null;
        const add = (f) => r[f] + (k ? k[f] : 0);
        html += `<tr><td>${esc(r.name)}</td><td class="r num">${fmt.n(add("pdays"), 1)}</td><td class="r num">${u.basis === "case" ? fmt.n(add("cases")) : "—"}</td><td class="r num">${fmt.big(add("net"))}</td>
          <td class="r num">${fmt.big(add("supplies"))}</td><td class="r num">${fmt.big(add("core"))}</td><td class="r num ${add("ot") > 0 ? "txt-warn" : ""}">${fmt.big(add("ot"))}</td><td class="r num ${add("agency") > 0 ? "txt-risk" : ""}">${fmt.big(add("agency"))}</td>
          <td class="r num">${fmt.big(add("contribution"))}</td><td class="r num muted">${fmt.big(add("fixed"))}</td><td class="r num ${add("operating") < 0 ? "txt-risk" : "txt-ok"}">${fmt.big(add("operating"))}</td></tr>`;
      });
    });
    $("#finUnits").innerHTML = html + "</tbody>";
  };
  refresh();
  return refresh;
}
function financeAnnual(el) {
  el.innerHTML = `
    <div class="card"><div class="card-h"><div><h2>Assumptions</h2><p>Defaults match the research page. Payer shift moves commercial share to and from Medicare and Medicaid.</p></div><button class="btn" id="aReset">Reset</button></div>
      <div class="builder">
        ${slider("aRn", "Core RN cost (loaded, per hour)", 45, 90, 1, FIN.rn, (v) => "$" + v + "/h")}
        ${slider("aAg", "Agency premium", 1.5, 3.5, 0.1, FIN.ag, (v) => v.toFixed(1) + "×")}
        ${slider("aFix", "Fixed costs", -10, 10, 1, FIN.fix, (v) => (v > 0 ? "+" : "") + v + "%")}
        ${slider("aCom", "Commercial payer share", -10, 10, 1, FIN.com, (v) => (v > 0 ? "+" : "") + v + " pts")}
      </div></div>
    <div class="grid g5 mt" id="anKpis"></div>
    <div class="grid g-2-1 mt">
      <div class="card"><div class="card-h"><div><h3>Monthly operating margin and main-campus occupancy</h3><p>Winter volume spreads fixed costs, even with overtime and agency</p></div></div>${canvasBox("anMonthly", "tall")}</div>
      <div class="card"><div class="card-h"><div><h3>Profit &amp; loss</h3><p id="anRef"></p></div></div><div class="table-wrap"><table id="anPl"></table></div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-h"><div><h3>By facility</h3></div></div><div class="table-wrap"><table id="anFac"></table></div></div>
      <div class="card"><div class="card-h"><div><h3>Unit contribution after fixed costs</h3><p>Top and bottom units for the year</p></div></div>${canvasBox("anUnits", "tall")}</div>
    </div>`;
  bindSliders(el);
  const monthly = chart("anMonthly", { type: "bar", bars: { values: [] }, legend: true, yFmt: (v) => v.toFixed(1) + "%" });
  const units = chart("anUnits", { type: "bar", horizontal: true, bars: { labels: [], values: [] }, yFmt: fmt.big });
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const netRates = () => {
    if (!FIN.com) return null;
    const o = {};
    FACS.forEach((f) => {
      const mix = { ...f.payer_mix }, d = FIN.com / 100, gov = mix.Medicare + mix.Medicaid;
      const c = Math.max(0, Math.min(1, mix.Commercial + d)), dd = c - mix.Commercial;
      mix.Medicare -= dd * mix.Medicare / gov; mix.Medicaid -= dd * mix.Medicaid / gov; mix.Commercial = c;
      o[f.id] = Object.entries(mix).reduce((s, [k, v]) => s + v * SYS.collection[k], 0);
    });
    return o;
  };
  const refresh = () => {
    const opt = { rnHourly: FIN.rn, agencyMult: FIN.ag, fixedMult: 1 + FIN.fix / 100, netRates: netRates() };
    const res = annualFinance(opt), pl = CBSim.pl(P, res.total);
    const isDefault = FIN.rn === SYS.rn_hourly && FIN.ag === SYS.agency_mult && !FIN.fix && !FIN.com;
    $("#anKpis").innerHTML = kpi("Total operating revenue", fmt.big(pl.revenue), `${fmt.big(pl.net)} net patient revenue`) +
      kpi("Operating income", fmt.big(pl.operating), "for the year", pl.operating < 0 ? "alert" : "accent") +
      kpi("Operating margin", fmt.pct(pl.margin, 1), isDefault && SYS.reference ? `Python reference: ${fmt.pct(SYS.reference.year.margin, 2)}` : "with your assumptions") +
      kpi("Overtime + agency", fmt.big(pl.ot + pl.agency), `${fmt.pct((pl.ot + pl.agency) / (pl.core + pl.ot + pl.agency), 1)} of nursing spend`) +
      kpi("Best / worst month", `${MONTHS[res.months.reduce((a, m) => m.pl.margin > a.pl.margin ? m : a).m]} / ${MONTHS[res.months.reduce((a, m) => m.pl.margin < a.pl.margin ? m : a).m]}`, "by operating margin");
    monthly.update({ n: 12, bars: { values: res.months.map((m) => m.pl.margin * 100), color: "var(--c1)", name: "Operating margin" }, xLabel: (i) => MONTHS[i], xTicks: [...Array(12).keys()],
      hoverExtra: (i) => [`Main campus: ${fmt.pct(res.months[i].occ, 1)} occupied`, `Operating income: ${fmt.big(res.months[i].pl.operating)}`, `Overtime + agency: ${fmt.big(res.months[i].pl.ot + res.months[i].pl.agency)}`] });
    const ref = SYS.reference && SYS.reference.year;
    $("#anRef").textContent = isDefault && ref ? "Python column: tara census_sim, same assumptions" : "Your assumptions";
    const lines = [["gross", "Gross patient charges"], ["deductions", "Contractual allowances & bad debt"], ["net", "Net patient revenue"], ["other", "Other operating revenue"], ["revenue", "Total operating revenue"],
      ["core", "Nursing: core staff"], ["ot", "Nursing: overtime"], ["agency", "Nursing: agency"], ["supplies", "Supplies, drugs & food"], ["fixed", "Other labour, overhead & depreciation"], ["expenses", "Total operating expenses"], ["operating", "Operating income"]];
    $("#anPl").innerHTML = `<thead><tr><th>Line</th><th class="r">Year</th>${isDefault && ref ? '<th class="r">Python</th>' : ""}</tr></thead><tbody>` +
      lines.map(([k, l]) => `<tr class="${["revenue", "expenses", "operating", "net"].includes(k) ? "tot" : ""}"><td>${l}</td><td class="r num">${fmt.big(pl[k])}</td>${isDefault && ref ? `<td class="r num muted">${fmt.big(ref[k])}</td>` : ""}</tr>`).join("") + "</tbody>";
    $("#anFac").innerHTML = `<thead><tr><th>Facility</th><th class="r">Beds</th><th class="r">Revenue</th><th class="r">Operating</th><th class="r">Margin</th></tr></thead><tbody>` +
      FACS.map((f) => { const q = CBSim.pl(P, res.total, UNITS.map((u) => u.facility === f.id)); return `<tr><td>${esc(f.name)}</td><td class="r num">${UNITS.filter((u) => u.facility === f.id).reduce((s, u) => s + u.beds, 0)}</td><td class="r num">${fmt.big(q.revenue)}</td><td class="r num ${q.operating < 0 ? "txt-risk" : ""}">${fmt.big(q.operating)}</td><td class="r num">${fmt.pct(q.margin, 1)}</td></tr>`; }).join("") + "</tbody>";
    const ur = CBSim.unitRows(P, res.total).filter((r) => !UNITS[UIX[r.id]].parent).sort((a, b) => b.operating - a.operating);
    const pick = ur.slice(0, 6).concat(ur.slice(-6));
    units.update({ bars: { labels: pick.map((r) => r.name), values: pick.map((r) => r.operating), colors: pick.map((r) => r.operating < 0 ? "var(--risk)" : "var(--c3)") } });
  };
  const read = () => { FIN.rn = Number($("#aRn").value); FIN.ag = Number($("#aAg").value); FIN.fix = Number($("#aFix").value); FIN.com = Number($("#aCom").value); refresh(); };
  $$('input[type="range"]', el).forEach((i) => i.addEventListener("change", read));
  $("#aReset").addEventListener("click", () => { FIN = { ...FIN, rn: SYS.rn_hourly, ag: SYS.agency_mult, fix: 0, com: 0 }; route(); });
  setTimeout(refresh, 10);
  return () => {}; // the annual plan doesn't move with the live clock
}

/* ============================================================ Reference */
function renderMethods(view) {
  const ref = SYS.reference || {};
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Reference</div><h1>How the model works</h1>
      <p>The same model as the <a href="https://research.stellargrove.com/hospital/command_center/" target="_blank" rel="noopener">research page</a>, ported to run live in your browser.</p></div></div>
    <div class="grid g2">
      <div class="card"><h2>Census engine</h2><div class="steps mt">
        <div class="step"><div><b>Exits.</b> Each hour, each patient not already waiting for a bed leaves the unit with probability <span class="formula-inline">h = 1 − e<sup>−w / (L·ℓ)</sup></span>: L is the unit's mean stay, w the hour-of-week discharge weight (discharges cluster late morning and slow at weekends), ℓ the environment's stay multiplier.</div></div>
        <div class="step"><div><b>Routing.</b> Leavers split multinomially over the unit's routes: home, another unit or another facility. Higher-acuity and perioperative patients get free beds first.</div></div>
        <div class="step"><div><b>Boarding and overflow.</b> If the target is full, the patient tries the target's overflow units, otherwise keeps their current bed and boards.</div></div>
        <div class="step"><div><b>Arrivals.</b> Poisson by hour of week × environment. EDs never refuse walk-ins, but divert ambulances at ${SYS.ed_divert_at}× their bays. ORs queue cases for a free room; other units decline transfers when full.</div></div>
      </div></div>
      <div class="card"><h2>Environment</h2><p>Arrivals are multiplied by a seasonal respiratory index, heat above ${SYS.climate.heat_threshold}°F and snow (fewer arrivals the day of, more falls and crashes after), each scaled by a unit's sensitivity. Snow also slows discharges and causes staff call-outs. Weather and season here are <b>synthetic</b>; real NOAA weather and CDC respiratory data are planned.</p>
        <h2 class="mt">Early warning</h2><p>Each inpatient has baseline vitals with slow drift and measurement noise. Some start one of four planted deteriorations (sepsis, respiratory failure, hemorrhage, arrhythmia) at a unit-specific rate; it grows slowly, then fast, until a crisis. Scores follow NEWS2 (RCP 2017) and qSOFA (Seymour et al., 2016) exactly.</p>
        <h2 class="mt">Finance</h2><p>Net revenue = charges × the facility's payer-mix collection rate. Core nurses are budgeted for a target occupancy at the unit's patients-per-RN ratio and paid regardless; extra hours are overtime (${SYS.ot_mult}×, up to ${Math.round(SYS.ot_pool * 100)}% of core) then agency (${SYS.agency_mult}×).</p></div>
    </div>
    <div class="card mt"><div class="card-h"><div><h2>Checks</h2><p>From the Python reference run, and this browser's port of the engine checked against it.</p></div></div>
      <ul class="checks">${(ref.checks || []).map((c) => `<li><div><b>${esc(c.check)}</b> <span class="muted small">${esc(c.result)}</span></div></li>`).join("")}<li id="jsCheck"><div>Checking the JavaScript engine against Python…</div></li></ul></div>`;
  setTimeout(() => {
    const r = crossCheck(), li = $("#jsCheck"); if (!li) return;
    li.innerHTML = `<div><b>JavaScript mean-field week matches Python</b> <span class="muted small">largest unit difference ${r.maxDiff.toExponential(1)} patients over ${r.units} units</span></div>`;
    if (r.maxDiff > 0.01) li.classList.add("bad");
  }, 20);
  return () => {};
}
function crossCheck() {
  const ref = SYS.reference.mean_field_week, start = new Date(Date.UTC(2026, 9, 5));
  const warm = CBSim.warmStart(P, start), r = CBSim.run(P, start, 168, { stochastic: false, init: warm });
  const mean = new Float64Array(P.U); r.census.forEach((C) => C.forEach((v, i) => { mean[i] += v / 168; }));
  let maxDiff = 0; ref.census.forEach((v, i) => { maxDiff = Math.max(maxDiff, Math.abs(v - mean[i])); });
  return { maxDiff, units: ref.census.length };
}

function renderData(view) {
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Reference</div><h1>About the data</h1>
      <p>Calloway Bay Health is fictional. Every patient, number and place here is simulated, with parameters planted so the model can be checked. Nothing describes a real hospital, patient or payer.</p></div></div>
    <div class="grid g3">${FACS.map((f) => `<div class="card"><div class="eyebrow">${esc(FAC_KIND[f.kind])}</div><h3>${esc(f.name)}</h3><p class="small muted">${esc(f.blurb)}</p>
      <div class="mini-stats"><div><b>${facBeds(f.id) || "—"}</b><span>inpatient beds</span></div><div><b>${UNITS.filter((u) => u.facility === f.id && u.kind === "ed" && !u.parent).reduce((s, u) => s + u.beds, 0) || "—"}</b><span>ED bays</span></div><div><b>${fmt.pct(f.net_rate)}</b><span>collected / charge</span></div></div>
      <div class="payer">${Object.entries(f.payer_mix).map(([k, v], j) => `<i style="width:${v * 100}%;background:var(--c${j + 1})" title="${k} ${fmt.pct(v)}"></i>`).join("")}</div>
      <div class="small muted">${Object.entries(f.payer_mix).map(([k, v]) => `${k} ${fmt.pct(v)}`).join(" · ")}</div></div>`).join("")}</div>
    <div class="card mt"><div class="card-h"><div><h2>Units</h2><p>Capacity, mean stay, direct arrivals and where patients go next.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Unit</th><th>Facility</th><th class="r">Beds</th><th class="r">Mean stay</th><th class="r">Direct arrivals / day</th><th>Goes next (top 3)</th><th class="r">Patients per RN</th><th class="r">Charge</th></tr></thead><tbody>
      ${visibleUnits.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td class="small muted">${esc(FAC[u.facility].name)}</td><td class="r num">${u.beds}</td>
        <td class="r num">${u.los_h >= 48 ? (u.los_h / 24).toFixed(1) + " d" : u.los_h.toFixed(1) + " h"}</td><td class="r num">${u.arrivals ? fmt.n(u.arrivals, u.arrivals < 10 ? 1 : 0) : "—"}</td>
        <td class="small">${Object.entries(u.routes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k === "HOME" ? "Home" : esc(UNITS[UIX[k]].name)} ${fmt.pct(v)}`).join(" · ")}</td>
        <td class="r num">${u.rn_ratio}</td><td class="r num">${u.gross ? fmt.big(u.gross) + (u.basis === "case" ? "/case" : "/day") : "—"}</td></tr>`).join("")}
      </tbody></table></div></div>
    <div class="callout mt">Planned: replace the synthetic season and weather with real NOAA daily weather, CDC respiratory surveillance and air-quality data, fitted to arrivals rather than planted.</div>`;
  return () => {};
}
