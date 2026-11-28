// exit-gate：出口的门（第四轮「让布局说话」，2026-11-28）。路走到图边、要去下一张图的地方立一道门：
// 两根土坯灰泥门柱（5 纹素见方、高 2.1 米，陶砖压顶）+ 柱顶一根染色木横梁（两头出挑）+ 横梁正中挂一盏小方灯笼，
// 柱子往两边各接一截 1.6 米的矮墙（0.8 米高）—— 从侧面看（东西向的出口，门在画面上是竖着的）也读得出"墙上开了个口"。
// 一眼看出"从这儿出去"，不用写字（《垂钓手记》的码头、木桥、营地门都是这样讲出口的）。
// 本地坐标：路沿本地 +z 穿过去（rotation.y 让 +z 指向图外），两根柱子在 x = ±(净宽 / 2 + 柱宽 / 2)。净宽 3.2 米（路 2～2.6 米）。
// 柱子朝镜头那面是 adobe 的暗档（画面里的深色竖条，和挡土墙一家）；横梁、灯笼、压顶不投影（细东西的影子在路上是虚线）。
// 夜里灯笼亮（userData.night：daylight 天黑调 setOn；pool = 门下 3.5 米的灯光圈）。三角形 ≈ 132。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
/** 两柱之间的净宽（米） */
export const GATE_CLEAR = 3.2;
const PW = 5 * T;
const PH = 2.1;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error('exit-gate: merge failed');
  return g;
}

const FACE = { lightUp: 0.5, bands: [-0.45, 0.3] as [number, number] };

/**
 * clear = 两柱之间的净宽（米）；beam = 要不要横梁（台阶口只立两根柱子）；
 * deep > 0 = 顺着路再立一对柱子，变成一段木架廊（东西向的出口：镜头 yaw 0 从侧面看门只是一根竖线，看廊是"路钻进一段棚子"）
 */
export function buildExitGate(ctx: AssetCtx, clear = GATE_CLEAR, beam = true, deep = 0): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'exit-gate';
  const wall = ctx.mat('adobe', { ...FACE, convex: 0.25, edge: 0.5 });
  const cap = ctx.mat('cap', { ...FACE, noShadowReceive: true, convex: 0.3, edge: 0.4 });
  // 晒旧的灰褐木（第 2 轮：染色木的橘和草帽撞色，总监站在门下就"吞"进去了）
  const wood = ctx.mat('woodWeathered', { ...FACE, noShadowReceive: true, convex: 0.3, edge: 0.4 });
  const iron = ctx.mat('ironwork', { ...FACE, noShadowReceive: true, convex: 0.4, edge: 0.3 });
  const glassOff = ctx.mat('bulb', { lightUp: 0.8, bands: [-0.5, 0.2], noShadowReceive: true, convex: 0, edge: 0.3 });
  const glassOn = ctx.mat('flowerYellow', {
    lightUp: 1,
    bands: [-2, -2],
    noShadowReceive: true,
    convex: 0,
    edge: 0.2,
    emissive: 0x2a1c06,
  });
  const px = clear / 2 + PW / 2;
  const pillars: THREE.BufferGeometry[] = [];
  const caps: THREE.BufferGeometry[] = [];
  const blockers: [number, number, number][] = [];
  /** 矮墙：长、高、厚 */
  const WL = 1.6;
  const WH = 0.8;
  const WD = 3 * T;
  const zs = deep > 0 ? [-deep / 2, deep / 2] : [0];
  for (const sx of [-1, 1])
    for (const z of zs) {
      const x = sx * px;
      // 柱身 + 脚下一圈 1 纹素的勒脚
      pillars.push(box(PW, PH, PW, x, PH / 2, z));
      caps.push(box(PW + 2 * T, 2 * T, PW + 2 * T, x, T, z));
      // 压顶：出挑 1 纹素、2 纹素厚
      caps.push(box(PW + 2 * T, 2 * T, PW + 2 * T, x, PH + T, z));
      blockers.push([x, z, PW * 0.75]);
      if (deep > 0) continue;
      // 矮墙往外接一截（陶砖压顶 1 纹素）
      const wx = x + sx * (PW / 2 + WL / 2);
      pillars.push(box(WL, WH, WD, wx, WH / 2, z));
      caps.push(box(WL, T, WD + 2 * T, wx, WH + T / 2, z));
      for (let k = 0.4; k < WL; k += 0.6) blockers.push([x + sx * (PW / 2 + k), z, 0.3]);
    }
  g.userData.blockers = blockers;
  const p = new THREE.Mesh(merge(pillars), wall);
  p.castShadow = true;
  p.receiveShadow = true;
  g.add(p);
  const c = new THREE.Mesh(merge(caps), cap);
  c.castShadow = false;
  g.add(c);
  if (!beam) return g;
  // 横梁：搁在两根柱子的压顶上，两头各出挑 4 纹素；上面再一根细一点的副梁（椽子头的感觉）
  const y0 = PH + 2 * T;
  const span = clear + 2 * PW + 8 * T;
  const beams = merge(
    deep > 0
      ? [
          // 木架廊：两根顺着路的长梁搁在柱顶，两头各横一根椽子（第 2 轮：中间的椽子去掉 —— 5 根在侧面看是一排竖格，读成笼子，还把草帽吞了）
          ...[-1, 1].map((sx) => box(3 * T, 3 * T, deep + PW + 8 * T, sx * px, y0 + 1.5 * T, 0)),
          ...[-1, 1].map((k) => box(span, 2 * T, 3 * T, 0, y0 + 4 * T, (k * (deep + PW)) / 2)),
        ]
      : [box(span, 3 * T, 3 * T, 0, y0 + 1.5 * T, 0), box(span - 6 * T, 2 * T, 2 * T, 0, y0 + 4 * T, 0)],
  );
  const b = new THREE.Mesh(beams, wood);
  b.castShadow = true;
  g.add(b);
  // 灯笼：横梁正中垂下来 3 纹素的铁链 + 4 × 4 纹素的灯（铁帽、铁底）
  const ly = y0 - 3 * T;
  const metal = merge([
    box(T, 3 * T, T, 0, y0 - 1.5 * T, 0),
    box(5 * T, T, 5 * T, 0, ly - 0.5 * T, 0),
    box(5 * T, T, 5 * T, 0, ly - 5.5 * T, 0),
  ]);
  const m = new THREE.Mesh(metal, iron);
  m.castShadow = false;
  g.add(m);
  const glass = new THREE.Mesh(box(4 * T, 4 * T, 4 * T, 0, ly - 3 * T, 0), glassOff);
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
      return [pc.x, pc.z, 3.5, PH + 0.4];
    },
  };
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildExitGate(ctx);
}
