// 交互标记：东西上方浮着一颗上下轻轻跳的像素菱形（竖长的八面体，0.5 × 0.7 米 ≈ 6 × 8 纹素），
// 外面套一层反面渲染的深色外壳 = 一纹素的深色轮廓（沙、天、球场上都清楚）；不投影、不接投影。
// 地上可选一圈 1 纹素的短划（FX 图层：不描边、不投影），隔一个亮一个、走马灯。
//
// 本地原点 = 被标记的东西脚下的地面（y 0）。菱形在 height + 0.4 米处（height = 东西的高度）。
// userData：
//   update(dt, t)          跳（周期 1.1 秒，幅度 0.06 米，按整纹素）+ 地圈走马灯
//   setKind('pick' | 'drop' | 'use')   换色：奶油（可以捡）/ 青绿（放在这里）/ 黄（可以用）
//   setHeight(h)           被标记的东西有多高（米）
//   setRing(visible)       地圈开关（默认开）
//   setRadius(r)           地圈半径（米，默认 0.55）
// 画廊：desert3d-v2.html?asset=marker（&kind=pick|drop|use，&h=0.8，&ring=0）
import * as THREE from 'three';
import type { AssetCtx } from '../world';

export type MarkerKind = 'pick' | 'drop' | 'use';
const KINDS: MarkerKind[] = ['pick', 'drop', 'use'];

export function buildMarker(ctx: AssetCtx, opts: { kind?: MarkerKind; height?: number; ring?: boolean } = {}) {
  const root = new THREE.Group();
  root.name = 'marker';
  const T = ctx.texel;
  const gem: Record<MarkerKind, THREE.Mesh> = {} as Record<MarkerKind, THREE.Mesh>;
  // 菱形：八面体，竖向拉长；面法线（三档分得很开：亮顶两面、中腰、暗底），光往上偏 → 上半亮下半暗
  const GR = 0.25;
  const GS = 1.75;
  const geo = new THREE.OctahedronGeometry(GR, 0);
  geo.scale(1, GS, 1);
  geo.computeVertexNormals();
  // 深色外壳（反面渲染、各方向大 0.1 米 ≈ 1 纹素）：保证四周一圈深色轮廓，背景是沙、天、球场都一样清楚
  const hull = new THREE.OctahedronGeometry(GR + 0.1, 0);
  hull.scale(1, (GR * GS + 0.12) / (GR + 0.1), 1);
  hull.computeVertexNormals();
  const look = {
    lightUp: 0.55,
    bands: [-0.35, 0.35] as [number, number],
    noShadowReceive: true,
    edge: 0.9,
    convex: 0.5,
  };
  const pal: Record<MarkerKind, Parameters<AssetCtx['mat']>[0]> = {
    pick: 'line',
    drop: 'clothTeal',
    use: 'flowerYellow',
  };
  const bob = new THREE.Group();
  root.add(bob);
  bob.add(
    new THREE.Mesh(
      hull,
      ctx.mat('hair', { side: THREE.BackSide, bands: [2, 3], noShadowReceive: true, edge: 0, convex: 0 }),
    ),
  );
  for (const k of KINDS) {
    const mesh = new THREE.Mesh(geo, ctx.mat(pal[k], look));
    mesh.visible = false;
    bob.add(mesh);
    gem[k] = mesh;
  }
  // 地圈：24 个位置、隔一个亮一个的 1 纹素宽、2 纹素长的短划；每 0.35 秒换一组（走马灯，不转：转起来短划会时长时短）
  const ring = new THREE.Group();
  const ringMeshes: Record<MarkerKind, THREE.InstancedMesh> = {} as Record<MarkerKind, THREE.InstancedMesh>;
  const N = 24;
  let march = 0;
  const dash = new THREE.BoxGeometry(T * 2, 0.02, T * 1.4);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let radius = 0.55;
  const layoutRing = () => {
    for (const k of KINDS) {
      const im = ringMeshes[k];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        q.setFromAxisAngle(up, -a + Math.PI / 2);
        const on = (i + march) % 2 === 0 ? 1 : 0;
        // 位置按整纹素取（x 一纹素、z 一屏幕行 = 纹素 / cos45）
        const x = Math.round((Math.cos(a) * radius) / T) * T;
        const z = Math.round((Math.sin(a) * radius) / (T * Math.SQRT2)) * T * Math.SQRT2;
        m4.compose(new THREE.Vector3(x, 0.03, z), q, new THREE.Vector3(on, on, on));
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  };
  for (const k of KINDS) {
    const im = new THREE.InstancedMesh(
      dash,
      ctx.mat(pal[k], { noShadowReceive: true, bands: [-2, -1], edge: 0, convex: 0 }),
      N,
    );
    im.layers.set(ctx.layers.FX);
    im.castShadow = false;
    im.frustumCulled = false;
    im.visible = false;
    ring.add(im);
    ringMeshes[k] = im;
  }
  layoutRing();
  root.add(ring);

  let kind: MarkerKind = opts.kind ?? 'pick';
  let height = opts.height ?? 0.6;
  let ringOn = opts.ring ?? true;
  const apply = () => {
    for (const k of KINDS) {
      gem[k].visible = k === kind;
      ringMeshes[k].visible = ringOn && k === kind;
    }
  };
  apply();
  let t0 = 0;
  root.userData.update = (dt: number) => {
    t0 += dt;
    // 跳：按整纹素取（不然 45° 下每帧半纹素地抖）
    const b = (Math.sin((t0 / 1.1) * Math.PI * 2) * 0.5 + 0.5) * 0.06;
    bob.position.y = height + 0.4 + GR * GS + Math.round(b / T) * T;
    const mk = Math.floor(t0 / 0.35) % 2;
    if (mk !== march) {
      march = mk;
      layoutRing();
    }
  };
  root.userData.setKind = (k: MarkerKind) => {
    if (KINDS.includes(k)) kind = k;
    apply();
  };
  root.userData.setHeight = (h: number) => {
    height = h;
    root.userData.update(0);
  };
  root.userData.setRing = (on: boolean) => {
    ringOn = on;
    apply();
  };
  root.userData.setRadius = (r: number) => {
    radius = r;
    layoutRing();
  };
  root.userData.update(0);
  ctx.mats.prepare(root, { cast: false, receive: false });
  return root;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const p = ctx.params;
  const k = p.get('kind') as MarkerKind | null;
  return buildMarker(ctx, {
    kind: k && KINDS.includes(k) ? k : KINDS[ctx.variant % 3],
    height: p.get('h') !== null ? Number(p.get('h')) : 0.6,
    ring: p.get('ring') !== '0',
  });
}
