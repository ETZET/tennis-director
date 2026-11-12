// up-umbrella-closed：收着的遮阳伞（#92，活的信号："第三把伞没撑开"）。0.3 × 2.3 × 0.3 米（3 × 26 × 3 设计纹素），杆从 cafe-table 的桌心穿过。
// 一根木杆（1 纹素）+ 裹紧的伞布：从 y 1.0（桌面上面）到 2.1 的一个八棱锥台，上粗（半径 0.165）下细（0.11），
// 八个棱面蓝 / 奶油交替（和撑开的伞同一套颜色 → 竖条纹）；中间偏下一圈珊瑚红的扎带（2 纹素高，比伞布鼓出半纹素）；
// 顶上一个珊瑚红的小尖帽（= 撑开那把的风帽）+ 木尖。朝北的面不建。
// 材质：canvasStripe、canvas、flowerRed（珊瑚）、timber。三角形 52。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
function tris(pts: number[][]): G {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.computeVertexNormals();
  return g;
}
/** 八边形的第 i 个顶点（棱面 0 正对镜头：顶点在 ±22.5°） */
const ring = (r: number, i: number): [number, number] => {
  const a = ((i - 0.5) * Math.PI) / 4;
  return [Math.sin(a) * r, Math.cos(a) * r];
};

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const Y0 = 1.0;
  const Y1 = 2.1;
  const TOP = 2.3;
  const R0 = 0.11;
  const R1 = 0.165;
  const blue: number[][] = [];
  const cream: number[][] = [];
  const red: number[][] = [];
  /** 一圈棱面（y0,r0 → y1,r1）；朝北的三面不建 */
  const band = (y0: number, r0: number, y1: number, r1: number, to: (i: number) => number[][]) => {
    for (let i = 0; i < 8; i++) {
      if (i >= 3 && i <= 5) continue;
      const [a0, b0] = ring(r0, i);
      const [a1, b1] = ring(r0, i + 1);
      const [c0, d0] = ring(r1, i);
      const [c1, d1] = ring(r1, i + 1);
      const t = to(i);
      t.push([c0, y1, d0], [a0, y0, b0], [a1, y0, b1]);
      t.push([c0, y1, d0], [a1, y0, b1], [c1, y1, d1]);
    }
  };
  const stripe = (i: number) => (i % 2 ? cream : blue);
  band(Y0, R0, Y1, R1, stripe);
  // 扎带：y 1.4…1.58
  const TY = 1.4;
  const TH = 2 * T;
  const rt = (y: number) => R0 + ((R1 - R0) * (y - Y0)) / (Y1 - Y0) + 0.025;
  band(TY, rt(TY), TY + TH, rt(TY + TH), () => red);
  // 尖帽：从伞布的肩收到杆顶
  for (let i = 0; i < 8; i++) {
    const [a0, b0] = ring(R1, i);
    const [a1, b1] = ring(R1, i + 1);
    red.push([0, TOP - T, 0], [a0, Y1, b0], [a1, Y1, b1]);
  }

  const root = new THREE.Group();
  root.name = 'up-umbrella-closed';
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
      tris(red),
      ctx.mat('flowerRed', { ...cloth, ramp: [0xf4684c, 0xc8444e, 0x7a2e5e], tones: undefined }),
    ),
  );
  const pole = mergeGeometries([
    new THREE.BoxGeometry(T, Y0, T).translate(0, Y0 / 2, 0),
    new THREE.BoxGeometry(T, T, T).translate(0, TOP - T / 2, 0),
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
