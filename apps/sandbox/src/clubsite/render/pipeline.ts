// 渲染核心（clubsite/render）：所有 club* 场景和 desert3d-v2 共用这一份（原来 desert3d-v2、clubfront、clubdesk、clubmap 各有一份；
// clubmap 那份多出来的"相机距离 / 远裁剪面可配"并成了构造参数 dist / far，默认 80 / 160 米 = 原来各小景的值）。
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

/** 天气和夜空（clubsite/daylight 每帧写；全 0 = 没有，和以前一样）。都画在最后合成这一步，按纹素画、跟世界锚定 */
export interface Atmo {
  /** 雨 0..1：1 纹素宽的斜雨丝 + 地上溅起的亮点 */
  rain: number;
  /** 风沙 0..1：整体蒙一层沙色（按低频斑块分 3 档，不是柔边）+ 横飘的沙线 */
  dust: number;
  dustColor: [number, number, number];
  /** 星星 0..1（只画在天空上） */
  stars: number;
  /** 秒（雨落、沙飘、星星闪） */
  time: number;
  /** 风往屏幕右多少（-1..1）：雨丝斜的方向、沙飘的方向 */
  wind: number;
}

/** three 阴影 pass 的翻面规则（WebGLShadowMap 的 shadowSide） */
const SHADOW_SIDE: Record<THREE.Side, THREE.Side> = {
  [THREE.FrontSide]: THREE.BackSide,
  [THREE.BackSide]: THREE.FrontSide,
  [THREE.DoubleSide]: THREE.DoubleSide,
};

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
uniform vec2 uCamT;       // 相机对齐后的位置（纹素，整数）：雨、沙、星星跟世界锚定
uniform float uRain;
uniform float uDust;
uniform vec3 uDustCol;
uniform float uStars;
uniform float uFxTime;
uniform float uWindX;
varying vec2 vUv;

float fh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fvn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y);
}

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
  // ── 天气（纹素对齐、世界锚定） ──
  vec2 g = T - 0.5 - floor(uLow * 0.5) + uCamT;
  if (uStars > 0.0 && fg < 0.5) {
    // 星星：天上稀稀的单纹素亮点，少数两档闪
    float sh = fh(g * 0.731 + 17.0);
    if (sh < 0.006 * uStars) {
      float tw = step(0.3, fract(fh(g + 3.0) + uFxTime * (0.2 + fh(g + 5.0) * 0.5)));
      col = mix(col, vec3(1.0, 0.97, 0.88), (0.55 + 0.45 * tw) * min(1.0, uStars * 1.5));
    }
  }
  if (uDust > 0.0) {
    // 风沙：低频斑块按 3 档蒙沙色（硬边，跟着风飘）；远处（深度大）更浓；横飘的 2～5 纹素沙线
    float n = fvn(vec2(g.x * 0.018 - uFxTime * uWindX * 0.6, g.y * 0.03)) * 0.7 + fvn(g * 0.05 + vec2(-uFxTime * uWindX * 1.4, 7.0)) * 0.3;
    float far = fg > 0.5 ? clamp(d / uDepthRange * 2.2, 0.0, 1.0) : 1.0;
    float lv = floor((n * 0.7 + far * 0.5) * 3.0) / 3.0;
    col = mix(col, uDustCol, uDust * (0.22 + 0.28 * lv));
    float row = g.y;
    float sx = g.x - uFxTime * 60.0 * sign(uWindX + 1e-3) * (0.6 + fh(vec2(row, 1.0)) * 0.8);
    float seg = floor(sx / 23.0);
    float gx = sx - seg * 23.0;
    if (fh(vec2(seg, row)) < 0.05 * uDust && gx < 2.0 + floor(fh(vec2(seg, row + 9.0)) * 4.0)) col = mix(col, uDustCol * 1.15, 0.6);
  }
  if (uRain > 0.0) {
    // 雨：1 纹素宽的雨丝（3～5 纹素长），按风斜（每 3～4 行挪一列），往屏幕下落；每列一串、各自的间隔和相位
    float y = g.y + uFxTime * 110.0;
    float slant = uWindX * 0.3;
    float x = g.x + floor(y * slant);
    float h = fh(vec2(x, 3.0));
    float seg = 18.0 + floor(h * 22.0);
    float yy = y + h * 97.0;
    float si = floor(yy / seg);
    float ph = yy - si * seg;
    float len = 3.0 + floor(fh(vec2(x, si)) * 3.0);
    if (ph < len && fh(vec2(x, si) + 4.0) < 0.3 * uRain) col = mix(col, vec3(0.8, 0.86, 0.98), ph < 1.0 ? 0.3 : 0.45);
    // 地上溅起的亮点：一纹素，每 0.12 秒换一批
    if (fg > 0.5 && fh(g + floor(uFxTime * 8.0) * 13.1) < 0.0015 * uRain) col = mix(col, vec3(0.86, 0.9, 1.0), 0.7);
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
  /** 天气和夜空（clubsite/daylight 写；默认全关） */
  readonly atmo: Atmo = { rain: 0, dust: 0, dustColor: [0.86, 0.68, 0.46], stars: 0, time: 0, wind: 0 };
  /** 相机对齐后的位置（纹素） */
  private camT = new THREE.Vector2();
  private color: THREE.WebGLRenderTarget;
  private normal: THREE.WebGLRenderTarget;
  private final: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private low = new THREE.Vector2(1, 1);
  private fxLayer: number;
  private swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  private fallbackNormal = new THREE.MeshNormalMaterial();
  /** 预编用：和 three 阴影 pass 内部那份一样的深度材质 */
  private plainDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  /** 相机离看向点的距离、远裁剪面（米） */
  private dist: number;
  private far: number;

  constructor(
    canvas: HTMLCanvasElement,
    opts: {
      px: number;
      fxLayer: number;
      rig: CameraRig;
      edges: EdgeParams;
      /** 相机离看向点的距离（米，默认 80）；整座俱乐部的地图要更远（clubmap 220、clubmap2 520） */
      dist?: number;
      /** 远裁剪面（米，默认 160） */
      far?: number;
    },
  ) {
    this.dist = opts.dist ?? 80;
    this.far = opts.far ?? 160;
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
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, this.far);
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
        uCamT: { value: new THREE.Vector2() },
        uRain: { value: 0 },
        uDust: { value: 0 },
        uDustCol: { value: new THREE.Vector3() },
        uStars: { value: 0 },
        uFxTime: { value: 0 },
        uWindX: { value: 0 },
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
    const dist = this.dist;
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
    this.camT.set(Math.round(pr / s), Math.round(pu / s));
    cam.updateMatrixWorld();
    const halfW = (this.low.x * s) / 2;
    const halfH = (this.low.y * s) / 2;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.near = 1;
    cam.far = this.far;
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
    // 颜色 pass 刚把整棵树的世界矩阵算过、中间没人动：法线 pass 不再算一遍（几千个物体，每帧省一次 compose + 乘法）
    const autoWorld = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    r.setRenderTarget(this.normal);
    r.render(scene, cam);
    scene.matrixWorldAutoUpdate = autoWorld;
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
    const a = this.atmo;
    u.uCamT.value.copy(this.camT);
    u.uRain.value = a.rain;
    u.uDust.value = a.dust;
    u.uDustCol.value.set(...a.dustColor);
    u.uStars.value = a.stars;
    u.uFxTime.value = a.time;
    u.uWindX.value = a.wind;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  /**
   * 预编着色器：root（可以是还藏着的一块）里所有网格的颜色材质、法线 pass 材质、投影材质（customDepthMaterial）
   * 先按 scene 的灯光编好。不预编的话第一次画到它们时 three 同步等链接（WebGLProgram.getUniforms），
   * 走进新区域那一帧卡几十到几百毫秒。浏览器有 KHR_parallel_shader_compile 时整个过程不占主线程；没有时编译照样提前在这一帧做掉。
   */
  prewarm(root: THREE.Object3D, scene: THREE.Scene): Promise<unknown> {
    const r = this.renderer;
    this.placeCamera();
    const cam = this.camera;
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const jobs: Promise<unknown>[] = [r.compileAsync(root, cam, scene)];
    // compileAsync 的编译部分是同步的：换上别的材质、调用、马上换回来就行
    const orig = meshes.map((m) => m.material);
    const swapTo = (pick: (m: THREE.Mesh, src: THREE.Material) => THREE.Material | undefined) => {
      let any = false;
      for (const m of meshes) {
        const src = Array.isArray(m.material) ? m.material[0] : m.material;
        const to = pick(m, src);
        if (to) {
          m.material = to;
          any = true;
        }
      }
      if (any) jobs.push(r.compileAsync(root, cam, scene));
      meshes.forEach((m, i) => {
        m.material = orig[i];
      });
    };
    swapTo((_m, src) => normalMatOf(src) ?? this.fallbackNormal);
    // 投影：three 的阴影 pass 每个网格把深度材质的 side（翻面）、map、alphaMap、alphaTest 改成颜色材质的（WebGLShadowMap.getDepthMaterial），
    // 这些进程序的 key：按同样的规则做一份变体再编，编的才是阴影 pass 真要用的那个程序
    if (r.shadowMap.enabled) {
      const variants = new Map<string, THREE.Material>();
      swapTo((m, src) => {
        if (!m.castShadow) return undefined;
        const base = m.customDepthMaterial ?? this.plainDepth;
        const side = src.shadowSide ?? SHADOW_SIDE[src.side];
        const alphaTest = src.alphaToCoverage ? 0.5 : src.alphaTest;
        const map = (src as THREE.MeshToonMaterial).map ?? null;
        const alphaMap = (src as THREE.MeshToonMaterial).alphaMap ?? null;
        const key = `${base.uuid}|${side}|${alphaTest > 0}|${!!map}|${!!alphaMap}`;
        let v = variants.get(key);
        if (!v) {
          const d = base.clone() as THREE.MeshDepthMaterial;
          d.onBeforeCompile = base.onBeforeCompile;
          d.customProgramCacheKey = base.customProgramCacheKey;
          Object.assign(d, { side, alphaTest, map, alphaMap });
          variants.set(key, d);
          v = d;
        }
        return v;
      });
      // 变体材质不 dispose：three 的程序按引用计数，释放了没人用的程序会被删掉，等于白编
    }
    return Promise.all(jobs);
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
