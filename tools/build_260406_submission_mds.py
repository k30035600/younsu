# -*- coding: utf-8 -*-
"""260406(중앙행심위 제출용) 서면 묶음 생성. 260405(인천행심위)·260406(중앙행심위) 참고."""
from __future__ import annotations

from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
FINAL = _REPO / "행정심판청구(최종)"
INC = FINAL / "260405(인천행심위)"
CEN = FINAL / "260406(중앙행심위)"
WORK = FINAL / "작업보조"
OUT = FINAL / "260406"

HEADER = """<!--
  중앙행정심판위원회 제출용 사건 서면 묶음.
  저장 위치: 행정심판청구(최종)/260406/
  파일명: yymmdd_ 접두·파일명 접미 _최종 미사용.
  반영: 260405(인천행심위) 정본·260406(중앙행심위) 초안·작업 자료 전수조사.
-->

"""


def _apply_bycheon_replacements(s: str) -> str:
    """별첨 제n호 → 별지 제m호 (동사 '별첨하다' 등은 치환하지 않음)."""
    s = s.replace("별첨 제4호", "별지 제4호")
    s = s.replace("별첨 제3호", "별지 제3호")
    s = s.replace("별첨 제2호", "별지 제3호")
    s = s.replace("별첨 제1호", "별지 제2호")
    return s


def build_appeal() -> None:
    raw = (CEN / "opus청구서.md").read_text(encoding="utf-8")
    old_table = """**별첨 목록**

| 별첨 | 제목 | 성격 |
|---|---|---|
| 별첨 제1호 | 주요 인용 판례 요약 PDF | 법리 참고 |
| 별첨 제2호 | 사실관계 시간축 정리표 | 심리 보조 |
| 별첨 제3호 | 설명회 vs 실시계획 vs 현장 대조 목록 | 심리 보조 |
| 별첨 제4호 | 법제사적 보충의견(건축법·도시계획법의 역사적 연원과 본 사건의 구조적 관계) | 참고 자료 |"""
    new_table = """**별지 서면 목록**

| 별지 | 제목 | 성격 |
|---|---|---|
| 별지 제1호 | 증거(갑호증) 목록 | 편철 기준 |
| 별지 제2호 | 주요 인용 판례 및 적용 주석 | 법리 참고 |
| 별지 제3호 | 사실관계 시간축 정리표 · 설명회·실시계획·현장 대조 | 심리 보조 |
| 별지 제4호 | 법제사적 보충의견(건축법·도시계획법의 역사적 연원과 본 사건의 구조적 관계) | 참고 자료 |"""
    raw = raw.replace(old_table, "")
    raw = raw.replace(new_table, "")
    raw = _apply_bycheon_replacements(raw)
    (OUT / "행정심판청구서.md").write_text(HEADER + raw, encoding="utf-8")


def build_injunction() -> None:
    raw = (CEN / "opus신청서.md").read_text(encoding="utf-8")
    lines = []
    for ln in raw.splitlines():
        if ln.strip().startswith("![포털"):
            continue
        lines.append(ln)
    raw = "\n".join(lines) + "\n"
    raw = _apply_bycheon_replacements(raw)
    raw = raw.replace(
        "**별첨 판례 요약**과 함께 검토합니다.",
        "**「별지 제2호」 판례 요약**과 함께 검토합니다.",
    )
    (OUT / "집행정지신청서.md").write_text(HEADER + raw, encoding="utf-8")


def _strip_260405_names(s: str) -> str:
    return (
        s.replace("260405_별지제1호_증거자료_목록.md", "별지제1호_증거자료_목록.md")
        .replace("260405_별지제3호_사실관계_시간축_정리표.md", "별지제3호_사실관계_시간축_정리표.md")
        .replace("`260405/", "`행정심판청구(최종)/260405(인천행심위)/")
        .replace("260405/260405_갑호증_검수보고.md", "260405(인천행심위)/260405_갑호증_검수보고.md")
    )


def build_gab1() -> None:
    raw = (INC / "260405_별지제1호_증거자료_목록.md").read_text(encoding="utf-8")
    raw = raw.replace(
        "행정심판청구(최종)/260405(인천행심위)/260405_별지제1호_증거자료_목록.md",
        "행정심판청구(최종)/260406/별지제1호_증거자료_목록.md",
    )
    raw = raw.replace(
        "행정심판청구(최종)/260405/260405_별지제1호_증거자료_목록.md",
        "행정심판청구(최종)/260406/별지제1호_증거자료_목록.md",
    )
    raw = _strip_260405_names(raw)
    (OUT / "별지제1호_증거자료_목록.md").write_text(HEADER + raw, encoding="utf-8")


def build_gab2() -> None:
    raw = (INC / "260405_별지제2호_주요인용판례_및_적용주석.md").read_text(encoding="utf-8")
    raw = _strip_260405_names(raw)
    (OUT / "별지제2호_주요인용판례_및_적용주석.md").write_text(HEADER + raw, encoding="utf-8")


def build_gab3() -> None:
    raw = (INC / "260405_별지제3호_사실관계_시간축_정리표.md").read_text(encoding="utf-8")
    raw = _strip_260405_names(raw)
    dae = WORK / "별첨 제3호_대조_목록.md"
    if dae.is_file():
        extra = dae.read_text(encoding="utf-8")
        extra = extra.replace("# 별첨 제3호:", "## 별지 제3호 부속 · 대조 목록 (현장 실측 vs 인가 도면)")
        raw = raw + "\n\n---\n\n" + extra + "\n"
    (OUT / "별지제3호_사실관계_시간축_정리표.md").write_text(HEADER + raw, encoding="utf-8")


def build_gab4() -> None:
    raw = (CEN / "별첨 제4호_법제사적_보충의견.md").read_text(encoding="utf-8")
    raw = raw.replace("# 「별첨 제4호」 법제사적 보충의견", "# 「별지 제4호」 법제사적 보충의견")
    raw = _apply_bycheon_replacements(raw)
    # 메타 절(초안용) 제거
    cut = raw.find("\n## 5. opus청구서에의 반영 방안\n")
    if cut != -1:
        tail = raw.find("\n## 6. 결론\n", cut)
        if tail != -1:
            raw = raw[:cut] + raw[tail:]
    raw = raw.replace("opus청구서", "본 청구서·별지")
    (OUT / "별지제4호_법제사적_보충의견.md").write_text(HEADER + raw, encoding="utf-8")


def main() -> None:
    if not INC.is_dir():
        raise SystemExit(f"없음: {INC}")
    if not CEN.is_dir():
        raise SystemExit(f"없음: {CEN}")
    OUT.mkdir(parents=True, exist_ok=True)
    build_appeal()
    build_injunction()
    build_gab1()
    build_gab2()
    build_gab3()
    build_gab4()
    print("작성:", OUT)
    for p in sorted(OUT.iterdir()):
        if p.suffix == ".md":
            print(" ", p.name)


if __name__ == "__main__":
    main()
