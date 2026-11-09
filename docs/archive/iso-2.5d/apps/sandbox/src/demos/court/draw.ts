import {
  type BakedArt,
  bakeArt,
  Custom,
  type DrawContext,
  hash,
  type IsoWorld,
  mixP,
  mulP,
  type Node,
  type Person,
  ph,
  type Raster,
  V3,
} from '@td/iso';
import { WEED_ART } from './art';
import { type CourtModel, LINE, type Tool } from './model';

/**
 * 场地养护的画面层（全部是 @td/iso 的软件光栅）：
 * - 场面叠层（Custom）：沙、坑洼裂缝、湿红土、白线、画歪的线、引导线、杂草，逐像素反投影到场地格子上画，
 *   地面贴图本身是"修好、没画线"的真场地（paintCourtBase），扫开沙就露出真地面；
 * - 球网（Custom，照 site/indian-wells/build.ts 的 net，张力连续变化）；
 * - 手里的工具（扫把、压路滚、画线车、水管）和画线的准星。
 * 只读 CourtModel 和演出状态，不改数。
 */

/** 场地配色（和 site/indian-wells/ground.ts 的 CP 一致） */
const CP = {
  member: { i: '#3f86c9', o: '#3e9c86' },
  clay: { i: '#d36b3d', o: '#c45d34' },
  practice: { i: '#4fa760', o: '#3b7f8c' },
} as const;
const WHITE = ph('#f6f3ea');

/**
 * 把场地的地面贴图画成"修好的、还没画线"的样子（fresh 场面，照 ground.ts 的 paintCourt）。
 * onlyLines：只把白线那几格换成场地色（设施刚切到修好的状态，影子留着）。
 */
export function paintCourtBase(w: IsoWorld, m: CourtModel, onlyLines = false): void {
  const F = m.F;
  const pal = CP[m.cfg.kind];
  const ci = ph(pal.i);
  const co = ph(pal.o);
  const seed = (F.ox * 7 + F.oz * 13) | 0;
  const { L, Wd, Ws, sv, lw } = LINE;
  w.ground.paintRect(F.ox - F.hx, F.ox + F.hx, F.oz - F.hz, F.oz + F.hz, (x, z, c) => {
    const u = x - F.ox;
    const v = z - F.oz;
    const au = Math.abs(u);
    const av = Math.abs(v);
    const inside = au <= L && av <= Wd;
    const ln =
      (Math.abs(au - L) < lw && av <= Wd + lw) ||
      (Math.abs(av - Wd) < lw && au <= L + lw) ||
      (Math.abs(av - Ws) < lw && au <= L) ||
      (Math.abs(au - sv) < lw && av <= Ws) ||
      (av < lw && au <= sv) ||
      (av < lw && au > L - 0.45 && au <= L);
    if (onlyLines && !ln) return 0;
    const n = hash(Math.floor(x * 5), Math.floor(z * 5), seed);
    let b = inside ? ci : co;
    b = m.clay ? mulP(b, 0.95 + n * 0.1) : mulP(b, 0.97 + n * 0.05);
    // 白线上落着影子：场地色也压暗同样的倍率
    if (onlyLines && c !== WHITE) b = mulP(b, 0.7, 0.72, 0.84);
    return b;
  });
}

/**
 * 干活时把这块场朝镜头那两边（南、东）的围网藏起来（剖面），手下的沙和线不被铁丝网挡住；
 * 开场时设施重建，修好的围网整圈回来。
 */
export function hideFrontFence(w: IsoWorld, m: CourtModel): void {
  const F = m.F;
  const zs = F.oz + F.hz + 0.05;
  const xs = F.ox + F.hx + 0.05;
  w.statics.traverse((n: Node) => {
    if (n.kind !== 'custom') return;
    const b = (n as Custom).bounds;
    if (b.y1 < 2.9 || b.y1 > 3.1) return;
    const south =
      Math.abs(b.z1 - zs) < 1e-3 && b.z1 - b.z0 < 0.2 && b.x0 >= F.ox - F.hx - 0.1 && b.x1 <= F.ox + F.hx + 0.1;
    const east =
      Math.abs(b.x1 - xs) < 1e-3 && b.x1 - b.x0 < 0.2 && b.z0 >= F.oz - F.hz - 0.1 && b.z1 <= F.oz + F.hz + 0.1;
    if (south || east) n.visible = false;
  });
  w.view.invalidate();
}

/** 藏掉场景构建里这块场的球网（球网由 demo 自己画，张力连续变） */
export function hideSiteNet(w: IsoWorld, m: CourtModel): void {
  const F = m.F;
  const W = 5.485 + 0.9;
  w.statics.traverse((n: Node) => {
    if (n.kind !== 'custom') return;
    const b = (n as Custom).bounds;
    if (
      Math.abs(b.x0 - (F.ox - 0.05)) < 1e-6 &&
      Math.abs(b.z0 - (F.oz - W)) < 1e-6 &&
      Math.abs(b.z1 - (F.oz + W)) < 1e-6
    )
      n.visible = false;
  });
  w.view.invalidate();
}

export interface OverlayState {
  tool: Tool | null;
  /** 正在描的线（-1 没有） */
  lock: number;
  /** 演出时间（引导线闪烁） */
  t: number;
  /** 引导线要不要显示（选了画线工具） */
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
  faded: '#b3aa9a',
  fadedC: '#a86a4a',
  white: '#f6f3ea',
  wobble: '#dcd6c6',
  mud: '#cdb88f',
  wet: '#7a2e1c',
  puddle: '#6a3a2a',
  glint: '#9fdcf0',
  gold: '#ffd84a',
  lock: '#fff3b0',
  ink: '#2a2238',
} as const;
type HexKey = keyof typeof HEX;

/** 场面叠层 */
export function createOverlay(m: CourtModel, st: OverlayState): Custom {
  const F = m.F;
  const N = m.N;
  const colA = new Uint32Array(N);
  const amtA = new Float32Array(N);
  const weedArt = bakeArt(WEED_ART);
  const P = {} as Record<HexKey, number>;
  const node = new Custom(
    (r: DrawContext) => {
      const R = r as unknown as Raster;
      const lit = r.litAt(F.ox, F.oz);
      for (const k of Object.keys(HEX) as HexKey[]) P[k] = r.col(HEX[k], 1, lit);
      buildCells(m, st, P, colA, amtA);
      blit(R, m, colA, amtA);
      // 杂草（拔草时抖一抖）
      for (const w of m.weeds) {
        if (w.hp <= 0) continue;
        const sx = w.shake > 0 ? Math.sin(st.t * 60) * 0.06 : 0;
        r.art(weedArt, F.ox + w.u + sx, 0.02, F.oz + w.v, { lit });
      }
    },
    { x0: F.ox - F.hx, x1: F.ox + F.hx, y0: 0, y1: 0.02, z0: F.oz - F.hz, z1: F.oz + F.hz },
  );
  node.renderOrder = -1000;
  return node;
}

function buildCells(
  m: CourtModel,
  st: OverlayState,
  P: Record<HexKey, number>,
  colA: Uint32Array,
  amtA: Float32Array,
): void {
  const { nx, nz, sand, rough, crack, moist, stray, segOf, segNear, segP, segs, inside } = m;
  const clay = m.clay;
  const blink = Math.floor(st.t * 5);
  /** 沙下面那一层：白线、引导线、画歪的线、水坑、裂缝和坑洼 */
  const under = (c: number, i: number, j: number): void => {
    const sg = segOf[c];
    // 引导线两边描一圈暗边，金线在手机上也看得清
    if (sg < 0 && st.guide && stray[c] === 0) {
      const sn = segNear[c];
      if (sn >= 0 && segs[sn].cov[segP[c]] === 0) {
        colA[c] = P.ink;
        amtA[c] = sn === st.lock ? 0.55 : 0.4;
        return;
      }
    }
    if (sg >= 0) {
      const g = segs[sg];
      const k = segP[c];
      const cv = g.cov[k];
      if (cv === 1 || cv === 2) {
        colA[c] = cv === 1 ? P.white : P.wobble;
        amtA[c] = 1;
        return;
      }
      if (cv === 3) {
        colA[c] = P.mud;
        amtA[c] = 1;
        return;
      }
      if (st.guide) {
        // 引导线：没画的线一段段闪金色（正在描的那条亮成一整条）
        if (sg === st.lock) {
          colA[c] = P.lock;
          amtA[c] = 0.85;
          return;
        }
        colA[c] = P.gold;
        amtA[c] = ((k + blink) & 7) < 5 ? 1 : 0.55;
        return;
      }
      if (g.ghost[k]) {
        colA[c] = P.white;
        amtA[c] = 0.32;
        return;
      }
    }
    if (stray[c]) {
      colA[c] = stray[c] === 1 ? P.white : P.mud;
      amtA[c] = 1;
      return;
    }
    const mo = moist[c];
    if (clay && mo > 1.3) {
      colA[c] = hash(i, j, 79) < 0.06 ? P.glint : P.puddle;
      amtA[c] = 1;
      return;
    }
    const rf = rough[c];
    if (rf > 0.02) {
      if (crack[c]) {
        colA[c] = clay ? P.crackC : P.crack;
        amtA[c] = Math.min(1, rf * 1.1);
      } else {
        // 坑洼、老化：发灰褪色，背光的一边再暗一点
        const dn = j < nz - 1 ? rough[c + nx] : rf;
        if (rf - dn > 0.12) {
          colA[c] = P.ink;
          amtA[c] = Math.min(0.35, rf * 0.4);
        } else {
          colA[c] = clay ? P.fadedC : P.faded;
          amtA[c] = Math.min(0.62, rf * 0.75);
        }
      }
      if (clay && mo > 0.02) {
        colA[c] = mixP(colA[c], P.wet, Math.min(1, mo) * 0.6);
        amtA[c] = Math.max(amtA[c], Math.min(1, mo) * 0.5);
      }
      return;
    }
    if (clay && mo > 0.02) {
      colA[c] = P.wet;
      amtA[c] = Math.min(1, mo) * 0.5;
    }
  };
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      amtA[c] = 0;
      if (!inside[c]) continue;
      const s = sand[c];
      // 厚沙整格盖住：朝北（上风）的坡亮、朝南的坡暗，偶尔一颗石子
      if (s >= 0.55) {
        const up = j > 0 ? sand[c - nx] : s;
        const dn = j < nz - 1 ? sand[c + nx] : s;
        const lf = i > 0 ? sand[c - 1] : s;
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
      // 薄沙：按厚度把沙色盖上去（四档，格子抖一抖），下面的线和坑透出来
      if (s > 0.05) {
        const a = Math.min(0.92, Math.round(((s - 0.05) / 0.5) * 4 + hash(i, j, 77) * 0.9 - 0.45) / 4 + 0.18);
        if (amtA[c] >= 1) colA[c] = mixP(colA[c], P.sand, a);
        else {
          colA[c] = amtA[c] > 0 ? mixP(P.sand, colA[c], amtA[c] * (1 - a)) : P.sand;
          amtA[c] = Math.max(a, amtA[c]);
        }
      }
    }
}

/** 逐像素：反投影到地面 → 格子 → 混色。被前面的围网、灯杆挡住的像素不画（深度缓冲） */
function blit(R: Raster, m: CourtModel, colA: Uint32Array, amtA: Float32Array): void {
  const pr = R.proj;
  const buf = R.buf;
  const dep = R.depth;
  const W = R.W;
  const H = R.H;
  const F = m.F;
  let sx0 = Number.POSITIVE_INFINITY;
  let sx1 = Number.NEGATIVE_INFINITY;
  let sy0 = Number.POSITIVE_INFINITY;
  let sy1 = Number.NEGATIVE_INFINITY;
  for (const [x, z] of [
    [F.ox - F.hx, F.oz - F.hz],
    [F.ox + F.hx, F.oz - F.hz],
    [F.ox - F.hx, F.oz + F.hz],
    [F.ox + F.hx, F.oz + F.hz],
  ] as const) {
    const [a, b] = pr.P(x, 0, z);
    sx0 = Math.min(sx0, a);
    sx1 = Math.max(sx1, a);
    sy0 = Math.min(sy0, b);
    sy1 = Math.max(sy1, b);
  }
  const X0 = Math.max(0, Math.floor(sx0));
  const X1 = Math.min(W - 1, Math.ceil(sx1));
  const Y0 = Math.max(0, Math.floor(sy0));
  const Y1 = Math.min(H - 1, Math.ceil(sy1));
  // 反投影是仿射的：x = bx + ax·sx + ay·sy
  const o0 = pr.unP(0.5, 0.5, 0);
  const o1 = pr.unP(1.5, 0.5, 0);
  const o2 = pr.unP(0.5, 1.5, 0);
  const axx = o1[0] - o0[0];
  const axz = o1[1] - o0[1];
  const ayx = o2[0] - o0[0];
  const ayz = o2[1] - o0[1];
  const d0 = pr.depth(o0[0], o0[1]);
  const dX = pr.depth(o1[0], o1[1]) - d0;
  const dY = pr.depth(o2[0], o2[1]) - d0;
  const inv = 1 / 0.2;
  const nx = m.nx;
  const nz = m.nz;
  const gx0 = m.gx0;
  const gz0 = m.gz0;
  for (let sy = Y0; sy <= Y1; sy++) {
    let wx = o0[0] + axx * X0 + ayx * sy;
    let wz = o0[1] + axz * X0 + ayz * sy;
    let d = d0 + dX * X0 + dY * sy;
    let o = sy * W + X0;
    for (let sx = X0; sx <= X1; sx++, o++, wx += axx, wz += axz, d += dX) {
      const i = Math.floor((wx - gx0) * inv);
      const j = Math.floor((wz - gz0) * inv);
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const c = j * nx + i;
      const a = amtA[c];
      if (a <= 0) continue;
      if (dep && dep[o] > d + 0.3) continue;
      buf[o] = a >= 1 ? colA[c] : mixP(buf[o], colA[c], a);
    }
  }
}

/* ---------------- 球网 ---------------- */

export interface NetView {
  /** 0..1.05 张力（画面用） */
  t: number;
  /** 挂起来没有（没挂就是倒在地上） */
  up: boolean;
  /** 抖动（刚松手、阵风） */
  wob: number;
}

/** 球网（照 build.ts 的 net：两根柱子、网面棋盘格、白色网带；张力决定中间塌多少） */
export function createNet(m: CourtModel, nv: NetView): Custom {
  const F = m.F;
  const x = F.ox;
  const W = 5.485 + 0.9;
  const za = F.oz - W;
  const zb = F.oz + W;
  const h = 1.0;
  type Pt = [number, number, number];
  return new Custom(
    (r: DrawContext) => {
      const lit = r.litAt(x, F.oz);
      const pc = r.col('#2a2d33', 1, lit);
      const pw = Math.max(1, Math.round(r.k * 0.25));
      r.wline([x, 0, za], [x, h, za], pc, pw);
      r.wline([x, 0, zb], [x, h, zb], pc, pw);
      if (!nv.up) {
        // 倒在地上的网：一条皱巴巴的网布（棋盘格）和一截白网带
        const nc = r.col('#1d2026', 1, lit);
        const tc = r.col('#d8d4c8', 1, lit);
        const M = 8;
        const side: Pt[] = [];
        const back: Pt[] = [];
        for (let i = 0; i <= M; i++) {
          const z = za + 0.4 + ((zb - za - 0.8) * i) / M;
          const dx = (hash(i, (x * 3) | 0, 61) - 0.5) * 0.7;
          side.push([x + dx - 0.25, 0.03, z]);
          back.push([x + dx + 0.3, 0.03, z]);
        }
        r.wpoly([...side, ...back.slice().reverse()], 0, (px, py) => ((px + py) & 1 ? nc : 0));
        for (let i = 0; i < M; i++) if (i % 3 !== 1) r.wline(back[i], back[i + 1], tc);
        return;
      }
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
      for (let i = 0; i < N; i++) r.wline(top[i], top[i + 1], tc);
    },
    { x0: x - 0.05, x1: x + 0.05, y0: 0, y1: h + 0.1, z0: za, z1: zb },
  );
}

/* ---------------- 手里的工具 ---------------- */

export interface ToolView {
  tool: Tool | null;
  /** 工具头的世界位置、推的方向 */
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** 拿着的人（手柄从手画到工具头） */
  who: Person | null;
  on: boolean;
  /** 工具头的半宽（米，跟着手指的大小） */
  r: number;
}

const _hand = new V3();

export function createTool(tv: ToolView): Custom {
  const node = new Custom(
    (r: DrawContext) => {
      if (!tv.on || !tv.tool || tv.tool === 'net') return;
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
      if (tv.tool === 'broom') {
        const w = tv.r * 0.75;
        r.wline([x - px * w, 0.05, z - pz * w], [x + px * w, 0.05, z + pz * w], r.col('#4a3020', 1, lit), 2);
        r.wline(
          [x - px * w, 0.14, z - pz * w],
          [x + px * w, 0.14, z + pz * w],
          r.col('#e5b33b', 1, lit),
          Math.max(2, Math.round(r.k * 0.16)),
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

/** 画线的准星：画在笔尖（屏幕上，手指上方），一条虚线连到手指 */
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
        r.pix(cx + k, cy, col);
        r.pix(cx, cy + k, col);
      }
      const fx = Math.round(rt.fx);
      const fy = Math.round(rt.fy);
      const n = Math.max(1, Math.round(Math.hypot(fx - cx, fy - cy) / 3));
      for (let i = 2; i < n; i++) {
        const u = i / n;
        r.pix(Math.round(cx + (fx - cx) * u), Math.round(cy + 7 + (fy - cy - 7) * u), ink);
      }
    },
    { x0: -0.5, x1: 0.5, y0: 0, y1: 0.1, z0: -0.5, z1: 0.5 },
  );
  node.renderOrder = 2000;
  return node;
}

export type { BakedArt };
