// stadium-stands：中心球场的看台（北 6 级、东 3 级、南 2 级）+ 北看台四条走道、西头端梯、广告板、后墙、东看台背后的台阶。
// 世界坐标直接建（main.ts 把它放在原点；文件一存在，terrain.ts 就不再画色块白模看台）。尺寸照 layout.ts 的 STANDS。
//
// 明暗横带怎么来的（这个场景构图的关键，两条必须守）：
//  1. 立面（朝南 = 朝镜头）不接收投影 → 每级一整条干净的暗档；浇筑缝 / 模板缝是暗档里的元素（strata：每级一层、每 1.2 米左右一块模板，
//     块和块深浅轮换），远看还是一条暗带，近看是混凝土。
//  2. 踏面的影子袋：后 3/4（上一级立面的投影，按 SUN 算：0.9 米高 → 0.92 米）是暗档，前沿 0.28 米一条亮边；踏面不加元素（安静）。
//     **北看台的影子袋是几何切出来的**（袋 = 固定暗档、亮边 = 不接收投影），不靠阴影贴图：实测接收投影时，PCF 的过渡带（±15 厘米）
//     加上材质里的竖向"毛"阈值，正好落在 4 行宽的亮边上 → 六条 40 米长的碎点线（亮沙色 / 暗紫交替，强边缘）。几何切出来的袋
//     和投影是同一条线（太阳不动），边是干净的直线。代价：别的东西（记分牌）的影子不落在北看台的踏面上 —— 人群、立面本来也不接收，
//     人群上的大块影子按构图本来就是要避开的。东 / 南看台照常接收投影（它们的立面不朝太阳，没有影子袋）。
// 座椅是一条座椅条（座面 + 靠背）+ planks 元素：每座 0.56 米（座位边落在 0.56 的整数倍上，观众按同一个格子坐），
// 1 纹素的缝，每座自己一个深浅；几乎全在影子里 = 深青绿，空座成片的地方就是看台上安静的地方。
// 走道（`aisle`，比看台亮一档的冷灰白，台阶 treads 元素）竖着把横带切成块；广告板俱乐部蓝（`counter`，lightUp 落中档）+ 奶油色的字块和网球徽标。
import * as THREE from 'three';
import { NORTH_BACK, northTread, STANDS, SUN, tier } from '../layout';
import type { AssetCtx } from '../world';
import { GeoBuf, meshOf } from './stands/geo';
import { northRuns, P, SEAT, seatRuns } from './stands/seats';

type C3 = [number, number, number];
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级]（同 palette.ts） */
const tn = (lit: C3, mid: C3, dark: C3, seam: C3, hi: C3) => ({ bands: [lit, mid, dark] as [C3, C3, C3], seam, hi });

/**
 * 立面混凝土（`concrete` 的 ramp 不变，手挑 tones）：暗档本色 L 98，高 / 低一级 ±9，缝 −23，亮边 +23（都 < 60：不出强边缘）。
 * 暗档往冷紫走（同崖壁），亮 / 中档只在端面、端梯侧面露一点。
 */
const RISER = tn(
  [0xe8c69e, 0xf0d0aa, 0xdcba94], // L 203 / 212 / 192
  [0xc89a8e, 0xd0a496, 0xbc9088], // L 164 / 172 / 154
  [0x6e5a92, 0x786498, 0x645288], // L 98 / 108 / 90
  [0xc8a688, 0xa47c7a, 0x524478], // 缝
  [0xfae0bc, 0xdcb2a2, 0x86729e], // 亮边
);
/** 座椅（`seat` 俱乐部绿）：影子里的深青绿，座和座之间差 ±9，缝 −23 */
const SEAT_T = tn(
  [0x5cb488, 0x68bc90, 0x52aa80],
  [0x3a8a74, 0x44947c, 0x32806c],
  [0x24546a, 0x2c5e74, 0x1e4a62], // L 75 / 85 / 66
  [0x3e8a70, 0x286456, 0x163a52],
  [0x7cc89a, 0x58a488, 0x386c7e],
);
/** 白灰泥后墙（`stucco`）：大块灰泥斑（stones 元素、没有缝），朝镜头 = 暗档 L 129 */
const STUCCO = tn(
  [0xfaeedc, 0xfff6e6, 0xf0e2d0],
  [0xdcc6c0, 0xe4cec8, 0xd2bcb8],
  [0x8e7a9e, 0x9884a8, 0x847096],
  [0xd8c8b8, 0xb8a4a4, 0x6e5e86],
  [0xffffff, 0xf0dcd6, 0xa290b2],
);

/** 1 米高的东西在平地上的影子往南伸多长（SUN：仰角 44°、偏东 8°）≈ 1.02 */
const SHADOW_PER_M = Math.cos((SUN.az * Math.PI) / 180) / Math.tan((SUN.el * Math.PI) / 180);

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'stadium-stands';
  /** 画廊（?asset=stadium-stands / crowd）只建北看台：整个马蹄形 45 × 28 米，画廊的取景框里只看得到空场地 */
  const gallery = ctx.params.get('asset');
  const northOnly = gallery === 'stadium-stands' || gallery === 'crowd';
  const N = STANDS.north;
  const AH = STANDS.aisleW / 2;
  const top = (k: number) => northTread(k).y;

  // ── 材质 ──
  const riserMat = ctx.mat('concrete', {
    elem: { kind: 'strata', space: 'wall', size: [26, 15], hi: 0.35, q: [9, 999, 0, 0], seed: 3 },
    tones: RISER,
    noShadowReceive: true,
    edge: 0.3,
    convex: 0.25,
  });
  const treadMat = ctx.mat('concrete', { edge: 0.15, convex: 0.35 });
  /** 北看台踏面：亮边（不接收投影，按法线落亮档）和影子袋（固定暗档：bands 阈值抬到够不着） */
  const treadLit = ctx.mat('concrete', { edge: 0.15, convex: 0.35, noShadowReceive: true });
  const DARK = { noShadowReceive: true, bands: [2, 3] as [number, number] };
  const treadShade = ctx.mat('concrete', { ...DARK, edge: 0.15, convex: 0.35 });
  const seatOpts = (axis: [number, number, number]) => ({
    elem: { kind: 'planks' as const, p: [...axis, P] as [number, number, number, number], seam: 1, hi: 0 },
    tones: SEAT_T,
    toneW: [0.3, 0.3] as [number, number],
    edge: 0.3,
    convex: 0.35,
  });
  /** 北看台的座椅全在影子袋里：固定暗档（深青绿），东 / 南看台的照常接收投影 */
  const seatN = ctx.mat('seat', { ...seatOpts([1, 0, 0]), ...DARK });
  const seatX = ctx.mat('seat', seatOpts([1, 0, 0]));
  const seatZ = ctx.mat('seat', seatOpts([0, 0, 1]));
  /**
   * 台阶：p = (顶端 x, z, 朝下方向 / 每级长)，q = (级数, 顶面高, 每级高)。不接收投影（lessons「立面不要接收投影」：
   * 窄踏面上的影子毛边 = 一片麻点）—— 走道是看台上亮一档的竖条，正好把暗的横带切成块。
   */
  const stairMat = (p: [number, number, number, number], q: [number, number, number, number], seed: number) =>
    ctx.mat('aisle', {
      elem: { kind: 'treads', p, q, size: [6, 14], seed },
      edge: 0.18,
      convex: 0.25,
      noShadowReceive: true,
      // 踏面落中档（N·L 0.69 < 0.75）：比影子袋亮一档、比踏面前沿的亮边暗 —— 竖条切开横带，但不抢人群
      bands: [0.1, 0.75],
    });
  const stucco = ctx.mat('stucco', {
    elem: { kind: 'stones', space: 'wall', size: [34, 7], seam: 0, hi: 0, seed: 4 },
    tones: STUCCO,
    toneW: [0.25, 0.3],
    noShadowReceive: true,
    edge: 0.4,
    convex: 0.3,
  });
  const cap = ctx.mat('cap', { edge: 0.3, convex: 0.6 });
  // 广告板：朝镜头 → lightUp 让它落中档、留住俱乐部蓝；一块板 2.4 米（planks 竖缝），板和板只差一点深浅
  const FACE = { lightUp: 0.6, bands: [-0.4, 0.4] as [number, number], noShadowReceive: true };
  const board = ctx.mat('counter', {
    ...FACE,
    elem: { kind: 'planks', p: [1, 0, 0, 2.4], seam: 1, hi: 0, seed: 6 },
    toneW: [0.18, 0.18],
    edge: 0.5,
    convex: 0.3,
  });
  const paint = ctx.mat('signPaint', { ...FACE, edge: 0.1, convex: 0 });
  const ball = ctx.mat('ball', { ...FACE, edge: 0.2, convex: 0 });

  const B = {
    riser: new GeoBuf(),
    tread: new GeoBuf(),
    seatN: new GeoBuf(),
    seatX: new GeoBuf(),
    seatZ: new GeoBuf(),
    treadLit: new GeoBuf(),
    treadShade: new GeoBuf(),
    stucco: new GeoBuf(),
    cap: new GeoBuf(),
    board: new GeoBuf(),
    paint: new GeoBuf(),
  };

  // ── 北看台：6 级 ──
  const runs = northRuns(N.x0, N.x1);
  for (let k = 0; k < N.n; k++) {
    const t = northTread(k);
    const y0 = k * N.rise;
    // 立面（朝南）：第 0 级整条（走道那段在广告板后面，看不见）；别的级走道里的立面是走道台阶的
    if (k === 0) B.riser.faceZ(N.x0, N.x1, y0, t.y, t.za);
    else for (const [a, b] of runs) B.riser.faceZ(a, b, y0, t.y, t.za);
    // 踏面：后面是影子袋（上一级立面 / 最高一级是后墙的投影），前沿一条亮边
    const pocket = Math.min(N.deep, (k < N.n - 1 ? N.rise : N.wallH) * SHADOW_PER_M);
    for (const [a, b] of runs) {
      B.treadShade.faceY(a, b, t.zb, t.zb + pocket, t.y);
      if (pocket < N.deep) B.treadLit.faceY(a, b, t.zb + pocket, t.za, t.y);
    }
    // 两头的端面（侧对镜头，主要是给投影用）
    B.riser.faceX(t.zb, t.za, 0, t.y, N.x0, -1);
    B.riser.faceX(t.zb, t.za, 0, t.y, N.x1, 1);
  }

  // ── 北看台走道（x ±7、±14）：每级拆成两步（0.45 高、0.6 深），最上一级 = 横走道 ──
  const aisleN = stairMat([0, NORTH_BACK.z1 + N.deep, 0, 1 / (N.deep / 2)], [10, top(N.n - 1), N.rise / 2, 0], 1);
  const AT = new GeoBuf();
  const AR = AT;
  for (const c of STANDS.aisles) {
    const x0 = c - AH;
    const x1 = c + AH;
    for (let k = 0; k < N.n; k++) {
      const t = northTread(k);
      if (k === N.n - 1) {
        AT.faceY(x0, x1, t.zb, t.za, t.y);
        continue;
      }
      const zm = t.zb + N.deep / 2;
      AT.faceY(x0, x1, zm, t.za, t.y); // 前半步
      AT.faceY(x0, x1, t.zb, zm, t.y + N.rise / 2); // 后半步
      AR.faceZ(x0, x1, t.y, t.y + N.rise / 2, zm); // 后半步的立面
      AR.faceZ(x0, x1, t.y + N.rise / 2, t.y + N.rise, t.zb); // 上一级立面的上半截
    }
  }

  // ── 西头端梯：贴着北看台西端，12 步（0.45 高）从场地北沿往北上到最高一级的横走道 ──
  const ws = { x0: N.x0 - 1.2, x1: N.x0, zFront: N.front + 0.4, steps: 12 };
  const wRun = (ws.zFront - NORTH_BACK.z1) / ws.steps;
  const wTopEdge = ws.zFront - wRun * (ws.steps - 1);
  const endMat = stairMat([0, wTopEdge, 0, 1 / wRun], [ws.steps - 1, top(N.n - 1), N.rise / 2, 0], 2);
  const WT = new GeoBuf();
  const WR = WT;
  for (let i = 0; i < ws.steps; i++) {
    const y = (N.rise / 2) * (i + 1);
    const za = ws.zFront - wRun * i;
    const zb = i === ws.steps - 1 ? NORTH_BACK.z1 : za - wRun;
    WT.faceY(ws.x0, ws.x1, zb, za, y);
    WR.faceZ(ws.x0, ws.x1, y - N.rise / 2, y, za);
    WR.faceX(zb, za, 0, y, ws.x0, -1);
  }

  // ── 后墙（白灰泥，最高一级后面，往西包住端梯顶）+ 陶砖压顶 ──
  const bw = { x0: ws.x0, x1: N.x1, z0: NORTH_BACK.z0, z1: NORTH_BACK.z1 };
  B.stucco.faceZ(bw.x0, bw.x1, top(N.n - 1), NORTH_BACK.top, bw.z1);
  B.stucco.faceZ(bw.x0, bw.x1, 0, NORTH_BACK.top, bw.z0, -1);
  B.stucco.faceX(bw.z0, bw.z1, 0, NORTH_BACK.top, bw.x0, -1);
  B.stucco.faceX(bw.z0, bw.z1, 0, NORTH_BACK.top, bw.x1, 1);
  B.cap.box(bw.x0 - 0.1, bw.x1 + 0.1, NORTH_BACK.top, NORTH_BACK.top + 0.16, bw.z0 - 0.1, bw.z1 + 0.1, ['ny']);

  // ── 座椅条 ──
  for (const r of seatRuns()) {
    const { panH, panD, backT, backH } = SEAT;
    if (northOnly && r.stand !== 'north') continue;
    if (r.stand === 'north') {
      B.seatN.box(r.a0, r.a1, r.y, r.y + panH, r.back + backT, r.back + backT + panD, ['ny', 'nz', 'px', 'nx']);
      B.seatN.box(r.a0, r.a1, r.y, r.y + backH, r.back, r.back + backT, ['ny', 'nz', 'px', 'nx']);
    } else if (r.stand === 'south') {
      // 朝北（背对镜头）：靠背在南边，靠背的背面朝镜头
      B.seatX.box(r.a0, r.a1, r.y, r.y + panH, r.back - backT - panD, r.back - backT, ['ny', 'pz', 'px', 'nx']);
      B.seatX.box(r.a0, r.a1, r.y, r.y + backH, r.back - backT, r.back, ['ny', 'px', 'nx']);
    } else {
      // 东看台朝西：座面在西、靠背在东；南头的端面朝镜头
      B.seatZ.box(r.back - backT - panD, r.back - backT, r.y, r.y + panH, r.a0, r.a1, ['ny', 'px', 'nz']);
      B.seatZ.box(r.back - backT, r.back, r.y, r.y + backH, r.a0, r.a1, ['ny', 'px', 'nz']);
    }
  }

  const ET = new GeoBuf();
  const ER = ET;
  let eMat: THREE.Material | null = null;
  if (!northOnly) {
    // ── 东看台（3 级，朝西）：立面朝西（侧对镜头），南头的阶梯形端面朝镜头 = 一块暗的侧影 ──
    const E = STANDS.east;
    for (let k = 0; k < E.n; k++) {
      const t = tier(k, E.rise, E.deep);
      const xa = E.front + t.a;
      const xb = E.front + t.b;
      B.riser.faceX(E.z0, E.z1, t.top - E.rise, t.top, xa, -1);
      B.tread.faceY(xa, xb, E.z0, E.z1, t.top);
      B.riser.faceZ(xa, xb, 0, t.top, E.z1, 1);
      B.riser.faceZ(xa, xb, 0, t.top, E.z0, -1);
    }
    const eBack = E.front + E.n * E.deep;
    // 东看台背后的矮墙（白灰泥 + 压顶），在台阶口断开
    const es = { x0: eBack, x1: eBack + 2.4, z0: -25.0, z1: -23.0, steps: 6 };
    const eTop = tier(E.n - 1, E.rise, E.deep).top;
    const parH = eTop + 0.9;
    for (const [z0, z1] of [
      [E.z0, es.z0],
      [es.z1, E.z1],
    ]) {
      B.stucco.faceY(eBack, eBack + 0.3, z0, z1, parH);
      B.stucco.faceZ(eBack, eBack + 0.3, 0, parH, z1, 1);
      B.stucco.faceZ(eBack, eBack + 0.3, 0, parH, z0, -1);
      B.stucco.faceX(z0, z1, 0, parH, eBack + 0.3, 1);
      B.stucco.faceX(z0, z1, eTop, parH, eBack, -1);
      B.cap.box(eBack - 0.05, eBack + 0.35, parH, parH + 0.12, z0, z1, ['ny']);
    }

    // ── 东看台背后上看台的台阶（接 clubplaza 的 STADIUM_LINK 小路）：6 级，从 x 24 往西上到东看台顶 ──
    // 比 terrain.ts 里白模的那段大 1 厘米（把它整个包住，terrain 还没删掉它之前也不打架）
    const eRun = (es.x1 - es.x0) / es.steps;
    const eRise = eTop / es.steps;
    eMat = stairMat([es.x0 + eRun, 0, 1 / eRun, 0], [es.steps - 1, eTop, eRise, 0], 3);
    const ez0 = es.z0 - 0.01;
    const ez1 = es.z1 + 0.01;
    for (let k = 0; k < es.steps; k++) {
      const y = eRise * (k + 1) + 0.01;
      const xa0 = es.x1 - eRun * k;
      const xa = xa0 + (k === 0 ? 0.01 : 0);
      const xb = k === es.steps - 1 ? es.x0 : xa0 - eRun;
      ET.faceY(xb, xa, ez0, ez1, y);
      ER.faceX(ez0, ez1, y - eRise - 0.01, y, xa, 1);
      ER.faceZ(xb, xa, 0, y, ez1, 1);
    }

    // ── 南看台（2 级，朝北 = 背对镜头）：背墙（朝镜头，白灰泥）= 下面一条暗带 ──
    const S = STANDS.south;
    for (let k = 0; k < S.n; k++) {
      const t = tier(k, S.rise, S.deep);
      const za = S.front + t.a;
      const zb = S.front + t.b;
      B.tread.faceY(S.x0, S.x1, za, zb, t.top);
      B.riser.faceZ(S.x0, S.x1, t.top - S.rise, t.top, za, -1);
      B.riser.faceX(za, zb, 0, t.top, S.x0, -1);
      B.riser.faceX(za, zb, 0, t.top, S.x1, 1);
    }
    const sBack = S.front + S.n * S.deep;
    const sTop = tier(S.n - 1, S.rise, S.deep).top;
    B.stucco.faceZ(S.x0, S.x1, 0, sTop, sBack, 1);
  }

  // ── 广告板：北看台第一级立面前面一道，x ±17.8（东头不伸进东看台） ──
  const bd = STANDS.board;
  const bz1 = N.front + bd.t + 0.01;
  const bx = 17.8;
  B.board.box(-bx, bx, 0, bd.h, N.front + 0.01, bz1, ['ny', 'nz', 'px', 'nx']);
  // 板上的字：四组"网球徽标 + 两个词"（字块 + 2 纹素字距，不写真字），放在长椅 / 伞挡不住的地方（x ±6.6、±13.6）
  const rnd = ctx.rng('stands:board');
  const discs: THREE.BufferGeometry[] = [];
  const zf = bz1 + 0.015;
  const LH = 0.36;
  const ly0 = (bd.h - LH) / 2;
  for (const cx of [-13.6, -6.6, 6.6, 13.6]) {
    const words = [3 + Math.floor(rnd() * 3), 4 + Math.floor(rnd() * 3)];
    const letters: number[][] = words.map((n) =>
      Array.from({ length: n }, () => [0.27, 0.27, 0.36, 0.18][Math.floor(rnd() * 4)]),
    );
    const wordW = (w: number[]) => w.reduce((s, v) => s + v, 0) + (w.length - 1) * 0.09;
    const total = 0.56 + 0.24 + wordW(letters[0]) + 0.27 + wordW(letters[1]);
    let x = cx - total / 2;
    const disc = new THREE.CircleGeometry(0.28, 12).toNonIndexed();
    disc.translate(x + 0.28, bd.h / 2, zf);
    discs.push(disc);
    x += 0.56 + 0.24;
    for (const w of letters) {
      for (const lw of w) {
        B.paint.faceZ(x, x + lw, ly0, ly0 + LH, zf);
        x += lw + 0.09;
      }
      x += 0.18;
    }
  }

  // ── 收成网格（一种材质一个） ──
  const add = (m: THREE.Mesh | null) => {
    if (m) root.add(m);
  };
  add(meshOf(B.riser, riserMat, 'stands:riser', { recv: false }));
  add(meshOf(B.tread, treadMat, 'stands:tread', { cast: false }));
  add(meshOf(B.treadLit, treadLit, 'stands:tread-lit', { cast: false, recv: false }));
  add(meshOf(B.treadShade, treadShade, 'stands:tread-pocket', { cast: false, recv: false }));
  add(meshOf(B.seatN, seatN, 'stands:seat-north', { cast: false, recv: false }));
  add(meshOf(B.seatX, seatX, 'stands:seat-south', { cast: false }));
  add(meshOf(B.seatZ, seatZ, 'stands:seat-east', { cast: false }));
  add(meshOf(AT, aisleN, 'stands:aisles', { recv: false }));
  add(meshOf(WT, endMat, 'stands:end-stair', { recv: false }));
  if (eMat) add(meshOf(ET, eMat, 'stands:east-stair', { recv: false }));
  add(meshOf(B.stucco, stucco, 'stands:stucco', { recv: false }));
  add(meshOf(B.cap, cap, 'stands:cap'));
  add(meshOf(B.board, board, 'stands:board', { recv: false }));
  add(meshOf(B.paint, paint, 'stands:board-paint', { recv: false, cast: false }));
  if (discs.length) {
    const g = discs.length > 1 ? mergeAll(discs) : discs[0];
    const m = new THREE.Mesh(g, ball);
    m.name = 'stands:board-ball';
    m.castShadow = false;
    m.receiveShadow = false;
    root.add(m);
  }
  let tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) tris += m.geometry.getAttribute('position').count / 3;
  });
  root.userData.triangles = tris;
  return root;
}

/** 几个同属性的几何体拼成一个（圆盘：position、normal、uv） */
function mergeAll(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv'] as const;
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = gs[0].getAttribute(n).itemSize;
    const arr: number[] = [];
    for (const g of gs) arr.push(...(g.getAttribute(n).array as Float32Array));
    out.setAttribute(n, new THREE.Float32BufferAttribute(arr, size));
  }
  return out;
}
