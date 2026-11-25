// 观察面板（手机优先，竖屏 390×844）：屏幕底部一张抽屉。
// 默认收起（只占底下两行，画面留给俱乐部）：时间 + 时段 + 在场人数（点它展开），加速档位（⏸ 慢 1× 2× 5× 15× 60×，15× 起是快进）；
// 跟着一个人时多一行"跟着谁、在哪、干什么"。
// 展开：跳到某个时刻、看全图、跟着一个人（他今天的日程，现在这一项高亮）、此刻在场的人（客人、会员在前，员工在后）、各区域人数、最近的事（?dev=1 时最下面还有给开发看的画面缺口）。
// 观察时场景自己的提示（play-toast：午饭高峰、人手不够……）不出来：那是总监自己玩的时候的；
// 页面自己的按钮（valley 的"调试"、像素 / 时间牌）也收起来（压在画面中间），面板右上角自己有"退出"。
// 看全图时收起来的那两行上面多一行图例（点的颜色 = 在干什么），点它回到原来的镜头。
// "总监离开前台"：总监从柜台后面走开 / 走回来（引擎按"前台没人"跑：来签到的人在柜台前排起队、等烦了）——看得出有人守着和没人守着的差别。
// 所有按钮 ≥ 44 px，Pointer Events（click），不靠悬停和键盘。外观跟 .pxsel button（各页面 html 里）同一套像素框。
import { hhmm, JUMPS, SPEED_LABEL, SPEEDS } from './clock';

export interface AgendaRow {
  t: string;
  text: string;
  state: 'past' | 'now' | 'next';
}

export interface HudData {
  clock: string;
  period: string;
  speed: number;
  paused: boolean;
  total: number;
  areas: [string, number][];
  follow: null | {
    name: string;
    title: string;
    now: string;
    agenda: AgendaRow[];
    gone: boolean;
    canCard: boolean;
  };
  picks: { id: string; name: string; note: string }[];
  /** 此刻在场（看得见）的员工、教练几个（名单里排在后面） */
  staff: number;
  feed: { t: string; text: string }[];
  overview: boolean;
  /** 总监离开了前台（或者正走开）；moving = 正在走开 / 走回来 */
  desk: { away: boolean; moving: boolean };
  gaps: string[];
}

export interface HudHost {
  setSpeed(x: number): void;
  togglePause(): void;
  jump(min: number): void;
  follow(id: string | null): void;
  followRandom(): void;
  openCard(): void;
  toggleOverview(): void;
  /** 总监离开前台 / 回到前台 */
  toggleDesk(): void;
  /** 退出观察（场景自己的人回来） */
  exit(): void;
  /** 面板展开了：马上把展开的那些（名单、日程、事件）填上（收起时不算，省时间） */
  opened?(): void;
}

const CSS = `
body.sim-on .play-hint, body.sim-on .play-buttons, body.sim-on .play-bar, body.sim-on .cast-open, body.sim-on .play-toast, body.sim-on #debug, body.sim-on #pxsel, body.sim-on .daysel { display: none !important; }
.sim-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 7; padding: 8px max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); background: rgba(44, 36, 80, 0.94); box-shadow: 0 -3px 0 0 #fff3d6, 0 -6px 0 0 #171230; color: #fff3d6; font: 700 13px/1.25 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; letter-spacing: 0.5px; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.sim-sheet[hidden], .sim-sheet [hidden] { display: none !important; }
.sim-sheet button { border: 0; margin: 0; color: #fff3d6; font: inherit; cursor: pointer; background: #2c2450; min-height: 44px; -webkit-tap-highlight-color: transparent; box-shadow: 2px 0 0 0 #fff3d6, -2px 0 0 0 #fff3d6, 0 2px 0 0 #fff3d6, 0 -2px 0 0 #fff3d6; }
.sim-sheet button[aria-pressed="true"] { background: #fff3d6; color: #2c2450; }
.sim-sheet button:focus-visible { outline: 3px solid #ffd23c; outline-offset: 3px; }
.sim-top { display: flex; align-items: center; gap: 8px; }
.sim-bar { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; min-height: 44px; padding: 0 8px; text-align: left; background: transparent !important; box-shadow: none !important; }
.sim-exit { flex: none; min-width: 56px; padding: 0 10px; font-size: 13px; }
.sim-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; width: 100%; margin-top: 8px; padding: 4px 10px; font-size: 11px; font-weight: 400; text-align: left; }
.sim-legend i { display: inline-block; width: 9px; height: 9px; margin-right: 4px; vertical-align: -1px; box-shadow: 0 0 0 1px #171230; }
.sim-legend b { margin-left: auto; font-size: 12px; }
.sim-desk small { display: block; font-size: 10px; font-weight: 400; opacity: 0.8; }
.sim-clock { font-size: 22px; letter-spacing: 1px; min-width: 64px; }
.sim-period { font-size: 12px; opacity: 0.85; flex: 1; }
.sim-count { font-size: 13px; }
.sim-count b { font-size: 17px; color: #ffd23c; }
.sim-caret { font-size: 14px; opacity: 0.8; width: 20px; text-align: center; }
.sim-row { display: flex; gap: 8px; margin-top: 8px; }
.sim-row button { flex: 1 1 0; min-width: 0; padding: 0 4px; }
.sim-fol { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 8px; padding: 4px 10px; text-align: left; }
.sim-fol i { font-style: normal; color: #ffd23c; }
.sim-fol span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sim-more { margin-top: 6px; max-height: calc(52dvh - 40px); overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; touch-action: pan-y; }
.sim-more[hidden] { display: none; }
.sim-h { margin: 12px 2px 4px; font-size: 11px; opacity: 0.75; }
.sim-agenda { list-style: none; margin: 4px 0 0; padding: 0; }
.sim-agenda li { display: flex; gap: 10px; padding: 5px 6px; font-size: 12px; font-weight: 400; }
.sim-agenda li b { min-width: 40px; font-weight: 700; opacity: 0.85; }
.sim-agenda li.past { opacity: 0.5; }
.sim-agenda li.now { background: #fff3d6; color: #2c2450; font-weight: 700; }
.sim-who { padding: 2px 2px 0; }
.sim-who b { font-size: 16px; color: #ffd23c; }
.sim-who small { display: block; font-size: 11px; font-weight: 400; opacity: 0.8; margin-top: 2px; }
.sim-picks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.sim-picks button { padding: 2px 8px; text-align: left; display: flex; flex-direction: column; justify-content: center; }
.sim-picks button small { font-size: 10px; font-weight: 400; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sim-areas { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; font-size: 12px; font-weight: 400; padding: 0 4px; }
.sim-areas div { display: flex; justify-content: space-between; }
.sim-areas b { color: #ffd23c; }
.sim-feed { font-size: 12px; font-weight: 400; padding: 0 4px; }
.sim-feed div { padding: 2px 0; }
.sim-feed b { display: inline-block; min-width: 40px; opacity: 0.7; }
.sim-gaps { font-size: 10px; font-weight: 400; opacity: 0.7; padding: 0 4px 6px; }
.sim-tag { position: fixed; left: 0; top: 0; z-index: 3; pointer-events: none; padding: 3px 6px; background: #fff3d6; color: #2c2450; font: 700 12px/1.1 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; white-space: nowrap; box-shadow: 2px 0 0 0 #2c2450, -2px 0 0 0 #2c2450, 0 2px 0 0 #2c2450, 0 -2px 0 0 #2c2450; }
.sim-tag[hidden], .sim-badge[hidden] { display: none; }
.sim-badge { position: fixed; left: 0; top: 0; z-index: 3; pointer-events: none; padding: 3px 7px; background: #2c2450; color: #fff3d6; font: 700 12px/1.1 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; white-space: nowrap; box-shadow: 2px 0 0 0 #fff3d6, -2px 0 0 0 #fff3d6, 0 2px 0 0 #fff3d6, 0 -2px 0 0 #fff3d6, 0 4px 0 0 #171230; }
.sim-badge b { color: #ffd23c; font-size: 14px; margin-left: 2px; }
.sim-badge::after { content: ""; position: absolute; left: 50%; bottom: -8px; margin-left: -3px; border: 3px solid transparent; border-top: 4px solid #fff3d6; }
.sim-tag small { font-weight: 400; opacity: 0.8; margin-left: 4px; }
@media (orientation: landscape) { .sim-sheet { left: auto; width: min(420px, 46vw); } }
`;

/** 看全图的点的颜色（同 mount.ts 的 DOT_HEX） */
const LEGEND: [string, string][] = [
  ['#c8f04a', '打球'],
  ['#f59a2e', '吃喝'],
  ['#e0443c', '排队'],
  ['#fff3d6', '路上'],
  ['#45c8f0', '泳池'],
  ['#f07ab8', '看 · 歇'],
  ['#8a6cf0', '员工'],
];

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export interface SimHud {
  el: HTMLElement;
  tag: HTMLElement;
  /** 会所屋顶上的人数小牌 */
  badge: HTMLElement;
  show(on: boolean): void;
  open(on?: boolean): void;
  isOpen(): boolean;
  sync(d: HudData): void;
}

export function createSimHud(h: HudHost): SimHud {
  if (!document.getElementById('sim-hud-css')) {
    const st = document.createElement('style');
    st.id = 'sim-hud-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'sim-sheet';
  el.hidden = true;
  el.innerHTML = `
    <div class="sim-top">
      <button type="button" class="sim-bar" aria-expanded="false">
        <span class="sim-clock"></span><span class="sim-period"></span>
        <span class="sim-count">在场 <b></b> 人</span><span class="sim-caret">▲</span>
      </button>
      <button type="button" class="sim-exit">退出</button>
    </div>
    <button type="button" class="sim-legend" hidden></button>
    <button type="button" class="sim-fol" hidden><i>跟着</i><span></span><b>✕</b></button>
    <div class="sim-row sim-speeds"></div>
    <div class="sim-more" hidden>
      <div class="sim-row sim-jumps"></div>
      <div class="sim-row">
        <button type="button" class="sim-ov">看全图</button>
        <button type="button" class="sim-rand">随便跟一个人</button>
      </div>
      <div class="sim-row">
        <button type="button" class="sim-desk"></button>
      </div>
      <div class="sim-follow" hidden>
        <div class="sim-h">跟着的人 · 今天的日程</div>
        <div class="sim-who"></div>
        <ul class="sim-agenda"></ul>
        <div class="sim-row"><button type="button" class="sim-card">名片</button><button type="button" class="sim-stop">不跟了</button></div>
      </div>
      <div class="sim-h">此刻在场的人（点一个跟着他；也可以直接点画面里的人）<span class="sim-staffn"></span></div>
      <div class="sim-picks"></div>
      <div class="sim-h">各处人数</div>
      <div class="sim-areas"></div>
      <div class="sim-h">刚刚</div>
      <div class="sim-feed"></div>
      <div class="sim-h sim-gaps-h" hidden>开发 · 画面缺口</div>
      <div class="sim-gaps" hidden></div>
    </div>`;
  document.body.appendChild(el);
  const tag = document.createElement('div');
  tag.className = 'sim-tag';
  tag.hidden = true;
  document.body.appendChild(tag);
  const badge = document.createElement('div');
  badge.className = 'sim-badge';
  badge.hidden = true;
  document.body.appendChild(badge);

  const $ = <T extends HTMLElement>(s: string) => el.querySelector(s) as T;
  const bar = $<HTMLButtonElement>('.sim-bar');
  const more = $<HTMLElement>('.sim-more');
  const fol = $<HTMLButtonElement>('.sim-fol');
  const speeds = $<HTMLElement>('.sim-speeds');
  const jumps = $<HTMLElement>('.sim-jumps');
  const ov = $<HTMLButtonElement>('.sim-ov');
  const follow = $<HTMLElement>('.sim-follow');
  const picks = $<HTMLElement>('.sim-picks');
  const legend = $<HTMLButtonElement>('.sim-legend');
  const desk = $<HTMLButtonElement>('.sim-desk');
  legend.innerHTML = `${LEGEND.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}<b>✕</b>`;
  legend.setAttribute('aria-label', '图例：点的颜色是在干什么；点这里不看全图');

  const open = (on = more.hidden) => {
    more.hidden = !on;
    bar.setAttribute('aria-expanded', String(on));
    $<HTMLElement>('.sim-caret').textContent = on ? '▼' : '▲';
    if (on) h.opened?.();
  };
  bar.addEventListener('click', () => open());
  fol.addEventListener('click', (e) => {
    // 点 ✕ = 不跟了；点别处 = 展开看日程
    if ((e.target as HTMLElement).tagName === 'B') h.follow(null);
    else open(true);
  });

  const pause = document.createElement('button');
  pause.type = 'button';
  pause.textContent = '⏸';
  pause.addEventListener('click', () => h.togglePause());
  speeds.appendChild(pause);
  const speedBtns = SPEEDS.map((x) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = SPEED_LABEL[x];
    b.addEventListener('click', () => h.setSpeed(x));
    speeds.appendChild(b);
    return [x, b] as const;
  });
  for (const m of JUMPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `跳到 ${hhmm(m)}`;
    b.addEventListener('click', () => h.jump(m));
    jumps.appendChild(b);
  }
  ov.addEventListener('click', () => {
    // 看全图：面板收起来（画面留给整座俱乐部），图例出在收起的那两行上面
    open(false);
    h.toggleOverview();
  });
  legend.addEventListener('click', () => h.toggleOverview());
  desk.addEventListener('click', () => h.toggleDesk());
  $<HTMLButtonElement>('.sim-exit').addEventListener('click', () => h.exit());
  $<HTMLButtonElement>('.sim-rand').addEventListener('click', () => h.followRandom());
  $<HTMLButtonElement>('.sim-card').addEventListener('click', () => h.openCard());
  $<HTMLButtonElement>('.sim-stop').addEventListener('click', () => h.follow(null));
  picks.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (b?.dataset.id) h.follow(b.dataset.id);
  });

  // 只在内容变了时重写（列表里的按钮被按着时不被换掉）
  const last: Record<string, string> = {};
  const put = (k: string, node: HTMLElement, html: string) => {
    if (last[k] === html) return;
    last[k] = html;
    node.innerHTML = html;
  };

  return {
    el,
    tag,
    badge,
    show(on) {
      el.hidden = !on;
      document.body.classList.toggle('sim-on', on);
      if (!on) {
        tag.hidden = true;
        badge.hidden = true;
      }
    },
    open,
    isOpen: () => !more.hidden,
    sync(d) {
      $<HTMLElement>('.sim-clock').textContent = d.clock;
      $<HTMLElement>('.sim-staffn').textContent = d.staff ? ` · 员工 ${d.staff} 人在岗，排在后面` : '';
      $<HTMLElement>('.sim-period').textContent = d.paused ? `${d.period} · 停着` : d.period;
      $<HTMLElement>('.sim-count b').textContent = String(d.total);
      pause.setAttribute('aria-pressed', String(d.paused));
      for (const [x, b] of speedBtns) b.setAttribute('aria-pressed', String(!d.paused && x === d.speed));
      ov.setAttribute('aria-pressed', String(d.overview));
      ov.textContent = d.overview ? '看全图（开着）' : '看全图';
      legend.hidden = !d.overview;
      desk.setAttribute('aria-pressed', String(d.desk.away));
      put(
        'desk',
        desk,
        d.desk.moving
          ? d.desk.away
            ? '总监正走开…'
            : '总监正走回前台…'
          : d.desk.away
            ? '总监回到前台<small>现在前台没人：来签到的人排着队等</small>'
            : '总监离开前台<small>看看没人签到时前台排多长的队</small>',
      );
      const f = d.follow;
      fol.hidden = !f;
      follow.hidden = !f;
      if (f) {
        $<HTMLElement>('.sim-fol span').textContent = `${f.name} · ${f.now}`;
        put(
          'who',
          $<HTMLElement>('.sim-who'),
          `<b>${esc(f.name)}</b> ${esc(f.title)}<small>${esc(f.gone ? `${f.now}（已经不在俱乐部了）` : f.now)}</small>`,
        );
        put(
          'agenda',
          $<HTMLElement>('.sim-agenda'),
          f.agenda.map((r) => `<li class="${r.state}"><b>${esc(r.t)}</b><span>${esc(r.text)}</span></li>`).join(''),
        );
        $<HTMLButtonElement>('.sim-card').hidden = !f.canCard;
      }
      put(
        'picks',
        picks,
        d.picks
          .map(
            (p) =>
              `<button type="button" data-id="${esc(p.id)}"><span>${esc(p.name)}</span><small>${esc(p.note)}</small></button>`,
          )
          .join(''),
      );
      put(
        'areas',
        $<HTMLElement>('.sim-areas'),
        d.areas.map(([n, c]) => `<div><span>${esc(n)}</span><b>${c}</b></div>`).join(''),
      );
      put(
        'feed',
        $<HTMLElement>('.sim-feed'),
        d.feed.map((e) => `<div><b>${esc(e.t)}</b>${esc(e.text)}</div>`).join('') || '<div>（还没有）</div>',
      );
      // 画面缺口是写给开发的（第 3 轮评审：用户看不懂）：只在 ?dev=1 时给（mount 不给就整节藏起来）
      const gapsEl = $<HTMLElement>('.sim-gaps');
      gapsEl.hidden = !d.gaps.length;
      $<HTMLElement>('.sim-gaps-h').hidden = !d.gaps.length;
      put('gaps', gapsEl, d.gaps.map((g) => `<div>· ${esc(g)}</div>`).join(''));
    },
  };
}
