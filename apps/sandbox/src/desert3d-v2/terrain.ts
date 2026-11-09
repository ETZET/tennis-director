// 地形：浮空岛 + 几层台地（顶面 ShapeGeometry + 竖直崖壁）+ 绿洲池 + 台阶 + 步道。
// 崖壁 uv：x = 沿墙长度（米），y = 离墙顶多深（米）。崖壁一律下到低地以下（被前面的顶面挡住），岛外沿再往下接岛底。
import * as THREE from 'three';
import {
  COURT_TERRACE,
  EAST_TERRACE,
  H,
  ISLAND,
  MESA,
  NORTH_TERRACE,
  PATHS,
  POOL,
  STAIRS,
  type V2,
  WEST_TERRACE,
} from './layout';
import { vnoise } from './noise';
import { EL } from './palette';
import type { AssetCtx } from './world';

/** 闭合折线按 Catmull-Rom 平滑重采样（间距约 step 米）+ 一点抖动 */
export function smoothLoop(pts: V2[], step: number, rnd: () => number, jitter = 0.05): V2[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const n = Math.max(8, Math.round(curve.getLength() / step));
  return curve
    .getSpacedPoints(n)
    .slice(0, n)
    .map((p) => [p.x + (rnd() - 0.5) * jitter, p.z + (rnd() - 0.5) * jitter] as V2);
}

export function smoothLine(pts: V2[], step: number): V2[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
  );
  const n = Math.max(4, Math.round(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z] as V2);
}

const area = (pts: V2[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
};

/** 水平顶面（y = h），可带洞 */
export function topGeo(pts: V2[], h: number, holes: V2[][] = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, h, 0);
  g.deleteAttribute('uv');
  return g;
}

/**
 * 竖直墙：沿闭合轮廓从 h 到 hb；outward = 法线朝多边形外。
 * expo（可选）：按墙顶点 (x, z) 和朝外法线算"这段墙在画面上露出多高"（米），写进 aElem.x（材质规范 v2 的矮墙规则用）
 */
export function wallGeo(
  pts: V2[],
  h: number,
  hb: number,
  outward: boolean,
  depth0 = 0,
  expo?: (x: number, z: number, nx: number, nz: number) => number,
): THREE.BufferGeometry {
  const ccw = area(pts) > 0;
  const n = pts.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const ex: number[] = [];
  const idx: number[] = [];
  const segN = (i: number): V2 => {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % n];
    const l = Math.hypot(x1 - x0, z1 - z0) || 1;
    let nx = (z1 - z0) / l;
    let nz = -(x1 - x0) / l;
    if (!ccw) [nx, nz] = [-nx, -nz];
    if (!outward) [nx, nz] = [-nx, -nz];
    return [nx, nz];
  };
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const a = segN((i - 1 + n) % n);
    const b = segN(i % n);
    const nx = a[0] + b[0];
    const nz = a[1] + b[1];
    const l = Math.hypot(nx, nz) || 1;
    if (i > 0) {
      const q = pts[i - 1];
      s += Math.hypot(p[0] - q[0], p[1] - q[1]);
    }
    pos.push(p[0], h, p[1], p[0], hb, p[1]);
    nor.push(nx / l, 0, nz / l, nx / l, 0, nz / l);
    uv.push(s, depth0, s, depth0 + h - hb);
    if (expo) {
      const e = expo(p[0], p[1], nx / l, nz / l);
      ex.push(e, 0, 0, 0, e, 0, 0, 0);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    if (ccw === outward) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (expo) g.setAttribute('aElem', new THREE.Float32BufferAttribute(ex, 4));
  g.setIndex(idx);
  return g;
}

/** 带状多边形（步道）：中线左右各偏 w/2，边沿按世界坐标起伏一点 */
function ribbon(line: V2[], w: number): V2[] {
  const L: V2[] = [];
  const R: V2[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const [x, z] = line[i];
    const k = w / 2;
    const wl = k * (0.88 + 0.24 * vnoise(x * 0.6, z * 0.6, 301));
    const wr = k * (0.88 + 0.24 * vnoise(x * 0.6, z * 0.6, 302));
    L.push([x - (dz / l) * wl, z + (dx / l) * wl]);
    R.push([x + (dz / l) * wr, z - (dx / l) * wr]);
  }
  return [...L, ...R.reverse()];
}

export interface Terrain {
  root: THREE.Group;
  /** 低地顶面轮廓（平滑后），画廊/布置用 */
  outlines: Record<string, V2[]>;
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const rnd = ctx.rng('terrain:outline');
  const LIP = ctx.texel * 1.2; // 一纹素多一点的亮边

  const island = smoothLoop(ISLAND, 0.6, rnd, 0.1);
  const pool = smoothLoop(POOL, 0.35, rnd, 0.03);
  const levels: { id: string; pts: V2[]; h: number; mat: 'sand' | 'sandHigh' }[] = [
    { id: 'court', pts: smoothLoop(COURT_TERRACE, 0.5, rnd), h: H.court, mat: 'sand' },
    { id: 'east', pts: smoothLoop(EAST_TERRACE, 0.5, rnd), h: H.west, mat: 'sandHigh' },
    { id: 'west', pts: smoothLoop(WEST_TERRACE, 0.5, rnd), h: H.west, mat: 'sandHigh' },
    { id: 'north', pts: smoothLoop(NORTH_TERRACE, 0.5, rnd), h: H.north, mat: 'sandHigh' },
    { id: 'mesa', pts: smoothLoop(MESA, 0.5, rnd), h: H.mesa, mat: 'sandHigh' },
  ];
  // 某点的地面高度（最高的那层台面；池里是水面，岛外是岛底）—— 算每段崖壁在画面上露出多高
  const byHeight = [...levels].sort((a, b) => b.h - a.h);
  const groundAt = (x: number, z: number) => {
    const p: V2 = [x, z];
    for (const L of byHeight) if (insidePoly(p, L.pts)) return L.h;
    if (insidePoly(p, pool)) return H.water;
    return insidePoly(p, island) ? H.low : H.skirt;
  };
  const expoOf = (top: number) => (x: number, z: number, nx: number, nz: number) =>
    Math.max(0, top - groundAt(x + nx * 0.35, z + nz * 0.35));

  // ── 材质规范 v2：大面积表面的元素（预设在 palette.ts 的 EL，资产也可以拿来用） ──
  const sandEl = EL.sand;
  const cliffMat = ctx.mat('cliff', { elem: EL.strata });
  const lipMat = ctx.mat('cliffLip');

  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };

  // 低地（岛顶）+ 池子的洞
  add(topGeo(island, H.low, [pool]), ctx.mat('sand', { elem: sandEl }), 'top:low');
  // 岛外沿：亮边 + 崖壁 + 收拢的岛底
  add(wallGeo(island, H.low, H.low - LIP, true), lipMat, 'lip:island');
  add(
    wallGeo(island, H.low - LIP, H.skirt, true, 0, () => H.low - H.skirt),
    cliffMat,
    'wall:island',
  );
  add(undersideGeo(island), ctx.mat('underside', { side: THREE.DoubleSide }), 'underside');

  // 各层台地：顶面 + 亮边 + 崖壁（下到低地以下，被前面的顶面挡住）
  for (const L of levels) {
    add(topGeo(L.pts, L.h), ctx.mat(L.mat, { elem: { ...sandEl, seed: L.h } }), `top:${L.id}`);
    add(wallGeo(L.pts, L.h, L.h - LIP, true), lipMat, `lip:${L.id}`);
    add(wallGeo(L.pts, L.h - LIP, H.low - 0.3, true, 0, expoOf(L.h)), cliffMat, `wall:${L.id}`);
  }

  // 绿洲池：池壁（朝池里，0.7 米 = 矮墙）+ 水面（一块格子网格，顶点带"到北岸/到岸的距离"）+ 贴着岸脚的泡沫虚线
  add(wallGeo(pool, H.low, H.low - LIP, false), lipMat, 'lip:pool');
  add(
    wallGeo(pool, H.low - LIP, H.water - 0.4, false, 0, () => H.low - H.water),
    cliffMat,
    'wall:pool',
  );
  add(waterGeo(pool, H.water), ctx.mat('water', { elem: EL.water }), 'water');
  const foam = ringInside(pool, ctx.texel * 1.1);
  add(topGeo(pool, H.water + 0.005, [foam]), ctx.mat('foam', { elem: EL.foam }), 'foam');

  // 台阶：每级踏面分几段石条、前沿磨亮条、立面顶上一行暗线（描边压到 0.18 / 0.25，不然凸边白线盖掉纹理）
  const { x0: sx0, z0: sz0, steps, run, from, to } = STAIRS;
  add(
    stairsGeo(),
    ctx.mat('stair', {
      edge: 0.18,
      convex: 0.25,
      elem: { kind: 'treads', size: [6, 14], p: [sx0, sz0, 0, 1 / run], q: [steps, from, (from - to) / steps, 0] },
    }),
    'stairs',
  );

  // 步道：踩实的钙质土（大块土团、少数地方有裂缝、脚印、嵌着的碎石）
  const pathMat = ctx.mat('path', { elem: EL.path });
  for (const [i, p] of PATHS.entries()) {
    const line = smoothLine(p.pts, 0.4);
    add(topGeo(ribbon(line, p.w), p.level + 0.01), pathMat, `path:${i}`);
  }

  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) {
    // 崖壁、台阶不接收投影：朝镜头的立面永远是干净的暗档，台阶踏面永远是干净的亮档（不起毛）
    if (m.name.startsWith('wall:') || m.name.startsWith('lip:') || m.name === 'underside' || m.name === 'stairs')
      m.receiveShadow = false;
    if (m.name.startsWith('path') || m.name === 'water' || m.name === 'foam') m.castShadow = false;
  }
  const outlines: Record<string, V2[]> = { island, pool };
  for (const L of levels) outlines[L.id] = L.pts;
  return { root, outlines };
}

function insidePoly(p: V2, poly: V2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/**
 * 水面：盖住池子包围盒的一块格子（池外的部分被地面、池壁挡住），顶点 aElem = [往北到岸的距离, 到岸的距离]（米），
 * 水面材质（elem water）靠它画北岸脚下的天光亮带和中间的深水
 */
function waterGeo(pool: V2[], y: number): THREE.BufferGeometry {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pool) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const m = 0.4;
  const g = new THREE.PlaneGeometry(
    x1 - x0 + 2 * m,
    z1 - z0 + 2 * m,
    Math.ceil((x1 - x0) / 0.2),
    Math.ceil((z1 - z0) / 0.2),
  );
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const ex = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let north = 0;
    let shore = 0;
    if (insidePoly([x, z], pool)) {
      // 往北（−z）第一个和池岸的交点
      let best = Infinity;
      shore = Infinity;
      for (let k = 0; k < pool.length; k++) {
        const [ax, az] = pool[k];
        const [bx, bz] = pool[(k + 1) % pool.length];
        if (ax > x !== bx > x) {
          const zc = az + ((x - ax) / (bx - ax)) * (bz - az);
          if (zc < z) best = Math.min(best, z - zc);
        }
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        shore = Math.min(shore, Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
      north = Number.isFinite(best) ? best : 0;
    }
    ex.set([north, shore, 0, 0], i * 4);
  }
  g.setAttribute('aElem', new THREE.BufferAttribute(ex, 4));
  return g;
}

/** 往多边形里缩 d 米（按顶点法线，小 d 够用） */
function ringInside(pts: V2[], d: number): V2[] {
  const ccw = area(pts) > 0;
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    // 朝外法线 (dz, -dx)（ccw 时），往里 = 反向
    const s = ccw ? -1 : 1;
    return [p[0] + ((s * dz) / l) * d, p[1] + ((s * -dx) / l) * d] as V2;
  });
}

/** 岛底：外沿一圈往下、往里收，带参差的尖 */
function undersideGeo(island: V2[]): THREE.BufferGeometry {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of island) {
    cx += x;
    cz += z;
  }
  cx /= island.length;
  cz /= island.length;
  const K = island.length;
  const rings: THREE.Vector3[][] = [];
  const steps: [number, number][] = [
    [1.0, H.skirt],
    [0.9, H.skirt - 1.6],
    [0.72, H.skirt - 3.6],
    [0.45, H.skirt - 6.0],
    [0.12, H.bottom],
  ];
  steps.forEach(([k, y], s) => {
    rings.push(
      island.map(([x, z], i) => {
        const jag = s === 0 ? 0 : (vnoise(i * 0.25, s * 3.1, 501) - 0.5) * 1.6 * s;
        const kk = s === 0 ? 1 : k * (0.94 + 0.12 * vnoise(i * 0.18, s, 502));
        return new THREE.Vector3(cx + (x - cx) * kk, y - Math.max(0, jag), cz + (z - cz) * kk);
      }),
    );
  });
  const pos: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r];
    const B = rings[r + 1];
    for (let i = 0; i < K; i++) {
      const j = (i + 1) % K;
      pos.push(...A[i].toArray(), ...B[i].toArray(), ...B[j].toArray());
      pos.push(...A[i].toArray(), ...B[j].toArray(), ...A[j].toArray());
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // 法线朝外（离岛中心）
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) {
    const ox = p.getX(i) - cx;
    const oz = p.getZ(i) - cz;
    if (nrm.getX(i) * ox + nrm.getZ(i) * oz < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  }
  return g;
}

/** 台阶：每级一个盒子（往墙里多伸 0.3 米，免得露缝） */
function stairsGeo(): THREE.BufferGeometry {
  const { x0, x1, z0, steps, run, from, to } = STAIRS;
  const rise = (from - to) / steps;
  const geos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < steps; k++) {
    const top = from - rise * (k + 1);
    const za = z0 - 0.3;
    const zb = z0 + run * (k + 1);
    const hgt = top - (to - 0.1);
    const b = new THREE.BoxGeometry(x1 - x0, hgt, zb - za);
    b.translate((x0 + x1) / 2, to - 0.1 + hgt / 2, (za + zb) / 2);
    geos.push(b.toNonIndexed());
  }
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of geos) {
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
