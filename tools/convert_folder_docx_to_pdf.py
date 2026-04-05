# -*- coding: utf-8 -*-
"""폴더 트리 안의 모든 .docx를 같은 경로·이름의 .pdf로 변환한다."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
if str(_REPO / "tools") not in sys.path:
    sys.path.insert(0, str(_REPO / "tools"))
from pdf_convert_util import convert_docx_to_pdf


def main() -> None:
    ap = argparse.ArgumentParser(description="폴더 내 docx → pdf (Word 또는 LibreOffice)")
    ap.add_argument(
        "folder",
        type=Path,
        nargs="?",
        default=_REPO / "행정심판청구(최종)",
        help="검색 루트 (기본: 저장소 행정심판청구(최종))",
    )
    ap.add_argument(
        "--delete-docx",
        action="store_true",
        help="변환 성공 후 원본 .docx 삭제",
    )
    args = ap.parse_args()
    root = args.folder.resolve()
    if not root.is_dir():
        print("폴더 없음:", root, file=sys.stderr)
        sys.exit(1)
    docx_files = sorted(root.rglob("*.docx"))
    if not docx_files:
        print("docx 없음:", root)
        return
    ok = 0
    for docx in docx_files:
        pdf = docx.with_suffix(".pdf")
        try:
            convert_docx_to_pdf(docx, pdf)
            print("OK", docx.relative_to(root))
            ok += 1
            if args.delete_docx:
                docx.unlink()
                print("  삭제", docx.name)
        except Exception as e:
            print("FAIL", docx, e, file=sys.stderr)
            sys.exit(1)
    print("완료:", ok, "개")


if __name__ == "__main__":
    main()
