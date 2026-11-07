// 球场（主角）：废弃、晒旧的 Indian Wells 硬地。
// - 铺面按"屏幕纹素格"画：x 每格 1 纹素（0.09 米），z 每格 1 屏幕行（0.09 / cos45 = 0.127 米）→ 每条边都是整纹素、不闪。
//   每格一个标签（外场 / 内场 / 晒白 / 白线 / 沥青），同标签的格子贪心合并成矩形，每种材质一个网格（几百个三角形）。
// - 旧：三块大的晒白块（courtBleach）、三条粗裂缝（3 纹素宽，沥青色）、三块剥落（沥青），白线只在裂缝/剥落处断开。
// - 积沙：一张厚度格（userData.sand），高度场网格 + alphaMap 切出圆滑的轮廓；沙堆是"迎风缓坡 + 背风陡坡"的小沙丘，
//   背风坡朝镜头落中档，坡顶那条折线出凸边亮线。userData.sand.sweep(x, z, r, amount) 扫掉一部分，blow(…) 吹叶机把沙沿锥往前推，画面下一帧更新。
import * as THREE from 'three';
import { COURT } from '../layout';
import { vnoise } from '../noise';
import type { AssetCtx } from '../world';

/** 格子标签 */
const SURROUND = 0;
const COURT_IN = 1;
const BLEACH = 2;
const LINE = 3;
const ASPHALT = 4;
/** 裂缝：缝（当地漆色的深一档）+ 缝下沿一纹素亮边（翘起的漆皮迎光） */
const CRACK_C = 5;
const CRACK_S = 6;
const LIP_C = 7;
const LIP_S = 8;

export interface SandGrid {
  /** 本地坐标（米）处的积沙厚度（米） */
  at(x: number, z: number): number;
  /** 以 (x, z) 为心、半径 r 扫掉最多 amount 米厚的沙（边缘衰减），返回扫掉的量（米³ 近似） */
  sweep(x: number, z: number, r: number, amount: number): number;
  /**
   * 吹叶机：从 (x, z) 沿 (dirX, dirZ) 一个长 length、末端宽 width 的锥里吹走最多 amount 米厚的沙（近处、中线吹得最狠），
   * 吹走的六成堆到锥尖往前 0.3～1.1 米的一条带上（出了格子就没了）→ 沙丘变小、往下风挪、最后被推出场边。返回吹走的量（米³ 近似）。
   */
  blow(x: number, z: number, dirX: number, dirZ: number, length: number, width: number, amount: number): number;
  /** 风把沙吹回来：在 (x, z) 半径 r 内加最多 amount 米（每格不超过初始沙丘的厚度 + 2 厘米 → 沙只往原来的沙丘上堆） */
  deposit(x: number, z: number, r: number, amount: number): void;
  /** 最脏的 1 米见方（场内 + 缓冲区），没有就 null；amount = 平均厚度（米） */
  dirtiest(minAmount?: number, near?: { x: number; z: number }): { x: number; z: number; amount: number } | null;
  /** 初始沙丘的中心（风往这里堆沙） */
  homes: { x: number; z: number }[];
  /** 总量（米³ 近似），给玩法读 */
  total(): number;
  /** 立刻刷新画面（不然下一帧 update 时刷新） */
  flush(): void;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const v = ctx.variant;
  const rnd = ctx.rng(`court:${v}`);
  const TX = ctx.texel;
  const TZ = ctx.texel / Math.SQRT1_2;
  const { hw, hl, shw, service, padHw, padHl } = COURT;
  const NX = Math.round((padHw * 2) / TX);
  const NZ = Math.round((padHl * 2) / TZ);
  const x0 = (-NX * TX) / 2;
  const z0 = (-NZ * TZ) / 2;
  const cx = (i: number) => x0 + (i + 0.5) * TX;
  const cz = (j: number) => z0 + (j + 0.5) * TZ;

  // ── 1. 标签格 ──────────────────────────────────────
  const lbl = new Uint8Array(NX * NZ);
  const jit = (k: number) => (rnd() - 0.5) * 2 * k;

  // 晒白块：低频的圆角方块（超椭圆 + 低频噪声扰边），只在内场
  const bleach = [
    { x: -2.3 + jit(0.4), z: -7.2 + jit(0.4), rx: 2.0, rz: 1.7, p: 3.2 },
    { x: 2.5 + jit(0.4), z: 4.0 + jit(0.4), rx: 1.6, rz: 2.4, p: 3.0 },
    { x: -3.4 + jit(0.3), z: 9.0 + jit(0.3), rx: 1.3, rz: 1.1, p: 2.6 },
  ];
  // 剥落：小一点的圆块，露沥青（一块压在南底线上，把线断开）
  // （组装时删掉了两块：小的暗圆块在画面里读成油渍/洞，不是剥落）
  // 最后一块也删了：正好在南底线发球位，总像人脚下一滩影子
  const peels: { x: number; z: number; rx: number; rz: number; p: number }[] = [];
  const blob = (b: { x: number; z: number; rx: number; rz: number; p: number }, x: number, z: number, seed: number) => {
    const n = (vnoise(x * 0.9 + seed * 7.1, z * 0.9 - seed * 3.3, 11 + seed) - 0.5) * 0.35;
    const d = Math.abs((x - b.x) / b.rx) ** b.p + Math.abs((z - b.z) / b.rz) ** b.p;
    return d < 1 + n;
  };

  // 裂缝：粗折线（3 纹素宽），手摆起点和方向，每段方向小抖动
  const cracks: [number, number][][] = [];
  const crack = (sx: number, sz: number, heading: number, segs: number, segLen: number) => {
    const pts: [number, number][] = [[sx, sz]];
    let a = heading;
    let x = sx;
    let z = sz;
    for (let s = 0; s < segs; s++) {
      a += jit(0.45);
      const L = segLen * (0.7 + rnd() * 0.6);
      x += Math.cos(a) * L;
      z += Math.sin(a) * L;
      pts.push([x, z]);
    }
    cracks.push(pts);
  };
  crack(-6.6, 5.4, 0.3, 12, 0.6); // 西南半场斜穿两条边线
  crack(4.4, -13.9, 1.85, 8, 0.6); // 北外场穿过北底线
  crack(6.95, 8.6, Math.PI + 0.2, 5, 0.5); // 东外场短裂缝穿过双打边线
  const crackHit = (x: number, z: number) => {
    const px = x / TX;
    const pz = z / TZ;
    for (const pts of cracks) {
      for (let k = 0; k < pts.length - 1; k++) {
        const ax = pts[k][0] / TX;
        const az = pts[k][1] / TZ;
        const bx = pts[k + 1][0] / TX;
        const bz = pts[k + 1][1] / TZ;
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
        const ex = px - (ax + dx * t);
        const ez = pz - (az + dz * t);
        if (ex * ex + ez * ez <= 0.55 * 0.55) return true;
      }
    }
    return false;
  };

  // 线对齐到格边：2 纹素宽（x 方向 2 格、z 方向 2 行）
  const snapX = (x: number) => Math.round((x - x0) / TX);
  const snapZ = (z: number) => Math.round((z - z0) / TZ);
  const vLines = [-hw, -shw, shw, hw].map(snapX);
  const hLines = [-hl, hl].map(snapZ);
  const sLines = [-service, service].map(snapZ);
  const iC = snapX(0);
  const iIn0 = snapX(-hw);
  const iIn1 = snapX(hw);
  const jIn0 = snapZ(-hl);
  const jIn1 = snapZ(hl);
  const iS0 = snapX(-shw);
  const iS1 = snapX(shw);
  const near = (k: number, line: number) => k === line - 1 || k === line;

  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x = cx(i);
      const z = cz(j);
      let L = SURROUND;
      const inside = i >= iIn0 && i < iIn1 && j >= jIn0 && j < jIn1;
      if (inside) {
        L = COURT_IN;
        if (bleach.some((b, k) => blob(b, x, z, k))) L = BLEACH;
      }
      const inZ = j >= jIn0 - 1 && j < jIn1 + 1;
      const inX = i >= iIn0 - 1 && i < iIn1 + 1;
      if (inZ && vLines.some((l) => near(i, l))) L = LINE;
      if (inX && hLines.some((l) => near(j, l))) L = LINE;
      if (i >= iS0 && i < iS1 && sLines.some((l) => near(j, l))) L = LINE;
      if (near(i, iC) && j >= sLines[0] && j < sLines[1]) L = LINE;
      // 中心标记（底线中点往里一小截）
      if (near(i, iC) && ((j >= jIn0 && j < jIn0 + 3) || (j >= jIn1 - 3 && j < jIn1))) L = LINE;
      if (peels.some((b, k) => blob(b, x, z, k + 5))) L = ASPHALT;
      else if (crackHit(x, z)) L = L === SURROUND ? CRACK_S : CRACK_C;
      lbl[j * NX + i] = L;
    }
  }
  // 缝下沿（朝镜头一侧）一纹素亮边
  for (let j = NZ - 1; j > 0; j--) {
    for (let i = 0; i < NX; i++) {
      const up = lbl[(j - 1) * NX + i];
      const k = j * NX + i;
      const me = lbl[k];
      if (
        (up === CRACK_C || up === CRACK_S || up === ASPHALT) &&
        me !== CRACK_C &&
        me !== CRACK_S &&
        me !== ASPHALT &&
        me !== LINE
      )
        lbl[k] = me === SURROUND ? LIP_S : LIP_C;
    }
  }

  // ── 2. 贪心合并成矩形，每种标签一个网格 ─────────────
  const surfaceY = 0.04;
  const keys = [
    'surround',
    'court',
    'courtBleach',
    'line',
    'asphalt',
    'courtCrack',
    'surroundCrack',
    'courtBleach',
    'surroundLight',
  ] as const;
  const quads: number[][] = keys.map(() => []);
  {
    type Rect = { i0: number; i1: number; j0: number; j1: number; l: number };
    let open = new Map<string, Rect>();
    const flush = (r: Rect) => quads[r.l].push(r.i0, r.i1, r.j0, r.j1);
    for (let j = 0; j < NZ; j++) {
      const next = new Map<string, Rect>();
      let i = 0;
      while (i < NX) {
        const l = lbl[j * NX + i];
        let e = i;
        while (e + 1 < NX && lbl[j * NX + e + 1] === l) e++;
        const key = `${i},${e},${l}`;
        const r = open.get(key);
        if (r) {
          r.j1 = j;
          open.delete(key);
          next.set(key, r);
        } else next.set(key, { i0: i, i1: e, j0: j, j1: j, l });
        i = e + 1;
      }
      for (const r of open.values()) flush(r);
      open = next;
    }
    for (const r of open.values()) flush(r);
  }
  const surfaceMeshes: THREE.Mesh[] = [];
  keys.forEach((key, l) => {
    const q = quads[l];
    const n = q.length / 4;
    if (!n) return;
    const pos = new Float32Array(n * 4 * 3);
    const nor = new Float32Array(n * 4 * 3);
    const idx = new Uint32Array(n * 6);
    for (let k = 0; k < n; k++) {
      const xa = x0 + q[k * 4] * TX;
      const xb = x0 + (q[k * 4 + 1] + 1) * TX;
      const za = z0 + q[k * 4 + 2] * TZ;
      const zb = z0 + (q[k * 4 + 3] + 1) * TZ;
      pos.set([xa, surfaceY, za, xa, surfaceY, zb, xb, surfaceY, za, xb, surfaceY, zb], k * 12);
      for (let c = 0; c < 4; c++) nor[k * 12 + c * 3 + 1] = 1;
      idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 2, k * 4 + 1, k * 4 + 3], k * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.Mesh(geo, ctx.mat(key));
    m.name = `court:${key}`;
    surfaceMeshes.push(m);
    g.add(m);
  });

  // ── 3. 积沙：厚度格 + 高度场 ────────────────────────
  const SX = TX * 2;
  const SZ = TZ * 2;
  const margin = 1.2;
  const MX = Math.ceil((padHw * 2 + margin * 2) / SX) + 1;
  const MZ = Math.ceil((padHl * 2 + margin * 2) / SZ) + 1;
  const sx0 = (-(MX - 1) * SX) / 2;
  const sz0 = (-(MZ - 1) * SZ) / 2;
  const T = new Float32Array(MX * MZ);
  /** 坡顶亮带（0/1，按初始沙丘算；沙被扫薄了亮带就消失） */
  const C = new Float32Array(MX * MZ);
  // 风从西北来（场景 uWind 指向东南）：沙丘迎风坡朝西北、缓；背风坡（滑落面）朝东南 = 朝镜头、陡
  const wind = new THREE.Vector2(0.8, 0.35).normalize();
  type Dune = { x: number; z: number; len: number; wid: number; h: number; ang?: number };
  const H2 = Math.PI / 2;
  const drifts: Dune[] = [
    // 西北角（迎风角）：一大堆 + 顺西边往南的一瓣 → L 形
    { x: -4.9, z: -12.6, len: 3.0, wid: 2.3, h: 0.3, ang: 0.1 },
    { x: -6.5, z: -9.2, len: 2.3, wid: 1.5, h: 0.22, ang: H2 },
    // 北端：顺着北边往东，越来越薄
    { x: -1.4, z: -13.5, len: 1.9, wid: 1.1, h: 0.15, ang: 0 },
    { x: 2.9, z: -13.7, len: 1.3, wid: 0.8, h: 0.1, ang: 0.05 },
    // 西边线外（迎风边）一道
    { x: -7.0, z: 5.4, len: 1.9, wid: 1.4, h: 0.17, ang: H2 + 0.25 },
    // 球网北侧（网挡风，网前积一条）——西半边
    { x: -3.0, z: -1.25, len: 2.2, wid: 0.8, h: 0.13, ang: 0 },
    // 东南角（下风角，离镜头最近：主角细节）
    { x: 5.5, z: 12.7, len: 2.0, wid: 1.8, h: 0.24, ang: 0.15 },
    { x: 6.5, z: 10.2, len: 1.5, wid: 1.0, h: 0.15, ang: H2 },
    { x: 2.2, z: 13.6, len: 1.1, wid: 0.7, h: 0.1, ang: 0 },
  ];
  for (const d of drifts) {
    d.x += jit(0.25);
    d.z += jit(0.15);
    d.h *= 0.85 + rnd() * 0.3;
  }
  const duneH = (d: Dune, x: number, z: number) => {
    // 局部坐标：a 沿沙丘长轴，b 垂直长轴（朝下风为正）
    const ang = d.ang ?? Math.atan2(wind.x, -wind.y); // 默认长轴垂直于风
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const dx = x - d.x;
    const dz = z - d.z;
    // 低频噪声扰一下轮廓：长轴方向的位置 + 横向坡顶位置，免得成了一个个枕头
    const a = dx * ca + dz * sa + (vnoise(x * 0.7, z * 0.7, 31) - 0.5) * d.len * 0.35;
    let b = -dx * sa + dz * ca + (vnoise(x * 0.55 + 9, z * 0.55, 43) - 0.5) * d.wid * 0.7;
    // b 的正方向要指向下风（东南）
    const bDirX = -sa;
    const bDirZ = ca;
    if (bDirX * wind.x + bDirZ * wind.y < 0) b = -b;
    const ea = Math.abs(a) / d.len;
    if (ea >= 1) return 0;
    // 长轴：两头圆收
    const along = Math.sqrt(1 - ea * ea);
    const crest = d.wid * 0.35 * along; // 坡顶偏下风
    const back = d.wid * (0.6 + 0.4 * along); // 迎风坡长
    const lee = d.wid * 0.45; // 背风坡短、陡
    let t: number;
    if (b < crest) {
      const u = (crest - b) / back;
      if (u >= 1) return 0;
      t = 1 - u * u * (1.6 - 0.6 * u); // 迎风缓坡（凸）
    } else {
      const u = (b - crest) / lee;
      if (u >= 1) return 0;
      t = 1 - u * (0.4 + 0.6 * u); // 背风陡坡
    }
    // 坡顶亮带：坡顶线迎风一侧一窄条（两头收掉）
    const cw = Math.min(0.34, d.wid * 0.3);
    crestOut = along > 0.45 && b > crest - cw && b < crest + 0.04 ? 1 : 0;
    return d.h * along * Math.max(0, t);
  };
  let crestOut = 0;
  for (let j = 0; j < MZ; j++) {
    for (let i = 0; i < MX; i++) {
      const x = sx0 + i * SX;
      const z = sz0 + j * SZ;
      let h = 0;
      let c = 0;
      for (const d of drifts) {
        const hd = duneH(d, x, z);
        if (hd > h) {
          h = hd;
          c = crestOut;
        }
      }
      C[j * MX + i] = c;
      // 低频起伏，让轮廓不那么几何
      h *= 0.8 + 0.4 * vnoise(x * 0.5 + v * 13, z * 0.5, 77);
      T[j * MX + i] = Math.min(0.32, h);
    }
  }
  const T0 = T.slice();

  const tMin = 0.03;
  const baseY = 0.032;
  const sandGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(MX * MZ * 3);
  const sNor = new Float32Array(MX * MZ * 3);
  const sUv = new Float32Array(MX * MZ * 2);
  for (let j = 0; j < MZ; j++) {
    for (let i = 0; i < MX; i++) {
      const k = j * MX + i;
      sPos[k * 3] = sx0 + i * SX;
      sPos[k * 3 + 2] = sz0 + j * SZ;
      sUv[k * 2] = (i + 0.5) / MX;
      sUv[k * 2 + 1] = (j + 0.5) / MZ;
    }
  }
  const sIdx = new Uint32Array((MX - 1) * (MZ - 1) * 6);
  sandGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sandGeo.setAttribute('normal', new THREE.BufferAttribute(sNor, 3));
  sandGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
  sandGeo.setIndex(new THREE.BufferAttribute(sIdx, 1));
  const cIdx = new Uint32Array(sIdx.length);
  const crestGeo = new THREE.BufferGeometry();
  crestGeo.setAttribute('position', sandGeo.getAttribute('position'));
  crestGeo.setAttribute('normal', sandGeo.getAttribute('normal'));
  crestGeo.setAttribute('uv', sandGeo.getAttribute('uv'));
  crestGeo.setIndex(new THREE.BufferAttribute(cIdx, 1));
  const alphaData = new Uint8Array(MX * MZ * 4);
  const alphaTex = new THREE.DataTexture(alphaData, MX, MZ, THREE.RGBAFormat);
  alphaTex.magFilter = THREE.LinearFilter;
  alphaTex.minFilter = THREE.LinearFilter;
  alphaTex.flipY = false;
  const crestData = new Uint8Array(MX * MZ * 4);
  const crestTex = new THREE.DataTexture(crestData, MX, MZ, THREE.RGBAFormat);
  crestTex.magFilter = THREE.LinearFilter;
  crestTex.minFilter = THREE.LinearFilter;

  const rebuild = () => {
    const tAt = (i: number, j: number) => T[Math.min(MZ - 1, Math.max(0, j)) * MX + Math.min(MX - 1, Math.max(0, i))];
    for (let j = 0; j < MZ; j++) {
      for (let i = 0; i < MX; i++) {
        const k = j * MX + i;
        const t = T[k];
        sPos[k * 3 + 1] = baseY + t;
        const gx = (tAt(i + 1, j) - tAt(i - 1, j)) / (2 * SX);
        const gz = (tAt(i, j + 1) - tAt(i, j - 1)) / (2 * SZ);
        const len = Math.hypot(gx, 1, gz);
        sNor[k * 3] = -gx / len;
        sNor[k * 3 + 1] = 1 / len;
        sNor[k * 3 + 2] = -gz / len;
        const a = Math.round(Math.min(1, Math.max(0, 0.5 + (t - tMin) / 0.06)) * 255);
        alphaData[k * 4] = a;
        alphaData[k * 4 + 1] = a;
        alphaData[k * 4 + 2] = a;
        alphaData[k * 4 + 3] = 255;
        const keep = T0[k] > 0 ? Math.min(1, Math.max(0, (t / T0[k] - 0.8) / 0.12)) : 0;
        crestData[k * 4] = crestData[k * 4 + 1] = crestData[k * 4 + 2] = Math.round(C[k] * keep * 255);
        crestData[k * 4 + 3] = 255;
      }
    }
    let n = 0;
    for (let j = 0; j < MZ - 1; j++) {
      for (let i = 0; i < MX - 1; i++) {
        const a = j * MX + i;
        const m = Math.max(T[a], T[a + 1], T[a + MX], T[a + MX + 1]);
        if (m < tMin * 0.6) continue;
        sIdx.set([a, a + MX, a + 1, a + 1, a + MX, a + MX + 1], n);
        n += 6;
      }
    }
    sandGeo.setDrawRange(0, n);
    // 坡顶亮带只用有亮带的格子
    let nc = 0;
    for (let q = 0; q < n; q += 6) {
      const a = sIdx[q];
      if (
        Math.max(crestData[a * 4], crestData[(a + 1) * 4], crestData[(a + MX) * 4], crestData[(a + MX + 1) * 4]) < 100
      )
        continue;
      cIdx.set(sIdx.subarray(q, q + 6), nc);
      nc += 6;
    }
    crestGeo.setDrawRange(0, nc);
    crestGeo.index!.needsUpdate = true;
    (sandGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (sandGeo.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    sandGeo.index!.needsUpdate = true;
    sandGeo.computeBoundingSphere();
    sandGeo.computeBoundingBox();
    alphaTex.needsUpdate = true;
    crestTex.needsUpdate = true;
    dirty = false;
  };
  let dirty = true;
  rebuild();
  const sandMat = ctx.mat('sandDrift', {
    alphaMap: alphaTex,
    alphaTest: 0.5,
    edge: 0.3,
    convex: 0.8,
    bands: [0.05, 0.5],
  });
  const sandMesh = new THREE.Mesh(sandGeo, sandMat);
  sandMesh.name = 'court:sand';
  sandMesh.frustumCulled = false;
  g.add(sandMesh);
  // 坡顶亮带：同一个高度场，换 sandHigh、用坡顶遮罩切，深度往前推一点盖在沙上
  const crestMat = ctx.mat('sandHigh', { alphaMap: crestTex, alphaTest: 0.5, edge: 0.05, convex: 0 });
  crestMat.polygonOffset = true;
  crestMat.polygonOffsetFactor = -2;
  crestMat.polygonOffsetUnits = -4;
  const crestMesh = new THREE.Mesh(crestGeo, crestMat);
  crestMesh.name = 'court:sandCrest';
  crestMesh.frustumCulled = false;
  g.add(crestMesh);

  const sand: SandGrid = {
    at(x, z) {
      const fi = (x - sx0) / SX;
      const fj = (z - sz0) / SZ;
      const i = Math.floor(fi);
      const j = Math.floor(fj);
      if (i < 0 || j < 0 || i >= MX - 1 || j >= MZ - 1) return 0;
      const tx = fi - i;
      const tz = fj - j;
      const a = T[j * MX + i];
      const b = T[j * MX + i + 1];
      const c = T[(j + 1) * MX + i];
      const d = T[(j + 1) * MX + i + 1];
      return a + (b - a) * tx + (c - a + (d - c - b + a) * tx) * tz;
    },
    sweep(x, z, r, amount) {
      let removed = 0;
      const i0 = Math.max(0, Math.floor((x - r - sx0) / SX));
      const i1 = Math.min(MX - 1, Math.ceil((x + r - sx0) / SX));
      const j0 = Math.max(0, Math.floor((z - r - sz0) / SZ));
      const j1 = Math.min(MZ - 1, Math.ceil((z + r - sz0) / SZ));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(sx0 + i * SX - x, sz0 + j * SZ - z) / r;
          if (d >= 1) continue;
          const k = j * MX + i;
          const f = 1 - d * d;
          const take = Math.min(T[k], amount * f);
          T[k] -= take;
          removed += take * SX * SZ;
        }
      }
      if (removed > 0) dirty = true;
      return removed;
    },
    blow(x, z, dirX, dirZ, length, width, amount) {
      const dl = Math.hypot(dirX, dirZ) || 1;
      const ux = dirX / dl;
      const uz = dirZ / dl;
      const reach = length + 1.2;
      const i0 = Math.max(0, Math.floor((Math.min(x, x + ux * reach) - width - sx0) / SX));
      const i1 = Math.min(MX - 1, Math.ceil((Math.max(x, x + ux * reach) + width - sx0) / SX));
      const j0 = Math.max(0, Math.floor((Math.min(z, z + uz * reach) - width - sz0) / SZ));
      const j1 = Math.min(MZ - 1, Math.ceil((Math.max(z, z + uz * reach) + width - sz0) / SZ));
      // 锥的半宽：嘴边 0.15 米，到末端 width / 2
      const half = (a: number) => 0.15 + (width * 0.5 - 0.15) * Math.min(1, Math.max(0, a / length));
      let removed = 0;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const rx = sx0 + i * SX - x;
          const rz = sz0 + j * SZ - z;
          const a = rx * ux + rz * uz;
          if (a < 0 || a > length) continue;
          const b = Math.abs(-rx * uz + rz * ux) / half(a);
          if (b >= 1) continue;
          const k = j * MX + i;
          const take = Math.min(T[k], amount * Math.sqrt(1 - a / length) * (1 - b * b));
          T[k] -= take;
          removed += take;
        }
      }
      if (removed <= 0) return 0;
      // 堆到锥尖往前的一条带（按横向权重分），每格不超过 0.3 米
      const dep: number[] = [];
      let wsum = 0;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const rx = sx0 + i * SX - x;
          const rz = sz0 + j * SZ - z;
          const a = rx * ux + rz * uz;
          if (a < length + 0.3 || a > length + 1.1) continue;
          const b = Math.abs(-rx * uz + rz * ux) / (width * 0.5);
          if (b >= 1) continue;
          const w = (1 - b * b) * (1 - Math.abs(a - length - 0.7) / 0.4);
          if (w <= 0) continue;
          dep.push(j * MX + i, w);
          wsum += w;
        }
      }
      // 带整个在格子外（推出场外很远）就丢掉
      if (wsum > 0) {
        const put = removed * 0.6;
        for (let q = 0; q < dep.length; q += 2) {
          const k = dep[q];
          T[k] = Math.min(0.3, T[k] + (put * dep[q + 1]) / wsum);
        }
      }
      dirty = true;
      return removed * SX * SZ;
    },
    deposit(x, z, r, amount) {
      const i0 = Math.max(0, Math.floor((x - r - sx0) / SX));
      const i1 = Math.min(MX - 1, Math.ceil((x + r - sx0) / SX));
      const j0 = Math.max(0, Math.floor((z - r - sz0) / SZ));
      const j1 = Math.min(MZ - 1, Math.ceil((z + r - sz0) / SZ));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(sx0 + i * SX - x, sz0 + j * SZ - z) / r;
          if (d >= 1) continue;
          const k = j * MX + i;
          const cap = T0[k] > 0.01 ? T0[k] + 0.02 : 0;
          if (T[k] >= cap) continue;
          T[k] = Math.min(cap, T[k] + amount * (1 - d * d));
          dirty = true;
        }
      }
    },
    dirtiest(minAmount = 0.04, near) {
      let best: { x: number; z: number; amount: number } | null = null;
      let bestScore = 0;
      const B = Math.max(1, Math.round(1 / SX));
      const BZ = Math.max(1, Math.round(1 / SZ));
      for (let j = 0; j + BZ <= MZ; j += BZ) {
        for (let i = 0; i + B <= MX; i += B) {
          const x = sx0 + (i + B / 2) * SX;
          const z = sz0 + (j + BZ / 2) * SZ;
          if (Math.abs(x) > padHw - 0.3 || Math.abs(z) > padHl - 0.3 || Math.abs(z) < 0.7) continue;
          let sum = 0;
          for (let b = 0; b < BZ; b++) for (let a = 0; a < B; a++) sum += T[(j + b) * MX + i + a];
          const m = sum / (B * BZ);
          // 给了 near：越远越打折（总监先扫手边的）
          const sc = near ? m / (1 + Math.hypot(x - near.x, z - near.z) / 7) : m;
          if (m > minAmount && sc > bestScore) {
            bestScore = sc;
            best = { x, z, amount: m };
          }
        }
      }
      return best;
    },
    homes: drifts.map((d) => ({ x: d.x, z: d.z })),
    total() {
      let s = 0;
      for (let k = 0; k < T.length; k++) s += T[k];
      return s * SX * SZ;
    },
    flush() {
      if (dirty) rebuild();
    },
  };
  g.userData.sand = sand;
  g.userData.update = () => {
    if (dirty) rebuild();
  };
  // 画廊里试扫：?sweep=1 每秒在北端扫一下
  if (ctx.params.get('sweep') === '1') {
    let acc = 0;
    let k = 0;
    g.userData.update = (dt: number) => {
      acc += dt;
      if (acc > 0.15) {
        acc = 0;
        k++;
        const x = -6.5 + ((k * 0.35) % 13);
        sand.sweep(x, -12.9, 0.7, 0.08);
      }
      if (dirty) rebuild();
    };
  }

  // 铺面外沿一圈矮路缘（水泥，高 0.12、宽 2 纹素）：把球场从沙里"框"出来；朝镜头的南沿落暗档成一条细暗线
  {
    const W = TX * 2;
    const Hc = 0.12;
    const curbMat = ctx.mat('concrete');
    const ex = NX * TX * 0.5;
    const ez = NZ * TZ * 0.5;
    for (const [sx, sz, px, pz] of [
      [ex * 2 + W * 2, W, 0, -ez - W / 2],
      [ex * 2 + W * 2, W, 0, ez + W / 2],
      [W, ez * 2, -ex - W / 2, 0],
      [W, ez * 2, ex + W / 2, 0],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, Hc, sz), curbMat);
      b.position.set(px, Hc / 2 - 0.02, pz);
      b.name = 'court:curb';
      g.add(b);
    }
  }
  ctx.mats.prepare(g);
  for (const m of surfaceMeshes) m.castShadow = false;
  sandMesh.castShadow = false;
  crestMesh.castShadow = false;
  return g;
}
