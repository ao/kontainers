// kontainers' own database on /data: telling a full or read-only volume apart from other errors,
// and remembering that writes failed, so every page can say so for a while.

export const diskFull = (e: unknown) => /SQLITE_FULL|database or disk is full|SQLITE_READONLY|readonly database/i.test(`${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? ''}`);
export const DISK_FULL = 'kontainers could not write its database: the data volume is full or read-only. Free space on it (/data in the image) and try again';

const SHOW_MS = 10 * 60_000;
let firstAt = 0;
let lastAt = 0;

// Logs a failed write that the caller carries on without; a full or read-only volume is also noted
// for the banner.
export function writeFailed(e: unknown, what: string, now = Date.now()): void {
  console.error(`kontainers: ${what}: ${(e as Error)?.message ?? String(e)}`);
  if (!diskFull(e)) return;
  if (!lastAt || now - lastAt > SHOW_MS) firstAt = now;
  lastAt = now;
}

// What every page says while writes fail: shown until ten minutes pass without a failed write.
export function storageTrouble(now = Date.now()): string | null {
  if (!lastAt || now - lastAt > SHOW_MS) return null;
  return `Since ${new Date(firstAt).toISOString().slice(11, 16)} UTC kontainers cannot write its database: the data volume is full or read-only. Actions still work, but the Activity log, automatic update results and the record of sent notifications are not being saved. Free space on the volume (/data in the image).`;
}

export function resetStorageTrouble(): void { firstAt = 0; lastAt = 0; }
