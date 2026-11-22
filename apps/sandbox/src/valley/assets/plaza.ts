// 小镇的街道家具 + 空当的主角（批 PZ，2026-11-21 小镇压紧 · 美术精细化 plaza 区）。场景里在 detail/plaza.ts 摆。
// 每个资产：ASSETS['<id>'] = (ctx) => THREE.Object3D。本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米，按**真尺寸**画
// （小镇里 townwrap / plaza.ts 整件乘 TOWN_K 0.62）。设计纹素 0.09 米：杆、框 ≥ 2 纹素，线 1 纹素，字一律不写（只有图标、数字）。
// 材质只用 ctx.mat(key, extra)；颜色手挑的（垃圾箱的深绿）在这里给 ramp；随机只用 ctx.rng。画廊：/valleyassets.html?asset=<id>。
// 小件、朝镜头的竖直面：PROP（光往上偏、不收投影 → 朝南的面落中档，不是一块暗方块）；大件照常投影，细的部件不投影。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../ctx';
import { type PalKey, SIGN_FACE, TOWN_EL } from '../palette';

/** 设计纹素、竖直面上一屏幕行（俯 45°） */
const T = 0.09;
const ROW = T / Math.SQRT1_2;
/** 小件：光往上偏、不收投影 */
const PROP: ToonOpts = { lightUp: 0.45, bands: [-0.3, 0.4], noShadowReceive: true };
/** 圆的小件（消防栓、盆、桶）：再加一点凸边 */
const ROUNDP: ToonOpts = { ...PROP, convex: 0.3 };

type Part = [THREE.BufferGeometry, THREE.Material];
class Parts {
  readonly list: Part[] = [];
  readonly noCast = new Set<THREE.Material>();
  add(m: THREE.Material, g: THREE.BufferGeometry): THREE.BufferGeometry {
    this.list.push([g, m]);
    return g;
  }
  /** 盒子：中心 x z、底 y */
  bx(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    const g = box(w, h, d, 0, 0, 0).rotateY(ry).translate(x, y, z);
    return this.add(m, g);
  }
  /** 立着的圆柱（底 y） */
  cyl(m: THREE.Material, r0: number, r1: number, h: number, x: number, y: number, z: number, n = 8) {
    return this.add(m, new THREE.CylinderGeometry(r0, r1, h, n).translate(x, y + h / 2, z));
  }
  /** 朝 +z 的薄片 */
  face(m: THREE.Material, w: number, h: number, x: number, y: number, z: number) {
    return this.add(m, new THREE.PlaneGeometry(w, h).translate(x, y, z));
  }
  /** 地上一块平面 */
  floor(m: THREE.Material, w: number, d: number, x: number, y: number, z: number) {
    return this.add(m, new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z));
  }
  build(ctx: AssetCtx, name: string, noCast: THREE.Material[] = []): THREE.Group {
    for (const m of noCast) this.noCast.add(m);
    const g = new THREE.Group();
    g.name = name;
    const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const [geo, m] of this.list) {
      const ng = geo.index ? geo.toNonIndexed() : geo;
      for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
      if (!ng.attributes.normal) ng.computeVertexNormals();
      by.set(m, [...(by.get(m) ?? []), ng]);
    }
    for (const [m, list] of by) {
      const merged = mergeGeometries(list);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      if (this.noCast.has(m)) mesh.userData.noCast = true;
      g.add(mesh);
    }
    ctx.mats.prepare(g);
    g.traverse((o) => {
      if (o.userData.noCast) o.castShadow = false;
    });
    return g;
  }
}

/** 一团（树冠、灌木、花）：球面法线，再按轴缩放；mix = 往整团的中心法线混多少（整丛一个亮顶） */
function blob(r: number, sx = 1, sy = 1, sz = 1, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.deleteAttribute('uv');
  return g.scale(sx, sy, sz);
}
/** 几团合成一丛：每团的法线 × 0.45 + 整丛椭球法线 × 0.55（池塘第四轮的灌木） */
function clump(parts: { r: number; x: number; y: number; z: number; sy?: number }[], c: THREE.Vector3, k = 0.55) {
  const list = parts.map((q) => blob(q.r, 1, q.sy ?? 0.85, 1).translate(q.x, q.y, q.z));
  const g = mergeGeometries(list.map((x) => x.toNonIndexed())) as THREE.BufferGeometry;
  const p = g.attributes.position as THREE.BufferAttribute;
  const nn = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - c.x, (p.getY(i) - c.y) * 1.4, p.getZ(i) - c.z).normalize();
    w.set(nn.getX(i), nn.getY(i), nn.getZ(i))
      .multiplyScalar(1 - k)
      .addScaledVector(v, k)
      .normalize();
    nn.setXYZ(i, w.x, w.y, w.z);
  }
  return g;
}

// ════════════════════════════ 街边小件 ════════════════════════════

/** pz-hydrant 0.5 × 0.85：红消防栓（圆身 8 边、圆顶、两侧出水口、顶上一颗螺帽、底座一圈法兰）。白天朝南一面中档红 */
const hydrant: AssetFn = (ctx) => {
  const p = new Parts();
  const red = ctx.mat('clothRed', ROUNDP);
  const cap = ctx.mat('clothRed', { ...ROUNDP, lightUp: 0.6 });
  const iron = ctx.mat('ironwork', PROP);
  p.cyl(iron, 0.22, 0.24, 0.08, 0, 0, 0, 8);
  p.cyl(red, 0.15, 0.17, 0.55, 0, 0.08, 0, 8);
  p.add(cap, new THREE.SphereGeometry(0.17, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.63, 0));
  p.cyl(iron, 0.05, 0.06, 0.1, 0, 0.78, 0, 6);
  for (const s of [-1, 1]) p.bx(red, 0.12, 0.16, 0.16, s * 0.21, 0.36, 0);
  p.bx(cap, 0.18, 0.2, 0.12, 0, 0.34, 0.17);
  return p.build(ctx, 'pz-hydrant', [iron]);
};

/** pz-mailbox 0.56 × 1.25 × 0.5：蓝邮筒（四条腿、方身、半圆顶、正面一块投信口的暗板 + 1 纹素亮唇；不画商标） */
const mailbox: AssetFn = (ctx) => {
  const p = new Parts();
  const blue = ctx.mat('clothBlue', { ...PROP, convex: 0.3 });
  const top = ctx.mat('clothBlue', { ...PROP, lightUp: 0.65, convex: 0.4 });
  const dark = ctx.mat('hwNavy', PROP);
  const lip = ctx.mat('metal', PROP);
  for (const x of [-0.2, 0.2]) for (const z of [-0.16, 0.16]) p.bx(dark, 0.08, 0.3, 0.08, x, 0, z);
  p.bx(blue, 0.52, 0.66, 0.46, 0, 0.3, 0);
  p.add(
    top,
    new THREE.CylinderGeometry(0.26, 0.26, 0.46, 10, 1, false, -Math.PI / 2, Math.PI)
      .rotateX(-Math.PI / 2)
      .translate(0, 0.96, 0),
  );
  // 投信口：朝南一块暗板（3 纹素 × 2 行）+ 上面一条亮唇
  p.face(dark, 0.32, 2 * ROW, 0, 0.82, 0.235);
  p.face(lip, 0.34, ROW * 0.6, 0, 0.82 + ROW + 0.02, 0.236);
  return p.build(ctx, 'pz-mailbox', [dark, lip]);
};

/**
 * pz-phone 0.9 × 2.3 × 0.6：公用电话亭（立柱式）：灰杆、上面一个三面围的小罩（罩里暗、话机奶白、听筒黑）、
 * 罩顶一条蓝色灯箱（白天浅蓝、夜里亮 —— 只有一个话筒图标，不写字）。
 */
const phone: AssetFn = (ctx) => {
  const p = new Parts();
  const pole = ctx.mat('metal', { ...PROP, convex: 0.3 });
  const hood = ctx.mat('metal', PROP);
  const inner = ctx.mat('ironwork', { edge: 0, convex: 0, noShadowReceive: true });
  const set = ctx.mat('clothWhite', PROP);
  const blue = ctx.mat('clothBlue', SIGN_FACE);
  const icon = ctx.mat('signPaint', SIGN_FACE);
  p.bx(pole, 0.18, 1.05, 0.18, 0, 0, -0.12);
  // 罩：两侧板、后板、顶
  p.bx(hood, 0.72, 0.9, 0.06, 0, 1.05, -0.24);
  for (const s of [-1, 1]) p.bx(hood, 0.06, 0.9, 0.48, s * 0.36, 1.05, 0);
  p.face(inner, 0.66, 0.84, 0, 1.5, -0.2);
  p.bx(set, 0.32, 0.44, 0.12, 0, 1.3, -0.15);
  p.bx(inner, 0.08, 0.3, 0.08, 0.12, 1.38, -0.06);
  // 灯箱：罩顶一条 0.78 × 0.3，正面一个话筒图标（三块：两头 + 中间的弯）
  p.bx(blue, 0.78, 0.3, 0.52, 0, 1.95, 0);
  p.face(icon, 0.09, ROW, -0.1, 2.04, 0.265);
  p.face(icon, 0.09, ROW, 0.1, 2.04, 0.265);
  p.face(icon, 0.29, ROW * 0.7, 0, 2.04 + ROW * 0.75, 0.265);
  const g = p.build(ctx, 'pz-phone', [inner, set, icon]);
  const blueN = ctx.mat('clothBlue', { ...SIGN_FACE, emissive: 0x203a70 });
  nightSwap(g, [[blue, blueN]]);
  return g;
};

/**
 * pz-menu 1.0 × 1.7 × 0.3：餐馆的户外菜单牌：两根木柱、一块黑板（四行粉笔块：第一行珊瑚色的标题块、下面几行白的 + 右边一列价钱数字块）、
 * 顶上一条珊瑚色的小檐。不写字。
 */
const menu: AssetFn = (ctx) => {
  const p = new Parts();
  const wood = ctx.mat('wood');
  const slate = ctx.mat('slate', { lightUp: 0.45, bands: [-0.3, 0.35], noShadowReceive: true });
  const chalk = ctx.mat('signPaint', { noShadowReceive: true });
  const coral = ctx.mat('dinerCoral', SIGN_FACE);
  const rnd = ctx.rng('pz-menu');
  for (const s of [-1, 1]) p.bx(wood, 0.12, 1.55, 0.12, s * 0.46, 0, 0);
  p.bx(wood, 1.0, 0.86, 0.08, 0, 0.62, 0);
  p.face(slate, 0.84, 0.72, 0, 0.62 + 0.43, 0.045);
  p.bx(coral, 1.12, 0.14, 0.26, 0, 1.52, 0);
  const top = 0.62 + 0.72;
  for (let r = 0; r < 4; r++) {
    const y = top - ROW * (1 + r * 2);
    const m = r === 0 ? coral : chalk;
    let x = -0.36;
    while (x < 0.12) {
      const len = T * (2 + Math.floor(rnd() * 3));
      p.face(m, len, ROW, x + len / 2, y, 0.05);
      x += len + T;
    }
    if (r > 0) p.face(chalk, T * 2, ROW, 0.3, y, 0.05);
  }
  return p.build(ctx, 'pz-menu', [slate, chalk, coral]);
};

/**
 * pz-bikerack 2.6 × 1.0 × 0.8：三个倒 U 形的铁架（2 纹素粗）+ 两辆自行车侧身停着（侧面朝南：两个暗的轮盘 + 彩色车架三角 + 车座、把手）。
 * v0 = 青绿 + 黄两辆，v1 = 红 + 蓝，v2 = 只有一辆（黄）。
 */
const bikerack: AssetFn = (ctx) => {
  const p = new Parts();
  const rack = ctx.mat('metal', { ...PROP, convex: 0.3 });
  const tyre = ctx.mat('ironwork', { ...PROP, lightUp: 0.2 });
  const hub = ctx.mat('metal', PROP);
  const seat = ctx.mat('ironwork', PROP);
  const v = ctx.variant % 3;
  const keys: PalKey[][] = [['clothTeal', 'flowerYellow'], ['clothRed', 'clothBlue'], ['flowerYellow']];
  for (const x of [-0.9, 0, 0.9]) {
    for (const s of [-1, 1]) p.bx(rack, 0.14, 0.82, 0.14, x + s * 0.3, 0, -0.25);
    p.bx(rack, 0.74, 0.14, 0.14, x, 0.78, -0.25);
  }
  keys[v].forEach((k, i) => {
    const frame = ctx.mat(k, PROP);
    const x = -0.45 + i * 0.9;
    const z = 0.05 + i * 0.12;
    for (const s of [-1, 1]) {
      p.add(
        tyre,
        new THREE.CylinderGeometry(0.33, 0.33, 0.08, 12).rotateX(Math.PI / 2).translate(x + s * 0.5, 0.33, z),
      );
      p.add(hub, new THREE.CylinderGeometry(0.07, 0.07, 0.1, 6).rotateX(Math.PI / 2).translate(x + s * 0.5, 0.33, z));
    }
    // 车架：下管（斜）、上管（平）、座管、后叉（平）
    p.add(
      frame,
      box(0.72, 0.1, 0.08, 0, 0, 0)
        .rotateZ(0.55)
        .translate(x + 0.08, 0.36, z + 0.01),
    );
    p.bx(frame, 0.66, 0.1, 0.08, x + 0.06, 0.62, z + 0.01);
    p.bx(frame, 0.1, 0.42, 0.08, x - 0.24, 0.3, z + 0.01);
    p.bx(frame, 0.5, 0.08, 0.08, x - 0.26, 0.3, z + 0.01);
    p.bx(seat, 0.26, 0.08, 0.14, x - 0.26, 0.76, z);
    p.bx(seat, 0.08, 0.22, 0.08, x + 0.42, 0.62, z);
    p.bx(seat, 0.1, 0.08, 0.4, x + 0.42, 0.84, z);
  });
  return p.build(ctx, 'pz-bikerack', [rack, tyre, hub, seat]);
};

/**
 * pz-pot 1.6 × (0.6 + 植物) × 1.6：街角大花盆（圆的土坯色混凝土盆，上沿一圈压顶亮边，盆里碎石）+ 植物（变体）：
 * v0 桶形仙人掌一大两小、v1 龙舌兰、v2 九重葛（玫红花团 + 绿叶团）、v3 一棵小棕榈。
 */
const plantIn = (p: Parts, ctx: AssetCtx, v: number, y: number, s = 1) => {
  const rnd = ctx.rng(`pz-plant:${v}`);
  if (v === 0) {
    const cactus = ctx.mat('cactus', {
      lightUp: 0.35,
      convex: 0.3,
      elem: { kind: 'planks', p: [1, 0, 0, 0.14], seam: 1, hi: 0.4 },
    });
    const flower = ctx.mat('flowerYellow', PROP);
    for (const [x, z, r] of [
      [0, 0, 0.36],
      [0.38, 0.22, 0.22],
      [-0.34, 0.26, 0.2],
    ] as const) {
      p.add(cactus, blob(r * s, 1, 1.15, 1, 1).translate(x * s, y + r * s, z * s));
      p.bx(flower, 0.12 * s, 0.08, 0.12 * s, x * s, y + r * s * 2.1, z * s);
    }
  } else if (v === 1) {
    const ag = ctx.mat('silverBlue', { lightUp: 0.35, convex: 0.25 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rnd() * 0.3;
      const tilt = 0.5 + (k % 3) * 0.2;
      p.add(
        ag,
        new THREE.ConeGeometry(0.1 * s, 0.95 * s, 4)
          .translate(0, 0.47 * s, 0)
          .rotateX(tilt)
          .rotateY(a)
          .translate(0, y, 0),
      );
    }
    p.add(ag, new THREE.ConeGeometry(0.12 * s, 0.9 * s, 4).translate(0, y + 0.45 * s, 0));
  } else if (v === 2) {
    const leaf = ctx.mat('sage', { lightUp: 0.4, elem: { kind: 'leaves', size: [2.1, 2.1], hi: 0.15 } });
    const pink = ctx.mat('flowerPurple', {
      lightUp: 0.45,
      elem: { kind: 'leaves', size: [1.8, 1.8], hi: 0.2, seed: 3 },
    });
    const c = new THREE.Vector3(0, y + 0.5 * s, 0);
    p.add(
      leaf,
      clump(
        [
          { r: 0.5 * s, x: -0.2 * s, y: y + 0.45 * s, z: -0.1 * s },
          { r: 0.42 * s, x: 0.3 * s, y: y + 0.4 * s, z: 0.05 * s },
        ],
        c,
      ),
    );
    p.add(
      pink,
      clump(
        [
          { r: 0.36 * s, x: 0.05 * s, y: y + 0.78 * s, z: 0.15 * s },
          { r: 0.3 * s, x: -0.4 * s, y: y + 0.62 * s, z: 0.22 * s },
          { r: 0.26 * s, x: 0.42 * s, y: y + 0.66 * s, z: 0.18 * s },
        ],
        c,
      ),
    );
  } else {
    const trunk = ctx.mat('palmTrunk', { convex: 0.2 });
    const palm = ctx.mat('palm', { lightUp: 0.35 });
    const H = 2.6 * s;
    p.cyl(trunk, 0.13 * s, 0.2 * s, H, 0, y, 0, 6);
    p.add(palm, blob(0.3 * s, 1, 0.7, 1, 0).translate(0, y + H, 0));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      p.add(
        palm,
        new THREE.BoxGeometry(0.32 * s, 0.07, 1.4 * s)
          .translate(0, 0, 0.65 * s)
          .rotateX(k % 2 ? 0.55 : 0.3)
          .rotateY(a)
          .translate(0, y + H, 0),
      );
    }
  }
};

const pot: AssetFn = (ctx) => {
  const p = new Parts();
  const body = ctx.mat('adobe', { ...PROP, convex: 0.25 });
  const rim = ctx.mat('cap', { lightUp: 0.3 });
  const gravel = ctx.mat('gravelYard', { elem: TOWN_EL.gravelYard });
  p.cyl(body, 0.8, 0.66, 0.56, 0, 0, 0, 12);
  p.add(rim, new THREE.CylinderGeometry(0.86, 0.86, 0.1, 12).translate(0, 0.61, 0));
  p.add(gravel, new THREE.CircleGeometry(0.74, 12).rotateX(-Math.PI / 2).translate(0, 0.665, 0));
  plantIn(p, ctx, ctx.variant % 4, 0.66);
  return p.build(ctx, 'pz-pot');
};

/**
 * pz-planter：方花池（萨尔蒂略陶砖地上的土坯矮边 0.35 高、上沿 1 纹素亮压顶、里面碎石 + 植物）。
 * v0..3 = 1.6 × 1.6（植物同 pz-pot 的 v0..3），v4 = 2 × 4 长条（一棵小棕榈 + 两丛九重葛、一棵龙舌兰）。
 */
const planter: AssetFn = (ctx) => {
  const p = new Parts();
  const v = ctx.variant % 5;
  const W = v === 4 ? 4 : 1.6;
  const D = v === 4 ? 2 : 1.6;
  const edge = ctx.mat('adobe', { lightUp: 0.2 });
  const cap = ctx.mat('cap');
  const gravel = ctx.mat('gravelYard', { elem: TOWN_EL.gravelYard });
  const H = 0.35;
  const t = 0.18;
  for (const s of [-1, 1]) {
    p.bx(edge, W, H, t, 0, 0, s * (D / 2 - t / 2));
    p.bx(edge, t, H, D - 2 * t, s * (W / 2 - t / 2), 0, 0);
    p.bx(cap, W + 0.04, 0.06, t + 0.04, 0, H, s * (D / 2 - t / 2));
    p.bx(cap, t + 0.04, 0.06, D - 2 * t, s * (W / 2 - t / 2), H, 0);
  }
  p.floor(gravel, W - 2 * t, D - 2 * t, 0, H - 0.08, 0);
  if (v < 4) plantIn(p, ctx, v, H - 0.08);
  else {
    const sub = (vv: number, x: number, z: number, s: number) => {
      const q = new Parts();
      plantIn(q, ctx, vv, H - 0.08, s);
      for (const [g, m] of q.list) p.add(m, g.translate(x, 0, z));
    };
    sub(3, -1.0, -0.2, 1.1);
    sub(2, 0.5, 0.1, 0.8);
    sub(1, 1.4, 0.3, 0.7);
  }
  return p.build(ctx, 'pz-planter');
};

/**
 * pz-shelter 3.6 × 2.5 × 1.5：公交站棚。开口朝北（本地 −z，对着主街），朝南的背板是画面上的一条暗带（三格磨砂玻璃 silverBlue、
 * 格间 2 纹素的立框），顶是一块彩色的檐（珊瑚，压顶上沿 1 纹素亮），棚里一条长凳。东头一根站牌（蓝方牌 + 白的公交车图标，不写字）。
 */
const shelter: AssetFn = (ctx) => {
  const p = new Parts();
  const L = 3.6;
  const D = 1.5;
  const H = 2.4;
  const frame = ctx.mat('metal', { convex: 0.3 });
  const panel = ctx.mat('silverBlue', { lightUp: 0.25, bands: [-0.2, 0.5], noShadowReceive: true });
  const roof = ctx.mat('dinerCoral', { lightUp: 0.2 });
  const rim = ctx.mat('cap');
  const bench = ctx.mat('wood', PROP);
  const blue = ctx.mat('clothBlue', SIGN_FACE);
  const icon = ctx.mat('signPaint', SIGN_FACE);
  // 柱：四角
  for (const x of [-L / 2 + 0.08, L / 2 - 0.08])
    for (const z of [-D / 2 + 0.08, D / 2 - 0.08]) p.bx(frame, 0.14, H, 0.14, x, 0, z);
  // 背板（南边，z = +D/2 −0.1）：三格
  const n = 3;
  const cw = (L - 0.16) / n;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.08 + cw * (i + 0.5);
    p.bx(panel, cw - 0.14, 1.7, 0.05, x, 0.35, D / 2 - 0.12);
    p.bx(frame, 0.14, 1.9, 0.08, -L / 2 + 0.08 + cw * i, 0.25, D / 2 - 0.12);
  }
  p.bx(frame, L, 0.12, 0.08, 0, 0.25, D / 2 - 0.12);
  p.bx(frame, L, 0.12, 0.08, 0, 2.05, D / 2 - 0.12);
  // 侧板（西头一格玻璃）
  p.bx(panel, 0.05, 1.7, D - 0.4, -L / 2 + 0.08, 0.35, 0.05);
  // 檐：往北多伸 0.3，往南齐背板；压顶一圈
  p.bx(roof, L + 0.3, 0.2, D + 0.4, 0, H, -0.15);
  p.bx(rim, L + 0.34, 0.06, D + 0.44, 0, H + 0.2, -0.15);
  // 长凳（贴背板）
  p.bx(bench, L - 0.6, 0.08, 0.4, 0, 0.45, D / 2 - 0.4);
  for (const x of [-1.2, 1.2]) p.bx(frame, 0.1, 0.45, 0.32, x, 0, D / 2 - 0.4);
  // 站牌：东头柱外 0.4 米一根杆 + 蓝方牌（朝南）+ 白的公交车图标（车身、两个窗格的暗缝、两个轮）
  const sx = L / 2 + 0.45;
  p.bx(frame, 0.12, 2.6, 0.12, sx, 0, 0.2);
  p.bx(blue, 0.56, 0.56, 0.06, sx, 2.05, 0.2);
  p.face(icon, 0.36, 3 * ROW * 0.55, sx, 2.36, 0.235);
  p.face(blue, 0.09, ROW * 0.5, sx - 0.08, 2.4, 0.236);
  p.face(blue, 0.09, ROW * 0.5, sx + 0.08, 2.4, 0.236);
  for (const s of [-1, 1]) p.face(icon, 0.09, ROW * 0.6, sx + s * 0.11, 2.15, 0.235);
  return p.build(ctx, 'pz-shelter', [panel, bench, icon, blue]);
};

// ════════════════════════════ 后院、装卸 ════════════════════════════

/** pz-dumpster 1.9 × 1.3 × 1.2：深绿的大垃圾箱（箱身、两片黑盖往后翘、两侧叉车口、正面一条暗的加强筋） */
const dumpster: AssetFn = (ctx) => {
  const p = new Parts();
  const green = ctx.mat('cactus', {
    ramp: [0x4f9a6a, 0x2e6e5a, 0x1f3e52],
    lightUp: 0.25,
    convex: 0.25,
    elem: { kind: 'paint', size: [10, 6] },
  });
  const lid = ctx.mat('ironwork', { lightUp: 0.3 });
  const rib = ctx.mat('cactus', { ramp: [0x3d7e58, 0x245a4c, 0x182f44], noShadowReceive: true, lightUp: 0.2 });
  p.bx(green, 1.9, 1.05, 1.15, 0, 0.12, 0);
  for (const x of [-0.75, 0.75]) p.bx(lid, 0.2, 0.12, 1.0, x, 0, 0);
  for (const s of [-1, 1])
    p.add(
      lid,
      box(0.92, 0.07, 1.2, 0, 0, 0)
        .rotateX(-0.12)
        .translate(s * 0.47, 1.22, 0.02),
    );
  p.face(rib, 1.8, ROW, 0, 0.55, 0.58);
  for (const s of [-1, 1]) p.bx(lid, 0.4, 0.22, 0.04, s * 0.55, 0.85, 0.58);
  return p.build(ctx, 'pz-dumpster', [rib]);
};

/** pz-crates 1.2 × 1.1 × 0.8：叠起来的牛奶箱（三摞，2～3 层；红、蓝、黄；正面每箱一格暗的格子口） */
const crates: AssetFn = (ctx) => {
  const p = new Parts();
  const cols: PalKey[] = ['clothRed', 'clothBlue', 'flowerYellow'];
  const hole = ctx.mat('ironwork', { edge: 0, convex: 0, noShadowReceive: true });
  const S = 0.36;
  const stacks = [
    [-0.4, 0, 3],
    [0, 0.05, 2],
    [0.4, -0.08, 3],
  ] as const;
  stacks.forEach(([x, z, n], i) => {
    for (let k = 0; k < n; k++) {
      const m = ctx.mat(cols[(i + k) % 3], PROP);
      p.bx(m, S, S - 0.02, S, x, k * S, z);
      p.face(hole, S - 0.12, S - 0.14, x, k * S + S / 2, z + S / 2 + 0.005);
    }
  });
  return p.build(ctx, 'pz-crates', [hole]);
};

/**
 * pz-dock 12 × 4.2 × 4.6：报社的发报台（送报车倒进来装报纸）：1.2 米高的水泥台子（朝南的立面 = 一条暗带，上面一排黑的防撞块），
 * 台子西头四级台阶；台子北边一面 tilt-up 后墙，三根柱撑着往南出挑的金属单坡顶（南低北高）。原点 = 台子南沿的中点。
 */
const dock: AssetFn = (ctx) => {
  const p = new Parts();
  const L = 12;
  const D = 3.4;
  const H = 1.2;
  const deck = ctx.mat('campusConcrete', { elem: TOWN_EL.campusConcrete });
  const cap = ctx.mat('cap');
  const wall = ctx.mat('tiltup', { elem: TOWN_EL.tiltup });
  const bump = ctx.mat('ironwork', PROP);
  const post = ctx.mat('metal', { convex: 0.3 });
  const roof = ctx.mat('roofMetal', { elem: TOWN_EL.roofMetal });
  // 台子（南沿 z 0 → 北 −D）+ 南沿一纹素亮压顶
  p.bx(deck, L, H, D, 0, 0, -D / 2);
  p.bx(cap, L + 0.04, 0.08, 0.2, 0, H, -0.1);
  for (let i = 0; i < 5; i++) p.bx(bump, 0.3, 0.42, 0.12, -L / 2 + 1.6 + i * 2.2, 0.5, 0.04);
  // 西头台阶
  for (let s = 0; s < 4; s++) p.bx(deck, 0.32, H * ((s + 1) / 5), 1.4, -L / 2 - 1.12 + s * 0.3, 0, -0.9);
  // 后墙
  p.bx(wall, L, 4.0, 0.3, 0, 0, -D - 0.15);
  // 单坡顶 + 三根柱（南沿 3.3，北沿 4.0）
  for (const x of [-L / 2 + 0.3, 0, L / 2 - 0.3]) p.bx(post, 0.18, 3.3 - H, 0.18, x, H, -0.25);
  const rg = box(L + 0.4, 0.12, D + 1.0, 0, 0, 0)
    .rotateX(-Math.atan2(0.7, D + 1.0))
    .translate(0, 3.3 + 0.35, -D / 2 + 0.25);
  p.add(roof, rg);
  return p.build(ctx, 'pz-dock', [bump]);
};

// ════════════════════════════ 体育店的店前道具 ════════════════════════════

/** 球拍：拍框（扁的 12 边环，面朝南）+ 拍面（浅的平面）+ 拍颈 + 拍柄；底在 y，拍头中心 y + 0.62 */
function racquet(
  p: Parts,
  frame: THREE.Material,
  face: THREE.Material,
  grip: THREE.Material,
  x: number,
  y: number,
  z: number,
  s = 1,
) {
  const R0 = 0.17 * s;
  p.add(frame, new THREE.TorusGeometry(R0, 0.035 * s, 3, 12).scale(1, 1.25, 1).translate(x, y + 0.62 * s, z));
  p.add(face, new THREE.CircleGeometry(R0 - 0.02, 12).scale(1, 1.25, 1).translate(x, y + 0.62 * s, z));
  p.bx(frame, 0.07 * s, 0.16 * s, 0.05 * s, x, y + 0.32 * s, z);
  p.bx(grip, 0.08 * s, 0.32 * s, 0.07 * s, x, y, z);
}

/**
 * pz-racquet-rack 1.4 × 1.5 × 0.7：店门口的球拍展示架（木框架、横杆上挂三支彩色球拍，拍面朝南）+ 一桶球（铁丝桶 + 顶上一层黄球）。
 */
const racquetRack: AssetFn = (ctx) => {
  const p = new Parts();
  const wood = ctx.mat('wood');
  const face = ctx.mat('clothWhite', { ...PROP, lightUp: 0.3 });
  const grip = ctx.mat('ironwork', PROP);
  const bucket = ctx.mat('metal', ROUNDP);
  const ball = ctx.mat('ball', { lightUp: 0.4, convex: 0.3, noShadowReceive: true });
  for (const s of [-1, 1]) p.bx(wood, 0.1, 1.5, 0.5, s * 0.6, 0, -0.1);
  p.bx(wood, 1.3, 0.1, 0.1, 0, 1.38, -0.1);
  p.bx(wood, 1.3, 0.08, 0.45, 0, 0.12, -0.1);
  (['clothRed', 'flowerYellow', 'clothTeal'] as PalKey[]).forEach((k, i) => {
    racquet(p, ctx.mat(k, PROP), face, grip, -0.38 + i * 0.38, 0.38, 0.0);
  });
  // 一桶球（架子东边）
  p.cyl(bucket, 0.22, 0.19, 0.5, 0.95, 0, 0.12, 8);
  for (const [dx, dz] of [
    [-0.08, -0.05],
    [0.08, 0.02],
    [0, 0.1],
    [-0.06, 0.1],
    [0.1, -0.08],
  ] as const)
    p.add(ball, blob(0.07, 1, 1, 1, 0).translate(0.95 + dx, 0.54, 0.12 + dz));
  return p.build(ctx, 'pz-racquet-rack', [face, grip, ball]);
};

/** pz-racquet-sign 1.1 × 2.4 × 0.5：球拍形的立地招牌（一支大球拍竖着插在水泥墩上：红框、黄拍面 + 拍面上两条亮的线，图标，不写字） */
const racquetSign: AssetFn = (ctx) => {
  const p = new Parts();
  const base = ctx.mat('concrete');
  const frame = ctx.mat('clothRed', SIGN_FACE);
  const face = ctx.mat('ball', SIGN_FACE);
  const grip = ctx.mat('ironwork', PROP);
  const line = ctx.mat('clothWhite', SIGN_FACE);
  p.bx(base, 0.6, 0.25, 0.4, 0, 0, 0);
  racquet(p, frame, face, grip, 0, 0.25, 0, 2.6);
  // 拍面上一个十字的"弦"（两条 1 纹素的亮线）
  p.face(line, 0.05, 0.9, 0, 0.25 + 0.62 * 2.6, 0.04);
  p.face(line, 0.7, ROW * 0.5, 0, 0.25 + 0.62 * 2.6, 0.041);
  return p.build(ctx, 'pz-racquet-sign', [line, grip]);
};

// ════════════════════════════ 停车场、门 ════════════════════════════

/**
 * pz-car 2.0 × 1.5 × 4.8（本地 +z = 车头）：六十年代的长车身（同 town.ts 的车），v0..5 换车身色（carRed / 海军 / 薄荷 / 金 / 奶白 / 银）；
 * 车顶（敞篷合上的软顶）同色亮一级，前后各一条 3 纹素的挡风玻璃。
 */
const CAR_COLS: PalKey[] = ['carRed', 'hwNavy', 'clothTeal', 'flowerYellow', 'canvas', 'silverBlue'];
const car: AssetFn = (ctx) => {
  const p = new Parts();
  const k = CAR_COLS[ctx.variant % CAR_COLS.length];
  const body = ctx.mat(k, { lightUp: 0.15 });
  const roof = ctx.mat(k, { lightUp: 0.55, bands: [-0.4, 0.3] });
  const trim = ctx.mat('stucco', PROP);
  const glass = ctx.mat('silverBlue', { ...PROP, lightUp: 0.2 });
  const tyre = ctx.mat('ironwork');
  p.bx(tyre, 1.84, 0.3, 3.9, 0, 0, 0);
  p.bx(body, 2.0, 0.7, 4.8, 0, 0.28, 0);
  for (const s of [-1, 1]) p.bx(trim, 0.14, 0.1, 4.9, s * 0.96, 0.84, 0);
  p.bx(roof, 1.7, 0.42, 2.0, 0, 0.98, -0.35);
  p.add(glass, box(1.62, 0.36, 0.12, 0, 0, 0).rotateX(-0.6).translate(0, 1.02, 0.78));
  p.add(glass, box(1.62, 0.3, 0.12, 0, 0, 0).rotateX(0.6).translate(0, 1.02, -1.42));
  return p.build(ctx, 'pz-car', [trim, glass]);
};

/** pz-gate 3.8 × 2.0 × 0.7：两根毛石门柱（desertStone、压顶 1 纹素亮），门洞 2.6 米（后街尽头去校队球场西北门的小门） */
const gate: AssetFn = (ctx) => {
  const p = new Parts();
  const stone = ctx.mat('desertStone', { elem: TOWN_EL.desertStone });
  const cap = ctx.mat('cap');
  const lamp = ctx.mat('signPaint', PROP);
  for (const s of [-1, 1]) {
    p.bx(stone, 0.6, 1.8, 0.6, s * 1.6, 0, 0);
    p.bx(cap, 0.74, 0.12, 0.74, s * 1.6, 1.8, 0);
    p.bx(lamp, 0.26, 0.26, 0.26, s * 1.6, 1.92, 0);
  }
  const g = p.build(ctx, 'pz-gate', [lamp]);
  nightSwap(g, [[lamp, ctx.mat('signPaint', { ...PROP, emissive: 0x6a5a30 })]]);
  return g;
};

/** pz-pennant 1.6 × 4.6 × 0.2：一面队旗（灰杆 2 纹素、杆头一颗金球；酒红三角旗 + 一条金边），校队的颜色，不写字 */
const pennant: AssetFn = (ctx) => {
  const p = new Parts();
  const pole = ctx.mat('metal', { convex: 0.3 });
  const gold = ctx.mat('schoolGold', PROP);
  const maroon = ctx.mat('schoolMaroon', { ...SIGN_FACE, side: THREE.DoubleSide });
  p.bx(pole, 0.14, 4.4, 0.14, 0, 0, 0);
  p.add(gold, blob(0.12, 1, 1, 1, 0).translate(0, 4.5, 0));
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0.07, 4.25, 0, 0.07, 3.35, 0, 1.6, 3.85, 0], 3));
  tri.computeVertexNormals();
  p.add(maroon, tri);
  p.add(gold, box(0.16, 0.9, 0.04, 0.15, 3.35, 0.0));
  return p.build(ctx, 'pz-pennant', [maroon, gold]);
};

/**
 * pz-tree 5.4 × 5.6 × 5.4：一棵大遮阴树（牧豆树：短粗的分叉干 + 五团叶，球面法线 + 整丛椭球法线 → 亮顶、中腰、青暗底；叶团元素）。
 * 投影一大块（树影是画面里的暗块，长椅放在它底下）。
 */
const tree: AssetFn = (ctx) => {
  const p = new Parts();
  const bark = ctx.mat('branch', { convex: 0.2 });
  const leaf = ctx.mat('olive', {
    lightUp: 0.55,
    bands: [-0.05, 0.3],
    elem: { kind: 'leaves', size: [2.4, 2.4], hi: 0.15 },
  });
  p.add(bark, new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6).translate(0, 1.1, 0));
  for (const [a, l] of [
    [0.5, 1.6],
    [-0.6, 1.5],
    [2.4, 1.3],
  ] as const)
    p.add(
      bark,
      new THREE.CylinderGeometry(0.1, 0.16, l, 5)
        .translate(0, l / 2, 0)
        .rotateZ(0.6)
        .rotateY(a)
        .translate(0, 2.0, 0),
    );
  const c = new THREE.Vector3(0, 3.6, 0);
  p.add(
    leaf,
    clump(
      [
        { r: 1.5, x: 0, y: 4.1, z: 0 },
        { r: 1.2, x: 1.4, y: 3.5, z: 0.4 },
        { r: 1.25, x: -1.4, y: 3.6, z: 0.2 },
        { r: 1.1, x: 0.4, y: 3.4, z: 1.3 },
        { r: 1.1, x: -0.3, y: 3.5, z: -1.3 },
      ],
      c,
    ),
  );
  return p.build(ctx, 'pz-tree');
};

/** 夜里换材质：daylight 找 userData.night.setOn（只换白天那份；锁着压暗的不亮） */
function nightSwap(g: THREE.Object3D, pairs: [THREE.Material, THREE.Material][]): void {
  const meshesOf = (m: THREE.Material) => {
    const out: THREE.Mesh[] = [];
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === m) out.push(o as THREE.Mesh);
    });
    return out;
  };
  const list = pairs.map(([day, night]) => ({ day, night, ms: meshesOf(day) }));
  // 烘进一大块的时候（detail/plaza.ts 的 Bake）读这张表，自己换
  g.userData.nightPairs = pairs;
  g.userData.night = {
    setOn(on: boolean) {
      for (const { day, night, ms } of list)
        for (const m of ms) if (m.material === day || m.material === night) m.material = on ? night : day;
    },
  };
}

/** pz-bench 1.9 × 0.85 × 0.6：街边长椅（两块木座板 + 靠背在北边，铁脚；面朝 +z），材质跟别的小件共用（省绘制） */
const bench: AssetFn = (ctx) => {
  const p = new Parts();
  const wood = ctx.mat('wood', PROP);
  const iron = ctx.mat('ironwork', PROP);
  p.bx(wood, 1.9, 0.08, 0.22, 0, 0.42, 0.1);
  p.bx(wood, 1.9, 0.08, 0.22, 0, 0.42, -0.14);
  p.bx(wood, 1.9, 0.3, 0.08, 0, 0.58, -0.27);
  for (const x of [-0.78, 0.78]) {
    p.bx(iron, 0.1, 0.42, 0.46, x, 0, -0.02);
    p.bx(iron, 0.1, 0.4, 0.08, x, 0.46, -0.27);
  }
  return p.build(ctx, 'pz-bench', [iron]);
};

/** pz-bin 0.6 × 0.95：街边垃圾桶（深色的桶身八边 + 一圈亮的桶沿 + 圆顶盖） */
const bin: AssetFn = (ctx) => {
  const p = new Parts();
  const body = ctx.mat('ironwork', ROUNDP);
  const rim = ctx.mat('metal', PROP);
  p.cyl(body, 0.28, 0.25, 0.82, 0, 0, 0, 8);
  p.cyl(rim, 0.3, 0.3, 0.06, 0, 0.82, 0, 8);
  p.add(
    rim,
    new THREE.SphereGeometry(0.26, 8, 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).translate(0, 0.88, 0),
  );
  return p.build(ctx, 'pz-bin', [rim]);
};

export const ASSETS: Record<string, AssetFn> = {
  'pz-hydrant': hydrant,
  'pz-mailbox': mailbox,
  'pz-phone': phone,
  'pz-menu': menu,
  'pz-bikerack': bikerack,
  'pz-pot': pot,
  'pz-planter': planter,
  'pz-shelter': shelter,
  'pz-dumpster': dumpster,
  'pz-crates': crates,
  'pz-dock': dock,
  'pz-racquet-rack': racquetRack,
  'pz-racquet-sign': racquetSign,
  'pz-car': car,
  'pz-gate': gate,
  'pz-pennant': pennant,
  'pz-tree': tree,
  'pz-bench': bench,
  'pz-bin': bin,
};
