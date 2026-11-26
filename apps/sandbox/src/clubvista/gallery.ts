// clubvista 的资产画廊：clubvista.html?asset=<id>[&v=变体][&ground=floor|mesa|turf|flagstone][&px=2]
// 一块小台子上只放这件资产（同 clubpickle 的画廊）：上 / 左 = 最终缩放（默认 2×，便于看），下 / 右 = 同一画面放大 3 倍；
// 旁边一个 1.8 米的人当比例尺（?ref=0 关）。太阳固定在 12 点的方向（el 46、az 12），配色同场景（?pal=）。
// 资产：src/clubvista/assets/<id>.ts（本地优先），然后复用表（reuse.ts），都没有 = 白模占位（placeholders.ts）。
import * as THREE from 'three';
import { topGeo, wallGeo } from '../clubsite/render/geo';
import { schemeById } from '../clubsite/render/palettes';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N } from '../clubsite/render/toon';
import { createKit } from './build';
import type { SharedUniforms } from './ctx';
import { vista } from './grade';
import type { Pal } from './palette';
import { SPECS } from './placeholders';

// window.location：单文件打包只换 world.ts 的那个 URLSearchParams(location.search)（默认查询串）
const params = new URLSearchParams(window.location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const deg = Math.PI / 180;
const id = params.get('asset') ?? '';
const palId = params.get('pal') ?? 'vista';
const scheme = palId === 'vista' ? vista : schemeById(palId);
document.body.classList.add('gallery');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const canvas2 = document.getElementById('c2') as HTMLCanvasElement;
const infoEl = document.getElementById('info') as HTMLDivElement;

const uniforms: SharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(0.4) },
  uGust: { value: 0.5 },
  uClouds: { value: Array.from({ length: CLOUD_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uCloudVel: { value: new THREE.Vector2(0, 0) },
  uCloudStrength: { value: 0 },
};
const scene = new THREE.Scene();
scene.background = new THREE.Color(scheme?.sky.top ?? 0x5fb0e8);
const MPT = 0.09;
const PX = num('px', 2);
const zoom = (MPT * PX) / 2;
const edges = { depthStrength: 0.48, normalStrength: 0.6, topStrength: 0.35, tint: scheme?.edgeTint };
const rig = { target: new THREE.Vector3(0, 0.6, 0.4), yaw: 0, pitch: 45 * deg, metersPerTexel: zoom };
const pipe = new PixelPipeline(canvas, { px: PX, fxLayer: 1, rig, edges });
const pipe2 = new PixelPipeline(canvas2, {
  px: PX * 3,
  fxLayer: 1,
  rig: { ...rig, target: rig.target.clone() },
  edges,
});

const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 120 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
const el = num('sunel', 46) * deg;
const az = num('sunaz', 12) * deg;
sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(60);
scene.add(sun, sun.target);

const kit = createKit({ uniforms, params, texelMeters: () => pipe.rig.metersPerTexel, designTexel: MPT, scheme });
const { obj, kind } = kit.makeAsset(id, num('v', 0));
obj.rotation.y = num('r', 0);
scene.add(obj);
const box = new THREE.Box3().setFromObject(obj);
const size = box.getSize(new THREE.Vector3());
const c0 = box.getCenter(new THREE.Vector3());
// 台子：接得住投影（影子落向镜头 ≈ 0.9 × 高）
const hw = Math.max(2, size.x / 2 + 1.2);
const hd = Math.max(2, size.z / 2 + 1.2, size.z / 2 + size.y * 0.9);
const pts: [number, number][] = [
  [c0.x - hw, c0.z - hd],
  [c0.x + hw, c0.z - hd],
  [c0.x + hw, c0.z + hd],
  [c0.x - hw, c0.z + hd],
];
const ctx = kit.ctxFor(0);
const ground = (params.get('ground') ?? 'floor') as keyof Pal;
const tile = new THREE.Group();
tile.add(new THREE.Mesh(topGeo(pts, 0), ctx.mat(ground)));
tile.add(new THREE.Mesh(wallGeo(pts, 0, -1.2, true), ctx.mat('bluff')));
ctx.mats.prepare(tile);
scene.add(tile);
if (params.get('ref') !== '0') {
  const ref = kit.makeAsset('player', 0).obj;
  ref.position.set(c0.x - hw + 0.5, 0, c0.z + hd - 0.6);
  scene.add(ref);
}
rig.target.set(c0.x, Math.max(0, c0.y * 0.6), c0.z + 0.4);
pipe2.rig.target.copy(rig.target);
const tx = (m: number) => Math.round(m / MPT);
const sp = SPECS[id];
infoEl.textContent =
  `${id}（${{ own: '新画', reused: '复用', placeholder: '白模占位' }[kind]}）· v${num('v', 0)} · ` +
  `${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} 米 = ${tx(size.x)}×${tx(size.y)}×${tx(size.z)} 设计纹素` +
  (sp ? ` · 规格 ${sp.w}×${sp.h}×${sp.d}` : '');

const updaters: ((dt: number, t: number) => void)[] = [];
obj.traverse((c) => {
  const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
  if (u) updaters.push(u);
});
function resize() {
  const dpr = Math.min(devicePixelRatio, 3);
  pipe.resize(canvas.clientWidth, canvas.clientHeight, dpr);
  pipe2.resize(canvas2.clientWidth, canvas2.clientHeight, dpr);
}
addEventListener('resize', resize);
resize();
let t = 0;
const paused = params.get('pause') === '1';
function frame() {
  if (!paused) {
    t += 1 / 60;
    uniforms.uTime.value = t;
    for (const u of updaters) u(1 / 60, t);
  }
  pipe.render(scene);
  pipe2.render(scene);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
Object.assign(window, { __gallery: { scene, obj, pipe, pipe2 } });
