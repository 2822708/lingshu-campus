/**
 * 排行榜 API 客户端
 *
 * 调用服务器端 /xiuxian/api/* 反代路径（具体 host 由 base 推断）：
 * - 本地 dev:    http://localhost:3000/xiuxian/api/
 * - 服务器部署:  http://124.223.45.22/xiuxian/api/
 *
 * 浏览器能直接调用 API（同源或服务器 CORS 允许 *）。
 * 调用失败（网络/服务器/CORS）静默降级，不影响游戏主流程。
 */

const REALM_RANK: Record<string, number> = {
  大一: 1,
  大二: 2,
  大三: 3,
  大四: 4,
  硕士: 5,
  博士: 6,
  院士: 7,
};

export type LeaderboardType = 'credits' | 'exp' | 'realm' | 'playtime';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  displayName?: string; // 服务端返回的"仅玩家本名"（去 UID）
  realm: string;
  realm_level: number;
  credits: number;
  exp: number;
  playtime_seconds: number;
  updated_at: string;
}

export interface LeaderboardResponse {
  type: LeaderboardType;
  limit: number;
  total: number;
  entries: LeaderboardEntry[];
}

/** 推断 API base（用于开发/部署都生效） */
function getApiBase(): string {
  // Vite 的 import.meta.env.BASE_URL 会随 dev/build 配置变化
  // dev 默认 '/', build:server 配置 '/xiuxian/'
  const base = import.meta.env.BASE_URL || '/';
  // 确保末尾有斜杠
  const prefix = base.endsWith('/') ? base : base + '/';
  return `${window.location.origin}${prefix}api/`;
}

/** 静默 fetch —— 失败返回 null，不抛异常 */
async function tryFetch<T>(
  url: string,
  init?: RequestInit
): Promise<T | null> {
  try {
    const resp = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

/** 提交成绩（本科结束后自动调用，玩家手动也能调） */
export async function submitScore(
  player: {
    name: string;
    realm: string;
    realmLevel: number;
    spiritStones: number;
    exp: number;
  },
  playtimeSeconds: number
): Promise<boolean> {
  const url = `${getApiBase()}score`;
  const resp = await tryFetch<{ ok: boolean }>(url, {
    method: 'POST',
    body: JSON.stringify({
      name: player.name,
      realm: player.realm,
      realmLevel: player.realmLevel,
      credits: player.spiritStones,
      exp: player.exp,
      playtimeSeconds,
    }),
  });
  return !!resp?.ok;
}

/** 拉取榜单 */
export async function fetchLeaderboard(
  type: LeaderboardType,
  limit = 100
): Promise<LeaderboardResponse | null> {
  const url = `${getApiBase()}leaderboard?type=${type}&limit=${limit}`;
  return tryFetch<LeaderboardResponse>(url);
}

/** 学阶是否达到"本科结束"门槛 */
export function isEligibleForLeaderboard(realm: string): boolean {
  return (REALM_RANK[realm] || 0) >= (REALM_RANK['硕士'] || 0);
}