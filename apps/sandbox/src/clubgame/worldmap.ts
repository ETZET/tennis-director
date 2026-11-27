// 整个游戏的像素小地图（右下地图图标点开）：五张图各一块小牌、之间的路、你在哪张。只看信息，点了不去哪（玩法准则 1：不是菜单）。
// 用像素界面的半屏卡（clubsite/hud/sheet.ts），和人物卡、名册同一张纸。
import { createSheet, hudScale } from '../clubsite/hud';
import { CREAM, hex, INK, KEYS } from '../clubsite/hud/colors';
import { mapName } from '../clubvista/text';
import { gt } from './text';

interface Node {
  id: string;
  /** 小牌左上角（纹素） */
  x: number;
  y: number;
  /** 底色、里面一条"主题"的色 */
  fill: number;
  mark: number;
}

const TW = 30;
const TH = 18;
const W = 132;
const H = 112;
// 竖着排：下 = 到达（公交站），往上 = 中心球场、练习场；右边 = 歇脚、内场（和走的方向一致：往上走进山口，往东走去内场）
const NODES: Node[] = [
  { id: 'practice', x: 20, y: 6, fill: KEYS.p, mark: KEYS.W },
  { id: 'court', x: 20, y: 42, fill: KEYS.b, mark: KEYS.W },
  { id: 'oasis', x: 82, y: 42, fill: KEYS.A, mark: KEYS.P },
  { id: 'arrive', x: 20, y: 78, fill: KEYS.T, mark: KEYS.S },
  { id: 'club', x: 82, y: 78, fill: KEYS.R, mark: KEYS.W },
];
const LINKS: [string, string][] = [
  ['arrive', 'court'],
  ['court', 'practice'],
  ['court', 'oasis'],
  ['arrive', 'club'],
];
/** 每张图的出口在哪个方向、通到哪（卡片底下那行：这张图往哪走能去哪） */
const EXITS: Record<string, ['n' | 's' | 'e' | 'w', string][]> = {
  arrive: [
    ['n', 'court'],
    ['e', 'club'],
  ],
  court: [
    ['n', 'practice'],
    ['e', 'oasis'],
    ['s', 'arrive'],
  ],
  oasis: [['w', 'court']],
  practice: [['s', 'court']],
  club: [['e', 'arrive']],
};

export interface WorldMap {
  open(): void;
  close(): void;
  isOpen(): boolean;
  toggle(): void;
}

/** where = 现在在哪张图；detail = 这张图里更细的地名（内场的分区，'' = 没有） */
export function createWorldMap(where: () => string, detail: () => string = () => ''): WorldMap {
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
      fontSize: '13px',
      overflow: 'visible',
      // 路线从牌子中心连过去，会穿过字：字垫一块纸色
      background: '#fff0c4',
      padding: '0 3px',
    });
    el.textContent = mapName(n.id);
    wrap.appendChild(el);
    labels.set(n.id, el);
  }
  const hereEl = document.createElement('div');
  hereEl.className = 'pxs-name';
  Object.assign(hereEl.style, { textAlign: 'center', fontSize: '13px', marginTop: `${2 * S}px`, opacity: '0.75' });
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
    for (const [a, b] of LINKS) {
      const A = node(a);
      const B = node(b);
      const ax = A.x + TW / 2;
      const ay = A.y + TH / 2;
      const bx = B.x + TW / 2;
      const by = B.y + TH / 2;
      const n = Math.round(Math.hypot(bx - ax, by - ay) / 4);
      for (let i = 0; i <= n; i++)
        g.fillRect(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), 2, 2);
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
      if (n.id === 'court' || n.id === 'practice') {
        g.fillRect(n.x + 9, n.y + 3, 12, 1);
        g.fillRect(n.x + 9, n.y + TH - 4, 12, 1);
        g.fillRect(n.x + 9, n.y + 3, 1, TH - 6);
        g.fillRect(n.x + 20, n.y + 3, 1, TH - 6);
        g.fillRect(n.x + 9, n.y + Math.floor(TH / 2), 12, 1);
      } else if (n.id === 'oasis') {
        g.fillRect(n.x + 4, n.y + TH - 5, 5, 2);
        g.fillRect(n.x + 6, n.y + 4, 1, TH - 8);
        g.fillRect(n.x + 4, n.y + 3, 5, 2);
      } else if (n.id === 'arrive') {
        g.fillRect(n.x, n.y + TH - 5, TW, 3);
        g.fillStyle = hex(CREAM);
        g.fillRect(n.x + 16, n.y + TH - 8, 8, 4);
      } else {
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
