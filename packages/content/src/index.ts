/**
 * 内容数据：事件卡、活动、状态量、人物、导演配置、文案。
 * 用 YAML 写在 data/，构建时校验并编译成 src/generated/content.json。只由 @td/sim 读取。
 */

import bundle from './generated/content.json';
import type { ContentBundle } from './schema';

/** 编译好的内容包（YAML 改了以后运行 pnpm content 重新生成） */
export const CONTENT = bundle as unknown as ContentBundle;
export const CONTENT_VERSION = CONTENT.version;

export {
  COMPUTED_VARS,
  type CompileResult,
  type ContentIssue,
  CYCLES_VAR,
  compileContent,
  formatIssues,
  HIRED_VAR,
  PERSON_ATTRS,
  PREP_VAR,
  ROUTE_VAR,
  VARIANT_VAR,
  WORKER,
} from './compile';
export * from './schema';
