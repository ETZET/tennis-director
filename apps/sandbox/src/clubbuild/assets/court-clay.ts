// court-clay：红土球场（6 × 12 格 = 18 × 36 米），和硬地同一个摆法，一眼分得开：整片砖红 + 胶带白线 + 一圈深绿挡风布。
// 拼的（只读 import 现成的）：
//   场面 = clubclay 的红土 shader（courts-common 的 claySurface：'normal' 预设、胶带线、线宽按屏幕纹素取整），35.6 × 17.6 米，转 90°；
//   围网 = clubdesk 的 fence-screen（buildFences：柱 + 顶杆 + 一兜一兜的深绿挡风布），2.6 米高，前边门格 col 3 留 2 米的门；
//   网 = clubsite 的 court-net；灯杆 = clubsite 的 court-light ×2；裁判椅、长椅 ×2 = clubsite 的；
//   场边一把蓝白遮阳伞 = clubclay 的 court-umbrella（v1 转半片），长椅上头。
// 本地原点 = 占地中心，+z 朝镜头（门在前边）。
import * as THREE from 'three';
import { build as courtUmbrella } from '../../clubclay/assets/court-umbrella';
import { buildFences, type FenceRun } from '../../clubdesk/assets/fence-screen';
import type { AssetCtx as DeskCtx } from '../../clubdesk/ctx';
import type { AssetBuild, AssetCtx } from '../ctx';
import { bakeStatic, claySurface, face, put, REUSE, rectRuns } from './courts-common';

const HW = 9;
const HD = 18;
const FW = HW - 0.2;
const FD = HD - 0.2;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'court-clay';

  // 场面：长边本来沿 x → 转 90°
  const surf = claySurface(ctx, 2 * FD, 2 * FW);
  surf.rotation.y = Math.PI / 2;
  root.add(surf);

  // 挡风布围网：fence-screen 的段在"世界"坐标里建，这里就是设施的本地坐标（建好的对象放在原点、不再平移）
  const runs: FenceRun[] = rectRuns(FW, FD, 2.6, 1.5, 2.0).map((r) => ({ ...r }));
  root.add(buildFences(ctx as unknown as DeskCtx, runs));

  put(ctx, root, REUSE.courtNet, 0, 0, Math.PI / 2);
  for (const [x, z] of [
    [-FW + 0.35, -7],
    [FW - 0.35, 7],
  ]) {
    put(ctx, root, REUSE.courtLight, x, z, face(-x, -z));
  }
  // 裁判椅、长椅 ×2、长椅北头的遮阳伞（⌀ 2.4：伞面伸进外场，不出围网）：静态的按材质合并
  bakeStatic(root, [
    put(ctx, root, REUSE.umpireChair, 7.5, 0.6, face(-1, 0)),
    put(ctx, root, REUSE.bench, -7.9, 1.6, face(1, 0), 0),
    put(ctx, root, REUSE.bench, -7.9, -1.6, face(1, 0), 1),
    put(ctx, root, courtUmbrella as unknown as AssetBuild, -7.6, -3.6, 0, 1),
  ]);
  return root;
}
