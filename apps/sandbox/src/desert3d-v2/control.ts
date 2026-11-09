// 玩法模式：玩家操控总监。走路（摇杆 / 点地面 / WASD）、拿放工具（吹叶机、捡球器、扫帚）、按住动作键干活。
// - 能走的地方：各层台面按高度（terrain 的平滑轮廓），台阶连着球场台地和低地；高差 > 0.3 米 = 崖壁挡住；绿洲池不能下。
// - 挡路的：球网（一条线段）、网柱、裁判椅、长椅、球车、工具架、大的植物和石头（圆），教练和球员（圆，会动）。
// - 点地面走：直着走，碰到东西沿边滑；要过网就从近的那根网柱外绕。
// - 工具：在工具架上（assets/tool-rack.ts 的 slots）或放在地上（assets/tool.ts 的 buildTool）；走到 1 米内 → 标记 + "拿起"。
//   一次只拿一个，拿别的就把手上的放下（离架子近就放回架子上）。
// - 扫帚：按住 → sweep，扫帚头下 sand.sweep，扬尘。吹叶机：按住 → blow（setBlowSweep(false)，管口跟朝向），sand.blow 一锥，锥里的球被吹走。
//   捡球器：推着走就捡（笼子下面的球进笼），到球车旁按"倒球"倒进车里。
// 资产文件还没有时（tool / tool-rack / marker）用简单的方块代替，不报错。
import * as THREE from 'three';
import type { SandGrid } from './assets/court';
import type { Fx } from './fx';
import { COURT, H, SLOTS, STAIRS, type V2 } from './layout';
import type { LooseBall, PlayApi } from './life';
import type { PixelPipeline } from './pipeline';
import type { AssetCtx } from './world';

export type ToolKind = 'blower' | 'picker' | 'broom';
export const TOOL_KINDS: ToolKind[] = ['blower', 'picker', 'broom'];
export const TOOL_NAME: Record<ToolKind, string> = { blower: '吹风机', picker: '收球器', broom: '扫帚' };

/** 可选的资产模块（另一位在画；没有就用替身） */
const OPT = import.meta.glob<Record<string, unknown>>(['./assets/tool.ts', './assets/marker.ts'], { eager: true });
type BuildTool = (ctx: AssetCtx, kind: ToolKind) => THREE.Object3D;
type BuildObj = (ctx: AssetCtx) => THREE.Object3D;
const buildToolMod = OPT['./assets/tool.ts']?.buildTool as BuildTool | undefined;
const buildMarkerMod = (OPT['./assets/marker.ts']?.buildMarker ?? OPT['./assets/marker.ts']?.build) as
  | BuildObj
  | undefined;

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return a + d * Math.min(1, k);
};

/** 身体半径（米） */
const BODY = 0.3;
/** 能直接迈上去的高差（台阶、路缘） */
const STEP_UP = 0.3;
const PAD_Y = 0.04;
/** 拿/放工具的距离 */
const REACH = 1.0;
const RACK_REACH = 1.5;
/** 离球车多近能倒球 */
const CART_REACH = 1.9;
/** 捡球器的笼子在身前多远（姿势没给就用这个） */
const PICK_REACH = 1.5;
const PICKER_MAX = 60;

/** 走路速度（米/秒）：空手、推捡球器、扫地时、吹的时候 */
const SPEED = { walk: 3.0, picker: 2.3, sweeping: 0.9, blowing: 1.1 };

/** 挡路的植物/石头（按资产 id 的半径，乘 slot 的缩放） */
const PLANT_R: Record<string, number> = {
  'fan-palm': 0.45,
  'palo-verde': 0.45,
  'smoke-tree': 0.55,
  creosote: 0.7,
  brittlebush: 0.55,
  ocotillo: 0.5,
  rocks: 1.0,
  'barrel-cactus': 0.4,
  cholla: 0.5,
  agave: 0.7,
};
/** 按包围盒铺圆的东西 */
const BOXED = new Set(['umpire-chair', 'bench', 'ball-hopper', 'tool-rack']);

function inPoly(pts: V2[], x: number, z: number) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** 地面高度（不能站 = null）：台阶 → 最高的台面 → 低地（池子不行） */
export function makeGround(outlines: Record<string, V2[]>) {
  const levels: [V2[] | undefined, number][] = [
    [outlines.mesa, H.mesa],
    [outlines.north, H.north],
    [outlines.west, H.west],
    [outlines.east, H.west],
    [outlines.court, H.court],
  ];
  const stairLen = STAIRS.run * STAIRS.steps;
  return (x: number, z: number): number | null => {
    if (x > STAIRS.x0 + 0.12 && x < STAIRS.x1 - 0.12 && z > STAIRS.z0 - 0.05 && z < STAIRS.z0 + stairLen) {
      const k = clamp((z - STAIRS.z0) / stairLen, 0, 1);
      return STAIRS.from + (STAIRS.to - STAIRS.from) * k;
    }
    for (const [pts, h] of levels) {
      if (pts && inPoly(pts, x, z)) {
        if (h === H.court && Math.abs(x) <= COURT.padHw && Math.abs(z) <= COURT.padHl) return PAD_Y;
        return h;
      }
    }
    if (outlines.island && inPoly(outlines.island, x, z)) {
      if (outlines.pool && inPoly(outlines.pool, x, z)) return null;
      return H.low;
    }
    return null;
  };
}

interface Circle {
  x: number;
  z: number;
  r: number;
}

interface Mark {
  base: V3;
  h: number;
  ring: boolean;
}

interface Tool {
  kind: ToolKind;
  where: 'rack' | 'ground' | 'held';
  /** 地上的样子（在架子上时：架子自己画就藏起来，架子不会画就摆在槽位上） */
  obj: THREE.Object3D;
  /** 拿它时站的地方附近（世界）：地上 = 工具中心；架上 = 架子给的站位 */
  pos: V3;
  rotY: number;
  /** 标记：脚下的地面点（世界）+ 东西多高 + 要不要地圈 */
  mark: Mark;
  /** 捡球器里的球 */
  count: number;
}

export interface ControlState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  held: ToolKind | null;
  pickerCount: number;
  cartCount: number;
  sand: number;
  clean: number;
  loose: number;
  /** 当前能做的拿/放（按钮文字），没有 = '' */
  context: string;
  /** 动作键文字，没有 = '' */
  action: string;
  acting: boolean;
  busy: string;
}

export interface Control {
  update(dt: number, t: number): void;
  /** 屏幕方向的摇杆（-1..1，x 右、y 下），长度 0..1 */
  setStick(x: number, y: number): void;
  /** 世界方向直接走（测试）：dx, dz 归一化后当摇杆 */
  setMove(dx: number, dz: number): void;
  setKey(code: string, down: boolean): void;
  /** 点地面走过去（世界坐标） */
  tapGround(x: number, z: number): void;
  /** 屏幕 CSS 坐标点地面 */
  tapScreen(cssX: number, cssY: number, cssW: number, cssH: number): void;
  setAction(down: boolean): void;
  /** 拿/放（上下文按钮） */
  context(): void;
  state(): ControlState;
  /** 头顶标记（hud 不需要，测试用） */
  readonly director: THREE.Object3D;
  /** 工具的位置（测试用） */
  tools(): { kind: ToolKind; where: string; x: number; z: number }[];
  /** 球车在哪（测试用） */
  cartPos(): V3 | null;
  /** 正在走的点地面目标还剩几个点 */
  pathLeft(): number;
}

export function createControl(opts: {
  ctx: AssetCtx;
  scene: THREE.Scene;
  pipe: PixelPipeline;
  outlines: Record<string, V2[]>;
  play: PlayApi;
  court: THREE.Object3D | undefined;
  fx: Fx;
  rack: THREE.Object3D | undefined;
  start: V3;
}): Control {
  const { ctx, scene, pipe, play, fx, rack } = opts;
  const D = play.director;
  const ud = D.userData;
  const sand = opts.court?.userData.sand as SandGrid | undefined;
  /**
   * 清洁度（每 0.25 秒算一次）：按铺面上被沙盖住的面积（sand.coverage）。开局那几堆沙丘只占铺面一成，
   * 直接用"没沙的面积"一开始就是 90%、扫掉一堆才 +1% → 换成玩法刻度：开局 = 40%，一粒沙都没有 = 100%，
   * 风把沙堆得比开局还多 = 往 0% 掉。扫掉/吹走一堆大约 +6%。
   */
  const sandCover = () => sand?.coverage?.(0.015, 0.08) ?? 0;
  const cover0 = Math.max(1e-4, sandCover());
  let clean = 40;
  let cleanAcc = 1;
  const measureClean = () => {
    clean = Math.round(clamp(100 - (60 * sandCover()) / cover0, 0, 100));
  };
  measureClean();
  const ground = makeGround(opts.outlines);
  const rnd = ctx.rng('control');
  const poses = new Set<string>((ud.poses as readonly string[] | undefined) ?? []);
  const has = (p: string) => poses.has(p);

  // ── 总监 ──
  const pos = opts.start.clone();
  pos.y = ground(pos.x, pos.z) ?? 0;
  let yaw = Math.PI;
  let walkPh = 0;
  let held: ToolKind | null = null;
  ud.setProp?.(null);

  // ── 静态挡路的圆 ──
  const statics: Circle[] = [];
  const box = new THREE.Box3();
  const cover = (o: THREE.Object3D, shrink = 0.05) => {
    o.updateMatrixWorld(true);
    box.setFromObject(o);
    if (box.isEmpty()) return;
    const sx = box.max.x - box.min.x;
    const sz = box.max.z - box.min.z;
    const r = Math.max(0.2, Math.min(sx, sz) / 2 - shrink);
    const long = Math.max(sx, sz);
    const n = Math.max(1, Math.ceil(long / (r * 1.5)));
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0.5 : i / (n - 1);
      const x = sx >= sz ? box.min.x + r + (sx - 2 * r) * k : (box.min.x + box.max.x) / 2;
      const z = sx >= sz ? (box.min.z + box.max.z) / 2 : box.min.z + r + (sz - 2 * r) * k;
      statics.push({ x, z, r });
    }
  };
  for (const s of SLOTS) {
    const r = PLANT_R[s.asset];
    if (r) statics.push({ x: s.x, z: s.z, r: r * (s.s ?? 1) });
    else if (BOXED.has(s.asset)) {
      const o = scene.getObjectByName(`slot:${s.id}`);
      if (o) cover(o, s.asset === 'tool-rack' ? 0.1 : 0.05);
    }
  }
  // 网柱（球网自己是线段，见 resolve）
  const POST_X = COURT.hw + 0.914;
  statics.push({ x: -POST_X, z: 0, r: 0.12 }, { x: POST_X, z: 0, r: 0.12 });
  const NET_X = POST_X + 0.1;

  /** 把 p 从所有挡路的东西里推出去（prevZ：上一步在网的哪边） */
  const resolve = (p: V3, prevZ: number) => {
    const circles: Circle[] = [...statics, ...play.people()];
    const cart = play.cart;
    if (cart) circles.push({ x: cart.position.x, z: cart.position.z, r: 0.45 });
    for (let it = 0; it < 2; it++) {
      for (const c of circles) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const R = c.r + BODY;
        if (d < R) {
          if (d < 1e-4) p.x += R;
          else {
            p.x = c.x + (dx / d) * R;
            p.z = c.z + (dz / d) * R;
          }
        }
      }
      // 球网：|x| < 网宽 的一条线段，厚 0.1
      if (Math.abs(p.x) < NET_X && Math.abs(p.z) < 0.1 + BODY && Math.abs(p.y) < 0.5) {
        const side = Math.sign(prevZ) || 1;
        p.z = side * (0.1 + BODY);
      }
    }
  };

  /** 迈一步：能站、高差够小；不行就沿 x / z 分量滑；返回真的走了多少 */
  const tryStep = (dx: number, dz: number): number => {
    const h0 = pos.y;
    const ok = (x: number, z: number) => {
      const g = ground(x, z);
      return g !== null && Math.abs(g - h0) <= STEP_UP ? g : null;
    };
    const cands: [number, number][] = [
      [dx, dz],
      [dx, 0],
      [0, dz],
    ];
    for (const [ax, az] of cands) {
      if (Math.abs(ax) + Math.abs(az) < 1e-6) continue;
      const g = ok(pos.x + ax, pos.z + az);
      if (g === null) continue;
      const np = v(pos.x + ax, g, pos.z + az);
      resolve(np, pos.z);
      const g2 = ok(np.x, np.z);
      if (g2 === null) continue;
      const moved = Math.hypot(np.x - pos.x, np.z - pos.z);
      pos.set(np.x, g2, np.z);
      return moved;
    }
    return 0;
  };

  // ── 工具 ──
  const stubTool = (kind: ToolKind): THREE.Object3D => {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      g.add(o);
    };
    if (kind === 'broom') {
      add(new THREE.BoxGeometry(0.1, 0.1, 1.3), ctx.mat('wood'), 0, 0.05, -0.2);
      add(new THREE.BoxGeometry(0.5, 0.14, 0.3), ctx.mat('dryGrass'), 0, 0.07, 0.55);
    } else if (kind === 'blower') {
      add(new THREE.BoxGeometry(0.36, 0.3, 0.4), ctx.mat('fabricStripe'), 0, 0.15, 0);
      add(new THREE.BoxGeometry(0.12, 0.12, 0.8), ctx.mat('fabricStripe'), 0.1, 0.07, 0.55);
    } else {
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.84, 10).rotateZ(Math.PI / 2), ctx.mat('metal'), 0, 0.2, 0);
      add(new THREE.BoxGeometry(0.1, 0.1, 1.2), ctx.mat('metal'), 0, 0.12, -0.7);
    }
    ctx.mats.prepare(g);
    g.name = `tool:${kind}`;
    return g;
  };
  const makeTool = (kind: ToolKind) => {
    try {
      if (buildToolMod) return buildToolMod(ctx, kind);
    } catch (e) {
      console.warn('[control] buildTool failed', e);
    }
    return stubTool(kind);
  };
  /** 架子的槽位（本地，tool-rack.ts）：pos = 拿/放时人站的地面点，rotY = 那时人的朝向，tool = 架上工具的中心，top = 最高点。架子没给就自己排一排 */
  type Slot = { pos: V3; rotY: number; tool?: V3; top?: V3 };
  const rackSlots = (rack?.userData.slots as Record<ToolKind, Slot> | undefined) ?? null;
  const rackShows = typeof rack?.userData.show === 'function';
  const fallbackSlots: Record<ToolKind, Slot> = {
    blower: { pos: v(-0.7, 0, 0.9), rotY: Math.PI, tool: v(-0.7, 0, 0.2) },
    picker: { pos: v(0, 0, 0.9), rotY: Math.PI, tool: v(0, 0, 0.2) },
    broom: { pos: v(0.7, 0, 0.9), rotY: Math.PI, tool: v(0.7, 0, 0.2) },
  };
  const slotWorld = (kind: ToolKind) => {
    const s = rackSlots?.[kind] ?? fallbackSlots[kind];
    if (!rack) {
      const p = v(opts.start.x + (TOOL_KINDS.indexOf(kind) - 1) * 0.8, 0, opts.start.z - 1.2);
      return { pos: p, rotY: Math.PI, tool: p.clone(), top: p.clone().setY(0.6) };
    }
    rack.updateMatrixWorld(true);
    const tool = rack.localToWorld((s.tool ?? s.pos).clone());
    return {
      pos: rack.localToWorld(s.pos.clone()),
      rotY: rack.rotation.y + s.rotY,
      tool,
      top: s.top ? rack.localToWorld(s.top.clone()) : tool.clone().setY(tool.y + 0.6),
    };
  };
  const tools: Tool[] = TOOL_KINDS.map((kind) => {
    const obj = makeTool(kind);
    scene.add(obj);
    return {
      kind,
      where: 'rack',
      obj,
      pos: v(0, 0, 0),
      rotY: 0,
      mark: { base: v(0, 0, 0), h: 0, ring: false },
      count: 0,
    };
  });
  /** 架上那件工具的标记：脚下 = 工具中心落到地面，高 = 工具最高点（不要地圈：会压在架子底下） */
  const rackMark = (kind: ToolKind, out: Mark) => {
    const s = slotWorld(kind);
    const gy = ground(s.tool.x, s.tool.z) ?? 0;
    out.base.set(s.tool.x, gy, s.tool.z);
    out.h = Math.max(0.3, s.top.y - gy);
    out.ring = false;
    return out;
  };
  const groundPicker = (tl: Tool) => (tl.obj.userData.picker as THREE.Object3D | undefined) ?? tl.obj;
  /** 把工具的画面和位置摆好 */
  const placeTool = (tl: Tool) => {
    if (tl.where === 'held') {
      tl.obj.visible = false;
      if (rackShows) rack!.userData.show(tl.kind, false);
      return;
    }
    if (tl.where === 'rack') {
      const s = slotWorld(tl.kind);
      tl.pos.copy(s.pos);
      tl.rotY = s.rotY;
      rackMark(tl.kind, tl.mark);
      if (rackShows) {
        rack!.userData.show(tl.kind, true);
        tl.obj.visible = false;
        return;
      }
      // 架子不会画工具：工具摆在槽位上
      tl.obj.visible = true;
      tl.obj.position.copy(s.tool);
      tl.obj.position.y = ground(s.tool.x, s.tool.z) ?? s.tool.y;
      tl.obj.rotation.y = tl.rotY;
      return;
    }
    if (rackShows) rack!.userData.show(tl.kind, false);
    tl.obj.visible = true;
    tl.obj.position.copy(tl.pos);
    tl.obj.position.y = ground(tl.pos.x, tl.pos.z) ?? tl.pos.y;
    tl.obj.rotation.y = tl.rotY;
    groundPicker(tl).userData.setCount?.(tl.count);
    tl.mark.base.copy(tl.obj.position);
    tl.mark.h = (tl.obj.userData.top as number | undefined) ?? 0.5;
    tl.mark.ring = true;
  };
  for (const tl of tools) placeTool(tl);
  const heldTool = () => tools.find((t) => t.where === 'held') ?? null;

  // ── 标记 ──
  const tmpMark: Mark = { base: v(0, 0, 0), h: 0, ring: false };
  let marker: THREE.Object3D | null = null;
  try {
    marker = buildMarkerMod ? buildMarkerMod(ctx) : null;
  } catch (e) {
    console.warn('[control] marker failed', e);
  }
  if (marker) {
    marker.visible = false;
    scene.add(marker);
  }

  // ── 输入 ──
  const stick = new THREE.Vector2();
  const moveW = new THREE.Vector2();
  const keys = new Set<string>();
  let actionDown = false;
  let path: V3[] = [];
  let stuckT = 0;

  // ── 动作 ──
  /** 正在做的一次性动作：拿/放（pickup）、倒球（dump） */
  let busy: { name: 'pickup' | 'dump'; t: number; dur: number; mid?: () => void; tick?: (k: number) => void } | null =
    null;
  let acting = false;
  let actT = 0;
  let actAcc = 0;
  let lastPose = '';

  const fwd = () => v(Math.sin(yaw), 0, Math.cos(yaw));
  const flatDist = (a: V3, x: number, z: number) => Math.hypot(a.x - x, a.z - z);

  /** 附近能拿的工具（最近的） */
  const nearTool = (): Tool | null => {
    let best: Tool | null = null;
    let bd = Infinity;
    for (const tl of tools) {
      if (tl.where === 'held') continue;
      const d = flatDist(pos, tl.pos.x, tl.pos.z);
      const lim = tl.where === 'rack' ? RACK_REACH : REACH + 0.3;
      if (d < lim && d < bd) {
        bd = d;
        best = tl;
      }
    }
    return best;
  };
  const nearOwnSlot = (kind: ToolKind) => {
    if (!rack) return false;
    const s = slotWorld(kind);
    return flatDist(pos, s.pos.x, s.pos.z) < RACK_REACH;
  };
  const nearCart = () => {
    const c = play.cart;
    if (!c) return false;
    return flatDist(pos, c.position.x, c.position.z) < CART_REACH;
  };
  const pickerObj = (): THREE.Object3D | null => (ud.picker as THREE.Object3D | undefined) ?? null;
  const pickerCount = () => heldTool()?.count ?? 0;
  const setPickerCount = (n: number) => {
    const tl = heldTool();
    if (!tl) return;
    tl.count = clamp(n, 0, PICKER_MAX);
    pickerObj()?.userData.setCount?.(tl.count);
  };

  /** 放下手里的（离自己的槽近就放回架子） */
  const dropHeld = () => {
    const tl = heldTool();
    if (!tl) return;
    if (nearOwnSlot(tl.kind)) tl.where = 'rack';
    else {
      tl.where = 'ground';
      const f = fwd();
      // 放在脚前 0.6 米（那里不能站就放脚下）
      const x = pos.x + f.x * 0.6;
      const z = pos.z + f.z * 0.6;
      const g = ground(x, z);
      if (g !== null && Math.abs(g - pos.y) <= STEP_UP) tl.pos.set(x, g, z);
      else tl.pos.set(pos.x, pos.y, pos.z);
      tl.rotY = yaw;
    }
    held = null;
    ud.setProp?.(null);
    placeTool(tl);
  };
  const takeTool = (tl: Tool) => {
    tl.where = 'held';
    held = tl.kind;
    ud.setProp?.(tl.kind);
    if (tl.kind === 'blower') ud.setBlowSweep?.(false);
    if (tl.kind === 'picker') pickerObj()?.userData.setCount?.(tl.count);
    placeTool(tl);
  };

  const contextLabel = (): string => {
    if (busy) return '';
    const n = nearTool();
    if (n) return `拿起 ${TOOL_NAME[n.kind]}`;
    if (held) return nearOwnSlot(held) ? '放回架子' : '放下';
    return '';
  };
  const actionLabel = (): string => {
    if (held === 'broom') return '扫';
    if (held === 'blower') return '吹';
    if (held === 'picker' && pickerCount() > 0 && nearCart()) return '倒球';
    return '';
  };

  const startPickup = (mid: () => void) => {
    busy = { name: 'pickup', t: 0, dur: 0.5, mid };
  };
  const doContext = () => {
    if (busy) return;
    const n = nearTool();
    if (n) {
      // 先面向工具（架上的：面向架子）
      yaw = n.where === 'rack' ? n.rotY : Math.atan2(n.pos.x - pos.x, n.pos.z - pos.z);
      startPickup(() => {
        if (heldTool()) dropHeld();
        takeTool(n);
      });
      return;
    }
    if (held) startPickup(dropHeld);
  };
  const startDump = () => {
    const c = play.cart;
    if (!c || busy) return;
    yaw = Math.atan2(c.position.x - pos.x, c.position.z - pos.z);
    const n0 = pickerCount();
    let moved = 0;
    busy = {
      name: 'dump',
      t: 0,
      dur: 1.2 + n0 * 0.05,
      tick: (k) => {
        // 0.3..0.85 之间把球一个个倒进车里
        const want = Math.round(n0 * clamp((k - 0.3) / 0.55, 0, 1));
        while (moved < want) {
          moved++;
          setPickerCount(pickerCount() - 1);
          play.setCartCount(play.cartCount() + 1);
        }
      },
      mid: () => fx.puff(v(c.position.x, c.position.y + 0.9, c.position.z), 0.14, 2),
    };
  };

  // ── 用工具 ──
  const nozzle = () => {
    const n = ud.nozzle?.() as V3 | undefined;
    const d = ud.nozzleDir?.() as V3 | undefined;
    const f = fwd();
    return {
      p: n ? n.clone() : v(pos.x + f.x * 0.9, pos.y + 0.35, pos.z + f.z * 0.9),
      d: d ? d.clone().normalize() : v(f.x, -0.3, f.z).normalize(),
    };
  };
  const blowBalls = (p: V3, dx: number, dz: number, dt: number) => {
    const L = 2.8;
    for (const b of play.loose()) {
      const rx = b.p.x - p.x;
      const rz = b.p.z - p.z;
      const a = rx * dx + rz * dz;
      if (a < 0 || a > L) continue;
      const half = 0.2 + 0.55 * (a / L);
      const lat = -rx * dz + rz * dx;
      if (Math.abs(lat) > half) continue;
      const k = (1 - a / L) * 9 * dt;
      play.kick(b, dx * k + (lat / half) * dz * -k * 0.2, dz * k + (lat / half) * dx * k * 0.2, 0);
    }
  };
  /** 脚边的球被踢开一点 */
  const footKick = (dt: number, speed: number) => {
    if (speed < 0.3) return;
    for (const b of play.loose()) {
      const dx = b.p.x - pos.x;
      const dz = b.p.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.32 && d > 1e-4) play.kick(b, (dx / d) * speed * 0.6 * dt * 8, (dz / d) * speed * 0.6 * dt * 8, 0.3);
    }
  };
  const pickerHead = (out = new THREE.Vector3()) => {
    const pk = pickerObj();
    const lz = pk?.visible ? pk.position.z : PICK_REACH;
    const lx = pk?.visible ? pk.position.x : 0;
    return out.set(
      pos.x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
      pos.y,
      pos.z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
    );
  };
  const collect = () => {
    const h = pickerHead();
    let n = pickerCount();
    if (n >= PICKER_MAX) return;
    for (const b of play.loose()) {
      if (Math.hypot(b.p.x - h.x, b.p.z - h.z) < 0.36 && b.p.y < 0.5) {
        play.collect(b as LooseBall);
        n++;
        if (n >= PICKER_MAX) break;
      }
    }
    if (n !== pickerCount()) setPickerCount(n);
  };

  const setPose = (name: string, ph?: number) => {
    const n = has(name) || name === 'idle' ? name : 'idle';
    if (ph === undefined) {
      if (lastPose !== n) ud.pose?.(n);
    } else ud.pose?.(n, ph);
    lastPose = n;
  };

  // ── 相机 ──
  const cam = pipe.rig.target;
  cam.set(pos.x, pos.y, pos.z + 1);
  const follow = (dt: number) => {
    // 人在画面里稍微偏上（下面是拇指区）：看向人南边 1 米
    const want = v(pos.x, pos.y, pos.z + 1.0);
    const DZX = 1.4;
    const DZZ = 1.1;
    const goal = cam.clone();
    if (want.x - goal.x > DZX) goal.x = want.x - DZX;
    if (want.x - goal.x < -DZX) goal.x = want.x + DZX;
    if (want.z - goal.z > DZZ) goal.z = want.z - DZZ;
    if (want.z - goal.z < -DZZ) goal.z = want.z + DZZ;
    goal.y = want.y;
    const k = 1 - Math.exp(-dt * 4);
    cam.x += (goal.x - cam.x) * k;
    cam.z += (goal.z - cam.z) * k;
    cam.y += (goal.y - cam.y) * (1 - Math.exp(-dt * 3));
    clampCam();
  };
  const clampCam = () => {
    const low = pipe.lowSize;
    const mpt = pipe.rig.metersPerTexel;
    const halfW = ((low.x - 2) * mpt) / 2;
    const halfD = ((low.y - 2) * mpt) / 2 / Math.sin(pipe.rig.pitch);
    // 岛外留一点天和岛底（南边多留：岛底挂在画面下方）
    const X0 = -28.5 - 4;
    const X1 = 28.5 + 4;
    const Z0 = -30.5 - 4;
    const Z1 = 27.5 + 12;
    cam.x = halfW * 2 >= X1 - X0 ? (X0 + X1) / 2 : clamp(cam.x, X0 + halfW, X1 - halfW);
    cam.z = halfD * 2 >= Z1 - Z0 ? (Z0 + Z1) / 2 : clamp(cam.z, Z0 + halfD, Z1 - halfD);
  };

  // ── 点地面：要过网就绕网柱 ──
  /** 同一层上的一段：要过网就从近的那根网柱外绕 */
  const planSeg = (from: V3, x: number, z: number): V3[] => {
    const pts: V3[] = [];
    const crosses = Math.sign(from.z) !== Math.sign(z) && Math.abs(from.z) < COURT.padHl + 3 && Math.abs(from.y) < 0.5;
    if (crosses) {
      // 过网那一刻的 x
      const t = from.z / (from.z - z);
      const xc = from.x + (x - from.x) * t;
      if (Math.abs(xc) < NET_X + BODY + 0.1) {
        // 东边网柱外有裁判椅，要绕得更远
        const west = v(-NET_X - 0.55, 0, 0);
        const east = v(NET_X + 1.75, 0, 0);
        const cost = (w: V3) => Math.hypot(w.x - from.x, from.z) + Math.hypot(x - w.x, z);
        const w = cost(west) <= cost(east) ? west : east;
        const s0 = Math.sign(from.z) || 1;
        pts.push(v(w.x, 0, s0 * 0.9), v(w.x, 0, -s0 * 0.9));
      }
    }
    pts.push(v(x, 0, z));
    return pts;
  };
  /** 点地面：球场台地 ↔ 低地要走台阶（先走到台阶口，再上/下台阶） */
  const STAIR_X = (STAIRS.x0 + STAIRS.x1) / 2;
  const STAIR_TOP = v(STAIR_X, H.court, STAIRS.z0 - 0.5);
  const STAIR_BOT = v(STAIR_X, H.low, STAIRS.z0 + STAIRS.run * STAIRS.steps + 0.5);
  const levelOf = (y: number | null) =>
    y === null ? null : Math.abs(y - H.court) < 0.2 ? 'court' : Math.abs(y - H.low) < 0.2 ? 'low' : 'other';
  const planPath = (x: number, z: number): V3[] => {
    const a = levelOf(pos.y);
    const b = levelOf(ground(x, z));
    if (a && b && a !== b && a !== 'other' && b !== 'other') {
      const [p, q] = a === 'court' ? [STAIR_TOP, STAIR_BOT] : [STAIR_BOT, STAIR_TOP];
      return [...planSeg(pos, p.x, p.z), q.clone(), ...planSeg(q, x, z)];
    }
    return planSeg(pos, x, z);
  };

  const state = (): ControlState => ({
    x: +pos.x.toFixed(3),
    y: +pos.y.toFixed(3),
    z: +pos.z.toFixed(3),
    yaw: +yaw.toFixed(3),
    held,
    pickerCount: pickerCount(),
    cartCount: play.cartCount(),
    sand: +(sand?.total() ?? 0).toFixed(4),
    clean,
    loose: play.loose().length,
    context: contextLabel(),
    action: actionLabel(),
    acting,
    busy: busy?.name ?? '',
  });

  return {
    director: D,
    setStick(x, y) {
      stick.set(x, y);
      if (stick.lengthSq() > 0.01) path = [];
    },
    setMove(dx, dz) {
      moveW.set(dx, dz);
      if (moveW.lengthSq() > 1) moveW.normalize();
      if (moveW.lengthSq() > 0.01) path = [];
    },
    setKey(code, down) {
      if (down) {
        keys.add(code);
        path = [];
      } else keys.delete(code);
    },
    tapGround(x, z) {
      path = planPath(x, z);
      stuckT = 0;
    },
    tapScreen(cssX, cssY, cssW, cssH) {
      // 先按自己的高度求交，再按落点的地面高度求一次
      let p = pipe.pickGround(cssX, cssY, cssW, cssH, pos.y);
      if (!p) return;
      const g = ground(p.x, p.z);
      if (g !== null && Math.abs(g - pos.y) > 0.05) {
        const p2 = pipe.pickGround(cssX, cssY, cssW, cssH, g);
        if (p2 && ground(p2.x, p2.z) !== null) p = p2;
      }
      this.tapGround(p.x, p.z);
    },
    setAction(down) {
      actionDown = down;
      if (down && held === 'picker' && actionLabel() === '倒球') startDump();
    },
    context: doContext,
    state,
    tools: () => tools.map((t) => ({ kind: t.kind, where: t.where, x: +t.pos.x.toFixed(2), z: +t.pos.z.toFixed(2) })),
    cartPos: () => play.cart?.position.clone() ?? null,
    pathLeft: () => path.length,
    update(dt, t) {
      // ── 想往哪走（世界 xz，长度 0..1） ──
      const want = new THREE.Vector2();
      const yawC = pipe.rig.yaw;
      const R = { x: Math.cos(yawC), z: -Math.sin(yawC) };
      const Dn = { x: Math.sin(yawC), z: Math.cos(yawC) };
      let kx = 0;
      let ky = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) ky -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) ky += 1;
      const sx = stick.x + kx;
      const sy = stick.y + ky;
      want.set(sx * R.x + sy * Dn.x, sx * R.z + sy * Dn.z);
      want.add(moveW);
      if (want.lengthSq() > 1) want.normalize();
      if (want.lengthSq() < 0.0025 && path.length) {
        const p = path[0];
        const dx = p.x - pos.x;
        const dz = p.z - pos.z;
        const d = Math.hypot(dx, dz);
        const last = path.length === 1;
        if (d < (last ? 0.12 : 0.35)) path.shift();
        else want.set(dx / d, dz / d).multiplyScalar(last ? Math.min(1, d / 0.6 + 0.25) : 1);
      }

      // ── 一次性动作（拿放、倒球）：不能走 ──
      let speed = 0;
      acting = false;
      if (busy) {
        const b = busy;
        const k0 = b.t / b.dur;
        b.t += dt;
        const k = Math.min(1, b.t / b.dur);
        if (k0 < 0.5 && k >= 0.5) b.mid?.();
        b.tick?.(k);
        if (b.name === 'pickup') setPose('pickup', Math.min(0.999, k));
        else setPose(has('dump') ? 'dump' : 'push', has('dump') ? Math.min(0.999, k) : 0);
        if (k >= 1) {
          busy = null;
          lastPose = '';
        }
      } else {
        // 按住动作键：扫 / 吹（倒球在按下那一刻开始）
        acting = actionDown && (held === 'broom' || held === 'blower');
        const max = acting
          ? held === 'broom'
            ? SPEED.sweeping
            : SPEED.blowing
          : held === 'picker'
            ? SPEED.picker
            : SPEED.walk;
        const mag = want.length();
        if (mag > 0.05) {
          const dir = Math.atan2(want.x, want.y);
          // 先转身，转得差不多了才迈步（扫地/吹的时候转得慢一点）
          yaw = turnTo(yaw, dir, dt * (acting ? 5 : 12));
          let dd = dir - yaw;
          dd -= Math.round(dd / (Math.PI * 2)) * Math.PI * 2;
          const go = Math.max(0, Math.cos(dd)) * mag * max * dt;
          const moved = tryStep((want.x / mag) * go, (want.y / mag) * go);
          speed = moved / Math.max(dt, 1e-4);
          if (path.length) {
            stuckT = moved < go * 0.2 ? stuckT + dt : 0;
            if (stuckT > 0.6) path = [];
          }
        } else stuckT = 0;
        footKick(dt, speed);

        if (acting) {
          actT += dt;
          actAcc += dt;
          if (held === 'broom') {
            setPose('sweep', (actT / 1.3) % 1);
            if (actAcc > 0.1) {
              actAcc = 0;
              const f = fwd();
              const bx = pos.x + f.x * 1.15;
              const bz = pos.z + f.z * 1.15;
              const got = sand?.sweep(bx, bz, 0.8, 0.05) ?? 0;
              if (got > 0.0004 && rnd() < 0.7)
                fx.puff(v(bx, pos.y + (sand?.at(bx, bz) ?? 0), bz + 0.2), Math.min(0.26, 0.12 + got * 12), 2);
              else if (rnd() < 0.15) fx.puff(v(bx, pos.y, bz), 0.1, 1);
            }
          } else {
            setPose('blow', (actT / 2.4) % 1);
            D.position.copy(pos);
            D.rotation.y = yaw;
            const n = nozzle();
            const fl = Math.hypot(n.d.x, n.d.z) || 1;
            const dx = n.d.x / fl;
            const dz = n.d.z / fl;
            fx.spray(n.p, n.d, dt);
            blowBalls(n.p, dx, dz, dt);
            if (actAcc > 0.08) {
              actAcc = 0;
              // 锥从管口后面 0.6 米起（管口下面、脚前那块也吹得到），长 3.2 米
              const got = sand?.blow(n.p.x - dx * 0.6, n.p.z - dz * 0.6, dx, dz, 3.2, 1.6, 0.035) ?? 0;
              if (got > 0.0005) {
                const k = 1.2 + rnd() * 1.0;
                fx.puff(v(n.p.x + dx * k, pos.y + 0.05, n.p.z + dz * k), Math.min(0.3, 0.14 + got * 8), 1);
              }
            }
          }
        } else {
          actT = 0;
          if (held === 'picker') {
            walkPh = (walkPh + (speed * dt) / 1.1) % 1;
            setPose('push', walkPh);
            pickerObj()?.userData.roll?.(dt, speed);
          } else if (speed > 0.2) {
            walkPh = (walkPh + (speed * dt) / 1.25) % 1;
            setPose('walk', walkPh);
          } else setPose('idle');
        }
      }

      D.position.copy(pos);
      D.rotation.y = yaw;
      D.userData.update?.(dt, t);
      if (held === 'picker' && !busy) {
        D.updateMatrixWorld(true);
        collect();
      }

      // ── 标记 ──
      if (marker) {
        let at: Mark | null = null;
        let kind: 'pick' | 'drop' | 'use' = 'pick';
        const n = busy ? null : nearTool();
        if (n) at = n.mark;
        else if (held && !busy && nearOwnSlot(held)) {
          at = rackMark(held, tmpMark);
          kind = 'drop';
        } else if (held === 'picker' && pickerCount() > 0 && nearCart() && play.cart) {
          tmpMark.base.copy(play.cart.position);
          tmpMark.h = 1.45;
          tmpMark.ring = true;
          at = tmpMark;
          kind = 'use';
        }
        marker.visible = !!at;
        if (at) {
          marker.position.copy(at.base);
          marker.userData.setHeight?.(at.h);
          marker.userData.setRing?.(at.ring);
          marker.userData.setKind?.(kind);
          marker.userData.update?.(dt, t);
        }
      }
      for (const tl of tools) if (tl.obj.visible) tl.obj.userData.update?.(dt, t);
      cleanAcc += dt;
      if (cleanAcc > 0.25) {
        cleanAcc = 0;
        measureClean();
      }
      follow(dt);
    },
  };
}
