#!/usr/bin/env python3
"""갑호증·법령정보 PDF → 1쪽 JPEG 썸네일 일괄 생성.

각 PDF 파일의 첫 페이지를 렌더링하여 같은 폴더에 `.thumb.jpg`로 저장한다.
이미 .thumb.jpg가 있고 PDF보다 최신이면 건너뛴다(--force로 재생성).

사용법:
    python tools/generate_gab_pdf_thumbs.py          # 변경분만
    python tools/generate_gab_pdf_thumbs.py --force   # 전체 재생성
"""
import argparse
import os
import sys
import time

import fitz  # PyMuPDF

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
EVIDENCE_BASE = os.path.join(REPO_ROOT, "행정심판청구(제출용)", "갑호증및법령정보")

THUMB_WIDTH = 400
JPEG_QUALITY = 80


def generate_thumb(pdf_path: str, thumb_path: str) -> bool:
    try:
        doc = fitz.open(pdf_path)
        if doc.page_count < 1:
            doc.close()
            return False
        page = doc[0]
        rect = page.rect
        if rect.width <= 0 or rect.height <= 0:
            doc.close()
            return False
        zoom = THUMB_WIDTH / rect.width
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pix.save(thumb_path, output="jpeg", jpg_quality=JPEG_QUALITY)
        pix = None
        doc.close()
        return True
    except Exception as e:
        print(f"  [ERROR] {pdf_path}: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="PDF 1쪽 썸네일 일괄 생성")
    parser.add_argument("--force", action="store_true", help="기존 썸네일도 재생성")
    args = parser.parse_args()

    if not os.path.isdir(EVIDENCE_BASE):
        print(f"증거 폴더를 찾을 수 없습니다: {EVIDENCE_BASE}", file=sys.stderr)
        sys.exit(1)

    pdf_files = []
    for root, _dirs, files in os.walk(EVIDENCE_BASE):
        for f in sorted(files):
            if f.lower().endswith(".pdf") and not f.startswith("."):
                pdf_files.append(os.path.join(root, f))

    created = 0
    skipped = 0
    failed = 0
    t0 = time.time()
    for pdf_path in pdf_files:
        thumb_path = pdf_path.rsplit(".", 1)[0] + ".thumb.jpg"
        if not args.force and os.path.isfile(thumb_path):
            pdf_mtime = os.path.getmtime(pdf_path)
            thumb_mtime = os.path.getmtime(thumb_path)
            if thumb_mtime >= pdf_mtime:
                skipped += 1
                continue
        rel = os.path.relpath(pdf_path, REPO_ROOT)
        if generate_thumb(pdf_path, thumb_path):
            created += 1
            print(f"  [OK] {rel}")
        else:
            failed += 1

    elapsed = time.time() - t0
    print(f"\n완료: 생성 {created}, 건너뜀 {skipped}, 실패 {failed}  ({elapsed:.1f}초)")


if __name__ == "__main__":
    main()
