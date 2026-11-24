/* Calloway Bay Health: census engine, environment, monitoring and finance.
 *
 * A JavaScript port of tara's census_sim (engine.py, environment.py, monitoring.py, finance.py). It reads the
 * system definition exported by census_sim/system.py (data/system.js -> window.CB_SYSTEM). The mean-field run is
 * deterministic and is checked against the Python reference numbers by check.js (node). Monte Carlo paths use
 * a seeded generator, so they match Python in distribution, not draw for draw.
 */
(function (root) {
  'use strict';

  // ---- random numbers -------------------------------------------------------------------------------------
  function rng(seed) {
    var a = seed >>> 0;
    var spare = null;
    var r = {
      u: function () { // mulberry32
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      normal: function () {
        if (spare !== null) { var s = spare; spare = null; return s; }
        var u, v, q;
        do { u = 2 * r.u() - 1; v = 2 * r.u() - 1; q = u * u + v * v; } while (q >= 1 || q === 0);
        var m = Math.sqrt(-2 * Math.log(q) / q);
        spare = v * m;
        return u * m;
      },
      poisson: function (lam) {
        if (lam <= 0) return 0;
        if (lam < 30) {
          var L = Math.exp(-lam), k = 0, p = 1;
          do { k++; p *= r.u(); } while (p > L);
          return k - 1;
        }
        return Math.max(0, Math.round(lam + Math.sqrt(lam) * r.normal()));
      },
      binomial: function (n, p) {
        if (n <= 0 || p <= 0) return 0;
        if (p >= 1) return n;
        if (n < 40) { var k = 0; for (var i = 0; i < n; i++) if (r.u() < p) k++; return k; }
        var mu = n * p, sd = Math.sqrt(mu * (1 - p));
        if (mu < 10) { // inversion
          var q = 1 - p, f = Math.pow(q, n), c = f, x = 0, u = r.u();
          while (u > c && x < n) { f *= (n - x) / (x + 1) * p / q; x++; c += f; }
          return x;
        }
        return Math.min(n, Math.max(0, Math.round(mu + sd * r.normal())));
      },
      exponential: function (mean) { return -Math.log(1 - r.u()) * mean; },
      pick: function (w) {
        var s = 0, i; for (i = 0; i < w.length; i++) s += w[i];
        var x = r.u() * s;
        for (i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
        return w.length - 1;
      }
    };
    return r;
  }

  // ---- dates (UTC throughout, so DST never shifts an hour) ---------------------------------------------------
  var HOUR = 3600e3;
  function addHours(d, h) { return new Date(d.getTime() + h * HOUR); }
  function doy(d) { return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1; }
  function weekday(d) { return (d.getUTCDay() + 6) % 7; } // Monday = 0
  function hourOfWeek(d) { return weekday(d) * 24 + d.getUTCHours(); }
  function mmdd(d) { var m = d.getUTCMonth() + 1, x = d.getUTCDate(); return (m < 10 ? '0' : '') + m + '-' + (x < 10 ? '0' : '') + x; }
  function dayStart(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }

  // ---- plan ----------------------------------------------------------------------------------------------------
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }

  function plan(S) {
    var U = S.units.length, ids = S.units.map(function (u) { return u.id; });
    var ix = {}; ids.forEach(function (k, i) { ix[k] = i; });
    var W = [], base = [], h, d, i;
    for (h = 0; h < 168; h++) { W.push(new Float64Array(U)); base.push(new Float64Array(U)); }
    S.units.forEach(function (u, i) {
      var shape = S.shapes[u.discharge], week = [];
      for (d = 0; d < 7; d++) for (h = 0; h < 24; h++) week.push(shape[h] * (u.weekend_slow && d >= 5 ? S.weekend_discharge : 1));
      var m = mean(week);
      for (h = 0; h < 168; h++) W[h][i] = week[h] / m;
      if (u.arrivals) {
        var a = S.shapes[u.arrival_shape], am = mean(a), dow = S.dows[u.arrival_dow], dm = mean(dow);
        for (d = 0; d < 7; d++) for (h = 0; h < 24; h++) base[d * 24 + h][i] = u.arrivals / 24 * (a[h] / am) * (dow[d] / dm);
      }
    });
    var rank = {}; S.priority.forEach(function (k, r) { rank[k] = r; });
    var routeT = [], routeP = [], sources = [];
    for (i = 0; i < U; i++) sources.push([]);
    S.units.forEach(function (u, i) {
      var tg = Object.keys(u.routes).filter(function (t) { return t !== 'HOME'; });
      routeT.push(tg.map(function (t) { return ix[t]; }));
      routeP.push([u.routes.HOME || 0].concat(tg.map(function (t) { return u.routes[t]; })));
      tg.forEach(function (t) { sources[ix[t]].push(i); });
    });
    sources.forEach(function (list) {
      list.sort(function (a, b) {
        var ra = rank[ids[a]] === undefined ? 99 : rank[ids[a]], rb = rank[ids[b]] === undefined ? 99 : rank[ids[b]];
        return ra - rb || a - b;
      });
    });
    return {
      S: S, U: U, ids: ids, ix: ix, W: W, base: base, routeT: routeT, routeP: routeP, sources: sources,
      beds: S.units.map(function (u) { return u.beds; }),
      capped: S.units.map(function (u) { return u.capped; }),
      los: S.units.map(function (u) { return u.los_h; }),
      kind: S.units.map(function (u) { return u.kind; }),
      overflow: S.units.map(function (u) { return u.overflow.map(function (o) { return ix[o]; }); }),
      amb: S.units.map(function (u) { return u.ambulance_share; }),
      group: S.units.map(function (u, i) { return u.parent ? ix[u.parent] : i; }),
      isEd: S.units.map(function (u) { return !u.capped && u.kind === 'ed'; }),
      isOr: S.units.map(function (u) { return u.kind === 'or'; }),
      init: S.units.map(function (u) { return u.init !== null && u.init !== undefined ? u.init : Math.round(u.beds * u.budget_occ); })
    };
  }

  // ---- environment -----------------------------------------------------------------------------------------
  function respIndex(S, d) {
    var r = S.respiratory, x = Math.abs(d - r.peak_doy); x = Math.min(x, 365 - x);
    return 1 + r.amplitude * Math.exp(-0.5 * Math.pow(x / r.width_days, 2));
  }
  function tempClim(S, d) {
    var c = S.climate;
    return c.t_mean + c.t_amp * Math.cos(2 * Math.PI * (d - c.t_peak_doy) / 365);
  }

  function dailyDrivers(S, start, nDays, stochastic, R) {
    var c = S.climate, out = [], eps = 0, day0 = dayStart(start);
    for (var i = 0; i < nDays; i++) {
      var day = new Date(day0.getTime() + i * 864e5), dd = doy(day);
      var temp = tempClim(S, dd), snow = 0;
      if (stochastic) {
        eps = c.t_ar * eps + Math.sqrt(1 - c.t_ar * c.t_ar) * c.t_sd * R.normal();
        temp += eps;
        var m = day.getUTCMonth() + 1;
        if ((m === 12 || m === 1 || m === 2) && R.u() < c.snow_days_per_winter / 90) snow = R.exponential(c.snow_mean_in);
      }
      out.push({ date: day, temp: temp, snow: snow, resp: respIndex(S, dd), holiday: S.holidays.indexOf(mmdd(day)) >= 0 });
    }
    return out;
  }

  function applyScenario(days, sc) {
    (sc && sc.effects || []).forEach(function (e) {
      if (e.type === 'heat') {
        for (var h = e.start_h; h < e.end_h; h += 24) { var i = Math.floor(h / 24); if (i >= 0 && i < days.length) days[i].temp = Math.max(days[i].temp, e.temp); }
      } else if (e.type === 'snow') {
        var j = Math.floor(e.start_h / 24); if (j >= 0 && j < days.length) days[j].snow = e.inches;
      }
    });
    return days;
  }

  /* Hourly multipliers: {arr[t][u], los[t][u], extra[t][u], callout[t], resp[t], days}. */
  function environment(P, start, hours, sc, stochastic, R, days) {
    var S = P.S, U = P.U, c = S.climate, r = S.respiratory, sn = S.snow;
    days = days || applyScenario(dailyDrivers(S, start, Math.floor(hours / 24) + 2 + Math.ceil(start.getUTCHours() / 24), stochastic, R), sc);
    var get = function (k) { return S.units.map(function (u) { return u.env[k] || 0; }); };
    var respS = get('resp'), losResp = get('los_resp'), heatS = get('heat'), snowDay = get('snow_day'),
      snowAfter = get('snow_after'), elective = get('elective');
    var edBase = P.ix.ED !== undefined ? S.units[P.ix.ED].arrivals : 0, edt = P.ix.EDT;
    var respEff = (sc && sc.effects || []).filter(function (e) { return e.type === 'resp'; });
    var arr = [], los = [], extra = [], callout = new Float64Array(hours), respT = new Float64Array(hours);
    var d0 = dayStart(start).getTime();
    function sev(i) { return i >= 0 && i < days.length ? Math.min(days[i].snow / sn.full_at_in, 1) : 0; }
    for (var t = 0; t < hours; t++) {
      var ts = addHours(start, t), di = Math.round((dayStart(ts).getTime() - d0) / 864e5), d = days[di];
      var Ri = d.resp;
      respEff.forEach(function (e) {
        if (t >= e.start_h) { var f = Math.min(1, (t - e.start_h) / Math.max(e.ramp_h, 1)); Ri = Math.max(Ri, d.resp + f * (e.level - d.resp)); }
      });
      var sToday = sev(di), sAfter = 0, k;
      for (k = 1; k <= sn.after_days; k++) if (di - k >= 0) sAfter = Math.max(sAfter, sev(di - k));
      var sRecent = Math.max(sToday, di >= 1 ? sev(di - 1) : 0);
      var heat = Math.max(0, d.temp - c.heat_threshold);
      var A = new Float64Array(U), L = new Float64Array(U), X = new Float64Array(U);
      for (var u = 0; u < U; u++) {
        var m = (1 + r.k * respS[u] * (Ri - 1)) * (1 + c.heat_per_deg * heatS[u] * heat);
        m = m * (1 - snowDay[u] * sToday) * (1 + snowAfter[u] * sAfter);
        if (d.holiday) m = m * (1 - elective[u]);
        A[u] = m;
        L[u] = (1 + losResp[u] * r.los_k * (Ri - 1)) * (1 + (sn.los_mult - 1) * sRecent);
      }
      callout[t] = sn.callout * sRecent;
      if (sAfter > 0 && edt !== undefined && edBase) X[edt] += sn.trauma_share * sAfter * edBase / 24;
      arr.push(A); los.push(L); extra.push(X); respT[t] = Ri;
    }
    (sc && sc.effects || []).forEach(function (e) {
      if (e.type === 'mci') for (var h = Math.max(0, e.start_h); h < Math.min(e.start_h + e.hours, hours); h++) extra[h][P.ix[e.unit]] += e.patients / e.hours;
    });
    return { arr: arr, los: los, extra: extra, callout: callout, resp: respT, days: days };
  }

  // ---- one path, stepped hour by hour -------------------------------------------------------------------------
  function State(P, init, stochastic, seed) {
    var U = P.U;
    this.P = P; this.stochastic = stochastic; this.R = rng(seed || P.S.seed);
    this.C = new Float64Array(U);
    for (var i = 0; i < U; i++) this.C[i] = stochastic ? Math.round(init[i]) : init[i];
    this.B = []; for (i = 0; i < U; i++) this.B.push(new Float64Array(U));
    this.Q = new Float64Array(U);
  }

  /* Advance one hour. how: hour of week; env row index t. Returns flows for the hour. */
  State.prototype.step = function (how, env, t) {
    var P = this.P, U = P.U, C = this.C, B = this.B, Q = this.Q, R = this.R, st = this.stochastic;
    var home = new Float64Array(U), cases = new Float64Array(U), arrived = new Float64Array(U),
      div = new Float64Array(U), lost = new Float64Array(U), u, v, j;
    // 1. exits
    for (u = 0; u < U; u++) {
      var bs = 0; for (v = 0; v < U; v++) bs += B[u][v];
      var ready = Math.max(C[u] - bs, 0);
      if (ready <= 0) continue;
      var h = 1 - Math.exp(-P.W[how][u] / (P.los[u] * env.los[t][u]));
      var p = P.routeP[u], tg = P.routeT[u];
      if (st) {
        var E = R.binomial(ready, h), left = E, mass = 1;
        for (j = 0; j < p.length; j++) {
          var k = j === p.length - 1 ? left : R.binomial(left, mass > 0 ? Math.min(1, p[j] / mass) : 0);
          mass -= p[j]; left -= k;
          if (j === 0) home[u] = k; else B[u][tg[j - 1]] += k;
        }
      } else {
        var Ef = ready * h;
        home[u] = Ef * p[0];
        for (j = 1; j < p.length; j++) B[u][tg[j - 1]] += Ef * p[j];
      }
      C[u] -= home[u];
    }
    // 2. transfers, then overflow
    function move(u, v, dest) {
      var take = P.capped[dest] ? Math.min(B[u][v], Math.max(P.beds[dest] - C[dest], 0)) : B[u][v];
      if (take <= 0) return;
      B[u][v] -= take; C[u] -= take; C[dest] += take; cases[dest] += take;
    }
    var s, o;
    for (v = 0; v < U; v++) for (s = 0; s < P.sources[v].length; s++) move(P.sources[v][s], v, v);
    for (v = 0; v < U; v++) {
      if (!P.overflow[v].length) continue;
      for (s = 0; s < P.sources[v].length; s++) for (o = 0; o < P.overflow[v].length; o++) move(P.sources[v][s], v, P.overflow[v][o]);
    }
    // 3. arrivals
    for (u = 0; u < U; u++) {
      var lam = P.base[how][u] * env.arr[t][u] + env.extra[t][u];
      var a = st ? R.poisson(lam) : lam, n;
      if (P.isOr[u]) {
        Q[u] += a;
        n = Math.min(Q[u], Math.max(P.beds[u] - C[u], 0));
        Q[u] -= n; C[u] += n; cases[u] += n; arrived[u] += n;
        continue;
      }
      if (!a) continue;
      if (P.isEd[u]) {
        var g = P.group[u], occ = 0;
        for (j = 0; j < U; j++) if (P.group[j] === g) occ += C[j];
        var sat = P.beds[g] ? occ / P.beds[g] >= P.S.ed_divert_at : false;
        var dv = sat ? (st ? Math.round(a * P.amb[u]) : a * P.amb[u]) : 0;
        div[u] = dv; C[u] += a - dv; cases[u] += a - dv; arrived[u] += a - dv;
      } else {
        var rem = a, dests = [u].concat(P.overflow[u]);
        for (j = 0; j < dests.length; j++) {
          var dd = dests[j], take = Math.min(rem, Math.max(P.beds[dd] - C[dd], 0));
          C[dd] += take; cases[dd] += take; arrived[dd] += take; rem -= take;
        }
        lost[u] = rem;
      }
    }
    var board = new Float64Array(U);
    for (u = 0; u < U; u++) for (v = 0; v < U; v++) board[u] += B[u][v];
    return { home: home, cases: cases, arrived: arrived, diverted: div, lost: lost, boarding: board, queue: Float64Array.from(Q) };
  };

  /* Run from `start` for `hours`. Returns per-hour census and flows (arrays of Float64Array). */
  function run(P, start, hours, opt) {
    opt = opt || {};
    var stochastic = !!opt.stochastic, seed = opt.seed || P.S.seed;
    var env = opt.env || environment(P, start, hours, opt.scenario, stochastic, rng(seed + 1), opt.days);
    var st = opt.state || new State(P, opt.init || P.init, stochastic, seed);
    var out = { census: [], boarding: [], home: [], cases: [], diverted: [], lost: [], arrived: [], queue: [], env: env, state: st };
    for (var t = 0; t < hours; t++) {
      var f = st.step(hourOfWeek(addHours(start, t)), env, t);
      out.census.push(Float64Array.from(st.C));
      out.boarding.push(f.boarding); out.home.push(f.home); out.cases.push(f.cases);
      out.diverted.push(f.diverted); out.lost.push(f.lost); out.arrived.push(f.arrived); out.queue.push(f.queue);
    }
    return out;
  }

  function warmStart(P, start, days) {
    days = days || 21;
    var r = run(P, addHours(start, -24 * days), 24 * days, { stochastic: false });
    return Array.from(r.census[r.census.length - 1]);
  }

  // ---- finance -------------------------------------------------------------------------------------------------
  function unitFinance(P, opt) {
    opt = opt || {};
    var S = P.S, fac = {};
    S.facilities.forEach(function (f) { fac[f.id] = f; });
    var fixedMult = opt.fixedMult || 1;
    return S.units.map(function (u) {
      var f = fac[u.facility];
      return {
        perDay: u.basis === 'day', gross: u.gross, vari: u.var_cost,
        net: opt.netRates && opt.netRates[u.facility] != null ? opt.netRates[u.facility] : f.net_rate,
        core: u.beds * u.budget_occ / u.rn_ratio, ratio: u.rn_ratio,
        fixedH: f.fixed_per_bed_day * fixedMult * u.beds / 24
      };
    });
  }

  /* Dollar flows for one hour of one path: returns per-unit object arrays and adds into `acc` if given. */
  function hourMoney(P, A, C, cases, callout, opt, acc) {
    var S = P.S, U = P.U, rn = (opt && opt.rnHourly) || S.rn_hourly, ag = (opt && opt.agencyMult) || S.agency_mult;
    acc = acc || newAcc(U);
    for (var u = 0; u < U; u++) {
      var a = A[u], vol = a.perDay ? C[u] / 24 : cases[u];
      var gross = vol * a.gross, net = gross * a.net, sup = vol * a.vari;
      var need = C[u] / a.ratio, on = a.core * (1 - callout), extra = Math.max(need - on, 0);
      var ot = Math.min(extra, S.ot_pool * a.core), agency = extra - ot;
      var core$ = on * rn, ot$ = ot * rn * S.ot_mult, ag$ = agency * rn * ag;
      acc.gross[u] += gross; acc.net[u] += net; acc.supplies[u] += sup; acc.core[u] += core$;
      acc.ot[u] += ot$; acc.agency[u] += ag$; acc.fixed[u] += a.fixedH;
      acc.pdays[u] += C[u] / 24; acc.cases[u] += cases[u]; acc.otH[u] += ot; acc.agencyH[u] += agency;
    }
    return acc;
  }
  function newAcc(U) {
    var o = {};
    ['gross', 'net', 'supplies', 'core', 'ot', 'agency', 'fixed', 'pdays', 'cases', 'otH', 'agencyH'].forEach(function (k) { o[k] = new Float64Array(U); });
    return o;
  }
  function sum(a, mask) { var s = 0; for (var i = 0; i < a.length; i++) if (!mask || mask[i]) s += a[i]; return s; }
  function pl(P, acc, mask) {
    var o = {};
    ['gross', 'net', 'core', 'ot', 'agency', 'supplies', 'fixed'].forEach(function (k) { o[k] = sum(acc[k], mask); });
    o.deductions = o.gross - o.net;
    o.other = P.S.other_revenue * o.net;
    o.revenue = o.net + o.other;
    o.expenses = o.core + o.ot + o.agency + o.supplies + o.fixed;
    o.operating = o.revenue - o.expenses;
    o.margin = o.revenue ? o.operating / o.revenue : 0;
    return o;
  }
  function unitRows(P, acc) {
    return P.S.units.map(function (u, i) {
      var nursing = acc.core[i] + acc.ot[i] + acc.agency[i], contribution = acc.net[i] - acc.supplies[i] - nursing;
      return { id: u.id, name: u.name, facility: u.facility, pdays: acc.pdays[i], cases: acc.cases[i], net: acc.net[i],
        supplies: acc.supplies[i], core: acc.core[i], ot: acc.ot[i], agency: acc.agency[i], nursing: nursing,
        contribution: contribution, fixed: acc.fixed[i], operating: contribution - acc.fixed[i] };
    });
  }
  function financeOf(P, r, opt) {
    var A = unitFinance(P, opt), acc = newAcc(P.U);
    for (var t = 0; t < r.census.length; t++) hourMoney(P, A, r.census[t], r.cases[t], r.env.callout[t], opt, acc);
    return acc;
  }

  // ---- monitoring --------------------------------------------------------------------------------------------
  function news2(v) {
    var rr = v.rr, sp = v.spo2, bp = v.sbp, hr = v.hr, t = v.temp;
    var p = [
      rr <= 8 ? 3 : rr <= 11 ? 1 : rr <= 20 ? 0 : rr <= 24 ? 2 : 3,
      sp <= 91 ? 3 : sp <= 93 ? 2 : sp <= 95 ? 1 : 0,
      v.o2 ? 2 : 0,
      bp <= 90 ? 3 : bp <= 100 ? 2 : bp <= 110 ? 1 : bp <= 219 ? 0 : 3,
      hr <= 40 ? 3 : hr <= 50 ? 1 : hr <= 90 ? 0 : hr <= 110 ? 1 : hr <= 130 ? 2 : 3,
      v.confused ? 3 : 0,
      t <= 35.0 ? 3 : t <= 36.0 ? 1 : t <= 38.0 ? 0 : t <= 39.0 ? 1 : 2
    ];
    var red = p[0] === 3 || p[1] === 3 || p[3] === 3 || p[4] === 3 || p[5] === 3 || p[6] === 3;
    return { score: p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6], red: red, parts: p };
  }
  function qsofa(v) { return (v.rr >= 22 ? 1 : 0) + (v.sbp <= 100 ? 1 : 0) + (v.confused ? 1 : 0); }

  var VITALS = ['hr', 'sbp', 'rr', 'spo2', 'temp'];
  var FIRST = ['Avery', 'Jordan', 'Morgan', 'Riley', 'Casey', 'Quinn', 'Rowan', 'Hayden', 'Emerson', 'Parker', 'Reese',
    'Sawyer', 'Logan', 'Kendall', 'Drew', 'Blake', 'Cameron', 'Dakota', 'Elliot', 'Finley', 'Harper', 'Jesse', 'Kai', 'Lane'];
  var LAST = 'ABCDEFGHJKLMNPRSTVWY';

  /* A simulated inpatient: baseline vitals, AR(1) wander, optional planted deterioration (hours from now). */
  function Patient(S, R, unit, nowH, id) {
    var M = S.monitoring, k;
    this.id = id; this.unit = unit.id; this.kind = unit.kind; this.admitH = nowH;
    this.name = FIRST[Math.floor(R.u() * FIRST.length)] + ' ' + LAST[Math.floor(R.u() * LAST.length)] + '.';
    this.age = Math.round(Math.min(97, Math.max(19, 64 + 17 * R.normal())));
    this.base = {}; this.wander = {};
    for (k = 0; k < VITALS.length; k++) {
      var key = VITALS[k], b = M.baseline[key];
      this.base[key] = b[0] + b[1] * R.normal();
      this.wander[key] = 0;
    }
    this.base.spo2 = Math.min(this.base.spo2, 99.5);
    this.S_shape = M.onset_shape;
    this.o2 = false; this.det = null; this.event = false; this.history = []; this.ack = false;
    var haz = (M.hazard[unit.kind] || 0) / 24;
    if (haz > 0) {
      var te = R.exponential(1 / haz);
      var names = Object.keys(M.patterns), w = names.map(function (n) { return M.patterns[n].weight; });
      var pat = names[R.pick(w)], hr = M.patterns[pat].hours, dur = hr[0] + R.u() * (hr[1] - hr[0]);
      this.det = { pattern: pat, tEvent: nowH + te, onset: nowH + te - dur, dur: dur };
    }
  }
  Patient.prototype.frac = function (h) {
    if (!this.det) return 0;
    var f = (h - this.det.onset) / this.det.dur;
    return f <= 0 ? 0 : Math.pow(Math.min(f, 1), this.S_shape || 2.2);
  };
  /* Advance 15 minutes and take a reading (noise added). */
  Patient.prototype.tick = function (S, R, h) {
    var M = S.monitoring, f = this.frac(h), pat = this.det && M.patterns[this.det.pattern], v = {}, k;
    for (k = 0; k < VITALS.length; k++) {
      var key = VITALS[k];
      this.wander[key] = M.drift_ar * this.wander[key] + M.drift_sd[key] * R.normal();
      v[key] = this.base[key] + this.wander[key] + (pat ? f * pat[key] : 0);
    }
    v.spo2 = Math.min(v.spo2, 100);
    if (v.spo2 < M.oxygen_below) this.o2 = true;
    if (this.o2) v.spo2 = Math.min(v.spo2 + 4, 98);
    var rd = {
      t: h, hr: Math.round(v.hr + M.noise.hr * R.normal()), sbp: Math.round(v.sbp + M.noise.sbp * R.normal()),
      rr: Math.round(v.rr + M.noise.rr * R.normal()), spo2: Math.min(100, Math.round(v.spo2 + M.noise.spo2 * R.normal())),
      temp: Math.round((v.temp + M.noise.temp * R.normal()) * 10) / 10, o2: this.o2,
      confused: R.u() < f * f * (pat ? pat.confusion : 0)
    };
    var n = news2(rd);
    rd.news2 = n.score; rd.red = n.red; rd.qsofa = qsofa(rd);
    this.history.push(rd);
    if (this.history.length > 96 * 2) this.history.shift();
    if (this.det && h >= this.det.tEvent) this.event = true;
    return rd;
  };


  // ---- patient stays: diagnosis group, planned discharge, discharge order (mirrors census_sim/discharge.py) ------
  var AGE = { peds: [8, 5], nicu: [0, 0], mb: [30, 6], psych: [42, 15] }, ELECTIVE = { surg: .6, ortho: .6 };
  function meanWeight(S, kind) { return S.drgs[kind].reduce(function (a, r) { return a + r.weight * r.share; }, 0); }
  function snapDischarge(S, R, end, hour0) {
    var D = S.discharge, lo = D.window[0], hi = D.window[1], a = end + hour0, hod = ((a % 24) + 24) % 24;
    if (hod < lo) a = a - hod + lo + R.u() * (hi - lo);
    else if (hod >= hi) a = a - hod + 24 + lo + R.u() * (hi - lo);
    var dow = Math.floor(a / 24) % 7;
    if (dow >= 5 && R.u() < D.weekend_hold) a += (7 - dow) * 24;
    return a - hour0;
  }
  /* Give patient p a stay on `unit` starting at nowH (hours from the live start; hour0 = its hour of week).
     initial: the patient is already part-way through (elapsed drawn uniformly over the stay). */
  function planStay(S, R, p, unit, nowH, hour0, initial, keepAge) {
    var drgs = S.drgs[unit.kind];
    if (!drgs) { p.stay = null; return; }
    var D = S.discharge, r = drgs[R.pick(drgs.map(function (d) { return d.share; }))];
    var am = AGE[unit.kind] || [64, 17];
    if (!keepAge) p.age = Math.round(Math.min(98, Math.max(am[0] < 18 ? 0 : 18, am[0] + am[1] * R.normal())));
    var elective = R.u() < (ELECTIVE[unit.kind] || 0);
    var mu = Math.log(unit.los_h) - D.sigma * D.sigma / 2 + D.weight_elasticity * Math.log(r.weight / meanWeight(S, unit.kind))
      + (am[0] >= 18 ? D.age_per_decade * (p.age - 64) / 10 : 0) + (elective ? D.elective : 0);
    var los = Math.exp(mu + D.sigma * R.normal());
    var admit = initial ? nowH - R.u() * los : nowH;
    var end = snapDischarge(S, R, admit + los, hour0);
    var order = R.u() < D.order_prob ? end - (D.order_lead_h[0] + R.u() * (D.order_lead_h[1] - D.order_lead_h[0])) : null;
    if (order !== null && R.u() < D.order_slip) end += 24;
    p.stay = { drg: r.code, title: r.title, weight: r.weight, gmlos: r.gmlos, elective: elective, admit: admit, end: end, order: order, unit: unit.id };
  }
  function dischargeFeatures(p, h, hour0) {
    var st = p.stay, days = Math.max(0, (h - st.admit) / 24), last = p.history.length ? p.history[p.history.length - 1] : null;
    var dowTomorrow = Math.floor((h + hour0 + 24) / 24) % 7;
    return [1, Math.min(days / st.gmlos, 3), Math.log1p(days), (p.age - 64) / 10, st.elective ? 1 : 0,
      st.order !== null && h >= st.order ? 1 : 0, dowTomorrow >= 5 ? 1 : 0, last ? Math.min(last.news2, 8) : 1, last && last.o2 ? 1 : 0, Math.log(st.gmlos)];
  }
  function dischargeProb(S, x) {
    var c = S.reference.discharge.coef, z = 0;
    for (var i = 0; i < c.length; i++) z += c[i] * x[i];
    return 1 / (1 + Math.exp(-z));
  }
  function aucOf(y, s) { // rank AUC with average ties
    var idx = s.map(function (v, i) { return i; }).sort(function (a, b) { return s[a] - s[b]; });
    var ranks = new Array(s.length), i = 0;
    while (i < idx.length) { var j = i; while (j + 1 < idx.length && s[idx[j + 1]] === s[idx[i]]) j++; for (var k = i; k <= j; k++) ranks[idx[k]] = (i + j) / 2 + 1; i = j + 1; }
    var n1 = 0, r1 = 0; y.forEach(function (v, k) { if (v) { n1++; r1 += ranks[k]; } });
    var n0 = y.length - n1;
    return n1 && n0 ? (r1 - n1 * (n1 + 1) / 2) / (n1 * n0) : NaN;
  }

  // ---- operational levers: modified plans and environments --------------------------------------------------
  function modPlan(P, mods) {
    if (!mods || !mods.length) return P;
    var Q = Object.assign({}, P);
    Q.beds = P.beds.slice(); Q.overflow = P.overflow.map(function (a) { return a.slice(); });
    mods.forEach(function (m) {
      if (m.type === 'beds') Q.beds[P.ix[m.unit]] += m.n;
      if (m.type === 'overflow') m.units.forEach(function (u) {
        var i = P.ix[u]; m.to.forEach(function (t) { var j = P.ix[t]; if (Q.overflow[i].indexOf(j) < 0) Q.overflow[i].push(j); });
      });
    });
    return Q;
  }
  /* multiply arrivals / stays for the hours each mod is active; t0 = env start in live hours */
  function modEnv(P, env, mods, t0) {
    (mods || []).forEach(function (m) {
      if (m.type !== 'los' && m.type !== 'arr') return;
      for (var t = 0; t < env.arr.length; t++) {
        var a = t0 + t; if (a < m.start || a >= m.end) continue;
        m.units.forEach(function (u) { var i = P.ix[u]; if (m.type === 'los') env.los[t][i] *= m.mult; else env.arr[t][i] *= m.mult; });
      }
    });
    return env;
  }

  // ---- Monte Carlo forecast from a saved state (runs in a Web Worker when available) -------------------------
  function quant(sorted, q) { if (!sorted.length) return NaN; var p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); }
  function forecastCore(P, o) {
    var S = P.S, U = P.U, hours = o.hours, paths = o.paths, at = new Date(o.at);
    var bedUnit = S.units.map(function (u) { return ['ed', 'or', 'pacu'].indexOf(u.kind) < 0; });
    var facs = S.facilities.map(function (f) { return f.id; });
    var scopes = { system: [], main: [] }; facs.forEach(function (f) { scopes[f] = []; });
    var unitHours = S.units.map(function () { var a = []; for (var t = 0; t < hours; t++) a.push([]); return a; });
    var unitPeak = S.units.map(function () { return []; }), unitFull = new Float64Array(U), unitMean = new Float64Array(U);
    var ED = P.ix.ED, EDT = P.ix.EDT, edBoardPeak = [], divHours = [], lostN = [], money = [];
    var A = unitFinance(P, o.finOpt || {});
    for (var k = 0; k < paths; k++) {
      var st = new State(P, o.C, true, (o.seed || S.seed) + 1000 + k * 17);
      for (var u = 0; u < U; u++) { for (var v = 0; v < U; v++) st.B[u][v] = o.B[u][v]; st.Q[u] = o.Q[u]; }
      var r = run(P, at, hours, { stochastic: true, env: o.env, state: st });
      var tot = { system: [], main: [] }; facs.forEach(function (f) { tot[f] = []; });
      var peak = new Float64Array(U), edb = 0, dh = 0, lost = 0, acc = newAcc(U);
      for (var t = 0; t < hours; t++) {
        var C = r.census[t], s = 0, m = 0, fs = {};
        facs.forEach(function (f) { fs[f] = 0; });
        for (u = 0; u < U; u++) {
          var un = S.units[u];
          if (bedUnit[u]) { s += C[u]; fs[un.facility] += C[u]; if (un.facility === 'CBMC') m += C[u]; }
          if (C[u] > peak[u]) peak[u] = C[u];
          unitMean[u] += C[u] / hours / paths;
          unitHours[u][t].push(C[u] + (u === ED ? C[EDT] : 0));
          lost += r.lost[t][u];
        }
        tot.system.push(s); tot.main.push(m); facs.forEach(function (f) { tot[f].push(fs[f]); });
        edb = Math.max(edb, r.boarding[t][ED]);
        if ((C[ED] + C[EDT]) / P.beds[ED] >= S.ed_divert_at) dh++;
        hourMoney(P, A, C, r.cases[t], o.env.callout[t], o.finOpt, acc);
      }
      Object.keys(scopes).forEach(function (key) { scopes[key].push(tot[key]); });
      for (u = 0; u < U; u++) { unitPeak[u].push(peak[u]); if (P.capped[u] && P.beds[u] && peak[u] >= P.beds[u]) unitFull[u] += 1 / paths; }
      edBoardPeak.push(edb); divHours.push(dh); lostN.push(lost); money.push(pl(P, acc));
      if (o.onPath) o.onPath(k + 1);
    }
    var srt = function (a) { return a.slice().sort(function (x, y) { return x - y; }); };
    var q = {};
    Object.keys(scopes).forEach(function (key) {
      var arr = scopes[key], p10 = [], p50 = [], p90 = [];
      for (var t = 0; t < hours; t++) { var col = srt(arr.map(function (a) { return a[t]; })); p10.push(quant(col, .1)); p50.push(quant(col, .5)); p90.push(quant(col, .9)); }
      var peaks = srt(arr.map(function (a) { return Math.max.apply(null, a); }));
      q[key] = { p10: p10, p50: p50, p90: p90, peakP50: quant(peaks, .5), peakP90: quant(peaks, .9), peaks: peaks };
    });
    var unitQ = unitHours.map(function (hs) { var p50 = [], p75 = []; hs.forEach(function (col) { col.sort(function (a, b) { return a - b; }); p50.push(quant(col, .5)); p75.push(quant(col, .75)); }); return { p50: p50, p75: p75 }; });
    var mean = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    return { hours: hours, paths: paths, at: at.getTime(), q: q, unitQ: unitQ, unitPeak: unitPeak.map(function (a) { return quant(srt(a), .5); }),
      unitFull: Array.from(unitFull), unitMean: Array.from(unitMean), edBoardPeak: quant(srt(edBoardPeak), .5), divHours: quant(srt(divHours), .5),
      divMean: mean(divHours), lost: mean(lostN), operating: mean(money.map(function (m) { return m.operating; })),
      revenue: mean(money.map(function (m) { return m.revenue; })), agency: mean(money.map(function (m) { return m.agency + m.ot; })) };
  }
  root.CBSim = {
    rng: rng, plan: plan, environment: environment, dailyDrivers: dailyDrivers, applyScenario: applyScenario,
    respIndex: respIndex, tempClim: tempClim, State: State, run: run, warmStart: warmStart,
    unitFinance: unitFinance, hourMoney: hourMoney, newAcc: newAcc, pl: pl, unitRows: unitRows, financeOf: financeOf,
    news2: news2, qsofa: qsofa, Patient: Patient, addHours: addHours, hourOfWeek: hourOfWeek, doy: doy,
    dayStart: dayStart, weekday: weekday,
    planStay: planStay, dischargeFeatures: dischargeFeatures, dischargeProb: dischargeProb, aucOf: aucOf,
    modPlan: modPlan, modEnv: modEnv, forecastCore: forecastCore, quant: quant
  };
})(typeof window !== 'undefined' ? window : globalThis);
