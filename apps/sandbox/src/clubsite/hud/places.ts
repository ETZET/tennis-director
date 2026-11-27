// 地点的像素小图（第三轮）：每个地方画成那块地方的缩小剪影（俯视的球场、泳池、喷泉；正面的房子、餐车、候车亭），
// 不再借用别的意思的图标（原来：水滴 = 泳池、小旗 = 高尔夫、球拍 = 会员场、杯子 = 美食广场……）。
// 名册看板每一簇打头的图、小地图上每张图的牌子都用它（13×9 纹素，同 icons.ts 的画法：只画里面，描边由 sprite.ts 加）。
// 键是"地方的 id"：演员表的场景（clubpark……，clubsite/cast 的 SceneId）和分图的图（arrive、court、oasis、practice、club）；
// 没画过的 id → placeSprite 给一块通用的"小院子"（world 代理加了新图、还没画剪影时不会坏）。
import type { Sprite } from './sprite';

const S = (...rows: string[]): Sprite => ({ rows });

/** 俯视的一片网球场：c = 场地色，s = 场地外一圈；白线，中间一道墨色的网 */
function court(c: string, s: string): Sprite {
  const rows = [
    'sssssssssssss',
    'sWWWWWWWWWWWs',
    'sWccWcKcWccWs',
    'sWccWcKcWccWs',
    'sWccWWKWWccWs',
    'sWccWcKcWccWs',
    'sWccWcKcWccWs',
    'sWWWWWWWWWWWs',
    'sssssssssssss',
  ];
  return { rows: rows.map((r) => r.split('c').join(c).split('s').join(s)) };
}

export const PLACES: Record<string, Sprite> = {
  // ── 内场（clubwalk）的十一处 ──
  /** 停车场：沥青、白色车位线、两辆车的车顶 */
  clubpark: S(
    'ddddddddddddd',
    'dWdddWdddWddd',
    'dWBBBWdddWRRR',
    'dWAAAWdddWAAA',
    'dWBBBWdddWRRR',
    'dWBBBWdddWRRR',
    'dWAAAWdddWAAA',
    'dWBBBWdddWRRR',
    'dWdddWdddWddd',
  ),
  /** 前台：条纹雨棚下的一张柜台，台上一只铃 */
  clubdesk: S(
    'RWRWRWRWRWRWR',
    'RWRWRWRWRWRWR',
    'rwrwrwrwrwrwr',
    '.t.........t.',
    '.t....X....t.',
    '.t...XXX...t.',
    'BBBBBBBBBBBBB',
    'bbbbbbbbbbbbb',
    'nnnnnnnnnnnnn',
  ),
  /** 匹克球场：两片小场地并排（比网球场小、青色） */
  clubpickle: S(
    'ppppppppppppp',
    'pWWWWWpWWWWWp',
    'pWaWaWpWaWaWp',
    'pWaWaWpWaWaWp',
    'pKKKKKpKKKKKp',
    'pWaWaWpWaWaWp',
    'pWaWaWpWaWaWp',
    'pWWWWWpWWWWWp',
    'ppppppppppppp',
  ),
  /** 棕榈喷泉广场：圆水池、中间一柱水，两边各一棵棕榈 */
  clubplaza: S(
    '.P.........P.',
    'PPP...W...PPP',
    '.t...WAW...t.',
    '.t....A....t.',
    '.t.SSSSSSS.t.',
    '..SAAAAAAAS..',
    '..SAAaAaAAS..',
    '...SSSSSSS...',
    '.............',
  ),
  /** 中心球场：一片场地，三面台阶看台 */
  clubstadium: S(
    'SsSsSsSsSsSsS',
    'sdddddddddddS',
    'SdWWWWWWWWWds',
    'sdWbbWKWbbWdS',
    'SdWbbWKWbbWds',
    'sdWbbWKWbbWdS',
    'SdWWWWWWWWWds',
    'sdddddddddddS',
    'SsSsS...SsSsS',
  ),
  /** 会员场：蓝色硬地、绿色场外 */
  clubcourts: court('b', 'p'),
  /** 红土场：橙红的土 */
  clubclay: court('r', 'm'),
  /** 会所：两层的房子，平屋顶，一排窗，中间一扇门 */
  clubhouse: S(
    '.RRRRRRRRRRR.',
    'RRRRRRRRRRRRR',
    '.WWWWWWWWWWW.',
    '.WaaWaaWaaWW.',
    '.WWWWWWWWWWW.',
    '.WaaWTTWaaWW.',
    '.WaaWTtWaaWW.',
    '.wwwwTtwwwww.',
    'sssssssssssss',
  ),
  /** 泳池：一池水、泳道线、池边的扶梯和躺椅 */
  clubpool: S(
    'WWWWWWWWWWWWW',
    'WAAAAAAAAAAAW',
    'WAAWAAAWAAAAS',
    'WAAAAAAAAAAAS',
    'WAWAAAWAAAWAW',
    'WAAAAAAAAAAAW',
    'WAAAWAAAWAAAW',
    'WWWWWWWWWWWWW',
    'w.RR..RR..RRw',
  ),
  /** 高尔夫：一片果岭、一个洞、一面旗、一处沙坑 */
  clubgolf: S(
    '......SRRR...',
    '......SRR....',
    '...PPPSPPP...',
    '.PPPPPSPPPPP.',
    'PPPPPPKPPPPPP',
    'PPPPPPPPPPXXP',
    '.PPPPPPPPXXX.',
    '..pPPPPPPpp..',
    '....ppppp....',
  ),
  /** 美食广场：一辆餐车，掀起的窗板、条纹篷、两个轮子 */
  clubfood: S(
    '.RWRWRWRWRW..',
    '.RWRWRWRWRW..',
    '.SSSSSSSSSSS.',
    '.SdddddddSaS.',
    '.SdTdXdRdSaS.',
    '.SSSSSSSSSSS.',
    '.SSSSSSSSSSS.',
    '..dd.....dd..',
    '..dd.....dd..',
  ),
  // ── 分图（clubvista）和整座内场 ──
  /** 到达：马路边的候车亭和站牌 */
  arrive: S(
    '.dddddddd....',
    'ddddddddddBB.',
    '.s......s.BB.',
    '.s......s..S.',
    '.sTTTTTTs..S.',
    '.s.t..t.s..S.',
    'sssssssssssss',
    'ddddddddddddd',
    'dWWdWWdWWdWWd',
  ),
  court: S(
    'SsSsSsSsSsSsS',
    'sdddddddddddS',
    'SdWWWWWWWWWds',
    'sdWbbWKWbbWdS',
    'SdWbbWKWbbWds',
    'sdWbbWKWbbWdS',
    'SdWWWWWWWWWds',
    'sdddddddddddS',
    'SsSsS...SsSsS',
  ),
  /** 歇脚：一汪水、一棵棕榈、一把伞 */
  oasis: S(
    '..PP.PP......',
    '.PPPPPPP..WWW',
    '..PPtPP.WWWWW',
    '....t......S.',
    '....t..AAA.S.',
    '.XXXtXAAAAAAX',
    'XXXXXAAaAAAAA',
    'XXXXXXAAAAAXX',
    '.XXXXXXXXXXX.',
  ),
  /** 练习场：半片场地对着一面练习墙，地上几颗球 */
  practice: S(
    'ddddddddddddd',
    'dSSSSSWSSSSSd',
    'ddddddddddddd',
    'pbbbbbbbbbbbp',
    'pbWWWWWWWWWbp',
    'pbWbbbWbbbWbp',
    'pbWbGbWbbGWbp',
    'pbWbbbWbGbWbp',
    'ppppppppppppp',
  ),
  /** 内场：大门的拱 + 门里两片球场 */
  club: S(
    '..TTTTTTTTT..',
    '.TTWWWWWWWTT.',
    '.TT.......TT.',
    '.Tt.bbbbb.tT.',
    '.Tt.bWbWb.tT.',
    '.Tt.bbbbb.tT.',
    '.Tt.......tT.',
    '.Tt.XXXXX.tT.',
    'XXXXXXXXXXXXX',
  ),
};

/** 没画过剪影的地方：一块围着矮墙的小院子 */
const GENERIC = S(
  '.............',
  '.SSSSSSSSSSS.',
  '.SXXXXXXXXXS.',
  '.SXXPPXXXXXS.',
  '.SXPPPPXXXXS.',
  '.SXXPPXXXXXS.',
  '.SXXXXXXXXXS.',
  '.SSSS...SSSS.',
  '.............',
);

/** 地方的 id → 剪影（没有就是通用的小院子） */
export const placeSprite = (id: string): Sprite => PLACES[id] ?? GENERIC;
