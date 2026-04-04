/**
 * 농원근린공원 행정심판청구 — 탭별 서면 표시·미주
 */

const $ = (sel, root = document) => root.querySelector(sel);

/** 미리보기 패널 초기 제목(HTML): 굵게 + 공백 두 칸 + [ 사용방법 ] */
const DOC_PREVIEW_HEADING_IDLE_HTML =
  '<strong class="cite-preview-heading-main">별첨·참고</strong>  [ 사용방법 ]';

/** 오른쪽 패널 안내 문구(초기·필터 초기화 시) — 제목 줄의 [ 사용방법 ] 아래 번호 목록만 */
const DOC_PREVIEW_LEAD_DEFAULT = `1. 개요·청구서·별지(갑호증)·별지(시간축)·집행정지신청서 본문에서 호증 표기·링크를 더블클릭하면 오른쪽 패널에 요지·파일이 열립니다.
2. 행정심판청구·집행정지신청 본문의 인용을 더블클릭해도 여기에 열리며, 별지(시간축) 본문의 인용·저장소 파일 링크를 더블클릭할 수도 있습니다.
3. 출력된 PDF·이미지·동영상 등을 다시 더블클릭하면 전체 화면으로 열 수 있고, 더블클릭 또는 Esc로 닫을 수 있습니다.`;

const DOC_PREVIEW_LEAD_CITE =
  "청구서·신청서 본문에서 연 인용입니다. 내용을 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

const DOC_PREVIEW_LEAD_APPENDIX_CITE =
  "별지(시간축) 본문에서 연 인용입니다. 내용을 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

const DOC_PREVIEW_LEAD_APPENDIX_FILE =
  "별지(시간축) 본문의 저장소 파일 링크입니다. 내용을 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

const DOC_PREVIEW_LEAD_EVIDENCE =
  "연 호증의 요지와 파일입니다. 분할 묶음은 격자로 보입니다. 내용을 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

/** 청구서·개요 등 본문의 호증 링크에서 연 파일 */
const DOC_PREVIEW_LEAD_GAB_LINK =
  "본문·증거 목록의 호증 링크에서 연 파일입니다. 다시 더블클릭하면 전체 화면으로 열 수 있습니다.";

const MARKED_CDN = "https://cdn.jsdelivr.net/npm/marked@14.1.0/+esm";

let metaGlobal = null;

/** `web/source/site-display.json` — 제목·부제·기준일은 여기만 편집(포털이 우선 적용) */
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

/** 인용 링크: 청구·신청 본문은 더블클릭 시 오른쪽 패널 → 패널에서 다시 더블클릭 시 전체 화면. */
const CITE_OPEN_TITLE =
  "더블클릭하면 오른쪽 패널에 자료를 표시합니다. 패널에서 다시 더블클릭하면 전체 화면입니다. (키보드: Enter 또는 Space)";

/** 전체 창(모달) 뷰어 — 본문·어두운 바깥 더블클릭 또는 Esc로 닫기(닫기 단추도 동일). */
const VIEWER_CLOSE_HINT = "닫기: 더블클릭 또는 Esc 키.";

/** 모달이 열리기 직전 `window` 스크롤 — 닫을 때 복원해 본문 위치가 튀지 않게 함 */
let viewerBackgroundScroll = null;

const tabLoaded = {
  overview: false,
  appeal: false,
  gab: false,
  appendix: false,
  injunction: false,
};

function norm(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function serveUrl(relPath) {
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  /** `encodeURIComponent`는 `()`를 그대로 두는데, 일부 프록시·방화벽에서 경로가 잘리므로 %28 %29 로 통일 */
  return `/serve/${parts
    .map((seg) =>
      encodeURIComponent(seg).replace(/\(/g, "%28").replace(/\)/g, "%29")
    )
    .join("/")}`;
}

/** `tabSources.gab`가 없을 때 `overview`의 `…(최종)/yymmdd/`에서 별지 갑호증 MD 경로를 맞춤 */
function deriveGabTabSourceRelFromOverview(overviewRel) {
  const o = String(overviewRel || "").replace(/\\/g, "/").trim();
  const m = o.match(/^(행정심판청구\(최종\)\/\d{6})\//);
  if (!m) return "";
  const folderDate = m[1].split("/").pop() || "";
  return `${m[1]}/${folderDate}_별지_갑호증_목록_드롭다운.md`;
}

function resolvedGabTabSourceRel() {
  const src = metaGlobal?.tabSources;
  if (!src) return "";
  if (src.gab) return String(src.gab).trim();
  return deriveGabTabSourceRelFromOverview(src.overview);
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

const VALID_SECTIONS = [
  "overview",
  "appeal",
  "gab",
  "appendix",
  "injunction",
];

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

/** 첫 화면·#overview: 헤더·탭·개요 본문 시작이 한데 보이도록 문서 최상단으로 스크롤 */
function scrollFirstScreenToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

async function applyHashFromLocation() {
  let { tab, hoNum } = parseHash();
  if (tab === "evidence") {
    tab = "overview";
    setLocationHash(tab, hoNum);
  }
  if (!tab || !VALID_SECTIONS.includes(tab)) return;
  showSection(tab);
  await loadTabIfNeeded(tab);
  if (tab === "overview" || tab === "gab" || tab === "appendix") {
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

async function renderMdSplit(prefix, mdText) {
  const parse = await getMarked();
  const { main, notes } = splitMainAndNotes(mdText);
  const preserveBoldItalic = prefix === "appeal" || prefix === "injunction";
  const unwrapOpts = { preserveBoldItalic };
  function mdToHtmlForTab(mdChunk) {
    if (!preserveBoldItalic) return parse(mdChunk);
    const normalized = normalizeMarkdownBoldSpans(mdChunk);
    return htmlLiteralBoldToStrong(parse(normalized));
  }
  const mainEl = $(`#${prefix}-md-main`);
  const wrapEl = $(`#${prefix}-md-notes-wrap`);
  const notesEl = $(`#${prefix}-md-notes`);
  mainEl.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "md-content";
  wrap.innerHTML = injectIncheonIngaGosiLinks(mdToHtmlForTab(main));
  mainEl.appendChild(wrap);
  if (notes.trim()) {
    wrapEl.hidden = false;
    notesEl.replaceChildren();
    const notesWrap = document.createElement("div");
    notesWrap.className = "md-content";
    notesWrap.innerHTML = injectIncheonIngaGosiLinks(mdToHtmlForTab(notes));
    notesEl.appendChild(notesWrap);
    upgradeMarkdownAnchorsToCiteRefs(notesWrap, { nested: false });
    decorateCiteLinks(notesWrap, { nested: false });
    decorateExternalRefLinks(notesWrap);
    unwrapMarkdownDecorations(notesWrap, unwrapOpts);
  } else {
    wrapEl.hidden = true;
    notesEl.replaceChildren();
  }
  const mainWrap = mainEl.querySelector(".md-content");
  if (mainWrap) {
    upgradeMarkdownAnchorsToCiteRefs(mainWrap, { nested: false });
    decorateCiteLinks(mainWrap, { nested: false });
    decorateExternalRefLinks(mainWrap);
    unwrapMarkdownDecorations(mainWrap, unwrapOpts);
  }
}

/**
 * 서면 탭 본문 로드 실패 시 안내 — MD 편집 모달(`index.html` `.md-editor-hint`)과 동일 문구만 표시.
 */
const MD_TAB_LOAD_FAILURE_HINT =
  "내용은 UTF-8 텍스트입니다. 상단 오른쪽 .txt로 내려받기는 편집본 그대로 저장합니다. 저장소에 저장은 저장소의 .md 파일을 덮어씁니다(로컬 서버에서만).";

async function loadTabSource(prefix, relPath) {
  const errEl = $(`#${prefix}-err`);
  errEl.hidden = true;
  const mainEl = $(`#${prefix}-md-main`);
  mainEl.innerHTML = "<p class=\"muted\">내용을 불러오는 중입니다.</p>";
  try {
    const res = await fetch(serveUrl(relPath), { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      mainEl.innerHTML = "";
      errEl.textContent = MD_TAB_LOAD_FAILURE_HINT;
      errEl.hidden = false;
      return false;
    }
    await renderMdSplit(prefix, text);
    return true;
  } catch (e) {
    mainEl.innerHTML = "";
    errEl.textContent = MD_TAB_LOAD_FAILURE_HINT;
    errEl.hidden = false;
    return false;
  }
}

/** MD 편집 모달: `portal-data.json`의 `tabSources` 경로와 동일한 `rel`만 저장 API에 전달 */
let mdEditorState = { rel: "", tabPrefix: null, filenameBase: "" };

function mdRelToTxtFilename(rel) {
  const base = String(rel).split("/").pop() || "document.md";
  return base.replace(/\.md$/i, ".txt");
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

  setTab("overview", src.overview, "개요 탭", null);
  setTab("appeal", src.appeal, "행정심판청구 탭", null);
  setTab("gab", resolvedGabTabSourceRel(), "별지(갑호증) 탭", null);
  setTab("appendix", src.appendix, "별지(시간축) 탭", null);
  setTab("injunction", src.injunction, "집행정지신청 탭", null);

  const setBtn = (id, rel, heading, extra) => {
    if (!rel) return;
    const el = document.getElementById(id);
    if (el) el.setAttribute("title", formatTabSourceTooltip(heading, rel, extra));
  };

  setBtn("btn-md-overview", src.overview, "MD 편집 · 개요", null);
  setBtn("btn-md-appeal", src.appeal, "MD 편집 · 행정심판청구서", null);
  setBtn("btn-md-gab", resolvedGabTabSourceRel(), "MD 편집 · 별지(갑호증)", null);
  setBtn("btn-md-appendix", src.appendix, "MD 편집 · 별지(시간축)", null);
  setBtn("btn-md-injunction", src.injunction, "MD 편집 · 집행정지신청서", null);
}

async function openMdEditor(prefix) {
  const src = metaGlobal?.tabSources || {};
  let rel = null;
  let title = "원문 MD";
  if (prefix === "overview") {
    rel = src.overview;
    title = "개요 (MD)";
  } else if (prefix === "appeal") {
    rel = src.appeal;
    title = "행정심판·청구서 (MD)";
  } else if (prefix === "gab") {
    rel = resolvedGabTabSourceRel();
    title = "별지(갑호증) (MD)";
  } else if (prefix === "injunction") {
    rel = src.injunction;
    title = "집행정지·신청서 (MD)";
  } else if (prefix === "appendix") {
    rel = src.appendix;
    title = "별지(시간축) (MD)";
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
  modal.hidden = false;
  document.body.style.overflow = "hidden";

  mdEditorState = {
    rel,
    tabPrefix: prefix,
    filenameBase: mdRelToTxtFilename(rel),
  };

  try {
    const res = await fetch(serveUrl(rel), { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      ta.value = "";
      statusEl.textContent = MD_TAB_LOAD_FAILURE_HINT;
      statusEl.classList.add("is-err");
      return;
    }
    ta.value = text;
  } catch {
    ta.value = "";
    statusEl.textContent = MD_TAB_LOAD_FAILURE_HINT;
    statusEl.classList.add("is-err");
  }
}

function closeMdEditorModal() {
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
  const name = mdEditorState.filenameBase || "document.txt";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
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
      statusEl.textContent =
        j.error || `저장에 실패했습니다(HTTP ${res.status}).`;
      statusEl.classList.add("is-err");
      return;
    }
    statusEl.textContent =
      "저장되었습니다. 아래 본문 탭을 다시 열면 반영됩니다.";
    statusEl.classList.add("is-ok");
    const p = mdEditorState.tabPrefix;
    if (p === "appeal") {
      tabLoaded.appeal = false;
    } else if (p) {
      tabLoaded[p] = false;
    }
    const active = document.querySelector(".tab.is-active")?.dataset?.section;
    if (!active) return;
    if (p === "appeal") {
      if (active === "appeal") await loadTabIfNeeded("appeal");
    } else if (active === p) {
      await loadTabIfNeeded(p);
    }
  } catch {
    statusEl.textContent =
      "저장 API에 연결할 수 없습니다. 로컬에서 npm start로 연 화면에서만 저장할 수 있습니다.";
    statusEl.classList.add("is-err");
  }
}

function bindMdEditorTools() {
  $("#btn-md-overview")?.addEventListener("click", () => openMdEditor("overview"));
  $("#btn-md-appeal")?.addEventListener("click", () => openMdEditor("appeal"));
  $("#btn-md-gab")?.addEventListener("click", () => openMdEditor("gab"));
  $("#btn-md-appendix")?.addEventListener("click", () => openMdEditor("appendix"));
  $("#btn-md-injunction")?.addEventListener("click", () =>
    openMdEditor("injunction")
  );
  $("#md-editor-close")?.addEventListener("click", closeMdEditorModal);
  $("#md-editor-modal")
    ?.querySelector("[data-md-editor-close]")
    ?.addEventListener("click", closeMdEditorModal);
  $("#md-editor-download-txt")?.addEventListener("click", downloadMdAsTxt);
  $("#md-editor-save")?.addEventListener("click", () => saveMdToRepo());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = $("#md-editor-modal");
    if (modal && !modal.hidden) closeMdEditorModal();
  });
}

async function loadTabIfNeeded(id) {
  if (!metaGlobal || tabLoaded[id]) return;
  const src = metaGlobal.tabSources || {};
  if (id === "overview" && src.overview) {
    if (await loadTabSource("overview", src.overview)) tabLoaded.overview = true;
    return;
  }
  if (id === "appeal" && src.appeal) {
    if (await loadTabSource("appeal", src.appeal)) tabLoaded.appeal = true;
    return;
  }
  if (id === "gab") {
    const gabRel = resolvedGabTabSourceRel();
    if (!gabRel) {
      const errEl = $("#gab-err");
      if (errEl) {
        errEl.textContent =
          "별지(갑호증) MD 경로를 알 수 없습니다. portal-data.json의 tabSources.gab 또는 overview(…/yymmdd/…)를 확인하십시오.";
        errEl.hidden = false;
      }
      return;
    }
    if (await loadTabSource("gab", gabRel)) tabLoaded.gab = true;
    return;
  }
  if (id === "appendix" && src.appendix) {
    if (await loadTabSource("appendix", src.appendix)) tabLoaded.appendix = true;
    return;
  }
  if (id === "injunction" && src.injunction) {
    if (await loadTabSource("injunction", src.injunction)) tabLoaded.injunction = true;
  }
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

/** 저장소 `행정심판청구(증거)/최종/갑호증/` — 폴더 필터·경로 판별에 공통 사용 */
const GAB_REPO_PATH_MARKER = "행정심판청구(증거)/최종/갑호증/";
/** 저장소 `행정심판청구(증거)/최종/법령정보/` — 경로·표시 판별 */
const LAW_REPO_PATH_MARKER = "행정심판청구(증거)/최종/법령정보/";
/** 이전 트리(폴더 이동 전) — rel·서빙 폴백용 */
const LEGACY_GAB_MARKER = "행정심판청구(증거)/갑호증/";
const LEGACY_LAW_MARKER = "행정심판청구(증거)/법령정보/";
const EVIDENCE_REPO_PREFIX_CANON = "행정심판청구(증거)/최종/";
const EVIDENCE_REPO_PREFIX_LEGACY = "행정심판청구(증거)/";

/** 표시용: 정본 `…/증거/최종/` 또는 구 `…/증거/` 접두 제거 */
function sliceEvidenceTail(rel) {
  const n = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .normalize("NFC");
  if (n.startsWith(EVIDENCE_REPO_PREFIX_CANON)) return n.slice(EVIDENCE_REPO_PREFIX_CANON.length);
  if (n.startsWith(EVIDENCE_REPO_PREFIX_LEGACY)) return n.slice(EVIDENCE_REPO_PREFIX_LEGACY.length);
  return n;
}

function evidenceFileToRel(ref) {
  const n = ref.replace(/\\/g, "/");
  return `${GAB_REPO_PATH_MARKER}${n}`;
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
    add(evidenceFileToRel(f));
  }
  const d = String(row.detail || "");
  const rePath = /행정심판청구\(증거\)(?:\/최종)?\/갑호증\/[^\s`'"]+/g;
  let m;
  while ((m = rePath.exec(d)) !== null) {
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

/** 갑8-1·9-1은 QR PNG가 아니라 동영상으로 인용(청구서: 동일 통합본·주제별 보조 영상). */
/** 우선: `갑제6-2호증_…_동영상.mp4` — 구명 `갑제6-2증_…_동영상_통합.mp4` 는 GAB62_UNIFIED_BASENAMES[1] */
const GAB62_UNIFIED_MP4_FALLBACK =
  "행정심판청구(증거)/최종/갑호증/갑제6-2호증_건축과_도로·통행_동영상(건축과-25898).mp4";
/** 갑호증 루트 표준명(우선) — 구명 `영상_동춘동198_*.mp4` 는 하위 호환 */
const GAB81_VIDEO_PREFER_BASENAMES = [
  "갑호증_동춘동198_항공사진.mp4",
  "영상_동춘동198_항공사진.mp4",
];
const GAB91_VIDEO_PREFER_BASENAMES = [
  "갑호증_동춘동198_위법행정.mp4",
  "영상_동춘동198_위법행정.mp4",
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

function buildCiteMaps(meta, evidence) {
  const caseById = new Map();
  const pref = meta.precedentFiles || [];
  for (const f of pref) {
    const m = (f.label || "").match(/(\d{2,4}(?:두|누|다)\d+)/);
    if (!m) continue;
    const id = normCaseId(m[1]);
    const prev = caseById.get(id);
    const prefer = /^\d{2}_/.test(f.label) && !String(f.label).includes("국가법령정보");
    if (!prev || prefer) caseById.set(id, f.rel);
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
      if (!gabByKey.has(key)) gabByKey.set(key, evidenceFileToRel(name));
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
  /** 본문 앵커 `#1`(갑 제1호증) → 분할 묶음 `1a`와 동일 */
  if (gabByKey.has("1a") && !gabByKey.has("1")) {
    gabByKey.set("1", gabByKey.get("1a"));
  }
  /** 묶음에 파일이 없을 때(메타만 병합): `#1` → 첫 `1-n` 또는 첫 `갑제1-*` 파일 */
  if (!gabByKey.has("1")) {
    let rel = gabByKey.get("1-1");
    if (!rel) {
      for (let n = 2; n <= 13; n += 1) {
        const k = `1-${n}`;
        if (gabByKey.has(k)) {
          rel = gabByKey.get(k);
          break;
        }
      }
    }
    if (!rel) {
      const it = gab.find((f) => /갑제1-\d+호증/i.test(String(f.rel || "")));
      if (it) rel = it.rel;
    }
    if (rel) gabByKey.set("1", rel);
  }
  /** 본문 「갑 제8-1호증」은 QR 파일이 아니라 갑8 묶음(썸네일) → 갑8-1 QR 썸네일에서 동영상 */
  gabByKey.set("8-1", "__GAB_BUNDLE__:8");
  gabByKey.set(
    "9-1",
    resolveCiteVideoRelForGab81Or91(gab, gabByKey, GAB91_VIDEO_PREFER_BASENAMES)
  );
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
  if (
    (rel.startsWith("__REF_GAB_BUNDLE__:") || rel.startsWith("__GAB_BUNDLE__:")) &&
    label
  ) {
    return label;
  }
  let tail = sliceEvidenceTail(rel);
  if (tail.startsWith(GAB_SECTION_PREFIX)) tail = tail.slice(GAB_SECTION_PREFIX.length);
  if (tail.startsWith(ATTACH_SECTION_PREFIX)) tail = tail.slice(ATTACH_SECTION_PREFIX.length);
  if (tail.startsWith(LAW_SECTION_PREFIX)) tail = tail.slice(LAW_SECTION_PREFIX.length);
  if (tail.startsWith(WORK_OTHER_REF_PREFIX)) tail = tail.slice(WORK_OTHER_REF_PREFIX.length);
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
  let tail = sliceEvidenceTail(rel);
  if (tail.startsWith(GAB_SECTION_PREFIX)) tail = tail.slice(GAB_SECTION_PREFIX.length);
  if (tail.startsWith(ATTACH_SECTION_PREFIX)) tail = tail.slice(ATTACH_SECTION_PREFIX.length);
  if (tail.startsWith(LAW_SECTION_PREFIX)) tail = tail.slice(LAW_SECTION_PREFIX.length);
  if (tail.startsWith(WORK_OTHER_REF_PREFIX)) tail = tail.slice(WORK_OTHER_REF_PREFIX.length);
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
    document.querySelector(".tab.is-active")?.dataset?.section || "overview";
  setLocationHash(active, row.num);
}

async function openCiteTarget(rel) {
  if (!rel) return;
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

/** 판례번호 | 갑호증(「갑 제5-1호증」 또는 생략형 「,  제5-2호증」·「및 제5-2호증」) */
const CITE_TEXT_RE =
  /(\d{2,4}(?:두|누|다)\d+)|((?:갑\s*)?제\s*\d+(?:-\d+)?\s*호증)/g;

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

/** 개요·청구·신청·별지(갑호증)·별지(시간축) 본문과 오른쪽 미리보기 패널 안의 인용·링크는 같은 패널로 연다. */
function isCiteLinkSidePanel(a) {
  return Boolean(
    a &&
      a.closest &&
      a.closest(
        "#section-overview, #section-appeal, #section-gab, #section-appendix, #section-injunction, #cite-preview-aside"
      )
  );
}

function citePreviewOptsForAnchor(a) {
  if (a.closest("#cite-preview-aside")) {
    return { heading: "별첨·참고", lead: DOC_PREVIEW_LEAD_CITE };
  }
  if (a.closest("#section-overview")) {
    return { heading: "별첨·참고", lead: DOC_PREVIEW_LEAD_GAB_LINK };
  }
  if (a.closest("#section-gab")) {
    return { heading: "별첨·참고", lead: DOC_PREVIEW_LEAD_GAB_LINK };
  }
  if (a.closest("#section-appendix")) {
    return { heading: "별지(시간축)", lead: DOC_PREVIEW_LEAD_APPENDIX_CITE };
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

function bindAppendixServeLinkDblClick() {
  document.addEventListener("dblclick", (e) => {
    const sec = $("#section-appendix");
    if (!sec || sec.hidden) return;
    const a = e.target.closest("a[href]");
    if (!a || !sec.contains(a)) return;
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
      heading: "별지(시간축)",
      lead: DOC_PREVIEW_LEAD_APPENDIX_FILE,
    }).catch((err) => console.error(err));
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

let pdfjsLibCache = null;
async function loadPdfJs() {
  if (!pdfjsLibCache) {
    const pdfjsLib = await import(/* @vite-ignore */ PDFJS_MODULE);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    pdfjsLibCache = pdfjsLib;
  }
  return pdfjsLibCache;
}

/**
 * @param {HTMLElement} container
 * @param {string} pdfUrl
 * @param {{ variant?: "inline" | "modal", toolbarHidden?: boolean, modalTitle?: string }} [opts]
 *   toolbarHidden: 인라인에서만 — 확대/축소 바 숨김, 더블클릭 시 모달(바 표시)로 연다.
 */
async function mountPdfJsViewer(container, pdfUrl, opts = {}) {
  const variant = opts.variant || "inline";
  const toolbarHidden = opts.toolbarHidden === true && variant === "inline";
  container.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "muted";
  loading.textContent = "PDF를 불러오는 중입니다.";
  container.appendChild(loading);

  const pdfjsLib = await loadPdfJs();
  const task = pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false });
  const pdf = await task.promise;
  loading.remove();

  const wrap = document.createElement("div");
  wrap.className =
    variant === "modal" ? "pdf-viewer-wrap pdf-viewer-wrap--modal" : "pdf-viewer-wrap pdf-viewer-wrap--inline";
  if (toolbarHidden) {
    wrap.classList.add("pdf-viewer-wrap--toolbar-hidden");
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
  const minScale = 0.5;
  const maxScale = 2.5;
  const step = 0.1;

  async function renderPages() {
    scroll.replaceChildren();
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    for (let num = 1; num <= pdf.numPages; num++) {
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
      showModal(modalTitle, "pdf", pdfUrl);
    });
  } else {
    wrap.append(toolbar, scroll);
  }
  container.appendChild(wrap);
  await renderPages();
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
  const maxScale = 3;
  const step = 0.1;

  function applyZoom() {
    img.style.width = `${scale * 100}%`;
    img.style.maxWidth = "none";
    img.style.height = "auto";
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
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
    applyZoom();
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

function closeViewerModal() {
  const el = viewerModal();
  el.hidden = true;
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
  if (kind === "md") {
    const div = document.createElement("div");
    div.className = "md-content";
    div.innerHTML = payload;
    body.appendChild(div);
  } else if (kind === "pdf") {
    openViewerModal();
    mountPdfJsViewer(body, payload, { variant: "modal" }).catch((e) => {
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
    const video = document.createElement("video");
    video.className = "viewer-video";
    video.controls = true;
    video.src = payload;
    video.setAttribute("playsinline", "");
    video.autoplay = true;
    video.playsInline = true;
    body.appendChild(video);
    video.addEventListener("loadeddata", () => {
      video.play().catch(() => {});
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
      ? "PDF는 호증 번호 순서대로 본문이 표시됩니다. 확대·축소는 각 블록을 더블클릭한 전체 화면에서 하십시오."
      : hasImageOnlyThumb
        ? "PDF는 순서대로 본문이 표시됩니다(더블클릭 시 전체 화면·확대/축소). 사진 썸네일은 더블클릭하면 전체 창으로 열 수 있습니다."
        : "PDF는 순서대로 본문이 표시됩니다. 더블클릭하면 전체 화면에서 확대·축소할 수 있습니다.";
    if (rels.some((r) => isGab81QrPngRel(r))) {
      base +=
        " 갑 제8-1호증(항공 QR) 썸네일 더블클릭 시 항공 관련 동영상(전체 창)을 재생합니다. 동일 묶음에 MP4가 있으면 아래에서 바로 재생할 수 있습니다.";
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
        modalTitle: `${gabLabel} — ${base}`,
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
      vid.setAttribute("playsinline", "");
      vid.title = `${gabLabel} — ${base}`;
      fig.appendChild(vid);
      grid.appendChild(fig);
      return;
    }
    if (/\.(jpe?g|png|gif|webp)$/i.test(rel)) {
      const img = document.createElement("img");
      img.className = "detail-gab3-img";
      img.src = serveUrl(rel);
      img.alt = `${gabLabel} (${base})`;
      img.loading = "lazy";
      img.decoding = "async";
      img.style.cursor = "pointer";
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      const openFull = () => {
        if (isGab81QrPngRel(rel)) {
          openGab81RelatedVideoModal();
          return;
        }
        openEvidenceFile(rel);
      };
      img.setAttribute(
        "aria-label",
        isGab81QrPngRel(rel)
          ? `${gabLabel} — 더블클릭: 항공 관련 동영상(전체 창). ${VIEWER_CLOSE_HINT}`
          : `${gabLabel} — 더블클릭: 전체 창. ${VIEWER_CLOSE_HINT}`
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
  container.appendChild(grid);
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

function relLooksLikeGabMainPath(rel) {
  const n = normRelPosix(rel);
  if (n.includes("/첨부/")) return false;
  if (n.includes("행정심판청구(증거)/최종/갑호증/")) return true;
  if (n.includes("행정심판청구(증거)/갑호증/")) return true;
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
    aside.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function clearDocPreviewPanel() {
  const mount = $("#cite-preview-mount");
  const err = $("#cite-preview-err");
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
  if (lead) lead.textContent = DOC_PREVIEW_LEAD_DEFAULT;
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

  const rowForSplit = findGabBundleRowForFileRel(r);
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
      await mountPdfJsViewer(mount, url, {
        variant: "inline",
        toolbarHidden: true,
        modalTitle: pdfTitle,
      });
      const pdfHint = document.createElement("p");
      pdfHint.className = "cite-preview-inline-hint";
      pdfHint.textContent =
        "확대·축소: 본문(PDF)을 더블클릭하면 전체 화면입니다. " + VIEWER_CLOSE_HINT;
      mount.appendChild(pdfHint);
      mount.dataset.inlineCiteRel = r;
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
    video.setAttribute("playsinline", "");
    wrap.appendChild(video);
    mount.appendChild(wrap);
    const sub = document.createElement("p");
    sub.className = "cite-preview-inline-hint";
    sub.textContent =
      "더블클릭하면 전체 화면에서 재생합니다(자동 재생). " + VIEWER_CLOSE_HINT;
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
    img.setAttribute("aria-label", "더블클릭하면 전체 화면입니다. " + VIEWER_CLOSE_HINT);
    img.onerror = () => {
      wrap.textContent = "파일을 화면에 표시하지 못하였습니다.";
    };
    const openFull = () => openRefDocFullscreen(r);
    img.addEventListener("dblclick", (e) => {
      e.preventDefault();
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
      const rel = relFromServeUrl(vGrid.currentSrc || vGrid.src);
      if (rel) {
        showModal(modalDocTitleFromRel(rel), "video", serveUrl(rel));
      }
      return;
    }
    const vIn = e.target.closest("video.cite-preview-video-inline");
    if (vIn && mount.contains(vIn)) {
      e.preventDefault();
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
      const rel = evidenceFileToRel(name);
      if (seen.has(rel)) continue;
      seen.add(rel);
      files.push({ label: name, rel });
    }
  }
  meta.gabFiles = sortGabItemsByFolderThenFile(files);
}

const _KO_SORT = { numeric: true, sensitivity: "base" };

/**
 * `행정심판청구(증거)/최종/갑호증/` 기준 **폴더 경로(상위→하위)** → **파일명** 순 가나다 정렬.
 * 묶음(`__REF_GAB_BUNDLE__:`)은 표시 라벨로 폴더 키에 넣어 같은 규칙으로 섞인다.
 */
function gabRelSortKey(rel) {
  const r = String(rel || "");
  const n = normRelPosix(r);
  let rest;
  if (n.startsWith(GAB_REPO_PATH_MARKER)) rest = n.slice(GAB_REPO_PATH_MARKER.length);
  else if (n.startsWith(LEGACY_GAB_MARKER)) rest = n.slice(LEGACY_GAB_MARKER.length);
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
  const n = (fileRef || "").replace(/\\/g, "/").trim();
  const rel =
    n.includes("행정심판청구(증거)/최종/갑호증/") || n.includes("행정심판청구(증거)/갑호증/")
      ? n
      : evidenceFileToRel(n);
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
  showModal(modalTitle, "text", "이 창에서는 사진·PDF 파일만 볼 수 있습니다.");
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
    if (e.key === "Escape" && !viewerModal().hidden) closeViewerModal();
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
  const iPath = s.search(/\n\n행정심판청구\(증거\)(?:\/최종)?\/갑호증\//);
  if (iPath >= 0) s = s.slice(0, iPath).trimEnd();
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
  ["overview", "appeal", "gab", "appendix", "injunction"].forEach(
    (name) => {
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
  bindAppendixServeLinkDblClick();
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
    showSection("overview");
    await loadTabIfNeeded("overview");
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
