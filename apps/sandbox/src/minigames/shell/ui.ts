// 小游戏壳的界面（DOM 叠层，在 play 的界面上面）：顶上的游戏 HUD、横幅、飘字、标记箭头、开局卡、结算卡。
// 只管画；什么时候显示什么由 index.ts 的状态机决定。时间都是模拟时间（和 __mg.step 一致）。
import { MG_CSS } from './style';

export interface Line {
  label: string;
  value: string | number;
}

export interface ResultView {
  /** "时间到！"、"清场！" */
  reason: string;
  score: number;
  stars: number;
  lines: readonly Line[];
  best: number | null;
  record: boolean;
}

export interface MarkerOpts {
  /** 箭头上方的小字（"倒球"） */
  label?: string;
  /** CSS 颜色（默认金色） */
  color?: string;
  /** 在画面外时贴边指着它（默认 true） */
  edge?: boolean;
}

export interface PopOpts {
  /** gold（默认）/ green / red / cream，或者 CSS 颜色 */
  color?: string;
  big?: boolean;
  /** 飘多久（秒，默认 0.9） */
  dur?: number;
}

type Project = (p: { x: number; y: number; z: number }) => { x: number; y: number };
type V3Like = { x: number; y: number; z: number };

interface Pop {
  el: HTMLDivElement;
  at: V3Like;
  t0: number;
  dur: number;
}
interface Mark {
  el: HTMLDivElement;
  at: () => V3Like | null;
  edge: boolean;
}

export function injectCss() {
  if (document.getElementById('mg-css')) return;
  const st = document.createElement('style');
  st.id = 'mg-css';
  st.textContent = MG_CSS;
  document.head.appendChild(st);
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export function createUi(o: {
  title: string;
  tag: string;
  goal: string;
  howto: readonly string[];
  scoreLabel: string;
  hubHref: string;
  onStart(): void;
  onAgain(): void;
}) {
  injectCss();
  const root = document.body.appendChild(document.createElement('div'));
  root.className = 'mg-root';
  root.innerHTML = `
    <div class="mg-hud" hidden>
      <div class="mg-cell mg-px mg-time"><small>时间</small><b>0:00</b></div>
      <div class="mg-cell mg-px mg-score"><small>${esc(o.scoreLabel)}</small><b>0</b></div>
      <div class="mg-cell mg-px mg-lives" hidden><small>机会</small><b></b></div>
      <div class="mg-cell mg-px mg-combo" hidden><small>连击</small><b>×2</b></div>
    </div>
    <div class="mg-marks"></div>
    <div class="mg-pops"></div>
    <div class="mg-toast mg-px gone"></div>
    <div class="mg-loading mg-px">加载中…</div>
    <div class="mg-shade mg-intro" hidden>
      <div class="mg-card mg-px">
        <div class="mg-tag">${esc(o.tag)}</div>
        <h1>${esc(o.title)}</h1>
        <p class="mg-goal">${esc(o.goal)}</p>
        <ul>${o.howto.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
        <div class="mg-best"></div>
        <button class="mg-btn mg-go" type="button">开始</button>
        <a class="mg-link" href="${o.hubHref}">返回小游戏列表</a>
      </div>
    </div>
    <div class="mg-shade mg-result" hidden>
      <div class="mg-card mg-px">
        <div class="mg-tag">${esc(o.title)}</div>
        <h1 class="mg-reason"></h1>
        <div class="mg-big"><div class="mg-stars"><span>★</span><span>★</span><span>★</span></div><b>0</b></div>
        <div class="mg-lines"></div>
        <div class="mg-best"></div>
        <button class="mg-btn mg-again" type="button">再来一局</button>
        <a class="mg-link" href="${o.hubHref}">返回小游戏列表</a>
      </div>
    </div>`;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const el = {
    hud: q('.mg-hud'),
    time: q('.mg-time'),
    timeB: q('.mg-time b'),
    score: q('.mg-score'),
    scoreB: q('.mg-score b'),
    lives: q('.mg-lives'),
    livesB: q('.mg-lives b'),
    combo: q('.mg-combo'),
    comboB: q('.mg-combo b'),
    marks: q('.mg-marks'),
    pops: q('.mg-pops'),
    toast: q('.mg-toast'),
    loading: q('.mg-loading'),
    intro: q('.mg-intro'),
    introBest: q('.mg-intro .mg-best'),
    go: q<HTMLButtonElement>('.mg-go'),
    result: q('.mg-result'),
    reason: q('.mg-reason'),
    stars: q('.mg-result .mg-stars'),
    total: q('.mg-result .mg-big b'),
    lines: q('.mg-result .mg-lines'),
    resBest: q('.mg-result .mg-best'),
    again: q<HTMLButtonElement>('.mg-again'),
  };
  // 卡挡住下面的画布：拖动不会变成摇杆
  for (const s of [el.intro, el.result]) s.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.go.addEventListener('click', () => o.onStart());
  el.again.addEventListener('click', () => o.onAgain());

  // ── 顶栏：场景给的格子 ──
  const stats = new Map<string, { el: HTMLDivElement; b: HTMLElement; small: HTMLElement; v: string }>();
  const bump = (e: HTMLElement) => {
    e.classList.remove('bump');
    void e.offsetWidth;
    e.classList.add('bump');
  };

  const pops: Pop[] = [];
  const marks = new Map<string, Mark>();
  let toastUntil = 0;
  let lastScore = -1;

  return {
    root,
    ready() {
      el.loading.remove();
    },
    showIntro(best: { score: number; stars: number } | null) {
      el.result.hidden = true;
      el.hud.hidden = true;
      el.intro.hidden = false;
      el.introBest.textContent = best
        ? `最佳 ${best.score} 分 · ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}`
        : '';
      el.go.focus({ preventScroll: true });
    },
    showPlaying() {
      el.intro.hidden = true;
      el.result.hidden = true;
      el.hud.hidden = false;
    },
    showResult(r: ResultView) {
      el.intro.hidden = true;
      el.hud.hidden = false;
      el.result.hidden = false;
      el.reason.textContent = r.reason;
      el.total.textContent = String(r.score);
      el.stars.querySelectorAll('span').forEach((s, i) => {
        s.classList.remove('on');
        if (i < r.stars) {
          void (s as HTMLElement).offsetWidth;
          s.classList.add('on');
        }
      });
      el.lines.replaceChildren(
        ...r.lines.map((l) => {
          const d = document.createElement('div');
          const sp = document.createElement('span');
          sp.textContent = l.label;
          const b = document.createElement('b');
          b.textContent = String(l.value);
          d.append(sp, b);
          return d;
        }),
      );
      el.resBest.className = r.record ? 'mg-best mg-record' : 'mg-best';
      el.resBest.textContent = r.record ? '新纪录！' : r.best !== null ? `最佳 ${r.best} 分` : '';
      el.again.focus({ preventScroll: true });
    },
    setTime(sec: string | null, low: boolean) {
      el.time.hidden = sec === null;
      if (sec !== null && el.timeB.textContent !== sec) el.timeB.textContent = sec;
      el.time.classList.toggle('low', low);
    },
    setScore(n: number) {
      if (n === lastScore) return;
      if (lastScore >= 0 && n > lastScore) bump(el.score);
      lastScore = n;
      el.scoreB.textContent = String(n);
    },
    setCombo(n: number) {
      el.combo.hidden = n < 2;
      const t = `×${n}`;
      if (n >= 2 && el.comboB.textContent !== t) {
        el.comboB.textContent = t;
        bump(el.combo);
      }
    },
    setLives(n: number | null, max: number) {
      el.lives.hidden = n === null;
      if (n !== null) el.livesB.textContent = '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, max - n));
    },
    stat(key: string, label: string, value: string | number | null, tone?: 'warn' | 'good' | null) {
      let s = stats.get(key);
      if (value === null) {
        s?.el.remove();
        stats.delete(key);
        return;
      }
      if (!s) {
        const d = document.createElement('div');
        d.className = 'mg-cell mg-px';
        const small = document.createElement('small');
        const b = document.createElement('b');
        d.append(small, b);
        el.hud.insertBefore(d, el.combo);
        s = { el: d, b, small, v: '' };
        stats.set(key, s);
      }
      s.small.textContent = label;
      const v = String(value);
      if (v !== s.v) {
        s.v = v;
        s.b.textContent = v;
      }
      s.el.classList.toggle('warn', tone === 'warn');
      s.el.classList.toggle('good', tone === 'good');
    },
    toast(text: string, until: number, big: boolean) {
      el.toast.textContent = text;
      el.toast.classList.toggle('big', big);
      el.toast.classList.remove('gone');
      toastUntil = until;
    },
    pop(at: V3Like, text: string, t: number, po: PopOpts = {}) {
      const d = document.createElement('div');
      const c = po.color ?? 'gold';
      d.className = `mg-pop${po.big ? ' big' : ''}${['green', 'red', 'cream'].includes(c) ? ` ${c}` : ''}`;
      if (!['gold', 'green', 'red', 'cream'].includes(c)) d.style.color = c;
      d.textContent = text;
      el.pops.appendChild(d);
      pops.push({ el: d, at: { x: at.x, y: at.y, z: at.z }, t0: t, dur: po.dur ?? 0.9 });
      // 同时最多 24 个
      while (pops.length > 24) pops.shift()?.el.remove();
    },
    clearPops() {
      for (const p of pops) p.el.remove();
      pops.length = 0;
    },
    marker(id: string, at: () => V3Like | null, mo: MarkerOpts = {}) {
      marks.get(id)?.el.remove();
      const d = document.createElement('div');
      d.className = 'mg-mark';
      d.style.setProperty('--c', mo.color ?? '#ffd23c');
      d.innerHTML = `<i></i><span>${esc(mo.label ?? '')}</span>`;
      el.marks.appendChild(d);
      marks.set(id, { el: d, at, edge: mo.edge ?? true });
      return () => {
        const m = marks.get(id);
        if (m && m.el === d) {
          d.remove();
          marks.delete(id);
        }
      };
    },
    /** 每帧（渲染后）：飘字、标记、横幅 */
    frame(project: Project, t: number, W: number, H: number) {
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        const k = (t - p.t0) / p.dur;
        if (k >= 1 || k < 0) {
          p.el.remove();
          pops.splice(i, 1);
          continue;
        }
        const s = project(p.at);
        // 先往上蹦一下再慢慢飘，最后一成淡出（按 2 像素取整：像素风）
        const rise = Math.round((34 * (1 - (1 - k) ** 2)) / 2) * 2;
        p.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y) - rise}px) translate(-50%, -100%)`;
        p.el.style.opacity = k > 0.75 ? String(1 - (k - 0.75) / 0.25) : '1';
      }
      // 标记：画面里 = 头上跳的箭头；画面外 = 贴着画面边（顶上让开 HUD、右下让开按钮），箭头指向它
      const top = 120;
      const pad = 40;
      for (const m of marks.values()) {
        const a = m.at();
        m.el.hidden = !a;
        if (!a) continue;
        const s = project(a);
        const inside = s.x > pad && s.x < W - pad && s.y > top - 40 && s.y < H - pad;
        if (inside || !m.edge) {
          m.el.classList.remove('edge');
          m.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
          continue;
        }
        m.el.classList.add('edge');
        const cx = W / 2;
        const cy = H / 2;
        const dx = s.x - cx;
        const dy = s.y - cy;
        // 从画面中心朝目标射过去，和内缩的边框求交
        const hx = W / 2 - pad;
        const hyTop = cy - top;
        // 下边让开右下的按钮（竖屏 ≈ 130 像素高）
        const hyBot = H / 2 - Math.min(140, H * 0.2);
        const kx = dx !== 0 ? hx / Math.abs(dx) : Number.POSITIVE_INFINITY;
        const ky = dy !== 0 ? (dy < 0 ? hyTop : hyBot) / Math.abs(dy) : Number.POSITIVE_INFINITY;
        const k = Math.min(kx, ky);
        const x = cx + dx * k;
        const y = cy + dy * k;
        m.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        m.el.style.setProperty('--a', `${Math.atan2(dy, dx).toFixed(3)}rad`);
        // 三角离方块中心多远：方块半宽 + 一点（有字的方块宽）
        const sp = m.el.lastElementChild as HTMLElement;
        const half = Math.max(sp.offsetWidth, sp.offsetHeight) / 2;
        m.el.style.setProperty('--r', `${Math.round(half + 7)}px`);
      }
      if (toastUntil && t >= toastUntil) {
        toastUntil = 0;
        el.toast.classList.add('gone');
      }
    },
  };
}

export type Ui = ReturnType<typeof createUi>;
