/**
 * 농원근린공원 행정심판청구 — 탭별 서면 표시·미주
 *
 * 열람: 저장소 루트 `갑호증및법령정보/`·`USB/갑호증및법령정보/` 실제 파일을 `/serve/`로 연다(USB·로컬 미러는 start.js 가 교차 시도).
 * 판례 링크는 `precedentFiles` → `buildCiteMaps` 의 `caseById` 로 매칭; **npm start / 저장소 루트** 없이 정적만 열면 /serve/가 깨질 수 있다.
 */

const $ = (sel, root = document) => root.querySelector(sel);

/** 미리보기 패널 초기 제목(HTML) */
const DOC_PREVIEW_HEADING_IDLE_HTML =
  '<strong class="cite-preview-heading-main">갑호증 및 법령정보 참고</strong>';

/** 오른쪽 패널 안내 문구 HTML — `clearDocPreviewPanel` 시 `#doc-preview-lead` 에 복원(index.html 과 동일 유지) */
const DOC_PREVIEW_LEAD_IDLE_HTML = `[ 사용방법 ]

1. 행정심판청구서, 집행정지신청서 및 별지 제1호~제4호 본문에서 호증 표기(링크)를 더블클릭하면 오른쪽에 갑호증 또는 법령정보 요지가 열립니다.

2. 화면에 출력된 PDF·이미지·동영상 등을 다시 더블클릭하면 <strong>전체 화면</strong>으로 볼 수 있고, 더블클릭 또는 Esc로 닫을 수 있습니다.

3. 다중 PDF는 이 패널에서 <strong>1쪽 썸네일</strong>만 보이며, 전체는 <strong>전체 화면</strong>에서 봅니다. 동영상은 이 패널에서 자동 재생하지 않고, <strong>전체 화면</strong>에서 재생됩니다.`;

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

const MARKED_CDN = "https://cdn.jsdelivr.net/npm/marked@14.1.4/+esm";

let metaGlobal = null;

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

const VALID_SECTIONS = ["appeal", "injunction", "gab1", "gab2", "gab3", "gab4"];

/** 예전 주소 해시(#overview 등) → 현재 탭 id */
const LEGACY_HASH_TAB = {
  overview: "appeal",
  evidence: "appeal",
  gab: "gab1",
  appendix: "gab3",
};

/** 주소 표시줄 #해시로 탭·호증 행 공유(서류 대조·협의 시 활용) */
function parseHash() {
  const raw = (location.hash || "").replace(/^#/, "");
  if (!raw) return { tab: null, hoNum: null };
  const qIdx = raw.indexOf("?");
  const pathPart = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
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

/** 첫 화면: 헤더·탭·본문 시작이 한데 보이도록 문서 최상단으로 스크롤 */
function scrollFirstScreenToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

async function applyHashFromLocation() {
  let { tab, hoNum } = parseHash();
  if (tab && LEGACY_HASH_TAB[tab]) {
    tab = LEGACY_HASH_TAB[tab];
    setLocationHash(tab, hoNum);
  }
  if (!tab || !VALID_SECTIONS.includes(tab)) return;
  const prevTab = document.querySelector(".tab.is-active")?.dataset?.section;
  if (prevTab && prevTab !== tab) {
    clearDocPreviewPanel();
  }
  showSection(tab);
  await loadTabIfNeeded(tab);
  if (
    tab === "appeal" ||
    tab === "injunction" ||
    tab === "gab1" ||
    tab === "gab2" ||
    tab === "gab3" ||
    tab === "gab4"
  ) {
    requestAnimationFrame(() => scrollFirstScreenToTop());
  }
  if (hoNum != null && hoNum !== "" && allRows.length) {
    const row = allRows.find((r) => String(r.num) === String(hoNum));
    if (row) openEvidenceRowInPreviewPanel(row);
  }
}

async function getMarked() {
  if (!markedParse) {
    const { marked } = await import(/* @vite-ignore */ MARKED_CDN);
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

async function renderMdSplit(prefix, mdText) {
  const parse = await getMarked();
  const { main, notes } = splitMainAndNotes(mdText);
  const mainEl = $(`#${prefix}-md-main`);
  const wrapEl = $(`#${prefix}-md-notes-wrap`);
  const notesEl = $(`#${prefix}-md-notes`);
  mainEl.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "md-content";
  wrap.innerHTML = injectIncheonIngaGosiLinks(mdChunkToTabHtml(prefix, parse, main));
  mainEl.appendChild(wrap);
  if (notes.trim()) {
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
  } else {
    wrapEl.hidden = true;
    notesEl.replaceChildren();
  }
  const mainWrap = mainEl.querySelector(".md-content");
  if (mainWrap) {
    if (prefix === "gab3") mergeGab3MergeAboveMarkerRows(mainWrap);
    if (prefix === "gab3") applyGab3SlashLineBreaks(mainWrap);
    decorateMdContentRoot(mainWrap, prefix);
    if (prefix === "gab3") applyGab3SlashLineBreaks(mainWrap);
  }
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
  let t = await tryOne(serveUrl(relPath, cacheBust));
  if (t !== undefined) return t;
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
      errEl.textContent = MD_TAB_LOAD_FAILURE_HINT;
      errEl.hidden = false;
      return false;
    }
    await renderMdSplit(prefix, text);
    return true;
  } catch {
    mainEl.innerHTML = "";
    errEl.textContent = MD_TAB_LOAD_FAILURE_HINT;
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

/** `tabSources`·`/serve/`와 동일한 저장소 상대 경로(표시용) */
function repoPathFromServeRel(rel) {
  const r = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  return r || "—";
}

function formatTabSourceTooltip(heading, rel, extraLine) {
  const disk = repoPathFromServeRel(rel);
  let s = `${heading}\n\n저장소: ${disk}`;
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
    relLine.textContent = `저장소: ${repoPathFromServeRel(rel)}`;
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
    statusEl.textContent = MD_TAB_LOAD_FAILURE_HINT;
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
  statusEl.textContent = "";
  statusEl.className = "md-editor-status";
  const content = ta.value;
  statusEl.textContent = "저장 중…";
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
    statusEl.textContent =
      "저장되었습니다. 본문 탭에 곧바로 반영되었습니다.";
    statusEl.classList.add("is-ok");
    const p = mdEditorState.tabPrefix;
    if (p) {
      tabLoaded[p] = false;
      const relTab = tabSourceRelForSection(p);
      if (relTab) {
        const ok = await loadTabSource(p, relTab, { cacheBust: true });
        if (ok) tabLoaded[p] = true;
      }
    }
  } catch {
    statusEl.textContent =
      "저장 API에 연결할 수 없습니다. 로컬에서 npm start로 연 화면에서만 저장할 수 있습니다.";
    statusEl.classList.add("is-err");
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

async function loadTabIfNeeded(id) {
  if (!metaGlobal || tabLoaded[id]) return;
  const rel = tabSourceRelForSection(id);
  if (!rel) return;
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
const EVIDENCE_REPO_PREFIX_CANON = "행정심판청구(증거)/최종/";
const EVIDENCE_REPO_PREFIX_LEGACY = "행정심판청구(증거)/";

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
  /** 본문 「갑 제8-1호증」은 QR 파일이 아니라 갑8 묶음(썸네일) → 갑8-1 QR 썸네일에서 동영상 */
  gabByKey.set("8-1", "__GAB_BUNDLE__:8");
  /** 가지번호(4-1 등) 더블클릭 시 주번호 폴더 전체 썸네일 — 8-1만 예외(갑8 묶음·동영상). 갑9-1 등은 갑제9호증 폴더와 동일하게 전체 그리드 */
  const branchFolderExceptions = new Set(["8-1"]);
  for (const key of [...gabByKey.keys()]) {
    if (branchFolderExceptions.has(key)) continue;
    if (!/^\d+-\d+$/.test(key)) continue;
    const maj = key.split("-")[0];
    gabByKey.set(key, `__GAB_FOLDER__:${maj}`);
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
    const n = rel.slice("__GAB_FOLDER__:".length);
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

/** 전체 창(모달) 제목: `행정심판청구(증거)/최종/`·`갑호증/` 등 접두 제외 */
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

/** PDF.js (썸네일 없음, +/- 확대·축소) */
const PDFJS_MODULE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.mjs";

/** 법령정보(판례) PDF 우측 패널: 1쪽 썸네일만(다쪽은 모달) */
const LAW_PRECEDENT_THUMB_MAX_CSS_PX = 120;

function isLawInfoPdfRel(rel) {
  const n = normRelPosix(rel).toLowerCase();
  return n.endsWith(".pdf") && n.includes("/법령정보/");
}

/**
 * 판례·법령정보 PDF: 1쪽만 작은 캔버스로 썸네일 표시(더블클릭 시 모달 전체).
 * `/serve/`는 저장소에 둔 PDF 경로를 그대로 연다.
 */
async function mountLawPdfThumbnailsInPreview(mount, pdfUrl, rel, errEl) {
  const topHint = document.createElement("p");
  topHint.className = "cite-preview-inline-hint law-precedent-thumb-hint";
  topHint.textContent =
    "1쪽 미리보기입니다. 더블클릭하면 전체 PDF를 전체 화면으로 엽니다. " + VIEWER_CLOSE_HINT;
  mount.appendChild(topHint);

  const grid = document.createElement("div");
  grid.className = "detail-gab3-grid detail-gab3-grid--law-thumbs";
  mount.appendChild(grid);

  const loading = document.createElement("p");
  loading.className = "muted";
  loading.textContent = "판례 PDF 미리보기를 준비하는 중입니다.";
  grid.appendChild(loading);

  try {
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument(pdfJsDocumentParams(pdfUrl)).promise;
    loading.remove();
    const total = pdf.numPages;
    const fname = normRelPosix(rel).split("/").pop() || rel;
    const num = 1;
    const page = await pdf.getPage(num);
    const baseVp = page.getViewport({ scale: 1 });
    const scale = Math.min(
      LAW_PRECEDENT_THUMB_MAX_CSS_PX / baseVp.width,
      LAW_PRECEDENT_THUMB_MAX_CSS_PX / baseVp.height,
      1.25
    );
    const viewport = page.getViewport({ scale });

    const fig = document.createElement("figure");
    fig.className = "detail-gab3-item detail-gab3-item--law-thumb";
    const capEl = document.createElement("figcaption");
    const strong = document.createElement("strong");
    strong.textContent = total > 1 ? `1쪽 / 총 ${total}쪽` : "1쪽";
    capEl.appendChild(strong);
    capEl.appendChild(document.createElement("br"));
    const fn = document.createElement("span");
    fn.className = "detail-gab3-fname";
    fn.textContent = fname;
    capEl.appendChild(fn);
    fig.appendChild(capEl);

    const canvas = document.createElement("canvas");
    canvas.className = "law-precedent-thumb-canvas";
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "button");
    canvas.setAttribute(
      "aria-label",
      `1쪽 미리보기 — 더블클릭하면 전체 PDF를 전체 화면으로. ${VIEWER_CLOSE_HINT}`
    );
    canvas.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openRefDocFullscreen(rel);
    });
    canvas.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openRefDocFullscreen(rel);
      }
    });
    fig.appendChild(canvas);
    grid.appendChild(fig);

    if (total > 1) {
      const more = document.createElement("p");
      more.className = "cite-preview-inline-hint law-precedent-thumb-more";
      more.textContent = `총 ${total}쪽 문서입니다. 이 패널에는 1쪽만 표시합니다. 전체는 위 썸네일을 더블클릭하여 전체 화면에서 보십시오.`;
      mount.appendChild(more);
    }
    mount.dataset.inlineCiteRel = rel;
  } catch (e) {
    console.error(e);
    loading.remove();
    if (errEl) {
      errEl.textContent =
        "판례 PDF 미리보기를 만들지 못했습니다. 네트워크·파일 형식을 확인해 주십시오.";
      errEl.hidden = false;
    }
  }
}

let pdfjsLibCache = null;
async function loadPdfJs() {
  if (!pdfjsLibCache) {
    const pdfjsLib = await import(/* @vite-ignore */ PDFJS_MODULE);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    pdfjsLibCache = pdfjsLib;
  }
  return pdfjsLibCache;
}

/** `/serve/` 는 전체 파일 200 응답만 보내고 Range·206 을 처리하지 않음 → pdf.js 기본 range/stream 이 깨질 수 있음 */
function pdfJsDocumentParams(pdfUrl) {
  return {
    url: pdfUrl,
    withCredentials: false,
    disableRange: true,
    disableStream: true,
  };
}

/**
 * @param {HTMLElement} container
 * @param {string} pdfUrl
 * @param {{ variant?: "inline" | "modal", toolbarHidden?: boolean, modalTitle?: string, fitWidth?: boolean, thumbFirstPageOnly?: boolean, evidenceRel?: string }} [opts]
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
  toolbar.setAttribute("aria-label", "PDF 확대·축소");

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
  const maxScale = 2.5;
  const step = 0.1;

  async function applyFitWidthScale() {
    if (!fitWidth || pdf.numPages < 1) return;
    /** 스크롤바 유무로 `scroll.clientWidth` 가 흔들리면 ResizeObserver → 재렌더 루프(깜빡임)가 난다. 래퍼 폭 기준. */
    let cw = wrap.clientWidth;
    let ch = wrap.clientHeight;
    if (cw < 32) {
      await new Promise((r) => requestAnimationFrame(r));
      cw = wrap.clientWidth;
      ch = wrap.clientHeight;
    }
    const page1 = await pdf.getPage(1);
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
    scroll.replaceChildren();
    if (fitWidth) {
      await applyFitWidthScale();
    }
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    const lastPage = thumbFirstPageOnly ? 1 : pdf.numPages;
    for (let num = 1; num <= lastPage; num++) {
      const page = await pdf.getPage(num);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-viewer-page";
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
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
    const hint = document.createElement("p");
    hint.className = "pdf-viewer-modal-hint";
    hint.textContent =
      "이동: 드래그(패닝) 또는 스크롤. " + VIEWER_CLOSE_HINT;
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
      const vp1 = page1.getViewport({ scale: 1 });
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
 */
async function mountImageZoomViewer(container, imageUrl, opts = {}) {
  const alt = (opts.alt && String(opts.alt)) || "";
  container.replaceChildren();

  const wrap = document.createElement("div");
  wrap.className = "image-viewer-wrap";

  const toolbar = document.createElement("div");
  toolbar.className = "pdf-viewer-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "이미지 확대·축소");

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
    "이동: 드래그(패닝) 또는 스크롤. " + VIEWER_CLOSE_HINT;

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
  const maxScale = 10;
  const step = 0.1;

  function applyZoom() {
    img.style.width = `${scale * 100}%`;
    img.style.maxWidth = "none";
    img.style.height = "auto";
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }

  /** 뷰포트 안에 이미지 전체가 들어가도록 초기 배율(가로·세로 중 작은 쪽 기준). */
  function applyFitToView() {
    const w0 = scroll.clientWidth;
    const h0 = scroll.clientHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (w0 < 8 || h0 < 8 || nw < 1 || nh < 1) return;
    const k = Math.min(w0 / nw, h0 / nh, 1);
    scale = Math.max(minScale, (nw * k) / w0);
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

  toolbar.append(btnMinus, zoomLabel, btnPlus);
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
  const body = $("#viewer-body");
  body.replaceChildren();
  viewerModal().removeAttribute("data-viewer-content");
  if (kind === "md") {
    const div = document.createElement("div");
    div.className = "md-content";
    div.innerHTML = payload;
    body.appendChild(div);
  } else if (kind === "pdf") {
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
    openViewerModal();
    viewerModal().setAttribute("data-viewer-content", "image");
    mountImageZoomViewer(body, payload, { alt: title });
    return;
  } else if (kind === "txt") {
    openViewerModal();
    const pre = document.createElement("pre");
    pre.className = "viewer-txt-plain";
    pre.textContent = payload;
    body.appendChild(pre);
    return;
  } else if (kind === "video") {
    openViewerModal();
    viewerModal().setAttribute("data-viewer-content", "video");
    const video = document.createElement("video");
    video.className = "viewer-video";
    video.controls = true;
    video.src = payload;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    video.autoplay = true;
    video.playsInline = true;
    body.appendChild(video);
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestElementFullscreen(viewerModal());
        tryPlay();
      });
    });
    video.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeViewerModal();
    });
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
 */
function appendGabBundleGrid(container, row, opts = {}) {
  const skipScope = opts.skipScopeParagraph === true;
  if (!container || !row?.gabFileRange?.rels?.length) return;
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
    fig.appendChild(cap);

    if (lower.endsWith(".pdf")) {
      const pdfMount = document.createElement("div");
      pdfMount.className = "detail-gab3-pdf-mount";
      fig.appendChild(pdfMount);
      grid.appendChild(fig);
      mountPdfJsViewer(pdfMount, serveUrl(rel), {
        variant: "inline",
        toolbarHidden: true,
        fitWidth: true,
        thumbFirstPageOnly: true,
        modalTitle: `${gabLabel} — ${base}`,
        evidenceRel: rel,
      }).catch((e) => {
        console.error(e);
        pdfMount.textContent =
          "PDF를 불러오지 못하였습니다. 제출 매체를 참고하여 주시기 바랍니다.";
        pdfMount.classList.add("detail-gab3-pdf-mount--err");
      });
      return;
    }
    if (lower.endsWith(".mp4")) {
      const vid = document.createElement("video");
      vid.className = "detail-gab3-video";
      vid.src = serveUrl(rel);
      vid.controls = true;
      vid.preload = "metadata";
      vid.autoplay = false;
      vid.setAttribute("playsinline", "");
      vid.title = `${gabLabel} — ${base}`;
      vid.style.cursor = "pointer";
      const modalTitle = `${gabLabel} — ${base}`;
      vid.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showModal(modalTitle, "video", serveUrl(rel));
      });
      fig.appendChild(vid);
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

function showCitePreviewAside() {
  const aside = $("#cite-preview-aside");
  if (!aside) return;
  requestAnimationFrame(() => {
    const r = aside.getBoundingClientRect();
    const pad = 12;
    const vh = window.innerHeight || 0;
    const verticallyVisible =
      r.height > 0 && r.top >= -pad && r.bottom <= vh + pad;
    if (verticallyVisible) return;
    /** `smooth` 은 PDF 리플로우·스크롤바와 겹치면 스크롤이 흔들리며 깜빡임처럼 보일 수 있음 */
    aside.scrollIntoView({ block: "nearest", behavior: "auto" });
  });
}

/** 오른쪽 미리보기 영역을 세로로 최대한 펼침(모달이 아닌 패널 기준). */
function setCitePreviewPanelExpanded(on) {
  document.body.classList.toggle("cite-preview-expanded", Boolean(on));
  if (on) showCitePreviewAside();
}

function clearDocPreviewPanel() {
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
  mount.replaceChildren();
  delete mount.dataset.inlineCiteRel;
  showCitePreviewAside();

  let r = normalizeRefBundleRel(rel);

  if (String(r).startsWith("__GAB_FOLDER__:")) {
    const major = String(r).slice("__GAB_FOLDER__:".length);
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
    appendGabBundleGrid(mount, row, { skipScopeParagraph: true });
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
      if (isLawInfoPdfRel(r)) {
        await mountLawPdfThumbnailsInPreview(mount, url, r, err);
      } else {
        const pdfTitle = r.split("/").pop() || r;
        await mountPdfJsViewer(mount, url, {
          variant: "inline",
          toolbarHidden: true,
          fitWidth: true,
          thumbFirstPageOnly: true,
          modalTitle: pdfTitle,
          evidenceRel: r,
        });
        const pdfHint = document.createElement("p");
        pdfHint.className = "cite-preview-inline-hint";
        pdfHint.textContent =
          "전체 쪽·확대·축소: 본문(PDF)을 더블클릭하면 전체 화면입니다. " + VIEWER_CLOSE_HINT;
        mount.appendChild(pdfHint);
        mount.dataset.inlineCiteRel = r;
      }
    } catch (e) {
      console.error(e);
      err.textContent = "PDF를 이 패널에서 열 수 없습니다.";
      err.hidden = false;
    }
    return;
  }

  if (/\.(mp4|webm|mov|avi)$/i.test(r)) {
    const wrap = document.createElement("div");
    wrap.className = "cite-preview-video-wrap";
    const video = document.createElement("video");
    video.className = "cite-preview-video-inline";
    video.controls = true;
    video.src = url;
    video.preload = "metadata";
    video.autoplay = false;
    video.setAttribute("playsinline", "");
    wrap.appendChild(video);
    mount.appendChild(wrap);
    const sub = document.createElement("p");
    sub.className = "cite-preview-inline-hint";
    sub.textContent =
      "이 패널에서는 재생 단추로만 재생합니다. 더블클릭하면 전체 화면에서 자동 재생됩니다. " +
      VIEWER_CLOSE_HINT;
    mount.appendChild(sub);
    mount.dataset.inlineCiteRel = r;
    return;
  }

  if (/\.(jpe?g|png|gif|webp)$/i.test(r)) {
    const wrap = document.createElement("div");
    wrap.className = "viewer-img-wrap viewer-img-wrap--clickable cite-preview-img-wrap";
    const img = document.createElement("img");
    img.className = "viewer-img";
    img.alt = r.split("/").pop() || r;
    img.src = url;
    img.loading = "lazy";
    img.style.cursor = "pointer";
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute(
      "aria-label",
      "더블클릭하면 전체 화면입니다. " + VIEWER_CLOSE_HINT
    );
    img.onerror = () => {
      wrap.textContent = "파일을 화면에 표시하지 못하였습니다.";
    };
    const openFull = () => openRefDocFullscreen(r);
    img.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFull();
    });
    img.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFull();
      }
    });
    const sub = document.createElement("p");
    sub.className = "cite-preview-inline-hint";
    sub.textContent = "전체 화면: 사진을 더블클릭하십시오. " + VIEWER_CLOSE_HINT;
    wrap.appendChild(img);
    wrap.appendChild(sub);
    mount.appendChild(wrap);
    mount.dataset.inlineCiteRel = r;
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
      "아래는 저장소 기준 시작 경로부터 끝 경로까지입니다. 단추는 범위의 첫 파일만 이 화면에서 엽니다.";
    filesWrap.appendChild(hint);
    const pre = document.createElement("pre");
    pre.className = "detail-range-paths";
    pre.textContent = `${row.gabFileRange.firstRel}\n부터\n${row.gabFileRange.lastRel}\n까지`;
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
  ["appeal", "injunction", "gab1", "gab2", "gab3", "gab4"].forEach((name) => {
    const el = $(`#section-${name}`);
    if (!el) return;
    const on = name === id;
    el.hidden = !on;
    el.classList.toggle("is-visible", on);
  });
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.section === id);
  });
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.section;
      clearDocPreviewPanel();
      showSection(id);
      setLocationHash(id, null);
      loadTabIfNeeded(id);
    });
  });
}

async function main() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  bindTabs();
  bindMdEditorTools();
  bindViewerChrome();
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
  augmentGabFilesFromEvidence(metaGlobal, data.evidence || []);
  citeMaps = buildCiteMaps(metaGlobal, data.evidence || []);
  applyTabSourcePathHints();

  bindCiteClickHandlers();
  bindBijeServeLinkDblClick();
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

  if (parseHash().tab) {
    await applyHashFromLocation();
  } else {
    showSection("appeal");
    await loadTabIfNeeded("appeal");
    requestAnimationFrame(() => scrollFirstScreenToTop());
  }
}

main().catch((e) => {
  console.error(e);
  const sub = $("#site-subtitle");
  if (sub) {
    sub.textContent =
      "화면을 준비하는 중 오류가 발생하였습니다. 잠시 후 다시 시도하시거나 청구인 측에 문의하여 주시기 바랍니다.";
  }
});
