// clubfood 的构图：会所旁边的餐车院子（餐厅小景）。手摆，不是程序撒点。
// 世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）；CLUBHOUSE、TERRACE、GROUNDS、COURTS、PATHS、POOL… 从那边 import（只读）。
// 和东边的 clubstadium 接得上：它的球员通道（WALKOUT、PLAYERS_GATE）、西头端梯那条观众路（x −20.6）只读 import / 让开。
// 这里只放这个场景自己的东西（院子范围、一排餐车、凉棚、桌子、站位、路线、资产位置、云），也写在同一套世界坐标里。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米），等效地面 z_eq = z − y。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
// 地图上的"露台餐厅"（TERRACE x −37…−26、z −36…−11：陶砖 + 木凉棚 + 四张桌子）放不下一个餐车院子 → 建议往四周扩（FOOD_COURT）：
//
//            x −46        −40          −34         −28         −22  −20
//   z −43  ┌─▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 北围墙（暗带 1）▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐
//          │ 会所东翼  │ ┌咖啡车┐  ┌──塔可车──┐  ┌─披萨车(窑+烟囱)┐ │ 北看台
//   z −38  │（红瓦）   │ └─青──┘  └────橙────┘  └──────红───────┘ │ 西端
//          │          │ 补货 ↗ 排队        排队          排队   鲜果水 │
//   z −34  │          │ 箱子   ┌────────── 凉棚（串灯）──────────┐ 冰棍车 │
//   z −27  ├──────────┤ 回收台 │ 长桌 ×6（一排排坐着吃的人）      │      │
//          │ 银色拖车（汉堡）  └──────────────────────────────────┘      │
//   z −21  │ 拱廊 ═══════ 球员通道（石板）════════════════════════ → 球员拱门（clubstadium）
//          │ 钟楼    │  垃圾 / 回收站（总监）   野餐桌 + 伞 ×3（一张上有偷薯条的鸟）
//   z −14  │ 南翼    │ 奶茶三轮  ┌── 孩子的草皮角：沙包投洞、大号叠叠乐 ──┐ 吉事果车 │ 工具角（stadium）
//   z −8.6 │ ═══════════════════════ 长廊（碎花岗岩）════════════════════════════│
//   z −2.3 │ 泳池   │  西步道  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 青训场北围网（暗带 2）▓▓▓▓▓▓▓▓▓▓▓▓▓│
//          └─────────────────────────────────────────────────────────────────┘
//
// 原则：主角 = **一排三辆餐车**（车顶和遮阳篷是画面里最饱和的三块色：青、橙、红），在画面上 1/3；它们南边是凉棚下的长桌（画面中线），
// 视线：左下长廊 → 孩子的草皮角 → 野餐桌（偷薯条的鸟）→ 球员通道上的总监（倒垃圾）→ 凉棚下吃饭的人 → 排队的人 → 三辆车 → 披萨窑的烟。
// 太阳在北偏东 8°（仰角 44°）：所有朝镜头（朝南）的车身侧面都在暗档（资产用 lightUp + 低 bands 留住颜色，clubdesk 柜台的做法）；
// 车顶、近乎水平的遮阳篷、伞面、凉棚顶是亮的 → **主色放在朝天的面上**。遮阳篷挂在车顶线、伸出 ≤ 0.8 米、近乎水平：45° 俯视下才不挡窗口里的摊主。
// 安静的地方：餐车和凉棚之间的那条碎花岗岩（排队的人站在这里，地面别再加东西）、球员通道的石板、长廊、北墙外的沙漠。
import {
  ARCADE_YARD,
  CLUBHOUSE,
  COURTS,
  FOOD_COURT,
  GROUNDS,
  PATHS,
  POOL,
  POOL_DECK,
  type Rect,
  TERRACE,
  type V2,
} from '../clubsite/world';
import { PLAYERS_GATE, WALKOUT } from '../clubstadium/layout';

export type { Rect, V2 };
export { ARCADE_YARD, CLUBHOUSE, COURTS, FOOD_COURT, GROUNDS, PATHS, PLAYERS_GATE, POOL, POOL_DECK, TERRACE, WALKOUT };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/**
 * 相机默认看向的地面点（竖屏 / 横屏）。
 * 竖屏 x −41.3…−23.7：三辆车（x −39.6…−22.3）正好一排、凉棚居中；左上角露出会所东翼的红瓦角（框），左边缘是银色拖车和奶茶三轮的一半。
 * 上 1/4 是北围墙 + 车顶，下沿是长廊和青训场北围网。
 * 横屏 x −64.8…−7.2：整个会所（钟楼、拱廊、红瓦）在左 40%，餐车院子居中，右边中心球场西头（球员拱门、北看台西端）；下沿泳池。
 */
export const TARGET = {
  portrait: { x: -32.5, z: -29 },
  landscape: { x: -33.5, z: -26.5 },
};

/** 太阳：同 clubpark / clubdesk / clubplaza / clubstadium（仰角 44°、方位偏东 8°）。影子方向 (−sin8°, +cos8°)，长 ≈ 1.04 × 高 */
export const SUN = { el: 44, az: 8 };

/** 这个场景画到的范围（围墙、球场、步道裁到这里面）。西到西墙，东到中心球场的一半（横屏右沿 x −7） */
export const CLIP: Rect = { x0: GROUNDS.x0, x1: -2, z0: GROUNDS.z0, z1: 20 };

/** 各层高度（米）：这个场景没有台地（都在 0）；暗带靠北围墙、会所南立面、车身侧面、青训围网 */
export const H = { ground: 0 } as const;

// ── 餐车院子的范围：FOOD_COURT（露台扩成的院子）、ARCADE_YARD（会所拱廊前的小院）在 clubsite/world.ts（2026-11-09 用户同意，见 clubfood.md「共享坐标」）──
/** 会所的体块（照 clubmap2/build.ts 的 house() 抄，没导出）：主楼、东翼、南翼、钟楼、东面拱廊 */
export const HOUSE = {
  main: { x0: CLUBHOUSE.x0, x1: -46, z0: CLUBHOUSE.z0, z1: -16, h: 8, roof: 3.4 },
  east: { x0: -46, x1: CLUBHOUSE.x1, z0: CLUBHOUSE.z0, z1: -27, h: 5.2, roof: 2.4 },
  south: { x0: CLUBHOUSE.x0, x1: -50, z0: -16, z1: CLUBHOUSE.z1, h: 4.4, roof: 2 },
  tower: { x: -45.6, z: -18.2, w: 3.6, h: 12.5, roof: 2.6 },
} as const;

/**
 * 一排餐车（朝南 = 服务窗朝镜头）：车身中心、长（x）、深（z）、车顶高。车背离北墙 ~1.9 米（摊主上下车、发电机、后门）。
 * 车与车之间留 0.8～0.9 米（插一只煤气罐 / 一摞箱子）。
 */
export const TRUCKS = {
  coffee: { x: -37.4, z: -39.7, len: 4.4, dep: 2.2, h: 2.9 },
  taco: { x: -31.4, z: -39.6, len: 5.8, dep: 2.4, h: 3.2 },
  pizza: { x: -25.0, z: -39.6, len: 5.4, dep: 2.4, h: 3.0 },
} as const;
/** 车的地板高（摊主站在窗口里：y = 车地板） */
export const TRUCK_FLOOR = 0.85;

/** 凉棚（串灯）：柱子在四角 + 每 3.4 米一根；顶 3.0 米；南北向的板条（屏幕上是竖条，不横切下面的人） */
export const PERGOLA = { x0: -36.6, x1: -26.4, z0: -33.8, z1: -23.4, h: 3.0 } as const;
/** 凉棚下的长桌：三排（z），每排两张（x 中心），桌长 4.2、桌面 0.9 宽，两边长凳（离桌心 0.65） */
export const TABLE_ROWS = [-31.6, -28.6, -25.6] as const;
export const TABLE_XS = [-34.1, -28.9] as const;
export const TABLE = { len: 4.2, w: 0.9, h: 0.76, bench: 0.65, seat: 0.46 } as const;
/** 球员通道（建议铺石板）：会所拱廊（x −46）一直往东接 clubstadium 的 WALKOUT（x −26 起），z 同 WALKOUT */
export const SPINE: Rect = { x0: -46, x1: WALKOUT.x0, z0: WALKOUT.z0, z1: WALKOUT.z1 };
/** 野餐桌一排（伞） */
export const PICNIC_Z = -16.6;
export const PICNIC_XS = [-35.0, -31.0, -27.0] as const;
/** 孩子的草皮角（沙包投洞两块板、大号叠叠乐） */
export const LAWN_GAMES: Rect = { x0: -37.4, x1: -28.4, z0: -13.8, z1: -10.0 };
/** 餐车前的排队区（碎花岗岩，安静：除了人不放东西） */
export const QUEUE_BAND: Rect = { x0: -40, x1: -21.4, z0: -38.4, z1: -33.8 };

// ── 站位、路线、能走的地方（玩法以后用；白模里标签开着时画成洋红小圆盘 + 小点）──────
const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const E = P / 2; // 面朝 +x（东）
const N = P; // 面朝 −z（北，背对镜头）
/** 面朝 (x, z) 这个点 */
const face = (from: V2, to: V2) => Math.atan2(to[0] - from[0], to[1] - from[1]);

/**
 * 站位。director 系列 = 总监的活（stage 3）：
 * - 倒垃圾：回收站（bins）三只桶满了 → 拎出袋子、换新袋 → 拖去会所后面（kitchenDoor）；
 * - 收桌子 / 擦桌子：回收台（trayReturn）拿收餐盆 → 走到有脏托盘的桌子（table*）→ 收回来；
 * - 补货：会所厨房门口的补货堆（supply）装手推车 → 推到餐车后门（restock*）；
 * - 帮忙：中午高峰塔可车排长队 → 总监上车（helpTaco）帮着出餐一会儿（钱多一点、别处没人管）。
 */
export const SPOTS = {
  /** 回收站（三色桶）前：总监倒垃圾 */
  bins: [-38.7, -22.3] as V2,
  /** 回收台（客人还托盘、总监拿收餐盆） */
  trayReturn: [-38.0, -26.9] as V2,
  /** 补货堆（会所东翼东墙下：箱子、冰、杯子、面粉、煤气罐）+ 手推车 */
  supply: [-38.9, -31.2] as V2,
  /** 会所厨房后门（东翼东墙，朝东 —— yaw 0 下是侧面，看不到门洞） */
  kitchenDoor: [-39.6, -35.6] as V2,
  /** 三辆车的后门 / 侧门（补货卸在这里） */
  restockCoffee: [-34.9, -40.2] as V2,
  restockTaco: [-28.1, -40.4] as V2,
  restockPizza: [-21.9, -40.0] as V2,
  /** 帮忙：塔可车里窗口后面 */
  helpTaco: [-31.0, -39.9] as V2,
  /** 擦桌子：每排桌子的南沿（站在长凳外） */
  tableA: [-31.5, -30.7] as V2,
  tableB: [-31.5, -27.7] as V2,
  tableC: [-31.5, -24.7] as V2,
  picnic: [-27.0, -15.2] as V2,
  /** 客人：三个点餐窗口、取餐、长廊进来、草皮角 */
  orderCoffee: [-37.6, -37.6] as V2,
  orderTaco: [-31.2, -37.4] as V2,
  orderPizza: [-25.6, -37.4] as V2,
  fromProm: [-36.5, -8.9] as V2,
  lawn: [-32.8, -11.9] as V2,
  /** 球员：拱廊（会所里出来）→ 球员拱门（clubstadium） */
  arcade: [-44.6, -21.0] as V2,
  gate: [PLAYERS_GATE.x - 1.2, PLAYERS_GATE.z] as V2,
  /** 鸟：野餐桌（没人坐的那张，桌上剩一盘薯条）、回收站的桶盖、凉棚顶 */
  birdTable: [-27.0, -16.6] as V2,
  birdBin: [-36.3, -22.9] as V2,
} satisfies Record<string, V2>;

/** 路线 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  // 总监：补货（补货堆 → 咖啡车和塔可车之间的小道 → 车背后那条 1.9 米的缝；咖啡车西头离东翼墙只有 0.4 米，走不了）
  {
    id: 'director-restock',
    pts: [SPOTS.supply, [-36.3, -35.3], [-34.9, -38.0], SPOTS.restockCoffee, SPOTS.restockTaco, SPOTS.restockPizza],
  },
  // 总监：收桌子（回收台 → 三排桌子南沿 → 野餐桌 → 回收台）
  {
    id: 'director-bus',
    pts: [SPOTS.trayReturn, [-36.9, -30.4], SPOTS.tableA, SPOTS.tableB, SPOTS.tableC, [-31.5, -21.0], SPOTS.picnic],
  },
  // 总监：倒垃圾（回收站 → 补货堆旁 → 厨房后门）
  { id: 'director-bins', pts: [SPOTS.bins, [-39.4, -28.0], SPOTS.kitchenDoor] },
  // 客人：长廊进来 → 草皮角边上 → 野餐桌之间 → 球员通道 → 凉棚中间的过道 → 塔可车窗口
  {
    id: 'guest',
    pts: [SPOTS.fromProm, [-37.8, -14.8], [-33.0, -18.4], [-31.5, -21.0], [-31.5, -33.0], SPOTS.orderTaco],
  },
  // 球员出场：会所拱廊 → 球员通道（石板）→ 中心球场的球员拱门
  { id: 'players', pts: [SPOTS.arcade, [-32.0, -21.0], SPOTS.gate] },
];

/**
 * 总监能走的地方（stage 3 的 control.ts 照这个做碰撞，desert3d-v2 的做法）：
 * FOOD_COURT + ARCADE_YARD + 长廊，减掉三辆车、拖车、小推车、凉棚的柱子、桌子、野餐桌、回收站、补货堆的脚印；
 * 车背后那条缝（z −42.4…−40.8）能走（补货的路）；塔可车的后门能上车（helpTaco，帮忙）。
 * 往外：长廊往东 = clubstadium / clubplaza，球员通道往东 = 中心球场（球员拱门），西步道往南 = 泳池、会员场。
 */
export const WALKABLE = [
  {
    id: 'court',
    note: 'FOOD_COURT x −40…−21.4、z −42.4…−9.4（z > −30 东沿收到 −22.6），减掉 SLOTS 里车、桌、站台的脚印',
  },
  { id: 'yard', note: 'ARCADE_YARD x −46…−40、z −27…−9.4（减钟楼 x −47.4…−43.8、z −20…−16.4）' },
  { id: 'truck', note: '塔可车车厢（helpTaco，从后门上下：z −40.8 那一侧）' },
  { id: 'prom', note: '长廊 z −8.6…−4.4（往东出画 = clubstadium）、西步道 x −38.5…−34.5（往南出画）' },
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
  /** 人物：坐着（clubsite/people 的 setSeat(座高, 脚踩的高度)） */
  seat?: [number, number?];
  /** 人物：头转向这个世界坐标点（lookAt） */
  look?: [number, number, number];
  /** 串灯：另一头（世界坐标，起点 = x, y, z） */
  to?: [number, number, number];
}

/** 资产本地 (lx, lz) → 世界（资产在 at、转 rotY） */
const local = (at: V2, rotY: number, lx: number, lz: number): V2 => [
  Math.round((at[0] + lx * Math.cos(rotY) + lz * Math.sin(rotY)) * 100) / 100,
  Math.round((at[1] - lx * Math.sin(rotY) + lz * Math.cos(rotY)) * 100) / 100,
];
const { coffee: TC, taco: TT, pizza: TP } = TRUCKS;
/** 窗口里的摊主（车本地 lx，站在窗口后 0.45 米，y = 车地板） */
const vendor = (t: { x: number; z: number; dep: number }, lx: number, v: number, id: string, pose = 'idle'): Slot => ({
  id,
  asset: 'player',
  x: t.x + lx,
  // 窗后 0.25 米（再往里 45° 俯视下头被窗上沿挡住）
  z: t.z + t.dep / 2 - 0.25,
  y: TRUCK_FLOOR,
  rotY: 0,
  variant: v,
  pose: [pose, 0.3],
  prop: null,
  noLabel: true,
});
/** 排队的人（朝北看窗口；walk = 刚走过来） */
const queuer = (id: string, x: number, z: number, v: number, phase: number, extra: Partial<Slot> = {}): Slot => ({
  id,
  asset: 'player',
  x,
  z,
  rotY: N + (x > -30 ? -0.25 : 0.2),
  variant: v,
  pose: ['idle', phase],
  prop: null,
  noLabel: true,
  ...extra,
});
/** 长桌上坐着的人：north = 坐在北边长凳（面朝镜头）；south = 南边（背对镜头） */
const diner = (id: string, x: number, row: number, side: 'n' | 's', v: number, pose: string, phase: number): Slot => ({
  id,
  asset: 'player',
  x,
  z: row + (side === 'n' ? -TABLE.bench : TABLE.bench),
  rotY: side === 'n' ? 0 : N,
  variant: v,
  seat: [TABLE.seat + 0.02],
  pose: [pose, phase],
  prop: pose === 'sip' ? 'cup' : null,
  noLabel: true,
});

/** 鲜果水车（复用 clubplaza 的 drinks-cart）、冰棍三轮、奶茶三轮、吉事果车、银色拖车：脚印中心 + 朝向 */
const AGUA: V2 = [-24.3, -34.2];
const AGUA_ROT = -0.5;
const PALETA: V2 = [-23.9, -29.2];
const PALETA_ROT = -0.75;
const TRAILER: V2 = [-40.8, -24.6];
const TRAILER_ROT = 0.22;
const BOBA: V2 = [-40.0, -14.4];
const BOBA_ROT = -0.35;
const CHURRO: V2 = [-26.3, -12.6];
const CHURRO_ROT = -0.3;

export const SLOTS: Slot[] = [
  // ── 主角：一排三辆餐车（朝南）+ 窗口里的摊主 ─────────────────────
  { id: 'truck-coffee', asset: 'truck-coffee', x: TC.x, z: TC.z, labelAt: [TC.x, 3.6, TC.z] },
  { id: 'truck-taco', asset: 'truck-taco', x: TT.x, z: TT.z, labelAt: [TT.x, 3.9, TT.z] },
  { id: 'truck-pizza', asset: 'truck-pizza', x: TP.x, z: TP.z, labelAt: [TP.x + 0.6, 3.7, TP.z] },
  vendor(TC, -0.3, 1, 'vendor-coffee'),
  vendor(TT, 0.2, 3, 'vendor-taco'),
  vendor(TP, 1.0, 2, 'vendor-pizza'),
  // 车与车之间：塔可和披萨之间一摞箱子（咖啡和塔可之间空着 = 去车背后补货的小道）
  { id: 'gap-2', asset: 'supply-stack', x: -28.1, z: -40.6, variant: 2, s: 0.8, noLabel: true },
  // 串灯：凉棚北梁（挂在板条头上 x −34.7 / −32.35 / −28.3，梁顶外沿 y 2.82、z −33.6）→ 车顶前沿（三条，下垂）。
  // 中间那条挂在塔可车窗口西头（不压在摊主脸前）
  ...(
    [
      [-34.7, -36.0],
      [-32.35, -32.6],
      [-28.3, -27.2],
    ] as const
  ).map(([x, toX], i) => ({
    id: `festoon-${i}`,
    asset: 'festoon',
    x,
    z: PERGOLA.z0 + 0.2,
    y: PERGOLA.h - 0.18,
    to: [toX, 2.95, -38.3] as [number, number, number],
    noLabel: i !== 1,
  })),
  // ── 排队：三个窗口前各一队（斜着往西南排，45° 下人不叠在一起）──────────
  queuer('q-coffee-1', -37.7, -37.6, 0, 0.1),
  queuer('q-coffee-2', -38.5, -36.7, 2, 0.5, { pose: ['idle', 0.7] }),
  queuer('q-taco-1', -31.1, -37.4, 1, 0.2, { label: '排队', noLabel: false }),
  queuer('q-taco-2', -31.9, -36.6, 3, 0.6),
  queuer('q-taco-3', -32.7, -35.8, 0, 0.9),
  queuer('q-taco-kid', -32.2, -35.4, 0, 0.3, { asset: 'kid', variant: 2 }),
  queuer('q-pizza-1', -25.7, -37.4, 2, 0.4),
  queuer('q-pizza-2', -26.6, -36.7, 1, 0.8),
  // ── 东边一列小推车（朝西南，对着凉棚）──────────────────────────
  // 鲜果水：复用 clubplaza 的 drinks-cart（洛神花红 / 柠檬水黄 + 珊瑚奶油伞），摊主站 userData.spots.vendor（本地 (−0.7, −0.85)）
  {
    id: 'agua',
    asset: 'drinks-cart',
    x: AGUA[0],
    z: AGUA[1],
    rotY: AGUA_ROT,
    label: '鲜果水（复用 clubplaza 饮料车）',
  },
  {
    id: 'vendor-agua',
    asset: 'player',
    x: local(AGUA, AGUA_ROT, -0.7, -0.85)[0],
    z: local(AGUA, AGUA_ROT, -0.7, -0.85)[1],
    rotY: AGUA_ROT,
    variant: 1,
    pose: ['idle', 0.5],
    prop: null,
    noLabel: true,
  },
  queuer('q-agua', ...local(AGUA, AGUA_ROT, -0.3, 1.25), 3, 0.2, { rotY: AGUA_ROT + N, prop: 'cup' }),
  { id: 'cart-paletas', asset: 'cart-paletas', x: PALETA[0], z: PALETA[1], rotY: PALETA_ROT },
  {
    id: 'vendor-paleta',
    asset: 'player',
    x: local(PALETA, PALETA_ROT, 1.0, -0.35)[0],
    z: local(PALETA, PALETA_ROT, 1.0, -0.35)[1],
    rotY: PALETA_ROT,
    variant: 0,
    pose: ['idle', 0.2],
    prop: null,
    noLabel: true,
  },
  // 一家人买冰棍：家长 + 踮脚的孩子
  {
    id: 'kid-paleta',
    asset: 'kid',
    x: local(PALETA, PALETA_ROT, -0.2, 1.0)[0],
    z: local(PALETA, PALETA_ROT, -0.2, 1.0)[1],
    rotY: PALETA_ROT + N,
    variant: 0,
    pose: ['idle', 0.5],
    prop: null,
    label: '一家人买冰棍',
  },
  {
    id: 'parent-paleta',
    asset: 'player',
    x: local(PALETA, PALETA_ROT, -0.9, 1.4)[0],
    z: local(PALETA, PALETA_ROT, -0.9, 1.4)[1],
    rotY: PALETA_ROT + N + 0.3,
    variant: 2,
    pose: ['idle', 0.1],
    prop: null,
    noLabel: true,
  },
  // ── 西边：会所拱廊前的银色拖车（汉堡），朝南偏东 ─────────────
  { id: 'trailer-burger', asset: 'trailer-burger', x: TRAILER[0], z: TRAILER[1], rotY: TRAILER_ROT },
  {
    id: 'vendor-burger',
    asset: 'player',
    x: local(TRAILER, TRAILER_ROT, 0.25, 0.9)[0],
    z: local(TRAILER, TRAILER_ROT, 0.25, 0.9)[1],
    y: 0.7,
    rotY: TRAILER_ROT,
    variant: 3,
    pose: ['idle', 0.4],
    prop: null,
    noLabel: true,
  },
  queuer('q-burger', ...local(TRAILER, TRAILER_ROT, 0.25, 2.25), 1, 0.6, { rotY: TRAILER_ROT + N }),
  // ── 凉棚 + 长桌（中线）──────────────────────────────────────
  {
    id: 'pergola',
    asset: 'pergola',
    x: (PERGOLA.x0 + PERGOLA.x1) / 2,
    z: (PERGOLA.z0 + PERGOLA.z1) / 2,
    labelAt: [PERGOLA.x0 + 2.2, 3.4, PERGOLA.z0 + 1.0],
  },
  ...TABLE_ROWS.flatMap((z, r) =>
    TABLE_XS.map((x, k) => ({
      id: `table-${r}-${k}`,
      asset: 'long-table',
      x,
      z,
      noLabel: r + k > 0,
      labelAt: [x - 1.2, 1.3, z + 0.9] as [number, number, number],
    })),
  ),
  // 坐着吃饭的人：北边长凳面朝镜头（看得到脸和手里的杯子），南边背对镜头；一排一两张有人，不坐满
  diner('d-0n1', -35.2, TABLE_ROWS[0], 'n', 0, 'sip', 0.5),
  diner('d-0n2', -34.2, TABLE_ROWS[0], 'n', 2, 'sit', 0.2),
  diner('d-0s1', -33.0, TABLE_ROWS[0], 's', 1, 'sit', 0.6),
  diner('d-0n3', -29.9, TABLE_ROWS[0], 'n', 3, 'clap', 0.1),
  diner('d-0n4', -28.9, TABLE_ROWS[0], 'n', 1, 'sit', 0.8),
  diner('d-1n1', -35.6, TABLE_ROWS[1], 'n', 2, 'sip', 0.48),
  diner('d-1s1', -34.6, TABLE_ROWS[1], 's', 0, 'sit', 0.4),
  diner('d-1s2', -33.6, TABLE_ROWS[1], 's', 3, 'sit', 0.9),
  diner('d-1n2', -28.0, TABLE_ROWS[1], 'n', 0, 'sit', 0.3),
  diner('d-1n3', -27.1, TABLE_ROWS[1], 'n', 2, 'sip', 0.55),
  diner('d-2n1', -33.4, TABLE_ROWS[2], 'n', 1, 'sit', 0.1),
  diner('d-2s1', -30.0, TABLE_ROWS[2], 's', 2, 'sit', 0.7),
  diner('d-2s2', -29.0, TABLE_ROWS[2], 's', 0, 'sip', 0.45),
  // 桌上的托盘（塔可、披萨、薯条、杯子；没人的位置剩一只脏托盘 = 总监要收的）
  ...(
    [
      [-35.2, TABLE_ROWS[0], 1],
      [-33.6, TABLE_ROWS[0], 0],
      [-29.4, TABLE_ROWS[0], 2],
      [-35.0, TABLE_ROWS[1], 0],
      [-31.8, TABLE_ROWS[1], 3],
      [-27.6, TABLE_ROWS[1], 1],
      [-33.4, TABLE_ROWS[2], 2],
      [-29.5, TABLE_ROWS[2], 0],
      [-27.4, TABLE_ROWS[2], 3],
    ] as [number, number, number][]
  ).map(([x, z, v], i) => ({
    id: `tray-${i}`,
    asset: 'food-tray',
    x,
    z,
    y: TABLE.h,
    variant: v,
    noLabel: i !== 4,
    label: '脏托盘（总监收）',
  })),
  // ── 端着托盘走回座位的人（从窗口到凉棚）──────────────────────────
  {
    id: 'walk-tray-1',
    asset: 'player',
    x: -29.9,
    z: -34.6,
    rotY: 2.7,
    variant: 3,
    pose: ['walk', 0.2],
    prop: null,
    label: '端托盘',
  },
  { id: 'walk-tray-1t', asset: 'food-tray', ...lead(-29.9, -34.6, 2.7), y: 1.02, variant: 1, noLabel: true },
  {
    id: 'walk-tray-2',
    asset: 'player',
    x: -36.3,
    z: -35.2,
    rotY: 2.4,
    variant: 0,
    pose: ['walk', 0.65],
    prop: null,
    noLabel: true,
  },
  { id: 'walk-tray-2t', asset: 'food-tray', ...lead(-36.3, -35.2, 2.4), y: 1.02, variant: 2, noLabel: true },
  // ── 回收台 + 回收站（球员通道北沿，凉棚西南角外）+ 总监倒垃圾 ─────────
  {
    id: 'tray-return',
    asset: 'tray-return',
    x: SPOTS.trayReturn[0] + 0.4,
    z: SPOTS.trayReturn[1] - 0.6,
    rotY: E - 0.2,
  },
  { id: 'bin-station', asset: 'bin-station', x: -37.0, z: -22.85, labelAt: [-36.4, 1.7, -22.2] },
  {
    id: 'director',
    asset: 'director',
    x: SPOTS.bins[0],
    z: SPOTS.bins[1],
    rotY: face(SPOTS.bins, [-37.6, -22.9]),
    pose: ['pickup', 0.45],
    prop: null,
    label: '总监（倒垃圾）',
  },
  { id: 'trash-bag', asset: 'trash-bag', x: -39.5, z: -21.5, rotY: 0.6, labelAt: [-39.9, 0.9, -20.8] },
  // 补货堆 + 手推车（会所东翼东墙下，厨房后门旁）
  { id: 'supply', asset: 'supply-stack', x: SPOTS.supply[0] + 0.2, z: SPOTS.supply[1] - 0.3, variant: 0 },
  { id: 'hand-truck', asset: 'hand-truck', x: -38.6, z: -33.6, rotY: 0.4, labelBelow: true },
  // ── 球员通道：两个球员从会所走出来去中心球场（往东）──────────────────
  {
    id: 'player-out-1',
    asset: 'player',
    x: -33.4,
    z: -20.6,
    rotY: E,
    variant: 1,
    pose: ['walk', 0.1],
    prop: 'racket',
    label: '球员出场 →',
  },
  {
    id: 'player-out-2',
    asset: 'coach',
    x: -35.0,
    z: -21.5,
    rotY: E,
    pose: ['walk', 0.55],
    prop: 'racket',
    noLabel: true,
  },
  // ── 野餐桌 + 伞（南边一排）；东边那张没人，剩一盘薯条 → 两只拟八哥在偷 ─────
  ...PICNIC_XS.map((x, i) => ({
    id: `picnic-${i}`,
    asset: 'picnic-table',
    x,
    z: PICNIC_Z,
    noLabel: i !== 1,
    labelBelow: true,
  })),
  {
    id: 'umbrella-0',
    asset: 'patio-umbrella',
    x: PICNIC_XS[0],
    z: PICNIC_Z,
    variant: 0,
    labelAt: [PICNIC_XS[0], 2.8, PICNIC_Z],
  },
  { id: 'umbrella-1', asset: 'patio-umbrella', x: PICNIC_XS[1], z: PICNIC_Z, variant: 1, noLabel: true },
  // 收起来的伞（东边那张：鸟在亮处才看得见）
  { id: 'umbrella-2', asset: 'patio-umbrella', x: PICNIC_XS[2], z: PICNIC_Z, variant: 2, noLabel: true },
  // 一家人吃饭（野餐桌 0）：家长 + 两个孩子
  {
    id: 'fam-1',
    asset: 'player',
    x: -35.5,
    z: PICNIC_Z + 0.62,
    rotY: N,
    variant: 3,
    seat: [0.47],
    pose: ['sit', 0.3],
    prop: null,
    noLabel: true,
  },
  {
    id: 'fam-kid1',
    asset: 'kid',
    x: -34.5,
    z: PICNIC_Z + 0.62,
    rotY: N,
    variant: 1,
    seat: [0.47],
    pose: ['sit', 0.6],
    prop: null,
    label: '一家人吃饭',
    labelBelow: true,
  },
  {
    id: 'fam-kid2',
    asset: 'kid',
    x: -35.0,
    z: PICNIC_Z - 0.62,
    rotY: 0,
    variant: 2,
    seat: [0.47],
    pose: ['sip', 0.5],
    prop: 'cup',
    noLabel: true,
  },
  { id: 'fam-tray', asset: 'food-tray', x: -35.0, z: PICNIC_Z, y: 0.74, variant: 0, noLabel: true },
  // 野餐桌 1：一对会员
  {
    id: 'pic-1a',
    asset: 'player',
    x: -31.4,
    z: PICNIC_Z + 0.62,
    rotY: N,
    variant: 0,
    seat: [0.47],
    pose: ['sit', 0.5],
    prop: null,
    noLabel: true,
  },
  {
    id: 'pic-1b',
    asset: 'player',
    x: -30.6,
    z: PICNIC_Z - 0.62,
    rotY: 0,
    variant: 1,
    seat: [0.47],
    pose: ['sip', 0.5],
    prop: 'cup',
    noLabel: true,
  },
  // 野餐桌 2：没人；桌上一盘薯条，两只鸟在偷，一只叼着薯条飞走
  { id: 'fries', asset: 'food-tray', x: -27.1, z: PICNIC_Z + 0.1, y: 0.74, variant: 3, noLabel: true },
  {
    id: 'birds-fries',
    asset: 'grackles',
    x: -26.8,
    z: PICNIC_Z - 0.05,
    y: 0.74,
    rotY: 0.3,
    label: '拟八哥偷薯条（复用）',
  },
  { id: 'bird-fly', asset: 'grackle', x: -25.2, z: -18.4, y: 2.4, rotY: 1.9, variant: 2, noLabel: true },
  {
    id: 'bird-bin',
    asset: 'grackle',
    x: SPOTS.birdBin[0],
    z: SPOTS.birdBin[1],
    y: 1.08,
    rotY: -0.5,
    variant: 0,
    noLabel: true,
  },
  // ── 孩子的草皮角：沙包投洞（两块板，东西对着）+ 大号叠叠乐；三个孩子、一个家长 ──
  {
    id: 'lawn-games',
    asset: 'lawn-games',
    x: (LAWN_GAMES.x0 + LAWN_GAMES.x1) / 2,
    z: (LAWN_GAMES.z0 + LAWN_GAMES.z1) / 2,
    labelAt: [-30.2, 1.6, -12.4],
  },
  {
    id: 'kid-throw',
    asset: 'kid',
    x: -35.0,
    z: -11.4,
    rotY: E,
    variant: 0,
    pose: ['serve', 0.55],
    prop: null,
    label: '孩子扔沙包',
    labelBelow: true,
  },
  {
    id: 'kid-wait',
    asset: 'kid',
    x: -35.6,
    z: -12.6,
    rotY: E + 0.3,
    variant: 1,
    pose: ['idle', 0.4],
    prop: null,
    noLabel: true,
  },
  {
    id: 'kid-jenga',
    asset: 'kid',
    x: -29.1,
    z: -11.2,
    rotY: N + 0.4,
    variant: 2,
    pose: ['pickup', 0.3],
    prop: null,
    noLabel: true,
  },
  {
    id: 'parent-lawn',
    asset: 'player',
    x: -33.3,
    z: -10.2,
    rotY: N - 0.3,
    variant: 1,
    pose: ['idle', 0.6],
    prop: 'cup',
    noLabel: true,
  },
  // ── 西南：珍珠奶茶三轮摩托（长廊路过的人顺手买）；东南：吉事果车 ─────────
  { id: 'tuktuk-boba', asset: 'tuktuk-boba', x: BOBA[0], z: BOBA[1], rotY: BOBA_ROT },
  {
    id: 'vendor-boba',
    asset: 'player',
    x: local(BOBA, BOBA_ROT, 0.72, -0.95)[0],
    z: local(BOBA, BOBA_ROT, 0.72, -0.95)[1],
    rotY: BOBA_ROT,
    variant: 2,
    pose: ['idle', 0.8],
    prop: null,
    noLabel: true,
  },
  queuer('q-boba', ...local(BOBA, BOBA_ROT, -0.08, 1.47), 3, 0.4, { rotY: BOBA_ROT + N, prop: 'racket' }),
  { id: 'cart-churros', asset: 'cart-churros', x: CHURRO[0], z: CHURRO[1], rotY: CHURRO_ROT },
  {
    id: 'vendor-churro',
    asset: 'player',
    x: local(CHURRO, CHURRO_ROT, 0.2, -0.85)[0],
    z: local(CHURRO, CHURRO_ROT, 0.2, -0.85)[1],
    rotY: CHURRO_ROT,
    variant: 3,
    pose: ['idle', 0.1],
    prop: null,
    noLabel: true,
  },
  queuer('q-churro', ...local(CHURRO, CHURRO_ROT, -0.2, 1.2), 2, 0.7, { rotY: CHURRO_ROT + N }),
  // ── 长廊：路过的会员 ───────────────────────────────────────────
  {
    id: 'prom-1',
    asset: 'player',
    x: -30.0,
    z: -6.8,
    rotY: W,
    variant: 2,
    pose: ['walk', 0.4],
    prop: 'racket',
    noLabel: true,
  },
  {
    id: 'prom-2',
    asset: 'player',
    x: -36.4,
    z: -8.2,
    rotY: N + 0.2,
    variant: 3,
    pose: ['walk', 0.8],
    prop: null,
    label: '从长廊进来',
    labelBelow: true,
  },
  // ── 花盆（clubdesk 的陶罐 + 龙舌兰）：院子的几个角，给边界一点绿 ──────────
  ...(
    [
      [-39.4, -18.6],
      [-36.9, -19.0],
      [-25.4, -19.0],
      [-37.6, -9.8],
      [-27.4, -9.8],
    ] as V2[]
  ).flatMap(([x, z], i) => [
    { id: `pot-${i}`, asset: 'pot', x, z, noLabel: i > 0, label: '花盆（clubdesk 的陶罐）' },
    { id: `pot-agave-${i}`, asset: 'agave', x, z, y: 0.85, s: 0.55, noLabel: true },
  ]),
  // 自助水站（clubdesk 的）：凉棚东南角外，球员通道边
  { id: 'water-station', asset: 'water-station', x: -25.6, z: -23.6, rotY: W, label: '自助水站（clubdesk）' },
  // ── 北墙外：一排蒲葵（树干和影子；叶冠在竖屏上沿外）──────────────────
  { id: 'palm-out-1', asset: 'fan-palm', x: -38.5, z: -46.6, variant: 1, s: 1.1, noLabel: true },
  { id: 'palm-out-2', asset: 'fan-palm', x: -29.5, z: -47.6, variant: 0, s: 1.2, noLabel: true },
  { id: 'palm-out-3', asset: 'fan-palm', x: -21.0, z: -46.4, variant: 2, s: 1.05, noLabel: true },
  { id: 'palm-out-4', asset: 'fan-palm', x: -52.0, z: -46.8, variant: 2, s: 1.0, noLabel: true },
  // 会所南边、泳池北边（横屏左下）：两棵蒲葵、几丛灌木
  { id: 'palm-pool-1', asset: 'fan-palm', x: -58.6, z: -6.6, variant: 0, s: 1.0, noLabel: true },
  { id: 'palm-pool-2', asset: 'fan-palm', x: -41.4, z: -2.6, variant: 1, s: 0.95, noLabel: true },
  { id: 'brittle-sw', asset: 'brittlebush', x: -47.6, z: -11.6, variant: 0, noLabel: true },
  { id: 'agave-sw', asset: 'agave', x: -44.2, z: -11.2, s: 0.9, noLabel: true },
  { id: 'creosote-n', asset: 'creosote', x: -44.0, z: -41.6, variant: 1, noLabel: true },
  // 横屏右边：中心球场西头（邻居）的球员 + 观众路上一个人
  {
    id: 'stadium-walker',
    asset: 'player',
    x: -20.6,
    z: -27.4,
    rotY: N,
    variant: 0,
    pose: ['walk', 0.3],
    prop: null,
    noLabel: true,
  },
];

/** 走在前面的手：人站在 (x, z) 朝 rotY，托盘在身前 0.38 米 */
function lead(x: number, z: number, rotY: number): { x: number; z: number; rotY: number } {
  return { x: x + Math.sin(rotY) * 0.38, z: z + Math.cos(rotY) * 0.38, rotY };
}

/** 区域标签（白模评审用，?labels=0 不显示）：文字、位置 (x, y, z)；kind area = 区域名，propose = 共享坐标的建议 */
export const AREA_LABELS: { text: string; x: number; y: number; z: number; kind?: 'area' | 'propose' }[] = [
  { text: '会所（钟楼、拱廊）', x: -54, y: 13, z: -26 },
  { text: '北围墙 z −43', x: -46, y: 2.6, z: -43 },
  { text: '排队区（安静）', x: -39.0, y: 0.3, z: -34.6 },
  { text: '球员通道（石板）', x: -44.0, y: 0.3, z: -21.0 },
  { text: '长廊', x: -22, y: 0.3, z: -6.4 },
  { text: '泳池（邻居）', x: -50, y: 0.6, z: 2 },
  { text: '中心球场西头（clubstadium）', x: -12, y: 1.4, z: -21 },
  { text: '建议：露台扩成餐车院子 x −40…−21.4、z −42.4…−9.4', x: -31, y: 0.6, z: -45.2, kind: 'propose' },
  { text: '建议：拱廊前小院归餐厅', x: -43, y: 0.6, z: -11.0, kind: 'propose' },
];

/**
 * 云影（手摆，硬边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘。toon.ts 按 x ∈ [−48, 48) 绕回来。
 * 只走两条带：北墙外的沙漠（z −46…−48）和长廊 / 青训场（z −3…−6）—— 永远不上餐车和凉棚（z −42…−10）。
 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(-34), -46.8, 4.4, 1.5],
  [wrapX(-30.5), -47.6, 2.6, 1.1],
  [wrapX(10), -46.4, 4.0, 1.5],
  [wrapX(-26), -3.4, 4.2, 1.5],
  [wrapX(-22.5), -2.6, 2.4, 1.1],
  [wrapX(-60), -4.2, 4.4, 1.6],
];
export const CLOUD_VEL = 0.12;
