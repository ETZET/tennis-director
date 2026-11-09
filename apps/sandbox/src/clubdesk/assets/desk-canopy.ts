// #1 desk-canopy · 露天前台的凉棚（主角上半）。规格见 docs/lab/2026-11-07-3d-pixel/clubdesk.md「#1」。
// 本地原点 = 凉棚地盘中心（世界 DESK.x、CANOPY 的 z 中点 = 54.4, 5.7），+z 朝镜头（南）。
//
// 从下往上：四根 0.3 米染色木柱（柱脚一块碎花岗岩垫石）→ 东西两边各一根南北向主梁 → 五根东西向椽子（头伸出东西两边 0.3 米，
// 剪影读成凉棚不是盒子）→ 帆布绷在椽子上：每根椽子把布顶起一道褶（褶顶 1 纹素凸边亮线 + 南坡落中档一行 = 布搭在木头上），
// 两道俱乐部蓝宽条纹东西走向（本地 z ±2，各 1.1 米）。北、东、西三边 0.3 米扇形垂边；**南沿不挂垂边**，只有一道 0.12 米的
// 俱乐部蓝包边（卷边）：南沿底 = CANOPY.top − CANOPY.thick = 3.28 米，总监的帽子从它下面露出来（layout.ts HEAD_LINE_Z）。
// 南沿以北的东西都不低于"帽顶 → 镜头"的视线：视线在本地 z 处的高度 = 2.0 + (z − z_帽)，最南那根椽子底 3.06 > 2.66。
//
// 材质：帆布 canvas（paint 元素 12×8，几乎干净）、条纹 / 包边 canvasStripe、木 timber（柱子竖向板缝；梁、椽不加元素，太细）、
// 垫石 granite。帆布 noShadowReceive（palette 的 THIN）、要投影（投影池是构图的一部分）。
import * as THREE from 'three';
import { CANOPY, DESK } from '../layout';
import type { AssetCtx } from '../world';
import { boxR, type G, meshOf, quad } from './desk/kit';

/** 本地坐标的范围（世界 → 本地：减去落地点） */
const CX = DESK.x;
const CZ = (CANOPY.z0 + CANOPY.z1) / 2;
const X0 = CANOPY.x0 - CX;
const X1 = CANOPY.x1 - CX;
const Z0 = CANOPY.z0 - CZ;
const Z1 = CANOPY.z1 - CZ;
const TOP = CANOPY.top;
/** 帆布底面（南沿底，≥ 3.28：总监的帽子要露出来） */
const UNDER = CANOPY.top - CANOPY.thick;

/** 柱子中心（世界 x 52.6 / 56.2、z 2.5 / 9.0 → 本地），0.3 见方 */
const POST_X = [52.6 - CX, 56.2 - CX];
const POST_Z = [2.5 - CZ, 9.0 - CZ];
const POST = 0.3;
/** 主梁（南北向，压在柱顶）：宽 0.27、高 0.3 */
const BEAM_W = 0.27;
const BEAM_Y1 = UNDER - 0.22;
const BEAM_Y0 = BEAM_Y1 - 0.3;
/** 椽子（东西向，压在主梁上、顶着帆布）：0.22 × 0.22，头伸出帆布东西两边 0.3；中间两根正好在两道条纹的正中（褶在条纹中线上） */
const RAFTER = 0.22;
const TAIL = 0.3;
const RAFTER_Z = [Z0 + 0.15, -2, 0, 2, Z1 - 0.15];
/** 帆布的褶：椽子顶起 FOLD_H，两边各 FOLD_A 宽（南坡 ≈ 27°，落中档一行；北坡朝太阳，还是亮档） */
const FOLD_H = 0.035;
const FOLD_A = 0.07;
/** 条纹（本地 z 中心、宽） */
const STRIPES: [number, number][] = [
  [-2, 1.1],
  [2, 1.1],
];
/** 垂边：总深 0.3（顶上 0.08 一条直边 + 0.22 深的扇），每个扇 0.6 米 */
const VAL_BAND = 0.08;
const VAL_DEPTH = 0.3;
const VAL_W = 0.6;
/**
 * 东西两边的布边在两根椽子之间往里收（布只在椽子头那里被拉住，中间绷成一道浅弧）：最深 EDGE_IN 米（1× 下 ≈ 2 纹素）。
 * 这是"绷着的布"在 yaw 0 下最看得见的一笔：亮帆布的左右轮廓在椽子头之间是一道道浅弧，不是直尺画的盒子边。
 */
const EDGE_IN = 0.09;

/** 帆布顶面的高度（沿 z 的折线）：平的 TOP，每根椽子一道褶 */
function topY(z: number): number {
  for (const r of RAFTER_Z) {
    const d = Math.abs(z - r);
    if (d < FOLD_A) return TOP + FOLD_H * (1 - d / FOLD_A);
  }
  return TOP;
}

/** 东西布边往里收多少（两根相邻椽子之间一道正弦弧；最外两根椽子以外不收） */
function edgeIn(z: number): number {
  for (let i = 0; i < RAFTER_Z.length - 1; i++) {
    const a = RAFTER_Z[i];
    const b = RAFTER_Z[i + 1];
    if (z > a && z < b) return EDGE_IN * Math.sin((Math.PI * (z - a)) / (b - a));
  }
  return 0;
}

/** 顶面剖面的断点：两头、每道褶三个点、条纹边（好按段分材质）、每跨里再加 8 个点（布边的弧） */
function breaks(): number[] {
  const zs = new Set<number>();
  const put = (z: number) => zs.add(Math.round(Math.min(Z1, Math.max(Z0, z)) * 1000) / 1000);
  put(Z0);
  put(Z1);
  for (const r of RAFTER_Z) for (const d of [-FOLD_A, 0, FOLD_A]) put(r + d);
  for (const [c, w] of STRIPES) {
    put(c - w / 2);
    put(c + w / 2);
  }
  for (let i = 0; i < RAFTER_Z.length - 1; i++)
    for (let k = 1; k < 9; k++) put(RAFTER_Z[i] + ((RAFTER_Z[i + 1] - RAFTER_Z[i]) * k) / 9);
  return [...zs].sort((a, b) => a - b);
}

const inStripe = (z: number) => STRIPES.some(([c, w]) => Math.abs(z - c) < w / 2);

/** 扇形垂边的深度（u = 沿边的距离） */
const valDepth = (u: number) => VAL_BAND + (VAL_DEPTH - VAL_BAND) * Math.abs(Math.sin((Math.PI * u) / VAL_W));

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'desk-canopy';

  // ── 帆布 ────────────────────────────────────────────────
  const canvasTop: G[] = [];
  const stripeTop: G[] = [];
  const canvasRest: G[] = [];
  const zs = breaks();
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i];
    const zb = zs[i + 1];
    const ya = topY(za);
    const yb = topY(zb);
    const ea = X1 - edgeIn(za);
    const eb = X1 - edgeIn(zb);
    const wa = X0 + edgeIn(za);
    const wb = X0 + edgeIn(zb);
    const up: [number, number, number] = [0, zb - za, -(yb - ya)];
    const top = quad([wa, ya, za], [ea, ya, za], [eb, yb, zb], [wb, yb, zb], up);
    (inStripe((za + zb) / 2) ? stripeTop : canvasTop).push(top);
    // 底面（投影要它：单面的顶面从太阳那边看是正面，影子 pass 画背面 → 没有影子）
    canvasRest.push(quad([wa, UNDER, za], [ea, UNDER, za], [eb, UNDER, zb], [wb, UNDER, zb], [0, -1, 0]));
    // 东西两个侧面（剖面下面封到底面）
    canvasRest.push(quad([ea, UNDER, za], [ea, ya, za], [eb, yb, zb], [eb, UNDER, zb], [1, 0, 0]));
    canvasRest.push(quad([wa, UNDER, za], [wa, ya, za], [wb, yb, zb], [wb, UNDER, zb], [-1, 0, 0]));
  }
  // 北沿
  canvasRest.push(quad([X0, UNDER, Z0], [X1, UNDER, Z0], [X1, TOP, Z0], [X0, TOP, Z0], [0, 0, -1]));
  // 南沿：一道俱乐部蓝包边（帆布卷过最南那根椽子的那一条），朝镜头；不挂垂边
  const hem = quad([X0, UNDER, Z1], [X1, UNDER, Z1], [X1, TOP, Z1], [X0, TOP, Z1], [0, 0, 1]);

  const paint = { kind: 'paint' as const, size: [12, 8] as [number, number], density: [0, 0.02] as [number, number] };
  const mCanvas = ctx.mat('canvas', { elem: { ...paint, seed: 3 }, toneW: [0.2, 0.16] });
  const mStripe = ctx.mat('canvasStripe', { elem: { ...paint, seed: 5 }, toneW: [0.2, 0.16] });
  root.add(meshOf(canvasTop, mCanvas, 'canvas'));
  root.add(meshOf(stripeTop, mStripe, 'stripes'));
  root.add(meshOf(canvasRest, ctx.mat('canvas'), 'canvas-shell'));
  root.add(meshOf([hem], ctx.mat('canvasStripe'), 'hem'));

  // ── 垂边：北、东、西三边，跟着布边走（yaw 0 下东西两边是侧着的、北边在顶面后面，都几乎看不见；转镜头时才整条看得见）──
  // 每 0.05 米一段竖条，底边按扇形深度取；双面（里外都看得到、两面都投影）
  const val: G[] = [];
  const step = 0.05;
  for (const side of [-1, 1]) {
    for (let z = Z0; z < Z1 - 1e-6; z += step) {
      const z2 = Math.min(Z1, z + step);
      const xa = side * (X1 - edgeIn(z)) + side * 0.005;
      const xb = side * (X1 - edgeIn(z2)) + side * 0.005;
      const da = valDepth(z - Z0);
      const db = valDepth(z2 - Z0);
      val.push(quad([xa, UNDER, z], [xb, UNDER, z2], [xb, UNDER - db, z2], [xa, UNDER - da, z], [side, 0, 0]));
    }
  }
  for (let x = X0; x < X1 - 1e-6; x += step) {
    const x2 = Math.min(X1, x + step);
    const z = Z0 - 0.005;
    val.push(
      quad(
        [x, UNDER, z],
        [x2, UNDER, z],
        [x2, UNDER - valDepth(x2 - X0), z],
        [x, UNDER - valDepth(x - X0), z],
        [0, 0, -1],
      ),
    );
  }
  root.add(meshOf(val, ctx.mat('canvas', { side: THREE.DoubleSide }), 'valance'));

  // ── 木构 ────────────────────────────────────────────────
  const posts: G[] = [];
  const frame: G[] = [];
  const plinths: G[] = [];
  for (const x of POST_X)
    for (const z of POST_Z) {
      posts.push(boxR(x - POST / 2, x + POST / 2, 0.15, BEAM_Y0, z - POST / 2, z + POST / 2));
      plinths.push(boxR(x - 0.21, x + 0.21, 0, 0.15, z - 0.21, z + 0.21));
    }
  for (const x of POST_X) frame.push(boxR(x - BEAM_W / 2, x + BEAM_W / 2, BEAM_Y0, BEAM_Y1, Z0, Z1));
  for (const z of RAFTER_Z) frame.push(boxR(X0 - TAIL, X1 + TAIL, BEAM_Y1, UNDER, z - RAFTER / 2, z + RAFTER / 2));
  // 柱子：竖向板缝（两块拼的柱，一道 1 纹素的缝在正中）；梁、椽太细，不加元素
  root.add(
    meshOf(posts, ctx.mat('timber', { elem: { kind: 'planks', p: [1, 0, 0, POST / 2], seam: 1, hi: 0.5 } }), 'posts'),
  );
  root.add(meshOf(frame, ctx.mat('timber'), 'frame'));
  root.add(meshOf(plinths, ctx.mat('granite'), 'plinths'));

  ctx.mats.prepare(root);
  root.userData.spec = { x0: X0, x1: X1, z0: Z0, z1: Z1, under: UNDER, top: TOP };
  return root;
}
