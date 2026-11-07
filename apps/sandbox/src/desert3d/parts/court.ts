// 荒废的硬地球场：褪色开裂的漆面（像素贴图）、翘起的板块、裂缝里的杂草，以及会被扫掉/吹来的积沙（w.dirt）。
import * as THREE from 'three';
import { COURT } from '../layout';
import type { Build } from '../world';
import { DCELL, DNX, DNZ, driftH, SandGrid } from './court/dirt';
import { PAD_L, PAD_W, paintCourt, SLABS, TEX } from './court/surface';
import { type WeedSpec, weedGeometry, weedInstances } from './court/weeds';

/** 铺面顶面高度（没有积沙时） */
export const PAD_Y = 0.05;

const uvOf = (x: number, z: number): [number, number] => [(x + COURT.padHw) / PAD_W, (z + COURT.padHl) / PAD_L];

/** 铺面网格：每 0.25 米一个顶点，积沙厚的地方抬起来 */
function buildSurface(grid: SandGrid) {
  // 顶点每 0.5 米一个（积沙格子是 0.25 米，两格一个顶点）
  const S = 2;
  const VX = DNX / S;
  const VZ = DNZ / S;
  const STEP = DCELL * S;
  const NX = VX + 1;
  const NZ = VZ + 1;
  const pos = new Float32Array(NX * NZ * 3);
  const nrm = new Float32Array(NX * NZ * 3);
  const uv = new Float32Array(NX * NZ * 2);
  const idx: number[] = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      const x = -COURT.padHw + i * STEP;
      const z = -COURT.padHl + j * STEP;
      pos[k * 3] = x;
      pos[k * 3 + 2] = z;
      const [u, v] = uvOf(x, z);
      uv[k * 2] = u;
      uv[k * 2 + 1] = v;
    }
  }
  for (let j = 0; j < VZ; j++) {
    for (let i = 0; i < VX; i++) {
      const a = j * NX + i;
      idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3);
  const na = new THREE.BufferAttribute(nrm, 3);
  geo.setAttribute('position', pa);
  geo.setAttribute('normal', na);
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const cellV = (i: number, j: number) =>
    grid.v[Math.min(DNZ - 1, Math.max(0, j)) * DNX + Math.min(DNX - 1, Math.max(0, i))];
  /** 顶点 (i, j) 的高度：周围 4×4 格平均；铺面最外一圈不抬（贴着边沿） */
  const hAt = (i: number, j: number) => {
    if (i <= 0 || j <= 0 || i >= VX || j >= VZ) return PAD_Y;
    let d = 0;
    for (let b = -2; b < 2; b++) for (let a = -2; a < 2; a++) d += cellV(i * S + a, j * S + b);
    return PAD_Y + driftH(d / 16);
  };
  /** 更新积沙格子区间（含）对应的顶点 */
  const refresh = (c0: number, c1: number, r0: number, r1: number) => {
    const i0 = Math.max(0, Math.floor(c0 / S) - 1);
    const j0 = Math.max(0, Math.floor(r0 / S) - 1);
    const i1 = Math.min(NX - 1, Math.ceil(c1 / S) + 1);
    const j1 = Math.min(NZ - 1, Math.ceil(r1 / S) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) pos[(j * NX + i) * 3 + 1] = hAt(i, j);
    const y = (i: number, j: number) =>
      pos[(Math.min(NZ - 1, Math.max(0, j)) * NX + Math.min(NX - 1, Math.max(0, i))) * 3 + 1];
    for (let j = Math.max(0, j0 - 1); j <= Math.min(NZ - 1, j1 + 1); j++) {
      for (let i = Math.max(0, i0 - 1); i <= Math.min(NX - 1, i1 + 1); i++) {
        const nx = -(y(i + 1, j) - y(i - 1, j)) / (2 * STEP);
        const nz = -(y(i, j + 1) - y(i, j - 1)) / (2 * STEP);
        const l = Math.hypot(nx, 1, nz);
        const k = (j * NX + i) * 3;
        nrm[k] = nx / l;
        nrm[k + 1] = 1 / l;
        nrm[k + 2] = nz / l;
      }
    }
    pa.needsUpdate = true;
    na.needsUpdate = true;
  };
  refresh(0, DNX - 1, 0, DNZ - 1);
  geo.computeBoundingSphere();
  return { geo, refresh };
}

/** 翘起的板块：顶面（同一张贴图）+ 露出来的侧边 */
function buildSlabs(): { top: THREE.BufferGeometry; side: THREE.BufferGeometry } {
  const tp: number[] = [];
  const tu: number[] = [];
  const sp: number[] = [];
  for (const s of SLABS) {
    const yOf = (x: number, z: number) => {
      const t = ((x - s.hinge[0]) * s.dir[0] + (z - s.hinge[1]) * s.dir[1]) / s.span;
      return PAD_Y + 0.012 + s.lift * Math.min(1, Math.max(0, t));
    };
    const P = s.poly.map(([x, z]) => new THREE.Vector3(x, yOf(x, z), z));
    // 顶面：扇形三角化（凸多边形），朝上
    for (let k = 1; k < P.length - 1; k++) {
      for (const v of [P[0], P[k], P[k + 1]]) {
        tp.push(v.x, v.y, v.z);
        tu.push(...uvOf(v.x, v.z));
      }
    }
    // 侧边：每条边往下到铺面
    for (let k = 0; k < P.length; k++) {
      const a = P[k];
      const b = P[(k + 1) % P.length];
      const a0 = new THREE.Vector3(a.x, PAD_Y - 0.02, a.z);
      const b0 = new THREE.Vector3(b.x, PAD_Y - 0.02, b.z);
      for (const v of [a, a0, b0, a, b0, b]) sp.push(v.x, v.y, v.z);
    }
  }
  const fixWinding = (arr: number[], wantUp: boolean, center?: (i: number) => THREE.Vector3) => {
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const Cc = new THREE.Vector3();
    for (let i = 0; i < arr.length; i += 9) {
      A.fromArray(arr, i);
      B.fromArray(arr, i + 3);
      Cc.fromArray(arr, i + 6);
      const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(Cc, A));
      const bad = wantUp ? n.y < 0 : n.dot(new THREE.Vector3().subVectors(A, center!(i))) < 0;
      if (bad) {
        for (let c = 0; c < 3; c++) {
          const t = arr[i + 3 + c];
          arr[i + 3 + c] = arr[i + 6 + c];
          arr[i + 6 + c] = t;
        }
      }
    }
  };
  // 顶面 uv 跟着顶点交换：按三角形整体处理，先翻 uv 再翻位置
  for (let i = 0; i < tp.length; i += 9) {
    const n = new THREE.Vector3()
      .subVectors(new THREE.Vector3().fromArray(tp, i + 3), new THREE.Vector3().fromArray(tp, i))
      .cross(
        new THREE.Vector3().subVectors(new THREE.Vector3().fromArray(tp, i + 6), new THREE.Vector3().fromArray(tp, i)),
      );
    if (n.y < 0) {
      const t = i / 9;
      for (let c = 0; c < 2; c++) {
        const u = tu[t * 6 + 2 + c];
        tu[t * 6 + 2 + c] = tu[t * 6 + 4 + c];
        tu[t * 6 + 4 + c] = u;
      }
    }
  }
  fixWinding(tp, true);
  // 侧边朝外：以所属板块的中心为准
  const centers: THREE.Vector3[] = [];
  for (const s of SLABS) {
    const c = new THREE.Vector3();
    for (const [x, z] of s.poly) c.add(new THREE.Vector3(x, 0, z));
    c.multiplyScalar(1 / s.poly.length);
    for (let k = 0; k < s.poly.length * 2; k++) centers.push(c);
  }
  fixWinding(sp, false, (i) => {
    const c = centers[i / 9];
    return new THREE.Vector3(c.x, sp[i + 1], c.z);
  });
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  top.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2));
  top.computeVertexNormals();
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  side.computeVertexNormals();
  return { top, side };
}

/** 铺面三档：亮档 = 贴图本色；中、暗档比例在褪色硬地蓝和浅沙之间取（暗档偏靛） */
const COURT_RAMP: [number, number, number] = [0xffffff, 0xd9d4e0, 0x9991cc];
const ASPHALT_RAMP: [number, number, number] = [0x8a8690, 0x6a6678, 0x464460];
const WEED_RAMP: [number, number, number] = [0x9aa86a, 0x6f8a5a, 0x46605a];

export const build: Build = (w) => {
  const g = new THREE.Group();
  g.name = 'court';
  const rnd = w.rng('court:paint');
  const painted = paintCourt(rnd);
  const grid = new SandGrid(w.uniforms.uWind.value);
  w.dirt = grid;

  // 铺面材质：卡通材质 + 积沙混色
  const mat = w.mats.toon(0xffffff, { map: painted.tex, ramp: COURT_RAMP, edge: 0.05, convex: 0 });
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    base.call(mat, shader, r);
    shader.uniforms.uDirt = { value: grid.tex };
    shader.uniforms.uSandA = { value: new THREE.Color(0xdcb880) };
    shader.uniforms.uSandB = { value: new THREE.Color(0xcfa66c) };
    shader.uniforms.uSandC = { value: new THREE.Color(0xecd4a2) };
    shader.fragmentShader =
      'uniform sampler2D uDirt;\nuniform vec3 uSandA;\nuniform vec3 uSandB;\nuniform vec3 uSandC;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          // 积沙：平滑的厚度场取阈值 → 实心的沙堆形状，边是一圈略深的薄沙，顶上一块亮沙脊
          float sd = texture2D(uDirt, vMapUv).r;
          if (sd > 0.2) diffuseColor.rgb = sd > 0.72 ? uSandC : (sd > 0.4 ? uSandA : uSandB);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'toon-court-dirt';

  const surf = buildSurface(grid);
  const surface = new THREE.Mesh(surf.geo, mat);
  surface.name = 'court-surface';
  g.add(surface);

  // 铺面边沿（沥青厚度）
  const edgeMat = w.mats.toon(0xffffff, { ramp: ASPHALT_RAMP, edge: 0.3, convex: 0.2 });
  const T = 0.08;
  const H = PAD_Y + 0.1;
  for (const [sx, sz, px, pz] of [
    [PAD_W + 2 * T, T, 0, -COURT.padHl - T / 2],
    [PAD_W + 2 * T, T, 0, COURT.padHl + T / 2],
    [T, PAD_L, -COURT.padHw - T / 2, 0],
    [T, PAD_L, COURT.padHw + T / 2, 0],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), edgeMat);
    b.position.set(px, PAD_Y - H / 2, pz);
    g.add(b);
  }

  // 翘起的板块
  const slabs = buildSlabs();
  g.add(new THREE.Mesh(slabs.top, mat));
  g.add(new THREE.Mesh(slabs.side, w.mats.toon(0xffffff, { ramp: ASPHALT_RAMP, edge: 0.5, convex: 0.4 })));

  // 杂草
  const wr = w.rng('court:weeds');
  const specs: WeedSpec[] = [];
  const addWeed = (x: number, z: number, s: number) => {
    if (Math.abs(x) > COURT.padHw - 0.15 || Math.abs(z) > COURT.padHl - 0.15) return;
    const c = new THREE.Color(1, 1, 1).multiplyScalar(0.88 + wr() * 0.12);
    specs.push({ x, y: PAD_Y + driftH(grid.at(x, z)) - 0.02, z, s, rot: wr() * Math.PI * 2, color: c });
  };
  for (const p of painted.crackPts) {
    if (wr() < (p.major ? 0.16 : 0.08)) addWeed(p.x + (wr() - 0.5) * 0.1, p.z + (wr() - 0.5) * 0.1, 0.7 + wr() * 0.7);
  }
  for (let k = 0; k < 10; k++) {
    // 铺面边沿和围栏脚下
    const side = Math.floor(wr() * 4);
    const t = wr() * 2 - 1;
    const inset = 0.25 + wr() * 0.3;
    const [x, z] =
      side < 2
        ? [t * COURT.padHw, (side === 0 ? -1 : 1) * (COURT.padHl - inset)]
        : [(side === 2 ? -1 : 1) * (COURT.padHw - inset), t * COURT.padHl];
    addWeed(x, z, 0.8 + wr() * 0.8);
  }
  for (const pe of painted.peels) {
    const n = Math.floor(wr() * 2);
    for (let k = 0; k < n; k++) {
      const a = wr() * Math.PI * 2;
      const d = wr() * pe.r * 0.6;
      addWeed(pe.x + Math.cos(a) * d, pe.z + Math.sin(a) * d, 0.6 + wr() * 0.6);
    }
  }
  const weedMat = w.mats.toon(0xffffff, {
    sway: 0.07,
    swayH: 0.5,
    ramp: WEED_RAMP,
    edge: 0.4,
    convex: 0.2,
    sphereNormals: [0, -0.1, 0],
  });
  const wgeos = [0, 1, 2].map((i) => weedGeometry(wr, 5 + i * 2, 0.32 + i * 0.1));
  for (const im of weedInstances(wgeos, weedMat, specs)) g.add(im);

  w.mats.prepare(g);
  surface.castShadow = false;
  w.scene.add(g);

  let acc = 0;
  return {
    update(dt) {
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      const r = grid.flush();
      if (r) surf.refresh(r[0], r[1], r[2], r[3]);
    },
  };
};
