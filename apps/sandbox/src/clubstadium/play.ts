// clubstadium 的玩法（stage 3）：总监在中心球场打杂，表演赛照常一场一场地打（life.ts）。
// 走路、按钮、相机、气泡都是 clubsite/play 的；这里只登记这个场景的导航、工具和活，再把结果写进演出（沙堆、底线、杯子、球员席）。
//
// 工具都在西南角的工具角：
//   吹叶机（工具架上）  走近按 拿/放键"拿吹叶机" → 按住动作键：
//                      · 场边的沙堆（西南南看台脚下、西北 / 东北两个角）："吹沙"，对着沙堆吹，沙变薄、露出下面的绿；
//                      · 看台上（西头端梯 → 最高一级的横走道 → 四条走道）："吹杯子"，附近几排的杯子往走道滑、到走道就收走。
//                      回到工具架"挂回去"。
//   划线车（工具角）    "拿起 划线车" → 推着走（push，1.5 米/秒）：出漆嘴走过的底线变回新的白线。随手放下 = 停在那里。
//   球员席（网两边）    空手按动作键"撑伞·补水"（2 秒）：场边的大伞撑开、冰箱补满。散场后球童会把伞收起来。
// 取舍（玩法准则 2）：
//   · 开场倒计时到了沙还没吹完 → 推迟开场，看台嘘、等烦了的人走掉（这一场的上座率掉下去）。
//   · 底线磨淡了不补 → 出界的球落在线附近就"压线了！"争议，比赛停一会儿、看台嘘。
//   · 伞没撑、冰箱没补 → 换边时球员冒"好晒" / "冰箱是空的！"。
//   · 散场的杯子不收 → 下一场来的人少。
//   · 比赛中场地关着（MATCH_RECT 进不去，网两边过不去）；只有换边那十几秒能进场。场边那一条（南看台脚下、底线后）能走。
// 顶栏：比赛（倒计时 / 比分）、沙、底线、杯子、观众。
import * as THREE from 'three';
import { footprint, type Item, type Play, type Rect, type Shape } from '../clubsite/play';
import type { AssetCtx } from './ctx';
import { MATCH_RECT, NET_POST_Z, northTread, PLAYERS_GATE, S, STANDS, TERRACE } from './layout';
import { SAND_BLOCK, type StadiumLife } from './life';

/** 静态挡路的：网、广告板、裁判椅、球员席、伞杆、工具架、拱门两根柱子、饮水点、几簇植物 */
export function staticBlocked(objs: Map<string, THREE.Object3D>): Shape[] {
  const out: Shape[] = [
    { a: [S.x, NET_POST_Z[0] - 0.05], b: [S.x, NET_POST_Z[1] + 0.05], r: 0.18 },
    // 网南头的绞盘和摇把（clubsite/assets/court-net：绞盘 x −0.18…0.23，摇把朝东、握把到 x 0.29、z −14.14；这里不转）
    { x0: S.x - 0.18, x1: S.x + 0.29, z0: NET_POST_Z[1], z1: NET_POST_Z[1] + 0.46 },
    // 广告板：只挡板子本身（往北不伸进看台：走道最低半级要站得上；看台和场地之间 0.9 的高差本来就过不去）
    { x0: -17.9, x1: 17.9, z0: STANDS.north.front, z1: STANDS.north.front + STANDS.board.t + 0.05 },
    // 拱门的两根柱子（1.0 见方，在门洞中心南北 2.6 米）
    ...[-1, 1].map((s) => ({
      x0: PLAYERS_GATE.x - 0.55,
      x1: PLAYERS_GATE.x + 0.55,
      z0: PLAYERS_GATE.z + s * 2.6 - 0.55,
      z1: PLAYERS_GATE.z + s * 2.6 + 0.55,
    })),
    { x: -24.4, z: -24.6, r: 0.5 },
    { x: -24.2, z: -17.2, r: 0.45 },
  ];
  // 北看台走道之间的座位块（第 0～4 级的实心台阶，北沿 = 最高一级踏面前沿往南 0.1）：横走道的南沿、走道两边由它挡。
  // 挡路形状的角是圆的（推出 = 沿法线滑），摇杆往东 / 往西带一点南偏走过走道口时会被圆角托回横走道，不会卡进走道口的死角
  {
    const N = STANDS.north;
    const half = STANDS.aisleW / 2;
    const xs = [N.x0, ...STANDS.aisles.flatMap((c) => [c - half, c + half]), N.x1];
    for (let i = 0; i < xs.length; i += 2)
      out.push({ x0: xs[i], x1: xs[i + 1], z0: northTread(N.n - 1).za + 0.1, z1: N.front });
  }
  for (const id of ['umpire-chair', 'bench-w', 'bench-e', 'tool-rack', 'drink-fountain']) {
    const o = objs.get(id);
    const r = o ? footprint(o, 0.05) : null;
    if (r) out.push(r);
  }
  // 会所露台（邻居）东沿凉棚的柱子（terrain.ts：x = TERRACE.x1 − 0.6，z0 + 1 起每 4.8 米一根，0.35 见方）：西头能走的到 x −27.4，压着这一排
  for (let z = TERRACE.z0 + 1; z <= TERRACE.z1 - 0.5; z += 4.8) out.push({ x: TERRACE.x1 - 0.6, z, r: 0.25 });
  // 端梯西边沙地上的两簇（半径同 clubplaza 的 PLANT_R）
  for (const [id, r] of [
    ['brittle-w', 0.45],
    ['creosote-w', 0.6],
  ] as const) {
    const o = objs.get(id);
    if (o) out.push({ x: o.position.x, z: o.position.z, r });
  }
  for (const id of ['umbrella-w', 'umbrella-e']) {
    const o = objs.get(id);
    if (o) out.push({ x: o.position.x, z: o.position.z, r: 0.3 });
  }
  return out;
}

export interface StadiumPlay {
  update(dt: number): void;
}

export function setupStadiumPlay(o: {
  play: Play;
  objs: Map<string, THREE.Object3D>;
  life: StadiumLife;
  ctx: AssetCtx;
  scene: THREE.Object3D;
}): StadiumPlay {
  const { play, objs, life, ctx, scene } = o;
  const D = play.director;
  const rnd = ctx.rng('stadium-play');
  D.userData.setProp?.(null);

  // 走动的人（球员、球童、裁判、长廊上的会员）当挡路圆
  play.addBlocker(() => life.people());

  // ── 比赛中场地关上（导航挡住 MATCH_RECT）──
  // 导航上单独的一层（setLayer）：大世界（clubwalk）里 play.nav 是整个世界的导航，不能拿这个场景的挡路整张换掉；
  // 层不会被 clubwalk 流入区域时的 setBlocked（换 base）冲掉，只重建场地附近 0.6 米的格子。
  const M = MATCH_RECT;
  const around: Rect = { x0: M.x0 - 0.6, x1: M.x1 + 0.6, z0: M.z0 - 0.6, z1: M.z1 + 0.6 };
  let gate: Rect | null = null;
  const setGate = (r: Rect | null) => {
    gate = r;
    play.nav.setLayer('clubstadium:match', r ? [r] : [], around);
  };
  /**
   * 关场那一刻总监的身体还压着 MATCH_RECT（life 只等他的中心出去）：挡路推出的距离比一步大，control 不接受 → 原地卡死。
   * 先挡一个收进来一条边的（离他 body + 0.02，收得最少的那条），等他走开再挡满；不瞬移、也不让他往场里走。
   */
  const clearance = play.nav.body + 0.02;
  const gateFor = (x: number, z: number): Rect => {
    const dx = Math.max(M.x0 - x, 0, x - M.x1);
    const dz = Math.max(M.z0 - z, 0, z - M.z1);
    if (Math.hypot(dx, dz) >= clearance) return M;
    const cut = [x + clearance - M.x0, M.x1 - x + clearance, z + clearance - M.z0, M.z1 - z + clearance];
    const k = cut.indexOf(Math.min(...cut));
    if (k === 0) return { ...M, x0: x + clearance };
    if (k === 1) return { ...M, x1: x - clearance };
    if (k === 2) return { ...M, z0: z + clearance };
    return { ...M, z1: z - clearance };
  };
  let closed = false;
  const syncCourt = () => {
    const want = life.state.courtClosed;
    if (want !== closed) {
      closed = want;
      setGate(closed ? gateFor(D.position.x, D.position.z) : null);
      if (closed) play.toast('比赛进行中 · 场地不能进', 2.0);
    } else if (gate && gate !== M && gateFor(D.position.x, D.position.z) === M) {
      // 收进来的那条边：总监走开了 → 挡满
      setGate(M);
    }
  };

  // ── 吹叶机：工具架上那把（拿着时用人物的内置道具 blower）──
  const rack = objs.get('tool-rack') as THREE.Object3D;
  const slot = (rack.userData.slots as Record<string, { pos: THREE.Vector3; top: THREE.Vector3 }>)?.blower;
  rack.updateMatrixWorld(true);
  const rackStand = slot ? rack.localToWorld(slot.pos.clone()) : rack.position.clone().add(new THREE.Vector3(0, 0, 1));
  // 槽位前那一点离架子的挡路脚印只有 0.23 米（< 身体半径 0.28，站不上，靠寻路的 nearestFree 兜底）：顺着架子正面往外挪 0.2 米
  if (slot) rackStand.addScaledVector(rack.getWorldDirection(new THREE.Vector3()).setY(0).normalize(), 0.2);
  const rackTop = slot
    ? rack.localToWorld(slot.top.clone()).add(new THREE.Vector3(0, 0.4, 0))
    : rack.position.clone().setY(2.2);
  const blowerObj = new THREE.Group();
  blowerObj.name = 'stadium:blower';
  const blower: Item = play.addItem({
    id: 'blower',
    name: '吹叶机',
    obj: blowerObj,
    prop: 'blower',
    droppable: false,
    use: {
      label: (s) => blowLabel(s.y),
      pose: 'blow',
      holdSpeed: 0.75,
      onHold: (dt) => {
        blowing = true;
        blowStep(dt);
        return true;
      },
      onRelease: () => {
        blowing = false;
      },
    },
  });
  blower.stow(rack);
  play.add({
    id: 'tool-rack',
    at: () => rackTop,
    radius: 1.8,
    stand: () => [rackStand.x, rackStand.z],
    pickLabel: () => (blower.where === 'away' ? '拿吹叶机' : ''),
    canPickUp: (s) => !s.held && blower.where === 'away',
    onPickUp: (p) => {
      p.give(blower);
      rack.userData.show?.('blower', false);
    },
    accepts: (it) => it.id === 'blower',
    putLabel: '挂回去',
    onPutDown: (it) => {
      it.stow(rack);
      rack.userData.show?.('blower', true);
    },
  });

  /** 出风口：总监脚前 1 米、贴地 */
  const nozzle = () => {
    const y = D.rotation.y;
    return new THREE.Vector3(D.position.x + Math.sin(y) * 1.0, D.position.y + 0.15, D.position.z + Math.cos(y) * 1.0);
  };
  const nearDrift = (p: THREE.Vector3) => {
    let best: { obj: THREE.Object3D; d: number } | null = null;
    for (const d of life.drifts) {
      const a = (d.obj.userData.amount as number) ?? 0;
      if (a < 0.02) continue;
      const dd = Math.hypot(d.obj.position.x - p.x, d.obj.position.z - p.z);
      if (!best || dd < best.d) best = { obj: d.obj, d: dd };
    }
    return best;
  };
  const blowLabel = (y: number) => {
    if (y > 0.6) return life.nearestCup(D.position.x, D.position.z) < 8 ? '吹杯子' : '吹';
    const n = nearDrift(nozzle());
    return n && n.d < 2.6 ? '吹沙' : '吹';
  };
  let blowing = false;
  let cupSay = -10;
  let now = 0;
  const blowStep = (dt: number) => {
    const p = nozzle();
    if (D.position.y > 0.6) {
      const got = life.blowCups(D.position.x, D.position.y, D.position.z, dt);
      if (got && now - cupSay > 1.2) {
        cupSay = now;
        play.say(D, `收了 ${got} 个杯子`, 1.0);
      }
      return;
    }
    for (const d of life.drifts) {
      const dd = Math.hypot(d.obj.position.x - p.x, d.obj.position.z - p.z);
      if (dd < 2.2) d.obj.userData.blow?.(dt, Math.min(1, (1 - dd / 2.2) * 1.6));
    }
  };

  // 吹叶机的气流：一串沙色小方块从出风口往前喷（FX 层）
  const JET = 48;
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
  const m4 = new THREE.Matrix4();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const updateJet = (dt: number) => {
    if (blowing && blower.where === 'held') {
      jetAcc += dt * 55;
      const p = nozzle();
      const y = D.rotation.y;
      while (jetAcc > 1) {
        jetAcc--;
        const j = jet[jetNext];
        jetNext = (jetNext + 1) % JET;
        j.on = true;
        j.life = 0;
        j.p.copy(p);
        const sp = 3.2 + rnd() * 1.6;
        const a = y + (rnd() - 0.5) * 0.7;
        j.v.set(Math.sin(a) * sp, 0.3 + rnd() * 0.6, Math.cos(a) * sp);
      }
    } else jetAcc = 0;
    jet.forEach((j, i) => {
      if (j.on) {
        j.life += dt;
        j.v.y -= 3 * dt;
        j.p.addScaledVector(j.v, dt);
        if (j.life > 0.45 || j.p.y < D.position.y - 0.05) j.on = false;
      }
      jetMesh.setMatrixAt(i, j.on ? m4.makeTranslation(j.p.x, j.p.y, j.p.z) : ZERO);
    });
    jetMesh.instanceMatrix.needsUpdate = true;
  };

  // ── 划线车：推着走，出漆嘴走过的底线变新 ──
  const cart = objs.get('line-cart') as THREE.Object3D;
  const grip: Record<string, unknown> = { ...(cart.userData.grip as Record<string, unknown>), cart: true };
  const tipLocal = new THREE.Vector3(...((grip.tip as [number, number, number] | undefined) ?? [0, 0.02, 0.12]));
  const marker = play.addItem({
    id: 'line-marker',
    name: '划线车',
    obj: cart,
    grip,
    radius: 1.2,
    carryPose: 'push',
    carrySpeed: 1.5,
  });
  marker.place(cart.position.x, cart.position.z, cart.rotation.y);
  // 拿着吹叶机走到工具角的划线车旁：拿/放键"换划线车"（吹叶机顺手挂回架上）
  play.add({
    id: 'marker-swap',
    at: () => cart.position.clone().setY(1.1),
    radius: 1.3,
    noMark: true,
    // 手里拿着东西时拿/放键只看"收它的互动点"（accepts）：吹叶机在这里"放下" = 挂回架上、顺手推起划线车
    accepts: (it) => it.id === 'blower' && marker.where === 'ground' && cart.position.distanceTo(rack.position) < 4,
    putLabel: '换划线车',
    onPutDown: (it, p) => {
      it.stow(rack);
      rack.userData.show?.('blower', true);
      p.give(marker);
    },
  });
  const lastTip = new THREE.Vector3(1e4, 0, 1e4);
  let paintSay = -10;
  let edgeSay = -10;

  // ── 球员席：撑伞补水 ──
  ['bench-w', 'bench-e'].forEach((id, i) => {
    const b = objs.get(id);
    if (!b) return;
    const at = b.position.clone().setY(1.1);
    play.add({
      id: `prep-${id}`,
      at: () => at,
      radius: 1.6,
      stand: () => [b.position.x, b.position.z + 0.95],
      label: (s) => {
        const st = life.state.benches[i];
        return !s.held && (!st.umbrella || !st.cooler) ? '撑伞·补水' : '';
      },
      canUse: (s) => {
        const st = life.state.benches[i];
        return !s.held && (!st.umbrella || !st.cooler);
      },
      onUse: (p) =>
        p.busy({
          name: 'prep',
          dur: 2.0,
          pose: 'pickup',
          face: [b.position.x, b.position.z],
          mid: () => life.prepBench(i),
          end: () => p.toast(i === 0 ? '西边球员席：伞撑开了、冰箱补满了' : '东边球员席：伞撑开了、冰箱补满了'),
        }),
    });
  });

  // ── 顶栏 ──
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const pct = (k: number) => `${Math.round(k * 100)}%`;
  const showStats = () => {
    const st = life.state;
    const ph = st.phase;
    const match =
      ph === 'pre'
        ? `开场 ${mmss(st.countdown)}`
        : ph === 'delay'
          ? `推迟 ${mmss(st.delayed)}`
          : ph === 'walkout'
            ? '出场'
            : ph === 'changeover'
              ? `换边 · ${st.games[0]}–${st.games[1]}`
              : ph === 'end' || ph === 'exit'
                ? '散场'
                : life.scoreText();
    play.stat('match', '比赛', match);
    const sand = life.sandMax();
    play.stat('sand', '沙', sand >= SAND_BLOCK ? `${pct(sand)} 挡开场` : sand > 0.05 ? pct(sand) : '✓');
    play.stat('lines', '底线', pct(life.lineGood()));
    const ready = st.benches.filter((b) => b.umbrella && b.cooler).length;
    play.stat('bench', '伞·水', `${ready}/2`);
    play.stat('cups', '杯子', st.cups > 0 ? st.cups : null);
    play.stat('crowd', '观众', pct(st.attendance));
  };
  let statAcc = 0;
  let hinted = false;
  let lastPhase = life.state.phase;

  const update = (dt: number) => {
    now += dt;
    life.setDirector(D.position);
    syncCourt();
    updateJet(dt);

    // 划线车
    if (marker.where === 'held') {
      const s = play.state();
      cart.userData.roll?.(dt, s.speed);
      cart.updateMatrixWorld(true);
      const tip = cart.localToWorld(tipLocal.clone());
      if (tip.distanceTo(lastTip) > 0.05) {
        lastTip.copy(tip);
        const n = life.paintAt(tip.x, tip.z);
        if (n && now - paintSay > 2.5) {
          paintSay = now;
          play.say(D, '补线', 0.9);
        }
      }
    }

    // 比赛中贴着场地边走：冒一句"比赛中，不能进场"（导航已经挡住了）
    if (closed && now - edgeSay > 4) {
      const R = MATCH_RECT;
      const dx = Math.max(R.x0 - D.position.x, 0, D.position.x - R.x1);
      const dz = Math.max(R.z0 - D.position.z, 0, D.position.z - R.z1);
      if (Math.hypot(dx, dz) < 0.36 && D.position.y < 0.3) {
        edgeSay = now;
        play.say(D, '比赛中，不能进场', 1.6);
      }
    }

    // 提示：开局一次；每场散场后一次
    if (!hinted && now > 1.2) {
      hinted = true;
      play.toast('开场前：工具架拿吹叶机，把场边的沙吹掉', 3.4);
    }
    const ph = life.state.phase;
    if (ph !== lastPhase) {
      if (ph === 'pre' && life.state.match > 1 && life.state.cups > 0) play.say(D, '看台上好多杯子…', 2.2);
      lastPhase = ph;
    }

    statAcc += dt;
    if (statAcc > 0.25) {
      statAcc = 0;
      showStats();
    }
  };
  showStats();
  return { update };
}
