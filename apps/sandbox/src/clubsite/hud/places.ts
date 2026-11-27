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
  /** 停车场：路边的蓝色 P 牌 */
  clubpark: S(
    '..nnnnnnnnn..',
    '..nnWWWWnnn..',
    '..nnWnnnWnn..',
    '..nnWnnnWnn..',
    '..nnWWWWnnn..',
    '..nnWnnnnnn..',
    '..nnWnnnnnn..',
    '..nnnnnnnnn..',
    '......d......',
  ),
  /** 前台：柜台上一只银色服务铃 */
  clubdesk: S(
    '......d......',
    '....SSSSS....',
    '...SWSSSSs...',
    '..SWSSSSSSs..',
    '..SSSSSSSss..',
    '.ddddddddddd.',
    'TTTTTTTTTTTTT',
    'ttttttttttttt',
    'uuuuuuuuuuuuu',
  ),
  /** 匹克球：一只实心的板拍 + 一颗带洞的球 */
  clubpickle: S(
    '..ppppp......',
    '.pPPPPPp.....',
    '.pPPPPPp.....',
    '.pPPPPPp.....',
    '.pPPPPPp.WWW.',
    '..pPPPp.WdWdW',
    '...ttt..WWWWW',
    '...ttt...WWW.',
    '...ttt.......',
  ),
  /** 喷泉广场：两层的喷泉 */
  clubplaza: S(
    '......A......',
    '....AAWAA....',
    '...A..A..A...',
    '..A.SSSSS.A..',
    '.A...SAS...A.',
    '.SSSSSSSSSSS.',
    'SAAAAAAAAAAAS',
    'SAaAAAaAAAaAS',
    '.SSSSSSSSSSS.',
  ),
  /** 中心球场：正面看的一圈高看台，顶上插着旗 */
  clubstadium: S(
    '..r...r...r..',
    '..d...d...d..',
    'SSSSSSSSSSSSS',
    'SsSsSsSsSsSsS',
    'SSSSSSSSSSSSS',
    'SsSsSsSsSsSsS',
    'SSSSSdddSSSSS',
    'SSSSdddddSSSS',
    'SSSSdddddSSSS',
  ),
  /** 会员场：一排三片小场地 */
  clubcourts: S(
    'ppppppppppppp',
    'pbbbpbbbpbbbp',
    'pbWbpbWbpbWbp',
    'pbbbpbbbpbbbp',
    'pKKKpKKKpKKKp',
    'pbbbpbbbpbbbp',
    'pbWbpbWbpbWbp',
    'pbbbpbbbpbbbp',
    'ppppppppppppp',
  ),
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
  /** 练习场：一面练习墙，球弹回来 */
  practice: S(
    'SSSSSSS......',
    'SdSdSdS......',
    'SSSSSSS..gg..',
    'SdSdSdS.gggg.',
    'SSSSSSS..gg..',
    'SdSdSdS......',
    'SSSSSSS.W.W..',
    'bbbbbbbbbbbbb',
    'bbbbbbbbbbbbb',
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
  /** 会所大堂（室内）：一张长沙发 */
  lobby: S(
    '.............',
    '..TTTTTTTTT..',
    '.TtttttttttT.',
    '.TtttttttttT.',
    'TTTTTTTTTTTTT',
    'TtTTTTTTTTTtT',
    'TtTTTTTTTTTtT',
    'TTTTTTTTTTTTT',
    '.u.........u.',
  ),
};

// 同一块地的别名：分图的中心球场就是内场的中心球场；world 代理的新图按 clubvista/text.ts 的 CAST_SCENE 对上
PLACES.court = PLACES.clubstadium;
PLACES.plaza = PLACES.clubplaza;
PLACES.street = PLACES.clubclay;
PLACES.academy = PLACES.clubcourts;
PLACES.golf = PLACES.clubgolf;

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
