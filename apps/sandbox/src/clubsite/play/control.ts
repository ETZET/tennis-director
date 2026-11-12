// 总监操控的核心（不碰 DOM；界面在 hud.ts）：走路（摇杆 / 键盘 / 点地面寻路）、碰撞、台阶、相机跟随、
// 互动点（用 / 拿 / 放）、手里的东西、一次性动作（busy）、按住干活（hold）、气泡/顶栏/提示的数据。
// 接口说明见 index.ts 顶上。
import * as THREE from 'three';
import { setStride } from '../people/rig/rig';
import { type Circle, NavMap, type NavSpec, type Rect } from './nav';

/** 各场景自己那份 PixelPipeline 的结构（只用到这些） */
export interface PipeLike {
  rig: { target: THREE.Vector3; yaw: number; pitch: number; metersPerTexel: number };
  px: number;
  readonly lowSize: THREE.Vector2;
  readonly camera: THREE.Camera;
  pickGround(cssX: number, cssY: number, cssW: number, cssH: number, groundY?: number): THREE.Vector3 | null;
}

export interface PlayState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 走路速度（米/秒） */
  speed: number;
  /** 手里拿着的东西 */
  held: Item | null;
  /** 正在做一次性动作（busy 的名字），没有 = '' */
  busy: string;
  /** 正在按住干活的互动点 / 东西的 id，没有 = '' */
  holding: string;
  /** 模拟时间（秒） */
  t: number;
}

type Label = string | ((s: PlayState) => string);

/** 互动点：场景登记（play.add）。离 at() 的平面距离 ≤ radius 时生效；同时有好几个 → priority 大的、再近的 */
export interface Interactable {
  id: string;
  /** 世界坐标：标记悬在它上方 0.35 米；总监用的时候转身面向它；点屏幕时按它的投影位置命中 */
  at(): THREE.Vector3;
  /** 生效距离（米，总监脚下到 at() 的水平距离） */
  radius: number;
  /** 点它（点屏幕）时走到哪站着；不给 = at() 朝总监方向 radius·0.6 处附近能站的点 */
  stand?(): readonly [number, number] | null;
  priority?: number;
  /** 不显示头顶标记 */
  noMark?: boolean;

  // ── 动作键（大按钮 / 空格 / E）──
  /** 按钮上的字（中文，2～4 个字最好）；没有 label = 这个互动点不占动作键 */
  label?: Label;
  canUse?(s: PlayState): boolean;
  /** 按下那一刻 */
  onUse?(play: Play): void;
  /** 按住期间每个模拟步（dt 秒）；返回 false = 干完了（松手前就结束） */
  onHold?(dt: number, play: Play): boolean | undefined;
  /** 松开（或干完、被打断） */
  onRelease?(play: Play): void;
  /** 按住时的姿势（按 period 循环）；不给 = 'idle' */
  pose?: string;
  /** 按住时还能走多快（米/秒，默认 0 = 站着干） */
  holdSpeed?: number;
  /** 点屏幕走到这里以后自动按一下（只对 onUse，默认 true） */
  autoUse?: boolean;

  // ── 拿/放键（小按钮 / F / 回车）──
  /** 空手时：按钮上的字（如 "拿毛巾"）；有 onPickUp 才生效 */
  pickLabel?: Label;
  canPickUp?(s: PlayState): boolean;
  /** 一般在里面 play.give(新东西)；默认先做 0.5 秒 pickup 姿势，在中点调用 */
  onPickUp?(play: Play): void;
  /** 手里有东西时：这里收不收它 */
  accepts?(item: Item, s: PlayState): boolean;
  /** 手里有东西时按钮上的字（如 "递毛巾"、"放回架子"） */
  putLabel?: string | ((item: Item, s: PlayState) => string);
  /** 收下：item 已经离手（item.where = 'loose'）；在里面 item.place / stow / remove，都不做就放在总监脚前 */
  onPutDown?(item: Item, play: Play): void;
  /** 拿/放的动作：默认 { pose: 'pickup', dur: 0.5 }；null = 立刻 */
  pickBusy?: { pose: string; dur: number } | null;
}

/** 能拿在手里的东西（play.addItem）：躺在地上 → 走近 "拿起 X"；拿着 → "放下 X" 或放到收它的互动点 */
export interface ItemSpec {
  id: string;
  /** 中文名（按钮 "拿起 毛巾"） */
  name: string;
  /** 地上的样子（拿在手里时：没有 prop 就是这个对象挂到右手上） */
  obj: THREE.Object3D;
  /** 拿在手里用人物的内置道具（'broom' | 'blower' | 'picker' | 'paddle' | 'cup' | 登记过的工具名）；地上的 obj 这时藏起来 */
  prop?: string;
  /** 握点（clubsite/people 的 GripSpec）；不给就读 obj.userData.grip */
  grip?: Record<string, unknown>;
  /** 地上时多近能拿（米，默认 1.0） */
  radius?: number;
  /** 拿着走路的姿势（默认 'walk'；推车、捡球器用 'push'，拖垫 'drag'） */
  carryPose?: string;
  /** 拿着走多快（米/秒，默认跟总监一样） */
  carrySpeed?: number;
  /** 拿在手里时动作键能干的活（扫、吹、浇…）：和互动点的 label/canUse/onUse/onHold/onRelease/pose/holdSpeed 一样 */
  use?: Pick<Interactable, 'label' | 'canUse' | 'onUse' | 'onHold' | 'onRelease' | 'pose' | 'holdSpeed'>;
  /** 放在地上时离地多高（米，默认 0） */
  groundY?: number;
  /** false = 不能随手放下（只能放到收它的互动点） */
  droppable?: boolean;
}

export interface Item {
  readonly id: string;
  readonly spec: ItemSpec;
  readonly obj: THREE.Object3D;
  /** ground = 地上能拿；held = 在总监手里；loose = 刚离手；away = 场景摆到别处（不能拿）；gone = 删了 */
  where: 'ground' | 'held' | 'loose' | 'away' | 'gone';
  /** 摆到地上（能拿）：高度按导航的地面 + groundY */
  place(x: number, z: number, yaw?: number): void;
  /** 挂到 parent 上的本地位置（不能拿：放在柜台上、架子上、交给别人） */
  stow(parent: THREE.Object3D, pos?: THREE.Vector3, rotY?: number): void;
  /** 删掉（从场景拿走） */
  remove(): void;
}

export interface BusySpec {
  /** 名字（state().busy） */
  name?: string;
  /** 秒 */
  dur: number;
  /** 姿势：phase 从 0 走到 1（loop = true 时按姿势的 period 循环） */
  pose?: string;
  loop?: boolean;
  /** 转身面向这个世界点 */
  face?: THREE.Vector3 | readonly [number, number];
  /** 0..1 的进度，每步 */
  tick?(k: number, play: Play): void;
  /** 进度过半那一刻（拿起来、按铃、递过去） */
  mid?(play: Play): void;
  end?(play: Play): void;
}

/** 气泡的锚：人（头顶上方）、世界点、或每帧求的点 */
export type Anchor = THREE.Object3D | THREE.Vector3 | (() => THREE.Vector3 | null);

export interface Bubble {
  key: string;
  anchor: Anchor;
  text: string;
  /** 到这个模拟时间消失（Infinity = 一直在，直到 bubble(key, null)） */
  until: number;
  /** 锚是人时，头顶上方多高（米，默认 2.15） */
  dy: number;
}

export interface CameraOpts {
  /** 总监在画面中心偏上多少（米，往南多看）：竖屏 / 横屏 */
  lead?: { portrait: number; landscape: number };
  /** 死区（米）：总监离相机目标这么远以内相机不动 */
  dead?: [number, number];
  /** 画面不出这个世界范围（只对 yaw 0） */
  view?: Rect;
  /** 缩放范围（相对开局的 米/纹素 ÷ 像素级别） */
  zoom?: [number, number];
}

export interface PlayOpts {
  scene: THREE.Scene;
  pipe: PipeLike;
  /** clubsite/people 的 director（场景里已经有的那个人） */
  director: THREE.Object3D;
  start: readonly [number, number];
  /** 开局朝向（弧度，0 = 朝镜头 +z） */
  yaw?: number;
  nav: NavSpec;
  camera?: CameraOpts;
  /** 走路速度（米/秒，默认 3） */
  speed?: number;
}

export interface Play {
  readonly director: THREE.Object3D;
  readonly nav: NavMap;
  readonly scene: THREE.Scene;
  /** 模拟一步（main 的固定步长循环里调） */
  update(dt: number, t: number): void;

  // 互动
  add(it: Interactable): () => void;
  remove(id: string): void;
  get(id: string): Interactable | undefined;
  addItem(spec: ItemSpec): Item;
  item(id: string): Item | undefined;
  held(): Item | null;
  /** 把东西放到总监手里（手里原来的放在脚前） */
  give(item: Item): void;
  /** 从手里拿走（where = 'loose'，留在手的位置）；之后 place / stow / remove */
  take(): Item | null;
  /** 手里的放到脚前地上 */
  drop(): void;
  busy(spec: BusySpec): void;
  isBusy(): boolean;

  // 挡路的
  /** 会动的挡路圆（人、车）：每帧调 fn；返回移除函数 */
  addBlocker(fn: () => Circle | readonly Circle[] | null | undefined): () => void;
  /** 一个人当挡路圆（半径默认 0.3） */
  blockPerson(obj: THREE.Object3D, r?: number): () => void;

  // 界面数据（hud 读）
  say(anchor: Anchor, text: string, sec?: number, dy?: number): void;
  bubble(key: string, anchor: Anchor | null, text?: string, dy?: number): void;
  stat(key: string, label: string, value: string | number | null): void;
  toast(text: string, sec?: number): void;

  // 走
  walkTo(x: number, z: number): boolean;
  teleport(x: number, z: number, yaw?: number): void;
  state(): PlayState;

  // 输入（hud 和测试用）
  setStick(x: number, y: number): void;
  setKey(code: string, down: boolean): void;
  setUse(down: boolean): void;
  pick(): void;
  tapScreen(cssX: number, cssY: number, cssW: number, cssH: number): void;
  tapWorld(x: number, z: number): void;
  pathLeft(): number;
  /** 导航变了（大世界建好了新区域）：正在走的路按原来的目标、从现在的位置重新规划；走不到就停。没在走 = false */
  replan(): boolean;

  /** hud 用：当前的按钮文字、标记、气泡、顶栏、提示 */
  ui(): PlayUi;
  /** 屏幕投影（CSS 像素） */
  project(p: THREE.Vector3, cssW: number, cssH: number): { x: number; y: number };
  /** 缩放（pinch / 滚轮）：乘一个系数，按 camera.zoom 夹住 */
  zoomBy(k: number): void;
}

export interface PlayUi {
  use: string;
  usingNow: boolean;
  pick: string;
  mark: THREE.Vector3 | null;
  bubbles: readonly Bubble[];
  stats: readonly { key: string; label: string; value: string }[];
  toast: { text: string; id: number } | null;
}

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return a + d * Math.min(1, k);
};
const lab = (l: Label | undefined, s: PlayState) => (typeof l === 'function' ? l(s) : (l ?? ''));

export function createPlay(opts: PlayOpts): Play {
  const { scene, pipe, director: D } = opts;
  const ud = D.userData;
  const nav = new NavMap(opts.nav);
  const SPEED = opts.speed ?? 3;
  const camOpts = opts.camera ?? {};
  const poses = new Set<string>((ud.poses as readonly string[] | undefined) ?? []);
  const periodOf = (p: string) => (ud.period?.(p) as number | undefined) ?? 1;

  // ── 总监 ──
  const pos = v3(opts.start[0], 0, opts.start[1]);
  {
    const free = nav.standAt(pos.x, pos.z) === null ? nav.nearestFree(pos.x, pos.z, 3) : null;
    if (free) pos.set(free[0], 0, free[1]);
    pos.y = nav.height(pos.x, pos.z) ?? opts.nav.groundAt(pos.x, pos.z);
  }
  let yaw = opts.yaw ?? Math.PI;
  let speed = 0;
  let walkPh = 0;
  let idlePh = 0;
  let simT = 0;
  if (D.parent !== scene) scene.add(D);

  // ── 互动点、东西 ──
  const inters = new Map<string, Interactable>();
  const items = new Map<string, Item>();
  let held: Item | null = null;

  // ── 输入 ──
  const stick = new THREE.Vector2();
  const keys = new Set<string>();
  let path: [number, number][] = [];
  let pathTarget: { x: number; z: number; inter: Interactable | null; item: Item | null } | null = null;
  let stuckT = 0;
  let replans = 0;

  // ── 动作 ──
  let busy: (BusySpec & { t: number; half: boolean }) | null = null;
  let hold: {
    id: string;
    spec: Interactable | NonNullable<ItemSpec['use']>;
    face: Interactable | null;
    t: number;
  } | null = null;

  // ── 挡路的圆 ──
  const blockers = new Set<() => Circle | readonly Circle[] | null | undefined>();
  const circles = (): Circle[] => {
    const out: Circle[] = [];
    for (const f of blockers) {
      const c = f();
      if (!c) continue;
      if (Array.isArray(c)) out.push(...(c as Circle[]));
      else out.push(c as Circle);
    }
    return out;
  };

  // ── 界面数据 ──
  const bubbles = new Map<string, Bubble>();
  let sayN = 0;
  const stats = new Map<string, { key: string; label: string; value: string }>();
  let toastV: { text: string; id: number; until: number } | null = null;
  let toastN = 0;

  const state = (): PlayState => ({
    x: +pos.x.toFixed(3),
    y: +pos.y.toFixed(3),
    z: +pos.z.toFixed(3),
    yaw: +yaw.toFixed(3),
    speed: +speed.toFixed(2),
    held,
    busy: busy ? (busy.name ?? 'busy') : '',
    holding: hold?.id ?? '',
    t: simT,
  });

  const flat = (p: THREE.Vector3) => Math.hypot(p.x - pos.x, p.z - pos.z);
  const faceTo = (x: number, z: number) => {
    if (Math.hypot(x - pos.x, z - pos.z) > 0.05) yaw = Math.atan2(x - pos.x, z - pos.z);
  };

  /** 范围里的互动点，按 priority、距离排 */
  const nearby = (ok: (it: Interactable, s: PlayState) => boolean): Interactable | null => {
    const s = state();
    let best: Interactable | null = null;
    let bp = -Infinity;
    let bd = Infinity;
    for (const it of inters.values()) {
      const d = flat(it.at());
      if (d > it.radius) continue;
      if (!ok(it, s)) continue;
      const p = it.priority ?? 0;
      if (p > bp || (p === bp && d < bd)) {
        best = it;
        bp = p;
        bd = d;
      }
    }
    return best;
  };
  const useTarget = () =>
    nearby((it, s) => !!(it.label && (it.onUse || it.onHold) && (it.canUse?.(s) ?? true) && lab(it.label, s)));
  const putTarget = (item: Item) => nearby((it, s) => !!(it.onPutDown && (it.accepts?.(item, s) ?? false)));
  const pickTarget = () => nearby((it, s) => !!(it.onPickUp && (it.canPickUp?.(s) ?? true) && lab(it.pickLabel, s)));
  const groundItem = (): Item | null => {
    let best: Item | null = null;
    let bd = Infinity;
    for (const it of items.values()) {
      if (it.where !== 'ground') continue;
      const d = flat(it.obj.position);
      if (d <= (it.spec.radius ?? 1) && d < bd) {
        best = it;
        bd = d;
      }
    }
    return best;
  };

  const useLabel = (): string => {
    if (busy) return '';
    const s = state();
    if (hold) return lab(hold.spec.label, s);
    const it = useTarget();
    if (it) return lab(it.label, s);
    const u = held?.spec.use;
    if (u && (u.canUse?.(s) ?? true)) return lab(u.label, s);
    return '';
  };
  const pickLabel = (): string => {
    if (busy || hold) return '';
    const s = state();
    if (held) {
      const t = putTarget(held);
      if (t) {
        const pl = t.putLabel;
        return typeof pl === 'function' ? pl(held, s) : (pl ?? `放下 ${held.spec.name}`);
      }
      return held.spec.droppable === false ? '' : `放下 ${held.spec.name}`;
    }
    const t = pickTarget();
    const gi = groundItem();
    if (t && (!gi || (t.priority ?? 0) >= 0)) return lab(t.pickLabel, s);
    if (gi) return `拿起 ${gi.spec.name}`;
    return '';
  };

  // ── 手里的东西 ──
  const groundAt = (x: number, z: number) => nav.height(x, z) ?? opts.nav.groundAt(x, z);
  const makeItem = (spec: ItemSpec): Item => {
    const it: Item = {
      id: spec.id,
      spec,
      obj: spec.obj,
      where: 'away',
      place(x, z, ry) {
        if (held === it) releaseHand();
        if (it.obj.parent !== scene) scene.attach(it.obj);
        it.obj.position.set(x, groundAt(x, z) + (spec.groundY ?? 0), z);
        it.obj.rotation.set(0, ry ?? it.obj.rotation.y, 0);
        it.obj.visible = true;
        it.obj.userData.setState?.('ground');
        it.where = 'ground';
      },
      stow(parent, p, ry) {
        if (held === it) releaseHand();
        parent.add(it.obj);
        if (p) it.obj.position.copy(p);
        it.obj.rotation.set(0, ry ?? 0, 0);
        it.obj.visible = true;
        it.obj.userData.setState?.('ground');
        it.where = 'away';
      },
      remove() {
        if (held === it) releaseHand();
        it.obj.removeFromParent();
        it.where = 'gone';
        items.delete(it.id);
      },
    };
    return it;
  };
  /** 手松开（东西留在手的世界位置，挂回场景，where = loose） */
  const releaseHand = () => {
    const it = held;
    if (!it) return;
    held = null;
    if (it.spec.prop) {
      ud.setProp?.(null);
      D.updateMatrixWorld(true);
      const hp = (ud.handPoint?.('R') as THREE.Vector3 | undefined) ?? pos.clone().setY(pos.y + 0.9);
      if (it.obj.parent !== scene) scene.attach(it.obj);
      it.obj.position.copy(hp);
      it.obj.visible = true;
    } else {
      D.updateMatrixWorld(true);
      ud.release?.(scene);
      if (it.obj.parent !== scene) scene.attach(it.obj);
    }
    it.where = 'loose';
  };
  /** 脚前 0.6 米能站就放那，不然脚下 */
  const dropSpot = (): [number, number] => {
    const x = pos.x + Math.sin(yaw) * 0.6;
    const z = pos.z + Math.cos(yaw) * 0.6;
    const g = nav.height(x, z);
    return g !== null && Math.abs(g - pos.y) <= nav.stepUp && !nav.hitsBlocked(x, z, 0.05) ? [x, z] : [pos.x, pos.z];
  };
  const giveItem = (it: Item) => {
    if (held === it) return;
    if (held) dropHeld();
    if (it.spec.prop) {
      it.obj.visible = false;
      ud.setProp?.(it.spec.prop);
    } else {
      ud.hold?.(it.obj, it.spec.grip, it.id);
    }
    it.where = 'held';
    held = it;
  };
  const dropHeld = () => {
    const it = held;
    if (!it) return;
    releaseHand();
    const [x, z] = dropSpot();
    it.place(x, z, yaw);
  };

  // ── 动作 ──
  const startBusy = (b: BusySpec) => {
    stopHold();
    path = [];
    pathTarget = null;
    if (b.face) {
      const f = b.face as THREE.Vector3;
      if ((f as THREE.Vector3).isVector3) faceTo(f.x, f.z);
      else faceTo((b.face as readonly number[])[0], (b.face as readonly number[])[1]);
    }
    busy = { ...b, t: 0, half: false };
  };
  const pickAct = (face: THREE.Vector3 | null, pb: Interactable['pickBusy'], fn: () => void) => {
    const spec = pb === undefined ? { pose: 'pickup', dur: 0.5 } : pb;
    if (!spec) {
      if (face) faceTo(face.x, face.z);
      fn();
      return;
    }
    startBusy({ name: 'pick', dur: spec.dur, pose: spec.pose, face: face ?? undefined, mid: fn });
  };
  const doPick = () => {
    if (busy || hold) return;
    if (held) {
      const t = putTarget(held);
      if (t) {
        pickAct(t.at(), t.pickBusy, () => {
          const it = held;
          if (!it) return;
          releaseHand();
          t.onPutDown?.(it, api);
          if (it.where === 'loose') {
            const [x, z] = dropSpot();
            it.place(x, z, yaw);
          }
        });
        return;
      }
      if (held.spec.droppable === false) return;
      pickAct(null, undefined, dropHeld);
      return;
    }
    const t = pickTarget();
    const gi = groundItem();
    if (t && (!gi || (t.priority ?? 0) >= 0)) {
      pickAct(t.at(), t.pickBusy, () => t.onPickUp?.(api));
      return;
    }
    if (gi) pickAct(gi.obj.position.clone(), undefined, () => gi.where === 'ground' && giveItem(gi));
  };
  const stopHold = () => {
    if (!hold) return;
    const h = hold;
    hold = null;
    h.spec.onRelease?.(api);
  };
  const doUse = (down: boolean) => {
    if (!down) {
      stopHold();
      return;
    }
    if (busy || hold) return;
    const s = state();
    const it = useTarget();
    const spec = it ?? (held?.spec.use && (held.spec.use.canUse?.(s) ?? true) ? held.spec.use : null);
    if (!spec) return;
    if (it) {
      const a = it.at();
      faceTo(a.x, a.z);
    }
    path = [];
    pathTarget = null;
    spec.onUse?.(api);
    if (spec.onHold && !busy) hold = { id: it?.id ?? held?.id ?? '', spec, face: it, t: 0 };
  };

  // ── 姿势 ──
  const setPose = (name: string, ph: number) => {
    const n = poses.has(name) ? name : 'idle';
    ud.pose?.(n, ((ph % 1) + 1) % 1);
  };

  // ── 移动 ──
  /** 迈一步：推出挡路的，查能站；不行就只走 x / 只走 z。返回走了多远 */
  const tryStep = (dx: number, dz: number, circ: readonly Circle[]): number => {
    // 现在已经压着挡路的多少（关场把总监关在里面、人走到总监身上）：推出这一段不算"被挤着走"，不然哪个方向都动不了
    const cur = { x: pos.x, z: pos.z };
    nav.pushOut(cur, circ);
    const pre = Math.hypot(cur.x - pos.x, cur.z - pos.z);
    const cands: [number, number][] = [
      [dx, dz],
      [dx, 0],
      [0, dz],
    ];
    for (const [ax, az] of cands) {
      if (Math.abs(ax) + Math.abs(az) < 1e-7) continue;
      const np = { x: pos.x + ax, z: pos.z + az };
      nav.pushOut(np, circ);
      const h = nav.clearAt(np.x, np.z);
      if (h === null || Math.abs(h - pos.y) > nav.stepUp) continue;
      if (nav.hitsBlocked(np.x, np.z, nav.body - 0.03)) continue;
      const moved = Math.hypot(np.x - pos.x, np.z - pos.z);
      // 推出去的比想走的还远（被挤着走）：只接受不往回走的（已经压进去的那段除外）
      if (moved > Math.hypot(ax, az) * 1.5 + 0.02 + pre) continue;
      pos.set(np.x, h, np.z);
      return moved;
    }
    return 0;
  };
  const plan = (x: number, z: number, inter: Interactable | null, item: Item | null): boolean => {
    const p = nav.findPath(pos.x, pos.z, x, z, circles());
    if (!p) {
      path = [];
      pathTarget = null;
      return false;
    }
    path = p;
    pathTarget = { x, z, inter, item };
    stuckT = 0;
    return true;
  };
  const standFor = (it: Interactable): [number, number] => {
    const s = it.stand?.();
    if (s) return [s[0], s[1]];
    const a = it.at();
    const dx = pos.x - a.x;
    const dz = pos.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    const k = Math.min(it.radius * 0.6, d);
    const want: [number, number] = [a.x + (dx / d) * k, a.z + (dz / d) * k];
    return nav.nearestFree(want[0], want[1], it.radius) ?? want;
  };
  const arrive = () => {
    const t = pathTarget;
    pathTarget = null;
    if (!t) return;
    if (t.inter) {
      const a = t.inter.at();
      faceTo(a.x, a.z);
      if (flat(a) > t.inter.radius) return;
      if (t.inter.onUse && t.inter.autoUse !== false && useTarget() === t.inter && !t.inter.onHold) {
        doUse(true);
        stopHold();
        return;
      }
      if (!held && t.inter.onPickUp && pickTarget() === t.inter) doPick();
      else if (held && t.inter.onPutDown && putTarget(held) === t.inter) doPick();
    } else if (t.item && t.item.where === 'ground' && !held) {
      faceTo(t.item.obj.position.x, t.item.obj.position.z);
      if (groundItem() === t.item) doPick();
    }
  };

  // ── 相机 ──
  const cam = pipe.rig.target;
  const ratio0 = pipe.rig.metersPerTexel / pipe.px;
  const leadZ = () => {
    const L = camOpts.lead ?? { portrait: 1.4, landscape: 0.5 };
    return innerWidth > innerHeight ? L.landscape : L.portrait;
  };
  const clampCam = () => {
    const V = camOpts.view;
    if (!V) return;
    const low = pipe.lowSize;
    const mpt = pipe.rig.metersPerTexel;
    const halfW = ((low.x - 2) * mpt) / 2;
    const halfD = ((low.y - 2) * mpt) / 2 / Math.sin(pipe.rig.pitch);
    cam.x = halfW * 2 >= V.x1 - V.x0 ? (V.x0 + V.x1) / 2 : THREE.MathUtils.clamp(cam.x, V.x0 + halfW, V.x1 - halfW);
    cam.z = halfD * 2 >= V.z1 - V.z0 ? (V.z0 + V.z1) / 2 : THREE.MathUtils.clamp(cam.z, V.z0 + halfD, V.z1 - halfD);
  };
  const follow = (dt: number, snap = false) => {
    const wx = pos.x;
    const wz = pos.z + leadZ();
    const [DX, DZ] = camOpts.dead ?? [0.8, 0.6];
    const gx = wx - cam.x > DX ? wx - DX : wx - cam.x < -DX ? wx + DX : cam.x;
    const gz = wz - cam.z > DZ ? wz - DZ : wz - cam.z < -DZ ? wz + DZ : cam.z;
    if (snap) {
      cam.set(wx, pos.y, wz);
    } else {
      const k = 1 - Math.exp(-dt * 4);
      cam.x += (gx - cam.x) * k;
      cam.z += (gz - cam.z) * k;
      cam.y += (pos.y - cam.y) * (1 - Math.exp(-dt * 3));
    }
    clampCam();
  };
  follow(0, true);

  // ── 投影 ──
  const pv = v3();
  const project = (p: THREE.Vector3, W: number, Hh: number) => {
    const low = pipe.lowSize;
    const lowW = low.x * pipe.px;
    const lowH = low.y * pipe.px;
    pv.copy(p).project(pipe.camera);
    return { x: ((pv.x + 1) / 2) * lowW - (lowW - W) / 2, y: ((1 - pv.y) / 2) * lowH - (lowH - Hh) / 2 };
  };

  const api: Play = {
    director: D,
    nav,
    scene,
    update(dt, t) {
      simT = t;
      const circ = circles();
      // ── 想往哪走 ──
      const want = new THREE.Vector2();
      const yc = pipe.rig.yaw;
      const R = { x: Math.cos(yc), z: -Math.sin(yc) };
      const Dn = { x: Math.sin(yc), z: Math.cos(yc) };
      let kx = 0;
      let ky = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) ky -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) ky += 1;
      const sx = stick.x + kx;
      const sy = stick.y + ky;
      want.set(sx * R.x + sy * Dn.x, sx * R.z + sy * Dn.z);
      if (want.lengthSq() > 1) want.normalize();
      const manual = want.lengthSq() > 0.0025;
      if (manual && path.length) {
        path = [];
        pathTarget = null;
      }
      if (!manual && path.length && !busy) {
        const [px, pz] = path[0];
        const dx = px - pos.x;
        const dz = pz - pos.z;
        const d = Math.hypot(dx, dz);
        const last = path.length === 1;
        // 中间的拐点 0.3 米内就算到了；可是从这里直着去下一个点不通（拐角、贴着不能走的边）就得走到拐点上（0.08）
        const near = last || (d < 0.3 && !nav.lineClear(pos.x, pos.z, path[1][0], path[1][1])) ? 0.08 : 0.3;
        if (d < near) {
          path.shift();
          if (!path.length) arrive();
        } else want.set(dx / d, dz / d).multiplyScalar(last ? Math.min(1, d / 0.5 + 0.3) : 1);
      }

      speed = 0;
      if (busy) {
        // ── 一次性动作：不能走 ──
        const b = busy;
        b.t += dt;
        const k = Math.min(1, b.t / b.dur);
        if (!b.half && k >= 0.5) {
          b.half = true;
          b.mid?.(api);
        }
        b.tick?.(k, api);
        const pose = b.pose ?? 'idle';
        setPose(pose, b.loop ? b.t / periodOf(pose) : Math.min(0.999, k));
        if (k >= 1) {
          busy = null;
          b.end?.(api);
        }
      } else {
        let max = held?.spec.carrySpeed ?? SPEED;
        if (hold) max = hold.spec.holdSpeed ?? 0;
        const mag = want.length();
        if (mag > 0.05 && max > 0) {
          const dir = Math.atan2(want.x, want.y);
          yaw = turnTo(yaw, dir, dt * (hold ? 5 : 12));
          let dd = dir - yaw;
          dd -= Math.round(dd / (Math.PI * 2)) * Math.PI * 2;
          const go = Math.max(0, Math.cos(dd)) * mag * max * dt;
          const moved = tryStep((want.x / mag) * go, (want.y / mag) * go, circ);
          speed = moved / Math.max(dt, 1e-4);
          if (path.length) {
            stuckT = moved < go * 0.25 ? stuckT + dt : 0;
            if (stuckT > 0.45) {
              // 被人挡住了：按现在的位置重新规划一次，还不行就停
              const tg = pathTarget;
              if (tg && replans < 2 && plan(tg.x, tg.z, tg.inter, tg.item)) replans++;
              else {
                path = [];
                pathTarget = null;
              }
              stuckT = 0;
            }
          } else replans = 0;
        } else stuckT = 0;

        if (hold) {
          // ── 按住干活 ──
          const h = hold;
          h.t += dt;
          if (h.face && speed < 0.05) {
            const a = h.face.at();
            yaw = turnTo(yaw, Math.atan2(a.x - pos.x, a.z - pos.z), dt * 8);
          }
          const pose = h.spec.pose ?? 'idle';
          setPose(pose, h.t / periodOf(pose));
          // 走出范围 / 不能再用了 → 停
          const s = state();
          const out = h.face && (flat(h.face.at()) > h.face.radius + 0.3 || !(h.face.canUse?.(s) ?? true));
          if (out || h.spec.onHold?.(dt, api) === false) {
            stopHold();
          }
        } else if (speed > 0.2) {
          // 小跑（3 米/秒）：步幅 1.3，腿按它摆（rig 的 walkLegs），脚不溜
          walkPh = (walkPh + (speed * dt) / setStride(D, 1.3)) % 1;
          setPose(held?.spec.carryPose ?? 'walk', walkPh);
        } else {
          idlePh = (idlePh + dt / periodOf('idle')) % 1;
          setPose('idle', idlePh);
        }
      }

      D.position.copy(pos);
      D.rotation.y = yaw;
      follow(dt);

      // 过期的气泡、提示
      for (const [k, b] of bubbles) if (b.until <= simT) bubbles.delete(k);
      if (toastV && toastV.until <= simT) toastV = null;
    },

    add(it) {
      inters.set(it.id, it);
      return () => {
        if (inters.get(it.id) === it) inters.delete(it.id);
      };
    },
    remove(id) {
      inters.delete(id);
    },
    get: (id) => inters.get(id),
    addItem(spec) {
      items.get(spec.id)?.remove();
      const it = makeItem(spec);
      items.set(spec.id, it);
      return it;
    },
    item: (id) => items.get(id),
    held: () => held,
    give: giveItem,
    take() {
      const it = held;
      if (!it) return null;
      releaseHand();
      return it;
    },
    drop: dropHeld,
    busy: startBusy,
    isBusy: () => !!busy,

    addBlocker(fn) {
      blockers.add(fn);
      return () => blockers.delete(fn);
    },
    blockPerson(obj, r = 0.3) {
      const c: Circle = { x: 0, z: 0, r };
      return api.addBlocker(() => {
        if (!obj.visible || !obj.parent || obj === D) return null;
        c.x = obj.matrixWorld.elements[12] || obj.position.x;
        c.z = obj.matrixWorld.elements[14] || obj.position.z;
        return c;
      });
    },

    say(anchor, text, sec = 2.5, dy = 2.15) {
      const key = `say${sayN++}`;
      bubbles.set(key, { key, anchor, text, until: simT + sec, dy });
    },
    bubble(key, anchor, text = '', dy = 2.15) {
      if (!anchor || !text) bubbles.delete(key);
      else bubbles.set(key, { key, anchor, text, until: Infinity, dy });
    },
    stat(key, label, value) {
      if (value === null) stats.delete(key);
      else stats.set(key, { key, label, value: String(value) });
    },
    toast(text, sec = 1.8) {
      toastV = { text, id: ++toastN, until: simT + sec };
    },

    walkTo: (x, z) => plan(x, z, null, null),
    teleport(x, z, ry) {
      pos.set(x, nav.height(x, z) ?? opts.nav.groundAt(x, z), z);
      if (ry !== undefined) yaw = ry;
      path = [];
      pathTarget = null;
      D.position.copy(pos);
      D.rotation.y = yaw;
      follow(0, true);
    },
    state,

    setStick(x, y) {
      stick.set(x, y);
    },
    setKey(code, down) {
      if (down) keys.add(code);
      else keys.delete(code);
    },
    setUse: doUse,
    pick: doPick,
    tapScreen(cssX, cssY, W, Hh) {
      if (busy) return;
      // 先看点到的是不是互动点 / 地上的东西（投影 40 像素以内）
      let best: { d: number; inter: Interactable | null; item: Item | null } | null = null;
      const s = state();
      for (const it of inters.values()) {
        const usable =
          (it.label && (it.onUse || it.onHold) && (it.canUse?.(s) ?? true)) ||
          (!held && it.onPickUp && (it.canPickUp?.(s) ?? true)) ||
          (held && it.onPutDown && it.accepts?.(held, s));
        if (!usable) continue;
        const p = project(it.at(), W, Hh);
        const d = Math.hypot(p.x - cssX, p.y - cssY);
        if (d < 40 && (!best || d < best.d)) best = { d, inter: it, item: null };
      }
      for (const it of items.values()) {
        if (it.where !== 'ground' || held) continue;
        const p = project(it.obj.position, W, Hh);
        const d = Math.hypot(p.x - cssX, p.y - cssY);
        if (d < 36 && (!best || d < best.d)) best = { d, inter: null, item: it };
      }
      if (best?.inter) {
        const [x, z] = standFor(best.inter);
        if (Math.hypot(x - pos.x, z - pos.z) < 0.15 || flat(best.inter.at()) <= best.inter.radius * 0.9) {
          pathTarget = { x, z, inter: best.inter, item: null };
          arrive();
        } else plan(x, z, best.inter, null);
        return;
      }
      if (best?.item) {
        const ip = best.item.obj.position;
        plan(ip.x, ip.z, null, best.item);
        return;
      }
      // 地面：先按自己的高度求交，再按落点的地面高度求一次
      let p = pipe.pickGround(cssX, cssY, W, Hh, pos.y);
      if (!p) return;
      const g = nav.height(p.x, p.z);
      if (g !== null && Math.abs(g - pos.y) > 0.05) {
        const p2 = pipe.pickGround(cssX, cssY, W, Hh, g);
        if (p2 && nav.height(p2.x, p2.z) !== null) p = p2;
      }
      plan(p.x, p.z, null, null);
    },
    tapWorld(x, z) {
      plan(x, z, null, null);
    },
    pathLeft: () => path.length,
    replan() {
      const t = pathTarget;
      if (!t || !path.length) return false;
      return plan(t.x, t.z, t.inter, t.item);
    },

    ui() {
      let mark: THREE.Vector3 | null = null;
      if (!busy) {
        let m: Interactable | null = hold?.face ?? null;
        if (!m) m = useTarget();
        if (!m) m = held ? putTarget(held) : pickTarget();
        if (m && !m.noMark)
          mark = m
            .at()
            .clone()
            .setY(m.at().y + 0.35);
        else if (!m && !held) {
          const gi = groundItem();
          if (gi) mark = gi.obj.position.clone().setY(gi.obj.position.y + 0.5);
        }
      }
      return {
        use: useLabel(),
        usingNow: !!hold,
        pick: pickLabel(),
        mark,
        bubbles: [...bubbles.values()],
        stats: [...stats.values()],
        toast: toastV ? { text: toastV.text, id: toastV.id } : null,
      };
    },
    project,
    zoomBy(k) {
      const [lo, hi] = camOpts.zoom ?? [0.6, 1.6];
      const r = THREE.MathUtils.clamp((pipe.rig.metersPerTexel / pipe.px) * k, ratio0 * lo, ratio0 * hi);
      pipe.rig.metersPerTexel = r * pipe.px;
      clampCam();
    },
  };
  D.position.copy(pos);
  D.rotation.y = yaw;
  return api;
}
