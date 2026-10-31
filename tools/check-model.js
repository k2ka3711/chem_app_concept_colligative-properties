// モデルが教科書どおりの傾向を示すか確かめる：node tools/check-model.js
const M = require("../src/model.js");

// STEP 1：B（水溶液）の水蒸気の数 ÷ A（純水）の数 ≒ 液体の水分子の割合（ラウールの法則）
function vaporRatio(m, seed) {
  const A = M.createVapor({ seed }), B = M.createVapor({ seed });
  for (let i = 0; i < 3600; i++) { A.step(); B.step(); }
  const c = B.counts();
  B.setSolute(Math.round((1 - M.xWater(m)) * (c.water + c.solute)));
  let sa = 0, sb = 0, n = 0;
  for (let i = 0; i < 60 * 150; i++) { A.step(); B.step(); if (i > 60 * 30) { sa += A.counts().gas; sb += B.counts().gas; n++; } }
  return { ratio: sb / sa, x: B.counts().x };
}
const checks = [];
for (const m of [1, 2]) {
  const r = [3, 7].map((s) => vaporRatio(m, s));
  const ratio = r.reduce((a, b) => a + b.ratio, 0) / r.length, x = r[0].x;
  checks.push([`STEP 1 m = ${m}: vapor ratio ≈ water fraction ${x.toFixed(3)}`, ratio, (v) => Math.abs(v - x) < 0.04]);
}
// STEP 2：沸点で蒸気圧 = 大気圧、加熱すると沸点で止まる
checks.push(["STEP 2 pure water: P(100 °C) ≈ 101.3 kPa", M.pSat(100), (v) => Math.abs(v - 101.3) < 0.2]);
checks.push(["STEP 2 1.0 mol/kg: P at bp = P(100) of pure", M.pSol(M.bp(1), 1) - M.pSat(100), (v) => Math.abs(v) < 1e-9]);
checks.push(["STEP 2 solution below pure at same T", M.pSat(100) - M.pSol(100, 1), (v) => v > 1]);
let T = M.T_START; for (let t = 0; t < 60; t += 0.05) T = M.heatStep(T, 2, 0.05);
checks.push(["STEP 2 heating 2.0 mol/kg stops at 101.04 °C", T, (v) => Math.abs(v - 101.04) < 1e-9]);
// STEP 3：凝固 = 融解 となる温度が凝固点（純水 0 °C、水溶液 −Kf·m）
for (const m of [0, 0.5, 1, 2]) {
  const r = M.freezeRates(M.fp(m), m);
  checks.push([`STEP 3 m = ${m}: freeze = melt at ${M.fp(m).toFixed(3)} °C`, r.freeze - r.melt, (v) => Math.abs(v) < 1e-9]);
}
const r0 = M.freezeRates(0, 1);
checks.push(["STEP 3 solution at 0 °C: melt > freeze (ice melts)", r0.melt - r0.freeze, (v) => v > 0.1]);
let ice = 50; for (let t = 0; t < 60; t += 0.05) ice = M.iceStep(ice, M.fp(1), 1, 0.05);
checks.push(["STEP 3 ice amount constant at the freezing point", ice, (v) => Math.abs(v - 50) < 1e-6]);
// STEP 4：液面差は濃さに比例、押す圧力 = 浸透圧 で液面がそろう
const settle = (c, Ppa) => { let dh = 0; for (let t = 0; t < 120; t += 0.05) dh = M.osmosisStep(dh, M.pressureToModel(Ppa), c, 0.05); return dh; };
checks.push(["STEP 4 Δh(2.0) / Δh(1.0) = 2", settle(2, 0) / settle(1, 0), (v) => Math.abs(v - 2) < 1e-3]);
for (const c of [0.5, 1, 2]) checks.push([`STEP 4 c = ${c}: pushing with Π = cRT levels the surfaces`, settle(c, M.osmoticPa(c)), (v) => Math.abs(v) < 1e-3]);
checks.push(["STEP 4 Π(1.0 mol/L, 300 K) = 2.49 × 10^6 Pa", M.osmoticPa(1), (v) => Math.abs(v - 2.493e6) < 1e3]);

let ok = true;
for (const [name, v, pass] of checks) {
  const p = pass(v); ok &&= p;
  console.log(`${p ? "ok " : "NG "} ${name}  (${Number(v).toFixed(4)})`);
}
process.exit(ok ? 0 : 1);
