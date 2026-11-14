// 气泡里的像素小图（12×12，一个字符一个像素，画到 canvas 上转成 dataURL；放大 3 倍、image-rendering: pixelated）。
// 颜色跟场景走：描边深靛 #171230、奶油 #fff3d6、金 #ffd23c（壳的 HUD 同色），吃的颜色取 clubfood 餐车的主色。
import type { ItemId } from './rules';

const COLORS: Record<string, string> = {
  k: '#171230',
  w: '#fff3d6',
  y: '#ffd23c',
  Y: '#e8a21a',
  l: '#9de044',
  p: '#ff84b8',
  P: '#e2508e',
  m: '#49e2c5',
  r: '#ff4a32',
  R: '#b8323a',
  t: '#f6c878',
  T: '#c88a48',
  g: '#59b337',
  o: '#ff960e',
  c: '#d8883e',
  C: '#ffd84a',
};

const SPRITES: Record<ItemId | 'angry' | 'happy', string[]> = {
  lemon: [
    '......kk....',
    '.....krk....',
    '....krk.....',
    '.kkkkrkkkk..',
    '.kwwwwwwwkkk',
    '.kyyyyyyyklk',
    '.kyywyyyykkk',
    '..kyyyyyyk..',
    '..kyyyywyk..',
    '..kywyyyyk..',
    '...kyYyYk...',
    '...kkkkkk...',
  ],
  smoothie: [
    '......kmk...',
    '......kmk...',
    '....kkkmkk..',
    '...kwwwwwwk.',
    '..kkkkkkkkkk',
    '..kppppppppk',
    '..kpPppppPpk',
    '...kppppppk.',
    '...kpPppppk.',
    '...kppppPpk.',
    '....kppppk..',
    '....kkkkkk..',
  ],
  wrap: [
    '............',
    '........kkk.',
    '.......kgrgk',
    '......kTgogk',
    '.....kttTkk.',
    '....kttttk..',
    '...kttttTk..',
    '..kttTttk...',
    '.ktttttk....',
    '.kttTtk.....',
    '.ktttk......',
    '..kkk.......',
  ],
  pizza: [
    '.kkkkkkkkkk.',
    'kcccccccccck',
    'kCCrCCCCrCCk',
    '.kCCCCCCCCk.',
    '.kCCCrCCCCk.',
    '..kCCCCCrk..',
    '..kCCCCCCk..',
    '...kCrCCk...',
    '...kCCCCk...',
    '....kCCk....',
    '.....kk.....',
    '............',
  ],
  angry: [
    '...kkkkkk...',
    '..krrrrrrk..',
    '.krkrrrrkrk.',
    'krrrkrrkrrrk',
    'krrwkrrkwrrk',
    'krrkkrrkkrrk',
    'krrrrrrrrrrk',
    'krrrkkkkrrrk',
    'krrkrrrrkrrk',
    '.krrrrrrrrk.',
    '..krrrrrrk..',
    '...kkkkkk...',
  ],
  happy: [
    '...kkkkkk...',
    '..kyyyyyyk..',
    '.kyyyyyyyyk.',
    'kyykyyyykyyk',
    'kyykyyyykyyk',
    'kyyyyyyyyyyk',
    'kyyyyyyyyyyk',
    'kykyyyyyykyk',
    'kyykkkkkkyyk',
    '.kyyyyyyyyk.',
    '..kyyyyyyk..',
    '...kkkkkk...',
  ],
};

export type IconId = keyof typeof SPRITES;

const cache = new Map<IconId, string>();
/** 小图的 dataURL（第一次画，之后缓存） */
export function iconUrl(id: IconId): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const rows = SPRITES[id];
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const g = c.getContext('2d');
  if (g)
    rows.forEach((row, y) => {
      for (let x = 0; x < 12; x++) {
        const col = COLORS[row[x] ?? '.'];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    });
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
