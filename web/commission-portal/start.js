"use strict";

/**
 * public/ 정적 서빙 + 저장소 내 화이트리스트 경로만 /serve/ 로 열람 (로컬·배포 공통)
 *
 * 갑·법령정보 실물은 저장소 루트 `갑호증및법령정보/`·`USB/갑호증및법령정보/` 만 `/serve/` 한다.
 * 제출 서면 MD 등은 `행정심판청구(최종)/`·`행정심판최종본/` 유지.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const publicDir = path.join(__dirname, "public");
/** 화면 제목·부제·기준일 등 — `public/source`. `npm start` 시 `/source/…` 로 서빙 */
const sourceWebDir = path.join(__dirname, "public", "source");
const defaultRepoRoot = path.resolve(__dirname, "..", "..");
const envRepoRoot = process.env.COMMISSION_REPO_ROOT
  ? path.resolve(process.env.COMMISSION_REPO_ROOT)
  : null;
const port = Number(process.env.PORT) || 3000;

/** Docker 등에서 monorepo 루트가 없으면 /serve 비활성화(잘못된 루트 노출 방지) */
function repoHasTrackedLayoutAt(root) {
  if (!root) return false;
  try {
    return (
      fs.existsSync(path.join(root, "행정심판최종본")) ||
      fs.existsSync(path.join(root, "행정심판청구(증거)", "최종")) ||
      fs.existsSync(path.join(root, "행정심판청구(증거)")) ||
      fs.existsSync(path.join(root, "행정심판청구(최종)")) ||
      /** 행심위 USB 루트: `갑호증및법령정보`(통합 증거 미러)만 있는 경우 */
      fs.existsSync(path.join(root, "갑호증및법령정보")) ||
      /** 클론 내 `USB/갑호증및법령정보` 동기화본 */
      fs.existsSync(path.join(root, "USB", "갑호증및법령정보"))
    );
  } catch {
    return false;
  }
}

/**
 * `COMMISSION_REPO_ROOT`(예: USB 복사본)에 정본 트리가 없으면 /serve·저장이 막힙니다.
 * 로컬 younsu 클론에서 편집할 때는 monorepo 루트로 자동 대체합니다.
 */
let repoRoot = defaultRepoRoot;
if (envRepoRoot) {
  if (repoHasTrackedLayoutAt(envRepoRoot)) {
    repoRoot = envRepoRoot;
  } else if (repoHasTrackedLayoutAt(defaultRepoRoot)) {
    process.stderr.write(
      "[commission-portal] COMMISSION_REPO_ROOT가 저장소 트리 조건을 만족하지 않습니다:\n" +
        `  ${envRepoRoot}\n` +
        "  (행정심판청구(최종) 등이 없으면 MD 저장·/serve/가 되지 않습니다.)\n" +
        "  monorepo 기본 루트로 대체합니다:\n" +
        `  ${defaultRepoRoot}\n`
    );
    repoRoot = defaultRepoRoot;
  } else {
    repoRoot = envRepoRoot;
    process.stderr.write(
      "[commission-portal] COMMISSION_REPO_ROOT와 monorepo 기본 루트 모두 트리 조건을 만족하지 않습니다.\n" +
        `  env: ${envRepoRoot}\n` +
        `  기본: ${defaultRepoRoot}\n`
    );
  }
}

const serveRepoFiles = repoHasTrackedLayoutAt(repoRoot);

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
  if (norm.startsWith("갑호증및법령정보/")) return true;
  if (norm.startsWith("USB/갑호증및법령정보/")) return true;
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

/** 로컬 `갑호증및법령정보/` ↔ `USB/갑호증및법령정보/` 동일 상대 경로 */
function evidenceMediaAlternateRels(norm) {
  const n = norm.normalize("NFC");
  const out = [];
  if (n.startsWith("갑호증및법령정보/")) {
    const rest = n.slice("갑호증및법령정보/".length);
    out.push("USB/갑호증및법령정보/" + rest);
  }
  if (n.startsWith("USB/갑호증및법령정보/")) {
    const rest = n.slice("USB/갑호증및법령정보/".length);
    out.push("갑호증및법령정보/" + rest);
  }
  return out;
}

function tryStatRepoFile(repoRoot, norm, rootResolved) {
  if (!isAllowedRepoRel(norm)) return null;
  const parts = norm.split("/").filter(Boolean);
  const full = path.join(repoRoot, ...parts);
  const resolved = path.resolve(full);
  if (!isResolvedUnderRepoRoot(resolved, rootResolved)) return null;
  try {
    const st = fs.statSync(resolved);
    if (st.isFile()) return resolved;
  } catch {
    return null;
  }
  return null;
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
  for (const altNorm of evidenceMediaAlternateRels(norm)) {
    const hit = tryStatRepoFile(repoRoot, altNorm, rootResolved);
    if (hit) return hit;
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
  /**
   * `…(최종)/YYMMDD/YYMMDD_파일.md` 가 없을 때 루트의 `파일.md`(날짜 접두 제거) 시도 — USB 번들·루트 복제본과 tabSources 정본 경로 병행.
   */
  const flatFinal = norm.match(
    /^행정심판청구\(최종\)\/(\d{6})(?:\([^)]*\))?\/\1_(.+)$/
  );
  if (flatFinal) {
    for (const base of ["행정심판청구(최종)", "행정심판최종본"]) {
      const flatNorm = `${base}/${flatFinal[2]}`;
      const flatParts = flatNorm.split("/").filter(Boolean);
      const flatResolved = path.resolve(path.join(repoRoot, ...flatParts));
      if (isResolvedUnderRepoRoot(flatResolved, rootResolved)) {
        try {
          const st = fs.statSync(flatResolved);
          if (st.isFile()) return flatResolved;
        } catch {
          /* 없음 */
        }
      }
    }
  }
  /** 모든 대체 경로를 시도해도 디스크에 없으면 null — sendFile 의 404 에 맡김 */
  try {
    fs.statSync(resolved);
    return resolved;
  } catch {
    return null;
  }
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
  "행정심판청구(최종)/작업보조/개요_README_younsu_허브.md",
  "행정심판청구(최종)/작업보조/별지_갑호증_목록_드롭다운.md",
  "행정심판청구(최종)/260405(인천행심위)/260405_01_행정심판청구서.md",
  "행정심판청구(최종)/260405(인천행심위)/260405_02_집행정지신청서.md",
  "행정심판청구(최종)/260405(인천행심위)/260405_별지제1호_증거자료_목록.md",
  "행정심판청구(최종)/260405(인천행심위)/260405_별지제2호_주요인용판례_및_적용주석.md",
  "행정심판청구(최종)/260405(인천행심위)/260405_별지제3호_사실관계_시간축_정리표.md",
  "행정심판청구(최종)/260407/260407_01_행정심판청구서.md",
  "행정심판청구(최종)/260407/260407_02_집행정지신청서.md",
  "행정심판청구(최종)/260407/260407_별지제1호_증거자료_목록.md",
  "행정심판청구(최종)/260407/260407_별지제2호_주요인용판례_및_적용주석.md",
  "행정심판청구(최종)/260407/260407_별지제3호_사실관계_시간축_정리표.md",
  "행정심판청구(최종)/260407/260407_별지제4호_법제사적_보충의견.md",
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
    /** 편집·저장 직후 본문 갱신이 캐시에 막히지 않도록 MD는 재검증 없이 매번 새로 받기 */
    const cacheCtl =
      ext === ".md" ? "no-store" : "public, max-age=60";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cacheCtl });
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
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, content, { encoding: "utf8" });
      /** `…(최종)/YYMMDD/YYMMDD_*.md` 저장 시 동일 내용을 `…(최종)/YYMMDD_*.md` 직하에도 기록(USB·루트 정본 병행). */
      let mirrorRel = null;
      const relNfc = rel.normalize("NFC");
      if (relNfc.startsWith("행정심판청구(최종)/")) {
        const segs = relNfc.split("/").filter(Boolean);
        if (
          segs.length >= 3 &&
          (/^\d{6}$/.test(segs[1]) || /^\d{6}\([^)]*\)$/.test(segs[1]))
        ) {
          const flatName = segs[segs.length - 1];
          if (flatName && flatName.endsWith(".md")) {
            mirrorRel = `행정심판청구(최종)/${flatName}`;
            const mirrorParts = mirrorRel.split("/").filter(Boolean);
            const mirrorAbs = path.resolve(path.join(repoRoot, ...mirrorParts));
            const rootResolved = path.resolve(repoRoot);
            if (
              mirrorAbs !== abs &&
              isResolvedUnderRepoRoot(mirrorAbs, rootResolved) &&
              isAllowedRepoRel(mirrorRel)
            ) {
              await fs.promises.mkdir(path.dirname(mirrorAbs), { recursive: true });
              await fs.promises.writeFile(mirrorAbs, content, { encoding: "utf8" });
            }
          }
        }
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          rel,
          mirrorRel,
          bytes: Buffer.byteLength(content, "utf8"),
        })
      );
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
      process.stderr.write(`[serve 404] ${rel}\n`);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
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
  process.stdout.write(`repo root: ${repoRoot}\n`);
  if (!serveRepoFiles) {
    process.stdout.write(
      "repo file serve (/serve/) disabled — no 행정심판청구(최종)·행정심판청구(증거)·행정심판최종본 등 트리 at repo root.\n" +
        "  Fix: clone younsu 루트에서 npm start 하거나, COMMISSION_REPO_ROOT를 정본 폴더가 있는 경로로 맞추세요.\n"
    );
  }
});
