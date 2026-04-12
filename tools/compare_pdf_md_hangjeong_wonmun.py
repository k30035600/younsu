# -*- coding: utf-8 -*-
"""행정심판청구(원본) 폴더의 PDF와 대응 MD를 텍스트 정규화 후 비교해 txt로 저장합니다."""
from __future__ import annotations

import re
import sys
import unicodedata
from datetime import date
from difflib import SequenceMatcher, unified_diff
from pathlib import Path

from pypdf import PdfReader

from wonmun_paths import latest_yymmdd_md_under

# (pdf 파일명, md 파일명) — 폴더 내 실제 파일명과 일치해야 함
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


def main() -> int:
    root = _repo_root()
    pdf_root = root / "행정심판청구(원본)"
    if len(sys.argv) >= 2:
        pdf_root = Path(sys.argv[1]).expanduser().resolve()
    md_dir = latest_yymmdd_md_under(pdf_root)
    out_path = md_dir / "pdf_md_compare_result.txt"
    if len(sys.argv) >= 3:
        out_path = Path(sys.argv[2]).expanduser().resolve()

    if not pdf_root.is_dir():
        print(f"폴더 없음: {pdf_root}", file=sys.stderr)
        return 1
    if not md_dir.is_dir():
        print(f"MD 폴더 없음: {md_dir}", file=sys.stderr)
        return 1

    lines_out: list[str] = []
    lines_out.append(f"PDF vs MD 비교 결과")
    lines_out.append(f"PDF: {pdf_root}")
    lines_out.append(f"MD: {md_dir}")
    lines_out.append(f"생성일: {date.today().isoformat()}")
    lines_out.append("")

    for pdf_name, md_name in PAIRS:
        pdf_path = pdf_root / pdf_name
        md_path = md_dir / md_name
        lines_out.append("=" * 72)
        lines_out.append(f"쌍: {pdf_name}  <->  {md_name}")
        lines_out.append("=" * 72)

        if not pdf_path.is_file():
            lines_out.append(f"[오류] PDF 없음: {pdf_path.name}")
            lines_out.append("")
            continue
        if not md_path.is_file():
            lines_out.append(f"[오류] MD 없음: {md_path.name}")
            lines_out.append("")
            continue

        try:
            raw_pdf = _extract_pdf_text(pdf_path)
        except Exception as e:  # noqa: BLE001
            lines_out.append(f"[오류] PDF 읽기 실패: {e}")
            lines_out.append("")
            continue

        try:
            raw_md = md_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raw_md = md_path.read_text(encoding="utf-8-sig")

        n_pdf = _normalize(raw_pdf, is_md=False)
        n_md = _normalize(raw_md, is_md=True)

        lines_out.append(
            f"원문 길이(문자): PDF {len(raw_pdf)} / MD {len(raw_md)} | "
            f"정규화 후: PDF {len(n_pdf)} / MD {len(n_md)}"
        )
        ratio = SequenceMatcher(None, n_pdf, n_md).ratio()
        lines_out.append(f"정규화 문자열 유사도(SequenceMatcher.ratio): {ratio:.4f}")
        lines_out.append("")

        pdf_lines = n_pdf.split("\n") if n_pdf else [""]
        md_lines = n_md.split("\n") if n_md else [""]
        diff = unified_diff(
            md_lines,
            pdf_lines,
            fromfile=f"MD(정규화) {md_name}",
            tofile=f"PDF(추출·정규화) {pdf_name}",
            lineterm="",
        )
        diff_list = list(diff)
        lines_out.append(f"unified diff 줄 수: {len(diff_list)}")
        lines_out.extend(diff_list)
        lines_out.append("")

    out_path.write_text("\n".join(lines_out) + "\n", encoding="utf-8")
    print(f"저장: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
