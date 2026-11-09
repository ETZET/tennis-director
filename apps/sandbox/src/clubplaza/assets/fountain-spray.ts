// #2 fountain-spray（水在动，便宜）：和 palm-fountain 同一个原点（喷泉中心、广场顶面）。全部是 shader + 少量网格：
// - 两层碗沿的溢流帘：开口圆筒（r 1.42 / 0.74，只画朝镜头的半边），竖条纹按拍子往下滚（fountain/glsl.ts 的 CURTAIN），
//   条间 1 纹素空（看得到后面的柱子），顶上一行亮边、帘脚两行泡沫；
// - 顶上往上冒的水柱（0.7 米，同一段 shader 往上滚）+ 顶上一团泡沫（3×3 纹素）；
// - 池壁里四股往里的弧形小水柱（45° 方向）：每股 8 颗 2×2 纹素的水珠沿抛物线走（0.9 秒一趟）；顶上 6 颗往外溅、落回上碗。
//   水珠一共 38 个四边形（一个 InstancedMesh），每帧在 CPU 上摆；风大时往下风歪。
// - 落点的涟漪、帘脚的落水圈、水面闪光在 palm-fountain 的水面 shader 里（同一份 flow / leaves，fountain/link.ts）。
// userData：setFlow(0..1)（帘子变稀、水珠变少、弧变低；0 = 关水）、setLeaves(n)、update(dt, t)（摆水珠）。
import * as THREE from 'three';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import { cylWall } from './fountain/geo';
import { CURTAIN, CURTAIN_DECL, DROP } from './fountain/glsl';
import { fountainLink, linkApi } from './fountain/link';
import { patchToon } from './fountain/patch';
import { BOWL2, CROWN, CURTAINS, F, JETS } from './fountain/spec';

const SEED = 9300;

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'fountain-spray';
  const link = fountainLink(ctx.uniforms);
  const foam = ctx.pal.foam.ramp;
  const waterOpts = (k: number): ToonOpts => ({
    elem: { kind: 'paint', seed: SEED + k, accent: foam },
    edge: 0,
    convex: 0,
    noShadowReceive: true,
  });
  const curtainMat = (k: number, y0: number, y1: number, dir: number) =>
    patchToon(ctx.mat('fountainWater', waterOpts(k)), {
      tag: `ftn-curtain-${k}`,
      defines: { FTN_CURTAIN: '' },
      uniforms: {
        uFtnFlow: link.uFlow,
        uFtnY: { value: new THREE.Vector2(y0, y1) },
        uFtnK: { value: k * 0.37 },
        uFtnDir: { value: dir },
      },
      fragDecl: CURTAIN_DECL,
      frag: CURTAIN,
    });

  const meshes: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = name;
    g.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  // ── 溢流帘 ─────────────────────────────────────────────
  for (const c of CURTAINS)
    add(cylWall(c.rTop, c.rBot, c.yTop, c.yBot, 56), curtainMat(c.id, c.yBot, c.yTop, 1), `curtain${c.id}`);

  // ── 顶上的水柱 + 一团泡沫 ─────────────────────────────────
  add(cylWall(CROWN.r * 1.5, CROWN.r, CROWN.y1, CROWN.y0, 10), curtainMat(5, CROWN.y0, CROWN.y1, -1), 'crown');
  const puff = add(
    new THREE.BoxGeometry(0.15, 0.1, 0.15),
    ctx.mat('foam', { edge: 0, convex: 0, lightUp: 1, noShadowReceive: true }),
    'crown:puff',
  );
  puff.position.y = CROWN.y1 + 0.03;

  // ── 水珠：四股小水柱 × 8 + 顶上溅出来的 6 颗 ─────────────────
  // 水珠 = 2×2 纹素（1× 下一个纹素 0.045 米 = 设计纹素的一半）；位置按纹素网格对齐（见 place），大小不会 2、3 纹素来回变
  const tex = ctx.texel / 2;
  const dropS = tex * 2.5;
  const nJet = JETS.angles.length * JETS.drops;
  const nCrown = 6;
  const drops = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(dropS, dropS).rotateX(-Math.PI / 4),
    patchToon(ctx.mat('fountainWater', waterOpts(7)), { tag: 'ftn-drop', frag: DROP }),
    nJet + nCrown,
  );
  drops.name = 'drops';
  drops.frustumCulled = false;
  g.add(drops);
  meshes.push(drops);

  for (const m of meshes) {
    m.castShadow = false;
    m.receiveShadow = false;
  }

  const M = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const jetDir = JETS.angles.map((d) => {
    const a = (d * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)] as const;
  });
  const wind = ctx.uniforms.uWind.value;
  /**
   * 水珠的中心对齐到纹素角上（相机按纹素对齐：屏幕 x = 世界 x，屏幕 y = (y − z)·cos45）：2×2 的方块永远正好盖 2×2 个纹素，
   * 走起来一格一格地跳，不会在 2、3 纹素之间闪。按世界坐标对齐（资产原点不一定在纹素网格上）。
   */
  const origin = new THREE.Vector3();
  const C45 = Math.SQRT1_2;
  const place = (i: number, x: number, y: number, z: number, on: boolean) => {
    if (!on) {
      drops.setMatrixAt(i, zero);
      return;
    }
    const wx = origin.x + x;
    const wu = (origin.y + y - (origin.z + z)) * C45;
    const sx = Math.round(wx / tex) * tex - origin.x;
    const du = Math.round(wu / tex) * tex - wu;
    P.set(sx, y + du * C45, z - du * C45);
    M.makeTranslation(P);
    drops.setMatrixAt(i, M);
  };
  const update = (_dt: number, t: number) => {
    g.getWorldPosition(origin);
    const flow = link.uFlow.value;
    const gust = ctx.uniforms.uGust.value;
    const lean = 0.18 * (0.6 + 0.8 * gust);
    // 四股小水柱：出水口在压顶里沿，往池心走，弧顶比出水口高 peak × √flow，落在 r1 附近（水小落得近）
    const reach = JETS.r0 - (JETS.r0 - JETS.r1) * (0.55 + 0.45 * flow);
    const peak = JETS.peak * Math.sqrt(flow);
    const shown = Math.round(JETS.drops * flow);
    let i = 0;
    for (let k = 0; k < jetDir.length; k++) {
      const [cx, cz] = jetDir[k];
      for (let j = 0; j < JETS.drops; j++, i++) {
        const u = (t / JETS.period + j / JETS.drops + k * 0.13) % 1;
        const r = JETS.r0 + (reach - JETS.r0) * u;
        const y = JETS.y0 + (F.waterY - JETS.y0) * u + 4 * peak * u * (1 - u);
        const h = y - F.waterY;
        place(i, cx * r + wind.x * lean * h, y, cz * r + wind.y * lean * h, j < shown && flow > 0.04);
      }
    }
    // 顶上溅出来的：从水柱顶往外落回上碗（1 秒一趟）
    const top = CROWN.y0 + (CROWN.y1 - CROWN.y0) * (0.4 + 0.6 * flow);
    for (let j = 0; j < nCrown; j++, i++) {
      const a = (j / nCrown) * Math.PI * 2 + 0.4;
      const u = (t / 1.0 + j * 0.37) % 1;
      const r = 0.1 + (BOWL2.waterR - 0.12) * u;
      const y = top + 0.12 * Math.sin(Math.PI * u * 0.6) - (top - BOWL2.waterY) * u * u;
      const h = y - BOWL2.waterY;
      place(i, Math.cos(a) * r + wind.x * lean * h, y, Math.sin(a) * r + wind.y * lean * h, flow > 0.25 || j % 2 === 0);
    }
    drops.instanceMatrix.needsUpdate = true;
    // 顶上那团泡沫：水小了矮下去；按 0.2 秒一拍上下跳一纹素（翻腾）
    puff.visible = flow > 0.04;
    puff.position.y = top + 0.03 + (Math.floor(t / 0.2) % 2) * 0.045;
    puff.position.x = wind.x * lean * (top - CROWN.y0);
    puff.position.z = wind.y * lean * (top - CROWN.y0);
  };
  update(0, 0);

  const api = linkApi(link);
  g.userData.setFlow = (f: number) => {
    api.setFlow(f);
  };
  g.userData.setLeaves = api.setLeaves;
  g.userData.link = link;
  g.userData.update = update;
  return g;
}
