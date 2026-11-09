// 俱乐部各场景共用的人：球员、教练、总监（desert3d-v2 的 Q 版人，比例、衣服一模一样）+ 孩子，外加新姿势、匹克球拍、手里挂工具。
// 骨骼和原来的姿势在 rig/rig.ts（原 desert3d-v2/assets/player/rig.ts）；这里包一层（person.ts）。
//
// ── 用法 ──
//   场景的 reuse.ts：player / coach / director / kid / ball-kid / umpire 从这里拿（player v0..3 同 desert3d-v2，kid v0..2，
//   ball-kid v0..3 只换肤色，umpire v0 白衬衫 / v1 深色外套）。
//   userData.pose(name, phase?)   不给 phase = 按 period(name) 秒一遍循环（update(dt) 推）；给 phase = 定格
//   userData.poses                全部姿势名；userData.period(name) 一遍几秒
//   userData.update(dt)           每帧调（场景的 collectUpdaters 已经在调）
//
// ── 姿势（phase 0..1 一遍，秒数 = period）──
//   rig 原有：idle 3 · walk 0.9 · ready 1.2 · forehand 1.1 · backhand 1.1 · serve 1.6 · sweep 1.3 · feed 1.6 · blow 2.4 · push 0.9 · pickup 0.5 · dump 1.6
//   新加（poses.ts）：
//   sit 3.2     坐着（一遍 = 一次呼吸），手按大腿。座面高 setSeat(h, foot)：长椅默认 0.52；裁判椅 setSeat(1.77, 1.54)。
//               root 原点 = 髋正下方（臀落在座面上），脚往前 ≈ 0.3 米落在 foot 高；小腿最多拉长 1.9 倍去够地，再高就悬着
//   clap 0.5    鼓掌：0 分开 → CLAP_HIT 0.5 两手拍到一起（坐着；setSeat(null) 后站着拍）
//   sip 4       坐着喝（setProp('cup')）：SIP_AT 0.42..0.62 杯子在嘴边
//   drag 1.1    拖垫：绳子搭右肩、双手在胸前攥绳、前倾走路循环；userData.ropePoint() = 绳子在背后腰高的点（拖垫的绳从这里接）
//   water 2.4   浇水：右手握喷头、左手托水管（工具的 at2），一遍左右扫一趟；userData.nozzle() / nozzleDir()
//   crank 0.6   摇绞盘：半蹲，右手绕转轴一圈（setCrank(世界坐标)），左手扶柱；crankAngle() 曲柄角；拿着摇把时摇把一直指着转轴
//   skim 1.2    长杆捞网：0..0.4 网圈抬起往外推 → SKIM_WET 0.45..1 贴着水面往回拖；水面高 setSkim({ water })（默认 0.42 = 喷泉池水比广场高）；
//               toolTip() = 网圈中心
//   dink 0.6    匹克球轻吊（正手）：低重心、拍面朝上，DINK_HIT 0.55 碰球；dinkB = 反手
//   pour 1.2    浇水壶：提到身前 → POUR_FLOW 0.38..0.66 壶嘴朝下出水 → 放回；toolTip() = 壶嘴
//   call 2.5    裁判报分（坐着）：CALL_UP 0.3..0.6 右手举过头
//   squeegee 1.6  刮水板：弓步双手握柄，SQUEEGEE_PUSH 0..0.55 刮头贴地往前推 → 抬起收回；toolTip() = 刮头
//   bkCrouch 2.4  球童蹲着（膝盖外分、双手扶膝、抬头看场），一遍 = 一次呼吸
//   bkStand 3.2   球童站着、手背在身后
//   bkRoll 1.2    球童把球滚给发球的人（朝人物 +z）：引手 → BK_ROLL_RELEASE 0.5 贴地出手；rollPoint() / rollDir()（世界坐标）
//   bkUmbrella 3.2  给坐着的球员撑伞（自己拿上伞）：伞往 setShade(世界坐标) 那边斜（默认左前方 0.7 米）
//
// ── 道具 ──
//   setProp('racket' | 'broom' | 'blower' | 'picker' | 'paddle' | 'cup' | <登记过的工具名> | <代用工具> | null)
//     paddle：匹克球拍（颜色按变体：player v0 paddle 珊瑚 / v1 flowerYellow / v2 counter 蓝 / v3 toolOrange），rig 的挥拍姿势照抄球拍的朝向。
//     clubpickle 里 setProp('racket') 自动换成 paddle（那里没有网球拍）。
//     代用工具（工具代理的正式资产到之前试姿势用）：skim / hose / crank / can / brush（props.ts）。
//   hold(obj, grip?, name?)  把任意工具拿到右手：grip 不给就读 obj.userData.grip（约定见 hold.ts：at 握点、axis 指向干活那头、
//                            up 工具的上面、at2 第二只手、tip 干活那头的点；都是工具本地坐标）
//   addTool(name, obj, grip?) 登记一件工具，之后 setProp(name) 拿起（SLOTS 的 prop 可以写它）
//   release(to?)  松手（工具保持世界位置挂到 to，默认人物的父级）；drop() 放到脚边地上（只保留人的朝向）
//   tool() 手里的工具；toolTip() 工具 tip 的世界坐标；handPoint('R' | 'L') 拳头的世界坐标
//   拿着工具时 idle / walk：短的顺着手臂垂着、长的（> 1.2 米）竖着拿；push：长工具头落在身前地上推（扫线刷）
//   推车（grip 写 cart: true：划线车、水管卷盘车）：车立在身前地上、推把中点在身前 0.5 米，双手握 at / at2；
//     idle 扶着、walk / push 推着走（车跟着人，演出只管挪人）
//   umbrella：球童的伞（bkUmbrella 自动拿）；代用工具多了 squeegee（刮水板）、marker（划线车，推车）
//
// ── 别的 ──
//   lookAt(世界坐标 | null)  头转过去（所有姿势都生效：观众看球、裁判看球）
//   画廊参数：?pose=&phase=&prop=&seat=&foot=&water=&look=x,y,z
import type * as THREE from 'three';
import type { BaseCtx as D3Ctx } from '../render/ctx';
import { KID, TEEN, wrapPerson } from './person';
import { matOr, PADDLE_KEYS, PERSON } from './props';
import { build as coachBuild } from './rig/coach';
import { build as directorBuild } from './rig/director';
import { build as playerBuild } from './rig/player';
import { buildPerson, type Look } from './rig/rig';

export type { GripSpec } from './hold';
export { ALL_POSES, KID, RIG_PERIOD, TEEN } from './person';
export {
  BK_ROLL_RELEASE,
  CALL_UP,
  CLAP_HIT,
  DINK_HIT,
  NEW_PERIOD,
  NEW_POSES,
  POUR_FLOW,
  SIP_AT,
  SKIM_WET,
  SQUEEGEE_PUSH,
} from './poses';
export { buildPaddle, buildStandIn, buildUmbrella, STAND_INS } from './props';

/** 场景之间的差别 */
export interface SceneOpts {
  /** setProp('racket') 当成匹克球拍（clubpickle） */
  racketIsPaddle?: boolean;
}

const vi = (ctx: { variant: number }, n: number) => ((ctx.variant % n) + n) % n;

export function player(ctx: D3Ctx, o: SceneOpts = {}): THREE.Object3D {
  return wrapPerson(ctx, playerBuild(ctx) as THREE.Group, {
    hasRacket: true,
    paddleKey: PADDLE_KEYS[vi(ctx, PADDLE_KEYS.length)],
    racketIsPaddle: o.racketIsPaddle,
  });
}

export function coach(ctx: D3Ctx, o: SceneOpts = {}): THREE.Object3D {
  return wrapPerson(ctx, coachBuild(ctx) as THREE.Group, {
    hasRacket: true,
    paddleKey: 'counter',
    racketIsPaddle: o.racketIsPaddle,
  });
}

export function director(ctx: D3Ctx): THREE.Object3D {
  return wrapPerson(ctx, directorBuild(ctx) as THREE.Group, { hasRacket: false, paddleKey: 'counter' });
}

type Key = Parameters<D3Ctx['mat']>[0];
interface KidOutfit {
  skin: Key;
  shirt: Key;
  bottom: Key;
  bottomKind: Look['bottomKind'];
  hairStyle: Look['hairStyle'];
  cap?: Key;
  shoes: Key;
}
/** 孩子的衣服：比大人更艳的纯色 T 恤（小身子上一块颜色就是全部），v1 是喷泉边玩水的那个 */
const KID_OUTFITS: KidOutfit[] = [
  {
    skin: 'skinTan',
    shirt: 'flowerYellow',
    bottom: 'clothBlue',
    bottomKind: 'shorts',
    hairStyle: 'short',
    shoes: 'clothRed',
  },
  {
    skin: 'skinLight',
    shirt: 'clothTeal',
    bottom: 'clothWhite',
    bottomKind: 'skirt',
    hairStyle: 'ponytail',
    shoes: 'clothRed',
  },
  {
    skin: 'skinDark',
    shirt: 'clothRed',
    bottom: 'clothBlue',
    bottomKind: 'shorts',
    hairStyle: 'cap',
    cap: 'flowerYellow',
    shoes: 'clothWhite',
  },
];

/**
 * 孩子（≈ 1.2 米）：同一套骨骼，身子 0.66、腿再短 0.85、头放大 1.24（头身比更大，不是把大人缩小）。默认空手。
 * 变体 v0 黄 T 恤蓝短裤、v1 青绿 T 恤白裙马尾、v2 红 T 恤戴黄帽。
 */
export function kid(ctx: D3Ctx): THREE.Object3D {
  const o = KID_OUTFITS[vi(ctx, KID_OUTFITS.length)];
  const m = (k: Key) => ctx.mat(k, PERSON as Parameters<D3Ctx['mat']>[1]);
  const root = buildPerson(
    ctx,
    {
      skin: m(o.skin),
      hair: ctx.mat('hair', { ...PERSON, edge: 0.25, convex: 0 } as Parameters<D3Ctx['mat']>[1]),
      shirt: m(o.shirt),
      bottom: m(o.bottom),
      bottomKind: o.bottomKind,
      shoes: m(o.shoes),
      hairStyle: o.hairStyle,
      cap: o.cap ? m(o.cap) : undefined,
      hold: { kind: 'racket', frame: m('clothRed'), strings: m('clothWhite'), grip: m('hair'), ball: ctx.mat('ball') },
    },
    `kid-v${ctx.variant}`,
  );
  return wrapPerson(ctx, root, { hasRacket: true, scale: KID, paddleKey: 'flowerYellow', defaultProp: null });
}

const P = PERSON as Parameters<D3Ctx['mat']>[1];
const HAIR = { ...PERSON, edge: 0.25, convex: 0 } as Parameters<D3Ctx['mat']>[1];
/** 球童的头发 / 肤色变体（衣服统一） */
const BK_SKIN: Key[] = ['skinTan', 'skinLight', 'skinDark', 'skinLight'];

/**
 * 球童（少年，≈ 1.45 米，TEEN 比例）：统一的一套 —— 白帽、俱乐部蓝 Polo（`counter`）、白短裤、白鞋。
 * 变体 v0..3 只换肤色（衣服一样，一排球童读成一队）。默认空手。
 * 姿势：bkCrouch（网柱旁 / 底线角蹲着，双手扶膝）、bkStand（站着，手背在身后）、bkRoll（把球滚给发球的人，
 * BK_ROLL_RELEASE 出手，rollPoint() / rollDir()）、bkUmbrella（给坐着的球员撑伞，setShade(世界坐标)）。
 */
export function ballKid(ctx: D3Ctx): THREE.Object3D {
  const m = (k: Key) => ctx.mat(k, P);
  const polo = matOr(ctx, 'counter', [0x4a9ae0, 0x2e64b4, 0x2a3a78]);
  const root = buildPerson(
    ctx,
    {
      skin: m(BK_SKIN[vi(ctx, BK_SKIN.length)]),
      hair: ctx.mat('hair', HAIR),
      shirt: polo,
      bottom: m('clothWhite'),
      bottomKind: 'shorts',
      shoes: m('clothWhite'),
      hairStyle: 'cap',
      cap: m('clothWhite'),
      hold: { kind: 'racket', frame: m('clothRed'), strings: m('clothWhite'), grip: m('hair'), ball: ctx.mat('ball') },
    },
    `ball-kid-v${ctx.variant}`,
  );
  return wrapPerson(ctx, root, { hasRacket: true, scale: TEEN, defaultProp: null });
}

/**
 * 裁判（中心球场，坐没有遮阳顶的裁判椅）：v0 白衬衫 + 深色长裤（`ironwork`）+ 深色帽；v1 深色外套 + 白帽（clubstadium.md 的写法）。
 * 默认空手、sit。姿势：sit（setSeat(座高, 脚踏高)）、call（坐着举手报分，CALL_UP 段手在最高）、clap、lookAt(球)。
 */
export function umpire(ctx: D3Ctx): THREE.Object3D {
  const m = (k: Key) => ctx.mat(k, P);
  const dark = matOr(ctx, 'ironwork', [0x6a6890, 0x4a4670, 0x2c2848]);
  const v1 = vi(ctx, 2) === 1;
  const root = buildPerson(
    ctx,
    {
      skin: m(v1 ? 'skinDark' : 'skinLight'),
      hair: ctx.mat('hair', HAIR),
      shirt: v1 ? dark : m('clothWhite'),
      bottom: dark,
      bottomKind: 'pants',
      shoes: ctx.mat('hair', HAIR),
      hairStyle: 'cap',
      cap: v1 ? m('clothWhite') : dark,
      trim: v1 ? undefined : dark,
      hold: { kind: 'racket', frame: m('clothRed'), strings: m('clothWhite'), grip: m('hair'), ball: ctx.mat('ball') },
    },
    `umpire-v${ctx.variant}`,
  );
  const o = wrapPerson(ctx, root, { hasRacket: true, defaultProp: null });
  if (!ctx.params.has('pose')) o.userData.pose('sit');
  return o;
}
