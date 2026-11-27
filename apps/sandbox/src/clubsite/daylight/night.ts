// 夜里会亮的东西（共用机制）：物件在 userData.night 上挂一个 NightLight，clubsite/daylight 每 2 秒扫一遍场景，
// 天黑（或阴雨天）调 setOn 开灯、每帧把最近的 LAMP_N 个光斑写进材质（toon.ts lampField：挨着的光斑加起来合成一片）。
// 这个文件只依赖 three，资产文件直接 import（不经过 daylight/index，不带进面板和天气）。
import * as THREE from 'three';

/** 一个灯光斑：圆心 x z、半径、照到的最高 y（世界坐标）；c = 灯色（乘子，不给 = 暖白），k = 强度（不给 = 1） */
export interface LampPool {
  x: number;
  z: number;
  r: number;
  h: number;
  c?: [number, number, number];
  k?: number;
}

/**
 * 夜里会亮的东西：挂在物件的 userData.night 上，天黑（或阴雨天）自动开。
 * - setOn(on)：换自发光的材质（灯面、窗、灯泡）；
 * - pool()：一个光斑 [x, z, 半径, 最高 y]，颜色 / 强度用旁边的 color / power；
 * - pools()：几个光斑（一串灯、一排窗），各带各的颜色和强度。
 * 挨着的光斑加起来合成一片（toon.ts lampField）。nightLight() 是给资产用的小工具。
 */
export interface NightLight {
  setOn?: (on: boolean) => void;
  pool?: () => [number, number, number, number];
  pools?: () => LampPool[];
  color?: [number, number, number];
  power?: number;
}

/** 常用的灯色（乘子）：暖白（球场泛光灯）、暖黄（灯串、门廊、窗里透出来的）、水下灯的青 */
export const LAMP_WARM: [number, number, number] = [0.68, 0.64, 0.5];
export const LAMP_AMBER: [number, number, number] = [0.8, 0.68, 0.5];
export const LAMP_AQUA: [number, number, number] = [0.42, 0.78, 0.84];
/** 冷白（候车亭的灯管） */
export const LAMP_COOL: [number, number, number] = [0.7, 0.76, 0.74];

/**
 * 给资产接夜灯（一行）：root.userData.night = nightLight(root, { glow, spots })。
 * - glow：[网格, 白天的材质, 亮着的材质]（开灯时换材质；亮着的材质带 emissive）；
 * - spots：光斑，位置是 root 的本地坐标 [x, y, z]（y 不用，写 0）、半径、照到的高度（本地 y，默认 3.2）、颜色、强度。
 * 物件转了、缩放了、挪了都跟着走（每帧取世界矩阵）。
 */
export function nightLight(
  root: THREE.Object3D,
  o: {
    glow?: [THREE.Mesh, THREE.Material, THREE.Material][];
    spots?: { at: [number, number, number]; r: number; h?: number; c?: [number, number, number]; k?: number }[];
    onSet?: (on: boolean) => void;
  },
): NightLight {
  const v = new THREE.Vector3();
  const out: LampPool[] = (o.spots ?? []).map((s) => ({ x: 0, z: 0, r: s.r, h: 0, c: s.c ?? LAMP_AMBER, k: s.k }));
  return {
    setOn(on) {
      for (const [mesh, off, lit] of o.glow ?? []) mesh.material = on ? lit : off;
      o.onSet?.(on);
    },
    pools: o.spots
      ? () => {
          root.updateWorldMatrix(true, false);
          const sc = root.getWorldScale(v).x;
          (o.spots ?? []).forEach((s, i) => {
            v.set(s.at[0], 0, s.at[2]).applyMatrix4(root.matrixWorld);
            const p = out[i];
            p.x = v.x;
            p.z = v.z;
            p.r = s.r * sc;
            p.h = v.y + (s.h ?? 3.2) * sc;
          });
          return out;
        }
      : undefined,
  };
}
