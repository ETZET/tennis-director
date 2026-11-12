// 负一层的总监的活（互动点 + 手里的东西）。状态机在 life-b1.ts（B1Api）：这里只管"总监走过去做什么"。
//   按住的活：修跑步机（3 秒）、收哑铃（2.5 秒）、挂杠铃片（2 秒）、合闸（1.5 秒）—— 只在那个信号亮着时有按钮。
//   搬东西的活：洗衣房的毛巾车拿一摞干净毛巾 → 前台（毛巾发完了、脏筐冒尖时才收）；储藏的货架拿水桶 → 饮水机（空了才收）；
//               冰桶（ice-bucket…，二楼后厨拿的）→ 理疗的冰浴桶（冰化了才收）。
//   跨层的货源（空手时随时能拿，拿错了放回去）：储藏的柴堆 firewood…（→ 2F 壁炉）、货架上的纸箱 stock-box…（→ 1F / 2F 补货）。
// 手里的东西的样子（毛巾摞、水桶、一捆柴、纸箱）也在这里建（life-b1.ts 的洗衣工抱的毛巾用同一个）。
import * as THREE from 'three';
import type { Item, Play } from '../clubsite/play';
import type { AssetCtx } from './ctx';
import { FLOOR_Y } from './layout';
import type { B1Api } from './life-b1';

const F = FLOOR_Y[-1];
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
const CLOTH = { lightUp: 0.55, bands: [-0.45, -0.25] as [number, number], noShadowReceive: true, convex: 0.3 };

const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), m);
  mesh.castShadow = true;
  return mesh;
};
/** 握点在东西的顶上（提着：东西垂在手下面） */
const topGrip = (h: number) => ({ at: [0, h, 0] as const, axis: [0, -1, 0] as const, up: [0, 0, 1] as const });

/** 一摞叠好的毛巾（会所青 / 白 / 会所青），0.36 × 0.24 × 0.27 米 */
export function towelStack(ctx: AssetCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'b1-towels';
  const teal = ctx.mat('clothTeal', CLOTH);
  const white = ctx.mat('clothWhite', CLOTH);
  for (let i = 0; i < 3; i++) g.add(box(i === 1 ? white : teal, 0.36, 0.08, 0.27, i === 1 ? 0.03 : 0, i * 0.08, 0));
  g.userData.grip = topGrip(0.24);
  ctx.mats.prepare(g);
  return g;
}

/** 满的水桶（饮水机用的大桶），直径 0.34、高 0.45 */
export function waterJug(ctx: AssetCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'b1-water-jug';
  const body = ctx.mat('clothBlue', {
    ...FACE,
    bands: [-0.45, -0.1],
    ramp: [0x5ac8f8, 0x2a8ae0, 0x2a4c92],
    convex: 0.4,
  });
  const top = ctx.mat('clothBlue', { ramp: [0x6ad4f8, 0x3a9ae4, 0x2a4c92], noShadowReceive: true, convex: 0.4 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 8).translate(0, 0.18, 0), body);
  const n = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.09, 6).translate(0, 0.405, 0), top);
  b.castShadow = true;
  g.add(b, n);
  g.userData.grip = topGrip(0.45);
  ctx.mats.prepare(g);
  return g;
}

/** 一捆柴：三根圆木（两根在下、一根在上），0.52 × 0.3 × 0.3 米 */
export function firewoodBundle(ctx: AssetCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'b1-firewood';
  const bark = ctx.mat('branch', { ...FACE, ramp: [0xb07a5a, 0x98625a, 0x4a3a66] });
  const end = ctx.mat('woodWeathered', {
    ...FACE,
    bands: [-0.9, -0.6],
    ramp: [0xd89e6a, 0xc08a5e, 0x6a5078],
    edge: 0.2,
  });
  const log = (y: number, z: number) => {
    g.add(box(bark, 0.5, 0.15, 0.15, 0, y, z));
    for (const s of [-1, 1]) g.add(box(end, 0.02, 0.11, 0.11, s * 0.255, y + 0.02, z));
  };
  log(0, -0.08);
  log(0, 0.08);
  log(0.14, 0);
  g.userData.grip = topGrip(0.29);
  ctx.mats.prepare(g);
  return g;
}

/** 一只纸箱（牛皮纸 + 一道会所青的胶带），0.42 × 0.32 × 0.34 米 */
export function stockBox(ctx: AssetCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'b1-stock-box';
  const kraft = ctx.mat('cap', { ...FACE, ramp: [0xf6c088, 0xdc9466, 0x7c4e8a] });
  const tape = ctx.mat('clothTeal', FACE);
  g.add(box(kraft, 0.42, 0.32, 0.34, 0, 0, 0));
  g.add(box(tape, 0.09, 0.325, 0.345, 0, 0, 0));
  g.userData.grip = topGrip(0.32);
  ctx.mats.prepare(g);
  return g;
}

/** 按住的活的秒数 */
export const HOLD = { treadmill: 3, dumbbells: 2.5, plates: 2, breaker: 1.5 } as const;
/** 同一种东西最多同时有几件（拿了放地上再拿：不让堆成山） */
const MAX_LIVE = 3;

export function attachB1Play(play: Play, B: B1Api): { step(dt: number): void } {
  const ctx = B.env.ctxFor(0);
  const up = (x: number, z: number, h = 1) => new THREE.Vector3(x, F + h, z);
  const P = B.points;
  B.hooks.say = (a, text, sec) => play.say(a, text, sec);
  B.hooks.toast = (text) => play.toast(text);
  B.hooks.bubble = (key, a, text) => play.bubble(key, a, text ?? '');

  // ── 按住的活 ──
  const hold = (
    id: 'treadmill' | 'dumbbells' | 'plates' | 'breaker',
    label: string,
    at: () => THREE.Vector3,
    radius: number,
    pose: string,
    stand?: () => readonly [number, number] | null,
  ) => {
    let prog = 0;
    play.add({
      id,
      at,
      radius,
      stand,
      priority: 1,
      label: (s) => (B.state(id) === 'signal' && !s.held ? label : ''),
      canUse: (s) => B.state(id) === 'signal' && !s.held,
      onHold(dt, p) {
        if (B.state(id) !== 'signal') return false;
        if (prog === 0 && pose === 'crank') p.director.userData.setCrank?.(at());
        prog += dt;
        B.progress[id] = prog / HOLD[id];
        if (prog < HOLD[id]) return;
        prog = 0;
        B.progress[id] = 0;
        B.done(id);
        return false;
      },
      onRelease() {
        prog = 0;
        B.progress[id] = 0;
      },
      pose,
    });
  };
  const tmAt = [0, 1, 2].map((i) => up(P.treadmills[i][0], P.treadmills[i][1] + 0.3, 1.3));
  hold(
    'treadmill',
    '修跑步机',
    () => tmAt[Math.max(0, B.faulty())],
    2.1,
    'crank',
    () => {
      const i = Math.max(0, B.faulty());
      return B.env.nav.nearestFree(P.treadmills[i][0], P.treadmills[i][1] - 1.35, 1) ?? null;
    },
  );
  const dbAt = up(P.dumbbells[0], P.dumbbells[1] + 0.25, 0.3);
  hold('dumbbells', '收哑铃', () => dbAt, 1.7, 'pickup');
  const plAt = up(P.plates[0] + 0.19, P.plates[1] + 0.19, 0.3);
  hold('plates', '挂杠铃片', () => plAt, 1.5, 'pickup');
  const brAt = up(P.panel[0], P.panel[1] + 0.2, 1.1);
  hold('breaker', '合闸', () => brAt, 1.5, 'crank');

  // ── 手里的东西 ──
  let serial = 0;
  const live = new Map<string, Item[]>();
  const count = (kind: string) => {
    const list = (live.get(kind) ?? []).filter((it) => it.where !== 'gone');
    live.set(kind, list);
    return list.length;
  };
  const spawn = (kind: string, name: string, build: (c: AssetCtx) => THREE.Group, speed: number) => {
    const obj = build(ctx);
    B.env.add(obj);
    const it = play.addItem({ id: `${kind}-${++serial}`, name, obj, radius: 1.0, carrySpeed: speed });
    live.get(kind)?.push(it) ?? live.set(kind, [it]);
    play.give(it);
    return it;
  };
  /** 货源：空手随时能拿；拿错了 / 没地方送，走回来放回去 */
  const source = (
    id: string,
    kind: string,
    name: string,
    pickLabel: string,
    at: THREE.Vector3,
    build: (c: AssetCtx) => THREE.Group,
    speed: number,
    radius = 1.2,
  ) =>
    play.add({
      id,
      at: () => at,
      radius,
      pickLabel,
      canPickUp: (s) => !s.held && count(kind) < MAX_LIVE,
      onPickUp: () => void spawn(kind, name, build, speed),
      accepts: (item) => item.id.startsWith(kind),
      putLabel: '放回去',
      onPutDown: (item) => item.remove(),
    });
  source('src-towel', 'towel', '毛巾', '拿毛巾', up(P.cart[0], P.cart[1], 0.9), towelStack, 3.0, 1.3);
  source(
    'src-jug',
    'water-jug',
    '水桶',
    '扛水桶',
    up(P.shelves[0] + 0.55, P.shelves[1] + 0.2, 0.8),
    waterJug,
    2.4,
    1.1,
  );
  source(
    'src-box',
    'stock-box',
    '纸箱',
    '搬纸箱',
    up(P.shelves[0] - 0.55, P.shelves[1] + 0.2, 1.2),
    stockBox,
    2.6,
    1.1,
  );
  source(
    'src-wood',
    'firewood',
    '木柴',
    '扛木柴',
    up(P.firewood[0] - 0.4, P.firewood[1] + 0.2, 0.7),
    firewoodBundle,
    2.4,
  );

  // ── 收东西的地方（信号亮着才收）──
  const sink = (
    id: 'towels' | 'water' | 'ice',
    kind: string,
    putLabel: string,
    at: THREE.Vector3,
    radius: number,
    stand?: () => readonly [number, number] | null,
  ) =>
    play.add({
      id,
      at: () => at,
      radius,
      stand,
      priority: 2,
      accepts: (item) => item.id.startsWith(kind) && B.state(id) === 'signal',
      putLabel,
      onPutDown(item) {
        item.remove();
        B.done(id);
      },
    });
  // 前台：脏毛巾筐在台子东头
  sink('towels', 'towel', '补毛巾', up(P.desk[0] + 1.2, P.desk[1], 1.2), 1.7, () =>
    B.env.nav.nearestFree(P.desk[0] + 1.3, P.desk[1] + 0.95, 0.8),
  );
  sink('water', 'water-jug', '换水桶', up(P.water[0], P.water[1], 1.3), 1.4);
  sink('ice', 'ice-bucket', '倒冰', up(P.iceBath[0], P.iceBath[1], 0.8), 1.5);

  return { step() {} };
}
