# -*- coding: utf-8 -*-
"""갑호증 폴더를 청구서(260404_01) 증거 목록과 대조하고, 선택적으로 초과분만 삭제합니다.

제거 대상(기본 --apply 시):
  - 갑제4-2호증_…_동영상.mp4 (통합본으로 대체)
  - 갑제4-3호증_…_동영상.mp4 (구) 동영상용 — 갑 제4-3호증은 사무위임 조례 PDF로 사용

유지: *.pdf.bak (QR 삽입 전 원본), gab_qr_urls.txt, 폴더 전체(갑9~13 등)

실행: 프로젝트 루트에서
  python tools/audit_gab_evidence_folder.py          # 점검만
  python tools/audit_gab_evidence_folder.py --apply  # 위 파일 삭제
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_EVID = _REPO / "행정심판청구(증거)"
GAB = _EVID / "갑호증"
if not GAB.is_dir():
    GAB = _EVID / "최종" / "갑호증"

# 갑 제5-1호증 동영상 — 표준명 또는 구명(통합) 중 하나
GAB62_VIDEO_ALTERNATIVES = (
    "갑제5-1호증_건축과_도로·통행 동영상.mp4",
    "갑제5-2호증_건축과_도로·통행_동영상(건축과-25898).mp4",
    "갑제5-2호증_건축과_도로·통행(건축과-25898)_동영상.mp4",
    "갑제6-2증_건축과_도로·통행(건축과-25898)_동영상_통합.mp4",
)
# 갑 제7-1호증, 갑 제8-1호증: 청구서상 QR 표준, 동일 주제 MP4 병치 시 QR 생략 가능
GAB81_ONE_OF = (
    "갑제7-1호증_항공사진_QR.png",
    "갑제7-1호증_항공사진(1947~2023) 동영상.mp4",
    "갑제7-1호증_동춘동 198(항공사진 1947~2023).mp4",
)
GAB91_ONE_OF = (
    "갑제8-1호증_위법행정_QR.png",
    "갑제8-1호증_위법한 선행행정 동영상.mp4",
    "갑제8-1호증_동춘동 198(위법한 선행행정행위).mp4",
)

# 청구서 루트·고정 파일(폴더는 exists 디렉터리)
REQUIRED_FILES = [
    "갑제1-1호증_1966년_항공사진.jpg",
    "갑제2-1호증_동춘동199_건축물관리대장(폐쇄).jpg",
    "갑제2-2호증_동춘동199_일반건축물대장.pdf",
    # 갑10-1~10-7: 루트 편철(구 하위폴더 경로는 첨부(갑제9호증)_… 에 병치 가능)
    "갑제9-1호증_준공식(현수막)_260313_124719.jpg",
    "갑제9-2호증_준공식(안내)_260313_132836.jpg",
    "갑제9-3호증_준공식(입구)_260313_132906.jpg",
    "갑제9-4호증_준공식(기념식수)_260313_125151.jpg",
    "갑제9-5호증_준공식(기념석)_260313_125206.jpg",
    "갑제9-6호증_준공식(팜플릿)_260313_132950.jpg",
    "갑제9-7호증_준공식(출구)_260313_144915.jpg",
    "갑제3-1호증_지적_등부_관련.pdf",
    "갑제3-2호증_지적_등부_폐쇄지적도_841230.jpg",
    "갑제3-3호증_지적_등부_폐쇄지적도_941017.jpg",
    "갑제4-1호증_인천시_실시계획인가고시_제2020-233호(당초).pdf",
    "갑제4-2호증_인천시_실시계획인가고시_제2022-18호(변경).pdf",
    "갑제4-3호증_인천시_사무위임조례(제7665호).pdf",
    "갑제4-4호증_[별표 1] 구청장에게 위임하는 사항(제2조 관련)(인천시 사무위임 조례).pdf",
    "갑제5-2호증_건축과_도로·통행_회신(건축과-25898).pdf",
    "갑제6-1호증_공원녹지과_민원회신(2AA-2405-1092919).pdf",
    "갑제6-2호증_공원녹지_진출입로점용_민원회신(33589).pdf",
    "갑제6-3호증_공원녹지과_주위토지통행권 민원회신(8032).jpg",
    "__GAB81_ONE_OF__",
    "__GAB91_ONE_OF__",
    "갑제7-2호증_항공사진(1947~2023) 출력물.pdf",
    "갑제8-2호증_위법한 선행행정 출력물.pdf",
    "갑제12-1호증_제225회_연수구의회_본회의_회의록.pdf",
    "갑제12-2호증_제225회_연수구의회_청원_심사보고서.pdf",
    "갑제12-3호증_제225회_연수구의회_의장_의견서.jpg",
    "갑제12-4호증_제225회_연수구의회_자치도시위원회_회의록.pdf",
]
REQUIRED_DIRS = [
    "첨부(갑제9호증)_2026년 농원근린공원 준공식(객관적공법외관)",
    "첨부(갑제2호증)_동춘동 950-3_통행관련(동춘동 198, 199 외)",
    "첨부(갑제3호증)_2019년 농원근린공원 조성계획변경(주민설명회)",
    "첨부(갑제4호증)_농원근린공원(고시 및 총괄 지형도면)",
    "첨부(갑제1호증)_연수택지개발사업(맹지배경)",
]

# 청구서 증거목록에 있으나 디스크 미편철일 수 있음(없어도 필수 감사 실패로 보지 않음)
RECOMMENDED_DIRS = [
    "갑제11호증_20190724_주민설명회_농원근린공원",
]

# 청구서에 예시되는 추가 폴더(없어도 루트·단일 파일로 대체 가능)
OPTIONAL_DIRS = [
    "갑제6-3호증_현장_통행관련",
]

REMOVE_IF_PRESENT = [
    "갑제4-2호증_건축과_도로·통행(건축과-25898)_동영상.mp4",
    "갑제4-3호증_건축과_도로·통행(건축과-25898)_동영상.mp4",
]

OPTIONAL_ROOT = [
    "갑호증_동춘동198_항공사진.mp4",
    "갑호증_동춘동198_위법행정.mp4",
    "영상_동춘동198_항공사진.mp4",
    "영상_동춘동198_위법행정.mp4",
    "gab_qr_urls.txt",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="REMOVE_IF_PRESENT 파일만 삭제")
    args = ap.parse_args()

    if not GAB.is_dir():
        print(f"없음: {GAB}", file=sys.stderr)
        sys.exit(1)

    lines: list[str] = ["=== 갑호증 ↔ 청구서(260404_01)·집행정지(260404_02) 대조 ===", ""]
    ok = True
    lines.append("[필수 파일]")
    for name in REQUIRED_FILES:
        if name == "__GAB81_ONE_OF__":
            hit81 = next((n for n in GAB81_ONE_OF if (GAB / n).is_file()), None)
            if hit81:
                lines.append(f"  OK  {hit81} (갑 제7-1호증, QR 또는 동일 주제 MP4 병치)")
            else:
                lines.append(
                    "  누락 갑 제7-1호증 (택1: " + " · ".join(GAB81_ONE_OF) + ")"
                )
                ok = False
            continue
        if name == "__GAB91_ONE_OF__":
            hit91 = next((n for n in GAB91_ONE_OF if (GAB / n).is_file()), None)
            if hit91:
                lines.append(f"  OK  {hit91} (갑 제8-1호증, QR 또는 동일 주제 MP4 병치)")
            else:
                lines.append(
                    "  누락 갑 제8-1호증 (택1: " + " · ".join(GAB91_ONE_OF) + ")"
                )
                ok = False
            continue
        p = GAB / name
        if p.is_file():
            lines.append(f"  OK  {name}")
        else:
            lines.append(f"  누락 {name}")
            ok = False
        if name == "갑제5-2호증_건축과_도로·통행_회신(건축과-25898).pdf":
            hit62 = next((n for n in GAB62_VIDEO_ALTERNATIVES if (GAB / n).is_file()), None)
            if hit62:
                lines.append(f"  OK  {hit62} (갑 제5-1호증 동영상)")
            else:
                lines.append(
                    "  누락 갑 제5-1호증 동영상 (택1: "
                    + " 또는 ".join(GAB62_VIDEO_ALTERNATIVES)
                    + ")"
                )
                ok = False
    lines.append("")
    lines.append("[필수 폴더]")
    for name in REQUIRED_DIRS:
        p = GAB / name
        if p.is_dir():
            lines.append(f"  OK  {name}/")
        else:
            lines.append(f"  누락 {name}/")
            ok = False
    lines.append("[권장 폴더(청구서 증거목록·미편철 시 아래에 별도 안내)]")
    for name in RECOMMENDED_DIRS:
        p = GAB / name
        if p.is_dir():
            lines.append(f"  OK  {name}/")
        else:
            lines.append(f"  미편철  {name}/  (증거목록 12번·주민설명회 자료)")
    lines.append("[선택 폴더(청구서 예시·없으면 루트 단일 파일 등으로 대체 가능)]")
    for name in OPTIONAL_DIRS:
        p = GAB / name
        lines.append(f"  {'있음' if p.is_dir() else '없음'}  {name}/")
    lines.append("")
    lines.append("[선택(청구서 ‘있을 경우’·도구용)]")
    for name in OPTIONAL_ROOT:
        p = GAB / name
        lines.append(f"  {'있음' if p.exists() else '없음'}  {name}")
    lines.append("")
    lines.append("[청구서에 없음 → 통합·번호 폐지로 삭제 대상]")
    removed = 0
    for name in REMOVE_IF_PRESENT:
        p = GAB / name
        if p.is_file():
            lines.append(f"  삭제 대상: {name}")
            if args.apply:
                p.unlink()
                lines.append(f"  → 삭제함")
                removed += 1
        else:
            lines.append(f"  (없음) {name}")
    lines.append("")
    if args.apply:
        lines.append(f"삭제 실행: {removed}건")
    else:
        lines.append("삭제하려면: python tools/audit_gab_evidence_folder.py --apply")
    lines.append("")
    lines.append(
        "[참고] *.pdf.bak 은 청구서에 적지 않으나 QR 삽입 전 원본 백업으로 유지하는 것을 권장합니다."
    )

    report = "\n".join(lines)
    out = _REPO / "행정심판청구(증거)" / f"{date.today().strftime('%y%m%d')}_갑호증_청구서대조.txt"
    out.write_text(report, encoding="utf-8")
    print(report)
    print(f"\n기록: {out}")
    if not ok:
        sys.exit(2)


if __name__ == "__main__":
    main()
