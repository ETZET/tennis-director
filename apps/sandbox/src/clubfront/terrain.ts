// 地形：浮空岛（岛顶 = 到达区）+ 前庭（挡土墙 + 女儿墙）+ 球场台地 + 花坛 + 陶砖铺地 + 步道 + 两段台阶 + 球场的一角。
// 几何工具（topGeo / wallGeo / smoothLoop / smoothLine / insidePoly）在 clubsite/render/geo.ts（各场景共用）；岛底、台阶从 desert3d-v2/terrain.ts 复制过来改的。
// 墙 uv：x = 沿墙长度（米），y = 离墙顶多深（米）。墙一律下到到达区以下（被前面的顶面挡住），岛外沿再往下接岛底。
// 朝镜头的墙 = 暗带：岛外沿是靛紫崖壁（cliff，岩层），俱乐部里的墙是梅紫土坯（adobe）+ 陶砖压顶（cap）。
import * as THREE from 'three';
import type { AssetCtx } from '../clubsite/render/ctx';
import { insidePoly, smoothLine, smoothLoop, topGeo, wallGeo } from '../clubsite/render/geo';
import { vnoise } from '../clubsite/render/noise';
import { EL } from '../clubsite/render/palette';
import {
  BEDS,
  COURT_HINT,
  COURT_STAIRS,
  COURTS,
  GATE_STAIRS,
  H,
  ISLAND,
  PARAPET,
  PLAZA,
  type Stairs,
  TILE,
  type V2,
  WALKS,
} from './layout';

/** 带状多边形（步道）：中线左右各偏 w/2；wobble > 0 时边沿按世界坐标起伏一点（土路），0 = 齐边（石板、墙） */
function strip(line: V2[], w: number, wobble = 0): V2[] {
  const L: V2[] = [];
  const R: V2[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const [x, z] = line[i];
    const k = w / 2;
    const wl = k * (1 - wobble + 2 * wobble * vnoise(x * 0.6, z * 0.6, 301));
    const wr = k * (1 - wobble + 2 * wobble * vnoise(x * 0.6, z * 0.6, 302));
    L.push([x - (dz / l) * wl, z + (dx / l) * wl]);
    R.push([x + (dz / l) * wr, z - (dx / l) * wr]);
  }
  return [...L, ...R.reverse()];
}

export interface Terrain {
  root: THREE.Group;
  /** 平滑后的轮廓（island / plaza / courts / bed-*），布置、以后的碰撞用 */
  outlines: Record<string, V2[]>;
  /** 某点的地面高度（最高的那层台面；岛外 = 岛底） */
  groundAt(x: number, z: number): number;
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const rnd = ctx.rng('terrain:outline');
  const LIP = ctx.texel * 1.2; // 一纹素多一点的亮边

  const island = smoothLoop(ISLAND, 0.6, rnd, 0.1);
  const plaza = smoothLoop(PLAZA, 0.4, rnd, 0.02);
  const courts = smoothLoop(COURTS, 0.4, rnd, 0.02);
  const beds = BEDS.map((b) => ({ id: b.id, pts: smoothLoop(b.pts, 0.3, rnd, 0.02) }));

  // 某点的地面高度：球场台地 > 花坛 > 前庭 > 到达区
  const groundAt = (x: number, z: number) => {
    const p: V2 = [x, z];
    if (insidePoly(p, courts)) return H.courts;
    for (const b of beds) if (insidePoly(p, b.pts)) return H.bed;
    if (insidePoly(p, plaza)) return H.plaza;
    return insidePoly(p, island) ? H.arrival : H.skirt;
  };
  const expoOf = (top: number) => (x: number, z: number, nx: number, nz: number) =>
    Math.max(0, top - groundAt(x + nx * 0.35, z + nz * 0.35));

  const cliffMat = ctx.mat('cliff', { elem: EL.strata });
  const cliffLip = ctx.mat('cliffLip');
  const adobeMat = ctx.mat('adobe', { elem: EL.adobe });
  const capMat = ctx.mat('cap');

  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };
  /** 台面：顶 + 一纹素的亮唇 + 墙（下到到达区以下） */
  const terrace = (
    id: string,
    pts: V2[],
    h: number,
    top: THREE.Material,
    lip: THREE.Material,
    wall: THREE.Material,
  ) => {
    add(topGeo(pts, h), top, `top:${id}`);
    add(wallGeo(pts, h, h - LIP, true), lip, `lip:${id}`);
    add(wallGeo(pts, h - LIP, H.arrival - 0.3, true, 0, expoOf(h)), wall, `wall:${id}`);
  };

  // ── 浮空岛：岛顶（到达区的砂石地）+ 岛外沿（亮边 + 靛紫崖壁 + 收拢的岛底）
  add(topGeo(island, H.arrival), ctx.mat('sand', { elem: EL.sand }), 'top:arrival');
  add(wallGeo(island, H.arrival, H.arrival - LIP, true), cliffLip, 'lip:island');
  add(
    wallGeo(island, H.arrival - LIP, H.skirt, true, 0, () => H.arrival - H.skirt),
    cliffMat,
    'wall:island',
  );
  add(undersideGeo(island), ctx.mat('underside', { side: THREE.DoubleSide }), 'underside');

  // ── 前庭（砂石地）、球场台地、花坛：土坯墙 + 陶砖压顶
  terrace('plaza', plaza, H.plaza, ctx.mat('sand', { elem: { ...EL.sand, seed: 3 } }), capMat, adobeMat);
  terrace('courts', courts, H.courts, ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 5 } }), capMat, adobeMat);
  for (const b of beds)
    terrace(b.id, b.pts, H.bed, ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 7 } }), capMat, adobeMat);

  // ── 女儿墙：沿前庭南沿（大门豁口两边），0.4 米宽、顶 y 0.5；顶面是陶砖压顶，正面接着挡土墙一直下去
  for (const [i, span] of PARAPET.spans.entries()) {
    const run = plaza.filter(([x, z]) => z > PARAPET.zMin && x >= span[0] && x <= span[1]);
    // 轮廓是闭合的：按 x 排好（南沿从西到东）
    run.sort((a, b) => a[0] - b[0]);
    if (run.length < 2) continue;
    const ring = strip(run, PARAPET.w);
    add(topGeo(ring, H.parapet), capMat, `top:parapet${i}`);
    add(wallGeo(ring, H.parapet - LIP, H.arrival - 0.3, true, 0, expoOf(H.parapet)), adobeMat, `wall:parapet${i}`);
  }

  // ── 陶砖铺地（凉棚脚下 + 前面）
  add(topGeo(TILE, H.plaza + 0.006), ctx.mat('tile', { elem: EL.tile }), 'tile');

  // ── 步道：俱乐部里是石板，岛上是踩实的土路
  const flag = ctx.mat('flagstone', { elem: EL.flagstone });
  const dirt = ctx.mat('path', { elem: EL.path });
  for (const w of WALKS) {
    const line = smoothLine(w.pts, 0.4);
    add(
      topGeo(strip(line, w.w, w.kind === 'path' ? 0.12 : 0), w.level + 0.012),
      w.kind === 'path' ? dirt : flag,
      `path:${w.id}`,
    );
  }

  // ── 台阶（踏面石条 + 前沿磨亮条；描边压低，不然凸边白线盖掉纹理）
  for (const [name, st] of [
    ['stairs:gate', GATE_STAIRS],
    ['stairs:court', COURT_STAIRS],
  ] as [string, Stairs][]) {
    add(
      stairsGeo(st),
      ctx.mat('stair', {
        edge: 0.18,
        convex: 0.25,
        elem: {
          kind: 'treads',
          size: [6, 14],
          p: [st.x0, st.z0, 0, 1 / st.run],
          q: [st.steps, st.from, (st.from - st.to) / st.steps, 0],
        },
      }),
      name,
    );
  }

  // ── 球场的一角（围网后面）：外场绿、青蓝内场、奶油线（平涂，球场不是这个场景的主角）
  const yC = H.courts;
  const { surround: S, baselineZ, hw, shw } = COURT_HINT;
  const plane = (x0: number, x1: number, z0: number, z1: number, y: number, m: THREE.Material, name: string) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    add(g, m, name);
  };
  plane(S.x0, S.x1, S.z0, S.z1, yC + 0.01, ctx.mat('surround'), 'court:surround');
  plane(-hw, hw, S.z0, baselineZ, yC + 0.02, ctx.mat('court'), 'court:inner');
  const LW = ctx.texel * 2; // 线宽 2 设计纹素
  const line = ctx.mat('line');
  plane(-hw - LW / 2, hw + LW / 2, baselineZ - LW / 2, baselineZ + LW / 2, yC + 0.03, line, 'court:baseline');
  for (const x of [-hw, -shw, shw, hw]) plane(x - LW / 2, x + LW / 2, S.z0, baselineZ, yC + 0.03, line, 'court:side');
  plane(-LW / 2, LW / 2, baselineZ - 0.3, baselineZ, yC + 0.03, line, 'court:mark');

  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) {
    // 立面（墙、亮唇、岛底、台阶）不接收投影：朝镜头的立面永远是干净的暗档，台阶踏面是干净的亮暗条纹
    if (
      m.name.startsWith('wall:') ||
      m.name.startsWith('lip:') ||
      m.name === 'underside' ||
      m.name.startsWith('stairs')
    )
      m.receiveShadow = false;
    if (m.name.startsWith('path') || m.name === 'tile' || m.name.startsWith('court:')) m.castShadow = false;
  }
  const outlines: Record<string, V2[]> = { island, plaza, courts };
  for (const b of beds) outlines[b.id] = b.pts;
  return { root, outlines, groundAt };
}

/** 岛底：外沿一圈往下、往里收，带参差的尖 */
function undersideGeo(island: V2[]): THREE.BufferGeometry {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of island) {
    cx += x;
    cz += z;
  }
  cx /= island.length;
  cz /= island.length;
  const K = island.length;
  const rings: THREE.Vector3[][] = [];
  const steps: [number, number][] = [
    [1.0, H.skirt],
    [0.9, H.skirt - 1.6],
    [0.72, H.skirt - 3.6],
    [0.45, H.skirt - 6.0],
    [0.12, H.bottom],
  ];
  steps.forEach(([k, y], s) => {
    rings.push(
      island.map(([x, z], i) => {
        const jag = s === 0 ? 0 : (vnoise(i * 0.25, s * 3.1, 501) - 0.5) * 1.6 * s;
        const kk = s === 0 ? 1 : k * (0.94 + 0.12 * vnoise(i * 0.18, s, 502));
        return new THREE.Vector3(cx + (x - cx) * kk, y - Math.max(0, jag), cz + (z - cz) * kk);
      }),
    );
  });
  const pos: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r];
    const B = rings[r + 1];
    for (let i = 0; i < K; i++) {
      const j = (i + 1) % K;
      pos.push(...A[i].toArray(), ...B[i].toArray(), ...B[j].toArray());
      pos.push(...A[i].toArray(), ...B[j].toArray(), ...A[j].toArray());
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // 法线朝外（离岛中心）
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) {
    const ox = p.getX(i) - cx;
    const oz = p.getZ(i) - cz;
    if (nrm.getX(i) * ox + nrm.getZ(i) * oz < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  }
  return g;
}

/** 台阶：每级一个盒子（往墙里多伸 0.3 米，免得露缝） */
function stairsGeo(st: Stairs): THREE.BufferGeometry {
  const { x0, x1, z0, steps, run, from, to } = st;
  const rise = (from - to) / steps;
  const geos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < steps; k++) {
    const top = from - rise * (k + 1);
    const za = z0 - 0.3;
    const zb = z0 + run * (k + 1);
    const hgt = top - (to - 0.1);
    const b = new THREE.BoxGeometry(x1 - x0, hgt, zb - za);
    b.translate((x0 + x1) / 2, to - 0.1 + hgt / 2, (za + zb) / 2);
    geos.push(b.toNonIndexed());
  }
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of geos) {
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
