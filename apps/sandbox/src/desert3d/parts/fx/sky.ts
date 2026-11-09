// 天空：浮空岛的背景。一张全屏渐变（低分辨率里画，抖动分档 → 像素画的色带）、淡淡的太阳盘、
// 随风飘的尘雾带；岛下面和四周飘着胖胖的低多边形云；一只鹰在头顶盘旋，两只乌鸦飞来飞去。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../../toon';
import type { World } from '../../world';
import type { Wind } from './wind';

const SKY_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const SKY_FRAG = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uSun;      // 太阳在屏幕上的位置（0..1）
uniform float uSunVis;
uniform float uPan;     // 相机上下平移带来的一点视差
uniform float uTime;
uniform vec2 uDrift;    // 尘雾带的漂移（纹素）
uniform float uGust;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uLow;
uniform vec3 uBottom;
uniform vec3 uSunCol;
uniform vec3 uDust;
uniform float uDay;     // 1 白天，0 黄昏/夜
uniform vec3 uTopN;
uniform vec3 uMidN;
uniform vec3 uLowN;
uniform vec3 uBottomN;

vec3 grad(float q, vec3 top, vec3 mid, vec3 low, vec3 bottom) {
  if (q > 0.62) return mix(mid, top, smoothstep(0.62, 1.05, q));
  if (q > 0.3) return mix(low, mid, smoothstep(0.3, 0.62, q));
  return mix(bottom, low, smoothstep(-0.1, 0.3, q));
}

float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 4x4 Bayer
  float b = 0.0;
  if (i == 0.0) b = 0.0; else if (i == 1.0) b = 8.0; else if (i == 2.0) b = 2.0; else if (i == 3.0) b = 10.0;
  else if (i == 4.0) b = 12.0; else if (i == 5.0) b = 4.0; else if (i == 6.0) b = 14.0; else if (i == 7.0) b = 6.0;
  else if (i == 8.0) b = 3.0; else if (i == 9.0) b = 11.0; else if (i == 10.0) b = 1.0; else if (i == 11.0) b = 9.0;
  else if (i == 12.0) b = 15.0; else if (i == 13.0) b = 7.0; else if (i == 14.0) b = 13.0; else b = 5.0;
  return (b + 0.5) / 16.0;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 px = floor(gl_FragCoord.xy);
  float d = bayer4(px);
  float v = clamp(gl_FragCoord.y / uRes.y + uPan, -0.5, 1.5);
  // 渐变参数分档 + 抖动
  float bands = 14.0;
  float q = floor(v * bands + d) / bands;
  vec3 col = mix(grad(q, uTopN, uMidN, uLowN, uBottomN), grad(q, uTop, uMid, uLow, uBottom), uDay);

  // 尘雾带：横向拉长的噪声，随风漂，阵风时更浓
  vec2 np = (px + uDrift) * vec2(0.012, 0.05);
  float n = vnoise(np) * 0.65 + vnoise(np * 2.3 + 7.0) * 0.35;
  float haze = smoothstep(0.45, 0.85, n) * (0.25 + 0.5 * uGust) * (1.0 - smoothstep(0.55, 1.0, v));
  haze = floor(haze * 4.0 + d) / 4.0;
  col = mix(col, uDust * (0.4 + 0.6 * uDay), haze * 0.5);

  // 太阳：实心盘 + 两圈抖动光晕
  vec2 sp = (px - uSun * uRes);
  float r = length(sp);
  float rad = 7.0;
  float glow = 1.0 - smoothstep(rad, rad * 6.0, r);
  glow = floor(glow * 3.0 + d * 0.999) / 3.0;
  col = mix(col, uSunCol, glow * 0.35 * uSunVis);
  if (r < rad) col = mix(col, vec3(1.0, 0.98, 0.92), uSunVis);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const lin = (h: number) => new THREE.Color(h);
const SPAN_X = 45;
const SPAN_Z = 50;

/** 一朵云：几团压扁的低多边形球合在一起 */
function cloudGeometry(rnd: () => number, size: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const r = size * (0.25 + rnd() * 0.3) * (i === 0 ? 1.5 : 1);
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.deleteAttribute('uv');
    // 每团球面法线（从团心往外）→ 干净的亮顶、中腰、暗底；底面压平
    blobNormals(g, new THREE.Vector3(0, 0, 0));
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) p.setY(k, Math.max(p.getY(k), -r * 0.15) * 0.8);
    g.translate((rnd() - 0.5) * size * 1.6, rnd() * size * 0.25, (rnd() - 0.5) * size * 0.9);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

interface Cloud {
  mesh: THREE.Mesh;
  speed: number;
}

interface Bird {
  g: THREE.Group;
  wl: THREE.Object3D;
  wr: THREE.Object3D;
  /** 盘旋：中心、半径、高度、角速度、相位 */
  cx: number;
  cz: number;
  rad: number;
  y: number;
  om: number;
  ph: number;
  flap: number;
  soar: boolean;
}

function makeBird(
  w: World,
  color: number,
  span: number,
  body: number,
): { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D } {
  const g = new THREE.Group();
  const mat = w.mats.toon(color);
  const b = new THREE.Mesh(new THREE.BoxGeometry(body * 0.45, body * 0.35, body), mat);
  g.add(b);
  const head = new THREE.Mesh(new THREE.BoxGeometry(body * 0.32, body * 0.3, body * 0.3), mat);
  head.position.set(0, body * 0.08, body * 0.6);
  g.add(head);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(body * 0.5, body * 0.08, body * 0.35), mat);
  tail.position.set(0, 0, -body * 0.62);
  g.add(tail);
  const wingGeo = new THREE.BoxGeometry(span / 2, body * 0.1, body * 0.55);
  wingGeo.translate(span / 4, 0, 0);
  const wl = new THREE.Group();
  const wr = new THREE.Group();
  wl.add(new THREE.Mesh(wingGeo, mat));
  const mr = new THREE.Mesh(wingGeo, mat);
  mr.scale.x = -1;
  wr.add(mr);
  wl.position.x = body * 0.2;
  wr.position.x = -body * 0.2;
  g.add(wl, wr);
  return { g, wl, wr };
}

export class Sky {
  readonly root = new THREE.Group();
  private skyMat: THREE.ShaderMaterial;
  private clouds: Cloud[] = [];
  private birds: Bird[] = [];
  private R = new THREE.Vector3();
  private U = new THREE.Vector3();
  private sunDir = new THREE.Vector3();
  private drift = new THREE.Vector2();

  constructor(
    private w: World,
    private wind: Wind,
  ) {
    const r = w.rng('fx:sky');
    w.scene.background = null;
    // 云影：淡一点、大块（?clouds= 覆盖）
    if (!w.params.has('clouds')) w.uniforms.uCloudStrength.value = 0.22;

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uRes: { value: new THREE.Vector2(200, 200) },
        uSun: { value: new THREE.Vector2(0.8, 0.8) },
        uSunVis: { value: 1 },
        uPan: { value: 0 },
        uTime: w.uniforms.uTime,
        uDrift: { value: this.drift },
        uGust: w.uniforms.uGust,
        uTop: { value: lin(0x9cbcd2) },
        uMid: { value: lin(0xd8d4c0) },
        uLow: { value: lin(0xf0d4a4) },
        uBottom: { value: lin(0xdcb07c) },
        uSunCol: { value: lin(0xfff0c8) },
        uDust: { value: lin(0xe6c08a) },
        uDay: { value: 1 },
        uTopN: { value: lin(0x3a4468) },
        uMidN: { value: lin(0x8a6a78) },
        uLowN: { value: lin(0xd89068) },
        uBottomN: { value: lin(0x7a5050) },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMat);
    quad.frustumCulled = false;
    quad.renderOrder = -1e6;
    quad.layers.set(w.layers.FX);
    quad.onBeforeRender = (renderer, _s, camera) => this.placeSky(renderer, camera);
    this.root.add(quad);

    // 云：岛下面一圈，后面高处几朵
    const cloudMat = w.mats.toon(0xffffff, {
      ramp: [0xfff8ee, 0xe8dee0, 0xb8aecc],
      lightUp: 0.55,
      bands: [0.05, 0.45],
      noShadowReceive: true,
    });
    const nClouds = 16;
    for (let i = 0; i < nClouds; i++) {
      const back = i < 6; // 岛后面一条带（屏幕上岛的上方）
      const size = back ? 3 + r() * 2.5 : 2.2 + r() * 3.2;
      const mesh = new THREE.Mesh(cloudGeometry(r, size), cloudMat);
      const x = (r() * 2 - 1) * SPAN_X;
      const z = back ? -30 - r() * 10 : (r() * 2 - 1) * SPAN_Z;
      mesh.position.set(x, back ? -9 + r() * 6 : -11 - r() * 13, z);
      mesh.rotation.y = r() * 6.28;
      mesh.userData.back = back;
      mesh.layers.set(w.layers.FX);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.root.add(mesh);
      this.clouds.push({ mesh, speed: 0.5 + r() * 0.6 });
    }

    // 鹰（盘旋、滑翔）和两只乌鸦
    const hawk = makeBird(w, 0x6a4a32, 1.7, 0.55);
    this.birds.push({
      ...hawk,
      cx: (r() - 0.5) * 8,
      cz: (r() - 0.5) * 10,
      rad: 11 + r() * 4,
      y: 13,
      om: 0.18,
      ph: r() * 6.28,
      flap: 0,
      soar: true,
    });
    for (let i = 0; i < 2; i++) {
      const raven = makeBird(w, 0x2a2630, 0.95, 0.38);
      this.birds.push({
        ...raven,
        cx: (r() - 0.5) * 16,
        cz: (r() - 0.5) * 24,
        rad: 16 + r() * 6,
        y: 6.5 + i * 0.8,
        om: -(0.3 + r() * 0.08),
        ph: r() * 6.28 + i * 0.25,
        flap: r() * 6,
        soar: false,
      });
    }
    for (const b of this.birds) {
      w.mats.prepare(b.g, { cast: true, receive: false });
      this.root.add(b.g);
    }
  }

  private placeSky(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    const rt = renderer.getRenderTarget();
    const u = this.skyMat.uniforms;
    (u.uRes.value as THREE.Vector2).set(
      rt ? rt.width : renderer.domElement.width,
      rt ? rt.height : renderer.domElement.height,
    );
    this.R.setFromMatrixColumn(camera.matrixWorld, 0);
    this.U.setFromMatrixColumn(camera.matrixWorld, 1);
    this.sunDir.copy(this.w.sun.position).normalize();
    const sx = this.sunDir.dot(this.R);
    const sy = this.sunDir.dot(this.U);
    const l = Math.max(1, Math.hypot(sx, sy) * 1.1);
    (u.uSun.value as THREE.Vector2).set(0.5 + (0.42 * sx) / l, Math.min(0.92, 0.55 + (0.4 * sy) / l));
    u.uSunVis.value = THREE.MathUtils.smoothstep(this.sunDir.y, 0.0, 0.12);
    u.uDay.value = THREE.MathUtils.smoothstep(this.sunDir.y, 0.05, 0.45);
    (u.uSunCol.value as THREE.Color).copy(this.w.sun.color);
    // 相机往上平移时天空跟着挪一点点
    const cam = camera as THREE.OrthographicCamera;
    const tgtUp = cam.position.dot(this.U);
    u.uPan.value = tgtUp * 0.004;
  }

  update(dt: number, t: number) {
    const d = this.wind.dir;
    const gust = this.wind.gust;
    this.drift.x -= d.x * dt * (3 + 10 * gust);
    this.drift.y += d.y * dt * 0.5;

    // 云顺风漂，出了范围从另一边回来
    for (const c of this.clouds) {
      const p = c.mesh.position;
      const v = (0.6 + 1.2 * this.wind.base) * c.speed;
      p.x += d.x * v * dt;
      p.z += d.y * v * dt;
      if (p.x > SPAN_X) p.x -= 2 * SPAN_X;
      if (p.x < -SPAN_X) p.x += 2 * SPAN_X;
      if (c.mesh.userData.back) {
        if (p.z > -30) p.z -= 10;
        if (p.z < -40) p.z += 10;
      } else {
        if (p.z > SPAN_Z) p.z -= 2 * SPAN_Z;
        if (p.z < -SPAN_Z) p.z += 2 * SPAN_Z;
      }
    }

    // 云影跟着风走
    const u = this.w.uniforms;
    u.uCloudVel.value.set(d.x, d.y).multiplyScalar(0.9 + 2.2 * this.wind.base);
    u.uCloudScale.value = 1 / 60;

    for (const b of this.birds) {
      b.ph += b.om * dt;
      const wob = Math.sin(t * 0.07 + b.cx) * 3;
      const x = b.cx + Math.cos(b.ph) * (b.rad + wob);
      const z = b.cz + Math.sin(b.ph) * (b.rad + wob) * 1.25;
      const y = b.y + Math.sin(t * 0.3 + b.ph) * 0.6;
      // 朝向：沿切线
      const tx = -Math.sin(b.ph) * Math.sign(b.om);
      const tz = Math.cos(b.ph) * 1.25 * Math.sign(b.om);
      b.g.position.set(x, y, z);
      b.g.rotation.set(0, Math.atan2(tx, tz), 0);
      b.g.rotateZ(-0.35 * Math.sign(b.om)); // 转弯时侧倾
      if (b.soar) {
        // 鹰：大多滑翔，偶尔扇几下
        const flapping = Math.sin(t * 0.4 + b.cz) > 0.75;
        b.flap += dt * (flapping ? 9 : 0);
        const a = flapping ? Math.sin(b.flap) * 0.5 : 0.12 + Math.sin(t * 1.3) * 0.04 * gust;
        b.wl.rotation.z = a;
        b.wr.rotation.z = -a;
      } else {
        b.flap += dt * 13;
        const a = Math.sin(b.flap) * 0.7;
        b.wl.rotation.z = a;
        b.wr.rotation.z = -a;
      }
    }
  }

  get drawCalls() {
    return 1 + this.clouds.length + this.birds.length * 5;
  }
}
