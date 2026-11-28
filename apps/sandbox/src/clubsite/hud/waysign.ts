// 出口的小箭头：总监走近一个出口（换图 / 换世界的地方）时，出口那里冒一个奶油色的小箭头（墨描边、慢慢往出口那边一跳一跳），
// 走开、换了图就没有。第四轮（2026-11-28，「让布局说话」）：不再写目的地的字 —— 出口靠布局讲（路一直通到画面外、出口有门柱 / 台阶 /
// 拱门，远处露出下一张图的一角），这里只补一个"往这边走"；去哪看右下的小地图。
// 箭头在出口在屏幕上的位置（在屏幕外就贴着那一边，让开四个角的界面），朝出口相对屏幕中心（总监差不多在那儿）的方向。只是提示，点不了。
// 用法：const signs = createWaySigns(); 每帧 signs.set([{ x, y, text }, …])（x, y = 出口在屏幕上的位置，CSS 像素，可以在屏幕外；
// text = 目的地名，只给读屏用）。
import { CREAM, hex, INK, INK_SHADOW } from './colors';
import { hudScale } from './scale';

export interface WaySign {
  /** 出口在屏幕上的位置（CSS 像素；在屏幕外就贴到那一边） */
  x: number;
  y: number;
  /** 目的地名（只给读屏：aria-label，不上屏） */
  text: string;
}
export interface WaySigns {
  set(list: readonly WaySign[]): void;
  readonly el: HTMLElement;
}

type Dir = 'up' | 'down' | 'left' | 'right';

/** 朝上的箭头（9 × 8 纹素）：奶油实心、1 纹素墨边、底下 1 纹素深影；别的方向转出来 */
const UP = ['....K....', '...KWK...', '..KWWWK..', '.KWWWWWK.', 'KKKWWWKKK', '..KWWWK..', '..KWWWK..', '..KKKKK..'];

function arrowCanvas(dir: Dir): HTMLCanvasElement {
  const n = UP.length;
  const m = UP[0].length;
  const vert = dir === 'up' || dir === 'down';
  const c = document.createElement('canvas');
  c.width = vert ? m : n + 1;
  c.height = vert ? n + 1 : m + 1;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const put = (x: number, y: number, col: number) => {
    g.fillStyle = hex(col);
    g.fillRect(x, y, 1, 1);
  };
  const at = (i: number, j: number): [number, number] =>
    dir === 'up' ? [j, i] : dir === 'down' ? [j, n - 1 - i] : dir === 'left' ? [i, j] : [n - 1 - i, j];
  // 深影：先把墨边的形状往下挪 1 纹素画一遍
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      if (UP[i][j] === '.') continue;
      const [x, y] = at(i, j);
      put(x, y + 1, INK_SHADOW);
    }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const ch = UP[i][j];
      if (ch === '.') continue;
      const [x, y] = at(i, j);
      put(x, y, ch === 'K' ? INK : CREAM);
    }
  return c;
}

const CSS = `
.pxh-way { position: absolute; left: 0; top: 0; image-rendering: pixelated; image-rendering: crisp-edges; }
.pxh-way[data-dir='up'] { animation: pxh-way-u 0.9s steps(2, end) infinite; }
.pxh-way[data-dir='down'] { animation: pxh-way-d 0.9s steps(2, end) infinite; }
.pxh-way[data-dir='left'] { animation: pxh-way-l 0.9s steps(2, end) infinite; }
.pxh-way[data-dir='right'] { animation: pxh-way-r 0.9s steps(2, end) infinite; }
@keyframes pxh-way-u { 50% { translate: 0 calc(var(--ws) * -2px); } }
@keyframes pxh-way-d { 50% { translate: 0 calc(var(--ws) * 2px); } }
@keyframes pxh-way-l { 50% { translate: calc(var(--ws) * -2px) 0; } }
@keyframes pxh-way-r { 50% { translate: calc(var(--ws) * 2px) 0; } }
`;

export function createWaySigns(): WaySigns {
  if (!document.getElementById('pxh-way-css')) {
    const st = document.createElement('style');
    st.id = 'pxh-way-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'pxh-ways';
  Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '6' });
  document.body.appendChild(root);
  const els: { c: HTMLCanvasElement; key: string }[] = [];
  const make = () => {
    const c = document.createElement('canvas');
    c.className = 'pxh-way';
    c.setAttribute('role', 'img');
    root.appendChild(c);
    const e = { c, key: '' };
    els.push(e);
    return e;
  };
  return {
    el: root,
    set(list) {
      const W = innerWidth;
      const H = innerHeight;
      const S = hudScale();
      root.style.setProperty('--ws', String(S));
      // 四个角是界面的（日钟、金币、右下图标）：箭头让开
      const top = 118;
      const bottom = H - S * (6 + 29 + 6) - 24;
      const side = 12;
      for (let i = 0; i < Math.max(list.length, els.length); i++) {
        const e = els[i] ?? make();
        const s = list[i];
        if (!s) {
          e.c.hidden = true;
          continue;
        }
        const dx = s.x - W / 2;
        const dy = s.y - H / 2;
        // 方向：出口相对屏幕中心（总监差不多在那儿）
        const dir: Dir = Math.abs(dx) * (H / W) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        const key = `${dir}|${S}`;
        if (key !== e.key) {
          e.key = key;
          const src = arrowCanvas(dir);
          e.c.width = src.width;
          e.c.height = src.height;
          (e.c.getContext('2d') as CanvasRenderingContext2D).drawImage(src, 0, 0);
          e.c.style.width = `${src.width * S}px`;
          e.c.style.height = `${src.height * S}px`;
          e.c.dataset.dir = dir;
        }
        if (e.c.getAttribute('aria-label') !== s.text) e.c.setAttribute('aria-label', s.text);
        e.c.hidden = false;
        const w = e.c.width * S;
        const h = e.c.height * S;
        // 出口在屏幕里：箭头就在出口上方一点（地面上那个口子）；在屏幕外：贴着那一边
        const mid = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
        const x = mid(s.x - w / 2, side, W - side - w);
        const y = mid(s.y - h - 6, top, bottom - h);
        e.c.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    },
  };
}
