// 市中心三栋办事楼的资产清单（docs/lab/2026-11-07-3d-pixel/valley-town.md「资产清单」）：画廊的列表、信息条、还没画的灰盒都读它。
// 尺寸 米（宽 x × 高 y × 深 z）；设计纹素 = 米 / 0.09。本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南）；"门面"类的原点是楼的中心。
// 这个文件归核心代理；资产代理要改尺寸 / 加资产，在自己的报告里写，或者改自己 assets 文件里的 ASSETS（画廊照样列出来，信息条没有规格）。
import type { PalKey } from '../palette';

export type Batch = 'P' | 'S' | 'H' | 'C' | 'P2' | 'S2' | 'H2' | 'K2';
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
  K2: '店内 v2 共用件（批 K2，interiors/v2/kit.ts：价签、对话气泡、大字招牌、地面字）',
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
  // ── 批 C：共用 ──
  'a-board': { batch: 'C', name: '人字小黑板', w: 0.8, h: 1.0, d: 0.5, key: 'slate', tris: 200, n: 2 },
  'breeze-wall': { batch: 'C', name: '花砖墙一段（2 米样品）', w: 2, h: 1.4, d: 0.3, key: 'breezeBlock', tris: 100 },
};
