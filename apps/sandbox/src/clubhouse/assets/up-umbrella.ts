// up-umbrella：露台的遮阳伞（撑开，#91，×2）。伞面 2.2 × 2.2 米（24 × 24 设计纹素），伞沿 y 2.2、顶 2.6；伞杆从 cafe-table 的桌心穿过。
// 八角伞面（顶点在 ±x、±z 上 → 包围盒 2.2）：八片三角布，俱乐部蓝 / 奶油交替；坡 ≈ 15°（45° 镜头下还是一整块朝上的面）。
// 伞沿一圈垂边（1.5 纹素 ≈ 1 屏幕行），颜色和上面那片错开一格（蓝下奶油、奶油下蓝）→ 伞沿是一圈"齿"；朝北的三段看不见，不建。
// 顶上一个小一号的八角风帽（珊瑚红，露台 / 外观上最饱和的一点）+ 1 纹素的木尖。
// 伞沿抬到 2.2（规格 2.4 是整伞高）：45° 下伞沿前缘落在坐着的人的头顶（y 1.3）后面，桌面和两个人都露在伞前。
// 伞面不接投影（屋顶的影子边落在斜布上是麻点），自己投影（桌子北边的地上一块八角形的影子）。
// 材质：canvasStripe（蓝）、canvas（奶油）、flowerRed（风帽，换成珊瑚三档）、timber（杆）。三角形 50。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
const RIM = 2.2;
const APEX = 2.56;
const R = 1.1;

/** 一组三角形（每三个点一片，逆时针朝外），平面法线 */
function tris(pts: number[][]): G {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.computeVertexNormals();
  return g;
}
const ring = (r: number, i: number): [number, number] => {
  const a = (i * Math.PI) / 4;
  return [Math.sin(a) * r, Math.cos(a) * r];
};

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const blue: number[][] = [];
  const cream: number[][] = [];
  const cap: number[][] = [];
  const VAL = 1.5 * T;
  // i = 0 的顶点在 +z（朝镜头）；第 i 片在顶点 i 和 i+1 之间
  for (let i = 0; i < 8; i++) {
    const [x0, z0] = ring(R, i);
    const [x1, z1] = ring(R, i + 1);
    const top = i % 2 ? cream : blue;
    const val = i % 2 ? blue : cream;
    top.push([0, APEX - 0.06, 0], [x0, RIM, z0], [x1, RIM, z1]);
    // 垂边：朝北的三段（法线 z < 0 的）不建
    if ((z0 + z1) / 2 > -0.5) {
      val.push([x0, RIM, z0], [x0, RIM - VAL, z0], [x1, RIM - VAL, z1]);
      val.push([x0, RIM, z0], [x1, RIM - VAL, z1], [x1, RIM, z1]);
    }
    // 风帽：半径 0.3，浮在伞顶上 1 纹素
    const [c0, d0] = ring(0.3, i);
    const [c1, d1] = ring(0.3, i + 1);
    cap.push([0, APEX + 0.04, 0], [c0, APEX - 0.04, d0], [c1, APEX - 0.04, d1]);
  }

  const root = new THREE.Group();
  root.name = 'up-umbrella';
  // 斜布：往上偏光 → 八片都落亮档（不同朝向的片不跳档）；垂边朝镜头的落中档
  const cloth = {
    lightUp: 0.55,
    bands: [-0.45, 0.35] as [number, number],
    noShadowReceive: true,
    edge: 0.4,
    convex: 0.2,
  };
  root.add(new THREE.Mesh(tris(blue), ctx.mat('canvasStripe', { ...cloth, elem: undefined })));
  root.add(new THREE.Mesh(tris(cream), ctx.mat('canvas', { ...cloth, elem: undefined })));
  root.add(
    new THREE.Mesh(
      tris(cap),
      ctx.mat('flowerRed', { ...cloth, ramp: [0xf4684c, 0xc8444e, 0x7a2e5e], tones: undefined }),
    ),
  );
  // 杆：1 纹素方木，从地到伞顶；顶上露 1 纹素的尖
  const pole = mergeGeometries([
    new THREE.BoxGeometry(T, APEX, T).translate(0, APEX / 2, 0),
    new THREE.BoxGeometry(T, T, T).translate(0, APEX + 0.04 + T / 2, 0),
  ]);
  root.add(
    new THREE.Mesh(
      pole,
      ctx.mat('timber', {
        tones: undefined,
        lightUp: 0.55,
        bands: [-0.45, 0.35],
        edge: 0.4,
        convex: 0.3,
        noShadowReceive: true,
      }),
    ),
  );
  ctx.mats.prepare(root);
  return root;
}
