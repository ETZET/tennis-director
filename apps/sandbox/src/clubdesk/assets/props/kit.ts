// 前台小道具（毛巾车、水站、黑板、陶罐）共用的几何小工具。不是资产（main.ts 只 glob assets/*.ts，这个子目录不会被当成资产）。
// 规则（material-spec / ASSETS.md「材质规范 v2」）：尺寸、偏移按 0.09 米的设计纹素取整；每种材质合并成一个网格（少 draw call）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 设计纹素（米） */
export const DT = 0.09;
/** 地面上纵深 / 竖直方向 1 个屏幕行（1× 像素：0.045 米/纹素）对应多少米（45° 俯视） */
export const ROW = DT / 2 / Math.SQRT1_2;

/** 盒子：中心 (x, y, z)，尺寸 w × h × d */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** 圆柱：轴 axis（默认 y），中心 (x, y, z) */
export function cyl(
  r: number,
  len: number,
  seg: number,
  x = 0,
  y = 0,
  z = 0,
  axis: 'x' | 'y' | 'z' = 'y',
  rTop = r,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, r, len, seg);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}

/** 车床体：剖面 [半径, 高]（从下往上），绕 y 轴 */
export function lathe(profile: [number, number][], seg: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}

/** 按材质收集几何体，最后每种材质合并成一个网格 */
export class Parts {
  private m = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, ...geos: THREE.BufferGeometry[]): this {
    const list = this.m.get(mat) ?? [];
    list.push(...geos);
    this.m.set(mat, list);
    return this;
  }
  /** 合并好的网格挂到 parent 上（不给就新建一个 Group） */
  build(parent: THREE.Object3D = new THREE.Group()): THREE.Object3D {
    for (const [mat, geos] of this.m) {
      const g = geos.length === 1 ? geos[0] : mergeGeometries(geos);
      parent.add(new THREE.Mesh(g, mat));
    }
    return parent;
  }
}

/**
 * 圆东西的"影子卡"：太阳在画面后方，圆罐子朝镜头的那半边永远在自己的影子里（自投影把球面法线做出来的亮顶、中腰全压成暗档）。
 * 办法：罐身不投影（castShadow = false，但照样接收门柱、树、凉棚的影子），另放一张看不见的剪影卡在罐子背后投地上的影子。
 * 卡在罐子后面 z（本地），朝镜头的点往太阳方向的光线只在罐底很低的地方碰到它（那里本来就是暗档）。
 * 卡本身：颜色不写、深度不写，法线 pass 也用同一个空材质（不出描边）；只进阴影贴图。
 */
export function shadowCard(profile: [number, number][], z: number): THREE.Mesh {
  const pts = profile.filter(([r]) => r > 0);
  const s = new THREE.Shape();
  s.moveTo(-pts[0][0], pts[0][1]);
  for (const [r, y] of pts) s.lineTo(r, y);
  for (let i = pts.length - 1; i >= 0; i--) s.lineTo(-pts[i][0], pts[i][1]);
  const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  m.userData.normalMat = m;
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(s).translate(0, 0, z), m);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

/** 一棵对象树：只接收影子、不投影（配合 shadowCard；在 ctx.mats.prepare 之后调） */
export function noCast(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = false;
  });
}

/** 一棵对象树的三角形数（报告用） */
export function triCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const t = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
    n += t * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return n;
}
