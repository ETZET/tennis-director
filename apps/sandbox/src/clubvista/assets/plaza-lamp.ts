// plaza-lamp：广场的铁灯柱（喷泉广场的集市角，串灯两头拴在它上面）。高 3.0 米。
// 一块 2 纹素厚的陶砖墩（0.36 见方）+ 2 纹素粗的黑铁方杆 + 杆顶一只方灯笼（铁框 4 × 5 纹素，四面奶白玻璃，铁帽往外出挑 1 纹素）
// + 杆身 2.6 米处一根往外伸的短铁臂（串灯拴在这里）。
// 白天玻璃是奶白（bulb）；夜里换成自发光的暖黄（userData.night：daylight 天黑调 setOn；pool = 灯下 4 米的灯光圈）。
// 杆、墩不投影（细杆的影子在石板上是一串虚线）。三角形 ≈ 84。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const H = 3.0;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error('plaza-lamp: merge failed');
  return g;
}

const FACE = { lightUp: 0.5, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const iron = ctx.mat('ironwork', { ...FACE, convex: 0.5, edge: 0.4 });
  const foot = ctx.mat('cap', { ...FACE, convex: 0.4, edge: 0.3 });
  const glassOff = ctx.mat('bulb', { lightUp: 0.8, bands: [-0.5, 0.2], noShadowReceive: true, convex: 0, edge: 0.3 });
  const glassOn = ctx.mat('flowerYellow', {
    lightUp: 1,
    bands: [-2, -2],
    noShadowReceive: true,
    convex: 0,
    edge: 0.2,
    emissive: 0x2a1c06,
  });
  const lanternY = H - 5 * T;
  const metal = merge([
    box(2 * T, lanternY, 2 * T, 0, lanternY / 2, 0),
    // 灯笼的铁框：底板、帽（出挑 1 纹素）、帽顶一颗小钮
    box(5 * T, T, 5 * T, 0, lanternY + T / 2, 0),
    box(6 * T, T, 6 * T, 0, H - T / 2, 0),
    box(2 * T, T, 2 * T, 0, H + T / 2, 0),
    // 短铁臂（往东伸 4 纹素）
    box(4 * T, T, T, 2.5 * T, 2.6, 0),
  ]);
  const m = new THREE.Mesh(metal, iron);
  m.castShadow = false;
  g.add(m);
  const base = new THREE.Mesh(box(4 * T, 2 * T, 4 * T, 0, T, 0), foot);
  base.castShadow = false;
  g.add(base);
  const glass = new THREE.Mesh(box(4 * T, 3 * T, 4 * T, 0, lanternY + T + 1.5 * T, 0), glassOff);
  glass.castShadow = false;
  g.add(glass);
  const setOn = (on: boolean) => {
    glass.material = on ? glassOn : glassOff;
  };
  const pc = new THREE.Vector3();
  g.userData.setOn = setOn;
  g.userData.night = {
    setOn,
    pool: (): [number, number, number, number] => {
      g.getWorldPosition(pc);
      return [pc.x, pc.z, 4, H + 0.4];
    },
  };
  return g;
}
