// 程序化姿势：一个姿势就是一组关节角（弧度）。所有动作都是关键帧表 + 混合。
// 约定（人物本地坐标：脸朝 +z，左手在 +x）：
//   手臂 E = 从下垂抬起的角度（0 下垂，π/2 水平，π 举过头），A = 抬起的方位（0 正前方，+π/2 左侧，-π/2 右侧，±π 身后）
//   B = 肘弯（往前折），T = 肘部绕大臂的扭转；rk = 球拍相对小臂往前翻
//   腿 F = 大腿往前抬，K = 膝盖往后弯，S = 往外分开
export const KEYS = [
  'lift',
  'lean',
  'twist',
  'roll',
  'hP',
  'hY',
  'laE',
  'laA',
  'laB',
  'laT',
  'raE',
  'raA',
  'raB',
  'raT',
  'rk',
  'llF',
  'llK',
  'llS',
  'rlF',
  'rlK',
  'rlS',
] as const;
export type Key = (typeof KEYS)[number];
export type Pose = Record<Key, number>;

const LEG_KEYS: Key[] = ['lift', 'llF', 'llK', 'llS', 'rlF', 'rlK', 'rlS'];
export const isLegKey = (k: Key) => LEG_KEYS.includes(k);

export const NEUTRAL: Pose = {
  lift: 0,
  lean: 0.04,
  twist: 0,
  roll: 0,
  hP: 0,
  hY: 0,
  laE: 0.14,
  laA: 1.1,
  laB: 0.25,
  laT: 0,
  raE: 0.14,
  raA: -1.1,
  raB: 0.3,
  raT: 0,
  rk: -0.5,
  llF: 0,
  llK: 0.04,
  llS: 0.06,
  rlF: 0,
  rlK: 0.04,
  rlS: 0.06,
};

export const P = (base: Pose, o: Partial<Pose>): Pose => ({ ...base, ...o });

export function blend(a: Pose, b: Pose, w: number, out: Pose = { ...a }, legs = true): Pose {
  for (const k of KEYS) {
    if (!legs && isLegKey(k)) out[k] = a[k];
    else out[k] = a[k] + (b[k] - a[k]) * w;
  }
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 关键帧表：[[时刻 0..1, 姿势], ...]，相邻两帧之间平滑插值 */
export function track(keys: [number, Pose][], t: number, out: Pose): Pose {
  if (t <= keys[0][0]) return Object.assign(out, keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1];
      const [t1, b] = keys[i];
      return blend(a, b, smooth((t - t0) / Math.max(1e-6, t1 - t0)), out);
    }
  }
  return Object.assign(out, keys[keys.length - 1][1]);
}

// ———— 站姿 ————

export const READY: Pose = P(NEUTRAL, {
  lean: 0.32,
  hP: -0.22,
  llF: 0.42,
  llK: 0.8,
  llS: 0.24,
  rlF: 0.42,
  rlK: 0.8,
  rlS: 0.24,
  raE: 0.7,
  raA: -0.35,
  raB: 1.05,
  raT: 0.2,
  rk: -0.35,
  laE: 0.75,
  laA: 0.45,
  laB: 1.2,
  laT: -0.3,
});

export function ready(t: number, out: Pose): Pose {
  Object.assign(out, READY);
  const b = Math.sin(t * 7) * 0.07;
  out.llK += b;
  out.rlK += b;
  out.llF += b * 0.5;
  out.rlF += b * 0.5;
  return out;
}

export function idle(t: number, out: Pose, seed = 0): Pose {
  Object.assign(out, NEUTRAL);
  const br = Math.sin(t * 1.6 + seed);
  out.lean += br * 0.015;
  out.laE += br * 0.02;
  out.raE += br * 0.02;
  out.hY = Math.sin(t * 0.37 + seed * 3) * 0.35;
  // 重心偶尔换脚
  const sh = Math.sin(t * 0.21 + seed * 5) > 0 ? 1 : -1;
  out.roll = sh * 0.035;
  if (sh > 0) {
    out.llK = 0.22;
    out.llF = 0.1;
  } else {
    out.rlK = 0.22;
    out.rlF = 0.1;
  }
  return out;
}

/** 走路 / 跑：phase 每走一步加 π；a = 0..1 走，run = 0..1 跑的成分 */
export function walk(phase: number, a: number, run: number, out: Pose, broom = false): Pose {
  Object.assign(out, NEUTRAL);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const amp = a * (0.5 + 0.25 * run);
  out.llF = amp * s + run * 0.15;
  out.rlF = -amp * s + run * 0.15;
  out.llK = a * (0.12 + (0.7 + 0.7 * run) * Math.max(0, c));
  out.rlK = a * (0.12 + (0.7 + 0.7 * run) * Math.max(0, -c));
  out.llS = out.rlS = 0.05;
  out.lean = 0.06 * a + 0.22 * run;
  out.twist = 0.12 * a * s;
  out.lift = run * 0.06 * Math.abs(c);
  const arm = (0.45 + 0.35 * run) * a;
  out.laE = -s * arm;
  out.laA = 0.12;
  out.laB = 0.3 + 0.3 * a + 1.0 * run;
  out.raE = s * arm;
  out.raA = -0.12;
  out.raB = 0.3 + 0.3 * a + 1.0 * run;
  if (broom) {
    // 右手提着扫帚：手臂基本不摆
    out.raE = 0.45;
    out.raA = -0.35;
    out.raB = 0.8;
  }
  return out;
}

// ———— 击球（右手） ————

const FH_PREP = P(READY, {
  twist: -1.05,
  lean: 0.28,
  raE: 1.25,
  raA: -2.35,
  raB: 0.7,
  raT: 0.4,
  rk: -0.7,
  laE: 1.35,
  laA: -0.1,
  laB: 0.3,
});
const FH_HIT = P(READY, {
  twist: 0.15,
  lean: 0.3,
  raE: 1.3,
  raA: -0.85,
  raB: 0.25,
  raT: 0.2,
  rk: -0.5,
  laE: 0.9,
  laA: 1.4,
  laB: 0.4,
});
const FH_FOLLOW = P(READY, {
  twist: 0.95,
  lean: 0.25,
  raE: 2.35,
  raA: 0.75,
  raB: 1.7,
  raT: 0.3,
  rk: -0.6,
  laE: 0.6,
  laA: 1.2,
  laB: 1.4,
});
const FOREHAND: [number, Pose][] = [
  [0, READY],
  [0.28, FH_PREP],
  [0.4, FH_PREP],
  [0.5, FH_HIT],
  [0.72, FH_FOLLOW],
  [0.86, FH_FOLLOW],
  [1, READY],
];

const BH_PREP = P(READY, {
  twist: 1.15,
  lean: 0.3,
  raE: 1.05,
  raA: 1.55,
  raB: 0.8,
  rk: -0.9,
  laE: 1.1,
  laA: 1.85,
  laB: 1.0,
});
const BH_HIT = P(READY, {
  twist: 0.2,
  lean: 0.3,
  raE: 1.2,
  raA: 0.55,
  raB: 0.4,
  rk: -0.5,
  laE: 1.25,
  laA: 0.85,
  laB: 1.0,
});
const BH_FOLLOW = P(READY, {
  twist: -0.9,
  lean: 0.22,
  raE: 2.4,
  raA: -0.7,
  raB: 1.5,
  rk: -0.6,
  laE: 2.3,
  laA: -0.4,
  laB: 1.5,
});
const BACKHAND: [number, Pose][] = [
  [0, READY],
  [0.28, BH_PREP],
  [0.4, BH_PREP],
  [0.5, BH_HIT],
  [0.72, BH_FOLLOW],
  [0.86, BH_FOLLOW],
  [1, READY],
];

const SV_SET = P(NEUTRAL, {
  twist: -0.6,
  llS: 0.18,
  rlS: 0.18,
  llK: 0.15,
  rlK: 0.15,
  laE: 0.95,
  laA: 0.25,
  laB: 0.6,
  raE: 0.55,
  raA: -1.5,
  raB: 0.4,
  rk: -0.6,
});
const SV_TOSS = P(SV_SET, {
  twist: -0.85,
  lean: -0.15,
  hP: -0.6,
  laE: 2.95,
  laA: 0.4,
  laB: 0.05,
  raE: 1.25,
  raA: -2.5,
  raB: 0.8,
  llF: 0.3,
  llK: 0.6,
  rlF: 0.3,
  rlK: 0.6,
});
const SV_TROPHY = P(SV_TOSS, {
  raE: 2.1,
  raA: -1.9,
  raB: 2.2,
  raT: 0.6,
  rk: -0.3,
  laE: 2.7,
  llF: 0.38,
  llK: 0.75,
  rlF: 0.38,
  rlK: 0.75,
  hP: -0.7,
});
const SV_HIT = P(SV_SET, {
  twist: 0.25,
  lean: 0.12,
  hP: -0.6,
  lift: 0.14,
  raE: 3.0,
  raA: -0.35,
  raB: 0.05,
  raT: 0,
  rk: -0.15,
  laE: 1.3,
  laA: 0.7,
  laB: 1.3,
  llF: 0,
  llK: 0,
  rlF: 0,
  rlK: 0,
});
const SV_FOLLOW = P(SV_SET, {
  twist: 0.75,
  lean: 0.55,
  hP: 0.1,
  raE: 0.9,
  raA: 0.95,
  raB: 0.6,
  rk: -0.4,
  laE: 0.6,
  laA: 0.9,
  laB: 1.2,
  llF: 0.5,
  llK: 0.4,
  rlF: -0.2,
  rlK: 0.3,
});
export const SERVE_CONTACT = 0.6;
export const SERVE_TOSS = 0.22;
const SERVE: [number, Pose][] = [
  [0, SV_SET],
  [SERVE_TOSS, SV_TOSS],
  [0.46, SV_TROPHY],
  [0.52, SV_TROPHY],
  [SERVE_CONTACT, SV_HIT],
  [0.78, SV_FOLLOW],
  [1, READY],
];

// ———— 情绪 ————

const CHEER = P(NEUTRAL, { hP: -0.35, raE: 2.85, raA: -0.5, raB: 0.35, laE: 2.85, laA: 0.5, laB: 0.35, rk: -0.2 });
const PUMP = P(NEUTRAL, {
  hP: -0.1,
  lean: 0.2,
  llF: 0.3,
  llK: 0.5,
  rlF: 0.3,
  rlK: 0.5,
  raE: 1.0,
  raA: -0.5,
  raB: 2.3,
  raT: 0.3,
  laE: 0.3,
});
const SLUMP = P(NEUTRAL, { hP: 0.65, lean: 0.25, raE: 0.05, laE: 0.05, raB: 0.1, laB: 0.1, rk: -0.1 });
const BEND = P(NEUTRAL, {
  lean: 1.0,
  hP: 0.3,
  llF: 0.75,
  llK: 1.2,
  rlF: 0.75,
  rlK: 1.2,
  raE: 1.0,
  raA: -0.3,
  raB: 0.2,
  laE: 1.0,
  laA: 0.3,
  laB: 0.2,
});
const WAVE_UP = P(NEUTRAL, { raE: 2.7, raA: -0.9, raB: 0.6 });
const WAVE_DN = P(NEUTRAL, { raE: 2.5, raA: -1.3, raB: 0.9 });

export type ActKind = 'forehand' | 'backhand' | 'serve' | 'cheer' | 'pump' | 'slump' | 'bend' | 'wave' | 'bounce';
/** 动作是否连腿一起演（否则腿用底下的走路/站姿） */
export const ACT_LEGS: Record<ActKind, boolean> = {
  forehand: false,
  backhand: false,
  serve: true,
  cheer: false,
  pump: true,
  slump: false,
  bend: true,
  wave: false,
  bounce: false,
};

export function action(kind: ActKind, u: number, t: number, out: Pose): Pose {
  switch (kind) {
    case 'forehand':
      return track(FOREHAND, u, out);
    case 'backhand':
      return track(BACKHAND, u, out);
    case 'serve':
      return track(SERVE, u, out);
    case 'cheer': {
      Object.assign(out, CHEER);
      out.lift = 0.14 * Math.abs(Math.sin(t * 9));
      out.raE += Math.sin(t * 9) * 0.15;
      out.laE += Math.sin(t * 9) * 0.15;
      return out;
    }
    case 'pump': {
      track(
        [
          [0, NEUTRAL],
          [0.25, PUMP],
          [0.75, PUMP],
          [1, NEUTRAL],
        ],
        u,
        out,
      );
      out.raB += Math.sin(t * 14) * 0.25 * (u > 0.2 && u < 0.8 ? 1 : 0);
      return out;
    }
    case 'slump': {
      track(
        [
          [0, NEUTRAL],
          [0.2, SLUMP],
          [0.85, SLUMP],
          [1, NEUTRAL],
        ],
        u,
        out,
      );
      out.hY = Math.sin(t * 6) * 0.3 * (u > 0.2 && u < 0.8 ? 1 : 0);
      return out;
    }
    case 'bend':
      return track(
        [
          [0, NEUTRAL],
          [0.4, BEND],
          [0.6, BEND],
          [1, NEUTRAL],
        ],
        u,
        out,
      );
    case 'wave': {
      track(
        [
          [0, NEUTRAL],
          [0.15, WAVE_UP],
          [0.85, WAVE_UP],
          [1, NEUTRAL],
        ],
        u,
        out,
      );
      if (u > 0.15 && u < 0.85) blend(out, WAVE_DN, 0.5 + 0.5 * Math.sin(t * 12), out);
      return out;
    }
    case 'bounce': {
      // 发球前拍两下球：左手往下拍
      Object.assign(out, SV_SET);
      const b = Math.max(0, Math.sin(u * Math.PI * 4));
      out.laE = 0.9 - 0.45 * b;
      out.laB = 0.6 + 0.4 * b;
      out.lean = 0.15 + 0.1 * b;
      return out;
    }
  }
}

/** 推扫帚：u = 0 收回，1 推到最远 */
export function sweep(u: number, out: Pose): Pose {
  Object.assign(out, NEUTRAL);
  out.lean = 0.3 + 0.12 * u;
  out.hP = 0.25;
  out.raE = 0.75 + 0.3 * u;
  out.raA = -0.2;
  out.raB = 1.25 - 0.75 * u;
  out.raT = 0.3;
  out.laE = 0.95 + 0.35 * u;
  out.laA = 0.15;
  out.laB = 1.25 - 0.8 * u;
  out.laT = -0.4;
  out.llF = 0.15 + 0.3 * u;
  out.llK = 0.35;
  out.llS = 0.12;
  out.rlF = -0.25 * u;
  out.rlK = 0.2 + 0.15 * u;
  out.rlS = 0.12;
  return out;
}

/** 拄着扫帚歇着 */
export function rest(t: number, out: Pose): Pose {
  idle(t, out, 1.3);
  out.raE = 0.85;
  out.raA = -0.55;
  out.raB = 1.15;
  out.raT = 0.2;
  out.laE = 0.95;
  out.laA = -0.3;
  out.laB = 1.3;
  out.laT = 0.5;
  out.lean = 0.08;
  return out;
}

/** 坐着（凳面约 0.5 米高），手搭在大腿上，偶尔抬头看看 */
export function sit(t: number, out: Pose): Pose {
  Object.assign(out, NEUTRAL);
  out.llF = 1.45;
  out.llK = 1.5;
  out.rlF = 1.4;
  out.rlK = 1.45;
  out.llS = out.rlS = 0.14;
  out.lift = 0.14;
  out.lean = 0.12 + Math.sin(t * 1.4) * 0.015;
  out.raE = 0.75;
  out.raA = -0.35;
  out.raB = 0.75;
  out.laE = 0.75;
  out.laA = 0.35;
  out.laB = 0.75;
  out.hY = Math.sin(t * 0.3) * 0.5;
  out.hP = 0.1;
  return out;
}
