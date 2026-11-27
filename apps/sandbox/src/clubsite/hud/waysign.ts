// 出口的小路牌：总监走近一个出口（换图 / 换世界的地方）时，在出口那个方向的屏幕边上出一行"箭头 + 目的地名"；
// 走开、换了图就没有。一块奶油色的小牌（墨字墨边，和人物卡同一张纸；地点名是不带底的白字，两样分得开），贴着出口那一边的屏幕边，
// 箭头朝出口真的在的方向。只是提示，点不了。
// 用法：const signs = createWaySigns(); 每帧 signs.set([{ x, y, text }, …])（x, y = 出口在屏幕上的位置，CSS 像素，可以在屏幕外）。
import { CREAM, hex, INK } from './colors';
import { ensurePixelFont, pxFont } from './pxfont';

export interface WaySign {
  /** 出口在屏幕上的位置（CSS 像素；在屏幕外就贴到那一边） */
  x: number;
  y: number;
  text: string;
}
export interface WaySigns {
  set(list: readonly WaySign[]): void;
  readonly el: HTMLElement;
}

const ARROW = { up: '↑', down: '↓', left: '←', right: '→' } as const;

export function createWaySigns(): WaySigns {
  ensurePixelFont();
  const root = document.createElement('div');
  root.className = 'pxh-ways';
  Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '6' });
  document.body.appendChild(root);
  const ink = hex(INK);
  const els: HTMLDivElement[] = [];
  const make = () => {
    const e = document.createElement('div');
    Object.assign(e.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      whiteSpace: 'nowrap',
      color: ink,
      background: hex(CREAM),
      padding: '3px 8px',
      font: pxFont(),
      webkitFontSmoothing: 'none',
      boxShadow: `2px 0 0 0 ${ink}, -2px 0 0 0 ${ink}, 0 2px 0 0 ${ink}, 0 -2px 0 0 ${ink}`,
    });
    root.appendChild(e);
    els.push(e);
    return e;
  };
  return {
    el: root,
    set(list) {
      const W = innerWidth;
      const H = innerHeight;
      // 四个角是界面的（日钟、金币、右下图标）：路牌让开
      const top = 118;
      const bottom = H - 150;
      const side = 10;
      for (let i = 0; i < Math.max(list.length, els.length); i++) {
        const e = els[i] ?? make();
        const s = list[i];
        if (!s) {
          e.hidden = true;
          continue;
        }
        const dx = s.x - W / 2;
        const dy = s.y - H / 2;
        // 箭头：出口相对屏幕中心（总监差不多在那儿）的方向
        const dir = Math.abs(dx) * (H / W) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        const text = dir === 'left' ? `${ARROW.left} ${s.text}` : `${s.text} ${ARROW[dir]}`;
        if (e.textContent !== text) e.textContent = text;
        e.hidden = false;
        const w = e.offsetWidth || 80;
        // 贴着出口那一边的屏幕边（不跟着出口的位置飘到画面中间）：左右的贴左右边，上下的贴上下的安全带
        const mid = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
        const x = dir === 'right' ? W - side - w : dir === 'left' ? side : mid(s.x - w / 2, side, W - side - w - 110);
        const y = dir === 'down' ? bottom + 60 : dir === 'up' ? top : mid(s.y - 34, top, bottom);
        e.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    },
  };
}
