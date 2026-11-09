/**
 * 方向 D「体型和姿态先行」的拼帧器：体型模板（腿长、躯干字符画、肩宽、臂长）+ 每人的头（字符画）
 * + 一帧的姿势（脚、胯、前倾、手的位置、手里的东西、表情）→ 一张 PixelArt（字符画，换色槽位 + 固定色）。
 *
 * 和 @td/iso 的人物约定一致：front = 脸朝画面右下，back = 背朝镜头朝右上；朝左由运行时水平翻转。
 * 两个朝向都"面朝 +x"，所以前倾、驼背、肚子都往右边凸，轮廓在两个朝向里都读得出。
 * 右手（拿拍子的手）是近侧手：front 在画面左边、back 在画面右边，画在躯干前面；左手在躯干后面。
 *
 * 画布固定 26×34，锚点 (13, 33) = 两脚中间、鞋底下面那一行（描边）。自动描边只描身体和带描边的道具，
 * 球拍和球画在描边之后（不描边，和现在的人一样）。
 */
import type { PixelArt } from '@td/iso';

export type Facing = 'front' | 'back';

export const CW = 26;
export const CH = 34;
export const AX = 13;
export const AY = 33;

/** 体型模板：同一个模板可以给不同的人（换头、换色、换道具），但每个主要人物都用自己的模板 */
export interface Template {
  readonly id: string;
  /** 胯到脚踝的行数（不含鞋） */
  readonly legLen: number;
  /** 腿宽 1 或 2 */
  readonly legW: number;
  /** 两腿中心离身体中线多远 */
  readonly hipHalf: number;
  /** 鞋长（往 +x 伸） */
  readonly shoeW: number;
  /** 下装从胯往下几行（≥ legLen 就是长裤） */
  readonly shorts: number;
  /** 鞋上面几行袜子 */
  readonly socks?: number;
  /** 躯干字符画（最后一行贴着胯），每行等宽 */
  readonly torso: { readonly front: readonly string[]; readonly back: readonly string[] };
  /** 肩膀在躯干第几行、离躯干左右边缘往里几列 */
  readonly shY: number;
  readonly shIn: number;
  /** 脖子几行 */
  readonly neck: number;
  /** 手臂长（肩到手） */
  readonly arm: number;
  /** 袖子长几格（从肩起） */
  readonly sleeve: number;
  /** 小腿的颜色（默认皮肤 S） */
  readonly legSlot?: string;
  /** 近腿膝盖上画护膝（字符），这条腿不弯 */
  readonly braceNear?: string;
}

/** 头：字符画，cx = 落在脖子正上方那一列，最后一行是下巴 */
export interface Head {
  readonly front: readonly string[];
  readonly back: readonly string[];
  readonly cx: number;
}

export type Expr = 'n' | 'blink' | 'happy' | 'angry' | 'sigh' | 'focus';
export type RacketDir = 'none' | 'down' | 'up' | 'l' | 'r' | 'ul' | 'ur' | 'dl' | 'dr';

export interface Pose {
  /** 胯的偏移（dy 负 = 往上） */
  hx: number;
  hy: number;
  /** 近脚、远脚：相对这条腿站直时的位置往 +x 挪几格、抬起几格 */
  fn: { x: number; lift: number };
  ff: { x: number; lift: number };
  /** 膝盖往前顶几格（弯腿） */
  knee: number;
  /** 躯干顶部比底部往右挪几格（前倾、驼背） */
  lean: number;
  /** 头相对躯干顶部的偏移（dy 正 = 缩进肩膀里） */
  headX: number;
  headY: number;
  /** 肩膀上下（耸肩、垂肩）；shN / shF 只动近侧 / 远侧 */
  shUp: number;
  shUpN?: number;
  shUpF?: number;
  /** 近手、远手相对各自肩膀的位置；elbow 是手肘相对两点中点的偏移 */
  hn: { x: number; y: number; ex?: number; ey?: number };
  hf: { x: number; y: number; ex?: number; ey?: number };
  racket: RacketDir;
  /** 手里的东西（近手 / 远手），名字见 PROPS */
  pn?: string;
  pf?: string;
  /** 球：相对近手 */
  ball?: { x: number; y: number };
  expr: Expr;
  /** 打开的附件（按人物定义的名字）：比如马尾甩起来 */
  flags?: readonly string[];
}

/** 一帧里附件能用的位置：头、躯干、手 */
export interface Joints {
  facing: Facing;
  /** 头的左上角 */
  head: { x: number; y: number; w: number; h: number };
  /** 躯干左上角（顶行，已经算上 lean） */
  torso: { x: number; y: number; w: number; h: number };
  hipY: number;
  handN: { x: number; y: number };
  handF: { x: number; y: number };
  footN: { x: number; y: number };
  footF: { x: number; y: number };
  /** 近侧肩、远侧肩 */
  shN: { x: number; y: number };
  shF: { x: number; y: number };
  pose: Pose;
}

/** 附件：在某一层画一张小字符画（'.' 透明） */
export interface Attachment {
  readonly layer: 'back' | 'mid' | 'front' | 'top';
  /** 返回 null = 这一帧不画 */
  readonly draw: (j: Joints) => { rows: readonly string[]; x: number; y: number } | null;
}

export interface Rig {
  readonly tpl: Template;
  readonly head: Head;
  readonly pal: Readonly<Record<string, string>>;
  readonly attach?: readonly Attachment[];
}

export const BASE_POSE: Pose = {
  hx: 0,
  hy: 0,
  fn: { x: 0, lift: 0 },
  ff: { x: 0, lift: 0 },
  knee: 0,
  lean: 0,
  headX: 0,
  headY: 0,
  shUp: 0,
  hn: { x: 0, y: 99 },
  hf: { x: 0, y: 99 },
  racket: 'none',
  expr: 'n',
};

/** 手持小道具：字符画 + 握点（手的那一格） */
export const PROPS: Record<string, { rows: readonly string[]; gx: number; gy: number; outline: boolean }> = {
  phone: { rows: ['11', '12', '12'], gx: 0, gy: 2, outline: true },
  phoneUp: { rows: ['12', '12', '11'], gx: 0, gy: 0, outline: true },
  clip: { rows: ['333', '3W3', '3W3', '333'], gx: 0, gy: 2, outline: true },
  cup: { rows: ['WW', 'ww'], gx: 0, gy: 0, outline: true },
  pliers: { rows: ['G.G', '.G.', 'GG.'], gx: 1, gy: 1, outline: false },
  phoneUp2: { rows: ['21', '12', '11'], gx: 0, gy: 0, outline: true },
  bag: { rows: ['.N.N', 'NNNN', 'NNNN', 'nnnn'], gx: 1, gy: 0, outline: true },
  ball: { rows: ['A'], gx: 0, gy: 0, outline: false },
  camera: { rows: ['111', '121'], gx: 1, gy: 1, outline: true },
};

/** 拄地的长杆：杆子从手上 above 格一直到地面，底下是 foot（最后一行贴着鞋底那一行） */
export const STICKS: Record<
  string,
  {
    shaft: string;
    dx: number;
    above: number;
    foot: readonly string[];
    fgx: number;
    top?: { rows: readonly string[]; gx: number };
  }
> = {
  cane: { shaft: 'G', dx: 1, above: 0, foot: ['g'], fgx: 0, top: { rows: ['GG'], gx: 1 } },
  broom: { shaft: 'D', dx: 0, above: 3, foot: ['MMM', 'MmM'], fgx: 1 },
  rake: { shaft: 'D', dx: 0, above: 2, foot: ['GGGGG', 'G.G.G'], fgx: 2 },
};

type Grid = string[][];

function blank(): Grid {
  return Array.from({ length: CH }, () => Array.from({ length: CW }, () => '.'));
}

function put(g: Grid, x: number, y: number, ch: string, onlyEmpty = false): void {
  if (x < 0 || y < 0 || x >= CW || y >= CH || ch === '.' || ch === ' ') return;
  const row = g[y] as string[];
  if (onlyEmpty && row[x] !== '.') return;
  row[x] = ch;
}

function stamp(g: Grid, rows: readonly string[], x0: number, y0: number, onlyEmpty = false): void {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j] as string;
    for (let i = 0; i < r.length; i++) put(g, x0 + i, y0 + j, r[i] as string, onlyEmpty);
  }
}

/** 整数直线（Bresenham），每格回调 t（0..1） */
function line(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number, t: number) => void): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const n = Math.max(dx, -dy) || 1;
  let i = 0;
  for (;;) {
    fn(x0, y0, i / n);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    i++;
  }
}

/** 表情：在头的字符画上改眼睛（E）和嘴（7） */
function faceRows(rows: readonly string[], expr: Expr): string[] {
  const g = rows.map((r) => r.split(''));
  const eyes: [number, number][] = [];
  const mouth: [number, number][] = [];
  g.forEach((r, y) => {
    r.forEach((c, x) => {
      if (c === 'E') eyes.push([x, y]);
      if (c === '7') mouth.push([x, y]);
    });
  });
  const at = (x: number, y: number) => g[y]?.[x];
  const set = (x: number, y: number, c: string) => {
    const r = g[y];
    if (r && r[x] !== undefined && r[x] !== '.') r[x] = c;
  };
  if (expr === 'blink' || expr === 'sigh') for (const [x, y] of eyes) set(x, y, 's');
  if (expr === 'sigh') for (const [x, y] of mouth) set(x, y, '6');
  if (expr === 'happy') {
    for (const [x, y] of eyes) {
      set(x, y, 's');
      if (at(x, y - 1) === 'S') set(x, y - 1, 'E');
    }
    for (const [x, y] of mouth) {
      set(x, y, '6');
      if (at(x - 1, y) === 'S' || at(x - 1, y) === 'W') set(x - 1, y, '7');
      if (at(x + 1, y) === 'S' || at(x + 1, y) === 'W') set(x + 1, y, '7');
    }
  }
  if (expr === 'angry') {
    for (const [x, y] of eyes) if (at(x, y - 1) === 'S' || at(x, y - 1) === 'H') set(x, y - 1, '5');
    for (const [x, y] of mouth) {
      set(x, y, '7');
      if (at(x - 1, y) === 'S') set(x - 1, y, '7');
    }
  }
  if (expr === 'focus') for (const [x, y] of eyes) if (at(x, y - 1) === 'S') set(x, y - 1, '5');
  return g.map((r) => r.join(''));
}

function racketRows(dir: RacketDir): { rows: string[]; gx: number; gy: number } | null {
  // 拍面 3×4 的圈（中间镂空透出地面 = 拍线），拍柄 2 格
  switch (dir) {
    case 'down':
      return { rows: ['Q', 'Q', 'QQQ', 'Q.Q', 'Q.Q', 'QQQ'].map((r, i) => (i < 2 ? `.${r}.` : r)), gx: 1, gy: -1 };
    case 'up':
      return { rows: ['QQQ', 'Q.Q', 'Q.Q', 'QQQ', '.Q.', '.Q.'], gx: 1, gy: 6 };
    case 'l':
      return { rows: ['QQQQ...', 'Q..QQQ.', 'QQQQ...'], gx: 7, gy: 1 };
    case 'r':
      return { rows: ['...QQQQ', '.QQQ..Q', '...QQQQ'], gx: -1, gy: 1 };
    case 'ul':
      return { rows: ['.QQ...', 'Q..Q..', 'Q..Q..', '.QQQ..', '....Q.', '.....Q'], gx: 6, gy: 6 };
    case 'ur':
      return { rows: ['...QQ.', '..Q..Q', '..Q..Q', '..QQQ.', '.Q....', 'Q.....'], gx: -1, gy: 6 };
    case 'dl':
      return { rows: ['.....Q', '....Q.', '.QQQ..', 'Q..Q..', 'Q..Q..', '.QQ...'], gx: 6, gy: -1 };
    case 'dr':
      return { rows: ['Q.....', '.Q....', '..QQQ.', '..Q..Q', '..Q..Q', '...QQ.'], gx: -1, gy: -1 };
    default:
      return null;
  }
}

/** 一帧：姿势 → 字符画 */
export function compose(rig: Rig, facing: Facing, pose: Pose): PixelArt {
  const { tpl, head } = rig;
  const g = blank();
  const pts: Record<string, [number, number]> = {};
  const torsoArt = tpl.torso[facing];
  const tw = (torsoArt[0] as string).length;
  const th = torsoArt.length;

  const hipY = AY - 1 - tpl.legLen + pose.hy; // 第一行腿
  const cx = AX + pose.hx; // 中线右边那一列
  const footY = AY - 1; // 鞋那一行

  /* ---- 腿：近腿（右腿）和远腿 ---- */
  const cx0 = AX;
  const leftHip = (c: number) => c - tpl.hipHalf - (tpl.legW - 1);
  const rightHip = (c: number) => c + tpl.hipHalf - 1;
  // front：右腿（近）在画面左边；back：右腿在画面右边
  const nearLeft = facing === 'front';
  const legs = [
    {
      foot: pose.ff,
      near: false,
      hip: nearLeft ? rightHip(cx) : leftHip(cx),
      base: nearLeft ? rightHip(cx0) : leftHip(cx0),
    },
    {
      foot: pose.fn,
      near: true,
      hip: nearLeft ? leftHip(cx) : rightHip(cx),
      base: nearLeft ? leftHip(cx0) : rightHip(cx0),
    },
  ];
  const feet: { x: number; y: number }[] = [];
  for (const L of legs) {
    const fy = footY - L.foot.lift;
    const fx = L.base + L.foot.x;
    const ankleY = fy - 1;
    const kneeY = Math.round((hipY + ankleY) / 2);
    const kneeX = Math.round((L.hip + fx) / 2) + (L.near || !tpl.braceNear ? pose.knee : 0);
    const legLen = ankleY - hipY + 1;
    const seg = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++) {
        const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
        const x = Math.round(x0 + (x1 - x0) * t);
        const row = y - hipY;
        const fromBottom = ankleY - y;
        let ch = row < tpl.shorts ? 'B' : (tpl.legSlot ?? 'S');
        if (tpl.socks && fromBottom < tpl.socks && row >= tpl.shorts) ch = 'K';
        if (tpl.shorts >= legLen) ch = 'B';
        if (L.near && tpl.braceNear && y === kneeY) ch = tpl.braceNear;
        for (let w = 0; w < tpl.legW; w++) {
          const dark = !L.near || (tpl.legW > 1 && w === tpl.legW - 1);
          put(g, x + w, y, dark ? ch.toLowerCase() : ch);
        }
      }
    };
    seg(L.hip, hipY, kneeX, kneeY);
    seg(kneeX, kneeY + 1, fx, ankleY);
    // 鞋：脚后跟在腿下，鞋尖往 +x
    for (let i = 0; i < tpl.shoeW; i++) put(g, fx + i, fy, L.near ? 'F' : 'f');
    feet.push({ x: fx, y: fy });
  }

  /* ---- 躯干（按 lean 斜切）、肩、头的位置 ---- */
  const tTop = hipY - th;
  const tLeft = cx - Math.floor(tw / 2);
  const shear = (row: number) => (th <= 1 ? 0 : Math.round((pose.lean * (th - 1 - row)) / (th - 1)));
  const shY = tTop + tpl.shY - pose.shUp;
  const shLeft = { x: tLeft + tpl.shIn - 1 + shear(tpl.shY), y: shY };
  const shRight = { x: tLeft + tw - tpl.shIn + shear(tpl.shY), y: shY };
  const shN = facing === 'front' ? shLeft : shRight;
  const shF = facing === 'front' ? shRight : shLeft;
  shN.y -= pose.shUpN ?? 0;
  shF.y -= pose.shUpF ?? 0;
  const hand = (sh: { x: number; y: number }, h: Pose['hn']) => {
    const y = h.y === 99 ? sh.y + tpl.arm : sh.y + h.y;
    return { x: sh.x + h.x, y };
  };
  const handN = hand(shN, pose.hn);
  const handF = hand(shF, pose.hf);
  const headRows = faceRows(head[facing], pose.expr);
  const hw = (headRows[0] as string).length;
  const hh = headRows.length;
  const headX = tLeft + Math.floor(tw / 2) - head.cx + shear(0) + pose.headX + (facing === 'back' ? 0 : 0);
  const headY = tTop - tpl.neck - hh + pose.headY;

  const joints: Joints = {
    facing,
    head: { x: headX, y: headY, w: hw, h: hh },
    torso: { x: tLeft + shear(0), y: tTop, w: tw, h: th },
    hipY,
    handN,
    handF,
    footN: feet[1] as { x: number; y: number },
    footF: feet[0] as { x: number; y: number },
    shN,
    shF,
    pose,
  };
  const layer = (name: Attachment['layer']) => {
    for (const a of rig.attach ?? []) {
      if (a.layer !== name) continue;
      const r = a.draw(joints);
      if (r) stamp(g, r.rows, r.x, r.y);
    }
  };

  const arm = (sh: { x: number; y: number }, hd: { x: number; y: number }, h: Pose['hn'], near: boolean) => {
    const ex = Math.round((sh.x + hd.x) / 2) + (h.ex ?? 0);
    const ey = Math.round((sh.y + hd.y) / 2) + (h.ey ?? 0);
    let k = 0;
    const paint = (x: number, y: number) => {
      const cur = g[y]?.[x];
      const sleeve = k < tpl.sleeve;
      let ch = sleeve ? 'L' : 'S';
      // 压在躯干上的手臂用暗面，读得出手臂在身前
      if (cur && cur !== '.' && near) ch = sleeve ? 'l' : 'S';
      if (!near) ch = ch.toLowerCase();
      put(g, x, y, ch);
      k++;
    };
    const seen = new Set<string>();
    const once = (x: number, y: number) => {
      const key = `${x},${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      paint(x, y);
    };
    line(sh.x, sh.y, ex, ey, once);
    line(ex, ey, hd.x, hd.y, once);
  };

  layer('back');
  // 远手在躯干后面
  arm(shF, handF, pose.hf, false);
  // 躯干
  for (let j = 0; j < th; j++) {
    const r = torsoArt[j] as string;
    const off = shear(j);
    for (let i = 0; i < r.length; i++) put(g, tLeft + i + off, tTop + j, r[i] as string);
  }
  // 脖子
  for (let j = 0; j < tpl.neck; j++) {
    const nx = tLeft + Math.floor(tw / 2) - 1 + shear(0) + Math.round(pose.headX / 2);
    put(g, nx, tTop - 1 - j, 'S');
    put(g, nx + 1, tTop - 1 - j, 's');
  }
  layer('mid');
  stamp(g, headRows, headX, headY);
  layer('top');
  // 近手在身前
  arm(shN, handN, pose.hn, true);
  // 手里的东西（带描边的）
  const held: { name: string; at: { x: number; y: number } }[] = [];
  if (pose.pn) held.push({ name: pose.pn, at: handN });
  if (pose.pf) held.push({ name: pose.pf, at: handF });
  for (const h of held) {
    const st = STICKS[h.name];
    if (st) {
      // 拄地的长杆（拐杖、扫帚、耙子）：从手往下一直画到地面
      const x = h.at.x + st.dx;
      const end = footY - st.foot.length;
      for (let y = h.at.y - st.above; y <= end; y++) put(g, x, y, st.shaft);
      if (st.top) stamp(g, st.top.rows, x - st.top.gx, h.at.y - st.above - st.top.rows.length);
      stamp(g, st.foot, x - st.fgx, end + 1);
      continue;
    }
    const p = PROPS[h.name];
    if (p?.outline) stamp(g, p.rows, h.at.x - p.gx, h.at.y - p.gy);
  }
  layer('front');

  /* ---- 自动描边（四邻） ---- */
  const out = g.map((r) => r.slice());
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      if (g[y]?.[x] !== '.') continue;
      const n =
        (g[y - 1]?.[x] ?? '.') !== '.' ||
        (g[y + 1]?.[x] ?? '.') !== '.' ||
        (g[y]?.[x - 1] ?? '.') !== '.' ||
        (g[y]?.[x + 1] ?? '.') !== '.';
      if (n) (out[y] as string[])[x] = 'O';
    }
  // 不描边的道具、球拍、球
  for (const h of held) {
    const p = PROPS[h.name];
    if (p && !p.outline) stamp(out, p.rows, h.at.x - p.gx, h.at.y - p.gy, true);
  }
  const rk = racketRows(pose.racket);
  if (rk) stamp(out, rk.rows, handN.x - rk.gx + (rk.gx === -1 ? 0 : 0), handN.y - rk.gy, true);
  if (pose.ball) put(out, handN.x + pose.ball.x, handN.y + pose.ball.y, 'A', true);

  pts.hand_r = [handN.x, handN.y];
  pts.hand_l = [handF.x, handF.y];
  pts.head_top = [headX + head.cx, headY];
  return { rows: out.map((r) => r.join('')), ox: AX, oy: AY, pal: rig.pal, pts };
}

/** 黑剪影：所有不透明像素换成一个颜色（轮廓测试） */
export function silhouette(a: PixelArt): PixelArt {
  return { ...a, rows: a.rows.map((r) => r.replace(/[^.]/g, '0')), pal: { ...a.pal, '0': '#0d0d12' } };
}
