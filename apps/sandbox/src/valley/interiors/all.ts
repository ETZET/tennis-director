// 三家店的室内（各店一个文件，美术关卡 1+2 各归一个代理）。detail/index.ts 把它们接进 build，main.ts 接门口的"进去 / 出去"，nav.ts 接能站的地方。
// 两版并存（用户 2026-11-16："保留目前的 demo"）：v1 = 第一版（大、远、货多），v2 = 参考 Sneaky Sasquatch 的店内重做（小、近、货少而大、价签、
// 大字分区、柜台后的人）。URL ?inv=1 / ?inv=2 切；只建一版，两版同 ORIGIN。
import { INTERIOR_HARDWARE } from './hardware';
import type { InteriorDef } from './index';
import { INTERIOR_PAPER } from './paper';
import { INTERIOR_SPORTS } from './sports';
import { INTERIOR_BANK } from './v2/bank';
import { INTERIOR_CITYHALL } from './v2/cityhall';
import { INTERIOR_DINER } from './v2/diner';
import { INTERIOR_HARDWARE as HARDWARE_V2 } from './v2/hardware';
import { INTERIOR_PAPER as PAPER_V2 } from './v2/paper';
import { INTERIOR_SPORTS as SPORTS_V2 } from './v2/sports';

export const INTERIORS_V1: InteriorDef[] = [INTERIOR_PAPER, INTERIOR_SPORTS, INTERIOR_HARDWARE];
export const INTERIORS_V2: InteriorDef[] = [PAPER_V2, SPORTS_V2, HARDWARE_V2];

/** 哪一版（浏览器读 ?inv=；测试里没有 location → v1） */
export const INTERIOR_VERSION: 1 | 2 =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('inv') === '2' ? 2 : 1;

/** 第二批（市政厅、银行、餐馆，2026-11-18）：只有第二版风格（用户："参考第二版"），两种 ?inv= 下都建 */
export const INTERIORS_CIVIC: InteriorDef[] = [INTERIOR_CITYHALL, INTERIOR_BANK, INTERIOR_DINER];

export const INTERIORS: InteriorDef[] = [...(INTERIOR_VERSION === 2 ? INTERIORS_V2 : INTERIORS_V1), ...INTERIORS_CIVIC];
