// 地点的像素小图（第三轮）：每个地方画成那块地方的缩小剪影（俯视的球场、泳池、喷泉；正面的房子、餐车、候车亭），
// 不再借用别的意思的图标（原来：水滴 = 泳池、小旗 = 高尔夫、球拍 = 会员场、杯子 = 美食广场……）。
// 名册看板每一簇打头的图、小地图上每张图的牌子都用它（13×9 纹素，同 icons.ts 的画法：只画里面，描边由 sprite.ts 加）。
// 键是"地方的 id"：演员表的场景（clubpark……，clubsite/cast 的 SceneId）和分图的图（arrive、court、oasis、practice、club）；
// 没画过的 id → placeSprite 给一块通用的"小院子"（world 代理加了新图、还没画剪影时不会坏）。
import type { Sprite } from './sprite';

const S = (...rows: string[]): Sprite => ({ rows });

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
  /** 匹克球：一只实心的蓝色板拍 + 一颗带洞的球 */
  clubpickle: S(
    '..nnnnn......',
    '.nBBBBBn.....',
    '.nBWBBBn.....',
    '.nBBBBBn.....',
    '.nBBBBbn.ggg.',
    '..nBBbn.gdgdg',
    '...ttt..ggggg',
    '...ttt...ggg.',
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
  /** 中心球场：一圈高看台，顶上插着旗，前面是场地 */
  clubstadium: S(
    '..r...r...r..',
    '..d...d...d..',
    'SSSSSSSSSSSSS',
    'SsSsSsSsSsSsS',
    'SSSSSSSSSSSSS',
    'SsSsSsSsSsSsS',
    'bbbbbbbbbbbbb',
    'bWWWWWKWWWWWb',
    'bbbbbbbbbbbbb',
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
  /** 红土场：一片红土，白色底线，一把拖场的大刷子 */
  clubclay: S(
    '.........t...',
    '........t....',
    '.......t.....',
    '..TTTTTTTTT..',
    '..ttttttttt..',
    'rrrrrrrrrrrrr',
    'rWWWWWWWWWWWr',
    'rrrrrrrrrrrrr',
    'mmmmmmmmmmmmm',
  ),
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
  /** 泳池：一池深一点的水、白色泳道线、池边的扶梯 */
  clubpool: S(
    'WWWWWWWWWWWWW',
    'WaaaaaaaaaaaW',
    'WWWWWWWWWWWWW',
    'WaaaaaaaaaaaS',
    'WWWWWWWWWWWWS',
    'WaaaaaaaaaaaS',
    'WWWWWWWWWWWWW',
    'WaaaaaaaaaaaW',
    'WWWWWWWWWWWWW',
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
  /** 到达：一辆公交车（侧面）停在站牌边 */
  arrive: S(
    '..........nnn',
    '..........nWn',
    'SSSSSSSSS.nnn',
    'SAASAASAS..d.',
    'SAASAASAS..d.',
    'SSSSSSSSS..d.',
    'SSSSSSSSS..d.',
    '.dd...dd...d.',
    'ddddddddddddd',
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
  /** 练习场：一台发球机（顶上一斗球、侧面出球口），前面一颗球 */
  practice: S(
    '.............',
    '...SSSSSSS...',
    '...SgggggS...',
    '...SSSSSSS.g.',
    '...SdddddS...',
    '...SdddddSSSg',
    '...SSSSSSS...',
    '....d...d....',
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
