/**
 * 放进游戏：真的 Palm Oasis（INDIAN_WELLS），镜头是游戏的默认缩放（zoom 4，手机上每个缓冲像素 1 个 CSS 像素；?px=2 放大一倍）。
 * 青训 1 号场上 Nadia 和 Jess 对打，场边 Dale 带两个小孩、Lily 看手机、Gus 拄着扫帚叹气、Teodora 看拍线，
 * 南边步道上 Ray 一瘸一拐、Mateo 蹦着走、Ben、总监和客人来回走；旁边放一个现在的人（Person）对照。
 * 演出里的随机只决定画面。
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
  indianWells,
  type PeopleWorld,
  Person,
  type PersonOptions,
  Sprite,
  screenDir,
  setPeopleView,
} from '@td/iso';
import { mulberry32 } from '@td/shared';
import { byId, type CharDef, type ClipName } from './cast';
import { anim, frameAt } from './frames';
import type { Facing } from './rig';

const site = INDIAN_WELLS;
const { F_P1 } = indianWells;

interface Actor {
  ch: CharDef;
  root: Group;
  spr: Sprite;
  x: number;
  z: number;
  clip: ClipName;
  t: number;
  facing: Facing;
  flip: boolean;
  label?: HTMLElement;
  /** 每帧的行为 */
  tick: (a: Actor, dt: number) => void;
}

/** 朝着世界方向 (dx, dz) 看：正面 / 背面、要不要翻 */
function face(a: Actor, dx: number, dz: number, ang: number): void {
  if (Math.abs(dx) + Math.abs(dz) < 1e-6) return;
  const { sdx, sdy } = screenDir(dx, dz, ang);
  a.facing = sdy >= 0 ? 'front' : 'back';
  a.flip = sdx < 0;
}

export interface CharScene {
  update(dt: number): void;
}

export function createCharScene(
  host: HTMLElement,
  px: number,
  showLabels: boolean,
  cam: { tx?: number; tz?: number; zoom?: number } = {},
): CharScene {
  const rand = mulberry32(2026);
  const world = createIsoWorld(host, {
    ...INDIAN_WELLS_WORLD,
    pixelSize: px,
    pose: { tx: cam.tx ?? -16, tz: cam.tz ?? 4, zoom: cam.zoom ?? 4, rot: 0 },
  });
  world.camera.limits = { zoom: [cam.zoom ?? 4, cam.zoom ?? 4], tx: [-40, 10], tz: [-10, 30] };
  world.camera.enabled = true;
  site.build(world);
  const ov = site.createOverlays(world);
  for (const f of indianWells.FACILITIES) ov.set(f, indianWells.RESTORED_STATES[f]);
  ov.flush?.();
  const sky = site.createSky(world);
  const daylight = createDaylight(world);
  const ang = () => world.view.proj.ang;
  const labels = document.createElement('div');
  labels.className = 'd-labels';
  host.append(labels);

  const actors: Actor[] = [];
  const add = (id: string, x: number, z: number, tick: Actor['tick'], clip: ClipName = 'idle', t0 = 0): Actor => {
    const ch = byId(id);
    const root = new Group();
    root.name = id;
    const shadow = new Custom(
      (r: DrawContext, self: Custom) => {
        const w = self.getWorldPosition();
        const [sx, sy] = r.P(w.x, site.groundY(w.x, w.z), w.z);
        const s = r.spriteScale;
        const wide = ch.rig.tpl.hipHalf + 2.5;
        const rx = wide * s;
        const ry = 1.5 * s;
        for (let y = Math.floor(sy - ry); y <= Math.ceil(sy + ry); y++)
          for (let x = Math.floor(sx - rx); x <= Math.ceil(sx + rx); x++) {
            const dx = (x + 0.5 - sx) / rx;
            const dy = (y + 0.5 - sy) / ry;
            if (dx * dx + dy * dy <= 1) r.darken(x, y, 0.72);
          }
      },
      { x0: -0.3, x1: 0.3, y0: 0, y1: 0.05, z0: -0.3, z1: 0.3 },
    );
    shadow.renderOrder = -0.05;
    const spr = new Sprite();
    spr.xray = true;
    root.add(shadow, spr);
    world.scene.add(root);
    const a: Actor = { ch, root, spr, x, z, clip, t: t0, facing: 'front', flip: false, tick };
    if (showLabels && !id.startsWith('kid')) {
      const el = document.createElement('div');
      el.className = 'd-tag';
      el.textContent = ch.name;
      labels.append(el);
      a.label = el;
    }
    actors.push(a);
    return a;
  };
  const play = (a: Actor, clip: ClipName) => {
    if (a.clip !== clip) {
      a.clip = clip;
      a.t = 0;
    }
  };
  /** 站着演 idle，偶尔来一下情绪 */
  const idler =
    (dx: number, dz: number, emoteEvery = 0): Actor['tick'] =>
    (a) => {
      face(a, dx, dz, ang());
      if (a.clip === 'emote' && a.t > anim(a.ch, 'emote', a.facing).total * 2) play(a, 'idle');
      if (emoteEvery && a.clip === 'idle' && a.t > emoteEvery) play(a, 'emote');
    };
  /** 在几个点之间来回走，到了站一会儿 */
  const walker = (pts: readonly [number, number][], pause: number): Actor['tick'] => {
    let i = 1;
    let wait = 0;
    return (a, dt) => {
      if (wait > 0) {
        wait -= dt;
        play(a, 'idle');
        return;
      }
      const [tx, tz] = pts[i] as [number, number];
      const dx = tx - a.x;
      const dz = tz - a.z;
      const d = Math.hypot(dx, dz);
      const step = a.ch.speed * dt;
      play(a, 'walk');
      face(a, dx, dz, ang());
      if (d <= step) {
        a.x = tx;
        a.z = tz;
        i = (i + 1) % pts.length;
        wait = pause * (0.6 + rand() * 0.8);
      } else {
        a.x += (dx / d) * step;
        a.z += (dz / d) * step;
      }
    };
  };

  /* ---- 青训 1 号场：Nadia 和 Jess 对打 ---- */
  const w = (x: number, z: number) => F_P1.w({ x, z });
  const pA = w(-10.5, 0.8);
  const pB = w(10.5, -0.8);
  const nadia = add('nadia', pA.x, pA.z, () => {});
  const jess = add('jess', pB.x, pB.z, () => {});
  const ball = { x: pA.x, y: 1, z: pA.z, on: false };
  const rally = { from: nadia, to: jess, t: 0, T: 1.5, x0: 0, z0: 0, x1: 0, z1: 0, swung: false };
  const serve = (from: Actor, to: Actor) => {
    rally.from = from;
    rally.to = to;
    rally.t = 0;
    rally.T = 1.3 + rand() * 0.4;
    rally.x0 = from.x + (from === nadia ? 0.6 : -0.6);
    rally.z0 = from.z;
    const side = to === jess ? pB : pA;
    rally.x1 = side.x + (to === jess ? -0.4 : 0.4);
    rally.z1 = side.z + (rand() * 4 - 2);
    rally.swung = false;
    ball.on = true;
  };
  const contactT = (a: Actor) => {
    const an = anim(a.ch, 'swing', a.facing);
    return (an.dts[0] as number) + (an.dts[1] as number);
  };
  const player = (a: Actor, other: Actor, base: { x: number; z: number }) => (p: Actor, dt: number) => {
    face(p, other.x - p.x, other.z - p.z, ang());
    if (p.clip === 'swing' && p.t >= anim(p.ch, 'swing', p.facing).total) play(p, 'idle');
    // 接球的一方往落点挪
    const tz = rally.to === a ? rally.z1 : base.z;
    const dz = tz - p.z;
    if (p.clip !== 'swing') {
      if (Math.abs(dz) > 0.15) {
        p.z += Math.sign(dz) * Math.min(Math.abs(dz), 2.4 * dt);
        play(p, 'walk');
        face(p, 0, dz, ang());
      } else {
        play(p, 'idle');
        face(p, other.x - p.x, other.z - p.z, ang());
      }
    }
  };
  nadia.tick = player(nadia, jess, pA);
  jess.tick = player(jess, nadia, pB);
  const ballNode = new Custom(
    (r: DrawContext) => {
      if (!ball.on) return;
      const [gx, gy] = r.P(ball.x, site.groundY(ball.x, ball.z), ball.z);
      r.darken(Math.floor(gx), Math.floor(gy), 0.6);
      const [sx, sy] = r.P(ball.x, ball.y, ball.z);
      const c = r.col('#e4f04a');
      const s = r.spriteScale;
      r.rect(Math.floor(sx), Math.floor(sy), s, s, c);
    },
    { x0: -0.1, x1: 0.1, y0: 0, y1: 0.2, z0: -0.1, z1: 0.1 },
  );
  ballNode.renderOrder = 0.5;
  world.scene.add(ballNode);
  const tickRally = (dt: number) => {
    rally.t += dt;
    const u = Math.min(1, rally.t / rally.T);
    // 一跳：先飞到 72% 处落地，再弹到对面
    const bx = rally.x0 + (rally.x1 - rally.x0) * u;
    const bz = rally.z0 + (rally.z1 - rally.z0) * u;
    const h =
      u < 0.72 ? 1 + 1.6 * Math.sin((u / 0.72) * Math.PI) - u * 0.9 : 0.9 * Math.sin(((u - 0.72) / 0.28) * Math.PI);
    ball.x = bx;
    ball.z = bz;
    ball.y = site.groundY(bx, bz) + Math.max(0.05, h);
    const to = rally.to;
    if (!rally.swung && rally.T - rally.t <= contactT(to)) {
      rally.swung = true;
      play(to, 'swing');
    }
    if (u >= 1) serve(to, rally.from === to ? jess : rally.from);
  };
  serve(nadia, jess);
  play(nadia, 'swing');
  nadia.t = contactT(nadia);

  /* ---- 近处边线外：Dale 带两个小孩（小孩在场里练挥拍）；远处边线外：Lily、Gus、Teodora ---- */
  const near = (x: number) => w(x, 7.2);
  const far = (x: number) => w(x, -7.0);
  const dl = near(-6);
  add('dale', dl.x, dl.z, idler(1, -0.4, 9));
  const k1 = w(-5, 4.2);
  const k2 = w(-2, 4.6);
  const drill =
    (every: number): Actor['tick'] =>
    (a) => {
      face(a, 0.2, -1, ang());
      if (a.t > every && a.clip === 'idle') play(a, 'swing');
      if (a.clip === 'swing' && a.t > anim(a.ch, 'swing', a.facing).total) play(a, 'idle');
    };
  add('kid_s', k1.x, k1.z, drill(3.4));
  add('kid_b', k2.x, k2.z, drill(2.6));
  const ly = far(-5);
  add('lily', ly.x, ly.z, idler(1, 0.3));
  const gs = far(3);
  add('gus', gs.x, gs.z, idler(1, 0.5, 14));
  const te = far(9);
  add('teodora', te.x, te.z, idler(1, 0.6));

  /* ---- 北边长廊（z = -6.5）和南边步道（z = 15.5）上走来走去的人 ---- */
  const N = -6.5;
  const Z = 15.5;
  add(
    'ray',
    -30,
    N + 0.4,
    walker(
      [
        [-30, N + 0.4],
        [-10, N + 0.4],
      ],
      2.2,
    ),
    'walk',
  );
  add(
    'ben',
    -12,
    N - 0.5,
    walker(
      [
        [-34, N - 0.5],
        [-2, N - 0.5],
      ],
      1.2,
    ),
    'walk',
  );
  add(
    'director',
    -20,
    N + 1.2,
    walker(
      [
        [-4, N + 1.2],
        [-26, N + 1.2],
      ],
      1.8,
    ),
    'walk',
  );
  add(
    'mateo',
    -4,
    Z + 0.4,
    walker(
      [
        [-2, Z + 0.4],
        [-22, Z + 0.4],
      ],
      1.6,
    ),
    'walk',
  );
  add(
    'tourist',
    -36.5,
    10,
    walker(
      [
        [-36.8, 12],
        [-36.8, -4],
      ],
      3,
    ),
    'walk',
  );
  add(
    'mom',
    -15,
    Z + 1.2,
    walker(
      [
        [-30, Z + 1.2],
        [-6, Z + 1.2],
      ],
      1.5,
    ),
    'walk',
  );
  add('retiree', -3.5, Z + 0.4, idler(-1, -0.2));
  add('rosa', -35.5, 0.5, idler(1, 0.2));

  /* ---- 对照：现在的人（Person）站在 Dale 旁边 ---- */
  const pw: PeopleWorld = { scene: world.scene, groundY: site.groundY, people: [] };
  const oldLooks: [Omit<PersonOptions, 'x' | 'z'>, number][] = [
    [
      {
        name: 'old-dale',
        wide: true,
        shirt: '#6b2e2a',
        shorts: '#4f5560',
        pants: true,
        skin: '#e8b896',
        hair: '#cfcac0',
        hairStyle: 'cap',
        cap: '#2b3440',
        beard: '#cfcac0',
        shoes: '#5a4a3a',
        base: 'relaxed',
      },
      -8.6,
    ],
    [
      {
        name: 'old-lily',
        shirt: '#3d3a6a',
        shorts: '#20202a',
        pants: true,
        skin: '#f1c9a5',
        hair: '#141016',
        hairStyle: 'long',
        shoes: '#d8d0c8',
        base: 'phoneStand',
        phone: true,
      },
      -6.6,
    ],
  ];
  const olds: Person[] = [];
  const oldTags: HTMLElement[] = [];
  oldLooks.forEach(([o, lx], i) => {
    const p = i === 0 ? near(lx) : far(lx);
    olds.push(new Person({ ...o, x: p.x, z: p.z, yaw: Math.PI / 4 } as PersonOptions, pw));
    if (showLabels) {
      const el = document.createElement('div');
      el.className = 'd-tag old';
      el.textContent = '现在';
      labels.append(el);
      oldTags.push(el);
    }
  });

  let now = 0;
  const place = (el: HTMLElement, x: number, y: number, z: number) => {
    const p = world.camera.project(x, y, z);
    el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
  };
  return {
    update(dt) {
      now += dt;
      world.camera.update(dt, null);
      const pr = world.view.proj;
      setPeopleView(pr.ang, pr.k, pr.spriteScale);
      tickRally(dt);
      for (const a of actors) {
        a.t += dt;
        a.tick(a, dt);
        const an = anim(a.ch, a.clip, a.facing);
        a.spr.frame = an.baked[frameAt(an, a.t)] as BakedArt;
        a.spr.flipX = a.flip;
        a.root.position.set(a.x, site.groundY(a.x, a.z), a.z);
        if (a.label) {
          const top = (a.ch.rig.tpl.legLen + 18) / pr.k / 1.225;
          place(a.label, a.x, top * pr.spriteScale, a.z);
        }
      }
      for (const p of olds) p.update(dt, now);
      oldTags.forEach((el, i) => {
        const p = olds[i] as Person;
        place(el, p.pos.x, 2.6 * (4 / pr.k) * pr.spriteScale, p.pos.z);
      });
      sky.update(dt, now, 0, 0.3);
      daylight.update(600, 0);
      world.render(dt, now);
    },
  };
}
