import { createStage, hollowCreek, OrbitCamera } from '@td/render';
import { SIM_VERSION } from '@td/sim';
import { UI_VERSION } from '@td/ui';

/**
 * 正式游戏入口。M0 只验证包之间能组装起来：显示 Hollow Creek 静态场景，可以转动相机。
 * M1 起这里创建模拟、订阅快照、把命令从界面转给模拟。
 */

const container = document.getElementById('stage');
if (!container) throw new Error('#stage missing');
const stage = createStage(container, hollowCreek.HOLLOW_CREEK_LIGHTING);
hollowCreek.buildHollowCreekStage(stage);
const camera = new OrbitCamera(stage, hollowCreek.HOLLOW_CREEK_CAMERA.overview);
camera.bindPointer(stage.renderer.domElement);
window.addEventListener('resize', () => camera.resize());
camera.resize();

let last = performance.now();
function frame(ts: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
  last = ts;
  camera.update(dt, null);
  stage.renderer.render(stage.scene, stage.cam);
}
requestAnimationFrame(frame);

console.info(`sim v${SIM_VERSION} · ui v${UI_VERSION}`);
