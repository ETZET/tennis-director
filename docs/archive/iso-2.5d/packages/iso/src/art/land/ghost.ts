import { bay, mixP, ph } from '../../core/color';
import type { DrawContext } from '../../core/graph';

/**
 * 新地的半透明预览，和 Wave 1 的修复预览（site/indian-wells/preview.ts）同一个样子：
 * 新画上去的像素按 4×4 Bayer 只留约 45%、往浅青偏、每隔三行偏得重一点，再沿范围描一圈虚线和取景框角。
 * 要直接碰光栅缓冲；DrawContext 不是 Raster 时（测试替身）只描虚线。
 */

type Rect = { x0: number; x1: number; z0: number; z1: number };
type Buf = { buf: Uint32Array; W: number; H: number; zmode: number };
const asBuf = (r: DrawContext): Buf | null => {
  const b = r as unknown as Partial<Buf>;
  return b.buf instanceof Uint32Array && typeof b.W === 'number' ? (r as unknown as Buf) : null;
};

/** 世界包围盒在屏幕上的像素范围（夹在缓冲里），空的返回 null */
function screenBox(
  r: DrawContext,
  B: Buf,
  bb: Rect & { y0: number; y1: number },
): { X0: number; X1: number; Y0: number; Y1: number } | null {
  let sx0 = 1e9;
  let sx1 = -1e9;
  let sy0 = 1e9;
  let sy1 = -1e9;
  for (let c = 0; c < 8; c++) {
    const p = r.P(c & 1 ? bb.x1 : bb.x0, c & 2 ? bb.y1 : bb.y0, c & 4 ? bb.z1 : bb.z0);
    sx0 = Math.min(sx0, p[0]);
    sx1 = Math.max(sx1, p[0]);
    sy0 = Math.min(sy0, p[1]);
    sy1 = Math.max(sy1, p[1]);
  }
  const X0 = Math.max(0, Math.floor(sx0) - 2);
  const X1 = Math.min(B.W - 1, Math.ceil(sx1) + 2);
  const Y0 = Math.max(0, Math.floor(sy0) - 8);
  const Y1 = Math.min(B.H - 1, Math.ceil(sy1) + 2);
  return X1 < X0 || Y1 < Y0 ? null : { X0, X1, Y0, Y1 };
}

function snapshot(B: Buf, s: { X0: number; X1: number; Y0: number; Y1: number }): Uint32Array {
  const w = s.X1 - s.X0 + 1;
  const snap = new Uint32Array(w * (s.Y1 - s.Y0 + 1));
  for (let y = s.Y0; y <= s.Y1; y++) snap.set(B.buf.subarray(y * B.W + s.X0, y * B.W + s.X1 + 1), (y - s.Y0) * w);
  return snap;
}

const KEEP = 0.45;
const TINT = ph('#9ff0ff');
const TINT_F = 0.3;
const SCAN_F = 0.55;

/** 半透明预览：draw 里画的东西按抖动溶解、偏青，最后沿 outline 描虚线（深度关掉，画在现在的样子上面） */
export function ghost(
  r: DrawContext,
  bb: Rect & { y0: number; y1: number },
  outline: readonly Rect[],
  draw: () => void,
): void {
  const B = asBuf(r);
  if (!B) {
    drawOutline(r, outline);
    return;
  }
  const s = screenBox(r, B, bb);
  if (!s) return;
  const snap = snapshot(B, s);
  const zm = B.zmode;
  B.zmode = 0;
  draw();
  const w = s.X1 - s.X0 + 1;
  const buf = B.buf;
  for (let y = s.Y0; y <= s.Y1; y++) {
    const row = y * B.W;
    const srow = (y - s.Y0) * w - s.X0;
    for (let x = s.X0; x <= s.X1; x++) {
      const v = buf[row + x] as number;
      const o = snap[srow + x] as number;
      if (v === o) continue;
      buf[row + x] = bay(x, y) < KEEP ? mixP(v, TINT, y % 3 === 0 ? SCAN_F : TINT_F) : o;
    }
  }
  drawOutline(r, outline);
  B.zmode = zm;
}

/** 虚线框（同 preview.ts 的 drawOutline）：深青垫底、亮青白虚线、四角取景框；夜里自发光 */
export function drawOutline(r: DrawContext, regions: readonly Rect[]): void {
  const N = r.night > 0.3;
  const dc = N ? r.em('#bff4ff') : r.col('#f2feff', 1, 0);
  const under = N ? r.em('#1f7f8c', 0.8) : r.col('#0f5d68', 1, 0);
  const cc = N ? r.em('#ffffff') : r.col('#ffffff', 1, 0);
  const w = Math.max(1, Math.round(r.k / 4));
  const dash = 0.9;
  for (const rc of regions) {
    const edges: [number, number, number, number][] = [
      [rc.x0, rc.z0, rc.x1, rc.z0],
      [rc.x1, rc.z0, rc.x1, rc.z1],
      [rc.x1, rc.z1, rc.x0, rc.z1],
      [rc.x0, rc.z1, rc.x0, rc.z0],
    ];
    for (const [ax, az, bx, bz] of edges) r.wline([ax, 0.04, az], [bx, 0.04, bz], under, w + 1);
    for (const [ax, az, bx, bz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.floor(len / dash));
      for (let i = 0; i < n; i += 2) {
        const u0 = i / n;
        const u1 = Math.min(1, (i + 1) / n);
        r.wline(
          [ax + (bx - ax) * u0, 0.04, az + (bz - az) * u0],
          [ax + (bx - ax) * u1, 0.04, az + (bz - az) * u1],
          dc,
          w,
        );
      }
    }
    const L = Math.min(1.6, (rc.x1 - rc.x0) / 3, (rc.z1 - rc.z0) / 3);
    for (const [x, z, sx, sz] of [
      [rc.x0, rc.z0, 1, 1],
      [rc.x1, rc.z0, -1, 1],
      [rc.x1, rc.z1, -1, -1],
      [rc.x0, rc.z1, 1, -1],
    ] as const) {
      r.wline([x, 0.05, z], [x + sx * L, 0.05, z], cc, w + 1);
      r.wline([x, 0.05, z], [x, 0.05, z + sz * L], cc, w + 1);
    }
  }
}
