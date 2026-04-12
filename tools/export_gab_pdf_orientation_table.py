# -*- coding: utf-8 -*-
"""갑호증및법령정보 PDF 전수: 호증·파일명·콘텐츠·1쪽 최대 이미지 px·포털 판정(가로/세로) 표 생성.

산출: tools/gab_pdf_orientation_table.md
판정: (1) 첫 쪽 미디어 박스가 가로(pw>=ph*1.05) → 가로
      (2) gab-pdf-display-overrides.json 의 forceLandscape 에 포함 → 가로
      (3) 그 외 → 세로

실행: python tools/export_gab_pdf_orientation_table.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    sys.exit("pip install pymupdf")

REPO = Path(__file__).resolve().parents[1]
GAB_ROOT = REPO / "행정심판청구(제출용)" / "갑호증및법령정보"
OVERRIDES = REPO / "web/commission-portal/public/data/gab-pdf-display-overrides.json"
OUT_MD = REPO / "tools" / "gab_pdf_orientation_table.md"

_GAB_LEAF = re.compile(
    r"^갑제(?P<maj>\d+)-(?P<min>\d+)(?:호증|증)_(?P<rest>.+)\.pdf$",
    re.UNICODE,
)


def load_force_suffixes() -> set[str]:
    if not OVERRIDES.is_file():
        return set()
    data = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    out = set()
    for r in data.get("forceLandscape") or []:
        rs = str(r.get("relSuffix") or "").strip()
        if rs:
            out.add(rs.replace("\\", "/"))
    return out


def exhibit_label(leaf: str, rel_suffix: str) -> str:
    if rel_suffix.startswith("법령정보/"):
        return "법령"
    m = _GAB_LEAF.match(leaf)
    if not m:
        return "—"
    maj, mino, _ = m.group("maj"), m.group("min"), m.group("rest")
    return f"갑{maj}-{mino}" if mino else f"갑{maj}"


def content_summary(leaf: str, rel_suffix: str, note_from_override: str) -> str:
    if note_from_override:
        return note_from_override.split(" — ")[0].strip()
    if rel_suffix.startswith("법령정보/"):
        return "판례·법령정보 PDF"
    m = _GAB_LEAF.match(leaf)
    rest = (m.group("rest") if m else leaf.replace(".pdf", "")).strip()
    rest = re.sub(r"^갑제\d+(?:-\d+)?(?:호증|증)_", "", rest)
    return rest or "(파일명 참조)"


def scan_pdf(path: Path) -> tuple[str, str, int, int, int, int]:
    """Returns (px_str, pw, ph, iw, ih) px_str like '720×1280' or '-'"""
    try:
        doc = fitz.open(str(path))
    except Exception:
        return "-", 0, 0, 0, 0
    if doc.page_count < 1:
        doc.close()
        return "-", 0, 0, 0, 0
    page = doc[0]
    pw, ph = round(page.rect.width, 1), round(page.rect.height, 1)
    max_w = max_h = 0
    for ref in page.get_images(full=True):
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
        if w * h > max_w * max_h:
            max_w, max_h = w, h
    doc.close()
    if max_w < 1 or max_h < 1:
        return "-", int(pw), int(ph), 0, 0
    return f"{max_w}×{max_h}", int(pw), int(ph), max_w, max_h


def main() -> None:
    force = load_force_suffixes()
    note_by_suffix: dict[str, str] = {}
    if OVERRIDES.is_file():
        data = json.loads(OVERRIDES.read_text(encoding="utf-8"))
        for r in data.get("forceLandscape") or []:
            rs = str(r.get("relSuffix") or "").strip().replace("\\", "/")
            if rs:
                note_by_suffix[rs] = str(r.get("note") or "").strip()

    if not GAB_ROOT.is_dir():
        sys.exit(f"Not found: {GAB_ROOT}")

    rows: list[tuple[str, str, str, str, str, str]] = []
    for pdf in sorted(GAB_ROOT.rglob("*.pdf"), key=lambda p: str(p)):
        rel_suffix = str(pdf.relative_to(GAB_ROOT)).replace("\\", "/")
        leaf = pdf.name
        px_str, pw, ph, iw, ih = scan_pdf(pdf)
        note = note_by_suffix.get(rel_suffix, "")
        content = content_summary(leaf, rel_suffix, note)
        ex = exhibit_label(leaf, rel_suffix)

        page_landscape = pw > 0 and ph > 0 and pw >= ph * 1.05
        forced = rel_suffix in force
        if page_landscape:
            verdict = "가로"
            reason = "페이지 가로"
        elif forced:
            verdict = "가로"
            reason = "포털 forceLandscape"
        else:
            verdict = "세로"
            reason = "기본(세로 페이지)"

        rows.append((ex, leaf, content, px_str, verdict, reason))

    lines = [
        "# 갑호증·법령정보 PDF 전수 — 표시 방향(가로/세로) 검수표",
        "",
        "생성: `tools/export_gab_pdf_orientation_table.py`",
        "",
        "- **가로**: 첫 쪽 미디어 박스가 가로이거나, `gab-pdf-display-overrides.json`의 `forceLandscape`에 등재.",
        "- **세로**: 그 외(A4 세로 595×842 등).",
        "- **이미지 px**: 1쪽에 포함된 래스터 이미지 중 **가장 큰 것**의 원본 픽셀(없으면 `-`).",
        "",
        "| 호증 | 파일명 | 콘텐츠 | 이미지 px | 판정 |",
        "|------|--------|--------|-----------|------|",
    ]
    for ex, leaf, content, px_str, verdict, _ in rows:
        safe_c = content.replace("|", "\\|")
        safe_f = leaf.replace("|", "\\|")
        lines.append(f"| {ex} | {safe_f} | {safe_c} | {px_str} | {verdict} |")

    lines.extend(
        [
            "",
            "## 판정 근거(내부)",
            "",
            "| 호증 | 파일명 | 판정근거 |",
            "|------|--------|----------|",
        ]
    )
    for ex, leaf, _, _, verdict, reason in rows:
        lines.append(f"| {ex} | {leaf.replace('|', '\\|')} | {reason} |")

    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_MD.relative_to(REPO)} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
