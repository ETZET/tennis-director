// 中心球场家具（记分牌、球员长椅、拱门、旗杆、积沙、划线车、裁判椅）共用的小工具。
// 按材质收几何体再合并用 clubsite 的 Bag（场边家具共用的那份）；这里补：两点之间的方杆、朝镜头的面的参数、
// 3×5 的点阵字（数字 + 记分牌要的几个字母）、局部新色（还没进调色板的，交给核心代理以后收）。
// 单位米，y 朝上，+z 朝镜头（南），+x 朝东。设计纹素 0.09 米：横向一格 0.09，竖直面上一行 ≈ 0.127 米（俯角 45°）。
import * as THREE from 'three';
import type { ToonOpts } from '../../../clubdesk/toon';
import { Bag, place, tris } from '../../../clubsite/assets/courtside/kit';

export { Bag, place, tris };

/** 设计纹素：横向 0.09 米；竖直面上一行 0.09 / 0.707 米 */
export const DU = 0.09;
export const DV = 0.09 / Math.SQRT1_2;

/** 朝镜头的竖直面、落中档（光往上偏 + 档位放宽；小道具不接收投影） */
export const FACE_MID: ToonOpts = { lightUp: 0.6, bands: [-0.4, 0.4], noShadowReceive: true };
/** 朝镜头的竖直小面、落亮档（记分牌的灯、牌子上的字） */
export const FACE_LIT: ToonOpts = { lightUp: 0.6, bands: [-0.75, -0.2], noShadowReceive: true };
/** 小道具：不接收投影、光略往上偏（背光的侧面不至于发黑） */
export const PROP: ToonOpts = { lightUp: 0.35, noShadowReceive: true };

/** 两点之间的方杆（截面 w × w），加进 bag */
export function rod(bag: Bag, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, d = w) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, len, d);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return bag.add(mat, g, m);
}

/** 两点之间的圆杆（radialSegs 面），加进 bag */
export function pipe(bag: Bag, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, segs = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, segs, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return bag.add(mat, g, m);
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ── 3×5 点阵字 ─────────────────────────────────────

/** 3 宽 × 5 高的粗笔画字形（从上到下一行 3 格）；记分牌的数字 + 名字缩写 + AD 用到的字母 */
export const GLYPH: Record<string, string> = {
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001011001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001111',
  A: '010101111101101',
  D: '110101101101110',
  E: '111100110100111',
  I: '111010010010111',
  L: '100100100100111',
  M: '101111111101101',
  O: '111101101101111',
  R: '110101110101101',
  S: '011100010001110',
  ' ': '000000000000000',
};

/**
 * 把一个字写成朝 +z 的方块（几何体中心在字形中心，方便翻牌时绕中心缩放）：
 * 每格 cw × ch（米），厚 t（往 +z 凸出），同一行连着的格子合成一条（少三角形）。
 */
export function glyphGeo(ch: string, cw: number, chH: number, t: number): THREE.BufferGeometry | null {
  const g = GLYPH[ch] ?? GLYPH[' '];
  const parts: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 5; r++) {
    let c = 0;
    while (c < 3) {
      if (g[r * 3 + c] !== '1') {
        c++;
        continue;
      }
      let e = c;
      while (e < 3 && g[r * 3 + e] === '1') e++;
      const w = (e - c) * cw;
      const x = -1.5 * cw + c * cw + w / 2;
      const y = 2.5 * chH - r * chH - chH / 2;
      parts.push(new THREE.BoxGeometry(w, chH, t).translate(x, y, t / 2).toNonIndexed());
      c = e;
    }
  }
  if (!parts.length) return null;
  for (const p of parts) p.deleteAttribute('uv');
  const out = mergeSimple(parts);
  for (const p of parts) p.dispose();
  return out;
}

/** 只有 position / normal 的非索引几何体直接拼起来 */
export function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of list) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const q = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++, o++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], o * 3);
      nor.set([q.getX(i), q.getY(i), q.getZ(i)], o * 3);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// ── 局部新色（还没进调色板；[亮, 中, 暗]，暗档冷色相）───────────────

/** 记分牌的灯（亮黄点阵）：三档都亮（灯自己发光，影子里也亮），只是暗档略红 */
export const LED: [number, number, number] = [0xffe25a, 0xffcc3c, 0xf0a840];
