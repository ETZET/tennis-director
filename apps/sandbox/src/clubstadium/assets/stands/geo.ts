// 看台 / 观众共用的几何小工具：不带索引的四边形和盒子，每个顶点都有 position、normal、uv（米），
// 外加一个可选的 vec2 顶点属性（观众的"骨骼"权重）。同一个网格里的几何体属性一致，才能 mergeGeometries。
// 竖直面的 uv = (沿墙的米数, 离这面墙顶多少米)：toon.ts 的 strata / wall 元素按这个换算成屏幕行（墙顶第一行是唇下暗线）。
import * as THREE from 'three';

export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

export class GeoBuf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  rig: number[] = [];
  /** 下一个四边形的 aRig（观众：胳膊的带符号权重、大腿前端的权重） */
  rigAt: (p: THREE.Vector3) => [number, number] = () => [0, 0];

  /** 四边形 a b c d（从法线那一侧看是逆时针），uv 按顶点给 */
  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    n: THREE.Vector3,
    uv: [number, number][] = [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  ) {
    const vs = [a, b, c, a, c, d];
    const us = [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]];
    for (let i = 0; i < 6; i++) {
      this.pos.push(vs[i].x, vs[i].y, vs[i].z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(us[i][0], us[i][1]);
      this.rig.push(...this.rigAt(vs[i]));
    }
  }

  /** 朝 +z 的竖直面（x0…x1、y0…y1、在 z）；uv.y 从 top 往下量（默认 y1） */
  faceZ(x0: number, x1: number, y0: number, y1: number, z: number, dir: 1 | -1 = 1, top = y1) {
    const V = (x: number, y: number) => new THREE.Vector3(x, y, z);
    const u = (x: number, y: number): [number, number] => [x * dir, top - y];
    if (dir > 0)
      this.quad(V(x0, y0), V(x1, y0), V(x1, y1), V(x0, y1), new THREE.Vector3(0, 0, 1), [
        u(x0, y0),
        u(x1, y0),
        u(x1, y1),
        u(x0, y1),
      ]);
    else
      this.quad(V(x1, y0), V(x0, y0), V(x0, y1), V(x1, y1), new THREE.Vector3(0, 0, -1), [
        u(x1, y0),
        u(x0, y0),
        u(x0, y1),
        u(x1, y1),
      ]);
  }

  /** 朝 ±x 的竖直面（z0…z1、y0…y1、在 x） */
  faceX(z0: number, z1: number, y0: number, y1: number, x: number, dir: 1 | -1 = 1, top = y1) {
    const V = (z: number, y: number) => new THREE.Vector3(x, y, z);
    const u = (z: number, y: number): [number, number] => [-z * dir, top - y];
    if (dir > 0)
      this.quad(V(z1, y0), V(z0, y0), V(z0, y1), V(z1, y1), new THREE.Vector3(1, 0, 0), [
        u(z1, y0),
        u(z0, y0),
        u(z0, y1),
        u(z1, y1),
      ]);
    else
      this.quad(V(z0, y0), V(z1, y0), V(z1, y1), V(z0, y1), new THREE.Vector3(-1, 0, 0), [
        u(z0, y0),
        u(z1, y0),
        u(z1, y1),
        u(z0, y1),
      ]);
  }

  /** 朝上（dir 1）/ 朝下的水平面 */
  faceY(x0: number, x1: number, z0: number, z1: number, y: number, dir: 1 | -1 = 1) {
    const V = (x: number, z: number) => new THREE.Vector3(x, y, z);
    if (dir > 0) this.quad(V(x0, z1), V(x1, z1), V(x1, z0), V(x0, z0), new THREE.Vector3(0, 1, 0));
    else this.quad(V(x0, z0), V(x1, z0), V(x1, z1), V(x0, z1), new THREE.Vector3(0, -1, 0));
  }

  /** 盒子；skip 里的面不画（看不见的面省三角形）；竖直面的 uv.y 从盒顶往下量 */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, skip: Face[] = []) {
    const s = new Set(skip);
    if (!s.has('pz')) this.faceZ(x0, x1, y0, y1, z1, 1);
    if (!s.has('nz')) this.faceZ(x0, x1, y0, y1, z0, -1);
    if (!s.has('px')) this.faceX(z0, z1, y0, y1, x1, 1);
    if (!s.has('nx')) this.faceX(z0, z1, y0, y1, x0, -1);
    if (!s.has('py')) this.faceY(x0, x1, z0, z1, y1, 1);
    if (!s.has('ny')) this.faceY(x0, x1, z0, z1, y0, -1);
  }

  get empty() {
    return this.pos.length === 0;
  }

  geo(withRig = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (withRig) g.setAttribute('aRig', new THREE.Float32BufferAttribute(this.rig, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** 一块网格（一种材质一个） */
export function meshOf(
  buf: GeoBuf,
  mat: THREE.Material,
  name: string,
  o: { cast?: boolean; recv?: boolean } = {},
): THREE.Mesh | null {
  if (buf.empty) return null;
  const m = new THREE.Mesh(buf.geo(), mat);
  m.name = name;
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.recv ?? true;
  return m;
}
