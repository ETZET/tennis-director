// 地形：几层平台（顶面 ShapeGeometry + 垂直墙），池塘是地面上挖的洞，墙一直下到池底。
// 墙的 uv：x = 沿墙长度（米），y = 离墙顶多深（米）—— 墙面石纹和顶上垂下来的草边都靠它。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { H, PATHS, PLATEAUS, POND, SLABS, STAIRS, type V2 } from './layout';
import type { Mats } from './ramp';
import type { Palette } from './season';

/** 闭合折线按 Catmull-Rom 平滑重采样，间距约 step 米，再加一点点抖动 */
export function smoothLoop(pts: V2[], step: number, rnd: () => number, jitter = 0.06): V2[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const n = Math.max(8, Math.round(curve.getLength() / step));
  return curve
    .getSpacedPoints(n)
    .slice(0, n)
    .map((p) => [p.x + (rnd() - 0.5) * jitter, p.z + (rnd() - 0.5) * jitter] as V2);
}

export function smoothLine(pts: V2[], step: number): V2[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
  );
  const n = Math.max(4, Math.round(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z] as V2);
}

const area = (pts: V2[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
};

/** 顶面（y = h），可带洞 */
function top(pts: V2[], h: number, holes: V2[][] = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, h, 0);
  // ShapeGeometry 的 uv 是形状坐标，这里不用
  return g;
}

/** 点 (x, z) 是否在闭合折线里 */
function inLoop(x: number, z: number, pts: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 垂直墙：沿闭合轮廓从 h 到 hb；outward = 法线朝多边形外。
 * vis(x, z, nx, nz) = 这一段墙在画面上露出来的高度（米：墙顶 − 墙外的地面），写进 aPad.x —— 材质按它分"矮墙/高墙"
 *（规范：屏幕上露出不到 uEl.z 行的墙不挂长苔藓缕，只有草沿 + 一两行短须）。
 */
function wall(
  pts: V2[],
  h: number,
  hb: number,
  outward: boolean,
  vis: (x: number, z: number, nx: number, nz: number) => number,
): THREE.BufferGeometry {
  const ccw = area(pts) > 0; // 在 (x, z) 平面里
  const n = pts.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const pad: number[] = [];
  const idx: number[] = [];
  // 每个点的法线：两侧线段法线平均（墙面光照平滑）
  const segN = (i: number): V2 => {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % n];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const l = Math.hypot(dx, dz) || 1;
    // (dz, -dx) 在 ccw（x→z 正向）时朝外
    let nx = dz / l;
    let nz = -dx / l;
    if (!ccw) {
      nx = -nx;
      nz = -nz;
    }
    if (!outward) {
      nx = -nx;
      nz = -nz;
    }
    return [nx, nz];
  };
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const a = segN((i - 1 + n) % n);
    const b = segN(i % n);
    const nx = a[0] + b[0];
    const nz = a[1] + b[1];
    const l = Math.hypot(nx, nz) || 1;
    if (i > 0) {
      const q = pts[i - 1];
      s += Math.hypot(p[0] - q[0], p[1] - q[1]);
    }
    pos.push(p[0], h, p[1], p[0], hb, p[1]);
    nor.push(nx / l, 0, nz / l, nx / l, 0, nz / l);
    uv.push(s, 0, s, h - hb);
    const v = vis(p[0], p[1], nx / l, nz / l);
    pad.push(v, 0, 0, 0, v, 0, 0, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    // 朝向：让正面朝法线方向
    const flip = ccw === outward;
    if (flip) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPad', new THREE.Float32BufferAttribute(pad, 4));
  g.setIndex(idx);
  return g;
}

/** 带状多边形（路）：中心线左右偏移 w/2，边缘带一点抖动 */
function ribbon(line: V2[], w: number, rnd: () => number): V2[] {
  const L: V2[] = [];
  const R: V2[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const wl = w / 2 + (rnd() - 0.5) * 0.35;
    const wr = w / 2 + (rnd() - 0.5) * 0.35;
    L.push([line[i][0] + nx * wl, line[i][1] + nz * wl]);
    R.push([line[i][0] - nx * wr, line[i][1] - nz * wr]);
  }
  return [...L, ...R.reverse()];
}

function blob(cx: number, cz: number, r: number, rnd: () => number): V2[] {
  const n = 14;
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.8 + rnd() * 0.35);
    out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr * 0.85]);
  }
  return out;
}

export interface Terrain {
  root: THREE.Group;
  /** 平滑后的岸线（水面、泡沫距离场用） */
  pond: V2[];
}

export function buildTerrain(mats: Mats, pal: Palette, rng: (s: string) => () => number): Terrain {
  const root = new THREE.Group();
  const rnd = rng('terrain');
  const ground = mats.get('ground', { ramp: pal.grass, alt: pal.grassAlt, kind: 'ground', edge: 0.03 });
  // 崖壁：不规则石块 7×5 屏幕纹素（规范：高 4～6、宽 6～10）
  const cliff = mats.get('cliff', {
    ramp: pal.cliff,
    alt: pal.cliffAlt,
    kind: 'cliff',
    edge: 0.35,
    snow: false,
    tones: pal.cliffTones,
    // el.z：露出超过 20 屏幕行（≈ 1.8 米，只有池塘那圈墙）才挂长苔藓缕和中间的苔藓带；北边 0.8 米的台地墙只有 9 行
    el: [7, 5, 20, 0],
    extra: pal.cliffLip,
  });
  // 石板路：Voronoi 石块 10×7 屏幕纹素
  const path = mats.get('path', {
    ramp: pal.path,
    alt: pal.pathAlt,
    kind: 'path',
    edge: 0.03,
    tones: pal.pathTones,
    el: [8.5, 6, 1, 0],
  });
  const floorMat = mats.get('floor', { ramp: [0x3a4a7a, 0x3a4a7a, 0x3a4a7a], snow: false, edge: 0 });

  const pond = smoothLoop(POND, 0.22, rnd, 0.05);
  const tops: THREE.BufferGeometry[] = [];
  const walls: THREE.BufferGeometry[] = [];
  const loops = PLATEAUS.map((p) => ({ h: p.h, loop: smoothLoop(p.pts, 0.22, rnd, 0.05) }));
  // 墙外 0.3 米那一点的地面高度：池塘里是水面，否则取包含它的最高台面
  const groundOut = (x: number, z: number, nx: number, nz: number) => {
    const qx = x + nx * 0.3;
    const qz = z + nz * 0.3;
    if (inLoop(qx, qz, pond)) return H.water;
    let g = H.base;
    for (const l of loops) if (l.h > g && inLoop(qx, qz, l.loop)) g = l.h;
    return g;
  };

  // 底层地面：大矩形挖掉池塘
  const big: V2[] = [
    [-45, -45],
    [45, -45],
    [45, 45],
    [-45, 45],
  ];
  tops.push(top(big, H.base, [pond]));
  walls.push(wall(pond, H.base, H.floor, false, () => H.base - H.water));

  for (const { h, loop } of loops) {
    tops.push(top(loop, h));
    walls.push(wall(loop, h, H.floor - 0.1, true, (x, z, nx, nz) => Math.max(0, h - groundOut(x, z, nx, nz))));
  }

  const groundMesh = new THREE.Mesh(mergeGeometries(tops.map((g) => g.toNonIndexed())), ground);
  const wallMesh = new THREE.Mesh(mergeGeometries(walls), cliff);
  const floor = new THREE.Mesh(top(pond, H.floor), floorMat);
  root.add(groundMesh, wallMesh, floor);

  // 石板路
  const paths: THREE.BufferGeometry[] = [];
  const rp = rng('paths');
  // 路的上沿（北边）一纹素深色描边：路下面垫一块往北挪 1.5 纹素的同形状
  const rims: THREE.BufferGeometry[] = [];
  const rimShift = 0.1;
  const shifted = (poly: V2[]) => poly.map(([x, z]) => [x, z - rimShift] as V2);
  for (const p of PATHS) {
    const line = smoothLine(p.line, 0.35);
    const poly = ribbon(line, p.w, rp);
    paths.push(top(poly, p.h + 0.015).toNonIndexed());
    rims.push(top(shifted(poly), p.h + 0.008).toNonIndexed());
  }
  for (const s of SLABS) {
    const poly = blob(s.at[0], s.at[1], s.r, rp);
    paths.push(top(poly, s.h + 0.015).toNonIndexed());
    rims.push(top(shifted(poly), s.h + 0.008).toNonIndexed());
  }
  // 冬天：路被雪盖住，只剩一串脚印（左右交替，每步 0.45 米）
  if (pal.ice) {
    const steps: THREE.BufferGeometry[] = [];
    const line = smoothLine(PATHS[0].line, 0.45);
    for (let i = 1; i < line.length - 1; i++) {
      const [x0, z0] = line[i - 1];
      const [x1, z1] = line[i + 1];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const l = Math.hypot(dx, dz) || 1;
      const side = i % 2 ? 1 : -1;
      const g = new THREE.BoxGeometry(0.13, 0.02, 0.2);
      g.rotateY(Math.atan2(dx, dz));
      g.translate(line[i][0] + (-dz / l) * 0.16 * side, PATHS[0].h + 0.02, line[i][1] + (dx / l) * 0.16 * side);
      steps.push(g.toNonIndexed());
    }
    root.add(
      new THREE.Mesh(
        mergeGeometries(steps.map(stripUv)),
        mats.get('footprint', { ramp: [0x9aa6dc, 0xa8b2e2, 0xb0bae6], snow: false, edge: 0, noCloud: true }),
      ),
    );
  }
  const rimMat = mats.get('pathRim', { ramp: pal.pathRim, edge: 0.03, snow: false, bands: [-1, -1] });
  root.add(new THREE.Mesh(mergeGeometries(rims.map(stripUv)), rimMat));

  // 楼梯：踏步盒子
  const [tx, tz] = STAIRS.top;
  const [bx, bz] = STAIRS.bottom;
  const steps = STAIRS.steps;
  const stairs: THREE.BufferGeometry[] = [];
  const dirx = bx - tx;
  const dirz = bz - tz;
  const len = Math.hypot(dirx, dirz);
  const yaw = Math.atan2(dirx, dirz);
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const hTop = H.up * (1 - i / steps);
    // 往下越走越宽（参考图台阶是个梯形，两侧露出一级级的边）
    const g = new THREE.BoxGeometry(STAIRS.w * (0.88 + (0.3 * i) / steps), hTop + 0.05, len / steps + 0.02);
    g.translate(0, (hTop + 0.05) / 2 - 0.05, 0);
    g.rotateY(yaw);
    g.translate(tx + dirx * t, 0, tz + dirz * t);
    stairs.push(g.toNonIndexed());
  }
  const pathMesh = new THREE.Mesh(mergeGeometries(paths.map(stripUv)), path);
  root.add(pathMesh);
  const stairMesh = new THREE.Mesh(
    mergeGeometries(stairs.map(stripUv)),
    mats.get('stairs', {
      ramp: pal.path,
      alt: [0x3e437d, 0x555b89, 0x6368a2],
      kind: 'stairs',
      edge: 0.2,
      tones: pal.stairTones,
      // 顶端、朝下的方向 / 每级长度（踏面按级号分），级数、石条长 6～14 纹素
      plank: [tx, tz, dirx / len / (len / steps), dirz / len / (len / steps)],
      el: [steps, 6, 14, H.up],
    }),
  );
  root.add(stairMesh);

  mats.prepare(root);
  floor.castShadow = false;
  return { root, pond };
}

function stripUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes))
    if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
  if (!out.getAttribute('uv'))
    out.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2),
    );
  return out;
}
