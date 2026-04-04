# -*- coding: utf-8 -*-
"""행정심판청구 트리 파일명의 날짜 표기를 yymmdd(6자리)로 통일.

변환:
  - yyyy-mm-dd_nnn   → yymmdd_nnn
  - yyyy-mm-dd       → yymmdd
  - yyyymmdd (8자리, 19xx/20xx·월·일 유효 범위) → yymmdd

폴더명은 건드리지 않고 파일만 처리합니다.

실행(프로젝트 루트): python tools/normalize_evidence_filename_dates_yymmdd.py
  --dry-run  출력만
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
ROOT = _REPO / "행정심판청구(증거)"

# 긴 패턴 먼저: yyyy-mm-dd_nnn
PAT_YMD_N = re.compile(r"(\d{4})-(\d{2})-(\d{2})_(\d+)")
PAT_YMD = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
# 19xx/20xx + MM + DD (대략적 달력 검증)
PAT_YMD8 = re.compile(
    r"(?<![0-9])((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])(?![0-9])"
)


def _to_yymmdd(y: str, m: str, d: str) -> str:
    return y[2:4] + m + d


def new_filename(name: str) -> str:
    n = PAT_YMD_N.sub(lambda m: f"{_to_yymmdd(m.group(1), m.group(2), m.group(3))}_{m.group(4)}", name)
    n = PAT_YMD.sub(lambda m: _to_yymmdd(m.group(1), m.group(2), m.group(3)), n)
    n = PAT_YMD8.sub(lambda m: _to_yymmdd(m.group(1), m.group(2), m.group(3)), n)
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ops: list[tuple[Path, str]] = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        nn = new_filename(p.name)
        if nn == p.name:
            continue
        dest = p.with_name(nn)
        ops.append((p, nn))

    # 충돌 검사 (동일 폴더에서 서로 다른 파일이 같은 이름으로 수렴)
    seen: dict[Path, Path] = {}
    for p, nn in ops:
        key = p.parent / nn
        if key in seen and seen[key] != p:
            raise SystemExit(f"이름 충돌: {seen[key]} 와 {p} → {nn}")
        seen[key] = p

    lines = [f"대상: {len(ops)}건", ""]
    for p, nn in ops:
        lines.append(str(p.relative_to(_REPO)))
        lines.append(f"  -> {nn}")
        if not args.dry_run:
            p.rename(p.parent / nn)

    text = "\n".join(lines) + "\n"
    print(text)
    out = ROOT / "260401_파일명_날짜_yymmdd_통일_기록.txt"
    if ops and not args.dry_run:
        out.write_text(text, encoding="utf-8")
        print(f"기록: {out}")
    elif not ops:
        print("(변경 없음)")
    elif args.dry_run:
        print("(드라이런 — 이름 변경·기록 없음)")


if __name__ == "__main__":
    main()
