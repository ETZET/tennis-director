// 地毯（会员休息室，壁炉前）：西班牙几何纹的羊毛地毯。4.6 × 0.06 × 3.6 米（51 × 40 设计纹素，含两头的流苏）。
// 平铺的几层平面（每层抬 4 毫米，最上层顶 y 0.056；slot 的 y 是楼板 +0.02 → 顶在楼板面 +0.05 以上）：
//   赭色外边 1 纹素 → 靛蓝边带 6 纹素（带上 8 个赭色菱形）→ 赭色内边 1 纹素 → 红地（clothRed）→ 四角金色三角 →
//   中间金菱形 18 × 16 纹素 → 红菱形 → 靛蓝菱心。两头（短边，±x）2 纹素长的奶油色流苏，每两屏幕行一根（alphaMap 镂空）。
// 相邻两色亮度差都 < 60（强边缘预算）：靛 ≈ 98、赭 ≈ 155、红 ≈ 125、金 ≈ 182、流苏 ≈ 210（调色后）。
// 元素：红地、靛带 paint（8 × 6 纹素的羊毛深浅块）。三角形 38。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type V2 = [number, number];

/** 水平的多边形（凸，按顺序给 xz），y 高 */
function flat(pts: V2[], y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++) {
    for (const p of [pts[0], pts[i + 1], pts[i]]) pos.push(p[0], y, p[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i], pos[i + 2]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
const rect = (x0: number, z0: number, x1: number, z1: number, y: number) =>
  flat(
    [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ],
    y,
  );
const diamond = (cx: number, cz: number, hx: number, hz: number, y: number) =>
  flat(
    [
      [cx, cz - hz],
      [cx + hx, cz],
      [cx, cz + hz],
      [cx - hx, cz],
    ],
    y,
  );

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => {
    const mesh = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m);
    mesh.castShadow = false;
    g.add(mesh);
  };
  const flatOpts = { edge: 0.05, convex: 0, tones: undefined };
  const wool = {
    kind: 'paint' as const,
    size: [8, 6] as [number, number],
    density: [0, 0] as [number, number],
    patch: 2,
  };

  const FR = 2 * T; // 流苏长
  const HX = 2.3 - FR; // 毯身半宽（x）
  const HZ = 1.8; // 半深（z）
  const Y = [0.036, 0.04, 0.044, 0.048, 0.052, 0.056];

  // 赭色：外边 + 内边 + 边带上的菱形
  const ochre = ctx.mat('cap', { ...flatOpts, ramp: [0xd08a48, 0xa8645a, 0x6a4470] });
  // 靛蓝边带
  const indigo = ctx.mat('clothBlue', {
    ...flatOpts,
    ramp: [0x4656b0, 0x3a4890, 0x2a3066],
    elem: { ...wool, seed: 3 },
    tones: {
      bands: [
        [0x4656b0, 0x4e5eba, 0x404ea4],
        [0x3a4890, 0x425098, 0x344286],
        [0x2a3066, 0x303670, 0x262c5e],
      ],
      seam: [0x3a4896, 0x303c7e, 0x222858],
      hi: [0x5868c4, 0x4858a2, 0x363c7a],
    },
  });
  // 红地
  const red = ctx.mat('clothRed', {
    ...flatOpts,
    ramp: [0xf4566c, 0xb83a56, 0x642660],
    elem: { ...wool, seed: 7 },
    tones: {
      bands: [
        [0xf4566c, 0xfa6074, 0xea4c62],
        [0xb83a56, 0xc2445e, 0xac3450],
        [0x642660, 0x6c2c68, 0x5c2258],
      ],
      seam: [0xd04258, 0x9c3248, 0x541e56],
      hi: [0xff6a7c, 0xcc4c62, 0x742e70],
    },
  });
  // 金：中间菱形、四角三角
  const gold = ctx.mat('flowerYellow', { ...flatOpts, ramp: [0xe4a844, 0xc0803e, 0x7a4c5c] });

  const x0 = -HX;
  const x1 = HX;
  const z0 = -HZ;
  const z1 = HZ;
  // 外边（赭）→ 靛带 → 内边（赭）→ 红地
  const b1 = T; // 外边宽
  const b2 = 7 * T; // 靛带内沿
  const b3 = 8 * T; // 红地内沿
  const ochreG = [rect(x0, z0, x1, z1, Y[0]), rect(x0 + b2, z0 + b2, x1 - b2, z1 - b2, Y[2])];
  // 边带上的赭色菱形（6 × 6 纹素，尖碰到内外两条边 = 一串菱形链）：长边 3 个，短边各 1 个（6 × 8，z 在屏幕上压成 0.7）
  const mid = (b1 + b2) / 2;
  for (const x of [-1.5, 0, 1.5]) {
    ochreG.push(diamond(x, z0 + mid, 3 * T, 3 * T, Y[2]));
    ochreG.push(diamond(x, z1 - mid, 3 * T, 3 * T, Y[2]));
  }
  ochreG.push(diamond(x0 + mid, 0, 3 * T, 4 * T, Y[2]));
  ochreG.push(diamond(x1 - mid, 0, 3 * T, 4 * T, Y[2]));
  add(ochreG, ochre);
  add([rect(x0 + b1, z0 + b1, x1 - b1, z1 - b1, Y[1])], indigo);
  add([rect(x0 + b3, z0 + b3, x1 - b3, z1 - b3, Y[3])], red);

  // 金：中间大菱形 + 四角三角（7 × 6 纹素）
  const fx0 = x0 + b3;
  const fx1 = x1 - b3;
  const fz0 = z0 + b3;
  const fz1 = z1 - b3;
  const cx = 7 * T;
  const cz = 6 * T;
  add(
    [
      diamond(0, 0, 9 * T, 8 * T, Y[4]),
      flat(
        [
          [fx0, fz0],
          [fx0 + cx, fz0],
          [fx0, fz0 + cz],
        ],
        Y[4],
      ),
      flat(
        [
          [fx1, fz0],
          [fx1, fz0 + cz],
          [fx1 - cx, fz0],
        ],
        Y[4],
      ),
      flat(
        [
          [fx0, fz1],
          [fx0, fz1 - cz],
          [fx0 + cx, fz1],
        ],
        Y[4],
      ),
      flat(
        [
          [fx1, fz1],
          [fx1 - cx, fz1],
          [fx1, fz1 - cz],
        ],
        Y[4],
      ),
    ],
    gold,
  );
  // 中间的红菱形（同红地）+ 靛蓝菱心
  add([diamond(0, 0, 6 * T, 5 * T, Y[5])], red);
  add([diamond(0, 0, 3 * T, 2.5 * T, Y[5] + 0.004)], indigo);

  // 流苏：两头各一块平面，alphaMap 一行实一行空（屏幕行 = T / cos45 米）
  const row = T / Math.SQRT1_2;
  const n = Math.floor((2 * HZ - 2 * T) / (2 * row));
  const fz = n * row;
  const cv = document.createElement('canvas');
  cv.width = 1;
  cv.height = 2 * n;
  const c2 = cv.getContext('2d') as CanvasRenderingContext2D;
  c2.fillStyle = '#000';
  c2.fillRect(0, 0, 1, 2 * n);
  c2.fillStyle = '#fff';
  for (let i = 0; i < n; i++) c2.fillRect(0, 2 * i, 1, 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const fringe = ctx.mat('canvas', {
    ...flatOpts,
    ramp: [0xe8c890, 0xc8a080, 0x7a6488],
    alphaMap: tex,
    alphaTest: 0.5,
  });
  const fg = (xa: number, xb: number) => {
    const p = new THREE.PlaneGeometry(xb - xa, 2 * fz).rotateX(-Math.PI / 2);
    p.translate((xa + xb) / 2, Y[0], 0);
    return p;
  };
  add([fg(-2.3, x0 + 0.01), fg(x1 - 0.01, 2.3)], fringe);

  ctx.mats.prepare(g, { cast: false, receive: true });
  return g;
}
