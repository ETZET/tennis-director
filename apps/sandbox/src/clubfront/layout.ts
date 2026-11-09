// clubfront 的构图（手摆，不是程序撒点）。单位米，y 朝上；相机 yaw 0：+x 画面右，+z 朝镜头（画面下方）。
// 屏幕竖直坐标 v = (y − (z − tz))·cos45°（米；竖屏 390×844 在 px 1 下是 17.5 × 38 米的画面，tz 默认 1）。
//
//   z −31 ┌──────────────────────────── 岛后沿 ──────────────────────────────┐
//         │ 球场台地 COURTS (+1.6)：球场南端一角（外场绿 + 底线）              │ ← 竖屏最上面露一条球场
//   z −18 │ ▓▓▓▓▓▓▓▓▓▓▓ 球场围网 · 深绿挡风布（暗带）▓▓ 门 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ← 第一条暗带
//         │   蒲葵（左上框）   灌木                      ┃步道┃  烟树         │
//   z −13 │ ▓▓▓▓▓▓▓▓▓▓ 球场台地挡土墙（土坯，1.6 米）▓▓▓▓▓ 台阶 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ← 第二条暗带
//         │ 西花坛(+0.5) 蒲葵   ┌────── 凉棚（帆布顶，最亮的一块）──┐ 东花坛 假紫荆│
//         │                     │  后柜 · 总监站位 · 柜台（俱乐部蓝） │             │ ← 主角：画面中间偏上
//         │   毛巾车 ─────────── └─────── 帆布投影（梅紫阴影池）──────┘ ── 水站     │
//   z  0  │              陶砖铺地（萨尔蒂略砖，圆角矩形）                          │
//         │   长椅       花箱 ╲  石板步道  ╱ 花箱        （安静的砂石地）         │
//         │ 门内花坛(+0.5)      ╲         大门（土坯柱 + 横梁 + 招牌）            │
//   z +13 │ ▓▓▓▓▓▓▓ 前庭矮墙（土坯挡土墙 + 0.5 米女儿墙，陶砖压顶）▓▓ 台阶 ▓▓▓▓▓▓▓ │ ← 第三条暗带 + 大门（左下框）
//         │ 到达区 ARRIVAL (−1.2)：砂石地、仙人掌   ← 小路从岛东沿进来    蒲葵（右下框）│
//         │                                                       球场电瓶车（停车）│
//   z +23 └────────────────────────── 岛前沿（崖壁 + 岛底）─────────────────────┘
//
// 原则：一个主角（凉棚 + 前台），三条暗带（围网、球场台地挡土墙、前庭矮墙）把画面分层，石板步道把视线从左下的大门
// 引到前台、再引到右上的台阶和球场门；框：左上蒲葵（两棵）、右下蒲葵、右上假紫荆；安静的地方：前台东南的砂石地、到达区西段。
export type V2 = [number, number];

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;
export const PITCH = 45;

/** 各层高度（米） */
export const H = {
  /** 到达区（停车、岛顶的大部分） */
  arrival: -1.2,
  /** 前庭（前台、陶砖铺地、砂石地） */
  plaza: 0,
  /** 前庭上的花坛（土坯矮墙围起来） */
  bed: 0.5,
  /** 前庭南沿女儿墙的顶（比前庭高 0.5） */
  parapet: 0.5,
  /** 球场台地 */
  courts: 1.6,
  /** 浮空岛：崖壁下到这里，再往下是收拢的岛底 */
  skirt: -4.4,
  bottom: -12,
};

/** 相机默认看向的地面点 z（竖屏 / 横屏） */
export const TARGET_Z = { portrait: 1.0, landscape: -0.5 };

/** 浮空岛轮廓（粗点，terrain 用 Catmull-Rom 平滑）；岛顶 = 到达区 */
export const ISLAND: V2[] = [
  [-24, -31],
  [-8, -32],
  [10, -31.5],
  [24, -30.5],
  [25.5, -16],
  [24.6, 0],
  [25.4, 14],
  [23.4, 22.2],
  [12, 23.4],
  [2, 22.6],
  [-8, 23.6],
  [-18, 23.0],
  [-24.2, 19],
  [-25.6, 4],
  [-24.6, -14],
];

/** 前庭（y 0）：北沿伸到球场台地下面（被盖住）；南沿是前庭矮墙，大门在 x ≈ −3 那一段（直的） */
export const PLAZA: V2[] = [
  [-22, -15.5],
  [22, -15.5],
  [22.8, -2],
  [21.2, 8.4],
  [16.5, 11.4],
  [9.5, 12.3],
  [3.5, 12.9],
  [-1.2, 13.0],
  [-4.8, 13.0],
  [-9.5, 12.4],
  [-15.5, 11.2],
  [-20.6, 8.2],
  [-22.6, -3],
];

/** 球场台地（y 1.6）：南沿 z ≈ −13.5 是第二条暗带；后沿就是岛后沿（镜头看不到） */
export const COURTS: V2[] = [
  [-23.5, -31],
  [23.5, -30.5],
  [24, -13.6],
  [17, -13.0],
  [10, -13.6],
  [3.0, -13.5],
  [-3.0, -13.3],
  [-10, -13.9],
  [-17, -13.2],
  [-24, -13.8],
];

/** 前庭上的花坛（y 0.5，土坯矮墙 0.5 米 = 一条实心暗带 + 陶砖压顶） */
export const BEDS: { id: string; pts: V2[] }[] = [
  // 西花坛：凉棚左后方，蒲葵（左上框）+ 石炭酸、龙舌兰
  {
    id: 'bed-w',
    pts: [
      [-14, -12.6],
      [-6.0, -12.6],
      [-5.4, -10],
      [-5.8, -7.0],
      [-7.6, -5.4],
      [-10.5, -5.0],
      [-14, -5.6],
    ],
  },
  // 东花坛：去球场的台阶右边，假紫荆（右上框）
  {
    id: 'bed-e',
    pts: [
      [6.6, -12.8],
      [14, -12.8],
      [14.4, -6.8],
      [11.4, -5.4],
      [8.0, -6.2],
      [6.8, -8.6],
    ],
  },
  // 门内花坛：贴着女儿墙，大门西边；植物从墙头露出来
  {
    id: 'bed-gw',
    pts: [
      [-15.2, 8.8],
      [-9, 8.4],
      [-5.9, 9.4],
      [-5.6, 12.6],
      [-9.5, 12.1],
      [-15.2, 10.9],
    ],
  },
];

/** 前庭南沿女儿墙：沿前庭轮廓、x 在这些区间里、z > zMin 的那段（大门的豁口在中间）。宽 0.4 米，顶 y 0.5 */
export const PARAPET = { w: 0.4, zMin: 8.5, spans: [[-21, -4.4] as V2, [-1.6, 21] as V2] };

/** 大门（豁口两边的土坯柱、横梁、招牌）：中心 x、柱距（柱中心到中心） */
export const GATE = { x: -3.0, z: 12.55, span: 3.4 };

/** 台阶：x0..x1 宽，z0 = 顶（上层的南沿），往 +z 下 steps 级，每级 run 米 */
export interface Stairs {
  x0: number;
  x1: number;
  z0: number;
  steps: number;
  run: number;
  from: number;
  to: number;
}
/** 大门台阶：到达区 → 前庭（穿过矮墙的豁口） */
export const GATE_STAIRS: Stairs = { x0: -4.1, x1: -1.9, z0: 13.0, steps: 5, run: 0.36, from: H.plaza, to: H.arrival };
/** 球场台阶：前庭 → 球场台地 */
export const COURT_STAIRS: Stairs = { x0: 3.9, x1: 5.9, z0: -13.5, steps: 5, run: 0.4, from: H.courts, to: H.plaza };

/** 圆角矩形（铺地用） */
function roundRect(x0: number, z0: number, x1: number, z1: number, r: number): V2[] {
  const pts: V2[] = [];
  const corners: [number, number, number][] = [
    [x1 - r, z1 - r, 0],
    [x0 + r, z1 - r, Math.PI / 2],
    [x0 + r, z0 + r, Math.PI],
    [x1 - r, z0 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, a0] of corners)
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  return pts;
}

/** 陶砖铺地：凉棚脚下 + 前面排队的地方（圆角矩形，不平滑） */
export const TILE: V2[] = roundRect(-5.2, -6.6, 6.2, 3.8, 1.2);

/** 步道（每段在一层上，宽度米）。kind：flagstone = 俱乐部里的石板；path = 岛上的踩实土路（俱乐部外） */
export const WALKS: { id: string; level: number; w: number; kind: 'flagstone' | 'path'; pts: V2[] }[] = [
  // 到达区：从岛东沿进来（人从这里来）→ 弯到大门台阶脚下
  {
    id: 'arrive',
    level: H.arrival,
    w: 2.1,
    kind: 'path',
    pts: [
      [25.4, 18.4],
      [19, 18.0],
      [12.5, 18.7],
      [5.5, 17.8],
      [0.5, 16.6],
      [-2.2, 15.3],
      [-3.0, 14.5],
    ],
  },
  // 前庭：大门 → 斜着引到陶砖铺地的南沿（前台正前方）
  {
    id: 'gate-desk',
    level: H.plaza,
    w: 2.0,
    kind: 'flagstone',
    pts: [
      [-3.0, 12.9],
      [-3.0, 11.0],
      [-2.5, 8.6],
      [-1.2, 6.2],
      [-0.3, 4.6],
      [0.0, 3.4],
    ],
  },
  // 前庭：陶砖铺地东北角 → 球场台阶脚下
  {
    id: 'desk-stairs',
    level: H.plaza,
    w: 1.9,
    kind: 'flagstone',
    pts: [
      [4.9, -6.2],
      [4.9, -9.0],
      [4.9, -11.6],
    ],
  },
  // 球场台地：台阶顶 → 围网的门
  {
    id: 'stairs-court',
    level: H.courts,
    w: 1.8,
    kind: 'flagstone',
    pts: [
      [4.9, -13.6],
      [4.9, -16.0],
      [4.9, -18.0],
    ],
  },
];

/** 球场的一角（球场台地上，围网后面）：竖屏最上面露出外场绿、底线和一点青蓝内场 */
export const COURT_HINT = {
  surround: { x0: -15, x1: 15, z0: -31, z1: -18.9 },
  baselineZ: -23.3,
  hw: 10.97 / 2,
  shw: 8.23 / 2,
};

/**
 * 站位（玩法以后用；白模里标签开着时画成洋红小圆盘）。
 * deskStand：总监站在柜台后面接待的地方（凉棚南沿往北 0.55 米，帽子不被垂边挡住：见 ASSETS.md「凉棚」的遮挡算式）。
 */
export const SPOTS: Record<string, V2> = {
  deskStand: [0.45, -1.95],
  serve: [0.1, 0.4],
  staffGap: [2.6, -1.0],
  towels: [-3.3, 0.3],
  water: [4.7, 0.25],
  gateTop: [-3.0, 12.0],
  gateFoot: [-3.0, 15.2],
  arrive: [24.6, 18.4],
  courtStairsFoot: [4.9, -10.9],
  courtStairsTop: [4.9, -14.2],
  courtGate: [4.9, -17.5],
};

/** 会员的路线（到达 → 大门 → 柜台 → 毛巾/水 → 球场门）和总监的路线（站位 → 员工口 → 前庭） */
export const ROUTES: { id: string; pts: V2[] }[] = [
  {
    id: 'member',
    pts: [
      SPOTS.arrive,
      [12.5, 18.7],
      [5.5, 17.8],
      [0.5, 16.6],
      SPOTS.gateFoot,
      SPOTS.gateTop,
      [-2.5, 8.6],
      [-1.2, 6.2],
      SPOTS.serve,
      SPOTS.towels,
      [-1.0, 1.8],
      [3.2, 1.2],
      SPOTS.water,
      [5.4, -2.0],
      [4.9, -6.2],
      SPOTS.courtStairsFoot,
      SPOTS.courtStairsTop,
      SPOTS.courtGate,
    ],
  },
  { id: 'staff', pts: [SPOTS.deskStand, [2.0, -2.1], [2.9, -1.9], SPOTS.staffGap, [2.9, 0.2]] },
];

/** 能走的地方（玩法以后用）：每层一块，减掉 BLOCKERS（以后的 control.ts 按这个做碰撞） */
export const WALKABLE = [
  { id: 'arrival', level: H.arrival, note: '岛顶减掉岛沿 0.6 米、前庭矮墙脚 0.3 米' },
  { id: 'plaza', level: H.plaza, note: 'PLAZA 减掉花坛、女儿墙、凉棚柱、柜台（员工口 staffGap 能过）' },
  { id: 'courts-strip', level: H.courts, note: 'COURTS 里 z −13.5…−18（围网南边那一条），门在 SPOTS.courtGate' },
  { id: 'stairs', level: NaN, note: 'GATE_STAIRS、COURT_STAIRS：按级插值高度' },
];

/** 资产位置（占位或资产）。id 唯一；asset = assets/<asset>.ts 或复用的 desert3d-v2 资产；rotY 弧度；s 缩放；y 不填 = 所在层的地面 */
export interface Slot {
  id: string;
  asset: string;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  s?: number;
  variant?: number;
  /** 人物：固定姿势 [名字, phase] */
  pose?: [string, number];
  /** 人物：手里拿什么（null = 空手） */
  prop?: string | null;
}

const P = Math.PI;

export const SLOTS: Slot[] = [
  // ── 主角：凉棚 + 前台 ───────────────────────────────
  { id: 'pergola', asset: 'pergola', x: 0, z: -3.5 },
  { id: 'front-desk', asset: 'front-desk', x: 0, z: -1.0 },
  { id: 'towel-cart', asset: 'towel-cart', x: -3.3, z: -0.75 },
  { id: 'water-station', asset: 'water-station', x: 4.7, z: -0.75 },
  // 人：总监在柜台后面（空手，朝镜头），一个会员在柜台前（背对镜头），一个在水站，一个刚进大门
  { id: 'director', asset: 'director', x: SPOTS.deskStand[0], z: SPOTS.deskStand[1], pose: ['idle', 0], prop: null },
  { id: 'member-1', asset: 'player', x: SPOTS.serve[0], z: SPOTS.serve[1], rotY: P, variant: 0, pose: ['idle', 0] },
  { id: 'member-2', asset: 'player', x: 4.7, z: 0.35, rotY: P, variant: 2, pose: ['idle', 0.3] },
  { id: 'member-3', asset: 'player', x: -2.1, z: 8.3, rotY: P - 0.4, variant: 1, pose: ['walk', 0.25] },
  { id: 'coach', asset: 'coach', x: 4.9, z: -16.9, rotY: 0, pose: ['idle', 0] },
  // 陶砖铺地入口的两个花箱 + 大门内侧一个大陶罐；花箱里种的东西放在花箱顶上
  { id: 'planter-w', asset: 'planter', x: -2.7, z: 4.5 },
  { id: 'planter-e', asset: 'planter', x: 2.5, z: 4.3 },
  { id: 'agave-pw', asset: 'agave', x: -2.7, z: 4.5, y: 0.55, s: 0.7 },
  { id: 'barrel-pe', asset: 'barrel-cactus', x: 2.2, z: 4.3, y: 0.55, s: 0.8 },
  { id: 'brittle-pe', asset: 'brittlebush', x: 3.0, z: 4.4, y: 0.55, s: 0.75, variant: 1 },
  { id: 'pot-gate', asset: 'pot', x: -0.5, z: 11.7 },
  { id: 'agave-pot', asset: 'agave', x: -0.5, z: 11.7, y: 0.85, s: 0.55 },
  { id: 'bench', asset: 'bench', x: -5.6, z: 6.6 },
  // ── 大门（左下框）──────────────────────────────────
  { id: 'gate', asset: 'gate', x: GATE.x, z: GATE.z },
  // ── 框：蒲葵、假紫荆、烟树 ──────────────────────────
  { id: 'palm-w', asset: 'fan-palm', x: -8.4, z: -9.6, y: H.bed, variant: 0, s: 1.1 },
  { id: 'palm-courts', asset: 'fan-palm', x: -6.2, z: -15.4, variant: 2 },
  { id: 'palm-arrival', asset: 'fan-palm', x: 6.8, z: 15.0, variant: 1 },
  { id: 'paloverde-e', asset: 'palo-verde', x: 9.8, z: -9.0, y: H.bed, variant: 0 },
  { id: 'smoke-courts', asset: 'smoke-tree', x: 8.6, z: -15.6 },
  // 花坛里的灌木
  { id: 'creosote-bw', asset: 'creosote', x: -11.5, z: -10.6, y: H.bed, variant: 0 },
  { id: 'agave-bw', asset: 'agave', x: -6.9, z: -6.4, y: H.bed, s: 0.9 },
  { id: 'brittle-bw', asset: 'brittlebush', x: -9.8, z: -6.1, y: H.bed, variant: 0 },
  { id: 'barrel-be', asset: 'barrel-cactus', x: 7.5, z: -7.0, y: H.bed },
  { id: 'brittle-be', asset: 'brittlebush', x: 11.6, z: -6.6, y: H.bed, variant: 1 },
  { id: 'brittle-gw', asset: 'brittlebush', x: -7.6, z: 10.7, y: H.bed, variant: 1 },
  { id: 'agave-gw', asset: 'agave', x: -10.8, z: 10.2, y: H.bed },
  { id: 'barrel-gw', asset: 'barrel-cactus', x: -6.4, z: 11.5, y: H.bed, s: 0.8 },
  { id: 'creosote-gw', asset: 'creosote', x: -13.6, z: 9.9, y: H.bed, variant: 1 },
  // 球场台地：围网（5 段，中间那段带门）+ 灌木
  { id: 'fence-1', asset: 'court-fence', x: -19.1, z: -18.3, variant: 0 },
  { id: 'fence-2', asset: 'court-fence', x: -11.1, z: -18.3, variant: 0 },
  { id: 'fence-3', asset: 'court-fence', x: -3.1, z: -18.3, variant: 0 },
  { id: 'fence-door', asset: 'court-fence', x: 4.9, z: -18.3, variant: 1 },
  { id: 'fence-5', asset: 'court-fence', x: 12.9, z: -18.3, variant: 0 },
  { id: 'fence-6', asset: 'court-fence', x: 20.0, z: -18.3, variant: 0 },
  { id: 'creosote-courts', asset: 'creosote', x: -1.6, z: -15.2, variant: 1 },
  { id: 'ocotillo-courts', asset: 'ocotillo', x: -11.0, z: -15.6 },
  { id: 'agave-courts', asset: 'agave', x: 11.4, z: -14.8 },
  // ── 到达区（停车的一点暗示 + 仙人掌）────────────────
  { id: 'golf-cart', asset: 'golf-cart', x: 6.3, z: 19.9, rotY: -0.25 },
  { id: 'cholla-a', asset: 'cholla', x: -8.6, z: 18.0 },
  { id: 'barrel-a', asset: 'barrel-cactus', x: -10.5, z: 19.6 },
  { id: 'barrel-a2', asset: 'barrel-cactus', x: -9.7, z: 20.4, s: 0.75 },
  { id: 'rocks-a', asset: 'rocks', x: -5.4, z: 20.6, variant: 2 },
  { id: 'brittle-a', asset: 'brittlebush', x: 1.4, z: 20.4, variant: 0 },
  { id: 'creosote-a', asset: 'creosote', x: -14.2, z: 17.6, variant: 0 },
  // ── 横屏才看得到的两侧 ──────────────────────────────
  { id: 'ocotillo-a', asset: 'ocotillo', x: 14.6, z: 16.2 },
  { id: 'agave-a', asset: 'agave', x: 16.8, z: 21.0 },
  { id: 'golf-cart-2', asset: 'golf-cart', x: 9.9, z: 20.5, rotY: -0.25 },
  { id: 'paloverde-pw', asset: 'palo-verde', x: -16.5, z: 2.5, variant: 1 },
  { id: 'smoke-pw', asset: 'smoke-tree', x: -18.4, z: -8.0 },
  { id: 'rocks-pw', asset: 'rocks', x: -14.6, z: -1.6, variant: 0 },
  { id: 'sail-pe', asset: 'shade-sail', x: 14.6, z: 1.6 },
  { id: 'bench-pe', asset: 'bench', x: 14.6, z: 2.8 },
  { id: 'palm-pe', asset: 'fan-palm', x: 18.6, z: -6.0, variant: 0 },
];

/**
 * 云影（手摆，硬边；toon.ts 的 cloudR 用低频噪声扰边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘、每 96 米绕回来。
 * 只走两条带：到达区（z 16.5…22.5）和球场台地南边那一条（z −14…−18.5）—— 永远不上凉棚和前台（z −6…+4）。
 */
export const CLOUDS: [number, number, number, number][] = [
  // 到达区：竖屏左下（仙人掌那一片）
  [-4.0, 19.6, 4.0, 2.0],
  [-0.8, 20.2, 2.6, 1.6],
  [44, 19.8, 3.6, 1.8],
  [47, 20.4, 2.4, 1.5],
  // 球场台地那一条：竖屏上方偏右（台阶顶、去球场门的步道）
  [2.6, -16.2, 4.2, 1.4],
  [6.0, -15.9, 2.4, 1.1],
  [-42, -16.0, 4.0, 1.4],
  [-39, -15.7, 2.4, 1.1],
];
export const CLOUD_VEL = 0.12;
