import { byId, type Member } from './cast';
import { EXPR_ZH, EXPRS, type Expr } from './portrait';

/**
 * 花名册（菜单）：肖像只在这里出现。列表 → 点一个人 → 详情（大肖像随士气换表情、背景、四项能力和潜力、
 * 特质、喜欢/讨厌、五张表情），左右箭头或左右滑切人。样子照游戏 HUD：海军蓝方块面板、纸色字、≥44 px。
 * 数据是 demo 写死的（进游戏后来自模拟状态和 i18n 的 bios / traits）。
 */

export type FaceFn = (m: Member, expr: Expr, size: 48 | 32, scale: number) => HTMLCanvasElement;

export const SKILLS = [
  ['teach', '教学', '#d8c08a'],
  ['upkeep', '维护', '#9be07f'],
  ['service', '服务', '#c9e8ff'],
  ['play', '球技', '#ffb35c'],
] as const;

export interface StaffCard {
  id: string;
  /** 0..100：能力、潜力（潜力 ≥ 能力） */
  sk: [number, number, number, number];
  pot: [number, number, number, number];
  traits: { name: string; note: string; bad?: boolean }[];
  pay: number;
  mood: number;
  /** 士气决定详情页大肖像的表情 */
  moodExpr: Expr;
  moodNote: string;
  bio: string;
  likes: string;
  dislikes: string;
}

export const ROSTER: readonly StaffCard[] = [
  {
    id: 'jess',
    sk: [62, 30, 48, 70],
    pot: [85, 40, 60, 78],
    traits: [
      { name: '干劲足', note: '士气慢慢涨' },
      { name: '大学网球', note: '教学 +5，服务 +5' },
    ],
    pay: 520,
    mood: 84,
    moodExpr: 'happy',
    moodNote: '今天带的小孩进步了',
    bio: '在一所小大学打了四年校队，毕业后在 Palm Desert 教孩子打球，一直想有一块自己的场地。',
    likes: '早场、带小孩、新球',
    dislikes: '场地没人刷',
  },
  {
    id: 'dale',
    sk: [88, 22, 40, 52],
    pot: [90, 25, 45, 52],
    traits: [
      { name: '带徒弟', note: '教学 +6，士气慢慢涨' },
      { name: '老伤', note: '维护 −8，球技 −10', bad: true },
    ],
    pay: 610,
    mood: 58,
    moodExpr: 'neutral',
    moodNote: '腰又疼了，但不说',
    bio: '在这片沙漠里教了三十多年球，学生的孩子现在也来跟他学；腰不好，嘴更硬。',
    likes: '准时的学员、老规矩',
    dislikes: '手机、发球机',
  },
  {
    id: 'gus',
    sk: [10, 92, 20, 30],
    pot: [10, 95, 28, 30],
    traits: [
      { name: '完美主义', note: '维护 +12，服务 −10' },
      { name: '心累了', note: '士气慢慢掉，有点走神', bad: true },
    ],
    pay: 450,
    mood: 24,
    moodExpr: 'sad',
    moodNote: '想歇一周',
    bio: '俱乐部关门前，这里的硬地是他一块块铺的；裁员那天以后，他再没进过网球场。',
    likes: '刚刷平的场地、清早',
    dislikes: '脚印、催他',
  },
  {
    id: 'lily',
    sk: [18, 20, 90, 22],
    pot: [25, 24, 96, 25],
    traits: [
      { name: '双语', note: '服务 +10' },
      { name: '夜猫子', note: '下午 4 点后各项 +12' },
    ],
    pay: 480,
    mood: 76,
    moodExpr: 'happy',
    moodNote: '今晚预约全满',
    bio: '在父母开在 Palm Springs 的餐馆里长大，后来在度假酒店管前台；晚上客人越多，她越来劲。',
    likes: '夜场、熟客、奶茶',
    dislikes: '早班',
  },
  {
    id: 'ben',
    sk: [28, 30, 70, 40],
    pot: [45, 40, 85, 50],
    traits: [
      { name: '早起', note: '上午 11 点前各项 +12' },
      { name: '爱玩手机', note: '总监不在时走神', bad: true },
    ],
    pay: 360,
    mood: 66,
    moodExpr: 'neutral',
    moodNote: '下午有课',
    bio: 'UC Riverside 的学生，在 Palm Desert 的咖啡店打工，记得每个熟客点什么；早上精神最好。',
    likes: '咖啡、早班',
    dislikes: '夜班、考试周',
  },
  {
    id: 'ray',
    sk: [24, 80, 42, 18],
    pot: [24, 82, 45, 18],
    traits: [
      { name: '本地名人', note: '每天带来一点声望' },
      { name: '老伤', note: '维护 −8，球技 −10', bad: true },
    ],
    pay: 540,
    mood: 50,
    moodExpr: 'neutral',
    moodNote: '膝盖今天还行',
    bio: '九十年代这里办大赛时的场地主管，退休后就住在 Indian Wells；俱乐部的每根水管他都记得，膝盖却不行了。',
    likes: '修好的东西、讲老故事',
    dislikes: '爬梯子、新式喷头',
  },
  {
    id: 'rosa',
    sk: [12, 84, 36, 20],
    pot: [20, 92, 40, 24],
    traits: [
      { name: '沙漠长大', note: '大风天和风季维护 +15' },
      { name: '早起', note: '上午 11 点前各项 +12' },
    ],
    pay: 470,
    mood: 70,
    moodExpr: 'neutral',
    moodNote: '说明天起风',
    bio: '在 Coachella 的椰枣园边长大，给 La Quinta 的高尔夫球场修了十二年草坪；风沙要来，她总是先知道。',
    likes: '刮风前的安静、草坪',
    dislikes: '乱扔的球',
  },
  {
    id: 'teo',
    sk: [20, 70, 50, 34],
    pot: [26, 78, 55, 34],
    traits: [
      { name: '穿线师', note: '能坐会所的穿线台' },
      { name: '完美主义', note: '维护 +12，服务 −10' },
    ],
    pay: 560,
    mood: 40,
    moodExpr: 'angry',
    moodNote: '线又不够用了',
    bio: '从 Novi Sad 来，在巡回赛的穿线房里一天穿过四十支拍子；线不直，她不交拍。',
    likes: '天然肠线、安静',
    dislikes: '催单、便宜的线',
  },
  {
    id: 'nadia',
    sk: [50, 10, 58, 94],
    pot: [70, 12, 64, 94],
    traits: [
      { name: '退役名将', note: '每天一点声望，表演赛成功率 +5%' },
      { name: '老伤', note: '维护 −8，球技 −10', bad: true },
    ],
    pay: 1200,
    mood: 62,
    moodExpr: 'neutral',
    moodNote: '肩膀有点紧',
    bio: '前职业球员，肩伤动过手术以后退役；她的名字还能卖出票。',
    likes: '表演赛、认真的学生',
    dislikes: '记者、自拍',
  },
  {
    id: 'mateo',
    sk: [10, 36, 40, 58],
    pot: [30, 50, 55, 90],
    traits: [
      { name: '球童', note: '能在匹克球场的联赛当球童' },
      { name: '天才少年', note: '球技 +8' },
    ],
    pay: 160,
    mood: 92,
    moodExpr: 'surprised',
    moodNote: 'Nadia 跟他说话了！',
    bio: '十六岁，Coachella 人，前两年在大赛上当过球童；一放学就骑车过来。',
    likes: 'Nadia、捡球比赛',
    dislikes: '作业',
  },
];

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

function moodTxt(v: number): string {
  return v >= 75 ? '开心' : v >= 50 ? '还行' : v >= 30 ? '不太好' : '很糟';
}

export interface Roster {
  root: HTMLElement;
  open(id?: string): void;
  close(): void;
}

export function createRoster(face: FaceFn, sprite: (m: Member, scale: number) => HTMLCanvasElement): Roster {
  const root = h('div', 'c-roster');
  root.hidden = true;
  const list = h('div', 'c-r-list');
  const detail = h('div', 'c-r-detail');
  root.append(list, detail);

  /* ---------- 列表 ---------- */
  const total = ROSTER.reduce((a, r) => a + r.pay, 0);
  const head = h('header', 'c-r-head');
  head.append(h('div', 'c-r-title', `<b>花名册</b><span>${ROSTER.length} 人 · 周薪 $${total.toLocaleString()}</span>`));
  const x = h('button', 'c-r-x', '×');
  x.setAttribute('aria-label', '关闭');
  x.addEventListener('click', () => api.close());
  head.append(x);
  list.append(head);
  const ul = h('ul', 'c-r-rows');
  for (const r of ROSTER) {
    const m = byId(r.id);
    const li = h('li');
    const b = h('button', `c-r-row${r.mood < 30 ? ' c-r-low' : ''}`);
    const f = h('span', 'c-r-face');
    f.style.background = m.tint;
    f.append(face(m, r.moodExpr, 48, 1));
    const mid = h('span', 'c-r-mid');
    mid.append(h('span', 'c-r-name', `<b>${m.name}</b><i>${m.role}</i>`));
    // 最强的两项能力
    const top2 = [0, 1, 2, 3].sort((a, c) => (r.sk[c] as number) - (r.sk[a] as number)).slice(0, 2);
    const sk = h('span', 'c-r-sk');
    for (const i of top2) {
      const [, name, col] = SKILLS[i] as (typeof SKILLS)[number];
      sk.append(
        h(
          'span',
          'c-r-skl',
          `<em>${name}</em><span class="c-bar"><i style="width:${r.sk[i]}%;background:${col}"></i></span>`,
        ),
      );
    }
    mid.append(sk);
    const tr = h('span', 'td-chips c-r-tr');
    for (const t of r.traits) tr.append(h('span', `td-chip${t.bad ? ' td-chip-cost' : ' td-chip-gain'}`, t.name));
    mid.append(tr);
    const right = h(
      'span',
      'c-r-right',
      `<b>$${r.pay}</b><i>/周</i><span class="c-mood c-mood-${r.mood >= 50 ? 'ok' : 'bad'}">${moodTxt(r.mood)} ${r.mood}</span>`,
    );
    b.append(f, mid, right);
    b.addEventListener('click', () => show(ROSTER.indexOf(r)));
    li.append(b);
    ul.append(li);
  }
  list.append(ul);

  /* ---------- 详情 ---------- */
  let cur = 0;
  function show(i: number): void {
    cur = (i + ROSTER.length) % ROSTER.length;
    const r = ROSTER[cur] as StaffCard;
    const m = byId(r.id);
    detail.innerHTML = '';
    list.hidden = true;
    detail.hidden = false;
    const nav = h('header', 'c-r-head');
    const back = h('button', 'c-r-btn', '‹ 名单');
    back.addEventListener('click', () => {
      detail.hidden = true;
      list.hidden = false;
    });
    const prev = h('button', 'c-r-btn c-r-arrow', '◀');
    const next = h('button', 'c-r-btn c-r-arrow', '▶');
    prev.setAttribute('aria-label', '上一个');
    next.setAttribute('aria-label', '下一个');
    prev.addEventListener('click', () => show(cur - 1));
    next.addEventListener('click', () => show(cur + 1));
    nav.append(back, h('span', 'c-r-pos', `${cur + 1} / ${ROSTER.length}`), prev, next);
    detail.append(nav);

    const top = h('div', 'c-r-top');
    const big = h('div', 'c-r-big');
    big.style.background = m.tint;
    let bigFace = face(m, r.moodExpr, 48, 2);
    big.append(bigFace);
    const info = h('div', 'c-r-info');
    info.append(
      h('div', 'c-r-name c-r-name-big', `<b>${m.name}</b><i>${m.role}</i>`),
      h('div', `c-mood c-mood-${r.mood >= 50 ? 'ok' : 'bad'}`, `士气 ${r.mood} · ${moodTxt(r.mood)}`),
      h('div', 'c-r-note', `“${r.moodNote}”`),
      h('div', 'c-r-pay', `<b>$${r.pay}</b> / 周`),
    );
    const spr = h('div', 'c-r-spr');
    spr.append(sprite(m, 3));
    info.append(spr);
    top.append(big, info);
    detail.append(top, h('p', 'c-r-bio', r.bio));

    const sk = h('div', 'c-r-skills');
    SKILLS.forEach(([, name, col], i) => {
      sk.append(
        h(
          'div',
          'c-r-skrow',
          `<em>${name}</em><span class="c-bar c-bar-big"><b style="width:${r.pot[i]}%"></b><i style="width:${r.sk[i]}%;background:${col}"></i></span><span class="c-r-num">${r.sk[i]}<small>/${r.pot[i]}</small></span>`,
        ),
      );
    });
    detail.append(h('div', 'c-r-lab', '能力 / 潜力'), sk);
    const tr = h('div', 'c-r-traits');
    for (const t of r.traits)
      tr.append(h('div', `c-r-trait${t.bad ? ' c-r-bad' : ''}`, `<b>${t.name}</b><span>${t.note}</span>`));
    detail.append(h('div', 'c-r-lab', '特质'), tr);
    detail.append(
      h(
        'div',
        'c-r-likes',
        `<div><span class="c-r-lab">喜欢</span>${r.likes}</div><div><span class="c-r-lab">讨厌</span>${r.dislikes}</div>`,
      ),
    );
    // 五张表情：点一下大肖像换成那张
    const strip = h('div', 'c-r-strip');
    for (const e of EXPRS) {
      const b = h('button', `c-r-ex${e === r.moodExpr ? ' c-r-ex-on' : ''}`);
      const f = h('span', 'c-r-exf');
      f.style.background = m.tint;
      f.append(face(m, e, 48, 1));
      b.append(f, h('span', '', EXPR_ZH[e]));
      b.addEventListener('click', () => {
        const n = face(m, e, 48, 2);
        bigFace.replaceWith(n);
        bigFace = n;
        for (const o of strip.querySelectorAll('.c-r-ex')) o.classList.remove('c-r-ex-on');
        b.classList.add('c-r-ex-on');
      });
      strip.append(b);
    }
    detail.append(h('div', 'c-r-lab', '表情'), strip);
    detail.scrollTop = 0;
  }
  // 左右滑切人
  let sx = 0;
  let sy = 0;
  detail.addEventListener('pointerdown', (e) => {
    sx = e.clientX;
    sy = e.clientY;
  });
  detail.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - sy) * 1.5) show(cur + (dx < 0 ? 1 : -1));
  });

  const api: Roster = {
    root,
    open(id) {
      root.hidden = false;
      if (id) show(ROSTER.findIndex((r) => r.id === id));
      else {
        detail.hidden = true;
        list.hidden = false;
      }
    },
    close() {
      root.hidden = true;
    },
  };
  return api;
}
