/* tour.js — a two-minute guided walkthrough. Each step routes to a page, can act on the live simulation, and
   spotlights one element with a short explanation. */
const Tour = {
  i: 0, on: false,
  steps: [
    { hash: "#/", sel: null, title: "A hospital command center, simulated",
      text: "Calloway Bay Health is fictional: a 500-bed medical center and five offsite sites. Every patient, nurse, storm and dollar here is simulated, hour by hour, by a model whose numbers are checked against a Python reference. Two minutes, ten stops." },
    { hash: "#/", sel: ".clock-card", title: "The clock runs the hospital",
      text: "Play, step an hour or a day, or speed up to 24 simulated hours a second. Census, vitals, alerts, staffing and money all move with it. The link to share this exact moment is in the top bar." },
    { hash: "#/", sel: "#ovKpis", title: "The system at a glance",
      text: "Census against beds, main-campus occupancy, the ED, open early-warning alerts and operating income. Red cards need attention." },
    { hash: "#/environment", sel: "#envPresets", title: "Something is coming: a respiratory surge",
      text: "Season, weather and events drive arrivals and length of stay. The tour is starting a respiratory surge now and fast-forwarding 30 hours.",
      act: () => { if (!Live.effects.length) { const s = SYS.scenarios.find((x) => x.id === "resp"); Live.setScenario(s.name, s.effects); } Live.step(30); } },
    { hash: "#/census/CBMC", sel: "#fcChart", wait: 1800, title: "Forecasts with honest uncertainty",
      text: "120 Monte Carlo paths from this exact hour, with the surge. The gold line is staffed capacity, not just beds. These bands are backtested: the 80% band holds the actual census about 80% of the time." },
    { hash: "#/staffing", sel: "#sfGrid", wait: 2200, title: "Staffing, shift by shift",
      text: "Each unit's staffing grid against forecast census at its nurse ratio. Red is RNs short; click a shift for the fill plan: float pool, then overtime, then agency, with the cost." },
    { hash: "#/patients", sel: "#pwAlerts", title: "Catch deterioration early",
      text: "Every inpatient's vital signs are scored with NEWS2 and qSOFA. A few are quietly deteriorating. Escalate an alert to send the rapid-response team; the scoreboard counts who was caught before a crisis." },
    { hash: "#/beds", sel: "#bpList", title: "Who goes home tomorrow?",
      text: "A discharge model trained in the research (AUC about 0.90 on held-out patients) scores every inpatient for the morning bed huddle, and the app grades its own predictions 24 hours later." },
    { hash: "#/actions", sel: "#acList", wait: 3500, title: "What should we do?",
      text: "Five operational levers, each simulated forward 72 hours against doing nothing: surge beds, a discharge-before-noon push, postponing electives, overflow to Westshore, faster ICU step-down. Ranked by pressure removed, with the cost." },
    { hash: "#/feed", sel: "#fdBody", title: "Speaks the EHR's language",
      text: "Every admission, transfer, discharge and alert is emitted as an HL7 v2 ADT/ORU message, or as FHIR R4 resources with LOINC codes." },
    { hash: "#/connectors", sel: "#cnGrid", title: "Plug in real data",
      text: "A mock integration hub for the usual sources: EHR (FHIR and HL7), bedside monitors, staffing, finance, warehouses and public data. Each has a connect wizard with a connection test and field mapping, and a CSV upload that's parsed right here in the browser." },
    { hash: "#/finance", sel: "#finCase", title: "And what it costs",
      text: "Unit economics live, MS-DRG case mix and length-of-stay index, a flexible budget against the annual plan, and the full-year P&L on the Annual plan tab." },
    { hash: "#/about", sel: ".arch", title: "How it's built",
      text: "One model definition shared by Python and JavaScript and cross-checked in CI, a Web Worker for the Monte Carlo, no framework or CDN. Thanks for taking the tour. Keep playing, or open the research." },
  ],
  start() { this.on = true; this.i = 0; this.show(); },
  stop() { this.on = false; ["tourCard", "tourShade"].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); }); store.set("toured", "1"); },
  go(d) { this.i = Math.max(0, Math.min(this.steps.length - 1, this.i + d)); this.show(); },
  show() {
    const s = this.steps[this.i];
    if (s.act && !s.done) { s.done = true; s.act(); }
    if (location.hash !== s.hash) location.hash = s.hash;
    setTimeout(() => this.place(s), s.wait || 450);
  },
  place(s) {
    if (!this.on) return;
    let shade = document.getElementById("tourShade"), card = document.getElementById("tourCard");
    if (!shade) { shade = document.createElement("div"); shade.id = "tourShade"; document.body.appendChild(shade); }
    if (!card) { card = document.createElement("div"); card.id = "tourCard"; document.body.appendChild(card); }
    const el = s.sel ? document.querySelector(s.sel) : null;
    if (el) el.scrollIntoView({ block: "center", behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
    const r = el ? el.getBoundingClientRect() : null;
    if (r) {
      const pad = 8;
      Object.assign(shade.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
      shade.className = "spot";
    } else shade.className = "full";
    card.innerHTML = `<div class="tour-step">${this.i + 1} / ${this.steps.length}</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
      <div class="row"><button class="btn small" id="tourSkip">${this.i === this.steps.length - 1 ? "Close" : "Skip tour"}</button><span class="spacer"></span>
      ${this.i ? '<button class="btn small" id="tourBack">Back</button>' : ""}${this.i < this.steps.length - 1 ? '<button class="btn small primary" id="tourNext">Next</button>' : '<a class="btn small primary" href="https://research.stellargrove.com/hospital/command_center/" target="_blank" rel="noopener">Read the research</a>'}</div>`;
    const W = 360, vw = window.innerWidth, vh = window.innerHeight;
    let x, y;
    if (!r) { x = (vw - W) / 2; y = vh * .28; }
    else if (r.right + W + 24 < vw) { x = r.right + 18; y = Math.max(16, Math.min(vh - 260, r.top)); }
    else if (r.bottom + 230 < vh) { x = Math.max(16, Math.min(vw - W - 16, r.left)); y = r.bottom + 16; }
    else { x = Math.max(16, Math.min(vw - W - 16, r.left)); y = Math.max(16, r.top - 250); }
    Object.assign(card.style, { left: x + "px", top: y + "px", width: Math.min(W, vw - 32) + "px" });
    card.querySelector("#tourSkip").onclick = () => this.stop();
    const n = card.querySelector("#tourNext"), b = card.querySelector("#tourBack");
    if (n) n.onclick = () => this.go(1);
    if (b) b.onclick = () => this.go(-1);
  },
};
document.addEventListener("keydown", (e) => { if (!Tour.on) return; if (e.key === "Escape") Tour.stop(); if (e.key === "ArrowRight") Tour.go(1); if (e.key === "ArrowLeft") Tour.go(-1); });
window.addEventListener("resize", () => { if (Tour.on) Tour.place(Tour.steps[Tour.i]); });
