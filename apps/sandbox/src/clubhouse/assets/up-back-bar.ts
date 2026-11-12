// 后吧酒柜（会员酒吧北墙，楼梯井和宴会厅门之间）：下面一组三扇门的红木矮柜 + 蜂蜜色台面（台面上一排倒扣的杯子），
// 台面后面一条青蓝的镜子；上面两根立柱夹着两层酒架，每层前沿一条亮着的暖黄灯边，架上一排排酒瓶（琥珀 / 绿 / 透明，2 × 3 纹素的块），
// 顶上一道檐口。1.8 × 2.27 × 0.5 米（20 × 25 × 6 设计纹素；h 比规格高 7 厘米：两层瓶子各要屏幕上 ≈ 3 行），背靠北墙、正面朝南（+z）。
// 上半截（镜子、酒架）是浅的（前沿离背板 0.13 米），下面的矮柜是满深 0.5。
// v0 满架；v1 = 活的信号"空了一格"：上层酒架中间空出一段（露出深色背板）→ 从后厨扛一箱上来补。
// 元素：矮柜门 planks（沿 x 每 0.6 米一扇门，缝 1 纹素）。酒瓶只建朝镜头的正面 + 顶面（yaw 0 下侧面看不见）。
// 三角形 v0 248 / v1 240（柜体 12、门芯 36、踢脚 + 背板 24、台面 12、镜子 12、立柱 + 檐口 36、两层架 24、杯子 36、酒瓶 4 × 14 / v1 4 × 12）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** 酒瓶：只要正面（朝 +z）和顶面，底在 y、正面在 z */
const bottle = (w: number, h: number, x: number, y: number, z: number) => [
  new THREE.PlaneGeometry(w, h).translate(x, y + h / 2, z),
  new THREE.PlaneGeometry(w, 0.08).rotateX(-Math.PI / 2).translate(x, y + h, z - 0.04),
];
const FRONT = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number] };
type Ramp = [number, number, number];

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material, dx = 0) => {
    const mesh = new THREE.Mesh(mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x))), m);
    mesh.position.x = dx;
    g.add(mesh);
  };
  const W = 1.8;
  const D = 0.5;
  const ZF = D / 2 - 0.05; // 矮柜正面（门芯凸出 0.05 到 D/2：包围盒的 d 正好 0.5）
  const ZB = -D / 2;
  const KICK = 0.1;
  const LOW = 0.82; // 矮柜高（台面底）
  const LEDGE = 0.08;
  const Y0 = LOW + LEDGE; // 台面 = 1.0
  const IN = W - 4 * T; // 两根立柱之间
  const ZP = ZB + 0.06; // 背板正面
  const ZS = ZP + 0.13; // 酒架前沿（上半截浅：前沿离背板 0.13，不然架子挡住下面的镜子、瓶子）
  const empty = ctx.variant % 2 === 1;

  // ── 矮柜：三扇门（planks 沿 x 每 0.6 米一扇）+ 门芯 + 踢脚 ──
  const doors = ctx.mat('timber', {
    ...FRONT,
    edge: 0.5,
    convex: 0.3,
    noShadowReceive: true,
    ramp: [0xe89a64, 0xb05e58, 0x7a4868],
    tones: {
      bands: [
        [0xe89a64, 0xf4a46c, 0xdc905c],
        [0xb05e58, 0xbc6860, 0xa45450], // L 111 / 121 / 101
        [0x7a4868, 0x86527a, 0x6e405e],
      ],
      seam: [0xc07454, 0x84404e, 0x5e3a5a],
      hi: [0xffb47a, 0xcc7868, 0x9a6080],
    },
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, W / 3], seam: 1, hi: 0 },
  });
  add([box(W, LOW - KICK, ZF - ZB, W / 2, KICK, (ZF + ZB) / 2)], doors, -W / 2);
  add(
    [0, 1, 2].map((i) =>
      box(
        W / 3 - 3 * T,
        LOW - KICK - 3.5 * T,
        0.05,
        -W / 2 + (i + 0.5) * (W / 3) + 0.5 * T,
        KICK + 1.5 * T,
        ZF + 0.025,
      ),
    ),
    ctx.mat('timber', {
      ...FRONT,
      ramp: [0xeea46e, 0xd4806a, 0x84506e],
      tones: undefined,
      bands: [-0.6, 1.01],
      edge: 0.35,
      convex: 0.6,
      noShadowReceive: true,
    }),
  );
  const darkWood = ctx.mat('timber', {
    ...FRONT,
    ramp: [0x9a6070, 0x8a5874, 0x4a2e52],
    tones: undefined,
    edge: 0.4,
    convex: 0.2,
    noShadowReceive: true,
  });
  // 踢脚（往里收 0.05）+ 上面的背板（立柱之间，深色：酒瓶的底子）
  add([box(W, KICK, ZF - ZB - 0.05, 0, 0, (ZF - 0.05 + ZB) / 2), box(IN, 2.2 - Y0, 0.06, 0, Y0, ZB + 0.03)], darkWood);
  // 台面：蜂蜜色，出柜面 0.04
  add(
    [box(W, LEDGE, ZF + 0.04 - ZB, 0, LOW, (ZF + 0.04 + ZB) / 2)],
    ctx.mat('wood', {
      ramp: [0xf0ac64, 0xc87c52, 0x6a3a5e],
      tones: undefined,
      lightUp: 0.4,
      bands: [-0.5, 0.45],
      edge: 0.55,
      convex: 0.4,
      noShadowReceive: true,
    }),
  );
  // 竖向排布（底 → 顶）：台面 1.0 · 镜子 3 纹素 · 下层架 1 纹素 · 酒瓶 3 纹素 · 上层架 · 酒瓶 · 檐口（只出挑到架子前沿，不挡上层的瓶子）
  const MIR = 0.34; // 屏幕上 ≈ 2.7 行，前面的架子挡掉 1 行
  const SH = T; // 架板厚（= 亮着的灯边）
  const BH = 0.34; // 瓶高：竖直 0.34 米 = 屏幕上 ≈ 2.7 行（2 × 3 纹素的块）
  const S1 = Y0 + MIR; // 下层架底
  const S2 = S1 + SH + BH + 0.02; // 上层架底
  const CY = S2 + SH + BH + 0.02; // 檐口底
  const TOPY = CY + 1.4 * T;
  // 镜子：台面上一条青蓝，贴在背板前面
  add(
    [box(IN, MIR, 0.02, 0, Y0, ZP + 0.01)],
    ctx.mat('glass', {
      ...FRONT,
      ramp: [0x8ad4e4, 0x58a8c8, 0x3c6aa0],
      tones: undefined,
      edge: 0.3,
      convex: 0.2,
      noShadowReceive: true,
    }),
  );
  // 两根立柱（2 纹素宽）+ 檐口（1.4 纹素高，前沿和立柱齐）
  const timber = ctx.mat('timber', {
    ...FRONT,
    ramp: [0xe89a64, 0xb86460, 0x7a4868],
    tones: undefined,
    edge: 0.5,
    convex: 0.4,
    noShadowReceive: true,
  });
  const ZC = ZS + 0.04; // 立柱、檐口前沿
  add(
    [
      box(2 * T, CY - Y0, ZC - ZB, -W / 2 + T, Y0, (ZC + ZB) / 2),
      box(2 * T, CY - Y0, ZC - ZB, W / 2 - T, Y0, (ZC + ZB) / 2),
      box(W, TOPY - CY, ZC - ZB + 0.02, 0, CY, (ZC + 0.02 + ZB) / 2),
    ],
    timber,
  );
  // 两层酒架：架板本身就是那条亮着的灯边（正面、顶面都落亮档的暖黄）
  add(
    [box(IN, SH, ZS - ZP, 0, S1, (ZS + ZP) / 2), box(IN, SH, ZS - ZP, 0, S2, (ZS + ZP) / 2)],
    ctx.mat('flowerYellow', {
      ramp: [0xffd27a, 0xf4b860, 0xb87a58],
      tones: undefined,
      lightUp: 0.9,
      bands: [-0.6, 0.15],
      edge: 0.3,
      convex: 0.2,
      noShadowReceive: true,
    }),
  );
  // 台面上一排倒扣的杯子（1.5 × 2 纹素，透明玻璃色），挡住镜子的下半
  add(
    [-6, -4.5, 3.5].map((k) => box(1.5 * T, 2 * T, 1.5 * T, k * T, Y0, 0.12)),
    ctx.mat('glass', {
      ...FRONT,
      ramp: [0xc8f0f0, 0x9cd4dc, 0x5a8ab0],
      tones: undefined,
      edge: 0.3,
      convex: 0.2,
      noShadowReceive: true,
    }),
  );

  // ── 酒瓶：每层 7 瓶，按 3 + 2 + 2 成组（组间 1～2 纹素的空）；颜色按种子轮着取 ──
  const rnd = ctx.rng('up-back-bar:bottles');
  const KIND = ['amber', 'green', 'clear'] as const;
  const groups: Record<(typeof KIND)[number], THREE.BufferGeometry[]> = { amber: [], green: [], clear: [] };
  const layout = [3, 2, 2];
  const gaps = [1, 2]; // 组间空几纹素
  const rowW = (layout.reduce((a, b) => a + b, 0) * 2 + gaps[0] + gaps[1]) * T;
  [S1 + SH, S2 + SH].forEach((y, row) => {
    let x = -rowW / 2;
    let prev = -1;
    layout.forEach((n, gi) => {
      for (let i = 0; i < n; i++) {
        let k = Math.floor(rnd() * 3);
        if (k === prev) k = (k + 1) % 3;
        prev = k;
        const tall = rnd() < 0.35 ? BH : BH - 0.5 * T;
        // v1：上层中间那组空着
        if (!(empty && row === 1 && gi === 1)) groups[KIND[k]].push(...bottle(2 * T, tall, x + T, y, ZS - 0.03));
        x += 2 * T;
      }
      x += (gaps[gi] ?? 0) * T;
    });
  });
  const glassBottle = (ramp: Ramp) =>
    ctx.mat('glass', {
      ramp,
      tones: undefined,
      lightUp: 0.9,
      bands: [-0.6, 0.15],
      edge: 0.35,
      convex: 0.2,
      noShadowReceive: true,
    });
  add(groups.amber, glassBottle([0xe8963c, 0xc8742c, 0x7a4040]));
  add(groups.green, glassBottle([0x52aa5a, 0x3a8a52, 0x2a5a52]));
  add(groups.clear, glassBottle([0x74b0b8, 0x6aa0b0, 0x46709c]));
  ctx.mats.prepare(g);
  return g;
}
