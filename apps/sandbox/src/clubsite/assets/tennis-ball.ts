// tennis-ball：网球（clubcourts #11；捡球、发球机、训练、以后的中心球场共用）。真球 ⌀ 0.067 米在 0.09 米/纹素下不到一个纹素，
// 照 pickleball 的做法放大到 ⌀ 0.2（≈ 2 设计纹素 = 1× 像素下 4～5 个像素）：亮档是画面里最亮、最艳的黄绿点之一，最下面一行落中档；
// 投影是地上一个往镜头偏的暗点（太阳在后上方），在青蓝场地、外场绿、沙上都读得出"球在这"。不画缝线（4 像素的球上，白缝贴着亮黄看不见）。
// 本地原点 = 球下面的地面（y 0）：SLOTS 不填 y 的球落地；空中的球 SLOTS 给 y = 球底的高度。
// 全部用 InstancedMesh（几何体、材质按 ctx.mats 缓存）：散一地 = 1 个 draw call（+ 投影）。
// 变体：v0 一个球（落地）· v1 散一地（画廊演示：5 × 3 米里 18 个，成簇）。
// userData（每个变体都有，stage 3 捡球 / 发球机 / 训练用；坐标都是本地米）：
//   setBalls(points)           points = [x, z]（落地）或 [x, y, z]（y = 球心高）
//   add(x, y, z) → 下标         加一个（y = 球心高；落地的球 y = R）
//   setBall(i, x, y, z)        挪第 i 个（飞着的球每帧调；不重建，只改实例矩阵）
//   remove(i)                  拿走第 i 个（捡球器经过）；后面的下标往前挪
//   count()                    还剩几个
//   ballAt(i, out?)            第 i 个的球心（本地）
//   nearest(x, z, r = ∞) → 下标 | −1   离 (x, z) 最近的那个（捡球器用）
// 别的资产要用同一个球（发球机的球斗）：import { ballKit, BALL_R }。
import * as THREE from 'three';
import type { Mats } from '../../clubfront/toon';
import type { NetCtx } from './nets/kit';

/** 网球的三档 [亮, 中, 暗]（本地色，建议核心代理提成调色板的 `tennisBall`）：L 200 / 157 / 109 */
export const BALL_RAMP: [number, number, number] = [0xa4ee2c, 0x80c432, 0x4a804a];
/** 球的半径（米，放大过的） */
export const BALL_R = 0.1;
type Pt = [number, number] | [number, number, number];

export interface BallKit {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}
const KITS = new WeakMap<Mats, BallKit>();

/** 球的几何体 + 材质（每套 mats 一份） */
export function ballKit(ctx: NetCtx): BallKit {
  const k = KITS.get(ctx.mats);
  if (k) return k;
  // 一个二十面体（20 个三角形），法线 = 球面：三档按球面分（上亮、腰亮、最下一行中档）
  const geo = new THREE.IcosahedronGeometry(BALL_R, 0);
  const p = geo.getAttribute('position');
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  // 4～5 像素的小东西：不描边（描边会把每个像素都压暗成灰），档位往下放 —— 只有最下面一行落中档
  // 颜色本地挑（不用调色板的 `ball`）：`ball` 的亮档 #e8ff50 已经贴着 sRGB 边，午后配色亮档 +9 再乘暖阳光以后
  // 画面是奶油色 #ffeca7（S 0.35，像一颗黄油豆）。亮档先降一点亮度、留住彩度：画面 ≈ 荧光黄绿
  const kit: BallKit = {
    geo,
    mat: ctx.mats.toon(0xffffff, {
      ramp: BALL_RAMP,
      edge: 0,
      convex: 0.2,
      lightUp: 0.5,
      bands: [-0.75, -0.25],
      noShadowReceive: true,
    }),
  };
  KITS.set(ctx.mats, kit);
  return kit;
}

export function build(ctx: NetCtx): THREE.Object3D {
  const kit = ballKit(ctx);
  const g = new THREE.Group();
  g.name = 'tennis-ball';
  const balls: THREE.Vector3[] = [];
  let mesh: THREE.InstancedMesh | null = null;
  const m4 = new THREE.Matrix4();

  function rebuild() {
    const want = Math.max(4, balls.length);
    if (!mesh || want > mesh.instanceMatrix.count) {
      if (mesh) {
        g.remove(mesh);
        mesh.dispose();
      }
      mesh = new THREE.InstancedMesh(kit.geo, kit.mat, Math.max(want, (mesh?.instanceMatrix.count ?? 0) * 2));
      mesh.frustumCulled = false;
      ctx.mats.prepare(mesh, { cast: true, receive: false });
      g.add(mesh);
    }
    const im = mesh;
    balls.forEach((b, i) => {
      im.setMatrixAt(i, m4.makeTranslation(b.x, b.y, b.z));
    });
    mesh.count = balls.length;
    mesh.instanceMatrix.needsUpdate = true;
  }

  const toV = (q: Pt) => (q.length === 2 ? new THREE.Vector3(q[0], BALL_R, q[1]) : new THREE.Vector3(q[0], q[1], q[2]));
  function setBalls(points: Pt[]) {
    balls.length = 0;
    for (const q of points) balls.push(toV(q));
    rebuild();
  }

  if (ctx.variant === 1) {
    // 散一地（画廊演示）：5 × 3 米里 18 个，成簇（真散落的球会滚到一起、停在线边），不是均匀撒
    const rnd = ctx.rng('tennis-ball:scatter');
    const clumps = [
      [-1.6, -0.5],
      [0.5, 0.6],
      [1.9, -0.8],
    ];
    const pts: Pt[] = [];
    for (let i = 0; i < 18; i++) {
      const c = clumps[i % 3];
      const a = rnd() * Math.PI * 2;
      const r = 0.22 + rnd() * (i < 12 ? 0.7 : 2.0);
      pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 0.7]);
    }
    setBalls(pts);
  } else setBalls([[0, 0]]);

  g.userData.setBalls = setBalls;
  g.userData.add = (x: number, y: number, z: number) => {
    balls.push(new THREE.Vector3(x, y, z));
    rebuild();
    return balls.length - 1;
  };
  g.userData.setBall = (i: number, x: number, y: number, z: number) => {
    const b = balls[i];
    if (!b || !mesh) return;
    b.set(x, y, z);
    mesh.setMatrixAt(i, m4.makeTranslation(x, y, z));
    mesh.instanceMatrix.needsUpdate = true;
  };
  g.userData.remove = (i: number) => {
    if (i < 0 || i >= balls.length) return;
    balls.splice(i, 1);
    rebuild();
  };
  g.userData.count = () => balls.length;
  g.userData.ballAt = (i: number, out = new THREE.Vector3()) => out.copy(balls[i] ?? out);
  g.userData.nearest = (x: number, z: number, r = Number.POSITIVE_INFINITY) => {
    let best = -1;
    let bd = r;
    balls.forEach((b, i) => {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d <= bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  return g;
}
