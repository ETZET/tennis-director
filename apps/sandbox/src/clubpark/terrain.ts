// 地形：地面（clubsite/ground.ts，铺到画外）+ 地图边的山（clubsite/mountains.ts；默认取景看不到，往东平移 ~25 米到山口）+
// 北边高一级的沙漠台地 + 南边低一级的沙漠 + 东墙（土坯 + 压顶 + 壁柱）+
// 墙里面的一角（clubdesk 场景的地：砂石、到达小院的陶砖、长廊、草坪）+ 车道、两片停车场（沥青、车位线、车轮挡、路缘）+
// 落客区连锁砖 + 墙边石板步道 + 花坛 + 种植带。几何工具从 clubsite/render/geo.ts import。
// 朝镜头的立面 = 暗带：台地崖壁（cliff）、花坛和围墙（adobe + 陶砖压顶）、路缘（kerb）。立面一律不接收投影。
import * as THREE from 'three';
import { groundGeo } from '../clubsite/ground';
import { buildMountains, passRoadGeo } from '../clubsite/mountains';
import { insidePoly, smoothLoop, topGeo, wallGeo } from '../clubsite/render/geo';
import { DRIVE, FORECOURT, GATE, GROUNDS, LAWN, LOT_N, LOT_S, PATHS } from '../clubsite/world';
import type { AssetCtx } from './ctx';
import {
  BERMS,
  CAR_EDGE_X,
  DESERT_N,
  DESERT_S,
  DRIVE_EAST_END,
  ENTRY,
  H,
  MOTOR_COURT,
  type Rect,
  ROWS,
  STALL,
  STRIPS,
  type V2,
  WALKS,
  WALL,
} from './layout';
import { EL } from './palette';

const rectPts = (r: Rect): V2[] => [
  [r.x0, r.z0],
  [r.x1, r.z0],
  [r.x1, r.z1],
  [r.x0, r.z1],
];
/** 圆角矩形轮廓（rad 米的圆角，每角 4 段） */
function roundRect(r: Rect, rad: number): V2[] {
  const pts: V2[] = [];
  const c: [number, number, number][] = [
    [r.x1 - rad, r.z1 - rad, 0],
    [r.x0 + rad, r.z1 - rad, Math.PI / 2],
    [r.x0 + rad, r.z0 + rad, Math.PI],
    [r.x1 - rad, r.z0 + rad, (Math.PI * 3) / 2],
  ];
  for (const [cx, cz, a0] of c)
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
    }
  return pts;
}
/** 往里缩 d 米的矩形 */
const inset = (r: Rect, d: number): Rect => ({ x0: r.x0 + d, x1: r.x1 - d, z0: r.z0 + d, z1: r.z1 - d });
/** 水平矩形面 */
const quad = (r: Rect, y: number) => topGeo(rectPts(r), y);
/** 盒子：中心 x、z，底在 y */
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export interface Terrain {
  root: THREE.Group;
  outlines: Record<string, V2[]>;
  /** 某点的地面高度 */
  groundAt(x: number, z: number): number;
  /** 车在 z 处从哪出现 / 消失（x）：横屏右边缘外，路接着往东边的山里去（以前是岛东沿，现在和 z 无关） */
  edgeX(z: number): number;
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const rnd = ctx.rng('park:outline');
  const LIP = ctx.texel * 1.2;

  const desertN = smoothLoop(DESERT_N, 0.5, rnd, 0.04);
  const desertS = smoothLoop(DESERT_S, 0.5, rnd, 0.04);
  const groundAt = (x: number, z: number) => {
    const p: V2 = [x, z];
    if (insidePoly(p, desertN)) return H.desertN;
    const a = approachAt(x, z);
    if (a !== null) return a;
    if (insidePoly(p, desertS)) return H.desertS;
    return H.ground;
  };
  const edgeX = (_z: number) => CAR_EDGE_X;

  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };
  const cliff = ctx.mat('cliff', { elem: EL.strata });
  const cliffLip = ctx.mat('cliffLip');
  const adobe = ctx.mat('adobe', { elem: EL.adobe });
  const cap = ctx.mat('cap');

  // ── 地面（沙）：一整块铺到最外一道山梁底下，挖掉南边低一级的沙漠 ──
  add(groundGeo([desertS], H.ground), ctx.mat('sand', { elem: EL.sand }), 'top:ground');

  // 南边低一级的沙漠：底面 + 朝里的崖壁（北沿 = 停车场南沿，朝镜头 = 暗带）
  add(topGeo(desertS, H.desertS), ctx.mat('sand', { elem: { ...EL.sand, seed: 9 } }), 'top:desertS');
  add(wallGeo(desertS, H.ground, H.ground - LIP, false), cliffLip, 'lip:desertS');
  add(
    wallGeo(desertS, H.ground - LIP, H.desertS - 0.3, false, 0, () => H.ground - H.desertS),
    cliff,
    'wall:desertS',
  );

  // 北边高一级的沙漠台地（崖壁朝南 = 暗带）
  add(topGeo(desertN, H.desertN), ctx.mat('sand', { elem: { ...EL.sand, seed: 5 } }), 'top:desertN');
  add(wallGeo(desertN, H.desertN, H.desertN - LIP, true), cliffLip, 'lip:desertN');
  add(
    wallGeo(desertN, H.desertN - LIP, H.ground - 0.3, true, 0, () => H.desertN - H.ground),
    cliff,
    'wall:desertN',
  );

  // ── 墙里面（clubdesk 场景的地）：压实的浅沙、长廊、到达小院的陶砖、球员草坪 ──
  add(
    quad({ x0: 30, x1: GATE.x, z0: GROUNDS.z0, z1: GROUNDS.z1 }, 0.004),
    ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 7 } }),
    'flat:grounds',
  );
  for (const [i, p] of PATHS.entries())
    if (p.x1 > 30)
      add(quad({ ...p, x0: Math.max(30, p.x0) }, 0.012), ctx.mat('path', { elem: EL.path }), `flat:path${i}`);
  add(quad(FORECOURT, 0.014), ctx.mat('tile', { elem: EL.tile }), 'flat:forecourt');
  add(quad(LAWN, 0.012), ctx.mat('lawn'), 'flat:lawn');

  // ── 东墙：x 60，门洞两边；1.9 米土坯 + 陶砖压顶 + 每 12 米一根壁柱（同 clubmap2/build.ts）──
  // 墙一律下到 −1.2（南边低一级的沙漠那段墙脚露出来）
  {
    const seg = (z0: number, z1: number) => {
      const r: Rect = { x0: GATE.x - WALL.t / 2, x1: GATE.x + WALL.t / 2, z0, z1 };
      add(
        wallGeo(rectPts(r), WALL.h, -1.2, true, 0, () => WALL.h),
        adobe,
        `wall:club${z0}`,
      );
      add(topGeo(rectPts(r), WALL.h), cap, `top:club${z0}`);
      add(box(WALL.t + 0.2, WALL.capH, z1 - z0 + 0.2, GATE.x, WALL.h, (z0 + z1) / 2), cap, `cap:club${z0}`);
      const n = Math.floor((z1 - z0) / 12);
      for (let i = 1; i < n; i++) {
        const pz = z0 + ((z1 - z0) * i) / n;
        const pr: Rect = {
          x0: GATE.x - WALL.pilaster / 2,
          x1: GATE.x + WALL.pilaster / 2,
          z0: pz - WALL.pilaster / 2,
          z1: pz + WALL.pilaster / 2,
        };
        add(
          wallGeo(rectPts(pr), WALL.pilasterH, -1.2, true, 0, () => WALL.pilasterH),
          adobe,
          `wall:pil${pz}`,
        );
        add(box(1.3, 0.2, 1.3, GATE.x, WALL.pilasterH, pz), cap, `cap:pil${pz}`);
      }
    };
    seg(GROUNDS.z0, GATE.z0 - 0.8);
    seg(GATE.z1 + 0.8, GROUNDS.z1);
  }

  // ── 大门外的铺地（车道、停车场、车位、落客区、步道、花坛、种植带、路缘）──
  const approach = buildApproach(ctx, add);

  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) {
    // 立面（墙、亮唇）不接收投影；平的地面图案不投影
    if (m.name.startsWith('wall:') || m.name.startsWith('lip:')) m.receiveShadow = false;
    if (m.name.startsWith('flat:') || m.name.startsWith('top:')) m.castShadow = false;
  }
  // 地图边的山（不投影、不受投影；prepare 之后再加，免得被它打开投影）
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));
  const outlines: Record<string, V2[]> = { desertN, desertS, ...approach.outlines };
  return { root, outlines, groundAt, edgeX };
}

const BERM_PTS = BERMS.map((b) => ({ id: b.id, r: b.r, pts: roundRect(b.r, 0.5) }));
const STRIP_PTS = STRIPS.map((s) => ({ id: s.id, r: s.r, pts: roundRect(s.r, 0.2) }));
/** 大门外铺地上的高度：花坛顶 / 种植带顶；不在上面 = null */
export function approachAt(x: number, z: number): number | null {
  const p: V2 = [x, z];
  for (const b of BERM_PTS) if (insidePoly(p, b.pts)) return H.berm;
  for (const s of STRIP_PTS) if (insidePoly(p, s.pts)) return H.kerb;
  return null;
}

/**
 * 大门外的铺地：车道（往东，翻过东边山梁的山口出画）、两片停车场、进出口、车位（碎石 + 分隔带 + 车轮挡）、车道中线、
 * 落客区连锁砖、墙边石板步道、花坛、种植带、停车场外沿路缘。clubpark 自己用；clubdesk 横屏右边（门外 x 60…76）也用这一份，
 * 两个场景在大门外看到的是同一块地。add(几何, 材质, 名字)：名字前缀 flat:/top:（平的，不投影）、wall:/lip:（立面，不受投影）。
 */
export function buildApproach(
  ctx: AssetCtx,
  add: (g: THREE.BufferGeometry, m: THREE.Material, name: string) => unknown,
): { outlines: Record<string, V2[]> } {
  const LIP = ctx.texel * 1.2;
  const adobe = ctx.mat('adobe', { elem: EL.adobe });
  const cap = ctx.mat('cap');
  const kerb = ctx.mat('kerb', { elem: EL.kerb });
  const asphalt = ctx.mat('lotAsphalt', { elem: EL.lotAsphalt });
  const paint = ctx.mat('lotPaint');
  const berms = BERM_PTS;
  const strips = STRIP_PTS;
  const expoOf = (top: number) => (x: number, z: number, nx: number, nz: number) =>
    Math.max(0, top - (approachAt(x + nx * 0.35, z + nz * 0.35) ?? H.ground));

  // ── 车道 + 两片停车场 + 进出口：沥青 ──
  const driveEnd = DRIVE_EAST_END;
  add(quad({ x0: GATE.x - 0.4, x1: driveEnd, z0: DRIVE.z0, z1: DRIVE.z1 }, 0.008), asphalt, 'flat:drive');
  for (const lot of [LOT_N, LOT_S]) add(quad(lot, 0.008), asphalt, `flat:lot${lot.z0}`);
  add(quad({ x0: ENTRY.x0, x1: ENTRY.x1, z0: LOT_N.z1 - 0.1, z1: DRIVE.z0 + 0.1 }, 0.008), asphalt, 'flat:entryN');
  add(quad({ x0: ENTRY.x0, x1: ENTRY.x1, z0: DRIVE.z1 - 0.1, z1: LOT_S.z0 + 0.1 }, 0.008), asphalt, 'flat:entryS');

  // 车位：碎石（每排连成一块，进出口断开）+ 车位之间的水泥分隔带（1.5 设计纹素宽）+ 车头那头一道水泥沿 + 车轮挡；
  // 车道中线（虚线，一屏幕行高）
  {
    const gravel: THREE.BufferGeometry[] = [];
    const bands: THREE.BufferGeometry[] = [];
    const stops: THREE.BufferGeometry[] = [];
    const BW = ctx.texel * 1.5;
    for (const row of ROWS) {
      const inGap = (i: number) => !!row.gap && i >= row.gap[0] && i <= row.gap[1];
      // 连续的车位段
      let a = -1;
      for (let i = 0; i <= STALL.n; i++) {
        const free = i < STALL.n && !inGap(i);
        if (free && a < 0) a = i;
        if (!free && a >= 0) {
          const r: Rect = { x0: STALL.x0 + STALL.w * a, x1: STALL.x0 + STALL.w * i, z0: row.z0, z1: row.z1 };
          gravel.push(quad(r, 0.012));
          const hz = row.nose < 0 ? row.z0 : row.z1 - BW;
          bands.push(quad({ x0: r.x0 - BW / 2, x1: r.x1 + BW / 2, z0: hz, z1: hz + BW }, 0.02));
          for (let k = a; k <= i; k++) {
            const x = STALL.x0 + STALL.w * k;
            bands.push(quad({ x0: x - BW / 2, x1: x + BW / 2, z0: row.z0, z1: row.z1 }, 0.02));
          }
          a = -1;
        }
      }
      for (let i = 0; i < STALL.n; i++) {
        if (inGap(i)) continue;
        const cx = STALL.x0 + STALL.w * (i + 0.5);
        const head = row.nose < 0 ? row.z0 + 0.6 : row.z1 - 0.6;
        stops.push(box(1.7, 0.13, 0.22, cx, 0.012, head));
      }
    }
    add(merge(gravel), ctx.mat('stallGravel', { elem: EL.stallGravel }), 'flat:stalls');
    add(merge(bands), ctx.mat('kerb'), 'flat:stallBands');
    add(merge(stops), kerb, 'stops');
    const lines: THREE.BufferGeometry[] = [];
    const DASH = 2.7;
    const RW = ctx.texel / Math.SQRT1_2; // 一屏幕行（设计纹素）
    let x = ENTRY.x1 + 1.35;
    for (; x + DASH < driveEnd; x += DASH * 2) lines.push(quad({ x0: x, x1: x + DASH, z0: -RW / 2, z1: RW / 2 }, 0.02));
    // 直段往东：翻过东边两道垭口（clubsite/mountains.ts 的山口、鞍部），路面和虚线跟着鞍部起伏，一直铺到地面尽头
    const pass = passRoadGeo(driveEnd - 0.01, DRIVE.z0, DRIVE.z1, 0.008, {
      lineW: RW,
      dash: DASH,
      lift: 0.02,
      from: x,
    });
    add(pass.road, asphalt, 'flat:drive-pass');
    if (pass.dashes) lines.push(pass.dashes);
    add(merge(lines), paint, 'flat:paint');
  }

  // ── 落客区（连锁砖，最亮的一块地）+ 墙边石板步道 ──
  add(topGeo(MOTOR_COURT, 0.016), ctx.mat('paver', { elem: EL.paver }), 'flat:motorcourt');
  for (const w of WALKS) add(quad(w.r, 0.014), ctx.mat('flagstone', { elem: EL.flagstone }), `flat:${w.id}`);

  // ── 花坛：土坯矮墙（0.55，朝镜头一面是暗带）+ 陶砖压顶的亮唇 + 沙顶 ──
  for (const b of berms) {
    add(topGeo(b.pts, H.berm), ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 11 } }), `top:${b.id}`);
    add(wallGeo(b.pts, H.berm, H.berm - LIP * 1.5, true), cap, `lip:${b.id}`);
    add(wallGeo(b.pts, H.berm - LIP * 1.5, -0.2, true, 0, expoOf(H.berm)), adobe, `wall:${b.id}`);
  }
  // ── 种植带：路缘一圈（水泥）+ 里面的沙 ──
  for (const s of strips) {
    add(topGeo(s.pts, H.kerb), kerb, `top:kerb-${s.id}`);
    add(wallGeo(s.pts, H.kerb, -0.2, true), kerb, `wall:kerb-${s.id}`);
    add(
      topGeo(roundRect(inset(s.r, 0.22), 0.1), H.kerb + 0.004),
      ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 13 } }),
      `top:${s.id}`,
    );
  }
  // 停车场外沿的路缘（北停车场北沿、南停车场南沿、两片的东沿）
  {
    const K = 0.3;
    const geos = [
      box(LOT_N.x1 - LOT_N.x0, H.kerb, K, (LOT_N.x0 + LOT_N.x1) / 2, 0, LOT_N.z0 - K / 2),
      box(LOT_S.x1 - LOT_S.x0, H.kerb, K, (LOT_S.x0 + LOT_S.x1) / 2, 0, LOT_S.z1 + K / 2),
      box(K, H.kerb, LOT_N.z1 - LOT_N.z0, LOT_N.x1 + K / 2, 0, (LOT_N.z0 + LOT_N.z1) / 2),
      box(K, H.kerb, LOT_S.z1 - LOT_S.z0, LOT_S.x1 + K / 2, 0, (LOT_S.z0 + LOT_S.z1) / 2),
    ];
    add(merge(geos), kerb, 'kerbs');
  }

  const outlines: Record<string, V2[]> = {};
  for (const b of berms) outlines[b.id] = b.pts;
  return { outlines };
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
