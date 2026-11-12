// 监控墙（#76，总监办公室北墙两扇窗之间，板底离地 0.9 = slot 的 y）：1.71 × 1.15 × 0.12 米 = 19 纹素 × 9 屏幕行 × 1.3 纹素。
// 深靛的外框（四周和格子之间各 1 纹素 / 1 行），里面 3 × 2 六块屏（每块 5 纹素 × 3 行）：青 / 蓝相间的发光画面
// （上两行是画面、最下一行是亮一级的"地面"，有的格里站着一个 1 纹素的深色人影）；右上那格是红的 = 别处出事了（活的信号）。
// 屏幕各层 lightUp 1 + 很低的 bands：永远落亮档（发光的屏，不跟太阳）。
// userData.update(dt, t)：红格每秒闪一次（亮红 0.5 秒 / 暗红 0.5 秒），只切换一块网格的 visible。
// 三角形 54（外框 12、屏 12、地面 12、人影 6、红格 4 + 亮红 4 + 警示块 4）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const rect = (x0: number, y0: number, x1: number, y1: number, z: number) =>
  new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = T * Math.SQRT2; // 竖直面上一屏幕行
  const g = new THREE.Group();
  g.name = 'up-cctv-wall';
  const W = 19 * T;
  const H = 9 * R;
  const D = 0.12;

  g.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(W, H, D - 0.04).translate(0, H / 2, -0.02),
      ctx.mat('ironwork', {
        tones: undefined,
        ramp: [0x7880c8, 0x5050a4, 0x30306e],
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
  const mat = (key: 'clothTeal' | 'clothBlue' | 'clothRed', c: number) => ctx.mat(key, { ...glow, ramp: [c, c, c] });
  const z0 = D / 2 - 0.04;
  // 格子：列 c = 0..2、行 r = 0（下）/ 1（上）
  const cx0 = (c: number) => -W / 2 + T + c * 6 * T;
  const cy0 = (r: number) => R + r * 4 * R;
  const RED: [number, number] = [2, 1];
  const teal: THREE.BufferGeometry[] = [];
  const blue: THREE.BufferGeometry[] = [];
  const floor: THREE.BufferGeometry[] = [];
  const fig: THREE.BufferGeometry[] = [];
  // 人影在格里的 x（纹素，−1 = 没人）
  const who = [
    [1, -1, 3],
    [3, 2, -1],
  ];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 3; c++) {
      if (c === RED[0] && r === RED[1]) continue;
      const x = cx0(c);
      const y = cy0(r);
      ((c + r) % 2 === 0 ? teal : blue).push(rect(x, y, x + 5 * T, y + 3 * R, z0 + 0.01));
      floor.push(rect(x, y, x + 5 * T, y + R, z0 + 0.02));
      const w = who[r][c];
      if (w >= 0) fig.push(rect(x + w * T, y + R, x + (w + 1) * T, y + 2 * R, z0 + 0.03));
    }
  g.add(new THREE.Mesh(mergeGeometries(teal), mat('clothTeal', 0x34b4c0)));
  g.add(new THREE.Mesh(mergeGeometries(blue), mat('clothBlue', 0x4a8ee0)));
  g.add(new THREE.Mesh(mergeGeometries(floor), mat('clothTeal', 0x7ce4dc)));
  g.add(new THREE.Mesh(mergeGeometries(fig), mat('clothBlue', 0x2c4c98)));

  // 红格：暗红底（常在）+ 亮红（闪）+ 中间一块 1 纹素 × 1 行的亮黄警示块
  const rx = cx0(RED[0]);
  const ry = cy0(RED[1]);
  g.add(new THREE.Mesh(rect(rx, ry, rx + 5 * T, ry + 3 * R, z0 + 0.01), mat('clothRed', 0xc43a54)));
  const on = new THREE.Group();
  on.add(new THREE.Mesh(rect(rx, ry, rx + 5 * T, ry + 3 * R, z0 + 0.02), mat('clothRed', 0xff5a4a)));
  g.add(on);
  g.add(new THREE.Mesh(rect(rx + 2 * T, ry + R, rx + 3 * T, ry + 2 * R, z0 + 0.03), mat('clothRed', 0xffd870)));

  ctx.mats.prepare(g);
  g.traverse((o) => {
    o.castShadow = false;
  });
  g.userData.update = (_dt: number, t: number) => {
    on.visible = Math.floor(t * 2) % 2 === 0;
  };
  return g;
}
