// 分图里总监的活（第三轮 · 人和活，第 2 轮）。按图的数据驱动：读 MapDef.spots 的 id（world 代理填的站位）和摆件，不认图的 id——
// 别的图上只要有同名的站位 / 摆件就自动有这件活：
//   spot 'net-post-*'       拉网：比赛场（有裁判椅）赛前 50 分钟里每场一次；别的场隔 3 个钟头一次。按住动作键摇 2.4 秒
//   spot 'baseline-sweep'   拖场：比赛场两场之间（上一场打完、下一场没开始）扫一遍底线后的沙。按住扫 4 秒
//   spot 'water*'           换水：饮水桶隔 2 个钟头空一次。按住倒 2 秒
//   spot 'pool-towels'      补毛巾：隔 2.5 个钟头一次。点一下
//   摆件 'ball-machine'      练习场：学员打出去的球一簇簇落在场上（隔 35 分钟一簇，最多 3 簇）→ 点一簇捡起来；手里有球 → 发球机那儿"补球"
// 有活的时候，那个地方头上一个心情泡（网松了 / 场地有沙 / 水桶空了……：clubsite/hud 的图标按字挑），一眼看得出哪儿要干活。
// 干完：上方一行字 + 金币、原地冒"+$n"；钱记进演员表（clubsite/cast 的 earn）。sandbox 演出，不假装有完整的经济。
// 时间只看游戏时钟（换图回来、时钟跳了照样对）；随机只用种子哈希（球落在哪）。
import * as THREE from 'three';
import { build as buildBalls } from '../clubsite/assets/tennis-ball';
import { CAST, matchWindows } from '../clubsite/cast';
import { hashOf, mulberry32 } from '../clubsite/cast/rng';
import type { Play } from '../clubsite/play';
import type { BuiltMap, Kit } from './build';
import { type LifeTextKey, lt } from './life-text';
import type { Prop, Spot } from './mapdef';
import { CAST_SCENE } from './text';

export interface ChoreCtx {
  built: readonly BuiltMap[];
  kit: Kit;
  play: Play;
  director: THREE.Object3D;
  cur(): BuiltMap;
  clock(): { day: number; minute: number };
  /** 干完一件活：钱、上方一行字、原地冒数 */
  reward(text: LifeTextKey, money: number, at: THREE.Vector3, minutes?: number): void;
  /** 叫这张图上一个闲着的人过来，在 (x, z) 朝 yaw 摆 pose 待 sec 秒（补完发球机：有人来对着练）；没人闲着 = false */
  callOver?(
    b: BuiltMap,
    x: number,
    z: number,
    yaw: number,
    sec: number,
    pose: { pose: string; prop?: string | null },
  ): boolean;
}

interface Due {
  /** 这件活现在能不能干（返回这一轮的键；同一个键干过就不再出） */
  key(day: number, minute: number): string | null;
}

/** 隔 every 分钟出一次（从 7 点起；错过的不攒） */
const every =
  (mins: number, from = 7 * 60): Due['key'] =>
  (day, m) =>
    m < from || m >= 21 * 60 ? null : `${day}:${Math.floor((m - from) / mins)}`;

export function mountChores(o: ChoreCtx): { step(dt: number): void; debug(): unknown } {
  const { play } = o;
  const doneKeys = new Set<string>();
  const steppers: ((dt: number) => void)[] = [];
  const count: Record<string, number> = {};
  const isMatchCourt = (b: BuiltMap) =>
    b.def.props.some((p) => p.a === 'umpire-chair') && CAST_SCENE[b.def.id] === 'clubstadium';

  /** 一件站位上的活：心情泡 + 互动点（按住 hold 秒，或者点一下） */
  function spotChore(
    b: BuiltMap,
    sp: Spot,
    c: {
      id: string;
      due: Due['key'];
      ask: LifeTextKey;
      label: LifeTextKey;
      done: LifeTextKey;
      money: number;
      /** 花几分钟（游戏时间） */
      minutes: number;
      pose: string;
      hold?: number;
      prop?: string;
      /** 画面上看得出活和进度（网松着 → 越摇越紧，沙子越扫越少）：每步调，due = 有这件活，k = 干到几成（0..1） */
      show?(due: boolean, k: number): void;
    },
  ) {
    const at = new THREE.Vector3(sp.at[0] + b.ox, b.groundAt(sp.at[0], sp.at[1]) + 0.9, sp.at[1]);
    const bubbleAt = at.clone().setY(at.y + 0.4);
    const key = () => {
      const t = o.clock();
      const k = c.due(t.day, t.minute);
      return k && !doneKeys.has(`${c.id}|${k}`) ? k : null;
    };
    let progress = 0;
    const finish = () => {
      const k = key();
      if (!k) return;
      doneKeys.add(`${c.id}|${k}`);
      count[c.id] = (count[c.id] ?? 0) + 1;
      play.bubble(`chore:${c.id}`, null);
      o.reward(c.done, c.money, at, c.minutes);
    };
    const setTool = (on: boolean) => {
      if (c.prop && !play.held()) o.director.userData.setProp?.(on ? c.prop : null);
    };
    play.add({
      id: `chore:${c.id}`,
      at: () => at,
      radius: 1.8,
      stand: () => [sp.at[0] + b.ox, sp.at[1]],
      label: () => (o.cur() === b && key() ? lt(c.label) : ''),
      canUse: () => o.cur() === b && !!key() && !play.held(),
      pose: c.pose,
      holdSpeed: 0,
      autoUse: !c.hold,
      ...(c.hold
        ? {
            onHold: (dt: number) => {
              setTool(true);
              progress += dt;
              if (progress >= (c.hold as number)) {
                progress = 0;
                setTool(false);
                finish();
                return false;
              }
              return true;
            },
            onRelease: () => {
              setTool(false);
            },
          }
        : {
            onUse: (pl: Play) => pl.busy({ name: c.id, dur: 0.9, pose: c.pose, face: [at.x, at.z], mid: finish }),
          }),
    });
    let shown = false;
    let lastKey: string | null = null;
    steppers.push(() => {
      const k0 = key();
      // 新的一轮：进度清零（上一轮干到一半没干完的不带过来）
      if (k0 !== lastKey) progress = 0;
      lastKey = k0;
      if (o.cur() === b) c.show?.(!!k0, c.hold ? Math.min(1, progress / c.hold) : 0);
      const on = o.cur() === b && !!k0;
      if (on && !shown) play.bubble(`chore:${c.id}`, bubbleAt, lt(c.ask), 0);
      if (!on && shown) play.bubble(`chore:${c.id}`, null);
      shown = on;
    });
  }

  /** 网：离站位最近的那张网（摆件 'net'）。有活 = 松着垂下来，摇的时候一点点绷紧（clubsite/assets/nets 的 setTension / setCrank） */
  function netShow(b: BuiltMap, sp: Spot): ((due: boolean, k: number) => void) | undefined {
    let best: THREE.Object3D | null = null;
    let bd = 12;
    for (const pl of b.placed) {
      if (pl.prop.a !== 'net') continue;
      const d = Math.hypot(pl.prop.x - sp.at[0], pl.prop.z - sp.at[1]);
      if (d < bd) {
        bd = d;
        best = pl.obj;
      }
    }
    type NetUd = { setTension?(t: number): void; setCrank?(r: number): void };
    const found: NetUd[] = [];
    (best as THREE.Object3D | null)?.traverse((x) => {
      if (x.userData.setTension) found.push(x.userData as NetUd);
    });
    const n = found[0];
    if (!n) return undefined;
    let last = -1;
    return (due, k) => {
      const t = due ? 0.25 + 0.75 * k : 1;
      if (Math.abs(t - last) < 0.01) return;
      last = t;
      n.setTension?.(t);
      n.setCrank?.(k * 9);
    };
  }
  /** 扫场：站位前面一摊沙（场地上一块沙色的圆），越扫越小；没活的时候没有 */
  function sandShow(b: BuiltMap, sp: Spot): (due: boolean, k: number) => void {
    const g = new THREE.Group();
    g.name = 'chore-sand';
    const mat = o.kit.ctxFor(0).mat('floor');
    const yaw = sp.yaw ?? 0;
    // 站位朝向前方 1.6 米、沿着底线摊开的三块
    const cx = sp.at[0] + Math.sin(yaw) * 1.6;
    const cz = sp.at[1] + Math.cos(yaw) * 1.6;
    for (const [dx, dz, r] of [
      [0, 0, 1.1],
      [1.3, 0.2, 0.75],
      [-1.2, -0.15, 0.6],
    ]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(dx, 0, dz);
      m.receiveShadow = true;
      g.add(m);
    }
    g.position.set(cx, b.groundAt(cx, cz) + 0.03, cz);
    g.visible = false;
    b.root.add(g);
    return (due, k) => {
      g.visible = due;
      g.scale.setScalar(Math.max(0.05, 1 - k * 0.95));
    };
  }

  for (const b of o.built) {
    const id = b.def.id;
    // 摆着的饮水桶（water-station）也算一个换水的站位（附近 2 米没有 world 填的 'water' 站位时）：站在桶前 0.9 米
    const spots: Spot[] = [...(b.def.spots ?? [])];
    b.def.props.forEach((pr, i) => {
      if (pr.a !== 'water-station') return;
      if (spots.some((sp) => sp.id.startsWith('water') && Math.hypot(sp.at[0] - pr.x, sp.at[1] - pr.z) < 2)) return;
      const r = pr.r ?? 0;
      spots.push({
        id: `water-st${i}`,
        kind: 'work',
        at: [pr.x + Math.sin(r) * 0.9, pr.z + Math.cos(r) * 0.9],
        yaw: r + Math.PI,
      });
    });
    /** 这张图的活错开一点（不然每张图都在整点一起来） */
    const lag = hashOf(CAST.seed, 'lag', id) % 50;
    const match = isMatchCourt(b);
    for (const sp of spots) {
      const cid = `${id}:${sp.id}`;
      if (sp.id.startsWith('net-post'))
        spotChore(b, sp, {
          id: cid,
          due: match
            ? (day, m) => {
                const w = matchWindows(CAST.seed, day).findIndex((x) => m >= x[0] - 50 && m < x[0]);
                return w >= 0 ? `${day}:${w}` : null;
              }
            : every(180, 7 * 60 + lag),
          ask: 'netAsk',
          label: 'netLabel',
          show: netShow(b, sp),
          done: 'netDone',
          money: 3,
          minutes: 6,
          pose: 'crank',
          hold: 2.4,
        });
      else if (sp.id === 'baseline-sweep' && match)
        spotChore(b, sp, {
          id: cid,
          due: (day, m) => {
            const ws = matchWindows(CAST.seed, day);
            for (let i = 0; i < ws.length; i++) {
              const next = ws[i + 1]?.[0] ?? 21 * 60;
              if (m >= ws[i][1] && m < next - 5) return `${day}:${i}`;
            }
            return null;
          },
          ask: 'sweepAsk',
          label: 'sweepLabel',
          show: sandShow(b, sp),
          done: 'sweepDone',
          money: 4,
          minutes: 12,
          pose: 'sweep',
          hold: 4,
          prop: 'broom',
        });
      else if (sp.id === 'water' || sp.id.startsWith('water-'))
        spotChore(b, sp, {
          id: cid,
          due: every(120, 8 * 60 + lag),
          ask: 'waterAsk',
          label: 'waterLabel',
          done: 'waterDone',
          money: 2,
          minutes: 5,
          pose: 'pour',
          hold: 2,
        });
      else if (sp.id.startsWith('hopper'))
        spotChore(b, sp, {
          id: cid,
          due: every(140, 8 * 60 + 20 + lag),
          ask: 'hopperAsk',
          label: 'hopperLabel',
          done: 'hopperDone',
          money: 2,
          minutes: 4,
          pose: 'pickup',
        });
      else if (sp.id === 'pool-towels')
        spotChore(b, sp, {
          id: cid,
          due: every(150, 9 * 60 + lag),
          ask: 'towelAsk',
          label: 'towelLabel',
          done: 'towelDone',
          money: 2,
          minutes: 4,
          pose: 'pickup',
        });
    }

    // ── 练习场：捡球、补发球机、补球筐 ──
    const machine = b.def.props.find((p) => p.a === 'ball-machine');
    if (machine) practiceChores(b, machine, spots);
  }

  /**
   * 练习场的活（有发球机的图）：
   *   捡球：地上的一撮撮球（world 摆的 'practice:balls'；没有就在场地 courts[0] 上自己撒三簇）隔 35 分钟一撮回来 → 点一撮捡起来
   *   补发球机：手里有球 → 发球机那儿（站位 '*machine*'，没有就是发球机前面）点一下 → 有人拿拍子过来站到接球的地方（站位 '*hitter*'，
   *            没有就是发球机正前方 7 米），发球机隔 1.4 秒发一个球，他挥拍打回去，打 40 秒
   */
  function practiceChores(b: BuiltMap, machine: Prop, spots: readonly Spot[]) {
    const id = b.def.id;
    const ballCtx = o.kit.ctxFor(1) as unknown as Parameters<typeof buildBalls>[0];
    const mr = machine.r ?? 0;
    const hitSpot = spots.find((sp) => sp.id.includes('hitter'));
    const hit: [number, number] = hitSpot
      ? [hitSpot.at[0] + 1.3, hitSpot.at[1] - 0.6]
      : [machine.x + Math.sin(mr) * 7, machine.z + Math.cos(mr) * 7];
    const mSpot = spots.find((sp) => sp.id.includes('machine'));
    const mAt = new THREE.Vector3(machine.x + b.ox, b.groundAt(machine.x, machine.z) + 0.9, machine.z);
    const mStand: [number, number] | null = mSpot ? [mSpot.at[0] + b.ox, mSpot.at[1]] : null;

    // 一撮撮球：world 摆好的优先
    type Pile = { obj: THREE.Object3D; at: THREE.Vector3 };
    const piles: Pile[] = b.placed
      .filter((pl) => pl.prop.a === 'practice:balls')
      .map((pl) => ({
        obj: pl.obj,
        at: new THREE.Vector3(pl.prop.x + b.ox, b.groundAt(pl.prop.x, pl.prop.z) + 0.2, pl.prop.z),
      }));
    const court = b.def.courts[0];
    if (!piles.length && court) {
      const far = Math.abs(machine.z - court.z0) < Math.abs(machine.z - court.z1) ? court.z1 : court.z0;
      const mid = (court.z0 + court.z1) / 2;
      [0.25, 0.5, 0.75].forEach((k, i) => {
        const z = mid + (far - mid) * k;
        const x = court.x0 + (court.x1 - court.x0) * [0.3, 0.62, 0.45][i];
        const ball = buildBalls(ballCtx);
        const r = mulberry32(hashOf(CAST.seed, 'balls', id, i));
        // 一簇挤在一起（手机上要读成"一堆球"）：球放大 1.8 倍
        ball.userData.setBalls?.(
          Array.from({ length: 7 + Math.floor(r() * 4) }, () => [(r() - 0.5) * 0.55, (r() - 0.5) * 0.45]),
        );
        ball.scale.setScalar(1.8);
        ball.position.set(x, b.groundAt(x, z), z);
        b.root.add(ball);
        piles.push({ obj: ball, at: new THREE.Vector3(x + b.ox, ball.position.y + 0.2, z) });
      });
    }
    /** 第 i 撮这一轮该不该在地上（隔 35 分钟一轮，几撮错开；捡过的这一轮不再出） */
    const pileKey = (i: number) => {
      const t = o.clock();
      if (t.minute < 7 * 60 + 30 || t.minute >= 21 * 60) return null;
      const slot = Math.floor((t.minute - 7 * 60) / 35);
      const n = Math.max(1, piles.length);
      return slot >= i % n ? `${t.day}:${Math.floor((slot - (i % n)) / n)}` : null;
    };
    let carried = 0;
    piles.forEach((p, i) => {
      play.add({
        id: `balls:${id}:${i}`,
        at: () => p.at,
        radius: 1.6,
        label: () => (o.cur() === b && p.obj.visible ? lt('ballsLabel') : ''),
        canUse: () => o.cur() === b && p.obj.visible,
        autoUse: true,
        onUse: (pl) =>
          pl.busy({
            name: 'balls',
            dur: 0.8,
            pose: 'pickup',
            face: [p.at.x, p.at.z],
            mid: () => {
              const k = pileKey(i);
              if (k) doneKeys.add(`balls:${id}:${i}|${k}`);
              p.obj.visible = false;
              carried++;
              count.balls = (count.balls ?? 0) + 1;
              o.reward('ballsDone', 1, p.at, 3);
            },
          }),
      });
    });

    // 发球机发的那个球（地图坐标；一次只飞一个）
    const flying = buildBalls(ballCtx);
    flying.userData.setBalls?.([[0, 0.1, 0]]);
    flying.scale.setScalar(1.5);
    flying.visible = false;
    b.root.add(flying);
    let rally = 0;
    let rallyT = 0;
    const mx = machine.x;
    const mz = machine.z;
    const mh = b.groundAt(mx, mz);
    const hh = b.groundAt(hit[0], hit[1]);
    play.add({
      id: `machine:${id}`,
      at: () => mAt,
      radius: 2,
      ...(mStand ? { stand: () => mStand } : {}),
      label: () => (o.cur() === b && carried > 0 ? lt('machineLabel') : ''),
      canUse: () => o.cur() === b && carried > 0,
      autoUse: true,
      onUse: (pl) =>
        pl.busy({
          name: 'machine',
          dur: 1.1,
          pose: 'pour',
          face: [mAt.x, mAt.z],
          mid: () => {
            const n = carried;
            carried = 0;
            count.machine = (count.machine ?? 0) + 1;
            o.reward('machineDone', 2 + n, mAt, 5);
            // 补完球：有人拿着拍子过来站到接球的地方，对着发球机打
            if (
              o.callOver?.(b, hit[0], hit[1], Math.atan2(mx - hit[0], mz - hit[1]), 40, {
                pose: 'ready',
                prop: 'racket',
              })
            )
              count.practice = (count.practice ?? 0) + 1;
            rally = 46;
            rallyT = 0;
          },
        }),
    });
    /** 接球的人：站在接球点 1.5 米以内拿着拍子的 */
    function hitter(): THREE.Object3D | null {
      let best: THREE.Object3D | null = null;
      let bd = 1.5;
      for (const c of b.root.children) {
        const u = c.userData;
        if (!c.visible || !u.pose || u.prop?.() !== 'racket') continue;
        const d = Math.hypot(c.position.x - hit[0], c.position.z - hit[1]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      return best;
    }
    const FEED = 1.4;
    const OUT = 0.85;
    let ask = false;
    steppers.push((dt) => {
      if (o.cur() !== b) {
        // 换到别的图：这张图的记号收起来（图都叠在同一块坐标上）
        if (ask) play.bubble(`machine:${id}`, null);
        ask = false;
        return;
      }
      piles.forEach((p, i) => {
        const k = pileKey(i);
        p.obj.visible = !!k && !doneKeys.has(`balls:${id}:${i}|${k}`);
      });
      const want = carried > 0;
      if (want !== ask) play.bubble(`machine:${id}`, want ? mAt.clone().setY(mAt.y + 0.5) : null, lt('machineAsk'), 0);
      ask = want;
      // 对打：人到了才发球；球飞 OUT 秒到他面前，他挥拍，球再飞回去落在发球机那头
      if (rally <= 0) {
        flying.visible = false;
        return;
      }
      rally -= dt;
      const h = hitter();
      if (!h) {
        flying.visible = false;
        return;
      }
      rallyT += dt;
      const t = rallyT % FEED;
      const set = flying.userData.setBall as ((i: number, x: number, y: number, z: number) => void) | undefined;
      flying.visible = true;
      if (t < OUT) {
        const k = t / OUT;
        set?.(
          0,
          mx + (hit[0] - mx) * k,
          mh + 0.9 + (hh + 1 - mh - 0.9) * k + Math.sin(Math.PI * k) * 1.4,
          mz + (hit[1] - mz) * k,
        );
      } else {
        const k = Math.min(1, (t - OUT) / (FEED - OUT));
        // 打回去：朝发球机那头飞一段，越飞越低
        set?.(
          0,
          hit[0] + (mx - hit[0]) * k * 0.8,
          hh + 1 + Math.sin(Math.PI * k) * 0.9 - k * 0.9,
          hit[1] + (mz - hit[1]) * k * 0.8,
        );
      }
      // 挥拍：球到之前 0.25 秒起拍，到了以后 0.25 秒收拍
      const sw = (t - (OUT - 0.25)) / 0.5;
      if (sw >= 0 && sw <= 1) h.userData.pose?.('forehand', sw);
      else if (sw > 1 && sw < 1.2) h.userData.pose?.('ready', 0.3);
    });
  }

  return {
    step(dt) {
      for (const f of steppers) f(dt);
    },
    debug: () => ({ count: { ...count }, done: [...doneKeys] }),
  };
}
