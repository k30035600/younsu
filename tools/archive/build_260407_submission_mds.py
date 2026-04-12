# -*- coding: utf-8 -*-
"""260407 제출용 서면 묶음 생성. `행정심판청구(원본)/260406/` 정본을 복사·갱신해 `260407/`에 둔다.

출력 파일명은 포털 `tabSources`와 맞춤:
  (레거시) 260407_01_… 등. 현재 정본 MD는 `행정심판청구(원본)/제출원문(원본)/` 또는 `yymmdd_md/` 아래(예: `행정심판청구서.md`).

실행(프로젝트 루트):
  python tools/build_260407_submission_mds.py
"""
from __future__ import annotations

from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
FINAL = _REPO / "행정심판청구(원본)"
SRC = FINAL / "260406"
OUT = FINAL / "260407"
NEW = "260407"

# (소스 상대명, 대상 파일명)
_COPIES: list[tuple[str, str]] = [
    ("행정심판청구서.md", f"{NEW}_01_행정심판청구서.md"),
    ("집행정지신청서.md", f"{NEW}_02_집행정지신청서.md"),
    ("별지제1호_증거자료_목록.md", f"{NEW}_별지제1호_증거자료_목록.md"),
    ("별지제2호_주요인용판례_및_적용주석.md", f"{NEW}_별지제2호_주요인용판례_및_적용주석.md"),
    ("별지제3호_사실관계_시간축_정리표.md", f"{NEW}_별지제3호_사실관계_시간축_정리표.md"),
    ("별지제4호_법제사적_보충의견.md", f"{NEW}_별지제4호_법제사적_보충의견.md"),
]


def _transform(text: str) -> str:
    """경로·저장 위치만 260407로 옮김. 본문의 `260406(중앙행심위)` 등 이력 문구는 유지."""
    text = text.replace("행정심판청구(원본)/260406", "행정심판청구(원본)/260407")
    text = text.replace(
        f"행정심판청구(원본)/{NEW}/별지제1호_증거자료_목록.md",
        f"행정심판청구(원본)/{NEW}/{NEW}_별지제1호_증거자료_목록.md",
    )
    return text


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit(f"없음: {SRC} — 260406 폴더가 있어야 합니다.")
    OUT.mkdir(parents=True, exist_ok=True)
    for src_name, dest_name in _COPIES:
        sp = SRC / src_name
        if not sp.is_file():
            raise SystemExit(f"없음: {sp}")
        raw = sp.read_text(encoding="utf-8")
        (OUT / dest_name).write_text(_transform(raw), encoding="utf-8")
        print("작성:", dest_name)
    print("완료:", OUT)


if __name__ == "__main__":
    main()
