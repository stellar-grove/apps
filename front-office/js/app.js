/* Front Office Workbench: player analysis. Data: window.FO from data/players.js (built by build_data.py). */
"use strict";
(function () {
  const D = window.FO, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MET = Object.fromEntries(D.metrics.map((m) => [m.id, m]));
  const POS = Object.fromEntries(D.positions.map((p) => [p.key, p]));
  const KEY = { hit: "xwoba", pit: "stuff" };
  const byKey = new Map(D.rows.map((r) => [r.id + "-" + r.season, r]));
  const name = (id) => (D.players[id] || {}).name || String(id);
  const last = D.seasons[D.seasons.length - 1];
  let st = { pos: "SS", season: last, id: null, sort: null, q: "", trend: null, cmp: [] };
  let trendPlot = null, movePlot = null;

  // ---------- formatting
  function fmt(m, v) {
    if (v == null) return "—";
    switch (MET[m].fmt) {
      case "rate3": return v.toFixed(3).replace(/^0/, "").replace(/^-0/, "-");
      case "pct": return (100 * v).toFixed(1) + "%";
      case "mph": return v.toFixed(1) + " mph";
      case "fts": return v.toFixed(1) + " ft/s";
      case "runs": return (v > 0 ? "+" : "") + v.toFixed(1);
      case "int": return (m === "oaa" && v > 0 ? "+" : "") + Math.round(v);
      case "rpm": return Math.round(v).toLocaleString("en-US") + " rpm";
      case "ft": return v.toFixed(1) + " ft";
      default: return String(v);
    }
  }
  const scale = (m, v) => (v == null ? NaN : MET[m].fmt === "pct" ? 100 * v : v);
  function pcolor(p) {
    const a = [165, 74, 40], mid = [190, 201, 208], b = [13, 122, 60], t = p / 100;
    const [c0, c1, u] = t < 0.5 ? [a, mid, t / 0.5] : [mid, b, (t - 0.5) / 0.5];
    return "rgb(" + c0.map((x, i) => Math.round(x + (c1[i] - x) * u)).join(",") + ")";
  }
  const PLURAL = { C: "catchers", "1B": "first basemen", "2B": "second basemen", "3B": "third basemen", SS: "shortstops",
    LF: "left fielders", CF: "center fielders", RF: "right fielders", DH: "designated hitters", SP: "starting pitchers", RP: "relief pitchers" };
  const metricsFor = (g) => D.metrics.filter((m) => m.groups.includes(g));
  const kindOf = (g) => POS[g].kind;
  const pool = (g = st.pos, s = st.season) => D.rows.filter((r) => r.group === g && r.season === s);
  function age(id, season) {
    const b = (D.players[id] || {}).born; if (!b) return null;
    const d = new Date(b + "T00:00:00Z"), ref = new Date(Date.UTC(season, 6, 1));
    let a = ref.getUTCFullYear() - d.getUTCFullYear();
    if (ref < new Date(Date.UTC(ref.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))) a--;
    return a;
  }
  function median(xs) { const s = xs.filter((x) => isFinite(x)).sort((a, b) => a - b); if (!s.length) return NaN;
    const k = (s.length - 1) / 2; return (s[Math.floor(k)] + s[Math.ceil(k)]) / 2; }

  window.FOAPP = { byKey, name, age: (id, season) => age(id, season) };

  // ---------- URL state
  function readHash() {
    const u = new URLSearchParams(location.hash.replace(/^#\/?\??/, ""));
    if (u.get("pos") && POS[u.get("pos")]) st.pos = u.get("pos");
    if (u.get("season") && D.seasons.includes(+u.get("season"))) st.season = +u.get("season");
    st.id = u.get("id") ? +u.get("id") : null;
    st.sort = u.get("sort") && MET[u.get("sort")] ? u.get("sort") : null;
    st.trend = u.get("trend") && MET[u.get("trend")] ? u.get("trend") : null;
    st.cmp = (u.get("cmp") || "").split(",").filter((k) => byKey.has(k)).slice(0, 3);
  }
  function writeHash() {
    const u = new URLSearchParams({ pos: st.pos, season: st.season });
    if (st.id) u.set("id", st.id);
    if (st.sort) u.set("sort", st.sort);
    if (st.trend) u.set("trend", st.trend);
    if (st.cmp.length) u.set("cmp", st.cmp.join(","));
    history.replaceState(null, "", "#/?" + u.toString());
  }

  // ---------- picker
  function renderPicker() {
    $("#pos").innerHTML = D.positions.map((p) =>
      `<button type="button" data-pos="${p.key}" class="${p.key === st.pos ? "on" : ""}" title="${esc(p.label)}">${p.key}</button>`).join("");
    $("#season").innerHTML = D.seasons.slice().reverse().map((s) => `<option value="${s}" ${s === st.season ? "selected" : ""}>${s}</option>`).join("");
    const ms = metricsFor(st.pos).filter((m) => pool().some((r) => r.v[m.id] != null));
    const sortId = st.sort && ms.some((m) => m.id === st.sort) ? st.sort : (ms.find((m) => m.id === KEY[kindOf(st.pos)]) || ms[0] || {}).id;
    $("#sort").innerHTML = ms.map((m) => `<option value="${m.id}" ${m.id === sortId ? "selected" : ""}>${esc(m.label)}</option>`).join("");
    renderList(sortId);
  }
  function renderList(sortId) {
    sortId = sortId || $("#sort").value;
    const all = pool(), q = st.q.trim().toLowerCase();
    const hi = !sortId || MET[sortId].better === "high";
    const rows = all.filter((r) => !q || name(r.id).toLowerCase().includes(q))
      .sort((a, b) => {
        const x = a.v[sortId], y = b.v[sortId];
        if (x == null && y == null) return name(a.id).localeCompare(name(b.id));
        if (x == null) return 1; if (y == null) return -1;
        return hi ? y - x : x - y;
      });
    if (!st.id || !all.some((r) => r.id === st.id)) st.id = rows.length ? rows[0].id : null;
    $("#count").textContent = `${all.length} qualified ${PLURAL[st.pos]} in ${st.season}` + (q ? ` · ${rows.length} match` : "");
    $("#list").innerHTML = rows.map((r, i) =>
      `<li><button type="button" data-id="${r.id}" class="${r.id === st.id ? "on" : ""}">` +
      `<span class="rk">${i + 1}</span><span class="nm">${esc(name(r.id))}<small>${esc(r.team || "")}</small></span>` +
      `<span class="vl">${sortId ? fmt(sortId, r.v[sortId]) : ""}</span></button></li>`).join("") ||
      `<li class="none">No players match.</li>`;
  }

  // ---------- player card
  function renderCard() {
    const r = byKey.get(st.id + "-" + st.season);
    if (!r) { $("#card").innerHTML = `<div class="empty">Choose a player.</div>`; writeHash(); return; }
    const p = D.players[r.id] || {}, g = r.group, kind = kindOf(g), n = pool().length;
    const a = age(r.id, r.season);
    const use = kind === "hit" ? `${r.pa} PA` : `${r.ip} IP · ${r.g} G · ${r.gs} GS`;
    const inCmp = st.cmp.includes(r.id + "-" + r.season);
    const ms = metricsFor(g);
    const cats = [...new Set(ms.map((m) => m.cat))];
    const bars = cats.map((c) => {
      const rows = ms.filter((m) => m.cat === c).map((m) => {
        const v = r.v[m.id], pc = r.p[m.id];
        const bar = pc == null ? `<span class="na">${v == null ? "no data" : "not ranked"}</span>` :
          `<span class="track"><span class="fill" style="width:${pc}%;background:${pcolor(pc)}"></span>` +
          `<span class="dot" style="left:${pc}%;background:${pcolor(pc)}">${pc}</span></span>`;
        return `<div class="m ${st.trend === m.id ? "sel" : ""}" data-trend="${m.id}" title="Show the trend">` +
          `<span class="ml">${esc(m.label)}${m.better === "low" ? '<i title="Lower is better">↓</i>' : ""}</span>${bar}<span class="mv">${fmt(m.id, v)}</span></div>`;
      }).join("");
      return `<div class="cat"><h4>${esc(c)}</h4>${rows}</div>`;
    }).join("");

    const trendOpts = ms.filter((m) => D.seasons.some((s) => { const x = byKey.get(r.id + "-" + s); return x && x.v[m.id] != null; }));
    if (!st.trend || !trendOpts.some((m) => m.id === st.trend)) st.trend = (trendOpts.find((m) => m.id === KEY[kind]) || trendOpts[0] || {}).id;

    const sim = (r.sim || []).map(([id, s, dist]) => {
      const x = byKey.get(id + "-" + s);
      return `<li><button type="button" data-goto="${id}-${s}"><span class="nm">${esc(name(id))}</span>` +
        `<small>${s}${x && x.team ? " · " + esc(x.team) : ""}</small><span class="sim-bar" style="--w:${Math.max(5, 100 - 2 * dist)}%"></span></button></li>`;
    }).join("");

    const ars = kind === "pit" && r.arsenal && r.arsenal.length ? `
      <section class="panel"><h3>Arsenal</h3>
        <div class="two"><div class="chart small"><canvas id="move"></canvas></div>
        <table class="ars"><thead><tr><th>Pitch</th><th>Use</th><th>Velo</th><th>H-break</th><th>V-break</th><th>Whiff</th><th>Stuff+</th></tr></thead><tbody>
        ${r.arsenal.map((t) => `<tr><td>${esc(t.t)}</td><td>${(100 * t.use).toFixed(0)}%</td><td>${t.velo.toFixed(1)}</td>` +
          `<td>${t.hb > 0 ? "+" : ""}${t.hb.toFixed(1)}"</td><td>${t.ivb > 0 ? "+" : ""}${t.ivb.toFixed(1)}"</td>` +
          `<td>${t.whiff == null ? "—" : (100 * t.whiff).toFixed(0) + "%"}</td>` +
          `<td><span class="pill" style="background:${pcolor(Math.max(0, Math.min(100, 50 + 5 * (t.stuff - 100))))}">${t.stuff}</span></td></tr>`).join("")}
        </tbody></table></div>
        <p class="note">Movement from the catcher's view mirrored so arm-side is positive. Horizontal break is arm-side (+) or glove-side (−); vertical break is induced (spin) movement.</p>
      </section>` : "";

    $("#card").innerHTML = `
      <div class="ph">
        <div><div class="kick">${esc(POS[g].label)} · ${st.season}</div><h1>${esc(name(r.id))}</h1>
          <div class="meta">${[r.team, a ? "Age " + a : null, p.bats ? "Bats " + p.bats : null, p.throws ? "Throws " + p.throws : null, use].filter(Boolean).map(esc).join(" · ")}</div></div>
        <div class="phb">${kind === "hit" ? `<button type="button" class="btn" data-contract="${r.id}">Value a contract →</button>` : ""}
        <button type="button" class="btn ${inCmp ? "on" : ""}" id="cmpBtn">${inCmp ? "✓ In comparison" : "+ Compare"}</button></div>
      </div>
      <section class="panel"><h3>Percentile vs ${PLURAL[g]}, ${st.season}<small>${n} qualified · 100 = best · click a row to chart it</small></h3>
        <div class="bars">${bars}</div>
        <div class="legend"><span>Poor</span><span class="grad"></span><span>Great</span></div>
      </section>
      <section class="panel"><h3>Season trend<select id="trend">${trendOpts.map((m) => `<option value="${m.id}" ${m.id === st.trend ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></h3>
        <div class="chart"><canvas id="trendChart"></canvas></div>
        <p class="note">Dashed line: median of qualified ${PLURAL[g]} each season.${D.pitchLevelSeasons.length < D.seasons.length ? " Seasons without pitch-level data show only Savant leaderboard metrics." : ""}</p>
      </section>
      ${ars}
      <section class="panel"><h3>Most similar player-seasons<small>among ${PLURAL[g]}, any season, by percentile profile</small></h3>
        <ol class="sim">${sim || "<li class='none'>Not enough data.</li>"}</ol>
      </section>`;
    trendPlot = new Plot($("#trendChart"));
    drawTrend(r);
    if ($("#move")) { movePlot = new Plot($("#move")); drawMove(r); }
    writeHash();
  }

  function drawTrend(r) {
    const m = st.trend; if (!m) return;
    const xs = D.seasons, ys = xs.map((s) => { const x = byKey.get(r.id + "-" + s); return x ? scale(m, x.v[m]) : NaN; });
    const med = xs.map((s) => median(pool(r.group, s).map((x) => scale(m, x.v[m]))));
    const unit = { pct: "%", mph: " mph", fts: " ft/s", rpm: " rpm", ft: " ft" }[MET[m].fmt] || "";
    const all = ys.concat(med).filter(isFinite), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1;
    trendPlot.set({
      x: { label: "Season", min: xs[0] - 0.3, max: xs[xs.length - 1] + 0.3, ticks: xs, plain: true, hoverLabel: "Season" },
      y: { label: MET[m].label + (unit ? " (" + unit.trim() + ")" : ""), min: lo - pad, max: hi + pad, unit, hoverDecimals: MET[m].fmt === "rate3" ? 3 : 1, decimals: MET[m].fmt === "rate3" ? 3 : undefined },
      layers: [{ name: "Position median", x: xs, y: med, color: "#9FB6C6", dash: true, width: 2 },
               { name: name(r.id), x: xs, y: ys, color: SG.navy, width: 3 }],
      markers: xs.map((s, i) => (isFinite(ys[i]) ? { x: s, y: ys[i], color: SG.navy, fill: s === st.season ? SG.gold : "#fff", r: s === st.season ? 6 : 4 } : null)).filter(Boolean),
    });
  }
  function drawMove(r) {
    const cols = { "Four-seam": "#1D5B92", Sinker: "#A97E2C", Cutter: "#6A55B8", Slider: "#1F6F3D", Sweeper: "#439CCC",
      Curveball: "#9E366F", Changeup: "#A54A28", Splitter: "#A5679F" };
    movePlot.set({ hoverMode: "xy", x: { label: "Horizontal break (in, arm-side +)", min: -25, max: 25, hoverLabel: "H-break" },
      y: { label: "Induced vertical break (in)", min: -20, max: 25, hoverLabel: "V-break" },
      vlines: [{ x: 0, color: "#C9D3DA", solid: true, width: 1 }], hlines: [{ y: 0, color: "#C9D3DA", solid: true, width: 1 }],
      markers: r.arsenal.map((t) => ({ x: t.hb, y: t.ivb, r: 5 + 14 * Math.sqrt(t.use), color: cols[t.t] || SG.navy, fill: cols[t.t] || SG.navy,
        label: t.t + " " + t.velo.toFixed(0) })) });
  }

  // ---------- comparison
  function renderCompare() {
    const box = $("#compare");
    if (!st.cmp.length) { box.hidden = true; return; }
    box.hidden = false;
    const rs = st.cmp.map((k) => byKey.get(k));
    const groups = [...new Set(rs.map((r) => r.group))];
    const ms = D.metrics.filter((m) => rs.some((r) => m.groups.includes(r.group) && r.v[m.id] != null));
    box.innerHTML = `<div class="ch"><h3>Comparison<small>percentiles are within each player's own position and season</small></h3>` +
      `<button type="button" class="link" id="cmpClear">Clear</button></div><div class="tw"><table><thead><tr><th></th>` +
      rs.map((r) => `<th><button type="button" data-goto="${r.id}-${r.season}">${esc(name(r.id))}</button><small>${r.group} · ${r.season}${r.team ? " · " + esc(r.team) : ""}</small>` +
        `<button type="button" class="x" data-rm="${r.id}-${r.season}" aria-label="Remove">×</button></th>`).join("") + `</tr></thead><tbody>` +
      ms.map((m) => {
        const best = (() => { const v = rs.map((r) => r.v[m.id]).filter((x) => x != null); return v.length > 1 ? (m.better === "high" ? Math.max(...v) : Math.min(...v)) : null; })();
        return `<tr><td>${esc(m.label)}</td>` + rs.map((r) => {
          const v = r.v[m.id], pc = r.p[m.id];
          return `<td class="${v != null && v === best ? "best" : ""}">${fmt(m.id, v)}${pc != null ? `<span class="pill" style="background:${pcolor(pc)}">${pc}</span>` : ""}</td>`;
        }).join("") + `</tr>`;
      }).join("") + `</tbody></table></div>` + (groups.length > 1 ? `<p class="note">Mixed positions: compare raw values with care.</p>` : "");
  }

  // ---------- events
  function goto(key) {
    const r = byKey.get(key); if (!r) return;
    st.pos = r.group; st.season = r.season; st.id = r.id; st.q = ""; $("#q").value = "";
    renderPicker(); renderCard();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-trend]"); if (!t) return;
    if (t.dataset.pos) { st.pos = t.dataset.pos; st.id = null; st.sort = null; renderPicker(); renderCard(); }
    else if (t.dataset.id) { st.id = +t.dataset.id; renderList(); renderCard(); if (window.innerWidth < 900) $("#card").scrollIntoView({ behavior: "smooth" }); }
    else if (t.dataset.goto) goto(t.dataset.goto);
    else if (t.dataset.trend) { st.trend = t.dataset.trend; $("#trend").value = st.trend; drawTrend(byKey.get(st.id + "-" + st.season));
      document.querySelectorAll(".m").forEach((x) => x.classList.toggle("sel", x.dataset.trend === st.trend)); writeHash();
      $("#trendChart").scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (t.id === "cmpBtn") {
      const k = st.id + "-" + st.season, i = st.cmp.indexOf(k);
      if (i >= 0) st.cmp.splice(i, 1); else { st.cmp.push(k); if (st.cmp.length > 3) st.cmp.shift(); }
      renderCard(); renderCompare();
    } else if (t.dataset.rm) { st.cmp = st.cmp.filter((k) => k !== t.dataset.rm); renderCard(); renderCompare(); }
    else if (t.id === "cmpClear") { st.cmp = []; renderCard(); renderCompare(); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "season") { st.season = +e.target.value; renderPicker(); renderCard(); }
    else if (e.target.id === "sort") { st.sort = e.target.value; renderList(st.sort); writeHash(); }
    else if (e.target.id === "trend") { st.trend = e.target.value; renderCard(); }
  });
  $("#q").addEventListener("input", (e) => { st.q = e.target.value; renderList(); });

  $("#gen").textContent = `Data built ${D.generated}; seasons ${D.seasons[0]}–${last}. Qualified: ${D.qualify.pa}+ PA, ${D.qualify.ip_sp}+ IP starters, ${D.qualify.ip_rp}+ IP relievers.`;
  function tabFromHash() { const t = new URLSearchParams(location.hash.replace(/^#\/?\??/, "")).get("tab"); return ["contract", "win", "tickets"].includes(t) ? t : "player"; }
  function route() {
    const tab = tabFromHash();
    document.querySelectorAll(".mode[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    $("#playerView").hidden = tab !== "player"; $("#contractView").hidden = tab !== "contract"; $("#winView").hidden = tab !== "win"; $("#ticketView").hidden = tab !== "tickets";
    const params = new URLSearchParams(location.hash.replace(/^#\/?\??/, ""));
    if (tab === "contract") { $("#compare").hidden = true; Contract.render(params); }
    else if (tab === "win") { $("#compare").hidden = true; WinValue.render(params); }
    else if (tab === "tickets") { $("#compare").hidden = true; Tickets.render(params); }
    else { readHash(); st.q = ""; $("#q").value = ""; renderPicker(); renderCard(); renderCompare(); }
  }
  function go(hash) { history.pushState(null, "", hash); route(); window.scrollTo({ top: 0 }); }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab], [data-contract], [data-goplayer], [data-gowin]"); if (!t) return;
    if (t.dataset.tab === "contract") go("#/?tab=contract" + (st.id && kindOf(st.pos) === "hit" ? "&cid=" + st.id : ""));
    else if (t.dataset.tab === "win") go("#/?tab=win");
    else if (t.dataset.tab === "tickets") go("#/?tab=tickets");
    else if (t.dataset.gowin) go("#/?tab=win&" + t.dataset.gowin);
    else if (t.dataset.tab === "player") go("#/?pos=" + st.pos + "&season=" + st.season + (st.id ? "&id=" + st.id : ""));
    else if (t.dataset.contract) go("#/?tab=contract&cid=" + t.dataset.contract);
    else if (t.dataset.goplayer) {
      const id = +t.dataset.goplayer, rows = D.seasons.map((y) => byKey.get(id + "-" + y)).filter(Boolean), r = rows[rows.length - 1];
      go("#/?pos=" + r.group + "&season=" + r.season + "&id=" + id);
    }
  });
  Contract.bind($("#contractView"));
  WinValue.bind($("#winView"));
  Tickets.bind($("#ticketView"));
  window.addEventListener("hashchange", route);
  window.addEventListener("popstate", route);
  route();
})();
