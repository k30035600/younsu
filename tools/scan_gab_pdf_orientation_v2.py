# -*- coding: utf-8 -*-
"""갑호증 PDF 전수 스캔 v2: 이미지 크기·면적·배치까지 분석해 가로 콘텐츠 판정.

판정 기준:
  A. 페이지가 이미 가로(W >= H*1.05) → "page_landscape" (자동 가로)
  B. 세로 페이지인데 **큰 이미지가 가로이고 페이지 면적의 30% 이상** 차지
     → "force_landscape" (사진/도면 — 가로 표시 강제)
  C. 세로 페이지인데 큰 이미지가 가로이지만 면적이 작음(로고 등)
     → "portrait" (텍스트 문서)
  D. 세로 페이지·세로/정방 이미지 또는 이미지 없음
     → "portrait"
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    sys.exit("pymupdf(fitz) required: pip install pymupdf")

REPO = Path(__file__).resolve().parents[1]
GAB_ROOT = REPO / "행정심판청구(증거)" / "갑호증및법령정보"

IMG_AREA_THRESHOLD = 0.25


def analyze(pdf_path: Path) -> dict:
    try:
        rel = str(pdf_path.relative_to(GAB_ROOT)).replace("\\", "/")
    except ValueError:
        rel = pdf_path.name

    info = {
        "leaf": pdf_path.name,
        "relSuffix": rel,
        "pageW": 0, "pageH": 0,
        "pageOrient": "unknown",
        "imgs": [],
        "verdict": "unknown",
        "reason": "",
    }

    try:
        doc = fitz.open(str(pdf_path))
    except Exception as e:
        info["reason"] = f"open error: {e}"
        return info

    if doc.page_count < 1:
        info["reason"] = "no pages"
        doc.close()
        return info

    page = doc[0]
    pw, ph = page.rect.width, page.rect.height
    info["pageW"] = round(pw, 1)
    info["pageH"] = round(ph, 1)
    page_area = pw * ph if pw > 0 and ph > 0 else 1

    if pw >= ph * 1.05:
        info["pageOrient"] = "landscape"
    elif ph > pw * 1.02:
        info["pageOrient"] = "portrait"
    else:
        info["pageOrient"] = "square"

    if info["pageOrient"] == "landscape":
        info["verdict"] = "page_landscape"
        info["reason"] = "page itself is landscape"
        doc.close()
        return info

    img_refs = page.get_images(full=True)
    page_img_info = []
    for ref in img_refs:
        xref = ref[0]
        try:
            d = doc.extract_image(xref)
            w, h = d.get("width", 0), d.get("height", 0)
        except Exception:
            try:
                pix = fitz.Pixmap(doc, xref)
                w, h = pix.width, pix.height
            except Exception:
                w, h = 0, 0
        if w < 4 or h < 4:
            continue
        img_area_ratio = (w * h) / page_area if page_area > 0 else 0
        is_landscape = w >= h * 1.05
        page_img_info.append({
            "w": w, "h": h,
            "areaRatio": round(img_area_ratio, 3),
            "landscape": is_landscape,
        })

    info["imgs"] = page_img_info

    big_landscape = [
        im for im in page_img_info
        if im["landscape"] and im["areaRatio"] >= IMG_AREA_THRESHOLD
    ]
    if big_landscape:
        best = max(big_landscape, key=lambda x: x["areaRatio"])
        info["verdict"] = "force_landscape"
        info["reason"] = (
            f"portrait page with landscape image {best['w']}x{best['h']} "
            f"covering {best['areaRatio']*100:.0f}% of page"
        )
    else:
        info["verdict"] = "portrait"
        if page_img_info:
            best = max(page_img_info, key=lambda x: x["w"] * x["h"])
            info["reason"] = (
                f"largest img {best['w']}x{best['h']} "
                f"({'landscape' if best['landscape'] else 'portrait/sq'}, "
                f"{best['areaRatio']*100:.0f}% area) — too small or not landscape"
            )
        else:
            info["reason"] = "no significant images on page 1"

    doc.close()
    return info


def main() -> None:
    if not GAB_ROOT.is_dir():
        sys.exit(f"Not found: {GAB_ROOT}")

    pdfs = sorted(GAB_ROOT.rglob("*.pdf"), key=lambda p: str(p))
    results = [analyze(p) for p in pdfs]

    force = [r for r in results if r["verdict"] == "force_landscape"]
    pland = [r for r in results if r["verdict"] == "page_landscape"]
    port = [r for r in results if r["verdict"] == "portrait"]

    out = {
        "total": len(results),
        "summary": {
            "page_landscape": len(pland),
            "force_landscape": len(force),
            "portrait": len(port),
        },
        "force_landscape": [
            {"relSuffix": r["relSuffix"], "leaf": r["leaf"], "reason": r["reason"]}
            for r in force
        ],
        "page_landscape": [
            {"relSuffix": r["relSuffix"], "leaf": r["leaf"], "reason": r["reason"]}
            for r in pland
        ],
        "all": results,
    }

    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False, indent=2).encode("utf-8"))
    sys.stdout.buffer.write(b"\n")
    sys.stderr.buffer.write(
        f"Scanned {len(results)}: {len(pland)} page-landscape, "
        f"{len(force)} force-landscape, {len(port)} portrait\n".encode("utf-8")
    )


if __name__ == "__main__":
    main()
