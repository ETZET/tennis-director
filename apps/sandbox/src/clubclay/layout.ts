// clubclay 的构图：两片红土场（南北叠着，场地东西向）—— 近的一片（outer_3）在比赛，远的一片（outer_2）总监在维护。手摆，不是程序撒点。
// 世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）：球场、步道、草坪、围墙都从那边 import（只读）；
// clubdesk 定下来的草坪下沉、墙的尺寸、草坪上的遮阳帆和假紫荆也从 clubdesk/layout.ts import（只读），两个场景横屏里接得上。
// 这里只放这个场景自己的东西（围网怎么拉、场地状态、站位、资产位置、云），也写在同一套世界坐标里。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米）。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
//              x 13.2        17（网）           23.4          28.9（东底线）   30.8   竖屏取景（tx 22、tz 39.5）
//   z 12.6  ┌──────────────────────────────────────────────────────────────┐
//           │ ▓▓▓ 青训场南围网 + 远场北围网（两道挡风布叠成上沿的暗框）▓▓▓▓▓▓▓│ 暗带 1（顶框）
//   z 16.7  │ ░░░ 北围网的投影（远场北沿 2.7 米）░░░░░░░░░░░░░░░░░░░░░░░░░░░│
//           │ 湿（浇过水，深红）│ 已拖平（匀，一道道拖痕）            水管卷盘 ◎│ 远场 outer_2：总监维护
//           │  ← 水管 ～～～～～～～～～～～～～～～～～～～～～～～╯  扫线刷 ／│
//   z 26    │ 湿 │网│  起尘（脚印）← 总监拉着拖垫往西 ▬▬ 拖垫 ▒▒ 已拖平 → │
//           │    │  │ 起尘、线上盖了土                                     │
//   z 33.8  │ ▓▓▓▓▓▓▓▓ 两片场之间的挡风布围网（暗带 2）▓▓▓▓▓▓▓▓ 记分牌 ▓▓▓│
//           │ 伞+长椅  裁判椅  伞+长椅  水站  伞+长椅（观众）  站着的观众 │ 场边（围网投影里，伞顶和人头是亮的）
//   z 37.1  │ ─────────────────── 双打边线 ────────────────────────────────│
//           │        │网│  网前（东）                          发球的人 ●  │ 近场 outer_3：比赛（双打，东边发球）
//           │  网前（西）● │                  球印 · ·      底线后起尘的一块│
//   z 48.1  │ ─────────────────── 双打边线 ────────────────────────────────│
//   z 52    │ ▓▓▓▓▓▓▓▓ 俱乐部南墙（土坯朝镜头 + 投影，暗带 3）▓▓▓ 壁柱 ▓▓▓▓▓▓▓▓│
//           │ 假紫荆（左下框）   高尔夫的沙地（安静）              蒲葵（右下框）│
//   z 61    │ ════ 高尔夫球道（亮绿，修剪条纹）════════════════════════════│
//           └──────────────────────────────────────────────────────────────┘
//
// 原则：主角 = 近场的比赛（下半）+ 远场的总监和三种场地状态（上半），中间一条场边（伞、裁判椅、观众）压在两片场之间的暗带上；
// 三条朝镜头的暗带（上：远场北围网；中：两片场之间的围网；下：南墙）把画面分成"维护 / 场边 / 比赛 / 高尔夫"四层。
// 视线：右上的水管卷盘 → 绿色水管斜着往左下 → 湿的那一块和网 → 总监和拖垫 → 场边的伞 → 近场的发球人。
// 安静的地方：远场南边起尘的那一片、近场中间（只有几个球印）、墙外高尔夫的沙地。
import { H as DESK_H, SLOTS as DESK_SLOTS, WALL as DESK_WALL, LAWN_PIT } from '../clubdesk/layout';
import { COURTS, type Court, GROUNDS, LAWN, PATHS, type Rect, type V2 } from '../clubsite/world';

export type { Court, Rect, V2 };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/** 各层高度（米）。地图是平的；草坪下沉 0.5 是 clubdesk 定的（横屏右边露出来，同一份数） */
export const H = { ground: 0, lawn: DESK_H.lawn };

/** 墙的尺寸（clubmap2/build.ts 同尺寸，clubdesk 抄了一份，这里只读 import 那份） */
export const WALL = DESK_WALL;
/** 南墙（GROUNDS.z1 = 52）：墙外是高尔夫 */
export const SOUTH_WALL_Z = GROUNDS.z1;

/** 两片红土场：远的（北）outer_2 = 总监维护；近的（南）outer_3 = 比赛 */
const court = (id: string) => COURTS.find((c) => c.id === id) as Court;
export const FAR = court('outer_2');
export const NEAR = court('outer_3');
export const MEMBER = court('outer_1');
export const PRACTICE = court('practice_e');
export const PRACTICE_W = court('practice_w');
export const cellOf = (c: Court): Rect => ({ x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz });

/** 标准网球场（米）：底线到底线、双打宽、单打宽、发球线离网、网长（含网柱外伸）、网高（柱 / 中间） */
export const DIM = { L: 23.77, DW: 10.97, SW: 8.23, SVC: 6.4, netLen: 12.8, netPost: 1.07, netMid: 0.914 } as const;
/** 线宽：2 设计纹素（0.18 米），同 desert3d-v2 / clubdesk 的球场（真的胶带 5 厘米，0.09 米/纹素下要 2 纹素才稳） */
export const LW = 0.18;

/**
 * 相机默认看向的地面点（竖屏 / 横屏）。
 * 竖屏（x 13.2…30.8）：网（x 17）在左边三分之一线外一点，东半场整片 + 东底线（28.9）后 1.9 米；上沿切在青训场的南围网上，下沿是高尔夫球道。
 * 横屏（x −10.3…47.3）：两片红土场整片，左边会员硬地场（outer_1）的东半，右边东步道、下沉草坪（clubdesk）和墙脚的沙地。
 */
export const TARGET = {
  portrait: { x: 22.0, z: 39.5 },
  landscape: { x: 18.5, z: 34.0 },
};

/** 太阳：同 clubpark / clubdesk（仰角 44°，方位偏东 8°：影子几乎正对镜头往下落、略往西） */
export const SUN = { el: 44, az: 8 };

/** 这个场景画到的范围（球场、步道、围网裁到这里面）：横屏左右各留 6 米 */
export const CLIP: Rect = { x0: -16, x1: 53, z0: -4, z1: 76 };

// ── 围网（fence-screen，2.6 米网球挡风布；clubdesk 的 buildFences，只读）────────────
/** 门：沿那条边、从起点算 at 米处、gap 米宽 */
export interface FenceDef {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  door?: { at: number; gap: number };
}
const FH = 2.6;
/** 两片红土场之间只拉**一道**围网（地图是两道，各自的边，中间隔 1 米）：z 33.8 —— 见 clubclay.md「共享坐标的建议」 */
export const MID_FENCE_Z = (FAR.z + FAR.hz + NEAR.z - NEAR.hz) / 2;
/** 东西两边：红土场和会员场之间也只拉一道（x 0）；红土场东边 x 33.5 各留一个门（对着东步道） */
export const SPLIT_X = 0;
export const FENCES: FenceDef[] = [
  // 远场：北边（门照地图：西头 x 3.5）、东边（门 z 19.6，对着东步道和工具架）、西边（x 0，和会员场共用）
  { x0: 0, z0: 16.7, x1: 33.5, z1: 16.7, h: FH, door: { at: 3.5, gap: 2.4 } },
  { x0: 33.5, z0: 16.7, x1: 33.5, z1: MID_FENCE_Z, h: FH, door: { at: 2.9, gap: 2.4 } },
  { x0: SPLIT_X, z0: 16.7, x1: SPLIT_X, z1: MID_FENCE_Z, h: FH },
  // 两片场之间（暗带 2，场边的伞、裁判椅、记分牌靠在它前面）
  { x0: SPLIT_X, z0: MID_FENCE_Z, x1: 33.5, z1: MID_FENCE_Z, h: FH },
  // 近场：东边（门 z 34.0…36.4，场边那一条的东头）、西边；**南边不拉**：南墙离场边只有 1.1 米，墙就是界（建议）
  { x0: 33.5, z0: MID_FENCE_Z, x1: 33.5, z1: NEAR.z + NEAR.hz, h: FH, door: { at: 1.4, gap: 2.4 } },
  { x0: SPLIT_X, z0: MID_FENCE_Z, x1: SPLIT_X, z1: NEAR.z + NEAR.hz, h: FH },
  // 会员硬地场（横屏左边）：北边（门照地图 x −30.5）、西边；南边同样不拉
  { x0: -33.5, z0: 16.7, x1: SPLIT_X, z1: 16.7, h: FH, door: { at: 3, gap: 2.4 } },
  { x0: -33.5, z0: 16.7, x1: -33.5, z1: 33.3, h: FH },
  // 青训场（上沿）：南边两段（东西两片）+ 东边
  { x0: 0.5, z0: 14.3, x1: 33.5, z1: 14.3, h: FH },
  { x0: -33.5, z0: 14.3, x1: -0.5, z1: 14.3, h: FH },
  { x0: 33.5, z0: -2.3, x1: 33.5, z1: 14.3, h: FH },
];

// ── 步道（碎花岗岩，同 clubdesk）───────────────────────────────
/** 地图的步道（东步道 x 33.6…36 已经接到南墙 z 51：近场东门有路走 —— 2026-11-08 地图采纳了这个场景的建议） */
export const SCENE_PATHS: Rect[] = [...PATHS];

// ── 场地状态（远场 = 维护进行到一半；近场 = 正在打）。白模用平涂区块 + 标签，stage 2 的 clay-court 资产照这里画 ──
/**
 * 远场 outer_2 的状态（总监从西往东做：先拖、再扫线、再浇水；现在西半场做完了，东半场拖到第 4 道）：
 * - dust：整片底色（打完没拖，干、起尘、脚印、滑步痕，线上盖了土）
 * - brushed：拖过的（西半场整片 + 东半场北边三道 + 第 4 道拖垫后面那一段）
 * - laneMarks：东半场拖过的相邻两道之间的边（拖垫宽 2.4 米，边上翻起一条淡淡的土）
 * - wet：西半场浇过水的一大块（深红；边上一圈半干）；水管从东北角的卷盘拖过来，喷头丢在湿区东沿
 * - lines：西半场扫过线（白），东半场线上盖着土（tapeDust）
 */
export const FAR_STATE = {
  brushed: [
    { x0: FAR.x - FAR.hx, x1: FAR.x, z0: FAR.z - FAR.hz, z1: FAR.z + FAR.hz },
    { x0: FAR.x, x1: FAR.x + FAR.hx, z0: FAR.z - FAR.hz, z1: 24.8 },
    { x0: 26.1, x1: FAR.x + FAR.hx, z0: 24.8, z1: 27.2 },
  ] as Rect[],
  /** 拖痕边 (z, x0, x1)：东半场拖过的相邻两道之间（第 4 道只拖到拖垫后沿 x 26.1） */
  laneMarks: [
    [19.6, FAR.x, FAR.x + FAR.hx],
    [22.2, FAR.x, FAR.x + FAR.hx],
    [24.8, 26.1, FAR.x + FAR.hx],
  ] as [number, number, number][],
  wet: [
    [2.2, 18.6],
    [8.0, 18.0],
    [13.4, 18.9],
    [17.6, 19.8],
    [18.4, 22.6],
    [17.7, 25.4],
    [18.8, 28.2],
    [17.3, 31.5],
    [12.0, 32.3],
    [6.0, 31.8],
    [2.0, 30.6],
    [1.6, 24.6],
  ] as V2[],
  /** 线：x < sweptX 的扫过（白），其余盖着土 */
  sweptX: FAR.x,
};

/**
 * 近场 outer_3 的状态（正在打的一盘）：底色正常红土；两条底线后面、发球线 T 附近踩出来的起尘区；几个球印（小深椭圆）、两道滑步痕。
 * 位置手摆（白模），stage 2 换成 clay-court 资产里的元素。
 */
export const NEAR_STATE = {
  worn: [
    // 东底线后（发球人站的地方，竖屏右下）
    [
      [28.3, 38.6],
      [30.6, 38.2],
      [31.9, 40.4],
      [31.6, 44.6],
      [30.9, 47.0],
      [28.6, 47.2],
      [28.2, 43.0],
    ],
    // 西底线后（横屏）
    [
      [2.4, 38.4],
      [5.6, 38.0],
      [5.9, 42.0],
      [5.5, 47.0],
      [2.8, 46.8],
      [2.0, 42.6],
    ],
    // 两个发球线 T 附近
    [
      [22.6, 41.6],
      [24.4, 41.4],
      [24.6, 43.8],
      [22.8, 44.0],
    ],
    [
      [9.6, 41.4],
      [11.4, 41.6],
      [11.4, 43.6],
      [9.6, 43.8],
    ],
  ] as V2[][],
  /** 球印：(x, z, 朝向弧度) —— 0.32 × 0.16 米的小椭圆 */
  marks: [
    [26.9, 40.9, 0.2],
    [25.6, 44.6, -0.3],
    [21.4, 46.6, 0.1],
    [26.3, 38.3, 0.4],
    [24.0, 47.2, -0.1],
    [12.3, 39.5, 0.3],
    [15.7, 47.4, -0.2],
    [7.4, 45.6, 0.1],
  ] as [number, number, number][],
  /** 滑步痕：(x, z, 长, 朝向)，沿底线方向（z）的浅色长条 */
  slides: [
    [30.1, 40.4, 1.5, 0.15],
    [29.6, 44.2, 1.2, -0.1],
    [4.1, 41.0, 1.3, 0.1],
  ] as [number, number, number, number][],
};

/**
 * 水管：东北角卷盘 → 沿北边往西 → 斜着往左下穿过拖平的地方 → 喷头丢在湿区东沿、网柱边。绿色（和红土互补，画面里最清楚的一条引导线）。
 * stage 3 里水管跟着总监走（卷盘放线 / 收线），这里是静止时的样子。
 */
export const HOSE = {
  w: 0.12,
  pts: [
    [29.9, 21.3],
    [28.0, 21.9],
    [24.6, 22.4],
    [21.6, 23.4],
    [19.6, 25.0],
    [18.6, 26.6],
  ] as V2[],
};

// ── 站位、路线、能走的地方（stage 3 用；白模里标签开着时画成洋红小圆盘 + 小点）──────
/**
 * 站位。总监的工作点都在远场：拖垫（dragNow = 现在拖到的地方）、卷盘、扫线刷、东门；工具架在东步道外（横屏）。
 * 近场的：裁判椅、两边球员的长椅、观众、水站、记分牌。
 */
export const SPOTS = {
  dragNow: [23.5, 26.0] as V2,
  hoseReel: [29.9, 20.6] as V2,
  /** 水龙头：卷盘接在东围网的柱子上 */
  tap: [33.1, 20.4] as V2,
  lineBrush: [28.6, 23.6] as V2,
  hoseNozzle: [18.6, 26.6] as V2,
  doorFarE: [34.0, 19.6] as V2,
  doorNearE: [34.0, 35.2] as V2,
  doorFarN: [3.5, 16.0] as V2,
  toolRack: [39.6, 36.8] as V2,
  umpire: [17.0, 35.2] as V2,
  benchW: [14.6, 35.0] as V2,
  benchE: [19.4, 35.0] as V2,
  water: [21.4, 35.4] as V2,
  spectators: [23.9, 35.0] as V2,
  scoreboard: [28.3, 34.8] as V2,
  server: [29.5, 45.3] as V2,
  netE: [20.8, 40.2] as V2,
  netW: [14.8, 44.8] as V2,
  returner: [3.4, 39.6] as V2,
  eastWalkS: [35.5, 50.6] as V2,
} satisfies Record<string, V2>;

/**
 * 路线：
 * - drag：拖场的一圈（拖垫 2.4 米宽，一道一道东西来回，西半场已经做完；这里画东半场剩下的四道 + 回到东门）
 * - hose：卷盘 → 拉着水管到湿区东沿（stage 3：按住浇水，水管跟着人放线）
 * - lines：扫线（东半场的底线 → 发球线 → 中线 → 两条边线，扫线刷推着走）
 * - tools：东门 → 工具架（换工具）
 * - change：换边 —— 近场两边的人从网柱旁走过裁判椅（场边那条）
 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  {
    id: 'drag',
    pts: [
      SPOTS.dragNow,
      [18.0, 26.0],
      [18.0, 28.4],
      [32.4, 28.4],
      [32.4, 30.8],
      [18.0, 30.8],
      [18.0, 32.4],
      [32.6, 32.4],
    ],
  },
  { id: 'hose', pts: [SPOTS.hoseReel, [28.0, 21.9], [24.6, 22.4], [21.6, 23.4], SPOTS.hoseNozzle] },
  {
    id: 'lines',
    pts: [
      [28.9, 19.6],
      [28.9, 30.4],
      [23.4, 30.4],
      [23.4, 21.0],
      [23.4, 25.0],
      [17.6, 25.0],
    ],
  },
  { id: 'tools', pts: [SPOTS.hoseReel, [32.6, 19.6], SPOTS.doorFarE, [35.5, 22], [35.5, 34.5], SPOTS.toolRack] },
  { id: 'change', pts: [SPOTS.netE, [17.8, 37.2], [16.2, 37.2], [14.6, 39.6]] },
];

/**
 * 总监能走的地方（stage 3 的 control.ts 照这个做碰撞，desert3d-v2 的做法）：
 * 两片红土场的围场里面（减掉网、裁判椅、长椅、伞杆、水站、记分牌、卷盘）+ 东步道 + 两排场之间的步道 + 墙里的沙地；
 * 进出场只走门（远场东门 z 19.6、北门 x 3.5；近场东门 z 35）。比赛中的近场：能进场边那一条（z 34…37.1），不能进双打边线以内
 * （打扰比赛 —— 以后接满意度）。墙外的高尔夫不能去。
 */
export const WALKABLE = [
  { id: 'far-court', note: '远场围场 x 0.3…33.3、z 16.9…33.6（减网 x 16.8…17.2 z 18.6…31.4、卷盘）' },
  { id: 'near-sideline', note: '近场场边 x 0.3…33.3、z 34.0…37.1（减裁判椅、三张长椅、伞杆、水站、记分牌）' },
  { id: 'near-court', note: '近场双打线以内：比赛时不让进（换边和比赛结束后可以拖场）' },
  { id: 'paths', note: '两排场之间的步道（z 14.4…16.6，被远场北围网挡住大半）、东步道（x 33.6…36，往南接到墙）' },
  { id: 'sand', note: '墙里的沙地（东步道东边、草坪南边：安静区，能走，不放东西）' },
];

/**
 * 导航（stage 3，clubsite/play 的 NavSpec 用）：能走的矩形并集 + 静态挡路的。围网不用画成挡路的线：
 * 两块能走的矩形之间留 0.35～0.5 米的缝（比身子窄 = 过不去），只有门那一截用小矩形接上。
 * 长椅、裁判椅、水站、记分牌、工具架这些摆好的资产在 play.ts 里用 footprint() 量包围盒加进挡路的。
 */
export const NAV_BOUNDS: Rect = { x0: -1, x1: 54, z0: 13.6, z1: 52 };
export const WALK_RECTS: Rect[] = [
  // 远场围场里面（围网 x 0 / 33.5、z 16.7 / 33.8）
  { x0: 0.25, x1: 33.25, z0: 16.95, z1: 33.55 },
  // 近场：场边那一条 + 场里（南边到墙脚）
  { x0: 0.25, x1: 33.25, z0: 34.05, z1: 51.3 },
  // 两排场之间的步道、东步道、墙里草坪南边的沙地
  { x0: 0, x1: 37, z0: 14.45, z1: 16.45 },
  { x0: 33.6, x1: 36.2, z0: 14.45, z1: 51.3 },
  { x0: 36.2, x1: 53, z0: 34.6, z1: 51.3 },
  // 门：远场东门（z 19.6…22）、近场东门（z 35.2…37.6）、远场北门（x 3.5…5.9）
  { x0: 33.0, x1: 34.0, z0: 19.7, z1: 21.9 },
  { x0: 33.0, x1: 34.0, z0: 35.3, z1: 37.5 },
  { x0: 3.65, x1: 5.75, z0: 16.2, z1: 17.2 },
];
/** 静态挡路的（资产的包围盒以外的）：两张网、伞杆、卷盘、站着的观众、球包、灯杆、东步道边的树 */
export const BLOCK_SHAPES = [
  { a: [FAR.x, FAR.z - DIM.netLen / 2] as V2, b: [FAR.x, FAR.z + DIM.netLen / 2] as V2, r: 0.18 },
  { a: [NEAR.x, NEAR.z - DIM.netLen / 2] as V2, b: [NEAR.x, NEAR.z + DIM.netLen / 2] as V2, r: 0.18 },
  ...[14.6, 19.4, 23.9].map((x) => ({ x, z: 34.35, r: 0.22 })),
  { x: 29.9, z: 20.4, r: 0.6 },
  { x: 26.1, z: 35.3, r: 0.3 },
  { x: 13.6, z: 35.75, r: 0.3 },
  { x: 20.5, z: 35.8, r: 0.3 },
  { x: 40.6, z: 42.2, r: 0.35 },
  ...[FAR, NEAR].flatMap((c) =>
    [
      [c.x - c.hx + 0.4, c.z - c.hz + 0.4],
      [c.x + c.hx - 0.4, c.z - c.hz + 0.4],
      [c.x - c.hx + 0.4, c.z + c.hz - 0.4],
      [c.x + c.hx - 0.4, c.z + c.hz - 0.4],
    ].map(([x, z]) => ({ x, z, r: 0.2 })),
  ),
];
/**
 * 相机：画面不出这个世界范围（总监在画面中心偏上，往南多看：竖屏里两片场都在）。
 * x 范围以 18.5 为中心、比横屏的画面（57.6 米）窄 → 横屏的相机 x 固定在 18.5（同白模的取景）；
 * 竖屏（17.6 米宽）相机 x 夹在 8.3…28.7：走到东步道上总监贴着右边，不会整屏都是步道和草坪。
 */
export const PLAY_VIEW: Rect = { x0: -0.5, x1: 37.5, z0: 4, z1: 70 };
/** 远场晾干：浇透到干的秒数（演出压缩：真的 15 分钟，这里 4 分钟） */
export const DRY_SECONDS = 240;

/** 资产位置（占位或资产）。asset = assets/<asset>.ts 或复用的资产；rotY 弧度；s 缩放；y 不填 = 地面高度 */
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
  /** 人物：坐着（clubsite/people 的 setSeat(座高, 脚踩的高度)；长椅 [0.52]，裁判椅 [1.77, 1.54]） */
  seat?: [number, number?];
  /** 人物：头转向这个世界坐标点（lookAt） */
  look?: [number, number, number];
  /** 人物：绞盘转轴的世界坐标（crank 姿势，setCrank） */
  crank?: [number, number, number];
}

const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const E = P / 2; // 面朝 +x（东）

/** 场边那一条的 z：长椅中心、伞杆（长椅后面、贴着围网） */
const BENCH_Z = 35.0;
const POLE_Z = 34.35;
/** 长椅座位：长椅中心左右 ±0.45、往后 0.05（长椅本地；长椅不转，朝 +z = 朝近场） */
const SEAT_X = 0.45;
const SEAT_Z = -0.05;
/** 近场的球：发球人（server，serve 0.32）抛起来的球，大约在他头顶前上方 —— 场边的人都看着它 */
const NEAR_BALL: [number, number, number] = [29.2, 2.6, 45.2];

/** clubdesk 的草坪上已经摆好的东西（横屏右边露出来）：同一份位置，只读 import */
const FROM_DESK = new Set(['sail-lawn', 'paloverde-lawn']);

export const SLOTS: Slot[] = [
  // 红土场面（assets/clay-court）：v0 远场维护到一半，v1 近场比赛中
  { id: 'clay-far', asset: 'clay-court', x: FAR.x, z: FAR.z, variant: 0 },
  { id: 'clay-near', asset: 'clay-court', x: NEAR.x, z: NEAR.z, variant: 1 },
  // ── 远场：总监拖场 + 等着用的工具 ─────────────────────────
  {
    id: 'director',
    asset: 'director',
    x: SPOTS.dragNow[0],
    z: SPOTS.dragNow[1],
    rotY: W,
    pose: ['walk', 0.3],
    prop: null,
    label: '总监（拖场）',
  },
  { id: 'drag-mat', asset: 'drag-mat', x: 25.5, z: SPOTS.dragNow[1] },
  { id: 'hose-reel', asset: 'hose-reel', x: SPOTS.hoseReel[0], z: SPOTS.hoseReel[1] - 0.2 },
  { id: 'line-brush', asset: 'line-brush', x: SPOTS.lineBrush[0], z: SPOTS.lineBrush[1], rotY: 0.35, labelBelow: true },
  { id: 'court-net-far', asset: 'court-net', x: FAR.x, z: FAR.z },
  // ── 场边（两片场之间的围网前面）：伞 + 长椅、裁判椅、水站、观众、记分牌 ────────
  { id: 'court-net-near', asset: 'court-net', x: NEAR.x, z: NEAR.z },
  { id: 'umpire-chair', asset: 'umpire-chair', x: SPOTS.umpire[0], z: SPOTS.umpire[1] },
  // 裁判坐在裁判椅上：座面 1.77、脚踩平台 1.54（椅子本地），人和椅子同一个原点（z 往后 0.02）
  {
    id: 'umpire',
    asset: 'coach',
    x: SPOTS.umpire[0],
    z: SPOTS.umpire[1] - 0.02,
    pose: ['sit', 0.2],
    prop: null,
    seat: [1.77, 1.54],
    look: NEAR_BALL,
    label: '裁判',
  },
  { id: 'bench-w', asset: 'bench', x: SPOTS.benchW[0], z: BENCH_Z },
  { id: 'umbrella-w', asset: 'court-umbrella', x: SPOTS.benchW[0], z: POLE_Z, variant: 0 },
  { id: 'bag-w', asset: 'kit-bag', x: 13.6, z: 35.75, rotY: 0.2, labelBelow: true },
  { id: 'bench-e', asset: 'bench', x: SPOTS.benchE[0], z: BENCH_Z },
  { id: 'umbrella-e', asset: 'court-umbrella', x: SPOTS.benchE[0], z: POLE_Z, variant: 1 },
  { id: 'bag-e', asset: 'kit-bag', x: 20.5, z: 35.8, rotY: -0.25, variant: 1 },
  { id: 'water-station', asset: 'water-station', x: SPOTS.water[0], z: 34.75, label: '水站（clubdesk）' },
  { id: 'bench-s', asset: 'bench', x: SPOTS.spectators[0], z: BENCH_Z },
  { id: 'umbrella-s', asset: 'court-umbrella', x: SPOTS.spectators[0], z: POLE_Z, variant: 2 },
  // 伞下长椅上的两个观众：坐着（setSeat 0.52），一个鼓掌、一个坐着看，头都转向近场的球
  {
    id: 'spectator-1',
    asset: 'player',
    x: SPOTS.spectators[0] - SEAT_X,
    z: BENCH_Z + SEAT_Z,
    variant: 2,
    pose: ['clap', 0.15],
    prop: null,
    seat: [0.52],
    look: NEAR_BALL,
    label: '观众',
  },
  {
    id: 'spectator-2',
    asset: 'player',
    x: SPOTS.spectators[0] + SEAT_X,
    z: BENCH_Z + SEAT_Z,
    variant: 0,
    pose: ['sit', 0.7],
    prop: null,
    seat: [0.52],
    look: NEAR_BALL,
  },
  {
    id: 'spectator-3',
    asset: 'player',
    x: 26.1,
    z: 35.3,
    rotY: -0.25,
    variant: 1,
    pose: ['idle', 0.5],
    prop: null,
    label: '观众',
  },
  { id: 'scoreboard', asset: 'scoreboard', x: SPOTS.scoreboard[0], z: SPOTS.scoreboard[1] - 0.6 },
  // ── 近场：双打，东边发球 ─────────────────────────────────
  {
    id: 'server',
    asset: 'player',
    x: SPOTS.server[0],
    z: SPOTS.server[1],
    rotY: W,
    variant: 0,
    pose: ['serve', 0.32],
    prop: 'racket',
    label: '发球',
  },
  {
    id: 'net-e',
    asset: 'player',
    x: SPOTS.netE[0],
    z: SPOTS.netE[1],
    rotY: W,
    variant: 1,
    pose: ['ready', 0.2],
    prop: 'racket',
  },
  {
    id: 'net-w',
    asset: 'player',
    x: SPOTS.netW[0],
    z: SPOTS.netW[1],
    rotY: E,
    variant: 2,
    pose: ['ready', 0.6],
    prop: 'racket',
    label: '双打 ×4',
  },
  {
    id: 'returner',
    asset: 'player',
    x: SPOTS.returner[0],
    z: SPOTS.returner[1],
    rotY: E,
    variant: 1,
    pose: ['ready', 0.1],
    prop: 'racket',
  },
  // ── 墙外：高尔夫（框）──────────────────────────────────────
  { id: 'paloverde-golf', asset: 'palo-verde', x: 14.6, z: 58.8, s: 1.15, variant: 1, label: 'palo-verde（左下框）' },
  { id: 'palm-golf', asset: 'fan-palm', x: 30.2, z: 62.2, variant: 2, label: 'fan-palm（右下框）' },
  { id: 'creosote-golf', asset: 'creosote', x: 24.4, z: 54.6, variant: 0 },
  { id: 'brittle-golf', asset: 'brittlebush', x: 19.2, z: 55.3, variant: 1 },
  // 横屏才看得到的
  { id: 'smoke-golf-w', asset: 'smoke-tree', x: 1.5, z: 55.6, variant: 0 },
  { id: 'palm-golf-w', asset: 'fan-palm', x: -8.0, z: 59.4, variant: 0 },
  { id: 'creosote-golf-e', asset: 'creosote', x: 42.0, z: 55.2, variant: 1 },
  // ── 东步道（横屏）：工具架（总监换工具）、步道边一张长椅 + 树荫（路过的人看比赛）──
  { id: 'tool-rack', asset: 'tool-rack', x: SPOTS.toolRack[0], z: SPOTS.toolRack[1] - 0.75 },
  { id: 'bench-walk', asset: 'bench', x: 38.0, z: 43.0, rotY: W },
  { id: 'paloverde-walk', asset: 'palo-verde', x: 40.6, z: 42.2, s: 0.9, variant: 0 },
  { id: 'walker', asset: 'player', x: 35.6, z: 47.0, rotY: -0.9, variant: 2, pose: ['walk', 0.6], prop: 'racket' },
  // ── 球场的四角灯杆（地图有；8.5 米，竖屏看不到）：灯头朝本地 +z，rotY 转向球场中心 ──
  ...[FAR, NEAR, MEMBER].flatMap((c, i) => {
    const r = cellOf(c);
    return [
      [r.x0 + 0.4, r.z0 + 0.4],
      [r.x1 - 0.4, r.z0 + 0.4],
      [r.x0 + 0.4, r.z1 - 0.4],
      [r.x1 - 0.4, r.z1 - 0.4],
    ].map(([x, z], k) => ({
      id: `light-${i}-${k}`,
      asset: 'court-light',
      x,
      z,
      rotY: Math.atan2(c.x - x, c.z - z),
      labelBelow: true,
    }));
  }),
  // ── clubdesk 草坪上的（同一份位置）──
  ...DESK_SLOTS.filter((s) => FROM_DESK.has(s.id)).map((s) => ({ ...s, id: `desk:${s.id}` })),
];

/** 区域标签（白模评审用，?labels=0 不显示）：kind area = 区域名，state = 场地状态，propose = 共享坐标的建议 */
export const AREA_LABELS: { text: string; x: number; y: number; z: number; kind?: 'area' | 'propose' | 'state' }[] = [
  { text: '远场 outer_2：维护', x: 22.6, y: 0.5, z: 30.6 },
  { text: '近场 outer_3：比赛', x: 24.6, y: 0.5, z: 46.4 },
  { text: '已拖平', x: 22.0, y: 0.3, z: 20.6, kind: 'state' },
  { text: '起尘（打完没拖）', x: 25.6, y: 0.3, z: 29.4, kind: 'state' },
  { text: '浇过水', x: 14.6, y: 0.3, z: 22.0, kind: 'state' },
  { text: '底线后起尘', x: 30.1, y: 0.3, z: 42.6, kind: 'state' },
  { text: '球印', x: 26.0, y: 0.3, z: 39.3, kind: 'state' },
  { text: '南墙 z 52', x: 26.5, y: 2.4, z: SOUTH_WALL_Z },
  { text: '高尔夫（安静）', x: 22.0, y: 0.3, z: 58.4 },
  { text: '东步道（接到南墙）', x: 34.8, y: 0.4, z: 46.0 },
  { text: '会员硬地场（横屏）', x: -6.0, y: 0.6, z: 25.0 },
  { text: '球员草坪 −0.5（clubdesk）', x: 44.0, y: 0.4, z: 28.0 },
  { text: '青训场', x: 22.0, y: 0.6, z: 11.0 },
];

/**
 * 云影（手摆，硬边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘。toon.ts 按 x ∈ [−48, 48) 绕回来。
 * 只走两条带：墙外高尔夫（z 57…62）和北边青训场（z 6…11）—— 永远不上两片红土场（z 16…52）。
 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(22), 59.6, 4.4, 1.6],
  [wrapX(25.5), 60.4, 2.6, 1.2],
  [wrapX(-22), 59.0, 4.0, 1.5],
  [wrapX(-19), 59.8, 2.4, 1.1],
  [wrapX(14), 8.4, 4.2, 1.6],
  [wrapX(17.5), 9.2, 2.4, 1.1],
  [wrapX(-30), 8.0, 4.6, 1.7],
];
export const CLOUD_VEL = 0.12;

/** 草坪（clubdesk 的下沉草坪，同一份） */
export { LAWN, LAWN_PIT };
