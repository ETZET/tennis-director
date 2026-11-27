// 整个游戏的像素小地图（右下地图图标点开）：每张图一块小牌、之间的路、你在哪张。只看信息，点了不去哪（玩法准则 1：不是菜单）。
// 内容（有哪些图、排在哪格、怎么连、出口朝哪）在 mapgraph.ts；这里只管画。
// 用像素界面的半屏卡（clubsite/hud/sheet.ts），和人物卡、名册同一张纸。
import { createSheet, hudScale } from '../clubsite/hud';
import { CREAM, hex, INK, KEYS } from '../clubsite/hud/colors';
import { mapName, mapShort } from '../clubvista/text';
import { EXITS, LINKS as GRAPH_LINKS, NODES as GRAPH_NODES, INNER_LINKS, INNER_NODE, type MapNode } from './mapgraph';
import { gt } from './text';

interface Node extends MapNode {
  /** 小牌左上角（纹素） */
  x: number;
  y: number;
}

const TW = 28;
const TH = 16;
/** 格子的间距（列 / 行）：牌子 + 底下的名字 + 路 */
const CW = 34;
const RH = 31;
const W = 4 * CW;
const H = 4 * RH;
const place = (n: MapNode): Node => ({ ...n, x: n.col * CW + (CW - TW) / 2, y: n.row * RH + 3 });

export interface WorldMap {
  open(): void;
  close(): void;
  isOpen(): boolean;
  toggle(): void;
}

/** where = 现在在哪张图；detail = 这张图里更细的地名（旧内场的分区，'' = 没有）；inner = 旧内场接没接（?inner=1，多画一块牌子） */
export function createWorldMap(where: () => string, detail: () => string = () => '', inner = false): WorldMap {
  const NODES = [...GRAPH_NODES, ...(inner ? [INNER_NODE] : [])].map(place);
  const LINKS = [...GRAPH_LINKS, ...(inner ? INNER_LINKS : [])];
  const sheet = createSheet('worldmap');
  const S = hudScale();
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position: 'relative', width: `${W * S}px`, height: `${H * S}px`, margin: '0 auto' });
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  cv.className = 'pxs-px';
  Object.assign(cv.style, { width: `${W * S}px`, height: `${H * S}px` });
  wrap.appendChild(cv);
  const labels = new Map<string, HTMLDivElement>();
  for (const n of NODES) {
    const el = document.createElement('div');
    el.className = 'pxs-name';
    Object.assign(el.style, {
      position: 'absolute',
      left: `${(n.x + TW / 2) * S}px`,
      top: `${(n.y + TH + 2) * S}px`,
      transform: 'translateX(-50%)',
      fontSize: '11px',
      whiteSpace: 'nowrap',
      overflow: 'visible',
      // 路线从牌子中心连过去，会穿过字：字垫一块纸色
      background: '#fff0c4',
      padding: '0 3px',
    });
    el.textContent = mapShort(n.id);
    wrap.appendChild(el);
    labels.set(n.id, el);
  }
  const hereEl = document.createElement('div');
  hereEl.className = 'pxs-name';
  Object.assign(hereEl.style, {
    textAlign: 'center',
    fontSize: '12px',
    lineHeight: '1.5',
    whiteSpace: 'normal',
    marginTop: `${2 * S}px`,
    opacity: '0.75',
  });
  sheet.body.append(wrap, hereEl);

  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  const node = (id: string) => NODES.find((n) => n.id === id) as Node;
  let blink = 0;
  let timer = 0;
  function draw() {
    const cur = where();
    g.clearRect(0, 0, W, H);
    // 路：两块牌子中心之间一串点
    g.fillStyle = hex(INK);
    const dots = (ax: number, ay: number, bx: number, by: number) => {
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 4));
      for (let i = 0; i <= n; i++)
        g.fillRect(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), 2, 2);
    };
    for (const [a, b, via] of LINKS) {
      const A = node(a);
      const B = node(b);
      const ax = A.x + TW / 2;
      const ay = A.y + TH / 2;
      const bx = B.x + TW / 2;
      const by = B.y + TH / 2;
      if (via === 'hv') {
        dots(ax, ay, bx, ay);
        dots(bx, ay, bx, by);
      } else dots(ax, ay, bx, by);
    }
    for (const n of NODES) {
      const on = n.id === cur;
      // 墨边 + 底下一纹素影
      g.fillStyle = hex(INK);
      g.fillRect(n.x - 1, n.y - 1, TW + 2, TH + 3);
      g.fillStyle = hex(n.fill);
      g.fillRect(n.x, n.y, TW, TH);
      // 主题：一块小场地 / 水面 / 路
      g.fillStyle = hex(n.mark);
      const box = (x: number, y: number, w: number, h: number) => {
        g.fillRect(n.x + x, n.y + y, w, 1);
        g.fillRect(n.x + x, n.y + y + h - 1, w, 1);
        g.fillRect(n.x + x, n.y + y, 1, h);
        g.fillRect(n.x + x + w - 1, n.y + y, 1, h);
      };
      switch (n.kind) {
        case 'court':
          box(8, 3, 12, TH - 6);
          g.fillRect(n.x + 8, n.y + Math.floor(TH / 2), 12, 1);
          break;
        case 'courts':
          for (let i = 0; i < 3; i++) {
            box(3 + i * 8, 3, 6, TH - 6);
            g.fillRect(n.x + 3 + i * 8, n.y + Math.floor(TH / 2), 6, 1);
          }
          break;
        case 'wall':
          // 练习墙：一堵墙 + 墙前半片场
          g.fillRect(n.x + 6, n.y + 3, 16, 2);
          box(8, 7, 12, TH - 10);
          break;
        case 'pool':
          g.fillRect(n.x + 5, n.y + 5, 12, TH - 10);
          g.fillStyle = hex(CREAM);
          g.fillRect(n.x + 19, n.y + 4, 4, 4);
          break;
        case 'road':
          g.fillRect(n.x, n.y + TH - 5, TW, 3);
          g.fillStyle = hex(CREAM);
          g.fillRect(n.x + 15, n.y + TH - 8, 8, 4);
          break;
        case 'fountain':
          g.fillRect(n.x + 10, n.y + 5, 8, 6);
          g.fillRect(n.x + 9, n.y + 6, 10, 4);
          g.fillStyle = hex(CREAM);
          g.fillRect(n.x + 13, n.y + 7, 2, 2);
          break;
        case 'house':
          // 屋顶 + 门
          g.fillRect(n.x + 6, n.y + 3, 16, 3);
          g.fillStyle = hex(CREAM);
          g.fillRect(n.x + 7, n.y + 6, 14, TH - 8);
          g.fillStyle = hex(INK);
          g.fillRect(n.x + 12, n.y + 9, 4, TH - 11);
          break;
        case 'flag':
          g.fillRect(n.x + 13, n.y + 3, 1, TH - 6);
          g.fillStyle = hex(KEYS.R);
          g.fillRect(n.x + 14, n.y + 3, 5, 3);
          g.fillStyle = hex(INK);
          g.fillRect(n.x + 11, n.y + TH - 4, 5, 1);
          break;
        default:
          for (let i = 0; i < 3; i++) g.fillRect(n.x + 4 + i * 8, n.y + 4 + (i % 2) * 5, 6, 4);
      }
      if (on) {
        // 你在这里：草帽色的框（闪）+ 牌子上方一个小人头
        g.fillStyle = hex(blink % 2 ? KEYS.X : INK);
        g.fillRect(n.x - 3, n.y - 3, TW + 6, 1);
        g.fillRect(n.x - 3, n.y + TH + 3, TW + 6, 1);
        g.fillRect(n.x - 3, n.y - 3, 1, TH + 7);
        g.fillRect(n.x + TW + 2, n.y - 3, 1, TH + 7);
        const hx = n.x + TW - 7;
        const hy = n.y - 5;
        g.fillStyle = hex(INK);
        g.fillRect(hx - 1, hy - 1, 8, 8);
        g.fillStyle = hex(KEYS.X);
        g.fillRect(hx, hy, 6, 3);
        g.fillStyle = hex(KEYS.F);
        g.fillRect(hx + 1, hy + 3, 4, 3);
      }
    }
    for (const [id, el] of labels) el.style.opacity = id === cur ? '1' : '0.6';
    const ways = (EXITS[cur] ?? []).map(([d, to]) => `${gt(d)} → ${mapName(to)}`).join('　');
    const at = detail();
    hereEl.textContent = at ? `${at}　${ways}` : ways;
  }
  const api: WorldMap = {
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
