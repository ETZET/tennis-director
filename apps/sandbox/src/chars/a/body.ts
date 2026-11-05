/**
 * 方向 A 的拼帧器：一个人 = 手画的头（字符画，见 heads.ts）+ 按体型生成的躯干和衣服 + 按骨架摆出的四肢和手里的东西。
 * 每一帧拼成「材质 + 色阶」网格，自动加选择性描边，再按这个人的换色表烘焙成 BakedArt。
 *
 * 坐标：网格 48×52，锚点（两脚中间、鞋底下面那一行）在 (AX, AY)。y 向下。
 * 成人 32 行高（含上下描边）：头 6 行 + 脖子 1 + 躯干 10 + 腿 11 + 鞋 2。小孩 22 行：头 6 + 躯干 6 + 腿 7 + 鞋 1。
 * 正面（front）脸朝画面右下，人物的右手在画面左边；背面（back）背朝镜头，右手在画面右边；朝左由运行时水平翻转。
 */
import type { BakedArt } from '@td/iso';
import { bakeGrid, Grid, type Mat, type Palette, type Tone } from './format';

export const GW = 48;
export const GH = 52;
export const AX = 24;
export const AY = 48;

export type Facing = 'front' | 'back';
export type Expr = 'n' | 'happy' | 'mad' | 'shut' | 'wince' | 'down' | 'talk' | 'look' | 'up';

/** 手画的头：rows 字符画，(fx, fy) 是 7×6 脸框左上角在字符画里的位置 */
export interface HeadArt {
  rows: readonly string[];
  fx: number;
  fy: number;
}

export interface Build {
  kid?: boolean;
  /** 肩宽、腰宽、胯宽（偶数，像素） */
  sh: number;
  waist: number;
  hip: number;
  /** 躯干行数（肩到裆）、腿行数（裆到脚踝，不含鞋） */
  torso: number;
  leg: number;
  /** 肚子：第几行起往外鼓一格 */
  belly?: number;
  /** 驼背：头往下沉几格、肩膀更圆 */
  hunch?: number;
}

export type Top = 'polo' | 'tee' | 'tank' | 'hoodie' | 'blazer' | 'work' | 'hawaii' | 'dress' | 'zip' | 'jersey';
export type Bottom = 'shorts' | 'pants' | 'skirt' | 'leggings';
export type Extra =
  | 'apron'
  | 'towel'
  | 'lanyard'
  | 'bandana'
  | 'tape'
  | 'kneebrace'
  | 'camera'
  | 'tote'
  | 'belt'
  | 'radio'
  | 'number'
  | 'wristband'
  | 'gloves';

export interface Look {
  pal: Palette;
  build: Build;
  top: Top;
  sleeve: 'short' | 'long' | 'none' | 'rolled';
  bottom: Bottom;
  socks?: 'low' | 'high' | 'none';
  shoe?: 'sneaker' | 'boot' | 'sandal';
  head: { front: HeadArt; back: HeadArt };
  extras?: readonly Extra[];
}

export type Item =
  | 'racket'
  | 'clipboard'
  | 'phone'
  | 'cup'
  | 'broom'
  | 'pliers'
  | 'tablet'
  | 'ball'
  | 'bottle'
  | 'camera';

/** 一只胳膊：肘和手相对肩关节的偏移（像素）。x 正 = 朝身体外侧，y 正 = 向下 */
export interface Arm {
  e: readonly [number, number];
  h: readonly [number, number];
  /** 手在身后（正面看被身体挡住，背面看露在背上） */
  behind?: boolean;
  item?: Item;
  /** 手里东西的角度（度，屏幕方向，0 = 朝外、90 = 朝下、-90 = 朝上），只给球拍、扫帚 */
  ang?: number;
  /** 球拍在身后（正面看压在身子后面） */
  itemBehind?: boolean;
}

/** 一条腿：脚踝相对胯关节的偏移；k 是膝盖（不给就是直的） */
export interface Leg {
  f: readonly [number, number];
  k?: readonly [number, number];
}

export interface Pose {
  /** 躯干和头整体下沉（蹲、呼吸） */
  bob?: number;
  /** 头额外的偏移 */
  hx?: number;
  hy?: number;
  /** 人物的右臂 / 左臂、右腿 / 左腿 */
  ar: Arm;
  al: Arm;
  lr?: Leg;
  ll?: Leg;
  face?: Expr;
  /** 额外的小东西（球、哈气、闪光），在网格坐标上画 */
  fx?: (g: Grid, at: Anchors) => void;
}

/** 拼好的一帧里几个点的位置（网格坐标），给 fx 和演出用 */
export interface Anchors {
  /** 头顶、嘴、左右手 */
  top: [number, number];
  mouth: [number, number];
  hr: [number, number];
  hl: [number, number];
  facing: Facing;
}

/* ---------- 画线 ---------- */

/** 粗线：从 a 到 b，w 像素宽，刷子取垂直于主方向；mat(len) 给出沿线第几格用什么材质 */
function limb(
  g: Grid,
  a: readonly [number, number],
  b: readonly [number, number],
  w: number | ((t: number) => number),
  mat: (len: number) => Mat,
  len0 = 0,
  align: 'lo' | 'hi' = 'lo',
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const vert = Math.abs(dy) >= Math.abs(dx);
  let last = '';
  let len = len0;
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const x = Math.round(a[0] + dx * t);
    const y = Math.round(a[1] + dy * t);
    const key = `${x},${y}`;
    if (key === last) continue;
    last = key;
    const ww = typeof w === 'number' ? w : w(t);
    const m = mat(len);
    for (let k = 0; k < ww; k++) {
      // 刷子从 lo 侧（左 / 上）往外排；hi 对齐时从另一侧
      const o = align === 'lo' ? k : -k;
      const px = vert ? x + o : x;
      const py = vert ? y : y + o;
      // 光从左上来：最右 / 最下那格是背光，只有一格宽时不压暗
      const far = align === 'lo' ? k === ww - 1 : k === 0;
      const near = align === 'lo' ? k === 0 : k === ww - 1;
      const tone: Tone = ww > 1 && far ? 2 : ww > 2 && near && m !== 'S' ? 0 : 1;
      g.set(px, py, m, tone);
    }
    len++;
  }
  return len;
}

/* ---------- 手里的东西 ---------- */

function racket(g: Grid, hx: number, hy: number, ang: number, kid: boolean): void {
  const a = (ang * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const handle = kid ? 2 : 3;
  // 拍柄（深色握把从手里伸出来）
  for (let i = 1; i <= handle; i++) g.set(hx + ux * i, hy + uy * i, 'Q', i === 1 ? 3 : 2);
  // 拍面：斜椭圆圈 + 稀疏的拍线（透出地面）
  const A = kid ? 2.6 : 3.4;
  const B = kid ? 2.0 : 2.5;
  const cx = hx + ux * (handle + A);
  const cy = hy + uy * (handle + A);
  const R = Math.ceil(A) + 1;
  for (let y = Math.floor(cy - R); y <= cy + R; y++)
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const px = x - cx;
      const py = y - cy;
      const u = px * ux + py * uy;
      const v = -px * uy + py * ux;
      const d = (u / A) ** 2 + (v / B) ** 2;
      if (d > 1.05) continue;
      const din = (u / (A - 1)) ** 2 + (v / (B - 1)) ** 2;
      if (din > 1) g.set(x, y, 'Q', px + py < 0 ? 1 : 2);
      else if ((x + y) % 2 === 0) g.set(x, y, 'R', 1);
    }
}

function item(g: Grid, it: Item, hx: number, hy: number, ang: number, kid: boolean, face: Facing): void {
  switch (it) {
    case 'racket':
      racket(g, hx, hy, ang, kid);
      return;
    case 'clipboard':
      // 夹板贴着大腿，纸朝镜头
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < 4; x++) g.set(hx - 1 + x, hy - 2 + y, 'D', x === 3 || y === 5 ? 2 : 1);
      if (face === 'front')
        for (let y = 1; y < 5; y++)
          for (let x = 0; x < 3; x++) g.set(hx - 1 + x, hy - 2 + y, 'P', y === 2 && x > 0 ? 2 : 1);
      g.set(hx, hy - 2, 'G', 1);
      g.set(hx + 1, hy - 2, 'G', 2);
      return;
    case 'phone':
      g.set(hx, hy - 1, 'G', 3);
      g.set(hx + 1, hy - 1, 'G', 3);
      if (face === 'front') {
        g.set(hx, hy - 2, 'Y', 1);
        g.set(hx + 1, hy - 2, 'Y', 1);
      } else {
        g.set(hx, hy - 2, 'G', 2);
        g.set(hx + 1, hy - 2, 'G', 2);
      }
      return;
    case 'cup':
      g.set(hx, hy - 3, 'G', 2);
      g.set(hx + 1, hy - 3, 'G', 2);
      g.set(hx, hy - 2, 'W', 1);
      g.set(hx + 1, hy - 2, 'W', 2);
      g.set(hx, hy - 1, 'A', 1);
      g.set(hx + 1, hy - 1, 'A', 2);
      return;
    case 'broom': {
      // 长柄斜着拄在地上，下面是刷头
      const a = (ang * Math.PI) / 180;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      for (let i = -5; i <= 12; i++) g.set(hx + ux * i, hy + uy * i, 'D', i < 0 ? 1 : 2);
      const bx = Math.round(hx + ux * 13);
      const by = Math.round(hy + uy * 13);
      for (let y = 0; y < 3; y++) for (let x = -2; x <= 2; x++) g.set(bx + x, by + y, 'A', y === 2 ? 2 : x < 0 ? 0 : 1);
      return;
    }
    case 'pliers':
      g.set(hx, hy + 2, 'G', 1);
      g.set(hx + 1, hy + 2, 'G', 2);
      g.set(hx, hy + 3, 'G', 2);
      g.set(hx + 1, hy + 3, 'A', 2);
      g.set(hx, hy + 4, 'A', 1);
      return;
    case 'tablet':
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 4; x++) g.set(hx - 1 + x, hy - 1 + y, x === 3 || y === 4 ? 'G' : 'G', x === 3 ? 3 : 2);
      if (face === 'front') for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) g.set(hx + x, hy + y, 'Y', 1);
      return;
    case 'ball':
      g.set(hx, hy - 1, '7', 1);
      return;
    case 'camera':
      // 举到眼前的相机：机身 + 镜头
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 4; x++) g.set(hx - 1 + x, hy - 3 + y, 'G', x === 3 || y === 2 ? 2 : 1);
      if (face === 'front') g.set(hx + 1, hy - 2, 'O', 1);
      return;
    case 'bottle':
      for (let y = 0; y < 5; y++) {
        g.set(hx, hy - 2 + y, 'U', 1);
        g.set(hx + 1, hy - 2 + y, 'U', 2);
      }
      g.set(hx, hy - 3, 'G', 1);
      return;
  }
}

/* ---------- 躯干 ---------- */

function widths(b: Build): number[] {
  const out: number[] = [];
  const T = b.torso;
  for (let i = 0; i < T; i++) {
    let w: number;
    if (i === 0) w = b.sh - (b.hunch ? 0 : 2);
    else if (i <= Math.round(T * 0.35)) w = b.sh;
    else if (i <= Math.round(T * 0.6)) w = Math.round((b.sh + b.waist) / 2 / 2) * 2;
    else if (i <= Math.round(T * 0.7)) w = b.waist;
    else w = b.hip;
    if (b.belly != null && i >= b.belly && i < T - 1) w = Math.max(w, b.sh) + (i > b.belly && i < T - 2 ? 2 : 0);
    out.push(w);
  }
  return out;
}

/** 躯干：衣服 + 下装的上半截（胯）。返回每行的左右边（网格列） */
function torso(g: Grid, L: Look, y0: number, face: Facing): { l: number[]; r: number[] } {
  const b = L.build;
  const W = widths(b);
  const T = b.torso;
  const kid = !!b.kid;
  const topEnd = L.top === 'dress' ? T : L.top === 'tee' || L.top === 'hawaii' || L.top === 'hoodie' ? T - 2 : T - 3;
  const ls: number[] = [];
  const rs: number[] = [];
  for (let i = 0; i < T; i++) {
    const w = W[i] as number;
    const l = AX - w / 2;
    const r = AX + w / 2 - 1;
    ls.push(l);
    rs.push(r);
    const y = y0 + i;
    for (let x = l; x <= r; x++) {
      const col = x - l;
      let m: Mat = i < topEnd ? 'T' : 'B';
      let t: Tone = 1;
      // 受光：左边一列；背光：右边两列；衣服下摆一行背光
      if (col === 0) t = 0;
      if (col >= w - 2) t = 2;
      if (col === w - 1 && i > 0) t = 3;
      if (i === topEnd - 1 && m === 'T' && col > 1) t = 2;
      // 胸下的褶子（右下斜一道）
      if (m === 'T' && !kid && i === Math.round(T * 0.45) && col === w - 3) t = 2;
      if (m === 'T' && !kid && i === Math.round(T * 0.55) && col === w - 4) t = 2;
      // 裆：下装最后一行中间开缝
      if (m === 'B' && i === T - 1 && L.bottom !== 'skirt' && (x === AX - 1 || x === AX)) t = x === AX ? 3 : 2;
      // 腰带
      if (i === topEnd && m === 'B' && (L.extras?.includes('belt') || L.top === 'polo' || L.top === 'work')) m = 'A';
      g.set(x, y, m, t);
    }
  }
  /* ---- 领口、花样 ---- */
  const mid = AX;
  const top = L.top;
  if (face === 'front') {
    if (top === 'polo' || top === 'jersey') {
      // 翻领 + 门襟
      for (const x of [mid - 2, mid + 1]) g.set(x, y0, 'U', 1);
      g.set(mid - 1, y0, 'S', 2);
      g.set(mid, y0, 'S', 2);
      g.set(mid - 1, y0 + 1, 'U', 2);
      if (top === 'polo') g.set(mid - 1, y0 + 2, 'T', 3);
    } else if (top === 'tee' || top === 'hawaii') {
      g.set(mid - 1, y0, 'S', 1);
      g.set(mid, y0, 'S', 2);
      if (top === 'hawaii') {
        g.set(mid - 1, y0 + 1, 'S', 2);
        // 花：U 叶子 + A 花朵，按位置散开
        for (let i = 1; i < topEnd; i++)
          for (let x = ls[i] as number; x <= (rs[i] as number); x++) {
            const h = (x * 7 + i * 13) % 11;
            if (h === 0) g.set(x, y0 + i, 'A', 1);
            else if (h === 5) g.set(x, y0 + i, 'U', g.tone(x, y0 + i) === 2 ? 2 : 1);
          }
        for (let i = 2; i < topEnd; i += 2) g.set(mid - 1, y0 + i, 'T', 3);
      }
    } else if (top === 'tank' || top === 'dress') {
      // 吊带：肩上露皮肤，中间领口
      for (let i = 0; i < 2; i++) {
        const l = ls[i] as number;
        const r = rs[i] as number;
        for (let x = l; x <= r; x++) {
          const strap = x === l + 1 || x === r - 1;
          if (!strap) g.set(x, y0 + i, 'S', x >= r - 1 ? 2 : x === l ? 0 : 1);
        }
      }
      g.set(mid - 1, y0 + 2, 'S', 2);
      g.set(mid, y0 + 2, 'S', 2);
    } else if (top === 'hoodie') {
      // 帽兜堆在脖子后面、抽绳、口袋
      for (let x = mid - 3; x <= mid + 2; x++) g.set(x, y0, 'U', x > mid ? 2 : 1);
      g.set(mid - 1, y0, 'S', 2);
      g.set(mid, y0, 'S', 2);
      g.set(mid - 2, y0 + 1, 'W', 1);
      g.set(mid - 2, y0 + 2, 'W', 1);
      g.set(mid + 1, y0 + 1, 'W', 2);
      g.set(mid + 1, y0 + 2, 'W', 2);
      for (let x = mid - 3; x <= mid + 2; x++) g.set(x, y0 + topEnd - 3, 'T', 3);
    } else if (top === 'blazer') {
      // 敞开的西装：V 领里面是 U 色内衣，翻领深一档，扣子
      for (let i = 0; i < 5; i++) {
        const half = Math.max(0, 2 - Math.floor(i / 2));
        for (let x = mid - 1 - half; x <= mid + half; x++) g.set(x, y0 + i, 'U', x > mid - 1 ? 2 : 1);
        g.set(mid - 2 - half, y0 + i, 'T', 3);
        g.set(mid + 1 + half, y0 + i, 'T', 0);
      }
      g.set(mid - 1, y0 + 6, 'T', 3);
      for (let i = 5; i < topEnd; i++) g.set(mid, y0 + i, 'T', 3);
    } else if (top === 'work') {
      // 工装：领子、两个胸袋、门襟扣子
      g.set(mid - 2, y0, 'T', 3);
      g.set(mid - 1, y0, 'S', 2);
      g.set(mid, y0, 'S', 2);
      g.set(mid + 1, y0, 'T', 3);
      for (let i = 1; i < topEnd; i++) g.set(mid - 1, y0 + i, 'T', 3);
      for (const px of [mid - 4, mid + 1]) {
        g.set(px, y0 + 2, 'T', 3);
        g.set(px + 1, y0 + 2, 'T', 3);
        g.set(px, y0 + 3, 'T', 2);
        g.set(px + 1, y0 + 3, 'T', 2);
      }
    } else if (top === 'zip') {
      // 运动拉链衫：中间拉链、肩部撞色
      for (let i = 0; i < topEnd; i++) g.set(mid - 1, y0 + i, i === 0 ? 'S' : 'G', i === 0 ? 2 : 1);
      for (let x = ls[1] as number; x <= (rs[1] as number); x++)
        if (x !== mid - 1) g.set(x, y0 + 1, 'U', x > mid + 1 ? 2 : 1);
    }
  } else {
    // 背面：领口一线、帽兜、背号
    if (top === 'hoodie') {
      for (let i = 0; i < 4; i++)
        for (let x = mid - 3 + Math.floor(i / 2); x <= mid + 2 - Math.floor(i / 2); x++)
          g.set(x, y0 + i, 'U', x > mid ? 2 : i === 3 ? 3 : 1);
    } else if (top === 'polo' || top === 'jersey' || top === 'work') {
      for (let x = mid - 2; x <= mid + 1; x++) g.set(x, y0, 'U', x > mid - 1 ? 2 : 1);
    } else if (top === 'tank' || top === 'dress') {
      for (let i = 0; i < 2; i++) {
        const l = ls[i] as number;
        const r = rs[i] as number;
        for (let x = l; x <= r; x++) if (!(x === l + 1 || x === r - 1)) g.set(x, y0 + i, 'S', x >= r - 1 ? 2 : 1);
      }
      for (let x = mid - 1; x <= mid; x++) g.set(x, y0 + 2, 'S', 2);
    } else if (top === 'blazer') {
      for (let i = 2; i < topEnd; i++) g.set(mid, y0 + i, 'T', 2);
    }
    // 背后的褶子：肩胛下一道
    g.set(mid + 2, y0 + 3, 'T', 2);
    g.set(mid - 3, y0 + 4, 'T', 2);
  }
  /* ---- 下装：短裙 / 连衣裙的裙摆盖到大腿 ---- */
  if (L.bottom === 'skirt') {
    const hip = W[T - 1] as number;
    const m: Mat = L.top === 'dress' ? 'T' : 'B';
    for (let j = 0; j < (kid ? 2 : 3); j++) {
      const w = hip + 2 + (j > 0 ? 2 : 0);
      const l = AX - w / 2;
      for (let x = l; x < l + w; x++) {
        const c = x - l;
        // 百褶：隔一格深一格
        const t: Tone = c === 0 ? 0 : c >= w - 2 ? 2 : (c + j) % 3 === 2 ? 2 : 1;
        g.set(x, y0 + T + j, m, j === (kid ? 1 : 2) ? (c % 2 ? 2 : t) : t);
      }
    }
  }
  if (L.top === 'dress') {
    // 连衣裙腰线
    const i = Math.round(T * 0.65);
    for (let x = ls[i] as number; x <= (rs[i] as number); x++) g.set(x, y0 + i, 'U', 1);
  }
  return { l: ls, r: rs };
}

/** 身上的配饰（在躯干之后、头之前画） */
function extras(g: Grid, L: Look, y0: number, face: Facing, edge: { l: number[]; r: number[] }): void {
  const T = L.build.torso;
  const mid = AX;
  const ex = L.extras ?? [];
  // 正面：人物右肩在画面左边
  const rightL = face === 'front';
  for (const e of ex) {
    if (e === 'apron') {
      const x0 = mid - 3;
      const x1 = mid + 2;
      for (let i = face === 'front' ? 1 : 5; i < T + 2; i++) {
        if (face === 'back') {
          // 背后只看得到系带
          if (i === 5)
            for (let x = (edge.l[i] as number) + 1; x <= (edge.r[i] as number) - 1; x++) g.set(x, y0 + i, 'U', 2);
          continue;
        }
        for (let x = x0; x <= x1; x++) g.set(x, y0 + i, 'U', x === x0 ? 0 : x >= x1 - 1 ? 2 : 1);
      }
      if (face === 'front') {
        // 肩带、口袋、插在口袋里的钳子
        g.set(x0, y0, 'U', 1);
        g.set(x1, y0, 'U', 2);
        for (let x = x0 + 1; x <= x1 - 1; x++) g.set(x, y0 + 5, 'U', 3);
        g.set(x0 + 1, y0 + 4, 'G', 1);
        g.set(x0 + 1, y0 + 3, 'G', 2);
        g.set(x1 - 1, y0 + 4, 'A', 1);
      } else {
        g.set(mid - 1, y0 + 6, 'U', 1);
        g.set(mid, y0 + 6, 'U', 2);
        g.set(mid - 1, y0 + 7, 'U', 2);
      }
    } else if (e === 'towel') {
      // 毛巾搭在右肩，前后各垂一截
      const x = rightL ? (edge.l[1] as number) : (edge.r[1] as number) - 2;
      for (let i = -1; i < 5; i++) for (let k = 0; k < 3; k++) g.set(x + k, y0 + i, 'W', k === 2 ? 2 : i === 4 ? 2 : 1);
      g.set(x + 1, y0 + 2, 'W', 2);
    } else if (e === 'lanyard' && face === 'front') {
      g.set(mid - 2, y0 + 1, 'A', 1);
      g.set(mid + 1, y0 + 1, 'A', 2);
      g.set(mid - 2, y0 + 2, 'A', 1);
      g.set(mid + 1, y0 + 2, 'A', 2);
      g.set(mid - 1, y0 + 3, 'A', 1);
      g.set(mid, y0 + 3, 'A', 2);
      g.set(mid - 1, y0 + 4, 'P', 1);
      g.set(mid, y0 + 4, 'P', 2);
      g.set(mid - 1, y0 + 5, 'P', 2);
      g.set(mid, y0 + 5, 'A', 2);
    } else if (e === 'bandana') {
      for (let x = mid - 3; x <= mid + 2; x++) g.set(x, y0, 'A', x > mid ? 2 : 1);
      if (face === 'front') {
        g.set(mid - 1, y0 + 1, 'A', 1);
        g.set(mid, y0 + 1, 'A', 2);
      } else {
        g.set(mid, y0 + 1, 'A', 2);
        g.set(mid + 1, y0 + 2, 'A', 2);
      }
    } else if (e === 'camera' && face === 'front') {
      // 斜挎带 + 胸前的相机
      for (let i = 0; i < 4; i++) g.set(mid + 2 - i, y0 + i, 'A', 3);
      for (let y = 4; y < 6; y++) for (let x = mid - 2; x <= mid; x++) g.set(x, y0 + y, 'G', x === mid ? 2 : 1);
      g.set(mid - 1, y0 + 5, 'O', 1);
    } else if (e === 'tote') {
      const x = rightL ? (edge.r[1] as number) - 1 : (edge.l[1] as number) - 1;
      for (let i = 0; i < 4; i++) g.set(x + (rightL ? 0 : 1), y0 + i, 'A', 3);
      const bx = rightL ? (edge.r[5] as number) - 1 : (edge.l[5] as number) - 2;
      for (let y = 0; y < 6; y++)
        for (let k = 0; k < 4; k++) g.set(bx + k, y0 + 4 + y, 'A', k === 3 || y === 5 ? 2 : k === 0 ? 0 : 1);
    } else if (e === 'radio') {
      const x = rightL ? (edge.r[T - 3] as number) - 1 : (edge.l[T - 3] as number);
      for (let y = 0; y < 3; y++) {
        g.set(x, y0 + T - 3 + y, 'G', 1);
        g.set(x + 1, y0 + T - 3 + y, 'G', 2);
      }
      g.set(x, y0 + T - 4, 'G', 3);
    } else if (e === 'number' && face === 'back') {
      // 背号「16」
      const yy = y0 + 2;
      for (let y = 0; y < 3; y++) g.set(mid - 3, yy + y, 'W', 1);
      g.set(mid - 1, yy, 'W', 1);
      g.set(mid - 1, yy + 1, 'W', 1);
      g.set(mid, yy + 1, 'W', 1);
      g.set(mid - 1, yy + 2, 'W', 1);
      g.set(mid, yy + 2, 'W', 1);
    }
  }
}

/* ---------- 脸的表情 ---------- */

function setFace(g: Grid, fx: number, fy: number, e: Expr): void {
  // 只改皮肤和眼睛的格子，胡子、眼镜不动
  const ok = (x: number, y: number) => {
    const m = g.get(fx + x, fy + y);
    return m === 'S' || m === 'E' || m === 'W' || m === 'M' || m === 'H';
  };
  const put = (x: number, y: number, m: Mat, t: Tone) => {
    if (ok(x, y)) g.set(fx + x, fy + y, m, t);
  };
  const mouth = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === 'x') put(2 + i, 4, 'S', 3);
      else if (c === 'w') put(2 + i, 4, 'W', 1);
      else if (c === 's') put(2 + i, 4, 'S', 1);
    }
  };
  const eyesShut = () => {
    for (const x of [1, 2, 4, 5])
      if (g.get(fx + x, fy + 2) === 'W' || g.get(fx + x, fy + 2) === 'E') put(x, 2, 'S', x === 2 || x === 5 ? 3 : 2);
  };
  switch (e) {
    case 'happy':
      mouth('xwx');
      break;
    case 'mad':
      // 皱眉：内侧眉毛压下来，眼白没了只剩瞪着的瞳孔
      for (const x of [1, 4]) if (g.get(fx + x, fy + 2) === 'W') put(x, 2, 'S', 3);
      mouth('xxx');
      put(1, 4, 'S', 2);
      put(4, 4, 'S', 3);
      break;
    case 'shut':
      eyesShut();
      mouth('sxs');
      break;
    case 'wince':
      eyesShut();
      mouth('xwx');
      break;
    case 'down':
      // 往下看：上眼皮盖住眼白
      for (const x of [1, 4]) if (g.get(fx + x, fy + 2) === 'W') put(x, 2, 'S', 2);
      break;
    case 'talk':
      mouth('sxs');
      put(3, 5, 'S', 3);
      break;
    case 'look':
      // 往左看（击球时看球）：瞳孔挪到左边
      for (const x of [1, 4])
        if (g.get(fx + x, fy + 2) === 'W') {
          put(x, 2, 'E', 1);
          put(x + 1, 2, 'W', 1);
        }
      break;
    case 'up':
      for (const x of [2, 5]) if (g.get(fx + x, fy + 2) === 'E') put(x, 2, 'W', 1);
      for (const x of [2, 5]) if (g.get(fx + x, fy + 1) === 'S') put(x, 1, 'E', 1);
      break;
    default:
      break;
  }
}

/* ---------- 拼一帧 ---------- */

export interface Frame {
  art: BakedArt;
  at: Anchors;
}

export function compose(L: Look, P: Pose, facing: Facing): Frame {
  const g = new Grid(GW, GH);
  const b = L.build;
  const kid = !!b.kid;
  const shoeH = kid ? 1 : 2;
  const bob = P.bob ?? 0;
  const yHip = AY - shoeH - b.leg; // 腿最上面一行
  const yT0 = yHip - b.torso + bob; // 躯干第一行（肩）
  const W = widths(b);
  const shW = W[1] as number;
  const yShJ = yT0 + 1;
  // 肩关节：胳膊两格宽，紧挨着躯干外沿
  const xShL = AX - shW / 2 - 2;
  const xShR = AX + shW / 2;
  const front = facing === 'front';
  // 正面：右臂在画面左边
  const armR = { arm: P.ar, sx: front ? -1 : 1, jx: front ? xShL : xShR };
  const armL = { arm: P.al, sx: front ? 1 : -1, jx: front ? xShR : xShL };
  const upper = kid ? 3 : 5;
  const at: Anchors = { top: [AX, 0], mouth: [AX, 0], hr: [0, 0], hl: [0, 0], facing };

  const armPts = (a: { arm: Arm; sx: number; jx: number }) => {
    const j: [number, number] = [a.jx, yShJ];
    const e: [number, number] = [a.jx + a.sx * a.arm.e[0], yShJ + a.arm.e[1]];
    const h: [number, number] = [a.jx + a.sx * a.arm.h[0], yShJ + a.arm.h[1]];
    return { j, e, h };
  };
  const drawArm = (a: { arm: Arm; sx: number; jx: number }, which: 'hr' | 'hl') => {
    const { j, e, h } = armPts(a);
    const sleeve = (len: number): Mat => {
      if (L.sleeve === 'none') return 'S';
      if (L.sleeve === 'long') return len >= upper * 2 - 1 ? 'S' : 'T';
      if (L.sleeve === 'rolled') return len < upper + 1 ? 'T' : len === upper + 1 ? 'U' : 'S';
      return len < (kid ? 2 : 3) ? 'T' : 'S';
    };
    const sleeveMat = (len: number): Mat => {
      const m = sleeve(len);
      if (m === 'S' && L.extras?.includes('gloves') && len >= upper * 2 - 2) return 'A';
      return m;
    };
    let len = limb(g, j, e, 2, sleeveMat, 0);
    len = limb(g, e, h, 2, sleeveMat, len - 1);
    // 肌肉贴：右上臂一道
    if (which === 'hr' && L.extras?.includes('tape')) {
      g.set(j[0], j[1] + 1, 'A', 1);
      g.set(j[0] + 1, j[1] + 2, 'A', 2);
    }
    if (L.extras?.includes('wristband')) {
      const wx = Math.round(e[0] + (h[0] - e[0]) * 0.8);
      const wy = Math.round(e[1] + (h[1] - e[1]) * 0.8);
      g.set(wx, wy, 'W', 1);
      g.set(wx + 1, wy, 'W', 2);
    }
    // 手：2×2（小孩 2×1），戴手套的用 A
    const hm: Mat = L.extras?.includes('gloves') ? 'A' : 'S';
    g.set(h[0], h[1], hm, 1);
    g.set(h[0] + 1, h[1], hm, 2);
    if (!kid) {
      g.set(h[0], h[1] + 1, hm, 1);
      g.set(h[0] + 1, h[1] + 1, hm, 2);
    }
    at[which] = [h[0], h[1]];
  };
  const drawItem = (a: { arm: Arm; sx: number; jx: number }) => {
    const it = a.arm.item;
    if (!it) return;
    const { h } = armPts(a);
    // 角度在「朝外为 0」的坐标里，换成屏幕
    const ang = a.arm.ang ?? 90;
    const sang = a.sx > 0 ? ang : 180 - ang;
    item(g, it, h[0] + (a.sx > 0 ? 1 : 0), h[1] + 1, sang, kid, facing);
  };
  // 胳膊是否压在身子前面
  const crossing = (a: Arm) => a.h[0] < -1 || a.e[0] < -1;
  const inFront = (a: Arm) => (a.behind ? !front : front || !crossing(a));
  const layer = (a: { arm: Arm; sx: number; jx: number }) => (inFront(a.arm) ? 1 : 0);

  const arms = [
    { a: armR, w: 'hr' as const },
    { a: armL, w: 'hl' as const },
  ];
  // 1) 身后的东西：身后的手、压在身后的球拍
  for (const { a } of arms) if (a.arm.item && a.arm.itemBehind === front) drawItem(a);
  for (const { a, w } of arms) if (!layer(a)) drawArm(a, w);
  for (const { a } of arms) if (a.arm.item && !layer(a) && a.arm.itemBehind === undefined) drawItem(a);

  // 2) 腿和鞋
  const legLen = b.leg;
  const drawLeg = (leg: Leg | undefined, side: -1 | 1) => {
    const lg = leg ?? { f: [0, legLen] as const };
    // 胯关节：正面右腿在左边
    const jx = side < 0 ? AX - b.hip / 2 : AX + b.hip / 2 - 1;
    const j: [number, number] = [jx, yHip + bob];
    const f: [number, number] = [jx + side * lg.f[0], yHip + lg.f[1]];
    const k: [number, number] = lg.k
      ? [jx + side * lg.k[0], yHip + bob + lg.k[1]]
      : [Math.round((j[0] + f[0]) / 2), Math.round((j[1] + f[1]) / 2)];
    const shorts = L.bottom === 'shorts' ? (kid ? 2 : 4) : L.bottom === 'skirt' ? 0 : 99;
    const sockH = L.socks === 'high' ? (kid ? 2 : 4) : L.socks === 'none' ? 0 : 1;
    const total = Math.max(1, f[1] - j[1]);
    const mat = (len: number): Mat => {
      if (len >= total - sockH + 1 && sockH > 0 && L.bottom !== 'pants' && L.bottom !== 'leggings') return 'W';
      if (len < shorts) return 'B';
      return 'S';
    };
    const thigh = kid ? 3 : 4;
    const shin = kid ? 2 : 3;
    const wf = (t: number) => (t < 0.5 ? thigh : shin);
    // 腿外侧对齐：右腿（画面左）从左往右排，左腿从右往左
    const align = side < 0 ? 'lo' : 'hi';
    let len = limb(g, j, k, (t) => wf(t * 0.5), mat, 0, align);
    len = limb(g, k, f, (t) => (t < 0.2 ? thigh - 1 : shin), mat, len - 1, align);
    // 护膝戴在右膝：正面是画面左边那条腿，背面是右边那条
    if (L.extras?.includes('kneebrace') && (front ? side < 0 : side > 0)) {
      for (let x = 0; x < shin; x++) {
        const xx = side < 0 ? k[0] + x : k[0] - x;
        g.set(xx, k[1], 'A', x === shin - 1 ? 2 : 1);
        g.set(xx, k[1] + 1, 'A', 2);
      }
    }
    // 鞋：正面鞋尖朝右下多出一格，背面只看到鞋跟
    const sx0 = side < 0 ? f[0] : f[0] - shin + 1;
    const shoeW = shin + (front ? 1 : 0);
    for (let r = 0; r < shoeH; r++)
      for (let x = 0; x < shoeW; x++) {
        const last = r === shoeH - 1;
        const m: Mat = L.shoe === 'sandal' && !last ? (x % 2 ? 'S' : 'F') : 'F';
        const t: Tone = last ? (x === shoeW - 1 ? 3 : 2) : x === 0 ? 0 : x === shoeW - 1 ? 2 : 1;
        if (!last && x === shoeW - 1 && front) continue;
        g.set(sx0 + x, f[1] + 1 + r, m, t);
      }
    if (L.shoe === 'sneaker' && !kid) g.set(sx0 + 1, f[1] + 1, 'W', 1);
  };
  drawLeg(P.lr, -1);
  drawLeg(P.ll, 1);
  // 3) 躯干、配饰
  const edge = torso(g, L, yT0, facing);
  extras(g, L, yT0, facing, edge);

  // 4) 脖子和头
  const head = front ? L.head.front : L.head.back;
  const hy = (b.hunch ?? 0) + (P.hy ?? 0);
  const fxs = AX - 3 + (P.hx ?? 0);
  const fys = yT0 - 1 - 6 + hy;
  for (let x = AX - 1; x <= AX + 1; x++) g.set(x, yT0 - 1 + Math.min(hy, 0), 'S', x === AX + 1 ? 2 : front ? 1 : 2);
  g.stamp(head.rows, fxs - head.fx, fys - head.fy);
  if (front && P.face && P.face !== 'n') setFace(g, fxs, fys, P.face);
  at.top = [fxs + 3, fys];
  at.mouth = [fxs + 4, fys + 4];
  // 下巴在衣领上投一道影
  if (front) for (let x = AX - 1; x <= AX + 1; x++) if (g.get(x, yT0) === 'S') g.setTone(x, yT0, 2);

  // 5) 身前的胳膊和东西
  for (const { a, w } of arms)
    if (layer(a)) {
      drawArm(a, w);
    }
  for (const { a } of arms) if (a.arm.item && layer(a) && a.arm.itemBehind === undefined) drawItem(a);
  for (const { a } of arms) if (a.arm.item && a.arm.itemBehind !== undefined && a.arm.itemBehind !== front) drawItem(a);

  P.fx?.(g, at);
  const art = bakeGrid(g, L.pal, AX, AY, {
    hand_r: at.hr,
    hand_l: at.hl,
    head_top: at.top,
    mouth: at.mouth,
  });
  return { art, at };
}
