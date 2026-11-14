// 小游戏 9 · 泳池救生（泳池，clubpool）：下午的泳池人很多，总监顶救生员的班。120 秒。
// - 水里的人游来游去（自由泳的一趟趟游、浅水那头玩水的；偶尔有人招手 = 假警报）。
// - 有人呛水：先是不匀的水花 + 两只手乱举（不出标记，盯得紧的人能先看出来），TELL 秒后头顶冒 "!"、出箭头和缩小的倒计时圈。
//   跑到离他最近的池边按"救人"（或者直接点他：走到最近的池边、自动扔救生圈）。越快分越多；倒计时完了 = 没看住，−1 ♥（三个用完提前结束）。
// - 闲下来：按住"捞叶子"沿池边走（风把叶子吹着漂）；收地上的毛巾、洒了的饮料（孩子踩到会滑倒）；
//   点池边乱跑的孩子吹哨（走近了按"吹哨"也行），不管的话跑一阵就滑倒（扣分）。
// - 越到后面：池里人越多、事越密、能同时出两三起。
// 场面：场景原样（clubpool 的 Region，白模用"颜色白模" ?accent=2），高椅上的救生员换成总监（开局站在高椅东边）；
// 水里的人复用场景摆的那几个（swim-lap、swim-2、swim-parent、swim-kid + 游泳圈），不够再用 clubsite/people 建；
// 落叶、捞网复用场景的 reuse（clubplaza 画的）；毛巾、杯子、救生圈、水花是这里用泳池调色板拼的小东西。
// 星级（rules.ts STARS 1500 / 2800 / 3800）：bot 跑整局调的（?pause=1，每 0.2 秒看一眼，走路用 tapWorld）：
//   反应 0.6 秒、什么都管 ≈ 3900–4600（三星）；反应 1.0 秒 ≈ 3700–4500；反应 1.5 秒 ≈ 2900–3900（二星，偶尔三个都没看住提前结束）；
//   反应 2.5 秒、不管孩子也不收拾 ≈ 1200–2300（一星上下）。
// 镜头竖屏定住（整个池子 + 一圈池沿都在画面里）；能走的范围裁到画面里。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { CLOUDS, H, MPT, POOL, SLOTS } from '../../clubpool/layout';
import { REUSED } from '../../clubpool/reuse';
import { createPoolRegion } from '../../clubpool/scene';
import { kid as buildKid, player as buildPlayer } from '../../clubsite/people';
import type { Interactable } from '../../clubsite/play';
import type { BaseCtx } from '../../clubsite/render/ctx';
import { mountMinigame } from '../shell';
import { poolCtx } from './ctx';
import { createSplash } from './fx';
import {
  canReach,
  DURATION,
  distToRect,
  drift,
  edgeDist,
  edgePoint,
  FIRST_INCIDENT,
  LEAF_PTS,
  LITTER_PTS,
  LIVES,
  level,
  NET_REACH,
  nextGap,
  RIM_NEAR,
  rimLoop,
  SLIP_PENALTY,
  STARS,
  savePoints,
  saveWord,
  settle,
  TELL,
  THROW_EXTRA,
  WHISTLE_PTS,
  windAt,
} from './rules';
import { fist, headTop, rigOf, type Stroke, type SwimRig, struggleDip, swimPose } from './swim';

// 场景还是白模：默认用"颜色白模"（占位换成计划的主体材质；URL 里给了 accent 就按 URL）
if (!new URLSearchParams(location.search).has('accent')) {
  const u = new URL(location.href);
  u.searchParams.set('accent', '2');
  history.replaceState(null, '', u);
}

/** 总监开局：救生员高椅（−52.5, 1.7）东边，面朝池子 */
const START: [number, number] = [-50.6, 2.1];
const WATER = H.water;
/** 自由泳的泳道（z）、来回的两头（x）：东头让开浅水台阶 */
const LANES = [4.1, 5.5, 6.9, 8.3, 9.7, 11.1, 12.2];
const LAP_X0 = POOL.x0 + 0.9;
const LAP_X1 = POOL.x1 - 1.9;
/** 浅水那头（玩水的人待的地方） */
const SHALLOW = { x0: -46.8, x1: -44.0, z0: 4.2, z1: 11.8 };
/** 孩子乱跑的那一圈：池沿压顶上（池子往外 0.4 米） */
const RIM = rimLoop(POOL, 0.4);
/** 孩子从浅水台阶边爬上来 / 跑回去下水的地方 */
const KID_HOME = RIM.nearest(POOL.x1 + 0.4, 8.0);
/** 跑道上的弧长取模到 [0, 周长) */
const loopMod = (s: number) => ((s % RIM.len) + RIM.len) % RIM.len;

const v3 = () => new THREE.Vector3();

mountMinigame({
  id: 'lifeguard',
  title: '泳池救生',
  tag: '小游戏 9 · 泳池',
  goal: '下午的泳池人很多，你来顶救生员的班：盯紧水里的人，有人呛水马上去救！',
  howto: [
    '拖动走路；点地面、点人都会走过去',
    '有人乱扑腾、两手乱举 → 跑到最近的池边按「救人」（或直接点他）。越快分越多，没救到 −1 ♥',
    '闲下来：按住「捞叶子」沿池边走；收掉地上的毛巾、杯子',
    '点池边乱跑的孩子吹哨，不然他会滑倒',
  ],
  region: createPoolRegion,
  clouds: CLOUDS,
  life: false,
  hour: 15.5,
  weather: 'clear',
  start: { start: START, yaw: 0 },
  // 镜头：竖屏不动（整个池子都在画面里，什么时候、哪里出事都看得见）
  zoom: 1,
  // （view 的上下只有 2 米 = 比画面窄 → 相机的 z 定在中间；竖屏宽 17.6 米 = view 的宽 → 左右也定住：整个池子和一圈池沿总在画面里）
  camera: {
    lead: { portrait: 5.2, landscape: 5.2 },
    dead: [2.4, 16],
    view: { x0: -58.8, x1: -41.2, z0: 6.3, z1: 8.3 },
  },
  // 能走的范围裁到画面里（东西两头的躺椅、毛巾车在画面外，也用不着过去）
  nav: (n) => ({ ...n, bounds: { ...n.bounds, x0: -58.6, x1: -41.4 } }),
  duration: DURATION,
  stars: STARS,
  setup(mg) {
    const { scene, play } = mg;
    const D = play.director;
    const pctx = poolCtx(mg.uniforms, mg.params, () => mg.pipe.rig.metersPerTexel, MPT);
    const p0 = pctx(0);
    const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? null;
    let round = 0;
    const live = (r: number) => r === round && mg.state === 'playing';

    // ── 场面：高椅上的救生员下班了（总监顶班）；场景摆的叶子、悬着的捞网收走（换成这里会漂的、总监手里的）──
    for (const id of ['lifeguard', 'litter-1', 'litter-2', 'skim-net']) {
      const o = slot(id);
      if (o) o.visible = false;
    }

    // ── 小东西（泳池调色板）──
    const prep = (o: THREE.Object3D) => {
      p0.mats.prepare(o);
      return o;
    };
    const boxMesh = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y + h / 2, z);
      return o;
    };
    const mRed = p0.mat('clothRed');
    const mWhite = p0.mat('clothWhite');
    const mStripe = p0.mat('canvasStripe');
    const mCushion = p0.mat('accCushion');
    const mTeal = p0.mat('clothTeal');
    const mPuddle = p0.mat('poolWater', { edge: 0, convex: 0 });
    const mFoam = p0.mat('foam', { edge: 0, convex: 0 });

    /** 救生圈：红圈 + 四段白 */
    const makeBuoy = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.08, 6, 14).rotateX(Math.PI / 2), mRed));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const b = boxMesh(0.12, 0.17, 0.19, mWhite, Math.cos(a) * 0.26, -0.085, Math.sin(a) * 0.26);
        b.rotation.y = -a;
        g.add(b);
      }
      return prep(g);
    };

    /** 毛巾（条纹 / 橙 / 青）和洒了的饮料（倒着的杯子 + 一摊水） */
    const makeTowel = (v: number) => {
      const g = new THREE.Group();
      const m = [mStripe, mCushion, mTeal][v % 3];
      g.add(boxMesh(0.78, 0.04, 0.44, m));
      g.add(boxMesh(0.08, 0.045, 0.44, mWhite, -0.28));
      g.add(boxMesh(0.08, 0.045, 0.44, mWhite, 0.28));
      // 一角翻起来（一眼看出是扔下的毛巾，不是地砖）
      const fold = boxMesh(0.24, 0.035, 0.3, m, 0.3, 0.04, 0.05);
      fold.rotation.z = 0.5;
      g.add(fold);
      return prep(g);
    };
    const makeSpill = () => {
      const g = new THREE.Group();
      const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.015, 14), mPuddle);
      puddle.scale.set(1.25, 1, 0.8);
      puddle.position.y = 0.008;
      g.add(puddle);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.18, 8), mWhite);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(-0.32, 0.075, -0.06);
      g.add(cup);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8), mRed);
      lid.rotation.z = Math.PI / 2;
      lid.position.set(-0.22, 0.075, -0.06);
      g.add(lid);
      return prep(g);
    };

    // ── 水花、涟漪 ──
    const fxRng = mg.rng('fx');
    const fx = createSplash(scene, mFoam, WATER, fxRng);
    mg.onStep((dt) => fx.step(dt));

    // ── 捞网：clubplaza 画的那把（clubpool 复用），总监一直拿着（放不下）──
    const net = REUSED['skim-net'](pctx(0));
    const netGrip = net.userData.grip as Record<string, unknown>;
    D.userData.setSkim?.({ water: WATER - H.deck });
    let skimming = false;
    const netItem = play.addItem({
      id: 'net',
      name: '捞网',
      obj: net,
      grip: netGrip,
      droppable: false,
      use: {
        label: () => (mg.state === 'playing' ? '捞叶子' : ''),
        canUse: () => mg.state === 'playing',
        pose: 'skim',
        holdSpeed: 1.9,
        onUse: () => {
          skimming = true;
        },
        onHold: () => {
          skimming = true;
          return true;
        },
        onRelease: () => {
          skimming = false;
        },
      },
    });

    // ── 叶子：一池子预先建好的蒲葵叶（复用），漂在水上跟着风走 ──
    interface Leaf {
      obj: THREE.Object3D;
      on: boolean;
      x: number;
      z: number;
      vx: number;
      vz: number;
      yaw: number;
      spin: number;
      fall: number;
      /** 被捞起来：飞向网圈 */
      got: number;
      from: THREE.Vector3;
    }
    const LEAF_N = 16;
    const LEAF_S = 1.15;
    const leaves: Leaf[] = Array.from({ length: LEAF_N }, (_, i) => {
      const obj = REUSED['palm-litter'](pctx(i % 2));
      obj.visible = false;
      obj.scale.setScalar(LEAF_S);
      scene.add(obj);
      return { obj, on: false, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, spin: 0, fall: 0, got: -1, from: v3() };
    });
    const leafCount = () => leaves.filter((l) => l.on && l.got < 0).length;
    let windPhase = 0;
    const wind = () => windAt(mg.t, windPhase);
    const netTip = v3();
    mg.onStep((dt) => {
      const w = wind();
      for (const l of leaves) {
        if (!l.on) continue;
        if (l.got >= 0) {
          // 飞进网兜
          l.got += dt / 0.35;
          const k = Math.min(1, l.got);
          const tip = netTipNow();
          l.obj.position.lerpVectors(l.from, tip, k);
          l.obj.position.y += 0.5 * k * (1 - k);
          l.obj.scale.setScalar(LEAF_S * (1 - 0.6 * k));
          if (k >= 1) {
            l.on = false;
            l.obj.visible = false;
          }
          continue;
        }
        if (l.fall < 1) l.fall = Math.min(1, l.fall + dt / 1.1);
        drift(l, { x: w.x * 0.9, z: w.z * 0.9 }, dt, POOL, 0.35, 0.5);
        // 叶子之间互相让开一点（风把它们吹到同一个角落时不叠成一片）
        for (const o of leaves) {
          if (o === l || !o.on || o.got >= 0) continue;
          const dx = l.x - o.x;
          const dz = l.z - o.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.01 && d < 0.55) {
            l.x += (dx / d) * (0.55 - d) * 0.5;
            l.z += (dz / d) * (0.55 - d) * 0.5;
          }
        }
        l.yaw += l.spin * dt;
        l.spin *= 1 - dt * 0.3;
        const fallY = (1 - l.fall) * (1 - l.fall) * 2.6;
        l.obj.position.set(l.x + Math.sin(l.fall * 9) * (1 - l.fall) * 0.4, WATER + 0.01 + fallY, l.z);
        l.obj.rotation.set(0, l.yaw + (1 - l.fall) * 3, 0);
      }
    });
    const netTipNow = () => {
      const tp = D.userData.toolTip?.() as THREE.Vector3 | null;
      if (tp) return netTip.copy(tp);
      return netTip.set(D.position.x, D.position.y + 0.6, D.position.z);
    };
    const leafRng = () => mg.rng(`leaf:${mg.round}`);
    let lr = leafRng();
    const spawnLeaf = (initial = false) => {
      const l = leaves.find((q) => !q.on);
      if (!l) return;
      l.on = true;
      l.got = -1;
      l.x = POOL.x0 + 0.6 + lr() * (POOL.x1 - POOL.x0 - 1.2);
      l.z = POOL.z0 + 0.6 + lr() * (POOL.z1 - POOL.z0 - 1.2);
      l.vx = 0;
      l.vz = 0;
      l.yaw = lr() * Math.PI * 2;
      l.spin = (lr() - 0.5) * 1.2;
      l.fall = initial ? 1 : 0;
      l.obj.scale.setScalar(LEAF_S);
      l.obj.visible = true;
    };

    // ── 地上的东西：毛巾、洒了的饮料（孩子踩到会滑倒）──
    interface Litter {
      id: number;
      kind: 'towel' | 'spill';
      obj: THREE.Object3D;
      x: number;
      z: number;
      top: THREE.Vector3;
      on: boolean;
    }
    const litter: Litter[] = [];
    for (let i = 0; i < 5; i++) {
      for (const kind of ['towel', 'spill'] as const) {
        const obj = kind === 'towel' ? makeTowel(i) : makeSpill();
        obj.visible = false;
        scene.add(obj);
        litter.push({ id: litter.length, kind, obj, x: 0, z: 0, top: v3(), on: false });
      }
    }
    const litterOn = () => litter.filter((l) => l.on);
    /** 能扔东西的地方：池边一圈走道（躺椅前、池沿外），导航上能站、不压着家具 */
    const litterSpots: [number, number][] = [];
    for (let x = POOL.x0 - 1.0; x <= POOL.x1 + 1.0; x += 0.7)
      for (const z of [POOL.z1 + 0.9, POOL.z1 + 1.4, POOL.z0 - 0.75]) litterSpots.push([x, z]);
    for (let z = POOL.z0; z <= POOL.z1; z += 0.7)
      for (const x of [POOL.x0 - 1.0, POOL.x1 + 1.0]) litterSpots.push([x, z]);
    const okSpot = (x: number, z: number) =>
      play.nav.height(x, z) !== null && !play.nav.hitsBlocked(x, z, 0.4) && distToRect(x, z, POOL) > 0.5;
    const spots = litterSpots.filter(([x, z]) => okSpot(x, z));
    let litRng = mg.rng('litter:1');
    let litterCount = 0;
    let litterGot = 0;
    const removeLitter = (l: Litter) => {
      l.on = false;
      l.obj.visible = false;
      play.remove(`lit${l.id}`);
    };
    const spawnLitter = () => {
      const free = litter.filter((l) => !l.on);
      if (!free.length || litterOn().length >= 4) return;
      const kind = litRng() < 0.55 ? 'towel' : 'spill';
      const l = free.find((q) => q.kind === kind) ?? free[0];
      const s = play.state();
      const ok = spots.filter(
        ([x, z]) => Math.hypot(x - s.x, z - s.z) > 2.5 && litterOn().every((o) => Math.hypot(o.x - x, o.z - z) > 1.6),
      );
      if (!ok.length) return;
      const [x, z] = ok[Math.floor(litRng() * ok.length)];
      l.on = true;
      l.x = x;
      l.z = z;
      l.obj.position.set(x, mg.groundAt(x, z), z);
      l.obj.rotation.y = litRng() * Math.PI;
      l.obj.visible = true;
      l.top.set(x, l.obj.position.y + 0.25, z);
      litterCount++;
      const r = round;
      play.add({
        id: `lit${l.id}`,
        at: () => l.top,
        radius: 1.15,
        priority: 2,
        label: () => (l.kind === 'towel' ? '收毛巾' : '擦干净'),
        canUse: () => mg.state === 'playing' && l.on,
        onUse: (p) =>
          p.busy({
            name: 'tidy',
            dur: 0.5,
            pose: 'pickup',
            face: [l.x, l.z],
            mid: () => {
              if (!live(r) || !l.on) return;
              removeLitter(l);
              litterGot++;
              mg.addScore(LITTER_PTS, l.top, { text: `+${LITTER_PTS}`, color: 'green' });
            },
          }),
      });
    };

    // ── 水里的人 ──
    type Mode = 'lap' | 'play' | 'struggle' | 'tow' | 'rest' | 'off';
    interface Inc {
      t0: number;
      total: number;
      bang: boolean;
      saved: boolean;
      unmark: (() => void) | null;
      ring: THREE.Mesh | null;
      head: THREE.Vector3;
      nextSplash: number;
      id: number;
    }
    interface Sw {
      id: number;
      rig: SwimRig;
      kid: boolean;
      /** 原本是游一趟趟的还是玩水的 */
      kind: 'lap' | 'play';
      mode: Mode;
      x: number;
      z: number;
      yaw: number;
      lane: number;
      dir: 1 | -1;
      speed: number;
      ph: number;
      sink: number;
      homeX: number;
      homeZ: number;
      /** 招手 / 拍水（假警报）：到什么时候、下一次什么时候 */
      act: Stroke | null;
      actUntil: number;
      actNext: number;
      inc: Inc | null;
      restUntil: number;
      towTo: [number, number];
      inward: [number, number];
      towSpeed: number;
      float: THREE.Object3D | null;
      seed: number;
      /** 开局就在池里（场景摆的那几个）还是后来下水的 */
      base: boolean;
      x0: number;
      z0: number;
    }
    const swimmers: Sw[] = [];
    const addSwimmer = (
      obj: THREE.Object3D,
      kid: boolean,
      kind: 'lap' | 'play',
      x: number,
      z: number,
      base: boolean,
      float: THREE.Object3D | null = null,
    ) => {
      if (obj.parent !== scene) scene.add(obj);
      obj.userData.setProp?.(null);
      const id = swimmers.length;
      const sw: Sw = {
        id,
        rig: rigOf(obj, kid),
        kid,
        kind,
        mode: base ? kind : 'off',
        x,
        z,
        yaw: 0,
        lane: 0,
        dir: 1,
        speed: kid ? 0.62 : 0.85 + 0.12 * (id % 3),
        ph: id * 0.37,
        sink: kind === 'lap' ? (kid ? 0.62 : 1.12) : kid ? 0.66 : 1.0,
        homeX: x,
        homeZ: z,
        act: null,
        actUntil: 0,
        actNext: 6 + id * 3.1,
        inc: null,
        restUntil: 0,
        towTo: [x, z],
        inward: [0, 1],
        towSpeed: 1.4,
        float,
        seed: id * 1.93 + 0.7,
        base,
        x0: x,
        z0: z,
      };
      obj.visible = base;
      swimmers.push(sw);
      return sw;
    };
    // 场景摆的四个：游泳的、两个站在水里的、浅水边套着游泳圈的孩子
    const reg = (id: string) => slot(id);
    {
      const a = reg('swim-lap');
      if (a) addSwimmer(a, false, 'lap', a.position.x, a.position.z, true);
      const b = reg('swim-2');
      if (b) addSwimmer(b, false, 'lap', b.position.x, b.position.z, true);
      const c = reg('swim-parent');
      if (c) addSwimmer(c, false, 'play', c.position.x, c.position.z, true);
      const k = reg('swim-kid');
      if (k) addSwimmer(k, true, 'play', k.position.x, k.position.z, true, reg('float-ring'));
    }
    // 后来下水的（从浅水台阶下去）：clubsite/people 建
    const extra: [boolean, number, 'lap' | 'play'][] = [
      [false, 2, 'lap'],
      [true, 0, 'play'],
      [false, 1, 'lap'],
      [false, 3, 'lap'],
      [true, 2, 'lap'],
    ];
    for (const [isKid, v, kind] of extra) {
      const ctxV = { ...mg.ctx, variant: v } as unknown as BaseCtx;
      const o = isKid ? buildKid(ctxV) : buildPlayer(ctxV);
      o.name = `lifeguard:swimmer-${swimmers.length}`;
      addSwimmer(o, isKid, kind, POOL.x1 - 0.8, 8, false);
    }
    const flamingo = slot('float-flamingo');
    const flamingoD = { x: flamingo?.position.x ?? -53, z: flamingo?.position.z ?? 10, vx: 0, vz: 0 };

    const setLap = (sw: Sw, x: number, z: number) => {
      sw.mode = sw.kind;
      sw.x = x;
      sw.z = z;
      if (sw.kind === 'lap') {
        let best = 0;
        for (let i = 1; i < LANES.length; i++) if (Math.abs(LANES[i] - z) < Math.abs(LANES[best] - z)) best = i;
        sw.lane = LANES[best];
      } else {
        sw.homeX = THREE.MathUtils.clamp(x, SHALLOW.x0, SHALLOW.x1);
        sw.homeZ = THREE.MathUtils.clamp(z, SHALLOW.z0, SHALLOW.z1);
      }
      sw.rig.obj.userData.setSeat?.(null);
      sw.rig.obj.rotation.x = 0;
    };

    const hp = v3();
    /** 这一步摆人：位置、朝向、姿势 */
    const poseSwimmer = (sw: Sw, dt: number, t: number) => {
      const o = sw.rig.obj;
      if (sw.mode === 'off') {
        o.visible = false;
        return;
      }
      o.visible = true;
      let y = WATER - sw.sink;
      if (sw.mode === 'lap') {
        // 一趟趟游：沿泳道，到头掉头；慢慢靠到自己的泳道上
        sw.x += sw.dir * sw.speed * dt;
        sw.z += (sw.lane - sw.z) * Math.min(1, dt * 0.8);
        if (sw.x > LAP_X1) sw.dir = -1;
        if (sw.x < LAP_X0) sw.dir = 1;
        const want = sw.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        sw.yaw += (want - sw.yaw) * Math.min(1, dt * 3);
        sw.ph += dt / (sw.kid ? 1.0 : 1.25);
        y += 0.04 * Math.sin(sw.ph * Math.PI * 4);
        swimPose(sw.rig, 'crawl', sw.ph, t);
        o.rotation.x = 0;
        // 手插进水里：一小点水花
        const k = sw.ph % 0.5;
        if (k < dt / 1.25 + 1e-6 && o.visible) {
          fist(sw.rig, Math.floor(sw.ph * 2) % 2 ? 'L' : 'R', hp);
          fx.emit(hp.x + Math.sin(sw.yaw) * 0.2, WATER + 0.02, hp.z + Math.cos(sw.yaw) * 0.2, 2, 0.5, 1.4, 0.06);
        }
      } else if (sw.mode === 'play') {
        // 浅水那头：慢慢晃、踩水；偶尔招手 / 拍水（假警报，节奏匀的）
        sw.ph += dt / 2.2;
        const tx = sw.homeX + 0.5 * Math.sin(t * 0.21 + sw.seed);
        const tz = sw.homeZ + 0.4 * Math.sin(t * 0.17 + sw.seed * 2);
        sw.x += (tx - sw.x) * Math.min(1, dt * 0.5);
        sw.z += (tz - sw.z) * Math.min(1, dt * 0.5);
        sw.yaw = Math.atan2(-50 - sw.x, 8 - sw.z) + 0.6 * Math.sin(t * 0.13 + sw.seed);
        y += 0.05 * Math.sin(sw.ph * Math.PI * 2);
        let stroke: Stroke = 'tread';
        if (sw.act && t < sw.actUntil) stroke = sw.act;
        else sw.act = null;
        const ph = stroke === 'wave' ? (t * 1.6) % 1 : stroke === 'splash' ? (t * 2.2) % 1 : sw.ph;
        swimPose(sw.rig, stroke, ph, t);
        if (stroke === 'splash' && Math.floor(t * 4.4) !== Math.floor((t - dt) * 4.4)) {
          headTop(sw.rig, hp, 0);
          fx.emit(hp.x + Math.sin(sw.yaw) * 0.4, WATER + 0.02, hp.z + Math.cos(sw.yaw) * 0.4, 3, 0.7, 1.8, 0.07);
        }
        o.rotation.x = 0;
      } else if (sw.mode === 'struggle' && sw.inc) {
        const inc = sw.inc;
        const since = mg.t - inc.t0;
        // 扑腾得越来越厉害（TELL 前是"轻的"：手举得没那么高，水花小）
        const amp = Math.min(1, 0.45 + 0.55 * (since / (TELL * 1.6)));
        y += (sw.kid ? 0.15 : 0.32) * amp - struggleDip(t, sw.seed, amp);
        sw.yaw += Math.sin(t * 1.7 + sw.seed) * dt * 0.8;
        swimPose(sw.rig, 'struggle', 0, t, amp, sw.seed);
        o.rotation.x = 0;
        // 不匀的水花 + 涟漪
        if (mg.t >= inc.nextSplash) {
          headTop(sw.rig, hp, 0);
          const big = since > TELL;
          fx.emit(hp.x, WATER + 0.03, hp.z, big ? 5 : 3, big ? 1.1 : 0.8, big ? 2.6 : 2.0, big ? 0.09 : 0.07);
          fx.ripple(hp.x, hp.z, 0.25, big ? 1.1 : 0.8, 0.9, big ? 0.8 : 0.55);
          inc.nextSplash = mg.t + 0.12 + fxRng() * (big ? 0.45 : 0.6);
        }
      } else if (sw.mode === 'tow') {
        // 抱着救生圈被拉向池边（没救到的：旁边的人拖过去，慢一点）
        const dx = sw.towTo[0] - sw.x;
        const dz = sw.towTo[1] - sw.z;
        const d = Math.hypot(dx, dz);
        const step = sw.towSpeed * dt;
        if (d <= step) {
          sw.x = sw.towTo[0];
          sw.z = sw.towTo[1];
          // 坐上池沿歇一会儿
          sw.mode = 'rest';
          sw.restUntil = mg.t + (sw.inc?.saved ? 5 : 7);
          if (sw.inc?.saved) buoyHome(sw);
          sw.inc = null;
          const [ix, iz] = sw.inward;
          sw.x -= ix * 0.45;
          sw.z -= iz * 0.45;
          sw.yaw = Math.atan2(ix, iz);
        } else {
          sw.x += (dx / d) * step;
          sw.z += (dz / d) * step;
          sw.yaw = Math.atan2(-dx, -dz);
        }
        swimPose(sw.rig, 'tread', t * 0.8, t);
        y += 0.15;
      }
      if (sw.mode === 'rest') {
        // 坐在池沿上（同场景的 edge-sit：座 = 压顶，脚在水里）
        o.userData.setSeat?.(H.coping - WATER, -0.45);
        o.userData.pose?.('sit', (((t / 3.2) % 1) + 1) % 1);
        y = WATER;
        if (mg.t >= sw.restUntil) {
          // 歇够了：下水接着游
          o.userData.setSeat?.(null);
          const [ix, iz] = sw.inward;
          setLap(sw, sw.x + ix * 1.0, sw.z + iz * 1.0);
          sw.dir = sw.x < -50 ? 1 : -1;
        }
      }
      o.position.set(sw.x, y, sw.z);
      o.rotation.y = sw.yaw;
      if (sw.float) {
        sw.float.visible = sw.mode !== 'rest';
        sw.float.position.set(sw.x, WATER, sw.z);
      }
    };

    // ── 救生圈 ──
    interface Buoy {
      obj: THREE.Object3D;
      sw: Sw | null;
      t0: number;
      from: THREE.Vector3;
      phase: 'fly' | 'tow' | 'off';
    }
    const buoys: Buoy[] = Array.from({ length: 3 }, () => {
      const obj = makeBuoy();
      obj.visible = false;
      scene.add(obj);
      return { obj, sw: null, t0: 0, from: v3(), phase: 'off' as const };
    });
    const buoyHome = (sw: Sw) => {
      for (const b of buoys) if (b.sw === sw) b.phase = 'off';
    };
    mg.onStep(() => {
      for (const b of buoys) {
        if (b.phase === 'off' || !b.sw) {
          b.obj.visible = false;
          continue;
        }
        b.obj.visible = true;
        const sw = b.sw;
        if (b.phase === 'fly') {
          const k = Math.min(1, (mg.t - b.t0) / 0.45);
          b.obj.position.lerpVectors(b.from, hp.set(sw.x, WATER + 0.05, sw.z), k);
          b.obj.position.y += 1.6 * k * (1 - k);
          b.obj.rotation.set(k * 6, 0, k * 3);
          if (k >= 1) b.phase = 'tow';
        } else {
          b.obj.rotation.set(0, 0, 0);
          b.obj.position.set(sw.x, WATER + 0.06, sw.z);
        }
      }
    });

    // ── 呛水 ──
    let lives = LIVES;
    let saves = 0;
    let saveScore = 0;
    let missed = 0;
    let fastest: number | null = null;
    let incN = 0;
    let firstSaid = false;
    const incidents = (): Sw[] => swimmers.filter((s) => s.mode === 'struggle' && s.inc && !s.inc.saved);
    const head3 = (sw: Sw, out: THREE.Vector3) => headTop(sw.rig, out, 0.1);
    const standFor = (sw: Sw): [number, number] => {
      const e = edgePoint(sw.x, sw.z, POOL, 0.62);
      const [x, z] = e.at;
      if (play.nav.standAt(x, z) !== null) return [x, z];
      // 站位被高椅、梯子挡着：沿池边往两边找
      for (let d = 0.4; d <= 3.2; d += 0.4)
        for (const sgn of [1, -1]) {
          const px = e.inward[0] === 0 ? x + sgn * d : x;
          const pz = e.inward[0] === 0 ? z : z + sgn * d;
          if (play.nav.standAt(px, pz) !== null) return [px, pz];
        }
      return play.nav.nearestFree(x, z, 3) ?? [x, z];
    };
    // 歇着的人头扭过来看（救起来那一下：鼓掌）
    const cheerIds = ['sun-1', 'sun-2', 'sun-3', 'sun-4', 'sun-w1', 'sun-w2', 'cabana-w-sit', 'edge-sit'];
    const cheerers = cheerIds
      .map((id) => ({ o: slot(id), s: SLOTS.find((q) => q.id === id) }))
      .filter((c): c is { o: THREE.Object3D; s: (typeof SLOTS)[number] } => !!c.o && !!c.s);
    let cheerUntil = -1;
    const cheer = (at: THREE.Vector3) => {
      cheerUntil = mg.t + 1.8;
      for (const c of cheerers) {
        c.o.userData.pose?.('clap');
        c.o.userData.lookAt?.(at);
      }
    };
    const calm = () => {
      cheerUntil = -1;
      for (const c of cheerers) {
        if (c.s.pose) c.o.userData.pose?.(c.s.pose[0], c.s.pose[1]);
        c.o.userData.lookAt?.(c.s.look ? new THREE.Vector3(...c.s.look) : null);
      }
    };
    mg.onStep(() => {
      if (cheerUntil > 0 && mg.t > cheerUntil) calm();
    });

    const endInc = (sw: Sw) => {
      const inc = sw.inc;
      if (!inc) return;
      inc.unmark?.();
      inc.unmark = null;
      inc.ring?.removeFromParent();
      inc.ring = null;
      play.remove(`save${sw.id}`);
    };
    const towToEdge = (sw: Sw, speed: number) => {
      const e = edgePoint(sw.x, sw.z, POOL, -0.45);
      sw.towTo = e.at;
      sw.inward = e.inward;
      sw.towSpeed = speed;
      sw.mode = 'tow';
    };

    const startIncident = (sw: Sw) => {
      const L = level(mg.elapsed);
      const r = round;
      incN++;
      const inc: Inc = {
        t0: mg.t,
        total: L.struggle,
        bang: false,
        saved: false,
        unmark: null,
        ring: null,
        head: v3(),
        nextSplash: mg.t + 0.2,
        id: incN,
      };
      sw.inc = inc;
      sw.mode = 'struggle';
      sw.act = null;
      const it: Interactable = {
        id: `save${sw.id}`,
        at: () => head3(sw, inc.head),
        radius: edgeDist(sw.x, sw.z, POOL) + THROW_EXTRA,
        priority: 5,
        noMark: true,
        stand: () => standFor(sw),
        label: '救人',
        // 够不够得着看 radius（他离池边的距离 + 扔得出去的那截，每步更新）；canUse 不卡距离：远远点他 = 走到最近的池边再扔
        canUse: () => mg.state === 'playing' && sw.inc === inc && !inc.saved,
        onUse: (p) => {
          if (!live(r) || inc.saved) return;
          const since = mg.t - inc.t0;
          inc.saved = true;
          const pts = savePoints(since, inc.total);
          const word = saveWord(since, inc.total);
          endInc(sw);
          p.busy({
            name: 'throw',
            dur: 0.7,
            pose: 'serve',
            face: [sw.x, sw.z],
            mid: () => {
              if (r !== round) return;
              const b = buoys.find((q) => q.phase === 'off') ?? buoys[0];
              b.sw = sw;
              b.phase = 'fly';
              b.t0 = mg.t;
              b.from.copy(D.position).setY(D.position.y + 1.6);
            },
          });
          saves++;
          saveScore += pts;
          fastest = fastest === null ? since : Math.min(fastest, since);
          const at = head3(sw, v3()).setY(WATER + 1.4);
          mg.addScore(pts, at, { text: `+${pts} ${word}`, color: 'green', big: true });
          mg.toast(`救起来了！${word}`, 1.4);
          cheer(at);
          // 救生圈落水以后拉向池边（总监站的那边）
          const r2 = round;
          sw.towSpeed = 1.5;
          const e = edgePoint(sw.x, sw.z, POOL, -0.45);
          sw.towTo = e.at;
          sw.inward = e.inward;
          pendingTow.push({ sw, at: mg.t + 0.75, r: r2 });
        },
      };
      play.add(it);
      incItems.set(sw.id, it);
    };
    const incItems = new Map<number, Interactable>();
    const pendingTow: { sw: Sw; at: number; r: number }[] = [];

    /** 每步：标记、倒计时圈、救起来以后的拖、没看住 */
    const stepIncidents = () => {
      for (let i = pendingTow.length - 1; i >= 0; i--) {
        const q = pendingTow[i];
        if (q.r !== round) {
          pendingTow.splice(i, 1);
          continue;
        }
        if (mg.t >= q.at) {
          pendingTow.splice(i, 1);
          if (q.sw.mode === 'struggle') q.sw.mode = 'tow';
        }
      }
      for (const sw of swimmers) {
        const inc = sw.inc;
        if (!inc || sw.mode !== 'struggle' || inc.saved) continue;
        const it = incItems.get(sw.id);
        if (it) it.radius = edgeDist(sw.x, sw.z, POOL) + THROW_EXTRA;
        const since = mg.t - inc.t0;
        if (!inc.bang && since >= TELL) {
          inc.bang = true;
          inc.unmark = mg.marker(
            `inc${inc.id}`,
            () =>
              head3(sw, inc.head)
                .clone()
                .setY(inc.head.y + 0.25),
            {
              label: '!',
              color: '#ff5040',
            },
          );
          inc.ring = mg.ring(sw.x, sw.z, 1, 0xff5040);
          inc.ring.position.y = WATER + 0.03;
          if (!firstSaid) {
            firstSaid = true;
            mg.toast('有人呛水！快去最近的池边「救人」', 2.4);
          } else mg.toast('又有人呛水！', 1.2);
        }
        if (inc.ring) {
          const left = Math.max(0, 1 - since / inc.total);
          inc.ring.position.set(sw.x, WATER + 0.03, sw.z);
          inc.ring.scale.setScalar(0.45 + 0.95 * left);
          (inc.ring.material as THREE.MeshBasicMaterial).color.setHex(
            left > 0.5 ? 0xffd23c : left > 0.25 ? 0xff9a3c : 0xff4030,
          );
        }
        if (since >= inc.total) {
          // 没看住：旁边的人把他拖上岸
          endInc(sw);
          sw.inc = null;
          missed++;
          lives--;
          mg.setLives(lives, LIVES);
          const at = head3(sw, v3()).setY(WATER + 1.3);
          mg.pop(at, '没看住！', { color: 'red', big: true });
          sw.mode = 'struggle';
          towToEdge(sw, 0.9);
          if (lives <= 0) {
            mg.finish('三个都没看住……');
            return;
          }
          mg.toast(`−1 ♥ 没看住，旁边的人把他拖上了岸`, 2.0);
        }
      }
    };

    const pickVictim = (rng: () => number): Sw | null => {
      const ok = swimmers.filter((s) => (s.mode === 'lap' || s.mode === 'play') && !s.float && s.rig.obj.visible);
      if (!ok.length) return null;
      // 深水那头（西）的、一趟趟游的多一点
      const w = ok.map((s) => (s.kind === 'lap' ? 2 : 1) * (s.x < -50 ? 1.6 : 1));
      let r = rng() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < ok.length; i++) {
        r -= w[i];
        if (r <= 0) return ok[i];
      }
      return ok[ok.length - 1];
    };

    // ── 乱跑的孩子 ──
    interface Kid {
      id: number;
      obj: THREE.Object3D;
      mode: 'run' | 'stop' | 'slip' | 'leave' | 'off';
      s: number;
      dir: 1 | -1;
      speed: number;
      runT: number;
      until: number;
      ph: number;
      head: THREE.Vector3;
      x: number;
      z: number;
    }
    const kids: Kid[] = [0, 1, 2].map((v) => {
      const obj = buildKid({ ...mg.ctx, variant: v } as unknown as BaseCtx);
      obj.name = `lifeguard:kid-${v}`;
      obj.visible = false;
      obj.userData.setProp?.(null);
      scene.add(obj);
      return {
        id: v,
        obj,
        mode: 'off' as const,
        s: 0,
        dir: 1 as const,
        speed: 3,
        runT: 0,
        until: 0,
        ph: 0,
        head: v3(),
        x: 0,
        z: 0,
      };
    });
    let whistles = 0;
    let slips = 0;
    let kidRng = mg.rng('kids:1');
    const kidHead = (k: Kid) => k.head.set(k.x, k.obj.position.y + 1.5, k.z);
    const whistle = (k: Kid) => {
      if (k.mode !== 'run' || mg.state !== 'playing') return;
      k.mode = 'stop';
      k.until = mg.t + 1.1;
      whistles++;
      play.remove(`kid${k.id}`);
      // 飘字往画面中间挪一点（孩子常在池子东西两头，贴着画面边）
      const at = kidHead(k).clone();
      at.x += (-50 - at.x) * 0.25;
      mg.addScore(WHISTLE_PTS, at, { text: `+${WHISTLE_PTS} 别跑！`, color: 'cream' });
      play.say(D, '嘟——！', 0.9);
      play.say(k.obj, '对不起！', 1.2, 1.55);
      fx.ripple(D.position.x, D.position.z, 0.3, 1.4, 0.5, 0.6);
    };
    const spawnKid = () => {
      const k = kids.find((q) => q.mode === 'off');
      if (!k || kids.filter((q) => q.mode === 'run').length >= 2) return;
      // 从浅水台阶边爬上来，或者从北门跑进来
      k.s = kidRng() < 0.6 ? KID_HOME : RIM.nearest(-47.6, POOL.z0 - 0.4);
      k.dir = kidRng() < 0.5 ? 1 : -1;
      k.mode = 'run';
      k.runT = 0;
      k.speed = 2.7 + kidRng() * 0.6;
      k.obj.visible = true;
      k.obj.userData.setSeat?.(null);
      k.obj.rotation.x = 0;
      const r = round;
      play.add({
        id: `kid${k.id}`,
        at: () => kidHead(k),
        radius: 6,
        priority: 3,
        noMark: true,
        label: '吹哨',
        canUse: () => mg.state === 'playing' && k.mode === 'run',
        onUse: () => {
          if (live(r)) whistle(k);
        },
      });
    };
    const slip = (k: Kid, why: string) => {
      k.mode = 'slip';
      k.until = mg.t + 1.6;
      slips++;
      play.remove(`kid${k.id}`);
      const at = kidHead(k).clone();
      at.x += (-50 - at.x) * 0.25;
      mg.addScore(-SLIP_PENALTY, at, { text: `−${SLIP_PENALTY} 滑倒了`, color: 'red', big: true });
      play.say(k.obj, '哇——！', 1.5, 1.2);
      mg.toast(why, 1.6);
    };
    const stepKids = (dt: number, playing: boolean) => {
      const L = level(mg.elapsed);
      for (const k of kids) {
        if (k.mode === 'off') {
          k.obj.visible = false;
          continue;
        }
        const o = k.obj;
        let y = mg.groundAt(k.x, k.z);
        if (k.mode === 'run' || k.mode === 'leave') {
          const sp = k.mode === 'run' ? k.speed : 1.2;
          k.s += k.dir * sp * dt;
          if (k.mode === 'run') k.runT += dt;
          const p = RIM.at(k.s);
          k.x = p.x;
          k.z = p.z;
          o.rotation.y = Math.atan2(p.dx * k.dir, p.dz * k.dir);
          k.ph = (k.ph + (sp * dt) / (k.mode === 'run' ? 1.25 : 0.8)) % 1;
          o.userData.pose?.('walk', k.ph);
          if (k.mode === 'run') {
            y += Math.abs(Math.sin(k.ph * Math.PI * 2)) * 0.07;
            if (playing) {
              const wet = litterOn().find((l) => Math.hypot(l.x - k.x, l.z - k.z) < 0.55);
              if (wet) slip(k, wet.kind === 'towel' ? '孩子踩着毛巾滑倒了！' : '孩子踩到洒的饮料滑倒了！');
              else if (k.runT > L.slipAfter) slip(k, '孩子在池边跑，滑倒了！');
            }
          } else {
            // 走回浅水台阶，下水（藏起来）
            const d = loopMod(k.s - KID_HOME);
            if (Math.min(d, RIM.len - d) < 0.6 || mg.t > k.until) {
              k.mode = 'off';
              o.visible = false;
            }
          }
        } else if (k.mode === 'stop') {
          o.userData.pose?.('idle', (((mg.t / 3) % 1) + 1) % 1);
          o.rotation.y = Math.atan2(D.position.x - k.x, D.position.z - k.z);
          if (mg.t > k.until) leave(k);
        } else if (k.mode === 'slip') {
          o.userData.setSeat?.(0.12, 0);
          o.userData.pose?.('sit', 0.2);
          if (mg.t > k.until) {
            o.userData.setSeat?.(null);
            leave(k);
          }
        }
        o.position.set(k.x, y, k.z);
      }
    };
    const leave = (k: Kid) => {
      k.mode = 'leave';
      k.until = mg.t + 14;
      // 走最近的那个方向回浅水台阶
      const fwd = loopMod(KID_HOME - k.s);
      k.dir = fwd < RIM.len / 2 ? 1 : -1;
    };

    // 点乱跑的孩子 = 远远吹哨（不用走过去）：在画面上点到孩子身上 44 像素以内，先于摇杆 / 点地面接住
    const canvas = mg.pipe.renderer.domElement;
    const kp = v3();
    addEventListener(
      'pointerdown',
      (e) => {
        if (e.target !== canvas || mg.state !== 'playing') return;
        let best: Kid | null = null;
        let bd = 44;
        for (const k of kids) {
          if (k.mode !== 'run') continue;
          for (const dy of [0.5, 1.1]) {
            const p = mg.project(kp.set(k.x, k.obj.position.y + dy, k.z));
            const d = Math.hypot(p.x - e.clientX, p.y - e.clientY);
            if (d < bd) {
              bd = d;
              best = k;
            }
          }
        }
        if (best) {
          e.stopPropagation();
          e.preventDefault();
          whistle(best);
        }
      },
      { capture: true },
    );

    // ── 每步都跑的：水里的人、浮床、孩子 ──
    mg.onStep((dt, t) => {
      for (const sw of swimmers) poseSwimmer(sw, dt, t);
      if (flamingo) {
        const w = wind();
        drift(flamingoD, { x: w.x * 0.5, z: w.z * 0.5 }, dt, POOL, 1.0, 0.3);
        flamingo.position.x = flamingoD.x;
        flamingo.position.z = flamingoD.z;
        flamingo.rotation.y += Math.sin(t * 0.3) * dt * 0.1;
      }
      stepKids(dt, mg.state === 'playing');
    });

    // ── 节奏 ──
    let nextInc = FIRST_INCIDENT;
    let nextLeaf = 2;
    let nextLitter = 8;
    let nextKid = 12;
    let incRng = mg.rng('inc:1');
    let leavesGot = 0;
    let tipSaid = false;

    const showStats = () => {
      const n = leafCount();
      mg.stat('leaf', '水面叶子', n, n >= 8 ? 'warn' : null);
    };

    const resetAll = () => {
      round++;
      lives = LIVES;
      saves = 0;
      saveScore = 0;
      missed = 0;
      fastest = null;
      whistles = 0;
      slips = 0;
      litterGot = 0;
      litterCount = 0;
      leavesGot = 0;
      firstSaid = false;
      tipSaid = false;
      skimming = false;
      pendingTow.length = 0;
      nextInc = FIRST_INCIDENT;
      nextLeaf = 2;
      nextLitter = 8;
      nextKid = 12;
      incRng = mg.rng(`inc:${mg.round}`);
      kidRng = mg.rng(`kids:${mg.round}`);
      litRng = mg.rng(`litter:${mg.round}`);
      lr = leafRng();
      windPhase = mg.rng(`wind:${mg.round}`)() * Math.PI * 2;
      fx.clear();
      calm();
      for (const sw of swimmers) {
        endInc(sw);
        sw.inc = null;
        sw.act = null;
        sw.actNext = 5 + sw.id * 3.1;
        sw.rig.obj.userData.setSeat?.(null);
        if (sw.base) {
          setLap(sw, sw.x0, sw.z0);
          sw.dir = sw.id % 2 ? 1 : -1;
        } else sw.mode = 'off';
      }
      incItems.clear();
      for (const b of buoys) b.phase = 'off';
      for (const l of leaves) {
        l.on = false;
        l.obj.visible = false;
      }
      for (let i = 0; i < 4; i++) spawnLeaf(true);
      for (const l of litter) removeLitter(l);
      for (const k of kids) {
        k.mode = 'off';
        k.obj.visible = false;
        play.remove(`kid${k.id}`);
      }
      if (play.held() !== netItem) play.give(netItem);
      mg.setLives(lives, LIVES);
      showStats();
    };

    return {
      reset() {
        resetAll();
      },
      start() {
        play.say(D, '换我来盯着！', 1.8);
      },
      step() {
        const el = mg.elapsed;
        const L = level(el);
        const t = mg.t;
        // 池里的人越来越多：从浅水台阶下水
        const inWater = swimmers.filter((s) => s.mode !== 'off').length;
        if (inWater < L.swimmers) {
          const s = swimmers.find((q) => q.mode === 'off');
          if (s) {
            setLap(s, POOL.x1 - 0.9, 7 + (s.id % 3));
            s.dir = -1;
            s.rig.obj.visible = true;
          }
        }
        // 假警报：玩水的人偶尔招手 / 拍水
        for (const s of swimmers) {
          if (s.mode !== 'play' || s.act || t < s.actNext) continue;
          s.act = incRng() < 0.5 ? 'wave' : 'splash';
          s.actUntil = t + 1.6 + incRng();
          s.actNext = t + 7 + incRng() * 8;
        }
        // 出事
        if (el >= nextInc) {
          if (incidents().length < L.maxActive) {
            const v = pickVictim(incRng);
            if (v) startIncident(v);
            nextInc = el + nextGap(el, incRng());
          } else nextInc = el + 1.5;
        }
        stepIncidents();
        if (mg.state !== 'playing') return;
        // 叶子、地上的东西、孩子
        if (el >= nextLeaf) {
          if (leafCount() < 12) spawnLeaf();
          nextLeaf = el + L.leafEvery * (0.7 + 0.6 * lr());
        }
        if (el >= nextLitter) {
          spawnLitter();
          nextLitter = el + L.litterEvery * (0.7 + 0.6 * litRng());
        }
        if (el >= nextKid) {
          spawnKid();
          nextKid = el + L.kidEvery * (0.7 + 0.6 * kidRng());
        }
        // 捞叶子：按住"捞叶子"、人在池边，网够得着的叶子收进网兜
        const s = play.state();
        const atRim = distToRect(s.x, s.z, POOL) <= RIM_NEAR;
        if (skimming && s.holding === 'net' && !s.busy) {
          if (atRim) {
            for (const l of leaves) {
              if (!l.on || l.got >= 0 || l.fall < 1) continue;
              if (Math.hypot(l.x - s.x, l.z - s.z) > NET_REACH) continue;
              l.got = 0;
              l.from.copy(l.obj.position);
              leavesGot++;
              mg.addScore(LEAF_PTS, l.obj.position.clone().setY(WATER + 0.5), { text: `+${LEAF_PTS}` });
            }
          } else if (!tipSaid) {
            tipSaid = true;
            mg.toast('走到池边再捞', 1.4);
          }
        }
        showStats();
      },
      finish() {
        for (const sw of swimmers) endInc(sw);
        return settle({
          saves,
          saveScore,
          missed,
          fastest,
          leaves: leavesGot,
          litter: litterGot,
          whistles,
          slips,
          lives,
          leavesLeft: leafCount(),
          litterLeft: litterOn().length,
        });
      },
      debug: () => ({
        sh: +swimmers[0].rig.shR.y.toFixed(2),
        lives,
        saves,
        missed,
        whistles,
        slips,
        leavesGot,
        litterGot,
        litterSpawned: litterCount,
        swimmers: swimmers.filter((q) => q.mode !== 'off').length,
        incidents: incidents().map((sw) => {
          const inc = sw.inc as Inc;
          const st = standFor(sw);
          return {
            id: sw.id,
            x: +sw.x.toFixed(2),
            z: +sw.z.toFixed(2),
            since: +(mg.t - inc.t0).toFixed(2),
            total: +inc.total.toFixed(2),
            bang: inc.bang,
            stand: st,
            reach: canReach(play.state().x, play.state().z, sw.x, sw.z, POOL),
          };
        }),
        leaves: leaves.filter((l) => l.on && l.got < 0).map((l) => [+l.x.toFixed(2), +l.z.toFixed(2)]),
        litter: litterOn().map((l) => ({ id: l.id, x: l.x, z: l.z })),
        kids: kids
          .filter((k) => k.mode === 'run')
          .map((k) => {
            const p = mg.project(kp.set(k.x, k.obj.position.y + 0.8, k.z));
            return {
              id: k.id,
              x: +k.x.toFixed(2),
              z: +k.z.toFixed(2),
              sx: Math.round(p.x),
              sy: Math.round(p.y),
              runT: k.runT,
            };
          }),
      }),
    };
  },
});
