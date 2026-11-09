// 场景里的东西：树、灌木、房子、栈桥、钓鱼的人、石头、芦苇、睡莲。
// 同材质的几何体合并成一个网格（draw call 少）；风摆用顶点属性 aSway（0..1）。
// 树冠：一簇圆球，每个球的法线从球心往外（"球面法线"）→ 每团都有清楚的亮/中/暗三档。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BOBBER,
  BUCKET,
  BUSHES,
  CRATE,
  DOCK,
  FISHER,
  H,
  HOUSE,
  JUNCTION_STUB,
  LAMP_POST,
  LILIES,
  PEBBLES,
  REEDS,
  ROCK,
  ROD_TIP,
  TREES,
} from './layout';
import type { Mats, Shared, Tones } from './ramp';
import type { Palette } from './season';

type Rnd = () => number;

/** 统一属性：position, normal, uv, aSway */
function norm(g: THREE.BufferGeometry, sway = 0): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes))
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'aPad') out.deleteAttribute(k);
  const n = out.getAttribute('position').count;
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!out.getAttribute('aSway'))
    out.setAttribute('aSway', new THREE.Float32BufferAttribute(new Float32Array(n).fill(sway), 1));
  return out;
}

/** 圆团：扰动过的二十面体，法线 = 从团心指向顶点（不是面法线），所以光照是一整团的渐变 */
function blob(r: number, rnd: Rnd, detail = 1, squash = 0.85, sway = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const v = new THREE.Vector3();
  // 同一位置的顶点扰动一致（非索引几何体里同一顶点出现多次）
  const jit = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = jit.get(key);
    if (k === undefined) {
      k = 1 + (rnd() - 0.5) * 0.16;
      jit.set(key, k);
    }
    const n = v.clone().normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
    p.setXYZ(i, v.x * k, v.y * k * squash, v.z * k);
  }
  return norm(g, sway);
}

/** 有棱角的石头：扰动过的低细分二十面体，面法线 */
function facet(r: number, rnd: Rnd, squash = 0.95): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  const jit = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = jit.get(key);
    if (k === undefined) {
      k = 1 + (rnd() - 0.5) * 0.22;
      jit.set(key, k);
    }
    p.setXYZ(i, v.x * k, Math.max(v.y * k * squash, -r * 0.45), v.z * k);
  }
  g.computeVertexNormals();
  return norm(g);
}

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry {
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function setSway(g: THREE.BufferGeometry, base: number, height: number, amp = 1) {
  const p = g.getAttribute('position');
  const s = g.getAttribute('aSway');
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, (p.getY(i) - base) / height);
    s.setX(i, t * t * amp);
  }
}

class Bucket {
  private m = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, g: THREE.BufferGeometry) {
    if (!this.m.has(mat)) this.m.set(mat, []);
    this.m.get(mat)!.push(norm(g));
  }
  build(root: THREE.Object3D) {
    for (const [mat, gs] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(gs), mat);
      root.add(mesh);
    }
  }
}

export interface Props {
  root: THREE.Group;
  /** 不进阴影/描边的 1 纹素线（钓鱼线、鱼竿） */
  lines: THREE.Object3D[];
  /** 水面泡沫要绕开的东西（石头、桩） */
  foam: { x: number; z: number; r: number }[];
  update(t: number): void;
}

export function buildProps(
  mats: Mats,
  pal: Palette,
  rng: (s: string) => () => number,
  season: string,
  shared: Shared,
): Props {
  const root = new THREE.Group();
  const B = new Bucket();
  const foam: Props['foam'] = [];

  const trunk = mats.get('trunk', { ramp: pal.trunk, edge: 0.15, snowT: 0.8 });
  const roots = mats.get('roots', { ramp: [0x3a2a3a, 0x4a3038, 0x6a4038], edge: 0.5, light: [0, 0.6, 1] });
  const collar = mats.get('collar', { ramp: [0x4a3e51, 0x5a4a5a, 0x6a5666], edge: 0.1 });
  const treeMats = pal.trees.map((r, i) =>
    mats.get(`tree${i}`, {
      ramp: r,
      kind: 'foliage',
      edge: 0.25,
      sway: 0.05,
      bands: [0.05, 0.56],
      lightUp: 0.4,
      noise: 0.4,
    }),
  );
  // 灌木（参考图逐丛量明暗：顶上亮档 + 一圈往下挂的短草须，中腰中档，下三分之一暗档，底沿更暗，地上一圈青色团影）
  const bushMats = pal.bush.map((r, i) =>
    mats.get(`bush${i}`, {
      ramp: r,
      kind: 'foliage',
      edge: 0.25,
      sway: 0.03,
      bands: pal.bushBands?.[i] ?? [0.55, 0.8],
      lightUp: 0.5,
      specks: true,
      snowT: 0.32,
      noise: 0.45,
      bush: true,
      extra: [pal.bushRim[i % pal.bushRim.length], 0, 0],
    }),
  );
  // 灌木脚下的团影：地面材质固定在暗档（阴影草地那套颜色和草叶），比灌木大一圈、往南（画面下方）挪一点
  const bushShade = mats.get('bushShade', {
    ramp: pal.grass,
    alt: pal.grassAlt,
    kind: 'ground',
    edge: 0,
    bands: [9, 9],
    noShadow: true,
  });

  // —— 树 ——
  const rt = rng('trees');
  for (const t of TREES) {
    const [x, z] = t.at;
    const bare = rt() < pal.bareTrees;
    const mat = treeMats[Math.floor(rt() * treeMats.length)];
    const th = t.trunk * 1.6 + (bare ? t.r * 0.9 : t.r * 0.5);
    const tg = new THREE.CylinderGeometry(0.24, 0.3, th, 7);
    tg.translate(x, t.h + th / 2, z);
    B.add(trunk, tg);
    // 树干中间一道浅色的箍（参考图树干上那条横线）
    if (!bare) {
      const cg = new THREE.CylinderGeometry(0.31, 0.31, 0.07, 7);
      cg.translate(x, t.h + t.trunk * 0.7, z);
      B.add(collar, cg);
    }
    // 树根：左右两个棕色小脚（参考图每棵树脚下都有）
    for (const sx of [-1, 1]) {
      const rg = new THREE.BoxGeometry(0.26, 0.16, 0.24);
      rg.translate(x + sx * 0.3, t.h + 0.08, z + 0.1);
      B.add(roots, rg);
    }
    if (bare) {
      // 冬天光秃秃的枝杈
      const nb = 4 + Math.floor(rt() * 3);
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * Math.PI * 2 + rt();
        const len = t.r * (0.7 + rt() * 0.5);
        const bg = new THREE.CylinderGeometry(0.07, 0.14, len, 5);
        bg.translate(0, len / 2, 0);
        bg.rotateZ(0.55 + rt() * 0.35);
        bg.rotateY(a);
        bg.translate(x, t.h + t.trunk * (0.75 + rt() * 0.4), z);
        B.add(trunk, bg);
      }
      continue;
    }
    // 树冠：几大团（"菜花"），每团自己有清楚的亮顶和暗底
    const cy = t.h + t.trunk * 1.6 + t.r * 0.62;
    const parts: THREE.BufferGeometry[] = [];
    parts.push(place(blob(t.r * 0.7, rt), x, cy, z - t.r * 0.1));
    const ring = 4;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rt() * 0.8 + 0.4;
      const rr = t.r * (0.5 + rt() * 0.12);
      parts.push(
        place(
          blob(rr, rt),
          x + Math.cos(a) * t.r * 0.62,
          cy - t.r * 0.18 + rt() * t.r * 0.2,
          z + Math.sin(a) * t.r * 0.45,
        ),
      );
    }
    parts.push(place(blob(t.r * 0.52, rt), x + (rt() - 0.5) * 0.6, cy + t.r * 0.45, z + (rt() - 0.5) * 0.5));
    parts.push(place(blob(t.r * 0.42, rt), x + (rt() - 0.5) * t.r, cy + t.r * 0.3, z + t.r * 0.35));
    for (const p of parts) {
      setSway(p, t.h, t.trunk + t.r * 1.5, 1);
      B.add(mat, p);
    }
  }

  // —— 灌木 ——
  const rb = rng('bushes');
  for (const b of BUSHES) {
    if (b.r <= 0) continue;
    const [x, z] = b.at;
    const pickV = rb(); // 原来按随机挑色阶；现在按 layout 的 v（保留这次取数，后面的形状不变）
    const mat = bushMats[(b.v ?? Math.floor(pickV * bushMats.length)) % bushMats.length];
    const n = 3 + Math.floor(rb() * 2);
    const parts: THREE.BufferGeometry[] = [];
    let sx = 0;
    let sz = 0;
    let sw = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rb();
      const rr = b.r * (0.55 + rb() * 0.2);
      const bx = x + Math.cos(a) * b.r * 0.4;
      const bz = z + Math.sin(a) * b.r * 0.35;
      parts.push(place(blob(rr, rb, 1, 0.8), bx, b.h + rr * 0.6, bz));
      sx += bx * rr;
      sz += bz * rr;
      sw += rr;
    }
    parts.push(place(blob(b.r * 0.6, rb, 1, 0.8), x, b.h + b.r * 0.85, z));
    // 整丛一个"圆顶"：每个顶点的法线 = 团自己的球面法线和整丛椭球法线各一半 → 顶上亮、中腰中档、下三分之一暗
    //（只用团法线时，下面每一团都有自己的亮顶，整丛偏亮、像一摞球）
    const cx = sx / sw;
    const cz = sz / sw;
    const cy = b.h + b.r * 0.3;
    const dn = new THREE.Vector3();
    for (const g of parts) {
      const p = g.getAttribute('position');
      const nr = g.getAttribute('normal');
      // 参考图的灌木是矮胖的圆顶（宽 : 高 ≈ 1.4 : 1）：绕重心横向拉宽 1.18、竖向压到 0.88
      for (let i = 0; i < p.count; i++)
        p.setXYZ(i, cx + (p.getX(i) - cx) * 1.18, b.h + (p.getY(i) - b.h) * 0.88, cz + (p.getZ(i) - cz) * 1.05);
      for (let i = 0; i < p.count; i++) {
        dn.set((p.getX(i) - cx) / 1.1, (p.getY(i) - cy) / 0.85, (p.getZ(i) - cz) / 1.0).normalize();
        dn.multiplyScalar(0.55).add(new THREE.Vector3(nr.getX(i), nr.getY(i), nr.getZ(i)).multiplyScalar(0.45));
        dn.normalize();
        nr.setXYZ(i, dn.x, dn.y, dn.z);
      }
      setSway(g, b.h, b.r * 1.5, 1);
      B.add(mat, g);
    }
    // 团影：比灌木宽一圈、往画面下方（南）多露 3～4 纹素，圆心跟着几团的重心
    const shade = new THREE.CircleGeometry(1, 24);
    shade.rotateX(-Math.PI / 2);
    shade.scale(b.r * 1.15 + 0.12, 1, b.r * 0.8 + 0.12);
    shade.translate(cx, b.h + 0.012, cz + b.r * 0.32);
    B.add(bushShade, shade);
  }

  // —— 石头 ——
  const rr = rng('rock');
  // 大石头：面法线（一块块的平面，参考图石头是有棱角的三档）
  const [rkx, rkz] = ROCK;
  const rockG = facet(1.2, rr);
  rockG.scale(1.1, 1, 0.9);
  place(rockG, rkx, H.water + 0.35, rkz, 0.4);
  rockG.computeBoundingBox();
  // 苔藓帽按石顶高度和石头中心画（ramp.ts KIND_ROCK）
  const rock = mats.get('rock', {
    ramp: pal.rock,
    alt: pal.moss,
    kind: 'rock',
    edge: 0.25,
    bands: [0.3, 0.72],
    plank: [rkx, rockG.boundingBox?.max.y ?? H.water + 1.5, rkz, 1.25],
    extra: pal.mossEdge,
  });
  B.add(rock, rockG);
  B.add(rock, place(facet(0.6, rr, 0.7), rkx + 1.0, H.water + 0.15, rkz + 0.5));
  foam.push({ x: rkx, z: rkz, r: 1.12 }, { x: rkx + 1.0, z: rkz + 0.5, r: 0.5 });
  const pebble = mats.get('pebble', { ramp: pal.rock, edge: 1.0 });
  for (const p of PEBBLES) {
    const g = blob(p.r, rr, 0, 0.6);
    place(g, p.at[0], p.h + p.r * 0.25, p.at[1], rr() * 3);
    B.add(pebble, g);
  }

  // —— 芦苇 ——
  const reed = mats.get('reed', { ramp: pal.reed, edge: 0.3, sway: 0.08, snow: false });
  const reedHead = mats.get('reedHead', { ramp: pal.reedHead, edge: 0.3, sway: 0.08 });
  const rd = rng('reeds');
  for (const c of REEDS) {
    for (let i = 0; i < c.n; i++) {
      const a = rd() * Math.PI * 2;
      const d = Math.sqrt(rd()) * c.r;
      const x = c.at[0] + Math.cos(a) * d;
      const z = c.at[1] + Math.sin(a) * d;
      const h = 1.1 + rd() * 0.9;
      const s = new THREE.BoxGeometry(0.08, h + 0.5, 0.08);
      s.translate(x, H.water - 0.5 + (h + 0.5) / 2, z);
      const sg = norm(s);
      foam.push({ x, z, r: 0.03 });
      setSway(sg, H.water, h, 1);
      B.add(reed, sg);
      if (rd() < 0.6) {
        const hd = new THREE.BoxGeometry(0.14, 0.34, 0.14);
        hd.translate(x, H.water + h + 0.05, z);
        const hg = norm(hd);
        setSway(hg, H.water, h, 1);
        B.add(reedHead, hg);
      }
      // 一两片斜叶
      if (rd() < 0.5) {
        const lf = new THREE.BoxGeometry(0.07, h * 0.6, 0.07);
        lf.translate(0, h * 0.3, 0);
        lf.rotateZ((rd() - 0.5) * 0.9);
        lf.translate(x + 0.1, H.water, z);
        const lg = norm(lf);
        setSway(lg, H.water, h, 1);
        B.add(reed, lg);
      }
    }
  }

  // —— 睡莲 ——
  // 参考图：叶面是中档绿 #6cba52，上沿一纹素亮边（描边提亮），下面一纹素深色的厚度；缺口很小或没有，有的是两片叠着；
  // 在阴影里的叶子是暗档。花是一朵粉色小杯（约 6 纹素宽），上亮下偏淡紫。
  const lily = mats.get('lily', {
    ramp: pal.lily,
    kind: 'lily',
    edge: 0.6,
    // 顶面要落中档：太阳仰角 71° 时朝上的面 N·L = 0.95，阈值放到 0.97
    bands: [0.0, 0.97],
    noShadow: true,
    tones: pal.lilyTones,
  });
  const flower = mats.get('flower', {
    ramp: [0x8a70b8, 0xd49ccb, 0xf4c8e0],
    edge: 0.5,
    bands: [0.2, 0.8],
    noShadow: true,
    light: [0, 1, 0.8],
  });
  const petal = mats.get('petal', {
    ramp: [0x7c6db4, 0xa890c8, 0xc8b0dc],
    edge: 0.4,
    bands: [0.2, 0.8],
    noShadow: true,
    light: [0, 1, 0.8],
  });
  const rl = rng('lilies');
  // aPad = (旁边那片叶子的圆心 − 本片圆心（顶盖 uv 单位）, 它的半径（uv）, 有没有缺口)：
  // 葫芦形的两片叶子互相知道对方，叠着的地方不画边（ramp.ts 的 LILY_OUT）。缺口 θ ∈ (0, 0.2)。
  const pad = (x: number, z: number, r: number, notch: boolean, other?: [number, number, number], dy = 0) => {
    // 有缺口的叶子也是整圆，缺口在 ramp.ts 里挖（尖是圆的）
    const g = new THREE.CylinderGeometry(r, r, 0.1, 24);
    const ry = rl() * 6;
    place(g, x, H.water + 0.03 + dy, z, ry);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 4);
    let cu = 0;
    let cv = 0;
    let cr = 0;
    if (other) {
      // 顶盖 uv − 0.5 = 0.5·(本地 z, 本地 x) / r
      const lo = new THREE.Vector3(other[0] - x, 0, other[1] - z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -ry);
      cu = (0.5 * lo.z) / r;
      cv = (0.5 * lo.x) / r;
      cr = (0.5 * other[2]) / r;
    }
    for (let i = 0; i < n; i++) a.set([cu, cv, cr, notch ? 1 : 0], i * 4);
    g.setAttribute('aPad', new THREE.Float32BufferAttribute(a, 4));
    B.add(lily, g);
  };
  for (const [i, l] of (season === 'winter' ? [] : LILIES).entries()) {
    if (pal.lilyKeep && !pal.lilyKeep.includes(i)) continue;
    const [x, z] = l.at;
    // 大叶子旁边再叠一片（参考图左边那种葫芦形）；旁边那片低一点，被大叶子盖住
    const big = l.r > 0.68;
    const cx = x - l.r * 0.75;
    const cz = z + l.r * 0.9;
    pad(x, z, l.r * 1.15, i % 3 === 1, big ? [cx, cz, l.r * 0.85] : undefined);
    if (big) pad(cx, cz, l.r * 0.85, false, [x, z, l.r * 1.15], -0.006);
    if (l.flower && season !== 'winter' && season !== 'autumn') {
      const fx = x + (rl() - 0.5) * 0.3;
      const fz = z - l.r * 0.2;
      const pg = new THREE.CylinderGeometry(0.26, 0.22, 0.1, 8);
      place(pg, fx, H.water + 0.1, fz);
      B.add(petal, pg);
      const cg = new THREE.CylinderGeometry(0.2, 0.15, 0.24, 8);
      place(cg, fx, H.water + 0.26, fz);
      B.add(flower, cg);
    }
  }

  // —— 栈桥 ——
  // 参考图：木板面是 #c38a54，每 4 纹素一行深色短划；侧面暗；四角是露出板面一点点的矮桩（顶面浅）。
  const wood = mats.get('wood', {
    ramp: pal.wood,
    alt: pal.woodAlt,
    kind: 'deck',
    edge: 0.5,
    plank: [DOCK.shoreZ, 0, 0, 0],
  });
  const post = mats.get('post', { ramp: [0x31253b, 0x4a3438, 0x8a6450], edge: 0.6, bands: [0.1, 0.6] });
  const dockGroup = new THREE.Group();
  const stub = (x: number, z: number, top = 0.14, w = 0.44) => {
    const pg = new THREE.BoxGeometry(w, 3.0 + top, w);
    pg.translate(x, DOCK.y + top - (3.0 + top) / 2, z);
    B.add(post, pg);
    foam.push({ x, z, r: w / 2 });
  };
  const deck = (from: [number, number], to: [number, number], w: number, stubs: number[][]) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const g = new THREE.BoxGeometry(w, 0.24, len);
    const m = new THREE.Mesh(norm(g), wood);
    m.position.set((from[0] + to[0]) / 2, DOCK.y - 0.12, (from[1] + to[1]) / 2);
    m.rotation.y = yaw;
    dockGroup.add(m);
    for (const [sx, sz] of stubs) {
      const pm = new THREE.Vector3(sx * (w / 2 - 0.15), 0, sz * (len / 2 - 0.15)).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        yaw,
      );
      stub(m.position.x + pm.x, m.position.z + pm.z);
    }
  };
  deck(DOCK.from, DOCK.to, DOCK.w, [
    [-1, 1],
    [1, 1],
  ]);
  deck(DOCK.side.from, DOCK.side.to, DOCK.side.w, []);
  stub(...JUNCTION_STUB);
  root.add(dockGroup);

  // —— 箱子、桶、挂灯的架子 ——
  // 木箱（参考图是条板箱）：侧面 3 行一组（亮边 + 板 + 暗缝），顶面箱沿 + 暗的箱里；uPlank.xyz = 箱子尺寸
  const CRATE_SIZE: [number, number, number] = [0.78, 0.66, 0.7];
  const crate = mats.get('crate', {
    ramp: [0xc68a57, 0xe6a666, 0xfbb866],
    alt: [0x695555, 0x5a4648, 0x78625b],
    kind: 'crate',
    edge: 0.7,
    light: [0.3, 0.8, 0.7],
    noShadow: true,
    plank: [...CRATE_SIZE, 0],
    tones: {
      bands: [
        [0xc68a57, 0xd09460, 0xb07a50],
        [0xe6a666, 0xf0b070, 0xd29458],
        [0xe6a666, 0xf2b06a, 0xd29458],
      ],
      seam: [0x695555, 0x695555, 0x695555],
      hi: [0xe6a666, 0xfbb866, 0xfbb866],
    },
  });
  const bucket = mats.get('bucket', { ramp: [0x3a4a8a, 0x4c619d, 0x6a88d0], edge: 0.9 });
  const blobs: THREE.Vector4[] = [];
  {
    const [cx, cz] = CRATE;
    // 单独一个网格（不合并），vLocal 才是箱子自己的坐标
    const cm = new THREE.Mesh(norm(new THREE.BoxGeometry(...CRATE_SIZE)), crate);
    cm.position.set(cx, DOCK.y + 0.35, cz);
    cm.rotation.y = 0.15;
    root.add(cm);
    blobs.push(new THREE.Vector4(cx - 0.1, cz + 0.35, 0.6, 0.55));
    // 栈桥东沿站着的小孩（参考图：黑头发、圆滚滚的蓝身子、深色腿，背对镜头）
    const [bx, bz] = BUCKET;
    const legs = mats.get('legs', { ramp: [0x2a2438, 0x3a3046, 0x4a3e5a], edge: 0.6 });
    for (const lx of [-0.13, 0.13])
      B.add(legs, place(new THREE.BoxGeometry(0.16, 0.36, 0.18), bx + lx, DOCK.y + 0.18, bz));
    const kb = blob(0.44, rr, 1, 1.05);
    place(kb, bx, DOCK.y + 0.72, bz);
    B.add(bucket, kb);
    const kh = blob(0.27, rr, 1, 1.1);
    place(kh, bx + 0.05, DOCK.y + 1.36, bz - 0.04);
    B.add(mats.get('skin', { ramp: [0xa86a50, 0xd09070, 0xf0b090] }), kh);
    const hair = blob(0.29, rr, 1, 0.9);
    place(hair, bx - 0.02, DOCK.y + 1.46, bz + 0.07);
    B.add(mats.get('hair', { ramp: [0x1e1a2a, 0x2a2438, 0x3e3650], edge: 0.6 }), hair);
    blobs.push(new THREE.Vector4(bx - 0.1, bz + 0.25, 0.5, 0.4));
    // 栈桥东沿一根高柱 + 横杆
    const [px, pz] = LAMP_POST;
    stub(px, pz, 1.5, 0.26);
    B.add(post, place(new THREE.BoxGeometry(1.0, 0.14, 0.14), px - 0.45, DOCK.y + 1.42, pz));
  }

  // —— 钓鱼的人（背对镜头坐在栈桥北端，草帽很大；身子是转了 45° 的方块，正对镜头的是一条竖棱） ——
  const shirt = mats.get('shirt', { ramp: [0x2f4c98, 0x3a5ba5, 0x4a70c0], edge: 0.6, light: [-0.4, 0.6, 1] });
  const hat = mats.get('hat', { ramp: [0xc8a860, 0xecd98b, 0xfef6ae], edge: 0.9, bands: [-0.2, 0.75] });
  const band = mats.get('hatband', { ramp: [0x4a3a5a, 0x6a5a78, 0x8a7a90], edge: 0.6 });
  const fisher: THREE.Mesh[] = [];
  {
    const [fx, fz] = FISHER;
    const y0 = DOCK.y;
    const fb = new THREE.Group();
    const fadd = (m: THREE.Material, g: THREE.BufferGeometry) => {
      const mesh = new THREE.Mesh(norm(g), m);
      fb.add(mesh);
      fisher.push(mesh);
    };
    const body = new THREE.BoxGeometry(0.8, 1.38, 0.8);
    body.rotateY(Math.PI / 4);
    body.translate(0, 0.69, 0);
    fadd(shirt, body);
    const head = blob(0.3, rr, 1, 1);
    head.translate(0, 1.62, 0);
    fadd(mats.get('skin', { ramp: [0xa86a50, 0xd09070, 0xf0b090] }), head);
    const brim = new THREE.CylinderGeometry(0.8, 0.8, 0.08, 22);
    brim.translate(0, 1.74, 0);
    fadd(hat, brim);
    const crown = new THREE.CylinderGeometry(0.32, 0.38, 0.32, 16);
    crown.translate(0, 1.94, 0);
    fadd(hat, crown);
    const bd = new THREE.CylinderGeometry(0.385, 0.39, 0.1, 16);
    bd.translate(0, 1.83, 0);
    fadd(band, bd);
    const arm = new THREE.BoxGeometry(0.22, 0.22, 0.6);
    arm.rotateY(-0.6);
    arm.translate(0.42, 1.18, 0.05);
    fadd(shirt, arm);
    const hand = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    hand.translate(0.62, 1.2, -0.15);
    fadd(mats.get('skin', { ramp: [0xa86a50, 0xd09070, 0xf0b090] }), hand);
    fb.position.set(fx, y0, fz);
    root.add(fb);
    blobs.push(new THREE.Vector4(fx - 0.35, fz + 0.95, 1.1, 0.8));
  }
  shared.uBlobs.value.forEach((v, i) => {
    v.copy(blobs[i] ?? new THREE.Vector4());
  });

  // 鱼竿：2 纹素宽的深色细条（盒子），鱼线：1 纹素白线，下垂；浮漂红色
  const lines: THREE.Object3D[] = [];
  const [fx, fz] = FISHER;
  const rodBase = new THREE.Vector3(fx + 0.6, DOCK.y + 1.2, fz - 0.2);
  const rodTip = new THREE.Vector3(...ROD_TIP);
  const bob = new THREE.Vector3(...BOBBER);
  {
    const d = rodTip.clone().sub(rodBase);
    const g = new THREE.BoxGeometry(0.09, 0.09, d.length());
    const m = new THREE.Mesh(
      norm(g),
      mats.get('rod', { ramp: [0x3a2228, 0x4b2523, 0x6a3a2a], edge: 0.4, snow: false }),
    );
    m.position.copy(rodBase).addScaledVector(d, 0.5);
    m.lookAt(rodTip);
    root.add(m);
  }
  const linePts = [rodTip];
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    const p = rodTip.clone().lerp(bob, t);
    p.y -= Math.sin(t * Math.PI) * 0.35;
    linePts.push(p);
  }
  const fline = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(linePts),
    new THREE.LineBasicMaterial({ color: 0xe8e4f0 }),
  );
  lines.push(fline);
  const bobber = mats.get('bobber', { ramp: [0xa02a3a, 0xd04050, 0xf07070], edge: 0.6 });
  const bg = blob(0.13, rr, 0, 1);
  place(bg, bob.x, bob.y, bob.z);
  B.add(bobber, bg);
  foam.push({ x: bob.x, z: bob.z, r: 0.08 });

  // —— 房子 ——
  // 参考图：山墙正对镜头偏左，石墙（灰紫色石块 + 深缝），门框是深棕色、门板蓝绿；右边窗带百叶和花箱；
  // 山尖一个圆窗（十字窗棂）；屋顶两坡一明一暗（东坡亮），檐口挑得很远；屋脊是一根分节的圆木。
  const house = new THREE.Group();
  const stone = mats.get('houseWall', {
    ramp: pal.houseWall,
    alt: pal.houseWallAlt,
    kind: 'stone',
    edge: 0.6,
    snow: false,
    tones: pal.wallTones,
    // 不规则石块 8×4.5 屏幕纹素；uv 是房子本地米，× 房子缩放才是世界米
    el: [11, 6, HOUSE.scale, 0],
  });
  const roofLight: [number, number, number] = [1, 0.75, 0.1];
  const roof = mats.get('roof', {
    ramp: pal.roof,
    alt: pal.roofAlt,
    edge: 0.8,
    bands: [0.25, 0.62],
    light: roofLight,
    roofShade: true,
    plank: [0.8, 0.45, -1.4, 4.4],
  });
  const roofEdge = mats.get('roofEdge', {
    ramp: pal.roofAlt,
    alt: [0x4f2d35, 0x4f2d35, 0x4f2d35],
    kind: 'ridge',
    plank: [0, 0, 1, 0.95],
    edge: 0.8,
    light: [0.3, 1, 0.6],
    snowT: 0.75,
  });
  const frame = mats.get('frame', {
    ramp: [0x2e2232, 0x3d2c3b, 0x5a3e44],
    edge: 0.6,
    snow: false,
    light: [0.3, 0.6, 1],
  });
  // 门板（参考图 #2b5262 为主，缝 #264856，亮条 #3a6c78）
  const doorTones: Tones = {
    bands: [
      [0x2b5262, 0x2e5a68, 0x284c5c],
      [0x2e5c6a, 0x326270, 0x2a5262],
      [0x3a6c78, 0x3e7480, 0x346470],
    ],
    seam: [0x1f4350, 0x1f4350, 0x24485a],
    hi: [0x3a6c78, 0x3e7482, 0x4a8090],
  };
  const door = mats.get('door', {
    ramp: [0x2a5361, 0x2e5c6a, 0x3a6c78],
    alt: [0x1f4350, 0x1f4350, 0x1f4350],
    kind: 'wood',
    plank: [1, 0, 0, 0.26],
    edge: 0.5,
    snow: false,
    tones: doorTones,
    el: [0, 0, HOUSE.scale, 0],
  });
  const glass = mats.get('glass', { ramp: [0x252b5a, 0x2e3a7a, 0x3e4a8a], edge: 0.5, snow: false });
  const lamp = mats.get('lamp', { ramp: [0xfff0c0, 0xfff0c0, 0xfff4d0], emissive: true, edge: 0.3 });
  const W = 4.2;
  const L = 5.0;
  const Hw = 2.55;
  const hb = new THREE.Group();
  const add = (m: THREE.Material, g: THREE.BufferGeometry) => hb.add(new THREE.Mesh(norm(g), m));
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  {
    // 墙：每个面的 uv 按米（石块大小在每面都一样）
    const walls = new THREE.BoxGeometry(W, Hw, L);
    const uv = walls.getAttribute('uv');
    const faceW = [L, L, W, W, W, W];
    const faceH = [Hw, Hw, L, L, Hw, Hw];
    for (let i = 0; i < uv.count; i++) {
      const f = Math.floor(i / 4);
      uv.setXY(i, uv.getX(i) * faceW[f], uv.getY(i) * faceH[f]);
    }
    walls.translate(0, Hw / 2, 0);
    add(stone, walls);
    // 屋顶：两片厚板（0.42 米），檐口挑出去很多
    const pitch = 0.72;
    const half = W / 2 + 0.85;
    const sl = half / Math.cos(pitch);
    const rh = Math.tan(pitch) * (W / 2);
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(sl, 0.42, L + 1.4);
      g.translate((s * sl) / 2, 0, 0);
      g.rotateZ(-s * pitch);
      g.translate(0, Hw + rh + 0.2, 0.15);
      add(roof, g);
    }
    // 屋脊：分节圆木，前端伸出山墙
    const ridge = new THREE.CylinderGeometry(0.34, 0.34, L + 1.9, 10);
    ridge.rotateX(Math.PI / 2);
    ridge.translate(0, Hw + rh + 0.46, 0.25);
    add(roofEdge, ridge);
    // 山墙三角（前后）
    const tri = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, rh)]);
    for (const s of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
      g.translate(0, Hw, s > 0 ? L / 2 - 0.2 : -L / 2);
      add(stone, g);
    }
    // 烟囱：后坡左边，石头砌的
    const chim = new THREE.BoxGeometry(0.85, 2.6, 0.85);
    const cuv = chim.getAttribute('uv');
    for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cuv.getX(i) * 0.85, cuv.getY(i) * 2.6);
    chim.translate(-W / 2 + 0.7, Hw + 1.9, -L / 2 + 1.9);
    add(stone, chim);
    add(frame, box(1.0, 0.16, 1.0, -W / 2 + 0.7, Hw + 3.2, -L / 2 + 1.9));
    // 正面（+z 山墙）：门（深色门框 + 门楣 + 竖板门）
    const zf = L / 2;
    const DX = -0.92;
    const WX = 0.95;
    const WY = 1.05;
    add(frame, box(1.3, 1.8, 0.12, DX, 0.9, zf + 0.04));
    add(frame, box(1.6, 0.2, 0.22, DX, 1.85, zf + 0.08));
    add(door, box(1.0, 1.6, 0.12, DX, 0.8, zf + 0.08));
    add(
      mats.get('knob', { ramp: [0x9a7a40, 0xc8a050, 0xf0d070], edge: 0.2 }),
      box(0.1, 0.1, 0.1, DX + 0.35, 0.9, zf + 0.16),
    );
    // 窗：深色框 + 十字窗棂 + 两扇百叶 + 花箱
    add(frame, box(1.05, 0.85, 0.1, WX, WY, zf + 0.03));
    add(glass, box(0.85, 0.65, 0.1, WX, WY, zf + 0.06));
    add(frame, box(0.08, 0.65, 0.1, WX, WY, zf + 0.09));
    add(frame, box(0.85, 0.08, 0.1, WX, WY, zf + 0.09));
    const shutter = mats.get('shutter', {
      ramp: [0x2a5361, 0x2e5c6a, 0x3a6c78],
      alt: [0x1f4350, 0x1f4350, 0x1f4350],
      kind: 'wood',
      plank: [0, 1, 0, 0.2],
      edge: 0.5,
      snow: false,
      tones: doorTones,
      el: [0, 0, HOUSE.scale, 0],
    });
    for (const sx of [-1, 1]) add(shutter, box(0.32, 0.9, 0.1, WX + sx * 0.7, WY, zf + 0.06));
    add(frame, box(1.2, 0.22, 0.3, WX, WY - 0.5, zf + 0.16));
    const fl = mats.get('boxFlower', { ramp: [0xa04a6a, 0xe07a9a, 0xf4b0c8], edge: 0.4 });
    const leaf = mats.get('boxLeaf', { ramp: [0x2f6a4a, 0x4a9a58, 0x6cba52], edge: 0.3 });
    for (let i = 0; i < 6; i++) {
      add(i % 2 ? fl : leaf, box(0.16, 0.16, 0.16, WX - 0.45 + i * 0.18, WY - 0.32, zf + 0.2));
    }
    // 山尖圆窗：深色圆框 + 玻璃 + 十字
    const ring = new THREE.CylinderGeometry(0.37, 0.37, 0.1, 14);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, Hw + rh * 0.2, zf + 0.03);
    add(frame, ring);
    const rw = new THREE.CylinderGeometry(0.28, 0.28, 0.1, 14);
    rw.rotateX(Math.PI / 2);
    rw.translate(0, Hw + rh * 0.2, zf + 0.06);
    add(glass, rw);
    add(frame, box(0.07, 0.56, 0.1, 0, Hw + rh * 0.2, zf + 0.09));
    add(frame, box(0.56, 0.07, 0.1, 0, Hw + rh * 0.2, zf + 0.09));
    // 门左边的壁灯
    add(frame, box(0.12, 0.12, 0.3, -1.75, 1.75, zf + 0.15));
    add(lamp, box(0.24, 0.3, 0.24, -1.75, 1.55, zf + 0.3));
    // 门口两级石阶
    // 门前石板：同石板路（Voronoi 石块 + 每块深浅），侧面暗档
    const stepMat = mats.get('pathStep', {
      ramp: pal.path,
      alt: pal.pathAlt,
      kind: 'path',
      edge: 0.3,
      tones: pal.landingTones,
      el: [8, 5, 1, 0],
    });
    add(stepMat, box(1.8, 0.22, 0.9, -0.92, 0.11, zf + 0.45));
    add(stepMat, box(1.4, 0.12, 0.45, -0.92, 0.28, zf + 0.25));
    // 东侧（+x）披檐（板缝平行于屋檐）+ 柱子 + 柴堆
    const lean = new THREE.BoxGeometry(2.3, 0.2, L - 0.2);
    lean.translate(1.15, 0, 0);
    lean.rotateZ(-0.3);
    lean.translate(W / 2 + 0.55, Hw + 0.1, 0.25);
    add(
      mats.get('leanto', {
        ramp: [0x8a5e44, 0x9c6c4d, 0xc08a56],
        alt: pal.woodAlt,
        kind: 'wood',
        plank: [0, 0, 1, 0.75],
        edge: 0.6,
        el: [0, 0, HOUSE.scale, 0],
        light: roofLight,
        bands: [0.25, 0.62],
      }),
      lean,
    );
    for (const sz of [-1, 1])
      add(post, box(0.2, Hw - 0.55, 0.2, W / 2 + 2.5, (Hw - 0.55) / 2, sz * (L / 2 - 0.5) + 0.25));
    // 柴堆：一摞圆木，截面朝镜头（端面浅、木皮深）
    const logEnd = mats.get('logs', { ramp: [0x5a3438, 0x7a4a3a, 0x9a6448], edge: 0.7, light: [0, 0.4, 1] });
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 5 - row; i++) {
        const g = new THREE.CylinderGeometry(0.2, 0.2, 2.4, 7);
        g.rotateX(Math.PI / 2);
        g.translate(W / 2 + 0.35 + i * 0.38 + row * 0.19, 0.2 + row * 0.34, 0.6);
        add(logEnd, g);
      }
    }
    // 木桶（两道深色箍）、铁皮桶
    for (const [bx, bz, c] of [
      [0.9, L / 2 + 1.2, 0x8a5a3a],
      [1.75, L / 2 + 1.0, 0x6a6a7a],
      [3.1, L / 2 + 1.0, 0x8a5a3a],
    ] as const) {
      const g = new THREE.CylinderGeometry(0.32, 0.29, 0.72, 10);
      g.translate(bx, 0.36, bz);
      const col = new THREE.Color(c);
      const hex = (k: number) => col.clone().multiplyScalar(k).getHex();
      add(mats.get(`barrel${c}`, { ramp: [hex(0.6), hex(0.85), hex(1.1)], edge: 0.6 }), g);
      if (c === 0x8a5a3a)
        for (const hy of [0.18, 0.54]) {
          const hg = new THREE.CylinderGeometry(0.335, 0.335, 0.07, 10);
          hg.translate(bx, hy, bz);
          add(frame, hg);
        }
    }
  }
  hb.rotation.y = HOUSE.yaw;
  house.add(hb);
  house.position.set(HOUSE.at[0], HOUSE.h, HOUSE.at[1]);
  house.scale.setScalar(HOUSE.scale);
  root.add(house);

  const reflectSet = new Set<THREE.Material>([reed, reedHead, post, rock, bobber, crate, bucket]);
  B.build(root);
  mats.prepare(root);
  // 睡莲、花、浮漂不投影
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material === lily || m.material === bobber || m.material === bushShade || fisher.includes(m)))
      m.castShadow = false;
    // 只有挨着水的东西进反射 pass（参考图里看得到芦苇、桩子的倒影，看不到树和崖的）
    if (
      m.isMesh &&
      (reflectSet.has(m.material as THREE.Material) || fisher.includes(m) || dockGroup.children.includes(m))
    )
      m.layers.enable(2);
  });
  for (const l of lines) {
    l.layers.set(1);
    root.add(l);
  }

  return {
    root,
    lines,
    foam,
    update() {},
  };
}
