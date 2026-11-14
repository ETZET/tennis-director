// 小游戏 10 · 果岭推杆（高尔夫果岭，clubgolf）：会员都去打球了，总监在第 7 洞的果岭上推九个洞。
// - 操作（一根拇指）：在画面上按住往后拖（弹弓：往哪边拖，球就往反方向走；拖得越远越用力），松手出杆。
//   拖的时候球前面一串白点 = 球最先滚的 1.5 米（不给整条路），球上面的力度条写着"平地能滚多远"。
// - 球按摩擦 + 坡滚（rules.ts）：慢慢经过杯口就掉进去，太快会吊出来（擦边的被杯沿拽着拐弯）。
//   果岭的坡（course.ts）：草上一直有很淡的小 V（尖朝下坡）；右下「看坡」打开流线，看清坡往哪流。
// - 每推一杆，总监自己走到球边站好；进了出记分卡（小鸟 / 标准杆 / 柏忌的印章），点「下一洞」。
// - 分：一洞标准杆 200，每少一杆 +100、多一杆 −100（不到 0）；建议时间内推进 +10（快手）。
//   九洞全标准杆 = 1800；星级线 1200 / 1700 / 1900 = 总杆 ≤ +6 / ≤ +1 / 低于标准杆（机器人调的：手稳的 −3、一般 −0.3、随手 +3、乱推 +8）。
// - 不计时（duration null）；进水塘、沙坑、出界罚一杆，在进去的地方往回放球；标准杆 +3 还没进就捡起来。
// 场面：clubgolf 原样（白模的占位用 ?accent=2 的颜色白模），原来推杆的人下场，扶旗的人每洞站到杯边看着；
// 旗杆、球、推杆是这里照规格画的（props.ts），坡纹、流线、瞄准点在 FX 层。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { CLOUDS } from '../../clubgolf/layout';
import { createGolfRegion } from '../../clubgolf/scene';
import type { Item } from '../../clubsite/play';
import { mountMinigame } from '../shell';
import { envFor, GREEN, HOLES, SLOPE, surfaceAt } from './course';
import { BALL_VIS, Dots, GREEN_Y, makeBall, makeCup, makeFlag, makeFlow, makeGrain, makePutter } from './props';
import {
  type Ball,
  bestPutt,
  clamp,
  flatDistance,
  type HoleResult,
  hit,
  holePoints,
  MAX_OVER,
  newBall,
  PREVIEW,
  predict,
  QUICK_BONUS,
  type RollEvent,
  STARS,
  settle,
  stepBall,
  toPar,
  type V2,
  verdict,
} from './rules';
import { createGolfUi } from './ui';

// clubgolf 还是白模：占位的灰盒换成"颜色白模"（计划的主体材质，球车、球包、耙子不再是灰的）
{
  const u = new URL(location.href);
  if (!u.searchParams.has('accent')) {
    u.searchParams.set('accent', '2');
    history.replaceState(null, '', u);
  }
}

/** 总监开局：第 1 洞的球旁边（果岭上；clubgolf 的 region.start 是 [0, 0]、没有总监） */
const START: V2 = [HOLES[0].ball[0], HOLES[0].ball[1] - 0.7];
/** 看坡的流线、坡纹画的范围（果岭岛西半） */
const AREA: [number, number, number, number] = [-48.6, -36.4, 58.3, 69.8];
/** 拖多远算满力度（CSS 像素，按屏幕短边） */
const maxDrag = () => clamp(Math.min(innerWidth, innerHeight) * 0.46, 130, 260);
/** 拖不到这么远（像素）松手 = 不出杆 */
const MIN_DRAG = 14;
/** 记分卡自动翻下一洞（秒） */
const CARD_AUTO = 7;
const SURF_NAME: Record<string, string> = { water: '下水了', sand: '进沙坑', out: '出界' };

mountMinigame({
  id: 'golfputt',
  title: '果岭推杆',
  tag: '小游戏 10 · 高尔夫果岭',
  goal: '会员都去打球了，总监在第 7 洞的果岭上推九个洞。杆数越少越好！',
  howto: [
    '按住画面往后拖（像弹弓），松手出杆',
    '白点是球最先滚的 1.5 米；拖得越远越用力',
    '草上的小 V 尖朝下坡；右下「看坡」看流线',
    '低于标准杆 = 三星；水塘、沙坑罚一杆',
  ],
  region: createGolfRegion,
  clouds: CLOUDS,
  life: false,
  hour: 15.5,
  weather: 'clear',
  start: { start: START, yaw: 0 },
  // 拉近四成（球 4 个纹素）：竖屏 10 米宽，果岭 8.4 米（连果岭边）正好一屏
  zoom: 0.58,
  // 相机自己管（球和杯的中点）：play 的跟随死区放到最大，不跟总监
  camera: { dead: [99, 99] },
  duration: null,
  stars: STARS,
  setup(mg) {
    const { scene, play, pipe } = mg;
    const D = play.director;
    const canvas = pipe.renderer.domElement;

    // ── 场面：推杆的人下场；扶旗的人留下（每洞站到杯边）；白模的旗杆、球收起来（这里重画）──
    for (const id of ['putter', 'ball-green', 'flagstick']) {
      const o = scene.getObjectByName(`slot:${id}`);
      if (o) o.visible = false;
    }
    const caddie = scene.getObjectByName('slot:pin-tender') ?? null;
    caddie?.userData.pose?.('idle');

    // ── 球、杯、旗、坡纹、流线、瞄准点 ──
    const ballMesh = makeBall();
    const cup = makeCup();
    const flag = makeFlag(mg.ctx);
    const onCourse = (x: number, z: number) => {
      const s = surfaceAt(x, z);
      return s === 'green' || s === 'fringe';
    };
    const grain = makeGrain(SLOPE, onCourse, AREA);
    const flow = makeFlow(SLOPE, surfaceAt, AREA, mg.rng('flow'));
    const aimDots = new Dots(18, 0.055, 0xffffff);
    const pullDots = new Dots(12, 0.04, 0xfff3d6, 0.75);
    // 滚的时候身后一串淡点（看得出球怎么拐的弯）
    const trailDots = new Dots(14, 0.04, 0xfff3d6, 0.55);
    const trail: [number, number][] = [];
    let trailD = 0;
    scene.add(ballMesh, cup, flag, grain.mesh, flow.mesh, aimDots.mesh, pullDots.mesh, trailDots.mesh);
    // 球脚下一圈（该推的时候一闪一闪：从这儿往后拖）
    const ballRing = mg.ring(0, 0, 0.26, 0xfff3d6);
    (ballRing.material as THREE.MeshBasicMaterial).opacity = 0.75;
    mg.onStep((dt, t) => {
      flag.userData.wave?.(t);
      flow.step(dt);
      ballRing.visible = mg.state === 'playing' && phase === 'aim' && !drag;
      ballRing.position.set(ball.x, GREEN_Y + 0.008, ball.z);
      ballRing.scale.setScalar(1 + 0.18 * Math.max(0, Math.sin(t * 5)));
    });

    // ── 推杆（总监手里；不能放下）──
    const putter = makePutter(mg.ctx);
    const head = new THREE.Object3D();
    head.position.set(0, -0.87, 0.01);
    putter.swing.add(head);
    const putterItem: Item = play.addItem({
      id: 'putter',
      name: '推杆',
      obj: putter.obj,
      grip: putter.grip,
      carryPose: 'walk',
      droppable: false,
    });

    // ── 界面 ──
    let look = false;
    const setLook = (on: boolean) => {
      look = on;
      flow.show(on);
      grain.bright(on);
      gui.setLook(mg.state === 'playing', on);
    };
    const gui = createGolfUi({
      onLook: () => {
        if (mg.state === 'playing') setLook(!look);
      },
      onNext: () => nextHole(),
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyV' && mg.state === 'playing') setLook(!look);
      if ((e.code === 'Enter' || e.code === 'Space') && phase === 'card') nextHole();
    });

    // ── 一局的账 ──
    type Phase = 'aim' | 'swing' | 'roll' | 'holed' | 'drop' | 'walk' | 'card' | 'done';
    let phase: Phase = 'aim';
    let phaseT = 0;
    let hole = 0;
    let strokes = 0;
    let penalties = 0;
    let holeT = 0;
    let results: HoleResult[] = [];
    let ball: Ball = newBall(HOLES[0].ball);
    let env = envFor(HOLES[0]);
    let aimAngle = 0;
    let aimK = 0;
    let lips = 0;
    let dropAt: V2 | null = null;
    let lastEvent = '';
    const setPhase = (p: Phase) => {
      phase = p;
      phaseT = 0;
    };

    const groundY = (x: number, z: number) => {
      const s = surfaceAt(x, z);
      return s === 'green' ? GREEN_Y : s === 'fringe' ? 0.02 : 0.014;
    };
    const ballPos = new THREE.Vector3();
    const placeBallMesh = () => {
      ballPos.set(ball.x, groundY(ball.x, ball.z) + BALL_VIS, ball.z);
      ballMesh.position.copy(ballPos);
    };
    const cupPt = () => new THREE.Vector3(env.cup[0], GREEN_Y + 0.3, env.cup[1]);

    // ── 总监站位：推杆头落在球后，侧身站在推杆线的北边（不挡球：镜头在南边）──
    // 往东推 = 右手打法（左肩朝目标，身体 +x = 出杆方向）；往西推 = 左手打法（身体 −x = 出杆方向）
    /** 杆头在总监本地坐标里的位置（第一次站好后量一次） */
    const tipLocal = new THREE.Vector2(0.12, 0.62);
    let calibrated = false;
    /** +1：swing 组绕 z 正转 = 杆头往总监身体 +x 那边 */
    let swingX = 1;
    /** 现在的打法：+1 右手、−1 左手 */
    let hand = 1;
    const handFor = (a: number) => (Math.cos(a) >= -0.05 ? 1 : -1);
    const stanceFor = (a: number): [number, number, number] => {
      const hd = handFor(a);
      // 身体 +x 的世界方向 = (cos ψ, −sin ψ) = hd · 出杆方向
      const yaw = Math.atan2(-hd * Math.sin(a), hd * Math.cos(a));
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      // 杆头在球后 0.1 米（不盖住球）
      const bx = ball.x - Math.cos(a) * 0.1;
      const bz = ball.z - Math.sin(a) * 0.1;
      return [bx - (tipLocal.x * c + tipLocal.y * s), bz - (-tipLocal.x * s + tipLocal.y * c), yaw];
    };
    let stanceAngle = Number.NaN;
    const address = (a: number) => {
      const [x, z, yaw] = stanceFor(a);
      play.teleport(x, z, yaw);
      stanceAngle = a;
      hand = handFor(a);
      if (!play.isBusy() || play.state().busy !== 'address') play.busy({ name: 'address', dur: 1e6, pose: 'push' });
    };
    const unAddress = () => {
      if (play.isBusy()) play.busy({ name: 'stand', dur: 0.02, pose: 'idle' });
    };
    const calibrate = () => {
      if (calibrated || play.state().busy !== 'address') return;
      putter.swing.rotation.z = 0;
      D.updateMatrixWorld(true);
      const w = head.getWorldPosition(new THREE.Vector3());
      const loc = D.worldToLocal(w.clone());
      tipLocal.set(loc.x, loc.z);
      putter.swing.rotation.z = 0.3;
      D.updateMatrixWorld(true);
      const w2 = head.getWorldPosition(new THREE.Vector3());
      const yaw = D.rotation.y;
      const bodyX = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      swingX = w2.sub(w).dot(bodyX) >= 0 ? 1 : -1;
      putter.swing.rotation.z = 0;
      calibrated = true;
      address(stanceAngle);
    };
    /** 推杆摆的角（正 = 往目标那边） */
    const setSwing = (a: number) => {
      putter.swing.rotation.z = swingX * hand * a;
    };

    // ── 扶旗的人：杯的北边（不挡杯）、看着球 ──
    const lookPt = new THREE.Vector3();
    const placeCaddie = () => {
      if (!caddie) return;
      const [cx, cz] = env.cup;
      const h = HOLES[hole];
      const L = Math.hypot(h.ball[0] - cx, h.ball[1] - cz) || 1;
      // 推杆方向（球 → 杯）
      const dx = (cx - h.ball[0]) / L;
      const dz = (cz - h.ball[1]) / L;
      // 最后推进杯时总监大概站哪（站位规则同 stanceFor：侧身、在线的一边 0.6 米）
      const hd = handFor(Math.atan2(dz, dx));
      const sx = cx + 0.62 * hd * dz;
      const sz = cz - 0.62 * hd * dx;
      // 杯边 1.6 米一圈 16 个候选：离推杆线（含杯后 1 米）和开球点至少 1 米、偏北（站在杯南边会把杯挡住）、离总监远
      let best: [number, number] = [cx, cz - 1.6];
      let bestS = -Infinity;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = cx + Math.cos(a) * 1.6;
        const z = cz + Math.sin(a) * 1.6;
        const t = clamp((x - h.ball[0]) * dx + (z - h.ball[1]) * dz, 0, L + 1);
        const line = Math.hypot(x - (h.ball[0] + dx * t), z - (h.ball[1] + dz * t));
        const me = Math.hypot(x - sx, z - sz);
        const start = Math.hypot(x - h.ball[0], z - h.ball[1]);
        let sc = -Math.sin(a) * 0.8 + Math.min(line, 2) + Math.min(me, 1.5);
        if (line < 1 || start < 1.6) sc -= 5;
        if (surfaceAt(x, z) !== 'green' && surfaceAt(x, z) !== 'fringe') sc -= 1;
        if (sc > bestS) {
          bestS = sc;
          best = [x, z];
        }
      }
      const [x, z] = best;
      caddie.position.set(x, groundY(x, z), z);
      caddie.rotation.y = Math.atan2(ball.x - x, ball.z - z);
    };

    // ── 相机：球和杯的中点（画面偏下一点，让开顶上的 HUD）──
    const cam = pipe.rig.target;
    const camGoal = () => {
      const bx = phase === 'card' ? env.cup[0] : ball.x;
      const bz = phase === 'card' ? env.cup[1] : ball.z;
      return [(bx + env.cup[0]) / 2, (bz + env.cup[1]) / 2 - 0.6] as const;
    };
    const snapCam = () => {
      const [x, z] = camGoal();
      cam.set(x, 0, z);
    };

    // ── 一洞开始 ──
    const startHole = (i: number) => {
      hole = i;
      const h = HOLES[i];
      strokes = 0;
      penalties = 0;
      holeT = 0;
      lips = 0;
      dropAt = null;
      ball = newBall(h.ball);
      env = envFor(h);
      clearTrail();
      placeBallMesh();
      ballMesh.visible = true;
      cup.position.set(h.cup[0], GREEN_Y, h.cup[1]);
      flag.position.set(h.cup[0], GREEN_Y, h.cup[1]);
      placeCaddie();
      aimAngle = Math.atan2(h.cup[1] - h.ball[1], h.cup[0] - h.ball[0]);
      aimK = 0;
      unAddress();
      address(aimAngle);
      setPhase('aim');
      snapCam();
      gui.hideCard();
      const dist = Math.hypot(h.cup[0] - h.ball[0], h.cup[1] - h.ball[1]);
      gui.setPlate(`第 ${i + 1} 洞 · ${h.name}`, `标准杆 ${h.par} · ${dist.toFixed(1)} 米`);
      showStats();
    };
    const showStats = () => {
      const done = results.reduce((s, r) => s + r.strokes - r.par, 0);
      mg.stat('stroke', '杆数', strokes);
      mg.stat('topar', '成绩', toPar(done), done < 0 ? 'good' : done > 0 ? 'warn' : null);
    };

    // ── 拖杆（弹弓）：自己接画布的指针（挡在 play 的摇杆前面：总监不用手动走）──
    let drag: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
    const screenToGround = (dx: number, dy: number): [number, number] => {
      const o = mg.project(ballPos);
      const ex = mg.project(ballPos.clone().add(new THREE.Vector3(1, 0, 0)));
      const ez = mg.project(ballPos.clone().add(new THREE.Vector3(0, 0, 1)));
      const a = ex.x - o.x;
      const b = ez.x - o.x;
      const c = ex.y - o.y;
      const d = ez.y - o.y;
      const det = a * d - b * c || 1;
      return [(d * dx - b * dy) / det, (-c * dx + a * dy) / det];
    };
    const updateAim = () => {
      if (!drag) return;
      const dx = drag.x - drag.x0;
      const dy = drag.y - drag.y0;
      const px = Math.hypot(dx, dy);
      if (px < MIN_DRAG) {
        aimK = 0;
        return;
      }
      const [wx, wz] = screenToGround(dx, dy);
      aimAngle = Math.atan2(-wz, -wx);
      aimK = clamp(px / maxDrag(), 0, 1);
    };
    const canAim = () => mg.state === 'playing' && phase === 'aim';
    const swallow = (e: PointerEvent) => {
      if (e.target !== canvas) return false;
      e.stopPropagation();
      return true;
    };
    addEventListener(
      'pointerdown',
      (e) => {
        if (!swallow(e)) return;
        if (!canAim() || drag) return;
        drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {}
      },
      { capture: true },
    );
    addEventListener(
      'pointermove',
      (e) => {
        if (!swallow(e) || !drag || e.pointerId !== drag.id) return;
        drag.x = e.clientX;
        drag.y = e.clientY;
        updateAim();
      },
      { capture: true },
    );
    const up = (e: PointerEvent) => {
      if (!swallow(e) || !drag || e.pointerId !== drag.id) return;
      drag.x = e.clientX;
      drag.y = e.clientY;
      updateAim();
      const k = aimK;
      drag = null;
      if (e.type === 'pointerup' && canAim() && k > 0) putt(aimAngle, k);
      else if (canAim()) clearAim();
    };
    addEventListener('pointerup', up, { capture: true });
    addEventListener('pointercancel', up, { capture: true });
    addEventListener('wheel', (e) => e.target === canvas && e.stopPropagation(), { capture: true });

    const clearTrail = () => {
      trail.length = 0;
      trailD = 0;
      trailDots.clear();
    };
    const clearAim = () => {
      aimDots.clear();
      pullDots.clear();
      gui.setPower(null);
    };

    // ── 出杆 ──
    let swingK = 0;
    const putt = (angle: number, k: number) => {
      if (phase !== 'aim') return;
      aimAngle = angle;
      aimK = k;
      swingK = k;
      if (Math.abs(angle - stanceAngle) > 1e-3) address(angle);
      clearAim();
      clearTrail();
      setPhase('swing');
    };
    /** 推杆摆：0..BACK 往后、BACK..IMPACT 往前到球、之后随挥再回来 */
    const BACK = 0.42;
    const IMPACT = 0.6;
    const swingAngle = (t: number, k: number) => {
      const amp = 0.12 + 0.55 * k;
      if (t < BACK) return -amp * Math.sin(((t / BACK) * Math.PI) / 2);
      if (t < IMPACT) return -amp * Math.cos((((t - BACK) / (IMPACT - BACK)) * Math.PI) / 2);
      const u = (t - IMPACT) / 0.3;
      if (u < 1) return amp * 0.8 * Math.sin((u * Math.PI) / 2);
      return amp * 0.8 * Math.max(0, 1 - (u - 1) * 1.6);
    };

    // ── 一洞完 ──
    const endHole = (picked: boolean) => {
      const h = HOLES[hole];
      const quick = !picked && holeT <= h.soft;
      const res: HoleResult = { par: h.par, strokes: picked ? h.par + MAX_OVER : strokes, penalties, quick, picked };
      results.push(res);
      const pts = holePoints(res.par, res.strokes) + (quick ? QUICK_BONUS : 0);
      const v = picked ? { key: 'worse', name: '捡起' } : verdict(res.par, res.strokes);
      const good = ['ace', 'eagle', 'birdie'].includes(v.key);
      mg.addScore(pts, cupPt().setY(GREEN_Y + 0.9), {
        text: `${v.name} +${pts}`,
        big: true,
        color: good ? 'green' : v.key === 'par' ? 'gold' : 'cream',
      });
      if (quick) mg.pop(cupPt().setY(GREEN_Y + 0.4), `快手 +${QUICK_BONUS}`, { color: 'green' });
      if (caddie)
        play.say(
          caddie,
          v.key === 'ace'
            ? '一杆进洞！！'
            : good
              ? '漂亮！'
              : v.key === 'par'
                ? '好球！'
                : picked
                  ? '下一洞吧'
                  : '进了！',
          1.8,
        );
      mg.stat('quick', '快手', null);
      showStats();
      setPhase('holed');
    };
    const showCard = () => {
      const h = HOLES[hole];
      const res = results[results.length - 1];
      gui.showCard({
        hole,
        name: h.name,
        holes: HOLES.map((hh, i) => ({ par: hh.par, result: results[i] ?? null })),
        result: res,
        total: mg.score,
        points: holePoints(res.par, res.strokes) + (res.quick ? QUICK_BONUS : 0),
        last: hole === HOLES.length - 1,
      });
      setPhase('card');
    };
    const nextHole = () => {
      if (phase !== 'card' || mg.state !== 'playing') return;
      gui.hideCard();
      if (hole >= HOLES.length - 1) {
        setPhase('done');
        const d = results.reduce((s, r) => s + r.strokes - r.par, 0);
        mg.finish(d < 0 ? `低于标准杆 ${-d} 杆！` : d === 0 ? '平标准杆！' : `九洞打完 · ${toPar(d)}`);
        return;
      }
      startHole(hole + 1);
    };

    // ── 球停了 / 出事了：总监走过去 ──
    const goToBall = () => {
      aimAngle = Math.atan2(env.cup[1] - ball.z, env.cup[0] - ball.x);
      unAddress();
      const walkGoal = stanceFor(aimAngle);
      const far = Math.hypot(walkGoal[0] - D.position.x, walkGoal[1] - D.position.z);
      if (far < 0.3 || !play.walkTo(walkGoal[0], walkGoal[1])) {
        address(aimAngle);
        setPhase('aim');
        return;
      }
      setPhase('walk');
    };

    const onEvent = (ev: RollEvent) => {
      lastEvent = ev.kind;
      if (ev.kind === 'lip') {
        lips++;
        mg.pop([ev.at[0], ev.at[1]], ev.edge > 0.4 ? '吊洞！' : '太快，跳过去了', { color: 'red' });
        if (caddie) play.say(caddie, '哎呀！', 1.2);
        return;
      }
      if (ev.kind === 'holed') {
        endHole(false);
        return;
      }
      if (ev.kind === 'hazard') {
        strokes++;
        penalties++;
        dropAt = ev.drop;
        mg.toast(`${SURF_NAME[ev.surface] ?? '出事了'}！罚一杆`, 1.8);
        mg.pop([ev.at[0], ev.at[1]], '+1 罚杆', { color: 'red' });
        showStats();
        setPhase('drop');
        return;
      }
      // 停了
      const h = HOLES[hole];
      if (strokes >= h.par + MAX_OVER) {
        mg.toast(`${strokes} 杆还没进：这洞捡起来`, 1.8);
        endHole(true);
        return;
      }
      const left = Math.hypot(env.cup[0] - ball.x, env.cup[1] - ball.z);
      if (left < 0.5) mg.pop([ball.x, ball.z], `差 ${Math.round(left * 100)} 厘米`, { color: 'cream' });
      goToBall();
    };

    // ── 机器人（无头调参）：window.__golf ──
    Object.assign(window, {
      __golf: {
        phase: () => phase,
        hole: () => hole,
        /** 解一杆（noise：方向的标准差（弧度）、力度的相对标准差；读坡的误差 slopeErr 0..1） */
        solve: (opts: { angleN?: number; powerN?: number } = {}) => {
          const b = bestPutt(env, [ball.x, ball.z], { angleN: opts.angleN ?? 25, powerN: opts.powerN ?? 26 });
          return { angle: b.angle, k: b.k, kind: b.outcome.kind };
        },
        putt: (angle: number, k: number) => putt(angle, clamp(k, 0.01, 1)),
        next: () => nextHole(),
        look: (on: boolean) => setLook(on),
        /** 摆出"正在拖"的样子（截图用）：方向、力度 */
        aim: (angle: number, k: number) => {
          aimAngle = angle;
          aimK = k;
          showAim();
        },
        results: () => results,
      },
    });

    // ── 瞄准线、回拉线、力度条 ──
    const showAim = () => {
      if (aimK <= 0) {
        clearAim();
        return;
      }
      aimDots.set(predict(env, [ball.x, ball.z], aimAngle, aimK, PREVIEW).slice(1), groundY);
      const pull = Math.min(1.1, 0.25 + aimK * 0.9);
      const pts: [number, number][] = [];
      for (let s = 0.14; s <= pull; s += 0.12)
        pts.push([ball.x - Math.cos(aimAngle) * s, ball.z - Math.sin(aimAngle) * s]);
      pullDots.set(pts, groundY);
      gui.setPower(aimK, `平地 ≈${flatDistance(aimK).toFixed(1)} 米`);
    };

    return {
      reset() {
        results = [];
        setLook(false);
        gui.setLook(false, false);
        if (play.held() !== putterItem) play.give(putterItem);
        startHole(0);
        gui.setPlate(null);
        mg.stat('quick', '快手', null);
      },
      start() {
        gui.setLook(true, look);
        startHole(0);
      },
      step(dt) {
        phaseT += dt;
        if (phase !== 'card' && phase !== 'done' && phase !== 'holed') holeT += dt;
        calibrate();
        const h = HOLES[hole];
        // 快手倒计时
        if (phase !== 'card' && phase !== 'holed' && phase !== 'done') {
          const left = h.soft - holeT;
          mg.stat('quick', '快手', left > 0 ? Math.ceil(left) : null, 'good');
        }

        if (phase === 'aim') {
          // 拖着：按方向挪站位（一步一挪，别在指针事件里瞬移）
          if (drag && aimK > 0 && Math.abs(aimAngle - stanceAngle) > 0.03) address(aimAngle);
          if (drag) showAim();
          // 开局提示：第 1 洞先教怎么推，再说坡；之后每洞一开始说这洞的坡
          if (strokes === 0 && holeT - dt < 0.4 && holeT >= 0.4)
            mg.toast(hole === 0 ? '按住画面往后拖，松手出杆' : HOLES[hole].tip, 2.6);
          if (strokes === 0 && hole === 0 && holeT - dt < 3.2 && holeT >= 3.2) mg.toast(HOLES[0].tip, 2.6);
        } else if (phase === 'swing') {
          const before = phaseT - dt;
          setSwing(swingAngle(phaseT, swingK));
          if (before < IMPACT && phaseT >= IMPACT) {
            strokes++;
            hit(ball, aimAngle, swingK);
            lastEvent = '';
            showStats();
            setPhase('roll');
          }
        } else if (phase === 'roll') {
          // 随挥接着摆完
          const st = IMPACT + phaseT;
          setSwing(swingAngle(st, swingK));
          if (st > IMPACT + 0.9) {
            putter.swing.rotation.z = 0;
            if (play.state().busy === 'address') unAddress();
          }
          const d0 = ball.dist;
          const ev = stepBall(ball, dt, env);
          placeBallMesh();
          trailD += ball.dist - d0;
          if (trailD >= 0.18) {
            trailD = 0;
            trail.unshift([ball.x, ball.z]);
            if (trail.length > 14) trail.pop();
            trailDots.set(trail, groundY);
          }
          if (ev) onEvent(ev);
          if (caddie) {
            lookPt.copy(ballPos);
            caddie.userData.lookAt?.(lookPt);
          }
        } else if (phase === 'holed') {
          // 球掉进杯：往下沉
          const k = Math.min(1, phaseT / 0.3);
          ballMesh.position.set(env.cup[0], GREEN_Y + BALL_VIS - k * 0.14, env.cup[1]);
          if (phaseT > 1.5) {
            ballMesh.visible = false;
            showCard();
          }
        } else if (phase === 'drop') {
          if (phaseT > 1.0 && dropAt) {
            ball = newBall(dropAt);
            dropAt = null;
            placeBallMesh();
            const h2 = HOLES[hole];
            if (strokes >= h2.par + MAX_OVER) {
              mg.toast(`${strokes} 杆还没进：这洞捡起来`, 1.8);
              endHole(true);
            } else goToBall();
          }
        } else if (phase === 'walk') {
          // 走到了（路走完）或者走太久：站好
          if (play.pathLeft() === 0 || phaseT > 4) {
            address(aimAngle);
            setPhase('aim');
          }
        } else if (phase === 'card') {
          const left = CARD_AUTO - phaseT;
          gui.setCountdown(left);
          if (left <= 0) nextHole();
        }
        if (phase !== 'roll' && phase !== 'swing') putter.swing.rotation.z = 0;

        // 相机：慢慢跟着球和杯的中点
        const [gx, gz] = camGoal();
        const kk = 1 - Math.exp(-dt * 2.6);
        cam.x += (gx - cam.x) * kk;
        cam.z += (gz - cam.z) * kk;
        cam.y += (0 - cam.y) * kk;
      },
      frame() {
        if (mg.state !== 'playing') gui.setPower(null);
      },
      finish() {
        setPhase('done');
        clearAim();
        setLook(false);
        gui.setLook(false, false);
        gui.hideCard();
        gui.setPlate(null);
        mg.stat('quick', '快手', null);
        return { lines: settle(results, HOLES.length) };
      },
      debug: () => ({
        phase,
        hole: hole + 1,
        strokes,
        penalties,
        lips,
        lastEvent,
        holeT: +holeT.toFixed(1),
        ball: [+ball.x.toFixed(2), +ball.z.toFixed(2)],
        moving: ball.moving,
        results: results.map((r) => `${r.strokes}/${r.par}`).join(' '),
        green: [GREEN.x, GREEN.z],
      }),
    };
  },
});
