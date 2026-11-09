// 场边家具（遮阳伞、记分牌、器材箱、球包、拍架）共用的小工具：最小 ctx 类型、按材质收几何体再合并、朝镜头的牌面参数、3×5 数字字形。
// 匹克球（clubpickle）和红土（clubclay）两个场景的 AssetCtx 形状一样、调色板不一样：这里只写两边都有的调色板名字，
// 两个场景的 ctx 都能直接传进来（以后会员场 / 中心场也一样）。
// 单位米，y 朝上，+z 朝镜头（南），+x 朝东。设计纹素 0.09 米：横向一格 0.09，竖直面上一行 ≈ 0.127 米（俯角 45°）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mats, ToonOpts } from '../../render/toon';

/** 用到的调色板名字（clubpickle、clubclay 的 Pal 都有：clubdesk 的整张表） */
export type CourtKey =
  | 'canvas'
  | 'canvasStripe'
  | 'metal'
  | 'concrete'
  | 'slate'
  | 'signPaint'
  | 'signBoard'
  | 'timber'
  | 'brass'
  | 'counter'
  | 'net'
  | 'netTape'
  | 'ball'
  | 'flowerYellow'
  | 'toolOrange'
  | 'clothPurple'
  | 'clothWhite'
  | 'clothBlue'
  | 'clothRed'
  | 'ironwork';

/** 场景 AssetCtx 的公共部分；K = 这件资产要的调色板名字（拍架多一个匹克球场才有的 'paddle'） */
export interface KitCtx<K extends string = CourtKey> {
  mats: Mats;
  mat(key: K, extra?: ToonOpts): THREE.MeshToonMaterial;
  rng(stream: string): () => number;
  variant: number;
}

/** 设计纹素：横向 0.09 米；竖直面上一行 0.09 / 0.707 米 */
export const DU = 0.09;
export const DV = 0.09 / Math.SQRT1_2;

/** 朝镜头的竖直牌面、落中档（光往上偏 + 档位放宽；同 clubdesk 招牌的做法） */
export const FACE_MID: ToonOpts = { lightUp: 0.6, bands: [-0.4, 0.4], noShadowReceive: true };
/** 朝镜头的竖直小面、落亮档（翻牌、拍面：要是这一排最亮的东西） */
export const FACE_LIT: ToonOpts = { lightUp: 0.6, bands: [-0.75, -0.2], noShadowReceive: true };

// ── 几何收集 ────────────────────────────────────────

/** 只留 position / normal，转成非索引（合并要求属性一致） */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  return n;
}

/** 按材质收几何体，最后每种材质合并成一个网格（少 draw call） */
export class Bag {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(mat: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    const g = clean(geo);
    geo.dispose();
    if (m) g.applyMatrix4(m);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
    return this;
  }

  /** 方块：底面中心在 (x, y, z)，可选绕自身底面中心转 (rx, ry, rz) */
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    return this.add(mat, g, place(x, y, z, rx, ry, rz));
  }

  /** 朝 +z 的平面（字、徽标）：中心 (x, y, z) */
  quad(mat: THREE.Material, w: number, h: number, x: number, y: number, z: number) {
    return this.add(mat, new THREE.PlaneGeometry(w, h).translate(x, y, z));
  }

  get empty() {
    return this.parts.size === 0;
  }

  /** 合并成网格放进 parent（不给就新建一个 Group）；返回 parent */
  into(parent: THREE.Object3D = new THREE.Group()): THREE.Object3D {
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      if (!g) continue;
      parent.add(new THREE.Mesh(g, mat));
    }
    this.parts.clear();
    return parent;
  }
}

export function place(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
}

/** 一串三角形（每 3 个点一个，逆时针 = 正面）→ 平面法线的几何体 */
export function tris(pts: THREE.Vector3[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      pts.flatMap((p) => [p.x, p.y, p.z]),
      3,
    ),
  );
  g.computeVertexNormals();
  return g;
}

/** 释放一棵树里的几何体（材质是共享缓存的，不动） */
export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}

// ── 数字（翻牌） ─────────────────────────────────────

/** 3×5 的粗笔画数字（每格 1 设计纹素宽）；'' / null = 空牌 */
const GLYPH: Record<string, string> = {
  '0': '111101101101111',
  '1': '110010010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001001001001',
  '8': '111101111101111',
  '9': '111101111001111',
};

/**
 * 字形的行高（米，从上到下）：横笔那三行一行 = 竖直面上 1 设计纹素（2 屏幕行），只有竖笔的两行半行 ——
 * 字矮一点（0.51 米），牌子放得下两排；1× 下横笔 2 行、竖笔段 1 行，和横向 2 纹素的竖笔一样粗细。
 */
export const GLYPH_ROWS = [DV, DV / 2, DV, DV / 2, DV];
export const GLYPH_W = 3 * DU;
export const GLYPH_H = GLYPH_ROWS.reduce((a, b) => a + b, 0);

/** 把一个数字（0..9；更大的取个位；null = 空）写成朝 +z 的平面：字形中心 (cx, cy)，平面在 z */
export function glyph(bag: Bag, mat: THREE.Material, v: number | null, cx: number, cy: number, z: number) {
  if (v === null || v === undefined) return;
  const g = GLYPH[String(Math.abs(Math.round(v)) % 10)];
  let y = cy + GLYPH_H / 2;
  for (let r = 0; r < 5; r++) {
    const h = GLYPH_ROWS[r];
    // 同一行连着的格子合成一条（少三角形）
    let c = 0;
    while (c < 3) {
      if (g[r * 3 + c] !== '1') {
        c++;
        continue;
      }
      let e = c;
      while (e < 3 && g[r * 3 + e] === '1') e++;
      const x0 = cx - GLYPH_W / 2 + c * DU;
      bag.quad(mat, (e - c) * DU, h, x0 + ((e - c) * DU) / 2, y - h / 2, z);
      c = e;
    }
    y -= h;
  }
}
