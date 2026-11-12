import type { Plugin } from 'vite';
import { compileContent, formatIssues } from './compile';
import { DATA_DIR, readContentFiles } from './node';

/**
 * 内容热重载（技术文档 M3）：开发服务器盯着 data/ 下的 YAML，一改就重新编译。
 *
 * - 编译通过：把新的内容包推给页面（自定义事件 td:content），游戏不刷新、不丢进度，下一张卡就用新内容。
 * - 编译失败：弹 Vite 的错误层，写清是哪个文件哪一行的什么问题；改对了错误层自动消失。
 *
 * 生成的 JSON 不在这里写；提交前照常运行 pnpm content（CI 的 check:content 会检查）。
 */
export function contentHotReload(): Plugin {
  return {
    name: 'td-content-hot-reload',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(DATA_DIR);
      let timer: ReturnType<typeof setTimeout> | null = null;
      const rebuild = (file: string) => {
        if (!file.startsWith(DATA_DIR) || !/\.ya?ml$/.test(file)) return;
        if (timer) clearTimeout(timer);
        // 编辑器保存时常常连着触发几次，等一下再编译
        timer = setTimeout(() => {
          const t0 = performance.now();
          const r = compileContent(readContentFiles());
          const ms = Math.round(performance.now() - t0);
          if (!r.bundle) {
            const message = `Content errors (${r.errors.length})\n\n${formatIssues(r.errors)}`;
            server.config.logger.error(`[content] ${message}`, { timestamp: true });
            server.ws.send({ type: 'error', err: { message, stack: '', plugin: 'td-content', id: file } });
            return;
          }
          const warnings = r.warnings.map((w) => `${w.file}: ${w.message}`);
          server.config.logger.info(
            `[content] reloaded ${r.bundle.cards.length} cards in ${ms} ms · ${r.bundle.version}${warnings.length ? ` · ${warnings.length} warnings` : ''}`,
            { timestamp: true },
          );
          server.ws.send({ type: 'custom', event: 'td:content', data: { bundle: r.bundle, warnings } });
        }, 60);
      };
      server.watcher.on('change', rebuild);
      server.watcher.on('add', rebuild);
      server.watcher.on('unlink', rebuild);
    },
  };
}
