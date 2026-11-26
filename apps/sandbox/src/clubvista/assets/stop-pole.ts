// stop-pole：接驳车站牌。一根 2 纹素的方杆（银灰）+ 杆顶一块俱乐部蓝的牌子（9 纹素 × 6 行，朝镜头 +z），
// 牌上一个白色的巴士小图标（方块拼：横长车身、中间一行三个车窗的空、下面两个轮子点，不写字）；
// 杆腰一块小时刻表（浅色小板，不写字），脚下一块 1 纹素厚的水泥墩。
// 脚印 0.3 × 0.3，高 2.6 米；牌子比杆宽（0.81 米），图标要按纹素拼得出来。
// 材质：杆 carSilver、牌子 counter、图标 clothWhite（亮档，牌子上唯一的亮色）、时刻表 stucco、墩 curb。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const ROW = T / Math.SQRT1_2;
const H = 2.6;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error('stop-pole: merge failed');
  return g;
}

/** 朝镜头的竖面：光往上偏、档位阈值往下挪 */
const FACE = { lightUp: 0.5, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };

/**
 * 巴士图标（牌子里面 7 × 4，从上往下）：# = 白。横长的车身 + 三个窗 + 两个分得很开的轮子
 * （5 × 4 的"两窗两轮"试过：正方的比例读成一张脸）
 */
const ICON = ['#######', '#.#.#.#', '#######', '.#...#.'];

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'stop-pole';
  const pole: THREE.BufferGeometry[] = [];
  const sign: THREE.BufferGeometry[] = [];
  const icon: THREE.BufferGeometry[] = [];
  const panel: THREE.BufferGeometry[] = [];
  const base: THREE.BufferGeometry[] = [];

  // 墩 + 杆
  base.push(box(3 * T, T, 3 * T, 0, T / 2, 0));
  // 杆顶藏在牌子后面（杆比牌顶低 2 行，不然 45° 下杆头从牌子上面冒出来一截）
  const ph0 = H - 2 * ROW - T;
  pole.push(box(2 * T, ph0, 2 * T, 0, T + ph0 / 2, 0));

  // 牌子：9 × 6，顶沿齐杆顶，挂在杆的前面（+z）
  const sw = 9 * T;
  const sh = 6 * ROW;
  const st = 1.5 * T;
  const sz = T + st / 2;
  const sy0 = H - sh;
  sign.push(box(sw, sh, st, 0, sy0 + sh / 2, sz));
  // 图标：牌子里面 7 × 4，四边各留 1 纹素 / 1 行
  const zf = sz + st / 2 + 0.01;
  ICON.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '#') continue;
      const x = (c - 3) * T;
      const y = H - ROW * (1.5 + r);
      icon.push(box(T, ROW, 0.02, x, y, zf));
    }
  });

  // 时刻表：杆腰一块 3 纹素 × 4 行的浅色小板（和牌子之间隔开几行，不连成一根"脖子"）
  const pw = 3 * T;
  const ph = 4 * ROW;
  panel.push(box(pw, ph, T, 0, 0.95 + ph / 2, T + T / 2));

  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => g.add(new THREE.Mesh(merge(geos), mat));
  add(pole, ctx.mat('carSilver', { ...FACE, convex: 0.3 }));
  add(sign, ctx.mat('counter', { ...FACE, convex: 0.2 }));
  // 图标落亮档（面朝镜头本该是中档）：小牌子上要一眼认出是巴士
  add(icon, ctx.mat('clothWhite', { lightUp: 0.5, bands: [-0.9, -0.6], noShadowReceive: true, edge: 0, convex: 0 }));
  add(panel, ctx.mat('stucco', { ...FACE, convex: 0.3 }));
  add(base, ctx.mat('curb', { convex: 0.3 }));
  ctx.mats.prepare(g, { receive: false });
  return g;
}
