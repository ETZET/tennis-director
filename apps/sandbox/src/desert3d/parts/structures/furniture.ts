// 场边家具和场外杂物：掉漆的长椅、锈裁判椅、翻倒的捡球筐和散落的旧球、垃圾桶、饮水桶、
// 断掉/歪掉的灯杆、破遮阳棚（帆布一角松了在甩）、褪色的招牌、步道边的旧路缘石。
import * as THREE from 'three';
import { COURT, FENCE, PATH } from '../../layout';
import type { ClothBatch } from './cloth';
import { type Bag, type Cls, type Face, mat, peeling, rusty } from './kit';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 在一个局部坐标系里放东西：先转 ry（度），再平移 */
function frame(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
  const m = mat(x, y, z, rx, ry, rz);
  return {
    m: (lx: number, ly: number, lz: number, ax = 0, ay = 0, az = 0) => m.clone().multiply(mat(lx, ly, lz, ax, ay, az)),
    p: (lx: number, ly: number, lz: number) => v3(lx, ly, lz).applyMatrix4(m),
  };
}

export function buildFurniture(bag: Bag, sail: ClothBatch, rnd: () => number) {
  bench(bag);
  umpireChair(bag);
  hopper(bag, rnd);
  trashCan(bag);
  cooler(bag);
  lightPoles(bag);
  shade(bag, sail, rnd);
  sign(bag);
  curb(bag, rnd);
}

/** 长椅：沿 z 放，面朝场内（-x）；绿漆掉成一块块，露出灰木头；一根椅面板断了一头掉在地上 */
function bench(bag: Bag) {
  const f = frame(PATH.bench.x + 0.4, 0, PATH.bench.z, 0, 0, 0);
  const iron = rusty('steelDark', 0.4, 0.5);
  const slat = peeling('benchGreen', 'woodGray', 0.3, 0.5);
  const L = 2.0;
  // 两个铁架
  for (const z of [-0.8, 0.8]) {
    bag.bar(f.p(-0.25, 0, z), f.p(-0.2, 0.45, z), 0.09, 0.09, iron);
    bag.bar(f.p(0.22, 0, z), f.p(0.2, 0.45, z), 0.09, 0.09, iron);
    bag.bar(f.p(-0.28, 0.45, z), f.p(0.24, 0.45, z), 0.08, 0.09, iron);
    bag.bar(f.p(0.2, 0.45, z), f.p(0.32, 0.95, z), 0.08, 0.08, iron);
  }
  // 椅面三条（最外一条断了）
  bag.box(0.14, 0.06, L, f.m(-0.18, 0.5, 0), slat);
  bag.box(0.14, 0.06, L, f.m(0.0, 0.5, 0), slat);
  bag.box(0.14, 0.06, 1.1, f.m(0.18, 0.5, -0.45), slat);
  bag.box(0.14, 0.06, 0.9, f.m(0.18, 0.28, 0.6, 0, 0, 0).multiply(mat(0, 0, 0, 28, 0, 0)), slat);
  // 靠背两条（往后仰）
  bag.box(0.06, 0.15, L, f.m(0.27, 0.72, 0, 0, 0, -12), slat);
  bag.box(0.06, 0.15, L - 0.3, f.m(0.31, 0.9, -0.12, 0, 0, -12), slat);
  // 椅子底下的沙堆里一个空水瓶
  bag.rod(f.p(-0.1, 0.05, -0.3), f.p(0.12, 0.06, -0.15), 0.05, 'paintWhite', 6);
}

/** 裁判椅：在西边网柱外侧，四条锈腿、平台、座椅、靠背、后面的梯子；整体歪着 */
function umpireChair(bag: Bag) {
  const x = -(COURT.hw + 0.914 + 1.0);
  const f = frame(x, 0, 0.6, 90, 0, -4);
  const leg = rusty('paintWhite', 0.35, 0.6);
  const paint = peeling('paintGreen', 'rust', 0.25, 0.5);
  const ph = 1.75;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    bag.bar(f.p(sx * 0.48, 0, sz * 0.45), f.p(sx * 0.33, ph, sz * 0.32), 0.1, 0.1, leg);
  }
  // 横撑
  for (const y of [0.55, 1.15]) {
    const k = 0.48 - (0.15 * y) / ph;
    bag.bar(f.p(-k, y, -k * 0.94), f.p(k, y, -k * 0.94), 0.07, 0.07, leg);
    bag.bar(f.p(-k, y, k * 0.94), f.p(k, y, k * 0.94), 0.07, 0.07, leg);
  }
  // 平台、座椅、靠背、扶手
  bag.box(0.9, 0.08, 0.86, f.m(0, ph, 0), paint);
  bag.box(0.12, 0.42, 0.12, f.m(0, ph + 0.25, 0.05), leg);
  bag.box(0.6, 0.08, 0.52, f.m(0, ph + 0.48, 0.05), paint);
  bag.box(0.6, 0.55, 0.07, f.m(0, ph + 0.78, 0.33, -8, 0, 0), paint);
  bag.box(0.06, 0.06, 0.45, f.m(-0.3, ph + 0.68, 0.08), leg);
  bag.box(0.06, 0.06, 0.45, f.m(0.3, ph + 0.68, 0.08), leg);
  // 前面的小桌板（朝场内），掉了一边
  bag.box(0.7, 0.05, 0.25, f.m(0, ph + 0.62, -0.42, 0, 0, -14), paint);
  // 梯子（背面）
  for (const sx of [-0.22, 0.22]) bag.bar(f.p(sx, 0, 1.0), f.p(sx, ph, 0.45), 0.07, 0.07, leg);
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    if (i === 3) continue; // 少一级
    const z = 1.0 - 0.55 * t;
    bag.bar(f.p(-0.22, ph * t, z), f.p(0.22, ph * t, z), 0.07, 0.06, 'rust');
  }
}

/** 翻倒的捡球筐和散落的旧球 */
function hopper(bag: Bag, rnd: () => number) {
  const f = frame(5.9, 0.27, 6.4, 35, 0, 78);
  const wire = rusty('steel', 0.4, 0.3);
  const s = 0.24;
  const h = 0.26;
  // 筐的竖边、上下框
  const c = [
    [-s, -s],
    [s, -s],
    [s, s],
    [-s, s],
  ] as const;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i];
    const [bx, bz] = c[(i + 1) % 4];
    bag.bar(f.p(ax, -h, az), f.p(ax, h, az), 0.06, 0.06, wire);
    bag.bar(f.p(ax, h, az), f.p(bx, h, bz), 0.06, 0.06, wire);
    bag.bar(f.p(ax, -h, az), f.p(bx, -h, bz), 0.06, 0.06, wire);
    bag.bar(
      f.p(ax * 0.5 + bx * 0.5, -h, az * 0.5 + bz * 0.5),
      f.p(ax * 0.5 + bx * 0.5, h, az * 0.5 + bz * 0.5),
      0.04,
      0.04,
      wire,
    );
  }
  bag.box(2 * s, 0.04, 2 * s, f.m(0, -h, 0), 'rustDark');
  // 两条长腿兼把手（翻倒后伸出来）
  bag.bar(f.p(-s, -h, 0), f.p(-s - 0.05, h + 0.55, 0), 0.06, 0.06, 'rust');
  bag.bar(f.p(s, -h, 0), f.p(s + 0.05, h + 0.55, 0), 0.06, 0.06, 'rust');
  bag.bar(f.p(-s - 0.05, h + 0.55, 0), f.p(s + 0.05, h + 0.55, 0), 0.07, 0.07, 'rustDark');
  // 筐里还剩几个、洒出去一串
  const ball = new THREE.IcosahedronGeometry(0.105, 1);
  const spots: [number, number][] = [
    [5.85, 6.4],
    [5.95, 6.25],
    [5.6, 6.0],
    [5.3, 5.85],
    [5.45, 5.5],
    [4.9, 5.6],
    [4.6, 5.2],
    [4.95, 4.9],
    [3.9, 4.6],
    [5.2, 6.6],
  ];
  for (const [x, z] of spots) {
    const col: Face = rnd() < 0.4 ? ['ball', 0.82] : 'ball';
    bag.add(ball.clone(), mat(x + (rnd() - 0.5) * 0.1, 0.09, z + (rnd() - 0.5) * 0.1), col);
  }
}

/** 垃圾桶：门里边，有点凹、歪着；盖子掉在旁边 */
function trashCan(bag: Bag) {
  const x = FENCE.hw - 0.7;
  const z = FENCE.gateZ - FENCE.gateW / 2 - 0.9;
  const body = rusty('paintGreen', 0.35, 0.4, 'rustDark');
  bag.add(new THREE.CylinderGeometry(0.32, 0.29, 0.9, 8), mat(x, 0.45, z, 4, 0, -3), body);
  for (const y of [0.18, 0.72])
    bag.add(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 8), mat(x + y * -0.05, y, z + y * 0.07, 4, 0, -3), 'rustDark');
  // 桶口的一圈黑（里面）
  bag.add(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 8), mat(x - 0.05, 0.9, z + 0.06, 4, 0, -3), 'dark');
  // 盖子
  bag.add(new THREE.CylinderGeometry(0.34, 0.36, 0.08, 8), mat(x - 0.65, 0.18, z - 0.25, 0, 0, 62), body);
  bag.box(0.2, 0.06, 0.06, mat(x - 0.62, 0.2, z - 0.25, 0, 0, 62), 'rustDark');
}

/** 饮水桶：长椅那头，一个小铁架上放着褪色的橙色保温桶 */
function cooler(bag: Bag) {
  const x = PATH.bench.x + 0.5;
  const z = PATH.bench.z + 1.75;
  const iron = rusty('steelDark', 0.4, 0.4);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    bag.bar(v3(x + sx * 0.22, 0, z + sz * 0.22), v3(x + sx * 0.18, 0.55, z + sz * 0.18), 0.06, 0.06, iron);
  }
  bag.box(0.5, 0.05, 0.5, mat(x, 0.56, z), iron);
  bag.add(new THREE.CylinderGeometry(0.24, 0.24, 0.48, 8), mat(x, 0.82, z), peeling('orange', 'paintWhite', 0.15, 0.3));
  bag.add(new THREE.CylinderGeometry(0.25, 0.22, 0.1, 8), mat(x, 1.1, z), 'paintWhite');
  bag.box(0.08, 0.08, 0.1, mat(x - 0.26, 0.66, z), 'paintWhite');
  // 地上掉着一个纸杯
  bag.add(new THREE.CylinderGeometry(0.06, 0.045, 0.12, 6), mat(x - 0.6, 0.06, z + 0.3, 0, 0, 90), 'paintWhite');
}

/** 灯杆：一根直的但灯头掉了一半，一根歪着，还有一根折断了上半截躺在地上 */
function lightPoles(bag: Bag) {
  const pole = rusty('steel', 0.3, 1.2);
  const head = (top: THREE.Vector3, ry: number, broken: boolean) => {
    const f = frame(top.x, top.y, top.z, ry);
    bag.box(2.1, 0.18, 0.18, f.m(0, 0, 0), 'steelDark');
    const lamps = broken ? [-0.7, 0] : [-0.7, 0, 0.7];
    for (const lx of lamps) {
      bag.box(0.6, 0.44, 0.36, f.m(lx, 0.08, -0.22, -25, 0, 0), 'steelDark');
      bag.box(0.48, 0.32, 0.05, f.m(lx, 0.02, -0.42, -25, 0, 0), lx === 0 && broken ? 'dark' : 'lamp');
    }
    if (broken) {
      // 一个灯头只剩电线吊着
      bag.bar(f.p(0.6, -0.05, -0.05), f.p(0.66, -0.75, -0.1), 0.06, 0.06, 'dark');
      bag.box(0.46, 0.34, 0.3, f.m(0.68, -0.95, -0.12, 70, 0, 20), 'steelDark');
    }
  };
  // 西北：直立，灯头坏了
  const a = v3(-FENCE.hw - 2.2, 0, -FENCE.hl + 4);
  bag.rod(a.clone().setY(-0.2), a.clone().setY(7.2), 0.17, pole, 7);
  bag.rod(a.clone().setY(0), a.clone().setY(0.35), 0.3, 'concrete', 8);
  head(a.clone().setY(7.2), -90, true);
  // 东北：整根往场内歪
  const b = v3(FENCE.hw + 2.2, 0, -FENCE.hl + 6);
  const bt = b.clone().add(v3(-1.6, 6.8, 0.5));
  bag.rod(b.clone().setY(-0.2), bt, 0.17, pole, 7);
  bag.rod(b.clone().setY(0), b.clone().setY(0.35), 0.3, 'concrete', 8);
  head(bt, 90, false);
  // 西南：折断，剩下 2.6 米的桩，上半截躺在沙里
  const c = v3(-FENCE.hw - 2.2, 0, FENCE.hl - 5);
  bag.rod(c.clone().setY(-0.2), c.clone().setY(2.6), 0.17, pole, 7);
  bag.add(new THREE.ConeGeometry(0.16, 0.3, 7), mat(c.x, 2.7, c.z, 0, 0, 20), 'rustDark');
  bag.rod(c.clone().setY(0), c.clone().setY(0.35), 0.3, 'concrete', 8);
  const lying0 = c.clone().add(v3(-0.6, 0.14, 0.6));
  const lying1 = c.clone().add(v3(-3.2, 0.14, 3.6));
  bag.rod(lying0, lying1, 0.17, pole, 7);
  const f = frame(lying1.x - 0.2, 0.18, lying1.z + 0.25, 40, 0, 80);
  bag.box(1.6, 0.14, 0.14, f.m(0, 0, 0), 'steelDark');
  bag.box(0.46, 0.34, 0.3, f.m(-0.5, 0.05, -0.18), 'steelDark');
}

/** 遮阳棚：南边围栏外，四根木柱，帆布三个角还绑着，一角松了在风里甩 */
function shade(bag: Bag, sail: ClothBatch, rnd: () => number) {
  const x0 = -6.8;
  const x1 = -3.4;
  const z0 = 19.6;
  const z1 = 22.6;
  const wood = peeling('wood', 'woodGray', 0.3, 0.6);
  const posts = [v3(x0, 2.7, z0), v3(x1, 2.5, z0), v3(x0, 2.6, z1), v3(x1, 2.4, z1)];
  posts.forEach((p, i) => {
    const lean = i === 3 ? v3(0.25, 0, 0.15) : v3(0, 0, 0);
    bag.bar(p.clone().setY(-0.1), p.clone().add(lean), 0.18, 0.18, wood);
  });
  // 一根横梁
  bag.bar(posts[0].clone().setY(2.55), posts[1].clone().setY(2.35), 0.14, 0.16, wood);
  // 底下一张木头长凳和一个翻倒的冰桶
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  bag.box(1.8, 0.08, 0.4, mat(cx, 0.45, cz - 0.3, 0, 8, 0), wood);
  for (const dx of [-0.75, 0.75])
    bag.box(0.1, 0.45, 0.32, mat(cx + dx, 0.22, cz - 0.3 - dx * 0.14, 0, 8, 0), 'woodGray');
  bag.box(0.6, 0.38, 0.4, mat(cx + 1.0, 0.2, cz + 0.8, 0, 20, 92), 'blue');
  bag.box(0.62, 0.06, 0.42, mat(cx + 1.55, 0.04, cz + 1.05, 0, 35, 0), 'paintWhite');

  // 帆：a 西北、b 东北、c 西南、d 东南（d 松了，垂下来）
  const a = posts[0].clone().add(v3(0.1, 0, 0.1));
  const b = posts[1].clone().add(v3(-0.1, 0, 0.1));
  const c = posts[2].clone().add(v3(0.1, 0, -0.1));
  const d = v3(x1 - 0.6, 1.3, z1 - 0.3);
  const nu = 10;
  const nv = 10;
  const rag = Array.from({ length: nu + nv }, () => rnd());
  const cream = new THREE.Color(1, 1, 1);
  const terracotta = new THREE.Color(0.92, 0.6, 0.48);
  sail.add({
    nu,
    nv,
    pos: (u, v) => {
      const top = a.clone().lerp(b, u);
      const bot = c.clone().lerp(d, u);
      const p = top.lerp(bot, v);
      p.y -= 0.35 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v); // 中间兜下去
      return p;
    },
    normal: v3(0, 1, 0),
    free: (u, v) => (u * v) ** 0.7,
    drift: 0.9,
    flutter: 0.35,
    lift: 0.6,
    freq: 5,
    k: 2.5,
    // 宽条纹（两色块），不加斑点
    color: (i) => (Math.floor(i / 2) % 2 === 0 ? cream : terracotta),
    keep: (i, j) => {
      // 松掉的那个角撕掉一块，边缘参差
      const r = (i + j) / (nu + nv);
      if (r > 0.86 + rag[i] * 0.08) return 0;
      if (i > 6 && j > 6 && rag[i + j] < 0.3) return 0;
      if (i === nu - 1 && rag[j] < 0.4) return 2;
      return 1;
    },
  });
}

/** 招牌：南边围栏外，两根柱子，一块晒褪色的条纹板往后仰（接到太阳），一边的螺丝掉了，斜挂着 */
function sign(bag: Bag) {
  const f = frame(-1.4, 0, 20.6, -8, 0, 0);
  const post = rusty('steel', 0.4, 0.7);
  bag.bar(f.p(-1.0, -0.1, 0), f.p(-1.0, 0.7, -0.05), 0.14, 0.14, post);
  bag.bar(f.p(1.0, -0.1, 0), f.p(1.05, 1.3, -0.15), 0.14, 0.14, post);
  // 板：竖着分成几条褪色的条纹（天蓝、白、橙），只剩右上角一颗螺丝，左边耷拉下来
  // 柱子断了一根，板往后倒、靠在剩下的柱子上（面朝天，才接得到画面后方的太阳）
  const pivot = f.m(1.0, 1.25, -0.1, -70, 0, 8);
  const at = (lx: number, ly: number, lz: number, rz = 0) => pivot.clone().multiply(mat(lx - 1.0, ly, lz, 0, 0, rz));
  const bands: Cls[] = ['blue', 'paintWhite', 'orange', 'paintWhite', 'blue'];
  const bw = 2.3 / bands.length;
  bands.forEach((col, i) => {
    const lx = -1.15 + bw * (i + 0.5);
    bag.box(bw, 1.0, 0.08, at(lx, -0.55, 0), col);
  });
  // 白底上一个模糊的"球"和"拍"（看不清的标志）
  bag.add(new THREE.IcosahedronGeometry(0.17, 1), at(-0.1, -0.5, 0.07), 'ball');
  bag.box(0.45, 0.1, 0.05, at(0.25, -0.62, 0.05, 30), 'wood');
  // 上下边框
  bag.box(2.4, 0.1, 0.12, at(0, -0.02, 0), 'woodGray');
  bag.box(2.4, 0.1, 0.12, at(0, -1.08, 0), 'woodGray');
}

/** 路缘石：步道（岛东南角 → 门）两边稀疏的半埋石块 */
function curb(bag: Bag, rnd: () => number) {
  const pts = [
    v3(PATH.arrive.x, 0, PATH.arrive.z),
    v3(13.4, 0, 14),
    v3(11.6, 0, 6),
    v3(PATH.gate.x + 0.4, 0, PATH.gate.z),
  ];
  const geo = new THREE.DodecahedronGeometry(1, 0);
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s];
    const b = pts[s + 1];
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    const side = v3(-dir.z, 0, dir.x);
    for (let d = 0.3; d < len; d += 0.6) {
      for (const sgn of [-1, 1]) {
        if (rnd() < 0.35) continue;
        const r = 0.13 + rnd() * 0.12;
        const p = a
          .clone()
          .addScaledVector(dir, d + (rnd() - 0.5) * 0.3)
          .addScaledVector(side, sgn * (0.95 + (rnd() - 0.5) * 0.2));
        const sc = v3(r * (1.2 + rnd() * 0.4), r * 0.7, r);
        const col: Face = rnd() < 0.5 ? 'stone' : ['stone', rnd() < 0.5 ? 0.88 : 0.94];
        bag.add(geo.clone(), mat(p.x, r * 0.25, p.z, rnd() * 30, rnd() * 360, rnd() * 20, sc), col);
      }
    }
  }
}
