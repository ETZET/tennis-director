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
  id: 'paper' | 'sports' | 'hardware';
  px: number;
  pz: number;
  zone: TRect;
}
/** 门面线往南多少米还算"贴在楼上"（拱廊、台阶、门头伸出来的部分） */
export const FRONT_PAD = 3;
// 坐标 = 缩完的世界坐标（同 detail/sites/*.ts）；门口 = POI 的 x、楼的南墙 z
export const FRAMES: Frame[] = [
  // 报社：楼 237…261 × −667…−651，后面印刷车间 238…260 × −686…−666，西边货场 222…236.5 × −688…−662
  { id: 'paper', px: 249, pz: -651, zone: { x0: 219, x1: 266, z0: -692, z1: -651 + FRONT_PAD } },
  // 体育店：楼 241…263 × −733…−715，门 x 258
  { id: 'sports', px: 258, pz: -715, zone: { x0: 238, x1: 266, z0: -736, z1: -715 + FRONT_PAD } },
  // 五金大超市：楼 352…400 × −600…−572，西边侧院、东边园艺棚和卸货台 339…436，门 x 365
  { id: 'hardware', px: 365, pz: -572, zone: { x0: 337, x1: 438, z0: -604, z1: -572 + FRONT_PAD } },
];

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
export const keepScale = (x: number, z: number): boolean => inR(CLUB, x, z) || inR(HOTEL, x, z) || x > 2500;
