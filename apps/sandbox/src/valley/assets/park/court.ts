// 日出公园：公共球场的一套（批 KC）。docs/lab/2026-11-07-3d-pixel/valley-park.md「资产清单」。
// 这一批：park-court、park-court-bed、park-net、park-fence、park-light、park-closed-sign、park-barricade
// 本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米。设计纹素 0.09 米；材质只用 ctx.mat(key, extra)，随机只用 ctx.rng('<id>')。
//
// 平铺的两件（park-court、park-court-bed）原点在面的中心，层次（米）：外场 0.005 → 外场晒白 / 内场漆 0.015 → 补丁、白线 0.025
// → 裂缝的亮唇 0.035 → 裂缝 0.045。组装时两件都放 y 0：内场盖在外场上面，晒白块都在内场外（网柱脚下、四角、场门那条磨出来的路）。
// 薄的、细的（围网、网、灯杆、牌子、路障的腿）一律 userData.noCast（傍晚是又长又直的硬黑带）。
// 字（封场牌、路障的小牌）：3×5 像素字烘成一张 alphaMap（一行一个纹素 = 0.045 米 × 一屏幕行），贴在 FX 图层的一块薄片上 ——
// 一整块字只要 2 个三角形（封场牌的预算只有 50）；法线 pass 不画 FX 图层，所以字不出描边。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { topGeo } from '../../../clubsite/render/geo';
import type { Tones } from '../../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../../ctx';
import { SIGN_FACE, TOWN_EL } from '../../palette';
import { cells57, GR, GT, width57 } from './font57';

type V2 = [number, number];
type Ramp = [number, number, number];
type Part = [THREE.BufferGeometry, THREE.Material];

/** 设计纹素（米） */
const D = 0.09;
/** 游戏里一个纹素（/valley.html 默认缩放）、竖直面上一屏幕行（俯 45°） */
const T = 0.045;
const R = T / Math.SQRT1_2;

const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

// ════════════════════════════ 小工具 ════════════════════════════

/** 几块几何按材质合成网格；noCast 里的材质不投影（all = 整件都不投影） */
function meshes(ctx: AssetCtx, parts: Part[], noCast: THREE.Material[] | 'all' = []): THREE.Group {
  const g = new THREE.Group();
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [geo, m] of parts) {
    const ng = geo.index ? geo.toNonIndexed() : geo;
    for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
    by.set(m, [...(by.get(m) ?? []), ng]);
  }
  for (const [m, list] of by) {
    const merged = mergeGeometries(list);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    if (noCast === 'all' || noCast.includes(m)) mesh.userData.noCast = true;
    g.add(mesh);
  }
  ctx.mats.prepare(g);
  g.traverse((o) => {
    if (o.userData.noCast) o.castShadow = false;
  });
  return g;
}

/** 收集几何 */
function kit() {
  const parts: Part[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    parts.push([g, m]);
    return g;
  };
  /** 盒子（中心 x z、底 y），不要底面（10 个三角形；底面永远看不见） */
  const bx = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    add(box5(w, h, d).translate(x, y + h / 2, z), m);
  /** 竖直薄片：朝 +z（中心 x、底 y0 顶 y1、平面 z）；two = 背面也画一片（转 180° 放也看得见） */
  const vq = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z: number, two = false) => {
    add(new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, z), m);
    if (two)
      add(
        new THREE.PlaneGeometry(x1 - x0, y1 - y0).rotateY(Math.PI).translate((x0 + x1) / 2, (y0 + y1) / 2, z - 0.005),
        m,
      );
  };
  /** 水平面（x0..x1 × z0..z1，高 y） */
  const hq = (m: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number) =>
    add(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2), m);
  /** 地上的多边形（[x, z]，高 y） */
  const poly = (m: THREE.Material, pts: V2[], y: number) => add(topGeo(pts, y), m);
  return { parts, add, bx, vq, hq, poly };
}

/** BoxGeometry 去掉底面（−y）：10 个三角形 */
function box5(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  // 面的顺序 +x −x +y −y +z −z，每面 6 个顶点；去掉第 4 面
  const pos = g.attributes.position.array as Float32Array;
  const nor = g.attributes.normal.array as Float32Array;
  const keep = (a: Float32Array) => {
    const out = new Float32Array(a.length - 18);
    out.set(a.subarray(0, 54));
    out.set(a.subarray(72), 54);
    return out;
  };
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.BufferAttribute(keep(pos), 3));
  o.setAttribute('normal', new THREE.BufferAttribute(keep(nor), 3));
  return o;
}

/** 地上的一条带子（折线，宽 w，向法线 n 偏 off）：每段一个四边形，高 y */
function ribbon(pts: V2[], w: number, y: number, off = 0): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    // 法线挑"往画面下方 / 往东"的那一侧（裂缝下沿翘起的亮漆在这一侧）
    let nx = -(z1 - z0) / len;
    let nz = (x1 - x0) / len;
    if (nz < 0 || (Math.abs(nz) < 0.3 && nx < 0)) {
      nx = -nx;
      nz = -nz;
    }
    // 两头各多出半个宽，接缝不留缝
    const ex = ((x1 - x0) / len) * w * 0.5;
    const ez = ((z1 - z0) / len) * w * 0.5;
    const a: V2 = [x0 - ex + nx * off, z0 - ez + nz * off];
    const b: V2 = [x1 + ex + nx * off, z1 + ez + nz * off];
    out.push(topGeo([a, b, [b[0] + nx * w, b[1] + nz * w], [a[0] + nx * w, a[1] + nz * w]], y));
  }
  return out;
}

/** 夜里换材质：[白天那份, 夜里那份]。锁着时网格上是压暗的一份（不在表里）→ 不亮。pools = 灯光圈的挂点（子物件） */
function nightSwap(obj: THREE.Object3D, pairs: [THREE.Material, THREE.Material][], pools: THREE.Object3D[] = []) {
  const on = new Map(pairs);
  const off = new Map(pairs.map(([a, b]) => [b, a]));
  let lit = false;
  obj.userData.night = {
    setOn(v: boolean) {
      lit = v;
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const cur = m.material as THREE.Material;
        const next = v ? on.get(cur) : off.get(cur);
        if (next) m.material = next;
      });
    },
  };
  for (const p of pools) {
    const r = p.userData.r as number;
    const h = p.userData.h as number;
    const w = new THREE.Vector3();
    p.userData.night = {
      pool: (): [number, number, number, number] => {
        p.getWorldPosition(w);
        let real = false;
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && off.has((o as THREE.Mesh).material as THREE.Material)) real = true;
        });
        return lit && real ? [w.x, w.z, r, h] : [w.x, w.z, 0, 0];
      },
    };
    obj.add(p);
  }
}
/** 灯光圈的挂点（本地 x z，半径 r，最高照到 h） */
function poolAt(x: number, z: number, r: number, h: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(x, 0, z);
  o.userData.r = r;
  o.userData.h = h;
  return o;
}

// ── 5×7 像素字 → alphaMap（G4：原来 3×5、一格 0.045 米 = 小镇镜头 1.33 纹素，"COURT / CLOSED" 远看是一团噪点；
// 现在 font57.ts 的 5×7、一格 = 正好 1 纹素 × 1 屏幕行，只留一个词）──
/**
 * 几行像素字烘成一张 alphaMap，贴在一块朝 +z 的薄片上（FX 图层：只进颜色 pass，不出描边，不投影）。
 * 一格 = GT 宽 × GR 高（游戏里一个纹素 × 一屏幕行）；行间空 1 格。中心 (cx, cy)，平面 z。
 */
function textCard(ctx: AssetCtx, key: 'signPaint', lines: string[], cx: number, cy: number, z: number): THREE.Mesh {
  const W = Math.max(...lines.map(width57));
  const H = lines.length * 7 + (lines.length - 1);
  const data = new Uint8Array(W * H * 4);
  lines.forEach((s, li) => {
    const x = Math.floor((W - width57(s)) / 2);
    for (const [c0, c1, r0, r1] of cells57(s))
      for (let c = c0; c < c1; c++)
        for (let r = r0; r < r1; r++) {
          const ty = (lines.length - 1 - li) * 8 + r; // 贴图第 0 行在底下
          data.fill(255, (ty * W + x + c) * 4, (ty * W + x + c) * 4 + 4);
        }
  });
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const m = ctx.mat(key, { ...SIGN_FACE, alphaMap: tex, alphaTest: 0.5 });
  const x0 = Math.round((cx - (W * GT) / 2) / GT) * GT;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W * GT, H * GR).translate(x0 + (W * GT) / 2, cy, z), m);
  mesh.layers.set(ctx.layers.FX);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  return mesh;
}

/** 凸多边形裁到矩形里（Sutherland–Hodgman，[x, y]） */
function clipRect(poly: V2[], x0: number, x1: number, y0: number, y1: number): V2[] {
  const edges: [(p: V2) => boolean, (a: V2, b: V2) => V2][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}
/** 竖直面上的多边形（[x, y]，朝 +z，平面 z） */
function vpoly(pts: V2[], z: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
  g.deleteAttribute('uv');
  g.translate(0, 0, z);
  return g;
}
/** 同一块竖直多边形的背面（朝 −z） */
function vpolyBack(pts: V2[], z: number): THREE.BufferGeometry {
  // 同一块多边形，每个三角形反过来绕、法线朝 −z
  const g = vpoly(pts, z).toNonIndexed();
  const p = g.attributes.position.array as Float32Array;
  for (let i = 0; i < p.length; i += 9)
    for (let c = 0; c < 3; c++) {
      const t = p[i + 3 + c];
      p[i + 3 + c] = p[i + 6 + c];
      p[i + 6 + c] = t;
    }
  const n = g.attributes.normal.array as Float32Array;
  for (let i = 2; i < n.length; i += 3) n[i] = -1;
  return g;
}

// ════════════════════════════ park-court：一片场的内场 ════════════════════════════

/** 标准场地尺寸（米）：半长、双打半宽、单打半宽、发球线离网、线宽（2 纹素 = 俱乐部的场一样粗） */
const HL = 11.885;
const HD = 5.485;
const HS = 4.115;
const SV = 6.4;
const LW = 2 * D;
/** 平铺的层次 */
const Y_BED = 0.005;
const Y_COURT = 0.015;
const Y_LINE = 0.025;
const Y_LIP = 0.035;
const Y_CRACK = 0.045;

/** 裂缝：缝（比内场暗 ~45，不到强边缘）+ 下沿一纹素翘起的亮漆（比内场亮 ~15） */
const CRACK: Ramp = [0x308270, 0x25635f, 0x203b4d]; // L 111 / 86 / 55（G4：跟着 muniCourt 往冷、往暗走，缝 −24）
const LIP: Ramp = [0x45bca2, 0x389893, 0x376785]; // L 161 / 131 / 95（= muniCourt 的亮边）

/** 一条裂缝的折线：从 (x, z) 沿 (dx, dz) 走 n 步，每步 step 米，横向乱走 wob */
function crackPath(
  rnd: () => number,
  x: number,
  z: number,
  dx: number,
  dz: number,
  n: number,
  step: number,
  wob: number,
) {
  const pts: V2[] = [[x, z]];
  const nx = -dz;
  const nz = dx;
  let side = 0;
  for (let i = 0; i < n; i++) {
    side += (rnd() - 0.5) * wob;
    side *= 0.7;
    const s = step * (0.7 + rnd() * 0.6);
    x += dx * s + nx * side;
    z += dz * s + nz * side;
    pts.push([Math.max(-HD + 0.3, Math.min(HD - 0.3, x)), Math.max(-HL + 0.3, Math.min(HL - 0.3, z))]);
  }
  return pts;
}

/**
 * park-court 11 × 23.8（v0 好：北后场一块补丁 / v1 裂：三道裂缝 / v2 塌网那片：一道裂缝 + 南后场一块补丁）。
 * 褪色的市政绿漆面（有机深浅块 + 很少的擦痕）+ 2 纹素白线（单打、双打、发球线、中线、中点）；补丁 = 方的新漆（硬边、平涂）。
 */
const parkCourt: AssetFn = (ctx) => {
  const v = ctx.variant % 3;
  const rnd = ctx.rng(`park-court:${v}`);
  const k = kit();
  const court = ctx.mat('muniCourt', { elem: { ...TOWN_EL.muniCourt, density: [0, 0.03] } });
  const line = ctx.mat('line');
  const patch = ctx.mat('muniPatch');
  const crack = ctx.mat('muniCourt', { ramp: CRACK });
  const lip = ctx.mat('muniCourt', { ramp: LIP });

  k.hq(court, -5.5, 5.5, -11.9, 11.9, Y_COURT);
  // 线（外沿 = 场地边界，线宽往里长）
  const ln = (x0: number, x1: number, z0: number, z1: number) => k.hq(line, x0, x1, z0, z1, Y_LINE);
  for (const s of [-1, 1]) {
    ln(-HD, HD, s > 0 ? HL - LW : -HL, s > 0 ? HL : -HL + LW); // 底线
    ln(s > 0 ? HD - LW : -HD, s > 0 ? HD : -HD + LW, -HL, HL); // 双打边线
    ln(s > 0 ? HS - LW : -HS, s > 0 ? HS : -HS + LW, -HL, HL); // 单打边线
    ln(-HS, HS, s > 0 ? SV - LW / 2 : -SV - LW / 2, s > 0 ? SV + LW / 2 : -SV + LW / 2); // 发球线
    ln(-LW / 2, LW / 2, s > 0 ? HL - LW - 0.27 : -HL + LW, s > 0 ? HL - LW : -HL + LW + 0.27); // 中点
  }
  ln(-LW / 2, LW / 2, -SV, SV); // 中线

  // 补丁：方的新漆，两块矩形叠成一个缺角的方块（放在后场没有线的地方：单打边线之间、底线和发球线之间）
  const patchAt = (cx: number, cz: number, w: number, d: number) => {
    k.hq(patch, cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, Y_LINE);
    k.hq(patch, cx - w / 2 + 0.36, cx + w / 2 + 0.27, cz - d / 2 + 0.38, cz + d / 2 - 0.25, Y_LINE);
  };
  // 裂缝：缝 + 下沿亮唇（亮唇比缝低一层，缝压在线上面 = 把线也裂开了）
  const crackAt = (pts: V2[]) => {
    for (const g of ribbon(pts, D, Y_LIP, D / 2)) k.add(g, lip);
    for (const g of ribbon(pts, D, Y_CRACK, -D / 2)) k.add(g, crack);
  };
  if (v === 0) patchAt(-1.2, -9, 2.2, 1.5);
  if (v === 1) {
    // 一道顺着场长的（南半场，从发球线一直裂到后场）、一道横穿北发球区、一道在北底线后面斜着
    crackAt(crackPath(rnd, 1.6, 2.2, 0.08, 1, 8, 1.1, 0.5));
    crackAt(crackPath(rnd, -4.9, -3.6, 1, -0.12, 9, 1.0, 0.45));
    crackAt(crackPath(rnd, -2.6, -10.6, 1, 0.22, 5, 0.9, 0.4));
  }
  if (v === 2) {
    crackAt(crackPath(rnd, -5.1, 3.4, 1, 0.1, 10, 1.05, 0.45));
    patchAt(1.4, 9.2, 2.0, 1.4);
  }
  const g = meshes(ctx, k.parts);
  g.traverse((o) => {
    o.castShadow = false;
  });
  return g;
};

// ════════════════════════════ park-court-bed：三片场的外场 + 场间 ════════════════════════════

/** 三片场在外场里的中心（本地 x；z 都是 0）—— 版图 767.2 / 782.4 / 797.7，外场中心 782.4 */
const COURT_X = [-15.2, 0, 15.3];
/** 外场的晒白（比外场亮 ~25，两色硬边） */
const BLEACH: Ramp = [0xd6a088, 0xb47c72, 0x6a5070]; // L 170 / 135 / 88

/** 一块不规则的晒白：以 (x, z) 为心的扁圆，7 个点，半径乱一点 */
function blob(rnd: () => number, x: number, z: number, rx: number, rz: number): V2[] {
  const pts: V2[] = [];
  const n = 7;
  const a0 = rnd() * Math.PI;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const r = 0.75 + rnd() * 0.4;
    pts.push([x + Math.cos(a) * rx * r, z + Math.sin(a) * rz * r]);
  }
  return pts;
}

/**
 * park-court-bed 49 × 36.6：一整块褪色铁锈红的外场（大块、低对比的漆面深浅），四角、每根网柱脚下、南边场门进来那条磨出来的路上晒白。
 */
const parkCourtBed: AssetFn = (ctx) => {
  const rnd = ctx.rng('park-court-bed');
  const k = kit();
  const bed = ctx.mat('muniOuter', { elem: { ...TOWN_EL.muniOuter, density: [0, 0.02] } });
  const bleach = ctx.mat('muniOuter', { ramp: BLEACH });
  const HW = 24.5;
  const HZ = 18.3;
  k.hq(bed, -HW, HW, -HZ, HZ, Y_BED);
  // 四角（没人走、晒得最狠）
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as V2[])
    k.poly(bleach, clipRect(blob(rnd, sx * (HW - 1.2), sz * (HZ - 0.9), 1.7, 1.1), -HW, HW, -HZ, HZ), Y_COURT);
  // 网柱脚下（每片两根，x ± 6.4）
  for (const cx of COURT_X)
    for (const s of [-1, 1]) k.poly(bleach, blob(rnd, cx + s * 6.4, (rnd() - 0.5) * 0.4, 0.55, 0.85), Y_COURT);
  // 南边场门（版图 x 790.06 = 本地 7.66）进来那条：门口一块、往北一截（2、3 号场之间）
  k.poly(bleach, blob(rnd, 7.66, HZ - 1.4, 0.8, 1.2), Y_COURT);
  k.poly(bleach, blob(rnd, 7.4, HZ - 4.2, 0.55, 1.4), Y_COURT);
  const g = meshes(ctx, k.parts);
  g.traverse((o) => {
    o.castShadow = false;
  });
  return g;
};

// ════════════════════════════ park-net：球网 ════════════════════════════

/** 网身：镀锌灰往暗里压的一条蓝灰带，竖缝每 3 纹素一条稍亮的（暗示网眼，不画网格） */
const NET_TONES = tn(
  [0x6c7690, 0x747e98, 0x667088], // L 116
  [0x56607a, 0x5e6882, 0x505a74], // L 94
  [0x3a4060, 0x404868, 0x343a58], // L 63
  [0x86909e, 0x6e7890, 0x4c5272], // "缝" = 稍亮的竖线（+18 / +20 / +17）
  [0x86909e, 0x6e7890, 0x4c5272],
);

/**
 * park-net 12.8 × 1.07 × 0.2（v0 好：网带中间 0.914 / v1 塌：网带垂成弧，中间 0.62 / v2 没网：只剩两根网柱、一截垂到地上的钢缆）。
 * 两根 2 纹素的网柱 + 网身（蓝灰带）+ 白网带（前面 + 顶面）+ 白中带。整件不投影；网身、网带不接收投影。
 */
const parkNet: AssetFn = (ctx) => {
  const v = ctx.variant % 3;
  const k = kit();
  const post = ctx.mat('ironwork', { convex: 0.3 });
  const net = ctx.mat('chainLink', {
    ramp: [0x6c7690, 0x56607a, 0x3a4060],
    tones: NET_TONES,
    elem: { kind: 'planks', seam: 1, hi: 0, p: [1, 0, 0, 3 * D] },
    toneW: [0.12, 0.1],
    lightUp: 0.35,
    bands: [-0.4, 0.3],
    edge: 0.3,
    convex: 0.1,
    noShadowReceive: true,
  });
  const tapeF = ctx.mat('netTape', { lightUp: 0.6, bands: [-0.9, -0.5], noShadowReceive: true }); // 白网带朝镜头那面也落亮档
  const tapeTop = ctx.mat('netTape', { noShadowReceive: true });
  const PX = 6.4;
  const PW = 2 * D;
  for (const s of [-1, 1]) {
    k.bx(post, PW, 1.07, PW, s * PX, 0, 0);
    k.bx(post, PW + 0.04, 0.05, PW + 0.04, s * PX, 1.07, 0); // 柱帽
  }
  // 绞盘（东柱外侧一小块）
  k.bx(post, 0.08, 0.14, 0.14, PX + PW / 2 + 0.04, 0.82, 0);

  if (v === 2) {
    // 没网：网被偷了，西柱上还挂着一截钢缆，垂下来拖到地上
    const cable = ctx.mat('ironwork', { noShadowReceive: true });
    const cw = D;
    const sag: V2[] = [];
    const x0 = -PX + PW / 2;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      sag.push([x0 + t * 2.6, 0.98 * (1 - t) ** 1.6 + 0.02]);
    }
    for (let i = 0; i + 1 < sag.length; i++) {
      const [ax, ay] = sag[i];
      const [bx, by] = sag[i + 1];
      k.add(
        vpoly(
          [
            [ax, ay],
            [bx, by],
            [bx, by + cw],
            [ax, ay + cw],
          ],
          0.01,
        ),
        cable,
      );
    }
    // 地上那截：弯一下
    const ground: V2[] = [
      [x0 + 2.6, 0.0],
      [x0 + 3.3, 0.12],
      [x0 + 3.9, -0.05],
      [x0 + 4.5, 0.18],
    ];
    for (const g of ribbon(ground, cw, 0.012)) k.add(g, cable);
    // 中带的地锚（场中间地上一个铁环座）
    k.bx(post, 0.14, 0.04, 0.1, 0, 0, 0);
    return meshes(ctx, k.parts, 'all');
  }

  // 网带的高度：柱上 1.07，中间 0.914（v1 塌到 0.62）；中间那段按 |x| 的幂次弯
  const mid = v === 1 ? 0.62 : 0.914;
  const pw = v === 1 ? 1.5 : 2.2;
  const top = (x: number) => mid + (1.07 - mid) * (Math.abs(x) / (PX - PW / 2)) ** pw;
  const TAPE = 0.17;
  const N = v === 1 ? 10 : 6;
  const xs: number[] = [];
  for (let i = 0; i <= N; i++) xs.push(-(PX - PW / 2) + (i / N) * 2 * (PX - PW / 2));
  for (let i = 0; i < N; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    const ta = top(a);
    const tb = top(b);
    // 网身（前后两面）
    const body: V2[] = [
      [a, 0.03],
      [b, 0.03],
      [b, tb - TAPE],
      [a, ta - TAPE],
    ];
    k.add(vpoly(body, 0), net);
    k.add(vpolyBack(body, -0.01), net);
    // 网带：前、后、顶
    const tape: V2[] = [
      [a, ta - TAPE],
      [b, tb - TAPE],
      [b, tb],
      [a, ta],
    ];
    k.add(vpoly(tape, 0.025), tapeF);
    k.add(vpolyBack(tape, -0.035), tapeF);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([a, ta, 0.025, b, tb, 0.025, b, tb, -0.035, a, ta, 0.025, b, tb, -0.035, a, ta, -0.035]),
        3,
      ),
    );
    tg.computeVertexNormals();
    k.add(tg, tapeTop);
  }
  // 中带：白的一条（1 纹素宽）从地到网带
  k.vq(tapeF, -D / 2, D / 2, 0.03, mid - TAPE, 0.02, true);
  return meshes(ctx, k.parts, 'all');
};

// ════════════════════════════ park-fence：围网一节 ════════════════════════════

/** 铁丝网带：一条暗带（不画网眼），竖向每 4 纹素一条稍亮的线暗示网眼 */
const LINK_TONES = tn(
  [0x7e8a98, 0x8894a0, 0x74808e], // L 136
  [0x5e6880, 0x667088, 0x566078], // L 103
  [0x3c4262, 0x424868, 0x363c5a], // L 66
  [0x96a2ae, 0x7a8698, 0x525a7a], // 竖线 +18 / +21 / +21
  [0x96a2ae, 0x7a8698, 0x525a7a],
);
/**
 * 挡风布（自定义一份 windscreenOld，亮度同调色板，彩度提上去）：调色板那份中档 S 0.29，过了午后调色（lawn 组往暖里拉）画面里只剩 0.22，
 * 围网是野球局关键帧里最大的一块竖直面 → 中档挑 S 0.57 的绿（L 116：深浅元素跨在 120 两边，不是一整块暗），调完 ≈ 0.38。暗档往深青走。
 */
const SCREEN: Ramp = [0x62945a, 0x3a8858, 0x22465a]; // L 133 / 116 / 64
const SCREEN_TONES = tn(
  [0x62945a, 0x6ca064, 0x5a8a50], // L 133 / 145 / 124
  [0x3a8858, 0x429262, 0x347e50], // L 116 / 126 / 107
  [0x22465a, 0x284e62, 0x1e3e50], // L 64 / 71 / 57
  [0x4e7c48, 0x2e6a4a, 0x183242], // 缝 −22 / −27 / −18
  [0x82b06c, 0x62a076, 0x3a6878], // 亮边 +28 / +26 / +31
);
/** 挡风布上沿晒白的那一行（= 亮边色） */
const SCREEN_TOP: Ramp = [0x82b06c, 0x62a076, 0x3a6878];
/** 挡风布的背面（撕下来翻过来的那片）：比正面褪得更黄 */
const SCREEN_BACK: Ramp = [0x80a05e, 0x6a9660, 0x3a5a5a];

/**
 * park-fence 6 × 3.6 × 0.16（一节；两头各一根立柱，相邻两节的柱子重合）。
 * v0 好：下 2.6 米旧绿挡风布（每 1.5 米一条竖接缝，上沿一行晒白）+ 上面 1 米铁丝网带 + 顶横杆；
 * v1 破：挡风布上沿撕开一个口子（露出后面的铁丝网），撕下来的那片倒挂着垂到 0.7 米（晒白的边翻到了下面）；
 * v2 只剩铁丝网：整节 3.6 米都是网带，顶上残留一小截挡风布；
 * v3 门：中间 1.8 米门框（门柱、门楣、上面接着网带），门扇往场里（−z）开着 70°，西柱上两个铰链、东柱上门闩。
 * 整件不投影。朝镜头的面（挡风布、网带）用招牌那套光照落中档（SIGN_FACE）。
 */
const parkFence: AssetFn = (ctx) => {
  const v = ctx.variant % 4;
  const k = kit();
  const post = ctx.mat('chainLink', { lightUp: 0.5, bands: [-0.4, 0.3], convex: 0.3, noShadowReceive: true });
  const link = ctx.mat('chainLink', {
    ...SIGN_FACE,
    ramp: [0x7e8a98, 0x5e6880, 0x3c4262],
    tones: LINK_TONES,
    elem: { kind: 'planks', seam: 1, hi: 0, p: [1, 0, 0, 4 * D] },
    toneW: [0.1, 0.1],
    edge: 0.3,
    convex: 0.1,
  });
  const screen = ctx.mat('windscreenOld', {
    ...SIGN_FACE,
    ramp: SCREEN,
    tones: SCREEN_TONES,
    elem: TOWN_EL.windscreenOld,
  });
  const screenTop = ctx.mat('windscreenOld', { ...SIGN_FACE, ramp: SCREEN_TOP });
  const HW = 3;
  const PW = 0.14;
  const TOP = 3.6;
  const SCR0 = 0.12;
  const SCR1 = 2.6;
  const ZL = 0; // 网带的平面
  const ZS = 0.045; // 挡风布的平面（挂在网外面）
  // 立柱（两头）+ 顶横杆
  for (const s of [-1, 1]) k.bx(post, PW, TOP + 0.05, PW, s * HW, 0, 0);
  k.bx(post, 2 * HW, 0.09, 0.09, 0, TOP - 0.09, 0);

  /** 一块挡风布（矩形 x0..x1，y0..y1）+ 上沿晒白一行 */
  const screenRect = (x0: number, x1: number, y0 = SCR0, y1 = SCR1) => {
    k.vq(screen, x0, x1, y0, y1 - R, ZS, true);
    k.vq(screenTop, x0, x1, y1 - R, y1, ZS, true);
  };

  if (v === 0) {
    k.vq(link, -HW, HW, 0.05, TOP - 0.09, ZL, true);
    screenRect(-HW, HW);
  } else if (v === 1) {
    k.vq(link, -HW, HW, 0.05, TOP - 0.09, ZL, true);
    // 挡风布：上沿 −0.5…1.7 撕开一个 V 形口子，口子的边是锯齿
    const tear: V2[] = [
      [1.7, SCR1],
      [1.42, 2.28],
      [1.2, 2.36],
      [0.96, 1.98],
      [0.7, 2.06],
      [0.5, 1.62],
      [0.26, 1.7],
      [0.02, 1.96],
      [-0.22, 2.2],
      [-0.5, SCR1],
    ];
    const outline: V2[] = [[-HW, SCR0], [HW, SCR0], [HW, SCR1], ...tear, [-HW, SCR1]];
    k.add(vpoly(outline, ZS), screen);
    k.add(vpolyBack(outline, ZS - 0.005), screen);
    // 上沿晒白：口子两边各一段
    k.vq(screenTop, -HW, -0.5, SCR1 - R, SCR1, ZS + 0.004, true);
    k.vq(screenTop, 1.7, HW, SCR1 - R, SCR1, ZS + 0.004, true);
    // 撕下来的那片：从口子底下倒挂着垂下去，往东歪一点；原来的上沿（晒白）翻到了最下面
    const flap: V2[] = [
      [0.12, 1.66],
      [0.62, 1.64],
      [0.82, 0.86],
      [0.74, 0.7],
      [0.36, 0.72],
    ];
    // 下端往外（+z）翘 20°：和后面的挡风布之间有深度差（出描边）、朝上一点（亮一点）；露出来的是布的背面（褪得更黄）
    const hang = new THREE.Matrix4()
      .makeTranslation(0, 1.65, ZS + 0.03)
      .multiply(new THREE.Matrix4().makeRotationX((-20 * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeTranslation(0, -1.65, 0));
    const back = ctx.mat('windscreenOld', { ...SIGN_FACE, ramp: SCREEN_BACK });
    k.add(vpoly(flap, 0).applyMatrix4(hang), back);
    k.add(vpoly(clipRect(flap, -HW, HW, 0, 0.72 + R), 0.004).applyMatrix4(hang), screenTop);
  } else if (v === 2) {
    k.vq(link, -HW, HW, 0.05, TOP - 0.09, ZL, true);
    // 顶上残留的一小截挡风布（扎带还挂着），下沿撕得不齐
    const rag: V2[] = [
      [-2.86, SCR1],
      [-1.9, SCR1],
      [-1.98, 2.36],
      [-2.24, 2.42],
      [-2.4, 2.2],
      [-2.7, 2.3],
      [-2.86, 2.18],
    ];
    k.add(vpoly(rag, ZS), screen);
    k.add(vpolyBack(rag, ZS - 0.005), screen);
    k.vq(screenTop, -2.86, -1.9, SCR1 - R, SCR1, ZS + 0.004, true);
  } else {
    // 门：门洞 −0.9…0.9、高 2.2；门洞两边照常（网带 + 挡风布），门洞上面接着网带
    const G = 0.9;
    const GH = 2.2;
    k.vq(link, -HW, -G, 0.05, TOP - 0.09, ZL, true);
    k.vq(link, G, HW, 0.05, TOP - 0.09, ZL, true);
    k.vq(link, -G, G, GH, TOP - 0.09, ZL, true);
    screenRect(-HW + PW / 2, -G);
    screenRect(G, HW - PW / 2);
    for (const s of [-1, 1]) k.bx(post, 0.16, TOP, 0.16, s * G, 0, 0); // 门柱
    k.bx(post, 2 * G, 0.09, 0.09, 0, GH, 0); // 门楣
    // 铰链（西门柱）、门闩（东门柱）
    const hw = ctx.mat('ironwork', { noShadowReceive: true });
    for (const y of [0.35, 1.75]) k.bx(hw, 0.08, 0.1, 0.22, -G + 0.1, y, 0.02);
    k.bx(hw, 0.06, 0.12, 0.16, G - 0.1, 1.05, 0.02);
    // 门扇：管框 + 网，铰在西门柱上，往场里开 70°
    const LEAF = 1.72;
    const LH = 2.1;
    const T2 = 0.07;
    const leaf: THREE.BufferGeometry[] = [];
    const leafLink: THREE.BufferGeometry[] = [];
    const frame = (x0: number, x1: number, y0: number, y1: number) => {
      leaf.push(new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, 0.02));
      leaf.push(
        new THREE.PlaneGeometry(x1 - x0, y1 - y0).rotateY(Math.PI).translate((x0 + x1) / 2, (y0 + y1) / 2, -0.02),
      );
    };
    frame(0.06, 0.06 + T2, 0.08, LH);
    frame(LEAF - T2, LEAF, 0.08, LH);
    frame(0.06, LEAF, LH - T2, LH);
    frame(0.06, LEAF, 0.08, 0.08 + T2);
    frame(0.06, LEAF, 1.1, 1.1 + T2 * 0.8); // 中间一道横管
    leafLink.push(new THREE.PlaneGeometry(LEAF - 0.06, LH - 0.08).translate((LEAF + 0.06) / 2, (LH + 0.08) / 2, 0));
    leafLink.push(
      new THREE.PlaneGeometry(LEAF - 0.06, LH - 0.08)
        .rotateY(Math.PI)
        .translate((LEAF + 0.06) / 2, (LH + 0.08) / 2, -0.004),
    );
    const swing = new THREE.Matrix4()
      .makeRotationY((70 * Math.PI) / 180)
      .premultiply(new THREE.Matrix4().makeTranslation(-G + 0.08, 0, 0));
    for (const g of leaf) k.add(g.applyMatrix4(swing), post);
    for (const g of leafLink) k.add(g.applyMatrix4(swing), link);
  }
  return meshes(ctx, k.parts, 'all');
};

// ════════════════════════════ park-light：灯杆 ════════════════════════════

/**
 * park-light 1.6 × 9 × 0.6（v0：9 米镀锌杆 + 横担 + 两个方灯头，灯面朝 +z、往下压 12° —— 组装时转过去对着场里；
 * v1：对墙那根 6 米单头老路灯，弯臂往 −x 伸 1.3 米，灯罩歪一点）。
 * 夜里：灯面换成自发光的一份（userData.night.setOn），地上一个灯光圈（v0 在本地 (0, 7)、半径 10；v1 在 (−3, −4)、半径 7）。
 * 整件不投影（9 米的杆傍晚是一条横穿画面的黑线）。
 */
const parkLight: AssetFn = (ctx) => {
  const v = ctx.variant % 2;
  const k = kit();
  const base = ctx.mat('concrete');
  const pole = ctx.mat('chainLink', { lightUp: 0.5, bands: [-0.4, 0.3], convex: 0.3, noShadowReceive: true });
  const head = ctx.mat('ironwork', { noShadowReceive: true });
  const lens = ctx.mat('signPaint', { lightUp: 0.5, bands: [-0.4, 0.3], noShadowReceive: true });
  const lensNight = ctx.mat('signPaint', { emissive: 0x7a6a40, noShadowReceive: true });
  const pools: THREE.Object3D[] = [];
  if (v === 0) {
    k.bx(base, 0.45, 0.35, 0.45, 0, 0, 0);
    k.bx(pole, 2 * D, 8.55, 2 * D, 0, 0.35, 0);
    k.bx(pole, 1.6, 0.12, 0.12, 0, 8.7, 0); // 横担
    // 两个方灯头：盒子 + 正面一块灯面，整体往下压 12°（灯面朝 +z 偏下）
    for (const s of [-1, 1]) {
      const tilt = new THREE.Matrix4()
        .makeRotationX((12 * Math.PI) / 180)
        .premultiply(new THREE.Matrix4().makeTranslation(s * 0.52, 8.55, 0.1));
      k.add(box5(0.54, 0.4, 0.22).applyMatrix4(tilt), head);
      k.add(new THREE.PlaneGeometry(0.44, 0.3).translate(0, -0.02, 0.115).applyMatrix4(tilt), lens);
    }
    pools.push(poolAt(0, 7, 10, 3));
  } else {
    // 老路灯：细一点的杆，顶上弯臂（三段折线）往 −x，灯罩往 +z、−x 歪一点，底下一个玻璃灯碗
    k.bx(base, 0.36, 0.3, 0.36, 0, 0, 0);
    k.bx(pole, 0.16, 5.7, 0.16, 0, 0.3, 0);
    k.bx(pole, 1.42, 0.1, 0.1, -0.66, 5.9, 0); // 横臂
    // 斜撑：杆上 5.35 → 臂下 x −0.75
    const br = Math.hypot(0.75, 0.55);
    k.add(
      box5(br, 0.09, 0.08)
        .rotateZ(Math.atan2(0.55, -0.75))
        .translate(-0.375, 5.35 + 0.275, 0),
      pole,
    );
    const tilt = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler((-14 * Math.PI) / 180, 0, (8 * Math.PI) / 180))
      .premultiply(new THREE.Matrix4().makeTranslation(-1.42, 5.88, 0.02));
    k.add(box5(0.66, 0.15, 0.36).applyMatrix4(tilt), head); // 灯罩
    k.add(box5(0.46, 0.18, 0.26).translate(0, -0.16, 0).applyMatrix4(tilt), lens); // 灯碗
    pools.push(poolAt(-3, -4, 7, 2.5));
  }
  const g = meshes(ctx, k.parts, 'all');
  nightSwap(g, [[lens, lensNight]], pools);
  return g;
};

// ════════════════════════════ park-closed-sign：围网上的封场牌 ════════════════════════════

/**
 * park-closed-sign 1.3 × 0.8 × 0.06：橙底封场牌（牌心 1.3 米高，挂在围网上；本地 z 0 = 围网朝外那面），
 * 一行奶油色 5×7 字 "CLOSED"（G4），四角四个黑扎带。朝镜头 → 招牌那套光照落中档。
 */
const parkClosedSign: AssetFn = (ctx) => {
  const k = kit();
  const board = ctx.mat('toolOrange', { ...SIGN_FACE, convex: 0.3 });
  const tie = ctx.mat('ironwork', { noShadowReceive: true });
  const CY = 1.3;
  k.bx(board, 1.3, 0.84, 0.03, 0, CY - 0.42, 0.015);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      k.vq(tie, sx * 0.58 - 0.035, sx * 0.58 + 0.035, CY + sy * 0.33 - R, CY + sy * 0.33 + R, 0.034);
  const g = meshes(ctx, k.parts, 'all');
  g.add(textCard(ctx, 'signPaint', ['CLOSED'], 0, CY, 0.033));
  return g;
};

// ════════════════════════════ park-barricade：锯马路障 ════════════════════════════

/**
 * park-barricade 2.6 × 1.4 × 0.6：一块橙白斜条的横板（0.72…1.0 米）+ 两头的 A 字腿（风化的木头）+ 前腿之间一根低横撑，
 * 横板上面立着一块蓝底小牌 "CLOSED"（两根扎带扎在横板上）。横板、小牌投影，腿不投影（细）。
 */
const parkBarricade: AssetFn = (ctx) => {
  const k = kit();
  // 橙色落亮档、白条落中档（招牌光照）：橙 L ~160 对白条 L ~190，斜条的交界不出强边缘（橙中档 L 123 对白 196 差 73）
  const orange = ctx.mat('toolOrange', {
    lightUp: 0.6,
    bands: [-0.9, -0.5],
    noShadowReceive: true,
    convex: 0.3,
    elem: { kind: 'paint', size: [10, 4] },
  });
  const white = ctx.mat('clothWhite', { ...SIGN_FACE, convex: 0.3 });
  const wood = ctx.mat('woodWeathered', { convex: 0.3, noShadowReceive: true });
  const sign = ctx.mat('signBoard', { ...SIGN_FACE, convex: 0.3 });
  const tie = ctx.mat('ironwork', { noShadowReceive: true });
  const W = 2.6;
  const Y0 = 0.72;
  const Y1 = 1.0;
  const BD = 0.05;
  // 横板
  k.bx(orange, W, Y1 - Y0, BD, 0, Y0, 0);
  // 斜条：白条宽 3 纹素、周期 6 纹素，往右上斜 45°（屏幕上），裁到板面里
  const P = 6 * D;
  const SW = 3 * D;
  const H = Y1 - Y0;
  for (let x = -W / 2 - H; x < W / 2; x += P) {
    const strip = clipRect(
      [
        [x, Y0],
        [x + SW, Y0],
        [x + SW + H, Y1],
        [x + H, Y1],
      ],
      -W / 2,
      W / 2,
      Y0,
      Y1,
    );
    if (strip.length >= 3) k.add(vpoly(strip, BD / 2 + 0.004), white);
  }
  // A 字腿：两头各两条（前后张开 ±0.28），顶在横板底下
  const LEG = 0.09;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const a = Math.atan2(0.28, Y0);
      const len = Math.hypot(0.28, Y0) + 0.04;
      // 前后张开 ±0.28，往外（±x）也撇 0.1
      const leg = box5(LEG, len, 0.06)
        .translate(0, -len / 2, 0)
        .rotateX(sz * a)
        .rotateZ(sx * Math.atan2(0.1, Y0))
        .translate(sx * 1.05, Y0 + 0.02, 0);
      k.add(leg, wood);
    }
  // 前腿之间一根低横撑；腿顶上一块横木托着横板
  k.bx(wood, 2.18, 0.08, 0.05, 0, 0.3, 0.17);
  for (const sx of [-1, 1]) k.bx(wood, 0.16, 0.06, 0.12, sx * 1.05, Y0 - 0.06, 0);
  // 小牌：横板上面，略偏西
  const SX = -0.15;
  k.bx(sign, 1.16, 0.4, 0.03, SX, Y1, 0.01);
  for (const s of [-1, 1]) k.vq(tie, SX + s * 0.42 - 0.04, SX + s * 0.42 + 0.04, Y1 - 0.08, Y1 + 0.06, BD / 2 + 0.01);
  // 小牌上不写字（G4：1.16 米宽放不下一行 5×7 的 CLOSED；3×5 的小字是噪点）—— 橙白斜条自己就是"封了"
  return meshes(ctx, k.parts, [wood, tie]);
};

export const ASSETS: Record<string, AssetFn> = {
  'park-court': parkCourt,
  'park-court-bed': parkCourtBed,
  'park-net': parkNet,
  'park-fence': parkFence,
  'park-light': parkLight,
  'park-closed-sign': parkClosedSign,
  'park-barricade': parkBarricade,
};
