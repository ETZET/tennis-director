// clubdesk：从 clubfront/pipeline.ts 原样复制（2026-11-08，clubfront 又是从 desert3d-v2 复制的）。只在这里改，不要改 clubfront 的那份。
// 3D 像素画管线（t3ssel8r 风格）：
// 1. 正交相机，相机位置对齐到一个纹素的网格（不然平移时像素会"爬"）；对齐误差留给最后一步在屏幕上补回去，平移仍然顺滑。
// 2. 场景渲到很小的颜色目标（每个纹素 = 屏幕上 px 个 CSS 像素）。
// 3. 再渲一遍法线 + 深度（FX 图层不参与），在同样的低分辨率上做一像素宽的边缘检测：
//    深度突变 → 轮廓压暗（物体自己颜色的暗一档）；法线突变且是凸边 → 提亮（边缘高光）。
// 4. 最后一步合成并最近邻放大到画布，带亚纹素偏移。
import * as THREE from 'three';
import { normalMatOf } from './toon';

export interface CameraRig {
  /** 看向的地面点 */
  target: THREE.Vector3;
  /** 绕 y 轴的角度（弧度）、俯角（弧度，从水平面算） */
  yaw: number;
  pitch: number;
  /** 每个纹素多少米（缩放） */
  metersPerTexel: number;
}

export interface EdgeParams {
  /** 深度轮廓阈值（米）；不填就按 mpt·cot(俯角) 的 2.5× / 5× 自动算（平地每纹素的深度差 × 倍数） */
  depthLo?: number;
  depthHi?: number;
  /** 侧边/下沿轮廓压暗（往靛色）0..1 */
  depthStrength: number;
  /** 法线凸边提亮 0..1（再乘材质的 convex） */
  normalStrength: number;
  /** 上沿轮廓提亮 0..1（只给 edge > 0.2 的物件） */
  topStrength: number;
  /** 1：所有轮廓都压暗（旧做法） */
  uniformDark?: number;
  /** 侧边/下沿轮廓压暗时乘的颜色（默认偏靛 0.5, 0.55, 0.78；配色实验 ?pal= 会换） */
  tint?: [number, number, number];
}

/** 轮廓压暗的默认颜色（偏靛） */
const EDGE_TINT: [number, number, number] = [0.5, 0.55, 0.78];

const FINAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uLow;        // 低分辨率目标尺寸（纹素）
uniform vec2 uCanvas;     // 画布尺寸（设备像素）
uniform float uTexelPx;   // 一个纹素多少设备像素
uniform vec2 uOffset;     // 相机对齐误差（纹素）
uniform float uDepthRange;// 相机 far - near（米）
uniform float uDepthLo;
uniform float uDepthHi;
uniform float uDepthStrength;
uniform float uNormalStrength;
uniform float uTopStrength;
uniform float uUniformDark;
uniform vec3 uEdgeTint;
uniform float uShowEdges; // 调试：1 只显示边缘
varying vec2 vUv;

vec2 T;
float depthAt(vec2 o) { return texture2D(tDepth, (T + o) / uLow).r * uDepthRange; }
vec3 normalAt(vec2 o) { return texture2D(tNormal, (T + o) / uLow).rgb * 2.0 - 1.0; }

float normalEdge1(float d, vec3 n, vec2 o) {
  float dd = depthAt(o) - d;
  vec3 nn = normalAt(o);
  float nDiff = dot(n - nn, vec3(1.0, 1.0, 1.0));
  float nInd = clamp(smoothstep(-0.01, 0.01, nDiff), 0.0, 1.0);
  float dInd = clamp(sign(dd * 0.25 + 0.01), 0.0, 1.0);
  return (1.0 - dot(n, nn)) * dInd * nInd;
}

void main() {
  vec2 frag = vUv * uCanvas;
  vec2 coord = uLow * 0.5 + (frag - uCanvas * 0.5) / uTexelPx + uOffset;
  T = floor(coord) + 0.5;
  vec4 c = texture2D(tColor, T / uLow);
  float d = depthAt(vec2(0.0));
  vec4 na = texture2D(tNormal, T / uLow);
  vec3 n = na.rgb * 2.0 - 1.0;
  // alpha 打包：高 4 位 edge，低 4 位 convex
  float a8 = floor(na.a * 255.0 + 0.5);
  float edgeK = floor(a8 / 16.0) / 15.0;
  float convexK = mod(a8, 16.0) / 15.0;
  float fg = d < uDepthRange * 0.999 ? 1.0 : 0.0;

  float up = depthAt(vec2(0.0, 1.0)) - d;
  float dn = depthAt(vec2(0.0, -1.0)) - d;
  float lf = depthAt(vec2(-1.0, 0.0)) - d;
  float rt = depthAt(vec2(1.0, 0.0)) - d;
  float eTop = smoothstep(uDepthLo, uDepthHi, up);
  float eDn = smoothstep(uDepthLo, uDepthHi, dn);
  float eSide = smoothstep(uDepthLo, uDepthHi, max(max(dn, lf), rt));
  float de = fg * max(eTop, eSide) * step(0.03, edgeK);
  // 上沿（上面的邻居更远、下面的不更远）：物件提亮；其余轮廓压暗偏靛
  bool isTop = eTop > 0.5 && eDn < 0.5 && uUniformDark < 0.5 && edgeK > 0.2;

  float ne = 0.0;
  ne += normalEdge1(d, n, vec2(1.0, 0.0));
  ne += normalEdge1(d, n, vec2(-1.0, 0.0));
  ne += normalEdge1(d, n, vec2(0.0, 1.0));
  ne += normalEdge1(d, n, vec2(0.0, -1.0));
  ne = fg * step(0.12, ne) * convexK;

  vec3 col = c.rgb;
  if (de > 0.5) {
    if (isTop) col = mix(c.rgb, vec3(1.0), uTopStrength * 0.6 * edgeK) + uTopStrength * 0.08 * edgeK;
    else col = mix(c.rgb, c.rgb * uEdgeTint, uDepthStrength * (0.4 + 0.6 * edgeK));
  } else if (ne > 0.0) {
    col = mix(c.rgb, vec3(1.0), clamp(uNormalStrength * ne * 0.6, 0.0, 0.9));
  }
  if (uShowEdges > 0.5) col = vec3(isTop ? 0.0 : de, ne, isTop ? 1.0 : 0.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}
`;

export class PixelPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.OrthographicCamera;
  readonly rig: CameraRig;
  readonly edges: EdgeParams;
  /** 一个纹素占多少 CSS 像素 */
  px: number;
  private color: THREE.WebGLRenderTarget;
  private normal: THREE.WebGLRenderTarget;
  private final: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private low = new THREE.Vector2(1, 1);
  private fxLayer: number;
  private swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  private fallbackNormal = new THREE.MeshNormalMaterial();

  constructor(canvas: HTMLCanvasElement, opts: { px: number; fxLayer: number; rig: CameraRig; edges: EdgeParams }) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    // PCF：材质里再取阈值（圆滑的块状影子 + 竖向笔触毛边），不用 Basic 的锯齿
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // 颜色管理关掉（main 最先 import ./colors），调色板原值输出
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.px = opts.px;
    this.fxLayer = opts.fxLayer;
    this.rig = opts.rig;
    this.edges = opts.edges;
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
        uDepthStrength: { value: 0 },
        uNormalStrength: { value: 0 },
        uTopStrength: { value: 0 },
        uUniformDark: { value: 0 },
        uEdgeTint: { value: new THREE.Vector3(0.5, 0.55, 0.78) },
        uShowEdges: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  /** 画布 CSS 尺寸 + dpr；低分辨率目标多留一圈纹素，给亚纹素偏移用 */
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
    this.final.uniforms.uCanvas.value.set(w, h);
    this.final.uniforms.uTexelPx.value = texelPx;
  }

  get lowSize(): THREE.Vector2 {
    return this.low;
  }

  /** 按 rig 摆相机并对齐纹素网格，返回对齐误差（纹素） */
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
    // 对齐误差：真实相机在对齐后位置的右/上方多少纹素；屏幕采样时往同方向偏
    return new THREE.Vector2((pr - sr) / s, (pu - su) / s);
  }

  render(scene: THREE.Scene) {
    const r = this.renderer;
    const off = this.placeCamera();
    const cam = this.camera;

    // 颜色
    cam.layers.enable(this.fxLayer);
    r.setRenderTarget(this.color);
    r.render(scene, cam);

    // 法线 + 深度（不含 FX 图层；每个网格换成自己的法线材质，风摆一致）
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

    // 合成放大
    const u = this.final.uniforms;
    u.uOffset.value.copy(off);
    u.uDepthRange.value = cam.far - cam.near;
    // 平地上每纹素的深度差 = mpt·cot(俯角)；阈值取它的 2.5× / 5×，缩放时跟着变
    const flat = this.rig.metersPerTexel / Math.tan(Math.max(0.2, this.rig.pitch));
    u.uDepthLo.value = this.edges.depthLo ?? flat * 2.5;
    u.uDepthHi.value = this.edges.depthHi ?? flat * 5;
    u.uDepthStrength.value = this.edges.depthStrength;
    u.uNormalStrength.value = this.edges.normalStrength;
    u.uTopStrength.value = this.edges.topStrength;
    u.uUniformDark.value = this.edges.uniformDark ?? 0;
    u.uEdgeTint.value.set(...(this.edges.tint ?? EDGE_TINT));
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  set showEdges(v: boolean) {
    this.final.uniforms.uShowEdges.value = v ? 1 : 0;
  }

  /** 屏幕 CSS 坐标 → 地面（y = groundY）上的世界坐标 */
  pickGround(cssX: number, cssY: number, cssW: number, cssH: number, groundY = 0): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((cssX / cssW) * 2 - 1, -(cssY / cssH) * 2 + 1);
    // 画布只显示低分辨率目标中间那块（四周各多一纹素），按比例缩回
    const innerW = cssW / this.px / this.low.x;
    const innerH = cssH / this.px / this.low.y;
    ndc.x *= innerW;
    ndc.y *= innerH;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  }
}
