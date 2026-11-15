// clubbuild 的游戏（思想实验：开罗式建造经营版《网球总监》，catalog.ts 文件头）：
// 沙漠里抬高一点的一块沙色地块（lot.ts），南边正中是大门，客人从画面下沿的路走进来（crowd.ts）；
// 摆设施（建造托盘 → 影子跟手 → ✓ 建造，pieces.ts 播建造）、铺步道（拖着刷）、拆除；凑组合飘大横幅；
// 每天收盘出结算卡（停住等点）、升星出庆祝卡（hud.ts）。规则全在 sim.ts（纯函数），这里只发命令、读状态、演。
//
// 镜头：正交 45° 俯视、yaw 0（北在画面上方，大门在下方），竖屏 390×844 正好放下 18×26 格的地块。
// 一指拖动平移、两指捏合 / 滚轮缩放（有上下限）、"全图"回到自动取景。
// URL：seed、px（默认 1）、pal、hour（开局时刻，7..18）、speed（0/1/2）、empty=1（没有开局布局）、demo=1（自动演示）、
//      day=N、money=N、star=N（快速测试）、warm=<秒>（开局先跑几秒，默认 6）。
import * as THREE from 'three';
import { mountDaylight } from '../clubsite/daylight';
import type { SharedUniforms } from '../clubsite/render/ctx';
import { schemeById } from '../clubsite/render/palettes';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N } from '../clubsite/render/toon';
import { BY_ID, type Category, COMBOS, LOT_D, LOT_W, TILE } from './catalog';
import { Crowd } from './crowd';
import { runDemo } from './demo';
import { Hud, type Mode, type Speed } from './hud';
import { createKit } from './kit';
import { buildLot, HX, HZ } from './lot';
import { SKY } from './palette';
import { Pieces } from './pieces';
import {
  apply,
  type Command,
  comboPreview,
  DAY_HOURS,
  DAY_START_HOUR,
  doorTile,
  hourOf,
  inLot,
  newState,
  occupancy,
  placedCenter,
  placeError,
  type Rot,
  route,
  type SimEvent,
  STARTER,
  type State,
  tick,
  tickBuild,
  unreachable,
  withLayout,
  worldToTile,
} from './sim';

const deg = Math.PI / 180;

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
  ghostAt(): [number, number] | null;
  rotate(): void;
  confirm(): void;
  cancel(): void;
  paint(col: number, row: number): void;
  done(): void;
  setSpeed(s: Speed): void;
  fit(): void;
  command(c: Command): SimEvent[];
  /** 每帧调一次（真实秒，封顶 0.1）：演示脚本挂在这里 */
  onFrame: ((dt: number) => void) | null;
}

export function runGame(params: URLSearchParams) {
  const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : d);
  const scheme = schemeById(params.get('pal'));
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const hudEl = document.getElementById('hud') as HTMLDivElement;

  const uniforms: SharedUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(0.4) },
    uGust: { value: 0.5 },
    // 云影三团：x 都留在 ±(CLOUD_W/2 − 半径 − 噪声余量) 里（toon 的云每 CLOUD_W 米绕回来，伸出去会在绕回处切出一条竖线）
    uClouds: {
      value: Array.from({ length: CLOUD_N }, (_, i) =>
        i < 3 ? new THREE.Vector4(-30 + i * 29, -20 + i * 22, 8, 6) : new THREE.Vector4(0, 0, 0, 0),
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
  const pieces = new Pieces(kit);
  scene.add(pieces.root);
  const crowd = new Crowd((v) => kit.ctxFor(v));
  scene.add(crowd.root);

  // ── 模拟状态 ──
  let sim = newState(num('seed', 23), {
    money: params.has('money') ? num('money', 0) : undefined,
    day: params.has('day') ? Math.max(1, num('day', 1)) : undefined,
    star: params.has('star') ? num('star', 0) : undefined,
  });
  if (params.get('empty') !== '1') sim = withLayout(sim, STARTER);
  const hour0 = THREE.MathUtils.clamp(num('hour', 9), DAY_START_HOUR, DAY_START_HOUR + DAY_HOURS - 0.05);
  sim = { ...sim, time: (hour0 - DAY_START_HOUR) / DAY_HOURS };

  // ── 时间和天气：钟跟着模拟的一天走（7:00 → 18:00，sim.hourOf） ──
  const dayParams = new URLSearchParams(params);
  dayParams.delete('day');
  dayParams.set('hour', String(hour0));
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

  // ── 鬼影（摆放中的设施）、占地色块、拆除选中 ──
  const ghost = new THREE.Group();
  ghost.name = 'ghost';
  scene.add(ghost);
  const fpMat = new THREE.MeshBasicMaterial({ color: 0x5fd068, transparent: true, opacity: 0.45, depthWrite: false });
  const fpGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const fp = new THREE.Mesh(fpGeo, fpMat);
  fp.layers.set(1);
  fp.renderOrder = 3;
  fp.visible = false;
  scene.add(fp);
  const doorMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0.75, depthWrite: false });
  const doorMark = new THREE.Mesh(fpGeo, doorMat);
  doorMark.layers.set(1);
  doorMark.renderOrder = 4;
  doorMark.visible = false;
  scene.add(doorMark);
  let ghostModel: THREE.Object3D | null = null;
  // 摆放时会凑成组合的那些设施：脚下铺一块金色（开罗式"这两个挨着有加成"）
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.5, depthWrite: false });
  const glows: THREE.Mesh[] = [];
  function setGlows(uids: number[]) {
    while (glows.length < uids.length) {
      const m = new THREE.Mesh(fpGeo, glowMat);
      m.layers.set(1);
      m.renderOrder = 3;
      scene.add(m);
      glows.push(m);
    }
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

  interface Placing {
    id: string;
    col: number;
    row: number;
    rot: Rot;
  }
  let mode: Mode = 'idle';
  let placing: Placing | null = null;
  let removeSel: number | null = null;
  let cat: Category = 'court';
  let speed: Speed = (THREE.MathUtils.clamp(num('speed', 1), 0, 2) | 0) as Speed;

  // ── 镜头：取景、平移、缩放、拾取 ──
  const TOP_PX = 104;
  const BOT_PX = 96;
  let fitMpt = 0.15;
  function fit() {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const avail = Math.max(120, H - TOP_PX - BOT_PX);
    // 地块在屏幕上：横 54 米 + 边，竖 = 78·sin45 + 房子高
    const sw = LOT_W * TILE + 4;
    const sv = LOT_D * TILE * Math.SQRT1_2 + 8;
    fitMpt = Math.max(sw / (W / PX), sv / (avail / PX));
    pipe.rig.metersPerTexel = fitMpt;
    const dpx = (TOP_PX - BOT_PX) / 2; // 地块中心往下挪多少像素
    const vc = 2 + (dpx * fitMpt) / PX;
    pipe.rig.target.set(0, 0, -vc / Math.sin(pipe.rig.pitch));
  }
  function clampView() {
    const t = pipe.rig.target;
    t.x = THREE.MathUtils.clamp(t.x, -HX, HX);
    t.z = THREE.MathUtils.clamp(t.z, -HZ - 20, HZ + 10);
  }
  const clampZoom = (z: number) => THREE.MathUtils.clamp(z, fitMpt * 0.3, fitMpt * 1.25);
  function resize() {
    pipe.resize(canvas.clientWidth, canvas.clientHeight, Math.min(devicePixelRatio, 3));
    fit();
  }
  addEventListener('resize', resize);
  resize();

  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  /** 屏幕（CSS 像素）→ 地块顶面上的点 */
  function pick(x: number, y: number): THREE.Vector3 | null {
    const low = pipe.lowSize;
    ndc.set(
      ((x - canvas.clientWidth / 2) / pipe.px / (low.x / 2)) * 1,
      -((y - canvas.clientHeight / 2) / pipe.px / (low.y / 2)),
    );
    pipe.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, pipe.camera);
    return ray.ray.intersectPlane(ground, hit) ? hit.clone() : null;
  }
  const pv = new THREE.Vector3();
  /** 世界 → 屏幕（CSS 像素） */
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

  // ── 界面 ──
  const hud = new Hud(
    hudEl,
    {
      build: () => game.openTray(),
      remove: () => setMode('remove'),
      fit: () => fit(),
      closeTray: () => game.closeTray(),
      tab: (c) => game.selectTab(c),
      card: (id) => game.selectCard(id),
      rotate: () => game.rotate(),
      cancel: () => game.cancel(),
      confirm: () => game.confirm(),
      done: () => game.done(),
      speed: (s) => game.setSpeed(s),
    },
    project,
  );

  function setMode(m: Mode) {
    mode = m;
    lot.grid.visible = m !== 'idle';
    if (m !== 'place') {
      placing = null;
      clearGhost();
    }
    if (m !== 'remove') removeSel = null;
    hud.setTab(cat, placing?.id ?? null);
    hud.setMode(m, sim);
    refreshHint();
  }

  function clearGhost() {
    if (ghostModel) ghost.remove(ghostModel);
    ghostModel = null;
    fp.visible = false;
    doorMark.visible = false;
  }

  /** 屏幕中间（可用区）对着的格子 */
  function viewTile(): [number, number] {
    const p = pick(canvas.clientWidth / 2, (TOP_PX + canvas.clientHeight - 220) / 2);
    const [c, r] = p ? worldToTile(p.x, p.z) : [LOT_W / 2, LOT_D / 2];
    return [THREE.MathUtils.clamp(c, 0, LOT_W - 1), THREE.MathUtils.clamp(r, 0, LOT_D - 1)];
  }

  const fpSize = (id: string, rot: Rot) => {
    const d = BY_ID[id];
    return rot % 2 ? { w: d.d, d: d.w } : { w: d.w, d: d.d };
  };

  function setGhost(col: number, row: number) {
    if (!placing) return;
    const { w, d } = fpSize(placing.id, placing.rot);
    placing.col = THREE.MathUtils.clamp(col, 0, LOT_W - w);
    placing.row = THREE.MathUtils.clamp(row, 0, LOT_D - d);
    refreshHint();
  }

  /** 摆放中的提示：能不能放、钱、门口有没有路、会凑成的组合 */
  function refreshHint() {
    if (mode === 'idle') {
      const lost = unreachable(sim);
      const any = sim.placed.some((p) => BY_ID[p.id].cap > 0);
      hud.hint(
        lost.length
          ? '<span class="bad">有设施没有路</span>：点<b>建造 → 步道</b>，从大门铺过去'
          : any
            ? ''
            : '点<b>建造</b>，先摆一片球场，再从大门铺步道过去',
      );
    } else if (mode === 'tray') {
      hud.hint('选一个设施 · <b>拖动画面</b>找空地');
    } else if (mode === 'path') {
      hud.hint(`拖着手指<b>铺步道</b>（$${BY_ID.path.cost}/格）· 两指移动画面`);
    } else if (mode === 'remove') {
      if (removeSel !== null) {
        const p = sim.placed.find((q) => q.uid === removeSel);
        const d = p && BY_ID[p.id];
        hud.hint(d ? `拆掉<b>${d.name}</b>，退 $${Math.floor(d.cost / 2)}` : '');
        hud.setOk(!!d, d ? `拆除 退$${Math.floor(d.cost / 2)}` : '拆除');
      } else {
        hud.hint('点要拆的设施 · <b>拖过步道</b>直接拆（退一半钱）');
        hud.setOk(false, '拆除');
      }
    } else if (mode === 'place' && placing) {
      const def = BY_ID[placing.id];
      const err = placeError(sim, def, placing.col, placing.row, placing.rot);
      const combos = comboPreview(sim, placing.id, placing.col, placing.row, placing.rot);
      const msg: string[] = [];
      if (err === 'overlap') msg.push('<span class="bad">这里被占了</span>');
      else if (err === 'money') msg.push(`<span class="bad">钱不够（要 $${def.cost}）</span>`);
      else if (err === 'locked') msg.push(`<span class="bad">★${def.star} 解锁</span>`);
      else msg.push(`<b>${def.name}</b> $${def.cost}`);
      const names = [...new Set(combos.map((c) => c.combo.name))];
      if (names.length) msg.push(`<span class="ok">+组合 ${names.map((n) => `「${n}」`).join('')}</span>`);
      else if (!err && (def.cap > 0 || def.tags.includes('parking')) && !doorHasPath()) msg.push('门口要连上步道');
      hud.hint(msg.join(' · '));
      hud.setOk(!err, err === 'money' ? '钱不够' : `✓ 建造 $${def.cost}`);
    }
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

  // ── 事件 → 演出 ──
  let awayCool = 0;
  function onEvents(events: SimEvent[]) {
    for (const e of events) {
      if (e.type === 'comboFound') {
        const c = COMBOS.find((x) => x.id === e.combo);
        if (!c) continue;
        const pa = sim.placed.find((p) => p.uid === e.uids[0]);
        const pb = sim.placed.find((p) => p.uid === e.uids[1]);
        if (e.first && pa) hud.banner(`组合！${c.name}`, `${BY_ID[pa.id].name} 收入 ×${c.spend} · 吸引力 +${c.appeal}`);
        for (const p of [pa, pb])
          if (p) hud.floatText(pieces.topOf(p), e.first ? '+组合' : `+${c.name}`, 'pop', 1.8, 50);
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
        hud.settlement(e, sim);
      } else if (e.type === 'starUp') {
        hud.starUp(e, () => game.openTray());
        hud.setMode(mode, sim);
      } else if (e.type === 'rejected' && mode !== 'path') {
        hud.hint(
          `<span class="bad">${{ bounds: '超出地块', overlap: '这里被占了', locked: '还没解锁', money: '钱不够', unknown: '?', missing: '已经没了', gate: '大门不能拆' }[e.reason]}</span>`,
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
      if (def.star > sim.star) {
        hud.hint(`<span class="bad">★${def.star} 解锁</span>`);
        return;
      }
      if (def.cat === 'road') {
        setMode('path');
        return;
      }
      const prevRot = placing?.rot ?? 0;
      const [c, r] = placing ? [placing.col, placing.row] : viewTile();
      setMode('place');
      placing = { id, col: c, row: r, rot: prevRot };
      clearGhost();
      const { obj } = kit.makeAsset(id, 0);
      ghostModel = obj;
      ghost.add(obj);
      const { w, d } = fpSize(id, placing.rot);
      setGhost(c - Math.floor(w / 2), r - Math.floor(d / 2));
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
      // 绕占地中心转
      setGhost(placing.col + Math.round((old.w - nw.w) / 2), placing.row + Math.round((old.d - nw.d) / 2));
    },
    confirm() {
      if (mode === 'remove') {
        if (removeSel !== null) command({ type: 'remove', uid: removeSel });
        removeSel = null;
        refreshHint();
        return;
      }
      if (!placing) return;
      const ev = command({ type: 'place', id: placing.id, col: placing.col, row: placing.row, rot: placing.rot });
      if (ev[0]?.type === 'placed') {
        const id = placing.id;
        setMode('tray');
        hud.setTab(BY_ID[id].cat, null);
        hud.setMode('tray', sim);
      }
    },
    cancel() {
      setMode('tray');
    },
    paint(col, row) {
      if (!inLot(col, row)) return;
      const occ = occupancy(sim);
      if (occ[row * LOT_W + col] !== 0) return;
      const ev = command({ type: 'place', id: 'path', col, row, rot: 0 });
      if (ev[0]?.type === 'placed') {
        const [x, z] = placedCenter({ id: 'path', col, row, rot: 0 });
        hud.floatText(new THREE.Vector3(x, 0.5, z), `-$${BY_ID.path.cost}`, 'coin', 0.7, 16);
      } else if (ev[0]?.type === 'rejected' && ev[0].reason === 'money') hud.hint('<span class="bad">钱不够了</span>');
    },
    done() {
      setMode(mode === 'path' ? 'tray' : 'idle');
    },
    setSpeed(s) {
      speed = s;
    },
    fit() {
      fit();
    },
    command,
    onFrame: null,
  };
  setMode('idle');

  // ── 输入：拖动平移 / 两指缩放 / 拖影子 / 刷步道 / 点选 ──
  const pointers = new Map<number, { x: number; y: number; x0: number; y0: number }>();
  let pinch0 = 0;
  let zoom0 = 0;
  let mid0 = { x: 0, y: 0 };
  let drag: 'none' | 'pan' | 'ghost' | 'paint' | 'erase' = 'none';
  let grab: [number, number] = [0, 0];
  let lastPaint: [number, number] | null = null;
  let moved = false;

  const tileAt = (x: number, y: number): [number, number] | null => {
    const p = pick(x, y);
    return p ? worldToTile(p.x, p.z) : null;
  };
  const pathAt = (c: number, r: number) => sim.placed.find((p) => p.id === 'path' && p.col === c && p.row === r);
  const buildingAt = (c: number, r: number) => {
    if (!inLot(c, r)) return undefined;
    const u = occupancy(sim)[r * LOT_W + c];
    return u > 0 ? sim.placed.find((p) => p.uid === u) : undefined;
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    moved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      zoom0 = pipe.rig.metersPerTexel;
      mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      drag = 'pan';
      return;
    }
    if (pointers.size > 2) return;
    const t = tileAt(e.clientX, e.clientY);
    drag = 'pan';
    if (!t) return;
    if (mode === 'place' && placing) {
      const { w, d } = fpSize(placing.id, placing.rot);
      const inside =
        t[0] >= placing.col - 1 && t[0] <= placing.col + w && t[1] >= placing.row - 1 && t[1] <= placing.row + d;
      if (inside) {
        drag = 'ghost';
        grab = [t[0] - placing.col, t[1] - placing.row];
      }
    } else if (mode === 'path') {
      drag = 'paint';
      lastPaint = t;
      game.paint(t[0], t[1]);
    } else if (mode === 'remove' && pathAt(t[0], t[1])) {
      drag = 'erase';
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { ...prev, x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (Math.hypot(cur.x - cur.x0, cur.y - cur.y0) > 8) moved = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      pipe.rig.metersPerTexel = clampZoom((zoom0 * pinch0) / Math.max(d, 1));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      panBy(mid.x - mid0.x, mid.y - mid0.y);
      mid0 = mid;
      return;
    }
    if (drag === 'pan') panBy(cur.x - prev.x, cur.y - prev.y);
    else if (drag === 'ghost' && placing) {
      const t = tileAt(cur.x, cur.y - 30); // 手指挡着：影子比手指高一点
      if (t) setGhost(t[0] - grab[0], t[1] - grab[1]);
    } else if (drag === 'paint') {
      const t = tileAt(cur.x, cur.y);
      if (t && lastPaint && (t[0] !== lastPaint[0] || t[1] !== lastPaint[1])) {
        // 沿直线把中间的格子都刷上（手指快的时候不断）；只走横竖
        let [c, r] = lastPaint;
        while (c !== t[0] || r !== t[1]) {
          if (Math.abs(t[0] - c) >= Math.abs(t[1] - r)) c += Math.sign(t[0] - c);
          else r += Math.sign(t[1] - r);
          game.paint(c, r);
        }
        lastPaint = t;
      }
    } else if (drag === 'erase') {
      const t = tileAt(cur.x, cur.y);
      const p = t && pathAt(t[0], t[1]);
      if (p) command({ type: 'remove', uid: p.uid });
    }
  });
  const up = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!p || pointers.size > 0) {
      if (pointers.size === 1) drag = 'pan';
      return;
    }
    if (!moved) onTap(p.x, p.y);
    if (drag === 'erase' && !moved) {
      const t = tileAt(p.x, p.y);
      const q = t && pathAt(t[0], t[1]);
      if (q) command({ type: 'remove', uid: q.uid });
    }
    drag = 'none';
    lastPaint = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      pipe.rig.metersPerTexel = clampZoom(pipe.rig.metersPerTexel * Math.exp(e.deltaY * 0.001));
    },
    { passive: false },
  );

  function panBy(dx: number, dy: number) {
    const s = pipe.rig.metersPerTexel / pipe.px;
    pipe.rig.target.x -= dx * s;
    pipe.rig.target.z -= (dy * s) / Math.sin(pipe.rig.pitch);
    clampView();
  }

  let infoTag: { uid: number; t: number } | null = null;
  let unreachableCache: number[] = unreachable(sim);
  function onTap(x: number, y: number) {
    const t = tileAt(x, y);
    if (!t) return;
    if (mode === 'place' && placing) {
      const { w, d } = fpSize(placing.id, placing.rot);
      setGhost(t[0] - Math.floor(w / 2), t[1] - Math.floor(d / 2));
    } else if (mode === 'remove') {
      const b = buildingAt(t[0], t[1]);
      removeSel = b && b.id !== 'path' ? b.uid : null;
      refreshHint();
    } else if (mode === 'idle') {
      const b = buildingAt(t[0], t[1]);
      infoTag = b && b.id !== 'path' ? { uid: b.uid, t: 2.5 } : null;
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
    game.onFrame?.(dtReal);
    uniforms.uTime.value = tAll;
    uniforms.uGust.value = 0.5 + 0.35 * Math.sin(tAll * 0.7) * Math.sin(tAll * 0.23);
    daylight.setHour(hourOf(sim.time));
    pieces.sync(sim, dtReal, tAll);
    crowd.update(sim, paused ? 0 : dt);
    // 影子、占地色块
    if (mode === 'place' && placing && ghostModel) {
      const { w, d } = fpSize(placing.id, placing.rot);
      const [x, z] = placedCenter(placing);
      ghost.position.set(x, 0.25 + Math.abs(Math.sin(tAll * 3)) * 0.25, z);
      ghost.rotation.y = (placing.rot * Math.PI) / 2;
      const ok = !placeError(sim, BY_ID[placing.id], placing.col, placing.row, placing.rot);
      fpMat.color.set(ok ? 0x5fd068 : 0xff5a4a);
      fp.visible = true;
      fp.position.set(x, 0.12, z);
      fp.scale.set(w * TILE, 1, d * TILE);
      const [dc, dr] = doorTile(placing);
      const [dx, dz] = placedCenter({ id: 'path', col: dc, row: dr, rot: 0 });
      doorMark.visible = BY_ID[placing.id].cap > 0;
      doorMark.position.set(dx, 0.14, dz);
      doorMark.scale.set(TILE * 0.6, 1, TILE * 0.6);
    } else if (mode === 'remove' && removeSel !== null) {
      const p = sim.placed.find((q) => q.uid === removeSel);
      if (p) {
        const { w, d } = fpSize(p.id, p.rot);
        const [x, z] = placedCenter(p);
        fpMat.color.set(0xff5a4a);
        fp.visible = true;
        fp.position.set(x, 0.12, z);
        fp.scale.set(w * TILE, 1, d * TILE);
      } else fp.visible = false;
    } else if (mode !== 'place') fp.visible = false;

    // 头顶标签：没有路、组合预览、点选的信息
    const tags: { key: string; p: THREE.Vector3; text: string; cls: string }[] = [];
    for (const uid of unreachableCache) {
      const p = sim.placed.find((q) => q.uid === uid);
      if (p) tags.push({ key: `nr${uid}`, p: pieces.topOf(p), text: '没有路', cls: 'noroad' });
    }
    const partners: number[] = [];
    if (mode === 'place' && placing)
      for (const c of comboPreview(sim, placing.id, placing.col, placing.row, placing.rot)) {
        const p = sim.placed.find((q) => q.uid === c.uid);
        if (!p) continue;
        if (!partners.includes(p.uid)) partners.push(p.uid);
        tags.push({ key: `cp${c.uid}${c.combo.id}`, p: pieces.topOf(p), text: `+${c.combo.name}`, cls: 'combo' });
      }
    setGlows(partners);
    if (infoTag) {
      infoTag.t -= dtReal;
      const p = sim.placed.find((q) => q.uid === infoTag?.uid);
      if (p && infoTag.t > 0) {
        const st = sim.today.byUid[p.uid];
        const occ = sim.visitors.filter((v) => v.stage !== 'out' && v.stops[v.i] === p.uid).length;
        const d = BY_ID[p.id];
        tags.push({
          key: 'info',
          p: pieces.topOf(p),
          text: `${d.name}${d.cap ? ` · ${occ}/${d.cap} 人 · 今天 $${st?.income ?? 0}` : ` · 吸引力 +${d.appeal}`}`,
          cls: '',
        });
      } else infoTag = null;
    }
    hud.setTags(tags);
    refreshT -= dtReal;
    if (refreshT <= 0) {
      refreshT = 0.25;
      unreachableCache = unreachable(sim);
      if (mode === 'idle') refreshHint();
      if (mode === 'tray') hud.setMode('tray', sim);
    }
    hud.setTop(sim, hud.modalOpen ? 0 : speed);
    hud.frame(dtReal);
    daylight.frame();
    pipe.render(scene);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (params.get('demo') === '1') runDemo(game);
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
    },
  });
}
