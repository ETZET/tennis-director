// 泳池（5×7 格，15 × 21 米）：抬高的石板池畔 + 圆角的青绿泳池 + 白灰泥矮墙一圈 + 躺椅、遮阳伞、蒲葵。
// 入口在门格 (2, 6)：南墙正中断开 2.6 米，三级台阶下到地面，两边各一根门柱。
// 照 clubpool 的做法（clubpool/terrain.ts）：
// - 池畔平台抬高 0.36 米（地块的地面在 y 0，池子不能挖下去）：顶面石板（flagstone，石板元素），侧面白灰泥（stucco，朝镜头的南沿是暗带）；
// - 池子：8.8 × 10.8 米的圆角矩形，浅奶油混凝土压顶（concrete，比平台高 0.08）一圈；压顶到水面这一截是水线花砖（talavera，北池壁朝镜头 =
//   水面上一条蓝花砖带）；水面（poolWater，toon 的 water 元素：北岸脚下一条天光亮带、离岸远的深处、慢慢漂的斑块 = 会动的水）。
//   池水、花砖、躺椅垫借组调色（gnd-kit 的 pmat，同 clubpool 的 PROXY + SUN_SKIP）。
// - 东北角一副不锈钢扶梯（两根弯扶手 + 两级踏板，carSilver）。
// - 矮墙（画的）：平台外沿一圈 0.42 米高的白灰泥墙 + 陶砖压顶（cap），门口两根高一点的门柱。
// 新画的：躺椅（clothWhite 白框 + accCushion 橘子橙垫 + 偶尔一条 canvasStripe 毛巾），南边 4 张、东边 2 张，全部合并成每种材质一个网格。
// 复用：clubsite 的场边遮阳伞（clay 款，蓝白帆布、胖木杆）3 把；clubsite/nature 的蒲葵 2 棵（缩到 ≈ 0.45 倍放在北边两个角）；
//   clubdesk 的毛巾车（西边池畔）、门口两只陶罐 + 龙舌兰（clubdesk 的 pot + clubsite 的 agave）；变体偶数时池里漂一个火烈鸟色的游泳圈（accFlamingo，画的）。
// 本地原点 = 占地中心，+z 朝镜头。
import * as THREE from 'three';
import { build as pot } from '../../clubdesk/assets/pot';
import { build as towelCart } from '../../clubdesk/assets/towel-cart';
import { buildClay as courtUmbrella } from '../../clubsite/assets/umbrella';
import { build as agave } from '../../clubsite/nature/agave';
import { build as fanPalm } from '../../clubsite/nature/fan-palm';
import { box, topGeo, wallGeo } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { Bucket, bar, finish, type Key, place, reuse, roundRect, type V2, waterGrid } from './gnd-kit';

/** 占地半宽、半深（留 0.1 米） */
const HX = 7.4;
const HZ = 10.4;
/** 高度：池畔平台、压顶、水面 */
const DECK = 0.36;
const COPE = 0.44;
const WATER = 0.12;
/** 池子（水的轮廓） */
const POOL = { x0: -4.4, x1: 4.4, z0: -8.0, z1: 2.8, r: 1.5 };
const COPING = 0.36;
/** 矮墙：厚、高（平台以上）、压顶 */
const WT = 0.24;
const WH = 0.42;
const CAP = 0.08;
/** 门口（南墙断开）半宽、台阶纵深 */
const GATE = 1.3;
const STEP_D = 0.42;

/** 道具的明暗（同 clubsite 的长椅）：光往上偏一半 → 立起的靠背（朝镜头、背着太阳）落中档，还读得出橘色 */
const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number] };

/** 一张躺椅（本地：头朝 −z、长 2.0 米沿 z，原点 = 中心地面）的几何体，按材质分 */
function lounger(towel: boolean, flat: boolean): [Key, THREE.BufferGeometry][] {
  const out: [Key, THREE.BufferGeometry][] = [];
  const L = 2.0;
  // 白框：两条边框 + 四条腿
  out.push(['clothWhite', box(0.09, 0.09, L, -0.33, 0.2, 0)]);
  out.push(['clothWhite', box(0.09, 0.09, L, 0.33, 0.2, 0)]);
  for (const x of [-0.31, 0.31])
    for (const z of [-L / 2 + 0.12, L / 2 - 0.12]) out.push(['clothWhite', box(0.09, 0.2, 0.09, x, 0, z)]);
  // 座垫（脚那段 1.25 米）
  out.push(['accCushion', box(0.66, 0.1, 1.25, 0, 0.29, L / 2 - 0.66)]);
  // 靠背（头那段 0.72 米）：立起 ≈ 40°（flat = 放平）
  const ang = flat ? 0 : (40 * Math.PI) / 180;
  const back = new THREE.BoxGeometry(0.66, 0.1, 0.72).translate(0, 0.05, -0.36);
  back.rotateX(ang);
  back.translate(0, 0.29, -L / 2 + 0.72 + 0.04);
  out.push(['accCushion', back]);
  // 垫子中间一条白滚边（横着，屏幕上一行亮）
  out.push(['clothWhite', box(0.68, 0.11, 0.1, 0, 0.285, -L / 2 + 0.78)]);
  if (towel) {
    // 一条条纹毛巾搭在座垫上，从东边垂下来一截
    out.push(['canvasStripe', box(0.6, 0.03, 0.62, 0.02, 0.39, 0.25)]);
    out.push(['canvasStripe', box(0.04, 0.24, 0.62, 0.34, 0.17, 0.25)]);
  }
  return out;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'pool';
  const own = new THREE.Group();
  root.add(own);
  const B = new Bucket();
  const v = ctx.variant;
  const rnd = ctx.rng(`pool:${v}`);

  // ── 平台：顶面（挖掉池子 + 压顶）、侧面；南沿正中留台阶口 ──
  const zG = HZ - STEP_D * 2;
  const deck: V2[] = [
    [-HX, -HZ],
    [HX, -HZ],
    [HX, HZ],
    [GATE, HZ],
    [GATE, zG],
    [-GATE, zG],
    [-GATE, HZ],
    [-HX, HZ],
  ];
  const pool = roundRect(POOL.x0, POOL.z0, POOL.x1, POOL.z1, POOL.r, 5);
  const copeOut = roundRect(POOL.x0 - COPING, POOL.z0 - COPING, POOL.x1 + COPING, POOL.z1 + COPING, POOL.r + COPING, 5);
  B.add('flagstone', topGeo(deck, DECK, [copeOut]), {
    cast: false,
    extra: { elem: { ...EL.flagstone, seed: 19, size: [8.4, 4.8] } },
  }); // 美术 r2：石板 × 0.6
  B.add('stucco', wallGeo(deck, DECK, 0, true), { recv: false, tag: 'plinth' });
  // 台阶（两级，平台 0.36 → 0.24 → 0.12 → 地面）
  B.add('concrete', box(GATE * 2, 0.24, STEP_D, 0, 0, zG + STEP_D / 2));
  B.add('concrete', box(GATE * 2, 0.12, STEP_D, 0, 0, zG + STEP_D * 1.5));

  // ── 池子：压顶、水线花砖、水面 ──
  B.add('concrete', topGeo(copeOut, COPE, [pool]));
  B.add('concrete', wallGeo(copeOut, COPE, DECK - 0.01, true), { recv: false, tag: 'lip' });
  B.add('talavera', wallGeo(pool, COPE, WATER - 0.02, false), { recv: false, cast: false });
  B.add('poolWater', waterGrid(pool, WATER, 0.3, 0.25, 1.6), {
    cast: false,
    keep: ['aElem'],
    extra: { elem: { kind: 'water', attr: true, seed: 61 }, noShadowReceive: false },
  });

  // ── 扶梯（东北角，北池壁上）：两根弯扶手（水里竖上来、翻过压顶、落在平台上）+ 两级踏板 ──
  {
    const lx = 2.6;
    const zw = POOL.z0 + 0.14; // 水里那截贴着池壁
    const zd = POOL.z0 - COPING - 0.3; // 平台上的落脚
    const top = COPE + 0.62;
    const T = 0.1;
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    for (const dx of [-0.32, 0.32]) {
      const x = lx + dx;
      B.add('carSilver', bar(P(x, WATER - 0.05, zw), P(x, top - 0.12, zw), T), { tag: 'ladder' });
      B.add('carSilver', bar(P(x, top - 0.12, zw), P(x, top, zw - 0.18), T), { tag: 'ladder' });
      B.add('carSilver', bar(P(x, top, zw - 0.18), P(x, top, zd + 0.18), T), { tag: 'ladder' });
      B.add('carSilver', bar(P(x, top, zd + 0.18), P(x, DECK, zd), T), { tag: 'ladder' });
    }
    for (const y of [WATER + 0.06, WATER + 0.22])
      B.add('carSilver', box(0.64, 0.05, 0.14, lx, y, zw + 0.02), { tag: 'ladder' });
  }

  // ── 矮墙 + 压顶 + 门柱 ──
  {
    const wall = (w: number, d: number, x: number, z: number) => {
      B.add('stucco', box(w, WH, d, x, DECK, z), { recv: false, tag: 'wall' });
      B.add('cap', box(w + 0.06, CAP, d + 0.06, x, DECK + WH, z));
    };
    wall(HX * 2, WT, 0, -HZ + WT / 2);
    wall(WT, HZ * 2 - WT * 2, -HX + WT / 2, 0);
    wall(WT, HZ * 2 - WT * 2, HX - WT / 2, 0);
    const sl = HX - GATE;
    wall(sl, WT, -(GATE + sl / 2), HZ - WT / 2);
    wall(sl, WT, GATE + sl / 2, HZ - WT / 2);
    for (const x of [-GATE - 0.18, GATE + 0.18]) {
      B.add('stucco', box(0.36, WH + 0.28, 0.36, x, DECK, HZ - 0.18), { recv: false, tag: 'wall' });
      B.add('cap', box(0.44, CAP, 0.44, x, DECK + WH + 0.28, HZ - 0.18));
    }
  }

  // ── 躺椅：南边 4 张（门口通道两边各两张，头朝北 = 脚朝墙），东边 2 张（头朝北）──
  const chairs: { x: number; z: number; ry: number }[] = [
    { x: -6.25, z: 6.9, ry: 0 },
    { x: -4.05, z: 6.9, ry: 0 },
    { x: 4.05, z: 6.9, ry: 0 },
    { x: 6.25, z: 6.9, ry: 0 },
    { x: 6.15, z: -7.0, ry: 0 },
    { x: 6.15, z: -1.0, ry: 0 },
  ];
  chairs.forEach((c, i) => {
    const m = new THREE.Matrix4().makeRotationY(c.ry + (rnd() - 0.5) * 0.08).setPosition(c.x, DECK, c.z);
    const towel = (i + v) % 3 === 0;
    const flat = (i + v) % 4 === 3;
    for (const [k, g] of lounger(towel, flat)) B.add(k, g.applyMatrix4(m), { tag: 'lounger', extra: PROP });
  });

  // ── 游泳圈（变体偶数）：火烈鸟粉的圈，漂在池子西南 ──
  if (v % 2 === 0) {
    const ring = new THREE.TorusGeometry(0.42, 0.15, 6, 14).rotateX(Math.PI / 2);
    ring.translate(-2.4 + rnd() * 0.6, WATER + 0.04, 0.6 + rnd() * 0.6);
    B.add('accFlamingo', ring);
  }

  B.build(ctx, own, 'pool:');
  finish(ctx, own);

  // ── 复用：遮阳伞（南边两张躺椅之间各一把、东边一把）、毛巾车、北角两棵蒲葵 ──
  place(root, reuse(courtUmbrella, ctx, v % 2), -5.15, 5.3, 0, 1, DECK);
  place(root, reuse(courtUmbrella, ctx, (v + 1) % 2), 5.15, 5.3, 0, 1, DECK);
  // 东边那把在两张躺椅中间偏南：伞面在画面上往北"抬"了 2.3 米，正好落在两张躺椅之间，不盖住它们
  place(root, reuse(courtUmbrella, ctx, 0), 6.2, -2.9, 0, 1, DECK);
  place(root, reuse(towelCart, ctx, 0), -6.4, -2.0, Math.PI / 2, 1, DECK);
  // 门口里面两边各一只陶罐 + 龙舌兰（同 clubdesk 的 agave-pot：罐口 y 0.85、龙舌兰 0.55 倍）
  for (const x of [-2.15, 2.15]) {
    place(root, reuse(pot, ctx, 0), x, HZ - 0.85, 0, 0.85, DECK);
    place(root, reuse(agave, ctx, x < 0 ? 0 : 1), x, HZ - 0.85, x, 0.45, DECK + 0.85 * 0.85);
  }
  for (const [px, pz, pv] of [
    [-6.4, -9.4, v],
    [6.4, -9.4, v + 1],
  ] as const) {
    const palm = reuse(fanPalm, ctx, pv);
    const bb = new THREE.Box3().setFromObject(palm);
    const reach = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
    place(root, palm, px, pz, 0, Math.min(0.5, 1.15 / reach), DECK);
  }
  return root;
}
