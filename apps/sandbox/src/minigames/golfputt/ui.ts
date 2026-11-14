// 果岭推杆自己的界面（壳的 HUD、开局卡、结算卡之外）：右下的「看坡」键、拖杆时球上方的力度条、
// 左上的洞牌（第几洞、标准杆、多远）、两洞之间的记分卡（九格 + 这洞的印章：小鸟 / 标准杆 / 柏忌……）。
// 像素风同壳（深靛底 #2c2450 + 奶油描边 + 方块投影，金色是数字）；z-index 5：在 play 的界面（4）上面、壳（6）下面，
// 壳的结算卡盖得住它。
import { type HoleResult, toPar, type VerdictKey, verdict } from './rules';

const CSS = `
.gp-root { position: fixed; inset: 0; z-index: 5; pointer-events: none; font: 700 14px/1.25 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px; -webkit-font-smoothing: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.gp-root [hidden] { display: none !important; }
.gp-px { background: #2c2450; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230; }
.gp-look { position: absolute; right: max(18px, calc(env(safe-area-inset-right) + 8px)); bottom: max(22px, calc(env(safe-area-inset-bottom) + 10px)); width: 84px; height: 84px; margin: 3px; border: 0; padding: 0; pointer-events: auto; font: inherit; font-size: 19px; color: #fff3d6; background: #2f7a54; cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
.gp-look small { font-size: 10px; opacity: 0.85; letter-spacing: 0; }
.gp-look.on { background: #ffd23c; color: #2c2450; }
.gp-look:active { transform: translateY(3px); }
.gp-plate { position: absolute; left: max(16px, calc(env(safe-area-inset-left) + 8px)); bottom: max(28px, calc(env(safe-area-inset-bottom) + 16px)); max-width: calc(100vw - 150px); padding: 6px 10px 7px; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.gp-plate b { font-size: 15px; color: #ffd23c; }
.gp-plate span { opacity: 0.85; }
.gp-power { font-size: 14px; position: absolute; left: 50%; top: max(150px, calc(env(safe-area-inset-top) + 142px)); transform: translateX(-50%); padding: 5px 7px 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; white-space: nowrap; }
.gp-bar { display: flex; gap: 2px; }
.gp-bar i { width: 10px; height: 12px; background: #4a4270; }
.gp-bar i.on { background: #8fe36a; }
.gp-bar i.on.hot { background: #ffd23c; }
.gp-bar i.on.max { background: #ff7a7a; }
.gp-shade { position: absolute; inset: 0; background: rgba(23, 18, 48, 0.38); pointer-events: auto; display: flex; align-items: flex-end; justify-content: center; padding: 0 max(12px, env(safe-area-inset-right)) calc(max(24px, env(safe-area-inset-bottom)) + 10px) max(12px, env(safe-area-inset-left)); box-sizing: border-box; touch-action: none; }
@media (orientation: landscape) { .gp-shade { align-items: center; } }
.gp-card { width: min(366px, 100%); padding: 14px 12px 16px; margin: 6px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; position: relative; }
.gp-card h2 { margin: 0; font-size: 19px; color: #ffd23c; letter-spacing: 2px; }
.gp-card .gp-sub { font-size: 12px; opacity: 0.85; margin-top: -8px; }
.gp-stamp { position: absolute; right: 10px; top: -44px; padding: 6px 12px; font-size: 22px; letter-spacing: 3px; transform: rotate(-8deg); border: 4px solid currentColor; background: #2c2450; box-shadow: 0 4px 0 0 #171230; animation: gp-stamp 0.45s steps(4, end) both; }
@keyframes gp-stamp { 0% { transform: rotate(-8deg) scale(2.6); opacity: 0; } 60% { transform: rotate(-8deg) scale(0.9); opacity: 1; } 100% { transform: rotate(-8deg) scale(1); } }
.gp-grid { display: grid; grid-template-columns: 34px repeat(9, 1fr) 40px; gap: 2px; font-size: 12px; text-align: center; font-variant-numeric: tabular-nums; }
.gp-grid div { padding: 3px 0; background: #3a3164; }
.gp-grid .h { background: transparent; opacity: 0.75; font-size: 10px; }
.gp-grid .lab { background: transparent; text-align: left; font-size: 10px; opacity: 0.8; padding-left: 2px; }
.gp-grid .cur { outline: 2px solid #ffd23c; outline-offset: -2px; }
.gp-grid .tot { color: #ffd23c; }
.gp-grid .s { font-size: 14px; }
.gp-v-ace, .gp-v-eagle { color: #2c2450; background: #ffd23c !important; }
.gp-v-birdie { color: #2c2450; background: #8fe36a !important; border-radius: 50%; }
.gp-v-par { color: #fff3d6; }
.gp-v-bogey { color: #fff3d6; background: #b4572a !important; }
.gp-v-double, .gp-v-worse { color: #fff3d6; background: #8a2a3a !important; }
.gp-stamp.gp-v-ace, .gp-stamp.gp-v-eagle { color: #ffd23c; background: #2c2450 !important; }
.gp-stamp.gp-v-birdie { color: #8fe36a; background: #2c2450 !important; border-radius: 0; }
.gp-stamp.gp-v-par { color: #fff3d6; }
.gp-stamp.gp-v-bogey { color: #ff9a5a; background: #2c2450 !important; }
.gp-stamp.gp-v-double, .gp-stamp.gp-v-worse { color: #ff7a7a; background: #2c2450 !important; }
.gp-row { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
.gp-row b { color: #ffd23c; }
.gp-next { pointer-events: auto; border: 0; margin: 3px; min-height: 56px; padding: 0 18px; font: inherit; font-size: 19px; letter-spacing: 3px; color: #fff3d6; background: #c0545a; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230; }
.gp-next:active { transform: translateY(3px); }
.gp-next small { font-size: 12px; opacity: 0.8; letter-spacing: 1px; }
`;

const VERDICT_SHORT: Record<VerdictKey, string> = {
  ace: '一杆进洞！',
  eagle: '老鹰！',
  birdie: '小鸟！',
  par: '标准杆',
  bogey: '柏忌',
  double: '双柏忌',
  worse: '捡起',
};

export interface CardHole {
  par: number;
  result: HoleResult | null;
}

export function createGolfUi(o: { onLook: () => void; onNext: () => void }) {
  if (!document.getElementById('gp-css')) {
    const s = document.createElement('style');
    s.id = 'gp-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  const root = document.body.appendChild(document.createElement('div'));
  root.className = 'gp-root';
  root.innerHTML = `
    <div class="gp-plate gp-px" hidden><b></b><span></span></div>
    <div class="gp-power gp-px" hidden><div class="gp-bar">${'<i></i>'.repeat(10)}</div><span></span></div>
    <button class="gp-look gp-px" type="button" hidden>看坡<small>坡往哪流</small></button>
    <div class="gp-shade" hidden><div class="gp-card gp-px"></div></div>
  `;
  const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const plate = q<HTMLDivElement>('.gp-plate');
  const power = q<HTMLDivElement>('.gp-power');
  const bars = [...power.querySelectorAll('i')];
  const powerText = power.querySelector('span') as HTMLSpanElement;
  const look = q<HTMLButtonElement>('.gp-look');
  const shade = q<HTMLDivElement>('.gp-shade');
  const card = q<HTMLDivElement>('.gp-card');
  look.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    o.onLook();
  });
  look.addEventListener('contextmenu', (e) => e.preventDefault());
  let nextBtn: HTMLButtonElement | null = null;

  return {
    root,
    setLook(visible: boolean, on: boolean) {
      look.hidden = !visible;
      look.classList.toggle('on', on);
      look.firstChild!.textContent = on ? '收起' : '看坡';
      (look.querySelector('small') as HTMLElement).textContent = on ? '关掉流线' : '坡往哪流';
    },
    setPlate(title: string | null, sub = '') {
      plate.hidden = title === null;
      if (title === null) return;
      (plate.firstChild as HTMLElement).textContent = title;
      (plate.lastChild as HTMLElement).textContent = sub;
    },
    /** 力度条：k 0..1、文字（null = 藏起来）；在画面上方正中（不挡球、不挡总监） */
    setPower(k: number | null, text = '') {
      power.hidden = k === null;
      if (k === null) return;
      const n = Math.round(k * 10);
      bars.forEach((b, i) => {
        b.className = i < n ? (k >= 0.99 ? 'on max' : i >= 7 ? 'on hot' : 'on') : '';
      });
      powerText.textContent = text;
    },
    /** 两洞之间的记分卡 */
    showCard(opts: {
      hole: number;
      name: string;
      holes: CardHole[];
      result: HoleResult;
      total: number;
      points: number;
      last: boolean;
    }) {
      const v = opts.result.picked
        ? { key: 'worse' as const, name: '捡起' }
        : verdict(opts.result.par, opts.result.strokes);
      const done = opts.holes.filter((h) => h.result);
      const parSum = done.reduce((s, h) => s + h.par, 0);
      const strokeSum = done.reduce((s, h) => s + (h.result?.strokes ?? 0), 0);
      const cells = (row: (h: CardHole, i: number) => string, cls: (h: CardHole, i: number) => string) =>
        opts.holes
          .map((h, i) => `<div class="${cls(h, i)}${i === opts.hole ? ' cur' : ''}">${row(h, i)}</div>`)
          .join('');
      const vk = (h: CardHole) =>
        h.result ? (h.result.picked ? 'worse' : verdict(h.result.par, h.result.strokes).key) : '';
      card.innerHTML = `
        <div class="gp-stamp gp-v-${v.key}">${opts.result.picked ? '捡起' : VERDICT_SHORT[v.key]}</div>
        <h2>第 ${opts.hole + 1} 洞 · ${opts.name}</h2>
        <div class="gp-sub">标准杆 ${opts.result.par} · 用了 ${opts.result.strokes} 杆${opts.result.penalties ? `（含罚 ${opts.result.penalties}）` : ''}${opts.result.quick ? ' · 快手 ✓' : ''}</div>
        <div class="gp-grid">
          <div class="lab">洞</div>${cells(
            (_, i) => `${i + 1}`,
            () => 'h',
          )}<div class="h">合计</div>
          <div class="lab">标准</div>${cells(
            (h) => `${h.par}`,
            () => '',
          )}<div class="tot">${parSum}</div>
          <div class="lab">杆数</div>${cells(
            (h) => (h.result ? `${h.result.strokes}` : '·'),
            (h) => `s gp-v-${vk(h)}`,
          )}<div class="tot s">${strokeSum}</div>
        </div>
        <div class="gp-row"><span>对标准杆</span><b>${toPar(strokeSum - parSum)}</b></div>
        <div class="gp-row"><span>这洞得分</span><b>+${opts.points}</b></div>
        <button class="gp-next" type="button">${opts.last ? '看总成绩' : '下一洞 ▸'} <small></small></button>
      `;
      nextBtn = card.querySelector('.gp-next');
      nextBtn?.addEventListener('click', () => o.onNext());
      shade.hidden = false;
    },
    /** 记分卡按钮上的倒计时 */
    setCountdown(sec: number | null) {
      const s = nextBtn?.querySelector('small');
      if (s) s.textContent = sec === null ? '' : `${Math.ceil(sec)}`;
    },
    hideCard() {
      shade.hidden = true;
      nextBtn = null;
    },
    cardOpen: () => !shade.hidden,
  };
}

export type GolfUi = ReturnType<typeof createGolfUi>;
