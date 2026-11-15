// clubbuild 的地块和四周（美术 r1 大改 A + B：「绿洲台地」）。
// 开罗式建造游戏的地块永远和外面是两种颜色、有一圈明确的边；网格感来自地面本身（割草条纹），不靠画线：
// - 地块：顶面 y = 0，每行 3 米一条割草条纹（单数行 lotLawn、双数行 lotLawnStripe），四周一圈 0.5 米宽、0.3 米高的陶砖压顶（亮唇），
//   外面 2.4 米的土坯墙（EL.adobe：南墙露出 ≈ 11 行 = 一条梅紫暗带），四角各一个高出地块 1 米的土坯角墩，把长方形钉在画面上。
// - 还没买下来的行（row < openFrom，北边）：晒白的荒地（lotWild + 沙纹）+ 一丛丛枯草、石头；交界一排木桩 + 一串三角小旗（"还不是我们的"）。
//   setOpenFrom(row) 往北开一片：草坪从中间往两边铺开（一行一行），木桩跟着往北挪、一根根弹起来。
// - 步道（buildPaths）：石板（flagstone，画面里最亮的地面）+ 和非步道格相邻的边一条 0.15 米的路缘 → "亮奶油色 + 一纹素暗边"的带子。
// - 大门：两根 5 米的土坯柱（1.4 米见方）+ 横梁 + 6 × 1.4 米的俱乐部蓝招牌，门外一条石板坡道下到沙漠。
// - 四周布景（竖屏上下两条空带当画框用）：北边两级台地（高 3 米、7.5 米，朝南的崖壁 EL.strata = 两条靛紫暗带），台面上手摆的棕榈 / 石头簇；
//   南边大门外一块到达广场：石板前庭、一条路从画面下沿进来、两边停车场（车）、路边两排棕榈。
//   沙漠低地、台面都挂 EL.sand（沙纹、深浅沙斑、碎石）。
// 静态的东西按材质合并（手机上省 draw call）；布景里复用的植物 / 车用 bakeStatic 合并。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { build as car } from '../clubpark/assets/car';
import { build as suv } from '../clubpark/assets/suv';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, smoothLine, topGeo, wallGeo } from '../clubsite/render/geo';
import { blobNormals, type ToonOpts } from '../clubsite/render/toon';
import { REUSED } from '../clubsite/reuse';
import { bakeStatic } from './assets/courts-common';
import { blobShadow, palmTree } from './assets/flora-kit';
import { LOT_D, LOT_W, TILE } from './catalog';
import type { AssetBuild, AssetCtx } from './ctx';
import { EL, type Pal } from './palette';
import { GATE_COLS, GATE_ROW, ROAD_TILES, tileCenter } from './sim';

/** 地块半宽、半深（米） */
export const HX = (LOT_W * TILE) / 2;
export const HZ = (LOT_D * TILE) / 2;
/** 四周沙漠比地块低多少（地块顶面 y = 0）：2.4 米 → 南墙 ≈ 11 行的暗带 */
export const DROP = 2.4;
/** 地块四周的陶砖压顶：宽、高 */
export const CAP_W = 0.5;
const CAP_H = 0.3;
/** 大门的世界坐标（两格的中间，地块南沿） */
export const GATE_X = ((GATE_COLS[0] + GATE_COLS[1] + 1) / 2 - LOT_W / 2) * TILE;
export const GATE_Z = HZ;
/** 路从画面下沿进来：客人从这里出生、从这里走掉 */
export const ROAD_FAR = HZ + ROAD_TILES * TILE;
/** 大门外的坡道：从压顶外沿（RAMP_Z0）往南 RAMP 米下到沙漠 */
export const RAMP = 6;
export const RAMP_Z0 = HZ + CAP_W;
/** 路宽（米） */
export const ROAD_HALF = 2.6;
/** 坡道半宽 = 大门两格 */
const GATE_HALF = TILE;

/** 北边两级台地：高（相对沙漠低地）、朝南崖顶大约在哪（z） */
const T1_H = 3;
const T2_H = 7.5;
/** 台面 y */
const T1_Y = -DROP + T1_H;
const T2_Y = -DROP + T2_H;

/** 远山：clubsite 的世界坐标里沙漠（DESERT）中心大约在 (10.5, 16)，挪到原点再往北 −16（竖屏里藏在第二级台地后面，平移 / 缩小时露出山脊） */
const MTN_OFFSET = new THREE.Vector3(-10.5, -DROP, -16);
/** 沙漠地面：留在原位（平的，边不进画面） */
const GROUND_OFFSET = new THREE.Vector3(-10.5, -DROP, -16);

type G = THREE.BufferGeometry;
type V2 = [number, number];

/** 按材质（+ 参数标签）收几何体，最后每组合并成一个网格 */
class Bins {
  private m = new Map<string, { key: keyof Pal; extra?: ToonOpts; geos: G[] }>();
  add(key: keyof Pal, g: G, extra?: ToonOpts, tag = '') {
    const id = `${String(key)}|${tag}`;
    let e = this.m.get(id);
    if (!e) {
      e = { key, extra, geos: [] };
      this.m.set(id, e);
    }
    e.geos.push(g.index ? g.toNonIndexed() : g);
  }
  build(ctx: AssetCtx, name: string, opts?: { cast?: boolean; receive?: boolean }): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    for (const [id, e] of this.m) {
      const g = mergeGeometries(e.geos);
      if (!g) throw new Error(`${name}: merge failed (${id})`);
      const mesh = new THREE.Mesh(g, ctx.mat(e.key, e.extra));
      mesh.name = `${name}:${id}`;
      out.add(mesh);
    }
    ctx.mats.prepare(out, opts);
    return out;
  }
}

const strip = (g: G, keep: string[]) => {
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  return g;
};
const pn = (g: G) => strip(g, ['position', 'normal']);
const rect = (x0: number, z0: number, x1: number, z1: number): V2[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
/** 朝镜头的竖直小面（太阳在画面后方）：光往上偏 → 落中档；不接投影 */
const FACE: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true };

export interface Lot {
  root: THREE.Group;
  /** 网格线（建造模式才显示） */
  grid: THREE.Object3D;
  /** 远山（userData.crests） */
  mountains: THREE.Group;
  /**
   * 地块一片一片开：row < openFrom 的行（北边）还没买下来 —— 荒地 + 枯草，交界一排木桩小旗。
   * 第一次调用直接画好；以后 openFrom 变小（往北开）就播一段：草坪一行一行铺开、木桩往北挪着弹起来（约 0.4 + 0.15 × 行数 秒）。
   * 每帧调也行（值不变什么都不做）。
   */
  setOpenFrom(row: number): void;
  /** 现在的 openFrom（setOpenFrom 最后一次给的值；没调过 = 0，整块都开着） */
  readonly openFrom: number;
}

export function buildLot(ctx: AssetCtx, _rng?: () => number): Lot {
  const root = new THREE.Group();
  root.name = 'lot';
  // 调试：game.ts 没把共享 uniforms 挂出来，量云影位置时从这里拿（window.__clubbuild.scene.getObjectByName('lot').userData.uniforms）
  root.userData.uniforms = ctx.uniforms;

  // ── 沙漠低地（铺得很远）+ 远山 ──
  const ground = new THREE.Mesh(groundGeo(), ctx.mat('sandDrift', { elem: { ...EL.sand, seed: 3 } }));
  ground.position.copy(GROUND_OFFSET);
  ground.name = 'ground';
  ctx.mats.prepare(ground, { cast: false });
  root.add(ground);
  const mountains = buildMountains(ctx.mats.toon as Parameters<typeof buildMountains>[0], 3);
  mountains.position.copy(MTN_OFFSET);
  root.add(mountains);

  buildTerraces(ctx, root);
  const wall = buildRim(ctx, root);
  buildGate(ctx, root);
  buildPlaza(ctx, root);
  buildScenery(ctx, root);

  // ── 网格线（FX 图层：不描边；建造模式才显示）：深绿细线，别比草坪亮 ──
  const lines: number[] = [];
  const y = 0.03;
  for (let i = 0; i <= LOT_W; i++) lines.push(-HX + i * TILE, y, -HZ, -HX + i * TILE, y, HZ);
  for (let j = 0; j <= LOT_D; j++) lines.push(-HX, y, -HZ + j * TILE, HX, y, -HZ + j * TILE);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const grid = new THREE.LineSegments(
    lg,
    new THREE.LineBasicMaterial({ color: 0x3d6a3a, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  grid.layers.set(1);
  grid.renderOrder = 2;
  grid.visible = false;
  grid.name = 'grid';
  root.add(grid);

  // ── 地块顶面 + 还没买的行 ──
  const parcels = new Parcels(ctx, root);
  // 动画靠墙的 onBeforeRender 推（墙永远在画面里；按绝对时间算，一帧几个 pass 调几次也没关系）
  wall.frustumCulled = false;
  wall.onBeforeRender = () => parcels.tick(performance.now() / 1000);

  // 调试 / 截图脚本：window.__clubbuild.scene.getObjectByName('lot').userData.setOpenFrom(row)
  root.userData.setOpenFrom = (row: number) => parcels.set(row);
  return {
    root,
    grid,
    mountains,
    setOpenFrom: (row: number) => parcels.set(row),
    get openFrom() {
      return parcels.target;
    },
  };
}

// ════════════════════════════════════════════════════════════════════
// 地块的边：压顶、土坯墙、角墩
// ════════════════════════════════════════════════════════════════════

function buildRim(ctx: AssetCtx, root: THREE.Group): THREE.Mesh {
  const R = CAP_W;
  // 土坯墙：压顶外沿往下到沙漠；露出 DROP 米（≥ 9 行 → 土坯砖，EL.adobe）
  const wallG = wallGeo(rect(-HX - R, -HZ - R, HX + R, HZ + R), 0, -DROP - 0.1, true, 0, () => DROP);
  const wall = new THREE.Mesh(wallG, ctx.mat('adobe', { elem: { ...EL.adobe, seed: 5 }, noShadowReceive: true }));
  wall.name = 'lot-wall';
  ctx.mats.prepare(wall, { cast: false });
  root.add(wall);

  // 压顶：四边 0.5 米宽、0.3 米高的陶砖（南沿大门那里断开）
  const cap = new Bins();
  const W = LOT_W * TILE + 2 * R;
  const D = LOT_D * TILE + 2 * R;
  cap.add('cap', box(W, CAP_H, R, 0, -0.02, -HZ - R / 2));
  cap.add('cap', box(R, CAP_H, D, -HX - R / 2, -0.02, 0));
  cap.add('cap', box(R, CAP_H, D, HX + R / 2, -0.02, 0));
  const gx0 = GATE_X - GATE_HALF;
  const gx1 = GATE_X + GATE_HALF;
  cap.add('cap', box(gx0 + HX + R, CAP_H, R, (-HX - R + gx0) / 2, -0.02, HZ + R / 2));
  cap.add('cap', box(HX + R - gx1, CAP_H, R, (HX + R + gx1) / 2, -0.02, HZ + R / 2));
  // 角墩：1.2 米见方、高出地块 1 米（土坯身子 + 陶砖帽）
  const piers = new Bins();
  const P = 1.2;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (HX + R - P / 2 + 0.15);
      const z = sz * (HZ + R - P / 2 + 0.15);
      const g = box(P, DROP + 1.0, P, x, -DROP - 0.05, z);
      piers.add('adobe', g, { ...FACE, edge: 0.45, convex: 0.3 }, 'pier');
      cap.add('cap', box(P + 0.24, 0.28, P + 0.24, x, 0.95, z));
    }
  root.add(cap.build(ctx, 'lot-cap'));
  root.add(piers.build(ctx, 'lot-piers', { cast: true }));
  return wall;
}

// ════════════════════════════════════════════════════════════════════
// 地块顶面：割草条纹 + 还没买下来的荒地 + 木桩小旗；开地块的动画
// ════════════════════════════════════════════════════════════════════

/** 第 r 行的 z 范围 */
const rowZ = (r: number): [number, number] => [-HZ + r * TILE, -HZ + (r + 1) * TILE];
/** 一行的顶面（y 高，可只铺 x0..x1） */
const rowGeo = (r: number, y = 0, x0 = -HX, x1 = HX) => {
  const [z0, z1] = rowZ(r);
  return pn(topGeo(rect(x0, z0, x1, z1), y));
};
const lawnKey = (r: number): keyof Pal => (r % 2 ? 'lotLawnStripe' : 'lotLawn');
/** 割草条纹的元素：几块有机形状的深浅（paint：同档三色，块约 22 × 12 纹素），很少的擦痕 = 草茬 */
const LAWN_EL: ToonOpts = { elem: { kind: 'paint', size: [22, 12], density: [0, 0.02], patch: 4, seed: 9 } };

/** 简单的确定性哈希（演出用，不进模拟） */
const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

interface Anim {
  /** 开的这几行（从南往北） */
  rows: number[];
  t0: number;
  /** 旧的边界（行号），木桩从这里沉下去 */
  from: number;
  meshes: THREE.Mesh[];
}

class Parcels {
  /** 最后一次给的 openFrom */
  target = 0;
  private lawn: THREE.Group | null = null;
  private wild: THREE.Group | null = null;
  private stakes: THREE.Group | null = null;
  private anim: Anim | null = null;
  private stakeK = 1;
  private first = true;
  private lawnMats: Record<string, THREE.Material>;

  constructor(
    private ctx: AssetCtx,
    private root: THREE.Group,
  ) {
    this.lawnMats = {
      lotLawn: ctx.mat('lotLawn', LAWN_EL),
      lotLawnStripe: ctx.mat('lotLawnStripe', LAWN_EL),
    };
    this.draw(0);
    this.first = true;
  }

  set(row: number) {
    const r = THREE.MathUtils.clamp(Math.round(row), 0, LOT_D);
    if (r === this.target && !this.first) return;
    const prev = this.target;
    this.target = r;
    if (this.first || r > prev || this.anim) {
      // 第一次、往回锁（新开一局）、动画中又变了：直接画好
      this.first = false;
      this.finishAnim();
      this.draw(r);
      return;
    }
    // 往北开：静态的先留着旧的（荒地垫在下面），新开的几行一行一行铺草
    const rows: number[] = [];
    for (let k = prev - 1; k >= r; k--) rows.push(k);
    this.anim = { rows, t0: -1, from: prev, meshes: [] };
    // 新开那几行上的枯草、石头先收掉
    this.drawWild(prev, r);
  }

  /** 每帧（绝对秒） */
  tick(now: number) {
    const a = this.anim;
    if (!a) return;
    if (a.t0 < 0) {
      a.t0 = now;
      for (const r of a.rows) {
        const m = new THREE.Mesh(rowGeo(r, 0.012), this.lawnMats[lawnKey(r)]);
        m.name = `lawn-open:${r}`;
        m.receiveShadow = true;
        m.scale.x = 0.001;
        this.root.add(m);
        a.meshes.push(m);
      }
    }
    const t = now - a.t0;
    // 旧的木桩 0.2 秒沉下去
    const sink = THREE.MathUtils.clamp(1 - t / 0.2, 0, 1);
    a.meshes.forEach((m, i) => {
      const k = THREE.MathUtils.clamp((t - 0.15 - i * 0.15) / 0.45, 0, 1);
      m.scale.x = Math.max(0.001, 1 - (1 - k) ** 3);
    });
    const end = 0.15 + (a.rows.length - 1) * 0.15 + 0.45;
    if (sink > 0) this.setStakeK(sink);
    else if (t < end) this.setStakeK(0);
    else {
      // 草铺完：静态网格换成新的，木桩在新边界上弹起来
      this.finishAnim();
      this.draw(this.target);
      this.popT0 = now;
    }
    this.popTick(now);
  }

  private popT0 = -1;
  private popTick(now: number) {
    if (this.popT0 < 0 || !this.stakes) return;
    const t = now - this.popT0;
    if (t > 0.6) {
      this.popT0 = -1;
      this.setStakeK(1);
      return;
    }
    // 一根根弹起来：按 x 错开，过冲 1.2 再落回 1
    this.stakes.children.forEach((c) => {
      const d = (c.userData.x as number | undefined) ?? 0;
      const k = THREE.MathUtils.clamp((t - ((d + HX) / (2 * HX)) * 0.25) / 0.3, 0, 1);
      c.scale.y = Math.max(0.001, k < 0.7 ? (k / 0.7) * 1.2 : 1.2 - ((k - 0.7) / 0.3) * 0.2);
    });
  }

  private setStakeK(k: number) {
    if (!this.stakes || k === this.stakeK) return;
    this.stakeK = k;
    for (const c of this.stakes.children) c.scale.y = Math.max(0.001, k);
  }

  private finishAnim() {
    if (!this.anim) return;
    for (const m of this.anim.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.anim = null;
  }

  /** 静态网格：草坪（row ≥ open）、荒地（row < open）、交界的木桩 */
  private draw(open: number) {
    const { ctx, root } = this;
    if (this.lawn) {
      root.remove(this.lawn);
      dispose(this.lawn);
    }
    const lawn = new Bins();
    for (let r = open; r < LOT_D; r++) lawn.add(lawnKey(r), rowGeo(r), LAWN_EL);
    this.lawn = lawn.build(ctx, 'lot-top', { cast: false });
    root.add(this.lawn);
    this.drawWild(open, open);
    this.drawStakes(open);
  }

  /** 荒地：row < open 的行铺 lotWild；row < bush 的行上撒枯草、石头 */
  private drawWild(open: number, bush: number) {
    const { ctx, root } = this;
    if (this.wild) {
      root.remove(this.wild);
      dispose(this.wild);
      this.wild = null;
    }
    if (open <= 0) return;
    const B = new Bins();
    for (let r = 0; r < open; r++)
      B.add('lotWild', rowGeo(r, -0.005), { elem: { ...EL.sand, seed: 13, pebbles: 0.09 } });
    // 枯草 / 灌木团（2～3 纹素高的圆顶）+ 小石头：每行 3～4 团，按行号哈希摆，靠近边界的那行少一点（木桩前面留空）
    for (let r = 0; r < bush; r++) {
      const [z0] = rowZ(r);
      const n = 3 + (hash(r, 1) > 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const x = -HX + 2 + hash(r, i * 7 + 3) * (2 * HX - 4);
        const z = z0 + 0.6 + hash(r, i * 7 + 4) * 1.8;
        const s = 0.45 + hash(r, i * 7 + 5) * 0.35;
        if (hash(r, i * 7 + 6) < 0.22) {
          const g = new THREE.IcosahedronGeometry(s * 0.8, 0);
          g.scale(1.3, 0.7, 1);
          g.translate(x, s * 0.25, z);
          B.add('rock', g, { edge: 0.5, convex: 0.3 }, 'rock');
        } else {
          const g = new THREE.IcosahedronGeometry(s, 1);
          g.scale(1.25, 0.75, 1);
          g.translate(x, s * 0.35, z);
          blobNormals(g, new THREE.Vector3(x, 0, z));
          // 三成是枯草（草秆色），七成是灰绿的灌木（sage：沙漠里的石炭酸灌木那种颜色）
          const dry = hash(r, i * 7 + 8) < 0.3;
          B.add(
            dry ? 'dryGrass' : 'sage',
            g,
            { lightUp: 0.3, bands: [0.0, 0.55], noise: 0.35, edge: 0.4, convex: 0.1, noShadowReceive: true },
            dry ? 'tuft' : 'bush',
          );
        }
        // 团影（固定暗档的荒地颜色）
        const sh = blobShadow(ctx, 'lotWild', s * 1.25, s * 0.85, 0.008);
        sh.geometry.translate(x, 0, z + 0.2);
        B.add('lotWild', sh.geometry, { bands: [9, 9], edge: 0, convex: 0, elem: { ...EL.sand, seed: 13 } }, 'blob');
      }
    }
    this.wild = B.build(ctx, 'lot-wild');
    this.wild.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // 地面和团影不投影；枯草、石头投一点小影子会是麻点 → 都不投
      m.castShadow = false;
    });
    root.add(this.wild);
  }

  /** 交界：每 3 米一根木桩（0.4 米见方、1.6 米高，隔一根桩顶一面方旗），桩之间一串三角小旗（红 / 黄 / 蓝轮着，0.8 米见方 ≈ 5 纹素） */
  private drawStakes(open: number) {
    const { ctx, root } = this;
    if (this.stakes) {
      root.remove(this.stakes);
      dispose(this.stakes);
      this.stakes = null;
    }
    if (open <= 0) return;
    const zb = -HZ + open * TILE;
    const grp = new THREE.Group();
    grp.name = 'lot-stakes';
    const SH = 1.6;
    const ROPE_Y = 1.35;
    const flagKeys: (keyof Pal)[] = ['clothRed', 'flowerYellow', 'counter'];
    // 每根桩 + 它东边那一段绳和小旗是一组（弹起来按组缩放，组原点在桩脚）
    for (let i = 0; i <= LOT_W; i++) {
      const x = -HX + i * TILE;
      const B = new Bins();
      B.add('timber', box(0.4, SH, 0.4, 0, 0, 0), { lightUp: 0.45, edge: 0.5, convex: 0.4 }, 'stake');
      // 桩顶的小方旗（朝镜头）
      if (i % 2 === 0) {
        const fg = new THREE.BufferGeometry();
        fg.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            [
              0.2,
              SH + 0.35,
              0,
              1.2,
              SH + 0.35,
              0,
              0.2,
              SH - 0.3,
              0,
              1.2,
              SH + 0.35,
              0,
              1.2,
              SH - 0.3,
              0,
              0.2,
              SH - 0.3,
              0,
            ],
            3,
          ),
        );
        B.add('timber', box(0.14, 0.45, 0.14, 0.15, SH, 0), { lightUp: 0.45, edge: 0.4, convex: 0.2 }, 'stake');
        fg.computeVertexNormals();
        B.add('clothRed', fg, { ...FACE, side: THREE.DoubleSide, edge: 0.4, convex: 0 }, 'flagTop');
      }
      if (i < LOT_W) {
        // 绳：往下兜一点（两段），0.12 米粗
        const sag = 0.25;
        const a = new THREE.Vector3(0, ROPE_Y, 0);
        const m = new THREE.Vector3(TILE / 2, ROPE_Y - sag, 0);
        const b = new THREE.Vector3(TILE, ROPE_Y, 0);
        B.add('timber', bar(a, m, 0.16), { lightUp: 0.4, edge: 0.2, convex: 0 }, 'rope');
        B.add('timber', bar(m, b, 0.16), { lightUp: 0.4, edge: 0.2, convex: 0 }, 'rope');
        // 小旗：每段 3 面，倒三角挂在绳上（0.8 宽、0.8 高 ≈ 5 × 4 纹素）
        for (let k = 0; k < 3; k++) {
          const u = (k + 0.5) / 3;
          const fx = u * TILE;
          const fy = ROPE_Y - sag * (1 - (2 * u - 1) ** 2) - 0.02;
          const g = new THREE.BufferGeometry();
          g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute([fx - 0.4, fy, 0.03, fx + 0.4, fy, 0.03, fx, fy - 0.8, 0.03], 3),
          );
          g.computeVertexNormals();
          const key = flagKeys[(i * 3 + k) % 3];
          B.add(key, g, { ...FACE, side: THREE.DoubleSide, edge: 0.35, convex: 0 }, 'flag');
        }
      }
      const s = B.build(ctx, `stake:${i}`, { cast: false });
      s.position.set(x, 0, zb);
      s.userData.x = x;
      grp.add(s);
    }
    this.stakes = grp;
    this.stakeK = 1;
    root.add(grp);
  }
}

function dispose(o: THREE.Object3D) {
  o.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
}

/** 两点之间一根方杆（粗 t） */
function bar(a: THREE.Vector3, b: THREE.Vector3, t: number): G {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, d.length(), t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

// ════════════════════════════════════════════════════════════════════
// 北边两级台地
// ════════════════════════════════════════════════════════════════════

/** 台地：南沿是一条手摆的弯线（只有朝南的段在画面里出暗带），往北一直铺到画外 */
function terrace(ctrl: V2[]): V2[] {
  const edge = smoothLine(ctrl, 1.5);
  return [...edge, [ctrl[ctrl.length - 1][0], -320], [ctrl[0][0], -320]];
}

function buildTerraces(ctx: AssetCtx, root: THREE.Group) {
  const B = new Bins();
  // 第一级：3 米，崖顶 z ≈ −47（离地块北墙 8 米，中间一条低地沙带）；西边一块往南伸的岬
  const t1 = terrace([
    [-170, -46],
    [-46, -46.5],
    [-34, -47.5],
    [-24, -45.2],
    [-15, -44.6],
    [-7, -46.8],
    [4, -47.8],
    [14, -46.6],
    [24, -48],
    [36, -46.4],
    [170, -46],
  ]);
  // 第二级：再高 4.5 米，崖顶 z ≈ −61；中间一个往北凹的豁口
  const t2 = terrace([
    [-170, -61],
    [-40, -60.5],
    [-28, -59.4],
    [-16, -60.8],
    [-6, -63.6],
    [6, -63.2],
    [15, -60.4],
    [27, -59.6],
    [40, -61],
    [170, -61],
  ]);
  B.add('sand', pn(topGeo(t1, T1_Y)), { elem: { ...EL.sand, seed: 21 } }, 't1');
  B.add('sandHigh', pn(topGeo(t2, T2_Y)), { elem: { ...EL.sand, seed: 27 } }, 't2');
  const cliffOpts: ToonOpts = { elem: { ...EL.strata, seed: 11 }, noShadowReceive: true };
  B.add(
    'cliff',
    wallGeo(t1, T1_Y, -DROP - 0.1, true, 0, () => T1_H),
    cliffOpts,
    'c',
  );
  B.add(
    'cliff',
    wallGeo(t2, T2_Y, T1_Y - 0.1, true, 0, () => T2_H - T1_H),
    cliffOpts,
    'c',
  );
  const g = B.build(ctx, 'terraces', { cast: true });
  // 台面接投影（棕榈的影子），崖壁不接（毛边落在竖面上是麻点）
  root.add(g);
}

// ════════════════════════════════════════════════════════════════════
// 大门 + 坡道
// ════════════════════════════════════════════════════════════════════

function buildGate(ctx: AssetCtx, root: THREE.Group) {
  const B = new Bins();
  const PH = 5;
  const PW = 1.4;
  const pz = GATE_Z + CAP_W / 2;
  for (const sx of [-1, 1]) {
    const x = GATE_X + sx * (GATE_HALF + PW / 2);
    // 柱：土坯（朝镜头的面落暗档 → 一对深色的门柱），柱脚一圈陶砖、柱顶陶砖帽
    B.add('adobe', box(PW, PH, PW, x, -0.02, pz), { edge: 0.5, convex: 0.3, lightUp: 0.2 }, 'pillar');
    B.add('cap', box(PW + 0.3, 0.3, PW + 0.3, x, PH, pz), { convex: 0.4 }, 'pcap');
    B.add('cap', box(PW + 0.2, 0.25, PW + 0.2, x, 0, pz), { convex: 0.4 }, 'pfoot');
  }
  // 横梁（木）
  const BEAM_Y = 3.9;
  B.add(
    'timber',
    box(2 * GATE_HALF + 2 * PW + 0.6, 0.45, 0.55, GATE_X, BEAM_Y, pz),
    { lightUp: 0.4, convex: 0.4 },
    'beam',
  );
  // 招牌：6 × 1.4 米俱乐部蓝，立在横梁上、往后仰 20°（朝镜头多一点，45° 下读得出来）
  const sign = new THREE.Group();
  const SW = 6;
  const SH = 1.4;
  const S = new Bins();
  S.add('counter', box(SW, SH, 0.2, 0, 0, 0), { lightUp: 0.7, bands: [-0.6, -0.1], edge: 0.6, convex: 0.4 }, 'board');
  // 牌子上：左边一个网球（黄圆）、右边三条奶油色"字"（每条 ≥ 2 行高）
  const ball = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12).rotateX(Math.PI / 2).translate(-2.15, SH / 2, 0.14);
  S.add('ball', ball, { lightUp: 0.8, bands: [-0.8, -0.3], edge: 0.3, convex: 0 }, 'ball');
  for (const [x0, w] of [
    [-1.45, 1.1],
    [-0.15, 1.35],
    [1.4, 1.1],
  ] as const) {
    S.add(
      'signPaint',
      box(w, 0.5, 0.08, x0 + w / 2, SH / 2 - 0.25, 0.12),
      { lightUp: 0.8, bands: [-0.8, -0.3], edge: 0.3 },
      'txt',
    );
  }
  // 牌子上沿一条陶砖压边
  S.add('cap', box(SW + 0.2, 0.16, 0.3, 0, SH, 0), { convex: 0.4 }, 'scap');
  const sg = S.build(ctx, 'gate-sign', { cast: true });
  sign.add(sg);
  sign.rotation.x = -0.35;
  sign.position.set(GATE_X, BEAM_Y + 0.4, pz);
  root.add(sign);
  root.add(B.build(ctx, 'gate'));

  // 坡道：压顶外沿 → 往南 RAMP 米下到沙漠；两边一道跟着坡下去的土坯矮墙
  const R = new Bins();
  const z0 = HZ;
  const z1 = RAMP_Z0 + RAMP;
  const xa = GATE_X - GATE_HALF;
  const xb = GATE_X + GATE_HALF;
  const top = (z: number) => (z <= RAMP_Z0 ? 0.01 : -DROP * Math.min(1, (z - RAMP_Z0) / RAMP) + 0.02);
  const quadG = (pts: [number, number, number][]): G => {
    const [a, b, c, d] = pts.map((p) => new THREE.Vector3(...p));
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [a, b, c, a, c, d].flatMap((v) => [v.x, v.y, v.z]),
        3,
      ),
    );
    g.computeVertexNormals();
    return g;
  };
  // 平的一截（压顶的缺口）+ 斜面
  R.add(
    'flagstone',
    quadG([
      [xa, 0.01, z0],
      [xa, 0.01, RAMP_Z0],
      [xb, 0.01, RAMP_Z0],
      [xb, 0.01, z0],
    ]),
    { elem: { ...EL.flagstone, seed: 41 } },
    'ramp',
  );
  R.add(
    'flagstone',
    quadG([
      [xa, top(RAMP_Z0), RAMP_Z0],
      [xa, top(z1), z1],
      [xb, top(z1), z1],
      [xb, top(RAMP_Z0), RAMP_Z0],
    ]),
    { elem: { ...EL.flagstone, seed: 41 } },
    'ramp',
  );
  // 两边的矮墙：每段一个斜的方块（跟着坡），高出坡面 0.5 米
  const PAR = 0.45;
  for (const x of [xa - PAR / 2, xb + PAR / 2]) {
    const len = Math.hypot(RAMP, DROP);
    const g = new THREE.BoxGeometry(PAR, 0.5 + 0.6, len + 0.3);
    g.translate(0, 0.5 - 0.55, 0);
    g.rotateX(Math.atan2(DROP, RAMP));
    g.translate(x, -DROP / 2, RAMP_Z0 + RAMP / 2);
    R.add('adobe', pn(g), { ...FACE, edge: 0.45, convex: 0.3 }, 'par');
    // 墙下的三角立面（坡和沙漠之间）
    R.add(
      'adobe',
      pn(box(PAR, DROP * 0.5, RAMP * 0.5, x, -DROP, RAMP_Z0 + RAMP * 0.25)),
      { ...FACE, edge: 0.3 },
      'par',
    );
  }
  // 坡顶两个陶砖墩（压顶的端头）
  root.add(R.build(ctx, 'ramp', { cast: false }));
}

// ════════════════════════════════════════════════════════════════════
// 南边：到达广场（前庭、路、两边停车场）
// ════════════════════════════════════════════════════════════════════

/** 前庭：坡脚往南 7 米、东西 ±10 米 */
const FORE: [number, number, number, number] = [GATE_X - 10, RAMP_Z0 + RAMP, GATE_X + 10, RAMP_Z0 + RAMP + 6.5];
/** 停车场（西、东）：x0, z0, x1, z1 */
const LOTS: [number, number, number, number][] = [
  [-29, FORE[3] + 1.2, -6.8, FORE[3] + 13.6],
  [6.8, FORE[3] + 1.2, 29, FORE[3] + 13.6],
];

function buildPlaza(ctx: AssetCtx, root: THREE.Group) {
  const B = new Bins();
  const yG = -DROP;
  const FL: ToonOpts = { elem: { ...EL.flagstone, seed: 43 } };
  // 前庭 + 路（石板）
  B.add('flagstone', pn(topGeo(rect(FORE[0], FORE[1], FORE[2], FORE[3]), yG + 0.04)), FL, 'fl');
  B.add(
    'flagstone',
    pn(topGeo(rect(GATE_X - ROAD_HALF, FORE[3], GATE_X + ROAD_HALF, ROAD_FAR + 140), yG + 0.04)),
    FL,
    'fl',
  );
  // 前庭、路的路缘（水泥，0.2 宽 0.12 高）
  const K = 0.22;
  const KH = 0.14;
  const kerb = (x0: number, z0: number, x1: number, z1: number) =>
    B.add('kerb', box(x1 - x0, KH, z1 - z0, (x0 + x1) / 2, yG, (z0 + z1) / 2), { edge: 0.3, convex: 0.3 }, 'kerb');
  kerb(FORE[0] - K, FORE[1], FORE[0], FORE[3] + K);
  kerb(FORE[2], FORE[1], FORE[2] + K, FORE[3] + K);
  kerb(FORE[0] - K, FORE[3], GATE_X - ROAD_HALF, FORE[3] + K);
  kerb(GATE_X + ROAD_HALF, FORE[3], FORE[2] + K, FORE[3] + K);
  kerb(GATE_X - ROAD_HALF - K, FORE[3] + K, GATE_X - ROAD_HALF, ROAD_FAR + 140);
  kerb(GATE_X + ROAD_HALF, FORE[3] + K, GATE_X + ROAD_HALF + K, ROAD_FAR + 140);
  // 前庭中间：两块陶砖花池（坡脚两边）
  for (const sx of [-1, 1]) {
    const cx = GATE_X + sx * 7;
    B.add('cap', box(3.2, 0.45, 2.2, cx, yG, FORE[1] + 1.8), { ...FACE, edge: 0.45, convex: 0.4 }, 'bed');
    B.add(
      'lotLawnStripe',
      pn(topGeo(rect(cx - 1.4, FORE[1] + 0.9, cx + 1.4, FORE[1] + 2.7), yG + 0.47)),
      LAWN_EL,
      'bedlawn',
    );
  }
  // 停车场：沥青 + 车位漆线 + 一圈路缘
  for (const [x0, z0, x1, z1] of LOTS) {
    B.add(
      'lotAsphalt',
      pn(topGeo(rect(x0, z0, x1, z1), yG + 0.03)),
      { elem: { kind: 'paint', size: [18, 10], density: [0, 0.03] } },
      'asph',
    );
    kerb(x0 - K, z0 - K, x1 + K, z0);
    kerb(x0 - K, z1, x1 + K, z1 + K);
    const toward = x0 < 0 ? x0 - K : x1;
    kerb(toward, z0, toward + K, z1);
    // 两排车位：北排车头朝北、南排车头朝南；车位线 2 纹素宽
    const SW = 2.8;
    const n = Math.floor((x1 - x0 - 0.4) / SW);
    for (let i = 0; i <= n; i++) {
      const x = x0 + 0.2 + i * SW;
      B.add('lotPaint', pn(topGeo(rect(x - 0.15, z0 + 0.3, x + 0.15, z0 + 5), yG + 0.045)), undefined, 'paint');
      B.add('lotPaint', pn(topGeo(rect(x - 0.15, z1 - 5, x + 0.15, z1 - 0.3), yG + 0.045)), undefined, 'paint');
    }
  }
  // 路中间的虚线（2 纹素宽、每段 2 米）
  for (let z = FORE[3] + 1; z < ROAD_FAR + 60; z += 4)
    B.add('lotPaint', pn(topGeo(rect(GATE_X - 0.15, z, GATE_X + 0.15, z + 2), yG + 0.045)), undefined, 'paint');
  root.add(B.build(ctx, 'plaza', { cast: false }));

  // 车：每个停车场两排，空几个位；按车位哈希挑车漆、轿车 / SUV
  const cars = new THREE.Group();
  cars.name = 'plaza-cars';
  cars.position.y = yG;
  const SWc = 2.8;
  LOTS.forEach(([x0, z0, x1, z1], li) => {
    const n = Math.floor((x1 - x0 - 0.4) / SWc);
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < n; i++) {
        const h = hash(li * 31 + row * 7, i);
        if (h < 0.3) continue;
        const kind = h > 0.85 ? suv : car;
        const o = (kind as unknown as AssetBuild)({ ...ctx, variant: Math.floor(hash(i, li + row * 3) * 7) });
        const x = x0 + 0.2 + (i + 0.5) * SWc + (hash(i, 5) - 0.5) * 0.2;
        const z = row === 0 ? z0 + 2.6 : z1 - 2.6;
        o.position.set(x, 0.04, z);
        o.rotation.y = (row === 0 ? 0 : Math.PI) + (hash(i, 9) - 0.5) * 0.06;
        cars.add(o);
      }
  });
  bakeStatic(cars, [...cars.children]);
  root.add(cars);
}

// ════════════════════════════════════════════════════════════════════
// 布景：手摆的棕榈、石头、沙漠植物簇（不撒随机环）
// ════════════════════════════════════════════════════════════════════

/** 一件布景：复用资产 id 或 'palm'（flora-kit 的棕榈）；x, z 世界坐标；s 缩放；v 变体 */
type Item = [id: string, x: number, z: number, s?: number, v?: number];

/** 低地（y = −DROP）：北边沙带两簇、大门两侧、路边两排棕榈、广场外几簇 */
const LOW: Item[] = [
  // 北边沙带（地块北墙和第一级崖之间）
  ['rocks', -21, -43.2, 1.1, 1],
  ['creosote', -19.4, -42.4, 0.9, 0],
  ['barrel-cactus', -22.6, -42.6, 0.9, 2],
  ['rocks', 16.5, -44, 0.9, 2],
  ['agave', 14.8, -43, 0.9, 1],
  ['brittlebush', 18, -42.7, 0.9, 0],
  // 大门两侧（不占格的两棵）
  ['palm', GATE_X - 6.2, HZ + 3.2, 1.25, 0],
  ['palm', GATE_X + 6.2, HZ + 3.4, 1.2, 1],
  // 前庭外沿、路边（停车场和路之间）两排棕榈
  ['palm', FORE[0] - 1.6, FORE[1] + 1.4, 1, 2],
  ['palm', FORE[2] + 1.6, FORE[1] + 1.2, 1, 0],
  ['palm', GATE_X - 4.6, FORE[3] + 3, 1, 1],
  ['palm', GATE_X + 4.6, FORE[3] + 3.2, 1, 2],
  ['palm', GATE_X - 4.6, FORE[3] + 9.5, 1.05, 0],
  ['palm', GATE_X + 4.6, FORE[3] + 9.8, 1, 1],
  ['palm', GATE_X - 4.6, FORE[3] + 16, 1, 2],
  ['palm', GATE_X + 4.6, FORE[3] + 16.3, 1.05, 0],
  // 广场外的沙漠
  ['rocks', -25, LOTS[0][3] + 4.5, 1.2, 0],
  ['creosote', -23.2, LOTS[0][3] + 5.4, 1, 1],
  ['ocotillo', -27, LOTS[0][3] + 4, 0.9, 0],
  ['agave', 22.5, LOTS[1][3] + 5, 1, 0],
  ['rocks', 24.5, LOTS[1][3] + 4.4, 1, 2],
  ['barrel-cactus', 21, LOTS[1][3] + 3.8, 1, 1],
  ['brittlebush', -12, LOTS[0][3] + 6.5, 0.9, 1],
  ['rocks', 11, LOTS[1][3] + 7.5, 0.8, 1],
];
/** 第一级台面（y = T1_Y） */
const MESA1: Item[] = [
  ['palm', -18, -52, 1.15, 0],
  ['palm', -14.8, -54.6, 0.95, 2],
  ['rocks', -16.2, -50.4, 1.2, 0],
  ['creosote', -20.4, -50.6, 1, 1],
  ['palm', 9.5, -55.5, 1.1, 1],
  ['ocotillo', 12, -53.6, 1, 0],
  ['rocks', 7.6, -52.4, 1, 2],
  ['agave', 23, -52.4, 1, 2],
  ['rocks', 25, -51.4, 1.3, 1],
  ['brittlebush', -3, -50.2, 0.9, 1],
  ['rocks', -1.4, -51.4, 0.8, 0],
];
/** 第二级台面（y = T2_Y）：只露出冠 */
const MESA2: Item[] = [
  ['palm', -24, -64.5, 1.2, 1],
  ['palm', -21, -66.5, 1, 0],
  ['palm', 4.5, -67, 1.15, 2],
  ['palm', 21, -64.6, 1.05, 0],
  ['rocks', 18.6, -63.4, 1.3, 2],
];

function buildScenery(ctx: AssetCtx, root: THREE.Group) {
  const level = (items: Item[], y: number, ground: keyof Pal, name: string) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.y = y;
    const statics: THREE.Object3D[] = [];
    const shadows = new Bins();
    for (const [id, x, z, s = 1, v = 0] of items) {
      let o: THREE.Object3D;
      if (id === 'palm') {
        const lean: [number, number] = [(hash(x | 0, z | 0) - 0.5) * 1.2, (hash(z | 0, x | 0) - 0.5) * 0.6];
        o = palmTree({ ...ctx, variant: v }, { h: 5.6 + v * 0.5, reach: 2.1, n: 8, lean, seed: 'scene' });
        o.scale.setScalar(s);
        o.position.set(x, 0, z);
        g.add(o);
        continue;
      }
      const b = REUSED[id] as unknown as AssetBuild | undefined;
      if (!b) continue;
      o = b({ ...ctx, variant: v });
      o.position.set(x, 0, z);
      o.rotation.y = hash(x * 10, z * 10) * Math.PI * 2;
      o.scale.setScalar(s);
      g.add(o);
      statics.push(o);
      // 小东西不投太阳影（0.149 米/纹素下毛边影子是一团紫色污渍），脚下一块团影
      o.traverse((c) => {
        c.castShadow = false;
      });
      o.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(o);
      const rx = Math.max(0.5, (bb.max.x - bb.min.x) * 0.55);
      const rz = Math.max(0.35, (bb.max.z - bb.min.z) * 0.45);
      const sh = blobShadow(ctx, ground, rx, rz, 0.01);
      sh.geometry.translate(x, 0, z + 0.25);
      shadows.add(ground, sh.geometry, { bands: [9, 9], edge: 0, convex: 0, elem: { ...EL.sand, seed: 3 } }, 'blob');
    }
    bakeStatic(g, statics);
    g.add(shadows.build(ctx, `${name}:blobs`, { cast: false }));
    root.add(g);
  };
  level(LOW, -DROP, 'sandDrift', 'scenery-low');
  level(MESA1, T1_Y, 'sand', 'scenery-mesa1');
  level(MESA2, T2_Y, 'sandHigh', 'scenery-mesa2');
}

// ════════════════════════════════════════════════════════════════════
// 步道
// ════════════════════════════════════════════════════════════════════

/**
 * 步道：所有步道格的顶面合成一个网格（石板，比地块高一点点），tiles 变了就重建。
 * 和非步道格相邻的边加一条 0.15 米宽、0.06 米高的路缘（kerb）：步道在草坪上是"亮奶油色 + 一纹素暗边"的带子。
 * 大门两格算步道；大门南边（坡道）不加路缘。
 */
export function buildPaths(ctx: AssetCtx, tiles: [number, number][]): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'paths';
  const all = [...tiles, ...GATE_COLS.map((c) => [c, GATE_ROW] as [number, number])];
  const set = new Set(all.map(([c, r]) => `${c},${r}`));
  const isGate = (c: number, r: number) => r === GATE_ROW && (GATE_COLS as readonly number[]).includes(c);
  const top: G[] = [];
  const kerbs: G[] = [];
  const h = TILE / 2;
  const KW = 0.15;
  const KH = 0.1;
  const Y = 0.04;
  for (const [c, r] of all) {
    const [x, z] = tileCenter(c, r);
    top.push(pn(topGeo(rect(x - h, z - h, x + h, z + h), Y)));
    const sides: [number, number, number, number, number, number][] = [
      // 邻格 dc, dr；路缘中心 x, z；长 x, 长 z
      [0, -1, x, z - h + KW / 2, TILE, KW],
      [0, 1, x, z + h - KW / 2, TILE, KW],
      [-1, 0, x - h + KW / 2, z, KW, TILE],
      [1, 0, x + h - KW / 2, z, KW, TILE],
    ];
    for (const [dc, dr, kx, kz, lx, lz] of sides) {
      const nc = c + dc;
      const nr = r + dr;
      if (set.has(`${nc},${nr}`)) continue;
      if (dr === 1 && isGate(c, r)) continue;
      kerbs.push(pn(box(lx, KH, lz, kx, 0, kz)));
    }
  }
  if (top.length) {
    const mesh = new THREE.Mesh(mergeGeometries(top), ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 29 } }));
    mesh.name = 'paths:top';
    ctx.mats.prepare(mesh, { cast: false });
    g.add(mesh);
  }
  if (kerbs.length) {
    const mesh = new THREE.Mesh(mergeGeometries(kerbs), ctx.mat('kerb', { edge: 0.25, convex: 0.35 }));
    mesh.name = 'paths:kerb';
    ctx.mats.prepare(mesh, { cast: false });
    g.add(mesh);
  }
  return g;
}
