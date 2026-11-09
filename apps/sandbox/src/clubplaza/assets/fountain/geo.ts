// 喷泉用的几何体：都以喷泉中心为原点（本地），绕 y 轴转一圈。
// 墙的 uv = (沿墙米, 离墙顶米)（toon 的 wall 空间），aElem.x = 墙在画面上露出的高度（米，矮墙规则用）。
import * as THREE from 'three';

const TAU = Math.PI * 2;

/** 按顶点法线把每个三角形的绕序摆正（正面朝法线那边） */
function orient(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.getIndex();
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  if (!idx || !n) return g;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const arr = idx.array as Uint16Array | Uint32Array;
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(p, arr[i]);
    b.fromBufferAttribute(p, arr[i + 1]).sub(a);
    c.fromBufferAttribute(p, arr[i + 2]).sub(a);
    b.cross(c);
    nn.set(0, 0, 0);
    for (let k = 0; k < 3; k++) nn.add(new THREE.Vector3().fromBufferAttribute(n, arr[i + k]));
    if (b.dot(nn) < 0) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
  }
  idx.needsUpdate = true;
  return g;
}

/** 竖直圆柱墙（可上下不同半径）：outward = 法线朝外；uv = (沿墙米, 离墙顶米)；expo = 露出高度（米） */
export function cylWall(
  rTop: number,
  rBot: number,
  yTop: number,
  yBot: number,
  seg: number,
  outward = true,
  expo?: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const ex: number[] = [];
  const idx: number[] = [];
  const s = outward ? 1 : -1;
  const slope = (rBot - rTop) / Math.max(yTop - yBot, 1e-3);
  const nl = Math.hypot(1, slope);
  const rMid = (rTop + rBot) / 2;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    pos.push(rTop * c, yTop, rTop * sn, rBot * c, yBot, rBot * sn);
    const nx = (c / nl) * s;
    const ny = (slope / nl) * s;
    const nz = (sn / nl) * s;
    nor.push(nx, ny, nz, nx, ny, nz);
    const u = (i / seg) * TAU * rMid;
    uv.push(u, 0, u, yTop - yBot);
    const e = expo ?? yTop - yBot;
    ex.push(e, 0, 0, 0, e, 0, 0, 0);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aElem', new THREE.Float32BufferAttribute(ex, 4));
  g.setIndex(idx);
  return orient(g);
}

/** 平的圆环（朝上）：压顶顶面、碗沿顶面 */
export function annulus(rIn: number, rOut: number, y: number, seg: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.push(rIn * c, y, rIn * s, rOut * c, y, rOut * s);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(i / seg, 0, i / seg, 1);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return orient(g);
}

/**
 * 旋转体：剖面 [r, y] 从里往外按顺序（法线 = 剖面走向顺时针转 90°，即剖面左手边是外面）。
 * flat = true 时每段剖面单独一组顶点（棱是硬的：碗沿、罐口）；否则平滑。
 */
export function lathe(profile: [number, number][], seg: number, flat = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  const pushRing = (r: number, y: number, nr: number, ny: number, v: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(r * c, y, r * s);
      nor.push(nr * c, ny, nr * s);
      uv.push(i / seg, v);
    }
  };
  const segNormal = (k: number): [number, number] => {
    const [r0, y0] = profile[k];
    const [r1, y1] = profile[k + 1];
    const dr = r1 - r0;
    const dy = y1 - y0;
    const l = Math.hypot(dr, dy) || 1;
    return [dy / l, -dr / l];
  };
  let v = 0;
  if (flat) {
    for (let k = 0; k < profile.length - 1; k++) {
      const [nr, ny] = segNormal(k);
      const [r0, y0] = profile[k];
      const [r1, y1] = profile[k + 1];
      const v1 = v + Math.hypot(r1 - r0, y1 - y0);
      pushRing(r0, y0, nr, ny, v);
      pushRing(r1, y1, nr, ny, v1);
      for (let i = 0; i < seg; i++) {
        const a = base + i;
        const b = base + seg + 1 + i;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      base += (seg + 1) * 2;
      v = v1;
    }
  } else {
    for (let k = 0; k < profile.length; k++) {
      const n0 = segNormal(Math.max(0, k - 1));
      const n1 = segNormal(Math.min(profile.length - 2, k));
      const nr = n0[0] + n1[0];
      const ny = n0[1] + n1[1];
      const l = Math.hypot(nr, ny) || 1;
      if (k > 0) v += Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]);
      pushRing(profile[k][0], profile[k][1], nr / l, ny / l, v);
      if (k > 0) {
        for (let i = 0; i < seg; i++) {
          const a = base - (seg + 1) + i;
          const b = base + i;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      base += seg + 1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return orient(g);
}

/**
 * 圆水面（朝上，y 高度，半径 R）：极坐标网格；aElem = [往北到岸的距离, 到岸的距离]（米），toon 的 water 元素用
 * （北岸脚下一条天光亮带、中间深处）。northK：往北距离乘几（> 1 = 天光带更窄；toon 的带宽是给 20 米的池塘调的）。
 */
export function waterDisc(R: number, y: number, seg: number, rings: number, northK = 1): THREE.BufferGeometry {
  const pos: number[] = [0, y, 0];
  const nor: number[] = [0, 1, 0];
  const uv: number[] = [0.5, 0.5];
  const el: number[] = [R * northK, R, 0, 0];
  const idx: number[] = [];
  for (let j = 1; j <= rings; j++) {
    const r = (R * j) / rings;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU;
      const x = r * Math.cos(a);
      const z = r * Math.sin(a);
      pos.push(x, y, z);
      nor.push(0, 1, 0);
      uv.push(0.5 + x / (2 * R), 0.5 + z / (2 * R));
      const north = z + Math.sqrt(Math.max(0, R * R - x * x));
      el.push(north * northK, R - r, 0, 0);
    }
  }
  const at = (j: number, i: number) => (j === 0 ? 0 : 1 + (j - 1) * seg + (i % seg));
  for (let i = 0; i < seg; i++) idx.push(0, at(1, i), at(1, i + 1));
  for (let j = 1; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      idx.push(at(j, i), at(j + 1, i), at(j, i + 1));
      idx.push(at(j + 1, i), at(j + 1, i + 1), at(j, i + 1));
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aElem', new THREE.Float32BufferAttribute(el, 4));
  g.setIndex(idx);
  return orient(g);
}

/** 八棱台（柱座）：硬棱，一个面正对镜头 */
export function octo(rBot: number, rTop: number, y0: number, y1: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, y1 - y0, 8, 1, true).toNonIndexed();
  g.rotateY(-Math.PI / 8);
  g.translate(0, (y0 + y1) / 2, 0);
  g.computeVertexNormals();
  return g;
}
