// clubplaza 的构图：棕榈喷泉广场（喷泉小景）。手摆，不是程序撒点。
// 世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）；PLAZA、FOUNTAIN、PATHS、GROUNDS、GATE、PICKLE 从那边 import（只读）。
// 和南边的 clubdesk 接得上：广场抬高、挡土墙、两段台阶、绿带里的植物直接 import clubdesk/layout.ts 的常量（只读），位置照抄它的 SLOTS。
// 这里只放这个场景自己的东西（喷泉的尺寸、棕榈的位置、站位、路线、资产位置、云），也写在同一套世界坐标里。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米），等效地面 z_eq = z − y。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
//            x 35                       44                        53
//   z −47  ┌────────────────────────────────────────────────────────┐  竖屏取景（tx 44、tz −21）
//          │ 墙外的沙漠（北边一排蒲葵的树干，叶冠在画外）             │
//   z −43  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 北围墙（土坯，朝镜头 = 暗带 1）▓▓▓▓▓▓▓▓▓▓│
//          │ 墙里的沙地（安静）                                      │
//   z −36  │ 蒲葵（左上框）  长椅（一对会员，面朝镜头）   饮料车  蒲葵（右上框）│
//          │      蒲葵                                        蒲葵    │
//   z −24  │ 蒲葵    ╭──── 陶砖一圈 r 9 ────╮                    蒲葵 │
//          │ 长椅(荫) │  ≈≈ 池水 ≈≈  喷泉 ≈≈ │ 总监捞叶子  工具车(荫)  │
//          │          ╰── 孩子 ─ 家长 ───────╯                        │
//   z −15  │ 西边步道（荫） ↑ 上台阶的会员                (绿带的蒲葵叶冠压进来)│
//   z −12  │ ▓▓▓▓▓▓ 广场挡土墙（暗带 2）▓▓ 台阶 ▓▓▓▓▓▓▓ 台阶 ▓▓▓▓▓▓▓▓▓▓│
//          │ 绿带：灌木、长椅、蒲葵                                    │
//   z −8.6 │ ═══════════════ 长廊（碎花岗岩）═══════════════════════  │
//   z −3   │ ▓▓▓▓▓▓▓▓▓ 匹克球北围网（暗带 3）▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
//   z  5   │ 匹克球场（北半，安静）                                   │
//          └────────────────────────────────────────────────────────┘
//
// 原则：主角 = 喷泉（暖陶砖一圈里的一块冷青水 + 白水花），在画面中线偏上；四棵蒲葵围成一个朝南（朝镜头）开口的马蹄形，叶冠都不压在水面上。
// 太阳在北偏东 8°：蒲葵的影子往镜头落 ~7 米 → 影子池正好落在两张长椅、工具车上（"会员在棕榈荫里歇脚"），水面和孩子、总监都在亮处。
// 视线：西边台阶上来的会员 → 孩子在池边 → 水花 → 总监捞叶子 → 上面一对会员 / 饮料车。
// 安静的地方：北边墙里的沙地、广场北半的石板（扫地以后就是这里）、匹克球场面。
import { FOUNTAIN, GATE, GROUNDS, PICKLE, PLAZA, type Rect, type V2 } from '../clubsite/world';

export type { Rect, V2 };
export { FOUNTAIN, PICKLE, PLAZA };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/**
 * 相机默认看向的地面点（竖屏 / 横屏）。
 * 竖屏 x 35.2…52.8：喷泉（x 39.4…48.6）正中；上沿是北围墙外，下沿是匹克球场北半。喷泉的屏幕位置 v ≈ +3（中线偏上），
 * 孩子、总监在中线附近，下 1/4 是挡土墙 + 长廊 + 围网三条横带。
 * 横屏 x 12…70：左边中心球场东看台（邻居），右边东墙和门外的北停车场一角；喷泉在 55% 处。
 */
export const TARGET = {
  portrait: { x: 44, z: -23.5 },
  landscape: { x: 44, z: -22.5 },
};

/** 太阳：同 clubpark / clubdesk（仰角 44°、方位偏东 8°）。影子方向 (−sin8°, +cos8°)，长 = 高 / tan44° ≈ 1.04 × 高 */
export const SUN = { el: 44, az: 8 };

/** 墙里面这个场景画到的范围（球场、步道、围网裁到这里面）。北到北围墙，东到东墙（门外是 clubpark 那块地），南到匹克球场中间 */
export const CLIP: Rect = { x0: 10, x1: GATE.x, z0: GROUNDS.z0, z1: 20 };

// ── 喷泉（主角） ───────────────────────────────────────────
/**
 * 喷泉：地图 FOUNTAIN = 中心 (44, −24)、铺装半径 9、水面半径 4、棕榈圈半径 7.5。
 * 这里定细节（高度都相对广场顶面 y 1.2）：池壁外半径 4.6（地图 build.ts 的 ring 4 + 0.6），池壁高 0.6、压顶 0.62 宽（坐得下人、站得下鸟），
 * 水面在 0.42；中间一根柱 + 两层碗（西班牙殖民式：下碗 r 1.4、上碗 r 0.7），顶上一颗陶罐形的出水口。
 * 帽顶 3.6 米 → 屏幕上从池壁前沿（z_eq −20.6）到出水口顶（z_eq −27.6），再加水花。
 */
export const FOUNTAIN_SPEC = {
  basinR: FOUNTAIN.water + 0.6,
  waterR: FOUNTAIN.water,
  wallH: 0.6,
  waterY: 0.42,
  pedestal: { r0: 0.9, r1: 0.55, h: 1.9 },
  bowl1: { r: 1.4, y: 1.9, t: 0.3 },
  stem: { r: 0.32, h: 0.7 },
  bowl2: { r: 0.72, y: 2.75, t: 0.22 },
  finialTop: 3.6,
} as const;

/** 各层高度（米）：同 clubdesk（广场 +1.2，南沿挡土墙；长廊、绿带、匹克球都是 0） */
export const H = { ground: 0, plaza: 1.2 } as const;

/** 极坐标 → 世界（角度：0 = 东，90 = 南（朝镜头），180 = 西，270 = 北） */
const polar = (deg: number, r: number): V2 => {
  const a = (deg * Math.PI) / 180;
  return [
    Math.round((FOUNTAIN.x + Math.cos(a) * r) * 100) / 100,
    Math.round((FOUNTAIN.z + Math.sin(a) * r) * 100) / 100,
  ];
};

/**
 * 喷泉一圈的蒲葵（建议改地图）：地图是 6 棵均匀一圈（scatter.ts，角度 0.4 + i·60°），yaw 0、45° 俯视时朝南那两棵（83°、143°）的叶冠
 * 正好压在水面上（叶冠的屏幕位置 = 树根 z − 7.7），主角被挡。这里改成**朝南开口的马蹄形**：
 * 东西各一棵（15°、165°，叶冠在水面两边）、后面两棵（215°、335°，影子落在两张长椅 / 工具车上），再加广场北边两个角各一棵（压进竖屏的上角）。
 * 一共还是 6 棵。
 */
export const PALMS: { id: string; at: V2; v: number; s: number }[] = [
  { id: 'palm-e', at: polar(15, FOUNTAIN.palms), v: 0, s: 0.92 },
  { id: 'palm-w', at: polar(165, FOUNTAIN.palms), v: 2, s: 1.0 },
  { id: 'palm-nw', at: polar(215, FOUNTAIN.palms), v: 1, s: 0.9 },
  { id: 'palm-ne', at: polar(335, FOUNTAIN.palms), v: 2, s: 0.95 },
];

/** 广场里的西边步道（地图 PATHS 的 x 34…37 那条在广场上的一段；clubdesk 的西边台阶就是它下去的地方）：碎花岗岩，压在石板上 */
export const PLAZA_WALK: Rect = { x0: 34, x1: 37, z0: PLAZA.z0, z1: PLAZA.z1 };

/**
 * 建议加（地图上没有）：广场西沿正对喷泉轴线的一段台阶 + 一条碎花岗岩小路，往西接中心球场东看台的背后（x 21.6）。
 * 看球的人从广场走去看台；横屏里它是从左边把视线引到喷泉的路（竖屏里看不到，x < 35.2）。台阶 5 级 × 0.42，从 x 32 往西下到 29.9。
 */
export const STADIUM_LINK = {
  stairs: { x0: PLAZA.x0 - 5 * 0.42, x1: PLAZA.x0, z0: -25.3, z1: -22.7, steps: 5, run: 0.42 },
  path: { x0: 21.6, x1: PLAZA.x0 - 5 * 0.42 + 0.05, z0: -25.1, z1: -22.9 } as Rect,
};

// ── 站位、路线、能走的地方（玩法以后用；白模里标签开着时画成洋红小圆盘 + 小点）──────
/**
 * 站位。director 系列 = 总监的保养活：捞叶子（池边四个点，按漂叶子的位置挑最近的）、扫陶砖、浇花盆、倒垃圾。
 * 工具都在 leafCart（广场东边蒲葵荫里的保洁车：长杆捞网、扫帚、浇水壶、落叶桶）。
 */
export const SPOTS = {
  /** 保洁车（取放工具：捞网 / 扫帚 / 浇水壶；倒落叶） */
  leafCart: [49.9, -21.2] as V2,
  /** 池边捞叶子：东、南偏西、西、北（总监站在池壁外 0.5 米，朝池心） */
  skimE: [49.1, -24.0] as V2,
  skimS: [42.6, -18.9] as V2,
  skimW: [38.9, -24.4] as V2,
  skimN: [45.0, -29.1] as V2,
  /** 扫地：蒲葵下落的枯叶堆（东西两棵的树根附近），扫到保洁车 */
  sweepE: [52.6, -25.6] as V2,
  sweepW: [36.2, -24.8] as V2,
  /** 浇花盆：东台阶顶两个、西台阶顶两个 */
  potE: [50.2, -13.6] as V2,
  potW: [36.0, -13.6] as V2,
  /** 会员：西台阶顶、长椅、饮料车前、池边看水 */
  stairW: [35.5, -12.6] as V2,
  stairE: [50.2, -12.6] as V2,
  benchW: [38.0, -20.6] as V2,
  benchN: [40.6, -33.4] as V2,
  drinks: [47.7, -31.2] as V2,
  kid: [41.4, -19.4] as V2,
  /** 鸟：落在池壁后沿（离池心 4.3 米 = 压顶中线）、上碗沿喝水；总监或孩子走近 1.5 米就飞到蒲葵上 */
  birdRim: [45.89, -27.86] as V2,
  birdPerch: [50.14, -26.6] as V2,
} satisfies Record<string, V2>;

/** 路线：会员 = 西台阶 → 长椅 / 饮料车；孩子在池边来回；总监 = 保洁车 ↔ 池边四个捞点、蒲葵下、花盆 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  { id: 'member', pts: [SPOTS.stairW, [36.0, -16.0], [37.4, -19.2], SPOTS.benchW] },
  { id: 'member-drinks', pts: [SPOTS.stairE, [50.8, -16.2], [53.0, -20.5], [53.6, -27.5], SPOTS.drinks] },
  { id: 'kid', pts: [[40.2, -18.0], SPOTS.kid, [43.2, -18.9], [45.6, -19.2]] },
  {
    id: 'director-skim',
    pts: [
      SPOTS.leafCart,
      SPOTS.skimE,
      [49.6, -27.4],
      SPOTS.skimN,
      [41.2, -28.6],
      SPOTS.skimW,
      [39.6, -20.6],
      SPOTS.skimS,
    ],
  },
  { id: 'director-sweep', pts: [SPOTS.leafCart, SPOTS.sweepE] },
  { id: 'director-pots', pts: [SPOTS.leafCart, [50.6, -17.0], SPOTS.potE] },
];

/**
 * 总监能走的地方（stage 3 的 control.ts 照这个做碰撞，desert3d-v2 的做法）：
 * 广场顶面（石板 + 陶砖一圈），减掉池子（池壁外半径 4.6 以内）、蒲葵树根（r 0.5）、长椅、饮料车、保洁车、花盆；
 * 两段台阶下到绿带和长廊（换场景：长廊往南 = clubdesk）。墙里北边的沙地从广场西北角的西边步道下去（地图上广场北沿是平接的，
 * 这里抬高了 → 北沿要么加一段台阶，要么不让走，见 clubplaza.md「要商量的」）。
 */
export const WALKABLE = [
  { id: 'plaza', note: 'PLAZA（x 32…56、z −36…−12，y 1.2），减掉池子 r < 4.6 和道具脚印' },
  { id: 'stairs', note: 'clubdesk 的 STAIRS 前两段（x 34…37、x 49…51.4，z −12…−9.9），按级插值高度' },
  { id: 'strip', note: '绿带（z −12…−8.6，y 0）和长廊（z −8.6…−4.4）：往南出画 = 去 clubdesk' },
];

/** 资产位置（占位或资产）。asset = assets/<asset>.ts 或复用的资产；rotY 弧度（0 = 面朝镜头 +z）；s 缩放；y 不填 = 地面高度 */
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
  /** 标签文字（不给 = id） */
  label?: string;
  /** 标签贴在脚下（挤在一起的小东西） */
  labelBelow?: boolean;
  /** 没有标签 */
  noLabel?: boolean;
  /** 标签放在这个世界坐标（挤在一起时挪开） */
  labelAt?: [number, number, number];
  /** 人物：坐着（clubsite/people 的 setSeat(座高, 脚踩的高度)；长椅 [0.52]） */
  seat?: [number, number?];
  /** 人物：头转向这个世界坐标点（lookAt） */
  look?: [number, number, number];
  /** 人物：绞盘转轴的世界坐标（crank 姿势，setCrank） */
  crank?: [number, number, number];
}

const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const E = P / 2; // 面朝 +x（东）
const N = P; // 面朝 −z（北，背对镜头）
/** 面朝 (x, z) 这个点 */
const face = (from: V2, to: V2) => Math.atan2(to[0] - from[0], to[1] - from[1]);
/** 资产本地 (lx, lz) → 世界（资产在 at、转 rotY） */
const local = (at: V2, rotY: number, lx: number, lz: number): V2 => [
  Math.round((at[0] + lx * Math.cos(rotY) + lz * Math.sin(rotY)) * 100) / 100,
  Math.round((at[1] - lx * Math.sin(rotY) + lz * Math.cos(rotY)) * 100) / 100,
];
/** 长椅上的座位：长椅中心左右 ±0.45、往后 0.05（长椅本地），人和长椅同朝向 */
const SEAT_X = 0.45;
const SEAT_Z = -0.05;
const C: V2 = [FOUNTAIN.x, FOUNTAIN.z];
/** 西边长椅朝池心 */
const BENCH_W_ROT = face(SPOTS.benchW, C);
/** 饮料车（车厢脚印中心） */
const DRINKS_CART: V2 = [47.9, -32.6];
const YW = H.plaza + FOUNTAIN_SPEC.waterY;
const YRIM = H.plaza + FOUNTAIN_SPEC.wallH;

export const SLOTS: Slot[] = [
  // ── 主角：喷泉 + 水花 ────────────────────────────────────
  { id: 'palm-fountain', asset: 'palm-fountain', x: FOUNTAIN.x, z: FOUNTAIN.z, labelAt: [FOUNTAIN.x, 1.5, -19.0] },
  { id: 'fountain-spray', asset: 'fountain-spray', x: FOUNTAIN.x, z: FOUNTAIN.z, y: H.plaza },
  // ── 一圈蒲葵（马蹄形，见 PALMS） ──────────────────────────
  ...PALMS.map((p) => ({ id: p.id, asset: 'fan-palm', x: p.at[0], z: p.at[1], variant: p.v, s: p.s })),
  // ── 池边的生活 ──────────────────────────────────────────
  // 孩子趴在池壁前沿玩水（clubsite/people 的 kid，v1 青绿 T 恤白裙马尾）
  {
    id: 'kid',
    asset: 'kid',
    x: SPOTS.kid[0],
    z: SPOTS.kid[1],
    rotY: face(SPOTS.kid, C) + 0.35,
    s: 1,
    variant: 1,
    pose: ['pickup', 0.42],
    prop: null,
    label: '孩子玩水',
  },
  {
    id: 'parent',
    asset: 'player',
    x: 39.6,
    z: -17.6,
    rotY: face([39.6, -17.6], SPOTS.kid),
    variant: 3,
    pose: ['idle', 0.3],
    prop: 'racket',
    label: '家长',
  },
  // 鸟：池壁后沿两只（rotY 让一对顺着池沿排开 = 切线方向）、上碗沿一只喝水（v1）、一只正飞下来（v2）
  { id: 'birds-rim', asset: 'grackles', x: SPOTS.birdRim[0], z: SPOTS.birdRim[1], y: YRIM, rotY: -0.45 },
  { id: 'bird-bowl', asset: 'grackle', x: 44.5, z: -23.35, y: H.plaza + 2.95, rotY: -0.6, variant: 1, noLabel: true },
  { id: 'bird-fly', asset: 'grackle', x: 48.2, z: -27.0, y: H.plaza + 4.4, rotY: -1.2, variant: 2, noLabel: true },
  // 漂在水面上的蒲葵叶（v3 / v4 = 带水纹圈的漂叶，main.ts 数一下片数告诉喷泉 setLeaves）、落在陶砖上的枯叶（总监要捞、要扫的东西）
  { id: 'litter-water', asset: 'palm-litter', x: 46.4, z: -23.0, y: YW + 0.01, rotY: 0.5, variant: 3 },
  { id: 'litter-water2', asset: 'palm-litter', x: 41.7, z: -25.9, y: YW + 0.01, rotY: -0.8, variant: 4, noLabel: true },
  // 东边那棵蒲葵（15°）树根旁：原来在 sweepE 正好被树干挡住，挪到树根东南边露出来
  {
    id: 'litter-e',
    asset: 'palm-litter',
    x: SPOTS.sweepE[0],
    z: SPOTS.sweepE[1],
    rotY: 1.1,
    variant: 2,
    noLabel: true,
  },
  {
    id: 'litter-w',
    asset: 'palm-litter',
    x: SPOTS.sweepW[0],
    z: SPOTS.sweepW[1],
    rotY: -0.4,
    variant: 0,
    noLabel: true,
  },
  // ── 总监：在池东边捞叶子（亮处、侧身朝西），保洁车在东边那棵蒲葵的荫里 ──
  {
    id: 'director',
    asset: 'director',
    x: SPOTS.skimE[0],
    z: SPOTS.skimE[1],
    rotY: W + 0.15,
    pose: ['sweep', 0.25],
    prop: null,
    label: '总监（捞叶子）',
  },
  {
    id: 'skim-net',
    asset: 'skim-net',
    x: SPOTS.skimE[0] - 0.35,
    z: SPOTS.skimE[1] + 0.1,
    y: H.plaza + 1.05,
    rotY: 0,
    labelAt: [46.2, 1.7, -23.2],
  },
  { id: 'leaf-cart', asset: 'leaf-cart', x: SPOTS.leafCart[0] + 0.7, z: SPOTS.leafCart[1] + 0.3, rotY: W },
  // ── 长椅：西边蒲葵荫里两个会员歇脚；北边一对面朝镜头 ──────────
  // 坐着的人 = player + setSeat(0.52) + sit / sip（拿杯子）/ clap，座位在长椅中心 ±0.45、往后 0.05（长椅本地），和长椅同朝向
  { id: 'bench-w', asset: 'bench', x: SPOTS.benchW[0], z: SPOTS.benchW[1], rotY: BENCH_W_ROT },
  {
    id: 'sit-w1',
    asset: 'player',
    x: local(SPOTS.benchW, BENCH_W_ROT, -SEAT_X, SEAT_Z)[0],
    z: local(SPOTS.benchW, BENCH_W_ROT, -SEAT_X, SEAT_Z)[1],
    rotY: BENCH_W_ROT,
    variant: 3,
    seat: [0.52],
    pose: ['sip', 0.2],
    prop: 'cup',
    label: '坐着歇脚',
  },
  {
    id: 'sit-w2',
    asset: 'player',
    x: local(SPOTS.benchW, BENCH_W_ROT, SEAT_X, SEAT_Z)[0],
    z: local(SPOTS.benchW, BENCH_W_ROT, SEAT_X, SEAT_Z)[1],
    rotY: BENCH_W_ROT,
    variant: 0,
    seat: [0.52],
    pose: ['sit', 0.3],
    prop: null,
    look: [42.6, 1.6, -19.0],
    noLabel: true,
  },
  { id: 'bench-n', asset: 'bench', x: SPOTS.benchN[0], z: SPOTS.benchN[1], rotY: 0 },
  {
    id: 'sit-n1',
    asset: 'player',
    x: local(SPOTS.benchN, 0, -SEAT_X, SEAT_Z)[0],
    z: local(SPOTS.benchN, 0, -SEAT_X, SEAT_Z)[1],
    variant: 1,
    seat: [0.52],
    pose: ['clap', 0.1],
    prop: null,
    look: [44, 2.6, -24],
    noLabel: true,
  },
  {
    id: 'sit-n2',
    asset: 'player',
    x: local(SPOTS.benchN, 0, SEAT_X, SEAT_Z)[0],
    z: local(SPOTS.benchN, 0, SEAT_X, SEAT_Z)[1],
    variant: 2,
    seat: [0.52],
    pose: ['sit', 0.7],
    prop: null,
    noLabel: true,
  },
  // ── 饮料车（右上，有遮阳伞）+ 摊主 + 买饮料的会员 ──────────────
  // 摊主站在饮料车 userData.spots.vendor（车本地 (−0.7, −0.85)：车后偏西，伞沿外，伞顶挡不住）
  { id: 'drinks-cart', asset: 'drinks-cart', x: DRINKS_CART[0], z: DRINKS_CART[1] },
  {
    id: 'vendor',
    asset: 'player',
    x: local(DRINKS_CART, 0, -0.7, -0.85)[0],
    z: local(DRINKS_CART, 0, -0.7, -0.85)[1],
    rotY: 0,
    variant: 0,
    pose: ['idle', 0.6],
    prop: null,
    noLabel: true,
  },
  {
    id: 'member-drinks',
    asset: 'player',
    x: SPOTS.drinks[0] - 0.3,
    z: SPOTS.drinks[1],
    rotY: N + 0.2,
    variant: 2,
    pose: ['idle', 0.1],
    prop: 'racket',
    noLabel: true,
  },
  // ── 走动的会员：西边台阶上来、北边横穿 ─────────────────────
  {
    id: 'member-up',
    asset: 'player',
    x: 36.5,
    z: -14.8,
    rotY: N - 0.15,
    variant: 2,
    pose: ['walk', 0.3],
    prop: 'racket',
    label: '上台阶',
  },
  {
    id: 'member-cross',
    asset: 'player',
    x: 43.9,
    z: -32.0,
    rotY: E,
    variant: 1,
    pose: ['walk', 0.7],
    prop: 'racket',
    noLabel: true,
  },
  // ── 花盆（clubdesk 的陶罐 + 龙舌兰）：两段台阶顶各一对 ───────────
  ...(
    [
      [48.5, -12.9],
      [51.9, -12.9],
      [33.5, -12.9],
      [37.9, -12.9],
    ] as V2[]
  ).flatMap(([x, z], i) => [
    { id: `pot-${i}`, asset: 'pot', x, z, noLabel: i > 0, label: '花盆（clubdesk 的陶罐）' },
    { id: `pot-agave-${i}`, asset: 'agave', x, z, y: H.plaza + 0.85, s: 0.55, noLabel: true },
  ]),
  // ── 绿带（照抄 clubdesk 的 SLOTS：同一个世界）──────────────────
  { id: 'palm-strip', asset: 'fan-palm', x: 47.2, z: -10.4, variant: 0, noLabel: true },
  { id: 'palm-gate', asset: 'fan-palm', x: 58, z: -10.5, variant: 2, noLabel: true },
  { id: 'agave-strip', asset: 'agave', x: 55.0, z: -10.1, s: 0.9 },
  { id: 'brittle-strip', asset: 'brittlebush', x: 52.2, z: -10.7, variant: 1 },
  { id: 'creosote-strip', asset: 'creosote', x: 43.0, z: -10.3, variant: 1 },
  { id: 'bench-prom', asset: 'bench', x: 53.4, z: -9.4 },
  { id: 'smoke-w', asset: 'smoke-tree', x: 32.0, z: -10.4, variant: 0 },
  { id: 'paloverde-w', asset: 'palo-verde', x: 27.6, z: -14.6, variant: 1 },
  { id: 'creosote-w', asset: 'creosote', x: 38.6, z: -10.6, variant: 0 },
  // 长廊上一个往西走的会员
  {
    id: 'member-prom',
    asset: 'player',
    x: 41.0,
    z: -6.4,
    rotY: W,
    variant: 0,
    pose: ['walk', 0.5],
    prop: 'racket',
    noLabel: true,
  },
  // 匹克球北半（照抄 clubdesk 的两个人）
  {
    id: 'pickle-a',
    asset: 'player',
    x: 48.8,
    z: 1.2,
    rotY: W,
    variant: 1,
    pose: ['idle', 0.1],
    prop: 'racket',
    noLabel: true,
  },
  {
    id: 'pickle-c',
    asset: 'player',
    x: 39.4,
    z: 2.0,
    rotY: E,
    variant: 2,
    pose: ['idle', 0.3],
    prop: 'racket',
    noLabel: true,
  },
  // ── 北围墙外：一排蒲葵（地图 scatter 那排只到 x 30，这里往东接上，叶冠在竖屏上沿外，只露树干和影子）──
  { id: 'palm-out-1', asset: 'fan-palm', x: 37.5, z: -47.2, variant: 1, s: 1.1, noLabel: true },
  { id: 'palm-out-2', asset: 'fan-palm', x: 45.5, z: -48.4, variant: 0, s: 1.2, noLabel: true },
  { id: 'palm-out-3', asset: 'fan-palm', x: 53.0, z: -47.0, variant: 2, s: 1.05, noLabel: true },
  { id: 'creosote-n', asset: 'creosote', x: 41.0, z: -39.6, variant: 0, noLabel: true },
  // 饮水点（新）：西边步道上台阶的地方，长椅旁边；比台阶顶的花盆（37.9）往东让开 0.7 米，不叠在一起（打完球的人在这里喝水；总监以后要通堵、擦）
  { id: 'drink-fountain', asset: 'drink-fountain', x: 38.6, z: -14.4, rotY: W },
  // 横屏左边那片沙地：手摆几簇（不撒满），和中心球场看台之间的小路两边
  { id: 'smoke-west', asset: 'smoke-tree', x: 26.4, z: -32.4, variant: 1, noLabel: true },
  { id: 'creosote-west', asset: 'creosote', x: 28.6, z: -19.6, variant: 1, noLabel: true },
  { id: 'brittle-west', asset: 'brittlebush', x: 25.0, z: -27.4, variant: 0, noLabel: true },
  { id: 'agave-west', asset: 'agave', x: 30.4, z: -27.2, s: 0.9, noLabel: true },
  { id: 'bench-link', asset: 'bench', x: 26.0, z: -21.8, rotY: 0, noLabel: true },
  { id: 'brittle-n', asset: 'brittlebush', x: 50.5, z: -40.2, variant: 0, noLabel: true },
  // ── 横屏才看得到的两侧：中心球场东看台上的观众、东墙、大门（clubdesk 的 east-gate）──
  {
    id: 'spectator-1',
    asset: 'player',
    x: 19.4,
    z: -21.0,
    y: 1.6,
    rotY: W,
    variant: 0,
    pose: ['idle', 0.2],
    prop: null,
  },
  {
    id: 'spectator-2',
    asset: 'player',
    x: 20.6,
    z: -17.6,
    y: 2.4,
    rotY: W,
    variant: 2,
    pose: ['idle', 0.6],
    prop: null,
    noLabel: true,
  },
  { id: 'east-gate', asset: 'east-gate', x: GATE.x, z: 0, label: '大门（clubdesk）' },
  { id: 'palm-drive-n', asset: 'fan-palm', x: 66, z: -5.4, s: 0.95, variant: 2, noLabel: true },
  { id: 'agave-out-n', asset: 'agave', x: 62, z: -8, noLabel: true },
];

/** 区域标签（白模评审用，?labels=0 不显示）：文字、位置 (x, y, z)；kind area = 区域名，propose = 共享坐标的建议 */
export const AREA_LABELS: { text: string; x: number; y: number; z: number; kind?: 'area' | 'propose' }[] = [
  { text: '喷泉广场 +1.2', x: 38.5, y: 1.4, z: -30.5 },
  { text: '北围墙 z −43', x: 44, y: 2.4, z: -43 },
  { text: '墙里沙地（安静）', x: 47, y: 0.4, z: -39.5 },
  { text: '挡土墙 + 台阶（clubdesk）', x: 42.5, y: 1.2, z: -12 },
  { text: '长廊 → clubdesk', x: 46, y: 0.3, z: -6.0 },
  { text: '匹克球', x: 44, y: 0.4, z: 3.0 },
  { text: '中心球场东看台（邻居）', x: 20, y: 3.4, z: -24 },
  { text: '东墙 x 60 · 门外北停车场', x: 62, y: 2.4, z: -20 },
  { text: '建议：广场西台阶 + 去看台的小路', x: 27, y: 1.0, z: -24, kind: 'propose' },
];

/**
 * 云影（手摆，硬边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘。toon.ts 按 x ∈ [−48, 48) 绕回来。
 * 只走两条带：北边墙里的沙地（z −38…−41）和长廊 / 匹克球（z −2…−6）—— 永远不上喷泉（z −15…−33）。
 * （clubdesk 的云走 z −17 那条带，会穿过喷泉前沿；两个场景各管各的云，见 clubplaza.md。）
 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(40), -39.4, 4.4, 1.5],
  [wrapX(43.5), -40.1, 2.6, 1.1],
  [wrapX(-8), -39.2, 4.0, 1.5],
  [wrapX(36), -2.2, 4.2, 1.5],
  [wrapX(39.5), -1.5, 2.4, 1.1],
  [wrapX(-12), -2.6, 4.4, 1.6],
];
export const CLOUD_VEL = 0.12;
