// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、建议的门洞（一圈小方点）。
// 只在标签开着时画（?labels=0 的截图里没有）。玩法（stage 3）照 layout.ts 的 SPOTS / ROUTES / WALKABLE 做；
// clubwalk 把场景连成一个大世界时，入口用 SPOTS.gateIn / gateOut（南墙门）和 eastIn / eastOut（东边绕，停车场南片）。
import * as THREE from 'three';
import type { Shape } from '../clubsite/play/nav';
import type { RegionNav } from '../clubsite/region';
import { smoothLine } from '../clubsite/render/geo';
import { GOLF, GOLF_POND } from '../clubsite/world';
import type { AssetCtx } from './ctx';
import { BUNKER_RAMPS, GOLF_GATE, type Rect, ROUTES, SLOTS, SPOTS, TEE_RAMPS, type V2 } from './layout';
import { SPECS } from './placeholders';

/** 给标签用的站位中文名（没列的不贴字） */
export const SPOT_NAMES: Partial<Record<keyof typeof SPOTS, string>> = {
  pondBalls: '捞球',
};

/** 按脚印（矩形，转 90° 换宽深）挡路的资产 */
const BOXED = new Set(['golf-cart', 'golf-bag', 'bench']);
/** 按圆挡路的：树只挡树干、旗杆只挡杆子、灌木 / 仙人掌 / 石头按冠的大半（半径 × 缩放；灌木和 clubcourts/play.ts 的 PLANT_R 一致） */
const ROUND: Record<string, number> = {
  'fan-palm': 0.36,
  'palo-verde': 0.45,
  'smoke-tree': 0.5,
  flagstick: 0.05,
  rocks: 0.8,
  agave: 0.6,
  brittlebush: 0.45,
  creosote: 0.6,
  'barrel-cactus': 0.35,
  ocotillo: 0.4,
  cholla: 0.4,
};

/** 挡路的：南墙（门洞 x −38.65…−34.35 留着）、水塘、SLOTS 里的球车、球包、长椅、树干、旗杆、石头、灌木、仙人掌（人、球、耙子、鸭子、走鹃、发球台标志不挡） */
export function golfBlocked(): Shape[] {
  const out: Shape[] = [
    { a: [GOLF.x0, GOLF_GATE.z], b: [GOLF_GATE.x0, GOLF_GATE.z], r: 0.4 },
    { a: [GOLF_GATE.x1, GOLF_GATE.z], b: [GOLF.x1, GOLF_GATE.z], r: 0.4 },
    { x: GOLF_POND.x, z: GOLF_POND.z, r: GOLF_POND.rz + 0.4 },
    { x: GOLF_POND.x - GOLF_POND.rx * 0.5, z: GOLF_POND.z, r: GOLF_POND.rz },
    { x: GOLF_POND.x + GOLF_POND.rx * 0.5, z: GOLF_POND.z, r: GOLF_POND.rz },
  ];
  for (const s of SLOTS) {
    const sc = s.s ?? 1;
    const r = ROUND[s.asset];
    if (r) {
      out.push({ x: s.x, z: s.z, r: r * sc });
      continue;
    }
    const sp = SPECS[s.asset];
    if (!BOXED.has(s.asset) || !sp) continue;
    const ry = s.rotY ?? 0;
    const c = Math.abs(Math.cos(ry));
    const sn = Math.abs(Math.sin(ry));
    const hw = ((sp.w * c + sp.d * sn) / 2) * sc;
    const hd = ((sp.w * sn + sp.d * c) / 2) * sc;
    out.push({ x0: s.x - hw, x1: s.x + hw, z0: s.z - hd, z1: s.z + hd });
  }
  return out;
}

/**
 * 导航（clubwalk 的区域 nav()）：挡路的见 golfBlocked()；发球台从西、东两段坡上去（TEE_RAMPS），两个沙坑各两段坡（BUNKER_RAMPS）。
 * 北边只到南墙里 0.7 米：墙里的入口 gateIn（z 50.8）归 clubwalk 的底图，这里再往北包会多出一条贴墙的孤条。
 */
export function golfNav(): RegionNav {
  return {
    bounds: { x0: GOLF.x0, x1: GOLF.x1, z0: GOLF_GATE.z - 0.7, z1: GOLF.z1 + 2 },
    blocked: golfBlocked(),
    ramps: [...TEE_RAMPS, ...BUNKER_RAMPS],
  };
}

export function buildNav(ctx: AssetCtx, groundAt: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nav';
  const m = ctx.mat('navMark', { noShadowReceive: true });
  const disc = new THREE.CircleGeometry(0.3, 16).rotateX(-Math.PI / 2);
  const dot = new THREE.CircleGeometry(0.08, 6).rotateX(-Math.PI / 2);
  const sq = new THREE.PlaneGeometry(0.16, 0.16).rotateX(-Math.PI / 2);
  for (const [x, z] of Object.values(SPOTS)) {
    const o = new THREE.Mesh(disc, m);
    o.position.set(x, groundAt(x, z) + 0.05, z);
    g.add(o);
  }
  for (const r of ROUTES) {
    for (const [x, z] of smoothLine(r.pts, 0.9)) {
      const o = new THREE.Mesh(dot, m);
      o.position.set(x, groundAt(x, z) + 0.04, z);
      g.add(o);
    }
  }
  // 建议的门洞：每 0.6 米一个小方点
  const rim = (r: Rect) => {
    const pts: V2[] = [
      [r.x0, r.z0],
      [r.x1, r.z0],
      [r.x1, r.z1],
      [r.x0, r.z1],
    ];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % 4];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.6));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        const o = new THREE.Mesh(sq, m);
        o.position.set(x, groundAt(x, z) + 0.05, z);
        g.add(o);
      }
    }
  };
  rim({ x0: GOLF_GATE.x0, x1: GOLF_GATE.x1, z0: GOLF_GATE.z - 0.6, z1: GOLF_GATE.z + 0.6 });
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
