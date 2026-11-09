// 人造物件：球网、围栏（铁丝网 + 挡风布 + 吊着的门）、场边家具、灯杆、遮阳棚、招牌、路缘石。
// 按材质类合并（每类一套手挑三档 ramp）：实体每类一个网格；挡风布、帆布各一个（CPU 顶点动画）；铁丝网、球网各一个（镂空，FX 图层）；门两三个。
import * as THREE from 'three';
import type { Build } from '../world';
import { ClothBatch } from './structures/cloth';
import { buildFence } from './structures/fence';
import { buildFurniture } from './structures/furniture';
import { Bag } from './structures/kit';
import { buildNet } from './structures/net';
import { chainLinkTexture, netTexture } from './structures/textures';

type Ramp = [number, number, number];
// 薄布：不接收投影（双面薄片自己投到自己会起麻点）
const FABRIC = { edge: 0.4, convex: 0.2, noShadowReceive: true };

export const build: Build = (w) => {
  const rnd = w.rng('structures:build');
  const root = new THREE.Group();
  root.name = 'structures';

  const fabric = (ramp: Ramp) => w.mats.toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide, ramp, ...FABRIC });
  const screenMat = fabric([0x4f7060, 0x3a5450, 0x2a3a48]);
  const sailMat = fabric([0xece0c0, 0xc4ac98, 0x7e6c88]);
  const seeThrough = (tex: THREE.Texture, ramp: Ramp) => {
    const m = w.mats.toon(0xffffff, {
      vertexColors: true,
      alphaMap: tex,
      side: THREE.DoubleSide,
      ramp,
      edge: 0.4,
      convex: 0,
    });
    m.transparent = true;
    m.depthWrite = false;
    return m;
  };
  const linkMat = seeThrough(chainLinkTexture(), [0xb8b8b4, 0x8c8a96, 0x5a5a74]);
  const netMat = seeThrough(netTexture(), [0x4a4640, 0x36323a, 0x22202e]);

  const bag = new Bag(w.mats, rnd);
  const links = new ClothBatch();
  const cloth = new ClothBatch();
  const sail = new ClothBatch();
  const net = new ClothBatch();

  const fence = buildFence({
    bag,
    links,
    cloth,
    rnd,
    makeBag: () => new Bag(w.mats, rnd),
    linkMat,
    fxLayer: w.layers.FX,
  });
  buildNet(bag, net, rnd);
  buildFurniture(bag, sail, rnd);

  const solid = bag.group();
  const clothMesh = cloth.build(screenMat);
  clothMesh.name = 'structures:windscreens';
  const sailMesh = sail.build(sailMat);
  sailMesh.name = 'structures:sail';
  const linkMesh = links.build(linkMat);
  linkMesh.name = 'structures:links';
  const netMesh = net.build(netMat);
  netMesh.name = 'structures:net';
  for (const m of [clothMesh, sailMesh, netMesh]) m.frustumCulled = false;
  root.add(solid, clothMesh, sailMesh, fence.gate);
  w.mats.prepare(root);
  clothMesh.receiveShadow = false;
  sailMesh.receiveShadow = false;
  // 镂空的网不进描边、不投影（细格子投影会闪）
  for (const m of [linkMesh, netMesh]) {
    m.layers.set(w.layers.FX);
    m.castShadow = false;
    m.receiveShadow = true;
    m.renderOrder = 1;
    root.add(m);
  }
  fence.gate.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.layers.isEnabled(w.layers.FX)) o.castShadow = false;
  });
  w.scene.add(root);

  const u = w.uniforms;
  return {
    update(_dt, t) {
      cloth.update(t, u.uWind.value, u.uGust.value);
      sail.update(t, u.uWind.value, u.uGust.value);
      net.update(t, u.uWind.value, u.uGust.value);
      fence.update(t, u.uWind.value);
    },
  };
};
