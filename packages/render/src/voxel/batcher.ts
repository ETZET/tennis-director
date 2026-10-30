import { clamp, type Rand } from '@td/shared';
import * as THREE from 'three';

/**
 * 体素批处理器：逐个加盒子，最后按顶点色合并成一个网格。
 * 一个场景通常只有两个批次：flat（地面薄层，只接收阴影）和 solid（投影的实体）。
 */

const BASE = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const BP = BASE.attributes.position.array as Float32Array;
const BN = BASE.attributes.normal.array as Float32Array;
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

export type ColorLike = THREE.Color | string;

export class VoxelBatcher {
  private readonly p: number[] = [];
  private readonly n: number[] = [];
  private readonly c: number[] = [];
  /**
   * 裁剪：返回 false 的位置（盒子底面中心）不放盒子。
   * 盒子的参数（包括随机颜色）在调用前已经算好，所以裁掉的盒子照样消耗了随机数，
   * 不会让后面的细节变样。
   */
  clip: ((x: number, z: number) => boolean) | null = null;

  /** 加一个盒子。(x,y,z) 是底面中心；旋转顺序 YXZ。 */
  box(x: number, y: number, z: number, w: number, h: number, d: number, col: ColorLike, ry = 0, rx = 0, rz = 0): void {
    if (this.clip && !this.clip(x, z)) return;
    const c = col instanceof THREE.Color ? col : new THREE.Color(col);
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    for (let i = 0; i < 36; i++) {
      _v.set(BP[i * 3] * w, BP[i * 3 + 1] * h + h / 2, BP[i * 3 + 2] * d).applyQuaternion(_q);
      _n.set(BN[i * 3], BN[i * 3 + 1], BN[i * 3 + 2]).applyQuaternion(_q);
      this.p.push(x + _v.x, y + _v.y, z + _v.z);
      this.n.push(_n.x, _n.y, _n.z);
      this.c.push(c.r, c.g, c.b);
    }
  }

  get boxCount(): number {
    return this.p.length / 108;
  }

  /** 合并成一个网格并加入场景。 */
  build(
    scene: THREE.Object3D,
    cast: boolean,
    recv: boolean,
    /** 额外的材质参数，例如岛底剖面用一点自发光，背光面也看得清 */
    mat: THREE.MeshLambertMaterialParameters = {},
  ): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, ...mat }));
    m.castShadow = cast;
    m.receiveShadow = recv;
    scene.add(m);
    return m;
  }
}

/** 给颜色加一点亮度抖动，只消耗一个随机数。 */
export function jitter(hex: string, amt: number, rand: Rand): THREE.Color {
  const c = new THREE.Color(hex);
  const h = { h: 0, s: 0, l: 0 };
  c.getHSL(h);
  c.setHSL(h.h, h.s, clamp(h.l + (rand() * 2 - 1) * amt, 0, 1));
  return c;
}
