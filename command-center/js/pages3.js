/* pages3.js — Data connectors: a mock integration hub. Pick a common hospital data source, walk the connect wizard
   (method, sandbox connection, test, field mapping, sync), and watch its simulated sync health. CSV upload is real
   but stays in the browser. Nothing here contacts any outside system or asks for real credentials. */

const CONN_CATS = [
  ["ehr", "EHR & ADT"], ["device", "Bedside devices"], ["flow", "Bed & patient flow"], ["staff", "Staffing & time"],
  ["fin", "Finance & claims"], ["platform", "Data platforms"], ["public", "Public & environment"], ["file", "Files"],
];
const METHODS = {
  fhir: { label: "FHIR R4 REST API", auth: "SMART Backend Services (OAuth 2.0 client credentials, signed JWT)", fields: [["FHIR base URL", "https://sandbox.example-ehr.test/fhir/r4"], ["Client ID", "cb-command-center-sandbox"], ["Scopes", "system/Encounter.read system/Observation.read system/Location.read"]] },
  mllp: { label: "HL7 v2 over MLLP", auth: "VPN tunnel + IP allow-list; ACK on every message", fields: [["Listener host", "mllp.cb-sim.test"], ["Port", "6661"], ["Message types", "ADT^A01–A03, A08; ORU^R01"]] },
  sql: { label: "Warehouse SQL extract", auth: "Read-only service account over TLS", fields: [["Server", "warehouse.example.test"], ["Database / schema", "CLARITY.dbo"], ["Extract", "Hourly census, ADT events, orders"]] },
  rest: { label: "Vendor REST API", auth: "OAuth 2.0 client credentials", fields: [["API base URL", "https://api.example-vendor.test/v2"], ["Client ID", "cb-sandbox"], ["Resources", "Shifts, assignments, time punches"]] },
  sftp: { label: "SFTP file drop", auth: "SSH key pair (sandbox key generated for you)", fields: [["Host", "sftp.cb-sim.test"], ["Folder", "/inbound/daily"], ["File pattern", "*.csv, nightly 02:00"]] },
  cloud: { label: "Cloud storage / share", auth: "Workload identity / IAM role", fields: [["Location", "s3://cb-sandbox/command-center/"], ["Format", "Parquet, partitioned by day"], ["Region", "us-east-1"]] },
  public: { label: "Public REST API", auth: "API key (free) or none", fields: [["Endpoint", "https://api.example-public.test/v1"], ["Area", "Anne Arundel County, MD (sandbox)"], ["Refresh", "Hourly"]] },
  upload: { label: "Browser upload", auth: "None: the file never leaves this browser", fields: [] },
};
const CONNECTORS = [
  { id: "hl7", cat: "ehr", name: "HL7 v2 interface engine", sub: "Rhapsody / Mirth-style ADT and ORU feed", methods: ["mllp"], feeds: ["census", "patients", "beds", "feed"], kind: "adt", preset: true },
  { id: "epic", cat: "ehr", name: "Epic", sub: "FHIR R4 APIs, Bridges HL7 interfaces, Clarity / Caboodle", methods: ["fhir", "mllp", "sql"], feeds: ["census", "patients", "beds", "feed"], kind: "adt" },
  { id: "oracle", cat: "ehr", name: "Oracle Health (Cerner) Millennium", sub: "FHIR R4 (Ignite APIs) and HL7 v2 interfaces", methods: ["fhir", "mllp"], feeds: ["census", "patients", "beds", "feed"], kind: "adt" },
  { id: "meditech", cat: "ehr", name: "MEDITECH Expanse", sub: "FHIR R4 and HL7 v2 interfaces", methods: ["fhir", "mllp"], feeds: ["census", "patients", "beds"], kind: "adt" },
  { id: "philips", cat: "device", name: "Philips patient monitoring", sub: "IntelliVue / Capsule device integration, HL7 ORU (IHE PCD-01)", methods: ["mllp"], feeds: ["patients"], kind: "vitals" },
  { id: "ge", cat: "device", name: "GE HealthCare CARESCAPE", sub: "Monitoring gateway, HL7 ORU", methods: ["mllp"], feeds: ["patients"], kind: "vitals" },
  { id: "bedmgmt", cat: "flow", name: "Bed management / transfer center", sub: "TeleTracking-style bed status, EVS turnaround, transfers", methods: ["rest", "mllp"], feeds: ["census", "beds", "actions"], kind: "beds" },
  { id: "ukg", cat: "staff", name: "UKG (Kronos) Workforce", sub: "Schedules, time punches, call-outs", methods: ["rest", "sftp"], feeds: ["staffing", "finance"], kind: "staff" },
  { id: "workday", cat: "staff", name: "Workday HCM", sub: "Positions, FTEs, pay rates (RaaS reports)", methods: ["rest", "sftp"], feeds: ["staffing", "finance"], kind: "staff" },
  { id: "agency", cat: "staff", name: "Agency / float marketplace", sub: "Open shifts, agency fills and bill rates", methods: ["rest"], feeds: ["staffing"], kind: "staff" },
  { id: "costacct", cat: "fin", name: "Cost accounting", sub: "Strata / Axiom-style cost per case, budgets", methods: ["sftp", "sql"], feeds: ["finance"], kind: "fin" },
  { id: "x12", cat: "fin", name: "Claims & remittance (X12 837 / 835)", sub: "Charges, payments, denials from the clearinghouse", methods: ["sftp"], feeds: ["finance"], kind: "fin" },
  { id: "snowflake", cat: "platform", name: "Snowflake", sub: "Secure share or direct query of an enterprise warehouse", methods: ["sql", "cloud"], feeds: ["census", "finance", "beds"], kind: "warehouse" },
  { id: "databricks", cat: "platform", name: "Databricks", sub: "Delta tables via SQL warehouse or Unity Catalog share", methods: ["sql", "cloud"], feeds: ["census", "finance", "beds"], kind: "warehouse" },
  { id: "fhirsvc", cat: "platform", name: "Cloud FHIR service", sub: "AWS HealthLake / Azure Health Data Services / Google Healthcare API", methods: ["fhir", "cloud"], feeds: ["census", "patients", "feed"], kind: "adt" },
  { id: "noaa", cat: "public", name: "NOAA / National Weather Service", sub: "Forecast highs, heat index, snowfall (api.weather.gov)", methods: ["public"], feeds: ["environment"], kind: "env", planned: true },
  { id: "cdc", cat: "public", name: "CDC respiratory surveillance", sub: "FluView, RESP-NET, NSSP emergency-department visits", methods: ["public"], feeds: ["environment"], kind: "env", planned: true },
  { id: "airnow", cat: "public", name: "EPA AirNow", sub: "Air-quality index and smoke events", methods: ["public"], feeds: ["environment"], kind: "env", planned: true },
  { id: "csv", cat: "file", name: "CSV upload", sub: "Census or staffing extract from a spreadsheet; parsed in your browser", methods: ["upload"], feeds: ["census"], kind: "csv" },
];
const PAGE_NAME = { census: "Census & forecast", patients: "Patient watch", beds: "Bed planning", feed: "HL7 / FHIR feed", staffing: "Staffing", finance: "Finance", actions: "Recommended actions", environment: "Environment" };
const MAPS = {
  adt: { fhir: [["Encounter.subject → Patient.identifier (MR)", "Patient ID"], ["Encounter.location[0].location", "Unit + bed"], ["Encounter.period.start", "Admit time"], ["Encounter.period.end", "Discharge time"], ["Encounter.hospitalization.dischargeDisposition", "Discharge disposition"], ["Encounter.class", "Inpatient / observation"], ["Claim.diagnosis (DRG)", "Diagnosis group"]],
    mllp: [["PID-3 Patient identifier", "Patient ID"], ["PV1-3 Assigned location", "Unit + bed"], ["PV1-6 Prior location", "Transfer from"], ["PV1-44 Admit date/time", "Admit time"], ["PV1-45 Discharge date/time", "Discharge time"], ["PV1-36 Discharge disposition", "Discharge disposition"], ["DRG-1 Diagnosis related group", "Diagnosis group"]],
    sql: [["PAT_ENC_HSP.PAT_ID", "Patient ID"], ["CLARITY_DEP.DEPARTMENT_NAME", "Unit"], ["CLARITY_BED.BED_LABEL", "Bed"], ["HOSP_ADMSN_TIME", "Admit time"], ["HOSP_DISCH_TIME", "Discharge time"], ["DISCH_DISP_C", "Discharge disposition"], ["DRG_ID", "Diagnosis group"]],
    cloud: [["encounter.subject_id", "Patient ID"], ["encounter.location", "Unit + bed"], ["encounter.start", "Admit time"], ["encounter.end", "Discharge time"]] },
  vitals: { mllp: [["OBX-3 8867-4 (LOINC)", "Heart rate"], ["OBX-3 8480-6", "Systolic BP"], ["OBX-3 9279-1", "Respiratory rate"], ["OBX-3 59408-5", "SpO₂"], ["OBX-3 8310-5", "Temperature"], ["OBX-3 3151-8 (O₂ flow)", "Supplemental oxygen"], ["OBX-14 Observation time", "Reading time"]] },
  beds: { rest: [["bed.id", "Bed"], ["bed.unit", "Unit"], ["bed.status (clean / dirty / occupied / blocked)", "Bed status"], ["evs.request_time → clean_time", "Turnaround"], ["transfer.request / accept", "Transfer center queue"]],
    mllp: [["PV1-3 Assigned location", "Unit + bed"], ["PV1-40 Bed status", "Bed status"]] },
  staff: { rest: [["schedule.employee_id", "Nurse ID"], ["schedule.department", "Unit"], ["schedule.shift_start / end", "Shift"], ["job.code (RN, LPN, CNA)", "Role"], ["punch.in / out", "Hours worked"], ["callout.reason", "Call-out"], ["pay_rate × premium", "Cost (core / OT / agency)"]],
    sftp: [["EMP_ID", "Nurse ID"], ["DEPT", "Unit"], ["SHIFT_DATE, SHIFT_CODE", "Shift"], ["HOURS, PAY_CODE", "Hours worked + premium"]] },
  fin: { sftp: [["CLM01 Claim ID (837)", "Encounter"], ["CLP04 Paid amount (835)", "Net revenue"], ["CAS Adjustments (835)", "Contractual allowances"], ["Cost per case: direct / indirect", "Supplies + fixed costs"], ["Budget: department, month, line", "Budget"]],
    sql: [["cost_case.encounter_id", "Encounter"], ["cost_case.direct_cost", "Variable cost"], ["cost_case.indirect_cost", "Fixed cost"], ["budget.amount", "Budget"]] },
  warehouse: { sql: [["fact_census.unit_id, hour", "Census by unit and hour"], ["fact_adt.event_type, event_time", "ADT events"], ["dim_unit.beds_staffed", "Staffed beds"], ["fact_gl.account, amount", "Finance lines"]],
    cloud: [["census/date=*/part-*.parquet", "Census by unit and hour"], ["adt_events/…", "ADT events"]] },
  env: { public: [["temperature.max (°F)", "Daily high"], ["snowfallAmount (in)", "Snowfall"], ["ILI / RSV / COVID % of visits", "Respiratory index"], ["AQI", "Air quality"]] },
};
const MODEL_FIELDS = ["Patient ID", "Unit + bed", "Unit", "Bed", "Admit time", "Discharge time", "Transfer from", "Discharge disposition", "Inpatient / observation", "Diagnosis group",
  "Heart rate", "Systolic BP", "Respiratory rate", "SpO₂", "Temperature", "Supplemental oxygen", "Reading time", "Bed status", "Turnaround", "Transfer center queue",
  "Nurse ID", "Shift", "Role", "Hours worked", "Hours worked + premium", "Call-out", "Cost (core / OT / agency)", "Encounter", "Net revenue", "Contractual allowances",
  "Supplies + fixed costs", "Variable cost", "Fixed cost", "Budget", "Census by unit and hour", "ADT events", "Staffed beds", "Finance lines", "Daily high", "Snowfall", "Respiratory index", "Air quality", "(ignore)"];

let CONN = (() => { try { return JSON.parse(store.get("connectors", "null")) || null; } catch (e) { return null; } })() || { hl7: { method: "mllp", at: 0, sync: "stream", paused: false } };
const saveConn = () => store.set("connectors", JSON.stringify(CONN));
let CONN_UI = { cat: "all", q: "", wiz: null, csv: null };

/* simulated throughput: records per hour a connector would deliver, derived from the live simulation */
function connRate(c, h) {
  const rec = Live.history.find((r) => r.t === h); if (!rec) return 0;
  const adt = Live.messages.filter((m) => Math.floor(m.t) === h && m.type !== "ORU").length;
  switch (c.kind) {
    case "adt": return adt || Math.round(UNITS.reduce((s, u, i) => s + rec.arrived[i] + rec.home[i], 0));
    case "vitals": return MONITORED.reduce((s, i) => s + Math.round(rec.C[i]), 0) * 4;
    case "beds": return Math.round(UNITS.reduce((s, u, i) => s + rec.home[i] + rec.cases[i], 0) * 3);
    case "staff": return CBSim.addHours(START, h).getUTCHours() % 12 === 7 ? STAFF_UNITS.reduce((s, i) => s + scheduledRN(i, CBSim.addHours(START, h)), 0) : Math.round(STAFF_UNITS.length * 1.5);
    case "fin": return CBSim.addHours(START, h).getUTCHours() === 2 ? 1800 : 0;
    case "warehouse": return UNITS.length;
    case "env": return 4;
    default: return 0;
  }
}

function renderConnectors(view) {
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Data connectors</div><h1>Connect your data</h1>
      <p>A mock integration hub: pick a common hospital data source, walk the setup a real deployment would need (method, connection, test, field mapping, sync) and watch its sync health. Everything here is simulated: no system is contacted, no credentials are requested, and an uploaded CSV never leaves your browser.</p></div>
      <div class="row"><span class="chip warn">Simulated connections</span></div></div>
    <div class="grid g4" id="cnKpis"></div>
    <div class="card mt"><div class="card-h"><div><h2>Connected</h2><p>Sync health, from the live simulation's own event volume.</p></div></div><div class="grid g3" id="cnLive"></div></div>
    <div class="card mt"><div class="card-h"><div><h2>Catalog</h2><p>Common sources for a command center. Click one to connect.</p></div>
      <input class="input" id="cnQ" placeholder="Search sources" value="${esc(CONN_UI.q)}" style="max-width:220px"></div>
      <div class="row mb" id="cnCats"></div><div class="grid g3" id="cnGrid"></div></div>
    <div class="card mt"><div class="card-h"><div><h2>Data lineage</h2><p>Which connected sources feed which parts of the command center.</p></div></div><div class="table-wrap"><table id="cnLineage"></table></div></div>
    <div id="cnModal"></div>`;
  $("#cnQ").addEventListener("input", (e) => { CONN_UI.q = e.target.value.toLowerCase(); drawCatalog(); });
  $("#cnCats").addEventListener("click", (e) => { const b = e.target.closest("button[data-cat]"); if (b) { CONN_UI.cat = b.dataset.cat; drawCatalog(); } });
  $("#cnGrid").addEventListener("click", (e) => { const c = e.target.closest("[data-conn]"); if (c) openWizard(c.dataset.conn); });
  $("#cnLive").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === "pause") { CONN[id].paused = !CONN[id].paused; saveConn(); refresh(); }
    if (b.dataset.act === "remove") { delete CONN[id]; saveConn(); refresh(); drawCatalog(); toast("Disconnected (simulated)"); }
    if (b.dataset.act === "edit") openWizard(id, 3);
  });
  const drawCatalog = () => {
    $("#cnCats").innerHTML = [["all", "All"]].concat(CONN_CATS).map(([k, l]) => `<button class="btn small ${CONN_UI.cat === k ? "primary" : ""}" data-cat="${k}">${l}</button>`).join("");
    const list = CONNECTORS.filter((c) => (CONN_UI.cat === "all" || c.cat === CONN_UI.cat) && (!CONN_UI.q || (c.name + " " + c.sub).toLowerCase().includes(CONN_UI.q)));
    $("#cnGrid").innerHTML = list.map((c) => `<div class="conn-card ${CONN[c.id] ? "on" : ""}" data-conn="${c.id}" tabindex="0">
      <div class="conn-ico">${connIcon(c.cat)}</div><div class="conn-t"><b>${esc(c.name)}</b><span class="small muted">${esc(c.sub)}</span>
      <div class="row conn-tags">${c.methods.map((m) => `<span class="chip">${esc(METHODS[m].label)}</span>`).join("")}</div></div>
      <div class="conn-state">${CONN[c.id] ? chip("Connected", "ok") : c.planned ? chip("Planned", "warn") : chip("Connect", "")}</div></div>`).join("") || '<div class="empty small">No sources match.</div>';
  };
  const refresh = () => {
    const ids = Object.keys(CONN).filter((id) => CONNECTORS.find((c) => c.id === id));
    const h = Live.t - 1, hourly = ids.map((id) => CONN[id].paused ? 0 : connRate(CONNECTORS.find((c) => c.id === id), h));
    const pages = new Set(ids.flatMap((id) => CONNECTORS.find((c) => c.id === id).feeds));
    $("#cnKpis").innerHTML = kpi("Sources connected", `${ids.length} <span class="of">/ ${CONNECTORS.length}</span>`, `${ids.filter((id) => CONN[id].paused).length} paused`) +
      kpi("Records, last hour", fmt.n(hourly.reduce((a, b) => a + b, 0)), "across connected sources") +
      kpi("Pages fed", `${pages.size} <span class="of">/ ${Object.keys(PAGE_NAME).length}</span>`, [...pages].map((p) => PAGE_NAME[p]).slice(0, 3).join(", ") || "—") +
      kpi("Sync health", ids.some((id) => CONN[id].paused) ? "Attention" : "Healthy", "simulated latency and errors", ids.some((id) => CONN[id].paused) ? "alert" : "accent");
    $("#cnLive").innerHTML = ids.map((id) => {
      const c = CONNECTORS.find((x) => x.id === id), st = CONN[id], series = [];
      for (let k = 23; k >= 0; k--) series.push(st.paused ? 0 : connRate(c, Live.t - 1 - k));
      const max = Math.max(1, ...series), last = series[series.length - 1];
      const lat = c.kind === "adt" || c.kind === "vitals" ? `${(1.2 + (Live.t * 7 % 10) / 10).toFixed(1)} s` : st.sync === "nightly" ? "nightly" : `${(Live.t * 13 % 50) + 20} s`;
      return `<div class="conn-live"><div class="row"><div class="conn-ico sm">${connIcon(c.cat)}</div><div><b>${esc(c.name)}</b><div class="small muted">${esc(METHODS[st.method].label)} · ${esc(syncLabel(st.sync))}</div></div>
          <span class="spacer"></span>${st.paused ? chip("Paused", "warn") : chip("● Healthy", "ok")}</div>
        <svg class="spark" viewBox="0 0 240 40" preserveAspectRatio="none"><path d="${series.map((v, i) => `${i ? "L" : "M"}${(i / 23 * 240).toFixed(1)} ${(38 - v / max * 34).toFixed(1)}`).join(" ")}" /></svg>
        <div class="conn-stats"><div><span>Last hour</span><b>${fmt.n(last)}</b></div><div><span>Latency</span><b>${lat}</b></div><div><span>Errors, 24 h</span><b>0</b></div><div><span>Since</span><b>${fmt.day(CBSim.addHours(START, st.at || 0)).split(", ")[1]}</b></div></div>
        <div class="row"><button class="btn small" data-act="edit" data-id="${id}">Mapping</button><button class="btn small" data-act="pause" data-id="${id}">${st.paused ? "Resume" : "Pause"}</button><button class="btn small" data-act="remove" data-id="${id}">Disconnect</button></div></div>`;
    }).join("") || '<div class="empty small">Nothing connected yet. Pick a source below.</div>';
    $("#cnLineage").innerHTML = `<thead><tr><th>Source</th>${Object.values(PAGE_NAME).map((p) => `<th class="r">${esc(p)}</th>`).join("")}</tr></thead><tbody>` +
      (ids.length ? ids.map((id) => { const c = CONNECTORS.find((x) => x.id === id); return `<tr><td><b>${esc(c.name)}</b></td>${Object.keys(PAGE_NAME).map((k) => `<td class="r">${c.feeds.includes(k) ? '<span class="dot-on">●</span>' : ""}</td>`).join("")}</tr>`; }).join("")
        : `<tr><td colspan="9" class="empty small">Connect a source to see lineage.</td></tr>`) + "</tbody>";
  };
  drawCatalog(); refresh();
  if (CONN_UI.wiz) drawWizard();
  return refresh;
}
function syncLabel(s) { return { stream: "real-time stream", "15m": "every 15 minutes", hourly: "hourly", nightly: "nightly" }[s] || s; }
function connIcon(cat) {
  const p = { ehr: '<path d="M4 4h16v16H4z"/><path d="M9 9h6M12 6v6M8 16h8"/>', device: '<path d="M3 12h4l2-5 4 10 2-5h6"/>', flow: '<path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/>',
    staff: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/>', fin: '<path d="M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.5 0-4 1.2-4 3s1.6 2.6 4 3.2 4.2 1.4 4.2 3.3-1.7 3.2-4.2 3.2c-2.2 0-3.9-.8-4.7-2.3"/>',
    platform: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>', public: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
    file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>' }[cat];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

/* ---------- the connect wizard */
function openWizard(id, step = 0) {
  const c = CONNECTORS.find((x) => x.id === id), st = CONN[id];
  const method = st ? st.method : c.methods[0];
  const map = (MAPS[c.kind] && (MAPS[c.kind][method] || Object.values(MAPS[c.kind])[0])) || [];
  CONN_UI.wiz = { id, step: c.kind === "csv" ? 0 : step, method, sync: st ? st.sync : (["adt", "vitals"].includes(c.kind) ? "stream" : c.kind === "fin" ? "nightly" : "hourly"),
    feeds: st && st.feeds ? st.feeds : c.feeds.slice(), mapping: st && st.mapping ? st.mapping : map.map(([s, t]) => [s, t, 0.86 + ((s.length * 7) % 13) / 100]), tested: !!st, testing: false, backfill: 30 };
  drawWizard();
}
function closeWizard() { CONN_UI.wiz = null; const m = $("#cnModal"); if (m) m.innerHTML = ""; }
function drawWizard() {
  const W = CONN_UI.wiz, el = $("#cnModal"); if (!W || !el) return;
  const c = CONNECTORS.find((x) => x.id === W.id);
  if (c.kind === "csv") return drawCsv(el, c);
  const steps = ["Method", "Connection", "Test", "Map fields", "Sync"];
  const M = METHODS[W.method];
  let body = "";
  if (W.step === 0) body = `<p class="muted">How should the command center receive data from ${esc(c.name)}?</p><div class="stack">${c.methods.map((m) => `<label class="radio-card ${W.method === m ? "on" : ""}"><input type="radio" name="wm" value="${m}" ${W.method === m ? "checked" : ""}><div><b>${esc(METHODS[m].label)}</b><div class="small muted">${esc(METHODS[m].auth)}</div></div></label>`).join("")}</div>`;
  if (W.step === 1) body = `<div class="callout mb">Sandbox only. These are placeholder values for a fictional test endpoint; this demo never asks for a real password, key or token, and nothing is sent.</div>
    <div class="form">${M.fields.map(([l, v]) => `<label><span>${esc(l)}</span><input class="input" value="${esc(v)}"></label>`).join("")}
    <label><span>Authentication</span><input class="input" value="${esc(M.auth)}" readonly></label></div>`;
  if (W.step === 2) body = `<p class="muted">Simulated connection test against the sandbox.</p><ul class="test-list" id="wzTests">${testSteps(c, W).map((t, i) => `<li data-i="${i}" class="${W.tested ? "ok" : ""}"><span class="ti"></span><div><b>${esc(t[0])}</b><div class="small muted">${esc(t[1])}</div></div></li>`).join("")}</ul>
    <div id="wzSample">${W.tested ? sampleHtml(c, W) : ""}</div>`;
  if (W.step === 3) body = `<p class="muted">Map source fields to the command center's data model. Auto-mapped from the standard; adjust anything that differs at your site.</p>
    <div class="table-wrap"><table class="map-table"><thead><tr><th>Source field</th><th></th><th>Command center field</th><th class="r">Confidence</th></tr></thead><tbody>${W.mapping.map(([s, t, conf], i) => `<tr><td class="mono">${esc(s)}</td><td class="muted">→</td>
      <td><select class="input" data-map="${i}">${MODEL_FIELDS.map((f) => `<option ${f === t ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></td><td class="r">${t === "(ignore)" ? "—" : `<span class="chip ${conf > .9 ? "ok" : "warn"}">${Math.round(conf * 100)}%</span>`}</td></tr>`).join("")}</tbody></table></div>`;
  if (W.step === 4) body = `<div class="form"><label><span>Sync</span><select class="input" id="wzSync">${["stream", "15m", "hourly", "nightly"].map((s) => `<option value="${s}" ${W.sync === s ? "selected" : ""}>${syncLabel(s)}</option>`).join("")}</select></label>
    <label><span>Backfill history</span><select class="input" id="wzBack">${[0, 7, 30, 90, 365].map((d) => `<option value="${d}" ${W.backfill === d ? "selected" : ""}>${d ? d + " days" : "None"}</option>`).join("")}</select></label></div>
    <p class="muted mt">Feeds these parts of the command center:</p><div class="row">${c.feeds.map((f) => `<label class="chk"><input type="checkbox" data-feed="${f}" ${W.feeds.includes(f) ? "checked" : ""}> ${esc(PAGE_NAME[f])}</label>`).join("")}</div>
    <div class="callout mt">On a real deployment: PHI stays inside the hospital's network or a BAA-covered cloud tenant; every message is logged and acknowledged; mappings are versioned and tested against a week of production data before go-live.</div>`;
  el.innerHTML = `<div class="modal-back" id="wzBack0"></div><div class="modal" role="dialog" aria-modal="true" aria-label="Connect ${esc(c.name)}">
    <div class="modal-h"><div class="conn-ico sm">${connIcon(c.cat)}</div><div><div class="eyebrow">Connect · simulated</div><h2>${esc(c.name)}</h2></div><span class="spacer"></span><button class="icon-btn" id="wzX" aria-label="Close">✕</button></div>
    <ol class="wz-steps">${steps.map((s, i) => `<li class="${i === W.step ? "on" : i < W.step ? "done" : ""}">${i + 1}. ${s}</li>`).join("")}</ol>
    <div class="modal-b">${body}</div>
    <div class="modal-f">${W.step ? '<button class="btn" id="wzPrev">Back</button>' : ""}<span class="spacer"></span>
      ${W.step === 2 && !W.tested ? `<button class="btn primary" id="wzTest" ${W.testing ? "disabled" : ""}>${W.testing ? "Testing…" : "Run test"}</button>` : W.step < 4 ? '<button class="btn primary" id="wzNext">Next</button>' : '<button class="btn primary" id="wzDone">Connect</button>'}</div></div>`;
  $("#wzX").onclick = closeWizard; $("#wzBack0").onclick = closeWizard;
  if ($("#wzPrev")) $("#wzPrev").onclick = () => { W.step--; drawWizard(); };
  if ($("#wzNext")) $("#wzNext").onclick = () => { W.step++; drawWizard(); };
  $$('input[name="wm"]', el).forEach((r) => r.onchange = () => { W.method = r.value; const map = (MAPS[c.kind][W.method] || Object.values(MAPS[c.kind])[0]); W.mapping = map.map(([s, t]) => [s, t, 0.86 + ((s.length * 7) % 13) / 100]); W.tested = false; drawWizard(); });
  $$("select[data-map]", el).forEach((s) => s.onchange = () => { const i = Number(s.dataset.map); W.mapping[i][1] = s.value; W.mapping[i][2] = 1; drawWizard(); });
  $$("input[data-feed]", el).forEach((b) => b.onchange = () => { W.feeds = $$("input[data-feed]", el).filter((x) => x.checked).map((x) => x.dataset.feed); });
  if ($("#wzSync")) $("#wzSync").onchange = (e) => { W.sync = e.target.value; };
  if ($("#wzBack")) $("#wzBack").onchange = (e) => { W.backfill = Number(e.target.value); };
  if ($("#wzTest")) $("#wzTest").onclick = () => runTests(c, W);
  if ($("#wzDone")) $("#wzDone").onclick = () => {
    CONN[c.id] = { method: W.method, at: Live.t, sync: W.sync, paused: false, feeds: W.feeds, mapping: W.mapping };
    saveConn(); closeWizard();
    Live.log("ok", `Data source connected: ${c.name}`, `${METHODS[W.method].label}, ${syncLabel(W.sync)}. Simulated.`);
    toast(`${esc(c.name)} connected (simulated). ${W.backfill ? `Backfilling ${W.backfill} days…` : ""}`); route();
  };
}
function testSteps(c, W) {
  const m = W.method;
  return [
    ["Resolve and reach the endpoint", m === "mllp" ? "TCP 6661 through the site-to-site VPN" : m === "upload" ? "" : "DNS and HTTPS to the sandbox host"],
    ["Secure channel", m === "mllp" ? "VPN tunnel up; MLLP framing negotiated" : "TLS 1.3, certificate chain valid"],
    ["Authenticate", METHODS[m].auth],
    ["Check permissions", m === "fhir" ? "Scopes granted: Encounter, Observation, Location (read)" : "Read access to the requested data"],
    ["Pull a sample", "25 recent records from the sandbox"],
    ["Validate schema", "Required fields present; codes recognized (LOINC, HL7 tables, unit names)"],
  ];
}
function runTests(c, W) {
  W.testing = true; drawWizard();
  const items = $$("#wzTests li");
  items.forEach((li, i) => {
    setTimeout(() => li.classList.add("run"), i * 450);
    setTimeout(() => { li.classList.remove("run"); li.classList.add("ok"); }, i * 450 + 380);
  });
  setTimeout(() => { W.testing = false; W.tested = true; drawWizard(); }, items.length * 450 + 200);
}
/* sample records: taken from the live simulation, shaped like the source would deliver them */
function sampleHtml(c, W) {
  if (c.kind === "adt" || c.kind === "fhirsvc") {
    const ms = Live.messages.filter((m) => m.type !== "ORU").slice(0, 6);
    return `<p class="small muted mt">Sample (from the simulation):</p><table><thead><tr><th>Event</th><th>MRN</th><th>Unit / bed</th><th>Time</th></tr></thead><tbody>${ms.map((m) => `<tr><td><span class="msg-type t-${m.type}">${m.type}</span></td><td class="mono">${esc(m.mrn)}</td><td>${esc(m.to || m.from || "")} ${esc(m.bed || "")}</td><td class="num">${fmt.time(CBSim.addHours(START, m.t))}</td></tr>`).join("")}</tbody></table>`;
  }
  if (c.kind === "vitals") {
    const ps = Live.allPatients().filter((p) => p.last).slice(0, 5);
    return `<p class="small muted mt">Sample (from the simulation):</p><table><thead><tr><th>Bed</th><th class="r">HR</th><th class="r">SBP</th><th class="r">RR</th><th class="r">SpO₂</th><th class="r">Temp</th></tr></thead><tbody>${ps.map((p) => `<tr><td>${esc(p.bed)}</td><td class="r num">${p.last.hr}</td><td class="r num">${p.last.sbp}</td><td class="r num">${p.last.rr}</td><td class="r num">${p.last.spo2}</td><td class="r num">${p.last.temp.toFixed(1)}</td></tr>`).join("")}</tbody></table>`;
  }
  if (c.kind === "staff") {
    return `<p class="small muted mt">Sample (from the simulation):</p><table><thead><tr><th>Unit</th><th>Shift</th><th class="r">RNs scheduled</th></tr></thead><tbody>${STAFF_UNITS.slice(0, 6).map((i) => `<tr><td>${esc(UNITS[i].name)}</td><td>${shiftLabel(shiftStart(Live.now()))}</td><td class="r num">${scheduledRN(i)}</td></tr>`).join("")}</tbody></table>`;
  }
  const rec = Live.history.at(-1);
  return `<p class="small muted mt">Sample (from the simulation):</p><table><thead><tr><th>Unit</th><th class="r">Census</th><th class="r">Beds</th></tr></thead><tbody>${MONITORED.slice(0, 6).map((i) => `<tr><td>${esc(UNITS[i].name)}</td><td class="r num">${Math.round(rec.C[i])}</td><td class="r num">${UNITS[i].beds}</td></tr>`).join("")}</tbody></table>`;
}

/* ---------- CSV upload: real parsing, entirely in the browser */
const CSV_TARGETS = ["(ignore)", "Unit", "Census", "Beds", "Timestamp", "Facility"];
function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else f += ch;
  }
  row.push(f); if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}
function guessTarget(h) {
  const s = h.toLowerCase();
  if (/unit|dept|department|ward|location/.test(s)) return "Unit";
  if (/census|patients|occupied|count/.test(s)) return "Census";
  if (/bed|capacity|staffed/.test(s)) return "Beds";
  if (/time|date|hour/.test(s)) return "Timestamp";
  if (/facility|site|hospital|campus/.test(s)) return "Facility";
  return "(ignore)";
}
function matchUnit(v) {
  const s = String(v).trim().toLowerCase();
  return UNITS.findIndex((u) => !u.parent && (u.id.toLowerCase() === s || u.name.toLowerCase() === s || u.name.toLowerCase().includes(s) && s.length > 3));
}
function sampleCsv() {
  const rec = Live.history.at(-1), ts = CBSim.addHours(START, rec.t).toISOString().slice(0, 16).replace("T", " ");
  return "timestamp,facility,department,occupied,staffed_beds\n" + visibleUnits.filter((u) => isBedUnit(u)).map((u) => `${ts},"${FAC[u.facility].name}","${u.name}",${Math.max(0, Math.round(rec.C[UIX[u.id]] + (Math.random() * 4 - 2)))},${u.beds}`).join("\n") + "\n";
}
function drawCsv(el, c) {
  const W = CONN_UI.wiz, D = CONN_UI.csv;
  let body = `<div class="callout mb">Your file is read and parsed in this browser. It is never uploaded, stored or sent anywhere.</div>
    <div class="drop" id="csvDrop"><input type="file" id="csvFile" accept=".csv,text/csv"><div><b>Drop a CSV here or choose a file</b><div class="small muted">A census extract works best: one row per unit with a census count. <a href="#" id="csvSample">Download a sample from the simulation</a>.</div></div></div>`;
  if (D) {
    const head = D.rows[0], data = D.rows.slice(1), map = D.map;
    const ui = head.findIndex((_, i) => map[i] === "Unit"), ci = head.findIndex((_, i) => map[i] === "Census"), bi = head.findIndex((_, i) => map[i] === "Beds");
    const issues = [];
    let matched = 0;
    const cmp = data.map((r) => {
      const u = ui >= 0 ? matchUnit(r[ui]) : -1, cen = ci >= 0 ? Number(r[ci]) : NaN;
      if (ui >= 0 && u < 0) issues.push(`Unknown unit “${r[ui]}”`); else if (u >= 0) matched++;
      if (ci >= 0 && !(cen >= 0)) issues.push(`Row ${data.indexOf(r) + 2}: census “${r[ci]}” isn't a number`);
      if (u >= 0 && bi >= 0 && Number(r[bi]) && cen > Number(r[bi])) issues.push(`${UNITS[u].name}: census ${cen} exceeds ${r[bi]} beds`);
      return { u, cen, raw: r };
    });
    body += `<div class="fc-stats four mt"><div class="stat"><span>File</span><b class="small">${esc(D.name)}</b></div><div class="stat"><span>Rows</span><b>${data.length}</b></div><div class="stat"><span>Units matched</span><b>${matched}/${data.length}</b></div><div class="stat"><span>Issues</span><b class="${issues.length ? "txt-risk" : "txt-ok"}">${issues.length}</b></div></div>
      <h3 class="mt">Map columns</h3><div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th><div class="mono">${esc(h)}</div><select class="input" data-col="${i}">${CSV_TARGETS.map((t) => `<option ${map[i] === t ? "selected" : ""}>${t}</option>`).join("")}</select></th>`).join("")}</tr></thead>
      <tbody>${data.slice(0, 6).map((r) => `<tr>${head.map((_, i) => `<td class="small">${esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      ${issues.length ? `<ul class="checks warn small mt">${issues.slice(0, 6).map((x) => `<li><div>${esc(x)}</div></li>`).join("")}${issues.length > 6 ? `<li><div>…and ${issues.length - 6} more</div></li>` : ""}</ul>` : ""}
      ${ui >= 0 && ci >= 0 ? `<h3 class="mt">Your census vs the simulation now</h3><div class="table-wrap"><table><thead><tr><th>Unit</th><th class="r">Your file</th><th class="r">Simulation</th><th class="r">Difference</th></tr></thead><tbody>${cmp.filter((x) => x.u >= 0).slice(0, 14).map((x) => { const sim = Math.round(Live.state.C[x.u]); return `<tr><td>${esc(UNITS[x.u].name)}</td><td class="r num">${fmt.n(x.cen)}</td><td class="r num">${sim}</td><td class="r num ${Math.abs(x.cen - sim) > 2 ? "txt-warn" : ""}">${x.cen - sim > 0 ? "+" : ""}${fmt.n(x.cen - sim)}</td></tr>`; }).join("")}</tbody></table></div>` : ""}`;
  }
  el.innerHTML = `<div class="modal-back" id="wzBack0"></div><div class="modal" role="dialog" aria-modal="true" aria-label="CSV upload">
    <div class="modal-h"><div class="conn-ico sm">${connIcon("file")}</div><div><div class="eyebrow">Upload · stays in your browser</div><h2>${esc(c.name)}</h2></div><span class="spacer"></span><button class="icon-btn" id="wzX" aria-label="Close">✕</button></div>
    <div class="modal-b">${body}</div>
    <div class="modal-f"><span class="spacer"></span>${D ? '<button class="btn" id="csvClear">Clear</button><button class="btn primary" id="csvDone">Save as a connected source</button>' : ""}</div></div>`;
  $("#wzX").onclick = closeWizard; $("#wzBack0").onclick = closeWizard;
  const load = (file) => {
    if (!file) return;
    if (file.size > 5e6) { toast("That file is over 5 MB; try a smaller extract."); return; }
    const rd = new FileReader();
    rd.onload = () => { const rows = parseCsv(String(rd.result)); if (rows.length < 2) { toast("No data rows found."); return; } CONN_UI.csv = { name: file.name, rows, map: rows[0].map(guessTarget) }; drawWizard(); };
    rd.readAsText(file);
  };
  $("#csvFile").onchange = (e) => load(e.target.files[0]);
  const drop = $("#csvDrop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); load(e.dataTransfer.files[0]); };
  $("#csvSample").onclick = (e) => {
    e.preventDefault();
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([sampleCsv()], { type: "text/csv" })); a.download = "calloway-bay-census-sample.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $$("select[data-col]", el).forEach((s) => s.onchange = () => { D.map[Number(s.dataset.col)] = s.value; drawWizard(); });
  if ($("#csvClear")) $("#csvClear").onclick = () => { CONN_UI.csv = null; drawWizard(); };
  if ($("#csvDone")) $("#csvDone").onclick = () => { CONN.csv = { method: "upload", at: Live.t, sync: "manual", paused: false, feeds: ["census"] }; saveConn(); closeWizard(); toast("CSV saved as a source (in this browser only)."); route(); };
}
