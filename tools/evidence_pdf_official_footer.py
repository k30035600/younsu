# -*- coding: utf-8 -*-
"""갑호증·법령정보의 이미지·PDF를 공문서 여백에 가깝게 A4 PDF로 옮기고, 꼬리말을 넣는다.

- 소스 루트: `행정심판청구(증거)/{갑호증|법령정보}` 및 동일 이름의 **`최종/`** 하위(`…/최종/갑호증` 등). 동일 상대경로는 `최종/` 쪽을 우선.
- 대상: `.jpg` `.jpeg` `.png` `.pdf` `.mp4`(대소문자 무시). 그 외 확장자는 제외.
- 출력(기본): `행정심판청구(증거)/official_pdf_out/{갑호증|법령정보}/…` 에 원본과 동일한 상대 경로(`--out` 으로 변경 가능). 조판 시 `.mp4`·원본복사 목록은 **원본 확장자 유지**, 그 외 이미지·PDF는 `.pdf`.
- 꼬리말(각 쪽): **좌** 작성일시 · **가운데** 원본 파일명 · **우** `현재쪽/총쪽`
- 여백(mm): 상 28 · 하 20(본문) + 꼬리말 10 · 좌 28 · 우 26(조판본만).
- **방향:** 이미지는 픽셀 가로·세로 비교, PDF는 **각 원본 쪽**의 가로·세로 비교 → 가로형이면 **A4 가로**, 세로형이면 **A4 세로**(정사각형은 세로).
- **해상도:** JPEG/PNG는 가능하면 **파일 원본 바이트를 그대로** PDF에 넣고(`stream`), 저장 시 **`deflate_images=False`** 로 이미지 재압축을 끈다. (한 페이지 맞춤 보기에서는 작게 보여 부드럽게 느껴질 수 있으나 **확대 시 원본 픽셀**이 유지된다.)
- **원본만 복사(조판 안 함):** 모든 `.mp4`, 파일명 `행정기본법_질의응답_사례집(최종).pdf`, `갑제1-2호증_항공사진(원본)_196703051400070005.jpg`.

의존성: `pip install pymupdf` (이미지 크기만 읽을 때는 선택적으로 Pillow)

실행(프로젝트 루트):

  python tools/evidence_pdf_official_footer.py
  python tools/evidence_pdf_official_footer.py --dry-run
  python tools/evidence_pdf_official_footer.py --limit 3
  python tools/evidence_pdf_official_footer.py --only-under 갑제14호증
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF

_REPO = Path(__file__).resolve().parent.parent
_EVIDENCE = _REPO / "행정심판청구(증거)"
_DEFAULT_OUT = _EVIDENCE / "official_pdf_out"
_SOURCE_NAMES = ("갑호증", "법령정보")


def _source_roots() -> list[Path]:
    """스캔할 갑호증·법령정보 루트. `최종/` 아래가 실제 제출본인 경우가 많아 함께 스캔한다.

    동일 (폴더명, 상대경로)가 두 루트에 있으면 리스트에서 **뒤**에 온 루트(보통 `최종/…`)가 우선한다.
    `갑호증/법령정보/` 는 `갑호증` 루트 `rglob` 에 포함되므로 별도 루트를 두지 않는다.
    """
    roots: list[Path] = []
    for name in _SOURCE_NAMES:
        roots.append(_EVIDENCE / name)
        roots.append(_EVIDENCE / "최종" / name)
    return roots

# 공문 여백(mm) + 꼬리말 구역 (증거용으로 약간 타이트하게 해 본문 이미지 표시 영역 확보)
_MM_TOP = 28.0
_MM_BOTTOM_BODY = 20.0
_MM_FOOTER = 10.0
_MM_LEFT = 28.0
_MM_RIGHT = 26.0

_IMG_EXT = {".jpg", ".jpeg", ".png", ".jpe", ".jfif"}
_PDF_EXT = {".pdf"}

# 조판 생략 시 원본 바이트만 복사(재조판·꼬리말 없음). 파일명 기준(확장자 포함).
_COPY_ORIGINAL_BASENAMES = frozenset(
    {
        "행정기본법_질의응답_사례집(최종).pdf",
        "갑제1-2호증_항공사진(원본)_196703051400070005.jpg",
    }
)


def _mm_to_pt(mm: float) -> float:
    return mm * 72.0 / 25.4


def _safe_pixmap_release(p: fitz.Pixmap | None) -> None:
    if p is None:
        return
    cl = getattr(p, "close", None)
    if callable(cl):
        cl()


def _korean_font_path() -> Path | None:
    win = os.environ.get("WINDIR", r"C:\Windows")
    # TTC는 insert_font에서 실패할 수 있어 TTF 우선
    for name in ("malgun.ttf", "malgunsl.ttf"):
        p = Path(win) / "Fonts" / name
        if p.is_file():
            return p
    return None


def _margins_pt() -> tuple[float, float, float, float, float]:
    """left, right, top, bottom_body, footer_zone — pt"""
    return (
        _mm_to_pt(_MM_LEFT),
        _mm_to_pt(_MM_RIGHT),
        _mm_to_pt(_MM_TOP),
        _mm_to_pt(_MM_BOTTOM_BODY),
        _mm_to_pt(_MM_FOOTER),
    )


def _a4_page_size_pt(*, landscape: bool) -> tuple[float, float]:
    """(width_pt, height_pt) — A4 한 장."""
    r = fitz.paper_rect("a4")
    if landscape:
        return r.height, r.width
    return r.width, r.height


def _landscape_from_wh(width: float, height: float) -> bool:
    """가로가 세로보다 길면 가로(A4 landscape). 정사각형·세로형은 세로."""
    return width > height


def _image_pixel_size(path: Path) -> tuple[int, int]:
    """이미지 (w, h). Pillow 우선(가벼움), 실패 시 Pixmap."""
    try:
        from PIL import Image  # type: ignore[import-untyped]

        # 초대형 이미지 경고만 억제(픽셀 수는 그대로 읽음)
        prev = getattr(Image, "MAX_IMAGE_PIXELS", None)
        if prev is not None:
            Image.MAX_IMAGE_PIXELS = None
        try:
            with Image.open(path) as im:
                return im.size
        finally:
            if prev is not None:
                Image.MAX_IMAGE_PIXELS = prev
    except Exception:
        pix = fitz.Pixmap(str(path.resolve()))
        try:
            return pix.width, pix.height
        finally:
            _safe_pixmap_release(pix)


def _content_rect(page_rect: fitz.Rect, ml: float, mr: float, mt: float, mb_body: float, footer: float) -> fitz.Rect:
    """본문(원본 페이지/이미지)이 들어갈 영역 — 꼬리말 위까지."""
    return fitz.Rect(
        page_rect.x0 + ml,
        page_rect.y0 + mt,
        page_rect.x1 - mr,
        page_rect.y1 - mb_body - footer,
    )


def _draw_footer(
    page: fitz.Page,
    *,
    left: str,
    center: str,
    right: str,
    fontpath: str | None,
) -> None:
    r = page.rect
    ml, mr, _mt, mb_body, fh = _margins_pt()
    foot = fitz.Rect(
        r.x0 + ml,
        r.y1 - mb_body - fh,
        r.x1 - mr,
        r.y1 - mb_body,
    )
    # 구분선
    page.draw_line(
        fitz.Point(foot.x0, foot.y0),
        fitz.Point(foot.x1, foot.y0),
        color=(0.55, 0.55, 0.55),
        width=0.4,
    )
    fontsize = 8
    if fontpath:
        page.insert_font(fontname="kofoot", fontfile=fontpath)
        fn = "kofoot"
    else:
        fn = "helv"
    third = foot.width / 3.0
    pad = 2.0
    r_left = fitz.Rect(foot.x0 + pad, foot.y0 + 1, foot.x0 + third - pad, foot.y1 - 1)
    r_mid = fitz.Rect(foot.x0 + third + pad, foot.y0 + 1, foot.x0 + 2 * third - pad, foot.y1 - 1)
    r_right = fitz.Rect(foot.x0 + 2 * third + pad, foot.y0 + 1, foot.x1 - pad, foot.y1 - 1)
    for rect, text, align in (
        (r_left, left, fitz.TEXT_ALIGN_LEFT),
        (r_mid, center, fitz.TEXT_ALIGN_CENTER),
        (r_right, right, fitz.TEXT_ALIGN_RIGHT),
    ):
        page.insert_textbox(
            rect,
            text,
            fontname=fn,
            fontsize=fontsize,
            align=align,
            color=(0, 0, 0),
        )


def _insert_raster_image(page: fitz.Page, cr: fitz.Rect, src_path: Path) -> None:
    """래스터 이미지: 원본 바이트 스트림 우선(재인코딩 최소화). 투명 PNG는 alpha 기본."""
    suf = src_path.suffix.lower()
    raw = src_path.read_bytes()
    if suf in (".jpg", ".jpeg", ".jpe", ".jfif"):
        try:
            page.insert_image(cr, stream=raw, keep_proportion=True, alpha=0)
            return
        except Exception:
            pass
    if suf == ".png":
        try:
            page.insert_image(cr, stream=raw, keep_proportion=True)
            return
        except Exception:
            pass
    path_s = str(src_path.resolve())
    try:
        page.insert_image(cr, filename=path_s, keep_proportion=True, alpha=0 if suf != ".png" else -1)
    except Exception:
        pix = fitz.Pixmap(path_s)
        try:
            if pix.alpha:
                conv = fitz.Pixmap(fitz.csRGB, pix)
                _safe_pixmap_release(pix)
                pix = conv
            page.insert_image(cr, pixmap=pix, keep_proportion=True)
        finally:
            _safe_pixmap_release(pix)


def _save_pdf_preserve_image_streams(doc: fitz.Document, path: Path) -> None:
    """이미지·폰트 스트림 재압축을 피하고, 정리 단계는 보수적으로."""
    doc.save(
        str(path.resolve()),
        garbage=2,
        deflate=True,
        clean=False,
        deflate_images=False,
        deflate_fonts=False,
    )


def _truncate_center(name: str, max_chars: int = 42) -> str:
    if len(name) <= max_chars:
        return name
    return name[: max_chars - 1] + "…"


def _build_pages_from_src(
    src_path: Path,
    *,
    display_name: str,
    written_at: str,
    fontpath: str | None,
    force_portrait: bool = False,
) -> fitz.Document:
    """단일 소스 파일 → A4 새 문서(쪽마다 꼬리말, 쪽별 가로·세로 자동)."""
    ml, mr, mt, mb_body, fh = _margins_pt()
    out = fitz.open()
    suffix = src_path.suffix.lower()

    def append_page_from_doc(src_doc: fitz.Document) -> None:
        total = len(src_doc)
        for pno in range(total):
            src_page = src_doc[pno]
            w, h = src_page.rect.width, src_page.rect.height
            if src_page.rotation in (90, 270):
                w, h = h, w
            landscape = False if force_portrait else _landscape_from_wh(w, h)
            pw, ph = _a4_page_size_pt(landscape=landscape)
            new_page = out.new_page(width=pw, height=ph)
            cr = _content_rect(new_page.rect, ml, mr, mt, mb_body, fh)
            # clip 은 **소스 페이지** 좌표계 — 목적지 cr 을 넘기면 원본이 잘못 잘림
            new_page.show_pdf_page(cr, src_doc, pno, keep_proportion=True)
            footer_right = f"{pno + 1} / {total}"
            _draw_footer(
                new_page,
                left=written_at,
                center=_truncate_center(display_name),
                right=footer_right,
                fontpath=fontpath,
            )

    if suffix in _PDF_EXT:
        sdoc = fitz.open(str(src_path.resolve()))
        try:
            append_page_from_doc(sdoc)
        finally:
            sdoc.close()
        return out

    if suffix in _IMG_EXT:
        iw, ih = _image_pixel_size(src_path)
        landscape = False if force_portrait else _landscape_from_wh(float(iw), float(ih))
        pw, ph = _a4_page_size_pt(landscape=landscape)
        page = out.new_page(width=pw, height=ph)
        cr = _content_rect(page.rect, ml, mr, mt, mb_body, fh)
        _insert_raster_image(page, cr, src_path)
        _draw_footer(
            page,
            left=written_at,
            center=_truncate_center(display_name),
            right="1 / 1",
            fontpath=fontpath,
        )
        return out

    raise ValueError(f"지원하지 않는 형식: {suffix}")


def _iter_source_files(roots: list[Path]) -> list[tuple[Path, Path, str]]:
    """(파일 경로, 소스 루트, 루트 폴더명 갑호증|법령정보).

    (label, 상대경로) 키가 겹치면 `roots` 순서상 나중 루트만 남긴다(`최종/갑호증` 등이 우선).
    """
    # (갑호증|법령정보, rel posix) -> (src, root, label)
    seen: dict[tuple[str, str], tuple[Path, Path, str]] = {}
    for root in roots:
        if not root.is_dir():
            continue
        label = root.name
        rr = root.resolve()
        for p in sorted(root.rglob("*")):
            if not p.is_file():
                continue
            suf = p.suffix.lower()
            if suf == ".mp4" or suf in _IMG_EXT or suf in _PDF_EXT:
                rel = p.relative_to(root)
                key = (label, rel.as_posix())
                seen[key] = (p.resolve(), rr, label)
    keys = sorted(seen.keys(), key=lambda k: (k[0], k[1]))
    return [seen[k] for k in keys]


def _filter_pairs_only_under(
    pairs: list[tuple[Path, Path, str]],
    only_under: str | None,
) -> list[tuple[Path, Path, str]]:
    """`갑호증`·`법령정보` 루트 기준 상대 경로가 `only_under` 폴더 아래인 항목만."""
    if not only_under:
        return pairs
    norm = only_under.replace("\\", "/").strip().strip("/")
    if not norm:
        return pairs
    out: list[tuple[Path, Path, str]] = []
    for src_file, source_root, label in pairs:
        rel = src_file.relative_to(source_root).as_posix()
        if rel == norm or rel.startswith(norm + "/"):
            out.append((src_file, source_root, label))
    return out


def _out_path(
    out_root: Path,
    source_root: Path,
    label: str,
    src_file: Path,
    *,
    pdf_output: bool,
) -> Path:
    """pdf_output=True → 확장자 `.pdf`로 조판 산출. False → 원본 확장자 그대로(복사 전용)."""
    rel = src_file.relative_to(source_root)
    if pdf_output:
        return out_root / label / rel.with_suffix(".pdf")
    return out_root / label / rel


def run(
    *,
    out_root: Path,
    dry_run: bool,
    skip_existing: bool,
    limit: int | None,
    written_at: str | None,
    force_portrait: bool,
    only_under: str | None = None,
) -> int:
    roots = _source_roots()
    fontpath = str(p) if (p := _korean_font_path()) else None
    if not fontpath:
        print("경고: 한글 글꼴(malgun 등)을 찾지 못해 helv로 꼬리말을 넣습니다.", file=sys.stderr)

    ts = written_at or datetime.now().strftime("%Y.%m.%d %H:%M")
    pairs = _filter_pairs_only_under(_iter_source_files(roots), only_under)
    if limit is not None:
        pairs = pairs[:limit]

    done = 0
    err = 0
    for src_file, source_root, label in pairs:
        display_name = src_file.name
        copy_only = src_file.suffix.lower() == ".mp4" or display_name in _COPY_ORIGINAL_BASENAMES
        outp = _out_path(
            out_root, source_root, label, src_file, pdf_output=not copy_only
        )
        if dry_run:
            mode = "원본복사" if copy_only else "조판"
            print(f"DRY-RUN [{mode}] → {outp.relative_to(_REPO)}")
            done += 1
            continue
        if skip_existing and outp.is_file() and outp.stat().st_size > 0:
            print(f"SKIP(있음): {outp.relative_to(_REPO)}")
            done += 1
            continue
        outp.parent.mkdir(parents=True, exist_ok=True)
        if copy_only:
            try:
                shutil.copy2(src_file, outp)
                print(f"복사(원본): {outp.relative_to(_REPO)}")
                done += 1
            except Exception as e:
                err += 1
                print(f"오류(복사): {src_file.relative_to(_REPO)} — {e}", file=sys.stderr)
            continue
        try:
            doc = _build_pages_from_src(
                src_file,
                display_name=display_name,
                written_at=ts,
                fontpath=fontpath,
                force_portrait=force_portrait,
            )
            try:
                _save_pdf_preserve_image_streams(doc, outp)
            finally:
                doc.close()
            print(f"작성: {outp.relative_to(_REPO)}")
            done += 1
        except Exception as e:
            err += 1
            print(f"오류: {src_file.relative_to(_REPO)} — {e}", file=sys.stderr)

    print(f"완료 {done}건, 오류 {err}건 (대상 {len(pairs)}건)")
    return 1 if err else 0


def main() -> int:
    ap = argparse.ArgumentParser(description="갑호증·법령정보 → 공문 형식 A4 PDF + 꼬리말")
    ap.add_argument(
        "--out",
        type=Path,
        default=_DEFAULT_OUT,
        help=f"출력 루트 (기본: {_DEFAULT_OUT})",
    )
    ap.add_argument("--dry-run", action="store_true", help="목록만 출력")
    ap.add_argument("--skip-existing", action="store_true", help="출력 PDF가 있으면 건너뜀")
    ap.add_argument("--limit", type=int, default=None, metavar="N", help="앞에서 N개만 처리")
    ap.add_argument(
        "--written-at",
        default=None,
        help='꼬리말 좌측 작성일시(기본: 실행 시각 "YYYY.MM.DD HH:MM")',
    )
    ap.add_argument(
        "--force-portrait",
        action="store_true",
        help="이미지·PDF 모두 A4 세로만 사용(이전 동작에 가깝게)",
    )
    ap.add_argument(
        "--only-under",
        default=None,
        metavar="상대경로",
        help="갑호증·법령정보 루트 기준 하위만 처리 (예: 갑제14호증 또는 갑제14호증/하위)",
    )
    args = ap.parse_args()
    out_root = args.out
    if not out_root.is_absolute():
        out_root = (_REPO / out_root).resolve()
    return run(
        out_root=out_root,
        dry_run=args.dry_run,
        skip_existing=args.skip_existing,
        limit=args.limit,
        written_at=args.written_at,
        force_portrait=args.force_portrait,
        only_under=args.only_under,
    )


if __name__ == "__main__":
    raise SystemExit(main())
