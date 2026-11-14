// 换装（dress.ts）：在 node 里建真的 Q 版人（不渲染），dress 之后看部件的材质、可见性、网格数。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CastLook } from '../cast/types';
import { PAL } from '../render/palette';
import type { Mats, ToonOpts } from '../render/toon';
import { createDresser, ownMeshCount } from './dress';
import { ballKid, coach, kid, player, umpire } from './index';

/** 假的 Mats：同参数同一个材质（同 toon.ts 的缓存），材质上记下 ramp 好检查 */
function fakeMats(): Mats {
  const cache = new Map<string, THREE.Material>();
  return {
    toon(color, opts: ToonOpts = {}) {
      const key = JSON.stringify([color, opts]);
      let m = cache.get(key);
      if (!m) {
        m = new THREE.MeshBasicMaterial();
        m.userData.ramp = opts.ramp?.map((c) => new THREE.Color(c).getHex());
        cache.set(key, m);
      }
      return m as THREE.MeshToonMaterial;
    },
    prepare() {},
    gradient: new THREE.Texture(),
    globals: {} as Mats['globals'],
  };
}
const mats = fakeMats();
const ctxFor = (variant: number) =>
  ({
    mats,
    pal: PAL,
    // biome-ignore lint/suspicious/noExplicitAny: 测试里按名字查调色板
    mat: (key: any, extra?: ToonOpts) => mats.toon(0xffffff, { ramp: (PAL as any)[key].ramp, ...extra }),
    params: new URLSearchParams(),
    variant,
    rng: () => () => 0.5,
    uniforms: {},
    layers: { FX: 1 },
    texel: 0.09,
    // biome-ignore lint/suspicious/noExplicitAny: 只用到上面这些
  }) as any;

const LOOK: CastLook = {
  body: 'adult',
  skin: 'deep',
  hair: 'red',
  hairStyle: 'curly',
  shirt: 'lime',
  bottom: 'navy',
  bottomKind: 'pants',
  shoes: 'black',
  eyes: 'glasses',
  facial: 'beard',
  hat: { kind: 'visor', color: 'pink' },
  trim: 'white',
  height: 1.06,
  stout: 1.2,
};

const meshes = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh);
  });
  return out;
};
const byTag = (o: THREE.Object3D, tag: string) => meshes(o).filter((m) => m.userData.part === tag);
/** 几何体的样子（顶点数 + 包围盒），不看 uuid：rig 每个人自己建一份 */
const geoSig = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return [g.attributes.position.count, ...b.min.toArray(), ...b.max.toArray()].map((v) => v.toFixed(3)).join(',');
};
const rampOf = (m: THREE.Mesh) => (m.material as THREE.Material).userData.ramp as number[] | undefined;

describe('dress', () => {
  it('换了各部位的颜色、发型、帽子、配饰', () => {
    const p = player(ctxFor(0));
    const d = createDresser({ mats, scheme: null });
    d.dress(p, LOOK);
    expect(rampOf(byTag(p, 'skin-head')[0])?.[0]).toBe(0x7a4a34);
    expect(rampOf(byTag(p, 'shirt')[0])?.[0]).toBe(0xb8e05a);
    for (const m of byTag(p, 'sleeve')) expect(rampOf(m)?.[0]).toBe(0xb8e05a);
    // 长裤：腿是裤子色
    for (const m of byTag(p, 'leg')) expect(rampOf(m)?.[0]).toBe(0x3a4a8a);
    for (const m of byTag(p, 'thigh')) expect(rampOf(m)?.[0]).toBe(0x3a4a8a);
    for (const m of byTag(p, 'shoe')) expect(rampOf(m)?.[0]).toBe(0x3a3444);
    // 眼睛永远是 EYE
    for (const m of byTag(p, 'eye')) expect(rampOf(m)?.[0]).toBe(0x3a2c3a);
    const own = (k: string) => byTag(p, `dress:${k}`)[0];
    expect(own('hair').visible).toBe(true);
    expect(rampOf(own('hair'))?.[0]).toBe(0xe0703c);
    expect(rampOf(own('hat'))?.[0]).toBe(0xf6a2b8);
    expect(own('frame').visible).toBe(true);
    expect(own('facial').visible).toBe(true);
    expect(own('trim').visible).toBe(true);
    expect(p.scale.x).toBeCloseTo(1.06);
    expect(ownMeshCount(p)).toBeLessThanOrEqual(8);
  });

  it('反复 dress 幂等：网格数不涨，结果和直接 dress 一样', () => {
    const d = createDresser({ mats, scheme: null });
    const a = player(ctxFor(1));
    const b = player(ctxFor(1));
    const other: CastLook = {
      body: 'adult',
      skin: 'pale',
      hair: 'blonde',
      hairStyle: 'bun',
      shirt: 'coral',
      bottom: 'white',
      bottomKind: 'skirt',
      shoes: 'white',
      eyes: 'shades',
      hat: { kind: 'straw', color: 'khaki' },
    };
    d.dress(a, LOOK);
    d.dress(a, other);
    const n1 = meshes(a).length;
    d.dress(a, LOOK);
    d.dress(a, other);
    expect(meshes(a).length).toBe(n1);
    d.dress(b, other);
    const sig = (o: THREE.Object3D) =>
      meshes(o)
        .filter((m) => m.visible && m.userData.part)
        .map((m) => `${m.userData.part}:${(m.material as THREE.Material).uuid}:${geoSig(m.geometry)}`)
        .sort();
    // 自己建的网格 a 多（之前的样子用过），但看得见的部件、材质、几何体一样
    expect(sig(a).filter((s) => !s.includes('frame') && !s.includes('facial') && !s.includes('trim'))).toEqual(sig(b));
    expect(a.scale.x).toBeCloseTo(1);
    // 帽子是草帽：rig 的棒球帽藏着
    for (const m of [...byTag(a, 'cap'), ...byTag(a, 'bill')]) expect(m.visible).toBe(false);
  });

  it('网格数不随 dress 次数涨', () => {
    const d = createDresser({ mats, scheme: null });
    const p = coach(ctxFor(0));
    d.dress(p, LOOK);
    const n = meshes(p).length;
    for (let i = 0; i < 5; i++) d.dress(p, { ...LOOK, hairStyle: i % 2 ? 'braids' : 'long' });
    d.dress(p, LOOK);
    expect(meshes(p).length).toBe(n);
  });

  it('keep 保留场景原样', () => {
    const d = createDresser({ mats, scheme: null });
    const p = coach(ctxFor(0));
    const shirt0 = byTag(p, 'shirt')[0].material;
    const whistle = byTag(p, 'whistle')[0];
    d.dress(p, { ...LOOK, keep: ['shirt', 'trim', 'whistle'] });
    expect(byTag(p, 'shirt')[0].material).toBe(shirt0);
    expect(whistle.visible).toBe(true);
    for (const m of byTag(p, 'trim')) expect(m.material).toBe(shirt0);
    // 不 keep 哨子：藏
    d.dress(p, LOOK);
    expect(whistle.visible).toBe(false);
    expect(byTag(p, 'shirt')[0].material).not.toBe(shirt0);
    // 球童的制服
    const bk = ballKid(ctxFor(0));
    const cap0 = byTag(bk, 'cap')[0];
    const capMat = cap0.material;
    const bot0 = byTag(bk, 'bottom')[0].material;
    d.dress(bk, { ...LOOK, body: 'teen', keep: ['shirt', 'bottom', 'shoes', 'hat'] });
    expect(cap0.visible).toBe(true);
    expect(cap0.material).toBe(capMat);
    expect(byTag(bk, 'bottom')[0].material).toBe(bot0);
    expect(byTag(bk, 'dress:hat').length === 0 || !byTag(bk, 'dress:hat')[0].visible).toBe(true);
  });

  it('孩子不被改成大人；undress 回到原样', () => {
    const d = createDresser({ mats, scheme: null });
    const k = kid(ctxFor(0));
    const s0 = k.scale.clone();
    const head0 = byTag(k, 'skin-head')[0].material;
    d.dress(k, { ...LOOK, body: 'adult', height: 1.08 });
    expect(k.scale.equals(s0)).toBe(true);
    expect(k.userData.strideK).toBeLessThan(1);
    d.undress?.(k);
    expect(byTag(k, 'skin-head')[0].material).toBe(head0);
    for (const m of meshes(k)) if (String(m.userData.part).startsWith('dress:')) expect(m.visible).toBe(false);
    // 裁判（坐高椅）不改身高
    const u = umpire(ctxFor(0));
    d.dress(u, { ...LOOK, height: 1.08 });
    expect(u.scale.x).toBe(1);
  });

  it('不是人的对象原样不动', () => {
    const d = createDresser({ mats, scheme: null });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    expect(() => d.dress(g, LOOK)).not.toThrow();
    expect(meshes(g).length).toBe(1);
  });
});
