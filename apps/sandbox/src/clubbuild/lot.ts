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
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, smoothLine, smoothLoop, topGeo, wallGeo } from '../clubsite/render/geo';
import type { ToonOpts } from '../clubsite/render/toon';
import { REUSED } from '../clubsite/reuse';
import { build as boulder } from './assets/boulder';
import { bakeStatic } from './assets/courts-common';
import { blobShadow } from './assets/flora-kit';
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
/** 第三级台地（地块加大、取景拉远以后北边还露得出来）：再高 4.5 米 */
const T3_H = 12;
const T3_Y = -DROP + T3_H;

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
  /**
   * 一般形式：row ≥ fromRow 且 col0 ≤ col ≤ col1（含两端）的格开放，其余锁着（北边的行 + 东西两侧的列条）。
   * 锁着的地方一样画成荒地 + 木桩小旗；往外开（fromRow 变小、col0 变小、col1 变大）就播铺草的动画：北边一行一波、两侧一列一波。
   * setOpenFrom(row) = setOpen({ fromRow: row, col0: 现在的 col0, col1: 现在的 col1 })。
   */
  setOpen(o: OpenRect): void;
  /** 现在的 fromRow（最后一次给的值；没调过 = 0） */
  readonly openFrom: number;
  /** 现在的开放范围 */
  readonly open: OpenRect;
}

export function buildLot(ctx: AssetCtx, _rng?: () => number): Lot {
  const root = new THREE.Group();
  root.name = 'lot';
  // 调试：game.ts 没把共享 uniforms 挂出来，量云影位置时从这里拿（window.__clubbuild.scene.getObjectByName('lot').userData.uniforms）
  root.userData.uniforms = ctx.uniforms;

  // ── 沙漠低地（铺得很远）+ 远山 ──
  const ground = new THREE.Mesh(groundGeo(), ctx.mat('desertLow', desEl(3)));
  ground.position.copy(GROUND_OFFSET);
  ground.name = 'ground';
  ctx.mats.prepare(ground, { cast: false });
  root.add(ground);
  const mountains = buildMountains(ctx.mats.toon as Parameters<typeof buildMountains>[0], 3);
  mountains.position.copy(MTN_OFFSET);
  // 美术 r2：地块加大以后竖屏取景拉远，远山（clubsite 地图边的山脊 + 天幕）会从画面上下两头露出来一大块平的梅紫色 →
  // 先不显示（北边由三级台地一直铺到画外，南边是平的沙漠）；对象留着（Lot 接口不变）
  mountains.visible = false;
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
  const setOpenFrom = (row: number) => parcels.set({ ...parcels.target, fromRow: row });
  root.userData.setOpenFrom = setOpenFrom;
  root.userData.setOpen = (o: OpenRect) => parcels.set(o);
  return {
    root,
    grid,
    mountains,
    setOpenFrom,
    setOpen: (o: OpenRect) => parcels.set(o),
    get openFrom() {
      return parcels.target.fromRow;
    },
    get open() {
      return { ...parcels.target };
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
  const wall = new THREE.Mesh(
    wallG,
    ctx.mat('adobe', { elem: { ...EL.adobe, seed: 5, size: [10, 4] }, noShadowReceive: true }),
  );
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
/** 第 c 列的 x 范围 */
const colX = (c: number): [number, number] => [-HX + c * TILE, -HX + (c + 1) * TILE];
const lawnKey = (r: number): keyof Pal => (r % 2 ? 'lotLawnStripe' : 'lotLawn');
/** 割草条纹的元素：几块有机形状的深浅（paint：同档三色，块约 22 × 12 纹素），很少的擦痕 = 草茬 */
const LAWN_EL: ToonOpts = { elem: { kind: 'paint', size: [22, 12], density: [0, 0.02], patch: 4, seed: 9 } };

/** 简单的确定性哈希（演出用，不进模拟） */
const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** 开放的范围：row ≥ fromRow 且 col0 ≤ col ≤ col1（含两端）的格是我们的，其余还锁着 */
export interface OpenRect {
  fromRow: number;
  col0: number;
  col1: number;
}
const isOpen = (o: OpenRect, c: number, r: number) => r >= o.fromRow && c >= o.col0 && c <= o.col1;
const sameRect = (a: OpenRect, b: OpenRect) => a.fromRow === b.fromRow && a.col0 === b.col0 && a.col1 === b.col1;
/** 世界坐标在哪一格（地块外 → 夹到边上） */
const tileOf = (x: number, z: number): [number, number] => [
  THREE.MathUtils.clamp(Math.floor((x + HX) / TILE), 0, LOT_W - 1),
  THREE.MathUtils.clamp(Math.floor((z + HZ) / TILE), 0, LOT_D - 1),
];

/**
 * 荒地上的植物簇（美术 r2 第 4 条：不再均匀撒点）：按地块比例手摆的 7 簇（u, v ∈ 0..1 = 西→东、北→南），每簇 4～7 件、半径 2～3 米，
 * 簇之间是只有沙纹的空地。北边几行和东西两边的列都有（地块加宽以后两侧的格也是先锁着的）。
 */
const WILD_CLUSTERS: [u: number, v: number, n: number][] = [
  [0.2, 0.06, 5],
  [0.62, 0.12, 6],
  [0.38, 0.27, 4],
  [0.85, 0.3, 5],
  [0.06, 0.45, 5],
  [0.95, 0.62, 4],
  [0.05, 0.8, 4],
];
const WILD_IDS = ['brittlebush', 'creosote', 'rocks', 'brittlebush', 'agave', 'rocks', 'barrel-cactus'];
/** 两条干河床（只比荒地深一点的弯带，宽 1.5 米）：让荒地有方向。u, v 同上 */
const WASHES: [number, number][][] = [
  [
    [-0.02, 0.2],
    [0.25, 0.14],
    [0.48, 0.21],
    [0.72, 0.16],
    [1.02, 0.22],
  ],
  [
    [0.1, 1.02],
    [0.06, 0.7],
    [0.12, 0.42],
    [0.05, 0.1],
  ],
];
const uvX = (u: number) => -HX + u * 2 * HX;
const uvZ = (v: number) => -HZ + v * 2 * HZ;

/** 一波（一起铺开的那几格）：沿 axis 从中间往两头铺 */
interface Wave {
  tiles: [number, number][];
  axis: 'x' | 'z';
  meshes: THREE.Mesh[];
}
interface Anim {
  waves: Wave[];
  t0: number;
}

class Parcels {
  /** 最后一次给的范围 */
  target: OpenRect = { fromRow: 0, col0: 0, col1: LOT_W - 1 };
  private lawn: THREE.Group | null = null;
  private wild: THREE.Group | null = null;
  private stakes: THREE.Group | null = null;
  private anim: Anim | null = null;
  private stakeK = 1;
  private first = true;
  private popT0 = -1;
  private lawnMats: Record<string, THREE.Material>;

  constructor(
    private ctx: AssetCtx,
    private root: THREE.Group,
  ) {
    this.lawnMats = {
      lotLawn: ctx.mat('lotLawn', LAWN_EL),
      lotLawnStripe: ctx.mat('lotLawnStripe', LAWN_EL),
    };
    this.draw(this.target);
    this.first = true;
  }

  set(o: OpenRect) {
    const r: OpenRect = {
      fromRow: THREE.MathUtils.clamp(Math.round(o.fromRow), 0, LOT_D),
      col0: THREE.MathUtils.clamp(Math.round(o.col0), 0, LOT_W - 1),
      col1: THREE.MathUtils.clamp(Math.round(o.col1), 0, LOT_W - 1),
    };
    if (sameRect(r, this.target) && !this.first) return;
    const prev = this.target;
    this.target = r;
    const grows = r.fromRow <= prev.fromRow && r.col0 <= prev.col0 && r.col1 >= prev.col1;
    if (this.first || !grows || this.anim) {
      // 第一次、往回锁（新开一局）、动画中又变了：直接画好
      this.first = false;
      this.finishAnim();
      this.draw(r);
      return;
    }
    // 往外开：静态的先留着旧的（荒地垫在下面），新开的格一波一波铺草。
    // 北边新开的行：一行一波（从旧边界往北），沿 x 从中间往两边铺；两侧新开的列：一列一波（从旧边界往外），沿 z 铺
    const waves: Wave[] = [];
    for (let row = prev.fromRow - 1; row >= r.fromRow; row--) {
      const tiles: [number, number][] = [];
      for (let c = r.col0; c <= r.col1; c++) tiles.push([c, row]);
      waves.push({ tiles, axis: 'x', meshes: [] });
    }
    const sideCols: number[] = [];
    for (let k = 1; k <= Math.max(prev.col0 - r.col0, r.col1 - prev.col1); k++) {
      if (prev.col0 - k >= r.col0) sideCols.push(prev.col0 - k);
      if (prev.col1 + k <= r.col1) sideCols.push(prev.col1 + k);
    }
    for (const c of sideCols) {
      const tiles: [number, number][] = [];
      for (let row = prev.fromRow; row < LOT_D; row++) tiles.push([c, row]);
      if (tiles.length) waves.push({ tiles, axis: 'z', meshes: [] });
    }
    this.anim = { waves, t0: -1 };
    // 新开那几格上的灌木、石头、河床先收掉（荒地底色留着，草铺上去盖住）
    this.drawWild(prev, r);
  }

  /** 每帧（绝对秒） */
  tick(now: number) {
    const a = this.anim;
    if (a) {
      if (a.t0 < 0) {
        a.t0 = now;
        for (const w of a.waves) w.meshes = this.waveMeshes(w);
      }
      const t = now - a.t0;
      // 旧的木桩 0.2 秒沉下去
      const sink = THREE.MathUtils.clamp(1 - t / 0.2, 0, 1);
      a.waves.forEach((w, i) => {
        const k = THREE.MathUtils.clamp((t - 0.15 - i * 0.15) / 0.45, 0, 1);
        const e = Math.max(0.001, 1 - (1 - k) ** 3);
        for (const m of w.meshes) m.scale[w.axis] = e;
      });
      const end = 0.15 + (a.waves.length - 1) * 0.15 + 0.45;
      if (sink > 0) this.setStakeK(sink);
      else if (t < end) this.setStakeK(0);
      else {
        // 草铺完：静态网格换成新的，木桩在新边界上弹起来
        this.finishAnim();
        this.draw(this.target);
        this.popT0 = now;
        this.setStakeK(0);
      }
    }
    this.popTick(now);
  }

  /** 一波的草：每种条纹一个网格，几何体按波的中心放（缩放从中间往两头） */
  private waveMeshes(w: Wave): THREE.Mesh[] {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [c, r] of w.tiles) {
      x0 = Math.min(x0, colX(c)[0]);
      x1 = Math.max(x1, colX(c)[1]);
      z0 = Math.min(z0, rowZ(r)[0]);
      z1 = Math.max(z1, rowZ(r)[1]);
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const by = new Map<keyof Pal, G[]>();
    for (const [c, r] of w.tiles) {
      const [a, b] = colX(c);
      const [p, q] = rowZ(r);
      const k = lawnKey(r);
      const list = by.get(k) ?? [];
      list.push(pn(topGeo(rect(a - cx, p - cz, b - cx, q - cz), 0.012)));
      by.set(k, list);
    }
    const out: THREE.Mesh[] = [];
    for (const [k, list] of by) {
      const m = new THREE.Mesh(mergeGeometries(list), this.lawnMats[k as string]);
      m.name = 'lawn-open';
      m.receiveShadow = true;
      m.position.set(cx, 0, cz);
      m.scale[w.axis] = 0.001;
      this.root.add(m);
      out.push(m);
    }
    return out;
  }

  private popTick(now: number) {
    if (this.popT0 < 0 || !this.stakes) return;
    const t = now - this.popT0;
    if (t > 0.7) {
      this.popT0 = -1;
      this.setStakeK(1);
      return;
    }
    // 一根根弹起来：按离大门的远近错开，过冲 1.2 再落回 1
    this.stakeK = -1;
    this.stakes.children.forEach((c) => {
      const d = (c.userData.order as number | undefined) ?? 0;
      const k = THREE.MathUtils.clamp((t - d * 0.3) / 0.3, 0, 1);
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
    for (const w of this.anim.waves)
      for (const m of w.meshes) {
        m.removeFromParent();
        m.geometry.dispose();
      }
    this.anim = null;
  }

  /** 静态网格：草坪（开放的格）、荒地（锁着的格）、交界的木桩 */
  private draw(o: OpenRect) {
    const { ctx, root } = this;
    if (this.lawn) {
      root.remove(this.lawn);
      dispose(this.lawn);
    }
    const lawn = new Bins();
    // 每行一条（只铺开放的列）
    for (let r = o.fromRow; r < LOT_D; r++) {
      const [z0, z1] = rowZ(r);
      lawn.add(lawnKey(r), pn(topGeo(rect(colX(o.col0)[0], z0, colX(o.col1)[1], z1), 0)), LAWN_EL);
    }
    this.lawn = lawn.build(ctx, 'lot-top', { cast: false });
    root.add(this.lawn);
    this.drawWild(o, o);
    this.drawStakes(o);
  }

  /** 荒地：底色铺在 open 锁着的格；灌木簇、河床只画在 bush 也锁着的格（动画时新开的格先收掉） */
  private drawWild(open: OpenRect, bush: OpenRect) {
    const { ctx, root } = this;
    if (this.wild) {
      root.remove(this.wild);
      dispose(this.wild);
      this.wild = null;
    }
    const grp = new THREE.Group();
    grp.name = 'lot-wild';
    const B = new Bins();
    // 底色：北边整行 + 两侧的列条（按矩形铺，少几个三角形）
    const strips: [number, number, number, number][] = [];
    if (open.fromRow > 0) strips.push([-HX, -HZ, HX, rowZ(open.fromRow - 1)[1]]);
    const zs = open.fromRow < LOT_D ? rowZ(open.fromRow)[0] : HZ;
    if (open.col0 > 0) strips.push([-HX, zs, colX(open.col0 - 1)[1], HZ]);
    if (open.col1 < LOT_W - 1) strips.push([colX(open.col1 + 1)[0], zs, HX, HZ]);
    if (!strips.length) {
      root.add(grp);
      this.wild = grp;
      return;
    }
    for (const [x0, z0, x1, z1] of strips)
      B.add('lotWild', pn(topGeo(rect(x0, z0, x1, z1), -0.005)), { elem: { ...EL.sand, seed: 13, pebbles: 0.09 } });
    const locked = (x: number, z: number) => {
      const [c, r] = tileOf(x, z);
      return !isOpen(bush, c, r);
    };
    // 干河床：沿折线一条 1.5 米宽的带（每 0.6 米一段，段中点锁着才画）
    for (const w of WASHES) {
      const line = smoothLine(
        w.map(([u, v]) => [uvX(u), uvZ(v)] as V2),
        0.6,
      );
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = line[i];
        const [bx, bz] = line[i + 1];
        if (!locked((ax + bx) / 2, (az + bz) / 2)) continue;
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const nx = (-(bz - az) / L) * 0.75;
        const nz = ((bx - ax) / L) * 0.75;
        // 宽度沿河床起伏一点（0.6～1 倍）
        const k0 = 0.6 + 0.4 * hash(i, 3);
        const k1 = 0.6 + 0.4 * hash(i + 1, 3);
        B.add(
          'sandPatch',
          pn(
            topGeo(
              [
                [ax + nx * k0, az + nz * k0],
                [bx + nx * k1, bz + nz * k1],
                [bx - nx * k1, bz - nz * k1],
                [ax - nx * k0, az - nz * k0],
              ],
              0.0,
            ),
          ),
          { elem: { ...EL.sand, seed: 17, mottle: 0.2, pebbles: 0.14 }, edge: 0.05, convex: 0 },
          'wash',
        );
      }
    }
    grp.add(B.build(ctx, 'lot-wild:ground', { cast: false }));
    // 植物簇（复用的沙漠植物，缩小；不投影，脚下团影）
    const items = new THREE.Group();
    const shadows = new Bins();
    WILD_CLUSTERS.forEach(([u, v, n], ci) => {
      const cx = uvX(u);
      const cz = uvZ(v);
      for (let i = 0; i < n; i++) {
        const a = hash(ci, i * 3) * Math.PI * 2;
        const rr = (i === 0 ? 0 : 0.8 + hash(ci, i * 3 + 1) * 1.8) * 1;
        const x = THREE.MathUtils.clamp(cx + Math.cos(a) * rr, -HX + 0.8, HX - 0.8);
        const z = THREE.MathUtils.clamp(cz + Math.sin(a) * rr * 0.8, -HZ + 0.8, HZ - 0.8);
        if (!locked(x, z)) continue;
        const id = WILD_IDS[(ci * 3 + i) % WILD_IDS.length];
        const b = REUSED[id] as unknown as AssetBuild | undefined;
        if (!b) continue;
        const o = b({ ...ctx, variant: (ci + i) % 3 });
        const sc = 0.5 + hash(ci, i * 3 + 2) * 0.3;
        o.position.set(x, 0, z);
        o.rotation.y = hash(i, ci) * Math.PI * 2;
        o.scale.setScalar(sc);
        o.traverse((c) => {
          c.castShadow = false;
        });
        items.add(o);
        const sh = blobShadow(ctx, 'lotWild', 0.9 * sc + 0.2, 0.6 * sc + 0.15, 0.008);
        sh.geometry.translate(x, 0, z + 0.2);
        shadows.add(
          'lotWild',
          sh.geometry,
          { bands: [9, 9], edge: 0, convex: 0, elem: { ...EL.sand, seed: 13 } },
          'blob',
        );
      }
    });
    bakeStatic(items, [...items.children]);
    grp.add(items);
    grp.add(shadows.build(ctx, 'lot-wild:blobs', { cast: false }));
    this.wild = grp;
    root.add(grp);
  }

  /**
   * 交界：每 3 米一根木桩（0.4 米见方、1.6 米高，隔一根桩顶一面方旗），桩之间一串三角小旗（红 / 黄 / 蓝轮着，0.8 米见方 ≈ 5 纹素）。
   * 北边一条横的（锁着的行和开放的行之间），两侧各一条竖的（锁着的列和开放的列之间）。
   */
  private drawStakes(o: OpenRect) {
    const { ctx, root } = this;
    if (this.stakes) {
      root.remove(this.stakes);
      dispose(this.stakes);
      this.stakes = null;
    }
    const grp = new THREE.Group();
    grp.name = 'lot-stakes';
    const xw = colX(o.col0)[0];
    const xe = colX(o.col1)[1];
    const zn = o.fromRow < LOT_D ? rowZ(o.fromRow)[0] : HZ;
    // 每段：从 (ax, az) 往 (dx, dz) 方向 TILE 米，一根桩 + 一段绳和小旗
    const runs: [number, number, number, number, number][] = [];
    const cols = o.col1 - o.col0 + 1;
    if (o.fromRow > 0) for (let i = 0; i <= cols; i++) runs.push([xw + i * TILE, zn, 1, 0, i < cols ? 1 : 0]);
    const rows = LOT_D - o.fromRow;
    // 南边贴着压顶的那一段不用（墙就是边界）：竖线从北边界画到南沿前一格
    if (o.col0 > 0)
      for (let j = o.fromRow > 0 ? 1 : 0; j < rows; j++) runs.push([xw, zn + j * TILE, 0, 1, j < rows - 1 ? 1 : 0]);
    if (o.col1 < LOT_W - 1)
      for (let j = o.fromRow > 0 ? 1 : 0; j < rows; j++) runs.push([xe, zn + j * TILE, 0, 1, j < rows - 1 ? 1 : 0]);
    const SH = 1.6;
    const ROPE_Y = 1.35;
    const flagKeys: (keyof Pal)[] = ['clothRed', 'flowerYellow', 'counter'];
    const FACE2: ToonOpts = { ...FACE, side: THREE.DoubleSide, edge: 0.35, convex: 0 };
    runs.forEach(([x, z, dx, dz, rope], i) => {
      const B = new Bins();
      B.add('timber', box(0.4, SH, 0.4, 0, 0, 0), { lightUp: 0.45, edge: 0.5, convex: 0.4 }, 'stake');
      if (i % 2 === 0) {
        // 桩顶的小方旗（朝镜头，往东飘）
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
        fg.computeVertexNormals();
        B.add('clothRed', fg, FACE2, 'flagTop');
        B.add('timber', box(0.14, 0.45, 0.14, 0.15, SH, 0), { lightUp: 0.45, edge: 0.4, convex: 0.2 }, 'stake');
      }
      if (rope) {
        // 绳：往下兜一点（两段），0.16 米粗；三面倒三角小旗（竖的段转过来，旗面还是朝镜头）
        const sag = 0.25;
        const P = (t: number, y: number) => new THREE.Vector3(dx * TILE * t, y, dz * TILE * t);
        B.add('timber', bar(P(0, ROPE_Y), P(0.5, ROPE_Y - sag), 0.16), { lightUp: 0.4, edge: 0.2, convex: 0 }, 'rope');
        B.add('timber', bar(P(0.5, ROPE_Y - sag), P(1, ROPE_Y), 0.16), { lightUp: 0.4, edge: 0.2, convex: 0 }, 'rope');
        for (let k = 0; k < 3; k++) {
          const u = (k + 0.5) / 3;
          const c = P(u, ROPE_Y - sag * (1 - (2 * u - 1) ** 2) - 0.02);
          const g = new THREE.BufferGeometry();
          g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
              [c.x - 0.4, c.y, c.z + 0.03, c.x + 0.4, c.y, c.z + 0.03, c.x, c.y - 0.8, c.z + 0.03],
              3,
            ),
          );
          g.computeVertexNormals();
          B.add(flagKeys[(i * 3 + k) % 3], g, FACE2, 'flag');
        }
      }
      const st = B.build(ctx, `stake:${i}`, { cast: false });
      st.position.set(x, 0, z);
      // 弹起来的先后：离大门（南边正中）越近越先
      st.userData.order = THREE.MathUtils.clamp(Math.hypot(x - GATE_X, z - HZ) / Math.hypot(HX, 2 * HZ), 0, 1);
      grp.add(st);
    });
    // 两侧锁着的列条 = 邻居的空地：条子南头、贴着木桩线立一块"出售"牌（白底红边，正中一枚金币；朝镜头，开罗式的"这块能买"）
    const sale = (cx: number) => {
      const B = new Bins();
      const F: ToonOpts = { lightUp: 0.8, bands: [-0.8, -0.3], noShadowReceive: true, edge: 0.5, convex: 0.2 };
      B.add('timber', box(0.3, 2.0, 0.3, -0.9, 0, 0), { lightUp: 0.45, convex: 0.3 }, 'post');
      B.add('timber', box(0.3, 2.0, 0.3, 0.9, 0, 0), { lightUp: 0.45, convex: 0.3 }, 'post');
      B.add('clothRed', box(2.6, 1.5, 0.12, 0, 1.0, 0.1), F, 'rim');
      B.add('clothWhite', box(2.2, 1.1, 0.06, 0, 1.2, 0.2), F, 'face');
      const coin = new THREE.CylinderGeometry(0.4, 0.4, 0.06, 12).rotateX(Math.PI / 2).translate(0, 1.75, 0.26);
      B.add('flowerYellow', coin, F, 'coin');
      B.add('clothRed', box(0.14, 0.5, 0.04, 0, 1.5, 0.3), F, 'dollar');
      const g = B.build(ctx, 'for-sale', { cast: false });
      g.rotation.x = -0.25;
      g.position.set(cx, 0, HZ - TILE * 1.6);
      g.userData.order = 1;
      grp.add(g);
    };
    // 牌子贴着木桩线立在条子里（竖屏取景时两侧的条子大多在画外，贴边才看得见）
    if (o.col0 > 0) sale(xw - 2.2);
    if (o.col1 < LOT_W - 1) sale(xe + 2.2);
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

/** 地块外的沙地元素：沙纹 + 深浅斑 + 碎石，碎石换成灰一点的（布景低彩度） */
const DES_ACC: [number, number, number] = [0xb09080, 0x8a7078, 0x5e4c70];
const desEl = (seed: number): ToonOpts => ({ elem: { ...EL.sand, seed, accent: DES_ACC } });

/** 北边的点：x = f × HX（地块半宽的倍数），z = 地块北沿往北 d 米（地块变大时布景跟着走） */
const N = (f: number, d: number): V2 => [f * HX, -HZ - d];

/** 台地：南沿是一条手摆的弯线（只有朝南的段在画面里出暗带），往北一直铺到画外 */
function terrace(ctrl: V2[]): V2[] {
  const edge = smoothLine(ctrl, 1.5);
  return [...edge, [ctrl[ctrl.length - 1][0], -320], [ctrl[0][0], -320]];
}

/**
 * 美术 r2：崖壁是"冷的天然岩"（mesaCliff，靛紫），不是砖：岩层又宽又扁（30 × 9 纹素），亮边只给三成五；
 * 不再是平行的带 —— 第一级是两块独立的小台地、中间一条沙谷，第二级一个深豁口，第三级斜着走，崖脚几堆落石。
 */
function buildTerraces(ctx: AssetCtx, root: THREE.Group) {
  const B = new Bins();
  // 第一级：3 米，崖顶 z ≈ −47；西边 x −40…−20 一个往南伸到 −42.4 的岬（离地块压顶还有 3 米）
  // 竖屏里看得见的是 x ∈ ±1.05 HX。三条平行的弯带读成"三道墙"（美术 r2 第 3 条）→ 第一级不再是一条带，
  // 而是两块各自独立的小台地（西边大、东边小，四周都是崖），中间一条沙谷一直伸到第二级崖脚；第二级中间一个深豁口；第三级斜着走。
  const loop = (pts: [number, number][]) =>
    smoothLoop(
      pts.map(([f, d]) => N(f, d)),
      1.5,
      () => 0.5,
      0,
    );
  const mesaA = loop([
    [-1.6, 5.4],
    [-1.15, 4.6],
    [-0.82, 3.8],
    [-0.56, 4.8],
    [-0.36, 6.8],
    [-0.2, 10],
    [-0.22, 15],
    [-0.32, 26],
    [-1.6, 26],
  ]);
  const mesaB = loop([
    [0.32, 14],
    [0.44, 9],
    [0.68, 6.8],
    [0.95, 7.6],
    [1.2, 6.4],
    [1.6, 7],
    [1.6, 26],
    [0.42, 26],
  ]);
  // 第二级：再高 4.5 米（沙谷那里从低地直接起 7.5 米），崖顶 ~20 米；沙谷北头一个往北凹到 27 米的豁口
  const t2 = terrace([
    N(-6.3, 21),
    N(-1.1, 20),
    N(-0.6, 18.6),
    N(-0.3, 21),
    N(-0.12, 24),
    N(0.05, 27),
    N(0.2, 26),
    N(0.36, 21.5),
    N(0.6, 19.4),
    N(0.9, 21),
    N(6.3, 21),
  ]);
  // 第三级：崖顶 ~35～44 米，西高东低地斜着走（和下面不平行）
  const t3 = terrace([N(-6.3, 36), N(-0.9, 35), N(-0.5, 38.5), N(-0.1, 42), N(0.35, 39), N(0.8, 41.5), N(6.3, 44)]);
  for (const m of [mesaA, mesaB]) B.add('mesaTop', pn(topGeo(m, T1_Y)), desEl(21), 't1');
  B.add('mesaTop', pn(topGeo(t2, T2_Y)), desEl(27), 't2');
  B.add('mesaTop', pn(topGeo(t3, T3_Y)), desEl(31), 't3');
  const cliffOpts: ToonOpts = {
    elem: { ...EL.strata, seed: 11, size: [30, 9], hi: 0.35, accent: [0xd8b48e, 0xb08a76, 0x6a5e8e] },
    noShadowReceive: true,
  };
  for (const m of [mesaA, mesaB])
    B.add(
      'mesaCliff',
      wallGeo(m, T1_Y, -DROP - 0.1, true, 0, () => T1_H),
      cliffOpts,
      'c',
    );
  // 第二级的墙一直下到低地（沙谷那段露出整 7.5 米；台地后面那段被挡住）
  B.add(
    'mesaCliff',
    wallGeo(t2, T2_Y, -DROP - 0.1, true, 0, () => T2_H),
    cliffOpts,
    'c',
  );
  B.add(
    'mesaCliff',
    wallGeo(t3, T3_Y, T2_Y - 0.1, true, 0, () => T3_H - T2_H),
    cliffOpts,
    'c',
  );
  const g = B.build(ctx, 'terraces', { cast: true });
  // 台面接投影（树影），崖壁不接（毛边落在竖面上是麻点）
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
  // 牌子上不写字（1× 下每个字 1～2 纹素 = 一排碎点）：正中一个网球图标（黄绿圆 + 两道白缝线，笔画 ≥ 2 纹素），两边各一颗金星
  const ICON: ToonOpts = { lightUp: 0.8, bands: [-0.8, -0.3], edge: 0.3, convex: 0, noShadowReceive: true };
  const ball = new THREE.CylinderGeometry(0.58, 0.58, 0.08, 16).rotateX(Math.PI / 2).translate(0, SH / 2, 0.14);
  S.add('ball', ball, ICON, 'ball');
  for (const sx of [-1, 1]) {
    // 缝线：贴着球边往里弯的一段圆弧（0.14 米粗 ≈ 1 纹素、45° 下 ≥ 1 行）
    const arc = new THREE.TorusGeometry(0.62, 0.075, 3, 10, Math.PI * 0.62)
      .rotateZ(sx > 0 ? Math.PI - Math.PI * 0.31 : -Math.PI * 0.31)
      .translate(sx * 0.82, SH / 2, 0.2);
    S.add('clothWhite', arc, ICON, 'seam');
    const st = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.2 : 0.46;
      if (i === 0) st.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else st.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    S.add('flowerYellow', new THREE.ShapeGeometry(st).translate(sx * 2.1, SH / 2, 0.12), ICON, 'star');
  }
  // 牌子上沿一条陶砖压边
  S.add('cap', box(SW + 0.2, 0.16, 0.3, 0, SH, 0), { convex: 0.4 }, 'scap');
  const sg = S.build(ctx, 'gate-sign', { cast: false });
  sign.add(sg);
  sign.rotation.x = -0.35;
  sign.position.set(GATE_X, BEAM_Y + 0.4, pz);
  root.add(sign);
  // 门柱、横梁不投影：影子只会把门洞和坡道涂成一个黑洞（美术 r2 第 6 条）
  root.add(B.build(ctx, 'gate', { cast: false }));
  // 夜里：门柱上两盏灯照亮门洞和坡道（clubsite/daylight 找 userData.night，天黑自动开）
  const lamp = new THREE.Object3D();
  lamp.name = 'gate-lamp';
  lamp.userData.night = {
    setOn: () => {},
    pool: (): [number, number, number, number] => [GATE_X, HZ + 1.5, 7.5, 6],
  };
  root.add(lamp);

  // 坡道：压顶外沿 → 往南 RAMP 米下到沙漠；两边一道跟着坡下去的土坯矮墙。坡面不接投影（门柱、矮墙的影子）
  const R = new Bins();
  const RAMP_FL: ToonOpts = { elem: { ...EL.flagstone, seed: 41, size: [10, 6] }, noShadowReceive: true };
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
    RAMP_FL,
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
    RAMP_FL,
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
// 南边：大门外（前庭、一条土路、公交站牌、一块碎石空地）
// ════════════════════════════════════════════════════════════════════
// 美术 r2 大改 A：布景和可建物分成两套词汇。地块里（可建）独占椰子树、陶砖、沥青停车场、俱乐部蓝、白帆、彩色招牌；
// 地块外只有自然的东西（蒲葵、烟树、石炭酸灌木、蜡烛木、龙舌兰、石头、大石头），低彩度，不放车、不放车位线、不放陶砖。
// 大门外只留引导视线的石板前庭，往南是一条踩实的土路（path，比沙浅、彩度低），路边一块碎石空地和一根公交站牌。

/** 前庭：坡脚往南 6.5 米、东西 ±10 米 */
const FORE: [number, number, number, number] = [GATE_X - 10, RAMP_Z0 + RAMP, GATE_X + 10, RAMP_Z0 + RAMP + 6.5];

/** 不规则的圆（碎石空地、干河床的端头） */
function blobLoop(cx: number, cz: number, rx: number, rz: number, seed: number, n = 18): V2[] {
  return Array.from({ length: n }, (_, i): V2 => {
    const a = (i / n) * Math.PI * 2;
    const k = 0.86 + 0.28 * hash(seed, i);
    return [cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k];
  });
}

function buildPlaza(ctx: AssetCtx, root: THREE.Group) {
  const B = new Bins();
  const yG = -DROP;
  // 前庭石板：比园内小路的石板大一号（[10, 6] 纹素 ≈ 1.5 × 0.9 米），读成"广场"
  const FL: ToonOpts = { elem: { ...EL.flagstone, seed: 43, size: [10, 6] } };
  B.add('flagstone', pn(topGeo(rect(FORE[0], FORE[1], FORE[2], FORE[3]), yG + 0.04)), FL, 'fl');
  // 前庭四边的路缘（水泥，0.2 宽 0.12 高；南边路口断开）
  const K = 0.22;
  const KH = 0.14;
  const kerb = (x0: number, z0: number, x1: number, z1: number) =>
    B.add('kerb', box(x1 - x0, KH, z1 - z0, (x0 + x1) / 2, yG, (z0 + z1) / 2), { edge: 0.3, convex: 0.3 }, 'kerb');
  kerb(FORE[0] - K, FORE[1], FORE[0], FORE[3] + K);
  kerb(FORE[2], FORE[1], FORE[2] + K, FORE[3] + K);
  kerb(FORE[0] - K, FORE[3], GATE_X - ROAD_HALF, FORE[3] + K);
  kerb(GATE_X + ROAD_HALF, FORE[3], FORE[2] + K, FORE[3] + K);
  // 土路：踩实的钙质土（path + 土路元素），从画面下沿进来；两边不加路缘
  B.add(
    'path',
    pn(topGeo(rect(GATE_X - ROAD_HALF, FORE[3], GATE_X + ROAD_HALF, ROAD_FAR + 140), yG + 0.03)),
    { elem: { ...EL.path, seed: 47, size: [8, 5] } },
    'road',
  );
  // 路西边一块碎石空地（客人下车的地方）：压实的碎石，比沙亮、彩度低，没有车位线
  const gravel = blobLoop(GATE_X - 11, FORE[3] + 7.5, 6.5, 4.2, 7);
  B.add('stallGravel', pn(topGeo(gravel, yG + 0.02)), { elem: { ...EL.granite, seed: 53 } }, 'gravel');
  root.add(B.build(ctx, 'plaza', { cast: false }));

  // 公交站牌：路东边一根杆 + 一块圆牌（黄底、深色的车形）+ 下面一块时刻表小牌
  const S = new Bins();
  const sx = GATE_X + ROAD_HALF + 1.2;
  const sz = FORE[3] + 6;
  const ICON: ToonOpts = { lightUp: 0.8, bands: [-0.8, -0.3], edge: 0.4, convex: 0, noShadowReceive: true };
  S.add('ironwork', box(0.26, 3.2, 0.26, sx, yG, sz), { lightUp: 0.5, convex: 0.3 }, 'pole');
  const disc = new THREE.CylinderGeometry(0.62, 0.62, 0.1, 14)
    .rotateX(Math.PI / 2)
    .rotateX(-0.35)
    .translate(sx, yG + 3.1, sz + 0.15);
  S.add('flowerYellow', disc, ICON, 'disc');
  S.add('ironwork', box(0.7, 0.34, 0.06, sx, yG + 2.92, sz + 0.24).rotateX(0), ICON, 'bus');
  S.add('clothWhite', box(0.5, 0.6, 0.08, sx, yG + 1.5, sz + 0.16), ICON, 'table');
  const stop = S.build(ctx, 'bus-stop', { cast: true });
  // 夜里站牌下一圈路灯光
  stop.userData.night = { setOn: () => {}, pool: (): [number, number, number, number] => [sx, sz, 4, 4] };
  root.add(stop);
}

// ════════════════════════════════════════════════════════════════════
// 布景：手摆的自然物（蒲葵、烟树、灌木、石头），不撒随机环
// ════════════════════════════════════════════════════════════════════

/** 一件布景：复用资产 id（clubsite/reuse 的）或 'boulder'（落石，assets/boulder）；x, z 世界坐标；s 缩放；v 变体 */
type Item = [id: string, x: number, z: number, s?: number, v?: number];
/** 会投影的高东西（其余不投太阳影，脚下一块团影） */
const TALL = new Set(['fan-palm', 'smoke-tree', 'palo-verde', 'boulder', 'ocotillo']);

/**
 * 低地（y = −DROP）。规则：高的东西离可建的地块至少一格，南边的高树还要再往南推（45° 下树冠往画面上方投，
 * 9 米的蒲葵冠会压到地块南沿的格子上）→ 南边高树 z ≥ 地块南沿 + 10 米。
 */
const LOW: Item[] = [
  // 沙谷（两块小台地之间，一直到第二级崖脚）：矮灌木、石头，崖脚落石
  ['rocks', 0.05 * HX, -HZ - 5, 1.1, 1],
  ['creosote', 0.14 * HX, -HZ - 8.5, 0.9, 0],
  ['agave', -0.02 * HX, -HZ - 12, 0.9, 1],
  ['boulder', 0.04 * HX, -HZ - 24.8, 0.6, 1],
  ['rocks', 0.15 * HX, -HZ - 23.6, 1, 2],
  ['smoke-tree', 0.2 * HX, -HZ - 17, 0.9, 0],
  // 小台地脚下的落石（离地块 ≥ 2.5 米，矮）
  ['boulder', -0.66 * HX, -HZ - 2.9, 0.42, 2],
  ['rocks', -0.58 * HX, -HZ - 2.4, 0.8, 0],
  ['boulder', 0.98 * HX, -HZ - 5.4, 0.45, 0],
  ['rocks', 0.86 * HX, -HZ - 5, 0.9, 1],
  // 前庭两侧（矮）
  ['agave', FORE[0] - 1.8, FORE[1] + 1.6, 1, 0],
  ['rocks', FORE[0] - 3.2, FORE[1] + 2.6, 1, 2],
  ['barrel-cactus', FORE[2] + 1.8, FORE[1] + 1.4, 1, 1],
  ['rocks', FORE[2] + 3, FORE[1] + 2.4, 0.9, 0],
  // 路两边：蒲葵、烟树（往南推，离地块 ≥ 10 米）
  ['fan-palm', GATE_X - 5, FORE[3] + 2.6, 0.8, 0],
  ['fan-palm', GATE_X + 5.4, FORE[3] + 3.4, 0.75, 1],
  ['smoke-tree', GATE_X + 9.5, FORE[3] + 10, 0.9, 0],
  ['fan-palm', GATE_X - 4.6, FORE[3] + 15, 0.85, 2],
  ['fan-palm', GATE_X + 4.8, FORE[3] + 17, 0.8, 0],
  // 碎石空地四周、更远的沙漠
  ['creosote', GATE_X - 18, FORE[3] + 5, 1, 1],
  ['ocotillo', GATE_X - 19.5, FORE[3] + 8, 1, 0],
  ['rocks', GATE_X - 17, FORE[3] + 10.5, 1.2, 0],
  ['smoke-tree', GATE_X - 24, FORE[3] + 13, 1, 1],
  ['agave', GATE_X + 17, FORE[3] + 6, 1, 0],
  ['rocks', GATE_X + 19, FORE[3] + 5, 1.1, 2],
  ['creosote', GATE_X + 22, FORE[3] + 12, 1, 0],
  ['boulder', GATE_X + 24, FORE[3] + 19, 0.7, 0],
  ['brittlebush', GATE_X - 12, FORE[3] + 18, 0.9, 1],
  ['rocks', GATE_X + 11, FORE[3] + 21, 0.8, 1],
  // 更远的南边沙漠（取景拉远以后露出来的）：几簇
  ['smoke-tree', -0.6 * HX, HZ + 22, 1, 0],
  ['rocks', -0.55 * HX, HZ + 23.5, 1.2, 2],
  ['creosote', 0.62 * HX, HZ + 21, 1, 1],
  ['agave', 0.58 * HX, HZ + 22.5, 1, 0],
  ['ocotillo', -0.85 * HX, HZ + 32, 1, 1],
  ['rocks', -0.8 * HX, HZ + 33.5, 1.3, 0],
  ['fan-palm', 0.4 * HX, HZ + 37, 0.9, 1],
  ['rocks', 0.44 * HX, HZ + 38, 1, 1],
  ['boulder', 0.9 * HX, HZ + 28, 0.6, 2],
  ['brittlebush', 0.84 * HX, HZ + 29.5, 1, 0],
];
/** 第一级台面（y = T1_Y）：成簇（烟树 + 蒲葵 + 灌木 + 石头），簇之间空着 */
const MESA1: Item[] = [
  // 西边那块小台地
  ['fan-palm', -0.75 * HX, -HZ - 10, 0.8, 0],
  ['smoke-tree', -0.92 * HX, -HZ - 13, 0.9, 1],
  ['rocks', -0.6 * HX, -HZ - 8, 1.2, 0],
  ['creosote', -1.02 * HX, -HZ - 8.6, 1, 1],
  ['brittlebush', -0.48 * HX, -HZ - 12, 0.9, 1],
  // 东边那块
  ['smoke-tree', 0.76 * HX, -HZ - 13, 1, 1],
  ['ocotillo', 0.62 * HX, -HZ - 11.5, 1, 0],
  ['rocks', 0.9 * HX, -HZ - 10, 1.1, 2],
  ['agave', 1.05 * HX, -HZ - 12.4, 1, 2],
];
/** 第二级台面（y = T2_Y）：只露出冠 */
const MESA2: Item[] = [
  ['fan-palm', -0.85 * HX, -HZ - 27, 0.9, 1],
  ['smoke-tree', -0.7 * HX, -HZ - 30, 1, 0],
  ['fan-palm', 0.05 * HX, -HZ - 33, 0.9, 2],
  ['smoke-tree', 0.75 * HX, -HZ - 28, 1, 0],
  ['rocks', 0.65 * HX, -HZ - 26, 1.3, 2],
];

/** 第三级台面：几棵烟树、蒲葵剪影 */
const MESA3: Item[] = [
  ['smoke-tree', -0.95 * HX, -HZ - 40, 1.1, 1],
  ['fan-palm', -0.6 * HX, -HZ - 41.5, 0.9, 0],
  ['rocks', 0.3 * HX, -HZ - 44, 1.4, 1],
  ['smoke-tree', 0.9 * HX, -HZ - 47, 1, 0],
];

function buildScenery(ctx: AssetCtx, root: THREE.Group) {
  const level = (items: Item[], y: number, ground: keyof Pal, name: string) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.y = y;
    const statics: THREE.Object3D[] = [];
    const shadows = new Bins();
    for (const [id, x, z, s = 1, v = 0] of items) {
      const b = (id === 'boulder' ? boulder : REUSED[id]) as unknown as AssetBuild | undefined;
      if (!b) continue;
      const o = b({ ...ctx, variant: v });
      o.position.set(x, 0, z);
      o.rotation.y = hash(x * 10, z * 10) * Math.PI * 2;
      o.scale.setScalar(s);
      g.add(o);
      statics.push(o);
      if (TALL.has(id)) continue;
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
      shadows.add(ground, sh.geometry, { bands: [9, 9], edge: 0, convex: 0, ...desEl(3) }, 'blob');
    }
    bakeStatic(g, statics);
    g.add(shadows.build(ctx, `${name}:blobs`, { cast: false }));
    root.add(g);
  };
  level(LOW, -DROP, 'desertLow', 'scenery-low');
  level(MESA1, T1_Y, 'mesaTop', 'scenery-mesa1');
  level(MESA2, T2_Y, 'mesaTop', 'scenery-mesa2');
  level(MESA3, T3_Y, 'mesaTop', 'scenery-mesa3');
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
    const mesh = new THREE.Mesh(
      mergeGeometries(top),
      // 园内小路的石板按这里的纹素缩小（[8, 5] ≈ 1.2 × 0.75 米：比一个人宽不了多少），前庭的大一号
      ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 29, size: [8, 5] } }),
    );
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
