# -*- coding: utf-8 -*-
"""갑8-2·갑9-2 요약 PDF 첫 페이지 우측 상단에 유튜브 링크 QR 이미지를 삽입합니다.

- 기존 `QR_갑제7-1호증_…png` 등과 **동일 URL**을 쓰며, PDF 안에도 스캔할 수 있게 합니다.
- 최초 실행 시에만 원본을 `*.pdf.bak` 으로 복사한 뒤 같은 파일명으로 덮어씁니다.
- URL 변경: `행정심판청구(증거)/최종/갑호증/gab_qr_urls.txt` (`항공=` / `위법=`)

의존성: `pip install "qrcode[pil]"` · PyMuPDF (`pip install pymupdf`)

실행: 프로젝트 루트에서 `python tools/embed_gab_qr_in_pdfs.py`
      `--dry-run` 이면 백업·저장 없이 좌표만 검사합니다.
      `--restore-bak-first` 는 `*.pdf.bak` 이 있으면 그걸로 PDF를 덮어쓴 뒤 QR을 넣습니다(재실행 시 이중 QR 방지).
"""
from __future__ import annotations

import argparse
import io
import re
import shutil
from pathlib import Path

import fitz  # PyMuPDF

_REPO = Path(__file__).resolve().parent.parent
GAB = _REPO / "행정심판청구(증거)" / "최종" / "갑호증"
CONFIG = GAB / "gab_qr_urls.txt"

DEFAULT_URLS = {
    "항공": "https://youtu.be/nrVMUoRzQ-Q",
    "위법": "https://youtu.be/LCyquvKKdCw",
}

TARGETS: list[tuple[str, Path, str]] = [
    (
        "항공",
        GAB / "갑제7-2호증_항공사진(1947~2023) 증거자료.pdf",
        "갑8-2 항공 시계열 요약",
    ),
    (
        "위법",
        GAB / "갑제8-2호증_위법한 선행행정행위 증거자료.pdf",
        "갑9-2 위법 선행 행정",
    ),
]


def load_overrides() -> dict[str, str]:
    if not CONFIG.is_file():
        return {}
    out: dict[str, str] = {}
    for line in CONFIG.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^(항공|위법)\s*=\s*(\S+)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def qr_png_bytes(url: str, px: int = 400) -> bytes:
    import qrcode

    qr = qrcode.QRCode(version=None, box_size=4, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((px, px))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _save_doc_preserve_images(doc: fitz.Document, out_path: Path) -> None:
    """clean=True·과도한 재작성을 피하고, 가능하면 증분 저장으로 기존 이미지 스트림을 그대로 둡니다."""
    p = out_path.resolve()
    outp = str(p)
    opened = Path(doc.name).resolve() if doc.name else None
    if opened == p and doc.can_save_incrementally():
        try:
            doc.save(outp, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
            return
        except Exception:
            pass
    tmp = p.with_suffix(".tmp_embed.pdf")
    if tmp.is_file():
        tmp.unlink()
    # PyMuPDF 권장: garbage+deflate 만으로 용량 정리, clean 은 시각 변화 가능 → 끔.
    # deflate_images 는 '비압축' 이미지 스트림만 대상이나 명시적으로 끔.
    doc.save(
        str(tmp),
        garbage=4,
        deflate=True,
        clean=False,
        deflate_images=False,
        deflate_fonts=False,
    )
    tmp.replace(p)


def qr_rect_on_page(page: fitz.Page, size_pt: float = 72.0, margin_pt: float = 36.0) -> fitz.Rect:
    r = page.rect
    w, h = r.width, r.height
    # 우측 상단 (PDF 좌표: 원점 왼쪽 아래 — Rect는 좌하·우상)
    x1 = r.x1 - margin_pt - size_pt
    y0 = r.y1 - margin_pt - size_pt
    x2 = r.x1 - margin_pt
    y1 = r.y1 - margin_pt
    rect = fitz.Rect(x1, y0, x2, y1)
    # 페이지 안으로 클램프
    rect = rect & r
    if rect.width < 20 or rect.height < 20:
        raise ValueError("QR 넣을 만한 여백이 첫 페이지에 없습니다.")
    return rect


def embed_one(
    pdf_path: Path,
    url: str,
    *,
    dry_run: bool,
    label: str,
    restore_bak_first: bool,
) -> None:
    if not pdf_path.is_file():
        print(f"SKIP(없음): {pdf_path.name}")
        return

    bak = pdf_path.with_suffix(pdf_path.suffix + ".bak")
    if restore_bak_first and bak.is_file() and not dry_run:
        shutil.copy2(bak, pdf_path)
        print(f"복구 후 재삽입: {pdf_path.name} ← {bak.name}")

    doc = fitz.open(str(pdf_path.resolve()))
    page = doc[0]
    rect = qr_rect_on_page(page)
    png = qr_png_bytes(url)
    if dry_run:
        doc.close()
        print(f"DRY-RUN {label}: {pdf_path.name} page0 rect={rect!r} url={url}")
        return

    if not bak.is_file():
        shutil.copy2(pdf_path, bak)
        print(f"백업: {bak.name}")

    page.insert_image(rect, stream=png, keep_proportion=True, overlay=True)
    _save_doc_preserve_images(doc, pdf_path)
    doc.close()
    print(f"OK {label}: {pdf_path.name} (QR 삽입, 화질 보존 저장)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--restore-bak-first",
        action="store_true",
        help="*.pdf.bak 이 있으면 먼저 PDF를 백업본으로 되돌린 뒤 QR 삽입(같은 PDF에 QR을 두 번 넣지 않음)",
    )
    args = ap.parse_args()

    urls = {**DEFAULT_URLS, **load_overrides()}
    for key, path, label in TARGETS:
        embed_one(
            path,
            urls[key],
            dry_run=args.dry_run,
            label=label,
            restore_bak_first=args.restore_bak_first,
        )


if __name__ == "__main__":
    main()
