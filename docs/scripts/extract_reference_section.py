# -*- coding: utf-8 -*-
"""`## [참고]` 이하를 별도 Markdown으로 추출한다.

행정심판 청구서에서 **[참고]를 본문과 분리**해 별지·별첨용 md로 둘 때 사용합니다.
출력은 **`docs/{yymmdd}/(원본파일명)_참고추출.md`** (기본, `yymmdd`는 입력 파일명 접두 또는 `--yymmdd`).

## 사용

  python docs/scripts/extract_reference_section.py
  python docs/scripts/extract_reference_section.py --input 행정심판청구(최종)/260404_01_행정심판청구서_최종.md
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
_YYMMDD_FROM_STEM = re.compile(r"^(\d{6})_")
DEFAULT_MARKER = "## [참고]"


def _docs_out_dir(inp: Path, yymmdd_override: str | None) -> Path:
    if yymmdd_override:
        return _REPO / "docs" / yymmdd_override.strip()
    m = _YYMMDD_FROM_STEM.match(inp.name)
    if m:
        return _REPO / "docs" / m.group(1)
    return _REPO / "docs" / "260404"


def extract_reference_section(
    md_path: Path,
    marker: str = DEFAULT_MARKER,
) -> str | None:
    text = md_path.read_text(encoding="utf-8")
    lines = text.replace("\r\n", "\n").split("\n")
    for i, line in enumerate(lines):
        if line.strip() == marker.strip():
            body = "\n".join(lines[i:])
            return body
    return None


def main() -> None:
    ap = argparse.ArgumentParser(
        description="## [참고] 이하 추출 → 별도 md"
    )
    ap.add_argument(
        "--input",
        "-i",
        type=Path,
        default=_REPO / "행정심판청구(최종)" / "260404_01_행정심판청구서_최종.md",
        help="원본 Markdown",
    )
    ap.add_argument(
        "--output-md",
        "-o",
        type=Path,
        default=None,
        help="추출 md 경로(기본: docs/{yymmdd}/(입력파일명)_참고추출.md)",
    )
    ap.add_argument(
        "--yymmdd",
        default=None,
        metavar="YYMMDD",
        help="출력 폴더 docs/YYMMDD/ (미지정 시 입력 파일명의 6자리 접두)",
    )
    ap.add_argument("--marker", default=DEFAULT_MARKER, help="시작 줄(정확히 일치)")
    args = ap.parse_args()

    inp = args.input
    if not inp.is_file():
        print("파일 없음:", inp, file=sys.stderr)
        sys.exit(1)

    extracted = extract_reference_section(inp, args.marker)
    if extracted is None:
        print("표시를 찾지 못함:", repr(args.marker), "in", inp, file=sys.stderr)
        sys.exit(2)

    docs_out = _docs_out_dir(inp, args.yymmdd)
    out_md = args.output_md
    if out_md is None:
        docs_out.mkdir(parents=True, exist_ok=True)
        out_md = docs_out / f"{inp.stem}_참고추출.md"

    if not out_md.is_absolute():
        out_md = (_REPO / out_md).resolve()

    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(extracted.strip() + "\n", encoding="utf-8")
    print("작성:", out_md.relative_to(_REPO))


if __name__ == "__main__":
    main()
