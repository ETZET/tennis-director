// 配色切换器（右上角，和左上角的像素级别选择器同一个样子）：点一个方案 = 带着 ?pal=<id> 重新载入
// （材质在建场景时就定了色，重载最稳；其余 URL 参数保留）。按钮 ≥ 44 px。
import { DEFAULT_SCHEME_ID } from './index';
import type { Scheme } from './types';

export function mountPaletteSwitcher(host: HTMLElement, schemes: Scheme[], currentId: string) {
  const chip = document.createElement('button');
  chip.className = 'px-chip';
  chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'true');
  chip.setAttribute('aria-expanded', 'false');
  const idx = Math.max(
    0,
    schemes.findIndex((s) => s.id === currentId),
  );
  chip.textContent = `配色 ${idx} ${schemes[idx].name}`;
  const list = document.createElement('div');
  list.className = 'px-list';
  list.hidden = true;
  schemes.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = s.hint;
    b.setAttribute('aria-pressed', String(i === idx));
    const name = document.createElement('b');
    name.textContent = `${i} ${s.name}`;
    const id = document.createElement('span');
    id.textContent = s.id;
    b.append(name, id);
    b.addEventListener('click', () => {
      if (i === idx) {
        list.hidden = true;
        chip.setAttribute('aria-expanded', 'false');
        return;
      }
      const u = new URL(location.href);
      if (s.id === DEFAULT_SCHEME_ID) u.searchParams.delete('pal');
      else u.searchParams.set('pal', s.id);
      location.replace(u.toString());
    });
    list.appendChild(b);
  });
  chip.addEventListener('click', () => {
    list.hidden = !list.hidden;
    chip.setAttribute('aria-expanded', String(!list.hidden));
  });
  host.append(chip, list);
}
