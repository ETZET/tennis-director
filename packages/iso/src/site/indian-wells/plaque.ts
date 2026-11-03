import { FONT3x5 } from '../../art/font';
import { Custom, type DrawContext } from '../../core/graph';
import { HV } from '../../core/proj';
import { dark } from './build';
import { box } from './kit';

/**
 * 大门的牌匾（wave1-contract.md 的 plaque）：大门南边、围墙外一块立着的铜牌，修好一处刻一行
 * （设施的色块 + 带头人的名字 + 第几天）。默认镜头下是一块整齐的牌子、一行一道金线；拉近（每个字的像素
 * 至少 1 个缓冲像素）才看得清字。字只排 3×5 小号字里有的字（大写字母、数字），别的字跳过。
 */

export interface PlaqueRow {
  readonly facility: string;
  readonly leader: string;
  readonly day: number;
}

/** 牌子立在哪儿（面朝东 +x，从大门出去往右手边看） */
const PX = 61.6;
const Z0 = 6.8;
const Z1 = 12.2;
const Y0 = 0.5;
const Y1 = 4.4;
/** 最多刻几行（多了只留最近的） */
const MAX_ROWS = 8;

/** 每处设施一个色块（和场地、招牌的主色一致） */
const CHIP: Readonly<Record<string, string>> = {
  stadium_1: '#4b67d1',
  practice: '#4fa760',
  outer_1: '#3f86c9',
  outer_23: '#d36b3d',
  clubhouse: '#c9563a',
  plaza: '#3fb3a8',
  stadium_3: '#34a3ad',
  stadium_2: '#38b4dc',
};

const clean = (s: string): string =>
  [...s.toUpperCase()]
    .filter((c) => FONT3x5[c] && c !== ' ')
    .join('')
    .slice(0, 7);

export function buildPlaque(rows: readonly PlaqueRow[]): Custom | null {
  if (!rows.length) return null;
  const list = rows.slice(-MAX_ROWS).map((r) => ({
    c: CHIP[r.facility] ?? '#f0d27a',
    name: clean(r.leader),
    day: String(Math.max(0, Math.floor(r.day))),
  }));
  const node = new Custom((r) => drawPlaque(r, list), {
    x0: PX - 0.4,
    x1: PX + 0.4,
    z0: Z0 - 0.3,
    z1: Z1 + 0.3,
    y0: 0,
    y1: Y1 + 0.5,
  });
  node.name = 'plaque';
  return node;
}

function drawPlaque(r: DrawContext, list: readonly { c: string; name: string; day: string }[]): void {
  const lit = dark(r) ? 0.7 : r.litAt(PX, (Z0 + Z1) / 2);
  // 两根石柱、一块铜牌、金边
  for (const z of [Z0, Z1])
    box(r, PX - 0.3, PX + 0.3, z - 0.3, z + 0.3, 0, Y1 + 0.3, '#ecd2ac', { lit, top: '#f6e2c2' });
  box(r, PX - 0.12, PX + 0.12, Z0 + 0.3, Z1 - 0.3, Y0, Y1, '#5a3f22', { lit, top: '#d8b45a' });
  if (!r.vis(1, 0)) return;
  const xs = PX + 0.15;
  const gold = r.col('#f0d27a', 1, lit);
  const rim = r.col('#d8b45a', 1, lit);
  const zl = Z1 - 0.45;
  const zr = Z0 + 0.45;
  const quad = (za: number, zb: number, ya: number, yb: number, c: number) =>
    r.wpoly(
      [
        [xs, ya, za],
        [xs, ya, zb],
        [xs, yb, zb],
        [xs, yb, za],
      ],
      c,
    );
  // 金边和顶上的一道桂冠纹
  quad(zl + 0.08, zr - 0.08, Y1 - 0.12, Y1 - 0.05, rim);
  quad(zl + 0.08, zr - 0.08, Y0 + 0.05, Y0 + 0.12, rim);
  const top = Y1 - 0.25;
  const lineH = (top - Y0 - 0.2) / MAX_ROWS;
  // 字是正着画的像素（不随墙面斜切，好认），一个字像素 = s 个缓冲像素；一行至少要 6 个像素高才写字，不然一行画一道线
  const s = Math.floor((lineH * r.k * HV) / 6);
  list.forEach((row, i) => {
    const yb = top - (i + 1) * lineH;
    const chip = r.col(row.c, 1, lit);
    if (s < 1) {
      // 远看：左边一个色块、一道金线
      quad(zl, zl - 0.35, yb + lineH * 0.3, yb + lineH * 0.8, chip);
      quad(zl - 0.5, zr + 0.6 + (i % 3) * 0.3, yb + lineH * 0.45, yb + lineH * 0.65, gold);
      quad(zr + 0.4, zr, yb + lineH * 0.45, yb + lineH * 0.65, gold);
      return;
    }
    const m = s / r.k;
    const yt = yb + lineH * 0.5 + (2.5 * s) / (r.k * HV);
    const c0 = r.P(xs, yt, zl);
    r.rect(c0[0], c0[1] + s, 3 * s, 3 * s, chip);
    text(r, row.name, xs, yt, zl - 5 * m, s, gold);
    text(r, row.day, xs, yt, zr + (row.day.length * 4 - 1) * m, s, gold);
  });
}

/**
 * 在平面 x = xs 上从 z0 往 -z（屏幕上从左往右）写一行 3×5 小字。等距墙面上的字照像素画的画法：
 * 字形是正的（s 倍像素、不斜切，好认），每个字按它在墙面上的位置往上抬（2:1 斜度）
 */
function text(r: DrawContext, str: string, xs: number, y: number, z0: number, s: number, c: number): void {
  const a = r.P(xs, y, z0);
  const ax = Math.round(a[0]);
  const ay = Math.round(a[1]);
  let col = 0;
  for (const ch of str) {
    const g = FONT3x5[ch];
    if (!g) continue;
    const w = g[0]?.length ?? 3;
    const lift = Math.floor((col * s) / 2);
    for (let q = 0; q < w; q++)
      for (let row = 0; row < g.length; row++)
        if (g[row]?.[q] === '#') r.rect(ax + (col + q) * s, ay + row * s - lift, s, s, c);
    col += w + 1;
  }
}
