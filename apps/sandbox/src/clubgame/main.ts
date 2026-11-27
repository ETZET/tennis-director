// clubgame：整个游戏的入口（页面 clubvista.html）。把两套地图合成一个能玩的页面：
//   - 分图（clubvista/world.ts 的 mountVista）：到达、中心球场、歇脚、练习场四张主题小图，开局在到达图的公交站；
//   - 内场（clubwalk/walk.ts 的 mountWalk）：clubwalk 的整座俱乐部（红土、匹克球、会员场、会所、餐车院子、高尔夫、广场……）当第五张图。
// 从到达图前台东边的踏脚石走出去 → 圆形转场 → 内场的大门里；从内场的大门走出去 → 圆形转场 → 回到前台东边。
//
// 怎么同住一页：两个世界各有自己的画布（#c / #cw）、画面管线、总监、导航、像素界面、人物界面（都是 clubsite 的同一套代码，
// 各挂一份），同一时刻只有一个在台上（另一个不走步、不画，画布和界面 visibility: hidden）。状态是共用的：
//   - 演员表的状态（钱、好感、记忆、游戏时钟）放在同一个盒子里（clubsite/castui 的 createCastStore）；
//   - 时刻和天气（clubsite/daylight）换世界的那一刻抄过去。
// 内场第一次进去才加载、才建（动态 import，转场黑屏里建）；之后留着，来回只是换台。
// 为什么不把两套世界揉进一个场景：配色方案（vista / golden）、太阳、导航网格、区域按需建都不一样，揉在一起就是重写
// clubwalk；两块画布各画各的，画面一点不用动。代价和以后怎么收：docs/lab/2026-11-07-3d-pixel/clubvista.md「合成一个游戏」。
//
// URL：clubvista 的那些照旧（map、at、hour、debug=1……）；world=club 开局直接在内场（截图 / 调试）；?asset=<id> = clubvista 的资产画廊。
// 调试：window.__game（world()、toClub()、toVista()、map、vista、walk()）。
import '../clubsite/render/colors';
import * as THREE from 'three';
import { createCastStore } from '../clubsite/castui';
import { createIris, createWaySigns, type WaySigns } from '../clubsite/hud';
import { GATE } from '../clubsite/world';
import { mapName } from '../clubvista/text';
import { mountVista } from '../clubvista/world';
import type { WalkApi } from '../clubwalk/walk';
import { gt } from './text';
import { createWorldMap } from './worldmap';

type World = 'vista' | 'club';

/** 内场的大门里（长廊东头，朝西）：从分图进来站这儿 */
const GATE_IN: [number, number, number] = [GATE.x - 6.2, 0, -Math.PI / 2];
/** 走出大门多远算"出去了"（米） */
const GATE_OUT = 2.4;

function mountGame() {
  const params = new URLSearchParams(location.search);
  const store = createCastStore(params);
  let active: World = 'vista';

  // ── 界面分层：两个世界都往 body 上挂界面，记下谁挂的，不在台上的那一层藏起来 ──
  const owned: Record<World, Set<HTMLElement>> = { vista: new Set(), club: new Set() };
  /** 现在往 body 上挂东西的是谁（null = 共用的：换世界的转场、小地图、加载牌） */
  let tagging: World | null = null;
  const cVista = document.getElementById('c') as HTMLCanvasElement;
  const cClub = document.getElementById('cw') as HTMLCanvasElement;
  for (const id of ['labels', 'info', 'palsel']) {
    const e = document.getElementById(id);
    if (e) owned.vista.add(e);
  }
  for (const id of ['place', 'minimap', 'perf', 'pxsel']) {
    const e = document.getElementById(id);
    if (e) owned.club.add(e);
  }
  const obs = new MutationObserver((recs) => collect(recs));
  function collect(recs: MutationRecord[]) {
    if (!tagging) return;
    for (const r of recs)
      for (const n of r.addedNodes)
        if (n instanceof HTMLElement && n !== cVista && n !== cClub && n.parentElement === document.body) {
          owned[tagging].add(n);
          n.classList.toggle('world-off', tagging !== active);
        }
  }
  obs.observe(document.body, { childList: true });
  /** 以 who 的名义挂界面（同步的一段）；之后回到"在台上的那个" */
  function as<T>(who: World | null, fn: () => T): T {
    collect(obs.takeRecords());
    tagging = who;
    try {
      return fn();
    } finally {
      collect(obs.takeRecords());
      tagging = active;
    }
  }
  function show(w: World) {
    active = w;
    tagging = w;
    cVista.style.visibility = w === 'vista' ? 'visible' : 'hidden';
    cClub.style.visibility = w === 'club' ? 'visible' : 'hidden';
    for (const k of ['vista', 'club'] as const) for (const e of owned[k]) e.classList.toggle('world-off', k !== w);
    if (casts[w]) win.__cast = casts[w];
  }
  /** 两个世界各挂了一份人物界面（window.__cast 是后挂的那份）：按世界记下，__cast 跟着在台上的走 */
  type CastDebug = { close(): void };
  const win = window as unknown as { __cast?: CastDebug };
  const casts: Partial<Record<World, CastDebug>> = {};

  // ── 共用的：小地图、换世界的转场、加载牌 ──
  const head = new THREE.Vector3();
  let walk: WalkApi | null = null;
  const { map, iris, loading } = as(null, () => {
    const map = createWorldMap(
      () => (active === 'club' ? 'club' : vista.cur()),
      () => (active === 'club' ? clubPlace : ''),
    );
    const iris = createIris({
      center: () => {
        if (active === 'club' && walk) {
          head.copy(walk.director.position);
          head.y += 1;
          return walk.play.project(head, innerWidth, innerHeight);
        }
        return vista.headOnScreen();
      },
    });
    const loading = document.createElement('div');
    Object.assign(loading.style, {
      position: 'fixed',
      left: '0',
      right: '0',
      top: '46%',
      textAlign: 'center',
      zIndex: '41',
      pointerEvents: 'none',
      color: '#fff0c4',
      font: '600 15px/1.25 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif',
      letterSpacing: '1px',
    });
    loading.hidden = true;
    document.body.appendChild(loading);
    return { map, iris, loading };
  });
  const mapButton = { onTap: () => map.toggle(), pressed: () => map.isOpen() };

  // ── 分图 ──
  const vista = as('vista', () =>
    mountVista({
      params,
      active: () => active === 'vista',
      castStore: store,
      mapButton,
      outer: (to) => {
        if (to === 'club') void toClub();
      },
    }),
  );
  casts.vista = win.__cast;
  show('vista');

  // ── 内场：第一次去才加载、才建 ──
  const walkParams = new URLSearchParams(params);
  // 分图自己的参数（开局站哪、看哪、预热）不带给内场
  for (const k of ['at', 'look', 'warm', 'walk', 'route', 'map', 'castreset']) walkParams.delete(k);
  /** 出过大门又回到门里才算数（刚进来站在门里不触发） */
  let gateArmed = false;
  /** 内场里现在的地名（小地图底下那行）、大门的小路牌 */
  let clubPlace = '';
  let clubWays: WaySigns | null = null;
  let switching = false;
  async function ensureClub() {
    if (walk) return;
    loading.textContent = gt('loading');
    loading.hidden = false;
    // 让"加载中"先画出来一帧，再占主线程
    await new Promise((r) => setTimeout(r, 40));
    const m = await import('../clubwalk/walk');
    as('club', () => {
      m.mountWalk({
        pixelHud: true,
        canvas: cClub,
        params: walkParams,
        start: [GATE_IN[0], GATE_IN[1]],
        active: () => active === 'club',
        castStore: store,
        mapButton,
        hudHint: false,
        placeLabel: (n) => {
          clubPlace = `${gt('inner')} · ${n}`;
          return clubPlace;
        },
        // 大门的小路牌：离大门 11 米以内，在大门那个方向的屏幕边上写"到达 · 前台 →"
        frame: () => {
          if (!walk || !clubWays) return;
          const p = walk.director.position;
          const near = !switching && Math.hypot(p.x - GATE.x, p.z) < 11;
          if (near) {
            head.set(GATE.x + 1, 0, 0);
            const s = walk.play.project(head, innerWidth, innerHeight);
            clubWays.set([{ x: s.x, y: s.y, text: mapName('arrive') }]);
          } else clubWays.set([]);
        },
        ready: (api) => {
          walk = api;
        },
        step: () => {
          if (!walk || switching || active !== 'club') return;
          const p = walk.director.position;
          if (p.x < GATE.x - 1.5) gateArmed = true;
          else if (gateArmed && p.x > GATE.x + GATE_OUT && p.z > GATE.z0 - 4 && p.z < GATE.z1 + 4) void toVista();
        },
      });
    });
    casts.club = win.__cast;
    clubWays = as('club', () => createWaySigns());
  }
  /** 黑幕上写去哪（0.7 秒） */
  async function blackNote(text: string) {
    loading.textContent = text;
    loading.hidden = false;
    await new Promise((r) => setTimeout(r, 700));
    loading.hidden = true;
  }
  /** 时刻、天气跟过去（两个世界各有一个 daylight） */
  function carryDay(from: { day: WalkApi['day'] }, to: { day: WalkApi['day'] }) {
    to.day.total = from.day.total;
    to.day.setWeather(from.day.weather);
  }
  function closePanels() {
    map.close();
    casts.vista?.close();
    casts.club?.close();
    vista.hud?.peek(null);
    walk?.hud?.peek(null);
  }
  async function toClub(withIris = true) {
    if (switching || active === 'club') return;
    switching = true;
    closePanels();
    const swap = async () => {
      await ensureClub();
      const w = walk as WalkApi;
      carryDay(vista, w);
      w.play.teleport(GATE_IN[0], GATE_IN[1], GATE_IN[2]);
      gateArmed = false;
      show('club');
      if (withIris) await blackNote(mapName('club'));
      else loading.hidden = true;
    };
    if (withIris) await iris.run(swap);
    else await swap();
    (walk as WalkApi | null)?.hud?.place(mapName('club'));
    switching = false;
  }
  async function toVista() {
    if (switching || active === 'vista' || !walk) return;
    switching = true;
    closePanels();
    const w = walk;
    await iris.run(async () => {
      carryDay(w, vista);
      show('vista');
      vista.enter('arrive', 'fromClub');
      await blackNote(mapName('arrive'));
    });
    vista.announce();
    switching = false;
  }

  if (params.get('world') === 'club') void toClub(false);
  // 闲着的时候先把内场的代码拿下来（不建）：第一次转场少等一会儿
  else setTimeout(() => void import('../clubwalk/walk'), 6000);

  Object.assign(window, {
    __castOf: (w: World) => casts[w],
    __game: {
      world: () => active,
      where: () => (active === 'club' ? 'club' : vista.cur()),
      toClub,
      toVista,
      map,
      iris,
      vista,
      walk: () => walk,
    },
  });
}

// 不用 URLSearchParams：单文件打包（single-file.sh）把第一个 URLSearchParams(location.search) 换成带默认查询串的
if (/[?&]asset=/.test(location.search)) void import('../clubvista/gallery');
else mountGame();
