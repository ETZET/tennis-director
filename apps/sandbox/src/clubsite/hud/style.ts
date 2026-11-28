// 像素界面的样式（mountPixelHud 第一次挂载时塞进 <head>）。界面只占三个角：左上日钟、右上钱、右下图标按钮；画面中间不放字。
// 所有像素图（canvas）按整数倍放大、最近邻（大小由 index.ts 按纹素倍数 --s 设）。点击目标 ≥ 48 px。
// body.pxh-on 时把旧的文字界面（clubsite/play 的顶栏、按钮、气泡、提示，像素级别牌子、小地图、地点名、名字小牌）藏起来；
// body.pxh-debug 再把调试的那几块（像素级别、模拟状态条）放出来。
import { CREAM, hex, INK, INK_SHADOW, KEYS } from './colors';
import { pxFont, pxOutline } from './pxfont';

const ink = hex(INK);
const shadow = hex(INK_SHADOW);
const cream = hex(CREAM);
/** 奶油牌子：2 px 墨色描边 + 下面 2 px 深影（一纹素） */
const SIGN = `background: ${cream}; box-shadow: 2px 0 0 0 ${ink}, -2px 0 0 0 ${ink}, 0 2px 0 0 ${ink}, 0 -2px 0 0 ${ink}, 0 4px 0 0 ${shadow}, 2px 2px 0 0 ${shadow}, -2px 2px 0 0 ${shadow};`;

export const HUD_CSS = `
.pxh-root { --s: 2; position: fixed; inset: 0; z-index: 7; pointer-events: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.pxh-root [hidden] { display: none !important; }
.pxh-px { display: block; image-rendering: pixelated; image-rendering: crisp-edges; flex: none; }
/* 浮动的话：12 px 点阵中文（pxfont.ts，按纹素放大，和图标同一个网格）+ 一纹素墨描边 + 一纹素深影 */
.pxh-txt { font: ${pxFont()}; white-space: nowrap; -webkit-font-smoothing: none; font-smooth: never; ${pxOutline(ink, shadow)} }
.pxh-txt.ink { text-shadow: none; color: ${ink} !important; }
.pxh-txt.name { opacity: 0.92; }
.pxh-date { display: flex; flex-direction: column; align-items: center; gap: 0; }
.pxh-time.jump { color: ${hex(KEYS.X)} !important; }
.pxh-root button { border: 0; margin: 0; padding: 0; background: none; cursor: pointer; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; }
.pxh-root button:focus-visible { outline: 2px solid ${cream}; outline-offset: 2px; }

/* 左上：日钟 + 日期 */
.pxh-clock { position: absolute; left: max(6px, env(safe-area-inset-left)); top: max(6px, env(safe-area-inset-top)); display: flex; flex-direction: column; align-items: center; gap: calc(var(--s) * 1px); min-width: 48px; min-height: 48px; }
.pxh-clock:active .pxh-px:first-child { transform: translateY(2px); }

/* 右上：钱 */
.pxh-money { position: absolute; right: max(10px, env(safe-area-inset-right)); top: max(10px, calc(env(safe-area-inset-top) + 4px)); display: flex; align-items: center; gap: calc(var(--s) * 2px); }

/* 右下（拇指区）：一行 [名册][地图][动作键]，动作键在最右下角；拿 / 放叠在动作键上面。三个按钮同一种墨色底板（index.ts 的 plateCanvas） */
.pxh-dock { position: absolute; right: calc(env(safe-area-inset-right) + var(--s) * 6px); bottom: calc(env(safe-area-inset-bottom) + var(--s) * 6px); display: flex; flex-direction: column; align-items: flex-end; gap: calc(var(--s) * 3px); }
.pxh-row { display: flex; align-items: flex-end; gap: calc(var(--s) * 3px); }
.pxh-btn { position: relative; min-width: 48px; min-height: 48px; display: grid; place-items: center; }
.pxh-btn > * { grid-area: 1 / 1; }
.pxh-btn.down > .pxh-px, .pxh-btn.on > .pxh-px { transform: translateY(calc(var(--s) * 1px)); }
.pxh-money .pxh-px:first-child { filter: drop-shadow(0 calc(var(--s) * 1px) 0 rgba(23, 18, 48, 0.55)); }
.pxh-act { width: calc(var(--s) * 28px); height: calc(var(--s) * 29px); }
.pxh-pick { width: calc(var(--s) * 24px); height: calc(var(--s) * 25px); margin-right: calc(var(--s) * 2px); }
.pxh-fixed { width: calc(var(--s) * 24px); height: calc(var(--s) * 25px); }
.pxh-btn .pxh-icon { position: relative; margin-bottom: calc(var(--s) * 1px); }
.pxh-btn .pxh-key { position: absolute; right: calc(var(--s) * -1px); top: calc(var(--s) * -3px); }
.pxh-btn .pxh-dot { position: absolute; right: calc(var(--s) * -2px); top: calc(var(--s) * -2px); animation: pxh-bob 0.9s steps(2, end) infinite; }
/* 没活：动作键不画（槽位留着，名册、地图不跳）；拿 / 放整个不出现 */
.pxh-act.empty { pointer-events: none; }
.pxh-pick.empty { display: none; }
.pxh-mood.read { visibility: hidden; transition: visibility 0s 0.32s; }
.pxh-use.on .pxh-icon { animation: pxh-bob 0.36s steps(2, end) infinite; }
@keyframes pxh-bob { 50% { transform: translateY(calc(var(--s) * -1px)); } }
/* 按钮名的小奶油牌子（长按 / 第一次出现）：在这一行按钮的上面、右对齐，隔开 4 纹素，不压按钮 */
.pxh-sign { padding: 3px 7px; ${SIGN} margin-bottom: calc(var(--s) * 2px); transition: opacity 0.3s steps(3, end); }
.pxh-sign.gone { opacity: 0; }

/* 有人在找你：屏幕边的小人头（墨底板 + 他的小人头 + 朝他的箭头） */
.pxh-edge { position: absolute; left: 0; top: 0; pointer-events: auto; }
.pxh-edge .pxh-earrow { position: absolute; }
.pxh-edge[data-dir='r'] .pxh-earrow { right: calc(var(--s) * -2px); top: 50%; margin-top: calc(var(--s) * -4px); }
.pxh-edge[data-dir='l'] .pxh-earrow { left: calc(var(--s) * -2px); top: 50%; margin-top: calc(var(--s) * -4px); }
.pxh-edge[data-dir='u'] .pxh-earrow { top: calc(var(--s) * -2px); left: 50%; margin-left: calc(var(--s) * -4px); }
.pxh-edge[data-dir='d'] .pxh-earrow { bottom: calc(var(--s) * -2px); left: 50%; margin-left: calc(var(--s) * -4px); }
.pxh-seekdot .pxh-px { animation: pxh-bob 0.6s steps(2, end) infinite; }

/* 这儿有活：大一号的实心泡，慢慢上下跳（两格），点不了（点地面照样走过去） */
.pxh-job { position: absolute; left: 0; top: 0; pointer-events: none; }
.pxh-job .pxh-px { animation: pxh-bob 1.1s steps(2, end) infinite; }
.pxh-edge-job { pointer-events: none; }
/* 进账：金币右上那块下面浮一行"图标 + 数字"（金币 +5 · 小钟 3 · 心 +0.3），往上飘 1 纹素 × 4 就消失 */
.pxh-gcell { display: flex; align-items: center; gap: calc(var(--s) * 1px); }
.pxh-cpop { position: absolute; right: max(10px, env(safe-area-inset-right)); top: calc(max(10px, calc(env(safe-area-inset-top) + 4px)) + var(--s) * 15px); display: flex; align-items: center; gap: calc(var(--s) * 2px); transition: opacity 0.3s steps(3, end); }
.pxh-cpop.up { animation: pxh-cup 2.6s steps(4, end) forwards; }
.pxh-cpop.gone { opacity: 0; }
@keyframes pxh-cup { from { transform: translateY(calc(var(--s) * 4px)); } to { transform: translateY(0); } }

/* 场景里人头上的心情泡、点开以后的一句话 */
.pxh-moods { position: absolute; inset: 0; overflow: hidden; }
.pxh-mood { position: absolute; left: 0; top: 0; padding: 11px; pointer-events: auto; animation: pxh-dim 0.3s steps(2, end) 3.5s forwards; }
@keyframes pxh-dim { to { opacity: 0.5; } }
.pxh-mood.pop .pxh-px { animation: pxh-pop 0.3s steps(3, end); transform-origin: 20% 100%; }
@keyframes pxh-pop { 0% { transform: scale(0.4); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
/* 浮动的一行字（同参考：画面上方一行白字黑边，过一会儿消失）+ 弹出来的东西 */
.pxh-toast { position: absolute; left: 50%; top: calc(max(6px, env(safe-area-inset-top)) + 122px); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; transition: opacity 0.4s steps(3, end); }
.pxh-toast.gone { opacity: 0; }
.pxh-toast.tap { pointer-events: auto; cursor: pointer; }
.pxh-line { display: flex; align-items: center; gap: 4px; max-width: calc(100vw - 24px); }
.pxh-line .pxh-txt { white-space: nowrap; flex: none; }
/* 说的那句话：一行，放不下就截断（第四轮：最多一行） */
.pxh-line .pxh-txt:last-child { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pxh-toast .pxh-item { animation: pxh-item 0.5s steps(5, end); }
@keyframes pxh-item { 0% { transform: scale(0.2) translateY(30px); } 60% { transform: scale(1.15) translateY(-4px); } 100% { transform: scale(1); } }
/* 地名：画面最上沿、日钟和金币之间（不压记分牌、不压总监）；不带底的奶油字（路牌是奶油纸牌，两样分得开） */
.pxh-place { position: absolute; left: 50%; top: calc(max(6px, env(safe-area-inset-top)) + var(--s) * 4px); transform: translateX(-50%); opacity: 0; white-space: nowrap; }
.pxh-place.show { animation: pxh-place var(--dur, 1.6s) steps(12, end) forwards; }
@keyframes pxh-place { 0% { opacity: 0; } 12% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }

/* 开局的操作提示：手指在总监前面点两下地面（第四轮：不写字，只出一次）。元素的原点 = 指尖点的地方 */
.pxh-hint { position: absolute; left: 0; top: 0; width: 0; height: 0; transition: opacity 0.5s steps(3, end); }
.pxh-hint.gone { opacity: 0; }
.pxh-hint .pxh-finger { position: absolute; left: calc(var(--s) * -4px); top: calc(var(--s) * -1px); animation: pxh-tap 1.4s steps(1, end) infinite; }
.pxh-hint .pxh-ripple { position: absolute; left: calc(var(--s) * -7px); top: calc(var(--s) * -4px); opacity: 0; animation: pxh-ripple 1.4s steps(4, end) infinite; }
@keyframes pxh-tap { 0% { transform: translateY(calc(var(--s) * 5px)); } 35% { transform: translateY(0); } 70% { transform: translateY(calc(var(--s) * 5px)); } }
@keyframes pxh-ripple { 0%, 34% { opacity: 0; transform: scale(0.4); } 36% { opacity: 1; transform: scale(0.5); } 70% { opacity: 0.9; transform: scale(1.3); } 100% { opacity: 0; transform: scale(1.6); } }

/* 互动点头上的小箭头（像素图，两格一跳） */
.pxh-mark { position: absolute; left: 0; top: 0; }
.pxh-mark .pxh-px { animation: pxh-bob 0.9s steps(2, end) infinite; }
.pxh-focus { z-index: 21; }

/* 旧的文字界面：藏起来（调试时放出来一部分） */
body.pxh-on .play-mark, body.pxh-on .play-bar, body.pxh-on .play-hint, body.pxh-on .play-bubbles, body.pxh-on .play-toast, body.pxh-on .play-buttons,
body.pxh-on #pxsel, body.pxh-on #place, body.pxh-on #minimap, body.pxh-on .cast-open, body.pxh-on .cast-tags { display: none !important; }
body.pxh-on.pxh-debug #pxsel { display: flex !important; left: 12px; bottom: 8px; top: auto; flex-direction: column-reverse; }
body.pxh-on.pxh-debug .play-bar { display: flex !important; top: auto !important; bottom: max(70px, calc(env(safe-area-inset-bottom) + 62px)); left: 12px; transform: none; flex-wrap: wrap; max-width: calc(100vw - 150px); white-space: normal; }
body.pxh-on.pxh-map #minimap { display: block !important; left: 50%; right: auto; top: max(20%, 120px); transform: translateX(-50%); width: min(376px, calc(100vw - 16px)); height: auto; box-shadow: 2px 0 0 0 ${ink}, -2px 0 0 0 ${ink}, 0 2px 0 0 ${ink}, 0 -2px 0 0 ${ink}, 0 4px 0 0 ${shadow}; pointer-events: auto; z-index: 8; }
`;
