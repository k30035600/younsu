# -*- coding: utf-8 -*-
"""`행정심판청구(제출용)/최종/법령정보/`(구 기타참고 역할 통합): ZIP이 동일 내용으로 압축 해제되어 있으면 ZIP 제거, PDF는 해시 기준 중복 제거.

- ZIP: 각 멤버를 `법령정보/상대경로`, `법령정보/파일명`, `법령정보/<zip_stem>/파일명` 순으로 찾아 크기 일치하면 동일 본으로 간주.
- PDF 중복: `(국가법령정보)판례모음` **루트** 및 **`법령정보/`** 아래 PDF와 내용(SHA256)이 같으면 **이 스크립트 대상 폴더(법령정보 루트)** 쪽만 삭제(판례모음 정본 우선). **`old/`** 는 정본 해시에 넣지 않음.
- 그 외 대상 폴더 내부만 동일 해시면 1개만 남김(`_중복` 접미가 있으면 제거 우선).
- `README_국가법령정보_인용순서.txt` 가 판례모음 루트와 동일하면 대상 폴더 쪽 삭제.
- 대상 **루트** PDF 중 `01_`~`11_` 인용순 접두가 붙은 것(`NN_사건번호_사건명.pdf` 포함)은 접두 제거 후 **사건번호_사건명** 등 나머지 파일명만 남김(대상 파일이 이미 있고 내용 동일하면 원본만 삭제).

실행(과거 일회성): `python tools/archive/260402_dedupe_misc_zip.py` [--dry-run]
"""
from __future__ import annotations

import argparse
import hashlib
import re
import zipfile
from collections import defaultdict
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
MISC = _REPO / "행정심판청구(제출용)" / "최종" / "법령정보"
ORDERED = _REPO / "행정심판청구(제출용)" / "최종" / "(국가법령정보)판례모음"
LAWINFO_SUB = ORDERED / "법령정보"

_MISC_ORDERED_PREFIX = re.compile(r"^(0[1-9]|10|11)_(.+)$", re.I)


def _sha256(p: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def _find_zip_member_on_disk(zip_path: Path, internal: str, expected_size: int) -> Path | None:
    base = zip_path.parent
    stem = zip_path.stem
    p = Path(internal.replace("\\", "/"))
    candidates = [
        base.joinpath(*p.parts),
        base / p.name,
        base / stem / p.name,
    ]
    for t in candidates:
        try:
            if t.is_file() and t.stat().st_size == expected_size:
                return t
        except OSError:
            continue
    return None


def verify_zip_fully_present(zip_path: Path) -> tuple[bool, list[str]]:
    errs: list[str] = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            if info.is_dir() or info.filename.endswith("/"):
                continue
            found = _find_zip_member_on_disk(zip_path, info.filename, info.file_size)
            if found is None:
                errs.append(f"{info.filename} (기대 {info.file_size} bytes)")
    return (len(errs) == 0, errs)


def remove_verified_zips(dry: bool) -> int:
    n = 0
    if not MISC.is_dir():
        return 0
    for z in sorted(MISC.glob("*.zip")):
        ok, errs = verify_zip_fully_present(z)
        if not ok:
            print(f"[ZIP 유지] {z.name} — 미일치:\n  " + "\n  ".join(errs[:12]))
            if len(errs) > 12:
                print(f"  … 외 {len(errs) - 12}건")
            continue
        print(f"[ZIP 삭제] {z.name} (압축 해제본 확인됨)")
        if not dry:
            z.unlink()
        n += 1
    return n


def _iter_misc_pdfs():
    if not MISC.is_dir():
        return
    for p in MISC.rglob("*.pdf"):
        parts = set(p.parts)
        if ".venv" in parts:
            continue
        yield p


def _ordered_canonical_pdf_hashes() -> set[str]:
    """판례모음 루트·`법령정보/` PDF 정본 해시(`old/` 제외)."""
    out: set[str] = set()
    if not ORDERED.is_dir():
        return out
    for p in ORDERED.glob("*.pdf"):
        try:
            out.add(_sha256(p))
        except OSError as e:
            print("경고: 정본 해시 실패", p, e)
    if LAWINFO_SUB.is_dir():
        for p in LAWINFO_SUB.glob("*.pdf"):
            try:
                out.add(_sha256(p))
            except OSError as e:
                print("경고: 정본 해시 실패", p, e)
    return out


def remove_misc_readme_duplicate(dry: bool) -> int:
    name = "README_국가법령정보_인용순서.txt"
    a, b = MISC / name, ORDERED / name
    if not (a.is_file() and b.is_file()):
        return 0
    try:
        if _sha256(a) != _sha256(b):
            return 0
    except OSError:
        return 0
    print(f"[TXT 삭제·판례모음과 동일] {a.relative_to(_REPO)}")
    if not dry:
        a.unlink()
    return 1


def strip_misc_ordered_prefixes(dry: bool) -> int:
    """기타참고 루트 PDF에서 `01_`~`11_` 접두 제거."""
    if not MISC.is_dir():
        return 0
    n = 0
    for p in sorted(MISC.glob("*.pdf")):
        m = _MISC_ORDERED_PREFIX.match(p.name)
        if not m:
            continue
        new_name = m.group(2)
        dest = MISC / new_name
        if dest.resolve() == p.resolve():
            continue
        if dest.exists():
            try:
                if _sha256(dest) == _sha256(p):
                    print(f"[PDF 삭제·접두만 다른 동일본] {p.relative_to(_REPO)}")
                    if not dry:
                        p.unlink()
                    n += 1
                else:
                    print(
                        f"[경고] 이름 충돌·내용 상이 — 스킵: {p.name} (이미 있음: {new_name})"
                    )
            except OSError as e:
                print("경고:", p, e)
            continue
        print(f"[PDF 이름 변경] {p.name} → {new_name}")
        if not dry:
            p.rename(dest)
        n += 1
    return n


def dedupe_pdfs(dry: bool) -> tuple[int, int]:
    """반환: (국가법령 대비 제거 수, 기타참고 내부 중복 제거 수)"""
    if not ORDERED.is_dir():
        print("경고: (국가법령정보)판례모음 없음 — PDF 중복만 스킵")
        return 0, 0

    canonical_hashes = _ordered_canonical_pdf_hashes()

    removed_vs_ordered = 0
    misc_pdfs = list(_iter_misc_pdfs())
    for p in misc_pdfs:
        try:
            h = _sha256(p)
        except OSError as e:
            print("경고: 읽기 실패", p, e)
            continue
        if h in canonical_hashes:
            print(f"[PDF 삭제·법령정보와 동일] {p.relative_to(_REPO)}")
            if not dry:
                p.unlink()
            removed_vs_ordered += 1

    remaining = [p for p in _iter_misc_pdfs() if p.exists()]
    by_hash: dict[str, list[Path]] = defaultdict(list)
    for p in remaining:
        try:
            by_hash[_sha256(p)].append(p)
        except OSError:
            continue

    removed_internal = 0
    for h, paths in by_hash.items():
        if len(paths) < 2:
            continue
        paths.sort(key=lambda x: (("_중복" in x.name), len(str(x)), str(x)))

        keep = paths[0]
        for drop in paths[1:]:
            print(f"[PDF 삭제·기타참고 내부 중복] {drop.relative_to(_REPO)} (유지: {keep.relative_to(_REPO)})")
            if not dry:
                drop.unlink()
            removed_internal += 1

    return removed_vs_ordered, removed_internal


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="삭제하지 않고 로그만")
    args = ap.parse_args()
    dry = args.dry_run
    print("기타참고:", MISC)
    print("(국가법령정보)판례모음:", ORDERED)
    print("모드:", "DRY-RUN" if dry else "적용")
    rz = remove_verified_zips(dry)
    rreadme = remove_misc_readme_duplicate(dry)
    # 접두 `NN_` 제거 후 해시 비교해야 판례모음 정본과 동일 본이 잡힌다.
    rstrip = strip_misc_ordered_prefixes(dry)
    ro, ri = dedupe_pdfs(dry)
    print(
        f"완료: ZIP {rz}건, README중복 {rreadme}건, PDF(판례모음 동일) {ro}건, "
        f"PDF(기타참고 내부) {ri}건, 접두제거·정리 {rstrip}건"
    )


if __name__ == "__main__":
    main()
