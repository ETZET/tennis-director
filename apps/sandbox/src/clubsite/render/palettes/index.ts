// 配色（palette-lab，2026-11-08）：?pal=<id> 换一套配色。默认是用户选定的 6 午后金光（golden）；?pal=current 是原来的沙漠配色。
// 方案是"覆盖层"：palette.ts 的原值不动，main.ts 建材质时把颜色过一遍这里的 grade（按材质组 / 单个材质覆盖）。
// 复用的 desert3d-v2 资产里写死的颜色（灌木叶、龙舌兰……）也走同一个 grade（ctx.mat 的 extra、ctx.mats.toon 都包了），
// 所以整个画面一起换，不只是沙。各方案的意图、关键色、量出来的数：docs/lab/2026-11-07-3d-pixel/palette-lab.md。

import type { Pal } from '../palette';
import type { Mats, ToonOpts } from '../toon';
import { scheme as golden } from './golden';
import { type Grade, gradeOpts, IDENTITY, mergeGrade } from './grade';
import { scheme as natural } from './natural';
import { scheme as noon } from './noon';
import { scheme as pastel } from './pastel';
import { scheme as resort } from './resort';
import { scheme as teal } from './teal';
import type { Group, Scheme } from './types';
import { scheme as wells } from './wells';

export type { Scheme } from './types';

/** 现在的配色（基线）：不调任何东西；选它 = 不带 ?pal */
export const current: Scheme = {
  id: 'current',
  name: '现在',
  hint: '金杏沙 + 梅紫影 + 靛紫崖（desert3d-v2 原样）',
  grade: IDENTITY,
  sky: { top: 0x5fb0e8, horizon: 0xa8dcf0 },
  sun: 0xfff0d8,
  edgeTint: [0.5, 0.55, 0.78],
};

export const SCHEMES: Scheme[] = [current, natural, teal, pastel, noon, wells, golden, resort];

/** 定下来的默认配色（2026-11-08 用户选了 6 午后金光）：不带 ?pal 就用它 */
export const DEFAULT_SCHEME_ID = 'golden';

/** URL 的 pal → 方案；不带 pal = 默认（午后）；pal=current → null（走原来的路径，一个字节都不变）；不认识的 → 默认 */
export function schemeById(id: string | null): Scheme | null {
  if (id === 'current') return null;
  return (
    SCHEMES.find((s) => s.id === (id ?? DEFAULT_SCHEME_ID)) ?? SCHEMES.find((s) => s.id === DEFAULT_SCHEME_ID) ?? null
  );
}

/**
 * 别的场景（clubpark / clubdesk）在 clubfront 的表上加的材质名：clubfront 的 Pal 里没有，这里单列，
 * 好让它们也按组调色（这些场景的 main.ts 把自己的 key 传进 gradeFor / schemeOpts）。
 */
type SceneKey =
  | 'lotAsphalt'
  | 'lotPaint'
  | 'kerb'
  | 'glass'
  | 'steel'
  | 'carCream'
  | 'carRed'
  | 'carNavy'
  | 'carMint'
  | 'carSilver'
  | 'carGold'
  | 'granite'
  | 'slate'
  | 'brass'
  // clubmap / clubmap2 的场地、草（clubdesk 和新的小场景都用）
  | 'pickle'
  | 'clay'
  | 'lawn'
  | 'lawnStripe'
  | 'green'
  | 'seat';

/** 每个调色板名字归哪组 */
const GROUP: Partial<Record<keyof Pal | SceneKey, Group>> = {
  sand: 'ground',
  sandHigh: 'ground',
  sandDrift: 'ground',
  sandPatch: 'ground',
  path: 'ground',
  stair: 'ground',
  flagstone: 'ground',
  cliff: 'rock',
  cliffLip: 'rock',
  underside: 'rock',
  rock: 'rock',
  rockCool: 'rock',
  adobe: 'wall',
  concrete: 'wall',
  tile: 'terracotta',
  cap: 'terracotta',
  pot: 'terracotta',
  palm: 'plants',
  sage: 'plants',
  olive: 'plants',
  yellowGreen: 'plants',
  silverBlue: 'plants',
  cactus: 'plants',
  palmSkirt: 'dry',
  palmTrunk: 'dry',
  branch: 'dry',
  dryTuft: 'dry',
  dryGrass: 'dry',
  wood: 'dry',
  woodWeathered: 'dry',
  timber: 'dry',
  court: 'court',
  courtBleach: 'court',
  courtBleachCore: 'court',
  surround: 'court',
  line: 'court',
  asphalt: 'court',
  courtCrack: 'court',
  surroundCrack: 'court',
  surroundLight: 'court',
  net: 'court',
  netTape: 'court',
  counter: 'club',
  counterTop: 'club',
  canvas: 'club',
  canvasStripe: 'club',
  signBoard: 'club',
  signPaint: 'club',
  ironwork: 'club',
  windscreen: 'club',
  jug: 'club',
  fabric: 'club',
  fabricStripe: 'club',
  skinLight: 'people',
  skinTan: 'people',
  skinDark: 'people',
  hair: 'people',
  clothWhite: 'people',
  clothRed: 'people',
  /** 冷色衣服跟 club 组（2026-11-08 第二轮：蓝衬衫不被午后染成灰紫 #737d9d，暗档留靛蓝）；暖色衣服、白衣服留在 people */
  clothBlue: 'club',
  clothPurple: 'club',
  clothTeal: 'club',
  straw: 'people',
  flowerYellow: 'accent',
  flowerRed: 'accent',
  flowerPurple: 'accent',
  ball: 'accent',
  toolOrange: 'accent',
  rust: 'accent',
  /** 漆过的金属（围网立柱、长椅腿）：俱乐部的青绿漆 → club 组（2026-11-08 第二轮；全局 grade 把它染成灰 #6c7d79、暗档褐） */
  metal: 'club',
  water: 'water',
  foam: 'water',
  // ── clubpark（停车场）：2026-11-08 ──
  /** 沥青和它上面的漆跟球场外圈的 asphalt 一组：午后亮档只染 10%（原值就是想要的暖灰），暗档是冷石板灰 */
  lotAsphalt: 'court',
  lotPaint: 'court',
  /** 路缘 = 水泥 */
  kerb: 'wall',
  /** 车窗、岗亭窗：暗档留靛蓝（阴影里的玻璃还像玻璃，不变成褐色） */
  glass: 'club',
  steel: 'accent',
  /** 冷色车漆跟 club 组（海军蓝不被染成薰衣草、薄荷的暗面留蓝）；暖色 / 浅色车漆跟 accent（暗面和全场的影子同一家玫瑰褐） */
  carNavy: 'club',
  carMint: 'club',
  carCream: 'accent',
  carRed: 'accent',
  carSilver: 'accent',
  carGold: 'accent',
  // ── clubdesk（前台）──
  /** 碎花岗岩小路 = 步道一家 */
  granite: 'ground',
  /** 黑板：亮档不被染成灰绿、暗档留青蓝 */
  slate: 'club',
  brass: 'accent',
  // ── 第二轮（2026-11-08）：午后配色下的主角彩度 ──
  /** 匹克球场面：跟硬地内场一组（亮档只往金色染 10%；全局 grade 染 25% 会把蓝染成灰青，画面 S 只剩 0.15） */
  pickle: 'court',
  /** 草坪、果岭：跟植物一组（暗档跟着草的绿走 → 深绿；全局 grade 把草影染成褐灰 #5f5550） */
  lawn: 'plants',
  lawnStripe: 'plants',
  green: 'plants',
  /** 看台座椅（俱乐部绿）：跟 club 一组，暗档留青蓝 */
  seat: 'club',
};

/** 调试色和占位永远不调 */
const ALWAYS_KEEP = new Set<keyof Pal>(['placeholder', 'navMark']);

/** 这个材质在这个方案里的调法；null = 原样 */
export function gradeFor(s: Scheme, key?: keyof Pal): Grade | null {
  if (key && ALWAYS_KEEP.has(key)) return null;
  const k = key ? s.keys?.[key] : undefined;
  if (k === 'keep') return null;
  const grp = key ? GROUP[key] : undefined;
  return mergeGrade(mergeGrade(s.grade, grp ? s.groups?.[grp] : undefined), k);
}

/** ctx.mat(key, extra) 合好的参数 → 这个方案的参数 */
export function schemeOpts(s: Scheme, key: keyof Pal | undefined, o: ToonOpts, color?: number): ToonOpts {
  const g = gradeFor(s, key);
  return g ? gradeOpts(o, g, color) : o;
}

/** 包一层 mats：资产直接 ctx.mats.toon(颜色, …) 的也跟着方案走（不知道材质名 → 只吃全局 grade） */
export function schemeMats(s: Scheme, mats: Mats): Mats {
  const g = s.grade;
  return {
    ...mats,
    toon: (color, opts = {}) => {
      const c = typeof color === 'number' ? color : undefined;
      return mats.toon(color, gradeOpts(opts, g, c));
    },
  };
}
