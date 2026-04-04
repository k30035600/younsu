# -*- coding: utf-8 -*-
r"""정본 MD 안의 `갑 제N호증`·`갑 제N-M호증` 표기를 마크다운 링크로 감쌉니다.

포털(commission-portal)은 `[갑 제4-1호증](#4-1)` 형식을 cite-ref로 승격해
더블클릭 시 오른쪽 패널에 호증 파일을 엽니다. 플레인 텍스트만 두어도
decorateCiteLinks가 잡는 경우가 많으나, 제출본·가독성을 위해 링크를
명시하는 것이 안전합니다.

- 코드 펜스( ``` … ``` ) 안은 변경하지 않습니다.
- 이미 대괄호로 시작하는 기존 링크 안의 표기는 건너뜁니다 (negative lookbehind).

프로젝트 루트에서:

  python docs/scripts/wrap_gab_cite_links_in_md.py 행정심판청구(최종)/260404_01_행정심판청구서_최종.md
  python docs/scripts/wrap_gab_cite_links_in_md.py --apply 행정심판청구(최종)/260404_01_행정심판청구서_최종.md
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]

# ``` … ``` 펜스(첫 줄에 언어 태그 가능)
_FENCE_BLOCK = re.compile(r"^```[^\n]*\r?\n[\s\S]*?^```\s*$", re.MULTILINE)
_GAB_CITE = re.compile(r"(?<!\[)갑 제(\d+(?:-\d+)?)호증")


def _wrap_prose(segment: str) -> tuple[str, int]:
    n = 0

    def repl(m: re.Match[str]) -> str:
        nonlocal n
        key = m.group(1)
        n += 1
        return f"[갑 제{key}호증](#{key})"

    return _GAB_CITE.sub(repl, segment), n


def transform(text: str) -> tuple[str, int]:
    total = 0
    parts: list[str] = []
    last = 0
    for m in _FENCE_BLOCK.finditer(text):
        s, c = _wrap_prose(text[last : m.start()])
        total += c
        parts.append(s)
        parts.append(m.group(0))
        last = m.end()
    s, c = _wrap_prose(text[last:])
    total += c
    parts.append(s)
    return "".join(parts), total


def main() -> int:
    ap = argparse.ArgumentParser(description="갑 호증 표기 → [갑 제N-M호증](#N-M) 링크")
    ap.add_argument("paths", nargs="+", type=str, help="MD 파일 경로(루트 기준)")
    ap.add_argument("--apply", action="store_true", help="파일 덮어쓰기(기본은 건수만)")
    args = ap.parse_args()

    for rel in args.paths:
        p = Path(rel)
        if not p.is_absolute():
            p = _REPO / p
        if not p.is_file():
            print(f"skip (없음): {p}", file=sys.stderr)
            continue
        raw = p.read_text(encoding="utf-8")
        new, count = transform(raw)
        print(f"{p.relative_to(_REPO)}: 치환 {count}건")
        if args.apply:
            if new != raw:
                p.write_text(new, encoding="utf-8", newline="\n")
                print("  → 저장함")
            else:
                print("  (변경 없음)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
