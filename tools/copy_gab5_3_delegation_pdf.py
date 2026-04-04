# -*- coding: utf-8 -*-
"""
「인천광역시 사무위임 조례」 PDF를 아래 후보 폴더에서 찾아
갑 제4-3호증 표준 파일명으로 `갑호증`에 복사합니다.

증거 목록·포털은 다음 파일명을 기준으로 합니다.
  갑제4-3호증_인천광역시_사무위임조례(제7665호).pdf

원본 PDF는 국가법령정보·인천시 공포본 등에서 받아 다음 **어느 폴더에나** 두면 됩니다(하위 폴더 포함).
  - 행정심판청구(증거)/최종/법령정보/
  - 행정심판최종본/
  - 행정심판청구(증거)/최종/작업/기타참고/

파일명에 '사무위임', '7665' 등이 들어가면 자동 선택 우선.

실행(프로젝트 루트):
  python tools/copy_gab5_3_delegation_pdf.py
  python tools/copy_gab5_3_delegation_pdf.py --dry-run
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent


def _candidate_dirs() -> list[Path]:
    return [
        _REPO / "행정심판청구(증거)" / "최종" / "법령정보",
        _REPO / "행정심판최종본",
        _REPO / "행정심판청구(증거)" / "최종" / "작업" / "기타참고",
    ]


DEST = (
    _REPO
    / "행정심판청구(증거)"
    / "최종"
    / "갑호증"
    / "갑제4-3호증_인천광역시_사무위임조례(제7665호).pdf"
)


def pick_source_pdf() -> Path | None:
    pdfs: list[Path] = []
    for d in _candidate_dirs():
        if not d.is_dir():
            continue
        pdfs.extend(
            sorted(p for p in d.rglob("*.pdf") if p.is_file() and not p.name.startswith("~"))
        )
    if not pdfs:
        return None
    for p in pdfs:
        n = p.name
        if "7665" in n and ("위임" in n or "사무위임" in n or "조례" in n):
            return p
    for p in pdfs:
        if "사무위임" in p.name or "위임" in p.name:
            return p
    return pdfs[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="복사하지 않고 경로만 표시")
    args = ap.parse_args()

    if not any(d.is_dir() for d in _candidate_dirs()):
        print("다음 중 하나의 폴더를 만든 뒤 공포본 PDF를 넣으세요:")
        for d in _candidate_dirs():
            print(" ", d)
        return 1

    src = pick_source_pdf()
    if not src:
        print("PDF를 찾지 못했습니다. 아래 폴더 중 하나에 조례 PDF를 넣으세요:\n")
        for d in _candidate_dirs():
            if d.is_dir():
                print(" ", d)
        print("\n예시 파일명(국가법령정보 등): …사무위임 조례…7665….pdf")
        print("\n갑호증 편철 표준명(복사 후):", DEST.name)
        return 1

    print("원본:", src)
    print("대상:", DEST)
    if args.dry_run:
        print("(dry-run: 복사 안 함)")
        return 0

    DEST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, DEST)
    print("복사 완료. 포털 갱신: python tools/build_commission_evidence_json.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
