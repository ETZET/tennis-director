// valley 的山：山谷四周的高度场网格（高度在 terrain.ts 的 mountainY）。山不投影、不受投影（同 clubsite/mountains.ts：
// 投影相机只罩着总监周围，受影的话山上会切出硬边的块，太阳一动、总监一走就跟着闪）。锁区域压暗时山不变（归 'none'）。
//
// 网格分三档细：12 米一格的底子；离平地边 ~90 米以内、步道附近 4 米一格（默认镜头、拉远 2× 看得到的岩坡）；步道和观景台
// 两边 2 米一格（三角形不拱起来盖住路面）。细格和粗格接的那条边上，细格多出来的点放在粗格的边上（不裂缝）。
// 格点按种子抖一点、每个小方格按"顺着山脊"挑对角线 → 没有一眼看得出的方格、台阶纹。
//
// 三道山梁三个材质（mountainY 的 info.layer）：近的暖玫瑰褐、主山梁浅一点、最外最高的更浅更灰（空气），色阶同
// clubsite/mountains.ts 的 near / mid / far。
import * as THREE from 'three';
import { EL, type MapCtx } from './reuse';
import { CLUB_BOX, floorDist, HF, type MountainInfo, mountainY, trailDist } from './terrain';

export type Ramp = [number, number, number];
/** 近的那道（山脚、山包）的色阶；build.ts 压暗用 */
export const MTN_RAMP: Ramp = [0xcc8a74, 0x9c6468, 0x5c4280];
/** 三道山梁的材质：越远越浅、越灰，明暗差越小（lightUp 大、亮档门槛高） */
const LAYER_MATS: { ramp: Ramp; edge: number; lightUp: number; bands: [number, number] }[] = [
  { ramp: MTN_RAMP, edge: 0.3, lightUp: 0.1, bands: [0.15, 0.68] },
  { ramp: [0xd89c8c, 0xae7880, 0x6c5488], edge: 0.3, lightUp: 0.15, bands: [0.18, 0.7] },
  { ramp: [0xe6bcb2, 0xc8a0a8, 0x9688b0], edge: 0.22, lightUp: 0.2, bands: [0.2, 0.76] },
];

/** 最细一档每个 12 米粗格分几份（2 米）；其余档是它的约数 */
const G = 6;
/** 一块（剔除单位）多少个粗格 */
const CHUNK = 24;

/** 整数格上的哈希 → [0, 1) */
function hash(i: number, j: number, seed: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type P3 = [number, number, number];
/** 凸多边形按半平面 a·x + b·z ≤ c 切（y 沿边线性插值） */
function clipHalf(poly: P3[], a: number, b: number, c: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = a * p[0] + b * p[2] - c;
    const dq = a * q[0] + b * q[2] - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    }
  }
  return out;
}
/**
 * 三角形去掉 CLUB_BOX 里面的部分（俱乐部那块的地面、山归 clubwalk 的各区域）：盒子外面切成四个凸块
 * （西、东、盒子正北、盒子正南），三角形和每块求交
 */
function outsideClub(tri: P3[]): P3[][] {
  const { x0, x1, z0, z1 } = CLUB_BOX;
  const xs = tri.map((p) => p[0]);
  const zs = tri.map((p) => p[2]);
  if (Math.max(...xs) <= x0 || Math.min(...xs) >= x1 || Math.max(...zs) <= z0 || Math.min(...zs) >= z1) return [tri];
  const regions: [number, number, number][][] = [
    [[1, 0, x0]],
    [[-1, 0, -x1]],
    [
      [-1, 0, -x0],
      [1, 0, x1],
      [0, 1, z0],
    ],
    [
      [-1, 0, -x0],
      [1, 0, x1],
      [0, -1, -z1],
    ],
  ];
  const out: P3[][] = [];
  for (const planes of regions) {
    let poly = tri;
    for (const [a, b, c] of planes) {
      poly = clipHalf(poly, a, b, c);
      if (poly.length < 3) break;
    }
    if (poly.length >= 3) out.push(poly);
  }
  return out;
}
/** 推一个三角形（先去掉俱乐部那块），面朝上（从上往下看逆时针） */
function pushTri(pos: number[], a: P3, b: P3, c: P3): void {
  for (const poly of outsideClub([a, b, c]))
    for (let k = 1; k + 1 < poly.length; k++) {
      const [p, q, r] = [poly[0], poly[k], poly[k + 1]];
      const ny = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
      if (Math.abs(ny) < 1e-9) continue;
      if (ny > 0) pos.push(...p, ...q, ...r);
      else pos.push(...p, ...r, ...q);
    }
}

interface Vtx {
  x: number;
  y: number;
  z: number;
  layer: number;
}

/** 山的三角形（按块、按山梁分好）：纯数据，网格和测试都用 */
export function mountainTris(): { chunk: number; layer: number; pos: number[] }[] {
  const { x0, z0, cell } = HF;
  const nx = Math.ceil((HF.x1 - HF.x0) / cell);
  const nz = Math.ceil((HF.z1 - HF.z0) / cell);
  // 每个粗格分几份：步道两边 6（2 米）、山脚一圈和步道附近 3（4 米）、其余 1；整格在平地里的 1（全在地下，不画）
  const S = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * cell;
      const cz = z0 + (j + 0.5) * cell;
      const d = floorDist(cx, cz);
      const td = trailDist(cx, cz);
      S[j * nx + i] = d < -9 ? 1 : td < 22 ? 6 : d < 90 || td < 110 ? 3 : 1;
    }
  const sAt = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? 0 : S[j * nx + i]);

  // 真的格点（全局 2 米格的下标）：抖一点，高度取 mountainY。抖动按相邻粗格里最细的那档定（≤ 0.22 格，不翻三角形）
  const NX = nx * G + 1;
  const cache = new Map<number, Vtx>();
  const info: MountainInfo = { layer: 0 };
  const real = (X: number, Z: number): Vtx => {
    const key = Z * NX + X;
    const hit = cache.get(key);
    if (hit) return hit;
    const is = X % G === 0 ? [X / G - 1, X / G] : [Math.floor(X / G)];
    const js = Z % G === 0 ? [Z / G - 1, Z / G] : [Math.floor(Z / G)];
    let sMax = 1;
    for (const i of is) for (const j of js) sMax = Math.max(sMax, sAt(i, j));
    const edge = X === 0 || Z === 0 || X === nx * G || Z === nz * G;
    const amp = edge ? 0 : 0.22 * (cell / sMax);
    const x = x0 + (X * cell) / G + (hash(X, Z, 1) - 0.5) * 2 * amp;
    const z = z0 + (Z * cell) / G + (hash(X, Z, 2) - 0.5) * 2 * amp;
    const y = mountainY(x, z, info);
    const v = { x, y, z, layer: info.layer };
    cache.set(key, v);
    return v;
  };
  const lerp = (a: Vtx, b: Vtx, t: number): Vtx => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    layer: t < 0.5 ? a.layer : b.layer,
  });

  const out = new Map<number, number[]>();
  const push = (chunk: number, layer: number, a: Vtx, b: Vtx, c: Vtx) => {
    // 整个在地面以下（山脚没铺地面的格子 groundGapTiles 补了沙地）
    if (a.y < 0 && b.y < 0 && c.y < 0) return;
    const key = chunk * 4 + layer;
    let pos = out.get(key);
    if (!pos) {
      pos = [];
      out.set(key, pos);
    }
    pushTri(pos, [a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]);
  };
  // 三角形归哪道山梁：多数票，三个都不一样取最远的
  const vote = (a: Vtx, b: Vtx, c: Vtx) =>
    a.layer === b.layer || a.layer === c.layer
      ? a.layer
      : b.layer === c.layer
        ? b.layer
        : Math.max(a.layer, b.layer, c.layer);

  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const s = S[j * nx + i];
      const step = G / s;
      const chunk = Math.floor(j / CHUNK) * Math.ceil(nx / CHUNK) + Math.floor(i / CHUNK);
      // 这一格的 (s+1)² 个点；边上的点要是邻格更粗、又不在邻格的点上，就放在邻格那条边上（两头插值）
      const nb = [sAt(i - 1, j), sAt(i + 1, j), sAt(i, j - 1), sAt(i, j + 1)];
      const vAt = (a: number, b: number): Vtx => {
        const X = i * G + a * step;
        const Z = j * G + b * step;
        const onEdge = (side: number, along: number) => {
          const n = nb[side];
          if (!n || n >= s || (along * n) % s === 0) return null;
          // 邻格那条边上的两个点（本格的局部下标）
          const q = s / n;
          const lo = Math.floor(along / q) * q;
          return { lo, hi: lo + q, t: (along - lo) / q };
        };
        const corner = (a === 0 || a === s) && (b === 0 || b === s);
        if (!corner) {
          const e = a === 0 ? [0, b] : a === s ? [1, b] : b === 0 ? [2, a] : b === s ? [3, a] : null;
          if (e) {
            const r = onEdge(e[0], e[1]);
            if (r) {
              const vertical = e[0] < 2;
              const p0 = vertical ? real(X, j * G + r.lo * step) : real(i * G + r.lo * step, Z);
              const p1 = vertical ? real(X, j * G + r.hi * step) : real(i * G + r.hi * step, Z);
              return lerp(p0, p1, r.t);
            }
          }
        }
        return real(X, Z);
      };
      const row: Vtx[][] = [];
      for (let b = 0; b <= s; b++) {
        const r: Vtx[] = [];
        for (let a = 0; a <= s; a++) r.push(vAt(a, b));
        row.push(r);
      }
      for (let b = 0; b < s; b++)
        for (let a = 0; a < s; a++) {
          const p00 = row[b][a];
          const p10 = row[b][a + 1];
          const p01 = row[b + 1][a];
          const p11 = row[b + 1][a + 1];
          // 对角线顺着山脊 / 山沟：两头高差小的那条
          if (Math.abs(p00.y - p11.y) <= Math.abs(p10.y - p01.y)) {
            push(chunk, vote(p00, p10, p11), p00, p10, p11);
            push(chunk, vote(p00, p11, p01), p00, p11, p01);
          } else {
            push(chunk, vote(p00, p10, p01), p00, p10, p01);
            push(chunk, vote(p10, p11, p01), p10, p11, p01);
          }
        }
    }
  return [...out.entries()].map(([k, pos]) => ({ chunk: Math.floor(k / 4), layer: k % 4, pos }));
}

/** build.ts 的地面格子（20 米）这一格铺没铺：九个点（四角、四边中点、中心）都在山上才不铺（同 build.ts 的规则） */
function groundSkipped(ax: number, az: number): boolean {
  const T = 20;
  const cx = ax + T / 2;
  const cz = az + T / 2;
  if (cx > CLUB_BOX.x0 && cx < CLUB_BOX.x1 && cz > CLUB_BOX.z0 && cz < CLUB_BOX.z1) return false;
  if (floorDist(cx, cz) <= 0) return false;
  const pts: [number, number][] = [
    [cx, cz],
    [ax, az],
    [ax + T, az],
    [ax, az + T],
    [ax + T, az + T],
    [cx, az],
    [cx, az + T],
    [ax, cz],
    [ax + T, cz],
  ];
  return pts.every(([x, z]) => mountainY(x, z) > 0.3);
}
/** 九个点都高过 2 米的格子（深山里）：中间不会塌到地面以下，不用细查 */
function deepTile(ax: number, az: number): boolean {
  for (const u of [0, 10, 20]) for (const v of [0, 10, 20]) if (mountainY(ax + u, az + v) <= 2) return false;
  return true;
}

/**
 * 山脚没铺地面、山又钻到地面以下的格子（左下角坐标）：这里补一块沙地（低 3 厘米，地面以后铺上了也不打架），
 * 不然露出地下的岩面（一块方的橙色）或者天。build.ts 把地面规则改成"九个点都在山上才不铺"以后这里就是空的
 */
export function groundGapTiles(): [number, number][] {
  const out: [number, number][] = [];
  const T = 20;
  for (let ax = HF.x0; ax < HF.x1; ax += T)
    for (let az = HF.z0; az < HF.z1; az += T) {
      if (!groundSkipped(ax, az) || deepTile(ax, az)) continue;
      let low = false;
      for (let u = 1.25; u < T && !low; u += 2.5)
        for (let v = 1.25; v < T && !low; v += 2.5) low = mountainY(ax + u, az + v) < 0.05;
      if (low) out.push([ax, az]);
    }
  return out;
}

/** 山的网格（每块每道山梁一个，视锥外的块不画）+ 山脚补的沙地 */
export function buildMountains(ctx: MapCtx): THREE.Mesh[] {
  const mats = LAYER_MATS.map((m) =>
    ctx.mats.toon(0xffffff, { ramp: m.ramp, edge: m.edge, convex: 0, bands: m.bands, lightUp: m.lightUp }),
  );
  const out = mountainTris().map(({ layer, pos }) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats[layer]);
    m.name = 'valley:mtn';
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  });
  const gaps = groundGapTiles();
  if (gaps.length) {
    const pos: number[] = [];
    const y = -0.03;
    // 每边多伸 0.5 米压到旁边的地面格子底下：低 3 厘米的台阶边上不露出一条天的细缝；俱乐部那块切掉
    const e = 0.5;
    for (const [x, z] of gaps) {
      const [a0, a1, b0, b1] = [x - e, x + 20 + e, z - e, z + 20 + e];
      pushTri(pos, [a0, y, b0], [a0, y, b1], [a1, y, b0]);
      pushTri(pos, [a1, y, b0], [a0, y, b1], [a1, y, b1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, ctx.mat('sand', { elem: EL.sand }));
    m.name = 'valley:mtnSand';
    m.castShadow = false;
    m.receiveShadow = true;
    out.push(m);
  }
  return out;
}
