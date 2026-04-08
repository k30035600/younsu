# -*- coding: utf-8 -*-
"""USB `갑호증및법령정보` 트리 → PDF 조판(꼬리말).

- 소스(기본): 저장소 루트 `USB/갑호증및법령정보/` 및 모든 하위 폴더.
- 대상: PDF·이미지는 조판. **`.mp4`** 및 아래 **파일명**은 조판하지 않고 **원본 바이트 복사**(출력 트리에 동일 상대경로·동일 확장자).
- 복사 전용 stem: `갑제1-2호증_항공사진(확대)_196703051400070005`, `행정기본법_질의응답_사례집(최종)` — 조판 없이 복사(출력 확장자는 원본과 동일).
- 조판 대상: **PDF** + **이미지**. `%PDF` 시그니처면 확장자 없이도 PDF로 처리.
- **기본 조판(권장):** **A4 세로**로 통일 + **공문서 작성 지침에 맞춘 여백(mm)** + 꼬리말. PDF·이미지는 본문 사각형 `cr` 안에 `keep_proportion` 으로 맞춤. (`show_pdf_page` 의 `clip` 은 **소스 페이지 좌표**용이라 목적지 `cr` 을 넘기면 원본이 잘리므로 사용하지 않음.)
- **선택 `--allow-a4-landscape`:** **전체** PDF·이미지에 대해 가로가 긴 원본은 **A4 가로**로 (`evidence_pdf_official_footer` 와 동일).
- **일부 PDF 예외:** 아래 stem 은 `--allow-a4-landscape` 없이도 **각 PDF 쪽**의 가로·세로 비율에 따라 A4 가로/세로를 골라 조판(다쪽 문서에서 쪽마다 다를 수 있음).
- **이미지:** 먼저 **EXIF Orientation**(카메라·스캔 세로/뒤집힘)을 `ImageOps.exif_transpose` 로 반영한 뒤, **A4 세로**이고 가로형이면 **+90°** 회전. 그래도 방향이 맞지 않는 소수 파일은 원본 JPEG 메타를 확인하거나 원본 복사 예외를 검토.
- **선택 `--native-size`:** 페이지 크기를 원본 픽셀·PDF mediabox에 맞춤(이전 방식). PDF 는 `show_pdf_page` 로 본문 영역에 맞춤.
- 꼬리말(각 쪽): **좌** 작성일시 · **가운데** 원본 파일명 · **우** `현재쪽/총쪽`

의존성: `pip install pymupdf` (Pillow 권장 — DPI·GIF 첫 프레임)

실행(저장소 루트):

  python tools/usb_gab_law_to_pdf_footer.py
  python tools/usb_gab_law_to_pdf_footer.py --allow-a4-landscape
  python tools/usb_gab_law_to_pdf_footer.py --native-size
  python tools/usb_gab_law_to_pdf_footer.py --dry-run
  python tools/usb_gab_law_to_pdf_footer.py --src "D:/path/to/갑호증및법령정보"
  python tools/usb_gab_law_to_pdf_footer.py --out USB/갑호증및법령정보_pdf
"""
from __future__ import annotations

import argparse
import shutil
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF

import evidence_pdf_official_footer as epf

_REPO = Path(__file__).resolve().parent.parent
_DEFAULT_SRC = _REPO / "USB" / "갑호증및법령정보"
_DEFAULT_OUT = _REPO / "USB" / "갑호증및법령정보_pdf"

# 조판 생략 — stem(확장자 제외) 일치 시 원본만 복사. (갑1-2 항공사진은 USB 소스가 .jpg 인 경우가 많음)
_COPY_ORIGINAL_STEMS = frozenset(
    {
        "갑제1-2호증_항공사진(확대)_196703051400070005",
        "행정기본법_질의응답_사례집(최종)",
    }
)

# PDF만: 기본(A4 세로 통일)이어도 이 stem 은 쪽별 가로·세로로 A4 방향 자동
_PDF_A4_BY_PAGE_ASPECT_STEMS = frozenset(
    {
        "갑제7-2호증_항공사진(1947~2023) 출력물",
        "갑제8-2호증_위법한 선행행정 출력물",
    }
)

def _nfc_stem(p: Path) -> str:
    """파일명이 NFD·NFC 혼용일 때 stem 예외가 빗나가지 않도록."""
    return unicodedata.normalize("NFC", p.stem)


# 래스터: EXIF·(필요 시) 가로+90° 이후 PIL 추가 회전(반시계). 키는 NFC stem.
_RASTER_EXTRA_PIL_ROTATE: dict[str, int] = {}

_IMG_EXT = {
    ".jpg",
    ".jpeg",
    ".jpe",
    ".jfif",
    ".png",
    ".webp",
    ".gif",
    ".tif",
    ".tiff",
    ".bmp",
}
_PDF_EXT = {".pdf"}


def _sniff_pdf_header(path: Path, nbytes: int = 2048) -> bool:
    """파일 앞부분에 `%PDF` 가 있으면 PDF로 간주(확장자 오류·무확장자 대비)."""
    try:
        with path.open("rb") as f:
            head = f.read(nbytes)
        return head.startswith(b"%PDF")
    except OSError:
        return False


def _safe_pixmap_release(p: fitz.Pixmap | None) -> None:
    if p is None:
        return
    cl = getattr(p, "close", None)
    if callable(cl):
        cl()


def _image_content_pt(path: Path) -> tuple[float, float]:
    """이미지 본문이 차지할 크기(pt). DPI 없으면 96."""
    try:
        from PIL import Image  # type: ignore[import-untyped]

        prev = getattr(Image, "MAX_IMAGE_PIXELS", None)
        if prev is not None:
            Image.MAX_IMAGE_PIXELS = None
        try:
            with Image.open(path) as im:
                im.seek(0)
                w, h = im.size
                dpi = im.info.get("dpi")
                if dpi and isinstance(dpi, tuple) and len(dpi) >= 2:
                    dx, dy = float(dpi[0]), float(dpi[1])
                else:
                    dx = dy = 96.0
                if dx <= 0:
                    dx = 96.0
                if dy <= 0:
                    dy = 96.0
                return w * 72.0 / dx, h * 72.0 / dy
        finally:
            if prev is not None:
                Image.MAX_IMAGE_PIXELS = prev
    except Exception:
        pass
    iw, ih = epf._image_pixel_size(path)
    return float(iw) * 72.0 / 96.0, float(ih) * 72.0 / 96.0


def _image_pixel_wh(path: Path) -> tuple[int, int]:
    return epf._image_pixel_size(path)


def _pil_normalize_exif_transpose(path: Path):
    """EXIF Orientation 반영한 PIL Image. 실패 시 None."""
    try:
        from PIL import Image, ImageOps  # type: ignore[import-untyped]

        prev = getattr(Image, "MAX_IMAGE_PIXELS", None)
        if prev is not None:
            Image.MAX_IMAGE_PIXELS = None
        try:
            with Image.open(path) as im:
                im.seek(0)
                base = im.copy()
            return ImageOps.exif_transpose(base)
        finally:
            if prev is not None:
                Image.MAX_IMAGE_PIXELS = prev
    except Exception:
        return None


def _encode_pil_image_to_stream(im) -> tuple[bytes, str]:
    from io import BytesIO

    buf = BytesIO()
    if im.mode in ("RGBA", "LA") or (
        im.mode == "P" and "transparency" in getattr(im, "info", {})
    ):
        if im.mode != "RGBA":
            im = im.convert("RGBA")
        im.save(buf, format="PNG")
        return buf.getvalue(), "png"
    if im.mode != "RGB":
        im = im.convert("RGB")
    im.save(buf, format="JPEG", quality=95, optimize=True)
    return buf.getvalue(), "jpeg"


def _usb_raster_to_jpeg_png_bytes(
    src_path: Path,
    *,
    apply_landscape_90: bool,
) -> tuple[bytes, str] | None:
    """EXIF 정규화 후, 가로형이면 +90°(옵션), stem별 추가 각도(`_RASTER_EXTRA_PIL_ROTATE`). 실패 시 None."""
    im = _pil_normalize_exif_transpose(src_path)
    if im is None:
        return None
    try:
        from PIL import Image  # type: ignore[import-untyped]

        _bicubic = getattr(
            getattr(Image, "Resampling", Image), "BICUBIC", Image.BICUBIC
        )
        stem = _nfc_stem(src_path)
        iw, ih = im.size
        if apply_landscape_90 and iw > ih:
            im = im.rotate(90, expand=True, resample=_bicubic)
            iw, ih = im.size
        extra = int(_RASTER_EXTRA_PIL_ROTATE.get(stem, 0)) % 360
        if extra:
            im = im.rotate(extra, expand=True, resample=_bicubic)
        return _encode_pil_image_to_stream(im)
    except Exception:
        return None


def _pil_size_for_layout(src_path: Path) -> tuple[int, int] | None:
    """A4 가로/세로 판단용 — EXIF 반영 후 픽셀 크기."""
    im = _pil_normalize_exif_transpose(src_path)
    if im is None:
        return None
    w, h = im.size
    return w, h


def _content_pt_from_pil_size(iw: int, ih: int, dpi_x: float, dpi_y: float) -> tuple[float, float]:
    if dpi_x <= 0:
        dpi_x = 96.0
    if dpi_y <= 0:
        dpi_y = 96.0
    return float(iw) * 72.0 / dpi_x, float(ih) * 72.0 / dpi_y


def _content_pt_from_pil_im(im) -> tuple[float, float]:
    """PIL 이미지 기준 본문 pt (DPI는 info·없으면 96)."""
    iw, ih = im.size
    dpi = im.info.get("dpi")
    if dpi and isinstance(dpi, tuple) and len(dpi) >= 2:
        dx, dy = float(dpi[0]), float(dpi[1])
    else:
        dx = dy = 96.0
    return _content_pt_from_pil_size(iw, ih, dx, dy)


def _insert_raster_image_maybe_rotated(
    page: fitz.Page,
    cr: fitz.Rect,
    src_path: Path,
    *,
    rotate_landscape_90: bool,
) -> None:
    """EXIF 반영 후 삽입. rotate_landscape_90 이면 가로형만 +90°."""
    got = _usb_raster_to_jpeg_png_bytes(src_path, apply_landscape_90=rotate_landscape_90)
    if got is None:
        epf._insert_raster_image(page, cr, src_path)
        return
    raw, kind = got
    if kind == "png":
        page.insert_image(cr, stream=raw, keep_proportion=True)
    else:
        page.insert_image(cr, stream=raw, keep_proportion=True, alpha=0)


def _src_page_wh_pt(src_page: fitz.Page) -> tuple[float, float]:
    w, h = src_page.rect.width, src_page.rect.height
    if src_page.rotation in (90, 270):
        w, h = h, w
    return w, h


def _draw_page_footer(
    page: fitz.Page,
    *,
    display_name: str,
    written_at: str,
    fontpath: str | None,
    pno1: int,
    total: int,
) -> None:
    epf._draw_footer(
        page,
        left=written_at,
        center=epf._truncate_center(display_name),
        right=f"{pno1} / {total}",
        fontpath=fontpath,
    )


def _build_official_a4_pages(
    src_path: Path,
    *,
    display_name: str,
    written_at: str,
    fontpath: str | None,
    force_portrait: bool = True,
) -> fitz.Document:
    """A4 + 공문 여백 + 꼬리말. `force_portrait=True`(기본)이면 항상 A4 세로."""
    ml, mr, mt, mb_body, fh = epf._margins_pt()
    out = fitz.open()
    suffix = src_path.suffix.lower()
    treat_as_pdf = suffix in _PDF_EXT or _sniff_pdf_header(src_path)

    if treat_as_pdf:
        force_p_each_page = force_portrait and (
            src_path.stem not in _PDF_A4_BY_PAGE_ASPECT_STEMS
        )
        sdoc = fitz.open(str(src_path.resolve()))
        try:
            total = len(sdoc)
            if total < 1:
                raise ValueError("PDF 페이지가 없습니다.")
            for pno in range(total):
                sp = sdoc[pno]
                w, h = sp.rect.width, sp.rect.height
                if sp.rotation in (90, 270):
                    w, h = h, w
                landscape = False if force_p_each_page else epf._landscape_from_wh(w, h)
                pw, ph = epf._a4_page_size_pt(landscape=landscape)
                np = out.new_page(width=pw, height=ph)
                cr = epf._content_rect(np.rect, ml, mr, mt, mb_body, fh)
                # clip 은 소스 PDF 좌표 — 목적지 cr 을 넘기면 원본이 잘림
                np.show_pdf_page(cr, sdoc, pno, keep_proportion=True)
                _draw_page_footer(
                    np,
                    display_name=display_name,
                    written_at=written_at,
                    fontpath=fontpath,
                    pno1=pno + 1,
                    total=total,
                )
        finally:
            sdoc.close()
        return out

    if suffix in _IMG_EXT:
        dims = _pil_size_for_layout(src_path)
        if dims:
            iw, ih = dims
        else:
            iw, ih = epf._image_pixel_size(src_path)
        landscape = False if force_portrait else epf._landscape_from_wh(float(iw), float(ih))
        pw, ph = epf._a4_page_size_pt(landscape=landscape)
        page = out.new_page(width=pw, height=ph)
        cr = epf._content_rect(page.rect, ml, mr, mt, mb_body, fh)
        _insert_raster_image_maybe_rotated(
            page,
            cr,
            src_path,
            rotate_landscape_90=force_portrait,
        )
        _draw_page_footer(
            page,
            display_name=display_name,
            written_at=written_at,
            fontpath=fontpath,
            pno1=1,
            total=1,
        )
        return out

    raise ValueError(f"지원하지 않는 형식: {suffix}")


def _build_native_pages(
    src_path: Path,
    *,
    display_name: str,
    written_at: str,
    fontpath: str | None,
) -> fitz.Document:
    """원본 크기 페이지 + 공문 여백 수치(mm)는 동일. 본문은 clip 으로 꼬리말 침범 방지."""
    ml, mr, mt, mb_body, fh = epf._margins_pt()
    out = fitz.open()
    suffix = src_path.suffix.lower()
    treat_as_pdf = suffix in _PDF_EXT or _sniff_pdf_header(src_path)

    if treat_as_pdf:
        sdoc = fitz.open(str(src_path.resolve()))
        try:
            total = len(sdoc)
            if total < 1:
                raise ValueError("PDF 페이지가 없습니다.")
            for pno in range(total):
                sp = sdoc[pno]
                cw, ch = _src_page_wh_pt(sp)
                pw = ml + mr + cw
                ph = mt + mb_body + fh + ch
                np = out.new_page(width=pw, height=ph)
                cr = epf._content_rect(np.rect, ml, mr, mt, mb_body, fh)
                np.show_pdf_page(cr, sdoc, pno, keep_proportion=True)
                _draw_page_footer(
                    np,
                    display_name=display_name,
                    written_at=written_at,
                    fontpath=fontpath,
                    pno1=pno + 1,
                    total=total,
                )
        finally:
            sdoc.close()
        return out

    if suffix in _IMG_EXT:
        im = _pil_normalize_exif_transpose(src_path)
        if im is None:
            iw, ih = _image_pixel_wh(src_path)
            cw, ch = _image_content_pt(src_path)
        else:
            iw, ih = im.size
            cw, ch = _content_pt_from_pil_im(im)
        if iw > ih:
            cw, ch = ch, cw
        pw = ml + mr + cw
        ph = mt + mb_body + fh + ch
        page = out.new_page(width=pw, height=ph)
        cr = epf._content_rect(page.rect, ml, mr, mt, mb_body, fh)
        _insert_raster_image_maybe_rotated(
            page,
            cr,
            src_path,
            rotate_landscape_90=True,
        )
        _draw_page_footer(
            page,
            display_name=display_name,
            written_at=written_at,
            fontpath=fontpath,
            pno1=1,
            total=1,
        )
        return out

    raise ValueError(f"지원하지 않는 형식: {suffix}")


def _iter_files(src_root: Path) -> list[Path]:
    if not src_root.is_dir():
        return []
    out: list[Path] = []
    for p in sorted(src_root.rglob("*")):
        if not p.is_file():
            continue
        out.append(p.resolve())
    return out


def _copy_original_only(src_file: Path) -> bool:
    """조판하지 않고 원본만 복사할 파일."""
    if src_file.suffix.lower() == ".mp4":
        return True
    return src_file.stem in _COPY_ORIGINAL_STEMS


def run(
    *,
    src_root: Path,
    out_root: Path,
    dry_run: bool,
    skip_existing: bool,
    limit: int | None,
    written_at: str | None,
    native_size: bool,
    allow_a4_landscape: bool,
) -> int:
    fontpath = str(p) if (p := epf._korean_font_path()) else None
    if not fontpath:
        print("경고: 한글 글꼴(malgun 등)을 찾지 못해 helv로 꼬리말을 넣습니다.", file=sys.stderr)

    if not src_root.is_dir():
        print(f"오류: 소스 폴더가 없습니다: {src_root}", file=sys.stderr)
        return 1

    ts = written_at or datetime.now().strftime("%Y.%m.%d %H:%M")
    files = _iter_files(src_root)
    if limit is not None:
        files = files[:limit]

    done = 0
    err = 0
    skipped = 0
    for src_file in files:
        suf = src_file.suffix.lower()
        rel = src_file.relative_to(src_root)

        if _copy_original_only(src_file):
            outp = out_root / rel
            if dry_run:
                print(f"DRY-RUN [원본복사] → {outp}")
                done += 1
                continue
            if skip_existing and outp.is_file() and outp.stat().st_size > 0:
                print(f"SKIP(있음): {outp}")
                done += 1
                continue
            outp.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copy2(src_file, outp)
                print(f"복사(원본): {outp}")
                if src_file.stem in _COPY_ORIGINAL_STEMS:
                    stale_pdf = outp.parent / f"{src_file.stem}.pdf"
                    if stale_pdf.is_file() and stale_pdf.resolve() != outp.resolve():
                        stale_pdf.unlink()
                        print(f"삭제(구조판 PDF): {stale_pdf}")
                done += 1
            except Exception as e:
                err += 1
                print(f"오류(복사): {rel} — {e}", file=sys.stderr)
            continue

        is_pdf = suf in _PDF_EXT or _sniff_pdf_header(src_file)
        if not is_pdf and suf not in _IMG_EXT:
            print(f"건너뜀(형식): {rel}")
            skipped += 1
            continue

        outp = (out_root / rel).with_suffix(".pdf")
        if dry_run:
            print(f"DRY-RUN [조판] → {outp}")
            done += 1
            continue
        if skip_existing and outp.is_file() and outp.stat().st_size > 0:
            print(f"SKIP(있음): {outp}")
            done += 1
            continue
        outp.parent.mkdir(parents=True, exist_ok=True)
        try:
            if native_size:
                doc = _build_native_pages(
                    src_file,
                    display_name=src_file.name,
                    written_at=ts,
                    fontpath=fontpath,
                )
            else:
                doc = _build_official_a4_pages(
                    src_file,
                    display_name=src_file.name,
                    written_at=ts,
                    fontpath=fontpath,
                    force_portrait=not allow_a4_landscape,
                )
            try:
                epf._save_pdf_preserve_image_streams(doc, outp)
            finally:
                doc.close()
            print(f"작성: {outp}")
            done += 1
        except Exception as e:
            err += 1
            print(f"오류: {rel} — {e}", file=sys.stderr)

    print(f"완료 {done}건, 건너뜀(형식) {skipped}건, 오류 {err}건 (파일 {len(files)}건)")
    return 1 if err else 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="USB 갑호증및법령정보 → PDF·이미지 조판(기본 A4 세로·공문 여백 + 꼬리말)"
    )
    ap.add_argument(
        "--src",
        type=Path,
        default=_DEFAULT_SRC,
        help=f"소스 루트 (기본: {_DEFAULT_SRC})",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=_DEFAULT_OUT,
        help=f"출력 루트 — 조판은 .pdf, mp4·지정 파일은 원본 확장자 그대로 (기본: {_DEFAULT_OUT})",
    )
    ap.add_argument("--dry-run", action="store_true", help="저장 없이 출력 경로만 표시")
    ap.add_argument("--skip-existing", action="store_true", help="출력 PDF가 있으면 건너뜀")
    ap.add_argument("--limit", type=int, default=None, metavar="N", help="앞에서 N개만 처리")
    ap.add_argument(
        "--written-at",
        default=None,
        help='꼬리말 좌측 작성일시(기본: 실행 시각 "YYYY.MM.DD HH:MM")',
    )
    ap.add_argument(
        "--native-size",
        action="store_true",
        help="A4 대신 원본(이미지 DPI·PDF mediabox) 크기로 페이지 생성(가로 원본은 가로로 긴 페이지가 될 수 있음)",
    )
    ap.add_argument(
        "--allow-a4-landscape",
        action="store_true",
        help="가로가 긴 원본은 A4 가로로 (기본은 전부 A4 세로)",
    )
    args = ap.parse_args()

    def _resolve_path(p: Path) -> Path:
        return p.resolve() if p.is_absolute() else (_REPO / p).resolve()

    src_root = _resolve_path(args.src)
    out_root = _resolve_path(args.out)
    return run(
        src_root=src_root,
        out_root=out_root,
        dry_run=args.dry_run,
        skip_existing=args.skip_existing,
        limit=args.limit,
        written_at=args.written_at,
        native_size=args.native_size,
        allow_a4_landscape=args.allow_a4_landscape,
    )


if __name__ == "__main__":
    raise SystemExit(main())
