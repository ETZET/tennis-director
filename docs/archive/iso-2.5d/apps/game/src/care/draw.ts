import {
  bakeArt,
  Custom,
  type DrawContext,
  hash,
  type IsoWorld,
  mixP,
  type Node,
  type Person,
  type Raster,
  V3,
} from '@td/iso';
import { LITTER_ART } from './art';
import type { CareModel, Tool } from './model';

/**
 * 亲手扫的画面层（全部是 @td/iso 的软件光栅，从 sandbox demo 06 第二轮搬过来）：
 * - 场面叠层（Custom）：沙、积水 / 湿泥、裂缝 / 干裂、褪色的线、画歪的线、引导线、球和垃圾，
 *   逐像素反投影到场地格子上画在真地面上（地面贴图不动：扫开沙露出来的就是这块场现在的样子）；
 * - 球网（Custom，张力连续变化）；手里的工具（扫把、推水、压路滚、画线车、水管）；画线的准星。
 * 只读 CareModel 和演出状态，不改数。
 */

export interface OverlayState {
  tool: Tool | null;
  /** 正在描的线（-1 没有） */
  lock: number;
  /** 演出时间（引导线闪烁） */
  t: number;
  /** 选了画线车：没画的线闪金色 */
  guide: boolean;
}

const HEX = {
  sand: '#e9c999',
  sand2: '#dfba86',
  sand3: '#f2d8ad',
  sandD: '#d6ae78',
  peb: '#c9a676',
  crack: '#2c3442',
  crackC: '#7a3a22',
  dry: '#e8c9a4',
  dryC: '#f4e2c8',
  faded: '#b3aa9a',
  fadedC: '#c4653a',
  white: '#f6f3ea',
  wobble: '#dcd6c6',
  mud: '#cdb88f',
  wet: '#7a2e1c',
  puddleC: '#6a3a2a',
  puddle: '#86c2e0',
  sheen: '#a9d4e8',
  glint: '#e8f8ff',
  gold: '#ffd84a',
  lock: '#fff3b0',
  ink: '#2a2238',
} as const;
type HexKey = keyof typeof HEX;

/** 场地四角的世界外包框 */
function bounds(m: CareModel): { x0: number; x1: number; z0: number; z1: number } {
  const G = m.G;
  const pts = [m.world(-G.hx, -G.hz), m.world(G.hx, -G.hz), m.world(-G.hx, G.hz), m.world(G.hx, G.hz)];
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    x1: Math.max(...pts.map((p) => p.x)),
    z0: Math.min(...pts.map((p) => p.z)),
    z1: Math.max(...pts.map((p) => p.z)),
  };
}

/** 场面叠层 */
export function createOverlay(m: CareModel, st: OverlayState): Custom {
  const N = m.N;
  const colA = new Uint32Array(N);
  const amtA = new Float32Array(N);
  const arts = LITTER_ART.map((a) => bakeArt(a));
  const P = {} as Record<HexKey, number>;
  const b = bounds(m);
  const node = new Custom(
    (r: DrawContext) => {
      const R = r as unknown as Raster;
      const lit = r.litAt(m.G.ox, m.G.oz);
      for (const k of Object.keys(HEX) as HexKey[]) P[k] = r.col(HEX[k], 1, lit);
      buildCells(m, st, P, colA, amtA);
      blit(R, m, colA, amtA, b);
      for (const it of m.litter) {
        if (it.taken) continue;
        const w = m.world(it.u, it.v);
        r.art(arts[it.kind] as ReturnType<typeof bakeArt>, w.x, 0.02, w.z, { lit });
      }
    },
    { x0: b.x0, x1: b.x1, y0: 0, y1: 0.02, z0: b.z0, z1: b.z1 },
  );
  node.renderOrder = -1000;
  return node;
}

function buildCells(
  m: CareModel,
  st: OverlayState,
  P: Record<HexKey, number>,
  colA: Uint32Array,
  amtA: Float32Array,
): void {
  const { nx, nz, sand, rough, crack, wet, stray, segOf, segNear, segP, segs, inside } = m;
  const clay = m.clay;
  const blink = Math.floor(st.t * 5);
  /** 沙下面那一层：线、引导线、画歪的线、积水、裂缝 */
  const under = (c: number, i: number, j: number): void => {
    const sg = segOf[c] as number;
    // 引导线两边描一圈暗边，金线在手机上也看得清
    if (sg < 0 && st.guide && stray[c] === 0) {
      const sn = segNear[c] as number;
      const cv = sn >= 0 ? (segs[sn]?.cov[segP[c] as number] ?? 0) : 0;
      if (sn >= 0 && (cv === 1 || cv === 4)) {
        colA[c] = P.ink;
        amtA[c] = sn === st.lock ? 0.55 : 0.4;
        return;
      }
    }
    if (sg >= 0) {
      const g = segs[sg];
      const k = segP[c] as number;
      const cv = g?.cov[k] ?? 0;
      if (cv === 2 || cv === 3) {
        colA[c] = cv === 2 ? P.white : P.wobble;
        amtA[c] = 1;
        return;
      }
      if (cv === 4) {
        colA[c] = P.mud;
        amtA[c] = 1;
        return;
      }
      if (cv === 1) {
        if (st.guide) {
          colA[c] = sg === st.lock ? P.lock : P.gold;
          amtA[c] = sg === st.lock ? 0.85 : ((k + blink) & 7) < 5 ? 1 : 0.55;
          return;
        }
        // 褪了：硬地发灰、断续；红土被红土盖住
        colA[c] = clay ? P.fadedC : P.faded;
        amtA[c] = clay ? 0.88 : hash(i, j, 81) < 0.3 ? 0.95 : 0.72;
        return;
      }
    }
    if (stray[c]) {
      colA[c] = stray[c] === 1 ? P.white : P.mud;
      amtA[c] = 1;
      return;
    }
    const w = wet[c] as number;
    if (w > 0.02) {
      if (clay) {
        if (w > 0.95) {
          colA[c] = hash(i, j, 79) < 0.06 ? P.glint : P.puddleC;
          amtA[c] = 1;
        } else {
          colA[c] = P.wet;
          amtA[c] = 0.12 + Math.min(1, w) * 0.7;
        }
      } else if (w > 0.5) {
        colA[c] = hash(i, j, 79) < 0.05 ? P.glint : P.puddle;
        amtA[c] = 0.8;
      } else {
        colA[c] = P.sheen;
        amtA[c] = 0.2 + w * 0.7;
      }
      return;
    }
    const rf = rough[c] as number;
    if (rf > 0.02) {
      if (clay) {
        colA[c] = crack[c] ? P.crackC : P.dry;
        amtA[c] = crack[c] ? Math.min(0.9, rf) : Math.min(0.75, rf * 0.85);
        if (!crack[c] && hash(i, j, 83) < 0.12) colA[c] = P.dryC;
      } else if (crack[c]) {
        colA[c] = P.crack;
        amtA[c] = Math.min(1, rf * 1.1);
      } else {
        const dn = j < nz - 1 ? (rough[c + nx] as number) : rf;
        if (rf - dn > 0.12) {
          colA[c] = P.ink;
          amtA[c] = Math.min(0.35, rf * 0.4);
        } else {
          colA[c] = P.faded;
          amtA[c] = Math.min(0.62, rf * 0.75);
        }
      }
    }
  };
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      amtA[c] = 0;
      if (!inside[c]) continue;
      const s = sand[c] as number;
      // 厚沙整格盖住：朝北的坡亮、朝南的坡暗，偶尔一颗石子
      if (s >= 0.55) {
        const up = j > 0 ? (sand[c - nx] as number) : s;
        const dn = j < nz - 1 ? (sand[c + nx] as number) : s;
        const lf = i > 0 ? (sand[c - 1] as number) : s;
        let col = P.sand;
        if (s - up > 0.22 || s - lf > 0.3) col = P.sand3;
        else if (s - dn > 0.22) col = P.sand2;
        else if (s > 1.6) col = P.sandD;
        if (hash(i, j, 78) > 0.985) col = P.peb;
        colA[c] = col;
        amtA[c] = 1;
        continue;
      }
      under(c, i, j);
      // 薄沙：按厚度把沙色盖上去（四档），下面的线和坑透出来
      if (s > 0.05) {
        const a = Math.min(0.92, Math.round(((s - 0.05) / 0.5) * 4 + hash(i, j, 77) * 0.9 - 0.45) / 4 + 0.18);
        const am = amtA[c] as number;
        if (am >= 1) colA[c] = mixP(colA[c] as number, P.sand, a);
        else {
          colA[c] = am > 0 ? mixP(P.sand, colA[c] as number, am * (1 - a)) : P.sand;
          amtA[c] = Math.max(a, am);
        }
      }
    }
}

/** 逐像素：反投影到地面 → 场地局部坐标 → 格子 → 混色。被前面的灯杆挡住的像素不画（深度缓冲） */
function blit(
  R: Raster,
  m: CareModel,
  colA: Uint32Array,
  amtA: Float32Array,
  b: { x0: number; x1: number; z0: number; z1: number },
): void {
  const pr = R.proj;
  const buf = R.buf;
  const dep = R.depth;
  const W = R.W;
  const H = R.H;
  let sx0 = Number.POSITIVE_INFINITY;
  let sx1 = Number.NEGATIVE_INFINITY;
  let sy0 = Number.POSITIVE_INFINITY;
  let sy1 = Number.NEGATIVE_INFINITY;
  for (const [x, z] of [
    [b.x0, b.z0],
    [b.x1, b.z0],
    [b.x0, b.z1],
    [b.x1, b.z1],
  ] as const) {
    const [a, c] = pr.P(x, 0, z);
    sx0 = Math.min(sx0, a);
    sx1 = Math.max(sx1, a);
    sy0 = Math.min(sy0, c);
    sy1 = Math.max(sy1, c);
  }
  const X0 = Math.max(0, Math.floor(sx0));
  const X1 = Math.min(W - 1, Math.ceil(sx1));
  const Y0 = Math.max(0, Math.floor(sy0));
  const Y1 = Math.min(H - 1, Math.ceil(sy1));
  // 反投影和场地旋转都是仿射的：一行里按固定增量走
  const o0 = pr.unP(0.5, 0.5, 0);
  const o1 = pr.unP(1.5, 0.5, 0);
  const o2 = pr.unP(0.5, 1.5, 0);
  const l0 = m.local(o0[0], o0[1]);
  const l1 = m.local(o1[0], o1[1]);
  const l2 = m.local(o2[0], o2[1]);
  const axu = l1.u - l0.u;
  const axv = l1.v - l0.v;
  const ayu = l2.u - l0.u;
  const ayv = l2.v - l0.v;
  const d0 = pr.depth(o0[0], o0[1]);
  const dX = pr.depth(o1[0], o1[1]) - d0;
  const dY = pr.depth(o2[0], o2[1]) - d0;
  const inv = 1 / 0.2;
  const { nx, nz, u0, v0 } = m;
  for (let sy = Y0; sy <= Y1; sy++) {
    let u = l0.u + axu * X0 + ayu * sy;
    let v = l0.v + axv * X0 + ayv * sy;
    let d = d0 + dX * X0 + dY * sy;
    let o = sy * W + X0;
    for (let sx = X0; sx <= X1; sx++, o++, u += axu, v += axv, d += dX) {
      const i = Math.floor((u - u0) * inv);
      const j = Math.floor((v - v0) * inv);
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const c = j * nx + i;
      const a = amtA[c] as number;
      if (a <= 0) continue;
      if (dep && (dep[o] as number) > d + 0.3) continue;
      buf[o] = a >= 1 ? (colA[c] as number) : mixP(buf[o] as number, colA[c] as number, a);
    }
  }
}

/* ---------------- 剖开前面的围网、藏掉场上的网 ---------------- */

/**
 * 干活时把这块场朝镜头那两边（南、东；镜头转角是 0）的围网藏起来，手下的沙和线不被铁丝网挡住；
 * hideNet：场景构建里这块场的球网也藏掉（小游戏自己画能拉的网）。返回藏掉的节点（还原时 visible = true）、网藏没藏到。
 */
export function hideAround(w: IsoWorld, m: CareModel, hideNet: boolean): { nodes: Node[]; net: boolean } {
  const G = m.G;
  const b = bounds(m);
  const zs = b.z1 + 0.05;
  const xs = b.x1 + 0.05;
  const W = netHalf(m);
  const hidden: Node[] = [];
  let net = false;
  w.statics.traverse((n: Node) => {
    if (n.kind !== 'custom' || !n.visible) return;
    const bb = (n as Custom).bounds;
    if (bb.y1 >= 2.9 && bb.y1 <= 3.1) {
      const south = Math.abs(bb.z1 - zs) < 1e-3 && bb.z1 - bb.z0 < 0.2 && bb.x0 >= b.x0 - 0.1 && bb.x1 <= b.x1 + 0.1;
      const east = Math.abs(bb.x1 - xs) < 1e-3 && bb.x1 - bb.x0 < 0.2 && bb.z0 >= b.z0 - 0.1 && bb.z1 <= b.z1 + 0.1;
      if (south || east) {
        n.visible = false;
        hidden.push(n);
        return;
      }
    }
    if (
      hideNet &&
      Math.abs(bb.x0 - (G.ox - 0.05)) < 1e-6 &&
      Math.abs(bb.z0 - (G.oz - W)) < 1e-6 &&
      Math.abs(bb.z1 - (G.oz + W)) < 1e-6
    ) {
      n.visible = false;
      hidden.push(n);
      net = true;
    }
  });
  w.view.invalidate();
  return { nodes: hidden, net };
}

/* ---------------- 球网 ---------------- */

/** 球网半长（和 build.ts 的 net 一致：匹克球场 3.05 + 0.3，网球场 5.485 + 0.9） */
const netHalf = (m: CareModel): number => m.dims.Wd + (m.surface === 'pickleball' ? 0.3 : 0.9);

export interface NetView {
  /** 0..1.05 张力 */
  t: number;
  /** 抖动（刚松手、阵风） */
  wob: number;
}

/** 球网（照 site/indian-wells/build.ts 的 net：两根柱子、网面棋盘格、白色网带；张力决定中间塌多少）。只画不转的场地 */
export function createNet(m: CareModel, nv: NetView): Custom {
  const G = m.G;
  const x = G.ox;
  const W = netHalf(m);
  const za = G.oz - W;
  const zb = G.oz + W;
  const h = m.surface === 'pickleball' ? 0.86 : 1.0;
  type Pt = [number, number, number];
  return new Custom(
    (r: DrawContext) => {
      const lit = r.litAt(x, G.oz);
      const pc = r.col('#2a2d33', 1, lit);
      const pw = Math.max(1, Math.round(r.k * 0.25));
      r.wline([x, 0, za], [x, h, za], pc, pw);
      r.wline([x, 0, zb], [x, h, zb], pc, pw);
      const t = Math.min(1, nv.t);
      const sag = (1 - t) * 0.8 + 0.06;
      const wob = Math.sin(r.t * 30) * nv.wob * 0.12;
      const N = 10;
      const top: Pt[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        top.push([x, h - (sag + wob) * Math.sin(u * Math.PI), za + (zb - za) * u]);
      }
      const nc = r.col('#1d2026', 1, lit);
      const pts: Pt[] = [[x, 0.05, za], [x, 0.05, zb], ...top.slice().reverse()];
      r.wpoly(pts, 0, (px, py) => ((px + py) & 1 ? nc : 0));
      const tc = r.col(nv.t > 1 ? '#ff8a6b' : '#f6f3ea', 1, lit);
      for (let i = 0; i < N; i++) r.wline(top[i] as Pt, top[i + 1] as Pt, tc);
    },
    { x0: x - 0.05, x1: x + 0.05, y0: 0, y1: h + 0.1, z0: za, z1: zb },
  );
}

/* ---------------- 手里的工具 ---------------- */

export interface ToolView {
  tool: Tool | null;
  /** 工具头的世界位置、推的方向（世界） */
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** 拿着的人（手柄从手画到工具头） */
  who: Person | null;
  on: boolean;
  /** 工具头的半宽（米） */
  r: number;
}

const _hand = new V3();

export function createTool(tv: ToolView): Custom {
  const node = new Custom(
    (r: DrawContext) => {
      if (!tv.on || !tv.tool || tv.tool === 'net' || tv.tool === 'pick') return;
      const lit = r.litAt(tv.x, tv.z);
      const x = tv.x;
      const z = tv.z;
      const px = -tv.dz;
      const pz = tv.dx;
      let hy = 0.9;
      if (tv.who) {
        tv.who.handR.getWorldPosition(_hand);
        hy = _hand.y;
      }
      const hx = tv.who ? _hand.x : x - tv.dx * 0.8;
      const hz = tv.who ? _hand.z : z - tv.dz * 0.8;
      const near = Math.hypot(hx - x, hz - z) < 2.2;
      const wood = r.col('#8a6a45', 1, lit);
      if (tv.tool === 'broom' || tv.tool === 'squeegee') {
        const w = tv.r * 0.75;
        const sq = tv.tool === 'squeegee';
        r.wline(
          [x - px * w, 0.05, z - pz * w],
          [x + px * w, 0.05, z + pz * w],
          r.col(sq ? '#2a2d33' : '#4a3020', 1, lit),
          2,
        );
        r.wline(
          [x - px * w, 0.14, z - pz * w],
          [x + px * w, 0.14, z + pz * w],
          r.col(sq ? '#f2b134' : '#e5b33b', 1, lit),
          Math.max(2, Math.round(r.k * (sq ? 0.1 : 0.16))),
        );
        if (near) r.wline([x, 0.16, z], [hx, hy, hz], wood, 1);
      } else if (tv.tool === 'roller') {
        const w = tv.r * 0.8;
        const y = 0.28;
        const th = Math.max(3, Math.round(r.k * 0.5));
        r.wline([x - px * w, y, z - pz * w], [x + px * w, y, z + pz * w], r.col('#5d5a57', 1, lit), th + 2);
        r.wline([x - px * w, y, z - pz * w], [x + px * w, y, z + pz * w], r.col('#9a9894', 1, lit), th);
        r.wline([x - px * w, y + 0.14, z - pz * w], [x + px * w, y + 0.14, z + pz * w], r.col('#d4d0c8', 1, lit), 1);
        if (near) r.wline([x - tv.dx * 0.2, 0.4, z - tv.dz * 0.2], [hx, hy, hz], r.col('#3b3f46', 1, lit), 1);
      } else if (tv.tool === 'paint') {
        const s = 0.2;
        r.box(x - s, x + s, z - s, z + s, 0.1, 0.42, '#d94a3a', { lit, top: '#f6f3ea' });
        r.wline([x - 0.22, 0.06, z], [x + 0.22, 0.06, z], r.col('#2a2d33', 1, lit), 2);
        if (near) r.wline([x, 0.42, z], [hx, hy, hz], r.col('#3b3f46', 1, lit), 1);
      } else if (tv.tool === 'water') {
        // 水管：从手里喷出一道弧
        const bc = r.col('#4fc3d9', 1, lit);
        for (let i = 0; i <= 6; i++) {
          const u = i / 6;
          const y = hy * (1 - u) + Math.sin(u * Math.PI) * 0.35;
          const [sx, sy] = r.P(hx + (x - hx) * u, y, hz + (z - hz) * u);
          r.rect(Math.round(sx), Math.round(sy), 1, 1, bc);
        }
      }
    },
    { x0: -1, x1: 1, y0: 0, y1: 1.2, z0: -1, z1: 1 },
  );
  node.renderOrder = 0.05;
  return node;
}

/** 画线的准星：画在笔尖（手指上方），一条虚线连到手指 */
export interface Reticle {
  on: boolean;
  /** 笔尖的世界点、手指的缓冲像素 */
  x: number;
  z: number;
  fx: number;
  fy: number;
  /** 0 正好、1 有点抖、2 歪了 */
  q: number;
}

export function createReticle(rt: Reticle): Custom {
  const node = new Custom(
    (r: DrawContext) => {
      if (!rt.on) return;
      const [sx, sy] = r.P(rt.x, 0, rt.z);
      const cx = Math.round(sx);
      const cy = Math.round(sy);
      const col = r.col(rt.q === 0 ? '#7be08f' : rt.q === 1 ? '#ffc04a' : '#ff8a6b');
      const ink = r.col('#14223a');
      for (let k = -6; k <= 6; k++) {
        if (Math.abs(k) < 2) continue;
        r.rect(cx + k, cy - 1, 1, 3, ink);
        r.rect(cx - 1, cy + k, 3, 1, ink);
      }
      for (let k = -6; k <= 6; k++) {
        if (Math.abs(k) < 2) continue;
        r.rect(cx + k, cy, 1, 1, col);
        r.rect(cx, cy + k, 1, 1, col);
      }
      const fx = Math.round(rt.fx);
      const fy = Math.round(rt.fy);
      const n = Math.max(1, Math.round(Math.hypot(fx - cx, fy - cy) / 3));
      for (let i = 2; i < n; i++) {
        const u = i / n;
        r.rect(Math.round(cx + (fx - cx) * u), Math.round(cy + 7 + (fy - cy - 7) * u), 1, 1, ink);
      }
    },
    { x0: -0.5, x1: 0.5, y0: 0, y1: 0.1, z0: -0.5, z1: 0.5 },
  );
  node.renderOrder = 2000;
  return node;
}
