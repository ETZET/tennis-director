// 像素界面的样式（mountPixelHud 第一次挂载时塞进 <head>）。界面只占三个角：左上日钟、右上钱、右下图标按钮；画面中间不放字。
// 所有像素图（canvas）CSS 按整数倍放大、最近邻。点击目标 ≥ 44 px（图标 40 px + 按钮留边）。
// body.pxh-on 时把旧的文字界面（clubsite/play 的顶栏、按钮、气泡、提示，像素级别牌子、小地图、地点名）藏起来；
// body.pxh-debug 再把调试的那几块（像素级别、模拟状态条）放出来。
import { CREAM, hex, INK, INK_SHADOW } from './colors';

const ink = hex(INK);
const shadow = hex(INK_SHADOW);
const cream = hex(CREAM);

export const HUD_CSS = `
.pxh-root { position: fixed; inset: 0; z-index: 7; pointer-events: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.pxh-root [hidden] { display: none !important; }
.pxh-px { display: block; image-rendering: pixelated; image-rendering: crisp-edges; flex: none; }
.pxh-root button { border: 0; margin: 0; padding: 0; background: none; cursor: pointer; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; }
.pxh-root button:focus-visible { outline: 2px solid ${cream}; outline-offset: 2px; }

/* 左上：日钟 + 日期 */
.pxh-clock { position: absolute; left: max(8px, env(safe-area-inset-left)); top: max(8px, env(safe-area-inset-top)); display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 48px; min-height: 48px; }
.pxh-clock:active .pxh-px:first-child { transform: translateY(2px); }

/* 右上：钱 */
.pxh-money { position: absolute; right: max(10px, env(safe-area-inset-right)); top: max(12px, calc(env(safe-area-inset-top) + 4px)); display: flex; align-items: center; gap: 4px; }

/* 右下：图标按钮。dock = 常驻的（名册、地图），上面一行是这里能干的活（大的动作键 + 拿放） */
.pxh-dock { position: absolute; right: max(8px, env(safe-area-inset-right)); bottom: max(8px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.pxh-row { display: flex; align-items: flex-end; gap: 4px; }
.pxh-btn { position: relative; min-width: 48px; min-height: 48px; display: grid; place-items: center; }
.pxh-btn.down .pxh-px, .pxh-btn:active .pxh-px, .pxh-btn.on .pxh-px { transform: translateY(2px); }
.pxh-use { width: 72px; height: 72px; }
.pxh-use .pxh-plate { position: absolute; inset: 0; margin: auto; }
.pxh-use .pxh-icon { position: relative; }
.pxh-use.on .pxh-icon { animation: pxh-bob 0.36s steps(2, end) infinite; }
@keyframes pxh-bob { 50% { transform: translateY(-2px); } }
.pxh-label { position: absolute; right: calc(100% + 2px); top: 50%; transform: translateY(-50%); pointer-events: none; transition: opacity 0.4s steps(3, end); }
.pxh-label.gone { opacity: 0; }

/* 场景里人头上的心情泡、点开以后的一句话 */
.pxh-moods { position: absolute; inset: 0; overflow: hidden; }
.pxh-mood { position: absolute; left: 0; top: 0; padding: 7px; pointer-events: auto; }
.pxh-mood.pop .pxh-px { animation: pxh-pop 0.3s steps(3, end); }
@keyframes pxh-pop { 0% { transform: scale(0.4); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
.pxh-balloon { position: absolute; left: 0; top: 0; padding: 4px 6px; background: ${cream}; box-shadow: 2px 0 0 0 ${ink}, -2px 0 0 0 ${ink}, 0 2px 0 0 ${ink}, 0 -2px 0 0 ${ink}, 0 4px 0 0 ${shadow}; pointer-events: auto; display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.pxh-balloon::after { content: ""; position: absolute; left: 10px; bottom: -6px; width: 6px; height: 4px; background: ${cream}; box-shadow: 2px 0 0 0 ${ink}, -2px 0 0 0 ${ink}, 0 2px 0 0 ${ink}; }

/* 浮动的一行字（同参考：画面上方一行白字黑边，过一会儿消失）+ 弹出来的东西 */
.pxh-toast { position: absolute; left: 50%; top: max(12%, calc(env(safe-area-inset-top) + 96px)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; transition: opacity 0.4s steps(3, end); }
.pxh-toast.gone { opacity: 0; }
.pxh-toast .pxh-item { animation: pxh-item 0.5s steps(5, end); }
@keyframes pxh-item { 0% { transform: scale(0.2) translateY(30px); } 60% { transform: scale(1.15) translateY(-4px); } 100% { transform: scale(1); } }
.pxh-place { position: absolute; left: 50%; top: max(12%, calc(env(safe-area-inset-top) + 96px)); transform: translateX(-50%); opacity: 0; }
.pxh-place.show { animation: pxh-place 2.6s steps(12, end) forwards; }
@keyframes pxh-place { 0% { opacity: 0; } 12% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }

/* 开局的操作提示（几秒后消失） */
.pxh-hint { position: absolute; left: max(12px, env(safe-area-inset-left)); bottom: max(16px, calc(env(safe-area-inset-bottom) + 8px)); transition: opacity 0.8s steps(4, end); }
.pxh-hint.gone { opacity: 0; }

/* 左下角的调试小点：点了出来调试牌 */
.pxh-dbg { position: absolute; left: max(0px, env(safe-area-inset-left)); bottom: max(0px, env(safe-area-inset-bottom)); width: 44px; height: 44px; display: grid; place-items: center; opacity: 0.45; }
body.pxh-debug .pxh-dbg { opacity: 1; }

/* 圆形转场 */
.pxh-iris { position: fixed; left: 0; top: 0; z-index: 40; image-rendering: pixelated; pointer-events: auto; touch-action: none; }
.pxh-iris[hidden] { display: none; }

/* 旧的文字界面：藏起来（调试时放出来一部分） */
body.pxh-on .play-bar, body.pxh-on .play-hint, body.pxh-on .play-bubbles, body.pxh-on .play-toast, body.pxh-on .play-buttons,
body.pxh-on #pxsel, body.pxh-on #place, body.pxh-on #minimap, body.pxh-on .cast-open, body.pxh-on .cast-tags { display: none !important; }
body.pxh-on.pxh-debug #pxsel { display: flex !important; left: 60px; bottom: 12px; top: auto; flex-direction: column-reverse; }
body.pxh-on.pxh-debug .play-bar { display: flex !important; top: auto !important; bottom: max(64px, calc(env(safe-area-inset-bottom) + 56px)); left: 12px; transform: none; flex-wrap: wrap; max-width: calc(100vw - 120px); white-space: normal; }
body.pxh-on.pxh-map #minimap { display: block !important; left: 50%; right: auto; top: max(22%, 120px); transform: translateX(-50%); width: min(376px, calc(100vw - 16px)); height: auto; box-shadow: 2px 0 0 0 ${ink}, -2px 0 0 0 ${ink}, 0 2px 0 0 ${ink}, 0 -2px 0 0 ${ink}, 0 4px 0 0 ${shadow}; pointer-events: auto; z-index: 8; }
`;
