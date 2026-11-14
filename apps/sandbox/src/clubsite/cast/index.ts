// 人物系统（cast）的入口：数据契约、特质、颜色、种子随机、人位表、生成、选角、互动、状态、"在想什么"。
// 纯数据 + 纯函数（不碰 three、DOM、Math.random；pnpm check:deps 的 cast-is-pure）。界面在 clubwalk/cast/，换装在 people/dress.ts。
import { buildCast } from './casting';
import { NAMED } from './named';

export * from './actions';
export * from './casting';
export * from './colors';
export * from './crowd';
export { NAMED, NAMED_BY_ID } from './named';
export * from './rng';
export * from './slots';
export * from './state';
export * from './thoughts';
export * from './traits';
export * from './types';

/** 这一局的演员表（种子 1：名字和样子每局一样） */
export const CAST = buildCast(1, NAMED);
