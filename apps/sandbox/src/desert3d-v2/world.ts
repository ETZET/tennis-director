// desert3d-v2 的共享契约：渲染核心的 AssetCtx（clubsite/render/ctx.ts），调色板是底表（clubsite/render/palette-base.ts，原来的 palette.ts）。
// 单位米，y 朝上，相机 yaw 0 时 +z 朝镜头（画面下方）。资产文件：src/desert3d-v2/assets/<id>.ts（共用的植物、人、长椅、工具在 clubsite）。
export type { BaseBuild as AssetBuild, BaseCtx as AssetCtx, SharedUniforms } from '../clubsite/render/ctx';
