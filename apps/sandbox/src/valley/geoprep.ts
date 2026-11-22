// 山谷的几何小工具（2026-11-22 从 build.ts 拆出来：assets/houses.ts 要棕榈冠，build.ts 又要 houses.ts 的 placeHouses，
// 两边都从 build.ts 拿就成了循环依赖）。build.ts 照旧转出 palmCrownGeo。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 合并之前统一成非索引、只留 position + normal */
export function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let o = g.index ? g.toNonIndexed() : g;
  if (o !== g) g.dispose();
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  o = o as THREE.BufferGeometry;
  return o;
}

/**
 * 棕榈的冠：一圈下垂的长叶（每片两节：里节平伸、外节往下垂，叶片两头尖）+ 冠心一团；法线按冠心的球面（整冠一个亮顶、暗底）。
 * 原来是八根等宽的扁盒子，远看像螺旋桨。本地原点在树脚，冠心在 y。
 */
export function palmCrownGeo(n: number, L: number, y: number, seed = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [prep(new THREE.IcosahedronGeometry(0.55, 0).translate(0, y + 0.05, 0))];
  const up = new THREE.Vector3(0, 1, 0);
  const blade = (p0: THREE.Vector3, p1: THREE.Vector3, w0: number, w1: number) => {
    const d = p1.clone().sub(p0);
    const len = d.length();
    d.normalize();
    // 三棱、不封口（一片叶 6 个三角形；路边一排几百棵，三角形预算紧）
    const g = new THREE.CylinderGeometry(w1, w0, len, 3, 1, true).scale(1, 1, 0.3);
    const X = new THREE.Vector3().crossVectors(d, up).normalize();
    const Z = new THREE.Vector3().crossVectors(X, d).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeBasis(X, d, Z));
    g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    parts.push(prep(g));
  };
  for (let k = 0; k < n; k++) {
    const h = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    const j = h - Math.floor(h);
    const a = (k / n) * Math.PI * 2 + (j - 0.5) * 0.35;
    // 上下三层：朝上的短叶、平伸的、往下垂的
    const lift = [0.42, 0.05, -0.32][k % 3];
    const len = L * (k % 3 === 0 ? 0.78 : 1) * (0.9 + j * 0.2);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const p0 = new THREE.Vector3(0, y, 0).addScaledVector(dir, 0.3);
    const p1 = p0
      .clone()
      .addScaledVector(dir, len * 0.5 * Math.cos(lift))
      .add(new THREE.Vector3(0, len * 0.5 * Math.sin(lift), 0));
    const droop = lift - 0.75;
    const p2 = p1
      .clone()
      .addScaledVector(dir, len * 0.5 * Math.cos(droop))
      .add(new THREE.Vector3(0, len * 0.5 * Math.sin(droop), 0));
    blade(p0, p1, 0.14, 0.34);
    blade(p1, p2, 0.34, 0.06);
  }
  const g = mergeGeometries(parts);
  const p = g.attributes.position as THREE.BufferAttribute;
  const nn = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i) - (y - 0.9), p.getZ(i)).normalize();
    nn.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
