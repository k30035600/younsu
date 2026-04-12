# -*- coding: utf-8 -*-
"""과거 로그·일회성 작업 기록을 프로젝트 루트 `temp/` 로 옮겨 작업 폴더를 정리한다(보관용·드물게 실행).

기본은 **시뮬레이션만**(이동하지 않음). 실제 이동은 `--apply`.

대상(기본):
  - 행정심판청구(제출용)/최종/작업/루트기록/260328_*.txt  (260331·260401 이후 스냅샷이 있는 경우 과거 로그)
  - 행정심판청구(제출용)/최종/작업/루트기록/260328_*.md 가 있으면 동일 접두 txt 만 후보

제외: README*, *통합안내*, 증명취지 등 현재도 참고할 수 있는 파일은 목록에서 빼고 수동으로 옮긴다.

실행:
  python tools/archive/move_haengjeong_housekeeping_to_temp.py --dry-run
  python tools/archive/move_haengjeong_housekeeping_to_temp.py --apply
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
AP = _REPO / "행정심판청구(제출용)"
TEMP = _REPO / "temp"
LOG_DIR = AP / "작업" / "루트기록"

# 이동 후보: 과거 날짜 접두(260328)의 txt — 신규 전수조사와 중복되는 로그류
DEFAULT_PREFIXES = ("260328_",)


def candidates() -> list[Path]:
    out: list[Path] = []
    if not LOG_DIR.is_dir():
        return out
    for p in sorted(LOG_DIR.iterdir()):
        if not p.is_file():
            continue
        if any(p.name.startswith(pref) for pref in DEFAULT_PREFIXES) and p.suffix.lower() in (
            ".txt",
            ".md",
        ):
            # 통합안내·참고 정리는 제외(파일명에 포함 시 스킵)
            if "통합안내" in p.name or "README" in p.name:
                continue
            out.append(p)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--apply",
        action="store_true",
        help="실제 이동(없으면 dry-run만)",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="목록만 출력(기본 동작과 동일)",
    )
    args = ap.parse_args()
    dry = not args.apply

    c = candidates()
    if not c:
        print("이동 후보 없음:", LOG_DIR)
        return 0

    TEMP.mkdir(parents=True, exist_ok=True)
    readme = TEMP / "README.md"
    if not readme.is_file():
        readme.write_text(
            """# temp — 정리 대기 파일

이 폴더로 옮긴 항목은 **과거 버전 로그·일회성 작업 기록** 등으로, 제출 서면·갑호증과 직접 대응하지 않을 수 있습니다.

- **삭제 전** OneDrive·Git 백업을 확인하세요.
- 재생성: `python tools/survey_haengjeong_sipan_full.py`, `python tools/survey_gab_evidence_full.py`

스크립트: `python tools/archive/move_haengjeong_housekeeping_to_temp.py --apply`
""",
            encoding="utf-8",
        )
        print("write", readme.relative_to(_REPO))

    for p in c:
        dest = TEMP / "루트기록_이전" / p.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"{'[apply] ' if not dry else '[dry] '}{p.relative_to(_REPO)} -> {dest.relative_to(_REPO)}")
        if not dry:
            if dest.exists():
                print("  skip exists:", dest, file=sys.stderr)
                continue
            shutil.move(str(p), str(dest))

    if dry:
        print("\n(시뮬레이션) 실제 이동: python tools/archive/move_haengjeong_housekeeping_to_temp.py --apply")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
