// 俱乐部各场景共用的"总监操控"（玩法模式）。从 desert3d-v2 的 control.ts + hud.ts 泛化（那两份不动）。
// 试点：clubdesk（src/clubdesk/play.ts 是怎么接的样板）。
//
// ════════════════════════════════════════════════════════════════════════════════════════
// 一、接进场景（main.ts，四步）
// ════════════════════════════════════════════════════════════════════════════════════════
//   import { mountPlay, playEnabled, rampFromStairs, footprint } from '../clubsite/play';
//   const PLAY = playEnabled(params);          // 默认开；?play=0 = 原来的看图模式（截图、画廊不变）
//   // 1) buildScene() 之后建：
//   const play = mountPlay({
//     scene, pipe, canvas,                     // canvas = #c（摇杆、点地面、缩放都挂在它上面）
//     director: scene.getObjectByName('slot:director')!,   // clubsite/people 的 director（场景里已经摆好的那个）
//     start: [x, z], yaw: 1.25,                // 开局站哪、朝哪（0 = 朝镜头 +z，π/2 = 朝东 +x）
//     nav: {                                   // 导航（见下面"二"）
//       groundAt: terrain.groundAt, bounds: { x0, x1, z0, z1 },
//       walkable: [...WALKABLE 的矩形/多边形], blocked: [...家具脚印、树圆、围场], ramps: STAIRS.map(rampFromStairs),
//     },
//     camera: { lead: { portrait: 1.4, landscape: 0.5 }, view?: 世界范围（画面不出界，只对 yaw 0） },
//     hint: '拖动走路 · 点地面走过去',
//   });
//   // 2) 固定步长循环（step 里，每 1/60 秒）：play.update(DT, simT)      —— 走路、动作、相机都在模拟时间里，?pause=1 时不动
//   // 3) 每帧 render 之后：play.hud.frame()                            —— 按钮字、气泡、顶栏、箭头
//   // 4) 原来白模的拖动平移 / 缩放监听只在 !PLAY 时挂（不然和摇杆抢指针）；标签默认关（?labels=1 再开）。
//   window 上挂 play（测试用：play.state()、play.setStick、play.tapWorld …）。
//   样式自动注入（style.ts），场景 html 不用加东西；左上像素选择器、右上配色切换照旧（z-index 5，在玩法层上面）。
//
// ════════════════════════════════════════════════════════════════════════════════════════
// 二、导航（nav.ts，NavSpec）
// ════════════════════════════════════════════════════════════════════════════════════════
//   形状 Shape = 矩形 {x0,x1,z0,z1} | 圆 {x,z,r} | 多边形 {poly:[[x,z]…]} | 胶囊 {a:[x,z], b:[x,z], r}（球网、围网一段）
//   groundAt(x,z)  场景的地面高度（terrain.groundAt）
//   bounds         网格范围（建一次 0.2 米网格给点地面寻路用；30×60 米 ≈ 20 毫秒）
//   walkable       能走的并集（不给 = 整个 bounds）
//   blocked        静态挡路的（柜台、树干、长椅、围场…）。footprint(obj, shrink) 把一个摆好的资产的包围盒变成矩形
//   ramps          坡道 / 台阶：矩形里高度线性插值，覆盖 groundAt（场景的 STAIRS 用 rampFromStairs 换）
//   stepUp 0.3     高差 ≤ 0.3 米能迈（路缘、一级台阶）；更高 = 崖壁 / 挡土墙，挡住
//   body 0.28      身体半径；cell 0.2 网格
//   会动的挡路圆：play.blockPerson(人, 0.3)、play.addBlocker(() => 圆 | 圆[] | null)（车、推车……每帧调）
//   门开了 / 车停进来了这种静态变化：play.nav.setBlocked([...新的全部 blocked])（重建网格）
//   走路：碰到东西沿边滑；点地面 = A* + 拉直；被人挡住会重新规划一次。
//
// ════════════════════════════════════════════════════════════════════════════════════════
// 三、互动点（play.add，同 id 再 add = 替换；返回移除函数）
// ════════════════════════════════════════════════════════════════════════════════════════
//   play.add({
//     id: 'net-crank', at: () => 世界点（箭头悬在它上方 0.35 米；总监用时面向它；点屏幕 40 px 内算点到它）,
//                                      at() 每帧会调好几次：返回一个建好的 Vector3（别每次 new + 遍历场景）
//     radius: 1.2,                     // 总监脚下离 at() 多近生效
//     stand: () => [x, z],             // 点它时走到哪站着（不给 = at() 朝总监一侧附近能站的点）
//     priority: 0,                     // 同时好几个在范围里：大的优先，再按距离
//     // 动作键（大按钮 / 空格 / E）
//     label: '摇网' | (s) => '…',      // 没 label = 不占动作键；返回 '' = 这会儿不显示
//     canUse: (s) => !s.held,          // s = play.state()：x y z yaw speed held busy holding t
//     onUse: (play) => {…},            // 按下那一刻（一次性的活：play.busy({ dur: 1.5, pose: 'idle', mid: () => …, end }) ）
//     onHold: (dt, play) => {…},       // 按住期间每个模拟步；return false = 干完了
//     onRelease: (play) => {…},
//     pose: 'crank', holdSpeed: 0,     // 按住时的姿势（按 period 循环）、能不能边干边走（扫地 0.9）
//     autoUse: true,                   // 点屏幕走到这里以后自动按一下（只对 onUse，不对 onHold）
//     // 拿/放键（小按钮 / F / 回车）
//     pickLabel: '拿毛巾', canPickUp: (s) => …, onPickUp: (play) => play.give(play.addItem({...})),
//     accepts: (item, s) => item.id.startsWith('towel'), putLabel: '递毛巾',
//     onPutDown: (item, play) => item.remove() | item.stow(柜台, 本地点) | item.place(x, z),
//     pickBusy: { pose: 'pickup', dur: 0.5 } | null,   // 拿/放的动作（默认这个；回调在动作中点）
//   });
//
// ════════════════════════════════════════════════════════════════════════════════════════
// 四、手里的东西（play.addItem）
// ════════════════════════════════════════════════════════════════════════════════════════
//   const broom = play.addItem({
//     id: 'broom', name: '扫帚', obj: 地上的样子（Object3D，拿着时挂到右手：clubsite/people 的 hold(obj, grip)）,
//     grip?: { at, axis, up, at2, tip },   // 不给读 obj.userData.grip（clubsite/tools 的工具都有）
//     prop?: 'broom',                      // 或者：拿着时用人物内置道具（地上的 obj 藏起来）
//     radius: 1.0, carryPose: 'push', carrySpeed: 2.3, groundY: 0, droppable: true,
//     use: { label: '扫', pose: 'sweep', holdSpeed: 0.9, onHold: (dt, play) => {…} },   // 拿着时动作键干的活（不靠互动点）
//   });
//   broom.place(x, z, yaw)   摆在地上（能拿）       broom.stow(parent, 本地点, rotY)  摆到别处（不能拿：架子上、柜台上）
//   broom.remove()           删掉                    broom.where: 'ground' | 'held' | 'loose' | 'away' | 'gone'
//   play.give(item)          放到总监手里（手里原来的放在脚前）    play.take() 从手里拿走（之后 place / stow / remove）
//   play.held()              手里的                  play.drop() 放在脚前
//   空手走近地上的东西 → "拿起 扫帚"；拿着 → "放下 扫帚"，或者走近收它的互动点 → 它的 putLabel。
//   优先级：动作键 = 范围里的互动点 > 手里东西的 use；拿/放键 = 收它的互动点 > 放下；空手时 = 互动点的 onPickUp > 地上的东西。
//
// ════════════════════════════════════════════════════════════════════════════════════════
// 五、界面数据（hud 每帧读）
// ════════════════════════════════════════════════════════════════════════════════════════
//   play.stat('court', '场地', '85%')       顶栏一格（同 key 更新；value null = 去掉）
//   play.say(人 | 世界点 | () => 点, '有沙！', 秒 = 2.5, dy = 2.15)   临时气泡（人：头顶上方 dy 米）
//   play.bubble('queue', 人, '快点！')      常驻气泡（同 key 更新；bubble(key, null) 去掉）。人在画面外 → 贴着画面边
//   play.toast('签到 ✓', 秒 = 1.8)           画面上方一行提示
//
// ════════════════════════════════════════════════════════════════════════════════════════
// 六、别的
// ════════════════════════════════════════════════════════════════════════════════════════
//   play.state()                      位置、朝向、速度、手里的、busy、holding、t（NPC 反应：离柜台多远、拿着什么）
//   play.busy({ name, dur, pose, loop, face, tick(k), mid, end })   一次性动作（不能走；姿势 phase 0→1 或循环）
//   play.walkTo(x, z) / play.teleport(x, z, yaw)
//   play.director                     总监（Object3D，clubsite/people：pose / hold / lookAt…；姿势由 play 每步设，别的代码别 pose 它）
//   测试：play.setStick(x, y)（屏幕方向 −1..1）、play.setKey('KeyW', true)、play.setUse(true/false)、play.pick()、
//         play.tapWorld(x, z)、play.tapScreen(cssX, cssY, w, h)、play.pathLeft()、play.ui()
//   不用 Math.random；所有动作都在 update(dt) 的模拟时间里（确定性，?pause=1 下不动）。
import * as THREE from 'three';
import { createPlay, type Play, type PlayOpts } from './control';
import { createHud, type Hud } from './hud';
import type { Rect } from './nav';

export type {
  Anchor,
  BusySpec,
  CameraOpts,
  Interactable,
  Item,
  ItemSpec,
  PipeLike,
  Play,
  PlayOpts,
  PlayState,
  PlayUi,
} from './control';
export { createPlay } from './control';
export type { Hud } from './hud';
export { createHud } from './hud';
export type { Circle, NavSpec, Poly, Ramp, Rect, Seg, Shape, V2 } from './nav';
export { inPoly, NavMap, rampFromStairs, stairCheeks } from './nav';

/** 玩法模式开不开：默认开，?play=0 关 */
export const playEnabled = (params: URLSearchParams) => params.get('play') !== '0';

export interface MountOpts extends PlayOpts {
  canvas: HTMLCanvasElement;
  /** 界面容器（不给 = 自己建一个挂到 body） */
  root?: HTMLElement;
  /** 左下角的操作提示（第一次拖动/点地面后淡出） */
  hint?: string;
}

/** 建 play + hud（大多数场景就用这个） */
export function mountPlay(o: MountOpts): Play & { hud: Hud } {
  const play = createPlay(o);
  const hud = createHud(play, o.canvas, { root: o.root, hint: o.hint });
  return Object.assign(play, { hud });
}

/** 摆好的资产 → 地面上的矩形脚印（世界包围盒的 xz，四边各缩 shrink 米）；空的 = null */
export function footprint(obj: THREE.Object3D, shrink = 0.05): Rect | null {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  if (b.isEmpty()) return null;
  return { x0: b.min.x + shrink, x1: b.max.x - shrink, z0: b.min.z + shrink, z1: b.max.z - shrink };
}
