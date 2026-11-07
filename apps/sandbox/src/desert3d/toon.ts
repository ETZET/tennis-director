// 色阶材质（池塘研究的配方，docs/lab/2026-11-07-3d-pixel/lessons.md）：
// 还是 MeshToonMaterial（贴图、顶点色、实例色、蒙皮、alphaMap、透明都照旧能用，部件的 onBeforeCompile 也照旧能接），
// 只是把最后的光照整段换掉：
// - 光照只算一个数 l = dot(N, 太阳) + 噪声 → 三档：亮 / 中 / 暗；投影（PCF 取阈值，阈值按竖向笔触抖）和云影各压一档；
// - 三档颜色：给了 ramp 就用手挑的三色；没给就从本色自动推：中、暗两档色相往靛蓝转（暖色经品红、绿色经青），变暗、略降饱和；
// - 不用环境光/半球光（它们把暗档拉灰）；颜色管理关掉，调色板原值输出；
// - 法线 pass 的孪生材质把描边强度（edge、convex）写进 alpha；
// - 风摆：顶点里按高度平方偏移，法线 pass 和投影深度材质同步摆。
import * as THREE from 'three';
import type { SharedUniforms } from './world';

export interface ToonOpts {
  /** 风摆幅度（米，风强 1、阵风 0.5 时顶端的偏移）；0 或不填就不摆 */
  sway?: number;
  /** 摆动的参考高度（本地坐标 y）：y = swayH 处达到 sway，往下按平方衰减 */
  swayH?: number;
  vertexColors?: boolean;
  map?: THREE.Texture;
  alphaMap?: THREE.Texture;
  alphaTest?: number;
  side?: THREE.Side;
  /** 自发光（灯泡、余烬）：直接加在结果上 */
  emissive?: THREE.ColorRepresentation;
  /**
   * 手挑的三档 [亮, 中, 暗]。给了它，color 参数被忽略（当白色）；贴图/顶点色/实例色仍然乘在上面（当作明暗/细节）。
   * 不给：从本色自动推中、暗两档（冷色相偏移）。
   */
  ramp?: [THREE.ColorRepresentation, THREE.ColorRepresentation, THREE.ColorRepresentation];
  /** 档位阈值 [暗|中, 中|亮]（l = dot(N, 光)），默认 [0.1, 0.5] */
  bands?: [number, number];
  /** 档位交界的噪声幅度（树冠 0.3～0.4 → 竖向"毛"；默认 0） */
  noise?: number;
  /** 描边强度 0..1（深度轮廓压暗；> 0.2 的物件上沿提亮）。默认 0.6；地面、沙地 0.05～0.1 */
  edge?: number;
  /** 法线凸边高光强度 0..1。默认 0.5；石头、木箱 0.8～1，地面 0～0.1 */
  convex?: number;
  /** 明暗用的光往正上方偏多少（0..1，树冠 0.4）；投影仍按真太阳 */
  lightUp?: number;
  /** 球面法线：法线 = normalize(本地位置 - 这个点)（树冠、灌木团、圆石头）。true = 本地原点 */
  sphereNormals?: boolean | [number, number, number];
  /** 不接收投影（很薄的东西、浮在空中的东西） */
  noShadowReceive?: boolean;
}

export interface Mats {
  /** 色阶材质（同色同参数会复用同一个实例） */
  toon(color: THREE.ColorRepresentation, opts?: ToonOpts): THREE.MeshToonMaterial;
  /** 给一棵对象树收尾：投影/受影开关、风摆物体的深度材质。每个部件 build 完调用一次 */
  prepare(root: THREE.Object3D, opts?: { cast?: boolean; receive?: boolean }): void;
  /** 旧接口保留（三档渐变图）；新材质不用它 */
  gradient: THREE.Texture;
  /** 全局开关（A/B 用）：shadowHard 1 投影取阈值，fur 影子毛边幅度，noiseK 档位噪声倍数，lightModel 0 色阶 / 1 等比变暗 */
  globals: {
    uFur: { value: number };
    uShadowHard: { value: number };
    uNoiseK: { value: number };
    uLightModel: { value: number };
  };
}

/** 描边的法线 pass 用：取 mesh 对应的法线材质 */
export function normalMatOf(m: THREE.Material | undefined): THREE.Material | undefined {
  return m?.userData.normalMat as THREE.Material | undefined;
}

/** 几何体工具：把法线改成从 center（默认包围球心）指向顶点 —— 合并好的一团团树冠请对每一团单独调用，再合并 */
export function blobNormals(g: THREE.BufferGeometry, center?: THREE.Vector3): THREE.BufferGeometry {
  if (!center) {
    g.computeBoundingSphere();
    center = g.boundingSphere!.center;
  }
  const p = g.getAttribute('position');
  let n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!n) {
    n = new THREE.BufferAttribute(new Float32Array(p.count * 3), 3);
    g.setAttribute('normal', n);
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(center).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  return g;
}

/** 描边强度打包进法线 RT 的 alpha：高 4 位 edge，低 4 位 convex */
export function packEdge(edge: number, convex: number): number {
  const e = Math.round(THREE.MathUtils.clamp(edge, 0, 1) * 15);
  const c = Math.round(THREE.MathUtils.clamp(convex, 0, 1) * 15);
  return (e * 16 + c) / 255;
}

const SWAY_VERT_DECL = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
uniform float uGust;
uniform float uSway;
uniform float uSwayH;
uniform vec3 uSphereC;
uniform float uSphere;
varying vec2 vCloudXZ;
varying vec3 vWorldP;
`;

const SPHERE_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
if (uSphere > 0.5) objectNormal = normalize(position - uSphereC);
`;

const SWAY_VERT = /* glsl */ `
#include <begin_vertex>
{
  mat4 mI = modelMatrix;
  #ifdef USE_INSTANCING
    mI = modelMatrix * instanceMatrix;
  #endif
  if (uSway > 0.0) {
    vec3 base = (mI * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float h = max(transformed.y, 0.0) / uSwayH;
    float k = h * h * uSway * (0.6 + 0.8 * uGust);
    float ph = dot(base.xz, vec2(0.37, 0.23));
    float wv = 0.75 + 0.5 * sin(uTime * 2.3 + ph) + 0.25 * sin(uTime * 3.7 + ph * 1.7);
    vec3 off = vec3(uWind.x, 0.0, uWind.y) * k * wv;
    transformed += inverse(mat3(mI)) * off;
  }
  vWorldP = (mI * vec4(transformed, 1.0)).xyz;
  vCloudXZ = vWorldP.xz;
}
`;

const RAMP_FRAG_DECL = /* glsl */ `
uniform sampler2D uCloudTex;
uniform float uCloudScale;
uniform vec2 uCloudVel;
uniform float uCloudStrength;
uniform float uTime;
uniform vec3 uRampLit;
uniform vec3 uRampMid;
uniform vec3 uRampDark;
uniform float uHasRamp;
uniform vec2 uBands;
uniform float uNoise;
uniform float uLightUp;
uniform float uTexel;
uniform float uFur;
uniform float uShadowHard;
uniform float uNoiseK;
uniform float uLightModel;
uniform float uNoRecv;
varying vec2 vCloudXZ;
varying vec3 vWorldP;
float cloudAtt() {
  float n = texture2D(uCloudTex, (vCloudXZ - uCloudVel * uTime) * uCloudScale).r;
  return 1.0 - uCloudStrength * smoothstep(0.545, 0.565, n);
}
float rhash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rhash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
// 冷色相偏移：色相往靛蓝（0.65）转 k（暖色走品红那边、绿色走青那边，最多转 maxShift），明度 × v，饱和 × s；再往靛色混一点
vec3 coolShade(vec3 c, float k, float v, float s) {
  vec3 h = rgb2hsv(c);
  float d = 0.65 - h.x;
  d -= floor(d + 0.5);
  h.x = fract(h.x + clamp(d * k, -0.06, 0.15));
  h.y = clamp(h.y * s, 0.0, 1.0);
  h.z *= v;
  // 再往一个固定的暗靛紫混一点（暗档 ~25%、中档 ~8%）：沙子的影子成了偏紫的赭色，草成了青绿
  return mix(hsv2rgb(h), vec3(0.3, 0.28, 0.48), 0.55 * k);
}
`;

const RAMP_OUT = /* glsl */ `
{
  // 光：取第一个平行光（太阳），视空间
  vec3 Ls = vec3(0.0, 1.0, 0.0);
  vec3 sunCol = vec3(1.0);
  #if NUM_DIR_LIGHTS > 0
    Ls = directionalLights[0].direction;
    sunCol = directionalLights[0].color;
  #endif
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.35, 0.0)).xyz);
  vec3 Ld = normalize(mix(Ls, upV, uLightUp));
  vec3 Nn = normalize(normal);
  float l = dot(Nn, Ld);
  // 档位交界噪声：竖向笔触（x、z 每纹素，y 每三纹素）
  float nz = rhash13(floor(vWorldP * vec3(1.0, 0.34, 1.0) / uTexel)) - 0.5;
  l += nz * uNoise * uNoiseK;
  float band = l < uBands.x ? 0.0 : (l < uBands.y ? 1.0 : 2.0);
  // 投影：PCF 后取阈值，阈值按竖向笔触抖（影子边缘带"毛"）
  float sh = 1.0;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    if (receiveShadow && uNoRecv < 0.5) {
      DirectionalLightShadow s0 = directionalLightShadows[0];
      float v = getShadow(directionalShadowMap[0], s0.shadowMapSize, 1.0, s0.shadowBias, s0.shadowRadius, vDirectionalShadowCoord[0]);
      float fur = rhash12(vec2(floor(vWorldP.x / uTexel), floor(vWorldP.z / uTexel / 2.0)) + 5.0) - 0.5;
      sh = uShadowHard > 0.5 ? step(0.5 + fur * uFur, v) : v;
    }
  #endif
  if (sh < 0.5) band = 0.0;
  // 云影：亮档往中档混（混多少 = 云影强度；强度 ≥ 0.8 时就是整整压一档）
  float inCloud = (uCloudStrength > 0.0 && cloudAtt() < 1.0 - uCloudStrength * 0.5) ? 1.0 : 0.0;

  vec3 base = diffuseColor.rgb;
  vec3 lit, mid, dark;
  if (uHasRamp > 0.5) {
    lit = uRampLit * base;
    mid = uRampMid * base;
    dark = uRampDark * base;
  } else {
    lit = base;
    mid = coolShade(base, 0.15, 0.84, 0.9);
    dark = coolShade(base, 0.45, 0.6, 0.85);
  }
  if (uLightModel > 0.5) {
    mid = base * 0.78;
    dark = base * 0.55;
  }
  vec3 col = band > 1.5 ? lit : (band > 0.5 ? mid : dark);
  vec3 lower = band > 1.5 ? mid : dark;
  col = mix(col, lower, inCloud * clamp(uCloudStrength * 1.25, 0.0, 1.0));
  // 太阳色（日出日落偏暖、夜里偏暗）：只影响亮档，按最大分量归一
  float sm = max(max(sunCol.r, sunCol.g), max(sunCol.b, 1e-3));
  if (band > 1.5) col *= mix(vec3(1.0), sunCol / sm, 0.35);
  col += totalEmissiveRadiance;
  gl_FragColor = vec4(col, diffuseColor.a);
}
`;

function patchVertex(
  shader: THREE.WebGLProgramParametersWithUniforms,
  u: SharedUniforms,
  sway: number,
  swayH: number,
  sphere: [number, number, number] | null,
) {
  shader.uniforms.uTime = u.uTime;
  shader.uniforms.uWind = u.uWind;
  shader.uniforms.uGust = u.uGust;
  shader.uniforms.uSway = { value: sway };
  shader.uniforms.uSwayH = { value: swayH };
  shader.uniforms.uSphere = { value: sphere ? 1 : 0 };
  shader.uniforms.uSphereC = { value: new THREE.Vector3(...(sphere ?? [0, 0, 0])) };
  let vs = shader.vertexShader.replace('#include <begin_vertex>', SWAY_VERT);
  if (vs.includes('#include <beginnormal_vertex>')) vs = vs.replace('#include <beginnormal_vertex>', SPHERE_NORMAL);
  shader.vertexShader = SWAY_VERT_DECL + vs;
}

function makeGradient(): THREE.DataTexture {
  const levels = [70, 70, 150, 150, 255, 255];
  const data = new Uint8Array(levels.length * 4);
  for (let i = 0; i < levels.length; i++) data.set([levels[i], levels[i], levels[i], 255], i * 4);
  const tex = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createMats(u: SharedUniforms, texelMeters: () => number): Mats {
  const gradient = makeGradient();
  const cache = new Map<string, THREE.MeshToonMaterial>();
  const globals: Mats['globals'] = {
    uFur: { value: 0.8 },
    uShadowHard: { value: 1 },
    uNoiseK: { value: 1 },
    uLightModel: { value: 0 },
  };
  const uTexel = { value: texelMeters() };
  // 缩放会变纹素大小：每帧开头由 main 调 texelMeters 刷新
  Object.defineProperty(uTexel, 'value', { get: texelMeters });

  const toon: Mats['toon'] = (color, opts = {}) => {
    const sway = opts.sway ?? 0;
    const swayH = opts.swayH ?? 1;
    const sphere: [number, number, number] | null =
      opts.sphereNormals === true ? [0, 0, 0] : Array.isArray(opts.sphereNormals) ? opts.sphereNormals : null;
    const ramp = opts.ramp?.map((c) => new THREE.Color(c)) as [THREE.Color, THREE.Color, THREE.Color] | undefined;
    const edge = opts.edge ?? 0.6;
    const convex = opts.convex ?? 0.5;
    const key =
      opts.map || opts.alphaMap
        ? null
        : JSON.stringify([
            new THREE.Color(color).getHex(),
            sway,
            swayH,
            !!opts.vertexColors,
            opts.alphaTest,
            opts.side,
            opts.emissive,
            ramp?.map((c) => c.getHex()),
            opts.bands,
            opts.noise,
            edge,
            convex,
            opts.lightUp,
            sphere,
            opts.noShadowReceive,
          ]);
    if (key && cache.has(key)) return cache.get(key)!;

    // 颜色管理关了：sRGB 贴图不让 GPU 再解码，原值就是调色板
    for (const t of [opts.map, opts.alphaMap]) {
      if (t && t.colorSpace === THREE.SRGBColorSpace) {
        t.colorSpace = THREE.NoColorSpace;
        t.needsUpdate = true;
      }
    }

    const m = new THREE.MeshToonMaterial({
      color: ramp ? 0xffffff : color,
      gradientMap: gradient,
      vertexColors: !!opts.vertexColors,
      map: opts.map ?? null,
      alphaMap: opts.alphaMap ?? null,
      alphaTest: opts.alphaTest ?? 0,
      side: opts.side ?? THREE.FrontSide,
      emissive: opts.emissive ?? 0x000000,
    });
    m.onBeforeCompile = (shader) => {
      patchVertex(shader, u, sway, swayH, sphere);
      Object.assign(shader.uniforms, {
        uCloudTex: u.uCloudTex,
        uCloudScale: u.uCloudScale,
        uCloudVel: u.uCloudVel,
        uCloudStrength: u.uCloudStrength,
        uRampLit: { value: ramp?.[0] ?? new THREE.Color(1, 1, 1) },
        uRampMid: { value: ramp?.[1] ?? new THREE.Color(1, 1, 1) },
        uRampDark: { value: ramp?.[2] ?? new THREE.Color(1, 1, 1) },
        uHasRamp: { value: ramp ? 1 : 0 },
        uBands: { value: new THREE.Vector2(...(opts.bands ?? [0.1, 0.5])) },
        uNoise: { value: opts.noise ?? 0 },
        uLightUp: { value: opts.lightUp ?? 0 },
        uTexel,
        uNoRecv: { value: opts.noShadowReceive ? 1 : 0 },
        ...globals,
      });
      shader.fragmentShader = RAMP_FRAG_DECL + shader.fragmentShader.replace('#include <opaque_fragment>', RAMP_OUT);
    };
    m.customProgramCacheKey = () => 'ramp-v1';

    // 法线 pass：同样的形变；alpha = 描边强度（法线材质不支持 alphaMap：镂空卡片请放 FX 图层）
    const nm = new THREE.MeshNormalMaterial({ side: opts.side ?? THREE.FrontSide });
    nm.opacity = packEdge(edge, convex);
    nm.onBeforeCompile = (shader) => patchVertex(shader, u, sway, swayH, sphere);
    nm.customProgramCacheKey = () => 'normal-ramp';
    m.userData.normalMat = nm;

    if (sway > 0 || opts.alphaMap) {
      const dm = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        alphaMap: opts.alphaMap ?? null,
        alphaTest: opts.alphaTest ?? 0,
        side: opts.side ?? THREE.FrontSide,
      });
      dm.onBeforeCompile = (shader) => patchVertex(shader, u, sway, swayH, null);
      dm.customProgramCacheKey = () => 'depth-sway';
      m.userData.depthMat = dm;
    }
    if (key) cache.set(key, m);
    return m;
  };

  const prepare: Mats['prepare'] = (root, opts = {}) => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = opts.cast ?? true;
      mesh.receiveShadow = opts.receive ?? true;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const dm = mat?.userData.depthMat as THREE.Material | undefined;
      if (dm) mesh.customDepthMaterial = dm;
    });
  };

  return { toon, prepare, gradient, globals };
}

/** 可平铺的值噪声（云影用），r 通道 0..1 */
export function makeNoiseTexture(size: number, rnd: () => number, octaves = 4): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const grids: number[][] = [];
  for (let o = 0; o < octaves; o++) {
    const n = 4 << o;
    grids.push(Array.from({ length: n * n }, () => rnd()));
  }
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let tot = 0;
      for (let o = 0; o < octaves; o++) {
        const n = 4 << o;
        const g = grids[o];
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        const at = (i: number, j: number) => g[(j % n) * n + (i % n)];
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        v += (a + (b - a) * ty) * amp;
        tot += amp;
        amp *= 0.5;
      }
      const c = Math.round((v / tot) * 255);
      data.set([c, c, c, 255], (y * size + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
