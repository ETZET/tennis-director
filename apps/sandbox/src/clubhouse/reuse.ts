// 复用的资产（原样 import，不复制）：clubplaza 的那份（= clubdesk 的植物、人、长椅、陶罐、大门 + clubsite/people 的人和新姿势）。
// 会所里外的人（会员、球员、店员、理疗师、总监）都是 clubsite/people 的；门口、拱廊下的陶罐 + 龙舌兰、蒲葵、灌木是 clubdesk / clubsite 的。
// 这些文件归各自的场景管：要改样子就复制到 src/clubhouse/assets/ 再改（同名的本地资产优先），不要改那边的。
import { REUSED as PLAZA_REUSED } from '../clubplaza/reuse';
import type { AssetBuild } from './ctx';

export const REUSED: Record<string, AssetBuild> = {
  ...(PLAZA_REUSED as unknown as Record<string, AssetBuild>),
};
