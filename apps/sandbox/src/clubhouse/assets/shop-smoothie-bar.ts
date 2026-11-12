// #60 奶昔吧台（运动营养 · 饮品店南边的柜台窗，正面朝南对着拱廊；饮品师站在北边）。
// 尺寸：2.16 宽 × 1.02 高 × 0.63 深（24 纹素 × 8 行 × 7 纹素；竖直 1 行 = √2 纹素 = 0.127 米）。
// 正面：塔拉韦拉花砖 —— 3 纹素 × 1 行的砖，钴蓝隔一块，中间轮着浅蓝白 / 赭黄（每行错开 → 斜着的格子），
// 顶上一条塔拉韦拉绿的花边砖（1 行），脚下缩进 1 纹素的深色踢脚。
// 台面：水青的石英台面（1 行厚，顶面亮；冷色，和暖的陶砖地分开）。台上从西到东：搅拌机（钢底座 + 粉色奶昔的杯身 + 上半截空玻璃 + 蓝盖）、
// 一碗橙子、一碗青柠（赭黄陶碗 + 3 纹素的水果堆）、一摞奶白纸杯、第二台搅拌机（绿奶昔）、一碗粉色的火龙果。
// 场景里柜台前面 0.2 米是切到 1 米高的南墙：看得见的主要是台面和台上的东西，花砖正面在画廊里看。
// 明暗：钴蓝砖、踢脚（暗）、浅砖 / 花边 / 碗 / 水果（中）、台面和纸杯（亮）；横向相邻差 < 60。
// 材质：talavera（钴蓝砖）、jug（浅砖、空玻璃）、canvasStripe（台面、盖）、signPaint（赭黄砖、陶碗）、seat（借名，绿花边）、steel（搅拌机底座）、counterTop（纸杯）、
// fabricStripe（粉奶昔）、toolOrange（橙）、ball（青柠）、flowerPurple（借名，火龙果粉）、ironwork（踢脚）。只建朝镜头的面。三角形 144。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** BoxGeometry 的面顺序：+x −x +y −y +z −z */
const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 } as const;
type Face = keyof typeof FACE;

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖直 1 屏幕行（纹素单位）
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 盒子（纹素坐标：x 从中心、y 从地面、z 从中心）；faces = 只留哪些面 */
  const slab = (
    m: THREE.Material,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    faces: Face[],
  ) => {
    const g = new THREE.BoxGeometry((x1 - x0) * T, (y1 - y0) * T, (z1 - z0) * T);
    g.translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, ((z0 + z1) / 2) * T);
    const src = g.index!.array;
    const idx: number[] = [];
    for (const f of faces) for (let i = 0; i < 6; i++) idx.push(src[FACE[f] * 6 + i]);
    g.setIndex(idx);
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  const front: Face[] = ['pz', 'py'];
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const col = (key: Parameters<AssetCtx['mat']>[0], lit: number, mid: number, dark: number, edge = 0.35) =>
    ctx.mat(key, { ...face, edge, convex: 0.2, ramp: [lit, mid, dark] });

  const cobalt = col('talavera', 0x5a98f0, 0x3a70d0, 0x263c8a, 0.3);
  const pale = col('jug', 0xbcdcf8, 0x7ca4d8, 0x4a5a90, 0.3);
  const ochre = col('signPaint', 0xf8d070, 0xd89c38, 0x8a6060, 0.3);
  const green = col('seat', 0x7cd08c, 0x48a86c, 0x24546a, 0.3);
  const kick = col('ironwork', 0x6a64a0, 0x4a3c7a, 0x2c2850, 0.3);
  // 台面：水青的石英台面（冷色，和暖的陶砖地、切墙顶分得开）
  const quartz = col('canvasStripe', 0x58d4e4, 0x2c9cc0, 0x2a5a8a);
  const steel = col('steel', 0xb8c4dc, 0x9aa8c8, 0x56648a);
  const glass = col('jug', 0xb0ecf4, 0x84ccdc, 0x3a6aa0);
  const cream = col('counterTop', 0xf4dcc0, 0xd8ac8a, 0x8a78aa);
  const lid = col('canvasStripe', 0x80c0fc, 0x4c94e0, 0x34508e);
  const pink = col('fabricStripe', 0xff9cb8, 0xf07898, 0x6a2a5e);
  const orange = col('toolOrange', 0xffb050, 0xf08a3c, 0x7a3456);
  const lime = col('ball', 0xb4e050, 0x7cb838, 0x3a6a52);
  const dragon = col('flowerPurple', 0xff88c8, 0xe0609c, 0x6a2a6a);

  const X = 12; // 半宽 12 纹素 = 1.08 米
  const Z = 3.5; // 半深 3.5 纹素 = 0.315 米
  const top = 8 * R; // 台面顶 1.02 米（踢脚 1 行 + 花砖 5 行 + 花边 1 行 + 台面 1 行）
  // ── 柜身 ──
  slab(kick, -X + 1, X - 1, 0, R, -Z, Z - 1, ['pz']); // 踢脚（缩进 1 纹素）
  // 花砖：1..6 行，每块 3 纹素 × 1 行，钴蓝 / 浅蓝白棋盘格
  for (let row = 0; row < 5; row++) {
    for (let c = 0; c < 8; c++) {
      const k = (c + row * 3) % 4;
      const m = k % 2 === 0 ? cobalt : k === 1 ? pale : ochre;
      slab(m, -X + c * 3, -X + (c + 1) * 3, (1 + row) * R, (2 + row) * R, -Z, Z, ['pz']);
    }
  }
  slab(green, -X, X, 6 * R, top - R, -Z, Z, ['pz']); // 花边（第 6 行，塔拉韦拉绿）
  slab(quartz, -X, X, top - R, top, -Z, Z, front); // 台面

  // ── 台上 ──
  const y = top;
  const v = ctx.variant % 2;
  /** 搅拌机：钢底座 2 × 2 纹素 1 行 + 杯身（奶昔 1 行 + 空玻璃 1 行）+ 蓝盖 0.5 行 */
  const blender = (x0: number, z1: number, shake: THREE.Material) => {
    slab(steel, x0, x0 + 2, y, y + R, z1 - 2, z1, front);
    slab(shake, x0, x0 + 2, y + R, y + 2 * R, z1 - 2, z1, ['pz']);
    slab(glass, x0, x0 + 2, y + 2 * R, y + 3 * R, z1 - 2, z1, ['pz']);
    slab(lid, x0, x0 + 2, y + 3 * R, y + 3.5 * R, z1 - 2, z1, front);
  };
  /** 一碗水果：赭黄陶碗（和花砖同一套釉）3 × 3 纹素 1 行 + 上面一堆水果（3 纹素宽、0.8 行，靠后 1 纹素） */
  const bowl = (x0: number, z1: number, fruit: THREE.Material) => {
    slab(ochre, x0, x0 + 3, y, y + R, z1 - 3, z1, front);
    slab(fruit, x0, x0 + 3, y + R, y + 1.8 * R, z1 - 3, z1 - 1, front);
  };
  blender(-11, 1, pink);
  bowl(-8, 2, orange);
  bowl(-4, 2, lime);
  // 纸杯一摞（2 纹素宽、3 行高）+ 旁边倒扣的一只
  slab(cream, 0, 2, y, y + 3 * R, -1, 1, front);
  slab(cream, 2, 4, y, y + R, 0, 2, front);
  blender(6, 1, v ? orange : lime);
  bowl(9, 2, dragon);

  const root = new THREE.Group();
  for (const [m, gs] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(gs), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
