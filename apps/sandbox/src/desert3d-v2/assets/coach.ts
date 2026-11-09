// 教练（Q 版，上了年纪）：白色棒球帽 + 太阳镜 + 灰白胡子、紫色 Polo（白领口袖口）、卡其短裤、白鞋、胸前一个黄哨子，略发福。
// 骨骼和姿势在 player/rig.ts（共用）。正面朝 +z，右手在 −x。
// userData：
//   pose(name, phase?)  rig 的全部姿势 + feed（喂球）+ blow（吹叶机）；不给 phase = 自动播放
//     feed：0..0.25 左手探进左腰外侧的球车 → 举球到胸前 → 0.5 松手 → FEED_RELEASE（0.6）球拍在身前把球送出去（朝 +z）→ 随挥。
//           球车放在教练左手边（本地 +x 约 0.75、z 约 0.25），筐口高 0.92。userData.feedPoint() = 出球点（世界坐标）。
//     blow：双手端吹叶机，管口朝前下，一个来回左右扫一趟；userData.nozzle() / nozzleDir() = 管口位置 / 吹的方向（世界坐标）。
//   setProp('racket' | 'blower' | null)  默认 racket
// 画廊：desert3d-v2.html?asset=coach&pose=feed&phase=0.6、?asset=coach&prop=blower&pose=blow&phase=0.25
import type * as THREE from 'three';
import type { AssetCtx } from '../world';
import { PERSON } from './player';
import { buildPerson, FEED_RELEASE as RIG_FEED_RELEASE } from './player/rig';

/** feed 姿势里球离开球拍的 phase */
export const FEED_RELEASE = RIG_FEED_RELEASE;

// PALETTE-REQUEST: 灰白头发/胡子（调色板没有灰，hair 太深、clothWhite 太白）
const GREY: [number, number, number] = [0xdcd6dc, 0xa69cb4, 0x5e5478];
// PALETTE-REQUEST: 吹叶机橙（比 fabricStripe 更亮更黄的工具橙，在沙上也跳出来）
const TOOL_ORANGE: [number, number, number] = [0xff9a30, 0xd8603a, 0x7a3456];

export function build(ctx: AssetCtx): THREE.Object3D {
  const m = (k: Parameters<AssetCtx['mat']>[0]) => ctx.mat(k, PERSON);
  const grey = ctx.mat('clothWhite', { ...PERSON, ramp: GREY, edge: 0.3, convex: 0.2 });
  const coach = buildPerson(
    ctx,
    {
      skin: m('skinTan'),
      hair: grey,
      // 组装评审：浅丁香紫 + 白领口白袖口在 0.09 米/纹素下碎成紫白相间的噪点 → 深紫纯色 Polo，领口袖口同色
      shirt: m('clothPurple'),
      trim: m('clothPurple'),
      bottom: m('woodWeathered'),
      bottomKind: 'shorts',
      shoes: m('clothWhite'),
      hairStyle: 'cap',
      // 白帽在俯视里占了整个头，又和球员的白帽撞：换成红帽，一眼认出是教练
      cap: m('clothRed'),
      shades: ctx.mat('hair', { ...PERSON, edge: 0.3, convex: 0.4 }),
      mustache: grey,
      whistle: ctx.mat('flowerYellow', { ...PERSON, edge: 0.3 }),
      stout: 1.1,
      hold: {
        kind: 'racket',
        frame: m('clothBlue'),
        strings: m('clothWhite'),
        grip: m('hair'),
        ball: ctx.mat('ball', { lightUp: 0.5, bands: [-0.3, 0.45], noShadowReceive: true }),
      },
      blower: {
        body: ctx.mat('fabricStripe', { ...PERSON, ramp: TOOL_ORANGE, edge: 0.45, convex: 0.5 }),
        // 管子也是橙的：整台机器是一条从胯边斜到地上的橙色粗线，比灰管子好认
        tube: ctx.mat('fabricStripe', { ...PERSON, ramp: TOOL_ORANGE, edge: 0.45, convex: 0.3 }),
        dark: ctx.mat('hair', { ...PERSON, edge: 0.3, convex: 0 }),
      },
    },
    'coach',
  );
  return coach;
}
