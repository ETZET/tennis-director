// 练习墙（打墙）：一面 9 × 3 × 0.4 米的灰泥墙，正面朝南（+z，朝镜头）。
// 正面：一条 0.91 米高的白线（网高）+ 线上面正中一块深一级的方框（打墙的目标）+ 几条竖的分格缝（灰泥墙的伸缩缝）；
// 墙顶一条浅色压顶（俯视是一条亮唇）；墙脚散落几个网球（≥ 2 纹素）。本地原点 = 墙脚中心的地面。
// 太阳在画面后方 → 朝镜头的立面本来是暗档：墙身用 lightUp + 低 bands 落中档（读得出是一面浅色的墙，不是一块黑），
// 方框用同一种灰泥但压到中档的"低一级"（元素 toneW [0, 1]：比墙身暗 ≈ 25，不出强边缘）。
// 小道具、贴在墙面上的薄片（白线、方框）不接投影。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
/** 竖直方向一个设计纹素行（米）：0.09 / cos45 */
const VROW = T / Math.SQRT1_2;

/** 朝镜头的立面：光往上偏、阈值往下挪 → 中档 */
const FACE = { lightUp: 0.6, bands: [-0.5, 0.3] as [number, number] };

/** 盒子：中心 (x, y, z) */
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'hit-wall';
  const W = 9;
  const H = 3;
  const D = 0.4;
  const capH = VROW; // 压顶正面一行
  const wallH = H - capH;

  // ── 墙身：分成 5 块墙板（每块之间一纹素的缝，缝里退进去 0.06 → 正面一条暗竖线）──
  const panels = 5;
  const pw = W / panels;
  const wall: THREE.BufferGeometry[] = [];
  for (let i = 0; i < panels; i++) {
    const x = -W / 2 + pw * (i + 0.5);
    wall.push(box(pw - T, wallH, D, x, wallH / 2, 0));
  }
  // 墙板：灰泥，几大块补过的浅斑（Voronoi 大块、没缝没亮边，只取"高一级"：低一级留给目标方框，不然方框和斑混在一起）
  // —— 大面安静，加上方框、白线一共三个颜色。（漆面 paint 的斑块按世界 xz 取，在竖墙上会拉成竖条，不用）
  g.add(
    new THREE.Mesh(
      mergeGeometries(wall),
      ctx.mat('adobe', {
        ...FACE,
        noShadowReceive: true,
        elem: { kind: 'stones', size: [28, 12], seam: 0, hi: 0, seed: 6 },
        toneW: [0.3, 0],
      }),
    ),
  );
  // 缝的底子（退进去的一条，比正面靠后 0.06）：崖壁那一家的中档，比墙身暗 ≈ 45 → 一纹素的竖缝读得出、不出强边缘
  g.add(
    new THREE.Mesh(
      box(W - 0.02, wallH, D - 0.12, 0, wallH / 2, -0.06),
      ctx.mat('bluff', { ...FACE, noShadowReceive: true, edge: 0.05, convex: 0 }),
    ),
  );

  // ── 压顶：比墙每边宽出 0.045，顶面是亮唇（cap 的陶色压顶太红，这里用浅灰的 curb）──
  g.add(new THREE.Mesh(box(W + 0.09, capH, D + 0.09, 0, wallH + capH / 2, 0), ctx.mat('curb', FACE)));

  // ── 目标方框：网线上面正中，2.7 × 1.4 米（30 纹素 × 11 行），贴在墙面前 0.02 ──
  const zf = D / 2 + 0.02;
  const lineY = 0.91;
  const lineH = VROW; // 一行（0.127 米）：读得出的最细
  const tw = 2.7;
  const tb = lineY + lineH + 2 * VROW;
  const th = 11 * VROW;
  g.add(
    new THREE.Mesh(
      box(tw, th, 0.02, 0, tb + th / 2, zf),
      ctx.mat('adobe', {
        ...FACE,
        noShadowReceive: true,
        // 一整块 Voronoi"石"（块比方框大、没缝没亮边）+ toneW [0, 1]：全部取本档的"低一级" = 深一级的一块
        elem: { kind: 'stones', size: [80, 40], seam: 0, hi: 0 },
        toneW: [0, 1],
      }),
    ),
  );

  // ── 白线（网高）：整面墙一条，1 行高；白色在立面上也要读得出 → 阈值挪到它落亮档 ──
  const white: THREE.BufferGeometry[] = [box(W - 0.02, lineH, 0.02, 0, lineY + lineH / 2, zf)];
  // 方框的白边：上沿、两侧各一纹素（下沿就是网线上面空出的两行）
  white.push(box(tw + 2 * T, lineH, 0.02, 0, tb + th + lineH / 2, zf + 0.005));
  for (const sx of [-1, 1])
    white.push(box(T, th + lineH, 0.02, sx * (tw / 2 + T / 2), tb + (th + lineH) / 2, zf + 0.005));
  g.add(
    new THREE.Mesh(
      mergeGeometries(white),
      ctx.mat('line', { lightUp: 0.6, bands: [-0.9, -0.5], noShadowReceive: true, edge: 0.05, convex: 0 }),
    ),
  );

  // ── 墙脚的网球：5 个，按纹素取整摆，半径 0.09（2 纹素直径）──
  const rnd = ctx.rng(`hit-wall:${ctx.variant}`);
  const balls: THREE.BufferGeometry[] = [];
  const spots: [number, number][] = [
    [-3.1, 0.55],
    [-2.5, 0.85],
    [-0.4, 0.5],
    [1.9, 0.7],
    [3.6, 1.25],
  ];
  for (const [bx, bz] of spots) {
    const x = Math.round((bx + (rnd() - 0.5) * 0.6) / T) * T;
    const z = Math.round((bz + (rnd() - 0.5) * 0.3) / T) * T;
    balls.push(new THREE.IcosahedronGeometry(0.1, 1).translate(x, 0.1, D / 2 + z));
  }
  g.add(
    new THREE.Mesh(
      mergeGeometries(balls),
      ctx.mat('ball', { lightUp: 0.5, bands: [-0.3, 0.3], noShadowReceive: true }),
    ),
  );

  ctx.mats.prepare(g);
  return g;
}
