// 球网：废弃球场上松垂的网。一条粗的暗靛网身（net）+ 顶上一条奶白网带（netTape，中间下垂）+ 两根胖网柱（metal，帽沿亮）。
// 不画网眼（0.09 米/纹素下是噪点）。东半边一段网身撕开、垂下一片（缺口里露出后面的场地），风里轻轻晃。
// 网身/网带朝镜头的竖直面：用材质自己的光（lightUp）让网带正面落亮档、网身落中档，垂下的那片朝下翻落暗档。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COURT } from '../layout';
import type { AssetCtx } from '../world';

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const v = ctx.variant;
  const rnd = ctx.rng(`net:${v}`);
  const postW = 0.3; // 3+ 纹素
  const postX = 6.4 - postW / 2;
  const postH = COURT.postH - 0.08;
  const xe = postX - postW / 2; // 网身两端
  const yEnd = postH - 0.03; // 网带在柱子上的高度
  const yMid = 0.86 + (rnd() - 0.5) * 0.04; // 中间下垂（标准 0.914，荒废后更松）
  const tapeH = 0.28; // ≈ 2 屏幕纹素
  const top = (x: number) => yMid + (yEnd - yMid) * (x / xe) ** 2;
  const y0 = 0.02;

  // 撕开的一段（东半边）：网带还在，下面的网身掉下去一截
  const tearA = 1.7 + rnd() * 0.3;
  const tearB = tearA + 1.75;
  const tearY = 0.16; // 网身在撕口处剩下的高度

  const N = 48;
  // ── 网身：x-y 平面的轮廓挤出 0.05 米 ──
  const body = new THREE.Shape();
  body.moveTo(-xe, y0);
  body.lineTo(xe, y0);
  for (let k = N; k >= 0; k--) {
    const x = -xe + (2 * xe * k) / N;
    let y = top(x) - tapeH + 0.02;
    if (x > tearA && x < tearB) {
      // 撕口：两三级粗台阶，不是细锯齿
      const u = (x - tearA) / (tearB - tearA);
      y = u < 0.12 ? top(x) - tapeH - 0.14 : u > 0.88 ? top(x) - tapeH - 0.1 : tearY + (u > 0.45 ? 0.09 : 0);
    }
    body.lineTo(x, y);
  }
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: 0.05, bevelEnabled: false, curveSegments: 1 });
  bodyGeo.translate(0, 0, -0.025);

  // 中带（中间那条竖着的白带，4 纹素宽）
  const strapW = 0.32;
  const strapGeo = new THREE.BoxGeometry(strapW, top(0) - y0, 0.07);
  strapGeo.translate(0, y0 + (top(0) - y0) / 2, 0);

  // ── 网带：沿下垂曲线的一条带，挤出 0.09 米 ──
  const tape = new THREE.Shape();
  tape.moveTo(-xe - postW * 0.3, top(-xe) - tapeH);
  for (let k = 0; k <= N; k++) {
    const x = -xe + (2 * xe * k) / N;
    tape.lineTo(x, top(x) - tapeH);
  }
  tape.lineTo(xe + postW * 0.3, top(xe) - tapeH);
  tape.lineTo(xe + postW * 0.3, top(xe));
  for (let k = N; k >= 0; k--) {
    const x = -xe + (2 * xe * k) / N;
    tape.lineTo(x, top(x));
  }
  tape.lineTo(-xe - postW * 0.3, top(-xe));
  const tapeGeo = new THREE.ExtrudeGeometry(tape, { depth: 0.09, bevelEnabled: false, curveSegments: 1 });
  tapeGeo.translate(0, 0, -0.045);

  // 网带朝镜头的正面落亮档（自己的光往上+往镜头偏），网身正面落中档
  const tapeMat = ctx.mat('netTape', { lightUp: 1, bands: [-0.4, 0.15], noShadowReceive: true });
  const bodyMat = ctx.mat('net', { lightUp: 0.9, bands: [0.1, 0.5], noShadowReceive: true });
  g.add(new THREE.Mesh(mergeGeometries([tapeGeo, strapGeo.toNonIndexed()])!, tapeMat));
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  g.add(bodyMesh);

  // ── 垂下来的一片：挂在撕口西端的网带下，往前、往下翻，风里晃 ──
  const flapW = (tearB - tearA) * 0.42;
  const flapL = 0.5;
  const flap = new THREE.Shape();
  flap.moveTo(0, 0);
  flap.lineTo(flapW, 0);
  flap.lineTo(flapW * 0.8, -flapL * 0.55);
  flap.lineTo(flapW * 0.42, -flapL);
  flap.lineTo(flapW * 0.08, -flapL * 0.8);
  flap.lineTo(0, 0);
  const flapGeo = new THREE.ExtrudeGeometry(flap, { depth: 0.05, bevelEnabled: false, curveSegments: 1 });
  flapGeo.translate(0, 0, -0.025);
  const flapPivot = new THREE.Group();
  const fx = tearB - flapW - 0.12;
  flapPivot.position.set(fx, top(fx) - tapeH + 0.02, 0.04);
  flapPivot.rotation.set(-0.3, 0, 0.1);
  const flapMesh = new THREE.Mesh(
    flapGeo,
    ctx.mat('net', { lightUp: 0.3, bands: [0.1, 0.5], noShadowReceive: true, side: THREE.DoubleSide }),
  );
  flapPivot.add(flapMesh);
  g.add(flapPivot);

  // ── 网柱：胖方柱 + 宽一圈的帽（上沿亮）+ 脚下一圈底座 ──
  const posts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const p = new THREE.BoxGeometry(postW, postH, postW);
    p.translate(s * postX, postH / 2, 0);
    const cap = new THREE.BoxGeometry(postW + 0.08, 0.1, postW + 0.08);
    cap.translate(s * postX, postH + 0.05, 0);
    const foot = new THREE.BoxGeometry(postW + 0.1, 0.1, postW + 0.1);
    foot.translate(s * postX, 0.05, 0);
    // 摇把盒（柱子外侧一块，3 纹素）
    const box = new THREE.BoxGeometry(0.12, 0.27, 0.27);
    box.translate(s * (postX + postW / 2 + 0.06), postH * 0.62, 0);
    posts.push(p, cap, foot, box);
  }
  const postMesh = new THREE.Mesh(
    mergeGeometries(posts.map((q) => q.toNonIndexed()))!,
    ctx.mat('metal', { lightUp: 0.85 }),
  );
  g.add(postMesh);

  // 风里晃：垂下那片绕挂点摆
  const wind = ctx.uniforms.uWind.value;
  const gust = ctx.uniforms.uGust;
  flapPivot.userData.update = (_dt: number, t: number) => {
    const w = Math.min(1, wind.length());
    flapPivot.rotation.x =
      -0.28 - w * (0.1 + 0.1 * gust.value) * (0.6 + 0.4 * Math.sin(t * 2.1) + 0.2 * Math.sin(t * 3.7));
    flapPivot.rotation.z = 0.1 + 0.05 * w * Math.sin(t * 1.6 + 1);
  };

  ctx.mats.prepare(g);
  return g;
}
