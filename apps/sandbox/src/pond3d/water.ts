// 水面：一块平面（池塘形状），自己的 ShaderMaterial：
// - 底色 + 天上的云（滚动噪声，按纹素抖动后分三档 → 参考图那种块状云影倒影）；
// - 平面反射（管线渲的镜像图，按世界坐标投影采样），压暗偏蓝后和底色混合；
// - 岸边一圈白色虚线泡沫（CPU 烘焙的到岸距离场）；
// - 鱼影（解析形状）、雨点涟漪、冬天结冰（噪声阈值 + 离岸距离）。
import * as THREE from 'three';
import { CLOUD_REFL, H, OPEN_WATER, reflAt, type V2 } from './layout';
import type { Shared } from './ramp';
import type { Palette } from './season';

const VERT = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorld = worldPosition.xyz;
  vec3 transformedNormal = normalMatrix * normal;
  #include <shadowmap_vertex>
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
uniform sampler2D tRefl;
uniform sampler2D tSdf;
uniform vec4 uSdfBox; // x0, z0, 1/w, 1/h
uniform mat4 uMirror;
uniform float uTime;
uniform float uTexel;
uniform vec3 uDeep, uBase, uCloud, uCloud2, uShallow, uFoam, uRefl, uFish, uCloudBig;
uniform float uIce;
uniform float uRain;
uniform float uLeaves;
uniform float uReflOn;
uniform float uReflK;
uniform float uCloudsOn;
uniform float uFoamOn;
uniform vec3 uIceRamp[3];
uniform vec4 uOpen; // 冬天不结冰的那片：x, z, rx, rz
uniform vec4 uFishes[4]; // x, z, 朝向角, 大小
uniform vec4 uCloudRefl[3]; // 云倒影：x, z, rx, rz
uniform vec3 uCloudBig2;
varying vec3 vWorld;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.28 * vnoise(p * 2.03 + 7.1) + 0.14 * vnoise(p * 4.1 + 3.3) + 0.08 * vnoise(p * 8.3 + 1.7); }

float sunShadow() {
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow s = directionalLightShadows[0];
    return step(0.5, getShadow(directionalShadowMap[0], s.shadowMapSize, 1.0, s.shadowBias, s.shadowRadius, vDirectionalShadowCoord[0]));
  #else
    return 1.0;
  #endif
}

void main() {
  #ifdef NORMAL_PASS
    gl_FragColor = vec4(0.5, 1.0, 0.5, 0.0);
    return;
  #endif
  // 纹素对齐的世界坐标
  vec2 w = vWorld.xz;
  vec2 tc = floor(w / uTexel);
  vec4 sdf = texture2D(tSdf, (w - uSdfBox.xy) * uSdfBox.zw);
  float sd = sdf.r * 4.0; // 到岸距离（米，0..4）
  float nd = sdf.g * 6.0; // 往北到岸的距离（米，0..6）：北岸脚下那一条亮带靠它
  float dith = hash12(tc) - 0.5;
  vec2 tcw = tc * uTexel; // 纹素中心（取噪声用，保证一纹素一个颜色）

  // 底色 + 细碎的横向斑块（参考图水面那种 6～15 纹素的小块，两三档）
  vec3 col = uBase;
  vec2 bp = vec2(tcw.x * 0.8, tcw.y * 1.5) + vec2(uTime * 0.03, uTime * 0.01);
  float bl = fbm(bp) + dith * 0.05;
  // 北岸脚下的天光亮带：越靠北岸越亮，交界跟着斑块走
  float band = smoothstep(3.2, 0.3, nd) * 0.75 + (bl - 0.5) * 0.9;
  if (uCloudsOn > 0.5) {
    if (band > 0.62) col = uShallow;
    else if (band > 0.42) col = uCloud;
    else if (band > 0.24 || bl > 0.66) col = uCloud2;
    else if (bl > 0.57) col = mix(uBase, uCloud2, 0.5);
    // 大朵的云倒影（手摆的几块软椭圆）：很淡的灰紫，边缘一圈 1 纹素棋盘格过渡
    float chk = mod(tc.x + tc.y, 2.0);
    for (int i = 0; i < 3; i++) {
      vec4 c = uCloudRefl[i];
      if (c.z <= 0.0) continue;
      vec2 d = (tcw - c.xy - vec2(uTime * 0.02, 0.0)) / c.zw;
      float r = length(d) + (fbm(tcw * 0.32 + float(i) * 5.0) - 0.5) * 0.7;
      vec3 cc = i == 1 ? uCloudBig2 : uCloudBig;
      // 云里面也有一点深浅（跟着水面斑块）
      if (bl > 0.6) cc = mix(cc, uCloud, 0.35);
      float edgeChk = step(0.5, chk) * step(0.5, hash12(floor(tc / 3.0) + float(i)));
      if (r < 0.82 || (r < 0.9 && chk > 0.5)) col = cc;
      else if (r < 0.98 && edgeChk > 0.5) col = mix(col, cc, 0.6);
    }
  }

  // 平面反射：只有挨着水的东西（芦苇、桩、石头、栈桥）进反射 pass；倒影压暗偏蓝
  if (uReflOn > 0.5) {
    vec4 rp = uMirror * vec4(vWorld, 1.0);
    vec4 r = texture2D(tRefl, rp.xy / rp.w);
    if (r.a > 0.5) col = mix(col, mix(r.rgb, uRefl, 0.45), uReflK);
  }

  // 秋天水面漂着的落叶（2×1 纹素的橙/红小块，慢慢漂）
  if (uLeaves > 0.5) {
    vec2 lc = floor((tc + vec2(floor(uTime * 0.4), 0.0)) / vec2(14.0, 9.0));
    vec2 lo = (tc + vec2(floor(uTime * 0.4), 0.0)) - lc * vec2(14.0, 9.0);
    vec2 lp = floor(vec2(hash12(lc + 1.0) * 12.0, hash12(lc + 2.0) * 8.0));
    float lh = hash12(lc + 7.0);
    if (lh < 0.22 && lo.y == lp.y && (lo.x == lp.x || lo.x == lp.x + 1.0) && sd > 0.3)
      col = lh < 0.1 ? vec3(0.75, 0.29, 0.17) : vec3(0.9, 0.56, 0.2);
  }

  // 鱼影
  for (int i = 0; i < 4; i++) {
    vec4 f = uFishes[i];
    if (f.w <= 0.0) continue;
    vec2 d = w - f.xy;
    float ca = cos(f.z), sa = sin(f.z);
    vec2 q = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y) / f.w; // q.x 沿身体
    float body = (q.x * q.x) / 0.36 + (q.y * q.y) / 0.022;
    float tail = step(-0.95, q.x) * step(q.x, -0.55) * step(abs(q.y), (-0.55 - q.x) * 0.55 + 0.02);
    if (body < 1.0 || tail > 0.5) col = mix(col, uFish, 0.75);
  }

  // 雨点涟漪
  if (uRain > 0.5) {
    vec2 cell = floor(w / 1.4);
    float h = hash12(cell);
    float t = fract(uTime * 0.6 + h * 7.0);
    vec2 c = (cell + 0.2 + 0.6 * vec2(hash12(cell + 3.1), hash12(cell + 7.7))) * 1.4;
    float r = length((w - c) * vec2(1.0, 1.0));
    float ring = abs(r - t * 0.45);
    if (h < 0.5 && ring < uTexel * 0.8 && t < 0.8) col = mix(col, vec3(0.85, 0.9, 1.0), 0.6 * (1.0 - t));
  }

  // 结冰：参考图冬天北边一大片冰（浅青 + 大块白雪斑 + 零星深一点的冰），南边中间留一大片开水；
  // 冰和开水交界一纹素白边；形状干净，不加逐纹素抖动
  if (uIce > 0.5) {
    vec2 od = (tcw - uOpen.xy) / uOpen.zw;
    float iv = (fbm(tcw * 0.28 + 3.0) - 0.5) * 0.7 + (length(od) - 1.0) * 1.3 + smoothstep(1.2, 0.0, sd) * 0.4;
    if (iv > 0.0) {
      float sn = fbm(tcw * 0.42 + 11.0);
      float sp = fbm(tcw * 1.3 + 5.0);
      vec3 ic = sn > 0.56 ? uIceRamp[2] : (sp > 0.68 ? uIceRamp[0] : uIceRamp[1]);
      if (iv < 0.035) ic = vec3(0.93, 0.95, 0.98);
      col = ic;
    }
  }

  // 岸边泡沫：一纹素宽的白色虚线
  if (uFoamOn > 0.5) {
    float edge = sd;
    float dash = step(0.35, fract((w.x * 0.9 + w.y * 1.3) * 1.6 + uTime * 0.05));
    if (edge < uTexel * 1.1 && dash > 0.5) col = uFoam;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/** 到岸距离场：池塘多边形内部到边、石头、桩子的距离（米，钳到 4） */
function bakeSdf(pond: V2[], extra: { x: number; z: number; r: number }[], res = 0.08) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pond) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  x0 -= 1;
  z0 -= 1;
  x1 += 1;
  z1 += 1;
  const w = Math.ceil((x1 - x0) / res);
  const h = Math.ceil((z1 - z0) / res);
  const data = new Uint8Array(w * h * 4);
  const n = pond.length;
  // 池塘内部（逐行扫描线填充）
  const inside = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const pz = z0 + (j + 0.5) * res;
    const xs: number[] = [];
    for (let k = 0; k < n; k++) {
      const [ax, az] = pond[k];
      const [bx, bz] = pond[(k + 1) % n];
      if (az <= pz !== bz <= pz) xs.push(ax + ((pz - az) / (bz - az)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let m = 0; m + 1 < xs.length; m += 2) {
      const i0 = Math.max(0, Math.ceil((xs[m] - x0) / res - 0.5));
      const i1 = Math.min(w - 1, Math.floor((xs[m + 1] - x0) / res - 0.5));
      for (let i = i0; i <= i1; i++) inside[j * w + i] = 1;
    }
  }
  // 往北到岸的距离：每列从北往南累加
  const north = new Float32Array(w * h);
  for (let i = 0; i < w; i++) {
    let run = 0;
    for (let j = 0; j < h; j++) {
      run = inside[j * w + i] ? run + res : 0;
      north[j * w + i] = run;
    }
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const px = x0 + (i + 0.5) * res;
      const pz = z0 + (j + 0.5) * res;
      let d = Infinity;
      for (let k = 0; k < n; k++) {
        const [ax, az] = pond[k];
        const [bx, bz] = pond[(k + 1) % n];
        const ex = bx - ax;
        const ez = bz - az;
        const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez)));
        d = Math.min(d, Math.hypot(px - ax - ex * t, pz - az - ez * t));
      }
      for (const e of extra) d = Math.min(d, Math.max(0, Math.hypot(px - e.x, pz - e.z) - e.r));
      const v = Math.round(Math.min(1, d / 4) * 255);
      const g = Math.round(Math.min(1, north[j * w + i] / 6) * 255);
      data.set([v, g, 0, 255], (j * w + i) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, box: new THREE.Vector4(x0, z0, 1 / (w * res), 1 / (h * res)) };
}

export interface Water {
  mesh: THREE.Mesh;
  update(t: number): void;
  uniforms: Record<string, THREE.IUniform>;
}

export function buildWater(
  pond: V2[],
  pal: Palette,
  shared: Shared,
  texel: number,
  refl: { tex: THREE.Texture; matrix: THREE.Matrix4 },
  extra: { x: number; z: number; r: number }[],
  opts: { rain: boolean },
): Water {
  const shape = new THREE.Shape(pond.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, H.water, 0);
  const sdf = bakeSdf(pond, extra);
  const cloudRefl = pal.cloudRefl ? pal.cloudRefl.map(([X, Y, rx, rz]) => reflAt(X, Y, rx, rz)) : CLOUD_REFL;
  const c = (h: number) => new THREE.Color(h);
  const w = pal.water;
  const uniforms: Record<string, THREE.IUniform> = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
    tRefl: { value: refl.tex },
    tSdf: { value: sdf.tex },
    uSdfBox: { value: sdf.box },
    uMirror: { value: refl.matrix },
    uTime: shared.uTime,
    uTexel: { value: texel },
    uDeep: { value: c(w.deep) },
    uBase: { value: c(w.base) },
    uCloud: { value: c(w.cloud) },
    uCloud2: { value: c(w.cloud2) },
    uShallow: { value: c(w.shallow) },
    uFoam: { value: c(w.foam) },
    uRefl: { value: c(w.refl) },
    uFish: { value: c(w.fish) },
    uCloudBig: { value: c(w.cloudBig ?? 0xa3b4cb) },
    uCloudBig2: { value: c(w.cloudBig2 ?? 0x9a9cc8) },
    uCloudRefl: {
      value: [0, 1, 2].map((i) => new THREE.Vector4(...(cloudRefl[i] ?? [0, 0, 0, 0]))),
    },
    uIce: { value: pal.ice ? 1 : 0 },
    uRain: { value: opts.rain ? 1 : 0 },
    uLeaves: { value: pal.leaves ? 1 : 0 },
    uReflOn: { value: 1 },
    uReflK: { value: 0.3 },
    uCloudsOn: { value: 1 },
    uFoamOn: { value: 1 },
    uIceRamp: { value: [c(0x86acdc), c(0x9bc1e5), c(0xdee8f3)] },
    uOpen: { value: new THREE.Vector4(...OPEN_WATER) },
    uFishes: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, lights: true });
  const nm = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    lights: true,
    defines: { NORMAL_PASS: '' },
  });
  mat.userData.normalMat = nm;
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;

  // 鱼：绕几个点慢慢游（画面用，不决定任何数值）
  const fish = [
    { cx: 0.0, cz: 2.0, rx: 2.5, rz: 1.2, sp: 0.18, ph: 0, s: 0.8 },
    { cx: 9.5, cz: 4.0, rx: 1.8, rz: 1.6, sp: -0.14, ph: 2, s: 0.75 },
    { cx: -4.5, cz: 7.0, rx: 1.5, rz: 0.8, sp: 0.2, ph: 4, s: 0.7 },
    { cx: 4.0, cz: 9.5, rx: 2.0, rz: 0.6, sp: 0.12, ph: 1, s: 0.7 },
  ];
  return {
    mesh,
    uniforms,
    update(t) {
      fish.forEach((f, i) => {
        const a = f.ph + t * f.sp;
        const x = f.cx + Math.cos(a) * f.rx;
        const z = f.cz + Math.sin(a) * f.rz;
        const dx = -Math.sin(a) * f.rx * Math.sign(f.sp);
        const dz = Math.cos(a) * f.rz * Math.sign(f.sp);
        (uniforms.uFishes.value as THREE.Vector4[])[i].set(x, z, Math.atan2(dz, dx), f.s);
      });
    },
  };
}
