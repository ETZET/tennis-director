/**
 * 界面层（Preact）：HUD、事件卡、俱乐部快讯。
 * 只读状态快照、只发命令；不直接引用 @td/iso。
 */

export { type DebugHandle, DebugPanel, mountDebug } from './debug/DebugPanel';
export type * from './debug/types';
export { GRADE_COLOR, grade, mmss, sparkPoints, trend } from './hud/format';
export { Hud, type HudHandle, mountHud } from './hud/Hud';
export { STR, setHudStrings } from './hud/strings';
export type * from './hud/types';
export { Chips } from './staff/Chips';
export { CARE_GLYPH, PlaceSheet } from './staff/PlaceSheet';
export { StaffBar } from './staff/StaffBar';
export { TargetSheet } from './staff/TargetSheet';
export const UI_VERSION = 2;
