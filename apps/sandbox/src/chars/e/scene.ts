/**
 * 放进游戏：真的 Palm Oasis（@td/iso 的 INDIAN_WELLS），外场 1 号场。三档镜头看同一个时刻：
 *   A 游戏默认（竖屏 zoom 4，精灵 1 倍）  B 放大 2×（7.8）  C 提案：近景（23.4，现在的人是 3 倍，E 的人是原尺寸）。
 * E 的人是 Custom 节点，自己调 r.art(…, { scale: 1 })：不跟着精灵档位放大，永远是原生 24×40。
 * 旁边放了几个现在的 Person 当对照。这里只演画面，没有数值。
 */
import {
  Custom,
  createDaylight,
  createIsoWorld,
  type DrawContext,
  INDIAN_WELLS,
  INDIAN_WELLS_WORLD,
  type IsoWorld,
  indianWells,
  type PeopleWorld,
  Person,
  type PersonOptions,
  setPeopleView,
} from '@td/iso';
import { type AnimName, byId, type Member } from './cast';
import type { Facing } from './rig';
import { animLength, frameAt, frames } from './sheet';

const site = INDIAN_WELLS;
const F = indianWells.F_O1;
const STATES: Record<string, string> = {
  stadium_1: 'open',
  practice: 'open',
  outer_1: 'resurfaced',
  outer_23: 'playable',
  clubhouse: 'open',
  plaza: 'open',
  stadium_3: 'open',
  stadium_2: 'open',
};

type XZ = { x: number; z: number };
const W = (x: number, z: number): XZ => {
  const p = F.w({ x, z });
  return { x: p.x, z: p.z };
};

/* ---------- 共用的"时刻"：三个镜头看同一份 ---------- */
interface Actor {
  m: Member;
  pos: XZ;
  /** 朝向（世界） */
  face: XZ;
  anim: AnimName;
  /** 动作从哪一刻开始（挥拍要对上球） */
  t0: number;
  /** 挥拍以外的时候停在哪个动作上 */
  rest: AnimName | 'ready';
  label?: string;
}

const RALLY = 1.7; // 每拍间隔（秒）
const A0 = W(-11.4, -1.4);

function makeActors(): Actor[] {
  const a = (id: string, x: number, z: number, face: XZ, rest: Actor['rest'], label?: string): Actor => ({
    m: byId(id),
    pos: W(x, z),
    face,
    anim: rest === 'ready' ? 'swing' : rest,
    t0: 0,
    rest,
    label,
  });
  return [
    a('jess', -11.4, -1.4, { x: 1, z: 0 }, 'ready', 'E'),
    a('nadia', 11.4, 1.2, { x: -1, z: 0 }, 'ready', 'E'),
    a('gus', -13.2, 4.6, { x: 1, z: 0.2 }, 'idle'),
    a('mateo', 0.3, 6.2, { x: 1, z: 0.2 }, 'idle'),
    a('kidA', 3, 5.8, { x: 1, z: 0.2 }, 'idle'),
    a('dale', 5.2, 5.9, { x: 1, z: 0.3 }, 'idle', 'E'),
    a('lily', 14.6, 0, { x: 0, z: 1 }, 'walk'),
  ];
}

/** 现在的人（对照）：同一块场上 */
const OLD: { o: Omit<PersonOptions, 'x' | 'z'>; at: [number, number]; face: XZ }[] = [
  {
    o: {
      name: 'old-dale',
      wide: true,
      shirt: '#6b2e2a',
      shorts: '#4f5560',
      pants: true,
      skin: '#f1c7a1',
      hair: '#cfcac0',
      hairStyle: 'cap',
      cap: '#2b3440',
      beard: '#cfcac0',
      shoes: '#5a4a3a',
      base: 'relaxed',
    },
    at: [7.1, 5.9],
    face: { x: 1, z: 0.3 },
  },
  {
    o: {
      name: 'old-jess',
      shirt: '#2a8a86',
      shorts: '#f1ece0',
      skin: '#d9a47c',
      hair: '#2a1d16',
      hairStyle: 'pony',
      shoes: '#f1ece0',
      racket: '#e8582c',
      base: 'ready',
    },
    at: [-11.4, -4.0],
    face: { x: 1, z: 0 },
  },
  {
    o: {
      name: 'old-nadia',
      shirt: '#1d1d22',
      trim: '#d6362f',
      shorts: '#1d1d22',
      skin: '#f1c7a1',
      hair: '#e0c48a',
      hairStyle: 'long',
      shoes: '#ffffff',
      racket: '#d6362f',
      base: 'ready',
    },
    at: [11.4, 3.9],
    face: { x: -1, z: 0 },
  },
];

/* ---------- 一档镜头 ---------- */
interface View {
  world: IsoWorld;
  host: HTMLElement;
  visible: boolean;
  update(dt: number, now: number): void;
}

const dirOf = (f: XZ): { facing: Facing; flip: boolean } => {
  // 镜头 rot 0：屏幕横向 = x - z，纵向 = x + z
  const sdx = f.x - f.z;
  const sdy = f.x + f.z;
  return sdy > 0 ? { facing: 'front', flip: sdx < 0 } : { facing: 'back', flip: sdx < 0 };
};

function makeView(
  parent: HTMLElement,
  cap: string,
  pose: { tx: number; tz: number; zoom: number },
  actors: Actor[],
  ball: { pos: { x: number; y: number; z: number }; on: boolean },
  height: number,
): View {
  const host = document.createElement('div');
  host.className = 'e-scene';
  host.style.height = `${height}px`;
  parent.append(host);
  const world = createIsoWorld(host, { ...INDIAN_WELLS_WORLD, pose: { ...pose, rot: 0 }, pixelSize: 1 });
  world.camera.limits = { zoom: [pose.zoom, pose.zoom], tx: [pose.tx, pose.tx], tz: [pose.tz, pose.tz] };
  world.camera.enabled = false;
  site.build(world);
  const ov = site.createOverlays(world);
  for (const f of indianWells.FACILITIES) ov.set(f, STATES[f] ?? 'open');
  ov.flush?.();
  const sky = site.createSky(world);
  createDaylight(world).update(10 * 60 + 20, 0);
  const capEl = document.createElement('div');
  capEl.className = 'e-cap';
  capEl.innerHTML = cap;
  host.append(capEl);

  // E 的人：Custom 节点，原生尺寸
  const nodes = actors.map((ac) => {
    const node = new Custom(
      (r: DrawContext) => {
        const d = dirOf(ac.face);
        const fs = frames(ac.m, ac.anim, d.facing, d.flip, ac.anim === 'walk' ? false : undefined);
        let i: number;
        if (ac.anim === 'swing' && ac.rest === 'ready' && ballClock - ac.t0 > animLength(ac.m, 'swing')) i = 0;
        else i = frameAt(ac.m, ac.anim, ballClock - ac.t0);
        const f = fs[i];
        const gy = site.groundY(ac.pos.x, ac.pos.z);
        // 影子（往右下偏一点，光从左来）
        const [sx, sy] = r.P(ac.pos.x, gy, ac.pos.z);
        const kid = ac.m.build.body === 'kid';
        const rx = kid ? 5 : 7;
        const ry = 2.2;
        for (let y = Math.floor(sy - ry); y <= Math.ceil(sy + ry); y++)
          for (let x = Math.floor(sx - rx + 1); x <= Math.ceil(sx + rx + 1); x++) {
            const dx = (x + 0.5 - sx - 1) / rx;
            const dy = (y + 0.5 - sy) / ry;
            if (dx * dx + dy * dy <= 1) r.darken(x, y, 0.72);
          }
        r.art(f, ac.pos.x, gy, ac.pos.z, { scale: 1 });
      },
      { x0: -0.3, x1: 0.3, y0: 0, y1: 1.9, z0: -0.3, z1: 0.3 },
    );
    world.scene.add(node);
    return { ac, node };
  });

  // 球
  const ballNode = new Custom(
    (r: DrawContext) => {
      if (!ball.on) return;
      const gy = site.groundY(ball.pos.x, ball.pos.z);
      const [gx, gyy] = r.P(ball.pos.x, gy, ball.pos.z);
      r.darken(Math.round(gx), Math.round(gyy), 0.6);
      r.darken(Math.round(gx) + 1, Math.round(gyy), 0.6);
      const [bx, by] = r.P(ball.pos.x, gy + ball.pos.y, ball.pos.z);
      const s = pose.zoom >= 15 ? 2 : 1;
      const c = r.col('#e4f23c');
      r.rect(Math.round(bx), Math.round(by) - s, s + 1, s + 1, c);
      r.pix(Math.round(bx) + s, Math.round(by) - s, r.col('#fbffc0'));
    },
    { x0: -0.1, x1: 0.1, y0: 0, y1: 0.2, z0: -0.1, z1: 0.1 },
  );
  world.scene.add(ballNode);

  // 现在的人
  const pw: PeopleWorld = { scene: world.scene, groundY: site.groundY, people: [] };
  const olds = OLD.map((q) => {
    const at = W(q.at[0], q.at[1]);
    const p = new Person({ ...q.o, x: at.x, z: at.z, lock: Math.atan2(q.face.x, q.face.z) }, pw);
    return p;
  });

  // 名牌
  const tags: { el: HTMLElement; x: () => number; z: () => number; h: number }[] = [];
  const tag = (txt: string, old: boolean, x: () => number, z: () => number, h: number) => {
    const e = document.createElement('div');
    e.className = `e-tag${old ? ' old' : ''}`;
    e.textContent = txt;
    host.append(e);
    tags.push({ el: e, x, z, h });
  };
  for (const { ac } of nodes)
    if (ac.label)
      tag(
        ac.label,
        false,
        () => ac.pos.x,
        () => ac.pos.z,
        42,
      );
  OLD.forEach((_q, i) => {
    const p = olds[i];
    tag(
      '现在',
      true,
      () => p.pos.x,
      () => p.pos.z,
      0,
    );
  });

  const v: View = {
    world,
    host,
    visible: false,
    update(dt, now) {
      for (const n of nodes) n.node.position.set(n.ac.pos.x, site.groundY(n.ac.pos.x, n.ac.pos.z), n.ac.pos.z);
      const pr = world.view.proj;
      setPeopleView(pr.ang, pr.k, pr.spriteScale);
      for (const p of olds) p.update(dt, now);
      sky.update(dt, now, 0, 0.2);
      world.render(dt, now);
      const ss = pr.spriteScale;
      for (const t of tags) {
        const gy = site.groundY(t.x(), t.z());
        const s = world.camera.project(t.x(), gy, t.z());
        const hpx = t.h > 0 ? t.h : 15 * ss;
        t.el.style.left = `${s.x}px`;
        t.el.style.top = `${s.y - hpx - 2}px`;
      }
    },
  };
  return v;
}

/* ---------- 三档 ---------- */
let ballClock = 0;

export function mountScenes(parent: HTMLElement): { update(dt: number, t: number): void } {
  const actors = makeActors();
  const ball = { pos: { x: A0.x, y: 1, z: A0.z }, on: true };
  const at = (x: number, z: number) => F.w({ x, z });
  const views: View[] = [
    makeView(
      parent,
      '<b>A · 游戏默认镜头</b>（竖屏 zoom 4）：E 的人 40 px 高，一块场才 200 px——像贴上去的贴纸',
      { tx: at(-1, 3).x, tz: at(-1, 3).z, zoom: 4 },
      actors,
      ball,
      230,
    ),
    makeView(
      parent,
      '<b>B · 放大 2×</b>（7.8，一块场占满屏宽）：现在的人 14 px，E 还是大将近 3 倍',
      { tx: at(1, 2).x, tz: at(1, 2).z, zoom: 7.8 },
      actors,
      ball,
      230,
    ),
    makeView(
      parent,
      '<b>C · 提案：近景镜头</b>（15.6，半块场）：现在的人放 2 倍 28 px，E 原尺寸 40 px，比例接近真人',
      { tx: at(6.5, 3.5).x, tz: at(6.5, 3.5).z, zoom: 15.6 },
      actors,
      ball,
      300,
    ),
  ];
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      const v = views.find((q) => q.host === e.target);
      if (v) v.visible = e.isIntersecting;
    }
  });
  for (const v of views) io.observe(v.host);

  // 对打：A、B 两人轮流击球
  const [pa, pb] = actors;
  const lily = actors[6];
  let shot = -1;
  return {
    update(dt, t) {
      ballClock = t;
      // 当前是第几拍，谁打向谁
      const n = Math.floor(t / RALLY);
      const u = (t % RALLY) / RALLY;
      const from = n % 2 === 0 ? pa : pb;
      const to = n % 2 === 0 ? pb : pa;
      if (n !== shot) {
        shot = n;
        // 下一拍的人提前起拍，让击球帧（第 3 帧，0.62 s）对上球到的时候
        to.t0 = (n + 1) * RALLY - 0.62;
        to.anim = 'swing';
      }
      const side = (p: Actor) => (p === pa ? -1 : 1);
      const hit = (p: Actor) => F.w({ x: F.l(p.pos).x + 0.3 * side(p), z: F.l(p.pos).z + 0.55 * side(p) });
      const a = hit(from);
      const b = hit(to);
      // 落地点在 3/4 处，弧线最高 1.6 m
      const bu = 0.72;
      ball.pos.x = a.x + (b.x - a.x) * u;
      ball.pos.z = a.z + (b.z - a.z) * u;
      ball.pos.y =
        u < bu
          ? 0.9 * (1 - u / bu) + ((4 * 1.5 * u) / bu) * (1 - u / bu)
          : ((u - bu) / (1 - bu)) * 0.9 * 1.1 * (1 - 0.3 * ((u - bu) / (1 - bu)));
      // Lily 沿着边线来回走
      const L = 11;
      const per = 8;
      const q = (t % (per * 2)) / per;
      const along = q < 1 ? q : 2 - q;
      lily.pos = W(14.7, -5 + along * L);
      lily.face = q < 1 ? { x: 0, z: 1 } : { x: 0, z: -1 };
      for (const v of views) if (v.visible) v.update(dt, t);
    },
  };
}
