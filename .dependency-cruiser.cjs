/**
 * 分层规则（技术文档「协作规范：分层由工具强制」）。
 *
 * 依赖方向只能往下：apps → render / ui → sim → shared。
 * content 只由 sim 读取；render 和 ui 互不直接引用，只通过模拟快照和命令沟通。
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'sim-is-pure',
      comment: '模拟核心不能依赖画面、界面、three.js、Preact。它要能在命令行里无头跑。',
      severity: 'error',
      from: { path: '^packages/sim/' },
      to: { path: ['^packages/(render|ui)/', 'node_modules/(three|preact|@preact)/'] },
    },
    {
      name: 'shared-is-leaf',
      comment: 'shared 是最底层，不依赖任何其他工作区包。',
      severity: 'error',
      from: { path: '^packages/shared/' },
      to: { path: '^packages/(?!shared/)' },
    },
    {
      name: 'render-not-ui',
      comment: '画面层不直接引用界面层。',
      severity: 'error',
      from: { path: '^packages/render/' },
      to: { path: '^packages/ui/' },
    },
    {
      name: 'ui-not-render',
      comment: '界面层不直接引用画面层。',
      severity: 'error',
      from: { path: '^packages/ui/' },
      to: { path: '^packages/render/' },
    },
    {
      name: 'content-only-via-sim',
      comment: '内容数据只由模拟核心读取。',
      severity: 'error',
      from: { path: '^packages/(render|ui|shared)/' },
      to: { path: '^packages/content/' },
    },
    {
      name: 'packages-not-apps',
      comment: '包不能引用应用。',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'no-unresolvable',
      comment: '引用了 package.json 里没声明的包（pnpm 的包边界会让它解析失败），例如在 sim 里 import @td/render。',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    // typescript@7 还没有公开的编译器 API，dependency-cruiser 改用 SWC 解析 TS
    parser: 'swc',
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules)/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.mjs'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
