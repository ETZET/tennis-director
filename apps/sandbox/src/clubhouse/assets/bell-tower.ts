// bell-tower：会所东南角的钟楼（#1）。4 × 17.8 × 4 米（44 × 198 × 44 设计纹素；包围盒 4.32 宽 = 檐口出挑 0.16）。
// 从下往上：白灰泥塔身 0…11.2（朝镜头的南面背光 = 白灰泥暗档，元素是一块块石灰水补刷的斑：暗档三色拉开到 −16 / +20，
// 比墙的 ±9 明显）、南门（x +0.4 的深色拱洞 1.4 × 2.6，被露台挡着，画廊里看得到）、一道窄窗；两级檐口线脚（10.84…11.22）；
// 钟室 11.22…14：南、东、西三面各一个半圆拱洞（2.3 宽、拱顶 13.64，北面实墙 → 钟室里是暗的），地是暗的（衬出铜钟），
// 南面拱洞里一根木梁挂一口铜钟（不接投影、往上偏光：影子里也读得出是铜的）；拱脚压条；腰线 + 檐壁（一圈 0.36 米的塔拉韦拉花砖带）+ 两级檐口（14…15）；
// 红瓦四坡尖顶 15…17.8：6 圈瓦，每圈下沿出挑 0.07、垂 0.11（一圈一道横的瓦檐 = 瓦的行），坡面上一列列筒瓦（planks），
// 顶上一个铜球 + 尖。尖顶不接投影、往上偏光 0.35：南坡落中档、东坡落亮档（亮档手挑得比屋面亮，L ≈ 173）。
// 元素：stucco = stones 16 × 10（石灰水斑，没有缝）；roofTile = planks（南北坡沿 x 0.4 米一列、有亮条；东西坡沿 z 0.72 米、只有缝）。
// 材质：stucco、talavera（花砖带，planks 0.36 米一块）、ironwork（洞里、钟室地上的暗色，提亮到 L 75：和暗墙差 < 60）、roofTile、brass、timber。
// 三角形 ≈ 760。只在外观里（views: ['out']）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tones } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import { TOWER } from '../layout';

type G = THREE.BufferGeometry;

/** 都转成 non-indexed、只留 position / normal / uv，好合并 */
function merge(geos: G[]): G {
  const list = geos.map((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const k of Object.keys(g.attributes))
      if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv)
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  const m = mergeGeometries(list);
  if (!m) throw new Error('bell-tower: merge failed');
  return m;
}
/** 盒子：底面在 y */
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** 平面上的四边形（逆时针 a b c d，法线按面算） */
function quads(list: number[][][]): G {
  const pos: number[] = [];
  for (const [a, b, c, d] of list) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 拱洞的形状（x 居中，y 从 0 起）：wOut × hOut 的板，挖一个 sill 起、宽 2r、拱顶 top 的半圆拱 */
function archPlate(wOut: number, hOut: number, r: number, sill: number, top: number, seg = 6): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-wOut / 2, 0);
  s.lineTo(wOut / 2, 0);
  s.lineTo(wOut / 2, hOut);
  s.lineTo(-wOut / 2, hOut);
  s.lineTo(-wOut / 2, 0);
  const hole = new THREE.Path();
  const spring = top - r;
  hole.moveTo(-r, sill);
  hole.lineTo(-r, spring);
  for (let i = 1; i <= seg; i++) {
    const a = Math.PI - (i / seg) * Math.PI;
    hole.lineTo(Math.cos(a) * r, spring + Math.sin(a) * r);
  }
  hole.lineTo(r, sill);
  hole.lineTo(-r, sill);
  s.holes.push(hole);
  return s;
}
/** 实心的拱形（门洞、窗洞的暗面） */
function archFill(w: number, h: number, seg = 6): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  for (let i = 1; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    s.lineTo(Math.cos(a) * r, h - r + Math.sin(a) * r);
  }
  s.lineTo(-r, 0);
  return s;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const W = TOWER.x1 - TOWER.x0; // 4
  const h2 = W / 2;
  const [B0] = TOWER.belfry; // 11.2
  const TOP = TOWER.h; // 15
  const ROOF = TOWER.roof; // 2.8

  // ── 材质 ──
  // 塔身：白灰泥。暗档（朝镜头的南面全在这里）三色拉开：本色 L 127、石灰水新刷的斑 L 146、旧斑 L 110
  const wall = ctx.mat('stucco', {
    elem: { kind: 'stones', size: [16, 10], seam: 0, hi: 0 },
    toneW: [0.3, 0.26],
    tones: {
      bands: [
        [0xfaeedc, 0xfff9e6, 0xeee0cc],
        [0xdcc6c0, 0xe8d2ca, 0xd0b8b4],
        [0x9a7686, 0xab8a97, 0x886676],
      ],
      seam: [0xe1d7c6, 0xc2afa9, 0x7b5e6a],
      hi: [0xffffff, 0xefd8d1, 0xae8597],
    },
  });
  // 洞里的暗色（窄窗、南门）：L 75，和暗墙差 ≈ 50
  const dark = ctx.mat('ironwork', {
    ramp: [0x6e5474, 0x624a6c, 0x5a4468],
    noShadowReceive: true,
    edge: 0.3,
    convex: 0,
  });
  // 尖顶的瓦：亮档比屋面（L 135）亮一截（东坡迎着太阳，L 165 → 调完 ≈ 173），中档 L 112（南坡），暗档同屋面
  const tileTones: Tones = {
    bands: [
      [0xfc9c66, 0xffa874, 0xf48e5c], // L 173 / 183 / 164（调色 +9、亮档乘太阳色 −10）
      [0xc0584c, 0xcc6454, 0xb04e46],
      [0x5c2c52, 0x6c3460, 0x4c2544],
    ],
    seam: [0xd06e4a, 0x983e42, 0x3f1e39],
    hi: [0xffb07a, 0xe06c5e, 0x803d72],
  };
  const tileOpts = {
    tones: tileTones,
    noShadowReceive: true,
    lightUp: 0.35,
    edge: 0.5,
    convex: 0.4,
  };
  const tileX = ctx.mat('roofTile', {
    ...tileOpts,
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 1, p: [1, 0, 0, 0.4], q: [1, 0, 0, 0] },
  });
  const tileZ = ctx.mat('roofTile', {
    ...tileOpts,
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 0, p: [0, 0, 1, 0.72], q: [1, 0, 0, 0] },
  });
  const brass = ctx.mat('brass', { noShadowReceive: true, lightUp: 0.55, bands: [-0.5, 0.35], convex: 0.6, edge: 0.5 });
  const timber = ctx.mat('timber', { noShadowReceive: true, lightUp: 0.4 });
  // 檐壁上一圈塔拉韦拉花砖带（会所的蓝釉砖，和壁泉、烟囱一家）：竖缝 0.36 米一块砖，朝镜头的面落中档
  const azulejo = ctx.mat('talavera', {
    elem: { kind: 'planks', space: 'local', seam: 1, hi: 0, p: [1, 0, 0, 0.36], q: [1, 0, 0, 0] },
    noShadowReceive: true,
    lightUp: 0.55,
    bands: [-0.45, 0.35],
    convex: 0.3,
  });

  const walls: G[] = [];
  const darks: G[] = [];

  // ── 塔身 ──
  walls.push(bx(W, B0, W, 0, 0, 0));
  // 两级檐口线脚（钟室下）
  walls.push(bx(W + 0.16, 0.18, W + 0.16, 0, B0 - 0.36, 0));
  walls.push(bx(W + 0.32, 0.2, W + 0.32, 0, B0 - 0.18, 0));
  const BF = B0 + 0.02; // 钟室的底（线脚顶）
  const BH = 14 - BF; // 钟室高 2.78
  // 窄窗：塔身南面 7.0…8.4，0.36 宽（4 纹素），下面一条窗台
  darks.push(new THREE.ShapeGeometry(archFill(0.36, 1.44, 3)).translate(-0.45, 7.0, h2 + 0.012));
  walls.push(bx(0.62, 0.1, 0.14, -0.45, 6.9, h2 + 0.05));
  // 南门（拱廊转角里的门洞）：x +0.4，1.4 × 2.6
  darks.push(new THREE.ShapeGeometry(archFill(1.4, 2.6, 6)).translate(0.4, 0, h2 + 0.012));

  // ── 钟室：南、东、西三面拱洞（厚 0.35），北面实墙；南北面整宽，东西面夹在中间 ──
  const T = 0.35;
  const R = 1.15;
  const SILL = 0.12;
  const ATOP = 2.42;
  const plateNS = new THREE.ExtrudeGeometry(archPlate(W, BH, R, SILL, ATOP), {
    depth: T,
    bevelEnabled: false,
    curveSegments: 6,
  });
  walls.push(plateNS.clone().translate(0, BF, h2 - T)); // 南
  // 北面不开洞：钟室里是暗的（北洞透进来的太阳把砖地照亮，钟就读不出来）
  walls.push(bx(W, BH, T, 0, BF, -h2 + T / 2));
  const plateEW = new THREE.ExtrudeGeometry(archPlate(W - 2 * T, BH, R, SILL, ATOP), {
    depth: T,
    bevelEnabled: false,
    curveSegments: 6,
  });
  walls.push(
    plateEW
      .clone()
      .rotateY(Math.PI / 2)
      .translate(h2 - T, BF, 0),
  ); // 东
  walls.push(
    plateEW
      .clone()
      .rotateY(Math.PI / 2)
      .translate(-h2, BF, 0),
  ); // 西
  // 钟室的地（暗：从拱洞里看进去是一块暗，衬出铜钟）
  const fl = h2 - T;
  const floorGeo = quads([
    [
      [-fl, BF + 0.005, fl],
      [fl, BF + 0.005, fl],
      [fl, BF + 0.005, -fl],
      [-fl, BF + 0.005, -fl],
    ],
  ]);

  // 拱脚的压条（南面两根墩子上，一条亮顶的横线）
  const pier = (W - 2 * R) / 2;
  for (const s of [-1, 1]) walls.push(bx(pier, 0.12, 0.08, (s * (W - pier)) / 2, BF + ATOP - R - 0.12, h2 + 0.04));
  // ── 腰线 + 檐壁 + 两级檐口（14…15） ──
  walls.push(bx(W + 0.12, 0.12, W + 0.12, 0, 14, 0));
  walls.push(bx(W, 0.63, W, 0, 14.12, 0));
  const frieze = bx(W + 0.02, 0.36, W + 0.02, 0, 14.25, 0);
  walls.push(bx(W + 0.16, 0.12, W + 0.16, 0, 14.75, 0));
  walls.push(bx(W + 0.32, 0.13, W + 0.32, 0, 14.87, 0));

  // ── 尖顶：6 圈，每圈下沿出挑 LIP、垂 DROP ──
  const N = 6;
  const A0 = h2 + 0.1;
  const LIP = 0.07;
  const DROP = 0.11;
  const half = (y: number) => A0 * (1 - (y - TOP) / ROOF);
  const sx: number[][][] = []; // 南北坡（planks 沿 x）
  const sz: number[][][] = []; // 东西坡（planks 沿 z）
  for (let i = 0; i < N; i++) {
    const y0 = TOP + (i * ROOF) / N;
    const y1 = TOP + ((i + 1) * ROOF) / N;
    const a0 = half(y0) + LIP;
    const a1 = half(y1);
    const yl = y0 - (i === 0 ? 0 : DROP);
    // 坡面（梯形）：南、北、东、西
    sx.push([
      [-a0, y0, a0],
      [a0, y0, a0],
      [a1, y1, a1],
      [-a1, y1, a1],
    ]);
    sx.push([
      [a0, y0, -a0],
      [-a0, y0, -a0],
      [-a1, y1, -a1],
      [a1, y1, -a1],
    ]);
    sz.push([
      [a0, y0, a0],
      [a0, y0, -a0],
      [a1, y1, -a1],
      [a1, y1, a1],
    ]);
    sz.push([
      [-a0, y0, -a0],
      [-a0, y0, a0],
      [-a1, y1, a1],
      [-a1, y1, -a1],
    ]);
    if (i > 0) {
      // 瓦檐（竖的一小条）：这一圈的下沿垂下去，盖住下一圈的顶
      sx.push([
        [-a0, yl, a0],
        [a0, yl, a0],
        [a0, y0, a0],
        [-a0, y0, a0],
      ]);
      sx.push([
        [a0, yl, -a0],
        [-a0, yl, -a0],
        [-a0, y0, -a0],
        [a0, y0, -a0],
      ]);
      sz.push([
        [a0, yl, a0],
        [a0, yl, -a0],
        [a0, y0, -a0],
        [a0, y0, a0],
      ]);
      sz.push([
        [-a0, yl, -a0],
        [-a0, yl, a0],
        [-a0, y0, a0],
        [-a0, y0, -a0],
      ]);
    }
  }

  // ── 钟：木梁 + 铜钟（lathe），顶上的铜球 + 尖 ──
  // 钟挂在南面拱洞里（西班牙传教会式：钟挂在拱洞里，45° 往下看才看得到；挂在钟室中间会被拱上的墙挡住）
  const BZ = h2 - 0.3;
  const beamY = BF + ATOP - 0.5;
  const beam = bx(2 * R + 0.1, 0.22, 0.22, 0, beamY, BZ);
  const prof = [
    [0.0, 0.0],
    [0.56, 0.0],
    [0.6, 0.1],
    [0.46, 0.3],
    [0.36, 0.62],
    [0.33, 0.86],
    [0.2, 0.98],
    [0.0, 1.02],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bell = new THREE.LatheGeometry(prof, 8).scale(0.78, 0.84, 0.78).translate(0, beamY - 0.84, BZ);
  const knob = new THREE.SphereGeometry(0.2, 6, 4).translate(0, TOP + ROOF + 0.12, 0);
  const spike = new THREE.ConeGeometry(0.09, 0.5, 4).translate(0, TOP + ROOF + 0.5, 0);

  g.add(new THREE.Mesh(merge(walls), wall));
  g.add(new THREE.Mesh(merge(darks), dark));
  g.add(new THREE.Mesh(floorGeo, dark));
  g.add(new THREE.Mesh(quads(sx), tileX));
  g.add(new THREE.Mesh(quads(sz), tileZ));
  g.add(new THREE.Mesh(merge([bell, knob, spike]), brass));
  g.add(new THREE.Mesh(beam, timber));
  g.add(new THREE.Mesh(frieze, azulejo));
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}
