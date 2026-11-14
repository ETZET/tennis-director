// 小游戏壳的样式（mountMinigame 第一次挂载时塞进 <head>，页面 html 不用写）。
// 像素风同 clubsite/play/style.ts：深靛底 #2c2450 + 奶油描边 #fff3d6 + 方块投影 #171230，金色 #ffd23c 是数字和高亮。
// 布局：手机竖屏优先（390×844）。顶上一条游戏 HUD（时间 / 得分 / 场景给的格子），play 自己的顶栏挪到它下面；
// 开局卡、结算卡在画面中间偏下（按钮在拇指区）；都避开刘海和底部横条（safe-area）。
export const MG_CSS = `
html, body { margin: 0; height: 100%; overflow: hidden; background: #5fb0e8; overscroll-behavior: none; }
canvas.mg-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; display: block; touch-action: none; image-rendering: pixelated; }
.mg-root { position: fixed; inset: 0; z-index: 6; pointer-events: none; font: 700 14px/1.25 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px; -webkit-font-smoothing: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.mg-root [hidden] { display: none !important; }
.mg-px { background: #2c2450; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230; }

/* ── 顶上的游戏 HUD ── */
.mg-hud { position: absolute; left: max(14px, calc(env(safe-area-inset-left) + 8px)); right: max(14px, calc(env(safe-area-inset-right) + 8px)); top: max(14px, calc(env(safe-area-inset-top) + 6px)); display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; justify-content: center; }
.mg-hud[hidden] { display: none; }
.mg-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 54px; padding: 5px 9px 6px; margin: 3px; }
.mg-cell small { font-size: 10px; opacity: 0.8; letter-spacing: 1px; }
.mg-cell b { font-size: 18px; color: #ffd23c; line-height: 1.1; font-variant-numeric: tabular-nums; }
.mg-cell.mg-time b { color: #fff3d6; font-size: 20px; }
.mg-cell.mg-time.low { background: #8a2a3a; }
.mg-cell.mg-time.low b { color: #fff3d6; animation: mg-blink 0.5s steps(2, end) infinite; }
.mg-cell.mg-score b { font-size: 20px; }
.mg-cell.mg-combo { background: #c0545a; }
.mg-cell.mg-combo b { color: #fff3d6; }
.mg-cell.mg-lives b { color: #ff7a7a; letter-spacing: 2px; }
.mg-cell.warn { background: #b4572a; }
.mg-cell.good { background: #2f7a54; }
.mg-cell.bump { animation: mg-bump 0.25s steps(2, end); }
@keyframes mg-blink { 50% { opacity: 0.35; } }
@keyframes mg-bump { 50% { transform: translateY(-3px) scale(1.08); } }
/* play 自己的顶栏（play.stat）挪到游戏 HUD 下面；左下的操作提示可以关掉 */
.mg-on .play-bar { top: max(86px, calc(env(safe-area-inset-top) + 78px)) !important; }
.mg-nohint .play-hint { display: none !important; }
.mg-paused .play-buttons, .mg-paused .play-joy { visibility: hidden; }

/* ── 横幅提示（mg.toast）── */
.mg-toast { position: absolute; left: 50%; top: max(92px, calc(env(safe-area-inset-top) + 84px)); transform: translateX(-50%); max-width: calc(100vw - 48px); padding: 8px 14px; font-size: 15px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: opacity 0.25s; }
.mg-toast.gone { opacity: 0; }
.mg-toast.big { top: 34%; font-size: 26px; padding: 12px 22px; background: #c0545a; }

/* ── 飘字（mg.pop）── */
.mg-pops { position: absolute; inset: 0; overflow: hidden; }
.mg-pop { position: absolute; left: 0; top: 0; font-size: 16px; color: #ffd23c; white-space: nowrap; text-shadow: 2px 0 0 #171230, -2px 0 0 #171230, 0 2px 0 #171230, 0 -2px 0 #171230, 2px 2px 0 #171230; will-change: transform, opacity; }
.mg-pop.big { font-size: 22px; }
.mg-pop.green { color: #8fe36a; }
.mg-pop.red { color: #ff7a7a; }
.mg-pop.cream { color: #fff3d6; }

/* ── 场景里的标记（mg.marker）：目标头上跳的箭头；在画面外就贴着画面边、指向它 ── */
.mg-marks { position: absolute; inset: 0; }
.mg-mark { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.mg-mark i { position: absolute; left: -11px; top: -26px; width: 0; height: 0; border: 11px solid transparent; border-top: 14px solid var(--c, #ffd23c); filter: drop-shadow(0 3px 0 #171230); animation: mg-bob 0.8s steps(2, end) infinite; }
.mg-mark span { position: absolute; left: 0; top: -54px; transform: translateX(-50%); padding: 3px 7px; font-size: 12px; white-space: nowrap; background: #2c2450; color: #fff3d6; box-shadow: 2px 0 0 0 var(--c, #ffd23c), -2px 0 0 0 var(--c, #ffd23c), 0 2px 0 0 var(--c, #ffd23c), 0 -2px 0 0 var(--c, #ffd23c); }
.mg-mark span:empty { display: none; }
/* 画面外：贴边一个小方块（标签），外面一个三角朝目标的方向 */
.mg-mark.edge span, .mg-mark.edge span:empty { display: block; top: 0; min-width: 12px; min-height: 12px; transform: translate(-50%, -50%); }
.mg-mark.edge i { left: 0; top: -11px; border: 11px solid transparent; border-left: 15px solid var(--c, #ffd23c); border-right: 0; animation: none; transform-origin: 0 11px; transform: rotate(var(--a, 0rad)) translateX(var(--r, 26px)); }
@keyframes mg-bob { 50% { transform: translateY(-5px); } }

/* ── 卡（开局 / 结算）── */
.mg-shade { position: absolute; inset: 0; background: rgba(23, 18, 48, 0.42); pointer-events: auto; display: flex; align-items: flex-end; justify-content: center; padding: max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) calc(max(24px, env(safe-area-inset-bottom)) + 12px) max(16px, env(safe-area-inset-left)); box-sizing: border-box; touch-action: none; }
@media (orientation: landscape) { .mg-shade { align-items: center; } }
.mg-card { width: min(358px, 100%); padding: 18px 18px 20px; margin: 6px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; }
.mg-card h1 { margin: 0; font-size: 26px; line-height: 1.15; color: #ffd23c; letter-spacing: 2px; }
.mg-card .mg-tag { font-size: 11px; opacity: 0.8; }
.mg-card .mg-goal { margin: 0; font-size: 15px; line-height: 1.45; }
.mg-card ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 1.4; font-weight: 600; }
.mg-card li { display: flex; gap: 8px; }
.mg-card li::before { content: "▸"; color: #ffd23c; }
.mg-card .mg-best { font-size: 12px; opacity: 0.85; }
.mg-btn { pointer-events: auto; border: 0; margin: 3px; min-height: 56px; padding: 0 18px; font: inherit; font-size: 20px; letter-spacing: 3px; color: #fff3d6; background: #c0545a; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230; }
.mg-btn:active { transform: translateY(3px); box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 3px 0 0 #171230; }
.mg-btn:focus-visible, .mg-link:focus-visible { outline: 3px solid #ffd23c; outline-offset: 5px; }
.mg-link { pointer-events: auto; display: flex; align-items: center; justify-content: center; min-height: 44px; color: #fff3d6; opacity: 0.85; font-size: 13px; text-decoration: none; -webkit-tap-highlight-color: transparent; }
.mg-link::before { content: "◂ "; color: #ffd23c; white-space: pre; }
.mg-result .mg-big { display: flex; align-items: baseline; justify-content: space-between; }
.mg-result .mg-big b { font-size: 40px; color: #ffd23c; font-variant-numeric: tabular-nums; }
.mg-stars { display: flex; gap: 8px; font-size: 34px; line-height: 1; }
.mg-stars span { color: #4a4270; text-shadow: 0 3px 0 #171230; }
.mg-stars span.on { color: #ffd23c; animation: mg-star 0.4s steps(3, end) both; }
.mg-stars span.on:nth-child(2) { animation-delay: 0.25s; }
.mg-stars span.on:nth-child(3) { animation-delay: 0.5s; }
@keyframes mg-star { 0% { transform: scale(0.2); opacity: 0; } 70% { transform: scale(1.3); } 100% { transform: scale(1); opacity: 1; } }
.mg-lines { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; }
.mg-lines div { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 3px; border-bottom: 2px dotted rgba(255, 243, 214, 0.25); }
.mg-lines div b { color: #ffd23c; font-variant-numeric: tabular-nums; }
.mg-record { color: #8fe36a; font-size: 13px; }
.mg-dayhud { position: fixed; left: max(12px, calc(env(safe-area-inset-left) + 4px)); bottom: calc(max(24px, env(safe-area-inset-bottom)) + 150px); z-index: 7; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; font: 700 13px/1 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px; }
.mg-dayhud button { border: 0; margin: 3px; min-height: 44px; padding: 0 12px; color: #fff3d6; font: inherit; cursor: pointer; background: #2c2450; -webkit-tap-highlight-color: transparent; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230; }
.mg-paused .mg-dayhud { display: none; }
.mg-loading { position: absolute; left: 50%; top: 45%; transform: translateX(-50%); padding: 10px 16px; font-size: 15px; }
`;
