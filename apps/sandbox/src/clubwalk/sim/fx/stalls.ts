// 关着的摊（第二轮问题 5.2 / 要补的画面 4）：摊主不在岗（平日轮休的车、歇班、开门前、关门后）的摊位一眼看得出关着 ——
//   窗口拉下一块卷帘（浅灰铁皮、几道深色横缝）、遮阳篷收起来（塔可车的条纹篷、吉事果车的平顶篷、冰棍车的伞、饮料车的伞收成一卷）、
//   串灯和台面上的杯子 / 存货收掉（setStock(0)）、披萨窑不冒烟；窗口前拉一道红绳（两根矮柱），排队的地方空着。
//   摊主一到岗（引擎的 postStaffed：在岗或者三分钟内接班）就全收回去，跟原来一样。
// 只改场景的摊位（clubfood、clubplaza 区域里的 slot:<id>），不改它们的文件：卷帘、红绳是加在摊位下面的子节点，藏起来的部件记着原来的 visible。
// 区域会按镜头卸载 / 重建：每秒找一遍摊位的 Object3D，换了就重新摆。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { handoverPosts, postStaffed } from '../../../clubsite/sim/engine';
import type { PlaceId } from '../../../clubsite/sim/types';
import { PLACES } from '../deps';
import { type FxKits, type FxPart, inRect } from './util';

interface Look {
  region: string;
  slot: string;
  /** 卷帘（摊位本地坐标：窗口的 x、y 范围，窗面的 z） */
  shutter?: { x0: number; x1: number; y0: number; y1: number; z: number };
  /** 关着时藏起来的部件（按名字） */
  hide?: string[];
  /** 篷 / 伞：本地 y 以上的网格都藏起来（没有名字的小车） */
  canopyY?: number;
  /** 红绳拉在哪（本地 x, z：窗口前买的人站的地方） */
  rope: [number, number];
}

/** 摊位 → 场景里的哪个东西、怎么关（窗口、篷的尺寸见各素材文件头） */
const LOOKS: Record<PlaceId, Look> = {
  'food.coffee': {
    region: 'region:clubfood',
    slot: 'slot:truck-coffee',
    shutter: { x0: -1.3, x1: 0.7, y0: 1.38, y1: 2.35, z: 1.16 },
    hide: ['lamps', 'sill-cups'],
    rope: [-0.3, 2.1],
  },
  'food.taco': {
    region: 'region:clubfood',
    slot: 'slot:truck-taco',
    shutter: { x0: -2.0, x1: 1.0, y0: 1.38, y1: 2.35, z: 1.23 },
    hide: ['awning'],
    rope: [0.1, 2.1],
  },
  'food.pizza': {
    region: 'region:clubfood',
    slot: 'slot:truck-pizza',
    shutter: { x0: -0.4, x1: 1.9, y0: 1.38, y1: 2.35, z: 1.3 },
    rope: [0.75, 2.1],
  },
  'food.burger': {
    region: 'region:clubfood',
    slot: 'slot:trailer-burger',
    shutter: { x0: -0.95, x1: 1.45, y0: 1.36, y1: 2.45, z: 1.26 },
    rope: [0.25, 2.1],
  },
  'food.boba': {
    region: 'region:clubfood',
    slot: 'slot:tuktuk-boba',
    shutter: { x0: -0.62, x1: 0.46, y0: 1.06, y1: 1.62, z: 0.62 },
    rope: [-0.08, 1.6],
  },
  'food.churro': { region: 'region:clubfood', slot: 'slot:cart-churros', canopyY: 1.25, rope: [-0.2, 1.1] },
  'food.paleta': { region: 'region:clubfood', slot: 'slot:cart-paletas', canopyY: 1.45, rope: [0, 1.25] },
  'food.agua': { region: 'region:clubfood', slot: 'slot:agua', rope: [-0.25, 1.15] },
  'plaza.drinks': { region: 'region:clubplaza', slot: 'slot:drinks-cart', rope: [-0.25, 1.15] },
};

const STALLS = PLACES.filter((p) => LOOKS[p.id] && p.needs).map((p) => ({ id: p.id, post: p.needs as PlaceId, p }));

interface Dress {
  root: THREE.Object3D;
  /** 卷帘 + 红绳（挂在摊位下面） */
  add: THREE.Group;
  /** 藏起来的部件 */
  parts: THREE.Object3D[];
  closed: boolean | null;
}

/** 朝镜头的竖直面：留住中档（同各餐车的 FACE） */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

export function createStalls(scene: THREE.Scene): FxPart & { prewarm(k: FxKits): THREE.Object3D[] } {
  const dress = new Map<PlaceId, Dress>();
  const regions = new Map<string, THREE.Object3D | null>();
  let scanT = 0;
  let tickT = 0;
  const st = { closed: 0, open: 0, found: 0, closedIds: [] as PlaceId[] };
  let mats: { panel: THREE.Material; slat: THREE.Material; post: THREE.Material; rope: THREE.Material } | null = null;

  function matsOf(k: FxKits) {
    mats ??= {
      panel: k.people.mat('carSilver', { ...FACE, edge: 0.4, convex: 0.2 }),
      slat: k.people.mat('tyre', { ...FACE, edge: 0.2, convex: 0 }),
      post: k.people.mat('steel', { lightUp: 0.4, edge: 0.4, convex: 0.4, noShadowReceive: true }),
      rope: k.people.mat('clothRed', { lightUp: 0.4, edge: 0.3, convex: 0.3, noShadowReceive: true }),
    };
    return mats;
  }

  /** 卷帘：一块浅灰铁皮 + 每 0.2 米一道深色横缝 + 底下一根把手条 */
  function shutter(k: FxKits, s: NonNullable<Look['shutter']>): THREE.Object3D {
    const m = matsOf(k);
    const g = new THREE.Group();
    g.name = 'closed-shutter';
    const w = s.x1 - s.x0;
    const h = s.y1 - s.y0;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), m.panel);
    panel.position.set((s.x0 + s.x1) / 2, s.y0 + h / 2, s.z);
    g.add(panel);
    const slats: THREE.BufferGeometry[] = [];
    for (let y = s.y0 + 0.2; y < s.y1 - 0.08; y += 0.2)
      slats.push(new THREE.BoxGeometry(w - 0.04, 0.045, 0.02).translate((s.x0 + s.x1) / 2, y, s.z + 0.035));
    slats.push(new THREE.BoxGeometry(w * 0.3, 0.07, 0.05).translate((s.x0 + s.x1) / 2, s.y0 + 0.08, s.z + 0.045));
    const sl = new THREE.Mesh(mergeGeometries(slats), m.slat);
    g.add(sl);
    k.people.mats.prepare(g, { cast: false, receive: false });
    return g;
  }

  /** 红绳：两根矮柱（底座 + 柱 + 顶球）中间一道往下垂的红绳，横在窗口前 */
  function rope(k: FxKits, at: [number, number]): THREE.Object3D {
    const m = matsOf(k);
    const g = new THREE.Group();
    g.name = 'closed-rope';
    const posts: THREE.BufferGeometry[] = [];
    const half = 0.75;
    for (const dx of [-half, half]) {
      posts.push(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 8).translate(at[0] + dx, 0.03, at[1]));
      posts.push(new THREE.CylinderGeometry(0.05, 0.05, 0.86, 6).translate(at[0] + dx, 0.47, at[1]));
      posts.push(new THREE.SphereGeometry(0.08, 8, 6).translate(at[0] + dx, 0.92, at[1]));
    }
    g.add(new THREE.Mesh(mergeGeometries(posts), m.post));
    // 绳子：三段折线垂下去（中间最低 0.62）
    const segs: THREE.BufferGeometry[] = [];
    const pts: [number, number][] = [
      [-half, 0.84],
      [-half * 0.4, 0.68],
      [half * 0.4, 0.68],
      [half, 0.84],
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      segs.push(
        new THREE.BoxGeometry(len + 0.04, 0.07, 0.07)
          .rotateZ(Math.atan2(y1 - y0, x1 - x0))
          .translate(at[0] + (x0 + x1) / 2, (y0 + y1) / 2, at[1]),
      );
    }
    g.add(new THREE.Mesh(mergeGeometries(segs), m.rope));
    k.people.mats.prepare(g, { cast: true, receive: false });
    return g;
  }

  function dressOf(k: FxKits, id: PlaceId, root: THREE.Object3D): Dress {
    const L = LOOKS[id];
    const add = new THREE.Group();
    add.name = 'sim:fx:closed';
    if (L.shutter) add.add(shutter(k, L.shutter));
    add.add(rope(k, L.rope));
    add.visible = false;
    root.add(add);
    // 区域的静态部分冻结了世界矩阵（walk.ts freezeMatrices）：自己算一次
    add.updateMatrixWorld(true);
    const parts: THREE.Object3D[] = [];
    const names = new Set(L.hide ?? []);
    if (names.size) root.traverse((o) => names.has(o.name) && parts.push(o));
    if (L.canopyY !== undefined) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || o.parent === add || o.parent?.parent === add) return;
        mesh.geometry.computeBoundingBox();
        box
          .copy(mesh.geometry.boundingBox as THREE.Box3)
          .applyMatrix4(mesh.matrixWorld)
          .applyMatrix4(inv);
        if (box.min.y > (L.canopyY as number)) parts.push(o);
      });
    }
    for (const o of parts) o.userData.__simOpenVisible ??= o.visible;
    return { root, add, parts, closed: null };
  }

  function apply(d: Dress, closed: boolean) {
    const ud = d.root.userData;
    if (d.closed !== closed) {
      d.closed = closed;
      d.add.visible = closed;
      for (const o of d.parts) o.visible = closed ? false : (o.userData.__simOpenVisible ?? true);
      ud.setOpen?.(!closed);
      ud.setSmoke?.(closed ? 0 : 1);
      if (!closed) ud.setStock?.(1);
    }
    // 场景自己的演出会补货 / 倒饮料：关着的时候一直是空的
    if (closed) {
      ud.setStock?.(0);
      ud.setLevel?.(0.04, 0.04);
    }
  }

  return {
    frame(f, k) {
      scanT -= f.dt;
      tickT -= f.dt;
      if (scanT <= 0) {
        scanT = 1;
        for (const name of new Set(Object.values(LOOKS).map((l) => l.region)))
          regions.set(name, scene.children.find((o) => o.name === name) ?? null);
      }
      if (tickT > 0) return;
      tickT = 0.4;
      const ho = handoverPosts(f.s.agents, f.s.minute);
      st.closed = st.open = st.found = 0;
      st.closedIds = [];
      for (const S of STALLS) {
        const L = LOOKS[S.id];
        const reg = regions.get(L.region);
        let d = dress.get(S.id);
        if (d && (!reg || !d.root.parent || !isInside(d.root, reg))) {
          // 区域卸载 / 重建了：旧的作废
          d.add.removeFromParent();
          dress.delete(S.id);
          d = undefined;
        }
        if (!reg) continue;
        if (!d) {
          if (!inRect(f.view, S.p.x, S.p.z, 30)) continue;
          const root = reg.getObjectByName(L.slot);
          if (!root) continue;
          d = dressOf(k, S.id, root);
          dress.set(S.id, d);
        }
        st.found++;
        const closed = !postStaffed(f.s, S.post, ho);
        apply(d, closed);
        if (closed) {
          st.closed++;
          st.closedIds.push(S.id);
        } else st.open++;
      }
    },
    off() {
      for (const d of dress.values()) {
        apply(d, false);
        d.add.removeFromParent();
      }
      dress.clear();
    },
    stats() {
      return { ...st, closedIds: [...st.closedIds] };
    },
    /** 预热：一套卷帘 + 红绳（同样的材质、几何），给 fx 的 prewarm 摆到画面里渲染一次 */
    prewarm(k) {
      const L = LOOKS['food.taco'];
      return [shutter(k, L.shutter as NonNullable<Look['shutter']>), rope(k, L.rope)];
    },
  };
}

function isInside(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}
