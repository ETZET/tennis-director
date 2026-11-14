// 小游戏 5 · 穿线（会所一楼的穿线 · 试拍吧，clubhouse）：总监顶穿线师的班。客人在递拍子窗前排队，每人带一把拍子、一个磅数、一个取拍时限。
// - 点一位客人（下面的卡，或者画面里的人；闲着时按大按钮 = 接排第一的）→ 接过拍子，夹上穿线机。
// - ① 竖线：光标来回扫，进绿区点「穿」（金色正中 = 完美），8 根（职业 10 根）。
// - ② 拉力：按住「拉线」，指针往上走，进客人要的磅数区间松手；拉过头 = 断线。混穿横线换一种线、再拉一次（磅数低 2）。
// - ③ 横线：一上一下地编 —— 左 / 右的拍子从右边滑过来，到金线时按对的那边。
// - 交拍子：质量 = 三步的准度；分 = 小费 × 质量 × 10。时限还剩一半以上 +¥5；超时交 = 小费减半；没轮上就走 = −30。
// 场面：clubhouse 的 Region 原样建（日常演出关掉），切到一楼剖面（沉浸式：背景换楼里的暗色，楼外的藏起来）。
// 场景的穿线师（slot:shop-stringer）藏起来，总监站在穿线机西边、朝东干活（dink = 穿一根、crank = 拉线、pickup = 接拍子）；
// 摆着的另一个总监（slot:director-in）拿掉。客人是 clubsite/people 的 player（拿着拍子），从正门进来、沿商店街排到递拍子窗前。
// 总监不走路：导航只留穿线机边上一小块，上半截画面盖了一层（点不到地面，点到排队的客人 = 选他）。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { INTERIOR_BG } from '../../clubhouse/layout';
import { createHouseRegion } from '../../clubhouse/scene';
import { NAMED } from '../../clubsite/cast';
import { player } from '../../clubsite/people';
import { mountMinigame } from '../shell';
import { runBot } from './bot';
import { type BtnMode, createPanel, drawMeter, drawRacket, type MeterView, type QueueItem } from './panel';
import {
  arrivalGap,
  BEAT_LEAD,
  BEAT_OK,
  beatGap,
  COMBO_WINDOW,
  type Customer,
  crossCount,
  crossPattern,
  DURATION,
  difficulty,
  GAUGE,
  type Grade,
  judgeBeat,
  judgeSweep,
  judgeTension,
  KIND,
  LEAVE_PENALTY,
  mainsCount,
  makeCustomer,
  OPENING,
  type Phase,
  payout,
  phasesOf,
  QUEUE_MAX,
  quality,
  qualityLabel,
  type Side,
  STARS,
  type SweepSpec,
  settle,
  sweepPos,
  sweepSpec,
  TENSION_OK,
  tensionAt,
  tensionRate,
  zoneCenter,
} from './rules';

/** 总监站哪：穿线机（−55.2, −27.6）西边，朝东 */
const STAND: [number, number] = [-56.1, -27.55];
const MACHINE = new THREE.Vector3(-55.2, 1.1, -27.6);
/** 递拍子窗（商店街这边，客人站在这儿） */
const WINDOW: [number, number] = [-55.2, -23.05];
/** 排队的位置：窗口西边沿商店街排开（长椅在北墙根，让开） */
const QUEUE: [number, number][] = [
  [-56.5, -22.15],
  [-57.5, -21.85],
  [-58.5, -21.55],
  [-59.5, -21.3],
  [-60.4, -21.05],
];
/** 客人从这儿进、从这儿走（商店街东头，刚出画面：正门里面太远，走过来要五秒） */
const DOOR: [number, number] = [-51.2, -21.3];
/** 相机：定住，递拍子窗和商店街在上半截画面里 */
const CAM = new THREE.Vector3(-56.4, 0, -21.6);
const WALK = 1.6;
/** 头像色（按 player 的变体） */
const AV = ['#e8484e', '#3e6ed4', '#ffd23c', '#2ca098'];
/** 线的颜色：普通 = 青柠，混穿 = 竖线蓝、横线青柠，职业 = 竖线奶白、横线金 */
const STRING_C: Record<Customer['kind'], [string, string]> = {
  normal: ['#d8f050', '#d8f050'],
  hybrid: ['#5a9cf4', '#d8f050'],
  pro: ['#fff3d6', '#ffd23c'],
};
const GRADE_TEXT: Record<Grade, string> = { perfect: '完美', good: '好', miss: '偏了' };
const GRADE_POP: Record<Grade, string> = { perfect: 'gold', good: 'green', miss: 'red' };
const PHASE_NAME: Record<Phase, string> = { mains: '竖线', tension: '拉力', tension2: '横拉', crosses: '横线' };
const NUM = ['①', '②', '③', '④'];

/** 客人名字：cast 里有名有姓的会员（中文名） */
const NAMES = NAMED.filter((p) => p.role === 'member' && p.nameZh).map((p) => p.nameZh);

type GuestState = 'walkin' | 'queue' | 'service' | 'leaving' | 'gone';
interface Guest {
  c: Customer;
  obj: THREE.Object3D;
  /** 时限还剩几秒 */
  left: number;
  state: GuestState;
  /** 交完拍子以后在窗口站一会儿再走 */
  linger: number;
  lateSaid: boolean;
  hurrySaid: boolean;
}

interface Job {
  g: Guest;
  phases: Phase[];
  pi: number;
  /** intake 接拍子 · work 在做这一步 · gap 这一步做完、停一下 · deliver 交拍子 */
  stage: 'intake' | 'work' | 'gap' | 'deliver';
  stageT: number;
  mains: (Grade | null)[];
  crosses: (Grade | null)[];
  tensions: Grade[];
  spec: SweepSpec;
  sweepT0: number;
  zone: number;
  holding: boolean;
  holdT: number;
  value: number;
  snapped: boolean;
  /** 这一步断过线、重拉过了 */
  redone: boolean;
  beatT0: number;
  gap: number;
  pattern: Side[];
  flash: { kind: 'm' | 'c'; i: number; t: number } | null;
  meterFlash: { g: Grade; t: number } | null;
}

mountMinigame({
  id: 'stringing',
  title: '穿线',
  tag: '小游戏 5 · 会所一楼',
  goal: '顶穿线师的班：客人排队等拍子，穿得又快又准，小费才多。',
  howto: [
    '点一位客人接他的拍子（职业球员赶时间、小费翻倍）',
    '① 竖线：光标进绿区就点「穿」，金色正中最好',
    '② 拉力：按住拉线，指针到客人要的磅数就松手',
    '③ 横线：左 / 右拍子滑到金线时按对的那边',
  ],
  region: createHouseRegion,
  life: false,
  hour: 15,
  weather: 'clear',
  start: { start: STAND, yaw: Math.PI / 2 },
  // 拉近一半：手机上看得清穿线机和窗口前的客人
  zoom: 0.5,
  camera: { dead: [3, 3], lead: { portrait: 0, landscape: 0 } },
  // 总监不走路：导航只留穿线机边上一小块
  nav: (n) => ({ ...n, bounds: { x0: STAND[0] - 0.4, x1: STAND[0] + 0.4, z0: STAND[1] - 0.4, z1: STAND[1] + 0.4 } }),
  duration: DURATION,
  stars: STARS,
  comboWindow: COMBO_WINDOW,
  setup(mg) {
    const { scene, play, region } = mg;
    const D = play.director;

    // ── 场面：一楼剖面（沉浸式） ──
    region.setInside(true);
    const interior = new THREE.Color(INTERIOR_BG);
    const bodyBg = `#${interior.getHexString()}`;
    scene.background = interior;
    // 穿线师下班（总监顶班）；摆着的那个总监拿掉
    const stringer = scene.getObjectByName('slot:shop-stringer');
    if (stringer) stringer.visible = false;
    scene.getObjectByName('slot:director-in')?.removeFromParent();
    // 相机定住（每步在 play 的跟随之后改回来）
    mg.onStep(() => {
      mg.pipe.rig.target.copy(CAM);
    });
    mg.onFrame(() => {
      if (scene.background !== interior) scene.background = interior;
      if (document.body.style.background !== bodyBg) document.body.style.background = bodyBg;
    });

    // 穿线机上那把拍子的线床（青柠色的圆片）：竖线没穿过半时藏起来
    const machine = scene.getObjectByName('slot:shop-stringing-machine');
    const beds: THREE.Object3D[] = [];
    machine?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'CircleGeometry') beds.push(o);
    });
    const setBed = (on: boolean) => {
      for (const b of beds) b.visible = on;
    };

    // ── 客人：player 一池 8 个（拿着拍子），用完放回 ──
    const pool: THREE.Object3D[] = [];
    for (let i = 0; i < 8; i++) {
      const o = player({ ...mg.ctx, variant: i % 4 } as never);
      o.name = `stringing:guest${i}`;
      o.userData.stVariant = i % 4;
      o.visible = false;
      o.userData.setProp?.('racket');
      scene.add(o);
      pool.push(o);
    }
    const head = (o: THREE.Object3D) => new THREE.Vector3(o.position.x, o.position.y + 2.0, o.position.z);

    let guests: Guest[] = [];
    let job: Job | null = null;
    let nextId = 0;
    let nextArrive = Infinity;
    let opening: number[] = [];
    let custRng = mg.rng('cust:1');
    let jobRng = mg.rng('job:1');
    const stats = { done: 0, tips: 0, qualitySum: 0, perfects: 0, left: 0, pros: 0, bestCombo: 0 };

    const waiting = () => guests.filter((g) => g.state === 'walkin' || g.state === 'queue');
    const spawn = () => {
      const free = pool.filter((o) => !guests.some((g) => g.obj === o && g.state !== 'gone'));
      if (!free.length) return;
      const c = makeCustomer(custRng, mg.elapsed, nextId++, NAMES);
      const obj = free.find((o) => o.userData.stVariant === c.variant) ?? free[0];
      c.variant = obj.userData.stVariant as number;
      obj.visible = true;
      obj.position.set(DOOR[0], 0, DOOR[1]);
      obj.userData.setProp?.('racket');
      obj.userData.stPose = '';
      guests = guests.filter((g) => g.state !== 'gone');
      guests.push({ c, obj, left: c.patience, state: 'walkin', linger: 0, lateSaid: false, hurrySaid: false });
      if (c.kind === 'pro') {
        mg.toast(`职业球员 ${c.name} 赶时间：小费翻倍！`, 2.2);
        play.say(obj, '一小时后比赛！', 2.2);
      } else if (c.kind === 'hybrid') play.say(obj, '混穿，谢谢', 1.8);
    };

    /** 客人该站哪 */
    const targetOf = (g: Guest): [number, number] => {
      if (g.state === 'service') return WINDOW;
      if (g.state === 'leaving') return DOOR;
      const i = waiting().indexOf(g);
      return QUEUE[Math.min(QUEUE.length - 1, Math.max(0, i))];
    };
    const moveGuests = (dt: number) => {
      for (const g of guests) {
        if (g.state === 'gone') continue;
        const [tx, tz] = targetOf(g);
        const o = g.obj;
        const dx = tx - o.position.x;
        const dz = tz - o.position.z;
        const d = Math.hypot(dx, dz);
        const ud = o.userData;
        if (d > 0.05) {
          const s = Math.min(d, WALK * dt);
          o.position.x += (dx / d) * s;
          o.position.z += (dz / d) * s;
          o.rotation.y = Math.atan2(dx, dz);
          if (ud.stPose !== 'walk') {
            ud.stPose = 'walk';
            ud.pose?.('walk');
          }
        } else {
          if (g.state === 'leaving') {
            g.state = 'gone';
            o.visible = false;
            continue;
          }
          if (g.state === 'walkin') g.state = 'queue';
          // 站定：朝递拍子窗后面的柜台
          const want = Math.atan2(WINDOW[0] - o.position.x, WINDOW[1] - 1.5 - o.position.z);
          let dd = want - o.rotation.y;
          dd -= Math.round(dd / (Math.PI * 2)) * Math.PI * 2;
          o.rotation.y += dd * Math.min(1, dt * 8);
          if (ud.stPose !== 'idle') {
            ud.stPose = 'idle';
            ud.pose?.('idle');
          }
        }
        ud.update?.(dt);
      }
    };

    // ── 面板 ──
    const panel = createPanel({
      down: () => press(),
      up: () => release(),
      side: (s) => side(s),
      pick: (id) => pick(id),
      tapScene(x, y) {
        // 点到画面里排队的客人 = 选他
        let best: Guest | null = null;
        let bd = 46;
        for (const g of waiting()) {
          const p = mg.project(new THREE.Vector3(g.obj.position.x, 1.0, g.obj.position.z));
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bd) {
            bd = d;
            best = g;
          }
        }
        if (best) pick(best.c.id);
      },
    });
    panel.show(false);

    // ── 总监的动作（不走路，只在原地转身、摆姿势） ──
    const machineAt: [number, number] = [MACHINE.x, MACHINE.z];
    const act = (name: string, pose: string, dur: number, face: readonly [number, number] = machineAt, loop = false) =>
      play.busy({ name, pose, dur, loop, face });

    // ── 一把拍子 ──
    const newJob = (g: Guest): Job => {
      const d = difficulty(mg.elapsed);
      return {
        g,
        phases: phasesOf(g.c.kind),
        pi: 0,
        stage: 'intake',
        stageT: 0,
        mains: Array(mainsCount(g.c.kind)).fill(null),
        crosses: Array(crossCount(g.c.kind)).fill(null),
        tensions: [],
        spec: sweepSpec(d),
        sweepT0: 0,
        zone: 0.5,
        holding: false,
        holdT: 0,
        value: GAUGE.min,
        snapped: false,
        redone: false,
        beatT0: 0,
        gap: beatGap(d),
        pattern: crossPattern(jobRng, crossCount(g.c.kind), d),
        flash: null,
        meterFlash: null,
      };
    };
    const phase = (j: Job) => j.phases[j.pi];
    const beatTime = (j: Job, i: number) => j.beatT0 + BEAT_LEAD + i * j.gap;
    const targetOfPhase = (j: Job) => (phase(j) === 'tension2' ? j.g.c.crossTension : j.g.c.tension);

    function pick(id: number) {
      if (mg.state !== 'playing' || job) return;
      const g = waiting().find((x) => x.c.id === id);
      if (!g) return;
      g.state = 'service';
      job = newJob(g);
      act('take', 'pickup', 0.7, WINDOW);
      g.obj.userData.setProp?.(null);
      play.say(g.obj, `${g.c.tension} 磅，拜托了`, 1.6);
      setBed(false);
    }
    const beginPhase = (j: Job) => {
      j.stage = 'work';
      j.stageT = 0;
      const p = phase(j);
      if (p === 'mains') {
        j.sweepT0 = mg.t;
        j.zone = zoneCenter(jobRng, j.spec);
      } else if (p === 'tension' || p === 'tension2') {
        if (!j.snapped) j.redone = false;
        j.holding = false;
        j.holdT = 0;
        j.value = GAUGE.min;
        j.snapped = false;
      } else {
        j.beatT0 = mg.t;
      }
    };
    const endPhase = (j: Job) => {
      j.stage = 'gap';
      j.stageT = 0;
    };
    const hit = (g: Grade) => {
      if (g === 'miss') mg.comboBreak();
      else {
        stats.bestCombo = Math.max(stats.bestCombo, mg.comboHit());
        if (g === 'perfect') stats.perfects++;
      }
      mg.pop(new THREE.Vector3(MACHINE.x, MACHINE.y + 0.5, MACHINE.z), GRADE_TEXT[g], {
        color: GRADE_POP[g],
        big: g === 'perfect',
      });
    };

    /** 大按钮按下：闲着 = 接排第一的；竖线 = 穿一根；拉力 = 开始拉 */
    function press() {
      if (mg.state !== 'playing') return;
      const j = job;
      if (!j) {
        const first = waiting().find((g) => g.state === 'queue') ?? waiting()[0];
        if (first) pick(first.c.id);
        return;
      }
      if (j.stage !== 'work') return;
      const p = phase(j);
      if (p === 'mains') {
        const i = j.mains.indexOf(null);
        if (i < 0) return;
        const pos = sweepPos(mg.t - j.sweepT0, j.spec.period);
        const g = judgeSweep(pos, j.zone, j.spec);
        j.mains[i] = g;
        j.flash = { kind: 'm', i, t: mg.t };
        j.meterFlash = { g, t: mg.t };
        hit(g);
        act('main', 'dink', 0.3);
        if (i >= Math.floor(j.mains.length / 2)) setBed(true);
        if (j.mains.indexOf(null) < 0) endPhase(j);
        else j.zone = zoneCenter(jobRng, j.spec);
      } else if (p === 'tension' || p === 'tension2') {
        if (j.holding || j.snapped) return;
        j.holding = true;
        j.holdT = 0;
        act('pull', 'crank', 30, machineAt, true);
      }
    }
    function release() {
      const j = job;
      if (!j?.holding || j.stage !== 'work') return;
      j.holding = false;
      const g = judgeTension(j.value, targetOfPhase(j));
      j.tensions.push(g);
      j.meterFlash = { g, t: mg.t };
      hit(g);
      act('pulled', 'idle', 0.25);
      endPhase(j);
    }
    function side(s: Side) {
      if (mg.state !== 'playing') return;
      const j = job;
      if (!j) return;
      if (j.stage !== 'work' || phase(j) !== 'crosses') return;
      // 离现在最近的、还没判的那一拍
      let bi = -1;
      let be = Number.POSITIVE_INFINITY;
      j.crosses.forEach((gr, i) => {
        if (gr !== null) return;
        const e = mg.t - beatTime(j, i);
        if (Math.abs(e) < Math.abs(be)) {
          be = e;
          bi = i;
        }
      });
      if (bi < 0 || Math.abs(be) > BEAT_OK.ignore) return;
      let g = judgeBeat(be) ?? 'miss';
      if (j.pattern[bi] !== s) g = 'miss';
      // 前面还有没判的（跳过去按的）：都算漏
      for (let i = 0; i < bi; i++) if (j.crosses[i] === null) j.crosses[i] = 'miss';
      j.crosses[bi] = g;
      j.flash = { kind: 'c', i: bi, t: mg.t };
      j.meterFlash = { g, t: mg.t };
      hit(g);
      act('cross', 'dink', 0.28);
      if (j.crosses.indexOf(null) < 0) endPhase(j);
    }

    const deliver = (j: Job) => {
      const q = quality(j.mains as Grade[], j.tensions, j.crosses as Grade[]);
      const pay = payout(j.g.c.kind, q, j.g.left, j.g.c.patience);
      const lab = qualityLabel(q);
      stats.done++;
      stats.tips += pay.tip;
      stats.qualitySum += q;
      if (j.g.c.kind === 'pro') stats.pros++;
      const g = j.g;
      g.obj.userData.setProp?.('racket');
      const hp = head(g.obj);
      mg.addScore(pay.points, hp, { text: `+${pay.points}`, big: true, color: 'gold' });
      mg.pop(hp.clone().setY(hp.y + 0.55), `${lab.grade} ${Math.round(q * 100)}% · ¥${pay.tip}`, {
        color: q >= 0.75 ? 'green' : q >= 0.5 ? 'cream' : 'red',
      });
      play.say(
        g.obj,
        pay.late ? '迟到了…' : lab.grade === 'S' ? (g.c.kind === 'pro' ? '完美，赢定了！' : '完美！') : lab.text,
        1.8,
      );
      mg.toast(
        `${g.c.name}：${lab.text} ${Math.round(q * 100)}% · 小费 ¥${pay.tip}${pay.fast ? '（快 +5）' : pay.late ? '（超时减半）' : ''}`,
        2,
      );
      g.linger = 0.9;
      act('hand', 'dink', 0.5, WINDOW);
      job = null;
    };

    // 时限：排队时到了就走（扣分）；穿着的到了 = 超时（小费减半）；交完的站一会儿再走
    const tickPatience = (dt: number) => {
      for (const g of guests) {
        const queued = g.state === 'walkin' || g.state === 'queue';
        if (queued || g.state === 'service') g.left -= dt;
        if (g.state === 'service' && job?.g === g && g.left <= 0 && !g.lateSaid) {
          g.lateSaid = true;
          play.say(g.obj, '要迟到了！', 1.8);
        }
        if (queued && g.left <= 0) {
          g.state = 'leaving';
          stats.left++;
          mg.comboBreak();
          mg.addScore(-LEAVE_PENALTY, head(g.obj), { text: `−${LEAVE_PENALTY} 走了`, color: 'red', big: true });
          play.say(g.obj, '不等了！', 1.8);
        } else if (queued && !g.hurrySaid && g.left < g.c.patience * 0.25) {
          g.hurrySaid = true;
          play.say(g.obj, '还要多久？', 1.6);
        }
        if (g.state === 'service' && job?.g !== g) {
          g.linger -= dt;
          if (g.linger <= 0) g.state = 'leaving';
        }
      }
    };

    const stepJob = (dt: number) => {
      const j = job;
      if (!j) return;
      j.stageT += dt;
      if (j.stage === 'intake') {
        if (j.stageT >= 0.55) beginPhase(j);
        return;
      }
      if (j.stage === 'gap') {
        if (j.stageT >= 0.35) {
          // 断了线：同一步重拉一次（时间搭进去了；第二次再断就算了）
          if (j.snapped && !j.redone) {
            j.redone = true;
            beginPhase(j);
            return;
          }
          j.pi++;
          if (j.pi >= j.phases.length) {
            j.stage = 'deliver';
            deliver(j);
          } else beginPhase(j);
        }
        return;
      }
      if (j.stage !== 'work') return;
      const p = phase(j);
      if ((p === 'tension' || p === 'tension2') && j.holding) {
        j.holdT += dt;
        // 拉的时候指针抖一点（确定的小抖动，不是随机）
        j.value = tensionAt(j.holdT, tensionRate(difficulty(mg.elapsed))) + Math.sin(mg.t * 17) * 0.18;
        if (j.value >= GAUGE.max - 0.01) {
          j.value = GAUGE.max;
          j.holding = false;
          j.snapped = true;
          j.tensions.push('miss');
          j.meterFlash = { g: 'miss', t: mg.t };
          hit('miss');
          mg.toast(j.redone ? '又断了！' : '拉过头，断线了！重拉一次', 1.4);
          act('snap', 'idle', 0.3);
          endPhase(j);
        }
      } else if (p === 'crosses') {
        // 滑过判定线还没按 = 漏
        let changed = false;
        j.crosses.forEach((gr, i) => {
          if (gr === null && mg.t - beatTime(j, i) > BEAT_OK.good) {
            j.crosses[i] = 'miss';
            j.flash = { kind: 'c', i, t: mg.t };
            j.meterFlash = { g: 'miss', t: mg.t };
            hit('miss');
            changed = true;
          }
        });
        if (changed && j.crosses.indexOf(null) < 0) endPhase(j);
      }
    };

    // ── 面板的样子（每帧） ──
    const syncPanel = () => {
      const now = mg.t;
      const w = waiting();
      const firstQ = w.find((g) => g.state === 'queue') ?? w[0];
      const items: QueueItem[] = w.map((g) => ({
        id: g.c.id,
        name: g.c.name,
        req: `${g.c.tension}磅`,
        tag: g.c.kind === 'pro' ? '急×2' : KIND[g.c.kind].label,
        pro: g.c.kind === 'pro',
        frac: g.left / g.c.patience,
        color: AV[g.c.variant % AV.length],
        next: !job && g === firstQ,
      }));
      panel.setQueue(items);
      const j = job;
      let meter: MeterView = { kind: 'none' };
      let mode: BtnMode = 'wait';
      let label = '…';
      let sub = '';
      let readA = '';
      let readB = '';
      if (!j) {
        panel.setWho(w.length ? '<span>点一位客人，接他的拍子</span>' : '<span>等客人来…</span>');
        panel.setSteps([]);
        if (firstQ) {
          mode = 'idle';
          label = '接拍子';
          sub = `排第一：${firstQ.c.name}`;
        } else label = '等客人';
      } else {
        const c = j.g.c;
        const tag = c.kind === 'pro' ? ' · 职业×2' : c.kind === 'hybrid' ? ' · 混穿' : '';
        const late = j.g.left <= 0;
        const tc = late ? '#ff7a7a' : j.g.left < c.patience * 0.25 ? '#ffb43c' : '#8fe36a';
        panel.setWho(
          `<b>${c.name}</b><span>${c.tension}${c.kind === 'hybrid' ? `/${c.crossTension}` : ''}磅${tag}</span>` +
            `<span style="color:${tc}">${late ? '超时' : `⏱${Math.ceil(j.g.left)}s`}</span>`,
        );
        panel.setSteps(
          j.phases.map((p, i) => ({
            label: `${NUM[i]}${PHASE_NAME[p]}`,
            state: i < j.pi || (i === j.pi && j.stage === 'gap') ? 'ok' : i === j.pi && j.stage === 'work' ? 'on' : '',
          })),
        );
        const p = phase(j);
        const mf = j.meterFlash && now - j.meterFlash.t < 0.3 ? j.meterFlash.g : null;
        if (j.stage === 'intake') {
          label = '接拍子…';
          readA = '夹上穿线机';
        } else if (j.stage === 'deliver') {
          label = '交拍子';
        } else if (p === 'mains') {
          const done = j.mains.filter((x) => x !== null).length;
          if (j.stage === 'work') {
            meter = {
              kind: 'sweep',
              pos: sweepPos(now - j.sweepT0, j.spec.period),
              zone: j.zone,
              good: j.spec.good,
              perfect: j.spec.perfect,
              flash: mf,
            };
            mode = 'tap';
            label = '穿！';
            sub = '光标进绿区点';
          }
          readA = `竖线 <b>${done}/${j.mains.length}</b>`;
          const last = j.mains[done - 1];
          readB = last ? `<span class="g-${last}">${GRADE_TEXT[last]}</span>` : '';
        } else if (p === 'tension' || p === 'tension2') {
          const tg = targetOfPhase(j);
          meter = {
            kind: 'gauge',
            value: j.value,
            target: tg,
            min: GAUGE.min,
            max: GAUGE.max,
            good: TENSION_OK.good,
            perfect: TENSION_OK.perfect,
            snapped: j.snapped,
            flash: mf,
          };
          if (j.stage === 'work') {
            mode = 'pull';
            label = j.holding ? '松手！' : '按住 拉线';
            sub = `到 ${tg} 磅松手`;
          }
          readA = `<b>${j.value.toFixed(1)}</b> 磅`;
          const last = j.stage === 'gap' ? j.tensions[j.tensions.length - 1] : null;
          readB = last
            ? `<span class="g-${last}">${j.snapped ? '断线！' : GRADE_TEXT[last]}</span>`
            : `目标 <b>${tg}</b>`;
        } else {
          meter = {
            kind: 'lane',
            now,
            beats: j.pattern.map((s, i) => ({ t: beatTime(j, i), side: s, grade: j.crosses[i] })),
            flash: mf,
          };
          if (j.stage === 'work') mode = 'lr';
          const done = j.crosses.filter((x) => x !== null).length;
          readA = `横线 <b>${done}/${j.crosses.length}</b>`;
          const last = [...j.crosses].reverse().find((x) => x !== null);
          readB = done && last ? `<span class="g-${last}">${GRADE_TEXT[last]}</span>` : '一上一下，踩着点';
        }
      }
      panel.setButton(mode, label, sub);
      panel.setRead(readA, readB);
      drawMeter(panel.meter, meter);
      // 拍面
      if (j) {
        const [mc, cc] = STRING_C[j.g.c.kind];
        const p = phase(j);
        const fl = j.flash && now - j.flash.t < 0.25 ? { ...j.flash, k: 1 - (now - j.flash.t) / 0.25 } : null;
        drawRacket(panel.racket, {
          mains: j.mains,
          crosses: j.crosses,
          mainColor: mc,
          crossColor: cc,
          next:
            j.stage === 'deliver'
              ? null
              : p === 'mains'
                ? { kind: 'm', i: Math.max(0, j.mains.indexOf(null)) }
                : p === 'crosses'
                  ? { kind: 'c', i: Math.max(0, j.crosses.indexOf(null)) }
                  : null,
          taut: j.tensions.length > 0,
          empty: false,
          flash: fl,
        });
      } else
        drawRacket(panel.racket, {
          mains: [],
          crosses: [],
          mainColor: '',
          crossColor: '',
          next: null,
          taut: false,
          empty: true,
          flash: null,
        });
      mg.stat('queue', '排队', w.length, w.length >= QUEUE_MAX - 1 ? 'warn' : null);
      mg.stat('tips', '小费', `¥${stats.tips}`, null);
    };

    // 节拍提示：拍子到线上那一刻，对应的按钮闪一下（看按钮也能踩点）
    let cued = -1;
    // 闲着时排第一的客人头上一个箭头（画面和下面的卡对得上）
    let nextMark: (() => void) | null = null;
    const nextHead = new THREE.Vector3();
    const syncMark = () => {
      const w = waiting();
      const first = w.find((g) => g.state === 'queue');
      const on = mg.state === 'playing' && !job && !!first;
      if (on && !nextMark)
        nextMark = mg.marker(
          'next',
          () => {
            const f = waiting().find((g) => g.state === 'queue');
            return f ? nextHead.set(f.obj.position.x, 2.0, f.obj.position.z) : null;
          },
          { label: '接拍子', edge: false },
        );
      else if (!on && nextMark) {
        nextMark();
        nextMark = null;
      }
    };

    const cueBeats = () => {
      const j = job;
      if (!j?.pattern.length || j.stage !== 'work' || phase(j) !== 'crosses') {
        cued = -1;
        return;
      }
      const i = j.crosses.indexOf(null);
      if (i >= 0 && i !== cued && mg.t >= beatTime(j, i) - 0.02) {
        cued = i;
        panel.cue(j.pattern[i]);
      }
    };

    // ── 无头驱动 / 自动玩（?bot=good|ok|bad：调星级、截图） ──
    const api = {
      press,
      release,
      side,
      pick,
      snapshot: () => {
        const j = job;
        return {
          t: mg.t,
          state: mg.state,
          elapsed: mg.elapsed,
          queue: waiting().map((g) => ({ id: g.c.id, kind: g.c.kind, left: g.left, patience: g.c.patience })),
          job: j
            ? {
                id: j.g.c.id,
                stage: j.stage,
                phase: phase(j),
                sweep: { pos: sweepPos(mg.t - j.sweepT0, j.spec.period), zone: j.zone, period: j.spec.period },
                tension: { value: j.value, target: targetOfPhase(j), holding: j.holding, attempt: j.redone ? 1 : 0 },
                beats: j.pattern.map((s, i) => ({ t: beatTime(j, i), side: s, grade: j.crosses[i] })),
                mainsLeft: j.mains.filter((x) => x === null).length,
              }
            : null,
        };
      },
      stats: () => ({ ...stats, score: mg.score }),
    };
    const botSkill = mg.params.get('bot');
    Object.assign(window, {
      __st: { ...api, bot: (skill: string, sec: number) => runBot(api, mg, skill, sec) },
    });

    return {
      reset() {
        for (const g of guests) g.obj.visible = false;
        guests = [];
        job = null;
        nextId = 0;
        custRng = mg.rng(`cust:${mg.round}`);
        jobRng = mg.rng(`job:${mg.round}`);
        opening = [...OPENING];
        nextArrive = Number.POSITIVE_INFINITY;
        Object.assign(stats, { done: 0, tips: 0, qualitySum: 0, perfects: 0, left: 0, pros: 0, bestCombo: 0 });
        play.teleport(STAND[0], STAND[1], Math.PI / 2);
        D.userData.setProp?.(null);
        setBed(true);
        panel.show(false);
      },
      start() {
        panel.show(true);
        nextArrive = OPENING[OPENING.length - 1] + arrivalGap(0);
        mg.toast('客人来了：点他接拍子', 2.2);
      },
      step(dt) {
        while (opening.length && mg.elapsed >= opening[0]) {
          opening.shift();
          spawn();
        }
        if (mg.elapsed >= nextArrive) {
          if (waiting().length < QUEUE_MAX) spawn();
          nextArrive += arrivalGap(mg.elapsed);
        }
        stepJob(dt);
        tickPatience(dt);
        moveGuests(dt);
        cueBeats();
        syncMark();
        if (botSkill) runBot(api, mg, botSkill, 0);
      },
      frame() {
        if (mg.state === 'playing') syncPanel();
      },
      finish() {
        nextMark?.();
        nextMark = null;
        panel.show(false);
        if (job) job.holding = false;
        mg.stat('tips', '小费', `¥${stats.tips}`, null);
        mg.stat('queue', '排队', waiting().length, null);
        return settle(stats);
      },
      debug: () => ({ ...api.snapshot(), stats: api.stats() }),
    };
  },
});
