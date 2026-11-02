import * as THREE from 'three';

/**
 * 色彩和光照单位（ART-6，three r128 → r187）。
 *
 * 画面的颜色和灯光强度都是在 r128 下对着截图调出来的：颜色的十六进制值原样进着色器，
 * 不做 sRGB ↔ 线性转换，画布输出也不转换；灯光强度在内部乘 π（legacy lights）。
 * r152 起 three 默认开启色彩管理、输出 sRGB，r155 去掉了 legacy lights，
 * 不处理的话整个画面暗约 15%、偏灰。这里把两件事都拨回 r128 的样子：
 *
 * - 关掉 `ColorManagement`：`new Color('#hex')`、`setHSL` 不再做 sRGB → 线性转换；
 * - 渲染器输出 `LinearSRGBColorSpace`：着色器结果直接写进画布；
 * - 灯光强度乘 `LIGHT_UNIT`（π），等于 r128 的 legacy lights。
 *
 * 这个模块必须在任何 `THREE.Color` 创建之前求值，所以 `index.ts` 第一行先 `import` 它。
 * 以后要换成"正确"的线性工作流（ColorManagement 开、输出 sRGB、贴图标 SRGBColorSpace），
 * 是一次整体的美术重调，单独决策（见 ART-6 笔记）。
 */
THREE.ColorManagement.enabled = false;

/** r128 的灯光强度 × LIGHT_UNIT = r155 以后同样亮度的强度。 */
export const LIGHT_UNIT = Math.PI;

/** 每个 WebGLRenderer 创建后调用一次。 */
export function useLegacyColor(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
}
