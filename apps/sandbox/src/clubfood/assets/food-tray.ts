// #18 food-tray：一只红托盘 + 一块吃的 + 一只杯子（桌上十几只、人端着两只）。
// 尺寸 0.45（x）× 0.1（托盘高 0.04，吃的顶到 0.12～0.2）× 0.34；三角形 v0 48 / v1 47 / v2 60 / v3 56 / v4 60（上限 60）。
// 本地原点 = 托盘底面中心（放桌上：y = 桌面高）。吃的在左前（x < 0），杯子在右后（x > 0），45° 俯视下杯子不挡吃的。
// 变体（ctx.variant % 5）：
//   v0 塔可：V 形饼皮（bun，后沿内侧朝天 = 亮）夹橙色馅（accTaco）+ 一撮生菜（accBurger）
//   v1 一角披萨：尖朝镜头的三角（flowerYellow 奶酪）+ 后沿饼边（bun）+ 一颗肠片（accPizza）
//   v2 汉堡：肉饼（hair 深棕）/ 生菜（accBurger，往外多出一圈）/ 上胚圆顶（bun）；下胚 45° 下被肉饼挡住，没画
//   v3 薯条：红纸筒（accPizza）+ 一捧薯条和两根冒出来的竖条（flowerYellow；竖条朝镜头的面落中档 = 金棕，不用另开 bun）
//   v4 吃剩的脏托盘：揉皱的餐巾一团（clothWhite，切面）+ 倒在托盘上的空杯 + 几粒碎屑（bun）、一抹酱（accPizza）；没有成块的吃的
// 托盘：一个盒子（亮档红 = 托盘沿）+ 盘底一块往镜头斜的法线（落中档 = 盘心暗一档，读成"沿"一圈 1 纹素）。
// 所有材质不接投影（凉棚板条的影子落在小东西上是麻点），竖直面 lightUp 抬到中档。几何体按变体缓存在模块级。
//
// userData：
//   grip = { at: [-0.2, 0.03, 0], at2: [0.2, 0.03, 0], axis: [1, 0, 0], up: [0, 1, 0] }
//     双手端：右手握左短边（本地 −x）、左手握右短边（+x）；axis 从右手指向托盘另一头，up = 托盘的上面
//   dirty  true = v4（吃剩的，总监要收）
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import type { Pal } from '../palette';

const TW = 0.45;
const TD = 0.34;
const TH = 0.04;
/** 吃的中心（左前）、杯子中心（右后） */
const FX = -0.08;
const FZ = 0.03;
const CX = 0.135;
const CZ = -0.06;

type Part = [keyof Pal, THREE.BufferGeometry];

/**
 * 盒子（中心 x、z，底在 y），去掉底面（−y）；skipTop 再去掉顶面；onlyFront = 只留顶面和朝镜头的 +z 面（竖条）
 */
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  skipTop = false,
  onlyFront = false,
): THREE.BufferGeometry {
  const b = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  // BoxGeometry 的面组顺序：+x, −x, +y, −y, +z, −z（每面 6 个索引）
  const idx = b.getIndex()!.array;
  const keep: number[] = [];
  for (let f = 0; f < 6; f++) {
    if (f === 3 || (skipTop && f === 2) || (onlyFront && f !== 2 && f !== 4)) continue;
    for (let k = 0; k < 6; k++) keep.push(idx[f * 6 + k]);
  }
  b.setIndex(keep);
  b.clearGroups();
  return b.toNonIndexed();
}

/** 三角形面片（世界点，逆时针朝外），法线按面算 */
function tris(pts: number[][]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pts.length / 1) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

/** 水平小方块（y 高处朝天的一块），可以给一个斜法线让它落中档 */
function flat(
  w: number,
  d: number,
  x: number,
  y: number,
  z: number,
  n?: [number, number, number],
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d)
    .rotateX(-Math.PI / 2)
    .translate(x, y, z)
    .toNonIndexed();
  if (n) {
    const v = new THREE.Vector3(...n).normalize();
    const a = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) a.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** 托盘 + 一只直立的杯子（v0..v3 共用） */
function trayParts(): Part[] {
  return [
    [
      'flowerRed',
      mergeGeometries([box(TW, TH, TD, 0, 0, 0), flat(TW - 0.18, TD - 0.2, 0, TH + 0.002, 0, [0, 0.5, 1])]),
    ],
  ];
}
function cupUpright(): Part {
  return [
    'clothWhite',
    mergeGeometries([box(0.15, 0.13, 0.15, CX, TH, CZ, true), box(0.17, 0.03, 0.17, CX, TH + 0.13, CZ)]),
  ];
}

function variantParts(v: number): Part[] {
  const y0 = TH;
  switch (v) {
    case 0: {
      // 塔可：沿 x 放的 V 形饼皮（截面：底 (z 0)、前沿 (+0.08, 0.13)、后沿 (−0.08, 0.13)）
      const x0 = FX - 0.15;
      const x1 = FX + 0.15;
      const zf = FZ + 0.085;
      const zb = FZ - 0.085;
      const yt = y0 + 0.13;
      const yb = y0;
      const shell = tris([
        // 前外面（朝前下 → 中档）
        [x0, yb, FZ],
        [x1, yb, FZ],
        [x1, yt, zf],
        [x0, yb, FZ],
        [x1, yt, zf],
        [x0, yt, zf],
        // 后沿的内面（朝前上 → 亮档）
        [x0, yb, FZ],
        [x1, yt, zb],
        [x0, yt, zb],
        [x0, yb, FZ],
        [x1, yb, FZ],
        [x1, yt, zb],
        // 两头的三角
        [x0, yb, FZ],
        [x0, yt, zf],
        [x0, yt, zb],
        [x1, yb, FZ],
        [x1, yt, zb],
        [x1, yt, zf],
      ]);
      return [
        ['bun', shell],
        // 馅：V 里一条，比饼皮沿低一点
        ['accTaco', box(0.26, 0.03, 0.1, FX, y0 + 0.07, FZ, false)],
        // 生菜：馅上面靠后一撮（3 纹素长）
        ['accBurger', flat(0.27, 0.07, FX + 0.01, y0 + 0.105, FZ - 0.02)],
      ];
    }
    case 1: {
      // 一角披萨：后沿宽、尖朝镜头偏左
      const yb = y0;
      const yt = y0 + 0.03;
      const bl = [FX - 0.16, FZ - 0.1];
      const br = [FX + 0.16, FZ - 0.1];
      const tip = [FX - 0.04, FZ + 0.18];
      const cheese = tris([
        [bl[0], yt, bl[1]],
        [tip[0], yt, tip[1]],
        [br[0], yt, br[1]],
        // 朝前的两个侧面
        [bl[0], yb, bl[1]],
        [tip[0], yb, tip[1]],
        [tip[0], yt, tip[1]],
        [bl[0], yb, bl[1]],
        [tip[0], yt, tip[1]],
        [bl[0], yt, bl[1]],
        [tip[0], yb, tip[1]],
        [br[0], yb, br[1]],
        [br[0], yt, br[1]],
        [tip[0], yb, tip[1]],
        [br[0], yt, br[1]],
        [tip[0], yt, tip[1]],
      ]);
      return [
        ['flowerYellow', cheese],
        // 饼边：后沿一条鼓起来的烤边（3 纹素长）
        ['bun', box(0.32, 0.07, 0.09, FX - 0.01, yb, FZ - 0.12)],
        // 一颗肠片（1 纹素 × 1 行；两颗就把奶酪盖没了）
        ['accPizza', flat(0.09, 0.1, FX - 0.03, yt + 0.003, FZ - 0.0)],
      ];
    }
    case 2: {
      // 汉堡：每层往外多出来一点，45° 下每层都露出 ≥ 1 行
      const cx = FX - 0.01;
      const cz = FZ;
      return [
        [
          'bun',
          mergeGeometries([
            // 上胚：盒子 + 球面法线（材质给）= 圆顶。下胚 45° 下看不到（被肉饼挡住），省掉
            box(0.27, 0.1, 0.23, cx, y0 + 0.14, cz - 0.01),
          ]),
        ],
        ['patty', box(0.26, 0.09, 0.22, cx, y0 + 0.02, cz)],
        ['accBurger', box(0.29, 0.03, 0.25, cx, y0 + 0.11, cz + 0.01)],
      ];
    }
    case 3: {
      // 薯条：红纸筒（前低后高的盒子）+ 一捧薯条冒出来 + 两根竖条
      const cx = FX - 0.01;
      const cz = FZ + 0.01;
      const sticks: THREE.BufferGeometry[] = [];
      for (const [dx, h, dz] of [
        [-0.07, 0.1, 0.0],
        [0.06, 0.13, -0.03],
      ] as [number, number, number][]) {
        // 1 纹素宽的竖条：一个细盒子（去底）
        sticks.push(box(0.09, h, 0.05, cx + dx, y0 + 0.14, cz + dz, false, true));
      }
      return [
        ['accPizza', box(0.27, 0.13, 0.15, cx, y0, cz, true)],
        ['flowerYellow', mergeGeometries([box(0.25, 0.04, 0.13, cx, y0 + 0.12, cz - 0.005), ...sticks])],
      ];
    }
    default: {
      // 吃剩的：揉皱的餐巾（切面团）在左、倒下的空杯在右后、几粒碎屑 + 一抹酱
      const nap = new THREE.IcosahedronGeometry(0.1, 0).scale(1.25, 0.75, 1.05);
      const p = nap.getAttribute('position') as THREE.BufferAttribute;
      // 固定的揉皱（不用随机：同一个变体每只都一样，几何体只建一次）
      const jit = [0.9, 1.15, 1.0, 0.85, 1.1, 0.95, 1.2, 0.9, 1.05, 0.88, 1.12, 0.97];
      const tmp = new THREE.Vector3();
      const seen = new Map<string, number>();
      for (let i = 0; i < p.count; i++) {
        tmp.fromBufferAttribute(p, i);
        const key = `${tmp.x.toFixed(3)},${tmp.y.toFixed(3)},${tmp.z.toFixed(3)}`;
        let k = seen.get(key);
        if (k === undefined) {
          k = jit[seen.size % jit.length];
          seen.set(key, k);
        }
        p.setXYZ(i, tmp.x * k + FX - 0.04, Math.max(tmp.y * k + 0.07 + y0, y0), tmp.z * k + FZ + 0.01);
      }
      nap.computeVertexNormals();
      // 倒下的杯子：杯身横躺（沿 x），杯盖在右头；整只往里转一点
      const cup = mergeGeometries([box(0.17, 0.13, 0.13, 0, 0, 0), box(0.03, 0.15, 0.15, 0.1, -0.01, 0)])
        .rotateY(0.45)
        .translate(CX - 0.01, y0, CZ + 0.02);
      return [
        ['clothWhite', mergeGeometries([nap.index ? nap.toNonIndexed() : nap, cup])],
        [
          'bun',
          mergeGeometries([
            flat(0.09, 0.12, FX + 0.08, y0 + 0.004, FZ + 0.1),
            flat(0.09, 0.12, FX - 0.15, y0 + 0.004, FZ + 0.11),
            flat(0.09, 0.12, CX + 0.02, y0 + 0.004, FZ + 0.1),
          ]),
        ],
        ['accPizza', flat(0.18, 0.1, FX + 0.06, y0 + 0.003, FZ - 0.1)],
      ];
    }
  }
}

const cache = new Map<number, Part[]>();
function partsFor(v: number): Part[] {
  let p = cache.get(v);
  if (!p) {
    p = [...trayParts(), ...variantParts(v), ...(v < 4 ? [cupUpright()] : [])];
    cache.set(v, p);
  }
  return p;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ((ctx.variant % 5) + 5) % 5;
  const g = new THREE.Group();
  g.name = `food-tray-v${v}`;
  // 朝天的面亮档、朝镜头的竖面中档；小东西不接投影
  const base: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true, convex: 0.25, edge: 0.45 };
  const extra: Partial<Record<keyof Pal, ToonOpts>> = {
    // 上胚、餐巾团：球面法线（圆顶 / 一团）
    bun: v === 2 ? { sphereNormals: [FX - 0.01, TH + 0.08, FZ] } : {},
  };
  for (const [key, geo] of partsFor(v)) {
    g.add(new THREE.Mesh(geo, ctx.mat(key, { ...base, ...extra[key] })));
  }
  g.userData.grip = { at: [-0.2, 0.03, 0], at2: [0.2, 0.03, 0], axis: [1, 0, 0], up: [0, 1, 0] };
  g.userData.dirty = v === 4;
  ctx.mats.prepare(g, { cast: true, receive: false });
  return g;
}
