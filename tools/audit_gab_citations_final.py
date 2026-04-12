# -*- coding: utf-8 -*-
"""`제출원문(원본)` 폴더의 제출 MD 6건 ↔ 갑호증및법령정보 양방향 인용 대조 검수.

실행(프로젝트 루트):
  python tools/audit_gab_citations_final.py
  python tools/audit_gab_citations_final.py --out "행정심판청구(제출용)/260409_갑호증_인용대조_검수결과.txt"
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

from wonmun_paths import latest_yymmdd_md_dir

_REPO = Path(__file__).resolve().parent.parent

_EVIDENCE_ROOT = _REPO / "행정심판청구(제출용)" / "갑호증및법령정보"
_MD_DIR = latest_yymmdd_md_dir(_REPO)

# ── 갑호증 인용 패턴 ──────────────────────────────────────────
# [갑 제N-M호증](#anchor) / [갑제 N-M호증] / 갑 제N-M호증 / 갑제N-M호증
_RE_GAB_LINK = re.compile(
    r"\[갑\s*제\s*(\d+(?:-\d+)?)\s*호증\]\([^)]*\)"
)
_RE_GAB_LINK_V2 = re.compile(
    r"\[갑제\s+(\d+(?:-\d+)?)\s*호증\]\([^)]*\)"
)
_RE_GAB_INLINE = re.compile(
    r"갑\s*제\s*(\d+(?:-\d+)?)\s*호증"
)
_RE_GAB_NOSPACE = re.compile(
    r"갑제(\d+(?:-\d+)?)호증"
)
# 축약형: 갑11-5 등 (별지 제3호)
_RE_GAB_SHORT = re.compile(
    r"갑\s*(\d+(?:-\d+)?)(?=\s|,|·|」|$)"
)
# 범위: 갑 제N-1~N-6호증 / 갑 제N~M호증
_RE_GAB_RANGE = re.compile(
    r"갑\s*제\s*(\d+)-(\d+)\s*호증\s*[~내지]+\s*갑?\s*제?\s*\d+-(\d+)\s*호증"
)
_RE_GAB_MAIN_RANGE = re.compile(
    r"갑\s*제\s*(\d+)\s*~\s*(\d+)\s*호증"
)

# ── 법령정보(판례) 인용 패턴 ──────────────────────────────────
_RE_CASE = re.compile(r"(\d{2,4}(?:누|두|다|나)\d+)")


def _normalise_gab(num: str) -> str:
    """'1-1' 등을 그대로 반환, 앞자리 0 제거."""
    parts = num.split("-")
    return "-".join(str(int(p)) for p in parts)


def extract_gab_citations(text: str) -> dict[str, set[str]]:
    """MD 텍스트에서 갑호증 번호를 모두 추출. 반환: {정규화번호: {출처패턴들}}"""
    found: dict[str, set[str]] = defaultdict(set)

    for m in _RE_GAB_LINK.finditer(text):
        found[_normalise_gab(m.group(1))].add("link")
    for m in _RE_GAB_LINK_V2.finditer(text):
        found[_normalise_gab(m.group(1))].add("link_v2")
    for m in _RE_GAB_INLINE.finditer(text):
        found[_normalise_gab(m.group(1))].add("inline")
    for m in _RE_GAB_NOSPACE.finditer(text):
        found[_normalise_gab(m.group(1))].add("nospace")

    for m in _RE_GAB_RANGE.finditer(text):
        main = int(m.group(1))
        lo, hi = int(m.group(2)), int(m.group(3))
        for sub in range(lo, hi + 1):
            found[f"{main}-{sub}"].add("range")

    for m in _RE_GAB_MAIN_RANGE.finditer(text):
        lo, hi = int(m.group(1)), int(m.group(2))
        for n in range(lo, hi + 1):
            found[str(n)].add("main_range")

    return dict(found)


def extract_case_citations(text: str) -> set[str]:
    return set(_RE_CASE.findall(text))


def scan_evidence_folder() -> tuple[dict[str, list[str]], dict[str, str]]:
    """증거 폴더를 스캔. 갑호증: {정규화번호: [파일명들]}, 법령: {사건번호slug: 파일명}"""
    gab_files: dict[str, list[str]] = defaultdict(list)
    law_files: dict[str, str] = {}

    if not _EVIDENCE_ROOT.is_dir():
        print(f"증거 폴더 없음: {_EVIDENCE_ROOT}", file=sys.stderr)
        return dict(gab_files), law_files

    for d in sorted(_EVIDENCE_ROOT.iterdir()):
        if not d.is_dir():
            continue
        if d.name == "법령정보":
            for f in sorted(d.iterdir()):
                if not f.is_file():
                    continue
                cases = _RE_CASE.findall(f.stem)
                for c in cases:
                    law_files[c] = f.name
                if not cases:
                    law_files[f.stem] = f.name
            continue
        m = re.match(r"갑제(\d+)호증", d.name)
        if not m:
            continue
        main_num = str(int(m.group(1)))
        for f in sorted(d.iterdir()):
            if not f.is_file():
                continue
            fm = re.match(r"갑제(\d+(?:-\d+)?)(?:호증|증)", f.stem)
            if fm:
                key = _normalise_gab(fm.group(1))
                gab_files[key].append(f.name)
            else:
                gab_files[main_num].append(f.name)

    return dict(gab_files), law_files


def run_audit(out_path: Path | None = None) -> str:
    lines: list[str] = []
    w = lines.append

    w("=" * 72)
    w("갑호증및법령정보 인용 대조 검수 결과")
    w(f"검수 대상 MD: {_MD_DIR}")
    w(f"증거 폴더:    {_EVIDENCE_ROOT}")
    w("=" * 72)
    w("")

    # 1) MD 읽기
    md_files = sorted(_MD_DIR.glob("*.md"))
    if not md_files:
        w("MD 파일 없음!")
        return "\n".join(lines)

    all_gab: dict[str, set[str]] = defaultdict(set)
    all_cases: set[str] = set()
    per_file_gab: dict[str, dict[str, set[str]]] = {}
    per_file_cases: dict[str, set[str]] = {}

    for md in md_files:
        text = md.read_text(encoding="utf-8")
        gab = extract_gab_citations(text)
        cases = extract_case_citations(text)
        per_file_gab[md.name] = gab
        per_file_cases[md.name] = cases
        for k, v in gab.items():
            all_gab[k].update(v)
        all_cases.update(cases)

    # 2) 증거 폴더 스캔
    gab_files, law_files = scan_evidence_folder()

    # ── A. 파일별 갑호증 인용 요약 ────────────────────────────
    w("─" * 72)
    w("[A] 파일별 갑호증 인용 요약")
    w("─" * 72)
    for fname, gab in per_file_gab.items():
        nums = sorted(gab.keys(), key=_sort_gab_key)
        w(f"\n  {fname}: {len(nums)}건")
        for num in nums:
            srcs = ", ".join(sorted(gab[num]))
            w(f"    갑 제{num}호증  ({srcs})")

    # ── B. 양방향 대조: 인용 → 증거파일 ──────────────────────
    w("")
    w("─" * 72)
    w("[B] 인용 → 증거파일 매칭")
    w("─" * 72)
    cited_nums = sorted(all_gab.keys(), key=_sort_gab_key)
    missing = []
    matched = []
    bundle_ok = []
    for num in cited_nums:
        files = gab_files.get(num, [])
        if files:
            matched.append(num)
            w(f"  [OK] 갑 제{num}호증 → {files[0]}" + (f" 외 {len(files)-1}건" if len(files) > 1 else ""))
        elif "-" not in num:
            sub_count = sum(1 for k in gab_files if k.startswith(num + "-"))
            if sub_count > 0:
                bundle_ok.append(num)
                w(f"  [OK] 갑 제{num}호증 (묶음 — 하위 부번 {sub_count}건 존재)")
            else:
                missing.append(num)
                w(f"  [!!] 갑 제{num}호증 → 증거파일 미발견")
        else:
            missing.append(num)
            w(f"  [!!] 갑 제{num}호증 → 증거파일 미발견")

    w(f"\n  개별파일 매칭 {len(matched)}건 / 묶음(주호증) {len(bundle_ok)}건 / 미발견 {len(missing)}건 (총 인용 {len(cited_nums)}건)")

    # ── C. 양방향 대조: 증거파일 → 인용 ──────────────────────
    w("")
    w("─" * 72)
    w("[C] 증거파일 → MD 인용 여부")
    w("─" * 72)
    uncited = []
    for num in sorted(gab_files.keys(), key=_sort_gab_key):
        if num in all_gab:
            w(f"  [OK] 갑 제{num}호증 ({len(gab_files[num])}파일) — MD에서 인용됨")
        else:
            main = num.split("-")[0]
            if main != num and main in all_gab:
                w(f"  [OK] 갑 제{num}호증 — 주호증({main}) 인용으로 포함")
            else:
                uncited.append(num)
                w(f"  [--] 갑 제{num}호증 ({gab_files[num][0]}) — MD에서 인용 안 됨")

    w(f"\n  인용됨 {len(gab_files) - len(uncited)}건 / 미인용 {len(uncited)}건 (총 증거 {len(gab_files)}건)")

    # ── D. 법령정보 대조 ─────────────────────────────────────
    w("")
    w("─" * 72)
    w("[D] 법령정보(판례) 인용 대조")
    w("─" * 72)
    for case_num in sorted(all_cases):
        if case_num in law_files:
            w(f"  [OK] {case_num} → {law_files[case_num]}")
        else:
            w(f"  [--] {case_num} — 법령정보 폴더에 PDF 없음 (본문 인용만)")

    w(f"\n  MD 인용 판례 {len(all_cases)}건 / 법령정보 PDF {len(law_files)}건")

    uncited_law = [k for k in law_files if k not in all_cases]
    if uncited_law:
        w(f"\n  법령정보 PDF 중 MD 미인용:")
        for k in uncited_law:
            w(f"    {law_files[k]}")

    # ── E. 표기 불일치 경고 ──────────────────────────────────
    w("")
    w("─" * 72)
    w("[E] 표기 불일치·특이사항")
    w("─" * 72)
    for fname, gab in per_file_gab.items():
        for num, srcs in gab.items():
            if "link_v2" in srcs:
                w(f"  [경고] {fname}: 갑 제{num}호증 — '[갑제 N호증]' 변형 표기 발견 (공백 위치 불일치)")

    w("")
    w("=" * 72)
    w("검수 완료")
    w("=" * 72)

    result = "\n".join(lines)

    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(result, encoding="utf-8")
        print(f"보고서: {out_path}")

    return result


def _sort_gab_key(num: str) -> tuple[int, int]:
    parts = num.split("-")
    return (int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description="갑호증·법령정보 인용 대조 검수")
    ap.add_argument("--out", type=Path, default=None,
                    help="보고서 출력 경로 (미지정 시 stdout)")
    args = ap.parse_args()

    out = args.out
    if out and not out.is_absolute():
        out = _REPO / out

    result = run_audit(out)
    if not out:
        print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
