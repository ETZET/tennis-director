// 园区日常（演出 demo，没有模拟）：两个人从步道走上台阶来打球，发球、对打、得分；
// 分与分之间总监拿扫帚上场，扫最脏的那块积沙（court.userData.sand），扬起尘土，扫完回场边；球员在底线等。
// 打几分以后这组人走掉，过一会儿换一组。演出随机只用种子随机流。
// 截图钩子：window.__d3v2.life = { state, skipTo(phase) }
import * as THREE from 'three';
import type { SandGrid } from './assets/court';
import type { Fx } from './fx';
import { COURT, H, STAIRS } from './layout';
import type { AssetCtx } from './world';

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 步道：岛东沿 → 台阶脚 → 台阶顶 → 铺面东南角（y 按层；台阶上线性升） */
const stairBottomZ = STAIRS.z0 + STAIRS.run * STAIRS.steps;
const ARRIVE: V3[] = [
  v(26.5, H.low, 23.2),
  v(22.5, H.low, 21.8),
  v(17.5, H.low, 21.4),
  v(12.6, H.low, 22.6),
  v(8.2, H.low, 22.2),
  v(5.4, H.low, 20.2),
  v(4.6, H.low, stairBottomZ + 0.2),
  v(4.6, H.court, STAIRS.z0 - 0.15),
  v(4.9, H.court, 14.6),
  v(5.6, 0.04, 13.4),
];
const PAD_Y = 0.04;
/** 总监在西侧网柱旁等（迎风边，沙多在这一侧） */
const DIRECTOR_HOME = v(-7.75, H.court, 1.4);

interface Actor {
  obj: THREE.Object3D;
  pos: V3;
  /** 朝向（弧度，绕 y；0 = 朝 +z = 镜头） */
  yaw: number;
  walkPh: number;
  pose(name: string, ph?: number): void;
}

function actor(obj: THREE.Object3D): Actor {
  return {
    obj,
    pos: obj.position.clone(),
    yaw: 0,
    walkPh: 0,
    pose: (n, ph) => obj.userData.pose?.(n, ph),
  };
}

const lerp = THREE.MathUtils.lerp;
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return a + d * Math.min(1, k);
};

type Co = Generator<void, void, number>;

export interface Life {
  update(dt: number, t: number): void;
  state: { phase: string; score: [number, number]; group: number; points: number; sand: number };
}

export function createLife(
  ctx: AssetCtx,
  scene: THREE.Scene,
  make: (asset: string, variant: number) => THREE.Object3D,
  court: THREE.Object3D | undefined,
  fx: Fx,
  hud: HTMLElement | null,
): Life {
  const rnd = ctx.rng('life');
  const sand = court?.userData.sand as SandGrid | undefined;
  const state: Life['state'] = { phase: 'idle', score: [0, 0], group: 0, points: 0, sand: 0 };

  // ── 球：两纹素的荧光球 + 地上一个假影子（太阳在后上方，影子落在球的正下偏镜头一点） ──
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(ctx.texel * 1.1, 1),
    ctx.mat('ball', { noShadowReceive: true, bands: [-2, -1] }),
  );
  ball.castShadow = false;
  ball.visible = false;
  scene.add(ball);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(ctx.texel * 1.3, 8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1e2850, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.layers.set(ctx.layers.FX);
  shadow.visible = false;
  scene.add(shadow);
  const placeBall = (p: V3) => {
    ball.position.copy(p);
    shadow.position.set(p.x, PAD_Y + 0.01, p.z + Math.max(0, p.y - PAD_Y) * 0.35);
  };
  const showBall = (on: boolean) => {
    ball.visible = on;
    shadow.visible = on;
  };

  // ── 人 ──
  const director = actor(make('director', 0));
  director.pos.copy(DIRECTOR_HOME);
  director.yaw = Math.PI / 2;
  scene.add(director.obj);
  let players: Actor[] = [];

  const sync = (a: Actor) => {
    a.obj.position.copy(a.pos);
    a.obj.rotation.y = a.yaw;
  };

  // ── 协程工具 ──
  function* wait(s: number): Co {
    let t = 0;
    while (t < s) t += yield;
  }
  /** 沿折线走（米/秒），走路姿势的相位跟着步子 */
  function* walk(a: Actor, pts: V3[], speed = 1.5): Co {
    for (const p of pts) {
      while (true) {
        const dt = yield;
        const d = new THREE.Vector3(p.x - a.pos.x, 0, p.z - a.pos.z);
        const L = d.length();
        const step = speed * dt;
        if (L <= step) {
          a.pos.x = p.x;
          a.pos.z = p.z;
          a.pos.y = p.y;
          break;
        }
        // y 跟着水平进度插值（台阶）
        const k = step / L;
        a.pos.x += d.x * k;
        a.pos.z += d.z * k;
        a.pos.y = lerp(a.pos.y, p.y, k);
        a.yaw = turnTo(a.yaw, Math.atan2(d.x, d.z), dt * 10);
        a.walkPh = (a.walkPh + step / 1.25) % 1;
        a.pose('walk', a.walkPh);
      }
    }
  }
  function* face(a: Actor, yaw: number, s = 0.3): Co {
    let t = 0;
    while (t < s) {
      const dt = yield;
      t += dt;
      a.yaw = turnTo(a.yaw, yaw, dt * 8);
    }
    a.yaw = yaw;
  }
  /** 并行跑几个协程，全部结束才结束 */
  function* all(...cos: Co[]): Co {
    for (const c of cos) c.next(0);
    let live = cos.slice();
    while (live.length) {
      const dt = yield;
      live = live.filter((c) => !c.next(dt).done);
    }
  }

  // ── 球的飞行：一段段抛物线 ──
  /** 从 a 飞到 b，用时 T 秒，最高点比直线高 h 米；每帧调 tick */
  function* fly(a: V3, b: V3, T: number, h: number, tick?: (u: number) => void): Co {
    let t = 0;
    const p = new THREE.Vector3();
    while (t < T) {
      t += yield;
      const u = Math.min(1, t / T);
      p.lerpVectors(a, b, u);
      p.y += 4 * h * u * (1 - u);
      placeBall(p);
      tick?.(u);
    }
  }
  const bounceFx = (p: V3, hard = 1) => {
    const s = sand?.at(p.x, p.z) ?? 0;
    if (s > 0.03) fx.puff(new THREE.Vector3(p.x, PAD_Y + s, p.z), 0.18 * hard, 3);
    else if (rnd() < 0.5) fx.puff(new THREE.Vector3(p.x, PAD_Y, p.z), 0.1, 1);
  };

  /** 接球的人：横移到击球点，挥拍（forehand/backhand 按球在哪边） */
  function* receive(a: Actor, hit: V3, arriveIn: number): Co {
    const side = a.pos.z < 0 ? -1 : 1; // 北边的人朝 +z
    const startX = a.pos.x;
    const startZ = a.pos.z;
    // 站位：击球点在人右手边（右手在 −x·朝向）一臂远
    const dir = side < 0 ? 1 : -1; // 朝向 +z 时右手在 −x
    const fore = (hit.x - a.pos.x) * -dir > -0.3;
    const offX = (fore ? 0.6 : -0.6) * dir;
    const tx = THREE.MathUtils.clamp(hit.x + offX, -7, 7);
    const tz = startZ + (hit.z - startZ) * 0.15;
    const swingT = 0.55;
    let t = 0;
    while (t < arriveIn) {
      const dt = yield;
      t += dt;
      const k = Math.min(1, t / Math.max(0.2, arriveIn - swingT * 0.5));
      const e = k * k * (3 - 2 * k);
      a.pos.x = lerp(startX, tx, e);
      a.pos.z = lerp(startZ, tz, e);
      a.yaw = turnTo(a.yaw, side < 0 ? 0 : Math.PI, dt * 8);
      const ph = (t - (arriveIn - swingT * 0.5)) / swingT;
      if (ph < 0) {
        a.walkPh = (a.walkPh + dt * 1.8) % 1;
        a.pose(Math.abs(tx - startX) > 0.8 && k < 0.95 ? 'walk' : 'ready', Math.abs(tx - startX) > 0.8 ? a.walkPh : t);
      } else a.pose(fore ? 'forehand' : 'backhand', 0.5 * Math.min(1, ph / 0.5) * 0.98);
    }
    // 随挥
    let s = 0;
    while (s < swingT * 0.5) {
      s += yield;
      a.pose(fore ? 'forehand' : 'backhand', 0.5 + s / swingT);
    }
  }

  /** 一分：发球 + 对打若干拍；返回赢家（0 北 / 1 南） */
  function* point(server: number): Generator<void, number, number> {
    const [N, S] = players;
    const pl = [N, S];
    const srv = pl[server];
    const rcv = pl[1 - server];
    const sgn = (i: number) => (i === 0 ? -1 : 1); // 北半场 z<0
    const deuce = state.points % 2 === 0 ? 1 : -1;
    // 站位
    const sx = 1.1 * deuce * -sgn(server);
    const rx = 2.6 * deuce * sgn(server);
    yield* all(
      walk(srv, [v(sx, PAD_Y, sgn(server) * (COURT.hl + 0.4))], 2.2),
      walk(rcv, [v(rx, PAD_Y, sgn(1 - server) * (COURT.hl - 0.6))], 2.2),
    );
    srv.yaw = server === 0 ? 0 : Math.PI;
    rcv.yaw = server === 0 ? Math.PI : 0;
    for (const a of pl) a.pose('ready', 0);
    yield* wait(0.5);
    state.phase = 'rally';

    // 发球：姿势 1.6 秒，0.58 时击球
    const serveT = 1.1;
    let t = 0;
    showBall(true);
    while (t < serveT * 0.58) {
      t += yield;
      const ph = (t / serveT) * 1;
      srv.pose('serve', Math.min(0.58, ph));
      rcv.pose('ready', t);
      // 抛球时球在姿势里画（资产自带），这里藏起场上的球
      ball.visible = false;
      shadow.visible = false;
    }
    showBall(true);
    let from = v(srv.pos.x + (server === 0 ? -0.2 : 0.2), 2.6, srv.pos.z);
    let hitter = server;
    let shots = 1 + Math.floor(rnd() * 6);
    let winner = -1;
    // 发球的随挥
    const follow = (a: Actor, name: string, ph0: number) =>
      (function* (): Co {
        let s = 0;
        while (s < 0.4) {
          s += yield;
          a.pose(name, Math.min(0.99, ph0 + s));
        }
        a.pose('ready', 0);
      })();

    while (true) {
      const other = 1 - hitter;
      const dz = sgn(other);
      const last = shots <= 0;
      // 落点
      let bx: number;
      let bz: number;
      let out = false;
      let net = false;
      if (hitter === server && from.y > 2) {
        // 发球落在对角发球区
        bx = (1.2 + rnd() * 2) * Math.sign(rx || 1);
        bz = dz * (COURT.service - 0.6 - rnd() * 1.5);
      } else {
        bx = (rnd() * 2 - 1) * 3.6;
        bz = dz * (6 + rnd() * 4.5);
      }
      if (last) {
        const r = rnd();
        if (r < 0.4) {
          out = true;
          bz = dz * (COURT.hl + 0.8 + rnd() * 1.5);
        } else if (r < 0.65) net = true;
        else bx = Math.sign(bx || 1) * (3 + rnd() * 1.2); // 打到角上，对方够不着
      }
      const bounce = v(bx, PAD_Y, bz);
      const flight = 0.75 + Math.abs(bz - from.z) * 0.025;
      const followCo = follow(
        pl[hitter],
        hitter === server && from.y > 2 ? 'serve' : 'forehand',
        hitter === server && from.y > 2 ? 0.6 : 0.6,
      );
      if (net) {
        const n = v(lerp(from.x, bx, 0.5), 0.6, 0);
        yield* all(fly(from, n, flight * 0.5, 0.8), followCo);
        yield* fly(n, v(n.x, PAD_Y, -dz * 0.6), 0.3, 0.05);
        bounceFx(ball.position, 0.6);
        winner = other;
        break;
      }
      // 接球的人在球飞的时候开始移动
      const hitPt = v(bx + (rnd() - 0.5) * 1.2, 0.9, dz * (COURT.hl - 0.3 + rnd() * 0.6));
      const after = 0.55;
      const reach = !last || out;
      const recvCo = reach && !out ? receive(pl[other], hitPt, flight + after) : null;
      const bodyCo =
        recvCo ??
        (function* (): Co {
          // 够不着：追两步，停下
          const a = pl[other];
          const x0 = a.pos.x;
          let s = 0;
          while (s < flight + after) {
            const dt = yield;
            s += dt;
            a.pos.x = lerp(x0, x0 + (bx - x0) * 0.4, Math.min(1, s / (flight + after)));
            a.walkPh = (a.walkPh + dt * 1.8) % 1;
            a.pose(out ? 'ready' : 'walk', out ? s : a.walkPh);
          }
        })();
      yield* all(
        (function* (): Co {
          yield* fly(from, bounce, flight, 1.4 + rnd() * 0.8);
          bounceFx(bounce);
          if (out || last) {
            // 出界 / 打穿：球跳两下滚走
            const b2 = v(bx * 1.1, PAD_Y, bz + dz * 3);
            yield* fly(bounce, b2, 0.5, 0.5);
            const b3 = v(b2.x, PAD_Y, b2.z + dz * 1.5);
            yield* fly(b2, b3, 0.3, 0.12);
          } else yield* fly(bounce, hitPt, after, 0.5);
        })(),
        followCo,
        bodyCo,
      );
      if (out) {
        winner = other;
        break;
      }
      if (last) {
        winner = hitter;
        break;
      }
      from = hitPt;
      hitter = other;
      shots--;
    }
    showBall(false);
    for (const a of pl) a.pose('idle');
    return winner;
  }

  /** 分间：总监去扫最脏的一两块沙 */
  function* sweepBreak(): Co {
    state.phase = 'break';
    const spots: { x: number; z: number }[] = [];
    for (let k = 0; k < 1 && sand; k++) {
      const d = sand.dirtiest(0.05, director.pos);
      if (!d) break;
      if (spots.some((s) => Math.hypot(s.x - d.x, s.z - d.z) < 2)) break;
      spots.push(d);
      if (k === 0 && d.amount < 0.1) break;
    }
    if (!spots.length) {
      yield* wait(1.2);
      return;
    }
    const D = director;
    let side = Math.sign(D.pos.z) || 1;
    for (const s of spots) {
      // 站在沙堆北边一点（扫帚头在身前 1.1 米），朝南推
      const stand = v(s.x, PAD_Y, s.z - 1.0);
      const route: V3[] = [];
      const targetSide = Math.sign(stand.z) || 1;
      if (targetSide !== side) route.push(v(-7.5, PAD_Y, side * 0.8), v(-7.5, PAD_Y, targetSide * 0.8));
      route.push(stand);
      yield* walk(D, route, 2.8);
      side = targetSide;
      yield* face(D, 0, 0.25);
      // 扫：来回推，前后挪一点；每 0.1 秒扫一下、扬尘
      let t = 0;
      let acc = 0;
      const x0 = D.pos.x;
      while (t < 6) {
        const dt = yield;
        t += dt;
        acc += dt;
        const ph = (t / 1.3) % 1;
        D.pose('sweep', ph);
        D.pos.x = x0 + Math.sin(t * 1.1) * 0.85;
        D.pos.z = stand.z + Math.min(1.2, t * 0.18);
        if (acc > 0.1) {
          acc = 0;
          const bx = D.pos.x + Math.sin(D.yaw) * 1.15;
          const bz = D.pos.z + Math.cos(D.yaw) * 1.15;
          const got = sand?.sweep(bx, bz, 0.8, 0.05) ?? 0;
          if (got > 0.0004 && rnd() < 0.7)
            fx.puff(v(bx, PAD_Y + (sand?.at(bx, bz) ?? 0), bz + 0.2), Math.min(0.26, 0.12 + got * 12), 2);
        }
        if (t > 2.5 && (sand?.at(s.x, s.z) ?? 0) < 0.02 && (sand?.at(s.x, s.z + 0.8) ?? 0) < 0.02) break;
      }
    }
    // 回场边
    const home: V3[] = [];
    if (side !== Math.sign(DIRECTOR_HOME.z)) home.push(v(-7.5, PAD_Y, side * 0.8), v(-7.5, PAD_Y, -side * 0.8));
    home.push(DIRECTOR_HOME);
    yield* walk(D, home, 2.8);
    yield* face(D, Math.PI / 2, 0.3);
    D.pose('idle');
  }

  /** 一组人来、打几分、走 */
  function* visit(first: boolean): Co {
    state.group++;
    const g = state.group;
    const vars = [
      [0, 1],
      [2, 3],
      [1, 2],
      [3, 0],
    ][(g - 1) % 4];
    players = vars.map((vi) => actor(make('player', vi)));
    // 第一组直接从台阶顶出现（截图、试玩不用等 30 秒）
    const start = first ? 7 : 0;
    for (const [i, p] of players.entries()) {
      p.pos.copy(ARRIVE[start]).add(v(i * 0.6, 0, i * 0.4));
      scene.add(p.obj);
    }
    state.phase = 'arrive';
    state.score = [0, 0];
    // 走上来：南边的人直接去南底线，北边的人从东侧绕过网
    const [N, S] = players;
    yield* all(
      walk(N, [...ARRIVE.slice(start + 1), v(7.0, PAD_Y, 6), v(7.0, PAD_Y, -6), v(2, PAD_Y, -COURT.hl - 0.4)], 2.0),
      (function* (): Co {
        yield* wait(0.7);
        yield* walk(S, [...ARRIVE.slice(start + 1), v(2, PAD_Y, COURT.hl + 0.4)], 2.0);
      })(),
    );
    const nPoints = 5 + Math.floor(rnd() * 4);
    let server = rnd() < 0.5 ? 0 : 1;
    for (let k = 0; k < nPoints; k++) {
      state.points = k;
      const w = yield* point(server);
      state.score[w]++;
      if (hud) hud.textContent = scoreText();
      yield* sweepBreak();
      if (k % 4 === 3) server = 1 - server;
    }
    // 走掉
    state.phase = 'leave';
    if (hud) hud.textContent = '';
    const back = ARRIVE.slice().reverse();
    yield* all(walk(N, [v(7.0, PAD_Y, -6), v(7.0, PAD_Y, 6), ...back], 2.0), walk(S, back, 1.9));
    for (const p of players) scene.remove(p.obj);
    players = [];
    state.phase = 'idle';
  }
  const PTS = ['0', '15', '30', '40', '局'];
  const scoreText = () => {
    const [a, b] = state.score;
    return `${PTS[Math.min(4, a)]} – ${PTS[Math.min(4, b)]}`;
  };

  function* main(): Co {
    yield* wait(0.3);
    let first = true;
    while (true) {
      yield* visit(first);
      first = false;
      yield* wait(3 + rnd() * 3);
    }
  }
  const co = main();
  co.next(0);
  sync(director);
  director.pose('idle');

  return {
    state,
    update(dt) {
      co.next(dt);
      state.sand = Math.round((sand?.total() ?? 0) * 100) / 100;
      for (const a of [director, ...players]) {
        sync(a);
        a.obj.userData.update?.(dt);
      }
    },
  };
}
