// 像素人物卡（clubsite/hud 的半屏卡；?hud=old 还是 card.ts 的全屏文字卡）。能画就不写：
//   第一层：像素肖像（从卡顶探出来）、名字、他自己的一句话；好感 5 颗心、心情脸 + 短条；
//           一天的时间带（太阳 → 月亮，他在的钟点填他的招牌色，现在 = 一根竖线 + 上面他在干什么的小图）；
//           底下一排互动按钮：图标 + 代价（小时钟 / 金币 + 点阵数字）。不当面时按了先走过去，到了自动做。
//   第二层（点卡顶的小箭头）：一周 7 格、6 项属性（图标 + 短条）、性子（≤ 3 个词）、牵连（小头像 + 关系小图，点了换成他）。
// 字：名字 + 一句话，第二层只有性子的几个词。卡片外面点一下 / 往下滑 = 收起。
import { actionsFor } from '../cast';
import { TRAITS } from '../cast/traits';
import type { ActionDef, ActionId, Activity, CastPerson, TieKind } from '../cast/types';
import {
  actIcon,
  bar,
  costChip,
  createSheet,
  dayBand,
  type GlyphId,
  glyph,
  hearts,
  hudScale,
  lang,
  named,
  pips5,
  px,
  type TKey,
  t,
  tap,
} from '../hud';
import { KEYS } from '../hud/colors';
import type { Card } from './card';
import type { CastCtx } from './ctx';
import { accentDarkNum, accentNum, portraitCanvas } from './portrait';

/** 在干什么 → 时间带上"现在"那根线上面的小图 */
export const ACT_GLYPH: Record<Activity, GlyphId> = {
  play: 'ball',
  watch: 'eye',
  rest: 'zzz',
  eat: 'fork',
  walk: 'feet',
  work: 'clip',
  gym: 'dumbbell',
  swim: 'swim',
  wait: 'wait',
  idle: '…',
};
/** 牵连的种类 → 小图 */
export const TIE_GLYPH: Record<TieKind, GlyphId> = {
  family: 'house',
  partner: 'pair',
  friend: 'link',
  mentor: 'cap',
  rival: 'swords',
  crush: 'heart',
  colleague: 'badge',
  history: 'book',
};
export const ATTR_ROWS: { k: 'ntrp' | 'fitness' | 'social' | 'patience' | 'spend' | 'loyalty'; g: GlyphId }[] = [
  { k: 'ntrp', g: 'racket' },
  { k: 'fitness', g: 'bolt' },
  { k: 'social', g: 'talkers' },
  { k: 'patience', g: 'turtle' },
  { k: 'spend', g: 'wallet' },
  { k: 'loyalty', g: 'anchor' },
];
/** 互动按钮的固定槽位（同 clubsite/cast/actions.ts 的顺序） */
const SLOTS: ActionId[] = ['chat', 'treat', 'rally', 'ask', 'gift', 'message'];
/** 营业时段（同日钟的外圈、life 的 presence：6:00–22:00） */
const OPEN = 6;
const CLOSE = 22;

const CSS = `
.pxs-card { padding-top: calc(var(--s) * 4px); }
.pxc-top { display: flex; gap: calc(var(--s) * 5px); align-items: flex-start; }
.pxc-pic { flex: none; margin-top: calc(var(--s) * -16px); box-shadow: 2px 0 0 0 #2c2848, -2px 0 0 0 #2c2848, 0 2px 0 0 #2c2848, 0 -2px 0 0 #2c2848, 0 4px 0 0 #171230; }
.pxc-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: calc(var(--s) * 2px); }
.pxc-row { display: flex; align-items: center; gap: calc(var(--s) * 3px); min-height: 24px; }
.pxc-row .pxs-name { flex: 0 1 auto; min-width: 0; }
.pxc-mood { display: flex; align-items: center; gap: calc(var(--s) * 1px); margin-left: auto; }
.pxc-band { display: flex; justify-content: center; margin: calc(var(--s) * 4px) 0 calc(var(--s) * 2px); position: relative; }
.pxc-acts { display: flex; justify-content: space-between; gap: calc(var(--s) * 3px); margin-top: calc(var(--s) * 3px); padding: 0 2px; }
.pxc-acts .pxs-btn, .pxc-slot { flex: 1 1 0; min-width: 0; min-height: 60px; position: relative; margin: 0 0 4px; }
/* 空槽：位置留着（按钮不跳），只画一圈淡淡的虚线，不像一个按不动的按钮 */
.pxc-slot { background: repeating-linear-gradient(90deg, #f0c888 0 4px, transparent 4px 8px) top / 100% 2px no-repeat, repeating-linear-gradient(90deg, #f0c888 0 4px, transparent 4px 8px) bottom / 100% 2px no-repeat, repeating-linear-gradient(0deg, #f0c888 0 4px, transparent 4px 8px) left / 2px 100% no-repeat, repeating-linear-gradient(0deg, #f0c888 0 4px, transparent 4px 8px) right / 2px 100% no-repeat; }
.pxc-acts.far { gap: calc(var(--s) * 4px); }
.pxc-acts.one { justify-content: center; }
.pxc-acts.one .pxs-big { flex: 0 0 160px; }
.pxc-unmet { display: flex; align-items: center; justify-content: center; gap: calc(var(--s) * 4px); padding: calc(var(--s) * 2px) 0; }
.pxc-fold { position: absolute; left: 50%; top: calc(var(--s) * -22px); transform: translateX(-50%); width: 56px; height: 44px; justify-content: flex-start !important; }
.pxc-more { display: flex; flex-direction: column; gap: calc(var(--s) * 3px); padding: 0; }
.pxc-attrs { display: flex; flex-direction: column; gap: calc(var(--s) * 2px); }
.pxc-attr { display: flex; align-items: center; gap: calc(var(--s) * 2px); }
.pxc-line2 { display: flex; align-items: center; gap: calc(var(--s) * 4px); flex-wrap: wrap; }
.pxc-ties { display: flex; gap: calc(var(--s) * 3px); flex-wrap: wrap; margin-bottom: calc(var(--s) * 4px); }
.pxc-tie { position: relative; }
.pxc-tie .k { position: absolute; right: -6px; bottom: -6px; }
`;

function headCrop(id: string, p: CastPerson, size = 22): HTMLCanvasElement {
  const src = portraitCanvas(id, p.look, p.age, true);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  // 头像底：卡纸暗一档（看板上一片浅，不是一墙深色方块）
  const y0 = p.look.body === 'kid' ? 1 : 2;
  g.drawImage(src, (32 - size) / 2, y0, size, size, 0, 0, size, size);
  return c;
}

export { headCrop };

const hexN = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function portrait(id: string, p: CastPerson): HTMLCanvasElement {
  const src = portraitCanvas(id, p.look, p.age);
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = hexN(accentDarkNum(p.look));
  g.fillRect(0, 0, 32, 32);
  g.drawImage(src, 0, 0);
  return c;
}

/** 名字：中文界面用中文叫法（两三个字），英文界面用名 */
export const shortName = (p: CastPerson) => (lang() === 'zh' && p.nameZh ? p.nameZh : p.name.split(' ')[0]);

export function createPxCard(ctx: CastCtx, onShow?: (id: string | null) => void): Card {
  if (!document.getElementById('pxc-css')) {
    const st = document.createElement('style');
    st.id = 'pxc-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const sheet = createSheet('card', () => {
    id = '';
    more = false;
    onShow?.(null);
  });
  const el = sheet.el;
  let id = '';
  let list: string[] = [];
  let near = false;
  let more = false;
  /** 最近一次互动的回话（显示在一句话那里），换人清掉 */
  let said: { id: string; text: string; bad: boolean } | null = null;
  let favorShown = -1;
  /** 不当面时按的动作：走过去，到了（卡片重新打开、当面）自动做 */
  let queued: { id: string; act: ActionId } | null = null;
  let acting = false;

  function render() {
    const p = ctx.person(id);
    if (!p) return;
    const m = ctx.mem(id);
    near = ctx.near(id);
    const n = ctx.nowOf(id);
    const s = ctx.state();
    const _accent = accentNum(p.look);

    // ── 头：肖像、名字、心、心情、一句话 ──
    const top = div('pxc-top');
    top.appendChild(px(portrait(id, p), 1, 'pxc-pic'));
    const idb = div('pxc-id');
    const row = div('pxc-row');
    const nm = div('pxs-name', shortName(p));
    const hc = named(px(hearts(m.favor), 1, 'pxc-hearts'), 'favor');
    const mood = named(div('pxc-mood'), 'mood');
    mood.append(
      px(glyph(m.mood >= 66 ? 'smile' : m.mood >= 33 ? 'meh' : 'sad')),
      px(bar(m.mood / 100, 20, m.mood >= 66 ? 0x6aa848 : m.mood >= 33 ? 0xc8902c : 0xc0545a)),
    );
    row.append(nm, hc, mood);
    const lineText = said?.id === id ? said.text : n.thought;
    const line = div(`pxs-line${said?.id === id && said.bad ? ' bad' : ''}`, lineText ? `「${lineText}」` : '');
    idb.append(row, line);
    top.appendChild(idb);

    // ── 一天的时间带 ──
    const band = div('pxc-band');
    const wd = (s.day - 1) % 7;
    const segs: [number, number][] = p.week
      ? p.week.days.includes(wd)
        ? [p.week.hours]
        : []
      : p.tier === 'crowd'
        ? []
        : [[OPEN, CLOSE]];
    const nowH = s.minute / 60;
    // 他就在场：现在这一段一定是他的颜色（不在常来的钟点也来了），针不落在空槽里
    if (ctx.bound(id) && !segs.some(([a, b]) => nowH >= a && nowH <= b)) segs.push([nowH - 0.5, nowH + 1]);
    named(band, n.here && ctx.bound(id) && n.activity !== 'idle' ? (`do_${n.activity}` as TKey) : 'hours');
    band.appendChild(
      px(
        dayBand({
          from: OPEN,
          to: CLOSE,
          w: 120,
          segs,
          color: KEYS.s,
          now: nowH,
          mark: null,
          dim: !n.here,
        }),
      ),
    );

    const parts: HTMLElement[] = [top, band];
    if (more) parts.push(second(p, m.met, wd));
    parts.push(acts(p, n));
    const fold = btn('pxc-fold', more ? t('less') : t('more'));
    const tabEl = div('pxs-tab');
    tabEl.appendChild(px(actIcon(more ? 'down' : 'up')));
    fold.appendChild(tabEl);
    fold.dataset.more = '1';
    tap(fold, () => {
      more = !more;
      sheet.el.querySelector('.pxs-say')?.classList.add('gone');
      render();
    });
    parts.push(fold);
    sheet.body.replaceChildren(...parts);
    // 好感变了：心那里飘一颗心 + 点阵的 +0.8
    if (favorShown >= 0 && Math.abs(m.favor - favorShown) > 0.01) floatDelta(hc, m.favor - favorShown);
    favorShown = m.favor;
  }

  function second(p: CastPerson, met: boolean, _wd: number): HTMLElement {
    const box = div('pxc-more');
    box.appendChild(div('pxs-rule'));
    // 没说过话：一个大问号 + 一句"聊聊才知道"，别的都不画
    if (!met) {
      const u = div('pxc-unmet');
      u.append(px(glyph('?'), 2), div('pxs-line', t('unknown')));
      box.appendChild(u);
      return box;
    }
    // 一周 7 个小太阳（来的那几天亮）+ 性子（≤ 3 个词）。每个人都画（每天都在的人 = 7 个都亮）：第二层的排版人人一样
    const l2 = div('pxc-line2');
    for (const tid of p.traits.slice(0, 3)) {
      const tr = TRAITS[tid];
      if (tr) l2.appendChild(div('pxs-chip', tr.name));
    }
    box.appendChild(l2);
    // 属性：只留最突出的 3 项（离一般最远的），长条，高绿 / 中黄 / 低红
    const vals = ATTR_ROWS.map((a) => ({
      ...a,
      v: a.k === 'ntrp' ? (p.attrs.ntrp - 1) / 6 : p.attrs[a.k] / 100,
    }));
    const top3 = [...vals].sort((a, b) => Math.abs(b.v - 0.5) - Math.abs(a.v - 0.5)).slice(0, 3);
    const g = div('pxc-attrs');
    // 条拉满卡宽（卡宽 − 图标 − 留边，纹素）
    const _bw = Math.max(40, Math.floor((sheet.el.clientWidth || 360) / hudScale()) - 28);
    for (const a of vals) {
      if (!top3.includes(a)) continue;
      const it = named(div('pxc-attr'), `attr_${a.k}` as TKey);
      it.appendChild(px(glyph(a.g)));
      it.appendChild(px(pips5(a.v)));
      g.appendChild(it);
    }
    box.appendChild(g);
    // 牵连：小头像 + 关系小图，点了换成他
    if (p.ties.length) {
      const ties = div('pxc-ties');
      for (const tie of p.ties.slice(0, 6)) {
        const o = ctx.person(tie.with);
        if (!o) continue;
        const b = btn('pxc-tie', o.nameZh || o.name);
        b.appendChild(px(headCrop(o.id, o)));
        // 关系不另画角标（第 3 轮评判：蓝底小牌猜不出）：点头像出"名字 · 关系"
        named(b, null, `${shortName(o)} · ${t(`tie_${tie.kind}` as TKey)}`);
        tap(b, () => {
          if (!list.includes(o.id)) list = [id, ...p.ties.map((x) => x.with)];
          show(o.id);
        });
        ties.appendChild(b);
      }
      box.appendChild(ties);
    }
    return box;
  }

  function acts(p: CastPerson, n: ReturnType<CastCtx['nowOf']>): HTMLElement {
    const box = div('pxc-acts');
    const m = ctx.mem(p.id);
    const s = ctx.state();
    const defs: ActionDef[] = actionsFor(p, { near, activity: n.activity, scene: n.scene }, m);
    // 不当面：只有两个大按钮 —— 走过去（脚印）、发条消息（信封，见过面才有）；当面的动作走到跟前再出现
    if (!near) {
      box.classList.add('far');
      const w = btn('pxs-big', t('walk'));
      w.appendChild(px(actIcon('walk'), 2));
      if (!n.here) w.classList.add('off');
      tap(w, () => {
        if (!n.here) return;
        sheet.say(t('walk'));
        ctx.walkTo(p.id);
      });
      box.appendChild(w);
      const msg = defs.find((a) => a.id === 'message');
      if (msg) box.appendChild(actBtn(p, msg, m, s, 'pxs-big', 2));
      else box.classList.add('one');
      return box;
    }
    // 当面：固定 6 个槽，位置永远不动；这个人做不了的（不打球的没有"打一局"、没见过面的没有"发消息"）留一个空凹槽
    for (const slot of SLOTS) {
      const a = defs.find((d) => d.id === slot);
      if (a) box.appendChild(actBtn(p, a, m, s, 'pxs-big'));
      else box.appendChild(div('pxc-slot'));
    }
    return box;
  }

  function actBtn(
    p: CastPerson,
    a: ActionDef,
    m: ReturnType<CastCtx['mem']>,
    s: ReturnType<CastCtx['state']>,
    cls = '',
    k = 1,
  ): HTMLButtonElement {
    const icon = a.id === 'treat' && p.look.body !== 'adult' ? 'pop' : a.id;
    const label = t(`act_${a.id}` as TKey);
    const b = btn(cls, label);
    b.appendChild(px(actIcon(icon), k));
    // 代价只写一种：花钱的写钱（HUD 那枚金币），不花钱的写时间（小钟）
    b.appendChild(px(a.money ? costChip('coin', a.money) : costChip('clock', a.minutes)));
    const cant =
      a.money > s.money ||
      (a.id === 'gift' && m.giftDay > 0 && s.day - m.giftDay < 7) ||
      (a.id === 'message' && !m.met);
    if (cant) b.classList.add('off');
    tap(b, () => {
      sheet.say(label);
      if (cant) return;
      // 卡开着的时候他走开了：先走过去，到了接着做
      if (a.inPerson && !ctx.near(p.id)) {
        queued = { id: p.id, act: a.id };
        ctx.walkTo(p.id);
        return;
      }
      run(a.id);
    });
    return b;
  }

  function run(a: ActionId) {
    acting = true;
    const r = ctx.doAct(id, a);
    acting = false;
    said = { id, text: r.ok ? r.line || '' : r.line || r.reason || '', bad: !r.ok };
    render();
  }

  function floatDelta(anchor: HTMLElement, d: number) {
    const host = anchor.parentElement;
    if (!host) return;
    // 好感变了：心旁边一颗心闪三下（涨 = 红心，掉 = 空心），不写小数
    const f = document.createElement('div');
    f.className = 'pxs-blink';
    f.style.left = `${anchor.offsetLeft + anchor.offsetWidth + 4}px`;
    f.style.top = `${anchor.offsetTop}px`;
    f.appendChild(px(glyph(d >= 0 ? 'heart' : 'heartOff')));
    host.style.position = 'relative';
    host.appendChild(f);
  }

  function show(nid: string) {
    if (nid !== id) {
      said = null;
      favorShown = -1;
    }
    id = nid;
    sheet.open();
    onShow?.(nid);
    render();
  }

  // 左右滑：换附近的下一个人
  let sw: { x: number; y: number; id: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    sw = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  el.addEventListener('pointerup', (e) => {
    if (!sw || sw.id !== e.pointerId) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    sw = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 40 && list.length > 1) {
      const i = list.indexOf(id);
      show(list[(i + (dx < 0 ? 1 : -1) + list.length) % list.length]);
    }
  });
  ctx.onChange(() => {
    if (sheet.isOpen() && !acting && id) render();
  });

  return {
    open(nid, l) {
      if (l?.includes(nid)) list = l;
      else if (!list.includes(nid)) list = [nid];
      show(nid);
      // 不当面时按的动作：走到了，卡片重新打开 → 接着做
      if (queued && queued.id === nid && ctx.near(nid)) {
        const a = queued.act;
        queued = null;
        run(a);
      }
    },
    close() {
      sheet.close();
    },
    isOpen: () => sheet.isOpen(),
    tickNear() {
      if (!sheet.isOpen() || !id) return;
      const nn = ctx.near(id);
      if (nn !== near) render();
    },
  };
}

function div(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}
function btn(cls: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `pxs-btn ${cls}`.trim();
  b.setAttribute('aria-label', label);
  return b;
}
