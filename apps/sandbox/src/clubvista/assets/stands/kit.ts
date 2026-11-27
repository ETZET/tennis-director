// 看台的公用做法（stand-north / stand-side / stand-south 三件都用）：一段 L 米长、n 级的混凝土看台 + 座椅条 + 坐着的观众。
// 本地坐标：看台沿 x（−L/2…L/2）、前沿在 z 0、一级级往 −z 升高；人朝 +z（朝场地）。场景里转过去（东西两边的看台转 ±90°）。
// 做法照 clubstadium 的北看台（stadium-stands.ts 的两条规矩，这里重写）：
//  1. 立面（朝 +z）不接收投影 → 每级一整条干净的暗档（strata 元素：浇筑缝、模板块），远看一条暗带；
//  2. 踏面的影子袋是几何切出来的（后半是固定暗档、前沿一条亮边，都不接收投影）：不靠阴影贴图，边是直线，不出碎点。
//     只给"立面朝镜头"的看台（北看台）开 pocket；东西两边的看台立面侧对镜头，踏面照常接收投影。
// 观众：每种颜色一个 InstancedMesh（衣服 5 + 皮肤 3 + 帽子 2），2～4 个连座一组、组和组之间空座，组按名次进场 / 散场：
//   userData.setFill(f)：0 = 空场（露出一排排深青绿的座椅 = 安静），1 = 坐满（约八成五的座）。实例按名次排好，改 count 就行，不重建。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../../ctx';
import type { Pal } from '../../palette';

type C3 = [number, number, number];
const tn = (lit: C3, mid: C3, dark: C3, seam: C3, hi: C3) => ({ bands: [lit, mid, dark] as [C3, C3, C3], seam, hi });

/** 立面混凝土（同 clubstadium 的 RISER）：暗档往冷紫走（同崖壁），L 98 */
const RISER = tn(
  [0xe8c69e, 0xf0d0aa, 0xdcba94],
  [0xc89a8e, 0xd0a496, 0xbc9088],
  [0x6a52a0, 0x745ca8, 0x604896],
  [0xc8a688, 0xa47c7a, 0x524478],
  [0xfae0bc, 0xdcb2a2, 0x86729e],
);
/** 座椅：俱乐部青绿，影子里深青绿（L 75） */
const SEAT_T = tn(
  [0x5cb488, 0x68bc90, 0x52aa80],
  [0x3a8a74, 0x44947c, 0x32806c],
  [0x24546a, 0x2c5e74, 0x1e4a62],
  [0x3e8a70, 0x286456, 0x163a52],
  [0x7cc89a, 0x58a488, 0x386c7e],
);
/** 白灰泥后墙（朝镜头的南看台背面）：大块灰泥斑、没有缝 */
const STUCCO = tn(
  [0xfaeedc, 0xfff6e6, 0xf0e2d0],
  [0xdcc6c0, 0xe4cec8, 0xd2bcb8],
  [0x8e7a9e, 0x9884a8, 0x847096],
  [0xd8c8b8, 0xb8a4a4, 0x6e5e86],
  [0xffffff, 0xf0dcd6, 0xa290b2],
);

export interface StandSpec {
  name: string;
  /** 长（米，沿 x） */
  L: number;
  /** 级数 */
  n: number;
  /** 每级深、每级高 */
  D?: number;
  R?: number;
  /** 立面朝镜头（北看台）：踏面切影子袋、立面贴广告板 */
  facing?: boolean;
  /** 后墙朝镜头（南看台）：后墙是白灰泥、顶上一道压顶 */
  backFacing?: boolean;
  /** 走道的中心（本地 x）：走道里没有座、踏面是亮一档的台阶 */
  aisles?: number[];
  /** 第一级前面的矮墙 + 广告板（米高，0 = 没有） */
  wall?: number;
  /** 两头的端墙 */
  ends?: boolean;
  /** 观众的种子（同一件的不同摆放坐法不同） */
  seed?: string;
  /** 坐得密（边看台：人侧对镜头、俯视里很窄，要坐密了才读得出"满"，簇间只空 0～1 座） */
  dense?: boolean;
  /** 上面几排盖一条遮阳篷（俱乐部蓝、固定中档：冷的一条安静的带，压住一半观众；第 2 轮评判：边看台的观众是整屏最吵的花条纹） */
  awning?: number;
}

const PERSON = {
  lightUp: 0.6,
  bands: [-0.45, 0.3] as [number, number],
  noShadowReceive: true,
  edge: 0.35,
  convex: 0.3,
};
const SHIRTS: (keyof Pal)[] = ['clothWhite', 'canvas', 'clothBlue', 'clothRed', 'flowerYellow'];
const SHIRT_W = [5, 5, 4, 0.3, 0.6];
const SKINS: (keyof Pal)[] = ['skinLight', 'skinTan', 'skinDark'];
const SKIN_W = [4, 3, 2];
// 第 4 轮：头只留肤色 + 一种发色（草帽 / 白帽在 1.4× 下是一排排亮点）
const HATS: (keyof Pal)[] = ['hair', 'hair'];
const SEAT_P = 0.54;

const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** 一块朝某方向的平面（只要看得见的那面） */
function face(dir: 'pz' | 'py' | 'nz' | 'px' | 'nx', a0: number, a1: number, b0: number, b1: number, c: number) {
  // pz/nz：x a0..a1、y b0..b1、z = c；py：x a0..a1、z b0..b1、y = c；px/nx：z a0..a1、y b0..b1、x = c
  const g = new THREE.PlaneGeometry(1, 1);
  if (dir === 'pz' || dir === 'nz') {
    if (dir === 'nz') g.rotateY(Math.PI);
    g.scale(a1 - a0, b1 - b0, 1);
    g.translate((a0 + a1) / 2, (b0 + b1) / 2, c);
  } else if (dir === 'py') {
    g.rotateX(-Math.PI / 2);
    g.scale(a1 - a0, 1, b1 - b0);
    g.translate((a0 + a1) / 2, c, (b0 + b1) / 2);
  } else {
    g.rotateY(dir === 'px' ? Math.PI / 2 : -Math.PI / 2);
    g.scale(1, b1 - b0, a1 - a0);
    g.translate(c, (b0 + b1) / 2, (a0 + a1) / 2);
  }
  g.deleteAttribute('uv');
  return g;
}
const mesh = (gs: THREE.BufferGeometry[], m: THREE.Material, name: string, cast = false, recv = false) => {
  const g = gs.length
    ? mergeGeometries(
        gs.map((x) => {
          const y = x.index ? x.toNonIndexed() : x;
          y.deleteAttribute('uv');
          return y;
        }),
      )
    : new THREE.BufferGeometry();
  const o = new THREE.Mesh(g, m);
  o.name = name;
  o.castShadow = cast;
  o.receiveShadow = recv;
  return o;
};

export function buildStand(ctx: AssetCtx, s: StandSpec): THREE.Object3D {
  const D = s.D ?? 0.9;
  const R = s.R ?? 0.45;
  const L = s.L;
  const n = s.n;
  const x0 = -L / 2;
  const x1 = L / 2;
  const root = new THREE.Group();
  root.name = s.name;
  const AW = 1.0; // 走道宽
  const inAisle = (x: number, pad = 0) => (s.aisles ?? []).some((c) => Math.abs(x - c) < AW / 2 + pad);

  // ── 材质 ──
  const riserMat = ctx.mat('concrete', {
    elem: { kind: 'strata', space: 'wall', size: [26, 10], hi: 0.35, q: [9, 999, 0, 0], seed: 3 },
    tones: RISER,
    noShadowReceive: true,
    edge: 0.3,
    convex: 0.25,
  });
  const DARK = { noShadowReceive: true, bands: [2, 3] as [number, number] };
  // 第 4 轮：踏面前沿落中灰紫（≈ #8a86a0），不是亮沙色：6 排亮沙 + 藏青立面叠出 12 道高反差横条
  const treadLit = ctx.mat('treadMid', { edge: 0.1, convex: 0.2, noShadowReceive: true, bands: [-2, 2] });
  const treadShade = ctx.mat('concrete', { ...DARK, edge: 0.15, convex: 0.35 });
  const treadRecv = ctx.mat('concrete', { edge: 0.15, convex: 0.35 });
  const seatOpts = {
    elem: { kind: 'planks' as const, p: [1, 0, 0, SEAT_P] as [number, number, number, number], seam: 0.35, hi: 0 },
    tones: SEAT_T,
    toneW: [0.3, 0.3] as [number, number],
    edge: 0.3,
    convex: 0.35,
  };
  // 座椅（第 3 轮）：低反差的冷灰紫一个调子（不用饱和的青绿：簇和簇之间露出的绿 / 藏青条纹很吵、空场像百叶格栅），
  // 没有板缝；不接投影（座面上的影子毛边是麻点）
  void seatOpts;
  const seatMat = ctx.mat('seatCalm', {
    noShadowReceive: true,
    edge: 0.15,
    convex: 0.2,
    elem: { kind: 'planks', p: [1, 0, 0, SEAT_P], seam: 0.6, hi: 0 },
  });
  const aisleMat = ctx.mat('treadMid', { edge: 0.12, convex: 0.2, noShadowReceive: true, bands: [-2, 2] });
  const stucco = ctx.mat('stucco', {
    elem: { kind: 'stones', space: 'wall', size: [34, 7], seam: 0, hi: 0, seed: 4 },
    tones: STUCCO,
    toneW: [0.25, 0.3],
    noShadowReceive: true,
    edge: 0.4,
    convex: 0.3,
  });
  const cap = ctx.mat('cap', { edge: 0.3, convex: 0.6 });
  const FACE = { lightUp: 0.6, bands: [-0.4, 0.4] as [number, number], noShadowReceive: true };
  const board = ctx.mat('counter', {
    ...FACE,
    elem: { kind: 'planks', p: [1, 0, 0, 2.4], seam: 1, hi: 0, seed: 6 },
    toneW: [0.18, 0.18],
    edge: 0.5,
    convex: 0.3,
  });
  const paint = ctx.mat('signPaint', { ...FACE, edge: 0.1, convex: 0 });

  const G = {
    riser: [] as THREE.BufferGeometry[],
    lit: [],
    shade: [],
    recv: [],
    seat: [],
    aisle: [],
    back: [],
    cap: [],
    board: [],
    paint: [],
    wallCap: [],
  } as Record<string, THREE.BufferGeometry[]>;
  // 影子袋：上一级立面（R 高）在踏面上的影子长 ≈ R / tan(46°) ≈ 0.97 R
  const pocket = Math.min(D - 0.22, R * 0.97);
  for (let k = 0; k < n; k++) {
    const yT = (k + 1) * R;
    const zf = -k * D;
    const zb = -(k + 1) * D;
    // 立面（朝 +z）
    G.riser.push(face('pz', x0, x1, k * R, yT, zf));
    // 踏面
    if (s.facing) {
      G.shade.push(face('py', x0, x1, zb, zb + pocket, yT));
      G.lit.push(face('py', x0, x1, zb + pocket, zf, yT));
    } else G.recv.push(face('py', x0, x1, zb, zf, yT));
    // 两头的端面
    if (s.ends !== false) {
      G.riser.push(face('nx', zb, zf, 0, yT, x0));
      G.riser.push(face('px', zb, zf, 0, yT, x1));
    }
    // 座椅条（座面 0.42 高、0.4 深，靠背 0.12 厚到 0.8）：贴着踏面后沿；走道处断开
    const runs: [number, number][] = [];
    let a = x0 + 0.15;
    for (const c of [...(s.aisles ?? [])].sort((p, q) => p - q)) {
      if (c - AW / 2 > a) runs.push([a, c - AW / 2]);
      a = c + AW / 2;
    }
    if (x1 - 0.15 > a) runs.push([a, x1 - 0.15]);
    for (const [r0, r1] of runs) {
      const w = r1 - r0;
      if (w < SEAT_P) continue;
      const cx = (r0 + r1) / 2;
      G.seat.push(bx(w, 0.42, 0.4, cx, yT + 0.21, zb + 0.12 + 0.2));
      G.seat.push(bx(w, 0.8, 0.12, cx, yT + 0.4, zb + 0.06));
    }
    // 走道台阶：每级踏面上两小级（亮一档的竖条，把横带切成块）
    for (const c of s.aisles ?? []) {
      for (const h of [0, 0.5]) {
        const y = k * R + R * (h + 0.5);
        G.aisle.push(bx(AW, 0.04, D / 2, c, y + 0.02, zf - D * (h + 0.25)));
        G.aisle.push(face('pz', c - AW / 2, c + AW / 2, y - R / 2 + 0.01, y + 0.01, zf - D * h + 0.002));
      }
    }
  }
  // 后墙（朝 −z）
  const yTop = n * R;
  const zBack = -n * D;
  if (s.backFacing) {
    G.back.push(face('nz', x0, x1, -0.3, yTop + 0.5, zBack));
    G.cap.push(bx(L + 0.1, 0.12, 0.3, 0, yTop + 0.56, zBack + 0.1));
    G.back.push(face('pz', x0, x1, yTop, yTop + 0.5, zBack + 0.25));
  } else {
    G.back.push(face('nz', x0, x1, 0, yTop, zBack));
    G.cap.push(bx(L, 0.1, 0.24, 0, yTop + 0.05, zBack + 0.12));
  }
  // 第一级前的矮墙 + 广告板（俱乐部蓝、一块 2.4 米、每块正中一道奶油粗划）
  if (s.wall) {
    const h = s.wall;
    G.board.push(face('pz', x0, x1, 0, h, 0.32));
    // 矮墙压顶落中灰紫（第 4 轮：边看台前沿的亮橙压顶是贯穿全屏的两条竖线）
    G.wallCap.push(bx(L, 0.08, 0.32, 0, h + 0.04, 0.16));
    for (let x = x0 + 1.2; x < x1 - 0.6; x += 2.4) {
      if (inAisle(x, 0.4)) continue;
      G.paint.push(face('pz', x - 0.5, x + 0.5, h * 0.42, h * 0.62, 0.325));
    }
  }

  root.add(mesh(G.riser, riserMat, 'risers', true, false));
  root.add(mesh(G.lit, treadLit, 'treads-lit'));
  root.add(mesh(G.shade, treadShade, 'treads-shade'));
  root.add(mesh(G.recv, treadRecv, 'treads', false, true));
  root.add(mesh(G.seat, seatMat, 'seats'));
  // 遮阳篷（第 3 轮）：只盖最上面 awning 排（≈ 4 成进深），连续的一整条灰蓝篷布（固定一档，没有斜高光），
  // 前沿一条下摆每 2 米一个浅弧（垂边长短两档 = 波浪）；后面一排细柱。第 2 轮盖了两排、一块块深浅相间，像两堵蓝墙 / 太阳能板。
  if (s.awning) {
    const za = -(n - s.awning) * D + 0.1;
    const yb = n * R + 1.7;
    const yf = n * R + 1.45;
    const len = Math.hypot(za - zBack, yb - yf);
    const tilt = -Math.PI / 2 + Math.atan2(yb - yf, za - zBack);
    const top = new THREE.PlaneGeometry(L + 0.2, len).rotateX(tilt);
    top.translate(0, (yb + yf) / 2, (za + zBack) / 2);
    const hem: THREE.BufferGeometry[] = [];
    for (let xa = x0 - 0.1; xa < x1 + 0.1 - 1e-3; xa += 1) {
      const w = Math.min(1, x1 + 0.1 - xa);
      const h = Math.round((xa - x0) / 1) % 2 ? 0.14 : 0.24;
      hem.push(new THREE.PlaneGeometry(w, h).translate(xa + w / 2, yf - h / 2, za));
    }
    const awnOpts = { noShadowReceive: true, lightUp: 0, edge: 0.3, convex: 0, bands: [-2, 2] as [number, number] };
    const mTop = ctx.mat('awning', awnOpts);
    const mHem = ctx.mat('awning', { ...awnOpts, bands: [2, 3] as [number, number] });
    // 单面篷布投影要双面，否则影子断成一串点
    mTop.shadowSide = THREE.DoubleSide;
    root.add(mesh([top], mTop, 'awning', true));
    root.add(mesh(hem, mHem, 'awning-hem'));
    const posts: THREE.BufferGeometry[] = [];
    for (let x = x0 + 0.3; x <= x1 - 0.2; x += 5.4)
      posts.push(bx(0.14, yb - yTop, 0.14, x, yTop + (yb - yTop) / 2, zBack + 0.1));
    root.add(mesh(posts, ctx.mat('metal', { edge: 0.3, convex: 0.3 }), 'awning-posts', true));
  }
  root.add(mesh(G.aisle, aisleMat, 'aisles'));
  root.add(mesh(G.back, s.backFacing ? stucco : riserMat, 'back', true, false));
  root.add(mesh(G.cap, cap, 'cap', false, true));
  if (s.wall) {
    root.add(mesh(G.board, board, 'boards'));
    root.add(mesh(G.wallCap, ctx.mat('treadMid', { edge: 0.2, convex: 0.3, bands: [-2, 2] }), 'wall-cap'));
    root.add(mesh(G.paint, paint, 'board-paint'));
  }
  for (const c of [...root.children])
    if ((c as THREE.Mesh).geometry.getAttribute('position') === undefined) root.remove(c);

  // ── 观众 ──
  const crowd = buildCrowd(ctx, s, { D, R, AW, inAisle });
  root.add(crowd.obj);
  root.userData.setFill = crowd.setFill;
  root.userData.crowd = crowd;
  const f0 = ctx.params.get('crowd');
  // 默认半场（第三轮：坐满的看台一圈几百个一样大的人头，强边缘超标）；?crowd=1 坐满、?crowd=empty 空场
  crowd.setFill(f0 === 'empty' || f0 === '0' ? 0 : f0 && Number.isFinite(Number(f0)) ? Number(f0) : 0.5);
  return root;
}

interface Seat {
  x: number;
  y: number;
  z: number;
}

function buildCrowd(
  ctx: AssetCtx,
  s: StandSpec,
  o: { D: number; R: number; AW: number; inAisle: (x: number, pad?: number) => boolean },
) {
  const rnd = ctx.rng(`stand:${s.seed ?? s.name}`);
  const pick = (w: number[]) => {
    const sum = w.reduce((a, b) => a + b, 0);
    let r = rnd() * sum;
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) return i;
    }
    return w.length - 1;
  };
  // 座位：每级一排，座位中心按 0.54 米一格（避开走道和两头）
  const rows: Seat[][] = [];
  for (let k = 0; k < s.n; k++) {
    const row: Seat[] = [];
    const yT = (k + 1) * o.R + 0.42;
    const z = -(k + 1) * o.D + 0.12 + 0.2;
    for (let x = -s.L / 2 + 0.15 + SEAT_P / 2; x < s.L / 2 - 0.15 - SEAT_P / 2 + 1e-6; x += SEAT_P) {
      if (o.inAisle(x, SEAT_P / 2 - 0.05)) {
        row.push({ x: Number.NaN, y: 0, z: 0 });
        continue;
      }
      row.push({ x, y: yT, z });
    }
    rows.push(row);
  }
  interface P {
    seat: Seat;
    shirt: number;
    skin: number;
    hat: number;
    rank: number;
    jit: number;
  }
  const people: P[] = [];
  for (const [k, row] of rows.entries()) {
    let i = 0;
    while (i < row.length) {
      const n = 3 + Math.floor(rnd() * 3);
      // 名次：中间、下面几排先坐（第三轮评判：均匀撒开的半场读成一圈噪点）——
      // 按离看台正中的距离 + 排数排，抖一点：坐到一半时是正中一大块人、两头露出空座
      const gx = row[Math.min(i + 1, row.length - 1)].x;
      const r =
        Math.min(1, Math.abs(Number.isNaN(gx) ? 0 : gx) / (s.L / 2)) * 0.62 +
        (k / Math.max(1, s.n - 1)) * 0.2 +
        rnd() * 0.18;
      const groupShirt = pick(SHIRT_W);
      const groupHat = rnd() < 0.5 ? Math.floor(rnd() * 2) : -1;
      for (let j = 0; j < n && i < row.length; j++, i++) {
        const st = row[i];
        if (Number.isNaN(st.x)) break;
        people.push({
          seat: st,
          shirt: rnd() < 0.8 ? groupShirt : pick(SHIRT_W),
          skin: pick(SKIN_W),
          hat: rnd() < 0.55 ? (groupHat >= 0 && rnd() < 0.6 ? groupHat : Math.floor(rnd() * 2)) : -1,
          rank: r * 0.98,
          jit: rnd(),
        });
      }
      // 组后面空 1～2 个座（簇和簇之间留空：第 2 轮评判；第 3 轮 2～3 个空太稀，坐满读不出"满"）
      i += s.dense ? (rnd() < 0.5 ? 0 : 1) : rnd() < 0.6 ? 1 : 2;
    }
  }
  people.sort((a, b) => a.rank - b.rank);
  // 满座时最多坐到名次 0.86（一成五空着，成片的空位在两头）
  const FULL = 0.94;

  // ── 几何（本地：原点 = 座面中心，人朝 +z）：身子 + 大腿 + 头 + 帽子（宽檐 + 帽顶）──
  // 坐着：只露头和肩（腿被前一排的椅背和立面挡住，不建），第 3 轮评判"一排保龄球瓶"
  const body = bx(0.42, 0.34, 0.3, 0, 0.17, 0);
  const head = bx(0.3, 0.28, 0.28, 0, 0.48, 0.01);
  const hat = bx(0.31, 0.08, 0.29, 0, 0.6, 0.0);
  const root = new THREE.Group();
  root.name = 'crowd';
  const meshes: { im: THREE.InstancedMesh; ranks: number[] }[] = [];
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const inst = (geo: THREE.BufferGeometry, key: keyof Pal, who: P[], name: string) => {
    if (!who.length) return;
    const im = new THREE.InstancedMesh(geo, ctx.mat(key, PERSON), who.length);
    who.forEach((p, k) => {
      pos.set(p.seat.x + (p.jit - 0.5) * 0.06, p.seat.y, p.seat.z);
      q.setFromEuler(e.set(0, (p.jit - 0.5) * 0.3, 0));
      // 两种高度（大人 / 矮一截的）
      mtx.compose(pos, q, scl.set(1, p.jit < 0.35 ? 0.82 : 1, 1));
      im.setMatrixAt(k, mtx);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = false;
    im.frustumCulled = false;
    im.name = name;
    root.add(im);
    meshes.push({ im, ranks: who.map((p) => p.rank) });
  };
  SHIRTS.forEach((k, i) => {
    inst(
      body,
      k,
      people.filter((p) => p.shirt === i),
      `crowd:${k}`,
    );
  });
  SKINS.forEach((k, i) => {
    inst(
      head,
      k,
      people.filter((p) => p.skin === i),
      `crowd:${k}`,
    );
  });
  HATS.forEach((k, i) => {
    inst(
      hat,
      k,
      people.filter((p) => p.hat === i),
      `crowd:hat:${k}`,
    );
  });
  let fill = 1;
  const setFill = (f: number) => {
    fill = Math.max(0, Math.min(1, f));
    const lim = fill * FULL;
    for (const m of meshes) {
      let c = 0;
      while (c < m.ranks.length && m.ranks[c] < lim) c++;
      m.im.count = c;
      m.im.visible = c > 0;
    }
  };
  return {
    obj: root,
    setFill,
    get fill() {
      return fill;
    },
    count: people.length,
  };
}
