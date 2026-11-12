// 二层的新资产规格（编号 #70…#99）。id 全会所唯一（不要和 specs-base.ts、别的 specs-*.ts 重名）；shape 用 placeholders.ts 里已有的形状。
// id 一律带 up- 前缀。休息室的壁炉、地毯、沙发、茶几、奖杯柜，后厨的备餐台都复用 specs-base.ts 的。
// 形状借用：伞 = 'stool'（顶上一块大圆盘 + 细杆），收起的伞、钟绳 = 'tub'（细高的圆柱），隔间 = 'showers'（背墙 + 隔板）。
// 2026-11-11 第二版（"太小、太杂"之后）：每间房 3～6 件，小东西合成一组（长桌 ×2、叠椅一组、隔间 ×2）。
import type { Spec } from './spec';

export const SPECS_2F: Record<string, Spec> = {
  // ── 会员休息室 ──
  /** 球赛电视：挂在北墙（壁炉东边），板底离地 1.3；中心球场开赛时沙发上的人转过去看 */
  'up-match-tv': {
    w: 1.05,
    d: 0.12,
    h: 0.62,
    shape: 'board',
    n: 70,
    name: '球赛电视（挂墙）',
    where: '会员休息室',
    base: 'ironwork',
  },
  /** 活的信号：茶几上的空杯 → 收 */
  'up-empty-cups': {
    w: 0.5,
    d: 0.32,
    h: 0.14,
    shape: 'flat',
    n: 71,
    name: '空杯（该收）',
    where: '休息室',
    base: 'clothWhite',
  },
  // ── 酒吧（barN：北墙后吧、吧台东西向，酒保在中间面朝镜头）──
  /** 后吧：北墙，楼梯井和宴会厅门之间（只有 1.9 米）；活的信号 = 有一格空了 → 从后厨扛一箱 */
  'up-back-bar': {
    w: 1.8,
    d: 0.5,
    h: 2.2,
    shape: 'shelves',
    n: 72,
    name: '后吧酒柜（空了一格 = 该补）',
    where: '酒吧',
    base: 'wood',
  },
  'up-bar-counter': {
    w: 2.4,
    d: 0.7,
    h: 1.1,
    shape: 'counter',
    n: 73,
    name: '吧台（会员酒吧）',
    where: '酒吧',
    base: 'timber',
  },
  'up-high-table': { w: 0.7, d: 0.7, h: 1.05, shape: 'stool', n: 74, name: '高脚桌', where: '酒吧', base: 'brass' },
  /** 活的信号：拖把车没推回清洁间（停在酒吧里）→ 推回去 / 先拖卫生间 */
  'up-mop-cart': {
    w: 0.9,
    d: 0.5,
    h: 1.0,
    shape: 'box',
    n: 75,
    name: '拖把车（没推回去）',
    where: '酒吧 → 清洁间',
    base: 'carRed',
  },
  // ── 总监办公室 · 董事会 ──
  /** 监控墙：北墙两扇窗之间，板底离地 0.9；某一格变红 = 别处出事（点一下，那间房在场景里闪） */
  'up-cctv-wall': {
    w: 1.6,
    d: 0.12,
    h: 1.2,
    shape: 'board',
    n: 76,
    name: '监控墙（一格变红 = 出事）',
    where: '总监办公室',
    base: 'clothTeal',
  },
  'up-safe': { w: 0.7, d: 0.6, h: 1.0, shape: 'box', n: 77, name: '保险柜', where: '总监办公室', base: 'green' },
  /** 活的信号：各收银台的钱袋堆在桌上 → 拎进保险柜 */
  'up-money-bags': {
    w: 0.5,
    d: 0.32,
    h: 0.25,
    shape: 'flat',
    n: 78,
    name: '钱袋（该进保险柜）',
    where: '总监办公室',
    base: 'brass',
  },
  /** 董事会长桌（椅子收在桌下）：董事会卡来之前按住摆好 */
  'up-board-table': {
    w: 4.0,
    d: 1.2,
    h: 0.76,
    shape: 'table',
    n: 79,
    name: '董事会长桌',
    where: '总监办公室',
    base: 'timber',
  },
  // ── 宴会厅 ──
  'up-stage': {
    w: 3.0,
    d: 2.0,
    h: 0.4,
    shape: 'box',
    n: 80,
    name: '小台子（致辞、颁奖）',
    where: '宴会厅',
    base: 'wood',
  },
  'up-banquet-tables': {
    w: 5.0,
    d: 2.6,
    h: 0.76,
    shape: 'table',
    n: 81,
    name: '长桌 ×2（一组，铺桌布）',
    where: '宴会厅',
    base: 'clothWhite',
  },
  /** 活的信号：活动之前椅子还叠着 → 按住布置（布置好了，卡上多一个选项） */
  'up-chair-stacks': {
    w: 1.6,
    d: 0.6,
    h: 1.5,
    shape: 'box',
    n: 82,
    name: '叠着的椅子（该摆）',
    where: '宴会厅',
    base: 'seat',
  },
  // ── 后厨（东翼上面，货梯直通一层后门）──
  'up-cook-line': {
    w: 3.3,
    d: 0.8,
    h: 0.95,
    shape: 'counter',
    n: 83,
    name: '灶台一排',
    where: '后厨',
    base: 'metal',
  },
  /** 油烟罩：挂在灶台上面（离地 1.9），排烟管从东翼屋顶出去 */
  'up-hood': { w: 3.0, d: 0.7, h: 0.5, shape: 'box', n: 84, name: '油烟罩', where: '后厨', base: 'metal' },
  /** 出菜口架：靠宴会厅那扇门，热菜从这里端出去 */
  'up-pass': {
    w: 1.6,
    d: 0.5,
    h: 1.6,
    shape: 'shelves',
    n: 85,
    name: '出菜架（→ 宴会厅）',
    where: '后厨',
    base: 'metal',
  },
  /** 活的信号：备餐台上一摞脏锅 → 洗 */
  'up-dirty-pans': {
    w: 0.8,
    d: 0.5,
    h: 0.18,
    shape: 'flat',
    n: 86,
    name: '脏锅一摞（该洗）',
    where: '后厨',
    base: 'ironwork',
  },
  'up-trash': {
    w: 0.6,
    d: 0.6,
    h: 0.9,
    shape: 'box',
    n: 87,
    name: '垃圾桶（满了走货梯）',
    where: '后厨',
    base: 'green',
  },
  // ── 卫生间 · 清洁 ──
  'up-stalls': { w: 1.8, d: 1.3, h: 2.0, shape: 'showers', n: 88, name: '隔间 ×2', where: '卫生间', base: 'talavera' },
  'up-basin': { w: 1.2, d: 0.5, h: 0.9, shape: 'counter', n: 89, name: '洗手台', where: '卫生间', base: 'tile' },
  // ── 钟楼二层 ──
  /** 钟绳：从钟室垂下来（开门 / 开赛 / 收盘时按住拉 → 钟响） */
  'up-bell-rope': {
    w: 0.18,
    d: 0.18,
    h: 3.3,
    shape: 'tub',
    n: 90,
    name: '钟绳（开赛 / 收盘拉）',
    where: '钟楼二层',
    base: 'clothRed',
  },
  // ── 露台（屋顶上，外观也看得到）──
  /** 遮阳伞（撑开）：w × d = 伞面；下面一张 #18 小圆桌另摆 */
  'up-umbrella': {
    w: 2.2,
    d: 2.2,
    h: 2.4,
    shape: 'stool',
    n: 91,
    name: '遮阳伞（撑开）',
    where: '露台',
    base: 'canvasStripe',
  },
  /** 活的信号：热天伞还收着、这桌没人（会员缩回屋里）→ 按住撑开 */
  'up-umbrella-closed': {
    w: 0.3,
    d: 0.3,
    h: 2.3,
    shape: 'tub',
    n: 92,
    name: '收着的伞（热天该撑开）',
    where: '露台',
    base: 'canvasStripe',
  },
  'up-lounger': { w: 0.7, d: 1.9, h: 0.42, shape: 'table', n: 93, name: '躺椅', where: '露台', base: 'clothBlue' },
  /** 花槽：搁在女儿墙顶上（y 5），外观和剖面都看得到；蔫了 → 浇水 */
  'up-planter': {
    w: 2.4,
    d: 0.35,
    h: 0.35,
    shape: 'flat',
    n: 94,
    name: '花槽（女儿墙上）',
    where: '露台',
    base: 'flowerRed',
  },
};
