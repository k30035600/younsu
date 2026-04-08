# -*- coding: utf-8 -*-
"""첨부 폴더에서, 증거 통합 트리와 SHA256 이 동일한 파일만 삭제(바이트 중복본).

  python tools/prune_attachment_duplicates.py --dry-run
  python tools/prune_attachment_duplicates.py --apply

기본 경로(저장소 루트 기준):
  첨부: 돌심방자료/행정심판청구서_첨부
  증거: 행정심판청구(증거)/갑호증 및 법령정보
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_DEFAULT_ATTACH = _REPO / "돌심방자료" / "행정심판청구서_첨부"
_DEFAULT_EVID = _REPO / "행정심판청구(증거)" / "갑호증 및 법령정보"
_SKIP = {"Thumbs.db", "desktop.ini", ".DS_Store"}
_EXT = {".pdf", ".jpg", ".jpeg", ".jpe", ".png", ".gif", ".webp", ".tif", ".tiff", ".mp4", ".docx"}


def sha256_file(p: Path) -> str | None:
    try:
        h = hashlib.sha256()
        with p.open("rb") as f:
            for ch in iter(lambda: f.read(1024 * 1024), b""):
                h.update(ch)
        return h.hexdigest()
    except OSError:
        return None


def collect_hashes(root: Path) -> set[str]:
    out: set[str] = set()
    if not root.is_dir():
        return out
    for p in root.rglob("*"):
        if not p.is_file() or p.name.startswith(".") or p.name in _SKIP:
            continue
        if p.suffix.lower() not in _EXT:
            continue
        d = sha256_file(p)
        if d:
            out.add(d)
    return out


def rmdir_empty_bottom_up(root: Path) -> int:
    removed = 0
    if not root.is_dir():
        return 0
    for p in sorted(root.rglob("*"), key=lambda x: len(x.parts), reverse=True):
        if p.is_dir():
            try:
                next(p.iterdir())
            except StopIteration:
                try:
                    p.rmdir()
                    removed += 1
                except OSError:
                    pass
    return removed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--attach",
        type=Path,
        default=_DEFAULT_ATTACH,
        help="첨부 루트",
    )
    ap.add_argument(
        "--evidence",
        type=Path,
        default=_DEFAULT_EVID,
        help="증거 통합 루트",
    )
    ap.add_argument("--apply", action="store_true", help="실제 삭제")
    ap.add_argument("--dry-run", action="store_true", help="목록만(기본 동작과 동일)")
    args = ap.parse_args()
    attach = args.attach.resolve() if args.attach.is_absolute() else (_REPO / args.attach).resolve()
    evid = args.evidence.resolve() if args.evidence.is_absolute() else (_REPO / args.evidence).resolve()

    if not attach.is_dir():
        print(f"없음: {attach}", file=sys.stderr)
        return 1
    if not evid.is_dir():
        print(f"없음: {evid}", file=sys.stderr)
        return 1

    right_hashes = collect_hashes(evid)
    to_delete: list[Path] = []
    for p in attach.rglob("*"):
        if not p.is_file() or p.name.startswith(".") or p.name in _SKIP:
            continue
        if p.suffix.lower() not in _EXT:
            continue
        h = sha256_file(p)
        if h and h in right_hashes:
            to_delete.append(p)

    mode = "삭제 실행" if args.apply else "드라이런"
    print(f"{mode}: 첨부={attach.name}, 증거 해시 {len(right_hashes)}개 기준")
    print(f"대상 파일 {len(to_delete)}건")
    for p in sorted(to_delete):
        rel = p.relative_to(attach)
        print(f"  {'DEL' if args.apply else 'WOULD'} {rel}")
    if args.apply and to_delete:
        for p in to_delete:
            try:
                p.unlink()
            except OSError as e:
                print(f"  실패: {p} — {e}", file=sys.stderr)
        n = rmdir_empty_bottom_up(attach)
        print(f"빈 폴더 정리 시도: {n}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
