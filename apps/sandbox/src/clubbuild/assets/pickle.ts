// pickle：匹克球场（3 × 7 格 = 9 × 21 米）。远看：绿底上一块天蓝场 + 网两边两条深蓝的厨房（非截击区，借 signBoard 的深蓝）+ 一纹素白线 + 一圈矮铁丝网。
// 拼的（只读 import 现成的）：
//   漆面 = clubcourts 的硬地 shader（courts-common 的 hardSurface）：内场色换成 signBoard（只有厨房那一块）、外场色换成 pickle，
//     线换成匹克球的 8 条（两条底线、两条厨房线、两条边线、两截中线：中线只在厨房线到底线之间）；
//   网 = clubsite 的 pickle-net（转 90° 横过场地）；拍架 = clubsite 的 paddle-rack（前边场外，拍面朝镜头）；长椅 = clubsite 的。
// 新画的：场边一圈绿外场（平的一块 surround）、1.1 米的矮铁丝网（courts-common 的 chainFence），前边门格 col 1（正中）留门。
// 本地原点 = 占地中心，+z 朝镜头。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { bakeStatic, chainFence, flat, hardSurface, type LineDef, put, REUSE, rectRuns } from './courts-common';

const HW = 4.5;
const HD = 10.5;
const FW = HW - 0.2;
const FD = HD - 0.2;
/** 匹克球场：底线到底线、宽、厨房（网两边各多深） */
const L = 13.41;
const W = 6.1;
const NVZ = 2.13;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'pickle';

  // 场边一圈绿（整块占地，压在漆面下面）
  root.add(flat(ctx, 'surround', 2 * FW, 2 * FD));

  // 漆面：本地 x 是长边（建好再转 90°）。场外留 0.9 / 0.6 米的场面色
  const hl = L / 2;
  const hw = W / 2;
  const lines: LineDef[] = [
    { id: 'baseW', kind: 'x', c: -hl, a0: -hw, a1: hw },
    { id: 'baseE', kind: 'x', c: hl, a0: -hw, a1: hw },
    { id: 'nvzW', kind: 'x', c: -NVZ, a0: -hw, a1: hw },
    { id: 'nvzE', kind: 'x', c: NVZ, a0: -hw, a1: hw },
    { id: 'sideN', kind: 'z', c: -hw, a0: -hl, a1: hl },
    { id: 'sideS', kind: 'z', c: hw, a0: -hl, a1: hl },
    { id: 'centerW', kind: 'z', c: 0, a0: -hl, a1: -NVZ },
    { id: 'centerE', kind: 'z', c: 0, a0: NVZ, a1: hl },
  ];
  const surf = hardSurface(ctx, {
    w: L + 1.8,
    d: W + 1.2,
    blue: { hx: NVZ, hz: hw },
    // 厨房借 signBoard（深一级的蓝）：kitchen 不在配色方案的组里，午后金把它调成灰蓝；signBoard 在 club 组，保住饱和度
    keys: { court: 'signBoard', surround: 'pickle' },
    baseKey: 'pickle',
    lines,
    lw: 0.1,
  });
  surf.rotation.y = Math.PI / 2;
  root.add(surf);

  // 矮铁丝网：1.1 米；门在前边正中
  root.add(chainFence(ctx, rectRuns(FW, FD, 1.1, 0, 1.4), { postGap: 2.6 }));

  put(ctx, root, REUSE.pickleNet, 0, 0, Math.PI / 2);
  // 前边场外：拍架（朝镜头）+ 一张长椅
  bakeStatic(root, [put(ctx, root, REUSE.paddleRack, -2.3, 8.7, 0), put(ctx, root, REUSE.bench, 2.4, 8.8, 0)]);
  return root;
}
