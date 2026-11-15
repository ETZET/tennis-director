// practice-wall：练习墙（4 × 3 格 = 12 × 9 米）。北边一堵 10 米宽、2.5 米高的深绿打板墙（3 米的话投影盖住大半块场地）（朝镜头），网高（0.914 米）一道白线，
// 地上一块硬地（青蓝 + 绿边）+ 两条白线（离墙 4.6 米一条底线、一截中线），场边一筐球、一张长椅。
// 拼的（只读 import 现成的）：漆面 = clubcourts 的硬地 shader（courts-common 的 hardSurface）；捡球篮（立着、满筐）、长椅 = clubsite 的。
// 新画的：墙（windscreen 的深绿，每 1.22 米一块板 = planks 的幅）+ 顶上一道钢压顶 + 白线 + 背后三根斜撑。
// 本地原点 = 占地中心，+z 朝镜头（门在前边 col 2）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { bakeStatic, hardSurface, type LineDef, put, REUSE } from './courts-common';

const HW = 6;
const HD = 4.5;
/** 墙：宽、高、厚、正面的 z */
const WALL = { w: 10, h: 2.5, t: 0.24, z: -3.5 };
/** 网高 */
const NET_H = 0.914;

/** 朝镜头的竖直面：光往上偏、档位放宽 → 落中档（太阳在画面后方） */
const FACING = { lightUp: 0.55, bands: [-0.35, 0.45] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'practice-wall';

  // 地面：硬地漆面（内场青蓝、外面一圈绿），线：离墙 4.6 米的底线 + 底线往墙走 2 米的一截中线
  const base = WALL.z + 4.6;
  const lines: LineDef[] = [
    { id: 'base', kind: 'z', c: base, a0: -4.2, a1: 4.2 },
    { id: 'center', kind: 'x', c: 0, a0: base - 2.0, a1: base },
  ];
  root.add(
    hardSurface(ctx, {
      w: 2 * HW - 0.4,
      d: 2 * HD - 0.4,
      blue: { hx: WALL.w / 2, hz: HD - 0.8 },
      keys: { court: 'court', surround: 'surround' },
      lines,
      lw: 0.12,
    }),
  );

  // 墙身：每 1.22 米一块板（planks 沿 x），深绿漆
  const zc = WALL.z - WALL.t / 2;
  const board = new THREE.Mesh(
    box(WALL.w, WALL.h, WALL.t, 0, 0, zc).translate(WALL.w / 2, 0, 0),
    ctx.mat('windscreen', {
      ...FACING,
      elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 1.22], q: [1, 0, 0, 0], seam: 1, hi: 0 },
      toneW: [0.3, 0.3],
    }),
  );
  // 板缝按几何体自己的坐标排：先挪到 x 从 0 起（缝落在板边上），网格再挪回去
  board.position.x = -WALL.w / 2;
  board.name = 'wall-board';
  root.add(board);

  // 网高白线：一条 0.2 米高的漆带，永远落亮档
  const line = new THREE.Mesh(
    box(WALL.w - 0.2, 0.2, 0.02, 0, NET_H - 0.1, WALL.z + 0.01),
    ctx.mat('line', { bands: [-2, -1.5], edge: 0.2, convex: 0, noShadowReceive: true }),
  );
  line.name = 'net-line';
  root.add(line);

  // 钢：顶上压顶 + 两头立柱 + 背后三根斜撑（从墙顶往北落地）
  const steel: THREE.BufferGeometry[] = [box(WALL.w + 0.2, 0.12, WALL.t + 0.16, 0, WALL.h, zc)];
  for (const x of [-WALL.w / 2 - 0.05, WALL.w / 2 + 0.05]) steel.push(box(0.18, WALL.h, WALL.t + 0.1, x, 0, zc));
  const back = -HD + 0.15;
  for (const x of [-3.6, 0, 3.6]) {
    const a = new THREE.Vector3(x, WALL.h * 0.85, WALL.z - WALL.t);
    const b = new THREE.Vector3(x, 0, back);
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.BoxGeometry(0.14, d.length(), 0.14);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    g.translate(m.x, m.y, m.z);
    steel.push(g);
  }
  const steelMesh = new THREE.Mesh(
    mergeGeometries(steel.map((g) => g.toNonIndexed())),
    ctx.mat('metal', { lightUp: 0.5, bands: [-0.3, 0.45] }),
  );
  steelMesh.name = 'wall-steel';
  root.add(steelMesh);
  ctx.mats.prepare(board);
  ctx.mats.prepare(line, { cast: false });
  ctx.mats.prepare(steelMesh);

  // 场边：一筐球（门边）+ 一张长椅（西南角）
  bakeStatic(root, [put(ctx, root, REUSE.ballHopper, 3.4, 2.6, 0, 1), put(ctx, root, REUSE.bench, -4.4, 3.4, 0)]);
  return root;
}
