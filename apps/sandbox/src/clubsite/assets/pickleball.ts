// pickleball：穿孔塑料球（clubpickle #6）。真球 0.074 米在 0.09 米/纹素下不到一个纹素，照网球的做法放大到 ⌀ 0.18（2 设计纹素
// = 1× 像素下 4 × 4 个像素）：亮档是画面里最亮的点之一，右上角一个 1 像素的暗点（孔）—— 近看才看得出来，远看就是亮黄点。
// 多数黄绿（`ball`），少数橙（`toolOrange`）。原点 = 球心（SLOTS 里散落的球 y = 0.09，空中的球 y = 球心高）。
// 全部用 InstancedMesh（几何体、材质按 ctx.mats 缓存）：一个球 = 2 个实例，散一地 = 每种颜色 2 个 draw call。
// 变体：v0 黄绿、v1 橙、v2 = 散一地（画廊演示：6 × 3 米里 16 个，约六分之一橙）。
// userData（每个变体都有，stage 3 捡球用）：
//   setBalls(points, orange?)  points = [x, z]（落地，y = 球半径）或 [x, y, z]（本地坐标，球心）；
//                              orange = 每个球是不是橙的（不给 = 按下标挑约六分之一）
//   remove(i)                  拿走第 i 个（捡球器经过）；后面的下标往前挪
//   count()                    还剩几个
//   ballAt(i, out?)            第 i 个的本地坐标（球心）
import * as THREE from 'three';
import type { Mats } from '../../clubfront/toon';
import type { NetCtx } from './nets/kit';

const R = 0.09;
type Pt = [number, number] | [number, number, number];

interface Kit {
  body: THREE.BufferGeometry;
  hole: THREE.BufferGeometry;
  mats: { yellow: THREE.Material; orange: THREE.Material; holeY: THREE.Material; holeO: THREE.Material };
}
const KITS = new WeakMap<Mats, Kit>();

function kitOf(ctx: NetCtx): Kit {
  const k = KITS.get(ctx.mats);
  if (k) return k;
  // 球：一个二十面体（20 个三角形），法线 = 球面（三档按球面分：上亮、腰中、下暗）
  const body = new THREE.IcosahedronGeometry(R, 0);
  const p = body.getAttribute('position');
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  body.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  // 孔：球面右上偏前的一个小方块（≈ 1 个 1× 像素），朝上
  const hole = new THREE.BoxGeometry(0.045, 0.02, 0.045).translate(0.03, R * 0.86, 0.03);
  // 4 × 4 像素的小东西：不描边（描边会把每个像素都压暗成灰），档位往下放 —— 只有最下面一行落中档，其余是亮档的荧光黄
  const ball: Parameters<NetCtx['mat']>[1] = {
    edge: 0,
    convex: 0.2,
    lightUp: 0.5,
    bands: [-0.75, -0.2],
    noShadowReceive: true,
  };
  const kit: Kit = {
    body,
    hole,
    mats: {
      yellow: ctx.mat('ball', ball),
      orange: ctx.mat('toolOrange', ball),
      // 孔的颜色：本地挑的三档（黄绿球的孔 = 橄榄，橙球的孔 = 砖褐），整个孔都落一个颜色
      holeY: ctx.mats.toon(0xffffff, { ramp: [0xa8b438, 0x8c9a3a, 0x5a6a44], edge: 0, convex: 0, bands: [-2, -1.5] }),
      holeO: ctx.mats.toon(0xffffff, { ramp: [0xc0602e, 0x9a4630, 0x6a3442], edge: 0, convex: 0, bands: [-2, -1.5] }),
    },
  };
  KITS.set(ctx.mats, kit);
  return kit;
}

/** 下标挑橙球：约六分之一（散的球不全是一个颜色） */
const isOrange = (i: number) => (i * 7 + 3) % 6 === 0;

export function build(ctx: NetCtx): THREE.Object3D {
  const kit = kitOf(ctx);
  const g = new THREE.Group();
  const balls: { p: THREE.Vector3; orange: boolean }[] = [];
  let cap = 0;
  let meshes: THREE.InstancedMesh[] = [];

  function rebuild() {
    const want = Math.max(4, balls.length);
    if (want > cap) {
      for (const m of meshes) {
        g.remove(m);
        m.dispose();
      }
      cap = Math.max(want, cap * 2, 4);
      const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, cast: boolean) => {
        const m = new THREE.InstancedMesh(geo, mat, cap);
        m.frustumCulled = false;
        g.add(m);
        ctx.mats.prepare(m, { cast, receive: false });
        return m;
      };
      meshes = [
        mk(kit.body, kit.mats.yellow, true),
        mk(kit.hole, kit.mats.holeY, false),
        mk(kit.body, kit.mats.orange, true),
        mk(kit.hole, kit.mats.holeO, false),
      ];
    }
    const m4 = new THREE.Matrix4();
    let ny = 0;
    let no = 0;
    for (const b of balls) {
      m4.makeTranslation(b.p.x, b.p.y, b.p.z);
      if (b.orange) {
        meshes[2].setMatrixAt(no, m4);
        meshes[3].setMatrixAt(no, m4);
        no++;
      } else {
        meshes[0].setMatrixAt(ny, m4);
        meshes[1].setMatrixAt(ny, m4);
        ny++;
      }
    }
    meshes[0].count = meshes[1].count = ny;
    meshes[2].count = meshes[3].count = no;
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }

  function setBalls(points: Pt[], orange?: boolean[]) {
    balls.length = 0;
    points.forEach((q, i) => {
      const p = q.length === 2 ? new THREE.Vector3(q[0], R, q[1]) : new THREE.Vector3(q[0], q[1], q[2]);
      balls.push({ p, orange: orange?.[i] ?? isOrange(i) });
    });
    rebuild();
  }

  if (ctx.variant === 2) {
    // 散一地（画廊演示）：6 × 3 米里 16 个，成簇（真散落的球会滚到一起），不是均匀撒
    const rnd = ctx.rng('pickleball:scatter');
    const pts: Pt[] = [];
    const clumps = [
      [-1.8, -0.6],
      [0.4, 0.5],
      [2.1, -0.9],
    ];
    for (let i = 0; i < 16; i++) {
      const c = clumps[i % 3];
      const a = rnd() * Math.PI * 2;
      const r = 0.25 + rnd() * (i < 12 ? 0.8 : 2.2);
      pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 0.7]);
    }
    setBalls(pts);
  } else setBalls([[0, 0, 0]], [ctx.variant === 1]);

  g.userData.setBalls = setBalls;
  g.userData.remove = (i: number) => {
    if (i < 0 || i >= balls.length) return;
    balls.splice(i, 1);
    rebuild();
  };
  g.userData.count = () => balls.length;
  g.userData.ballAt = (i: number, out = new THREE.Vector3()) => out.copy(balls[i]?.p ?? out);
  return g;
}
