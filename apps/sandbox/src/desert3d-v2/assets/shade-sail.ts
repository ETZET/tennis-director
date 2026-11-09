// 遮阳帆：一块四角帆布（奶油底 + 两条珊瑚宽条纹），三个角拴在三根晒白的歪木杆上，
// 第四个角（前右，下风）绳子断了：布角垂下来，在风里翻（CPU 顶点动画，读 uWind / uGust）。第四根杆空着站在那儿。
// 4.6 × 3.0 × 3.4 米。投影是北台上最大的一块影子（长椅在它下面）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../world';
import { FABRIC_TONES, grain, paint, STRIPE_TONES, WEATHERED_TONES } from './bench/mats';

/** 两点之间的一根方杆（粗 t） */
function bar(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, d.length(), t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** 道具的明暗：光往上（偏镜头）多一半 → 顶面亮、朝镜头的立面中档、底面和背面暗 */
const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`shade-sail:${ctx.variant}`);
  const g = new THREE.Group();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ── 杆：四根，粗 0.36 米（4 纹素），每根都歪一点；顶上一个大一圈的帽 ──
  // 角：0 后左（高）、1 后右（低）、2 前右（断了）、3 前左（低）→ 高低交错，帆布有扭（双曲面）
  const feet = [v(-2.1, 0, -1.5), v(2.05, 0, -1.55), v(2.1, 0, 1.45), v(-2.05, 0, 1.5)];
  const heights = [3.0, 2.45, 2.55, 2.15];
  const lean = [v(-0.08, 0, -0.06), v(0.06, 0, -0.08), v(0.22, 0, 0.1), v(-0.06, 0, 0.08)];
  const tops = feet.map((f, i) => f.clone().add(lean[i]).setY(heights[i]));
  const posts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    posts.push(bar(feet[i], tops[i], 0.36));
    // 杆帽：方的，比杆宽 1 纹素
    const cap = new THREE.BoxGeometry(0.46, 0.14, 0.46);
    cap.translate(tops[i].x, tops[i].y + 0.07, tops[i].z);
    posts.push(cap);
  }
  // 材质规范 v2：整根晒白的木杆 = 顺着杆的木纹（屏幕上 2 × 7 纹素的竖长条，三档里挑色，不画缝）
  g.add(
    new THREE.Mesh(
      mergeGeometries(posts),
      ctx.mat('woodWeathered', { ...PROP, elem: grain(6), tones: WEATHERED_TONES, toneW: [0.26, 0.26] }),
    ),
  );

  // ── 帆布：(u, v) 网格，u 沿 x（左→右），v 沿 z（后→前）。所有顶点共用一个 position 属性，
  //    按条纹分成两个网格（各自的 index）：一份数据，每帧改一次 ──
  const NU = 16;
  const NV = 12;
  const inset = 0.12; // 角在杆内侧一点，看起来是拴在杆上
  const C = tops.map((t, i) => {
    const c = t.clone();
    c.x += i === 0 || i === 3 ? inset : -inset;
    c.z += i < 2 ? inset : -inset;
    c.y -= 0.1;
    return c;
  });
  const P = new Float32Array((NU + 1) * (NV + 1) * 3);
  const pos = new THREE.BufferAttribute(P, 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  const nrm = new THREE.BufferAttribute(new Float32Array(P.length), 3);
  nrm.setUsage(THREE.DynamicDrawUsage);
  const idxCream: number[] = [];
  const idxStripe: number[] = [];
  const idxAll: number[] = [];
  const vid = (i: number, j: number) => j * (NU + 1) + i;
  // 条纹：沿 u 方向的两条宽带（v 的第 3～4 格、第 7～8 格），宽 ≈ 0.55 米 = 6 纹素
  const isStripe = (j: number) => j === 2 || j === 3 || j === 7 || j === 8;
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = vid(i, j);
      const b = vid(i + 1, j);
      const c = vid(i + 1, j + 1);
      const d = vid(i, j + 1);
      // 卷绕让法线朝上（+y）
      const tri = [a, d, b, b, d, c];
      (isStripe(j) ? idxStripe : idxCream).push(...tri);
      idxAll.push(...tri);
    }
  }
  const mkGeo = (idx: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', nrm);
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(v(0, 1.5, 0), 4.5);
    geo.boundingBox = new THREE.Box3(v(-2.6, 0, -2), v(3.4, 3.2, 3.2));
    return geo;
  };
  const all = mkGeo(idxAll); // 只用来算法线
  const side = { side: THREE.DoubleSide };
  // 材质规范 v2：帆布 = 漆面那套有机深浅（晒褪/积灰的斑，13 × 7 纹素）+ 少量织纹短划（按斑块疏密）；条纹边是网格的边，干净利落。
  // 深浅斑按世界 xz 取：绷着的部分只上下鼓（xz 不动），斑不会在布上游
  const cream = new THREE.Mesh(
    mkGeo(idxCream),
    ctx.mat('fabric', { ...PROP, ...side, elem: paint([13, 7], [0.01, 0.1], 5), tones: FABRIC_TONES }),
  );
  const stripe = new THREE.Mesh(
    mkGeo(idxStripe),
    ctx.mat('fabricStripe', { ...PROP, ...side, elem: paint([13, 7], [0.01, 0.1], 6), tones: STRIPE_TONES }),
  );
  g.add(cream, stripe);

  // 断角：以 uu + vv = HINGE 这条斜线为折痕，外面那一角的布折下来挂着（像一扇翻下来的门），在风里绕折痕翻。
  // 绷着的部分照常是双线性 + 下垂。折下来的那片露出背面（暗档）→ 一眼看出"这角松了"。
  const HINGE = 1.2;
  const taut = (uu: number, vv: number, out: THREE.Vector3) => {
    out
      .set(0, 0, 0)
      .addScaledVector(C[0], (1 - uu) * (1 - vv))
      .addScaledVector(C[1], uu * (1 - vv))
      .addScaledVector(C[2], uu * vv)
      .addScaledVector(C[3], (1 - uu) * vv);
    out.y -= 0.32 * Math.sin(Math.PI * Math.min(1, uu)) * Math.sin(Math.PI * Math.min(1, vv));
    return out;
  };
  const M = taut(HINGE / 2, HINGE / 2, new THREE.Vector3()); // 折痕中点
  const cornerT = taut(1, 1, new THREE.Vector3());
  const flapLen = cornerT.distanceTo(M); // 折下来那片的长度（中点到角）
  const hingeDir = taut(1, HINGE - 1, new THREE.Vector3())
    .sub(taut(HINGE - 1, 1, new THREE.Vector3()))
    .normalize();
  const phase = rnd() * 10;
  const tmp = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const flap = new THREE.Vector3();
  const across = new THREE.Vector3();
  const wind = new THREE.Vector2();

  const shape = (t: number) => {
    const u = ctx.uniforms;
    wind.copy(u.uWind.value);
    const ws = Math.min(1.2, wind.length());
    const gust = u.uGust.value;
    const wx = ws > 1e-3 ? wind.x / ws : 1;
    const wz = ws > 1e-3 ? wind.y / ws : 0;
    // 折下来那片的朝向：静止时往外往下垂；风把它顺风掀起来，快慢两种频率叠加，阵风来时整片翻上去
    const k = ws * (0.6 + gust * 0.8);
    const f1 = Math.sin(t * 4.6 + phase);
    const f2 = Math.sin(t * 11.3 + phase * 1.7);
    const lift = Math.max(0, Math.sin(t * 0.9 + phase)) * gust * ws;
    flap
      .set(
        0.35 + wx * k * (0.6 + 0.3 * f1),
        -2.4 + k * (0.7 + 0.6 * f1 + 0.15 * f2) + lift * 1.4,
        1.3 + wz * k * (0.6 + 0.3 * f1),
      )
      .normalize();
    // 布整体：风大时往上鼓一点
    const billow = (0.06 + 0.12 * gust) * ws;
    for (let j = 0; j <= NV; j++) {
      const vv = j / NV;
      for (let i = 0; i <= NU; i++) {
        const uu = i / NU;
        const d = uu + vv - HINGE;
        if (d <= 0) {
          taut(uu, vv, tmp);
          tmp.y += billow * Math.sin(Math.PI * uu) * Math.sin(Math.PI * vv) * Math.sin(t * 1.3 + uu * 2.0 + phase);
        } else {
          // 折痕上的垂足 + 沿翻下来的方向走同样的距离（布不伸长）
          taut(uu - d / 2, vv - d / 2, foot);
          const dist = taut(uu, vv, tmp).distanceTo(foot);
          const r = dist / flapLen; // 0 折痕 … 1 角尖
          // 抖：波从折痕往角尖传，越往尖越大；再往横向甩一点
          across.copy(hingeDir).multiplyScalar(Math.sin(t * 9.0 - r * 5.0 + phase) * 0.18 * r * (0.4 + k));
          tmp.copy(foot).addScaledVector(flap, dist).add(across);
          tmp.y += Math.sin(t * 7.0 - r * 4.0 + phase) * 0.12 * r * (0.4 + k);
        }
        const n = vid(i, j) * 3;
        P[n] = tmp.x;
        P[n + 1] = tmp.y;
        P[n + 2] = tmp.z;
      }
    }
    pos.needsUpdate = true;
    all.computeVertexNormals(); // 写进共用的 normal 属性
    nrm.needsUpdate = true;
  };
  shape(0);

  // 帆布不接投影（自己的抖动影子在布上是满屏的毛边噪点），但投影在地上
  ctx.mats.prepare(g);
  cream.receiveShadow = false;
  stripe.receiveShadow = false;
  g.userData.update = (_dt: number, t: number) => shape(t);
  return g;
}
