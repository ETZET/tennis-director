// 给色阶材质（clubsite/render/toon.ts 的 MeshToonMaterial）接一段自己的着色：在 toon 算完"本档元素色"那一行后面插代码。
// 插进去的代码能用 toon 里现成的东西：band（0 暗 / 1 中 / 2 亮，改它会影响后面的太阳色）、sh（投影）、col、base、
// vElemP（世界位置）、vElemL（本地位置）、vElemUv、vElemA、eScr / eh / evn / eTone / eToneOf、uSeamC / uHiC / uElX、uTexel、eRpm、uTime。
// 材质必须带 elem（随便一个 kind，用它的 uTone 那套颜色），而且不能和别处共用：elem.seed 给一个这里专用的数，缓存就是独占的。
import type * as THREE from 'three';

const ANCHOR = 'col = elemShade(int(band + 0.5), inverseTransformDirection(Nn, viewMatrix)) * base;';

export interface Patch {
  /** 程序缓存键的后缀（同一段代码同一个 tag） */
  tag: string;
  defines?: Record<string, string>;
  uniforms?: Record<string, THREE.IUniform>;
  /** 片元：声明（插在 main 前面） */
  fragDecl?: string;
  /** 片元：插在元素色那一行后面（main 里、RAMP_OUT 的块里） */
  frag?: string;
  /** 顶点：声明 */
  vertDecl?: string;
  /** 顶点：插在 begin_vertex 后面（改 transformed；风摆之前） */
  vert?: string;
}

export function patchToon<M extends THREE.Material>(m: M, p: Patch): M {
  if (m.userData.ftnTag === p.tag) return m;
  if (m.userData.ftnTag)
    throw new Error(`fountain: 材质已经接过 ${m.userData.ftnTag}，不能再接 ${p.tag}（elem.seed 换一个）`);
  m.userData.ftnTag = p.tag;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, p.uniforms ?? {});
    let fs = sh.fragmentShader;
    if (p.fragDecl) fs = fs.replace('void main() {', `${p.fragDecl}\nvoid main() {`);
    if (p.frag) {
      if (!fs.includes(ANCHOR)) console.error('fountain: toon.ts 里找不到元素色那一行，水面效果没接上');
      fs = fs.replace(ANCHOR, `${ANCHOR}\n${p.frag}`);
    }
    sh.fragmentShader = fs;
    let vs = sh.vertexShader;
    if (p.vert) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${p.vert}`);
    if (p.vertDecl) vs = `${p.vertDecl}\n${vs}`;
    sh.vertexShader = vs;
  };
  const k0 = m.customProgramCacheKey();
  m.customProgramCacheKey = () => `${k0}:${p.tag}`;
  if (p.defines) {
    const md = m as M & { defines?: Record<string, string> };
    md.defines = { ...md.defines, ...p.defines };
  }
  return m;
}
