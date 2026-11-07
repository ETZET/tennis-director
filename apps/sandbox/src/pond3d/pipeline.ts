// 3D 像素画管线（从 desert3d/pipeline.ts 分出来，按池塘参考图改）：
// 1. 正交相机对齐纹素网格；
// 2. 颜色 pass（低分辨率）→ 反射 pass（水面镜像相机，同样低分辨率，水面采样）→ 法线 + 深度 pass；
// 3. 合成：一像素描边按**方向**区分：物体上沿（远处的邻居在屏幕上方）提亮，其余轮廓压暗并偏靛；
//    法线凸边按材质的 edge 强度提亮；
// 4. 屏幕空间的天气（雪花、雨丝）也在合成里按纹素画，最后最近邻放大。
// 所有颜色按 sRGB 原值处理（ColorManagement 关掉），调色板是多少输出就是多少。
import * as THREE from 'three';
import { normalMatOf } from './ramp';

export interface CameraRig {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  metersPerTexel: number;
}

export interface EdgeParams {
  depthLo: number;
  depthHi: number;
  /** 下沿/侧边轮廓压暗（0..1） */
  dark: number;
  /** 上沿轮廓提亮（0..1） */
  top: number;
  /** 法线凸边提亮（0..1） */
  convex: number;
  /** 1：所有轮廓都压暗（desert3d 的做法），0：按方向 */
  uniformDark: number;
}

export interface Grade {
  /** 饱和度倍数 */
  sat: number;
  /** 色阶量化（每通道几档，0 = 不量化） */
  posterize: number;
  /** 天气：0 无、1 雨、2 雪 */
  weather: number;
  /** 整体色调（乘） */
  tint: THREE.Color;
}

const FINAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uLow;
uniform vec2 uCanvas;
uniform float uTexelPx;
uniform vec2 uOffset;
uniform float uDepthRange;
uniform float uDepthLo;
uniform float uDepthHi;
uniform float uDark;
uniform float uTop;
uniform float uConvex;
uniform float uUniformDark;
uniform float uShowEdges;
uniform float uSat;
uniform float uPost;
uniform float uWeather;
uniform float uTime;
uniform vec3 uTint;
uniform vec2 uCamTexel; // 相机在纹素网格上的位置（天气跟着世界走，不粘屏幕）
varying vec2 vUv;

vec2 T;
float depthAt(vec2 o) { return texture2D(tDepth, (T + o) / uLow).r * uDepthRange; }
vec4 normalAt(vec2 o) { vec4 n = texture2D(tNormal, (T + o) / uLow); return vec4(n.rgb * 2.0 - 1.0, n.a); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

float convex1(float d, vec3 n, vec2 o) {
  float dd = depthAt(o) - d;
  vec3 nn = normalAt(o).rgb;
  float nDiff = dot(n - nn, vec3(1.0, 1.0, 1.0));
  float nInd = clamp(smoothstep(-0.01, 0.01, nDiff), 0.0, 1.0);
  float dInd = clamp(sign(dd * 0.25 + 0.01), 0.0, 1.0);
  return (1.0 - dot(n, nn)) * dInd * nInd;
}

void main() {
  vec2 frag = vUv * uCanvas;
  vec2 coord = uLow * 0.5 + (frag - uCanvas * 0.5) / uTexelPx + uOffset;
  T = floor(coord) + 0.5;
  vec3 c = texture2D(tColor, T / uLow).rgb;
  float d = depthAt(vec2(0.0));
  vec4 na = normalAt(vec2(0.0));
  vec3 n = na.rgb;
  float edgeK = na.a;
  float bg = d < uDepthRange * 0.999 ? 1.0 : 0.0;

  // 深度轮廓：哪几个邻居更远
  float up = depthAt(vec2(0.0, 1.0)) - d;
  float dn = depthAt(vec2(0.0, -1.0)) - d;
  float lf = depthAt(vec2(-1.0, 0.0)) - d;
  float rt = depthAt(vec2(1.0, 0.0)) - d;
  float side = max(max(dn, lf), rt);
  float eTop = smoothstep(uDepthLo, uDepthHi, up);
  float eOther = smoothstep(uDepthLo, uDepthHi, side);
  float de = bg * max(eTop, eOther) * step(0.01, edgeK);
  // 上沿提亮只给"东西"（edge 强度高的材质），地面的远边照样压暗
  bool isTop = eTop > 0.5 && smoothstep(uDepthLo, uDepthHi, dn) < 0.5 && uUniformDark < 0.5 && edgeK > 0.2;

  float ne = 0.0;
  ne += convex1(d, n, vec2(1.0, 0.0));
  ne += convex1(d, n, vec2(-1.0, 0.0));
  ne += convex1(d, n, vec2(0.0, 1.0));
  ne += convex1(d, n, vec2(0.0, -1.0));
  ne = bg * step(0.12, ne) * edgeK;

  vec3 col = c;
  if (de > 0.5) {
    if (isTop) col = mix(c, vec3(1.0), uTop * 0.6) + uTop * 0.08;
    else col = mix(c, c * vec3(0.5, 0.55, 0.78), uDark);
  } else if (ne > 0.0) {
    col = mix(c, vec3(1.0), clamp(uConvex * min(ne, 1.5) * 0.5, 0.0, 0.9));
  }

  // 天气（按纹素，世界锚定）
  vec2 W = T + uCamTexel;
  if (uWeather > 1.5) {
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float sp = 18.0 + fk * 10.0;
      vec2 p = W + vec2(sin(uTime * 0.7 + fk) * 6.0 + uTime * 4.0, uTime * sp);
      vec2 cell = floor(p / (9.0 - fk * 2.0));
      vec2 inC = mod(p, 9.0 - fk * 2.0);
      float h = hash12(cell + fk * 31.0);
      vec2 at = floor(vec2(hash12(cell + 5.0), hash12(cell + 9.0)) * (8.0 - fk * 2.0));
      if (h < 0.08 && all(equal(floor(inC), at))) col = mix(col, vec3(0.97, 0.97, 1.0), 0.9);
    }
  } else if (uWeather > 0.5) {
    float x = floor(W.x + (W.y + uTime * 160.0) * 0.18);
    float hc = hash12(vec2(x, 7.0));
    float y = (W.y + uTime * 160.0 + hc * 400.0) / 60.0;
    if (hc < 0.12 && fract(y) < 0.13) col = mix(col, vec3(0.86, 0.9, 1.0), 0.45);
  }

  col *= uTint;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  if (uPost > 0.5) {
    // 有序抖动 + 量化
    vec2 b = mod(T, 2.0);
    float th = (b.x + b.y * 2.0 == 0.0 ? 0.0 : b.x + b.y * 2.0 == 1.0 ? 2.0 : b.x + b.y * 2.0 == 2.0 ? 3.0 : 1.0) / 4.0 - 0.375;
    col = floor(col * uPost + 0.5 + th * 0.9) / uPost;
  }
  if (uShowEdges > 0.5) col = vec3(eOther * (1.0 - float(isTop)), ne, float(isTop));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export interface ReflectOpts {
  /** 水面高度 */
  y: number;
  /** 反射 pass 里藏起来的对象（水面自己） */
  hide: THREE.Object3D[];
  /** 低于水面的片元丢掉 */
  clip: { value: number };
}

export class PixelPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.OrthographicCamera;
  readonly mirror = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 160);
  /** 反射 pass 只渲这一层（挨着水的东西） */
  reflectLayer = 2;
  /** 世界 → 反射贴图 uv（水面材质用） */
  readonly mirrorMatrix = new THREE.Matrix4();
  readonly rig: CameraRig;
  readonly edges: EdgeParams;
  readonly grade: Grade;
  px: number;
  reflect: ReflectOpts | null = null;
  readonly reflTarget: THREE.WebGLRenderTarget;
  private color: THREE.WebGLRenderTarget;
  private normal: THREE.WebGLRenderTarget;
  private final: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private low = new THREE.Vector2(1, 1);
  private fxLayer: number;
  private swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  private fallbackNormal = new THREE.MeshNormalMaterial();
  private camTexel = new THREE.Vector2();
  time = 0;

  constructor(
    canvas: HTMLCanvasElement,
    opts: {
      px: number;
      fxLayer: number;
      rig: CameraRig;
      edges: EdgeParams;
      grade: Grade;
      shadowType: THREE.ShadowMapType;
    },
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = opts.shadowType;
    this.px = opts.px;
    this.fxLayer = opts.fxLayer;
    this.rig = opts.rig;
    this.edges = opts.edges;
    this.grade = opts.grade;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 160);
    this.camera.layers.enable(opts.fxLayer);

    const rt = (depthTex: boolean) => {
      const t = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        generateMipmaps: false,
      });
      if (depthTex) {
        t.depthTexture = new THREE.DepthTexture(1, 1);
        t.depthTexture.type = THREE.FloatType;
      }
      return t;
    };
    this.color = rt(false);
    this.normal = rt(true);
    this.reflTarget = rt(false);

    this.final = new THREE.ShaderMaterial({
      vertexShader: FINAL_VERT,
      fragmentShader: FINAL_FRAG,
      uniforms: {
        tColor: { value: this.color.texture },
        tNormal: { value: this.normal.texture },
        tDepth: { value: this.normal.depthTexture },
        uLow: { value: this.low },
        uCanvas: { value: new THREE.Vector2(1, 1) },
        uTexelPx: { value: 1 },
        uOffset: { value: new THREE.Vector2() },
        uDepthRange: { value: 1 },
        uDepthLo: { value: 0 },
        uDepthHi: { value: 0 },
        uDark: { value: 0 },
        uTop: { value: 0 },
        uConvex: { value: 0 },
        uUniformDark: { value: 0 },
        uShowEdges: { value: 0 },
        uSat: { value: 1 },
        uPost: { value: 0 },
        uWeather: { value: 0 },
        uTime: { value: 0 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uCamTexel: { value: this.camTexel },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  resize(cssW: number, cssH: number, dpr: number) {
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    this.renderer.setSize(w, h, false);
    const texelPx = this.px * dpr;
    const lw = Math.ceil(w / texelPx) + 2;
    const lh = Math.ceil(h / texelPx) + 2;
    this.low.set(lw, lh);
    this.color.setSize(lw, lh);
    this.normal.setSize(lw, lh);
    this.reflTarget.setSize(lw, lh);
    this.final.uniforms.uCanvas.value.set(w, h);
    this.final.uniforms.uTexelPx.value = texelPx;
  }

  get lowSize(): THREE.Vector2 {
    return this.low;
  }

  private placeCamera(): THREE.Vector2 {
    const { target, yaw, pitch, metersPerTexel: s } = this.rig;
    const cam = this.camera;
    const dist = 80;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    const R = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const U = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const F = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2);
    const p = cam.position;
    const pr = p.dot(R);
    const pu = p.dot(U);
    const pf = p.dot(F);
    const sr = Math.round(pr / s) * s;
    const su = Math.round(pu / s) * s;
    this.camTexel.set(Math.round(pr / s), -Math.round(pu / s));
    cam.position.set(0, 0, 0).addScaledVector(R, sr).addScaledVector(U, su).addScaledVector(F, pf);
    cam.updateMatrixWorld();
    const halfW = (this.low.x * s) / 2;
    const halfH = (this.low.y * s) / 2;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.near = 1;
    cam.far = 160;
    cam.updateProjectionMatrix();
    return new THREE.Vector2((pr - sr) / s, (pu - su) / s);
  }

  /** 镜像相机：位置、看向点、上方向都按水面翻转（同 three Reflector 的做法） */
  private placeMirror(y: number) {
    const cam = this.camera;
    const m = this.mirror;
    const flip = (v: THREE.Vector3) => v.set(v.x, 2 * y - v.y, v.z);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const look = cam.position.clone().addScaledVector(fwd, 80);
    m.position.copy(cam.position);
    flip(m.position);
    flip(look);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    m.up.set(upv.x, -upv.y, upv.z);
    m.lookAt(look);
    m.left = cam.left;
    m.right = cam.right;
    m.top = cam.top;
    m.bottom = cam.bottom;
    m.near = cam.near;
    m.far = cam.far;
    m.updateProjectionMatrix();
    m.updateMatrixWorld();
    this.mirrorMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.mirrorMatrix.multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
  }

  render(scene: THREE.Scene) {
    const r = this.renderer;
    const off = this.placeCamera();
    const cam = this.camera;

    // 反射（先渲，水面在颜色 pass 里采样）
    if (this.reflect) {
      const rf = this.reflect;
      this.placeMirror(rf.y);
      for (const o of rf.hide) o.visible = false;
      rf.clip.value = rf.y - 0.02;
      const bg = scene.background;
      scene.background = null;
      r.setClearColor(0x000000, 0);
      r.setRenderTarget(this.reflTarget);
      r.clear();
      this.mirror.layers.set(this.reflectLayer);
      r.render(scene, this.mirror);
      scene.background = bg;
      rf.clip.value = -1e9;
      for (const o of rf.hide) o.visible = true;
    }

    cam.layers.enable(this.fxLayer);
    r.setRenderTarget(this.color);
    r.render(scene, cam);

    cam.layers.disable(this.fxLayer);
    const bg = scene.background;
    scene.background = null;
    r.setClearColor(0x8080ff, 0);
    this.swapped.length = 0;
    scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = Array.isArray(m.material) ? m.material[0] : m.material;
      this.swapped.push([m, m.material]);
      m.material = normalMatOf(src) ?? this.fallbackNormal;
    });
    const shadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.normal);
    r.render(scene, cam);
    r.shadowMap.autoUpdate = shadow;
    for (const [m, mat] of this.swapped) m.material = mat;
    scene.background = bg;
    r.setClearColor(0x000000, 0);
    cam.layers.enable(this.fxLayer);

    const u = this.final.uniforms;
    u.uOffset.value.copy(off);
    u.uDepthRange.value = cam.far - cam.near;
    u.uDepthLo.value = this.edges.depthLo;
    u.uDepthHi.value = this.edges.depthHi;
    u.uDark.value = this.edges.dark;
    u.uTop.value = this.edges.top;
    u.uConvex.value = this.edges.convex;
    u.uUniformDark.value = this.edges.uniformDark;
    u.uSat.value = this.grade.sat;
    u.uPost.value = this.grade.posterize;
    u.uWeather.value = this.grade.weather;
    u.uTint.value.copy(this.grade.tint);
    u.uTime.value = this.time;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  set showEdges(v: boolean) {
    this.final.uniforms.uShowEdges.value = v ? 1 : 0;
  }
}
