// clubclay 的玩法（stage 3）：总监在远场 outer_2 维护红土，近场照常比赛（life.ts）。走路、按钮、相机、气泡都是 clubsite/play 的；
// 这里只登记这个场景的东西和活，再把它们的结果写进红土场面（assets/clay-court.ts 的 userData.clay）。
//
// 远场的三件活（顺序玩家自己定，每件都有代价）：
//   拖场  拿起拖垫（"拿起 拖垫"）→ 拉着走（drag 姿势，1.1 米/秒）：拖垫按"拖车"跟在绳子后面，走过的格子 → 刚拖平（clay.drag），
//         线上盖一层土，脚印、球印抹掉；后沿扬一点土。放下：拖垫留在原地。
//   扫线  拿起扫线刷（push 姿势推着走，1.3 米/秒）：刷头走过的线段 tapeDust → tape（clay.sweepAt）。拖过的线不扫 = 看不清。
//   浇水  从卷盘拉水管（"拿水管"）：水管跟着人放线（卷盘 follow()，最多 18 米，拉到头走不出去）；按住"浇水" = water 姿势，
//         喷头前一道水珠，落点一圈 → 湿（clay.water）。浇太多（同一处浇透还接着浇）= 积水，干得慢 → "开场延后"；
//         一直不浇、场面干 = 风一吹慢慢起尘（clay.wear）。放下水管：喷头躺在原地；回到卷盘"收水管"。
//   时间：每 0.5 秒 dryStep（浇透到干 DRY_SECONDS 秒）。
// 取舍（玩法准则 2）：总监在远场时近场没人管 —— 水站空了没人换，换边时球员没水喝（life.state.complaints）；
//   走进近场双打线以内 = 打断这一分（life：重发）。场边的"换水桶"要总监自己走过去。
// 顶栏：远场的状况（clay.stats()：拖平 / 线 / 湿 / 起尘 → 一句结论）、近场比分、水站水位。
import * as THREE from 'three';
import { footprint, type Item, type Play, type Shape } from '../clubsite/play';
import type { AssetCtx } from './ctx';
import { BLOCK_SHAPES, DRY_SECONDS, FAR, type Rect, WALK_RECTS } from './layout';
import type { ClayLife } from './life';

/** 远场红土的 API（clay-court.ts 的 userData.clay） */
export interface FarClay {
  drag(x: number, z: number, dirX: number, dirZ: number, width?: number, len?: number): void;
  sweepAt(x: number, z: number, r?: number): void;
  water(x: number, z: number, r: number, amount?: number): void;
  dryStep(dt: number, secondsToDry?: number): void;
  wear(x: number, z: number, r: number, amount: number): void;
  step(x: number, z: number, dirX: number, dirZ: number, side?: number): void;
  at(x: number, z: number): { wet: number; dust: number; state: string };
  stats(): { wet: number; brushed: number; normal: number; dusty: number; tape: Record<string, number> };
}

/** 导航的静态挡路：layout 的形状 + 摆好的资产量出来的脚印 */
export function navShapes(objs: Map<string, THREE.Object3D>): { walkable: Shape[]; blocked: Shape[] } {
  const blocked: Shape[] = [...(BLOCK_SHAPES as Shape[])];
  for (const id of ['umpire-chair', 'bench-w', 'bench-e', 'bench-s', 'water-station', 'tool-rack', 'bench-walk']) {
    const o = objs.get(id);
    const r = o ? footprint(o, 0.05) : null;
    if (r) blocked.push(r);
  }
  // 记分牌：只挡两条腿那一条（牌子悬在上面）
  const sb = objs.get('scoreboard');
  if (sb) blocked.push({ a: [sb.position.x - 0.85, sb.position.z], b: [sb.position.x + 0.85, sb.position.z], r: 0.2 });
  return { walkable: WALK_RECTS as Shape[], blocked };
}

const FAR_RECT: Rect = { x0: FAR.x - FAR.hx, x1: FAR.x + FAR.hx, z0: FAR.z - FAR.hz, z1: FAR.z + FAR.hz };
const onFar = (x: number, z: number) => x > FAR_RECT.x0 && x < FAR_RECT.x1 && z > FAR_RECT.z0 && z < FAR_RECT.z1;

export interface ClayPlay {
  update(dt: number): void;
  /** 远场状况（顶栏、测试） */
  report(): { brushed: number; lines: number; wet: number; dusty: number; puddle: number; status: string };
}

export function setupClayPlay(o: {
  play: Play;
  objs: Map<string, THREE.Object3D>;
  life: ClayLife;
  far: FarClay;
  near: { step(x: number, z: number, dirX: number, dirZ: number, side?: number): void } | null;
  ctx: AssetCtx;
  scene: THREE.Scene;
}): ClayPlay {
  const { play, objs, life, far, near, ctx, scene } = o;
  const D = play.director;
  const ud = D.userData;
  const rnd = ctx.rng('clay-play');
  let now = 0;

  // NPC 挡路、总监位置给演出（闯进近场 = 打断）
  play.addBlocker(() => life.people());

  // ── 拖垫：拿起后按"拖车"跟在绳子后面 ──────────────────────────
  const mat = objs.get('drag-mat') as THREE.Object3D;
  const MAT_TOW = 1.75; // 绳头（腰后）到垫子中心的水平距离
  const matItem = play.addItem({
    id: 'drag-mat',
    name: '拖垫',
    obj: mat,
    // 不挂到手上：用一个不存在的道具名（人物手里空着，drag 姿势自己画攥着的绳子），垫子由这里每步摆
    prop: 'drag-mat',
    radius: 2.3,
    carryPose: 'drag',
    carrySpeed: 1.1,
  });
  const matPos = new THREE.Vector3(mat.position.x, 0, mat.position.z);
  let matYaw = mat.rotation.y;
  const lastDrag = matPos.clone();
  let matWasHeld = false;
  const restRope = () => mat.userData.setRopeEnd?.(new THREE.Vector3(-1.95, 0.05, 0.1));
  matItem.place(matPos.x, matPos.z, matYaw);
  restRope();
  const towMat = () => {
    const rp = (ud.ropePoint?.() as THREE.Vector3 | undefined) ?? D.position.clone();
    const dx = rp.x - matPos.x;
    const dz = rp.z - matPos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > MAT_TOW) {
      matPos.x += (dx / d) * (d - MAT_TOW);
      matPos.z += (dz / d) * (d - MAT_TOW);
    }
    matYaw = Math.atan2(dz / d, -dx / d);
    mat.visible = true;
    mat.position.set(matPos.x, 0, matPos.z);
    mat.rotation.set(0, matYaw, 0);
    mat.updateMatrixWorld(true);
    mat.userData.setRopeEnd?.(mat.worldToLocal(rp.clone()));
    // 走过的地方拖平（每挪 5 厘米压一下：方向 = 挪的方向）
    const mx = matPos.x - lastDrag.x;
    const mz = matPos.z - lastDrag.z;
    const md = Math.hypot(mx, mz);
    if (md > 0.05) {
      if (onFar(matPos.x, matPos.z)) {
        // 后沿：垫子中心往后 0.5 米 —— 那儿要是起尘的，扬一小团土
        const bx = matPos.x - (mx / md) * 0.55;
        const bz = matPos.z - (mz / md) * 0.55;
        const dusty = far.at(bx, bz).state === 'dusty';
        far.drag(matPos.x, matPos.z, mx, mz, 2.4, 1.0);
        if (dusty && rnd() < 0.35) life.puff(new THREE.Vector3(bx + (rnd() - 0.5) * 1.8, 0, bz), 0.2, 1);
      }
      lastDrag.copy(matPos);
    }
  };

  // ── 扫线刷 ──────────────────────────────────────────────
  const brush = objs.get('line-brush') as THREE.Object3D;
  const brushItem = play.addItem({
    id: 'line-brush',
    name: '扫线刷',
    obj: brush,
    radius: 1.3,
    carryPose: 'push',
    carrySpeed: 1.3,
  });
  brushItem.place(brush.position.x, brush.position.z, brush.rotation.y);
  const lastBrush = new THREE.Vector3();

  // ── 水管：喷头是拿得起的东西，水管跟着人放线 ──────────────────
  const reel = objs.get('hose-reel') as THREE.Object3D;
  const nozzle = reel.userData.nozzle as THREE.Object3D;
  const reelAt = reel.position.clone();
  let watering = false;
  const hoseItem: Item = play.addItem({
    id: 'hose',
    name: '水管',
    obj: nozzle,
    grip: nozzle.userData.grip,
    radius: 1.1,
    carrySpeed: 2.2,
    use: {
      label: '浇水',
      pose: 'water',
      holdSpeed: 0.8,
      onHold: () => {
        watering = true;
        return true;
      },
      onRelease: () => {
        watering = false;
      },
    },
  });
  // 地上的喷头（还挂在卷盘下面，躺在水管尽头）：走近 "拿水管"
  const nozzleWorld = () => nozzle.getWorldPosition(new THREE.Vector3());
  play.add({
    id: 'hose-pick',
    at: nozzleWorld,
    radius: 1.1,
    pickLabel: '拿水管',
    canPickUp: (s) => !s.held && hoseItem.where !== 'held',
    onPickUp: (p) => p.give(hoseItem),
  });
  // 卷盘：拿着水管走回来 = 收水管（喷头挂回卷盘、水管卷回去）；空手时水管铺在外面也能直接收
  const reelIn = () => {
    reel.userData.reelIn?.();
  };
  play.add({
    id: 'hose-reel',
    at: () => reelAt.clone().setY(0.6),
    radius: 1.5,
    accepts: (it) => it.id === 'hose',
    putLabel: '收水管',
    onPutDown: (it) => {
      it.stow(reel, new THREE.Vector3(0, 0, 0));
      reelIn();
      play.toast('水管收好了');
    },
    pickLabel: () => ((reel.userData.length as number) > 2.5 && hoseItem.where !== 'held' ? '收水管' : ''),
    canPickUp: (s) => !s.held && hoseItem.where !== 'held' && (reel.userData.length as number) > 2.5,
    onPickUp: () => {
      reelIn();
      play.toast('水管收好了');
    },
  });
  // 拉到头：拿着水管时，离卷盘 17 米外有一圈挡路的圆（水管放满 18 米，留一米从卷盘落到地上）
  const RING_R = 17;
  const ring: { x: number; z: number; r: number }[] = [];
  for (let a = 0; a < Math.PI * 2; a += 0.9 / RING_R)
    ring.push({ x: reelAt.x + Math.cos(a) * RING_R, z: reelAt.z + Math.sin(a) * RING_R, r: 0.5 });
  play.addBlocker(() => (hoseItem.where === 'held' ? ring : null));
  let tautSaid = -10;

  // 浇水的水珠：小方块，从喷口沿喷的方向射出去、落到地上就没了
  const DROPS = 60;
  const dropMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(ctx.texel * 1.2, ctx.texel * 1.2, ctx.texel * 1.2),
    ctx.mat('foam', { noShadowReceive: true, bands: [-2, -1] }),
    DROPS,
  );
  dropMesh.layers.set(ctx.layers.FX);
  dropMesh.castShadow = false;
  dropMesh.frustumCulled = false;
  scene.add(dropMesh);
  const drops = Array.from({ length: DROPS }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3() }));
  let dropNext = 0;
  let dropAcc = 0;
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  // ── 浇了多少（1 米一格）：1 = 浇透；> 1 = 还在接着浇 = 积水（干得慢）──
  const SX = Math.ceil(FAR.hx * 2);
  const SZ = Math.ceil(FAR.hz * 2);
  const soak = new Float32Array(SX * SZ);
  const soakAt = (x: number, z: number) => {
    const i = Math.floor(x - FAR_RECT.x0);
    const j = Math.floor(z - FAR_RECT.z0);
    return i >= 0 && j >= 0 && i < SX && j < SZ ? j * SX + i : -1;
  };
  // 开局：layout 里西半场浇过的那一块（clay-court 预设）当成刚好浇透
  for (let j = 0; j < SZ; j++)
    for (let i = 0; i < SX; i++) soak[j * SX + i] = far.at(FAR_RECT.x0 + i + 0.5, FAR_RECT.z0 + j + 0.5).wet;
  const waterAt = (x: number, z: number, dt: number) => {
    if (!onFar(x, z)) return;
    const R = 1.05;
    let peak = 0;
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const k = soakAt(x + dx, z + dz);
        if (k < 0) continue;
        const cx = FAR_RECT.x0 + (k % SX) + 0.5;
        const cz = FAR_RECT.z0 + Math.floor(k / SX) + 0.5;
        const f = Math.max(0, 1 - Math.hypot(cx - x, cz - z) / 1.7);
        soak[k] = Math.min(3, soak[k] + 0.8 * dt * f);
        if (dx === 0 && dz === 0) peak = soak[k];
      }
    far.water(x, z, R, Math.min(1, peak));
  };

  // ── 地上的脚印（远场、近场：走路时每一步）──
  let stepAcc = 0;
  let stepSide = 1;
  const lastPos = D.position.clone();

  // ── 状况 ──
  let dryAcc = 0;
  let windAcc = 0;
  let rep = { brushed: 0, lines: 0, wet: 0, dusty: 0, puddle: 0, status: '' };
  const report = () => {
    const s = far.stats();
    const t = Object.values(s.tape);
    const lines = 1 - t.reduce((a, b) => a + b, 0) / Math.max(1, t.length);
    let puddle = 0;
    let maxSoak = 0;
    for (const v of soak) {
      if (v > 1.6) puddle++;
      maxSoak = Math.max(maxSoak, v);
    }
    const puddleK = puddle / soak.length;
    let status: string;
    if (puddleK > 0.02) status = `积水 等 ${Math.ceil(Math.max(0, maxSoak - 1.6) * DRY_SECONDS)} 秒`;
    else if (s.dusty > 0.2) status = '起尘';
    else if (s.brushed + s.wet < 0.6) status = '没拖完';
    else if (lines < 0.8) status = '线不清';
    else if (s.wet < 0.05) status = '太干';
    else status = '能开场 ✓';
    rep = { brushed: s.brushed, lines, wet: s.wet, dusty: s.dusty, puddle: puddleK, status };
    return rep;
  };
  const pct = (k: number) => `${Math.round(k * 100)}%`;
  const showStats = () => {
    const r = report();
    play.stat('far', '远场', r.status);
    play.stat('clay', '拖·线·湿', `${pct(r.brushed + r.wet * 0.5)} ${pct(r.lines)} ${pct(r.wet)}`);
    const lvl = life.state.water;
    play.stat('water', '水站', lvl <= 0.01 ? '空！' : pct(lvl));
  };
  showStats();
  let statAcc = 0;

  // ── 水站：换满桶（总监自己走过去）──
  const station = objs.get('water-station');
  if (station)
    play.add({
      id: 'water-jug',
      at: () => station.position.clone().setY(0.9),
      radius: 1.4,
      label: (s) => (!s.held && life.state.water < 0.99 ? '换水桶' : ''),
      canUse: (s) => !s.held && life.state.water < 0.99,
      onUse: (p) =>
        p.busy({
          name: 'jug',
          dur: 1.8,
          pose: 'pickup',
          face: [station.position.x, station.position.z],
          mid: () => {
            life.refillWater();
            showStats();
          },
          end: () => p.toast('水桶换满了'),
        }),
    });

  // 演出的气泡 → play 的气泡（同一个人一个）
  const shown = new Set<string>();

  const update = (dt: number) => {
    now += dt;
    const s = play.state();
    life.setDirector(D.position);

    // 拖垫
    const matHeld = matItem.where === 'held';
    if (matHeld) {
      if (!matWasHeld) {
        matPos.set(mat.position.x, 0, mat.position.z);
        lastDrag.copy(matPos);
      }
      towMat();
    } else if (matWasHeld || (matItem.where === 'ground' && mat.position.distanceTo(matPos) > 0.01)) {
      // 放下（不管是按"放下"还是换了别的东西）：垫子留在刚才拖着的地方
      matItem.place(matPos.x, matPos.z, matYaw);
      restRope();
    }
    matWasHeld = matHeld;

    // 扫线：刷头贴地走过的线段扫干净
    if (brushItem.where === 'held' && s.speed > 0.1) {
      const tip = ud.toolTip?.() as THREE.Vector3 | null;
      if (tip && tip.y < 0.25 && tip.distanceTo(lastBrush) > 0.04) {
        far.sweepAt(tip.x, tip.z, 0.32);
        lastBrush.copy(tip);
        if (rnd() < 0.08) life.puff(new THREE.Vector3(tip.x, 0, tip.z), 0.12, 1);
      }
    }

    // 水管
    if (hoseItem.where === 'held') {
      const r = reel.userData.follow?.() as { length: number; taut: boolean } | undefined;
      if (r?.taut && now - tautSaid > 3) {
        tautSaid = now;
        play.say(D, '水管到头了', 1.6);
      }
    } else if (hoseItem.where === 'ground') {
      // 随手放下：喷头挂回卷盘下面（不能直接拿：走近 "拿水管"），水管铺到放下的地方
      const wp = nozzleWorld();
      reel.updateMatrixWorld(true);
      hoseItem.stow(reel, reel.worldToLocal(wp));
      reel.userData.follow?.();
      watering = false;
    }
    if (watering && hoseItem.where === 'held') {
      const tip = (ud.nozzle?.() as THREE.Vector3 | undefined) ?? D.position.clone().setY(0.9);
      const dir = ((ud.nozzleDir?.() as THREE.Vector3 | undefined) ?? new THREE.Vector3(0, -0.5, 1)).clone();
      const h = Math.hypot(dir.x, dir.z) || 1;
      const land = new THREE.Vector3(tip.x + (dir.x / h) * 2.1, 0, tip.z + (dir.z / h) * 2.1);
      waterAt(land.x, land.z, dt);
      dropAcc += dt * 70;
      while (dropAcc > 1) {
        dropAcc--;
        const d = drops[dropNext];
        dropNext = (dropNext + 1) % DROPS;
        d.on = true;
        d.p.copy(tip);
        const sp = 3.6 + rnd() * 1.4;
        d.v.set((dir.x / h) * sp + (rnd() - 0.5) * 0.8, 1.2 + rnd() * 0.8, (dir.z / h) * sp + (rnd() - 0.5) * 0.8);
      }
    } else dropAcc = 0;
    drops.forEach((d, i) => {
      if (d.on) {
        d.v.y -= 9.8 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < 0.04) d.on = false;
      }
      if (d.on) m4.makeTranslation(d.p.x, d.p.y, d.p.z);
      dropMesh.setMatrixAt(i, d.on ? m4 : zero);
    });
    dropMesh.instanceMatrix.needsUpdate = true;

    // 脚印：空手 / 拿扫线刷走路时每一步一个（拖垫自己会抹掉）
    const mv = Math.hypot(D.position.x - lastPos.x, D.position.z - lastPos.z);
    if (mv > 0 && mv < 0.5 && !matHeld) {
      stepAcc += mv;
      if (stepAcc > 0.62) {
        stepAcc = 0;
        const dx = D.position.x - lastPos.x;
        const dz = D.position.z - lastPos.z;
        if (onFar(D.position.x, D.position.z)) far.step(D.position.x, D.position.z, dx, dz, stepSide);
        else near?.step(D.position.x, D.position.z, dx, dz, stepSide);
        stepSide = -stepSide;
      }
    }
    lastPos.copy(D.position);

    // 晾干、积水慢慢退；一直干着 → 风把场面吹得起尘
    dryAcc += dt;
    if (dryAcc >= 0.5) {
      far.dryStep(dryAcc, DRY_SECONDS);
      const k = dryAcc / DRY_SECONDS;
      for (let i = 0; i < soak.length; i++) if (soak[i] > 0) soak[i] = Math.max(0, soak[i] - k);
      dryAcc = 0;
    }
    windAcc += dt;
    if (windAcc >= 2) {
      windAcc = 0;
      if (rep.wet < 0.06) {
        for (let k = 0; k < 4; k++) {
          const x = FAR_RECT.x0 + 1 + rnd() * (FAR.hx * 2 - 2);
          const z = FAR_RECT.z0 + 1 + rnd() * (FAR.hz * 2 - 2);
          if (soak[soakAt(x, z)] > 0.3) continue;
          far.wear(x, z, 1.4, 0.07);
          if (k < 2) life.puff(new THREE.Vector3(x, 0, z), 0.3, 2);
        }
      }
    }

    // 气泡
    const seen = new Set<string>();
    for (const b of life.bubbles()) {
      const key = `life:${b.who}`;
      seen.add(key);
      play.bubble(key, b.obj, b.text, b.dy);
    }
    for (const k of shown) if (!seen.has(k)) play.bubble(k, null);
    shown.clear();
    for (const k of seen) shown.add(k);

    statAcc += dt;
    if (statAcc > 0.5) {
      statAcc = 0;
      showStats();
    }
  };

  return { update, report: () => rep };
}
