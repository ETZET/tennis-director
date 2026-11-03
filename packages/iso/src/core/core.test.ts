import { describe, expect, it } from 'vitest';
import type { PixelArt } from '../art/format';
import { bakeArt, DARK, flipArt, nightArt } from './art';
import { ph } from './color';
import { daylightAt } from './daylight';
import { SceneDrawer, SPRITE_ZHYST } from './draw';
import { Box, Group, Sprite, V3 } from './graph';
import { GroundPainter } from './ground';
import { Projection } from './proj';
import { Raster, ZTEST, ZWRITE } from './raster';

const close = (a: number, b: number, e = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(e);

describe('场景图变换', () => {
  it('嵌套旋转的世界位置', () => {
    const a = new Group();
    a.position.set(10, 0, 0);
    a.rotation.y = Math.PI / 2;
    const b = new Group();
    b.position.set(2, 1, 0);
    b.rotation.y = Math.PI / 2;
    a.add(b);
    const c = new Group();
    c.position.set(1, 0, 0);
    b.add(c);
    // a 转 90°：局部 +x → 世界 -z；b 再转 90°：c 的 +x → 世界 -x
    const p = c.getWorldPosition();
    close(p.x, 9);
    close(p.y, 1);
    close(p.z, -2);
    close(c.getWorldYaw(), Math.PI, 1e-9);
  });

  it('attach 保持世界位置和朝向', () => {
    const a = new Group();
    a.position.set(5, 0, 3);
    a.rotation.y = 0.7;
    const n = new Group();
    n.position.set(-2, 1, 4);
    n.rotation.y = -0.3;
    const before = n.getWorldPosition();
    a.attach(n);
    expect(n.parent).toBe(a);
    const after = n.getWorldPosition();
    close(after.x, before.x, 1e-9);
    close(after.y, before.y, 1e-9);
    close(after.z, before.z, 1e-9);
    close(n.getWorldYaw(), -0.3, 1e-9);
  });

  it('worldToLocal 是 localToWorld 的逆', () => {
    const a = new Group();
    a.position.set(1, 2, 3);
    a.rotation.set(0.2, 0.5, -0.1);
    a.scale.set(2, 1, 0.5);
    const v = a.localToWorld(new V3(0.3, -1, 2));
    a.worldToLocal(v);
    close(v.x, 0.3, 1e-9);
    close(v.y, -1, 1e-9);
    close(v.z, 2, 1e-9);
  });
});

describe('投影', () => {
  it('4 个等距角 P / unP 往返', () => {
    const pr = new Projection();
    pr.cx = 12;
    pr.cz = 13;
    pr.k = 5.2;
    pr.ox = 200;
    pr.oy = 300;
    for (let r = 0; r < 4; r++) {
      pr.setAngle((r * Math.PI) / 2);
      for (const [x, y, z] of [
        [0, 0, 0],
        [-30, 2.5, 17],
        [44, 0, -24],
      ] as const) {
        const [sx, sy] = pr.P(x, y, z);
        const [wx, wz] = pr.unP(sx, sy, y);
        close(wx, x, 1e-9);
        close(wz, z, 1e-9);
      }
    }
  });

  it('角度 0 时 +x、+z 都朝镜头，2:1 等距', () => {
    const pr = new Projection();
    pr.setAngle(0);
    pr.k = 2;
    const [ax, ay] = pr.P(1, 0, 0);
    expect([ax, ay]).toEqual([2, 1]);
    expect(pr.vis(1, 0)).toBe(true);
    expect(pr.vis(0, 1)).toBe(true);
    expect(pr.vis(-1, 0)).toBe(false);
    pr.setAngle(Math.PI);
    expect(pr.vis(-1, 0)).toBe(true);
    expect(pr.spriteScale).toBe(1);
    pr.k = 15.6;
    expect(pr.spriteScale).toBe(2);
  });
});

const ART: PixelArt = {
  rows: ['OSs.', 'TtQY', '1..Q'],
  ox: 1,
  oy: 2,
  pal: { '1': '#102030' },
  pts: { hand_r: [3, 1] },
};

describe('素材烘焙', () => {
  it('槽位、小写压暗、固定色、透明、自发光', () => {
    const b = bakeArt(ART, { skin: '#ff8040', shirt: '#204080' });
    expect(b.w).toBe(4);
    expect(b.h).toBe(3);
    expect(b.px[0]).toBe(ph('#2a2238'));
    expect(b.px[1]).toBe(ph('#ff8040'));
    const d = b.px[2] as number;
    expect(d & 255).toBe(Math.floor(255 * DARK));
    expect(b.px[3]).toBe(0);
    expect(b.px[8]).toBe(ph('#102030'));
    expect(b.emissive?.[7]).toBe(1);
    expect(b.emissive?.[4]).toBe(0);
    // 缓存：同内容的换色表拿到同一个结果
    expect(bakeArt(ART, { shirt: '#204080', skin: '#ff8040' })).toBe(b);
  });

  it("槽位颜色 'none' = 透明", () => {
    const b = bakeArt(ART, { racket: 'none' });
    expect(b.px[6]).toBe(0);
    expect(b.px[11]).toBe(0);
    expect(bakeArt(ART).px[6]).not.toBe(0);
  });

  it('翻转：像素、锚点、挂点一起镜像，翻两次回来', () => {
    const b = bakeArt(ART);
    const f = flipArt(b);
    expect(f.ox).toBe(3);
    expect(f.pts?.hand_r).toEqual([0, 1]);
    expect(f.px[3]).toBe(b.px[0]);
    expect(f.emissive?.[4]).toBe(1);
    expect(flipArt(f)).toBe(b);
  });

  it('夜色：普通像素压暗，自发光不变', () => {
    const b = bakeArt(ART);
    const n = nightArt(b, 1, 0);
    expect(n[7]).toBe(b.px[7]);
    expect(n[1]).not.toBe(b.px[1]);
    expect(nightArt(b, 0, 0)).toBe(b.px);
  });
});

describe('光栅和深度', () => {
  it('精灵的遮挡有滞回：深度差在容差带里时保持上一帧的样子，真站到后面才变剪影', () => {
    const W = 120;
    const H = 120;
    const buf = new Uint32Array(W * H);
    const depth = new Float32Array(W * H);
    const r = new Raster(buf, W, H);
    r.setTarget(buf, depth, W, H);
    r.proj.k = 8;
    r.proj.ox = 60;
    r.proj.oy = 80;
    r.proj.setAngle(0);
    const sp = new Sprite(bakeArt(ART));
    const g = new Group();
    g.add(sp);
    const sd = new SceneDrawer();
    r.zmode = ZTEST;
    const d0 = r.proj.depth(0, 0);
    const frame = (gap: number) => {
      depth.fill(d0 + gap);
      sd.collect(r, g);
      sd.draw(r);
      return sp.zhide;
    };
    const band = r.zeps + SPRITE_ZHYST / 2;
    // 看得见的人在带里一直看得见
    expect(frame(band)).toBe(false);
    expect(frame(band)).toBe(false);
    // 真站到后面：变剪影；退回带里还是剪影；走出来才变回来
    expect(frame(r.zeps + SPRITE_ZHYST + 0.1)).toBe(true);
    expect(frame(band)).toBe(true);
    expect(frame(r.zeps - 0.1)).toBe(false);
  });

  it('静态方块写深度，后面的精灵被挡住、前面的画出来', () => {
    const W = 200;
    const H = 200;
    const buf = new Uint32Array(W * H);
    const depth = new Float32Array(W * H).fill(Number.NEGATIVE_INFINITY);
    const r = new Raster(buf, W, H);
    r.setTarget(buf, depth, W, H);
    r.proj.k = 8;
    r.proj.ox = 100;
    r.proj.oy = 120;
    r.proj.setAngle(0);
    const statics = new Group();
    const wall = new Box(1, 4, 6, '#ecd2ac');
    wall.position.set(0, 2, 0);
    statics.add(wall);
    const sd = new SceneDrawer();
    r.zmode = ZWRITE;
    expect(sd.collect(r, statics)).toBe(1);
    sd.draw(r);
    const wallPx = buf[110 * W + 100];
    expect(wallPx).not.toBe(0);
    // 墙后（-x）的方块被挡，墙前（+x）的画出来
    const dyn = new Group();
    const behind = new Box(0.6, 0.6, 0.6, '#ff00ff');
    behind.position.set(-2, 1.5, 0);
    dyn.add(behind);
    r.zmode = ZTEST;
    sd.collect(r, dyn);
    sd.draw(r);
    const magenta = ph('#ff00ff');
    let shown = 0;
    for (let i = 0; i < buf.length; i++)
      if (
        ((buf[i] as number) & 0xffffff) >> 16 > 200 &&
        ((buf[i] as number) & 255) > 200 &&
        (((buf[i] as number) >> 8) & 255) < 60
      )
        shown++;
    expect(shown).toBe(0);
    behind.position.set(2, 1.5, 0);
    sd.collect(r, dyn);
    sd.draw(r);
    shown = 0;
    for (let i = 0; i < buf.length; i++)
      if (
        ((buf[i] as number) & 0xffffff) >> 16 > 200 &&
        ((buf[i] as number) & 255) > 200 &&
        (((buf[i] as number) >> 8) & 255) < 60
      )
        shown++;
    expect(shown).toBeGreaterThan(4);
    expect(magenta).toBeGreaterThan(0);
  });

  it('地面贴图 0.2 m 一个纹素，灯光池按量化 4 档', () => {
    const g = new GroundPainter({ x0: 0, x1: 10, z0: 0, z1: 4 });
    expect(g.TW).toBe(50);
    expect(g.TH).toBe(20);
    const v0 = g.version;
    g.paintRect(0, 1, 0, 1, () => ph('#ff0000'));
    expect(g.version).toBe(v0 + 1);
    expect(g.get(0.5, 0.5)).toBe(ph('#ff0000'));
    expect(g.get(2, 2)).not.toBe(ph('#ff0000'));
    g.addLamp({ x: 5, z: 2, r: 3, i: 1 });
    expect(g.litAt(5, 2, 1)).toBe(1);
    expect(g.litAt(5, 2, 0)).toBe(0);
    expect(g.litAt(9.5, 2, 1)).toBe(0);
  });
});

describe('昼夜', () => {
  it('正午白天、深夜全黑灯全亮、黄昏介于中间', () => {
    expect(daylightAt(12 * 60).night).toBe(0);
    expect(daylightAt(23 * 60).night).toBe(1);
    expect(daylightAt(23 * 60).lamps).toBe(1);
    const d = daylightAt(18 * 60 + 15);
    expect(d.night).toBeGreaterThan(0.2);
    expect(d.night).toBeLessThan(0.6);
    expect(daylightAt(12 * 60, 1).night).toBeGreaterThan(0);
  });
});
