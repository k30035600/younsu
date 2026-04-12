# -*- coding: utf-8 -*-
"""행정심판청구 트리에서 `첨부_NN_갑제…호증_<6hex>_<본문>` 또는 `첨부(갑제…호증)_<6hex>_` 형태의 6자리 16진 해시 삭제.

- `a-f`를 포함하면 해시로 간주해 제거.
- 숫자만 6자리면 YYMMDD·HHMMSS로 해석 가능한 경우는 제외(예: `_950107_` 관보 날짜).
- `갑제9-1호증_…_260313_124719.jpg` 등은 이 패턴과 무관.

실행(프로젝트 루트): python tools/strip_gab_attach_filename_hashes.py
  --dry-run  이름만 출력, 변경 없음
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
ROOT = _REPO / "행정심판청구(제출용)"

# 첨부_NN_갑제…호증_ 또는 첨부(갑제…호증)_ 직후의 6자리 hex. 날짜·시간 6숫자는 제외 로직 참고.
PAT_LEGACY = re.compile(r"(첨부_\d+_갑제(?:\d+-)?\d+호증)_([0-9a-fA-F]{6})(_)")
PAT_PAREN = re.compile(r"(첨부\(갑제(?:\d+-)?\d+호증\))_([0-9a-fA-F]{6})(_)")


def _looks_like_yymmdd_or_hhmmss(six: str) -> bool:
    """6자리 십진 숫자가 문서용 날짜(YYMMDD) 또는 시각(HHMMSS)으로 쓰일 수 있으면 True."""
    if len(six) != 6 or not six.isdigit():
        return False
    a, b, c = int(six[:2]), int(six[2:4]), int(six[4:6])
    if 1 <= b <= 12 and 1 <= c <= 31:
        return True
    if a <= 23 and b <= 59 and c <= 59:
        return True
    return False


def _should_strip_segment(seg: str) -> bool:
    """해시로 보이면 True. 6자리 16진에 a-f가 있으면 해시. 숫자만이면 날짜·시각이 아닐 때만 제거."""
    if len(seg) != 6:
        return False
    if not re.fullmatch(r"[0-9a-fA-F]{6}", seg):
        return False
    if re.search(r"[a-fA-F]", seg):
        return True
    return not _looks_like_yymmdd_or_hhmmss(seg)


def new_name(filename: str) -> str | None:
    for pat in (PAT_LEGACY, PAT_PAREN):
        m = pat.search(filename)
        if not m:
            continue
        seg = m.group(2)
        if not _should_strip_segment(seg):
            continue
        n = pat.sub(r"\1\3", filename, count=1)
        if n != filename:
            return n
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ops: list[tuple[Path, str]] = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        nn = new_name(p.name)
        if nn is None:
            continue
        dest = p.with_name(nn)
        ops.append((p, nn))
        if dest.exists() and dest != p:
            raise SystemExit(f"충돌: 이미 존재함 {dest}")

    log_lines = [f"대상: {len(ops)}건", ""]
    for p, nn in ops:
        rel = p.relative_to(_REPO)
        log_lines.append(f"{rel}")
        log_lines.append(f"  -> {nn}")
        if not args.dry_run:
            p.rename(p.parent / nn)

    out = _REPO / "행정심판청구(제출용)" / "최종" / "260401_파일명_해시제거_기록.txt"
    text = "\n".join(log_lines) + "\n"
    print(text)
    if ops and not args.dry_run:
        out.write_text(text, encoding="utf-8")
        print(f"기록: {out}")
    elif not ops:
        print("(변경 없음 — 기록 파일 미갱신)")
    elif args.dry_run:
        print("(드라이런 — 이름 변경·기록 파일 쓰기 없음)")


if __name__ == "__main__":
    main()
