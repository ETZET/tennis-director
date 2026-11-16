// valley 的细节模块：一片区域一个文件（并行做，各改各的）。build.ts 在合并之前依次调用。
import type { Detail } from '../build';
import { detailEast } from './east';
import { detailSouth } from './south';
import { detailTown } from './town';

export const DETAILS: Detail[] = [detailTown, detailSouth, detailEast];
