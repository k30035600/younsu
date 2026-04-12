# -*- coding: utf-8 -*-
"""
`행정심판청구(제출용)/최종/갑호증` 하위에서 파일명 앞의 순번만 1부터(또는 00부터) 다시 매깁니다.
해시·본문 파일명(`544851_…`, `6306d0_…` 등)은 유지합니다.

대상 형식
  - 갑9: `NNN_ffffff_나머지` (3자리 + 6자리 16진 + 본문)
  - 갑10(현장)·갑12(의회): `NN_나머지` (맨 앞 두 글자가 숫자이고 세 번째가 `_`인 경우만)

실행(프로젝트 루트 younsu):
  python tools/renumber_gab_evidence_prefixes.py --dry-run
  python tools/renumber_gab_evidence_prefixes.py
"""
from __future__ import annotations

import argparse
import re
import uuid
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
GAB = _REPO / "행정심판청구(제출용)" / "최종" / "갑호증"

# 008_cdc4ee_7-4. 동춘동….jpg
PAT_GAB9 = re.compile(r"^(\d{3})_([a-fA-F0-9]{6})_(.+)$")
# 00_190626_….jpg — 세 번째 문자가 반드시 _
PAT_TWO = re.compile(r"^(\d{2})_(.+)$")


def renumber_gab9(folder: Path, dry_run: bool, log: list[str]) -> int:
    rows: list[tuple[Path, re.Match[str]]] = []
    skipped: list[str] = []
    for p in folder.iterdir():
        if not p.is_file():
            continue
        m = PAT_GAB9.match(p.name)
        if m:
            rows.append((p, m))
        else:
            skipped.append(p.name)
    if skipped:
        log.append(f"SKIP(형식 아님)\t{folder.name}\t{len(skipped)}건 (예: {skipped[0][:60]}…)")

    rows.sort(key=lambda t: (int(t[1].group(1)), t[0].name.lower()))
    return _apply_renames(
        rows,
        lambda i, m: f"{i:03d}_{m.group(2)}_{m.group(3)}",
        dry_run,
        log,
        folder.name,
    )


def renumber_two_digit(folder: Path, dry_run: bool, log: list[str], start_zero: bool) -> int:
    rows: list[tuple[Path, re.Match[str]]] = []
    skipped: list[str] = []
    for p in folder.iterdir():
        if not p.is_file():
            continue
        m = PAT_TWO.match(p.name)
        if m:
            rows.append((p, m))
        else:
            skipped.append(p.name)
    if skipped:
        log.append(f"SKIP(형식 아님)\t{folder.name}\t{len(skipped)}건 (예: {skipped[0][:60]}…)")

    rows.sort(key=lambda t: (int(t[1].group(1)), t[0].name.lower()))
    base = 0 if start_zero else 1

    def name_fn(i: int, m: re.Match[str]) -> str:
        n = base + i - 1
        return f"{n:02d}_{m.group(2)}"

    return _apply_renames(rows, name_fn, dry_run, log, folder.name)


def _apply_renames(
    rows: list[tuple[Path, re.Match[str]]],
    name_fn,
    dry_run: bool,
    log: list[str],
    folder_label: str,
) -> int:
    if not rows:
        return 0
    planned: list[tuple[Path, str]] = []
    for i, (p, m) in enumerate(rows, start=1):
        new_name = name_fn(i, m)
        planned.append((p, new_name))

    n_change = sum(1 for p, n in planned if p.name != n)
    if n_change == 0:
        log.append(f"OK(변경 없음)\t{folder_label}\t{len(rows)}건")
        return 0

    token = uuid.uuid4().hex[:8]
    temps: list[tuple[Path, Path]] = []
    for j, (p, _) in enumerate(planned):
        tmp = p.with_name(f".__rn_{token}_{j:04d}__{p.name}")
        temps.append((p, tmp))

    for (src, new_name), (_, tmp) in zip(planned, temps):
        log.append(f"PLAN\t{folder_label}\t{src.name}\n  -> {new_name}")
    if dry_run:
        return n_change

    for src, tmp in temps:
        src.rename(tmp)
    for (_, new_name), (_, tmp) in zip(planned, temps):
        dest = tmp.parent / new_name
        tmp.rename(dest)
        log.append(f"DONE\t{folder_label}\t{new_name}")

    return n_change


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--only",
        choices=("gab14", "gab9_1", "gab10", "gab12", "all"),
        default="all",
        help="기본 all: 갑14(택지·맹지)·갑9(준공식)·갑10(현장)·갑12(의회) 각각 해당 폴더만 처리",
    )
    args = ap.parse_args()

    log: list[str] = []
    total = 0

    targets: list[tuple[str, Path, str]] = [
        ("gab14", GAB / "첨부(갑제1호증)_연수택지개발사업(맹지배경)", "gab9"),
        ("gab9_1", GAB / "갑제9호증_객관적공법외관(준공식)", "gab9"),
        ("gab10", GAB / "갑제6-3호증_현장_통행관련", "two"),
        ("gab12", GAB / "갑제12호증_연수구의회_225회", "two"),
    ]

    for key, folder, mode in targets:
        if args.only != "all" and args.only != key:
            continue
        if not folder.is_dir():
            log.append(f"SKIP(폴더 없음)\t{folder}")
            continue
        if mode == "gab9":
            total += renumber_gab9(folder, args.dry_run, log)
        else:
            total += renumber_two_digit(folder, args.dry_run, log, start_zero=(key == "gab10"))

    log_path = Path(__file__).resolve().parent / "renumber_gab_evidence_prefixes.log.txt"
    log_path.write_text("\n".join(log), encoding="utf-8")
    print(f"처리: 변경 예정/실행 건수(파일) 약 {total}")
    print(f"로그: {log_path}")
    print("드라이런" if args.dry_run else "적용 완료")


if __name__ == "__main__":
    main()
