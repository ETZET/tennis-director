// valley 的细节模块：一片区域一个文件（并行做，各改各的）。build.ts 在合并之前依次调用。
// 市中心三栋办事楼（sites/：报社、体育用品店、五金大超市，美术关卡 2 各归一个资产代理）在 town 之前跑：
// 它们占的地、灯光圈留给 town.ts（sites/kit.ts 的 siteState），town 的街边家具躲开、夜里一起开灯。
import type { Detail } from '../build';
import { INTERIORS } from '../interiors/all';
import { interiorDetail } from '../interiors/index';
import { detailEast } from './east';
import { detailHardware } from './sites/hardware';
import { detailPaper } from './sites/paper';
import { detailSports } from './sites/sports';
import { detailSouth } from './south';
import { detailTown } from './town';

export const DETAILS: Detail[] = [
  detailPaper,
  detailSports,
  detailHardware,
  detailTown,
  detailSouth,
  detailEast,
  // 店内（地图外面很远的地方，进门换场景：interiors/）
  ...INTERIORS.map(interiorDetail),
];
