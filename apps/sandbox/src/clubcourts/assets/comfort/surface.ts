// 会员场的"舒适"资产（遮阳帆、喷雾管、刮水板）共用的小工具：
//   - sailSurface：一块绷紧的帆面（四个角 + 四条往里收的弧边 + 一点点下垂），按条纹切成两组三角形（奶白 / 俱乐部蓝），
//     每组另附一层反向的三角形（投影 pass 画背面：单面的帆投不出影子）。
//   - flakeGeo：雾片（竖着的、六边形的一小片，宽一点）。
// 只碰 three；材质由资产自己 ctx.mat(...) 拿。单位米，y 朝上，+z 朝镜头（南）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

export interface SailSpec {
  /** 四个角：后西、后东、前西、前东（本地坐标，米） */
  corners: [V3, V3, V3, V3];
  /** 四条边往里收的深度（占边长的比例，0.05 ≈ 帆布张拉的弧边） */
  cut: number;
  /** 帆面中心往下垂多少（米）：绷紧的帆只垂一点 */
  sag: number;
  /** 条纹：沿哪个方向分条（'u' = 东西方向分条 → 条纹南北走；'v' = 南北方向分条 → 条纹东西走） */
  along: 'u' | 'v';
  /** 条纹的分段宽度（比例，加起来 = 1），从 0 开始轮流：奶白、蓝、奶白、蓝…… */
  bands: number[];
  /** 每条里再细分几份（弧边、下垂要几段才圆） */
  sub: number;
  /** 另一方向分几段 */
  across: number;
}

/** 帆面上的点：s、t ∈ [0, 1]（s 西 → 东，t 后 → 前），先按弧边收进来，再双线性插四个角，再减下垂 */
function sailPoint(sp: SailSpec, s: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  const [a, b, c, d] = sp.corners;
  const cu = sp.cut * Math.sin(Math.PI * t);
  const cv = sp.cut * Math.sin(Math.PI * s);
  const u = cu + (1 - 2 * cu) * s;
  const v = cv + (1 - 2 * cv) * t;
  const w00 = (1 - u) * (1 - v);
  const w10 = u * (1 - v);
  const w01 = (1 - u) * v;
  const w11 = u * v;
  out.set(
    a[0] * w00 + b[0] * w10 + c[0] * w01 + d[0] * w11,
    a[1] * w00 + b[1] * w10 + c[1] * w01 + d[1] * w11 - sp.sag * Math.sin(Math.PI * u) * Math.sin(Math.PI * v),
    a[2] * w00 + b[2] * w10 + c[2] * w01 + d[2] * w11,
  );
  return out;
}

/**
 * 帆面几何：返回 [奶白, 蓝] 两个几何体（各自带反向的一层）。法线按曲面有限差分（平滑，整块帆读成一整片亮面）。
 * 三角形 ≈ 2 × 2 × (条数 × sub) × across。
 */
export function sailSurface(sp: SailSpec): [THREE.BufferGeometry, THREE.BufferGeometry] {
  // 沿分条方向的断点（每条 sub 份）+ 每个断点属于哪一条
  const cuts: number[] = [0];
  const owner: number[] = [];
  let acc = 0;
  sp.bands.forEach((w, i) => {
    for (let k = 1; k <= sp.sub; k++) {
      cuts.push(acc + (w * k) / sp.sub);
      owner.push(i);
    }
    acc += w;
  });
  cuts[cuts.length - 1] = 1;
  const across = Array.from({ length: sp.across + 1 }, (_, i) => i / sp.across);
  const pos: [number[], number[]] = [[], []];
  const nrm: [number[], number[]] = [[], []];
  const p = new THREE.Vector3();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e = 1e-3;
  const vert = (s: number, t: number, bag: 0 | 1, flip: boolean) => {
    sailPoint(sp, s, t, p);
    // 法线 = ∂P/∂t × ∂P/∂s（s 往东、t 往南 → 朝上）
    sailPoint(sp, Math.min(1, s + e), t, pa).sub(sailPoint(sp, Math.max(0, s - e), t, n));
    sailPoint(sp, s, Math.min(1, t + e), pb).sub(sailPoint(sp, s, Math.max(0, t - e), n));
    n.crossVectors(pb, pa).normalize();
    if (n.y < 0) n.negate();
    if (flip) n.negate();
    pos[bag].push(p.x, p.y, p.z);
    nrm[bag].push(n.x, n.y, n.z);
  };
  for (let i = 0; i < cuts.length - 1; i++) {
    const bag = (owner[i] % 2) as 0 | 1;
    for (let j = 0; j < across.length - 1; j++) {
      // 四个角的 (s, t)
      const q: [number, number][] =
        sp.along === 'u'
          ? [
              [cuts[i], across[j]],
              [cuts[i + 1], across[j]],
              [cuts[i], across[j + 1]],
              [cuts[i + 1], across[j + 1]],
            ]
          : [
              [across[j], cuts[i]],
              [across[j + 1], cuts[i]],
              [across[j], cuts[i + 1]],
              [across[j + 1], cuts[i + 1]],
            ];
      // 正面（从上往下看逆时针）：0 2 1、1 2 3
      for (const k of [0, 2, 1, 1, 2, 3]) vert(q[k][0], q[k][1], bag, false);
      // 反面（投影用）
      for (const k of [0, 1, 2, 1, 3, 2]) vert(q[k][0], q[k][1], bag, true);
    }
  }
  return [0, 1].map((b) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos[b], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm[b], 3));
    return g;
  }) as [THREE.BufferGeometry, THREE.BufferGeometry];
}

/** 帆面上 (s, t) 的点（给拉索接角、给喷雾管找前沿用） */
export function sailAt(sp: SailSpec, s: number, t: number): V3 {
  const v = sailPoint(sp, s, t, new THREE.Vector3());
  return [v.x, v.y, v.z];
}

/**
 * 雾片：竖着的一小团（法线朝 +z，镜头）：一个大六边形 + 左上、右下两个小六边形叠在一起，宽 ≈ 1、高 ≈ 0.75。
 * 半透明画的时候叠的地方会亮一层 → 团心亮、边上淡（不用柔边贴图也读得出"一团雾"）。用实例矩阵缩放、挪位置。
 */
export function flakeGeo(): THREE.BufferGeometry {
  const hex = (r: number, x: number, y: number) => {
    const g = new THREE.CircleGeometry(r, 6);
    g.rotateZ(Math.PI / 6);
    g.scale(1, 0.72, 1);
    g.translate(x, y, 0);
    g.deleteAttribute('uv');
    return g;
  };
  return mergeGeometries([hex(0.34, 0, 0), hex(0.22, -0.26, 0.1), hex(0.2, 0.27, -0.08)]);
}
