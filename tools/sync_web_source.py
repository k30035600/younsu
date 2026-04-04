# -*- coding: utf-8 -*-
"""`web/source` 동기화: 제출 MD 복사, 화면 표시용 site-display.json, DOCX 생성.

- **포털 탭 본문**은 계속 저장소 정본 `.md`를 `/serve/`로 읽습니다.
- **`web/source/*.md`**는 정본에서 복사한 **편집·보관·대조용**이며, 탭 표시 원천은 MD입니다.
- **`.docx`**는 같은 내용의 **워드 제출·인쇄 보조**용으로만 생성합니다(원천은 항상 MD).

실행(프로젝트 루트):
  python tools/build_commission_evidence_json.py
  python tools/survey_gab_evidence_full.py   # 선택
  python tools/sync_web_source.py

`npm start` 시 `start.js`가 `/source/` 아래 `web/source` 파일을 서빙합니다.
정적 배포만 할 때는 `python tools/sync_web_source.py --mirror-public` 으로
`public/source/` 에 미러할 수 있습니다.

DOCX: `pip install python-docx` (또는 PATH에 pandoc 있으면 우선 사용).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_PORTAL_DATA = _REPO / "web" / "commission-portal" / "public" / "data" / "portal-data.json"
_SOURCE = _REPO / "web" / "source"
_PUBLIC_SOURCE = _REPO / "web" / "commission-portal" / "public" / "source"

# tabSources 키 → 저장 파일명(utf-8)
_TAB_FILES: list[tuple[str, str]] = [
    ("overview", "개요.md"),
    ("appeal", "행정심판청구.md"),
    ("gab", "별지_갑호증.md"),
    ("appendix", "별지_시간축.md"),
    ("injunction", "집행정지신청.md"),
]

_SITE_DISPLAY_DEFAULT = {
    "siteTitle": "농원근린공원 행정심판청구",
    "siteSubtitle": "집행정지신청 병합 · 인천광역시 행정심판위원회 심리 참고",
    "updated": "2026-04-04",
}


def _repo_file(rel: str) -> Path:
    r = rel.replace("\\", "/").strip().lstrip("/")
    return _REPO / r


def _copy_tab_sources(tab_sources: dict) -> None:
    _SOURCE.mkdir(parents=True, exist_ok=True)
    for key, dest_name in _TAB_FILES:
        rel = (tab_sources or {}).get(key)
        if not rel:
            print(f"skip {key}: tabSources에 없음", file=sys.stderr)
            continue
        src = _repo_file(str(rel))
        if not src.is_file():
            print(f"skip {key}: 파일 없음 {src}", file=sys.stderr)
            continue
        dest = _SOURCE / dest_name
        shutil.copy2(src, dest)
        print(f"복사 {dest_name} ← {rel}")


def _write_site_display(force: bool) -> Path:
    path = _SOURCE / "site-display.json"
    _SOURCE.mkdir(parents=True, exist_ok=True)
    if path.is_file() and not force:
        print(f"유지 {path.name} (이미 있음, --force-site-display 로 덮어쓰기)")
        return path
    path.write_text(
        json.dumps(_SITE_DISPLAY_DEFAULT, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"작성 {path.name}")
    return path


def _pandoc_md_to_docx(md_path: Path, docx_path: Path) -> bool:
    try:
        r = subprocess.run(
            ["pandoc", "-f", "markdown", "-t", "docx", "-o", str(docx_path), str(md_path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode == 0 and docx_path.is_file():
            return True
    except (FileNotFoundError, OSError):
        pass
    return False


def _python_docx_md_to_docx(md_path: Path, docx_path: Path) -> bool:
    try:
        from docx import Document
    except ImportError:
        return False
    text = md_path.read_text(encoding="utf-8")
    doc = Document()
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue
        if line.startswith("#### "):
            doc.add_heading(line[5:].strip(), level=4)
        elif line.startswith("### "):
            doc.add_heading(line[4:].strip(), level=3)
        elif line.startswith("## "):
            doc.add_heading(line[3:].strip(), level=2)
        elif line.startswith("# "):
            doc.add_heading(line[2:].strip(), level=1)
        elif re.match(r"^[-*]\s+", line):
            doc.add_paragraph(re.sub(r"^[-*]\s+", "", line), style="List Bullet")
        elif re.match(r"^\d+\.\s+", line):
            doc.add_paragraph(re.sub(r"^\d+\.\s+", "", line), style="List Number")
        else:
            doc.add_paragraph(line)
    doc.save(str(docx_path))
    return True


def _build_docx_for_md(md_path: Path) -> None:
    docx_path = md_path.with_suffix(".docx")
    if _pandoc_md_to_docx(md_path, docx_path):
        print(f"DOCX(pandoc) {docx_path.name}")
        return
    if _python_docx_md_to_docx(md_path, docx_path):
        print(f"DOCX(python-docx) {docx_path.name}")
        return
    print(
        f"경고: {md_path.name} → docx 실패. pandoc 설치 또는 pip install python-docx",
        file=sys.stderr,
    )


def _mirror_public() -> None:
    if not _SOURCE.is_dir():
        return
    _PUBLIC_SOURCE.mkdir(parents=True, exist_ok=True)
    for p in _SOURCE.iterdir():
        if p.is_file():
            shutil.copy2(p, _PUBLIC_SOURCE / p.name)
    print(f"미러 {_SOURCE} → {_PUBLIC_SOURCE}")


def main() -> None:
    ap = argparse.ArgumentParser(description="web/source MD·DOCX·site-display 동기화")
    ap.add_argument(
        "--mirror-public",
        action="store_true",
        help="web/source 내용을 commission-portal/public/source/ 로 복사",
    )
    ap.add_argument(
        "--force-site-display",
        action="store_true",
        help="site-display.json 을 기본값으로 덮어씀",
    )
    ap.add_argument("--no-docx", action="store_true", help="DOCX 생성 생략")
    args = ap.parse_args()

    if not _PORTAL_DATA.is_file():
        raise SystemExit(f"없음: {_PORTAL_DATA} — 먼저 build_commission_evidence_json.py 실행")

    data = json.loads(_PORTAL_DATA.read_text(encoding="utf-8"))
    tab_sources = (data.get("meta") or {}).get("tabSources") or {}

    _write_site_display(args.force_site_display)
    _copy_tab_sources(tab_sources)

    if not args.no_docx:
        for _k, dest_name in _TAB_FILES:
            md = _SOURCE / dest_name
            if md.is_file():
                _build_docx_for_md(md)

    if args.mirror_public:
        _mirror_public()


if __name__ == "__main__":
    main()
