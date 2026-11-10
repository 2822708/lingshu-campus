import { assertRogueRun } from './engine';
import type { RogueRun } from './types';

export const ROGUE_SAVE_KEY = 'lingshu-rogue-run-v1';
export const ROGUE_INVALID_BACKUP_KEY = `${ROGUE_SAVE_KEY}:invalid-backup`;
export const MAX_ROGUE_SAVE_BYTES = 2 * 1024 * 1024;
export type RogueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STALE_RECORD =
  '肉鸽记录已被其他页面更新，请刷新后继续。本次操作没有写入。';
const SAVE_FAILED = '本次操作未能保存，现场没有推进。请检查浏览器存储后重试。';

function requireByteLimit(raw: string): void {
  if (
    raw.length > MAX_ROGUE_SAVE_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_ROGUE_SAVE_BYTES
  )
    throw new Error('肉鸽记录超过大小限制。');
}

/** Bound JSON before the domain validator walks a supplied record. */
function assertJsonBounds(value: unknown): void {
  let count = 0;
  const seen = new WeakSet<object>();
  function visit(item: unknown, depth: number): void {
    if (++count > 80000 || depth > 24) throw new Error('肉鸽记录结构过大。');
    if (
      item === null ||
      item === undefined ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      return;
    if (typeof item === 'string') {
      if (item.length > 16384) throw new Error('肉鸽记录文本过长。');
      return;
    }
    if (typeof item !== 'object' || seen.has(item))
      throw new Error('肉鸽记录包含无效结构。');
    seen.add(item);
    if (Array.isArray(item)) {
      if (item.length > 2048) throw new Error('肉鸽记录列表过长。');
      for (const child of item) visit(child, depth + 1);
    } else {
      const prototype = Object.getPrototypeOf(item);
      const keys = Object.keys(item);
      if (
        (prototype !== Object.prototype && prototype !== null) ||
        keys.length > 128 ||
        keys.some(
          (key) =>
            key.length > 128 ||
            ['__proto__', 'prototype', 'constructor'].includes(key)
        )
      )
        throw new Error('肉鸽记录字段无效。');
      for (const key of keys)
        visit((item as Record<string, unknown>)[key], depth + 1);
    }
    seen.delete(item);
  }
  visit(value, 0);
}

function parseRun(raw: string): RogueRun {
  requireByteLimit(raw);
  const value: unknown = JSON.parse(raw);
  assertJsonBounds(value);
  assertRogueRun(value);
  return value;
}

function serializeRun(value: RogueRun): string {
  assertJsonBounds(value);
  assertRogueRun(value);
  const raw = JSON.stringify(value);
  // Validate the exact bytes to be stored, including omitted optional fields.
  parseRun(raw);
  return raw;
}

/** Object-key ordering or harmless whitespace does not make a record stale. */
function comparable(value: RogueRun): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0
          )
        )
      : item
  );
}

function initial(value: RogueRun): boolean {
  return (
    value.seq === 0 &&
    value.floor === 1 &&
    value.cleared === 0 &&
    value.phase === 'route' &&
    value.history.length === 0 &&
    value.battle === undefined &&
    value.reward === undefined
  );
}

function followsMap(previous: RogueRun, next: RogueRun): boolean {
  if (!previous.map) {
    return (
      !next.map ||
      (previous.phase === 'reward' &&
        previous.floor % 10 === 0 &&
        next.phase === 'route' &&
        next.floor === previous.floor + 1 &&
        next.map.startFloor === next.floor &&
        next.map.path.length === 0)
    );
  }
  if (!next.map || next.map.startFloor !== previous.map.startFloor)
    return false;
  const enteredNode = previous.phase === 'route' && next.phase !== 'route';
  return (
    next.map.path.length === previous.map.path.length + Number(enteredNode) &&
    previous.map.path.every((id, index) => next.map?.path[index] === id)
  );
}

function hashRaw(raw: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index++)
    hash = Math.imul(hash ^ raw.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(16);
}

/** Keep prior backups too; retrying a failed replacement reuses its own backup. */
function backupInvalid(storage: RogueStorage, raw: string): void {
  const hash = hashRaw(raw);
  for (let index = 0; index < 18; index++) {
    const key =
      index === 0
        ? ROGUE_INVALID_BACKUP_KEY
        : `${ROGUE_INVALID_BACKUP_KEY}:${hash}${index > 1 ? `-${index}` : ''}`;
    const existing = storage.getItem(key);
    if (existing === raw) return;
    if (existing === null) {
      storage.setItem(key, raw);
      return;
    }
  }
  throw new Error('无法保留损坏记录的备份。');
}

export function loadRogueRun(storage: RogueStorage): {
  state: RogueRun | null;
  error: string;
} {
  try {
    const raw = storage.getItem(ROGUE_SAVE_KEY);
    return { state: raw === null ? null : parseRun(raw), error: '' };
  } catch {
    return {
      state: null,
      error: '独立肉鸽记录无法读取。原记录已保留，请先确认是否重新开始。',
    };
  }
}

/** The caller serializes this compare-and-write using the independent Web Lock. */
export function commitRogueRun(
  storage: RogueStorage,
  previous: RogueRun | null,
  next: RogueRun,
  options: { replaceInvalid?: boolean } = {}
): { ok: boolean; error?: string } {
  try {
    const nextRaw = serializeRun(next);
    if (previous) serializeRun(previous);
    const raw = storage.getItem(ROGUE_SAVE_KEY);
    let current: RogueRun | null = null;
    let invalid = false;
    if (raw !== null) {
      try {
        current = parseRun(raw);
      } catch {
        invalid = true;
      }
    }
    if (invalid) {
      if (previous) return { ok: false, error: STALE_RECORD };
      if (options.replaceInvalid !== true)
        return {
          ok: false,
          error: '肉鸽记录损坏，请明确选择重新开始。原记录没有改动。',
        };
      if (!initial(next))
        return { ok: false, error: '只能从第一关建立新的肉鸽记录。' };
      // Never overwrite the original before its exact raw text is backed up.
      backupInvalid(storage, raw!);
    } else if (current) {
      if (!previous || comparable(current) !== comparable(previous))
        return { ok: false, error: STALE_RECORD };
      if (next.runId !== previous.runId) {
        if (!initial(next))
          return { ok: false, error: '重新开始必须从第一关建立新的肉鸽记录。' };
      } else if (
        next.seq !== previous.seq + 1 ||
        next.seed !== previous.seed ||
        next.jobId !== previous.jobId ||
        next.starterId !== previous.starterId ||
        !followsMap(previous, next)
      )
        return {
          ok: false,
          error: '操作已经处理或顺序无效，本次操作没有写入。',
        };
    } else {
      if (previous) return { ok: false, error: STALE_RECORD };
      if (!initial(next))
        return { ok: false, error: '需要先建立新的独立肉鸽记录。' };
    }
    storage.setItem(ROGUE_SAVE_KEY, nextRaw);
    return { ok: true };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}
