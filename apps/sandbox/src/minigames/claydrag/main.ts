// 小游戏 3 · 红土拖场（红土场，clubclay）：远场 outer_2 刚打完，东半场全是脚印、滑步痕，白线盖在土下面。120 秒里两件活：
//   拖场  开局手里就拉着拖垫（场景的 drag-mat，绳搭肩上的 drag 姿势）：垫子按"拖车"跟在身后 1.75 米，压过的地方梳成一道道整齐的纹
//         （红土场面自己的状态网格：起尘 → 刚拖平），一道 1.8 米宽。重叠的地方不加分、白费时间：一道道来回拖或者绕圈往里转最省。
//   扫线  北边围网下的工具架「换扫线刷」（拖垫挂到围网上），推着刷子沿白线走：刷头扫过的那一截露出白线。7 条线一条条数。
//   别踩  手里没拖垫时踩在刚拖平的土上 = 脚印回来了（那一小块变回起尘，−4 分）；白线上随便走（扫线本来就得踩在线上）。
//   捣乱  第 25、50 秒近场飞过来一个球，有个孩子从东门跑进来捡，一路踩出脚印（要补拖）。
// 分：拖平每 1% 8 分 + 每条线 60 分 − 每脚 4 分；拖平 ≥ 94% 且 7 条线全扫完 = 完工，剩下的每秒 +8。
// 顶栏：拖平 %、白线 n/7；左下小地图（亮 = 拖平、暗 = 没拖、金点 = 最大的一块没拖的）；场上箭头指着最大的一块没拖的 / 最近的一截脏线 / 工具架。
// 场面：场景原样（近场照常打双打，life 开着；不 attach 场景自己的远场活 —— 水管、浇水那套），卷盘收走，工具架从东步道搬到北边围网下。
// 星级线（bot：先绕网边一道再东西来回 8 道 → 换刷 → 沿线走一圈）：见 rules.ts 的 STARS。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { type ClayState, TAPE_STEP } from '../../clubclay/assets/clay/state';
import { CLOUDS, DIM, FAR } from '../../clubclay/layout';
import { createClayRegion } from '../../clubclay/scene';
import { ballKit } from '../../clubsite/assets/tennis-ball';
import type { Item, Shape } from '../../clubsite/play';
import { mountMinigame } from '../shell';
import { createMinimap, type MiniLine } from './minimap';
import {
  cellsIn,
  comb,
  coverage,
  DONE_COVER,
  DURATION,
  eastLines,
  footAt,
  isDone,
  LINE_DONE,
  LINE_PTS,
  LINE_SAFE,
  largestPatch,
  lineProgress,
  liveScore,
  MAT_LEN,
  nearestDirty,
  nearLine,
  PTS_PER_PCT,
  type Rect,
  STARS,
  STEP_PENALTY,
  SWATH,
  scuffEast,
  settle,
  TAPE_CLEAN,
  trample,
} from './rules';

/** 远场中心（红土场面的本地原点，场面没转） */
const OX = FAR.x;
const OZ = FAR.z;
/** 算覆盖率的那一片（本地米）：东半场双打线外各留 0.6～0.8 米，网边让开 0.4 米 */
const RECT: Rect = { x0: 0.4, x1: 12.5, z0: -6.3, z1: 6.3 };
const inRect = (x: number, z: number) => x >= RECT.x0 && x <= RECT.x1 && z >= RECT.z0 && z <= RECT.z1;
/** 工具架：北边围网下（开口朝南、朝镜头），总监站在它前面换工具 */
const RACK: [number, number] = [25.2, 17.35];
const RACK_STAND: [number, number] = [25.2, 18.45];
/** 扫线刷靠在工具架左前；拖垫挂在工具架东边的围网上 */
const BRUSH_AT = new THREE.Vector3(24.35, 0, 18.1);
const MAT_HANG = new THREE.Vector3(28.1, 0, 16.8);
/** 开局：东北角、第一道上，朝西拉着拖垫（垫子在身后东边）：往西一直走就是第一道 */
const START: [number, number] = [30.4, 19.6];
/** 拉着拖垫 / 推着扫线刷走多快（米/秒；空手 3） */
const DRAG_SPEED = 2.4;
const BRUSH_SPEED = 2.8;
/** 绳头（腰后）到垫子中心的水平距离 */
const MAT_TOW = 1.75;
/** 扫线刷扫多宽（刷头 0.6 米，算半径 0.4：手机上摇杆抖一点也扫得到） */
const BRUSH_R = 0.45;
/** 捣乱：第几秒近场飞过来一个球 */
const KID_AT = [25, 50];
/** 东门（远场东围网 z 19.6 的口子），孩子从门外进来 */
const DOOR_OUT: [number, number] = [35.0, 19.6];
const DOOR_IN: [number, number] = [32.8, 19.6];

mountMinigame({
  id: 'claydrag',
  title: '红土拖场',
  tag: '小游戏 3 · 红土场',
  goal: '远场刚打完，东半场全是脚印。120 秒里把红土拖平、再把盖在土下的白线扫出来！',
  howto: [
    '拖动画面走路：拖垫跟在身后，压过的地方梳成整齐的纹',
    '一道道来回拖或绕圈往里转，重叠白费时间',
    '拖完去北边工具架「换扫线刷」，沿白线走把线扫出来',
    '没拉拖垫别踩拖平的土（会留脚印扣分）；白线上随便走',
  ],
  region: createClayRegion,
  clouds: CLOUDS,
  life: true,
  attach: false,
  hour: 17,
  weather: 'clear',
  start: { start: START, yaw: -Math.PI / 2 },
  // 竖屏 14.7 米宽：东半场（网到东底线后 2.5 米）+ 工具架整个在画面里；相机钉死（view 缩成一个点 = 不跟人走）
  zoom: 0.84,
  camera: { view: { x0: 24.4, x1: 24.4, z0: 30.0, z1: 30.0 } },
  nav: (n) => ({
    ...n,
    blocked: [
      // 卷盘收走了：它的挡路圆也去掉
      ...(n.blocked ?? []).filter((b) => !('r' in b && 'x' in b && b.x === 29.9 && b.z === 20.4)),
      { x0: RACK[0] - 1.25, x1: RACK[0] + 1.25, z0: RACK[1] - 0.45, z1: RACK[1] + 0.45 } as Shape,
    ],
  }),
  duration: DURATION,
  stars: STARS,
  setup(mg) {
    const { scene, play, region } = mg;
    const { objs, kit } = region;
    const D = play.director;
    const ud = D.userData;
    const farObj = objs.get('clay-far') as THREE.Object3D;
    const far = farObj.userData.clay as { state: ClayState; reset(name: string): void };
    const S = far.state;
    const cells = cellsIn(S, RECT);
    const tasks = eastLines(S, TAPE_STEP);
    const toLocal = (x: number, z: number): [number, number] => [x - OX, z - OZ];
    const toWorld = (x: number, z: number, y = 0) => new THREE.Vector3(x + OX, y, z + OZ);

    // ── 场面 ──
    const reel = objs.get('hose-reel');
    if (reel) reel.visible = false;

    // 工具架（clubsite 的，架上原来的扫帚、吹叶机、捡球器收起来）
    const rack = kit.makeAsset('tool-rack', 0).obj;
    rack.name = 'claydrag:rack';
    rack.position.set(RACK[0], mg.groundAt(RACK[0], RACK[1]), RACK[1]);
    scene.add(rack);
    for (const k of ['broom', 'blower', 'picker']) rack.userData.show?.(k, false);
    const rackTop = new THREE.Vector3(RACK[0], 2.3, RACK[1] + 0.3);

    // ── 拖垫：场景的 drag-mat，刷宽缩到 1.8 米（拖杆 2.4 → 1.8）──
    const mat = objs.get('drag-mat') as THREE.Object3D;
    const matTool = mat.userData.tool as THREE.Object3D;
    const fitMat = (state: 'drag' | 'hung') => {
      mat.userData.setState?.(state);
      matTool.scale.z = SWATH / 2.4;
    };
    const matItem: Item = play.addItem({
      id: 'drag-mat',
      name: '拖垫',
      obj: mat,
      // 不挂到手上：不存在的道具名（手里空着，drag 姿势自己画攥着的绳子），垫子由这里每步摆
      prop: 'drag-mat',
      radius: 0.01,
      carryPose: 'drag',
      carrySpeed: DRAG_SPEED,
      droppable: false,
    });
    const matPos = new THREE.Vector3();
    const lastDrag = new THREE.Vector3();
    let matYaw = 0;
    const hangMat = () => {
      matItem.stow(scene, MAT_HANG.clone());
      fitMat('hung');
    };
    /** 拿起拖垫：垫子直接落在身后 */
    const matBehind = () => {
      const y = D.rotation.y;
      matPos.set(D.position.x - Math.sin(y) * (MAT_TOW + 0.25), 0, D.position.z - Math.cos(y) * (MAT_TOW + 0.25));
      lastDrag.copy(matPos);
      matYaw = y + Math.PI / 2;
      fitMat('drag');
    };

    // ── 扫线刷：场景的 line-brush，不用时靠在工具架上 ──
    const brush = objs.get('line-brush') as THREE.Object3D;
    const brushItem: Item = play.addItem({
      id: 'line-brush',
      name: '扫线刷',
      obj: brush,
      radius: 0.01,
      carryPose: 'push',
      carrySpeed: BRUSH_SPEED,
      droppable: false,
    });
    const rackBrush = () => {
      brushItem.stow(scene, BRUSH_AT.clone(), 0.35);
      brush.userData.setState?.('held');
      brush.rotation.set(-0.22, 0.35, 0);
    };

    // ── 一局的账 ──
    let round = 0;
    let cover = 0;
    let lineDone = tasks.map(() => false);
    let linesN = 0;
    let steps = 0;
    let popPct = 0;
    let saidHalf = false;
    let saidDone = false;
    let saidStep = false;
    let saidLate = false;
    let patch: { x: number; z: number } | null = null;
    let dirty: { x: number; z: number; name: string } | null = null;
    let slowAcc = 0;
    const holding = () => (matItem.where === 'held' ? 'mat' : brushItem.where === 'held' ? 'brush' : null);

    const refresh = () => {
      cover = coverage(S, cells);
      const now = tasks.map((t) => lineProgress(S.tape[t.li], t) >= LINE_DONE);
      linesN = now.filter(Boolean).length;
      tasks.forEach((t, i) => {
        if (now[i] && !lineDone[i] && mg.state === 'playing') {
          mg.addScore(0, toWorld((t.a[0] + t.b[0]) / 2, (t.a[1] + t.b[1]) / 2, 0.6), {
            text: `+${LINE_PTS} ${t.name} ✓`,
            color: 'green',
            big: true,
          });
          if (linesN < tasks.length) mg.toast(`${t.name}扫出来了 · 白线 ${linesN}/${tasks.length}`, 1.4);
        }
      });
      lineDone = now;
      mg.setScore(liveScore({ cover, lines: linesN, steps }));
      const pct = Math.floor(cover * 100);
      mg.stat('cover', '拖平', `${pct}%`, cover >= DONE_COVER ? 'good' : null);
      mg.stat('lines', '白线', `${linesN}/${tasks.length}`, linesN >= tasks.length ? 'good' : null);
    };
    /** 慢的（4 次/秒）：最大的一块没拖的、最近的脏线、小地图 */
    const minimap = createMinimap(RECT);
    const slow = () => {
      const p = largestPatch(S, RECT);
      patch = p && cover < 0.995 ? { x: p.x, z: p.z } : null;
      const [lx, lz] = toLocal(D.position.x, D.position.z);
      const d = nearestDirty(S, tasks, TAPE_STEP, lx, lz);
      dirty = d ? { x: d.x, z: d.z, name: d.task.name } : null;
      const lines: MiniLine[] = tasks.map((t) => {
        const l = S.lines[t.li];
        const pts: [number, number, boolean][] = [];
        for (let k = t.k0; k <= t.k1; k++) {
          const a = Math.min(l.a1, l.a0 + k * TAPE_STEP);
          pts.push([l.kind === 'x' ? l.c : a, l.kind === 'x' ? a : l.c, S.tape[t.li][k] < TAPE_CLEAN]);
        }
        return { pts };
      });
      minimap.draw({
        grid: S,
        patch,
        lines,
        me: [lx, lz],
        mat: holding() === 'mat' ? toLocal(matPos.x, matPos.z) : null,
        rack: toLocal(RACK[0], RACK[1]),
        blink: Math.floor(mg.t * 3) % 2 === 0,
      });
    };

    // ── 拖着走：垫子跟在绳子后面，压过的地方梳平 ──
    const rp = new THREE.Vector3();
    const tow = () => {
      const r = (ud.ropePoint?.() as THREE.Vector3 | undefined) ?? rp.copy(D.position);
      const dx = r.x - matPos.x;
      const dz = r.z - matPos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > MAT_TOW) {
        matPos.x += (dx / d) * (d - MAT_TOW);
        matPos.z += (dz / d) * (d - MAT_TOW);
      }
      if (d > 0.3) matYaw = Math.atan2(dz / d, -dx / d);
      mat.visible = true;
      mat.position.set(matPos.x, 0, matPos.z);
      mat.rotation.set(0, matYaw, 0);
      mat.updateMatrixWorld(true);
      mat.userData.setRopeEnd?.(mat.worldToLocal(r.clone()));
      const mx = matPos.x - lastDrag.x;
      const mz = matPos.z - lastDrag.z;
      const md = Math.hypot(mx, mz);
      if (md > 0.05) {
        if (mg.state === 'playing') {
          const [lx, lz] = toLocal(matPos.x, matPos.z);
          comb(S, lx, lz, mx, mz, SWATH, MAT_LEN);
          bury(lx, lz, mx / md, mz / md);
          S.dirtyGrid = true;
        }
        lastDrag.copy(matPos);
      }
    };
    /** 垫子下面：线盖上土、记号抹掉（同 ClayState.drag，宽换成 1.8） */
    const bury = (x: number, z: number, ux: number, uz: number) => {
      const hw = SWATH / 2;
      const r = Math.hypot(hw, MAT_LEN / 2) + 0.2;
      const under = (cx: number, cz: number, pad = 0) =>
        Math.abs((cx - x) * ux + (cz - z) * uz) <= MAT_LEN / 2 + pad &&
        Math.abs(-(cx - x) * uz + (cz - z) * ux) <= hw + pad;
      S.forTape(x - r, z - r, x + r, z + r, (li, k, cx, cz) => {
        if (under(cx, cz) && S.tape[li][k] < 1) {
          S.tape[li][k] = 1;
          S.dirtyTape = true;
        }
      });
      const n = S.marks.length;
      S.marks = S.marks.filter((m) => !under(m.x, m.z, 0.05));
      if (S.marks.length !== n) S.dirtyMarks = true;
    };

    // ── 扫线：刷子来回推的那一截（脚下到刷头，刷头在身前 1.5 米）露出来 ——
    // 只算刷头的话，走到拐角再拐弯，下一条线开头那 1.5 米永远在身后扫不到 ──
    const lastTip = new THREE.Vector3(1e9, 0, 0);
    const sweep = () => {
      const tip = ud.toolTip?.() as THREE.Vector3 | null;
      if (!tip || tip.y > 0.3 || tip.distanceTo(lastTip) < 0.04) return;
      for (const f of [0.3, 0.65, 1]) {
        const [lx, lz] = toLocal(D.position.x + (tip.x - D.position.x) * f, D.position.z + (tip.z - D.position.z) * f);
        S.sweepAt(lx, lz, BRUSH_R);
      }
      lastTip.copy(tip);
    };

    // ── 脚印：手里没拖垫，踩在刚拖平的土上 ──
    const lastPos = new THREE.Vector3();
    let stride = 0;
    let side = 1;
    const footsteps = () => {
      const mx = D.position.x - lastPos.x;
      const mz = D.position.z - lastPos.z;
      const mv = Math.hypot(mx, mz);
      lastPos.copy(D.position);
      if (mv <= 0 || mv > 0.5) return;
      stride += mv;
      if (stride < 0.62) return;
      stride = 0;
      side = -side;
      if (holding() === 'mat') return;
      const [lx, lz] = toLocal(D.position.x, D.position.z);
      const [fx, fz] = footAt(lx, lz, mx, mz, side);
      if (!inRect(fx, fz) || nearLine(S, fx, fz) <= LINE_SAFE) return;
      const n = trample(S, fx, fz);
      if (n < 2) return;
      S.step(fx, fz, mx, mz, side);
      S.dirtyGrid = true;
      steps++;
      mg.addScore(0, toWorld(fx, fz, 0.4), { text: `−${STEP_PENALTY}`, color: 'red' });
      if (!saidStep) {
        saidStep = true;
        mg.toast('脚印回来了！没拖垫走白线，别踩拖平的土', 2.4);
      }
    };

    // ── 捣乱：近场飞过来一个球，孩子从东门进来捡 ──
    const kid = kit.makeAsset('kid', 1).obj;
    kid.name = 'claydrag:kid';
    kid.visible = false;
    scene.add(kid);
    const kb = ballKit(kit.ctxFor(0) as unknown as Parameters<typeof ballKit>[0]);
    const ball = new THREE.Mesh(kb.geo, kb.mat);
    ball.visible = false;
    scene.add(ball);
    play.addBlocker(() => (kid.visible ? { x: kid.position.x, z: kid.position.z, r: 0.3 } : null));
    interface KidRun {
      t0: number;
      target: [number, number];
      path: [number, number][];
      seg: number;
      phase: 'fall' | 'in' | 'pick' | 'out';
      wait: number;
      walked: number;
      stepAcc: number;
      side: number;
    }
    let kidRun: KidRun | null = null;
    let kidNext = 0;
    const startKid = (n: number) => {
      // 落点：拖平了的地方里随便挑一块（离网、离总监远一点）；一块都没有就场地中间
      const rng = mg.rng(`kid:${mg.round}:${n}`);
      let target: [number, number] = [6 + rng() * 4, (rng() - 0.5) * 8];
      for (let t = 0; t < 60; t++) {
        const x = RECT.x0 + 1.5 + rng() * (RECT.x1 - RECT.x0 - 2.5);
        const z = RECT.z0 + 1 + rng() * (RECT.z1 - RECT.z0 - 2);
        const [dlx, dlz] = toLocal(D.position.x, D.position.z);
        if (S.at(x, z).state === 'brushed' && Math.hypot(x - dlx, z - dlz) > 3) {
          target = [x, z];
          break;
        }
      }
      const tw = toWorld(target[0], target[1]);
      kidRun = {
        t0: mg.t,
        target: [tw.x, tw.z],
        path: [DOOR_OUT, DOOR_IN, [tw.x + 0.35, tw.z]],
        seg: 0,
        phase: 'fall',
        wait: 0,
        walked: 0,
        stepAcc: 0,
        side: 1,
      };
      kid.position.set(DOOR_OUT[0], 0, DOOR_OUT[1]);
      kid.visible = true;
      ball.visible = true;
      mg.toast('近场飞过来一个球——有人进来捡，会踩出脚印！', 2.4);
    };
    const kidStep = (dt: number) => {
      const k = kidRun;
      if (!k) return;
      kid.userData.update?.(dt);
      // 球：从近场那边飞过来，蹦两下停住
      const bt = mg.t - k.t0;
      if (k.phase !== 'out' || ball.visible) {
        const [tx, tz] = k.target;
        const f = Math.min(1, bt / 1.1);
        const hop = bt < 1.1 ? 4 * 2.4 * f * (1 - f) : bt < 1.5 ? Math.sin(((bt - 1.1) / 0.4) * Math.PI) * 0.3 : 0;
        ball.position.set(tx, 0.06 + hop, tz + (1 - f) * 9);
      }
      if (k.phase === 'fall') {
        if (bt > 1.2) {
          k.phase = 'in';
          play.say(kid, '不好意思，捡个球！', 2.2);
        }
        return;
      }
      if (k.phase === 'pick') {
        k.wait += dt;
        kid.userData.pose?.('pickup', Math.min(0.99, k.wait / 0.6));
        if (k.wait > 0.35) ball.visible = false;
        if (k.wait > 0.6) {
          k.phase = 'out';
          k.path = [[kid.position.x, kid.position.z], DOOR_IN, DOOR_OUT];
          k.seg = 0;
        }
        return;
      }
      const a = k.path[k.seg];
      const b = k.path[k.seg + 1];
      if (!b) {
        if (k.phase === 'in') {
          k.phase = 'pick';
          k.wait = 0;
        } else {
          kid.visible = false;
          kidRun = null;
        }
        return;
      }
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const sp = 2.6 * dt;
      const cx = kid.position.x;
      const cz = kid.position.z;
      const rem = Math.hypot(b[0] - cx, b[1] - cz);
      const ux = (b[0] - a[0]) / L;
      const uz = (b[1] - a[1]) / L;
      if (rem <= sp) {
        kid.position.set(b[0], 0, b[1]);
        k.seg++;
      } else kid.position.set(cx + ux * sp, 0, cz + uz * sp);
      kid.rotation.y = Math.atan2(ux, uz);
      k.walked += sp;
      kid.userData.pose?.('walk', (k.walked / 1.3) % 1);
      // 一步一个脚印（踩回起尘）
      k.stepAcc += sp;
      if (k.stepAcc > 0.55) {
        k.stepAcc = 0;
        k.side = -k.side;
        const [lx, lz] = toLocal(kid.position.x, kid.position.z);
        const [fx, fz] = footAt(lx, lz, ux, uz, k.side);
        if (inRect(fx, fz)) {
          trample(S, fx, fz, 0.22);
          S.step(fx, fz, ux, uz, k.side);
          S.dirtyGrid = true;
        }
      }
    };

    // ── 工具架：换工具 ──
    play.add({
      id: 'rack',
      at: () => rackTop,
      radius: 2.0,
      priority: 5,
      stand: () => RACK_STAND,
      label: () =>
        mg.state !== 'playing' ? '' : holding() === 'mat' ? '换扫线刷' : holding() === 'brush' ? '换拖垫' : '',
      canUse: () => mg.state === 'playing' && !!holding(),
      onUse: (p) => {
        const r = round;
        p.busy({
          name: 'swap',
          dur: 0.6,
          pose: 'pickup',
          face: [RACK[0], RACK[1]],
          mid: () => {
            if (r !== round || mg.state !== 'playing') return;
            if (holding() === 'mat') {
              play.take();
              hangMat();
              play.give(brushItem);
              mg.toast(linesN >= tasks.length ? '换上扫线刷' : '换上扫线刷：沿白线推，刷头扫过的那一截露出来', 2.0);
            } else {
              play.take();
              rackBrush();
              matBehind();
              play.give(matItem);
              mg.toast('换上拖垫：拖过的白线又会盖上土', 2.0);
            }
          },
        });
      },
    });

    // ── 标记 ──
    const markPt = new THREE.Vector3();
    mg.marker(
      'patch',
      () => {
        if (mg.state !== 'playing' || !patch) return null;
        const h = holding();
        const want = (h === 'mat' && cover >= 0.3) || (h === 'brush' && linesN >= tasks.length && cover < DONE_COVER);
        return want ? markPt.set(patch.x + OX, 0.3, patch.z + OZ) : null;
      },
      { label: '没拖到', color: '#ffd23c' },
    );
    const linePt = new THREE.Vector3();
    mg.marker(
      'line',
      () =>
        mg.state === 'playing' && holding() === 'brush' && dirty ? linePt.set(dirty.x + OX, 0.25, dirty.z + OZ) : null,
      { label: '扫这条', color: '#fff3d6' },
    );
    mg.marker(
      'rack-brush',
      () =>
        mg.state === 'playing' && holding() === 'mat' && (cover >= DONE_COVER || (mg.timeLeft < 40 && linesN === 0))
          ? rackTop
          : null,
      { label: '换扫线刷', color: '#8fe36a' },
    );
    mg.marker(
      'rack-mat',
      () =>
        mg.state === 'playing' && holding() === 'brush' && linesN >= tasks.length && cover < DONE_COVER
          ? rackTop
          : null,
      { label: '换拖垫', color: '#8fe36a' },
    );

    // 场景的小动画在任何状态都跑：拖垫跟着人（开局卡上也摆好）
    mg.onStep((dt) => {
      if (matItem.where === 'held') tow();
      kidStep(dt);
    });

    return {
      reset() {
        round++;
        far.reset('far');
        scuffEast(S, mg.rng(`scuff:${mg.round}`), DIM);
        if (holding() === 'brush') play.take();
        rackBrush();
        matBehind();
        play.give(matItem);
        lastPos.copy(D.position);
        lastTip.set(1e9, 0, 0);
        stride = 0;
        steps = 0;
        popPct = 0;
        lineDone = tasks.map(() => false);
        saidHalf = saidDone = saidStep = saidLate = false;
        kidRun = null;
        kidNext = 0;
        kid.visible = false;
        ball.visible = false;
        slowAcc = 0;
        refresh();
        slow();
      },
      start() {
        play.say(D, '先把场子拖平！', 2.0);
      },
      step(dt) {
        const s = play.state();
        if (holding() === 'brush' && s.speed > 0.1) sweep();
        footsteps();
        if (kidNext < KID_AT.length && mg.elapsed >= KID_AT[kidNext] && !kidRun) startKid(kidNext++);
        const before = Math.floor(cover * 100);
        refresh();
        const pct = Math.floor(cover * 100);
        if (pct >= popPct + 3 && holding() === 'mat') {
          mg.addScore(0, matPos.clone().setY(0.5), { text: `+${(pct - popPct) * PTS_PER_PCT}` });
          popPct = pct;
        } else if (pct < popPct) popPct = pct;
        if (!saidHalf && pct >= 50 && before < 50) {
          saidHalf = true;
          mg.toast('拖了一半！', 1.2);
        }
        if (!saidDone && cover >= DONE_COVER && holding() === 'mat') {
          saidDone = true;
          mg.toast(
            linesN >= tasks.length ? '拖完了！' : '拖完了！去北边工具架「换扫线刷」',
            2.4,
            linesN < tasks.length,
          );
        }
        if (!saidLate && mg.timeLeft < 40 && holding() === 'mat' && linesN === 0) {
          saidLate = true;
          mg.toast('只剩 40 秒——该去扫线了！', 2.2);
        }
        slowAcc += dt;
        if (slowAcc >= 0.25) {
          slowAcc = 0;
          slow();
        }
        if (isDone({ cover, lines: linesN, totalLines: tasks.length })) mg.finish('完工！');
      },
      finish(reason) {
        slow();
        return settle({
          cover,
          lines: linesN,
          totalLines: tasks.length,
          steps,
          timeLeft: reason === '完工！' ? mg.timeLeft : 0,
        });
      },
      debug: () => ({
        cover: +cover.toFixed(4),
        lines: linesN,
        lineProg: Object.fromEntries(tasks.map((t) => [t.id, +lineProgress(S.tape[t.li], t).toFixed(2)])),
        steps,
        holding: holding(),
        mat: [+matPos.x.toFixed(2), +matPos.z.toFixed(2)],
        patch,
        kid: kidRun ? kidRun.phase : null,
      }),
    };
  },
});
