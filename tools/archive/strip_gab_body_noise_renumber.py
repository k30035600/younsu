# -*- coding: utf-8 -*-
"""갑호증 첨부(갑제…호증)_nn_ 본문에서 잡표기 제거 후 폴더별 가나다 정렬·재번호.

제거(본문 앞에서 반복):
  - 첨부18. 첨부20. 등  ^첨부\\d+\\.?\\s*
  - 7-5. 16-1. 6-3. 등  ^\\d+-\\d+\\.\\s*
  - 1. 10. 32. 등 단일 번호 목차  ^\\d+\\.\\s*

실행(과거 일회성): python tools/archive/strip_gab_body_noise_renumber.py
  --dry-run  미리보기만
"""
from __future__ import annotations

import argparse
import re
import uuid
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
GAB = _REPO / "행정심판청구(제출용)" / "최종" / "갑호증"

PAT_ATTACH_PAREN = re.compile(
    r"^첨부\(갑제(\d+(?:-\d+)?)호증\)_(\d{2,3})_(.+)$",
)


def clean_body(body: str) -> str:
    """목차·첨부번호 접두를 반복 제거."""
    s = body
    for _ in range(40):
        old = s
        s = re.sub(r"^첨부\d+\.?\s*", "", s)
        s = re.sub(r"^\d+-\d+\.\s*", "", s)
        s = re.sub(r"^\d+\.\s*", "", s)
        if s == old:
            break
    return s.strip()


def parse_paren(name: str) -> tuple[str, str, str] | None:
    m = PAT_ATTACH_PAREN.match(name)
    if not m:
        return None
    return m.group(1), m.group(2), m.group(3)


def make_unique_bodies(bodies: list[str]) -> list[str]:
    """정리 후 본문이 동일하면 확장자 앞에 _2, _3."""
    counts: dict[str, int] = {}
    for b in bodies:
        counts[b] = counts.get(b, 0) + 1
    serial: dict[str, int] = {}
    out: list[str] = []
    for b in bodies:
        if counts.get(b, 0) <= 1:
            out.append(b)
            continue
        serial[b] = serial.get(b, 0) + 1
        k = serial[b]
        if k == 1:
            out.append(b)
        else:
            p = Path(b)
            out.append(f"{p.stem}_{k}{p.suffix}")
    return out


def collect_paren_files(folder: Path) -> list[Path]:
    return sorted(
        [p for p in folder.iterdir() if p.is_file() and PAT_ATTACH_PAREN.match(p.name)],
        key=lambda p: p.name,
    )


def process_folder(folder: Path, *, dry_run: bool, log: list[str]) -> None:
    files = collect_paren_files(folder)
    if not files:
        return

    parsed: list[tuple[Path, str, str, str]] = []
    for p in files:
        t = parse_paren(p.name)
        if not t:
            continue
        ex, nn, body = t
        new_body = clean_body(body)
        if not new_body:
            new_body = "(본문없음)"
        parsed.append((p, ex, nn, new_body))

    exhibits = {ex for _, ex, _, _ in parsed}
    if len(exhibits) != 1:
        raise SystemExit(f"{folder}: 한 폴더에 호증 번호가 둘 이상입니다: {exhibits}")
    ex = next(iter(exhibits))

    def sort_key(item: tuple[Path, str, str, str]) -> tuple[str, str]:
        path, _e, _n, nb = item
        return (nb, path.name)

    parsed.sort(key=sort_key)

    bodies_only = [t[3] for t in parsed]
    unique_bodies = make_unique_bodies(bodies_only)

    finals: list[tuple[Path, str]] = []
    for i, ((old_path, _ex, _old_nn, _nb), ubody) in enumerate(
        zip(parsed, unique_bodies, strict=True), start=1
    ):
        nn = f"{i:03d}" if i >= 100 else f"{i:02d}"
        # ubody는 원본 본문(확장자 포함)에서 정리한 값
        new_name = f"첨부(갑제{ex}호증)_{nn}_{ubody}"
        finals.append((old_path, new_name))

    # 변경 없으면 스킵 (드라이런에서는 항상 표시)
    unchanged = all(old.name == new for old, new in finals)
    if unchanged and not dry_run:
        return

    rel = folder.relative_to(_REPO)
    log.append(f"=== {rel} ({len(finals)}건) ===")

    seen_names: set[str] = set()
    for old, new in finals:
        if new in seen_names:
            raise SystemExit(f"이름 중복: {new}")
        seen_names.add(new)

    if dry_run:
        for old, new in finals:
            log.append(f"  {old.name}")
            log.append(f"    -> {new}")
        return

    u = uuid.uuid4().hex[:12]
    tmps: list[tuple[Path, Path, str]] = []
    for idx, (old_path, new_name) in enumerate(finals):
        tmp = old_path.parent / f"_sbn_{u}_{idx:04d}{old_path.suffix}"
        old_path.rename(tmp)
        tmps.append((tmp, old_path.parent, new_name))

    for tmp, parent, new_name in tmps:
        dest = parent / new_name
        if dest.exists():
            raise SystemExit(f"대상 이미 존재: {dest}")
        tmp.rename(dest)
        log.append(f"  {new_name}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not GAB.is_dir():
        raise SystemExit(f"없음: {GAB}")

    log: list[str] = []
    for folder in sorted([p for p in GAB.iterdir() if p.is_dir()]):
        process_folder(folder, dry_run=args.dry_run, log=log)

    text = "\n".join(log) + "\n" if log else "(처리할 첨부(갑제…) 파일 없음)\n"
    print(text)

    out = _REPO / "행정심판청구(제출용)" / "최종" / "260401_본문잡표기제거_정렬재번호_기록.txt"
    if log and not args.dry_run:
        out.write_text(text, encoding="utf-8")
        print(f"기록: {out}")
    elif args.dry_run:
        print("(드라이런 — 이름 변경·기록 없음)")


if __name__ == "__main__":
    main()
