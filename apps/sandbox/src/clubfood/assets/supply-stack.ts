// #15 supply-stack · 补货堆：木箱（箱面上一个图标：杯子 / 面粉袋 / 番茄）+ 冰桶 + 煤气罐。
// 本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头。三角形 ≤ 300（v0 ≈ 260）。
// 变体：
//   v0 大堆（会所东墙下的主补货堆）1.6 × 1.3 × 1.0：一只托盘上 6 只箱（三层）+ 托盘右前一只冰桶（白桶蓝盖）+ 托盘右边一个煤气罐
//   v1 车与车之间：一只箱 + 一个煤气罐（≈ 0.9 × 0.9 × 0.5）
//   v2 车与车之间：两只箱叠着（≈ 0.6 × 0.8 × 0.45）
// userData：
//   setLevel(k)  0..1 存货：v0 的箱子从顶上往下一只只少（k 0 = 只剩空托盘，冰桶、煤气罐不动）；v1 / v2 忽略
//   level        当前的 k
// 箱子：timber / wood 两种木色轮着，箱盖 planks（顺 x 的板条）；朝镜头的箱面在中档（lightUp + 低 bands），
// 图标用 signPaint 的暗档（L 150，比中档木色亮 ≈ 36，不出强边缘）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type Icon = 'cup' | 'flour' | 'tomato' | null;
/** 箱子：[宽, 高, 深, 中心 x, 底 y, 中心 z, 图标, 木色 0 = timber / 1 = wood] */
type Crate = [number, number, number, number, number, number, Icon, 0 | 1];

const PALLET_H = 0.14;
const L1 = PALLET_H;
const L2 = L1 + 0.38;
const L3 = L2 + 0.38;

/** v0：顺序 = 留得最久的在前（setLevel 从后往前拿掉） */
const BIG: Crate[] = [
  [0.56, 0.38, 0.42, -0.49, L1, 0.22, 'cup', 0],
  [0.56, 0.38, 0.42, -0.47, L1, -0.24, null, 1],
  [0.5, 0.38, 0.42, 0.1, L1, -0.22, null, 0],
  [0.56, 0.38, 0.42, -0.46, L2, -0.1, 'flour', 1],
  [0.5, 0.36, 0.42, 0.09, L2, -0.17, 'tomato', 0],
  [0.48, 0.36, 0.4, -0.3, L3, -0.2, 'cup', 1],
];
/** v0 的冰桶（放在托盘右前）、煤气罐（托盘右边，整个露出来） */
const COOLER: [number, number, number] = [0.1, L1, 0.23];
const GAS_V0: [number, number] = [0.6, 0.14];
const V1: Crate[] = [[0.56, 0.4, 0.44, -0.24, 0, 0.04, 'flour', 0]];
const V2: Crate[] = [
  [0.58, 0.4, 0.44, 0, 0, 0.02, 'tomato', 1],
  [0.5, 0.38, 0.4, 0.05, 0.4, -0.03, 'cup', 0],
];

const flat = (g: THREE.BufferGeometry) => {
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
};

/** 图标（朝 +z 的平面，中心在原点，约 0.26 见方） */
function iconGeo(kind: Exclude<Icon, null>): THREE.BufferGeometry {
  const V = (x: number, y: number) => new THREE.Vector2(x, y);
  let pts: THREE.Vector2[];
  if (kind === 'cup') {
    // 外带杯：上宽下窄的梯形 + 顶上一条宽一点的杯盖
    pts = [
      V(-0.08, -0.13),
      V(0.08, -0.13),
      V(0.11, 0.07),
      V(0.13, 0.07),
      V(0.13, 0.13),
      V(-0.13, 0.13),
      V(-0.13, 0.07),
      V(-0.11, 0.07),
    ];
  } else if (kind === 'flour') {
    // 面粉袋：胖袋身 + 收口 + 扎起来的一撮
    pts = [
      V(-0.12, -0.13),
      V(0.12, -0.13),
      V(0.13, 0.03),
      V(0.05, 0.09),
      V(0.08, 0.14),
      V(-0.08, 0.14),
      V(-0.05, 0.09),
      V(-0.13, 0.03),
    ];
  } else {
    // 番茄：扁圆 + 顶上一个小蒂
    pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      pts.push(V(Math.cos(a) * 0.13, Math.sin(a) * 0.11 - 0.02));
    }
    pts.splice(2, 0, V(0.03, 0.12), V(-0.03, 0.12));
  }
  return new THREE.ShapeGeometry(new THREE.Shape(pts));
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 3;
  const root = new THREE.Group();
  root.name = `supply-stack-v${v}`;

  const SIDE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.3 };
  const crateMat = [ctx.mat('timber', { ...SIDE, edge: 0.5 }), ctx.mat('wood', { ...SIDE, edge: 0.5 })];
  const lidMat = ctx.mat('timber', {
    noShadowReceive: true,
    convex: 0.2,
    edge: 0.4,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.27], seam: 1, hi: 0.6 },
  });
  // 图标：signPaint 的暗档（永远暗档）—— 箱面中档 L ≈ 114，图标 L ≈ 150
  const iconMat = ctx.mat('signPaint', { noShadowReceive: true, bands: [2, 3], convex: 0, edge: 0.1 });

  const crates = v === 0 ? BIG : v === 1 ? V1 : V2;
  // 每只箱子各材质的几何，按顺序合并；offsets[m][i] = 前 i 只箱子用掉的顶点数（setLevel 用 drawRange 截断）
  const parts: THREE.BufferGeometry[][] = [[], [], [], []]; // timber 箱身、wood 箱身、箱盖、图标
  const offsets: number[][] = [[0], [0], [0], [0]];
  const rj = ctx.rng(`supply-stack:${v}`);
  for (const [w, h, d, x, y, z, icon, wood] of crates) {
    parts[wood].push(flat(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)));
    // 箱盖：比箱身小一圈（四周一纹素的箱沿），略高
    parts[2].push(
      flat(new THREE.PlaneGeometry(w - 0.06, d - 0.06).rotateX(-Math.PI / 2).translate(x, y + h + 0.006, z)),
    );
    if (icon) {
      const ox = (rj() - 0.5) * 0.06;
      parts[3].push(flat(iconGeo(icon).translate(x + ox, y + h * 0.5, z + d / 2 + 0.006)));
    }
    for (let m = 0; m < 4; m++) offsets[m].push(parts[m].reduce((n, g) => n + g.getAttribute('position').count, 0));
  }
  const mats = [crateMat[0], crateMat[1], lidMat, iconMat];
  const crateMeshes: (THREE.Mesh | null)[] = parts.map((list, m) => {
    if (!list.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(list), mats[m]);
    mesh.name = ['crates-timber', 'crates-wood', 'crate-lids', 'crate-icons'][m];
    root.add(mesh);
    return mesh;
  });

  // ── 托盘（v0）、冰桶（v0）、煤气罐（v0 / v1）──────────────────────
  if (v === 0) {
    const pallet = new THREE.Mesh(
      flat(new THREE.BoxGeometry(1.2, PALLET_H, 0.95).translate(-0.2, PALLET_H / 2, 0)),
      ctx.mat('woodWeathered', {
        ...SIDE,
        edge: 0.5,
        elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.2], seam: 1, hi: 0 },
      }),
    );
    pallet.name = 'pallet';
    root.add(pallet);

    // 冰桶：白桶身 + 蓝盖（盖朝天 = 亮档蓝，桶身朝镜头 = 中档白）
    const [cx, cy, cz] = COOLER;
    const body = new THREE.Mesh(
      flat(new THREE.BoxGeometry(0.42, 0.32, 0.36).translate(cx, cy + 0.16, cz)),
      ctx.mat('clothWhite', { ...SIDE, edge: 0.5 }),
    );
    body.name = 'cooler';
    const lid = new THREE.Mesh(
      flat(new THREE.BoxGeometry(0.46, 0.09, 0.4).translate(cx, cy + 0.32 + 0.045, cz)),
      ctx.mat('accRecycle', { ...SIDE, lightUp: 0.3, edge: 0.4 }),
    );
    lid.name = 'cooler-lid';
    root.add(body, lid);
  }
  if (v === 0 || v === 1) {
    const [gx, gz] = v === 0 ? GAS_V0 : [0.36, -0.04];
    root.add(gasTank(ctx, gx, gz, SIDE));
  }

  // ── setLevel：v0 的箱子从顶上往下少 ─────────────────────────
  let level = 1;
  const setLevel = (k: number) => {
    level = Math.min(1, Math.max(0, k));
    root.userData.level = level;
    if (v !== 0) return;
    const n = Math.ceil(level * crates.length - 1e-6);
    crateMeshes.forEach((mesh, m) => {
      if (!mesh) return;
      mesh.geometry.setDrawRange(0, offsets[m][n]);
      mesh.visible = offsets[m][n] > 0;
    });
  };
  root.userData.setLevel = setLevel;
  root.userData.level = level;
  // 画廊：?level=0..1
  const lv = ctx.params.get('level');
  if (lv !== null) setLevel(Number(lv));

  ctx.mats.prepare(root);
  return root;
}

/** 煤气罐：红罐身（车削：直筒 + 圆肩）+ 顶上一圈银色护圈（阀门），直径 0.34、高 0.86 */
function gasTank(
  ctx: AssetCtx,
  x: number,
  z: number,
  side: { lightUp: number; bands: [number, number]; noShadowReceive: boolean; convex: number },
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'gas';
  const prof = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.15, 0),
    new THREE.Vector2(0.17, 0.05),
    new THREE.Vector2(0.17, 0.6),
    new THREE.Vector2(0.13, 0.72),
    new THREE.Vector2(0.001, 0.76),
  ];
  const tank = new THREE.Mesh(
    flat(new THREE.LatheGeometry(prof, 8).translate(x, 0, z)),
    ctx.mat('flowerRed', { ...side, edge: 0.5 }),
  );
  tank.name = 'gas-tank';
  // 护圈（真罐子顶上那一圈带提手的环）：银，直径 0.24（≈ 3 纹素）
  const collar = new THREE.Mesh(
    flat(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8).translate(x, 0.76 + 0.03, z)),
    ctx.mat('carSilver', { ...side, convex: 0.2, edge: 0.5 }),
  );
  collar.name = 'gas-valve';
  g.add(tank, collar);
  return g;
}
