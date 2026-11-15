// clubbuild 的设施（演出）：模拟里每个摆下的设施一个模型（kit.makeAsset：有画好的用画好的，没有用灰盒）。
// 建造中：脚手架 + 模型从地块里慢慢升上来（按模拟的 build 进度，演出不决定什么时候建好）；建好那一下弹一下、冒一圈尘土。
// 步道不是一个个模型：所有步道格合成一个网格（lot.ts buildPaths），步道变了就重建。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../clubsite/render/geo';
import { BY_ID, TILE } from './catalog';
import type { AssetCtx } from './ctx';
import type { Kit } from './kit';
import { buildPaths } from './lot';
import { footprint, type Placed, placedCenter, type State } from './sim';

interface Piece {
  uid: number;
  id: string;
  /** 外层：位置、朝向；里层 model：升起来 */
  wrap: THREE.Group;
  model: THREE.Object3D;
  h: number;
  scaffold: THREE.Object3D | null;
  built: boolean;
  /** 建好后弹一下（秒） */
  pop: number;
  updaters: ((dt: number, t: number) => void)[];
}

interface Dust {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
}

export class Pieces {
  readonly root = new THREE.Group();
  private map = new Map<number, Piece>();
  private paths: THREE.Object3D | null = null;
  private pathKey = '';
  private dust: Dust[] = [];
  private dustGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  private dustMat = new THREE.MeshBasicMaterial({ color: 0xf0d6a8 });
  private ctx: AssetCtx;

  constructor(
    private kit: Kit,
    /** 场景开始时已经建好的不播建造动画 */
    private instant = true,
  ) {
    this.root.name = 'pieces';
    this.ctx = kit.ctxFor(0);
  }

  get(uid: number): Piece | undefined {
    return this.map.get(uid);
  }

  /** 每帧：对上模拟状态（新摆的、拆掉的、建造进度） */
  sync(state: State, dt: number, t: number) {
    // 步道
    const tiles = state.placed.filter((p) => p.id === 'path').map((p) => [p.col, p.row] as [number, number]);
    const key = tiles.map(([c, r]) => `${c},${r}`).join(';');
    if (key !== this.pathKey) {
      this.pathKey = key;
      if (this.paths) {
        this.root.remove(this.paths);
        this.paths.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      }
      this.paths = buildPaths(this.ctx, tiles);
      this.root.add(this.paths);
    }
    // 设施
    const live = new Set<number>();
    for (const p of state.placed) {
      if (p.id === 'path') continue;
      live.add(p.uid);
      let pc = this.map.get(p.uid);
      if (!pc) {
        pc = this.add(p);
        if (this.instant && p.build >= 1) {
          pc.built = true;
          pc.scaffold?.removeFromParent();
          pc.scaffold = null;
        }
      }
      const e = easeOut(p.build);
      pc.model.position.y = -(pc.h + 0.3) * (1 - e);
      if (p.build >= 1 && !pc.built) {
        pc.built = true;
        pc.pop = 0.35;
        pc.scaffold?.removeFromParent();
        pc.scaffold = null;
        this.puff(p);
      }
      if (pc.scaffold) pc.scaffold.visible = p.build < 1;
      if (pc.pop > 0) {
        pc.pop = Math.max(0, pc.pop - dt);
        const k = pc.pop / 0.35;
        const s = 1 + Math.sin(k * Math.PI) * 0.08;
        pc.model.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      }
      for (const u of pc.updaters) u(dt, t);
    }
    this.instant = false;
    for (const [uid, pc] of this.map) {
      if (live.has(uid)) continue;
      pc.wrap.removeFromParent();
      this.map.delete(uid);
    }
    // 尘土
    for (const d of this.dust) {
      d.life -= dt;
      d.v.y -= 9 * dt;
      d.mesh.position.addScaledVector(d.v, dt);
      if (d.mesh.position.y < 0.05) {
        d.mesh.position.y = 0.05;
        d.v.multiplyScalar(0.6);
      }
      d.mesh.scale.setScalar(Math.max(0.01, d.life / 0.9));
      if (d.life <= 0) d.mesh.removeFromParent();
    }
    this.dust = this.dust.filter((d) => d.life > 0);
  }

  private add(p: Placed): Piece {
    const def = BY_ID[p.id];
    const wrap = new THREE.Group();
    wrap.name = `piece:${p.id}:${p.uid}`;
    const [x, z] = placedCenter(p);
    wrap.position.set(x, 0, z);
    wrap.rotation.y = (p.rot * Math.PI) / 2;
    const { obj } = this.kit.makeAsset(p.id, p.uid % 3);
    const model = new THREE.Group();
    model.add(obj);
    wrap.add(model);
    const bb = new THREE.Box3().setFromObject(obj);
    const h = Math.max(0.3, bb.max.y);
    const updaters: Piece['updaters'] = [];
    obj.traverse((c) => {
      const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
      if (u) updaters.push(u);
    });
    const scaffold = this.scaffold(def.w * TILE, def.d * TILE, Math.min(6, Math.max(1.4, h)));
    wrap.add(scaffold);
    this.root.add(wrap);
    const pc: Piece = { uid: p.uid, id: p.id, wrap, model, h, scaffold, built: false, pop: 0, updaters };
    this.map.set(p.uid, pc);
    return pc;
  }

  /** 脚手架：四角立杆 + 两圈横杆（木头），合并成一个网格 */
  private scaffold(w: number, d: number, h: number): THREE.Object3D {
    const parts: THREE.BufferGeometry[] = [];
    const t = 0.16;
    const x0 = -w / 2 + 0.3;
    const x1 = w / 2 - 0.3;
    const z0 = -d / 2 + 0.3;
    const z1 = d / 2 - 0.3;
    for (const x of [x0, x1]) for (const z of [z0, z1]) parts.push(box(t, h, t, x, 0, z));
    for (const y of [h * 0.5, h - t]) {
      parts.push(box(x1 - x0, t, t, 0, y, z0), box(x1 - x0, t, t, 0, y, z1));
      parts.push(box(t, t, z1 - z0, x0, y, 0), box(t, t, z1 - z0, x1, y, 0));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), this.ctx.mat('timber'));
    this.ctx.mats.prepare(mesh);
    mesh.name = 'scaffold';
    return mesh;
  }

  /** 建好时一圈尘土（FX 图层：不描边） */
  private puff(p: Placed) {
    const [cx, cz] = placedCenter(p);
    const { w, d } = footprint(BY_ID[p.id], p.rot);
    const n = Math.min(18, 6 + w * d);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const m = new THREE.Mesh(this.dustGeo, this.dustMat);
      m.layers.set(1);
      const rx = (w * TILE) / 2;
      const rz = (d * TILE) / 2;
      m.position.set(cx + Math.cos(a) * rx * 0.9, 0.3, cz + Math.sin(a) * rz * 0.9);
      this.root.add(m);
      this.dust.push({
        mesh: m,
        v: new THREE.Vector3(Math.cos(a) * 3, 3 + (i % 3), Math.sin(a) * 3),
        life: 0.9,
      });
    }
  }

  /** 设施占地中心上方一点（飘字、"没有路"的位置） */
  topOf(p: Placed): THREE.Vector3 {
    const [x, z] = placedCenter(p);
    const pc = this.map.get(p.uid);
    return new THREE.Vector3(x, Math.min(6, (pc?.h ?? 2) + 0.6), z);
  }
}

function easeOut(x: number): number {
  const k = Math.min(1, Math.max(0, x));
  return 1 - (1 - k) ** 3;
}
