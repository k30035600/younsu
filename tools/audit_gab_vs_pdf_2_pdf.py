# -*- coding: utf-8 -*-
"""`행정심판청구(증거)/갑호증` vs `…/pdf_2_pdf/갑호증` 대조(누락·역방향).

기대 출력 경로는 `evidence_pdf_official_footer.py` 와 동일:
- `.mp4` 및 원본복사 파일명 → 확장자 유지
- 그 외 `.jpg` `.jpeg` `.png` `.pdf` → 동일 상대경로에 `.pdf`
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_EVIDENCE = _REPO / "행정심판청구(증거)"
_IMG_EXT = {".jpg", ".jpeg", ".png", ".jpe", ".jfif"}
_PDF_EXT = {".pdf"}
_COPY_ORIGINAL_BASENAMES = frozenset(
    {
        "행정기본법_질의응답_사례집(최종).pdf",
        "갑제1-2호증_항공사진(원본)_196703051400070005.jpg",
    }
)


def _expected_out(
    *,
    out_root: Path,
    src_root: Path,
    src_file: Path,
) -> Path:
    rel = src_file.relative_to(src_root)
    name = src_file.name
    suf = src_file.suffix.lower()
    copy_only = suf == ".mp4" or name in _COPY_ORIGINAL_BASENAMES
    if copy_only:
        return out_root / "갑호증" / rel
    return out_root / "갑호증" / rel.with_suffix(".pdf")


def _is_pipeline_file(p: Path) -> bool:
    suf = p.suffix.lower()
    return suf == ".mp4" or suf in _IMG_EXT or suf in _PDF_EXT


def main() -> int:
    ap = argparse.ArgumentParser(description="갑호증 원본 vs pdf_2_pdf/갑호증 검수")
    ap.add_argument(
        "--gab",
        type=Path,
        default=_EVIDENCE / "갑호증",
        help="갑호증 소스 루트",
    )
    ap.add_argument(
        "--pdf2",
        type=Path,
        default=_EVIDENCE / "pdf_2_pdf",
        help="pdf_2_pdf 출력 루트(하위 갑호증과 비교)",
    )
    ap.add_argument(
        "--report",
        type=Path,
        default=None,
        metavar="PATH",
        help="요약을 UTF-8(BOM) 텍스트로 저장(한글 터미널 깨짐 방지)",
    )
    args = ap.parse_args()
    gab = args.gab.resolve()
    pdf2 = args.pdf2.resolve()
    gab_out = pdf2 / "갑호증"

    if not gab.is_dir():
        print(f"오류: 갑호증 폴더 없음: {gab}", file=sys.stderr)
        return 1
    if not gab_out.is_dir():
        print(f"경고: pdf_2_pdf/갑호증 없음(전부 누락으로 간주): {gab_out}", file=sys.stderr)

    missing: list[tuple[Path, Path]] = []
    empty_out: list[tuple[Path, Path]] = []
    skipped_other: list[Path] = []

    for p in sorted(gab.rglob("*")):
        if not p.is_file():
            continue
        if not _is_pipeline_file(p):
            skipped_other.append(p)
            continue
        exp = _expected_out(out_root=pdf2, src_root=gab, src_file=p)
        if not exp.is_file():
            missing.append((p, exp))
        elif exp.stat().st_size == 0:
            empty_out.append((p, exp))

    # 역방향: pdf_2_pdf/갑호증 아래 파일 중, 갑호증에 대응 원본이 없거나 규칙과 안 맞는 것
    orphan_out: list[Path] = []
    if gab_out.is_dir():
        for q in sorted(gab_out.rglob("*")):
            if not q.is_file():
                continue
            rel = q.relative_to(gab_out)
            # 조판본 .pdf → 원본은 .pdf 또는 이미지 동일 stem
            stem = rel.stem
            parent = rel.parent
            candidates = [
                gab / parent / f"{stem}{s}"
                for s in (".pdf", ".jpg", ".jpeg", ".png", ".jpe", ".jfif", ".mp4")
            ]
            # 복사 전용은 확장자까지 동일해야 함
            exact = gab / rel
            if exact.is_file():
                continue
            if any(c.is_file() for c in candidates):
                continue
            orphan_out.append(q)

    n_pipe = sum(1 for p in gab.rglob("*") if p.is_file() and _is_pipeline_file(p))

    print("=== 갑호증 ↔ pdf_2_pdf/갑호증 검수 ===\n")
    print(f"소스: {gab}")
    print(f"출력: {gab_out}\n")
    print(f"스크립트 대상 파일(이미지·PDF·mp4): {n_pipe}건")
    print(f"비대상 확장자 파일: {len(skipped_other)}건")

    print(f"\n[누락] 기대 출력 없음: {len(missing)}건")
    for src, exp in missing:
        print(f"  - {src.relative_to(_REPO)}")
        print(f"    → 기대: {exp.relative_to(_REPO)}")

    print(f"\n[빈 파일] 출력 크기 0: {len(empty_out)}건")
    for src, exp in empty_out:
        print(f"  - {exp.relative_to(_REPO)}")

    print(f"\n[역방향] pdf_2_pdf에만 있음(갑호증에 대응 원본 없음): {len(orphan_out)}건")
    for q in orphan_out[:200]:
        print(f"  - {q.relative_to(_REPO)}")
    if len(orphan_out) > 200:
        print(f"  … 외 {len(orphan_out) - 200}건")

    if skipped_other and len(skipped_other) <= 30:
        print("\n[비대상 목록]")
        for p in skipped_other:
            print(f"  - {p.relative_to(_REPO)}")
    elif skipped_other:
        print(f"\n[비대상 샘플 15건]")
        for p in skipped_other[:15]:
            print(f"  - {p.relative_to(_REPO)}")

    summary = (
        f"\n요약: 누락 {len(missing)}, 빈출력 {len(empty_out)}, "
        f"pdf측만 존재 {len(orphan_out)}, 비대상 {len(skipped_other)}"
    )
    print(summary)

    if args.report is not None:
        report_path = args.report
        if not report_path.is_absolute():
            report_path = (_REPO / report_path).resolve()
        lines: list[str] = []
        lines.append("=== 갑호증 ↔ pdf_2_pdf/갑호증 검수 ===\n")
        lines.append(f"소스: {gab}")
        lines.append(f"출력: {gab_out}\n")
        lines.append(f"스크립트 대상 파일(이미지·PDF·mp4): {n_pipe}건")
        lines.append(f"비대상 확장자 파일: {len(skipped_other)}건\n")
        lines.append(f"[누락] 기대 출력 없음: {len(missing)}건")
        for src, exp in missing:
            lines.append(f"  - {src.relative_to(_REPO)}")
            lines.append(f"    → 기대: {exp.relative_to(_REPO)}")
        lines.append(f"\n[빈 파일] 출력 크기 0: {len(empty_out)}건")
        for src, exp in empty_out:
            lines.append(f"  - {exp.relative_to(_REPO)}")
        lines.append(f"\n[역방향] pdf_2_pdf에만 있음: {len(orphan_out)}건")
        for q in orphan_out:
            lines.append(f"  - {q.relative_to(_REPO)}")
        if skipped_other:
            lines.append(f"\n[비대상] ({len(skipped_other)}건)")
            for p in skipped_other:
                lines.append(f"  - {p.relative_to(_REPO)}")
        lines.append(summary.strip())
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")
        print(f"\n보고서 저장: {report_path.relative_to(_REPO)}", file=sys.stderr)

    return 1 if (missing or empty_out) else 0


if __name__ == "__main__":
    raise SystemExit(main())
