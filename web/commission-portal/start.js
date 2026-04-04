"use strict";

/**
 * public/ 정적 서빙 + 저장소 내 화이트리스트 경로만 /serve/ 로 열람 (로컬·배포 공통)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const publicDir = path.join(__dirname, "public");
/** 화면 제목·부제·기준일 등 — `web/source`(편집 원본). `npm start` 시 `/source/…` 로 서빙 */
const sourceWebDir = path.join(__dirname, "..", "source");
const repoRoot = process.env.COMMISSION_REPO_ROOT
  ? path.resolve(process.env.COMMISSION_REPO_ROOT)
  : path.resolve(__dirname, "..", "..");
const port = Number(process.env.PORT) || 3000;

/** Docker 등에서 monorepo 루트가 없으면 /serve 비활성화(잘못된 루트 노출 방지) */
function repoHasTrackedLayout() {
  try {
    return (
      fs.existsSync(path.join(repoRoot, "행정심판최종본")) ||
      fs.existsSync(path.join(repoRoot, "행정심판청구(증거)", "최종")) ||
      fs.existsSync(path.join(repoRoot, "행정심판청구(증거)")) ||
      fs.existsSync(path.join(repoRoot, "행정심판청구(최종)"))
    );
  } catch {
    return false;
  }
}
const serveRepoFiles = repoHasTrackedLayout();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function safeJoin(base, reqPath) {
  const decoded = decodeURIComponent(reqPath.split("?")[0]);
  const rel = decoded.replace(/^\/+/, "");
  const full = path.join(base, rel);
  if (!full.startsWith(base)) return null;
  return full;
}

/** `/serve/` 상대 경로를 디스크 상대 경로로 그대로 쓴다(제출 정본은 `행정심판청구(최종)/`). */
function toDiskRelPosix(norm) {
  return norm;
}

/** /serve/ 이후 경로(슬래시 구분)가 저장소 내 허용 폴더만 허용 */
function isAllowedRepoRel(relPosix) {
  if (!relPosix || relPosix.includes("..")) return false;
  const norm = relPosix
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
  if (norm.startsWith("행정심판청구(최종)/")) return true;
  if (norm.startsWith("행정심판최종본/")) return true;
  if (norm.startsWith("행정심판청구(증거)/최종/갑호증/")) return true;
  if (norm.startsWith("행정심판청구(증거)/최종/첨부/")) return true;
  if (norm.startsWith("행정심판청구(증거)/최종/법령정보/")) return true;
  if (norm.startsWith("행정심판청구(증거)/최종/(국가법령정보)판례모음/")) return true;
  if (norm.startsWith("행정심판청구(증거)/최종/작업/")) return true;
  /** 구 트리: `…/증거/갑호증/` 등(최종 폴더 없이 둔 경우) */
  if (norm.startsWith("행정심판청구(증거)/갑호증/")) return true;
  if (norm.startsWith("행정심판청구(증거)/첨부/")) return true;
  if (norm.startsWith("행정심판청구(증거)/법령정보/")) return true;
  if (norm.startsWith("행정심판청구(증거)/(국가법령정보)판례모음/")) return true;
  if (norm.startsWith("행정심판청구(증거)/작업/")) return true;
  return false;
}

function isResolvedUnderRepoRoot(resolved, rootResolved) {
  if (os.platform() === "win32") {
    const r = resolved.toLowerCase();
    const root = rootResolved.toLowerCase();
    return r === root || r.startsWith(root + path.sep);
  }
  const relToRoot = path.relative(rootResolved, resolved);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    return false;
  }
  return true;
}

function resolveRepoFile(relPosix) {
  const norm = relPosix
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
  if (!isAllowedRepoRel(norm)) return null;
  const diskNorm = toDiskRelPosix(norm);
  const parts = diskNorm.split("/").filter(Boolean);
  const full = path.join(repoRoot, ...parts);
  const resolved = path.resolve(full);
  const rootResolved = path.resolve(repoRoot);
  if (!isResolvedUnderRepoRoot(resolved, rootResolved)) {
    return null;
  }
  /** 1순위: 요청한 경로 그대로 */
  try {
    const st = fs.statSync(resolved);
    if (st.isFile()) return resolved;
  } catch {
    /* 없거나 접근 불가 — 아래에서 대체 경로 시도 */
  }
  /** 정본 `…/증거/최종/…` 에 파일이 없으면 구 `…/증거/…`(최종 없음) 경로 시도 */
  if (norm.startsWith("행정심판청구(증거)/최종/")) {
    const legacyNorm =
      "행정심판청구(증거)/" + norm.slice("행정심판청구(증거)/최종/".length);
    const legacyParts = legacyNorm.split("/").filter(Boolean);
    const legacyResolved = path.resolve(path.join(repoRoot, ...legacyParts));
    if (isResolvedUnderRepoRoot(legacyResolved, rootResolved)) {
      try {
        const st = fs.statSync(legacyResolved);
        if (st.isFile()) return legacyResolved;
      } catch {
        /* 구 경로 없음 */
      }
    }
  }
  /** `행정심판최종본/…`에만 있고 `행정심판청구(최종)/…`에는 없는 클론 호환 */
  if (norm.startsWith("행정심판청구(최종)/")) {
    const altNorm =
      "행정심판최종본/" + norm.slice("행정심판청구(최종)/".length);
    const altParts = altNorm.split("/").filter(Boolean);
    const altResolved = path.resolve(path.join(repoRoot, ...altParts));
    if (isResolvedUnderRepoRoot(altResolved, rootResolved)) {
      try {
        const st = fs.statSync(altResolved);
        if (st.isFile()) return altResolved;
      } catch {
        /* 없음 */
      }
    }
  }
  return resolved;
}

/** 저장 전용: `resolveRepoFile` 과 달리 대체 경로로 바꾸지 않음(정본은 항상 `행정심판청구(최종)/`). */
function resolveRepoFileExact(relPosix) {
  const norm = relPosix
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
  if (!isAllowedRepoRel(norm)) return null;
  const parts = norm.split("/").filter(Boolean);
  const resolved = path.resolve(path.join(repoRoot, ...parts));
  const rootResolved = path.resolve(repoRoot);
  if (!isResolvedUnderRepoRoot(resolved, rootResolved)) {
    return null;
  }
  return resolved;
}

/** 로컬 편집기에서만 저장 허용(화이트리스트). 경로 = `행정심판청구(최종)/`. */
const WRITABLE_MD_REL = new Set([
  "행정심판청구(최종)/260404_01_행정심판청구서_최종.md",
  "행정심판청구(최종)/260404_02_집행정지신청서_최종.md",
  "행정심판청구(최종)/260404_별지_사실관계_시간축_정리표.md",
  "행정심판청구(최종)/260404/260404_별지_갑호증_목록_드롭다운.md",
]);

const MAX_SAVE_BODY = 12 * 1024 * 1024;

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error("payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendFile(res, absPath, method) {
  fs.stat(absPath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(absPath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=60" });
    if (method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(absPath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = (req.url || "").split("?")[0];

  if (pathname === "/api/save-md" && req.method === "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (!serveRepoFiles) {
      res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Serve disabled" }));
      return;
    }
    try {
      const raw = await readRequestBody(req, MAX_SAVE_BODY);
      let body;
      try {
        body = JSON.parse(raw.toString("utf8"));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      const rel = typeof body.rel === "string" ? body.rel.replace(/\\/g, "/").trim() : "";
      const content = typeof body.content === "string" ? body.content : null;
      if (!rel || content === null || !WRITABLE_MD_REL.has(rel.normalize("NFC"))) {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "Forbidden path" }));
        return;
      }
      const abs = resolveRepoFileExact(rel);
      if (!abs) {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "Resolve failed" }));
        return;
      }
      await fs.promises.writeFile(abs, content, { encoding: "utf8" });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, rel, bytes: Buffer.byteLength(content, "utf8") }));
    } catch (e) {
      const msg = e && e.message === "payload too large" ? "Too large" : "Write failed";
      res.writeHead(
        e && e.message === "payload too large" ? 413 : 500,
        { "Content-Type": "application/json; charset=utf-8" }
      );
      res.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  if (req.method === "OPTIONS" && pathname === "/api/save-md") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (pathname.startsWith("/serve/")) {
    if (!serveRepoFiles) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Serve disabled: run from younsu repo root or set COMMISSION_REPO_ROOT.");
      return;
    }
    const raw = pathname.slice("/serve/".length);
    let rel;
    try {
      rel = decodeURIComponent(raw);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad request");
      return;
    }
    rel = rel.replace(/\\/g, "/");
    const abs = resolveRepoFile(rel);
    if (!abs) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    sendFile(res, abs, req.method);
    return;
  }

  if (pathname.startsWith("/source/")) {
    const tail = pathname.slice("/source/".length).split("?")[0];
    if (!tail || tail.includes("..")) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(tail);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad request");
      return;
    }
    const rel = decoded.replace(/\\/g, "/").replace(/^\/+/, "");
    const abs = path.resolve(path.join(sourceWebDir, rel));
    const rootResolved = path.resolve(sourceWebDir);
    if (!isResolvedUnderRepoRoot(abs, rootResolved)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    sendFile(res, abs, req.method);
    return;
  }

  let urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = safeJoin(publicDir, urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=60" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    process.stderr.write(
      `[commission-portal] 포트 ${port}은(는) 이미 사용 중입니다.\n` +
        `  같은 서버를 두 번 띄우지 마세요. 이미 실행 중이면 브라우저에서 http://127.0.0.1:${port}/ 를 여세요.\n` +
        `  다른 프로그램이 점유한 경우에만 해당 프로세스를 종료한 뒤 다시 npm start 하세요.\n` +
        `  (의도적으로 다른 포트를 쓰려면 한 번만: set PORT=3002 && npm start)\n`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`commission-portal listening on ${port}\n`);
  if (!serveRepoFiles) {
    process.stdout.write(
      "repo file serve (/serve/) disabled — no 행정심판청구(최종) or 행정심판청구(증거)/최종/ at repo root. Set COMMISSION_REPO_ROOT if needed.\n"
    );
  }
});
