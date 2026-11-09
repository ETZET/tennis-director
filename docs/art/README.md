# 美术

游戏的画风是 **2.5D 等距像素**（ADR 0019，已定案）：固定 2:1 等距视角，Q/E 转 90°，Canvas 2D 软件光栅，暖色沙漠、Kairosoft 式饱和度。
实现在 `packages/iso`，接口契约见 [`iso-architecture.md`](../archive/iso-2.5d/docs/design/iso-architecture.md)（2.5D 已归档，ADR 0027）。

## 素材在哪

所有素材都是**文本字符画**，不放图片文件：一行一个字符串、一个字符一个像素，可以 diff、可以审查，运行时按换色表烘焙。格式见 `packages/iso/src/art/format.ts`
（`.` 透明，大写字母是换色槽位 `SLOT`，小写是暗面，其余字符查素材自己的 `pal`）。

| 目录 | 内容 |
| --- | --- |
| `packages/iso/src/art/people/` | 人物精灵表：成人（`adult.ts` 移动、姿势、击球分段；`gestures.ts` 手势、摔倒、发型和覆盖物）、小孩（`kid.ts`） |
| `packages/iso/src/art/props/` | `held.ts` 手里拿的道具，`ground.ts` 摆在地上的道具 |
| `packages/iso/src/art/icons/` | 人物头顶的表情图标 |
| `packages/iso/src/art/font/` | 场景里的像素字（5×7、3×5）；中文由 fx 层用画布写字再二值化 |
| `packages/iso/src/art/creatures/` | 流浪狗、乌鸦、风滚草 |
| `packages/iso/src/site/indian-wells/` | 场景本身（地面贴图、建筑、看台、棕榈……）是程序化的立体画法，不是字符画；设施各档的样子见 `state.ts` |

## 怎么看、怎么改

- **人物**：帧名、尺寸、锚点、挂点、槽位、帽子和球拍的约定，以及怎么用 node 脚本画成联系表预览，都在
  [`packages/iso/src/art/people/README.md`](../../packages/iso/src/art/people/README.md)。改完重点看 1× 档：轮廓清楚、朝向和动作看得出。
- **在场景里看**：`pnpm dev` 打开 sandbox。`index.html` 是场景查看器（设施状态、昼夜、雨、风、磨损、旋转缩放，状态可以写进 URL，方便脚本化截图）；
  `activities.html` 是活动动画库（每个活动一座小岛，可以调天气、疲劳、教练、变量）。
- 改了画面要更新截图，并在提交里说明原因（CLAUDE.md）。

## 画风样片（style-demos）

定案前的样片，**不进游戏构建**，留作参考。独立的 HTML 文件，直接用浏览器打开，不用构建。

| 目录 | 画风 | 状态 |
| --- | --- | --- |
| [isometric-2.5d/](style-demos/isometric-2.5d/) | 2.5D 等距像素：Palm Oasis 布局，三个复原阶段和昼夜，纯 Canvas 2D 软件光栅，无素材无库 | 已定案（ADR 0019），`packages/iso` 的光栅器照搬它 |

操作：`1/2/3` 切荒废、修复中、全面复原，`N` 昼夜，`Q/E` 旋转，`L` 标签，拖动平移，滚轮或双指缩放。也可以用 URL 参数直接打开某个状态，例如 `index.html?lv=3&night=1&ang=45`。

目录里有 `index.html`（样片本身）、`notes.md`（实现、优缺点、手机可读性、成本、风险）、`shots/`（桌面 1440×900 和手机 390×844 截图）。

![2.5D 全面复原夜景](style-demos/isometric-2.5d/shots/lv3-night-desktop.png)
