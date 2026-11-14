// 小游戏 2 · 吹叶清场（中心球场，clubstadium）：表演赛开打前，场上落满了棕榈叶、枯叶，还有两堆风吹来的沙。
// 90 秒里拿吹叶机把叶子吹出双打线、把沙吹散；球员在西头的球员通道里热身，时间一到就走出来 —— 那时场地多干净就是主分。
// - 拖动走路，朝向 = 吹的方向（地上一块浅色扇形 = 风吹得到的范围）；按住右下「吹」吹风，点一下 = 一直吹（再点一下停）。
// - 叶子有物理：锥里的被推着走（越近越猛、锥心比锥边猛、方向和大小都抖一点），落地有摩擦，碰到看台、广告板弹回来，贴地的过不了网。
// - 叶子整片过了线（中心过线 0.3 米）才算吹走：一批一批飘 "+分"。
// - 每 15 秒一阵风（提前 2 秒：横幅 + 满屏风线 + 地上的大箭头）：把上风那边场外的叶子吹回场里，墙外的棕榈再掉一团新的；越往后越大。
// - 顶栏：场地干净度（场地切 12 × 6 格，有叶子 / 沙的格子算脏）、下一阵风的倒计时；绿箭头指着场上叶子最密的一团。
// - 结算：干净度每 1% +10；全干净 +300；中途扫干净 = 球员提前出场，剩的每秒 +10。
// 场面：场景原样（clubstadium 的 Region，日常演出关掉）。两个球员、六个球童挪到西头拱门里热身 / 候场，裁判坐在椅子上；
// 吹叶机是总监身上的那台（setProp('blower')，setBlowSweep(false) = 管口跟着朝向），气流的沙色小方块照 clubstadium/play.ts 的做法；
// 场上的两堆沙用场景的 sand-drift 资产（userData.blow / setAmount）。叶子是这里新建的小合并几何（俱乐部底表的 dryGrass / rust / palm）。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Item } from '../../clubsite/play';
import { CELL, CLOUDS, DIM, NET_POST_Z, PLAY_VIEW, PLAYERS_GATE, S, SLOTS } from '../../clubstadium/layout';
import { createStadiumRegion } from '../../clubstadium/scene';
import { mountMinigame } from '../shell';
import {
  arrowOf,
  BLOW,
  type Blob,
  backTarget,
  coverage,
  DURATION,
  densest,
  freshTargets,
  GUST_DUR,
  GUST_EVERY,
  GUST_WARN,
  gustDir,
  gustPlan,
  KINDS,
  LEAF_PTS,
  LEAVES,
  LEAVES_GUTTER,
  type Leaf,
  launchTo,
  leafAt,
  MAX_LEAVES,
  pickBack,
  pickKind,
  type Rect,
  SAND_PTS,
  STARS,
  scatterLeaves,
  settle,
  stepLeaves,
} from './rules';

/** 双打场地（白线以内） */
const COURT: Rect = { x0: S.x - DIM.L / 2, x1: S.x + DIM.L / 2, z0: S.z - DIM.DW / 2, z1: S.z + DIM.DW / 2 };
/** 叶子能到的范围：北边广告板、南看台、东看台挡住；西头敞开到球员通道外 */
const BOX: Rect = { x0: -25.5, x1: CELL.x1 - 0.25, z0: CELL.z0 + 0.25, z1: CELL.z1 - 0.25 };
const NET = { x: S.x, z0: NET_POST_Z[0], z1: NET_POST_Z[1], h: 0.95 };
/** 总监开局：南边线外（南看台脚下），朝北看着满场的叶子 */
const START: [number, number] = [-6.0, -14.0];
/** 场上的两堆沙（sand-drift v0：长条、往东拖一条尾巴） */
const DRIFTS: [number, number, number][] = [
  [-7.4, -17.6, 0.08],
  [6.0, -24.4, -0.12],
];
/** 推着吹叶机吹（按住）走多快 / 拿着走多快 */
const HOLD_SPEED = 2.7;
const RUN_SPEED = 3.4;

/** 球员、球童在拱门里候场的位置（x, z, 朝向） */
const WARM: Record<string, [number, number, number]> = {
  'player-a': [PLAYERS_GATE.x + 0.5, -21.9, Math.PI / 2],
  'player-b': [PLAYERS_GATE.x - 0.7, -20.1, Math.PI / 2],
  'kid-net-n': [-24.6, -22.4, Math.PI / 2],
  'kid-net-s': [-24.6, -21.0, Math.PI / 2],
  'kid-nw': [-24.6, -19.6, Math.PI / 2],
  'kid-ne': [-25.4, -22.4, Math.PI / 2],
  'kid-sw': [-25.4, -21.0, Math.PI / 2],
  'kid-se': [-25.4, -19.6, Math.PI / 2],
};
/** 出场：走到哪（经过网南头绕到东半场） */
const WALK_OUT: Record<string, [number, number][]> = {
  'player-a': [
    [-17.5, -21.6],
    [-12.6, -20.4],
  ],
  'player-b': [
    [-17.5, -20.0],
    [-12.0, -13.4],
    [12.0, -13.4],
    [12.6, -22.0],
  ],
};

/** 叶子的几何（米；本地 +x = 叶子的长轴）：0 干棕榈叶（叶轴 + 四对小叶），1 枯叶（菱形 + 叶柄），2 青叶片（弯的长条） */
function leafGeos(): THREE.BufferGeometry[] {
  const box = (w: number, h: number, d: number, x: number, z: number, a: number) =>
    new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().makeRotationY(a).setPosition(x, h / 2, z));
  const frond: THREE.BufferGeometry[] = [box(0.66, 0.05, 0.07, 0, 0, 0)];
  for (let i = 0; i < 4; i++) {
    const len = 0.3 - i * 0.045;
    const sx = -0.2 + i * 0.15;
    for (const s of [-1, 1]) {
      const a = s * 0.75;
      // 小叶从叶轴斜着往后伸（朝 −x）
      frond.push(box(len, 0.035, 0.075, sx - Math.cos(a) * len * 0.45, s * Math.abs(Math.sin(a)) * len * 0.5, -a));
    }
  }
  const dry = [
    box(0.22, 0.045, 0.22, 0, 0, Math.PI / 4),
    box(0.12, 0.04, 0.16, 0.12, 0, 0),
    box(0.12, 0.03, 0.04, -0.2, 0, 0),
  ];
  const green = [box(0.3, 0.04, 0.1, -0.1, 0, 0), box(0.24, 0.04, 0.09, 0.15, 0.04, -0.35)];
  return [frond, dry, green].map((parts) => {
    for (const g of parts) g.deleteAttribute('uv');
    return mergeGeometries(parts) as THREE.BufferGeometry;
  });
}

mountMinigame({
  id: 'blower',
  title: '吹叶清场',
  tag: '小游戏 2 · 中心球场',
  goal: '表演赛马上开打，场上落满了棕榈叶和沙。90 秒里把它们吹出白线！',
  howto: [
    '拖动画面走路：总监朝哪，风就往哪吹（地上的浅色扇形）',
    '按住右下「吹」；点一下 = 一直吹，再点停',
    '叶子整片吹出白线才算；沙堆对着吹一会儿就散',
    '每 15 秒一阵风会把叶子吹回来 —— 看横幅和风线',
  ],
  region: createStadiumRegion,
  clouds: CLOUDS,
  life: false,
  hour: 10,
  weather: 'clear',
  start: { start: START, yaw: Math.PI },
  // 拉近两成：叶子 8～16 像素；竖屏 14 米宽（半个场多一点，左右跟着走），上下整个场地 + 看台都在画面里
  zoom: 0.8,
  // 上下：镜头定在场地中间偏北（开局总监在南沿，lead −7.5；死区 16 米 = 在场上走动镜头上下不动）
  camera: { lead: { portrait: -7.5, landscape: -7.5 }, dead: [1.4, 16], view: PLAY_VIEW },
  // 导航裁到场地 + 西头（看台、长廊不去）
  nav: (n) => ({
    ...n,
    bounds: { x0: -26.2, x1: CELL.x1 - 0.1, z0: CELL.z0 + 0.1, z1: -10.2 },
  }),
  duration: DURATION,
  stars: STARS,
  setup(mg) {
    const { scene, play, region } = mg;
    const { objs, kit } = region;
    const D = play.director;
    const ud = D.userData;
    ud.setBlowSweep?.(false);
    const ctx = mg.ctx;

    // ── 场面：开赛前 ──
    objs.get('ball')?.removeFromParent();
    // 场景自己的西南沙堆在南边线外（不算分），和场上要吹的沙长得一样：收掉，免得误会
    const sw = objs.get('sand-sw');
    if (sw) {
      sw.userData.regrow = 0;
      sw.visible = false;
    }
    // 走道上找座位的、卖水的照旧（看台上的生活）
    const home = new Map<string, [number, number, number]>();
    for (const s of SLOTS) home.set(s.id, [s.x, s.z, s.rotY ?? 0]);
    const crowd = (objs.get('crowd')?.userData.crowd as { setMode(m: string): void } | undefined) ?? null;
    const umpire = objs.get('umpire') ?? null;

    // 候场的人：摆进拱门
    interface Walker {
      obj: THREE.Object3D;
      pts: [number, number][];
      speed: number;
      ph: number;
    }
    const walkers: Walker[] = [];
    let warmT = 0;
    const placeWarm = () => {
      walkers.length = 0;
      for (const [id, [x, z, r]] of Object.entries(WARM)) {
        const o = objs.get(id);
        if (!o) continue;
        o.position.set(x, mg.groundAt(x, z), z);
        o.rotation.y = r;
        o.userData.pose?.(id.startsWith('player') ? 'ready' : 'idle', (x * 7 + z) % 1);
      }
    };
    // 热身：A 正手、B 反手挥空拍，中间 ready 颠两下；球童 idle
    mg.onStep((dt) => {
      warmT += dt;
      if (walkers.length) {
        for (const w of walkers) {
          const p = w.obj.position;
          const tgt = w.pts[0];
          if (!tgt) continue;
          const dx = tgt[0] - p.x;
          const dz = tgt[1] - p.z;
          const d = Math.hypot(dx, dz);
          const go = Math.min(d, w.speed * dt);
          if (d > 1e-3) {
            p.x += (dx / d) * go;
            p.z += (dz / d) * go;
            w.obj.rotation.y = Math.atan2(dx, dz);
          }
          w.ph = (w.ph + (w.speed * dt) / 1.3) % 1;
          if (d < 0.05) w.pts.shift();
          if (w.pts.length) w.obj.userData.pose?.('walk', w.ph);
          else {
            w.obj.rotation.y = p.x < 0 ? Math.PI / 2 : -Math.PI / 2;
            w.obj.userData.pose?.('ready', (warmT * 0.8) % 1);
          }
        }
        return;
      }
      for (const [id, swing, off] of [
        ['player-a', 'forehand', 0],
        ['player-b', 'backhand', 1.1],
      ] as const) {
        const o = objs.get(id);
        if (!o) continue;
        const k = (warmT + off) % 2.6;
        if (k < 1.0) o.userData.pose?.(swing, k / 1.0);
        else o.userData.pose?.('ready', ((k - 1) / 0.8) % 1);
      }
      for (const id of Object.keys(WARM))
        if (id.startsWith('kid')) objs.get(id)?.userData.pose?.('idle', (warmT / 3 + id.length * 0.13) % 1);
    });
    // 总监别穿过候场的人
    play.addBlocker(() =>
      walkers.length
        ? null
        : ['player-a', 'player-b'].map((id) => {
            const p = objs.get(id)?.position ?? new THREE.Vector3(1e4, 0, 1e4);
            return { x: p.x, z: p.z, r: 0.3 };
          }),
    );
    const walkOut = () => {
      walkers.length = 0;
      for (const [id, pts] of Object.entries(WALK_OUT)) {
        const o = objs.get(id);
        if (o) walkers.push({ obj: o, pts: pts.map((p) => [...p] as [number, number]), speed: 1.8, ph: 0 });
      }
      // 球童：回各自的位置（东边的从南边线外绕过网）
      for (const id of Object.keys(WARM)) {
        if (!id.startsWith('kid')) continue;
        const o = objs.get(id);
        const h = home.get(id);
        if (!o || !h) continue;
        const pts: [number, number][] = [[-18.5, o.position.z]];
        if (h[0] > 0) pts.push([-12, -13.3], [h[0] > 5 ? 12 : -0.4, -13.3]);
        pts.push([h[0], h[1]]);
        walkers.push({ obj: o, pts, speed: 2.4, ph: 0.3 });
      }
    };

    // ── 场上的沙（sand-drift v0）──
    const drifts = DRIFTS.map(([x, z, r]) => {
      const o = kit.makeAsset('sand-drift', 0).obj;
      o.name = 'blower:sand';
      o.position.set(x, mg.groundAt(x, z), z);
      o.rotation.y = r;
      o.userData.regrow = 0;
      scene.add(o);
      return { obj: o, cleared: false };
    });
    const amountOf = (o: THREE.Object3D) => (o.userData.amount as number | undefined) ?? 0;
    const blobs = (): Blob[] =>
      drifts
        .filter((d) => amountOf(d.obj) > 0.06)
        .map((d) => {
          const foot = 0.35 + 0.65 * Math.sqrt(amountOf(d.obj));
          return { x: d.obj.position.x + 0.35 * foot, z: d.obj.position.z, rx: 1.95 * foot, rz: 0.55 * foot };
        });

    // ── 叶子：三种，各一个 InstancedMesh（每帧按种类重新填，count = 这一种的片数）──
    const geos = leafGeos();
    const mats = [
      ctx.mat('dryGrass', { edge: 0.55, convex: 0.3 }),
      ctx.mat('rust', { edge: 0.55, convex: 0.3 }),
      ctx.mat('palm', { edge: 0.55, convex: 0.3 }),
    ];
    const meshes = geos.map((g, k) => {
      const m = new THREE.InstancedMesh(g, mats[k], MAX_LEAVES);
      m.name = `blower:leaves-${k}`;
      m.frustumCulled = false;
      m.castShadow = false;
      m.count = 0;
      scene.add(m);
      return m;
    });
    let leaves: Leaf[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const lp = new THREE.Vector3();
    let rustle = 0;
    const drawLeaves = () => {
      const n = new Array(KINDS).fill(0);
      for (let i = 0; i < leaves.length; i++) {
        const L = leaves[i];
        const k = L.kind;
        // 飘着的翻；阵风时地上的也抖一抖
        const air = Math.min(1, L.y * 2);
        const wob = air * Math.sin(mg.t * 9 + i) * 0.7 + rustle * Math.sin(mg.t * 23 + i * 1.7) * 0.12;
        eul.set(wob, L.rot + rustle * Math.sin(mg.t * 17 + i) * 0.15, air * Math.cos(mg.t * 7 + i) * 0.5);
        q.setFromEuler(eul);
        lp.set(L.x, mg.groundAt(L.x, L.z) + 0.035 + L.y, L.z);
        meshes[k].setMatrixAt(n[k]++, m4.compose(lp, q, one));
      }
      meshes.forEach((m, k) => {
        m.count = n[k];
        m.instanceMatrix.needsUpdate = true;
      });
    };

    // ── 吹风的扇形（FX 层：浅色，吹的时候亮一点）──
    const fanGeo = (() => {
      const N = 18;
      const r0 = 0.35;
      const r1 = BLOW.range;
      const pos: number[] = [];
      for (let i = 0; i < N; i++) {
        const a0 = -BLOW.half + (2 * BLOW.half * i) / N;
        const a1 = -BLOW.half + (2 * BLOW.half * (i + 1)) / N;
        const p = (a: number, r: number) => [Math.sin(a) * r, 0, Math.cos(a) * r];
        pos.push(...p(a0, r0), ...p(a0, r1), ...p(a1, r1), ...p(a0, r0), ...p(a1, r1), ...p(a1, r0));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return g;
    })();
    const fanMat = new THREE.MeshBasicMaterial({
      color: 0xfff3d6,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fan = new THREE.Mesh(fanGeo, fanMat);
    fan.layers.set(ctx.layers.FX);
    fan.renderOrder = 2;
    fan.frustumCulled = false;
    scene.add(fan);

    // ── 气流：沙色小方块从管口往前喷（照 clubstadium/play.ts）──
    const JET = 64;
    const jetMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(ctx.texel * 1.2, ctx.texel * 1.2, ctx.texel * 1.2),
      ctx.mat('sandHigh', { noShadowReceive: true, bands: [-2, -1] }),
      JET,
    );
    jetMesh.layers.set(ctx.layers.FX);
    jetMesh.castShadow = false;
    jetMesh.frustumCulled = false;
    scene.add(jetMesh);
    const jet = Array.from({ length: JET }, () => ({
      on: false,
      life: 0,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
    }));
    let jetNext = 0;
    let jetAcc = 0;
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    const fxRng = mg.rng('fx');

    // ── 风线（预告和阵风：白色细条顺着风飞过画面）+ 地上的大箭头 ──
    const STREAKS = 72;
    const streakMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.8, 0.1, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }),
      STREAKS,
    );
    streakMesh.layers.set(ctx.layers.FX);
    streakMesh.frustumCulled = false;
    streakMesh.renderOrder = 3;
    scene.add(streakMesh);
    const streaks = Array.from({ length: STREAKS }, () => ({ on: false, life: 0, max: 1, p: new THREE.Vector3() }));
    let streakAcc = 0;
    const arrowGeo = (() => {
      const sh = new THREE.Shape();
      // 朝 +x 的箭头：杆 2.0 × 0.5，头 1.0 长、1.4 宽
      sh.moveTo(-1.5, -0.25);
      sh.lineTo(0.5, -0.25);
      sh.lineTo(0.5, -0.7);
      sh.lineTo(1.5, 0);
      sh.lineTo(0.5, 0.7);
      sh.lineTo(0.5, 0.25);
      sh.lineTo(-1.5, 0.25);
      sh.closePath();
      return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
    })();
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.layers.set(ctx.layers.FX);
    arrow.renderOrder = 3;
    arrow.frustumCulled = false;
    arrow.visible = false;
    scene.add(arrow);

    // ── 吹叶机（总监身上的那台：prop 'blower'）。点一下 = 一直吹（再点停），按住 = 按着的时候吹 ──
    let blowing = false;
    let latched = false;
    let restarting = false;
    let userHold = false;
    let holdT0 = 0;
    let everBlew = false;
    const blower: Item = play.addItem({
      id: 'blower',
      name: '吹叶机',
      obj: new THREE.Group(),
      prop: 'blower',
      carrySpeed: RUN_SPEED,
      droppable: false,
      use: {
        label: () => (mg.state !== 'playing' ? '' : latched ? '停' : '吹'),
        canUse: () => mg.state === 'playing',
        pose: 'blow',
        holdSpeed: HOLD_SPEED,
        onUse: () => {
          blowing = true;
          everBlew = true;
          if (restarting) {
            restarting = false;
            userHold = false;
          } else {
            userHold = true;
            holdT0 = mg.t;
          }
        },
        onHold: () => {
          blowing = true;
          return mg.state === 'playing';
        },
        onRelease: (p) => {
          blowing = false;
          // 点一下（不到 0.28 秒就松手）：锁住一直吹 —— 再按一下动作键开一次新的"按住"
          if (userHold && !latched && mg.t - holdT0 < 0.28 && mg.state === 'playing') {
            userHold = false;
            latched = true;
            restarting = true;
            p.setUse(true);
            return;
          }
          // 锁着的时候又点了一下（或者这局结束了）：停
          latched = false;
          userHold = false;
        },
      },
    });

    // ── 一局的账 ──
    let round = 0;
    let cleared = 0;
    let sandDone = 0;
    let gusts = 0;
    let nextGust = GUST_EVERY;
    let warned = false;
    let gust: { dir: { x: number; z: number; from: string }; t0: number; t1: number } | null = null;
    let clean = 0;
    let onCourt = 0;
    let milestones = new Set<number>();
    let hintSaid = false;
    let tenSaid = false;
    const batch = { n: 0, sx: 0, sz: 0, t0: 0, tl: 0 };
    let clump: THREE.Vector3 | null = null;
    let clumpAcc = 0;
    let statAcc = 0;
    let lastX = START[0];
    let lastZ = START[1];
    let physRng = mg.rng('phys:1');
    let gustRng = mg.rng('gust:1');

    const recount = () => {
      const c = coverage(leaves, COURT, blobs());
      clean = c.frac;
      onCourt = leaves.reduce((n, L) => n + (L.on ? 1 : 0), 0);
    };
    const showStats = () => {
      const pct = Math.round(clean * 100);
      mg.stat('clean', '场地', `${pct}%`, pct >= 100 ? 'good' : pct < 50 ? 'warn' : null);
      if (mg.state === 'playing') {
        const s = Math.max(0, Math.ceil(nextGust - mg.elapsed));
        const wind = gust ? '刮！' : nextGust > DURATION ? '—' : `${s} 秒`;
        mg.stat('gust', '阵风', wind, gust || s <= GUST_WARN ? 'warn' : null);
      } else mg.stat('gust', '阵风', null);
    };
    // 绿箭头：场上最密的一团（离总监 3.2 米以内就不指了：就在脚边）
    mg.marker(
      'clump',
      () => {
        if (mg.state !== 'playing' || !clump) return null;
        if (Math.hypot(clump.x - D.position.x, clump.z - D.position.z) < 3.2) return null;
        return clump;
      },
      { color: '#8fe36a', label: '叶子堆' },
    );
    const findClump = () => {
      const c = densest(leaves, 2);
      clump = c ? new THREE.Vector3(c.x, mg.groundAt(c.x, c.z) + 0.3, c.z) : null;
    };
    const flushBatch = () => {
      if (!batch.n) return;
      const pts = batch.n * LEAF_PTS;
      const at = new THREE.Vector3(batch.sx / batch.n, 0.6, batch.sz / batch.n);
      mg.addScore(pts, at, { text: batch.n >= 2 ? `+${pts} · ${batch.n} 片` : `+${pts}`, big: batch.n >= 6 });
      batch.n = 0;
      batch.sx = 0;
      batch.sz = 0;
    };

    // ── 阵风 ──
    /** 预告了、还没刮的那阵风的方向 */
    let pendingDir: { x: number; z: number; from: string } | null = null;
    const warnGust = () => {
      warned = true;
      const dir = gustDir(gustRng);
      gust = null;
      pendingDir = dir;
      mg.toast(`${dir.from}风要来了 ${arrowOf(dir.x, dir.z)}`, GUST_WARN + 0.3, true);
      play.say(D, '守住上风那条线！', GUST_WARN);
    };
    const blowGust = () => {
      const dir = pendingDir ?? gustDir(gustRng);
      pendingDir = null;
      gusts++;
      const plan = gustPlan(gusts);
      gust = { dir, t0: mg.elapsed, t1: mg.elapsed + GUST_DUR };
      // 场外上风那边的叶子吹回场里
      const back = pickBack(leaves, COURT, dir, plan.back);
      for (const i of back) {
        const L = leaves[i];
        const [tx, tz] = backTarget(L, COURT, dir, gustRng());
        launchTo(L, tx, tz, 0.05, 2.0 + gustRng() * 0.8, (gustRng() - 0.5) * 16);
      }
      // 墙外的棕榈掉一两团新的：从上风那边的半空飘进来
      const fresh = freshTargets(gustRng, COURT, dir, plan.fresh, gusts >= 3 ? 2 : 1);
      for (const [tx, tz] of fresh) {
        if (leaves.length >= MAX_LEAVES) break;
        const dist = 5 + gustRng() * 2;
        const L = leafAt(tx - dir.x * dist, tz - dir.z * dist, pickKind(gustRng()), gustRng() * 6.28, COURT);
        leaves.push(L);
        launchTo(L, tx, tz, 4.5 + gustRng() * 1.5, 0.3, (gustRng() - 0.5) * 12);
      }
      // 沙积回来一点（第二阵起）
      if (plan.sand > 0) {
        const d = drifts[gusts % drifts.length];
        const a = Math.min(1, amountOf(d.obj) + plan.sand);
        d.obj.userData.setAmount?.(a);
        if (a > 0.06) d.cleared = false;
      }
      mg.toast(`阵风！吹回 ${back.length} 片 · 棕榈又掉 ${fresh.length} 片`, 2.0, false);
      crowd?.setMode('idle');
      nextGust += GUST_EVERY;
      warned = false;
    };

    // ── 每步：气流、风线（任何状态都跑：结算卡后面风线飞完）──
    mg.onStep((dt) => {
      // 气流
      const on = blowing && mg.state === 'playing';
      if (on) {
        jetAcc += dt * 70;
        const p = (ud.nozzle?.() as THREE.Vector3 | undefined) ?? D.position.clone().setY(0.3);
        const y = D.rotation.y;
        while (jetAcc > 1) {
          jetAcc--;
          const j = jet[jetNext];
          jetNext = (jetNext + 1) % JET;
          j.on = true;
          j.life = 0;
          j.p.copy(p);
          const sp = 4 + fxRng() * 2.2;
          const a = y + (fxRng() - 0.5) * BLOW.half * 1.6;
          j.v.set(Math.sin(a) * sp, 0.2 + fxRng() * 0.7, Math.cos(a) * sp);
        }
      } else jetAcc = 0;
      jet.forEach((j, i) => {
        if (j.on) {
          j.life += dt;
          j.v.y -= 3 * dt;
          j.p.addScaledVector(j.v, dt);
          if (j.life > 0.55 || j.p.y < 0.02) j.on = false;
        }
        jetMesh.setMatrixAt(i, j.on ? m4.makeTranslation(j.p.x, j.p.y, j.p.z) : ZERO);
      });
      jetMesh.instanceMatrix.needsUpdate = true;

      // 风线：预告时稀、刮的时候密
      const dir = gust?.dir ?? pendingDir;
      const rate = mg.state !== 'playing' ? 0 : gust ? 70 : pendingDir ? 30 : 0;
      streakAcc += dt * rate;
      const cam = mg.pipe.rig.target;
      while (dir && streakAcc > 1) {
        streakAcc--;
        const s = streaks.find((x) => !x.on);
        if (!s) break;
        s.on = true;
        s.life = 0;
        s.max = 0.5 + fxRng() * 0.4;
        // 从画面上风那边进来
        s.p.set(
          cam.x + (fxRng() - 0.5) * 18 - dir.x * 6,
          0.3 + fxRng() * 2.6,
          cam.z + (fxRng() - 0.5) * 22 - dir.z * 6,
        );
      }
      if (!dir) streakAcc = 0;
      const sd = dir ?? { x: 1, z: 0 };
      const yaw = -Math.atan2(sd.z, sd.x);
      streaks.forEach((s, i) => {
        if (s.on) {
          s.life += dt;
          s.p.x += sd.x * 16 * dt;
          s.p.z += sd.z * 16 * dt;
          if (s.life > s.max) s.on = false;
        }
        if (s.on) {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          const k = Math.sin((s.life / s.max) * Math.PI);
          streakMesh.setMatrixAt(i, m4.compose(s.p, q, lp.set(0.4 + k, 1, 1)));
        } else streakMesh.setMatrixAt(i, ZERO);
      });
      streakMesh.instanceMatrix.needsUpdate = true;
    });

    // bot / 调试用：叶子和场地（只读）
    Object.assign(window, { __blower: { leaves: () => leaves, court: COURT, box: BOX, net: NET, blow: BLOW } });

    return {
      reset() {
        round++;
        physRng = mg.rng(`phys:${mg.round}`);
        gustRng = mg.rng(`gust:${mg.round}`);
        leaves = scatterLeaves(mg.rng(`leaves:${mg.round}`), COURT, BOX, LEAVES, LEAVES_GUTTER, { netX: NET.x });
        for (const d of drifts) {
          d.obj.userData.setAmount?.(1);
          d.cleared = false;
        }
        cleared = 0;
        sandDone = 0;
        gusts = 0;
        nextGust = GUST_EVERY;
        warned = false;
        gust = null;
        pendingDir = null;
        milestones = new Set();
        hintSaid = false;
        tenSaid = false;
        batch.n = 0;
        blowing = false;
        latched = false;
        restarting = false;
        userHold = false;
        everBlew = false;
        rustle = 0;
        arrow.visible = false;
        for (const j of jet) j.on = false;
        for (const s of streaks) s.on = false;
        if (play.held() !== blower) play.give(blower);
        lastX = D.position.x;
        lastZ = D.position.z;
        placeWarm();
        crowd?.setMode('idle');
        recount();
        findClump();
        showStats();
        drawLeaves();
      },
      start() {
        play.say(D, '开工！', 1.4);
      },
      step(dt) {
        const r = round;
        const el = mg.elapsed;
        // 阵风：预告 → 刮
        if (!warned && el >= nextGust - GUST_WARN && nextGust < DURATION) warnGust();
        if (warned && el >= nextGust) blowGust();
        if (gust && el >= gust.t1) gust = null;
        rustle = gust ? 1 : pendingDir ? 0.5 : Math.max(0, rustle - dt * 2);

        // 吹
        const yaw = D.rotation.y;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const ox = D.position.x + fx * 0.45;
        const oz = D.position.z + fz * 0.45;
        const blow = blowing && blower.where === 'held' ? { x: ox, z: oz, dx: fx, dz: fz, ...BLOW } : null;
        const vx = (D.position.x - lastX) / dt;
        const vz = (D.position.z - lastZ) / dt;
        lastX = D.position.x;
        lastZ = D.position.z;
        const ev = stepLeaves(leaves, dt, {
          court: COURT,
          box: BOX,
          net: NET,
          blow,
          kick: { x: D.position.x, z: D.position.z, vx, vz, r: 0.45 },
          rng: physRng,
        });
        for (const i of ev.exits) {
          const L = leaves[i];
          cleared++;
          if (!batch.n) batch.t0 = mg.t;
          batch.n++;
          batch.sx += L.x;
          batch.sz += L.z;
          batch.tl = mg.t;
        }
        if (batch.n && (mg.t - batch.tl > 0.3 || mg.t - batch.t0 > 0.9)) flushBatch();

        // 沙：对着吹就变薄
        if (blow)
          for (const d of drifts) {
            if (d.cleared) continue;
            const { f } = (() => {
              const rx = d.obj.position.x - ox;
              const rz = d.obj.position.z - oz;
              const dd = Math.hypot(rx, rz);
              if (dd > BLOW.range + 0.8) return { f: 0 };
              const cos = (rx * fx + rz * fz) / (dd || 1);
              return { f: cos > Math.cos(BLOW.half + 0.25) ? 1 - dd / (BLOW.range + 0.8) : 0 };
            })();
            if (f > 0) {
              d.obj.userData.blow?.(dt, Math.min(1.5, 0.6 + f * 1.6));
              if (amountOf(d.obj) <= 0.06) {
                d.obj.userData.setAmount?.(0);
                d.cleared = true;
                sandDone++;
                mg.addScore(SAND_PTS, d.obj.position.clone().setY(0.7), {
                  text: `沙吹散了 +${SAND_PTS}`,
                  color: 'green',
                  big: true,
                });
              }
            }
          }

        // 顶栏、箭头
        statAcc += dt;
        if (statAcc >= 0.2) {
          statAcc = 0;
          recount();
          showStats();
          const pct = Math.round(clean * 100);
          for (const m of [50, 75, 90])
            if (pct >= m && !milestones.has(m)) {
              milestones.add(m);
              // 阵风的预告、横幅别被盖掉
              if ((m > 50 || el > 3) && !pendingDir && !gust) mg.toast(`场地 ${m}% 干净了`, 1.4);
            }
        }
        clumpAcc += dt;
        if (clumpAcc >= 0.5) {
          clumpAcc = 0;
          findClump();
        }

        // 提示
        if (!hintSaid && !everBlew && el > 4) {
          hintSaid = true;
          mg.toast('按住右下「吹」吹风（点一下 = 一直吹）', 2.6);
        }
        if (!tenSaid && mg.timeLeft <= 10) {
          tenSaid = true;
          mg.toast('还有 10 秒，球员要出场了！', 2.0);
          for (const id of ['player-a', 'player-b']) play.say(objs.get(id) ?? D, '好了吗？', 1.6);
        }

        // 中途扫干净（没有正在飘的叶子、不在刮风）：球员提前出场
        if (
          r === round &&
          onCourt === 0 &&
          clean >= 1 &&
          !gust &&
          !pendingDir &&
          !leaves.some((L) => L.y > 0.02) &&
          drifts.every((d) => d.cleared)
        ) {
          flushBatch();
          mg.finish('清场！');
        }
      },
      frame() {
        drawLeaves();
        // 扇形：跟着总监的朝向，吹的时候亮
        const on = mg.state === 'playing' && blower.where === 'held';
        fan.visible = on;
        if (on) {
          const yaw = D.rotation.y;
          fan.position.set(
            D.position.x + Math.sin(yaw) * 0.45,
            mg.groundAt(D.position.x, D.position.z) + 0.05,
            D.position.z + Math.cos(yaw) * 0.45,
          );
          fan.rotation.y = yaw;
          fanMat.opacity = blowing ? 0.3 + 0.06 * Math.sin(mg.t * 20) : 0.14;
        }
        // 地上的风向箭头：在总监身边、往场地中间那侧横着让开 2.6 米（不和吹风的扇形叠在一起），指着风吹的方向，一跳一跳
        const dir = gust?.dir ?? (mg.state === 'playing' ? pendingDir : null);
        arrow.visible = !!dir;
        if (dir) {
          const k = 1 + 0.12 * Math.sin(mg.t * 10);
          let px = -dir.z;
          let pz = dir.x;
          if (px * (S.x - D.position.x) + pz * (S.z - D.position.z) < 0) {
            px = -px;
            pz = -pz;
          }
          const ax = D.position.x + px * 2.6;
          const az = D.position.z + pz * 2.6;
          arrow.position.set(ax, mg.groundAt(ax, az) + 0.06, az);
          arrow.rotation.y = -Math.atan2(dir.z, dir.x);
          arrow.scale.setScalar(k);
          arrowMat.opacity = gust ? 0.9 : 0.55 + 0.3 * Math.sin(mg.t * 12);
        }
      },
      finish(reason) {
        flushBatch();
        recount();
        showStats();
        latched = false;
        blowing = false;
        gust = null;
        pendingDir = null;
        arrow.visible = false;
        walkOut();
        crowd?.setMode(clean >= 0.9 ? 'cheer' : clean >= 0.6 ? 'clap' : 'idle');
        if (umpire)
          play.say(
            umpire,
            clean >= 1 ? '场地完美！' : clean >= 0.85 ? '可以开赛了' : clean >= 0.6 ? '还有叶子……' : '这怎么打？',
            3,
          );
        return settle({
          cleared,
          sand: sandDone,
          clean,
          gusts,
          timeLeft: reason === '清场！' ? mg.timeLeft : 0,
        });
      },
      debug: () => ({
        clean: +clean.toFixed(3),
        onCourt,
        cleared,
        sand: sandDone,
        gusts,
        nextGust,
        warned,
        gusting: !!gust,
        blowing,
        latched,
        leaves: leaves.length,
        clump: clump ? [+clump.x.toFixed(1), +clump.z.toFixed(1)] : null,
      }),
    };
  },
});
