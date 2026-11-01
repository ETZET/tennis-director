/**
 * 界面层（Preact）：HUD、事件卡、俱乐部快讯。
 * 只读状态快照、只发命令；不直接引用 @td/render。
 */

export { type DebugHandle, DebugPanel, mountDebug } from './debug/DebugPanel';
export type * from './debug/types';
export { GRADE_COLOR, grade, mmss, sparkPoints, trend } from './hud/format';
export { Hud, type HudHandle, mountHud } from './hud/Hud';
export { STR, setHudStrings } from './hud/strings';
export type * from './hud/types';
export { ActionRing, Chips } from './plan/ActionRing';
export { Planner } from './plan/Planner';
export const UI_VERSION = 1;
