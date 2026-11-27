// clubvista：俱乐部拆成四张主题小图（到达 / 中心球场 / 绿洲泳池 / 练习场），每张一两屏大，图和图之间走过去 → 圆形遮罩转场。
// 照《垂钓手记》溪流地图的搭法：边缘最密、中间最空；地形 2～3 层，层间朝镜头的崖是暗带；最大的安静面（球场 / 水）在最低层；
// 主路斜着弯过画面、支路通兴趣点；每张图"入口 → 目的地 → 歇脚"。设计和自评：docs/lab/2026-11-07-3d-pixel/clubvista.md。
// URL：map=<arrive|court|oasis|practice>（开局在哪张图）、at=x,z（本图坐标，开局站哪）、look=x,z（截图：镜头对准这里，配 pause=1）、
//      px、zoom、pause=1、warm=秒、hour、weather、pal（默认 vista = 午后金光 + 冷影；golden / current / …）、ph=0（不放白模）、
//      labels=1（白模标签）、clouds=0、audit=1（能走的范围叠在画面上：绿 = 能走，红 = 挡住）。
// 调试：window.__vista（play、go(图, 入口)、step(秒)、state()）。
import '../clubsite/render/colors';
import * as THREE from 'three';
import { type CastStore, mountCast } from '../clubsite/castui';
import { mountDaylight } from '../clubsite/daylight';
import { createWaySigns, mountPixelHud, type PixelHud, type WaySign } from '../clubsite/hud';
import { type Hud, mountPlay, type Play, type Shape } from '../clubsite/play';
import { snapDelta, ViewLerp } from '../clubsite/play/smooth';
import { SCHEMES, schemeById } from '../clubsite/render/palettes';
import { mountPaletteSwitcher } from '../clubsite/render/palettes/switcher';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N } from '../clubsite/render/toon';
import { type BuiltMap, buildMap, createKit } from './build';
import type { SharedUniforms } from './ctx';
import { vista } from './grade';
import { MAP_GAP, MAPS } from './maps';
import { SPECS } from './placeholders';
import { CAST_SCENE, mapName } from './text';

/**
 * 和别的世界同住一页的钩子（clubgame：这四张图 + clubwalk 的整座俱乐部当"内场"）。都不给 = 只有四张图。
 */
export interface VistaHooks {
  /** 查询串（默认 location.search） */
  params?: URLSearchParams;
  /** false = 这个世界现在不在台上：不走步、不画 */
  active?: () => boolean;
  /** 演员表的状态盒子（两个世界共用一份钱、好感、时钟） */
  castStore?: CastStore;
  /** 出口通到四张图以外（MapDef.exits 的 to 不是这四张，例如 'club' = 内场）：转场、换世界由外面管。不给 = 这种出口不通 */
  outer?(to: string, entry: string): void;
  /** 右下的地图图标（整个游戏的像素小地图，外面给）；不给 = 没有这个图标 */
  mapButton?: { onTap(): void; pressed(): boolean };
}
export type VistaApi = ReturnType<typeof mountVista>;

export function mountVista(hooks: VistaHooks = {}) {
  const params = hooks.params ?? new URLSearchParams(location.search);
  const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : d);
  const pair = (k: string): [number, number] | null => {
    const v = params.get(k);
    if (!v) return null;
    const [a, b] = v.split(',').map(Number);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
  };
  const deg = Math.PI / 180;
  const palId = params.get('pal') ?? 'vista';
  const scheme = palId === 'vista' ? vista : schemeById(palId);
  const PLAY = params.get('play') !== '0';

  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const labelsEl = document.getElementById('labels') as HTMLDivElement;

  const uniforms: SharedUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(num('wind', 0.4)) },
    uGust: { value: 0.5 },
    uClouds: { value: Array.from({ length: CLOUD_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uCloudVel: { value: new THREE.Vector2(0.25, 0) },
    uCloudStrength: { value: num('clouds', 1) },
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a12);

  const MPT = 0.09;
  const PX0 = num('px', 1);
  const zoom = num('zoom', (MPT * PX0) / 2);
  const designTexel = (zoom * 2) / PX0;
  const pipe = new PixelPipeline(canvas, {
    px: PX0,
    fxLayer: 1,
    rig: { target: new THREE.Vector3(14, 0, 30), yaw: 0, pitch: 45 * deg, metersPerTexel: zoom },
    edges: {
      depthStrength: num('dstr', scheme?.edges?.depthStrength ?? 0.48),
      normalStrength: num('nstr', scheme?.edges?.normalStrength ?? 0.6),
      topStrength: num('tstr', scheme?.edges?.topStrength ?? 0.35),
      tint: scheme?.edgeTint,
    },
  });

  // ── 太阳：画面后方偏东（影子落向左下）；阴影相机跟着总监、按阴影纹素对齐（同 clubwalk） ──
  const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
  sun.castShadow = true;
  const SH = 36;
  const SH_MAP = 2048;
  sun.shadow.mapSize.set(SH_MAP, SH_MAP);
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 220 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const SUN = { el: num('sunel', 46), az: num('sunaz', 12) };
  const sunDir = new THREE.Vector3(
    Math.sin(SUN.az * deg) * Math.cos(SUN.el * deg),
    Math.sin(SUN.el * deg),
    -Math.cos(SUN.az * deg) * Math.cos(SUN.el * deg),
  );
  const sunRight = new THREE.Vector3();
  const sunUp = new THREE.Vector3();
  const sunAt = new THREE.Vector2(36, 30);
  function aimSun(dir: THREE.Vector3) {
    sunDir.copy(dir);
    sunRight.crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
    sunUp.crossVectors(sunDir, sunRight).normalize();
    placeSun(sunAt.x, sunAt.y);
  }
  function placeSun(x: number, z: number) {
    sunAt.set(x, z);
    const p = new THREE.Vector3(x, 0, z);
    const texel = (SH * 2) / SH_MAP;
    const a = Math.round(p.dot(sunRight) / texel) * texel;
    const b = Math.round(p.dot(sunUp) / texel) * texel;
    const c = p.dot(sunDir);
    const q = sunRight.clone().multiplyScalar(a).addScaledVector(sunUp, b).addScaledVector(sunDir, c);
    sun.target.position.copy(q);
    sun.position.copy(q).addScaledVector(sunDir, 100);
  }
  aimSun(sunDir.clone());

  // ── 四张图 ──
  const kit = createKit({ uniforms, params, texelMeters: () => pipe.rig.metersPerTexel, designTexel, scheme });
  const built: BuiltMap[] = MAPS.map((def, i) => {
    const b = buildMap(def, i * MAP_GAP, kit, params);
    b.root.visible = false;
    scene.add(b.root);
    return b;
  });
  const byId = (id: string) => built.find((b) => b.def.id === id) as BuiltMap;
  let cur = byId(params.get('map') ?? 'arrive') ?? built[0];
  cur.root.visible = true;

  /** 世界坐标 → 哪张图 */
  /** 四张图叠在一起（MAP_GAP 0）：地面高度、能不能走都问当前这张 */
  const groundAt = (x: number, z: number) => cur.groundAt(x - cur.ox, z);

  // 总监（clubsite/people 的 director；play 管它的姿势和位置）
  const director = kit.makeAsset('director', 0).obj;
  director.name = 'slot:director';
  scene.add(director);

  function setClouds(m: BuiltMap) {
    const cl = m.def.clouds;
    for (let i = 0; i < CLOUD_N; i++) {
      const c = cl[i];
      uniforms.uClouds.value[i].set(c ? c[0] + m.ox : 0, c ? c[1] : 0, c ? c[2] : 0, c ? c[3] : 0);
    }
  }
  setClouds(cur);
  const viewOf = (m: BuiltMap) => {
    const v = m.def.view ?? { x0: 0, x1: m.def.W, z0: 0, z1: m.def.D };
    return { x0: v.x0 + m.ox, x1: v.x1 + m.ox, z0: v.z0, z1: v.z1 };
  };

  const start0 = pair('at') ?? cur.def.start.at;
  /** 导航的坡道表：play 的 NavMap 拿的是这个数组本身，换图时原地换内容再 setBlocked 重建网格 */
  const ramps = [...cur.ramps];
  let play: (Play & { hud: Hud }) | null = null;
  if (PLAY) {
    play = mountPlay({
      scene,
      pipe,
      canvas,
      director,
      start: [start0[0] + cur.ox, start0[1]],
      yaw: cur.def.start.yaw,
      nav: {
        groundAt,
        bounds: { x0: -20, x1: (built.length - 1) * MAP_GAP + 48, z0: -10, z1: 70 },
        surface: (x, z) => cur.surface(x, z),
        blocked: cur.blocked,
        ramps,
        stepUp: 0.32,
      },
      camera: { lead: { portrait: 1.6, landscape: 0.6 }, view: viewOf(cur) },
    });
  } else {
    director.position.set(start0[0] + cur.ox, groundAt(start0[0] + cur.ox, start0[1]), start0[1]);
    pipe.rig.target.set(start0[0] + cur.ox, 0, start0[1]);
  }
  const look = pair('look');
  if (look) pipe.rig.target.set(look[0] + cur.ox, 0, look[1]);

  // ── 转场 ──
  function screenOf(p: THREE.Vector3): { x: number; y: number } {
    if (play) return play.project(p, canvas.clientWidth, canvas.clientHeight);
    return { x: innerWidth / 2, y: innerHeight / 2 };
  }
  const head = new THREE.Vector3();
  /** 像素界面（时间系统建好以后才建）；转场用它的圆形遮罩（clubsite/hud/iris.ts） */
  let hud: PixelHud | null = null;
  let armed = false;
  let moving = false;
  async function go(id: string, entry: string) {
    if (moving) return;
    // 通到四张图以外（内场）：外面管；没人管就当没有这个出口
    if (!built.some((b) => b.def.id === id)) {
      armed = false;
      hooks.outer?.(id, entry);
      return;
    }
    moving = true;
    if (hud)
      await hud.iris.run(async () => {
        swapTo(id, entry);
        // 黑幕上写去哪（到了新地方的交代）
        await blackNote(mapName(id));
      });
    else swapTo(id, entry);
    moving = false;
    announce();
    crowdLabel();
  }
  /** 转场全黑的那一会儿，画面正中写目的地名（0.7 秒） */
  async function blackNote(text: string) {
    const el = document.createElement('div');
    el.className = 'pxh-blacknote';
    Object.assign(el.style, {
      position: 'fixed',
      left: '0',
      right: '0',
      top: '44%',
      textAlign: 'center',
      zIndex: '41',
      pointerEvents: 'none',
      color: '#fff0c4',
      font: '700 17px/1.25 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif',
      letterSpacing: '2px',
    });
    el.textContent = text;
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 700));
    el.remove();
  }
  /** 地点名：像素界面上方淡出的一行（中英文，text.ts） */
  function announce() {
    if (hud) hud.place(mapName(cur.def.id));
    else play?.toast(mapName(cur.def.id), 2.2);
  }
  function swapTo(id: string, entry: string) {
    const to = byId(id);
    const e = to.def.entries[entry] ?? to.def.start;
    cur.root.visible = false;
    cur = to;
    cur.root.visible = true;
    setClouds(cur);
    applyZoom();
    syncLamps();
    const wx = e.at[0] + cur.ox;
    const wz = e.at[1];
    if (play) {
      ramps.splice(0, ramps.length, ...cur.ramps);
      play.nav.setBlocked(cur.blocked as Shape[]);
      play.setView(viewOf(cur));
      play.teleport(wx, wz, e.yaw);
    } else {
      director.position.set(wx, groundAt(wx, wz), wz);
      pipe.rig.target.set(wx, 0, wz);
    }
    placeSun(wx, wz);
    armed = false;
  }
  // 出口的小路牌（clubsite/hud/waysign.ts）：离出口 9 米以内，在出口那个方向的屏幕边上写"目的地 + 箭头"；走开、换图就没有
  const ways = params.get('ui') !== '0' ? createWaySigns() : null;
  const WAY_R = 9;
  const wayAt = new THREE.Vector3();
  function placeWays() {
    if (!ways) return;
    const list: WaySign[] = [];
    if (play && !moving) {
      const s = play.state();
      for (const ex of cur.def.exits) {
        if (ex.to === 'club' ? !hooks.outer : !built.some((b) => b.def.id === ex.to)) continue;
        const wx = ex.at[0] + cur.ox;
        if (Math.hypot(s.x - wx, s.z - ex.at[1]) > ex.r + WAY_R) continue;
        const h = cur.groundAt(ex.at[0], ex.at[1]);
        wayAt.set(wx, Number.isFinite(h) ? h : s.y, ex.at[1]);
        const p = screenOf(wayAt);
        list.push({ x: p.x, y: p.y, text: mapName(ex.to) });
      }
    }
    ways.set(list);
  }
  function checkExits() {
    if (moving || !play) return;
    const s = play.state();
    const lx = s.x - cur.ox;
    const lz = s.z;
    let near = false;
    for (const ex of cur.def.exits) {
      const d = Math.hypot(lx - ex.at[0], lz - ex.at[1]);
      if (d < ex.r) {
        near = true;
        if (armed) {
          void go(ex.to, ex.entry);
          return;
        }
      } else if (d < ex.r + 1.5) near = true;
    }
    if (!near) armed = true;
  }

  // ── 白模标签（?labels=1） ──
  const labels: { el: HTMLDivElement; p: THREE.Vector3; m: BuiltMap }[] = [];
  if (params.get('labels') === '1')
    for (const b of built)
      for (const pl of b.placed) {
        if (pl.kind !== 'placeholder') continue;
        const el = document.createElement('div');
        el.className = 'lab placeholder';
        el.textContent = SPECS[pl.prop.a]?.name ?? pl.prop.a;
        labelsEl.appendChild(el);
        const h = SPECS[pl.prop.a]?.h ?? 1;
        labels.push({
          el,
          p: pl.obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, h + 0.3, 0)),
          m: b,
        });
      }
  function placeLabels() {
    if (!labels.length) return;
    for (const l of labels) {
      l.el.style.display = l.m === cur ? '' : 'none';
      if (l.m !== cur) continue;
      const s = screenOf(l.p);
      l.el.style.transform = `translate(${s.x.toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -100%)`;
    }
  }

  // ── 能走的范围（?audit=1）：每 0.5 米一个点，绿 = 能站，红 = 不能（高差 / 挡路 / noWalk） ──
  if (params.get('audit') === '1' && play) {
    const nav = play.nav;
    for (const b of [cur]) {
      const pos: number[] = [];
      const col: number[] = [];
      for (let z = -4; z <= b.def.D + 2; z += 0.5)
        for (let x = -16; x <= b.def.W + 16; x += 0.5) {
          const wx = x + b.ox;
          const h = nav.clearAt(wx, z);
          const ok = h !== null && !nav.hitsBlocked(wx, z, nav.body - 0.03);
          pos.push(x, (h ?? b.groundAt(x, z)) + 0.06, z);
          col.push(ok ? 0.2 : 1, ok ? 1 : 0.15, ok ? 0.3 : 0.2);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const pts = new THREE.Points(
        g,
        new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }),
      );
      pts.renderOrder = 10;
      b.root.add(pts);
    }
  }

  /** 竖屏按图拉远（MapDef.portraitZoom，?pz= 覆盖）：中心球场竖屏要放得下真尺寸的场 + 两边一截看台；横屏一律 1× */
  function applyZoom() {
    const portrait = canvas.clientWidth < canvas.clientHeight;
    const k = portrait ? num('pz', cur.def.portraitZoom ?? 1) : 1;
    pipe.rig.metersPerTexel = zoom * k;
    play?.setView(viewOf(cur));
  }
  function resize() {
    pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
    applyZoom();
  }
  addEventListener('resize', resize);
  resize();

  const pxEl = document.getElementById('pxsel');
  const palEl = document.getElementById('palsel');
  if (palEl) mountPaletteSwitcher(palEl, [vista, ...SCHEMES], scheme?.id ?? 'current');
  void pxEl;
  const day = mountDaylight({
    scene,
    pipe,
    sun,
    uniforms,
    params,
    scheme,
    hud: null,
    panelOnly: true,
    placeSun: aimSun,
  });

  // ── 人物（clubsite/castui，和 clubwalk 同一套）：摆在图上的人对上演员表，点人 → 上方一行字 → 底部半屏人物卡；右下名册 ──
  // 一张图算演员表里的一个场景（CAST_SCENE：到达 = 前台、中心球场、歇脚 = 泳池、练习场 = 会员场），只认当前这张图上的人
  const lives = built.map((b) => ({
    def: { id: CAST_SCENE[b.def.id] ?? b.def.id, name: b.def.name },
    root: b.root,
    region: b,
    get visible() {
      return b === cur;
    },
  }));
  const cast =
    play && params.get('cast') !== '0'
      ? mountCast({
          scene,
          lives,
          play,
          director,
          params,
          quiet: true,
          peek: (p) => hud?.peek(p),
          focus: (a, dy) => hud?.focus(a, dy),
          mats: kit.mats,
          scheme: scheme ?? undefined,
          store: hooks.castStore,
        })
      : null;

  // ── 像素界面（clubsite/hud，和 clubwalk 同一套）：左上日钟、右上金币、右下图标、心情泡、圆形转场；调试牌 ?debug=1 ──
  if (play && params.get('ui') !== '0') {
    hud = mountPixelHud({
      play,
      canvas,
      day,
      params,
      money: cast ? () => cast.money() : undefined,
      who: cast ? (a) => cast.whoOf(a) : undefined,
      buttons: [
        ...(hooks.mapButton ? [{ id: 'map', icon: 'map' as const, label: 'map' as const, ...hooks.mapButton }] : []),
        ...(cast
          ? [{ id: 'roster', icon: 'roster' as const, label: 'roster' as const, onTap: () => cast.openRoster() }]
          : []),
      ],
    });
  }
  /**
   * 夜里的灯只认当前这张图的：四张图叠在同一块坐标上，daylight 的 rescan 会把隐藏的图的灯（中心球场的灯杆）也找进来，
   * 别的图上就平白多出几个灯光圈。隐藏的图把 userData.night 挪到 _night 里藏着，换图时换回来。
   */
  function syncLamps() {
    for (const b of built)
      b.root.traverse((o) => {
        const u = o.userData;
        if (b === cur && u._night && !u.night) {
          u.night = u._night;
          delete u._night;
        } else if (b !== cur && u.night) {
          u.night.setOn?.(false);
          u._night = u.night;
          delete u.night;
        }
      });
    day.rescanLamps();
  }
  syncLamps();

  // ── 观众（中心球场）：右上角一个按钮切换坐满 / 空场（?crowd=empty 开局空场）；__vista.crowd(f) 同 ──
  function crowd(f?: number) {
    const st: { setFill: (f: number) => void; crowd: { fill: number } }[] = [];
    cur.root.traverse((o) => {
      if (o.userData.setFill) st.push(o.userData as never);
    });
    if (!st.length) return null;
    const next = f ?? (st[0].crowd.fill > 0.5 ? 0 : 1);
    for (const s of st) s.setFill(next);
    return next;
  }
  const crowdBtn = document.createElement('button');
  crowdBtn.className = 'crowd-btn';
  Object.assign(crowdBtn.style, {
    position: 'fixed',
    right: '12px',
    bottom: 'max(84px, calc(env(safe-area-inset-bottom) + 76px))',
    minWidth: '44px',
    minHeight: '44px',
    padding: '0 12px',
    font: '600 13px system-ui, sans-serif',
    color: '#fff6e6',
    background: '#2c2848',
    border: '2px solid #fff6e6',
    borderRadius: '8px',
    zIndex: '20',
  });
  const crowdLabel = () => {
    let full = false;
    let any = false;
    cur.root.traverse((o) => {
      if (o.userData.setFill) {
        any = true;
        full = o.userData.crowd.fill > 0.5;
      }
    });
    // 调试用的开关：只在调试里（?debug=1 / 连点日钟 5 下）
    crowdBtn.style.display = any && document.body.classList.contains('pxh-debug') ? '' : 'none';
    crowdBtn.textContent = full ? '观众 满' : '观众 空';
  };
  crowdBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    crowd();
    crowdLabel();
  });
  document.body.appendChild(crowdBtn);
  crowdLabel();
  setInterval(crowdLabel, 500);

  const DT = 1 / 60;
  let simT = 0;
  function step(seconds: number) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      simT += DT;
      uniforms.uTime.value = simT;
      day.step(DT);
      uniforms.uGust.value = 0.5 + 0.35 * Math.sin(simT * 0.7) * Math.sin(simT * 0.23);
      for (const u of cur.updaters) u(DT, simT);
      play?.update(DT, simT);
      cast?.step(DT);
      checkExits();
      if (play) {
        const s = play.state();
        if (Math.hypot(s.x - sunAt.x, s.z - sunAt.y) > 6) placeSun(s.x, s.z);
      }
    }
  }
  step(num('warm', 0));
  if (look) pipe.rig.target.set(look[0] + cur.ox, 0, look[1]);
  if (play) {
    const s = play.state();
    placeSun(s.x, s.z);
  }
  if (look) placeSun(look[0] + cur.ox, look[1]);

  const paused = params.get('pause') === '1';
  let last = performance.now();
  let acc = 0;
  let lerp: ViewLerp | null = null;
  function frame(now: number) {
    if (hooks.active && !hooks.active()) {
      last = now;
      requestAnimationFrame(frame);
      return;
    }
    acc += snapDelta(Math.min(0.1, (now - last) / 1000));
    last = now;
    if (play && !lerp) lerp = new ViewLerp(play.director, pipe.rig, scene);
    if (!paused) {
      while (acc >= DT) {
        lerp?.mark();
        step(DT);
        acc -= DT;
      }
      lerp?.begin(acc / DT);
    }
    day.frame();
    pipe.render(scene);
    placeLabels();
    play?.hud.frame();
    cast?.frame();
    hud?.frame();
    placeWays();
    lerp?.end();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (hud) setTimeout(announce, 600);

  Object.assign(window, {
    __vista: {
      scene,
      pipe,
      play,
      built,
      go,
      step,
      cur: () => cur.def.id,
      crowd,
      state: () => (play ? { ...play.state(), map: cur.def.id, lx: play.state().x - cur.ox } : null),
    },
  });

  return {
    scene,
    pipe,
    play,
    director,
    day,
    cast,
    get hud() {
      return hud;
    },
    step,
    /** 现在在哪张图 */
    cur: () => cur.def.id,
    /** 不带转场直接换到某张图的某个入口（外面的转场黑屏那一刻调） */
    enter(id: string, entry: string) {
      swapTo(id, entry);
      crowdLabel();
    },
    announce,
    /** 总监的头在屏幕上哪（转场的圆心） */
    headOnScreen: () => screenOf(head.copy(director.position).setY(director.position.y + 1)),
  };
}
