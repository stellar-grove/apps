/* Front Office Workbench: Ticket pricing, on tara's SIMULATED club (ticket_pricing research). Demand for section s
   at a game: base_s · e^(game demand) · (price / list)^elasticity_s, capped at capacity. Revenue = fans × (price +
   in-park spend). Prices are chosen with an elasticity estimate (price tests, naive or the planted truth) and every
   outcome is scored against the planted demand model, as in the research backtest. */
"use strict";
window.Tickets = (function () {
  const T = window.FO_TICKETS, E = T.effects, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SECS = T.sections, G = T.guard, GRID = Array.from({ length: 81 }, (_, i) => G[0] + (G[1] - G[0]) * i / 80);
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], MONTHS = { 4: "April", 5: "May", 6: "June", 7: "July", 8: "August", 9: "September" };
  const SRC = { est: "Price-test estimates", naive: "Naive sales data", planted: "The true (planted) values" };
  const DEF = { dow: "Fri", opp: "Average", promo: "None", month: 6, temp: 75, rain: 0, wpct: 0.5, src: "est", pc: T.perCap, sec: 3, mode: "opt" };
  const PRESETS = [
    ["Quiet Tuesday in April", { dow: "Tue", opp: "Weak", promo: "None", month: 4, temp: 58, rain: 0, wpct: 0.46 }],
    ["Typical Friday", { dow: "Fri", opp: "Average", promo: "None", month: 6, temp: 75, rain: 0, wpct: 0.5 }],
    ["Saturday rivalry, fireworks", { dow: "Sat", opp: "Rival", promo: "Fireworks", month: 7, temp: 82, rain: 0, wpct: 0.56 }],
    ["Rainy Wednesday", { dow: "Wed", opp: "Average", promo: "None", month: 5, temp: 61, rain: 1, wpct: 0.5 }],
  ];
  let s = Object.assign({}, DEF), prices = null, plot = null, seasonCache = {};

  const fmtN = (v) => Math.round(v).toLocaleString("en-US");
  const $k = (v) => "$" + (v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.round(v).toLocaleString("en-US"));
  const pct = (v) => (v > 0 ? "+" : "") + (100 * v).toFixed(1) + "%";
  const elast = (sec, src) => (src === "naive" ? Math.min(sec.naive, -0.05) : src === "planted" ? sec.planted : sec.est);

  // ---------- model
  function logD(o) {
    return E.dow[o.dow] + E.opp[o.opp] + E.promo[o.promo] + E.month[String(o.month)] + E.temp * (o.temp - E.tempRef) + E.rain * (o.rain ? 1 : 0) + E.wpct * (o.wpct - 0.5);
  }
  const clampP = (sec, p) => Math.min(sec.list * G[1], Math.max(sec.list * G[0], p));
  const current = (sec, ld) => clampP(sec, sec.list * Math.exp(E.priceResponse * ld));
  const demand = (sec, p, ld, e) => sec.base * Math.exp(ld) * Math.pow(p / sec.list, e);
  const sold = (sec, p, ld) => Math.min(sec.cap, demand(sec, p, ld, sec.planted));  // reality = planted model
  function optimal(sec, ld, e, pc) {
    let best = -Infinity, bp = sec.list;
    for (const m of GRID) { const p = sec.list * m, v = Math.min(sec.cap, demand(sec, p, ld, e)) * (p + pc); if (v > best) { best = v; bp = p; } }
    return bp;
  }
  function score(ps, ld, pc) {
    return SECS.map((sec, i) => { const q = sold(sec, ps[i], ld); return { q, tix: q * ps[i], park: q * pc, tot: q * (ps[i] + pc), fill: q / sec.cap }; });
  }
  function season(src, pc) {
    const key = src + "|" + pc;
    if (seasonCache[key]) return seasonCache[key];
    const acc = { cur: [0, 0, 0], list: [0, 0, 0], opt: [0, 0, 0] }, cap = SECS.reduce((a, x) => a + x.cap, 0) * T.season3.length;
    const secMove = SECS.map(() => [0, 0]);
    T.season3.forEach((g) => SECS.forEach((sec, i) => {
      const ps = { cur: current(sec, g.fc), list: sec.list, opt: optimal(sec, g.fc, elast(sec, src), pc) };
      Object.keys(ps).forEach((k) => { const q = Math.min(sec.cap, demand(sec, ps[k], g.ld, sec.planted)); acc[k][0] += q; acc[k][1] += q * ps[k]; acc[k][2] += q * (ps[k] + pc); });
      secMove[i][0] += ps.cur; secMove[i][1] += ps.opt;
    }));
    return (seasonCache[key] = { acc, cap, secMove: secMove.map(([c, o]) => o / c - 1), n: T.season3.length });
  }

  // ---------- state
  function fromParams(u) {
    s = Object.assign({}, DEF);
    ["month", "temp", "rain", "wpct", "pc", "sec"].forEach((k) => { if (u.has(k) && isFinite(+u.get(k))) s[k] = +u.get(k); });
    if (DAYS.includes(u.get("dow"))) s.dow = u.get("dow");
    if (E.opp[u.get("opp")] != null) s.opp = u.get("opp");
    if (E.promo[u.get("promo")] != null) s.promo = u.get("promo");
    if (SRC[u.get("src")]) s.src = u.get("src");
    if (["opt", "cur", "list"].includes(u.get("mode"))) s.mode = u.get("mode");
    if (!MONTHS[s.month]) s.month = DEF.month;
    s.sec = Math.max(0, Math.min(SECS.length - 1, Math.round(s.sec)));
    setPrices(s.mode);
    SECS.forEach((sec, i) => { const v = u.get("p" + i); if (v != null && isFinite(+v)) { prices[i] = clampP(sec, +v); s.mode = "custom"; } });
  }
  function setPrices(mode) {
    const ld = logD(s);
    prices = SECS.map((sec) => (mode === "list" ? sec.list : mode === "cur" ? current(sec, ld) : optimal(sec, ld, elast(sec, s.src), s.pc)));
    s.mode = mode;
  }
  function writeHash() {
    const u = new URLSearchParams({ tab: "tickets" });
    Object.keys(DEF).forEach((k) => { if (s[k] !== DEF[k] && k !== "mode") u.set(k, s[k]); });
    if (s.mode === "custom") prices.forEach((p, i) => u.set("p" + i, Math.round(p)));
    else if (s.mode !== "opt") u.set("mode", s.mode);
    history.replaceState(null, "", "#/?" + u.toString());
  }

  // ---------- UI
  const sel = (id, label, opts, val) => `<label class="sel"><span class="lbl">${label}</span><select data-t="${id}">` +
    opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? "selected" : ""}>${l}</option>`).join("") + `</select></label>`;
  function slider(id, label, min, max, step, f) {
    return `<label class="param"><span class="pl">${label}</span><output id="to-${id}">${f(s[id])}</output>` +
      `<input type="range" data-t="${id}" min="${min}" max="${max}" step="${step}" value="${s[id]}" style="--fill:${100 * (s[id] - min) / (max - min)}%"></label>`;
  }
  const FMT = { temp: (v) => v + "°F", wpct: (v) => v.toFixed(3).replace(/^0/, ""), pc: (v) => "$" + v };
  const RANGE = { temp: [40, 95, 1], wpct: [0.38, 0.62, 0.005], pc: [0, 60, 1] };

  function render(u) {
    fromParams(u);
    $("#ticketView").innerHTML = `
      <aside class="picker cpanel">
        <div class="lbl">Try a game</div>
        <div class="presets">${PRESETS.map(([l], i) => `<button type="button" class="chip" data-preset="${i}">${l}</button>`).join("")}</div>
        <h3 class="sub">This game</h3>
        <div class="row2">${sel("dow", "Day", DAYS.map((d) => [d, d]), s.dow)}${sel("month", "Month", Object.entries(MONTHS), s.month)}</div>
        <div class="row2">${sel("opp", "Opponent", Object.keys(E.opp).map((o) => [o, o]), s.opp)}${sel("promo", "Promotion", Object.keys(E.promo).map((o) => [o, o]), s.promo)}</div>
        ${slider("temp", "Temperature", ...RANGE.temp, FMT.temp)}${slider("wpct", "Club's win % so far", ...RANGE.wpct, FMT.wpct)}
        <label class="chk"><input type="checkbox" data-t="rain" ${s.rain ? "checked" : ""}> Rain in the forecast</label>
        <h3 class="sub">How prices are set</h3>
        ${sel("src", "Price sensitivity from", Object.entries(SRC), s.src)}
        ${slider("pc", "In-park spend per fan", ...RANGE.pc, FMT.pc)}
        <p class="hint">Prices stay within ${Math.round(G[0] * 100)}%–${Math.round(G[1] * 100)}% of list (the research's fairness guardrails). Results are always scored against the club's true demand, so you can see what a wrong estimate costs.</p>
        <button type="button" class="link" id="tReset">Reset to the research defaults</button>
      </aside>
      <main class="card" id="tMain"></main>`;
    update();
  }

  function update() {
    const ld = logD(s), sc = score(prices, ld, s.pc), cur = score(SECS.map((x) => current(x, ld)), ld, s.pc);
    const sum = (a, k) => a.reduce((t, r) => t + r[k], 0), cap = SECS.reduce((a, x) => a + x.cap, 0);
    const tot = sum(sc, "tot"), curTot = sum(cur, "tot"), fans = sum(sc, "q");
    const S = season(s.src, s.pc), up = (k) => S.acc[k][2] / S.acc.cur[2] - 1;
    const modeLabel = { opt: "optimised with " + SRC[s.src].toLowerCase(), cur: "the club's current prices", list: "flat list prices", custom: "your own prices" }[s.mode];
    $("#tMain").innerHTML = `
      <div class="ph"><div><div class="kick">Ticket pricing · <span class="synth">Simulated club</span></div><h1>${esc(s.dow)} vs ${esc(s.opp.toLowerCase())} opponent, ${MONTHS[s.month]}</h1>
        <div class="meta">${s.promo !== "None" ? esc(s.promo) + " night · " : ""}${s.temp}°F${s.rain ? ", rain" : ""} · club at ${FMT.wpct(s.wpct)} · demand ${pct(Math.exp(ld) - 1)} vs an average game · prices: ${modeLabel}</div></div>
        <div class="phb"><button type="button" class="btn ${s.mode === "opt" ? "on" : ""}" data-mode="opt">Optimise</button>
          <button type="button" class="btn ${s.mode === "cur" ? "on" : ""}" data-mode="cur">Club's current</button>
          <button type="button" class="btn ${s.mode === "list" ? "on" : ""}" data-mode="list">List prices</button></div></div>
      <div class="ctiles">
        <div class="ct"><div class="sv">${fmtN(fans)}</div><div class="sl">Fans (${Math.round(100 * fans / cap)}% of ${fmtN(cap)} seats)</div></div>
        <div class="ct"><div class="sv">${$k(sum(sc, "tix"))}</div><div class="sl">Ticket revenue</div></div>
        <div class="ct"><div class="sv">${$k(tot)}</div><div class="sl">Tickets + in-park spend</div></div>
        <div class="ct ${tot >= curTot ? "good" : "bad"}"><div class="sv">${pct(tot / curTot - 1)}</div><div class="sl">vs the club's current pricing for this game</div></div>
      </div>
      <section class="panel"><h3>The ballpark<small>click a section, or drag its price</small></h3>
        <div class="park-wrap">${parkSVG(sc)}
        <table class="ars ttable"><thead><tr><th>Section</th><th>Price</th><th></th><th>Sold</th><th>Revenue</th></tr></thead><tbody>
        ${SECS.map((sec, i) => `<tr class="${i === s.sec ? "selrow" : ""}" data-sec="${i}"><td>${esc(sec.name)}<small>list $${sec.list} · ${fmtN(sec.cap)} seats</small></td>
          <td class="pp">$${Math.round(prices[i])}<small class="${prices[i] > sec.list ? "up" : prices[i] < sec.list ? "dn" : ""}">${pct(prices[i] / sec.list - 1)} vs list</small></td>
          <td class="ps"><input type="range" data-price="${i}" min="${sec.list * G[0]}" max="${sec.list * G[1]}" step="1" value="${Math.round(prices[i])}" aria-label="${esc(sec.name)} price"
            style="--fill:${100 * (prices[i] / sec.list - G[0]) / (G[1] - G[0])}%"></td>
          <td><span class="fillbar"><span style="width:${100 * sc[i].fill}%;background:${fillColor(sc[i].fill)}"></span></span><small>${fmtN(sc[i].q)} · ${Math.round(100 * sc[i].fill)}%</small></td>
          <td>${$k(sc[i].tot)}</td></tr>`).join("")}
        </tbody></table></div>
      </section>
      <section class="panel"><h3>${esc(SECS[s.sec].name)}: revenue at every price<small>tickets + in-park spend, this game</small></h3>
        <div class="chart"><canvas id="tChart"></canvas></div><p class="note" id="tNote"></p></section>
      <section class="panel"><h3>The whole season<small>${S.n} home games of the simulated club's third season, scored against true demand</small></h3>
        <div class="tw2"><table class="ars ctable"><thead><tr><th>Pricing</th><th>Fans</th><th>Seats filled</th><th>Ticket revenue</th><th>Tickets + in-park</th><th>vs current</th></tr></thead><tbody>
          ${[["Club's current pricing", "cur"], ["Flat list prices", "list"], ["Optimised with " + SRC[s.src].toLowerCase(), "opt"]].map(([l, k]) =>
            `<tr><td>${l}</td><td>${fmtN(S.acc[k][0])}</td><td>${Math.round(100 * S.acc[k][0] / S.cap)}%</td><td>$${(S.acc[k][1] / 1e6).toFixed(1)}M</td><td>$${(S.acc[k][2] / 1e6).toFixed(1)}M</td>` +
            `<td class="${up(k) >= 0 ? "gain" : "loss"}">${pct(up(k))}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="moves">${SECS.map((sec, i) => `<span class="mv2 ${S.secMove[i] >= 0 ? "up" : "dn"}">${esc(sec.name)} <b>${pct(S.secMove[i])}</b></span>`).join("")}</div>
        <p class="note">Average price change by section when optimising, vs the club's current pricing. ${s.src === "naive" ? "Naive sales data makes demand look insensitive to price (busy nights are priced up), so the optimiser raises prices and loses fans." :
          s.src === "est" ? "Price-test estimates land within a fraction of a point of pricing on the true values." : "This is the ceiling: what perfect knowledge of price sensitivity delivers."}
          Elasticities: ${SECS.map((x) => `${x.name} ${elast(x, s.src).toFixed(2)}`).join(", ")}. Data and model from the <a href="https://research.stellargrove.com/baseball/ticket_pricing/">ticket-pricing research</a>; the club is fictional.</p>
      </section>`;
    plot = new Plot($("#tChart"));
    drawCurve(ld);
    writeHash();
  }

  function fillColor(f) { return f >= 0.98 ? "#0D7A3C" : f >= 0.8 ? "#43A06A" : f >= 0.6 ? "#A97E2C" : "#A54A28"; }

  function parkSVG(sc) {
    // six tiers as arcs around home plate: premium closest, upper deck outermost; outfield + bleachers beyond the infield
    const cx = 160, cy = 200, arc = (r0, r1, a0, a1) => {
      const p = (r, a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
      const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
      return `M${x0},${y0} A${r1},${r1} 0 0,0 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0,1 ${x3},${y3} Z`;
    };
    const d = Math.PI / 180;
    const shapes = [
      arc(34, 50, 60 * d, 120 * d),   // Premium club behind home
      arc(52, 76, 35 * d, 145 * d),   // Field box
      arc(78, 104, 28 * d, 152 * d),  // Infield reserve
      arc(122, 150, 55 * d, 125 * d), // Outfield (beyond the infield)
      arc(152, 172, 62 * d, 118 * d), // Bleachers
      arc(106, 120, 20 * d, 160 * d), // Upper deck ring
    ];
    return `<svg class="park" viewBox="0 0 320 210" role="img" aria-label="Ballpark fill by section">
      <path d="M${cx},${cy} L${cx - 95},${cy - 95} A134,134 0 0,1 ${cx + 95},${cy - 95} Z" fill="#E6F1E9"/>
      <path d="M${cx},${cy} l-30,-30 l30,-30 l30,30 Z" fill="#D9C6A5"/>
      ${shapes.map((p, i) => `<path d="${p}" data-sec="${i}" class="tier ${i === s.sec ? "on" : ""}" fill="${fillColor(sc[i].fill)}" fill-opacity="${0.35 + 0.65 * sc[i].fill}"><title>${SECS[i].name}: ${Math.round(100 * sc[i].fill)}% full at $${Math.round(prices[i])}</title></path>`).join("")}
      <circle cx="${cx}" cy="${cy - 4}" r="3" fill="#fff" stroke="#4A5E6D"/>
      <g class="plegend"><rect x="6" y="8" width="10" height="8" fill="#A54A28"/><text x="20" y="15">&lt;60%</text><rect x="52" y="8" width="10" height="8" fill="#A97E2C"/><text x="66" y="15">60–80</text>
      <rect x="100" y="8" width="10" height="8" fill="#43A06A"/><text x="114" y="15">80–98</text><rect x="148" y="8" width="10" height="8" fill="#0D7A3C"/><text x="162" y="15">sold out</text></g>
    </svg>`;
  }

  function drawCurve(ld) {
    const sec = SECS[s.sec], e = elast(sec, s.src), xs = GRID.map((m) => sec.list * m);
    const truth = xs.map((p) => Math.min(sec.cap, demand(sec, p, ld, sec.planted)) * (p + s.pc) / 1e3);
    const belief = xs.map((p) => Math.min(sec.cap, demand(sec, p, ld, e)) * (p + s.pc) / 1e3);
    const cp = current(sec, ld), op = optimal(sec, ld, e, s.pc), tp = optimal(sec, ld, sec.planted, s.pc);
    const layers = [{ name: "True revenue", x: xs, y: truth, color: SG.navy, width: 3 }];
    if (s.src !== "planted") layers.push({ name: "What " + (s.src === "naive" ? "naive data" : "the estimate") + " predicts", x: xs, y: belief, color: "#A97E2C", dash: true, width: 2 });
    const yAt = (p) => Math.min(sec.cap, demand(sec, p, ld, sec.planted)) * (p + s.pc) / 1e3;
    plot.set({ x: { label: "Ticket price ($)", min: xs[0], max: xs[xs.length - 1], hoverLabel: "Price", hoverDecimals: 0 },
      y: { label: "Revenue ($ thousands)", min: 0, max: Math.max(...truth, ...belief) * 1.18, hoverDecimals: 1, unit: "k" }, layers,
      vlines: [{ x: cp, color: "#9FB6C6", label: "current $" + Math.round(cp), row: 2 }, { x: prices[s.sec], color: SG.forest, label: "yours $" + Math.round(prices[s.sec]), row: 3 }],
      markers: [{ x: tp, y: yAt(tp), color: SG.navy, fill: SG.gold, r: 6, label: "best $" + Math.round(tp) }, { x: prices[s.sec], y: yAt(prices[s.sec]), color: SG.forest, r: 5 }] });
    const kink = xs.find((p) => demand(sec, p, ld, sec.planted) <= sec.cap);
    $("#tNote").textContent = `Price sensitivity ${sec.planted.toFixed(2)} (true) vs ${e.toFixed(2)} used for pricing. ` +
      (kink && kink > xs[0] ? `Below about $${Math.round(kink)} the section sells out, so cutting further only gives money away. ` : "") +
      `Each fan is worth the ticket plus $${s.pc} in the park, which is why the best price is often below list.`;
  }

  // ---------- events
  function onInput(e) {
    const t = e.target;
    if (t.dataset.price != null) {
      const i = +t.dataset.price; prices[i] = +t.value; s.mode = "custom"; s.sec = i; update();
      const again = document.querySelector(`[data-price="${i}"]`); if (again) again.focus();
      return;
    }
    const k = t.dataset.t; if (!k || t.tagName !== "INPUT" || t.type !== "range") return;
    s[k] = +t.value; $("#to-" + k).textContent = FMT[k](s[k]);
    t.style.setProperty("--fill", (100 * (s[k] - RANGE[k][0]) / (RANGE[k][1] - RANGE[k][0])) + "%");
    if (s.mode !== "custom") setPrices(s.mode);
    update();
  }
  function onChange(e) {
    const t = e.target, k = t.dataset.t; if (!k) return;
    if (t.type === "checkbox") s[k] = t.checked ? 1 : 0;
    else if (t.tagName === "SELECT") s[k] = ["month"].includes(k) ? +t.value : t.value;
    else return;
    if (k === "src" && s.mode === "custom") s.mode = "opt";
    if (s.mode !== "custom") setPrices(s.mode);
    update();
  }
  function onClick(e) {
    const t = e.target.closest("button, [data-sec]"); if (!t) return;
    if (t.dataset.mode) { setPrices(t.dataset.mode); update(); }
    else if (t.dataset.preset != null) { const p = PRESETS[+t.dataset.preset][1]; render(new URLSearchParams(Object.assign({ src: s.src, pc: s.pc }, p))); }
    else if (t.id === "tReset") render(new URLSearchParams());
    else if (t.dataset.sec != null && !e.target.closest("input")) { s.sec = +t.dataset.sec; update(); }
  }
  return { render, bind(root) { root.addEventListener("input", onInput); root.addEventListener("change", onChange); root.addEventListener("click", onClick); },
    _season: (src, pc) => season(src, pc) };
})();
