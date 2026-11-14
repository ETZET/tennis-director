// clubpark 的构图（手摆）。世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）：
// 共用的常量（围墙、大门、车道、两片停车场、前台、到达小院）只从 ../clubsite/world import，这里不改、不复制数值；
// 这里只放这个场景自己的东西（岗亭、遮阳棚、花坛、车位、步道、台地、站位、路线、云）。
// 相机 yaw 0：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米）；
// 竖屏 390×844 在 px 1 下是 17.5 × 38 米的画面（地面纵深 ±26.9 米），横屏 1280×720 是 57.6 × 32.4 米。
//
//            x 60（东墙）                                         x ≈ 101 地图东沿 → 往东是谷地，x ≈ 140 起是山
//   z −28  ──┤▓▓▓▓ 北边高一级的沙漠台地（+1.2，崖壁朝南 = 暗带）▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//   z −25    │步│ ╔══ 遮阳棚 A ══╗╔══ 遮阳棚 B ══╗   北停车场 LOT_N（远排：车头朝北）
//            │道│ ║ 车 车 · 车 车 ║║ · 车 · 车  ║
//   z −20    │  │ ─────────── 通道（找车位的车在这里慢慢开）──────────
//   z −12    │  │ 车 · 车 [进出口] 车 车 车            （近排：车头朝南）
//   z −9  大 │岗亭│ ▓▓ 北花坛（0.55 米土坯矮墙 = 暗带）▓▓  [口]  ▓▓▓▓▓▓▓▓▓▓
//   z −4  门 ├────── 落客区（连锁砖，最亮）──┬───────── 车道 DRIVE（沥青，西行 = 进来）──────── 画外 →
//   z  0  ═══╡ 门童 · 代客 · 下车的会员 · 落客的车   ─ ─ ─ 中线 ─ ─ ─
//   z +4     ├──────────────────────────────┴───────── （东行 = 出去）──────────────────────
//   z +6     │  │ ▓▓ 南花坛 + 俱乐部立牌 ▓▓  [口]  ▓▓ 南花坛（蒲葵）▓▓
//   z +7     │步│ · 车 · · ·        · · 车 ·        南停车场 LOT_S（近排：空着 = 安静的地方）
//   z +12    │道│ ─────────── 通道 ───────────
//   z +20    │  │ ╔══ 遮阳棚 C ══╗╔══ 遮阳棚 D ══╗   （远排：车头朝南）
//   z +27  ──┤▓▓▓▓ 往下一级的沙漠（−1.0，停车场南沿的挡土墙朝南 = 暗带）▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//
// 原则：主角 = 大门 + 岗亭 + 落客区（竖屏中间偏上，画面左边）；车道是从右边画外引到大门的一条横线，
// 尽头是最亮的连锁砖落客区；北花坛的矮墙、遮阳棚的投影、两头的台地崖壁是暗带；南停车场近排基本空着（安静）。
// 高的蒲葵只放在不会把投影甩到落客区的地方（墙边步道、南花坛东段、北花坛东段），落客区附近的花坛只种矮的。
import { DESK, DRIVE, GATE, LOT_N, LOT_S } from '../clubsite/world';

export type V2 = [number, number];
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/** 各层高度（米） */
export const H = {
  /** 地面：车道、停车场、落客区、俱乐部里面、往外一直到山脚的沙漠（和 clubmap2 的地面一样是 0） */
  ground: 0,
  /** 花坛顶（土坯矮墙围起来） */
  berm: 0.55,
  /** 路缘石顶 */
  kerb: 0.15,
  /** 北边高一级的沙漠台地 */
  desertN: 1.2,
  /** 南边低一级的沙漠 */
  desertS: -1.0,
};

/** 相机默认看向的地面点（竖屏 / 横屏）：竖屏把大门、岗亭、落客区放在左边偏上，横屏从大门里一直看到地图东沿的沙漠（车道从右边出画） */
export const VIEW = {
  portrait: { tx: 67.4, tz: -2.6 },
  landscape: { tx: 79.5, tz: -1.5 },
};

/** 围墙（和 clubmap2/build.ts 一样：1.9 米高、0.7 米厚、压顶 0.18、每 12 米一根壁柱 1.1 见方高 2.4） */
export const WALL = { x: GATE.x, h: 1.9, t: 0.7, capH: 0.18, pilaster: 1.1, pilasterH: 2.4 } as const;
/** 大门柱：中心 z（门洞两边各让 0.8 米），1.7 见方、4.6 米高；柱帽 1.9 见方 0.4；柱顶网球半径 0.55（球心 y 5.5） */
export const GATE_POSTS = [GATE.z0 - 0.8, GATE.z1 + 0.8] as const;
/** 墙外脚下（墙的东面）：x */
export const WALL_OUT = GATE.x + WALL.t / 2;

// ── 停车位（场景自己的细节；停车场的范围 = clubmap2 的 LOT_N / LOT_S）────────────
/** 车位宽 2.7（= 30 设计纹素）、深 5.2；第一个车位从 x 65.25 开始，一排 8 个 */
export const STALL = { w: 2.7, d: 5.2, x0: 65.25, n: 8 } as const;
/** 进出口（近排空出 2 个车位的宽度，北花坛、南花坛同一处开口） */
export const ENTRY = { x0: STALL.x0 + STALL.w * 3, x1: STALL.x0 + STALL.w * 5 } as const;

export interface Row {
  id: string;
  /** 车位的 z 范围 */
  z0: number;
  z1: number;
  /** 车头朝哪边：−1 = 北（−z），+1 = 南（+z） */
  nose: -1 | 1;
  /** 哪几个车位是空出来的进出口（不画线、不停车） */
  gap?: [number, number];
}
export const ROWS: Row[] = [
  { id: 'n-far', z0: LOT_N.z0 + 0.6, z1: LOT_N.z0 + 0.6 + STALL.d, nose: -1 },
  { id: 'n-near', z0: LOT_N.z1 - 0.8 - STALL.d, z1: LOT_N.z1 - 0.8, nose: 1, gap: [3, 4] },
  { id: 's-near', z0: LOT_S.z0 + 0.8, z1: LOT_S.z0 + 0.8 + STALL.d, nose: -1, gap: [3, 4] },
  { id: 's-far', z0: LOT_S.z1 - 0.6 - STALL.d, z1: LOT_S.z1 - 0.6, nose: 1 },
];
/** 通道中线（找车位的车走的那条） */
export const AISLE_Z = {
  n: (ROWS[0].z1 + ROWS[1].z0) / 2,
  s: (ROWS[2].z1 + ROWS[3].z0) / 2,
};
/** 第 i 个车位的中心 */
export function stallCenter(row: Row, i: number): V2 {
  return [STALL.x0 + STALL.w * (i + 0.5), (row.z0 + row.z1) / 2];
}

// ── 落客区、花坛、步道、路缘 ──────────────────────────
/** 落客区（连锁砖）：大门外到进出口西边的一段车道 + 贴着墙的一条宽院子 */
export const MOTOR_COURT: V2[] = [
  [WALL_OUT, -9.9],
  [64.9, -9.9],
  [64.9, DRIVE.z0 - 0.5],
  [ENTRY.x0, DRIVE.z0 - 0.5],
  [ENTRY.x0, DRIVE.z1 + 0.5],
  [64.9, DRIVE.z1 + 0.5],
  [64.9, 9.9],
  [WALL_OUT, 9.9],
];

/** 花坛（0.55 米土坯矮墙 + 陶砖压顶，顶上是沙）：北花坛、南花坛，进出口两边断开 */
export const BERMS: { id: string; r: Rect }[] = [
  { id: 'berm-nw', r: { x0: 65.2, x1: ENTRY.x0 - 0.1, z0: -6.9, z1: DRIVE.z0 - 0.45 } },
  { id: 'berm-ne', r: { x0: ENTRY.x1 + 0.1, x1: LOT_N.x1 + 1.2, z0: -6.9, z1: DRIVE.z0 - 0.45 } },
  { id: 'berm-sw', r: { x0: 65.2, x1: ENTRY.x0 - 0.1, z0: DRIVE.z1 + 0.45, z1: 6.9 } },
  { id: 'berm-se', r: { x0: ENTRY.x1 + 0.1, x1: LOT_S.x1 + 1.2, z0: DRIVE.z1 + 0.45, z1: 6.9 } },
];

/** 墙边的步道（石板，从两片停车场的通道走到落客区） */
export const WALKS: { id: string; r: Rect }[] = [
  { id: 'walk-n', r: { x0: 60.8, x1: 62.3, z0: LOT_N.z0 + 0.4, z1: -9.9 } },
  { id: 'walk-s', r: { x0: 60.8, x1: 62.3, z0: 9.9, z1: LOT_S.z1 - 0.4 } },
  // 通道西头接到步道的那一小段
  { id: 'walk-nx', r: { x0: 62.3, x1: LOT_N.x0, z0: ROWS[0].z1 + 0.4, z1: ROWS[1].z0 - 0.4 } },
  { id: 'walk-sx', r: { x0: 62.3, x1: LOT_S.x0, z0: ROWS[2].z1 + 0.4, z1: ROWS[3].z0 - 0.4 } },
];

/** 步道和停车场之间的种植带（路缘围起来的沙，种龙舌兰、桶形仙人掌；比地面高一道路缘） */
export const STRIPS: { id: string; r: Rect }[] = [
  { id: 'strip-n1', r: { x0: 62.5, x1: LOT_N.x0 - 0.1, z0: LOT_N.z0 + 0.4, z1: ROWS[0].z1 + 0.2 } },
  { id: 'strip-n2', r: { x0: 62.5, x1: LOT_N.x0 - 0.1, z0: ROWS[1].z0 - 0.2, z1: -10.1 } },
  { id: 'strip-s1', r: { x0: 62.5, x1: LOT_S.x0 - 0.1, z0: 10.1, z1: ROWS[2].z1 + 0.2 } },
  { id: 'strip-s2', r: { x0: 62.5, x1: LOT_S.x0 - 0.1, z0: ROWS[3].z0 - 0.2, z1: LOT_S.z1 - 0.4 } },
];

/** 北边高一级的沙漠台地（+1.2）：南沿弯弯的岩壁朝镜头 = 暗带；东边、北边是一圈矮崖（地图边的沙漠里，离山还远） */
export const DESERT_N: V2[] = [
  [WALL_OUT, -27.5],
  [65.5, -28.1],
  [71, -27.3],
  [77.5, -28.5],
  [84, -27.6],
  [90.5, -28.9],
  [96, -28.2],
  [99.5, -31.5],
  [98.5, -40],
  [90, -47],
  [74, -49],
  [WALL_OUT, -48.5],
];
/** 南边低一级的沙漠（−1.0）：地面上挖下去的一块，北沿（停车场南沿）是朝镜头的挡土墙 = 暗带 */
export const DESERT_S: V2[] = [
  [WALL_OUT, 27.4],
  [66, 27.0],
  [73, 27.8],
  [80, 27.1],
  [87, 28.0],
  [93, 27.4],
  [97.5, 29.5],
  [98.5, 40],
  [94, 60],
  [84, 72],
  [WALL_OUT, 72],
];

/**
 * 车道平的直段画到哪（= clubmap2 的 DRIVE.x1）。再往东是山口那段（clubsite/mountains.ts 的 passRoadGeo）：
 * x ≈ 129 起翻第二道山梁的山口（两座山中间），x ≈ 145 起翻最外一道的鞍部，一直铺到地面尽头。
 */
export const DRIVE_EAST_END = DRIVE.x1;
/** 车出现 / 消失的 x：横屏右边缘（x ≈ 108）再往外一点，路还是平的（往东 15 米才上山口），车就是从画外开进来、开出去 */
export const CAR_EDGE_X = 114;

// ── 资产位置 ──────────────────────────────────────────

/** 资产位置（占位或资产）。asset = assets/<asset>.ts 或复用的；rotY 弧度；车：rotY 0 = 车头朝北，π/2 = 朝西，−π/2 = 朝东，π = 朝南 */
export interface Slot {
  id: string;
  asset: string;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  s?: number;
  variant?: number;
  pose?: [string, number];
  prop?: string | null;
}

const P = Math.PI;
const WEST = P / 2;
const EAST = -P / 2;

/** 站位（stage 3 的玩法、演出用；白模里画成洋红圆盘） */
export const SPOTS: Record<string, V2> = {
  /** 总监默认站的地方：岗亭窗口前（stage 3 从这里开始操控） */
  director: [62.2, -5.9],
  /** 代客泊车台（钥匙、雨伞）：代客平时站在这 */
  podium: [64.55, -5.25],
  /** 落客点：进来的车停在这（车头朝西，北边是岗亭这一侧） */
  dropoff: [67.6, -2.0],
  /** 门童：南门柱外 */
  doorman: [61.3, 4.0],
  /** 进门（走到这里 = 进了 clubdesk 场景） */
  gateIn: [59.0, 0.6], // 和 clubdesk 的进门点一致
  /** 车从画外（东边，路通往山里）出现、消失的地方 */
  edgeIn: [CAR_EDGE_X, -2.0],
  edgeOut: [CAR_EDGE_X, 2.0],
};

/** 停着的车：[行, 车位, 车款, 车漆 variant]（clubwalk 的通勤：人从这些车边上下车） */
export const PARKED: [number, number, 'car' | 'suv', number][] = [
  [0, 0, 'car', 0],
  [0, 1, 'suv', 1],
  [0, 3, 'car', 3],
  [0, 4, 'car', 4],
  [0, 6, 'suv', 5],
  [1, 0, 'car', 2],
  [1, 2, 'suv', 0],
  [1, 5, 'car', 6],
  [1, 6, 'car', 1],
  [1, 7, 'suv', 3],
  [2, 2, 'car', 1],
  [2, 6, 'car', 5],
  [3, 0, 'suv', 4],
  [3, 2, 'car', 0],
  [3, 5, 'car', 2],
  [3, 7, 'suv', 6],
];

export const SLOTS: Slot[] = [
  // ── 主角：大门（外面看）+ 岗亭 + 落客区 ──────────────
  // 大门的柱、横梁、招牌（尺寸照 clubmap2/build.ts；和 clubdesk 场景共用一个资产）
  { id: 'club-gate', asset: 'club-gate', x: GATE.x, z: 0 },
  { id: 'valet-booth', asset: 'valet-booth', x: 63.5, z: -8.55 },
  { id: 'valet-podium', asset: 'valet-podium', x: SPOTS.podium[0], z: SPOTS.podium[1] },
  // 球包车的家：北门柱东边（z −5.0；原来 −6.4 时 0.7 米的挡路圆把墙和岗亭之间的走廊堵死了）
  { id: 'bag-trolley', asset: 'bag-trolley', x: 61.5, z: -5.0, rotY: 0.2 },
  { id: 'valet-sign', asset: 'valet-sign', x: 64.3, z: -3.75 },
  { id: 'club-monument', asset: 'club-monument', x: 69.0, z: 5.75 },
  // 落客的车（车门开着）+ 刚下车的会员 + 迎上去的代客；门童在南门柱外
  { id: 'car-dropoff', asset: 'car', x: SPOTS.dropoff[0], z: SPOTS.dropoff[1], rotY: WEST, variant: 8 },
  { id: 'member-driver', asset: 'player', x: 68.4, z: -0.25, rotY: 0.4, variant: 2, pose: ['idle', 0.2] },
  { id: 'valet', asset: 'valet', x: 66.6, z: -0.05, rotY: P - 0.5, variant: 0 },
  { id: 'doorman', asset: 'valet', x: SPOTS.doorman[0], z: SPOTS.doorman[1], rotY: 0.6, variant: 1 },
  // 总监：岗亭窗口前，空手
  { id: 'director', asset: 'director', x: SPOTS.director[0], z: SPOTS.director[1], pose: ['idle', 0], prop: null },
  // 走去大门的会员：一个已经在落客区，一个沿北步道下来，一个刚从车里出来穿过通道
  { id: 'member-walk', asset: 'player', x: 62.6, z: 1.9, rotY: -WEST, variant: 1, pose: ['walk', 0.25] },
  { id: 'member-n', asset: 'player', x: 61.55, z: -15.2, rotY: 0, variant: 3, pose: ['walk', 0.6] },
  { id: 'member-lot', asset: 'player', x: 67.6, z: AISLE_Z.n + 1.2, rotY: -WEST, variant: 0, pose: ['walk', 0.1] },
  // ── 动的车（白模里定格）：进来的、找车位的、出去的 ──
  { id: 'car-arrive', asset: 'car', x: 88.5, z: -2.0, rotY: WEST, variant: 3 },
  { id: 'car-search', asset: 'suv', x: 71.8, z: AISLE_Z.n - 0.3, rotY: WEST, variant: 2 },
  { id: 'car-leave', asset: 'car', x: 80.5, z: 2.0, rotY: EAST, variant: 5 },
  // ── 遮阳棚：两片停车场的远排（顶是俱乐部的奶油帆布 + 蓝条纹，投影落在通道上 = 暗带）──
  { id: 'carport-a', asset: 'carport', x: STALL.x0 + STALL.w * 2, z: (ROWS[0].z0 + ROWS[0].z1) / 2 },
  { id: 'carport-b', asset: 'carport', x: STALL.x0 + STALL.w * 6, z: (ROWS[0].z0 + ROWS[0].z1) / 2 },
  { id: 'carport-c', asset: 'carport', x: STALL.x0 + STALL.w * 2, z: (ROWS[3].z0 + ROWS[3].z1) / 2 },
  { id: 'carport-d', asset: 'carport', x: STALL.x0 + STALL.w * 6, z: (ROWS[3].z0 + ROWS[3].z1) / 2 },
  // ── 框：蒲葵（墙边步道两头、北花坛东段、南花坛东段）──
  // 墙边两棵种在种植带上（strip-n1 南头、strip-s2 北头）：原来 z −19.0 / 15.6 落在通道接步道的石板上，悬空一道路缘高、挡在走道中间
  { id: 'palm-nw', asset: 'fan-palm', x: 63.2, z: -20.6, y: H.kerb, variant: 0 },
  { id: 'palm-sw', asset: 'fan-palm', x: 63.2, z: 20.6, y: H.kerb, variant: 1, s: 1.05 },
  { id: 'palm-ne', asset: 'fan-palm', x: 82.6, z: -5.6, y: H.berm, variant: 2 },
  { id: 'palm-se', asset: 'fan-palm', x: 82.1, z: 5.6, y: H.berm, variant: 0, s: 0.95 },
  { id: 'palm-se2', asset: 'fan-palm', x: 88.4, z: 5.8, y: H.berm, variant: 1 },
  // 落客区附近的花坛只种矮的（投影不上落客区）
  { id: 'agave-bnw', asset: 'agave', x: 66.6, z: -5.6, y: H.berm, s: 0.85 },
  { id: 'brittle-bnw', asset: 'brittlebush', x: 69.2, z: -5.7, y: H.berm, variant: 1 },
  { id: 'barrel-bnw', asset: 'barrel-cactus', x: 71.4, z: -5.5, y: H.berm, s: 0.9 },
  { id: 'agave-bnw2', asset: 'agave', x: 72.6, z: -5.8, y: H.berm, s: 0.7 },
  { id: 'brittle-bsw', asset: 'brittlebush', x: 66.6, z: 5.7, y: H.berm, variant: 0 },
  { id: 'barrel-bsw', asset: 'barrel-cactus', x: 71.6, z: 5.5, y: H.berm, s: 0.8 },
  { id: 'agave-bsw', asset: 'agave', x: 72.7, z: 5.9, y: H.berm, s: 0.7 },
  // 种植带
  { id: 'agave-sn2', asset: 'agave', x: 63.25, z: -11.4, y: H.kerb, s: 0.7 },
  { id: 'barrel-sn1', asset: 'barrel-cactus', x: 63.2, z: -23.6, y: H.kerb, s: 0.8 },
  { id: 'agave-ss1', asset: 'agave', x: 63.25, z: 11.3, y: H.kerb, s: 0.7 },
  { id: 'barrel-ss2', asset: 'barrel-cactus', x: 63.2, z: 22.6, y: H.kerb, s: 0.85 },
  // 墙边落客区南头：长椅（等车的地方）
  { id: 'bench-wait', asset: 'bench', x: 62.9, z: 8.6, rotY: 0 },
  // ── 停车场外的沙漠（东边，横屏才看得到）──
  { id: 'creosote-e1', asset: 'creosote', x: 92.6, z: -14.0, variant: 0 },
  { id: 'ocotillo-e1', asset: 'ocotillo', x: 95.4, z: -19.5 },
  { id: 'rocks-e1', asset: 'rocks', x: 97.6, z: -9.2, variant: 1 },
  { id: 'cholla-e1', asset: 'cholla', x: 93.0, z: 13.4 },
  { id: 'creosote-e2', asset: 'creosote', x: 96.4, z: 18.6, variant: 1 },
  { id: 'brittle-e1', asset: 'brittlebush', x: 91.0, z: 21.5, variant: 1 },
  { id: 'rocks-e2', asset: 'rocks', x: 99.4, z: 11.0, variant: 2 },
  { id: 'paloverde-e1', asset: 'palo-verde', x: 94.0, z: -24.6, variant: 1 },
  // 北台地、南低地（平移才看得到）
  { id: 'creosote-n1', asset: 'creosote', x: 68.0, z: -31.0, y: H.desertN, variant: 1 },
  { id: 'ocotillo-n1', asset: 'ocotillo', x: 74.5, z: -32.5, y: H.desertN },
  { id: 'smoke-n1', asset: 'smoke-tree', x: 83.0, z: -31.5, y: H.desertN },
  { id: 'rocks-n1', asset: 'rocks', x: 89.0, z: -30.0, y: H.desertN, variant: 0 },
  { id: 'creosote-s1', asset: 'creosote', x: 70.0, z: 31.0, y: H.desertS, variant: 0 },
  { id: 'cholla-s1', asset: 'cholla', x: 78.0, z: 30.6, y: H.desertS },
  // ── 墙里面（clubdesk 场景的地方，这里只放一个灰盒示意）──
  { id: 'clubdesk', asset: 'clubdesk-stub', x: DESK.x, z: DESK.z },
  ...PARKED.map(([r, i, asset, v]): Slot => {
    const row = ROWS[r];
    const [x, z] = stallCenter(row, i);
    return { id: `park-${row.id}-${i}`, asset, x, z: z + row.nose * 0.15, rotY: row.nose < 0 ? 0 : P, variant: v };
  }),
];

// ── 动起来以后（stage 3）：路线、能走的地方 ─────────────────
/** 路线（xz 折线，演出照着走；白模里画成洋红小点）。速度、时长见 docs/lab/2026-11-07-3d-pixel/clubpark.md「动起来」 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  // 进来的车：画外（东）→ 车道西行 → 落客点
  { id: 'car-arrive', pts: [SPOTS.edgeIn, [90, -2.0], [74, -2.0], SPOTS.dropoff] },
  // 代客开走：落客点 → 落客区里掉头 → 车道东行 → 南停车场进出口 → 通道 → 倒进空位（s-near 1）
  {
    id: 'valet-park',
    pts: [
      SPOTS.dropoff,
      [64.0, -1.6],
      [62.9, 0.6],
      [64.6, 2.0],
      [72.0, 2.0],
      [76.0, 3.6],
      [76.0, 9.8],
      [74.6, AISLE_Z.s],
      [68.0, AISLE_Z.s],
    ],
  },
  // 自己停车：车道西行 → 北进出口 → 通道慢慢往西找车位
  {
    id: 'car-search',
    pts: [
      [90, -2.0],
      [78.4, -2.0],
      [76.0, -4.0],
      [76.0, -10.5],
      [73.4, AISLE_Z.n],
      [65.8, AISLE_Z.n],
    ],
  },
  // 出去的车：南远排倒出来 → 通道往东 → 进出口 → 车道东行 → 画外（东）
  { id: 'car-leave', pts: [[74.0, AISLE_Z.s], [76.0, 14.0], [76.0, 4.2], [79.0, 2.0], [96, 2.0], SPOTS.edgeOut] },
  // 会员：北停车场 → 通道 → 墙边步道 → 落客区 → 进门
  { id: 'member-n', pts: [[68.0, AISLE_Z.n + 1.2], [62.4, AISLE_Z.n + 1.0], [61.55, -12], [61.6, -3.0], SPOTS.gateIn] },
  // 会员：南停车场 → 通道 → 墙边步道 → 进门
  { id: 'member-s', pts: [[70.0, AISLE_Z.s - 1.0], [62.4, AISLE_Z.s - 1.0], [61.55, 11], [61.6, 3.0], SPOTS.gateIn] },
  // 代客走回岗亭
  { id: 'valet-back', pts: [[68.0, AISLE_Z.s], [62.4, AISLE_Z.s], [61.6, 9.0], [63.0, -3.4], SPOTS.podium] },
];

/**
 * 总监能走的地方（stage 3 的控制范围，照 desert3d-v2 control.ts 的做法：矩形并集减障碍；车是动态障碍）。
 * 大门口（x < 60.35，z −5…5）走进去 = 切到 clubdesk 场景。
 */
export const WALKABLE: Rect[] = [
  { x0: WALL_OUT, x1: 64.9, z0: -9.9, z1: 9.9 }, // 落客区靠墙的院子（连锁砖从墙外皮铺起，人能贴着墙走）
  // 落客区 + 车道（沥青画到 DRIVE.x1；导航只到 parkNav 的 bounds x 92 为止）
  { x0: 64.9, x1: DRIVE.x1, z0: DRIVE.z0 - 0.4, z1: DRIVE.z1 + 0.4 },
  { x0: 60.8, x1: 62.3, z0: LOT_N.z0 + 0.4, z1: LOT_S.z1 - 0.4 }, // 墙边步道
  { x0: 62.3, x1: LOT_N.x1, z0: ROWS[0].z1, z1: ROWS[1].z0 }, // 北通道
  { x0: 62.3, x1: LOT_S.x1, z0: ROWS[2].z1, z1: ROWS[3].z0 }, // 南通道
  { x0: ENTRY.x0, x1: ENTRY.x1, z0: ROWS[1].z0, z1: ROWS[2].z1 }, // 两个进出口
  // 两片停车场整片（车位里也能走：停着的车是 life 的挡路圆，遮阳棚的柱子在 play.ts 的 blocked 里；花坛、种植带照样挡）
  LOT_N,
  LOT_S,
];
/**
 * 不能走的（静态）：岗亭。代客台、长椅、门柱、遮阳棚柱子、植物，和花坛、种植带（按画出来的圆角轮廓，terrain.ts 的
 * BERM_PTS / STRIP_PTS）在 play.ts 的 parkNav 里加；车、人的脚印是 life 的挡路圆
 */
export const BLOCKED: Rect[] = [{ x0: 62.2, x1: 64.8, z0: -9.7, z1: -7.3 }];

// ── 云影（手摆，硬边）：只走两片停车场的通道那两条带，不上落客区 ──
/** 云的 x 在 shader 里按 ±48 绕回（CLOUD_W 96）：世界 x 换成绕回后的 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(70.5), AISLE_Z.n + 0.4, 3.6, 1.6],
  [wrapX(73.6), AISLE_Z.n - 0.2, 2.2, 1.1],
  [wrapX(70.5), AISLE_Z.s + 0.8, 4.0, 1.7],
  [wrapX(84), AISLE_Z.s + 0.6, 4.2, 1.8],
  [wrapX(87.6), AISLE_Z.s + 0.1, 2.4, 1.2],
  [wrapX(110), AISLE_Z.n, 3.8, 1.5],
];
export const CLOUD_VEL = 0.12;

/** 场景太阳：午后晴天（仰角 44°，比 clubfront 的 50° 低一点，影子长一点；方位同 clubfront 偏东 22° → 影子落向左下） */
// 和 clubdesk 统一（2026-11-08）：偏东 8°，南门柱的影子顺墙往南落，不压门里排队的人
export const SUN = { el: 44, az: 8 };

// ── 演出的时间表（stage 3，life.ts）：一轮 84 秒；clubdesk 的 life.ts 也读这张表（两个场景在大门交接） ──
/** 一轮几秒（clubpark.md 的计划是 ≈ 72 秒；代客一轮要接一辆、取一辆，72 秒排不开，放宽到 84） */
export const LOOP = 84;
/**
 * 每轮里各件事开始的时刻（秒）：落客的车从画外开进来、自己停车的车开进来、取车的会员从大门出来、去北停车场开车的会员从大门出来。
 * inAt：会员走到大门 gateIn (59.0, 0.6) 的大概时刻（落客的司机、乘客、自己停车的车主）；outAt：会员从 gateIn 出门的时刻。
 * 总监不帮忙、代客照常干的时候量的（总监接钥匙会让会员早进门几秒）。
 */
export const GATE_TIMING = {
  dropoff: 0,
  selfPark: 20,
  pickup: 38,
  selfLeave: 52,
  // 量出来的（稳定以后的轮次）：乘客 ≈ 19、司机 ≈ 27（等代客接钥匙）、自己停车的车主 ≈ 66；出门 39、53
  inAt: [19, 27, 66],
  outAt: [39, 53],
  /** 玩法模式多加的：第二辆落客的车、第二个取车的会员（代客忙不过来，总监帮忙才不用等） */
  rush: [44, 62],
} as const;
