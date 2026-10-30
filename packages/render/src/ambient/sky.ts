import { mulberry32, range } from '@td/shared';
import * as THREE from 'three';
import { part } from '../people/parts';

/**
 * 浮空岛的天空（设计稿「Floating island」）：
 * - 方块云在岛的四周和下方慢慢漂，下雨时变成灰色
 * - 几块长着草的小土块浮在岛边，轻轻上下晃
 *
 * 用自己的种子随机流，不碰 Math.random（演出的随机回合不受影响）。
 */

export interface IslandRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface IslandSkyOptions {
  island: IslandRect;
  seed: number;
  /** 晴 / 雨两种云色 */
  cloud: readonly [string, string];
}

export interface IslandSky {
  /** rain：0 晴到 1 雨 */
  update(dt: number, now: number, rain: number): void;
}

interface Cloud {
  g: THREE.Group;
  speed: number;
  wrap: number;
}

export function createIslandSky(scene: THREE.Object3D, o: IslandSkyOptions): IslandSky {
  const rand = mulberry32(o.seed);
  const R = (a: number, b: number) => range(rand, a, b);
  const { x0, x1, z0, z1 } = o.island;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const hx = (x1 - x0) / 2;
  const hz = (z1 - z0) / 2;

  /* ---------- 云 ---------- */
  const sunny = new THREE.Color(o.cloud[0]);
  const rainy = new THREE.Color(o.cloud[1]);
  // 设计稿的云是平涂的：不受光照，只随天气换颜色，远处的被雾吃掉
  const cloudMat = new THREE.MeshBasicMaterial({ color: sunny.clone() });
  const clouds: Cloud[] = [];
  const box = (g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cloudMat);
    m.position.set(x, y, z);
    g.add(m);
  };
  const addCloud = (x: number, y: number, z: number, s: number, speed: number) => {
    const g = new THREE.Group();
    const w = R(14, 26) * s;
    const d = R(7, 12) * s;
    box(g, w, 2.4 * s, d, 0, 0, 0);
    box(g, w * R(0.45, 0.6), 2 * s, d * 0.8, R(-0.15, 0.15) * w, 2.2 * s, R(-0.1, 0.1) * d);
    box(g, w * R(0.25, 0.35), 1.6 * s, d * 0.6, R(0.15, 0.3) * w, 3.8 * s, 0);
    g.position.set(x, y, z);
    scene.add(g);
    clouds.push({ g, speed, wrap: 260 });
  };
  // 岛下方：在岛底下穿过，从四周的缝里看得见
  for (let i = 0; i < 16; i++)
    addCloud(R(cx - 200, cx + 200), R(-85, -38), R(cz - 170, cz + 170), R(0.9, 1.5), R(0.8, 1.8));
  // 和岛差不多高、离岛远的：只在岛的南北两侧漂，横着漂也不会穿过岛
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    addCloud(R(cx - 200, cx + 200), R(-24, 2), cz + side * R(hz + 30, hz + 90), R(0.8, 1.2), R(0.6, 1.2));
  }

  /* ---------- 浮在岛边的小土块 ---------- */
  const chunks: { g: THREE.Group; y0: number; phase: number }[] = [];
  const addChunk = (x: number, y: number, z: number, s: number, tree = false) => {
    const g = new THREE.Group();
    part(g, 2.2 * s, 0.4 * s, 2.2 * s, 0, 0, 0, '#7d8448');
    part(g, 2.2 * s, 1.2 * s, 2.2 * s, 0, -0.8 * s, 0, '#6f5a42');
    part(g, 1.6 * s, 1 * s, 1.6 * s, 0, -1.9 * s, 0, '#7b7468');
    part(g, 0.8 * s, 0.7 * s, 0.8 * s, 0, -2.7 * s, 0, '#6b655a');
    if (tree) {
      part(g, 0.3 * s, 1.2 * s, 0.3 * s, 0, 0.8 * s, 0, '#4a3a2e');
      part(g, 1.3 * s, 1.1 * s, 1.3 * s, 0, 1.8 * s, 0, '#7a7d42');
    }
    g.position.set(x, y, z);
    g.rotation.y = R(0, Math.PI / 2);
    scene.add(g);
    chunks.push({ g, y0: y, phase: R(0, Math.PI * 2) });
  };
  addChunk(x0 - 16, -4, cz - hz * 0.55, 4, true);
  addChunk(x0 - 26, -14, cz + hz * 0.25, 2.6);
  addChunk(x1 + 18, -8, cz - hz * 0.3, 3.2);
  addChunk(cx + hx * 0.25, -20, z1 + 24, 3.6);
  addChunk(cx - hx * 0.5, -10, z0 - 20, 2.8);

  const tmp = new THREE.Color();
  return {
    update(dt, now, rain) {
      for (const c of clouds) {
        c.g.position.x += c.speed * dt;
        if (c.g.position.x > cx + c.wrap / 2 + 60) c.g.position.x -= c.wrap + 120;
      }
      cloudMat.color.copy(tmp.copy(sunny).lerp(rainy, rain));
      for (const k of chunks) k.g.position.y = k.y0 + Math.sin(now * 0.6 + k.phase) * 0.35;
    },
  };
}
