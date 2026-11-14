// 签到面板（DOM，像素风同小游戏壳）：柜台前站定一个人 → 面板从底下滑上来，2×2 四张会员卡（肖像 + 名字 + 会籍 + 今天的预约），
// 下面一条"访客登记"。过期的月卡卡上多一个"续费"按钮。点错的卡变灰、打个叉，可以再点；点对了面板滑下去，下一位走上来再滑上来。
// 面板在拇指区（屏幕下 45%），卡和按钮都 ≥ 44 px；Pointer Events 的 click，键盘可选（1–4 选卡、0 / G 访客、R 续费对着的那张）。
import { portraitURL } from './portrait';
import type { Card } from './rules';

const CSS = `
.ci-block { position: fixed; inset: 0; z-index: 3; touch-action: none; }
.ci-bar { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
.ci-bar::before { content: ""; position: absolute; left: -17px; top: -6px; width: 34px; height: 6px; background: #2c2450; box-shadow: 2px 0 0 #171230, -2px 0 0 #171230, 0 2px 0 #171230, 0 -2px 0 #171230; }
.ci-bar i { position: absolute; left: -17px; top: -6px; height: 6px; background: #8fe36a; }
.ci-bar b { position: absolute; left: 0; top: -26px; transform: translateX(-50%); font: 700 12px/1 "PingFang SC", "Noto Sans SC", ui-monospace, monospace; color: #2c2450; background: #ffd23c; padding: 3px 5px; white-space: nowrap; box-shadow: 2px 0 0 #171230, -2px 0 0 #171230, 0 2px 0 #171230, 0 -2px 0 #171230; }
.ci-bar b:empty { display: none; }
.ci-bar.vip i { background: #ffd23c !important; }

.ci-panel { position: fixed; left: 0; right: 0; bottom: 0; z-index: 5; pointer-events: none; display: flex; justify-content: center; padding: 0 max(12px, env(safe-area-inset-right)) calc(max(12px, env(safe-area-inset-bottom)) + 4px) max(12px, env(safe-area-inset-left)); box-sizing: border-box; font: 700 14px/1.2 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px; -webkit-font-smoothing: none; user-select: none; -webkit-user-select: none; }
.ci-sheet { pointer-events: auto; width: min(400px, 100%); box-sizing: border-box; padding: 10px 10px 12px; display: flex; flex-direction: column; gap: 8px; background: #2c2450; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230; transform: translateY(calc(100% + 40px)); transition: transform 0.16s steps(4, end); touch-action: manipulation; }
.ci-panel.up .ci-sheet { transform: none; }
.ci-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; font-size: 14px; }
.ci-head span { color: #ffd23c; }
.ci-head em { font-style: normal; font-size: 12px; opacity: 0.8; }
.ci-head.vip { background: #ffd23c; color: #2c2450; margin: -4px -4px 0; padding: 3px 6px; }
.ci-head.vip span { color: #8a2a3a; }
.ci-head.vip em { opacity: 1; }
.ci-vipbar { height: 6px; background: #4a4270; position: relative; }
.ci-vipbar i { position: absolute; left: 0; top: 0; bottom: 0; background: #ffd23c; }
.ci-vipbar[hidden] { display: none; }
.ci-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.ci-card { position: relative; display: flex; flex-direction: column; gap: 5px; padding: 6px; min-height: 118px; border: 0; margin: 0; font: inherit; text-align: left; color: #2c2450; background: #fff3d6; cursor: pointer; -webkit-tap-highlight-color: transparent; box-shadow: 0 4px 0 0 #171230, inset 0 0 0 2px #c6bcd4; letter-spacing: 0; }
.ci-card:active { transform: translateY(2px); box-shadow: 0 2px 0 0 #171230, inset 0 0 0 2px #c6bcd4; }
.ci-card.empty { visibility: hidden; }
.ci-top { display: flex; gap: 6px; align-items: flex-start; min-width: 0; }
.ci-top img { width: 64px; height: 64px; flex: none; image-rendering: pixelated; box-shadow: 0 0 0 2px #2c2450; }
.ci-who { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ci-who b { font-size: 13px; line-height: 1.15; word-break: break-word; }
.ci-who small { font-size: 11px; opacity: 0.7; font-weight: 600; }
.ci-chip { align-self: flex-start; font-size: 11px; padding: 2px 5px; color: #fff3d6; background: #3a5cac; }
.ci-chip.founder { background: #b4862a; }
.ci-chip.monthly { background: #2a8890; }
.ci-chip.family { background: #cc5a5e; }
.ci-chip.expired { background: #8a2a3a; }
.ci-book { display: flex; align-items: center; min-height: 34px; font-size: 13px; padding: 0 4px; background: #e8dcc4; }
.ci-book::before { content: "预约 "; white-space: pre; opacity: 0.55; font-size: 11px; }
.ci-renew { min-height: 40px; border: 0; margin: 0; font: inherit; font-size: 15px; letter-spacing: 2px; color: #fff3d6; background: #d0663a; cursor: pointer; box-shadow: 0 3px 0 0 #7a3a4a; -webkit-tap-highlight-color: transparent; }
.ci-renew:active { transform: translateY(2px); box-shadow: 0 1px 0 0 #7a3a4a; }
.ci-card.wrong { background: #a8a4b4; color: #48425e; pointer-events: none; animation: ci-shake 0.3s steps(4, end); }
.ci-card.wrong::after { content: "✕"; position: absolute; left: 6px; top: 6px; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; font-size: 44px; color: #b43c4c; text-shadow: 2px 2px 0 #171230; }
.ci-card.wrong .ci-renew { background: #7c7690; box-shadow: none; }
.ci-card.right { background: #b8e05a; }
.ci-guest { min-height: 50px; border: 0; margin: 0; font: inherit; font-size: 17px; letter-spacing: 3px; color: #fff3d6; background: #5e5a6e; cursor: pointer; box-shadow: 0 4px 0 0 #171230, inset 0 0 0 2px #7c7690; -webkit-tap-highlight-color: transparent; }
.ci-guest:active { transform: translateY(2px); box-shadow: 0 2px 0 0 #171230; }
.ci-guest.wrong { background: #48425e; color: #7c7690; pointer-events: none; animation: ci-shake 0.3s steps(4, end); }
.ci-guest.right { background: #2f7a54; }
.ci-guest small { font-size: 11px; letter-spacing: 1px; opacity: 0.75; }
@keyframes ci-shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
@media (orientation: landscape) and (max-height: 500px) {
  .ci-card { min-height: 0; }
  .ci-top img { width: 32px; height: 32px; }
  .ci-grid { grid-template-columns: repeat(4, 1fr); }
}
`;

export interface PanelOpts {
  /** 点了一张卡（renew = 点的是卡上的"续费"） */
  onCard(id: string, renew: boolean): void;
  onGuest(): void;
}

export interface Panel {
  /** 滑上来，发这几张卡（3 张时第 4 格空着） */
  show(cards: Card[], vip: boolean): void;
  hide(): void;
  isUp(): boolean;
  /** 点错的那张变灰（id = null：访客登记点错） */
  wrong(id: string | null): void;
  right(id: string | null): void;
  /** VIP 倒数（null = 不是 VIP） */
  vipLeft(sec: number | null, limit: number): void;
  /** 整个面板（结算卡出来时藏起来） */
  setVisible(on: boolean): void;
  /** 无头测试：现在的卡 */
  cards(): Card[];
}

export function createPanel(o: PanelOpts): Panel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'ci-panel';
  root.innerHTML = `<div class="ci-sheet">
    <div class="ci-head"><span>这位是谁？</span><em>看衣服 · 帽子 · 眼镜</em></div>
    <div class="ci-vipbar" hidden><i></i></div>
    <div class="ci-grid"></div>
    <button type="button" class="ci-guest">访客登记 <small>· 没有卡</small></button>
  </div>`;
  document.body.appendChild(root);
  const head = root.querySelector('.ci-head') as HTMLElement;
  const headText = head.querySelector('span') as HTMLElement;
  const headHint = head.querySelector('em') as HTMLElement;
  const vipBar = root.querySelector('.ci-vipbar') as HTMLElement;
  const vipFill = vipBar.firstElementChild as HTMLElement;
  const grid = root.querySelector('.ci-grid') as HTMLElement;
  const guest = root.querySelector('.ci-guest') as HTMLButtonElement;
  guest.addEventListener('click', () => {
    if (up) o.onGuest();
  });

  let up = false;
  let current: Card[] = [];
  const els = new Map<string, HTMLElement>();

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

  function show(cards: Card[], vip: boolean) {
    current = cards;
    els.clear();
    grid.textContent = '';
    for (let i = 0; i < 4; i++) {
      const c = cards[i];
      const el = document.createElement('div');
      el.setAttribute('role', 'button');
      el.className = 'ci-card';
      if (!c) {
        el.classList.add('empty');
        grid.appendChild(el);
        continue;
      }
      el.dataset.id = c.id;
      const chip = c.expired
        ? `<span class="ci-chip expired">${c.label} · 已过期</span>`
        : `<span class="ci-chip ${c.kind}">${c.label}</span>`;
      el.innerHTML = `<div class="ci-top"><img alt="" src="${portraitURL(c.id, c.look, c.age)}">
        <div class="ci-who"><b>${esc(c.name)}</b>${chip}</div></div>
        ${c.expired ? '<button type="button" class="ci-renew">续费 +150</button>' : `<div class="ci-book">${esc(c.booking)}</div>`}`;
      el.addEventListener('click', (e) => {
        if (!up) return;
        const renew = (e.target as HTMLElement).closest('.ci-renew') !== null;
        o.onCard(c.id, renew);
      });
      els.set(c.id, el);
      grid.appendChild(el);
    }
    guest.className = 'ci-guest';
    head.classList.toggle('vip', vip);
    headText.textContent = vip ? '★ VIP 到了！' : '这位是谁？';
    headHint.textContent = vip ? '6 秒内接待' : '看衣服 · 帽子 · 眼镜';
    vipBar.hidden = !vip;
    up = true;
    root.classList.add('up');
  }

  function hide() {
    up = false;
    root.classList.remove('up');
  }

  addEventListener('keydown', (e) => {
    if (!up || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '4') {
      const c = current[Number(k) - 1];
      if (c && !els.get(c.id)?.classList.contains('wrong')) o.onCard(c.id, false);
    } else if (k === '0' || k === 'g') o.onGuest();
  });

  return {
    show,
    hide,
    isUp: () => up,
    wrong(id) {
      if (id === null) guest.classList.add('wrong');
      else els.get(id)?.classList.add('wrong');
    },
    right(id) {
      if (id === null) guest.classList.add('right');
      else els.get(id)?.classList.add('right');
    },
    vipLeft(sec, limit) {
      if (sec === null) return;
      vipFill.style.width = `${Math.max(0, Math.min(100, (sec / limit) * 100)).toFixed(1)}%`;
      headHint.textContent = `${Math.max(0, sec).toFixed(1)} 秒内接待`;
    },
    setVisible(on) {
      root.style.display = on ? '' : 'none';
    },
    cards: () => current,
  };
}
