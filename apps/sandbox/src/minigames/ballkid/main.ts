// 小游戏 8 · 球童（中心球场，比赛中；clubstadium）：表演赛正在打，总监蹲在南网柱边当球童。
// - 一分打完，死球停在某处（挂网、底线后、南边场边、北边广告板下）：跑过去捡（「捡球」/ 点球），回到岗位的圈里 = 回收完成。
//   顶上的条是发球倒计时：条走完发球人就发球。回得越快分越多（50 + 剩下的比例 × 50），连着干净回收再加连击。
// - 发球人举手要球（球打飞上看台、或者他手里没球了）：站在岗位上按住「递球」，准星走到绿区松手，球滚到他脚下。
// - 每局打完换边休息：举手要毛巾的那位 → 去南边的毛巾箱「拿毛巾」→ 跑过去「递毛巾」（递错人扣分）。
// - 犯规（−1 命，三次就被换下场）：发球那一刻人在场上（裁判"请安静"）、比赛中跑进场、发球前在发球人眼前走动（红色视线锥里）。
// 场面：场景原样（clubstadium 的 Region，日常演出关掉，比赛由这里自己排：rules.ts 的 planPoint 出整条时间轴，这里只负责演）。
// 球员、裁判、五个球童、看台、记分牌都用场景里摆好的；南网柱那个蹲着的球童换成总监。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { setStride } from '../../clubsite/people';
import type { Item, Play } from '../../clubsite/play';
import { CLOUDS, MATCH_RECT, PLAY_VIEW } from '../../clubstadium/layout';
import { createStadiumRegion } from '../../clubstadium/scene';
import { groundRing, mountMinigame } from '../shell';
import { createBar, createMeter } from './hud';
import { buildDrape, buildTowel, buildTowelBox, makeBall, rectFrame, sightCone } from './props';
import {
  award,
  ballAt,
  CHANGE,
  COMBO_WINDOW,
  callOf,
  DURATION,
  emptyTally,
  FEED_MISS,
  FEED_PTS,
  type FeedQ,
  feedQuality,
  inSight,
  LATE_PTS,
  LIVES,
  meterAt,
  meterPeriod,
  meterZone,
  NX,
  netYaw,
  OPEN_GAMES,
  OPEN_SCORE,
  onCourt,
  PENALTY_DELAY,
  PENALTY_PTS,
  POCKET_MAX,
  POCKET_START,
  type PointPlan,
  planPoint,
  RUN,
  retrievePoints,
  returnSpot,
  SERVE_C,
  SERVE_DUR,
  SIGHT,
  STARS,
  STATION,
  STATION_R,
  serveDelay,
  serveSpot,
  settle,
  type Tally,
  towelPoints,
  type V2,
  WINDUP,
  WRONG_TOWEL,
} from './rules';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth01 = (u: number) => {
  const k = clamp(u, 0, 1);
  return k * k * (3 - 2 * k);
};
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return a + d * Math.min(1, k);
};
/** 球员从场上去球员席、换边：网柱和裁判椅之间那一条 */
const WALK_Z = -27.95;
/** 毛巾箱：岗位西边，南看台脚下（比赛的地方外面） */
const BOX: V2 = [-2.9, -13.05];
/** 都就位以后多久开始发球（不算 WINDUP） */
const EARLY = 0.8;
/** 要毛巾以后至少给多久 */
const TOWEL_WIN = 8.5;
/** 没有死球时捡球的互动点放到老远 */
const FAR = new THREE.Vector3(1e4, 0, 1e4);
/** 第一次发球前给多久（读一下画面） */
const FIRST_SERVE = 4.0;

mountMinigame({
  id: 'ballkid',
  title: '球童',
  tag: '小游戏 8 · 中心球场 · 比赛中',
  goal: '表演赛开打了！你是南网柱边的球童：死球捡回来、给发球人递球、换边送毛巾。',
  howto: [
    '一分打完 → 跑去捡死球（点球 / 「捡球」），回到岗位的圈里',
    '顶上的条走完就发球：那时还在场上 = 犯规（−1 ♥）',
    '发球人举手要球：在岗位按住「递球」，绿区松手',
    '换边时：毛巾箱「拿毛巾」→ 递给举手的那位',
  ],
  region: createStadiumRegion,
  clouds: CLOUDS,
  life: false,
  hour: 15.5,
  weather: 'clear',
  start: { start: STATION, yaw: Math.PI },
  // 拉远六成：竖屏 28 米宽，两条底线差不多都在画面里（发球人、死球都看得见）
  zoom: 1.6,
  camera: { lead: { portrait: -6.6, landscape: -6.6 }, dead: [1.5, 12], view: PLAY_VIEW },
  // 只在球场这一圈走（不上看台）
  nav: (n) => ({ ...n, bounds: { x0: -19.5, x1: 19.5, z0: -29.85, z1: -12.25 } }),
  duration: DURATION,
  stars: STARS,
  comboWindow: COMBO_WINDOW,
  setup(mg) {
    const { scene, play, region, ctx } = mg;
    const { objs } = region;
    const D = play.director;
    const ud = D.userData;
    const rng = () => mg.rng(`point:${mg.round}:${pointN}`);

    // ── 场面：比赛中 ──
    for (const id of ['ball', 'kid-net-s']) {
      const o = objs.get(id);
      if (o) o.visible = false;
    }
    for (const id of ['sand-sw', 'sand-nw', 'sand-ne']) objs.get(id)?.userData.setAmount?.(0.12);
    for (const id of ['umbrella-w', 'umbrella-e']) objs.get(id)?.userData.setOpen?.(1);
    const kidIds = ['kid-net-n', 'kid-nw', 'kid-ne', 'kid-sw', 'kid-se'];
    const kids = kidIds.map((id) => objs.get(id)).filter((o): o is THREE.Object3D => !!o);
    for (const k of kids) {
      k.scale.setScalar(1);
      k.userData.setProp?.(null);
      k.userData.pose?.(k.name.includes('net') ? 'bkCrouch' : 'bkStand');
      play.blockPerson(k, 0.3);
    }
    const ump = objs.get('umpire') ?? null;
    ump?.userData.setSeat?.(0.52);
    ump?.userData.pose?.('sit');
    const crowd = objs.get('crowd')?.userData.crowd as
      | {
          setMode(m: 'idle' | 'clap' | 'cheer' | 'wave'): void;
          cheer(s?: number, sec?: number, x?: number, r?: number): void;
          lookAt(p: THREE.Vector3 | null): void;
          fill(f: number, s?: number): void;
        }
      | undefined;
    crowd?.fill(1, 0);
    const board = objs.get('scoreboard') ?? null;
    const benchObjs = [objs.get('bench-w'), objs.get('bench-e')];

    // ── 球员（A、B）──
    interface Pl {
      obj: THREE.Object3D;
      x: number;
      z: number;
      yaw: number;
      walkPh: number;
      readyPh: number;
      path: V2[];
      speed: number;
      /** 走到了以后：站着朝网 / 坐下 */
      arrive: 'net' | 'sit';
      sitting: boolean;
      drape: THREE.Object3D;
    }
    const mkPl = (id: string): Pl => {
      const obj = objs.get(id) as THREE.Object3D;
      obj.userData.setProp?.('racket');
      const drape = buildDrape(ctx);
      drape.visible = false;
      drape.position.set(0, 0.62, 0.12);
      obj.add(drape);
      play.blockPerson(obj, 0.32);
      return {
        obj,
        x: 0,
        z: 0,
        yaw: 0,
        walkPh: 0,
        readyPh: 0,
        path: [],
        speed: 2.4,
        arrive: 'net',
        sitting: false,
        drape,
      };
    };
    const P = [mkPl('player-a'), mkPl('player-b')];
    const seatOf = (i: number): V2 => {
      const b = benchObjs[i];
      const bx = b?.position.x ?? (i ? 2.9 : -2.9);
      const bz = b?.position.z ?? -28.9;
      const seats = b?.userData.seats as [number, number, number][] | undefined;
      const out = i ? 1 : -1;
      const sx = seats ? seats.reduce((m, s) => (s[0] * out < m * out ? s[0] : m), seats[0][0]) : -0.45 * out;
      return [bx + sx, bz + 0.04];
    };
    /** 走过去的路：换半场就从网柱和裁判椅之间绕 */
    const route = (p: Pl, to: V2): V2[] => {
      const s = Math.sign(p.x - NX) || 1;
      const t = Math.sign(to[0] - NX) || 1;
      if (s === t) return [to];
      return [[NX + s * 3, WALK_Z + 0.3], [NX + s * 0.9, WALK_Z], [NX - s * 0.9, WALK_Z], to];
    };
    const benchRoute = (p: Pl, i: number): V2[] => {
      const seat = seatOf(i);
      const front: V2 = [seat[0], seat[1] + 0.62];
      const s = Math.sign(p.x - NX) || 1;
      const pts: V2[] = [[NX + s * 4, WALK_Z + 0.3]];
      if (Math.sign(seat[0] - NX) !== s) pts.push([NX + s * 0.9, WALK_Z], [NX - s * 0.9, WALK_Z]);
      pts.push(front);
      return pts;
    };
    const syncPl = (p: Pl) => {
      p.obj.position.set(p.x, 0, p.z);
      p.obj.rotation.y = p.yaw;
    };
    const standUp = (p: Pl) => {
      p.sitting = false;
      p.obj.userData.setProp?.('racket');
    };

    // ── 球 ──
    const ball = makeBall(ctx, scene); // 这一分的球（打着 → 死球）
    const held = makeBall(ctx, scene); // 总监手里的
    const fed = makeBall(ctx, scene); // 滚给发球人的

    // ── 毛巾箱 + 毛巾 ──
    const box = buildTowelBox(ctx);
    box.position.set(BOX[0], mg.groundAt(BOX[0], BOX[1]), BOX[1]);
    box.rotation.y = 0.15;
    scene.add(box);
    play.addBlocker(() => ({ x: BOX[0], z: BOX[1], r: 0.42 }));
    const boxTop = v3(BOX[0], 0.75, BOX[1]);

    // ── FX：岗位的圈、比赛的地方的边框、视线锥 ──
    const ring = mg.ring(STATION[0], STATION[1], STATION_R, 0xfff3d6);
    const ringMat = ring.material as THREE.MeshBasicMaterial;
    // 脚下一个小圈 = 你（远景里人只有二十来个像素，一堆球童里一眼认出自己）
    const you = groundRing(0.46, 0x7fd0ff, 0.2);
    scene.add(you);
    const frame = rectFrame(MATCH_RECT);
    frame.visible = false;
    scene.add(frame);
    const frameMat = frame.material as THREE.MeshBasicMaterial;
    const cone = sightCone(SIGHT, 30);
    scene.add(cone);
    const stationTop = v3(STATION[0], 0.9, STATION[1]);

    const bar = createBar();
    const meter = createMeter();

    // ── 一局的账 ──
    let round = 0;
    let pointN = 0;
    let tally: Tally = emptyTally();
    let sideA = -1;
    let srv: 0 | 1 = 0;
    let score: [number, number] = [0, 0];
    let games: [number, number] = [0, 0];
    let pocket = POCKET_START;
    let phase: 'ready' | 'rally' | 'change' = 'ready';
    let tServe = Number.POSITIVE_INFINITY;
    let barFrom = 0;
    /** 都就位了、发球人提前发 */
    let ready = false;
    let plan: PointPlan | null = null;
    let decided = false;
    let rallyFoul = false;
    /** 场上的死球 */
    let dead: { tDead: number; win: number } | null = null;
    /** 手里的球（还没送回岗位）：每个记着它那一分的回收窗口 */
    let carry: { tDead: number; win: number; late: boolean }[] = [];
    /** 发球人要球 */
    let feedReq: { who: 0 | 1; at: number } | null = null;
    let feedAskAt = Number.POSITIVE_INFINITY;
    let feedRoll: { from: THREE.Vector3; to: THREE.Vector3; t0: number; t1: number; q: FeedQ; who: 0 | 1 } | null =
      null;
    let metering = false;
    let meterT = 0;
    /** 换边 */
    let change: {
      t0: number;
      t1: number;
      walked: boolean;
      cur: 0 | 1 | null;
      since: number;
      askAt: number;
      done: number;
      n: number;
    } | null = null;
    let changeovers = 0;
    let towel: Item | null = null;
    const level = () => clamp(mg.elapsed / DURATION, 0, 1);
    const deuce = () => (score[0] + score[1]) % 2 === 0;
    const side = (i: 0 | 1) => (i === 0 ? sideA : -sideA);
    const now = () => mg.t;

    /** 兜里几个球：显示在倒计时条上（顶栏留给时间、分、命、连击，四格一排放得下） */
    const setBar = (o: Omit<Parameters<typeof bar.set>[0], 'pocket'>) => bar.set({ ...o, pocket });
    const showBoard = () => board?.userData.setScore?.([[games[0], games[1]]], [ptOf(score[0]), ptOf(score[1])], srv);
    const ptOf = (n: number) => [0, 15, 30, 40][Math.min(3, n)];
    let umpUntil = -1;
    const umpSay = (text: string, sec = 2.0) => {
      if (!ump || !text) return;
      play.say(ump, text, sec, 2.6);
      umpUntil = now() + 1.2;
    };
    const standPt = (x: number, row: number) => v3(x, 1.6 + row * 0.9, -31 - row * 1.2);
    const boo = () => {
      crowd?.setMode('idle');
      const r = mg.rng(`boo:${mg.round}:${tally.fouls}`);
      for (let i = 0; i < 4; i++) mg.pop(standPt(-9 + r() * 18, Math.floor(r() * 4)), '嘘—', { color: 'red' });
    };
    const lose = (why: string, toast: string) => {
      tally.fouls++;
      tally.lives = Math.max(0, tally.lives - 1);
      mg.setLives(tally.lives, LIVES);
      mg.comboBreak();
      mg.addScore(-PENALTY_PTS, D.position.clone().setY(D.position.y + 2.2), {
        text: `−${PENALTY_PTS} ${why}`,
        color: 'red',
        big: true,
      });
      mg.toast(toast, 2.2, true);
      umpSay('请安静！', 2.4);
      boo();
      if (tally.lives <= 0) mg.finish('三次犯规 · 被换下场');
    };
    const dpos = (): V2 => [D.position.x, D.position.z];
    const atStation = () => Math.hypot(D.position.x - STATION[0], D.position.z - STATION[1]) <= STATION_R;
    const serverSpot = () => serveSpot(side(srv), deuce());

    // ── 标记（id → 移除函数）──
    const marks = new Map<string, () => void>();
    const mark = (
      id: string,
      on: boolean,
      at: () => THREE.Vector3 | null,
      opts: { label?: string; color?: string },
    ) => {
      if (on && !marks.has(id)) marks.set(id, mg.marker(id, at, opts));
      else if (!on && marks.has(id)) {
        marks.get(id)?.();
        marks.delete(id);
      }
    };
    const clearMarks = () => {
      for (const f of marks.values()) f();
      marks.clear();
    };
    const head = (o: THREE.Object3D) => () => v3(o.position.x, o.position.y + 2.0, o.position.z);
    const ballV = new THREE.Vector3();
    const deadAt = () => (dead && ball.obj.visible ? ballV.copy(ball.obj.position).setY(0.35) : null);

    // ── 捡球（死球上的互动点：动作键；点球 = 走过去自动捡）──
    play.add({
      id: 'deadball',
      at: () => (dead ? ball.obj.position : FAR),
      radius: 0.95,
      priority: 3,
      label: () => (mg.state === 'playing' && dead && decided ? '捡球' : ''),
      canUse: () => mg.state === 'playing' && !!dead && decided,
      onUse: (p) => {
        const r = round;
        p.busy({
          name: 'pickball',
          dur: 0.42,
          pose: 'pickup',
          face: ball.obj.position.clone(),
          mid: () => {
            if (r !== round || !dead) return;
            carry.push({ tDead: dead.tDead, win: dead.win, late: false });
            dead = null;
            ball.set(null);
            mg.pop(D.position.clone().setY(1.8), '拿到了 → 回岗位', { color: 'cream' });
          },
        });
      },
    });

    // ── 递球（岗位上：按住出准星，松手出手）──
    const feedLabel = () =>
      mg.state === 'playing' && feedReq && !feedRoll && phase !== 'rally' ? (pocket > 0 ? '递球' : '') : '';
    play.add({
      id: 'feed',
      at: () => stationTop,
      radius: STATION_R + 0.05,
      priority: 4,
      noMark: true,
      label: () => feedLabel(),
      canUse: () => !!feedLabel() && atStation(),
      onUse: () => {
        metering = true;
        meterT = 0;
      },
      onHold: (dt) => {
        if (!metering) return false;
        meterT += dt;
        return true;
      },
      onRelease: (p) => {
        if (!metering) return;
        metering = false;
        const req = feedReq;
        if (!req || feedRoll || pocket <= 0 || mg.state !== 'playing') return;
        const q = feedQuality(meterAt(meterT, meterPeriod(level())), meterZone(level()));
        const target = P[req.who];
        const r = round;
        pocket--;
        p.busy({
          name: 'roll',
          dur: 0.75,
          pose: 'bkRoll',
          face: target.obj.position.clone(),
          mid: () => {
            if (r !== round) return;
            const from = (ud.rollPoint?.() as THREE.Vector3 | undefined)?.clone() ?? D.position.clone().setY(0.1);
            from.y = 0.12;
            // 落点：他脚前 0.4 米（朝岗位那边），歪了往横里偏、长了往后滚
            const tx = target.x;
            const tz = target.z;
            const dx = from.x - tx;
            const dz = from.z - tz;
            const L = Math.hypot(dx, dz) || 1;
            const miss = FEED_MISS[q];
            const r2 = mg.rng(`feed:${mg.round}:${pointN}`);
            const lat = (r2() < 0.5 ? -1 : 1) * miss * 0.8;
            const along = q === 'poor' ? -miss * 0.6 : 0.4;
            const to = v3(tx + (dx / L) * along + (-dz / L) * lat, 0.12, tz + (dz / L) * along + (dx / L) * lat);
            const T = 0.35 + Math.hypot(to.x - from.x, to.z - from.z) / 8.5;
            feedRoll = { from, to, t0: now(), t1: now() + T, q, who: req.who };
            // 球滚到之前别发球
            tServe = Math.max(tServe, now() + T + (q === 'perfect' ? 0.6 : q === 'good' ? 1.4 : 2.6));
          },
        });
      },
    });

    // ── 毛巾：箱子拿、递给举手的那位 ──
    const towelWanted = () => mg.state === 'playing' && !!change && change.cur !== null;
    const holdingTowel = () => play.held()?.id === 'towel';
    /**
     * 球童是跑着干活的：手里一直"拿着"一个看不见的东西，只为了它的 carrySpeed（play 默认 3.4 米/秒是总监散步的速度，
     * 壳不让改；毛巾也一样快）。拿毛巾时先收起来，递完再拿回来。
     */
    const sprint = play.addItem({
      id: 'sprint',
      name: '跑',
      obj: new THREE.Group(),
      droppable: false,
      carrySpeed: RUN,
    });
    const wearSprint = () => {
      if (!play.held()) play.give(sprint);
    };
    play.add({
      id: 'towel-box',
      at: () => boxTop,
      radius: 1.25,
      priority: 2,
      label: () => (towelWanted() && !holdingTowel() ? '拿毛巾' : ''),
      canUse: () => towelWanted() && !holdingTowel(),
      onUse: (p) => {
        const r = round;
        p.busy({
          name: 'towel',
          dur: 0.45,
          pose: 'pickup',
          face: boxTop,
          mid: () => {
            if (r !== round || !towelWanted()) return;
            if (p.held() === sprint) p.take()?.stow(scene);
            towel = p.addItem({ id: 'towel', name: '毛巾', obj: buildTowel(ctx), droppable: false, carrySpeed: RUN });
            p.give(towel);
          },
        });
      },
    });
    /** 递毛巾（动作键，同捡球、递球：一个大按钮干所有的活） */
    const giveTowel = (i: 0 | 1, p: Play) => {
      const c = change;
      const pl = P[i];
      if (!c || !holdingTowel()) return;
      if (c.cur !== i) {
        tally.towelWrong++;
        mg.comboBreak();
        mg.addScore(-WRONG_TOWEL, pl.obj.position.clone().setY(2.0), { text: `−${WRONG_TOWEL} 不是我`, color: 'red' });
        play.say(pl.obj, '不是我…', 1.6);
        return;
      }
      p.take()?.remove();
      wearSprint();
      towel = null;
      pl.drape.visible = true;
      const spare = clamp((c.t1 - now()) / (c.t1 - c.since), 0, 1);
      const pts = towelPoints(spare);
      tally.towels++;
      const combo = mg.comboHit();
      tally.bestCombo = Math.max(tally.bestCombo, combo);
      mg.addScore(pts, pl.obj.position.clone().setY(2.2), { text: `+${pts} 毛巾`, color: 'green', big: true });
      play.say(pl.obj, '谢谢！', 1.6);
      play.bubble('towel', null);
      c.cur = null;
      c.done++;
      // 第二次换边起：另一位也要
      if (c.n >= 2 && c.done === 1 && c.t1 - now() > 5) c.askAt = now() + 0.8;
    };
    ([0, 1] as const).forEach((i) => {
      const pl = P[i];
      const chest = new THREE.Vector3();
      play.add({
        id: `towel-p${i}`,
        at: () => chest.set(pl.x, pl.sitting ? 1.0 : 1.3, pl.z),
        radius: 1.45,
        priority: 3,
        label: () => (holdingTowel() && change && pl.sitting ? '递毛巾' : ''),
        canUse: () => holdingTowel() && !!change && pl.sitting,
        onUse: (p) => {
          const r = round;
          p.busy({
            name: 'give',
            dur: 0.4,
            pose: 'pickup',
            face: pl.obj.position.clone(),
            mid: () => {
              if (r === round) giveTowel(i, p);
            },
          });
        },
      });
    });

    // ── 发球、一分、换边 ──
    const toSpots = () => {
      const dz = deuce();
      for (const i of [0, 1] as const) {
        const p = P[i];
        const to = i === srv ? serveSpot(side(i), dz) : returnSpot(side(i), dz);
        p.path = route(p, to);
        p.speed = 2.6;
        p.arrive = 'net';
      }
    };
    const playersReady = () => P.every((p) => !p.path.length && !p.sitting);
    const startPoint = () => {
      pointN++;
      decided = false;
      rallyFoul = false;
      ready = false;
      dead = null;
      plan = planPoint(rng(), { t0: now(), srv, sideA, deuce: deuce(), level: level() });
      phase = 'rally';
      cone.visible = false;
      // 两个人都在站位上（还在走的贴过去）
      for (const i of [0, 1] as const) {
        const p = P[i];
        const to = i === srv ? serveSpot(side(i), deuce()) : returnSpot(side(i), deuce());
        p.path = [];
        p.x = to[0];
        p.z = to[1];
      }
      crowd?.setMode('idle');
    };
    /** 发球那一刻：人在场上 = 犯规（发球推迟）；场上还躺着的死球 = 漏了（别的球童捡走）；要球没递 = 别人递了 */
    const serveCheck = (): boolean => {
      const [x, z] = dpos();
      if (onCourt(x, z)) {
        lose('在场上', '发球了还在场上！');
        tServe = now() + PENALTY_DELAY;
        barFrom = now();
        return false;
      }
      if (feedRoll) {
        tServe = feedRoll.t1 + 0.8;
        return false;
      }
      if (dead) {
        tally.missed++;
        mg.comboBreak();
        mg.pop(ball.obj.position.clone().setY(0.9), '漏了 · 别的球童捡走', { color: 'red' });
        dead = null;
        ball.set(null);
      }
      if (feedReq) {
        tally.feedMissed++;
        mg.comboBreak();
        play.bubble('feed', null);
        play.say(P[feedReq.who].obj, '…', 1.2);
        feedReq = null;
      }
      for (const c of carry) c.late = true;
      return true;
    };
    const decide = () => {
      if (!plan) return;
      decided = true;
      const pl = plan;
      tally.points++;
      const w = pl.winner;
      const res = award(score, w);
      score = res.score;
      const good = pl.end !== 'net' && !pl.out && pl.shots >= 3;
      if (crowd) {
        crowd.setMode('clap');
        if (good || pl.end === 'stands') crowd.cheer(1, 2.2);
      }
      clapUntil = now() + 2.4;
      if (pl.end === 'stands') mg.toast('球飞上看台了 · 发球人要球', 2.0);
      const call = pl.end === 'net' ? '球网' : pl.out ? '出界' : '';
      if (call) umpSay(call, 1.2);
      // 死球
      const win = serveDelay(pl, level());
      if (pl.rest) dead = { tDead: now(), win };
      else dead = null;
      if (res.game) {
        games[w]++;
        srv = srv === 0 ? 1 : 0;
        showBoard();
        setTimeout0(() => umpSay(`局，${games[0]}–${games[1]} · 换边`, 2.4), 1.3);
        changeovers++;
        const t0 = Math.max(now() + 2.2, pl.tRest + 0.6);
        change = { t0, t1: t0 + CHANGE, walked: false, cur: null, since: 0, askAt: t0 + 6, done: 0, n: changeovers };
        tServe = change.t1 + 4.5;
        barFrom = now();
        if (dead) dead.win = tServe - now();
      } else {
        showBoard();
        setTimeout0(() => umpSay(callOf(score, srv)), 1.3);
        tServe = now() + win;
        barFrom = now();
        if (pl.feed) feedAskAt = now() + (pl.rest ? 1.2 : 0.8);
      }
    };
    // 模拟时间里的"过一会儿"（不用 setTimeout：?pause、__mg.step 都得对）
    const later: { at: number; fn: () => void; r: number }[] = [];
    const setTimeout0 = (fn: () => void, sec: number) => later.push({ at: now() + sec, fn, r: round });
    let clapUntil = -1;

    // ── 球员每步 ──
    const walkPl = (p: Pl, dt: number) => {
      const [tx, tz] = p.path[0];
      const dx = tx - p.x;
      const dz = tz - p.z;
      const L = Math.hypot(dx, dz);
      const step = p.speed * dt;
      if (L <= step) {
        p.x = tx;
        p.z = tz;
        p.path.shift();
        if (!p.path.length && p.arrive === 'sit') {
          p.sitting = true;
          p.obj.userData.setProp?.(null);
          p.obj.userData.pose?.('sit');
        }
      } else {
        p.x += (dx / L) * step;
        p.z += (dz / L) * step;
        p.yaw = turnTo(p.yaw, Math.atan2(dx, dz), dt * 10);
      }
      p.walkPh = (p.walkPh + step / setStride(p.obj, 1.2)) % 1;
      p.obj.userData.pose?.('walk', p.walkPh);
    };
    const drivePlan = (i: 0 | 1, dt: number) => {
      const pl = plan as PointPlan;
      const p = P[i];
      const t = now();
      let mv = null;
      for (const m of pl.moves) if (m.who === i && m.t0 <= t) mv = m;
      const px = p.x;
      const pz = p.z;
      if (mv) {
        const u = smooth01((t - mv.t0) / Math.max(1e-3, mv.t1 - mv.t0));
        p.x = mv.from[0] + (mv.to[0] - mv.from[0]) * u;
        p.z = mv.from[1] + (mv.to[1] - mv.from[1]) * u;
      }
      const sp = Math.hypot(p.x - px, p.z - pz) / Math.max(dt, 1e-4);
      const sw = pl.swings.find((s) => s.who === i && t >= s.t0 && t < s.t0 + s.dur);
      const ny = netYaw(side(i));
      if (sw) {
        p.yaw = turnTo(p.yaw, ny, dt * 22);
        p.obj.userData.pose?.(sw.name, Math.min(0.995, (t - sw.t0) / sw.dur));
      } else if (sp > 0.7) {
        p.yaw = turnTo(p.yaw, ny, dt * 10);
        p.walkPh = (p.walkPh + (sp * dt) / 1.6) % 1;
        p.obj.userData.pose?.('walk', p.walkPh);
      } else {
        p.yaw = turnTo(p.yaw, ny, dt * 10);
        p.readyPh = (p.readyPh + dt / 0.55) % 1;
        p.obj.userData.pose?.('ready', p.readyPh);
      }
    };
    const stepPlayers = (dt: number) => {
      const t = now();
      const planOn = phase === 'rally' && plan && t < plan.tDead + 0.9;
      for (const i of [0, 1] as const) {
        const p = P[i];
        if (planOn) drivePlan(i, dt);
        else if (p.path.length) walkPl(p, dt);
        else if (p.sitting) {
          p.yaw = 0;
          p.x = seatOf(i)[0];
          p.z = seatOf(i)[1];
        } else {
          p.yaw = turnTo(p.yaw, netYaw(side(i)), dt * 8);
          if (i === srv && phase === 'ready') p.obj.userData.pose?.('idle', (((t * 0.5) % 1) + 1) % 1);
          else {
            p.readyPh = (p.readyPh + dt / 0.9) % 1;
            p.obj.userData.pose?.('ready', p.readyPh);
          }
        }
        syncPl(p);
      }
    };

    // ── 每步：比赛的时间轴 ──
    const stepMatch = (dt: number) => {
      const t = now();
      for (let i = later.length - 1; i >= 0; i--)
        if (later[i].at <= t) {
          const l = later.splice(i, 1)[0];
          if (l.r === round) l.fn();
        }
      if (crowd && clapUntil > 0 && t > clapUntil) {
        clapUntil = -1;
        crowd.setMode('idle');
      }

      // 一分进行中
      if (phase === 'rally' && plan) {
        ball.set(!decided || dead || (plan.end === 'stands' && t < plan.tRest) ? ballAt(plan.segs, t) : null);
        // 发球前的视线 + 比赛中进场
        const [x, z] = dpos();
        const contact = plan.swings[0].t0 + SERVE_C * SERVE_DUR;
        if (t < contact && play.state().speed > 0.4 && inSight(serverSpot(), side(srv), [x, z])) {
          // 发球前走到他眼前：这一分作废重来
          lose('挡视线', '挡住发球人的视线了！');
          ball.set(null);
          phase = 'ready';
          plan = null;
          tServe = t + PENALTY_DELAY;
          barFrom = t;
          toSpots();
          return;
        }
        if (!decided && !rallyFoul && onCourt(x, z)) {
          rallyFoul = true;
          lose('进场', '比赛中别进场！');
        }
        if (!decided && t >= plan.tDead) decide();
        if (decided && t >= plan.tDead + 0.9) {
          phase = change && change.t0 > t - 5 ? 'change' : 'ready';
          if (phase === 'ready') toSpots();
        }
      } else if (dead && plan) {
        ball.set(ballAt(plan.segs, t));
      }

      // 换边
      if (change) {
        const c = change;
        if (!c.walked && t >= c.t0) {
          c.walked = true;
          phase = 'change';
          crowd?.setMode('idle');
          P.forEach((p, i) => {
            p.path = benchRoute(p, i);
            p.speed = 3.2;
            p.arrive = 'sit';
          });
        }
        // 都坐下了才要（第一次：坐下 0.6 秒后）
        if (c.walked && c.done === 0 && c.cur === null && c.askAt > 0 && P.every((p) => p.sitting))
          c.askAt = Math.min(c.askAt, t + 0.6);
        if (c.walked && c.cur === null && t >= c.askAt && c.askAt > 0 && t < c.t1 - 1.5) {
          const who: 0 | 1 = c.done === 0 ? (mg.rng(`towel:${mg.round}:${c.n}`)() < 0.5 ? 0 : 1) : c.cur === 0 ? 1 : 0;
          const want: 0 | 1 = c.done === 0 ? who : P[0].drape.visible ? 1 : 0;
          if (P[want].sitting) {
            c.cur = want;
            c.since = t;
            c.askAt = -1;
            // 要了以后至少留 TOWEL_WIN 秒（跑过去、递、跑回来）
            if (c.t1 - t < TOWEL_WIN) {
              c.t1 = t + TOWEL_WIN;
              tServe = Math.max(tServe, c.t1 + 4.5);
            }
            play.bubble('towel', P[want].obj, '毛巾！', 1.7);
            mg.toast('换边 · 拿毛巾递给举手的那位', 2.2);
          }
        }
        if (t >= c.t1) {
          if (c.cur !== null) {
            tally.towelMissed++;
            mg.comboBreak();
            play.say(P[c.cur].obj, '算了…', 1.4);
          }
          play.bubble('towel', null);
          if (holdingTowel()) play.take()?.remove();
          wearSprint();
          towel = null;
          sideA = -sideA;
          change = null;
          for (const p of P) {
            standUp(p);
            p.drape.visible = false;
          }
          phase = 'ready';
          toSpots();
          // 从球员席走：先到席前
          P.forEach((p, i) => {
            const seat = seatOf(i);
            p.path.unshift([seat[0], seat[1] + 0.62]);
            p.speed = 3.6;
          });
          barFrom = t;
        }
      }

      // 要球
      if (!feedReq && t >= feedAskAt && phase !== 'rally') {
        feedAskAt = Number.POSITIVE_INFINITY;
        feedReq = { who: srv, at: t };
        play.bubble('feed', P[srv].obj, '要球 ✋', 2.15);
      }
      // 滚过去的球
      if (feedRoll) {
        const f = feedRoll;
        const k = clamp((t - f.t0) / (f.t1 - f.t0), 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        fed.set([f.from.x + (f.to.x - f.from.x) * e, 0.12, f.from.z + (f.to.z - f.from.z) * e]);
        if (k >= 1) {
          fed.set(null);
          feedRoll = null;
          feedReq = null;
          play.bubble('feed', null);
          const pts = FEED_PTS[f.q];
          tally.feeds++;
          const pl = P[f.who];
          if (f.q === 'perfect') {
            tally.perfectFeeds++;
            const combo = mg.comboHit();
            tally.bestCombo = Math.max(tally.bestCombo, combo);
            play.say(pl.obj, '好球！', 1.4);
          } else if (f.q === 'poor') {
            mg.comboBreak();
            play.say(pl.obj, '…', 1.2);
            // 他自己走过去捡
            const back: V2 = [pl.x, pl.z];
            if (!pl.path.length) {
              pl.path = [[f.to.x, f.to.z], back];
              pl.speed = 2.2;
              pl.arrive = 'net';
            }
          }
          const label = f.q === 'perfect' ? '正好' : f.q === 'good' ? '还行' : '偏了';
          mg.addScore(pts, pl.obj.position.clone().setY(2.1), {
            text: `+${pts} ${label}`,
            color: f.q === 'poor' ? 'cream' : 'green',
            big: f.q === 'perfect',
          });
        }
      }

      // 发球：倒计时走完
      if (phase === 'ready' && Number.isFinite(tServe)) {
        // 还有人没走到站位：等一等
        if (!playersReady() && tServe - t < WINDUP) tServe = t + WINDUP;
        // 都收拾好了（没有死球、手里没球、没人要球、人在岗位上）：发球人不等了，马上发 —— 回得快 = 这一局多打几分
        else if (
          !dead &&
          !carry.length &&
          !feedReq &&
          !feedRoll &&
          !metering &&
          pointN > 0 &&
          atStation() &&
          playersReady() &&
          tServe - t > WINDUP + EARLY
        ) {
          tServe = t + WINDUP + EARLY;
          ready = true;
        }
        const windup = tServe - t <= WINDUP;
        if (windup) {
          const ss = serverSpot();
          const [x, z] = dpos();
          if (play.state().speed > 0.4 && inSight(ss, side(srv), [x, z])) {
            lose('挡视线', '挡住发球人的视线了！');
            tServe = t + PENALTY_DELAY;
            barFrom = t;
          }
        }
        if (t >= tServe && serveCheck()) startPoint();
      }

      // 回到岗位：交球
      if (carry.length && atStation()) {
        for (const c of carry) {
          if (c.late) {
            tally.late++;
            mg.addScore(LATE_PTS, stationTop.clone().setY(1.9), { text: `+${LATE_PTS} 慢了`, color: 'cream' });
          } else {
            const spare = clamp((c.tDead + c.win - t) / c.win, 0, 1);
            const combo = mg.comboHit();
            tally.bestCombo = Math.max(tally.bestCombo, combo);
            const pts = retrievePoints(spare, combo);
            tally.clean++;
            mg.addScore(pts, stationTop.clone().setY(1.9), {
              text: combo >= 2 ? `+${pts} ×${combo}` : `+${pts}`,
              color: spare > 0.45 ? 'green' : undefined,
              big: spare > 0.45,
            });
          }
          pocket = Math.min(POCKET_MAX, pocket + 1);
        }
        carry = [];
      }
      stepPlayers(dt);
    };

    // ── 每步（任何状态）：总监在岗位上蹲着、手里的球、看球的人、视线锥、圈的颜色、标记、条 ──
    const look = new THREE.Vector3();
    mg.onStep((_dt, t) => {
      const s = play.state();
      you.position.set(D.position.x, D.position.y + 0.035, D.position.z);
      if (atStation() && s.speed < 0.05 && !s.busy && !s.holding && !holdingTowel())
        ud.pose?.('bkCrouch', (((t / 2.4) % 1) + 1) % 1);
      if (carry.length) {
        const hp = (ud.handPoint?.('R') as THREE.Vector3 | undefined) ?? D.position.clone().setY(0.9);
        held.set(hp, D.position.y + 0.024);
      } else held.set(null);
      // 看球
      const b = ball.obj.visible ? ball.obj.position : fed.obj.visible ? fed.obj.position : null;
      if (b) look.copy(b);
      crowd?.lookAt(b && phase === 'rally' ? look : null);
      for (const k of kids) k.userData.lookAt?.(b ? look : null);
      if (ump) {
        ump.userData.lookAt?.(b ? look : null);
        if (t < umpUntil) ump.userData.pose?.('call', clamp(1 - (umpUntil - t) / 1.2, 0, 1) * 0.9);
        else if (umpUntil > 0) {
          umpUntil = -1;
          ump.userData.pose?.('sit');
        }
      }
    });

    mg.onFrame(() => {
      const t = now();
      const playing = mg.state === 'playing';
      // 视线锥 + 场地边框：发球前、比赛中
      const windup = playing && phase === 'ready' && tServe - t <= WINDUP + 0.6;
      const rally = playing && phase === 'rally' && !decided;
      const ss = serverSpot();
      cone.visible = windup || (rally && !!plan && t < plan.swings[0].t0 + SERVE_DUR * SERVE_C);
      if (cone.visible) {
        cone.position.set(ss[0], 0.045, ss[1]);
        cone.rotation.y = side(srv) > 0 ? Math.PI : 0;
      }
      frame.visible = windup || rally || (playing && phase === 'ready' && tServe - t < 3.5);
      frameMat.opacity = 0.45 + 0.4 * (Math.floor(t * 4) % 2);
      // 圈：拿着球 = 金，能递球 = 绿
      ringMat.color.set(carry.length ? 0xffd23c : feedReq && pocket > 0 ? 0x8fe36a : 0xfff3d6);
      // 标记
      mark('ball', playing && !!deadAt() && decided, deadAt, { label: '捡球', color: '#8fe36a' });
      mark('home', playing && carry.length > 0 && !atStation(), () => stationTop, { label: '回岗位' });
      mark('feed', playing && !!feedReq && !feedRoll, () => (feedReq ? head(P[feedReq.who].obj)() : null), {
        label: '要球',
        color: '#7fd0ff',
      });
      mark('box', playing && towelWanted() && !holdingTowel(), () => boxTop, { label: '毛巾箱', color: '#fff3d6' });
      mark(
        'towelTo',
        playing && towelWanted() && holdingTowel(),
        () => (change && change.cur !== null ? head(P[change.cur].obj)() : null),
        {
          label: '递给他',
          color: '#8fe36a',
        },
      );
      // 准星
      meter.set(metering ? meterAt(meterT, meterPeriod(level())) : null, meterZone(level()));
      // 条
      bar.show(playing);
      if (!playing) return;
      if (phase === 'rally' && !decided) setBar({ say: '比赛中 · 待在场外', left: null, frac: null, tone: 'rally' });
      else if (phase === 'change' && change) {
        const say =
          change.cur === null ? '换边休息' : holdingTowel() ? '毛巾 → 递给举手的那位' : '换边 · 去毛巾箱拿毛巾';
        setBar({
          say,
          left: change.t1 - t,
          frac: (change.t1 - t) / Math.max(1, change.t1 - change.t0),
          tone: 'change',
        });
      } else if (Number.isFinite(tServe)) {
        const left = tServe - t;
        const win = Math.max(0.5, tServe - barFrom);
        let say = '待在岗位';
        if (left <= WINDUP) say = '发球！别动 · 别进场';
        else if (carry.length) say = '回岗位！';
        else if (dead) say = '捡球！';
        else if (feedReq && !feedRoll) say = pocket > 0 ? (atStation() ? '按住「递球」' : '回岗位递球') : '手里没球了';
        else if (onCourt(...dpos())) say = '快出场！';
        else if (ready) say = '就位 ✓ 马上发球';
        else if (pointN === 0) say = '准备 · 第一分';
        setBar({ say, left, frac: left / win, tone: left <= WINDUP ? 'serve' : '' });
      }
    });

    return {
      reset() {
        round++;
        pointN = 0;
        tally = emptyTally();
        sideA = -1;
        srv = 0;
        score = [OPEN_SCORE[0], OPEN_SCORE[1]];
        games = [OPEN_GAMES[0], OPEN_GAMES[1]];
        pocket = POCKET_START;
        phase = 'ready';
        tServe = Number.POSITIVE_INFINITY;
        barFrom = now();
        ready = false;
        plan = null;
        decided = false;
        dead = null;
        carry = [];
        feedReq = null;
        feedAskAt = Number.POSITIVE_INFINITY;
        feedRoll = null;
        metering = false;
        change = null;
        changeovers = 0;
        later.length = 0;
        if (holdingTowel()) play.take()?.remove();
        wearSprint();
        towel = null;
        play.bubble('towel', null);
        play.bubble('feed', null);
        ball.set(null);
        held.set(null);
        fed.set(null);
        clearMarks();
        crowd?.setMode('idle');
        for (const i of [0, 1] as const) {
          const p = P[i];
          const to = i === srv ? serveSpot(side(i), deuce()) : returnSpot(side(i), deuce());
          p.x = to[0];
          p.z = to[1];
          p.yaw = netYaw(side(i));
          p.path = [];
          standUp(p);
          p.drape.visible = false;
          syncPl(p);
          p.obj.userData.pose?.('ready', 0.3);
        }
        mg.setLives(LIVES, LIVES);
        showBoard();
      },
      start() {
        tServe = now() + FIRST_SERVE;
        barFrom = now();
        umpSay('比赛开始', 2.0);
      },
      step(dt) {
        stepMatch(dt);
      },
      finish(reason) {
        clearMarks();
        metering = false;
        meter.set(null);
        bar.show(false);
        cone.visible = false;
        frame.visible = false;
        void reason;
        return settle(tally);
      },
      debug: () => ({
        phase,
        pointN,
        tServe: +(tServe - now()).toFixed(2),
        decided,
        dead: dead ? [+ball.obj.position.x.toFixed(2), +ball.obj.position.z.toFixed(2)] : null,
        rest: plan?.rest ?? null,
        end: plan?.end ?? null,
        carry: carry.length,
        pocket,
        feedReq: feedReq ? feedReq.who : null,
        feedRolling: !!feedRoll,
        metering,
        meter: +meterAt(meterT, meterPeriod(level())).toFixed(3),
        zone: meterZone(level()),
        atStation: atStation(),
        onCourt: onCourt(...dpos()),
        windup: phase === 'ready' && tServe - now() <= WINDUP,
        server: serverSpot(),
        serverSide: side(srv),
        change: change
          ? {
              cur: change.cur,
              left: +(change.t1 - now()).toFixed(2),
              walked: change.walked,
              sitting: P.map((p) => p.sitting),
            }
          : null,
        players: P.map((p) => [+p.x.toFixed(2), +p.z.toFixed(2)]),
        match: score,
        games,
        tally,
      }),
    };
  },
});
