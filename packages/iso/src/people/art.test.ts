import { describe, expect, it } from 'vitest';
import { ADULT, KID } from '../art/people';
import { resolveAnim } from './frames';
import { GESTURES, POSES, STROKES } from './poses';

/** 真精灵表：每个姿势、击球分段、手势都能取到帧（取不到的走回退，最后至少有 idle）。 */
describe('精灵表覆盖', () => {
  const names = [
    'idle',
    'walk',
    'run',
    'fallFace',
    'fallBack',
    ...Object.keys(POSES),
    ...Object.keys(GESTURES),
    ...Object.values(STROKES).flatMap((fr) => fr.map((k) => k[1] as string)),
  ];
  for (const sheet of [ADULT, KID])
    it(`${sheet.body} 每个名字都有帧`, () => {
      for (const n of names)
        for (const f of ['front', 'back'] as const)
          expect(resolveAnim(sheet, n, f)?.anim.frames.length).toBeGreaterThan(0);
      // 走路和击球真有专门的帧
      expect(resolveAnim(sheet, 'walk', 'front')?.name).toBe('walk');
    });
});
