// 希薄溶液の性質：計算とモデル（画面と tools/check-model.js の両方で使う）
//
// 画面の分子モデルでは、見やすくするため溶質の粒子を実際より多くかく。
// 「液体の粒子のうち水分子の割合」を x = 1 − ALPHA·m とし、4つの現象のモデルを
// すべてこの x で動かす（どの現象も、溶質が「水分子の割合を下げる」ことが原因、という共通の見方）。

const C = {
  Kb: 0.52,        // 水のモル沸点上昇 K·kg/mol
  Kf: 1.85,        // 水のモル凝固点降下 K·kg/mol
  R: 8.31e3,       // 気体定数 Pa·L/(K·mol)
  T_OSM: 300,      // 浸透圧の実験の温度 K（27 °C）
  P_ATM: 101.3,    // 大気圧 kPa
  ALPHA: 0.18,     // 画面のモデル：濃さ 1 mol/kg で水分子の割合が 0.82 になる
  CONC: [0.5, 1.0, 2.0],
};

/** 画面のモデルでの、液体の粒子のうち水分子の割合 */
function xWater(m) { return 1 - C.ALPHA * m; }

/** 実際の値 */
const bp = (m) => 100 + C.Kb * m;
const fp = (m) => -C.Kf * m;
const osmoticPa = (c, T = C.T_OSM) => c * C.R * T;

/** 純水の蒸気圧 kPa（アントワン式。1〜100 °C の定数を 100 °C 付近まで使う） */
function pSat(T) { return Math.pow(10, 8.07131 - 1730.63 / (233.426 + T)) * 0.133322; }
/** 水溶液の蒸気圧 kPa：蒸気圧曲線が右へ ΔT だけずれる（沸点が Kb·m だけ上がる） */
function pSol(T, m) { return pSat(T - C.Kb * m); }

/* ---------- 乱数（テストで再現できるように種を固定できる） ---------- */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* ---------- STEP 1：密閉容器の中の蒸発と凝縮 ---------- *
 * 液面の近く（帯）にある水分子だけが蒸発できる。溶質の粒子は蒸発しない。
 * 気体の分子は直進し、液面に当たると一定の割合で凝縮する。
 * 蒸発・凝縮は「確率の貯金」（足して 1 をこえたら 1 回起こす）で決めるので、ゆらぎが小さい。 */
function createVapor({ W = 300, H = 300, nLiquid = 170, nGas = 40, seed = 1 } = {}) {
  const r = rng(seed);
  const S = H * 0.5;               // 液面の高さ
  const BAND = 26;                 // 蒸発できる帯の厚さ
  const PE = 0.0040, PC = 0.5;     // 帯の水分子1個・1コマあたりの蒸発確率、液面に当たった気体の凝縮確率
  const SITES = 20;                // 液面の帯の粒子の数（めやす）
  const VG = 2.4;                  // 気体の分子の速さ
  const ps = [];
  const liq = (type) => ({ type, x: 8 + r() * (W - 16), y: S + 6 + r() * (H - S - 12), vx: 0, vy: 0 });
  const gas = () => { const a = r() * Math.PI * 2; return { type: "gas", x: 8 + r() * (W - 16), y: 8 + r() * (S - 16), vx: VG * Math.cos(a), vy: VG * Math.sin(a) }; };
  for (let i = 0; i < nLiquid; i++) ps.push(liq("w"));
  for (let i = 0; i < nGas; i++) ps.push(gas());
  let eCredit = 0, cCredit = 0;
  const events = [];               // 画面の演出用（蒸発・凝縮した位置）
  const sim = {
    W, H, S, BAND, ps, events,
    evapCount: 0, condCount: 0,
    /** 液体の水分子のうち n 個を溶質に置きかえる（溶質を n 個にする） */
    setSolute(n) {
      const liquid = ps.filter((p) => p.type !== "gas");
      let cur = liquid.filter((p) => p.type === "s").length;
      const pool = liquid.filter((p) => p.type === (cur < n ? "w" : "s"));
      while (cur !== n && pool.length) {
        const p = pool.splice(Math.floor(r() * pool.length), 1)[0];
        p.type = cur < n ? "s" : "w"; cur += cur < n ? 1 : -1;
      }
    },
    counts() {
      let g = 0, w = 0, s = 0;
      for (const p of ps) { if (p.type === "gas") g++; else if (p.type === "w") w++; else s++; }
      return { gas: g, water: w, solute: s, x: w / (w + s) };
    },
    step() {
      events.length = 0;
      for (const p of ps) {
        if (p.type === "gas") {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 4) { p.x = 4; p.vx = Math.abs(p.vx); }
          if (p.x > W - 4) { p.x = W - 4; p.vx = -Math.abs(p.vx); }
          if (p.y < 4) { p.y = 4; p.vy = Math.abs(p.vy); }
          if (p.y >= S - 3) {
            cCredit += PC;
            if (cCredit >= 1) {
              cCredit -= 1; p.type = "w"; p.y = S + 4; p.vx *= 0.3; p.vy = 1.5;
              sim.condCount++; events.push({ kind: "cond", x: p.x });
            } else { p.y = S - 3; p.vy = -Math.abs(p.vy); }
          }
        } else {
          const k = p.type === "s" ? 0.75 : 1;         // 溶質はゆっくり動く
          p.vx = p.vx * 0.9 + (r() - 0.5) * 0.9 * k;
          p.vy = p.vy * 0.9 + (r() - 0.5) * 0.9 * k;
          p.x += p.vx; p.y += p.vy;
          if (p.x < 5) { p.x = 5; p.vx = Math.abs(p.vx); }
          if (p.x > W - 5) { p.x = W - 5; p.vx = -Math.abs(p.vx); }
          if (p.y < S + 4) { p.y = S + 4; p.vy = Math.abs(p.vy); }
          if (p.y > H - 5) { p.y = H - 5; p.vy = -Math.abs(p.vy); }
        }
      }
      // 液面にある水分子の数 ＝ 液面の席の数（一定）× 水分子の割合。
      // 席の数は一定とし、位置のかたよりによるゆらぎを除く
      let w = 0, sol = 0;
      for (const p of ps) { if (p.type === "w") w++; else if (p.type === "s") sol++; }
      eCredit += SITES * PE * (w / (w + sol));
      while (eCredit >= 1) {
        eCredit -= 1;
        // 帯の中の水分子を1つ選んで蒸発させる
        const cand = ps.filter((p) => p.type === "w" && p.y < S + BAND);
        if (!cand.length) break;
        const best = cand[Math.floor(r() * cand.length)];
        const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
        best.type = "gas"; best.y = S - 4; best.vx = VG * Math.cos(a); best.vy = VG * Math.sin(a);
        sim.evapCount++; events.push({ kind: "evap", x: best.x });
      }
    },
  };
  return sim;
}

/* ---------- STEP 3：氷と液体の境目（凝固と融解の速さ） ---------- *
 * 凝固の速さ：境目に来る水分子の数に比例 → x（溶質があると小さくなる）。温度によらないとする。
 * 融解の速さ：温度が下がると小さくなる。1 + (ALPHA/Kf)·T（0 °C で 1）。
 * → 純水は 0 °C、水溶液は −Kf·m で、ちょうど等しくなる。 */
function freezeRates(T, m) {
  return { freeze: xWater(m), melt: 1 + (C.ALPHA / C.Kf) * T };
}
/** 氷の量（0〜100 %）を dt 秒すすめる */
function iceStep(ice, T, m, dt) {
  const { freeze, melt } = freezeRates(T, m);
  return Math.max(0, Math.min(100, ice + 14 * (freeze - melt) * dt));
}

/* ---------- STEP 2：加熱（沸とう） ---------- *
 * 一定の速さで温めると温度が上がり、蒸気圧が大気圧に届いたら沸とう（温度は一定）。 */
const HEAT_RATE = 0.12;            // °C/s
const T_START = 99.0;
function heatStep(T, m, dt) {
  const b = m > 0 ? bp(m) : 100;
  return T >= b ? b : Math.min(b, T + HEAT_RATE * dt);
}

/* ---------- STEP 4：浸透（U字管） ---------- *
 * 純水→水溶液：1（純水側は水分子だけ）
 * 水溶液→純水：x ＋（液面差 Δh ＋ 押す圧力 P による押し返し）
 * Δh と P は「濃さ 1 mol/L のときのつり合いの液面差」を 1 とした単位。 */
function osmosisRates(dh, P, c) {
  return { fwd: 1, rev: xWater(c) + C.ALPHA * (dh + P) };
}
function osmosisStep(dh, P, c, dt) {
  const { fwd, rev } = osmosisRates(dh, P, c);
  return dh + 0.9 * (fwd - rev) * dt;  // 時定数 約 6 秒
}
/** 押す圧力（Pa）をモデルの単位に（濃さ 1 mol/L の浸透圧 → 1） */
const pressureToModel = (pa) => pa / osmoticPa(1);

const Model = { C, xWater, bp, fp, osmoticPa, pSat, pSol, rng, createVapor, freezeRates, iceStep, HEAT_RATE, T_START, heatStep, osmosisRates, osmosisStep, pressureToModel };
if (typeof module !== "undefined") module.exports = Model;
