# -*- coding: utf-8 -*-
"""행정심판청구 폴더 전체 전수조사(재귀): 상대경로·크기·확장자 집계.

실행(프로젝트 루트):
  python tools/survey_haengjeong_sipan_full.py

산출(기본):
  행정심판청구(제출용)/최종/작업/루트기록/YYMMDD_행정심판청구_전수조사.txt

갑호증 실물만 보는 경우는 `survey_gab_evidence_full.py` 를 사용한다.
"""
from __future__ import annotations

import argparse
import os
from collections import defaultdict
from datetime import date
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
ROOT = _REPO / "행정심판청구(제출용)"
WORK_LOG = ROOT / "작업" / "루트기록"


def human_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024**2:
        return f"{n / 1024:.1f} KiB"
    if n < 1024**3:
        return f"{n / 1024**2:.1f} MiB"
    return f"{n / 1024**3:.2f} GiB"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "-o",
        "--out",
        type=Path,
        help="출력 txt (기본: 작업/루트기록/YYMMDD_행정심판청구_전수조사.txt)",
    )
    args = ap.parse_args()

    if not ROOT.is_dir():
        print(f"[err] 없음: {ROOT}", file=__import__("sys").stderr)
        return 1

    d = date.today()
    default_out = WORK_LOG / f"{d.strftime('%y%m%d')}_행정심판청구_전수조사.txt"
    out_path = args.out or default_out

    ext_count: dict[str, int] = defaultdict(int)
    ext_bytes: dict[str, int] = defaultdict(int)
    top_counts: dict[str, int] = defaultdict(int)
    top_bytes: dict[str, int] = defaultdict(int)
    all_rows: list[tuple[str, int]] = []

    for dirpath, _dirnames, filenames in os.walk(ROOT, topdown=True):
        for fn in filenames:
            fp = Path(dirpath) / fn
            try:
                st = fp.stat()
            except OSError:
                continue
            size = st.st_size
            rel = str(fp.relative_to(ROOT)).replace("\\", "/")
            suf = fp.suffix.lower() or "(확장자없음)"
            ext_count[suf] += 1
            ext_bytes[suf] += size
            first = rel.split("/")[0] if "/" in rel else "(루트)"
            top_counts[first] += 1
            top_bytes[first] += size
            all_rows.append((rel, size))

    all_rows.sort(key=lambda x: x[0])
    total_files = len(all_rows)
    total_bytes = sum(s for _r, s in all_rows)

    lines: list[str] = []
    lines.append("=== 행정심판청구(제출용)/최종/ 전수조사 (재귀 전체 파일) ===")
    lines.append(f"기준일: {d.isoformat()}")
    lines.append(f"기준 경로: {ROOT}")
    lines.append(f"총 파일 수: {total_files:,}")
    lines.append(f"총 용량: {human_size(total_bytes)} ({total_bytes:,} bytes)")
    lines.append("")
    lines.append("[최상위 폴더별 파일 수·용량]")
    for name in sorted(top_counts.keys(), key=lambda k: (-top_counts[k], k)):
        lines.append(
            f"  {name:40}  {top_counts[name]:6,}건  {human_size(top_bytes[name]):>12}"
        )
    lines.append("")
    lines.append("[확장자별]")
    for ext in sorted(ext_count.keys(), key=lambda e: (-ext_count[e], e)):
        lines.append(
            f"  {ext:14}  {ext_count[ext]:6,}건  {human_size(ext_bytes[ext]):>12}"
        )
    lines.append("")
    lines.append("[전체 파일 목록 — 상대경로 (행정심판청구(제출용)/최종/) 기준)]")
    for rel, size in all_rows:
        lines.append(f"  {human_size(size):>12}  {rel}")
    lines.append("")
    lines.append("— 끝 —")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {total_files} files -> {out_path.relative_to(_REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
