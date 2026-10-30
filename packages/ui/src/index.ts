/**
 * 界面层（M1 起用 Preact + signals）：HUD、事件卡、因果日志、调试面板。
 * 只读模拟快照、只向模拟发命令；不直接引用 @td/render。
 *
 * M0 阶段 Hollow Creek 的 HUD 还留在 apps/sandbox 里，原样保留原型的 DOM。
 */
export const UI_VERSION = 0;
