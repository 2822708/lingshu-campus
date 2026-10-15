/**
 * 排行榜后端服务（纯 Node + JSON 文件持久化）
 *
 * API:
 *   POST /api/score                          提交一条成绩（玩家名唯一，upsert）
 *   GET  /api/leaderboard?type=credits|exp|realm|playtime&limit=100
 *                                            获取指定榜单的前 N 名
 *   GET  /api/player/:name                   获取单个玩家的最新记录
 *   GET  /healthz                            健康检查
 *
 * 设计:
 *   - 纯 JSON 文件持久化（data.json），无外部依赖、无编译
 *   - 每个玩家一行（按 name 唯一），升级时 upsert
 *   - 学阶门槛：只有 realm >= '硕士'（即本科结束）才能上榜
 *   - 限流：每个 IP 每 60 秒最多 5 次提交
 *   - 4 个榜单：
 *       credits   按学分降序
 *       exp       按绩点降序
 *       realm     按学阶排序（大四 < 硕士 < 博士 < 院士，同级按 realm_level）
 *       playtime  按游戏时长降序
 *   - 所有榜单 LIMIT 100（只保留前 100 名）
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 配置
// ============================================================
const PORT = parseInt(process.env.PORT || '8081', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.json');

// ============================================================
// 持久化（JSON 文件）
// ============================================================
function loadDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const obj = JSON.parse(raw);
    if (!Array.isArray(obj.players)) return { players: [], allocatedUids: [] };
    // 迁移：旧数据没有 allocatedUids 字段，从现有 player 自动推导
    if (!Array.isArray(obj.allocatedUids)) {
      obj.allocatedUids = obj.players
        .map((p) => extractUid(p.name))
        .filter(Boolean);
    }
    return obj;
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[db] load error:', e.message);
    return { players: [], allocatedUids: [] };
  }
}

function saveDB(db) {
  // 写入临时文件再 rename，避免半截文件导致数据损坏
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

let DB = loadDB();
console.log(`[db] loaded ${DB.players.length} players from ${DB_PATH}`);

// 每 100 个写入刷一次（高并发时），或 5 秒定时刷一次
let dirty = false;
function scheduleFlush() {
  dirty = true;
}
setInterval(() => {
  if (dirty) {
    saveDB(DB);
    dirty = false;
    console.log(`[db] flushed ${DB.players.length} players`);
  }
}, 5000);

process.on('SIGTERM', () => {
  if (dirty) saveDB(DB);
  process.exit(0);
});

// ============================================================
// 学阶排序权重
// ============================================================
const REALM_RANK = {
  '大一': 1,
  '大二': 2,
  '大三': 3,
  '大四': 4,
  '硕士': 5,
  '博士': 6,
  '院士': 7,
};
const MIN_REALM = '硕士'; // 本科结束才能上榜的门槛

// ============================================================
// UID（唯一标识符）系统：防重名 + 删档释放
// ============================================================
// 玩家名格式：`吕天睿#A3F7`，最后 4 字符是 UID（base58，去 0O1lI）
// 玩家创建存档时 allocate 一个，删档时 release，新玩家复用
const UID_LENGTH = 4;
const UID_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 56 字符（去 0O1lI）

function generateRandomUid() {
  let s = '';
  for (let i = 0; i < UID_LENGTH; i++) {
    s += UID_ALPHABET[Math.floor(Math.random() * UID_ALPHABET.length)];
  }
  return s;
}

/** 从完整名字里提取 UID 部分（"吕天睿#A3F7" → "A3F7"），没有则返回 null */
function extractUid(fullName) {
  const idx = fullName.lastIndexOf('#');
  if (idx === -1 || idx === fullName.length - 1) return null;
  const tail = fullName.slice(idx + 1);
  if (tail.length !== UID_LENGTH) return null;
  // 必须全是字母表里的字符
  for (const ch of tail) {
    if (!UID_ALPHABET.includes(ch)) return null;
  }
  return tail;
}

/** 从完整名字里提取玩家本名（"吕天睿#A3F7" → "吕天睿"） */
function extractPlayerName(fullName) {
  const idx = fullName.lastIndexOf('#');
  if (idx === -1) return fullName;
  const tail = fullName.slice(idx + 1);
  if (tail.length !== UID_LENGTH) return fullName;
  for (const ch of tail) {
    if (!UID_ALPHABET.includes(ch)) return fullName;
  }
  return fullName.slice(0, idx);
}

/** 分配一个未用的 UID；最多尝试 100 次防止极端碰撞 */
function allocateUid() {
  for (let i = 0; i < 100; i++) {
    const uid = generateRandomUid();
    if (!DB.allocatedUids.includes(uid)) {
      DB.allocatedUids.push(uid);
      scheduleFlush();
      return uid;
    }
  }
  throw new Error('UID 池已满，请联系服务维护方');
}

/** 释放 UID（删档时调用） */
function releaseUid(uid) {
  const idx = DB.allocatedUids.indexOf(uid);
  if (idx !== -1) {
    DB.allocatedUids.splice(idx, 1);
    scheduleFlush();
  }
}

// ============================================================
// 工具函数
// ============================================================
function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 16 * 1024) {
        req.destroy();
        reject(new Error('payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// ============================================================
// 限流：每个 IP 每 60 秒最多 5 次提交
// ============================================================
const submitCounts = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
function checkRate(ip) {
  const now = Date.now();
  const cur = submitCounts.get(ip);
  if (!cur || now > cur.resetAt) {
    submitCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (cur.count >= RATE_MAX) return false;
  cur.count++;
  return true;
}

// ============================================================
// 榜单排序
// ============================================================
function sortPlayers(type) {
  const arr = [...DB.players];
  if (type === 'credits') {
    arr.sort((a, b) => b.credits - a.credits || b.updated_at - a.updated_at);
  } else if (type === 'exp') {
    arr.sort((a, b) => b.exp - a.exp || b.updated_at - a.updated_at);
  } else if (type === 'playtime') {
    arr.sort((a, b) => b.playtime_seconds - a.playtime_seconds || b.updated_at - a.updated_at);
  } else if (type === 'realm') {
    arr.sort((a, b) => {
      const ra = REALM_RANK[a.realm] || 0;
      const rb = REALM_RANK[b.realm] || 0;
      if (rb !== ra) return rb - ra;
      if (b.realm_level !== a.realm_level) return b.realm_level - a.realm_level;
      return b.updated_at - a.updated_at;
    });
  }
  return arr;
}

const VALID_TYPES = new Set(['credits', 'exp', 'realm', 'playtime']);

// ============================================================
// HTTP 路由
// ============================================================
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  console.log(`[${new Date().toISOString()}] ${method} ${path}`);

  // 健康检查
  if (path === '/healthz') {
    return sendText(res, 200, 'ok');
  }

  // 提交成绩
  if (path === '/api/score' && method === 'POST') {
    const ip = getClientIp(req);
    if (!checkRate(ip)) {
      return sendJSON(res, 429, { error: '提交太频繁，请稍后再试' });
    }
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
    }

    const { name, realm, realmLevel, credits, exp, playtimeSeconds } = body || {};

    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 30) {
      return sendJSON(res, 400, { error: '玩家名必须在 1-30 个字符' });
    }
    // 验证 UID 格式：必须是 `名字#XXXX`（去 0O1lI 的 4 字符）
    const extractedUid = extractUid(name.trim());
    if (!extractedUid) {
      return sendJSON(res, 400, {
        error: '玩家名必须包含 # 后跟 4 位唯一编号（如"小明#A3F7"），用于防止重名',
      });
    }
    if (!REALM_RANK[realm] || REALM_RANK[realm] < REALM_RANK[MIN_REALM]) {
      return sendJSON(res, 403, {
        error: `需要达到"${MIN_REALM}"学阶才能上榜（当前：${realm || '未提供'}）。本科结束再来吧！`,
      });
    }
    const rl = Number(realmLevel);
    const cr = Number(credits) || 0;
    const ex = Number(exp) || 0;
    const pt = Number(playtimeSeconds) || 0;
    if (!Number.isFinite(rl) || rl < 1 || rl > 99) {
      return sendJSON(res, 400, { error: '学阶等级无效' });
    }
    if (cr < 0 || cr > 1e9 || ex < 0 || ex > 1e9 || pt < 0 || pt > 1e10) {
      return sendJSON(res, 400, { error: '数值超出合理范围' });
    }

    const trimmedName = name.trim();
    // 用 `名字+UID` 整体做主键（同名的两个玩家因为 UID 不同能区分）
    const existing = DB.players.find((p) => p.name === trimmedName);
    const now = Date.now();
    if (existing) {
      // upsert：保留各项最大值
      existing.realm = realm;
      existing.realm_level = rl;
      existing.credits = Math.max(existing.credits, cr);
      existing.exp = Math.max(existing.exp, ex);
      existing.playtime_seconds = Math.max(existing.playtime_seconds, pt);
      existing.updated_at = now;
    } else {
      DB.players.push({
        name: trimmedName,
        displayName: extractPlayerName(trimmedName), // 仅玩家本名（脱 UID）
        realm,
        realm_level: rl,
        credits: cr,
        exp: ex,
        playtime_seconds: pt,
        updated_at: now,
      });
    }
    scheduleFlush();
    console.log(`[score] ${trimmedName} (${realm} Lv.${rl}) credits=${cr} exp=${ex} playtime=${pt}s from ${ip}`);
    return sendJSON(res, 200, { ok: true });
  }

  // 榜单
  if (path === '/api/leaderboard' && method === 'GET') {
    const type = url.searchParams.get('type') || 'credits';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 100);
    if (!VALID_TYPES.has(type)) {
      return sendJSON(res, 400, {
        error: `未知榜单类型：${type}，可选 ${[...VALID_TYPES].join(', ')}`,
      });
    }
    const sorted = sortPlayers(type).slice(0, limit);
    return sendJSON(res, 200, {
      type,
      limit,
      total: sorted.length,
      entries: sorted.map((p, idx) => ({
        rank: idx + 1,
        name: p.name, // 完整 `名字#XXXX`
        displayName: p.displayName || extractPlayerName(p.name), // 仅玩家本名
        realm: p.realm,
        realm_level: p.realm_level,
        credits: p.credits,
        exp: p.exp,
        playtime_seconds: p.playtime_seconds,
        updated_at: new Date(p.updated_at).toISOString(),
      })),
    });
  }

  // 单个玩家
  const playerMatch = path.match(/^\/api\/player\/(.+)$/);
  if (playerMatch && method === 'GET') {
    const name = decodeURIComponent(playerMatch[1]);
    const p = DB.players.find((x) => x.name === name);
    if (!p) return sendJSON(res, 404, { error: '玩家未上榜' });
    return sendJSON(res, 200, {
      name: p.name,
      displayName: p.displayName || extractPlayerName(p.name),
      realm: p.realm,
      realm_level: p.realm_level,
      credits: p.credits,
      exp: p.exp,
      playtime_seconds: p.playtime_seconds,
      updated_at: new Date(p.updated_at).toISOString(),
    });
  }

  // ============================================================
  // UID 端点
  // ============================================================
  // GET /api/uid/allocate → 分配一个新 UID（防重名用）
  if (path === '/api/uid/allocate' && method === 'GET') {
    const uid = allocateUid();
    return sendJSON(res, 200, { uid });
  }

  // GET /api/uid/by-name/:displayName → 返回该玩家本名已分配的 UID（用于复用防重名）
  const uidByNameMatch = path.match(/^\/api\/uid\/by-name\/(.+)$/);
  if (uidByNameMatch && method === 'GET') {
    const displayName = decodeURIComponent(uidByNameMatch[1]);
    const player = DB.players.find(
      (p) => (p.displayName || extractPlayerName(p.name)) === displayName
    );
    if (player) {
      const uid = extractUid(player.name);
      if (uid) {
        return sendJSON(res, 200, { name: displayName, uid });
      }
    }
    return sendJSON(res, 404, { error: '该名字还未上榜或没有 UID' });
  }

  // POST /api/uid/release  body: { uid } → 释放 UID（删档时调用）
  if (path === '/api/uid/release' && method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
    }
    const { uid } = body || {};
    if (typeof uid !== 'string' || !extractUid(`x#${uid}`)) {
      return sendJSON(res, 400, { error: 'uid 格式错误（4 字符 base58）' });
    }
    releaseUid(uid);
    console.log(`[uid] released ${uid} from ${getClientIp(req)}`);
    return sendJSON(res, 200, { ok: true, uid });
  }

  return sendJSON(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[error]', err);
    if (!res.headersSent) {
      sendJSON(res, 500, { error: 'server error: ' + (err?.message || String(err)) });
    } else {
      res.end();
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[ready] leaderboard server listening on http://${HOST}:${PORT}`);
});