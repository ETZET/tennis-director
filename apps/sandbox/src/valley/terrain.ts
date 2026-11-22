// valley 的地形：平地（FLOOR 里 y = 0）、四周的山（高度场，按离平地边的距离长高）、北边山口外放风车的一块低地（layout.ts 的 PASS）。
// 纯函数，不碰 three（平面图、导航、白模都用）。2026-11-21 小镇压紧：美术馆步道、观景台、瀑布潭、111 号公路的路槽都删了。
//
// 正交 45° 俯视、镜头朝北（yaw 0）：平地南边的山在镜头和平地之间 —— 山高 > 离平地的距离就会挡住人。
// 所以南坡的坡度 < 45°（SLOPE_SOUTH < 1），西、北、东三面可以陡。
import { vnoise } from '../clubsite/render/noise';
import { distToLine, FLOOR, inPoly, PASS, ROADS, type V2 } from './layout';

/** 俱乐部那块（clubwalk 的底图和区域管地面；山谷的地面、山在这里挖空）。对齐 20 米格子 */
export const CLUB_BOX = { x0: -80, x1: 140, z0: -60, z1: 100 } as const;

/** 高度场的范围（山的外沿：再往外是天）；x0、z0 对齐俱乐部那块的 20 米格子（地面格子从这里起铺） */
export const HF = { x0: -300, x1: 920, z0: -720, z1: 420, cell: 12 } as const;

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
  // 按方位定山高：西（圣哈辛托，俱乐部背后）最高、北次之、南（圣罗莎）矮、东边一道小山
  const west = 1 - smooth(-20, 220, x);
  const east = smooth(640, 800, x);
  const south = smooth(110, 230, z);
  const north = 1 - smooth(-420, -260, z);
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
    // 山脚 10 米里（冲积扇的头上）：6～9 米一个的小鼓包、小沟（2026-11-21 小镇精细化，composition-1 第 10 条）——
    // 拉远看得到的山脚不是一整块平的扇面；只改高度，网格不加三角形（山脚一圈本来就是 4 米一格）
    y +=
      smooth(0.5, 4, da) *
      (1 - smooth(14, 26, da)) *
      ((vnoise(x / 6.5, z / 6.5, 95) - 0.5) * 2.6 + (ridged(x / 9, z / 9, 97) - 0.5) * 1.8);
  }
  // 下面这些都是往下压：压下去一大截的地方（山口、步道两边、45° 线下）颜色归近的那道
  const y0 = y;
  // 山口外的风车田：一块低台地，上面一个个小沙丘（不是一整块平的）
  if (pass < 0)
    y = Math.min(
      y,
      1.5 + vnoise(x / 60, z / 60, 5) * 2.5 + ridged(x / 22, z / 22, 7) * 2.2 + vnoise(x / 9, z / 9, 9) * 0.8,
    );
  else if (pass < 120) y = Math.min(y, 1.5 + pass * 0.6);
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
  // 颜色：低处、离平地近的都归近的那道（暖玫瑰褐）；浅的两档只给高处、远处的山梁
  if (info && (y < y0 - 4 || y < 45 || d < 50)) info.layer = 0;
  return Math.max(-0.4, y);
}

/** 离平地边多远（米，平地里 = 负）：山的网格按它定细不细 */
export const floorDist = (x: number, z: number) => polyDist(FLOOR, x, z).d;
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
