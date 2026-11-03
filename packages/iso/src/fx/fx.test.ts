import { mulberry32 } from '@td/shared';
import { describe, expect, it } from 'vitest';
import { Group } from '../core/graph';
import { Particles } from './particles';
import { labelPlane, SpriteLayer, spriteTextTexture } from './sprites';

describe('Particles', () => {
  it('各种特效都能放，粒子数随寿命衰减到 0', () => {
    const g = new Group();
    const fx = new Particles(g, mulberry32(1), { groundY: () => 0 });
    expect(fx.node.parent).toBe(g);
    fx.dust(0, 0, 0, 5);
    fx.splash(0, 0, 0, 10);
    fx.mud(0, 0, 0);
    fx.confetti(0, 1, 0);
    fx.sparkle(0, 1, 0);
    fx.sweat(0, 1.8, 0);
    fx.tears(0, 1.6, 0);
    fx.puff(0, 1.6, 0);
    fx.smoke(0, 0, 0);
    fx.fire(0, 0, 0);
    fx.speed(0, 1, 0, 0);
    fx.leaf(0, 2, 0);
    fx.shimmer(0, 0, 0);
    fx.debris(0, 1, 0, 6, ['#ffffff']);
    fx.paper(0, 1, 0);
    fx.fall(0, 3, 0);
    fx.steam(0, 1, 0);
    const n0 = fx.count;
    expect(n0).toBeGreaterThan(80);
    fx.update(0.5);
    const n1 = fx.count;
    expect(n1).toBeLessThan(n0);
    expect(fx.node.visible).toBe(true);
    expect(fx.node.bounds.y1).toBeGreaterThan(fx.node.bounds.y0);
    for (let i = 0; i < 60; i++) fx.update(0.1);
    expect(fx.count).toBe(0);
    expect(fx.node.visible).toBe(false);
  });

  it('超过上限挤掉最老的', () => {
    const fx = new Particles(new Group(), mulberry32(2), { n: 20 });
    fx.confetti(0, 0, 0, 50);
    expect(fx.count).toBe(20);
  });
});

describe('SpriteLayer', () => {
  it('飘字跟着节点，到时自己消失', () => {
    const g = new Group();
    const head = new Group();
    head.position.set(1, 2, 3);
    g.add(head);
    const L = new SpriteLayer(g);
    L.update(0);
    L.pop('GOOD!', head, { dur: 1 });
    L.say(head, 'Hi', 1.5);
    L.emote(head, 'heart', 1);
    L.dizzy(head, 1);
    L.flash({ x: 0, y: 1, z: 0 });
    L.card(head, '9.5');
    expect(L.count).toBe(8);
    L.update(0.5);
    const n = g.children.find((c) => c.kind === 'custom');
    expect(n?.position.x).toBeCloseTo(1);
    expect(n?.position.y).toBeGreaterThan(2);
    L.update(3);
    expect(L.count).toBe(0);
    expect(g.children.filter((c) => c.kind === 'custom')).toHaveLength(0);
  });

  it('像素字：气泡比飘字大，中文在 node 里退化成方块', () => {
    const a = spriteTextTexture('OK');
    const b = spriteTextTexture('OK', { bubble: true });
    expect(b.art.w).toBeGreaterThan(a.art.w);
    expect(b.art.h).toBeGreaterThan(a.art.h);
    const c = spriteTextTexture('好球');
    expect(c.art.w).toBeGreaterThan(4);
    expect(labelPlane('FAIR', 2, 0.5, '#7c2232', '#ffffff', 22).children).toHaveLength(2);
  });
});
