import {
  activities,
  type BakedArt,
  bakeArt,
  Custom,
  createDaylight,
  createIsoWorld,
  type DrawContext,
  Group,
  ICON_ART,
  type IconName,
  INDIAN_WELLS,
  INDIAN_WELLS_WORLD,
  type IsoWorld,
  indianWells,
  type Node,
  Particles,
  type PeopleWorld,
  Person,
  Scheduler,
  Sprite,
  SpriteLayer,
  setPeopleView,
} from '@td/iso';
import { mulberry32 } from '@td/shared';
import { LOUNGE_SLOTS, PID, type PostId, STAFF } from './data';
import { type Game, PAIR_FRESH, type Pp } from './model';

/**
 * 场景：真的 Palm Oasis（@td/iso 的 INDIAN_WELLS，设施是中期的样子），五个员工是 Person 精灵，
 * 沿真实步道走（位置由模型算，画面只跟着），到了岗位按岗位演不同的活（青训用活动库的喂球，别的岗位各有姿势和道具）。
 * 拿在手上的人是一个替身，挂在手指上方晃；地上画路线、搭档连线。这里只读模型，不改数值。
 */

type XZ = { x: number; z: number };
const site = INDIAN_WELLS;
/** 中期：中心球场在搭脚手架，匹克球场刚挖出来，其余修好了 */
const MID_STATES: Record<string, string> = {
  stadium_1: 'cleared',
  practice: 'open',
  outer_1: 'resurfaced',
  outer_23: 'playable',
  clubhouse: 'open',
  plaza: 'open',
  stadium_3: 'dug',
  stadium_2: 'open',
};
/**
 * 镜头：框住六个岗位那一片（俱乐部西半边），每个缓冲像素 = 2 个 CSS 像素（3× 手机上是整 6 个物理像素，人约 28 CSS 像素高）。
 * 空地上单指可以平移一点；拿着人的时候绝不平移（main.ts 按下时先判断）。不缩放。
 */
const POSE = { tx: -24, tz: 6.4, zoom: 4, rot: 0 as const };

interface Vis {
  p: Person;
  clone: Person;
  /** 此刻在演哪个岗位的活（null = 跟着模型走） */
  work: PostId | null;
  act: activities.ActivityHandle | null;
  actOn: boolean;
  nextGest: number;
  /** 巡场的小路线进度 */
  loop: number;
  ghost: boolean;
  /** 最近一次的状态（变了就重新安排） */
  key: string;
}

export interface HeldState {
  id: string;
  /** 手指在 stage 里的 CSS 坐标 */
  fx: number;
  fy: number;
  /** 手指横向速度（摆动） */
  vx: number;
  /** 手指底下的地面点 */
  g: XZ;
}

export interface Stage {
  world: IsoWorld;
  update(dt: number, game: Game, juicy: boolean): void;
  project(x: number, y: number, z: number): { x: number; y: number };
  unproject(x: number, y: number): XZ;
  /** 场景里谁的头在 (x, y) 附近（CSS 像素） */
  personAt(x: number, y: number): string | null;
  headOf(id: string): { x: number; y: number };
  setHeld(h: HeldState | null): void;
  /** 拿着人时手指悬停的岗位：画路线 */
  setPreview(path: XZ[] | null): void;
  emote(id: string, icon: IconName, dur?: number): void;
  say(id: string, text: string, bad?: boolean): void;
  dust(x: number, z: number, n?: number, col?: string): void;
  sparkle(x: number, z: number, col?: string, n?: number): void;
  confetti(x: number, z: number): void;
  /** 落地：替身从手指落到岗位上（或者弹回原处） */
  land(id: string, at: XZ | null): void;
  bus(on: boolean): void;
  sand(level: 'sanded' | 'swept' | 'clean'): void;
  /** 拿到画面的人（截图、测试用） */
  readonly persons: Map<string, Person>;
}

export function createStage(host: HTMLElement, bottomPx: () => number, rnd: () => number): Stage {
  // 截图看细节：?zoom=7.8&tx=..&tz=..（平时固定）
  const q = new URLSearchParams(location.search);
  const pose = {
    ...POSE,
    zoom: Number(q.get('zoom')) || POSE.zoom,
    tx: Number(q.get('tx') ?? POSE.tx),
    tz: Number(q.get('tz') ?? POSE.tz),
  };
  const world = createIsoWorld(host, { ...INDIAN_WELLS_WORLD, pose, pixelSize: 2 });
  world.camera.limits = { zoom: [pose.zoom, pose.zoom], tx: [-34, -12], tz: [0, 13] };
  site.build(world);
  const overlays = site.createOverlays(world);
  for (const f of indianWells.FACILITIES) overlays.set(f, MID_STATES[f] ?? 'open');
  overlays.flush?.();
  const sky = site.createSky(world);
  const daylight = createDaylight(world);
  const pw: PeopleWorld = { scene: world.scene, groundY: site.groundY, people: [] };
  const vr = mulberry32(Math.floor(rnd() * 1e9));
  const fxRoot = new Group();
  world.scene.add(fxRoot);
  const parts = new Particles(fxRoot, vr, { groundY: site.groundY });
  const sprites = new SpriteLayer(fxRoot);
  const sched = new Scheduler();
  let now = 0;

  /* ---------- 员工和替身 ---------- */
  const vis = new Map<string, Vis>();
  const persons = new Map<string, Person>();
  STAFF.forEach((s, i) => {
    const sl = LOUNGE_SLOTS[i] as XZ;
    const p = new Person({ name: s.name, x: sl.x, z: sl.z, base: 'relaxed', phone: true, ...s.look }, pw);
    const clone = new Person({ name: `${s.name}-held`, x: sl.x, z: sl.z, base: 'relaxed', ...s.look }, pw);
    clone.root.visible = false;
    persons.set(s.id, p);
    vis.set(s.id, { p, clone, work: null, act: null, actOn: false, nextGest: 0, loop: 0, ghost: false, key: '' });
  });
  const setOpacity = (n: Node, o: number, xray = false) =>
    n.traverse((c) => {
      if (c instanceof Sprite) {
        c.opacity = o;
        c.xray = xray;
      }
    });

  /* ---------- 客人：每个岗位门口排几个人，需求越高越多 ---------- */
  type Guest = { p: Person; post: PostId; i: number; on: boolean; nextEm: number };
  const guests: Guest[] = [];
  const GUEST_AT: Partial<Record<PostId, XZ[]>> = {
    // 会所门口的草坪上排队
    desk: [
      { x: -47.8, z: -6.2 },
      { x: -46.3, z: -5.2 },
      { x: -44.8, z: -6.3 },
      { x: -43.3, z: -5.3 },
      { x: -41.8, z: -6.2 },
      { x: -45.2, z: -3.9 },
    ],
    court: [
      { x: -21, z: 20.5 },
      { x: -19.5, z: 19.2 },
      { x: -18, z: 20.8 },
    ],
    string: [
      { x: -36.2, z: -15.5 },
      { x: -35, z: -14 },
      { x: -36.8, z: -11.8 },
    ],
    clay: [
      { x: 6.5, z: 21 },
      { x: 8, z: 22.6 },
    ],
    pool: [
      { x: -45, z: 2.2 },
      { x: -50, z: 1.8 },
      { x: -53, z: 2.6 },
    ],
    guide: [
      { x: -34.6, z: 2 },
      { x: -34.2, z: -0.8 },
      { x: -33.4, z: 3.6 },
    ],
  };
  for (const [post, pts] of Object.entries(GUEST_AT) as [PostId, XZ[]][])
    pts.forEach((q, i) => {
      const look = activities.look(vr, 'hollow', false);
      const p = new Person({ ...look, name: `g-${post}-${i}`, x: q.x, z: q.z }, pw);
      p.root.visible = false;
      p.idleFace = Math.atan2(PID[post].spot.x - q.x, PID[post].spot.z - q.z);
      guests.push({ p, post, i, on: false, nextEm: 0 });
    });

  /** 旅游大巴来了（游客从长廊走过来） */
  let busOn = false;

  /* ---------- 地上的路线、搭档连线、手上那人的影子 ---------- */
  let preview: XZ[] | null = null;
  let held: HeldState | null = null;
  let walkLines: XZ[][] = [];
  let links: { a: XZ; b: XZ; kind: 'friend' | 'chat' | 'foe' }[] = [];
  const ICONS: Record<string, BakedArt> = {
    heart: bakeArt(ICON_ART.heart),
    anger: bakeArt(ICON_ART.anger),
    note: bakeArt(ICON_ART.note),
  };
  const ground = new Custom(
    (r: DrawContext) => {
      const n = r.spriteScale;
      // 路线和连线是场景里的提示：不被建筑挡（深度设到最前）
      (r as unknown as { zcur: number }).zcur = 1e9;
      const dash = (pts: readonly XZ[], hex: string, w: number, speed: number) => {
        const c = r.em(hex);
        const ink = r.em('#14223a');
        const per = 11 / r.k;
        const len = 7 / r.k;
        let off = ((r.t * speed) / r.k) % per;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1] as XZ;
          const b = pts[i] as XZ;
          const L = Math.hypot(b.x - a.x, b.z - a.z);
          if (L < 0.01) continue;
          for (let s = -off; s < L; s += per) {
            const s0 = Math.max(0, s);
            const s1 = Math.min(L, s + len);
            if (s1 <= s0) continue;
            const p0: [number, number, number] = [a.x + ((b.x - a.x) * s0) / L, 0.06, a.z + ((b.z - a.z) * s0) / L];
            const p1: [number, number, number] = [a.x + ((b.x - a.x) * s1) / L, 0.06, a.z + ((b.z - a.z) * s1) / L];
            const [x0, y0] = r.P(...p0);
            const [x1, y1] = r.P(...p1);
            r.line(Math.round(x0), Math.round(y0) + 1, Math.round(x1), Math.round(y1) + 1, ink, w);
            r.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), c, w);
          }
          off = (off + L) % per;
        }
        // 终点一个菱形
        const e = pts[pts.length - 1] as XZ;
        const [ex, ey] = r.P(e.x, 0.06, e.z);
        for (let j = -3; j <= 3; j++) {
          const h = 3 - Math.abs(j);
          r.rect(Math.round(ex) + j * n - 0, Math.round(ey) - Math.round(h / 2) * n, n, Math.max(1, h) * n, c);
        }
      };
      for (const l of walkLines) dash(l, '#f3ecdc', 2, 8);
      if (preview) {
        dash(preview, '#ffd24a', 3, 14);
        // 落点：岗位地上一圈金色的菱形，一呼一吸（吸附的位置）
        const e = preview[preview.length - 1] as XZ;
        const R = 1.5 + Math.sin(r.t * 8) * 0.25;
        const col = r.em('#ffd24a');
        const pts = [
          [e.x - R, e.z - R],
          [e.x + R, e.z - R],
          [e.x + R, e.z + R],
          [e.x - R, e.z + R],
        ].map(([x, z]) => r.P(x as number, 0.06, z as number));
        for (let i = 0; i < 4; i++) {
          const a = pts[i] as [number, number];
          const b = pts[(i + 1) % 4] as [number, number];
          r.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), col, 2);
        }
      }
      // 搭档连线：头顶高度，金色虚线 / 冤家红色锯齿 / 聊上了蓝色点点
      for (const L of links) {
        const [ax, ay] = r.P(L.a.x, 2.1, L.a.z);
        const [bx, by] = r.P(L.b.x, 2.1, L.b.z);
        const len = Math.max(1, Math.hypot(bx - ax, by - ay));
        const col = r.em(L.kind === 'friend' ? '#ffd24a' : L.kind === 'chat' ? '#9fd8ff' : '#ff5a4a');
        const ph = Math.floor(r.t * 10);
        for (let i = 0; i < len; i += 2) {
          if (((i >> 1) + ph) % 3 === 0) continue;
          const k = i / len;
          let x = ax + (bx - ax) * k;
          let y = ay + (by - ay) * k;
          if (L.kind === 'foe') {
            const z = (i >> 2) % 2 ? 2 : -2;
            x += (-(by - ay) / len) * z;
            y += ((bx - ax) / len) * z;
          }
          r.rect(Math.round(x), Math.round(y), n, n, col);
        }
        const ic = ICONS[L.kind === 'friend' ? 'heart' : L.kind === 'chat' ? 'note' : 'anger'] as BakedArt;
        const m = { x: (L.a.x + L.b.x) / 2, z: (L.a.z + L.b.z) / 2 };
        const bob = Math.round(Math.sin(r.t * 4)) * 0.12;
        r.art(ic, m.x, 2.4 + bob, m.z, { scale: n, lit: 1 });
      }
      // 手上那个人在地上的影子（越高越淡）
      if (held) {
        const [sx, sy] = r.P(held.g.x, 0.05, held.g.z);
        const rx = 5 * n;
        const ry = 2 * n;
        for (let y = -ry; y <= ry; y++)
          for (let x = -rx; x <= rx; x++)
            if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) r.darken(Math.round(sx) + x, Math.round(sy) + y, 0.6);
      }
    },
    { x0: -80, x1: 100, y0: 0, y1: 3, z0: -60, z1: 80 },
  );
  ground.renderOrder = 900;
  ground.lit = 1;
  world.scene.add(ground);

  /* ---------- 工作动画：每种岗位不一样 ---------- */
  const lockToward = (p: Person, q: XZ) => {
    p.lock = Math.atan2(q.x - p.pos.x, q.z - p.pos.z);
  };
  function stopWork(v: Vis): void {
    if (v.act) {
      v.act.stop();
      v.act = null;
    }
    v.actOn = false;
    const p = v.p;
    p.resetAction();
    p.lock = null;
    p.base = 'relaxed';
    p.seatY = null;
    if (p.phone) p.phone.visible = false;
    v.work = null;
  }
  function startWork(v: Vis, post: PostId): void {
    stopWork(v);
    v.work = post;
    v.loop = 0;
    v.nextGest = now + 0.3;
    const p = v.p;
    const d = PID[post];
    p.clearMoves();
    p.pos.x = d.spot.x;
    p.pos.z = d.spot.z;
    if (d.work === 'desk') {
      p.give('R', 'clipboard');
      lockToward(p, { x: -45, z: -5 });
    } else if (d.work === 'rake' || d.work === 'brush') p.give('R', 'rake');
    else if (d.work === 'string') {
      p.give('R', 'racket');
      lockToward(p, { x: -36, z: -15 });
    } else if (d.work === 'guard') {
      p.give('R', 'whistle');
      lockToward(p, { x: -50, z: 8 });
    } else if (d.work === 'guide') {
      p.give('R', 'flag');
      lockToward(p, { x: -34, z: 1 });
    }
  }
  /** 青训：有孩子来上课才开演喂球（教学好的教练演得好，教学差的打瞌睡） */
  function feed(v: Vis, game: Game, pp: Pp): void {
    const want = game.demand('junior') > 0;
    if (want && !v.act) {
      v.p.resetAction();
      const C = Math.max(1, Math.min(5, Math.round(pp.s.st.teach / 18)));
      v.act = activities.startActivity(
        { scene: world.scene, sched, world: pw, groundY: site.groundY, lang: 'zh', rand: vr, spriteScale: 2 },
        'feed',
        {
          area: indianWells.F_P1,
          conditions: { fatigue: 1 - pp.mood / 100, weather: 'sun', coach: C, venue: 'hollow' },
          params: { players: game.demand('junior') >= 3 ? 3 : 2 },
          cast: { coach: v.p, players: [] },
          seed: Math.floor(vr() * 1e6),
        },
      );
    } else if (!want && v.act) {
      v.act.stop({ graceful: true });
      v.act = null;
      v.p.give('R', 'clipboard');
    }
  }
  function animateWork(v: Vis, game: Game, pp: Pp, juicy: boolean): void {
    const p = v.p;
    const d = PID[v.work as PostId];
    const dem = game.demand(d.id);
    const k = juicy ? 1 : 0.5;
    if (d.work === 'feed') {
      feed(v, game, pp);
      return;
    }
    if (now < v.nextGest) return;
    if (d.work === 'desk') {
      const busy = dem > 0;
      p.gesture(busy ? (vr() < 0.5 ? 'wave' : 'talk') : 'hand', now, 1.1);
      v.nextGest = now + (busy ? 1.4 : 3) / k;
    } else if (d.work === 'rake') {
      // 会员场：沿底线来回耙，积沙时扬沙
      const pts = [
        { x: -27, z: 18.2 },
        { x: -20, z: 18.4 },
        { x: -13, z: 18.2 },
        { x: -20, z: 18.6 },
      ];
      const q = pts[v.loop++ % pts.length] as XZ;
      p.go(q.x, q.z, 1.2, { stepMul: 0.8 });
      p.gesture('rake', now, 2.4);
      if (game.posts.court.sand > 0) parts.dust(p.pos.x, 0.2, p.pos.z, 6, '#e8c88a');
      v.nextGest = now + 2.4 / k;
    } else if (d.work === 'brush') {
      // 红土：拖着耙沿场地一圈一圈拉线
      const pts = [
        { x: 3.5, z: 19 },
        { x: 3.5, z: 30 },
        { x: 11, z: 30 },
        { x: 11, z: 19.5 },
        { x: 3.5, z: 19.5 },
      ];
      const q = pts[v.loop++ % pts.length] as XZ;
      p.go(q.x, q.z, 1.6, { stepMul: 0.7 });
      p.gesture('rake', now, 2.6);
      parts.dust(p.pos.x, 0.15, p.pos.z, 3, '#c8643c');
      v.nextGest = now + 2.6 / k;
    } else if (d.work === 'string') {
      p.gesture(vr() < 0.6 ? 'shake' : 'hand', now, 1.3);
      if (juicy && vr() < 0.5) parts.sparkle(p.pos.x, 1.2, p.pos.z, 3, '#f3ecdc');
      v.nextGest = now + 1.6 / k;
    } else if (d.work === 'guard') {
      if (dem > 0) {
        p.gesture(vr() < 0.4 ? 'whistle' : 'point', now, 1);
        for (let i = 0; i < dem; i++) parts.splash(-55 + vr() * 10, 0.1, 4 + vr() * 8, 4);
      } else p.gesture('fan', now, 1.4);
      v.nextGest = now + 1.8 / k;
    } else if (d.work === 'guide') {
      p.gesture(vr() < 0.5 ? 'wave' : 'point', now, 1.2);
      v.nextGest = now + 1.4 / k;
    }
  }
  /** 在休息区、罢工：各有各的样子 */
  function animateRest(v: Vis, pp: Pp): void {
    const p = v.p;
    if (now < v.nextGest) return;
    if (pp.state === 'storm') {
      p.base = 'slump';
      sprites.emote(p.headTop, vr() < 0.5 ? 'anger' : 'zzz', 1.4);
      v.nextGest = now + 2.2;
    } else {
      p.base = vr() < 0.5 ? 'phoneStand' : 'relaxed';
      if (p.phone) p.phone.visible = p.base === 'phoneStand';
      if (p.base === 'relaxed') p.gesture('drink', now, 1.6);
      v.nextGest = now + 3 + vr() * 2;
    }
  }

  /* ---------- 每帧 ---------- */
  let heldVis: Vis | null = null;
  let landing: { v: Vis; from: XZ & { y: number }; to: XZ | null; t: number } | null = null;
  /** 替身放大画（拿起来的人比地上的大一倍，一眼看出"在手上"）：一个 Custom 按替身每个精灵的帧画 */
  const big = { on: false, scale: 2, op: 1 };
  const _w = { x: 0, y: 0, z: 0 };
  const bigNode = new Custom(
    (r: DrawContext) => {
      const v = heldVis;
      if (!big.on || !v) return;
      const c = v.clone;
      c.root.updateMatrixWorld(false);
      const R = c.root.position;
      const S = big.scale;
      const ss = Math.max(1, Math.round(r.spriteScale * S));
      const draw = (n: Node) => {
        if (!(n instanceof Sprite) || !n.frame) return;
        const m = n.matrixWorld;
        _w.x = m[9] as number;
        _w.y = m[10] as number;
        _w.z = m[11] as number;
        (r.art as (a: BakedArt, x: number, y: number, z: number, o: object) => void)(
          n.frame,
          R.x + (_w.x - R.x) * S,
          R.y + (_w.y - R.y) * S,
          R.z + (_w.z - R.z) * S,
          { flipX: n.flipX, scale: ss, lit: 1, opacity: big.op, depth: 1e9 },
        );
      };
      // 身体先画，头发、手里的东西在上面（traverse 是先父后子）
      c.root.traverse((n) => {
        if (n.visible || n === c.root) draw(n);
      });
    },
    { x0: -1, x1: 1, y0: 0, y1: 6, z0: -1, z1: 1 },
  );
  bigNode.renderOrder = 2000;
  /** 放大替身的头顶（表情挂这儿） */
  const bigHead = new Group();
  world.scene.add(bigHead);
  bigNode.lit = 1;
  world.scene.add(bigNode);
  const LIFT_PX = 60;
  function updateHeld(dt: number): void {
    if (held) {
      const v = vis.get(held.id) as Vis;
      if (heldVis !== v) {
        heldVis = v;
        v.clone.resetAction();
        v.clone.pos.x = held.g.x;
        v.clone.pos.z = held.g.z;
      }
      big.on = true;
      big.op = 1;
      big.scale = 2;
      const c = v.clone;
      // 替身挂在手指上方 LIFT_PX（手指不挡人），随手指横向速度摆
      const lift = LIFT_PX / (world.camera.pxPerM * 1.225);
      const sway = Math.max(-0.9, Math.min(0.9, -held.vx * 0.02)) + Math.sin(now * 7) * 0.12;
      c.clearMoves();
      c.pos.x = held.g.x + sway;
      c.pos.z = held.g.z - sway;
      c.yaw = Math.PI * 0.25 + Math.sin(now * 5) * 0.5;
      c.lock = null;
      c.gesture('cheer', now, 0.3);
      c.update(dt, now);
      c.root.position.y = site.groundY(c.pos.x, c.pos.z) + lift + Math.abs(Math.sin(now * 9)) * 0.1;
      bigNode.position.set(c.pos.x, 0, c.pos.z);
      const h = c.headTop.getWorldPosition();
      const R = c.root.position;
      bigHead.position.set(R.x + (h.x - R.x) * 2, R.y + (h.y - R.y) * 2, R.z + (h.z - R.z) * 2);
    } else if (heldVis && !landing) {
      big.on = false;
      heldVis = null;
    }
    if (landing) {
      const L = landing;
      L.t += dt;
      const c = L.v.clone;
      const k = Math.min(1, L.t / 0.2);
      if (L.to) {
        // 落下：从手指上方掉到岗位上、缩回原大小，"咚"一下扬尘；之后留一个淡淡的目的地影子
        c.pos.x = L.from.x + (L.to.x - L.from.x) * k;
        c.pos.z = L.from.z + (L.to.z - L.from.z) * k;
        c.update(dt, now);
        c.root.position.y = L.from.y * (1 - k * k);
        big.scale = 2 - k;
        big.op = L.t > 0.2 ? 0.5 : 1;
        if (L.t > 0.9) {
          big.on = false;
          landing = null;
          heldVis = null;
        }
      } else {
        // 弹回：往上一跳就没了
        c.update(dt, now);
        c.root.position.y = L.from.y + Math.sin(k * Math.PI) * 0.8;
        if (L.t > 0.2) {
          parts.puff(c.pos.x, L.from.y, c.pos.z);
          big.on = false;
          landing = null;
          heldVis = null;
        }
      }
      bigNode.position.set(c.pos.x, 0, c.pos.z);
    }
  }

  function update(dt: number, game: Game, juicy: boolean): void {
    now += dt;
    sched.advance(dt);
    world.camera.occludedBottomPx = bottomPx();
    world.camera.update(dt, null);
    const pr = world.view.proj;
    setPeopleView(pr.ang, pr.k, pr.spriteScale);
    // 员工：走路时跟着模型的位置；到岗演活；拿在手上的人原地留一个半透明的影子
    for (const pp of game.people) {
      const v = vis.get(pp.id) as Vis;
      const ghost = held?.id === pp.id;
      if (ghost !== v.ghost) {
        v.ghost = ghost;
        setOpacity(v.p.root, ghost ? 0.45 : 1);
      }
      const want = pp.state === 'work' ? pp.post : null;
      if (want !== v.work) {
        if (want) startWork(v, want);
        else stopWork(v);
      }
      if (v.work) animateWork(v, game, pp, juicy);
      else {
        const p = v.p;
        const d = Math.hypot(p.pos.x - pp.x, p.pos.z - pp.z);
        p.clearMoves();
        if (d > 0.02) p.go(pp.x, pp.z, Math.max(14, d * 14), { stepMul: 0.35 });
        if (pp.state === 'walk') {
          p.base = 'relaxed';
          if (p.phone) p.phone.visible = false;
          p.lock = null;
        } else animateRest(v, pp);
      }
    }
    // 客人
    for (const g of guests) {
      const dem = game.demand(g.post);
      const n =
        g.post === 'desk'
          ? dem >= 5
            ? 6
            : Math.min(dem, 3)
          : g.post === 'guide'
            ? dem > 0
              ? 3
              : 0
            : Math.min(dem, 3);
      const on = g.i < n && !(g.post === 'court' && game.posts.court.sand > 0);
      if (on !== g.on) {
        g.on = on;
        g.p.root.visible = on;
        const home = (GUEST_AT[g.post] as XZ[])[g.i] as XZ;
        g.p.clearMoves();
        if (on && g.post === 'desk' && busOn) {
          // 大巴的游客：从大门那头沿长廊排着队走过来
          g.p.pos.x = -2 + g.i * 1.4;
          g.p.pos.z = -6.5;
          g.p
            .wait(g.i * 0.3)
            .go(-36.5, -6.5, 5)
            .go(home.x, home.z, 3);
        } else {
          g.p.pos.x = home.x;
          g.p.pos.z = home.z;
          if (on) g.p.hop(now, 0.15, 0.3);
        }
      }
      if (!on || now < g.nextEm) continue;
      const served = game.working(game.posts[g.post].occ);
      if (!served && juicy) {
        sprites.emote(g.p.headTop, g.i === 0 ? 'excl' : 'ques', 1.2);
        g.nextEm = now + 1.6 + vr();
      } else {
        if (juicy && vr() < 0.25) sprites.emote(g.p.headTop, vr() < 0.5 ? 'heart' : 'note', 1.2);
        g.nextEm = now + 3 + vr() * 3;
      }
    }
    // 路线：走在路上的人剩下的路
    walkLines = juicy
      ? game.people
          .filter((pp) => pp.state === 'walk' && pp.path.length)
          .map((pp) => [{ x: pp.x, z: pp.z }, ...pp.path.map((q) => ({ x: q.x, z: q.z }))])
      : [];
    // 搭档连线（干活的两个人挨着）
    links = [];
    if (juicy)
      for (const pp of game.people) {
        if (!game.working(pp) || !pp.post) continue;
        for (const n of game.neighbors(pp, pp.post)) {
          if (n.p.id < pp.id) continue;
          const a = (vis.get(pp.id) as Vis).p.pos;
          const b = (vis.get(n.p.id) as Vis).p.pos;
          const A = v2w(vis.get(pp.id) as Vis, a);
          const B = v2w(vis.get(n.p.id) as Vis, b);
          links.push({
            a: A,
            b: B,
            kind: n.rel < 0 ? 'foe' : game.pairCount(pp, n.p) >= PAIR_FRESH ? 'chat' : 'friend',
          });
        }
      }
    for (const p of [...pw.people]) if (!p.name.endsWith('-held')) p.update(dt, now);
    updateHeld(dt);
    parts.update(dt);
    sprites.update(now);
    sky.update(dt, now, 0, 0.3);
    // 天色：开工的 6 点画成 8 点的亮，收工停在 18:30 的金色（入夜重烘静态层会卡一下）
    daylight.update(480 + ((game.t - 360) / 960) * (1110 - 480), 0);
    world.render(dt, now);
  }
  /** 借给活动的人坐标是活动的局部坐标：换回世界 */
  function v2w(v: Vis, pos: { x: number; z: number }): XZ {
    if (!v.act) return { x: pos.x, z: pos.z };
    const w = v.p.root.getWorldPosition();
    return { x: w.x, z: w.z };
  }

  const project = (x: number, y: number, z: number) => {
    const s = world.camera.project(x, y, z);
    return { x: s.x, y: s.y };
  };
  const headOf = (id: string) => {
    const v = vis.get(id) as Vis;
    const w = v.p.headTop.getWorldPosition();
    return project(w.x, w.y, w.z);
  };
  return {
    world,
    update,
    project,
    unproject: (x, y) => world.camera.unproject(x, y),
    personAt(x, y) {
      let best: string | null = null;
      let bd = 30;
      for (const [id, v] of vis) {
        if (!v.p.root.visible) continue;
        const f = v.p.root.getWorldPosition();
        const feet = project(f.x, f.y, f.z);
        const h = headOf(id);
        const cy = (feet.y + h.y) / 2;
        const d = Math.hypot(x - feet.x, (y - cy) * 0.7);
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      return best;
    },
    headOf,
    setHeld(h) {
      held = h;
    },
    setPreview(p) {
      preview = p;
    },
    emote(id, icon, dur = 1.6) {
      const v = vis.get(id);
      if (v) sprites.emote(heldVis === v && held ? bigHead : v.p.headTop, icon, dur);
    },
    say(id, text, bad = false) {
      const v = vis.get(id);
      if (v) sprites.say(v.p.headTop, text, 2.2, bad ? { bg: '#ffe2d8' } : {});
    },
    dust(x, z, n = 12, col = '#d8c08a') {
      parts.dust(x, 0.1, z, n, col);
    },
    sparkle(x, z, col = '#ffe45c', n = 14) {
      parts.sparkle(x, 1.4, z, n, col);
    },
    confetti(x, z) {
      parts.confetti(x, 2, z, 40, 2);
    },
    land(id, at) {
      const v = vis.get(id) as Vis;
      const c = v.clone;
      landing = { v, from: { x: c.pos.x, z: c.pos.z, y: c.root.position.y }, to: at, t: 0 };
      heldVis = v;
      held = null;
    },
    bus(on) {
      // 大门在画面外：不演车，只演一队游客从长廊走过来
      busOn = on;
    },
    sand(level) {
      overlays.set('outer_1', level === 'sanded' ? 'sanded' : level === 'swept' ? 'swept' : 'resurfaced');
      if (level === 'sanded') parts.dust(-17, 0.5, 25, 40, '#e8c88a');
    },
    persons,
  };
}
