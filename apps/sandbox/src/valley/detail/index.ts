// valley 的细节模块：一片区域一个文件（并行做，各改各的）。build.ts 在合并之前依次调用。
// 市中心三栋办事楼（sites/：报社、体育用品店、五金大超市，美术关卡 2 各归一个资产代理）在 town 之前跑：
// 它们占的地、灯光圈留给 town.ts（sites/kit.ts 的 siteState），town 的街边家具躲开、夜里一起开灯。
import type { Detail } from '../build';
import { INTERIORS } from '../interiors/all';
import { interiorDetail } from '../interiors/index';
import { schoolPart } from '../relocate';
import { detailEast } from './east';
import { detailPlaza } from './plaza';
import { moduleDetail } from './shift';
import { detailBank } from './sites/bank';
import { detailCityhall } from './sites/cityhall';
import { detailDiner } from './sites/diner';
import { detailHardware } from './sites/hardware';
import { detailPaper } from './sites/paper';
import { detailSports } from './sites/sports';
import { detailSouth } from './south';
import { detailTown } from './town';

// 2026-11-21 小镇压紧：八个模块（六家店、学校、公园）的细节照旧坐标写，moduleDetail 按 relocate.ts 的 MOVE 整块挪过去
export const DETAILS: Detail[] = [
  moduleDetail('paper', detailPaper),
  moduleDetail('sports', detailSports),
  moduleDetail('hardware', detailHardware),
  moduleDetail('cityhall', detailCityhall),
  moduleDetail('bank', detailBank),
  moduleDetail('diner', detailDiner),
  // 空当和街上的生活（世界坐标；在 town 之前跑：占的地、灯光圈记在 siteState 里，town 的街边家具躲开、夜里一起开灯）
  detailPlaza,
  detailTown,
  detailSouth,
  // 高中拆两块：校队球场那块（schoolCourts）和教学楼、跑道那块（school），按旧坐标的位置分
  moduleDetail('school', (d) => detailEast(d, 'school'), schoolPart),
  moduleDetail('park', (d) => detailEast(d, 'park')),
  // 店内（地图外面很远的地方，进门换场景：interiors/）
  ...INTERIORS.map(interiorDetail),
];
