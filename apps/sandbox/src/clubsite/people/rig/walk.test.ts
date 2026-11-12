// 走路的腿（rig.ts 的 walkLegs）：把真的 rig 摆过一个 walk 周期，身子按步幅往前挪，
// 量着地那只鞋的鞋底前后溜了多少、鞋底高度（着地脚 = 0，摆腿的脚不低于地面）。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BaseCtx } from '../../render/ctx';
import { buildPerson, type Look, strideOf, WALK_STRIDE } from './rig';

const mat = () => new THREE.MeshBasicMaterial();
const ctx = { params: new URLSearchParams(), mats: { prepare() {} } } as unknown as BaseCtx;
const look: Look = {
  skin: mat(),
  hair: mat(),
  shirt: mat(),
  bottom: mat(),
  bottomKind: 'shorts',
  shoes: mat(),
  hairStyle: 'short',
  hold: { kind: 'broom', wood: mat(), head: mat() },
};

/** 两只鞋的鞋底（世界坐标：最低点的 y、鞋中心的 z） */
function soles(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const out: { y: number; z: number }[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // 鞋：腿（hips 的孩子）下面的方盒子
    if (!m.isMesh || m.geometry.type !== 'BoxGeometry' || m.parent?.parent !== root.children[0]) return;
    const box = new THREE.Box3().setFromObject(m, true);
    out.push({ y: box.min.y, z: (box.min.z + box.max.z) / 2 });
  });
  return out;
}

function sweep(stride?: number) {
  const root = buildPerson(ctx, look, 'walker');
  root.userData.setProp(null);
  if (stride) root.userData.stride = stride;
  const len = strideOf(root);
  const N = 400;
  let slip = 0;
  let minY = Infinity;
  let maxStanceY = 0;
  let prev: { y: number; z: number }[] | null = null;
  for (let i = 0; i <= N; i++) {
    const ph = i / N;
    root.position.z = ph * len;
    root.userData.pose('walk', ph % 1);
    const s = soles(root);
    expect(s.length).toBe(2);
    const st = s[0].y <= s[1].y ? 0 : 1;
    minY = Math.min(minY, s[0].y, s[1].y);
    maxStanceY = Math.max(maxStanceY, Math.abs(s[st].y));
    // 同一只脚连续两帧都是着地脚：它在世界里不该动
    if (prev) {
      const pst = prev[0].y <= prev[1].y ? 0 : 1;
      if (pst === st) slip = Math.max(slip, Math.abs(s[st].z - prev[st].z));
    }
    prev = s;
  }
  return { slip, minY, maxStanceY, perFrame: len / N };
}

describe('走路的腿', () => {
  it('默认步幅 ≈ 0.92 米', () => {
    expect(WALK_STRIDE).toBeGreaterThan(0.9);
    expect(WALK_STRIDE).toBeLessThan(0.94);
  });
  for (const stride of [undefined, 1.3, 1.55]) {
    it(`步幅 ${stride ?? '默认'}：着地脚不溜、鞋底贴地、摆腿不扎地`, () => {
      const r = sweep(stride);
      // 每帧身子走 perFrame；脚溜的话每帧会差出同一个量级
      expect(r.slip).toBeLessThan(r.perFrame * 0.05);
      expect(r.maxStanceY).toBeLessThan(0.002);
      expect(r.minY).toBeGreaterThan(-0.002);
    });
  }
});
