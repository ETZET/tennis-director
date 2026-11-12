// 全部摆件：外观 + 四周（slots-ext.ts）+ 三层的家具和人（slots-1f / 2f / b1.ts）。main.ts、scene.ts、nav.ts 从这里拿。
import type { Slot } from './slot';
import { SLOTS_1F } from './slots-1f';
import { SLOTS_2F } from './slots-2f';
import { SLOTS_B1 } from './slots-b1';
import { SLOTS_EXT } from './slots-ext';

export type { Slot } from './slot';
export const SLOTS: Slot[] = [
  ...SLOTS_EXT,
  ...SLOTS_1F.map((s) => ({ level: 1 as const, ...s })),
  ...SLOTS_2F.map((s) => ({ level: 2 as const, ...s })),
  ...SLOTS_B1.map((s) => ({ level: -1 as const, ...s })),
];
