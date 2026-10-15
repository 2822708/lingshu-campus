/**
 * UID 分配/释放 API 客户端
 *
 * 设计：
 *   - 玩家新建存档时 allocate 一个 4 位 UID，拼到名字后面：`吕天睿#A3F7`
 *   - 删档时 release 该 UID，供其他玩家复用
 *   - 后台静默失败（服务器挂了就本地生成兜底，不阻塞游戏）
 */

const UID_LENGTH = 4;
const UID_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 从完整名字提取 UID（`吕天睿#A3F7` → `A3F7`），没有返回 null */
export function extractUidFromName(fullName: string): string | null {
  const idx = fullName.lastIndexOf('#');
  if (idx === -1 || idx === fullName.length - 1) return null;
  const tail = fullName.slice(idx + 1);
  if (tail.length !== UID_LENGTH) return null;
  for (const ch of tail) {
    if (!UID_ALPHABET.includes(ch)) return null;
  }
  return tail;
}

/** 从完整名字提取玩家本名（`吕天睿#A3F7` → `吕天睿`） */
export function extractPlayerName(fullName: string): string {
  const uid = extractUidFromName(fullName);
  if (!uid) return fullName;
  return fullName.slice(0, fullName.length - UID_LENGTH - 1);
}

/** 生成随机 UID（本地兜底，服务器挂了用） */
function generateRandomUid(): string {
  let s = '';
  for (let i = 0; i < UID_LENGTH; i++) {
    s += UID_ALPHABET[Math.floor(Math.random() * UID_ALPHABET.length)];
  }
  return s;
}

/** 从 Vite BASE_URL 推断 API base（同 leaderboardApi） */
function getApiBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : base + '/';
  return `${window.location.origin}${prefix}api/`;
}

/**
 * 分配一个新 UID
 *  - 服务器可连：从 /api/uid/allocate 拿
 *  - 服务器不可连：本地随机生成（不会重复，撞号概率极低）
 */
export async function allocateUid(): Promise<string> {
  try {
    const resp = await fetch(`${getApiBase()}uid/allocate`, {
      method: 'GET',
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.uid && typeof data.uid === 'string' && data.uid.length === UID_LENGTH) {
        return data.uid;
      }
    }
  } catch {
    // 服务器不可连，降级到本地
  }
  return generateRandomUid();
}

/**
 * 释放一个 UID（删档时调用）
 * 静默失败——释放失败最多浪费一个编号，不阻塞游戏
 */
export async function releaseUid(uid: string): Promise<void> {
  if (!uid || uid.length !== UID_LENGTH) return;
  try {
    await fetch(`${getApiBase()}uid/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    });
  } catch {
    // 静默失败
  }
}

/**
 * 把玩家名补成 `名字#XXXX` 格式
 *  - 已带 UID → 原样返回
 *  - 没带 → 先查服务端该本名是否已分配过 UID（复用，避免排行榜出现两条同名），
 *           没有再 allocate 新的（用于加载旧存档时的自动迁移）
 */
export async function ensureUid(fullName: string): Promise<string> {
  if (extractUidFromName(fullName)) return fullName; // 已有 UID，不动

  // 先尝试复用服务端已分配的同名 UID
  try {
    const resp = await fetch(
      `${getApiBase()}uid/by-name/${encodeURIComponent(fullName)}`,
      { method: 'GET' }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (
        data?.uid &&
        typeof data.uid === 'string' &&
        data.uid.length === UID_LENGTH
      ) {
        return `${fullName}#${data.uid}`;
      }
    }
  } catch {
    // 查不到/服务器挂了 → 继续走分配
  }

  // 服务端没这个本名的记录，或不可连 → 新分配
  const uid = await allocateUid();
  return `${fullName}#${uid}`;
}