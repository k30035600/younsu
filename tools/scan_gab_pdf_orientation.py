# -*- coding: utf-8 -*-
"""갑호증및법령정보 PDF 전수 스캔: 페이지 크기·이미지 비율 분석.

산출: 표준 출력에 JSON(호증별 첫 페이지 미디어박스 W×H, 이미지 갯수, 가장 큰 이미지 W×H, 판정).
판정 기준:
  1. 페이지가 이미 가로(W ≥ H * 1.05) → "page_landscape"
  2. 페이지는 세로인데 첫 페이지의 가장 큰 이미지가 가로(imgW ≥ imgH * 1.05) → "img_landscape_in_portrait"
  3. 그 외 → "portrait" (텍스트 문서·세로 스캔 등)

실행: python tools/scan_gab_pdf_orientation.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

try:
    import fitz  # pymupdf
except ImportError:
    sys.exit("pymupdf(fitz) 패키지가 필요합니다. pip install pymupdf")

REPO = Path(__file__).resolve().parents[1]
GAB_ROOT = REPO / "행정심판청구(증거)" / "갑호증및법령정보"


def scan_pdf(pdf_path: Path) -> dict:
    info: dict = {
        "file": str(pdf_path.relative_to(REPO)),
        "leaf": pdf_path.name,
        "relSuffix": "",
        "pageW": 0,
        "pageH": 0,
        "pageOrientation": "unknown",
        "imageCount": 0,
        "maxImgW": 0,
        "maxImgH": 0,
        "verdict": "unknown",
        "note": "",
    }
    try:
        info["relSuffix"] = str(pdf_path.relative_to(GAB_ROOT)).replace("\\", "/")
    except ValueError:
        info["relSuffix"] = pdf_path.name

    try:
        doc = fitz.open(str(pdf_path))
    except Exception as e:
        info["note"] = f"open error: {e}"
        return info

    if doc.page_count < 1:
        info["note"] = "no pages"
        doc.close()
        return info

    page = doc[0]
    rect = page.rect
    pw, ph = rect.width, rect.height
    info["pageW"] = round(pw, 1)
    info["pageH"] = round(ph, 1)
    info["pageOrientation"] = "landscape" if pw >= ph * 1.05 else ("portrait" if ph > pw * 1.02 else "square")

    imgs = page.get_images(full=True)
    info["imageCount"] = len(imgs)

    max_area = 0
    max_w = 0
    max_h = 0
    for img_ref in imgs:
        xref = img_ref[0]
        try:
            img_dict = doc.extract_image(xref)
            w = img_dict.get("width", 0)
            h = img_dict.get("height", 0)
        except Exception:
            try:
                pix = fitz.Pixmap(doc, xref)
                w, h = pix.width, pix.height
            except Exception:
                w, h = 0, 0
        area = w * h
        if area > max_area:
            max_area = area
            max_w = w
            max_h = h

    info["maxImgW"] = max_w
    info["maxImgH"] = max_h

    if info["pageOrientation"] == "landscape":
        info["verdict"] = "page_landscape"
    elif max_w > 0 and max_h > 0 and max_w >= max_h * 1.05 and info["pageOrientation"] == "portrait":
        info["verdict"] = "img_landscape_in_portrait"
    elif max_w > 0 and max_h > 0 and max_h >= max_w * 1.05 and info["pageOrientation"] == "portrait":
        info["verdict"] = "portrait"
    else:
        info["verdict"] = info["pageOrientation"]

    doc.close()
    return info


def main() -> None:
    if not GAB_ROOT.is_dir():
        sys.exit(f"Directory not found: {GAB_ROOT}")

    pdfs = sorted(GAB_ROOT.rglob("*.pdf"), key=lambda p: str(p))
    results = []
    for p in pdfs:
        results.append(scan_pdf(p))

    landscape_forced = [r for r in results if r["verdict"] == "img_landscape_in_portrait"]
    page_landscape = [r for r in results if r["verdict"] == "page_landscape"]
    portrait = [r for r in results if r["verdict"] == "portrait"]
    other = [r for r in results if r["verdict"] not in ("img_landscape_in_portrait", "page_landscape", "portrait")]

    out = {
        "total": len(results),
        "summary": {
            "page_landscape": len(page_landscape),
            "img_landscape_in_portrait": len(landscape_forced),
            "portrait": len(portrait),
            "other": len(other),
        },
        "forceLandscapeCandidates": [
            {"relSuffix": r["relSuffix"], "leaf": r["leaf"],
             "note": f"page {r['pageW']}x{r['pageH']} portrait, largest img {r['maxImgW']}x{r['maxImgH']} landscape"}
            for r in landscape_forced
        ],
        "pageLandscape": [
            {"relSuffix": r["relSuffix"], "leaf": r["leaf"],
             "note": f"page {r['pageW']}x{r['pageH']} already landscape"}
            for r in page_landscape
        ],
        "allResults": results,
    }

    json_str = json.dumps(out, ensure_ascii=False, indent=2)
    sys.stdout.buffer.write(json_str.encode("utf-8"))
    sys.stdout.buffer.write(b"\n")

    total = len(results)
    sys.stderr.write(
        f"Scanned {total} PDFs: {len(page_landscape)} page-landscape, "
        f"{len(landscape_forced)} img-landscape-in-portrait, "
        f"{len(portrait)} portrait, {len(other)} other\n"
    )


if __name__ == "__main__":
    main()
