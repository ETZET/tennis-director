// 小游戏 1 · 捡球冲刺（会员场，clubcourts）：课上完了，满场都是球。90 秒里推着捡球器把球捡起来、倒进网柱边的球车。
// - 按住"捡球"：笼子贴地滚，经过的球收进去（推着走慢一点：2.6 米/秒；松手跑 3.4）。
// - 捡球器装 12 个就满：顶栏变色，球车上出箭头（在画面外就贴边指着），走过去"倒球"。
// - 分：每个球 10 分，连着捡（1.3 秒内）每多连一个 +5（最多 +20）；倒进车每个 +5；结算每趟 +30；全部进车 = 清场，+150 和剩余秒数 × 5。
// 场面：场景原样（clubcourts 的 Region，日常演出关掉），会员场上的四个人下场了，教练和孩子在青训场上歇着（idle），
// 帆下的会员、家长扭头看总监。球用场景的 tennis-ball 资产，球车用 clubsite 的 ball-cart，捡球器是总监身上的那个（setProp('picker')）。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { CLOUDS, MEMBER, PLAY_VIEW } from '../../clubcourts/layout';
import { createCourtsRegion } from '../../clubcourts/scene';
import { ballKit } from '../../clubsite/assets/tennis-ball';
import type { Item } from '../../clubsite/play';
import { mountMinigame } from '../shell';
import {
  BALLS,
  CAP,
  COMBO_WINDOW,
  DUMP_PER_BALL,
  DURATION,
  pickPoints,
  type Rect,
  STARS,
  scatterBalls,
  settle,
} from './rules';

/** 球车：会员场南沿、网柱西南边（从场上哪儿过去都不远；离网柱 1.7 米，不和网柱叠成一团） */
const CART: [number, number] = [MEMBER.x - 1.7, 33.2];
/** 球车里本来就有的（教练剩的）：画面上一看就是"球车" */
const CART_BASE = 12;
/** 总监开局：球车东边，朝北看着满场的球 */
const START: [number, number] = [MEMBER.x + 1.3, 32.3];
/** 撒球的范围：会员场内场（北边让开帆、长椅那一条；南边到底线外） */
const AREA: Rect = { x0: -32.3, x1: -1.6, z0: 20.0, z1: 32.6 };
/** 笼子多近算捡到（米，水平） */
const PICK_R = 0.5;
/** 推着捡球器（按住捡球）走多快 / 松手跑多快 */
const HOLD_SPEED = 2.6;
const RUN_SPEED = 3.4;

mountMinigame({
  id: 'ballpickup',
  title: '捡球冲刺',
  tag: '小游戏 1 · 会员场',
  goal: '课上完了，满场都是球。90 秒里把球捡回球车！',
  howto: [
    '拖动画面走路（左下拇指一按就是摇杆）',
    '按住右下「捡球」：笼子滚过的球收进去',
    `装满 ${CAP} 个就去网柱边的球车「倒球」`,
    '连着捡分更多；全部进车 = 清场奖励',
  ],
  region: createCourtsRegion,
  clouds: CLOUDS,
  life: false,
  hour: 16.5,
  weather: 'clear',
  start: { start: START, yaw: Math.PI },
  // 拉近三成（球 6 像素，手机上看得清）：竖屏 12.7 米宽，会员场 33 米，左右要跟；上下会员场整片都在画面里
  zoom: 0.72,
  // 上下：镜头定在会员场中间（开局总监在南沿，lead −7.5 = 往北看 7.5 米；死区 12 米 = 在场上走不动上下）
  camera: { lead: { portrait: -7.5, landscape: -7.5 }, dead: [1.4, 12], view: PLAY_VIEW },
  // 独立页面同款：导航裁到画到的范围里
  nav: (n) => ({
    ...n,
    bounds: {
      x0: Math.max(n.bounds.x0, PLAY_VIEW.x0 + 0.6),
      x1: Math.min(n.bounds.x1, PLAY_VIEW.x1 - 0.6),
      z0: Math.max(n.bounds.z0, PLAY_VIEW.z0 + 0.6),
      z1: Math.min(n.bounds.z1, PLAY_VIEW.z1 - 0.6),
    },
  }),
  duration: DURATION,
  stars: STARS,
  comboWindow: COMBO_WINDOW,
  setup(mg) {
    const { scene, play, region } = mg;
    const { objs, kit } = region;
    const D = play.director;
    const ud = D.userData;

    // ── 场面：课后 ──
    for (const [id, o] of objs) {
      // 会员场上打双打的四个人下场了；空中那个球、青训场散的球（不能捡，免得误会）、躺着的那把捡球器都收走
      if (/^m-[ew]\d$/.test(id) || id.startsWith('ball-') || id === 'picker' || id.startsWith('walker'))
        o.visible = false;
    }
    // 教练、孩子、少年歇着（idle 循环：rig 的 update 推）
    for (const id of ['coach', 'kid-hit', 'kid-q1', 'kid-q2', 'kid-q3', 'teen', 'parent-3'])
      objs.get(id)?.userData.pose?.('idle');
    // 坐着的：呼吸（sit 循环），扭头看总监
    const watchers = ['member-wait-1', 'member-wait-2', 'member-wait-3', 'parent-1', 'parent-2']
      .map((id) => objs.get(id))
      .filter((o): o is THREE.Object3D => !!o);
    for (const w of watchers) w.userData.pose?.('sit');
    const head = new THREE.Vector3();
    mg.onStep(() => {
      head.set(D.position.x, D.position.y + 1.2, D.position.z);
      for (const w of watchers) w.userData.lookAt?.(head);
    });
    const coach = objs.get('coach') ?? null;

    // ── 球车 ──
    const cart = kit.makeAsset('ball-cart', 0).obj;
    cart.name = 'ballpickup:cart';
    cart.position.set(CART[0], mg.groundAt(CART[0], CART[1]), CART[1]);
    cart.rotation.y = Math.PI / 2;
    scene.add(cart);
    play.addBlocker(() => ({ x: CART[0], z: CART[1], r: 0.42 }));
    const cartTop = new THREE.Vector3(CART[0], cart.position.y + 1.05, CART[1]);

    // ── 场上的球（场景的 tennis-ball 资产：一个 InstancedMesh）──
    const loose = kit.makeAsset('tennis-ball', 0).obj;
    loose.name = 'ballpickup:loose';
    scene.add(loose);
    const lu = loose.userData as {
      setBalls(p: [number, number][]): void;
      nearest(x: number, z: number, r?: number): number;
      remove(i: number): void;
      count(): number;
      ballAt(i: number, out?: THREE.Vector3): THREE.Vector3;
    };
    const canPut = (x: number, z: number) =>
      play.nav.height(x, z) !== null &&
      !play.nav.hitsBlocked(x, z, 0.3) &&
      Math.abs(x - MEMBER.x) > 0.45 &&
      Math.hypot(x - CART[0], z - CART[1]) > 2.4;

    // ── 飞的球（捡起来蹦进笼子、倒进球车）：一个 InstancedMesh，不用的缩成 0 ──
    const FLY = 48;
    const kitB = ballKit(kit.ctxFor(0) as unknown as Parameters<typeof ballKit>[0]);
    const flyMesh = new THREE.InstancedMesh(kitB.geo, kitB.mat, FLY);
    flyMesh.frustumCulled = false;
    flyMesh.castShadow = false;
    scene.add(flyMesh);
    interface Fly {
      t0: number;
      dur: number;
      a: THREE.Vector3;
      b: THREE.Vector3 | (() => THREE.Vector3);
      h: number;
      on: boolean;
    }
    const flies: Fly[] = Array.from({ length: FLY }, () => ({
      t0: 0,
      dur: 1,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      h: 0.4,
      on: false,
    }));
    let flyNext = 0;
    const fly = (a: THREE.Vector3, b: THREE.Vector3 | (() => THREE.Vector3), dur: number, h: number, delay = 0) => {
      const f = flies[flyNext];
      flyNext = (flyNext + 1) % FLY;
      f.t0 = mg.t + delay;
      f.dur = dur;
      f.a.copy(a);
      f.b = typeof b === 'function' ? b : b.clone();
      f.h = h;
      f.on = true;
    };
    const m4 = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const fp = new THREE.Vector3();
    mg.onStep(() => {
      flies.forEach((f, i) => {
        const k = (mg.t - f.t0) / f.dur;
        if (!f.on || k < 0) {
          flyMesh.setMatrixAt(i, zero);
          return;
        }
        if (k >= 1) {
          f.on = false;
          flyMesh.setMatrixAt(i, zero);
          return;
        }
        const b = typeof f.b === 'function' ? f.b() : f.b;
        fp.lerpVectors(f.a, b, k);
        fp.y += 4 * f.h * k * (1 - k);
        flyMesh.setMatrixAt(i, m4.makeTranslation(fp.x, fp.y, fp.z));
      });
      flyMesh.instanceMatrix.needsUpdate = true;
    });

    // ── 捡球器（总监身上的那个：setProp('picker')；地上的 obj 用不到，不能随手放下）──
    const hand = () => ud.picker as THREE.Object3D | undefined;
    const cage = new THREE.Vector3();
    const cagePos = () => {
      const p = hand();
      if (!p) return cage.set(D.position.x, 0.3, D.position.z);
      p.updateWorldMatrix(true, false);
      return p.getWorldPosition(cage);
    };
    let tube = 0;
    const showTube = () => {
      // 笼子按 60 个画鼓包：12 个 = 满满一笼
      hand()?.userData.setCount?.(Math.round((tube / CAP) * 60));
      mg.stat('tube', '捡球器', `${tube}/${CAP}`, tube >= CAP ? 'warn' : null);
    };
    let holding = false;
    const picker: Item = play.addItem({
      id: 'picker',
      name: '捡球器',
      obj: new THREE.Group(),
      prop: 'picker',
      carryPose: 'push',
      carrySpeed: RUN_SPEED,
      droppable: false,
      use: {
        label: () => (mg.state !== 'playing' ? '' : tube >= CAP ? '' : '捡球'),
        canUse: () => mg.state === 'playing' && tube < CAP,
        pose: 'push',
        holdSpeed: HOLD_SPEED,
        onUse: () => {
          holding = true;
        },
        onHold: () => {
          holding = true;
          return tube < CAP;
        },
        onRelease: () => {
          holding = false;
        },
      },
    });

    // ── 一局的账 ──
    let round = 0;
    let picked = 0;
    let delivered = 0;
    let trips = 0;
    let bestCombo = 0;
    let fullSaid = false;
    let hintSaid = false;
    const left = () => lu.count();
    const showCourt = () => mg.stat('left', '场上', left(), null);
    const showCart = () => {
      cart.userData.setCount?.(CART_BASE + Math.round((delivered / BALLS) * (60 - CART_BASE)));
    };

    // ── 球车：倒球 ──
    play.add({
      id: 'cart',
      at: () => cartTop,
      radius: 1.6,
      priority: 2,
      label: () => (mg.state === 'playing' && tube > 0 ? `倒球 ${tube}` : ''),
      canUse: () => mg.state === 'playing' && tube > 0,
      onUse: (p) => {
        const r = round;
        p.busy({
          name: 'dump',
          dur: 1.0,
          pose: 'dump',
          face: cart.position.clone(),
          mid: () => {
            if (r !== round || mg.state !== 'playing') return;
            const n = tube;
            const from = cagePos()
              .clone()
              .setY(cage.y + 0.25);
            for (let i = 0; i < Math.min(n, 12); i++)
              fly(from, cartTop.clone().add(new THREE.Vector3((i % 3) * 0.08 - 0.08, -0.1, 0)), 0.42, 0.55, i * 0.04);
            tube = 0;
            delivered += n;
            trips++;
            fullSaid = false;
            showTube();
            showCart();
            mg.addScore(n * DUMP_PER_BALL, cartTop.clone().setY(cartTop.y + 0.4), {
              text: `+${n * DUMP_PER_BALL} 进车`,
              color: 'green',
              big: true,
            });
            if (delivered >= BALLS) mg.finish('清场！');
            else mg.toast(`倒进 ${n} 个 · 车里 ${delivered}`, 1.4);
          },
        });
      },
    });

    // ── 标记：满了 → 球车；剩得少 → 剩下的球 ──
    let cartMark: (() => void) | null = null;
    const ballMarks: (() => void)[] = [];
    const clearBallMarks = () => {
      while (ballMarks.length) ballMarks.pop()?.();
    };
    // 球车脚下一直有一圈（奶油色），满了换金色 + 头上的箭头
    const ring = mg.ring(CART[0], CART[1], 1.0, 0xfff3d6);
    const ringMat = ring.material as THREE.MeshBasicMaterial;
    const setCartMark = (on: boolean) => {
      if (on && !cartMark) {
        cartMark = mg.marker('cart', cartTop, { label: '倒球' });
        ringMat.color.set(0xffd23c);
      } else if (!on && cartMark) {
        cartMark();
        cartMark = null;
        ringMat.color.set(0xfff3d6);
      }
    };
    let markedLeft = -1;
    const syncBallMarks = () => {
      const n = left();
      const want = n > 0 && n <= 3 && tube < CAP ? n : 0;
      if (want === markedLeft) return;
      markedLeft = want;
      clearBallMarks();
      for (let i = 0; i < want; i++) {
        const p = lu.ballAt(i, new THREE.Vector3());
        p.y += 0.25;
        ballMarks.push(mg.marker(`ball${i}`, p, { color: '#8fe36a' }));
      }
    };

    return {
      reset() {
        round++;
        picked = 0;
        delivered = 0;
        trips = 0;
        bestCombo = 0;
        tube = 0;
        holding = false;
        fullSaid = false;
        hintSaid = false;
        for (const f of flies) f.on = false;
        lu.setBalls(scatterBalls(mg.rng(`balls:${mg.round}`), AREA, canPut, BALLS, { netX: MEMBER.x }));
        if (play.held() !== picker) play.give(picker);
        showTube();
        showCourt();
        showCart();
        setCartMark(false);
        markedLeft = -1;
        clearBallMarks();
      },
      start() {
        if (coach) play.say(coach, '球就交给你了！', 2.4);
      },
      step() {
        const s = play.state();
        // 推着走：笼子跟着滚
        if (s.speed > 0.05) hand()?.userData.roll?.(1 / 60, s.speed);
        const usingNow = holding && s.holding === 'picker' && !s.busy;
        if (usingNow && tube < CAP) {
          const c = cagePos();
          let got = 0;
          while (tube < CAP) {
            const i = lu.nearest(c.x, c.z, PICK_R);
            if (i < 0) break;
            const b = lu.ballAt(i, new THREE.Vector3());
            lu.remove(i);
            tube++;
            picked++;
            got++;
            const combo = mg.comboHit();
            bestCombo = Math.max(bestCombo, combo);
            const pts = pickPoints(combo);
            fly(
              b,
              () =>
                cagePos()
                  .clone()
                  .setY(cage.y + 0.15),
              0.22,
              0.35,
            );
            mg.addScore(pts, b.clone().setY(b.y + 0.35), {
              text: combo >= 2 ? `+${pts} ×${combo}` : `+${pts}`,
              big: combo >= 4,
            });
          }
          if (got) {
            showTube();
            showCourt();
          }
          if (tube >= CAP && !fullSaid) {
            fullSaid = true;
            play.say(D, '满了！', 1.4);
            mg.toast('捡球器满了 → 去网柱边的球车倒球', 2.2);
          }
        } else if (!hintSaid && tube < CAP && s.speed > 0.5) {
          // 第一次走到球跟前却没按住：提示一下
          const c = cagePos();
          if (lu.nearest(c.x, c.z, PICK_R + 0.1) >= 0) {
            hintSaid = true;
            mg.toast('按住右下的「捡球」才会捡', 2.2);
          }
        }
        // 场上捡完了、手里还有：也指着球车
        setCartMark(tube >= CAP || (left() === 0 && tube > 0) || (mg.timeLeft < 10 && tube >= 4));
        syncBallMarks();
      },
      finish(reason) {
        setCartMark(false);
        clearBallMarks();
        return settle({
          picked,
          delivered,
          trips,
          bestCombo,
          total: BALLS,
          timeLeft: reason === '清场！' ? mg.timeLeft : 0,
        });
      },
      debug: () => ({ tube, picked, delivered, trips, left: left(), holding }),
    };
  },
});
