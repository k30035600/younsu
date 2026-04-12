# -*- coding: utf-8 -*-
"""선거법위반에서 **2026. 3. 13. 준공식** 사진만 **갑 제9호증** 폴더로 복사.

- **3. 10.~3. 12. 촬영분**은 일반교통방해 등으로 `선거법위반/` 아래(예: `…_일반교통방해` 또는 촬영일별 폴더)에 두고,
  **2026. 3. 13. 준공식**과는 별도 쟁점으로 다룹니다. 본 스크립트는 **`20260313_*.jpg`만** 갑10으로 복사합니다.
- **원본(권장)**: `선거법위반/농원근린공원_촬영일별/README.md` — 촬영일별로
  `YYYYMMDD_농원근린공원_준공식`(3/13 당일) 또는 `YYYYMMDD_농원근린공원_일반교통방해`(3/10~3/12 등) 하위에 JPG를 둡니다.
- **구 방식**: `260313_농원근린공원 준공식` 단일 폴더(하위 README: `README_파일명_규칙.md`).
  (갑 제9-1호증~갑 제9-7호증에 해당하는 파일은 `갑제9호증_객관적공법외관(준공식)/` 내 **동일 파일명**, 나머지는 시간순 `첨부(갑제9호증)_NN_` 접두.)
- 복사 대상: 파일명이 **`20260313_`** 로 시작하는 `.jpg` 만(준공식 당일).
- 이미 같은 원본 파일명(예: `_20260313_125206.jpg`, `_260313_124719.jpg`)으로 끝나는 항목이 **`갑호증` 트리 어딘가의 파일명 접미**로 있으면 건너뜀(갑10 폴더 내 **갑 제9-1호증~갑 제9-7호증** 등 중복 복사 방지).
- 복사 후 **촬영일시** 순으로 `첨부(갑제9호증)_01_`~ 전체 재번호(갑 제9-1~10-7 표준명 `갑제10-…` 제외).
- 대상 폴더: `행정심판청구(제출용)/최종/갑호증/갑제9호증_객관적공법외관(준공식)/`
- 저장 파일명: `첨부(갑제9호증)_NN_260313준공식_YYMMDD_HHMMSS.jpg` (해시 없음, 날짜 6자리). 구명 `첨부_NN_갑제9호증_…`·`갑제9호증_첨부_NN_…` 도 재번호 시 인식.

실행(과거 일회성): 프로젝트 루트에서 `python tools/archive/copy_junggong_photos_to_gab9.py`
      `--dry-run` 이면 복사 없이 목록만 출력합니다.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
import uuid
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
SRC_PARENT = _REPO / "선거법위반"
SRC_PREFIX = "260313_"
GAB_ROOT = _REPO / "행정심판청구(제출용)" / "최종" / "갑호증"
GAB9_PREP = GAB_ROOT / "갑제9호증_객관적공법외관(준공식)"


_DATE_GAB_DIR = re.compile(r"^\d{8}_농원근린공원_(준공식|일반교통방해)$")
# 갑 제9호증: 2026. 3. 13. 준공식 당일만 (3/10~3/12는 선거법위반·일반교통방해 쪽에 둠)
_PICK_JPG = re.compile(r"^20260313_\d+\.jpg$", re.IGNORECASE)


def _dirs_have_pickable_jpg(dirs: list[Path]) -> bool:
    for d in dirs:
        if not d.is_dir():
            continue
        for p in d.iterdir():
            if p.is_file() and p.suffix.lower() == ".jpg" and _PICK_JPG.match(p.name):
                return True
    return False


def _collect_src_dirs() -> list[Path]:
    """`농원근린공원_촬영일별` 하위에 복사 대상 JPG가 있으면 그쪽만, 아니면 구 `260313_…` 단일 폴더."""
    if not SRC_PARENT.is_dir():
        raise FileNotFoundError(f"없음: {SRC_PARENT}")
    parent = SRC_PARENT / "농원근린공원_촬영일별"
    new_dirs: list[Path] = []
    if parent.is_dir():
        for d in sorted(parent.iterdir()):
            if d.is_dir() and _DATE_GAB_DIR.match(d.name):
                new_dirs.append(d)
    if new_dirs and _dirs_have_pickable_jpg(new_dirs):
        return new_dirs
    cands = [d for d in SRC_PARENT.iterdir() if d.is_dir() and d.name.startswith(SRC_PREFIX)]
    if len(cands) == 1:
        return cands
    if len(cands) > 1:
        raise FileNotFoundError(
            f"`{SRC_PREFIX}…` 폴더가 여러 개: {[d.name for d in cands]}"
        )
    raise FileNotFoundError(
        f"원본 없음: `{parent}` 아래 `YYYYMMDD_농원근린공원_(준공식|일반교통방해)`에 "
        f"`20260313_` JPG(준공식 당일)를 두거나, `{SRC_PREFIX}…` 단일 폴더(구 방식)를 두십시오."
    )


def _yyyymmdd_to_yymmdd_in_name(name: str) -> str:
    return re.sub(r"(20\d{6})", lambda m: m.group(1)[2:8], name)


# 현재 표준: 첨부(갑제9호증)_01_260313준공식_260313_092823.jpg
PAT_DEST_UND = re.compile(
    r"^첨부\(갑제9호증\)_(\d{2,3})_260313준공식_(\d{6}_\d{6}\.jpg)$",
    re.IGNORECASE,
)
# 구(언더 접두): 첨부_01_갑제9호증_260313준공식_…
PAT_DEST_UND_LEGACY2 = re.compile(
    r"^첨부_(\d{2,3})_갑제9호증_260313준공식_(\d{6}_\d{6}\.jpg)$",
    re.IGNORECASE,
)
# 구: 갑제9호증_첨부_01_260313준공식_…
PAT_DEST_GAB10_OLD = re.compile(
    r"^갑제9호증_첨부_(\d{2,3})_260313준공식_(\d{6}_\d{6}\.jpg)$",
    re.IGNORECASE,
)
# 구(접두 `_NN_`만): _01_260313준공식_… (재번호 호환)
PAT_DEST_UND_LEGACY = re.compile(
    r"^_(\d{2})_260313준공식_(\d{6}_\d{6}\.jpg)$",
    re.IGNORECASE,
)
# 이전: 001_260313준공식_260310_091454.jpg (재번호·드라이런 호환)
PAT_DEST_NEW = re.compile(
    r"^(\d{3})_260313준공식_(\d{6}_\d{6}\.jpg)$",
    re.IGNORECASE,
)
# 구: NNN_hash_260313준공식_20260310_091454.jpg (재번호 호환)
PAT_DEST_OLD = re.compile(
    r"^(\d{3})_([a-fA-F0-9]{6})_260313준공식_(\d{8}_\d{6}\.jpg)$",
    re.IGNORECASE,
)


def _junggong_dest_tail(name: str) -> str | None:
    """260313준공식_ 이후 tail(촬영일시.jpg) 또는 None."""
    m = PAT_DEST_UND.match(name)
    if m:
        return m.group(2)
    m = PAT_DEST_UND_LEGACY2.match(name)
    if m:
        return m.group(2)
    m = PAT_DEST_GAB10_OLD.match(name)
    if m:
        return m.group(2)
    m = PAT_DEST_UND_LEGACY.match(name)
    if m:
        return m.group(2)
    m = PAT_DEST_NEW.match(name)
    if m:
        return m.group(2)
    m = PAT_DEST_OLD.match(name)
    if m:
        return m.group(3)
    return None


def _seq_prefix_from_index(i: int) -> str:
    """1-based 순번 → `첨부(갑제9호증)_01_` …"""
    if i <= 99:
        return f"첨부(갑제9호증)_{i:02d}_"
    return f"첨부(갑제9호증)_{i:03d}_"


def _tail_sort_key(tail: str) -> str:
    """촬영일시 정렬용. tail 예: 260310_091454.jpg / 20260310_091454.jpg"""
    base = tail.rsplit(".", 1)[0]
    parts = base.split("_", 1)
    if len(parts) != 2:
        return base
    d, t = parts
    if len(d) == 8 and d.isdigit() and d.startswith("20"):
        d = d[2:]
    return f"{d}{t}"


def _already_have_original(evidence_root: Path, orig_name: str) -> bool:
    suf8 = f"_{orig_name}"
    suf6 = f"_{_yyyymmdd_to_yymmdd_in_name(orig_name)}"
    if not evidence_root.is_dir():
        return False
    for p in evidence_root.rglob("*"):
        if not p.is_file():
            continue
        if p.name.endswith(suf8) or p.name.endswith(suf6):
            return True
    return False


def _resequence_by_shoot_date(gab: Path, *, dry_run: bool, log: list[str]) -> None:
    """촬영일시 순으로 `첨부(갑제9호증)_01_260313준공식_…` 재번호."""
    items: list[tuple[str, Path, str]] = []
    for p in gab.iterdir():
        if not p.is_file():
            continue
        tail = _junggong_dest_tail(p.name)
        if tail:
            items.append((_tail_sort_key(tail), p, tail))
    if not items:
        return
    items.sort(key=lambda t: t[0])
    new_names = [
        f"{_seq_prefix_from_index(i)}260313준공식_{tail}"
        for i, (_, _, tail) in enumerate(items, start=1)
    ]
    paths = [p for _, p, _ in items]
    need = sum(1 for p, n in zip(paths, new_names) if p.name != n)
    if dry_run:
        log.append(
            f"[드라이런] 촬영시간 순 재번호: 총 {len(items)}건, 파일명 변경 필요 {need}건"
        )
        return
    if need == 0:
        log.append(f"재번호: 총 {len(items)}건 (이미 시간순·번호 일치)")
        return
    u = uuid.uuid4().hex[:10]
    tmps: list[Path] = []
    for i, p in enumerate(paths):
        tp = gab / f"_tmp_{u}_{i:04d}{p.suffix}"
        p.rename(tp)
        tmps.append(tp)
    for tp, fn in zip(tmps, new_names):
        tp.rename(gab / fn)
    log.append(f"재번호(촬영일시 순): {len(items)}건 (첨부(갑제9호증)_01_~ …)")


def _next_seq(gab9: Path) -> int:
    m = 0
    for p in gab9.iterdir():
        if not p.is_file():
            continue
        u = PAT_DEST_UND.match(p.name)
        if u:
            m = max(m, int(u.group(1)))
            continue
        u = PAT_DEST_UND_LEGACY2.match(p.name)
        if u:
            m = max(m, int(u.group(1)))
            continue
        u = PAT_DEST_GAB10_OLD.match(p.name)
        if u:
            m = max(m, int(u.group(1)))
            continue
        u = PAT_DEST_UND_LEGACY.match(p.name)
        if u:
            m = max(m, int(u.group(1)))
            continue
        t = PAT_DEST_NEW.match(p.name)
        if t:
            m = max(m, int(t.group(1)))
            continue
        t = PAT_DEST_OLD.match(p.name)
        if t:
            m = max(m, int(t.group(1)))
    return m + 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src_dirs = _collect_src_dirs()
    GAB9_PREP.mkdir(parents=True, exist_ok=True)

    jpgs: list[Path] = []
    for src_root in src_dirs:
        jpgs.extend(
            p for p in src_root.iterdir() if p.is_file() and p.suffix.lower() == ".jpg"
        )
    pick: list[Path] = []
    for p in jpgs:
        if _PICK_JPG.match(p.name):
            pick.append(p)
    pick.sort(key=lambda x: x.name)

    if not pick:
        print("복사할 JPG 없음(20260313_ 준공식 당일 패턴만).")
        sys.exit(1)

    to_copy = [p for p in pick if not _already_have_original(GAB_ROOT, p.name)]
    seq = _next_seq(GAB9_PREP)
    log: list[str] = [
        "원본: "
        + ", ".join(str(d.relative_to(_REPO)).replace("\\", "/") for d in src_dirs),
        f"선택: {len(pick)}장 (3/13 준공식 당일만) / 이미 있음 건너뜀 후 신규 복사: {len(to_copy)}장",
        f"(임시) 다음 순번: {seq} (파일명 접두 `첨부(갑제9호증)_{seq:02d}_…`) → 복사 후 촬영시간 순 재번호",
        "",
    ]

    for p in to_copy:
        short_name = _yyyymmdd_to_yymmdd_in_name(p.name)
        dest_name = f"{_seq_prefix_from_index(seq)}260313준공식_{short_name}"
        log.append(f"  + {p.name} -> {dest_name}")
        if not args.dry_run:
            shutil.copy2(p, GAB9_PREP / dest_name)
        seq += 1

    _resequence_by_shoot_date(GAB9_PREP, dry_run=args.dry_run, log=log)

    log_path = _REPO / "행정심판청구(제출용)" / "최종" / "260328_준공식사진_갑9복사_기록.txt"
    log_path.write_text("\n".join(log) + "\n", encoding="utf-8")
    print("\n".join(log))
    print(f"\n기록: {log_path}")
    if args.dry_run:
        print("\n(드라이런 - 복사 및 재번호 미실행)")


if __name__ == "__main__":
    main()
