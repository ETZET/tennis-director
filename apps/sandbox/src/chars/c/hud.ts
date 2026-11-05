import { byId, type Member } from './cast';
import type { Expr } from './portrait';

/**
 * 游戏 HUD 的仿制（样子照 packages/ui/src/hud 和 staff.css 抄进 style.css，不引用游戏代码）：
 * 记分牌、说话气泡、下三分之一事件卡、员工条。员工条格子里的首字母换成 32×32 小肖像，事件卡左边是 48×48 大肖像（2×）。
 */

export type FaceFn = (m: Member, expr: Expr, size: 48 | 32, scale: number) => HTMLCanvasElement;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface Hud {
  root: HTMLElement;
  bubbles: { id: string; el: HTMLElement }[];
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

export function createHud(face: FaceFn): Hud {
  const root = h('div', 'td-hud c-hud');
  // 记分牌
  const bug = h('div', 'td-bug');
  bug.append(h('div', 'td-bug-badge', 'D9'), h('div', 'td-bug-clock', '16:40'));
  const money = h('div', 'c-money', '$1,240 · ★ 26');
  root.append(bug, money);

  // 事件卡：谁来找你
  const card = h('section', 'td-card c-card');
  const tags = h('div', 'td-card-tags');
  tags.append(h('span', 'td-tag-topic', '人事'), h('span', 'td-tag-loc', '青训场边'));
  const body = h('div', 'td-card-body');
  const who = h('div', 'c-who');
  const gus = byId('gus');
  const faceBox = h('div', 'c-who-face');
  faceBox.style.background = gus.tint;
  let cur = face(gus, 'sad', 48, 2);
  faceBox.append(cur);
  const plate = h('div', 'c-who-plate', `<b>Gus Moreno</b><span>场地 · 心累了 · 完美主义</span>`);
  who.append(faceBox, plate);
  const head = h('h2', 'td-card-head', 'Gus 想歇一周');
  const text = h('p', 'td-card-text', '“场地我天天刷，脚印天天有。我累了，总监。”');
  const answers = h('div', 'td-answers c-answers');
  const opts: { t: string; hint: string; e: Expr }[] = [
    { t: '放他一周假', hint: '−场地维护 · 士气 +20', e: 'happy' },
    { t: '我陪他刷', hint: '总监半天 · 好感 +', e: 'surprised' },
    { t: '再撑一周', hint: '士气 −15 · 可能辞职', e: 'angry' },
  ];
  opts.forEach((o, i) => {
    const b = h(
      'button',
      'td-answer',
      `<span class="td-key">${i + 1}</span><span class="td-answer-col"><span class="td-answer-text">${o.t}</span><span class="td-answer-hint">${o.hint}</span></span>`,
    );
    const show = () => {
      const n = face(gus, o.e, 48, 2);
      cur.replaceWith(n);
      cur = n;
      for (const x of answers.querySelectorAll('.td-answer')) x.classList.remove('td-chosen');
      b.classList.add('td-chosen');
    };
    b.addEventListener('pointerenter', show);
    b.addEventListener('click', show);
    answers.append(b);
  });
  body.append(who, head, text, answers);
  card.append(tags, body);
  root.append(card);

  // 员工条
  const staff = h('div', 'td-staff');
  const row = h('ul', 'td-staff-row');
  for (const s of STAFF_ROW) {
    const m = byId(s.id);
    const li = h(
      'li',
      `td-tok${s.state === 'idle' ? ' td-tok-idle' : ''}${s.state === 'picked' ? ' td-tok-picked' : ''}`,
    );
    const b = h('button');
    const f = h('span', 'td-tok-face c-tok-face');
    f.style.background = m.tint;
    f.append(face(m, s.state === 'idle' ? 'sad' : 'neutral', 32, 1));
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

  // 场景里的说话气泡（位置由 main 每帧按小人头顶摆）
  const bubbles: Hud['bubbles'] = [];
  const say = (id: string, e: Expr, line: string) => {
    const m = byId(id);
    const el = h('div', 'c-bubble');
    const f = h('span', 'c-bubble-face');
    f.style.background = m.tint;
    f.append(face(m, e, 32, 1));
    el.append(f, h('span', 'c-bubble-text', line));
    root.append(el);
    bubbles.push({ id, el });
  };
  say('lily', 'happy', '今晚 12 个预约，全满！');
  say('dale', 'angry', '膝盖抬高！说几遍了');
  return { root, bubbles };
}
