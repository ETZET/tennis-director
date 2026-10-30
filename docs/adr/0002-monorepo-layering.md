# 0002 用 pnpm 工作区和依赖检查强制分层

- 状态：已采纳
- 日期：2026-10-30

## 背景

技术文档要求模拟和表现分离：模拟核心不引用 three.js、不碰 DOM，能在命令行里无头跑。只靠约定，这条边界迟早会被一次"顺手"的 import 打破。

## 决定

- 工程拆成 `packages/{shared,sim,content,render,ui}` 和 `apps/{game,sandbox,sim-cli}`，用 pnpm 工作区管理。每个包只能 import 自己 package.json 里声明的依赖，`sim` 根本装不了 three。
- `.dependency-cruiser.cjs` 再加一道检查，防止用相对路径绕过包边界：
  - `sim` 不能依赖 render、ui、three、preact；
  - `shared` 不依赖任何工作区包；
  - render 和 ui 互不引用；
  - content 只由 sim 读取；
  - 包不能引用应用；没声明的依赖和循环依赖都算错误。
- 包直接导出 TypeScript 源码（`exports: ./src/index.ts`），由 Vite 和 Vitest 编译，不单独构建包。

## 后果

- `pnpm check:deps` 在 CI 里跑，违反分层直接失败。
- 包之间改代码不需要先构建，开发体验接近单包。
- 应用对包源码做类型检查时使用应用自己的 tsconfig，所以 `noUncheckedIndexedAccess` 只在 shared、sim、content、ui 里开（见 0004）。
