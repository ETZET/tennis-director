// clubpickle 的玩法接线：导航（layout.ts 的 NAV）+ 总监的活（life.ts 的 jobs）登记成互动点和手里的东西（clubsite/play）。
//   器材箱      拿/放键"拿摇把" / "放回摇把"（箱子里的摇把 setItems 跟着藏 / 显示）
//   绞盘        1 号场南网柱：拿着摇把按住"摇网"（crank 姿势，4 秒 0→1；绷好 → 1 号场开放，队里两个人上场）
//   捡球器      靠在捡球篮西边：拿起来推着走（push），笼子压过的球收进去；到捡球篮"倒球"（dump）
//   备用水桶    前台北边（员工小门出去）：拿起来 → 水站"换水桶"（水位满，25 秒后前台再送一个过来）
//   伞 B        按"撑伞"（开始是收着的；撑开以后两个人过来坐）
// 每步：拿着捡球器走路 → jobs.sweep；顶栏（1 号场、排队、水、2 号场比分）；life 的提示 → toast。
import * as THREE from 'three';
import type { Play } from '../clubsite/play';
import type { RegionJobs, RegionStart } from '../clubsite/region';
import { SLOTS, SPOTS } from './layout';
import type { Life } from './life';

export interface PickleJobsEnv {
  /** 区域的根（独立页面 = scene）：按 slot:<id> 找摆件、收起摇把 */
  scene: THREE.Object3D;
  groundAt(x: number, z: number): number;
}

/** 独立页面的开局（main.ts 的 mountPlay；导航是 layout.ts 的 NAV） */
export const PICKLE_START: RegionStart = {
  start: [44.9, 5.75],
  yaw: 0,
  camera: { lead: { portrait: 1.4, landscape: 0.5 } },
  hint: '拖动走路 · 点地面走过去',
};

/** 总监的活登记到 play（互动点、手里的东西、挡路的人、顶栏）；返回每步要调的 step */
export function attachPickleJobs(play: Play, env: PickleJobsEnv, life: Life): RegionJobs {
  const { scene } = env;
  const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? null;
  const jobs = life.jobs;
  play.addBlocker(() => life.people());
  // 前台那边站着的会员（clubdesk 的 SLOTS，这个场景里不动）：当挡路圆（同 clubdesk 的 attachDeskJobs；藏起来的不挡）
  for (const s of SLOTS) {
    if (s.asset !== 'player' || !s.id.startsWith('member-')) continue;
    const o = slot(s.id);
    if (o) play.blockPerson(o, 0.28);
  }

  const at = (o: THREE.Object3D | null, dy = 0.6, fallback: readonly [number, number] = [0, 0]) =>
    o
      ? o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0))
      : new THREE.Vector3(fallback[0], dy, fallback[1]);
  const stand = (p: readonly [number, number]) => () => p;

  // ── 摇把：放在器材箱里（箱子里画的那个 setItems 显示），拿出来是人物模块的代用摇把 ──
  const gear = slot('gear-box');
  const crank = play.addItem({ id: 'crank', name: '摇把', obj: jobs.crankObj, radius: 0.8 });
  const stowCrank = () => {
    crank.stow(scene, new THREE.Vector3(SPOTS.gearBox[0], -5, SPOTS.gearBox[1]));
    jobs.crankObj.visible = false;
    jobs.gearCrank(true);
  };
  stowCrank();
  play.add({
    id: 'gear-box',
    at: () => at(gear, 0.7, SPOTS.gearBox),
    radius: 1.1,
    stand: stand(SPOTS.gearBox),
    pickLabel: '拿摇把',
    canPickUp: (s) => !s.held && crank.where === 'away',
    onPickUp: (p) => {
      jobs.gearCrank(false);
      jobs.crankObj.visible = true;
      p.give(crank);
    },
    accepts: (it) => it.id === 'crank',
    putLabel: '放回摇把',
    onPutDown: () => stowCrank(),
  });

  // ── 绞盘：拿着摇把按住"摇网" ──
  let warned = 0;
  play.add({
    id: 'net-crank',
    at: () => jobs.winch.clone(),
    radius: 1.05,
    stand: stand(SPOTS.netCrank1),
    priority: 2,
    // 拿着摇把才显示
    label: (s) => (jobs.tension() < 1 && s.held?.id === 'crank' ? '摇网' : ''),
    canUse: (s) => jobs.tension() < 1 && s.held?.id === 'crank',
    onUse: (p) => {
      if (p.held()?.id !== 'crank' && p.state().t > warned) {
        warned = p.state().t + 2;
        p.toast('先去器材箱拿摇把');
        p.say(jobs.director, '摇把呢？', 1.5);
      }
    },
    onHold: (dt, p) => {
      if (p.held()?.id !== 'crank') return false;
      const done = jobs.crankStep(dt);
      if (done) p.toast('网绷好了：1 号场开放', 2.4);
      return !done;
    },
    pose: 'crank',
    autoUse: false,
  });

  // ── 捡球器：靠在捡球篮边；拿着推（push），笼子压过的球收进去；捡球篮"倒球" ──
  const picker = play.addItem({
    id: 'picker',
    name: '捡球器',
    obj: jobs.pickerObj,
    prop: 'picker',
    carryPose: 'push',
    carrySpeed: 2.3,
    radius: 1.0,
  });
  picker.place(SPOTS.pickerRest[0], SPOTS.pickerRest[1], 0.35);
  const hopper = slot('basket');
  play.add({
    id: 'hopper',
    at: () => at(hopper, 0.8, SPOTS.basket),
    radius: 1.2,
    stand: stand([SPOTS.basket[0], SPOTS.basket[1] - 0.95]),
    label: (s) => (s.held?.id === 'picker' && jobs.pickerCount() > 0 ? '倒球' : ''),
    canUse: (s) => s.held?.id === 'picker' && jobs.pickerCount() > 0,
    onUse: (p) =>
      p.busy({
        name: 'dump',
        dur: 1.6,
        pose: 'dump',
        face: hopper ? hopper.position.clone() : undefined,
        mid: (pp) => {
          const n = jobs.dumpPicker();
          if (n) pp.toast(`倒进捡球篮：${n} 个${jobs.ballsLeft() ? `（场上还有 ${jobs.ballsLeft()} 个）` : ''}`);
        },
      }),
  });

  // ── 水桶：前台北边的备用水桶 → 水站"换水桶" ──
  const jug = jobs.jugObj
    ? play.addItem({ id: 'jug', name: '水桶', obj: jobs.jugObj, grip: jobs.jugGrip, carrySpeed: 2.2, radius: 0.9 })
    : null;
  jug?.place(jobs.spareAt.x, jobs.spareAt.z, 0);
  const station = slot('water-court');
  play.add({
    id: 'water',
    at: () => at(station, 1.1, SPOTS.water),
    radius: 1.4,
    stand: stand(SPOTS.water),
    accepts: (it) => it.id === 'jug',
    putLabel: '换水桶',
    onPutDown: (it) => {
      it.stow(scene, jobs.spareAt.clone().setY(-5));
      it.obj.visible = false;
      jobs.refill();
      jobs.spareUsed();
      play.toast('换上新水桶');
    },
  });

  // ── 伞 B：撑开 ──
  const umb = slot('umbrella-b');
  play.add({
    id: 'umbrella-b',
    at: () => at(umb, 1.2, SPOTS.umbrellaB),
    radius: 1.1,
    stand: stand(SPOTS.umbrellaB),
    label: () => (jobs.umbrella() < 1 ? '撑伞' : ''),
    canUse: () => jobs.umbrella() < 1,
    onUse: (p) =>
      p.busy({
        name: 'umbrella',
        dur: 1.4,
        pose: 'pickup',
        face: umb ? umb.position.clone() : undefined,
        tick: () => jobs.umbrellaStep(1 / 60),
        end: () => jobs.umbrellaStep(1),
      }),
  });

  // ── 每步 ──
  let statT = 0;
  const step = (dt: number) => {
    const s = play.state();
    if (s.held?.id === 'picker') jobs.sweep(dt, s.speed);
    // 前台送来的备用水桶（life 到时间把它摆回原处）
    if (jug && jug.where === 'away' && jobs.jugObj?.userData.respawned) {
      jobs.jugObj.userData.respawned = false;
      jug.place(jobs.spareAt.x, jobs.spareAt.z, 0);
    }
    const t = life.takeToast();
    if (t) play.toast(t, 2.2);
    statT -= dt;
    if (statT <= 0) {
      statT = 0.25;
      const st = life.stats();
      play.stat('court1', '1号场', st.court1);
      play.stat('queue', '排队', `${st.queue}人`);
      play.stat('water', '水', `${st.water}%`);
      play.stat('score', '比分', st.score);
    }
  };
  return { step };
}
