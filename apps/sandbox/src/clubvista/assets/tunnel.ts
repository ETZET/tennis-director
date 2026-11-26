// 球员通道（北看台正中，两半看台中间）：一座白灰泥的门楼，朝镜头一个 2.4 × 2.4 米的方门洞，里面是暗的（通道往北伸进看台底下），
// 门洞上一道俱乐部蓝的门楣（一颗网球 + 两条奶油粗划，不写字），顶上一圈压顶，比看台顶高出 0.5 米（看台中间立起来的一块 = 球员从这里出来）。
// 3.6 × 3.2 × 5.4 米。本地原点 = 门洞前沿正中的地面，门洞朝 +z。
// 材质规范 v2：灰泥朝镜头 = 背光暗档（lightUp 抬到中档，不然一块黑）；门洞里固定最暗档（underside），不接投影。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const FACE = { lightUp: 0.5, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const W = 3.6;
  const H = 3.2;
  const Dp = 5.4;
  const OW = 2.4;
  const OH = 2.4;
  const g = new THREE.Group();
  g.name = 'tunnel';
  const stucco = ctx.mat('stucco', {
    ...FACE,
    elem: { kind: 'stones', space: 'wall', size: [30, 8], seam: 0, hi: 0, seed: 7 },
    toneW: [0.25, 0.3],
    edge: 0.4,
    convex: 0.3,
  });
  const top = ctx.mat('stucco', { edge: 0.3, convex: 0.4 });
  const cap = ctx.mat('cap', { edge: 0.3, convex: 0.6 });
  const dark = ctx.mat('underside', { noShadowReceive: true, bands: [2, 3], edge: 0.1, convex: 0 });
  const blue = ctx.mat('counter', { ...FACE, edge: 0.4, convex: 0.3 });
  const paint = ctx.mat('signPaint', { ...FACE, edge: 0.1, convex: 0 });
  const ball = ctx.mat('ball', { ...FACE, edge: 0.2, convex: 0 });
  const side = (W - OW) / 2;
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material, name: string, cast = false) => {
    const mm = new THREE.Mesh(mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x))), m);
    mm.name = name;
    mm.castShadow = cast;
    mm.receiveShadow = false;
    g.add(mm);
  };
  // 两边的门墩 + 门洞上面的一截墙（整座是实心的，门洞是凹进去 0.6 米的暗盒）
  add(
    [
      bx(side, H, Dp, -W / 2 + side / 2, H / 2, -Dp / 2),
      bx(side, H, Dp, W / 2 - side / 2, H / 2, -Dp / 2),
      bx(OW, H - OH, Dp, 0, OH + (H - OH) / 2, -Dp / 2),
    ],
    stucco,
    'walls',
    true,
  );
  // 门洞里：暗的地、两壁、顶、尽头（往里 3 米）
  add(
    [
      bx(OW, 0.02, 3, 0, 0.01, -1.5),
      bx(0.02, OH, 3, -OW / 2 + 0.01, OH / 2, -1.5),
      bx(0.02, OH, 3, OW / 2 - 0.01, OH / 2, -1.5),
      bx(OW, 0.02, 3, 0, OH - 0.01, -1.5),
      bx(OW, OH, 0.02, 0, OH / 2, -3),
    ],
    dark,
    'mouth',
  );
  // 门楣：俱乐部蓝的一块板（贴在门洞上面那截墙的正面）+ 网球 + 两条奶油粗划
  add([bx(W - 0.3, 0.56, 0.06, 0, OH + 0.36, 0.03)], blue, 'lintel');
  add([bx(0.9, 0.12, 0.02, -0.35, OH + 0.42, 0.07), bx(0.6, 0.12, 0.02, 0.62, OH + 0.3, 0.07)], paint, 'lintel-paint');
  add([bx(0.24, 0.24, 0.03, -1.1, OH + 0.36, 0.075)], ball, 'lintel-ball');
  // 顶：灰泥顶面 + 一圈压顶
  add([bx(W, 0.04, Dp, 0, H + 0.02, -Dp / 2)], top, 'roof');
  add([bx(W + 0.12, 0.12, 0.24, 0, H + 0.06, 0), bx(W + 0.12, 0.12, 0.24, 0, H + 0.06, -Dp + 0.12)], cap, 'cap');
  // 包厢的遮阳篷：门楼顶上一块往前低下来的条纹篷（俱乐部蓝 / 奶油竖条，俯视里是看台正中一块安静的蓝），两根细杆撑着前沿
  // （顶面落亮档的大块浅灰泥换成篷：第 1 轮截图里门楼顶是全屏最亮的一块）
  const awnB: THREE.BufferGeometry[] = [];
  const awnC: THREE.BufferGeometry[] = [];
  const n = 8;
  const sw = (W + 0.3) / n;
  const yb = H + 1.5;
  const yf = H + 0.95;
  const z0 = -Dp + 0.3;
  const z1 = 0.25;
  for (let i = 0; i < n; i++) {
    const x = -(W + 0.3) / 2 + sw * (i + 0.5);
    const pg = new THREE.PlaneGeometry(sw, Math.hypot(z1 - z0, yb - yf)).rotateX(
      -Math.PI / 2 + Math.atan2(yb - yf, z1 - z0),
    );
    pg.translate(x, (yb + yf) / 2, (z0 + z1) / 2);
    pg.deleteAttribute('uv');
    (i % 2 ? awnC : awnB).push(pg);
    // 前沿垂边
    const fr = new THREE.PlaneGeometry(sw, 0.22).translate(x, yf - 0.11, z1);
    fr.deleteAttribute('uv');
    (i % 2 ? awnB : awnC).push(fr);
  }
  const awnOpts = {
    lightUp: 0.35,
    bands: [-0.3, 0.45] as [number, number],
    noShadowReceive: true,
    edge: 0.4,
    convex: 0.2,
  };
  // 单面的篷布投影要 shadowSide 双面，否则影子是一串断开的点（第 2 轮：场上北底线外的一排"字"就是它）
  const mB = ctx.mat('counter', awnOpts);
  const mC = ctx.mat('canvas', awnOpts);
  mB.shadowSide = THREE.DoubleSide;
  mC.shadowSide = THREE.DoubleSide;
  add(awnB, mB, 'awning-blue', true);
  add(awnC, mC, 'awning-cream', true);
  const poles: THREE.BufferGeometry[] = [];
  for (const x of [-W / 2 + 0.15, W / 2 - 0.15]) poles.push(bx(0.1, yf - H, 0.1, x, H + (yf - H) / 2, z1 - 0.05));
  add(poles, ctx.mat('metal', { edge: 0.3, convex: 0.3 }), 'awning-poles');
  // 包厢里三个人（坐着的头和肩在篷下露出来）
  for (const [x, k] of [
    [-0.9, 'clothWhite'],
    [0, 'canvas'],
    [0.9, 'clothBlue'],
  ] as const) {
    add([bx(0.34, 0.44, 0.22, x, H + 0.66, -0.9)], ctx.mat(k, { ...FACE, edge: 0.35, convex: 0.3 }), `vip-${k}`);
    add(
      [bx(0.3, 0.3, 0.28, x, H + 1.03, -0.88)],
      ctx.mat('skinTan', { ...FACE, edge: 0.35, convex: 0.3 }),
      `vip-h-${k}`,
    );
  }
  add([bx(W - 0.2, 0.44, 0.3, 0, H + 0.22, -1.2)], ctx.mat('seat', { edge: 0.3, convex: 0.3 }), 'vip-seats');
  return g;
}
