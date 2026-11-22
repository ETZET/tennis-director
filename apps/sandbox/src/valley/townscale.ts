// 小镇的比例（2026-11-18 用户："参照 Sneaky Sasquatch，人太小、建筑太大"，选了"小镇整体缩小 + 车也缩"）。
//
// 人（约 1.8 米）和俱乐部不动；俱乐部以外的楼、街边的东西、车按 Sasquatch 的比例往小里缩：
//   门 ≈ 1.1 个人高，单层店面 ≈ 2 个人高，两层 ≈ 3 个人高，店面宽 5～8 个人高，车长 ≈ 1.5 个人高。
// 我们的楼原来按真实尺寸（报社门脸 24 × 8 米、体育店 22 × 5.5、五金大超市 48 × 8.4，车 4.5 米长），
// 统一乘 TOWN_K；小区的房子本来就矮，乘 HOUSE_K；车乘 CAR_K。
//
// 缩的规矩（门面线不动 —— 门、室内入口、旗子、POI 都还在原地）：
// - 楼：以朝街的那一面为轴缩（layout.ts 末尾的 post-pass）。
// - 三栋办事楼（报社、体育店、五金大超市）是一整套摆好的资产：楼身 + 贴在楼上的塔、车间、货场、园艺棚、卸货台，
//   以门口为轴整体缩（FRAMES：门面线以北、贴着楼的那块地里的东西按同一个相似变换走，相对位置不变）。
// - 街边的小件（长椅、路灯、报箱、棕榈、停着的车……）原地缩（绕自己的落地点）；长条的（围墙、遮阳棚、栏杆）只压低，
//   长度不缩（缩了段和段之间会断开）；平铺的（铺地、斑马线、车位线）和路不动。
// 这些在 build.ts 的 townWrap（包一层 DetailCtx）里做，细节文件（detail/*.ts、sites/*.ts）照原尺寸写，不用改。

import { MOVE, mvRect } from './relocate';

/** 楼、街边小件 */
export const TOWN_K = 0.62;
/** 小区的房子（本来就 3.4～4.6 米高，缩多了门放不下） */
export const HOUSE_K = 0.75;
/** 车（汽车、球车，含停着的） */
export const CAR_K = 0.65;
/** 比这个宽 / 深的东西算"长条"：只压低，不缩长度 */
export const LONG_M = 4.5;
/** 比这个矮的算"平铺"：不动 */
export const FLAT_M = 0.15;

export interface TRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
/**
 * 一栋办事楼的缩放框：轴 = 门口（门面线上、门的正中），zone = 贴着楼的那块地（门面线往南 FRONT_PAD 米以北）。
 * 落在 zone 里的东西按 p' = 轴 + (p − 轴) × TOWN_K 整体走（y 也乘），大小乘 TOWN_K。
 */
export interface Frame {
  id: 'paper' | 'sports' | 'hardware' | 'bank' | 'diner';
  px: number;
  pz: number;
  zone: TRect;
}
/** 门面线往南多少米还算"贴在楼上"（拱廊、台阶、门头伸出来的部分） */
export const FRONT_PAD = 3;
// 坐标 = 旧坐标（同 detail/sites/*.ts：压紧以前的世界坐标）；门口 = POI 的 x、楼的南墙 z。世界里的是 FRAMES（+ relocate.ts 的 MOVE）
export const FRAMES_SRC: readonly Frame[] = [
  // 报社：楼 237…261 × −667…−651，后面印刷车间 238…260 × −686…−666，西边货场 222…236.5 × −688…−662
  { id: 'paper', px: 249, pz: -651, zone: { x0: 219, x1: 266, z0: -692, z1: -651 + FRONT_PAD } },
  // 体育店：楼 241…263 × −733…−715，门 x 258
  { id: 'sports', px: 258, pz: -715, zone: { x0: 238, x1: 266, z0: -736, z1: -715 + FRONT_PAD } },
  // 五金大超市：楼 352…400 × −600…−572，西边侧院、东边园艺棚和卸货台 339…436，门 x 365
  { id: 'hardware', px: 365, pz: -572, zone: { x0: 337, x1: 438, z0: -604, z1: -572 + FRONT_PAD } },
  // 第二批（2026-11-18）：门朝南、轴在门口（不按 frontOf 判的临街面）
  // 银行：楼 282.6…302.6 × −614…−590，门在南墙正中 x 292.6
  { id: 'bank', px: 292.6, pz: -590, zone: { x0: 282, x1: 303, z0: -615, z1: -590 + FRONT_PAD } },
  // 餐馆：楼 305.05…321.18 × −568.9…−556，门 x 318.6；x0 302 包住门西边的高杆招牌，x1 322 不伸到印第安峡谷路的人行道
  { id: 'diner', px: 318.6, pz: -556, zone: { x0: 302, x1: 322, z0: -571, z1: -556 + FRONT_PAD } },
];

/** 世界坐标的缩放框（旧坐标 + 这家的 MOVE） */
export const FRAMES: Frame[] = FRAMES_SRC.map((f) => {
  const [dx, dz] = MOVE[f.id];
  return { ...f, px: f.px + dx, pz: f.pz + dz, zone: mvRect(f.id, f.zone) };
});

const inR = (r: TRect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export const frameAt = (x: number, z: number): Frame | undefined => FRAMES.find((f) => inR(f.zone, x, z));
/** 缩放框里的一个点 → 缩完的位置 */
export const fmap = (f: Frame, x: number, z: number): [number, number] => [
  f.px + (x - f.px) * TOWN_K,
  f.pz + (z - f.pz) * TOWN_K,
];
/** 缩放框里的一个矩形 → 缩完的 */
export const fmapRect = (f: Frame, r: TRect): TRect => {
  const [x0, z0] = fmap(f, r.x0, r.z0);
  const [x1, z1] = fmap(f, r.x1, r.z1);
  return { x0, x1, z0, z1 };
};

/** 不缩的地方：俱乐部那块（同 layout.ts 的 CLUB_BOX_L，缩完的坐标里也原样）、俱乐部的酒店扩张地（HOTEL_PLOT）、地图外面很远的店内 */
const CLUB: TRect = { x0: -80, x1: 140, z0: -60, z1: 100 };
const HOTEL: TRect = { x0: 112, x1: 236, z0: 18, z1: 84 };
/**
 * 小镇里按真实尺寸留着的运动场（人要在上面打球：球场、网、围网和俱乐部一样大）。
 * 坐标 = 旧坐标（detail/east.ts 的 school()、park() 读这张）；世界的是 PLAY_KEEP。2026-11-18 学校（青训选拔）、日出公园各管自己那几行。
 */
export const PLAY_KEEP_SRC: readonly (TRect & { mod: 'schoolCourts' | 'park' })[] = [
  // 棕榈泉高中的校队球场（detail/east.ts 的 SCH）：四片场 + 西头练习墙那一条，围网 640…727 × −491.5…−457 往外 0.5 米。
  // 体育馆、记分牌不在框里（跟着小镇缩）。
  { mod: 'schoolCourts', x0: 639.5, x1: 727.5, z0: -492, z1: -456.5 },
  // 三号场北头的看台（真实尺寸，人坐得下；2026-11-18 lead 定）：693.4…705.4 × −495.8…−492
  { mod: 'schoolCourts', x0: 692.9, x1: 706, z0: -496.5, z1: -492 },
  // 日出公园（detail/east.ts 的 park()，2026-11-18 公园关卡 1）。框只包场地 + 围网 + 外圈（灯杆、场边长椅、挂拍处），不包树、游乐场、楼。
  // 公共球场：三片一排 + 3.6 米围网 758…806.8 × −433…−396.4，四角灯杆在围网外 0.8 米，南围网外的长椅到 −393.9
  // G4 美术返工：三处各抬成一个台（parkdeck.ts），框包住整个台面（台上的东西不能有一半在框外：框外的 y 乘 0.62，会沉进台里）
  { mod: 'park', x0: 756, x1: 808.5, z0: -434.8, z1: -392.2 },
  // 对墙练习场：墙 818.5…827.5（z −427）、场地 815…831 × −427…−408、东南路灯 (830.4, −412)、南边长椅；台 813.6…832.4 × −428.4…−406.6
  { mod: 'park', x0: 813.5, x1: 833, z0: -428.5, z1: -406.5 },
  // 公开课：两张小网的小场 764.5…775.5 × −382.5…−371.5、锥桶、帐篷 + 报名桌 (765.5, −364.5)、横幅 (774.5, −364.6)；草台 757…786.6 × −386.6…−359.6
  { mod: 'park', x0: 756.8, x1: 786.8, z0: -386.8, z1: -359.4 },
  // 入口的园牌 park-sign（762.5, −358.7，2.6 × 0.3）：只包住它一块。缩到 0.62 字一格 0.028 米 < 小镇的 1 纹素（0.034），"SUNRISE PARK" 会糊
  { mod: 'park', x0: 761, x1: 764, z0: -359.2, z1: -358.2 },
];
/** 世界坐标的真尺寸框 */
export const PLAY_KEEP: TRect[] = PLAY_KEEP_SRC.map(({ mod, ...r }) => mvRect(mod, r));
/** 镜头用：俱乐部、酒店扩张地、店内（小镇里真尺寸的运动场不算 —— 走上球场镜头不跳） */
export const keepScaleCam = (x: number, z: number): boolean => inR(CLUB, x, z) || inR(HOTEL, x, z) || x > 2500;
export const keepScale = (x: number, z: number): boolean => keepScaleCam(x, z) || PLAY_KEEP.some((r) => inR(r, x, z));
/** 旧坐标里（school()、park() 的代码）这一点在不在真尺寸的球场框里 */
export const keepScaleSrc = (x: number, z: number): boolean => PLAY_KEEP_SRC.some((r) => inR(r, x, z));
