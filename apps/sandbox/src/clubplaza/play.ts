// clubplaza 的玩法接线：导航（广场顶面减池子和道具脚印、两段台阶下到绿带和长廊、西边去看台的台阶）+ 总监的活（互动点、手里的工具）。
// 活本身（叶子跟着网圈走、扫成堆、浇水的水滴、倒桶）在 life.ts 的 job 里；这里只管"什么时候能干、按哪个键、站哪"。
//
// 工具都在保洁车上（东边那棵蒲葵的荫里）；空手在车旁按拿/放键 = 拿眼下最用得着的那件：
//   捞网（靠在车把上）  走近按 拿/放键"拿捞网" → 在池边按住动作键"捞叶子"（skim，一片 ≈ 6 秒，网兜装 3 片）
//   扫帚（插在桶后）    "拿扫帚" → 站在地上的枯叶旁按住"扫落叶"（≈ 3 秒一片）
//   浇水壶（挂在桶前）  "拿水壶" → 台阶顶的花盆旁按"浇花"（2.4 秒；土面变深，慢慢干）
//   回到车旁：拿/放键"放回车上"；动作键"倒进桶"（网兜 / 扫起来的叶子倒进落叶桶，12 片满）
//   桶快满了：空手在车旁按"推车"→ 推下东台阶到长廊东头"倒掉落叶"→ 拿/放键"放下车"（停在哪就在哪）
// 放着不管：叶子越积越多 → 长椅上的人皱眉走掉、鸟不回来（life.ts）。总监在这里干活的时候，前台那边就没人（clubdesk 的取舍）。
import * as THREE from 'three';
import { GATE_SPEC, STAIRS, WALL } from '../clubdesk/layout';
import {
  footprint,
  type Item,
  type Play,
  type Ramp,
  type Rect,
  rampFromStairs,
  type Shape,
  stairCheeks,
} from '../clubsite/play';
import type { RegionNav, RegionStart } from '../clubsite/region';
import { COURTS, GATE, GROUNDS, PATHS } from '../clubsite/world';
import { CLIP, FOUNTAIN, FOUNTAIN_SPEC, H, PICKLE, PLAZA, SLOTS, SPOTS, STADIUM_LINK } from './layout';
import type { LeafRef, PlazaLife } from './life';

/** 东墙、北墙里面的脸（墙中线 GATE.x / GROUNDS.z0、厚 WALL.t） */
const WALL_E = GATE.x - WALL.t / 2;
const WALL_N = GROUNDS.z0 + WALL.t / 2;
/** 导航网格：墙里这个场景画到的范围（CLIP：西到长廊画到的 x 10、东到东墙、北到北墙、南到 z 20） */
export const NAV_BOUNDS: Rect = { x0: CLIP.x0, x1: WALL_E, z0: WALL_N, z1: CLIP.z1 };
/**
 * 广场西沿挡土墙（x 32）外 1 米 = clubwalk 里这个区域的西沿（clubwalk/regions.ts）。再往西是中心球场、球场那边的地：
 * clubwalk 里归 clubstadium，它的导航只到 x 24、z −37.4，管不到的点会回头问别的区域的导航，这里整块能走就会替它"代答"成能走；
 * clubdesk 在 x 33.6 以西也只走地图的步道。所以那边只开步道、去看台的台阶和小路，和挡土墙以南从 x 30 起的绿带（同 887b3ba）
 */
const WEST_X = PLAZA.x0 - 1;
const STRIP_X0 = 30;

/** 围墙的壁柱（照 terrain.ts：北墙、东墙每段 floor(长/12) 等分 + 东北角，1.1 见方，比墙厚 0.4）+ 大门的两根门柱（clubdesk 的 GATE_SPEC） */
function wallPiers(): Rect[] {
  const sq = (x: number, z: number, s: number): Rect => ({
    x0: x - s / 2,
    x1: x + s / 2,
    z0: z - s / 2,
    z1: z + s / 2,
  });
  const out: Rect[] = [sq(GATE.x, GROUNDS.z0, WALL.pier)];
  const nN = Math.floor((GROUNDS.x1 - GROUNDS.x0) / 12);
  for (let i = 1; i < nN; i++) out.push(sq(GROUNDS.x0 + ((GROUNDS.x1 - GROUNDS.x0) * i) / nN, GROUNDS.z0, WALL.pier));
  for (const [a, b] of [
    [GROUNDS.z0, GATE.z0 - 0.8],
    [GATE.z1 + 0.8, GROUNDS.z1],
  ]) {
    const n = Math.floor((b - a) / 12);
    for (let i = 1; i < n; i++) out.push(sq(GATE.x, a + ((b - a) * i) / n, WALL.pier));
  }
  for (const z of GATE_SPEC.pierZ) out.push(sq(GATE.x, z, GATE_SPEC.pier));
  const B = NAV_BOUNDS;
  return out.filter((r) => r.x1 > B.x0 && r.x0 < B.x1 && r.z1 > B.z0 && r.z0 < B.z1);
}

/** 挡路的植物（树干 / 株半径，乘 slot 的缩放；只算地面上的，花盆里的龙舌兰另算） */
const PLANT_R: Record<string, number> = {
  'fan-palm': 0.45,
  'palo-verde': 0.45,
  'smoke-tree': 0.5,
  creosote: 0.6,
  brittlebush: 0.45,
  agave: 0.55,
};
/**
 * 蒲葵按变体（clubsite/nature/fan-palm.ts 的 VARIANTS）：v2 最矮、枯叶裙最长（skirt 0.78），裙摆垂到离地 0.2～0.9 米、
 * 离树根 ≈0.83～0.89 米（量的：palm-w / palm-ne / palm-gate）→ 按裙子挡（0.65 + 身体 0.28 ≈ 0.93）；v0 / v1 的裙子离地 1.5 米以上（身体那一段只有树干 ≈0.4），按树干
 */
const PALM_R = [0.45, 0.45, 0.65];
const plantR = (s: (typeof SLOTS)[number]) =>
  s.asset === 'fan-palm' ? PALM_R[(((s.variant ?? 0) % 3) + 3) % 3] : PLANT_R[s.asset];
/** 按包围盒挡路的东西（slot id） */
const BOXED = ['bench-w', 'bench-n', 'bench-prom', 'bench-link', 'drinks-cart', 'drink-fountain'];

/**
 * 摆件的脚印：摆件自己坐标系里的包围盒（四边各缩 shrink）转到世界 = 跟着 rotY 转的矩形。
 * 斜摆的长椅（bench-w 朝池心转了 ≈120°）按世界轴向外框挡会挡掉 1.4 × 1.9 米（长椅本身 1.9 × 0.6）；没转的和 footprint 一样
 */
function orientedFootprint(obj: THREE.Object3D, shrink: number): Shape | null {
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  obj.traverse((m) => {
    const g = (m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const pos = g?.getAttribute('position');
    if (!(m as THREE.Mesh).isMesh || !pos) return;
    const k = inv.clone().multiply(m.matrixWorld);
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(k));
  });
  if (box.isEmpty()) return footprint(obj, shrink);
  const { min, max } = box;
  const poly = (
    [
      [min.x + shrink, min.z + shrink],
      [max.x - shrink, min.z + shrink],
      [max.x - shrink, max.z - shrink],
      [min.x + shrink, max.z - shrink],
    ] as const
  ).map(([x, z]) => {
    const w = v.set(x, 0, z).applyMatrix4(obj.matrixWorld);
    return [w.x, w.z] as const;
  });
  return { poly };
}

/** 独立页面的开局（main.ts 的 mountPlay） */
export const PLAZA_START: RegionStart = {
  start: [SPOTS.leafCart[0] - 0.4, SPOTS.leafCart[1] - 0.6],
  yaw: -Math.PI / 2,
  // 横屏的取景范围就是白模的横屏（左边看台、右边东墙和大门）：横屏下相机不左右跑，竖屏跟着总监
  camera: { lead: { portrait: 1.4, landscape: 0.5 }, view: { x0: 15.2, x1: 72.8, z0: -58, z1: 12 } },
  hint: '拖动走路 · 点地面走过去',
};

/** 第一步：导航（life 建好之前；独立页面先 mountPlay，life 的气泡要用 play.say）。scene = 区域的根 */
export function plazaNav(scene: THREE.Object3D): RegionNav {
  const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? null;
  const blocked: Shape[] = [
    // 喷泉池（池壁外沿）
    { x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN_SPEC.basinR + 0.05 },
  ];
  for (const id of BOXED) {
    const o = slot(id);
    const r = o && orientedFootprint(o, 0.06);
    if (r) blocked.push(r);
  }
  for (const s of SLOTS) {
    const r = plantR(s);
    if (r && s.y === undefined) blocked.push({ x: s.x, z: s.z, r: r * (s.s ?? 1) });
  }
  // 四个花盆（陶罐 + 龙舌兰）
  for (const s of SLOTS) if (s.asset === 'pot') blocked.push({ x: s.x, z: s.z, r: 0.42 });
  // 墙里画到的围场：匹克球围场、网球场（围网，门都在画外或归别的场景）、
  // 中心球场连三面看台（照 terrain.ts 的体块：北 6 级 × 1.2 + 后墙 0.4、东 3 级 × 1.2、南 2 级 × 1.1）、壁柱和门柱
  blocked.push({ x0: PICKLE.x0, x1: PICKLE.x1, z0: PICKLE.z0, z1: PICKLE.z1 });
  for (const c of COURTS) {
    if (c.kind !== 'hard' && c.kind !== 'clay') continue;
    const r = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
    if (r.x1 > NAV_BOUNDS.x0 && r.x0 < NAV_BOUNDS.x1 && r.z1 > NAV_BOUNDS.z0 && r.z0 < NAV_BOUNDS.z1) blocked.push(r);
  }
  const stadium = COURTS.find((c) => c.kind === 'stadium');
  if (stadium) {
    const sx0 = NAV_BOUNDS.x0 - 1;
    const sx1 = stadium.x + stadium.hx;
    const sz0 = stadium.z - stadium.hz;
    const sz1 = stadium.z + stadium.hz;
    blocked.push(
      { x0: sx0, x1: sx1 + 2, z0: sz0 - 7.6, z1: sz0 },
      { x0: sx0, x1: sx1 + 3.6, z0: sz0, z1: sz1 },
      { x0: sx0, x1: sx1, z0: sz1, z1: sz1 + 2.2 },
    );
  }
  blocked.push(...wallPiers());

  const st = STADIUM_LINK.stairs;
  const ramps: Ramp[] = [
    ...STAIRS.slice(0, 2).map(rampFromStairs),
    { x0: st.x0, x1: st.x1, z0: st.z0, z1: st.z1, from: 0, to: 1.2, axis: 'x' },
  ];
  for (const r of ramps) blocked.push(...stairCheeks(r, H.ground));
  return {
    bounds: NAV_BOUNDS,
    walkable: [
      // 墙里画到的地面都能走：广场顶面（groundAt 1.2，四周 1.2 米的挡土墙靠高差挡住，只能走三段台阶）、
      // 墙里的沙地（广场北边、东边到东墙、西边到挡土墙外 1 米）、绿带、到达小院、西步道往南（往南出画 = clubdesk / clubpickle）
      { x0: WEST_X, x1: NAV_BOUNDS.x1, z0: NAV_BOUNDS.z0, z1: PLAZA.z1 },
      { x0: STRIP_X0, x1: NAV_BOUNDS.x1, z0: PLAZA.z1, z1: NAV_BOUNDS.z1 },
      // 再往西：地图的步道（长廊画到 x 10、两排球场之间那条）、西沿的台阶和去看台的小路（横屏左边）
      ...PATHS.map((p) => ({
        x0: Math.max(p.x0, NAV_BOUNDS.x0),
        x1: Math.min(p.x1, STRIP_X0),
        z0: Math.max(p.z0, NAV_BOUNDS.z0),
        z1: Math.min(p.z1, NAV_BOUNDS.z1),
      })).filter((p) => p.x1 - p.x0 > 0.05 && p.z1 - p.z0 > 0.05),
      { x0: STADIUM_LINK.path.x0, x1: PLAZA.x0, z0: STADIUM_LINK.path.z0, z1: STADIUM_LINK.path.z1 },
      { x0: st.x0, x1: st.x1, z0: st.z0, z1: st.z1 },
    ],
    blocked,
    ramps,
  };
}

/** 第二步：总监的活（互动点 + 工具），life 建好之后 */
export function registerPlazaJobs(play: Play, life: PlazaLife) {
  const L = life.play;
  const cart = L.cart;
  const wp = (o: THREE.Object3D, dy = 0) => o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0));
  const heldId = () => play.held()?.id ?? '';

  // 会员、孩子、家长、摊主当挡路圆；保洁车（没在推的时候）也是
  play.addBlocker(() => life.people());
  play.addBlocker(() => (heldId() === 'cart-push' ? null : { x: cart.position.x, z: cart.position.z, r: 0.62 }));

  // ── 工具：车上的三件（拿起 = 从车上；放回 = 车旁的拿/放键）──
  const net = play.addItem({ id: 'net', name: '捞网', obj: L.net, grip: L.net.userData.grip, droppable: false });
  const broom = play.addItem({
    id: 'broom',
    name: '扫帚',
    obj: L.tools.broom,
    grip: L.tools.broom.userData.grip,
    droppable: false,
  });
  const can = play.addItem({
    id: 'can',
    name: '浇水壶',
    obj: L.tools.can,
    grip: L.tools.can.userData.grip,
    droppable: false,
  });
  // 推车：手里"拿着"一个看不见的推把（push 姿势、走慢一点）；车本身由 life.post 摆到总监身前
  const handle = new THREE.Group();
  handle.name = 'cart-handle';
  const push = play.addItem({
    id: 'cart-push',
    name: '保洁车',
    obj: handle,
    grip: { at: [0, 0, 0], axis: [0, 0, 1], up: [0, 1, 0] },
    carryPose: 'push',
    carrySpeed: 1.9,
  });
  push.stow(cart);
  const tools: Record<string, Item> = { net, broom, can };
  const onCart = (it: Item) => it.where === 'away';

  /** 空手在车旁：拿眼下最用得着的那件（水里有叶子 → 捞网；地上有 → 扫帚；有干的花盆 → 浇水壶） */
  const needed = (): Item | null => {
    const want: Item[] = [];
    if (L.leaves('water').length) want.push(net);
    if (L.leaves('tile').length) want.push(broom);
    if (L.pots().some((p) => p.wet < 0.4)) want.push(can);
    want.push(net, broom, can);
    return want.find(onCart) ?? null;
  };
  // 车旁：放回工具（拿/放键）、倒进桶 / 推车（动作键）
  play.add({
    id: 'leaf-cart',
    at: () => wp(cart, 1.0),
    radius: 1.7,
    priority: 1,
    pickLabel: () => {
      const it = needed();
      return it ? `拿${it.id === 'can' ? '水壶' : it.spec.name}` : '';
    },
    canPickUp: (s) => !s.held && !!needed(),
    onPickUp: (p) => {
      const it = needed();
      if (it) p.give(it);
    },
    stand: () => [
      cart.position.x - Math.sin(cart.rotation.y) * 0.95,
      cart.position.z - Math.cos(cart.rotation.y) * 0.95,
    ],
    label: (s) => {
      if (L.load() > 0) return L.cartFill() >= 1 ? '' : `倒进桶 ${L.load()} 片`;
      if (!s.held && L.cartFill() >= 0.5) return '推车';
      return '';
    },
    canUse: (s) => (L.load() > 0 ? L.cartFill() < 1 : !s.held && L.cartFill() >= 0.5),
    onUse: (p) => {
      if (L.load() > 0) {
        p.busy({
          name: 'dump',
          dur: 1.6,
          pose: 'dump',
          face: cart.position.clone(),
          mid: () => {
            const n = L.dumpLoad();
            p.toast(`倒进桶 ${n} 片 · 桶 ${Math.round(L.cartFill() * 12)}/12`);
          },
        });
        return;
      }
      p.give(push);
      L.grabCart();
      p.toast('推下东台阶，到长廊东头倒掉');
    },
    accepts: (it) => it.id in tools,
    putLabel: '放回车上',
    onPutDown: (it) => {
      if (it.id === 'net') {
        it.stow(play.scene);
        L.stowNet();
      } else {
        it.stow(cart);
        L.stowOnCart(it.id as 'broom' | 'can');
      }
    },
  });
  // 长廊东头的垃圾点：推着车按"倒掉落叶"
  const DUMP = L.dumpPoint();
  play.add({
    id: 'dump',
    at: () => DUMP.clone().setY(0.6),
    radius: 2.2,
    label: (s) => (s.held?.id === 'cart-push' && L.cartFill() > 0 ? '倒掉落叶' : ''),
    canUse: (s) => s.held?.id === 'cart-push' && L.cartFill() > 0,
    onUse: (p) =>
      p.busy({
        name: 'empty',
        dur: 2.2,
        pose: 'dump',
        tick: (k) => L.emptyCart(k),
        end: () => {
          L.emptyCart(1);
          p.toast('桶倒空了 · 推回去，按"放下车"');
        },
      }),
  });

  // ── 捞叶子：离总监最近的那片水里的叶子（捞的时候锁住）──
  let skim: { leaf: LeafRef; job: ReturnType<typeof L.startSkim> } | null = null;
  const skimTarget = (): LeafRef | null => {
    if (skim) return skim.leaf;
    const s = play.state();
    return L.nearestLeaf('water', new THREE.Vector3(s.x, 0, s.z), 9);
  };
  play.add({
    id: 'skim',
    at: () => {
      const l = skimTarget();
      return l ? l.pos.clone() : new THREE.Vector3(1e4, 0, 1e4);
    },
    radius: 3.3,
    priority: 2,
    stand: () => {
      const l = skimTarget();
      if (!l) return null;
      const p = L.rimSpot(l);
      return [p.x, p.z];
    },
    label: (s) => (s.held?.id === 'net' ? (L.load() >= 3 ? '网兜满了' : '捞叶子') : ''),
    canUse: (s) => s.held?.id === 'net' && !!skimTarget() && (!!skim || L.load() < 3),
    pose: 'skim',
    onUse: () => {
      const l = skimTarget();
      if (l) skim = { leaf: l, job: L.startSkim(l) };
    },
    onHold: (dt) => {
      if (!skim) return false;
      if (skim.job.tick(dt)) {
        skim = null;
        return false;
      }
      return true;
    },
    onRelease: (p) => {
      if (skim) {
        skim.job.cancel();
        skim = null;
        return;
      }
      if (L.load() >= 3) p.toast('网兜满了：回保洁车"倒进桶"');
    },
  });

  // ── 扫落叶：离总监最近的地上的叶子 ──
  let sweep: { leaf: LeafRef; job: ReturnType<typeof L.startSweep> } | null = null;
  const sweepTarget = (): LeafRef | null => {
    if (sweep) return sweep.leaf;
    const s = play.state();
    return L.nearestLeaf('tile', new THREE.Vector3(s.x, 0, s.z), 9);
  };
  play.add({
    id: 'sweep',
    at: () => {
      const l = sweepTarget();
      return l ? l.pos.clone() : new THREE.Vector3(1e4, 0, 1e4);
    },
    radius: 1.5,
    priority: 2,
    label: (s) => (s.held?.id === 'broom' ? '扫落叶' : ''),
    canUse: (s) => s.held?.id === 'broom' && !!sweepTarget(),
    pose: 'sweep',
    onUse: () => {
      const l = sweepTarget();
      if (l) sweep = { leaf: l, job: L.startSweep(l) };
    },
    onHold: (dt) => {
      if (!sweep) return false;
      if (sweep.job.tick(dt)) {
        sweep = null;
        return false;
      }
      return true;
    },
    onRelease: () => {
      sweep?.job.cancel();
      sweep = null;
    },
  });

  // ── 浇花：四个花盆 ──
  // 花盆在广场南沿往里 0.9 米：墙下绿带离它平面上也只有 ≈1.2 米（互动半径只算平面），所以只在广场这一层浇；
  // 点它 = 走到花盆北边（同 life 里总监浇花的站位）。高度只卡在 label 上（动作键、走到以后自动浇都按 label 找互动点）：
  // canUse 不卡高度，在墙下点花盆才算点中它（control 的 tapScreen 只挑 canUse 的），会走上台阶到站位再浇
  for (const pot of L.pots()) {
    const onTop = (s: { y: number }) => s.y > pot.pos.y - 0.5;
    play.add({
      id: `pot-${pot.id}`,
      at: () => pot.pos.clone().setY(pot.pos.y + 0.9),
      radius: 1.3,
      stand: () => [pot.pos.x, pot.pos.z - 0.85],
      label: (s) => (s.held?.id === 'can' && onTop(s) ? '浇花' : ''),
      canUse: (s) => s.held?.id === 'can' && (L.pots()[pot.id]?.wet ?? 1) < 0.7,
      onUse: (p) => {
        const job = L.startPour(pot.id);
        let k0 = 0;
        p.busy({
          name: 'pour',
          dur: 2.4,
          pose: 'pour',
          loop: true,
          face: pot.pos.clone(),
          tick: (k) => {
            job.tick((k - k0) * 2.4);
            k0 = k;
          },
          end: () => {
            job.tick(1);
            p.toast('浇好了');
          },
        });
      },
    });
  }

  // ── 顶栏 + 提示 ──
  let statT = 0;
  let warned = false;
  return {
    /** 每步（play.update 之后） */
    update(dt: number) {
      // 车放下了（拿/放键"放下 保洁车"）→ 推把挂回车上，车停在原地
      if (push.where !== 'held' && push.where !== 'away') {
        push.stow(cart);
        L.dropCart();
      }
      statT -= dt;
      if (statT > 0) return;
      statT = 0.25;
      const st = life.state;
      const clean = Math.round(Math.max(0, Math.min(100, 100 - st.dirt * 14)));
      play.stat('plaza', '广场', `${clean}%`);
      play.stat('bin', '桶', `${st.cart}/12`);
      play.stat('bench', '长椅', `${st.seated} 人`);
      play.stat('load', '网兜', st.load > 0 ? `${st.load} 片` : null);
      if (st.dirt >= 3 && !warned) {
        warned = true;
        play.toast('池子里叶子多了 · 去保洁车拿捞网', 2.6);
      } else if (st.dirt < 2) warned = false;
    },
  };
}
