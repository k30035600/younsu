# -*- coding: utf-8 -*-
"""일회성: 저장소 문자열 `행정심판청구(증거)/` → `행정심판청구(증거)/최종/` 일괄 반영.
   pathlib `... / "행정심판청구(증거)" / "갑호증"` → `... / "최종"` 삽입.
"""
from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OLD_SLASH = "행정심판청구(증거)/"
NEW_SLASH = "행정심판청구(증거)/최종/"
# 이미 `증거/최종/` 인 줄은 다시 넣지 않음
RE_SLASH = re.compile(r"행정심판청구\(증거\)/(?!최종/)")

PY_KEY = '"행정심판청구(증거)" / "'
RE_TRAIL_ONLY = re.compile(
    r'(/\s*)"행정심판청구\(증거\)"(\s*\)\s*(?:#.*)?$)',
    re.MULTILINE,
)

EXT = {".js", ".json", ".py", ".md", ".css", ".html", ".txt", ".mjs", ".cjs"}


def patch_pathlib_segments(s: str) -> str:
    """`... / "행정심판청구(증거)" / "갑호증"` → 최종 삽입(이미 첫 세그먼트가 최종이면 유지)."""
    pos = 0
    chunks: list[str] = []
    while True:
        j = s.find(PY_KEY, pos)
        if j == -1:
            chunks.append(s[pos:])
            break
        chunks.append(s[pos:j])
        after = s[j + len(PY_KEY) :]
        if after.startswith('최종"'):
            end = j + len(PY_KEY) + len("최종") + 1
            chunks.append(s[j:end])
            pos = end
            continue
        chunks.append('"행정심판청구(증거)" / "최종" / "')
        pos = j + len(PY_KEY)
    return "".join(chunks)


def patch_trailing_pathlib(s: str) -> str:
    """`... / "행정심판청구(증거)")` 줄 끝 — 루트만 지정한 경우 `최종` 추가."""

    def repl(m: re.Match[str]) -> str:
        return f'{m.group(1)}"행정심판청구(증거)" / "최종"{m.group(2)}'

    return RE_TRAIL_ONLY.sub(repl, s)


def patch_text(s: str) -> str:
    s = RE_SLASH.sub(NEW_SLASH, s)
    s = patch_pathlib_segments(s)
    s = patch_trailing_pathlib(s)
    return s


def main() -> None:
    changed = 0
    for p in REPO.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in EXT:
            continue
        if "node_modules" in p.parts or ".git" in p.parts or "__pycache__" in p.parts:
            continue
        if p.name == Path(__file__).name:
            continue
        try:
            raw = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        new = patch_text(raw)
        if new != raw:
            p.write_text(new, encoding="utf-8", newline="\n")
            changed += 1
            print(p.relative_to(REPO))
    print(f"done, {changed} files")


if __name__ == "__main__":
    main()
