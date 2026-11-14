// 名册、人物卡片、名字小牌的样式（第一次 mountCast 时塞进 <head>）。像素风同 clubsite/play/style.ts：
// 海军蓝方块 #2c2450、纸色字 #fff3d6、方块描边（box-shadow 一圈）、下面一道深影 #171230。
// 手机竖屏 390×844 优先：名册、卡片占满屏；横屏 / 桌面居中一栏（最宽 520），两边压暗。点击目标都 ≥ 44 px。
const FRAME =
  '3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230';
const FRAME_DOWN = '3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 3px 0 0 #171230';
const THIN = '2px 0 0 0 #171230, -2px 0 0 0 #171230, 0 2px 0 0 #171230, 0 -2px 0 0 #171230';

export const CAST_CSS = `
.cast-ui { font: 700 14px/1.35 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 0.5px; -webkit-font-smoothing: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.cast-ui [hidden] { display: none !important; }
.cast-ui button { font: inherit; color: inherit; border: 0; margin: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.cast-px { image-rendering: pixelated; image-rendering: crisp-edges; display: block; flex: none; }
.cast-pbtn { background: #2c2450; box-shadow: ${FRAME}; }
.cast-pbtn:active, .cast-pbtn.down { transform: translateY(3px); box-shadow: ${FRAME_DOWN}; }
.cast-pbtn:focus-visible { outline: 3px solid #ffd23c; outline-offset: 4px; }

/* 名册按钮：右上小地图下面（竖屏再往下让开顶栏），离右下动作键、左上像素选择器都远 */
.cast-open { position: fixed; z-index: 5; right: max(15px, calc(env(safe-area-inset-right) + 7px)); top: calc(max(12px, calc(env(safe-area-inset-top) + 4px)) + 51px + 16px); min-width: 64px; min-height: 56px; padding: 6px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
@media (orientation: portrait) { .cast-open { top: calc(max(76px, calc(env(safe-area-inset-top) + 68px)) + 46px); } }
.cast-open b { font-size: 15px; letter-spacing: 2px; }
.cast-open small { font-size: 10px; color: #ffd23c; letter-spacing: 0; white-space: nowrap; }

/* 名字小牌（场景里，离总监近的人头顶） */
.cast-tags { position: fixed; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
.cast-tag { position: absolute; left: 0; top: 0; padding: 1px 4px 1px 3px; font-size: 10px; line-height: 1.2; white-space: nowrap; color: #2c2450; background: #fff3d6; box-shadow: ${THIN}; display: flex; align-items: center; gap: 4px; }
.cast-tag i { display: block; width: 4px; height: 9px; }
.cast-tag.unmet { color: #6a5e8a; }

/* 面板（名册、卡片）：全屏一层，挡住画面上的摇杆和点地面 */
.cast-overlay { position: fixed; inset: 0; z-index: 20; background: rgba(23, 18, 48, 0.72); display: flex; justify-content: center; pointer-events: auto; touch-action: pan-y; }
.cast-sheet { position: relative; width: 100%; max-width: 520px; height: 100%; background: #2c2450; display: flex; flex-direction: column; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6; }
.cast-head { flex: none; display: flex; align-items: center; gap: 8px; padding: max(10px, env(safe-area-inset-top)) 10px 8px; background: #231c44; box-shadow: 0 3px 0 0 #171230; z-index: 1; }
.cast-head h2 { margin: 0; font-size: 17px; letter-spacing: 2px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cast-x { flex: none; width: 48px; height: 48px; font-size: 20px !important; }
.cast-clock { flex: none; display: flex; flex-direction: column; align-items: flex-end; font-size: 12px; line-height: 1.25; }
.cast-clock b { color: #ffd23c; font-size: 13px; }
.cast-nextday { flex: none; min-height: 44px; padding: 0 10px; font-size: 13px !important; background: #3c6a5a !important; }

.cast-tabs { flex: none; display: flex; gap: 8px; overflow-x: auto; padding: 12px 10px 8px; scrollbar-width: none; }
.cast-tabs::-webkit-scrollbar { display: none; }
.cast-tab { flex: none; min-height: 44px; padding: 0 12px; margin: 3px; font-size: 13px !important; white-space: nowrap; }
.cast-tab[aria-pressed="true"] { background: #fff3d6; color: #2c2450 !important; }
.cast-search { flex: none; margin: 4px 13px 10px; height: 44px; padding: 0 12px; border: 0; font: 700 14px/1 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #2c2450; background: #fff3d6; box-shadow: 0 0 0 3px #171230; border-radius: 0; outline: none; user-select: text; -webkit-user-select: text; }
.cast-search::placeholder { color: #8a80a8; }
.cast-count { flex: none; padding: 0 13px 6px; font-size: 11px; color: #c8bcdc; }
.cast-list { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 0 0 max(16px, env(safe-area-inset-bottom)); }
.cast-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 76px; padding: 6px 10px 6px 0; text-align: left; background: transparent !important; border-bottom: 2px solid #231c44 !important; }
.cast-row:active { background: #3a3066 !important; }
.cast-row .bar { flex: none; width: 6px; align-self: stretch; }
.cast-row .pic { box-shadow: ${THIN}; }
.cast-row .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.cast-row .nm { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cast-row .nm small { font-size: 12px; color: #c8bcdc; margin-left: 6px; }
.cast-row .ti { font-size: 12px; color: #d8cce8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cast-row .wh { font-size: 11px; color: #8a80a8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cast-row .wh.on { color: #8ce0a0; }
.cast-row .side { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.cast-row .new { font-size: 10px; color: #8a80a8; }
.cast-empty { padding: 40px 20px; text-align: center; color: #8a80a8; }

/* 好感格子：10 格，满格 = 粉红，半格 = 半亮 */
.cast-favor { display: flex; gap: 2px; }
.cast-favor i { width: 6px; height: 8px; background: #171230; transition: background 0.3s steps(3, end); }
.cast-favor i.on { background: #f6a2b8; }
.cast-favor i.half { background: #9a5a7e; }
.cast-favor.big i { width: 18px; height: 14px; }

/* 卡片 */
.cast-card .cast-head h2 { text-align: center; }
.cast-nav { flex: none; width: 48px; height: 48px; font-size: 16px !important; }
.cast-nav:disabled { opacity: 0.35; }
.cast-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 14px 14px 20px; }
.cast-hero { display: flex; gap: 14px; align-items: flex-start; }
.cast-hero .pic { box-shadow: ${FRAME}; margin: 3px 3px 9px; }
.cast-hero .id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.cast-hero .nm { font-size: 19px; line-height: 1.15; letter-spacing: 1px; }
.cast-hero .zh { font-size: 13px; color: #c8bcdc; }
.cast-hero .ti { display: inline-block; align-self: flex-start; font-size: 12px; padding: 2px 6px; color: #2c2450; }
.cast-hero .ln { font-size: 12px; color: #d8cce8; }
.cast-sec { margin-top: 16px; }
.cast-sec > h3 { margin: 0 0 6px; font-size: 12px; color: #ffd23c; letter-spacing: 2px; }
.cast-now { padding: 8px 10px; background: #231c44; box-shadow: ${THIN}; display: flex; flex-direction: column; gap: 5px; }
.cast-now .th { font-size: 13px; color: #fff3d6; font-weight: 400; }
.cast-now .wh { font-size: 13px; }
.cast-now .wh.off { color: #8a80a8; }
.cast-meters { display: grid; grid-template-columns: auto 1fr auto; gap: 8px 10px; align-items: center; }
.cast-meters span { font-size: 12px; color: #d8cce8; }
.cast-meters em { font-style: normal; font-size: 13px; min-width: 32px; text-align: right; }
.cast-meter { height: 12px; background: #171230; position: relative; }
.cast-meter > i { position: absolute; left: 0; top: 0; bottom: 0; background: #8ccaf0; transition: width 0.4s steps(6, end); }
.cast-meter.mood > i { background: #ffd23c; }
.cast-meter.attr > i { background: #b8e05a; }
.cast-delta { position: absolute; right: 56px; font-size: 16px; color: #f6a2b8; pointer-events: none; animation: cast-rise 1.6s steps(8, end) forwards; text-shadow: 2px 2px 0 #171230; }
.cast-delta.neg { color: #8a80a8; }
@keyframes cast-rise { 0% { transform: translateY(0); opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(-28px); opacity: 0; } }
.cast-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.cast-chip { min-height: 44px; padding: 0 12px; margin: 3px; font-size: 13px !important; background: #3c6a5a !important; }
.cast-chip.bad { background: #8a3a4e !important; }
.cast-chip[aria-pressed="true"] { background: #fff3d6 !important; color: #2c2450 !important; }
.cast-note { margin-top: 8px; padding: 8px 10px; font-size: 12px; font-weight: 400; background: #fff3d6; color: #2c2450; }
.cast-p { margin: 0; font-size: 13px; font-weight: 400; line-height: 1.6; color: #eee4d8; }
.cast-q { color: #6a5e8a; letter-spacing: 3px; }
.cast-ties { display: flex; flex-direction: column; }
.cast-tie { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 4px 0; text-align: left; background: transparent !important; border-bottom: 2px solid #231c44 !important; width: 100%; }
.cast-tie .pic { box-shadow: ${THIN}; margin-left: 2px; }
.cast-tie .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cast-tie .tx b { font-size: 13px; }
.cast-tie .tx small { font-size: 11px; color: #c8bcdc; font-weight: 400; }
.cast-tie .k { flex: none; font-size: 11px; padding: 2px 5px; background: #171230; color: #ffd23c; }
.cast-tie .go { flex: none; font-size: 14px; color: #8a80a8; padding-right: 4px; }
.cast-mem { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 400; color: #eee4d8; }
.cast-mem div { display: flex; gap: 8px; }
.cast-mem time { flex: none; color: #8a80a8; }
.cast-mem .up { color: #f6a2b8; }
.cast-unmet { margin-top: 14px; padding: 12px; text-align: center; background: #231c44; box-shadow: ${THIN}; }
.cast-unmet b { display: block; font-size: 15px; color: #ffd23c; margin-bottom: 4px; }
.cast-unmet span { font-size: 12px; font-weight: 400; color: #c8bcdc; }

.cast-acts { flex: none; display: flex; flex-wrap: wrap; gap: 10px 10px; padding: 12px 12px max(14px, env(safe-area-inset-bottom)); background: #231c44; box-shadow: 0 -3px 0 0 #171230; }
.cast-act { flex: 1 1 calc(33% - 14px); min-width: 96px; min-height: 56px; margin: 3px; padding: 4px 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; background: #c0545a !important; }
.cast-act b { font-size: 14px; }
.cast-act small { font-size: 10px; font-weight: 400; color: #ffe4d0; white-space: nowrap; }
.cast-act.walk { background: #3c6a5a !important; flex-basis: 100%; }
.cast-act:disabled { background: #4a4268 !important; color: #a89cc0 !important; }
.cast-result { flex-basis: 100%; min-height: 20px; font-size: 12px; font-weight: 400; color: #fff3d6; text-align: center; }
.cast-result.bad { color: #f8a28a; }
.cast-result:empty { display: none; }
/* 横屏（矮）：肖像、按钮小一点，留出看内容的高度 */
@media (max-height: 500px) {
  .cast-hero .pic { width: 96px; height: 96px; }
  .cast-act { min-height: 48px; flex-basis: calc(25% - 14px); }
  .cast-act.walk { flex-basis: calc(50% - 14px); }
  .cast-acts { padding-top: 8px; padding-bottom: max(8px, env(safe-area-inset-bottom)); }
}
`;

export function injectCastCss() {
  if (document.getElementById('club-cast-css')) return;
  const st = document.createElement('style');
  st.id = 'club-cast-css';
  st.textContent = CAST_CSS;
  document.head.appendChild(st);
}
