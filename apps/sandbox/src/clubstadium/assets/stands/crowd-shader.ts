// 观众的顶点动画（全在着色器里，CPU 每帧只改几个 uniform）：鼓掌、站起来欢呼、人浪、转头跟球、按块进场 / 散场。
// 接法：拿 ctx.mat(衣服色, PERSON) 的那个色阶材质，克隆一份，onBeforeCompile 先跑原来的（色阶、风摆、云影），
// 再把 CROWD_VERT 插在 `#include <begin_vertex>` 后面 —— 风摆那段（算 vWorldP、元素坐标）在它后面，所以拿到的是动过的位置。
// 法线 pass（描边）用同一段顶点代码的 MeshNormalMaterial，轮廓跟着动。观众不投影、不接收投影，没有深度材质。
//
// 每个实例的 aCr = (相位 0..1, CROWD 块号, 人浪坐标 米, 进场的名次 0..1)；
// 每个顶点的 aRig = (胳膊的带符号权重 −1..1：0 = 肩、±1 = 手，符号 = 左右；大腿前端的权重 0..1，手 = −1)。
// 偏移量都按 uCrQ（半个设计纹素 = 1× 下的一个纹素）取整：人一格一格地动，不在像素之间游。
import * as THREE from 'three';
import { packEdge } from '../../../clubsite/render/toon';

export const MAX_BLOCKS = 8;

/** 所有观众材质共用的 uniform（一个对象，CPU 改一处全都跟着变） */
export interface CrowdUniforms {
  uCrT: { value: number };
  /** 每块坐多满（已经乘了全局 fill）：名次 < 它的人坐着 */
  uCrFill: { value: number[] };
  /** x 鼓掌、y 欢呼、z 人浪、w 闲着的小动作（都 0..1，CPU 缓动） */
  uCrMode: { value: THREE.Vector4 };
  /** x 人浪的浪头（人浪坐标，米）、y 浪宽（米）、z 一圈多长（米） */
  uCrWave: { value: THREE.Vector3 };
  /** xyz 看的点（世界）、w 强度 0..1 */
  uCrLook: { value: THREE.Vector4 };
  /** 取整的步长（米） */
  uCrQ: { value: number };
  /** 进场 / 散场的过渡带（名次）：上座率在变时 0.08（人一个个从座位下面冒出来），停下以后缩到 0（没有停在半截的人） */
  uCrBand: { value: number };
  /** cheer() 的范围：x 中心（世界 x）、半径（米，0 = 全场）、站起来的人占多少（0..1，按相位挑） */
  uCrCheer: { value: THREE.Vector3 };
}

export function crowdUniforms(q: number): CrowdUniforms {
  return {
    uCrT: { value: 0 },
    uCrFill: { value: new Array(MAX_BLOCKS).fill(1) },
    uCrMode: { value: new THREE.Vector4(0, 0, 0, 1) },
    uCrWave: { value: new THREE.Vector3(-999, 2.4, 100) },
    uCrLook: { value: new THREE.Vector4(0, 1, -21, 0) },
    uCrQ: { value: q },
    uCrBand: { value: 0 },
    uCrCheer: { value: new THREE.Vector3(0, 0, 1) },
  };
}

const DECL = /* glsl */ `
uniform float uCrT;
uniform float uCrFill[${MAX_BLOCKS}];
uniform vec4 uCrMode;
uniform vec3 uCrWave;
uniform vec4 uCrLook;
uniform float uCrQ;
uniform float uCrBand;
uniform vec3 uCrCheer;
uniform float uCrPart;
attribute vec4 aCr;
attribute vec2 aRig;
float crH(float n) { return fract(sin(n * 91.345 + 47.853) * 43758.5453); }
vec3 crQ(vec3 v) { return floor(v / uCrQ + 0.5) * uCrQ; }
`;

/** 插在 transformed = position 之后 */
const VERT = /* glsl */ `
{
  float ph = aCr.x;
  float F = uCrFill[int(aCr.y + 0.5)];
  // 进场 / 散场：名次（0..0.92）< 坐满程度的人坐着；刚过线的那 0.08 从座位下面冒出来（被前排的座椅、踏面挡住）
  float vis = clamp((F - aCr.w) / max(uCrBand, 1e-4) + 0.5, 0.0, 1.0);
  // 欢呼：模式权重缓缓升起时，相位小的先站起来（一片人陆续站起，不是一下全起）
  // cheer(strength, x)：只有相位 < strength 的人、离 x 半径以内的人站（一块看台的人为一个好球站起来）
  vec3 seatW = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float who = step(ph, uCrCheer.z) * (uCrCheer.y > 0.0 ? step(abs(seatW.x - uCrCheer.x), uCrCheer.y) : 1.0);
  float cheer = clamp(uCrMode.y * 1.7 - ph * 0.7, 0.0, 1.0) * who;
  // 人浪：浪头沿马蹄形往前推，浪头前后 uCrWave.y 米之内的人站起来、举手
  float d = mod(aCr.z - uCrWave.x + uCrWave.z * 0.5, uCrWave.z) - uCrWave.z * 0.5;
  float wv = uCrMode.z * clamp(1.0 - abs(d) / uCrWave.y, 0.0, 1.0);
  float stand = max(cheer, smoothstep(0.0, 0.6, wv));
  // 站着的时候一跳一跳（欢呼：每 0.45 秒一次，各人错开）
  float bob = cheer * step(0.5, fract(uCrT / 0.45 + ph * 3.1)) * uCrQ;
  vec3 off = vec3(0.0, stand * 0.34 + bob, 0.0);
  // 腿：站起来时大腿前端往下、往后收（变成竖的腿）
  off += max(aRig.y, 0.0) * stand * vec3(0.0, -0.32, -0.2);
  // 胳膊：鼓掌 = 两手合到胸前、一上一下（0.3 秒一拍，各人错开）；欢呼 / 人浪 = 举过头顶
  float aw = abs(aRig.x);
  float side = sign(aRig.x);
  if (aw > 0.0) {
    float beat = step(0.5, fract(uCrT / 0.3 + ph * 7.3));
    vec3 clapOff = vec3(-side * (0.13 + 0.045 * beat), 0.2 + 0.09 * beat, 0.19);
    vec3 upOff = vec3(side * 0.04, 0.8, -0.04);
    float clapK = uCrMode.x * (1.0 - stand);
    off += aw * (clapOff * clapK + upOff * stand);
  }
  // 头（和帽子 / 头发）：转头看球 = 左右挪 0～2 纹素；闲着的时候三成的人偶尔转一下头（每人 3～6 秒换一次）
  if (uCrPart > 0.5 && aRig.y > -0.5) {
    vec3 dl = transpose(mat3(modelMatrix * instanceMatrix)) * (uCrLook.xyz - seatW);
    float yawL = clamp(atan(dl.x, max(dl.z, 0.5)), -1.0, 1.0);
    float look = sin(yawL) * 0.1 * uCrLook.w;
    float slot = floor(uCrT / (3.0 + 3.0 * ph) + ph * 11.0);
    float fid = crH(slot + ph * 57.0);
    float idle = (fid < 0.15 ? -1.0 : (fid > 0.85 ? 1.0 : 0.0)) * uCrQ * uCrMode.w * (1.0 - uCrLook.w);
    off.x += look + idle;
  }
  transformed += crQ(off);
  transformed.y -= (1.0 - vis) * 0.9;
  if (vis <= 0.0) transformed = vec3(0.0);
}
`;

/** 色阶材质 → 观众版（克隆、接上顶点动画、配一个同样动的法线材质）。part：0 身子、1 头、2 帽子 / 头发 */
export function crowdMaterial(
  base: THREE.MeshToonMaterial,
  U: CrowdUniforms,
  part: number,
  edge: number,
  convex: number,
): THREE.MeshToonMaterial {
  const saved = base.userData;
  base.userData = {};
  const m = base.clone();
  base.userData = saved;
  const md = m as THREE.MeshToonMaterial & { defines?: Record<string, string> };
  md.defines = { ...(base as typeof md).defines };
  const uPart = { value: part };
  const patch = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, U, { uCrPart: uPart });
    shader.vertexShader =
      DECL + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT}`);
  };
  m.onBeforeCompile = (shader, r) => {
    base.onBeforeCompile(shader, r);
    patch(shader);
  };
  const key = base.customProgramCacheKey();
  m.customProgramCacheKey = () => `${key}:crowd`;
  const nm = new THREE.MeshNormalMaterial();
  nm.opacity = packEdge(edge, convex);
  nm.blending = THREE.NoBlending;
  nm.onBeforeCompile = patch;
  nm.customProgramCacheKey = () => 'normal-crowd';
  m.userData = { normalMat: nm };
  return m;
}
