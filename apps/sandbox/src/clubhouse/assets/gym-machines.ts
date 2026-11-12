// gym-machines · 器械循环的一排三台插片式器械（B1，两排各一件，slots-b1 的 gym-machines-1/2）。
// 尺寸：4.32 × 1.80 × 1.44 米（48 × 20 × 16 纹素，w × h × d）；规格 4.4 × 1.7 × 1.4。坐的人脸朝 +z（镜头）。
// 从西到东：倒蹬（坐得低、靠背后仰、前面一块立着的脚踏板，青绿垫）、坐姿推胸（直靠背 + 两侧往前伸的推臂和握把，seat 绿垫）、
//   高位下拉（膝垫横辊 + 头顶往前伸的吊臂、吊着一根宽横杆，红垫）。
// 三台共用一副灰钢架：地上一根通长的深色包胶底梁，背后三座配重塔（两根立柱 + 中间深色的片 + 顶上一块亮压板）由一根顶梁连着；
//   顶梁在每座塔上那一段刷成这台的垫子颜色（一眼分得出三台）。
// 元素：垫子、钢架 `paint`（低频深浅块）。底梁包胶（和配重片同一个深靛色）。
// 三角形：43 个盒子，去掉底面（看不见）× 10 = 430（预算 700）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, edge: 0.3 };
  const steel = ctx.mat('metal', {
    ...face,
    ramp: [0xa8baf6, 0x7686d2, 0x40449a],
    convex: 0.25,
    elem: { kind: 'paint', size: [8, 5], density: [0, 0.02], patch: 2 },
  });
  const stackM = ctx.mat('ironwork', { ...face, ramp: [0x7c6cc2, 0x5c4ca2, 0x3c2e7a], convex: 0.2 });
  const plateM = ctx.mat('signPaint', { noShadowReceive: true, edge: 0.3, convex: 0.3 });
  const gripM = ctx.mat('ironwork', { ...face, ramp: [0x6c5ab0, 0x4e3e8e, 0x342a6a], convex: 0.2 });
  /** 软包：比调色板的布面再饱和一点（器械的人造革） */
  const pad = (key: 'clothTeal' | 'seat' | 'clothRed', ramp: [number, number, number]) =>
    ctx.mat(key, { ...face, ramp, convex: 0.25, elem: { kind: 'paint', size: [6, 4], density: [0, 0.03], patch: 2 } });
  const teal = pad('clothTeal', [0x2ccab2, 0x16989a, 0x1a5480]);
  const green = pad('seat', [0x5ad468, 0x2ca05e, 0x1c5c66]);
  const red = pad('clothRed', [0xf4523e, 0xc42e42, 0x6a1e54]);

  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const l = parts.get(m) ?? [];
    l.push(g);
    parts.set(m, l);
  };
  /** 盒子（纹素坐标的最小 / 最大），去掉底面 */
  const geo = (w: number, h: number, d: number) => {
    const g = new THREE.BoxGeometry(w * T, h * T, d * T);
    const idx = Array.from(g.index!.array);
    idx.splice(18, 6);
    g.setIndex(idx);
    g.clearGroups();
    return g;
  };
  const b = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    put(m, geo(x1 - x0, y1 - y0, z1 - z0).translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, ((z0 + z1) / 2) * T));
  /** 斜放的垫子 / 板：底边前沿在 (x, y, z)，往后仰 tilt 弧度 */
  const tilted = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, tilt: number) =>
    put(
      m,
      geo(w, h, d)
        .translate(0, (h / 2) * T, (-d / 2) * T)
        .rotateX(-tilt)
        .translate(x * T, y * T, z * T),
    );

  // ── 共用的钢架 ──
  b(stackM, -24, 24, 0, 1, -8, -4); // 通长底梁（包胶的深色）
  const C = [-16, 0, 16];
  const tint = [teal, green, red];
  C.forEach((c, i) => {
    b(steel, c - 4, c - 2, 0, 18, -8, -5); // 立柱
    b(steel, c + 2, c + 4, 0, 18, -8, -5);
    b(stackM, c - 2, c + 2, 1, 16, -7, -5); // 配重片
    b(plateM, c - 2, c + 2, 16, 17, -7, -5); // 顶压板
    b(tint[i], c - 4, c + 4, 18, 20, -8, -5); // 顶梁上这台的那一段
  });
  b(steel, -12, -4, 18, 20, -8, -5);
  b(steel, 4, 12, 18, 20, -8, -5);

  // ── 倒蹬（西，青绿）：低座 + 后仰靠背 + 前面立着的脚踏板 ──
  {
    const c = C[0];
    b(steel, c - 2, c + 2, 0, 2, -5, 8); // 座下的滑轨，一直伸到脚踏板
    b(teal, c - 4, c + 4, 2, 5, -2, 3); // 座
    tilted(teal, 8, 7, 2, c, 4, -2, 0.42); // 靠背
    tilted(steel, 8, 5, 1, c, 2, 8, 0.25); // 脚踏板
    b(gripM, c - 6, c - 4, 3, 6, 0, 2); // 两侧握把
    b(gripM, c + 4, c + 6, 3, 6, 0, 2);
  }
  // ── 坐姿推胸（中，绿）：直靠背 + 两侧往前伸的推臂 ──
  {
    const c = C[1];
    b(steel, c - 2, c + 2, 0, 1, -5, 5); // 地上的座架
    b(steel, c - 1, c + 1, 1, 2, 0, 2); // 座柱
    b(green, c - 4, c + 4, 2, 5, -1, 4); // 座
    b(green, c - 4, c + 4, 6, 15, -3, -1); // 靠背
    b(steel, c - 1, c + 1, 5, 12, -5, -3); // 靠背后面的撑
    b(steel, c - 7, c - 5, 10, 12, -5, 3); // 推臂
    b(steel, c + 5, c + 7, 10, 12, -5, 3);
    b(gripM, c - 7, c - 5, 8, 13, 3, 5); // 握把（竖的）
    b(gripM, c + 5, c + 7, 8, 13, 3, 5);
  }
  // ── 高位下拉（东，红）：膝垫横辊 + 头顶吊臂 + 宽横杆 ──
  {
    const c = C[2];
    b(steel, c - 2, c + 2, 0, 1, -5, 6); // 地上的座架
    b(steel, c - 1, c + 1, 1, 2, 0, 2); // 座柱
    b(red, c - 4, c + 4, 2, 5, -1, 3); // 座
    b(steel, c - 1, c + 1, 1, 7, 4, 5); // 膝垫柱
    b(red, c - 5, c + 5, 7, 9, 3, 6); // 膝垫横辊
    b(steel, c - 2, c + 2, 18, 20, -5, 2); // 吊臂
    b(gripM, c - 1, c, 15, 18, 1, 2); // 钢索
    b(steel, c - 7, c + 7, 14, 15, 0, 2); // 横杆
    b(gripM, c - 7, c - 5, 12, 14, 0, 2); // 横杆两头往下弯的握把
    b(gripM, c + 5, c + 7, 12, 14, 0, 2);
  }

  const root = new THREE.Group();
  for (const [m, gs] of parts) root.add(new THREE.Mesh(mergeGeometries(gs), m));
  ctx.mats.prepare(root);
  return root;
}
