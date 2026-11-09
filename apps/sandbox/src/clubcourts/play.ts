// clubcourts 的玩法接线（stage 3）：导航（三片场的围场、门、步道、南边沙地）+ 相机 + 总监的四件活。
// 走路、按钮、相机、气泡都是 clubsite/play 的；活的结果写进场面（hard-court 的 sand / squeegee）和 life.ts 的球车、发球机、捡球篮。
//
// 开局：总监在会员场南沿、手里拿着吹叶机（同白模的那一刻）。四件活（顺序玩家自己定，每件都有代价）：
//   吹沙    按住"吹沙" = blow 姿势（管口固定朝正前下方，setBlowSweep(false)）：摇杆转身 = 瞄准（边吹边慢慢走）。
//           锥里的沙往前推（sand.blow），推出南沿就没了；风从南边慢慢补回来（life.ts）。
//           比赛中在场边吹 = 太吵（抱怨）；不吹 = 沙爬进双打那一块，截击的人踩上去会滑（抱怨）。
//           吹叶机的家是南小路外的工具架（"挂回架子" / "拿吹叶机"）。
//   刮水    刮水板靠在会员场北围网上（"拿刮水板"）。按住"刮水" = squeegee 姿势，刮头贴地往前推的那一段把水往前挪（squeegee），
//           朝北推到场边、围网脚下就没了。比赛中走进双打那一块 = 打断这一分（抱怨）→ 等换边（场上空 8 秒）再进去。
//           喷雾开着水洼一直在长；小水泵上能"关喷雾"（不长了，但帆下等着的会员喊热）。
//   捡球    捡球器躺在青训西场南围网边（"拿起 捡球器"）：推着走（push），笼子经过的散球收进去（最多 60 个）。
//           回到教练的球车"倒进球车"（dump）：球车空了训练就停。也能倒进东场的捡球篮（给发球机备球）—— 球只有一份，给谁是取舍。
//   加球    发球机边的捡球篮（"拿起 捡球篮"），拎到机器旁"加球"（pour，一串球倒进球斗）；发球机空了少年干站着。
//           从会员场过去要走北门 → 两排场之间的步道 → 东场南门，是离会员场最远的一件活。
// 顶栏：会员场的沙 / 水（相对开局）、球车 / 发球机里的球、抱怨。
import * as THREE from 'three';
import { footprint, type Play, type Shape } from '../clubsite/play';
import type { RegionNav, RegionStart } from '../clubsite/region';
import {
  BLOCK_SHAPES,
  KIDS_ZONE,
  NAV_BOUNDS,
  PLAY_VIEW,
  PUMP,
  SLOTS,
  SPOTS,
  SQUEEGEE_LEAN,
  TARGET,
  WALK_RECTS,
} from './layout';
import type { CourtsLife } from './life';

/** 挡路的植物（树干 / 株半径，乘 slot 的缩放） */
const PLANT_R: Record<string, number> = { 'palo-verde': 0.45, 'smoke-tree': 0.5, creosote: 0.6, brittlebush: 0.45 };
/** 按包围盒挡路的东西（slot id） */
const BOXED = [
  'bench-m-w',
  'bench-m-e',
  'bench-pe',
  'water-pw',
  'water-m',
  'tool-rack',
  'ball-machine',
  'umbrella-parents',
  'bench-parents',
];

/** 独立页面的开局（main.ts 的 mountPlay；之后相机对准白模的构图 TARGET） */
export const COURTS_START: RegionStart = {
  start: SPOTS.blowNow,
  yaw: 0,
  // 竖屏：开局就是白模的构图（两张网在上面），总监在下面 —— 死区放大，人走出画面中段相机才跟
  camera: { lead: { portrait: 0, landscape: 0 }, dead: [2.5, 14], view: PLAY_VIEW },
  hint: '拖动走路 · 按住"吹沙"转身瞄准',
};
export { TARGET as COURTS_TARGET };

/** 第一步：导航（场景建好以后） */
export function courtsNav(objs: Map<string, THREE.Object3D>): RegionNav {
  const blocked: Shape[] = [...(BLOCK_SHAPES as Shape[]), KIDS_ZONE];
  for (const id of BOXED) {
    const o = objs.get(id);
    const r = o && footprint(o, 0.06);
    if (r) blocked.push(r);
  }
  // 记分牌：只挡两条腿那一条
  const sb = objs.get('scoreboard');
  if (sb) blocked.push({ a: [sb.position.x - 0.8, sb.position.z], b: [sb.position.x + 0.8, sb.position.z], r: 0.16 });
  for (const s of SLOTS) {
    const r = PLANT_R[s.asset];
    if (r) blocked.push({ x: s.x, z: s.z, r: r * (s.s ?? 1) });
  }
  return { bounds: NAV_BOUNDS, walkable: WALK_RECTS, blocked };
}

/** 第二步：总监的活（life 建好之后） */
export function registerCourtsJobs(
  play: Play,
  life: CourtsLife,
  env: { objs: Map<string, THREE.Object3D>; make(asset: string, variant: number): THREE.Object3D },
) {
  const { objs } = env;
  const D = play.director;
  const ud = D.userData;
  const scene = play.scene;
  const wp = (o: THREE.Object3D, dy = 0) => o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0));
  const heldId = () => play.held()?.id ?? '';

  // NPC 挡路；教练的球车也挡
  play.addBlocker(() => life.people());
  play.addBlocker(() => ({ x: life.cart.obj.position.x, z: life.cart.obj.position.z, r: 0.5 }));

  // ── 吹叶机：开局在手里；家在工具架 ──
  const rack = objs.get('tool-rack') as THREE.Object3D;
  // 架上的捡球器藏起来（场上躺着那把才是能拿的，免得两把）
  rack.userData.show?.('picker', false);
  const blowerObj = env.make('tool', 2);
  blowerObj.name = 'courts:blower';
  scene.add(blowerObj);
  ud.setBlowSweep?.(false);
  const blower = play.addItem({
    id: 'blower',
    name: '吹叶机',
    obj: blowerObj,
    prop: 'blower',
    radius: 1.1,
    use: {
      label: '吹沙',
      pose: 'blow',
      holdSpeed: 0.7,
      onHold: (dt) => {
        D.updateMatrixWorld(true);
        const n = ud.nozzle?.() as THREE.Vector3 | undefined;
        const d = ud.nozzleDir?.() as THREE.Vector3 | undefined;
        if (n && d) life.blowAt(n, d, dt);
        return true;
      },
    },
  });
  play.give(blower);
  const rackSlot = (rack.userData.slots as Record<string, { pos: THREE.Vector3; tool: THREE.Vector3 }> | undefined)
    ?.blower;
  const rackAt = () => rack.localToWorld((rackSlot?.tool ?? new THREE.Vector3(0, 1.2, 0)).clone());
  play.add({
    id: 'rack',
    at: rackAt,
    radius: 1.6,
    stand: () => {
      const p = rack.localToWorld((rackSlot?.pos ?? new THREE.Vector3(0, 0, 0.8)).clone());
      return [p.x, p.z];
    },
    pickLabel: () => (blower.where === 'away' ? '拿吹叶机' : ''),
    canPickUp: (s) => !s.held && blower.where === 'away',
    onPickUp: (p) => {
      rack.userData.show?.('blower', false);
      p.give(blower);
    },
    accepts: (it) => it.id === 'blower',
    putLabel: '挂回架子',
    onPutDown: (it) => {
      it.stow(rack);
      it.obj.visible = false;
      rack.userData.show?.('blower', true);
    },
  });

  // ── 刮水板：靠在会员场北围网上 ──
  const sqObj = objs.get('squeegee') as THREE.Object3D;
  const leanPos = sqObj.position.clone();
  const leanRot = sqObj.rotation.y;
  const squeegee = play.addItem({
    id: 'squeegee',
    name: '刮水板',
    obj: sqObj,
    radius: 1.1,
    carrySpeed: 2.4,
    use: {
      label: '刮水',
      pose: 'squeegee',
      holdSpeed: 0.8,
      onUse: () => {
        sqT = 0;
      },
      onHold: (dt) => {
        sqT += dt;
        const ph = (sqT / 1.6) % 1;
        if (ph < 0.55) {
          D.updateMatrixWorld(true);
          const tip = ud.toolTip?.() as THREE.Vector3 | null;
          if (tip && tip.y < 0.32) {
            const s = play.state();
            const moved = life.member.squeegee(tip.x, tip.z, Math.sin(s.yaw), Math.cos(s.yaw), 0.9);
            if (moved > 0.02) splash(tip, s.yaw);
          }
        }
        return true;
      },
    },
  });
  let sqT = 0;
  const lean = () => {
    squeegee.stow(scene, leanPos, leanRot);
    sqObj.userData.setState?.('lean');
  };
  lean();
  play.add({
    id: 'squeegee-lean',
    at: () => new THREE.Vector3(SQUEEGEE_LEAN[0], 1.0, SQUEEGEE_LEAN[1]),
    radius: 1.3,
    pickLabel: () => (squeegee.where === 'away' ? '拿刮水板' : ''),
    canPickUp: (s) => !s.held && squeegee.where === 'away',
    onPickUp: (p) => {
      sqObj.userData.setState?.('held');
      p.give(squeegee);
    },
    accepts: (it) => it.id === 'squeegee',
    putLabel: '靠回围网',
    onPutDown: () => lean(),
  });

  // ── 喷雾的小水泵：开 / 关 ──
  play.add({
    id: 'pump',
    at: () => new THREE.Vector3(PUMP[0], 0.4, PUMP[1]),
    radius: 1.3,
    label: (s) => (s.held ? '' : life.mist.on() ? '关喷雾' : '开喷雾'),
    canUse: (s) => !s.held,
    onUse: (p) =>
      p.busy({
        name: 'pump',
        dur: 0.7,
        pose: 'pickup',
        face: PUMP,
        mid: () => {
          life.mist.set(!life.mist.on());
          p.toast(life.mist.on() ? '喷雾开了 · 水洼会接着长' : '喷雾关了 · 帆下会热');
        },
      }),
  });

  // ── 捡球器：躺在青训西场南围网边 ──
  const pickerObj = objs.get('picker') as THREE.Object3D;
  const groundPicker = pickerObj.userData.picker as THREE.Object3D | undefined;
  const handPicker = ud.picker as THREE.Object3D | undefined;
  const PICK_MAX = 60;
  let inPicker = 0;
  const setPicker = (n: number) => {
    inPicker = Math.max(0, Math.min(PICK_MAX, n));
    handPicker?.userData.setCount?.(inPicker);
    groundPicker?.userData.setCount?.(inPicker);
  };
  const picker = play.addItem({
    id: 'picker',
    name: '捡球器',
    obj: pickerObj,
    prop: 'picker',
    radius: 1.3,
    carryPose: 'push',
    carrySpeed: 1.8,
  });
  picker.place(pickerObj.position.x, pickerObj.position.z, pickerObj.rotation.y);
  const lastCage = new THREE.Vector3();
  let fullSaid = false;

  // ── 教练的球车：倒球 ──
  const cart = life.cart.obj;
  const pour = (from: THREE.Vector3, to: THREE.Vector3, n: number) => life.pourBalls(from, to, n, 1.0);
  play.add({
    id: 'cart',
    at: () => wp(cart, 0.9),
    radius: 1.6,
    priority: 1,
    stand: () => [cart.position.x - 0.95, cart.position.z],
    label: (s) => (s.held?.id === 'picker' && inPicker > 0 ? `倒进球车 ${inPicker}` : ''),
    canUse: (s) => s.held?.id === 'picker' && inPicker > 0 && life.cart.count() < 60,
    onUse: (p) =>
      p.busy({
        name: 'dump',
        dur: 1.6,
        pose: 'dump',
        face: cart.position.clone(),
        mid: () => {
          const room = 60 - life.cart.count();
          const n = Math.min(room, inPicker);
          const cage = handPicker ? wp(handPicker, 0.3) : wp(D, 1.2);
          pour(cage, wp(cart, 0.95), n);
          life.cart.add(n);
          setPicker(inPicker - n);
          p.toast(`倒进球车 ${n} 个 · 车里 ${life.cart.count()}`);
        },
      }),
  });

  // ── 捡球篮 + 发球机 ──
  const hopper = life.hopper.obj;
  const hopperItem = play.addItem({
    id: 'hopper',
    name: '捡球篮',
    obj: hopper,
    // 拎着篮子侧边的提手：篮子挂在身侧（at 在篮身半高的西沿）
    grip: { at: [-0.3, 0.62, 0], axis: [0, -1, 0], up: [1, 0, 0], tip: [0, 0.9, 0] },
    radius: 1.1,
    carrySpeed: 2.0,
  });
  hopperItem.place(hopper.position.x, hopper.position.z, hopper.rotation.y);
  const machine = life.machine.obj;
  play.add({
    id: 'machine',
    at: () => wp(machine, 0.9),
    radius: 1.7,
    priority: 1,
    label: (s) => {
      if (s.held?.id !== 'hopper') return '';
      if (life.hopper.count() <= 0) return '篮子空了';
      return life.machine.count() >= 80 ? '机器满了' : '加球';
    },
    canUse: (s) => s.held?.id === 'hopper' && life.hopper.count() > 0 && life.machine.count() < 80,
    onUse: (p) => {
      let poured = false;
      p.busy({
        name: 'pour',
        dur: 2.2,
        pose: 'pour',
        face: machine.position.clone(),
        tick: (k) => {
          if (poured || k < 0.35) return;
          poured = true;
          const n = Math.min(life.hopper.count(), 80 - life.machine.count());
          D.updateMatrixWorld(true);
          const tip = (ud.toolTip?.() as THREE.Vector3 | null) ?? wp(hopper, 0.8);
          pour(tip, wp(machine, 1.0), n);
          life.machine.add(n);
          life.hopper.set(life.hopper.count() - n);
          p.toast(`加了 ${n} 个 · 机器里 ${life.machine.count()}`);
        },
      });
    },
  });
  // 篮子放在地上时：推着捡球器过来"倒进球篮"
  play.add({
    id: 'hopper-fill',
    at: () => wp(hopper, 0.8),
    radius: 1.5,
    label: (s) =>
      s.held?.id === 'picker' && inPicker > 0 && hopperItem.where === 'ground' ? `倒进球篮 ${inPicker}` : '',
    canUse: (s) => s.held?.id === 'picker' && inPicker > 0 && hopperItem.where === 'ground' && life.hopper.count() < 60,
    onUse: (p) =>
      p.busy({
        name: 'dump',
        dur: 1.6,
        pose: 'dump',
        face: hopper.position.clone(),
        mid: () => {
          const n = Math.min(60 - life.hopper.count(), inPicker);
          const cage = handPicker ? wp(handPicker, 0.3) : wp(D, 1.2);
          pour(cage, wp(hopper, 0.8), n);
          life.hopper.set(life.hopper.count() + n);
          setPicker(inPicker - n);
          p.toast(`倒进球篮 ${n} 个 · 篮里 ${life.hopper.count()}`);
        },
      }),
  });

  // ── 刮水时板前溅起的水珠（几颗白点，FX 层）──
  const DROPS = 24;
  const dropMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xd8ecf4 }),
    DROPS,
  );
  dropMesh.layers.set(1);
  dropMesh.castShadow = false;
  dropMesh.frustumCulled = false;
  scene.add(dropMesh);
  const drops = Array.from({ length: DROPS }, () => ({ t: 1, p: new THREE.Vector3(), v: new THREE.Vector3() }));
  let dropNext = 0;
  let dropAcc = 0;
  let splashSeed = 1;
  const rnd = () => {
    splashSeed = (splashSeed * 16807) % 2147483647;
    return splashSeed / 2147483647;
  };
  const splash = (tip: THREE.Vector3, yaw: number) => {
    dropAcc += 0.35;
    while (dropAcc > 1) {
      dropAcc--;
      const d = drops[dropNext];
      dropNext = (dropNext + 1) % DROPS;
      d.t = 0;
      const lat = (rnd() - 0.5) * 0.8;
      d.p.set(
        tip.x + Math.cos(yaw) * lat + Math.sin(yaw) * 0.1,
        0.05,
        tip.z - Math.sin(yaw) * lat + Math.cos(yaw) * 0.1,
      );
      d.v.set(Math.sin(yaw) * (0.8 + rnd()), 1.0 + rnd() * 0.8, Math.cos(yaw) * (0.8 + rnd()));
    }
  };
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  // ── 气泡：演出的 → play 的（同一个人一个）──
  const shown = new Set<string>();
  const seen = new Set<string>();

  // ── 提示：第一次出事时告诉玩家去哪 ──
  const told = new Set<string>();
  const tell = (key: string, text: string, ok: boolean) => {
    if (!ok) {
      told.delete(key);
      return;
    }
    if (told.has(key)) return;
    told.add(key);
    play.toast(text, 3);
  };
  let statT = 0;
  const pct = (k: number) => `${Math.round(Math.max(0, k) * 100)}%`;
  const showStats = () => {
    const r = life.courtReport();
    play.stat('court', '会员场', `沙 ${pct(r.sand)} 水 ${pct(r.water)}`);
    play.stat('balls', '球', `车 ${life.cart.count()} 机 ${life.machine.count()}`);
    play.stat('moan', '抱怨', life.state.complaints);
  };
  showStats();
  let lastPhase = '';

  return {
    /** 每步（play.update、life.update 之后） */
    update(dt: number) {
      const s = play.state();
      life.setDirector(D.position);

      // 捡球器：推着走时笼子经过的散球收进来
      if (heldId() === 'picker' && handPicker) {
        handPicker.updateWorldMatrix(true, false);
        const cage = handPicker.getWorldPosition(new THREE.Vector3());
        if (s.speed > 0.05) handPicker.userData.roll?.(dt, s.speed);
        if (cage.distanceTo(lastCage) > 0.04) {
          lastCage.copy(cage);
          if (inPicker < PICK_MAX) {
            const n = life.collect(cage.x, cage.z, 0.42, PICK_MAX - inPicker);
            if (n) setPicker(inPicker + n);
          } else if (!fullSaid) {
            fullSaid = true;
            play.say(D, '满了', 1.6);
          }
        }
        if (inPicker < PICK_MAX) fullSaid = false;
      }

      // 刮水的水珠
      drops.forEach((d, i) => {
        if (d.t < 0.5) {
          d.t += dt;
          d.v.y -= 9.8 * dt;
          d.p.addScaledVector(d.v, dt);
          if (d.p.y < 0.03) d.t = 1;
        }
        dropMesh.setMatrixAt(i, d.t < 0.5 ? m4.makeTranslation(d.p.x, d.p.y, d.p.z) : zero);
      });
      dropMesh.instanceMatrix.needsUpdate = true;

      // 气泡
      seen.clear();
      for (const b of life.bubbles()) {
        const key = `life:${b.who}`;
        seen.add(key);
        play.bubble(key, b.obj, b.text, b.dy);
      }
      for (const k of shown) if (!seen.has(k)) play.bubble(k, null);
      shown.clear();
      for (const k of seen) shown.add(k);

      // 提示
      const ph = life.phase();
      if (ph === 'changeover' && lastPhase !== 'changeover') play.toast('换边 · 场上空了，可以进去刮水、吹沙', 2.6);
      lastPhase = ph;
      tell('cart', '球车空了 · 推捡球器捡球，倒进球车', life.cart.count() <= 0);
      tell('machine', '发球机没球了 · 拎捡球篮去加球（东场）', life.machine.count() <= 0);

      statT -= dt;
      if (statT <= 0) {
        statT = 0.3;
        showStats();
      }
    },
  };
}
