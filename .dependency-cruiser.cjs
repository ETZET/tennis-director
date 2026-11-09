/**
 * 分层规则（技术文档「协作规范：分层由工具强制」）。
 *
 * 依赖方向只能往下：apps → ui → sim → shared。content 只由 sim 读取。
 * 画面换成 three.js 3D 像素（ADR 0027）：three 暂时只在 apps/sandbox 里，接回游戏时另写 ADR 再放开。
 * 旧的 2.5D 等距画面（@td/iso）归档在 docs/archive/iso-2.5d，不参与构建，谁也不能引用。
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'sim-is-pure',
      comment: '模拟核心不能依赖界面、three.js、Preact。它要能在命令行里无头跑。',
      severity: 'error',
      from: { path: '^packages/sim/' },
      to: { path: ['^packages/ui/', 'node_modules/(three|@types/three|preact|@preact)/'] },
    },
    {
      name: 'shared-is-leaf',
      comment: 'shared 是最底层，不依赖任何其他工作区包。',
      severity: 'error',
      from: { path: '^packages/shared/' },
      to: { path: '^packages/(?!shared/)' },
    },
    {
      name: 'three-only-in-sandbox',
      comment: 'three.js 暂时只在 apps/sandbox 的 3D 像素场景里用（ADR 0027）；游戏和各个包都不引用。',
      severity: 'error',
      from: { pathNot: '^apps/sandbox/' },
      to: { path: 'node_modules/(three|@types/three)/' },
    },
    {
      name: 'club-not-from-experiments',
      comment:
        '俱乐部场景（src/club*/）和它们共用的 src/clubsite/ 不引用早期实验 desert3d、desert3d-v2、pond3d：' +
        '要用那边的东西就搬进 clubsite（渲染核心在 clubsite/render）。实验可以反过来引用 clubsite。',
      severity: 'error',
      from: { path: '^apps/sandbox/src/club[^/]*/' },
      to: { path: '^apps/sandbox/src/(desert3d[^/]*|pond3d)/' },
    },
    {
      name: 'clubsite-not-from-scenes',
      comment:
        'clubsite 是各俱乐部场景共用的一层（渲染核心、世界坐标、人、素材），不引用任何一个场景（src/club*/ 里除了 clubsite 自己）。',
      severity: 'error',
      from: { path: '^apps/sandbox/src/clubsite/' },
      to: { path: '^apps/sandbox/src/club(?!site/)[^/]*/' },
    },
    {
      name: 'clubwalk-is-top',
      comment:
        'src/clubwalk（所有场景连成的大世界）是唯一 import 各场景模块（scene.ts）拼在一起的地方；反过来谁也不 import clubwalk。',
      severity: 'error',
      from: { pathNot: '^apps/sandbox/src/clubwalk/' },
      to: { path: '^apps/sandbox/src/clubwalk/' },
    },
    {
      name: 'content-only-via-sim',
      comment: '内容数据只由模拟核心读取。',
      severity: 'error',
      from: { path: '^packages/(ui|shared)/' },
      to: { path: '^packages/content/' },
    },
    {
      name: 'no-archive',
      comment: '归档的代码（docs/archive，例如 2.5D 等距画面）不参与构建，不能引用。',
      severity: 'error',
      from: { pathNot: '^docs/' },
      to: { path: '^docs/' },
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
      comment: '引用了 package.json 里没声明的包（pnpm 的包边界会让它解析失败），例如在 sim 里 import three。',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-circular',
      comment: '只看运行时的环；纯类型的互相引用（import type）编译后就没了，不算。',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
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
