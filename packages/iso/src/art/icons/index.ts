import { ringOutline } from '../font';
import type { PixelArt } from '../format';

/**
 * 表情图标（人物头顶冒出来的小图）：旧版 `render/src/fx/icons.ts` 的 ICONS 原样搬过来，再加几个新的。
 *
 * - 字符画里的字母是这张图自己的调色板键（不是换色槽位）；`port` 把它们换成数字键，外面再描一圈 'O'（4 邻域，和旧版画布描边一样）。
 * - 锚点在底边中间：fx 层把这个点贴在人物 head_top 上方。
 */

function port(pal: Readonly<Record<string, string>>, px: readonly string[]): PixelArt {
  const keys = Object.keys(pal);
  const map = new Map(keys.map((k, i) => [k, String(i + 1)]));
  const w = Math.max(...px.map((r) => r.length));
  const body = px.map((r) => [...r.padEnd(w, '.')].map((c) => (c === '.' ? '.' : (map.get(c) ?? '.'))).join(''));
  const rows = ringOutline(body, 'O', false);
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(pal)) p[map.get(k) ?? ''] = v;
  return { rows, ox: Math.floor((rows[0]?.length ?? 0) / 2), oy: rows.length - 1, pal: p };
}

export const ICON_ART = {
  /* ---- 旧版的 13 个 ---- */
  heart: port({ R: '#e8463d', r: '#a52a2a', W: '#ffd7d0' }, [
    '..RR...RR..',
    '.RWRR.RRRr.',
    '.RWRRRRRRr.',
    '.RRRRRRRRr.',
    '..RRRRRRr..',
    '...RRRRr...',
    '....RRr....',
    '.....r.....',
  ]),
  sweat: port({ B: '#66c3ff', b: '#2f7fc4', W: '#e6f6ff' }, [
    '...B...',
    '...B...',
    '..BBB..',
    '.BBBBB.',
    'BWBBBBb',
    'BWBBBBb',
    '.BBBBb.',
    '..bbb..',
  ]),
  note: port({ P: '#3b2a5a' }, [
    '....PPPP',
    '....PPPP',
    '....P..P',
    '....P..P',
    '.PPPP.PP',
    'PPPPPPPP',
    'PPPP.PP.',
    '.PP.....',
  ]),
  anger: port({ R: '#ff4a3a' }, [
    '.RR...RR.',
    '.R.....R.',
    'RR.....RR',
    '.........',
    'RR.....RR',
    '.R.....R.',
    '.RR...RR.',
  ]),
  excl: port({ Y: '#ffe14a' }, ['.YYY.', '.YYY.', '.YYY.', '.YYY.', '..Y..', '.....', '.YYY.', '.YYY.']),
  ques: port({ Y: '#ffe14a' }, [
    '.YYYY.',
    'YY..YY',
    '....YY',
    '...YY.',
    '..YY..',
    '..YY..',
    '......',
    '..YY..',
    '..YY..',
  ]),
  zzz: port({ Z: '#d8ecff' }, [
    '....ZZZZ',
    '......Z.',
    '.....Z..',
    '....ZZZZ',
    'ZZZZZ...',
    '...Z....',
    '..Z.....',
    '.Z......',
    'ZZZZZ...',
  ]),
  star: port({ Y: '#ffe14a', W: '#fff8c8' }, [
    '....Y....',
    '....Y....',
    '...YWY...',
    'YYYYWYYYY',
    '.YYYYYYY.',
    '..YYYYY..',
    '..YY.YY..',
    '.YY...YY.',
    '.Y.....Y.',
  ]),
  cloud: port({ G: '#8e98a3', g: '#6b7581', B: '#7cc4ff' }, [
    '...GGG......',
    '..GGGGG.GG..',
    '.GGGGGGGGGG.',
    'GGGGGGGGGGGG',
    'gGGGGGGGGGGg',
    '.gggggggggg.',
    '..B...B..B..',
    '.B...B..B...',
  ]),
  flash: port({ W: '#ffffff', Y: '#fff4a8' }, [
    '.....W.....',
    '..W..W..W..',
    '...WWYWW...',
    '.WWWYYYWWW.',
    'WWWYYWYYWWW',
    '.WWWYYYWWW.',
    '...WWYWW...',
    '..W..W..W..',
    '.....W.....',
  ]),
  sad: port({ B: '#7cc4ff' }, ['B.....B', 'B.....B', '.......', '.BBBBB.', 'B.....B']),
  bulb: port({ Y: '#ffe14a', W: '#fff8c8', G: '#9aa0a3' }, [
    '.YYYY.',
    'YWWYYY',
    'YWYYYY',
    'YYYYYY',
    '.YYYY.',
    '..GG..',
    '..GG..',
  ]),
  fire: port({ R: '#ff5a2a', Y: '#ffd23a', W: '#fff6c0' }, [
    '...R....',
    '..RR..R.',
    '.RRR.RR.',
    '.RYRRRR.',
    'RRYYRYRR',
    'RYYWYYYR',
    'RYWWWWYR',
    '.RYWWYR.',
  ]),

  /* ---- 新加的 ---- */
  /** 晕头转向：一圈轨道上转着三颗小星 */
  dizzy: port({ Y: '#ffe14a', w: '#fff8c8' }, [
    '.....Y.....',
    '...wYYYw...',
    '.Yw..Y..ww.',
    'YYY.....Y.w',
    '.Yw....YYY.',
    '...wwwwwY..',
  ]),
  /** 钱：金币上一个 $ */
  money: port({ R: '#c9962a', Y: '#ffd23a', D: '#8a5a1a' }, [
    '..RRRRR..',
    '.RYYDYYR.',
    'RYDDDDYYR',
    'RYDYDYYYR',
    'RYYDDDYYR',
    'RYYYDYDYR',
    'RYDDDDYYR',
    '.RYYDYYR.',
    '..RRRRR..',
  ]),
  /** 点赞 */
  thumb: port({ S: '#f2c9a2', s: '#d9a57c', C: '#2f7fd8' }, [
    '...S....',
    '..SS....',
    '..SS....',
    'CCSSSSS.',
    'CCSSSSs.',
    'CCSSSSS.',
    'CCSSSSs.',
    'CCSSSS..',
  ]),
  /** 扳手（修理） */
  wrench: port({ G: '#c9cccd', g: '#8a9094' }, [
    '......G.G',
    '.....GG.G',
    '.....GGGg',
    '....GGg..',
    '...GGg...',
    '..GGg....',
    '.GGg.....',
    'GGg......',
    'Gg.......',
  ]),
  /** 扫帚（打扫） */
  broom: port({ D: '#8a5f3a', R: '#c4462b', Y: '#e5b33b', y: '#b8862a' }, [
    '........D',
    '.......D.',
    '......D..',
    '.....D...',
    '....D....',
    '...RR....',
    '..YYYR...',
    '.YYYyY...',
    'YYyYYy...',
    'Y.Y.y....',
  ]),
  /** 音乐：两个连着的八分音符（比 note 亮，表示开心哼歌） */
  music: port({ P: '#ff6fae', p: '#c94a86' }, [
    '...PPPPPP',
    '...PPPPPp',
    '...P....P',
    '...P....P',
    '.PPP..PPP',
    'PPPp.PPPp',
    '.pp...pp.',
  ]),
  /** 带感叹号的气泡（有事找你） */
  bubble: port({ W: '#ffffff', w: '#d8d4cc', R: '#e8463d' }, [
    '.WWWWWWWW.',
    'WWWWRRWWWW',
    'WWWWRRWWWW',
    'WWWWRRWWWW',
    'WWWWWWWWWW',
    'WWWWRRWWWw',
    '.wwwwwwww.',
    '..ww......',
    '..w.......',
  ]),
} satisfies Record<string, PixelArt>;

export type IconName = keyof typeof ICON_ART;
