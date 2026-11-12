import { fromSave, type SaveFile, toSave } from '@td/sim';
import type { Session } from './session';

/**
 * 自动存档：IndexedDB 里一个键（auto）。每天收工和每 30 秒存一次。
 * 浏览器不让用（隐私模式、预览环境）就悄悄跳过，游戏照常能玩。
 */

const DB = 'tennis-director';
const STORE = 'saves';
const KEY = 'auto';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function writeAutosave(session: Session): Promise<void> {
  try {
    const db = await open();
    const file = toSave(session.s, session.log);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(file, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* 存不了就算了 */
  }
}

export async function readAutosave(contentVersion: string): Promise<SaveFile | null> {
  try {
    const db = await open();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!raw) return null;
    const { save, warnings } = fromSave(raw, contentVersion);
    for (const w of warnings) console.warn(`[save] ${w}`);
    return save.state.outcome ? null : save;
  } catch (e) {
    console.warn('[save] could not read autosave', e);
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* 同上 */
  }
}

/** 开发版"导出存档"：存档加命令日志存成 JSON 文件，复现 bug 用 */
export function downloadSave(session: Session): void {
  const blob = new Blob([JSON.stringify(toSave(session.s, session.log), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tennis-director-day${Math.floor(session.s.t / 1440) + 1}-seed${session.s.seed}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
