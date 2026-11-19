// 餐馆的资产（批 D，2026-11-18 美术关卡 2，docs/lab/2026-11-07-3d-pixel/valley-civic.md「餐馆」）。这个文件归餐馆的资产代理。
// ASSETS['<id>'] = (ctx) => THREE.Object3D：本地原点 = 落地点中心，y 0 = 地面，+z 朝南；材质只用 ctx.mat(key, extra)；随机只用 ctx.rng('<id>')。
// 画廊：/valleyassets.html?asset=<id>。
//
// **尺寸 = 游戏里的真米数（缩完的）**：餐馆的楼按 TOWN_K 缩，人不缩 —— 卡座、吧台凳、坐着的人按真人尺寸画；
// detail/sites/diner.ts 摆的时候位置过缩放框的逆变换、obj.scale = 1 / TOWN_K，townwrap 再缩回来正好是这里画的大小。
//
// Googie 咖啡店：往南翘的斜屋顶（一圈珊瑚红封檐 = 重点）、整面玻璃（竖棂和卡座的隔板对齐）、西头毛石墙、门东石墩上的招聘软木板、
// 门西一根往东斜的高杆招牌（DINER + CAFE + 星芒）。看点 = 隔着玻璃看到里面坐着的人。
//
// 画法（material-spec.md / 资产代理的经验）：
// - 店堂整个在翘顶的影子里（太阳在画面后方）→ 店里的东西（地、卡座、吧台、人）用 ROOM：不接收投影 + 光往上偏 + 档位线往下挪
//   = 开着灯的店堂比外面的影子亮一档，卡座的人一眼看得清。
// - 屋顶不抢：薄（0.16 米）、安静的中性灰碎石面（大块低对比斑，不撒点），封檐那条珊瑚红是重点。
// - 线 1 纹素（0.09 米），竖直面上一行 = ROW（0.127 米）；字是 5 × 7 的像素字。
// - 夜里：吊灯、招牌字、星芒、玻璃门自发光，店堂的地和桌面泛暖光，门前一个灯光圈（userData.night = { setOn, pool }）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import { blobNormals, type ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../ctx';
import { type PalKey, SIGN_FACE, TOWN_EL } from '../palette';

/** 设计纹素（米） */
const T = 0.09;
/** 竖直面上一屏幕行 = 0.09 / cos45 米 */
const ROW = T / Math.SQRT1_2;

/** 楼的尺寸（缩完的米）：detail/sites/diner.ts 也读这张表 */
export const DINER = {
  /** 宽（东西）、深（南北） */
  W: 10,
  D: 6.5,
  /** 地坪（build.ts 的底座 0.124 + 屋顶板 0.35） */
  FLOOR: 0.474,
  /** 店堂进深（玻璃到厨房墙） */
  HALL: 3.8,
  /** 门（本地 x，宽） */
  DOOR_X: 3.4,
  DOOR_W: 1.3,
  /** 斜屋顶：后沿顶面高、前沿顶面高、前沿挑出、后沿挑出 */
  ROOF_BACK: 3.9,
  ROOF_FRONT: 5.0,
  ROOF_OVER: 0.3,
  ROOF_BACK_OVER: 0.3,
} as const;
const { W, D, FLOOR: Y0, HALL, DOOR_X, DOOR_W } = DINER;
const FZ = D / 2;
const BZ = -D / 2;
const ZB = BZ - DINER.ROOF_BACK_OVER;
const ZF = FZ + DINER.ROOF_OVER;
/** 屋顶顶面在 z 处的高 */
const roofTop = (z: number) => DINER.ROOF_BACK + ((z - ZB) / (ZF - ZB)) * (DINER.ROOF_FRONT - DINER.ROOF_BACK);
const ROOF_TH = 0.16;
/** 玻璃顶（屋顶底面下一点） */
const GLASS_TOP = roofTop(FZ) - ROOF_TH - 0.03;
const GLASS_X0 = -W / 2 + 0.6;
const GLASS_X1 = DOOR_X - DOOR_W / 2 - 0.15;
const PITCH = (GLASS_X1 - GLASS_X0) / 4;
/** 店堂里：卡座（离玻璃 t 米）、吧台凳、吧台 */
const BOOTH_T0 = 0.3;
const BOOTH_T1 = 1.55;
const STOOL_T = 2.12;
const COUNTER_T = 2.4;
const zOf = (t: number) => FZ - t;

/** 立面本身：不接收投影 */
const WALL: ToonOpts = { noShadowReceive: true };
/** 开着灯的店堂：不接收投影 + 光往上偏 + 档位线往下挪（朝南、朝上的面都落亮 / 中档） */
const ROOM: ToonOpts = { noShadowReceive: true, lightUp: 0.6, bands: [-0.5, 0.15] };
/** 店里的人：同 ROOM，圆的部件（球面法线）亮顶更清楚 */
const FOLK: ToonOpts = { noShadowReceive: true, lightUp: 0.55, bands: [-0.45, 0.25] };

/** 屋面：安静的中性灰碎石（不抢：比 roofMetal 暗一档、低彩度；大块低对比斑，不撒点）。借 roofMetal 的 court 组过午后调色 */
const GRAVEL: ToonOpts = {
  ramp: [0xbcb4ac, 0x9a92a0, 0x5c5878],
  edge: 0.3,
  convex: 0.2,
  tones: {
    bands: [
      [0xbcb4ac, 0xc2bab2, 0xb6aea8], // L 181 / 187 / 176（斑只差 ±6：安静）
      [0x9a92a0, 0xa098a6, 0x948c9a], // L 149 / 155 / 143
      [0x5c5878, 0x625e7e, 0x565272], // L 91 / 97 / 85
    ],
    seam: [0xa29a94, 0x807890, 0x403c5a],
    hi: [0xd6d0c8, 0xb4acb8, 0x7a7698],
  },
  elem: { kind: 'paint', size: [16, 9], density: [0, 0.02], patch: 4 },
};
/** 水磨石地的深格（比本色暗 ~35，低对比的格子，不是黑白格 —— 黑白格每条边都是强边缘） */
const TERRAZZO_DARK: ToonOpts = {
  ramp: [0xcdb8a8, 0xa89498, 0x5a5078],
  tones: {
    bands: [
      [0xcdb8a8, 0xd6c2b2, 0xc4ae9e],
      [0xa89498, 0xb29ea2, 0x9e8a8e],
      [0x5a5078, 0x645a82, 0x50466e],
    ],
    seam: [0xb4a090, 0x8c7880, 0x403860],
    hi: [0xe2d0c0, 0xc0aeb0, 0x786e96],
  },
};

type Part = { g: THREE.BufferGeometry; m: THREE.Material; cast: boolean };
/** 按（材质, 投不投影）合成网格 */
class Parts {
  list: Part[] = [];
  constructor(private ctx: AssetCtx) {}
  add(m: THREE.Material, g: THREE.BufferGeometry, cast = true) {
    this.list.push({ g, m, cast });
  }
  build(name: string): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    const by = new Map<string, { m: THREE.Material; cast: boolean; gs: THREE.BufferGeometry[] }>();
    for (const { g, m, cast } of this.list) {
      const ng = g.index ? g.toNonIndexed() : g;
      for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
      if (!ng.attributes.normal) ng.computeVertexNormals();
      const k = `${m.uuid}:${cast}`;
      const e = by.get(k) ?? { m, cast, gs: [] };
      e.gs.push(ng);
      by.set(k, e);
    }
    for (const { m, cast, gs } of by.values()) {
      const merged = mergeGeometries(gs);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.name = `${name}:${(m.userData.palKey as string | undefined) ?? m.name}`;
      if (!cast) mesh.userData.noCast = true;
      out.add(mesh);
    }
    this.ctx.mats.prepare(out);
    out.traverse((o) => {
      if (o.userData.noCast) o.castShadow = false;
    });
    return out;
  }
}

/** 顶面顺着屋顶斜的块（x0…x1 × z0…z1，从 y0 到屋顶底面下 gap） */
function wedge(x0: number, x1: number, z0: number, z1: number, y0: number, gap = 0.02): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, 1, z1 - z0).translate((x0 + x1) / 2, 0.5, (z0 + z1) / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) > 0.5 ? roofTop(pos.getZ(i)) - ROOF_TH - gap : y0);
  g.computeVertexNormals();
  return g;
}
/** 顺着屋顶斜的一条（沿 z，x 中心、宽 w；顶 = 屋顶顶面 + dy，往下 h0（后沿）… h1（前沿）） */
function slopeBeam(x: number, w: number, dy: number, h0: number, h1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, 1, ZF - ZB).translate(x, 0.5, (ZB + ZF) / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const top = roofTop(z) + dy;
    const h = h0 + ((z - ZB) / (ZF - ZB)) * (h1 - h0);
    pos.setY(i, pos.getY(i) > 0.5 ? top : top - h);
  }
  g.computeVertexNormals();
  return g;
}

/** 5 × 7 的像素字（# = 一格：宽 1 纹素、高 1 屏幕行） */
const FONT: Record<string, string[]> = {
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
};
const textCols = (s: string) => s.length * 6 - 1;
/** 一行字 → 平板（x 居中于 cx，y0 = 字底，z = 板面，往外 0.01） */
function textGeo(s: string, cx: number, y0: number, z: number, cell = T, row = ROW): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const x0 = cx - (textCols(s) * cell) / 2;
  for (const [i, ch] of [...s].entries()) {
    const g = FONT[ch];
    if (!g) continue;
    for (let r = 0; r < 7; r++) {
      let c = 0;
      while (c < 5) {
        if (g[r][c] !== '#') {
          c++;
          continue;
        }
        let e = c;
        while (e < 5 && g[r][e] === '#') e++;
        out.push(
          new THREE.PlaneGeometry((e - c) * cell, row).translate(
            x0 + (i * 6 + (c + e) / 2) * cell,
            y0 + (6 - r) * row + row / 2,
            z,
          ),
        );
        c = e;
      }
    }
  }
  return out;
}

/** 夜里开关：换材质（白天 → 夜里），锁着的区域（材质被换成压暗的）不开；pool 是本地坐标的灯光圈 */
function nightSwitch(
  root: THREE.Object3D,
  swaps: Map<THREE.Material, THREE.Material>,
  pool?: { x: number; z: number; r: number; h: number },
) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && swaps.has(m.material as THREE.Material)) {
      m.userData.dinerDay = m.material;
      meshes.push(m);
    }
  });
  let on = false;
  let lit = false;
  const v = new THREE.Vector3();
  root.userData.night = {
    setOn(o: boolean) {
      on = o;
      lit = false;
      for (const m of meshes) {
        const day = m.userData.dinerDay as THREE.Material;
        const night = swaps.get(day) as THREE.Material;
        if (m.material !== day && m.material !== night) continue;
        m.material = on ? night : day;
        lit = true;
      }
    },
    pool: pool
      ? () => {
          v.set(pool.x, 0, pool.z).applyMatrix4(root.matrixWorld);
          return on && lit ? [v.x, v.z, pool.r, pool.h] : [v.x, v.z, 0, 0];
        }
      : undefined,
  };
}

// ══ diner-shell：楼（原点 = 楼的中心；玻璃在 z = +D/2）══════════════════════
// 厨房、西头毛石墙、东墙、门东石墩、窗台、竖棂、门、台阶、斜屋顶 + 封檐、屋顶上一台排油烟罩。店堂里的东西是别的资产。
const shell: AssetFn = (ctx) => {
  const p = new Parts(ctx);
  const stucco = ctx.mat('stucco', WALL);
  // 毛石：朝南的面光往上偏一点 → 落中档的暖褐（不然和市中心灰泥楼的暗档立面一个颜色）
  const stone = ctx.mat('flagstone', {
    ...WALL,
    lightUp: 0.4,
    bands: [-0.35, 0.4],
    elem: { kind: 'stones', size: [7, 4], seam: 1, hi: 0.5 },
  });
  const chrome = ctx.mat('roofMetal', { noShadowReceive: true, lightUp: 0.4, bands: [-0.3, 0.35] });
  const coral = ctx.mat('dinerCoral', { lightUp: 0.35, bands: [-0.25, 0.35], noShadowReceive: true });
  const gravel = ctx.mat('roofMetal', GRAVEL);
  const glassDay = ctx.mat('jug', { noShadowReceive: true, lightUp: 0.4, bands: [-0.3, 0.3] });
  const glassNight = ctx.mat('jug', { noShadowReceive: true, lightUp: 0.4, bands: [-0.3, 0.3], emissive: 0x6a4a28 });
  const step = ctx.mat('terrazzo', { noShadowReceive: true });
  const kitchenBack = HALL;
  // 厨房（店堂背后一整块）+ 店堂后墙（朝南的那面贴一层暖白：从玻璃里看是亮的店堂底）
  p.add(stucco, wedge(-W / 2, W / 2, BZ, FZ - kitchenBack, Y0));
  // 西头毛石墙（整面）、东墙、门东石墩（挂软木板）
  p.add(stone, wedge(-W / 2, -W / 2 + 0.6, FZ - kitchenBack, FZ, Y0));
  p.add(stucco, wedge(W / 2 - 0.25, W / 2, FZ - kitchenBack, FZ - 0.5, Y0));
  const pierX0 = DOOR_X + DOOR_W / 2 + 0.1;
  p.add(stone, wedge(pierX0, W / 2, FZ - 0.5, FZ, Y0));
  // 底座前脸：build.ts 的屋顶板（0.35 厚、外扩 0.25）是灰的 —— 贴一层毛石皮，楼像坐在一道矮石台上
  p.add(stone, box(W + 0.52, Y0 - 0.02, 0.04, 0, 0.01, FZ + 0.27));
  // 窗台（玻璃底下一道矮毛石墙 + 一条镀铬压顶）
  p.add(stone, box(GLASS_X1 - GLASS_X0, 0.36, 0.25, (GLASS_X0 + GLASS_X1) / 2, Y0, FZ - 0.125));
  p.add(chrome, box(GLASS_X1 - GLASS_X0 + 0.1, 0.09, 0.3, (GLASS_X0 + GLASS_X1) / 2, Y0 + 0.36, FZ - 0.13));
  // 竖棂（和卡座的隔板对齐，1.75 米一格）+ 玻璃顶一道横框
  for (let i = 0; i <= 4; i++)
    p.add(chrome, box(0.11, GLASS_TOP - Y0 - 0.45, 0.11, GLASS_X0 + i * PITCH, Y0 + 0.45, FZ - 0.06));
  p.add(chrome, box(W - 0.6, 0.11, 0.11, 0.3, GLASS_TOP - 0.11, FZ - 0.06));
  // 门：两根门框、门头横框、玻璃门（两扇，中缝 1 纹素）+ 推杆；门头以上是亮窗
  for (const sx of [-1, 1])
    p.add(chrome, box(0.12, GLASS_TOP - Y0, 0.12, DOOR_X + sx * (DOOR_W / 2 + 0.06), Y0, FZ - 0.06));
  p.add(chrome, box(DOOR_W + 0.24, 0.11, 0.12, DOOR_X, Y0 + 2.2, FZ - 0.06));
  // 门头以上的亮窗：一块玻璃（不然透过去看到的是店堂地面的格子）
  p.add(glassDay, box(DOOR_W, GLASS_TOP - Y0 - 2.31, 0.04, DOOR_X, Y0 + 2.31, FZ - 0.1), false);
  for (const sx of [-1, 1]) {
    p.add(glassDay, box(DOOR_W / 2 - 0.05, 2.2, 0.05, DOOR_X + sx * (DOOR_W / 4 + 0.025), Y0, FZ - 0.1), false);
    p.add(chrome, box(0.36, 0.09, 0.06, DOOR_X + sx * 0.3, Y0 + 1.05, FZ - 0.05), false);
  }
  // 门前两级台阶（水磨石面）
  for (let i = 0; i < 2; i++)
    p.add(step, box(DOOR_W + 0.6, (Y0 * (2 - i)) / 3, 0.4, DOOR_X, 0, FZ + 0.25 + 0.2 + i * 0.4));
  // 斜屋顶：薄板（碎石面）+ 一圈珊瑚红封檐（前沿最厚、两侧往后收窄 = 拉远看的"回旋镖"边）
  {
    const L = Math.hypot(ZF - ZB, DINER.ROOF_FRONT - DINER.ROOF_BACK);
    const tilt = -Math.atan2(DINER.ROOF_FRONT - DINER.ROOF_BACK, ZF - ZB);
    const slab = new THREE.BoxGeometry(W + 0.5, ROOF_TH, L)
      .translate(0, -ROOF_TH / 2, 0)
      .rotateX(tilt)
      .translate(0, (DINER.ROOF_BACK + DINER.ROOF_FRONT) / 2, (ZB + ZF) / 2);
    p.add(gravel, slab);
    for (const sx of [-1, 1]) p.add(coral, slopeBeam(sx * (W / 2 + 0.25 + 0.06), 0.14, 0.06, 0.24, 0.38));
    p.add(coral, box(W + 0.78, 0.38, 0.14, 0, DINER.ROOF_FRONT + 0.06 - 0.38, ZF + 0.07));
    // 屋顶上：后半截一台排油烟罩（厨房）+ 一根烟道，别的不放（屋顶不抢）
    const hx = -1.6;
    const hz = BZ + 1.2;
    p.add(chrome, box(1.1, 0.5, 0.9, hx, roofTop(hz) - 0.02, hz));
    p.add(chrome, box(0.36, 0.5, 0.36, hx, roofTop(hz) + 0.48, hz));
  }
  const g = p.build('diner-shell');
  nightSwitch(g, new Map([[glassDay, glassNight]]), { x: 0, z: FZ + 1.6, r: 6, h: 3 });
  return g;
};

// ══ diner-floor：店堂的地（水磨石两色格，原点 = 楼的中心）════════════════
const floor: AssetFn = (ctx) => {
  const p = new Parts(ctx);
  const light = ctx.mat('terrazzo', { ...ROOM, elem: TOWN_EL.terrazzo });
  const dark = ctx.mat('terrazzo', { ...ROOM, ...TERRAZZO_DARK });
  const lightN = ctx.mat('terrazzo', { ...ROOM, elem: TOWN_EL.terrazzo, emissive: 0x3a2412 });
  const darkN = ctx.mat('terrazzo', { ...ROOM, ...TERRAZZO_DARK, emissive: 0x3a2412 });
  const x0 = -W / 2 + 0.6;
  const x1 = W / 2 - 0.25;
  // 浅色一整块（整个店堂），深格只铺吧台前面看得见的那一截（玻璃到吧台，t < COUNTER_T），叠高 1 厘米
  p.add(
    light,
    new THREE.PlaneGeometry(x1 - x0, HALL).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, Y0 + 0.012, FZ - HALL / 2),
    false,
  );
  const S = 4 * T; // 一格 0.36 米
  const nx = Math.ceil((x1 - x0) / S);
  const nz = Math.ceil(COUNTER_T / S);
  for (let i = 0; i < nx; i++)
    for (let j = i % 2; j < nz; j += 2) {
      const w = Math.min(S, x1 - x0 - i * S);
      const d = Math.min(S, COUNTER_T - j * S);
      const q = new THREE.PlaneGeometry(w, d)
        .rotateX(-Math.PI / 2)
        .translate(x0 + i * S + w / 2, Y0 + 0.022, FZ - j * S - d / 2);
      p.add(dark, q, false);
    }
  const g = p.build('diner-floor');
  nightSwitch(
    g,
    new Map([
      [light, lightN],
      [dark, darkN],
    ]),
  );
  return g;
};

// ══ diner-booths：靠窗 4 个卡座（垂直于玻璃：红漆皮高靠背 = 隔板，坐垫、桌子、杯子；原点 = 楼的中心）═══
const booths: AssetFn = (ctx) => {
  const p = new Parts(ctx);
  const vinyl = ctx.mat('carRed', ROOM);
  const chrome = ctx.mat('roofMetal', ROOM);
  const top = ctx.mat('counterTop', ROOM);
  const topN = ctx.mat('counterTop', { ...ROOM, emissive: 0x302010 });
  const cup = ctx.mat('clothWhite', ROOM);
  const bd = BOOTH_T1 - BOOTH_T0;
  const bz = zOf((BOOTH_T0 + BOOTH_T1) / 2);
  for (let i = 0; i <= 4; i++) {
    const x = GLASS_X0 + i * PITCH;
    p.add(vinyl, box(0.16, 1.12, bd, x, Y0, bz)); // 高靠背（两边的背靠背）
    p.add(chrome, box(0.2, 0.09, bd + 0.04, x, Y0 + 1.12, bz)); // 顶上一道镀铬边
  }
  for (let i = 0; i < 4; i++) {
    const cx = GLASS_X0 + (i + 0.5) * PITCH;
    for (const sx of [-1, 1]) {
      p.add(vinyl, box(0.48, 0.45, bd - 0.06, cx + sx * (PITCH / 2 - 0.32), Y0, bz)); // 坐垫
    }
    p.add(chrome, box(0.11, 0.7, 0.11, cx, Y0, bz));
    p.add(top, box(PITCH - 1.16, 0.07, bd - 0.2, cx, Y0 + 0.7, bz)); // 桌面
    p.add(cup, box(0.18, 0.13, 0.18, cx - 0.12, Y0 + 0.77, bz + 0.25));
    if (i % 2 === 0) p.add(chrome, box(0.18, 0.2, 0.18, cx + 0.1, Y0 + 0.77, bz - 0.3)); // 糖罐 / 纸巾盒
  }
  const g = p.build('diner-booths');
  nightSwitch(g, new Map([[top, topN]]));
  return g;
};

// ══ diner-counter：吧台 + 一排吧台凳（原点 = 楼的中心）══════════════════
const counter: AssetFn = (ctx) => {
  const p = new Parts(ctx);
  const vinyl = ctx.mat('carRed', ROOM);
  const chrome = ctx.mat('roofMetal', { ...ROOM, elem: { kind: 'planks', seam: 1, hi: 0.6, p: [1, 0, 0, 0.45] } });
  const top = ctx.mat('counterTop', ROOM);
  const topN = ctx.mat('counterTop', { ...ROOM, emissive: 0x302010 });
  const pie = ctx.mat('flowerYellow', ROOM);
  const dome = ctx.mat('jug', ROOM);
  const cx0 = GLASS_X0 + 0.2;
  const cx1 = GLASS_X1 - 0.3;
  const zc = zOf(COUNTER_T);
  // 吧台前脸：镀铬（竖条纹的不锈钢板）+ 底下一道踢脚（暗）；台面
  p.add(chrome, box(cx1 - cx0, 1.0, 0.5, (cx0 + cx1) / 2, Y0, zc - 0.25));
  p.add(vinyl, box(cx1 - cx0, 0.09, 0.04, (cx0 + cx1) / 2, Y0 + 0.82, zc + 0.01)); // 前脸一道红线
  p.add(top, box(cx1 - cx0 + 0.1, 0.07, 0.62, (cx0 + cx1) / 2, Y0 + 1.0, zc - 0.25));
  // 台上：一个蛋糕罩（黄的派）+ 一个咖啡壶
  p.add(pie, box(0.36, 0.09, 0.36, cx0 + 1.4, Y0 + 1.07, zc - 0.3));
  p.add(dome, box(0.45, 0.27, 0.45, cx0 + 1.4, Y0 + 1.16, zc - 0.3));
  p.add(chrome, box(0.2, 0.27, 0.2, cx0 + 4.2, Y0 + 1.07, zc - 0.2));
  // 吧台凳：一根镀铬腿 + 红圆面（八边形）
  for (let x = cx0 + 0.45; x < cx1 - 0.2; x += 0.75) {
    const zs = zOf(STOOL_T);
    p.add(chrome, box(0.11, 0.66, 0.11, x, Y0, zs));
    p.add(vinyl, new THREE.CylinderGeometry(0.2, 0.2, 0.11, 8).translate(x, Y0 + 0.715, zs));
  }
  const g = p.build('diner-counter');
  nightSwitch(g, new Map([[top, topN]]));
  return g;
};

// ══ diner-pendants：卡座上方一排小球灯（夜里亮）══════════════════════════
const pendants: AssetFn = (ctx) => {
  const p = new Parts(ctx);
  const bulb = ctx.mat('signPaint', { noShadowReceive: true, lightUp: 0.5, bands: [-0.4, 0.2] });
  const bulbN = ctx.mat('signPaint', { noShadowReceive: true, lightUp: 0.5, bands: [-0.4, 0.2], emissive: 0xffd08a });
  const rod = ctx.mat('ironwork', { noShadowReceive: true });
  const bz = zOf((BOOTH_T0 + BOOTH_T1) / 2);
  for (let i = 0; i < 4; i++) {
    const cx = GLASS_X0 + (i + 0.5) * PITCH;
    const y = 2.5;
    p.add(bulb, blobNormals(new THREE.IcosahedronGeometry(0.16, 1).translate(cx, y, bz)), false);
    p.add(rod, box(0.09, roofTop(bz) - ROOF_TH - y - 0.16, 0.09, cx, y + 0.14, bz), false);
  }
  const g = p.build('diner-pendants');
  nightSwitch(g, new Map([[bulb, bulbN]]));
  return g;
};

// ══ 人（画面上的人，不是镇上真人）：Q 版，头大（同 clubsite/people 的比例：头直径 ≈ 0.6 米）════
type Look = { skin: PalKey; hair: PalKey; shirt: PalKey; legs: PalKey };
const SKINS: PalKey[] = ['skinLight', 'skinTan', 'skinDark'];
const HAIRS: PalKey[] = ['hair', 'hair', 'straw', 'clothWhite'];
const SHIRTS: PalKey[] = ['clothBlue', 'flowerYellow', 'clothWhite', 'clothPurple', 'signBoard', 'canvas', 'clothRed'];
const LEGS: PalKey[] = ['hwNavy', 'ironwork', 'woodWeathered'];
function look(rnd: () => number): Look {
  const pick = <K>(a: K[]) => a[Math.floor(rnd() * a.length) % a.length];
  return { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), legs: pick(LEGS) };
}
/**
 * 一个人（本地：脸朝 +z，臀 / 脚底在原点）。sit = 坐着（座面在 y 0，腿往前伸），否则站着。
 * 返回 [材质名, 几何]；armsFwd = 手臂往前搁（桌上 / 吧台上）。
 */
function person(L: Look, sit: boolean, armsFwd: number): [PalKey, THREE.BufferGeometry][] {
  const out: [PalKey, THREE.BufferGeometry][] = [];
  const hip = sit ? 0 : 0.5;
  const blob = (g: THREE.BufferGeometry) => blobNormals(g);
  if (sit) {
    out.push([L.legs, blob(box(0.42, 0.22, 0.5, 0, -0.04, 0.16))]); // 大腿
    out.push([L.legs, blob(box(0.36, 0.42, 0.2, 0, -0.44, 0.38))]); // 小腿（垂下）
  } else {
    for (const sx of [-1, 1]) out.push([L.legs, blob(box(0.2, 0.52, 0.22, sx * 0.11, 0, 0))]);
  }
  // 躯干（圆的块）
  out.push([L.shirt, blob(new THREE.SphereGeometry(0.27, 7, 5).scale(1, 1.05, 0.72).translate(0, hip + 0.32, 0))]);
  // 手臂：往前搁（armsFwd 米）或垂在身侧
  for (const sx of [-1, 1]) {
    if (armsFwd > 0) out.push([L.shirt, blob(box(0.16, 0.16, armsFwd, sx * 0.2, hip + 0.3, 0.08 + armsFwd / 2))]);
    else out.push([L.shirt, blob(box(0.15, 0.42, 0.16, sx * 0.3, hip + 0.12, 0))]);
  }
  // 头 + 头发（盖住顶和后脑）
  const hy = hip + 0.87;
  out.push([L.skin, blobNormals(new THREE.SphereGeometry(0.3, 8, 6).translate(0, hy, 0))]);
  out.push([
    L.hair,
    blobNormals(
      new THREE.SphereGeometry(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55)
        .rotateX(-0.45)
        .translate(0, hy + 0.02, -0.03),
      new THREE.Vector3(0, hy, 0),
    ),
  ]);
  return out;
}
/** 把一个人（本地）转到 rot、挪到 (x, y, z) */
const placePerson = (parts: [PalKey, THREE.BufferGeometry][], x: number, y: number, z: number, rot: number) =>
  parts.map(([k, g]) => [k, g.rotateY(rot).translate(x, y, z)] as [PalKey, THREE.BufferGeometry]);

// ══ diner-patrons：店里的人（6 个卡座客、3 个吧台客、过道的服务员、吧台后的厨子；原点 = 楼的中心）═══
const patrons: AssetFn = (ctx) => {
  const p = new Parts(ctx);
  const rnd = ctx.rng('diner-patrons');
  const mats = new Map<PalKey, THREE.Material>();
  const m = (k: PalKey) => {
    let x = mats.get(k);
    if (!x) {
      x = ctx.mat(k, FOLK);
      mats.set(k, x);
    }
    return x;
  };
  const add = (list: [PalKey, THREE.BufferGeometry][]) => {
    for (const [k, g] of list) p.add(m(k), g);
  };
  const bz = zOf((BOOTH_T0 + BOOTH_T1) / 2);
  // 卡座：西边的人面朝东、东边的人面朝西（1 号卡座空着一边，3 号空着一个 —— 不是排排坐）
  const seats: [number, number][] = [
    [0, -1],
    [0, 1],
    [1, -1],
    [2, 1],
    [3, -1],
    [3, 1],
  ];
  for (const [i, side] of seats) {
    const cx = GLASS_X0 + (i + 0.5) * PITCH;
    const x = cx + side * (PITCH / 2 - 0.36);
    add(
      placePerson(
        person(look(rnd), true, 0.32),
        x,
        Y0 + 0.45,
        bz + (rnd() - 0.5) * 0.2,
        side < 0 ? Math.PI / 2 : -Math.PI / 2,
      ),
    );
  }
  // 吧台客：背朝玻璃（脸朝北）
  const cx0 = GLASS_X0 + 0.2;
  for (const k of [1, 4, 6]) {
    const x = cx0 + 0.45 + k * 0.75;
    add(placePerson(person(look(rnd), true, 0.34), x, Y0 + 0.77, zOf(STOOL_T) + 0.02, Math.PI));
  }
  // 过道的服务员（白围裙 = 衬衫白、裙子蓝），端着托盘，脸朝西
  const w = person({ skin: 'skinTan', hair: 'hair', shirt: 'clothWhite', legs: 'clothBlue' }, false, 0.3);
  add(placePerson(w, GLASS_X0 + 3.9, Y0, zOf((BOOTH_T1 + STOOL_T) / 2 - 0.05), -Math.PI / 2));
  p.add(
    ctx.mat('roofMetal', FOLK),
    box(0.5, 0.05, 0.5, GLASS_X0 + 3.45, Y0 + 0.95, zOf((BOOTH_T1 + STOOL_T) / 2 - 0.05)),
  );
  // 吧台后面的厨子（白衣白帽，脸朝南）
  add(
    placePerson(
      person({ skin: 'skinLight', hair: 'clothWhite', shirt: 'clothWhite', legs: 'ironwork' }, false, 0.25),
      cx0 + 2.6,
      Y0,
      zOf(COUNTER_T + 0.95),
      0,
    ),
  );
  const g = p.build('diner-patrons');
  g.traverse((o) => {
    o.userData.noCast = true;
    o.castShadow = false;
  });
  return g;
};

// ══ diner-reader：门口看软木板的路人（站着，背朝镜头）══════════════════════
const reader: AssetFn = (ctx) => {
  const p = new Parts(ctx);
  const rnd = ctx.rng('diner-reader');
  const L = look(rnd);
  for (const [k, g] of placePerson(person({ ...L, shirt: 'flowerYellow' }, false, 0), 0, 0, 0, Math.PI))
    p.add(ctx.mat(k, FOLK), g);
  return p.build('diner-reader');
};

// ══ diner-corkboard：招聘 / 寻人软木板（贴在门东石墩上，原点 = 板底中心，板面朝 +z）══════
const corkboard: AssetFn = (ctx) => {
  const p = new Parts(ctx);
  const rnd = ctx.rng('diner-corkboard');
  const wood = ctx.mat('wood', SIGN_FACE);
  const cork = ctx.mat('kraft', {
    ...SIGN_FACE,
    elem: { kind: 'paint', size: [3, 2], density: [0.05, 0.2], patch: 1 },
  });
  const head = ctx.mat('dinerCoral', SIGN_FACE);
  const paper = ctx.mat('clothWhite', SIGN_FACE);
  const yellow = ctx.mat('flowerYellow', SIGN_FACE);
  const BW = 0.9;
  const BH = 1.02;
  p.add(wood, box(BW, BH, 0.06, 0, 0, 0), false);
  p.add(
    cork,
    new THREE.PlaneGeometry(BW - 0.18, BH - 0.18 - ROW).translate(0, 0.09 + (BH - 0.18 - ROW) / 2, 0.031),
    false,
  );
  // 抬头一条（HELP WANTED）：珊瑚红 + 中间一段白字块
  p.add(head, new THREE.PlaneGeometry(BW - 0.18, ROW).translate(0, BH - 0.09 - ROW / 2, 0.032), false);
  p.add(paper, new THREE.PlaneGeometry(0.36, ROW / 2).translate(0, BH - 0.09 - ROW / 2, 0.033), false);
  // 纸条：大小不一（2～3 纹素宽、2～3 行高），一张寻人启事（白纸 + 一块暗的"照片"）
  const notes: [number, number, number, number, THREE.Material][] = [
    [-0.24, 0.62, 0.18, 2, paper],
    [0.0, 0.66, 0.27, 2, yellow],
    [0.24, 0.6, 0.18, 3, paper],
    [-0.22, 0.26, 0.27, 3, paper],
    [0.06, 0.22, 0.18, 2, paper],
    [0.25, 0.24, 0.18, 2, yellow],
  ];
  for (const [x, y, w, rows, m] of notes) {
    const h = rows * ROW;
    p.add(m, new THREE.PlaneGeometry(w, h).translate(x, y + h / 2, 0.034 + rnd() * 0.002), false);
  }
  // 寻人启事上的"照片"
  p.add(wood, new THREE.PlaneGeometry(0.09, ROW).translate(-0.22, 0.26 + ROW * 1.5 + ROW / 2, 0.037), false);
  return p.build('diner-corkboard');
};

// ══ diner-pylon：高杆招牌（原点 = 底座中心；杆往东斜 10°；DINER 主牌 + CAFE 副牌 + 星芒）══════
const pylon: AssetFn = (ctx) => {
  const p = new Parts(ctx);
  const coral = ctx.mat('dinerCoral', SIGN_FACE);
  const coralPost = ctx.mat('dinerCoral', { lightUp: 0.3, bands: [-0.2, 0.4], noShadowReceive: true });
  const cream = ctx.mat('clothWhite', SIGN_FACE);
  const creamN = ctx.mat('clothWhite', { ...SIGN_FACE, emissive: 0xfff0c8 });
  const yellow = ctx.mat('flowerYellow', SIGN_FACE);
  const yellowN = ctx.mat('flowerYellow', { ...SIGN_FACE, emissive: 0xffc860 });
  const navy = ctx.mat('hwNavy', SIGN_FACE);
  const stone = ctx.mat('flagstone', { elem: { kind: 'stones', size: [6, 4], seam: 1, hi: 0.5 } });
  const agave = ctx.mat('cactus', { noShadowReceive: true, lightUp: 0.4 });
  const lean = -0.17;
  const L = (g: THREE.BufferGeometry) => g.rotateZ(lean);
  // 花坛底座 + 两丛龙舌兰
  p.add(stone, box(1.5, 0.55, 1.1, 0, 0, 0));
  for (const [x, z] of [
    [-0.4, 0.25],
    [0.45, 0.2],
  ])
    p.add(agave, new THREE.ConeGeometry(0.28, 0.5, 5).translate(x, 0.8, z), false);
  // 杆（0.32 见方 ≈ 3.5 纹素）
  p.add(coralPost, L(box(0.32, 8.4, 0.32, 0, 0.4, 0)));
  // 主牌：斜的平行四边形（两头斜切），珊瑚红底 + 奶白边 + DINER
  const shape = new THREE.Shape();
  const bw = 3.4;
  const bh = 1.3;
  const sk = 0.3;
  shape.moveTo(-bw / 2, 0);
  shape.lineTo(bw / 2 - sk, 0);
  shape.lineTo(bw / 2, bh);
  shape.lineTo(-bw / 2 + sk, bh);
  shape.closePath();
  const by = 5.7;
  const bx = 0.9;
  p.add(coral, L(new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: false }).translate(bx, by, -0.08)));
  const rim = new THREE.Shape();
  rim.moveTo(-bw / 2 - 0.09, -0.09);
  rim.lineTo(bw / 2 - sk + 0.09, -0.09);
  rim.lineTo(bw / 2 + 0.11, bh + 0.09);
  rim.lineTo(-bw / 2 + sk - 0.11, bh + 0.09);
  rim.closePath();
  rim.holes.push(new THREE.Path(shape.getPoints()));
  p.add(cream, L(new THREE.ShapeGeometry(rim).translate(bx, by, 0.165)), false);
  const fr = ROW * (0.08 / T);
  for (const g of textGeo('DINER', bx + sk / 2, by + (bh - 7 * fr) / 2, 0.17, 0.08, fr)) p.add(cream, L(g), false);
  // 副牌：黄底 + 海军蓝 CAFE（小一号的字：0.07 米一格）
  const sy = 4.25;
  p.add(yellow, L(box(2.0, 0.75, 0.18, 0.15, sy, 0)));
  for (const g of textGeo('CAFE', 0.15, sy + 0.12, 0.095, 0.08, 0.072)) p.add(navy, L(g), false);
  // 星芒：中间一颗球 + 8 根刺（长短相间，≥ 1 纹素粗）
  const top = new THREE.Vector3(0, 8.95, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), lean);
  p.add(cream, blobNormals(new THREE.IcosahedronGeometry(0.3, 1).translate(top.x, top.y, top.z)));
  for (let i = 0; i < 8; i++) {
    const len = i % 2 ? 0.95 : 1.5;
    p.add(
      yellow,
      new THREE.BoxGeometry(len, 0.11, 0.11)
        .translate(len / 2 + 0.2, 0, 0)
        .rotateZ((i / 8) * Math.PI * 2 + 0.2)
        .translate(top.x, top.y, top.z),
      false,
    );
  }
  const g = p.build('diner-pylon');
  nightSwitch(
    g,
    new Map([
      [cream, creamN],
      [yellow, yellowN],
    ]),
    { x: 0.8, z: 0.6, r: 4, h: 6 },
  );
  return g;
};

export const ASSETS: Record<string, AssetFn> = {
  'diner-shell': shell,
  'diner-floor': floor,
  'diner-booths': booths,
  'diner-counter': counter,
  'diner-pendants': pendants,
  'diner-patrons': patrons,
  'diner-reader': reader,
  'diner-corkboard': corkboard,
  'diner-pylon': pylon,
};
