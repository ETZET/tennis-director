// 钟楼二层的钟绳（#90，开门 / 开赛 / 收盘时拉）：0.2 × 3.3 × 0.2 米 = 2 × 36.5 × 2 纹素（只有地上那盘绳宽到 0.34 米），从钟室垂下来，不挡路。
// 元素：一根 2 纹素粗的红色编绳（贴图 = 每 2 行一道深浅，读成一股一股的辫），手够得着的高度（0.85～1.3 米）一段握把
// （绒的"握绳"：金黄色，上下各一道红箍，底下一个红绳结），握把下面一截细一点的绳尾垂到地上，盘成两圈（下大上小的两个八边盘）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 106（预算 350）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 正面也落亮档（细的东西正面是中档就看不见了） */
const BRIGHT = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true };
/** BoxGeometry 的面序：e +x、w −x、t +y、b −y、s +z、n −z */
const FACES = 'ewtbsn';

/** 编绳贴图：竖着两格，一深一浅（只做明暗） */
function braidTexture(): THREE.Texture {
  const d = new Uint8Array([255, 255, 255, 255, 196, 196, 196, 255]);
  const t = new THREE.DataTexture(d, 1, 2, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2 * T; // 竖面上的 1 屏幕行（米）
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（米）：x、z 是中心，y 是底；uv.y 按高度铺（每 4 行一个来回）；skip = 不要的面 */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, skip = 'bn') => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const src = Array.from(g.index?.array ?? []);
    const idx: number[] = [];
    for (let f = 0; f < 6; f++) if (!skip.includes(FACES[f])) idx.push(...src.slice(f * 6, f * 6 + 6));
    g.setIndex(idx);
    g.clearGroups();
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5, p.getY(i) / (4 * R));
    put(m, g);
  };
  /** 八边盘（绳圈）：半径 r、厚 h、底在 y */
  const disc = (m: THREE.Material, r: number, h: number, x: number, y: number, z: number) => {
    const g = new THREE.CylinderGeometry(r, r, h, 8).translate(x, y + h / 2, z);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.25);
    put(m, g);
  };

  // ── 材质 ──
  const rope = ctx.mat('clothRed', {
    ...BRIGHT,
    map: braidTexture(),
    ramp: [0xf4543e, 0xc43448, 0x6e2660],
    convex: 0.3,
    edge: 0.3,
  });
  const coil = ctx.mat('clothRed', {
    ramp: [0xf4543e, 0xc43448, 0x6e2660],
    convex: 0.5,
    edge: 0.6,
    noShadowReceive: true,
  });
  const grip = ctx.mat('brass', {
    ...BRIGHT,
    ramp: [0xffd058, 0xe09a3c, 0x8a4a52],
    tones: undefined,
    convex: 0.3,
    edge: 0.3,
  });
  const ring = ctx.mat('clothRed', { ...BRIGHT, ramp: [0xd83a40, 0xa82a48, 0x5e2258], edge: 0.2 });

  // ── 从上到下：编绳 → 握把（两道箍）→ 绳尾 → 地上盘两圈 ──
  const H = 3.3;
  const G0 = 0.85; // 握把底
  const G1 = 1.3; // 握把顶
  box(rope, 2 * T, H - G1, 2 * T, 0, G1, 0, 'bnt');
  box(grip, 0.2, G1 - G0, 0.2, 0, G0, 0, 'bn');
  box(ring, 0.2, 0.07, 0.205, 0, G1 - 0.07, 0, 'bnt');
  box(ring, 0.2, 0.07, 0.205, 0, G0, 0, 'bnt');
  box(ring, 0.2, 0.1, 0.2, 0, G0 - 0.1, 0, 'bnt'); // 绳结
  box(rope, 1.5 * T, G0 - 0.22, 1.5 * T, 0, 0.12, 0, 'bnt');
  disc(coil, 0.17, 0.07, 0.03, 0, 0.02);
  disc(coil, 0.11, 0.06, 0.02, 0.07, 0.01);

  const root = new THREE.Group();
  root.name = 'up-bell-rope';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
