# -*- coding: utf-8 -*-
"""별지 제1호(증거자료 목록) MD와 `갑호증및법령정보` 실물 파일명 대조표 생성.

  python tools/compare_bylaw1_gab_folder.py

출력(기본): 행정심판청구(제출용)/갑호증및법령정보/별지제1호_갑폴더_대조표.txt
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_BYLAW1 = _REPO / "행정심판청구(원본)" / "260407_별지제1호_증거자료_목록.md"
_GAB_ROOT = _REPO / "행정심판청구(제출용)" / "갑호증및법령정보"
_OUT_DEFAULT = _GAB_ROOT / "별지제1호_갑폴더_대조표.txt"

# 부번 줄: 1-1. [갑 제1-1호증](#1-1)(1967년 항공사진) — 링크 괄호 뒤 설명 괄호
_RE_SUB = re.compile(
    r"^(\d+)-(\d+)\.\s+\[갑 제\1-\2호증\]\([^)]*\)\(([^)]+)\)\s*$"
)

# 파일명 선두: 갑제1-1호증_ 또는 갑제1-1증_ (호 누락 호환)
_RE_FILE = re.compile(
    r"갑제(\d+)-(\d+)(?:호증|증)(?=_|\.)", re.IGNORECASE
)

_MEDIA_EXT = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".mp4",
    ".webp",
    ".gif",
    ".tif",
    ".tiff",
}


def _parse_bylaw1(path: Path) -> list[tuple[str, str]]:
    """(키 '1-1', 별지 호증명 한 줄) 문서 출현 순서."""
    text = path.read_text(encoding="utf-8")
    out: list[tuple[str, str]] = []
    for line in text.splitlines():
        m = _RE_SUB.match(line.strip())
        if not m:
            continue
        a, b, desc = m.group(1), m.group(2), m.group(3).strip()
        key = f"{a}-{b}"
        label = f"갑 제{a}-{b}호증 ({desc})"
        out.append((key, label))
    return out


def _collect_files(root: Path) -> dict[str, list[str]]:
    """키 '1-1' -> 갑호증및법령정보 기준 상대 경로( posix ) 목록."""
    by_key: dict[str, list[str]] = {}
    if not root.is_dir():
        return by_key
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        if p.suffix.lower() not in _MEDIA_EXT:
            continue
        name = unicodedata.normalize("NFC", p.name)
        m = _RE_FILE.search(name)
        if not m:
            continue
        key = f"{int(m.group(1))}-{int(m.group(2))}"
        rel = p.relative_to(root).as_posix()
        by_key.setdefault(key, []).append(rel)
    return by_key


def _table_text(rows: list[tuple[str, str]], sep: str = "\t") -> str:
    lines = ["폴더 파일(갑호증및법령정보 기준 상대경로)" + sep + "별지 제1호 호증명"]
    lines.append("-" * 40 + sep + "-" * 40)
    for left, right in rows:
        lines.append(left + sep + right)
    return "\n".join(lines) + "\n"


def main() -> int:
    if not _BYLAW1.is_file():
        print("없음:", _BYLAW1, file=__import__("sys").stderr)
        return 1
    entries = _parse_bylaw1(_BYLAW1)
    files = _collect_files(_GAB_ROOT)

    rows: list[tuple[str, str]] = []
    used_keys: set[str] = set()

    for key, label in entries:
        used_keys.add(key)
        lst = files.get(key, [])
        if not lst:
            rows.append(("(해당 파일 없음)", label))
        elif len(lst) == 1:
            rows.append((lst[0], label))
        else:
            rows.append((" | ".join(lst), label))

    extra: list[str] = []
    for key, paths in sorted(files.items(), key=lambda x: tuple(map(int, x[0].split("-")))):
        if key in used_keys:
            continue
        for rel in paths:
            extra.append(rel)

    banner = (
        f"# 별지 제1호 ↔ 갑호증및법령정보 폴더 대조 (탭 구분)\n"
        f"# 별지 소스: {_BYLAW1.relative_to(_REPO).as_posix()}\n"
        f"# 생성: tools/compare_bylaw1_gab_folder.py · {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"
    )
    out_lines = [banner, _table_text(rows, sep="\t")]
    if extra:
        out_lines.append("\n[폴더에만 있고 별지 부번과 매칭되지 않은 파일]\n")
        out_lines.append("\n".join(extra) + "\n")

    _OUT_DEFAULT.write_text("".join(out_lines), encoding="utf-8")
    print(_OUT_DEFAULT.relative_to(_REPO))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
