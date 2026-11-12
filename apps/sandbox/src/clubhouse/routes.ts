// 站位（SPOTS）和路线（ROUTES）：玩法以后用；白模里标签开着时画成洋红小圆盘 + 小点（nav.ts 的 buildNav）。
// 点是 [x, z] 或 [x, z, y]（y 不给 = 一层的地面 0；楼上 / 地下的点写 y = FLOOR_Y 或坡道上的高度）。
// 第二版（2026-11-11，/tmp/clubhouse-plans/final2.md）：1F 只有商店、2F 会员 + 后厨、B1 一整层健身房 + 后场；货梯在东翼（后门边上）。
// nav.test.ts 守着：每个站位在它那一层能站，每条路线的每一段直线走得通（不穿墙、不穿家具；上下楼的段沿着梯段，高度线性插值；
// 坐电梯 / 货梯 = 同一个 x、z 换个 y 的一段，只能在 LIFT.door / GOODS_LIFT.door）。
import { DOORS, FLOOR_Y, GOODS_LIFT, LIFT, type V2 } from './layout';

export type P3 = readonly [number, number] | readonly [number, number, number];
export interface Spot {
  at: P3;
  /** 标签（不给 = 不贴字） */
  name?: string;
}

const Y2 = FLOOR_Y[2];
const YB = FLOOR_Y[-1];
/** 楼梯芯里的几个点（layout.ts 的 FLIGHTS）：西跑（up1 / down2）、东跑（up2 / down1）的中线，平台中线，梯段两头的 z */
const ST = { w: -53.1, e: -51.3, land: -28.4, foot: -24, top: -27, mouth: -23.2 } as const;
const at2 = (x: number, z: number): P3 => [x, z, Y2];
const atB = (x: number, z: number): P3 => [x, z, YB];
const [LX, LZ] = LIFT.door;
const [GX, GZ] = GOODS_LIFT.door;

/** 站位：每间房干活的点（店员 / 员工 / 总监站哪），三层。柜台的店员站在柜台北边、脸朝南 */
export const SPOTS: Record<string, Spot> = {
  // ── 外门（门外 / 门里）──
  doorOut: { at: DOORS.main.out },
  doorIn: { at: DOORS.main.in },
  southOut: { at: DOORS.south.out },
  southIn: { at: DOORS.south.in },
  kioskOut: { at: DOORS.kitchen.out },
  kioskIn: { at: DOORS.kitchen.in },
  backIn: { at: DOORS.kitchenBack.in },

  // ── 1F 商店层（y 0）── 店员的点 = slots-1f.ts 里店员站的地方
  proShopTill: { at: [-58.65, -27.15], name: '专卖店收银' },
  proShopWall: { at: [-59.8, -37.6] },
  stringer: { at: [-55.3, -26.35], name: '穿线台' },
  stringWindow: { at: [-55.2, -23.0] },
  trialLane: { at: [-55.8, -36.6] },
  barista: { at: [-47.6, -26.75], name: '咖啡吧台' },
  cafeCounter: { at: [-48.2, -24.6] },
  takeawayOut: { at: [-45.2, -25.5] },
  cafeTables: { at: [-50.0, -35.0] },
  merchTill: { at: [-57.2, -16.7], name: '纪念品店' },
  nutritionBar: { at: [-54.3, -15.3], name: '营养吧台' },
  nutritionWindow: { at: [-54.3, -11.9] },
  kioskTill: { at: [-44.85, -29.5], name: '便利店' },
  kioskWindow: { at: [-44.9, -26.1] },
  goodsDrop: { at: [-42.6, -36.4] },
  goods1: { at: [GX, GZ], name: '货梯' },
  lift1: { at: [LX, LZ], name: '电梯' },
  stairMouth: { at: [-52.2, ST.mouth] },
  loggia: { at: [-58.0, -11.6] },

  // ── 楼梯平台（landUp 在 1F、2F 的导航里；landDown 只在 B1）──
  landUp: { at: [-52.2, ST.land, 2] },
  landDown: { at: [-52.2, ST.land, -2] },

  // ── 2F 会员层（y 4）──
  bartender: { at: at2(-49.3, -28.6), name: '酒吧' },
  barFront: { at: at2(-48.2, -25.6) },
  fireplace: { at: at2(-58.0, -28.4), name: '壁炉' },
  lounge: { at: at2(-58.0, -23.6) },
  office: { at: at2(-58.0, -37.8), name: '总监办公室' },
  boardroom: { at: at2(-58.0, -31.0) },
  banquet: { at: at2(-50.0, -37.0), name: '宴会厅' },
  cook: { at: at2(-42.5, -36.7), name: '后厨' },
  kitchenPass: { at: at2(-44.8, -33.0) },
  wcUp: { at: at2(-43.0, -28.5) },
  bellRope: { at: at2(-49.2, -17.2), name: '钟绳' },
  lift2: { at: at2(LX, LZ) },
  goods2: { at: at2(GX, GZ) },
  terrace: { at: at2(-57.2, -15.0), name: '露台' },
  terraceCorner: { at: at2(-48.1, -13.0) },

  // ── B1 健身房（y −4）── 员工的点 = slots-b1.ts 里员工站的地方
  gymDesk: { at: atB(-51.8, -21.95), name: '健身前台' },
  gymDeskFront: { at: atB(-51.8, -20.2) },
  stairFootB1: { at: atB(ST.w, -23.0) },
  coach: { at: atB(-56.6, -31.0), name: '团课教练台' },
  physio: { at: atB(-55.8, -20.6), name: '理疗' },
  weights: { at: atB(-58.6, -37.6), name: '自由重量' },
  machines: { at: atB(-50.4, -37.6) },
  turfLane: { at: atB(-61.0, -26.0), name: '功能草道' },
  boxing: { at: atB(-56.6, -13.6) },
  lockerM: { at: atB(-50.7, -13.8) },
  lockerW: { at: atB(-46.8, -14.0) },
  cardio: { at: atB(-49.6, -8.0) },
  laundry: { at: atB(-41.6, -39.6), name: '洗衣房' },
  breaker: { at: atB(-44.8, -34.0), name: '配电箱' },
  boiler: { at: atB(-42.5, -34.3) },
  store: { at: atB(-43.0, -29.4), name: '储藏' },
  liftB1: { at: atB(LX, LZ) },
  goodsB1: { at: atB(GX, GZ) },
};

/**
 * 路线（NPC 的循环；点之间按直线连）。上下楼的段两头落在梯段的两头（高度线性插值 = 梯段的高度）；
 * 坐电梯 / 货梯 = 同一个 x、z 上换个 y 的一段（只在 LIFT.door / GOODS_LIFT.door，不画点）。
 */
export const ROUTES: { id: string; pts: P3[] }[] = [
  // 逛街：正门 → 咖啡吧台前 → 穿线窗口 → 专卖店 → 纪念品店 → 运动营养 → 正门（便利店有自己朝小院的门，不走商店街）
  {
    id: 'shopper',
    pts: [
      [-44.9, -21.0],
      [-47.3, -21.0],
      [-48.2, -22.4],
      [-48.2, -24.6],
      [-48.2, -22.4],
      [-55.2, -23.0],
      [-60.6, -22.6],
      [-60.6, -25.4],
      [-60.6, -22.6],
      [-59.0, -21.2],
      [-59.0, -18.2],
      [-59.0, -21.2],
      [-53.0, -21.2],
      [-53.0, -18.2],
      [-53.0, -21.4],
      [-47.3, -21.0],
      [-44.9, -21.0],
    ],
  },
  // 会员上楼：正门 → 楼梯口 → 西跑 up1 → 平台 → 东跑 up2 → 吧台前 → 落地门 → 露台
  {
    id: 'memberUp',
    pts: [
      [-44.9, -21.0],
      [-47.3, -21.0],
      [-52.2, -21.6],
      [ST.w, ST.mouth],
      [ST.w, ST.foot, 0],
      [ST.w, ST.top, 2],
      [ST.w, ST.land, 2],
      [ST.e, ST.land, 2],
      [ST.e, ST.top, 2],
      [ST.e, ST.foot, Y2],
      [ST.e, -23.4, Y2],
      [-50.0, -23.4, Y2],
      [-48.2, -25.6, Y2],
      [-50.0, -23.4, Y2],
      [-52.0, -21.0, Y2],
      [-52.0, -17.0, Y2],
      [-57.2, -15.0, Y2],
    ],
  },
  // 去健身：正门 → 楼梯口东半 → 东跑 down1 → 平台 −2 → 西跑 down2 → 前台 → 男更衣 → 前台大厅西头 → 功能草道
  {
    id: 'gymGoer',
    pts: [
      [-44.9, -21.0],
      [-47.3, -21.0],
      [-51.3, -21.6],
      [ST.e, ST.mouth],
      [ST.e, ST.foot, 0],
      [ST.e, ST.top, -2],
      [ST.e, ST.land, -2],
      [ST.w, ST.land, -2],
      [ST.w, ST.top, -2],
      [ST.w, ST.foot, YB],
      [ST.w, -23.0, YB],
      [-54.0, -21.8, YB],
      [-54.0, -20.2, YB],
      [-51.8, -20.2, YB],
      [-52.4, -18.0, YB],
      [-52.4, -16.0, YB],
      [-50.7, -16.0, YB],
      [-50.7, -13.8, YB],
      [-50.7, -16.0, YB],
      [-52.4, -16.0, YB],
      [-52.4, -18.0, YB],
      [-54.0, -20.2, YB],
      [-54.0, -22.4, YB],
      [-61.0, -22.4, YB],
      [-61.0, -26.0, YB],
    ],
  },
  // 泳池的客人：商店街 → 钟楼门厅（北门 → 南门）→ 拱廊 → 运动营养的柜台窗 → 拱廊的拱 → clubpool 的石板小路 → 泳池北门
  {
    id: 'poolGuest',
    pts: [
      [-47.3, -21.0],
      [-47.4, -20.4],
      [-47.4, -17.6],
      [-47.6, -14.3],
      [-49.2, -11.9],
      [-54.3, -11.9],
      [-50.14, -11.4],
      [-50.14, -9.6],
      [-48.5, -8.4],
      [-47.6, -6.0],
      [-47.6, -2.2],
    ],
  },
  // 送货（后门外是 clubfood 的地，路线从门里起）：后门 → 货梯厅 → 货梯（1F → 2F 后厨）→ 灶台前 → 货梯（2F → 1F）→ 后门
  {
    id: 'delivery',
    pts: [
      [-41.0, -35.6],
      [GX, GZ],
      [GX, GZ, Y2],
      [-42.5, -36.7, Y2],
      [GX, GZ, Y2],
      [GX, GZ],
      [-41.0, -35.6],
    ],
  },
  // 布草：女更衣的脏毛巾 → 电梯门口前 → 前台大厅东边 → 储藏 → 机房 → 洗衣房（货梯边上、叠毛巾台）
  {
    id: 'linen',
    pts: [
      [-46.8, -14.0, YB],
      [-46.9, -16.0, YB],
      [-46.9, -17.6, YB],
      [-47.3, -19.8, YB],
      [-48.0, -22.6, YB],
      [-48.0, -29.0, YB],
      [-43.0, -29.0, YB],
      [-43.0, -36.0, YB],
      [-43.0, -39.6, YB],
      [-41.6, -39.6, YB],
    ],
  },
  // 上菜：后厨灶台 → 后厨的门 → 宴会厅（舞台和桌子之间）→ 宴会厅的门 → 酒吧的吧台后面
  {
    id: 'service',
    pts: [
      [-42.5, -36.7, Y2],
      [-44.4, -36.6, Y2],
      [-44.4, -33.0, Y2],
      [-46.8, -33.0, Y2],
      [-46.8, -37.0, Y2],
      [-50.0, -37.0, Y2],
      [-46.8, -37.0, Y2],
      [-46.8, -33.0, Y2],
      [-47.4, -29.0, Y2],
      [-49.3, -28.6, Y2],
    ],
  },
  // 便利店补货：后门里 → 货梯厅 → 补货门 → 便利店柜台后面
  {
    id: 'kioskRestock',
    pts: [
      [-41.0, -35.6],
      [-41.6, -34.2],
      [-41.6, -30.2],
      [-44.85, -30.2],
      [-44.85, -29.5],
    ],
  },
];

export type { V2 };
