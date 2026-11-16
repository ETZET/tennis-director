// valley 的地形：平地（FLOOR 里 y = 0）、四周的山（高度场，按离平地边的距离长高）、北边山口外放风车的一块低地、
// 美术馆步道（从山脚一路爬到观景台，山在步道两边挖出一条台阶似的路面）。纯函数，不碰 three（平面图、导航、白模都用）。
//
// 正交 45° 俯视、镜头朝北（yaw 0）：平地南边的山（圣罗莎）在镜头和平地之间 —— 山高 > 离平地的距离就会挡住人。
// 所以南坡的坡度 < 45°（SLOPE_SOUTH < 1），西、北、东三面可以陡。
import { vnoise } from '../clubsite/render/noise';
import { ANCHOR, distToLine, FLOOR, inPoly, ROADS, S, SCALE, type V2 } from './layout';

// 2026-11-16 整个山谷往俱乐部门口缩到 SCALE（layout.ts 的 S）：这里手写的世界坐标照原尺寸写、过 S；大小、高度、坡度不缩
const sp = (pts: V2[]): V2[] => pts.map(([x, z]) => S(x, z) as V2);
/** 缩放后的位置 → 原尺寸（按方位定山高那几条线照原来的地理写） */
const U = (x: number, z: number): [number, number] => [
  ANCHOR[0] + (x - ANCHOR[0]) / SCALE,
  ANCHOR[1] + (z - ANCHOR[1]) / SCALE,
];

/** 俱乐部那块（clubwalk 的底图和区域管地面；山谷的地面、山在这里挖空）。对齐 20 米格子 */
export const CLUB_BOX = { x0: -80, x1: 140, z0: -60, z1: 100 } as const;

/** 北边山口外的低地（风车田；不能去，只看） */
export const PASS: V2[] = sp([
  [330, -1350],
  [420, -1400],
  [700, -1400],
  [860, -1340],
  [940, -1560],
  [900, -1780],
  [260, -1780],
  [220, -1560],
]);
/** 高度场的范围（山的外沿：再往外是天） */
/** 原尺寸 (−460…1880, −1900…640) 过 S；x0、z0 对齐俱乐部那块的 20 米格子（地面格子从这里起铺） */
export const HF = (() => {
  const [ax, az] = S(-460, -1900);
  const [bx, bz] = S(1880, 640);
  const snap = (v: number, o: number) => o - Math.ceil((o - v) / 20) * 20;
  return {
    x0: snap(ax, CLUB_BOX.x0),
    x1: Math.ceil(bx),
    z0: snap(az, CLUB_BOX.z0),
    z1: Math.ceil(bz),
    cell: 12,
  } as const;
})();

/** 离多边形边的距离（在里面 = 负） + 最近的边上的点 */
function polyDist(pts: readonly V2[], x: number, z: number): { d: number; nx: number; nz: number } {
  let best = Number.POSITIVE_INFINITY;
  let bx = 0;
  let bz = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j];
    const [cx, cz] = pts[i];
    const dx = cx - ax;
    const dz = cz - az;
    const L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bx = px;
      bz = pz;
    }
  }
  return { d: inPoly(pts, x, z) ? -best : best, nx: bx, nz: bz };
}

// ── 美术馆步道：沿线的高度（离起点的距离 → 米） ─────────────────────────
const TRAIL = ROADS.find((r) => r.id === 'museum_trail')?.pts ?? [];
/**
 * 111 号公路出北山口：路停在平地北沿，顺着最后一段的方向再往山口里延长 180 米 —— 沿这条线在山里切一道平的路槽
 * （路半宽 + 4 米路肩以内在地面以下，两边的坡每米升 0.6），路面上、路头外面都没有山
 */
/** 瀑布潭的潭心 */
const FALLS = S(16, -610);
/** 路槽只管这条线以北（原尺寸 z −1200） */
const HWY_Z = S(400, -1200)[1];
const HWY = (() => {
  const r = ROADS.find((q) => q.id === 'hwy111');
  if (!r || r.pts.length < 2) return null;
  const [a, b] = [r.pts[r.pts.length - 2], r.pts[r.pts.length - 1]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const e = 180 * SCALE;
  const ext: V2 = [b[0] + ((b[0] - a[0]) / L) * e, b[1] + ((b[1] - a[1]) / L) * e];
  return { pts: [...r.pts, ext] as V2[], half: r.w / 2 + 4 };
})();
function trailS(x: number, z: number): { s: number; d: number } {
  let best = Number.POSITIVE_INFINITY;
  let bs = 0;
  let acc = 0;
  for (let i = 1; i < TRAIL.length; i++) {
    const [ax, az] = TRAIL[i - 1];
    const [bx, bz] = TRAIL[i];
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) {
      best = d;
      bs = acc + L * t;
    }
    acc += L;
  }
  return { s: bs, d: best };
}
const TRAIL_LEN = (() => {
  let L = 0;
  for (let i = 1; i < TRAIL.length; i++) L += Math.hypot(TRAIL[i][0] - TRAIL[i - 1][0], TRAIL[i][1] - TRAIL[i - 1][1]);
  return L;
})();
/** 步道在山脚离起点多远：从这里开始往上爬（步道出平地边再走 4 米，山脚那圈 apron 里还是平的） */
const TRAIL_FOOT = (() => {
  let acc = 0;
  for (let i = 1; i < TRAIL.length; i++) {
    const [ax, az] = TRAIL[i - 1];
    const [bx, bz] = TRAIL[i];
    const L = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < L; t += 0.5)
      if (!inPoly(FLOOR, ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L)) return acc + t + 4;
    acc += L;
  }
  return 0;
})();
/** 步道的坡（高 / 水平）：山谷缩小以后步道短了，观景台跟着放低，坡度照旧好走 */
const TRAIL_GRADE = 0.3;
/** 观景台：步道的尽头，平的一块（原尺寸 (30, −992) 过 S；高 = 爬升段长 × TRAIL_GRADE） */
export const LOOKOUT = (() => {
  const [x, z] = S(30, -992);
  return { x, z, r: 11, y: Math.round((TRAIL_LEN - TRAIL_FOOT - 4) * TRAIL_GRADE) } as const;
})();
/** 步道上离起点 s 米处的高度（山脚以前是 0，往上线性爬到观景台） */
export const trailY = (s: number) =>
  s <= TRAIL_FOOT ? 0 : (LOOKOUT.y * Math.min(1, (s - TRAIL_FOOT) / (TRAIL_LEN - TRAIL_FOOT - 4))) ** 1;

/** 步道 / 观景台上能站的高度（不在上面 = null）。w = 步道半宽 */
export function trailSurface(x: number, z: number, w = 1.3): number | null {
  if (Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z) < LOOKOUT.r) return LOOKOUT.y;
  if (!TRAIL.length) return null;
  const { s, d } = trailS(x, z);
  return d < w ? trailY(s) : null;
}

// ── 山的高度 ───────────────────────────────────────────────────────────
//
// 画风照 clubsite/mountains.ts（棕榈泉光秃、一层层的岩山）：山脚一圈缓的冲积扇（FAN），往上是岩坡；岩坡上三道山梁
// （LAYERS：山前一个个小山包、主山梁、最外最高的一道），背坡陡于 45° → 从平地往北看，近的山梁剪影压在远的山梁的岩面上，
// 一层压一层；山梁的高、离山脚的远近按世界坐标的噪声起伏，山嘴（脊状噪声）一条条下来，岩面上再有一层小起伏 → 一个个
// 读得出朝向的岩面，不是几块大三角。山脚在平地边外 9…17 米（噪声）从地面以下钻出来：山脚线是一条起伏的线，不是锯齿。
const smooth = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** 南坡的坡度（高 / 水平）：< 1，挡不住平地上的人 */
const SLOPE_SOUTH = 0.75;
const SLOPE = 1.5;
/**
 * 山脚外沿的平地带（米，噪声在两个数之间）：山在这圈里往地下钻（每米 0.3，最深 −0.4）。窄 → 走到平地边就是山脚
 * （能走的边界看得出来）；钻得快 → 网格（山脚一圈 4 米一格）跨过平地边的三角形插值到平地里也在地面以下
 * （mountains 的网格量过：平地里网格高 ≤ 0.02 米）
 */
const APRON0 = 3.5;
const APRON1 = 13;
/** 山脚的冲积扇：离 apron 外沿 FAN 米以内坡度 FAN_K（缓，沙石坡），再往外是岩坡。山脚 20 米的地面格子中心高过 6 米 ⇒ 整格都在冲积扇上（地面不缺块） */
const FAN = 18;
const FAN_K = 0.34;
/**
 * 平地南边的山（镜头朝北俯视 45°，山在镜头和平地之间）：正北 k 米是平地的点压到 NEAR_K·k 以下 —— 比 45° 缓
 * （不挡人，坡面也不是正好顺着视线、被看成一条线）。相机离目标 120 米（valley/main.ts 的 camera.dist）：
 * y + k > 119·√2 ≈ 168 的点在近裁剪面外（不画）；NEAR_K·k 和 168 − k 在 k = NEAR_N 处相交，再往南的山很快放开
 * （反正被裁掉，不挡人），接得上不起崖。往旁边每米再放开 NEAR_SIDE 米：一侧有平地、一侧没有的地方不切出一道竖崖
 */
const NEAR_K = 0.75;
const NEAR_N = 168 / (1 + NEAR_K);
const NEAR_SIDE = 1.5;

/** 岩坡上的三道山梁：山脊离冲积扇起点 D ± dD 米、高 = 方位山高 × h、背坡陡度 out（高/水平，> 1 才压得住后面那道） */
interface Layer {
  D: number;
  dD: number;
  h: number;
  out: number;
  /** 一个个分开的山包：门槛噪声以下没有这道 */
  knob?: number;
}
const LAYERS: readonly Layer[] = [
  { D: 30, dD: 14, h: 0.36, out: 1.7, knob: 0.42 },
  { D: 92, dD: 30, h: 0.68, out: 1.5 },
  { D: 190, dD: 60, h: 1, out: 1.3 },
];
/** 转 30° 再取值噪声（值噪声的格子是正南正北的，转一下不出横平竖直的纹） */
const ROT_C = Math.cos(Math.PI / 6);
const ROT_S = Math.sin(Math.PI / 6);
/** 脊状噪声 0..1：1 是一条条细脊（山嘴），0 是宽的沟 */
const ridged = (x: number, z: number, seed: number) =>
  1 - Math.abs(2 * vnoise(x * ROT_C - z * ROT_S, x * ROT_S + z * ROT_C, seed) - 1);

// 美术馆步道南边的山（镜头朝北：步道南边的山在镜头和步道之间）：压在一个往南缓缓升高的"锥"下面，
// 坡 CONE_S < 1（不挡步道上的人），而且缓到拉远（zoom 2.6×）也不会被近裁剪面切开露出天
const CONE_S = 0.4;
const CONE_SIDE = 1.0;
const CONE_PTS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  let acc = 0;
  for (let i = 1; i < TRAIL.length; i++) {
    const [ax, az] = TRAIL[i - 1];
    const [bx, bz] = TRAIL[i];
    const L = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < L; t += 2) out.push([ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L, trailY(acc + t)]);
    acc += L;
  }
  if (TRAIL.length) {
    out.push([LOOKOUT.x, LOOKOUT.z, LOOKOUT.y]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      out.push([LOOKOUT.x + Math.cos(a) * LOOKOUT.r, LOOKOUT.z + Math.sin(a) * LOOKOUT.r, LOOKOUT.y]);
    }
  }
  return out;
})();
/** 美术馆步道北边那条老规则的范围 */
const TN = (() => {
  const [x0, z0] = S(-20, -1020);
  const [x1, z1] = S(200, -880);
  return { x0, x1, z0, z1 } as const;
})();
/** 锥管的范围（外面不管；靠边几十米放开，不切出一道崖） */
const CONE_BOX = (() => {
  const [x0, z0] = S(-200, -1010);
  const [x1, z1] = S(260, -640);
  return { x0, x1, z0, z1 } as const;
})();
/** 锥靠边放开的两条线（原尺寸 x −120、z −700） */
const [CONE_WX, CONE_SZ] = [S(-120, -800)[0], S(0, -700)[1]];
function coneLimit(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const [px, pz, py] of CONE_PTS) {
    if (pz >= z) continue;
    const v = py + (z - pz) * CONE_S + Math.abs(x - px) * CONE_SIDE;
    if (v < best) best = v;
  }
  // 靠边放开：往西过 −120、往南过 −700 每米加 3 米
  return best + Math.max(0, CONE_WX - x) * 3 + Math.max(0, z - CONE_SZ) * 3;
}

/**
 * 正北方向离平地多远（米，连续；点在平地里 = 0；kMax 以内没有 = Infinity）。
 * 竖线 x 和 FLOOR 的交点排好序，奇偶成段（同 inPoly 的奇偶规则）。
 */
/** FLOOR 的边按 x 分到 4 米一列的桶里（northFloor 每次只看一列的几条边） */
const COL = 4;
const COL_X0 = Math.min(...FLOOR.map((p) => p[0]));
const COLS: number[][] = (() => {
  const n = Math.ceil((Math.max(...FLOOR.map((p) => p[0])) - COL_X0) / COL) + 1;
  const cols: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0, j = FLOOR.length - 1; i < FLOOR.length; j = i++) {
    const a = Math.floor((Math.min(FLOOR[i][0], FLOOR[j][0]) - COL_X0) / COL);
    const b = Math.floor((Math.max(FLOOR[i][0], FLOOR[j][0]) - COL_X0) / COL);
    for (let c = a; c <= b; c++) cols[c].push(i);
  }
  return cols;
})();
function northFloor(x: number, z: number, kMax: number): number {
  const col = COLS[Math.floor((x - COL_X0) / COL)];
  if (!col) return Number.POSITIVE_INFINITY;
  const zs: number[] = [];
  for (const i of col) {
    const j = (i + FLOOR.length - 1) % FLOOR.length;
    const [xi, zi] = FLOOR[i];
    const [xj, zj] = FLOOR[j];
    if (xi > x !== xj > x) zs.push(zi + ((zj - zi) * (x - xi)) / (xj - xi));
  }
  zs.sort((a, b) => a - b);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < zs.length; i += 2) {
    if (zs[i] >= z) break;
    best = Math.min(best, Math.max(0, z - zs[i + 1]));
  }
  return best < kMax ? best : Number.POSITIVE_INFINITY;
}

/** mountainY 的附带输出：这一点归哪道山梁（0 山脚和近的山包、1 主山梁、2 最外最高的一道）—— 山的网格按它分材质 */
export interface MountainInfo {
  layer: number;
}

/** (x, z) 处山的高度（平地里、山脚外沿那圈 = 0 以下，被地面盖住）。info 给了就填这一点归哪道山梁 */
export function mountainY(x: number, z: number, info?: MountainInfo): number {
  const { d, nz } = polyDist(FLOOR, x, z);
  if (info) info.layer = 0;
  if (d <= 0) return -0.4;
  // 山口外的低地：平的，略有起伏
  const pass = polyDist(PASS, x, z).d;
  // 按方位定山高：西（圣哈辛托）最高、北次之、南（圣罗莎）矮、东边远远一道小山
  const [ux, uz] = U(x, z);
  const west = 1 - smooth(150, 420, ux);
  const east = smooth(1450, 1700, ux);
  const south = smooth(100, 300, uz);
  const north = 1 - smooth(-1450, -1250, uz);
  let H = 70 + west * 120 + north * 40 - south * 15 - east * 30;
  H *= 0.72 + 0.56 * vnoise(x / 110, z / 110, 3);
  // 坡度：山在平地南边（离平地最近的点在北边）→ 缓
  const southOfFloor = z - nz > d * 0.5;
  const k = southOfFloor ? SLOPE_SOUTH : SLOPE;
  // 山脚：平地边外 9…17 米（噪声）从地面以下钻出来
  // 两层起伏：30 米一个大弯 + 9 米一个小弯（平地边是长直线的地方，山脚线也不直）
  const da = d - (APRON0 + (APRON1 - APRON0) * vnoise(x / 30, z / 30, 17) + (vnoise(x / 9, z / 9, 19) - 0.5) * 3);
  let y: number;
  if (da <= 0) y = Math.max(-0.4, da * 0.3);
  else {
    // 山嘴（脊）的地方岩坡缓一点、伸出来，沟里陡一点、缩回去
    const spur = ridged(x / 52, z / 52, 23);
    const steep = k * (0.85 + 0.3 * vnoise(x / 40, z / 40, 7)) * (1 - 0.4 * spur);
    // 包络：冲积扇 + 岩坡（南坡整体 < 1）
    const env = FAN_K * Math.min(da, FAN) + steep * Math.max(0, da - FAN);
    // 山体的底（两道山梁之间也不塌到地面）+ 三道山梁取最高
    let best = Math.min(env, H * 0.2);
    for (let i = 0; i < LAYERS.length; i++) {
      const L = LAYERS[i];
      let h = H * L.h * (0.8 + 0.34 * spur) * (0.9 + 0.2 * vnoise(x / 30, z / 30, 51 + i));
      if (L.knob !== undefined) h *= smooth(L.knob, L.knob + 0.25, vnoise(x / 70, z / 70, 41));
      const D = L.D + L.dD * (vnoise(x / 120, z / 120, 31 + i) - 0.5) * 2;
      const yi = h - steep * Math.max(0, D - da) - L.out * Math.max(0, da - D);
      if (yi > best) {
        best = yi;
        if (info) info.layer = i;
      }
    }
    y = Math.min(env, best);
    // 岩面上的小起伏（离山脚远一点才有）：一个个读得出朝向的小岩面
    y += smooth(6, 30, da) * (ridged(x / 40, z / 40, 13) - 0.5) * 6;
    // 山脚上去的岩坡上一条条小山脊、小沟（18 米一条）：默认镜头一屏宽 17 米，岩坡不是一整块平涂
    y += smooth(3, 14, da) * ((ridged(x / 18, z / 18, 71) - 0.5) * 9 + (vnoise(x / 8, z / 8, 73) - 0.5) * 3);
  }
  // 下面这些都是往下压：压下去一大截的地方（山口、步道两边、45° 线下）颜色归近的那道
  const y0 = y;
  // 塔奎兹峡谷尽头的瀑布潭（south.ts / build.ts 的潭心，原尺寸 (16, −610)）：潭心 12 米内是平地（地面以下），
  // 再往外每米升 0.9 —— 潭和背后的岩壁靠着山，不插进山里
  {
    const fd = Math.hypot(x - FALLS[0], z - FALLS[1]);
    if (fd < 40) y = Math.min(y, -0.2 + Math.max(0, fd - 12) * 0.9 + Math.max(0, fd - 30) * 30);
  }
  if (HWY && z < HWY_Z) {
    const hd = distToLine(HWY.pts, x, z);
    if (hd < 60) y = Math.min(y, -0.2 + Math.max(0, hd - HWY.half) * 0.6 + Math.max(0, hd - 40) * 20);
  }
  // 山口外的风车田：一块低台地，上面一个个小沙丘（不是一整块平的）
  if (pass < 0)
    y = Math.min(
      y,
      1.5 + vnoise(x / 60, z / 60, 5) * 2.5 + ridged(x / 22, z / 22, 7) * 2.2 + vnoise(x / 9, z / 9, 9) * 0.8,
    );
  else if (pass < 120) y = Math.min(y, 1.5 + pass * 0.6);
  // 美术馆步道：两边挖出台阶似的路面；观景台一块平
  if (TRAIL.length) {
    const lo = Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z);
    // （两样都在外沿一下子放开到比哪座山都高：接得上，不切出一道崖）
    if (lo < LOOKOUT.r + 10)
      y = Math.min(y, LOOKOUT.y - 0.2 + Math.max(0, lo - LOOKOUT.r) * 0.6 + Math.max(0, lo - LOOKOUT.r - 5) * 60);
    const { s, d: td } = trailS(x, z);
    // 路面正下方再低一点（拐角里网格插值会拱起一点，藏在路面下面）；路边的石头、路标站在 −0.25 上
    if (td < 30)
      y = Math.min(
        y,
        trailY(s) -
          0.25 -
          0.3 * (1 - smooth(1.4, 2.4, td)) +
          Math.max(0, td - 7) * 0.8 +
          Math.max(0, td - 20) * 30 -
          // 路槽两边的坡上一块块小岩面（离路 8 米以外才有：路边的东西站在路面高上）
          smooth(8, 14, td) * (ridged(x / 11, z / 11, 91) * 3 + vnoise(x / 5, z / 5, 93) * 1.5),
      );
    if (x > CONE_BOX.x0 && x < CONE_BOX.x1 && z > CONE_BOX.z0 && z < CONE_BOX.z1)
      y = Math.min(
        y,
        // 锥面上的起伏（离步道、观景台 8 米以内不起伏：路边的东西站在路面高上）
        coneLimit(x, z) -
          smooth(8, 24, Math.min(td, lo - LOOKOUT.r)) *
            (ridged(x / 30, z / 30, 61) * 13 + vnoise(x / 12, z / 12, 63) * 6),
      );
  }
  // 镜头朝北俯视 45°：正北 k 米就是平地、山又高过 k → 挡住那块平地上的人（印第安峡谷口的东壁、山嘴北坡、塔奎兹峡谷南壁）。
  // 压到 NEAR_K·k 以下（见 NEAR_K）
  if (y > NEAR_K * d - 0.5) {
    // 往旁边 |dx| 米的那一列离平地至少 d − |dx|：再远的列压不到 y（剪掉）
    const R = Math.min(40, y / NEAR_SIDE, (y + 0.5 - NEAR_K * d) / (NEAR_SIDE - NEAR_K));
    // 压出来的坡面上再往下抠一点起伏（不是一整块平的斜面）
    const relief =
      smooth(2, 14, d) *
      (ridged(x / 24, z / 24, 81) * 6 + ridged(x / 13, z / 13, 85) * 5 + vnoise(x / 7, z / 7, 83) * 2.5);
    for (let dx = -Math.floor(R / 4) * 4; dx <= R; dx += 4) {
      const side = Math.abs(dx) * NEAR_SIDE;
      const k = northFloor(x + dx, z, (y + 0.5 - side) / NEAR_K);
      if (k < Number.POSITIVE_INFINITY) y = Math.min(y, NEAR_K * k - 0.5 + side + Math.max(0, k - NEAR_N) * 5 - relief);
    }
  }
  // 美术馆步道同理（范围 TN = 原尺寸 x −20…200、z −1020…−880 过 S）：步道在正北 k 米、山比步道高出 k 以上 → 挡住步道上的人。压到步道高 + 0.8k 以下（留点余量）
  if (TRAIL.length && x > TN.x0 && x < TN.x1 && z > TN.z0 && z < TN.z1)
    for (let k = 1; k < Math.min(60, y); k += 2) {
      const t = trailS(x, z - k);
      if (t.d < 2.5) {
        y = Math.min(y, trailY(t.s) + k * 0.8 - 0.5);
        break;
      }
    }
  // 颜色：低处、离平地近的都归近的那道（暖玫瑰褐）；浅的两档只给高处、远处的山梁
  if (info && (y < y0 - 4 || y < 45 || d < 50)) info.layer = 0;
  return Math.max(-0.4, y);
}

/** 离平地边多远（米，平地里 = 负）：山的网格按它定细不细 */
export const floorDist = (x: number, z: number) => polyDist(FLOOR, x, z).d;
/** 离美术馆步道（含观景台）多远（米） */
export function trailDist(x: number, z: number): number {
  const lo = Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z) - LOOKOUT.r;
  return TRAIL.length ? Math.min(lo, trailS(x, z).d) : lo;
}

/** 山谷平地上 (x, z) 在不在路上（离哪条路中线多近）：车只能开在路上 */
export function onRoad(x: number, z: number, pad = 0.6): boolean {
  for (const r of ROADS) {
    if (r.kind === 'trail') continue;
    if (distToLine(r.pts, x, z) < r.w / 2 + pad) return true;
  }
  return false;
}

export const inClubBox = (x: number, z: number) =>
  x >= CLUB_BOX.x0 && x <= CLUB_BOX.x1 && z >= CLUB_BOX.z0 && z <= CLUB_BOX.z1;
export const inFloor = (x: number, z: number) => inPoly(FLOOR, x, z);
