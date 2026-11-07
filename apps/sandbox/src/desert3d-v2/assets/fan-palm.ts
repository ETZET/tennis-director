// 加州蒲葵（Washingtonia filifera）：场景的主框剪影。
// 照参考图的树语言：叶冠 = 十来团胖胖的"扇簇"（每团自己的球面法线，再往冠心法线混一半 → 整冠一个亮顶、青色暗底），
// 外沿挂几颗粗叶尖（≥ 4 纹素）让剪影读成扇叶而不是西兰花；冠下是一大团下垂的枯叶裙（草秆棕，下摆参差），
// 再下面是 ≥ 6 纹素粗的树干，几道一纹素的环纹。三种材质同一套风摆参数 → 整棵树一起弯。
// 变体 v0..2：高度、倾斜方向、裙子长短、冠大小不同。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../world';

interface Variant {
  /** 总高（米，冠顶） */
  h: number;
  /** 冠顶在 x 方向的偏移（米，倾斜/弯曲） */
  lean: number;
  /** 冠顶在 z 方向的偏移 */
  leanZ: number;
  /** 枯叶裙长度占树干（冠底以下）的比例 */
  skirt: number;
  /** 冠半径 */
  crown: number;
}

const VARIANTS: Variant[] = [
  { h: 8.5, lean: 0.55, leanZ: 0.1, skirt: 0.6, crown: 2.3 },
  { h: 9.4, lean: -0.75, leanZ: -0.15, skirt: 0.45, crown: 2.45 },
  { h: 7.2, lean: 0.3, leanZ: 0.2, skirt: 0.78, crown: 2.1 },
];

type G = THREE.BufferGeometry;

/** 只留 position、normal（合并要求属性一致） */
function clean(g: G): G {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  return out;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const vi = ((ctx.variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
  const V = VARIANTS[vi];
  const rnd = ctx.rng(`fan-palm:${vi}`);
  const T = ctx.texel;

  const crownR = V.crown;
  const crownC = new THREE.Vector3(0, V.h - crownR * 0.62, 0); // 冠心
  const trunkTop = crownC.y - 0.2;
  // 树干中心线：x/z 偏移按高度的平方（底直、上弯）
  const bend = (y: number) => {
    const k = Math.min(1, y / V.h) ** 2;
    return new THREE.Vector3(V.lean * k, y, V.leanZ * k);
  };
  const topP = bend(crownC.y);
  crownC.x = topP.x;
  crownC.z = topP.z;

  // 三种材质同一套风摆：整棵树按高度平方一起弯
  const sway = { sway: 0.16, swayH: V.h };

  // ── 树干：锥柱（底 0.36、顶 0.28 半径 ≈ 6～8 纹素宽），按中心线弯；环纹用顶点色（0.84）──
  const trunkGeo = (() => {
    const segH = T * 2;
    const rows = Math.ceil(trunkTop / segH);
    const g = new THREE.CylinderGeometry(0.28, 0.36, trunkTop, 8, rows, true);
    g.translate(0, trunkTop / 2, 0);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const c = bend(y);
      // 根部略张开
      const flare = 1 + Math.max(0, 0.6 - y) * 0.45;
      p.setXYZ(i, p.getX(i) * flare + c.x, y, p.getZ(i) * flare + c.z);
    }
    g.computeVertexNormals();
    const ng = g.toNonIndexed();
    const pp = ng.getAttribute('position');
    const col = new Float32Array(pp.count * 3);
    // 环纹：几道 1 行（≈1.5 纹素）深一点的环，间距不等
    const rings: number[] = [];
    for (let y = 0.7 + rnd() * 0.4; y < trunkTop * (1 - V.skirt); y += 0.75 + rnd() * 0.6) rings.push(y);
    for (let i = 0; i < pp.count; i += 3) {
      const yc = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3;
      const ring = rings.some((r) => Math.abs(yc - r) < segH * 0.55);
      const v = ring ? 0.82 : 1;
      for (let k = 0; k < 3; k++) col.set([v, v, v], (i + k) * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ng.deleteAttribute('uv');
    return ng;
  })();

  // ── 枯叶裙：下垂的胖团（lathe），上宽下窄，下摆按角度参差 ──
  const skirtGeo = (() => {
    const len = trunkTop * V.skirt + 0.6;
    const top = crownC.y + 0.1;
    const bot = top - len;
    const seg = 18;
    const rTop = 0.9;
    const rMax = 1.2;
    const rBot = 0.8;
    // 每个角度一个下摆长度（成块：相邻两格一组，像一绺绺枯叶）
    const hem: number[] = [];
    for (let i = 0; i < seg; i++) hem.push(i % 2 === 0 ? 0.05 + rnd() * 0.15 : 0.3 + rnd() * 0.45);
    const rows = 7;
    const pos: number[] = [];
    const nrm: number[] = [];
    const P = (i: number, j: number) => {
      const a = ((i % seg) / seg) * Math.PI * 2;
      const t = j / rows; // 0 顶 → 1 底
      const ext = t === 1 ? hem[i % seg] : t * t * hem[i % seg] * 0.5;
      const y = top - (top - bot) * t - ext;
      // 轮廓：顶部收进、中上鼓、往下收；每绺略有起伏
      const prof = t < 0.25 ? rTop + (rMax - rTop) * (t / 0.25) : rMax + (rBot - rMax) * ((t - 0.25) / 0.75);
      const r = prof * (1 + (i % 2 === 0 ? 0.04 : -0.03)) + (t === 1 ? 0.05 : 0);
      const c = bend(y);
      return [c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r, Math.cos(a), Math.sin(a), t] as const;
    };
    const push = (v: ReturnType<typeof P>) => {
      pos.push(v[0], v[1], v[2]);
      // 法线：径向 + 上偏（顶亮、腰中、下摆暗）
      const up = v[5] > 0.99 ? -0.45 : 0.55 - v[5] * 0.55;
      const n = new THREE.Vector3(v[3], up, v[4]).normalize();
      nrm.push(n.x, n.y, n.z);
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < seg; i++) {
        const a = P(i, j);
        const b = P(i + 1, j);
        const c = P(i, j + 1);
        const d = P(i + 1, j + 1);
        // 朝外的面（逆时针从外看）
        push(a);
        push(b);
        push(c);
        push(b);
        push(d);
        push(c);
      }
    }
    // 底面一圈（从下往上看封口，免得看穿）
    const yb = bot - 0.1;
    const cb = bend(yb);
    for (let i = 0; i < seg; i++) {
      const a = P(i, rows);
      const b = P(i + 1, rows);
      push(a);
      push(b);
      pos.push(cb.x, yb + 0.15, cb.z);
      nrm.push(0, -1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    return g;
  })();

  // ── 叶冠：扇簇 ──
  const crownParts: G[] = [];
  /** 一个扇簇：压扁拉长的球（局部 x = 往外），外沿挂粗叶尖；放到冠心旁边，方位 az、下垂 tilt */
  const fan = (az: number, tilt: number, off: number, ry: number, a: number, b: number, c: number, teeth: number) => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const parts: G[] = [];
    const p = g.getAttribute('position');
    const jit = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      let k = jit.get(key);
      if (k === undefined) {
        k = 1 + (rnd() - 0.5) * 0.12;
        jit.set(key, k);
      }
      // 外半边往下垂（扇面弯成伞）
      const xx = x * a * k;
      const droop = Math.max(0, x) ** 2 * 0.25;
      p.setXYZ(i, xx, y * b * k - droop, z * c * k);
    }
    parts.push(clean(g));
    // 叶尖：扁四棱锥，沿外沿排开，朝外朝下
    for (let t = 0; t < teeth; t++) {
      const s = teeth === 1 ? 0 : (t / (teeth - 1)) * 2 - 1;
      const tg = new THREE.CylinderGeometry(0.11, 0.3, 0.7 + rnd() * 0.2, 4);
      tg.scale(1, 1, 0.8);
      tg.translate(0, 0.35, 0);
      // +y → 外下方
      const dir = new THREE.Vector3(1, -0.55 - Math.abs(s) * 0.2, s * 0.9).normalize();
      tg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      tg.translate(a * 0.78, -b * 0.35 - 0.2, s * c * 0.62);
      parts.push(clean(tg));
    }
    const m = mergeGeometries(parts)!;
    m.rotateZ(-tilt);
    m.rotateY(-az);
    const cx = crownC.x + Math.cos(az) * off;
    const cz = crownC.z + Math.sin(az) * off;
    const cy = crownC.y + ry;
    m.translate(cx, cy, cz);
    // 法线：本团球面法线（团心稍靠内靠下）与冠心法线各一半
    const bc = new THREE.Vector3(
      crownC.x + Math.cos(az) * off * 0.6,
      cy - b * 0.3,
      crownC.z + Math.sin(az) * off * 0.6,
    );
    const cc = crownC.clone().add(new THREE.Vector3(0, -crownR * 0.25, 0));
    const pp = m.getAttribute('position');
    const nn = m.getAttribute('normal') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const n1 = new THREE.Vector3();
    const n2 = new THREE.Vector3();
    for (let i = 0; i < pp.count; i++) {
      v.fromBufferAttribute(pp, i);
      n1.copy(v).sub(bc).normalize();
      n2.copy(v).sub(cc).normalize();
      n1.multiplyScalar(0.65).addScaledVector(n2, 0.35).normalize();
      nn.setXYZ(i, n1.x, n1.y, n1.z);
    }
    crownParts.push(m);
  };

  const R = crownR;
  const a0 = rnd() * Math.PI * 2;
  // 下圈：6 簇，往外往下垂（伞沿）
  for (let i = 0; i < 6; i++) {
    const az = a0 + (i / 6) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
    fan(az, 0.62 + rnd() * 0.15, R * 0.6, -R * 0.15, R * 0.56, R * 0.19, R * 0.34, 3);
  }
  // 上圈：4 簇，略朝上
  for (let i = 0; i < 4; i++) {
    const az = a0 + Math.PI / 6 + (i / 4) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    fan(az, 0.12 + rnd() * 0.12, R * 0.3, R * 0.15, R * 0.42, R * 0.22, R * 0.34, 2);
  }
  // 顶：一团圆顶
  fan(a0, 0, 0, R * 0.32, R * 0.36, R * 0.24, R * 0.36, 0);

  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    trunkGeo,
    ctx.mat('palmTrunk', { ...sway, vertexColors: true, lightUp: 0.5, bands: [-0.4, 0.35], noShadowReceive: true }),
  );
  const skirt = new THREE.Mesh(
    skirtGeo,
    ctx.mat('palmSkirt', { ...sway, noShadowReceive: true, bands: [-0.3, 0.1], noise: 0.12, lightUp: 0.65 }),
  );
  const crown = new THREE.Mesh(
    mergeGeometries(crownParts)!,
    ctx.mat('palm', { ...sway, noShadowReceive: true, bands: [-0.08, 0.45] }),
  );
  g.add(trunk, skirt);
  g.userData.tris = [trunkGeo, skirtGeo, crown.geometry].reduce((n, q) => n + q.getAttribute('position').count / 3, 0);
  if (ctx.params.get('palm') !== 'nocrown') g.add(crown);
  ctx.mats.prepare(g);
  return g;
}
