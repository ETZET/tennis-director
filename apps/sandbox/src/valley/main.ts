// valley：俱乐部所在的小镇和山谷（地图扩张 demo，2026-11-15）。clubwalk 的大世界（俱乐部的场景按区域建）+ 外面整座山谷的白模。
// 走路、球车、汽车（走到车旁边上车，按住画面往手指那边开）；锁着的区域压暗、路口有路障，右上"调试"里开关；山谷里的事（旗子）走近了能点。
// 布局和平面图：layout.ts / valleyplan.html；设计记录：docs/lab/2026-11-07-3d-pixel/valley.md。
// URL：clubwalk 的那些（at=x,z、px、pal、perf=1……）+ unlock=all（全部解锁；不用 open：clubfood 的遮阳伞读 ?open= 当数字）、hotel=1（酒店盖好）。
import '../clubsite/render/colors';
import * as THREE from 'three';
import type { DayLook } from '../clubsite/daylight/sky';
import type { SharedUniforms } from '../clubsite/render/ctx';
import { ALL_REGION_IDS, buildValley, type ValleyWorld } from './build';
import { DETAILS } from './detail';
import { INTERIORS } from './interiors/all';
import { entryAt, exitAt, type InteriorDef, ORIGIN } from './interiors/index';
import { distToLine, FLOOR, HOTEL_PLOT, POIS, type PoiKind, REGIONS, ROADS, regionAt, type V2, VIEW } from './layout';
import { createValleyNav } from './nav';
import { MOD_BOUNDS } from './relocate';
import { mountWalk, type WalkApi } from './reuse';
import { mountShadowCull } from './shadowcull';
import { CLUB_BOX, inFloor } from './terrain';
import { keepScale, keepScaleCam, TOWN_K } from './townscale';
import { mountVehicles, type Vehicles } from './vehicles';

const params = new URLSearchParams(location.search);
const locked = new Set<string>(params.get('unlock') === 'all' ? [] : REGIONS.filter((r) => !r.open).map((r) => r.id));
const vnav = createValleyNav(locked);
vnav.hotel = params.get('hotel') === '1';

let world: ValleyWorld | null = null;
let api: WalkApi | null = null;
let cars: Vehicles | null = null;
let shCull: ReturnType<typeof mountShadowCull> | null = null;

const POI_LABEL: Record<PoiKind, string> = {
  errand: '办事',
  person: '聊聊',
  event: '看看',
  find: '翻翻',
  view: '远眺',
};

function start() {
  mountWalk({
    base: (m) => {
      if (m.name.startsWith('mtn')) return 'drop';
      flattenPass(m);
      return 'keep';
    },
    restClip: CLUB_BOX,
    afterRegion(root, id) {
      // 车道翻山口的那段（clubpark 的地形）：山谷里东边没有山了，压平
      if (id === 'clubpark') root.traverse((o) => (o as THREE.Mesh).isMesh && flattenPass(o as THREE.Mesh));
    },
    outerSurface: (x, z) => vnav.surface(x, z),
    outerBlocked: () => vnav.blocked(),
    // 店内摆在地图外面很远的地方（interiors/，x ≥ 3000）：导航范围包进去
    // 东边包住地图外面的店内（interiors/index.ts 的 ORIGIN，最东的那家 + 店宽 + 余量）
    navBounds: {
      x0: VIEW.x0,
      x1: Math.max(...INTERIORS.map((d) => ORIGIN[d.id][0] + d.w)) + 40,
      z0: VIEW.z0,
      z1: VIEW.z1,
    },
    farPath: (nav, ax, az, bx, bz) => vnav.farPath(nav, ax, az, bx, bz),
    zoom: [0.4, 2.6],
    camera: { dist: 120, far: 240 },
    hint: '按住画面往手指走 · 点地面走过去 · 门外有球车和汽车',
    build({ scene, ctx, uniforms }) {
      mapCtx = ctx;
      sharedUniforms = uniforms;
      world = buildValley(ctx, uniforms, locked, DETAILS);
      vnav.extra = world.blocked;
      scene.add(world.root);
      world.setHotel(vnav.hotel);
    },
    ready(a) {
      api = a;
      // 影子落不进画面的东西这一帧不投影（shadowcull.ts；?shcull=0 关掉做对照）
      shCull = mountShadowCull(a.scene, a.pipe.camera, a.pipe.renderer);
      shCull.enabled = params.get('shcull') !== '0';
      cars = mountVehicles({
        scene: a.scene,
        play: a.play,
        director: a.director,
        ctx: mapCtxRef(),
        vnav,
        refreshBlocked: a.refreshBlocked,
      });
      cars.barriers(locked);
      // 山谷里的事：旗子跟前能点
      for (const p of POIS) {
        const top = world?.poiTops.get(p.id);
        if (!top) continue;
        a.play.add({
          id: `valley:poi:${p.id}`,
          at: () => top.clone().setY(top.y - 3.2),
          radius: 4,
          priority: 2,
          label: () => (vnav.mode === 'walk' ? POI_LABEL[p.kind] : ''),
          canUse: () => vnav.mode === 'walk',
          autoUse: false,
          onUse: (play) => {
            play.say(a.director, `${p.name}：${p.note}`, 4.5);
          },
        });
      }
      mountInteriors(a);
      mountDebug();
      if (vnav.hotel) a.refreshBlocked();
    },
    placeName(x, z) {
      const inside = interiorAt(x, z);
      if (inside) return inside.name;
      let best: { name: string; d: number } | null = null;
      for (const p of POIS) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < 22 && (!best || d < best.d)) best = { name: p.name, d };
      }
      if (best) return best.name;
      if (!inFloor(x, z)) return null;
      if (x > HOTEL_PLOT.x0 && x < HOTEL_PLOT.x1 && z > HOTEL_PLOT.z0 && z < HOTEL_PLOT.z1)
        return vnav.hotel ? '俱乐部酒店' : '未来的酒店（扩张地）';
      if (x > CLUB_BOX.x0 && x < CLUB_BOX.x1 && z > CLUB_BOX.z0 && z < CLUB_BOX.z1) return null;
      return regionAt(x, z)?.name ?? '小镇';
    },
    drawMap: (g, W, H, view) => drawMap(g, W, H, view),
    step(dt, t) {
      interiorSync?.(dt);
      world?.update(dt, t);
      cars?.step(dt);
    },
  });
}

// clubwalk 的底图 ctx：build 钩子里拿到的那份留着（车也用它建材质）
let mapCtx: Parameters<typeof buildValley>[0] | null = null;
function mapCtxRef() {
  if (!mapCtx) throw new Error('valley: 底图 ctx 还没有');
  return mapCtx;
}

/** 车道翻山口那段（x > 118）：抬起来的路面压回地上 */
function flattenPass(m: THREE.Mesh) {
  const p = m.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
  if (!p) return;
  let changed = false;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (x > 117.5 && Math.abs(z) < 30 && y > 0.03 && y < 12) {
      p.setY(i, 0.012);
      changed = true;
    }
  }
  if (changed) {
    p.needsUpdate = true;
    m.geometry.computeVertexNormals();
    m.geometry.computeBoundingSphere();
  }
}

// ── 店内：门口"进去"、店里"出去"（画面暗一下再传送）；店里背景换成暗色（四周是空的） ──
const interiorAt = (x: number, z: number): InteriorDef | null =>
  INTERIORS.find((d) => {
    const [ox, oz] = ORIGIN[d.id];
    return x >= ox - 2 && x <= ox + d.w + 2 && z >= oz - 2 && z <= oz + d.d + 4;
  }) ?? null;
const INSIDE_BG = new THREE.Color(0x231c2e);
let sharedUniforms: SharedUniforms | null = null;
/** 按总监在哪切室内状态（mountInteriors 装上） */
let interiorSync: ((dt: number) => void) | null = null;
/** 店里的光：顶上的灯（仰角 65°、略偏东，只决定明暗分档），不投影，不随时刻、天气变；没有雨、沙、星星、风、云 */
const INDOOR_LOOK: DayLook = {
  el: 65,
  az: 15,
  moon: false,
  // 投影强度 0 = 没有投影（店里不该有太阳的影子；明暗只靠朝向分档）
  sunK: 0,
  shadeEl: 65,
  lit: [1, 1, 1],
  mid: [1, 1, 1],
  dark: [1, 1, 1],
  skyTop: 0x231c2e,
  skyHorizon: 0x231c2e,
  edgeMul: [1, 1, 1],
  cloudCut: 1,
  cloudVel: 0,
  rain: 0,
  dust: 0,
  stars: 0,
  wind: 0,
  lamps: 0,
  dustColor: [0.86, 0.68, 0.46],
  sat: 1,
};
let cloudWas = 1;
/** 店里镜头拉近多少（米/纹素 = 默认 × 这个；各店 def.zoom 可以改） */
const INSIDE_ZOOM = 0.8;
/**
 * 小镇里镜头拉近一档（townscale.ts：小镇的楼缩了，人在画面里也该大一点，像 Sneaky Sasquatch 那样人占屏幕高的 5%）。
 * 俱乐部、酒店扩张地里还是原来的远近；走出去 / 走回来慢慢推拉（同上下车）
 */
const TOWN_ZOOM = 0.75;
function mountInteriors(a: WalkApi) {
  // 默认远近（进山谷时）：店里按它的倍数定远近；出门还原成进门前的
  const mptDefault = a.pipe.rig.metersPerTexel;
  let mptOutside = mptDefault;
  const fade = document.createElement('div');
  fade.style.cssText =
    'position:fixed;inset:0;background:#120e1a;opacity:0;pointer-events:none;transition:opacity .22s;z-index:8';
  document.body.appendChild(fade);
  let outsideBg: THREE.Scene['background'] = null;
  let busy = false;
  /** 现在套着哪家店的室内状态（null = 在外面） */
  let insideOf: InteriorDef | null = null;
  /**
   * 室内状态按总监**实际在哪**切（不只挂在"进去"上）：走门、直接传送、at= 出生、验收脚本都一样。
   * 店里：背景暗色、镜头关在房间里并拉近一点、光照定住（没有日夜天气、不投影）、没有云影
   */
  const sync = () => {
    const p = a.director.position;
    const def = interiorAt(p.x, p.z);
    if (def === insideOf) return;
    if (insideOf && !def) {
      if (outsideBg) a.scene.background = outsideBg;
      a.play.setView(null);
      a.pipe.rig.metersPerTexel = mptOutside;
      a.play.zoomBy(1);
      if (sharedUniforms) sharedUniforms.uCloudStrength.value = cloudWas;
      a.day.override = null;
    }
    if (def) {
      if (!insideOf) {
        outsideBg = a.scene.background;
        mptOutside = a.pipe.rig.metersPerTexel;
        if (sharedUniforms) {
          cloudWas = sharedUniforms.uCloudStrength.value;
          sharedUniforms.uCloudStrength.value = 0;
        }
      }
      a.scene.background = INSIDE_BG;
      a.pipe.rig.metersPerTexel = mptDefault * (def.zoom ?? INSIDE_ZOOM);
      a.play.zoomBy(1);
      // 镜头关在房间里（墙外 1 米，南边只到门槛外 1.5 米：门外的暗色空地少露）
      const [ox, oz] = ORIGIN[def.id];
      a.play.setView({ x0: ox - 1, x1: ox + def.w + 1, z0: oz - 5, z1: oz + def.d + 1.5 });
      // 店里没有日夜和天气（用户 2026-11-16）：光照定住成室内的顶光；外面的时钟照样走
      a.day.override = INDOOR_LOOK;
    }
    insideOf = def;
    // 镜头的取景范围换了（关进房间 / 放出来）：按新范围重新对准总监。不然传送时镜头先被旧范围夹住
    // （出门时还停在店里），要一两秒才慢慢飞回门口 —— 画面横扫过整张地图
    a.play.teleport(p.x, p.z);
    // 店里不要小地图（挡住北墙，店里也用不上）
    const mm = document.getElementById('minimap');
    if (mm) mm.style.visibility = def ? 'hidden' : '';
  };
  // 小镇的远近：按总监在不在俱乐部里，相对地推拉（同 vehicles.ts 上下车的缩放，和它乘在一起）；店里不管（进出店是绝对的）
  let townK = 1;
  let lastX = Number.NaN;
  let lastZ = Number.NaN;
  const townZoom = (dt: number) => {
    if (insideOf) return;
    const p = a.director.position;
    // 一帧跳了 20 米以上（传送、验收脚本换点）：直接到位，不慢慢推（不然先拍到的是没推近的画面）
    if (Math.hypot(p.x - lastX, p.z - lastZ) > 20) dt = 10;
    lastX = p.x;
    lastZ = p.z;
    const want = keepScaleCam(p.x, p.z) ? 1 : TOWN_ZOOM;
    if (Math.abs(want - townK) < 1e-3) return;
    const step = Math.exp(Math.sign(want - townK) * Math.min(Math.abs(Math.log(want / townK)), dt * Math.log(1.25)));
    townK *= step;
    a.play.zoomBy(step);
  };
  // at= 直接出生在小镇里：一开始就是小镇的远近
  townZoom(10);
  interiorSync = (dt) => {
    sync();
    townZoom(dt);
  };
  const go = (x: number, z: number, yaw: number) => {
    if (busy) return;
    busy = true;
    fade.style.opacity = '1';
    setTimeout(() => {
      a.play.teleport(x, z, yaw);
      sync();
      fade.style.opacity = '0';
      busy = false;
    }, 240);
  };
  for (const def of INTERIORS) {
    const top = world?.poiTops.get(def.poi);
    if (!top) continue;
    const door = top.clone().setY(0);
    a.play.add({
      id: `valley:enter:${def.id}`,
      at: () => door,
      radius: 3,
      priority: 4,
      label: () => (vnav.mode === 'walk' ? '进去' : ''),
      canUse: () => vnav.mode === 'walk',
      autoUse: false,
      onUse: () => {
        const [x, z] = entryAt(def);
        go(x, z, Math.PI);
      },
    });
    const [ex, ez] = exitAt(def);
    const exitMark = new THREE.Vector3(ex, 0, ez - 1.6);
    a.play.add({
      id: `valley:exit:${def.id}`,
      at: () => exitMark,
      radius: 2.4,
      priority: 4,
      label: '出去',
      autoUse: false,
      onUse: () => go(door.x, door.z + 2, 0),
    });
    // 店里能说话的人 / 能办事的地方（InteriorDef.talk，局部坐标）
    const [ox, oz] = ORIGIN[def.id];
    for (const [k, t] of (def.talk ?? []).entries()) {
      const at = new THREE.Vector3(ox + t.x, 0, oz + t.z);
      a.play.add({
        id: `valley:talk:${def.id}:${k}`,
        at: () => at,
        radius: t.r ?? 1.6,
        priority: 6,
        label: t.label,
        autoUse: false,
        onUse: (play) => play.say(a.director, t.line, 4),
      });
    }
  }
}

// ── 小地图：整座山谷（静的底图画一次，锁的状态变了重画） ──
let mapBg: HTMLCanvasElement | null = null;
function drawMap(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  view: { x0: number; x1: number; z0: number; z1: number },
) {
  const S = Math.min(W / (VIEW.x1 - VIEW.x0), H / (VIEW.z1 - VIEW.z0));
  const ox = (W - (VIEW.x1 - VIEW.x0) * S) / 2;
  const oz = (H - (VIEW.z1 - VIEW.z0) * S) / 2;
  const sx = (x: number) => ox + (x - VIEW.x0) * S;
  const sz = (z: number) => oz + (z - VIEW.z0) * S;
  if (!mapBg || mapBg.width !== W) {
    mapBg = document.createElement('canvas');
    mapBg.width = W;
    mapBg.height = H;
    const b = mapBg.getContext('2d') as CanvasRenderingContext2D;
    b.fillStyle = '#9c6468';
    b.fillRect(0, 0, W, H);
    const path = (pts: readonly V2[]) => {
      b.beginPath();
      pts.forEach(([x, z], i) => {
        if (i) b.lineTo(sx(x), sz(z));
        else b.moveTo(sx(x), sz(z));
      });
    };
    path(FLOOR);
    b.closePath();
    b.fillStyle = '#e8c48a';
    b.fill();
    for (const [i, r] of REGIONS.entries()) {
      if (!locked.has(r.id)) continue;
      b.save();
      path(FLOOR);
      b.closePath();
      b.clip();
      // 排在前面的区域压在它上面（regionAt 取第一个）：那几块挖掉
      b.beginPath();
      b.rect(0, 0, W, H);
      for (const q of REGIONS.slice(0, i))
        for (const [k, [x, z]] of q.poly.entries()) {
          if (k) b.lineTo(sx(x), sz(z));
          else b.moveTo(sx(x), sz(z));
        }
      b.clip('evenodd');
      path(r.poly);
      b.closePath();
      b.fillStyle = 'rgba(44,36,80,0.55)';
      b.fill();
      b.restore();
    }
    b.strokeStyle = '#6a6470';
    b.lineCap = 'round';
    for (const r of ROADS) {
      if (r.kind === 'trail') continue;
      b.lineWidth = r.kind === 'avenue' || r.kind === 'highway' ? 2 : 1;
      path(r.pts);
      b.stroke();
    }
    b.fillStyle = '#c0563f';
    b.fillRect(sx(-64), sz(-43), 124 * S, 95 * S);
  }
  g.drawImage(mapBg, 0, 0);
  for (const c of cars?.where() ?? []) {
    g.fillStyle = c.kind === 'car' ? '#e04040' : '#ffffff';
    g.fillRect(sx(c.x) - 1.5, sz(c.z) - 1.5, 3, 3);
  }
  g.strokeStyle = '#fff3d6';
  g.lineWidth = 1;
  g.strokeRect(sx(view.x0), sz(view.z0), Math.max(2, (view.x1 - view.x0) * S), Math.max(2, (view.z1 - view.z0) * S));
  const d = api?.director.position;
  if (d) {
    g.fillStyle = '#ffd23c';
    g.strokeStyle = '#2c2450';
    g.beginPath();
    g.arc(sx(d.x), sz(d.z), 3.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

// ── 调试面板：区域开关、酒店、传送 ──
const TELEPORTS: { name: string; at: V2 }[] = [
  { name: '俱乐部门口', at: [96, 0] },
  { name: '主街西头（报社）', at: [249, -9] },
  { name: '横街 · 市政厅', at: [274.4, -58] },
  { name: '后街 · 体育店', at: [241, -55] },
  { name: '学校 · 校队球场', at: [358, -37] },
  { name: '五金大超市', at: [555, -50] },
  { name: '日出公园', at: [345, 40] },
  { name: '住宅', at: [300, -140] },
];
function mountDebug() {
  const host = document.getElementById('debug');
  if (!host || !api) return;
  const a = api;
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'px-chip';
  chip.textContent = '调试';
  const list = document.createElement('div');
  list.className = 'px-list dbg';
  list.hidden = true;
  const sync: (() => void)[] = [];
  const section = (t: string) => {
    const h = document.createElement('div');
    h.className = 'dbg-h';
    h.textContent = t;
    list.appendChild(h);
  };
  const btn = (label: () => string, on: () => boolean, click: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    const s = () => {
      b.textContent = label();
      b.setAttribute('aria-pressed', String(on()));
    };
    b.addEventListener('click', () => {
      click();
      for (const f of sync) f();
    });
    sync.push(s);
    s();
    list.appendChild(b);
  };
  const relock = () => {
    for (const id of ALL_REGION_IDS) world?.setLocked(id, locked.has(id));
    cars?.barriers(locked);
    mapBg = null;
  };
  section('区域（事件和人解锁，demo 先手动）');
  for (const r of REGIONS) {
    if (r.open) continue;
    btn(
      () => `${locked.has(r.id) ? '🔒' : '✓'} ${r.name}`,
      () => !locked.has(r.id),
      () => {
        if (locked.has(r.id)) locked.delete(r.id);
        else locked.add(r.id);
        relock();
        if (!locked.has(r.id)) a.play.toast(`${r.name} 开放了 · ${r.who}`, 4);
      },
    );
  }
  btn(
    () => (locked.size ? '全部解锁' : '全部锁上'),
    () => false,
    () => {
      if (locked.size) locked.clear();
      else for (const r of REGIONS) if (!r.open) locked.add(r.id);
      relock();
    },
  );
  section('俱乐部扩张');
  btn(
    () => (vnav.hotel ? '酒店：盖好了' : '酒店：空地'),
    () => vnav.hotel,
    () => {
      vnav.hotel = !vnav.hotel;
      world?.setHotel(vnav.hotel);
      a.refreshBlocked();
    },
  );
  // 俱乐部的一天（clubwalk/sim）：引擎的人换掉场景演出的人，加速看一整天（早上来、打球、午饭、傍晚回家）。
  // 观察时"调试"按钮收起来（hud.ts 的 body.sim-on），面板右上角有"退出"；小地图换成俱乐部那张、上面每个人一个点（walk.ts）
  section('俱乐部的一天');
  btn(
    // sim 在 mountWalk 的最后才建（ready 钩子比它早）：按钮文字先按"没开"
    () => (a.sim?.on ? '观察中 · 重新从 6:30 看' : '观察俱乐部的一天（加速）'),
    () => !!a.sim?.on,
    () => {
      // 总监站到前台柜台后面（朝排队的人：引擎按"总监在前台"跑，看到的是有人守着的那一天），镜头对着前院
      // （柜台、签到的队、大门、停车场来的人）；从 6:30 开始，2×（一天八分钟，走路看得见）；面板收起，画面留给俱乐部。
      // 退出过再进来：接着上回看到的时刻（第 3 轮评审：世界一直在过日子，不从清早重来）；正在观察时点 = 重新从 6:30 看
      const resume = !a.sim.on && a.sim.minute() !== null;
      a.sim.enable(true, { at: resume ? undefined : 6.5 * 60, speed: 2, panel: false, desk: true });
      list.hidden = true;
    },
  );
  btn(
    () => '关掉观察（场景的人回来）',
    () => false,
    () => {
      a.sim?.enable(false);
      list.hidden = true;
    },
  );
  section('传送');
  for (const t of TELEPORTS)
    btn(
      () => t.name,
      () => false,
      () => {
        a.play.teleport(t.at[0], t.at[1]);
        list.hidden = true;
      },
    );
  chip.addEventListener('click', () => {
    list.hidden = !list.hidden;
    // 观察模式可能从它自己的面板"退出"了：按钮文字按现在的状态重写
    for (const f of sync) f();
  });
  host.append(chip, list);
}

start();

// 调试钩子（截图脚本用）
Object.assign(window, {
  __valley: {
    locked,
    vnav,
    get world() {
      return world;
    },
    get cars() {
      return cars;
    },
    /** 投影剔除（shadowcull.ts）开关，对照截图用 */
    get shCull() {
      return shCull;
    },
    near: (x: number, z: number) => ROADS.filter((r) => distToLine(r.pts, x, z) < 30).map((r) => r.name),
    /** 站在车道上（验收：这种点画面大半是沥青，饱和度只记提醒） */
    /** 压紧（relocate.ts）：每个模块真放下去的东西的世界外框 */
    modBounds: () => MOD_BOUNDS,
    onCarriageway: (x: number, z: number) => ROADS.some((r) => r.kind !== 'trail' && distToLine(r.pts, x, z) < r.w / 2),
    /**
     * 验收：路面（车道，不含步道、人行道；两边各收 0.4 米）上离地 0.15～4 米的顶点，按网格名计数（应为 0）。
     * 小镇里（townscale.ts）上限跟着楼缩成 4 × TOWN_K ≈ 2.5 米：伸到路上空的招牌、树冠跟着压低了，还高过球车顶（2.1 米）
     * docs/lab/2026-11-07-3d-pixel/tools/valley-accept.mjs 调它
     */
    onRoad() {
      const hits = new Map<string, number>();
      const v = new THREE.Vector3();
      const M = new THREE.Matrix4();
      const roads = ROADS.filter((r) => r.kind !== 'trail');
      const test = (name: string, x: number, y: number, z: number) => {
        if (y < 0.15 || y > (keepScale(x, z) ? 4 : 4 * TOWN_K)) return;
        for (const r of roads)
          if (distToLine(r.pts, x, z) < r.w / 2 - 0.4) {
            hits.set(`${name} @${r.id}`, (hits.get(`${name} @${r.id}`) ?? 0) + 1);
            return;
          }
      };
      world?.root.updateMatrixWorld(true);
      world?.root.traverse((o) => {
        const m = o as THREE.Mesh;
        const pos = m.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
        if (!pos || !o.visible) return;
        const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
        const n = inst ? inst.count : 1;
        // 大网格只抽样（每 3 个顶点取 1 个）
        const stride = pos.count > 3000 ? 3 : 1;
        for (let k = 0; k < n; k++) {
          if (inst) {
            inst.getMatrixAt(k, M);
            M.premultiply(o.matrixWorld);
          } else M.copy(o.matrixWorld);
          for (let i = 0; i < pos.count; i += inst ? 1 : stride) {
            v.fromBufferAttribute(pos, i).applyMatrix4(M);
            test(o.name || '(无名)', v.x, v.y, v.z);
          }
        }
      });
      return Object.fromEntries([...hits].sort((a, b) => b[1] - a[1]));
    },
  },
});
