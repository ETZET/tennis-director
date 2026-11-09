// 石头切面的几何工具（材质规范 v2）：
// - splitByClass：把一块面法线的凸包按"这一点属于哪种表面"（岩面 / 顶面 / 岩漆 / 地衣 / 地衣下沿）切成几组三角形。
//   整片同类的大三角形原样留着；跨界的三角形一路四分到 maxLen（≈ 半纹素）以下，按重心归类 —— 斑块的边、往下滴的几列
//   就是一个个纹素大小的小三角形拼出来的（像池塘石头的苔藓帽，但不用写 shader）。
// - wallUv：给岩面加 uv = [沿墙（米）, 离石顶多深（米）]，元素的 strata（沉积层）按它画（space: 'wall'）。
import * as THREE from 'three';

/** 种子化的 1D 值噪声 + 整数哈希（不用 Math.random） */
export function noise1(seed: number) {
  const h = (i: number) => {
    let x = Math.imul((i | 0) ^ seed, 0x27d4eb2d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
  return {
    /** 整数格 i（第 k 个用途）的哈希 0..1 */
    hash: (i: number, k = 0) => h(Math.floor(i) * 7919 + k * 104729),
    /** 平滑值噪声 0..1 */
    vn: (x: number) => {
      const i = Math.floor(x);
      const f = x - i;
      const s = f * f * (3 - 2 * f);
      return h(i) + (h(i + 1) - h(i)) * s;
    },
  };
}
export type Noise1 = ReturnType<typeof noise1>;

/**
 * 在法线 n 的平面上往屏幕下挪一行，世界 y 降多少米（俯角 45°、yaw 0 的相机）：竖直的正脸 1.414 纹素、45° 的斜肩 0.707、
 * 水平面 0。斑块的下沿、往下滴的长度按它给，斜面上也是"一行"而不是两三行
 */
export function rowDy(n: THREE.Vector3, T: number): number {
  const nu = (n.y - n.z) * Math.SQRT1_2;
  const nd = -(n.y + n.z) * Math.SQRT1_2;
  if (nd > -0.05) return T * Math.SQRT2;
  return Math.max(0, Math.SQRT1_2 * T * (1 + nu / nd));
}

/** 一点（世界 = 资产本地坐标）+ 所在面的法线 → 组号 */
export type Classify = (p: THREE.Vector3, n: THREE.Vector3) => number;

/**
 * 非索引、面法线的几何体按 cls 分组。返回每组的位置数组（非索引三角形）。
 * maxLen：跨界三角形细分到的边长上限（米）；判断"跨界"用三角形里一张重心坐标网格（间距 ≤ maxLen）。
 */
export function splitByClass(g: THREE.BufferGeometry, cls: Classify, groups: number, maxLen: number): number[][] {
  const out: number[][] = Array.from({ length: groups }, () => []);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const emit = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: number) =>
    out[k].push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const rec = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number) => {
    const len = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    if (len > maxLen && depth < 9) {
      const k = Math.min(32, Math.max(2, Math.ceil(len / (maxLen * 0.75))));
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      let first = -1;
      let uniform = true;
      for (let i = 0; i <= k && uniform; i++) {
        for (let j = 0; j <= k - i; j++) {
          p.copy(a)
            .addScaledVector(e1, i / k)
            .addScaledVector(e2, j / k);
          const cl = cls(p, n);
          if (first < 0) first = cl;
          else if (cl !== first) {
            uniform = false;
            break;
          }
        }
      }
      if (uniform) {
        emit(a, b, c, first);
        return;
      }
      const ab = a.clone().add(b).multiplyScalar(0.5);
      const bc = b.clone().add(c).multiplyScalar(0.5);
      const ca = c.clone().add(a).multiplyScalar(0.5);
      rec(a, ab, ca, depth + 1);
      rec(ab, b, bc, depth + 1);
      rec(ca, bc, c, depth + 1);
      rec(ab, bc, ca, depth + 1);
      return;
    }
    p.copy(a)
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3);
    emit(a, b, c, cls(p, n));
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(e1.subVectors(a, b)).normalize();
    rec(a.clone(), b.clone(), c.clone(), 0);
  }
  return out;
}

/** 位置数组 → 面法线的非索引几何体；top 给了就加岩层 uv = [x（沿墙，米）, top − y + skip（离石顶多深，米）] */
export function toGeo(arr: number[], top?: number, skip = 0): THREE.BufferGeometry | null {
  if (!arr.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  if (top !== undefined) {
    const uv = new Float32Array((arr.length / 3) * 2);
    for (let i = 0, k = 0; i < arr.length; i += 3, k += 2) {
      uv[k] = arr[i];
      uv[k + 1] = top - arr[i + 1] + skip;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return g;
}
