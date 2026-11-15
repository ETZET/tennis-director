// clubbuild 画廊：clubbuild.html?asset=<设施 id 或复用资产 id>[&rot=0..3][&v=变体][&px=2][&grid=0]
// 上/左 = 最终缩放（默认 px 2），下/右 = 同一画面放大 3 倍。地上画出 catalog 的占地格（虚线框 = 这件东西不该超出的范围）。
// 截图：SHOT_OUT=x.png node docs/lab/2026-11-07-3d-pixel/tools/shot.mjs "http://localhost:5173/clubbuild.html?asset=cafe" 4000 390 844
import * as THREE from 'three';
import { topGeo, wallGeo } from '../clubsite/render/geo';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N } from '../clubsite/render/toon';
import { BY_ID, TILE } from './catalog';
import type { SharedUniforms } from './ctx';
import { createKit } from './kit';
import { SKY } from './palette';

export function runGallery(id: string, params: URLSearchParams) {
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const deg = Math.PI / 180;
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
  scene.background = new THREE.Color(SKY.top);

  const def = BY_ID[id];
  const rot = num('rot', 0) & 3;
  const fw = def ? (rot % 2 ? def.d : def.w) * TILE : 3;
  const fd = def ? (rot % 2 ? def.w : def.d) * TILE : 3;
  const PX0 = num('px', 2);
  // 取景：占地越大缩得越远（米/纹素），小东西保持 2× 设计纹素
  const span = Math.max(fw, fd * 0.8, 4);
  const zoom = num('zoom', Math.max(0.09, span / 150) * (PX0 / 2));
  const designTexel = 0.09;
  const edges = { depthStrength: 0.48, normalStrength: 0.6, topStrength: 0.35 };
  const rig = {
    target: new THREE.Vector3(0, 0.5, 0),
    yaw: num('yaw', 0) * deg,
    pitch: num('pitch', 45) * deg,
    metersPerTexel: zoom,
  };
  const pipe = new PixelPipeline(canvas, { px: PX0, fxLayer: 1, rig, edges });
  const pipe2 = new PixelPipeline(canvas2, {
    px: PX0 * 3,
    fxLayer: 1,
    rig: { ...rig, target: rig.target.clone() },
    edges,
  });

  const sun = new THREE.DirectionalLight(0xfff0d8, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const r = Math.max(fw, fd) * 0.8 + 6;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 200 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  const el = num('sunel', 44) * deg;
  const az = num('sunaz', 8) * deg;
  sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(90);
  scene.add(sun, sun.target);

  const kit = createKit({ uniforms, params, texelMeters: () => pipe.rig.metersPerTexel, designTexel });
  const { obj, kind } = kit.makeAsset(id, num('v', 0));
  obj.rotation.y = (rot * Math.PI) / 2;
  scene.add(obj);
  const updaters: ((dt: number, t: number) => void)[] = [];
  obj.traverse((c) => {
    const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
    if (u) updaters.push(u);
  });

  // 台子（沙地）+ 占地格
  const ctx = kit.ctxFor(0);
  const hw = fw / 2 + 2;
  const hd = fd / 2 + 4;
  const pts: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const tile = new THREE.Group();
  tile.add(new THREE.Mesh(topGeo(pts, 0), ctx.mat(params.get('ground') === 'tile' ? 'tile' : 'sandHigh')));
  tile.add(new THREE.Mesh(wallGeo(pts, 0, -1.2, true), ctx.mat('adobe')));
  ctx.mats.prepare(tile);
  scene.add(tile);
  if (def && params.get('grid') !== '0') {
    const lines: number[] = [];
    const y = 0.03;
    for (let i = 0; i <= fw / TILE; i++) lines.push(-fw / 2 + i * TILE, y, -fd / 2, -fw / 2 + i * TILE, y, fd / 2);
    for (let j = 0; j <= fd / TILE; j++) lines.push(-fw / 2, y, -fd / 2 + j * TILE, fw / 2, y, -fd / 2 + j * TILE);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff4fd0 }));
    ls.layers.set(1);
    scene.add(ls);
  }

  const box3 = new THREE.Box3().setFromObject(obj);
  const size = box3.getSize(new THREE.Vector3());
  const c0 = box3.getCenter(new THREE.Vector3());
  pipe.rig.target.set(c0.x, Math.max(0, c0.y * 0.6), c0.z);
  pipe2.rig.target.copy(pipe.rig.target);
  const what = { own: '', reused: '（复用）', placeholder: '（还没画：灰盒）' }[kind];
  const over = def ? Math.max(size.x - fw, size.z - fd) : 0;
  infoEl.textContent =
    `${id}${what} · rot ${rot} · 包围盒 ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} 米` +
    (def ? ` · 占地 ${fw}×${fd} 米${over > 0.4 ? ` · 超出 ${over.toFixed(1)} 米！` : ''}` : '');

  const onResize = () => {
    const dpr = Math.min(devicePixelRatio, 3);
    pipe.resize(canvas.clientWidth, canvas.clientHeight, dpr);
    pipe2.resize(canvas2.clientWidth, canvas2.clientHeight, dpr);
  };
  addEventListener('resize', onResize);
  onResize();

  let last = performance.now();
  let t = 0;
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    uniforms.uTime.value = t;
    for (const u of updaters) u(dt, t);
    pipe.render(scene);
    pipe2.render(scene);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
