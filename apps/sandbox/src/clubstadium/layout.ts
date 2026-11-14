// clubstadium 的构图：中心球场（表演赛的球场）。手摆，不是程序撒点。
// 世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）；COURTS、PATHS、GROUNDS、TERRACE、PLAZA 从那边 import（只读）。
// 和东边的 clubplaza 接得上：它建议加的 STADIUM_LINK（广场西台阶 + 去东看台背后的小路）直接 import（只读），这里在东看台背后接一段上看台的台阶。
// 这里只放这个场景自己的东西（看台的级数尺寸、记分牌、球员通道、观众、站位、路线、资产位置、云），也写在同一套世界坐标里。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米），等效地面 z_eq = z − y。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
//            x −20            −7          0          7            20
//   z −49  ┌──────────────────────────────────────────────────────────┐  墙外的沙漠、一排蒲葵的树干（叶冠在画外）
//   z −38  │            旗杆   ███ 大记分牌（朝南）███   旗杆              │  竖屏上沿：记分牌 = 第二个看点
//   z −37  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 北看台后墙 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
//          │ 6 级看台：立面（暗）+ 一排坐着的人（亮的头和帽子）+ 踏面前沿一条亮边 │  横带 × 6，走道（x ±7、±14）竖着切开
//   z −30  │ ██████ 广告板（俱乐部蓝）██████████████████████████████████│  暗带
//          │      伞 长椅  裁判椅  长椅 伞                       │东看台│
//          │  球童        ┃                    球童                │ 3 级 │
//   z −21  │      球员 A ─┃─ 网 ──────────── 球员 B                │（侧面）│
//          │              ┃                                       │      │
//          │  沙堆 ← 总监吹沙        球童                            │      │
//   z −12  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓ 南看台（2 级，背对镜头）▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
//   z −8.6 │ ════════════ 长廊（碎花岗岩），饮水点、走过的会员 ══════════════ │
//   z −2.3 │ ▓▓▓▓▓▓▓▓▓▓▓ 青训场北围网 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
//          └──────────────────────────────────────────────────────────┘
//   西头敞开（马蹄形看台）：球员通道（拱门）→ 会所露台；工具架、划线车放在西南角。东看台背后：去喷泉广场的小路。
//
// 原则：主角 = 网 + 裁判椅 + 两张球员长椅和遮阳伞（画面正中偏上），身后是坐满人的北看台（一层层明暗横带），头顶是大记分牌。
// 太阳在北偏东 8°（仰角 44°）：看台的立面（朝南 = 朝镜头）全是暗档，每级踏面后 3/4 落在上一级的投影里 → 一级 = 暗立面 + 暗踏面里坐着的人
// （头和帽子伸出影子、是亮的）+ 踏面前沿一条亮边。人群是亮的点子带、立面是暗带：明暗横带就是这么来的，不靠颜色。
// 视线：左下长廊 → 西南角总监吹沙（走道和沙堆）→ 球员 A → 网 → 裁判 → 看台中间那块 → 记分牌。
// 安静的地方：场地本身（蓝的内场、绿的外圈只有线和人）、北看台两头的空座位、长廊、墙外的沙漠。

import { STADIUM_LINK } from '../clubplaza/layout';
import { COURTS, GROUNDS, PATHS, PLAZA, type Rect, TERRACE, type V2 } from '../clubsite/world';

export type { Rect, V2 };
export { COURTS, PATHS, PLAZA, STADIUM_LINK, TERRACE };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/** 中心球场（地图 COURTS 的 stadium_1）：x −18…18、z −30…−12，东西向 */
export const S = COURTS.find((c) => c.id === 'stadium_1') ?? COURTS[0];
export const CELL: Rect = { x0: S.x - S.hx, x1: S.x + S.hx, z0: S.z - S.hz, z1: S.z + S.hz };
/** 场地尺寸（ITF）：底线到底线、双打宽、单打宽、发球线离网、网柱在双打边线外 0.914 */
export const DIM = { L: 23.77, DW: 10.97, SW: 8.23, SVC: 6.4, post: 0.914, netH: 1.07, netMid: 0.914 } as const;
/** 网柱（南北两根）的 z */
export const NET_POST_Z: [number, number] = [S.z - DIM.DW / 2 - DIM.post, S.z + DIM.DW / 2 + DIM.post];

/**
 * 相机默认看向的地面点（竖屏 / 横屏）。
 * 竖屏 x −8.8…8.8：网在正中，两个发球区、两张球员长椅、裁判椅都在画里，两条底线（x ±11.9）在画外 —— 竖屏只放得下半个球场多一点，
 * 主角是网边那一团（裁判、长椅、伞、球童），球员挑"上网截击"的一刻（都在 ±8 以内）。上沿是记分牌，下沿是长廊和青训场的北围网。
 * 横屏 x −32…26：整个马蹄形（西头球员通道 + 工具角、北看台、东看台、南看台）+ 左边会所露台的东沿、右边去喷泉广场的小路。
 */
export const TARGET = {
  portrait: { x: 0, z: -25.5 },
  landscape: { x: -3, z: -26 },
};

/** 太阳：同 clubpark / clubdesk / clubplaza（仰角 44°、方位偏东 8°）。影子方向 (−sin8°, +cos8°)，长 = 高 / tan44° ≈ 1.04 × 高 */
export const SUN = { el: 44, az: 8 };

/** 墙里面这个场景画到的范围（步道、围网、邻居裁到这里面）：北到北围墙，西到会所露台以西，东到广场西沿，南到青训场中间 */
export const CLIP: Rect = { x0: -44, x1: PLAZA.x0, z0: GROUNDS.z0, z1: 14 };

// ── 看台（照 clubmap2/build.ts 的级数和尺寸，这里起名字、加走道） ───────────────
/** 一级看台：第 k 级的顶高、前沿到看台前沿的距离 a、后沿 b */
export const tier = (k: number, rise: number, deep: number) => ({
  top: (k + 1) * rise,
  a: k * deep,
  b: (k + 1) * deep,
});
/**
 * 北看台：6 级 × 0.9 高 × 1.2 深，x −20…20（比场地两头各宽 2 米），前沿 z −30（场地北沿）。后墙 0.4 厚、高出最高一级 1.4。
 * 东看台：3 级 × 0.8 × 1.2，x 18…21.6，沿 z −30…−12。南看台：2 级 × 0.6 × 1.1，z −12…−9.8，x −18…18（背对镜头）。
 */
export const STANDS = {
  north: { n: 6, rise: 0.9, deep: 1.2, x0: CELL.x0 - 2, x1: CELL.x1 + 2, front: CELL.z0, wallH: 1.4, wallT: 0.4 },
  east: { n: 3, rise: 0.8, deep: 1.2, front: CELL.x1, z0: CELL.z0, z1: CELL.z1 },
  south: { n: 2, rise: 0.6, deep: 1.1, front: CELL.z1, x0: CELL.x0, x1: CELL.x1 },
  /** 北看台的走道（x 中心）：每条 1.1 米宽，台阶每级 = 半级看台；切出中间一块（裁判、记分牌正后方）+ 两边各两块 */
  aisles: [-14, -7, 7, 14],
  aisleW: 1.1,
  /** 每个座位的宽（米）：观众按这个排 */
  seatPitch: 0.56,
  /** 座椅条：在踏面后半（靠着上一级的立面），0.42 高、0.5 深 */
  seatH: 0.42,
  seatD: 0.5,
  /** 广告板：北看台第一级立面前面一道（俱乐部蓝），0.12 厚、和第一级一样高 */
  board: { t: 0.12, h: 0.9 },
} as const;
const N_ = STANDS.north;
/** 北看台第 k 级踏面的高度、z 范围（前沿 za > 后沿 zb） */
export const northTread = (k: number) => {
  const t = tier(k, N_.rise, N_.deep);
  return { y: t.top, za: N_.front - t.a, zb: N_.front - t.b };
};
/** 北看台后墙（最高一级后面）：z −37.6…−37.2，顶 y 6.8 */
export const NORTH_BACK = {
  z0: N_.front - N_.n * N_.deep - N_.wallT,
  z1: N_.front - N_.n * N_.deep,
  top: N_.n * N_.rise + N_.wallH,
};

/**
 * 大记分牌（建议挪位置）：地图上在西头、朝东（yaw 0 下是侧对镜头的一条线，竖屏里根本不在画里）。
 * 这里挪到**北看台后墙正中、朝南**（朝场地，也朝镜头）：竖屏上沿的第二个看点；朝镜头的面是暗档 → 深色牌面 + 亮黄的数字，本来就该这样。
 * 牌面 7.2 × 2.8 米，底 y 7.1（压在后墙顶上 0.3），两根钢腿落到看台后面的地上（z −38.4）。
 */
export const SCOREBOARD = { x: 0, z: -38.2, w: 7.2, h: 2.8, d: 0.4, y0: NORTH_BACK.top + 0.3 } as const;
/** 记分牌两边的旗杆（在后墙顶上，杆 4.2 米、旗 1.2 × 0.8） */
export const FLAGS: V2[] = [
  [-5.6, -37.4],
  [5.6, -37.4],
];

/**
 * 西头（看台的开口，马蹄形朝西）：球员通道。会所露台（x −37…−26）往东到场地西沿（x −18）中间 8 米空地：
 * 一座白灰泥拱门（门洞朝东西，yaw 0 下是一根竖着的门楣 + 两根门柱的南面），球员、裁判、球童从会所（更衣室）走出来。
 */
export const PLAYERS_GATE = { x: -22.2, z: -21, span: 4.2, h: 3.8 } as const;
/** 球员从会所到场上走的路（碎花岗岩，露台东沿 → 拱门 → 场地西沿） */
export const WALKOUT: Rect = { x0: TERRACE.x1, x1: CELL.x0, z0: -22.4, z1: -19.6 };
/** 西南角：总监的工具角（工具架 + 划线车），从长廊进来 */
export const TOOL_CORNER: Rect = { x0: -24.5, x1: -18.4, z0: -15.4, z1: -10.2 };
/**
 * 东看台背后上看台的台阶（接 clubplaza 的 STADIUM_LINK 小路）：6 级 × 0.4 高 × 0.5 深，从 x 24.6 往西上到 21.6（东看台顶 y 2.4）。
 * 每级 0.5 深 = 坡度 0.8：寻路每格 0.2 米最多升 stepUp / 2 = 0.18（0.4 深的 1:1 上不去）
 */
export const EAST_STAIRS = { x0: 21.6, x1: 24.6, z0: -25.0, z1: -23.0, steps: 6 } as const;

/** 各层高度（米）：场地、长廊、西头都是 0（这个场景没有台地，暗带全靠看台的立面） */
export const H = { ground: 0 } as const;

// ── 观众（crowd：便宜的坐着的人，InstancedMesh）──────────────────────────
/**
 * 每块看台坐多满（0..1）和颜色偏好。块 = 被走道切开的一段；中间那块（裁判后面、记分牌下面）最满。
 * 颜色规则（防止一片噪点）：
 *  1. 衣服只用 5 种：白（大多数，沙漠里的午后）、奶油（帆布色）、俱乐部蓝、红、黄 —— 不用青绿（总监的颜色）、不用紫。
 *  2. 一起来的人（2～4 个连座）同色的概率一半；块和块之间的主色不一样（中间块蓝白多 = 会员，两边块杂一点）。
 *  3. 六成的人戴帽子（草帽 / 白帽）：45° 俯视里帽子就是头，帽子统一成两种浅色 → 每排人读成一条亮的点子带，不是彩色碎点。
 *  4. 空位成片（两头、最上一排的两边），露出座椅的深青绿 —— 看台有"安静的地方"。
 */
export interface CrowdBlock {
  stand: 'north' | 'east' | 'south';
  /** 北 / 南看台：x 范围；东看台：z 范围 */
  a0: number;
  a1: number;
  /** 每级（从前往后）的坐满程度 */
  fill: number[];
  /** 衣服颜色的权重：白、奶油、蓝、红、黄 */
  shirts: [number, number, number, number, number];
}
const W5 = (w: number, c: number, b: number, r: number, y: number): [number, number, number, number, number] => [
  w,
  c,
  b,
  r,
  y,
];
export const CROWD: CrowdBlock[] = [
  // 北看台：西头 → 东头（走道 x −14、−7、7、14 之间）
  { stand: 'north', a0: -20, a1: -14, fill: [0.55, 0.45, 0.3, 0.2, 0.1, 0], shirts: W5(5, 2, 1, 1, 1) },
  { stand: 'north', a0: -14, a1: -7, fill: [0.85, 0.8, 0.7, 0.55, 0.4, 0.25], shirts: W5(6, 3, 2, 1, 0.6) },
  { stand: 'north', a0: -7, a1: 7, fill: [0.95, 0.92, 0.9, 0.85, 0.75, 0.55], shirts: W5(7, 3, 4, 0.6, 0.3) },
  { stand: 'north', a0: 7, a1: 14, fill: [0.85, 0.75, 0.65, 0.5, 0.35, 0.2], shirts: W5(6, 3, 1, 0.6, 1) },
  { stand: 'north', a0: 14, a1: 20, fill: [0.5, 0.35, 0.25, 0.1, 0, 0], shirts: W5(5, 2, 1, 2, 1) },
  // 东看台（侧面，竖屏看不到）：中段满、两头空
  { stand: 'east', a0: -29, a1: -13, fill: [0.7, 0.55, 0.4], shirts: W5(5, 2, 2, 1, 1) },
  // 南看台（背对镜头）：网附近坐一些
  { stand: 'south', a0: -12, a1: 12, fill: [0.6, 0.45], shirts: W5(5, 2, 2, 1, 1) },
];

// ── 站位、路线、能走的地方（玩法以后用；白模里标签开着时画成洋红小圆盘 + 小点）──────
/**
 * 站位。director 系列 = 总监的保养活：吹掉场边积的沙（吹叶机）、补线（划线车）、开场前收拾看台；
 * 工具在西南角的工具架（toolRack：扫帚、吹叶机、捡球器）和划线车（lineCart）。
 */
export const SPOTS = {
  /** 工具架前（取放吹叶机、扫帚）、划线车 */
  toolRack: [-21.4, -12.4] as V2,
  lineCart: [-19.2, -12.6] as V2,
  /** 积沙：西南（南看台脚下，风从西头敞口灌进来）、西北、东北两个角 */
  sandSW: [-7.2, -13.4] as V2, // 往北挪 0.6：原位一半被南看台第一排观众的头挡住
  sandNW: [-16.8, -29.0] as V2,
  sandNE: [16.6, -29.1] as V2,
  /** 吹沙：站在沙堆东边往西吹（吹出西头敞口） */
  blowSW: [-4.4, -13.5] as V2,
  /** 补线：西底线、东底线的两头（线磨淡了要重划） */
  lineW0: [-11.9, -26.5] as V2,
  lineW1: [-11.9, -15.5] as V2,
  lineE0: [11.9, -26.5] as V2,
  lineE1: [11.9, -15.5] as V2,
  /** 比赛：裁判椅（梯子在北边）、两张球员长椅、发球位、网前 */
  umpire: [0, -28.7] as V2,
  benchW: [-2.9, -28.9] as V2,
  benchE: [2.9, -28.9] as V2,
  serveW: [-12.4, -19.4] as V2,
  serveE: [12.4, -22.6] as V2,
  /** 球童：两根网柱旁（蹲）、四个底线角（站） */
  kidNetN: [1.15, -27.9] as V2,
  kidNetS: [-0.9, -14.2] as V2,
  kidNW: [-13.8, -27.7] as V2,
  kidNE: [13.8, -27.7] as V2,
  kidSW: [-13.8, -14.3] as V2,
  kidSE: [13.8, -14.3] as V2,
  /** 球员通道（西头拱门）、会所露台东沿 */
  gate: [PLAYERS_GATE.x, PLAYERS_GATE.z] as V2,
  terrace: [-27.2, -21.0] as V2,
  /** 观众：长廊进场口（西南、东南两个角）、北看台走道底、东看台背后台阶顶、饮水点 */
  entrySW: [-19.6, -9.4] as V2,
  entrySE: [19.8, -10.9] as V2,
  aisleW: [-7, -30.6] as V2,
  aisleE: [7, -30.6] as V2,
  eastStairs: [22.8, -24.0] as V2,
  fountain: [4.2, -8.95] as V2,
} satisfies Record<string, V2>;

/** 路线：总监 = 工具架 ↔ 沙堆 / 底线；球员 = 露台 → 拱门 → 长椅；观众 = 长廊 → 看台；球童跑位 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  { id: 'director-blow', pts: [SPOTS.toolRack, [-17.2, -13.1], [-9.6, -13.4], SPOTS.blowSW] },
  { id: 'director-lines', pts: [SPOTS.lineCart, [-15.2, -13.6], [-12.0, -15.5], SPOTS.lineW0] },
  { id: 'players-walkout', pts: [SPOTS.terrace, SPOTS.gate, [-17.0, -21.0], [-8.0, -28.2], SPOTS.benchW] },
  {
    id: 'spectators',
    pts: [[-12.0, -6.4], SPOTS.entrySW, [-20.0, -13.0], [-20.6, -30.6], [-20.6, -36.6]],
  },
  { id: 'spectators-east', pts: [[28.5, -24.0], SPOTS.eastStairs, [21.0, -24.0]] },
  { id: 'ballkid-run', pts: [SPOTS.kidNetS, [-6.0, -15.0], [-13.0, -15.0], SPOTS.kidSW] },
];

/**
 * 总监能走的地方（stage 3 的 control.ts 照这个做碰撞，desert3d-v2 的做法）。高度：场地、西头、长廊都是 0；
 * 看台走道按级插值（每级 0.9 高 = 两步 0.45）；东看台背后台阶按级插值。
 */
export const WALKABLE = [
  {
    id: 'court',
    note: 'CELL（x −18…18、z −30…−12，y 0），减掉网（x ±0.2、z −27.4…−14.6，比赛时不能过网）、裁判椅、长椅、伞座的脚印',
  },
  { id: 'westEnd', note: '西头 x −26…−18、z −30…−9.8：球员通道、工具角；往西接会所露台（换场景）' },
  { id: 'promenade', note: '长廊 z −8.6…−4.4（往东去 clubplaza / clubdesk，往西去会所）；西南、东南两个角进场' },
  { id: 'aisles', note: '北看台四条走道（x −14、−7、7、14，各 1.1 宽）+ 最高一级踏面（顶上的横走道）+ 西头的看台端梯' },
  { id: 'eastStairs', note: 'EAST_STAIRS（x 21.6…24、z −25…−23）+ 东看台顶一级；接 clubplaza 的 STADIUM_LINK 小路' },
];

// ── 资产位置（占位或资产）────────────────────────────────────────
/** asset = assets/<asset>.ts 或复用的资产；rotY 弧度（0 = 面朝镜头 +z）；s 缩放；y 不填 = 地面高度 */
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
}

const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const E = P / 2; // 面朝 +x（东）
const N = P; // 面朝 −z（北，背对镜头）
/** 北看台第 k 级踏面上、靠后（座椅前）站着的人的高度 */
const ny = (k: number) => northTread(k).y;
const KID = 0.74;

export const SLOTS: Slot[] = [
  // ── 主角：网 + 裁判椅 + 两张球员长椅和伞 ──────────────────────
  { id: 'court-net', asset: 'court-net', x: S.x, z: S.z, labelAt: [S.x + 0.4, 1.6, S.z + 2.2] },
  {
    id: 'umpire-chair',
    asset: 'umpire-chair-cc',
    x: SPOTS.umpire[0],
    z: SPOTS.umpire[1],
    rotY: 0,
    label: '裁判椅（中心球场款，无遮阳顶）',
  },
  {
    id: 'umpire',
    asset: 'umpire',
    x: SPOTS.umpire[0],
    z: SPOTS.umpire[1] + 0.02,
    y: 1.32,
    labelAt: [-0.9, 3.4, -28.4],
  },
  { id: 'bench-w', asset: 'player-bench', x: SPOTS.benchW[0], z: SPOTS.benchW[1], variant: 0, labelBelow: true },
  { id: 'bench-e', asset: 'player-bench', x: SPOTS.benchE[0], z: SPOTS.benchE[1], variant: 1, noLabel: true },
  { id: 'umbrella-w', asset: 'court-umbrella', x: SPOTS.benchW[0] - 0.55, z: SPOTS.benchW[1] - 0.15, variant: 0 },
  {
    id: 'umbrella-e',
    asset: 'court-umbrella',
    x: SPOTS.benchE[0] + 0.55,
    z: SPOTS.benchE[1] - 0.15,
    variant: 1,
    noLabel: true,
  },
  // ── 比赛：上网截击的一刻（两个人都在竖屏 ±8 米里）──────────────
  {
    id: 'player-a',
    asset: 'player',
    x: -3.4,
    z: -22.4,
    rotY: E - 0.2,
    variant: 0,
    pose: ['forehand', 0.55],
    prop: 'racket',
    label: '球员 A（上网）',
  },
  {
    id: 'player-b',
    asset: 'player',
    x: 7.4,
    z: -18.6,
    rotY: W + 0.25,
    variant: 1,
    pose: ['backhand', 0.3],
    prop: 'racket',
    label: '球员 B',
  },
  { id: 'ball', asset: 'ball-fly', x: 1.6, z: -21.6, y: 1.25, noLabel: true },
  // ── 球童：网柱旁蹲着两个、四个底线角站着 ───────────────────────
  ...(
    [
      ['kid-net-n', SPOTS.kidNetN, 0, 'ready', 0.2],
      ['kid-net-s', SPOTS.kidNetS, N, 'ready', 0.6],
      ['kid-nw', SPOTS.kidNW, 0.4, 'idle', 0.1],
      ['kid-ne', SPOTS.kidNE, -0.4, 'idle', 0.5],
      ['kid-sw', SPOTS.kidSW, N - 0.4, 'idle', 0.3],
      ['kid-se', SPOTS.kidSE, N + 0.4, 'idle', 0.7],
    ] as [string, V2, number, string, number][]
  ).map(([id, at, r, pose, ph], i) => ({
    id,
    asset: 'ball-kid',
    x: at[0],
    z: at[1],
    rotY: r,
    s: KID,
    variant: 2,
    pose: [pose, ph] as [string, number],
    prop: null,
    noLabel: i > 0,
    label: '球童 ×6',
  })),
  // ── 总监：西南角吹沙（南看台脚下，往西吹出敞口）──────────────────
  {
    id: 'director',
    asset: 'director',
    x: SPOTS.blowSW[0],
    z: SPOTS.blowSW[1],
    rotY: W + 0.1,
    pose: ['blow', 0.25],
    prop: 'blower',
    label: '总监（吹沙）',
  },
  { id: 'sand-sw', asset: 'sand-drift', x: SPOTS.sandSW[0], z: SPOTS.sandSW[1], rotY: 0.05, variant: 0 },
  { id: 'sand-nw', asset: 'sand-drift', x: SPOTS.sandNW[0], z: SPOTS.sandNW[1], rotY: 0.3, variant: 1, noLabel: true },
  { id: 'sand-ne', asset: 'sand-drift', x: SPOTS.sandNE[0], z: SPOTS.sandNE[1], rotY: -0.2, variant: 2, noLabel: true },
  // ── 看台：观众（便宜的坐着的人）、走道上找座位的、卖水的 ─────────────
  { id: 'crowd', asset: 'crowd', x: 0, z: 0, labelAt: [-10.5, 6.4, -34.6] },
  {
    id: 'spec-aisle-w',
    asset: 'player',
    x: -7.0,
    z: northTread(2).za - 0.55,
    y: ny(2) - 0.45,
    rotY: N + 0.2,
    variant: 3,
    pose: ['walk', 0.4],
    prop: null,
    label: '找座位',
  },
  {
    id: 'vendor',
    asset: 'player',
    x: 7.0,
    z: northTread(3).za - 0.55,
    y: ny(3) - 0.45,
    rotY: W,
    variant: 2,
    pose: ['idle', 0.5],
    prop: null,
    label: '卖水的（以后换小贩）',
  },
  // 南看台东头一个站起来的（背对镜头，看球）
  {
    id: 'spec-south',
    asset: 'player',
    x: 9.6,
    z: -10.35,
    y: 0.6,
    rotY: N,
    variant: 0,
    pose: ['idle', 0.2],
    prop: null,
    noLabel: true,
  },
  // ── 记分牌、旗杆（北看台顶）────────────────────────────────────
  { id: 'scoreboard', asset: 'stadium-scoreboard', x: SCOREBOARD.x, z: SCOREBOARD.z },
  ...FLAGS.map(([x, z], i) => ({
    id: `flag-${i}`,
    asset: 'stadium-flag',
    x,
    z,
    y: NORTH_BACK.top,
    variant: i,
    noLabel: i > 0,
  })),
  // ── 西头：球员通道、工具角（工具架 + 划线车）────────────────────────
  { id: 'players-gate', asset: 'players-gate', x: PLAYERS_GATE.x, z: PLAYERS_GATE.z },
  { id: 'tool-rack', asset: 'tool-rack', x: -21.6, z: -13.6, rotY: 0.25, label: '工具架（复用）' },
  { id: 'line-cart', asset: 'line-marker', x: SPOTS.lineCart[0], z: SPOTS.lineCart[1] - 0.6, rotY: 0.4 },
  // ── 长廊：饮水点（靠着南看台背墙）、走过的会员、长椅（地图 scatter 的）────────
  { id: 'drink-fountain', asset: 'drink-fountain', x: SPOTS.fountain[0], z: SPOTS.fountain[1] - 0.2, rotY: 0 },
  {
    id: 'member-drink',
    asset: 'player',
    x: SPOTS.fountain[0] + 0.05,
    z: SPOTS.fountain[1] + 0.6,
    rotY: N,
    variant: 3,
    pose: ['idle', 0.4],
    prop: 'racket',
    noLabel: true,
  },
  {
    id: 'member-prom-1',
    asset: 'player',
    x: -3.6,
    z: -6.0,
    rotY: W,
    variant: 2,
    pose: ['walk', 0.2],
    prop: 'racket',
    noLabel: true,
  },
  {
    id: 'member-prom-2',
    asset: 'player',
    x: -15.2,
    z: -7.2,
    rotY: N + 0.5,
    variant: 1,
    pose: ['walk', 0.65],
    prop: 'racket',
    noLabel: true,
  },
  { id: 'bench-prom-e', asset: 'bench', x: 12, z: -3.6, rotY: P, noLabel: true },
  { id: 'bench-prom-w', asset: 'bench', x: -20, z: -3.6, rotY: P, noLabel: true },
  // ── 墙外：一排蒲葵（地图 scatter 那排，z −46.5…−49；叶冠在竖屏上沿外，只露树干和影子）──
  { id: 'palm-out-1', asset: 'fan-palm', x: -27, z: -47.4, variant: 1, s: 1.15, noLabel: true },
  { id: 'palm-out-2', asset: 'fan-palm', x: -17.5, z: -48.2, variant: 0, s: 1.2, noLabel: true },
  { id: 'palm-out-3', asset: 'fan-palm', x: -9.2, z: -46.8, variant: 2, s: 1.1, noLabel: true },
  { id: 'palm-out-4', asset: 'fan-palm', x: 10.4, z: -47.6, variant: 1, s: 1.15, noLabel: true },
  { id: 'palm-out-5', asset: 'fan-palm', x: 19.0, z: -46.9, variant: 0, s: 1.05, noLabel: true },
  { id: 'palm-out-6', asset: 'fan-palm', x: 27.4, z: -48.0, variant: 2, s: 1.2, noLabel: true },
  // ── 西头、东头的沙地上手摆几簇（不撒满）────────────────────────────
  { id: 'agave-gate-n', asset: 'agave', x: -24.4, z: -24.6, s: 0.9, noLabel: true },
  { id: 'agave-gate-s', asset: 'agave', x: -24.2, z: -17.2, s: 0.8, noLabel: true },
  { id: 'brittle-w', asset: 'brittlebush', x: -23.6, z: -31.6, variant: 1, noLabel: true },
  { id: 'creosote-w', asset: 'creosote', x: -24.8, z: -35.4, variant: 0, noLabel: true },
  { id: 'smoke-e', asset: 'smoke-tree', x: 26.6, z: -32.0, variant: 1, noLabel: true },
  { id: 'brittle-e', asset: 'brittlebush', x: 25.0, z: -27.6, variant: 0, noLabel: true },
  { id: 'creosote-e', asset: 'creosote', x: 26.2, z: -18.6, variant: 1, noLabel: true },
  { id: 'palm-se', asset: 'fan-palm', x: 25.4, z: -11.2, variant: 2, s: 0.95, noLabel: true },
  // 东看台上两个人（侧面）+ 东边小路上走来的一对（从喷泉广场来看球）
  {
    id: 'spec-link-1',
    asset: 'player',
    x: 26.8,
    z: -24.4,
    rotY: W,
    variant: 3,
    pose: ['walk', 0.1],
    prop: null,
    noLabel: true,
  },
  {
    id: 'spec-link-2',
    asset: 'player',
    x: 27.9,
    z: -23.4,
    rotY: W,
    variant: 0,
    pose: ['walk', 0.6],
    prop: null,
    noLabel: true,
  },
];

/** 区域标签（白模评审用，?labels=0 不显示）：文字、位置 (x, y, z)；kind area = 区域名，propose = 共享坐标的建议 */
export const AREA_LABELS: { text: string; x: number; y: number; z: number; kind?: 'area' | 'propose' }[] = [
  { text: '北看台 6 级（立面暗 / 人亮）', x: 9.5, y: 4.2, z: -34.4 },
  { text: '东看台 3 级', x: 19.8, y: 3.0, z: -16 },
  { text: '南看台 2 级（背对镜头）', x: -9, y: 1.4, z: -10.6 },
  { text: '长廊', x: 14, y: 0.3, z: -6.4 },
  { text: '青训场', x: 8, y: 0.4, z: 2.0 },
  { text: '会所露台（邻居）', x: -31.5, y: 3.6, z: -27 },
  { text: '→ 喷泉广场（clubplaza 的小路）', x: 27.5, y: 0.6, z: -26.4 },
  { text: '建议：记分牌挪到北看台顶、朝南', x: 0, y: 11.6, z: -38.2, kind: 'propose' },
  { text: '建议：西头 = 球员通道（拱门）', x: -22.2, y: 5.2, z: -21, kind: 'propose' },
  { text: '建议：东看台背后加台阶接广场小路', x: 22.8, y: 3.4, z: -24, kind: 'propose' },
];

/**
 * 云影（手摆，硬边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘。toon.ts 按 x ∈ [−48, 48) 绕回来。
 * 只走两条带：墙外的沙漠（z −45…−48）和长廊 / 青训场（z −1…−5）—— 永远不上场地和北看台（人群上的云影 = 一大块脏灰）。
 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(-6), -46.2, 4.6, 1.4],
  [wrapX(-2), -46.9, 2.6, 1.0],
  [wrapX(30), -45.8, 4.0, 1.4],
  [wrapX(-14), -1.6, 4.4, 1.5],
  [wrapX(-10.5), -0.9, 2.4, 1.1],
  [wrapX(22), -2.0, 4.2, 1.5],
];
export const CLOUD_VEL = 0.12;

// ── stage 3 · 玩法（play.ts / life.ts 用）──────────────────────────────────
/**
 * 总监的导航范围（点地面寻路的网格）：西到球员通道外的小路，东到东看台，北到看台最高一级，南到长廊。
 * 西边的会所露台、东边去喷泉广场的小路 = 别的场景（clubwalk 接起来以后再连）。
 */
export const NAV_BOUNDS: Rect = { x0: -27.6, x1: 31, z0: -42.6, z1: -4.4 };
/**
 * 地面上能走的（并集）：场地、西头（球员通道 + 工具角）、端梯西边的沙地（北到导航北沿）、长廊、南看台和东看台之间的东南角。
 * 看台的走道、端梯、最高一级的横走道在 STAND_RAMPS 里（坡道本身算能走）。
 */
export const PLAY_WALK: Rect[] = [
  CELL,
  { x0: -27.4, x1: CELL.x0, z0: CELL.z0 + 0.4, z1: -9.7 },
  { x0: -27.4, x1: STANDS.north.x0 - 1.2, z0: NAV_BOUNDS.z0, z1: CELL.z0 + 0.4 },
  { x0: -27.4, x1: 24, z0: -9.7, z1: -4.4 },
  { x0: CELL.x1, x1: 21.6, z0: CELL.z1, z1: -9.7 },
  // 东看台背后的沙地（东到广场西沿的挡土墙前 x 31，clubwalk 里接 clubplaza）+ 东北角（北看台东头以东，北到北围墙脚）
  { x0: 21.6, x1: 31, z0: CELL.z0, z1: -9.7 },
  { x0: STANDS.north.x1, x1: 31, z0: -42.5, z1: CELL.z0 },
];
/**
 * 看台上走的路（坡道：高度按 z 线性插值，覆盖地面高度）。北看台的广告板（0.9 高）挡住走道的下口，
 * 所以上看台只有一条路：西头端梯（x −21.2…−20）→ 最高一级的横走道（y 5.4）→ 四条走道往下（到第 0 级，y ≈ 1）。
 * 横走道 = 最高一级踏面座椅前面那条（画出来 z −36.68…−36.0）：坡道放宽到 z −36.95…−35.8（身体可以挨着座椅、探出踏面前沿一点），
 * 南沿靠 play.ts 的座位块挡路（圆角，摇杆带一点南偏也能滑过走道口），不靠坡道边。
 * 走道的台阶当坡道走：第 k 级前沿 z = −30 − 1.2k、高 0.9(k + 1) → y(z) = 0.9 + 0.75 × (−30 − z)。
 */
export const STAND_TOP_Y = northTread(STANDS.north.n - 1).y;
/** 横走道的 z 范围；端梯、走道从它的南沿（z1）起坡，接缝处不起台阶（寻路每格最多升 stepUp / 2） */
const CROSS_Z = { z0: -36.95, z1: -35.8 } as const;
export const STAND_RAMPS = [
  // 横走道（放在最前面：和端梯、走道重叠的地方以它为准）
  {
    x0: STANDS.north.x0 - 1.2,
    x1: STANDS.north.x1,
    z0: CROSS_Z.z0,
    z1: CROSS_Z.z1,
    from: STAND_TOP_Y,
    to: STAND_TOP_Y,
    axis: 'z' as const,
  },
  // 西头端梯：从场地北沿的西头（z −29.6，地面）往北上到横走道
  {
    x0: STANDS.north.x0 - 1.2,
    x1: STANDS.north.x0,
    z0: CROSS_Z.z1,
    z1: -29.6,
    from: STAND_TOP_Y,
    to: 0,
    axis: 'z' as const,
  },
  // 四条走道（下口到第 0 级前沿，被广告板挡住）
  ...STANDS.aisles.map((c) => ({
    x0: c - STANDS.aisleW / 2,
    x1: c + STANDS.aisleW / 2,
    z0: CROSS_Z.z1,
    z1: STANDS.north.front,
    from: STAND_TOP_Y,
    to: 0.9,
    axis: 'z' as const,
  })),
];
/** 东看台背后的台阶（坡道：x0 那头高、x1 那头地面）+ 台阶顶上东看台最高一级踏面的一小块平台 */
const EAST_TOP = tier(STANDS.east.n - 1, STANDS.east.rise, STANDS.east.deep).top;
export const EAST_RAMPS = [
  {
    x0: 21.0,
    x1: EAST_STAIRS.x0,
    z0: EAST_STAIRS.z0,
    z1: EAST_STAIRS.z1,
    from: EAST_TOP,
    to: EAST_TOP,
    axis: 'x' as const,
  },
  { ...EAST_STAIRS, from: EAST_TOP, to: 0, axis: 'x' as const },
];
/** 看台上某点的高度（走道、端梯、横走道；不在上面 = null）：给 NPC 走路用（总监走路由 play 的导航算） */
export function standY(x: number, z: number): number | null {
  for (const r of STAND_RAMPS)
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)
      return r.from + (r.to - r.from) * ((z - r.z0) / (r.z1 - r.z0));
  return null;
}
/**
 * 比赛的地方（双打边线外、底线后 3 米）：比赛中总监不能进（导航挡住，换边的时候放开）。
 * 场边那一条（南看台脚下 z > −14.3、底线后 |x| > 15）能走：西南的沙堆、两个北角的沙堆比赛中也够得着。
 */
export const MATCH_RECT: Rect = { x0: -15, x1: 15, z0: -29.35, z1: -14.3 };
/** 玩法模式的取景范围（相机不出这个世界范围）：西到会所露台东沿，东到东看台背后，北边竖屏最多看到记分牌上面一点沙漠，南到青训场 */
export const PLAY_VIEW: Rect = { x0: -36, x1: 30, z0: -54, z1: 10 };
