// 餐车出餐的画面叠层（DOM，在 play 的按钮下面、壳的 HUD 和卡下面）：
// - 点单气泡：客人头顶一个像素对话框（吃的小图 + 耐心条），底色跟着耐心绿 → 橙 → 红；最急的那单大一圈、闪
// - 窗口牌：每个窗口上方一块小牌（做什么、做到几成、做好了跳"好了"）
// 立即模式：每帧 begin() → bubble(...) → end()，这一帧没画到的元素收起来。像素风同壳（style.ts）：深靛底、奶油描边、方块投影。
import { type IconId, iconUrl } from './icons';

type V3Like = { x: number; y: number; z: number };

const CSS = `
.ft-layer { position: fixed; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; font: 700 11px/1.1 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px; -webkit-font-smoothing: none; user-select: none; -webkit-user-select: none; }
.ft-el { position: absolute; left: 0; top: 0; will-change: transform; }
.ft-in { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 3px 3px 4px; background: var(--bg, #2c2450);
  box-shadow: 2px 0 0 0 #fff3d6, -2px 0 0 0 #fff3d6, 0 2px 0 0 #fff3d6, 0 -2px 0 0 #fff3d6, 0 4px 0 0 #171230, 2px 2px 0 0 #171230, -2px 2px 0 0 #171230; }
.ft-in img { display: block; width: 30px; height: 30px; image-rendering: pixelated; }
.ft-bar { display: block; width: 30px; height: 5px; background: #171230; }
.ft-bar b { display: block; height: 100%; background: #fff3d6; }
/* 气泡的尾巴：一个朝下的方块三角 */
.ft-bub .ft-in::after { content: ""; position: absolute; left: 50%; bottom: -10px; margin-left: -5px; border: 5px solid transparent; border-top: 6px solid #fff3d6; }
.ft-bub.green { --bg: #2f7a54; }
.ft-bub.orange { --bg: #c46a1c; }
.ft-bub.red { --bg: #b8323a; }
.ft-bub.red .ft-in { animation: ft-shake 0.3s steps(2, end) infinite; }
.ft-bub.happy { --bg: #2f7a54; }
.ft-bub.angry { --bg: #8a2a3a; }
.ft-bub.urgent .ft-in { box-shadow: 3px 0 0 0 #ffd23c, -3px 0 0 0 #ffd23c, 0 3px 0 0 #ffd23c, 0 -3px 0 0 #ffd23c, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230; }
.ft-bub.urgent .ft-in::after { border-top-color: #ffd23c; }
.ft-bub.edge .ft-in { transform: translate(-50%, -50%) scale(0.8); }
.ft-bub.edge .ft-in::after { display: none; }
.ft-bub.done .ft-in { animation: ft-up 0.9s steps(6, end) both; }
.ft-st .ft-in { padding: 3px 4px 4px; gap: 2px; }
.ft-st .ft-in img { width: 24px; height: 24px; }
.ft-st .ft-in span { white-space: nowrap; font-size: 10px; }
.ft-st .ft-bar { width: 30px; height: 4px; }
.ft-st.idle .ft-in { opacity: 0.86; }
.ft-st.cook { --bg: #4a3c84; }
.ft-st.ready { --bg: #2f7a54; }
.ft-st.ready .ft-in { animation: ft-bob 0.6s steps(2, end) infinite; }
.ft-st.want .ft-in { box-shadow: 2px 0 0 0 #ffd23c, -2px 0 0 0 #ffd23c, 0 2px 0 0 #ffd23c, 0 -2px 0 0 #ffd23c, 0 4px 0 0 #171230; }
.mg-paused .ft-bub { display: none; }
@keyframes ft-shake { 50% { margin-left: 2px; } }
@keyframes ft-bob { 50% { margin-top: -4px; } }
@keyframes ft-up { 0% { opacity: 1; } 100% { opacity: 0; margin-top: -24px; } }
`;

export interface BubbleSpec {
  icon: IconId;
  /** 耐心条（0..1；null = 不画条） */
  frac: number | null;
  /** 样式类：气泡 green / orange / red / happy / angry；窗口牌 idle / cook / ready */
  cls: string;
  /** 窗口牌下面的字 */
  text?: string;
  /** 最急的一单：金边 */
  urgent?: boolean;
  /** 窗口牌：现在要去这里（金边） */
  want?: boolean;
  /** 画面外贴边（气泡默认 true） */
  edge?: boolean;
}

interface El {
  root: HTMLDivElement;
  img: HTMLImageElement;
  bar: HTMLElement;
  fill: HTMLElement;
  text: HTMLSpanElement | null;
  icon: IconId | null;
  cls: string;
  seen: boolean;
}

export function createOverlay(project: (p: V3Like) => { x: number; y: number }) {
  if (!document.getElementById('ft-css')) {
    const st = document.createElement('style');
    st.id = 'ft-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const layer = document.body.appendChild(document.createElement('div'));
  layer.className = 'ft-layer';
  const els = new Map<string, El>();

  const make = (key: string, kind: 'bub' | 'st'): El => {
    const root = document.createElement('div');
    root.className = `ft-el ft-${kind}`;
    const inner = root.appendChild(document.createElement('div'));
    inner.className = 'ft-in';
    const img = inner.appendChild(document.createElement('img'));
    img.alt = '';
    const text = kind === 'st' ? inner.appendChild(document.createElement('span')) : null;
    const bar = inner.appendChild(document.createElement('i'));
    bar.className = 'ft-bar';
    const fill = bar.appendChild(document.createElement('b'));
    layer.appendChild(root);
    const el: El = { root, img, bar, fill, text, icon: null, cls: '', seen: true };
    els.set(key, el);
    return el;
  };

  let W = 0;
  let H = 0;
  return {
    begin(w: number, h: number) {
      W = w;
      H = h;
      for (const e of els.values()) e.seen = false;
    },
    /** 一个气泡 / 窗口牌（key 不变 = 同一个元素） */
    draw(key: string, at: V3Like, s: BubbleSpec, kind: 'bub' | 'st' = 'bub') {
      const e = els.get(key) ?? make(key, kind);
      e.seen = true;
      if (e.icon !== s.icon) {
        e.img.src = iconUrl(s.icon);
        e.icon = s.icon;
      }
      const p = project(at);
      const mx = 34;
      const top = 150;
      const bottom = H - 30;
      const out = p.x < mx || p.x > W - mx || p.y < top || p.y > bottom + 40;
      const edge = (s.edge ?? kind === 'bub') && out;
      const x = Math.min(W - mx, Math.max(mx, p.x));
      const y = Math.min(bottom, Math.max(top, p.y));
      const cls = `ft-el ft-${kind} ${s.cls}${s.urgent ? ' urgent' : ''}${s.want ? ' want' : ''}${edge ? ' edge' : ''}`;
      if (cls !== e.cls) {
        e.root.className = cls;
        e.cls = cls;
      }
      // 窗口牌：左右夹进画面（贴边的那半块别切掉）；上下出了画面就不画
      const sx = kind === 'st' ? Math.min(W - 44, Math.max(44, p.x)) : p.x;
      e.root.style.transform = `translate(${Math.round(edge ? x : sx)}px, ${Math.round(edge ? y : p.y)}px)`;
      e.root.style.display = kind === 'st' && (p.y < 60 || p.y > H + 40 || p.x < -60 || p.x > W + 60) ? 'none' : '';
      e.bar.style.display = s.frac === null ? 'none' : '';
      if (s.frac !== null) e.fill.style.width = `${Math.round(Math.max(0, Math.min(1, s.frac)) * 100)}%`;
      if (e.text && e.text.textContent !== (s.text ?? '')) e.text.textContent = s.text ?? '';
    },
    end() {
      for (const [k, e] of els) {
        if (e.seen) continue;
        e.root.remove();
        els.delete(k);
      }
    },
    clear() {
      for (const e of els.values()) e.root.remove();
      els.clear();
    },
  };
}
