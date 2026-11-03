/**
 * 把场景图画进 Raster：收集可画节点（Box、Sprite、Custom），按世界包围盒的占地做拓扑深度排序（样片的 drawSorted），
 * 逐个光栅。不碰 DOM（IsoView 和 node 里的测试都用它）。
 */
import type { Box, Custom, Mat, Node, Sprite } from './graph';
import { HV } from './proj';
import { faceF, type Raster } from './raster';

/** 一个排好序待画的节点 */
interface Drw {
  node: Node;
  rx0: number;
  rx1: number;
  rz0: number;
  rz1: number;
  y0: number;
  y1: number;
  sx0: number;
  sx1: number;
  sy0: number;
  sy1: number;
  /** 世界位置（Sprite / Custom 的锚点、灯光取样点） */
  wx: number;
  wy: number;
  wz: number;
  /** zcur：非平面像素的深度 */
  d: number;
  bias: number;
}

/* ---------- 方块的拓扑：角编号 bit0 = +x、bit1 = +y、bit2 = +z ---------- */

const FACES: readonly (readonly [number, number, number, number])[] = [
  [1, 3, 7, 5], // +x
  [0, 4, 6, 2], // -x
  [2, 3, 7, 6], // +y
  [0, 1, 5, 4], // -y
  [4, 5, 7, 6], // +z
  [0, 2, 3, 1], // -z
];
/** 每个面每条边相邻的面 */
const ADJ: number[][] = FACES.map((f, fi) =>
  f.map((a, e) => {
    const b = f[(e + 1) % 4] as number;
    return FACES.findIndex((g, gi) => gi !== fi && g.includes(a) && g.includes(b));
  }),
);

export class SceneDrawer {
  private pool: Drw[] = [];
  private list: Drw[] = [];
  private n = 0;
  // 方块用的暂存
  private cx = new Float64Array(8);
  private cy = new Float64Array(8);
  private cz = new Float64Array(8);
  private csx = new Float64Array(8);
  private csy = new Float64Array(8);
  private cd = new Float64Array(8);
  private fsp = new Float64Array(8);
  private fsd = new Float64Array(4);
  private nrm = new Float64Array(18);
  private visF = new Uint8Array(6);
  /** 画了多少个节点（性能读数） */
  drawn = 0;

  /**
   * 收集 root 下可见的可画节点并按深度排好序，返回个数。
   * updateMatrix = true 时先重算整棵树的世界矩阵。
   */
  collect(r: Raster, root: Node, updateMatrix = true): number {
    if (updateMatrix) root.updateMatrixWorld(false);
    this.n = 0;
    this.walk(r, root);
    this.sort();
    return this.n;
  }

  private walk(r: Raster, nd: Node): void {
    if (!nd.visible) return;
    if (nd.kind !== 'group') this.prep(r, nd);
    const ch = nd.children;
    for (let i = 0; i < ch.length; i++) this.walk(r, ch[i] as Node);
  }

  private take(): Drw {
    let d = this.pool[this.n];
    if (!d) {
      d = {
        node: null as unknown as Node,
        rx0: 0,
        rx1: 0,
        rz0: 0,
        rz1: 0,
        y0: 0,
        y1: 0,
        sx0: 0,
        sx1: 0,
        sy0: 0,
        sy1: 0,
        wx: 0,
        wy: 0,
        wz: 0,
        d: 0,
        bias: 0,
      };
      this.pool[this.n] = d;
    }
    return d;
  }

  private prep(r: Raster, nd: Node): void {
    const pr = r.proj;
    const m = nd.matrixWorld;
    const o = this.take();
    o.node = nd;
    o.bias = nd.renderOrder;
    o.wx = m[9] as number;
    o.wy = m[10] as number;
    o.wz = m[11] as number;
    const k = pr.k;
    if (nd.kind === 'sprite') {
      const s = nd as Sprite;
      const f = s.frame;
      if (!f || s.opacity <= 0) return;
      // 缩到几乎为零 = 藏起来
      if (Math.abs(m[4] as number) + Math.abs(m[3] as number) + Math.abs(m[5] as number) < 0.05) return;
      const sc = pr.spriteScale;
      const ax = pr.sx(o.wx, o.wz);
      const ay = pr.sy(o.wx, o.wy, o.wz);
      const ox = s.flipX ? f.w - f.ox : f.ox;
      o.sx0 = ax - ox * sc - 1;
      o.sx1 = ax + (f.w - ox) * sc + 1;
      o.sy0 = ay - f.oy * sc - 1;
      o.sy1 = ay + (f.h - f.oy) * sc + 1;
      const fp = 0.2;
      this.foot(r, o, o.wx - fp, o.wx + fp, o.wz - fp, o.wz + fp);
      o.y0 = o.wy;
      o.y1 = o.wy + (f.oy * sc) / (k * HV);
      o.d = pr.depth(o.wx, o.wz) + o.bias;
    } else {
      let lx0: number;
      let lx1: number;
      let ly0: number;
      let ly1: number;
      let lz0: number;
      let lz1: number;
      if (nd.kind === 'box') {
        const b = nd as Box;
        lx0 = -b.w / 2;
        lx1 = b.w / 2;
        ly0 = -b.h / 2;
        ly1 = b.h / 2;
        lz0 = -b.d / 2;
        lz1 = b.d / 2;
      } else {
        const bb = (nd as Custom).bounds;
        lx0 = bb.x0;
        lx1 = bb.x1;
        ly0 = bb.y0;
        ly1 = bb.y1;
        lz0 = bb.z0;
        lz1 = bb.z1;
      }
      let X0 = 1e9;
      let X1 = -1e9;
      let Y0 = 1e9;
      let Y1 = -1e9;
      let Z0 = 1e9;
      let Z1 = -1e9;
      for (let c = 0; c < 8; c++) {
        const x = c & 1 ? lx1 : lx0;
        const y = c & 2 ? ly1 : ly0;
        const z = c & 4 ? lz1 : lz0;
        const wx = (m[0] as number) * x + (m[3] as number) * y + (m[6] as number) * z + (m[9] as number);
        const wy = (m[1] as number) * x + (m[4] as number) * y + (m[7] as number) * z + (m[10] as number);
        const wz = (m[2] as number) * x + (m[5] as number) * y + (m[8] as number) * z + (m[11] as number);
        if (wx < X0) X0 = wx;
        if (wx > X1) X1 = wx;
        if (wy < Y0) Y0 = wy;
        if (wy > Y1) Y1 = wy;
        if (wz < Z0) Z0 = wz;
        if (wz > Z1) Z1 = wz;
      }
      this.foot(r, o, X0, X1, Z0, Z1);
      o.y0 = Y0;
      o.y1 = Y1;
      const pad = nd.kind === 'custom' ? 2 : 1;
      o.sx0 = pr.ox + (o.rx0 - o.rz1) * k - pad;
      o.sx1 = pr.ox + (o.rx1 - o.rz0) * k + pad;
      o.sy0 = pr.oy + (o.rx0 + o.rz0) * k * 0.5 - Y1 * k * HV - pad - 1;
      o.sy1 = pr.oy + (o.rx1 + o.rz1) * k * 0.5 - Y0 * k * HV + pad + 1;
      o.d = (o.rx0 + o.rx1 + o.rz0 + o.rz1) * 0.5 + o.bias;
    }
    if (o.sx1 < 0 || o.sx0 > r.W || o.sy1 < 0 || o.sy0 > r.H) return;
    this.n++;
  }

  /** 世界 xz 包围盒 → 转后的 rx / rz 范围 */
  private foot(r: Raster, o: Drw, x0: number, x1: number, z0: number, z1: number): void {
    const pr = r.proj;
    let rx0 = 1e9;
    let rx1 = -1e9;
    let rz0 = 1e9;
    let rz1 = -1e9;
    for (let c = 0; c < 4; c++) {
      const dx = (c & 1 ? x1 : x0) - pr.cx;
      const dz = (c & 2 ? z1 : z0) - pr.cz;
      const rx = pr.m0 * dx + pr.m1 * dz;
      const rz = pr.m2 * dx + pr.m3 * dz;
      if (rx < rx0) rx0 = rx;
      if (rx > rx1) rx1 = rx;
      if (rz < rz0) rz0 = rz;
      if (rz > rz1) rz1 = rz;
    }
    o.rx0 = rx0;
    o.rx1 = rx1;
    o.rz0 = rz0;
    o.rz1 = rz1;
  }

  /* ---------- 拓扑排序（样片的 cmpO + drawSorted） ---------- */

  private beh: number[][] = [];
  private stt = new Uint8Array(0);
  private order: number[] = [];
  private idx: number[] = [];

  private static cmp(a: Drw, b: Drw): number {
    const e = 1e-6;
    if (a.rx1 <= b.rx0 + e || a.rz1 <= b.rz0 + e) return -1;
    if (b.rx1 <= a.rx0 + e || b.rz1 <= a.rz0 + e) return 1;
    if (a.y1 <= b.y0 + e) return -1;
    if (b.y1 <= a.y0 + e) return 1;
    return a.rx0 + a.rx1 + a.rz0 + a.rz1 + a.bias * 2 - (b.rx0 + b.rx1 + b.rz0 + b.rz1 + b.bias * 2) < 0 ? -1 : 1;
  }

  private sort(): void {
    const n = this.n;
    const L = this.pool;
    const beh = this.beh;
    for (let i = 0; i < n; i++) {
      if (!beh[i]) beh[i] = [];
      (beh[i] as number[]).length = 0;
    }
    for (let i = 0; i < n; i++) {
      const a = L[i] as Drw;
      for (let j = i + 1; j < n; j++) {
        const b = L[j] as Drw;
        if (a.sx1 < b.sx0 || b.sx1 < a.sx0 || a.sy1 < b.sy0 || b.sy1 < a.sy0) continue;
        if (SceneDrawer.cmp(a, b) < 0) (beh[j] as number[]).push(i);
        else (beh[i] as number[]).push(j);
      }
    }
    if (this.stt.length < n) this.stt = new Uint8Array(n * 2);
    const stt = this.stt;
    stt.fill(0, 0, n);
    const order = this.order;
    order.length = 0;
    const idx = this.idx;
    idx.length = n;
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort((i, j) => (L[i] as Drw).rx0 + (L[i] as Drw).rz0 - ((L[j] as Drw).rx0 + (L[j] as Drw).rz0));
    // 迭代式 DFS（避免深递归）
    const stack: number[] = [];
    const pos: number[] = [];
    for (const s of idx) {
      if (stt[s]) continue;
      stt[s] = 1;
      stack.push(s);
      pos.push(0);
      while (stack.length) {
        const top = stack[stack.length - 1] as number;
        const bl = beh[top] as number[];
        const p = pos[pos.length - 1] as number;
        if (p < bl.length) {
          pos[pos.length - 1] = p + 1;
          const nx = bl[p] as number;
          if (!stt[nx]) {
            stt[nx] = 1;
            stack.push(nx);
            pos.push(0);
          }
        } else {
          stack.pop();
          pos.pop();
          order.push(top);
        }
      }
    }
    const list = this.list;
    list.length = 0;
    for (const i of order) list.push(L[i] as Drw);
  }

  /** collect 之后待画的节点数 */
  get size(): number {
    return this.list.length;
  }

  /** 按排好的顺序画（collect 之后调用）；from..to 只画其中一段（IsoView 分几帧烘焙静态层时用） */
  draw(r: Raster, from = 0, to = this.list.length): void {
    if (from === 0) this.drawn = 0;
    const list = this.list;
    const end = Math.min(to, list.length);
    for (let i = from; i < end; i++) {
      const o = list[i] as Drw;
      const nd = o.node;
      const lit = nd.lit ?? (r.night > 0 ? r.litFn(o.wx, o.wz) : 0);
      r.zcur = o.d;
      if (nd.kind === 'box') this.drawBox(r, nd as Box, lit);
      else if (nd.kind === 'sprite') {
        const s = nd as Sprite;
        if (s.frame)
          r.art(s.frame, o.wx, o.wy, o.wz, { flipX: s.flipX, lit, opacity: s.opacity, depth: o.d, xray: s.xray });
      } else (nd as Custom).draw(r, nd as Custom);
      this.drawn++;
    }
  }

  /** 方块：完整世界变换，投影 8 个角，画朝镜头的面，按世界法线明暗，顶边高光，太小的至少 1 像素 */
  private drawBox(r: Raster, b: Box, lit: number): void {
    const pr = r.proj;
    const m: Mat = b.matrixWorld;
    const { cx, cy, cz, csx, csy, cd, nrm, visF, fsp, fsd } = this;
    const hw = b.w / 2;
    const hh = b.h / 2;
    const hd = b.d / 2;
    let mnx = 1e9;
    let mxx = -1e9;
    let mny = 1e9;
    let mxy = -1e9;
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? hw : -hw;
      const y = c & 2 ? hh : -hh;
      const z = c & 4 ? hd : -hd;
      const wx = (m[0] as number) * x + (m[3] as number) * y + (m[6] as number) * z + (m[9] as number);
      const wy = (m[1] as number) * x + (m[4] as number) * y + (m[7] as number) * z + (m[10] as number);
      const wz = (m[2] as number) * x + (m[5] as number) * y + (m[8] as number) * z + (m[11] as number);
      cx[c] = wx;
      cy[c] = wy;
      cz[c] = wz;
      const sx = pr.sx(wx, wz);
      const sy = pr.sy(wx, wy, wz);
      csx[c] = sx;
      csy[c] = sy;
      cd[c] = pr.depth(wx, wz);
      if (sx < mnx) mnx = sx;
      if (sx > mxx) mxx = sx;
      if (sy < mny) mny = sy;
      if (sy > mxy) mxy = sy;
    }
    const st = b.style;
    const C = (hex: string, f: number) => (st.emissive ? r.em(hex, f) : r.col(hex, f, lit));
    // 太小：沿投影最长的局部轴画一条线，或一个点
    if (mxx - mnx < 1.5 || mxy - mny < 1.5) {
      const c = C(st.side ?? b.color, 0.85);
      let best = -1;
      let ax = 0;
      let ay = 0;
      let bx = 0;
      let by = 0;
      let ad = 0;
      let bd = 0;
      for (let a = 0; a < 3; a++) {
        const L = a === 0 ? hw : a === 1 ? hh : hd;
        const ux = (m[a * 3] as number) * L;
        const uy = (m[a * 3 + 1] as number) * L;
        const uz = (m[a * 3 + 2] as number) * L;
        const x0 = (m[9] as number) - ux;
        const y0 = (m[10] as number) - uy;
        const z0 = (m[11] as number) - uz;
        const x1 = (m[9] as number) + ux;
        const y1 = (m[10] as number) + uy;
        const z1 = (m[11] as number) + uz;
        const p0x = pr.sx(x0, z0);
        const p0y = pr.sy(x0, y0, z0);
        const p1x = pr.sx(x1, z1);
        const p1y = pr.sy(x1, y1, z1);
        const l = Math.hypot(p1x - p0x, p1y - p0y);
        if (l > best) {
          best = l;
          ax = p0x;
          ay = p0y;
          bx = p1x;
          by = p1y;
          ad = pr.depth(x0, z0);
          bd = pr.depth(x1, z1);
        }
      }
      if (st.outline && best >= 1) {
        const oc = r.col('#2a2238', 1, lit * 0.5);
        r.line(ax - 1, ay, bx - 1, by, oc, 1, undefined, ad, bd);
        r.line(ax + 1, ay, bx + 1, by, oc, 1, undefined, ad, bd);
        r.line(ax, ay - 1, bx, by - 1, oc, 1, undefined, ad, bd);
        r.line(ax, ay + 1, bx, by + 1, oc, 1, undefined, ad, bd);
      }
      if (best < 1) r.put(Math.floor((ax + bx) / 2), Math.floor((ay + by) / 2), c, (ad + bd) / 2);
      else r.line(ax, ay, bx, by, c, 1, undefined, ad, bd);
      return;
    }
    // 世界法线
    for (let f = 0; f < 6; f++) {
      const a = f >> 1;
      const s = f & 1 ? -1 : 1;
      let nx = (m[a * 3] as number) * s;
      let ny = (m[a * 3 + 1] as number) * s;
      let nz = (m[a * 3 + 2] as number) * s;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      nrm[f * 3] = nx;
      nrm[f * 3 + 1] = ny;
      nrm[f * 3 + 2] = nz;
      visF[f] = pr.visN(nx, ny, nz) ? 1 : 0;
    }
    if (st.outline) {
      const sp = new Float64Array(16);
      for (let c = 0; c < 8; c++) {
        sp[c * 2] = csx[c] as number;
        sp[c * 2 + 1] = csy[c] as number;
      }
      r.hullOutline(sp, 8, r.col('#2a2238', 1, lit * 0.5));
    }
    let top = -1;
    let topNy = 0.5;
    for (let f = 0; f < 6; f++) {
      if (!visF[f]) continue;
      const nx = nrm[f * 3] as number;
      const ny = nrm[f * 3 + 1] as number;
      const nz = nrm[f * 3 + 2] as number;
      const isTop = ny > 0.5;
      if (isTop && ny > topNy) {
        topNy = ny;
        top = f;
      }
      const sh = faceF(nx, nz) + 0.3 * Math.max(0, ny) - 0.12 * Math.max(0, -ny);
      const c = C(isTop ? (st.top ?? b.color) : (st.side ?? b.color), sh);
      const F = FACES[f] as readonly number[];
      for (let q = 0; q < 4; q++) {
        const ci = F[q] as number;
        fsp[q * 2] = csx[ci] as number;
        fsp[q * 2 + 1] = csy[ci] as number;
        fsd[q] = cd[ci] as number;
      }
      r.polyD(fsp, fsd, 4, c);
    }
    // 顶边高光：顶面和每个可见侧面相交的边
    if (top >= 0 && st.edge !== false && mxx - mnx > 6 && mxy - mny > 4) {
      const ec = C(st.top ?? b.color, 1.12);
      const F = FACES[top] as readonly number[];
      const adj = ADJ[top] as number[];
      for (let e = 0; e < 4; e++) {
        const g = adj[e] as number;
        if (g < 0 || !visF[g]) continue;
        const a = F[e] as number;
        const c2 = F[(e + 1) % 4] as number;
        r.line(
          csx[a] as number,
          csy[a] as number,
          csx[c2] as number,
          csy[c2] as number,
          ec,
          1,
          undefined,
          cd[a] as number,
          cd[c2] as number,
        );
      }
    }
  }
}
