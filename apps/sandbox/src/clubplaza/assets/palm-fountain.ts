// #1 palm-fountain（主角）：两层碗的西班牙殖民式喷泉，9.2 × 3.6 × 9.2 米（clubplaza.md 的清单）。
// - 池壁（外 4.6、内 4.0、高 0.6）：外立面下面一截土坯（adobe），上面一圈塔拉韦拉蓝釉花砖带（talavera + 奶白花）——
//   太阳在后面，朝镜头的立面永远是暗档，花砖带让这条暗带留住蓝；压顶是 cap 色的条石（绕圈 44 块，里沿一纹素湿边）。
// - 池水（fountainWater，toon 的 water 元素：北岸天光带、深处）+ 自己的水面 shader（fountain/glsl.ts 的 WATER）：
//   池底一圈砖缝、帘脚落水圈、四股小水柱落点的涟漪、按纹素的闪光；落叶多了变暗。水花本身是 fountain-spray。
// - 中间：八棱柱座（flagstone，r 0.9 → 0.55）→ 下碗（r 1.4，碗沿一圈花砖）→ 细颈（带一道箍）→ 上碗（r 0.72）
//   → 顶上陶罐形的出水口（cap，3.6 米）。碗是浅石（flagstone 亮档 L 222），比池壁亮，碗沿顶面在暗底前读得出来。
// userData：setFlow(0..1)、setLeaves(n)（和 fountain-spray 共用一份，见 fountain/link.ts）、water = { y, r }（水面高、半径，本地）。
import * as THREE from 'three';
import { EL } from '../palette';
import type { AssetCtx } from '../world';
import { annulus, cylWall, lathe, octo, waterDisc } from './fountain/geo';
import { COPING, COPING_DECL, TILES, TILES_DECL, WATER, WATER_DECL } from './fountain/glsl';
import { fountainLink, linkApi } from './fountain/link';
import { patchToon } from './fountain/patch';
import { BOWL1, BOWL2, CURTAINS, F, LANDINGS, WALL } from './fountain/spec';

/** 这个资产专用的 elem 种子（材质缓存独占，patch 才不会改到别人的材质） */
const SEED = 9100;

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'palm-fountain';
  const link = fountainLink(ctx.uniforms);
  const SEG = 96;

  // ── 材质 ──────────────────────────────────────────────
  const adobe = ctx.mat('adobe', { elem: { ...EL.adobe, seed: 3 } });
  const tilesMat = (k: number, bandH: number, trim: [number, number]) =>
    patchToon(
      ctx.mat('talavera', {
        elem: { kind: 'paint', seed: SEED + k, accent: ctx.pal.signPaint.ramp },
        noShadowReceive: true,
      }),
      {
        tag: `ftn-tiles-${k}`,
        defines: { FTN_TILES: '' },
        uniforms: { uFtnBandH: { value: bandH }, uFtnTrim: { value: new THREE.Vector2(...trim) } },
        fragDecl: TILES_DECL,
        frag: TILES,
      },
    );
  const copingMat = (key: 'cap' | 'flagstone', k: number, blocks: number, wetR: number) =>
    patchToon(ctx.mat(key, { elem: { kind: 'paint', seed: SEED + k } }), {
      tag: `ftn-coping-${k}`,
      defines: { FTN_COPING: '' },
      uniforms: { uFtnBlocks: { value: blocks }, uFtnWetR: { value: wetR } },
      fragDecl: COPING_DECL,
      frag: COPING,
    });
  const water = patchToon(
    ctx.mat('fountainWater', {
      elem: { kind: 'water', attr: true, seed: SEED + 20, accent: ctx.pal.foam.ramp },
    }),
    {
      tag: 'ftn-water',
      defines: { FTN_WATER: '' },
      uniforms: {
        uFtnFlow: link.uFlow,
        uFtnLeaves: link.uLeaves,
        uFtnLand: { value: LANDINGS.map(([x, z]) => new THREE.Vector2(x, z)) },
        uFtnFoot: {
          value: new THREE.Vector4(
            CURTAINS[0].rBot - 0.02,
            CURTAINS[0].rBot + 0.16,
            CURTAINS[1].rBot - 0.02,
            CURTAINS[1].rBot + 0.1,
          ),
        },
        uFtnPoolR: { value: F.waterR },
        uFtnBowlY: { value: F.waterY + 0.5 },
      },
      fragDecl: WATER_DECL,
      frag: WATER,
    },
  );
  // 浅石（柱座、碗）：碗的底面朝下朝镜头 → 暗档；lightUp 让朝镜头的面落中档
  const stone = ctx.mat('flagstone', {
    elem: { kind: 'stones', size: [7, 4], seam: 0.6, hi: 0.35, seed: 23 },
    lightUp: 0.3,
    edge: 0.4,
    convex: 0.4,
  });
  const stoneSmooth = ctx.mat('flagstone', {
    elem: { kind: 'paint', size: [8, 6], seed: 24 },
    lightUp: 0.35,
    edge: 0.4,
    convex: 0.3,
  });
  const pot = ctx.mat('cap', { elem: { kind: 'paint', size: [5, 4], seed: 25 }, lightUp: 0.3, convex: 0.5 });

  type MeshOpt = { cast?: boolean; recv?: boolean };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, name: string, o: MeshOpt = {}) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = name;
    mesh.userData.cast = o.cast ?? true;
    mesh.userData.recv = o.recv ?? true;
    g.add(mesh);
    return mesh;
  };

  // ── 池壁 ──────────────────────────────────────────────
  add(cylWall(WALL.rOut, WALL.rOut, WALL.tileBot, -0.02, SEG), adobe, 'wall:plinth', { recv: false });
  add(
    cylWall(WALL.rOut, WALL.rOut, WALL.tileTop, WALL.tileBot, SEG),
    tilesMat(1, WALL.tileTop - WALL.tileBot, [1, 1]),
    'wall:tiles',
    {
      recv: false,
    },
  );
  const cap = copingMat('cap', 2, 44, WALL.capIn + 0.05);
  add(annulus(WALL.capIn, WALL.capOut, WALL.capTop, SEG), cap, 'wall:coping');
  add(cylWall(WALL.capOut, WALL.capOut, WALL.capTop, WALL.capBot, SEG), cap, 'wall:coping-lip', { recv: false });
  // 池壁里面（压顶里沿到水面）：后半圈朝镜头，花砖，水线上一行奶白压边
  add(
    cylWall(WALL.capIn, WALL.capIn, WALL.capTop, WALL.innerBot, SEG, false),
    tilesMat(3, WALL.capTop - WALL.innerBot, [0, 1]),
    'wall:inner',
    { recv: false },
  );

  // ── 池水 ──────────────────────────────────────────────
  add(waterDisc(WALL.capIn + 0.01, F.waterY, SEG, 5, 2.4), water, 'water:pool', { cast: false });

  // ── 柱座 ──────────────────────────────────────────────
  add(octo(F.pedestal.r0, F.pedestal.r1, F.waterY - 0.05, F.bowl1.y + 0.04), stone, 'pedestal');
  // 柱脚一圈（八棱，水面上露 0.12）
  add(octo(F.pedestal.r0 + 0.14, F.pedestal.r0 + 0.1, F.waterY - 0.05, F.waterY + 0.12), stone, 'pedestal:foot');
  add(annulus(0, F.pedestal.r0 + 0.1, F.waterY + 0.12, 8).rotateY(-Math.PI / 8), stone, 'pedestal:foot-top');

  // ── 下碗 ──────────────────────────────────────────────
  const bowl = (B: typeof BOWL1 | typeof BOWL2, r0: number, y0: number, k: number, blocks: number) => {
    const seg = B === BOWL1 ? 48 : 32;
    // 底面（从柱子 / 颈接口往外往上到碗沿下沿）
    add(
      lathe(
        [
          [r0, y0],
          [r0 + (B.rim - r0) * 0.45, y0 + (B.lipBot - y0) * 0.35],
          [r0 + (B.rim - r0) * 0.8, y0 + (B.lipBot - y0) * 0.75],
          [B.rim, B.lipBot],
        ],
        seg,
        false,
      ),
      stoneSmooth,
      `bowl${k}:under`,
    );
    // 碗沿外立面一圈花砖
    add(
      cylWall(B.rim, B.rim, B.lipTop, B.lipBot, seg),
      tilesMat(10 + k, B.lipTop - B.lipBot, [0, 0]),
      `bowl${k}:tiles`,
      { recv: false },
    );
    // 碗沿顶面（浅石条，里沿湿）+ 里面一圈到水面
    add(annulus(B.lipIn, B.rim, B.lipTop, seg), copingMat('flagstone', 12 + k, blocks, B.lipIn + 0.03), `bowl${k}:rim`);
    add(cylWall(B.lipIn, B.waterR, B.lipTop, B.waterY - 0.01, seg, false), stoneSmooth, `bowl${k}:inner`, {
      recv: false,
    });
    add(waterDisc(B.waterR + 0.005, B.waterY, seg, 3, 3), water, `bowl${k}:water`, { cast: false });
  };
  bowl(BOWL1, F.pedestal.r1 - 0.06, F.bowl1.y, 1, 16);

  // ── 细颈（中间一道箍）──────────────────────────────────
  const s0 = BOWL1.waterY - 0.02;
  add(
    lathe(
      [
        [F.stem.r, s0],
        [F.stem.r * 0.78, s0 + 0.18],
        [F.stem.r * 1.08, s0 + 0.3],
        [F.stem.r * 1.08, s0 + 0.38],
        [F.stem.r * 0.7, s0 + 0.46],
        [F.stem.r * 0.82, F.bowl2.y + 0.02],
      ],
      24,
      true,
    ),
    stoneSmooth,
    'stem',
  );

  // ── 上碗 ──────────────────────────────────────────────
  bowl(BOWL2, F.stem.r * 0.8, F.bowl2.y, 2, 10);

  // ── 出水口（陶罐形）────────────────────────────────────
  const y0 = BOWL2.waterY - 0.02;
  const H = F.finialTop - y0;
  add(
    lathe(
      [
        [0.12, y0],
        [0.19, y0 + H * 0.2],
        [0.21, y0 + H * 0.38],
        [0.17, y0 + H * 0.58],
        [0.09, y0 + H * 0.74],
        [0.08, y0 + H * 0.84],
        [0.13, y0 + H * 0.9],
        [0.13, F.finialTop],
        [0.05, F.finialTop],
      ],
      20,
      false,
    ),
    pot,
    'finial',
  );

  ctx.mats.prepare(g);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = m.userData.cast !== false;
    m.receiveShadow = m.userData.recv !== false;
  });

  const api = linkApi(link);
  g.userData.setFlow = api.setFlow;
  g.userData.setLeaves = api.setLeaves;
  g.userData.link = link;
  g.userData.water = { y: F.waterY, r: F.waterR };
  return g;
}
