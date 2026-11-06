import {
  activities,
  createDaylight,
  createIsoWorld,
  createRain,
  createStarSign,
  INDIAN_WELLS,
  INDIAN_WELLS_WORLD,
  type IsoCameraPose,
  indianWells,
  type PeopleWorld,
  Person,
  setPeopleView,
} from '@td/iso';
import { clamp, mulberry32 } from '@td/shared';

/**
 * 场景查看器（sandbox）：Palm Oasis（Indian Wells）的等距像素场景。
 * 设施状态（全部荒废 / 全部复原 / 一个个换档）、昼夜和时间、雨、风、磨损、Q/E 旋转、缩放、锚点牌、路人。
 * 全部状态都能写进 URL，截图可以脚本化，例如：
 *   ?lv=fresh&t=1260&rain=1&wind=80&rot=1&zoom=5.2&labels=1&walkers=8&wear=60&ui=0
 *   ?fac=stadium_1:cleared,plaza:open   （逐个设施指定）
 *   ?var=outer_23:hard,stadium_3:pickle4&up=outer_23:pro_hard   （修复变体、升级，wave1-contract.md）
 *   ?pv=stadium_3:tennis2   （修复预览幽灵）  ?plaque=5   （牌匾刻 5 行示例）  ?stars=3&starup=1   （星级牌，升星动画）
 *   ?ev=outer_23:invitational,stadium_1:exhibition   （赛事日布置，wave2-5-contract.md）
 *   ?prep=prep_stands,prep_lights:0   （表演赛筹备：写了就是做完，:0 是挂出来还没做）
 *   ?land=golf_west:south_courts:open,se_corner:event_plaza:building:0.5   （新地：地块:变体:状态[:进度]）
 *   ?lpv=se_corner:academy_isle   （选路卡上的新地预览）  ?week=8   （第几周：高尔夫西段荒到几成）
 *   ?mess=outer_1:sand=0.7,water=0.3,outer_23:cracks=0.6   （场地脏乱，court-care-contract.md：设施:项=量，0..1）
 *   ?heat=1   （酷热：天色发白、球场上的热浪）  ?gates=1   （每处球场门外站三个等着的会员）
 *   ?lineup=38,-31,2.4   （在那一点按半径围一圈 8 个人，各朝一个方向，看转动时人物的朝向）
 *   ?deg=30   （无极旋转，ADR 0023：转角用度数，优先于 rot）  ?snap=45   （松手吸附到 45°，0 = 不吸附）
 * 只读画面，不碰模拟。
 */

const site = INDIAN_WELLS;
const { FACILITIES, FACILITY_STATES, INITIAL_STATES, RESTORED_STATES } = indianWells;
type Facility = (typeof FACILITIES)[number];

/** 每个设施能取的状态（顺序就是"点一下换下一档"的顺序；来自 state.ts） */
const STATES = FACILITY_STATES;
/** 开发工具的中文名（设施名同 i18n facilities.*） */
const FAC_NAMES: Record<Facility, string> = {
  stadium_1: '中心球场',
  practice: '青训场',
  outer_1: '会员场',
  outer_23: '红土场',
  clubhouse: '会所',
  plaza: '棕榈喷泉',
  stadium_3: '匹克球场',
  stadium_2: '泳池',
};
const STATE_NAMES: Record<string, string> = {
  ruined: '荒废',
  cleared: '清理干净',
  restored: '重建完成',
  worn: '停用（掉档）',
  open: '开放',
  sanded: '被沙埋了',
  swept: '扫出来了',
  playable: '能打了',
  resurfaced: '新铺的',
  dry: '干了',
  buried: '被沙埋了',
  dug: '挖出来了',
};
const ANCHOR_NAMES: Record<string, string> = {
  entrance: '大门',
  parking: '停车场',
  plaza: '喷泉广场',
  clubhouse: '会所',
  stadium_1: '中心球场',
  stadium_2: '泳池',
  stadium_3: '匹克球场',
  practice: '青训场',
  outer_1: '会员场',
  outer_23: '红土场',
};

const $ = <E extends HTMLElement = HTMLElement>(id: string): E => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as E;
};

/* ---------------- 状态（URL 参数） ---------------- */
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => {
  const v = q.get(k);
  return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d;
};
const portrait = window.innerWidth < 700;
const startPose: IsoCameraPose = portrait ? site.camera.portrait : site.camera.overview;
const ST = {
  states: { ...INITIAL_STATES } as Record<Facility, string>,
  /** 一天中的分钟 */
  minute: q.get('night') === '1' ? 21 * 60 : 12 * 60,
  rain: q.get('rain') === '1',
  /** 风 0..1 */
  wind: clamp(num('wind', 30) / 100, 0, 1),
  /** 磨损 0..1.5（全部设施） */
  wear: clamp(num('wear', 0) / 100, 0, 1.5),
  labels: q.get('labels') === '1',
};
if (q.get('lv') === 'fresh' || q.get('lv') === 'restored') Object.assign(ST.states, RESTORED_STATES);
for (const pair of (q.get('fac') ?? '').split(',')) {
  const [f, s] = pair.split(':');
  if (f && s && (FACILITIES as readonly string[]).includes(f) && STATES[f as Facility].includes(s))
    ST.states[f as Facility] = s;
}
/** 变体、升级、预览、牌匾、星级（只是画面；URL 里没写就不碰，默认画面和以前一样） */
const W1 = {
  variants: {} as Record<string, string>,
  upgrades: {} as Record<string, string[]>,
  preview: null as [string, string] | null,
  plaque: clamp(Math.round(num('plaque', 0)), 0, 12),
  stars: q.has('stars') ? clamp(Math.round(num('stars', 0)), 0, 5) : -1,
};
for (const pair of (q.get('var') ?? '').split(',')) {
  const [f, v] = pair.split(':');
  if (f && v) W1.variants[f] = v;
}
for (const pair of (q.get('up') ?? '').split(',')) {
  const [f, u] = pair.split(':');
  if (f && u) (W1.upgrades[f] ??= []).push(u);
}
{
  const [f, v] = (q.get('pv') ?? '').split(':');
  if (f && v) W1.preview = [f, v];
}
/** 牌匾的示例行（名字是 3×5 小字能排的大写字母） */
const PLAQUE_DEMO = [
  { facility: 'outer_1', leader: 'MARIA', day: 3 },
  { facility: 'stadium_3', leader: 'KENJI', day: 9 },
  { facility: 'clubhouse', leader: 'ROSA', day: 15 },
  { facility: 'outer_23', leader: 'DEV', day: 22 },
  { facility: 'plaza', leader: 'TOMMY', day: 31 },
  { facility: 'practice', leader: 'ANA', day: 40 },
  { facility: 'stadium_2', leader: 'LUCAS', day: 52 },
  { facility: 'stadium_1', leader: 'MARIA', day: 66 },
];
/** 赛事日布置和表演赛筹备（W2；URL 里没写就不碰） */
const W2 = {
  events: new Map<string, string>(),
  prep: new Map<string, boolean>(),
};
for (const pair of (q.get('ev') ?? '').split(',')) {
  const [a, k] = pair.split(':');
  if (a && k) W2.events.set(a, k);
}
for (const pair of (q.get('prep') ?? '').split(',')) {
  const [ph, d] = pair.split(':');
  if (ph) W2.prep.set(ph, d !== '0');
}
/** 新地（W5；URL 里没写就不碰，开局只有伏笔） */
const W5 = {
  land: [] as [string, string, 'locked' | 'building' | 'open', number][],
  preview: null as [string, string] | null,
  week: q.has('week') ? Math.max(0, Math.round(num('week', 0))) : -1,
};
for (const pair of (q.get('land') ?? '').split(',')) {
  const [plot, v, st, p] = pair.split(':');
  if (plot && v && (st === 'locked' || st === 'building' || st === 'open'))
    W5.land.push([plot, v, st, Number(p ?? 0) || 0]);
}
{
  const [plot, v] = (q.get('lpv') ?? '').split(':');
  if (plot && v) W5.preview = [plot, v];
}
/** 场地脏乱（court-care-contract.md；URL 里没写就不碰）：设施 → 五项 0..1 */
const MESS_KEYS = ['sand', 'water', 'litter', 'lines', 'cracks'] as const;
type MessKey = (typeof MESS_KEYS)[number];
type MessAmt = Record<MessKey, number>;
const MESS_COURTS = ['outer_1', 'outer_23', 'practice', 'stadium_1', 'stadium_3'] as const;
const MESS_NAMES: Record<MessKey, string> = {
  sand: '积沙',
  water: '积水',
  litter: '垃圾',
  lines: '线褪',
  cracks: '裂缝',
};
const CARE = {
  mess: {} as Record<string, MessAmt>,
  heat: q.get('heat') === '1',
  /** 面板上正在调的那块场 */
  court: 'outer_1' as string,
};
const zeroMess = (): MessAmt => ({ sand: 0, water: 0, litter: 0, lines: 0, cracks: 0 });
{
  // 设施:项=量,项=量,设施:项=量…（项可以接着写，碰到"设施:"换下一处）
  let cur: MessAmt | null = null;
  for (const tok of (q.get('mess') ?? '').split(',')) {
    let t = tok;
    const ci = t.indexOf(':');
    if (ci >= 0) {
      const f = t.slice(0, ci);
      cur = (MESS_COURTS as readonly string[]).includes(f) ? (CARE.mess[f] ??= zeroMess()) : null;
      if (cur) CARE.court = f;
      t = t.slice(ci + 1);
    }
    const [k, v] = t.split('=');
    if (cur && k && (MESS_KEYS as readonly string[]).includes(k) && Number.isFinite(Number(v)))
      cur[k as MessKey] = clamp(Number(v), 0, 1);
  }
}
/** "赛事"按钮一下换一个示例（地点 → 赛事） */
const EVENT_DEMOS: readonly (readonly [string, string][])[] = [
  [],
  [['outer_1', 'cup_monthly']],
  [['outer_23', 'cup_monthly']],
  [['outer_23', 'invitational']],
  [['entrance', 'regional_open']],
  [['entrance', 'junior_regional']],
  [['stadium_1', 'exhibition']],
];
const EVENT_NAMES: Record<string, string> = {
  cup_monthly: '月度杯',
  invitational: '邀请赛',
  regional_open: '地区赛（外出）',
  junior_regional: '青少年赛（外出）',
  exhibition: '表演赛',
};
/** "筹备"按钮：没挂 → 四期都挂出 → 一期期做完 */
const PREP_PHASES = ['prep_stands', 'prep_lights', 'prep_service', 'prep_media'] as const;
if (q.has('t')) ST.minute = clamp(num('t', ST.minute), 0, 1439);
if (q.get('ui') === '0') document.body.classList.add('noui');

/* ---------------- 世界 ---------------- */
const world = createIsoWorld($('world'), {
  ...INDIAN_WELLS_WORLD,
  pose: {
    tx: num('tx', startPose.tx),
    tz: num('tz', startPose.tz),
    zoom: num('zoom', startPose.zoom),
    rot: q.has('deg') ? num('deg', 0) / 90 : num('rot', 0),
  },
});
world.camera.rotSnap = num('snap', 0) / 90;
// 截图、测帧时间的脚本用（只在 sandbox）
(window as unknown as { __world: typeof world }).__world = world;
const L = site.camera.limits;
world.camera.limits = { zoom: [L.zoom[0], L.zoom[1]], tx: [L.tx[0], L.tx[1]], tz: [L.tz[0], L.tz[1]] };
world.camera.home = { ...startPose };
site.build(world);
const overlays = site.createOverlays(world);
const sky = site.createSky(world);
const daylight = createDaylight(world);
const rain = createRain(world);
const people: PeopleWorld = { scene: world.scene, groundY: site.groundY, people: [] };

const starSign = W1.stars >= 0 ? createStarSign(world) : null;
function applyW1(): void {
  for (const f of FACILITIES) {
    overlays.variant?.(f, W1.variants[f] ?? null);
    for (const u of indianWells.UPGRADES[f] ?? []) overlays.upgrade?.(f, u.id, W1.upgrades[f]?.includes(u.id) ?? false);
  }
  for (const [a, k] of [...W2.events]) overlays.event?.(a, k);
  for (const [ph, d] of W2.prep) overlays.prep?.(ph, d);
  if (W5.week >= 0) overlays.week?.(W5.week);
  for (const [plot, v, st, p] of W5.land) overlays.land?.(plot, st, v, p);
  if (W5.preview) overlays.landPreview?.(W5.preview[0], W5.preview[1]);
  if (W1.plaque) overlays.plaque?.(Array.from({ length: W1.plaque }, (_, i) => PLAQUE_DEMO[i % PLAQUE_DEMO.length]!));
}
function applyStates(): void {
  applyW1();
  for (const f of FACILITIES) overlays.set(f, ST.states[f]);
  overlays.flush?.();
  applyWear();
  applyMess();
  paintFacs();
  syncUrl();
}
function applyWear(): void {
  for (const f of FACILITIES) overlays.wear?.(f, ST.wear);
}
function applyMess(): void {
  for (const f of MESS_COURTS) overlays.mess?.(f, CARE.mess[f] ?? null);
}

/* ---------------- 路人：沿步道在随机地点之间走 ---------------- */
const rand = mulberry32(num('seed', 7));
const stands = Object.keys(site.stands);
const pickStand = () => stands[Math.floor(rand() * stands.length)] as string;
const walkers: { p: Person; at: string }[] = [];
function sendOn(w: { p: Person; at: string }): void {
  for (let i = 0; i < 6; i++) {
    const to = pickStand();
    if (to === w.at) continue;
    const line = site.routeLine(w.at, to);
    if (!line || line.length < 2) continue;
    w.p.wait(0.5 + rand() * 2).path(line, 1.3 + rand() * 0.5);
    w.at = to;
    return;
  }
}
function spawnWalkers(n: number): void {
  for (let i = 0; i < n; i++) {
    const at = pickStand();
    const s = site.stands[at] as { x: number; z: number };
    const look = activities.look(rand, site.venue, false);
    const p = new Person({ ...look, name: `walker${walkers.length}`, x: s.x, z: s.z }, people);
    const w = { p, at };
    walkers.push(w);
    // 一开始散在路上：先走一段
    sendOn(w);
  }
  syncUrl();
}
function clearWalkers(): void {
  for (const { p } of walkers) {
    p.removed = true;
    p.clearMoves();
    p.root.parent?.remove(p.root);
    const i = people.people.indexOf(p);
    if (i >= 0) people.people.splice(i, 1);
  }
  walkers.length = 0;
  syncUrl();
}

/* ---------------- 锚点牌（DOM，跟着镜头投影） ---------------- */
const labelsEl = $('labels');
const labelEls = Object.entries(site.anchors).map(([id, p]) => {
  const d = document.createElement('div');
  d.className = 'lbl';
  d.textContent = ANCHOR_NAMES[id] ?? id;
  const s = document.createElement('small');
  s.textContent = id;
  d.append(s);
  labelsEl.append(d);
  return { d, p };
});
function placeLabels(): void {
  labelsEl.hidden = !ST.labels;
  if (!ST.labels) return;
  for (const { d, p } of labelEls) {
    const s = world.camera.project(p.x, site.groundY(p.x, p.z) + 1.5, p.z);
    d.style.left = `${Math.round(s.x)}px`;
    d.style.top = `${Math.round(s.y)}px`;
  }
}

/* ---------------- 控件 ---------------- */
const facsEl = $('facs');
const facBtns = new Map<Facility, HTMLButtonElement>();
for (const f of FACILITIES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.addEventListener('click', () => {
    const list = STATES[f];
    ST.states[f] = list[(list.indexOf(ST.states[f]) + 1) % list.length] as string;
    applyStates();
  });
  facsEl.append(b);
  facBtns.set(f, b);
}
function paintFacs(): void {
  for (const [f, b] of facBtns) {
    b.textContent = '';
    const n = document.createElement('b');
    n.textContent = FAC_NAMES[f];
    const s = document.createElement('span');
    s.textContent = `${STATE_NAMES[ST.states[f]] ?? ST.states[f]} · ${ST.states[f]}`;
    b.append(n, s);
  }
}
$('bRuin').addEventListener('click', () => {
  Object.assign(ST.states, INITIAL_STATES);
  applyStates();
});
$('bFresh').addEventListener('click', () => {
  Object.assign(ST.states, RESTORED_STATES);
  applyStates();
});
/* 赛事、筹备：两个按钮塞进"更多"面板 */
{
  const row = document.createElement('div');
  row.className = 'row';
  const bEv = document.createElement('button');
  bEv.type = 'button';
  const bPrep = document.createElement('button');
  bPrep.type = 'button';
  row.append(bEv, bPrep);
  $('bWalk').parentElement?.before(row);
  const evIdx = () =>
    EVENT_DEMOS.findIndex((d) => d.length === W2.events.size && d.every(([a, k]) => W2.events.get(a) === k));
  const prepIdx = () => {
    if (!W2.prep.size) return 0;
    const done = PREP_PHASES.filter((p) => W2.prep.get(p)).length;
    return PREP_PHASES.every((p) => W2.prep.has(p)) ? 1 + done : 0;
  };
  const paint = () => {
    const ev = [...W2.events.values()].map((k) => EVENT_NAMES[k] ?? k).join('+');
    bEv.textContent = `赛事：${ev || '无'}`;
    const done = PREP_PHASES.filter((p) => W2.prep.get(p)).length;
    bPrep.textContent = W2.prep.size ? `筹备：${done}/4 做完` : '筹备：没挂出';
  };
  bEv.addEventListener('click', () => {
    for (const a of W2.events.keys()) overlays.event?.(a, null);
    W2.events.clear();
    for (const [a, k] of EVENT_DEMOS[(evIdx() + 1) % EVENT_DEMOS.length] ?? []) {
      W2.events.set(a, k);
      overlays.event?.(a, k);
    }
    overlays.flush?.();
    paint();
    syncUrl();
  });
  bPrep.addEventListener('click', () => {
    // 0 没挂出、1 四期都挂出、2..5 做完 1..4 期；没有"撤掉筹备"的接口，转一圈回到"四期都挂出"
    const next = prepIdx() + 1 > 5 ? 1 : prepIdx() + 1;
    const done = next - 1;
    PREP_PHASES.forEach((p, i) => {
      W2.prep.set(p, i < done);
      overlays.prep?.(p, i < done);
    });
    overlays.flush?.();
    paint();
    syncUrl();
  });
  paint();
}
const timeEl = $<HTMLInputElement>('time');
const timeV = $('timeV');
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const isNight = () => ST.minute < 6 * 60 || ST.minute >= 19 * 60;
const bNight = $('bNight');
function paintTime(): void {
  timeEl.value = String(ST.minute);
  timeV.textContent = hhmm(ST.minute);
  bNight.textContent = isNight() ? '昼' : '夜';
  bNight.setAttribute('aria-pressed', String(isNight()));
  syncUrl();
}
timeEl.addEventListener('input', () => {
  ST.minute = Number(timeEl.value);
  paintTime();
});
bNight.addEventListener('click', () => {
  ST.minute = isNight() ? 12 * 60 : 21 * 60;
  paintTime();
});
const bRain = $('bRain');
function paintRain(): void {
  bRain.setAttribute('aria-pressed', String(ST.rain));
  if (ST.rain) rain.start();
  else rain.stop();
  syncUrl();
}
bRain.addEventListener('click', () => {
  ST.rain = !ST.rain;
  paintRain();
});
const windEl = $<HTMLInputElement>('wind');
const windV = $('windV');
windEl.value = String(Math.round(ST.wind * 100));
windV.textContent = `${windEl.value}%`;
windEl.addEventListener('input', () => {
  ST.wind = Number(windEl.value) / 100;
  windV.textContent = `${windEl.value}%`;
  syncUrl();
});
const wearEl = $<HTMLInputElement>('wear');
const wearV = $('wearV');
wearEl.value = String(Math.round(ST.wear * 100));
wearV.textContent = `${wearEl.value}%`;
wearEl.addEventListener('input', () => {
  ST.wear = Number(wearEl.value) / 100;
  wearV.textContent = `${wearEl.value}%`;
  applyWear();
  syncUrl();
});
/* 场地脏乱：选一块场，五个滑杆；全脏 / 清空；酷热开关 */
{
  const ctl = $('messCtl');
  const bCourt = $('bMessCourt');
  const bHeat = $('bHeat');
  const sliders = MESS_KEYS.map((k) => {
    const lab = document.createElement('label');
    lab.className = 'ctl';
    const n = document.createElement('span');
    n.className = 'k';
    n.textContent = MESS_NAMES[k];
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = '0';
    inp.max = '100';
    inp.step = '5';
    const out = document.createElement('output');
    lab.append(n, inp, out);
    ctl.append(lab);
    inp.addEventListener('input', () => {
      const m = (CARE.mess[CARE.court] ??= zeroMess());
      m[k] = Number(inp.value) / 100;
      out.textContent = `${inp.value}%`;
      applyMess();
      syncUrl();
    });
    return { k, inp, out };
  });
  const paint = () => {
    bCourt.textContent = FAC_NAMES[CARE.court as Facility];
    const m = CARE.mess[CARE.court] ?? zeroMess();
    for (const s of sliders) {
      s.inp.value = String(Math.round(m[s.k] * 100));
      s.out.textContent = `${s.inp.value}%`;
    }
    bHeat.setAttribute('aria-pressed', String(CARE.heat));
  };
  bCourt.addEventListener('click', () => {
    CARE.court =
      MESS_COURTS[(MESS_COURTS.indexOf(CARE.court as (typeof MESS_COURTS)[number]) + 1) % MESS_COURTS.length];
    paint();
  });
  $('bMessAll').addEventListener('click', () => {
    CARE.mess[CARE.court] = { sand: 0.8, water: 0.8, litter: 0.8, lines: 0.8, cracks: 0.8 };
    applyMess();
    paint();
    syncUrl();
  });
  $('bMessClear').addEventListener('click', () => {
    delete CARE.mess[CARE.court];
    applyMess();
    paint();
    syncUrl();
  });
  bHeat.addEventListener('click', () => {
    CARE.heat = !CARE.heat;
    paint();
    syncUrl();
  });
  paint();
}
const bLabels = $('bLabels');
const paintLabels = () => bLabels.setAttribute('aria-pressed', String(ST.labels));
bLabels.addEventListener('click', () => {
  ST.labels = !ST.labels;
  paintLabels();
  syncUrl();
});
const moreEl = $('more');
const bMore = $('bMore');
bMore.addEventListener('click', () => {
  moreEl.hidden = !moreEl.hidden;
  bMore.setAttribute('aria-expanded', String(!moreEl.hidden));
});
$('bQ').addEventListener('click', () => world.camera.rotate(1));
$('bE').addEventListener('click', () => world.camera.rotate(-1));
$('bIn').addEventListener('click', () => world.camera.zoomIn());
$('bOut').addEventListener('click', () => world.camera.zoomOut());
$('bHome').addEventListener('click', () => world.camera.reset());
$('bWalk').addEventListener('click', () => spawnWalkers(4));
$('bClear').addEventListener('click', clearWalkers);
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement | null)?.closest?.('input')) return;
  if (e.key === 'q' || e.key === 'Q') world.camera.rotate(1);
  else if (e.key === 'e' || e.key === 'E') world.camera.rotate(-1);
  else if (e.key === '+' || e.key === '=') world.camera.zoomIn();
  else if (e.key === '-') world.camera.zoomOut();
});

/* ---------------- URL：当前状态写回地址栏（截图脚本照抄） ---------------- */
const urlEl = $('url');
let urlTimer = 0;
function syncUrl(): void {
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => {
    const p = new URLSearchParams();
    const fac = FACILITIES.filter((f) => ST.states[f] !== INITIAL_STATES[f]).map((f) => `${f}:${ST.states[f]}`);
    if (fac.length) p.set('fac', fac.join(','));
    p.set('t', String(ST.minute));
    if (ST.rain) p.set('rain', '1');
    p.set('wind', String(Math.round(ST.wind * 100)));
    if (ST.wear) p.set('wear', String(Math.round(ST.wear * 100)));
    const t = world.camera.target;
    p.set('deg', String(Math.round(t.rot * 90 * 10) / 10));
    if (world.camera.rotSnap) p.set('snap', String(Math.round(world.camera.rotSnap * 90)));
    p.set('zoom', String(t.zoom));
    p.set('tx', t.tx.toFixed(1));
    p.set('tz', t.tz.toFixed(1));
    if (ST.labels) p.set('labels', '1');
    if (walkers.length) p.set('walkers', String(walkers.length));
    const vs = Object.entries(W1.variants).map(([f, v]) => `${f}:${v}`);
    if (vs.length) p.set('var', vs.join(','));
    const us = Object.entries(W1.upgrades).flatMap(([f, l]) => l.map((u) => `${f}:${u}`));
    if (us.length) p.set('up', us.join(','));
    if (W1.preview) p.set('pv', W1.preview.join(':'));
    if (W1.plaque) p.set('plaque', String(W1.plaque));
    if (W1.stars >= 0) p.set('stars', String(W1.stars));
    if (W2.events.size) p.set('ev', [...W2.events].map(([a, k]) => `${a}:${k}`).join(','));
    if (W2.prep.size) p.set('prep', [...W2.prep].map(([ph, d]) => (d ? ph : `${ph}:0`)).join(','));
    if (W5.land.length)
      p.set('land', W5.land.map(([pl, v, st, pr]) => `${pl}:${v}:${st}${st === 'building' ? `:${pr}` : ''}`).join(','));
    if (W5.preview) p.set('lpv', W5.preview.join(':'));
    if (W5.week >= 0) p.set('week', String(W5.week));
    const ms = Object.entries(CARE.mess)
      .map(([f, m]) => {
        const kv = MESS_KEYS.filter((k) => m[k] > 0).map((k) => `${k}=${+m[k].toFixed(2)}`);
        return kv.length ? `${f}:${kv.join(',')}` : '';
      })
      .filter(Boolean);
    if (ms.length) p.set('mess', ms.join(','));
    if (CARE.heat) p.set('heat', '1');
    const s = `?${p.toString().replace(/%3A/g, ':').replace(/%2C/g, ',')}`;
    history.replaceState(null, '', s);
    urlEl.textContent = s;
  }, 200);
}
// 镜头动了也写回（拖动、缩放、转）
world.view.canvas.addEventListener('pointerup', syncUrl);
world.view.canvas.addEventListener('wheel', syncUrl);
for (const id of ['bQ', 'bE', 'bIn', 'bOut', 'bHome']) $(id).addEventListener('click', syncUrl);

/* ---------------- 起步 ---------------- */
applyStates();
if (W1.preview) {
  overlays.preview?.(W1.preview[0], W1.preview[1]);
  overlays.flush?.();
}
if (starSign) {
  // starup=1：先立着少一颗星，过一秒升星（截图看升星的那一下）
  if (q.get('starup') === '1' && W1.stars > 0) {
    starSign.set(W1.stars - 1, false);
    setTimeout(() => starSign.set(W1.stars, true), 1000);
  } else starSign.set(W1.stars, false);
}
paintTime();
paintRain();
paintLabels();
spawnWalkers(Math.round(clamp(num('walkers', 0), 0, 60)));
// ?gates=1：每处球场门外站三个等着的会员（court-care-contract.md 的 Site.gates；看站位有没有被围网挡住）
if (q.get('gates') === '1')
  for (const g of Object.values(site.gates ?? {}))
    for (let i = 0; i < 3; i++) {
      const look = activities.look(rand, site.venue, false);
      new Person({ ...look, name: `gate${i}`, x: g.x + (i - 1) * 0.9, z: g.z + (i % 2) * 0.5 }, people);
    }
// ?lineup=x,z：在 (x, z) 围一圈 8 个人，各朝一个方向（45° 一个），看无极旋转时人物的朝向（ADR 0023）
if (q.has('lineup')) {
  const [lx, lz, lr = 2.4] = (q.get('lineup') ?? '').split(',').map(Number) as [number, number, number?];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const look = activities.look(rand, site.venue, false);
    new Person(
      {
        ...look,
        ...(i % 2 === 0 ? { racket: '#d6362f' } : {}),
        name: `lineup${i}`,
        x: lx + Math.sin(a) * lr,
        z: lz + Math.cos(a) * lr,
        lock: a,
      },
      people,
    );
  }
}
// 截图：雨一开始就是满的（不等淡入）
if (ST.rain) rain.update(30, world.camera.target.tx, world.camera.target.tz);
// 截图：热浪一开始就是满的（不等淡入）
if (CARE.heat) for (let i = 0; i < 80; i++) sky.update(0.1, 0, 0, ST.wind, 1);

let last = performance.now();
let now = 0;
function frame(ts: number): void {
  requestAnimationFrame(frame);
  const dt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts;
  now += dt;
  // 先定镜头，再按镜头的转角和缩放更新人物
  world.camera.update(dt, null);
  const pr = world.view.proj;
  setPeopleView(pr.ang, pr.k, pr.spriteScale);
  for (const w of walkers) if (!w.p.busy()) sendOn(w);
  for (const p of [...people.people]) p.update(dt, now);
  const r = rain.amount();
  const heat = CARE.heat ? 1 : 0;
  sky.update(dt, now, r, ST.wind, heat);
  rain.update(dt, world.camera.target.tx, world.camera.target.tz);
  daylight.update(ST.minute, r, heat);
  world.render(dt, now);
  placeLabels();
}
requestAnimationFrame(frame);
// 调试：控制台里摸世界
(window as unknown as { __viewer: unknown }).__viewer = {
  world,
  overlays,
  ST,
  W1,
  W2,
  W5,
  CARE,
  walkers,
  starSign,
  applyStates,
};
