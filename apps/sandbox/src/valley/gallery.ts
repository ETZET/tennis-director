// valley 市中心三栋办事楼的资产画廊（美术关卡 2）：valleyassets.html?asset=<id> 一块空地上只放这个资产；不带 asset = 列表页。
// 上 / 左 = 游戏里的大小（默认每纹素 1 CSS 像素，米/纹素 0.045 = /valley.html 的默认缩放），下 / 右 = 同一画面放大 3 倍（拖动看不同部位）。
// 渲染核心照 clubsite/render（colors 最先 import、PixelPipeline、色阶材质、配色方案 ?pal=），时间和天气照 clubsite/daylight（?hour= / ?weather=，
// 画廊里时间默认停着：tspeed 0、weather clear）。资产：src/valley/assets（各栋一个文件，ASSETS 表；没画的显示 specs.ts 的灰盒）。
// URL：asset、v（变体）、rot（度，绕 y 转资产；镜头永远 yaw 0）、zoom（米/纹素，默认 0.045）、px（默认 1）、hour、weather、tspeed、pal、
//      ground=sand|concrete|tile|asphalt（脚下的地，默认 sand）、ref=0（不放 1.7 米的比例人）、seed。
// 右下角的按钮（手机拇指够得着，≥ 44 px）：转 ±45°、拉近 / 拉远、换时刻（12 → 17.6 → 21 → 7.5）、回列表。
import '../clubsite/render/colors';
import * as THREE from 'three';
import { SKY } from '../clubmap2/palette';
import { mountDaylight } from '../clubsite/daylight';
import type { SharedUniforms } from '../clubsite/render/ctx';
import { topGeo, wallGeo } from '../clubsite/render/geo';
import { rngFactory } from '../clubsite/render/noise';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N, createMats, type ToonOpts } from '../clubsite/render/toon';
import { assetIds, BATCH_NAME, type Batch, makeAsset, SPECS } from './assets';
import type { AssetCtx } from './ctx';
import { EL, gradeKey, PAL, type PalKey, swatchOpts } from './palette';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : d);
const deg = Math.PI / 180;
const id = params.get('asset');

if (!id) showList();
else showAsset(id);

/** 列表页：按批分组，画了的绿、没画的（灰盒）紫 */
function showList() {
  document.body.classList.add('list');
  const el = document.getElementById('list') as HTMLDivElement;
  const keep = new URLSearchParams(params);
  keep.delete('asset');
  const q = keep.toString();
  const ids = assetIds();
  let html =
    '<h1>valley 市中心 · 资产画廊</h1><p>docs/lab/2026-11-07-3d-pixel/valley-town.md 的资产清单。绿 = 画了，紫 = 还没画（显示灰盒）。' +
    '点开：上 = 游戏里的大小，下 = 放大 3 倍；右下角转、缩放、换时刻。</p>';
  for (const b of ['P', 'S', 'H', 'C', '?'] as const) {
    const rows = ids.filter((r) => r.batch === b);
    if (!rows.length) continue;
    html += `<h2>${b === '?' ? '清单外' : BATCH_NAME[b as Batch]}</h2>`;
    for (const r of rows) {
      const s = SPECS[r.id];
      const size = s ? `${s.w}×${s.h}×${s.d} 米` : '';
      html += `<a class="${r.drawn ? 'drawn' : ''}" href="?asset=${encodeURIComponent(r.id)}${q ? `&${q}` : ''}"><b>${r.id}</b><span>${s?.name ?? ''} ${size}<em>${r.drawn ? '画了' : '灰盒'}</em></span></a>`;
    }
  }
  el.innerHTML = html;
}

function showAsset(assetId: string) {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const canvas2 = document.getElementById('c2') as HTMLCanvasElement;
  const infoEl = document.getElementById('info') as HTMLDivElement;
  const ctlEl = document.getElementById('ctl') as HTMLDivElement;
  // 画廊默认时间停着、晴天（截图稳定）；URL 给了就照 URL
  const dayParams = new URLSearchParams(params);
  if (!dayParams.has('tspeed')) dayParams.set('tspeed', '0');
  if (!dayParams.has('weather')) dayParams.set('weather', 'clear');
  /** 配色：不带 ?pal = 默认（6 午后金光）；?pal=current = 原来的沙漠配色 */
  const scheme = schemeById(params.get('pal'));

  const uniforms: SharedUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.8, 0.35).normalize().multiplyScalar(num('wind', 0.4)) },
    uGust: { value: 0.5 },
    uClouds: { value: Array.from({ length: CLOUD_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uCloudVel: { value: new THREE.Vector2(0, 0) },
    uCloudStrength: { value: 0 },
  };
  const scene = new THREE.Scene();

  const PX = num('px', 1);
  const ZOOM = num('zoom', 0.045 * PX);
  const edges = {
    depthStrength: num('dstr', scheme?.edges?.depthStrength ?? 0.48),
    normalStrength: num('nstr', scheme?.edges?.normalStrength ?? 0.6),
    topStrength: num('tstr', scheme?.edges?.topStrength ?? 0.35),
    tint: scheme?.edgeTint,
  };
  const rig = () => ({
    target: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 45 * deg,
    metersPerTexel: ZOOM,
  });
  const pipe = new PixelPipeline(canvas, { px: PX, fxLayer: 1, rig: rig(), edges });
  const pipe2 = new PixelPipeline(canvas2, { px: PX * 3, fxLayer: 1, rig: rig(), edges });

  // 太阳：clubsite/daylight 管方向和颜色（?hour=）；阴影相机罩住资产
  const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  // ── 资产上下文：valley 的整张调色板（palette.ts），新材质按 PROXY 借组过配色（同场景里的 valleyMat） ──
  const mats = createMats(uniforms, () => pipe.rig.metersPerTexel);
  const variant = num('v', 0);
  const ctx: AssetCtx = {
    mats: scheme ? schemeMats(scheme, mats) : mats,
    pal: PAL,
    mat(key: PalKey, extra?: ToonOpts) {
      const o = swatchOpts(key, extra);
      // biome-ignore lint/suspicious/noExplicitAny: 地图的材质名不全在 clubfront 的 Pal 里，按全局 / 组调色走（同 clubwalk 的 mapOpts）
      return mats.toon(0xffffff, scheme ? schemeOpts(scheme, gradeKey(key) as any, o) : o);
    },
    rng: rngFactory(num('seed', 13)),
    uniforms,
    layers: { FX: 1 },
    texel: 0.09,
    variant,
    params,
  };

  const { obj, kind } = makeAsset(assetId, ctx);
  const holder = new THREE.Group();
  holder.add(obj);
  holder.rotation.y = num('rot', 0) * deg;
  scene.add(holder);
  const updaters: ((dt: number, t: number) => void)[] = [];
  obj.traverse((c) => {
    const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
    if (u) updaters.push(u);
  });

  // 包围盒（转 0° 时量）：台子、取景、阴影相机都按它
  const bb = new THREE.Box3().setFromObject(obj);
  const size = bb.getSize(new THREE.Vector3());
  const c0 = bb.getCenter(new THREE.Vector3());
  const R = Math.max(2, Math.hypot(size.x, size.z) / 2 + 1.2);
  // 地：一块圆角方台（转资产也罩得住），太阳在后方、影子落向镜头 ≈ 高 × 1.4
  const hw = R;
  const hd = Math.max(R, size.y * 1.4 * 0.6 + 1);
  const pts: [number, number][] = [];
  const r = 0.8;
  for (let k = 0; k < 4; k++) {
    const cx = c0.x + (k === 0 || k === 3 ? 1 : -1) * (hw - r);
    const cz = c0.z + (k < 2 ? 1 : -1) * (hd - r);
    for (let i = 0; i <= 4; i++) {
      const a = (k * Math.PI) / 2 + (i / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  const ground = (params.get('ground') ?? 'sand') as 'sand' | 'concrete' | 'tile' | 'asphalt';
  const GROUND: Record<string, [PalKey, ToonOpts]> = {
    sand: ['sand', { elem: EL.sand }],
    concrete: ['concrete', {}],
    tile: ['tile', { elem: EL.tile }],
    asphalt: ['asphalt', {}],
  };
  const [gk, gopt] = GROUND[ground] ?? GROUND.sand;
  const tile = new THREE.Group();
  tile.add(new THREE.Mesh(topGeo(pts, 0), ctx.mat(gk, gopt)));
  tile.add(new THREE.Mesh(wallGeo(pts, 0, -1.2, true), ctx.mat('adobe', { elem: EL.adobe })));
  mats.prepare(tile, { cast: false, receive: true });
  scene.add(tile);
  // 比例人：1.7 米（总监的身高），站在台子左前角
  if (params.get('ref') !== '0') {
    const man = new THREE.Group();
    man.add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.3, 0.26).translate(0, 0.65, 0), ctx.mat('clothBlue')));
    man.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.26).translate(0, 1.42, 0), ctx.mat('skinTan')));
    man.position.set(c0.x - hw + 0.7, 0, c0.z + hd - 0.8);
    mats.prepare(man);
    scene.add(man);
  }
  const S = Math.max(6, hw + 2, hd + 2, size.y + 2);
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 200 });
  sun.target.position.set(c0.x, 0, c0.z);
  const aim = new THREE.Vector3(c0.x, Math.max(0, c0.y * 0.6), c0.z + 0.4);
  pipe.rig.target.copy(aim);
  pipe2.rig.target.copy(aim);

  const day = mountDaylight({ scene, pipe, sun, uniforms, params: dayParams, scheme, sky: SKY, hud: null });

  // 信息条：id、画了没有、包围盒（米 / 设计纹素）、清单规格、三角形
  let tris = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const n = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    tris += n * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
  });
  const sp = SPECS[assetId];
  const tx = (m: number) => Math.round(m / ctx.texel);
  const what = { own: '', placeholder: '（还没画：灰盒）', unknown: '（清单里没有这个 id）' }[kind];
  const info = () =>
    `${assetId}${what} · v${variant} · 转 ${Math.round(holder.rotation.y / deg)}° · ${clock()} · ` +
    `包围盒 ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} 米 = ${tx(size.x)}×${tx(size.y)}×${tx(size.z)} 纹素 · ` +
    `${Math.round(tris)} 三角形` +
    (sp ? ` · 规格 ${sp.w}×${sp.h}×${sp.d} 米、≤ ${sp.tris}` : '');
  const clock = () => {
    const h = ((day.total % 24) + 24) % 24;
    return `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  };
  const sync = () => {
    infoEl.textContent = info();
  };
  sync();

  // ── 按钮（右下角，拇指够得着） ──
  const btn = (label: string, title: string, f: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', () => {
      f();
      sync();
    });
    ctlEl.appendChild(b);
  };
  btn('左转', '往左转 45°', () => {
    holder.rotation.y += 45 * deg;
  });
  btn('右转', '往右转 45°', () => {
    holder.rotation.y -= 45 * deg;
  });
  btn('−', '拉远', () => {
    pipe.rig.metersPerTexel *= 1.25;
    pipe2.rig.metersPerTexel *= 1.25;
  });
  btn('+', '拉近', () => {
    pipe.rig.metersPerTexel /= 1.25;
    pipe2.rig.metersPerTexel /= 1.25;
  });
  const HOURS = [12, 17.6, 21, 7.5];
  btn('时刻', '换时刻：12 → 17.6 → 21 → 7.5', () => {
    const h = ((day.total % 24) + 24) % 24;
    const i = HOURS.findIndex((x) => Math.abs(x - h) < 0.05);
    day.setHour(HOURS[(i + 1) % HOURS.length]);
  });
  {
    const a = document.createElement('a');
    a.href = '?';
    a.textContent = '列表';
    ctlEl.appendChild(a);
  }

  // 拖动：上下两个画面各自平移（看大资产的不同部位）
  for (const [cv, p] of [
    [canvas, pipe],
    [canvas2, pipe2],
  ] as const) {
    let last: { x: number; y: number } | null = null;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!last) return;
      const s = p.rig.metersPerTexel / p.px;
      p.rig.target.x -= (e.clientX - last.x) * s;
      p.rig.target.z -= ((e.clientY - last.y) * s) / Math.sin(p.rig.pitch);
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => {
      last = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  const resize = () => {
    const dpr = Math.min(devicePixelRatio, 3);
    pipe.resize(canvas.clientWidth, canvas.clientHeight, dpr);
    pipe2.resize(canvas2.clientWidth, canvas2.clientHeight, dpr);
  };
  addEventListener('resize', resize);
  resize();

  const DT = 1 / 60;
  let simT = 0;
  let acc = 0;
  let last = performance.now();
  let lastClock = '';
  const frame = (now: number) => {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= DT) {
      simT += DT;
      uniforms.uTime.value = simT;
      uniforms.uGust.value = 0.5 + 0.35 * Math.sin(simT * 0.7) * Math.sin(simT * 0.23);
      day.step(DT);
      for (const u of updaters) u(DT, simT);
      acc -= DT;
    }
    day.frame();
    pipe.render(scene);
    pipe2.render(scene);
    const c = clock();
    if (c !== lastClock) {
      lastClock = c;
      sync();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
