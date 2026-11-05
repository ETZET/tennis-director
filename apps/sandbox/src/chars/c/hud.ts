import { byId, type Member } from './cast';
import type { EmoteId } from './sprite';

/**
 * 游戏 HUD 的仿制（样子照 packages/ui/src/hud 和 staff.css 抄进 style.css，不引用游戏代码）。
 * 地图上没有肖像（制作人：大头照只在花名册里）：
 * - 员工条：格子里是场景小人的头（从 idle 第一帧裁 12×11，3×），和地图上那个人一模一样；
 * - 事件卡：谁来找你 = 名字 + 岗位 + 他在场景里的小人（4×，在演 idle），地图上他头顶同时冒一个 ▼ 名字；
 * - 说话气泡：只有短短一句（≤14 字）+ 一个像素表情，左边一道招牌色、上面一个名字小牌，尾巴指着小人；
 *   说话的人同时做一个动作（跳一下 / 跺脚），情绪由小人自己演。
 */

export interface HudDeps {
  /** 小人的头（裁 idle 第一帧） */
  head(m: Member): HTMLCanvasElement;
  /** 会动的小人 */
  sprite(m: Member, scale: number): HTMLCanvasElement;
  /** 像素表情图标 */
  emote(id: EmoteId, scale: number): HTMLCanvasElement;
  openRoster(id?: string): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface Bubble {
  id: string;
  el: HTMLElement;
  /** 说话时小人演的动作 */
  act: 'happy' | 'angry';
}
export interface Hud {
  root: HTMLElement;
  bubbles: Bubble[];
  /** 地图上指着来找你的人（▼ 名字） */
  pointer: { id: string; el: HTMLElement };
}

const STAFF_ROW: { id: string; doing: string; sk: [number, number, number, number]; state?: 'idle' | 'picked' }[] = [
  { id: 'jess', doing: '青训 · 对打', sk: [0.7, 0.3, 0.5, 0.8] },
  { id: 'dale', doing: '青训 · 喂球', sk: [0.9, 0.2, 0.4, 0.5] },
  { id: 'gus', doing: '刷场 · 累了', sk: [0.1, 0.95, 0.2, 0.3], state: 'idle' },
  { id: 'lily', doing: '前台 · 夜班', sk: [0.2, 0.2, 0.9, 0.2] },
  { id: 'ben', doing: '路上 · 2 分', sk: [0.3, 0.3, 0.7, 0.4] },
  { id: 'ray', doing: '巡场', sk: [0.2, 0.8, 0.4, 0.2] },
  { id: 'mateo', doing: '球童', sk: [0.1, 0.4, 0.4, 0.6] },
  { id: 'nadia', doing: '表演赛', sk: [0.5, 0.1, 0.6, 0.95], state: 'picked' },
];

/** 花名册按钮的像素图标：两个人的半身（纸色 + 香槟色） */
const ROSTER_ICON = [
  '..pp....aa..',
  '.pppp..aaaa.',
  '.pppp..aaaa.',
  '..pp....aa..',
  '............',
  '.pppp..aaaa.',
  'pppppp.aaaaa',
  'pppppp.aaaaa',
];
function pixIcon(rows: readonly string[], scale: number): HTMLCanvasElement {
  const pal: Record<string, string> = { p: '#f3ecdc', a: '#d8c08a' };
  const cv = document.createElement('canvas');
  cv.width = Math.max(...rows.map((r) => r.length));
  cv.height = rows.length;
  cv.style.width = `${cv.width * scale}px`;
  cv.style.height = `${cv.height * scale}px`;
  cv.className = 'c-px';
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const c = pal[r[x] as string];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return cv;
}

export function createHud(d: HudDeps): Hud {
  const root = h('div', 'td-hud c-hud');
  // 记分牌
  const bug = h('div', 'td-bug');
  bug.append(h('div', 'td-bug-badge', 'D9'), h('div', 'td-bug-clock', '16:40'));
  const money = h('div', 'c-money', '$1,240 · ★ 26');
  root.append(bug, money);

  // 事件卡：谁来找你（不放肖像：名字、岗位、场景里的小人）
  const gus = byId('gus');
  const card = h('section', 'td-card c-card');
  const tags = h('div', 'td-card-tags');
  tags.append(h('span', 'td-tag-topic', '人事'), h('span', 'td-tag-loc', '青训场边'));
  const body = h('div', 'td-card-body');
  const who = h('div', 'c-who');
  const st = h('div', 'c-who-spr');
  st.style.borderColor = gus.tint;
  st.append(d.sprite(gus, 4));
  who.append(st);
  const head = h('div', 'c-card-headrow');
  head.append(
    h('span', 'c-who-name', `<b style="background:${gus.tint}">Gus</b><span>场地 · 心累了</span>`),
    h('h2', 'td-card-head', '想歇一周'),
  );
  const text = h('p', 'td-card-text', '“场地我天天刷，脚印天天有。我累了，总监。”');
  const answers = h('div', 'td-answers c-answers');
  const opts: { t: string; hint: string }[] = [
    { t: '放他一周假', hint: '−维护 · 士气 +20' },
    { t: '我陪他刷', hint: '总监半天 · 好感 +' },
    { t: '再撑一周', hint: '士气 −15 · 会走' },
  ];
  opts.forEach((o, i) => {
    const b = h(
      'button',
      'td-answer',
      `<span class="td-key">${i + 1}</span><span class="td-answer-col"><span class="td-answer-text">${o.t}</span><span class="td-answer-hint">${o.hint}</span></span>`,
    );
    b.addEventListener('click', () => {
      for (const x of answers.querySelectorAll('.td-answer')) x.classList.remove('td-chosen');
      b.classList.add('td-chosen');
    });
    answers.append(b);
  });
  body.append(who, head, text, answers);
  card.append(tags, body);
  root.append(card);

  // 员工条：第一格是花名册按钮，后面是小人头像格子
  const staff = h('div', 'td-staff');
  const row = h('ul', 'td-staff-row');
  const rosterLi = h('li', 'td-tok c-tok-roster');
  const rb = h('button');
  const ico = h('span', 'c-roster-ico');
  ico.append(pixIcon(ROSTER_ICON, 3));
  rb.append(ico, h('b', '', '花名册'));
  rb.setAttribute('aria-label', '打开花名册');
  rb.addEventListener('click', () => d.openRoster());
  rosterLi.append(rb);
  row.append(rosterLi);
  for (const s of STAFF_ROW) {
    const m = byId(s.id);
    const li = h(
      'li',
      `td-tok${s.state === 'idle' ? ' td-tok-idle' : ''}${s.state === 'picked' ? ' td-tok-picked' : ''}`,
    );
    const b = h('button');
    const f = h('span', 'td-tok-face c-tok-face');
    f.style.background = m.tint;
    f.append(d.head(m));
    const txt = h('span', 'td-tok-text');
    txt.append(h('b', '', m.name), h('span', 'td-tok-doing', s.doing));
    const sk = h('span', 'td-tok-skills');
    ['teach', 'upkeep', 'service', 'play'].forEach((k, i) => {
      const bar = h('span', `td-sk td-sk-${k}`);
      const fill = h('i');
      fill.style.width = `${Math.round((s.sk[i] as number) * 100)}%`;
      bar.append(fill);
      sk.append(bar);
    });
    txt.append(sk);
    b.append(f, txt);
    li.append(b);
    row.append(li);
  }
  staff.append(row);
  root.append(staff);
  const wire = h('div', 'td-wire');
  wire.append(h('div', 'td-wire-tag', '快讯'));
  const items = h('ul', 'td-wire-items');
  items.append(
    h('li', 'td-hot', '<b>16:32</b>Nadia 的表演赛票卖光了'),
    h('li', '', '<b>16:10</b>Ray 修好了 3 号场的喷头'),
  );
  wire.append(items);
  root.append(wire);

  // 地图上的说话气泡：名字小牌 + 招牌色边 + 像素表情 + 一句话
  const bubbles: Bubble[] = [];
  const say = (id: string, icon: EmoteId, line: string, act: Bubble['act']) => {
    const m = byId(id);
    const el = h('div', 'c-bubble');
    el.style.setProperty('--sig', m.tint);
    el.append(h('span', 'c-bubble-tag', m.name));
    const ic = h('span', 'c-bubble-ico');
    ic.append(d.emote(icon, 3));
    el.append(ic, h('span', 'c-bubble-text', line));
    root.append(el);
    bubbles.push({ id, el, act });
  };
  say('lily', 'note', '今晚 12 个预约，全满！', 'happy');
  say('dale', 'anger', '膝盖抬高！说几遍了', 'angry');

  const pointer = h('div', 'c-pointer', `<b style="background:${gus.tint}">Gus</b><i>▼</i>`);
  root.append(pointer);
  return { root, bubbles, pointer: { id: 'gus', el: pointer } };
}
