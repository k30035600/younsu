# -*- coding: utf-8 -*-
"""
마크다운에서 빈 줄(공백만 있는 줄)을 구분선 `---`로 바꿉니다.
- ``` 펜스 코드 블록 안은 변경하지 않습니다.
- 기본: 연속 빈 줄 1줄 이상을 같은 개수의 `---` 줄로 치환합니다.
- 목록·들여쓴 단락 붕괴를 줄이려면 --min-run 2 로 «빈 줄 2개 이상»만 치환합니다.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path


def transform_outside_fences(text: str, min_run: int) -> str:
    parts = re.split(r"(^```[\s\S]*?^```\s*$)", text, flags=re.MULTILINE)
    out: list[str] = []
    for i, seg in enumerate(parts):
        if seg.startswith("```"):
            out.append(seg)
        else:
            out.append(_replace_empty_runs(seg, min_run))
    return "".join(out)


def collapse_blanks_between_hr_lines(s: str) -> str:
    """연속된 `---` 줄 사이의 빈 줄을 한 줄로 줄입니다."""
    changed = True
    while changed:
        changed = False
        n = re.sub(r"(^---)\s*\n{2,}(?=^---\s*$)", r"\1\n", s, flags=re.MULTILINE)
        if n != s:
            changed = True
            s = n
    return s


def _replace_empty_runs(s: str, min_run: int) -> str:
    lines = s.split("\n")
    result: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip() == "":
            j = i
            while j < len(lines) and lines[j].strip() == "":
                j += 1
            k = j - i
            if k >= min_run:
                for _ in range(k):
                    result.append("---")
            else:
                result.extend(lines[i:j])
            i = j
        else:
            result.append(line)
            i += 1
    return "\n".join(result)


def main() -> None:
    p = argparse.ArgumentParser(description="Replace blank lines with --- in Markdown (outside ``` fences).")
    p.add_argument("paths", nargs="+", type=Path, help="Markdown files")
    p.add_argument("--min-run", type=int, default=1, help="Minimum consecutive empty lines to replace (default: 1)")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--collapse-hr",
        action="store_true",
        help="연속 --- 줄 사이의 빈 줄만 제거(정리용)",
    )
    args = p.parse_args()
    if args.min_run < 1:
        raise SystemExit("--min-run must be >= 1")

    for path in args.paths:
        raw = path.read_text(encoding="utf-8")
        new = transform_outside_fences(raw, args.min_run)
        if args.collapse_hr:
            new = collapse_blanks_between_hr_lines(new)
        if new != raw:
            print(f"{'[dry-run] ' if args.dry_run else ''}update: {path}")
            if not args.dry_run:
                path.write_text(new, encoding="utf-8", newline="\n")
        else:
            print(f"unchanged: {path}")


if __name__ == "__main__":
    main()
