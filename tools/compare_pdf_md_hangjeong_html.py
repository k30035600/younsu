# -*- coding: utf-8 -*-
"""행정심판청구(원본) PDF vs MD 비교 결과를 좌 PDF / 우 MD 2열 HTML로 저장합니다."""
from __future__ import annotations

import html as html_module
import re
import sys
import unicodedata
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path

from pypdf import PdfReader

from wonmun_paths import latest_yymmdd_md_under

PAIRS: list[tuple[str, str]] = [
    ("농원근린공원 집행정지신청서.pdf", "집행정지신청서.md"),
    ("농원근린공원 행정심판청구서.pdf", "행정심판청구서.md"),
    ("별지 제1호  증거(갑호증) 목록.pdf", "별지제1호_증거자료_목록.md"),
    ("별지 제2호  주요 인용 판례 및 적용 주석.pdf", "별지제2호_주요인용판례_및_적용주석.md"),
    ("별지 제3호  사실관계 시간축 정리표.pdf", "별지제3호_사실관계_시간축_정리표.md"),
    ("별지 제4호  법제사적 보충의견.pdf", "별지제4호_법제사적_보충의견.md"),
]


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        t = page.extract_text()
        parts.append(t or "")
    return "\n".join(parts)


def _normalize(s: str, *, is_md: bool) -> str:
    s = unicodedata.normalize("NFKC", s)
    if is_md:
        s = re.sub(r"<!--.*?-->", "", s, flags=re.DOTALL)
        s = re.sub(r"\[([^\]]*?)\]\([^)]*\)", r"\1", s)
        s = s.replace("**", "")
        s = re.sub(r"<style\b[^>]*>.*?</style>", "", s, flags=re.DOTALL | re.IGNORECASE)
        s = re.sub(r"<script\b[^>]*>.*?</script>", "", s, flags=re.DOTALL | re.IGNORECASE)
        s = re.sub(r"<br\s*/?>", "\n", s, flags=re.IGNORECASE)
        s = re.sub(
            r"</(p|div|h[1-6]|table|tr|ul|ol|blockquote)\s*>",
            "\n",
            s,
            flags=re.IGNORECASE,
        )
        s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    for line in s.split("\n"):
        line = line.strip()
        if is_md:
            line = re.sub(r"^#+\s*", "", line)
            if re.fullmatch(r"-{3,}", line):
                continue
        lines.append(line)
    out = "\n".join(lines)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def _unify_typography(s: str) -> str:
    """PDF 추출·MD 편집 차이(스마트따옴표, 대시, NBSP 등)를 줄여 동일 문구가 어긋나 보이지 않게 함."""
    repl = (
        ("\u00a0", " "),
        ("\u200b", ""),
        ("\u200c", ""),
        ("\u200d", ""),
        ("\ufeff", ""),
        ("\u2018", "'"),
        ("\u2019", "'"),
        ("\u201a", "'"),
        ("\u201b", "'"),
        ("\u2032", "'"),
        ("\u2035", "'"),
        ("\u201c", '"'),
        ("\u201d", '"'),
        ("\u201e", '"'),
        ("\u2013", "-"),
        ("\u2014", "-"),
        ("\u2212", "-"),
        ("\u00b7", "·"),
    )
    for a, b in repl:
        s = s.replace(a, b)
    s = re.sub(r"[\u3000 \t]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    s = re.sub(r" +", " ", s)
    return s


def _norm_ws(t: str) -> str:
    """비교용: 줄바꿈·연속 공백을 한 칸으로 합친 문자열."""
    return re.sub(r"\s+", " ", (t or "").strip())


def _strip_for_compare(s: str) -> str:
    """공백·구두점·특수문자 제거. 한글·영문·숫자만 남긴 절/문장 일치 판별용."""
    return re.sub(r"[^\uAC00-\uD7A30-9a-zA-Z]", "", _norm_ws(s))


def _word_key(w: str) -> str:
    """단어 비교용 키. 알파벳·한글·숫자만. 없으면 원 토큰으로 유일키(구두점만 다른 단어는 서로 구분)."""
    k = re.sub(r"[^\uAC00-\uD7A30-9a-zA-Z]", "", w)
    if k:
        return k
    return f"\uE000{w}\uE001"


# 마침표 뒤 공백이 오되, 바로 숫자가 이어지면 날짜·번호(예: 2026. 3. 13.) 안에서 자름
_PERIOD_BOUNDARY = re.compile(r"(?<=[\.．])\s+(?!\d)")


def _split_clauses(s: str) -> list[str]:
    """쉼표·마침표(날짜 안의 . 제외) 경계로 절을 나눔. 줄바꿈은 무시."""
    s = _norm_ws(s)
    if not s:
        return []
    out: list[str] = []
    for comma_part in re.split(r"\s*[,，]\s*", s):
        comma_part = comma_part.strip()
        if not comma_part:
            continue
        for piece in _PERIOD_BOUNDARY.split(comma_part):
            p = piece.strip()
            if p:
                out.append(p)
    return out if out else [s]


def _escape_para(text: str) -> str:
    return html_module.escape(text)


def _words(s: str) -> list[str]:
    """줄바꿈 무시 후 공백으로만 나눈 토큰."""
    return [w for w in _norm_ws(s).split(" ") if w]


def _render_word_diff_nonmatching_only(
    pdf_words: list[str],
    md_words: list[str],
    *,
    is_pdf: bool,
) -> str:
    """일치 단어는 출력하지 않고, 키가 다른 토큰만 span.diff로 나열."""
    a, b = pdf_words, md_words
    kp = [_word_key(w) for w in a]
    km = [_word_key(w) for w in b]
    sm = SequenceMatcher(None, kp, km)
    chunks: list[str] = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        if tag == "replace":
            seq = a[i1:i2] if is_pdf else b[j1:j2]
            if seq:
                inner = html_module.escape(" ".join(seq))
                chunks.append(f'<span class="diff">{inner}</span>')
        elif tag == "delete" and is_pdf and i1 < i2:
            inner = html_module.escape(" ".join(a[i1:i2]))
            chunks.append(f'<span class="diff">{inner}</span>')
        elif tag == "insert" and (not is_pdf) and j1 < j2:
            inner = html_module.escape(" ".join(b[j1:j2]))
            chunks.append(f'<span class="diff">{inner}</span>')
    return " · ".join(chunks) if chunks else ""


def _align_clause_pairs(segs_pdf: list[str], segs_md: list[str]) -> list[tuple[str, str]]:
    """쉼표·마침표로 나눈 절 목록을, 공백·특수문자 제거 키로 정렬."""
    kp = [_strip_for_compare(x) for x in segs_pdf]
    km = [_strip_for_compare(y) for y in segs_md]
    sm = SequenceMatcher(None, kp, km)
    rows: list[tuple[str, str]] = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                rows.append((segs_pdf[i1 + k], segs_md[j1 + k]))
        elif tag == "replace":
            ptxt = _norm_ws(" ".join(segs_pdf[i1:i2]))
            mtxt = _norm_ws(" ".join(segs_md[j1:j2]))
            rows.append((ptxt, mtxt))
        elif tag == "delete":
            for k in range(i1, i2):
                rows.append((segs_pdf[k], ""))
        elif tag == "insert":
            for k in range(j1, j2):
                rows.append(("", segs_md[k]))
    return rows


def _render_clause_pairs_html(pairs: list[tuple[str, str]]) -> str:
    """불일치 절만 HTML 행으로 렌더(키 일치 절은 생략). 단어 키 기준 밑줄."""
    out: list[str] = []
    for p, m in pairs:
        np, nm = _norm_ws(p), _norm_ws(m)
        if not p and m:
            out.append(
                '<div class="para-row mismatch only-md"><div class="para-cell pdf empty">(PDF에 대응 절 없음)</div>'
                f'<div class="para-cell md">{_escape_para(nm)}</div></div>'
            )
        elif p and not m:
            out.append(
                f'<div class="para-row mismatch only-pdf"><div class="para-cell pdf">{_escape_para(np)}</div>'
                '<div class="para-cell md empty">(MD에 대응 절 없음)</div></div>'
            )
        elif _strip_for_compare(p) == _strip_for_compare(m):
            continue
        else:
            wp, wm = _words(p), _words(m)
            left = _render_word_diff_nonmatching_only(wp, wm, is_pdf=True)
            right = _render_word_diff_nonmatching_only(wp, wm, is_pdf=False)
            if not left and not right:
                left = right = '<span class="empty">(단어 키 상 동일·절 키만 다름)</span>'
            out.append(
                f'<div class="para-row mismatch word-diff"><div class="para-cell pdf">{left}</div>'
                f'<div class="para-cell md">{right}</div></div>'
            )
    return "".join(out)


def _html_page(
    sections: list[str],
    pdf_root: Path,
    md_dir: Path,
    generated: str,
) -> str:
    esc = html_module.escape
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc("PDF vs MD 불일치만 (행정심판청구 원문)")}</title>
<style>
  :root {{
    --border: #c8d0dc;
    --bg: #f6f8fb;
    --pdf-bg: #fffef8;
    --md-bg: #f8fffe;
    --diff: #b00020;
  }}
  body {{
    font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    margin: 0;
    padding: 1rem 1.25rem 2rem;
    background: var(--bg);
    color: #1a1a1a;
    line-height: 1.55;
    font-size: 14px;
  }}
  h1 {{ font-size: 1.35rem; margin: 0 0 0.5rem 0; }}
  .meta {{ color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }}
  .pair {{
    margin-bottom: 2.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,.06);
  }}
  .pair h2 {{
    margin: 0;
    padding: 0.65rem 1rem;
    font-size: 1rem;
    background: #e8ecf2;
    border-bottom: 1px solid var(--border);
  }}
  .legend {{
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    color: #444;
    background: #f0f3f8;
    border-bottom: 1px solid var(--border);
  }}
  .legend span.mismatch {{ padding: 0.1rem 0.45rem; background: #fff3e0; border-radius: 4px; }}
  .legend span.diffw {{ padding: 0.1rem 0.45rem; background: #fce4ec; border-radius: 4px; text-decoration: underline; text-decoration-color: var(--diff); }}
  .compare-sheet {{
    font-size: 13px;
  }}
  .para-row {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid #e2e8f0;
  }}
  @media (max-width: 900px) {{
    .para-row {{ grid-template-columns: 1fr; }}
    .para-row .para-cell.md {{ border-left: none; border-top: 1px solid #e2e8f0; }}
  }}
  .para-cell {{
    padding: 0.55rem 0.85rem;
    white-space: normal;
    word-break: break-word;
    vertical-align: top;
  }}
  .para-cell.pdf {{ background: var(--pdf-bg); border-right: 1px solid #e2e8f0; }}
  .para-cell.md {{ background: var(--md-bg); }}
  .para-row.mismatch .para-cell {{
    background: #fff8e1;
    box-shadow: inset 0 0 0 1px #ffb74d;
  }}
  .para-cell.empty {{
    color: #888;
    font-style: italic;
    background: #fafafa !important;
    box-shadow: none !important;
  }}
  span.diff {{
    text-decoration: underline;
    text-decoration-color: var(--diff);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }}
  span.empty {{ color: #888; font-style: italic; }}
  .note {{
    margin-top: 2rem;
    padding: 0.75rem 1rem;
    background: #eef2f7;
    border-radius: 6px;
    font-size: 0.85rem;
    color: #444;
  }}
</style>
</head>
<body>
<h1>PDF vs MD 불일치만</h1>
<p class="meta">PDF: {esc(str(pdf_root))}<br>MD: {esc(str(md_dir))}<br>생성: {esc(generated)}<br>
쉼표·마침표로 절을 나눕니다(날짜 2026. 3. 13. 등은 한 덩어리 유지). 절 키가 같은 것은 출력하지 않습니다. 불일치 절은 좌우에 <span class="diff">다른 단어(키 기준)만</span> 나열합니다. 한쪽에만 있는 절은 전문을 둡니다.</p>
{"".join(sections)}
<p class="note">유사도·일치 개수는 표시하지 않습니다. 단어는 공백으로 나눕니다.</p>
</body>
</html>
"""


def main() -> int:
    root = _repo_root()
    pdf_root = root / "행정심판청구(원본)"
    if len(sys.argv) >= 2:
        pdf_root = Path(sys.argv[1]).expanduser().resolve()
    md_dir = latest_yymmdd_md_under(pdf_root)
    out_path = md_dir / "pdf_md_compare_result.html"
    if len(sys.argv) >= 3:
        out_path = Path(sys.argv[2]).expanduser().resolve()

    if not pdf_root.is_dir():
        print(f"폴더 없음: {pdf_root}", file=sys.stderr)
        return 1
    if not md_dir.is_dir():
        print(f"MD 폴더 없음: {md_dir}", file=sys.stderr)
        return 1

    sections: list[str] = []
    esc = html_module.escape

    for pdf_name, md_name in PAIRS:
        pdf_path = pdf_root / pdf_name
        md_path = md_dir / md_name
        head = (
            f'<section class="pair"><h2>{esc(pdf_name)} ↔ {esc(md_name)}</h2>'
        )

        if not pdf_path.is_file() or not md_path.is_file():
            sections.append(
                head
                + '<div class="compare-sheet"><div class="para-row mismatch">'
                f'<div class="para-cell pdf" style="grid-column:1/-1;padding:1rem;">'
                f"파일 누락: PDF={pdf_path.is_file()}, MD={md_path.is_file()}</div></div></div></section>"
            )
            continue

        try:
            raw_pdf = _extract_pdf_text(pdf_path)
        except Exception as e:  # noqa: BLE001
            sections.append(
                head
                + '<div class="compare-sheet"><div class="para-row mismatch">'
                f'<div class="para-cell pdf" style="grid-column:1/-1">PDF 읽기 오류: {esc(str(e))}</div></div></div></section>'
            )
            continue

        try:
            raw_md = md_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raw_md = md_path.read_text(encoding="utf-8-sig")

        n_pdf = _unify_typography(_normalize(raw_pdf, is_md=False))
        n_md = _unify_typography(_normalize(raw_md, is_md=True))
        segs_pdf = _split_clauses(n_pdf)
        segs_md = _split_clauses(n_md)
        pairs = _align_clause_pairs(segs_pdf, segs_md)
        n_mismatch = sum(
            1
            for p, m in pairs
            if (not p and m)
            or (p and not m)
            or (p and m and _strip_for_compare(p) != _strip_for_compare(m))
        )
        body = _render_clause_pairs_html(pairs)
        stats = (
            f'<p style="margin:0;padding:0.35rem 1rem;font-size:0.85rem;color:#555;">'
            f"불일치 절: {n_mismatch}건 · 원본 절 수 PDF {len(segs_pdf)} / MD {len(segs_md)}</p>"
        )
        if body:
            legend = (
                '<div class="legend"><span class="mismatch">불일치만</span>'
                '<span class="diffw">밑줄 = 그 절에서만 다른 단어</span>'
                '<span>좌: PDF · 우: Markdown</span></div>'
                f'<div class="compare-sheet">{body}</div>'
            )
        else:
            legend = ""

        sections.append(head + stats + legend + "</section>")

    generated = date.today().isoformat()
    out_path.write_text(_html_page(sections, pdf_root, md_dir, generated), encoding="utf-8")
    print(f"저장: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
