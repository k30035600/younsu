# -*- coding: utf-8 -*-
"""portal-data.json 의 갑호증 PDF 목록으로 표시용 데이터를 갱신합니다.

산출: web/commission-portal/public/data/gab-pdf-display-overrides.json
- catalog: 전수 목록(relSuffix, leaf) — 심리·편철 대조용
- forceLandscape: 세로 미디어 박스이나 가로 사진으로 보아야 할 호증(수동 유지)

실행: 저장소 루트에서  python tools/build_gab_pdf_display_data.py
"""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PORTAL_DATA = REPO / "web/commission-portal/public/data/portal-data.json"
OUT = REPO / "web/commission-portal/public/data/gab-pdf-display-overrides.json"

USB_P = "USB/갑호증및법령정보/"
PRIM_P = "갑호증및법령정보/"


def _tail(rel: str) -> str:
    r = rel.replace("\\", "/").strip()
    if r.startswith(USB_P):
        return r[len(USB_P) :]
    if r.startswith(PRIM_P):
        return r[len(PRIM_P) :]
    return r


def main() -> None:
    data = json.loads(PORTAL_DATA.read_text(encoding="utf-8"))
    gab = data.get("meta", {}).get("gabFiles") or []
    pdfs: list[dict[str, str]] = []
    for f in gab:
        rel = str(f.get("rel") or "").strip()
        if not rel.lower().endswith(".pdf"):
            continue
        if "갑호증및법령정보" not in rel.replace("\\", "/"):
            continue
        tail = _tail(rel)
        leaf = tail.split("/")[-1] if tail else rel.split("/")[-1]
        pdfs.append({"relSuffix": tail, "leaf": leaf})

    pdfs.sort(key=lambda x: (x["relSuffix"], x["leaf"]))

    existing_force: list = []
    if OUT.is_file():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
            existing_force = list(prev.get("forceLandscape") or [])
        except (OSError, json.JSONDecodeError):
            existing_force = []

    # 기본: 갑1-1 항공(세로 PDF·가로 사진) — 목록에 있으면 유지, 없으면 추가
    default_1_1 = {
        "relSuffix": "갑제1호증/갑제1-1호증_1967년_항공사진.pdf",
        "leaf": "갑제1-1호증_1967년_항공사진.pdf",
        "note": "페이지는 세로이나 항공사진 본문은 가로 — 썸네일·전체화면 가로 취급",
    }
    leaves = {str(x.get("leaf") or "") for x in existing_force}
    rels = {str(x.get("relSuffix") or "") for x in existing_force}
    merged_force = list(existing_force)
    if default_1_1["leaf"] not in leaves and default_1_1["relSuffix"] not in rels:
        merged_force.insert(0, default_1_1)

    out_obj = {
        "readmeKo": (
            "forceLandscape: PDF 첫 쪽 미디어 박스가 세로여도 실제로는 가로 사진·도면으로 보아야 할 때, "
            "썸네일 박스·전체화면 방향을 가로로 맞춥니다(relSuffix 또는 leaf 매칭). "
            "catalog: portal-data.json 갑호증 PDF 전부(전수). "
            "이 파일은 tools/build_gab_pdf_display_data.py 로 catalog를 갱신할 수 있습니다."
        ),
        "generatedBy": "tools/build_gab_pdf_display_data.py",
        "forceLandscape": merged_force,
        "catalogRelSuffixes": pdfs,
    }
    OUT.write_text(
        json.dumps(out_obj, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {OUT.relative_to(REPO)} : {len(pdfs)} PDF catalog, "
        f"{len(merged_force)} forceLandscape rules"
    )


if __name__ == "__main__":
    main()
