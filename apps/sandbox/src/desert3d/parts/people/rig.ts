// 人物：一套骨骼 + 一个蒙皮网格（顶点色、每个顶点只绑一根骨头）→ 每人一次绘制。
// 造型故意"胖"：大头、大手、粗胳膊腿，0.2 米/纹素下也能读出剪影。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../../world';
import type { Pose } from './pose';

export interface Look {
  skin: number;
  hair: number;
  hairStyle: 'short' | 'pony' | 'bun' | 'buzz';
  shirt: number;
  trim?: number;
  bottom: 'shorts' | 'skirt' | 'pants';
  bottomColor: number;
  hat: 'none' | 'cap' | 'visor' | 'sunhat';
  hatColor: number;
  headband?: number;
  shoes: number;
  socks: number;
  racket?: number;
  /** 胖瘦高矮 */
  build?: number;
  height?: number;
}

// 尺寸（米）
export const DIM = {
  foot: 0.075,
  shin: 0.37,
  thigh: 0.37,
  torso: 0.44,
  neck: 0.5,
  upper: 0.27,
  fore: 0.26,
};

const B = {
  hips: 0,
  torso: 1,
  head: 2,
  shL: 3,
  elL: 4,
  shR: 5,
  elR: 6,
  racket: 7,
  thL: 8,
  knL: 9,
  ftL: 10,
  thR: 11,
  knR: 12,
  ftR: 13,
} as const;

export class Rig {
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  scale: number;
  constructor(mesh: THREE.SkinnedMesh, bones: THREE.Bone[], scale: number) {
    this.mesh = mesh;
    this.bones = bones;
    this.scale = scale;
  }
  get torso() {
    return this.bones[B.torso];
  }
  get head() {
    return this.bones[B.head];
  }
  get handR() {
    return this.bones[B.racket];
  }
  get handL() {
    return this.bones[B.elL];
  }

  apply(p: Pose) {
    const b = this.bones;
    b[B.torso].rotation.set(p.lean, p.twist, p.roll, 'YXZ');
    b[B.head].rotation.set(p.hP - p.lean * 0.5, p.hY, 0, 'YXZ');
    b[B.shL].rotation.set(-p.laE, p.laA, 0, 'YXZ');
    b[B.elL].rotation.set(-p.laB, p.laT, 0, 'YXZ');
    b[B.shR].rotation.set(-p.raE, p.raA, 0, 'YXZ');
    b[B.elR].rotation.set(-p.raB, p.raT, 0, 'YXZ');
    b[B.racket].rotation.set(p.rk, 0, 0);
    b[B.thL].rotation.set(-p.llF, 0, p.llS, 'ZXY');
    b[B.knL].rotation.set(p.llK, 0, 0);
    b[B.ftL].rotation.set(p.llF - p.llK, 0, -p.llS * 0.8, 'XYZ');
    b[B.thR].rotation.set(-p.rlF, 0, -p.rlS, 'ZXY');
    b[B.knR].rotation.set(p.rlK, 0, 0);
    b[B.ftR].rotation.set(p.rlF - p.rlK, 0, p.rlS * 0.8, 'XYZ');
    // 落地：较长的那条腿踩地
    const ext = (f: number, k: number, s: number) =>
      (DIM.thigh * Math.cos(f) + DIM.shin * Math.cos(f - k)) * Math.cos(s);
    const h = Math.max(ext(p.llF, p.llK, p.llS), ext(p.rlF, p.rlK, p.rlS)) + DIM.foot;
    b[B.hips].position.y = h + p.lift;
  }
}

export type Cls = 'skin' | 'cloth' | 'hair' | 'hard';
const CLASSES: Cls[] = ['skin', 'cloth', 'hair', 'hard'];
type Piece = { g: THREE.BufferGeometry; c: number; bone: number; cls: Cls };

/**
 * 每类材质一条手挑的色阶"形状"（乘在顶点色上，顶点色是这个人的衣服/皮肤颜色）：
 * 亮档原色，中档略降、偏粉紫，暗档换成冷的靛紫（不是等比变暗）。
 */
const RAMPS: Record<Cls, [number, number, number]> = {
  skin: [0xffffff, 0xe8c6c4, 0xa07a98],
  cloth: [0xffffff, 0xd0cce0, 0x8480b0],
  hair: [0xffffff, 0xc0b4cc, 0x76709c],
  hard: [0xffffff, 0xd8ccd4, 0x8c80a8],
};
const EDGE: Record<Cls, [number, number]> = {
  skin: [0.7, 0.35],
  cloth: [0.7, 0.4],
  hair: [0.7, 0.45],
  hard: [0.75, 0.6],
};

export function personMats(w: World): THREE.Material[] {
  return CLASSES.map((c) =>
    w.mats.toon(0xffffff, {
      vertexColors: true,
      ramp: RAMPS[c],
      edge: EDGE[c][0],
      convex: EDGE[c][1],
      lightUp: 0.35,
      bands: [0.05, 0.45],
    }),
  );
}

const col = new THREE.Color();

function finish(pieces: Piece[], rest: THREE.Vector3[]): THREE.BufferGeometry {
  // 按材质类分组合并：一个蒙皮网格、四组（每组一次绘制）
  const byCls = CLASSES.map((k) => pieces.filter((p) => p.cls === k));
  return mergeGeometries(
    byCls.map((ps) => finishOne(ps.length ? ps : [{ ...pieces[0], g: new THREE.BoxGeometry(0, 0, 0) }], rest)),
    true,
  )!;
}

function finishOne(pieces: Piece[], rest: THREE.Vector3[]): THREE.BufferGeometry {
  const gs = pieces.map(({ g, c, bone }) => {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    geo.translate(rest[bone].x, rest[bone].y, rest[bone].z);
    const n = geo.attributes.position.count;
    col.setHex(c);
    const cols = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      cols.set([col.r, col.g, col.b], i * 3);
      si[i * 4] = bone;
      sw[i * 4] = 1;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    return geo;
  });
  return mergeGeometries(gs)!;
}

const tr = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const cyl = (rt: number, rb: number, h: number, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);
const ico = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

function shade(c: number, k: number): number {
  return col.setHex(c).multiplyScalar(k).getHex();
}

export function buildRig(w: World, look: Look, opts: { racket?: boolean } = {}): Rig {
  const fat = look.build ?? 1;
  const tall = look.height ?? 1;
  // 骨骼（静止姿势：手臂下垂、腿伸直）
  const bones: THREE.Bone[] = [];
  const rest: THREE.Vector3[] = [];
  const mk = (i: number, parent: number | null, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    bones[i] = b;
    if (parent !== null) bones[parent].add(b);
    rest[i] = new THREE.Vector3(x, y, z).add(parent !== null ? rest[parent] : new THREE.Vector3());
  };
  const hipH = DIM.foot + DIM.shin + DIM.thigh;
  const shX = 0.23 * fat;
  mk(B.hips, null, 0, hipH, 0);
  mk(B.torso, B.hips, 0, 0.02, 0);
  mk(B.head, B.torso, 0, DIM.neck, 0);
  mk(B.shL, B.torso, shX, DIM.torso - 0.04, 0);
  mk(B.elL, B.shL, 0, -DIM.upper, 0);
  mk(B.shR, B.torso, -shX, DIM.torso - 0.04, 0);
  mk(B.elR, B.shR, 0, -DIM.upper, 0);
  mk(B.racket, B.elR, 0, -DIM.fore - 0.03, 0);
  mk(B.thL, B.hips, 0.1 * fat, -0.03, 0);
  mk(B.knL, B.thL, 0, -DIM.thigh, 0);
  mk(B.ftL, B.knL, 0, -DIM.shin, 0);
  mk(B.thR, B.hips, -0.1 * fat, -0.03, 0);
  mk(B.knR, B.thR, 0, -DIM.thigh, 0);
  mk(B.ftR, B.knR, 0, -DIM.shin, 0);

  const ps: Piece[] = [];
  const skin = look.skin;
  const add = (g: THREE.BufferGeometry, c: number, bone: number, cls?: Cls) =>
    ps.push({
      g,
      c,
      bone,
      cls: cls ?? (c === skin || c === shade(skin, 0.92) ? 'skin' : c === look.hair ? 'hair' : 'cloth'),
    });
  const trim = look.trim ?? shade(look.shirt, 0.8);

  // 骨盆（短裤 / 裙子 / 长裤）
  if (look.bottom === 'skirt')
    add(tr(cyl(0.18 * fat, 0.29 * fat, 0.3, 8).scale(1, 1, 0.85), 0, -0.1, 0), look.bottomColor, B.hips);
  else add(tr(cyl(0.18 * fat, 0.2 * fat, 0.22, 8).scale(1, 1, 0.75), 0, -0.06, 0), look.bottomColor, B.hips);

  // 躯干
  add(tr(cyl(0.21 * fat, 0.18 * fat, 0.44, 8).scale(1, 1, 0.66), 0, 0.22, 0), look.shirt, B.torso);
  add(tr(ico(0.2 * fat, 1).scale(1.12, 0.45, 0.66), 0, 0.4, 0), look.shirt, B.torso); // 圆肩
  add(tr(cyl(0.095, 0.12, 0.05, 7), 0, 0.455, 0.01), trim, B.torso); // 领口
  if (look.trim !== undefined)
    add(tr(cyl(0.188 * fat, 0.188 * fat, 0.05, 8).scale(1, 1, 0.68), 0, 0.03, 0), trim, B.torso);
  add(tr(cyl(0.065, 0.07, 0.12, 6), 0, 0.5, 0), skin, B.torso); // 脖子

  // 头：大一号
  const hr = 0.19;
  const hy = 0.17;
  add(tr(ico(hr, 1).scale(1, 1.05, 1), 0, hy, 0), skin, B.head);
  add(tr(box(0.06, 0.07, 0.07), 0, hy - 0.01, hr - 0.01), shade(skin, 0.92), B.head); // 鼻子（看得出朝向）
  add(tr(ico(0.05, 0), hr - 0.01, hy, -0.01), skin, B.head); // 耳朵
  add(tr(ico(0.05, 0), -hr + 0.01, hy, -0.01), skin, B.head);
  const hairCap = (r: number, theta: number) => new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, theta);
  if (look.hairStyle !== 'buzz' || look.hat === 'none') {
    const cap = hairCap(hr + 0.022, look.hairStyle === 'buzz' ? Math.PI * 0.42 : Math.PI * 0.55);
    cap.rotateX(-0.35); // 前额露出来，后脑勺盖住
    add(tr(cap, 0, hy + 0.01, -0.015), look.hair, B.head);
  }
  if (look.hairStyle === 'pony') {
    add(tr(ico(0.075, 0), 0, hy + 0.1, -hr - 0.02), look.hair, B.head);
    add(tr(cyl(0.06, 0.035, 0.24, 5).rotateX(0.35), 0, hy - 0.05, -hr - 0.07), look.hair, B.head);
  } else if (look.hairStyle === 'bun') {
    add(tr(ico(0.1, 0), 0, hy + 0.16, -hr + 0.02), look.hair, B.head);
  }
  if (look.headband !== undefined)
    add(tr(cyl(hr + 0.03, hr + 0.03, 0.06, 9), 0, hy + 0.07, -0.01), look.headband, B.head, 'hard');
  if (look.hat === 'cap') {
    add(tr(hairCap(hr + 0.035, Math.PI * 0.5), 0, hy + 0.04, 0), look.hatColor, B.head, 'hard');
    add(tr(box(0.26, 0.03, 0.2), 0, hy + 0.06, hr + 0.07), shade(look.hatColor, 0.85), B.head, 'hard');
  } else if (look.hat === 'visor') {
    add(tr(cyl(hr + 0.035, hr + 0.035, 0.07, 9), 0, hy + 0.08, -0.01), look.hatColor, B.head, 'hard');
    add(tr(box(0.28, 0.03, 0.18), 0, hy + 0.06, hr + 0.07), look.hatColor, B.head, 'hard');
  } else if (look.hat === 'sunhat') {
    add(tr(cyl(0.16, 0.2, 0.17, 9), 0, hy + 0.17, 0), look.hatColor, B.head, 'hard');
    add(tr(cyl(0.205, 0.205, 0.05, 9), 0, hy + 0.11, 0), look.trim ?? shade(look.hatColor, 0.6), B.head, 'hard');
    add(tr(cyl(0.36, 0.38, 0.035, 12), 0, hy + 0.09, 0), shade(look.hatColor, 0.95), B.head, 'hard');
  }

  // 手臂：短袖 + 大手
  for (const [sh, el, sx] of [
    [B.shL, B.elL, 1],
    [B.shR, B.elR, -1],
  ] as const) {
    add(tr(ico(0.085 * fat, 0).scale(1, 0.9, 1), 0, -0.02, 0), look.shirt, sh);
    add(tr(cyl(0.085 * fat, 0.08 * fat, 0.14, 6), 0, -0.07, 0), look.shirt, sh);
    add(tr(cyl(0.068 * fat, 0.06 * fat, DIM.upper, 6), 0, -DIM.upper / 2, 0), skin, sh);
    add(tr(cyl(0.06 * fat, 0.052, DIM.fore, 6), 0, -DIM.fore / 2, 0), skin, el);
    add(tr(ico(0.075, 0).scale(1, 1.1, 0.9), 0.005 * sx, -DIM.fore - 0.03, 0), skin, el);
  }

  // 球拍（右手握着；顺着小臂往下伸，拍面法线朝前）
  if (opts.racket) {
    const rc = look.racket ?? 0x2b2b2b;
    add(tr(cyl(0.028, 0.028, 0.22, 5), 0, -0.1, 0), 0x222222, B.racket, 'hard');
    add(
      tr(
        cyl(0.14, 0.14, 0.04, 10)
          .rotateX(Math.PI / 2)
          .scale(1, 1.3, 1),
        0,
        -0.4,
        0,
      ),
      rc,
      B.racket,
      'hard',
    );
    add(
      tr(
        cyl(0.11, 0.11, 0.05, 10)
          .rotateX(Math.PI / 2)
          .scale(1, 1.3, 1),
        0,
        -0.4,
        0,
      ),
      0xe8e4d8,
      B.racket,
      'hard',
    );
  }

  // 腿
  const pants = look.bottom === 'pants';
  for (const [th, kn, ft] of [
    [B.thL, B.knL, B.ftL],
    [B.thR, B.knR, B.ftR],
  ] as const) {
    if (pants) {
      add(tr(cyl(0.1 * fat, 0.085 * fat, DIM.thigh + 0.03, 6), 0, -DIM.thigh / 2, 0), look.bottomColor, th);
      add(tr(cyl(0.085 * fat, 0.08 * fat, DIM.shin + 0.02, 6), 0, -DIM.shin / 2, 0), look.bottomColor, kn);
    } else {
      if (look.bottom === 'shorts') add(tr(cyl(0.105 * fat, 0.1 * fat, 0.2, 6), 0, -0.09, 0), look.bottomColor, th);
      add(tr(cyl(0.085 * fat, 0.072 * fat, DIM.thigh, 6), 0, -DIM.thigh / 2, 0), skin, th);
      add(tr(cyl(0.072 * fat, 0.06, DIM.shin, 6), 0, -DIM.shin / 2, 0), skin, kn);
      add(tr(cyl(0.066, 0.066, 0.1, 6), 0, -DIM.shin + 0.04, 0), look.socks, kn);
    }
    add(tr(box(0.14, DIM.foot + 0.01, 0.27), 0, -DIM.foot / 2 + 0.005, 0.05), look.shoes, ft);
  }

  const geo = finish(ps, rest);
  const mesh = new THREE.SkinnedMesh(geo, personMats(w));
  mesh.add(bones[B.hips]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  mesh.scale.setScalar(tall);
  w.mats.prepare(mesh);
  return new Rig(mesh, bones, tall);
}

/** 网球包：一个胶囊，两头深色 */
export function buildBag(w: World, color: number): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const cs: number[] = [];
  const push = (g: THREE.BufferGeometry, c: number) => {
    parts.push(g);
    cs.push(c);
  };
  push(cyl(0.14, 0.14, 0.62, 8).rotateZ(Math.PI / 2), color);
  push(
    cyl(0.15, 0.15, 0.08, 8)
      .rotateZ(Math.PI / 2)
      .translate(0.33, 0, 0),
    shade(color, 0.55),
  );
  push(
    cyl(0.15, 0.15, 0.08, 8)
      .rotateZ(Math.PI / 2)
      .translate(-0.33, 0, 0),
    shade(color, 0.55),
  );
  push(box(0.5, 0.05, 0.3).translate(0, 0.13, 0), 0xe8e0d0);
  const gs = parts.map((g, i) => {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    const n = geo.attributes.position.count;
    col.setHex(cs[i]);
    const a = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) a.set([col.r, col.g, col.b], k * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  });
  const m = new THREE.Mesh(mergeGeometries(gs)!, personMats(w)[1]);
  w.mats.prepare(m);
  return m;
}

/** 推扫帚：杆沿 +y，扫帚头在原点 */
export function buildBroom(w: World): THREE.Mesh {
  const parts: [THREE.BufferGeometry, number][] = [
    [cyl(0.035, 0.035, 1.45, 5).translate(0, 0.78, 0), 0xa07a4a],
    [box(0.62, 0.09, 0.14).translate(0, 0.1, 0), 0x6a4a2e],
    [box(0.6, 0.08, 0.12).translate(0, 0.03, 0), 0x3a3028],
  ];
  const gs = parts.map(([g, c]) => {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    const n = geo.attributes.position.count;
    col.setHex(c);
    const a = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) a.set([col.r, col.g, col.b], k * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  });
  const m = new THREE.Mesh(mergeGeometries(gs)!, personMats(w)[3]);
  w.mats.prepare(m);
  return m;
}
