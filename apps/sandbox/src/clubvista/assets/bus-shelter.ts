// bus-shelter：马路边的候车亭，5.2 × 2.7 × 2.0 米，开口朝南（+z，朝镜头）。
// 深色平顶（往北斜 4°，前沿 2.7、后沿 ≈ 2.56），顶上是顺着坡的压型钢板（每 5 纹素一道楞，楞缝冷暗）；
// 前沿一道 2 行高的浅灰檐口（carSilver）；四根 2 纹素的方柱，后墙是一整块深色玻璃（ironwork 框：上下各 1 行横档）；
// （45° 俯视下后墙只露出最下面 ≈ 0.4 米：顶棚挡住了上面，所以后墙上不挂东西）
// 亭里一条长椅（两块晒白的木板 + 两只铁脚），脚下一块 1 纹素厚的水泥台。
// 太阳在画面后方：后墙和顶棚把整个亭子罩在投影里，亭里的长椅、水泥台落暗档（这才是"亭子里"）。
// 材质：顶棚、柱、框、椅脚 ironwork；檐口 carSilver；后墙 glass；椅面 woodWeathered；水泥台 curb。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAMP_COOL, nightLight } from '../../clubsite/daylight/night';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const ROW = T / Math.SQRT1_2;
const W = 5.2;
const D = 2.0;
const H = 2.7;
const TILT = 4 * (Math.PI / 180);
const ROOF_T = 2 * ROW * 0.75;
const PAD = T;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error('bus-shelter: merge failed');
  return g;
}

/** 朝镜头的竖面：光往上偏、档位阈值往下挪 */
const FACE = { lightUp: 0.5, bands: [-0.45, 0.3] as [number, number] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'bus-shelter';
  const iron: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const fascia: THREE.BufferGeometry[] = [];
  const seat: THREE.BufferGeometry[] = [];
  const pad: THREE.BufferGeometry[] = [];

  // ── 水泥台：比亭子四边各宽 1 纹素 ──
  pad.push(box(W + 2 * T, PAD, D + 2 * T, 0, PAD / 2, 0));

  // ── 柱：前两根在开口两角，后两根是后墙的边框 ──
  const px = W / 2 - 0.2;
  const zFront = D / 2 - 0.22;
  const zBack = -D / 2 + 0.14;
  const yRoofAt = (z: number) => H - ROOF_T - (zFront + 0.22 - z) * Math.tan(TILT);
  for (const sx of [-1, 1]) {
    const hf = yRoofAt(zFront) - PAD;
    iron.push(box(2 * T, hf, 2 * T, sx * px, PAD + hf / 2, zFront));
    const hb = yRoofAt(zBack) - PAD;
    iron.push(box(2 * T, hb, 2 * T, sx * px, PAD + hb / 2, zBack));
  }

  // ── 后墙：深色玻璃一整块，上下横档各 1 行；东头一块蓝灯箱（比玻璃往前 1 纹素） ──
  const wy0 = PAD + ROW * 1;
  const wy1 = yRoofAt(zBack) - ROW * 1;
  const ww = 2 * px - 2 * T;
  glass.push(box(ww, wy1 - wy0, T, 0, (wy0 + wy1) / 2, zBack));
  iron.push(box(ww, ROW, T * 1.5, 0, wy0 - ROW / 2, zBack));
  iron.push(box(ww, ROW, T * 1.5, 0, wy1 + ROW / 2, zBack));

  // ── 长椅：贴着后墙，西半边（灯箱在东头），两块板 + 两只铁脚 ──
  const bx = -0.55;
  const bl = 2.6;
  const by = 0.46;
  const bz = zBack + 0.36;
  const plank = 3 * T;
  seat.push(box(bl, 0.11, plank, bx, by, bz - plank / 2 - T / 2));
  seat.push(box(bl, 0.11, plank, bx, by, bz + plank / 2 + T / 2));
  for (const sx of [-1, 1]) {
    const lx = bx + sx * (bl / 2 - 0.3);
    iron.push(box(3 * T, by - PAD - 0.055, 5 * T, lx, PAD + (by - PAD - 0.055) / 2, bz));
  }

  // ── 顶棚：一块往北斜的板，前沿一条 1 行的檐（板的厚度），顶上顺坡的楞 ──
  const roof = box(W, ROOF_T, D, 0, 0, 0);
  roof.rotateX(-TILT).translate(0, H - ROOF_T / 2 - (D / 2) * Math.sin(TILT), 0);
  // 檐口：前沿一条 2 行高的浅灰金属封边（参考图的候车亭也是深顶 + 一道浅檐），挡住顶棚板的厚度
  const fy = H - ROW;
  fascia.push(box(W + T, 2 * ROW, T, 0, fy, D / 2 + T / 2));
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    const m = new THREE.Mesh(merge(geos), mat);
    g.add(m);
    return m;
  };
  // 压型钢板：楞顺着 z（往北的坡），板宽 5 纹素 → 屏幕上一道道竖楞；缝冷暗、缝后 1 纹素亮条
  add(
    [roof],
    ctx.mat('ironwork', {
      lightUp: 0.3,
      bands: [-0.3, 0.55],
      elem: { kind: 'planks', p: [1, 0, 0, 6 * T], seam: 1, hi: 0 },
      toneW: [0.22, 0.22],
    }),
  );
  add(iron, ctx.mat('ironwork', { ...FACE, convex: 0.25 }));
  add(glass, ctx.mat('glass', { lightUp: 0.5, bands: [0.4, 0.9], edge: 0.3, convex: 0.1 }));
  add(fascia, ctx.mat('carSilver', { ...FACE, convex: 0.3, noShadowReceive: true }));
  add(
    seat,
    ctx.mat('woodWeathered', {
      lightUp: 0.5,
      bands: [-0.45, 0.5],
      elem: { kind: 'planks', p: [0, 0, 1, plank + T], seam: 1, hi: 0.5 },
    }),
  );
  add(pad, ctx.mat('curb', { edge: 0.2, convex: 0.3 }));
  ctx.mats.prepare(g);
  // 夜里（light 代理，clubsite/daylight）：檐口换成亮着的灯管，亭里和亭前一片冷白的光
  const fasciaMesh = g.children[3] as THREE.Mesh;
  const fasciaOn = ctx.mat('carSilver', { ...FACE, ramp: [0xeef6e8, 0xeef6e8, 0xeef6e8], emissive: 0x141810 });
  g.userData.night = nightLight(g, {
    glow: [[fasciaMesh, fasciaMesh.material as THREE.Material, fasciaOn]],
    spots: [{ at: [0, 0, 0.9], r: 4.4, h: 2.4, c: LAMP_COOL }],
  });
  return g;
}
