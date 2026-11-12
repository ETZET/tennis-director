import type { Chip } from '../hud/types';
import './staff.css';

/** 一排小标签：代价、收益、耗时、成功率（从内容数据自动生成） */
export function Chips({ chips, limit }: { chips: readonly Chip[]; limit?: number }) {
  const list = limit ? chips.slice(0, limit) : chips;
  return (
    <span class="td-chips">
      {list.map((c) => (
        <span key={c.text} class={`td-chip td-chip-${c.tone ?? 'info'}`}>
          {c.text}
        </span>
      ))}
    </span>
  );
}
