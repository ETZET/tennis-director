import { describe, expect, it } from 'vitest';
import { IsoCamera, ZOOM_STEPS } from './camera';
import { Projection, SPRITE_HYST, spriteScaleFor, spriteScaleHyst } from './proj';
import type { IsoView } from './view';

/** 只有投影的假 IsoView：setPose 只改 k 和转角 */
function fakeView(): IsoView {
  const proj = new Projection();
  return {
    proj,
    PS: 1,
    occludedBottom: 0,
    setPose(_tx: number, _tz: number, k: number, ang: number) {
      proj.k = k;
      proj.setAngle(ang);
    },
    resize() {},
  } as unknown as IsoView;
}

/** 跑一段缩放动画，记下每帧的 (k, 精灵档位) */
function animate(cam: IsoCamera, frames = 120): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < frames; i++) {
    cam.update(1 / 60, null);
    out.push([cam.view.proj.k, cam.view.proj.spriteScale]);
  }
  return out;
}

describe('缩放档位和精灵档位', () => {
  it('档位 → 精灵档位：7.8 是 1 倍，15.6 是 2 倍，23.4 是 3 倍', () => {
    expect(ZOOM_STEPS.map(spriteScaleFor)).toEqual([1, 1, 1, 1, 1, 2, 3]);
  });

  it('人相对世界的大小（精灵档位 / k）随放大只减不增，屏幕上的大小只增不减', () => {
    for (let i = 1; i < ZOOM_STEPS.length; i++) {
      const a = ZOOM_STEPS[i - 1] as number;
      const b = ZOOM_STEPS[i] as number;
      expect(spriteScaleFor(b) / b).toBeLessThanOrEqual(spriteScaleFor(a) / a + 1e-9);
      expect(spriteScaleFor(b)).toBeGreaterThanOrEqual(spriteScaleFor(a));
    }
  });

  it('回差：分界附近来回抖不换档，越过足够远才换', () => {
    const edge = 11.0; // 1、2 档的分界约 11.0
    expect(spriteScaleHyst(edge * 1.03, 1)).toBe(1);
    expect(spriteScaleHyst(edge / 1.03, 2)).toBe(2);
    expect(spriteScaleHyst(edge * SPRITE_HYST * 1.01, 1)).toBe(2);
    expect(spriteScaleHyst(edge / SPRITE_HYST / 1.01, 2)).toBe(1);
    expect(spriteScaleHyst(23.4, 1)).toBe(3);
    expect(spriteScaleHyst(3, 3)).toBe(1);
  });

  it('缩放动画：精灵档位在第一帧就换好，途中不再变', () => {
    const cam = new IsoCamera(
      fakeView(),
      { tx: 0, tz: 0, zoom: 7.8, rot: 0 },
      {
        zoom: [2, 23.4],
        tx: [-100, 100],
        tz: [-100, 100],
      },
    );
    expect(cam.view.proj.spriteScale).toBe(1);
    cam.zoomIn();
    const up = animate(cam);
    expect(up[0]?.[0]).toBeLessThan(15);
    expect(new Set(up.map((f) => f[1]))).toEqual(new Set([2]));
    expect(up[up.length - 1]?.[0]).toBe(15.6);
    cam.zoomOut();
    const down = animate(cam);
    expect(new Set(down.map((f) => f[1]))).toEqual(new Set([1]));
    expect(down[down.length - 1]?.[0]).toBe(7.8);
  });

  it('双指缩放：抖动的手指在分界附近不来回换档', () => {
    const cam = new IsoCamera(fakeView(), { tx: 0, tz: 0, zoom: 10.5, rot: 0 });
    // 模拟 bindPointer 里的双指：pinching + zoomAt(instant)
    (cam as unknown as { pinching: boolean }).pinching = true;
    const seen: number[] = [];
    let z = 10.5;
    for (let i = 0; i < 80; i++) {
      z = 11.2 + Math.sin(i * 0.6) * 0.5; // 10.7 … 11.7 来回
      cam.zoomAt(z, 0, 0, true);
      cam.update(1 / 60, null);
      seen.push(cam.view.proj.spriteScale);
    }
    const flips = seen.filter((s, i) => i > 0 && s !== seen[i - 1]).length;
    expect(flips).toBe(0);
  });

  it('没被镜头定住的投影按 k 自己算', () => {
    const pr = new Projection();
    pr.k = 15.6;
    expect(pr.spriteScale).toBe(2);
    pr.sprite = 1;
    expect(pr.spriteScale).toBe(1);
  });
});
