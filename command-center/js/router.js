/* router.js — shell, navigation, hash routing, live clock controls, theme */
let REFRESH = null;

function buildNav() {
  const link = ([h, i, l, n]) => `<a href="${h}" data-nav="${h}">${i}<span>${esc(l)}</span>${n != null ? `<span class="n" id="${n}"></span>` : ""}</a>`;
  $("#navMain").innerHTML = [["#/", ICON.grid, "Command overview"], ["#/census", ICON.bed, "Census & forecast", "navCensus"], ["#/patients", ICON.heart, "Patient watch", "navAlerts"], ["#/staffing", ICON.users, "Staffing", "navStaff"], ["#/beds", ICON.bed, "Bed planning"]].map(link).join("");
  $("#navPlan").innerHTML = [["#/actions", ICON.spark, "Recommended actions", "navAct"], ["#/environment", ICON.cloud, "Environment & scenarios", "navScen"], ["#/finance", ICON.dollar, "Finance"], ["#/finance/annual", ICON.trend, "Annual plan"]].map(link).join("");
  $("#navSites").innerHTML = FACS.map((f) => `<a href="#/census/${f.id}" data-nav="#/census/${f.id}"><span class="ico site-dot" id="dot-${f.id}"></span><span>${esc(f.name.replace(/ (Medical Center|Community Hospital|Freestanding ED|Surgery Center|Rehabilitation Hospital|Behavioral Health)$/, ""))}</span><span class="n" id="occ-${f.id}"></span></a>`).join("");
  $("#navData").innerHTML = [["#/connectors", ICON.plug, "Data connectors", "navConn"], ["#/feed", ICON.flask, "HL7 / FHIR feed"]].map(link).join("");
  $("#navRef").innerHTML = [["#/methods", ICON.book, "How the model works"], ["#/data", ICON.flask, "About the data"], ["#/about", ICON.grid, "About this project"]].map(link).join("");
  markNav();
}
function markNav() {
  const path = (location.hash || "#/").split("?")[0];
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === path));
}
function crumbs(parts) {
  $("#crumbs").innerHTML = parts.map((p, i) => i === parts.length - 1 ? `<b>${esc(p.label)}</b>` : `<a href="${p.href}" style="color:inherit">${esc(p.label)}</a><span>/</span>`).join(" ");
}

function route() {
  destroyCharts();
  if (typeof CONN_UI !== "undefined") { CONN_UI.wiz = null; }
  document.body.classList.remove("nav-open");
  const view = $("#view");
  const [path] = (location.hash || "#/").slice(1).split("?");
  const seg = path.split("/").filter(Boolean);
  view.classList.remove("fade-in"); void view.offsetWidth; view.classList.add("fade-in");
  REFRESH = null;
  try {
    if (!seg.length) { crumbs([{ label: "Command overview" }]); REFRESH = renderOverview(view); }
    else if (seg[0] === "census") { crumbs([{ label: "Census", href: "#/census" }].concat(seg[1] ? [{ label: FAC[seg[1]]?.name || seg[1] }] : [{ label: "All facilities" }])); REFRESH = renderCensus(view, seg[1]); }
    else if (seg[0] === "beds") { crumbs([{ label: "Bed planning" }]); REFRESH = renderBeds(view); }
    else if (seg[0] === "actions") { crumbs([{ label: "Recommended actions" }]); REFRESH = renderActions(view); }
    else if (seg[0] === "feed") { crumbs([{ label: "HL7 / FHIR feed" }]); REFRESH = renderFeed(view); }
    else if (seg[0] === "connectors") { crumbs([{ label: "Data connectors" }]); REFRESH = renderConnectors(view); }
    else if (seg[0] === "about") { crumbs([{ label: "About this project" }]); REFRESH = renderAbout(view); }
    else if (seg[0] === "staffing") { crumbs([{ label: "Staffing" }]); REFRESH = renderStaffing(view); }
    else if (seg[0] === "patients") { crumbs([{ label: "Patient watch" }]); REFRESH = renderPatients(view); }
    else if (seg[0] === "patient") { crumbs([{ label: "Patient watch", href: "#/patients" }, { label: seg[1] }]); REFRESH = renderPatient(view, seg[1]); }
    else if (seg[0] === "environment") { crumbs([{ label: "Environment & scenarios" }]); REFRESH = renderEnvironment(view); }
    else if (seg[0] === "finance") { crumbs([{ label: "Finance", href: "#/finance" }, { label: seg[1] === "annual" ? "Annual plan" : "Live operations" }]); REFRESH = renderFinance(view, seg[1]); }
    else if (seg[0] === "methods") { crumbs([{ label: "How the model works" }]); REFRESH = renderMethods(view); }
    else if (seg[0] === "data") { crumbs([{ label: "About the data" }]); REFRESH = renderData(view); }
    else view.innerHTML = '<div class="empty">Page not found. <a href="#/">Back to the overview</a></div>';
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card empty">Something went wrong rendering this page.<div class="mono mt">${esc(err.message)}</div></div>`;
  }
  markNav();
  updateChrome();
  window.scrollTo(0, 0);
}

/* the clock, play controls and live badges in the sidebar and top bar */
function updateChrome() {
  const now = Live.now();
  $("#clockDate").textContent = fmt.day(now);
  $("#clockTime").textContent = fmt.clock(now);
  $("#playBtn").innerHTML = Live.playing ? "❚❚" : "▶";
  $("#playBtn").setAttribute("aria-label", Live.playing ? "Pause" : "Play");
  $("#playBtn").classList.toggle("on", Live.playing);
  $("#liveDot").classList.toggle("on", Live.playing);
  const s = snapshot();
  FACS.forEach((f) => {
    const F = s.fac[f.id], o = F.beds ? F.census / F.beds : 0, el = $("#occ-" + f.id), d = $("#dot-" + f.id);
    if (el) el.textContent = fmt.pct(o);
    if (d) d.style.background = occColor(o);
  });
  const open = Live.alerts.filter((a) => a.status === "open").length, na = $("#navAlerts");
  if (na) { na.textContent = open || ""; na.classList.toggle("badge", open > 0); }
  const nc = $("#navCensus"); if (nc) nc.textContent = fmt.pct(s.main);
  const sh = staffingAt(s.rec).filter((x) => x.gap > 0).length, nst = $("#navStaff");
  if (nst) { nst.textContent = sh ? sh + " short" : ""; nst.classList.toggle("warn-dot", sh > 0); }
  const na2 = $("#navAct"); if (na2) { const n = Live.activeLevers().length; na2.textContent = n ? n + " on" : ""; na2.classList.toggle("warn-dot", n > 0); }
  const nco = $("#navConn"); if (nco) nco.textContent = Object.keys(CONN).length + " on";
  const ns = $("#navScen"); if (ns) { ns.textContent = Live.effects.length ? "●" : ""; ns.classList.toggle("warn-dot", !!Live.effects.length); }
  const div = Object.values(s.rec.sat).some(Boolean);
  $("#statusPill").className = "status-pill " + (div ? "crit" : s.main >= .9 ? "warn" : "ok");
  $("#statusPill").textContent = div ? "ED diversion" : s.main >= .9 ? "High census" : "Normal";
}

/* share links: #/route?s=<base64url(JSON)> rebuilds this moment from the seed */
function shareUrl() {
  const s = btoa(unescape(encodeURIComponent(JSON.stringify(Live.shareState())))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return location.href.split("#")[0] + (location.hash.split("?")[0] || "#/") + "?s=" + s;
}
function readShare() {
  const m = (location.hash || "").match(/[?&]s=([^&]+)/); if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) { return null; }
}

(function boot() {
  Live.init();
  const shared = readShare();
  if (shared) { Live.restore(shared); history.replaceState(null, "", location.href.replace(/[?&]s=[^&]+/, "")); }
  $("#speedSeg").innerHTML = [[1, "1×"], [2, "2×"], [6, "6×"], [24, "24×"]].map(([v, l]) => `<button data-v="${v}" class="${Live.speed === v ? "on" : ""}" title="${v} simulated hour${v > 1 ? "s" : ""} per second">${l}</button>`).join("");
  onSeg("speedSeg", (v) => Live.setSpeed(Number(v)));
  $("#playBtn").addEventListener("click", () => (Live.playing ? Live.pause() : Live.play()));
  $("#stepBtn").addEventListener("click", () => Live.step(1));
  $("#dayBtn").addEventListener("click", () => Live.step(24));
  $("#resetBtn").addEventListener("click", () => { Live.reset(); route(); });
  $("#themeBtn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    store.set("theme", document.documentElement.dataset.theme);
    route();
  });
  $("#shareBtn").addEventListener("click", () => {
    const url = shareUrl();
    const done = () => toast(`Link copied: this hour, scenario and levers. <span class="small">(${Live.t} simulated hours in)</span>`);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast(`<input class="input" value="${esc(url)}" onclick="this.select()" style="width:100%">`));
    else toast(`<input class="input" value="${esc(url)}" onclick="this.select()" style="width:100%">`);
  });
  $("#tourBtn").addEventListener("click", () => Tour.start());
  if (!shared && store.get("toured", "0") !== "1") setTimeout(() => toast(`New here? <a href="#" id="toastTour">Take the 2-minute tour →</a>`), 900);
  document.addEventListener("click", (e) => { if (e.target.id === "toastTour") { e.preventDefault(); $("#toast").classList.remove("show"); Tour.start(); } });
  $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!document.documentElement.dataset.theme) route(); });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.code === "Space") { e.preventDefault(); Live.playing ? Live.pause() : Live.play(); }
    if (e.key === "n") Live.step(1);
  });
  Live.on(() => { updateChrome(); if (REFRESH) { try { REFRESH(); } catch (err) { console.error(err); } } });
  buildNav();
  window.addEventListener("hashchange", route);
  route();
})();
