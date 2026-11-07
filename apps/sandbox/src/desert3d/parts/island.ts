// 浮空沙漠地台：起伏的沙地顶面（像素贴图：沙、压实的土、白色钙质斑、风纹、干河沟），
// 层层叠叠的沉积岩崖壁，参差的底部；碎石和石块用实例散布。
// 地台外不放任何东西（ADR 0005）。高度场 groundY 是纯函数，从这里或 ./court/ground 引用。
import * as THREE from 'three';
import { ISLAND } from '../layout';
import type { Build } from '../world';
import { edgeDist, groundY, onIsland, padDist, pathDist, warpToOutline, washZ } from './court/ground';
import { fbm, sstep, vnoise, white } from './court/noise';
import { hex, Pix, type RGB } from './court/pix';
import { type RockSpec, rockGeometry, rockInstances } from './court/rocks';

export { groundY, onIsland } from './court/ground';

const CELL = 0.5; // 顶面网格
const GT = 0.25; // 地面贴图每像素多少米

// 地面：大块安静的纯色（亮档颜色，材质的 ramp 负责中、暗两档往冷色转）。
// 细节克制：风纹只在两三片沙丘上，碎点只在河沟和石堆边，整体 ≤ 6%。
const C = {
  sand: hex(0xdcb880),
  sandD: hex(0xc99a5e),
  sandL: hex(0xe6c892),
  caliche: hex(0xe8d6ac),
  path: hex(0xcba272),
  gravel: hex(0xbca386),
  gravelD: hex(0xa08a70),
};

/** 地面材质的三档：亮档 = 贴图本色；中、暗档是比例（来自浅沙 dcb880 → c49a6c → 8a6f78） */
const GROUND_RAMP: [number, number, number] = [0xffffff, 0xe3d6d8, 0xa099f0];

function paintGround(): THREE.DataTexture {
  const W = Math.round((ISLAND.x1 - ISLAND.x0) / GT);
  const H = Math.round((ISLAND.z1 - ISLAND.z0) / GT);
  const p = new Pix(W, H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = ISLAND.x0 + (i + 0.5) * GT;
      const z = ISLAND.z0 + (j + 0.5) * GT;
      let c: RGB = C.sand;
      // 大块深沙/土（低频，约 15%）
      const n = fbm(x * 0.07, z * 0.07, 40, 3);
      if (n > 0.6) c = C.sandD;
      // 几块白色钙质斑
      const ca = fbm(x * 0.09 + 3, z * 0.09 - 5, 42, 3);
      if (ca > 0.67 && c === C.sand) c = C.caliche;
      // 风纹：只在少数几片沙丘上
      const ek = 1 - sstep(1.5, 7, edgeDist(x, z));
      const zone = vnoise(x * 0.08, z * 0.08, 45);
      if (ek > 0.4 && zone > 0.62) {
        const s = x * 0.916 + z * 0.4;
        const t = -x * 0.4 + z * 0.916;
        const r = Math.sin(s * 3.2 + vnoise(t * 0.25, s * 0.2, 44) * 4);
        if (r > 0.9) c = C.sandL;
      }
      // 干河沟：砾石河床，碎点只在这里
      const wd = Math.abs(z - washZ(x));
      if (wd < 0.9) c = white(i, j, 3) < 0.1 ? C.gravelD : C.gravel;
      else if (wd < 1.3) c = C.sandD;
      // 步道：一条干净的踩实土
      if (pathDist(x, z) < 0.8) c = C.path;
      // 铺面边上新吹来的亮沙
      const dp = padDist(x, z);
      if (dp > 0 && dp < 0.7) c = C.sandL;
      p.set(i, j, c);
    }
  }
  return p.texture();
}

/** 顶面网格（规则网格挤进不规则轮廓），返回几何体和边界一圈顶点 */
function buildTop(): { geo: THREE.BufferGeometry; ring: THREE.Vector3[] } {
  const nx = Math.round((ISLAND.x1 - ISLAND.x0) / CELL);
  const nz = Math.round((ISLAND.z1 - ISLAND.z0) / CELL);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const at = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const [x, z] = warpToOutline(ISLAND.x0 + i * CELL, ISLAND.z0 + j * CELL);
      pos.push(x, groundY(x, z), z);
      uv.push((x - ISLAND.x0) / (ISLAND.x1 - ISLAND.x0), (z - ISLAND.z0) / (ISLAND.z1 - ISLAND.z0));
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const ring: THREE.Vector3[] = [];
  const v = (i: number, j: number) => {
    const k = at(i, j) * 3;
    return new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]);
  };
  for (let i = 0; i < nx; i++) ring.push(v(i, 0));
  for (let j = 0; j < nz; j++) ring.push(v(nx, j));
  for (let i = nx; i > 0; i--) ring.push(v(i, nz));
  for (let j = nz; j > 0; j--) ring.push(v(0, j));
  return { geo, ring };
}

// 崖壁顶点色 = 各层亮档颜色；ramp 给中、暗档比例（红岩 b07a58 → 8a5a4a → 5a4058）
const STRATA = [0xc08a60, 0xb07a58, 0xd4a070, 0x9e6a50, 0xc89468].map((h) => new THREE.Color(h));
const CLIFF_RAMP: [number, number, number] = [0xffffff, 0xc8bdd6, 0x8486ff];
const LEDGE = new THREE.Color(0xdcb880);
const UNDER = [0x8a5a48, 0x7a5044, 0x6a4840].map((h) => new THREE.Color(h));

/** 崖壁：一圈圈往下的环，层与层之间错开形成岩层台阶，底部参差地收拢 */
function buildCliffs(ring: THREE.Vector3[], rnd: () => number): THREE.BufferGeometry {
  const K = ring.length;
  // 每个环点的外法线（水平）、沿周长的参数（米）
  const nrm: THREE.Vector2[] = [];
  const per: number[] = [];
  let acc = 0;
  for (let k = 0; k < K; k++) {
    const a = ring[(k - 1 + K) % K];
    const b = ring[(k + 1) % K];
    const n = new THREE.Vector2(b.z - a.z, -(b.x - a.x)).normalize();
    if (n.x * ring[k].x + n.y * ring[k].z < 0) n.multiplyScalar(-1);
    nrm.push(n);
    per.push(acc);
    acc += ring[k].distanceTo(ring[(k + 1) % K]);
  }

  const rings: THREE.Vector3[][] = [];
  const bandColor: THREE.Color[] = [];
  const mk = (off: (k: number) => number, y: (k: number) => number) =>
    ring.map((p, k) => new THREE.Vector3(p.x + nrm[k].x * off(k), y(k), p.z + nrm[k].y * off(k)));

  rings.push(ring.map((p) => p.clone()));
  // 表层沙壳
  const lipY = (k: number) => Math.min(ring[k].y, 0) - 0.3 - vnoise(per[k] * 0.5, 1, 60) * 0.2;
  rings.push(mk(() => 0.06, lipY));
  bandColor.push(new THREE.Color(0xc4975d));

  let y0 = (k: number) => lipY(k);
  let prevOff = (_k: number) => 0.06;
  let band = 0;
  let yCur = -0.4;
  const bottom = -ISLAND.depth + 1.2;
  while (yCur > bottom) {
    const h = 0.7 + rnd() * 0.6;
    const base = (rnd() - 0.5) * 0.55;
    const lean = (rnd() - 0.5) * 0.1;
    const b = band;
    const off = (k: number) => base + (vnoise(per[k] * 0.12, b * 3.1, 61) - 0.5) * 0.35;
    const yNext = yCur - h;
    const jit = (k: number) => yNext + (vnoise(per[k] * 0.15, b * 2.7, 63) - 0.5) * 0.2;
    const yTop = y0;
    // 台阶：上一层的底环 → 这一层的顶环（同高，外沿不同）
    rings.push(mk(off, yTop));
    bandColor.push(LEDGE);
    // 这一层的岩面
    rings.push(mk((k) => off(k) + lean, jit));
    bandColor.push(STRATA[band % STRATA.length]);
    prevOff = (k: number) => off(k) + lean;
    y0 = jit;
    yCur = yNext;
    band++;
  }
  // 参差的底：几圈往里收，带钟乳石一样的尖
  const jag = (k: number, s: number) => {
    const n = vnoise(per[k] * 0.55, s, 70);
    const spike = white(Math.floor(per[k] / 0.5), s * 13, 71);
    return Math.max(0, n - 0.3) * 2.2 + (spike > 0.82 ? (spike - 0.82) * 9 : 0);
  };
  const lastOff = prevOff;
  const lastY = y0;
  const taper: [number, number][] = [
    [-0.6, 0.7],
    [-1.8, 1.5],
    [-3.6, 2.4],
    [-6, 3.0],
  ];
  taper.forEach(([o, dy], s) => {
    rings.push(
      mk(
        (k) => lastOff(k) + o,
        (k) => lastY(k) - dy - jag(k, s) * (0.5 + s * 0.45),
      ),
    );
    bandColor.push(UNDER[Math.min(s, UNDER.length - 1)]);
  });

  const pos: number[] = [];
  const col: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b);
  };
  // 绕向：看第一层的第一个四边形
  const test = new THREE.Vector3()
    .subVectors(rings[1][1], rings[0][0])
    .cross(new THREE.Vector3().subVectors(rings[1][0], rings[0][0]));
  const flip = test.x * nrm[0].x + test.z * nrm[0].y < 0;
  for (let L = 0; L < rings.length - 1; L++) {
    const A = rings[L];
    const B = rings[L + 1];
    const c = bandColor[L];
    for (let k = 0; k < K; k++) {
      const k1 = (k + 1) % K;
      // 每块岩面颜色微微不同，平面着色下更像一块块石头
      const cc = c;
      if (!flip) {
        tri(A[k], B[k], B[k1], cc);
        tri(A[k], B[k1], A[k1], cc);
      } else {
        tri(A[k], B[k1], B[k], cc);
        tri(A[k], A[k1], B[k1], cc);
      }
    }
  }
  // 底面封口
  const last = rings[rings.length - 1];
  const ctr = new THREE.Vector3(0, -ISLAND.depth - 6, 0);
  for (let k = 0; k < K; k++) {
    const k1 = (k + 1) % K;
    if (!flip) tri(last[k], ctr, last[k1], UNDER[2]);
    else tri(last[k], last[k1], ctr, UNDER[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// 石头：实例色是接近白的明暗（0.85～1），颜色在两套 ramp 里（红岩、灰紫石）
const ROCK_RED: [number, number, number] = [0xb07a58, 0x8a5a4a, 0x5a4058];
const ROCK_GREY: [number, number, number] = [0xaea0a2, 0x7e7088, 0x4e4868];

function scatterRocks(rnd: () => number): RockSpec[] {
  const out: RockSpec[] = [];
  const ok = (x: number, z: number, r: number) =>
    padDist(x, z) > 0.7 + r && pathDist(x, z) > 1.3 + r && onIsland(x, z, 0.25 + r);
  const put = (x: number, z: number, s: number, sy = 1) => {
    if (!ok(x, z, s)) return;
    const c = new THREE.Color(1, 1, 1).multiplyScalar(0.88 + rnd() * 0.12);
    out.push({ x, y: groundY(x, z) - s * 0.12, z, s, rotY: rnd() * Math.PI * 2, color: c, sy });
  };
  const rx = () => ISLAND.x0 + rnd() * (ISLAND.x1 - ISLAND.x0);
  const rz = () => ISLAND.z0 + rnd() * (ISLAND.z1 - ISLAND.z0);
  // 石堆：一块大的带几块小的
  for (let c = 0; c < 22; c++) {
    const cx = rx();
    const cz = rz();
    const big = 0.45 + rnd() * 0.75 * (edgeDist(cx, cz) < 6 ? 1.3 : 0.8);
    put(cx, cz, big, 0.8 + rnd() * 0.3);
    const n = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = big + 0.2 + rnd() * 1.2;
      put(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0.18 + rnd() * 0.3);
    }
  }
  // 零散的石头
  for (let i = 0; i < 40; i++) put(rx(), rz(), 0.2 + rnd() * 0.3);
  // 碎石：河沟和岛边多
  let n = 0;
  for (let tries = 0; n < 110 && tries < 4000; tries++) {
    const x = rx();
    const z = rz();
    const wd = Math.abs(z - washZ(x));
    const dens = wd < 1.0 ? 1 : 0.03;
    if (rnd() > dens) continue;
    put(x, z, 0.12 + rnd() * 0.1, 0.8);
    n++;
  }
  return out;
}

export const build: Build = (w) => {
  const g = new THREE.Group();
  g.name = 'island';
  const rnd = w.rng('court:island');

  const { geo, ring } = buildTop();
  const top = new THREE.Mesh(
    geo,
    w.mats.toon(0xffffff, { map: paintGround(), ramp: GROUND_RAMP, edge: 0.05, convex: 0 }),
  );
  top.name = 'island-top';
  g.add(top);

  const cliffs = new THREE.Mesh(
    buildCliffs(ring, rnd),
    w.mats.toon(0xffffff, { vertexColors: true, ramp: CLIFF_RAMP, edge: 0.3, convex: 0 }),
  );
  cliffs.name = 'island-cliffs';
  g.add(cliffs);

  const geos = [0, 1, 2, 3].map((i) => rockGeometry(rnd, 0, 0.55 + i * 0.08));
  const rocks = scatterRocks(rnd);
  const red = rocks.filter((_, i) => i % 3 !== 0);
  const grey = rocks.filter((_, i) => i % 3 === 0);
  for (const im of rockInstances(geos, w.mats.toon(0xffffff, { ramp: ROCK_RED, edge: 0.8, convex: 1 }), red)) g.add(im);
  for (const im of rockInstances(
    geos.slice(0, 2),
    w.mats.toon(0xffffff, { ramp: ROCK_GREY, edge: 0.8, convex: 1 }),
    grey,
  ))
    g.add(im);

  w.mats.prepare(g);
  cliffs.receiveShadow = false;
  w.scene.add(g);
  return {};
};
