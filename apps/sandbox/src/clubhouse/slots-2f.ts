// 2F 的摆件（家具占位 + 里面的人）。level 都是 2；房间的范围、门、楼梯见 layout.ts 的 ROOMS / WALLS / FLIGHTS / LIFT / GOODS_LIFT。
// 第二版（2026-11-11，"太小、太杂"之后）：大、少、透气。竖屏一帧（x −62.8…−45.2）33 件占位（+ 电梯 = 34）、7 个人；后厨、卫生间在画外。
// 里面的家具 mode 'in'；露台在屋顶上（外观也看得到），不给 mode。y 不给 = 二层地面（4）；搁在桌上 / 女儿墙上 / 挂墙的给 y。
// 净空：门洞里外 0.9 米；过道 ≥ 1.0 米；楼梯井（x −54…−50.4、z −30…−24）和 up2 上楼口（x −52.05…−50.55、z −24 往南 1 米）、
// 电梯门口 (−47.6, −18.6)、货梯井和门口 (−44.8, −37.3) 1 米内不放东西；朝镜头的切墙（z −19.6、−30）北边 1.2 米只放矮的或不放。
import { FLOOR_Y } from './layout';
import { FACE, person, type Slot } from './slot';

const F = FLOOR_Y[2];
const IN = { mode: 'in' as const };

/** 露台的三张小圆桌（晒得到太阳的南半）：前两张撑伞，第三张伞收着（活的信号） */
const TERRACE_TABLES: [number, number][] = [
  [-59.8, -12.8],
  [-55.8, -12.8],
  [-51.8, -12.8],
];

export const SLOTS_2F: Slot[] = [
  // ═════ 会员休息室（x −62…−54、z −30…−19.6）：北墙一排 = 奖杯柜 · 壁炉 · 电视；壁炉前地毯 + 茶几 + 两张对着的沙发 ═════
  // 南边三扇落地门（x −60 / −56.5 / −52）门里 0.9 米空着；办公室的门 (−55.2, −30) 往南一条 1.5 米的路去酒吧
  {
    id: '2f-trophy',
    asset: 'trophy-case',
    x: -60.3,
    z: -29.69,
    s: 0.8,
    label: '#25 奖杯柜（拿过的冠军）',
    labelBelow: true,
    ...IN,
  },
  { id: '2f-fireplace', asset: 'fireplace', x: -58.0, z: -29.49, label: '#10 壁炉（凉着 = 缺柴）', ...IN },
  { id: '2f-tv', asset: 'up-match-tv', x: -56.35, z: -29.83, y: F + 1.3, noBlock: true, labelBelow: true, ...IN },
  { id: '2f-rug', asset: 'rug', x: -58.0, z: -26.4, y: F + 0.02, labelBelow: true, ...IN },
  { id: '2f-coffee', asset: 'coffee-table', x: -58.0, z: -26.4, ...IN },
  { id: '2f-cups', asset: 'up-empty-cups', x: -57.75, z: -26.3, y: F + 0.42, noBlock: true, labelBelow: true, ...IN },
  { id: '2f-sofa-w', asset: 'sofa', x: -59.9, z: -26.4, rotY: FACE.E, ...IN },
  { id: '2f-sofa-e', asset: 'sofa', x: -56.1, z: -26.4, rotY: FACE.W, noLabel: true, ...IN },
  person('2f-lounge-a', -59.8, -25.9, FACE.E, 2, 'sit', 0.3, { seat: [0.45], ...IN }),
  person('2f-lounge-b', -56.2, -26.9, FACE.W, 0, 'sip', 0.6, { seat: [0.45], prop: 'cup', ...IN }),

  // ═════ 酒吧（barN x −50.4…−46、z −30…−24 + bar 的东段；和休息室一间，不砌墙）═════
  // 北墙：后吧（楼梯井和宴会厅门之间）；吧台东西向，酒保夹在中间面朝镜头；吧台东头到外墙 1.3 米 = 宴会厅 ↔ 酒吧的路
  { id: '2f-back-bar', asset: 'up-back-bar', x: -49.4, z: -29.64, ...IN },
  { id: '2f-bar', asset: 'up-bar-counter', x: -49.0, z: -27.6, ...IN },
  ...[-49.6, -48.6].map(
    (x, i): Slot => ({ id: `2f-stool-${i}`, asset: 'bar-stool', x, z: -26.85, noLabel: i > 0, ...IN }),
  ),
  person('2f-bartender', -49.3, -28.6, FACE.S, 1, 'idle', 0.2, { label: '酒保', noLabel: false, ...IN }),
  person('2f-bar-sit', -48.6, -26.8, FACE.N, 3, 'sip', 0.5, { seat: [0.74], prop: 'cup', ...IN }),
  // 拖把车停在酒吧东墙边（该在卫生间那头的清洁间）
  { id: '2f-mop-cart', asset: 'up-mop-cart', x: -46.85, z: -25.0, rotY: FACE.E, ...IN },
  // 南段：上楼口东边一张高脚桌（离 up2 的口 > 1 米，离钟楼门 (−47.4) 0.9 米外）
  { id: '2f-high-table', asset: 'up-high-table', x: -48.9, z: -22.4, ...IN },
  person('2f-bar-stand', -48.9, -23.05, FACE.S, 4, 'sip', 0.8, { prop: 'cup', ...IN }),

  // ═════ 总监办公室 · 董事会（x −62…−54、z −40…−30；门 (−55.2, −30)）═════
  // 北墙：监控墙（两扇窗之间，挂墙）、西北角保险柜；中间总监的桌（面朝南）+ 钱袋；前面（切墙北边 2 米）董事会长桌东西向
  { id: '2f-cctv', asset: 'up-cctv-wall', x: -58.0, z: -39.44, y: F + 0.9, noBlock: true, ...IN },
  { id: '2f-safe', asset: 'up-safe', x: -61.05, z: -39.1, ...IN },
  { id: '2f-desk', asset: 'desk', x: -58.0, z: -36.6, ...IN },
  { id: '2f-money', asset: 'up-money-bags', x: -57.45, z: -36.45, y: F + 0.76, noBlock: true, labelBelow: true, ...IN },
  { id: '2f-board-table', asset: 'up-board-table', x: -58.6, z: -32.7, ...IN },

  // ═════ 宴会厅（x −54…−46、z −40…−30；门 (−47.4, −30) 从酒吧进，后厨门 (−46, −33)）═════
  // 北墙下小台子；中间长桌一组；西南角叠着的椅子（活动前该摆）
  { id: '2f-stage', asset: 'up-stage', x: -50.0, z: -38.5, ...IN },
  { id: '2f-banquet', asset: 'up-banquet-tables', x: -50.0, z: -34.8, ...IN },
  { id: '2f-chairs', asset: 'up-chair-stacks', x: -52.6, z: -31.9, ...IN },

  // ═════ 后厨（东翼上面 x −46…−40、z −40…−30；竖屏画外）═════
  // 北墙：货梯井（x −45.6…−44）东边一排灶台 + 油烟罩；中间备餐台（厨师在北边面朝镜头）；宴会厅门边出菜架；东南角垃圾桶
  { id: '2f-cook-line', asset: 'up-cook-line', x: -42.15, z: -39.1, label: '#83 灶台 + #84 油烟罩', ...IN },
  { id: '2f-hood', asset: 'up-hood', x: -42.15, z: -39.15, y: F + 1.9, noBlock: true, noLabel: true, ...IN },
  { id: '2f-prep', asset: 'prep-table', x: -42.4, z: -35.6, ...IN },
  { id: '2f-pans', asset: 'up-dirty-pans', x: -41.9, z: -35.6, y: F + 0.9, noBlock: true, labelBelow: true, ...IN },
  { id: '2f-pass', asset: 'up-pass', x: -44.3, z: -31.5, ...IN },
  { id: '2f-trash', asset: 'up-trash', x: -40.9, z: -31.6, ...IN },
  person('2f-cook', -42.6, -36.5, FACE.S, 5, 'idle', 0.4, { label: '厨师', noLabel: false, ...IN }),

  // ═════ 卫生间 · 清洁（x −46…−40、z −30…−27；门 (−46, −28.5) 通酒吧）═════
  { id: '2f-stalls', asset: 'up-stalls', x: -41.5, z: -29.2, ...IN },
  { id: '2f-basin', asset: 'up-basin', x: -43.6, z: -29.64, ...IN },

  // ═════ 钟楼二层（x −50…−46、z −19.6…−15.6；电梯在西北角，门口 (−47.6, −18.6)）═════
  { id: '2f-bell-rope', asset: 'up-bell-rope', x: -48.6, z: -16.6, noBlock: true, ...IN },

  // ═════ 露台（x −62…−50、z −19.6…−10 + 转角；屋顶上，不给 mode：外观也看得到）═════
  // 三张小圆桌在南半（离女儿墙 z −10.15 ≥ 1.2 米）：两张撑伞、一张伞收着；两张躺椅在第一、二扇落地门之间；花槽搁在女儿墙上
  ...TERRACE_TABLES.map(
    ([x, z], i): Slot => ({ id: `2f-terrace-table-${i}`, asset: 'cafe-table', x, z, noLabel: i > 0 }),
  ),
  ...TERRACE_TABLES.slice(0, 2).map(
    ([x, z], i): Slot => ({ id: `2f-umbrella-${i}`, asset: 'up-umbrella', x, z, noBlock: true, noLabel: i > 0 }),
  ),
  {
    id: '2f-umbrella-closed',
    asset: 'up-umbrella-closed',
    x: TERRACE_TABLES[2][0],
    z: TERRACE_TABLES[2][1],
    noBlock: true,
  },
  { id: '2f-lounger-0', asset: 'up-lounger', x: -58.6, z: -16.9 },
  { id: '2f-lounger-1', asset: 'up-lounger', x: -57.7, z: -16.9, noLabel: true },
  ...[-58.0, -53.0].map(
    (x, i): Slot => ({
      id: `2f-planter-${i}`,
      asset: 'up-planter',
      x,
      z: -10.15,
      y: F + 1.0,
      noBlock: true,
      noLabel: i > 0,
    }),
  ),
  person('2f-terrace-a', -60.42, -12.8, FACE.E, 0, 'sip', 0.2, { seat: [0.45], prop: 'cup' }),
  person('2f-terrace-b', -55.18, -12.8, FACE.W, 2, 'sit', 0.55, { seat: [0.45] }),
];
