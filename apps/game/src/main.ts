import { createIsoWorld, type IsoCameraPose, indianWells, type Site, setPeopleView } from '@td/iso';
import { clamp } from '@td/shared';
import { CONTENT, type ContentBundle, canAssign, DIRECTOR, type SimEvent, worldOf } from '@td/sim';
import { type HudActions, mountHud, setHudStrings } from '@td/ui';
import { variantSite } from './courts';
import { createDebug } from './debug';
import { GameLabels } from './labels';
import { clearAutosave, downloadSave, readAutosave, writeAutosave } from './persist';
import { Projector } from './project';
import { createGameScene } from './scene';
import { Session } from './session';
import { createText, type Lang } from './text';

/**
 * 正式游戏入口：模拟（@td/sim）+ 画面（@td/iso，2.5D 等距像素，ADR 0019）+ 界面（@td/ui）。
 *
 *   真实时间 → Session.frame() → advance() → 领域事件
 *                                       ├→ Projector（HUD 快照、快讯）
 *                                       └→ GameScene（员工走位、演出、设施）
 *   玩家拖人 / 点标记 → HudActions / 岗位标记 → Session.assign → assign 命令（ADR 0012）
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};
const params = new URLSearchParams(location.search);
/** 默认中文；?lang=en 换成英文 */
const lang: Lang = params.get('lang') === 'en' ? 'en' : 'zh';
document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

let content: ContentBundle = CONTENT;
let text = createText(content, lang);
const applyHudStrings = () => setHudStrings((k) => text.tr(`ui.hud.${k}`, '') || undefined);
applyHudStrings();

/* ---------- 舞台：整局只有一张地图（Indian Wells，2026-11-01） ---------- */
const site: Site = indianWells.INDIAN_WELLS;
const container = $('stage');
const HOME: IsoCameraPose =
  container.clientWidth / Math.max(1, container.clientHeight) < 0.8 ? site.camera.portrait : site.camera.overview;
// 拖动平移、双指和滚轮缩放由 IsoWorld 绑在画布上；窗口大小变了它自己 resize
const stage = createIsoWorld(container, { ...indianWells.INDIAN_WELLS_WORLD, pose: HOME });
const camera = stage.camera;
camera.limits = {
  zoom: [...site.camera.limits.zoom],
  tx: [...site.camera.limits.tx],
  tz: [...site.camera.limits.tz],
};
camera.home = { ...HOME };
camera.setPose(HOME);
site.build(stage);
const scene = createGameScene(stage, content, site);
// 等距画面里围网是低矮的像素栅栏，不用再按镜头方向隐藏近处的围网（旧 three 版的 cutAwayNearFences 去掉了）

/* ---------- 一局 ---------- */
let session: Session;
let projector: Projector;

function begin(s: Session): void {
  session = s;
  projector = new Projector(content, text);
  projector.canShow = (a) => !!(site.anchors[a] ?? site.stands[a]);
  scene.sync(s.s);
  camera.reset();
  // 开场镜头对准总监（开局他站在大门口，默认视角里在屏幕外；QA P2-3）：总监落在画面中间偏右
  const d = s.s.people[DIRECTOR];
  const at = d && !d.walk ? site.stands[d.at] : null;
  if (at) camera.setPose({ ...HOME, tx: at.x - 22, tz: at.z - 8 });
  draw();
}

function freshSession(): Session {
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);
  const director = params.get('director') ?? undefined;
  const s = Session.fresh(content, seed, director);
  const skip = Number(params.get('skip')) || 0;
  if (skip) s.send({ type: 'debugSkip', minutes: skip });
  return s;
}

/* ---------- 界面 ---------- */
const hudActions: HudActions = {
  rotate: (dir) => camera.rotate(-dir),
  togglePause: () => {
    session.paused = !session.paused;
    draw();
  },
  cycleSpeed: () => {
    session.cycleSpeed();
    draw();
  },
  answer: (key) => answer(key),
  cardAction: (id) => {
    if (id === 'replay') {
      void clearAutosave();
      begin(freshSession());
    } else if (id === 'summary' || id === 'score') {
      // 结局卡（W4）：分数和总结来回切，只是画面
      session.endView = id;
      draw();
    } else if (id === 'season2') {
      // 开第二季：时钟回到第二季开局，画面按新状态重新摆一遍
      session.endView = 'score';
      session.send({ type: 'startSeason2' });
      pump([]);
      if (!session.s.outcome) {
        scene.sync(session.s);
        session.paused = false;
        draw();
      }
    }
  },
  // 员工条：点一下拿起来，再点场景里的岗位或工单；或者按住直接拖过去
  pick: (person) => {
    session.picked = person;
    session.sheet = null;
    draw();
  },
  drop: (person, x, y) => {
    const t = targetAt(x, y);
    if (t && 'target' in t) assignTo(person, t.target, t.variant);
    else if (t) tapPlace(t.place, person);
    else {
      session.picked = null;
      draw();
    }
  },
  assign: (person, target) => {
    session.assign(person, target);
    pump([]);
  },
  closeSheet: (all = true) => {
    session.sheet = null;
    if (all) session.place = null;
    draw();
  },
  target: (id) => tapTarget(id),
  variant: (order, v) => tapVariant(order, v),
  beat: (place) => jumpTo(place),
};
/** 屏幕上 (x, y) 那儿是地点清单的哪一行，或者哪块地点牌 */
function targetAt(x: number, y: number): { target: string; variant?: string } | { place: string } | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const h = el as HTMLElement;
    const row = h.closest?.<HTMLElement>('[data-target]');
    const t = row?.dataset.target;
    // 变体行（UI-11）：落在哪一行就按哪个变体开工
    if (t) return row?.dataset.variant ? { target: t, variant: row.dataset.variant } : { target: t };
    const a = h.closest?.<HTMLElement>('[data-place]')?.dataset.place;
    if (a) return { place: a };
  }
  return null;
}
function assignTo(person: string, target: string, variant?: string): void {
  const w = worldOf(session.s, content);
  if (canAssign(session.s, w, person, target, variant) === null) {
    session.assign(person, target, variant);
    pump([]);
  } else {
    // 派不过去（例如钱不够买料）：打开说明，让玩家看到为什么
    session.picked = null;
    session.sheet = target;
    session.place = worldOf(session.s, content).posts.get(target)?.at ?? w.orders.get(target)?.at ?? session.place;
    draw();
  }
}
const ui = mountHud($('hud'), hudActions);

/**
 * 卡片选项。选路卡（W2）要点两下：第一下镜头转到这条路落在哪儿、叠上预览，第二下才定（direct：试玩桥直接定）。
 */
function answer(key: 1 | 2 | 3, direct = false): void {
  const o = Projector.focusCard(session.s, content);
  if (!o || session.s.outcome) return;
  const w = worldOf(session.s, content);
  const c = w.cards.get(o.card);
  if (!c) return;
  const keys = (['A', 'B', 'C'] as const).filter((k) => c.options[k]);
  const opt = keys[key - 1];
  if (!opt) return;
  const p = session.routePick;
  if (!direct && projector.routeOf(o.card, opt) && !(p?.uid === o.uid && p.option === opt)) {
    session.routePick = { uid: o.uid, option: opt };
    draw();
    return;
  }
  if (session.choose(o.uid, opt)) pump([]);
}

/** 选路卡 ★3、★4 的路落在哪块地上（wave2-5-contract.md「地块」；Wave 5 的地图给了 landPreview 才画得出来） */
const ROUTE_PLOTS: Readonly<Record<string, string>> = { s3: 'golf_west', s4: 'se_corner' };

/**
 * 季节栏上点了一个节拍（UI-9）：镜头转到那一处的地点牌，牌子亮几秒。只读，不开清单。
 */
let beatFocus: { place: string; seq: number; until: number } | null = null;
let beatSeq = 0;
function jumpTo(place: string): void {
  beatFocus = { place, seq: ++beatSeq, until: performance.now() + 3500 };
  draw();
}
const beatOn = (a: string) => !!beatFocus && beatFocus.place === a && performance.now() < beatFocus.until;

const draw = () => {
  syncPreview();
  ui.update(projector.snapshot(session));
};

/**
 * 变体预览（UI-11）：只在地点清单开着、点了一个变体行时叠在设施上；清单关了、换了地点、工单开工锁定了就收掉。
 * 只是画面，不进模拟。
 */
let previewKey = '';
let landKey = '';
function syncPreview(): void {
  const p = session.preview;
  const w = worldOf(session.s, content);
  const o = p ? w.orders.get(p.order) : undefined;
  const f = o ? (w.facilityAt.get(o.at) ?? null) : null;
  // 卡开着时地点清单让开（Hud），预览也跟着收起
  const shown = session.place === o?.at && !session.sheet && !session.s.cards.open.length && !session.s.outcome;
  const live = !!p && !!o && !!f && shown && !session.s.orders[o.id]?.variant;
  if (!live) session.preview = null;
  // 选路卡上点过的那一项（W2）：★2 的路叠在先开的设施上，★3、★4 的路叠在新地块上
  const rf = projector.routeFocus(session);
  if (!rf && session.routePick && !session.s.cards.open.some((x) => x.uid === session.routePick?.uid))
    session.routePick = null;
  const want = live && p && f ? { f, v: p.variant } : rf?.facility ? { f: rf.facility, v: rf.variant } : null;
  const key = want ? `${want.f}:${want.v}` : '';
  if (key !== previewKey) {
    const was = previewKey.split(':')[0] || null;
    previewKey = key;
    if (want) scene.preview(want.f, want.v);
    else if (was) scene.preview(was, null);
  }
  const plot = rf && !rf.facility ? ROUTE_PLOTS[rf.slot] : undefined;
  const lk = plot && rf ? `${plot}:${rf.variant}` : '';
  if (lk !== landKey) {
    const was = landKey.split(':')[0] || null;
    landKey = lk;
    if (plot && rf) scene.landPreview(plot, rf.variant);
    else if (was) scene.landPreview(was, null);
  }
}

/* ---------- 地点牌、岗位和工单的标记 ---------- */
const labels = new GameLabels($('labels'), camera);
labels.occluders = () =>
  [...document.querySelectorAll('.td-bug,.td-strip-wrap,.td-card,.td-wire,.td-bug-status,.td-staff,.td-sheet')].map(
    (el) => el.getBoundingClientRect(),
  );
const ground = (a: string, dy: number) => () => {
  const p = site.stands[a] ?? { x: 0, z: 0 };
  return { x: p.x, y: site.groundY(p.x, p.z) + dy, z: p.z };
};
/**
 * 地点牌指的点（QA P2-4）：站位是人站的地方（几处球场的站位都挤在中间的十字路口，牌子会叠在别的场地上、
 * 盖住站着的人），所以牌子指向地点本身——有球场的地方指场地远端的边（中心正上方那一段），
 * 引线不穿过场上的人；其他地方指地点中心。
 */
/** 球场按当前变体（courts.ts）：地点牌指向修成以后的那几块场地 */
const courtSite = variantSite(
  site,
  () => session?.s ?? null,
  () => content,
);
const footprint = (a: string): { x: number; z: number }[][] => {
  const frs = courtSite.courts[a];
  if (frs?.length)
    return frs.map((f) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([i, j]) => {
        const p = f.w({ x: (i as number) * f.hx, z: (j as number) * f.hz });
        return { x: p.x, z: p.z };
      }),
    );
  const c = site.anchors[a] ?? site.stands[a] ?? { x: 0, z: 0 };
  return [[c]];
};
const placePoint = (a: string) => {
  const polys = footprint(a);
  const c = site.anchors[a] ?? site.stands[a] ?? { x: 0, z: 0 };
  return (): { x: number; y: number } => {
    const cq = camera.project(c.x, site.groundY(c.x, c.z), c.z);
    let best: { x: number; y: number } | null = null;
    let topV: { x: number; y: number } | null = null;
    for (const poly of polys) {
      const pts = poly.map((p) => camera.project(p.x, site.groundY(p.x, p.z) + 0.1, p.z));
      if (pts.length === 1) return pts[0] as { x: number; y: number };
      // 竖线 x = 中心的屏幕 x 和这块场地的边相交，取最上面的交点
      for (let i = 0; i < pts.length; i++) {
        const u = pts[i] as { x: number; y: number };
        const v = pts[(i + 1) % pts.length] as { x: number; y: number };
        if (!topV || u.y < topV.y) topV = u;
        if ((u.x - cq.x) * (v.x - cq.x) > 0 || u.x === v.x) continue;
        const y = u.y + ((cq.x - u.x) / (v.x - u.x)) * (v.y - u.y);
        if (!best || y < best.y) best = { x: cq.x, y };
      }
    }
    return best ?? topV ?? cq;
  };
};
const director = () => session.s.people[DIRECTOR];
/** 拉远看整座岛时（手机默认视角），只给总监所在、正要去、有事的地方挂名字；其余缩成小圆点 */
const placeFlags = (a: string) => {
  const s = session.s;
  const d = director();
  const here = !d?.walk && d?.at === a;
  const dest = d?.walk?.to === a;
  const card = s.cards.open.some((o) => {
    const c = worldOf(s, content).cards.get(o.card);
    return (c?.stage?.anchor ?? c?.location) === a;
  });
  return { here, dest, card, dot: labels.compact && !here && !dest && !card && !beatOn(a) };
};
/** 牌子的摆放优先级：打开的、要去的、有事的、能接手里这个人的先摆，其余让位（QA P1-2） */
const placePrio = (a: string, base: number) => () => {
  const f = placeFlags(a);
  const h = hubOf(a);
  return (
    base +
    (beatOn(a) ? 80 : 0) +
    (session.place === a ? 60 : 0) +
    (f.card ? 40 : 0) +
    (f.dest ? 30 : 0) +
    (f.here ? 20 : 0) +
    (h?.fit === 'fit' ? 25 : 0) +
    (h?.posts.some((p) => p.need) ? 6 : 0) +
    (h?.ready ? 4 : 0)
  );
};
for (const a of content.acts[0]?.anchors ?? []) {
  const placeLabel = labels.add({
    get: ground(a, 0.2),
    screen: placePoint(a),
    lift: () => (placeFlags(a).dot ? 8 : 18),
    prio: placePrio(a, 0),
    crowded: 'dot',
    keepOnScreen: true,
    // 缩成小圆点的地方如果立着地点牌，圆点就不画了（地点牌本身能点）
    // 立着地点牌的地方，名字和状态（总监在这儿、正要去、有卡）都画在地点牌上（一个地点只有一块牌）
    text: () => (hubOf(a) ? null : text.anchor(a)),
    cls: () => {
      const f = placeFlags(a);
      return `pl${f.here ? ' pl-here' : ''}${f.dest ? ' pl-dest' : ''}${f.card ? ' pl-card' : ''}${f.dot ? ' pl-dot' : ''}${beatOn(a) ? ' pl-beat' : ''}`;
    },
  });
  placeLabel.el.dataset.anchor = a;
  const center = site.anchors[a];
  labels.add({
    // 活动牌挂在场地中央（地点牌在门口），两块牌子不叠在一起
    get: center ? () => ({ x: center.x, y: site.groundY(center.x, center.z) + 0.2, z: center.z }) : ground(a, 0.2),
    lift: 20,
    prio: () => -10,
    crowded: 'hide',
    stem: false,
    cls: () => 'act',
    text: () => {
      const s = session.s;
      const r = s.activities.find((x) => x.started && x.anchor === a && s.t < x.end);
      return r
        ? text.fmt('ui.activity', { title: text.tr(`activities.${r.id}.title`), time: text.duration(r.end - s.t) })
        : null;
    },
  });
}

/**
 * 地点牌（ADR 0013）：一个地点一块牌，和这个地点有多少岗位、工单无关。
 * 牌上是此刻要人的岗位（头像带环形进度，空着是红色 +）和一格工单数（按能力上色）。
 * 点它打开拇指区的地点清单；拿着人点它（或拖上去松手）：只有一项能接的活就直接派，有好几项就在清单里选。
 */
const hubCache = new Map<string, ReturnType<Projector['hub']>>();
const hubOf = (a: string) => {
  if (!hubCache.has(a)) hubCache.set(a, projector ? projector.hub(session, a) : null);
  return hubCache.get(a) ?? null;
};
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
function addHubs(c: ContentBundle): void {
  for (const a of c.acts[0]?.anchors ?? []) {
    const m = labels.add(
      {
        // 牌子指向地点本身（球场远端的边、地点中心），不压在站位上的人头上（QA P2-4）
        get: ground(a, 0),
        screen: placePoint(a),
        lift: 18,
        keepOnScreen: true,
        prio: placePrio(a, 10),
        crowded: 'dot',
        text: () => (hubOf(a) ? text.anchor(a) : null),
        html: () => {
          const h = hubOf(a);
          if (!h) return '';
          const posts = h.posts
            .map(
              (p) =>
                `<span class="hb-p${p.need ? ' hb-need' : ''}${p.on ? ' hb-on' : ''}${p.soon ? ' hb-soon' : ''}${p.coming ? ' hb-coming' : ''}" style="--p:${Math.round(p.progress * 100)}%${p.color ? `;--c:${p.color}` : ''}">${esc(p.initials)}</span>`,
            )
            .join('');
          const o = h.orders;
          const orders = o.n
            ? `<span class="hb-o${o.crew ? ' hb-on' : ''}${h.ready ? ' hb-ready' : ''}">${o.skills.map((k) => `<i class="hb-${k}"></i>`).join('')}⚒${o.progress !== null ? `${Math.round(o.progress * 100)}%` : o.n > 1 ? o.n : ''}</span>`
            : '';
          const name = `<b>${esc(text.anchor(a))}</b>`;
          // 设施快撑不住了：红色 ! 加状况（第二轮试玩 S3）
          const worn = h.worn !== null ? `<span class="hb-worn">!${h.worn}</span>` : '';
          return `${name}${worn}${posts}${orders}`;
        },
        cls: () => {
          const h = hubOf(a);
          const need = h?.posts.some((p) => p.need);
          const f = placeFlags(a);
          return `hub${beatOn(a) ? ' hub-beat' : ''}${f.here ? ' hub-here' : ''}${f.dest ? ' hub-dest' : ''}${f.card ? ' hub-card' : ''}${need ? ' hub-need' : ''}${h?.fit === 'fit' ? ' tg-fit' : h?.fit === 'nofit' ? ' tg-nofit' : ''}${session.place === a ? ' hub-open' : ''}`;
        },
      },
      () => tapPlace(a),
    );
    m.el.dataset.place = a;
  }
}
/** 点地点牌（或拿着人落到它上面） */
function tapPlace(a: string, person: string | null = session.picked): void {
  if (person) {
    const fits = projector.placeFits(session, a, person);
    // 只有一项能接的活就直接派；但还没定变体的修复工单要先在清单里挑一行（UI-11）
    const o = fits[0] ? worldOf(session.s, content).orders.get(fits[0]) : undefined;
    const choose = !!o?.variants && !session.s.orders[o.id]?.variant;
    if (fits.length === 1 && fits[0] && !choose) {
      assignTo(person, fits[0]);
      return;
    }
    session.picked = person;
  } else if (session.place === a) {
    session.place = null;
    session.sheet = null;
    draw();
    return;
  }
  session.place = a;
  session.sheet = null;
  draw();
}
/** 点地点清单里的变体行：拿着人就按这个变体开工，没拿就开 / 关这个变体的预览 */
function tapVariant(order: string, variant: string): void {
  if (session.picked) {
    assignTo(session.picked, order, variant);
    return;
  }
  const p = session.preview;
  session.preview = p?.order === order && p.variant === variant ? null : { order, variant };
  draw();
}
function tapTarget(id: string): void {
  if (session.picked) assignTo(session.picked, id);
  else {
    session.sheet = session.sheet === id ? null : id;
    draw();
  }
}
addHubs(content);

// 总监走在路上时头顶挂个"你"
labels.add({
  get: () => scene.directorHead(),
  // 头顶还有个像素菱形（scene.ts），牌子再高一点
  lift: () => 12 + 3 * Math.max(1, stage.view.proj.spriteScale),
  prio: () => 1000,
  stem: false,
  cls: () => 'you',
  text: () => (director()?.walk ? text.tr('ui.you') : null),
});

/* ---------- 拖人时手指下面的落点亮起来 ---------- */
let hoverEl: HTMLElement | null = null;
const setHover = (el: HTMLElement | null) => {
  if (el === hoverEl) return;
  hoverEl?.classList.remove('drop-hover');
  hoverEl = el;
  hoverEl?.classList.add('drop-hover');
};
document.addEventListener('pointermove', (e) => {
  // 只在按住拖人时（员工条拿起了人、手指没松开）
  if (!session.picked || !e.buttons) return setHover(null);
  let el: HTMLElement | null = null;
  for (const x of document.elementsFromPoint(e.clientX, e.clientY)) {
    el = (x as HTMLElement).closest?.<HTMLElement>('[data-target],[data-place]') ?? null;
    if (el) break;
  }
  setHover(el);
});
document.addEventListener('pointerup', () => setHover(null));
document.addEventListener('pointercancel', () => setHover(null));

/* ---------- 键盘 ---------- */
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button,summary,input,select') && (e.key === ' ' || e.key === 'Enter')) return;
  if (t?.closest?.('.tdd') && e.key !== '`') return;
  if (e.key === '`' && debug) debug.toggle();
  else if (e.key === 'q' || e.key === 'Q') camera.rotate(1);
  else if (e.key === 'e' || e.key === 'E') camera.rotate(-1);
  else if (e.key === '+' || e.key === '=') camera.zoomIn();
  else if (e.key === '-' || e.key === '_') camera.zoomOut();
  else if (e.key === 'r' || e.key === 'R') camera.reset();
  else if (e.key === 'f' || e.key === 'F') {
    session.cycleSpeed();
    draw();
  } else if (e.key === '1' || e.key === '2' || e.key === '3') answer(Number(e.key) as 1 | 2 | 3);
  else if (e.key === 'Escape') {
    session.picked = null;
    session.sheet = null;
    session.place = null;
    draw();
  } else if (e.key === ' ') {
    e.preventDefault();
    session.paused = !session.paused;
    draw();
  }
});

/*
 * ---------- 镜头跟随：新卡、升星、修好一处（scene.focus），地点清单里预览变体（设施） ----------
 * 镜头慢慢移过去，把那一点放在画面上没被 HUD 挡住的那一段中间（上面是记分牌，下面是员工条、卡片或地点清单）。
 * 玩家一拖画面就不再跟。
 */
let focusKey = '';
container.addEventListener('pointerdown', () => camera.setFollow(false));
/** 屏幕上没被 HUD 挡住的那一段（CSS 像素）：上沿是记分牌的下沿，下沿是 bottomEl 的上沿 */
function visibleBand(bottomEl: Element | null): { top: number; bottom: number } {
  const H = container.clientHeight;
  let top = 0;
  for (const el of document.querySelectorAll('.td-top,.td-strip-wrap')) {
    const r = el.getBoundingClientRect();
    if (r.height && r.top < H / 3) top = Math.max(top, r.bottom);
  }
  let bottom = H;
  const lows = bottomEl ? [bottomEl] : [...document.querySelectorAll('.td-card,.td-staff-row,.td-wire')];
  for (const el of lows) {
    const r = el.getBoundingClientRect();
    if (r.height && r.top > H / 3) bottom = Math.min(bottom, r.top);
  }
  return bottom - top < 80 ? { top: 0, bottom: H } : { top, bottom };
}
/**
 * 让世界里的点 (x, y, z) 落在屏幕 band 的正中，镜头目标该在哪儿。
 * 平移是线性的：此刻目标点投在 C、这一点投在 P，想让它到 D，目标就挪到此刻投在 C + (P − D) 的地面点。
 */
function aimAt(x: number, y: number, z: number, band: { top: number; bottom: number }): { x: number; z: number } {
  const P = camera.project(x, y, z);
  const C = camera.project(camera.smooth.tx, 0, camera.smooth.tz);
  const D = { x: container.clientWidth / 2, y: (band.top + band.bottom) / 2 };
  return camera.unproject(C.x + P.x - D.x, C.y + P.y - D.y);
}
/** 预览变体时对准的设施（UI-11）：设施在地点清单上面那一段里 */
function previewFocus(): { key: string; x: number; y: number; z: number; sheet: Element | null } | null {
  const p = session.preview;
  const sheet = document.querySelector('.td-place');
  if (!p || !sheet) return null;
  const o = worldOf(session.s, content).orders.get(p.order);
  const c = o ? (site.anchors[o.at] ?? site.stands[o.at]) : undefined;
  if (!o || !c) return null;
  return { key: `pv:${p.order}:${p.variant}`, x: c.x, y: site.groundY(c.x, c.z), z: c.z, sheet };
}
/** 选路卡上点过的那一项（W2）、季节栏上点过的节拍（UI-9）：镜头对准那一处 */
function pointFocus(): { key: string; x: number; y: number; z: number; band: Element | null } | null {
  const rf = projector.routeFocus(session);
  const ra = rf?.anchor ?? null;
  const rc = ra ? (site.anchors[ra] ?? site.stands[ra]) : undefined;
  if (rf && rc)
    return {
      key: `rt:${rf.key}`,
      x: rc.x,
      y: site.groundY(rc.x, rc.z),
      z: rc.z,
      band: document.querySelector('.td-card'),
    };
  if (beatFocus && performance.now() < beatFocus.until) {
    const c = site.anchors[beatFocus.place] ?? site.stands[beatFocus.place];
    if (c) return { key: `bt:${beatFocus.seq}`, x: c.x, y: site.groundY(c.x, c.z), z: c.z, band: null };
  }
  return null;
}
function followFocus(): { x: number; z: number } | null {
  const pt = pointFocus();
  if (pt) {
    if (pt.key !== focusKey) {
      focusKey = pt.key;
      camera.setFollow(true);
    }
    return camera.following ? aimAt(pt.x, pt.y, pt.z, visibleBand(pt.band)) : null;
  }
  const pv = previewFocus();
  const f = pv ? null : scene.focus();
  const key = pv ? pv.key : f ? `f:${f.seq}` : '';
  if (!pv && !f) {
    focusKey = '';
    if (camera.following) camera.setFollow(false);
    return null;
  }
  if (key !== focusKey) {
    focusKey = key;
    camera.setFollow(true);
  }
  if (!camera.following) return null;
  if (pv) return aimAt(pv.x, pv.y, pv.z, visibleBand(pv.sheet));
  if (!f) return null;
  return aimAt(f.x, site.groundY(f.x, f.z) + (f.y ?? 0), f.z, visibleBand(null));
}

/*
 * ---------- 夜里跳到第二天早上：黑一下屏再亮（只是画面，模拟照常） ----------
 * 关门以后模拟一步跳到第二天开门（走到一半的人直接到、天一下子亮了）。画面先停在晚上那一帧淡出到黑，
 * 黑着的时候把人、天色、天气一次摆好，再淡入；淡出的这一段模拟不往前走。
 */
const NIGHT_FADE = 0.6;
const nightEl = document.createElement('div');
nightEl.id = 'night';
$('labels').after(nightEl);
let night: { phase: 'out' | 'in'; t: number } | null = null;
const NIGHT_GAP = 120;

/* ---------- 主循环 ---------- */
let saveT = 0;
function pump(events: readonly SimEvent[]): void {
  const all = [...events, ...session.frame(0)];
  if (!all.length) return;
  projector.onEvents(session.s, all);
  scene.onEvents(session.s, all);
  if (all.some((e) => e.type === 'dayEnded' || e.type === 'actEnded')) void writeAutosave(session);
  draw();
}

let last = performance.now();
let uiT = 0;
function frame(ts: number) {
  requestAnimationFrame(frame);
  const dt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts;
  const t0 = session.s.t;
  // 正在黑屏淡出：画面停在晚上，模拟也先不走
  if (night?.phase !== 'out') pump(session.frame(dt));
  if (!night && session.s.t - t0 > NIGHT_GAP) night = { phase: 'out', t: 0 };
  if (night) {
    night.t += dt;
    if (night.phase === 'out' && night.t >= NIGHT_FADE) night = { phase: 'in', t: 0 };
    const u = clamp(night.t / NIGHT_FADE, 0, 1);
    nightEl.style.opacity = String(night.phase === 'out' ? u : 1 - u);
    if (night.phase === 'in' && u >= 1) {
      night = null;
      nightEl.style.opacity = '0';
    }
  }
  const card = document.querySelector('.td-card');
  const occ = card ? Math.max(0, container.clientHeight - card.getBoundingClientRect().top) : 0;
  if (occ !== camera.occludedBottomPx) camera.occludedBottomPx = occ;
  camera.update(dt, followFocus());
  // 人物取帧要知道镜头转角和精灵档位（people/view.ts），先于人物更新
  const pr = stage.view.proj;
  setPeopleView(pr.ang, pr.k, pr.spriteScale);
  // 淡出的时候不更新场景（停在晚上那一帧）；黑透了再一次摆到第二天早上
  // 黑屏淡入淡出时玩家看不见画面：升星先排着，亮了再演
  scene.setWatching(!night);
  if (night?.phase !== 'out') scene.update(session.s, session.time, dt, session.paused);
  stage.render(dt, scene.showNow());
  // 拉远看整座岛时地点牌缩成小圆点（旧版按 4 CSS 像素每米；等距默认 k = 3 时约 3 px/m）
  labels.compact = camera.pxPerM < 3.5;
  hubCache.clear();
  labels.place(container.clientWidth, container.clientHeight);
  uiT += dt;
  if (uiT > 0.2) {
    uiT = 0;
    draw();
  }
  debug?.frame(dt);
  saveT += dt;
  if (saveT > 30 && !session.s.outcome) {
    saveT = 0;
    void writeAutosave(session);
  }
}

/* ---------- 开局：有自动存档就接着玩（?new 或 ?seed= 开新局） ---------- */
async function boot(): Promise<void> {
  const save = params.has('new') || params.has('seed') ? null : await readAutosave(content.version);
  begin(save ? new Session(content, save.state, save.commands) : freshSession());
  requestAnimationFrame(frame);
}
void boot();

/* ---------- 开发用：调试面板（` 键）和内容热重载 ---------- */
function setContent(c: ContentBundle): void {
  content = c;
  text = createText(c, lang);
  applyHudStrings();
  session.content = c;
  projector.setContent(c, text);
  scene.setContent(c);
  draw();
}

const debug =
  import.meta.env.DEV || params.has('debug')
    ? createDebug(
        $('debug'),
        {
          session: () => session,
          content: () => content,
          text: () => text,
          exportSave: () => downloadSave(session),
          newGame: (seed) => {
            void clearAutosave();
            const s = Session.fresh(content, seed ?? Math.floor(Math.random() * 2 ** 31), session.s.directorConfig);
            begin(s);
          },
          pump: () => pump([]),
        },
        params.has('debug'),
      )
    : null;

if (import.meta.hot)
  import.meta.hot.on('td:content', (data: { bundle: ContentBundle; warnings: string[] }) => {
    document.querySelector('vite-error-overlay')?.remove();
    setContent(data.bundle);
    debug?.note(data.warnings);
    console.info(`[content] hot-reloaded ${data.bundle.version}`);
  });

/**
 * 试玩桥（tools/playtest 用）：一分钟一分钟地快进，直到有新卡打开、要求暂停、本幕结束、工单做完，或走满 max 分钟。
 * 走完停在暂停状态，像回合制一样把决定交还给试玩者。
 */
function fastForward(max: number): { minutes: number; stop: string } {
  const t0 = session.s.t;
  session.paused = false;
  let stop = 'time';
  // 按营业分钟数走（夜里跳过的时间不算），每次正好一分钟（R10：/wait/1440 不会走成两天）
  for (let i = 0; i < max; i++) {
    const ev = session.stepMinute();
    pump(ev);
    if (session.s.outcome) stop = 'actEnded';
    else if (ev.some((e) => e.type === 'cardOpened')) stop = 'cardOpened';
    else if (session.paused) stop = 'pause';
    else if (ev.some((e) => e.type === 'orderFinished')) stop = 'orderFinished';
    else continue;
    break;
  }
  session.paused = true;
  draw();
  return { minutes: session.s.t - t0, stop };
}

declare global {
  interface Window {
    __td?: {
      session: () => Session;
      setContent: (c: ContentBundle) => void;
      resync: () => void;
      /** 镜头（截图、试玩时对准某处、转角、缩放） */
      camera: () => typeof camera;
      /** 等距画面（试玩、截图时查场景图） */
      world: () => typeof stage;
      fastForward: (max: number) => { minutes: number; stop: string };
      answer: (key: 1 | 2 | 3) => void;
      /** 把人派到岗位或工单上（null 叫他停下来；variant：变体工单的哪一行）；返回 null，或者为什么没成 */
      assign: (person: string, target: string | null, variant?: string) => string | null;
      /** 点地点清单里的变体行（和手指点一样：拿着人就派，没拿就开 / 关预览） */
      tapVariant: (order: string, variant: string) => void;
      /** 员工条的数据 */
      staff: () => unknown;
      /** 某个岗位或工单的说明（和点开时看到的一样） */
      sheet: (target: string) => unknown;
      /** 现在场景里看得见的岗位和工单标记 */
      targets: () => unknown;
      /** 点一个标记（和手指点一样：拿着人就派，没拿就打开说明） */
      tap: (target: string) => void;
      pick: (person: string | null) => void;
      close: () => void;
      /** 复原进度、第几天、离投资方期限还有几天（试玩桥的 /state 用） */
      progress: () => {
        day: number;
        restored: number;
        total: number;
        daysLeft: number | null;
        deadlineDay: number | null;
        anchors: readonly string[];
      };
    };
  }
}
window.__td = {
  session: () => session,
  setContent,
  resync: () => scene.sync(session.s),
  camera: () => camera,
  world: () => stage,
  fastForward,
  answer: (key) => answer(key, true),
  assign: (person, target, variant) => {
    const w = worldOf(session.s, content);
    const why = canAssign(session.s, w, person, target, variant);
    if (why !== null) return `rejected: ${why}`;
    session.assign(person, target, variant);
    pump([]);
    return null;
  },
  staff: () => projector.staff(session),
  sheet: (t) => projector.sheet(session, t),
  // 场景里的地点牌（target 是锚点 id）和打开的地点清单里的行
  targets: () => [
    ...[...document.querySelectorAll<HTMLElement>('#labels [data-place]')]
      .filter((el) => !el.hidden)
      .map((el) => ({ target: el.dataset.place, text: el.textContent, cls: el.className })),
    ...[...document.querySelectorAll<HTMLElement>('.td-place [data-target]')].map((el) => ({
      target: el.dataset.target,
      text: el.textContent,
      cls: el.className,
    })),
  ],
  tap: (t) => ((content.acts[0]?.anchors ?? []).includes(t) ? tapPlace(t) : tapTarget(t)),
  tapVariant,
  pick: (p) => hudActions.pick?.(p),
  close: () => {
    session.picked = null;
    session.sheet = null;
    session.place = null;
    draw();
  },
  progress: () => {
    const s = session.s;
    const w = worldOf(s, content);
    const last = w.act.calendar[w.act.calendar.length - 1];
    const end = last ? (last.day - 1) * 1440 + last.hour * 60 : null;
    return {
      day: Math.floor(s.t / 1440) + 1,
      restored: Math.round(s.stats.restoration ?? 0),
      total: w.facilities.size,
      daysLeft: end === null ? null : Math.max(0, Math.ceil((end - s.t) / 1440)),
      deadlineDay: last?.day ?? null,
      anchors: w.act.anchors,
    };
  },
};
