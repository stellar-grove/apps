/* Front Office Workbench: Win value. What extra wins are worth at the gate, from tara's win-value research:
   ln(avg home attendance) = β·W% + β'·last W% + λ·last playoffs + club + season effects (2022–2026). Extra fans this
   season = A·81·(e^(β·ΔW/162) − 1); next season the same with β'; a playoff berth adds A·81·(e^λ − 1) next season,
   weighted by how much the extra wins raise the odds of one. */
"use strict";
window.WinValue = (function () {
  const W = window.FO_WINS, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const H = W.homeGames, Z = 1.96;
  const DEF = { club: "", base: 81, add: 1, fan: 75, dpw: 9 };
  let s = Object.assign({}, DEF), view = "fans", plot = null;

  const clubOf = (abbr) => W.clubs.find((c) => c.abbr === abbr);
  const latest = (c) => c.seasons[c.seasons.length - 1];
  const odds = (w) => 1 / (1 + Math.exp(-(W.playoffOdds.a + W.playoffOdds.b * w)));
  const fmtN = (v) => Math.round(v).toLocaleString("en-US");
  const fmtK = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e4 ? Math.round(v / 1e3) + "k" : fmtN(v));
  const $m = (v) => (v < 0 ? "−$" : "$") + Math.abs(v / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 2) + "M";

  function base() {
    const c = clubOf(s.club);
    if (!c) return { name: "A league-average club", att: W.avgAtt, top: Infinity, c: null };
    const l = latest(c);
    return { name: c.name, att: l.att, top: l.top, c, season: l.season };
  }
  function compute(add) {
    const b = base(), A = b.att;
    const gain = (coef, dw) => {
      const per = A * Math.expm1(coef * dw / 162);
      return Math.min(per, Math.max(0, b.top - A)) * H;  // can't sell more seats than the park held at its peak
    };
    const now = gain(W.now.b, add), next = gain(W.next.b, add);
    const p0 = odds(s.base), p1 = odds(s.base + add), dp = p1 - p0;
    const po = dp * Math.min(A * Math.expm1(W.playoffs.b), Math.max(0, b.top - A)) * H;
    const seSum = Math.sqrt(W.now.se ** 2 + W.next.se ** 2 + 2 * W.covNowNext);
    const sumLo = gain(W.now.b + W.next.b - Z * seSum, add), sumHi = gain(W.now.b + W.next.b + Z * seSum, add);
    const nowLo = gain(W.now.b - Z * W.now.se, add), nowHi = gain(W.now.b + Z * W.now.se, add);
    const poLo = dp * A * Math.expm1(W.playoffs.b - Z * W.playoffs.se) * H, poHi = dp * A * Math.expm1(W.playoffs.b + Z * W.playoffs.se) * H;
    const capped = A * Math.expm1(W.now.b * add / 162) > b.top - A;
    return { b, now, next, po, p0, p1, dp, total: now + next + po, nowLo, nowHi, sumLo, sumHi, poLo, poHi, capped };
  }

  // ---------- state
  function fromParams(u) {
    s = Object.assign({}, DEF);
    ["base", "add", "fan", "dpw"].forEach((k) => { if (u.has(k) && isFinite(+u.get(k))) s[k] = +u.get(k); });
    if (u.get("club") && clubOf(u.get("club"))) s.club = u.get("club");
    if (s.club && !u.has("base")) s.base = latest(clubOf(s.club)).w;
  }
  function writeHash() {
    const u = new URLSearchParams({ tab: "win" });
    Object.keys(DEF).forEach((k) => { if (s[k] !== DEF[k]) u.set(k, s[k]); });
    history.replaceState(null, "", "#/?" + u.toString());
  }

  const SL = [
    ["base", "Wins without the upgrade", 60, 110, 1, (v) => v],
    ["add", "Extra wins", 0, 15, 0.5, (v) => "+" + v],
    ["fan", "Revenue per fan", 30, 150, 5, (v) => "$" + v],
    ["dpw", "Market price of a win", 5, 15, 0.5, (v) => "$" + v + "M"],
  ];
  function slider(k) {
    const [id, label, min, max, step, f] = SL.find((x) => x[0] === k);
    return `<label class="param"><span class="pl">${label}</span><output id="wo-${id}">${f(s[id])}</output>` +
      `<input type="range" data-w="${id}" min="${min}" max="${max}" step="${step}" value="${s[id]}" style="--fill:${100 * (s[id] - min) / (max - min)}%"></label>`;
  }

  function render(u) {
    fromParams(u);
    $("#winView").innerHTML = `
      <aside class="picker cpanel">
        <label class="sel"><span class="lbl">Club</span><select id="wClub">
          <option value="">League-average club (${fmtN(W.avgAtt)} a game)</option>
          ${W.clubs.map((c) => `<option value="${c.abbr}" ${c.abbr === s.club ? "selected" : ""}>${esc(c.name)} (${fmtN(latest(c).att)} a game)</option>`).join("")}
        </select></label>
        <h3 class="sub">The wins</h3>${slider("base")}${slider("add")}
        <h3 class="sub">The money</h3>${slider("fan")}${slider("dpw")}
        <p class="hint">Revenue per fan bundles ticket, concessions, parking and merchandise. It's an assumption; a club would use its own per-cap. Media, sponsorship and playoff gate aren't counted.</p>
        <button type="button" class="link" id="wReset">Reset to the research defaults</button>
      </aside>
      <main class="card" id="wMain"></main>`;
    update();
  }

  function update() {
    const R = compute(s.add), b = R.b, gate = R.total * s.fan, cost = s.add * s.dpw * 1e6;
    const cover = cost > 0 ? gate / cost : 0;
    $("#wMain").innerHTML = `
      <div class="ph"><div><div class="kick">Win value · gate revenue</div><h1>${esc(b.name)}</h1>
        <div class="meta">${b.c ? `${fmtN(b.att)} fans a game in ${b.season} · ${latest(b.c).w}–${latest(b.c).l}${latest(b.c).po ? " · made the playoffs" : ""} · biggest crowd ${fmtN(b.top)}` :
          `average of ${W.nClubSeasons} club-seasons, ${W.seasons[0]}–${W.seasons[W.seasons.length - 1]}`}</div></div></div>
      <div class="ctiles">
        <div class="ct"><div class="sv">+${fmtN(R.now)}</div><div class="sl">More home fans this season<br><small>95%: ${fmtN(R.nowLo)} to ${fmtN(R.nowHi)}</small></div></div>
        <div class="ct"><div class="sv">+${fmtN(R.next + R.po)}</div><div class="sl">Next season: ${fmtN(R.next)} carry-over + ${fmtN(R.po)} from better playoff odds</div></div>
        <div class="ct"><div class="sv">${Math.round(100 * R.p0)}% → ${Math.round(100 * R.p1)}%</div><div class="sl">Chance of a playoff berth at ${s.base} → ${s.base + s.add} wins</div></div>
        <div class="ct good"><div class="sv">${$m(gate)}</div><div class="sl">Gate revenue from ${s.add} extra win${s.add === 1 ? "" : "s"} at $${s.fan} a fan<br><small>${$m((R.now + R.next) * s.fan)} without the playoff-odds boost (the research measure)</small></div></div>
        <div class="ct ${cover >= 1 ? "good" : "bad"}"><div class="sv">${cost ? Math.round(100 * cover) + "%" : "—"}</div><div class="sl">of the ${cost ? $m(cost) : "$0"} it costs to buy those wins on the market</div></div>
      </div>
      ${R.capped ? `<p class="warn">Capped: this club's biggest crowd last season was ${fmtN(b.top)}, so the projection stops at a sell-out every game.</p>` : ""}
      <section class="panel"><div class="tabs">
        <button type="button" data-wv="fans" class="${view === "fans" ? "on" : ""}">Fans by extra wins</button>
        <button type="button" data-wv="odds" class="${view === "odds" ? "on" : ""}">Playoff odds</button>
        <button type="button" data-wv="club" class="${view === "club" ? "on" : ""}">Attendance and winning</button></div>
        <div class="chart"><canvas id="wChart"></canvas></div><p class="note" id="wNote"></p></section>
      <section class="panel"><h3>Where the money comes from</h3><div class="tw2"><table class="ars ctable"><thead><tr>
        <th>Source</th><th>Extra fans</th><th>95% range</th><th>Revenue at $${s.fan}</th></tr></thead><tbody>
        <tr><td>This season</td><td>${fmtN(R.now)}</td><td>${fmtN(R.nowLo)} – ${fmtN(R.nowHi)}</td><td>${$m(R.now * s.fan)}</td></tr>
        <tr><td>Next season (carry-over)</td><td>${fmtN(R.next)}</td><td rowspan="1">this + next: ${fmtN(R.sumLo)} – ${fmtN(R.sumHi)}</td><td>${$m(R.next * s.fan)}</td></tr>
        <tr><td>Next season (playoff odds +${Math.round(100 * R.dp)} pts)</td><td>${fmtN(R.po)}</td><td>${fmtN(R.poLo)} – ${fmtN(R.poHi)}</td><td>${$m(R.po * s.fan)}</td></tr>
        <tr class="tot"><td>Total</td><td>${fmtN(R.total)}</td><td></td><td>${$m(gate)}</td></tr></tbody></table></div>
        <p class="note">From the <a href="https://research.stellargrove.com/baseball/win_value/">win-value research</a>: club and season fixed effects, so it's the same club in a better year.
        One extra win is worth ${fmtN(W.avgAtt * Math.expm1(W.now.b / 162) * H)} fans this season and ${fmtN(W.avgAtt * Math.expm1(W.next.b / 162) * H)} next for a league-average club; a playoff berth adds ${fmtN(W.avgAtt * Math.expm1(W.playoffs.b) * H)} the following season.
        Effects scale with the club's own attendance. Playoff odds by wins are a logistic fit to ${W.playoffOdds.n} club-seasons in the 12-team format (2022 on).</p>
      </section>`;
    plot = new Plot($("#wChart"));
    draw(R);
    writeHash();
  }

  function draw(R) {
    const note = $("#wNote");
    if (view === "fans") {
      const xs = []; for (let x = 0; x <= 15; x += 0.5) xs.push(x);
      const rs = xs.map((x) => compute(x));
      plot.set({ x: { label: "Extra wins", min: 0, max: 15, hoverLabel: "Extra wins", hoverDecimals: 1 },
        y: { label: "Extra home fans (thousands)", min: 0, hoverDecimals: 1, unit: "k" },
        layers: [{ name: "Total", x: xs, y: rs.map((r) => r.total / 1e3), color: SG.navy, width: 3 },
                 { name: "This season", x: xs, y: rs.map((r) => r.now / 1e3), color: SG.forest, width: 2 },
                 { name: "Next season carry-over", x: xs, y: rs.map((r) => r.next / 1e3), color: "#439CCC", width: 2 },
                 { name: "Playoff odds", x: xs, y: rs.map((r) => r.po / 1e3), color: "#A97E2C", width: 2, dash: true }],
        markers: [{ x: s.add, y: R.total / 1e3, color: SG.navy, fill: SG.gold, r: 6 }] });
      note.textContent = "The playoff line bends because odds rise fastest for clubs near the cut line (around 85 wins) and flatten for clubs already in or out.";
    } else if (view === "odds") {
      const xs = []; for (let w = 60; w <= 110; w++) xs.push(w);
      plot.set({ x: { label: "Season wins", min: 60, max: 110, decimals: 0, hoverLabel: "Wins" },
        y: { label: "Chance of a playoff berth (%)", min: 0, max: 100, unit: "%", hoverDecimals: 0 },
        layers: [{ name: "Playoff odds", x: xs, y: xs.map((w) => 100 * odds(w)), color: SG.navy, width: 3 }],
        vlines: [{ x: s.base, color: "#9FB6C6", label: "without: " + Math.round(100 * R.p0) + "%", row: 2 },
                 { x: s.base + s.add, color: SG.forest, label: "with: " + Math.round(100 * R.p1) + "%", row: 3 }],
        markers: [{ x: s.base, y: 100 * R.p0, color: "#9FB6C6", r: 5 }, { x: s.base + s.add, y: 100 * R.p1, color: SG.forest, fill: SG.gold, r: 6 }] });
      note.textContent = `Fitted to ${W.playoffOdds.n} club-seasons since 2022 (12 playoff teams). Extra wins matter most for a club near the cut line.`;
    } else {
      const all = [];
      W.clubs.forEach((c) => c.seasons.forEach((x) => all.push({ c, x })));
      const c = R.b.c;
      plot.set({ hoverMode: "xy", x: { label: "Season wins", min: 50, max: 112, decimals: 0, hoverLabel: "Wins" },
        y: { label: "Average home attendance (thousands)", min: 5, max: Math.ceil(Math.max(...all.map((p) => p.x.att)) / 5e3) * 5 + 2, hoverLabel: "Attendance (k)" },
        layers: [{ kind: "points", x: all.map((p) => p.x.w), y: all.map((p) => p.x.att / 1e3), color: "#9FB6C6", size: 6, alpha: 0.7 }],
        markers: c ? c.seasons.map((x) => ({ x: x.w, y: x.att / 1e3, color: SG.navy, fill: x.po ? SG.gold : "#fff", r: 6, label: String(x.season) })) : [] });
      note.textContent = c ? `Each grey dot is a club-season, 2022–2026; ${c.name}'s seasons are labelled (gold = made the playoffs). Clubs differ hugely in size, which is why the model compares each club with itself.`
        : "Each dot is a club-season, 2022–2026. Pick a club to highlight its seasons. Market size swamps winning across clubs, which is why the model compares each club with itself.";
    }
  }

  function onInput(e) {
    const k = e.target.dataset.w; if (!k) return;
    s[k] = +e.target.value;
    const sl = SL.find((x) => x[0] === k);
    $("#wo-" + k).textContent = sl[5](s[k]);
    e.target.style.setProperty("--fill", (100 * (s[k] - sl[2]) / (sl[3] - sl[2])) + "%");
    update();
  }
  function onChange(e) {
    if (e.target.id === "wClub") {
      s.club = e.target.value;
      if (s.club) { s.base = latest(clubOf(s.club)).w; const i = document.querySelector('[data-w="base"]'); i.value = s.base;
        i.style.setProperty("--fill", (100 * (s.base - 60) / 50) + "%"); $("#wo-base").textContent = s.base; }
      update();
    }
  }
  function onClick(e) {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.wv) { view = t.dataset.wv; document.querySelectorAll("[data-wv]").forEach((b) => b.classList.toggle("on", b === t)); draw(compute(s.add)); }
    else if (t.id === "wReset") render(new URLSearchParams(s.club ? { club: s.club } : {}));
  }
  return { render, bind(root) { root.addEventListener("input", onInput); root.addEventListener("change", onChange); root.addEventListener("click", onClick); },
    _compute: (a) => compute(a), _state: () => s };
})();
