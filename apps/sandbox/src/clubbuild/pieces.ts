// clubbuild 的设施（演出）：模拟里每个摆下的设施一个模型（kit.makeAsset：有画好的用画好的，没有用灰盒）。
// 建造中：脚手架 + 模型从地块里慢慢升上来（按模拟的 build 进度，演出不决定什么时候建好）；建好那一下弹一下、冒一圈尘土。
// 步道不是一个个模型：所有步道格合成一个网格（lot.ts buildPaths），步道变了就重建。
// 美术 r1：脚手架杆 0.32 米（2 纹素，0.16 在 0.149 米/纹素下断断续续）、球场类只搭 1.4 米高、四面一圈蓝白相间的工地围挡，整件不投影（一圈虚线影子）。
// GhostFx（pieces.ghost）：摆放中的占地框 —— 半透明色块 + 一圈 0.3 米宽的不透明边框（模型盖不住），放不下时变红 0xff6a5a。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coach } from '../clubsite/people';
import type { BaseCtx } from '../clubsite/render/ctx';
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
  /** 现在挂着的等级装饰是几级（1 = 没有） */
  lv: number;
  deco: THREE.Object3D | null;
  /** 球场灯（模型里 userData.night 的物件，原来的 night 接口存在这里）；lit = 现在是不是开着夜间照明 */
  lamps: { obj: THREE.Object3D; night: NightLight }[];
  lit: boolean | null;
  /** 场边的教练（Placed.coach） */
  coach: THREE.Object3D | null;
  /** 模型里有没有夜里亮的东西（userData.night） */
  hasNight: boolean;
  /** 模型的 userData.setOccupancy（看台）和上次给的值 */
  setOcc: ((k: number) => void) | null;
  occ: number;
}

interface NightLight {
  setOn?: (on: boolean) => void;
  pool?: () => [number, number, number, number];
}
/** 模拟以后会有的字段（sim 还没加时按 undefined 处理） */
type PlacedExtra = Placed & { lights?: boolean; coach?: unknown };

interface Dust {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
}

/**
 * 摆放中的占地框（FX 图层：不描边、不投影）：半透明色块（y 0.06、透明度 0.55）+ 一圈 0.3 米宽的不透明边框（y 0.08），
 * 鬼影模型浮在上面也盖不住边框。能放 = 绿 0x5fd068，放不下 = 红 0xff6a5a（setGhostValid）。
 * 用法（game.ts）：pieces.ghost.show(中心 x, z, 宽米, 深米)；pieces.setGhostValid(ok)；不摆了 pieces.ghost.hide()。
 */
export class GhostFx {
  readonly root = new THREE.Group();
  private fill: THREE.Mesh;
  private frame: THREE.Mesh[] = [];
  private fillMat = new THREE.MeshBasicMaterial({
    color: 0x5fd068,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  private frameMat = new THREE.MeshBasicMaterial({ color: 0x5fd068, depthWrite: false });
  static readonly OK = 0x5fd068;
  static readonly BAD = 0xff6a5a;
  /** 边框宽（米） */
  static readonly BORDER = 0.3;

  constructor() {
    this.root.name = 'ghost-fx';
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.fill = new THREE.Mesh(plane, this.fillMat);
    this.fill.renderOrder = 3;
    this.fill.layers.set(1);
    this.root.add(this.fill);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(plane, this.frameMat);
      m.renderOrder = 4;
      m.layers.set(1);
      this.frame.push(m);
      this.root.add(m);
    }
    this.root.visible = false;
  }

  /** 摆在占地中心 (x, z)，w × d 米（边框画在占地里面那一圈） */
  show(x: number, z: number, w: number, d: number) {
    const b = GhostFx.BORDER;
    this.root.visible = true;
    this.fill.position.set(x, 0.06, z);
    this.fill.scale.set(w, 1, d);
    const [n, s, wv, e] = this.frame;
    n.position.set(x, 0.08, z - d / 2 + b / 2);
    n.scale.set(w, 1, b);
    s.position.set(x, 0.08, z + d / 2 - b / 2);
    s.scale.set(w, 1, b);
    wv.position.set(x - w / 2 + b / 2, 0.08, z);
    wv.scale.set(b, 1, d - 2 * b);
    e.position.set(x + w / 2 - b / 2, 0.08, z);
    e.scale.set(b, 1, d - 2 * b);
  }

  setValid(ok: boolean) {
    const c = ok ? GhostFx.OK : GhostFx.BAD;
    this.fillMat.color.setHex(c);
    this.frameMat.color.setHex(c);
  }

  hide() {
    this.root.visible = false;
  }
}

export class Pieces {
  readonly root = new THREE.Group();
  /** 摆放中的占地框（见 GhostFx） */
  readonly ghost = new GhostFx();
  /**
   * 场景里带 userData.night 的东西（球场灯、塔可车的光圈）加了 / 拆了 / 开关了就 +1：
   * clubsite/daylight 只在 rescanLamps() 时找灯（tspeed 0 时 step 不跑），game.ts 看到它变了调一次 daylight.rescanLamps()
   */
  lampsVersion = 0;
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
    this.root.add(this.ghost.root);
  }

  /** 占地框能不能放（绿 / 红 0xff6a5a） */
  setGhostValid(ok: boolean) {
    this.ghost.setValid(ok);
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
    // 每个设施这会儿有几位客人在里面（看台的观众头用）
    const occ = new Map<number, number>();
    for (const v of state.visitors) {
      if (v.stage !== 'stay') continue;
      const u = v.stops[v.i];
      occ.set(u, (occ.get(u) ?? 0) + 1);
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
      // 看台这类有 setOccupancy 的：坐满多少
      const setOcc = pc.setOcc;
      if (setOcc) {
        const k = p.build >= 1 ? (occ.get(p.uid) ?? 0) / Math.max(1, BY_ID[p.id].cap) : 0;
        if (k !== pc.occ) {
          pc.occ = k;
          setOcc(k);
        }
      }
      // 等级：Lv2 / Lv3 的装饰（建好以后才挂；升级那一下弹一下、冒尘土）
      const lv = p.build >= 1 ? (p.lv ?? 1) : 1;
      if (lv !== pc.lv) this.setLevel(pc, p, lv);
      // 夜间照明：只有装了灯的球场天黑开灯
      const px = p as PlacedExtra;
      const lit = !!px.lights && p.build >= 1;
      if (lit !== pc.lit) this.setLit(pc, lit);
      // 教练：站在场边
      const hasCoach = !!px.coach && p.build >= 1;
      if (hasCoach !== !!pc.coach) this.setCoach(pc, p, hasCoach);
    }
    this.instant = false;
    for (const [uid, pc] of this.map) {
      if (live.has(uid)) continue;
      if (pc.hasNight) this.lampsVersion++;
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
    const scaffold = this.scaffold(
      def.w * TILE,
      def.d * TILE,
      def.cat === 'court' ? 1.4 : Math.min(6, Math.max(1.4, h)),
    );
    wrap.add(scaffold);
    this.root.add(wrap);
    let hasNight = false;
    obj.traverse((c) => {
      if (c.userData.night) hasNight = true;
    });
    if (hasNight) this.lampsVersion++;
    // 球场灯：night 接口换成看 Placed.lights 的那一层（setLit）
    const lamps: Piece['lamps'] = [];
    if (def.cat === 'court')
      obj.traverse((c) => {
        const n = c.userData.night as NightLight | undefined;
        if (n) lamps.push({ obj: c, night: n });
      });
    const pc: Piece = {
      uid: p.uid,
      id: p.id,
      wrap,
      model,
      h,
      scaffold,
      built: false,
      pop: 0,
      updaters,
      lv: 1,
      deco: null,
      lamps,
      lit: null,
      coach: null,
      hasNight,
      setOcc: (obj.userData.setOccupancy as ((k: number) => void) | undefined) ?? null,
      occ: -1,
    };
    this.map.set(p.uid, pc);
    return pc;
  }

  /**
   * 脚手架：四角立杆 + 一圈顶上的横杆（木头，0.32 米 = 2 纹素）+ 四面 1.1 米高的工地围挡（每 1.5 米一幅，俱乐部蓝 / 白轮着）。
   * 整件不投影、不接投影（细杆的毛边影子是一圈虚线；围挡是朝镜头的薄片）。
   */
  private scaffold(w: number, d: number, h: number): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'scaffold';
    const poles: THREE.BufferGeometry[] = [];
    const t = 0.32;
    const x0 = -w / 2 + 0.3;
    const x1 = w / 2 - 0.3;
    const z0 = -d / 2 + 0.3;
    const z1 = d / 2 - 0.3;
    for (const x of [x0, x1]) for (const z of [z0, z1]) poles.push(box(t, h, t, x, 0, z));
    if (h > 1.6) {
      const y = h - t;
      poles.push(box(x1 - x0, t, t, 0, y, z0), box(x1 - x0, t, t, 0, y, z1));
      poles.push(box(t, t, z1 - z0, x0, y, 0), box(t, t, z1 - z0, x1, y, 0));
    }
    const pm = new THREE.Mesh(mergeGeometries(poles), this.ctx.mat('timber', { lightUp: 0.45, noShadowReceive: true }));
    pm.name = 'scaffold:poles';
    g.add(pm);
    // 围挡：沿四边一幅幅（0.08 厚），蓝白轮着
    const blue: THREE.BufferGeometry[] = [];
    const white: THREE.BufferGeometry[] = [];
    const HH = 1.1;
    const P = 1.5;
    const side = (ax: number, az: number, bx: number, bz: number) => {
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / P));
      for (let i = 0; i < n; i++) {
        const u0 = i / n;
        const u1 = (i + 1) / n;
        const cx = ax + (bx - ax) * ((u0 + u1) / 2);
        const cz = az + (bz - az) * ((u0 + u1) / 2);
        const len = L / n;
        const gg = az === bz ? box(len, HH, 0.08, cx, 0.05, cz) : box(0.08, HH, len, cx, 0.05, cz);
        (i % 2 ? white : blue).push(gg);
      }
    };
    side(x0, z0, x1, z0);
    side(x0, z1, x1, z1);
    side(x0, z0, x0, z1);
    side(x1, z0, x1, z1);
    const cloth = {
      lightUp: 0.55,
      bands: [-0.45, 0.35] as [number, number],
      noShadowReceive: true,
      edge: 0.4,
      convex: 0.1,
    };
    const bm = new THREE.Mesh(mergeGeometries(blue), this.ctx.mat('canvasStripe', cloth));
    bm.name = 'scaffold:hoard-b';
    const wm = new THREE.Mesh(mergeGeometries(white), this.ctx.mat('clothWhite', cloth));
    wm.name = 'scaffold:hoard-w';
    g.add(bm, wm);
    this.ctx.mats.prepare(g, { cast: false, receive: false });
    return g;
  }

  /**
   * 球场灯开不开。night 接口一直挂着（daylight 只在 rescanLamps 时找 userData.night），里面看 pc.lit：
   * 没装灯 = setOn 永远关、pool 是一个半径 0、放在很远处的圈（排序排在最后，不占离镜头最近的 LAMP_N 个位置）。
   */
  private setLit(pc: Piece, lit: boolean) {
    pc.lit = lit;
    for (const l of pc.lamps) {
      if (!l.obj.userData.nightWrapped) {
        const orig = l.night;
        let want = false;
        l.obj.userData.night = {
          setOn: (on: boolean) => {
            want = on;
            orig.setOn?.(on && !!pc.lit);
          },
          pool: (): [number, number, number, number] => (pc.lit && orig.pool ? orig.pool() : [1e5, 1e5, 0, 0]),
        } satisfies NightLight;
        l.obj.userData.nightWrapped = true;
        l.obj.userData.nightWant = () => want;
      }
      const want = (l.obj.userData.nightWant as () => boolean)();
      l.night.setOn?.(want && lit);
    }
    this.lampsVersion++;
  }

  /**
   * 场边的教练（clubsite/people 的 coach：红帽 + 深紫 Polo，一眼和客人分开）：站在占地西边线外、网前一点，面朝场内，播喂球（feed）。
   * 挂在 wrap 上（跟着设施转），和客人一样 ×1.35、不投太阳影、脚下一块团影。
   */
  private setCoach(pc: Piece, p: Placed, on: boolean) {
    if (pc.coach) {
      pc.coach.removeFromParent();
      pc.updaters = pc.updaters.filter((u) => u !== pc.coach?.userData.tick);
      pc.coach = null;
    }
    if (!on) return;
    const def = BY_ID[p.id];
    const W = def.w * TILE;
    const D = def.d * TILE;
    const ctx = { ...this.ctx, variant: p.uid % 2, params: new URLSearchParams() } as unknown as BaseCtx;
    const o = coach(ctx);
    o.scale.setScalar(1.35);
    o.position.set(-W / 2 + Math.min(1.7, W * 0.12), 0, Math.min(4, D * 0.12));
    o.rotation.y = Math.PI / 2;
    o.traverse((c) => {
      c.castShadow = false;
    });
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2).scale(0.36, 1, 0.24),
      this.blobMat,
    );
    blob.position.y = 0.03 / 1.35;
    blob.layers.set(1);
    o.add(blob);
    (o.userData.pose as ((n: string) => void) | undefined)?.('feed');
    const tick = (dt: number) => (o.userData.update as ((dt: number) => void) | undefined)?.(dt);
    o.userData.tick = tick;
    pc.updaters.push(tick);
    pc.wrap.add(o);
    pc.coach = o;
  }
  private blobMat = new THREE.MeshBasicMaterial({
    color: 0x2a1838,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });

  /**
   * 等级装饰（开罗式"升级看得见"）：挂在 wrap 上（不跟着建造升降），占地的本地坐标（rot 0 的 w × d，wrap 负责转）。
   * - Lv2：东北角一根 3.6 米的旗杆 + 俱乐部蓝 / 黄的燕尾旗；正面西角一块朝镜头的金星牌（0.9 米，立在矮柱上）。
   * - Lv3：再加西北角一面红旗、星牌换成两颗星；占地一圈 0.25 米宽的金色压边（地上一圈亮金线 = "最高级"）。
   * 杆 0.3 米（2 纹素），旗、星不接投影；旗杆投影（太阳影子里一根旗杆读得出来）。
   */
  private setLevel(pc: Piece, p: Placed, lv: number) {
    if (pc.deco) {
      pc.deco.removeFromParent();
      pc.deco.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      pc.deco = null;
    }
    const was = pc.lv;
    pc.lv = lv;
    const def = BY_ID[p.id];
    // 只给接客的设施（球场、店、会所……）；步道、装饰、地形不挂
    if (lv < 2 || !def || def.cap <= 0 || def.cat === 'road' || def.cat === 'deco' || (def.cat as string) === 'terrain')
      return;
    const ctx = this.ctx;
    const w = def.w * TILE;
    const d = def.d * TILE;
    const g = new THREE.Group();
    g.name = `level:${lv}`;
    const poles: THREE.BufferGeometry[] = [];
    const flagG: Record<string, THREE.BufferGeometry[]> = {};
    const addFlag = (key: string, gg: THREE.BufferGeometry) => {
      const n = gg.index ? gg.toNonIndexed() : gg;
      for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal') n.deleteAttribute(a);
      flagG[key] ??= [];
      flagG[key].push(n);
    };
    const flag = (x: number, z: number, a: string, b: string) => {
      const H = 3.6;
      poles.push(box(0.3, H, 0.3, x, 0, z));
      // 燕尾旗：两块三角（朝镜头，往西飘），上下两色
      const tri = (pts: number[]) => {
        const gg = new THREE.BufferGeometry();
        gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        gg.computeVertexNormals();
        return gg;
      };
      addFlag(a, tri([x, H, z + 0.05, x - 1.5, H - 0.1, z + 0.05, x, H - 0.45, z + 0.05]));
      addFlag(b, tri([x, H - 0.45, z + 0.05, x - 1.5, H - 0.9, z + 0.05, x, H - 0.9, z + 0.05]));
    };
    flag(w / 2 - 0.35, -d / 2 + 0.35, 'counter', 'flowerYellow');
    if (lv >= 3) flag(-w / 2 + 0.35 + 1.5, -d / 2 + 0.35, 'clothRed', 'clothWhite');
    // 金星牌：前沿西角，矮柱 + 往后仰的星（五角星，0.9 米）
    const star = (cx: number, cy: number, r: number) => {
      const sh = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        if (i === 0) sh.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        else sh.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      return new THREE.ShapeGeometry(sh);
    };
    const sx = -w / 2 + 0.5;
    const sz = d / 2 - 0.4;
    poles.push(box(0.3, 1.0, 0.3, sx, 0, sz));
    const stars = lv >= 3 ? [star(-0.45, 0, 0.5), star(0.45, 0, 0.5)] : [star(0, 0, 0.55)];
    const starG = mergeGeometries(stars);
    starG.rotateX(-0.45).translate(sx + (lv >= 3 ? 0.45 : 0), 1.35, sz + 0.05);
    addFlag('flowerYellow', starG);
    const FACE = {
      lightUp: 0.7,
      bands: [-0.7, -0.2] as [number, number],
      noShadowReceive: true,
      edge: 0.45,
      convex: 0,
      side: THREE.DoubleSide,
    };
    const pm = new THREE.Mesh(
      mergeGeometries(poles),
      ctx.mat('metal', { lightUp: 0.5, convex: 0.3, noShadowReceive: true }),
    );
    pm.name = 'level:poles';
    g.add(pm);
    for (const [key, list] of Object.entries(flagG)) {
      const m = new THREE.Mesh(mergeGeometries(list), ctx.mat(key as 'counter', FACE));
      m.name = `level:${key}`;
      m.castShadow = false;
      g.add(m);
    }
    // Lv3：占地一圈金色压边
    if (lv >= 3) {
      const K = 0.25;
      const trim = [
        box(w, 0.1, K, 0, 0.02, -d / 2 + K / 2),
        box(w, 0.1, K, 0, 0.02, d / 2 - K / 2),
        box(K, 0.1, d - 2 * K, -w / 2 + K / 2, 0.02, 0),
        box(K, 0.1, d - 2 * K, w / 2 - K / 2, 0.02, 0),
      ];
      const tm = new THREE.Mesh(mergeGeometries(trim), ctx.mat('brass', { edge: 0.3, convex: 0.5 }));
      tm.name = 'level:trim';
      g.add(tm);
    }
    ctx.mats.prepare(g);
    pm.castShadow = true;
    for (const c of g.children) if (c !== pm) c.castShadow = false;
    pc.wrap.add(g);
    pc.deco = g;
    if (lv > was && !this.instant) {
      pc.pop = 0.35;
      this.puff(p);
    }
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
