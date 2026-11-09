// 玩法界面的样式（hud.ts 第一次挂载时塞进 <head>，场景的 html 不用写）。像素风：深靛底 + 奶油描边（同 desert3d-v2）。
// 布局：手机竖屏优先（390×844），横屏（844×390）同一套；按钮 ≥ 56 px，在右下拇指区；顶栏在两个角落选择器之间（竖屏挪到它们下面）。
export const PLAY_CSS = `
.play-root { position: fixed; inset: 0; z-index: 4; pointer-events: none; font: 700 14px/1 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px; -webkit-font-smoothing: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.play-root [hidden] { display: none !important; }
.play-bar, .play-btn, .play-bubble, .play-hint, .play-toast {
  background: #2c2450;
  box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230;
}
.play-bar { position: absolute; top: max(14px, calc(env(safe-area-inset-top) + 6px)); left: 50%; transform: translateX(-50%); display: flex; gap: 12px; padding: 7px 10px; font-size: 12px; white-space: nowrap; }
.play-bar:empty { display: none; }
.play-bar b { color: #ffd23c; font-size: 14px; margin-left: 3px; }
@media (orientation: portrait) { .play-bar { top: max(76px, calc(env(safe-area-inset-top) + 68px)); } }
.play-hint { position: absolute; left: max(16px, env(safe-area-inset-left)); bottom: calc(max(20px, env(safe-area-inset-bottom)) + 4px); padding: 7px 10px; font-size: 12px; opacity: 0.92; transition: opacity 0.8s; }
.play-hint.gone { opacity: 0; }
.play-joy { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.play-joy::before, .play-knob { content: ""; position: absolute; border-radius: 50%; }
.play-joy::before { left: -56px; top: -56px; width: 112px; height: 112px; background: rgba(44, 36, 80, 0.45); box-shadow: inset 0 0 0 3px rgba(255, 243, 214, 0.8); }
.play-knob { left: -24px; top: -24px; width: 48px; height: 48px; background: #fff3d6; box-shadow: inset 0 -5px 0 0 #d8b088, 0 4px 0 0 #171230; }
.play-buttons { position: absolute; right: max(18px, calc(env(safe-area-inset-right) + 8px)); bottom: max(22px, calc(env(safe-area-inset-bottom) + 10px)); display: flex; flex-direction: column; align-items: flex-end; gap: 18px; pointer-events: none; }
.play-btn { pointer-events: auto; border: 0; margin: 3px; color: #fff3d6; font: inherit; cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent; }
.play-btn.down { transform: translateY(3px); box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 3px 0 0 #171230; }
.play-pick { min-height: 56px; min-width: 56px; padding: 0 14px; font-size: 15px; }
.play-use { min-width: 84px; height: 84px; padding: 0 10px; font-size: 20px; background: #c0545a; }
.play-use.on { background: #f07c4c; }
.play-bubbles { position: absolute; inset: 0; }
.play-bubble { position: absolute; left: 0; top: 0; padding: 4px 7px; font-size: 12px; color: #2c2450; background: #fff3d6; box-shadow: 2px 0 0 0 #2c2450, -2px 0 0 0 #2c2450, 0 2px 0 0 #2c2450, 0 -2px 0 0 #2c2450; white-space: nowrap; }
.play-bubble.edge { opacity: 0.85; background: #ffd23c; }
.play-mark { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.play-mark::before { content: ""; position: absolute; left: -7px; top: -12px; border: 7px solid transparent; border-top: 9px solid #ffd23c; filter: drop-shadow(0 2px 0 #171230); animation: play-bob 0.9s steps(2, end) infinite; }
@keyframes play-bob { 50% { transform: translateY(-4px); } }
.play-toast { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); padding: 8px 12px; font-size: 14px; white-space: nowrap; transition: opacity 0.3s; }
.play-toast.gone { opacity: 0; }
`;
