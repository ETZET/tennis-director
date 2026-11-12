// 球赛电视（会员休息室北墙，壁炉东边，板底离地 1.3 = slot 的 y）：1.05 × 0.62 × 0.12 米（12 × 7 × 1 设计纹素）。
// 深灰蓝的边框（下巴 1 屏幕行），屏幕（10 纹素 × 3 行）里是转播画面：墨绿的看台（上一行 + 左右 1 纹素）框着草地球场
// （亮档，8 纹素 × 2.5 行）→ 两个 1 纹素的球员（近端红、远端蓝）→ 一个黄绿的球在两人之间来回（userData.update，按纹素 / 屏幕行跳，0.9 秒一拍）。
// 屏幕各层 lightUp 1 + 很低的 bands：永远落亮档（发光的屏，不跟太阳）。相邻色亮度差 < 60（边框 ≈ 92、看台 125、草地 175、球 226）。
// 三角形 22（边框 12、看台 2、球场 2、两人 4、球 2）。userData.update(dt, t)。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';

/** 竖直的四边形（贴在 z 上），按 [x, y] 逆时针给四个角 */
function quad(pts: [number, number][], z: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p: number[] = [];
  for (const i of [0, 1, 2, 0, 2, 3]) p.push(pts[i][0], pts[i][1], z);
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  return g;
}
const rect = (x0: number, y0: number, x1: number, y1: number, z: number) =>
  quad(
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    z,
  );

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = T / Math.SQRT1_2; // 竖直面上一屏幕行
  const g = new THREE.Group();
  const W = 1.05;
  const H = 0.62;
  const D = 0.12;

  g.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(W, H, D - 0.04).translate(0, H / 2, -0.02),
      ctx.mat('ironwork', {
        tones: undefined,
        ramp: [0x7880c8, 0x5c5cb4, 0x34347e],
        lightUp: 0.55,
        bands: [-0.45, 0.35],
        edge: 0.3,
        convex: 0.4,
        noShadowReceive: true,
      }),
    ),
  );
  const glow = {
    tones: undefined,
    lightUp: 1,
    bands: [-2, -1.5] as [number, number],
    edge: 0,
    convex: 0,
    noShadowReceive: true,
  };
  // 屏幕各层每层往前 1 厘米（2 毫米在 45° 下深度精度不够，上半截被边框盖住）；最前的球在 z = D/2
  const z = D / 2 - 0.04;
  // 屏幕：左右上 1 纹素边，下巴 1 屏幕行
  const sx = W / 2 - T;
  const y0 = 1.5 * R; // 下巴 1～2 屏幕行
  const y1 = H - 0.6 * R; // 顶边 + 顶面 ≈ 1 行
  const ys = y1 - R; // 看台 = 屏幕最上一行 + 左右 1 纹素
  g.add(
    new THREE.Mesh(
      rect(-sx, y0, sx, y1, z + 0.01),
      ctx.mat('windscreen', { ...glow, ramp: [0x3aa078, 0x2e8064, 0x1e5450] }),
    ),
  );
  // 球场：草地（亮档），8 纹素宽、2.5 行高
  const cx = sx - T;
  g.add(
    new THREE.Mesh(rect(-cx, y0, cx, ys, z + 0.02), ctx.mat('lawn', { ...glow, ramp: [0x80d860, 0x5ca852, 0x2c6262] })),
  );
  // 两个球员：近端（下）一个红、远端（上）一个蓝（各 1 纹素 × 1 屏幕行）
  g.add(
    new THREE.Mesh(
      rect(-3 * T, y0, -2 * T, y0 + R, z + 0.03),
      ctx.mat('clothRed', { ...glow, ramp: [0xf05050, 0xb43c4c, 0x62285a] }),
    ),
  );
  g.add(
    new THREE.Mesh(
      rect(2 * T, ys - R, 3 * T, ys, z + 0.03),
      ctx.mat('clothBlue', { ...glow, ramp: [0x6a8cff, 0x3a5cac, 0x2a3274] }),
    ),
  );
  // 球：在两人之间来回（x 按纹素、y 按屏幕行跳），0.9 秒一拍
  const ball = new THREE.Mesh(
    rect(-T / 2, 0, T / 2, R * 0.8, z + 0.04),
    ctx.mat('ball', { ...glow, ramp: [0xd8e848, 0xb8d044, 0x6a8a5a] }),
  );
  g.add(ball);
  const place = (t: number) => {
    const ph = (t / 0.9) % 2;
    const f = ph < 1 ? ph : 2 - ph;
    ball.position.set(Math.round(f * 4 - 2) * T, f < 0.5 ? y0 + 0.01 : ys - R + 0.01, 0);
  };
  place(0);
  g.userData.update = (_dt: number, t: number) => place(t);

  ctx.mats.prepare(g);
  return g;
}
