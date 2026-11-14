// 膝盖腿：rig 的腿是一整根胶囊（髋 → 鞋底 0.5 米，不能弯），坐下、半蹲、低重心的准备姿势要膝盖。
// 每条腿组里另建一套"大腿 + 膝 + 小腿 + 鞋"（同一种材质、同样粗），要弯的时候把原来的胶囊和鞋藏起来、换这套。
// 大腿 0.22 + 小腿到鞋底 0.28 = 0.5 米（和原来的腿一样长，比例不变）；小腿可以顺着自己拉长（坐在 0.5 米的长椅上脚要着地）。
// 腿组自己的 rotation 就是髋：rotation.x = −π/2 大腿朝前平伸；knee.rotation.x > 0 小腿往后弯。鞋（踝组）始终保持水平。
import * as THREE from 'three';
import { blobNormals } from '../render/toon';
import type { Bones } from './bones';
import { tagPart } from './rig/rig';

type Mat = THREE.Material;

export const THIGH = 0.22;
/** 膝 → 踝（踝下面鞋底再 0.06） */
export const SHIN_ANKLE = 0.22;
const SOLE = 0.06;
/** 膝到鞋底的自然长度 */
export const SHIN = SHIN_ANKLE + SOLE;

interface KneeLeg {
  leg: THREE.Group;
  alt: THREE.Group;
  knee: THREE.Group;
  shin: THREE.Group;
  ankle: THREE.Group;
}

export interface KneeLegs {
  /** 换上膝盖腿（true）/ 换回原来的直腿 */
  show(on: boolean): void;
  /**
   * 摆一条腿：hipX 髋的前后（负 = 大腿往前抬），hipZ 往外分（右腿取负），knee 膝弯（≥ 0），shin 小腿拉长倍数。
   * 踝自动抵消，鞋底保持水平。
   */
  set(side: 'R' | 'L', hipX: number, hipZ: number, knee: number, shin?: number): void;
  /** 鞋底离髋的竖直距离（腿组坐标，未缩放）：按 hipX、knee、shin 算，摆姿势时用来求臀的高度 */
  drop(hipX: number, knee: number, shin?: number): number;
  /** 小腿要拉长多少倍，鞋底才落在髋下 h 米（大腿按 hipX 摆、小腿竖直） */
  shinFor(h: number, hipX: number): number;
}

function part(geo: THREE.BufferGeometry, mat: Mat, at: THREE.Vector3, center?: THREE.Vector3): THREE.Mesh {
  geo.translate(at.x, at.y, at.z);
  blobNormals(geo, center ?? at.clone());
  return new THREE.Mesh(geo, mat);
}
/** 手臂、腿：保留胶囊自己的法线（同 rig 的 limb） */
function limb(geo: THREE.BufferGeometry, mat: Mat, y: number): THREE.Mesh {
  geo.translate(0, y, 0);
  return new THREE.Mesh(geo, mat);
}

export function addKneeLegs(b: Bones): KneeLegs {
  // 材质从 rig 建好的网格上拿：腿胶囊（短裤/裙子时是皮肤，长裤时是裤子）、鞋、臀部（裤子/裙子色）
  const legsOrig = b.legMeshes;
  const cap = legsOrig.find((m) => m.geometry.type === 'CapsuleGeometry');
  const shoe = legsOrig.find((m) => m.geometry.type === 'BoxGeometry');
  if (!cap || !shoe) throw new Error('clubsite/people：找不到腿的网格（rig.ts 的结构变了？）');
  const legMat = cap.material as Mat;
  const shoeMat = shoe.material as Mat;
  const r = (cap.geometry as THREE.CapsuleGeometry).parameters.radius;
  const botMat = (b.bottom?.material as Mat | undefined) ?? legMat;
  const botParams = (b.bottom?.geometry as THREE.CylinderGeometry | undefined)?.parameters;
  const kind = legMat === botMat ? 'pants' : botParams && botParams.radiusBottom > 0.3 ? 'skirt' : 'shorts';

  const build = (leg: THREE.Group): KneeLeg => {
    const alt = new THREE.Group();
    alt.visible = false;
    leg.add(alt);
    // 大腿：髋 → 膝（胶囊两头圆，膝那头多出一点，弯的时候膝盖是圆的）
    alt.add(tagPart(limb(new THREE.CapsuleGeometry(r, 0.05, 2, 8), legMat, -0.11), 'thigh'));
    // 短裤盖住大腿上半、裙子盖住大腿上 2/3（坐下时大腿平伸，原来的裤腰盖不到）
    if (kind !== 'pants') {
      const len = kind === 'skirt' ? 0.1 : 0.06;
      const g = new THREE.CapsuleGeometry(r + (kind === 'skirt' ? 0.035 : 0.02), len, 2, 8);
      alt.add(tagPart(limb(g, botMat, -0.02 - len / 2), 'thigh-cover'));
    }
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    alt.add(knee);
    // 小腿：只有它跟着 shin 拉长（鞋不拉）
    const shin = new THREE.Group();
    knee.add(shin);
    shin.add(tagPart(limb(new THREE.CapsuleGeometry(r * 0.95, 0.02, 2, 8), legMat, -0.085), 'shin'));
    const ankle = new THREE.Group();
    ankle.position.y = -SHIN_ANKLE;
    knee.add(ankle);
    // 鞋：同 rig 的鞋（0.22 × 0.12 × 0.32，鞋尖往前 0.04）
    ankle.add(
      tagPart(
        part(
          new THREE.BoxGeometry(0.22, 0.12, 0.32),
          shoeMat,
          new THREE.Vector3(0, 0, 0.04),
          new THREE.Vector3(0, 0.14, 0.02),
        ),
        'shoe',
      ),
    );
    return { leg, alt, knee, shin, ankle };
  };
  const R = build(b.legR);
  const L = build(b.legL);

  const show = (on: boolean) => {
    for (const m of legsOrig) m.visible = !on;
    R.alt.visible = L.alt.visible = on;
    if (!on) {
      for (const k of [R, L]) {
        k.knee.rotation.set(0, 0, 0);
        k.ankle.rotation.set(0, 0, 0);
        k.shin.scale.y = 1;
        k.ankle.position.y = -SHIN_ANKLE;
      }
    }
  };
  const set = (side: 'R' | 'L', hipX: number, hipZ: number, knee: number, shin = 1) => {
    const k = side === 'R' ? R : L;
    k.leg.rotation.set(hipX, 0, hipZ);
    k.knee.rotation.x = knee;
    k.shin.scale.y = shin;
    k.ankle.position.y = -SHIN_ANKLE * shin;
    // 鞋底保持水平：抵掉髋和膝（臀、躯干的前后倾不算 —— 坐、蹲时臀是正的）
    k.ankle.rotation.x = -(hipX + knee);
  };
  const drop = (hipX: number, knee: number, shin = 1) =>
    THIGH * Math.cos(hipX) + (SHIN_ANKLE * shin + SOLE) * Math.cos(hipX + knee);
  const shinFor = (h: number, hipX: number) => (h - THIGH * Math.cos(hipX) - SOLE) / SHIN_ANKLE;
  return { show, set, drop, shinFor };
}
