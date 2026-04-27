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
  ".svg": "image/svg+xml",
  ".png": "image/png",
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

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
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

async function handleLeaderboardApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
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

  const payload = await readJsonBody(req);
  const name = typeof payload.name === "string" ? payload.name.trim().replace(/\s+/g, " ").slice(0, 12) : "";
  const mode = payload.mode === "easy" || payload.mode === "hard" ? payload.mode : null;
  const level = typeof payload.level === "number" ? Math.floor(payload.level) : NaN;

  if (!name) {
    sendJson(res, 400, { error: "이름을 입력하세요." });
    return;
  }

  if (!mode || !Number.isInteger(level) || level < 24 || level > 29) {
    sendJson(res, 400, { error: "+24 이상 미생물만 랭킹에 등록할 수 있습니다." });
    return;
  }

  const submittedAt = Date.now();
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

  sendJson(res, 201, { monthKey, entry, entries: getLeaderboardEntries(monthKey) });
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${host}:${port}`);

  if (url.pathname === "/api/leaderboard") {
    await handleLeaderboardApi(req, res, url);
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
