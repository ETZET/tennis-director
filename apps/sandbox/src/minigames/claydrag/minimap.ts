// 小地图：东半场俯视（北在上），一格 0.36 米 = 一个像素（CSS 放大 3 倍，像素风）。
// 刚拖平 = 亮红土，没拖 = 暗土，最大的那块没拖的一闪一闪（金），白线扫出来 = 奶油白、盖着土 = 浅褐，总监 = 金点。
// 不吃指针（摇杆照样从下面按）；开局卡、结算卡时藏起来（.mg-paused）。
import { T_BRUSHED } from '../../clubclay/assets/clay/state';
import type { Grid, Rect } from './rules';

const CSS = `
.cd-mini { position: fixed; z-index: 6; left: max(14px, calc(env(safe-area-inset-left) + 8px)); bottom: calc(max(24px, env(safe-area-inset-bottom)) + 214px); pointer-events: none; padding: 5px 6px 6px; display: flex; flex-direction: column; gap: 3px; font: 700 10px/1 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", ui-monospace, monospace; color: #fff3d6; letter-spacing: 1px; background: #2c2450; box-shadow: 3px 0 0 0 #fff3d6, -3px 0 0 0 #fff3d6, 0 3px 0 0 #fff3d6, 0 -3px 0 0 #fff3d6, 0 6px 0 0 #171230, 3px 3px 0 0 #171230, -3px 3px 0 0 #171230; }
.cd-mini canvas { display: block; image-rendering: pixelated; }
.cd-mini small { display: flex; justify-content: space-between; gap: 6px; opacity: 0.85; }
.cd-mini small i { font-style: normal; }
.cd-mini small i::before { content: ""; display: inline-block; width: 7px; height: 7px; margin-right: 3px; vertical-align: -1px; background: var(--c); }
.mg-paused .cd-mini { display: none; }
@media (orientation: landscape) { .cd-mini { bottom: auto; top: 110px; } }
`;

/** 一条线：沿线的采样点（本地米）+ 这一点扫干净了没有 */
export interface MiniLine {
  pts: [number, number, boolean][];
}

export interface Minimap {
  draw(o: {
    grid: Grid;
    patch: { x: number; z: number } | null;
    lines: MiniLine[];
    me: [number, number];
    mat: [number, number] | null;
    rack: [number, number];
    blink: boolean;
  }): void;
}

/** r = 小地图画的范围（本地米）；block = 一个像素几米 */
export function createMinimap(r: Rect, block = 0.36, scale = 3): Minimap {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.className = 'cd-mini';
  const W = Math.round((r.x1 - r.x0) / block);
  const H = Math.round((r.z1 - r.z0) / block);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  cv.style.width = `${W * scale}px`;
  cv.style.height = `${H * scale}px`;
  const legend = document.createElement('small');
  legend.innerHTML = '<i style="--c:#e9925e">拖平</i><i style="--c:#7a3d26">没拖</i>';
  box.append(cv, legend);
  document.body.appendChild(box);
  const g2 = cv.getContext('2d') as CanvasRenderingContext2D;
  const img = g2.createImageData(W, H);
  const px = (x: number, z: number): [number, number] => [
    Math.floor((x - r.x0) / block),
    Math.floor((z - r.z0) / block),
  ];
  const put = (i: number, j: number, c: number) => {
    if (i < 0 || j < 0 || i >= W || j >= H) return;
    const k = (j * W + i) * 4;
    img.data[k] = (c >> 16) & 255;
    img.data[k + 1] = (c >> 8) & 255;
    img.data[k + 2] = c & 255;
    img.data[k + 3] = 255;
  };

  return {
    draw({ grid: g, patch, lines, me, mat, rack, blink }) {
      // 每个像素：取它中心那一格
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const x = r.x0 + (i + 0.5) * block;
          const z = r.z0 + (j + 0.5) * block;
          const gi = Math.min(g.nx - 1, Math.max(0, Math.floor((x + g.hw) / g.cx)));
          const gj = Math.min(g.nz - 1, Math.max(0, Math.floor((z + g.hd) / g.cz)));
          put(i, j, g.dust[gj * g.nx + gi] < T_BRUSHED ? 0xe9925e : 0x7a3d26);
        }
      if (patch && blink) {
        const [i, j] = px(patch.x, patch.z);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) put(i + di, j + dj, 0xffd23c);
      }
      for (const l of lines)
        for (const [x, z, clean] of l.pts) {
          const [i, j] = px(x, z);
          put(i, j, clean ? 0xfff3d6 : 0xb87656);
        }
      // 网（西边一列）、工具架（北边）
      for (let j = 0; j < H; j++) put(0, j, 0x2c2450);
      const [ri, rj] = px(rack[0], Math.max(rack[1], r.z0 + 0.1));
      for (let di = -3; di <= 3; di++) put(ri + di, rj, 0x4fb3a9);
      if (mat) {
        const [mi, mj] = px(mat[0], mat[1]);
        put(mi, mj, 0x5a5a6e);
      }
      const [ci, cj] = px(me[0], me[1]);
      for (const [di, dj] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        put(ci + di - 1, cj + dj - 1, 0xffd23c);
      g2.putImageData(img, 0, 0);
    },
  };
}
