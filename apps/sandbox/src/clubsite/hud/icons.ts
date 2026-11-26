// 界面的像素图标（新的美术素材）：字符格子，颜色键见 colors.ts（每种材质 大写 = 亮档、小写 = 中 / 暗档）。
// 只画里面的形状：1 纹素靛黑描边和下面 1 纹素的深影由 sprite.ts 自动加。光从左上来：左上亮、右下暗（同场景的太阳在后上方）。
// 大图标（按钮）里面 ≤ 18×18，加描边 20×20、投影 21 高，放大 2 倍 = 40×42 CSS 像素，按钮框再留边到 ≥ 48。
// 心情泡（场景里人头上）的字形 7×7，放进 13×12 的气泡里。
import type { Sprite } from './sprite';

const S = (...rows: string[]): Sprite => ({ rows });

/** 按钮图标 */
export const ICONS = {
  /** 名册：夹板 + 名单（三个人三种颜色的小方块） */
  roster: S(
    '......SSSS......',
    '.....SddddS.....',
    '.TTTTSSSSSSTTTT.',
    '.TWWWWWWWWWWWWt.',
    '.TWnnnnnnnnWWvt.',
    '.TWWWWWWWWWWWvt.',
    '.TWRWvvvvvvvWvt.',
    '.TWWWWWWWWWWWvt.',
    '.TWBWvvvvvvWWvt.',
    '.TWWWWWWWWWWWvt.',
    '.TWGWvvvvvvvWvt.',
    '.TWWWWWWWWWWWvt.',
    '.TWRWvvvvvWWWvt.',
    '.TWWWWWWWWWWWvt.',
    '.Twwwwwwwwwwwwt.',
    '.tttttttttttttt.',
    '..uuuuuuuuuuuu..',
  ),
  /** 地图：三折的纸，中间一折在影子里；绿地、蓝水、红色虚线路线、红针 */
  map: S(
    'WWWWWW......WWWWWW',
    'WWWWWWwwwwwwWWWWWW',
    'WPPWWWwwwwwwWWWAAw',
    'WPPPWWwwwwwwWWAAAw',
    'WWPWRWwwwwwwWWWAAw',
    'WWWWWRwwwwwwWWWWWw',
    'WWWWWWrwwwwwWWWWWw',
    'WWWWWWwwrwwwWWRRWw',
    'WWWWWWwwwwrwWRRWRw',
    'WWAAWWwwwwwwrRRRRw',
    'WAAAWWwwwPpwWRRRRw',
    'WWAAWWwwPPpwWWRRWw',
    'WWWWWWwwwppwWWWRWw',
    'wwwwwwwwwwwwwwwwww',
    '......vvvvvv......',
  ),
  /** 说话：奶油色对话框 + 三个点 */
  talk: S(
    '..WWWWWWWWWWWWW...',
    '.WWWWWWWWWWWWWWW..',
    'WWWWWWWWWWWWWWWWw.',
    'WWWWWWWWWWWWWWWWw.',
    'WWWKKWWWKKWWWKKWw.',
    'WWWKKWWWKKWWWKKWw.',
    'WWWWWWWWWWWWWWWWw.',
    'WWWWWWWWWWWWWWWww.',
    '.wwWWWWWWWWWWwww..',
    '...wwwWWwwwwww....',
    '.....wWw..........',
    '....wWw...........',
    '...ww.............',
  ),
  /** 推球包车：铁丝筐里装满网球，两个轮子 */
  cart: S(
    '..................',
    '...GGgGGgGGg......',
    '..GGgGGgGGgGG.....',
    '.SGgGGgGGgGGgS....',
    '.SsSsSsSsSsSsS....',
    '.SGGgGGgGGgGGS....',
    '.SsSsSsSsSsSsS....',
    '.SgGGgGGgGGgGS....',
    '.SsSsSsSsSsSsS.SS.',
    '..SsssssssssssSsS.',
    '...s.........sS...',
    '...s.........s....',
    '..ddd.......ddd...',
    '.dSSSd.....dSSSd..',
    '.dSdSd.....dSdSd..',
    '..ddd.......ddd...',
  ),
  /** 扫帚：斜着的木柄 + 草扎的头 */
  broom: S(
    '..............TT',
    '.............Ttu',
    '............Ttu.',
    '...........Ttu..',
    '..........Ttu...',
    '.........Ttu....',
    '........Ttu.....',
    '.......Ttu......',
    '.....RRtu.......',
    '....XXRRr.......',
    '...XXXXRr.......',
    '..XXXXxxx.......',
    '.XXXxXxxx.......',
    'XXxXxXxx........',
    'XxXxXxx.........',
    '.x.x.x..........',
  ),
  /** 水滴（浇水、喝水） */
  drop: S(
    '.....AA.....',
    '.....AA.....',
    '....AAAa....',
    '....AAAa....',
    '...AAAAaa...',
    '..AWAAAAaa..',
    '.AWWAAAAaac.',
    '.AWAAAAAaac.',
    'AAAAAAAAaacc',
    'AAAAAAAaaacc',
    'aAAAAAaaaccc',
    '.aaaaaaaccc.',
    '..acccccc...',
  ),
  /** 车钥匙：金色的钥匙 + 蓝色的钥匙牌 */
  key: S(
    '.....YYYY.........',
    '....YyyyYY........',
    '...Yy....yY.......',
    '...Yy....yo.......',
    '...Yy....yo.......',
    '....YYyyoo........',
    '.....YYyo.........',
    '......Yyo.........',
    '......Yyo.........',
    '......Yyyy........',
    '......Yyo.........',
    '......Yyyyy.......',
    '......Yyo.........',
    '......Yyo.........',
    '......YYo.........',
    '.......o..........',
  ),
  /** 电梯：门框里一上一下两个箭头 */
  lift: S(
    'ssssssssssssss',
    'sSSSSSSSSSSSSd',
    'sSbbbbbbbbbbSd',
    'sSbbbbWbbbbbSd',
    'sSbbbWWWbbbbSd',
    'sSbbWWWWWbbbSd',
    'sSbbbbbbbbbbSd',
    'sSbbbbbbbbbbSd',
    'sSbbWWWWWbbbSd',
    'sSbbbWWWbbbbSd',
    'sSbbbbWbbbbbSd',
    'sSbbbbbbbbbbSd',
    'sSSSSSSSSSSSSd',
    'dddddddddddddd',
  ),
  /** 网球 */
  ball: S(
    '....GGGG....',
    '..GGGGGGGG..',
    '.WGGGGGGGgW.',
    '.GWGGGGGgWg.',
    'GGGWGGGGWggg',
    'GGGWGGGGWggg',
    'GGGWGGGgWggg',
    'GGGWGGggWggg',
    '.gWGggggWgh.',
    '.Wggggggghh.',
    '..hgggghhh..',
    '....hhhh....',
  ),
  /** 扳手（修东西） */
  wrench: S(
    '..........SS....',
    '.........SSs.SS.',
    '........SSs..SSd',
    '........Ss....Sd',
    '........Ss...SSd',
    '.......SSSsSSSd.',
    '......SSSsssdd..',
    '.....SSsd.......',
    '....SSsd........',
    '...SSsd.........',
    '..SSsd..........',
    '.SSsd...........',
    'SSsd............',
    'Ssd.............',
    '.d..............',
  ),
  /** 球拍（别的活的默认图标） */
  racket: S(
    '......BBBBB.....',
    '....BBWWWWWBb...',
    '...BWdWdWdWdBb..',
    '..BWdWdWdWdWdBb.',
    '..BdWdWdWdWdWdb.',
    '.BWdWdWdWdWdWdBb',
    '.BdWdWdWdWdWdWbn',
    '.BWdWdWdWdWdWdbn',
    '.bdWdWdWdWdWdWbn',
    '..bWdWdWdWdWdbn.',
    '..bbdWdWdWdWbbn.',
    '...nbbWdWdbbnn..',
    '....nnbbbbnn....',
    '.......TT.......',
    '.......Tt.......',
    '.......RR.......',
    '.......Rr.......',
    '.......rm.......',
  ),
  /** 手（拿起 / 放下） */
  hand: S(
    '.....FF.........',
    '..FF.FFf.FF.....',
    '..FFfFFf.FFf....',
    '..FFfFFfFFFf....',
    '..FFfFFfFFFf.FF.',
    '..FFfFFfFFFfFFf.',
    '..FFFFFFFFFfFFf.',
    '..FFFFFFFFFFFf..',
    '..FFFFFFFFFFFf..',
    '..FFFFFFFFFFf...',
    '...FFFFFFFFFf...',
    '...fFFFFFFFf....',
    '....fffffff.....',
    '....BBBBBBBB....',
    '....bbbbbbbb....',
  ),
  /** 金币（右上的钱） */
  coin: S(
    '..YYYYY..',
    '.YWWYYYy.',
    'YWYyyyYYy',
    'YWyYYYWyy',
    'YYyYYYWyy',
    'YYyYYYWyy',
    'YYYWWWYyy',
    '.yYYYYyy.',
    '..yyyyy..',
  ),
  /** 调试（左下角的小点） */
  dots: S('S.S.S'),
} as const;

export type IconId = keyof typeof ICONS;

/** 心情泡里的字形（7×7） */
export const MOODS = {
  '!': S('...R...', '..RRr..', '..RRr..', '..RRr..', '...r...', '.......', '..RRr..'),
  '?': S('.BBBBb.', 'BBb.BBb', '....BBb', '...BBb.', '..BBb..', '.......', '..BBb..'),
  '…': S('.......', '.......', '.......', '.......', '.......', 'KK.KK.K', 'KK.KK.K'),
  wrench: S('...SS.S', '...Ss.S', '...SSSs', '..SSsd.', '.SSs...', 'SSs....', 'Sd.....'),
  ball: S('..GGG..', '.WGGgW.', 'GGWGWgg', 'GGWGWgg', 'GGWgWgg', '.WggghW', '..hhh..'),
  heart: S('.RR.RR.', 'RWRRRRr', 'RRRRRRr', 'RRRRRrr', '.RRRrr.', '..Rrr..', '...r...'),
  note: S('...KKKK', '...K..K', '...K..K', '...K..K', '.KKK.KK', 'KKKKKKK', '.KK..K.'),
  drop: S('...A...', '..AAa..', '.AWAAa.', '.AWAAa.', 'AAAAaac', 'aAAaacc', '.accc..'),
  zzz: S('BBBB...', '..Bb...', '.Bb....', 'BBBB...', '....BBb', '.....Bb', '....BBb'),
  cup: S('.......', '.RRRR..', '.RTTRRR', '.RRRR.R', '.RRrrRR', '.rrrr..', '.......'),
  /** 不耐烦（脏、满、臭）：漫画里的青筋 */
  grr: S('.RR.RR.', 'RR...RR', '.......', '.......', '.......', 'RR...RR', '.RR.RR.'),
  /** 等：沙漏 */
  wait: S('ttttttt', '.WWWWW.', '..WYW..', '...Y...', '..WYW..', '.WYYYW.', 'ttttttt'),
} as const;

export type MoodId = keyof typeof MOODS;

/** 心情泡：奶油色圆角框 + 左下的小尾巴（字形放在 (3,2)） */
export const BUBBLE = S(
  '..WWWWWWWWW..',
  '.WWWWWWWWWWW.',
  'WWWWWWWWWWWWW',
  'WWWWWWWWWWWWW',
  'WWWWWWWWWWWWW',
  'WWWWWWWWWWWWW',
  'WWWWWWWWWWWWW',
  'WWWWWWWWWWWWW',
  'WWWWWWWWWWWWw',
  '.wWWWWWWWWWw.',
  '..wwWWwwwww..',
  '...wWw.......',
  '..ww.........',
);

/** 把字形（7×7）叠进心情泡的格子里 */
export function moodSprite(id: MoodId): Sprite {
  const g = MOODS[id].rows;
  const rows = BUBBLE.rows.map((r, y) => {
    const gy = y - 2;
    if (gy < 0 || gy >= g.length) return r;
    const chars = [...r];
    const gr = g[gy];
    for (let x = 0; x < gr.length; x++) if (gr[x] !== '.') chars[3 + x] = gr[x];
    return chars.join('');
  });
  return { rows };
}
