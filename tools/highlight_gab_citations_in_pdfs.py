# -*- coding: utf-8 -*-
"""청구서·신청서 MD에서 `[갑 제N호증]` 근처 인용문을 찾아, 해당 갑호증 PDF에 형광펜+밑줄 주석을 추가한다.

- **진하게(Bold)**: PDF 표준 주석만으로는 본문 글꼴을 굵게 바꾸기 어려워, **형광펜(강조)** 으로 대체한다.
- **기존 밑줄·형광펜·물결·취소선 주석**은 처리 전에 제거한다(링크·주석 위젯은 유지).
- 인용문은 같은 줄에 있는 큰따옴표 `"…"` (길이 이상) 및 `**"…"**` 에서 추출한다.
- PDF 텍스트 레이어와 청구서 문장이 **한 글자라도 다르면** `search_for` 가 실패할 수 있다(줄바꿈·띄어쓰기·전각 등). `--dry-run` 으로 매칭을 먼저 확인할 것.

의존성: pip install pymupdf

실행(프로젝트 루트):
  python tools/highlight_gab_citations_in_pdfs.py --dry-run
  python tools/highlight_gab_citations_in_pdfs.py --apply --backup

기본 갑호증 루트: `행정심판청구(증거)/최종/갑호증` (없으면 `행정심판청구(증거)/갑호증`).
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]

GAB_REF = re.compile(r"\[갑 제(\d+(?:-\d+)?)호증\]\([^)]+\)")
# 큰따옴표 인용(청구서 본문)
QUOTE_PLAIN = re.compile(r'"([^"]+)"')
QUOTE_BOLD = re.compile(r'\*\*"([^"]+)"\*\*')

# 제거할 주석 유형 (pymupdf)
_STRIP_ANNOT_TYPES: tuple[int, ...] | None = None


def _strip_types() -> tuple[int, ...]:
    global _STRIP_ANNOT_TYPES
    if _STRIP_ANNOT_TYPES is not None:
        return _STRIP_ANNOT_TYPES
    import fitz

    _STRIP_ANNOT_TYPES = (
        fitz.PDF_ANNOT_HIGHLIGHT,
        fitz.PDF_ANNOT_UNDERLINE,
        fitz.PDF_ANNOT_SQUIGGLY,
        fitz.PDF_ANNOT_STRIKEOUT,
    )
    return _STRIP_ANNOT_TYPES


def _resolve_gab_root(explicit: Path | None) -> Path:
    if explicit is not None:
        return explicit.resolve()
    for rel in (
        "행정심판청구(증거)/최종/갑호증",
        "행정심판청구(증거)/갑호증",
    ):
        p = _REPO / rel
        if p.is_dir():
            return p.resolve()
    return (_REPO / "행정심판청구(증거)/최종/갑호증").resolve()


def _collect_quotes_from_line(line: str, min_len: int) -> list[str]:
    out: list[str] = []
    for m in QUOTE_BOLD.finditer(line):
        t = m.group(1).strip()
        if len(t) >= min_len:
            out.append(t)
    for m in QUOTE_PLAIN.finditer(line):
        t = m.group(1).strip()
        if len(t) >= min_len:
            out.append(t)
    return out


def extract_exhibit_quotes(
    md_paths: list[Path],
    min_len: int,
    context_lines: int = 2,
) -> dict[str, set[str]]:
    """exhibit_key '5-1' -> 인용 문자열 집합.

    `[갑 제N호증]` 이 있는 줄과, 그 위·아래 ``context_lines`` 줄 안의 큰따옴표 인용을 묶는다.
    """
    bucket: dict[str, set[str]] = defaultdict(set)
    for md_path in md_paths:
        if not md_path.is_file():
            continue
        lines = md_path.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            if "[갑 제" not in line or "호증]" not in line:
                continue
            keys = [m.group(1) for m in GAB_REF.finditer(line)]
            if not keys:
                continue
            lo = max(0, i - context_lines)
            hi = min(len(lines), i + context_lines + 1)
            window = "\n".join(lines[lo:hi])
            quotes = _collect_quotes_from_line(window, min_len)
            if not quotes:
                continue
            for k in keys:
                for q in quotes:
                    bucket[k].add(q)
    return dict(bucket)


def _pdf_candidates_for_exhibit(gab_root: Path, exhibit_key: str) -> list[Path]:
    """파일명이 `갑제{key}호증` 으로 시작하는 PDF (하위 폴더 포함)."""
    prefix = f"갑제{exhibit_key}호증"
    found: list[Path] = []
    for p in gab_root.rglob("*.pdf"):
        if p.name.startswith(prefix):
            found.append(p)
    found.sort(key=lambda x: str(x))
    return found


def _normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


def _search_variants(quote: str) -> list[str]:
    raw = quote.strip()
    variants = [raw, _normalize_ws(raw)]
    # 공백 제거 버전(일부 PDF)
    no_space = re.sub(r"\s+", "", raw)
    if no_space != raw and len(no_space) >= 8:
        variants.append(no_space)
    out: list[str] = []
    seen: set[str] = set()
    for v in variants:
        if v and v not in seen and len(v) >= 4:
            seen.add(v)
            out.append(v)
    return out


def _strip_markup_annots(page) -> int:
    removed = 0
    try:
        annots = list(page.annots())
    except (RuntimeError, TypeError, ValueError):
        return 0
    for annot in annots:
        try:
            if annot.type in _strip_types():
                page.delete_annot(annot)
                removed += 1
        except (RuntimeError, ValueError):
            pass
    return removed


def _apply_quotes_to_pdf(
    pdf_path: Path,
    quotes: set[str],
    dry_run: bool,
    backup: bool,
) -> tuple[int, int, int]:
    """반환: (제거한 주석 수, 성공한 검색 횟수, 실패한 인용 수)"""
    import fitz

    if dry_run:
        hits = 0
        miss = 0
        doc = fitz.open(pdf_path)
        try:
            for q in quotes:
                ok = False
                for variant in _search_variants(q):
                    for page in doc:
                        r = page.search_for(variant)
                        if r:
                            ok = True
                            hits += len(r)
                            break
                    if ok:
                        break
                if not ok:
                    miss += 1
        finally:
            doc.close()
        return 0, hits, miss

    if backup:
        bak = pdf_path.with_suffix(pdf_path.suffix + ".bak")
        if not bak.is_file():
            shutil.copy2(pdf_path, bak)

    doc = fitz.open(pdf_path)
    stripped = 0
    tmp: Path | None = None
    try:
        for page in doc:
            stripped += _strip_markup_annots(page)

        miss = 0
        hit_rects = 0
        for q in quotes:
            placed = False
            for variant in _search_variants(q):
                if placed:
                    break
                for page in doc:
                    rects = page.search_for(variant)
                    if not rects:
                        continue
                    for rect in rects:
                        try:
                            hl = page.add_highlight_annot(rect)
                            hl.set_colors(stroke=[1, 1, 0.5], fill=[1, 1, 0.4])
                            hl.update()
                        except (RuntimeError, ValueError):
                            pass
                        try:
                            ul = page.add_underline_annot(rect)
                            ul.update()
                        except (RuntimeError, ValueError):
                            pass
                        hit_rects += 1
                    placed = True
                    break
            if not placed:
                miss += 1
        tmp = pdf_path.with_suffix(".tmp_highlight.pdf")
        doc.save(tmp, garbage=4, deflate=True)
    finally:
        doc.close()
    if tmp is not None and tmp.is_file():
        tmp.replace(pdf_path)

    return stripped, hit_rects, miss


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--md01",
        type=Path,
        default=_REPO / "행정심판청구(최종)" / "260405" / "260405_01_행정심판청구서.md",
        help="청구서 MD",
    )
    ap.add_argument(
        "--md02",
        type=Path,
        default=_REPO / "행정심판청구(최종)" / "260405" / "260405_02_집행정지신청서.md",
        help="집행정지 신청서 MD",
    )
    ap.add_argument("--gab-root", type=Path, default=None, help="갑호증 루트(기본: 자동 탐지)")
    ap.add_argument("--min-quote-len", type=int, default=14, help='인용으로 볼 최소 글자 수(큰따옴표 안)')
    ap.add_argument(
        "--context-lines",
        type=int,
        default=2,
        metavar="N",
        help="갑 호증 링크 줄 기준 위·아래 N줄까지 인용문 검색",
    )
    ap.add_argument("--dry-run", action="store_true", help="주석 추가 없이 매칭만 검사")
    ap.add_argument("--apply", action="store_true", help="실제 PDF 수정")
    ap.add_argument(
        "--backup",
        action="store_true",
        help="--apply 시 같은 폴더에 .pdf.bak 복사(이미 있으면 생략)",
    )
    args = ap.parse_args()

    if not args.dry_run and not args.apply:
        print("실행 모드를 지정하세요: --dry-run 또는 --apply", file=sys.stderr)
        return 2

    try:
        import fitz  # noqa: F401
    except ImportError:
        print("pymupdf 필요: pip install pymupdf", file=sys.stderr)
        return 1

    gab_root = _resolve_gab_root(args.gab_root)
    if not gab_root.is_dir():
        print("갑호증 폴더 없음:", gab_root, file=sys.stderr)
        return 1

    md_list = [args.md01, args.md02]
    bucket = extract_exhibit_quotes(md_list, args.min_quote_len, args.context_lines)

    print("갑호증 루트:", gab_root.relative_to(_REPO))
    print("MD:", ", ".join(p.name for p in md_list if p.is_file()))
    print("호증별 인용문 수:", {k: len(v) for k, v in sorted(bucket.items(), key=lambda x: x[0])})

    total_miss = 0
    total_hit = 0
    for key in sorted(bucket.keys(), key=lambda x: [int(p) for p in x.replace("-", " ").split()]):
        quotes = bucket[key]
        pdfs = _pdf_candidates_for_exhibit(gab_root, key)
        if not pdfs:
            print(f"  [skip] 갑제{key}호증*.pdf 없음 (인용 {len(quotes)}건)")
            continue
        for pdf in pdfs:
            st, hits, miss = _apply_quotes_to_pdf(pdf, quotes, args.dry_run, args.backup)
            rel = pdf.relative_to(_REPO)
            mode = "DRY" if args.dry_run else "OK"
            if args.dry_run:
                print(f"  [{mode}] {rel}  검색히트={hits}  미매칭인용={miss}/{len(quotes)}")
            else:
                print(
                    f"  [{mode}] {rel}  제거주석={st}  추가히트={hits}  미매칭인용={miss}/{len(quotes)}"
                )
            total_hit += hits
            total_miss += miss

    print("합계: 검색 히트", total_hit, " 미매칭 인용", total_miss)
    if args.dry_run:
        print("\n미매칭이 많으면 min-quote-len 조정 또는 PDF 텍스트 레이어를 확인하세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
