// 希薄溶液の性質：計算とモデル（画面と tools/check-model.js の両方で使う）
//
// 4つの現象を「水溶液と相手（水蒸気・泡・氷・純水）の境目での、水分子の出入り」で表す。
//   出る：水溶液 → 相手　　入る：相手 → 水溶液　　（純水のつり合いを 1 とする）
// 溶質は境目をこえられないので、溶質が入ると「出る」だけが x 倍になる。
//   x = 1 − ALPHA·(溶質粒子の質量モル濃度)　… 画面では見やすくするため、実際より大きく下げる
// つり合い（出る ＝ 入る）を取りもどす条件の変化が、4つの現象になる。

const C = {
  Kb: 0.52,        // 水のモル沸点上昇 K·kg/mol
  Kf: 1.85,        // 水のモル凝固点降下 K·kg/mol
  R: 8.31e3,       // 気体定数 Pa·L/(K·mol)
  T_OSM: 300,      // 浸透圧の温度 K（27 °C）
  P25: 3.17,       // 25 °C の純水の蒸気圧 kPa
  M_WATER: 55.5,   // 水 1 kg の物質量 mol
  ALPHA: 0.18,     // 画面のモデル：粒子の濃さ 1 mol/kg で「出る」が 0.82 倍
  N0: 50,          // 画面のモデル：純水のつり合いでの水蒸気の分子の数
  TAU_V: 4,        // 水蒸気の数が落ちつく時間のめやす s
  TAU_O: 2.5,      // 液面の差が落ちつく時間のめやす s
  HEAT: 0.1,       // 加熱で温度が上がる速さ °C/s
};

const xWater = (mp) => 1 - C.ALPHA * mp;

/** 実際の値（mp：溶質粒子の質量モル濃度。うすい水溶液なので mol/L も同じ値とみなす） */
const bp = (mp) => 100 + C.Kb * mp;
const fp = (mp) => -C.Kf * mp;
const osmoticPa = (c, T = C.T_OSM) => c * C.R * T;
const vaporKPa = (mp) => C.P25 * C.M_WATER / (C.M_WATER + mp);   // ラウールの法則

/** はじめの状態（純水でつり合っている） */
function initState(key) {
  return {
    vapor: { mp: 0, n: C.N0 },
    boil: { mp: 0, T: 100, heat: true, boiling: true },
    freeze: { mp: 0, T: 0, ice: 50 },
    osmo: { mp: 0, dh: 0, P: 0 },      // dh, P：濃さ 1 mol/L のつり合いの液面差・浸透圧を 1 とする
  }[key];
}

/** 境目での水分子の出入りの速さ */
function rates(key, s) {
  const x = xWater(s.mp);
  if (key === "vapor") return { out: x, in: s.n / C.N0 };                          // 蒸発・凝縮
  if (key === "boil") return { out: x + (C.ALPHA / C.Kb) * (s.T - 100), in: 1 };   // 泡の中へ蒸発・泡から凝縮（大気圧）
  if (key === "freeze") return { out: x, in: 1 + (C.ALPHA / C.Kf) * s.T };         // 凝固・融解
  return { out: x + C.ALPHA * (s.dh + s.P), in: 1 };                               // 水溶液→純水・純水→水溶液
}

/** dt 秒すすめる */
function step(key, s, dt) {
  const r = rates(key, s);
  if (key === "vapor") s.n += (C.N0 / C.TAU_V) * (r.out - r.in) * dt;
  else if (key === "boil") {
    // 加熱すると、沸騰するまで温度が上がる。沸騰中は温度が一定
    if (s.heat && r.out < 1 - 1e-6) s.T = Math.min(bp(s.mp), s.T + C.HEAT * dt);
    s.boiling = s.heat && rates(key, s).out >= 1 - 1e-6;
  } else if (key === "freeze") s.ice = Math.max(10, Math.min(90, s.ice + 12 * (r.out - r.in) * dt));
  else s.dh = Math.max(-1.5, Math.min(2.5, s.dh + ((r.in - r.out) / C.ALPHA / C.TAU_O) * dt));
  return s;
}

const Model = { C, xWater, bp, fp, osmoticPa, vaporKPa, initState, rates, step };
if (typeof module !== "undefined") module.exports = Model;
