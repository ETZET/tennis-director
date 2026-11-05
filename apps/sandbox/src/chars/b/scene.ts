/**
 * 放进游戏：真实的 Palm Oasis（INDIAN_WELLS）地图，按游戏的默认缩放（手机 1 CSS 像素 / 缓冲像素，k = 4）。
 * 左边的练习场（practice，F_P1）是方向 B 的人，右边的练习场（F_P2）是现在的 Person，站位和动作一模一样：
 * 两人对打、教练带两个小孩、场外几个人、一个人来回走。场外前面一排是一对一的并排（B 在左，现在在右）。
 * 这里是 sandbox 的演示剧情，不碰模拟。
 */
import {
  type BakedArt,
  Custom,
  createDaylight,
  createIsoWorld,
  type DrawContext,
  Group,
  INDIAN_WELLS,
  INDIAN_WELLS_WORLD,
  type IsoWorld,
  indianWells,
  type PeopleWorld,
  Person,
  type PersonOptions,
  Sprite,
  screenDir,
  setPeopleView,
} from '@td/iso';
import { type AnimName, frameAt, frames } from './anims';
import type { Facing, Spec } from './body';
import { BY_ID } from './cast';
import { NOW_LOOKS } from './now';

const site = INDIAN_WELLS;
const { F_P1, F_P2, RESTORED_STATES } = indianWells;

/** 方向 B 的一个人：一个精灵 + 脚下的影子，按动作和朝向取帧 */
class BActor {
  readonly root = new Group();
  readonly spr = new Sprite();
  anim: AnimName = 'idle';
  facing: Facing = 'front';
  flip = false;
  t0 = 0;
  /** 一次性动作播完回到哪个 */
  after: AnimName | null = null;
  constructor(
    readonly s: Spec,
    world: IsoWorld,
    x: number,
    z: number,
  ) {
    const kid = s.build === 'kid';
    const shadow = new Custom(
      (r: DrawContext, self: Custom) => {
        const w = self.getWorldPosition();
        const [sx, sy] = r.P(w.x, site.groundY(w.x, w.z), w.z);
        const sc = r.spriteScale;
        const rx = (kid ? 3 : 4.5) * sc;
        const ry = (kid ? 1.3 : 1.8) * sc;
        for (let y = Math.floor(sy - ry); y <= Math.ceil(sy + ry); y++)
          for (let xx = Math.floor(sx - rx); xx <= Math.ceil(sx + rx); xx++) {
            const dx = (xx + 0.5 - sx) / rx;
            const dy = (y + 0.5 - sy) / ry;
            if (dx * dx + dy * dy <= 1) r.darken(xx, y, 0.72);
          }
      },
      { x0: -0.3, x1: 0.3, y0: 0, y1: 0.05, z0: -0.3, z1: 0.3 },
    );
    shadow.renderOrder = -0.05;
    this.spr.xray = true;
    this.root.add(shadow, this.spr);
    world.scene.add(this.root);
    this.root.position.set(x, site.groundY(x, z), z);
  }
  play(a: AnimName, now: number, after: AnimName | null = null): void {
    this.anim = a;
    this.t0 = now;
    this.after = after;
  }
  /** 面朝世界方向 (fx, fz) */
  look(fx: number, fz: number, ang: number): void {
    const d = screenDir(fx, fz, ang);
    this.facing = d.sdy >= 0 ? 'front' : 'back';
    this.flip = d.sdx < 0;
  }
  update(now: number): void {
    let fr = frames(this.s, this.anim, this.facing);
    let t = now - this.t0;
    if (this.after && t >= fr.total) {
      this.anim = this.after;
      this.after = null;
      this.t0 = now;
      t = 0;
      fr = frames(this.s, this.anim, this.facing);
    }
    const i = frameAt(fr, t);
    this.spr.frame = fr.baked[i] as BakedArt;
    this.spr.flipX = this.flip;
  }
  setPos(x: number, z: number): void {
    this.root.position.set(x, site.groundY(x, z), z);
  }
}

/** 球：一个 2×2 的黄绿点 + 地上的影子 */
function makeBall(world: IsoWorld): { g: Group; set(x: number, y: number, z: number): void } {
  const g = new Group();
  const px = new Uint32Array([0xff5ae8d8, 0xff3ac0b0, 0xff3ac0b0, 0xff2a9080]);
  const spr = new Sprite({ w: 2, h: 2, ox: 1, oy: 1, px });
  const sh = new Custom(
    (r: DrawContext, self: Custom) => {
      const w = self.getWorldPosition();
      const [sx, sy] = r.P(w.x, site.groundY(w.x, w.z), w.z);
      r.darken(Math.floor(sx), Math.floor(sy), 0.6);
      r.darken(Math.floor(sx) - 1, Math.floor(sy), 0.75);
    },
    { x0: -0.1, x1: 0.1, y0: 0, y1: 0.02, z0: -0.1, z1: 0.1 },
  );
  sh.renderOrder = -0.04;
  const shadowHolder = new Group();
  shadowHolder.add(sh);
  g.add(spr);
  world.scene.add(g, shadowHolder);
  return {
    g,
    set(x, y, z) {
      g.position.set(x, y, z);
      shadowHolder.position.set(x, 0, z);
    },
  };
}

export interface SceneCtl {
  world: IsoWorld;
  setZoom(k: number): void;
  setView(v: 'both' | 'b' | 'now'): void;
  setPx(n: 1 | 2): void;
  /** 只放一边（'b' 只有 B 的人，'now' 只有现在的人，'both' 都有） */
  labels(): { x: number; y: number; t: string }[];
}

interface Rally {
  a: { x: number; z: number };
  b: { x: number; z: number };
  t0: number;
  T: number;
  dir: 1 | -1;
}

export function createScene(container: HTMLElement, pixelSize?: number): SceneCtl {
  const pose = { tx: -5, tz: 9, zoom: 4, rot: 0 as const };
  const world = createIsoWorld(container, { ...INDIAN_WELLS_WORLD, pose, pixelSize });
  site.build(world);
  const ov = site.createOverlays(world);
  for (const [f, st] of Object.entries(RESTORED_STATES)) ov.set(f, st);
  ov.flush?.();
  const daylight = createDaylight(world);
  daylight.update(10 * 60 + 30, 0);
  world.camera.enabled = false;
  const pw: PeopleWorld = { scene: world.scene, groundY: site.groundY, people: [] };
  let ang = 0;

  /* ---------- 两边一样的站位 ---------- */
  type Slot = { id: string; x: number; z: number; face: [number, number]; anim: AnimName };
  const side = F_P1.hz + 1.3; // 围网外的步道
  const SLOTS: Slot[] = [
    // 场上：对打
    { id: 'jess', x: -9.6, z: -1.2, face: [1, 0], anim: 'idle' },
    { id: 'nadia', x: 9.6, z: 1.4, face: [-1, 0], anim: 'idle' },
    // 场上：Dale 带两个小孩（网前，远边线那一半）
    { id: 'dale', x: -2.6, z: -4.6, face: [-0.3, 1], anim: 'idle' },
    { id: 'kid1', x: -5.6, z: -3.4, face: [1, 0.2], anim: 'idle' },
    { id: 'kid2', x: -6.4, z: -5.6, face: [1, 0.3], anim: 'idle' },
    // 场外步道上：几个人
    { id: 'gus', x: -12, z: side, face: [0.2, 1], anim: 'idle' },
    { id: 'ray', x: -7, z: side, face: [0.4, 1], anim: 'idle' },
    { id: 'teodora', x: -2, z: side, face: [0.3, 1], anim: 'idle' },
    { id: 'lily', x: 3, z: side, face: [0.2, 1], anim: 'idle' },
    { id: 'director', x: 8, z: side, face: [-1, 0.6], anim: 'idle' },
  ];
  const WALK = { id: 'mateo', x0: -13, x1: 13, z: 6.4 };

  /* ---------- 左场：方向 B ---------- */
  const F = F_P1;
  const bActors = new Map<string, BActor>();
  for (const sl of SLOTS) {
    const a = new BActor(BY_ID[sl.id], world, F.ox + sl.x, F.oz + sl.z);
    a.look(sl.face[0], sl.face[1], ang);
    a.play(sl.anim, Math.random() * 3);
    bActors.set(sl.id, a);
  }
  const bWalker = new BActor(BY_ID[WALK.id], world, F.ox + WALK.x0, F.oz + WALK.z);
  bWalker.play('walk', 0);

  /* ---------- 右场：现在的 Person ---------- */
  const G = F_P2;
  const mk = (id: string, x: number, z: number, extra: Partial<PersonOptions> = {}) =>
    new Person({ name: id, x, z, ...NOW_LOOKS[id], ...extra } as PersonOptions, pw);
  const nowPeople = new Map<string, Person>();
  for (const sl of SLOTS) {
    const p = mk(sl.id, G.ox + sl.x, G.oz + sl.z, {
      base: sl.id === 'jess' || sl.id === 'nadia' ? 'ready' : 'relaxed',
      lock: Math.atan2(sl.face[0], sl.face[1]),
    });
    nowPeople.set(sl.id, p);
  }
  const nWalker = mk(WALK.id, G.ox + WALK.x0, G.oz + WALK.z);

  /* ---------- 两块场中间的步道上：一对一并排（左 B，右现在） ---------- */
  const PAIR_IDS = ['dale', 'nadia', 'ray'];
  const pairZ = F.oz + F.hz + 1.3;
  const pairX0 = -0.6 - 1.6 * 2;
  const pairs: { b: BActor; n: Person }[] = [];
  PAIR_IDS.forEach((id, i) => {
    // 一对沿屏幕横向排开（世界 (+x, -z) 是屏幕右边）
    const x = pairX0 + i * 3.2;
    const z = pairZ + 1.6 - i * 1.6;
    const b = new BActor(BY_ID[id], world, x - 0.8, z + 0.8);
    b.look(0.3, 1, ang);
    b.play('idle', i * 0.7);
    const n = mk(id, x + 0.8, z - 0.8, { lock: Math.atan2(0.3, 1), base: 'relaxed', phone: false });
    pairs.push({ b, n });
  });

  /* ---------- 球 ---------- */
  const balls = [makeBall(world), makeBall(world)];
  const rallies: Rally[] = [
    { a: { x: F.ox - 9.6, z: F.oz - 1.2 }, b: { x: F.ox + 9.6, z: F.oz + 1.4 }, t0: 0.4, T: 1.35, dir: 1 },
    { a: { x: G.ox - 9.6, z: G.oz - 1.2 }, b: { x: G.ox + 9.6, z: G.oz + 1.4 }, t0: 0.4, T: 1.35, dir: 1 },
  ];
  const hitters: [BActor | Person, BActor | Person][] = [
    [bActors.get('jess') as BActor, bActors.get('nadia') as BActor],
    [nowPeople.get('jess') as Person, nowPeople.get('nadia') as Person],
  ];
  const swingAt = (h: BActor | Person, now: number) => {
    if (h instanceof BActor) h.play('swing', now - 0.62, 'idle');
    else h.setStroke('fh', now + 0.02);
  };

  /* ---------- 一边的小剧情：Dale 的小孩时不时高兴一下，Gus 偶尔发火 ---------- */
  const beats: { t: number; id: string; a: AnimName; g?: 'cheer' | 'argue' | 'clap' }[] = [
    { t: 3, id: 'kid1', a: 'happy', g: 'cheer' },
    { t: 6.5, id: 'teodora', a: 'angry', g: 'argue' },
    { t: 9, id: 'kid2', a: 'happy', g: 'cheer' },
    { t: 11, id: 'dale', a: 'happy', g: 'clap' },
    { t: 13.5, id: 'gus', a: 'angry', g: 'argue' },
  ];
  let beatT = 0;
  let bi = 0;

  /* ---------- 每帧 ---------- */
  const swung = new Set<string>();
  let last = performance.now();
  let now = 0;
  let walkX = WALK.x0;
  let walkDir = 1;
  const tick = (tm: number) => {
    const dt = Math.min(0.05, (tm - last) / 1000);
    last = tm;
    now += dt;
    world.camera.update(dt, null);
    const pr = world.view.proj;
    ang = pr.ang;
    setPeopleView(pr.ang, pr.k, pr.spriteScale);

    // 对打：球从 a 飞到 b，再飞回来；快到的时候接球的人挥拍
    rallies.forEach((r, k) => {
      const u = (now - r.t0) / r.T;
      if (u >= 1) {
        r.t0 += r.T;
        r.dir = r.dir === 1 ? -1 : 1;
      }
      const v = Math.min(1, Math.max(0, (now - r.t0) / r.T));
      const from = r.dir === 1 ? r.a : r.b;
      const to = r.dir === 1 ? r.b : r.a;
      const x = from.x + (to.x - from.x) * v;
      const z = from.z + (to.z - from.z) * v;
      // 一次落地：前 70% 是第一段弧，后 30% 是弹起来的小弧
      const y0 = site.groundY(x, z);
      const y =
        v < 0.7 ? 1 + Math.sin((v / 0.7) * Math.PI) * 1.6 - (v / 0.7) * 1 : Math.sin(((v - 0.7) / 0.3) * Math.PI) * 0.9;
      balls[k].set(x, y0 + Math.max(0.05, y), z);
      const [ha, hb] = hitters[k];
      const recv = r.dir === 1 ? hb : ha;
      const key = `${k}${r.dir}${Math.floor(r.t0 * 100)}`;
      if (v > 0.8 && !swung.has(key)) {
        swung.add(key);
        swingAt(recv, now);
      }
    });

    // 小剧情
    beatT += dt;
    if (bi < beats.length && beatT >= beats[bi].t) {
      const b = beats[bi];
      bActors.get(b.id)?.play(b.a, now, 'idle');
      if (b.g) nowPeople.get(b.id)?.gesture(b.g, now, 1.2);
      bi++;
    }
    if (beatT > 16) {
      beatT = 0;
      bi = 0;
    }

    // 走路的人（两边一样）
    walkX += walkDir * dt * 1.4;
    if (walkX > WALK.x1 || walkX < WALK.x0) walkDir = walkDir === 1 ? -1 : 1;
    bWalker.setPos(F.ox + walkX, F.oz + WALK.z);
    bWalker.look(walkDir, -0.15 * walkDir, ang);
    if (!nWalker.busy()) {
      nWalker.go(G.ox + (walkDir === 1 ? WALK.x1 : WALK.x0), G.oz + WALK.z, 1.4);
    }

    for (const a of bActors.values()) a.update(now);
    bWalker.update(now);
    for (const p of pairs) p.b.update(now);
    for (const p of [...pw.people]) p.update(dt, now);
    world.render(dt, now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const views = { both: { tx: -5, tz: 9 }, b: { tx: F.ox, tz: F.oz + 2 }, now: { tx: G.ox, tz: G.oz + 2 } };
  let view: keyof typeof views = 'both';
  let zoom = 4;
  return {
    world,
    setZoom(k) {
      zoom = k;
      world.camera.setPose({ ...views[view], zoom, rot: 0 }, true);
    },
    setView(v) {
      view = v;
      world.camera.setPose({ ...views[view], zoom, rot: 0 }, true);
    },
    setPx(n) {
      world.view.setPixelSize(n);
      world.camera.resize();
    },
    labels() {
      const out: { x: number; y: number; t: string }[] = [];
      const pB = world.camera.project(F.ox - F.hx + 2, 0, F.oz - 3);
      const pN = world.camera.project(G.ox - 9, 0, G.oz - G.hz - 3);
      out.push({ x: pB.x, y: pB.y, t: '方向 B（12×24）' }, { x: pN.x, y: pN.y, t: '现在（8×14）' });
      const pp = world.camera.project(pairX0 + 3.2, -1.2, pairZ + 1.5);
      out.push({ x: pp.x, y: pp.y + 26, t: '并排：每对左 B · 右现在' });
      return out;
    },
  };
}
