// 小镇压紧（relocate.ts）：模块的细节代码照旧坐标写，这里给它包一层平移的 DetailCtx，放进来的东西整块挪到世界里的新位置。
// 套在 townWrap 外面（build.ts 给的 d 已经是 townWrap 过的）：旧坐标 → 平移 → 按新的缩放框缩 → build。
// 跑模块代码的时候 relocate.ts 的 CUR 是这个模块的平移：模块里自己查世界的地方（车道守卫、离路多远）用 atWorld / curShift。
//
// 一个模块拆成几块各自平移（高中：relocate.ts 的 schoolPart）：给 route（旧坐标 → 归哪块），按位置分 ——
// 几何按每个三角形的重心分（一块合并的网格跨两块也拆得开），实例按每一件的落地点，资产按它的原点（原点在世界原点的
// 烘好的一组按每个网格的三角形），挡路的形状、占地按中心。
import * as THREE from 'three';
import type { Shape } from '../../clubsite/play';
import type { Detail, DetailCtx } from '../build';
import { growBounds, MOVE, type ModuleId, withModule } from '../relocate';

function shapeCenter(s: Shape): [number, number] {
  if ('poly' in s) {
    let x = 0;
    let z = 0;
    for (const [a, b] of s.poly) {
      x += a / s.poly.length;
      z += b / s.poly.length;
    }
    return [x, z];
  }
  if ('a' in s) return [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
  if ('r' in s) return [s.x, s.z];
  return [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
}
function shiftShape(s: Shape, dx: number, dz: number): Shape {
  if ('poly' in s) return { ...s, poly: s.poly.map(([x, z]) => [x + dx, z + dz] as const) };
  if ('a' in s) return { ...s, a: [s.a[0] + dx, s.a[1] + dz], b: [s.b[0] + dx, s.b[1] + dz] };
  if ('r' in s) return { ...s, x: s.x + dx, z: s.z + dz };
  return { ...s, x0: s.x0 + dx, x1: s.x1 + dx, z0: s.z0 + dz, z1: s.z1 + dz };
}

/** 一块几何（已带世界矩阵的话先乘好）按三角形的重心分块平移：全在一块里就整块平移，跨块就拆成不带索引的再一个个挪 */
function routeGeo(g: THREE.BufferGeometry, route: (x: number, z: number) => ModuleId): THREE.BufferGeometry {
  g.computeBoundingBox();
  const bb = g.boundingBox as THREE.Box3;
  const ids = new Set([
    route(bb.min.x, bb.min.z),
    route(bb.max.x, bb.min.z),
    route(bb.min.x, bb.max.z),
    route(bb.max.x, bb.max.z),
    route((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2),
  ]);
  if (ids.size === 1) {
    const [dx, dz] = MOVE[[...ids][0]];
    return g.translate(dx, 0, dz);
  }
  const ng = g.index ? g.toNonIndexed() : g;
  const pos = ng.attributes.position as THREE.BufferAttribute;
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const [dx, dz] = MOVE[route(cx, cz)];
    for (let k = 0; k < 3; k++) pos.setXYZ(t + k, pos.getX(t + k) + dx, pos.getY(t + k), pos.getZ(t + k) + dz);
  }
  pos.needsUpdate = true;
  ng.computeBoundingBox();
  ng.computeBoundingSphere();
  return ng;
}

/**
 * 平移的 DetailCtx：模块代码（旧坐标）放进来的几何、实例、资产、挡路、占地都加 MOVE。
 * route 给了 = 一个模块拆成几块（旧坐标 → 归哪块）；不给 = 整个模块按 id 的 MOVE
 */
export function shiftCtx(d: DetailCtx, id: ModuleId, route?: (x: number, z: number) => ModuleId): DetailCtx {
  const R = route ?? (() => id);
  const mvAt = (x: number, z: number) => MOVE[R(x, z)];
  const BB = new THREE.Box3();
  /** 记外框（贴地的大铺面、立着的都算） */
  const grow = (b: THREE.Box3) => {
    if (!b.isEmpty()) growBounds(id, b.min.x, b.max.x, b.min.z, b.max.z);
  };
  const tg = (g: THREE.BufferGeometry) => {
    const out = routeGeo(g, R);
    out.computeBoundingBox();
    if (out.boundingBox) grow(out.boundingBox);
    return out;
  };
  return {
    ...d,
    put: (region, key, g) => d.put(region, key, tg(g)),
    regionOf: (x, z) => {
      const [dx, dz] = mvAt(x, z);
      return d.regionOf(x + dx, z + dz);
    },
    block: (s) => {
      const [dx, dz] = mvAt(...shapeCenter(s));
      d.block(shiftShape(s, dx, dz));
    },
    clear: (r) => {
      const [dx, dz] = mvAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      d.clear({ x0: r.x0 + dx, x1: r.x1 + dx, z0: r.z0 + dz, z1: r.z1 + dz });
    },
    instance: (g, key, items, cast) => {
      const out = items.map((it) => {
        // 原点那一件（合并好的世界坐标网格挂在原点）：几何自己按三角形分，件不动
        if (!it.x && !it.z) return it;
        const [dx, dz] = mvAt(it.x, it.z);
        return { ...it, x: it.x + dx, z: it.z + dz };
      });
      if (items.some((it) => !it.x && !it.z)) g = routeGeo(g, R);
      for (const it of out) if (it.x || it.z) growBounds(id, it.x, it.x, it.z, it.z);
      d.instance(g, key, out, cast);
    },
    putFlat: d.putFlat ? (key, g) => d.putFlat?.(key, tg(g)) : undefined,
    putThin: d.putThin ? (region, key, g) => d.putThin?.(region, key, tg(g)) : undefined,
    asset: (obj, region) => {
      if (route && !obj.position.x && !obj.position.z) {
        // 烘好的一组（网格是世界坐标、组在原点）：每个网格按三角形分
        obj.updateMatrixWorld(true);
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
          m.geometry = routeGeo(g, R);
          m.position.set(0, 0, 0);
          m.rotation.set(0, 0, 0);
          m.scale.set(1, 1, 1);
          m.updateMatrix();
        });
        // 子网格的世界矩阵已经烘进几何了：中间一层层的组也归零
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) return;
          o.position.set(0, 0, 0);
          o.rotation.set(0, 0, 0);
          o.scale.set(1, 1, 1);
        });
      } else {
        const [dx, dz] = mvAt(obj.position.x, obj.position.z);
        obj.position.x += dx;
        obj.position.z += dz;
      }
      obj.updateMatrixWorld(true);
      grow(BB.setFromObject(obj));
      d.asset(obj, region);
    },
  };
}

/** 一个模块的细节：跑的时候 CUR = 它的平移，d 包一层 shiftCtx（route 见 shiftCtx） */
export const moduleDetail =
  (id: ModuleId, fn: Detail, route?: (x: number, z: number) => ModuleId): Detail =>
  (d) =>
    withModule(id, () => fn(shiftCtx(d, id, route)));
