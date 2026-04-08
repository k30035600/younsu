# -*- coding: utf-8 -*-
"""`commission-portal/public/source` 동기화: 정본 MD 복사, site-display.json.

- **포털 탭 본문**은 저장소 정본 `.md`를 `/serve/`로 읽습니다.
- **`public/source/*.md`**는 정본에서 복사한 **편집·보관·대조용** 사본이며, `/source/…`로도 서빙됩니다. (탭: 청구서·별지 제1~4호·집행정지)
- **PDF**는 생성하지 않습니다. 제출·인쇄용 PDF는 사용자가 Word 등에서 DOCX로 변환합니다.

실행(프로젝트 루트):
  python tools/build_commission_evidence_json.py
  python tools/survey_gab_evidence_full.py   # 선택
  python tools/sync_web_source.py

`npm start` 시 `start.js`가 `/source/…` 아래 `public/source` 파일을 서빙합니다.

의존성: 없음(본 스크립트는 MD 복사·JSON만).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_PORTAL_DATA = _REPO / "web" / "commission-portal" / "public" / "data" / "portal-data.json"
_PUBLIC_SOURCE = _REPO / "web" / "commission-portal" / "public" / "source"

# tabSources 키 → 저장 파일명(utf-8)
_TAB_FILES: list[tuple[str, str]] = [
    ("appeal", "행정심판청구.md"),
    ("gab1", "별지_갑1호증.md"),
    ("gab2", "별지_갑2호증.md"),
    ("gab3", "별지_갑3호증.md"),
    ("gab4", "별지_갑4호증.md"),
    ("injunction", "집행정지신청.md"),
]

_SITE_DISPLAY_DEFAULT = {
    "siteTitle": "농원근린공원 행정심판청구",
    "siteSubtitle": "집행정지신청 병합 · 인천광역시 행정심판위원회 심리 참고",
    "updated": "2026-04-05",
}


def _repo_file(rel: str) -> Path:
    r = rel.replace("\\", "/").strip().lstrip("/")
    return _REPO / r


def _copy_tab_sources(tab_sources: dict) -> None:
    _PUBLIC_SOURCE.mkdir(parents=True, exist_ok=True)
    for key, dest_name in _TAB_FILES:
        rel = (tab_sources or {}).get(key)
        if not rel:
            print(f"skip {key}: tabSources에 없음", file=sys.stderr)
            continue
        src = _repo_file(str(rel))
        if not src.is_file():
            print(f"skip {key}: 파일 없음 {src}", file=sys.stderr)
            continue
        dest = _PUBLIC_SOURCE / dest_name
        shutil.copy2(src, dest)
        print(f"복사 {dest_name} ← {rel}")


def _write_site_display(meta: dict, force: bool) -> Path:
    """`portal-data.json`의 meta와 동일한 제목·부제·기준일을 site-display.json에 기록."""
    path = _PUBLIC_SOURCE / "site-display.json"
    _PUBLIC_SOURCE.mkdir(parents=True, exist_ok=True)
    m = meta or {}
    out = {
        "siteTitle": m.get("siteTitle") or _SITE_DISPLAY_DEFAULT["siteTitle"],
        "siteSubtitle": m.get("siteSubtitle") or _SITE_DISPLAY_DEFAULT["siteSubtitle"],
        "updated": m.get("updated") or _SITE_DISPLAY_DEFAULT["updated"],
    }
    if path.is_file() and not force:
        try:
            cur = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            cur = {}
        if cur == out:
            print(f"유지 {path.name} (portal meta와 동일)")
            return path
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"작성 {path.name} ← portal meta")
    return path


def main() -> None:
    ap = argparse.ArgumentParser(
        description="commission-portal/public/source MD·site-display 동기화"
    )
    ap.add_argument(
        "--mirror-public",
        action="store_true",
        help="(호환, 무시) 예전 web/source → public 미러 단계는 제거됨",
    )
    ap.add_argument(
        "--force-site-display",
        action="store_true",
        help="site-display.json 을 무조건 portal meta(없으면 기본값)로 덮어씀",
    )
    ap.add_argument(
        "--no-pdf",
        action="store_true",
        help="(호환, 무시) 예전 PDF 생성 옵션 — 더 이상 PDF를 만들지 않음",
    )
    ap.add_argument(
        "--no-docx",
        action="store_true",
        help="(호환) --no-pdf 와 동일",
    )
    args = ap.parse_args()

    if not _PORTAL_DATA.is_file():
        raise SystemExit(f"없음: {_PORTAL_DATA} — 먼저 build_commission_evidence_json.py 실행")

    data = json.loads(_PORTAL_DATA.read_text(encoding="utf-8"))
    meta = data.get("meta") or {}
    tab_sources = meta.get("tabSources") or {}

    _write_site_display(meta, args.force_site_display)
    _copy_tab_sources(tab_sources)

    if args.mirror_public:
        print("(참고) --mirror-public 은 더 이상 필요 없습니다. 출력은 항상 public/source 입니다.")


if __name__ == "__main__":
    main()
