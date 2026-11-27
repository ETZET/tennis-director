// 像素小地图（第三轮）：整个游戏的图摆在一张小方格纸上 —— 每张图一块小牌子，牌子里是那个地方的缩小剪影（places.ts），
// 图和图之间是一条点点的小路；你在的那块草帽色框 + 一个小人头，牌子四边画出口的小箭头（往哪走能出去）；
// 有人在找你的那几块右上角一个草帽色小点。只看信息、不传送（玩法准则 1：不是菜单）。
// 数据驱动：图的清单、格子位置、连接、出口由调用的人给（world 代理的 clubgame/mapgraph.ts），这里只管画。
// 字：只有底下一行 —— 你在哪（地名）。点一块牌子：卡顶浮出那张图的名字（同卡片里点图标出名字）。
import { CREAM, hex, INK, INK_SHADOW, KEYS } from './colors';
import { placeSprite } from './places';
import { hudScale } from './scale';
import { createSheet, px, tame, tameColor } from './sheet';
import { rasterize } from './sprite';

export type Dir = 'n' | 's' | 'e' | 'w';

export interface MiniNode {
  id: string;
  /** 格子（列从西到东，行从北到南） */
  col: number;
  row: number;
  /** 牌子的底色（色键里的颜色） */
  fill: number;
}

export interface MiniGraph {
  nodes: readonly MiniNode[];
  /** 哪两张图之间有路；'hv' = 不在同一行 / 列：先横着走到对方那一列，再竖着走 */
  links: readonly (readonly [string, string, ('hv' | undefined)?])[];
  exits: Readonly<Record<string, readonly (readonly [Dir, string])[]>>;
}

export interface MiniMapOpts {
  graph: () => MiniGraph;
  /** 现在在哪张图 */
  where(): string;
  /** 地名（底下那行、点牌子浮出的名字） */
  name(id: string): string;
  /** 这张图里更细的地名（内场的分区）；'' = 没有 */
  detail?(): string;
  /** 有人在找你的图 */
  seeking?(): readonly string[];
}

export interface MiniMap {
  open(): void;
  close(): void;
  isOpen(): boolean;
  toggle(): void;
}

/** 牌子（纹素）：剪影 13×9 + 一圈 2 纹素的底色 + 1 纹素墨边 */
const TW = 19;
const TH = 15;
/** 格子之间的路有多长 */
const GAP = 9;
const PAD = 5;

const MAP_CSS = `
.pxs-worldmap .pxm-wrap { position: relative; margin: 0 auto; }
.pxs-worldmap .pxm-hit { position: absolute; }
.pxs-worldmap .pxm-here { text-align: center; margin-top: calc(var(--s) * 2px); }
`;

export function createMiniMap(o: MiniMapOpts): MiniMap {
  if (!document.getElementById('pxm-css')) {
    const st = document.createElement('style');
    st.id = 'pxm-css';
    st.textContent = MAP_CSS;
    document.head.appendChild(st);
  }
  const sheet = createSheet('worldmap');
  const S = hudScale();
  const wrap = document.createElement('div');
  wrap.className = 'pxm-wrap';
  const here = document.createElement('div');
  here.className = 'pxs-name pxm-here';
  sheet.body.append(wrap, here);
  let blink = 0;
  let timer = 0;
  const sil = new Map<string, HTMLCanvasElement>();
  const silhouette = (id: string) => {
    let c = sil.get(id);
    if (!c) {
      const { w, h, px: data } = rasterize(tame(placeSprite(id)), false, false);
      c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      (c.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(data, w, h), 0, 0);
      sil.set(id, c);
    }
    return c;
  };

  function draw() {
    const g0 = o.graph();
    const cur = o.where();
    const seek = new Set(o.seeking?.() ?? []);
    const cols = Math.max(...g0.nodes.map((n) => n.col)) + 1;
    const rows = Math.max(...g0.nodes.map((n) => n.row)) + 1;
    const W = PAD * 2 + cols * TW + (cols - 1) * GAP;
    const H = PAD * 2 + rows * TH + (rows - 1) * GAP + 1;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d') as CanvasRenderingContext2D;
    const at = (n: MiniNode) => ({ x: PAD + n.col * (TW + GAP), y: PAD + n.row * (TH + GAP) });
    const node = (id: string) => g0.nodes.find((n) => n.id === id);
    const fill = (c: number, x: number, y: number, w: number, h: number) => {
      g.fillStyle = hex(c);
      g.fillRect(x, y, w, h);
    };
    // 路：牌子中心之间一串 2×2 的点（暗纸色），'hv' 先横后竖
    const dots = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4));
      for (let i = 0; i <= n; i++)
        fill(KEYS.w, Math.round(x0 + ((x1 - x0) * i) / n) - 1, Math.round(y0 + ((y1 - y0) * i) / n) - 1, 2, 2);
    };
    for (const [a, b, hv] of g0.links) {
      const A = node(a);
      const B = node(b);
      if (!A || !B) continue;
      const pa = at(A);
      const pb = at(B);
      const ax = pa.x + TW / 2;
      const ay = pa.y + TH / 2;
      const bx = pb.x + TW / 2;
      const by = pb.y + TH / 2;
      if (hv) {
        dots(ax, ay, bx, ay);
        dots(bx, ay, bx, by);
      } else dots(ax, ay, bx, by);
    }
    for (const n of g0.nodes) {
      const { x, y } = at(n);
      const on = n.id === cur;
      // 墨边 + 底下一纹素深影；底色压一档（牌子不比剪影抢）
      fill(INK_SHADOW, x, y + 1, TW, TH);
      fill(INK, x, y, TW, TH);
      fill(tameColor(n.fill), x + 1, y + 1, TW - 2, TH - 2);
      g.drawImage(silhouette(n.id), x + 3, y + 3);
      if (on) {
        // 你在这：草帽色框（闪）+ 牌子左上一个小人头（草帽）
        const c = blink % 2 ? KEYS.X : CREAM;
        fill(c, x - 2, y - 2, TW + 4, 1);
        fill(c, x - 2, y + TH + 1, TW + 4, 1);
        fill(c, x - 2, y - 2, 1, TH + 4);
        fill(c, x + TW + 1, y - 2, 1, TH + 4);
        const hx = x - 3;
        const hy = y - 4;
        fill(INK, hx - 1, hy - 1, 7, 8);
        fill(KEYS.X, hx, hy, 5, 3);
        fill(KEYS.F, hx + 1, hy + 3, 3, 3);
        // 出口：牌子那一边正中一个奶油小三角，朝外
        for (const [d] of o.graph().exits[n.id] ?? []) {
          const mx = x + Math.floor(TW / 2);
          const my = y + Math.floor(TH / 2);
          for (let k = 0; k < 3; k++) {
            const span = 2 - k;
            if (d === 'n') fill(CREAM, mx - span, y - 4 + k, span * 2 + 1, 1);
            if (d === 's') fill(CREAM, mx - span, y + TH + 3 - k, span * 2 + 1, 1);
            if (d === 'w') fill(CREAM, x - 4 + k, my - span, 1, span * 2 + 1);
            if (d === 'e') fill(CREAM, x + TW + 3 - k, my - span, 1, span * 2 + 1);
          }
        }
      }
      if (seek.has(n.id)) {
        // 有人在找你：右上角草帽色小点（墨边）
        const sx = x + TW - 4;
        const sy = y - 2;
        fill(INK, sx, sy, 5, 5);
        fill(KEYS.X, sx + 1, sy + 1, 3, 3);
      }
    }
    // 放得下就画两倍（第 3 轮评判：格子太小、面板大半空纸）
    const room = (sheet.el.clientWidth || innerWidth - 12) - S * 10;
    const k = W * S * 2 <= room ? 2 : 1;
    const view = px(cv, k);
    wrap.style.width = `${W * S * k}px`;
    wrap.style.height = `${H * S * k}px`;
    wrap.replaceChildren(view);
    // 点一块牌子：卡顶浮出名字
    for (const n of g0.nodes) {
      const { x, y } = at(n);
      const hit = document.createElement('div');
      hit.className = 'pxm-hit';
      hit.dataset.tip = o.name(n.id);
      Object.assign(hit.style, {
        left: `${x * S * k}px`,
        top: `${y * S * k}px`,
        width: `${TW * S * k}px`,
        height: `${TH * S * k}px`,
      });
      wrap.appendChild(hit);
    }
    const d = o.detail?.() ?? '';
    here.textContent = d ? `${o.name(cur)} · ${d}` : o.name(cur);
  }

  const api: MiniMap = {
    open() {
      draw();
      sheet.open();
      clearInterval(timer);
      timer = window.setInterval(() => {
        if (!sheet.isOpen()) {
          clearInterval(timer);
          return;
        }
        blink++;
        draw();
      }, 450);
    },
    close: () => sheet.close(),
    isOpen: () => sheet.isOpen(),
    toggle() {
      if (sheet.isOpen()) sheet.close();
      else api.open();
    },
  };
  return api;
}
