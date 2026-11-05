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
import { byId, type Member } from './cast';
import { type Grid, toBaked } from './pix';
import { type AnimId, anim, compose, EMOTES, type EmoteId, type Facing, OX, OY } from './sprite';

/**
 * 放进游戏：真的 Palm Oasis（@td/iso 的 INDIAN_WELLS），镜头是游戏手机竖屏的默认位姿（zoom 4），
 * 青训场上 Jess 和 Nadia 对打，场边 Dale 带两个小孩，Gus 刷场、Lily 看手机、Mateo 抛球，Ben 和 Ray 在步道上走。
 * 右下角站着三个现在的 Person（Dale、Jess、Gus）做对照。这里只是演出，没有模拟。
 */

const site = INDIAN_WELLS;
const F = indianWells.F_P1;
type XZ = { x: number; z: number };

/** 烘焙缓存：人 × 动画 × 朝向 × 帧 */
const bakeCache = new Map<string, BakedArt>();
function frameArt(m: Member, a: AnimId, facing: Facing, i: number): BakedArt {
  const key = `${m.id}|${a}|${facing}|${i}`;
  let b = bakeCache.get(key);
  if (!b) {
    const an = anim(m.sprite, a);
    const g: Grid = compose(m.sprite, an.poses[i % an.poses.length] as (typeof an.poses)[number], facing);
    b = toBaked(g, m.look, OX, OY);
    bakeCache.set(key, b);
  }
  return b;
}
const emoteCache = new Map<EmoteId, BakedArt>();
function emoteArt(id: EmoteId): BakedArt {
  let b = emoteCache.get(id);
  if (!b) {
    const e = EMOTES[id];
    const h = e.rows.length;
    const w = Math.max(...e.rows.map((r) => r.length));
    const px = new Uint32Array(w * h);
    e.rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        const c = e.pal[r[i] as string];
        if (!c) continue;
        const v = Number.parseInt(c.slice(1), 16);
        px[j * w + i] = ((255 << 24) | ((v & 255) << 16) | (((v >> 8) & 255) << 8) | ((v >> 16) & 255)) >>> 0;
      }
    });
    // 锚点放在图下面 21 格：画在小人头顶上方
    b = { w, h, ox: Math.floor(w / 2) + 1, oy: h + 20, px };
    emoteCache.set(id, b);
  }
  return b;
}

export class Mini {
  readonly root = new Group();
  readonly spr = new Sprite();
  readonly emo = new Sprite();
  pos: XZ;
  /** 朝向（世界方向） */
  face: XZ = { x: 1, z: 0 };
  a: AnimId = 'idle';
  t0 = 0;
  once: { a: AnimId; t0: number; then: AnimId } | null = null;
  path: XZ[] = [];
  speed = 1.3;
  constructor(
    readonly m: Member,
    at: XZ,
    parent: Group,
  ) {
    this.pos = { ...at };
    this.spr.xray = true;
    this.emo.renderOrder = 0.02;
    const shadow = new Custom(
      (r: DrawContext, self: Custom) => {
        const w = self.getWorldPosition();
        const [sx, sy] = r.P(w.x, site.groundY(w.x, w.z), w.z);
        const s = r.spriteScale * (m.sprite.build === 'kid' ? 0.75 : 1);
        const rx = (m.sprite.build === 'wide' ? 4.5 : 3.8) * s;
        const ry = 1.6 * s;
        for (let y = Math.floor(sy - ry); y <= Math.ceil(sy + ry); y++)
          for (let x = Math.floor(sx - rx); x <= Math.ceil(sx + rx); x++) {
            const dx = (x + 0.5 - sx) / rx;
            const dy = (y + 0.5 - sy) / ry;
            if (dx * dx + dy * dy <= 1) r.darken(x, y, 0.7);
          }
      },
      { x0: -0.3, x1: 0.3, y0: 0, y1: 0.05, z0: -0.3, z1: 0.3 },
    );
    shadow.renderOrder = -0.05;
    this.root.add(shadow, this.spr, this.emo);
    parent.add(this.root);
  }
  play(a: AnimId, now: number, then: AnimId = 'idle'): void {
    this.once = { a, t0: now, then };
  }
  update(dt: number, now: number): void {
    // 走路
    const tgt = this.path[0];
    let walking = false;
    if (tgt) {
      const dx = tgt.x - this.pos.x;
      const dz = tgt.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        this.pos = { ...tgt };
        this.path.shift();
      } else {
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.face = { x: dx, z: dz };
      }
      walking = true;
    }
    let a: AnimId = walking ? 'walk' : this.a;
    let t = now - this.t0;
    if (this.once && !walking) {
      const an = anim(this.m.sprite, this.once.a);
      const tt = now - this.once.t0;
      if (tt >= an.dt * an.poses.length) {
        this.a = this.once.then;
        this.t0 = now;
        this.once = null;
        a = this.a;
        t = 0;
      } else {
        a = this.once.a;
        t = tt;
      }
    }
    const an = anim(this.m.sprite, a);
    const i = ((Math.floor(t / an.dt) % an.poses.length) + an.poses.length) % an.poses.length;
    const sd = screenDir(this.face.x, this.face.z);
    const facing: Facing = sd.sdy > 0 ? 'front' : 'back';
    this.spr.frame = frameArt(this.m, a, facing, i);
    this.spr.flipX = sd.sdx < 0;
    const em = an.emote?.[i] ?? null;
    this.emo.visible = !!em;
    if (em) this.emo.frame = emoteArt(em);
    this.root.position.set(this.pos.x, site.groundY(this.pos.x, this.pos.z), this.pos.z);
  }
}

/** 一颗球（2×2 像素 + 地上的影子），沿抛物线飞 */
class Ball {
  readonly node: Custom;
  p = { x: 0, y: 0, z: 0 };
  constructor(parent: Group) {
    this.node = new Custom(
      (r: DrawContext) => {
        const { x, y, z } = this.p;
        const gy = site.groundY(x, z);
        const s = r.spriteScale;
        const [hx, hy] = r.P(x, gy, z);
        r.darken(Math.round(hx), Math.round(hy), 0.65);
        r.darken(Math.round(hx) + 1, Math.round(hy), 0.65);
        const [bx, by] = r.P(x, y, z);
        r.rect(Math.round(bx) - s, Math.round(by) - s, 2 * s, 2 * s, r.col('#e3f25a'));
        r.pix(Math.round(bx) - s, Math.round(by) - s, r.col('#fbffc8'));
      },
      { x0: -0.1, x1: 0.1, y0: 0, y1: 0.2, z0: -0.1, z1: 0.1 },
    );
    parent.add(this.node);
  }
  set(x: number, y: number, z: number): void {
    this.p = { x, y, z };
    this.node.position.set(x, y, z);
  }
}

export interface Scene {
  world: IsoWorld;
  minis: Map<string, Mini>;
  /** 世界点 → 容器里的 CSS 坐标 */
  project(x: number, y: number, z: number): { x: number; y: number };
  setZoom(z: number): void;
  dispose(): void;
  /** 对照用的现在的 Person 站在哪儿 */
  compareAt: XZ;
  oursAt: XZ;
}

const L = (x: number, z: number): XZ => {
  const w = F.w({ x, z });
  return { x: w.x, z: w.z };
};

export function createScene(host: HTMLElement, o: { zoom: number; pixelSize: number }): Scene {
  const pose = { tx: 4.5, tz: 27.5, zoom: o.zoom, rot: 0 as const };
  const world = createIsoWorld(host, { ...INDIAN_WELLS_WORLD, pose, pixelSize: o.pixelSize });
  world.camera.limits = { zoom: [2, 15.6], tx: [-40, 10], tz: [-10, 30] };
  site.build(world);
  const overlays = site.createOverlays(world);
  const STATES: Record<string, string> = {
    outer_1: 'resurfaced',
    outer_23: 'playable',
    stadium_1: 'cleared',
    stadium_3: 'dug',
  };
  for (const f of indianWells.FACILITIES) overlays.set(f, STATES[f] ?? 'open');
  overlays.flush?.();
  const sky = site.createSky(world);
  const daylight = createDaylight(world);
  const layer = new Group();
  world.scene.add(layer);

  const minis = new Map<string, Mini>();
  const put = (id: string, at: XZ, face: XZ, a: AnimId = 'idle') => {
    const m = new Mini(byId(id), at, layer);
    m.face = face;
    m.a = a;
    m.t0 = Math.random() * 3;
    minis.set(id, m);
    return m;
  };
  // 场上：Jess（远端，正面朝镜头）和 Nadia（近端，背朝镜头）对打
  const jess = put('jess', L(-10.5, 1.2), { x: 1, z: 0 });
  const nadia = put('nadia', L(10.5, -1), { x: -1, z: 0 });
  // 另一个半场：Dale 喂球，两个小孩排队
  put('dale', L(-2.2, -6.2), { x: 0.2, z: 1 });
  put('mia', L(4.5, -5.6), { x: -1, z: 0.3 });
  put('leo', L(6.2, -6.4), { x: -1, z: 0.2 });
  // 场边
  put('lily', L(1.6, 6.9), { x: 0.6, z: 1 });
  put('mateo', L(0.6, -7.4), { x: 1, z: 0.6 });
  put('gus', L(13.5, 5.8), { x: -0.5, z: 1 });
  put('boss', L(-13.6, 6.6), { x: 1, z: 0.4 });
  put('rosa', { x: -36.6, z: 2 }, { x: 1, z: 1 });
  put('teo', { x: -30.4, z: -6.6 }, { x: 1, z: 1 });
  put('walt', L(-6.5, 7.4), { x: 0.3, z: -1 });
  put('mom', L(-4.6, 7.6), { x: 0.2, z: -1 });
  put('tourist', { x: -2.5, z: 15.6 }, { x: -1, z: -0.6 });
  // 步道上走的人
  const ben = put('ben', { x: -33, z: 15.4 }, { x: 1, z: 0 });
  const ray = put('ray', { x: -36.3, z: 20 }, { x: 0, z: -1 });

  // 对照：右下角，现在的 Person 和 C 的小人各站一排
  // 对照放在事件卡上沿的上面一点（按屏幕位置反算世界坐标；默认镜头下落在会员双打场的边上）
  world.camera.update(0, null);
  const compareAt = world.camera.unproject(132, 410);
  const oursAt = world.camera.unproject(246, 410);
  const pw: PeopleWorld = { scene: layer, groundY: site.groundY, people: [] };
  const SKN = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32'];
  const OLD: Omit<PersonOptions, 'x' | 'z'>[] = [
    {
      name: 'old-dale',
      wide: true,
      shirt: '#6b2e2a',
      shorts: '#4f5560',
      pants: true,
      skin: SKN[0] as string,
      hair: '#cfcac0',
      hairStyle: 'cap',
      cap: '#2b3440',
      beard: '#cfcac0',
      shoes: '#5a4a3a',
      racket: '#8a8f93',
    },
    {
      name: 'old-jess',
      shirt: '#2a8a86',
      shorts: '#f1ece0',
      skin: SKN[2] as string,
      hair: '#2a1d16',
      hairStyle: 'pony',
      shoes: '#f1ece0',
      racket: '#e8582c',
    },
    {
      name: 'old-gus',
      wide: true,
      shirt: '#7a5a3a',
      shorts: '#3a3f4a',
      pants: true,
      skin: SKN[5] as string,
      hair: '#9a9a96',
      hairStyle: 'cap',
      cap: '#8a7a5a',
      shoes: '#3a2e26',
    },
  ];
  const olds = OLD.map((lk, i) => {
    const p = new Person({ ...lk, x: compareAt.x + i * 1.7, z: compareAt.z - i * 1.7, base: 'relaxed' }, pw);
    p.idleFace = Math.atan2(1, 1);
    return p;
  });
  const cmp = ['dale', 'jess', 'gus'].map((id, i) => {
    const m = new Mini(byId(id), { x: oursAt.x + i * 1.7, z: oursAt.z - i * 1.7 }, layer);
    m.face = { x: 1, z: 1 };
    m.t0 = i * 0.7;
    return m;
  });

  // 对打：一颗球在 Jess 和 Nadia 之间来回
  const ball = new Ball(layer);
  let shot = { from: jess, to: nadia, t0: 0, T: 1.5 };
  const hitAt = (m: Mini, side: number) => ({ x: m.pos.x + side * 0.5, y: 0.9, z: m.pos.z - 0.4 });
  let now = 0;
  let last = performance.now();
  let raf = 0;
  const benLoop: XZ[] = [
    { x: -14, z: 15.4 },
    { x: -33, z: 15.4 },
  ];
  const rayLoop: XZ[] = [
    { x: -36.3, z: 0 },
    { x: -36.3, z: 22 },
  ];
  ben.speed = 1.6;
  ray.speed = 0.75;
  let nextEmo = 3;

  const frame = () => {
    const t = performance.now();
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    now += dt;
    world.camera.update(dt, null);
    const pr = world.view.proj;
    setPeopleView(pr.ang, pr.k, pr.spriteScale);

    // 球
    const u = (now - shot.t0) / shot.T;
    if (u >= 1) {
      shot = { from: shot.to, to: shot.from, t0: now, T: 1.3 + Math.random() * 0.4 };
    }
    {
      const uu = Math.min(1, (now - shot.t0) / shot.T);
      const A = hitAt(shot.from, 1);
      const B = hitAt(shot.to, 1);
      const bx = A.x + (B.x - A.x) * uu;
      const bz = A.z + (B.z - A.z) * uu;
      // 一次落地：前 70% 一条弧落到地上，后 30% 弹起来
      const k = 0.7;
      const y =
        uu < k
          ? A.y + (0.05 - A.y) * (uu / k) + 2.2 * Math.sin((Math.PI * uu) / k)
          : 0.05 + 1.2 * Math.sin((Math.PI * (uu - k)) / (1 - k)) * (1 - ((uu - k) / (1 - k)) * 0.25);
      ball.set(bx, y + site.groundY(bx, bz), bz);
      const tLeft = (1 - uu) * shot.T;
      if (tLeft < 0.34 && !shot.to.once) shot.to.play('swing', now, 'idle');
    }
    // 打完一会儿换成准备姿势：用 swing 第一帧（ready）顶替 idle 不好看，这里保持各自的 idle
    // 走路循环
    if (!ben.path.length) ben.path.push(...benLoop.map((p) => ({ ...p })));
    if (!ray.path.length) ray.path.push(...rayLoop.map((p) => ({ ...p })));
    // 偶尔有人高兴 / 生气
    if (now > nextEmo) {
      nextEmo = now + 4 + Math.random() * 3;
      const pick = Math.random();
      const who = pick < 0.33 ? 'mia' : pick < 0.66 ? 'leo' : 'walt';
      const m = minis.get(who);
      if (m && !m.once) m.play(who === 'walt' ? 'angry' : 'happy', now);
    }
    for (const m of minis.values()) m.update(dt, now);
    for (const m of cmp) m.update(dt, now);
    for (const p of olds) p.update(dt, now);
    sky.update(dt, now, 0, 0.3);
    daylight.update(15 * 60, 0);
    world.render(dt, now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    world,
    minis,
    compareAt,
    oursAt,
    project(x, y, z) {
      const s = world.camera.project(x, y, z);
      return { x: s.x, y: s.y };
    },
    setZoom(z) {
      world.camera.target.zoom = z;
    },
    dispose() {
      cancelAnimationFrame(raf);
      world.dispose();
    },
  };
}
