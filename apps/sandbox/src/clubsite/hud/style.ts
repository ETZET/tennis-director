// 像素界面的样式（mountPixelHud 第一次挂载时塞进 <head>）。界面只占三个角：左上日钟、右上钱、右下图标按钮；画面中间不放字。
// 所有像素图（canvas）按整数倍放大、最近邻（大小由 index.ts 按纹素倍数 --s 设）。点击目标 ≥ 48 px。
// body.pxh-on 时把旧的文字界面（clubsite/play 的顶栏、按钮、气泡、提示，像素级别牌子、小地图、地点名、名字小牌）藏起来；
// body.pxh-debug 再把调试的那几块（像素级别、模拟状态条）放出来。
import { CREAM, hex, INK, INK_SHADOW } from './colors';

const ink = hex(INK);
const shadow = hex(INK_SHADOW);
const cream = hex(CREAM);
/** 奶油牌子：2 px 墨色描边 + 下面 2 px 深影（一纹素） */
const SIGN = `background: ${cream}; box-shadow: 2px 0 0 0 ${ink}, -2px 0 0 0 ${ink}, 0 2px 0 0 ${ink}, 0 -2px 0 0 ${ink}, 0 4px 0 0 ${shadow}, 2px 2px 0 0 ${shadow}, -2px 2px 0 0 ${shadow};`;

export const HUD_CSS = `
.pxh-root { --s: 2; position: fixed; inset: 0; z-index: 7; pointer-events: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.pxh-root [hidden] { display: none !important; }
.pxh-px { display: block; image-rendering: pixelated; image-rendering: crisp-edges; flex: none; }
/* 浮动的话：平滑的系统字 + 1 px 墨色细描边 + 下面 1 px 深影（同参考的浮动中文），不做阈值伪像素 */
.pxh-txt { font: 600 calc(var(--s) * 6px + 1px)/1.25 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif; letter-spacing: 0.5px; white-space: nowrap;
  text-shadow: 1px 0 0 ${ink}, -1px 0 0 ${ink}, 0 1px 0 ${ink}, 0 -1px 0 ${ink}, 1px 1px 0 ${ink}, -1px 1px 0 ${ink}, 1px -1px 0 ${ink}, -1px -1px 0 ${ink}, 0 2px 0 ${shadow}; }
.pxh-txt.ink { text-shadow: none; font-weight: 700; color: ${ink} !important; }
.pxh-txt.name { opacity: 0.92; }
.pxh-date { display: flex; align-items: center; gap: calc(var(--s) * 1px); }
.pxh-root button { border: 0; margin: 0; padding: 0; background: none; cursor: pointer; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; }
.pxh-root button:focus-visible { outline: 2px solid ${cream}; outline-offset: 2px; }

/* 左上：日钟 + 日期 */
.pxh-clock { position: absolute; left: max(6px, env(safe-area-inset-left)); top: max(6px, env(safe-area-inset-top)); display: flex; flex-direction: column; align-items: center; gap: calc(var(--s) * 1px); min-width: 48px; min-height: 48px; }
.pxh-clock:active .pxh-px:first-child { transform: translateY(2px); }
/* 点日钟冒出来的小牌子（星期几 + 天气图标），一两秒消失 */
.pxh-tip { position: absolute; left: max(6px, env(safe-area-inset-left)); top: calc(max(6px, env(safe-area-inset-top)) + var(--s) * 50px); display: flex; align-items: center; gap: 6px; transition: opacity 0.3s steps(3, end); }
.pxh-tip.gone { opacity: 0; }

/* 右上：钱 */
.pxh-money { position: absolute; right: max(10px, env(safe-area-inset-right)); top: max(10px, calc(env(safe-area-inset-top) + 4px)); display: flex; align-items: center; gap: calc(var(--s) * 2px); }

/* 右下（拇指区）：一行 [名册][地图][动作键]，动作键在最右下角；拿 / 放叠在动作键上面。三个按钮同一种墨色底板（index.ts 的 plateCanvas） */
.pxh-dock { position: absolute; right: max(6px, env(safe-area-inset-right)); bottom: max(8px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: flex-end; gap: calc(var(--s) * 3px); }
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
.pxh-btn .pxh-dot { position: absolute; right: calc(var(--s) * -1px); top: calc(var(--s) * -1px); animation: pxh-bob 0.9s steps(2, end) infinite; }
/* 没活：动作键只剩一圈细边（槽位不动）；拿 / 放整个不出现 */
.pxh-act.empty { pointer-events: none; }
.pxh-pick.empty { display: none; }
.pxh-mood.read { visibility: hidden; transition: visibility 0s 0.32s; }
.pxh-use.on .pxh-icon { animation: pxh-bob 0.36s steps(2, end) infinite; }
@keyframes pxh-bob { 50% { transform: translateY(calc(var(--s) * -1px)); } }
/* 按钮名的小奶油牌子（长按 / 第一次出现）：在这一行按钮的上面、右对齐，隔开 4 纹素，不压按钮 */
.pxh-sign { padding: 3px 7px; ${SIGN} margin-bottom: calc(var(--s) * 2px); transition: opacity 0.3s steps(3, end); }
.pxh-sign.gone { opacity: 0; }

/* 场景里人头上的心情泡、点开以后的一句话 */
.pxh-moods { position: absolute; inset: 0; overflow: hidden; }
.pxh-mood { position: absolute; left: 0; top: 0; padding: 11px; pointer-events: auto; animation: pxh-dim 0.3s steps(2, end) 3.5s forwards; }
@keyframes pxh-dim { to { opacity: 0.5; } }
.pxh-mood.pop .pxh-px { animation: pxh-pop 0.3s steps(3, end); transform-origin: 20% 100%; }
@keyframes pxh-pop { 0% { transform: scale(0.4); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
/* 浮动的一行字（同参考：画面上方一行白字黑边，过一会儿消失）+ 弹出来的东西 */
.pxh-toast { position: absolute; left: 50%; top: max(12%, calc(env(safe-area-inset-top) + 100px)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; transition: opacity 0.4s steps(3, end); }
.pxh-toast.gone { opacity: 0; }
.pxh-toast.tap { pointer-events: auto; cursor: pointer; }
.pxh-line { display: flex; align-items: center; gap: 4px; max-width: calc(100vw - 24px); }
.pxh-line .pxh-txt { white-space: normal; }
.pxh-toast .pxh-item { animation: pxh-item 0.5s steps(5, end); }
@keyframes pxh-item { 0% { transform: scale(0.2) translateY(30px); } 60% { transform: scale(1.15) translateY(-4px); } 100% { transform: scale(1); } }
.pxh-place { position: absolute; left: 50%; top: max(12%, calc(env(safe-area-inset-top) + 100px)); transform: translateX(-50%); opacity: 0; }
.pxh-place.show { animation: pxh-place 2.6s steps(12, end) forwards; }
@keyframes pxh-place { 0% { opacity: 0; } 12% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }

/* 开局的操作提示（几秒后消失） */
.pxh-hint { position: absolute; left: max(12px, env(safe-area-inset-left)); bottom: max(16px, calc(env(safe-area-inset-bottom) + 8px)); transition: opacity 0.8s steps(4, end); }
.pxh-hint.gone { opacity: 0; }

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
