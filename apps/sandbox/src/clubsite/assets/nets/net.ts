// 球网的共用构造（匹克球网 pickle-net、网球网 court-net）。
// 网沿本地 z 拉（南北走），原点 = 网正中的地面。yaw 0 下网面侧对镜头：屏幕上只看得到
//   网带的顶面（一条 2 纹素的白竖线）+ 网身往东露出的一纹素（网身下沿往东偏 lean：真网也不是一张绝对竖直的纸）
//   + 两根胖网柱 + 往西南落的投影（一条暗线贴在白线西边）。
// 松的网（tension 0）：网身中段往东鼓（下沿鼓得最多、网带少一点）—— 侧对镜头只有 x 方向的位移看得见，
//   鼓出来的网身斜着朝上，露出一块镜片形的暗靛面；y 方向的下垂在屏幕上和 z 叠在一起，看不出来（也做了，换个角度看是对的）。
// 网身、网带、中心带是"条带"几何体：setTension(t) 只改顶点（几百个），不重建网格。
import * as THREE from 'three';
import { Bucket, box, DU, FACING, lerp, type NetCtx, type Strip, V, writeStrips } from './kit';

export interface NetSpec {
  /** 两根网柱中心距（米，沿 z） */
  span: number;
  /** 网柱见方 */
  postW: number;
  postH: number;
  /** 网中间的高度（绷紧时） */
  midH: number;
  /** 网带：宽（x，屏幕上的线宽）、厚（y） */
  tapeW: number;
  tapeH: number;
  /** 网身下沿离地（绷紧时） */
  bottom: number;
  /** 网身下沿往东偏多少（米）：yaw 0 下网身露出的那一条 */
  lean: number;
  /** 松的时候（tension 0）：中间多垂多少、网身下沿往东鼓多少、北头网带从柱顶滑下来多少、下沿垂到地上多少 */
  slack: { sag: number; bulge: number; slide: number; drop: number };
  /** 中心带的宽（沿 z） */
  strapW: number;
  /** 绞盘：装在南柱朝镜头的一面 */
  winch: { y: number; w: number };
  /** 柱帽（比柱子宽一点的一片，亮一行）：0 = 没有 */
  cap: number;
  /** 网身上每 4 纹素一条稍亮的竖线（只在网面朝镜头时看得见：以后转了 yaw 的场景） */
  meshHint: boolean;
  /** 沿网的分段数 */
  segs: number;
}

/** 网眼暗示贴图：4 纹素一格，第一列 1.0、其余 0.86（贴图只做接近白的明暗，颜色来自三档） */
function meshHintTexture(): THREE.Texture {
  const d = new Uint8Array([255, 255, 255, 255, 219, 219, 219, 255, 219, 219, 219, 255, 219, 219, 219, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * 建一张网。返回的 Group：
 * - `userData.setTension(t)`：0 = 松（网身鼓、网带垂、北头滑下来、中心带脱扣拖在地上），1 = 绷紧；中间值插值。
 * - `userData.tension`：现在的值。
 * - `userData.setCrank(rad)`：绞盘摇把转到多少（绕 z 轴，0 = 摇把朝东）；`userData.crankGrip(out)`：摇把握点的世界坐标。
 */
export function buildNet(ctx: NetCtx, sp: NetSpec, tension0: number): THREE.Group {
  const g = new THREE.Group();
  const half = sp.span / 2;
  const L = sp.span - sp.postW; // 两柱内侧之间
  const N = sp.segs;

  // ── 材质 ──
  const postM = ctx.mat('metal', { ...FACING, convex: 0.7, edge: 0.5 });
  const capM = ctx.mat('metal', { convex: 0.9, edge: 0.5, noShadowReceive: true });
  const tapeM = ctx.mat('netTape', { edge: 0.25, convex: 0.2, noShadowReceive: true });
  const bodyM = ctx.mat('net', {
    edge: 0.35,
    convex: 0,
    lightUp: 0.25,
    noShadowReceive: true,
    ...(sp.meshHint ? { map: meshHintTexture() } : {}),
  });
  const strapM = ctx.mat('netTape', {
    edge: 0.1,
    convex: 0,
    lightUp: 0.4,
    // 贴在朝东的网身上：本来落中档（灰紫），压低档位让它落亮档 —— 白带是中段那一个亮点
    bands: [-0.6, -0.15],
    noShadowReceive: true,
    side: THREE.DoubleSide,
  });
  const ironM = ctx.mat('ironwork', { ...FACING, convex: 0.6, edge: 0.5 });

  // ── 静的部分：网柱、柱帽、地脚、绞盘、中心带的地扣 ──
  const b = new Bucket();
  for (const s of [-1, 1]) {
    const z = s * half;
    b.add(postM, box(sp.postW, sp.postH, sp.postW, 0, 0, z));
    if (sp.cap > 0) b.add(capM, box(sp.postW + sp.cap, DU * 0.6, sp.postW + sp.cap, 0, sp.postH - DU * 0.3, z));
    // 地脚：一块比柱子宽一纹素的暗铁板（柱子落地的地方有个"脚"，不是插在地里的一根棍）
    b.add(ironM, box(sp.postW + DU, DU * 0.5, sp.postW + DU, 0, 0, z));
  }
  // 绞盘：南柱朝镜头那面的一个方块（鼓）
  const wz = half + sp.postW / 2;
  const ww = sp.winch.w;
  b.add(ironM, box(ww, ww, DU * 1.4, 0, sp.winch.y - ww / 2, wz + DU * 0.7));
  // 中心带的地扣（网正中的地上一块暗铁片）
  b.add(ironM, box(DU * 2, DU * 0.4, DU * 1.5, sp.lean, 0, 0));
  b.build(ctx.mats, g);

  // 摇把：绕 z 轴转的一个小组（臂 3 纹素长、握把朝镜头伸出来）
  const crank = new THREE.Group();
  crank.position.set(0, sp.winch.y, wz + DU * 1.4);
  const armM = ctx.mat('metal', { ...FACING, convex: 0.8 });
  const gripM = ctx.mat('toolOrange', { ...FACING, convex: 0.6 });
  const arm = new THREE.Mesh(new THREE.BoxGeometry(DU * 3.2, DU, DU * 0.8).translate(DU * 1.2, 0, DU * 0.4), armM);
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(DU * 1.3, DU * 1.3, DU * 1.6).translate(DU * 2.6, 0, DU * 1.4),
    gripM,
  );
  crank.add(arm, grip);
  g.add(crank);
  ctx.mats.prepare(crank);
  const gripLocal = new THREE.Vector3(DU * 2.6, 0, DU * 2.2);

  // ── 动的部分：网身（东西两面 + 下沿）、网带（顶、东、西、底）、中心带 ──
  const bodyGeo = new THREE.BufferGeometry();
  const tapeGeo = new THREE.BufferGeometry();
  const strapGeo = new THREE.BufferGeometry();
  const body = new THREE.Mesh(bodyGeo, bodyM);
  const tape = new THREE.Mesh(tapeGeo, tapeM);
  const strap = new THREE.Mesh(strapGeo, strapM);
  g.add(body, tape, strap);
  ctx.mats.prepare(body);
  ctx.mats.prepare(tape);
  ctx.mats.prepare(strap, { cast: false });
  for (const m of [body, tape, strap]) m.frustumCulled = false;

  const R = 3; // 网身竖向分几段
  // 网身是一块薄板（西面朝下偏、看不见）：厚 0.12 只为了投影 —— 3 厘米的板在阴影图里断成一串虚点，
  // 0.12 + 太阳偏东 8° 的错位 ≈ 0.25 米宽的一条实心暗线。板的上沿整个藏在网带下面
  const TH = 0.12;
  const zs = Array.from({ length: N + 1 }, (_, i) => -L / 2 + (i / N) * L);

  function shape(t: number) {
    const k = 1 - t;
    const s = (z: number) => Math.max(0, 1 - ((2 * z) / L) ** 2);
    const sag = lerp(sp.postH - sp.midH, sp.slack.sag, k);
    const top = (z: number) => {
      const a = (z + L / 2) / L; // 0 北头 → 1 南头（绞盘那头）
      const end = lerp(sp.postH - k * sp.slack.slide, sp.postH, a);
      return end - 0.01 - sag * s(z);
    };
    // u：0 = 网带下沿，1 = 网身下沿
    const x = (z: number, u: number) => sp.lean * u + k * sp.slack.bulge * s(z) * (0.3 + 0.7 * u ** 0.8);
    const bot = (z: number) => Math.max(0.015, sp.bottom - k * sp.slack.drop * s(z));
    const y = (z: number, u: number) => lerp(top(z) - sp.tapeH * 0.5, bot(z), u);
    return { top, x, y, bot };
  }

  function update(t: number) {
    const sh = shape(t);
    // 网身
    const strips: Strip[] = [];
    const uvOf = (z: number, yy: number): [number, number] => [z / (DU * 4), yy / (DU * 4)];
    for (let j = 0; j < R; j++) {
      const u0 = j / R;
      const u1 = (j + 1) / R;
      for (const side of [1, -1]) {
        const off = side > 0 ? 0 : -TH;
        const a = zs.map((z) => V(sh.x(z, u0) + off, sh.y(z, u0), z));
        const bb = zs.map((z) => V(sh.x(z, u1) + off, sh.y(z, u1), z));
        strips.push({
          a,
          b: bb,
          hint: V(side, 0, 0),
          uvA: a.map((p) => uvOf(p.z, p.y)),
          uvB: bb.map((p) => uvOf(p.z, p.y)),
        });
      }
    }
    strips.push({
      a: zs.map((z) => V(sh.x(z, 1), sh.y(z, 1), z)),
      b: zs.map((z) => V(sh.x(z, 1) - TH, sh.y(z, 1), z)),
      hint: V(0, -1, 0),
    });
    writeStrips(bodyGeo, strips);

    // 网带：沿网的一根扁管（顶面是屏幕上的白线）
    const hw = sp.tapeW / 2;
    const top = zs.map((z) => sh.top(z));
    // 网带的东沿对齐网身东面的上沿：网身往东偏出来的 lean（1 纹素）整条露在网带东边
    const cx = zs.map((z) => sh.x(z, 0) - hw + 0.005);
    const P = (dx: number, dy: number) => zs.map((z, i) => V(cx[i] + dx, top[i] + dy, z));
    writeStrips(tapeGeo, [
      { a: P(-hw, 0), b: P(hw, 0), hint: V(0, 1, 0) },
      { a: P(hw, 0), b: P(hw, -sp.tapeH), hint: V(1, 0, 0) },
      { a: P(-hw, 0), b: P(-hw, -sp.tapeH), hint: V(-1, 0, 0) },
      { a: P(-hw, -sp.tapeH), b: P(hw, -sp.tapeH), hint: V(0, -1, 0) },
    ]);

    // 中心带：贴在网身东面（z = 0）从网带一直到地扣；松的时候脱扣，顺着鼓出来的网身下来、在地上往东南拖半米
    const lift = 0.014;
    const taut = [0, 0.25, 0.5, 0.75, 1].map((u) => V(sh.x(0, u) + lift, sh.y(0, u), 0));
    taut.push(V(sp.lean + lift, 0.025, 0));
    const xb = sh.x(0, 1);
    const loose = [0, 0.33, 0.66, 1].map((u) => V(sh.x(0, u) + lift, sh.y(0, u), 0));
    loose.push(V(xb + 0.12, 0.012, 0.04), V(xb + 0.42, 0.012, 0.13));
    const pts = taut.map((p, i) => p.clone().lerp(loose[i], 1 - t));
    const w = sp.strapW / 2;
    writeStrips(strapGeo, [
      { a: pts.map((p) => V(p.x, p.y, p.z - w)), b: pts.map((p) => V(p.x, p.y, p.z + w)), hint: V(1, 1, 0) },
    ]);
    g.userData.tension = t;
  }

  update(tension0);
  g.userData.setTension = (t: number) => update(THREE.MathUtils.clamp(t, 0, 1));
  g.userData.setCrank = (rad: number) => {
    crank.rotation.z = rad;
  };
  g.userData.crankGrip = (out = new THREE.Vector3()) => {
    crank.updateWorldMatrix(true, false);
    return out.copy(gripLocal).applyMatrix4(crank.matrixWorld);
  };
  return g;
}
