import { BallPool, createStage, hollowCreek, OrbitCamera, type PeopleWorld, Scheduler } from '@td/render';
import { clamp } from '@td/shared';
import { mountHud } from '@td/ui';
import { Hud } from './hud';
import { LabelLayer } from './labels';
import { createHollowCreekDemo } from './story';

/**
 * Hollow Creek 场景查看器：静态场景来自 @td/render，剧情是写死的演示时间轴。
 * 和原型 prototypes/hollow-creek.html 画面一致（见 tools/screenshot）。
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const container = $('stage');
const stage = createStage(container, hollowCreek.HOLLOW_CREEK_LIGHTING);
const { bubblePeaks } = hollowCreek.buildHollowCreekStage(stage);

const sched = new Scheduler();
const world: PeopleWorld = { scene: stage.scene, groundY: hollowCreek.groundY, people: [] };
const pool = new BallPool(stage.scene, hollowCreek.groundY);
const now = () => sched.now;
const hud = new Hud(now);
const labels = new LabelLayer($('labels'), stage.cam, now);
const HOME = hollowCreek.HOLLOW_CREEK_CAMERA.overview;

const demo = createHollowCreekDemo({ stage, sched, world, pool, hud, labels, bubblePeaks, home: HOME });

/* ---------- 相机 ---------- */
const camera = new OrbitCamera(stage, HOME, hollowCreek.HOLLOW_CREEK_CAMERA_LIMITS);
window.addEventListener('resize', () => camera.resize());
camera.resize();
camera.bindPointer(stage.renderer.domElement);

/* ---------- 转播 HUD（@td/ui）：控制按钮收在快讯带的右端 ---------- */
let speed = 1;
let paused = false;
const SPEEDS = [1, 2, 0.5];
let si = 0;
const speedLabel = () => `${speed === 0.5 ? '½' : speed}×`;
const ui = mountHud($('hud'), {
  rotate: (dir) => camera.rotate(-dir),
  togglePause: () => {
    paused = !paused;
    draw();
  },
  cycleSpeed: () => {
    si = (si + 1) % SPEEDS.length;
    speed = SPEEDS[si] as number;
    draw();
  },
  answer: (key) => {
    hud.answer(key);
    draw();
  },
  cardAction: (id) => {
    if (id === 'replay') location.reload();
  },
});
const draw = () => ui.update(hud.snapshot(demo.lessonBalls(), { paused, speed: speedLabel() }));

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button,summary,input') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === 'q' || e.key === 'Q') camera.rotate(1);
  else if (e.key === 'e' || e.key === 'E') camera.rotate(-1);
  else if (e.key === '+' || e.key === '=') camera.zoomIn();
  else if (e.key === '-' || e.key === '_') camera.zoomOut();
  else if (e.key === 'r' || e.key === 'R') camera.reset();
  else if (e.key === '1' || e.key === '2' || e.key === '3') {
    hud.answer(Number(e.key) as 1 | 2 | 3);
    draw();
  } else if (e.key === ' ') {
    e.preventDefault();
    paused = !paused;
    draw();
  }
});

/* ---------- 主循环 ---------- */
let last = performance.now();
let uiT = 0;
function frame(ts: number) {
  requestAnimationFrame(frame);
  const dt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts;
  const sdt = paused ? 0 : dt * speed;
  sched.advance(sdt);
  demo.tickStats(sdt);
  demo.updateActors(sdt, sched.now, ts);
  camera.update(dt, demo.focus());
  demo.updateRain(sdt, camera.smooth.tx, camera.smooth.tz);
  stage.renderer.render(stage.scene, stage.cam);
  labels.place(container.clientWidth, container.clientHeight);
  uiT += dt;
  if (uiT > 0.25) {
    uiT = 0;
    draw();
  }
}
draw();
requestAnimationFrame(frame);
