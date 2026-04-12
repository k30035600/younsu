# -*- coding: utf-8 -*-
"""`갑호증 및 법령정보(원본)` → `갑호증및법령정보` 조판(머리말·꼬리말).

- 소스: 행정심판청구(원본)/갑호증 및 법령정보(원본)  (하위 폴더 구조 유지)
- 출력: 행정심판청구(제출용)/갑호증및법령정보
- **「세로기준」:** 여백·머리말·꼬리말 배치는 A4 세로틀을 기준으로 하되, **쪽 방향(가로/세로)** 은
  원본 **이미지 픽셀·PDF 각 쪽** 비율로 선택 (`evidence_pdf_official_footer` 와 동일).
  `--force-portrait` 로 전 쪽 A4 세로만 강제 가능.
- **해상도:** JPEG/PNG는 원본 바이트 스트림을 PDF에 넣고, 저장 시 `deflate_images=False` 로
  재압축을 끈다(확대 시 원본 픽셀 유지). 화면/인쇄 맞춤은 여백 안에 맞게 **표시 크기만** 조정.
- 동영상(.mp4) 및 stem `갑제1-2호증_항공사진(확대)_196703051400070005` 는 **복사만**(조판 제외).
- 머리말(각 쪽 상단 여백 가운데): 인천광역시 연수구 농원근린공원 행정심판청구/집행정지신청
- 꼬리말: **좌** 작성일자(YYYY.MM.DD) · **가운데** 원본 파일명 · **우** 현재쪽/총쪽

검수(--audit-only 또는 처리 전):
  - 빈 파일명·미지원 확장자·출력 상대경로 충돌 시 실패.
  - 조판 대상 JPG/PNG: 열기·픽셀 크기 확인. PDF: 열기·0쪽 여부 확인.
  - 조판 시 `display_name`은 항상 `Path.name`(NFC)이며 비면 즉시 오류.

  python tools/typeset_gab_and_law_from_original.py --dry-run
  python tools/typeset_gab_and_law_from_original.py
  python tools/typeset_gab_and_law_from_original.py --audit-only
  python tools/typeset_gab_and_law_from_original.py --written-at 2026.04.09
  python tools/typeset_gab_and_law_from_original.py --force-portrait
"""
from __future__ import annotations

import argparse
import shutil
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF — 검수용 PDF 열기

import evidence_pdf_official_footer as epf

_REPO = Path(__file__).resolve().parent.parent
_EVID = _REPO / "행정심판청구(제출용)"
_WONMUN = _REPO / "행정심판청구(원본)"
SRC_DIR = _WONMUN / "갑호증 및 법령정보(원본)"
OUT_DIR = _EVID / "갑호증및법령정보"

HEADER_CENTER = "인천광역시 연수구 농원근린공원 행정심판청구/집행정지신청"
# 동영상과 함께 조판 제외(원본 복사)
_COPY_ONLY_STEM = "갑제1-2호증_항공사진(확대)_196703051400070005"

_ALLOWED = {".pdf", ".jpg", ".jpeg", ".png", ".mp4", ".jpe", ".jfif"}
_IMG_AUDIT = {".jpg", ".jpeg", ".png", ".jpe", ".jfif"}


def _audit_open_image(p: Path, rel: str) -> str | None:
    """이미지가 열리고 유효한 픽셀 크기인지. 실패 시 오류 한 줄."""
    try:
        from PIL import Image  # type: ignore[import-untyped]

        with Image.open(p) as im:
            im.load()
            w, h = im.size
        if w <= 0 or h <= 0:
            return f"이미지 크기 무효 (0 이하): {rel}"
    except Exception as e:
        return f"이미지 열기 실패: {rel} — {e}"
    return None


def _audit_open_pdf(p: Path, rel: str) -> str | None:
    try:
        doc = fitz.open(str(p.resolve()))
        try:
            if len(doc) < 1:
                return f"PDF에 쪽이 없음: {rel}"
        finally:
            doc.close()
    except Exception as e:
        return f"PDF 열기 실패: {rel} — {e}"
    return None


def _nfc_name(p: Path) -> str:
    return unicodedata.normalize("NFC", p.name)


def _nfc_stem(p: Path) -> str:
    return unicodedata.normalize("NFC", p.stem)


def collect_files(src: Path) -> list[Path]:
    if not src.is_dir():
        return []
    return sorted(p.resolve() for p in src.rglob("*") if p.is_file())


def audit(src: Path, files: list[Path]) -> list[str]:
    """치명적 문제만 문자열 목록으로 반환(비어 있으면 통과)."""
    errs: list[str] = []
    if not src.is_dir():
        errs.append(f"소스 폴더 없음: {src}")
        return errs
    by_out: dict[str, list[str]] = defaultdict(list)
    for p in files:
        name = _nfc_name(p)
        if not name.strip():
            errs.append(f"빈 파일명: {p}")
            continue
        suf = p.suffix.lower()
        if suf not in _ALLOWED:
            errs.append(f"미지원 확장자 ({suf}): {p.relative_to(src)}")
            continue
        rel = p.relative_to(src).as_posix()
        stem = _nfc_stem(p)
        copy_only = suf == ".mp4" or stem == _COPY_ONLY_STEM
        if not copy_only:
            if suf in _IMG_AUDIT:
                if msg := _audit_open_image(p, rel):
                    errs.append(msg)
            elif suf == ".pdf":
                if msg := _audit_open_pdf(p, rel):
                    errs.append(msg)
        if copy_only:
            out_rel = rel
        else:
            out_rel = Path(rel).with_suffix(".pdf").as_posix()
        by_out[out_rel].append(rel)
    for out_rel, ins in by_out.items():
        if len(ins) > 1:
            errs.append(f"출력 경로 충돌 «{out_rel}»: {ins}")
    return errs


def run(
    *,
    dry_run: bool,
    audit_only: bool,
    written_at: str | None,
    force_portrait: bool,
) -> int:
    src = SRC_DIR.resolve()
    out = OUT_DIR.resolve()
    files = collect_files(src)
    problems = audit(src, files)
    if problems:
        print("검수 실패:", file=sys.stderr)
        for line in problems:
            print(f"  - {line}", file=sys.stderr)
        return 1
    print(f"검수 통과: 파일 {len(files)}건 (소스: {src.relative_to(_REPO)})")
    if audit_only:
        return 0

    fontpath = str(p) if (p := epf._korean_font_path()) else None
    if not fontpath:
        print("경고: 한글 글꼴(malgun 등)을 찾지 못해 helv로 넣습니다.", file=sys.stderr)

    written_date = (written_at or "").strip() or datetime.now().strftime("%Y.%m.%d")
    typeset_n = copy_n = 0
    err = 0

    for p in files:
        rel = p.relative_to(src)
        display_name = _nfc_name(p)
        stem = _nfc_stem(p)
        suf = p.suffix.lower()
        copy_only = suf == ".mp4" or stem == _COPY_ONLY_STEM
        outp = out / rel if copy_only else out / rel.with_suffix(".pdf")

        if dry_run:
            mode = "복사" if copy_only else "조판→PDF"
            print(f"DRY [{mode}] {rel.as_posix()} → {outp.relative_to(_REPO)}")
            continue

        outp.parent.mkdir(parents=True, exist_ok=True)
        if copy_only:
            try:
                shutil.copy2(p, outp)
                print(f"복사: {outp.relative_to(_REPO)}")
                copy_n += 1
            except OSError as e:
                err += 1
                print(f"오류(복사): {rel} — {e}", file=sys.stderr)
            continue

        try:
            doc = epf._build_pages_from_src(
                p,
                display_name=display_name,
                written_at=written_date,
                fontpath=fontpath,
                force_portrait=force_portrait,
                header_center=HEADER_CENTER,
            )
            try:
                epf._save_pdf_preserve_image_streams(doc, outp)
            finally:
                doc.close()
            print(f"조판: {outp.relative_to(_REPO)}")
            typeset_n += 1
        except Exception as e:
            err += 1
            print(f"오류(조판): {rel} — {e}", file=sys.stderr)

    if dry_run:
        return 0
    print(f"끝 — 조판 {typeset_n}건, 복사 {copy_n}건, 오류 {err}건")
    return 1 if err else 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="갑호증 및 법령정보(원본) → 갑호증및법령정보 (가로·세로 자동·머리말·꼬리말)"
    )
    ap.add_argument("--dry-run", action="store_true", help="검수 후 목록만")
    ap.add_argument(
        "--audit-only",
        action="store_true",
        help="검수만 하고 종료(파일 쓰기 없음)",
    )
    ap.add_argument(
        "--written-at",
        default=None,
        metavar="YYYY.MM.DD",
        help="꼬리말 좌측 작성일자(기본: 오늘 날짜만)",
    )
    ap.add_argument(
        "--force-portrait",
        action="store_true",
        help="원본 비율과 무관하게 A4 세로만 사용",
    )
    args = ap.parse_args()
    return run(
        dry_run=args.dry_run,
        audit_only=args.audit_only,
        written_at=args.written_at,
        force_portrait=args.force_portrait,
    )


if __name__ == "__main__":
    raise SystemExit(main())
