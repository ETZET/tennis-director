// clubbuild 的新材质（ui 这组自己的；别的组不改这个文件）。挑色规则照 clubsite/render/palette.ts 文件头。
import type { Swatch } from '../clubsite/render/palette';

export const EXTRA = {} as const satisfies Record<string, Swatch>;
