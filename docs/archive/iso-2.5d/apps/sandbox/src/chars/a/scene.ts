/**
 * 放进游戏：真实的 Palm Oasis（@td/iso 的 INDIAN_WELLS），练习场（F_P1）上两个新画法的人对打，
 * 场边有教练、球童、场地工、看手机的前台，步道上有人走路；和现在的 Person 并排放对照（外场 1 号场上一对旧人对打、
 * Dale 和 Ben 各有一个旧版本站在 / 走在旁边）。
 *
 * 新人物是 Custom 节点：每帧取动画帧，用 DrawContext.art 画（和 Person 同一个软件光栅、同一个深度缓冲和夜色），
 * 放大倍数自己定（默认 1 倍，不跟 Person 的精灵档位走），脚下压暗一个椭圆当影子。
 */
import {
  type BakedArt,
  Custom,
  createDaylight,
  createIsoWorld,
  type DrawContext,
  HV,
  INDIAN_WELLS,
  INDIAN_WELLS_WORLD,
  indianWells,
  type PeopleWorld,
  Person,
  screenDir,
  setPeopleView,
} from '@td/iso';
import { animOf, CAST, type CastMember, frameAt } from './cast';

type Tick = (t: number) => void;
type XZ = { x: number; z: number };

const site = INDIAN_WELLS;
const STATES: Record<string, string> = {
  stadium_1: 'cleared',
  practice: 'open',
  outer_1: 'resurfaced',
  outer_23: 'playable',
  clubhouse: 'open',
  plaza: 'open',
  stadium_3: 'dug',
  stadium_2: 'open',
};

/** 练习场（F_P1）和外场 1 号（F_O1）：球网在 x = -17，底线在 ±11.89 */
const P1 = { x: -17, z: 6 };
const O1 = { x: -17, z: 25 };
const BASE = 11.4;

const who = (id: string) => CAST.find((c) => c.id === id) as CastMember;

interface Panel {
  title: string;
  cap: string;
  zoom: number;
  px: number;
  h: number;
  at: XZ;
  /** 新人物的放大倍数 */
  scale?: number;
}

const PANELS: Panel[] = [
  {
    title: '推荐：zoom 7.8 · 1 倍像素',
    cap: '<b>建议游戏用这一档。</b>镜头比现在近一倍（k = 7.8），每个缓冲像素 = 1 个 CSS 像素，所以视野和现在差不多（屏幕宽约 50 米），人物 32 像素高 ≈ 场地上 1.85 倍真人（现在的人在 zoom 4 是 1.6 倍）。人物和场景的像素一样大，不像贴上去的。左下外场是现在的人（棕色标签）。',
    zoom: 7.8,
    px: 1,
    h: 430,
    at: { x: -16, z: 11 },
  },
  {
    title: '拉近：zoom 7.8 · 2 倍像素',
    cap: '<b>读得最清楚的一档：</b>和上面同一个镜头放大 2 倍（像第二轮 demo 那样一个像素 2 个 CSS 像素），脸、胡子、眼镜、护膝都看得见。缺点是一屏只有半片球场。',
    zoom: 7.8,
    px: 2,
    h: 380,
    at: { x: -21.5, z: 9.5 },
  },
  {
    title: '游戏现在的默认：zoom 4 · 1 倍像素',
    cap: '<b>不改镜头直接换进去：</b>新人物（32 像素）是场地上 3.6 倍真人，比球网高一大截，像巨人；现在的人（14 像素）在这档刚好。所以这个方向必须同时把默认镜头拉到 zoom 7.8 左右。',
    zoom: 4,
    px: 1,
    h: 360,
    at: { x: -16, z: 12 },
  },
];

export function mountScenes(host: HTMLElement, onTick: (el: HTMLElement, fn: Tick) => void): void {
  PANELS.forEach((p, i) => {
    const t = document.createElement('div');
    t.id = `scene-${i + 1}`;
    t.className = 'k-label';
    t.style.margin = '4px 0';
    t.textContent = p.title;
    const box = document.createElement('div');
    box.className = 'scene';
    box.style.height = `${p.h}px`;
    const cap = document.createElement('p');
    cap.className = 'cap';
    cap.innerHTML = p.cap;
    host.append(t, box, cap);
    mountOne(box, p, onTick);
  });
}

/* ---------- 新人物：Custom 节点 ---------- */

class Actor {
  readonly node: Custom;
  frame: BakedArt | null = null;
  flip = false;
  x: number;
  z: number;
  anim = 'idle';
  facing: 'front' | 'back' = 'front';
  /** 演出时间偏移，免得大家同一帧 */
  phase: number;
  constructor(
    readonly c: CastMember,
    at: XZ,
    readonly scale: () => number,
  ) {
    this.x = at.x;
    this.z = at.z;
    this.phase = (c.id.charCodeAt(0) * 0.37) % 2;
    this.node = new Custom((r: DrawContext, self: Custom) => this.draw(r, self), {
      x0: -0.3,
      x1: 0.3,
      y0: 0,
      y1: 2.2,
      z0: -0.3,
      z1: 0.3,
    });
  }
  /** 朝向世界方向 (dx, dz) */
  face(dx: number, dz: number): void {
    const s = screenDir(dx, dz);
    this.facing = s.sdy > 0 ? 'front' : 'back';
    this.flip = s.sdx < 0;
  }
  set(anim: string, t: number): void {
    this.anim = anim;
    const A = animOf(this.c, anim, this.facing);
    this.frame = A.frames[frameAt(A, t + this.phase)] ?? null;
  }
  /** 直接指定第几帧（击球按时间轴切） */
  setFrame(anim: string, i: number): void {
    const A = animOf(this.c, anim, this.facing);
    this.frame = A.frames[Math.min(i, A.frames.length - 1)] ?? null;
  }
  place(): void {
    this.node.position.set(this.x, site.groundY(this.x, this.z), this.z);
  }
  private draw(r: DrawContext, self: Custom): void {
    const f = this.frame;
    if (!f) return;
    const m = self.matrixWorld;
    const x = m[9] as number;
    const y = m[10] as number;
    const z = m[11] as number;
    const s = this.scale();
    // 影子：脚下压暗一个扁椭圆
    const [sx, sy] = r.P(x, y, z);
    const rx = (this.c.look.build.kid ? 4 : 6) * s;
    const ry = 1.6 * s;
    for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++)
      for (let i = -rx; i <= rx; i++)
        if ((i / rx) ** 2 + (j / ry) ** 2 <= 1) r.darken(Math.round(sx) + i, Math.round(sy) + j - 1, 0.7);
    r.art(f, x, y, z, { flipX: this.flip, scale: s });
  }
}

/* ---------- 一个场景面板 ---------- */

function mountOne(box: HTMLElement, P: Panel, onTick: (el: HTMLElement, fn: Tick) => void): void {
  const pose = { tx: P.at.x, tz: P.at.z, zoom: P.zoom, rot: 0 as const };
  const world = createIsoWorld(box, { ...INDIAN_WELLS_WORLD, pose, pixelSize: P.px });
  world.camera.limits = { zoom: [P.zoom, P.zoom], tx: [P.at.x - 10, P.at.x + 10], tz: [P.at.z - 10, P.at.z + 10] };
  site.build(world);
  const overlays = site.createOverlays(world);
  for (const f of indianWells.FACILITIES) overlays.set(f, STATES[f] ?? 'open');
  overlays.flush?.();
  const sky = site.createSky(world);
  const daylight = createDaylight(world);
  daylight.update(15 * 60, 0);
  const pw: PeopleWorld = { scene: world.scene, groundY: site.groundY, people: [] };
  const scale = () => P.scale ?? Math.max(1, Math.round(world.view.proj.k / 15.6));

  /* ---- 新人物 ---- */
  const actors: Actor[] = [];
  const add = (id: string, at: XZ, face: XZ = { x: 1, z: 0 }, anim = 'quirk') => {
    const a = new Actor(who(id), at, scale);
    a.face(face.x, face.z);
    a.anim = anim;
    a.place();
    world.scene.add(a.node);
    actors.push(a);
    return a;
  };
  const jess = add('jess', { x: P1.x - BASE, z: P1.z + 1.2 }, { x: 1, z: 0 }, 'swing');
  const nadia = add('nadia', { x: P1.x + BASE, z: P1.z + 1.6 }, { x: -1, z: 0 }, 'swing');
  add('mateo', { x: P1.x + 0.6, z: P1.z + 6.4 }, { x: 0, z: -1 });
  const dale = add('dale', { x: P1.x - 6.5, z: P1.z + 4.8 }, { x: 0.2, z: 1 });
  add('gus', { x: P1.x - 14.2, z: P1.z - 3.5 }, { x: 1, z: 0.6 });
  add('lily', { x: P1.x + 5.5, z: 15.6 }, { x: 0.3, z: 1 });
  add('ray', { x: -35.5, z: 9.5 }, { x: 1, z: 0.4 });
  add('director', { x: P1.x - 0.8, z: P1.z + 7.4 }, { x: -0.5, z: 1 });
  add('kidA', { x: P1.x - 9.6, z: P1.z + 3.6 }, { x: 1, z: 0.5 });
  add('kidB', { x: P1.x - 11.4, z: P1.z + 5.6 }, { x: 1, z: 0.8 });
  add('tourist', { x: P1.x + 9.5, z: 16.0 }, { x: -0.4, z: -1 });
  add('retiree', { x: P1.x - 18.5, z: 15.9 }, { x: 1, z: 0.3 });
  add('teodora', { x: P1.x + 12.8, z: P1.z + 6.8 }, { x: -0.5, z: 1 });
  add('rosa', { x: P1.x + 15.2, z: P1.z + 3 }, { x: -1, z: 0.6 });
  add('mom', { x: P1.x - 15.2, z: P1.z + 9.6 }, { x: 1, z: 1 });
  const ben = add('ben', { x: -33, z: 15.2 }, { x: 1, z: 0 }, 'walk');

  /* ---- 现在的人（对照） ---- */
  const LOOK = {
    dale: {
      wide: true,
      shirt: '#6b2e2a',
      shorts: '#4f5560',
      pants: true,
      skin: '#f1c7a1',
      hair: '#cfcac0',
      hairStyle: 'cap' as const,
      cap: '#2b3440',
      beard: '#cfcac0',
      shoes: '#5a4a3a',
    },
    ben: {
      shirt: '#2f5f9a',
      shorts: '#c9b48a',
      skin: '#e8b896',
      hair: '#17141a',
      hairStyle: 'short' as const,
      shoes: '#e8e4da',
    },
    p1: {
      shirt: '#2a8a86',
      shorts: '#f1ece0',
      skin: '#d9a47c',
      hair: '#2a1d16',
      hairStyle: 'pony' as const,
      shoes: '#f1ece0',
      racket: '#e8582c',
    },
    p2: {
      shirt: '#f6f3ea',
      shorts: '#f6f3ea',
      skin: '#f1d0ae',
      hair: '#efe0a8',
      hairStyle: 'pony' as const,
      shoes: '#f6f3ea',
      racket: '#2a2a30',
    },
  };
  const oldDale = new Person(
    { name: 'old-dale', x: dale.x + 1.5, z: dale.z - 0.6, base: 'relaxed', clipboard: true, ...LOOK.dale },
    pw,
  );
  oldDale.idleFace = 0;
  const oldBen = new Person({ name: 'old-ben', x: ben.x, z: ben.z - 0.8, base: 'relaxed', ...LOOK.ben }, pw);
  const oa = new Person(
    { name: 'old-a', x: O1.x - BASE, z: O1.z + 1, base: 'ready', lock: Math.PI / 2, ...LOOK.p1 },
    pw,
  );
  const ob = new Person(
    { name: 'old-b', x: O1.x + BASE, z: O1.z - 1, base: 'ready', lock: -Math.PI / 2, ...LOOK.p2 },
    pw,
  );

  /* ---- 标签：贴在头顶上方（按像素高换算成米） ---- */
  const tags: { el: HTMLElement; at: () => [number, number, number] }[] = [];
  const tag = (text: string, old: boolean, at: () => [number, number, number]) => {
    const el = document.createElement('div');
    el.className = old ? 'tag old' : 'tag';
    el.textContent = text;
    box.append(el);
    tags.push({ el, at });
  };
  tag('新 Dale', false, () => [dale.x, dale.z, 34 * scale()]);
  tag('现在', true, () => [oldDale.pos.x, oldDale.pos.z, 17 * world.view.proj.spriteScale]);
  tag('新 Ben', false, () => [ben.x, ben.z, 34 * scale()]);
  tag('现在', true, () => [oldBen.pos.x, oldBen.pos.z, 17 * world.view.proj.spriteScale]);
  tag('现在的人对打', true, () => [O1.x, O1.z, 24]);

  /* ---- 球 ---- */
  type Ball = { a: XZ; b: XZ; t0: number; dur: number };
  const mkBall = (get: () => Ball | null) => {
    const n = new Custom(
      (r: DrawContext) => {
        const B = get();
        if (!B) return;
        const u = Math.min(1, Math.max(0, (now - B.t0) / B.dur));
        const x = B.a.x + (B.b.x - B.a.x) * u;
        const z = B.a.z + (B.b.z - B.a.z) * u;
        const y = 0.95 + 1.3 * 4 * u * (1 - u) - 0.25 * u;
        const gy = site.groundY(x, z);
        const [gx, gyy] = r.P(x, gy, z);
        r.darken(Math.round(gx), Math.round(gyy), 0.6);
        r.darken(Math.round(gx) + 1, Math.round(gyy), 0.6);
        const [bx, by] = r.P(x, gy + y, z);
        const c = r.col('#e4f04a');
        const s = Math.max(1, Math.round(r.k / 7.8));
        r.rect(Math.round(bx), Math.round(by), s + (s > 1 ? 0 : 1), s + (s > 1 ? 0 : 1), c);
      },
      { x0: -30, x1: 30, y0: 0, y1: 3, z0: -1, z1: 1 },
    );
    n.renderOrder = 5;
    world.scene.add(n);
  };
  const FLIGHT = 1.15;
  let now = 0;
  // 新人物的球：Jess 在 t = 0、2.3、4.6… 击球，Nadia 在 1.15、3.45…
  const rallyBall = (A: XZ, B: XZ, off = 0): Ball => {
    const k = Math.floor((now + off) / FLIGHT);
    const fromA = k % 2 === 0;
    return {
      a: fromA ? { x: A.x + 0.6, z: A.z } : { x: B.x - 0.6, z: B.z },
      b: fromA ? { x: B.x - 0.6, z: B.z } : { x: A.x + 0.6, z: A.z },
      t0: k * FLIGHT - off,
      dur: FLIGHT,
    };
  };
  mkBall(() => rallyBall(jess, nadia));
  mkBall(() => rallyBall(oa.pos, ob.pos, 0.4));

  /** 击球帧：离最近一次击球的时间 → swing 动画的第几帧（0 准备、1 引拍、2 击球、3 随挥） */
  const swingFrame = (dt: number) => (dt < -0.3 ? 0 : dt < 0 ? 1 : dt < 0.1 ? 2 : dt < 0.5 ? 3 : 0);
  const nearestHit = (t: number, first: number) => {
    const k = Math.round((t - first) / (2 * FLIGHT));
    return t - (first + k * 2 * FLIGHT);
  };
  let nextOld = 0.4;

  /* ---- 走路 ---- */
  const WALK = { x0: -33, x1: -3, z: 15.2, v: 1.3 };
  let dir = 1;

  let last = 0;
  onTick(box, (t) => {
    const dt = Math.min(0.05, Math.max(0, t - last));
    last = t;
    now = t;
    world.camera.update(dt, null);
    const pr = world.view.proj;
    setPeopleView(pr.ang, pr.k, pr.spriteScale);
    // 新人物
    for (const a of actors) {
      if (a === jess) {
        jess.setFrame('swing', swingFrame(nearestHit(t, 0)));
        continue;
      }
      if (a === nadia) {
        nadia.setFrame('swing', swingFrame(nearestHit(t, FLIGHT)));
        continue;
      }
      if (a === ben) {
        ben.x += dir * WALK.v * dt;
        if (ben.x > WALK.x1) dir = -1;
        if (ben.x < WALK.x0) dir = 1;
        ben.face(dir, 0);
        ben.place();
        ben.set('walk', t);
        continue;
      }
      a.set(a.anim, t);
    }
    // 旧人物：Ben 的旧版本跟着走，旧的一对在外场对打
    oldBen.pos.x = ben.x;
    oldBen.yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (!oldBen.busy()) oldBen.go(ben.x + dir * 0.6, WALK.z - 0.8, WALK.v);
    if (t >= nextOld - 0.85) {
      const p = Math.round((nextOld - 0.4) / FLIGHT) % 2 === 0 ? oa : ob;
      p.setStroke('fh', nextOld);
      nextOld += FLIGHT;
    }
    for (const p of [...pw.people]) p.update(dt, t);
    sky.update(dt, t, 0, 0.3);
    world.render(dt, t);
    for (const g of tags) {
      const [x, z, hp] = g.at();
      const s = world.camera.project(x, site.groundY(x, z) + hp / (pr.k * HV), z);
      g.el.style.left = `${s.x}px`;
      g.el.style.top = `${s.y}px`;
    }
  });
}
