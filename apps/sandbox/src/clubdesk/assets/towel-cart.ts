// #4 毛巾车（clubdesk.md）：两层木推车 + 4 个胖轮子 + 铜把手。上层是敞口的托盘，卷毛巾堆成两层（4 + 3，
// 从上面看是一条条白/蓝相间的卷）；下层一排卷毛巾端头朝镜头（白蓝交替）；东头一叠叠好的条纹毛巾，最上面那条垂下前沿。
// 放在凉棚的投影池里（世界 53.45, 8.7），总监从东头拿毛巾（站位 towels）。
// 本地原点 = 脚印中心，+z 朝镜头，长边沿 x（1.2 × 1.1 × 0.6 米）。
// 在投影池里 → 不关受影（noShadowReceive 会让它在影子里发亮）。朝镜头的竖面不加 lightUp：背着太阳的面一律落暗档，
// 投影里外一样（木头用 planks 元素，暗档那套里板缝和深浅还在）。
// userData：
//   setStock(n)  架上还剩几卷（0..9；从上层的上面那层东头开始拿），返回实际的数
//   stock        现在的卷数
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { box, cyl, DT, Parts } from './props/kit';

const W = 1.2;
const D = 0.6;
const R = 0.1; // 卷毛巾半径（直径 0.2 ≈ 1× 下 4～5 纹素）
const LEN = 0.5; // 卷毛巾长（沿 z）

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  const frame = ctx.mat('timber', { elem: { kind: 'planks', p: [1, 0, 0, 0.3], seam: 1, hi: 1 } });
  // 背板：竖板（每块 0.21 米），是下层卷毛巾后面的深色底
  const back = ctx.mat('timber', { elem: { kind: 'planks', p: [1, 0, 0, 0.21], seam: 1, hi: 1 } });
  const iron = ctx.mat('ironwork');
  const brass = ctx.mat('brass', { lightUp: 0.3 });
  const white = ctx.mat('clothWhite');
  // canvasStripe 在调色板里是"薄片不受影"，这里要受凉棚的影
  const blue = ctx.mat('canvasStripe', { noShadowReceive: false, lightUp: 0.25, bands: [0.05, 0.5] });

  const p = new Parts();
  // ── 木架：底层板、上层托盘、两头侧板（高出托盘 1 纹素当挡边）、下层背板 ──
  const yLo = 0.36; // 底层板面
  const yHi = 0.72; // 上层托盘面
  p.add(frame, box(W, 0.12, D, 0, yLo - 0.06, 0)); // 底层板 0.24..0.36
  p.add(frame, box(W - 4 * DT, DT, D, 0, yHi - DT / 2, 0)); // 上层托盘 0.63..0.72
  for (const sx of [-1, 1]) p.add(frame, box(2 * DT, yHi + DT - yLo, D, sx * (W / 2 - DT), (yLo + yHi + DT) / 2, 0));
  p.add(frame, box(W - 4 * DT, DT, DT, 0, yHi + DT / 2, -D / 2 + DT / 2)); // 托盘后挡边
  p.add(back, box(W - 4 * DT, yHi - DT - yLo, 0.06, 0, (yLo + yHi - DT) / 2, -D / 2 + 0.03)); // 下层背板
  // ── 轮子：盘面朝镜头（推的方向沿 x），直径 0.24 ──
  for (const x of [-0.42, 0.42]) for (const z of [-0.21, 0.21]) p.add(iron, cyl(0.12, DT, 10, x, 0.12, z, 'z'));
  // ── 铜把手：西头伸出来的一根横杆 + 两个托（托盘挡边那么高）──
  const yH = yHi + DT / 2;
  for (const z of [-0.18, 0.18]) p.add(brass, box(DT, DT, DT, -W / 2 - DT / 2, yH, z));
  p.add(brass, box(DT, DT, 0.45, -W / 2 - DT * 1.5, yH, 0));
  // ── 东头一叠叠好的毛巾（白 / 蓝条 / 白），最上面那条从前沿垂下来 ──
  const sw = 0.24;
  const sx0 = W / 2 - 2 * DT - sw / 2; // 叠毛巾中心 x（贴着东侧板）
  const sd = 0.4;
  let y = yHi;
  for (const [mat, h] of [
    [white, DT],
    [blue, 0.045],
    [white, DT],
  ] as const) {
    p.add(mat, box(sw, h, sd, sx0, y + h / 2, 0.05));
    y += h;
  }
  const zf = 0.05 + sd / 2 + 0.0225;
  p.add(white, box(sw, y - yHi + DT, 0.045, sx0, (yHi - DT + y) / 2, zf)); // 垂下来的一片：盖住托盘前沿
  p.add(blue, box(sw, DT, 0.045, sx0, yHi - DT - DT / 2, zf)); // 下沿一道蓝
  p.build(root);

  // ── 卷毛巾（实例化，方便一卷卷拿走）：上层托盘 3 + 2 堆（在叠毛巾西边），下层 4 卷 ──
  const roll = cyl(R, LEN, 8, 0, 0, 0, 'z');
  /** 拿的顺序：上层的上面那层 → 上层下面 → 下层，每层从东往西 */
  const slots: { x: number; y: number; z: number; blue: boolean }[] = [];
  const upX = [-0.32, -0.12, 0.08];
  for (const x of [-0.02, -0.22]) slots.push({ x, y: yHi + R + R * 1.7, z: 0.0, blue: x > -0.1 });
  for (let i = upX.length - 1; i >= 0; i--) slots.push({ x: upX[i], y: yHi + R, z: 0.0, blue: i % 2 === 1 });
  const loX = [-0.315, -0.105, 0.105, 0.315];
  for (let i = loX.length - 1; i >= 0; i--) slots.push({ x: loX[i], y: yLo + R, z: 0.04, blue: i % 2 === 0 });
  const nBlue = slots.filter((s) => s.blue).length;
  const rollsW = new THREE.InstancedMesh(roll, white, slots.length - nBlue);
  const rollsB = new THREE.InstancedMesh(roll, blue, nBlue);
  rollsW.frustumCulled = rollsB.frustumCulled = false; // 实例矩阵会变，包围球不跟着更新
  root.add(rollsW, rollsB);
  const m = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const setStock = (n: number) => {
    const stock = Math.max(0, Math.min(slots.length, Math.round(n)));
    const taken = slots.length - stock;
    let iw = 0;
    let ib = 0;
    slots.forEach((s, k) => {
      const mm = k < taken ? zero : m.makeTranslation(s.x, s.y, s.z);
      if (s.blue) rollsB.setMatrixAt(ib++, mm);
      else rollsW.setMatrixAt(iw++, mm);
    });
    rollsW.instanceMatrix.needsUpdate = true;
    rollsB.instanceMatrix.needsUpdate = true;
    root.userData.stock = stock;
    return stock;
  };
  // 变体 1：架上只剩下层（画廊 ?v=1 看缺货的样子）
  setStock(ctx.variant === 1 ? 4 : slots.length);
  root.userData.setStock = setStock;

  ctx.mats.prepare(root);
  return root;
}
