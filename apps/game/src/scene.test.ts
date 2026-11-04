import { CONTENT } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { LOOKS } from './scene';

/** 内容里新加了人而忘了在 scene.ts 的 LOOKS 里给他长相，画面上就没有这个人：这里会报出来（总监另画） */
describe('scene LOOKS', () => {
  it('every person in content has a look', () => {
    const missing = CONTENT.people.filter((p) => p.role !== 'director' && !LOOKS[p.id]).map((p) => p.id);
    expect(missing).toEqual([]);
  });
  it('every look belongs to a person in content', () => {
    const ids = new Set(CONTENT.people.map((p) => p.id));
    expect(Object.keys(LOOKS).filter((id) => !ids.has(id))).toEqual([]);
  });
});
