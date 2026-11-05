/**
 * 拼帧：一个骨架姿势 → 一张材质图（paint.ts 的 MatMap）。
 * 头、上衣、胯部、鞋、贴花、道具是字符画部件（art.ts）；手臂、腿、球拍是按骨架点画的粗线段（材质按长度分段：
 * 袖子 → 皮肤 → 手，短裤 → 腿 → 袜子），这和现有精灵"部件 + 拼帧脚本"的做法一样，只是在运行时拼。
 * 坐标：锚点 (0, 0) = 两脚中间的地面，y 向下为正（向上是负数），单位是像素。
 */
import { DECALS, type Decal, HEADS, HIPS, MARKS, type Part, PROPS, SHOES, TORSOS } from './art';
import { type MatMap, newMap } from './paint';

export type BodyType = 'std' | 'wide' | 'slim' | 'teen' | 'kid';
export type Facing = 'front' | 'back';

/** 体型尺寸（像素） */
export interface Body {
  torso: keyof typeof TORSOS;
  hips: keyof typeof HIPS;
  /** 腰线（上衣底边下面一行），负数 */
  waist: number;
  /** 头的下沿压进上衣几行（脖子） */
  neckIn: number;
  /** 肩关节 */
  shX: number;
  shY: number;
  /** 胯关节 */
  hipX: number;
  hipY: number;
  knee: number;
  ankle: number;
  thigh: number;
  calf: number;
  upper: number;
  fore: number;
  /** 手臂长度系数（姿势表按成人写） */
  arm: number;
  shoe: keyof typeof SHOES;
}

export const BODIES: Record<BodyType, Body> = {
  std: {
    torso: 'std',
    hips: 'std',
    waist: -18,
    neckIn: 2,
    shX: 6,
    shY: -28,
    hipX: 2.5,
    hipY: -15,
    knee: -9,
    ankle: -3,
    thigh: 4,
    calf: 3.2,
    upper: 3,
    fore: 2.6,
    arm: 1,
    shoe: 'sneaker',
  },
  wide: {
    torso: 'wide',
    hips: 'wide',
    waist: -18,
    neckIn: 2,
    shX: 7,
    shY: -28,
    hipX: 3,
    hipY: -15,
    knee: -9,
    ankle: -3,
    thigh: 4.6,
    calf: 3.6,
    upper: 3.4,
    fore: 2.8,
    arm: 1,
    shoe: 'sneaker',
  },
  slim: {
    torso: 'slim',
    hips: 'slim',
    waist: -18,
    neckIn: 2,
    shX: 5,
    shY: -28,
    hipX: 2.5,
    hipY: -15,
    knee: -9,
    ankle: -3,
    thigh: 3.6,
    calf: 2.8,
    upper: 2.6,
    fore: 2.2,
    arm: 0.96,
    shoe: 'sneaker',
  },
  teen: {
    torso: 'teen',
    hips: 'teen',
    waist: -17,
    neckIn: 2,
    shX: 5,
    shY: -26,
    hipX: 2.5,
    hipY: -14,
    knee: -8.5,
    ankle: -3,
    thigh: 3.6,
    calf: 3,
    upper: 2.6,
    fore: 2.3,
    arm: 0.92,
    shoe: 'sneaker',
  },
  kid: {
    torso: 'kid',
    hips: 'kid',
    waist: -10,
    neckIn: 1,
    shX: 4,
    shY: -15.5,
    hipX: 2,
    hipY: -8,
    knee: -5,
    ankle: -2,
    thigh: 3,
    calf: 2.6,
    upper: 2.2,
    fore: 2,
    arm: 0.62,
    shoe: 'kid',
  },
};

type P2 = readonly [number, number];

/** 一只手臂：肘、手相对肩关节（x 向外为正、y 向下为正），behind = 画在身体后面 */
export interface ArmPose {
  el: P2;
  hand: P2;
  behind?: boolean;
}
/** 一条腿：膝、脚踝相对胯关节的偏移（在默认站姿上加） */
export interface LegPose {
  knee?: P2;
  foot?: P2;
}
export interface RacketPose {
  /** 角度（度）：0 朝上、90 朝外（拿拍的那一侧）、-90 朝里 */
  ang: number;
  /** 侧着（拍面看成一条线） */
  edge?: boolean;
  behind?: boolean;
}
export interface PropPose {
  name: keyof typeof PROPS;
  /** 拿在哪只手（R / L），或 'head'（头顶上方）、'free'（相对锚点） */
  at: 'R' | 'L' | 'head' | 'free';
  dx?: number;
  dy?: number;
  behind?: boolean;
}

export interface Pose {
  /** 上半身（胯以上）整体上下（正 = 往下沉） */
  dy?: number;
  /** 上半身左右（正 = 往人物的左手边…正面就是画面右） */
  lean?: number;
  /** 头额外的偏移 */
  hx?: number;
  hy?: number;
  /** 整个人离地（跳） */
  lift?: number;
  R?: ArmPose;
  L?: ArmPose;
  legR?: LegPose;
  legL?: LegPose;
  racket?: RacketPose | null;
  props?: PropPose[];
  mark?: keyof typeof MARKS;
  markDy?: number;
}

/** 一个人的长相设定（rig 用到的部分） */
export interface Build {
  head: keyof typeof HEADS;
  body: BodyType;
  decals: keyof typeof DECALS;
  /** 下装：短裤 / 长裤 / 裙子 */
  bottoms: 'shorts' | 'pants' | 'skirt';
  /** 袖长：0 无袖 … 1 到手肘 … 2 长袖 */
  sleeve: number;
  shoe?: keyof typeof SHOES;
  /** 膝盖上的护膝（X），R / L */
  brace?: 'R' | 'L';
  /** 手套 */
  gloves?: boolean;
  /** 护腕（C） */
  wrist?: boolean;
  /** 高筒袜 */
  tallSocks?: boolean;
}

export const FRAME_W = 48;
export const FRAME_H = 60;
const OX = 24;
const OY = 54;

/* ---------- 画点、画线段、贴部件 ---------- */

function put(mm: MatMap, x: number, y: number, c: string, z: number): void {
  if (x < 0 || y < 0 || x >= mm.w || y >= mm.h || c === '.') return;
  const i = y * mm.w + x;
  // 深度：靠后的部件不压靠前的（背后的手臂、绕到脑后的拍子）
  if (mm.m[i] !== '.' && z < mm.z[i]) return;
  mm.m[i] = c;
  mm.z[i] = z;
}

/** 粗线段：从 a 到 b，宽度从 wa 渐变到 wb；mat(t) 按长度比例给材质（t 0..1） */
function seg(mm: MatMap, a: P2, b: P2, wa: number, wb: number, mat: (t: number) => string, z: number): void {
  const ax = mm.ox + a[0];
  const ay = mm.oy + a[1];
  const bx = mm.ox + b[0];
  const by = mm.oy + b[1];
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy || 1e-6;
  const r = Math.max(wa, wb) / 2 + 1;
  const x0 = Math.floor(Math.min(ax, bx) - r);
  const x1 = Math.ceil(Math.max(ax, bx) + r);
  const y0 = Math.floor(Math.min(ay, by) - r);
  const y1 = Math.ceil(Math.max(ay, by) + r);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + dx * t - px;
      const qy = ay + dy * t - py;
      const w = wa + (wb - wa) * t;
      if (qx * qx + qy * qy <= (w / 2) * (w / 2) + 0.02) put(mm, x, y, mat(t), z);
    }
}

/** 贴一个部件：部件锚点对准 (x, y)（相对人物锚点） */
function stamp(mm: MatMap, p: Part, x: number, y: number, z: number, flip = false): void {
  const left = Math.round(mm.ox + x) - (flip ? p.rows[0].length - p.ax : p.ax);
  const top = Math.round(mm.oy + y) - p.ay;
  for (let j = 0; j < p.rows.length; j++) {
    const row = p.rows[j];
    for (let i = 0; i < row.length; i++) {
      const c = flip ? row[row.length - 1 - i] : row[i];
      put(mm, left + i, top + j, c, z);
    }
  }
}

/* ---------- 球拍 ---------- */
function racket(mm: MatMap, hand: P2, angDeg: number, edge: boolean, z: number, small: boolean): void {
  const a = (angDeg * Math.PI) / 180;
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const grip = small ? 2.5 : 3.5;
  const thr = small ? 1.5 : 2;
  const ry = small ? 3 : 3.8;
  const rx = edge ? 0.9 : small ? 2.2 : 2.8;
  // 握把（深色）+ 拍喉
  seg(mm, [hand[0] - ux * 0.5, hand[1] - uy * 0.5], [hand[0] + ux * grip, hand[1] + uy * grip], 1.6, 1.4, () => 'q', z);
  seg(
    mm,
    [hand[0] + ux * grip, hand[1] + uy * grip],
    [hand[0] + ux * (grip + thr), hand[1] + uy * (grip + thr)],
    1.4,
    1.2,
    () => 'Q',
    z,
  );
  // 拍框（椭圆环），中间是球线（隔一格一根）
  const cx = mm.ox + hand[0] + ux * (grip + thr + ry - 0.5);
  const cy = mm.oy + hand[1] + uy * (grip + thr + ry - 0.5);
  const R = Math.ceil(ry + 1);
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;
      // 投到拍子自己的坐标：沿拍柄方向 v、横向 u
      const v = px * ux + py * uy;
      const u = px * -uy + py * ux;
      const d = (u / rx) ** 2 + (v / ry) ** 2;
      if (d > 1.08) continue;
      const inner = ((Math.abs(u) + 1) / rx) ** 2 + ((Math.abs(v) + 1) / ry) ** 2;
      if (inner > 1 || edge) put(mm, x, y, 'Q', z);
    }
}

/* ---------- 一帧 ---------- */

export interface Built {
  map: MatMap;
  /** 头顶（情绪符号的位置），相对锚点 */
  headTop: P2;
}

/**
 * 拼一帧。facing：正面时人物的右手在画面左边（x < 0），背面在画面右边。
 */
export function compose(b: Build, pose: Pose, facing: Facing, hasRacket: boolean): Built {
  const B = BODIES[b.body];
  const mm = newMap(FRAME_W, FRAME_H, OX, OY);
  const front = facing === 'front';
  const sR = front ? -1 : 1; // 人物右手在画面哪边
  const lift = -(pose.lift ?? 0);
  const dy = (pose.dy ?? 0) + lift;
  const lean = (pose.lean ?? 0) * (front ? 1 : -1);
  const kid = b.body === 'kid';

  // z：背后的手臂 1，背后的拍子 2，腿 3，胯 4，上衣 5，头 6，贴花 7，前面的手臂 8，拍子 9，道具 10
  /* 腿 */
  const leg = (side: 'R' | 'L', lp: LegPose | undefined) => {
    const s = side === 'R' ? sR : -sR;
    const hip: P2 = [s * B.hipX + lean * 0.4, B.hipY + dy];
    const kneeBase: P2 = [s * B.hipX, B.knee + lift + Math.max(0, (pose.dy ?? 0) * 0.5)];
    const knee: P2 = [kneeBase[0] + s * (lp?.knee?.[0] ?? 0), kneeBase[1] + (lp?.knee?.[1] ?? 0)];
    const foot: P2 = [s * B.hipX + s * (lp?.foot?.[0] ?? 0), B.ankle + lift + (lp?.foot?.[1] ?? 0)];
    const thighLen = Math.hypot(knee[0] - hip[0], knee[1] - hip[1]);
    const shortsT = b.bottoms === 'pants' ? 2 : b.bottoms === 'skirt' ? 0 : Math.min(1, 3.2 / Math.max(1, thighLen));
    const bottomsMat = (t: number) => (t < shortsT ? 'B' : 'S');
    seg(mm, hip, knee, B.thigh, B.calf + 0.4, bottomsMat, 3);
    const socks = b.tallSocks ? 0.45 : 0.78;
    const calfMat = (t: number) =>
      b.bottoms === 'pants'
        ? t > 0.15 && t < 0.25
          ? 'b'
          : 'B'
        : b.brace === side && t < 0.3
          ? 'X'
          : t > socks && b.shoe !== 'sandal'
            ? 'K'
            : 'S';
    seg(mm, knee, foot, B.calf + 0.3, B.calf - 0.6, calfMat, 3);
    if (b.brace === side && b.bottoms === 'pants')
      stamp(mm, { rows: ['XXX', 'X@X', 'XXX'], ax: 1, ay: 1 }, knee[0], knee[1], 3);
    const shoe = SHOES[b.shoe ?? B.shoe];
    stamp(mm, front ? shoe.front : shoe.back, foot[0], foot[1], 3, s > 0);
  };
  leg('R', pose.legR);
  leg('L', pose.legL);

  /* 胯部 + 上衣 */
  const hips = HIPS[b.bottoms === 'skirt' ? (kid ? 'kidSkirt' : 'skirt') : B.hips];
  stamp(mm, hips, lean * 0.6, B.waist + dy, 4);
  const torso = TORSOS[B.torso];
  stamp(mm, front ? torso.front : torso.back, lean, B.waist + dy, 5);
  const torsoH = (front ? torso.front : torso.back).rows.length;

  /* 头 */
  const head = HEADS[b.head];
  const hp = front ? head.front : head.back;
  const hx = lean + (pose.hx ?? 0) * (front ? 1 : -1);
  const hy = B.waist + dy - torsoH + B.neckIn + (pose.hy ?? 0);
  stamp(mm, hp, hx, hy, 6);
  const headTop: P2 = [hx, hy - hp.rows.length];

  /* 贴花 */
  const decals = DECALS[b.decals];
  const list: Decal[] = front ? decals.front : decals.back;
  // 贴花按上沿对位：dy 是贴花第一行相对腰线的行数
  for (const d of list) if (!d.over) stamp(mm, d.art, lean + d.dx, B.waist + dy + d.dy + d.art.ay, 7);

  /* 手臂 */
  const hands: Record<'R' | 'L', P2> = { R: [0, 0], L: [0, 0] };
  const arm = (side: 'R' | 'L', ap: ArmPose | undefined) => {
    const p = ap ?? { el: [0.6, 6], hand: [0.8, 12] };
    const s = side === 'R' ? sR : -sR;
    const sh: P2 = [s * B.shX + lean, B.shY + dy];
    const k = B.arm;
    const el: P2 = [sh[0] + s * p.el[0] * k, sh[1] + p.el[1] * k];
    const hd: P2 = [sh[0] + s * p.hand[0] * k, sh[1] + p.hand[1] * k];
    hands[side] = hd;
    // 背面看时，"在身体后面"的手（揉腰）反而在前面
    const z = p.behind && front ? 1 : 8;
    const sl = b.sleeve;
    const upperMat = (t: number) =>
      sl >= 1 ? (t > 0.92 && sl < 2 ? 'l' : 'L') : t < sl ? (t > sl - 0.15 ? 'l' : 'L') : 'S';
    seg(mm, sh, el, B.upper + 0.4, B.upper, upperMat, z);
    const foreMat = (t: number) =>
      sl >= 2 ? (t > 0.85 ? (b.wrist ? 'C' : 'L') : 'L') : b.wrist && t > 0.72 ? 'C' : 'S';
    seg(mm, el, hd, B.fore, B.fore - 0.3, foreMat, z);
    // 手：一小团
    const hand = b.gloves ? 'Z' : 'S';
    seg(mm, hd, [hd[0], hd[1] + (kid ? 0.6 : 1)], kid ? 2.2 : 2.6, kid ? 2 : 2.4, () => hand, z);
  };
  // 先画背后的那只，再画前面的
  const order: ('R' | 'L')[] = ['L', 'R'];
  for (const s of order) arm(s, s === 'R' ? pose.R : pose.L);

  for (const d of list) if (d.over) stamp(mm, d.art, lean + d.dx, B.waist + dy + d.dy + d.art.ay, 8);

  /* 球拍（右手） */
  if (hasRacket && pose.racket) {
    const rp = pose.racket;
    // 角度按人物朝向换算到画面：外侧 = 右手所在的那边
    const ang = sR < 0 ? -rp.ang : rp.ang;
    racket(mm, hands.R, ang, !!rp.edge, rp.behind && front ? 2 : 9, kid);
  }

  /* 道具 */
  for (const pr of pose.props ?? []) {
    const art = PROPS[pr.name];
    let at: P2 = [0, 0];
    if (pr.at === 'R' || pr.at === 'L') at = hands[pr.at];
    else if (pr.at === 'head') at = [headTop[0], headTop[1]];
    const s = pr.at === 'L' ? -sR : sR;
    stamp(mm, art, at[0] + (pr.dx ?? 0) * s, at[1] + (pr.dy ?? 0), pr.behind ? 2 : 10, s > 0 && pr.name !== 'phone');
  }
  if (pose.mark) {
    const m = MARKS[pose.mark];
    stamp(mm, m, headTop[0] + (front ? 5 : 5), headTop[1] + 2 + (pose.markDy ?? 0), 11);
  }
  return { map: mm, headTop };
}
