import { RENDER_VERSION } from '@td/render';
import { SIM_VERSION } from '@td/sim';
import { UI_VERSION } from '@td/ui';

/**
 * 正式游戏入口。M0-1 只验证包之间能组装起来。
 */
const note = document.getElementById('note');
if (note) note.textContent = `网球总监 · sim v${SIM_VERSION} · render v${RENDER_VERSION} · ui v${UI_VERSION}`;
