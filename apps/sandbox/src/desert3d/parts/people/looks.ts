// 外观：沙漠夏天的球友 + 总监（颜色照游戏里的总监）
import type { Look } from './rig';

export const DIRECTOR: Look = {
  skin: 0xd9a47c,
  hair: 0x4a3020,
  hairStyle: 'short',
  shirt: 0x2f5a55,
  trim: 0xe6b03c,
  bottom: 'pants',
  bottomColor: 0x7d6f55,
  hat: 'sunhat',
  hatColor: 0xd8c08a,
  shoes: 0x3a2a20,
  socks: 0x3a2a20,
};

const SKINS = [0xf1c8a5, 0xe6b48e, 0xd09a70, 0xb07650, 0x8d5a3b, 0x5e3a26];
const HAIRS = [0x2a1e18, 0x4a3020, 0x6a4428, 0xd0a858, 0x9a4a28, 0xb8b0a4];
const SHIRTS = [0xf4f0e6, 0xe8644a, 0x3aa8a0, 0xf0c43a, 0x8f74c8, 0x2e4a7a, 0xf088a0, 0x7fc06a, 0xffffff, 0x4a90d0];
const SHORTS = [0x2a3550, 0xf2eee4, 0x2a2a2a, 0xc8b48a, 0x3a6a8a];
const SKIRTS = [0xf2eee4, 0xf088a0, 0x2a3550, 0x2a2a2a];
const HATS = [0xf4f0e6, 0xd04a3a, 0x2a3550, 0xf0c43a, 0x3aa8a0];
const BANDS = [0xf4f0e6, 0xd04a3a, 0x3aa8a0];
const SHOES = [0xf4f0e6, 0xf4f0e6, 0xe8e0d0, 0x3a3a40, 0xd04a3a];
const RACKETS = [0x2b2b2b, 0xd04a3a, 0x2e6ad0, 0xf0c43a, 0xf4f0e6, 0x3a9a5a];
export const BAGS = [0xc8382a, 0x2a2a30, 0x2e5aa8, 0x3a8a6a, 0xe0a030, 0x8a4ab0];

export function randomLook(rnd: () => number): Look {
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const fem = rnd() < 0.5;
  const hairStyle: Look['hairStyle'] = fem ? (rnd() < 0.6 ? 'pony' : 'bun') : rnd() < 0.3 ? 'buzz' : 'short';
  const hr = rnd();
  const hat: Look['hat'] = hr < 0.3 ? 'cap' : hr < 0.5 ? 'visor' : 'none';
  return {
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairStyle,
    shirt: pick(SHIRTS),
    trim: rnd() < 0.4 ? pick(SHIRTS) : undefined,
    bottom: fem && rnd() < 0.6 ? 'skirt' : 'shorts',
    bottomColor: fem ? pick(SKIRTS) : pick(SHORTS),
    hat,
    hatColor: pick(HATS),
    headband: hat === 'none' && rnd() < 0.5 ? pick(BANDS) : undefined,
    shoes: pick(SHOES),
    socks: 0xf4f0e6,
    racket: pick(RACKETS),
    build: 0.92 + rnd() * 0.2,
    height: (fem ? 0.94 : 0.98) + rnd() * 0.08,
  };
}
