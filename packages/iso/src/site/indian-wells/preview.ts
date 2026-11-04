import { bay, mixP, nightP, ph } from '../../core/color';
import { SceneDrawer } from '../../core/draw';
import { Custom, type DrawContext, Group, type Node } from '../../core/graph';
import type { Raster } from '../../core/raster';
import { buildStatics, type Weather } from './build';
import { type Cast, type GroundLike, paintGround, SLAB } from './ground';
import { unprojector } from './kit';
import { CLUBHOUSE, F_O2, F_O3, F_P1, F_P2, LAWN, PICKLE, PLAZA, POOL_DECK, TERRACE } from './layout';
import { Facilities, type Facility, RESTORED_STATES } from './state';

/**
 * 修复预览（wave1-contract.md 的 preview）：在这处设施现在的样子（荒废、修了一半）上，叠一层
 * "修成这个变体以后"的半透明幽灵：地面（场地颜色、跑道、地砖）和设施的节点都画一遍，再按 4×4 Bayer
 * 抖动只留约 45% 的像素、往浅青色偏一层，最后沿设施范围描一圈虚线——一眼能看出是预览，不是真修好了。
 *
 * 做法：按"这处设施修好 + 这个变体"的状态表再建一遍场景，只取这处设施的节点（build.ts 记在 userData.fac）；
 * 地面在一张只覆盖设施范围的小贴图上重画（和真地面同一套纹素格子、同一个 paintGround），只画和现在不一样的纹素。
 * 幽灵是一个静态节点（跟静态层一起缓存），画的时候关掉深度、画完按抖动把没留下的像素还原。
 */

type Rect = { x0: number; x1: number; z0: number; z1: number };
const frame = (F: { ox: number; oz: number; hx: number; hz: number }): Rect => ({
  x0: F.ox - F.hx,
  x1: F.ox + F.hx,
  z0: F.oz - F.hz,
  z1: F.oz + F.hz,
});

/** 每处设施预览的范围（地面重画、描虚线的地方） */
const REGIONS: Readonly<Record<Facility, readonly Rect[]>> = {
  stadium_1: [{ x0: -22, x1: 26.5, z0: -39.5, z1: -9 }],
  practice: [frame(F_P1), frame(F_P2), { x0: -16.5, x1: 16.5, z0: -4.2, z1: -2.3 }],
  outer_1: [{ x0: -33.5, x1: -0.5, z0: 16.7, z1: 33.3 }],
  outer_23: [frame(F_O2), frame(F_O3)],
  clubhouse: [{ x0: CLUBHOUSE.x0 + 2, x1: TERRACE.x1, z0: TERRACE.z0, z1: TERRACE.z1 }],
  plaza: [PLAZA, { x0: LAWN.x0, x1: LAWN.x1, z0: LAWN.z0, z1: LAWN.z1 - 2 }],
  stadium_3: [PICKLE],
  stadium_2: [POOL_DECK],
};

/** 只记设施范围那一块的地面画笔（纹素格子和 GroundPainter 一样，hash(i, j) 才对得上） */
class PatchGround implements GroundLike {
  readonly TS = 0.2;
  readonly i0: number;
  readonly j0: number;
  readonly W: number;
  readonly H: number;
  readonly tex: Uint32Array;
  constructor(r: Rect) {
    this.i0 = Math.max(0, Math.floor((r.x0 - SLAB.x0) / this.TS) - 1);
    this.j0 = Math.max(0, Math.floor((r.z0 - SLAB.z0) / this.TS) - 1);
    this.W = Math.ceil((r.x1 - SLAB.x0) / this.TS) + 2 - this.i0;
    this.H = Math.ceil((r.z1 - SLAB.z0) / this.TS) + 2 - this.j0;
    this.tex = new Uint32Array(this.W * this.H);
  }
  paintRect(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    fn: (x: number, z: number, c: number, i: number, j: number) => number,
  ): void {
    const TS = this.TS;
    const i0 = Math.max(this.i0, Math.ceil((x0 - SLAB.x0) / TS - 0.5));
    const i1 = Math.min(this.i0 + this.W - 1, Math.floor((x1 - SLAB.x0) / TS - 0.5));
    const j0 = Math.max(this.j0, Math.ceil((z0 - SLAB.z0) / TS - 0.5));
    const j1 = Math.min(this.j0 + this.H - 1, Math.floor((z1 - SLAB.z0) / TS - 0.5));
    for (let j = j0; j <= j1; j++) {
      const z = SLAB.z0 + (j + 0.5) * TS;
      for (let i = i0; i <= i1; i++) {
        const x = SLAB.x0 + (i + 0.5) * TS;
        const k = (j - this.j0) * this.W + (i - this.i0);
        const v = fn(x, z, this.tex[k] as number, i, j);
        if (v) this.tex[k] = v;
      }
    }
  }
  get(x: number, z: number): number {
    const i = Math.floor((x - SLAB.x0) / this.TS) - this.i0;
    const j = Math.floor((z - SLAB.z0) / this.TS) - this.j0;
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return 0;
    return this.tex[j * this.W + i] as number;
  }
}

/**
 * 预览的抖动留下多少像素、往哪个颜色偏、偏多少。每隔三行偏得更重一点（全息投影的扫描线），
 * 白天在沙地上也一眼看得出"这是幻影"，不会被当成已经修好。
 */
const KEEP = 0.45;
const TINT = ph('#9ff0ff');
const TINT_F = 0.3;
const SCAN_F = 0.55;

/**
 * 建一个预览幽灵节点。fac 是现在的状态表（含变体、升级），casts 是现在的影子（重画现在的地面用来比对）。
 * 返回 null = 这处设施没有预览（不认识的设施）。
 */
export function buildPreviewGhost(
  fac: Facilities,
  f: Facility,
  variant: string,
  wx: Weather,
  casts: readonly Cast[],
): Custom | null {
  const regions = REGIONS[f];
  if (!regions) return null;
  const pf = new Facilities(
    { ...fac.states, [f]: RESTORED_STATES[f] },
    { ...fac.variants, [f]: variant },
    fac.upgrades,
  );
  const out = buildStatics(pf, wx);
  const group = new Group();
  group.name = `preview:${f}`;
  let y1 = 1;
  for (const n of [...out.statics, ...out.dynamic] as Node[]) {
    if (n.userData.fac !== f) continue;
    group.add(n);
    const b = (n as Custom).bounds;
    if (b) y1 = Math.max(y1, b.y1);
  }
  // 地面：修好以后的样子和现在的样子各画一遍（只画设施范围），只预览不一样的纹素
  const bb: Rect = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
  for (const r of regions) {
    bb.x0 = Math.min(bb.x0, r.x0);
    bb.x1 = Math.max(bb.x1, r.x1);
    bb.z0 = Math.min(bb.z0, r.z0);
    bb.z1 = Math.max(bb.z1, r.z1);
  }
  const after = new PatchGround(bb);
  const now = new PatchGround(bb);
  paintGround(after, pf, out.casts);
  paintGround(now, fac, casts);
  const drawer = new SceneDrawer();
  const node = new Custom((r) => drawGhost(r, regions, bb, y1, after, now, group, drawer), {
    x0: bb.x0,
    x1: bb.x1,
    y0: -3,
    y1: y1 + 0.5,
    z0: bb.z0,
    z1: bb.z1,
  });
  node.name = `preview:${f}`;
  // 和设施自己的节点重叠时排在最后（画在现在的样子上面）
  node.renderOrder = 1000;
  return node;
}

/** 光栅的内部（幽灵要先拍下缓冲、画完再按抖动还原）；DrawContext 不是 Raster 时（测试替身）只画虚线 */
type RasterLike = Pick<Raster, 'buf' | 'W' | 'H' | 'zmode' | 'zcur'>;
const asRaster = (r: DrawContext): (DrawContext & RasterLike) | null =>
  (r as Partial<RasterLike>).buf instanceof Uint32Array ? (r as DrawContext & RasterLike) : null;

function drawGhost(
  r: DrawContext,
  regions: readonly Rect[],
  bb: Rect,
  y1: number,
  after: PatchGround,
  now: PatchGround,
  group: Group,
  drawer: SceneDrawer,
): void {
  const R = asRaster(r);
  if (R) {
    // 屏幕上的范围（设施范围 × 0..y1 的八个角）
    let sx0 = 1e9;
    let sx1 = -1e9;
    let sy0 = 1e9;
    let sy1 = -1e9;
    for (let c = 0; c < 8; c++) {
      const p = r.P(c & 1 ? bb.x1 : bb.x0, c & 2 ? y1 + 1 : -2, c & 4 ? bb.z1 : bb.z0);
      sx0 = Math.min(sx0, p[0]);
      sx1 = Math.max(sx1, p[0]);
      sy0 = Math.min(sy0, p[1]);
      sy1 = Math.max(sy1, p[1]);
    }
    const X0 = Math.max(0, Math.floor(sx0) - 2);
    const X1 = Math.min(R.W - 1, Math.ceil(sx1) + 2);
    const Y0 = Math.max(0, Math.floor(sy0) - 8);
    const Y1 = Math.min(R.H - 1, Math.ceil(sy1) + 2);
    if (X1 < X0 || Y1 < Y0) return;
    const w = X1 - X0 + 1;
    const snap = new Uint32Array(w * (Y1 - Y0 + 1));
    const buf = R.buf;
    for (let y = Y0; y <= Y1; y++) snap.set(buf.subarray(y * R.W + X0, y * R.W + X1 + 1), (y - Y0) * w);
    const zm = R.zmode;
    const zc = R.zcur;
    R.zmode = 0;
    // 地面
    const unP = unprojector(r);
    for (const rc of regions)
      r.wpoly(
        [
          [rc.x0, 0, rc.z0],
          [rc.x1, 0, rc.z0],
          [rc.x1, 0, rc.z1],
          [rc.x0, 0, rc.z1],
        ],
        0,
        (px, py) => {
          const p = unP(px + 0.5, py + 0.5, 0);
          const a = after.get(p[0], p[1]);
          if (!a || a === now.get(p[0], p[1])) return 0;
          return r.night > 0 ? nightP(a, r.night, r.litAt(p[0], p[1])) : a;
        },
      );
    // 设施的节点
    drawer.collect(R as unknown as Raster, group);
    drawer.draw(R as unknown as Raster);
    R.zcur = zc;
    // 抖动溶解 + 偏色：新画上去的像素只留 Bayer 阈值以下的那些
    for (let y = Y0; y <= Y1; y++) {
      const row = y * R.W;
      const srow = (y - Y0) * w - X0;
      for (let x = X0; x <= X1; x++) {
        const v = buf[row + x] as number;
        const o = snap[srow + x] as number;
        if (v === o) continue;
        buf[row + x] = bay(x, y) < KEEP ? mixP(v, TINT, y % 3 === 0 ? SCAN_F : TINT_F) : o;
      }
    }
    drawOutline(r, regions);
    R.zmode = zm;
  } else drawOutline(r, regions);
}

/**
 * 沿设施范围描一圈虚线：先一道深青色的实线垫底（沙地、草地上都压得住），上面亮青白的虚线，
 * 四个角再加一道粗一点的直角框（像取景框）。夜里自发光。
 */
function drawOutline(r: DrawContext, regions: readonly Rect[]): void {
  const N = r.night > 0.3;
  const dc = N ? r.em('#bff4ff') : r.col('#f2feff', 1, 0);
  const under = N ? r.em('#1f7f8c', 0.8) : r.col('#0f5d68', 1, 0);
  const cc = N ? r.em('#ffffff') : r.col('#ffffff', 1, 0);
  const w = Math.max(1, Math.round(r.k / 4));
  const dash = 0.9;
  for (const rc of regions) {
    const edges: [number, number, number, number][] = [
      [rc.x0, rc.z0, rc.x1, rc.z0],
      [rc.x1, rc.z0, rc.x1, rc.z1],
      [rc.x1, rc.z1, rc.x0, rc.z1],
      [rc.x0, rc.z1, rc.x0, rc.z0],
    ];
    for (const [ax, az, bx, bz] of edges) r.wline([ax, 0.04, az], [bx, 0.04, bz], under, w + 1);
    for (const [ax, az, bx, bz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.floor(len / dash));
      for (let i = 0; i < n; i += 2) {
        const u0 = i / n;
        const u1 = Math.min(1, (i + 1) / n);
        r.wline(
          [ax + (bx - ax) * u0, 0.04, az + (bz - az) * u0],
          [ax + (bx - ax) * u1, 0.04, az + (bz - az) * u1],
          dc,
          w,
        );
      }
    }
    // 四个角的直角框（每边 1.6 米，范围小的按比例缩）
    const L = Math.min(1.6, (rc.x1 - rc.x0) / 3, (rc.z1 - rc.z0) / 3);
    for (const [x, z, sx, sz] of [
      [rc.x0, rc.z0, 1, 1],
      [rc.x1, rc.z0, -1, 1],
      [rc.x1, rc.z1, -1, -1],
      [rc.x0, rc.z1, 1, -1],
    ] as const) {
      r.wline([x, 0.05, z], [x + sx * L, 0.05, z], cc, w + 1);
      r.wline([x, 0.05, z], [x, 0.05, z + sz * L], cc, w + 1);
    }
  }
}
