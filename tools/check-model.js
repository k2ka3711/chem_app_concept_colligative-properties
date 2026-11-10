// モデルが教科書どおりの傾向を示すか確かめる：node tools/check-model.js
const M = require("../src/model.js");
const run = (key, s, sec) => { for (let t = 0; t < sec; t += 0.02) M.step(key, s, 0.02); return s; };
const bal = (key, s) => { const r = M.rates(key, s); return r.out - r.in; };
const checks = [];

// 純水ではどの場面もつり合っている。溶質を入れた直後は、どの場面も「出る」だけが同じ割合で減る
for (const key of ["vapor", "boil", "freeze", "osmo"]) {
  const s = M.initState(key);
  checks.push([`${key}: pure water is balanced`, bal(key, s), (v) => Math.abs(v) < 1e-12]);
  s.mp = 1; if (key === "boil") s.heat = false;
  const r = M.rates(key, s);
  checks.push([`${key}: solute lowers only "out" (0.82), "in" stays 1`, r.out, (v) => Math.abs(v - 0.82) < 1e-12 && Math.abs(r.in - 1) < 1e-12]);
}
// 蒸気圧降下：水蒸気が減って、新しいつり合い（水蒸気の数 ∝ 水分子の割合）
let s = M.initState("vapor"); s.mp = 1; run("vapor", s, 60);
checks.push(["vapor: settles at n/N0 = x", s.n / M.C.N0, (v) => Math.abs(v - 0.82) < 1e-6]);
// 沸点上昇：加熱すると 100.52 °C で沸騰して止まる
s = M.initState("boil"); s.mp = 1; s.heat = false; run("boil", s, 5);
checks.push(["boil: not boiling at 100 °C with solute", s.boiling ? 1 : 0, (v) => v === 0]);
s.heat = true; run("boil", s, 60);
checks.push(["boil: 1.0 mol/kg stays at 100.52 °C", s.T, (v) => Math.abs(v - 100.52) < 1e-9]);
checks.push(["boil: 1.0 mol/kg is boiling at 100.52 °C", s.boiling ? 1 : 0, (v) => v === 1]);
// 凝固点降下：0 °C では氷がとけ、−1.85 °C でつり合う
s = M.initState("freeze"); s.mp = 1; run("freeze", s, 3);
checks.push(["freeze: ice melts at 0 °C with solute", s.ice, (v) => v < 50]);
for (const mp of [0.5, 1, 2]) { const q = { mp, T: M.fp(mp), ice: 50 }; checks.push([`freeze: balanced at ${M.fp(mp).toFixed(3)} °C (mp = ${mp})`, bal("freeze", q), (v) => Math.abs(v) < 1e-12]); }
s = M.initState("freeze"); s.mp = 1; s.cool = true; run("freeze", s, 30);
checks.push(["freeze: cooling stops at −1.85 °C", s.T, (v) => Math.abs(v + 1.85) < 1e-9]);
s = M.initState("osmo"); s.mp = 1; s.push = true; run("osmo", s, 60);
checks.push(["osmo: auto push levels the surfaces", s.dh, (v) => Math.abs(v) < 1e-6]);
checks.push(["osmo: auto push stops at Π", s.P, (v) => Math.abs(v - 1) < 1e-9]);
// 浸透圧：液面差ができて止まる。浸透圧と同じ圧力で押すと液面がそろう。押しすぎると逆向き（逆浸透）
s = M.initState("osmo"); s.mp = 1; run("osmo", s, 60);
checks.push(["osmo: level difference settles at 1", s.dh, (v) => Math.abs(v - 1) < 1e-6]);
s.P = 1; run("osmo", s, 60);
checks.push(["osmo: pushing with Π levels the surfaces", s.dh, (v) => Math.abs(v) < 1e-6]);
s.P = 1.3; run("osmo", s, 60);
checks.push(["osmo: pushing harder reverses the flow", s.dh, (v) => v < -0.29]);
// 実際の値
checks.push(["Π(1.0 mol/L, 300 K) = 24.9 × 10^5 Pa", M.osmoticPa(1) / 1e5, (v) => Math.abs(v - 24.93) < 0.01]);
checks.push(["vapor pressure at 25 °C, 1.0 mol/kg ≈ 3.11 kPa", M.vaporKPa(1), (v) => Math.abs(v - 3.114) < 0.002]);
checks.push(["NaCl 1.0 mol/kg (mp = 2): fp = −3.70 °C", M.fp(2), (v) => Math.abs(v + 3.7) < 1e-9]);

let ok = true;
for (const [name, v, pass] of checks) { const p = pass(v); ok &&= p; console.log(`${p ? "ok " : "NG "} ${name}  (${Number(v).toFixed(4)})`); }
process.exit(ok ? 0 : 1);
