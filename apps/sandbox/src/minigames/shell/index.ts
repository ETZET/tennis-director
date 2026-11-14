// ════════════════════════════════════════════════════════════════════════════════════════
// 小游戏壳（minigames/shell）：一个俱乐部场景（clubsite/region.ts 的 Region）+ 总监操控（clubsite/play）+ 时间天气
// （clubsite/daylight）+ 一局小游戏的流程（开局卡 → 计时玩 → 结算卡），一次写好，每个小游戏只写自己的玩法。
// ════════════════════════════════════════════════════════════════════════════════════════
//
// 加一个小游戏（只加文件，不改任何共用文件）：
//   1) apps/sandbox/mg-<id>.html                —— 照抄 mg-ballpickup.html，改 <title> 和 script 的路径
//                                                  （vite.config.ts 自动收所有 mg-*.html，不用登记）
//   2) apps/sandbox/src/minigames/<id>/main.ts —— 第一行照各场景的 main：import colors（关颜色管理，必须最先跑）：
//
//   import '../../clubsite/render/colors';
//   import { CLOUDS } from '../../clubstadium/layout';
//   import { createStadiumRegion } from '../../clubstadium/scene';
//   import { mountMinigame } from '../shell';
//
//   mountMinigame({
//     id: 'blower',                         // 和文件名一致（最高分存档的键、hub 的链接）
//     title: '吹叶清场', tag: '小游戏 2 · 中心球场',
//     goal: '比赛开始前把场上的落叶吹出界。',
//     howto: ['拖动走路', '按住"吹"朝着叶子吹', '吹出边线才算'],
//     region: createStadiumRegion,          // (host) => Region：场景模块原样建（像独立页面一样）
//     clouds: CLOUDS,                       // 场景 layout.ts 手摆的云影（不给 = 没云影）
//     life: false,                          // 场景的日常演出（life.ts）开不开（默认关：场上没人乱跑）
//     hour: 9, weather: 'clear',            // 固定时刻、天气（URL 的 ?hour= / ?weather= 优先）；时间默认不走（tspeed 0）
//     start: { start: [x, z], yaw: 0 },     // 总监开局站哪（不给 = 场景的 region.start）
//     camera: { dead: [1.2, 2] },           // 相机（合并到 region.start.camera 上）
//     duration: 90,                         // 一局几秒（null = 不计时，自己 mg.finish()）
//     stars: [300, 600, 900],               // 一 / 二 / 三星的分数线
//     setup(mg) {                           // 场景建好、总监就位以后调一次；返回这个小游戏的回调
//       const leaves = …;                   // 在 mg.scene 里摆东西、play.add 互动点、play.addItem 工具
//       return {
//         reset() { … },                    // 每局开始前（第一局、"再来一局"）：把场面摆回开局
//         start() { … },                    // 点了"开始"（计时开始）
//         step(dt, t) { … },                // 玩的时候每个模拟步（1/60 秒）；得分 mg.addScore(10, 世界点)
//         frame() { … },                    // 每帧（渲染后，任何状态）
//         finish(reason) {                  // 结束（时间到 / mg.finish('清场！')）：结算卡的明细和奖励分
//           return { lines: [{ label: '吹走', value: 12 }], bonus: [{ label: '清场奖励', value: 100 }] };
//         },
//         debug: () => ({ left: leaves.length }),   // 进 window.__mg.state()
//       };
//     },
//   });
//
// mg（setup 拿到的）：
//   mg.scene / mg.region（场景模块，类型就是 region 工厂的返回）/ mg.play（clubsite/play：add、addItem、give、busy、say、toast…）
//   mg.pipe / mg.uniforms / mg.params / mg.day（时间天气）/ mg.ctx（俱乐部底表的资产上下文：建 clubsite 的人、球、球车）
//   mg.t（模拟时间）、mg.state（'intro' | 'playing' | 'result'）、mg.round（第几局，1 起）、mg.elapsed（这局玩了几秒）、mg.timeLeft
//   mg.rng(key)                    种子随机流（?seed=，默认 1；同 key 同数列。想每局不一样就把 mg.round 放进 key）
//   mg.addScore(n, at?, opts?)     加分（at = 世界点 / [x, z]：在那里飘 "+n"）；mg.score 读分
//   mg.comboHit() → n              连击 +1（comboWindow 秒内连着来；HUD 显示 ×n）；mg.comboBreak()；mg.combo.value
//   mg.setLives(n, max) / mg.setLives(null)      顶栏的 ♥
//   mg.stat(key, label, value, tone?)            顶栏加一格（value null = 去掉；tone 'warn' | 'good'）
//   mg.pop(at, text, { color: 'gold' | 'green' | 'red' | 'cream' | css, big })   世界点上飘字
//   mg.toast(text, sec = 1.6, big = false)       画面上方一行横幅
//   mg.marker(id, at, { label, color })          世界点（或 () => 点 | null）头上跳的箭头；在画面外就贴边指向它。返回移除函数
//   mg.ring(x, z, r, color?) → Mesh              地上一个圈（FX 层），自己 removeFromParent()
//   mg.groundAt(x, z)、mg.project(世界点) → 屏幕 CSS 坐标
//   mg.onStep((dt, t) => …)、mg.onFrame(() => …)  任何状态都跑的钩子（场景的小动画）；返回移除函数
//   mg.start()、mg.finish(reason?)、mg.again()、mg.addTime(秒)
// play 的用法见 clubsite/play/index.ts 顶上（互动点 play.add、手里的东西 play.addItem、play.busy、play.say……）。
//
// URL：?hour= ?weather= ?tspeed=（时间天气，默认用小游戏给的、时间不走）· ?seed= · ?pal= · ?px= · ?pause=1 · ?warm=秒
//      ?auto=1（跳过开局卡直接开始，截图用）
// 无头驱动（截图、测试）：window.__mg
//   __mg.ready（第一帧画完 = true）、__mg.state()（状态、分、剩余时间、总监位置 + 小游戏的 debug()）
//   __mg.start()、__mg.finish(reason?)、__mg.again()、__mg.step(秒)（同步跑这么多个 1/60 步，不等 rAF）
//   __mg.play（setStick / tapWorld / setUse / pick …）、__mg.mg（整个 mg）
// 不改场景的行为：场景模块原样建（同独立页面），壳只在外面加东西。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { rngOf } from '../../clubsite/cast/rng';
import { type Daylight, mountDaylight, type Weather } from '../../clubsite/daylight';
import { director as buildDirector } from '../../clubsite/people';
import { type CameraOpts, type Hud, mountPlay, type Play } from '../../clubsite/play';
import { snapDelta, ViewLerp } from '../../clubsite/play/smooth';
import type { Region, RegionHost, RegionJobs, RegionNav, RegionStart } from '../../clubsite/region';
import type { AssetCtx, BaseCtx, SharedUniforms } from '../../clubsite/render/ctx';
import { schemeById } from '../../clubsite/render/palettes';
import { PixelPipeline } from '../../clubsite/render/pipeline';
import { CLOUD_N } from '../../clubsite/render/toon';
import { Combo, clockOf, loadBest, saveBest, starsFor } from './score';
import { createUi, type Line, type MarkerOpts, type PopOpts } from './ui';
import { clubCtx, groundRing } from './world';

export type { Rng } from '../../clubsite/cast/rng';
export { chance, int, pick, range, rngOf } from '../../clubsite/cast/rng';
export { Combo, clockOf, loadBest, saveBest, starsFor } from './score';
export type { Line, MarkerOpts, PopOpts } from './ui';
export { clubCtx, groundRing } from './world';

export type MgState = 'intro' | 'playing' | 'result';

/** 结算卡：明细（只显示）+ 奖励（加进总分，也显示） */
export interface FinishInfo {
  lines?: Line[];
  bonus?: { label: string; value: number }[];
}

/** 小游戏自己的回调（setup 的返回） */
export interface GameDef {
  /** 每局开始前（第一局、"再来一局"）：把场面摆回开局。总监已经被放回 start */
  reset(): void;
  /** 计时开始那一刻 */
  start?(): void;
  /** 玩的时候每个模拟步（1/60 秒） */
  step?(dt: number, t: number): void;
  /** 每帧（渲染后，任何状态） */
  frame?(): void;
  /** 结束：reason = mg.finish 给的（时间到 = '时间到！'） */
  finish?(reason: string): FinishInfo | undefined;
  /** 调试：进 __mg.state() */
  debug?(): Record<string, unknown>;
}

export interface MinigameOpts<R extends Region> {
  /** 小游戏 id（= mg-<id>.html、src/minigames/<id>/；最高分存档的键） */
  id: string;
  title: string;
  /** 标题上面的小字（"小游戏 1 · 会员场"） */
  tag?: string;
  /** 一句话目标 */
  goal: string;
  /** 怎么玩（2～4 条，短） */
  howto: string[];
  /** 场景模块：create<场景>Region */
  region: (host: RegionHost) => R;
  /** 场景的日常演出（默认 false） */
  life?: boolean;
  /** 调 region.attach(play)（场景登记的总监的活：工具、互动点）；默认 = life */
  attach?: boolean;
  /** 左下角的操作提示：false = 不要（默认），字符串 = 换成这句 */
  hint?: string | false;
  /** 开局时刻（小时）、天气、时间流速（游戏秒 / 真实秒，默认 0 = 不走）；URL 的 hour / weather / tspeed 优先 */
  hour?: number;
  weather?: Weather;
  timeSpeed?: number;
  /** 左上角时间面板（默认不要） */
  dayHud?: boolean;
  /** 云影（场景 layout.ts 的 CLOUDS） */
  clouds?: readonly (readonly [number, number, number, number])[];
  /** 没有配色方案时（?pal=current）的天色 */
  sky?: { top: number; horizon: number };
  /** 覆盖 region.start 的字段（start、yaw、camera） */
  start?: Partial<RegionStart>;
  /** 相机（合并到 region.start.camera 上；dead 死区、lead、view、zoom） */
  camera?: CameraOpts;
  /** 改导航（裁到画到的范围、加挡路的） */
  nav?: (nav: RegionNav) => RegionNav;
  /** 拉近 / 拉远：米/纹素的倍数（默认 1；0.8 = 拉近两成） */
  zoom?: number;
  /** 一局几秒（默认 90；null = 不计时） */
  duration?: number | null;
  /** 最后几秒倒计时变红（默认 10） */
  lowTime?: number;
  /** 一 / 二 / 三星的分数线 */
  stars: [number, number, number];
  /** 顶栏分数那格的字（默认"得分"） */
  scoreLabel?: string;
  /** 连击的时间窗（秒，默认 1.5） */
  comboWindow?: number;
  setup(mg: Minigame<R>): GameDef;
}

export interface Minigame<R extends Region = Region> {
  readonly id: string;
  readonly scene: THREE.Scene;
  readonly region: R;
  readonly play: Play & { hud: Hud };
  readonly pipe: PixelPipeline;
  readonly uniforms: SharedUniforms;
  readonly params: URLSearchParams;
  readonly day: Daylight;
  readonly sun: THREE.DirectionalLight;
  /** 俱乐部底表的资产上下文（clubsite 的资产都能拿它建） */
  readonly ctx: AssetCtx;
  /** 场景登记的活（attach 开了才有） */
  readonly jobs: RegionJobs | null;
  readonly start0: RegionStart;
  readonly t: number;
  readonly state: MgState;
  readonly round: number;
  readonly elapsed: number;
  readonly timeLeft: number;
  readonly score: number;
  readonly combo: Combo;
  rng(key: string): () => number;
  groundAt(x: number, z: number): number;
  addScore(n: number, at?: THREE.Vector3 | readonly [number, number] | null, opts?: PopOpts & { text?: string }): void;
  setScore(n: number): void;
  comboHit(): number;
  comboBreak(): void;
  setLives(n: number | null, max?: number): void;
  stat(key: string, label: string, value: string | number | null, tone?: 'warn' | 'good' | null): void;
  pop(at: THREE.Vector3 | readonly [number, number], text: string, opts?: PopOpts): void;
  toast(text: string, sec?: number, big?: boolean): void;
  marker(id: string, at: THREE.Vector3 | (() => THREE.Vector3 | null), opts?: MarkerOpts): () => void;
  ring(x: number, z: number, r: number, color?: number | string): THREE.Mesh;
  project(p: THREE.Vector3): { x: number; y: number };
  onStep(fn: (dt: number, t: number) => void): () => void;
  onFrame(fn: () => void): () => void;
  start(): void;
  finish(reason?: string): void;
  again(): void;
  addTime(sec: number): void;
}

const DT = 1 / 60;
const MPT = 0.09;
const deg = Math.PI / 180;

export function mountMinigame<R extends Region>(o: MinigameOpts<R>): Minigame<R> {
  // ── URL：小游戏给的时刻 / 天气 / 时间流速当默认值，URL 里有就用 URL 的 ──
  const params = new URLSearchParams(location.search);
  if (!params.has('hour') && o.hour !== undefined) params.set('hour', String(o.hour));
  if (!params.has('weather') && o.weather) params.set('weather', o.weather);
  if (!params.has('tspeed')) params.set('tspeed', String(o.timeSpeed ?? 0));
  const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : d);
  const scheme = schemeById(params.get('pal'));
  const seed = num('seed', 1);
  document.body.classList.add('mg-on');
  if (o.hint === false || o.hint === undefined) document.body.classList.add('mg-nohint');

  const ui = createUi({
    title: o.title,
    tag: o.tag ?? '小游戏',
    goal: o.goal,
    howto: o.howto,
    scoreLabel: o.scoreLabel ?? '得分',
    hubHref: './minigames.html',
    onStart: () => api.start(),
    onAgain: () => api.again(),
  });

  const canvas =
    (document.getElementById('c') as HTMLCanvasElement | null) ??
    document.body.insertBefore(document.createElement('canvas'), document.body.firstChild);
  canvas.id = 'c';
  canvas.classList.add('mg-canvas');

  // ── 共用的 uniform ──
  const clouds = o.clouds ?? [];
  const uniforms: SharedUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(num('wind', 0.4)) },
    uGust: { value: 0.5 },
    uClouds: {
      value: Array.from({ length: CLOUD_N }, (_, i) => new THREE.Vector4(...(clouds[i] ?? [0, 0, 0, 0]))),
    },
    uCloudVel: { value: new THREE.Vector2(0.12, 0) },
    uCloudStrength: { value: num('clouds', clouds.length ? 1 : 0) },
  };

  // ── 管线：同各场景的独立页面（默认 1× 像素、俯角 45°、yaw 0） ──
  const scene = new THREE.Scene();
  const PX0 = num('px', 1);
  const pipe = new PixelPipeline(canvas, {
    px: PX0,
    fxLayer: 1,
    rig: {
      target: new THREE.Vector3(0, 0, 0),
      yaw: 0,
      pitch: 45 * deg,
      metersPerTexel: ((MPT * PX0) / 2) * (o.zoom ?? 1),
    },
    edges: {
      depthStrength: scheme?.edges?.depthStrength ?? 0.48,
      normalStrength: scheme?.edges?.normalStrength ?? 0.6,
      topStrength: scheme?.edges?.topStrength ?? 0.35,
      tint: scheme?.edgeTint,
    },
  });
  const texelMeters = () => pipe.rig.metersPerTexel;

  // ── 太阳：阴影相机跟着镜头走、按阴影纹素对齐（同 clubwalk：任何场景都罩得住，走路时影子边不闪） ──
  const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
  sun.castShadow = true;
  const SH = 34;
  const SH_MAP = 2048;
  sun.shadow.mapSize.set(SH_MAP, SH_MAP);
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 200 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(
    Math.sin(8 * deg) * Math.cos(44 * deg),
    Math.sin(44 * deg),
    -Math.cos(8 * deg) * Math.cos(44 * deg),
  );
  const sunRight = new THREE.Vector3();
  const sunUp = new THREE.Vector3();
  const sunAt = new THREE.Vector2(0, 0);
  const placeSun = (x: number, z: number) => {
    sunAt.set(x, z);
    sunRight.crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
    sunUp.crossVectors(sunDir, sunRight).normalize();
    const p = new THREE.Vector3(x, 0, z);
    const texel = (SH * 2) / SH_MAP;
    const a = Math.round(p.dot(sunRight) / texel) * texel;
    const b = Math.round(p.dot(sunUp) / texel) * texel;
    const q = sunRight.clone().multiplyScalar(a).addScaledVector(sunUp, b).addScaledVector(sunDir, p.dot(sunDir));
    sun.target.position.copy(q);
    sun.position.copy(q).addScaledVector(sunDir, 90);
  };
  const aimSun = (dir: THREE.Vector3) => {
    if (dir.equals(sunDir)) return;
    sunDir.copy(dir);
    placeSun(sunAt.x, sunAt.y);
  };

  // ── 场景模块（同独立页面：东西直接加进 scene） ──
  const LIFE = o.life ?? false;
  const host: RegionHost = {
    scene,
    parent: scene,
    uniforms,
    params,
    texelMeters,
    designTexel: MPT,
    life: LIFE,
    play: true,
  };
  const region = o.region(host);
  const ctx = clubCtx(uniforms, params, texelMeters, MPT);

  // 总监：场景摆的那个；场景不建（pool / golf / house）就用俱乐部底表建一个
  let director = region.director();
  if (!director) {
    director = buildDirector(ctx as unknown as BaseCtx);
    director.name = 'slot:director';
    scene.add(director);
  }
  director.userData.setProp?.(null);
  const st0: RegionStart = {
    ...region.start,
    ...o.start,
    camera: { ...region.start.camera, ...o.start?.camera, ...o.camera },
  };
  const nav0 = region.nav();
  const nav = o.nav ? o.nav(nav0) : nav0;
  const play = mountPlay({
    scene,
    pipe,
    canvas,
    director,
    start: st0.start,
    yaw: st0.yaw,
    nav: { groundAt: region.groundAt, ...nav },
    camera: st0.camera,
    hint: typeof o.hint === 'string' ? o.hint : ' ',
  });
  const jobs = (o.attach ?? LIFE) ? region.attach(play) : null;
  play.director.updateMatrixWorld(true);
  placeSun(pipe.rig.target.x, pipe.rig.target.z);

  // 时间和天气（时间面板默认不要）
  const dayHud = o.dayHud ? document.body.appendChild(document.createElement('div')) : null;
  if (dayHud) dayHud.className = 'mg-dayhud';
  const day = mountDaylight({ scene, pipe, sun, uniforms, params, scheme, sky: o.sky, placeSun: aimSun, hud: dayHud });

  // ── 一局的状态 ──
  let simT = 0;
  let state: MgState = 'intro';
  let round = 1;
  let elapsed = 0;
  const DURATION = o.duration === undefined ? 90 : o.duration;
  let timeLeft = DURATION ?? 0;
  let score = 0;
  const combo = new Combo(o.comboWindow ?? 1.5);
  let lives: { n: number; max: number } | null = null;
  const stepHooks = new Set<(dt: number, t: number) => void>();
  const frameHooks = new Set<() => void>();
  const v3 = new THREE.Vector3();
  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;
  const toV3 = (at: THREE.Vector3 | readonly [number, number]): THREE.Vector3 =>
    (at as THREE.Vector3).isVector3
      ? (at as THREE.Vector3)
      : new THREE.Vector3(
          (at as readonly number[])[0],
          region.groundAt((at as readonly number[])[0], (at as readonly number[])[1]) + 0.8,
          (at as readonly number[])[1],
        );

  let game: GameDef = { reset() {} };
  const setPaused = (on: boolean) => {
    document.body.classList.toggle('mg-paused', on);
    if (on) {
      play.setStick(0, 0);
      play.setUse(false);
    }
  };

  const api: Minigame<R> = {
    id: o.id,
    scene,
    region,
    play,
    pipe,
    uniforms,
    params,
    day,
    sun,
    ctx,
    jobs,
    start0: st0,
    get t() {
      return simT;
    },
    get state() {
      return state;
    },
    get round() {
      return round;
    },
    get elapsed() {
      return elapsed;
    },
    get timeLeft() {
      return timeLeft;
    },
    get score() {
      return score;
    },
    combo,
    rng: (key) => rngOf(seed, o.id, key),
    groundAt: (x, z) => play.nav.height(x, z) ?? region.groundAt(x, z),
    addScore(n, at, po) {
      score = Math.max(0, Math.round(score + n));
      if (at) api.pop(at, po?.text ?? `${n >= 0 ? '+' : ''}${n}`, { color: n < 0 ? 'red' : undefined, ...po });
    },
    setScore(n) {
      score = Math.max(0, Math.round(n));
    },
    comboHit() {
      return combo.hit(simT);
    },
    comboBreak() {
      combo.reset();
    },
    setLives(n, max) {
      lives = n === null ? null : { n, max: max ?? lives?.max ?? n };
    },
    stat: (key, label, value, tone) => ui.stat(key, label, value, tone),
    pop: (at, text, po) => ui.pop(toV3(at), text, simT, po),
    toast: (text, sec = 1.6, big = false) => ui.toast(text, simT + sec, big),
    marker(id, at, mo) {
      const fn = typeof at === 'function' ? at : () => at;
      return ui.marker(id, fn, mo);
    },
    ring(x, z, r, color) {
      const m = groundRing(r, color);
      m.position.set(x, api.groundAt(x, z) + 0.03, z);
      scene.add(m);
      return m;
    },
    project: (p) => play.project(p, W(), H()),
    onStep(fn) {
      stepHooks.add(fn);
      return () => stepHooks.delete(fn);
    },
    onFrame(fn) {
      frameHooks.add(fn);
      return () => frameHooks.delete(fn);
    },
    start() {
      if (state === 'playing') return;
      state = 'playing';
      elapsed = 0;
      timeLeft = DURATION ?? 0;
      score = 0;
      combo.reset();
      setPaused(false);
      ui.showPlaying();
      game.start?.();
      api.toast('开始！', 1.0, true);
    },
    finish(reason = '时间到！') {
      if (state !== 'playing') return;
      state = 'result';
      setPaused(true);
      const info = game.finish?.(reason) ?? {};
      for (const b of info.bonus ?? []) score += Math.round(b.value);
      const lines: Line[] = [
        ...(info.lines ?? []),
        ...(info.bonus ?? []).map((b) => ({ label: b.label, value: `+${Math.round(b.value)}` })),
      ];
      const stars = starsFor(score, o.stars);
      const before = loadBest(o.id);
      const record = saveBest(o.id, score, stars) && score > 0;
      ui.showResult({ reason, score, stars, lines, best: before?.score ?? null, record });
    },
    again() {
      round++;
      state = 'intro';
      resetRound();
      api.start();
    },
    addTime(sec) {
      timeLeft += sec;
    },
  };

  const resetRound = () => {
    ui.clearPops();
    combo.reset();
    score = 0;
    elapsed = 0;
    timeLeft = DURATION ?? 0;
    play.setStick(0, 0);
    play.setUse(false);
    play.teleport(st0.start[0], st0.start[1], st0.yaw);
    game.reset();
  };

  // ── 固定步长 ──
  function step(seconds: number) {
    const n = Math.max(0, Math.round(seconds / DT));
    for (let i = 0; i < n; i++) {
      simT += DT;
      uniforms.uTime.value = simT;
      day.step(DT);
      uniforms.uGust.value = 0.5 + 0.35 * Math.sin(simT * 0.7) * Math.sin(simT * 0.23);
      region.update(DT, simT);
      play.update(DT, simT);
      jobs?.step(DT);
      region.post?.(DT, simT);
      const cam = pipe.rig.target;
      if (Math.hypot(cam.x - sunAt.x, cam.z - sunAt.y) > 1) placeSun(cam.x, cam.z);
      for (const f of stepHooks) f(DT, simT);
      if (state === 'playing') {
        elapsed += DT;
        game.step?.(DT, simT);
        if (DURATION !== null && state === 'playing') {
          timeLeft -= DT;
          if (timeLeft <= 0) {
            timeLeft = 0;
            api.finish('时间到！');
          }
        }
      }
    }
  }

  function syncHud() {
    ui.setScore(score);
    ui.setTime(DURATION === null ? null : clockOf(timeLeft), DURATION !== null && timeLeft <= (o.lowTime ?? 10));
    ui.setCombo(combo.alive(simT) ? combo.value : 0);
    ui.setLives(lives ? lives.n : null, lives?.max ?? 0);
  }

  function resize() {
    pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
  }
  addEventListener('resize', resize);
  resize();

  game = o.setup(api);
  resetRound();
  step(num('warm', 0));
  const auto = params.get('auto') === '1';
  setPaused(true);
  if (auto) api.start();
  else ui.showIntro(loadBest(o.id));

  const paused = params.get('pause') === '1';
  let last = performance.now();
  let acc = 0;
  const lerp = new ViewLerp(play.director, pipe.rig, scene);
  const dbg = {
    ready: false,
    mg: api,
    play,
    region,
    scene,
    start: () => api.start(),
    finish: (reason?: string) => api.finish(reason),
    again: () => api.again(),
    step: (sec: number) => step(sec),
    state: () => {
      const s = play.state();
      return {
        state,
        round,
        score,
        timeLeft: +timeLeft.toFixed(2),
        elapsed: +elapsed.toFixed(2),
        combo: combo.value,
        t: +simT.toFixed(2),
        director: { x: s.x, z: s.z, held: s.held?.id ?? null, busy: s.busy, holding: s.holding },
        ui: { use: play.ui().use, pick: play.ui().pick },
        ...game.debug?.(),
      };
    },
  };
  Object.assign(window, { __mg: dbg });

  function frame(now: number) {
    acc += snapDelta(Math.min(0.1, (now - last) / 1000));
    last = now;
    if (!paused) {
      while (acc >= DT) {
        lerp.mark();
        step(DT);
        acc -= DT;
      }
      lerp.begin(acc / DT);
    }
    day.frame();
    pipe.render(scene);
    play.hud.frame();
    syncHud();
    ui.frame((p) => play.project(v3.set(p.x, p.y, p.z), W(), H()), simT, W(), H());
    game.frame?.();
    for (const f of frameHooks) f();
    lerp.end();
    if (!dbg.ready) {
      dbg.ready = true;
      ui.ready();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return api;
}
