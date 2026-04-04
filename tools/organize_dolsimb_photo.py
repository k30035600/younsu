# -*- coding: utf-8 -*-
"""돌심방사진을 기준(YYMM_ 하위 폴더 규칙)으로 kcs 등 평평한 폴더의 파일을 분류·이동한다.

파일명 규칙:
- YYYYMMDD_HHMMSS.ext → 돌심방사진/YYMM_/파일명
- 숫자만.jpg (13자리 ms 에포크) → 날짜 환산 후 YYMM_
- png_*.png 등 그 외 → 돌심방사진/_기타_파일명기준미적용/ (또는 --misc-folder)

실행(프로젝트 루트):
  python tools/organize_dolsimb_photo.py --dry-run
  python tools/organize_dolsimb_photo.py --execute
"""
from __future__ import annotations

import argparse
import filecmp
import os
import re
import shutil
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
DEFAULT_BASE = _REPO / "돌심방사진"
DEFAULT_SOURCE = _REPO / "돌심방사진-kcs30035600"

_RE_STD = re.compile(
    r"^(?P<y>\d{4})(?P<m>\d{2})(?P<d>\d{2})[_-](?P<h>\d{2})(?P<mi>\d{2})(?P<s>\d{2})",
    re.I,
)
_RE_SHORT = re.compile(r"^(?P<y>\d{4})(?P<m>\d{2})(?P<d>\d{2})[_-]")
_RE_EPOCH_MS = re.compile(r"^(\d{13})\.(?P<ext>[a-z0-9]+)$", re.I)


def _yymm_from_dt(dt: datetime) -> str:
    return f"{dt.year % 100:02d}{dt.month:02d}_"


def target_folder_for_file(name: str, mtime: float | None) -> tuple[str | None, str]:
    """Returns (relative_folder_name like '2410_', reason) or (None, reason) if unknown."""
    stem = Path(name).name

    m = _RE_STD.match(stem)
    if m:
        y, mo = int(m.group("y")), int(m.group("m"))
        return f"{y % 100:02d}{mo:02d}_", "YYYYMMDD_HHMMSS"

    m2 = _RE_SHORT.match(stem)
    if m2:
        y, mo = int(m2.group("y")), int(m2.group("m"))
        return f"{y % 100:02d}{mo:02d}_", "YYYYMMDD_"

    m3 = _RE_EPOCH_MS.match(stem)
    if m3:
        ms = int(m3.group(1))
        try:
            dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
            return _yymm_from_dt(dt), "epoch_ms_filename"
        except (OSError, OverflowError, ValueError):
            pass

    if mtime is not None:
        try:
            dt = datetime.fromtimestamp(mtime)
            return _yymm_from_dt(dt), "file_mtime"
        except (OSError, OverflowError, ValueError):
            pass

    return None, "unclassified"


def unique_dest(dest: Path) -> Path:
    if not dest.exists():
        return dest
    p = dest
    n = 1
    while p.exists():
        p = dest.with_stem(f"{dest.stem}_dup{n}")
        n += 1
    return p


def _unlock_for_delete(path: Path) -> None:
    """Windows 읽기 전용 등으로 unlink 실패할 때 권한 완화."""
    try:
        mode = path.stat().st_mode
        os.chmod(path, mode | stat.S_IWRITE)
    except OSError:
        pass


def _same_file(a: Path, b: Path) -> bool:
    try:
        if a.stat().st_size != b.stat().st_size:
            return False
    except OSError:
        return False
    return filecmp.cmp(a, b, shallow=False)


def run(
    base: Path,
    source: Path,
    *,
    misc_folder: str,
    dry_run: bool,
) -> int:
    if not source.is_dir():
        print("소스 없음:", source, file=sys.stderr)
        return 1
    base.mkdir(parents=True, exist_ok=True)

    files = [p for p in source.iterdir() if p.is_file()]
    moves: list[tuple[Path, Path, str]] = []

    for src in sorted(files, key=lambda p: p.name):
        try:
            mtime = src.stat().st_mtime
        except OSError:
            mtime = None
        folder, reason = target_folder_for_file(src.name, mtime)
        if folder is None:
            folder = misc_folder
            reason = f"unclassified→{misc_folder}"

        dest_dir = base / folder
        dest = dest_dir / src.name
        if dry_run:
            if dest.exists():
                moves.append(
                    (src, dest, f"DRY_exists ({reason})")
                )
            else:
                moves.append((src, dest, reason))
            continue
        if dest.exists() and _same_file(src, dest):
            moves.append((src, dest, f"SKIP_same_file ({reason})"))
            continue
        dest = unique_dest(dest) if dest.exists() else dest
        moves.append((src, dest, reason))

    for src, dest, reason in moves:
        action = "[DRY-RUN]" if dry_run else "[이동]"
        if dry_run and reason.startswith("DRY_exists"):
            print(
                f"{action} {src.name}  (목적지에 동일 이름 있음, 실행 시 내용 같으면 소스만 삭제)  ({reason})"
            )
            continue
        if reason.startswith("SKIP"):
            print(f"{action} {src.name}  {reason}")
            continue
        print(f"{action} {src.name} -> {dest.relative_to(base)}  ({reason})")

    if dry_run:
        n_exist = sum(1 for _, _, r in moves if r.startswith("DRY_exists"))
        n_new = len(moves) - n_exist
        print(
            f"\n총 {len(moves)}건 (신규 경로 {n_new}, 이미 같은 이름 있음 {n_exist}) - 실제 반영: python tools/organize_dolsimb_photo.py --execute"
        )
        return 0

    ok, fail = 0, 0
    for src, dest, reason in moves:
        if reason.startswith("SKIP"):
            _unlock_for_delete(src)
            try:
                src.unlink()
                print("삭제(중복):", src.name, "==", dest.relative_to(base))
                ok += 1
            except OSError as e:
                print("건너뜀(삭제 실패):", src.name, e, file=sys.stderr)
                fail += 1
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            dest = unique_dest(dest)
        _unlock_for_delete(src)
        shutil.move(str(src), str(dest))
        print("이동완료:", dest.relative_to(base))
        ok += 1

    print(f"\n완료: {len(moves)}건 → {base}")
    if fail:
        print(f"삭제 실패: {fail}건 (OneDrive 일시중지·다른 앱 종료 후 재실행 권장)", file=sys.stderr)
    return 0 if fail == 0 else 1


def main() -> None:
    ap = argparse.ArgumentParser(description="돌심방사진 YYMM_ 규칙으로 kcs 폴더 정리")
    ap.add_argument(
        "--base",
        type=Path,
        default=DEFAULT_BASE,
        help="기준 루트 (기본: 돌심방사진)",
    )
    ap.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="정리할 평평한 소스 폴더 (기본: 돌심방사진-kcs30035600)",
    )
    ap.add_argument(
        "--misc-folder",
        default="_기타_파일명기준미적용",
        help="날짜 추정 불가 시 하위 폴더명",
    )
    ap.add_argument(
        "--execute",
        action="store_true",
        help="실제 이동 (지정 없으면 dry-run)",
    )
    args = ap.parse_args()
    base = args.base.resolve()
    source = args.source.resolve()
    dry = not args.execute
    sys.exit(run(base, source, misc_folder=args.misc_folder, dry_run=dry))


if __name__ == "__main__":
    main()
