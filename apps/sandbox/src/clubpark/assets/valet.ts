// 代客泊车员（v0）和门童（v1）：desert3d-v2 的 Q 版人物骨骼（player/rig.ts 的 buildPerson，和球员、总监同一副身材），
// 换一身制服 —— 远看认人只靠两块颜色：帽子 + 身子。
//   v0 代客：深蓝棒球帽（signBoard）+ 珊瑚红马甲（clothRed）罩白衬衫（白只露在短袖上）+ 深蓝长裤，右手一串钥匙（亮点）。
//   v1 门童：白礼帽（高帽筒，剪影比谁都高）+ 俱乐部蓝长外套（counter，下摆盖到大腿、长袖）+ 白手套 + 深蓝长裤，空手；默认在挥手。
// 画廊：clubpark.html?asset=valet&v=0|1（&pose=walk&phase=0.3 定格；不给 phase 自动播放；&prop=keys|none）
//
// userData（stage 3 用）：
//   pose(name, phase?)：rig 的 idle / walk / … 加上这里的 wave / usher / handoff（staff/poses.ts）；给 phase = 定格，不给 = 循环播放。
//     wave：左手（本地 +x）0..0.18 举起 → 挥三下 → 0.82..1 放下（一次 2.2 秒）。
//     usher：欠身 + 右手（本地 −x）往外打开"这边请"（开车门、迎客都用），0.3..0.8 停在最开（一次 2.4 秒）。
//     handoff：右手伸到身前胸口高，HANDOFF_AT（0.5）停在最远 → 演出在这一刻 setProp('keys')（接）或 setProp(null)（递）。
//     walk：rig 的走路（0.9 秒一个循环 = 两步）；演出按走的距离推 phase。
//   setProp('keys' | null)：右手的钥匙串（只有这个）；prop() 现在拿着什么。
//   handPoint()：右手拳头的世界坐标（钥匙换手时，另一个人的手对到这里）。
//   update(dt)：idle 呼吸 / 没定格的姿势循环播放。poses：用得上的姿势名（idle / walk / pickup / wave / usher / handoff）。
//   默认：v0 拿着钥匙 idle；v1 空手、wave 循环（从 0.4 开始 → 暂停的截图里手是举着的）。
import * as THREE from 'three';
import { PERSON } from '../../desert3d-v2/assets/player';
import { buildPerson } from '../../desert3d-v2/assets/player/rig';
import type { Pal } from '../palette';
import type { AssetCtx } from '../world';
import { findBones } from './staff/bones';
import { applyStaffPose, STAFF_PERIOD, STAFF_POSES, type StaffPose } from './staff/poses';
import { addCoat, addTopHat, addVest, glove, makeKeys } from './staff/uniform';

type RigBuild = Parameters<typeof buildPerson>[0];

export function build(ctx: AssetCtx): THREE.Object3D {
  const doorman = ctx.variant % 2 === 1;
  const m = (k: keyof Pal) => ctx.mat(k, PERSON);
  const hair = ctx.mat('hair', { ...PERSON, edge: 0.25, convex: 0 });
  const navy = m('signBoard');
  const root = buildPerson(
    ctx as unknown as RigBuild,
    {
      skin: m(doorman ? 'skinDark' : 'skinLight'),
      hair,
      // 门童：躯干 + 短袖都是外套色（长袖、下摆在 uniform.ts 补）
      shirt: doorman ? m('counter') : m('clothWhite'),
      bottom: navy,
      bottomKind: 'pants',
      shoes: hair,
      // 代客的帽子就是 rig 的棒球帽（帽壳 + 朝前的帽舌）
      hairStyle: doorman ? 'short' : 'cap',
      cap: doorman ? undefined : navy,
      // rig 一定要一样 hold：给扫帚（最省），建好就拿掉（这两个人手里只拿钥匙）
      hold: { kind: 'broom', wood: hair, head: hair },
    },
    doorman ? 'doorman' : 'valet',
  );
  const bones = findBones(root);
  // 拿掉 rig 建的扫帚（root 下除 hips 以外的组）
  for (const c of [...root.children]) if (c !== bones.hips && (c as THREE.Group).isGroup) root.remove(c);

  if (doorman) {
    const coat = m('counter');
    addCoat(bones, coat);
    glove(bones, m('clothWhite'));
    addTopHat(bones, ctx.mat('clothWhite', { ...PERSON, lightUp: 0.55, bands: [-0.35, 0.4] }), navy);
  } else {
    addVest(bones, m('clothRed'));
  }
  const keys = makeKeys(
    ctx.mat('signPaint', { ...PERSON, edge: 0.4, convex: 0.3 }),
    ctx.mat('steel', { ...PERSON, edge: 0.4 }),
  );
  bones.armR.hand.add(keys);
  ctx.mats.prepare(root);

  // ── 姿势、道具：包一层 rig 的 userData ──
  const rigPose = root.userData.pose as (n: string, ph?: number) => void;
  const rigUpdate = root.userData.update as (dt: number) => void;
  const rigSetProp = root.userData.setProp as (n: string | null) => void;
  const isStaff = (n: string): n is StaffPose => (STAFF_POSES as readonly string[]).includes(n);

  let staff: StaffPose | null = null;
  let phase = 0;
  let fixed = false;
  let holding: 'keys' | null = null;
  const apply = () => {
    if (!staff) return;
    rigPose('idle', 0);
    applyStaffPose(bones, staff, phase);
  };
  const pose = (n: string, ph?: number) => {
    fixed = ph !== undefined;
    phase = (((ph ?? 0) % 1) + 1) % 1;
    if (isStaff(n)) {
      staff = n;
      apply();
    } else {
      staff = null;
      rigPose(n, ph);
    }
  };
  const setProp = (n: string | null) => {
    holding = n === 'keys' ? 'keys' : null;
    keys.visible = holding === 'keys';
    // rig 那边永远空手（扫帚已经拿掉）；换完按当前姿势重摆
    rigSetProp(null);
    if (staff) apply();
  };

  root.userData.pose = pose;
  // 这两个人用得上的姿势（rig 的挥拍、扫地之类没有道具，pose 还认，但不列出来）
  root.userData.poses = ['idle', 'walk', 'pickup', ...STAFF_POSES];
  root.userData.setProp = setProp;
  root.userData.prop = () => holding;
  root.userData.handPoint = () => {
    root.updateMatrixWorld(true);
    return bones.armR.hand.getWorldPosition(new THREE.Vector3());
  };
  root.userData.update = (dt: number) => {
    if (!staff) {
      rigUpdate(dt);
      return;
    }
    if (fixed) return;
    phase = (phase + dt / STAFF_PERIOD[staff]) % 1;
    apply();
  };

  // 默认：代客拿着钥匙站着；门童在挥手（循环，从举起的手开始，暂停的截图里也是举着手）
  const pq = ctx.params.get('prop');
  setProp(pq !== null ? (pq === 'none' ? null : pq) : doorman ? null : 'keys');
  const poseQ = ctx.params.get('pose');
  const phQ = ctx.params.get('phase');
  if (poseQ !== null) pose(poseQ, phQ !== null ? Number(phQ) : undefined);
  else if (doorman) {
    pose('wave', 0.4);
    fixed = false;
  } else pose('idle', 0);
  return root;
}
