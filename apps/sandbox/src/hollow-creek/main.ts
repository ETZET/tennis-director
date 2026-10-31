import { BallPool, createStage, hollowCreek, OrbitCamera, type PeopleWorld, Scheduler } from '@td/render';
import { clamp } from '@td/shared';
import { mountHud } from '@td/ui';
import type * as THREE from 'three';
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
labels.occluders = () =>
  [...document.querySelectorAll('.td-bug,.td-strip-wrap,.td-card,.td-wire')].map((el) => el.getBoundingClientRect());
// 竖屏手机用岛铺满宽度的默认视角
const HOME =
  container.clientWidth / Math.max(1, container.clientHeight) < 0.8
    ? hollowCreek.HOLLOW_CREEK_CAMERA_PORTRAIT
    : hollowCreek.HOLLOW_CREEK_CAMERA.overview;

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

/* ---------- 围网：朝相机那一侧的网片隐藏，场地不像隔着一层玻璃 ---------- */
const fenceBays: { m: THREE.Object3D; nx: number; nz: number }[] = [];
stage.scene.traverse((o) => {
  const n = o.userData.fenceNormal as { x: number; z: number } | undefined;
  if (n) fenceBays.push({ m: o, nx: n.x, nz: n.z });
});
function cutAwayNearFences() {
  const dx = Math.sin(camera.smooth.yaw);
  const dz = Math.cos(camera.smooth.yaw);
  for (const b of fenceBays) b.m.visible = b.nx * dx + b.nz * dz < 0.3;
}

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
  // 一米不到 4 个像素时，编号牌只留编号；近到一米 30 个像素以上就收起来
  const pxPerM = container.clientHeight / (stage.cam.top - stage.cam.bottom);
  labels.compact = pxPerM < 4;
  labels.hideMarkers = pxPerM > 30;
  cutAwayNearFences();
  // 事件卡挡住画面下部时，相机把焦点抬到卡片上方
  const card = document.querySelector('.td-card');
  camera.occludedBottomPx = card ? container.clientHeight - card.getBoundingClientRect().top : 0;
  labels.place(container.clientWidth, container.clientHeight);
  uiT += dt;
  if (uiT > 0.25) {
    uiT = 0;
    draw();
  }
}
// 开发用：?t=60 打开时把剧情快进到第 60 秒（不渲染，只推进演出），方便看某一拍
const skipTo = Number(new URLSearchParams(location.search).get('t')) || 0;
for (let k = 0; k < skipTo / 0.05; k++) {
  sched.advance(0.05);
  demo.tickStats(0.05);
  demo.updateActors(0.05, sched.now, k * 50);
  demo.updateRain(0.05, camera.smooth.tx, camera.smooth.tz);
}
draw();
requestAnimationFrame(frame);
