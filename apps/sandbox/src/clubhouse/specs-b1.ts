// 负一层（健身房 + 后场）的新资产规格（编号 #100…#159）。id 全会所唯一（不要和 specs-base.ts、别的 specs-*.ts 重名）；shape 用 placeholders.ts 里已有的形状。
// 复用 specs-base.ts 的：理疗床 #38、冰浴桶 #39；长椅用复用的 bench。
// 大、少、透气：一排器械、一组单车、一摞跳箱都是"一件"；竖屏一帧 ≤ 35 件占位，所以信号尽量长在它那件家具上（汗渍在卧推凳上、散着的哑铃在哑铃架前、
// 脏毛巾筐在毛巾台的一头、地上的片在片树脚下、红灯在那台跑步机上、跳闸在配电柜上）。信号 = 总监的活先出的画面：
//   杠铃片丢在地上 → 挂回片树；哑铃散在地上 → 拣回架子；跑步机亮红灯 → 按住修；毛巾筐冒尖 → 去洗衣房推干净的来；
//   饮水机桶空了 → 去储藏扛一桶；凳上一滩汗 → 擦；到点了教练台空着（课表板上的铃在响）→ 拖个人上台；
//   洗衣机闪灯 → 换烘干 / 叠；配电柜跳闸 → 按住合闸。
// 地面到处是绿胶垫、草皮 → base 挑饱和的（器械：工具橙 / 红 / 蓝 / 紫），?accent=2 量饱和度别掉下去。
import type { Spec } from './spec';

export const SPECS_B1: Record<string, Spec> = {
  // ── 自由重量 ──
  /** 镜墙：贴北墙的一大条（板底 y −3.65、顶 −1.85；上面是北墙的高窗，窗台 −1.4） */
  'gym-mirror': {
    w: 7.6,
    d: 0.06,
    h: 1.8,
    shape: 'board',
    n: 100,
    name: '镜墙',
    where: '自由重量（北墙）',
    base: 'silverBlue',
  },
  /** 深蹲架（力量架 + 地上一块举重台）：两根立柱 + 顶杠 + 挂着的杠铃；练的人站在架子里，脸朝南 */
  'gym-squat-rack': {
    w: 2.0,
    d: 2.0,
    h: 2.4,
    shape: 'rail',
    n: 101,
    name: '深蹲架',
    where: '自由重量',
    base: 'toolOrange',
  },
  /** 哑铃架（镜前）+ 架前地上散着的几只哑铃（信号） */
  'gym-dumbbell-rack': {
    w: 3.0,
    d: 0.7,
    h: 1.0,
    shape: 'shelves',
    n: 102,
    name: '哑铃架（哑铃散在地上）',
    where: '自由重量',
    base: 'clothBlue',
  },
  /** 卧推凳（南北放）：凳面南半一滩汗（信号） */
  'gym-bench': {
    w: 0.6,
    d: 1.5,
    h: 0.5,
    shape: 'box',
    n: 103,
    name: '卧推凳（汗渍）',
    where: '自由重量',
    base: 'clothRed',
  },
  /** 杠铃片树 + 脚下丢着的一摞片（信号） */
  'gym-plate-tree': {
    w: 0.8,
    d: 0.8,
    h: 1.3,
    shape: 'column',
    n: 104,
    name: '杠铃片树（片丢在地上）',
    where: '自由重量',
    base: 'metal',
  },

  // ── 器械循环 ──
  /** 一排三台坐着练的器械（座 + 背后的配重塔 + 扶手），坐的人脸朝南 */
  'gym-machines': {
    w: 4.4,
    d: 1.4,
    h: 1.7,
    shape: 'sofa',
    n: 110,
    name: '器械 ×3（一排）',
    where: '器械循环',
    base: 'seat',
  },
  'gym-cable': { w: 3.0, d: 1.0, h: 2.3, shape: 'rail', n: 111, name: '龙门架', where: '器械循环', base: 'metal' },

  // ── 功能草道 ──
  'gym-kb-plyo': {
    w: 2.2,
    d: 0.7,
    h: 0.9,
    shape: 'shelves',
    n: 115,
    name: '壶铃架 + 跳箱',
    where: '功能草道',
    base: 'ironwork',
  },
  /** 战绳：锚在北头，两根绳平铺在草上（一条） */
  'gym-ropes': { w: 0.6, d: 6.0, h: 0.1, shape: 'flat', n: 116, name: '战绳', where: '功能草道', base: 'clothBlue' },
  'gym-sled': { w: 1.0, d: 1.3, h: 1.1, shape: 'box', n: 117, name: '雪橇', where: '功能草道', base: 'toolOrange' },

  // ── 团课房 ──
  'gym-stage': { w: 2.4, d: 1.2, h: 0.3, shape: 'box', n: 120, name: '教练台', where: '团课房', base: 'timber' },
  /** 瑜伽垫两排（8 张）铺成一块（比木地板高出一点，看得见） */
  'gym-mats': {
    w: 3.8,
    d: 3.4,
    h: 0.1,
    shape: 'flat',
    n: 121,
    name: '瑜伽垫 ×8',
    where: '团课房',
    base: 'clothPurple',
  },
  /** 立着的课表板 + 顶上一只铃 */
  'gym-class-board': {
    w: 1.0,
    d: 0.1,
    h: 1.7,
    shape: 'board',
    n: 122,
    name: '上课铃 · 课表板',
    where: '团课房',
    base: 'slate',
  },

  // ── 拳击角 ──
  'gym-bag-rack': {
    w: 3.0,
    d: 0.8,
    h: 2.6,
    shape: 'rail',
    n: 125,
    name: '沙袋架（3 只）',
    where: '拳击角',
    base: 'clothRed',
  },
  'gym-ring-mat': { w: 3.8, d: 3.4, h: 0.1, shape: 'flat', n: 126, name: '台垫', where: '拳击角', base: 'clothBlue' },
  'gym-glove-rack': {
    w: 1.2,
    d: 0.4,
    h: 1.2,
    shape: 'shelves',
    n: 127,
    name: '手套架',
    where: '拳击角',
    base: 'clothRed',
  },

  // ── 拉伸 · 理疗 ──
  'gym-stretch-mats': {
    w: 2.8,
    d: 2.0,
    h: 0.1,
    shape: 'flat',
    n: 130,
    name: '拉伸垫',
    where: '拉伸 · 理疗',
    base: 'clothTeal',
  },
  'gym-roller-rack': {
    w: 1.0,
    d: 0.45,
    h: 1.1,
    shape: 'shelves',
    n: 131,
    name: '泡沫轴架',
    where: '拉伸 · 理疗',
    base: 'clothPurple',
  },

  // ── 前台大厅 ──
  /** 前台 · 毛巾台：朝南，前台站北边（脸朝镜头）；东头一只脏毛巾筐（冒尖 = 信号），台后的干净毛巾格空了 */
  'gym-desk': {
    w: 3.4,
    d: 0.7,
    h: 1.05,
    shape: 'counter',
    n: 135,
    name: '前台 · 毛巾台（脏毛巾筐冒尖）',
    where: '前台大厅',
    base: 'counter',
  },
  'gym-water': {
    w: 0.5,
    d: 0.5,
    h: 1.3,
    shape: 'column',
    n: 136,
    name: '饮水机（桶空了）',
    where: '前台大厅',
    base: 'water',
  },

  // ── 更衣（男 / 女）──
  /** 储物柜一排（比 #35 短：屋里 3.8 米宽，旁边留 1.3 米的路） */
  'gym-lockers': {
    w: 2.4,
    d: 0.45,
    h: 1.8,
    shape: 'lockers',
    n: 140,
    name: '储物柜',
    where: '更衣（男 / 女）',
    base: 'seat',
  },
  /** 淋浴 ×2 + 厕位 ×2 一面（朝南，隔板 = 一格一格） */
  'gym-wet': {
    w: 3.4,
    d: 1.0,
    h: 2.1,
    shape: 'showers',
    n: 141,
    name: '淋浴 + 厕位',
    where: '更衣（男 / 女）',
    base: 'clothWhite',
  },

  // ── 有氧区 ──
  /** 跑步机：低的跑带（人站在上面 y +0.3），面朝南（正对天窗、也正对镜头） */
  'gym-treadmill': { w: 0.85, d: 1.8, h: 0.3, shape: 'box', n: 145, name: '跑步机', where: '有氧区', base: 'seat' },
  'gym-treadmill-fault': {
    w: 0.85,
    d: 1.8,
    h: 0.3,
    shape: 'box',
    n: 146,
    name: '跑步机（亮红灯）',
    where: '有氧区',
    base: 'carRed',
  },
  'gym-bikes': { w: 2.6, d: 1.2, h: 1.1, shape: 'counter', n: 147, name: '单车 ×3', where: '有氧区', base: 'clothRed' },
  'gym-rowers': { w: 1.5, d: 2.2, h: 0.5, shape: 'box', n: 148, name: '划船机 ×2', where: '有氧区', base: 'clothTeal' },

  // ── 后场：洗衣房 ──
  'gym-washers': {
    w: 3.0,
    d: 0.8,
    h: 1.1,
    shape: 'counter',
    n: 150,
    name: '洗衣机 + 烘干机',
    where: '洗衣房',
    base: 'clothWhite',
  },
  'gym-wash-blink': {
    w: 0.5,
    d: 0.1,
    h: 0.3,
    shape: 'box',
    n: 151,
    name: '闪灯（洗完了）',
    where: '洗衣房',
    base: 'flowerYellow',
  },
  'gym-fold-table': { w: 1.8, d: 0.8, h: 0.9, shape: 'table', n: 152, name: '叠衣台', where: '洗衣房', base: 'wood' },
  'gym-towel-cart': {
    w: 1.0,
    d: 0.6,
    h: 1.1,
    shape: 'box',
    n: 153,
    name: '干净毛巾车',
    where: '洗衣房',
    base: 'clothTeal',
  },
  /** 2F 滑槽的出口（从天花板垂下来）+ 下面一堆脏毛巾 */
  'gym-chute': {
    w: 1.1,
    d: 0.9,
    h: 0.6,
    shape: 'box',
    n: 154,
    name: '滑槽出口 + 脏毛巾堆',
    where: '洗衣房',
    base: 'clothWhite',
  },

  // ── 后场：机房 · 配电 ──
  'gym-panel': {
    w: 1.2,
    d: 0.4,
    h: 2.0,
    shape: 'box',
    n: 155,
    name: '配电柜（跳闸）',
    where: '机房 · 配电',
    base: 'ironwork',
  },
  'gym-boiler': { w: 1.0, d: 1.0, h: 2.0, shape: 'column', n: 156, name: '锅炉', where: '机房 · 配电', base: 'rust' },
  'gym-ac': { w: 1.4, d: 0.9, h: 1.2, shape: 'box', n: 157, name: '空调主机', where: '机房 · 配电', base: 'metal' },

  // ── 后场：储藏 ──
  'gym-store-shelves': {
    w: 2.2,
    d: 0.6,
    h: 2.2,
    shape: 'shelves',
    n: 158,
    name: '货架（球筐、水桶）',
    where: '储藏',
    base: 'wood',
  },
  'gym-firewood-kegs': {
    w: 1.6,
    d: 0.8,
    h: 1.2,
    shape: 'box',
    n: 159,
    name: '柴堆 + 酒桶',
    where: '储藏',
    base: 'timber',
  },
};
