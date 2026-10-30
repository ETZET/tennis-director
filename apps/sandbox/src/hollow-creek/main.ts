import { BallPool, createStage, hollowCreek, OrbitCamera, type PeopleWorld, Scheduler } from '@td/render';
import { clamp } from '@td/shared';
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
hud.collapseOnPhone();

/* ---------- 相机 ---------- */
const camera = new OrbitCamera(stage, HOME);
window.addEventListener('resize', () => camera.resize());
camera.resize();
camera.bindPointer(stage.renderer.domElement);

/* ---------- 工具栏 ---------- */
let speed = 1;
let paused = false;
const SPEEDS = [1, 2, 0.5];
let si = 0;
$('rotL').onclick = () => camera.rotate(1);
$('rotR').onclick = () => camera.rotate(-1);
$('zoomIn').onclick = () => camera.zoomIn();
$('zoomOut').onclick = () => camera.zoomOut();
$('resetView').onclick = () => camera.reset();
$('follow').onclick = () => {
  camera.setFollow(!camera.followStory);
  $('follow').setAttribute('aria-pressed', String(camera.followStory));
};
$('pix').onclick = () => {
  $('pix').textContent = `Pixels: ${camera.cyclePixels()}`;
};
$('lblBtn').onclick = () => {
  labels.show = !labels.show;
  $('lblBtn').setAttribute('aria-pressed', String(labels.show));
};
$('spd').onclick = () => {
  si = (si + 1) % SPEEDS.length;
  speed = SPEEDS[si] as number;
  $('spd').textContent = `Speed ${speed === 0.5 ? '½' : speed}×`;
};
$('pause').onclick = () => {
  paused = !paused;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('pause').setAttribute('aria-pressed', String(paused));
};
$('replay').onclick = () => {
  location.reload();
};
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button,summary') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === 'q' || e.key === 'Q') camera.rotate(1);
  else if (e.key === 'e' || e.key === 'E') camera.rotate(-1);
  else if (e.key === '+' || e.key === '=') $('zoomIn').click();
  else if (e.key === '-' || e.key === '_') $('zoomOut').click();
  else if (e.key === ' ') {
    e.preventDefault();
    $('pause').click();
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
    hud.draw(demo.lessonBalls());
  }
}
hud.draw(demo.lessonBalls());
requestAnimationFrame(frame);
