// 小瀑布：从崖顶弯过崖沿、落进水池。3.6 宽 × 4.95 高 × 0.3 厚，贴在崖面前；本地原点 = 水池水面那一点，面朝 +z。
// 做法（参考《垂钓手记》的瀑布，只看不抄）：
//   - 水帘 = 一张竖的薄片，底色是泡沫家的暗档（浅灰蓝），上面一列列宽窄不一（2～4 纹素）的浅冰蓝竖带（泡沫中档），
//     一段段有长有短；竖带按纹素整格往下流（每列自己的速度，没有柔和的渐变）。
//   - 顶上一道弯过崖沿的亮边（四分之一圆柱，泡沫亮档），下面一行冰蓝（水在沿上变厚）。
//   - 底部：水帘最下面几行变白（水花），脚下一排扁的泡沫团（顶亮白、前下半冰蓝），一跳一跳（按纹素整格地胀缩）。
//   亮档在午后配色里是奶白：只放在崖沿、水花、泡沫团（水帘中间的亮白短带读成一块块奶白方块，删了）。
// 三档是"挑"出来的（bands 定死，不看光）：水是自己亮的那种东西，太阳在后面也不能让水帘落成黑块。
// 都不接收投影（薄片 + 会动的东西），也不投影（瀑布落在崖的影子里，水帘的影子只会在池面上压一块黑）。
// userData.update(dt, t) 让竖带往下流、泡沫团胀缩；userData.flow = 流速倍数（默认 1，0 = 停）。
import * as THREE from 'three';
import { blobNormals } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

const T = 0.09;
/** 竖直方向一个设计纹素行（米）：0.09 / cos45 */
const VROW = T / Math.SQRT1_2;

/** 定死的档位：l = dot(N, 光) 在 −1..1 之间，阈值放到范围外就永远落在那一档 */
const LIT = { bands: [-3, -2] as [number, number] };
const MID = { bands: [-3, 3] as [number, number] };
const DARK = { bands: [3, 4] as [number, number] };
const QUIET = { edge: 0.05, convex: 0, noShadowReceive: true };

interface Dash {
  /** 在一圈（长 loop）里的起点：离水帘顶多少行 */
  a: number;
  /** 长几行 */
  len: number;
}
interface Column {
  x0: number;
  x1: number;
  /** 每秒往下几行 */
  speed: number;
  /** 一圈多少行（≥ 水帘行数 + 最长的带） */
  loop: number;
  dashes: Dash[];
  /** 这一列的带在几何体里从第几个四边形开始（每条带两个：本身 + 绕回来的那一份） */
  q0: number;
}

/** 一组可改 y 的四边形（竖直，面朝 +z）：每个 4 个顶点、2 个三角形 */
function quads(n: number, z: number): THREE.BufferGeometry {
  const pos = new Float32Array(n * 4 * 3);
  const nor = new Float32Array(n * 4 * 3);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      pos[(i * 4 + k) * 3 + 2] = z;
      nor[(i * 4 + k) * 3 + 2] = 1;
    }
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
/** 第 i 个四边形 = x0..x1 × y0..y1（y0 > y1 时塌成 0 高） */
function setQuad(g: THREE.BufferGeometry, i: number, x0: number, x1: number, yLo: number, yHi: number) {
  const p = g.attributes.position.array as Float32Array;
  const h = Math.max(0, yHi - yLo);
  const ys = [yLo, yLo, yLo + h, yLo + h];
  const xs = [x0, x1, x1, x0];
  for (let k = 0; k < 4; k++) {
    p[(i * 4 + k) * 3] = xs[k];
    p[(i * 4 + k) * 3 + 1] = ys[k];
  }
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'waterfall';
  const rnd = ctx.rng(`waterfall:${ctx.variant}`);
  const W = 3.6;
  const H = 4.95;
  const zF = 0.15; // 水帘正面
  const lipR = 0.3; // 崖沿的弯：半径 = 厚度
  const yTop = H - lipR; // 水帘顶（弯下来的地方）
  const foamRows = 3; // 水帘最下面几行是白的水花
  const yBot = 0.12; // 水帘底（再往下埋进泡沫团）
  const rows = Math.round((yTop - yBot) / VROW); // 水帘一共几行
  const ySheetBot = yTop - rows * VROW;

  // ── 水帘底色：泡沫的暗档（浅灰蓝，L ≈ 165）──
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(W, yTop - ySheetBot).translate(0, (yTop + ySheetBot) / 2, zF),
    ctx.mat('foam', { ...DARK, ...QUIET }),
  );
  g.add(base);

  // ── 崖沿的亮边：四分之一圆柱（从崖顶水平 → 往下竖直），轴沿 x ──
  const lip = new THREE.CylinderGeometry(lipR, lipR, W, 10, 1, true, 0, Math.PI / 2)
    .rotateZ(Math.PI / 2) // 轴转到 x
    .translate(0, yTop, zF - lipR);
  // 圆柱开口那一段：θ 0 → π/2 要落在 +y → +z 这一象限（rotateZ 后检查：顶点在 y ≥ yTop、z ≥ zF − lipR）
  const lp = lip.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const y = lp.getY(i) - yTop;
    const z = lp.getZ(i) - (zF - lipR);
    // 映到正确的象限（不同 three 版本的 θ 起点不一样，这里直接按角度重排）
    const r = Math.hypot(y, z);
    const ang = Math.atan2(Math.abs(z), Math.abs(y));
    lp.setY(i, yTop + r * Math.cos(ang));
    lp.setZ(i, zF - lipR + r * Math.sin(ang));
  }
  lip.computeVertexNormals();
  g.add(new THREE.Mesh(lip, ctx.mat('foam', { ...LIT, ...QUIET })));

  // ── 水帘顶下面一行冰蓝（水在沿上变厚）+ 最下面几行白水花（静止的部分）──
  const midMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(W, VROW).translate(0, yTop - VROW / 2, zF + 0.004),
    ctx.mat('foam', { ...MID, ...QUIET }),
  );
  g.add(midMesh);
  const spray = new THREE.Mesh(
    new THREE.PlaneGeometry(W, foamRows * VROW).translate(0, ySheetBot + (foamRows * VROW) / 2, zF + 0.012),
    ctx.mat('foam', { ...LIT, ...QUIET }),
  );
  g.add(spray);

  // ── 竖带：把 40 纹素宽分成 2～4 纹素的列，每列要么是冰蓝的长带（一段段、有长有短），要么空着露底色 ──
  // （亮档在午后配色里偏奶白：水帘中间放亮白的短带 = 一块块奶白的方块，不像水；亮白只留给崖沿、水花、泡沫团）
  const flowRows = rows - 1 - foamRows; // 竖带走的那段（顶下一行冰蓝和底下的水花之间）
  const cols: Column[] = [];
  const nCells = Math.round(W / T);
  let c = 0;
  let prevEmpty = false;
  let quadsN = 0;
  while (c < nCells) {
    const w = Math.min(nCells - c, 2 + Math.floor(rnd() * 3));
    // 65% 有带、35% 空；不连着两列空（不然中间一大块平涂）
    const empty: boolean = !prevEmpty && rnd() < 0.35;
    prevEmpty = empty;
    if (!empty) {
      const maxLen = 16;
      const loop = flowRows + maxLen + Math.floor(rnd() * 8);
      const dashes: Dash[] = [];
      let a = Math.floor(rnd() * 6);
      while (a < loop - 2) {
        const len = 5 + Math.floor(rnd() * 12);
        const l = Math.min(len, loop - a - 1);
        if (l >= 2) dashes.push({ a, len: l });
        a += l + 2 + Math.floor(rnd() * 6);
      }
      const speed = 9 + rnd() * 7; // 每秒 9～16 行（≈ 1.1～2 米/秒）
      cols.push({ x0: -W / 2 + c * T, x1: -W / 2 + (c + w) * T, speed, loop, dashes, q0: quadsN });
      quadsN += dashes.length * 2;
    }
    c += w;
  }
  const geo = quads(quadsN, zF + 0.006);
  // 竖带的几何体每帧改 y：包围盒按整面水帘给死（不让 three 每帧重算）
  const bb = new THREE.Box3(new THREE.Vector3(-W / 2, 0, zF), new THREE.Vector3(W / 2, H, zF + 0.01));
  geo.boundingBox = bb.clone();
  geo.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());
  const dashMesh = new THREE.Mesh(geo, ctx.mat('foam', { ...MID, ...QUIET }));
  dashMesh.frustumCulled = false;
  g.add(dashMesh);
  const yFlowTop = yTop - VROW; // 竖带从冰蓝那行下面开始
  /** 第 off 行（整数）时的竖带位置 */
  const place = (col: Column, off: number) => {
    col.dashes.forEach((d, k) => {
      const a = (d.a + off) % col.loop;
      for (let rep = 0; rep < 2; rep++) {
        const u0 = Math.max(0, a - rep * col.loop); // 离竖带顶几行（往下为正）
        const u1 = Math.min(flowRows, a - rep * col.loop + d.len);
        const yHi = yFlowTop - u0 * VROW;
        const yLo = yFlowTop - u1 * VROW;
        setQuad(geo, col.q0 + k * 2 + rep, col.x0, col.x1, yLo, u1 > u0 ? yHi : yLo);
      }
    });
  };
  const offs = cols.map(() => -1);
  let flowT = 0;
  const updateDashes = () => {
    let dirty = false;
    cols.forEach((col, i) => {
      const off = Math.floor(flowT * col.speed + col.loop * 0.37 * i) % col.loop;
      if (off !== offs[i]) {
        offs[i] = off;
        place(col, off);
        dirty = true;
      }
    });
    if (dirty) geo.attributes.position.needsUpdate = true;
  };

  // ── 脚下的泡沫团：扁的白团，一排横过水帘底，往前溢出一点；每团自己一个节拍胀缩（整纹素）──
  const puffs: { mesh: THREE.Mesh; s0: number; ph: number; per: number }[] = [];
  const nP = 7;
  // 团顶亮白、团的前下半落冰蓝（一团一团分得开，不并成一条奶白带）
  const puffMat = ctx.mat('foam', { lightUp: 0.6, bands: [-0.6, 0.3], edge: 0.05, convex: 0.2, noShadowReceive: true });
  for (let i = 0; i < nP; i++) {
    const r = 0.36 + rnd() * 0.2;
    const x = -W / 2 + 0.3 + (i / (nP - 1)) * (W - 0.6) + (rnd() - 0.5) * 0.2;
    const z = zF + 0.05 + rnd() * 0.25;
    const pg = blobNormals(new THREE.IcosahedronGeometry(r, 1), new THREE.Vector3(0, 0, 0));
    const m = new THREE.Mesh(pg, puffMat);
    m.position.set(Math.round(x / T) * T, 0.02, z);
    m.scale.set(1, 0.42, 0.7);
    g.add(m);
    puffs.push({ mesh: m, s0: r, ph: rnd(), per: 0.35 + rnd() * 0.3 });
  }
  const updatePuffs = (t: number) => {
    for (const p of puffs) {
      // 两拍：大一纹素 / 原样（不是连续的缩放）
      const big = Math.floor(t / p.per + p.ph * 2) % 2 === 0;
      const k = big ? (p.s0 + T * 0.5) / p.s0 : 1;
      p.mesh.scale.set(k, 0.42 * k, 0.7 * k);
    }
  };

  g.userData.flow = 1;
  g.userData.update = (dt: number, t: number) => {
    const flow = typeof g.userData.flow === 'number' ? g.userData.flow : 1;
    flowT += dt * flow;
    updateDashes();
    updatePuffs(t);
  };
  // 定格（画廊 pause=1、截图）也要有竖带
  updateDashes();
  updatePuffs(0);

  ctx.mats.prepare(g, { cast: false, receive: false });
  return g;
}
