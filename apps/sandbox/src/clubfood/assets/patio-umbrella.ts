// #11 patio-umbrella · 野餐桌的遮阳伞（3 把，放在野餐桌同一点：伞杆从桌面中心的洞穿出来）。
// 尺寸：⌀ 2.5、顶 2.5 米（撑开时伞沿在 2.08，往下一圈 0.16 米的短垂边）；杆 metal 方杆 0.2（1.25 米以上 0.12：
// 撑开时那截在伞面后面看不见，收起时裹在布卷里），底座 concrete（⌀ 0.64 × 0.1，地上）；杆顶一颗小帽 0.2。
// 伞面 8 片：主色 / 奶油（clothWhite）相间；一片的中线朝正南（屏幕上伞沿的前边是平的）。伞面朝天 = 亮档，
// 法线手算（撑开 = 从伞下 0.3 米那点往外的圆顶法线，收起 = 横着朝外），lightUp + 低 bands：整面亮档、南沿和垂边落中档。
// 伞面 paint（space local，轻微深浅块，不加擦痕）；不接投影（noShadowReceive），双面（不然投影贴图里没有伞面）。
// 收起 = 伞骨贴着杆垂下（骨尖离杆 0.14、在 ≈ 1.2 米），每片布在两根骨之间往外鼓（鼓点在 ≈ 1.68 米：主色的片离杆 0.36、
// 奶油的片 0.24 折在里面 → 卷读成主色，奶油只在折缝里）→ 一根细长的卷（杆顶 2.5 + 帽）。
// 粉伞（v0）：粉和奶油亮档差 ≈ 70 > 60（8 条片缝全是强边缘）→ 布不加深浅块，粉定死取“高一级”、奶油“低一级”（差 ≈ 50）；
// v1 / v2 布用 paint 深浅块。
// 变体：v0 粉（accPaleta）撑开，v1 芥末黄（accChurro）撑开，v2 薄荷（accCoffee）收起。
// userData：setOpen(k)（0 收起 … 1 撑开，中间连续：骨的张角、布的鼓点、垂边的长短都按 k 插值），open（当前 k）。
//   画廊里 ?open=0.5 可以看中间的样子。
// 本地原点 = 杆脚（地面），+z 朝镜头（南）。三角形 124（伞面 56、杆 36、底座 32）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import type { Accent } from '../palette';

const N = 8;
const R = 1.25;
const APEX = 2.5;
const DROP = 0.42;
const LR = Math.hypot(R, DROP);
const PHI_O = Math.atan2(R, DROP);
const PHI_C = Math.asin(0.14 / LR);
/** 收起时布鼓出来的那点：离杆（主色的片鼓得多、奶油的片折在里面 → 收起的卷读成主色，奶油只在折缝里）、高度 */
const BULGE_ACC = 0.36;
const BULGE_CREAM = 0.24;
const BULGE_Y = APEX - 0.62 * LR;
const VALANCE = 0.16;
/** 杆宽（方杆，2 设计纹素多一点）；收起时布卷住的上半截细一点（撑开时伞下的上半截在画面里被伞面挡住） */
const POLE_W = 0.2;
const POLE_TOP_W = 0.12;
const POLE_SPLIT = 1.25;

const ACC: Accent[] = ['accPaleta', 'accChurro', 'accCoffee'];
const OPEN0 = [1, 1, 0];

type V = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** 一片伞面（第 k 片）在张开程度 e 时的三角形：[a, b, c, 法线 a, b, c] */
function panelTris(k: number, e: number): [V, V, V, V, V, V][] {
  const phi = PHI_C + (PHI_O - PHI_C) * e;
  // 骨在 (k ± 0.5) × 45°（θ 从 +x 往 +z 量）：片的中线在 k × 45°，k = 2 那片朝正南
  const th0 = ((k - 0.5) * Math.PI * 2) / N;
  const th1 = ((k + 0.5) * Math.PI * 2) / N;
  const thm = (k * Math.PI * 2) / N;
  const tip = (th: number) =>
    v3(Math.sin(phi) * Math.cos(th) * LR, APEX - Math.cos(phi) * LR, Math.sin(phi) * Math.sin(th) * LR);
  const A = v3(0, APEX, 0);
  const T0 = tip(th0);
  const T1 = tip(th1);
  const Mo = T0.clone().add(T1).multiplyScalar(0.5);
  const br = k % 2 === 0 ? BULGE_ACC : BULGE_CREAM;
  const Mc = v3(br * Math.cos(thm), BULGE_Y, br * Math.sin(thm));
  const M = Mc.lerp(Mo, e);

  // 法线：撑开 = 从伞下那点往外（圆顶），收起 = 横着朝外，越往卷的尖越朝上；垂边 = 朝外 0.8 + 朝上 0.6
  const nCanopy = (p: V) => {
    const no = p
      .clone()
      .sub(v3(0, 0.3, 0))
      .normalize();
    const h = v3(p.x, 0, p.z);
    const up = 0.6 + 1.2 * Math.max(0, (p.y - BULGE_Y) / (APEX - BULGE_Y));
    const nc = (h.lengthSq() < 1e-8 ? v3(0, 1, 0) : h.normalize()).add(v3(0, up, 0)).normalize();
    return nc.lerp(no, e).normalize();
  };
  const nVal = (p: V) =>
    v3(p.x, 0, p.z)
      .normalize()
      .multiplyScalar(0.8)
      .add(v3(0, 0.6, 0))
      .normalize();

  const out: [V, V, V, V, V, V][] = [];
  const tri = (a: V, b: V, c: V, n: (p: V) => V) => out.push([a, b, c, n(a), n(b), n(c)]);
  tri(A, T0, M, nCanopy);
  tri(A, M, T1, nCanopy);
  tri(T0, T1, M, nCanopy);
  // 垂边：从骨尖 – 鼓点 – 骨尖往下挂（收起时缩成 0）
  const h = VALANCE * e * e;
  const dn = (p: V) => p.clone().add(v3(0, -h, 0));
  for (const [p, q] of [
    [T0, M],
    [M, T1],
  ] as [V, V][]) {
    tri(p, q, dn(q), nVal);
    tri(p, dn(q), dn(p), nVal);
  }
  return out;
}

/** 写进位置 / 法线缓冲；三角形的绕向按法线摆正（双面材质翻法线时要对） */
function fill(geo: THREE.BufferGeometry, panels: number[], e: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const ab = v3();
  const ac = v3();
  let i = 0;
  for (const k of panels) {
    for (const [a, b, c, na, nb, nc] of panelTris(k, e)) {
      const fn = ab.subVectors(b, a).cross(ac.subVectors(c, a));
      const want = na.clone().add(nb).add(nc);
      const flip = fn.dot(want) < 0;
      const vs = flip ? [a, c, b] : [a, b, c];
      const ns = flip ? [na, nc, nb] : [na, nb, nc];
      for (let j = 0; j < 3; j++) {
        pos.setXYZ(i, vs[j].x, vs[j].y, vs[j].z);
        nor.setXYZ(i, ns[j].x, ns[j].y, ns[j].z);
        i++;
      }
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
}

function canopyGeo(panels: number[]): THREE.BufferGeometry {
  const n = panels.length * 7 * 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ((ctx.variant % 3) + 3) % 3;
  const g = new THREE.Group();
  g.name = 'patio-umbrella';

  const cloth: ToonOpts = {
    lightUp: 0.4,
    bands: [-0.45, 0.35],
    convex: 0.2,
    noShadowReceive: true,
    side: THREE.DoubleSide,
    elem: { kind: 'paint', space: 'local', size: [12, 8], density: [0, 0] },
  };
  // 粉和奶油亮度差 70（> 60 = 强边缘，8 条片缝全是）：粉伞的布不要深浅块，粉一律取"高一级"、奶油一律取"低一级"（差 ≈ 50）。
  // 用 planks（缝 0、无亮条）只为了 toneW 能定死取哪一级
  const flat = (w: [number, number]): ToonOpts => ({
    ...cloth,
    elem: { kind: 'planks', space: 'local', p: [0, 1, 0, 10], seam: 0, hi: 0 },
    toneW: w,
  });
  const accOpts = v === 0 ? flat([1, 0]) : cloth;
  const creamOpts = v === 0 ? flat([0, 1]) : cloth;
  const accPanels = [0, 2, 4, 6];
  const creamPanels = [1, 3, 5, 7];
  const accGeo = canopyGeo(accPanels);
  const creamGeo = canopyGeo(creamPanels);
  const accMesh = new THREE.Mesh(accGeo, ctx.mat(ACC[v], accOpts));
  const creamMesh = new THREE.Mesh(creamGeo, ctx.mat('clothWhite', creamOpts));
  g.add(accMesh, creamMesh);

  // 杆（六棱，不封口）+ 杆顶小帽，metal；底座 concrete
  const pole = new THREE.BoxGeometry(POLE_W, POLE_SPLIT, POLE_W).translate(0, POLE_SPLIT / 2, 0);
  const poleTop = new THREE.BoxGeometry(POLE_TOP_W, APEX - POLE_SPLIT, POLE_TOP_W).translate(
    0,
    (APEX + POLE_SPLIT) / 2,
    0,
  );
  const cap = new THREE.BoxGeometry(0.2, 0.14, 0.2).translate(0, APEX + 0.05, 0);
  const metal = new THREE.Mesh(
    mergeGeometries([pole, poleTop, cap]),
    ctx.mat('metal', { lightUp: 0.55, bands: [-0.45, 0.35], convex: 0.3, noShadowReceive: true }),
  );
  g.add(metal);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 0.1, 8).translate(0, 0.05, 0),
    ctx.mat('concrete', { lightUp: 0.55, bands: [-0.45, 0.35], convex: 0.3, noShadowReceive: true }),
  );
  g.add(base);

  let open = -1;
  const setOpen = (k: number) => {
    const e = THREE.MathUtils.clamp(k, 0, 1);
    if (e === open) return;
    open = e;
    g.userData.open = e;
    fill(accGeo, accPanels, e);
    fill(creamGeo, creamPanels, e);
  };
  const q = ctx.params.get('open');
  setOpen(q !== null && q !== '' ? Number(q) : OPEN0[v]);
  g.userData.setOpen = setOpen;

  ctx.mats.prepare(g);
  return g;
}
