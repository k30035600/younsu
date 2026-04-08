# -*- coding: utf-8 -*-
"""갑호증 폴더 전수조사: 전체 파일 목록·확장자별 건수·용량·루트 기타 파일.

실행(프로젝트 루트):
  python tools/survey_gab_evidence_full.py

산출:
  행정심판청구(증거)/YYMMDD_갑호증_전수조사.txt (실행일 기준)

기준 경로는 `audit_gab_evidence_folder.py`와 동일(`…/증거/최종/갑호증` 우선, 없으면 `…/증거/갑호증`).
"""
from __future__ import annotations

import os
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
# `audit_gab_evidence_folder.py` 와 동일: `최종/갑호증` 우선, 없으면 `갑호증`
_GAB_PRIMARY = _REPO / "행정심판청구(증거)" / "최종" / "갑호증"
_GAB_FALLBACK = _REPO / "행정심판청구(증거)" / "갑호증"
GAB = _GAB_PRIMARY if _GAB_PRIMARY.is_dir() else _GAB_FALLBACK
OUT = _REPO / "행정심판청구(증거)" / f"{date.today().strftime('%y%m%d')}_갑호증_전수조사.txt"


def human_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024**2:
        return f"{n / 1024:.1f} KiB"
    if n < 1024**3:
        return f"{n / 1024**2:.1f} MiB"
    return f"{n / 1024**3:.2f} GiB"


def main() -> None:
    if not GAB.is_dir():
        raise SystemExit(
            f"없음: {_GAB_PRIMARY} 또는 {_GAB_FALLBACK} — 증거 폴더를 두 경로 중 한 곳에 두세요."
        )

    ext_count: dict[str, int] = defaultdict(int)
    ext_bytes: dict[str, int] = defaultdict(int)
    root_files: list[tuple[str, int]] = []
    all_rels: list[tuple[str, int]] = []

    for dirpath, _dirnames, filenames in os.walk(GAB, topdown=True):
        for fn in filenames:
            fp = Path(dirpath) / fn
            try:
                st = fp.stat()
            except OSError:
                continue
            size = st.st_size
            rel = str(fp.relative_to(GAB)).replace("\\", "/")
            suf = fp.suffix.lower() or "(확장자없음)"
            ext_count[suf] += 1
            ext_bytes[suf] += size
            all_rels.append((rel, size))
            if fp.parent == GAB:
                root_files.append((rel, size))

    all_rels.sort(key=lambda x: x[0])
    root_files.sort(key=lambda x: x[0])

    total_files = len(all_rels)
    total_bytes = sum(s for _r, s in all_rels)

    lines: list[str] = []
    lines.append("=== 갑호증 전수조사 ===")
    lines.append(f"기준 경로: {GAB}")
    lines.append(f"총 파일 수: {total_files:,}")
    lines.append(f"총 용량: {human_size(total_bytes)} ({total_bytes:,} bytes)")
    lines.append("")

    lines.append("[확장자별]")
    for ext in sorted(ext_count.keys(), key=lambda e: (-ext_count[e], e)):
        lines.append(
            f"  {ext:12}  {ext_count[ext]:6,}건  {human_size(ext_bytes[ext]):>12}"
        )
    lines.append("")

    lines.append("[루트 파일 - 갑제/갑호증/영상/QR 등 이외 이름은 점검 대상]")
    expected_prefixes = (
        "갑제",
        "갑호증_",
        "영상_",
        "QR_",
        "gab_",
        "첨부(갑제",
    )
    other_root = [
        (r, s)
        for r, s in root_files
        if not r.startswith(expected_prefixes)
        and not r.endswith(".pdf.bak")
    ]
    if not other_root:
        lines.append("  (특이 루트 파일 없음)")
    else:
        for r, s in other_root:
            lines.append(f"  ? {r}  ({human_size(s)})")
    lines.append("")

    lines.append("[호증 번호 혼선 점검 — 청구서와 폴더명 일치]")
    legacy_checks = [
        (
            "갑제10호증_20190724_주민설명회_농원근린공원",
            "갑 제11호증 → `갑제11호증_20190724_…` 만 두고 구 폴더는 수동 정리·이전 백업 참고(자동 마이그레이션 스크립트는 미보관)",
        ),
        (
            "갑제11호증_연수구의회_225회",
            "갑 제12-1~13-4 루트 편철과 맞추려면 `갑제12호증_연수구의회_225회` 또는 `첨부(갑제8호증)_2019년 225회 연수구의회(주민청원)/` 로 합친 뒤 표준 루트명으로 수동 정리",
        ),
        (
            "갑제12호증_연수구의회_225회",
            "표준: 루트 `갑제12-1호증_`~`갑제12-4호증_` — 수동 정리 후 빈 폴더 삭제 검토",
        ),
        (
            "첨부(갑제8호증)_2019년 225회 연수구의회(주민청원)",
            "동일 — 루트로 이동·이름 변경은 수동(과거 일회성 스크립트는 `tools/archive/` 또는 미보관)",
        ),
    ]
    any_legacy = False
    for dirname, hint in legacy_checks:
        p = GAB / dirname
        if p.is_dir():
            any_legacy = True
            lines.append(f"  ⚠ 남아 있음: {dirname}/")
            lines.append(f"      → {hint}")
    if not any_legacy:
        lines.append("  (구 폴더명 잔재 없음 — 또는 이미 정리됨)")
    lines.append("")

    lines.append("[하위 법령정보/ — 판례·참고 PDF 요약(통합 편철)]")
    law_root = GAB / "법령정보"
    if law_root.is_dir():
        pdfs = sorted(law_root.rglob("*.pdf"))
        lines.append(f"  PDF {len(pdfs)}건 (갑호증 기준 상대경로)")
        for p in pdfs:
            rel = p.relative_to(GAB).as_posix()
            try:
                sz = p.stat().st_size
            except OSError:
                sz = 0
            lines.append(f"    {rel}\t{human_size(sz)}")
    else:
        lines.append("  (폴더 없음 — `…/갑호증/법령정보/` 에 두면 본 점검·포털 precedent 에 포함)")
    lines.append("")

    lines.append("[전체 파일 목록 - 상대경로, 크기]")
    for r, s in all_rels:
        lines.append(f"  {r}\t{human_size(s)}")

    text = "\n".join(lines) + "\n"
    OUT.write_text(text, encoding="utf-8")
    so = getattr(sys.stdout, "reconfigure", None)
    if callable(so):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass
    try:
        print(text)
    except UnicodeEncodeError:
        print(f"전수조사 완료(본문은 파일 참조). 총 {total_files}건, {human_size(total_bytes)}")
    print(f"기록: {OUT}")


if __name__ == "__main__":
    main()
