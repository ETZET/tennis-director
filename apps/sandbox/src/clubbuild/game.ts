// clubbuild 的游戏（思想实验：开罗式建造经营版《网球总监》，catalog.ts 文件头）：
// 沙漠里抬高一点的一块地（lot.ts），南边正中是大门，客人从画面下沿的路走进来（crowd.ts）；
// 摆设施（抽屉 → 选卡 → 镜头推近、影子跟手 → ✓，pieces.ts 播建造）、画步道（拖出 L 形一段 → ✓ 铺）、拆除（点选 → ✓）、
// 撤销（10 步）；凑组合飘大横幅；每天收盘出结算卡、升星出庆祝卡（hud.ts）。
// 规则全在 sim.ts（纯函数），这里只发命令、读状态、演。
//
// 镜头：正交 45° 俯视、yaw 0（北在画面上方，大门在下方）。取景按界面真实占的上下沿（hud.insets()）算，
// 抽屉滑出时镜头 0.25 秒挪开，地块不被盖住；进摆放推近到 ~37 px/格并跟着影子。
// 手势（所有编辑模式同一套）：一指 = 工具（摆放：相对拖影子；步道：拖一段；拆除：点选），两指 = 镜头（捏合以两指中点为锚）；
//   起笔等 90 ms（这段时间第二指落下 = 镜头，工具什么都没做），或者移动 > 6 px 立刻起笔。
//   待机 / 托盘 / 拆除：一指拖 = 平移（拆除模式拖动永远不删东西）。鼠标：右键 / 中键拖 = 平移，滚轮 = 以光标为锚缩放。
// URL：seed、px（默认 1）、pal、hour（开局时刻，7..18）、speed（0/1/2）、empty=1（没有开局布局）、demo=1（自动演示）、
//      day=N、money=N、star=N（快速测试）、warm=<秒>（开局先跑几秒，默认 6）。
import * as THREE from 'three';
import { mountDaylight } from '../clubsite/daylight';
import type { SharedUniforms } from '../clubsite/render/ctx';
import { schemeById } from '../clubsite/render/palettes';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N } from '../clubsite/render/toon';
import { BY_ID, type Category, COMBOS, DEFS, LOT_D, LOT_W, LV_AT, type TerrainDef, TILE } from './catalog';
import { Crowd } from './crowd';
import { DEMO_STAR, runDemo } from './demo';
import { Hud, type InspectAction, type InspectInfo, type Mode, type Speed } from './hud';
import { createKit } from './kit';
import { buildLot, HX, HZ } from './lot';
import { Outline, TileLayer } from './overlay';
import { SKY } from './palette';
import { Pieces } from './pieces';
import {
  apply,
  type Command,
  capOf,
  clockHour,
  coachInfo,
  comboPreview,
  DAY_HOURS,
  DAY_START_HOUR,
  dayEndHour,
  doorTile,
  fitsSomewhere,
  inLot,
  landInfo,
  lightsInfo,
  moveError,
  newState,
  nextGoalHint,
  occupancy,
  openColRange,
  openRowStart,
  placedCenter,
  placeError,
  placeErrorCode,
  REFUND,
  type Rot,
  removeRefund,
  route,
  type SimEvent,
  STARTER,
  type State,
  starForRow,
  tick,
  tickBuild,
  unreachable,
  upgradeInfo,
  withLayout,
  worldToTile,
} from './sim';

const deg = Math.PI / 180;
type T2 = [number, number];

/** 游戏控制器的对外接口（演示脚本、调试用 window.__clubbuild） */
export interface Game {
  readonly state: State;
  mode: Mode;
  openTray(): void;
  closeTray(): void;
  selectTab(cat: Category): void;
  selectCard(id: string): void;
  moveGhost(col: number, row: number): void;
  /** 影子现在的左上角格子（没在摆 = null） */
  ghostAt(): T2 | null;
  rotate(): void;
  /** ✓：摆放 = 建造（留在摆放态，可以再放一个）；步道 = 铺待铺的格子；拆除 = 拆选中的 */
  confirm(): void;
  /** ✕：摆放 = 回托盘；步道 = 清掉待铺（没有就回托盘） */
  cancel(): void;
  done(): void;
  /** 步道：正在拖的一段（预览，像手指还按着） */
  pathPreview(a: T2, b: T2, axis?: 'h' | 'v'): void;
  /** 步道：从 a 拖到 b 的一段 L 形（axis 'h' 先横后竖，'v' 先竖后横），加进待铺 */
  pathSegment(a: T2, b: T2, axis?: 'h' | 'v'): void;
  /** 拆除模式 */
  removeMode(): void;
  /** 检视条：点了一座设施（不挡游戏） */
  inspect(uid: number): void;
  /** 检视条上的动作：'upgrade' / 'move' / 'remove' / 'clear' */
  inspectAct(key: string): void;
  /** 拆除：点选某格上的东西（设施 / 一整段直的步道） */
  selectAt(col: number, row: number): void;
  undo(): void;
  setSpeed(s: Speed): void;
  fit(): void;
  command(c: Command): SimEvent[];
  /** 每帧调一次（真实秒，封顶 0.1）：演示脚本挂在这里 */
  onFrame: ((dt: number) => void) | null;
}

/** 撤销栈的一步：建了什么（撤销 = 拆掉）/ 拆了什么（撤销 = 照原样再建） */
interface UndoStep {
  kind: 'place' | 'remove' | 'move';
  items: { uid: number; id: string; col: number; row: number; rot: Rot }[];
  label: string;
  /** move：挪之前的位置（撤销 = 挪回去） */
  from?: { col: number; row: number; rot: Rot };
}
const UNDO_MAX = 10;
/** 起笔延迟（毫秒）和起笔距离（像素） */
const PEN_DELAY = 90;
const PEN_SLOP = 6;
/** 摆放时推近到全图的几倍（≈37 px/格） */
const PLACE_ZOOM = 0.55;
const PATH_ZOOM = 0.75;

export function runGame(params: URLSearchParams) {
  const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : d);
  const demo = params.get('demo') === '1';
  const scheme = schemeById(params.get('pal'));
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const hudEl = document.getElementById('hud') as HTMLDivElement;

  const uniforms: SharedUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(0.4) },
    uGust: { value: 0.5 },
    // 云影三团：只在地块南北两条沙漠带里走，永远不上球场（desert3d-v2 的规则，美术评审 r1 第 4 条）。
    // x 都留在 ±(CLOUD_W/2 − 半径 − 噪声余量) 里（toon 的云每 CLOUD_W 米绕回来，伸出去会在绕回处切出一条竖线）
    uClouds: {
      value: Array.from(
        { length: CLOUD_N },
        (_, i) =>
          [
            new THREE.Vector4(-20, -HZ - 14, 10, 5),
            new THREE.Vector4(18, -HZ - 30, 8, 4),
            new THREE.Vector4(4, HZ + 18, 9, 5),
          ][i] ?? new THREE.Vector4(0, 0, 0, 0),
      ),
    },
    uCloudVel: { value: new THREE.Vector2(0.6, 0) },
    uCloudStrength: { value: 1 },
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(scheme?.sky?.top ?? SKY.top);

  const PX = num('px', 1);
  const pipe = new PixelPipeline(canvas, {
    px: PX,
    fxLayer: 1,
    rig: { target: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: 45 * deg, metersPerTexel: 0.15 },
    edges: {
      depthStrength: scheme?.edges?.depthStrength ?? 0.48,
      normalStrength: scheme?.edges?.normalStrength ?? 0.6,
      topStrength: scheme?.edges?.topStrength ?? 0.35,
      tint: scheme?.edgeTint,
    },
    dist: 520,
    far: 1100,
  });
  const SIN = Math.sin(pipe.rig.pitch);
  const COS = Math.cos(pipe.rig.pitch);

  // 太阳 + 投影：罩住整块地
  const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 300 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 3;
  sun.target.position.set(0, 0, 0);
  sun.position.set(30, 80, -60);
  scene.add(sun, sun.target);

  const kit = createKit({ uniforms, params, texelMeters: () => pipe.rig.metersPerTexel, designTexel: 0.09 });
  const ctx = kit.ctxFor(0);
  let rs = num('seed', 23) >>> 0;
  /** 演出用的种子随机流（只决定画面） */
  const rng = () => {
    rs = (rs + 0x6d2b79f5) >>> 0;
    let r = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const lot = buildLot(ctx, rng);
  scene.add(lot.root);
  /** 地块开放的范围（北边从哪一行、东西两边买到哪一列）：每帧给，没变是空操作，变了 lot 自己演铺草 */
  const syncOpen = () => lot.setOpen({ fromRow: openRowStart(sim), col0: sim.lotCols[0], col1: sim.lotCols[1] });
  const pieces = new Pieces(kit);
  scene.add(pieces.root);
  const crowd = new Crowd((v) => kit.ctxFor(v));
  scene.add(crowd.root);

  // ── 模拟状态 ──
  let sim = newState(num('seed', 23), {
    money: params.has('money') ? num('money', 0) : undefined,
    day: params.has('day') ? Math.max(1, num('day', 1)) : undefined,
    // 演示要用到的设施先解锁（照 star=N 的快速测试口子）
    star: params.has('star') ? num('star', 0) : demo ? DEMO_STAR : undefined,
  });
  if (params.get('empty') !== '1') sim = withLayout(sim, STARTER);
  syncOpen();
  const hour0 = THREE.MathUtils.clamp(num('hour', 9), DAY_START_HOUR, DAY_START_HOUR + DAY_HOURS - 0.05);
  sim = { ...sim, time: (hour0 - DAY_START_HOUR) / DAY_HOURS };

  // ── 时间和天气：模拟的 7:00–18:00 映射到画面的 9:30–16:00（太阳不低，影子 ≤ 2 倍高，美术评审 r1 第 5 条）；
  //    收盘卡出来时画面慢慢走到傍晚演一下日落 ──
  // 7:00 → 9:30、18:00 → 17:30（白天太阳不低，影子短）；装了灯的日子 18:00 以后接着走到 21:00 = 真的夜里（灯亮）
  const viewHour = (h: number) =>
    h <= DAY_START_HOUR + DAY_HOURS
      ? 9.5 + (h - DAY_START_HOUR) * (8 / DAY_HOURS)
      : 17.5 + (h - DAY_START_HOUR - DAY_HOURS) * (3.5 / 3);
  const dayParams = new URLSearchParams(params);
  dayParams.delete('day');
  dayParams.set('hour', String(viewHour(hour0)));
  dayParams.set('tspeed', '0');
  if (!dayParams.has('weather')) dayParams.set('weather', 'clear');
  const daylight = mountDaylight({
    scene,
    pipe,
    sun,
    uniforms,
    params: dayParams,
    scheme,
    sky: SKY,
    hud: null,
    sunDist: 140,
  });
  let shownHour = viewHour(hour0);
  let lampsSeen = -1;

  // ── 鬼影（摆放中的设施）、占地色块 + 边框、门格、组合金光、格子标记（步道预览 / 拆除选中） ──
  const ghost = new THREE.Group();
  ghost.name = 'ghost';
  scene.add(ghost);
  const fpGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const fxMesh = (mat: THREE.Material, order: number) => {
    const m = new THREE.Mesh(fpGeo, mat);
    m.layers.set(1);
    m.renderOrder = order;
    m.visible = false;
    scene.add(m);
    return m;
  };
  // 占地框（色块 + 一圈不透明边框，放不下变红）归美术：pieces.ghost（GhostFx）
  const doorMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0.75, depthWrite: false });
  const doorMark = fxMesh(doorMat, 6);
  let ghostModel: THREE.Object3D | null = null;
  /** 影子画面上的位置（往格子位置插值：吸附时滑过去，不是瞬移） */
  const ghostXZ = new THREE.Vector2(Number.NaN, 0);
  let ghostH = 3;
  // 摆放时会凑成组合的那些设施：脚下铺一块金色（开罗式"这两个挨着有加成"）
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.5, depthWrite: false });
  const glows: THREE.Mesh[] = [];
  function setGlows(uids: number[]) {
    while (glows.length < uids.length) glows.push(fxMesh(glowMat, 3));
    glows.forEach((m, i) => {
      const p = sim.placed.find((q) => q.uid === uids[i]);
      m.visible = !!p;
      if (!p) return;
      const { w, d } = fpSize(p.id, p.rot);
      const [x, z] = placedCenter(p);
      m.position.set(x, 0.3, z);
      m.scale.set(w * TILE + 0.6, 1, d * TILE + 0.6);
    });
  }
  // 格子标记：一格一块（步道预览、拆除选中）；落点提示（选了卡以后哪里放得下：绿，放这儿能凑组合：金）
  const marks = new TileLayer(scene, { opacity: 0.6, y: 0.5 });
  const setMarks = (list: { c: number; r: number; color: number }[]) => marks.set(list);
  const anchorLayer = new TileLayer(scene, { opacity: 0.3, y: 0.35, inset: 0.62, order: 4 });
  let anchorT = 0;
  // 检视条选中的设施：金框；搬家时原来的位置：虚线框
  const selLine = new Outline(scene, 0xffd23c);
  const origLine = new Outline(scene, 0xfff3d6);

  interface Placing {
    id: string;
    col: number;
    row: number;
    rot: Rot;
    /** 搬家：被搬的那座（影子 = 它自己，✓ 发 move） */
    moveUid?: number;
    from?: { col: number; row: number; rot: Rot };
  }
  let mode: Mode = 'idle';
  let placing: Placing | null = null;
  /** 这次进摆放态以后放下了几个（> 0 时 ✕ 叫"完成"） */
  let placedRun = 0;
  let removeSel: number[] = [];
  /** 检视条看着的那座 */
  let inspectUid: number | null = null;
  /** 进检视条之前玩家动没动过镜头（关上时要不要回全图） */
  let camBeforeInspect = false;
  let cat: Category = 'court';
  let speed: Speed = (THREE.MathUtils.clamp(num('speed', 1), 0, 2) | 0) as Speed;
  /** 步道：待铺的格子（✓ 才铺）+ 正在拖的一段 */
  let pending: T2[] = [];
  let seg: T2[] = [];
  const undoStack: UndoStep[] = [];
  // 输入的状态（下面"输入"一节用）。pen：'wait' = 一指按下、还没决定（等 90 ms / 6 px）；'tool' = 工具在用；
  // 'pan' = 一指平移；'pinch' = 两指镜头
  let pen: 'none' | 'wait' | 'tool' | 'pan' | 'pinch' = 'none';
  /** 临时消息（撤销、报错）在胶囊上留多久，这段时间定时刷新不盖掉它 */
  let holdT = 0;

  // ── 界面 ──
  const hud = new Hud(
    hudEl,
    {
      build: () => (mode === 'tray' ? game.closeTray() : game.openTray()),
      remove: () => game.removeMode(),
      fit: () => fitAll(),
      closeTray: () => game.closeTray(),
      tab: (c) => game.selectTab(c),
      card: (id) => game.selectCard(id),
      rotate: () => game.rotate(),
      cancel: () => game.cancel(),
      confirm: () => game.confirm(),
      done: () => game.done(),
      undo: () => game.undo(),
      speed: (s) => game.setSpeed(s),
      fits: (id) => fits(id),
      inspectAct: (k) => game.inspectAct(k),
      inspectClose: () => setMode('idle'),
      cup: (enter) => {
        command(enter ? { type: 'enterCup' } : { type: 'declineCup' });
      },
      land: (side) => {
        const info = landInfo(sim, side);
        if (info) hud.landCard(side, info, () => command({ type: 'buyLand', side }));
      },
    },
    (p) => project(p),
  );

  // ── 镜头：取景（按界面真实占的上下沿）、0.25 秒插值、平移、锚点缩放、拾取 ──
  let fitMpt = 0.15;
  /** 玩家自己平移 / 缩放过：待机和托盘之间不再自动挪镜头（"全图"清掉） */
  let userCam = false;
  const tw = { t: 1, dur: 0.25, x0: 0, z0: 0, m0: 0, x1: 0, z1: 0, m1: 0 };
  const sPx = (m = pipe.rig.metersPerTexel) => m / PX; // 一个 CSS 像素多少米
  /** 让世界点 (wx, 0, wz) 落在屏幕 (sx, sy) 的镜头目标 */
  function targetFor(wx: number, wz: number, sx: number, sy: number, m: number) {
    const s = sPx(m);
    return { x: wx - (sx - canvas.clientWidth / 2) * s, z: wz - ((sy - canvas.clientHeight / 2) * s) / SIN };
  }
  /** 世界 → 屏幕（解析式，按现在的镜头，不等下一帧渲染） */
  function toScreen(wx: number, wy: number, wz: number) {
    const s = sPx();
    const t = pipe.rig.target;
    return {
      x: canvas.clientWidth / 2 + (wx - t.x) / s,
      y: canvas.clientHeight / 2 + ((wz - t.z) * SIN - wy * COS) / s,
    };
  }
  /** 地图可用区（屏幕像素） */
  function viewRect() {
    const ins = hud.insets();
    return { l: 0, t: ins.top, r: canvas.clientWidth - ins.right, b: canvas.clientHeight - ins.bottom, ins };
  }
  /** 全图取景：缩放按"托盘开着"的最坏下沿算（待机 ↔ 托盘只挪不缩），中心对准现在的可用区 */
  function fitView() {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const ins = hud.insets();
    const availW = Math.max(160, W - ins.right - 8);
    const availH = Math.max(120, H - ins.top - ins.bottomTray);
    // 取开放的那块地（两边各多露 1 格，看得见旁边还没买的地）；竖着放得下就把北边没开放的也框进来
    const [c0, c1] = openColRange(sim);
    const r0 = openRowStart(sim);
    const sw = (c1 - c0 + 3) * TILE;
    const svOpen = (LOT_D - r0) * TILE * SIN + 8;
    const svAll = LOT_D * TILE * SIN + 8;
    fitMpt = Math.max(sw / (availW / PX), svOpen / (availH / PX));
    const all = svAll <= (availH / PX) * fitMpt;
    const cxw = ((c0 + c1 + 1) / 2 - LOT_W / 2) * TILE;
    const czw = ((all ? LOT_D : LOT_D + r0) / 2 - LOT_D / 2) * TILE;
    const cx = (W - ins.right) / 2;
    const cy = (ins.top + H - ins.bottom) / 2;
    const t = targetFor(cxw, czw, cx, cy, fitMpt);
    return { x: t.x, z: t.z - 2 / SIN, m: fitMpt };
  }
  function camTo(x: number, z: number, m: number, dur = 0.25) {
    const r = pipe.rig;
    Object.assign(tw, { t: 0, dur, x0: r.target.x, z0: r.target.z, m0: r.metersPerTexel, x1: x, z1: z, m1: m });
    if (dur <= 0) stepCam(1);
  }
  function stepCam(dt: number) {
    if (tw.t >= 1) return;
    tw.t = Math.min(1, tw.t + dt / Math.max(1e-3, tw.dur));
    const k = tw.t * tw.t * (3 - 2 * tw.t);
    const r = pipe.rig;
    r.target.x = THREE.MathUtils.lerp(tw.x0, tw.x1, k);
    r.target.z = THREE.MathUtils.lerp(tw.z0, tw.z1, k);
    r.metersPerTexel = THREE.MathUtils.lerp(tw.m0, tw.m1, k);
  }
  const stopCam = () => {
    tw.t = 1;
  };
  /** 按现在的模式重新取景（待机 / 托盘 / 拆除）；玩家动过镜头就不动，force 例外 */
  function reframe(force = false, dur = 0.25) {
    if (userCam && !force) return;
    const f = fitView();
    camTo(f.x, f.z, f.m, dur);
  }
  function fitAll() {
    userCam = false;
    reframe(true);
  }
  function clampView() {
    const t = pipe.rig.target;
    t.x = THREE.MathUtils.clamp(t.x, -HX - 30, HX + 30);
    t.z = THREE.MathUtils.clamp(t.z, -HZ - 30, HZ + 30);
  }
  const clampZoom = (z: number) => THREE.MathUtils.clamp(z, fitMpt * 0.3, fitMpt * 1.25);
  function resize() {
    pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
    const f = fitView();
    if (mode === 'place') focusGhost(0);
    else if (!userCam) camTo(f.x, f.z, f.m, 0);
  }
  addEventListener('resize', resize);

  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  /** 屏幕（CSS 像素）→ 地块顶面上的点 */
  function pick(x: number, y: number): THREE.Vector3 | null {
    const low = pipe.lowSize;
    ndc.set(
      (x - canvas.clientWidth / 2) / pipe.px / (low.x / 2),
      -((y - canvas.clientHeight / 2) / pipe.px / (low.y / 2)),
    );
    pipe.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, pipe.camera);
    return ray.ray.intersectPlane(groundPlane, hit) ? hit.clone() : null;
  }
  const pv = new THREE.Vector3();
  /** 世界 → 屏幕（CSS 像素，按上一帧的相机） */
  function project(p: THREE.Vector3): { x: number; y: number } | null {
    const low = pipe.lowSize;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    pv.copy(p).project(pipe.camera);
    const lowW = low.x * pipe.px;
    const lowH = low.y * pipe.px;
    const x = ((pv.x + 1) / 2) * lowW - (lowW - W) / 2;
    const y = ((1 - pv.y) / 2) * lowH - (lowH - H) / 2;
    if (x < -40 || y < -40 || x > W + 40 || y > H + 40) return null;
    return { x, y };
  }

  // ── 模式 ──
  function setMode(m: Mode) {
    const prev = mode;
    mode = m;
    lot.grid.visible = m !== 'idle';
    if (m !== 'place') {
      placing = null;
      placedRun = 0;
      clearGhost();
    }
    if (m !== 'remove') removeSel = [];
    if (m !== 'inspect') {
      selLine.hide();
      if (prev === 'inspect' && m !== 'place') inspectUid = null;
    }
    if (m !== 'place') {
      anchorLayer.clear();
      origLine.hide();
    }
    if (m !== 'path') {
      pending = [];
      seg = [];
    }
    pen = 'none';
    hud.setTab(cat, placing?.id ?? null);
    hud.setMode(m, sim);
    refreshUndo();
    refreshHint();
    // 镜头：离开编辑态回全图；待机 ↔ 托盘只挪（玩家动过就不挪）；步道稍微推近
    if (m === 'path' && prev !== 'path') {
      const r = viewRect();
      const c = pick((r.l + r.r) / 2, (r.t + r.b) / 2);
      const mm = clampZoom(fitMpt * PATH_ZOOM);
      if (c) {
        const t = targetFor(c.x, c.z, (r.l + r.r) / 2, (r.t + r.b) / 2, mm);
        camTo(t.x, t.z, mm);
      }
    } else if (m === 'idle' || m === 'tray' || m === 'remove') {
      const fromEdit = prev === 'place' || prev === 'path';
      if (fromEdit) userCam = false;
      if (prev === 'inspect') userCam = camBeforeInspect;
      reframe(fromEdit || (prev === 'inspect' && !camBeforeInspect));
    }
  }

  function makeGhost(id: string) {
    const { obj } = kit.makeAsset(id, 0);
    ghostModel = obj;
    ghost.add(obj);
    ghostH = Math.max(1.5, new THREE.Box3().setFromObject(obj).max.y);
    ghostXZ.x = Number.NaN;
  }

  function clearGhost() {
    if (ghostModel) ghost.remove(ghostModel);
    ghostModel = null;
    pieces.ghost.hide();
    doorMark.visible = false;
    hud.ghostBar(null);
  }

  /** 可用区中间对着的格子 */
  function viewTile(): T2 {
    const r = viewRect();
    const p = pick((r.l + r.r) / 2, (r.t + r.b) / 2);
    const [c, rr] = p ? worldToTile(p.x, p.z) : [LOT_W / 2, LOT_D / 2];
    return [THREE.MathUtils.clamp(c, 0, LOT_W - 1), THREE.MathUtils.clamp(rr, 0, LOT_D - 1)];
  }

  const fpSize = (id: string, rot: Rot) => {
    const d = BY_ID[id];
    return rot % 2 ? { w: d.d, d: d.w } : { w: d.w, d: d.d };
  };

  // ── 落点：位置合法的左上角（不看钱和星级）──
  // 先按格算"能不能占"（用 sim 的 placeErrorCode 量 1×1：出界、没开放、被占），再用二维前缀和一次算出所有尺寸的合法左上角。
  // 按布局缓存（摆、拆、挪、开放都会变）。
  let layoutKey = '';
  let blockedPS: Int32Array | null = null;
  const anchorCache = new Map<string, Uint8Array>();
  function layoutSig() {
    let h = openRowStart(sim) * 7919 + sim.placed.length;
    for (const p of sim.placed) h = (h * 31 + p.uid * 17 + p.col * 131 + p.row * 7 + p.rot) | 0;
    return String(h);
  }
  /** 被占 / 没开放的格子的二维前缀和（ignoreUid 的格子算空：搬家时不算自己） */
  function blockedPrefix(ignoreUid?: number): Int32Array {
    const occ = occupancy(sim);
    const W1 = LOT_W + 1;
    const ps = new Int32Array(W1 * (LOT_D + 1));
    const one = BY_ID.path;
    for (let r = 0; r < LOT_D; r++)
      for (let c = 0; c < LOT_W; c++) {
        const u = occ[r * LOT_W + c];
        let b = 0;
        if (u !== 0 && u !== ignoreUid) b = 1;
        else if (u === 0) {
          const e = placeErrorCode(sim, one, c, r, 0);
          b = e === null || e === 'money' || e === 'locked' ? 0 : 1;
        }
        ps[(r + 1) * W1 + c + 1] = b + ps[r * W1 + c + 1] + ps[(r + 1) * W1 + c] - ps[r * W1 + c];
      }
    return ps;
  }
  function anchorsFor(id: string, rot: Rot, ignoreUid?: number): Uint8Array {
    const sig = layoutSig();
    if (sig !== layoutKey) {
      layoutKey = sig;
      blockedPS = null;
      anchorCache.clear();
    }
    const key = `${id}|${rot}|${ignoreUid ?? ''}`;
    const hit = anchorCache.get(key);
    if (hit) return hit;
    const ps = ignoreUid !== undefined ? blockedPrefix(ignoreUid) : (blockedPS ??= blockedPrefix());
    const { w, d } = fpSize(id, rot);
    const W1 = LOT_W + 1;
    const out = new Uint8Array(LOT_W * LOT_D);
    for (let r = 0; r + d <= LOT_D; r++)
      for (let c = 0; c + w <= LOT_W; c++) {
        const sum = ps[(r + d) * W1 + c + w] - ps[r * W1 + c + w] - ps[(r + d) * W1 + c] + ps[r * W1 + c];
        if (sum === 0) out[r * LOT_W + c] = 1;
      }
    anchorCache.set(key, out);
    return out;
  }
  /** 这张卡现在有没有地方放（两种朝向，2×2 之类的转了也一样） */
  function fits(id: string): boolean {
    const def = BY_ID[id];
    if (!def || def.cat === 'road') return true;
    return anchorsFor(id, 0).includes(1) || (def.w !== def.d && anchorsFor(id, 1).includes(1));
  }
  /** 离 (c0, r0)（左上角）最近的合法落点；maxDist = 最远几格（欧氏） */
  function nearestAnchor(
    id: string,
    rot: Rot,
    c0: number,
    r0: number,
    maxDist = Infinity,
    ignoreUid?: number,
  ): T2 | null {
    const a = anchorsFor(id, rot, ignoreUid);
    let best: T2 | null = null;
    let bd = maxDist * maxDist + 1e-6;
    for (let i = 0; i < a.length; i++) {
      if (!a[i]) continue;
      const c = i % LOT_W;
      const r = Math.floor(i / LOT_W);
      const dd = (c - c0) ** 2 + (r - r0) ** 2;
      if (dd < bd) {
        bd = dd;
        best = [c, r];
      }
    }
    return best;
  }
  /** 影子现在的位置行不行（不看钱 / 星级）：搬家用 moveError，摆新的用落点表 */
  const spotValid = (pl: Placing) =>
    pl.moveUid !== undefined ? moveError(sim, pl.moveUid, pl.col, pl.row, pl.rot) === null : isAnchor(pl);
  const isAnchor = (pl: Placing) => anchorsFor(pl.id, pl.rot, pl.moveUid)[pl.row * LOT_W + pl.col] === 1;
  /** 铺落点提示：每个合法落点在"占地中心那一格"画一块（金 = 放这儿能凑组合） */
  function refreshAnchors() {
    if (!placing) {
      anchorLayer.clear();
      return;
    }
    const pl = placing;
    const a = anchorsFor(pl.id, pl.rot, pl.moveUid);
    const { w, d } = fpSize(pl.id, pl.rot);
    const list: { c: number; r: number; color: number }[] = [];
    for (let i = 0; i < a.length; i++) {
      if (!a[i]) continue;
      const c = i % LOT_W;
      const r = Math.floor(i / LOT_W);
      const combo = pl.moveUid === undefined && comboPreview(sim, pl.id, c, r, pl.rot).length > 0;
      list.push({ c: c + Math.floor(w / 2), r: r + Math.floor(d / 2), color: combo ? 0xffd23c : 0xfff3d6 });
    }
    anchorLayer.set(list);
    anchorT = 0;
  }

  function setGhost(col: number, row: number, follow = true) {
    if (!placing) return;
    const { w, d } = fpSize(placing.id, placing.rot);
    placing.col = THREE.MathUtils.clamp(col, 0, LOT_W - w);
    placing.row = THREE.MathUtils.clamp(row, 0, LOT_D - d);
    refreshHint();
    if (follow) keepGhostInView();
  }

  /** 推近并把影子放在可用区中线偏上 40 px（手指在下面不挡着） */
  function focusGhost(dur = 0.25) {
    if (!placing) return;
    const m = clampZoom(fitMpt * PLACE_ZOOM);
    const r = viewRect();
    const [x, z] = placedCenter(placing);
    const t = targetFor(x, z, (r.l + r.r) / 2, (r.t + r.b) / 2 - 40, m);
    camTo(t.x, t.z, m, dur);
  }
  /** 影子走到可用区边上 48 px 以内：镜头跟过去 */
  function keepGhostInView() {
    if (!placing || pen === 'pinch') return;
    const r = viewRect();
    const [x, z] = placedCenter(placing);
    // 镜头正在走：按目标位置算
    const s = tw.t < 1 ? sPx(tw.m1) : sPx();
    const tx = tw.t < 1 ? tw.x1 : pipe.rig.target.x;
    const tz = tw.t < 1 ? tw.z1 : pipe.rig.target.z;
    const sx = canvas.clientWidth / 2 + (x - tx) / s;
    const sy = canvas.clientHeight / 2 + ((z - tz) * SIN) / s;
    const m = 48;
    if (sx < r.l + m || sx > r.r - m || sy < r.t + m + 40 || sy > r.b - m) {
      const mm = tw.t < 1 ? tw.m1 : pipe.rig.metersPerTexel;
      const t = targetFor(x, z, (r.l + r.r) / 2, (r.t + r.b) / 2 - 40, mm);
      camTo(t.x, t.z, mm);
    }
  }

  // ── 步道：L 形一段、待铺的计划 ──
  function lTiles(a: T2, b: T2, axis: 'h' | 'v'): T2[] {
    const out: T2[] = [];
    let [c, r] = a;
    out.push([c, r]);
    const stepC = () => {
      while (c !== b[0]) {
        c += Math.sign(b[0] - c);
        out.push([c, r]);
      }
    };
    const stepR = () => {
      while (r !== b[1]) {
        r += Math.sign(b[1] - r);
        out.push([c, r]);
      }
    };
    if (axis === 'h') {
      stepC();
      stepR();
    } else {
      stepR();
      stepC();
    }
    return out;
  }
  /** 待铺（含正在拖的一段）：要新铺的、已经是路的、被挡住的 */
  function pathPlan() {
    const occ = occupancy(sim);
    const seen = new Set<number>();
    const fresh: T2[] = [];
    const have: T2[] = [];
    const blocked: T2[] = [];
    for (const t of [...pending, ...seg]) {
      const [c, r] = t;
      if (!inLot(c, r)) continue;
      const k = r * LOT_W + c;
      if (seen.has(k)) continue;
      seen.add(k);
      const u = occ[k];
      if (u === -1 || (u > 0 && sim.placed.some((p) => p.uid === u && p.id === 'path'))) have.push(t);
      else {
        // 空格也可能铺不了（地块还没开放）
        const e = placeErrorCode(sim, BY_ID.path, c, r, 0);
        if (e === null || e === 'money') fresh.push(t);
        else blocked.push(t);
      }
    }
    return { fresh, have, blocked, cost: fresh.length * BY_ID.path.cost };
  }

  // ── 拆除：选中的东西（点到步道 = 这一格所在的整段直路） ──
  const pathUidAt = (c: number, r: number) =>
    sim.placed.find((p) => p.id === 'path' && p.col === c && p.row === r)?.uid ?? null;
  function pathRun(c: number, r: number): number[] {
    const run = (dc: number, dr: number) => {
      const out: number[] = [];
      let k = 1;
      for (;;) {
        const u = pathUidAt(c + dc * k, r + dr * k);
        if (u === null) break;
        out.push(u);
        k++;
      }
      return out;
    };
    const h = [...run(-1, 0), ...run(1, 0)];
    const v = [...run(0, -1), ...run(0, 1)];
    const self = pathUidAt(c, r);
    if (self === null) return [];
    return [self, ...(h.length >= v.length ? h : v)];
  }
  const refundOf = (uids: number[]) =>
    uids.reduce((s, u) => {
      const p = sim.placed.find((q) => q.uid === u);
      return s + (p ? Math.floor(BY_ID[p.id].cost * REFUND) : 0);
    }, 0);

  /** 临时消息：留 1.6 秒 */
  function flash(html: string, err = false) {
    holdT = 1.6;
    hud.hint(html, err);
  }
  /** 提示胶囊 + ✓ 键的文字（不能按时写原因） */
  function refreshHint() {
    const say = (h: string) => {
      if (holdT <= 0) hud.hint(h);
    };
    if (mode === 'idle') {
      const lost = unreachable(sim);
      const any = sim.placed.some((p) => BY_ID[p.id].cap > 0);
      say(
        lost.length
          ? '<span class="bad">有设施没有路</span>：点<b>建造 → 步道</b>，从大门画过去'
          : any
            ? `<b>目标</b> ${nextGoalHint(sim)}`
            : '点<b>建造</b>，先摆一片球场，再从大门画步道过去',
      );
    } else if (mode === 'inspect') {
      say('');
    } else if (mode === 'tray') {
      say('选一个设施 · <b>拖动画面</b>找空地');
    } else if (mode === 'path') {
      const pl = pathPlan();
      const n = pl.fresh.length;
      if (!pending.length && !seg.length) {
        say(`一指<b>拖出一段路</b>（$${BY_ID.path.cost}/格）· 两指移动 / 缩放`);
        hud.setOk(false, '✓ 铺路');
      } else if (pl.blocked.length) {
        say('<span class="bad">路被设施挡住了</span> · 换条线，或点 ✕ 清掉');
        hud.setOk(false, '✕ 被占了');
      } else if (sim.money < pl.cost) {
        say(`<span class="bad">钱不够</span>：${n} 格要 $${pl.cost}`);
        hud.setOk(false, `钱不够 $${pl.cost}`);
      } else if (!n) {
        say('这些格子已经是路了');
        hud.setOk(false, '已经是路');
      } else {
        say(`<b>${n} 格 $${pl.cost}</b> · 点 ✓ 铺好，或接着画`);
        hud.setOk(true, `✓ 铺 ${n} 格 $${pl.cost}`);
      }
      hud.setDone(pending.length ? '✕ 清掉' : '完成');
    } else if (mode === 'remove') {
      const t0 = sim.placed.find((q) => q.uid === removeSel[0]);
      const cc = t0 && DEFS[t0.id].cat === 'terrain' ? ((DEFS[t0.id] as TerrainDef).clearCost ?? 0) : 0;
      if (t0 && cc) {
        say(`清理<b>${DEFS[t0.id].name}</b>，花 $${cc}（清掉就撤销不了）`);
        hud.setOk(sim.money >= cc, sim.money >= cc ? `✓ 清理 $${cc}` : `钱不够 $${cc}`);
      } else if (removeSel.length) {
        const p = sim.placed.find((q) => q.uid === removeSel[0]);
        const d = p && BY_ID[p.id];
        const refund = refundOf(removeSel);
        if (d?.id === 'path' && removeSel.length === 1) say(`拆 1 格步道，退 $${refund} · <b>再点一下</b>选整段`);
        else say(`拆掉<b>${d ? (d.id === 'path' ? `步道 ${removeSel.length} 格` : d.name) : ''}</b>，退 $${refund}`);
        hud.setOk(true, `✓ 拆除 退$${refund}`);
      } else {
        say('点要拆的设施或步道 · 一指拖动看地图');
        hud.setOk(false, '');
      }
    } else if (mode === 'place' && placing?.moveUid !== undefined) {
      // 搬家：不花钱；校验用 moveError（不算自己原来的占地）
      const def = BY_ID[placing.id];
      const err = moveError(sim, placing.moveUid, placing.col, placing.row, placing.rot);
      const f = placing.from;
      const same = f && f.col === placing.col && f.row === placing.row && f.rot === placing.rot;
      say(err ? `<span class="bad">${err}</span> · 拖到空地` : `搬<b>${def.name}</b>（免费）· 拖到新位置`);
      hud.setOk(!err && !same, err ? `✕ ${err.replace(/^✕\s*/, '')}` : same ? '拖到新位置' : '✓ 搬到这里');
      hud.setDone('✕ 不搬了');
    } else if (mode === 'place' && placing) {
      const def = BY_ID[placing.id];
      const err = placeErrorCode(sim, def, placing.col, placing.row, placing.rot);
      // 摆不下就不预告组合（红色占地说了算）
      const spotBad = err !== null && err !== 'money' && err !== 'locked';
      const combos = spotBad ? [] : comboPreview(sim, placing.id, placing.col, placing.row, placing.rot);
      const msg: string[] = [];
      let label = `✓ 建造 $${def.cost}`;
      const text = err ? placeError(sim, def, placing.col, placing.row, placing.rot) : null;
      if (err === 'overlap') {
        msg.push('<span class="bad">这里被占了</span> · 拖到空地');
        label = '✕ 被占了';
      } else if (err === 'bounds') {
        msg.push('<span class="bad">超出地块</span>');
        label = '✕ 出界';
      } else if (err === 'land') {
        msg.push(`<span class="bad">${text}</span>`);
        label = '✕ 这块地还没买';
      } else if (err === 'parcel') {
        msg.push(`<span class="bad">${text}</span>`);
        label = '✕ 北边没开放';
      } else if (err === 'money') {
        msg.push(`<span class="bad">钱不够</span>（要 $${def.cost}，有 $${Math.floor(sim.money)}）`);
        label = `钱不够 $${def.cost}`;
      } else if (err === 'locked') {
        msg.push(`<span class="bad">★${def.star} 解锁</span>`);
        label = `★${def.star} 解锁`;
      } else if (err) {
        msg.push(`<span class="bad">${text ?? err}</span>`);
        label = '✕ 放不了';
      } else msg.push(`<b>${def.name}</b> $${def.cost} · 拖动挪位置`);
      const names = [...new Set(combos.map((c) => c.name ?? c.combo.name))];
      if (names.length) msg.push(`<span class="ok">+组合 ${names.map((n) => `「${n}」`).join('')}</span>`);
      else if (!spotBad && (def.cap > 0 || def.tags.includes('parking')) && !doorHasPath()) msg.push('门口要连上步道');
      say(msg.join(' · '));
      hud.setOk(!err, label);
      hud.setDone(placedRun > 0 ? '完成' : '✕ 取消');
    }
  }

  /** 撤销键写代价：撤销建造 = 拆掉（今天放的、还没接过客人全额退），撤销拆除 = 照原价再建，撤销搬家 = 搬回去 */
  function refreshUndo() {
    const u = undoStack[undoStack.length - 1];
    let label = '↶';
    if (u?.kind === 'place') label = `↶ 退$${u.items.reduce((a, it) => a + removeRefund(sim, it.uid, true), 0)}`;
    else if (u?.kind === 'remove') label = `↶ -$${u.items.reduce((a, it) => a + (BY_ID[it.id]?.cost ?? 0), 0)}`;
    hud.setUndo(undoStack.length, label);
  }

  function doorHasPath(): boolean {
    if (!placing) return false;
    const [dc, dr] = doorTile({ ...placing });
    const occ = occupancy(sim);
    const { w, d } = fpSize(placing.id, placing.rot);
    for (const [ax, ay] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const c = dc + ax;
      const r = dr + ay;
      if (!inLot(c, r)) continue;
      if (c >= placing.col && c < placing.col + w && r >= placing.row && r < placing.row + d) continue;
      const u = occ[r * LOT_W + c];
      if (u === -1 || sim.placed.some((p) => p.uid === u && p.id === 'path')) return true;
    }
    return false;
  }

  // ── 撤销 ──
  function pushUndo(s: UndoStep) {
    undoStack.push(s);
    while (undoStack.length > UNDO_MAX) undoStack.shift();
    refreshUndo();
  }
  const snap = (uid: number) => {
    const p = sim.placed.find((q) => q.uid === uid);
    return p ? { uid, id: p.id, col: p.col, row: p.row, rot: p.rot } : null;
  };

  // ── 事件 → 演出 ──
  let awayCool = 0;
  /** 新开放的地块：等卡片都关了再把镜头飞过去 + 横幅 */
  let reveal:
    | { kind: 'rows'; rows: [number, number]; features: number[] }
    | { kind: 'land'; cols: [number, number]; features: number[] }
    | null = null;
  /** 升星解锁的设施、刚开放的那几行和里面放不下就可惜的大设施（"留给红土？"提示用，只提一次） */
  let lastUnlocked: string[] = [];
  let fresh: { rows: [number, number]; big: string[] } | null = null;
  let bigHintShown = false;
  /** 在刚开放的地里先放了个小东西，而新解锁的大设施（红土、泳池）因此放不下了：温和地提一次 */
  function smallInFresh(id: string, uid: number) {
    const def = BY_ID[id];
    const p = sim.placed.find((q) => q.uid === uid);
    if (bigHintShown || !fresh || !def || !p || def.cat === 'road') return;
    const { w, d } = fpSize(id, p.rot);
    if (w > 3 || d > 3 || p.row + d - 1 < fresh.rows[0] || p.row > fresh.rows[1]) return;
    const lost = fresh.big.find((b) => BY_ID[b] && !fitsSomewhere(sim, BY_ID[b]));
    if (!lost) return;
    bigHintShown = true;
    hud.strip(`留给${BY_ID[lost].name}？<b>挪动是免费的</b>（点设施 → 移动）`, undefined, 6);
  }
  function showReveal(e: NonNullable<typeof reveal>) {
    const counts = new Map<string, number>();
    for (const u of e.features) {
      const p = sim.placed.find((q) => q.uid === u);
      if (p) counts.set(DEFS[p.id].name, (counts.get(DEFS[p.id].name) ?? 0) + 1);
    }
    const names = [...counts].map(([n, k]) => (k > 1 ? `${n}×${k}` : n)).join(' · ');
    const r = viewRect();
    const m = pipe.rig.metersPerTexel;
    let x = 0;
    let z = 0;
    if (e.kind === 'rows') {
      hud.banner('新地块开放！', names ? `发现：${names}` : `第 ${e.rows[0]}–${e.rows[1]} 行可以建了`);
      z = ((e.rows[0] + e.rows[1] + 1) / 2 - LOT_D / 2) * TILE;
      x = ((openColRange(sim)[0] + openColRange(sim)[1] + 1) / 2 - LOT_W / 2) * TILE;
    } else {
      hud.banner('买下了新地！', names ? `发现：${names}` : `第 ${e.cols[0]}–${e.cols[1]} 列可以建了`);
      x = ((e.cols[0] + e.cols[1] + 1) / 2 - LOT_W / 2) * TILE;
      z = ((openRowStart(sim) + LOT_D) / 2 - LOT_D / 2) * TILE;
    }
    // 镜头飞到新开的地（保持现在的缩放）
    const t = targetFor(x, z, (r.l + r.r) / 2, (r.t + r.b) / 2, m);
    camTo(t.x, t.z, m, 0.6);
    userCam = true;
  }
  function onEvents(events: SimEvent[]) {
    for (const e of events) {
      if (e.type === 'comboFound') {
        const c = COMBOS.find((x) => x.id === e.combo);
        if (!c) continue;
        const pa = sim.placed.find((p) => p.uid === e.uids[0]);
        // 只说一遍：第一次凑成 = 大横幅；以后 = 新建的那个头上飘一条字。日志在时钟里
        if (e.first && pa) hud.banner(`组合！${c.name}`, `${BY_ID[pa.id].name} 收入 ×${c.spend} · 吸引力 +${c.appeal}`);
        else {
          const newer = sim.placed.find((p) => p.uid === Math.max(e.uids[0], e.uids[1]));
          if (newer) hud.floatText(pieces.topOf(newer), `+${c.name}`, 'pop', 1.8, 50);
        }
      } else if (e.type === 'built') {
        const p = sim.placed.find((q) => q.uid === e.uid);
        if (p) hud.floatText(pieces.topOf(p), '完工！', 'pop', 1.2, 30);
      } else if (e.type === 'visitorSpend') {
        const p = sim.placed.find((q) => q.uid === e.uid);
        const at = crowd.headOf(e.vid) ?? (p ? pieces.topOf(p) : null);
        if (at) hud.floatText(at, `+$${e.amount}`, e.bonus > 0 ? 'coin bonus' : 'coin');
      } else if (e.type === 'turnedAway') {
        if (awayCool <= 0) {
          hud.floatText(new THREE.Vector3(0, 2.5, HZ + 1), '客满，走了…', 'tag full', 1.6, 20);
          awayCool = 3;
        }
      } else if (e.type === 'daySettled') {
        // 过了一天：撤销栈清空（不能撤销昨天的事）
        undoStack.length = 0;
        hud.setUndo(0);
        hud.settlement(e, sim);
      } else if (e.type === 'moved') {
        const p = sim.placed.find((q) => q.uid === e.uid);
        if (p) hud.floatText(pieces.topOf(p), '搬好了', 'pop', 1.2, 30);
      } else if (e.type === 'upgraded') {
        const p = sim.placed.find((q) => q.uid === e.uid);
        if (p) hud.floatText(pieces.topOf(p), `⬆ Lv${e.lv}`, 'pop', 1.6, 40);
        upCache = upCache.filter((u) => u !== e.uid);
      } else if (e.type === 'memberJoined') {
        const at = crowd.headOf(e.vid);
        if (at) hud.floatText(at, '办卡！', 'coin member');
      } else if (e.type === 'cupOffer') {
        hud.cupOffer(e.offer, sim.money);
      } else if (e.type === 'cupEntered') {
        hud.strip(`承办了 <b>比赛</b>（第 ${e.day} 天）· 报名费 -$${e.fee}`);
      } else if (e.type === 'cupResult') {
        hud.cupResult(e);
      } else if (e.type === 'seasonScore') {
        hud.seasonScore(e);
      } else if (e.type === 'lightsOn' || e.type === 'coachHired') {
        const p = sim.placed.find((q) => q.uid === e.uid);
        if (p) hud.floatText(pieces.topOf(p), e.type === 'lightsOn' ? '装好夜场灯' : '教练来了', 'pop', 1.6, 40);
      } else if (e.type === 'landBought') {
        reveal = { kind: 'land', cols: e.cols, features: e.features };
      } else if (e.type === 'placed') {
        smallInFresh(e.id, e.uid);
      } else if (e.type === 'parcelOpened') {
        syncOpen();
        reveal = { kind: 'rows', rows: e.rows, features: e.features };
        fresh = { rows: e.rows, big: lastUnlocked.filter((id) => (BY_ID[id]?.w ?? 0) * (BY_ID[id]?.d ?? 0) >= 20) };
      } else if (e.type === 'starUp') {
        lastUnlocked = e.unlocked;
        hud.starUp(e, () => game.openTray());
      } else if (e.type === 'rejected') {
        flash(
          `<span class="bad">${('text' in e && e.text) || ({ bounds: '超出地块', overlap: '这里被占了', locked: '还没解锁', money: '钱不够', unknown: '?', missing: '已经没了', gate: '大门不能拆' }[e.reason as string] ?? '做不了')}</span>`,
          true,
        );
      }
    }
  }

  function command(c: Command): SimEvent[] {
    const r = apply(sim, c);
    sim = r.state;
    onEvents(r.events);
    return r.events;
  }

  // ── 控制器 ──
  const game: Game = {
    get state() {
      return sim;
    },
    get mode() {
      return mode;
    },
    set mode(m: Mode) {
      setMode(m);
    },
    openTray() {
      setMode('tray');
    },
    closeTray() {
      setMode('idle');
    },
    selectTab(c) {
      cat = c;
      if (mode !== 'tray') setMode('tray');
      hud.setTab(cat, null);
      hud.setMode('tray', sim);
    },
    selectCard(id) {
      const def = BY_ID[id];
      if (!def) return;
      cat = def.cat;
      hud.setTab(cat, placing?.id ?? null);
      if (def.star > sim.star) {
        // 锁着的卡：打开星级目标，卡顶写"解锁 X"
        hud.starCard(sim, id);
        return;
      }
      if (def.cat === 'road') {
        setMode('path');
        return;
      }
      const prevRot: Rot = placing && placing.moveUid === undefined ? placing.rot : 0;
      const wasPlacing = mode === 'place' && placing && placing.moveUid === undefined;
      const [vc, vr] = wasPlacing && placing ? [placing.col, placing.row] : viewTile();
      // 先试原来的朝向，再试转 90°；都没地方 = 不进摆放，留在托盘说清楚
      const rots: Rot[] = [prevRot, ((prevRot + 1) % 4) as Rot];
      let start: T2 | null = null;
      let rot: Rot = prevRot;
      for (const r of rots) {
        const { w, d } = fpSize(id, r);
        start = nearestAnchor(
          id,
          r,
          wasPlacing ? vc : vc - Math.floor(w / 2),
          wasPlacing ? vr : vr - Math.floor(d / 2),
        );
        if (start) {
          rot = r;
          break;
        }
      }
      if (!start) {
        if (mode !== 'tray') setMode('tray');
        flash(`<span class="bad">没有 ${def.w}×${def.d} 的空地</span>：清掉大石头、拆点东西，或升星开放北边`, true);
        return;
      }
      setMode('place');
      clearGhost();
      placing = { id, col: start[0], row: start[1], rot };
      hud.setTab(cat, id);
      makeGhost(id);
      setGhost(start[0], start[1], false);
      refreshAnchors();
      focusGhost();
    },
    moveGhost(col, row) {
      setGhost(col, row);
    },
    ghostAt() {
      return placing ? [placing.col, placing.row] : null;
    },
    rotate() {
      if (!placing) return;
      const old = fpSize(placing.id, placing.rot);
      placing.rot = ((placing.rot + 1) % 4) as Rot;
      const nw = fpSize(placing.id, placing.rot);
      // 绕占地中心转；转完不合法就吸到 3 格内最近的落点
      setGhost(placing.col + Math.round((old.w - nw.w) / 2), placing.row + Math.round((old.d - nw.d) / 2));
      snapGhost();
      refreshAnchors();
    },
    confirm() {
      if (mode === 'remove') {
        if (!removeSel.length) return;
        const items = removeSel.map(snap).filter((x) => x !== null);
        // 地形（大石头）= 清理：花钱、不进撤销栈（地形放不回去）
        if (items.length === 1 && DEFS[items[0].id].cat === 'terrain') {
          const ev = command({ type: 'clear', uid: items[0].uid });
          if (ev[0]?.type === 'removed') {
            const [x, z] = placedCenter(items[0]);
            hud.floatText(new THREE.Vector3(x, 1, z), `-$${-ev[0].refund}`, 'coin', 1, 24);
          }
          removeSel = [];
          refreshHint();
          return;
        }
        let refund = 0;
        for (const it of items) {
          const ev = command({ type: 'remove', uid: it.uid });
          if (ev[0]?.type === 'removed') refund += ev[0].refund;
        }
        if (items.length) {
          const d = BY_ID[items[0].id];
          pushUndo({ kind: 'remove', items, label: d.id === 'path' ? `步道 ${items.length} 格` : d.name });
          const [x, z] = placedCenter(items[Math.floor(items.length / 2)]);
          hud.floatText(new THREE.Vector3(x, 1, z), `+$${refund}`, 'coin', 1, 24);
        }
        removeSel = [];
        refreshHint();
        return;
      }
      if (mode === 'path') {
        const pl = pathPlan();
        if (!pl.fresh.length || pl.blocked.length || sim.money < pl.cost) {
          refreshHint();
          return;
        }
        const items: UndoStep['items'] = [];
        for (const [c, r] of pl.fresh) {
          const ev = command({ type: 'place', id: 'path', col: c, row: r, rot: 0 });
          if (ev[0]?.type === 'placed') items.push({ uid: ev[0].uid, id: 'path', col: c, row: r, rot: 0 });
        }
        if (items.length) {
          pushUndo({ kind: 'place', items, label: `步道 ${items.length} 格` });
          const last = items[items.length - 1];
          const [x, z] = placedCenter(last);
          hud.floatText(new THREE.Vector3(x, 0.5, z), `-$${items.length * BY_ID.path.cost}`, 'coin', 1, 24);
        }
        pending = [];
        seg = [];
        refreshHint();
        return;
      }
      if (!placing) return;
      const pl = placing;
      if (pl.moveUid !== undefined) {
        const uid = pl.moveUid;
        const from = pl.from;
        const ev = command({ type: 'move', uid, col: pl.col, row: pl.row, rot: pl.rot });
        if (ev.some((e) => e.type === 'moved') && from) {
          pushUndo({
            kind: 'move',
            items: [{ uid, id: pl.id, col: pl.col, row: pl.row, rot: pl.rot }],
            from,
            label: BY_ID[pl.id].name,
          });
          game.inspect(uid);
        }
        return;
      }
      const ev = command({ type: 'place', id: pl.id, col: pl.col, row: pl.row, rot: pl.rot });
      if (ev[0]?.type === 'placed') {
        pushUndo({
          kind: 'place',
          items: [{ uid: ev[0].uid, id: pl.id, col: pl.col, row: pl.row, rot: pl.rot }],
          label: BY_ID[pl.id].name,
        });
        placedRun++;
        // 开罗式连放：留在摆放态，影子挪到旁边最近的落点
        const next = nearestAnchor(pl.id, pl.rot, pl.col, pl.row);
        if (next) setGhost(next[0], next[1]);
        else refreshHint();
        refreshAnchors();
      }
    },
    cancel() {
      if (mode === 'place' && placing?.moveUid !== undefined) {
        game.inspect(placing.moveUid);
        return;
      }
      if (mode === 'path' && pending.length) {
        pending = [];
        seg = [];
        refreshHint();
        return;
      }
      setMode('tray');
    },
    done() {
      if (mode === 'path' && pending.length) {
        game.cancel();
        return;
      }
      if (mode === 'place' && placing?.moveUid !== undefined) {
        game.inspect(placing.moveUid);
        return;
      }
      setMode(mode === 'path' || mode === 'place' ? 'tray' : 'idle');
    },
    pathPreview(a, b, axis = 'h') {
      if (mode !== 'path') setMode('path');
      seg = lTiles(a, b, axis);
      refreshHint();
    },
    pathSegment(a, b, axis = 'h') {
      if (mode !== 'path') setMode('path');
      seg = [];
      pending.push(...lTiles(a, b, axis));
      refreshHint();
    },
    removeMode() {
      setMode('remove');
    },
    selectAt(c, r) {
      if (mode !== 'remove') setMode('remove');
      if (!inLot(c, r)) return;
      const u = occupancy(sim)[r * LOT_W + c];
      const p = u > 0 ? sim.placed.find((q) => q.uid === u) : undefined;
      if (!p) removeSel = [];
      else if (p.id === 'path') {
        // 步道：第一下 = 这一格；再点 = 整段直路；第三下 = 不选了
        if (removeSel.length === 1 && removeSel[0] === p.uid) removeSel = pathRun(c, r);
        else if (removeSel.includes(p.uid)) removeSel = [];
        else removeSel = [p.uid];
      } else if (removeSel.includes(p.uid)) removeSel = [];
      else if (DEFS[p.id].cat === 'terrain' && !(DEFS[p.id] as TerrainDef).clearCost) {
        removeSel = [];
        flash(`<span class="bad">${DEFS[p.id].name}拆不掉</span>（地形）`, true);
      } else removeSel = [p.uid];
      refreshHint();
    },
    undo() {
      const s = undoStack.pop();
      if (!s) return;
      if (s.kind === 'move') {
        const it = s.items[0];
        const f = s.from;
        if (f) {
          const ev = command({ type: 'move', uid: it.uid, col: f.col, row: f.row, rot: f.rot });
          if (ev.some((e) => e.type === 'moved')) flash(`撤销：<b>${s.label}</b>搬回去了`);
        }
      } else if (s.kind === 'place') {
        // 反悔：今天放下、还没接过客人的全额退（sim 的 canFullRefund），不然退一半
        let refund = 0;
        for (const it of s.items) {
          const ev = command({ type: 'remove', uid: it.uid, refund: 'full' });
          if (ev[0]?.type === 'removed') refund += ev[0].refund;
        }
        flash(`撤销：拆掉<b>${s.label}</b>（退 $${refund}）`);
      } else {
        let fail = 0;
        let cost = 0;
        for (const it of s.items) {
          const ev = command({ type: 'place', id: it.id, col: it.col, row: it.row, rot: it.rot });
          if (ev[0]?.type === 'placed') {
            cost += ev[0].cost;
            // 撤销栈里更早的步骤记的是旧 uid：换成新的
            const nu = ev[0].uid;
            for (const o of undoStack) for (const x of o.items) if (x.uid === it.uid) x.uid = nu;
          } else fail++;
        }
        if (fail) flash(`<span class="bad">撤销没做完</span>：${fail} 个放不回去（钱不够或被占了）`, true);
        else flash(`撤销：<b>${s.label}</b>放回去了（$${cost}）`);
      }
      removeSel = [];
      refreshUndo();
      if (mode === 'place' || mode === 'path') {
        refreshHint();
        refreshAnchors();
      }
    },
    inspect(uid) {
      const p = sim.placed.find((q) => q.uid === uid);
      if (!p || p.id === 'path') return;
      if (mode !== 'inspect') camBeforeInspect = userCam;
      inspectUid = uid;
      setMode('inspect');
      refreshInspect();
      // 镜头：被点的设施挪到可用区中间偏上（保持缩放）
      const r = viewRect();
      const [x, z] = placedCenter(p);
      const m = pipe.rig.metersPerTexel;
      const t = targetFor(x, z, (r.l + r.r) / 2, (r.t + r.b) / 2 - 20, m);
      camTo(t.x, t.z, m);
      userCam = true;
    },
    inspectAct(key) {
      const uid = inspectUid;
      const p = uid !== null ? sim.placed.find((q) => q.uid === uid) : undefined;
      if (!p || uid === null) return;
      if (key === 'upgrade' || key === 'lights' || key === 'coach') {
        command(
          key === 'upgrade'
            ? { type: 'upgrade', uid }
            : key === 'lights'
              ? { type: 'lights', uid }
              : { type: 'hireCoach', uid },
        );
        refreshInspect();
      } else if (key === 'clear') {
        const ev = command({ type: 'clear', uid });
        if (ev[0]?.type === 'removed') {
          const [x, z] = placedCenter(p);
          hud.floatText(new THREE.Vector3(x, 1, z), `-$${-ev[0].refund}`, 'coin', 1, 24);
          setMode('idle');
        }
      } else if (key === 'remove') {
        const it = snap(uid);
        const ev = command({ type: 'remove', uid });
        if (ev[0]?.type === 'removed' && it) {
          const refund = ev[0].refund;
          pushUndo({ kind: 'remove', items: [it], label: BY_ID[it.id].name });
          const [x, z] = placedCenter(it);
          hud.floatText(new THREE.Vector3(x, 1, z), `+$${refund}`, 'coin', 1, 24);
          setMode('idle');
          // 待机底栏没有撤销键：给一条能点的通知
          hud.strip(`拆掉了${BY_ID[it.id].name} +$${refund} <u>↶ 撤销</u>`, () => game.undo());
        }
      } else if (key === 'move') startMove(uid);
    },
    setSpeed(s) {
      speed = s;
    },
    fit() {
      fitAll();
    },
    command,
    onFrame: null,
  };
  resize();
  setMode('idle');
  reframe(true, 0);

  // ── 输入 ──────────────────────────────────────────────
  const pointers = new Map<number, { x: number; y: number; x0: number; y0: number }>();
  let penTimer = 0;
  let down = { x: 0, y: 0 };
  let moved = false;
  let pinch0 = 0;
  let zoom0 = 0;
  let mid0 = { x: 0, y: 0 };
  // 工具的起点：影子起始格、步道起始格 + 第一条腿的方向
  let toolStart: T2 = [0, 0];
  let segAxis: 'h' | 'v' | null = null;
  let hold: T2 = [0, 0];

  const tileAt = (x: number, y: number): T2 | null => {
    const p = pick(x, y);
    return p ? worldToTile(p.x, p.z) : null;
  };
  const buildingAt = (c: number, r: number) => {
    if (!inLot(c, r)) return undefined;
    const u = occupancy(sim)[r * LOT_W + c];
    return u > 0 ? sim.placed.find((p) => p.uid === u) : undefined;
  };
  /** 一格在屏幕上多宽 / 多高（CSS 像素） */
  const tilePx = () => {
    const w = TILE / sPx();
    return { w, h: w * SIN };
  };

  function toolBegin() {
    pen = 'tool';
    if (mode === 'place' && placing) {
      toolStart = [placing.col, placing.row];
      hold = [0, 0];
    } else if (mode === 'path') {
      const t = tileAt(down.x, down.y);
      toolStart = t ?? [-1, -1];
      segAxis = null;
      seg = t && inLot(t[0], t[1]) ? [t] : [];
      refreshHint();
    }
  }
  function toolMove(x: number, y: number) {
    if (mode === 'place' && placing) {
      // 相对拖动：手指在哪儿都行，影子按手指走了几格挪几格（0.6 格滞回，不抖）
      const tp = tilePx();
      const fx = (x - down.x) / tp.w;
      const fy = (y - down.y) / tp.h;
      if (Math.abs(fx - hold[0]) > 0.6) hold[0] = Math.round(fx);
      if (Math.abs(fy - hold[1]) > 0.6) hold[1] = Math.round(fy);
      const nc = toolStart[0] + hold[0];
      const nr = toolStart[1] + hold[1];
      if (nc !== placing.col || nr !== placing.row) setGhost(nc, nr);
    } else if (mode === 'path') {
      if (toolStart[0] < 0) return;
      const t = tileAt(x, y);
      if (!t) return;
      const e: T2 = [THREE.MathUtils.clamp(t[0], 0, LOT_W - 1), THREE.MathUtils.clamp(t[1], 0, LOT_D - 1)];
      // 第一条腿：手指先离开起点格的方向
      if (!segAxis && (e[0] !== toolStart[0] || e[1] !== toolStart[1]))
        segAxis = Math.abs(e[0] - toolStart[0]) >= Math.abs(e[1] - toolStart[1]) ? 'h' : 'v';
      const ns = lTiles(toolStart, e, segAxis ?? 'h');
      if (ns.length !== seg.length || ns[ns.length - 1][0] !== e[0] || ns[ns.length - 1][1] !== e[1]) {
        seg = ns;
        refreshHint();
      }
    }
  }
  function toolEnd(tap: boolean, x: number, y: number) {
    if (mode === 'place' && placing) {
      if (tap) {
        // 单点 = 影子跳到那一格（占地中心对准手指）
        const t = tileAt(x, y);
        if (t) {
          const { w, d } = fpSize(placing.id, placing.rot);
          setGhost(t[0] - Math.floor(w / 2), t[1] - Math.floor(d / 2));
        }
      }
      snapGhost();
    } else if (mode === 'path') {
      if (tap) {
        // 单点 = 加 / 去掉一格
        const t = tileAt(x, y);
        if (t && inLot(t[0], t[1])) {
          const i = pending.findIndex((p) => p[0] === t[0] && p[1] === t[1]);
          if (i >= 0) pending.splice(i, 1);
          else pending.push(t);
        }
      } else pending.push(...seg);
      seg = [];
      refreshHint();
    }
  }
  /** 松手时影子不在合法落点：3 格内有就吸过去（画面上滑过去），飘一条"挪到空地" */
  function snapGhost() {
    if (!placing || isAnchor(placing)) return;
    const at = nearestAnchor(placing.id, placing.rot, placing.col, placing.row, 3, placing.moveUid);
    if (!at) return;
    setGhost(at[0], at[1]);
    const [x, z] = placedCenter(placing);
    hud.floatText(new THREE.Vector3(x, ghostH + 0.5, z), '挪到空地', 'pop', 1, 20);
  }
  /** 第二指落下：工具做到一半的撤回（影子回原位、这一段不要了） */
  function toolAbort() {
    if (mode === 'place' && placing) setGhost(toolStart[0], toolStart[1], false);
    if (mode === 'path') {
      seg = [];
      refreshHint();
    }
  }

  const toolMode = () => mode === 'place' || mode === 'path';

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // 合成的指针（测试脚本）没有真的按下：抓不住也没关系
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (pointers.size === 2) {
      // 两指 = 镜头；工具做到一半的撤回
      clearTimeout(penTimer);
      if (pen === 'tool') toolAbort();
      pen = 'pinch';
      moved = true;
      stopCam();
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      zoom0 = pipe.rig.metersPerTexel;
      mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }
    if (pointers.size > 2) return;
    moved = false;
    down = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) {
      pen = 'pan';
      stopCam();
      return;
    }
    if (toolMode()) {
      pen = 'wait';
      clearTimeout(penTimer);
      penTimer = window.setTimeout(() => {
        if (pen === 'wait') toolBegin();
      }, PEN_DELAY);
    } else {
      pen = 'pan';
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { ...prev, x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (Math.hypot(cur.x - cur.x0, cur.y - cur.y0) > PEN_SLOP) moved = true;
    if (pen === 'pinch') {
      if (pointers.size < 2) {
        panBy(cur.x - prev.x, cur.y - prev.y);
        return;
      }
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomAt(mid0.x, mid0.y, clampZoom((zoom0 * pinch0) / Math.max(d, 1)));
      panBy(mid.x - mid0.x, mid.y - mid0.y);
      mid0 = mid;
      return;
    }
    if (pen === 'pan') {
      if (moved) {
        stopCam();
        panBy(cur.x - prev.x, cur.y - prev.y);
      }
      return;
    }
    if (pen === 'wait' && moved) {
      clearTimeout(penTimer);
      toolBegin();
    }
    if (pen === 'tool') toolMove(cur.x, cur.y);
  });
  const up = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!p) return;
    if (pointers.size > 0) return; // 两指里先抬起一指：剩下那指接着管镜头（pen 还是 'pinch'）
    clearTimeout(penTimer);
    if (pen === 'wait') {
      toolBegin();
      toolEnd(true, p.x, p.y);
    } else if (pen === 'tool') toolEnd(!moved, p.x, p.y);
    else if (pen === 'pan' && !moved) onTap(p.x, p.y);
    pen = 'none';
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      clearTimeout(penTimer);
      if (pen === 'tool') toolAbort();
      pen = 'none';
    }
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      stopCam();
      zoomAt(e.clientX, e.clientY, clampZoom(pipe.rig.metersPerTexel * Math.exp(e.deltaY * 0.001)));
    },
    { passive: false },
  );
  // 桌面快捷键：R 旋转、Enter ✓、Esc ✕、Ctrl/⌘+Z 撤销
  addEventListener('keydown', (e) => {
    if (hud.modalOpen) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') game.undo();
    else if (e.key === 'r' || e.key === 'R') game.rotate();
    else if (e.key === 'Enter') game.confirm();
    else if (e.key === 'Escape') {
      if (mode === 'place' || mode === 'path') game.cancel();
      else setMode('idle');
    }
  });

  function panBy(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return;
    userCam = true;
    const s = sPx();
    pipe.rig.target.x -= dx * s;
    pipe.rig.target.z -= (dy * s) / SIN;
    clampView();
  }
  /** 以屏幕点 (x, y) 为锚缩放：那一点下面的地不动 */
  function zoomAt(x: number, y: number, m: number) {
    const s0 = sPx();
    const s1 = sPx(m);
    userCam = true;
    pipe.rig.target.x += (x - canvas.clientWidth / 2) * (s0 - s1);
    pipe.rig.target.z += ((y - canvas.clientHeight / 2) * (s0 - s1)) / SIN;
    pipe.rig.metersPerTexel = m;
    clampView();
  }

  let unreachableCache: number[] = unreachable(sim);
  let upCache: number[] = [];
  /** 检视条的内容（每 0.25 秒、动作之后刷新） */
  function refreshInspect() {
    if (mode !== 'inspect' || inspectUid === null) return;
    const uid = inspectUid;
    const p = sim.placed.find((q) => q.uid === uid);
    if (!p) {
      setMode('idle');
      return;
    }
    const def = DEFS[p.id];
    const acts: InspectAction[] = [];
    let info: InspectInfo;
    if (def.cat === 'terrain') {
      const cc = (def as TerrainDef).clearCost;
      if (cc) acts.push({ key: 'clear', label: `清理 $${cc}`, cls: 'warn', grow: true, disabled: sim.money < cc });
      info = {
        title: def.name,
        sub: `地形 · 吸引 +${def.appeal}（给 2 格内的设施）${cc ? '' : ' · 拆不掉'}`,
        actions: acts,
      };
    } else {
      const st = sim.today.byUid[uid];
      const share = sim.today.income > 0 ? Math.round(((st?.income ?? 0) / sim.today.income) * 100) : 0;
      const occ = sim.visitors.filter((v) => v.stage !== 'out' && v.stops[v.i] === uid).length;
      const sub =
        def.cap > 0
          ? `${occ}/${capOf(p)} 人 · 今天 $${st?.income ?? 0}（${share}%）· 累计 ${p.served ?? 0} 位`
          : `吸引 +${def.appeal} · 维护 $${def.upkeep}/天`;
      const up = upgradeInfo(sim, uid);
      const info0: string[] = [];
      let meter: InspectInfo['meter'];
      if (up) {
        const need = LV_AT[up.nextLv - 1] ?? 0;
        if (!up.can) meter = { label: `Lv${up.nextLv}：${up.need ?? ''}`, k: need > 0 ? (p.served ?? 0) / need : 0 };
        acts.push({ key: 'upgrade', label: `⬆ 升级 $${up.cost}`, cls: 'go', grow: true, disabled: !up.can });
      } else if (def.cap > 0) acts.push({ key: 'max', label: '已满级', grow: true, disabled: true });
      const li = lightsInfo(sim, uid);
      if (li) acts.push({ key: 'lights', label: `装灯\n$${li.cost}`, disabled: !li.can });
      const co = coachInfo(sim, uid);
      if (co) acts.push({ key: 'coach', label: `请教练\n$${co.cost}`, disabled: !co.can });
      // 不能装 / 请的原因写在进度那一行（升级的原因优先）
      const why = [li && !li.can ? `装灯：${li.need ?? ''}` : '', co && !co.can ? `教练：${co.need ?? ''}` : '']
        .filter(Boolean)
        .join(' · ');
      if (!meter && why) meter = { label: why, k: 0 };
      if (p.lights || p.coach)
        info0.push([p.lights ? '有夜场灯' : '', p.coach ? '有教练' : ''].filter(Boolean).join(' · '));
      acts.push({ key: 'move', label: '✥ 移动' });
      acts.push({
        key: 'remove',
        label: acts.length > 3 ? `拆\n+$${removeRefund(sim, uid)}` : `拆 +$${removeRefund(sim, uid)}`,
        cls: 'warn',
        grow: acts.length < 2,
      });
      // 键多了按两行写（"升级\n$1800"）
      if (acts.length > 3) for (const a of acts) if (a.key === 'upgrade') a.label = `⬆ 升级\n$${up?.cost ?? ''}`;
      info = {
        title: `${def.name} Lv${p.lv ?? 1}${info0.length ? ` · ${info0.join('')}` : ''}`,
        sub,
        meter,
        actions: acts,
      };
    }
    hud.inspect(info);
  }

  /** 搬家：进摆放态，影子 = 这座设施自己，原位置画虚线框；✓ = move 命令，✕ = 回检视条 */
  function startMove(uid: number) {
    const p = sim.placed.find((q) => q.uid === uid);
    if (!p) return;
    setMode('place');
    clearGhost();
    placing = {
      id: p.id,
      col: p.col,
      row: p.row,
      rot: p.rot,
      moveUid: uid,
      from: { col: p.col, row: p.row, rot: p.rot },
    };
    inspectUid = uid;
    makeGhost(p.id);
    setGhost(p.col, p.row, false);
    refreshAnchors();
    focusGhost();
  }

  function onTap(x: number, y: number) {
    const t = tileAt(x, y);
    if (!t) return;
    if (mode === 'remove') game.selectAt(t[0], t[1]);
    else if (mode === 'idle' || mode === 'tray' || mode === 'inspect') {
      const b = buildingAt(t[0], t[1]);
      if (b && b.id !== 'path') game.inspect(b.uid);
      else if (mode === 'inspect') setMode('idle');
    }
  }

  // ── 开局先跑几秒（已经有人在走） ──
  const warm = num('warm', params.get('empty') === '1' ? 0 : 6);
  for (let t = 0; t < warm; t += 0.1) {
    sim = tick(sim, 0.1).state;
    pieces.sync(sim, 0.1, t);
    crowd.update(sim, 0.1);
  }

  // ── 每帧 ──
  let last = performance.now();
  let tAll = 0;
  let refreshT = 0;
  const v3 = new THREE.Vector3();
  const v2 = new THREE.Vector2();
  function frame(now: number) {
    const dtReal = Math.min(0.1, (now - last) / 1000);
    last = now;
    tAll += dtReal;
    const paused = hud.modalOpen || speed === 0;
    const dt = paused ? 0 : dtReal * speed;
    if (!hud.modalOpen) {
      const r = speed === 0 ? tickBuild(sim, dtReal) : tick(sim, dt);
      sim = r.state;
      if (r.events.length) {
        onEvents(r.events);
        if (r.events.some((e) => e.type === 'removed' || e.type === 'built' || e.type === 'placed')) refreshHint();
      }
    }
    awayCool -= dtReal;
    holdT -= dtReal;
    if (reveal && !hud.modalOpen) {
      showReveal(reveal);
      reveal = null;
    }
    game.onFrame?.(dtReal);
    stepCam(dtReal);
    uniforms.uTime.value = tAll;
    uniforms.uGust.value = 0.5 + 0.35 * Math.sin(tAll * 0.7) * Math.sin(tAll * 0.23);
    // 画面时刻：收盘卡开着 = 慢慢走到 17:30 演日落；新的一天跳回早上
    const goalHour = hud.modalKind === 'settle' ? Math.max(17.5, viewHour(dayEndHour(sim))) : viewHour(clockHour(sim));
    if (goalHour < shownHour - 1) shownHour = goalHour;
    else shownHour += (goalHour - shownHour) * Math.min(1, dtReal * (hud.modalKind === 'settle' ? 1.2 : 8));
    daylight.setHour(shownHour);
    pieces.sync(sim, dtReal, tAll);
    crowd.update(sim, paused ? 0 : dt);
    // 地块开放到哪一行：每帧给（没变是空操作，开新地块时 lot 自己演铺草）
    syncOpen();
    // 新建了带灯的东西（球场灯、塔可车的串灯）：让日光重新找一遍灯，夜里才会亮
    if (pieces.lampsVersion !== lampsSeen) {
      lampsSeen = pieces.lampsVersion;
      daylight.rescanLamps();
    }

    // 影子、占地色块 + 边框、工具条
    if (mode === 'place' && placing && ghostModel) {
      const { w, d } = fpSize(placing.id, placing.rot);
      const [x, z] = placedCenter(placing);
      // 红色只给"位置不行"（压着 / 出界 / 没开放）；钱不够照样是绿框，✓ 键上写原因
      const bad = !spotValid(placing);
      // 画面位置往格子位置滑（吸附时 0.1 秒滑过去）；能放：轻轻上下浮，放不下：停住（红框说话）
      if (Number.isNaN(ghostXZ.x)) ghostXZ.set(x, z);
      else ghostXZ.lerp(v2.set(x, z), 1 - Math.exp(-dtReal * 30));
      ghost.position.set(ghostXZ.x, bad ? 0.4 : 0.4 + 0.15 * Math.sin(tAll * 5), ghostXZ.y);
      ghost.rotation.y = (placing.rot * Math.PI) / 2;
      pieces.ghost.show(x, z, w * TILE, d * TILE);
      pieces.setGhostValid(!bad);
      // 搬家：原来的位置画虚线框
      const f = placing.from;
      if (f) {
        const o = { id: placing.id, col: f.col, row: f.row, rot: f.rot };
        const fs = fpSize(o.id, o.rot);
        const [ox, oz] = placedCenter(o);
        origLine.show(ox, oz, fs.w * TILE, fs.d * TILE, { dash: 1.2, t: 0.35 });
      } else origLine.hide();
      // 落点提示：刚选卡时亮一点，0.4 秒后淡下来一直留着
      anchorT += dtReal;
      anchorLayer.mat.opacity = anchorT < 0.4 ? 0.45 : 0.24;
      const [dc, dr] = doorTile(placing);
      const [ddx, ddz] = placedCenter({ id: 'path', col: dc, row: dr, rot: 0 });
      doorMark.visible = BY_ID[placing.id].cap > 0 && !bad;
      doorMark.position.set(ddx, 0.14, ddz);
      doorMark.scale.set(TILE * 0.6, 1, TILE * 0.6);
      // 工具条（只横屏）：贴在占地框东沿外，出界放西沿外
      const r = viewRect();
      const east = project(v3.set(x + (w * TILE) / 2, 0, z));
      const west = project(v3.set(x - (w * TILE) / 2, 0, z));
      if (east && east.x + 60 < r.r) hud.ghostBar({ x: east.x, y: east.y, side: 'e' });
      else if (west) hud.ghostBar({ x: west.x, y: west.y, side: 'w' });
      else hud.ghostBar(null);
      // 影子出了可用区：边上一个指向它的小标签
      const c = toScreen(x, 0, z);
      const m = 28;
      if (c.x < r.l || c.x > r.r || c.y < r.t || c.y > r.b) {
        const ex = THREE.MathUtils.clamp(c.x, r.l + 44, r.r - 44);
        const ey = THREE.MathUtils.clamp(c.y, r.t + m, r.b - m);
        const arrow = c.y < r.t ? '↑' : c.y > r.b ? '↓' : c.x < r.l ? '←' : '→';
        hud.edge({ x: ex, y: ey, text: `${arrow} 影子` });
      } else hud.edge(null);
    } else {
      pieces.ghost.hide();
      doorMark.visible = false;
      hud.ghostBar(null);
      hud.edge(null);
    }
    // 检视条选中的设施：金框
    const ip = mode === 'inspect' && inspectUid !== null ? sim.placed.find((q) => q.uid === inspectUid) : undefined;
    if (ip) {
      const { w, d } = fpSize(ip.id, ip.rot);
      const [x, z] = placedCenter(ip);
      selLine.show(x, z, w * TILE + 0.6, d * TILE + 0.6, { t: 0.45 });
    } else selLine.hide();

    // 格子标记：步道预览（金 = 要铺、淡 = 已经是路、红 = 挡住）、拆除选中（红）
    const ml: { c: number; r: number; color: number }[] = [];
    const tags: { key: string; p: THREE.Vector3; text: string; cls: string }[] = [];
    if (mode === 'path' && (pending.length || seg.length)) {
      const pl = pathPlan();
      for (const [c, r] of pl.fresh) ml.push({ c, r, color: 0xffd23c });
      for (const [c, r] of pl.have) ml.push({ c, r, color: 0xfff3d6 });
      for (const [c, r] of pl.blocked) ml.push({ c, r, color: 0xff5a4a });
      const endT = (seg.length ? seg : pending)[(seg.length ? seg : pending).length - 1];
      if (endT) {
        const [x, z] = placedCenter({ id: 'path', col: endT[0], row: endT[1], rot: 0 });
        const bad = pl.blocked.length > 0 || sim.money < pl.cost;
        tags.push({
          key: 'seg',
          p: new THREE.Vector3(x, 1.5, z),
          text: pl.blocked.length ? '被挡住了' : `${pl.fresh.length} 格 $${pl.cost}`,
          cls: `seg${bad ? ' bad' : ''}`,
        });
      }
    } else if (mode === 'remove' && removeSel.length) {
      for (const u of removeSel) {
        const p = sim.placed.find((q) => q.uid === u);
        if (!p) continue;
        const { w, d } = fpSize(p.id, p.rot);
        for (let dr = 0; dr < d; dr++)
          for (let dc = 0; dc < w; dc++) ml.push({ c: p.col + dc, r: p.row + dr, color: 0xff5a4a });
      }
      const p0 = sim.placed.find((q) => q.uid === removeSel[0]);
      if (p0)
        tags.push({
          key: 'rm',
          p: p0.id === 'path' ? new THREE.Vector3(placedCenter(p0)[0], 1.5, placedCenter(p0)[1]) : pieces.topOf(p0),
          text:
            DEFS[p0.id].cat === 'terrain'
              ? `清理 $${(DEFS[p0.id] as TerrainDef).clearCost ?? 0}`
              : `退 $${refundOf(removeSel)}`,
          cls: 'rm',
        });
    }
    setMarks(ml);

    // 头顶标签：没有路、组合预览（摆不下就不预告）、点选的信息
    for (const uid of unreachableCache) {
      const p = sim.placed.find((q) => q.uid === uid);
      if (p) tags.push({ key: `nr${uid}`, p: pieces.topOf(p), text: '没有路', cls: 'noroad' });
    }
    const partners: number[] = [];
    const gErr =
      mode === 'place' && placing
        ? placeErrorCode(sim, BY_ID[placing.id], placing.col, placing.row, placing.rot)
        : null;
    if (
      mode === 'place' &&
      placing &&
      placing.moveUid === undefined &&
      (gErr === null || gErr === 'money' || gErr === 'locked')
    ) {
      // 同时最多 2 个：离影子最近的
      const [gx, gz] = placedCenter(placing);
      const dist = (uid: number) => {
        const q = sim.placed.find((x) => x.uid === uid);
        if (!q) return Infinity;
        const [qx, qz] = placedCenter(q);
        return (qx - gx) ** 2 + (qz - gz) ** 2;
      };
      const cps = comboPreview(sim, placing.id, placing.col, placing.row, placing.rot);
      const near = [...new Set(cps.map((c) => c.uid))].sort((a, b) => dist(a) - dist(b)).slice(0, 2);
      for (const c of cps.filter((x) => near.includes(x.uid))) {
        const p = sim.placed.find((q) => q.uid === c.uid);
        if (!p) continue;
        if (!partners.includes(p.uid)) partners.push(p.uid);
        tags.push({
          key: `cp${c.uid}${c.combo.id}`,
          p: pieces.topOf(p),
          text: `+${c.name ?? c.combo.name}`,
          cls: 'combo',
        });
      }
    }
    // 两边没买的地：能点的"出售"牌子（待机 / 托盘）
    const signs: { side: 'west' | 'east'; x: number; y: number; text: string }[] = [];
    if (mode === 'idle' || mode === 'tray')
      for (const side of ['west', 'east'] as const) {
        const li = landInfo(sim, side);
        if (!li) continue;
        const cx = ((li.cols[0] + li.cols[1] + 1) / 2 - LOT_W / 2) * TILE;
        const cz = ((openRowStart(sim) + LOT_D) / 2 - LOT_D / 2) * TILE;
        const sp = project(v3.set(cx, 0.5, cz));
        if (sp)
          signs.push({ side, x: sp.x, y: sp.y, text: li.can ? `出售\n$${Math.round(li.cost / 1000)}k` : '出售\n★4' });
      }
    hud.landSigns(signs);
    // 还没开放的北边：一块小牌"★N 开放"
    const open = openRowStart(sim);
    if (open > 0 && (mode === 'idle' || mode === 'tray' || mode === 'place')) {
      const [, z0] = placedCenter({ id: 'path', col: 0, row: 0, rot: 0 });
      const [, z1] = placedCenter({ id: 'path', col: 0, row: open - 1, rot: 0 });
      tags.push({
        key: 'parcel',
        p: new THREE.Vector3(0, 0.5, (z0 + z1) / 2),
        text: `★${starForRow(open - 1)} 开放`,
        cls: 'parcel',
      });
    }
    setGlows(partners);
    // 能升级的设施头上一个 ⬆（点设施打开信息卡升级）
    if (mode === 'idle' || mode === 'tray')
      for (const uid of upCache) {
        const p = sim.placed.find((q) => q.uid === uid);
        if (p) tags.push({ key: `up${uid}`, p: pieces.topOf(p), text: '⬆', cls: 'up' });
      }
    hud.setTags(tags);
    refreshT -= dtReal;
    if (refreshT <= 0) {
      refreshT = 0.25;
      unreachableCache = unreachable(sim);
      upCache = sim.placed.filter((p) => upgradeInfo(sim, p.uid)?.can).map((p) => p.uid);
      if (mode === 'idle' || mode === 'place' || mode === 'path') refreshHint();
      if (mode === 'inspect') refreshInspect();
      if (mode === 'place' || mode === 'path') refreshUndo();
    }
    hud.setTop(sim, hud.modalOpen ? 0 : speed);
    hud.frame(dtReal);
    daylight.frame();
    pipe.render(scene);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (demo) runDemo(game);
  Object.assign(window, {
    __clubbuild: {
      game,
      hud,
      scene,
      pipe,
      route,
      get sim() {
        return sim;
      },
      /** 测试用：一格在屏幕上的像素、世界 → 屏幕 */
      tilePx,
      toScreen,
      tileCenterPx: (c: number, r: number) => {
        const [x, z] = placedCenter({ id: 'path', col: c, row: r, rot: 0 });
        return toScreen(x, 0, z);
      },
      get userCam() {
        return userCam;
      },
      /** 测试用：把一串领域事件当成刚发生的演一遍（只演，不改模拟） */
      emit: (ev: SimEvent[]) => onEvents(ev),
    },
  });
}
