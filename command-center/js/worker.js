/* worker.js — runs Monte Carlo forecasts off the main thread so the live clock never stutters */
self.window = self;
importScripts("../data/system.js", "sim.js");
const P0 = CBSim.plan(self.CB_SYSTEM);
self.onmessage = (e) => {
  const o = e.data, P = CBSim.modPlan(P0, o.mods);
  const res = CBSim.forecastCore(P, { ...o, onPath: (k) => { if (k % 10 === 0) self.postMessage({ id: o.id, progress: k / o.paths }); } });
  self.postMessage({ id: o.id, result: res });
};
