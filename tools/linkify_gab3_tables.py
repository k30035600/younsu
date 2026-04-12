# -*- coding: utf-8 -*-
"""별지_갑3호증.md HTML 표 <td> 안 '갑 제…호증' → <a href='#…'>.

재실행하면 이중 <a>가 생기므로, 이미 변환된 파일은 건너뜁니다. 강제 시: python linkify_gab3_tables.py --force
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
P_GAB3 = _REPO / "web" / "commission-portal" / "public" / "source" / "별지_갑3호증.md"

NEEDLE = (
    "검수는 **`행정심판청구(원본)/260405(인천행심위)/260405_갑호증_검수보고.md`**(있을 때) 참조.\n\n---"
)
INSERT = """검수는 **`행정심판청구(원본)/260405(인천행심위)/260405_갑호증_검수보고.md`**(있을 때) 참조.

**포털 열람(갑호증 링크):** 아래 표 **근거** 열의 갑 표기는 `<a href="#N-M">`로 저장소 파일과 연결됩니다(탭 **별지 제1호** 목록과 동일 앵커). 주호증 묶음: [갑 제1호증](#1) · [갑 제2호증](#2) · [갑 제3호증](#3) · [갑 제4호증](#4) · [갑 제5호증](#5) · [갑 제6호증](#6) · [갑 제7호증](#7) · [갑 제8호증](#8) · [갑 제9호증](#9) · [갑 제10호증](#10) · [갑 제11호증](#11) · [갑 제12호증](#12) · [갑 제13호증](#13) · [갑 제14호증](#14).

---"""


def link_line(line: str) -> str:
    if "<td>" not in line or "갑 제" not in line:
        return line
    if '<a href="#' in line:
        return line

    def repl(m: re.Match[str]) -> str:
        a, b = m.group(1), m.group(2)
        if b:
            return f'<a href="#{a}-{b}">갑 제{a}-{b}호증</a>'
        return f'<a href="#{a}">갑 제{a}호증</a>'

    line = re.sub(r"갑 제(\d+)(?:-(\d+))?호증", repl, line)
    line = re.sub(
        r'(?<!">)갑 제(\d+)·(\d+)호증',
        r'<a href="#\1">갑 제\1호증</a>·<a href="#\2">갑 제\2호증</a>',
        line,
    )
    return line


def main() -> None:
    force = "--force" in sys.argv
    t = P_GAB3.read_text(encoding="utf-8")
    if not force and '<a href="#2-1">갑 제2-1호증</a>' in t:
        print("skip: 이미 링크 처리됨 (--force 로 재실행)")
        return
    lines = t.splitlines()
    out = "\n".join(link_line(L) for L in lines)
    if NEEDLE in out:
        out = out.replace(NEEDLE, INSERT, 1)
    else:
        raise SystemExit("NEEDLE not found — 별지3 상단 문단 확인")
    P_GAB3.write_text(out, encoding="utf-8")
    print("OK", P_GAB3)


if __name__ == "__main__":
    main()
