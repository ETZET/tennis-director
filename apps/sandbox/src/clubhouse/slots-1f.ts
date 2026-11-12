// 1F 的摆件（家具占位 + 里面的人）。level 都是 1；房间的范围、门、楼梯见 layout.ts 的 ROOMS / WALLS / FLIGHTS / LIFT / GOODS_LIFT。
// 一层是商店层（/tmp/clubhouse-plans/final2.md）：每间店一张朝镜头的柜台（店员站在柜台北边、脸朝南），主角货架靠北墙，1～2 件立着的展台，
// 一个信号道具。"大、少、透气"：竖屏一帧（x −62.8…−45.2）≤ 35 件占位、≤ 10 个人（含 slots-ext.ts 的拱廊两人、总监、泳池边的人）。
// 墙面（里面）：北外墙 z −39.5、西外墙 x −61.5、东立面 x −46.5（咖啡吧前段、商店街）、咖啡吧 | 东翼 x −46.11、东翼东墙 x −40.5、
// 东翼南墙 z −27.5、钟楼南墙 z −16.1；隔墙中线 ±0.11。朝镜头的切墙（z −24、−19.6、−13、−27.25、−30、−33、−15.85）南边 1.2 米内不放要看的东西。
// 留空：门里门外 0.9 米、过道 ≥ 1 米、楼梯芯 x −54…−50.4 z −30…−22.6、电梯门口 (−47.6, −18.6) 和钟楼门厅里 x −48.25…−46.25 那条路、
// 货梯井 + 门口 (−44.8, −37.3)、正门里 (−47.3, −21)。
import { FACE, person, type Slot } from './slot';

const IN = { mode: 'in' } as const;
/** 一个占位（只在 1F 剖面） */
const ph = (id: string, asset: string, x: number, z: number, extra: Partial<Slot> = {}): Slot => ({
  id,
  asset,
  x,
  z,
  ...IN,
  ...extra,
});
/** 一个人（只在 1F 剖面）；label 给了就贴字（店员、穿线师、咖啡师……） */
const who = (
  id: string,
  x: number,
  z: number,
  rotY: number,
  v: number,
  pose: string,
  phase: number,
  extra: Partial<Slot> = {},
): Slot => person(id, x, z, rotY, v, pose, phase, { ...IN, ...(extra.label ? { noLabel: false } : {}), ...extra });
/** 贴在货架 / 冷柜正面的信号（不挡路） */
const sig = { noBlock: true } as const;

export const SLOTS_1F: Slot[] = [
  // ═════ 专卖店（x −62…−57.5、z −40…−24；店面 z −24：宽拱 x −60.6、橱窗 x −58.4）═════
  // 北墙拍子墙（缩到 3.6 宽）+ 空挂钩（信号：拍子卖空了）；球鞋墙立在中间朝南；两架衣服错开；收银台在店面后面（信号：排队）
  ph('shop-racket-wall', 'racket-wall', -59.55, -39.32, { s: 0.9 }),
  ph('shop-empty-hooks', 'shop-empty-hooks', -58.6, -39.1, { y: 1.15, ...sig, labelAt: [-58.6, 2.5, -38.4] }),
  ph('shop-shoe-wall', 'shop-shoe-wall', -60.25, -34.6),
  ph('shop-rack-1', 'clothes-rack', -60.6, -31.0),
  ph('shop-rack-2', 'clothes-rack', -58.55, -32.8, { noLabel: true }),
  // 店员站在 routes.ts 的 proShopTill（−60.2, −28.0）
  ph('shop-till', 'shop-counter', -60.2, -27.25),
  who('shop-clerk', -60.2, -28.0, FACE.S, 2, 'idle', 0.1, { label: '店员' }),
  who('shop-queue', -60.1, -26.3, FACE.N, 0, 'idle', 0.6, { prop: 'racket' }),

  // ═════ 穿线 · 试拍吧（x −57.5…−54、z −40…−24；店面 z −24：门 x −56.9、递拍子柜台窗 x −55.2）═════
  // 柜台在窗后面（穿线师脸朝街）；穿线机在他背后；送穿架（信号：挂满）；后面一条试挥垫 + 北墙试拍墙
  ph('shop-string-counter', 'shop-string-counter', -55.3, -25.6),
  who('shop-stringer', -55.4, -26.4, FACE.S, 3, 'idle', 0.7, { asset: 'coach', label: '穿线师' }),
  ph('shop-stringing-machine', 'stringing-machine', -55.2, -27.6),
  ph('shop-dropoff-rack', 'shop-dropoff-rack', -54.8, -29.6),
  ph('shop-swing-mat', 'shop-swing-mat', -55.75, -34.6, { y: 0.02, noBlock: true }),
  ph('shop-demo-wall', 'shop-demo-wall', -55.75, -39.3),

  // ═════ 咖啡吧（L 形：前段 x −50.4…−46、z −30…−24 朝商店街开宽拱 x −48.2，东立面外卖窗 z −25.5；后段 x −54…−46、z −40…−30 座位）═════
  // 吧台在宽拱后面（东头挨着外卖窗）+ 台面上的糕点柜，咖啡师站在 barista（−48.2, −27.2）；后段两张小圆桌，一张上是脏杯子（信号）。
  // 后吧（#16）不摆：一排小格子在这个角上强边缘太多，咖啡机算进吧台
  ph('shop-cafe-counter', 'shop-cafe-counter', -47.95, -25.75),
  ph('shop-pastry-case', 'shop-pastry-case', -48.65, -25.7, { y: 1.1, noBlock: true }),
  who('shop-barista', -48.2, -27.2, FACE.S, 1, 'idle', 0.2, { label: '咖啡师' }),
  ph('shop-cafe-table-1', 'cafe-table', -52.3, -37.4),
  ph('shop-cafe-table-2', 'cafe-table', -48.9, -37.0, { noLabel: true }),
  ph('shop-dirty-cups', 'shop-dirty-cups', -48.9, -37.0, { y: 0.75, noBlock: true }),

  // ═════ 纪念品店（x −62…−56、z −19.6…−13；北门 x −59 → 商店街；南店面朝拱廊：橱窗 x −60.4、门 x −57.4）═════
  // 北墙门两边两架纪念品，东边那架有一格卖空了（信号）；展示桌；收银台；橱窗展台朝拱廊
  ph('shop-merch-1', 'shop-merch-shelves', -60.55, -19.26),
  ph('shop-merch-2', 'shop-merch-shelves', -57.15, -19.26, { noLabel: true }),
  ph('shop-soldout', 'shop-soldout-gap', -57.5, -19.01, { y: 0.75, ...sig, labelAt: [-57.0, 2.5, -18.4] }),
  // 店员站在 merchTill（−58.6, −17.0）；东边留一条 1.5 米的路（北门 → 南门）
  ph('shop-display-table', 'shop-display-table', -60.65, -16.6),
  ph('merch-till', 'shop-counter', -58.6, -16.25, { noLabel: true }),
  who('merch-clerk', -58.6, -17.0, FACE.S, 3, 'idle', 0.4, { label: '店员' }),
  ph('merch-window', 'window-display', -60.4, -14.55),

  // ═════ 运动营养 · 饮品（x −56…−50、z −19.6…−13；北门 x −53 → 商店街；南：柜台窗 x −54.3（台面 0.95）+ 门 x −51.2 → 拱廊）═════
  // 北墙冷柜墙（门西边）空了一排（信号）；奶昔吧台就是柜台窗的台面（拱廊里的泳客隔窗买，台子大半被切墙挡住，
  // 饮品师站在 nutritionBar（−54.3, −14.4）看得见）；补剂架立着
  ph('shop-fridge-wall', 'shop-fridge-wall', -54.8, -19.14),
  ph('shop-empty-row', 'shop-empty-row', -54.8, -18.77, { y: 0.55, ...sig, labelAt: [-54.8, 2.6, -18.3] }),
  ph('shop-smoothie-bar', 'shop-smoothie-bar', -54.3, -13.5, { labelAt: [-54.3, 1.6, -14.0] }),
  who('nutri-clerk', -54.3, -14.4, FACE.S, 0, 'idle', 0.8, { label: '饮品师' }),
  ph('nutri-shelves', 'shop-snack-shelves', -51.3, -16.9, { s: 0.8, label: '#61 补剂架' }),

  // ═════ 便利店（东翼 x −46…−40、z −33…−27；南墙：外卖窗 x −44.9、门 x −43 → 拱廊前小院、橱窗 x −41.3；北补货门 x −41.6）═════
  // 收银台就在外卖窗里面（朝小院），店员站在 kioskTill（−44.9, −28.6）；北墙饮料冷柜；橱窗后面一架零食（空了一格 = 信号）。
  // 补货路线（补货门 → 柜台）斜穿中间，那一条空着
  ph('kiosk-till', 'shop-counter', -44.85, -27.8, { noLabel: true }),
  who('kiosk-clerk', -44.9, -28.6, FACE.S, 1, 'idle', 0.5, { label: '店员' }),
  ph('kiosk-fridge', 'shop-drinks-fridge', -44.9, -32.54),
  ph('kiosk-shelves', 'shop-snack-shelves', -41.55, -29.4, { label: '#61 零食架' }),
  ph('kiosk-empty', 'shop-empty-shelf', -41.2, -29.13, { y: 0.6, ...sig }),
  who('kiosk-buyer', -41.7, -30.4, FACE.N, 2, 'idle', 0.3, { look: [-41.55, 1.0, -29.4] }),

  // ═════ 商店街（x −62…−46、z −24…−19.6：南墙切开，看得见的是北边 3 米）═════
  // 西头公告板（立着）；专卖店橱窗前一张长椅（等拍子的，贴着北墙：穿线窗口前 (−55.2, −23.0) 是站着递拍子的地方）；正门里的沙脚印（信号）
  ph('shop-notice', 'notice-board', -60.8, -21.8, { y: 0.3, s: 0.8, label: '#34 公告板' }),
  { id: 'shop-bench', asset: 'bench', x: -58.4, z: -23.6, s: 0.8, ...IN, noLabel: true },
  ph('shop-sand-prints', 'shop-sand-prints', -47.2, -21.4, { y: 0.02, noBlock: true }),

  // ═════ 电梯门厅（x −50…−46、z −19.6…−15.6；电梯在西北角，北门 x −47.4 → 南门 x −47.6 走 x −48.25…−46.25）═════
  // 电梯南边泳池毛巾格；南门里的沙垫（信号：积沙）
  ph('shop-towel-shelf', 'shop-towel-shelf', -49.15, -16.95),
  ph('shop-sand-mat', 'shop-sand-mat', -47.25, -17.2, { y: 0.02, noBlock: true }),

  // ═════ 货梯厅（东翼北段 x −46…−40、z −40…−33；后门 (−40, −35.6)、咖啡吧员工门 (−46, −36)、货梯门口 (−44.8, −37.3)）═════
  // 送来的货箱堆在北墙（信号：堆起来 = 该搬下货梯了）+ 手推车，中间空着 goodsDrop（−41.6, −38.6）；后门北边一排垃圾桶；一个送货的
  ph('shop-box-stack', 'shop-box-stack', -43.0, -38.95),
  ph('shop-hand-truck', 'shop-hand-truck', -40.8, -39.0),
  ph('shop-trash-bins', 'shop-trash-bins', -41.25, -37.4),
  who('delivery', -42.6, -36.4, FACE.W, 3, 'idle', 0.3, { label: '送货的' }),

  // ═════ 店招（stage 2 加的）：每家店门外一块图标立牌（shop-sign，变体 = 店），正面朝南；离门中线 ≥ 0.9 米、不站在门洞前 ═════
  // 北排（商店街北墙的店面，墙面 z −23.89）：立在两个洞之间的墙垛前 z −23.45；商店街照样留 3.5 米宽
  ph('sign-pro', 'shop-sign', -59.3, -23.45, { variant: 0, label: '店招（图标）' }), // 专卖店：宽拱和橱窗之间（长椅西头）
  ph('sign-string', 'shop-sign', -54.2, -23.45, { variant: 1, noLabel: true }), // 穿线：递拍子窗东边、楼梯芯口西边
  ph('sign-cafe', 'shop-sign', -50.0, -23.45, { variant: 2, noLabel: true }), // 咖啡吧：宽拱西边的墙垛
  // 南排（朝拱廊的店面，墙面 z −12.89）：拱廊里 z −12.7；拱廊照样留 2.4 米
  { id: 'sign-merch', asset: 'shop-sign', x: -58.75, z: -12.7, variant: 3, noLabel: true }, // 纪念品店：橱窗和门之间
  { id: 'sign-nutri', asset: 'shop-sign', x: -52.45, z: -12.7, variant: 4, noLabel: true }, // 运动营养：柜台窗和门之间
  // 便利店：南墙外（拱廊前小院，墙面 z −27.0）东头、橱窗东边
  { id: 'sign-kiosk', asset: 'shop-sign', x: -40.3, z: -26.8, variant: 5, noLabel: true },
];
