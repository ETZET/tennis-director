// 球童自己的两块界面（DOM，像素风同 shell/style.ts）：
//  - 发球倒计时条（顶上 HUD 下面一条）：左边一句现在该干嘛，右边一根条（还剩多久发球）；快到了变黄、变红，发球中闪红。
//  - 递球的准星（按住"递球"时出来，在左下拇指上面、右下按钮的左边）：来回走的针 + 绿区。
// 都不接指针（pointer-events: none），不挡摇杆。
const CSS = `
.bk-bar { position: fixed; z-index: 6; left: 50%; transform: translateX(-50%); top: max(84px, calc(env(safe-area-inset-top) + 76px));
  width: min(340px, calc(100vw - 40px)); box-sizing: border-box; padding: 6px 10px 8px; pointer-events: none;
  font: 700 13px/1.2 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px;
  background: #2c2450; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230; }
.bk-bar[hidden] { display: none; }
.bk-bar .bk-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.bk-bar .bk-say { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bk-bar .bk-sec { color: #ffd23c; font-variant-numeric: tabular-nums; min-width: 42px; text-align: right; }
.bk-bar .bk-pk { margin-left: auto; font-size: 11px; opacity: 0.85; white-space: nowrap; }
.bk-bar .bk-pk.none { color: #ff7a7a; opacity: 1; }
.bk-bar .bk-track { margin-top: 5px; height: 10px; background: #171230; position: relative; }
.bk-bar .bk-fill { position: absolute; left: 0; top: 0; bottom: 0; background: #8fe36a; }
.bk-bar.mid .bk-fill { background: #ffd23c; }
.bk-bar.low .bk-fill { background: #ff7a7a; }
.bk-bar.serve { background: #8a2a3a; }
.bk-bar.serve .bk-say { animation: bk-blink 0.4s steps(2, end) infinite; }
.bk-bar.rally { background: #2f4a7a; }
.bk-bar.change { background: #2f7a54; }
@keyframes bk-blink { 50% { opacity: 0.35; } }
.mg-paused .bk-bar, .mg-paused .bk-meter { display: none; }
/* 壳的小横幅挪到倒计时条下面 */
.mg-on .mg-toast:not(.big) { top: max(140px, calc(env(safe-area-inset-top) + 132px)); }
.bk-meter { position: fixed; z-index: 6; left: max(16px, env(safe-area-inset-left)); right: 140px; bottom: calc(max(22px, env(safe-area-inset-bottom)) + 130px);
  padding: 7px 10px 10px; pointer-events: none; font: 700 13px/1.2 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6;
  background: #2c2450; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230; }
.bk-meter[hidden] { display: none; }
.bk-meter .bk-track { margin-top: 6px; height: 22px; background: #171230; position: relative; }
.bk-meter .bk-zone { position: absolute; top: 0; bottom: 0; background: #2f7a54; }
.bk-meter .bk-core { position: absolute; top: 0; bottom: 0; background: #8fe36a; }
.bk-meter .bk-needle { position: absolute; top: -5px; bottom: -5px; width: 6px; margin-left: -3px; background: #fff3d6; box-shadow: 0 3px 0 0 #171230; }
`;

export interface Bar {
  set(o: {
    say: string;
    left: number | null;
    frac: number | null;
    tone: '' | 'serve' | 'rally' | 'change';
    /** 兜里几个球 */
    pocket: number;
  }): void;
  show(on: boolean): void;
}
export interface Meter {
  set(m: number | null, zone?: { c: number; w: number }): void;
}

function injectCss() {
  if (document.getElementById('bk-css')) return;
  const st = document.createElement('style');
  st.id = 'bk-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

export function createBar(): Bar {
  injectCss();
  const el = document.body.appendChild(document.createElement('div'));
  el.className = 'bk-bar';
  el.hidden = true;
  el.innerHTML = `<div class="bk-row"><span class="bk-say"></span><span class="bk-pk"></span><span class="bk-sec"></span></div><div class="bk-track"><div class="bk-fill"></div></div>`;
  const say = el.querySelector('.bk-say') as HTMLElement;
  const sec = el.querySelector('.bk-sec') as HTMLElement;
  const pk = el.querySelector('.bk-pk') as HTMLElement;
  const track = el.querySelector('.bk-track') as HTMLElement;
  const fill = el.querySelector('.bk-fill') as HTMLElement;
  let last = '';
  return {
    set(o) {
      const key = `${o.pocket}|${o.say}|${o.left === null ? '' : o.left.toFixed(1)}|${o.frac === null ? '' : o.frac.toFixed(3)}|${o.tone}`;
      if (key === last) return;
      last = key;
      say.textContent = o.say;
      pk.textContent = `兜里 ${o.pocket} 球`;
      pk.classList.toggle('none', o.pocket === 0);
      sec.textContent = o.left === null ? '' : `${Math.max(0, o.left).toFixed(1)}s`;
      track.hidden = o.frac === null;
      if (o.frac !== null) fill.style.width = `${Math.round(Math.max(0, Math.min(1, o.frac)) * 1000) / 10}%`;
      el.className = `bk-bar${o.tone ? ` ${o.tone}` : ''}${o.frac !== null && o.tone === '' ? (o.left !== null && o.left < 2 ? ' low' : o.frac < 0.45 ? ' mid' : '') : ''}`;
    },
    show(on) {
      el.hidden = !on;
    },
  };
}

export function createMeter(): Meter {
  injectCss();
  const el = document.body.appendChild(document.createElement('div'));
  el.className = 'bk-meter';
  el.hidden = true;
  el.innerHTML = `<div>递球 · 在绿区松手</div><div class="bk-track"><div class="bk-zone"></div><div class="bk-core"></div><div class="bk-needle"></div></div>`;
  const zone = el.querySelector('.bk-zone') as HTMLElement;
  const core = el.querySelector('.bk-core') as HTMLElement;
  const needle = el.querySelector('.bk-needle') as HTMLElement;
  return {
    set(m, z) {
      el.hidden = m === null;
      if (m === null) return;
      if (z) {
        zone.style.left = `${(z.c - z.w) * 100}%`;
        zone.style.width = `${z.w * 200}%`;
        core.style.left = `${(z.c - z.w * 0.45) * 100}%`;
        core.style.width = `${z.w * 90}%`;
      }
      needle.style.left = `${m * 100}%`;
    },
  };
}
