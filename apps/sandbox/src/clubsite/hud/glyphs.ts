// 卡片（clubsite/hud/sheet.ts 的半屏卡：人物卡、名册看板）用的像素图：能画就不写。
// 和 icons.ts 同一套画法：字符格子、颜色键见 colors.ts，只画里面的形状，1 纹素墨色描边和深影由 sprite.ts 加。
// - ACT：互动按钮（≤ 16×16），卡片底下一排
// - GLYPH：9×9 的小字形 —— 在干什么、属性、牵连、心情脸
// - TINY：5×5 不描边的墨色小图（代价那一行：时钟、金币）+ 3×5 点阵数字（DIGITS）
// 暖色不比草帽（≈ #ffcd81）艳：灯泡、闪电、星用草帽色 X / x，金币用干草色。
import { COIN_KEYS, PALE_SUN } from './colors';
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
  /** 打一局：一颗球飞过球网（球拍只留给"球技"） */
  rally: S(
    '......GG......',
    '.....GGWg.....',
    '.....GWgg.....',
    '......gg......',
    '..............',
    'SWWWWWWWWWWWWS',
    'SsdsdsdsdsdsdS',
    'SdsdsdsdsdsdsS',
    'SsdsdsdsdsdsdS',
    'S............S',
    'S............S',
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
  dumbbell: S('.S.....S.', 'SS.....SS', 'SSdddddSS', 'SSdddddSS', 'SS.....SS', '.s.....s.'),
  bolt: S('....XXX..', '...XXx...', '..XXx....', '.XXXXXX..', '....XXx..', '...XXx...', '..XXx....', '.Xx......'),
  coin: {
    ...S('..YYYYY..', '.YWWYYYy.', 'YWYyyyYYy', 'YWyYYYWyy', 'YYyYYYWyy', 'YYYWWWYyy', '.yYYYYyy.', '..yyyyy..'),
    keys: COIN_KEYS,
  },
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
  sun: { ...S('...L...', '.L.L.L.', '..LLL..', 'LLLLLLL', '..LLL..', '.L.L.L.', '...L...'), keys: { L: PALE_SUN } },
  moon: S('..WWW..', '.WWw...', 'WWw....', 'WWw....', 'WWw....', '.WWw...', '..WWW..'),
  /** 牵连（朋友、同事、旧事）：两个扣在一起的环 */
  link: S('.AAA.....', 'A...A....', 'A..cccc..', 'A..cA..c.', '.AAAA..c.', '...c...c.', '....ccc..'),
  // ── 一图一义（第三轮）：属性、牵连、在干什么、地点四组互不重用；地点图在 places.ts（那块地方的缩小剪影） ──
  /** 对手：两把交叉的剑（闪电只留给"体能"） */
  swords: S(
    'S.......S',
    'SS.....SS',
    '.SS...SS.',
    '..SS.SS..',
    '...SSS...',
    '..SS.SS..',
    't.S...S.t',
    '.tt...tt.',
    't.t...t.t',
  ),
  /** 社交：并排的两个人 */
  pair: S(
    '.TT...uu.',
    'TTTT.uuuu',
    'FFFF.ffff',
    'FKFK.fKfK',
    'FFFF.ffff',
    '.FF...ff.',
    'BBBB.RRRR',
    'BBBB.RRRR',
    'bbbb.rrrr',
  ),
  /** 搭档（双打）：两把交叉的球拍 */
  rackets: S(
    '.SS...SS.',
    'SWWS.SWWS',
    'SWWS.SWWS',
    '.SSt.tSS.',
    '...tTt...',
    '...TtT...',
    '..t...t..',
    '.t.....t.',
    't.......t',
  ),
  /** 耐心：一只乌龟（沙漏只留给"在等"） */
  turtle: S('.........', '..qqqq...', '.qPPPPq..', 'qPPqPPPq.', 'qPqPPqPPP', 'qqqqqqqPK', '.p...p...', '.p...p...'),
  /** 消费：钱包里露出一张钞票 */
  wallet: S('..PPPPP..', '..PpPpP..', 'tttttttt.', 'tTTTTTTtt', 'tTTTTTXXt', 'tTTTTTXXt', 'tTTTTTTtt', 'uuuuuuuu.'),
  /** 忠诚：一只锚（留得住） */
  anchor: S(
    '...SSS...',
    '...S.S...',
    '...SSS...',
    '.SSSSSSS.',
    '....S....',
    '....S....',
    'S...S...S',
    'SS..S..SS',
    '.SSSSSSS.',
  ),
  /** 在吃：叉子和刀 */
  fork: S(
    'S.S.S..S.',
    'S.S.S.SS.',
    'S.S.S.SS.',
    'SSSSS.SS.',
    '.SSS..SS.',
    '..S...SS.',
    '..S....S.',
    '..S....S.',
    '..S....S.',
  ),
  /** 在游泳：水面上露着的头 */
  swim: S('...TTT...', '...FFF...', '.AA.F.AA.', 'A..AAA..A', '.........', '.AA...AA.', 'A..AAA..A'),
  /** 在干活：写字板 */
  clip: S(
    '...SSS...',
    '.ttSSStt.',
    '.tWWWWWt.',
    '.tWddWWt.',
    '.tWWWWWt.',
    '.tWdddWt.',
    '.tWWWWWt.',
    '.tWddWWt.',
    '.ttttttt.',
  ),
  /** 旧事：一本摊开的书 */
  book: S('BBBB.BBBB', 'BWWWBWWWB', 'BWdWBWdWB', 'BWWWBWWWB', 'BWdWBWdWB', 'BWWWBWWWB', 'BBBBBBBBB', '.nnn.nnn.'),
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
