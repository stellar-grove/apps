/* Modelling Playground: UI, URL state (#/model?param=value&view=id) and rendering. */
"use strict";
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const EXPLAINERS = "https://research.stellargrove.com/explainers/";
  const plot = new Plot($("#chart"));
  let model = MODELS[0], params = {}, view = null, frame = 0;

  function defaults(m) { const o = {}; m.params.forEach((q) => { o[q.id] = q.value; }); return o; }
  function clamp(q, v) { v = Math.min(q.max, Math.max(q.min, +v)); const k = Math.round((v - q.min) / q.step); return +(q.min + k * q.step).toFixed(6); }

  function readHash() {
    const h = location.hash.replace(/^#\/?/, ""), [id, qs] = h.split("?");
    const m = MODELS.find((x) => x.id === id) || MODELS[0];
    const p = defaults(m), u = new URLSearchParams(qs || "");
    m.params.forEach((q) => { if (u.has(q.id) && isFinite(+u.get(q.id))) p[q.id] = clamp(q, u.get(q.id)); });
    const v = m.views.find((x) => x.id === u.get("view")) || m.views[0];
    return { m, p, v };
  }
  function writeHash() {
    const u = new URLSearchParams();
    model.params.forEach((q) => { if (params[q.id] !== q.value) u.set(q.id, params[q.id]); });
    if (view !== model.views[0]) u.set("view", view.id);
    const s = u.toString();
    history.replaceState(null, "", "#/" + model.id + (s ? "?" + s : ""));
  }

  function nav() {
    $("#models").innerHTML = MODELS.map((m) =>
      `<a href="#/${m.id}" data-id="${m.id}" class="${m === model ? "on" : ""}"><span class="t">${esc(m.short)}</span>` +
      `<span class="c">${esc(m.chapter.split(" · ")[1] || m.chapter)}</span></a>`).join("");
  }

  function load(m, p, v) {
    model = m; params = p; view = v;
    nav();
    $("#kicker").textContent = m.chapter;
    $("#title").textContent = m.title;
    $("#question").textContent = m.question;
    $("#hint").textContent = m.hint || "";
    $("#explainer").href = EXPLAINERS + m.explainer + "/";
    document.title = m.title + " · Modelling Playground · Stellar Grove";
    $("#tabs").innerHTML = m.views.map((x) =>
      `<button role="tab" data-v="${x.id}" aria-selected="${x === v}" class="${x === v ? "on" : ""}">${esc(x.label)}</button>`).join("");
    $("#params").innerHTML = m.params.filter((q) => !q.hidden).map((q) =>
      `<label class="param"><span class="pl">${esc(q.label)}</span><output id="o-${q.id}"></output>` +
      `<input type="range" id="p-${q.id}" data-id="${q.id}" min="${q.min}" max="${q.max}" step="${q.step}" value="${p[q.id]}"></label>`).join("");
    $("#presets").innerHTML = (m.presets || []).map((x, i) => `<button class="chip" data-i="${i}">${esc(x.label)}</button>`).join("");
    $("#actions").innerHTML = (m.actions || []).map((x, i) => `<button class="btn act" data-a="${i}">${esc(x.label)}</button>`).join("");
    syncInputs(); render();
  }

  function syncInputs() {
    model.params.forEach((q) => {
      if (q.hidden) return;
      const inp = $("#p-" + q.id), out = $("#o-" + q.id);
      if (inp && +inp.value !== params[q.id]) inp.value = params[q.id];
      if (out) out.textContent = fmtNum(params[q.id], q.dec) + (q.unit || "");
      if (inp) inp.style.setProperty("--fill", (100 * (params[q.id] - q.min) / (q.max - q.min)) + "%");
    });
    const on = (model.presets || []).findIndex((x) => Object.keys(x.values).every((k) => Math.abs(params[k] - x.values[k]) < 1e-9));
    document.querySelectorAll("#presets .chip").forEach((b, i) => b.classList.toggle("on", i === on));
  }

  function set(changes) {
    Object.keys(changes).forEach((k) => { const q = model.params.find((x) => x.id === k); if (q) params[k] = clamp(q, changes[k]); });
    syncInputs(); schedule();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); }

  function render() {
    plot.set(view.spec(params, set));
    const st = model.stats(params);
    $("#stats").innerHTML = st.map((s) => {
      const [label, v, unit, dec, tone] = s;
      const val = typeof v === "number" ? fmtNum(v, dec == null ? undefined : dec) + (unit || "") : esc(v);
      return `<div class="stat ${tone || ""}"><div class="sv">${val}</div><div class="sl">${esc(label)}</div></div>`;
    }).join("");
    writeHash();
  }

  document.addEventListener("input", (e) => {
    const id = e.target.dataset && e.target.dataset.id;
    if (id) set({ [id]: +e.target.value });
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    if (t.dataset.v) { view = model.views.find((x) => x.id === t.dataset.v); load(model, params, view); }
    else if (t.dataset.i != null && t.classList.contains("chip")) set(model.presets[+t.dataset.i].values);
    else if (t.dataset.a != null) set(model.actions[+t.dataset.a].values(params));
    else if (t.dataset.id && t.closest("#models")) {
      e.preventDefault();
      const m = MODELS.find((x) => x.id === t.dataset.id);
      load(m, defaults(m), m.views[0]);
      document.body.classList.remove("menu");
      if (window.innerWidth < 900) $(".stage").scrollIntoView({ behavior: "smooth" });
    } else if (t.id === "reset") load(model, defaults(model), model.views[0]);
  });
  window.addEventListener("hashchange", () => { const r = readHash(); if (r.m !== model) load(r.m, r.p, r.v); });

  const r = readHash();
  load(r.m, r.p, r.v);
})();
