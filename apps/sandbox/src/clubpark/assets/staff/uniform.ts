// 制服：在 buildPerson 建好的人身上补 rig 没有的部件（马甲、外套下摆和长袖、礼帽、白手套、钥匙串）。
// 尺寸和 rig 一样按 0.09 米设计纹素：看得见的部分 ≥ 2～3 纹素；不加白领口、白袖口（小人身上细碎的对比色 = 噪点）。
// 部件的法线照 rig 的做法从部件中心往外（blobNormals）→ 每块都是亮顶、中腰、暗底。
import * as THREE from 'three';
import { blobNormals } from '../../../clubsite/render/toon';
import type { Bones } from './bones';

type Mat = THREE.Material;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function part(geo: THREE.BufferGeometry, mat: Mat, at: THREE.Vector3, center?: THREE.Vector3): THREE.Mesh {
  geo.translate(at.x, at.y, at.z);
  blobNormals(geo, center ?? at.clone());
  return new THREE.Mesh(geo, mat);
}
/** 八棱柱（平的一面朝前，同 rig 的躯干），前后压扁 */
function prism(rTop: number, rBot: number, h: number, depth = 0.76): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 8, 1);
  g.rotateY(Math.PI / 8);
  g.scale(1, 1, depth);
  return g;
}

/**
 * 代客的马甲：罩在躯干外面的一层（比衬衫大 1 厘米多一点），上面盖到领口，下面往下盖住裤腰的上半（马甲长过腰）
 * → 躯干整块是马甲色，白衬衫只露在袖子上。场景里代客多半背对镜头：Q 版的大头从背后挡掉躯干上半，
 * 马甲往下多出来的这 0.13 米（背后 ≈ 3 屏幕纹素）是背影里红色的主要来源。
 */
export function addVest(b: Bones, vest: Mat, stout = 1): void {
  const g = prism(0.263, 0.262, 0.585, 0.8);
  g.scale(stout, 1, stout);
  b.torso.add(part(g, vest, V(0, 0.2025, 0), V(0, 0.16, 0)));
}

/**
 * 门童的外套：躯干由 shirt = 外套色（rig 建），这里补
 * - 下摆：从腰往下盖到大腿上半（0.34 米 ≈ 4 纹素）的一圈喇叭，走路时腿在里面摆；
 * - 长袖：前臂外面套一层外套色（rig 的前臂是皮肤），手腕以下露手（手套）。
 */
export function addCoat(b: Bones, coat: Mat): void {
  const hem = prism(0.25, 0.3, 0.34, 0.8);
  b.hips.add(part(hem, coat, V(0, -0.06, 0), V(0, 0.15, 0)));
  for (const a of [b.armL, b.armR]) {
    // 肩下 0.06 到 0.42：手（拳头球 0.32..0.56）的下半截露出来
    const sl = new THREE.CapsuleGeometry(0.13, 0.1, 2, 8);
    // 胶囊自己的法线（横向一圈亮暗），同 rig 的 limb
    sl.translate(0, -0.24, 0);
    a.sh.add(new THREE.Mesh(sl, coat));
  }
}

/** 把两只手（rig 的拳头球）换成手套色 */
export function glove(b: Bones, glove: Mat): void {
  for (const a of [b.armL, b.armR]) {
    for (const c of a.hand.children) {
      const m = c as THREE.Mesh;
      if (m.isMesh && (m.geometry as THREE.SphereGeometry).type === 'SphereGeometry') m.material = glove;
    }
  }
}

/**
 * 礼帽（门童）：帽檐一圈（直径 0.8 米 ≈ 9 纹素）+ 窄而高的帽筒（0.5 米高、上口略大）+ 帽筒根部一条 1 纹素多的深蓝帽带。
 * 45° 俯视下竖直的一截只剩 0.7 倍，帽筒要比"看起来合适"再高一截、再窄一点，否则读成渔夫帽。
 * 挂在 tilt 里跟着脸走；tilt 往后仰 0.32，帽子自己往前扳回 0.2 → 只略往后倾（45° 俯视下帽顶是一块亮椭圆，帽筒是竖着的一截）。
 */
export function addTopHat(b: Bones, hat: Mat, band: Mat): THREE.Group {
  const g = new THREE.Group();
  // 绕头心转：先把组放在头心，部件相对头心摆
  const HC = V(0, 0.33, 0);
  g.position.copy(HC);
  g.rotation.x = 0.2;
  // 帽檐：法线中心放低 → 顶面朝上落亮档，一圈白边压在脸上
  const brim = new THREE.CylinderGeometry(0.4, 0.4, 0.06, 18, 1);
  g.add(part(brim, hat, V(0, 0.2, 0.01), V(0, -0.5, 0.01)));
  const bandG = new THREE.CylinderGeometry(0.262, 0.262, 0.11, 14, 1);
  g.add(part(bandG, band, V(0, 0.285, 0), V(0, 0.285, 0)));
  const crown = new THREE.CylinderGeometry(0.275, 0.255, 0.4, 14, 1);
  g.add(part(crown, hat, V(0, 0.54, 0), V(0, 0.45, 0)));
  // 帽顶：略鼓的一片（顶面亮档）
  const top = new THREE.SphereGeometry(0.275, 14, 3, 0, Math.PI * 2, 0, Math.PI * 0.5);
  top.scale(1, 0.12, 1);
  g.add(part(top, hat, V(0, 0.74, 0), V(0, 0.5, 0)));
  b.tilt.add(g);
  return g;
}

/**
 * 钥匙串（代客）：右手拳头下面挂一块 3 × 4 纹素的亮牌（奶油金）+ 一把 2 纹素宽的钥匙。
 * 画面里它就是代客手边的一个亮点。返回的组 visible 由 setProp('keys') 管。
 */
export function makeKeys(tag: Mat, key: Mat): THREE.Group {
  const g = new THREE.Group();
  const t = new THREE.BoxGeometry(0.15, 0.19, 0.07);
  t.rotateZ(0.25);
  g.add(part(t, tag, V(0.02, -0.2, 0.06), V(0.02, -0.12, 0.1)));
  const k = new THREE.BoxGeometry(0.08, 0.17, 0.05);
  k.rotateZ(-0.35);
  g.add(part(k, key, V(-0.08, -0.17, 0.02), V(-0.08, -0.1, 0.06)));
  return g;
}
