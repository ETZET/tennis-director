import * as THREE from 'three';

/** 材质和几何体缓存：几十个小人共享同一批对象。 */
const mats = new Map<string, THREE.MeshLambertMaterial>();
const geos = new Map<string, THREE.BoxGeometry>();

export function material(hex: string): THREE.MeshLambertMaterial {
  let m = mats.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex });
    mats.set(hex, m);
  }
  return m;
}

export function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `${w}_${h}_${d}`;
  let g = geos.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geos.set(k, g);
  }
  return g;
}

/** 给 parent 挂一个投影的小方块。(x,y,z) 是方块中心。 */
export function part(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: string,
): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo(w, h, d), material(hex));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** 物体的世界坐标。 */
export function worldPos(obj: THREE.Object3D): { x: number; y: number; z: number } {
  const v = new THREE.Vector3();
  obj.getWorldPosition(v);
  return { x: v.x, y: v.y, z: v.z };
}
