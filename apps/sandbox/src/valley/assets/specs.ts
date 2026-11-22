// 市中心三栋办事楼的资产清单（docs/lab/2026-11-07-3d-pixel/valley-town.md「资产清单」）：画廊的列表、信息条、还没画的灰盒都读它。
// 尺寸 米（宽 x × 高 y × 深 z）；设计纹素 = 米 / 0.09。本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南）；"门面"类的原点是楼的中心。
// 这个文件归核心代理；资产代理要改尺寸 / 加资产，在自己的报告里写，或者改自己 assets 文件里的 ASSETS（画廊照样列出来，信息条没有规格）。
import type { PalKey } from '../palette';

export type Batch =
  | 'P'
  | 'S'
  | 'H'
  | 'C'
  | 'P2'
  | 'S2'
  | 'H2'
  | 'K2'
  | 'CH'
  | 'B'
  | 'D'
  | 'SC'
  | 'CH2'
  | 'B2'
  | 'D2'
  | 'KC'
  | 'KW'
  | 'KL';
export interface Spec {
  batch: Batch;
  name: string;
  w: number;
  h: number;
  d: number;
  /** 灰盒顶上一条提议的主色 */
  key: PalKey;
  /** 单个实例的三角形上限 */
  tris: number;
  /** 场景里放几个（变体 v0..） */
  n?: number;
}

export const BATCH_NAME: Record<Batch, string> = {
  P: '报社（批 P，assets/paper.ts）',
  S: '体育用品店（批 S，assets/sports.ts）',
  H: '五金大超市（批 H，assets/hardware.ts）',
  C: '共用（批 C，assets/shared.ts）',
  P2: '报社店内 v2（批 P2，assets/in2/paper.ts）',
  S2: '体育店店内 v2（批 S2，assets/in2/sports.ts）',
  H2: '五金店内 v2（批 H2，assets/in2/hardware.ts）',
  KC: '日出公园：公共球场（批 KC，assets/park/court.ts）',
  KW: '日出公园：对墙和野球局场边（批 KW，assets/park/wall.ts）',
  KL: '日出公园：公开课和背景（批 KL，assets/park/life.ts）',
  K2: '店内 v2 共用件（批 K2，interiors/v2/kit.ts：价签、对话气泡、大字招牌、地面字）',
  CH: '市政厅（批 CH，assets/cityhall.ts）',
  B: '沙漠银行（批 B，assets/bank.ts）',
  D: '餐馆（批 D，assets/diner.ts）',
  SC: '棕榈泉高中（批 SC，assets/school.ts）',
  CH2: '市政厅店内（批 CH2，assets/in2/cityhall.ts）',
  B2: '银行店内（批 B2，assets/in2/bank.ts）',
  D2: '餐馆店内（批 D2，assets/in2/diner.ts）',
};

export const SPECS: Record<string, Spec> = {
  // ── 批 P：报社 ──
  'paper-front': { batch: 'P', name: '报社门脸（南立面 + 屋顶边）', w: 24, h: 8, d: 16, key: 'stucco', tris: 2500 },
  'paper-tower': { batch: 'P', name: '塔 + 太阳牌 + 竖招牌', w: 5.5, h: 15.6, d: 5.5, key: 'sunEnamel', tris: 1200 },
  'paper-press-roof': { batch: 'P', name: '印刷车间的锯齿顶', w: 22, h: 1.7, d: 19, key: 'roofMetal', tris: 400 },
  'paper-newsrack': { batch: 'P', name: '投币报箱', w: 0.6, h: 1.1, d: 0.5, key: 'signBoard', tris: 200, n: 4 },
  'paper-van': { batch: 'P', name: '送报车', w: 2.2, h: 2.4, d: 5.4, key: 'truckWhite', tris: 400 },
  'newsprint-rolls': { batch: 'P', name: '一托新闻纸卷', w: 2.6, h: 1.6, d: 1.3, key: 'newsprint', tris: 500 },
  'paper-bundles': { batch: 'P', name: '一摞捆好的报纸', w: 1.2, h: 1.0, d: 0.9, key: 'newsprint', tris: 200, n: 2 },
  // ── 批 S：体育用品店（用户 2026-11-16：不要试拍小场、对墙、发球机、试拍架）──
  'sports-front': { batch: 'S', name: '体育店门面（南立面）', w: 22, h: 5.5, d: 18, key: 'signBoard', tris: 2000 },
  'sports-ball-sign': { batch: 'S', name: '屋顶的大网球', w: 2.4, h: 3.2, d: 2.4, key: 'ball', tris: 600 },
  'stringing-station': { batch: 'S', name: '穿线台', w: 1.2, h: 1.3, d: 0.8, key: 'clothRed', tris: 400 },
  'ballcan-bin': { batch: 'S', name: '特价球罐桶', w: 0.8, h: 0.9, d: 0.8, key: 'ball', tris: 300 },
  // ── 批 H：五金大超市（芥末黄 hwMustard + 深海军蓝 hwNavy）──
  'bigbox-shell': {
    batch: 'H',
    name: '大盒子（墙 + 女儿墙 + 屋顶）',
    w: 48,
    h: 8.4,
    d: 28,
    key: 'hwMustard',
    tris: 2000,
  },
  'bigbox-entry': { batch: 'H', name: '门头 + 大招牌 + 自动门', w: 11, h: 10.5, d: 2.5, key: 'hwNavy', tris: 1000 },
  'garden-center': {
    batch: 'H',
    name: '园艺棚（花砖墙 + 遮阳网）',
    w: 20,
    h: 4.2,
    d: 16,
    key: 'shadeCloth',
    tris: 1500,
  },
  'nursery-cacti': { batch: 'H', name: '一床盆栽仙人掌', w: 4, h: 1.0, d: 1.2, key: 'cactus', tris: 600, n: 3 },
  'pallet-sand': { batch: 'H', name: '一托袋装沙', w: 1.2, h: 1.1, d: 1.0, key: 'kraft', tris: 300, n: 5 },
  'pallet-paint': { batch: 'H', name: '一托线漆桶', w: 1.2, h: 0.9, d: 1.0, key: 'pvc', tris: 400, n: 3 },
  'pipe-rack': { batch: 'H', name: '灌溉管架', w: 4, h: 1.6, d: 1.2, key: 'pvc', tris: 400, n: 2 },
  'cart-corral': { batch: 'H', name: '购物车栏', w: 3.2, h: 1.0, d: 1.4, key: 'clothRed', tris: 400, n: 2 },
  'propane-cage': { batch: 'H', name: '丙烷笼', w: 2.0, h: 1.8, d: 1.0, key: 'pvc', tris: 400 },
  'box-truck': { batch: 'H', name: '厢式货车', w: 2.5, h: 3.6, d: 8, key: 'truckWhite', tris: 500 },
  dock: { batch: 'H', name: '卸货台', w: 1.5, h: 1.2, d: 10, key: 'concrete', tris: 300 },
  bollard: { batch: 'H', name: '防撞桩', w: 0.35, h: 1.0, d: 0.35, key: 'flowerYellow', tris: 50, n: 4 },
  'lot-pylon': { batch: 'H', name: '路边高杆招牌', w: 3.6, h: 11, d: 1.4, key: 'hwNavy', tris: 400 },
  'lot-light': { batch: 'H', name: '停车场高杆灯', w: 2.4, h: 8.2, d: 0.6, key: 'metal', tris: 100, n: 3 },
  'pickup-lumber': { batch: 'H', name: '拉木料的皮卡', w: 2.1, h: 1.9, d: 5.4, key: 'carRed', tris: 500 },
  // ── 日出公园（2026-11-18，valley-park.md）：KC 公共球场、KW 对墙和野球局场边、KL 公开课和背景 ──
  'park-court': {
    batch: 'KC',
    name: '公共球场一片（v0 好 / v1 裂 / v2 塌网那片）',
    w: 11,
    h: 0.03,
    d: 23.8,
    key: 'muniCourt',
    tris: 300,
    n: 3,
  },
  'park-court-bed': { batch: 'KC', name: '三片场的外场 + 场间', w: 49, h: 0.02, d: 36.6, key: 'muniOuter', tris: 100 },
  'park-net': {
    batch: 'KC',
    name: '球网（v0 好 / v1 塌 / v2 没网）',
    w: 12.8,
    h: 1.07,
    d: 0.2,
    key: 'netTape',
    tris: 200,
    n: 3,
  },
  'park-fence': {
    batch: 'KC',
    name: '围网一节（v0 好 / v1 破 / v2 只剩铁丝网 / v3 门）',
    w: 6,
    h: 3.6,
    d: 0.16,
    key: 'windscreenOld',
    tris: 150,
    n: 30,
  },
  'park-light': {
    batch: 'KC',
    name: '球场灯杆（v1 = 对墙的老路灯）',
    w: 1.6,
    h: 9,
    d: 0.6,
    key: 'chainLink',
    tris: 100,
    n: 7,
  },
  'park-closed-sign': { batch: 'KC', name: '围网上的封场牌', w: 1.3, h: 0.8, d: 0.06, key: 'toolOrange', tris: 50 },
  'park-barricade': { batch: 'KC', name: '锯马路障 + 小牌', w: 2.6, h: 1.4, d: 0.6, key: 'toolOrange', tris: 200 },
  'park-wall': { batch: 'KW', name: '对墙练习墙', w: 9.6, h: 3.2, d: 0.6, key: 'hitWall', tris: 300 },
  'park-wall-court': {
    batch: 'KW',
    name: '对墙前的场地 + 线 + 磨白',
    w: 16,
    h: 0.03,
    d: 19,
    key: 'muniCourt',
    tris: 100,
  },
  'park-kid-gear': { batch: 'KW', name: '少年的红球包 + 球筐', w: 1.2, h: 0.8, d: 0.7, key: 'clothRed', tris: 300 },
  'park-racquet-queue': {
    batch: 'KW',
    name: '挂拍排队的横杆 + 木牌',
    w: 3.2,
    h: 2.6,
    d: 0.2,
    key: 'parkBrown',
    tris: 300,
  },
  'park-bench': { batch: 'KW', name: '市政长椅', w: 2.0, h: 0.9, d: 0.7, key: 'windscreenOld', tris: 200, n: 3 },
  'park-trash': { batch: 'KW', name: '市政垃圾桶', w: 0.6, h: 0.95, d: 0.6, key: 'windscreenOld', tris: 100, n: 2 },
  'park-ball-hopper': { batch: 'KW', name: '铁丝球筐', w: 0.6, h: 0.95, d: 0.6, key: 'ball', tris: 150, n: 4 },
  'park-mini-net': {
    batch: 'KL',
    name: '便携小网（俱乐部的青绿脚架）',
    w: 5.5,
    h: 0.9,
    d: 0.6,
    key: 'clothTeal',
    tris: 150,
    n: 2,
  },
  'park-clinic-tent': { batch: 'KL', name: '公开课帐篷 + 报名桌', w: 3.4, h: 2.9, d: 3.4, key: 'clothTeal', tris: 600 },
  'park-clinic-banner': { batch: 'KL', name: '公开课横幅', w: 3.6, h: 2.2, d: 0.3, key: 'clothTeal', tris: 200 },
  'park-sign': { batch: 'KL', name: '市政公园牌', w: 2.6, h: 1.5, d: 0.3, key: 'parkBrown', tris: 200 },
  'park-shelter': { batch: 'KL', name: '野餐棚', w: 9, h: 4.4, d: 6.8, key: 'roofTile', tris: 800 },
  'park-playground': { batch: 'KL', name: '儿童游乐场（含沙坑）', w: 13, h: 4.6, d: 9, key: 'clothRed', tris: 1200 },
  // G4 美术返工：草地的中间层（手摆的草团、晒黄团、小花、墙脚高草；v0～v3）
  'park-grass-tuft': { batch: 'KL', name: '草团（中间层）', w: 0.5, h: 0.3, d: 0.4, key: 'lawn', tris: 150, n: 4 },
  // ── 批 C：共用 ──
  'a-board': { batch: 'C', name: '人字小黑板', w: 0.8, h: 1.0, d: 0.5, key: 'slate', tris: 200, n: 2 },
  'breeze-wall': { batch: 'C', name: '花砖墙一段（2 米样品）', w: 2, h: 1.4, d: 0.3, key: 'breezeBlock', tris: 100 },
};
