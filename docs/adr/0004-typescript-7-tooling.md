# 0004 TypeScript 7 下的工具选择

- 状态：已采纳
- 日期：2026-10-30

## 背景

技术选型定了 TypeScript 7（原生编译器，约快 10 倍）。7.0 还没有公开稳定的编译器 JS API，依赖它的工具（typescript-eslint、dependency-cruiser 的 TS 解析）暂时用不了。

## 决定

- 类型检查用 `tsc`（typescript@7.0.2），每个包一份 tsconfig，`strict` 全开。
- 代码规范和格式化用 Biome：独立的 Rust 实现，不依赖 TypeScript 的 JS API。
- dependency-cruiser 用 SWC 解析 TypeScript（`parser: 'swc'`）。它仍会提示找不到兼容的 TypeScript，这条提示可以忽略：模块和依赖都能正确识别，规则也会生效。
- 编译交给 Vite 8 和 Vitest，它们不调用 tsc。
- `noUncheckedIndexedAccess` 在纯逻辑包（shared、sim、content、ui）里打开；render 和应用里关闭，因为从原型移植的体素代码大量按下标访问数组。

## 后果

- 等 TypeScript 7 的 API 稳定后，可以重新评估 typescript-eslint 的类型感知规则。
