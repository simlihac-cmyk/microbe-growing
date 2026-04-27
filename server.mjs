import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(__dirname, "dist");
const host = process.env.MICROBE_HOST || "127.0.0.1";
const port = Number(process.env.MICROBE_PORT || 4130);

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

const server = createServer((req, res) => {
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
});

server.listen(port, host, () => {
  console.log(`[microbe-growing] serving ${distDir} at http://${host}:${port}`);
});
