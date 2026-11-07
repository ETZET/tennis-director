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
import { vnoise, white } from './noise';
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

/** 竖直墙：沿闭合轮廓从 h 到 hb；outward = 法线朝多边形外 */
export function wallGeo(pts: V2[], h: number, hb: number, outward: boolean, depth0 = 0): THREE.BufferGeometry {
  const ccw = area(pts) > 0;
  const n = pts.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
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

/** 崖壁石纹贴图（乘在三档上，接近白）：横向岩层 + 少量竖缝，按纹素画 */
function strataTexture(texel: number): { tex: THREE.DataTexture; metres: number } {
  const N = 64;
  const d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      // 岩层：每 5～7 纹素一条暗缝，缝高度沿墙缓慢起伏
      const wob = Math.round((vnoise(i / 9, 0, 401) - 0.5) * 2);
      const row = j + wob;
      const layer = Math.floor(row / 6);
      const seam = row % 6 === 5;
      // 竖缝：每层几条，错开
      const jointAt = Math.floor(white(Math.floor(i / 11), layer, 402) * 11);
      const joint = i % 11 === jointAt && !seam;
      // 每层整体明暗略有不同（大块，不是噪点）
      const tone = 0.93 + 0.07 * white(layer, 0, 403);
      const v = seam || joint ? 0.8 : tone;
      const k = (j * N + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = Math.round(v * 255);
      d[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return { tex, metres: N * texel };
}

/** uv 从米换成贴图周期 */
function scaleUv(g: THREE.BufferGeometry, metres: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / metres, uv.getY(i) / metres);
  return g;
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
  const { tex, metres } = strataTexture(ctx.texel);
  const cliffMat = ctx.mat('cliff', { map: tex });
  const lipMat = ctx.mat('cliffLip');
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

  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };

  // 低地（岛顶）+ 池子的洞
  add(topGeo(island, H.low, [pool]), ctx.mat('sand'), 'top:low');
  // 岛外沿：亮边 + 崖壁 + 收拢的岛底
  add(wallGeo(island, H.low, H.low - LIP, true), lipMat, 'lip:island');
  add(scaleUv(wallGeo(island, H.low - LIP, H.skirt, true, LIP), metres), cliffMat, 'wall:island');
  add(undersideGeo(island), ctx.mat('underside', { side: THREE.DoubleSide }), 'underside');

  // 各层台地：顶面 + 亮边 + 崖壁（下到低地以下，被前面的顶面挡住）
  for (const L of levels) {
    add(topGeo(L.pts, L.h), ctx.mat(L.mat), `top:${L.id}`);
    add(wallGeo(L.pts, L.h, L.h - LIP, true), lipMat, `lip:${L.id}`);
    add(scaleUv(wallGeo(L.pts, L.h - LIP, H.low - 0.3, true, LIP), metres), cliffMat, `wall:${L.id}`);
  }

  // 绿洲池：池壁（朝池里）+ 水面 + 贴着岸脚的一纹素泡沫
  add(wallGeo(pool, H.low, H.low - LIP, false), lipMat, 'lip:pool');
  add(scaleUv(wallGeo(pool, H.low - LIP, H.water - 0.4, false, LIP), metres), cliffMat, 'wall:pool');
  add(topGeo(pool, H.water), ctx.mat('water'), 'water');
  const foam = ringInside(pool, ctx.texel * 1.1);
  add(topGeo(pool, H.water + 0.005, [foam]), ctx.mat('foam'), 'foam');

  // 台阶
  add(stairsGeo(), ctx.mat('stair'), 'stairs');

  // 步道
  for (const [i, p] of PATHS.entries()) {
    const line = smoothLine(p.pts, 0.4);
    add(topGeo(ribbon(line, p.w), p.level + 0.01), ctx.mat('path'), `path:${i}`);
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
