# -*- coding: utf-8 -*-
"""행정심판청구 루트의 제출·참고 파일을 용도별 하위 폴더로 이동합니다.

실행(과거 일회성): `python tools/archive/260402_organize_folders.py`
"""
from __future__ import annotations

import shutil
from pathlib import Path

# 스크립트는 younsu/tools/에 두고, 정리 대상은 행정심판청구 루트
_REPO = Path(__file__).resolve().parents[2]
ROOT = _REPO / "행정심판청구(증거)"

# 이미 용도별로 쓰는 폴더(여기 안의 항목은 건드리지 않음)
SKIP_DIRS = frozenset(
    {
        "행정심판최종본",
        "집행정지_보충",
        "판례모음",
        "(국가법령정보)판례모음",
        "갑호증",
        "법령정보",
        "첨부",
        "문서_워드PPT",
    }
)


def main() -> None:
    ev = ROOT / "갑호증"
    ref = ROOT / "판례모음"
    docppt = ROOT / "문서_워드PPT"
    for d in (ev, ref, docppt):
        d.mkdir(parents=True, exist_ok=True)

    for p in list(ROOT.iterdir()):
        if p.is_dir():
            if p.name in SKIP_DIRS:
                continue
            # 알 수 없는 폴더는 유지 (예: 예전 260327_행정심판최종본)
            continue
        if p.name == "260402_organize_folders.py":
            continue

        name = p.name
        ext = p.suffix.lower()
        dest: Path | None = None

        if ext == ".mp4":
            dest = ev / name
        elif "행정기본법" in name or "질의응답" in name or "사례집" in name:
            dest = ref / name
        elif name.startswith("QR") or "호증" in name or name.startswith("갑"):
            dest = ev / name
        elif ext in (".docx", ".pptx"):
            dest = docppt / name
        elif "연수구" in name and ext == ".pdf":
            dest = ev / name
        elif "동춘동" in name and "건축" in name:
            dest = ev / name
        elif ext == ".pdf" and ("누" in name or "두" in name or "다" in name):
            dest = ref / name
        elif ext in (".jpg", ".jpeg", ".png", ".gif", ".webp") and not name.startswith("QR"):
            dest = ev / name

        if dest is None:
            dest = ref / name

        if dest.exists() and dest.resolve() != p.resolve():
            stem, suf = dest.stem, dest.suffix
            for i in range(2, 99):
                alt = dest.with_name(f"{stem}_{i}{suf}")
                if not alt.exists():
                    dest = alt
                    break
        shutil.move(str(p), str(dest))
        print("moved:", name, "->", dest.relative_to(ROOT))


if __name__ == "__main__":
    main()
