/**
 * 농원근린공원 행정심판청구 — 탭별 서면 표시·미주
 *
 * 이 화면은 **PDF·DOCX 파일을 직접 만들거나 보내지 않습니다.** 제출 정본·전자제출본·별도 편집기를 사용합니다.
 *
 * 열람: 저장소 `갑호증및법령정보/` 등 실제 파일을 `/serve/`로 연다. 판례 링크는 `precedentFiles` → `buildCiteMaps`;
 * **npm start / 저장소 루트** 없이 정적만 열면 /serve/가 깨질 수 있다.
 */

const $ = (sel, root = document) => root.querySelector(sel);

/** 미리보기 패널 초기 제목(HTML) */
const DOC_PREVIEW_HEADING_IDLE_HTML =
  '<strong class="cite-preview-heading-main">갑호증 및 법령정보 참고</strong>';

/** 오른쪽 패널 안내 문구 HTML — `clearDocPreviewPanel` 시 `#doc-preview-lead` 에 복원(index.html 과 동일 유지) */
const DOC_PREVIEW_LEAD_IDLE_HTML = `[ 사용방법 ]

1. 행정심판청구서, 집행정지신청서 및 별지 제1호~제4호 본문에서 호증 표기(링크)를 더블클릭하면 오른쪽에 갑호증 또는 법령정보 요지가 열립니다.

2. 화면에 출력된 PDF·이미지·동영상 등을 다시 더블클릭하면 <strong>전체 화면</strong>으로 볼 수 있고, 더블클릭 또는 Esc로 닫을 수 있습니다.

3. 다중 PDF는 <strong>1쪽 썸네일</strong>만 보이며, 전체는 <strong>전체 화면</strong>에서 봅니다(원고크기, 좌우회전 가능).

4. 동영상은 자동 재생하지 않고, <strong>전체 화면</strong>에서 자동 재생됩니다.`;

const DOC_PREVIEW_LEAD_CITE =
  "청구서·신청서 본문에서 연 인용입니다. 내용을 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

const DOC_PREVIEW_LEAD_APPENDIX_CITE =
  "별지 본문에서 연 인용입니다. 내용을 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

const DOC_PREVIEW_LEAD_APPENDIX_FILE =
  "별지 본문의 저장소 파일 링크입니다. 내용을 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

const DOC_PREVIEW_LEAD_EVIDENCE =
  "연 호증의 요지와 파일입니다. 분할 묶음은 격자로 보입니다. 내용을 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

/** 청구서·개요 등 본문의 호증 링크에서 연 파일 */
const DOC_PREVIEW_LEAD_GAB_LINK =
  "본문·증거 목록의 호증 링크에서 연 파일입니다. 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

const MARKED_LOCAL = "/vendor/marked/marked.esm.js";
const MARKED_CDN = "https://cdn.jsdelivr.net/npm/marked@14.1.4/+esm";

let metaGlobal = null;

/** `/api/portal-profile` — 번들·조회 전용이면 false(우측 MD 편집·MD수정/MD저장 없음) */
let portalMdWorkspaceEditable = false;
/** 같은 응답의 `repoRoot`(절대). 없으면 작업 폴더 풀패스는 못 붙이고 저장소 상대만 표시 */
let portalRepoRoot = "";
/** `GET /api/portal-profile` 의 `workLayout` — `diskRelFromPortalRel` 이 폴더 이름을 서버와 맞춤 */
let portalWorkLayout = null;

/**
 * 디스크 저장(POST /api/save-md)은 **오직** (1) `#btn-md-aside-save` 클릭 (2) 모달 `#md-editor-save` 클릭 때만 호출됨.
 * MD수정 textarea `input` 은 왼쪽 미리보기만 갱신하며 서버에 쓰지 않음.
 */
let portalMdSaveRequestInFlight = false;
let mdAsideEditMode = false;
const mdAsideBaselineByPrefix = {};
const mdAsideDraftByPrefix = {};

/** `public/source/site-display.json` — 제목·부제·기준일은 여기만 편집(포털이 우선 적용) */
async function loadSiteDisplayFromSource() {
  try {
    const res = await fetch("source/site-display.json", { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}
/** @type {{ caseById: Map<string,string>, gabByKey: Map<string,string> } | null} */
let citeMaps = null;

/** 인용 링크: 청구·신청 본문은 더블클릭 시 오른쪽 패널 → 패널에서 다시 더블클릭 시 전체 화면(모달). */
const CITE_OPEN_TITLE =
  "더블클릭하면 오른쪽 패널에 자료를 표시합니다. 패널에서 다시 더블클릭하면 전체 화면입니다. (키보드: Enter 또는 Space)";

/** 전체 창(모달) 뷰어 — 본문·어두운 바깥 더블클릭 또는 Esc로 닫기(닫기 단추도 동일). */
const VIEWER_CLOSE_HINT = "닫기: 더블클릭 또는 Esc 키.";

/** `styles.css` `.detail-gab3-item` 의 `--detail-gab3-thumb-h` 상한과 동기(레이아웃 전 PDF 축척 폴백) */
const BUNDLE_THUMB_BOX_HEIGHT_PX = 420;

const PDF_THUMB_CONCURRENCY = 2;
let _pdfThumbRunning = 0;
const _pdfThumbQueue = [];
function enqueuePdfThumb(fn) {
  return new Promise((resolve, reject) => {
    _pdfThumbQueue.push({ fn, resolve, reject });
    _drainPdfThumbQueue();
  });
}
function _drainPdfThumbQueue() {
  while (_pdfThumbRunning < PDF_THUMB_CONCURRENCY && _pdfThumbQueue.length) {
    const { fn, resolve, reject } = _pdfThumbQueue.shift();
    _pdfThumbRunning++;
    fn().then(resolve, reject).finally(() => { _pdfThumbRunning--; _drainPdfThumbQueue(); });
  }
}

const _thumbObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      _thumbObserver.unobserve(entry.target);
      const loader = entry.target._lazyThumbLoader;
      if (loader) { delete entry.target._lazyThumbLoader; loader(); }
    }
  }
}, { rootMargin: "200px" });

/** 모달이 열리기 직전 `window` 스크롤 — 닫을 때 복원해 본문 위치가 튀지 않게 함 */
let viewerBackgroundScroll = null;

/** 가로 사진 전체화면에서 `screen.orientation.lock('landscape')` 성공 시 닫을 때 unlock */
let viewerOrientationUnlock = null;

const tabLoaded = {
  appeal: false,
  gab1: false,
  gab2: false,
  gab3: false,
  gab4: false,
  injunction: false,
  manual: false,
};

function norm(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function serveUrl(relPath, cacheBust) {
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  /** `encodeURIComponent`는 `()`를 그대로 두는데, 일부 프록시·방화벽에서 경로가 잘리므로 %28 %29 로 통일 */
  const base = `/serve/${parts
    .map((seg) =>
      encodeURIComponent(seg).replace(/\(/g, "%28").replace(/\)/g, "%29")
    )
    .join("/")}`;
  return cacheBust ? `${base}?_=${Date.now()}` : base;
}

/** `loadTabIfNeeded`·저장 후 갱신용 — 해당 섹션의 저장소 상대 경로 */
function tabSourceRelForSection(id) {
  if (!metaGlobal?.tabSources) return "";
  const src = metaGlobal.tabSources;
  if (id === "appeal") return String(src.appeal || "").trim();
  if (id === "gab1") return String(src.gab1 || "").trim();
  if (id === "gab2") return String(src.gab2 || "").trim();
  if (id === "gab3") return String(src.gab3 || "").trim();
  if (id === "gab4") return String(src.gab4 || "").trim();
  if (id === "injunction") return String(src.injunction || "").trim();
  if (id === "manual") return String(src.manual || "").trim();
  return "";
}

/** `/serve/…` 절대·상대 URL에서 저장소 rel 복원 */
function relFromServeUrl(src) {
  try {
    const u = new URL(src, location.origin);
    const p = u.pathname;
    if (!p.startsWith("/serve/")) return "";
    return p
      .slice("/serve/".length)
      .split("/")
      .map((seg) => decodeURIComponent(seg))
      .join("/");
  } catch {
    return "";
  }
}

let allRows = [];
let markedParse = null;

/** `gab-pdf-display-overrides.json` — 갑호증 PDF 전수 목록·가로 표시 강제 규칙 */
let gabPdfDisplayOverrides = { forceLandscape: [], catalogRelSuffixes: [] };

function gabEvidenceTailForDisplayMatch(rel) {
  const n = normRelPosix(String(rel || "")).normalize("NFC");
  const usb = "USB/갑호증및법령정보/";
  const prim = "갑호증및법령정보/";
  if (n.startsWith(usb)) return n.slice(usb.length);
  if (n.startsWith(prim)) return n.slice(prim.length);
  return n;
}

/** 세로 미디어 박스 PDF를 썸네일·전체화면에서 가로 콘텐츠처럼 표시할지(목록 수동 지정). */
function pdfRelForceLandscapeDisplay(rel) {
  const leaf =
    String(rel || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .pop() || "";
  const leafN = leaf.normalize("NFC");
  const tail = gabEvidenceTailForDisplayMatch(rel).normalize("NFC");
  for (const rule of gabPdfDisplayOverrides.forceLandscape || []) {
    const rs = rule.relSuffix && String(rule.relSuffix).normalize("NFC");
    const lf = rule.leaf && String(rule.leaf).normalize("NFC");
    if (lf && leafN === lf) return true;
    if (rs && (tail === rs || tail.endsWith("/" + rs) || tail.endsWith(rs))) {
      return true;
    }
  }
  return false;
}

const VALID_SECTIONS = ["appeal", "injunction", "gab1", "gab2", "gab3", "gab4", "manual"];

/** 예전 주소 해시(#overview 등) → 현재 탭 id */
const LEGACY_HASH_TAB = {
  overview: "appeal",
  evidence: "appeal",
  gab: "gab1",
  appendix: "gab3",
};

/** 주소 표시줄 #해시로 탭·호증 행 공유(서류 대조·협의 시 활용) */
function parseHash() {
  const raw = (location.hash || "").replace(/^#/, "").trim();
  if (!raw) return { tab: null, hoNum: null };
  const qIdx = raw.indexOf("?");
  const pathPart = (qIdx >= 0 ? raw.slice(0, qIdx) : raw).trim();
  const searchPart = qIdx >= 0 ? raw.slice(qIdx + 1) : "";
  const tab = pathPart || null;
  const params = new URLSearchParams(searchPart);
  const hoNum = params.get("ho") || params.get("num") || null;
  return { tab, hoNum };
}

function setLocationHash(section, hoNum) {
  let h = `#${section}`;
  if (hoNum != null && hoNum !== "") {
    h += `?ho=${encodeURIComponent(String(hoNum))}`;
  }
  const url = `${location.pathname}${location.search}${h}`;
  history.replaceState(null, "", url);
}

/**
 * 일반 새로고침(F5·Ctrl+R)과 강력 새로고침(Ctrl+Shift+R)은 모두 Navigation Timing 상 `reload` 로 잡힙니다(구분 불가).
 * 새로고침이면 주소를 `#appeal`로 맞춰 행정심판청구서(왼쪽 본문)가 항상 열리게 합니다.
 * — `main()` 첫머리에서 동기 호출: fetch 대기 중 옛 해시로 선로딩되는 일을 막음.
 * — `navigation` 배열이 비는 환경은 deprecated `performance.navigation.type === 1`(reload) 로 보조.
 */
function isDocumentReloadNavigation() {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "reload") return true;
  } catch {
    /* ignore */
  }
  try {
    const pn = performance.navigation;
    if (pn && typeof pn.type === "number" && pn.type === /* TYPE_RELOAD */ 1) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function resetHashToAppealOnReload() {
  if (!isDocumentReloadNavigation()) return;
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}#appeal`);
  } catch {
    /* ignore */
  }
}

/** 첫 화면: 헤더·탭·본문 시작이 한데 보이도록 문서 최상단으로 스크롤 */
function scrollFirstScreenToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

/** 짧은 탭으로 바뀐 뒤 scrollY 가 문서 높이를 넘을 때 브라우저가 스크롤을 끌어당기며 출렁이는 것 완화 */
function clampWindowScrollToDocument() {
  const el = document.documentElement;
  const maxY = Math.max(0, el.scrollHeight - window.innerHeight);
  if (window.scrollY > maxY) {
    window.scrollTo({ top: maxY, left: 0, behavior: "instant" });
  }
}

function readPageScroll() {
  return { x: window.scrollX, y: window.scrollY };
}

function readCitePreviewScrollTop() {
  const el = document.querySelector("#cite-preview-aside .cite-preview-scroll");
  return el ? el.scrollTop : 0;
}

function applyCitePreviewScrollTop(top) {
  const el = document.querySelector("#cite-preview-aside .cite-preview-scroll");
  if (el) el.scrollTop = top;
}

/**
 * MD 수정·저장 시 좌·우 패널(문서 스크롤·참고 패널 내부 스크롤)이 덜 움직이도록 복구.
 * 본문 DOM 을 통째로 바꾼 직후에는 `scrollHeight` 가 아직 짧아 `clamp` 가 맨 위로 끌어당기므로,
 * 복구·클램프를 여러 프레임·폰트 로드 뒤에 반복한다.
 * @param {{ x: number, y: number, citeTop: number }} saved
 * @param {{ skipPage?: boolean, skip?: boolean }} [opts] skipPage: aside 를 끌어올 scrollIntoView 직후 등 페이지 복구 생략
 */
function stabilizeMdAsideViewport(saved, opts = {}) {
  if (!saved || opts.skip) return;
  const skipPage = opts.skipPage === true;
  const applyScrollOnly = () => {
    if (!skipPage) {
      window.scrollTo({ left: saved.x, top: saved.y, behavior: "instant" });
    }
    applyCitePreviewScrollTop(saved.citeTop);
  };
  const applyWithClamp = () => {
    applyScrollOnly();
    if (!skipPage) clampWindowScrollToDocument();
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(applyWithClamp);
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(applyWithClamp);
      });
    });
  });
  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(applyWithClamp);
      });
    });
  }
}

async function applyHashFromLocation() {
  let { tab, hoNum } = parseHash();
  if (tab && LEGACY_HASH_TAB[tab]) {
    tab = LEGACY_HASH_TAB[tab];
    setLocationHash(tab, hoNum);
  }
  if (!tab || !VALID_SECTIONS.includes(tab)) {
    resetMdAsideEditModeUi();
    clearDocPreviewPanel();
    setLocationHash("appeal", null);
    showSection("appeal");
    await loadTabIfNeeded("appeal");
    requestAnimationFrame(() => scrollFirstScreenToTop());
    return;
  }
  const prevTab = document.querySelector(".tab.is-active")?.dataset?.section;
  const tabChanged = prevTab !== tab;
  if (prevTab && prevTab !== tab) {
    resetMdAsideEditModeUi();
    clearDocPreviewPanel();
  }
  showSection(tab);
  await loadTabIfNeeded(tab);
  const hasDeepHo = hoNum != null && hoNum !== "";
  const docTab =
    tab === "appeal" ||
    tab === "injunction" ||
    tab === "gab1" ||
    tab === "gab2" ||
    tab === "gab3" ||
    tab === "gab4" ||
    tab === "manual";
  /** 같은 탭·호증 딥링크 시 불필요한 맨 위 스크롤 제거(출렁임·이중 스크롤 완화) */
  if (docTab && tabChanged && !hasDeepHo) {
    requestAnimationFrame(() => scrollFirstScreenToTop());
  }
  if (hoNum != null && hoNum !== "" && allRows.length) {
    const row = allRows.find((r) => String(r.num) === String(hoNum));
    if (row) openEvidenceRowInPreviewPanel(row);
  }
}

async function getMarked() {
  if (!markedParse) {
    let mod;
    try {
      mod = await import(/* @vite-ignore */ MARKED_LOCAL);
    } catch {
      mod = await import(/* @vite-ignore */ MARKED_CDN);
    }
    const { marked } = mod;
    marked.setOptions({ breaks: true, gfm: true });
    markedParse = marked.parse.bind(marked);
  }
  return markedParse;
}

/** 인천시 실시계획 인가 고시 문구 → 갑4 고시 링크, 및 갑5-1·5-2(건축과 동영상·회신) 동일 묶음(__GAB_BUNDLE__:5a). 갑5-1+5-2 문구는 하나의 링크로(웹 전용; MD 원문은 평문 유지) */
function injectIncheonIngaGosiLinks(html) {
  if (!html) return html;
  const bundle5a = "__GAB_BUNDLE__:5a";
  const a = (label) =>
    `<a href="#" class="cite-ref" role="button" title="${CITE_OPEN_TITLE}" data-cite-rel="${bundle5a}">${label}</a>`;

  const plainGosi = "인천광역시 고시(제2020-233호, 제2022-18호)";
  const withGosiLinks = `인천광역시 고시(${a("제2020-233호")}, ${a("제2022-18호")})`;

  let out = html;
  if (out.includes(plainGosi)) out = out.split(plainGosi).join(withGosiLinks);

  /** 긴 문구·괄호 먼저. 「갑 제5-1호증,  제5-2호증」(생략형) 등 전체를 단일 cite로 */
  const gabSubs = [
    ["(갑 제5-1호증,  제5-2호증 등)", `(${a("갑 제5-1호증,  제5-2호증")} 등)`],
    ["(갑 제5-1호증,  제5-2호증).", `(${a("갑 제5-1호증,  제5-2호증")}).`],
    ["(갑 제5-1호증,  제5-2호증)", `(${a("갑 제5-1호증,  제5-2호증")})`],
    ["(갑 제5-1호증 및 갑 제5-2호증)", `(${a("갑 제5-1호증 및 갑 제5-2호증")})`],
    ["(갑 제5-1호증, 갑 제5-2호증)", `(${a("갑 제5-1호증, 갑 제5-2호증")})`],
    ["(<strong>갑 제5-1호증 및 갑 제5-2호증</strong>)", `(${a("갑 제5-1호증 및 갑 제5-2호증")})`],
    ["<strong>갑 제5-1호증 및 갑 제5-2호증</strong>", a("갑 제5-1호증 및 갑 제5-2호증")],
    ["<strong>갑 제5-1호증, 갑 제5-2호증</strong>", a("갑 제5-1호증, 갑 제5-2호증")],
  ];
  for (const [plain, rich] of gabSubs) {
    if (out.includes(plain)) out = out.split(plain).join(rich);
  }

  const bundle5b = "__GAB_BUNDLE__:5b";
  const b = (label) =>
    `<a href="#" class="cite-ref" role="button" title="${CITE_OPEN_TITLE}" data-cite-rel="${bundle5b}">${label}</a>`;
  const gabSubs5b = [
    ["(갑 제5-3호증 및 제5-4호증)", `(${b("갑 제5-3호증 및 제5-4호증")})`],
    ["(갑 제5-3호증 및 갑 제5-4호증)", `(${b("갑 제5-3호증 및 갑 제5-4호증")})`],
    ["(갑 제5-3호증, 갑 제5-4호증)", `(${b("갑 제5-3호증, 갑 제5-4호증")})`],
    ["(<strong>갑 제5-3호증 및 갑 제5-4호증</strong>)", `(${b("갑 제5-3호증 및 갑 제5-4호증")})`],
    ["<strong>갑 제5-3호증 및 갑 제5-4호증</strong>", b("갑 제5-3호증 및 갑 제5-4호증")],
    ["<strong>갑 제5-3호증, 갑 제5-4호증</strong>", b("갑 제5-3호증, 갑 제5-4호증")],
  ];
  for (const [plain, rich] of gabSubs5b) {
    if (out.includes(plain)) out = out.split(plain).join(rich);
  }
  return out;
}

/**
 * `**…**` 구간 안의 스마트 인용부호 등을 ASCII로 통일해 marked가 굵게로 인식하기 쉽게 합니다.
 * (예: `**'사실상 … 인상'**` 원문이 `'` U+2019인 경우)
 */
function normalizeMarkdownBoldSpans(md) {
  if (!md || !md.includes("**")) return md;
  return md.replace(/\*\*([\s\S]*?)\*\*/g, (full, inner) => {
    const n = inner
      .replace(/\u2018/g, "'")
      .replace(/\u2019/g, "'")
      .replace(/\u201c/g, '"')
      .replace(/\u201d/g, '"');
    return `**${n}**`;
  });
}

/**
 * marked가 `<strong>`으로 바꾸지 못하고 HTML에 `**문구**`가 그대로 남은 경우 보정합니다.
 * `<pre>…</pre>` 안은 건드리지 않습니다.
 */
function htmlLiteralBoldToStrong(html) {
  if (!html || !html.includes("**")) return html;
  const re = /<pre\b[\s\S]*?<\/pre>/gi;
  const chunks = [];
  let last = 0;
  let m;
  const s = html;
  while ((m = re.exec(s)) !== null) {
    chunks.push(s.slice(last, m.index));
    chunks.push(m[0]);
    last = m.index + m[0].length;
  }
  chunks.push(s.slice(last));
  return chunks
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk;
      return chunk.replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>");
    })
    .join("");
}

/** 파싱되지 않고 텍스트로 남은 `**` 제거(코드 블록 제외). */
function stripLiteralMarkdownBoldMarkers(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) {
    if (!n.nodeValue || !n.nodeValue.includes("**")) continue;
    if (n.parentElement && n.parentElement.closest("pre")) continue;
    nodes.push(n);
  }
  for (const node of nodes) {
    node.nodeValue = node.nodeValue.replace(/\*\*/g, "");
  }
}

/**
 * 마크다운 렌더 결과에서 취소선·인라인 코드 등을 평문으로 풉니다(인용 링크는 유지).
 * `preserveBoldItalic`: true이면 `**`·`***` 등으로 생긴 strong·em·b는 유지(청구서·신청서 본문).
 */
function unwrapMarkdownDecorations(root, options = {}) {
  const preserveBoldItalic = Boolean(options.preserveBoldItalic);
  if (!root) return;
  const unwrapTags = preserveBoldItalic ? ["del", "s"] : ["em", "strong", "b", "del", "s"];
  unwrapTags.forEach((tag) => {
    root.querySelectorAll(tag).forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
  });
  root.querySelectorAll("code").forEach((el) => {
    if (el.closest("pre")) return;
    const parent = el.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(el.textContent), el);
  });
  if (!preserveBoldItalic) stripLiteralMarkdownBoldMarkers(root);
  if (preserveBoldItalic) promoteLiteralBoldToStrong(root);
}

function promoteLiteralBoldToStrong(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) {
    if (!n.nodeValue || !n.nodeValue.includes("**")) continue;
    if (n.parentElement && n.parentElement.closest("pre")) continue;
    nodes.push(n);
  }
  for (const node of nodes) {
    const txt = node.nodeValue;
    const hasPair = /\*\*[\s\S]*?\*\*/.test(txt);
    if (hasPair) {
      const frag = document.createDocumentFragment();
      const re = /\*\*([\s\S]*?)\*\*/g;
      let m, last = 0;
      while ((m = re.exec(txt)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
        const strong = document.createElement("strong");
        strong.textContent = m[1];
        frag.appendChild(strong);
        last = m.index + m[0].length;
      }
      let tail = txt.slice(last);
      if (tail.includes("**")) tail = tail.replace(/\*\*/g, "");
      if (tail) frag.appendChild(document.createTextNode(tail));
      node.parentNode.replaceChild(frag, node);
    } else {
      node.nodeValue = txt.replace(/\*\*/g, "");
    }
  }
}

/** 정본에서 「미주」「각주」제목(마크다운 2단 제목) 이후를 미주 블록으로 분리 */
function splitMainAndNotes(md) {
  const text = md.replace(/\r\n/g, "\n");
  const re = /^##\s*(미주|각주)\s*$/m;
  const match = text.match(re);
  if (!match || match.index === undefined) {
    return { main: text.trim(), notes: "" };
  }
  const idx = match.index;
  const main = text.slice(0, idx).trim();
  const notes = text.slice(idx).trim();
  return { main, notes };
}

/** `(위통합)`·`(위셀병합)` 등 — 1열 세로병합 표식(셀 내용만, 공백 무시) */
function isGab3MergeAboveMarkerText(text) {
  const s = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "");
  if (!s) return false;
  return (
    /^[\(（]위통합[)）]$/.test(s) ||
    /^위통합[)）]$/.test(s) ||
    /^[\(（]위셀병합[)）]$/.test(s) ||
    /^위셀병합[)）]$/.test(s)
  );
}

/** `thead` 첫 행(없으면 tbody 첫 행) 기준 논리 열 수 — colspan 반영 */
function gab3TableColumnCount(table) {
  const headTr = table.querySelector(":scope > thead tr");
  const row = headTr || table.tBodies[0]?.rows[0];
  if (!row) return 0;
  let n = 0;
  for (let i = 0; i < row.cells.length; i++) {
    n += Number(row.cells[i].colSpan) || 1;
  }
  return n;
}

function gab3TrOccupiedColumnCount(tr) {
  if (!tr?.cells?.length) return 0;
  let n = 0;
  for (let i = 0; i < tr.cells.length; i++) {
    n += Number(tr.cells[i].colSpan) || 1;
  }
  return n;
}

/**
 * 별지 제3호: tbody에서 **이 행이 표의 전체 열 수만큼 칸을 가진 경우에만**(=실제 1열에 `<td>`가 있음)
 * 1열이 병합 표식이면 제거하고 윗행 1열 `rowspan` 증가.
 * `rowspan` 연속 행은 칸 수가 부족하므로 건드리지 않음(`cellIndex`는 행 내 순번이라 구분에 쓰이지 않음).
 */
function mergeGab3MergeAboveMarkerRows(root) {
  if (!root?.querySelector) return;
  for (const table of root.querySelectorAll(".doc-gab3-time table")) {
    const colCount = gab3TableColumnCount(table);
    if (colCount < 2) continue;
    for (const tbody of table.tBodies) {
      for (const tr of tbody.querySelectorAll(":scope > tr")) {
        if (!tr.cells || tr.cells.length === 0) continue;
        if (gab3TrOccupiedColumnCount(tr) < colCount) continue;
        const first = tr.cells[0];
        if (!isGab3MergeAboveMarkerText(first.textContent)) continue;
        let prev = tr.previousElementSibling;
        let anchor = null;
        while (prev) {
          if (prev.cells && prev.cells.length > 0 && gab3TrOccupiedColumnCount(prev) >= colCount) {
            anchor = prev.cells[0];
            break;
          }
          prev = prev.previousElementSibling;
        }
        if (!anchor) continue;
        const nextRs = Number(anchor.getAttribute("rowspan") || 1) + 1;
        anchor.setAttribute("rowspan", String(nextRs));
        first.remove();
      }
    }
  }
}

/** URL 없을 때: `, /`·`/`·`／`·`^` — 문자 클래스 안의 `^` 이슈를 피하려 분기 명시 */
const GAB3_LINE_DELIM_NO_URL = /(?:,\s*\/|,\s*／|,\s*\^|\/|／|\^)/;

function gab3TextNodeHasUrlScheme(t) {
  return /[a-z][a-z0-9+.-]*:\/\//i.test(t);
}

/** 조각 2개 이상이면 `<br />` 삽입( trim 후 빈 조각 허용 — URL이 `<a>`로 분리된 뒤 `열람 ^ ` 노드 등) */
function gab3BuildBrFragmentFromRawParts(rawParts) {
  if (rawParts.length < 2) return null;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < rawParts.length; i++) {
    if (i > 0) frag.appendChild(document.createElement("br"));
    const seg = rawParts[i].trim();
    if (seg) frag.appendChild(document.createTextNode(seg));
  }
  return frag;
}

/**
 * 별지 제3호: 줄바꿈 표식을 `<br />`로 치환하고 기호는 제거.
 * - 대상: `.doc-gab3-time` 안 **모든 표** `td`·`th`, 및 **부속** `.doc-gab3-appendix` 안 `p`·`li`(표 밖 문단·목록).
 * - 일반: `, /`·`/`·전각 `／`·`^`
 * - **`http://`·`https://`가 노드에 있으면** **`^`만** 줄바꿈 구분자.
 * **`decorateMdContentRoot` 다음**에 호출. `a`·`code`·`pre` 안 텍스트는 건드리지 않음.
 */
function gab3CollectSlashLineBreakTargets(root) {
  const seen = new Set();
  const out = [];
  const addAll = (nodeList) => {
    for (const el of nodeList) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
  };
  addAll(root.querySelectorAll(".doc-gab3-time table td, .doc-gab3-time table th"));
  addAll(root.querySelectorAll("table.doc-gab-appendix-compare td, table.doc-gab-appendix-compare th"));
  addAll(root.querySelectorAll(".doc-gab3-appendix :is(p, li)"));
  return out;
}

function applyGab3SlashLineBreaks(root) {
  if (!root?.querySelector) return;
  const maxPass = 12;
  for (let pass = 0; pass < maxPass; pass++) {
    const blocks = gab3CollectSlashLineBreakTargets(root);
    let changed = false;
    for (const cell of blocks) {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n);
      for (const textNode of textNodes) {
        if (processGab3SlashTextNode(textNode)) changed = true;
      }
    }
    if (!changed) break;
  }
}

/**
 * @returns {boolean} 치환했으면 true
 */
function gab3NormalizeCaretMarkers(text) {
  return String(text || "")
    .replace(/\uFF3E/g, "^")
    .replace(/\u02C6/g, "^");
}

function processGab3SlashTextNode(textNode) {
  const tRaw = textNode.nodeValue;
  if (!tRaw) return false;
  const t = gab3NormalizeCaretMarkers(tRaw);
  const el = textNode.parentElement;
  if (!el || el.closest("a, code, pre, script, style")) return false;

  const hasUrl = gab3TextNodeHasUrlScheme(t);
  if (hasUrl) {
    if (!t.includes("^") && !/,\s*\^/.test(t)) return false;
    if (/^\s*,\s*\^\s*$/.test(t)) {
      textNode.parentNode.replaceChild(document.createElement("br"), textNode);
      return true;
    }
    if (/^\s*\^\s*$/.test(t)) {
      textNode.parentNode.replaceChild(document.createElement("br"), textNode);
      return true;
    }
    const endsCommaCaret = t.match(/^([\s\S]+?),\s*\^\s*$/);
    if (endsCommaCaret && endsCommaCaret[1].trim()) {
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode(endsCommaCaret[1].trim()));
      frag.appendChild(document.createElement("br"));
      textNode.parentNode.replaceChild(frag, textNode);
      return true;
    }
    const leadCaret = t.match(/^\s*\^([\s\S]+)$/);
    if (leadCaret && leadCaret[1].trim()) {
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createElement("br"));
      frag.appendChild(document.createTextNode(leadCaret[1].trim()));
      textNode.parentNode.replaceChild(frag, textNode);
      return true;
    }
    const rawCaret = t.split(/(?:,\s*\^|\^)/);
    const fragCaret = gab3BuildBrFragmentFromRawParts(rawCaret);
    if (fragCaret) {
      textNode.parentNode.replaceChild(fragCaret, textNode);
      return true;
    }
    return false;
  }

  if (
    !t.includes("/") &&
    !t.includes("／") &&
    !t.includes("^") &&
    !/,\s*[\/／^]/.test(t)
  ) {
    return false;
  }

  if (/^\s*,\s*[\/／^]\s*$/.test(t)) {
    textNode.parentNode.replaceChild(document.createElement("br"), textNode);
    return true;
  }
  if (/^\s*[\/／^]\s*$/.test(t)) {
    textNode.parentNode.replaceChild(document.createElement("br"), textNode);
    return true;
  }

  const endsCommaSlash = t.match(/^([\s\S]+?),\s*[\/／^]\s*$/);
  if (endsCommaSlash && endsCommaSlash[1].trim()) {
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode(endsCommaSlash[1].trim()));
    frag.appendChild(document.createElement("br"));
    textNode.parentNode.replaceChild(frag, textNode);
    return true;
  }

  const leadSlash = t.match(/^\s*[\/／^]([\s\S]+)$/);
  if (leadSlash && leadSlash[1].trim()) {
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createElement("br"));
    frag.appendChild(document.createTextNode(leadSlash[1].trim()));
    textNode.parentNode.replaceChild(frag, textNode);
    return true;
  }

  const rawDelim = t.split(GAB3_LINE_DELIM_NO_URL);
  const fragDelim = gab3BuildBrFragmentFromRawParts(rawDelim);
  if (fragDelim) {
    textNode.parentNode.replaceChild(fragDelim, textNode);
    return true;
  }
  return false;
}

function mdChunkToTabHtml(prefix, parse, mdChunk) {
  const preserveBoldItalic =
    prefix === "appeal" ||
    prefix === "injunction" ||
    prefix === "gab1" ||
    prefix === "gab2" ||
    prefix === "gab3" ||
    prefix === "gab4";
  if (!preserveBoldItalic) return parse(mdChunk);
  const normalized = normalizeMarkdownBoldSpans(mdChunk);
  return htmlLiteralBoldToStrong(parse(normalized));
}

function decorateMdContentRoot(wrap, prefix) {
  if (!wrap) return;
  const preserveBoldItalic =
    prefix === "appeal" ||
    prefix === "injunction" ||
    prefix === "gab1" ||
    prefix === "gab2" ||
    prefix === "gab3" ||
    prefix === "gab4";
  const unwrapOpts = { preserveBoldItalic };
  upgradeMarkdownAnchorsToCiteRefs(wrap, { nested: false });
  decorateCiteLinks(wrap, { nested: false });
  decorateExternalRefLinks(wrap);
  unwrapMarkdownDecorations(wrap, unwrapOpts);
  /** 취소선·코드 풀기 등으로 새로 생긴 플레인 텍스트에 사건번호·갑호증 링크 재시도 */
  decorateCiteLinks(wrap, { nested: false });
}

async function renderMdLeftOnly(prefix, mdText) {
  const parse = await getMarked();
  const { main, notes } = splitMainAndNotes(mdText);
  const mainEl = $(`#${prefix}-md-main`);
  const wrapEl = $(`#${prefix}-md-notes-wrap`);
  const notesEl = $(`#${prefix}-md-notes`);
  if (!mainEl) return;
  mainEl.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "md-content";
  wrap.innerHTML = injectIncheonIngaGosiLinks(mdChunkToTabHtml(prefix, parse, main));
  mainEl.appendChild(wrap);
  if (notes.trim()) {
    if (wrapEl && notesEl) {
      wrapEl.hidden = false;
      notesEl.replaceChildren();
      const notesWrap = document.createElement("div");
      notesWrap.className = "md-content";
      notesWrap.innerHTML = injectIncheonIngaGosiLinks(mdChunkToTabHtml(prefix, parse, notes));
      notesEl.appendChild(notesWrap);
      if (prefix === "gab3") mergeGab3MergeAboveMarkerRows(notesWrap);
      if (prefix === "gab3") applyGab3SlashLineBreaks(notesWrap);
      decorateMdContentRoot(notesWrap, prefix);
      if (prefix === "gab3") applyGab3SlashLineBreaks(notesWrap);
    }
  } else {
    if (wrapEl) wrapEl.hidden = true;
    if (notesEl) notesEl.replaceChildren();
  }
  const mainWrap = mainEl.querySelector(".md-content");
  if (mainWrap) {
    if (prefix === "gab3") mergeGab3MergeAboveMarkerRows(mainWrap);
    if (prefix === "gab3") applyGab3SlashLineBreaks(mainWrap);
    decorateMdContentRoot(mainWrap, prefix);
    if (prefix === "gab3") applyGab3SlashLineBreaks(mainWrap);
  }
}

async function renderMdSplit(prefix, mdText) {
  mdAsideBaselineByPrefix[prefix] = mdText;
  mdAsideDraftByPrefix[prefix] = mdText;
  await renderMdLeftOnly(prefix, mdText);
  if (portalMdWorkspaceEditable && mdAsideEditMode) {
    const act = document.querySelector(".tab.is-active")?.dataset?.section;
    if (act === prefix) await renderMdAsideEditorForActiveTab();
  }
  updateMdAsideSaveButtonState();
}

function updateMdAsideSaveButtonState() {
  const btn = $("#btn-md-aside-save");
  if (!btn || !portalMdWorkspaceEditable) return;
  const activeTab = document.querySelector(".tab.is-active");
  const prefix = activeTab?.dataset?.section;
  if (!prefix || prefix === "manual" || !mdAsideEditMode) {
    btn.disabled = true;
    return;
  }
  const draft = mdAsideDraftByPrefix[prefix];
  const base = mdAsideBaselineByPrefix[prefix];
  btn.disabled =
    draft === undefined || base === undefined || String(draft) === String(base);
}

/** 탭·해시로 문서 탭이 바뀔 때 — MD수정 끔(오른쪽 MD 원문은 다시 「MD수정」을 눌렀을 때만) */
function resetMdAsideEditModeUi() {
  if (!portalMdWorkspaceEditable) return;
  mdAsideEditMode = false;
  const modeBtn = $("#btn-md-aside-mode");
  if (modeBtn) {
    modeBtn.classList.remove("is-pressed");
    modeBtn.setAttribute("aria-pressed", "false");
  }
  updateMdAsideSaveButtonState();
}

function exitMdAsideEditModeForCitePanel() {
  resetMdAsideEditModeUi();
}

/** MD수정 textarea: 내용 전체 높이로 맞춤(내부 스크롤 대신 열·페이지 스크롤) */
function fitMdAsideTextareaHeight(ta) {
  if (!ta || !ta.classList.contains("md-aside-editor")) return;
  ta.style.overflowY = "hidden";
  ta.style.minHeight = "56px";
  /** `height:0` 측정은 긴 본문에서 scrollHeight 가 과소로 나와 하단(끝./서명)이 잘리는 경우가 있음 */
  ta.style.height = "auto";
  let h = Math.max(ta.scrollHeight, 56);
  ta.style.height = `${h}px`;
  const h2 = ta.scrollHeight;
  if (h2 > h) ta.style.height = `${h2}px`;
}

function scheduleFitMdAsideTextarea(ta) {
  if (!ta) return;
  const run = () => fitMdAsideTextareaHeight(ta);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
  });
  setTimeout(run, 0);
  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(run);
  }
}

async function renderMdAsideEditorMount(prefix, mdText, opts = {}) {
  const scrollAsideIfNeeded = opts.scrollAsideIfNeeded === true;
  const skipInternalScrollRestore = opts.skipInternalScrollRestore === true;
  const mount = $("#cite-preview-mount");
  const h = $("#doc-preview-heading");
  const lead = $("#doc-preview-lead");
  if (!mount || !h || !lead) return;
  const saved = {
    ...readPageScroll(),
    citeTop: readCitePreviewScrollTop(),
  };
  mount.replaceChildren();
  h.replaceChildren();
  const span = document.createElement("span");
  span.textContent = "문서 원문 (MD)";
  h.appendChild(span);
  lead.textContent = "수정하면 왼쪽 본문에 즉시 반영됩니다. [ESC]로 수정 취소.";
  const ta = document.createElement("textarea");
  ta.id = "md-aside-textarea-current";
  ta.className = "md-aside-editor";
  ta.spellcheck = false;
  ta.value = mdText;
  ta.addEventListener("input", () => {
    mdAsideDraftByPrefix[prefix] = ta.value;
    const snap = { ...readPageScroll(), citeTop: readCitePreviewScrollTop() };
    void (async () => {
      await renderMdLeftOnly(prefix, ta.value);
      fitMdAsideTextareaHeight(ta);
      stabilizeMdAsideViewport(snap, { skipPage: false });
    })();
    updateMdAsideSaveButtonState();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      const b = mdAsideBaselineByPrefix[prefix] ?? "";
      const snap = { ...readPageScroll(), citeTop: readCitePreviewScrollTop() };
      ta.value = b;
      mdAsideDraftByPrefix[prefix] = b;
      void (async () => {
        await renderMdLeftOnly(prefix, b);
        scheduleFitMdAsideTextarea(ta);
        stabilizeMdAsideViewport(snap, { skipPage: false });
      })();
      updateMdAsideSaveButtonState();
      try {
        ta.blur({ preventScroll: true });
      } catch {
        ta.blur();
      }
    }
  });
  mount.appendChild(ta);
  if (scrollAsideIfNeeded) {
    showCitePreviewAside();
  } else {
    showCitePreviewAside({ scrollIfNeeded: false });
  }
  scheduleFitMdAsideTextarea(ta);
  stabilizeMdAsideViewport(saved, {
    skip: skipInternalScrollRestore,
    skipPage: scrollAsideIfNeeded,
  });
  /** 포커스가 `MD저장` 등 상단 버튼에 남아 있으면 Enter 가 저장으로 처리됨 — 편집기는 textarea 로 */
  const focusAsideTextarea = () => {
    try {
      ta.focus({ preventScroll: true });
    } catch {
      ta.focus();
    }
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(focusAsideTextarea);
  });
}

function onMdAsideTextareaWindowResize() {
  const ta = $("#md-aside-textarea-current");
  if (!ta) return;
  const snap = { ...readPageScroll(), citeTop: readCitePreviewScrollTop() };
  fitMdAsideTextareaHeight(ta);
  stabilizeMdAsideViewport(snap, { skipPage: false });
}

async function renderMdAsideEditorForActiveTab() {
  const activeTab = document.querySelector(".tab.is-active");
  if (!activeTab) return;
  const prefix = activeTab.dataset.section;
  if (!prefix || prefix === "manual") return;
  const text = mdAsideDraftByPrefix[prefix];
  if (text === undefined) return;
  await renderMdAsideEditorMount(prefix, text);
}

function applyMdAsideToolbarVisibility() {
  const modeBtn = $("#btn-md-aside-mode");
  const saveBtn = $("#btn-md-aside-save");
  if (!modeBtn || !saveBtn) return;
  if (portalMdWorkspaceEditable) {
    modeBtn.hidden = false;
    modeBtn.style.display = "inline-block";
    saveBtn.hidden = false;
    saveBtn.style.display = "inline-block";
  } else {
    modeBtn.hidden = true;
    modeBtn.style.display = "none";
    saveBtn.hidden = true;
    saveBtn.style.display = "none";
    mdAsideEditMode = false;
    modeBtn.classList.remove("is-pressed");
    modeBtn.setAttribute("aria-pressed", "false");
    saveBtn.disabled = true;
  }
}

function bindMdAsideToolbar() {
  const modeBtn = $("#btn-md-aside-mode");
  const saveBtn = $("#btn-md-aside-save");
  if (!modeBtn || !saveBtn) return;
  window.addEventListener("resize", onMdAsideTextareaWindowResize, { passive: true });
  modeBtn.addEventListener("click", async () => {
    if (!portalMdWorkspaceEditable) return;
    const activeTab = document.querySelector(".tab.is-active");
    const prefix = activeTab?.dataset?.section;
    if (!prefix || prefix === "manual") return;
    mdAsideEditMode = !mdAsideEditMode;
    modeBtn.classList.toggle("is-pressed", mdAsideEditMode);
    modeBtn.setAttribute("aria-pressed", mdAsideEditMode ? "true" : "false");
    if (mdAsideEditMode) {
      if (!tabLoaded[prefix]) await loadTabIfNeeded(prefix);
      const t = mdAsideDraftByPrefix[prefix];
      if (t !== undefined) {
        await renderMdAsideEditorMount(prefix, t, { scrollAsideIfNeeded: true });
      } else {
        mdAsideEditMode = false;
        modeBtn.classList.remove("is-pressed");
        modeBtn.setAttribute("aria-pressed", "false");
      }
    } else {
      clearDocPreviewPanel();
    }
    updateMdAsideSaveButtonState();
  });
  saveBtn.addEventListener("click", async () => {
    if (!portalMdWorkspaceEditable || saveBtn.disabled) return;
    if (portalMdSaveRequestInFlight) return;
    const activeTab = document.querySelector(".tab.is-active");
    const prefix = activeTab?.dataset?.section;
    const ta = $("#md-aside-textarea-current");
    const rel = tabSourceRelForSection(prefix || "");
    if (!prefix || !rel || !ta) return;
    const content = ta.value;
    const label = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중…";
    portalMdSaveRequestInFlight = true;
    try {
      const res = await fetch("/api/save-md", {
        method: "POST",
        headers: { "Content-Type": "application/json;charset=utf-8" },
        body: JSON.stringify({ rel, content }),
      });
      let j = {};
      try {
        j = await res.json();
      } catch {
        j = {};
      }
      if (!res.ok || !j.ok) {
        window.alert(j.error || `저장에 실패했습니다(HTTP ${res.status}).`);
        return;
      }
      mdAsideBaselineByPrefix[prefix] = content;
      mdAsideDraftByPrefix[prefix] = content;
      tabLoaded[prefix] = false;
      const relTab = tabSourceRelForSection(prefix);
      /** `loadTabSource` 가 본문을 비우기 전에 스냅(치환 직후 레이아웃이 짧아지면 복구 실패) */
      const snap = { ...readPageScroll(), citeTop: readCitePreviewScrollTop() };
      if (relTab) {
        const ok = await loadTabSource(prefix, relTab, { cacheBust: true });
        if (ok) tabLoaded[prefix] = true;
      }
      if (mdAsideEditMode) {
        await renderMdAsideEditorMount(prefix, content, {
          scrollAsideIfNeeded: false,
          skipInternalScrollRestore: true,
        });
      }
      stabilizeMdAsideViewport(snap, { skipPage: false });
    } catch {
      window.alert(
        "저장 API에 연결할 수 없습니다. 로컬에서 npm start로 연 화면에서만 저장할 수 있습니다."
      );
    } finally {
      portalMdSaveRequestInFlight = false;
      saveBtn.textContent = label;
      updateMdAsideSaveButtonState();
    }
  });
}

/** MD 편집 모달 왼쪽: 본문 탭과 동일 파이프라인 렌더(입력과 동시 갱신) */
let mdEditorPreviewRaf = 0;

async function renderMdEditorPreview(prefix, mdText) {
  const mount = $("#md-editor-preview-mount");
  if (!mount || !prefix) return;
  try {
    const parse = await getMarked();
    const { main, notes } = splitMainAndNotes(mdText);
    mount.replaceChildren();
    const mainWrap = document.createElement("div");
    mainWrap.className = "md-content";
    mainWrap.innerHTML = injectIncheonIngaGosiLinks(mdChunkToTabHtml(prefix, parse, main));
    mount.appendChild(mainWrap);
    if (prefix === "gab3") mergeGab3MergeAboveMarkerRows(mainWrap);
    if (prefix === "gab3") applyGab3SlashLineBreaks(mainWrap);
    decorateMdContentRoot(mainWrap, prefix);
    if (prefix === "gab3") applyGab3SlashLineBreaks(mainWrap);
    if (notes.trim()) {
      const hr = document.createElement("hr");
      hr.className = "md-editor-preview-sep";
      mount.appendChild(hr);
      const notesWrap = document.createElement("div");
      notesWrap.className = "md-content md-editor-preview-notes";
      notesWrap.innerHTML = injectIncheonIngaGosiLinks(mdChunkToTabHtml(prefix, parse, notes));
      mount.appendChild(notesWrap);
      if (prefix === "gab3") mergeGab3MergeAboveMarkerRows(notesWrap);
      if (prefix === "gab3") applyGab3SlashLineBreaks(notesWrap);
      decorateMdContentRoot(notesWrap, prefix);
      if (prefix === "gab3") applyGab3SlashLineBreaks(notesWrap);
    }
  } catch {
    mount.replaceChildren();
    const err = document.createElement("p");
    err.className = "muted md-editor-preview-err";
    err.textContent = "미리보기를 만들 수 없습니다.";
    mount.appendChild(err);
  }
}

function scheduleMdEditorPreview() {
  if (mdEditorPreviewRaf) cancelAnimationFrame(mdEditorPreviewRaf);
  mdEditorPreviewRaf = requestAnimationFrame(() => {
    mdEditorPreviewRaf = 0;
    const modal = $("#md-editor-modal");
    const ta = $("#md-editor-textarea");
    const p = mdEditorState.tabPrefix;
    if (!modal || modal.hidden || !ta || !p) return;
    void renderMdEditorPreview(p, ta.value);
  });
}

/** 서면 탭 본문 로드 실패 시 안내 */
const MD_TAB_LOAD_FAILURE_HINT = "마크다운 소스를 불러오지 못했습니다.";

function tabLoadFailureMessage(relPath) {
  const base = MD_TAB_LOAD_FAILURE_HINT;
  const r = String(relPath || "").trim();
  if (!r) return base;
  const p = displayRepoWorkPath(r);
  if (!p || p === "—") return base;
  return `${base}\n${p}`;
}

/**
 * 저장소 `행정심판청구(최종)/…` 정본이 없을 때(클론·USB·COMMISSION_REPO_ROOT 미설정 등)
 * `public/source/` 동명 탭용 MD로 표시 — `tabSources`·툴팁·저장 경로는 정본 rel을 유지.
 */
const TAB_SOURCE_PUBLIC_FALLBACK = {
  appeal: "행정심판청구.md",
  gab1: "별지_갑1호증.md",
  gab2: "별지_갑2호증.md",
  gab3: "별지_갑3호증.md",
  gab4: "별지_갑4호증.md",
  injunction: "집행정지신청.md",
  manual: "포털_사용설명서.md",
};

function publicSourceTabUrl(prefix) {
  const name = TAB_SOURCE_PUBLIC_FALLBACK[prefix];
  if (!name) return "";
  return `source/${name.split("/").map((s) => encodeURIComponent(s)).join("/")}`;
}

/** `/serve/` 정본 → 없으면 `source/` 탭 폴백(편집기·탭 본문 공통) */
async function fetchMdFromServeOrFallback(relPath, prefix, opts = {}) {
  const cacheBust = opts.cacheBust === true;
  const tryOne = async (url) => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return undefined;
      return await res.text();
    } catch {
      return undefined;
    }
  };
  let t;
  if (String(relPath || "").trim()) {
    t = await tryOne(serveUrl(relPath, cacheBust));
    if (t !== undefined) return t;
  }
  const fb = publicSourceTabUrl(prefix);
  if (fb) {
    const fbUrl = cacheBust ? `${fb}${fb.includes("?") ? "&" : "?"}_=${Date.now()}` : fb;
    t = await tryOne(fbUrl);
    if (t !== undefined) return t;
  }
  return undefined;
}

async function loadTabSource(prefix, relPath, opts = {}) {
  const errEl = $(`#${prefix}-err`);
  errEl.hidden = true;
  const mainEl = $(`#${prefix}-md-main`);
  mainEl.innerHTML = "<p class=\"muted\">내용을 불러오는 중입니다.</p>";
  try {
    const text = await fetchMdFromServeOrFallback(relPath, prefix, opts);
    if (text === undefined) {
      mainEl.innerHTML = "";
      errEl.textContent = tabLoadFailureMessage(relPath);
      errEl.hidden = false;
      return false;
    }
    await renderMdSplit(prefix, text);
    return true;
  } catch {
    mainEl.innerHTML = "";
    errEl.textContent = tabLoadFailureMessage(relPath);
    errEl.hidden = false;
    return false;
  }
}

/** MD 편집 모달: `portal-data.json`의 `tabSources` 경로와 동일한 `rel`만 저장 API에 전달 */
let mdEditorState = { rel: "", tabPrefix: null, filenameBase: "" };

/** 내려받기 파일명 — 저장소 정본과 동일한 `.md` 꼬리 */
function mdRelToDownloadFilename(rel) {
  const base = String(rel).split("/").pop() || "document.md";
  return /\.md$/i.test(base) ? base : `${base}.md`;
}

/** `tabSources`·`/serve/`와 동일한 저장소 상대 경로(내부·폴백) */
function repoPathFromServeRel(rel) {
  const r = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
  return r || "—";
}

/**
 * `/serve/`·JSON rel → 디스크 기준 저장소 상대(누락된 제출용 상위만 보강).
 * `start.js`·`portal-work-paths.js` 와 동일 규칙: `evidenceUnified/…` → `submitDir/…`
 */
function diskRelFromPortalRel(rel) {
  const r = repoPathFromServeRel(rel);
  if (r === "—") return "—";
  const wl = portalWorkLayout;
  const ev = wl?.evidenceUnified;
  const sub = wl?.submitDir;
  if (ev && sub && r.startsWith(`${ev}/`)) {
    return `${sub}/${r}`;
  }
  if (!wl && r.startsWith("갑호증및법령정보/")) {
    return `행정심판청구(제출용)/${r}`;
  }
  return r;
}

/** `diskRel`(POSIX) 접두사 후보 — 긴 것부터(원본/제출원문 등이 원본 단독보다 우선). */
function workFolderPrefixesDisk() {
  const wl = portalWorkLayout;
  const w = wl?.wonmunDir || "행정심판청구(원본)";
  const s = wl?.submitDir || "행정심판청구(제출용)";
  const sub = wl?.wonmunSubmitWonmun || "제출원문(원본)";
  const ev = wl?.evidenceUnified || "갑호증및법령정보";
  const aux = wl?.wonmunWorkAux || "작업보조";
  return [
    `${w}/${sub}`,
    `${w}/${aux}`,
    `${s}/${ev}`,
    w,
    s,
  ];
}

function splitDiskRelIntoWorkFolderAndTail(diskRel) {
  const d = String(diskRel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
  if (!d) return { folder: "", tail: "" };
  const parts = d.split("/").filter(Boolean);
  for (const pref of workFolderPrefixesDisk()) {
    const psegs = pref.split("/").filter(Boolean);
    if (psegs.length > parts.length) continue;
    let ok = true;
    for (let i = 0; i < psegs.length; i++) {
      if (parts[i] !== psegs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return { folder: pref, tail: parts.slice(psegs.length).join("/") };
    }
  }
  return { folder: "", tail: d };
}

/** 작업 폴더(저장소 상대 POSIX)만 절대 경로로 합침. */
function absPathForWorkFolderDiskRel(folderDiskRel) {
  const root = String(portalRepoRoot || "").trim();
  const f = String(folderDiskRel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
  if (!f) return "";
  if (!root) return f;
  const sep = root.includes("\\") ? "\\" : "/";
  const rootNorm = root.replace(/[/\\]+$/, "");
  const segments = f.split("/").filter(Boolean);
  return rootNorm + sep + segments.join(sep);
}

/**
 * 표시용 경로: 드라이브 포함 절대 경로를 노출하지 않고 저장소 상대 경로만 반환.
 * @param {string} rel `/serve/`·tabSources·증거 `rel`
 */
function displayRepoWorkPath(rel) {
  const r = diskRelFromPortalRel(rel);
  if (r === "—") return "—";
  return r;
}

/** 파일위치(절대 경로) 표시 제거 — 파일명만 유지 */
function appendWorkPathCaptionLine(/* parentEl, rel */) {}

function setViewerModalWorkPathFromUrl(/* mediaUrl */) {
  const pathEl = $("#viewer-path");
  if (!pathEl) return;
  pathEl.textContent = "";
  pathEl.hidden = true;
}

function clearViewerModalWorkPath() {
  const pathEl = $("#viewer-path");
  if (!pathEl) return;
  pathEl.textContent = "";
  pathEl.hidden = true;
}

function formatTabSourceTooltip(heading, _rel, extraLine) {
  let s = heading;
  if (extraLine) s += `\n\n${extraLine}`;
  return s;
}

function applyTabSourcePathHints() {
  const src = metaGlobal?.tabSources;
  if (!src || typeof src !== "object") return;

  const setTab = (section, rel, heading, extra) => {
    if (!rel) return;
    const el = document.querySelector(`.tab[data-section="${section}"]`);
    if (el) el.setAttribute("title", formatTabSourceTooltip(heading, rel, extra));
  };

  setTab("appeal", src.appeal, "행정심판청구서 탭", null);
  setTab("injunction", src.injunction, "집행정지신청서 탭", null);
  setTab("gab1", src.gab1, "별지 제1호 탭", null);
  setTab("gab2", src.gab2, "별지 제2호 탭", null);
  setTab("gab3", src.gab3, "별지 제3호 탭", null);
  setTab("gab4", src.gab4, "별지 제4호 탭", null);

  const setBtn = (id, rel, heading, extra) => {
    if (!rel) return;
    const el = document.getElementById(id);
    if (el) el.setAttribute("title", formatTabSourceTooltip(heading, rel, extra));
  };

  setBtn("btn-md-appeal", src.appeal, "MD 편집 · 행정심판청구서", null);
  setBtn("btn-md-injunction", src.injunction, "MD 편집 · 집행정지신청서", null);
  setBtn("btn-md-gab1", src.gab1, "MD 편집 · 별지 제1호", null);
  setBtn("btn-md-gab2", src.gab2, "MD 편집 · 별지 제2호", null);
  setBtn("btn-md-gab3", src.gab3, "MD 편집 · 별지 제3호", null);
  setBtn("btn-md-gab4", src.gab4, "MD 편집 · 별지 제4호", null);
}

async function openMdEditor(prefix) {
  const src = metaGlobal?.tabSources || {};
  let rel = null;
  let title = "원문 MD";
  if (prefix === "appeal") {
    rel = src.appeal;
    title = "행정심판청구서 (MD)";
  } else if (prefix === "gab1") {
    rel = src.gab1;
    title = "별지 제1호 (MD)";
  } else if (prefix === "gab2") {
    rel = src.gab2;
    title = "별지 제2호 (MD)";
  } else if (prefix === "gab3") {
    rel = src.gab3;
    title = "별지 제3호 (MD)";
  } else if (prefix === "gab4") {
    rel = src.gab4;
    title = "별지 제4호 (MD)";
  } else if (prefix === "injunction") {
    rel = src.injunction;
    title = "집행정지신청서 (MD)";
  }
  if (!rel) {
    window.alert("이 화면 설정(tabSources)에 해당 MD 경로가 없습니다.");
    return;
  }
  const titleEl = $("#md-editor-title");
  const statusEl = $("#md-editor-status");
  const ta = $("#md-editor-textarea");
  const modal = $("#md-editor-modal");
  if (!titleEl || !ta || !modal) return;
  titleEl.textContent = title;
  const relLine = $("#md-editor-source-rel");
  if (relLine) {
    relLine.textContent = `작업 폴더·파일: ${displayRepoWorkPath(rel)}`;
    relLine.hidden = false;
  }
  statusEl.textContent = "";
  statusEl.className = "md-editor-status";
  ta.value = "불러오는 중…";
  const previewMount = $("#md-editor-preview-mount");
  if (previewMount) {
    previewMount.replaceChildren();
    previewMount.dataset.mdTab = prefix;
  }
  modal.hidden = false;
  document.body.style.overflow = "hidden";

  mdEditorState = {
    rel,
    tabPrefix: prefix,
    filenameBase: mdRelToDownloadFilename(rel),
  };

  const text = await fetchMdFromServeOrFallback(rel, prefix);
  if (text === undefined) {
    ta.value = "";
    if (previewMount) previewMount.replaceChildren();
    statusEl.textContent = tabLoadFailureMessage(rel);
    statusEl.classList.add("is-err");
    return;
  }
  ta.value = text;
  await renderMdEditorPreview(prefix, text);
}

function closeMdEditorModal() {
  if (mdEditorPreviewRaf) {
    cancelAnimationFrame(mdEditorPreviewRaf);
    mdEditorPreviewRaf = 0;
  }
  const previewMount = $("#md-editor-preview-mount");
  if (previewMount) {
    previewMount.replaceChildren();
    delete previewMount.dataset.mdTab;
  }
  const modal = $("#md-editor-modal");
  if (modal) modal.hidden = true;
  document.body.style.overflow = "";
  const relLine = $("#md-editor-source-rel");
  if (relLine) {
    relLine.hidden = true;
    relLine.textContent = "";
  }
}

function downloadMdAsTxt() {
  const ta = $("#md-editor-textarea");
  if (!ta) return;
  const text = ta.value;
  const name = mdEditorState.filenameBase || "document.md";
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function saveMdToRepo() {
  const statusEl = $("#md-editor-status");
  const rel = mdEditorState.rel;
  const ta = $("#md-editor-textarea");
  if (!statusEl || !ta || !rel) return;
  if (portalMdSaveRequestInFlight) return;
  statusEl.textContent = "";
  statusEl.className = "md-editor-status";
  const content = ta.value;
  statusEl.textContent = "저장 중…";
  portalMdSaveRequestInFlight = true;
  try {
    const res = await fetch("/api/save-md", {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8" },
      body: JSON.stringify({ rel, content }),
    });
    let j = {};
    try {
      j = await res.json();
    } catch {
      j = {};
    }
    if (!res.ok || !j.ok) {
      if (res.status === 503 && String(j.error || "").includes("Serve disabled")) {
        statusEl.textContent =
          "저장·정본 열람(/serve/)이 꺼져 있습니다. 시스템 환경 변수 COMMISSION_REPO_ROOT가 USB 등 불완전한 복사본을 가리키는 경우가 많습니다. 사용자 변수에서 비우거나 younsu 루트로 맞춘 뒤, web/commission-portal 에서 npm start 를 다시 실행하세요.";
      } else {
        statusEl.textContent =
          j.error || `저장에 실패했습니다(HTTP ${res.status}).`;
      }
      statusEl.classList.add("is-err");
      return;
    }
    const absPath = displayRepoWorkPath(rel);
    statusEl.textContent =
      absPath && absPath !== "—"
        ? `저장되었습니다. 본문 탭에 곧바로 반영되었습니다.\n${absPath}`
        : "저장되었습니다. 본문 탭에 곧바로 반영되었습니다.";
    statusEl.classList.add("is-ok");
    const p = mdEditorState.tabPrefix;
    if (p) {
      tabLoaded[p] = false;
      const relTab = tabSourceRelForSection(p);
      const snap = { ...readPageScroll(), citeTop: readCitePreviewScrollTop() };
      if (relTab) {
        const ok = await loadTabSource(p, relTab, { cacheBust: true });
        if (ok) tabLoaded[p] = true;
      }
      stabilizeMdAsideViewport(snap, { skipPage: false });
    }
  } catch {
    statusEl.textContent =
      "저장 API에 연결할 수 없습니다. 로컬에서 npm start로 연 화면에서만 저장할 수 있습니다.";
    statusEl.classList.add("is-err");
  } finally {
    portalMdSaveRequestInFlight = false;
  }
}

function bindMdEditorTools() {
  $("#btn-md-appeal")?.addEventListener("click", () => openMdEditor("appeal"));
  $("#btn-md-injunction")?.addEventListener("click", () =>
    openMdEditor("injunction")
  );
  $("#btn-md-gab1")?.addEventListener("click", () => openMdEditor("gab1"));
  $("#btn-md-gab2")?.addEventListener("click", () => openMdEditor("gab2"));
  $("#btn-md-gab3")?.addEventListener("click", () => openMdEditor("gab3"));
  $("#btn-md-gab4")?.addEventListener("click", () => openMdEditor("gab4"));
  $("#md-editor-close")?.addEventListener("click", closeMdEditorModal);
  $("#md-editor-modal")
    ?.querySelector("[data-md-editor-close]")
    ?.addEventListener("click", closeMdEditorModal);
  $("#md-editor-download-txt")?.addEventListener("click", downloadMdAsTxt);
  $("#md-editor-print-preview")?.addEventListener("click", () => {
    const body = document.body;
    body.classList.add("md-editor-print-session");
    const onAfterPrint = () => {
      body.classList.remove("md-editor-print-session");
      window.removeEventListener("afterprint", onAfterPrint);
    };
    window.addEventListener("afterprint", onAfterPrint);
    window.print();
  });
  $("#md-editor-save")?.addEventListener("click", () => saveMdToRepo());
  const mdTa = $("#md-editor-textarea");
  mdTa?.addEventListener("input", scheduleMdEditorPreview);
  mdTa?.addEventListener("paste", () => {
    requestAnimationFrame(scheduleMdEditorPreview);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = $("#md-editor-modal");
    if (modal && !modal.hidden) closeMdEditorModal();
  });
}

const DOC_MD_TAB_IDS = ["appeal", "injunction", "gab1", "gab2", "gab3", "gab4"];
/** `tabSources`에 rel이 없어도 `public/source/` 동명 MD로 표시할 탭 */
const TAB_IDS_WITH_PUBLIC_MD_FALLBACK = [...DOC_MD_TAB_IDS, "manual"];

async function loadTabIfNeeded(id) {
  if (!metaGlobal) return;
  /** 선로드·탭 전환 등으로 tabLoaded 만 true 이고 본문이 비는 경우(로딩 후 빈 화면) 재시도 */
  if (tabLoaded[id]) {
    const mainEl = document.querySelector(`#${id}-md-main`);
    if (mainEl?.querySelector(".md-content")) return;
    tabLoaded[id] = false;
  }
  let rel = tabSourceRelForSection(id);
  if (!rel && TAB_IDS_WITH_PUBLIC_MD_FALLBACK.includes(id)) {
    rel = "";
  } else if (!rel) {
    return;
  }
  if (await loadTabSource(id, rel)) tabLoaded[id] = true;
}

function extractEvidenceFileRefs(detail) {
  const re = /`([^`\n]+\.(?:jpg|jpeg|png|gif|webp|pdf))`/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(detail)) !== null) {
    const name = m[1].trim();
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** 저장소 루트 통합 편철 — `tools/build_commission_evidence_json.py`·start.js 와 동일 */
const GAB_EVIDENCE_PRIMARY_MARKER = "갑호증및법령정보/";
const GAB_EVIDENCE_USB_MARKER = "USB/갑호증및법령정보/";
const COMBINED_LAW_SUBFOLDER = "법령정보/";
const PRECEDENT_LAW_COMBINED_MARKER = "갑호증및법령정보/법령정보/";
const PRECEDENT_LAW_USB_MARKER = "USB/갑호증및법령정보/법령정보/";
/** 별지 등에 남은 구 `…/증거/…` 문구 표시용(신규 rel은 루트 갑 폴더만 사용) */
const EVIDENCE_REPO_PREFIX_CANON = "행정심판청구(제출용)/최종/";
const EVIDENCE_REPO_PREFIX_LEGACY = "행정심판청구(제출용)/";

/** 표시용: 구 증거 접두 또는 루트 갑 폴더 접두 제거 */
function sliceEvidenceTail(rel) {
  const n = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
  if (n.startsWith(GAB_EVIDENCE_PRIMARY_MARKER))
    return n.slice(GAB_EVIDENCE_PRIMARY_MARKER.length);
  if (n.startsWith(GAB_EVIDENCE_USB_MARKER)) return n.slice(GAB_EVIDENCE_USB_MARKER.length);
  if (n.startsWith(EVIDENCE_REPO_PREFIX_CANON)) return n.slice(EVIDENCE_REPO_PREFIX_CANON.length);
  if (n.startsWith(EVIDENCE_REPO_PREFIX_LEGACY)) return n.slice(EVIDENCE_REPO_PREFIX_LEGACY.length);
  return n;
}

function evidenceFileToRel(ref) {
  const n = ref.replace(/\\/g, "/");
  return `${GAB_EVIDENCE_PRIMARY_MARKER}${n}`;
}

/** detail·버튼 등: 이미 `/serve/` 가능한 갑·법령정보 전체 경로면 true */
function isCompleteEvidenceMediaRel(p) {
  const n = String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
  return (
    n.startsWith(GAB_EVIDENCE_PRIMARY_MARKER) || n.startsWith(GAB_EVIDENCE_USB_MARKER)
  );
}

/**
 * 백틱 등 **파일명만** 올 때 `gabFiles`에서 실제 편철 rel(예: `갑호증및법령정보/갑제4호증/갑제4-1….pdf`)을 찾는다.
 * 없으면 null — `/serve/` 는 저장소 상대 경로가 맞아야 `start.js`가 파일을 연다.
 * @param {string} leafOrPath
 * @param {Array<{ rel?: string }>|undefined} gabList — 생략 시 `metaGlobal.gabFiles`
 */
function resolveGabLeafToRel(leafOrPath, gabList) {
  const raw = String(leafOrPath || "").trim().replace(/\\/g, "/");
  if (!raw) return null;
  const leaf = raw.includes("/")
    ? raw.split("/").filter(Boolean).pop() || ""
    : raw;
  if (!leaf) return null;
  const list = gabList ?? metaGlobal?.gabFiles;
  if (!list?.length) return null;
  return findGabRelByBasename(list, leaf);
}

/**
 * 증거 행에 연결된 갑호증 저장소 rel 전부(묶음·detail 백틱·detail 내 전체 경로).
 */
function collectRelsForEvidenceRow(row) {
  const seen = new Set();
  const out = [];
  const add = (r) => {
    const n = normRelPosix(String(r || ""));
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  const g = row.gabFileRange;
  if (g?.rels?.length) {
    for (const r of g.rels) add(r);
  } else if (g?.firstRel) {
    add(g.firstRel);
  }
  for (const f of extractEvidenceFileRefs(row.detail || "")) {
    add(resolveGabLeafToRel(f) || evidenceFileToRel(f));
  }
  const d = String(row.detail || "");
  const rePrimary = /갑호증및법령정보\/[^\s`'"]+/g;
  let m;
  while ((m = rePrimary.exec(d)) !== null) {
    add(m[0]);
  }
  const reUsb = /USB\/갑호증및법령정보\/[^\s`'"]+/g;
  reUsb.lastIndex = 0;
  while ((m = reUsb.exec(d)) !== null) {
    add(m[0]);
  }
  return out;
}

function normCaseId(s) {
  return String(s).replace(/\s/g, "");
}

/**
 * `rel`의 **마지막 경로 조각(파일명)** 에서만 호증 키 추출.
 * 전체 경로에서 매칭하면 `첨부(갑제10호증)_폴더/...` 등이 `갑제10`으로 먼저 잡혀 인용 맵이 오염됨.
 */
function extractGabKeyFromRel(rel) {
  const seg = String(rel || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop() || "";
  return extractGabKeyFromFilename(seg);
}

/** 파일명에서 갑호증 번호 키 추출(오타 `갑제6-2증` 포함) */
function extractGabKeyFromFilename(name) {
  const m = name.match(/갑제(\d+(?:-\d+)?)호증/);
  if (m) return m[1];
  const m2 = name.match(/갑제(\d+(?:-\d+)?)증/);
  if (m2) return m2[1];
  return null;
}

/** `1-1`·`10` 등 키에서 **주번호** 폴더만 (갑제1호증, 갑제10호증). 부번은 파일명으로만 표시 */
function extractGabMajorFromKey(k) {
  if (k == null || k === "") return null;
  const head = String(k).split("-")[0].trim();
  return /^\d+$/.test(head) ? head : null;
}

/** 갑8-1은 QR PNG가 아니라 동영상으로 인용(청구서: 동일 통합본·주제별 보조 영상). 갑9-1은 정본 `갑제9-1호증_…`(PDF·이미지)로 인용. */
/** 우선: `갑제6-2호증_…_동영상.mp4` — 구명 `갑제6-2증_…_동영상_통합.mp4` 는 GAB62_UNIFIED_BASENAMES[1] */
const GAB62_UNIFIED_MP4_FALLBACK =
  "갑호증및법령정보/갑제6호증/갑제6-2호증_건축과_도로·통행_동영상(건축과-25898).mp4";
/** 갑호증 루트 표준명(우선) — 구명 `영상_동춘동198_*.mp4` 는 하위 호환 */
const GAB81_VIDEO_PREFER_BASENAMES = [
  "갑호증_동춘동198_항공사진.mp4",
  "영상_동춘동198_항공사진.mp4",
];
const GAB62_UNIFIED_BASENAMES = [
  "갑제6-2호증_건축과_도로·통행_동영상(건축과-25898).mp4",
  "갑제6-2증_건축과_도로·통행(건축과-25898)_동영상_통합.mp4",
];

function findGabRelByBasename(gabFiles, baseName) {
  const b = String(baseName);
  for (const f of gabFiles || []) {
    const rel = String(f.rel || "");
    if (!rel) continue;
    const leaf = rel.replace(/\\/g, "/").split("/").pop() || "";
    if (rel.endsWith(b) || leaf === b) return rel;
  }
  return null;
}

/**
 * @param {Array<{ rel?: string }>} gabFiles
 * @param {Map<string,string>} gabByKey
 * @param {string|string[]} preferBasename 단일 또는 우선순위 배열
 */
function resolveCiteVideoRelForGab81Or91(gabFiles, gabByKey, preferBasename) {
  const list = Array.isArray(preferBasename) ? preferBasename : [preferBasename];
  for (const b of list) {
    const preferred = findGabRelByBasename(gabFiles, b);
    if (preferred && /\.mp4$/i.test(preferred)) return preferred;
  }
  const v62 = gabByKey.get("6-2");
  if (v62 && /\.mp4$/i.test(String(v62))) return String(v62);
  for (const b of GAB62_UNIFIED_BASENAMES) {
    const unified = findGabRelByBasename(gabFiles, b);
    if (unified && /\.mp4$/i.test(unified)) return unified;
  }
  return GAB62_UNIFIED_MP4_FALLBACK;
}

/** 갑8-1 항공 QR 썸네일(경로 끝) — 묶음 그리드에서 더블클릭 시 동영상 */
function isGab81QrPngRel(rel) {
  return normRelPosix(rel).endsWith("갑제8-1호증_항공사진_QR.png");
}

/** 모달 제목은 파일명(갑제6-2호증_…동영상.mp4) 대신 호증 기준 문구 — 청구서상 항공 주제는 갑6-2 동영상과 동일 편철 */
const GAB81_VIDEO_MODAL_TITLE = "갑 제8-1호증·항공 관련 동영상";

function openGab81RelatedVideoModal() {
  const vrel = resolveCiteVideoRelForGab81Or91(
    metaGlobal?.gabFiles || [],
    citeMaps?.gabByKey || new Map(),
    GAB81_VIDEO_PREFER_BASENAMES
  );
  showModal(GAB81_VIDEO_MODAL_TITLE, "video", serveUrl(vrel));
}

/** `precedentFiles` 항목에서 사건번호 후보 — label 만이 아니라 rel 파일명에서도 추출(매칭 누락 방지). */
function allCaseIdsFromPrecedentEntry(f) {
  const lab = String(f?.label || "");
  const rel = String(f?.rel || "");
  const leaf = rel.split("/").filter(Boolean).pop() || "";
  const hay = `${lab}\n${leaf}`;
  const re = /\d{2,4}\s*(?:두|누|다)\s*\d+/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(hay)) !== null) {
    const id = normCaseId(m[0]);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** `갑호증/법령정보/`·통합 `갑호증 및 법령정보/법령정보/` 판례 PDF는 단독 법령정보 폴더보다 매핑 우선 */
function relIsHighPriorityPrecedentLaw(rel) {
  const s = String(rel || "");
  return (
    s.includes(PRECEDENT_LAW_COMBINED_MARKER) || s.includes(PRECEDENT_LAW_USB_MARKER)
  );
}

function buildCiteMaps(meta, evidence) {
  const caseById = new Map();
  const pref = meta.precedentFiles || [];
  for (const f of pref) {
    const rel = String(f.rel || "");
    if (!rel) continue;
    const lab = String(f.label || "");
    const ids = allCaseIdsFromPrecedentEntry(f);
    const prefer = /^\d{2}_/.test(lab) && !lab.includes("국가법령정보");
    const isUnderGabLaw = relIsHighPriorityPrecedentLaw(rel);
    for (const id of ids) {
      const prev = caseById.get(id);
      const prevUnderGabLaw = prev && relIsHighPriorityPrecedentLaw(prev);
      if (!prev || isUnderGabLaw || (prefer && !prevUnderGabLaw)) {
        caseById.set(id, rel);
      }
    }
  }
  const gabByKey = new Map();
  const gab = meta.gabFiles || [];
  for (const f of gab) {
    const rel = f.rel || "";
    /** `첨부(갑제n호증)_…` 하위 파일은 인용 단일키 후보에서 제외(루트 갑제10-1 등과 키 충돌 방지) */
    if (relHasCheomboPrefix(rel)) continue;
    const key = extractGabKeyFromRel(rel);
    if (key && !gabByKey.has(key)) gabByKey.set(key, rel);
  }
  const reGab = /`([^`\n]*갑제\d[^`]+\.(?:pdf|jpe?g|png|gif|webp|mp4))`/gi;
  for (const row of evidence || []) {
    const d = row.detail || "";
    reGab.lastIndex = 0;
    let m;
    while ((m = reGab.exec(d)) !== null) {
      const name = m[1].trim();
      if (name.includes("첨부(")) continue;
      const key = extractGabKeyFromFilename(name);
      if (!key) continue;
      if (!gabByKey.has(key)) {
        gabByKey.set(
          key,
          resolveGabLeafToRel(name, gab) || evidenceFileToRel(name)
        );
      }
    }
  }
  for (const row of evidence || []) {
    const pk = row.gabBundlePrimaryKey;
    if (
      pk != null &&
      String(pk) !== "" &&
      row.gabFileRange &&
      Array.isArray(row.gabFileRange.rels) &&
      row.gabFileRange.rels.length > 0
    ) {
      const k = String(pk);
      gabByKey.set(k, `__GAB_BUNDLE__:${k}`);
    }
  }
  /** 분할 묶음: `labels`의 「갑 제4-1호증」 등 → 해당 파일 rel (detail 백틱 누락 시에도 인용 키 확보) */
  for (const row of evidence || []) {
    const labels = row.gabFileRange?.labels;
    const rels = row.gabFileRange?.rels;
    if (!Array.isArray(labels) || !Array.isArray(rels)) continue;
    const n = Math.min(labels.length, rels.length);
    for (let i = 0; i < n; i++) {
      const lab = String(labels[i] || "").replace(/\s/g, "");
      const m = lab.match(/제(\d+(?:-\d+)?)호증/);
      if (!m) continue;
      const key = m[1];
      const relOne = rels[i];
      if (relOne && !gabByKey.has(key)) gabByKey.set(key, relOne);
    }
  }
  /** 주번호 1~14: 우측 패널에 `갑제N호증` 폴더 전체 썸네일(`__GAB_FOLDER__:N`). */
  for (let n = 1; n <= 14; n += 1) {
    gabByKey.set(String(n), `__GAB_FOLDER__:${n}`);
  }
  /** 가지번호(4-1, 8-1, 8-2 등) 더블클릭 → 주번호 폴더 전체 썸네일 + 해당 가지번호에 포커스·스크롤 */
  for (const key of [...gabByKey.keys()]) {
    if (!/^\d+-\d+$/.test(key)) continue;
    const maj = key.split("-")[0];
    gabByKey.set(key, `__GAB_FOLDER__:${maj}@${key}`);
  }
  return { caseById, gabByKey };
}

/** `첨부(갑제n호증)_…` 등 저장소상 첨부 편철 경로 */
function relHasCheomboPrefix(rel) {
  return String(rel || "").includes("첨부(");
}

const GAB_SECTION_PREFIX = "갑호증/";
const ATTACH_SECTION_PREFIX = "첨부/";
const LAW_SECTION_PREFIX = "법령정보/";
/** `작업/기타참고/` — 작업 폴더로 옮긴 참고 자료(표시용 경로 축약) */
const WORK_OTHER_REF_PREFIX = "작업/기타참고/";

/** `sliceEvidenceTail` 직후 통합·구 갑·첨부·법령 접두를 걷어 표시용 꼬리만 남김 */
function trimEvidenceTailAfterSlice(tail) {
  let t = String(tail || "");
  if (t.startsWith(GAB_EVIDENCE_PRIMARY_MARKER)) {
    t = t.slice(GAB_EVIDENCE_PRIMARY_MARKER.length);
  }
  if (t.startsWith(GAB_EVIDENCE_USB_MARKER)) {
    t = t.slice(GAB_EVIDENCE_USB_MARKER.length);
  }
  if (t.startsWith(GAB_SECTION_PREFIX)) t = t.slice(GAB_SECTION_PREFIX.length);
  if (t.startsWith(ATTACH_SECTION_PREFIX)) t = t.slice(ATTACH_SECTION_PREFIX.length);
  if (t.startsWith(LAW_SECTION_PREFIX)) t = t.slice(LAW_SECTION_PREFIX.length);
  if (t.startsWith(WORK_OTHER_REF_PREFIX)) t = t.slice(WORK_OTHER_REF_PREFIX.length);
  return t;
}

/**
 * 폴더·파일명 관례 `첨부(갑제N호증)_` — 갑호증 그룹 아래에서는 '첨부'로 오해되지 않게 표시용으로만 제거.
 * (실제 rel·서빙 경로는 변경하지 않음)
 */
function stripCheomboGabPrefixFromSegment(segment) {
  const raw = String(segment || "");
  const stripped = raw.replace(/^첨부\(갑제\d+(?:-\d+)?호증\)_/u, "");
  return stripped || raw;
}

function stripCheomboFromDisplayPath(result) {
  if (!result || !String(result).includes("첨부(갑제")) return result;
  const parts = String(result).split("/");
  const i = parts.length - 1;
  parts[i] = stripCheomboGabPrefixFromSegment(parts[i]);
  return parts.join("/");
}

/** 드롭다운·트리 표시: 경로 축약 후 `첨부(갑제…)_` 표시 접두는 생략 */
function refOptionDisplayLabel(it) {
  const rel = String(it.rel || "")
    .replace(/\\/g, "/")
    .normalize("NFC");
  const label = String(it.label || "").trim().normalize("NFC");
  /** 가상 rel(분할 묶음)은 증거표의 호증명(예: 갑 제4호증)을 표시 — 내부 토큰 문자열을 쓰지 않음 */
  if (rel.startsWith("__GAB_FOLDER__:")) {
    const parsed = parseGabFolderVirtualRel(rel);
    if (parsed?.focusKey) return `갑 제${parsed.focusKey}호증`;
    const n = parsed?.major ?? rel.slice("__GAB_FOLDER__:".length);
    return `갑 제${n}호증`;
  }
  if (
    (rel.startsWith("__REF_GAB_BUNDLE__:") || rel.startsWith("__GAB_BUNDLE__:")) &&
    label
  ) {
    return label;
  }
  let tail = trimEvidenceTailAfterSlice(sliceEvidenceTail(rel));
  if (label && (label.includes("첨부(") || /갑제\d/.test(label) || label.includes("/"))) {
    const out = label.length >= tail.length ? label : tail;
    return stripCheomboFromDisplayPath(out);
  }
  return stripCheomboFromDisplayPath(tail || label || rel);
}

/** 전체 창(모달) 제목: `행정심판청구(제출용)/최종/`·`갑호증/` 등 접두 제외 */
function modalDocTitleFromRel(rel) {
  const norm = String(rel || "")
    .replace(/\\/g, "/")
    .normalize("NFC");
  let tail = trimEvidenceTailAfterSlice(sliceEvidenceTail(rel));
  const t = tail || norm.split("/").filter(Boolean).pop() || String(rel);
  return stripCheomboFromDisplayPath(t);
}

/**
 * 인용·링크에서 분할 묶음 행으로 이동한 뒤 상세(그리드)를 연다.
 * `selectRow`보다 아래에 두면 안 되므로 선언만 앞에 둔다.
 */
function focusEvidenceRow(row) {
  if (!row) return;
  openEvidenceRowInPreviewPanel(row);
  const active =
    document.querySelector(".tab.is-active")?.dataset?.section || "appeal";
  setLocationHash(active, row.num);
}

async function openCiteTarget(rel) {
  if (!rel) return;
  if (String(rel).startsWith("__GAB_FOLDER__:")) {
    await openCiteInPreviewPanel(rel, {});
    return;
  }
  if (String(rel).startsWith("__GAB_BUNDLE__:")) {
    const pk = String(rel).slice("__GAB_BUNDLE__:".length);
    const row = (allRows || []).find(
      (r) =>
        String(r.gabBundlePrimaryKey || "") === pk || String(r.num) === pk
    );
    if (
      row &&
      row.gabFileRange &&
      Array.isArray(row.gabFileRange.rels) &&
      row.gabFileRange.rels.length > 0
    ) {
      focusEvidenceRow(row);
    }
    return;
  }
  if (/\.(mp4|webm|mov|avi)$/i.test(rel)) {
    showModal(modalDocTitleFromRel(rel), "video", serveUrl(rel));
    return;
  }
  if (/\.(jpe?g|png|gif|webp)$/i.test(rel)) {
    showModal(modalDocTitleFromRel(rel), "image", serveUrl(rel));
    return;
  }
  await openRefDocFullscreen(rel);
}

function isTextNodeSkippedForCite(textNode, root) {
  let p = textNode.parentElement;
  while (p && p !== root) {
    if (p.classList && p.classList.contains("cite-ref")) return true;
    const tag = p.tagName;
    if (tag === "CODE" || tag === "PRE" || tag === "SCRIPT" || tag === "STYLE") return true;
    if (tag === "A" && !p.classList.contains("cite-ref")) return true;
    p = p.parentElement;
  }
  return false;
}

/** 판례번호(공백 허용: `2008 두 167`) | 갑호증(「갑 제5-1호증」 또는 생략형 「,  제5-2호증」·「및 제5-2호증」) */
const CITE_TEXT_RE =
  /(\d{2,4}\s*(?:두|누|다)\s*\d+)|((?:갑\s*)?제\s*\d+(?:-\d+)?\s*호증)/g;

/** 갑 제3-1호증부터 갑 제3-7호증(까지) — 청구서는 괄호만 닫는 경우가 많아 `까지` 선택 */
const CITE_GAB_RANGE_RE =
  /갑\s*제\s*(\d+-\d+)\s*호증\s*부터\s*갑\s*제\s*(\d+-\d+)\s*호증(?:\s*까지)?/g;

/** 갑 제5-1호증 및 (갑) 제5-2호증 또는 「갑 제5-1호증,  제5-2호증」 생략형 — 단일 묶음(5a). CITE_TEXT_RE보다 먼저 매칭 */
const CITE_GAB_5A_PAIR_RE =
  /갑\s*제\s*5-1\s*호증\s*(?:및\s*|,\s*)(?:갑\s*)?제\s*5-2\s*호증/g;

/** 갑 제5-3호증 및 (갑) 제5-4호증 — 단일 묶음(5b) */
const CITE_GAB_5B_PAIR_RE =
  /갑\s*제\s*5-3\s*호증\s*및\s*(?:갑\s*)?제\s*5-4\s*호증/g;

function citeLinkElement(rel, labelText, nested) {
  const a = document.createElement("a");
  a.className = nested ? "cite-ref cite-ref--nested" : "cite-ref";
  a.href = "#";
  a.setAttribute("role", "button");
  a.title = CITE_OPEN_TITLE;
  a.dataset.citeRel = rel;
  a.textContent = labelText;
  return a;
}

/** 판례·단일 갑호증만 (범위 제외). 변경 없으면 null */
function buildFragmentSingleCitesOnly(text, nested) {
  const rel5a = citeMaps?.gabByKey?.get("5a");
  const rel5b = citeMaps?.gabByKey?.get("5b");
  const pairHits = [];
  if (rel5a) {
    for (const m of text.matchAll(CITE_GAB_5A_PAIR_RE)) {
      pairHits.push({ index: m.index, len: m[0].length, text: m[0], rel: rel5a });
    }
  }
  if (rel5b) {
    for (const m of text.matchAll(CITE_GAB_5B_PAIR_RE)) {
      pairHits.push({ index: m.index, len: m[0].length, text: m[0], rel: rel5b });
    }
  }
  if (pairHits.length) {
    pairHits.sort((a, b) => a.index - b.index);
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const ph of pairHits) {
      if (ph.index > last) {
        const mid = text.slice(last, ph.index);
        const sub = buildFragmentSingleCitesOnlyNoPair(mid, nested);
        frag.appendChild(sub ?? document.createTextNode(mid));
      }
      frag.appendChild(citeLinkElement(ph.rel, ph.text, nested));
      last = ph.index + ph.len;
    }
    if (last < text.length) {
      const tail = text.slice(last);
      const sub = buildFragmentSingleCitesOnlyNoPair(tail, nested);
      frag.appendChild(sub ?? document.createTextNode(tail));
    }
    return frag;
  }
  return buildFragmentSingleCitesOnlyNoPair(text, nested);
}

/** buildFragmentSingleCitesOnly 본문(5-1·5-2 결합 제외) */
function buildFragmentSingleCitesOnlyNoPair(text, nested) {
  const matches = [...text.matchAll(CITE_TEXT_RE)];
  if (!matches.length) return null;
  let lastIndex = 0;
  const frag = document.createDocumentFragment();
  for (const m of matches) {
    const idx = m.index;
    const full = m[0];
    if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
    let rel = null;
    if (m[1]) {
      rel = citeMaps.caseById.get(normCaseId(m[1]));
    } else if (m[2]) {
      const inner = m[2].replace(/\s/g, "");
      const gm = inner.match(/제(\d+(?:-\d+)?)호증/);
      if (gm) rel = citeMaps.gabByKey.get(gm[1]);
    }
    if (rel) frag.appendChild(citeLinkElement(rel, full, nested));
    else frag.appendChild(document.createTextNode(full));
    lastIndex = idx + full.length;
  }
  if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  return frag;
}

/**
 * 범위(부터~까지) 우선 → 한 링크. 나머지 구간은 단일 인용.
 * citeMaps.gabByKey에 동일 번호대 묶음(예: "3", "4")이 있을 때만 링크.
 */
function buildCiteFragmentForText(text, nested) {
  const rangeMatches = [...text.matchAll(CITE_GAB_RANGE_RE)];
  if (!rangeMatches.length) {
    return buildFragmentSingleCitesOnly(text, nested);
  }
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const rm of rangeMatches) {
    if (rm.index > last) {
      const mid = text.slice(last, rm.index);
      const sub = buildFragmentSingleCitesOnly(mid, nested);
      frag.appendChild(sub ?? document.createTextNode(mid));
    }
    const startPart = rm[1];
    const endPart = rm[2];
    const maj1 = startPart.split("-")[0];
    const maj2 = endPart.split("-")[0];
    const full = rm[0];
    let rel = null;
    if (maj1 === maj2) {
      if (startPart === "5-1" && endPart === "5-2") {
        rel = citeMaps.gabByKey.get("5a");
      } else if (startPart === "5-3" && endPart === "5-4") {
        rel = citeMaps.gabByKey.get("5b");
      } else if (startPart === "10-1" && endPart === "10-7") {
        /** 묶음 키는 10a(갑10-1~10-7). maj1 "10"만 쓰면 첨부 경로와 충돌했던 사례 있음 */
        rel = citeMaps.gabByKey.get("10a");
      } else {
        rel = citeMaps.gabByKey.get(maj1);
      }
    }
    if (rel) frag.appendChild(citeLinkElement(rel, full, nested));
    else frag.appendChild(document.createTextNode(full));
    last = rm.index + full.length;
  }
  if (last < text.length) {
    const tail = text.slice(last);
    const sub = buildFragmentSingleCitesOnly(tail, nested);
    frag.appendChild(sub ?? document.createTextNode(tail));
  }
  return frag;
}

function decorateCiteLinks(root, { nested = false } = {}) {
  if (!root || !citeMaps) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || node.textContent.length < 3) return NodeFilter.FILTER_REJECT;
      if (isTextNodeSkippedForCite(node, root)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const textNode of nodes) {
    const text = textNode.textContent;
    const frag = buildCiteFragmentForText(text, nested);
    if (frag) textNode.parentNode.replaceChild(frag, textNode);
  }
}

/** 법령·판례 사이트 등 외부 링크를 인용 링크 스타일로 통일 */
function decorateExternalRefLinks(root) {
  if (!root) return;
  root.querySelectorAll('a[href^="http"]').forEach((a) => {
    if (a.classList.contains("cite-ref")) return;
    const h = a.getAttribute("href") || "";
    if (/law\.go\.kr|scourt\.go\.kr|moleg\.go\.kr|\.go\.kr\/ls/i.test(h)) {
      a.classList.add("cite-ref", "cite-ref--external");
    }
    if (parseYouTubeUrl(h)) {
      a.classList.add("cite-ref", "cite-ref--youtube");
      a.title = "더블클릭하면 오른쪽 패널에서 재생합니다";
    }
  });
}

/** 마크다운 `[갑 제4-1호증](#)`·`/serve/…` 등 → `cite-ref` (플레인 텍스트 인용은 `decorateCiteLinks`가 처리). */
function tryResolveRelFromServeHref(href) {
  if (!href || href === "#" || href.startsWith("#")) return null;
  try {
    const abs = href.startsWith("http")
      ? href
      : href.startsWith("/")
        ? `${location.origin}${href}`
        : null;
    if (!abs) return null;
    const u = new URL(abs);
    if (u.origin !== location.origin || !u.pathname.startsWith("/serve/")) return null;
    return relFromServeUrl(abs) || null;
  } catch {
    return null;
  }
}

function tryResolveCiteRelFromMarkdownAnchor(a) {
  if (!citeMaps) return null;
  const href = (a.getAttribute("href") || "").trim();
  const normText = (s) => (s || "").replace(/\s+/g, " ").trim();
  const text = normText(a.textContent);
  const alt = normText(a.querySelector("img")?.getAttribute("alt"));
  const textOrAlt = text || alt;
  const compact = (s) => s.replace(/\s/g, "");

  let rel = tryResolveRelFromServeHref(href);
  if (rel) return rel;

  if (href.startsWith("#") && href.length > 1) {
    const frag = href.slice(1);
    const mk = frag.match(/^(?:gab-)?(\d+(?:-\d+)?)$/i);
    if (mk) {
      const r = citeMaps.gabByKey.get(mk[1]);
      if (r) return r;
    }
  }

  const hrefPath = href.split("?")[0];
  if (/갑제\d/i.test(hrefPath)) {
    let leaf = hrefPath.split("/").pop() || "";
    try {
      leaf = decodeURIComponent(leaf);
    } catch {
      /* malformed % — 원문 그대로 */
    }
    const key = extractGabKeyFromFilename(leaf);
    if (key) {
      const r = citeMaps.gabByKey.get(key);
      if (r) return r;
    }
  }

  if (textOrAlt) {
    const inner = compact(textOrAlt);
    const gm = inner.match(/제(\d+(?:-\d+)?)호증/);
    if (gm) {
      const r = citeMaps.gabByKey.get(gm[1]);
      if (r) return r;
    }
    const cm = inner.match(/^(\d{2,4}(?:두|누|다)\d+)$/);
    if (cm) {
      const r = citeMaps.caseById.get(normCaseId(cm[1]));
      if (r) return r;
    }
  }

  return null;
}

function upgradeMarkdownAnchorsToCiteRefs(root, { nested = false } = {}) {
  if (!root) return;
  for (const a of root.querySelectorAll("a[href]")) {
    if (a.classList.contains("cite-ref")) continue;
    const rel = tryResolveCiteRelFromMarkdownAnchor(a);
    if (!rel) continue;
    a.classList.add("cite-ref");
    if (nested) a.classList.add("cite-ref--nested");
    a.href = "#";
    a.setAttribute("role", "button");
    a.title = CITE_OPEN_TITLE;
    a.dataset.citeRel = rel;
  }
}

let citePointerBound = false;

/** 청구·별지·신청 본문과 오른쪽 미리보기 패널 안의 인용·링크는 같은 패널로 연다. */
function isCiteLinkSidePanel(a) {
  return Boolean(
    a &&
      a.closest &&
      a.closest(
        "#section-appeal, #section-injunction, #section-gab1, #section-gab2, #section-gab3, #section-gab4, #cite-preview-aside"
      )
  );
}

function citePreviewOptsForAnchor(a) {
  if (a.closest("#cite-preview-aside")) {
    return { heading: "별첨·참고", lead: DOC_PREVIEW_LEAD_CITE };
  }
  if (a.closest("#section-gab1")) {
    return { heading: "별지 제1호", lead: DOC_PREVIEW_LEAD_GAB_LINK };
  }
  if (a.closest("#section-gab2")) {
    return { heading: "별지 제2호", lead: DOC_PREVIEW_LEAD_APPENDIX_CITE };
  }
  if (a.closest("#section-gab3")) {
    return { heading: "별지 제3호", lead: DOC_PREVIEW_LEAD_APPENDIX_CITE };
  }
  if (a.closest("#section-gab4")) {
    return { heading: "별지 제4호", lead: DOC_PREVIEW_LEAD_APPENDIX_CITE };
  }
  return {};
}

function bindCiteClickHandlers() {
  if (citePointerBound) return;
  citePointerBound = true;
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a.cite-ref[data-cite-rel]");
    if (!a) return;
    e.preventDefault();
  });
  document.addEventListener("dblclick", (e) => {
    const a = e.target.closest("a.cite-ref[data-cite-rel]");
    if (!a) return;
    e.preventDefault();
    if (isCiteLinkSidePanel(a)) {
      openCiteInPreviewPanel(a.dataset.citeRel, citePreviewOptsForAnchor(a)).catch(
        (err) => console.error(err)
      );
    } else {
      openCiteTarget(a.dataset.citeRel).catch((err) => console.error(err));
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const a = e.target.closest("a.cite-ref[data-cite-rel]");
    if (!a) return;
    e.preventDefault();
    if (isCiteLinkSidePanel(a)) {
      openCiteInPreviewPanel(a.dataset.citeRel, citePreviewOptsForAnchor(a)).catch(
        (err) => console.error(err)
      );
    } else {
      openCiteTarget(a.dataset.citeRel).catch((err) => console.error(err));
    }
  });
}

function bindBijeServeLinkDblClick() {
  const sections = [
    { sel: "#section-gab1", heading: "별지 제1호" },
    { sel: "#section-gab2", heading: "별지 제2호" },
    { sel: "#section-gab3", heading: "별지 제3호" },
    { sel: "#section-gab4", heading: "별지 제4호" },
  ];
  document.addEventListener("dblclick", (e) => {
    for (const { sel, heading } of sections) {
      const sec = $(sel);
      if (!sec || sec.hidden) continue;
      const a = e.target.closest("a[href]");
      if (!a || !sec.contains(a)) continue;
      if (a.classList.contains("cite-ref")) return;
      const href = (a.getAttribute("href") || "").trim();
      if (!href) return;
      const abs = href.startsWith("/") ? `${location.origin}${href}` : href;
      try {
        const u = new URL(abs);
        if (u.origin !== location.origin || !u.pathname.startsWith("/serve/")) return;
      } catch {
        return;
      }
      e.preventDefault();
      const rel = relFromServeUrl(abs);
      if (!rel) return;
      openCiteInPreviewPanel(rel, {
        heading,
        lead: DOC_PREVIEW_LEAD_APPENDIX_FILE,
      }).catch((err) => console.error(err));
      return;
    }
  });
}

/** YouTube URL → { videoId, startSeconds } 또는 null */
function parseYouTubeUrl(href) {
  if (!href) return null;
  let videoId = null, startSeconds = 0;
  try {
    const u = new URL(href);
    if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com" || u.hostname === "m.youtube.com") {
      videoId = u.searchParams.get("v");
      const t = u.searchParams.get("t");
      if (t) startSeconds = parseInt(t, 10) || 0;
    } else if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1).split("/")[0];
      const t = u.searchParams.get("t");
      if (t) startSeconds = parseInt(t, 10) || 0;
    }
  } catch { return null; }
  return videoId ? { videoId, startSeconds } : null;
}

/** 오른쪽 패널에 YouTube 썸네일을 표시 — MP4 동영상 그리드와 동일한 구조. */
function openYouTubeInPreviewPanel(videoId, startSeconds, title) {
  const mount = $("#cite-preview-mount");
  const err = $("#cite-preview-err");
  if (!mount || !err) return;
  exitMdAsideEditModeForCitePanel();
  const h = $("#doc-preview-heading");
  const leadEl = $("#doc-preview-lead");
  if (h) h.textContent = title || "YouTube 동영상";
  if (leadEl) leadEl.textContent = DOC_PREVIEW_LEAD_CITE;
  err.hidden = true;
  err.textContent = "";
  teardownGabGridFocusResizeObserver();
  mount.replaceChildren();
  delete mount.dataset.inlineCiteRel;
  showCitePreviewAside();

  const hint = document.createElement("p");
  hint.className = "detail-files-hint";
  hint.textContent =
    "썸네일을 더블클릭하면 전체 화면에서 자동 재생됩니다. " + VIEWER_CLOSE_HINT;
  mount.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "detail-gab3-grid detail-gab3-grid--pdf-stack";
  mount.appendChild(grid);

  const fig = document.createElement("figure");
  fig.className = "detail-gab3-item detail-gab3-item--cite-focus";
  const cap = document.createElement("figcaption");
  const strong = document.createElement("strong");
  strong.textContent = title || "YouTube 동영상";
  cap.appendChild(strong);
  fig.appendChild(cap);

  const vidWrap = document.createElement("div");
  vidWrap.className = "detail-gab3-video-wrap";
  vidWrap.style.cursor = "pointer";
  vidWrap.tabIndex = 0;
  vidWrap.setAttribute("role", "button");
  vidWrap.setAttribute("aria-label", `${title || "YouTube"} — 더블클릭하면 전체 화면에서 재생`);

  const thumb = document.createElement("img");
  thumb.className = "detail-gab3-video detail-gab3-yt-thumb";
  thumb.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  thumb.alt = title || "YouTube 동영상 미리보기";

  const playOverlay = document.createElement("div");
  playOverlay.className = "detail-gab3-video-play-overlay";
  playOverlay.innerHTML =
    '<svg viewBox="0 0 68 48" width="68" height="48">' +
    '<path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55' +
    'C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41' +
    ' 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19' +
    'C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="rgba(255,0,0,0.85)"/>' +
    '<path d="M45 24 27 14v20" fill="white"/></svg>';

  vidWrap.append(thumb, playOverlay);

  const openFull = () => {
    const embedUrl =
      `https://www.youtube.com/embed/${videoId}?autoplay=1` +
      `&start=${startSeconds || 0}&rel=0`;
    showModal(title || "YouTube 동영상", "youtube", embedUrl);
  };
  vidWrap.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openFull();
  });
  vidWrap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFull(); }
  });

  fig.appendChild(vidWrap);
  grid.appendChild(fig);

  mount.dataset.ytVideoId = videoId;
  mount.dataset.ytStart = String(startSeconds || 0);
}

/** YouTube 외부 링크: 단일 클릭 차단 + 더블클릭 → 오른쪽 패널 썸네일 */
function bindExternalYouTubeDblClick() {
  const isYtLink = (a) => {
    if (!a) return false;
    const href = (a.getAttribute("href") || "").trim();
    return !!parseYouTubeUrl(href);
  };

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (a && isYtLink(a)) {
      e.preventDefault();
    }
  }, true);

  document.addEventListener("dblclick", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = (a.getAttribute("href") || "").trim();
    const yt = parseYouTubeUrl(href);
    if (!yt) return;
    e.preventDefault();
    e.stopPropagation();
    openYouTubeInPreviewPanel(
      yt.videoId,
      yt.startSeconds,
      a.textContent.trim() || "YouTube 동영상"
    );
  });
}

/**
 * overflow 스크롤 영역에 마우스·펜 드래그 패닝을 붙인다. 터치는 네이티브 스크롤 유지.
 * @param {HTMLElement} scrollEl
 */
function bindScrollPanPointer(scrollEl) {
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartSl = 0;
  let panStartSt = 0;
  function endPan(e) {
    if (!panning) return;
    panning = false;
    scrollEl.classList.remove("is-panning");
    try {
      scrollEl.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }
  scrollEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    panning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartSl = scrollEl.scrollLeft;
    panStartSt = scrollEl.scrollTop;
    scrollEl.classList.add("is-panning");
    scrollEl.setPointerCapture(e.pointerId);
  });
  scrollEl.addEventListener("pointermove", (e) => {
    if (!panning) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    scrollEl.scrollLeft = panStartSl - dx;
    scrollEl.scrollTop = panStartSt - dy;
  });
  scrollEl.addEventListener("pointerup", endPan);
  scrollEl.addEventListener("pointercancel", endPan);
}

/** PDF.js — 로컬 vendor 우선, 없으면 CDN 폴백 */
const PDFJS_LOCAL = "/vendor/pdfjs/pdf.mjs";
const PDFJS_WORKER_LOCAL = "/vendor/pdfjs/pdf.worker.mjs";
const PDFJS_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.mjs";
const PDFJS_WORKER_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.mjs";

/* mountLawPdfThumbnailsInPreview 제거 — 법령정보도 appendGabBundleGrid 통합 렌더링 */

let pdfjsLibCache = null;
async function loadPdfJs() {
  if (!pdfjsLibCache) {
    let pdfjsLib;
    try {
      pdfjsLib = await import(/* @vite-ignore */ PDFJS_LOCAL);
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_LOCAL;
    } catch {
      pdfjsLib = await import(/* @vite-ignore */ PDFJS_CDN);
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    }
    pdfjsLibCache = pdfjsLib;
  }
  return pdfjsLibCache;
}

function pdfJsDocumentParams(pdfUrl) {
  return {
    url: pdfUrl,
    withCredentials: false,
  };
}

/**
 * @param {HTMLElement} container
 * @param {string} pdfUrl
 * @param {{ variant?: "inline" | "modal", toolbarHidden?: boolean, modalTitle?: string, fitWidth?: boolean, thumbFirstPageOnly?: boolean, evidenceRel?: string, maxScale?: number }} [opts]
 *   maxScale: 확대 상한(배율). 생략 시 modal 은 갑제1·2호증 폴더 10(1000%) 그 외 5(500%), inline 은 2.5.
 *   evidenceRel: 저장소 rel(갑호증 매칭). 없으면 pdfUrl에서 `/serve/` 로 복원.
 *   toolbarHidden: 인라인에서만 — 확대/축소 바 숨김, 더블클릭 시 모달(바 표시)로 연다.
 *   fitWidth: 인라인에서 스크롤 영역 너비에 맞춰 첫 페이지 기준으로 축척을 잡아 가로 스크롤을 피함(리사이즈 시 재계산).
 *   thumbFirstPageOnly: 인라인+툴바 숨김일 때 1쪽만 렌더(다쪽 PDF 깜빡임·과부하 방지). 전체는 모달.
 */
async function mountPdfJsViewer(container, pdfUrl, opts = {}) {
  const variant = opts.variant || "inline";
  const toolbarHidden = opts.toolbarHidden === true && variant === "inline";
  const fitWidth = opts.fitWidth === true && variant === "inline";
  const thumbFirstPageOnly =
    opts.thumbFirstPageOnly === true && variant === "inline" && toolbarHidden;
  container.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "muted";
  loading.textContent = "PDF를 불러오는 중입니다.";
  container.appendChild(loading);

  const pdfjsLib = await loadPdfJs();
  const task = pdfjsLib.getDocument(pdfJsDocumentParams(pdfUrl));
  const pdf = await task.promise;
  loading.remove();

  const evidenceRelForDisplay =
    String(opts.evidenceRel || "").trim() || relFromServeUrl(pdfUrl) || "";
  const forceLandscapePdf =
    evidenceRelForDisplay.length > 0 &&
    pdfRelForceLandscapeDisplay(evidenceRelForDisplay);

  /** 묶음·인용 1쪽 썸네일: 첫 쪽이 가로형이거나(forceLandscape) 세로 PDF인데 가로 사진 오버라이드면 박스를 가로에 맞춤. */
  let thumbPage1Ar = 0;
  if (thumbFirstPageOnly && pdf.numPages >= 1) {
    try {
      const p0 = await pdf.getPage(1);
      const v0 = p0.getViewport({ scale: 1 });
      if (v0.height > 0) {
        const naturalLandscape = v0.width >= v0.height * 1.05;
        const portraitPage = v0.width < v0.height * 0.98;
        const useLandscapeThumb =
          naturalLandscape || (forceLandscapePdf && portraitPage);
        if (useLandscapeThumb) {
          thumbPage1Ar = naturalLandscape
            ? v0.width / v0.height
            : v0.height / v0.width;
          if (container.classList && container.classList.contains("detail-gab3-pdf-mount")) {
            container.classList.add("detail-gab3-pdf-mount--landscape");
          }
        }
      }
    } catch {
      /* 무시 */
    }
  }

  const wrap = document.createElement("div");
  wrap.className =
    variant === "modal" ? "pdf-viewer-wrap pdf-viewer-wrap--modal" : "pdf-viewer-wrap pdf-viewer-wrap--inline";
  if (toolbarHidden) {
    wrap.classList.add("pdf-viewer-wrap--toolbar-hidden");
  }
  if (fitWidth) {
    wrap.classList.add("pdf-viewer-wrap--fit-width");
  }

  const toolbar = document.createElement("div");
  toolbar.className = "pdf-viewer-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute(
    "aria-label",
    variant === "modal" ? "PDF 확대·축소·회전" : "PDF 확대·축소"
  );

  const btnMinus = document.createElement("button");
  btnMinus.type = "button";
  btnMinus.className = "pdf-viewer-zoom-btn";
  btnMinus.textContent = "−";
  btnMinus.setAttribute("aria-label", "축소");

  const zoomLabel = document.createElement("span");
  zoomLabel.className = "pdf-viewer-zoom";
  zoomLabel.setAttribute("aria-live", "polite");

  const btnPlus = document.createElement("button");
  btnPlus.type = "button";
  btnPlus.className = "pdf-viewer-zoom-btn";
  btnPlus.textContent = "+";
  btnPlus.setAttribute("aria-label", "확대");

  const scroll = document.createElement("div");
  scroll.className =
    variant === "modal"
      ? "pdf-viewer-scroll pdf-viewer-scroll--pan"
      : "pdf-viewer-scroll";

  let scale = 1;
  const minScale = fitWidth
    ? thumbFirstPageOnly
      ? 0.02
      : 0.12
    : variant === "modal"
      ? 0.05
      : 0.5;
  const relForZoom =
    String(opts.evidenceRel || "").trim() || relFromServeUrl(pdfUrl) || "";
  const maxScale =
    typeof opts.maxScale === "number" && Number.isFinite(opts.maxScale)
      ? opts.maxScale
      : variant === "modal"
        ? maxViewerZoomScaleForRel(relForZoom)
        : 2.5;
  const step = 0.1;
  /** 전체화면(modal)에서만 — PDF.js 뷰포트 회전(0·90·180·270) */
  let pdfPageRotation = 0;

  /** `await` 도중 또 `renderPages`가 호출되면 이전 실행이 뒤늦게 캔버스를 붙여 이중 출력될 수 있음 → 세대로 무효화 */
  let pdfRenderGen = 0;

  async function applyFitWidthScale(expectedGen) {
    if (!fitWidth || pdf.numPages < 1) return;
    /** 스크롤바 유무로 `scroll.clientWidth` 가 흔들리면 ResizeObserver → 재렌더 루프(깜빡임)가 난다. 래퍼 폭 기준. */
    let cw = wrap.clientWidth;
    let ch = wrap.clientHeight;
    if (cw < 32) {
      await new Promise((r) => requestAnimationFrame(r));
      if (expectedGen !== pdfRenderGen) return;
      cw = wrap.clientWidth;
      ch = wrap.clientHeight;
    }
    const page1 = await pdf.getPage(1);
    if (expectedGen !== pdfRenderGen) return;
    const baseVp = page1.getViewport({ scale: 1 });
    if (cw > 0 && baseVp.width > 0) {
      const pad = 6;
      let raw = (cw - pad * 2) / baseVp.width;
      /** 묶음 1쪽 썸네일: CSS 고정 높이 박스 안에 전체가 들어가도록 가로·세로 중 작은 축 기준(이미지 썸네일과 동일 시각 크기). */
      if (thumbFirstPageOnly && baseVp.height > 0) {
        const effCh = ch > 32 ? ch : BUNDLE_THUMB_BOX_HEIGHT_PX;
        const rawH = (effCh - pad * 2) / baseVp.height;
        raw = Math.min(raw, rawH);
      }
      scale = Math.min(1, Math.max(minScale, raw));
      if (thumbFirstPageOnly) {
        scale = Math.max(0.02, Math.round(scale * 1000) / 1000);
      } else {
        scale = Math.round(scale * 100) / 100;
      }
    }
  }

  async function renderPages() {
    const gen = ++pdfRenderGen;
    scroll.replaceChildren();
    if (fitWidth) {
      await applyFitWidthScale(gen);
      if (gen !== pdfRenderGen) return;
    }
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    const lastPage = thumbFirstPageOnly ? 1 : pdf.numPages;
    for (let num = 1; num <= lastPage; num++) {
      const page = await pdf.getPage(num);
      if (gen !== pdfRenderGen) return;
      const viewport = page.getViewport({ scale, rotation: pdfPageRotation });
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-viewer-page";
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (gen !== pdfRenderGen) return;
      scroll.appendChild(canvas);
    }
  }

  btnMinus.addEventListener("click", () => {
    scale = Math.max(minScale, Math.round((scale - step) * 10) / 10);
    renderPages().catch((e) => console.error(e));
  });
  btnPlus.addEventListener("click", () => {
    scale = Math.min(maxScale, Math.round((scale + step) * 10) / 10);
    renderPages().catch((e) => console.error(e));
  });

  toolbar.append(btnMinus, zoomLabel, btnPlus);
  if (variant === "modal") {
    const btnRotL = document.createElement("button");
    btnRotL.type = "button";
    btnRotL.className =
      "pdf-viewer-zoom-btn pdf-viewer-rotate-btn pdf-viewer-rotate-btn--first";
    btnRotL.textContent = "↶";
    btnRotL.setAttribute("aria-label", "왼쪽으로 90도 회전");
    const btnRotR = document.createElement("button");
    btnRotR.type = "button";
    btnRotR.className = "pdf-viewer-zoom-btn pdf-viewer-rotate-btn";
    btnRotR.textContent = "↷";
    btnRotR.setAttribute("aria-label", "오른쪽으로 90도 회전");
    const refitModalPdf = async () => {
      await new Promise((r) => requestAnimationFrame(r));
      const cw = scroll.clientWidth;
      const ch = scroll.clientHeight;
      if (cw >= 16 && ch >= 16 && pdf.numPages >= 1) {
        const page1 = await pdf.getPage(1);
        const vp1 = page1.getViewport({ scale: 1, rotation: pdfPageRotation });
        const ow = vp1.width;
        const oh = vp1.height;
        const swapOrient =
          forceLandscapePdf && ow > 0 && oh > 0 && ow < oh * 0.98;
        const dispW = swapOrient ? oh : ow;
        const dispH = swapOrient ? ow : oh;
        const k = Math.min(cw / vp1.width, ch / vp1.height, 1);
        scale = Math.max(minScale, Math.min(maxScale, k));
        setViewerModalOrientationFromAspect(dispW, dispH);
        const vm = viewerModal();
        if (vm) {
          if (vm.getAttribute("data-viewer-orientation") === "landscape") {
            vm.setAttribute("data-viewer-content", "pdf");
            tryViewerLandscapeLockForWideImage(dispW, dispH);
          } else {
            vm.removeAttribute("data-viewer-content");
          }
        }
      }
      await renderPages();
    };
    btnRotL.addEventListener("click", () => {
      pdfPageRotation = (pdfPageRotation - 90 + 360) % 360;
      refitModalPdf().catch((e) => console.error(e));
    });
    btnRotR.addEventListener("click", () => {
      pdfPageRotation = (pdfPageRotation + 90) % 360;
      refitModalPdf().catch((e) => console.error(e));
    });
    toolbar.append(btnRotL, btnRotR);
  }
  if (variant === "modal") {
    const hint = document.createElement("p");
    hint.className = "pdf-viewer-modal-hint";
    hint.textContent =
      "확대·축소: 상단 버튼. 회전: ↶ ↷. 이동: 드래그(패닝) 또는 스크롤. " +
      VIEWER_CLOSE_HINT;
    wrap.append(toolbar, hint, scroll);
    bindScrollPanPointer(scroll);
    scroll.addEventListener("dblclick", (e) => {
      if (e.target.closest(".pdf-viewer-toolbar")) return;
      e.preventDefault();
      closeViewerModal();
    });
  } else if (toolbarHidden) {
    wrap.append(scroll);
    const modalTitle =
      (opts.modalTitle && String(opts.modalTitle).trim()) ||
      pdfUrl.split("/").pop() ||
      "PDF";
    wrap.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      e.stopPropagation();
      showModal(modalTitle, "pdf", pdfUrl);
    });
  } else {
    wrap.append(toolbar, scroll);
  }

  async function syncLandscapeThumbFrameSize() {
    if (!(thumbFirstPageOnly && thumbPage1Ar > 0)) return;
    wrap.classList.add("pdf-viewer-wrap--thumb-landscape");
    await new Promise((r) => requestAnimationFrame(r));
    let cw = wrap.clientWidth;
    if (cw < 48) {
      await new Promise((r) => requestAnimationFrame(r));
      cw = wrap.clientWidth;
    }
    const pad = 8;
    let h = Math.round((cw - pad * 2) / thumbPage1Ar);
    h = Math.min(h, BUNDLE_THUMB_BOX_HEIGHT_PX);
    h = Math.max(h, 112);
    wrap.style.height = `${h}px`;
    wrap.style.minHeight = `${h}px`;
    wrap.style.maxHeight = `${h}px`;
  }

  container.appendChild(wrap);
  if (thumbPage1Ar > 0) {
    await syncLandscapeThumbFrameSize();
  }
  if (variant === "modal" && pdf.numPages >= 1) {
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    const cw = scroll.clientWidth;
    const ch = scroll.clientHeight;
    if (cw >= 16 && ch >= 16) {
      const page1 = await pdf.getPage(1);
      const vp1 = page1.getViewport({ scale: 1, rotation: pdfPageRotation });
      const ow = vp1.width;
      const oh = vp1.height;
      const swapOrient =
        forceLandscapePdf && ow > 0 && oh > 0 && ow < oh * 0.98;
      const dispW = swapOrient ? oh : ow;
      const dispH = swapOrient ? ow : oh;
      const k = Math.min(cw / vp1.width, ch / vp1.height, 1);
      scale = Math.max(minScale, Math.min(maxScale, k));
      setViewerModalOrientationFromAspect(dispW, dispH);
      const vm = viewerModal();
      if (vm) {
        if (vm.getAttribute("data-viewer-orientation") === "landscape") {
          vm.setAttribute("data-viewer-content", "pdf");
          tryViewerLandscapeLockForWideImage(dispW, dispH);
        } else {
          vm.removeAttribute("data-viewer-content");
        }
      }
    }
  }
  await renderPages();

  if (thumbFirstPageOnly && pdf.numPages > 1) {
    const note = document.createElement("p");
    note.className = "cite-preview-inline-hint pdf-thumb-page-hint";
    note.textContent = `총 ${pdf.numPages}쪽 문서입니다. 이 패널에는 1쪽만 보입니다. 더블클릭하면 전체 화면에서 봅니다.`;
    container.appendChild(note);
  }
  if (thumbFirstPageOnly) {
    try { pdf.destroy(); } catch { /* ignore */ }
  }

  let resizeFitTimer = 0;
  let lastObservedWrapW = 0;
  let lastObservedWrapH = 0;
  if (fitWidth) {
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      const w = Math.round(cr?.width ?? 0);
      const h = Math.round(cr?.height ?? 0);
      if (
        w > 0 &&
        Math.abs(w - lastObservedWrapW) < 2 &&
        Math.abs(h - lastObservedWrapH) < 2
      ) {
        return;
      }
      lastObservedWrapW = w;
      lastObservedWrapH = h;
      clearTimeout(resizeFitTimer);
      resizeFitTimer = window.setTimeout(() => {
        (async () => {
          if (thumbPage1Ar > 0) {
            await syncLandscapeThumbFrameSize();
          }
          await renderPages();
        })().catch((e) => console.error(e));
      }, 160);
    });
    ro.observe(wrap);
  }
}

/**
 * 전체 화면에서 사진·이미지에 PDF와 동일한 형태의 확대/축소 바를 둡니다.
 * @param {HTMLElement} container — #viewer-body
 * @param {string} imageUrl
 * @param {{ alt?: string, evidenceRel?: string, maxScale?: number }} [opts] maxScale 생략 시 갑제1·2호증 10(1000%) 그 외 5(500%).
 */
async function mountImageZoomViewer(container, imageUrl, opts = {}) {
  const alt = (opts.alt && String(opts.alt)) || "";
  container.replaceChildren();

  const wrap = document.createElement("div");
  wrap.className = "image-viewer-wrap";

  const toolbar = document.createElement("div");
  toolbar.className = "pdf-viewer-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "이미지 확대·축소·회전");

  const btnMinus = document.createElement("button");
  btnMinus.type = "button";
  btnMinus.className = "pdf-viewer-zoom-btn";
  btnMinus.textContent = "−";
  btnMinus.setAttribute("aria-label", "축소");

  const zoomLabel = document.createElement("span");
  zoomLabel.className = "pdf-viewer-zoom";
  zoomLabel.setAttribute("aria-live", "polite");

  const btnPlus = document.createElement("button");
  btnPlus.type = "button";
  btnPlus.className = "pdf-viewer-zoom-btn";
  btnPlus.textContent = "+";
  btnPlus.setAttribute("aria-label", "확대");

  const hint = document.createElement("p");
  hint.className = "pdf-viewer-modal-hint";
  hint.textContent =
    "확대·축소: 상단 버튼. 회전: ↶ ↷. 이동: 드래그(패닝) 또는 스크롤. " +
    VIEWER_CLOSE_HINT;

  const scroll = document.createElement("div");
  scroll.className = "pdf-viewer-scroll image-viewer-scroll image-viewer-scroll--pan";

  const img = document.createElement("img");
  img.className = "viewer-img image-viewer-img";
  img.alt = alt;
  img.src = imageUrl;
  img.loading = "lazy";
  img.draggable = false;

  let scale = 1;
  const minScale = 0.25;
  const relForZoom =
    String(opts.evidenceRel || "").trim() || relFromServeUrl(imageUrl) || "";
  const maxScale =
    typeof opts.maxScale === "number" && Number.isFinite(opts.maxScale)
      ? opts.maxScale
      : maxViewerZoomScaleForRel(relForZoom);
  const step = 0.1;
  let imageRotationDeg = 0;

  function effectiveImageSize() {
    const r = ((imageRotationDeg % 360) + 360) % 360;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (nw < 1 || nh < 1) return { w: 0, h: 0 };
    if (r === 90 || r === 270) return { w: nh, h: nw };
    return { w: nw, h: nh };
  }

  function applyZoom() {
    img.style.transform = `rotate(${imageRotationDeg}deg)`;
    img.style.transformOrigin = "center center";
    img.style.width = `${scale * 100}%`;
    img.style.maxWidth = "none";
    img.style.height = "auto";
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }

  /** 뷰포트 안에 이미지 전체가 들어가도록 초기 배율(가로·세로 중 작은 쪽 기준). */
  function applyFitToView() {
    const w0 = scroll.clientWidth;
    const h0 = scroll.clientHeight;
    const { w: ew, h: eh } = effectiveImageSize();
    if (w0 < 8 || h0 < 8 || ew < 1 || eh < 1) return;
    const k = Math.min(w0 / ew, h0 / eh, 1);
    scale = Math.max(minScale, (ew * k) / w0);
    applyZoom();
  }

  btnMinus.addEventListener("click", () => {
    scale = Math.max(minScale, Math.round((scale - step) * 10) / 10);
    applyZoom();
  });
  btnPlus.addEventListener("click", () => {
    scale = Math.min(maxScale, Math.round((scale + step) * 10) / 10);
    applyZoom();
  });

  const btnImgRotL = document.createElement("button");
  btnImgRotL.type = "button";
  btnImgRotL.className =
    "pdf-viewer-zoom-btn pdf-viewer-rotate-btn pdf-viewer-rotate-btn--first";
  btnImgRotL.textContent = "↶";
  btnImgRotL.setAttribute("aria-label", "왼쪽으로 90도 회전");
  const btnImgRotR = document.createElement("button");
  btnImgRotR.type = "button";
  btnImgRotR.className = "pdf-viewer-zoom-btn pdf-viewer-rotate-btn";
  btnImgRotR.textContent = "↷";
  btnImgRotR.setAttribute("aria-label", "오른쪽으로 90도 회전");
  btnImgRotL.addEventListener("click", () => {
    imageRotationDeg = (imageRotationDeg - 90 + 360) % 360;
    const { w: ew, h: eh } = effectiveImageSize();
    setViewerModalOrientationFromAspect(ew, eh);
    applyFitToView();
  });
  btnImgRotR.addEventListener("click", () => {
    imageRotationDeg = (imageRotationDeg + 90) % 360;
    const { w: ew, h: eh } = effectiveImageSize();
    setViewerModalOrientationFromAspect(ew, eh);
    applyFitToView();
  });

  toolbar.append(btnMinus, zoomLabel, btnPlus, btnImgRotL, btnImgRotR);
  scroll.appendChild(img);

  bindScrollPanPointer(scroll);

  scroll.addEventListener("dblclick", (e) => {
    if (e.target.closest(".pdf-viewer-toolbar")) return;
    e.preventDefault();
    closeViewerModal();
  });
  wrap.append(toolbar, hint, scroll);
  container.appendChild(wrap);

  try {
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image-load"));
      if (img.complete && img.naturalWidth > 0) resolve();
    });
    setViewerModalOrientationFromAspect(img.naturalWidth, img.naturalHeight);
    tryViewerLandscapeLockForWideImage(img.naturalWidth, img.naturalHeight);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    applyFitToView();
    await new Promise((r) => requestAnimationFrame(r));
    applyFitToView();
  } catch {
    container.replaceChildren();
    const err = document.createElement("p");
    err.className = "viewer-error";
    err.textContent =
      "파일을 화면에 표시하지 못하였습니다. 제출된 증거 매체를 참고하여 주시기 바랍니다.";
    container.appendChild(err);
  }
}

const viewerModal = () => $("#viewer-modal");

/**
 * 전체화면 뷰어: 콘텐츠 가로·세로 비율에 맞춰 CSS·초기 맞춤에 사용.
 * @param {number} w
 * @param {number} h
 */
function setViewerModalOrientationFromAspect(w, h) {
  const el = viewerModal();
  if (!el || !(w > 0) || !(h > 0)) return;
  const rw = w / h;
  if (rw >= 1.05) el.setAttribute("data-viewer-orientation", "landscape");
  else if (rw <= 0.95) el.setAttribute("data-viewer-orientation", "portrait");
  else el.setAttribute("data-viewer-orientation", "square");
}

/** 가로가 더 긴 사진: 전체화면에서 가로 보기(레이아웃 + 가능 시 화면 가로 고정). */
function tryViewerLandscapeLockForWideImage(nw, nh) {
  if (!(nw > 0) || !(nh > 0) || nw < nh * 1.02) return;
  try {
    const o = screen.orientation;
    if (!o || typeof o.lock !== "function") return;
    o.lock("landscape")
      .then(() => {
        viewerOrientationUnlock = () => {
          try {
            o.unlock();
          } catch {
            /* 일부 브라우저 미지원 */
          }
          viewerOrientationUnlock = null;
        };
      })
      .catch(() => {});
  } catch {
    /* 보안 컨텍스트·권한 없음 등 */
  }
}

/** 본문 인용 등에서 `rel`로 전체 창(모달) 뷰어를 연다. */
async function openRefDocFullscreen(rel) {
  if (!rel) return;
  const r0 = normalizeRefBundleRel(rel);
  if (String(r0).startsWith("__REF_GAB_BUNDLE__:")) return;
  const modalTitle = modalDocTitleFromRel(r0);
  const url = serveUrl(r0);
  const lower = r0.toLowerCase();
  if (lower.endsWith(".pdf")) {
    showModal(modalTitle, "pdf", url);
    return;
  }
  if (/\.(jpe?g|png|gif|webp)$/i.test(r0)) {
    showModal(modalTitle, "image", url);
    return;
  }
  if (lower.endsWith(".md")) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const text = await res.text();
      const parse = await getMarked();
      const div = document.createElement("div");
      div.className = "md-content";
      div.innerHTML = injectIncheonIngaGosiLinks(parse(text));
      showModal(modalTitle, "md", div.innerHTML);
    } catch (e) {
      console.error(e);
    }
    return;
  }
  if (lower.endsWith(".txt")) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const text = await res.text();
      showModal(modalTitle, "txt", text);
    } catch (e) {
      console.error(e);
    }
  }
}

function openViewerModal() {
  document.querySelectorAll("video").forEach((v) => {
    try { v.pause(); } catch {}
  });
  viewerBackgroundScroll = {
    x: window.scrollX,
    y: window.scrollY,
  };
  const el = viewerModal();
  el.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    const btn = $("#viewer-close");
    if (btn) {
      try {
        btn.focus({ preventScroll: true });
      } catch {
        btn.focus();
      }
    }
  });
}

function exitDocumentFullscreen() {
  try {
    const active =
      document.fullscreenElement || document.webkitFullscreenElement;
    if (!active) return;
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch {
    /* 일부 환경 미지원 */
  }
}

function requestElementFullscreen(el) {
  if (!el) return;
  const req =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.webkitRequestFullScreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen;
  if (req) req.call(el).catch(() => {});
}

function closeViewerModal() {
  if (viewerOrientationUnlock) {
    viewerOrientationUnlock();
  }
  exitDocumentFullscreen();
  clearViewerModalWorkPath();
  const el = viewerModal();
  el.hidden = true;
  el.removeAttribute("data-viewer-orientation");
  el.removeAttribute("data-viewer-content");
  $("#viewer-body").replaceChildren();
  document.body.classList.remove("modal-open");
  if (viewerBackgroundScroll !== null) {
    const { x, y } = viewerBackgroundScroll;
    viewerBackgroundScroll = null;
    requestAnimationFrame(() => {
      window.scrollTo(x, y);
    });
  }
}

function showModal(title, kind, payload) {
  $("#viewer-title").textContent = title;
  clearViewerModalWorkPath();
  const body = $("#viewer-body");
  body.replaceChildren();
  viewerModal().removeAttribute("data-viewer-content");
  if (kind === "md") {
    const div = document.createElement("div");
    div.className = "md-content";
    div.innerHTML = payload;
    body.appendChild(div);
  } else if (kind === "pdf") {
    setViewerModalWorkPathFromUrl(payload);
    openViewerModal();
    mountPdfJsViewer(body, payload, {
      variant: "modal",
      evidenceRel: relFromServeUrl(payload),
    }).catch((e) => {
      console.error(e);
      body.replaceChildren();
      const err = document.createElement("p");
      err.className = "viewer-error";
      err.textContent =
        "PDF를 이 화면에서 열 수 없습니다. 네트워크·파일 형식을 확인하시거나 제출 매체를 이용해 주시기 바랍니다.";
      body.appendChild(err);
    });
    return;
  } else if (kind === "image") {
    setViewerModalWorkPathFromUrl(payload);
    openViewerModal();
    viewerModal().setAttribute("data-viewer-content", "image");
    mountImageZoomViewer(body, payload, {
      alt: title,
      evidenceRel: relFromServeUrl(payload),
    });
    return;
  } else if (kind === "txt") {
    openViewerModal();
    const pre = document.createElement("pre");
    pre.className = "viewer-txt-plain";
    pre.textContent = payload;
    body.appendChild(pre);
    return;
  } else if (kind === "video") {
    setViewerModalWorkPathFromUrl(payload);
    openViewerModal();
    viewerModal().setAttribute("data-viewer-content", "video");
    const wrap = document.createElement("div");
    wrap.className = "viewer-video-modal-wrap";
    const vToolbar = document.createElement("div");
    vToolbar.className = "pdf-viewer-toolbar";
    vToolbar.setAttribute("role", "toolbar");
    vToolbar.setAttribute("aria-label", "동영상 회전");
    let videoRotationDeg = 0;
    const btnVRotL = document.createElement("button");
    btnVRotL.type = "button";
    btnVRotL.className =
      "pdf-viewer-zoom-btn pdf-viewer-rotate-btn pdf-viewer-rotate-btn--first";
    btnVRotL.textContent = "↶";
    btnVRotL.setAttribute("aria-label", "왼쪽으로 90도 회전");
    const btnVRotR = document.createElement("button");
    btnVRotR.type = "button";
    btnVRotR.className = "pdf-viewer-zoom-btn pdf-viewer-rotate-btn";
    btnVRotR.textContent = "↷";
    btnVRotR.setAttribute("aria-label", "오른쪽으로 90도 회전");
    const vScroll = document.createElement("div");
    vScroll.className = "viewer-video-modal-scroll";
    const video = document.createElement("video");
    video.className = "viewer-video";
    video.controls = true;
    video.src = payload;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    video.autoplay = true;
    video.playsInline = true;
    const applyVideoRotation = () => {
      video.style.transform = `rotate(${videoRotationDeg}deg)`;
      video.style.transformOrigin = "center center";
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw > 0 && vh > 0) {
        const r = ((videoRotationDeg % 360) + 360) % 360;
        const ew = r === 90 || r === 270 ? vh : vw;
        const eh = r === 90 || r === 270 ? vw : vh;
        setViewerModalOrientationFromAspect(ew, eh);
      }
    };
    btnVRotL.addEventListener("click", () => {
      videoRotationDeg = (videoRotationDeg - 90 + 360) % 360;
      applyVideoRotation();
    });
    btnVRotR.addEventListener("click", () => {
      videoRotationDeg = (videoRotationDeg + 90) % 360;
      applyVideoRotation();
    });
    const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
    let speedIdx = SPEEDS.indexOf(1);
    const speedLabel = document.createElement("span");
    speedLabel.className = "viewer-video-speed-label";
    speedLabel.textContent = "1×";
    const btnSpeedDown = document.createElement("button");
    btnSpeedDown.type = "button";
    btnSpeedDown.className = "pdf-viewer-zoom-btn viewer-video-speed-btn";
    btnSpeedDown.textContent = "느리게";
    btnSpeedDown.setAttribute("aria-label", "재생 속도 느리게");
    const btnSpeedUp = document.createElement("button");
    btnSpeedUp.type = "button";
    btnSpeedUp.className = "pdf-viewer-zoom-btn viewer-video-speed-btn";
    btnSpeedUp.textContent = "빠르게";
    btnSpeedUp.setAttribute("aria-label", "재생 속도 빠르게");
    const updateSpeed = () => {
      video.playbackRate = SPEEDS[speedIdx];
      speedLabel.textContent = `${SPEEDS[speedIdx]}×`;
    };
    btnSpeedDown.addEventListener("click", () => {
      if (speedIdx > 0) { speedIdx--; updateSpeed(); }
    });
    btnSpeedUp.addEventListener("click", () => {
      if (speedIdx < SPEEDS.length - 1) { speedIdx++; updateSpeed(); }
    });

    const speedGroup = document.createElement("span");
    speedGroup.className = "viewer-video-speed-group";
    speedGroup.append(btnSpeedDown, speedLabel, btnSpeedUp);

    vToolbar.append(btnVRotL, btnVRotR, speedGroup);
    vScroll.appendChild(video);
    wrap.append(vToolbar, vScroll);
    body.appendChild(wrap);
    const tryPlay = () => {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };
    video.addEventListener("loadedmetadata", () => {
      setViewerModalOrientationFromAspect(video.videoWidth, video.videoHeight);
      if (video.videoWidth >= video.videoHeight * 1.02) {
        tryViewerLandscapeLockForWideImage(
          video.videoWidth,
          video.videoHeight
        );
      }
      tryPlay();
    });
    video.addEventListener("canplay", tryPlay, { once: true });
    video.addEventListener("loadeddata", tryPlay);
    video.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeViewerModal();
    });
    return;
  } else if (kind === "youtube") {
    openViewerModal();
    viewerModal().setAttribute("data-viewer-content", "video");
    const outerWrap = document.createElement("div");
    outerWrap.className = "viewer-video-modal-wrap";

    const ytToolbar = document.createElement("div");
    ytToolbar.className = "pdf-viewer-toolbar";
    ytToolbar.setAttribute("role", "toolbar");
    ytToolbar.setAttribute("aria-label", "YouTube 동영상 조작");

    let ytRotDeg = 0;
    const btnYtRotL = document.createElement("button");
    btnYtRotL.type = "button";
    btnYtRotL.className = "pdf-viewer-zoom-btn pdf-viewer-rotate-btn pdf-viewer-rotate-btn--first";
    btnYtRotL.textContent = "↶";
    btnYtRotL.setAttribute("aria-label", "왼쪽으로 90도 회전");
    const btnYtRotR = document.createElement("button");
    btnYtRotR.type = "button";
    btnYtRotR.className = "pdf-viewer-zoom-btn pdf-viewer-rotate-btn";
    btnYtRotR.textContent = "↷";
    btnYtRotR.setAttribute("aria-label", "오른쪽으로 90도 회전");

    const ytScroll = document.createElement("div");
    ytScroll.className = "viewer-video-modal-scroll";
    const iframe = document.createElement("iframe");
    iframe.className = "viewer-yt-iframe";
    iframe.id = "yt-modal-iframe";
    const embedUrl = payload + (payload.includes("?") ? "&" : "?") + "enablejsapi=1";
    iframe.src = embedUrl;
    iframe.setAttribute("allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    iframe.setAttribute("allowfullscreen", "");

    const applyYtRotation = () => {
      iframe.style.transform = `rotate(${ytRotDeg}deg)`;
      iframe.style.transformOrigin = "center center";
    };
    btnYtRotL.addEventListener("click", () => {
      ytRotDeg = (ytRotDeg - 90 + 360) % 360;
      applyYtRotation();
    });
    btnYtRotR.addEventListener("click", () => {
      ytRotDeg = (ytRotDeg + 90) % 360;
      applyYtRotation();
    });

    const YT_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
    let ytSpeedIdx = YT_SPEEDS.indexOf(1);
    const ytSpeedLabel = document.createElement("span");
    ytSpeedLabel.className = "viewer-video-speed-label";
    ytSpeedLabel.textContent = "1×";
    const btnYtSpeedDown = document.createElement("button");
    btnYtSpeedDown.type = "button";
    btnYtSpeedDown.className = "pdf-viewer-zoom-btn viewer-video-speed-btn";
    btnYtSpeedDown.textContent = "느리게";
    btnYtSpeedDown.setAttribute("aria-label", "재생 속도 느리게");
    const btnYtSpeedUp = document.createElement("button");
    btnYtSpeedUp.type = "button";
    btnYtSpeedUp.className = "pdf-viewer-zoom-btn viewer-video-speed-btn";
    btnYtSpeedUp.textContent = "빠르게";
    btnYtSpeedUp.setAttribute("aria-label", "재생 속도 빠르게");
    const sendYtSpeed = () => {
      const rate = YT_SPEEDS[ytSpeedIdx];
      ytSpeedLabel.textContent = `${rate}×`;
      try {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: "command", func: "setPlaybackRate", args: [rate] }),
          "*"
        );
      } catch {}
    };
    btnYtSpeedDown.addEventListener("click", () => {
      if (ytSpeedIdx > 0) { ytSpeedIdx--; sendYtSpeed(); }
    });
    btnYtSpeedUp.addEventListener("click", () => {
      if (ytSpeedIdx < YT_SPEEDS.length - 1) { ytSpeedIdx++; sendYtSpeed(); }
    });
    const ytSpeedGroup = document.createElement("span");
    ytSpeedGroup.className = "viewer-video-speed-group";
    ytSpeedGroup.append(btnYtSpeedDown, ytSpeedLabel, btnYtSpeedUp);

    ytToolbar.append(btnYtRotL, btnYtRotR, ytSpeedGroup);
    ytScroll.appendChild(iframe);
    outerWrap.append(ytToolbar, ytScroll);
    body.appendChild(outerWrap);
    return;
  } else if (kind === "text") {
    const p = document.createElement("p");
    p.className = "viewer-error";
    p.textContent = payload;
    body.appendChild(p);
  }
  openViewerModal();
}

/** 통합 호증명이 분할 갑 제○-○호증 범위를 가리킬 때(상세 영역 그리드 상단 안내) */
function refBundleScopeParagraph(row) {
  const gab = stripMarkdownForDisplay(row.gab || "해당 호증");
  const labels = row.gabFileRange?.labels || [];
  if (labels.length >= 2) {
    const first = labels[0];
    const last = labels[labels.length - 1];
    return `${gab}은(는) ${first}부터 ${last}에 이르는 분할 편철입니다.`;
  }
  return `${gab}(분할 편철)을 한 묶음으로 두었습니다.`;
}

function bundleThumbInstruction() {
  return "썸네일을 더블클릭하면 해당 파일을 크게 봅니다. " + VIEWER_CLOSE_HINT;
}

/**
 * 분할 묶음 썸네일 그리드.
 * @param {{ skipScopeParagraph?: boolean }} [opts] — skipScopeParagraph: 이미 위에 범위 문구가 있을 때 그리드 안 중복 생략.
 * @returns {Promise<void>} PDF 슬롯은 `mountPdfJsViewer` 완료(첫 렌더까지) 시 resolve. 포커스 스크롤은 이후 레이아웃 안정화 뒤에 호출할 것.
 */
function appendGabBundleGrid(container, row, opts = {}) {
  const skipScope = opts.skipScopeParagraph === true;
  if (!container || !row?.gabFileRange?.rels?.length) return Promise.resolve();
  const labels = Array.isArray(row.gabFileRange.labels) ? row.gabFileRange.labels : [];
  if (labels.length >= 2 && !skipScope) {
    const scopeEl = document.createElement("p");
    scopeEl.className = "detail-files-hint ref-bundle-scope";
    scopeEl.textContent = refBundleScopeParagraph(row);
    container.appendChild(scopeEl);
  }
  const rels = row.gabFileRange.rels;
  const hasPdf = rels.some((r) => String(r).toLowerCase().endsWith(".pdf"));
  const hasImageOnlyThumb = rels.some((r) =>
    /\.(jpe?g|png|gif|webp)$/i.test(String(r))
  );
  const hint = document.createElement("p");
  hint.className = "detail-files-hint";
  if (hasPdf) {
    const onlyPdf = rels.every((r) => String(r).toLowerCase().endsWith(".pdf"));
    let base = onlyPdf
      ? "PDF는 호증 번호 순서대로 각 파일의 1쪽만 이 영역에 썸네일로 표시됩니다. 모든 쪽·확대·축소는 각 블록을 더블클릭한 전체 화면에서 하십시오."
      : hasImageOnlyThumb
        ? "PDF는 순서대로 1쪽 썸네일만 표시됩니다(더블클릭 시 전체·모든 쪽·확대/축소). 사진 썸네일은 더블클릭하면 전체 창으로 열 수 있습니다."
        : "PDF는 순서대로 1쪽 썸네일만 표시됩니다. 더블클릭하면 전체 화면에서 모든 쪽을 볼 수 있고 확대·축소할 수 있습니다.";
    if (rels.some((r) => isGab81QrPngRel(r))) {
      base +=
        " 갑 제8-1호증(항공 QR) 썸네일 더블클릭 시 항공 관련 동영상(전체 창)을 재생합니다. 동일 묶음에 MP4가 있으면 아래에서 재생 단추로 볼 수 있으며, 더블클릭하면 전체 창에서 재생됩니다.";
    }
    hint.textContent = `${base} ${VIEWER_CLOSE_HINT}`;
  } else {
    hint.textContent = bundleThumbInstruction();
  }
  container.appendChild(hint);
  const grid = document.createElement("div");
  grid.className = hasPdf
    ? "detail-gab3-grid detail-gab3-grid--pdf-stack"
    : "detail-gab3-grid";
  /** 그리드를 먼저 붙여 두어 PDF·이미지 썸네일이 고정 높이 박스 크기를 읽을 수 있게 함 */
  container.appendChild(grid);
  const pdfMountPromises = [];
  rels.forEach((rel, idx) => {
    const lower = String(rel).toLowerCase();
    const fig = document.createElement("figure");
    fig.className = lower.endsWith(".pdf")
      ? "detail-gab3-item detail-gab3-item--pdf"
      : "detail-gab3-item";
    const cap = document.createElement("figcaption");
    const base = rel.split("/").pop() || rel;
    const gabLabel = stripMarkdownForDisplay(
      labels[idx] || `항목 ${idx + 1}`
    );
    const strong = document.createElement("strong");
    strong.textContent = gabLabel;
    cap.appendChild(strong);
    cap.appendChild(document.createElement("br"));
    const fn = document.createElement("span");
    fn.className = "detail-gab3-fname";
    fn.textContent = base;
    cap.appendChild(fn);
    appendWorkPathCaptionLine(cap, rel);
    fig.appendChild(cap);

    if (lower.endsWith(".pdf")) {
      const pdfMount = document.createElement("div");
      pdfMount.className = "detail-gab3-pdf-mount";
      fig.appendChild(pdfMount);
      grid.appendChild(fig);
      const thumbRel = rel.replace(/\.pdf$/i, ".thumb.jpg");
      const thumbUrl = serveUrl(thumbRel);
      const pdfUrl = serveUrl(rel);
      const modalTitle = `${gabLabel} — ${base}`;
      const doLoad = () => {
        const img = new Image();
        img.className = "pdf-viewer-page pdf-thumb-prerendered";
        img.alt = gabLabel;
        img.src = thumbUrl;
        return new Promise((resolve) => {
          img.onload = () => {
            pdfMount.replaceChildren(img);
            resolve();
          };
          img.onerror = () => {
            enqueuePdfThumb(() =>
              mountPdfJsViewer(pdfMount, pdfUrl, {
                variant: "inline",
                toolbarHidden: true,
                fitWidth: true,
                thumbFirstPageOnly: true,
                modalTitle,
                evidenceRel: rel,
              }).catch((e) => {
                console.error(e);
                pdfMount.textContent =
                  "PDF를 불러오지 못하였습니다. 제출 매체를 참고하여 주시기 바랍니다.";
                pdfMount.classList.add("detail-gab3-pdf-mount--err");
              })
            ).then(resolve, resolve);
          };
        });
      };
      pdfMount._lazyThumbLoader = doLoad;
      _thumbObserver.observe(pdfMount);
      pdfMount.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showModal(modalTitle, "pdf", pdfUrl);
      });
      return;
    }
    if (lower.endsWith(".mp4")) {
      const vidUrl = serveUrl(rel);
      const vidWrap = document.createElement("div");
      vidWrap.className = "detail-gab3-video-wrap";
      const vid = document.createElement("video");
      vid.className = "detail-gab3-video";
      vid.src = vidUrl + "#t=1";
      vid.preload = "metadata";
      vid.muted = true;
      vid.autoplay = false;
      vid.setAttribute("playsinline", "");
      vid.title = `${gabLabel} — 더블클릭하면 전체 화면에서 재생`;
      const playOverlay = document.createElement("div");
      playOverlay.className = "detail-gab3-video-play-overlay";
      playOverlay.innerHTML =
        '<svg viewBox="0 0 68 48" width="68" height="48">' +
        '<path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55' +
        'C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41' +
        ' 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19' +
        'C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="rgba(255,0,0,0.85)"/>' +
        '<path d="M45 24 27 14v20" fill="white"/></svg>';
      vidWrap.append(vid, playOverlay);
      vidWrap.style.cursor = "pointer";
      vidWrap.tabIndex = 0;
      vidWrap.setAttribute("role", "button");
      vidWrap.setAttribute("aria-label", `${gabLabel} — 더블클릭하면 전체 화면에서 재생`);
      const modalTitle = `${gabLabel} — ${base}`;
      const openModal = () => showModal(modalTitle, "video", vidUrl);
      vidWrap.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal();
      });
      vidWrap.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(); }
      });
      fig.appendChild(vidWrap);
      grid.appendChild(fig);
      return;
    }
    if (/\.(jpe?g|png|gif|webp)$/i.test(rel)) {
      if (isGab81QrPngRel(rel)) {
        const img = document.createElement("img");
        img.className = "detail-gab3-img";
        img.src = serveUrl(rel);
        img.alt = `${gabLabel} (${base})`;
        img.loading = "lazy";
        img.decoding = "async";
        img.style.cursor = "pointer";
        img.tabIndex = 0;
        img.setAttribute("role", "button");
        img.setAttribute(
          "aria-label",
          `${gabLabel} — 더블클릭: 항공 관련 동영상(전체 창). ${VIEWER_CLOSE_HINT}`
        );
        img.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          openGab81RelatedVideoModal();
        });
        img.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openGab81RelatedVideoModal();
          }
        });
        fig.appendChild(img);
        grid.appendChild(fig);
        return;
      }
      const img = document.createElement("img");
      img.className = "detail-gab3-img";
      img.src = serveUrl(rel);
      img.alt = `${gabLabel} (${base})`;
      img.loading = "lazy";
      img.decoding = "async";
      img.style.cursor = "pointer";
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      const openFull = () => openEvidenceFile(rel);
      img.setAttribute(
        "aria-label",
        `${gabLabel} — 더블클릭: 전체 창. ${VIEWER_CLOSE_HINT}`
      );
      img.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        openFull();
      });
      img.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFull();
        }
      });
      fig.appendChild(img);
      grid.appendChild(fig);
      return;
    }
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent =
      "이 형식은 이 영역에서 미리 보지 않습니다. 파일명을 참고하여 주시기 바랍니다.";
    fig.appendChild(p);
    grid.appendChild(fig);
  });
  return Promise.all(pdfMountPromises).then(() => {});
}

/** 인용 토큰 `__GAB_BUNDLE__:`를 내부 묶음 키 `__REF_GAB_BUNDLE__:`와 동일 취급 */
function normalizeRefBundleRel(rel) {
  if (String(rel).startsWith("__GAB_BUNDLE__:")) {
    return `__REF_GAB_BUNDLE__:${String(rel).slice("__GAB_BUNDLE__:".length)}`;
  }
  return rel;
}

function normRelPosix(rel) {
  return String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
}

/**
 * 가상 인용 `__GAB_FOLDER__:주번호` 또는 `__GAB_FOLDER__:주번호@가지키`(예: 2@2-3).
 * @returns {{ major: string, focusKey: string|null }} focusKey null 이면 주번호만 인용 → 그리드에서 `주-1` 우선 포커스.
 */
function parseGabFolderVirtualRel(rel) {
  const raw = String(rel || "");
  if (!raw.startsWith("__GAB_FOLDER__:")) return null;
  const rest = raw.slice("__GAB_FOLDER__:".length).trim();
  const at = rest.indexOf("@");
  if (at < 0) {
    return { major: rest, focusKey: null };
  }
  return {
    major: rest.slice(0, at).trim(),
    focusKey: rest.slice(at + 1).trim(),
  };
}

/**
 * `el`에서 위로 올라가며 실제 세로 스크롤이 가능한(scrollHeight > clientHeight)
 * 가장 가까운 조상을 찾는다. `.cite-preview-mount`가 `overflow-x:hidden`으로
 * 인해 암묵적 `overflow-y:auto` 스크롤 컨테이너가 되는 문제를 해결하기 위해
 * CSS 셀렉터에 의존하지 않고 런타임에 탐색한다.
 */
function findScrollableAncestor(el) {
  let p = el.parentElement;
  while (p && p !== document.documentElement) {
    if (p.scrollHeight > p.clientHeight + 1) {
      const ov = getComputedStyle(p).overflowY;
      if (ov === "auto" || ov === "scroll") return p;
    }
    p = p.parentElement;
  }
  return null;
}

/**
 * 오른쪽 패널 내부의 실제 스크롤 컨테이너만 움직여 `el`이 세로 중앙에 오도록 한다.
 * `scrollIntoView`는 페이지 전체(왼쪽 패널 포함)를 움직이므로 사용하지 않는다.
 */
function scrollCitePreviewToCenterElement(el) {
  if (!el) return;

  const apply = () => {
    const scrollEl = findScrollableAncestor(el);
    if (!scrollEl) return;
    const elRect = el.getBoundingClientRect();
    const seRect = scrollEl.getBoundingClientRect();
    const elTopInContent = elRect.top - seRect.top + scrollEl.scrollTop;
    const elH = elRect.height;
    const viewH = scrollEl.clientHeight;
    const scrollH = scrollEl.scrollHeight;
    const target = elTopInContent + elH / 2 - viewH / 2;
    const maxScroll = Math.max(0, scrollH - viewH);
    const next = Math.min(maxScroll, Math.max(0, target));
    console.log("[gabFocus]", {
      scrollContainer: scrollEl.className || scrollEl.id,
      elTopInContent: Math.round(elTopInContent),
      elH: Math.round(elH),
      viewH: Math.round(viewH),
      scrollH,
      maxScroll,
      target: Math.round(target),
      next: Math.round(next),
      prevScrollTop: Math.round(scrollEl.scrollTop),
    });
    scrollEl.scrollTop = next;
  };

  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

let gabGridFocusResizeObserver = null;
let gabGridFocusDebounceTimer = 0;
let gabGridFocusDisconnectTimer = 0;

function teardownGabGridFocusResizeObserver() {
  if (gabGridFocusResizeObserver) {
    gabGridFocusResizeObserver.disconnect();
    gabGridFocusResizeObserver = null;
  }
  if (gabGridFocusDebounceTimer) {
    clearTimeout(gabGridFocusDebounceTimer);
    gabGridFocusDebounceTimer = 0;
  }
  if (gabGridFocusDisconnectTimer) {
    clearTimeout(gabGridFocusDisconnectTimer);
    gabGridFocusDisconnectTimer = 0;
  }
}

/** `#cite-preview-mount` 안 그리드에서 포커스 타일에 클래스를 주고 스크롤을 맞춤 */
function applyGabFolderGridFocusScroll(mount, rels, focusKey) {
  const fk = String(focusKey || "").trim();
  if (!mount || !rels?.length || !fk) return;
  const grid = mount.querySelector(".detail-gab3-grid");
  if (!grid) return;
  const figures = grid.querySelectorAll(":scope > .detail-gab3-item");
  let idx = -1;
  for (let i = 0; i < rels.length; i += 1) {
    const leaf = normRelPosix(rels[i]).split("/").pop() || "";
    const k = extractGabKeyFromFilename(leaf);
    if (k === fk) {
      idx = i;
      break;
    }
  }
  if (idx < 0) idx = 0;
  const fig = figures[idx];
  if (!fig) return;
  mount
    .querySelectorAll(".detail-gab3-item--cite-focus")
    .forEach((x) => x.classList.remove("detail-gab3-item--cite-focus"));
  fig.classList.add("detail-gab3-item--cite-focus");
  scrollCitePreviewToCenterElement(fig, "auto");
}

/**
 * PDF·썸네일 비동기 렌더 후 높이가 바뀌므로 지연 재시도 + `#cite-preview-mount` ResizeObserver 로
 * 포커스된 가지번호까지 스크롤이 따라가게 함.
 */
function scheduleGabFolderGridFocus(mount, rels, focusKey) {
  teardownGabGridFocusResizeObserver();
  const run = () => applyGabFolderGridFocusScroll(mount, rels, focusKey);
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
  setTimeout(run, 160);
  setTimeout(run, 350);
  setTimeout(run, 420);
  setTimeout(run, 600);
  setTimeout(run, 800);
  setTimeout(run, 1400);
  setTimeout(run, 2600);

  gabGridFocusResizeObserver = new ResizeObserver(() => {
    clearTimeout(gabGridFocusDebounceTimer);
    gabGridFocusDebounceTimer = window.setTimeout(() => {
      gabGridFocusDebounceTimer = 0;
      requestAnimationFrame(run);
    }, 90);
  });
  gabGridFocusResizeObserver.observe(mount);
  gabGridFocusDisconnectTimer = window.setTimeout(() => {
    teardownGabGridFocusResizeObserver();
  }, 9000);
}

function gabMajorFolderName(major) {
  return `갑제${major}호증`;
}

function relUnderGabMajorFolder(rel, major) {
  const folder = gabMajorFolderName(major);
  const n = normRelPosix(rel);
  const sub = `${folder}/`;
  return (
    n.includes(`${GAB_EVIDENCE_PRIMARY_MARKER}${sub}`) ||
    n.includes(`${GAB_EVIDENCE_USB_MARKER}${sub}`)
  );
}

/**
 * 전체화면(더블클릭) 확대 상한: 갑 제1·2호증 트리는 1000%, 그 외 PDF·이미지는 500%. 동영상은 확대 UI 없음.
 */
function maxViewerZoomScaleForRel(rel) {
  const r = String(rel || "").trim();
  if (!r) return 5;
  if (relUnderGabMajorFolder(r, "1") || relUnderGabMajorFolder(r, "2")) return 10;
  return 5;
}

/** 파일명에 `갑제N-M호증`이 있으면 묶음 행으로 끌어올리지 않고 단일 파일로 패널 표시 */
function isGabBranchLeafRel(rel) {
  const leaf = normRelPosix(rel).split("/").pop() || "";
  return /갑제\d+-\d+호증/i.test(leaf);
}

function gabCiteLabelFromFileRel(rel) {
  const leaf = normRelPosix(rel).split("/").pop() || "";
  const key = extractGabKeyFromFilename(leaf);
  if (key) return `갑 제${key}호증`;
  return leaf;
}

function compareGabFileKeysForSort(a, b) {
  const pa = String(a).split("-").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split("-").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/**
 * `갑제{major}호증` 폴더 아래 저장소 파일 전부(gabFiles 기준), 호증 키 순 정렬.
 * @param {string} majorStr — `"1"` … `"13"`
 */
function listGabFolderItemsForMajor(majorStr) {
  const m = String(majorStr || "").trim();
  if (!/^\d+$/.test(m)) return [];
  const gab = metaGlobal?.gabFiles || [];
  const out = [];
  for (const it of gab) {
    const r = it?.rel;
    if (!r || relHasCheomboPrefix(r)) continue;
    if (!relUnderGabMajorFolder(r, m)) continue;
    out.push({ label: it.label, rel: r });
  }
  out.sort((x, y) => {
    const lx = normRelPosix(x.rel).split("/").pop() || "";
    const ly = normRelPosix(y.rel).split("/").pop() || "";
    const kx = extractGabKeyFromFilename(lx) || lx;
    const ky = extractGabKeyFromFilename(ly) || ly;
    return compareGabFileKeysForSort(kx, ky);
  });
  return out;
}

function relLooksLikeGabMainPath(rel) {
  const n = normRelPosix(rel);
  if (n.includes("/첨부/")) return false;
  if (n.includes(GAB_EVIDENCE_PRIMARY_MARKER) && /갑제\d+호증\//.test(n)) return true;
  if (n.includes(GAB_EVIDENCE_USB_MARKER) && /갑제\d+호증\//.test(n)) return true;
  return false;
}

function findGabBundleRowForFileRel(rel) {
  if (!rel || !allRows?.length) return null;
  const norm = normRelPosix(rel);
  if (!relLooksLikeGabMainPath(rel)) return null;
  for (const row of allRows) {
    if (row.gabBundlePrimaryKey == null || !row.gabFileRange?.rels?.length) {
      continue;
    }
    const rels = row.gabFileRange.rels.map((r) => normRelPosix(r));
    if (rels.includes(norm)) return row;
  }
  return null;
}

function showCitePreviewAside(_opts = {}) {
  /* 독립 스크롤 레이아웃: 양쪽 패널이 항상 뷰포트 안에 있으므로
     페이지 수준 scrollIntoView 불필요. */
}

/** 오른쪽 미리보기 영역을 세로로 최대한 펼침(모달이 아닌 패널 기준). */
function setCitePreviewPanelExpanded(on) {
  document.body.classList.toggle("cite-preview-expanded", Boolean(on));
  if (on) showCitePreviewAside();
}

function clearDocPreviewPanel() {
  teardownGabGridFocusResizeObserver();
  const mount = $("#cite-preview-mount");
  const err = $("#cite-preview-err");
  setCitePreviewPanelExpanded(false);
  if (mount) {
    mount.replaceChildren();
    delete mount.dataset.inlineCiteRel;
  }
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  const h = $("#doc-preview-heading");
  const lead = $("#doc-preview-lead");
  if (h) h.innerHTML = DOC_PREVIEW_HEADING_IDLE_HTML;
  if (lead) lead.innerHTML = DOC_PREVIEW_LEAD_IDLE_HTML;
}

/**
 * 청구서·신청서·별첨 인용 등: 오른쪽 패널에 PDF·이미지·동영상·md·txt·묶음 호증을 표시합니다.
 * @param {{ heading?: string, lead?: string }} [opts]
 */
async function openCiteInPreviewPanel(rel, opts = {}) {
  if (!rel) return;
  exitMdAsideEditModeForCitePanel();
  const mount = $("#cite-preview-mount");
  const err = $("#cite-preview-err");
  if (!mount || !err) {
    await openCiteTarget(rel);
    return;
  }
  const h = $("#doc-preview-heading");
  const leadEl = $("#doc-preview-lead");
  if (h) h.textContent = opts.heading ?? "청구·신청 인용";
  if (leadEl) leadEl.textContent = opts.lead ?? DOC_PREVIEW_LEAD_CITE;
  err.hidden = true;
  err.textContent = "";
  teardownGabGridFocusResizeObserver();
  mount.replaceChildren();
  delete mount.dataset.inlineCiteRel;
  showCitePreviewAside();

  let r = normalizeRefBundleRel(rel);

  if (String(r).startsWith("__GAB_FOLDER__:")) {
    const parsed = parseGabFolderVirtualRel(r);
    const major = parsed?.major ?? "";
    if (!major) return;
    if (h) h.textContent = `갑 제${major}호증`;
    if (leadEl) leadEl.textContent = opts.lead ?? DOC_PREVIEW_LEAD_GAB_LINK;
    const items = listGabFolderItemsForMajor(major);
    if (!items.length) {
      err.textContent = `갑 제${major}호증 폴더(갑제${major}호증)에 표시할 파일이 없습니다.`;
      err.hidden = false;
      return;
    }
    const row = {
      gab: `갑 제${major}호증`,
      gabFileRange: {
        labels: items.map((it) => gabCiteLabelFromFileRel(it.rel)),
        rels: items.map((it) => it.rel),
      },
    };
    const rels = row.gabFileRange.rels;
    const focusKey =
      parsed?.focusKey && parsed.focusKey !== ""
        ? parsed.focusKey
        : `${major}-1`;
    await appendGabBundleGrid(mount, row, { skipScopeParagraph: true });
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    scheduleGabFolderGridFocus(mount, rels, focusKey);
    return;
  }

  if (String(r).startsWith("__REF_GAB_BUNDLE__:")) {
    const pk = String(r).slice("__REF_GAB_BUNDLE__:".length);
    const row = (allRows || []).find((x) => String(x.gabBundlePrimaryKey) === pk);
    if (row?.gabFileRange?.rels?.length) {
      appendGabBundleGrid(mount, row, {});
      return;
    }
    err.textContent = "묶음 호증 정보를 찾을 수 없습니다.";
    err.hidden = false;
    return;
  }

  const rowForSplit =
    !isGabBranchLeafRel(r) ? findGabBundleRowForFileRel(r) : null;
  if (rowForSplit?.gabFileRange?.rels?.length) {
    appendGabBundleGrid(mount, rowForSplit, { skipScopeParagraph: true });
    return;
  }

  const url = serveUrl(r);
  const lower = String(r).toLowerCase();

  if (lower.endsWith(".md") || lower.endsWith(".txt")) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        err.textContent = `파일을 불러오지 못하였습니다. (${res.status})`;
        err.hidden = false;
        return;
      }
      const text = await res.text();
      if (lower.endsWith(".md")) {
        const parse = await getMarked();
        const div = document.createElement("div");
        div.className = "md-content cite-preview-md";
        div.innerHTML = injectIncheonIngaGosiLinks(parse(text));
        mount.appendChild(div);
        upgradeMarkdownAnchorsToCiteRefs(div, { nested: true });
        decorateCiteLinks(div, { nested: true });
        decorateExternalRefLinks(div);
        unwrapMarkdownDecorations(div);
        mount.dataset.inlineCiteRel = r;
      } else {
        const pre = document.createElement("pre");
        pre.className = "cite-preview-txt-pre";
        pre.textContent = text;
        mount.appendChild(pre);
        mount.dataset.inlineCiteRel = r;
      }
    } catch (e) {
      console.error(e);
      err.textContent = "네트워크 오류로 파일을 열 수 없습니다.";
      err.hidden = false;
    }
    return;
  }

  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!res.ok) {
      err.textContent = `파일을 확인할 수 없습니다. (${res.status})`;
      err.hidden = false;
      return;
    }
  } catch (e) {
    console.error(e);
    err.textContent = "네트워크 오류로 파일을 확인할 수 없습니다.";
    err.hidden = false;
    return;
  }

  if (lower.endsWith(".pdf")) {
    try {
      const pdfTitle = r.split("/").pop() || r;
      const gabLabel = pdfTitle.replace(/\.[^.]+$/, "");
      const singleRow = {
        gab: gabLabel,
        gabFileRange: { labels: [gabLabel], rels: [r] },
      };
      await appendGabBundleGrid(mount, singleRow, { skipScopeParagraph: true });
      mount.dataset.inlineCiteRel = r;
      const firstFig = mount.querySelector(".detail-gab3-item");
      if (firstFig) {
        firstFig.classList.add("detail-gab3-item--cite-focus");
        scheduleGabFolderGridFocus(mount, [r], extractGabKeyFromFilename(pdfTitle) || "1-1");
      }
    } catch (e) {
      console.error(e);
      err.textContent = "PDF를 이 패널에서 열 수 없습니다.";
      err.hidden = false;
    }
    return;
  }

  if (/\.(mp4|webm|mov|avi)$/i.test(r)) {
    const vidTitle = r.split("/").pop() || r;
    const vidLabel = vidTitle.replace(/\.[^.]+$/, "");
    const vidRow = {
      gab: vidLabel,
      gabFileRange: { labels: [vidLabel], rels: [r] },
    };
    appendGabBundleGrid(mount, vidRow, { skipScopeParagraph: true });
    mount.dataset.inlineCiteRel = r;
    const vidFig = mount.querySelector(".detail-gab3-item");
    if (vidFig) vidFig.classList.add("detail-gab3-item--cite-focus");
    return;
  }

  if (/\.(jpe?g|png|gif|webp)$/i.test(r)) {
    const imgTitle = r.split("/").pop() || r;
    const imgLabel = imgTitle.replace(/\.[^.]+$/, "");
    const imgRow = {
      gab: imgLabel,
      gabFileRange: { labels: [imgLabel], rels: [r] },
    };
    appendGabBundleGrid(mount, imgRow, { skipScopeParagraph: true });
    mount.dataset.inlineCiteRel = r;
    const imgFig = mount.querySelector(".detail-gab3-item");
    if (imgFig) imgFig.classList.add("detail-gab3-item--cite-focus");
    return;
  }

  err.textContent = "이 형식은 이 패널에서 바로 열 수 없습니다.";
  err.hidden = false;
}

function bindCitePreviewMountDblClick() {
  const mount = $("#cite-preview-mount");
  if (!mount || mount.dataset.boundPreviewDbl === "1") return;
  mount.dataset.boundPreviewDbl = "1";
  mount.addEventListener("dblclick", async (e) => {
    if (e.target.closest("a, button, .pdf-viewer-toolbar")) return;
    if (e.target.closest(".pdf-viewer-wrap--inline")) return;
    const vGrid = e.target.closest("video.detail-gab3-video");
    if (vGrid && mount.contains(vGrid)) {
      e.preventDefault();
      e.stopPropagation();
      const rel = relFromServeUrl(vGrid.currentSrc || vGrid.src);
      if (rel) {
        showModal(modalDocTitleFromRel(rel), "video", serveUrl(rel));
      }
      return;
    }
    const vIn = e.target.closest("video.cite-preview-video-inline");
    if (vIn && mount.contains(vIn)) {
      e.preventDefault();
      e.stopPropagation();
      const rel = mount.dataset.inlineCiteRel;
      if (rel) showModal(modalDocTitleFromRel(rel), "video", serveUrl(rel));
      return;
    }
    if (mount.dataset.ytVideoId) {
      e.preventDefault();
      const vid = mount.dataset.ytVideoId;
      const start = parseInt(mount.dataset.ytStart || "0", 10);
      const embedUrl =
        `https://www.youtube.com/embed/${vid}?autoplay=1&start=${start}&rel=0`;
      showModal(
        $("#doc-preview-heading")?.textContent || "YouTube 동영상",
        "youtube",
        embedUrl
      );
      return;
    }
    const rel = mount.dataset.inlineCiteRel;
    if (rel) {
      e.preventDefault();
      await openRefDocFullscreen(rel);
    }
  });
}

/**
 * 증거 JSON detail의 백틱 파일명은 디스크에 아직 없어도 인용 맵·정렬 목록에 포함합니다(예: 갑 제5-3호증 PDF).
 */
function augmentGabFilesFromEvidence(meta, evidence) {
  const files = [...(meta.gabFiles || [])];
  const seen = new Set(files.map((f) => f.rel));
  const reGab = /`([^`\n]*갑제\d[^`]+\.(?:pdf|jpe?g|png|gif|webp|mp4))`/gi;
  for (const row of evidence || []) {
    const d = row.detail || "";
    reGab.lastIndex = 0;
    let m;
    while ((m = reGab.exec(d)) !== null) {
      const name = m[1].trim();
      const rel = findGabRelByBasename(files, name) || evidenceFileToRel(name);
      if (seen.has(rel)) continue;
      seen.add(rel);
      files.push({ label: name, rel });
    }
  }
  meta.gabFiles = sortGabItemsByFolderThenFile(files);
}

const _KO_SORT = { numeric: true, sensitivity: "base" };

/**
 * `…/증거/갑호증/`(및 구 `…/최종/갑호증/`) 기준 **폴더 경로(상위→하위)** → **파일명** 순 가나다 정렬.
 * 묶음(`__REF_GAB_BUNDLE__:`)은 표시 라벨로 폴더 키에 넣어 같은 규칙으로 섞인다.
 */
function gabRelSortKey(rel) {
  const r = String(rel || "");
  const n = normRelPosix(r);
  let rest;
  if (n.startsWith(GAB_EVIDENCE_PRIMARY_MARKER))
    rest = n.slice(GAB_EVIDENCE_PRIMARY_MARKER.length);
  else if (n.startsWith(GAB_EVIDENCE_USB_MARKER))
    rest = n.slice(GAB_EVIDENCE_USB_MARKER.length);
  else {
    return { folder: "\uFFFF", file: r };
  }
  const parts = rest.split("/").filter(Boolean);
  if (parts.length === 0) return { folder: "", file: "" };
  const last = parts[parts.length - 1];
  const isFile = /\.[a-z0-9]{2,}$/i.test(last);
  if (isFile) {
    return {
      folder: parts.slice(0, -1).join("/") || "",
      file: last,
    };
  }
  return { folder: parts.join("/"), file: "" };
}

function gabItemSortKey(item) {
  const rel = String(item?.rel || "");
  if (rel.startsWith("__REF_GAB_BUNDLE__:") || rel.startsWith("__GAB_BUNDLE__:")) {
    const d = refOptionDisplayLabel(item);
    return { folder: d, file: "" };
  }
  return gabRelSortKey(rel);
}

function sortGabItemsByFolderThenFile(items) {
  if (!items || !items.length) return items || [];
  return [...items].sort((a, b) => {
    const ka = gabItemSortKey(a);
    const kb = gabItemSortKey(b);
    const c1 = ka.folder.localeCompare(kb.folder, "ko", _KO_SORT);
    if (c1 !== 0) return c1;
    return ka.file.localeCompare(kb.file, "ko", _KO_SORT);
  });
}

function openEvidenceFile(fileRef) {
  const n = String(fileRef || "")
    .replace(/\\/g, "/")
    .trim()
    .normalize("NFC");
  const rel = isCompleteEvidenceMediaRel(n)
    ? n
    : resolveGabLeafToRel(n) || evidenceFileToRel(n);
  const url = serveUrl(rel);
  const base = rel.split("/").pop() || rel;
  const lower = base.toLowerCase();
  const modalTitle = modalDocTitleFromRel(rel);
  if (lower.endsWith(".pdf")) {
    showModal(modalTitle, "pdf", url);
    return;
  }
  if (/\.(jpe?g|png|gif|webp)$/i.test(base)) {
    showModal(modalTitle, "image", url);
    return;
  }
  if (/\.(mp4|webm|mov|avi)$/i.test(base)) {
    showModal(modalTitle, "video", url);
    return;
  }
  showModal(modalTitle, "text", "이 창에서는 사진·PDF·동영상 파일만 볼 수 있습니다.");
}

/** 로컬 `start.js` 서버를 내리고 창을 닫거나 빈 페이지로 넘깁니다. */
function bindScreenExit() {
  const btn = $("#btn-screen-exit");
  if (!btn) return;
  btn.addEventListener("click", () => {
    void (async () => {
      const origin = location.origin || "";
      const shutdownUrl = `${origin}/api/shutdown`;
      /** 탭이 바로 닫히면 fetch 가 끊길 수 있어 sendBeacon 으로 전송(GET·POST 둘 다 서버가 처리) */
      try {
        if (typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon(shutdownUrl);
          navigator.sendBeacon(
            shutdownUrl,
            new Blob(["{}"], { type: "application/json" })
          );
        }
      } catch {
        /* ignore */
      }
      try {
        await fetch(shutdownUrl, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } catch {
        /* 정적만 열었거나 연결이 끊긴 뒤 등 */
      }
      /** 응답이 소켓으로 완전히 나간 뒤 창 닫기(서버 `finish` 누락 완화) */
      await new Promise((r) => setTimeout(r, 120));
      window.close();
      setTimeout(() => {
        try {
          window.location.replace("about:blank");
        } catch {
          /* ignore */
        }
      }, 250);
    })();
  });
}

function bindViewerChrome() {
  $("#viewer-close").addEventListener("click", closeViewerModal);
  const backdrop = viewerModal().querySelector(".viewer-backdrop");
  if (backdrop) {
    backdrop.addEventListener("dblclick", (e) => {
      e.preventDefault();
      closeViewerModal();
    });
  }
  const viewerBody = $("#viewer-body");
  if (viewerBody) {
    viewerBody.addEventListener("dblclick", (e) => {
      if (viewerModal().hidden) return;
      if (e.target.closest("a[href], button, input, textarea, select")) return;
      if (e.target.closest(".pdf-viewer-wrap--modal, .image-viewer-wrap, video.viewer-video")) return;
      if (e.target.closest(".md-content") || e.target.closest(".viewer-txt-plain")) {
        e.preventDefault();
        closeViewerModal();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!viewerModal().hidden) {
      closeViewerModal();
      return;
    }
    if (document.body.classList.contains("cite-preview-expanded")) {
      setCitePreviewPanelExpanded(false);
    }
  });
}

/**
 * 마크다운·편집용 표기(굵게 **, 백틱, 링크, 취소선, 이미지, 줄머리 #/> 등)를 걷어 내 평문만 남깁니다.
 * 증거 표·상세는 JSON에 마크다운이 섞여 있어, 표시 전에 호출합니다.
 */
/** 분할 묶음 행: JSON detail에 포함된 편철 경로(시작~끝 파일) 블록은 요지 텍스트에서 제거 */
function stripBundleDetailFilingPaths(detail) {
  if (detail == null || detail === "") return "";
  let s = String(detail);
  const iPeon = s.indexOf("\n\n편철 루트에서");
  if (iPeon >= 0) s = s.slice(0, iPeon).trimEnd();
  const iPath = s.search(/\n\n갑호증및법령정보\//);
  if (iPath >= 0) s = s.slice(0, iPath).trimEnd();
  const iUsb = s.search(/\n\nUSB\/갑호증및법령정보\//);
  if (iUsb >= 0) s = s.slice(0, iUsb).trimEnd();
  return s;
}

function stripMarkdownForDisplay(s) {
  if (s == null || s === "") return "";
  /** `**` 앞뒤 공백이 끼인 굵게도 반복 제거 후 남는 `**`는 삭제 */
  const stripBoldRuns = (txt) => {
    let u = txt;
    let prev;
    let guard = 0;
    do {
      prev = u;
      u = u.replace(/\*\*\s*([^*]+?)\s*\*\*/g, "$1");
      guard++;
    } while (u !== prev && guard < 64);
    return u.replace(/\*\*/g, "");
  };
  let t = String(s);
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/~~([^~]+)~~/g, "$1");
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = stripBoldRuns(t);
  t = t.replace(/`([^`]+)`/g, "$1");
  t = stripBoldRuns(t);
  t = t.replace(/\*([^*\n]+)\*/g, "$1");
  t = t.replace(/_([^_\n]+)_/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^>\s?/gm, "");
  t = t
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
  return stripBoldRuns(t).trim();
}

/**
 * 주소 `?ho=`·본문 링크 등으로 호증 행을 열 때 오른쪽 패널에 요지·파일을 채웁니다.
 */
function openEvidenceRowInPreviewPanel(row) {
  if (!row) return;
  exitMdAsideEditModeForCitePanel();
  const mount = $("#cite-preview-mount");
  const err = $("#cite-preview-err");
  if (!mount || !err) return;
  const h = $("#doc-preview-heading");
  const leadEl = $("#doc-preview-lead");
  if (h) h.textContent = "호증";
  if (leadEl) leadEl.textContent = DOC_PREVIEW_LEAD_EVIDENCE;
  err.hidden = true;
  err.textContent = "";
  mount.replaceChildren();
  delete mount.dataset.inlineCiteRel;
  showCitePreviewAside();

  const titleEl = document.createElement("h3");
  titleEl.className = "doc-preview-gab-title";
  titleEl.textContent = `${stripMarkdownForDisplay(row.gab)} (${row.num})`;
  mount.appendChild(titleEl);

  const isGabBundleGrid =
    row.gabFileRange &&
    Array.isArray(row.gabFileRange.rels) &&
    row.gabFileRange.rels.length > 0;
  const detailRaw = isGabBundleGrid
    ? stripBundleDetailFilingPaths(row.detail)
    : row.detail;
  const bodyEl = document.createElement("p");
  bodyEl.className = "doc-preview-gab-body";
  bodyEl.textContent = stripMarkdownForDisplay(detailRaw);
  mount.appendChild(bodyEl);

  const hasRangePaths =
    Boolean(row.gabFileRange && row.gabFileRange.firstRel && row.gabFileRange.lastRel);
  const looseFiles = extractEvidenceFileRefs(row.detail);
  const hasFiles =
    isGabBundleGrid || hasRangePaths || looseFiles.length > 0;
  if (!hasFiles) return;

  const filesWrap = document.createElement("div");
  filesWrap.className = "doc-preview-gab-files";
  mount.appendChild(filesWrap);

  if (isGabBundleGrid) {
    appendGabBundleGrid(filesWrap, row, {});
  } else if (hasRangePaths) {
    const hint = document.createElement("p");
    hint.className = "detail-files-hint";
    hint.textContent =
      "아래는 범위의 시작·끝 파일입니다. 작업 폴더만 드라이브 포함 절대 경로이고, 파일 꼬리는 저장소 상대입니다. 단추는 범위의 첫 파일만 이 화면에서 엽니다.";
    filesWrap.appendChild(hint);
    const pre = document.createElement("pre");
    pre.className = "detail-range-paths";
    pre.textContent = `${displayRepoWorkPath(row.gabFileRange.firstRel)}\n부터\n${displayRepoWorkPath(row.gabFileRange.lastRel)}\n까지`;
    filesWrap.appendChild(pre);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = "범위 — 첫 파일 열기";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEvidenceFile(row.gabFileRange.firstRel);
    });
    filesWrap.appendChild(btn);
  } else {
    const hint = document.createElement("p");
    hint.className = "detail-files-hint";
    hint.textContent =
      "아래 버튼은 편철 설명에 적힌 파일을 이 화면에서 열 때 사용합니다. 열리지 않을 때는 제출된 증거 매체를 참고하여 주시기 바랍니다.";
    filesWrap.appendChild(hint);
    looseFiles.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = `파일 보기 (${f})`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEvidenceFile(f);
      });
      filesWrap.appendChild(btn);
    });
  }
}

function showSection(id) {
  ["appeal", "injunction", "gab1", "gab2", "gab3", "gab4", "manual"].forEach((name) => {
    const el = $(`#section-${name}`);
    if (!el) return;
    const on = name === id;
    el.hidden = !on;
    el.classList.toggle("is-visible", on);
  });
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.section === id);
  });
  if (id === "manual") {
    resetMdAsideEditModeUi();
    clearDocPreviewPanel();
  }
  if (portalMdWorkspaceEditable) {
    updateMdAsideSaveButtonState();
  }
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.section;
      resetMdAsideEditModeUi();
      clearDocPreviewPanel();
      showSection(id);
      setLocationHash(id, null);
      void (async () => {
        await loadTabIfNeeded(id);
        requestAnimationFrame(() => clampWindowScrollToDocument());
      })();
    });
  });
}

/** 우측 aside 패딩(스크롤 박스 밖)에서 휠 시 `.cite-preview-scroll` 만 움직이고 문서 스크롤로 넘기지 않음 */
function bindCiteAsideWheelRouting() {
  const aside = document.getElementById("cite-preview-aside");
  if (!aside || aside.dataset.wheelRouteBound === "1") return;
  aside.dataset.wheelRouteBound = "1";
  aside.addEventListener(
    "wheel",
    (e) => {
      const scroll = aside.querySelector(".cite-preview-scroll");
      if (!scroll) return;
      if (scroll.contains(e.target)) return;
      scroll.scrollTop += e.deltaY;
      e.preventDefault();
    },
    { passive: false }
  );
}

async function main() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  resetHashToAppealOnReload();
  bindTabs();
  bindMdAsideToolbar();
  bindMdEditorTools();
  bindScreenExit();
  bindViewerChrome();
  bindCiteAsideWheelRouting();
  window.addEventListener("hashchange", () => {
    applyHashFromLocation();
  });
  const res = await fetch("data/portal-data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("목록 자료를 읽어 오지 못하였습니다.");
  const data = await res.json();
  try {
    const ovr = await fetch("data/gab-pdf-display-overrides.json", {
      cache: "no-store",
    });
    if (ovr.ok) {
      gabPdfDisplayOverrides = await ovr.json();
    }
  } catch {
    /* 오버라이드 없어도 동작 */
  }
  const srcDisp = await loadSiteDisplayFromSource();
  if (srcDisp) {
    if (srcDisp.siteTitle) data.meta.siteTitle = String(srcDisp.siteTitle);
    if (srcDisp.siteSubtitle != null) {
      data.meta.siteSubtitle = String(srcDisp.siteSubtitle);
    }
    if (srcDisp.updated) data.meta.updated = String(srcDisp.updated);
  }
  const m = data.meta;
  metaGlobal = m;
  try {
    const pr = await fetch("/api/portal-profile", { cache: "no-store" });
    if (pr.ok) {
      const pj = await pr.json();
      portalMdWorkspaceEditable = Boolean(pj.mdWorkspaceEditable);
      portalRepoRoot =
        typeof pj.repoRoot === "string" && pj.repoRoot.trim()
          ? pj.repoRoot.trim()
          : "";
      portalWorkLayout =
        pj.workLayout && typeof pj.workLayout === "object"
          ? pj.workLayout
          : null;
    }
  } catch {
    portalMdWorkspaceEditable = false;
    portalRepoRoot = "";
    portalWorkLayout = null;
  }
  if (portalMdWorkspaceEditable) {
    try {
      const ts = await fetch("/api/tab-sources", { cache: "no-store" });
      if (ts.ok) {
        const tj = await ts.json();
        if (tj?.tabSources && metaGlobal && typeof tj.tabSources === "object") {
          const patch = {};
          for (const [k, v] of Object.entries(tj.tabSources)) {
            if (v != null && String(v).trim() !== "") patch[k] = v;
          }
          /** `portal-data.json`의 tabSources가 우선 — 원문 폴더(예: `제출원문(원본)`)를 JSON으로 고정할 때 `/api/tab-sources`가 덮어쓰지 않음 */
          metaGlobal.tabSources = { ...patch, ...(metaGlobal.tabSources || {}) };
        }
      }
    } catch {
      /* 유지: portal-data.json 의 tabSources */
    }
  }
  augmentGabFilesFromEvidence(metaGlobal, data.evidence || []);
  citeMaps = buildCiteMaps(metaGlobal, data.evidence || []);
  {
    let earlyTab = parseHash().tab;
    if (earlyTab && LEGACY_HASH_TAB[earlyTab]) earlyTab = LEGACY_HASH_TAB[earlyTab];
    const preloadAppeal =
      !earlyTab ||
      !VALID_SECTIONS.includes(earlyTab) ||
      earlyTab === "appeal";
    if (preloadAppeal) await loadTabIfNeeded("appeal");
  }
  applyTabSourcePathHints();
  applyMdAsideToolbarVisibility();

  bindCiteClickHandlers();
  bindBijeServeLinkDblClick();
  bindExternalYouTubeDblClick();
  bindCitePreviewMountDblClick();

  $("#site-title").textContent = m.siteTitle || "농원근린공원 행정심판청구";
  $("#site-subtitle").textContent = m.siteSubtitle || "";
  const hm = $("#header-meta");
  if (m.updated) {
    hm.hidden = false;
    hm.textContent = `자료 기준일 ${m.updated}`;
  }
  if (m.siteTitle && m.updated) {
    document.title = `${m.siteTitle} · ${m.updated}`;
  }
  $("#meta-updated").textContent = m.updated;
  $("#footer-line").textContent = m.footerLine || "";

  allRows = data.evidence || [];

  /** 해시 없음·무효·레거시는 `applyHashFromLocation` 첫 분기에서 `#appeal` + 청구서 로드 */
  await applyHashFromLocation();
}

main().catch((e) => {
  console.error(e);
  const sub = $("#site-subtitle");
  if (sub) {
    sub.textContent =
      "화면을 준비하는 중 오류가 발생하였습니다. 잠시 후 다시 시도하시거나 청구인 측에 문의하여 주시기 바랍니다.";
  }
});
