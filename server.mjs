import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(__dirname, "dist");
const host = process.env.MICROBE_HOST || "127.0.0.1";
const port = Number(process.env.MICROBE_PORT || 4130);
const dataDir = resolve(process.env.MICROBE_DATA_DIR || join(__dirname, "data"));
const dbPath = resolve(process.env.MICROBE_DB_PATH || join(dataDir, "leaderboard.sqlite"));
const rankingRunTtlMs = 30 * 24 * 60 * 60 * 1_000;
const rankingRunFreshnessMs = 5 * 60 * 1_000;
const leaderboardSubmitLimits = new Map();
const rankingRunCreateLimits = new Map();
const rankingMinRunAgeMs = {
  24: 60_000,
  25: 90_000,
  26: 120_000,
  27: 180_000,
  28: 240_000,
  29: 300_000,
};

const organismNames = [
  "미약한 미생물",
  "작은 미생물",
  "단순한 미생물",
  "복잡한 미생물",
  "귀여운 미생물",
  "기쁜 미생물",
  "슬픈 미생물",
  "적응한 미생물",
  "화난 미생물",
  "극대노 미생물",
  "변이 미생물",
  "악독한 세균",
  "안정된 세균",
  "강화된 세균",
  "환경적응 세균",
  "공생 세균",
  "기생 세균",
  "공격형 세균",
  "내성 세균",
  "고속증식 세균",
  "특이변종 세균",
  "강독성 세균",
  "돌연변이 세균",
  "폭주 세균",
  "방사능 세균",
  "코로나",
  "살모넬라",
  "비행 세균",
  "우주로간 세균",
  "아스트로파지",
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".apk": "application/vnd.android.package-archive",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    level INTEGER NOT NULL CHECK (level BETWEEN 24 AND 29),
    stage_name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('easy', 'hard')),
    submitted_at INTEGER NOT NULL,
    month_key TEXT NOT NULL,
    is_astrophage INTEGER NOT NULL CHECK (is_astrophage IN (0, 1))
  );

  CREATE INDEX IF NOT EXISTS idx_leaderboard_month_rank
    ON leaderboard_entries (month_key, level DESC, submitted_at ASC);

  CREATE TABLE IF NOT EXISTS ranking_runs (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK (mode IN ('easy', 'hard')),
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    max_level INTEGER NOT NULL CHECK (max_level BETWEEN 0 AND 29),
    checkpoint_count INTEGER NOT NULL,
    client_key TEXT NOT NULL DEFAULT '',
    submitted_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_ranking_runs_created_at
    ON ranking_runs (created_at);
`);

const selectLeaderboard = db.prepare(`
  SELECT
    id,
    name,
    level,
    stage_name AS stageName,
    mode,
    submitted_at AS submittedAt,
    month_key AS monthKey,
    is_astrophage AS isAstrophage
  FROM leaderboard_entries
  WHERE month_key = ?
  ORDER BY level DESC, submitted_at ASC, rowid ASC
  LIMIT 100
`);

const insertLeaderboard = db.prepare(`
  INSERT INTO leaderboard_entries (
    id,
    name,
    level,
    stage_name,
    mode,
    submitted_at,
    month_key,
    is_astrophage
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectRankingRun = db.prepare(`
  SELECT
    id,
    mode,
    created_at AS createdAt,
    last_seen_at AS lastSeenAt,
    max_level AS maxLevel,
    checkpoint_count AS checkpointCount,
    client_key AS clientKey,
    submitted_at AS submittedAt
  FROM ranking_runs
  WHERE id = ?
`);

const insertRankingRun = db.prepare(`
  INSERT INTO ranking_runs (
    id,
    mode,
    created_at,
    last_seen_at,
    max_level,
    checkpoint_count,
    client_key,
    submitted_at
  )
  VALUES (?, ?, ?, ?, 0, 0, ?, NULL)
`);

const updateRankingRunCheckpoint = db.prepare(`
  UPDATE ranking_runs
  SET
    last_seen_at = ?,
    max_level = max(max_level, ?),
    checkpoint_count = checkpoint_count + 1
  WHERE id = ?
    AND mode = ?
    AND submitted_at IS NULL
`);

const markRankingRunSubmitted = db.prepare(`
  UPDATE ranking_runs
  SET submitted_at = ?
  WHERE id = ?
    AND submitted_at IS NULL
`);

const deleteExpiredRankingRuns = db.prepare(`
  DELETE FROM ranking_runs
  WHERE created_at < ?
`);

deleteExpiredRankingRuns.run(Date.now() - rankingRunTtlMs);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(distDir, normalizedPath);

  if (!filePath.startsWith(distDir)) {
    return null;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    filePath = join(distDir, "index.html");
  }

  return filePath;
}

function getMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? `${date.getFullYear()}`;
  const month = parts.find((part) => part.type === "month")?.value ?? `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function normalizeMonthKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? value : getMonthKey();
}

function rowToLeaderboardEntry(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    level: Number(row.level),
    stageName: String(row.stageName),
    mode: row.mode === "hard" ? "hard" : "easy",
    submittedAt: Number(row.submittedAt),
    monthKey: String(row.monthKey),
    isAstrophage: row.isAstrophage === 1,
  };
}

function getLeaderboardEntries(monthKey = getMonthKey()) {
  return selectLeaderboard.all(monthKey).map(rowToLeaderboardEntry);
}

function rowToRankingRun(row) {
  return {
    id: String(row.id),
    mode: row.mode === "hard" ? "hard" : "easy",
    createdAt: Number(row.createdAt),
    lastSeenAt: Number(row.lastSeenAt),
    maxLevel: Number(row.maxLevel),
    checkpointCount: Number(row.checkpointCount),
    clientKey: String(row.clientKey),
    submittedAt: row.submittedAt === null ? null : Number(row.submittedAt),
  };
}

function getRankingRun(runId) {
  if (!runId) return null;
  const row = selectRankingRun.get(runId);
  return row ? rowToRankingRun(row) : null;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...apiCorsHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function apiCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
  };
}

async function readJsonBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2048) {
      throw Object.assign(new Error("요청이 너무 큽니다."), { status: 413 });
    }
  }

  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw Object.assign(new Error("JSON 형식이 올바르지 않습니다."), { status: 400 });
  }
}

async function handleRankingRunApi(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...apiCorsHeaders(),
      "cache-control": "no-store",
    });
    res.end();
    return;
  }

  if (req.method === "POST") {
    const payload = await readJsonBody(req);
    const mode = payload.mode === "easy" || payload.mode === "hard" ? payload.mode : null;
    if (!mode) {
      sendJson(res, 400, { error: "랭킹 검증 모드가 올바르지 않습니다." });
      return;
    }

    const now = Date.now();
    const requestedRunId = typeof payload.runId === "string" ? payload.runId : "";
    const existingRun = getRankingRun(requestedRunId);
    if (
      existingRun &&
      existingRun.mode === mode &&
      existingRun.submittedAt === null &&
      now - existingRun.createdAt <= rankingRunTtlMs
    ) {
      sendJson(res, 200, { runId: existingRun.id, createdAt: existingRun.createdAt });
      return;
    }

    const retryAfter = consumeRateLimit(rankingRunCreateLimits, getClientKey(req), 60, 10 * 60 * 1_000);
    if (retryAfter > 0) {
      sendJson(res, 429, { error: `랭킹 검증 요청이 너무 많습니다. ${retryAfter}초 후 다시 시도하세요.` });
      return;
    }

    const runId = randomUUID();
    insertRankingRun.run(runId, mode, now, now, getClientKey(req));
    sendJson(res, 201, { runId, createdAt: now });
    return;
  }

  if (req.method === "PATCH") {
    const payload = await readJsonBody(req);
    const runId = typeof payload.runId === "string" ? payload.runId : "";
    const mode = payload.mode === "easy" || payload.mode === "hard" ? payload.mode : null;
    const level = typeof payload.level === "number" ? Math.floor(payload.level) : NaN;

    if (!runId || !mode || !Number.isInteger(level) || level < 0 || level > 29) {
      sendJson(res, 400, { error: "랭킹 검증 진행 정보가 올바르지 않습니다." });
      return;
    }

    const run = getRankingRun(runId);
    const now = Date.now();
    if (!run || run.mode !== mode || run.submittedAt !== null || now - run.createdAt > rankingRunTtlMs) {
      sendJson(res, 409, { error: "랭킹 검증 세션이 만료되었습니다." });
      return;
    }

    updateRankingRunCheckpoint.run(now, level, runId, mode);
    const updatedRun = getRankingRun(runId);
    sendJson(res, 200, { runId, maxLevel: updatedRun?.maxLevel ?? level });
    return;
  }

  sendJson(res, 405, { error: "지원하지 않는 요청입니다." });
}

async function handleLeaderboardApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...apiCorsHeaders(),
      "cache-control": "no-store",
    });
    res.end();
    return;
  }

  if (req.method === "GET") {
    const monthKey = normalizeMonthKey(url.searchParams.get("month"));
    sendJson(res, 200, { monthKey, entries: getLeaderboardEntries(monthKey) });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "지원하지 않는 요청입니다." });
    return;
  }

  const retryAfter = consumeRateLimit(leaderboardSubmitLimits, getClientKey(req), 8, 10 * 60 * 1_000);
  if (retryAfter > 0) {
    sendJson(res, 429, { error: `랭킹 등록 요청이 너무 많습니다. ${retryAfter}초 후 다시 시도하세요.` });
    return;
  }

  const payload = await readJsonBody(req);
  const name = typeof payload.name === "string" ? payload.name.trim().replace(/\s+/g, " ").slice(0, 12) : "";
  const mode = payload.mode === "easy" || payload.mode === "hard" ? payload.mode : null;
  const level = typeof payload.level === "number" ? Math.floor(payload.level) : NaN;
  const runId = typeof payload.runId === "string" ? payload.runId : "";

  if (!name) {
    sendJson(res, 400, { error: "이름을 입력하세요." });
    return;
  }

  if (!mode || !Number.isInteger(level) || level < 24 || level > 29) {
    sendJson(res, 400, { error: "+24 이상 미생물만 랭킹에 등록할 수 있습니다." });
    return;
  }

  const submittedAt = Date.now();
  const rankingRunError = validateRankingRunForSubmit(runId, mode, level, submittedAt);
  if (rankingRunError) {
    sendJson(res, 400, { error: rankingRunError });
    return;
  }

  const monthKey = getMonthKey(new Date(submittedAt));
  const stageName = organismNames[level];
  const entry = {
    id: randomUUID(),
    name,
    level,
    stageName,
    mode,
    submittedAt,
    monthKey,
    isAstrophage: level === 29,
  };

  insertLeaderboard.run(
    entry.id,
    entry.name,
    entry.level,
    entry.stageName,
    entry.mode,
    entry.submittedAt,
    entry.monthKey,
    entry.isAstrophage ? 1 : 0,
  );
  markRankingRunSubmitted.run(submittedAt, runId);

  sendJson(res, 201, { monthKey, entry, entries: getLeaderboardEntries(monthKey) });
}

function validateRankingRunForSubmit(runId, mode, level, now) {
  const run = getRankingRun(runId);
  if (!run) return "랭킹 검증 정보가 없습니다. 게임 화면을 새로고침한 뒤 다시 시도하세요.";
  if (run.mode !== mode) return "랭킹 검증 모드가 현재 모드와 다릅니다.";
  if (run.submittedAt !== null) return "이미 랭킹에 등록한 진행입니다.";
  if (now - run.createdAt > rankingRunTtlMs) return "랭킹 검증 시간이 만료되었습니다. 새 진행으로 다시 도전하세요.";
  if (run.maxLevel < level) return "랭킹 검증 단계가 현재 미생물 단계와 맞지 않습니다. 잠시 후 다시 시도하세요.";
  if (now - run.lastSeenAt > rankingRunFreshnessMs) return "랭킹 검증 정보가 오래되었습니다. 게임 화면에서 다시 시도하세요.";

  const minimumAge = rankingMinRunAgeMs[level] ?? 0;
  const currentAge = now - run.createdAt;
  if (currentAge < minimumAge) {
    return `랭킹 신뢰도 검증을 위해 ${formatDuration(minimumAge - currentAge)} 후 다시 등록하세요.`;
  }

  return null;
}

function getClientKey(req) {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp) return cfIp;
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return req.socket.remoteAddress || "unknown";
}

function consumeRateLimit(bucket, key, limit, windowMs) {
  const now = Date.now();
  const entry = bucket.get(key);
  if (!entry || now >= entry.resetAt) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  if (entry.count >= limit) {
    return Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
  }
  entry.count += 1;
  return 0;
}

function formatDuration(ms) {
  const seconds = Math.ceil(ms / 1_000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes}분` : `${minutes}분 ${remainingSeconds}초`;
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${host}:${port}`);

  if (url.pathname === "/api/leaderboard") {
    await handleLeaderboardApi(req, res, url);
    return;
  }

  if (url.pathname === "/api/ranking-run") {
    await handleRankingRunApi(req, res);
    return;
  }

  if (!existsSync(distDir)) {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end("Build output not found. Run npm run build first.");
    return;
  }

  const filePath = resolveRequestPath(req.url || "/");

  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const extension = extname(filePath);
  const isAsset = filePath.includes(`${distDir}/assets/`);

  res.writeHead(200, {
    "content-type": mimeTypes[extension] || "application/octet-stream",
    "cache-control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
  });

  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    const status = typeof error.status === "number" ? error.status : 500;
    if (status >= 500) console.error("[microbe-growing] request failed", error);
    sendJson(res, status, { error: error.message || "서버 오류가 발생했습니다." });
  });
});

server.listen(port, host, () => {
  console.log(`[microbe-growing] serving ${distDir} at http://${host}:${port}`);
  console.log(`[microbe-growing] leaderboard db: ${dbPath}`);
});
