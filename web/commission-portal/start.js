"use strict";

/**
 * public/ 정적 서빙 + 저장소 내 화이트리스트 경로만 /serve/ 로 열람.
 * 포털은 **클론 작업 트리만** 본다. USB·번들(`F:\\제출원문(PDF)` 등)에 대한 열람·경로 대체는 하지 않는다.
 * **PDF·DOCX 생성·변환은 하지 않는다** — 열람·(로컬) MD 저장만.
 * 증거·법령: `portal-data.json` 의 rel `갑호증및법령정보/…` → 디스크는 `행정심판청구(제출용)/갑호증및법령정보/…` 만 사용.
 * 제출 서면: `tabSources`·`/api/tab-sources` → `행정심판청구(원본)/제출원문(원본)/` 만. 번들 이식은 `sync_commission_usb.ps1` 등이 담당.
 *
 * 작업 폴더 **이름**의 단일 정의: `./portal-work-paths.js` · 클라이언트는 `GET /api/portal-profile` 의 `workLayout`.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execFileSync } = require("child_process");

const PW = require("./portal-work-paths");

const publicDir = path.join(__dirname, "public");
/** 화면 제목·부제·기준일 등 — `public/source`. `npm start` 시 `/source/…` 로 서빙 */
const sourceWebDir = path.join(__dirname, "public", "source");

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RE_WONMUN_ROOT_FILE_MD_PDF = new RegExp(
  `^${escapeRegExp(PW.WONMUN_DIR)}/[^/]+\\.(md|pdf)$`,
  "i"
);
const RE_FLAT_FINAL = new RegExp(
  `^${escapeRegExp(PW.WONMUN_URL_LEGACY_FINAL)}/(\\d{6})(?:\\([^)]*\\))?/\\1_(.+)$`
);

const defaultRepoRoot = (() => {
  const twoUp = path.resolve(__dirname, "..", "..");
  if (repoHasTrackedLayoutAt(twoUp)) return twoUp;
  if (process.platform === "win32") {
    const driveRoot = path.parse(__dirname).root;
    if (driveRoot && driveRoot !== twoUp && repoHasTrackedLayoutAt(driveRoot)) {
      return driveRoot;
    }
  }
  return twoUp;
})();

/** `F:` 만 넘기면 Node·Windows 에서 cwd 가 드라이브 루트가 아닐 수 있음 → `F:\` 로 고정 */
function resolveCommissionRepoRoot(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  if (/^[A-Za-z]:$/.test(t)) {
    return path.normalize(t + path.sep);
  }
  return path.resolve(t);
}

const envRepoRoot = process.env.COMMISSION_REPO_ROOT
  ? resolveCommissionRepoRoot(process.env.COMMISSION_REPO_ROOT)
  : null;
const port = Number(process.env.PORT) || 8282;
/**
 * Windows Defender 방화벽: Node 인바운드 "일부 기능 차단" 알림 방지 → 로컬은 루프백만 수신.
 * LAN 공개·Docker·Railway 등 외부 접속: COMMISSION_LISTEN_HOST=0.0.0.0
 */
const listenHost = (() => {
  const h = String(process.env.COMMISSION_LISTEN_HOST ?? "").trim();
  if (h) return h;
  if (process.platform === "win32") return "127.0.0.1";
  return undefined;
})();

/** USB 런처(`start-portal.bat`)가 `COMMISSION_QUIET=1` 로 설정 — 콘솔 로그 최소화. 로컬은 `COMMISSION_VERBOSE=1` 로 상세 */
function isCommissionQuietConsole() {
  if (String(process.env.COMMISSION_VERBOSE || "").trim() === "1") return false;
  return String(process.env.COMMISSION_QUIET || "").trim() === "1";
}

/**
 * Windows: 해당 포트를 LISTEN 중인 프로세스를 종료(잔류 commission-portal 등).
 * @returns {boolean} taskkill 을 시도했는지(성공 여부와 무관)
 */
function tryReclaimWindowsListenPort(portNum) {
  if (process.platform !== "win32") return false;
  let out;
  try {
    out = execFileSync("cmd.exe", ["/c", "netstat -ano -p tcp"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return false;
  }
  const needle = `:${portNum}`;
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || !/^tcp\s/i.test(t)) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 5) continue;
    const local = parts[1];
    if (!local || !local.endsWith(needle)) continue;
    const pidStr = parts[parts.length - 1];
    if (!/^\d+$/.test(pidStr)) continue;
    const pid = Number(pidStr);
    if (pid === process.pid || pid <= 4) continue;
    pids.add(pidStr);
  }
  let tried = false;
  for (const pidStr of pids) {
    tried = true;
    try {
      execFileSync("taskkill", ["/PID", pidStr, "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      /* ignore */
    }
  }
  return tried;
}

/** `/serve/`·저장 rel 용 경로 정규화(슬래시·NFC). */
function stripLegacyWonmunPrefix(relPosix) {
  return String(relPosix || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
}

function wonmunHubPath(root) {
  return path.join(root, PW.WONMUN_DIR);
}

/**
 * 서버 기동 후 포털 URL을 브라우저로 엽니다(Windows: Chrome → Edge → 기본 브라우저).
 * 끄기: COMMISSION_OPEN_CHROME=0 또는 BROWSER=none
 */
function tryOpenChromeWithUrl(url) {
  const off = String(process.env.COMMISSION_OPEN_CHROME ?? "")
    .trim()
    .toLowerCase();
  if (off === "0" || off === "false" || off === "no") return;
  if (String(process.env.BROWSER || "")
    .trim()
    .toLowerCase() === "none") {
    return;
  }

  const runDetached = (command, args, options = {}) => {
    try {
      const p = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        ...options,
      });
      p.on("error", () => {});
      p.unref();
    } catch {
      /* ignore */
    }
  };

  if (process.platform === "win32") {
    const chromeExes = [
      process.env.LOCALAPPDATA &&
        path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
      process.env.PROGRAMFILES &&
        path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      process.env["PROGRAMFILES(X86)"] &&
        path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    ].filter(Boolean);
    for (const exe of chromeExes) {
      if (fs.existsSync(exe)) {
        runDetached(exe, [url]);
        if (!isCommissionQuietConsole()) {
          process.stdout.write(`[commission-portal] Chrome으로 열었습니다: ${url}\n`);
        }
        return;
      }
    }
    const edgeExes = [
      process.env.PROGRAMFILES &&
        path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
      process.env["PROGRAMFILES(X86)"] &&
        path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    ].filter(Boolean);
    for (const exe of edgeExes) {
      if (fs.existsSync(exe)) {
        runDetached(exe, [url]);
        if (!isCommissionQuietConsole()) {
          process.stdout.write(`[commission-portal] Microsoft Edge로 열었습니다: ${url}\n`);
        }
        return;
      }
    }
    const comspec = process.env.ComSpec || "cmd.exe";
    runDetached(comspec, ["/c", "start", "", url]);
    if (!isCommissionQuietConsole()) {
      process.stdout.write(`[commission-portal] 기본 브라우저로 열기 시도: ${url}\n`);
    }
    return;
  }

  if (process.platform === "darwin") {
    runDetached("open", ["-a", "Google Chrome", url]);
    if (!isCommissionQuietConsole()) {
      process.stdout.write(`[commission-portal] Chrome으로 열었습니다: ${url}\n`);
    }
    return;
  }

  for (const bin of ["google-chrome-stable", "google-chrome", "chromium"]) {
    runDetached(bin, [url]);
  }
  if (!isCommissionQuietConsole()) {
    process.stdout.write(`[commission-portal] Chromium 계열 실행 시도: ${url}\n`);
  }
}

/** Docker 등에서 monorepo 루트가 없으면 /serve 비활성화(잘못된 루트 노출 방지) */
function repoHasTrackedLayoutAt(root) {
  if (!root) return false;
  try {
    return (
      fs.existsSync(path.join(root, PW.SUBMIT_DIR, PW.SUBMIT_LEGACY_FINAL)) ||
      fs.existsSync(path.join(root, PW.SUBMIT_DIR)) ||
      fs.existsSync(path.join(root, PW.WONMUN_DIR)) ||
      fs.existsSync(path.join(root, PW.EVIDENCE_UNIFIED))
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
    if (!isCommissionQuietConsole()) {
      process.stderr.write(
        "[commission-portal] COMMISSION_REPO_ROOT가 저장소 트리 조건을 만족하지 않습니다:\n" +
          `  ${envRepoRoot}\n` +
          "  (행정심판청구(원본) 등이 없으면 MD 저장·/serve/가 되지 않습니다.)\n" +
          "  monorepo 기본 루트로 대체합니다:\n" +
          `  ${defaultRepoRoot}\n`
      );
    }
    repoRoot = defaultRepoRoot;
  } else {
    repoRoot = envRepoRoot;
    if (!isCommissionQuietConsole()) {
      process.stderr.write(
        "[commission-portal] COMMISSION_REPO_ROOT와 monorepo 기본 루트 모두 트리 조건을 만족하지 않습니다.\n" +
          `  env: ${envRepoRoot}\n` +
          `  기본: ${defaultRepoRoot}\n`
      );
    }
  }
}

const serveRepoFiles = repoHasTrackedLayoutAt(repoRoot);

/** USB·번들 루트 등 `갑호증및법령정보만` 있고 `행정심판청구(원본)` 없으면 조회 전용(MD 편집·저장 비활성). */
function hasWonmunMdWorkspace(root) {
  if (!root) return false;
  try {
    return fs.statSync(wonmunHubPath(root)).isDirectory();
  } catch {
    return false;
  }
}

const mdWorkspaceEditable = serveRepoFiles && hasWonmunMdWorkspace(repoRoot);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
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

/** `/serve/` 상대 경로를 디스크 상대 경로로 그대로 쓴다(제출 정본은 `행정심판청구(원본)/`). */
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
  /** `…(원본)/old/…` — 미사용·아카이브 경로는 /serve·저장 대상에서 제외 */
  if (norm.startsWith(`${PW.WONMUN_DIR}/old/`)) return false;
  if (norm.startsWith(`${PW.WONMUN_DIR}/`)) return true;
  /** 클론 정본: `제출용/갑호증및법령정보/` — resolveRepoFile 이 경로로 실물을 연 뒤 /serve/ 허용 */
  if (norm.startsWith(`${PW.SUBMIT_DIR}/${PW.EVIDENCE_UNIFIED}/`)) return true;
  /** 제출용 폴더 루트 직하 `.md`·`.pdf`(전자제출본 등) — `갑호증및법령정보/` 하위와 구분 */
  if (norm.startsWith(`${PW.SUBMIT_DIR}/`)) {
    const rest = norm.slice(`${PW.SUBMIT_DIR}/`.length);
    if (!rest || rest.includes("/") || rest.includes("\\")) return false;
    return /\.(md|pdf)$/i.test(rest);
  }
  if (norm.startsWith(`${PW.EVIDENCE_UNIFIED}/`)) return true;
  return false;
}

function isResolvedUnderRepoRoot(resolved, rootResolved) {
  if (os.platform() === "win32") {
    const r = resolved.toLowerCase();
    let root = rootResolved.toLowerCase();
    if (!root.endsWith(path.sep)) root += path.sep;
    return r === rootResolved.toLowerCase() || r.startsWith(root);
  }
  const relToRoot = path.relative(rootResolved, resolved);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    return false;
  }
  return true;
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
  const norm = stripLegacyWonmunPrefix(relPosix);
  if (!isAllowedRepoRel(norm)) return null;
  const diskNorm = toDiskRelPosix(norm);
  const parts = diskNorm.split("/").filter(Boolean);
  const defaultResolved = path.resolve(path.join(repoRoot, ...parts));
  const rootResolved = path.resolve(repoRoot);
  if (!isResolvedUnderRepoRoot(defaultResolved, rootResolved)) {
    return null;
  }
  /** rel `갑호증및법령정보/…` → 실물 `제출용/갑호증및법령정보/…` 우선, 없으면 루트 직하 `갑호증및법령정보/…`(USB 구조) */
  const evPrefix = `${PW.EVIDENCE_UNIFIED}/`;
  if (diskNorm.startsWith(evPrefix)) {
    const rest = diskNorm.slice(evPrefix.length);
    const underEvidence = `${PW.SUBMIT_DIR}/${PW.EVIDENCE_UNIFIED}/${rest}`;
    const hitEv = tryStatRepoFile(repoRoot, underEvidence, rootResolved);
    if (hitEv) return hitEv;
    const hitDirect = tryStatRepoFile(repoRoot, diskNorm, rootResolved);
    if (hitDirect) return hitDirect;
    return null;
  }
  const hit = tryStatRepoFile(repoRoot, diskNorm, rootResolved);
  if (hit) return hit;
  /** `원본/파일.pdf` 실물이 `제출용/파일.pdf` 로 옮겨진 경우(전자제출본 루트) */
  if (RE_WONMUN_ROOT_FILE_MD_PDF.test(diskNorm)) {
    const leaf = diskNorm.split("/").pop();
    if (leaf) {
      const underSubmitPack = `${PW.SUBMIT_DIR}/${leaf}`;
      const hitPack = tryStatRepoFile(repoRoot, underSubmitPack, rootResolved);
      if (hitPack) return hitPack;
    }
  }
  /**
   * `…(최종)/YYMMDD/YYMMDD_파일.md` 가 없을 때 루트의 `파일.md`(날짜 접두 제거) 시도.
   */
  const flatFinal = norm.match(RE_FLAT_FINAL);
  if (flatFinal) {
    const flatNorm = `${PW.WONMUN_DIR}/${flatFinal[2]}`;
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
  /** 모든 대체 경로를 시도해도 디스크에 없으면 null — sendFile 의 404 에 맡김 */
  try {
    fs.statSync(defaultResolved);
    return defaultResolved;
  } catch {
    return null;
  }
}

/** 저장 전용: `resolveRepoFile` 과 달리 대체 경로로 바꾸지 않음(정본은 항상 `행정심판청구(원본)/`). */
function resolveRepoFileExact(relPosix) {
  const norm = stripLegacyWonmunPrefix(relPosix);
  if (!isAllowedRepoRel(norm)) return null;
  const parts = norm.split("/").filter(Boolean);
  const resolved = path.resolve(path.join(repoRoot, ...parts));
  const rootResolved = path.resolve(repoRoot);
  if (!isResolvedUnderRepoRoot(resolved, rootResolved)) {
    return null;
  }
  return resolved;
}

/** 제출 정본 6건 파일명 — `행정심판청구(원본)/제출원문(원본)/` 직하만. */
const WONMUN_SUBMISSION_MD_LEAVES = new Set([
  "행정심판청구서.md",
  "집행정지신청서.md",
  "별지제1호_증거자료_목록.md",
  "별지제2호_주요인용판례_및_적용주석.md",
  "별지제3호_사실관계_시간축_정리표.md",
  "별지제4호_법제사적_보충의견.md",
]);

function findLatestWonmunMdDirName() {
  const won = wonmunHubPath(repoRoot);
  const fixed = PW.WONMUN_SUBMIT_WONMUN;
  try {
    const fixedPath = path.join(won, fixed);
    const st = fs.statSync(fixedPath);
    if (st.isDirectory()) return fixed;
  } catch {
    /* 없음 */
  }
  return null;
}

/** 포털 탭·`/api/tab-sources` — `제출원문(원본)` 만 (레거시 `NNNNNN_md` 미사용) */
function buildTabSourcesRel() {
  const dir = findLatestWonmunMdDirName();
  if (!dir) return null;
  const p = `${PW.WONMUN_DIR}/${dir}`;
  return {
    appeal: `${p}/행정심판청구서.md`,
    gab1: `${p}/별지제1호_증거자료_목록.md`,
    gab2: `${p}/별지제2호_주요인용판례_및_적용주석.md`,
    gab3: `${p}/별지제3호_사실관계_시간축_정리표.md`,
    gab4: `${p}/별지제4호_법제사적_보충의견.md`,
    injunction: `${p}/집행정지신청서.md`,
  };
}

function isWritableSubmitWonmunMdRel(norm) {
  const n = norm.normalize("NFC");
  const parts = n.split("/").filter(Boolean);
  if (parts.length !== 3) return false;
  if (parts[0] !== PW.WONMUN_DIR) return false;
  if (parts[1] !== PW.WONMUN_SUBMIT_WONMUN) return false;
  return WONMUN_SUBMISSION_MD_LEAVES.has(parts[2]);
}

function isWritableMdRel(norm) {
  const n = stripLegacyWonmunPrefix(norm);
  return WRITABLE_MD_REL.has(n) || isWritableSubmitWonmunMdRel(n);
}

/** 로컬 편집기에서만 저장 허용(화이트리스트). 제출 6건 MD는 `제출원문(원본)` 직하만. */
const WRITABLE_MD_REL = new Set([
  `${PW.WONMUN_DIR}/${PW.WONMUN_WORK_AUX}/개요_README_younsu_허브.md`,
  `${PW.WONMUN_DIR}/${PW.WONMUN_WORK_AUX}/별지_갑호증_목록_드롭다운.md`,
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

function sendFile(res, absPath, method, req) {
  fs.stat(absPath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(absPath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const cacheCtl =
      ext === ".md" ? "no-store" : "public, max-age=60";
    const total = st.size;

    const rangeHeader = req && req.headers && req.headers.range;
    if (rangeHeader && /^bytes=/.test(rangeHeader)) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      if (isNaN(start) || start < 0 || start >= total || end >= total || end < start) {
        res.writeHead(416, { "Content-Range": `bytes */${total}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Cache-Control": cacheCtl,
      });
      if (method === "HEAD") { res.end(); return; }
      fs.createReadStream(absPath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": total,
      "Cache-Control": cacheCtl,
    });
    if (method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(absPath).pipe(res);
  });
}

/** `POST|GET /api/shutdown` — 브라우저「화면종료」전용. 루프백이 아니면 거부(원격에서 프로세스 종료 방지). */
function isRequestFromLoopback(req) {
  const a = String(req.socket?.remoteAddress || "").trim();
  if (
    a === "127.0.0.1" ||
    a === "::1" ||
    a === "::ffff:127.0.0.1" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a)
  ) {
    return true;
  }
  /** Windows·일부 스택에서 `remoteAddress` 가 잠깐 비어 있는 경우가 있어, 포트가 잡힌 활성 소켓은 로컬로 간주 */
  if (!a && req.socket && typeof req.socket.remotePort === "number" && req.socket.remotePort > 0) {
    return true;
  }
  return false;
}

let portalShutdownStarted = false;

const server = http.createServer(async (req, res) => {
  const pathname = (req.url || "").split("?")[0];

  if (pathname === "/api/portal-profile" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ok: true,
        mdWorkspaceEditable,
        serveRepoFiles,
        repoRoot,
        listenHost: listenHost ?? null,
        portalDir: __dirname,
        envCommissionRepoRoot: process.env.COMMISSION_REPO_ROOT || null,
        workLayout: PW.workLayoutPayload(),
      })
    );
    return;
  }

  if (pathname === "/api/diagnose" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const diag = {
      repoRoot,
      serveRepoFiles,
      envRepoRoot: process.env.COMMISSION_REPO_ROOT || null,
      __dirname,
      platform: process.platform,
      nodeVersion: process.version,
      checks: {},
    };
    const chk = diag.checks;
    chk.evidenceDir = fs.existsSync(path.join(repoRoot, PW.EVIDENCE_UNIFIED));
    chk.submitDir = fs.existsSync(path.join(repoRoot, PW.SUBMIT_DIR));
    chk.wonmunDir = fs.existsSync(path.join(repoRoot, PW.WONMUN_DIR));
    chk.submitEvidence = fs.existsSync(path.join(repoRoot, PW.SUBMIT_DIR, PW.EVIDENCE_UNIFIED));
    try {
      const evDir = path.join(repoRoot, PW.EVIDENCE_UNIFIED);
      if (chk.evidenceDir) {
        chk.evidenceSubdirs = fs.readdirSync(evDir).filter((d) => {
          try { return fs.statSync(path.join(evDir, d)).isDirectory(); } catch { return false; }
        });
      }
    } catch (e) { chk.evidenceSubdirsError = e.message; }
    const sampleRels = [
      `${PW.EVIDENCE_UNIFIED}/갑제1호증`,
      `${PW.EVIDENCE_UNIFIED}/갑제4호증`,
    ];
    chk.sampleResolve = {};
    for (const sr of sampleRels) {
      const dirPath = path.join(repoRoot, ...sr.split("/"));
      try {
        const items = fs.readdirSync(dirPath).slice(0, 3);
        chk.sampleResolve[sr] = { exists: true, firstFiles: items };
        if (items.length > 0) {
          const testRel = `${sr}/${items[0]}`;
          const resolved = resolveRepoFile(testRel);
          chk.sampleResolve[sr].resolvedFirst = resolved;
        }
      } catch (e) { chk.sampleResolve[sr] = { exists: false, error: e.message }; }
    }
    res.writeHead(200);
    res.end(JSON.stringify(diag, null, 2));
    return;
  }

  if (pathname === "/api/tab-sources" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (!serveRepoFiles) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: false,
          error: "Serve disabled",
          tabSources: null,
          latestDir: null,
        })
      );
      return;
    }
    const latestDir = findLatestWonmunMdDirName();
    const tabSources = buildTabSourcesRel();
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ok: Boolean(tabSources),
        tabSources,
        latestDir,
      })
    );
    return;
  }

  if (pathname === "/api/save-md" && req.method === "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (!serveRepoFiles) {
      res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Serve disabled" }));
      return;
    }
    if (!mdWorkspaceEditable) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: false,
          error:
            "조회 전용 배포입니다. 저장소 루트에 행정심판청구(원본) 폴더가 있을 때만 MD 저장이 가능합니다.",
        })
      );
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
      if (!rel || content === null || !isWritableMdRel(rel.normalize("NFC"))) {
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
      const relNfc = stripLegacyWonmunPrefix(rel);
      if (relNfc.startsWith(`${PW.WONMUN_DIR}/`)) {
        const segs = relNfc.split("/").filter(Boolean);
        if (
          segs.length >= 3 &&
          (/^\d{6}$/.test(segs[1]) || /^\d{6}\([^)]*\)$/.test(segs[1]))
        ) {
          const flatName = segs[segs.length - 1];
          if (flatName && flatName.endsWith(".md")) {
            mirrorRel = `${PW.WONMUN_DIR}/${flatName}`;
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
      try {
        if (!isCommissionQuietConsole()) {
          const bytes = Buffer.byteLength(content, "utf8");
          const mirrorNote = mirrorRel ? ` +미러 ${mirrorRel}` : "";
          process.stdout.write(
            `[commission-portal] save-md ${rel} (${bytes} bytes)${mirrorNote}\n`
          );
        }
      } catch {
        /* ignore */
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

  if (pathname === "/api/shutdown" && (req.method === "POST" || req.method === "GET")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (!isRequestFromLoopback(req)) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Local loopback only" }));
      return;
    }
    const payload = JSON.stringify({ ok: true });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    /** 응답 플러시 후 종료(`finish` 만으로는 놓치거나 `close()` 가 keep-alive 에 막히는 경우 완화) */
    res.end(payload, () => {
      schedulePortalShutdown();
    });
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
      if (!isCommissionQuietConsole()) {
        process.stderr.write(`[serve 404] ${rel}\n`);
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    sendFile(res, abs, req.method, req);
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
    sendFile(res, abs, req.method, req);
    return;
  }

  let urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = safeJoin(publicDir, urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end();
    return;
  }
  sendFile(res, filePath, req.method, req);
});

function schedulePortalShutdown() {
  if (portalShutdownStarted) return;
  portalShutdownStarted = true;
  try {
    if (!isCommissionQuietConsole()) {
      process.stdout.write("[commission-portal] shutdown requested — exiting.\n");
    }
  } catch {
    /* ignore */
  }
  const exitNow = () => {
    process.exit(0);
  };
  try {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
  } catch {
    /* ignore */
  }
  try {
    server.close(exitNow);
  } catch {
    exitNow();
  }
  setTimeout(exitNow, 800).unref();
}

let listenPortRetries = 0;

function listenOnPortal() {
  if (listenHost) {
    server.listen(port, listenHost, onListenReady);
  } else {
    server.listen(port, onListenReady);
  }
}

function onListenReady() {
  const portalUrl = `http://127.0.0.1:${port}/`;
  if (!isCommissionQuietConsole()) {
    const bindNote = listenHost ? `${listenHost}:` : "";
    process.stdout.write(`commission-portal listening on ${bindNote}${port}\n`);
    process.stdout.write(`repo root: ${repoRoot}\n`);
    process.stdout.write(
      listenHost === "127.0.0.1"
        ? `브라우저: ${portalUrl} (Windows 루프백만 수신 — localhost 대신 위 주소 권장)\n`
        : `브라우저: ${portalUrl} 또는 http://localhost:${port}/\n`
    );
  }
  tryOpenChromeWithUrl(portalUrl);
  if (!serveRepoFiles) {
    if (!isCommissionQuietConsole()) {
      process.stdout.write(
        "repo file serve (/serve/) disabled — no 행정심판청구(원본)·행정심판청구(제출용) 등 트리 at repo root.\n" +
          "  Fix: clone younsu 루트에서 npm start 하거나, COMMISSION_REPO_ROOT를 정본 폴더가 있는 경로로 맞추세요.\n"
      );
    }
  }
  /** MD 조회 전용(`!mdWorkspaceEditable`)은 정상 배포 흔한 경우 — 콘솔 한 줄 안내는 생략. 필요 시 GET /api/portal-profile 의 mdWorkspaceEditable 참고. */
}

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    if (listenPortRetries >= 1) {
      if (!isCommissionQuietConsole()) {
        process.stderr.write(
          `[commission-portal] 포트 ${port}을(를) 사용할 수 없습니다.\n`
        );
      }
      process.exit(1);
    }
    listenPortRetries++;
    if (process.platform === "win32" && tryReclaimWindowsListenPort(port)) {
      setTimeout(() => {
        listenOnPortal();
      }, 400);
      return;
    }
    if (!isCommissionQuietConsole()) {
      process.stderr.write(
        `[commission-portal] 포트 ${port}을(를) 사용할 수 없습니다.\n`
      );
    }
    process.exit(1);
  }
  throw err;
});

listenOnPortal();
