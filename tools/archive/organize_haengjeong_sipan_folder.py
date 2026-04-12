"""
행정심판청구 폴더 정리: 갑호증·첨부·법령정보에는 제출문만 두고,
스크립트·로그·안내·Cursor 작업용 파일은 `행정심판청구(제출용)/최종/작업/` 아래로 이동.

실행(저장소 루트):
  python tools/organize_haengjeong_sipan_folder.py
  python tools/organize_haengjeong_sipan_folder.py --dry-run
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
AP = REPO / "행정심판청구(제출용)"
WORK = AP / "작업"

ROOT_LOG_NAMES = [
    "260328_증명취지_일반교통방해.txt",
    "260328_readme_판례모음_원본사본.txt",
    "260401_파일명_해시제거_기록.txt",
    "260331_증거_갑호증_청구서대조.txt",
    "260331_갑호증_청구서대조.txt",
    "260331_갑호증_전수조사.txt",
    "README_행정심판_통합안내.md",
    "260401_갑호증_파일명전수조사.txt",
    "260401_갑호증_중복파일_SHA256.txt",
    "260401_본문잡표기제거_정렬재번호_기록.txt",
    "260401_첨부괄호_정렬재번호_기록.txt",
    "260401_파일명_날짜_yymmdd_통일_기록.txt",
    "260401_갑호증_중복제거_첨부이름변경_기록.txt",
    "260328_readme_기타참고.txt",
    "260328_readme_증거_갑호증_편철안내.txt",
    "260328_참고_인가조건_부관_검토정리.txt",
    "260328_참고_건축신고_반려_질의응답.txt",
]

GAB_GUIDE = [
    "README.md",
    "갑제13호증_QR대체_동영상·PDF병치_안내.txt",
]

LAW_README = ["README.md"]


def move_if_exists(src: Path, dst: Path, dry: bool) -> bool:
    if not src.is_file():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        print(f"[skip exists] {dst}", file=sys.stderr)
        return False
    print(f"move {src.relative_to(REPO)} -> {dst.relative_to(REPO)}")
    if not dry:
        shutil.move(str(src), str(dst))
    return True


def move_dir_contents(src_dir: Path, dst_dir: Path, dry: bool) -> int:
    if not src_dir.is_dir():
        return 0
    n = 0
    for child in sorted(src_dir.iterdir(), key=lambda p: p.name):
        dst = dst_dir / child.name
        if child.is_dir():
            if dst.exists():
                print(f"[skip exists dir] {dst}", file=sys.stderr)
                continue
            print(f"move tree {child.relative_to(REPO)} -> {dst.relative_to(REPO)}")
            if not dry:
                shutil.move(str(child), str(dst))
            n += 1
        else:
            if move_if_exists(child, dst, dry):
                n += 1
    return n


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    dry = args.dry_run

    if not AP.is_dir():
        print(f"[err] 없음: {AP}", file=sys.stderr)
        return 1

    WORK.mkdir(parents=True, exist_ok=True)
    root_dest = WORK / "루트기록"
    gab_dest = WORK / "갑호증_안내"
    law_dest = WORK / "법령정보_안내"
    cheombo_readme = AP / "첨부" / "README.md"

    for name in ROOT_LOG_NAMES:
        move_if_exists(AP / name, root_dest / name, dry)

    for name in GAB_GUIDE:
        move_if_exists(AP / "갑호증" / name, gab_dest / name, dry)

    for name in LAW_README:
        move_if_exists(AP / "법령정보" / name, law_dest / name, dry)

    if cheombo_readme.is_file():
        move_if_exists(cheombo_readme, WORK / "첨부_README.md", dry)

    readme_work = WORK / "README.md"
    if not readme_work.exists() and not dry:
        readme_work.write_text(
            """# 행정심판청구(제출용)/최종/작업

이 폴더는 **제출 서면·갑호증 실물이 아닌** 다음을 둡니다.

- 저장소·Cursor용 스크립트, 전수조사·이름 변경 **기록(txt)**
- 편철 **안내**, README 이전본
- 과거 `기타참고/`에서 옮긴 **참고·검토 자료**(해당 폴더는 폐지됨)

**갑호증·첨부·법령정보** 폴더에는 **제출문(증거 실물)** 만 보관합니다.

이 스크립트: `python tools/organize_haengjeong_sipan_folder.py`
""",
            encoding="utf-8",
        )
        print(f"write {readme_work.relative_to(REPO)}")
    elif dry and not readme_work.exists():
        print(f"would write {readme_work.relative_to(REPO)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
