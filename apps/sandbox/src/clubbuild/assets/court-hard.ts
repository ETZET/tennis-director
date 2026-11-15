// court-hard：硬地球场（6 × 12 格 = 18 × 36 米）。开罗式的"一块"：远看就是一片青蓝内场 + 绿外场 + 一纹素白线 + 一圈铁丝网。
// 拼的（只读 import 现成的）：
//   场面 = clubcourts 的 hard-court（buildHardCourt：干净的新漆、线宽按屏幕纹素取整），35.6 × 17.6 米，转 90° 让长边沿 z；
//   网 = clubsite 的 court-net（本来沿 z，转 90° 横过场地）；灯杆 = clubsite 的 court-light ×2（对角，灯头对着场心）；
//   裁判椅（东边网旁，朝西）、长椅 ×2（西边网旁，朝东）= clubsite 的。
// 新画的：铁丝网围栏（courts-common 的 chainFence：柱 + 顶杆 + 屏幕纹素斜格子网面），前边（+z）门格 col 3 留 2 米的门。
// 本地原点 = 占地中心，+z 朝镜头（门在前边）。
import * as THREE from 'three';
import { buildHardCourt, type HardCtx } from '../../clubcourts/assets/hard-court';
import type { AssetCtx } from '../ctx';
import { bakeStatic, chainFence, face, put, REUSE, rectRuns } from './courts-common';

/** 占地半宽、半深（米） */
const HW = 9;
const HD = 18;
/** 围网离占地边 0.2 米 */
const FW = HW - 0.2;
const FD = HD - 0.2;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'court-hard';

  // 场面：长边本来沿 x → 转 90°
  const surf = buildHardCourt(ctx as unknown as HardCtx, { w: 2 * FD, d: 2 * FW, preset: 'clean', open: [] });
  surf.rotation.y = Math.PI / 2;
  root.add(surf);

  // 围网：3 米高；门在前边 col 3（x 0..3 的中间）
  root.add(chainFence(ctx, rectRuns(FW, FD, 3.0, 1.5, 2.0)));

  // 网：横过场地（court-net 沿本地 z）
  put(ctx, root, REUSE.courtNet, 0, 0, Math.PI / 2);

  // 灯杆：西北、东南两个角（落在场边外场上，竖起来只盖住边上的外场）
  for (const [x, z] of [
    [-FW + 0.35, -7],
    [FW - 0.35, 7],
  ]) {
    put(ctx, root, REUSE.courtLight, x, z, face(-x, -z));
  }

  // 裁判椅：东边网柱外，朝西；长椅：西边网旁两张，朝东（三件静态的按材质合并）
  bakeStatic(root, [
    put(ctx, root, REUSE.umpireChair, 7.5, 0.6, face(-1, 0)),
    put(ctx, root, REUSE.bench, -7.9, 1.6, face(1, 0), 0),
    put(ctx, root, REUSE.bench, -7.9, -1.6, face(1, 0), 1),
  ]);
  return root;
}
