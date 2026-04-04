# -*- coding: utf-8 -*-
"""갑호증 중복(SHA-256) 제거 후 파일명 정리.

1) 동일 해시 그룹에서 1개만 유지(우선순위 규칙).
2) `갑제N호증_첨부_nn_` → `첨부_nn_갑제N호증_` (+ `갑제N호증_` 직후 첨부번호와 동일한 `nn_` 한 번 제거).
3) 각 하위 폴더에서 `첨부_NN_갑제…` 파일을 번호순으로 재부여(01~).

실행: 프로젝트 루트에서
  python tools/dedup_rename_gab_evidence_attach.py --dry-run
  python tools/dedup_rename_gab_evidence_attach.py
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
import uuid
from collections import defaultdict
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
GAB = _REPO / "행정심판청구(증거)" / "최종" / "갑호증"

PAT_ATTACH_OLD = re.compile(
    r"^갑제(\d+)호증_첨부_(\d{2})_(.+)$",
)
PAT_ATTACH_NEW = re.compile(
    r"^첨부_(\d{2,3})_갑제(\d+)호증_(.+)$",
)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(1024 * 1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def _extract_cheom_num(name: str) -> int:
    m = re.search(r"첨부_(\d{2,3})_", name)
    if m:
        return int(m.group(1))
    m = re.match(r"^(\d{2})_", name)
    if m:
        return int(m.group(1))
    return 9999


def _choose_keep(paths: list[Path]) -> Path:
    """동일 해시 그룹에서 유지할 1개 경로."""
    if len(paths) == 1:
        return paths[0]

    def name(p: Path) -> str:
        return p.name

    # 1) 갑 제9-1~10-7 호증명 파일
    for p in paths:
        if re.search(r"갑제10-[1-7]호증", p.name):
            return p

    # 2) 갑7-3 루트 파일명
    for p in paths:
        if p.name.startswith("갑제6-3호증_"):
            return p

    # 3) 갑3-2 루트 파일명
    for p in paths:
        if p.name.startswith("갑제3-2호증_"):
            return p

    # 4) 갑13 vs 갑11 (의장·의회 자료 등) → 갑13 우선
    has13 = [p for p in paths if "갑제12호증" in str(p).replace("\\", "/")]
    has11 = [p for p in paths if "갑제10호증" in str(p).replace("\\", "/")]
    if has13 and has11 and len(paths) == 2:
        return has13[0]

    # 5) 갑13 내부 03 심사보고서
    for p in paths:
        if "03_심사보고서" in p.name:
            return p

    # 6) 갑11 vs 갑15 → 갑11만 (첨부 번호 최소)
    g11 = [p for p in paths if "갑제10호증" in str(p).replace("\\", "/")]
    g15 = [p for p in paths if "갑제15호증" in str(p).replace("\\", "/")]
    if g11 and g15:
        return min(g11, key=lambda p: _extract_cheom_num(p.name))

    # 7) 같은 폴더 → 첨부 번호 최소
    parents = {p.parent for p in paths}
    if len(parents) == 1:
        return min(paths, key=lambda p: _extract_cheom_num(p.name))

    return min(paths, key=lambda p: str(p))


def _strip_dup_after_exhibit(new_basename: str, nn: str) -> str:
    """`첨부_nn_갑제N호증_rest` 에서 rest가 `nn_` 로 다시 시작하면 1회 제거."""
    m = PAT_ATTACH_NEW.match(new_basename)
    if not m:
        return new_basename
    n_ex, gabn, rest = m.group(1), m.group(2), m.group(3)
    if rest.startswith(f"{nn}_"):
        rest = rest[len(nn) + 1 :]
    new_basename = f"첨부_{n_ex}_갑제{gabn}호증_{rest}"
    return new_basename


def _dedup(dry_run: bool, log: list[str]) -> int:
    by_h: dict[str, list[Path]] = defaultdict(list)
    for p in GAB.rglob("*"):
        if not p.is_file():
            continue
        by_h[_sha256(p)].append(p)

    deleted = 0
    for h, ps in by_h.items():
        if len(ps) < 2:
            continue
        keep = _choose_keep(ps)
        for p in ps:
            if p.resolve() == keep.resolve():
                continue
            log.append(f"삭제(동일 해시): {p.relative_to(_REPO)}")
            if not dry_run:
                p.unlink()
            deleted += 1
    log.append(f"중복 삭제: {deleted}건")
    return deleted


def _swap_attach_prefix(dry_run: bool, log: list[str]) -> int:
    """갑제N호증_첨부_nn_ → 첨부_nn_갑제N호증_"""
    plans: list[tuple[Path, str]] = []
    for p in GAB.rglob("*"):
        if not p.is_file():
            continue
        m = PAT_ATTACH_OLD.match(p.name)
        if not m:
            continue
        gabn, nn, rest = m.group(1), m.group(2), m.group(3)
        new_name = f"첨부_{nn}_갑제{gabn}호증_{rest}"
        new_name = _strip_dup_after_exhibit(new_name, nn)
        if new_name != p.name:
            plans.append((p, new_name))

    for p, new_name in plans:
        log.append(f"이름변경: {p.name}\n  -> {new_name}")
    if dry_run:
        return len(plans)

    u = uuid.uuid4().hex[:10]
    tmps: list[tuple[Path, Path]] = []
    for i, (p, new_name) in enumerate(plans):
        t = p.parent / f"_sw_{u}_{i:05d}{p.suffix}"
        p.rename(t)
        tmps.append((t, p.parent / new_name))
    for t, dest in tmps:
        if dest.exists():
            print(f"건너뜀(대상 존재): {dest}", file=sys.stderr)
            continue
        t.rename(dest)
    return len(plans)


def _resequence_folders(dry_run: bool, log: list[str]) -> int:
    """각 폴더에서 `첨부_NN_갑제…` 를 01부터 연속 번호로."""
    changed = 0
    for d in sorted([x for x in GAB.iterdir() if x.is_dir()]):
        items: list[tuple[int, Path]] = []
        for p in d.iterdir():
            if not p.is_file():
                continue
            m = PAT_ATTACH_NEW.match(p.name)
            if not m:
                continue
            items.append((_extract_cheom_num(p.name), p))
        if not items:
            continue
        items.sort(key=lambda t: (t[0], t[1].name))
        new_names: list[tuple[Path, str]] = []
        for i, (_, p) in enumerate(items, start=1):
            m = PAT_ATTACH_NEW.match(p.name)
            assert m
            tail = m.group(3)
            new_names.append((p, f"첨부_{i:02d}_갑제{m.group(2)}호증_{tail}"))
        to_move = [(p, n) for p, n in new_names if p.name != n]
        if not to_move:
            continue
        log.append(f"[{d.name}] 첨부 번호 재정렬: {len(to_move)}건")
        if dry_run:
            changed += len(to_move)
            continue
        u = uuid.uuid4().hex[:8]
        tmps: list[tuple[Path, Path]] = []
        for i, (p, new_name) in enumerate(to_move):
            t = d / f"_rs_{u}_{i:04d}{p.suffix}"
            p.rename(t)
            tmps.append((t, d / new_name))
        for t, dest in tmps:
            if dest.exists():
                log.append(f"  건너뜀(충돌): {dest.name}")
                continue
            t.rename(dest)
            changed += 1
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    log: list[str] = []

    if not GAB.is_dir():
        print(f"없음: {GAB}", file=sys.stderr)
        sys.exit(1)

    _dedup(args.dry_run, log)
    n_swap = _swap_attach_prefix(args.dry_run, log)
    log.append(f"접두 교체(갑제N호증_첨부_ → 첨부_NN_갑제N호증_): {n_swap}건")
    _resequence_folders(args.dry_run, log)

    out = _REPO / "행정심판청구(증거)" / "최종" / "260401_갑호증_중복제거_첨부이름변경_기록.txt"
    text = "\n".join(log) + "\n"
    if not args.dry_run:
        out.write_text(text, encoding="utf-8")
    print(text)
    if not args.dry_run:
        print(f"\n기록: {out}")
    else:
        print("\n(드라이런 - 미적용)")


if __name__ == "__main__":
    main()
