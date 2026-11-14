import { describe, expect, it } from 'vitest';
import { envFor, HOLES, SLOPE, surfaceAt, TOTAL_PAR } from './course';
import {
  bestPutt,
  CUP_R,
  type Env,
  flatDistance,
  gradient,
  heightAt,
  hit,
  holePoints,
  launchSpeed,
  newBall,
  PREVIEW,
  powerFor,
  predict,
  QUICK_BONUS,
  type Slope,
  STARS,
  settle,
  simulate,
  stepBall,
  verdict,
} from './rules';

const FLAT: Slope = { cx: 0, cz: 0, gx: 0, gz: 0, bumps: [] };
const flatEnv = (cup: [number, number] = [100, 0]): Env => ({ surface: () => 'green', slope: FLAT, cup });

describe('力度', () => {
  it('平果岭上滚的距离 = 力度换算的距离', () => {
    for (const k of [0.2, 0.5, 0.9]) {
      const o = simulate(flatEnv(), [0, 0], 0, k);
      expect(o.kind).toBe('stop');
      expect(o.end[0]).toBeCloseTo(flatDistance(k), 1);
    }
    expect(powerFor(flatDistance(0.37))).toBeCloseTo(0.37, 6);
  });
});

describe('坡', () => {
  it('梯度和高度对得上（数值求导）', () => {
    const e = 1e-4;
    for (const [x, z] of [
      [-42.5, 63],
      [-44.9, 63.9],
      [-41, 61],
    ]) {
      const [gx, gz] = gradient(SLOPE, x, z);
      expect(gx).toBeCloseTo((heightAt(SLOPE, x + e, z) - heightAt(SLOPE, x - e, z)) / (2 * e), 5);
      expect(gz).toBeCloseTo((heightAt(SLOPE, x, z + e) - heightAt(SLOPE, x, z - e)) / (2 * e), 5);
    }
  });
  it('侧坡把球往下坡拐', () => {
    // 往东推，南边低（gz < 0 → 高度往南降）：球往南（+z）拐
    const env: Env = { surface: () => 'green', slope: { ...FLAT, gz: -0.03 }, cup: [100, 0] };
    const o = simulate(env, [0, 0], 0, 0.5);
    expect(o.end[1]).toBeGreaterThan(0.3);
  });
  it('果岭上哪儿都停得住（坡比阻力缓）', () => {
    for (let x = -46; x <= -39.5; x += 0.5)
      for (let z = 60.5; z <= 65.5; z += 0.5) {
        const [gx, gz] = gradient(SLOPE, x, z);
        expect(Math.hypot(gx, gz) * ((9.81 * 5) / 7)).toBeLessThan(0.8);
      }
  });
});

describe('进洞', () => {
  it('慢慢正中进；太快吊出 / 跳过', () => {
    const env = flatEnv([2, 0]);
    // 刚好滚到杯后一点点：进
    expect(simulate(env, [0, 0], 0, powerFor(2.2)).kind).toBe('holed');
    // 太猛：飞过去
    const fast = simulate(env, [0, 0], 0, powerFor(9));
    expect(fast.kind).toBe('stop');
    expect(fast.lips).toBe(1);
    expect(fast.end[0]).toBeGreaterThan(2.5);
  });
  it('擦边比正中难进：同样的速度，正中进、擦边吊出拐弯', () => {
    const env = flatEnv([3, 0]);
    const k = powerFor(3.9);
    expect(simulate(env, [0, 0], 0, k).kind).toBe('holed');
    const edge = simulate(env, [0, 0.085], 0, k);
    expect(edge.kind).toBe('stop');
    expect(edge.lips).toBe(1);
    // 被杯沿往外拽：停在离路线更远的一边
    expect(edge.end[1]).toBeGreaterThan(0.15);
  });
  it('停在杯外的球不算进', () => {
    const o = simulate(flatEnv([3, 0]), [0, 0], 0, powerFor(2.5));
    expect(o.kind).toBe('stop');
    expect(3 - o.end[0]).toBeGreaterThan(CUP_R);
  });
});

describe('瞄准线', () => {
  it('只给前 1.5 米，点和真的滚的一样', () => {
    const env = envFor(HOLES[3]);
    const pts = predict(env, HOLES[3].ball, 2.9, 0.7);
    const last = pts[pts.length - 1];
    const d = Math.hypot(last[0] - HOLES[3].ball[0], last[1] - HOLES[3].ball[1]);
    expect(d).toBeLessThanOrEqual(PREVIEW + 0.05);
    expect(d).toBeGreaterThan(PREVIEW - 0.2);
    // 同一个球照样滚 1.5 米：位置对得上
    const b = newBall(HOLES[3].ball);
    hit(b, 2.9, 0.7);
    while (b.dist < PREVIEW - 0.1) stepBall(b, 1 / 120, env);
    expect(Math.hypot(b.x - pts[14][0], b.z - pts[14][1])).toBeLessThan(0.06);
  });
});

describe('罚杆', () => {
  it('推进水塘：罚杆，球放回岸上能打的地方', () => {
    const h = HOLES[5];
    const env = envFor(h);
    const o = simulate(env, h.ball, 0, 1);
    expect(o.kind).toBe('hazard');
    expect(o.drop).toBeDefined();
    const s = surfaceAt(o.drop![0], o.drop![1]);
    expect(['green', 'fringe', 'fairway', 'rough']).toContain(s);
    // 离岸边有一段（不是贴着塘沿放）
    expect(Math.hypot(o.drop![0] - o.end[0], o.drop![1] - o.end[1])).toBeGreaterThan(0.3);
  });
});

describe('九个洞', () => {
  it('开球点能打、杯在果岭上，标准杆 3 的是果岭外长推', () => {
    expect(HOLES.length).toBe(9);
    for (const h of HOLES) {
      const sb = surfaceAt(h.ball[0], h.ball[1]);
      expect(['green', 'fringe', 'fairway']).toContain(sb);
      expect(surfaceAt(h.cup[0], h.cup[1])).toBe('green');
      // 杯离果岭边至少 0.5 米
      for (let a = 0; a < 6.28; a += 0.4)
        expect(surfaceAt(h.cup[0] + Math.cos(a) * 0.5, h.cup[1] + Math.sin(a) * 0.5)).toBe('green');
      // 标准杆 3 的都是果岭外 7 米以上的长推
      if (h.par === 3) expect(sb).toBe('fairway');
      if (h.par === 3) expect(Math.hypot(h.cup[0] - h.ball[0], h.cup[1] - h.ball[1])).toBeGreaterThan(7);
      // 力度够得着（满力度平地 20 米）
      expect(launchSpeed(1)).toBeGreaterThan(
        launchSpeed(powerFor(Math.hypot(h.cup[0] - h.ball[0], h.cup[1] - h.ball[1]))),
      );
    }
    expect(TOTAL_PAR).toBe(20);
  });
  it('每个洞都有一杆能进（网格搜）', { timeout: 60000 }, () => {
    for (const h of HOLES) {
      const b = bestPutt(envFor(h), h.ball, { angleN: 31, powerN: 30 });
      expect(b.outcome.kind, h.name).toBe('holed');
    }
  });
});

describe('分', () => {
  it('杆数 → 分、印章', () => {
    expect(holePoints(2, 2)).toBe(200);
    expect(holePoints(2, 1)).toBe(300);
    expect(holePoints(3, 1)).toBe(400);
    expect(holePoints(2, 4)).toBe(0);
    expect(holePoints(2, 5)).toBe(0);
    expect(verdict(2, 1).key).toBe('ace');
    expect(verdict(3, 1).key).toBe('ace');
    expect(verdict(3, 2).key).toBe('birdie');
    expect(verdict(2, 2).key).toBe('par');
    expect(verdict(2, 3).key).toBe('bogey');
    expect(verdict(2, 4).key).toBe('double');
  });
  it('星级只看杆数：全标准杆 + 全快手也到不了三星，低一杆就到', () => {
    const allPar = HOLES.reduce((s, h) => s + holePoints(h.par, h.par) + QUICK_BONUS, 0);
    expect(allPar).toBeLessThan(STARS[2]);
    expect(allPar).toBeGreaterThanOrEqual(STARS[1]);
    const oneUnder = HOLES.reduce((s, h, i) => s + holePoints(h.par, h.par - (i === 0 ? 1 : 0)), 0);
    expect(oneUnder).toBeGreaterThanOrEqual(STARS[2]);
    const plusTwo = HOLES.reduce((s, h, i) => s + holePoints(h.par, h.par + (i < 2 ? 1 : 0)) + QUICK_BONUS, 0);
    expect(plusTwo).toBeLessThan(STARS[1]);
  });
  it('结算明细', () => {
    const lines = settle(
      [
        { par: 2, strokes: 1, penalties: 0, quick: true, picked: false },
        { par: 3, strokes: 4, penalties: 1, quick: false, picked: false },
      ],
      9,
    );
    const get = (l: string) => lines.find((x) => x.label === l)?.value;
    expect(get('总杆数')).toBe('5（标准杆 5）');
    expect(get('对标准杆')).toBe('E');
    expect(get('罚杆（水、沙、界外）')).toBe('1');
  });
});
