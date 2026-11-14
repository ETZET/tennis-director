// 球童这一局新加的小东西（同场景的像素风：俱乐部底表的材质，0.09 米设计纹素的尺寸）：
//  - 毛巾箱：俱乐部蓝的小箱子，口沿白，上面叠着三条白毛巾（换边时去拿）。0.6 × 0.5 × 0.42 米，原点 = 落地点中心
//  - 毛巾：拿在手里垂着的一条（握点在上沿，往下垂）；递给球员以后搭在他肩上
//  - 球：clubsite 的 tennis-ball 的几何和材质（⌀ 0.2，最亮的黄绿点）+ 地上一个暗的小影子
//  - FX 层（不描边、不受光）的提示：比赛的地方的边框（发球前 / 比赛中亮起来）、发球人的视线锥
import * as THREE from 'three';
import { ballKit } from '../../clubsite/assets/tennis-ball';
import type { AssetCtx } from '../../clubsite/render/ctx';

const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number] };

export function buildTowelBox(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'ballkid:towel-box';
  const blue = ctx.mat('clothBlue', { ...PROP, convex: 0.2 });
  const white = ctx.mat('clothWhite', { ...PROP, convex: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.42), blue);
  body.position.y = 0.18;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.46), white);
  rim.position.y = 0.39;
  g.add(body, rim);
  // 叠着的毛巾：三条，一条比一条往里错一点
  const stack: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.46 - i * 0.04, 0.07, 0.3), white);
    t.position.set(i % 2 ? 0.03 : -0.02, 0.46 + i * 0.075, 0.01 * i);
    stack.push(t);
    g.add(t);
  }
  // 箱前一条白带（俱乐部的标）
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 0.02), white);
  band.position.set(0, 0.2, 0.215);
  g.add(band);
  ctx.mats.prepare(g);
  /** 箱子里还剩几条（只画 0～3） */
  g.userData.setCount = (n: number) => {
    stack.forEach((t, i) => {
      t.visible = i < n;
    });
  };
  return g;
}

/** 手里的毛巾：上沿是握点，往下垂 0.42 米 */
export function buildTowel(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'ballkid:towel';
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.42, 0.05).translate(0, -0.21, 0),
    ctx.mat('clothWhite', { ...PROP, convex: 0.3 }),
  );
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.31, 0.05, 0.055).translate(0, -0.34, 0),
    ctx.mat('clothBlue', { ...PROP, convex: 0.2 }),
  );
  g.add(m, stripe);
  ctx.mats.prepare(g, { cast: false });
  g.userData.grip = { at: [0, 0, 0], axis: [0, -1, 0], up: [0, 0, 1] };
  return g;
}

/** 搭在球员肩上的毛巾（挂到球员身上，本地坐标） */
export function buildDrape(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const white = ctx.mat('clothWhite', { ...PROP, convex: 0.3 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.22), white);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.05), white);
  front.position.set(0.12, -0.15, 0.12);
  const front2 = front.clone();
  front2.position.x = -0.12;
  g.add(top, front, front2);
  ctx.mats.prepare(g, { cast: false });
  return g;
}

/** 一个球 + 它的影子（影子在 FX 层：地上一个暗点，往镜头偏一点） */
export interface Ball {
  obj: THREE.Mesh;
  shadow: THREE.Mesh;
  set(p: { x: number; y: number; z: number } | readonly number[] | null, groundY?: number): void;
}
export function makeBall(ctx: AssetCtx, scene: THREE.Object3D): Ball {
  const kit = ballKit(ctx as unknown as Parameters<typeof ballKit>[0]);
  const obj = new THREE.Mesh(kit.geo, kit.mat);
  obj.castShadow = false;
  obj.visible = false;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.11, 8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x24305a, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.layers.set(1);
  shadow.visible = false;
  scene.add(obj, shadow);
  return {
    obj,
    shadow,
    set(p, gy = 0.024) {
      if (!p) {
        obj.visible = shadow.visible = false;
        return;
      }
      const x = Array.isArray(p) ? p[0] : (p as { x: number }).x;
      const y = Array.isArray(p) ? p[1] : (p as { y: number }).y;
      const z = Array.isArray(p) ? p[2] : (p as { z: number }).z;
      obj.visible = shadow.visible = true;
      obj.position.set(x, y, z);
      shadow.position.set(x, gy + 0.012, z + Math.max(0, y - gy) * 0.35);
    },
  };
}

const fxMat = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

/** 地上一个矩形框（比赛的地方）：四条 w 宽的带子 */
export function rectFrame(
  r: { x0: number; x1: number; z0: number; z1: number },
  w = 0.24,
  color = 0xff5a5a,
): THREE.Mesh {
  const gs: THREE.BufferGeometry[] = [];
  const bar = (x0: number, x1: number, z0: number, z1: number) =>
    gs.push(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2));
  bar(r.x0, r.x1, r.z1 - w, r.z1);
  bar(r.x0, r.x1, r.z0, r.z0 + w);
  bar(r.x0, r.x0 + w, r.z0, r.z1);
  bar(r.x1 - w, r.x1, r.z0, r.z1);
  const geo = new THREE.BufferGeometry();
  const pos: number[] = [];
  const idx: number[] = [];
  for (const g of gs) {
    const base = pos.length / 3;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, fxMat(color, 0.8));
  m.position.y = 0.05;
  m.layers.set(1);
  m.renderOrder = 2;
  m.frustumCulled = false;
  return m;
}

/** 视线锥：一个扇形（半角 half，长 len），原点在发球人脚下，朝 dir（弧度，0 = +z） */
export function sightCone(half: number, len: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(len, 12, -half, half * 2).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, fxMat(0xff5a5a, 0.34));
  m.layers.set(1);
  m.renderOrder = 1;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}
