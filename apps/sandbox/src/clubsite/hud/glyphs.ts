// 卡片（clubsite/hud/sheet.ts 的半屏卡：人物卡、名册看板）用的像素图：能画就不写。
// 和 icons.ts 同一套画法：字符格子、颜色键见 colors.ts，只画里面的形状，1 纹素墨色描边和深影由 sprite.ts 加。
// - ACT：互动按钮（≤ 16×16），卡片底下一排
// - GLYPH：9×9 的小字形 —— 在干什么、属性、牵连、心情脸
// - TINY：5×5 不描边的墨色小图（代价那一行：时钟、金币）+ 3×5 点阵数字（DIGITS）
// 暖色不比草帽（≈ #ffcd81）艳：灯泡、闪电、星用草帽色 X / x，金币用干草色。
import { COIN_KEYS, KEYS, PALE_SUN } from './colors';
import { MOODS } from './icons';
import type { Sprite } from './sprite';

const S = (...rows: string[]): Sprite => ({ rows });

/** 互动按钮（卡片底下一排，2 倍纹素） */
export const ACT = {
  /** 聊几句：对话框 + 三个点（同 icons.ts 的说话，缩到 14 宽） */
  chat: S(
    '..WWWWWWWWWW..',
    '.WWWWWWWWWWWW.',
    'WWWWWWWWWWWWWw',
    'WWKKWWKKWWKKWw',
    'WWKKWWKKWWKKWw',
    'WWWWWWWWWWWWWw',
    '.wWWWWWWWWWWw.',
    '..wwWWwwwwww..',
    '...wWw........',
    '..wWw.........',
    '.ww...........',
  ),
  /** 请喝一杯：一杯柠檬水（玻璃杯、吸管、一片柠檬） */
  treat: S(
    '..........ZZ',
    '.........Zz.',
    '........Zz..',
    '.ZZZZZZZZZZz',
    '.ZXXXXXXzXXz',
    '.ZXGGXXzXXXz',
    '.ZXGgXXzXXXz',
    '.ZXXXXzXXXXz',
    '..ZXXXzXXXz.',
    '..ZXXXXXXXz.',
    '..ZxxxxxxXz.',
    '..ZxxxxxxXz.',
    '...zzzzzzz..',
  ),
  /** 孩子：一根冰棍 */
  pop: S(
    '..RRRR..',
    '.RWRRRr.',
    '.RWRRRr.',
    '.RRRRRr.',
    '.RRRRrr.',
    '.RRRRrr.',
    '.rrrrrr.',
    '...Tt...',
    '...Tt...',
    '...Tt...',
    '...tt...',
  ),
  /** 打一局：球拍 + 网球 */
  rally: S(
    '.....SSSS.....',
    '....SWsWsS....',
    '...SWsWsWsS...',
    '...SsWsWsWS...',
    '...SWsWsWsS...',
    '....SsWsWS....',
    '.....SSSS.....',
    '......tT......',
    '......tT...GG.',
    '......tT..GGWg',
    '......TT..GWgg',
    '......uu...gg.',
  ),
  /** 听听意见：一只灯泡（草帽色，不抢焦点） */
  ask: S(
    '...XXXXX...',
    '..XWWXXXX..',
    '.XWXXXXXXx.',
    '.XWXXXXXXx.',
    '.XXXXXXXxx.',
    '..XXXXXxx..',
    '...XxXxx...',
    '...SSSSs...',
    '...sSSss...',
    '...SSSSs...',
    '....ddd....',
  ),
  /** 送个小礼物：蓝盒子、红丝带 */
  gift: S(
    '..RR..RR..',
    '.R.mRRm.R.',
    '..RRRRRR..',
    'BBBBRRBBBB',
    'BBBBRRBBBn',
    'nnnnmmnnnn',
    '.bbbRmbbb.',
    '.bbbRmbbb.',
    '.bbbRmbbb.',
    '.bbbRmbbb.',
    '.nnnmmnnn.',
  ),
  /** 发条消息：信封 + 一颗红心封口 */
  message: S(
    'WWWWWWWWWWWWWW',
    'wWWWWWWWWWWWWw',
    'WwWWWWWWWWWWwW',
    'WWwWWWWWWWWwWw',
    'WWWwWWWWWWwWWw',
    'WWWWwWRRWwWWWw',
    'WWWWWwRrwWWWWw',
    'WWWWWWWWWWWWWw',
    'WWWWWWWWWWWWWw',
    'wwwwwwwwwwwwww',
  ),
  /** 走过去（不当面时当面的动作都先走过去）：两只脚印 */
  walk: S(
    '........TT..',
    '.......TTTt.',
    '.......TTTt.',
    '.TT....TTTt.',
    'TTTt...tTtt.',
    'TTTt....tt..',
    'TTTt........',
    'tTtt...Tt...',
    '.tt....tt...',
    '............',
    '.Tt.........',
    '.tt.........',
  ),
  /** 关上卡片 */
  close: S('WW....WW', 'WWW..WWW', '.WWWWWW.', '..WWWW..', '..WWWW..', '.WWWWWW.', 'WWW..WWW', 'WW....WW'),
  /** 展开第二层 / 收起 */
  up: S('....W....', '...WWW...', '..WWWWW..', '.WWW.WWW.', 'WWW...WWW'),
  down: S('WWW...WWW', '.WWW.WWW.', '..WWWWW..', '...WWW...', '....W....'),
} as const;
export type ActIcon = keyof typeof ACT;

/** 9×9 小字形 */
export const GLYPH = {
  ...MOODS,
  eye: S('.........', '..WWWWW..', '.WWWaaWWw', 'WWWaKKaWw', 'WWWaKKaWw', '.WWWaaWw.', '..wwwww..', '.........'),
  feet: S(
    '......TT.',
    '.....TTTt',
    '.TT..TTTt',
    'TTTt.tTtt',
    'TTTt..tt.',
    'tTtt.....',
    '.tt..Tt..',
    '.....tt..',
    '.Tt......',
  ),
  dumbbell: S('.........', 'SS.....SS', 'SSs...SSs', 'SSsSSSSSs', 'SSsssssSs', 'SSs...SSs', 'ss.....ss'),
  bolt: S('....XXX..', '...XXx...', '..XXx....', '.XXXXXX..', '....XXx..', '...XXx...', '..XXx....', '.Xx......'),
  bubble: S('.WWWWWWW.', 'WWWWWWWWw', 'WKWWKWWKw', 'WWWWWWWWw', '.wwWWwww.', '..wWw....', '.ww......'),
  coin: {
    ...S('..YYYYY..', '.YWWYYYy.', 'YWYyyyYYy', 'YWyYYYWyy', 'YYyYYYWyy', 'YYYWWWYyy', '.yYYYYyy.', '..yyyyy..'),
    keys: COIN_KEYS,
  },
  flag: S('S........', 'SRRRRRR..', 'SRWRRRRr.', 'SRRRRRRr.', 'SRRRRrr..', 'Srrrr....', 'S........', 'd........'),
  house: S(
    '....R....',
    '...RRR...',
    '..RRRRR..',
    '.RRRRRRr.',
    'RRRRRRRrr',
    '.WWWWWWw.',
    '.WWWTTWw.',
    '.WWWTtWw.',
    '.wwwTtww.',
  ),
  racket: S(
    '....SSS..',
    '...SWsWS.',
    '...SsWsS.',
    '...SWsWS.',
    '....SSS..',
    '...tT....',
    '..tT.....',
    '.tT......',
    '.t.......',
  ),
  smile: S('..XXXXX..', '.XXXXXXx.', 'XXKXXKXXx', 'XXKXXKXXx', 'XXXXXXXXx', 'XKXXXXKXx', '.XKKKKXx.', '..xxxxx..'),
  meh: S('..XXXXX..', '.XXXXXXx.', 'XXKXXKXXx', 'XXKXXKXXx', 'XXXXXXXXx', 'XXKKKKXXx', '.XXXXXXx.', '..xxxxx..'),
  sad: S('..XXXXX..', '.XXXXXXx.', 'XXKXXKXXx', 'XXKXXKXXx', 'XXXXXXXXx', 'XXKKKKXXx', '.XKXXXKx.', '..xxxxx..'),
  star: S('....X....', '...XXx...', 'XXXXXXXXx', '.XXXXXXx.', '..XXXXx..', '..XXxXx..', '.XXx.xXx.', '.Xx...xx.'),
  badge: S('...nn....', '.BBBBBBB.', '.WWWWWWw.', '.WvvWWWw.', '.WddWssw.', '.WddWWWw.', '.WWWssWw.', '.wwwwwww.'),
  clock: S('..WWWWW..', '.WWWKWWWw', 'WWWWKWWWw', 'WWWWKWWWw', 'WWWWKKKWw', 'WWWWWWWWw', '.WWWWWWw.', '..wwwww..'),
  broom: S(
    '.......T.',
    '......T..',
    '.....T...',
    '....t....',
    '..XXX....',
    '.XXXXx...',
    'XXXxXx...',
    'XxXxx....',
    '.x.x.....',
  ),
  sun: { ...S('...L...', '.L.L.L.', '..LLL..', 'LLLLLLL', '..LLL..', '.L.L.L.', '...L...'), keys: { L: PALE_SUN } },
  moon: S('..WWW..', '.WWw...', 'WWw....', 'WWw....', 'WWw....', '.WWw...', '..WWW..'),
  // ── 地点（名册看板按地点分簇的打头小图） ──
  car: S('..BBBBB..', '.BAAbAAB.', 'BBBBBBBBn', 'BWBBBBWBn', 'nnnnnnnnn', '.dd...dd.'),
  bell: S('....X....', '...XXx...', '..XXXXx..', '..XWXXx..', '.XWXXXXx.', '.XXXXXXx.', 'XXXXXXXXx', 'ttttttttt'),
  paddle: S(
    '.SSSS....',
    'SBBBBS...',
    'SBWBBS...',
    'SBBBBS...',
    'SBBBbS...',
    '.SSSS....',
    '...TT.GG.',
    '...Tt.Gg.',
    '...tt....',
  ),
  fountain: S('..A.A.A..', '.A.AWA.A.', 'A..AWA..A', 'A...A...A', 'SSSSSSSSS', 'SAAAAAAAd', 'SaaaaaaAd', '.ddddddd.'),
  trophy: S('XXXXXXXXX', 'XWXXXXXXx', '.XXXXXXx.', '..XXXXx..', '...XXx...', '....X....', '...XXx...', '..xxxxx..'),
  clay: {
    ...S(
      '...GGG...',
      '.WGGGGGW.',
      '.GWGGGWg.',
      'GGGWGWggg',
      'GGGWGWggg',
      'GGGWgWggg',
      '.gWgggWh.',
      '.Wgggghh.',
      '...hhh...',
    ),
    keys: { G: KEYS.R, g: KEYS.r, h: KEYS.m },
  },
  /** 消费力：一只购物袋（不用金币，免得和"花钱"撞） */
  bag: S('..T...T..', '..T...T..', '.TRRRRRT.', '.RRWRRRRr', '.RWRRRRRr', '.RRRRRRRr', '.RRRRRRrr', '.rrrrrrr.'),
  /** 好感：一颗心（满 / 半 / 空） */
  heart: S('.RR.RR.', 'RWRRRRr', 'RRRRRRr', '.RRRRr.', '..RRr..', '...r...'),
  heartHalf: S('.RR.vv.', 'RWRRvvv', 'RRRRvvv', '.RRRvv.', '..Rvv..', '...v...'),
  heartOff: S('.vv.vv.', 'vvvvvvv', 'vvvvvvv', '.vvvvv.', '..vvv..', '...v...'),
} as const;
export type GlyphId = keyof typeof GLYPH;

/** 5×5 不描边的小图（代价那一行），K = 墨 */
export const TINY: Record<string, Sprite> = {
  clock: S('.KKK.', 'K.K.K', 'K.KKK', 'K...K', '.KKK.'),
  coin: { ...S('.yyy.', 'yYYYy', 'yYyYy', 'yYYYy', '.yyy.'), keys: { Y: COIN_KEYS.Y, y: 0x8a5a3a } },
};

/** 3×5 点阵数字（同 index.ts 动作键的角标） */
export const DIGITS: Record<string, string> = {
  '0': '###|#.#|#.#|#.#|###',
  '1': '.#.|##.|.#.|.#.|###',
  '2': '##.|..#|.#.|#..|###',
  '3': '##.|..#|.#.|..#|##.',
  '4': '#.#|#.#|###|..#|..#',
  '5': '###|#..|##.|..#|##.',
  '6': '.##|#..|###|#.#|###',
  '7': '###|..#|.#.|.#.|.#.',
  '8': '###|#.#|###|#.#|###',
  '9': '###|#.#|###|..#|##.',
  '/': '..#|..#|.#.|#..|#..',
  '+': '...|.#.|###|.#.|...',
  '-': '...|...|###|...|...',
  '.': '...|...|...|...|.#.',
};
