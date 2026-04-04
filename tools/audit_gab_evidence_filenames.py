# -*- coding: utf-8 -*-
"""갑호증 파일명 규약 전수조사.

- 첨부(갑제…) 괄호형 / 구형 첨부_nn_갑제 / 루트 갑제…호증_ 단일파일 등으로 분류
- 하위폴더명(갑제N호증_)과 첨부(갑제…호증) 내 번호 불일치 목록
- 규약 밖 파일(OTHER) 목록

실행(프로젝트 루트):
  python tools/audit_gab_evidence_filenames.py

산출:
  행정심판청구(증거)/최종/260401_갑호증_파일명전수조사.txt
"""
from __future__ import annotations

import os
import re
import sys
from collections import defaultdict
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
GAB = _REPO / "행정심판청구(증거)" / "최종" / "갑호증"
OUT = _REPO / "행정심판청구(증거)" / "최종" / "260401_갑호증_파일명전수조사.txt"

PAT_ATTACH_PAREN = re.compile(
    r"^첨부\(갑제(\d+(?:-\d+)?)호증\)_(\d{2,3})_(.+)$",
)
PAT_ATTACH_LEGACY = re.compile(
    r"^첨부_(\d{2,3})_갑제(\d+(?:-\d+)?)호증_(.+)$",
)
# 루트·부속: 갑제6-2증_ … 오타 포함
PAT_GAB_NAMED = re.compile(r"^갑제(\d+(?:-\d+)?)(?:호증|증)_(.+)$")
PAT_FOLDER_EX = re.compile(r"^갑제(\d+(?:-\d+)?)호증_")

# 로그·백업·보조(의도적 예외)
def is_auxiliary(name: str) -> bool:
    if name == "gab_qr_urls.txt":
        return True
    if name.endswith(".pdf.bak"):
        return True
    if name.startswith("gab_") and name.endswith(".txt"):
        return True
    return False


def classify(filename: str) -> str:
    if is_auxiliary(filename):
        return "AUX"
    if PAT_ATTACH_PAREN.match(filename):
        return "ATTACH_PAREN"
    if PAT_ATTACH_LEGACY.match(filename):
        return "ATTACH_LEGACY"
    if PAT_GAB_NAMED.match(filename):
        return "GAB_ROOT"
    return "OTHER"


def folder_exhibit_key(dirname: str) -> str | None:
    m = PAT_FOLDER_EX.match(dirname)
    return m.group(1) if m else None


def main() -> None:
    if not GAB.is_dir():
        raise SystemExit(f"없음: {GAB}")

    by_cat: dict[str, list[str]] = defaultdict(list)
    mismatch: list[str] = []
    # 하위폴더별 첨부 호증번호 집합
    subdir_attach_ex: dict[str, set[str]] = defaultdict(set)

    for dirpath, _dirnames, filenames in os.walk(GAB):
        parental = Path(dirpath)
        rel_parent = parental.relative_to(GAB)
        if rel_parent.parts:
            subdir_name = rel_parent.parts[0]
        else:
            subdir_name = ""
        fold_ex = folder_exhibit_key(subdir_name) if subdir_name else None

        for fn in filenames:
            fp = parental / fn
            rel = str(fp.relative_to(GAB)).replace("\\", "/")
            cat = classify(fn)
            by_cat[cat].append(rel)

            if cat == "ATTACH_PAREN" and fold_ex:
                m = PAT_ATTACH_PAREN.match(fn)
                if m:
                    file_ex = m.group(1)
                    subdir_attach_ex[subdir_name].add(file_ex)
                    if file_ex != fold_ex:
                        mismatch.append(
                            f"  폴더호증={fold_ex} ≠ 파일내부={file_ex}  {rel}"
                        )

            if cat == "ATTACH_LEGACY" and fold_ex:
                m = PAT_ATTACH_LEGACY.match(fn)
                if m and m.group(2) != fold_ex:
                    mismatch.append(
                        f"  폴더호증={fold_ex} ≠ 구형첨부={m.group(2)}  {rel}"
                    )

    lines: list[str] = []
    lines.append("=== 갑호증 파일명 규약 전수조사 ===")
    lines.append(f"기준 경로: {GAB}")
    lines.append("")
    lines.append("[분류 요약 — 건수]")
    order = (
        "ATTACH_PAREN",
        "ATTACH_LEGACY",
        "GAB_ROOT",
        "AUX",
        "OTHER",
    )
    total = 0
    for key in order:
        n = len(by_cat.get(key, []))
        total += n
        label = {
            "ATTACH_PAREN": "첨부(갑제…호증)_nn_ (괄호 표준)",
            "ATTACH_LEGACY": "첨부_nn_갑제…호증_ (구형)",
            "GAB_ROOT": "갑제…(호증|증)_… (단일·분할 호증 파일명)",
            "AUX": "보조(gab_qr_urls.txt, *.pdf.bak 등)",
            "OTHER": "기타(규약 밖 — 점검 필요)",
        }[key]
        lines.append(f"  {label}: {n:,}건")
    lines.append(f"  합계: {total:,}건")
    lines.append("")

    lines.append("[폴더당 첨부(괄호) 호증 번호 — 한 폴더에 복수 번호면 나열]")
    for d in sorted(subdir_attach_ex.keys()):
        exs = subdir_attach_ex[d]
        exs_s = ", ".join(sorted(exs, key=lambda x: (len(x), x)))
        flag = " ⚠ 복수" if len(exs) > 1 else ""
        lines.append(f"  {d}/ → {exs_s}{flag}")
    if not subdir_attach_ex:
        lines.append("  (해당 없음)")
    lines.append("")

    lines.append("[폴더명 대비 첨부 파일 내 호증번호 불일치]")
    if mismatch:
        lines.extend(sorted(mismatch))
    else:
        lines.append("  (없음)")
    lines.append("")

    lines.append("[갑제…(호증|증)_… 단일·분할 파일 전체 — GAB_ROOT]")
    roots = sorted(by_cat.get("GAB_ROOT", []))
    if roots:
        for r in roots:
            lines.append(f"  {r}")
    else:
        lines.append("  (없음)")
    lines.append("")

    lines.append("[루트(갑호증 직하) 파일만 — 하위폴더 제외]")
    root_only = sorted(r for r in by_cat.get("GAB_ROOT", []) if "/" not in r)
    root_other = sorted(r for r in by_cat.get("OTHER", []) if "/" not in r)
    root_attach = sorted(
        r for r in by_cat.get("ATTACH_PAREN", []) + by_cat.get("ATTACH_LEGACY", []) if "/" not in r
    )
    if root_attach:
        lines.append("  … 첨부류(직하)")
        for r in root_attach:
            lines.append(f"    {r}")
    if root_only:
        lines.append("  … 갑제…호증_ 직하")
        for r in root_only:
            lines.append(f"    {r}")
    if root_other:
        lines.append("  … OTHER 직하")
        for r in root_other:
            lines.append(f"    {r}")
    if not root_attach and not root_only and not root_other:
        lines.append("  (첨부·갑제 단일파일·OTHER 모두 하위폴더에만 있음)")
    lines.append("")

    lines.append("[규약 밖 파일 전체 목록 — OTHER]")
    others = sorted(by_cat.get("OTHER", []))
    if others:
        for r in others:
            lines.append(f"  {r}")
    else:
        lines.append("  (없음)")
    lines.append("")

    lines.append(
        "[참고] `tools/audit_gab_evidence_folder.py` 의 REQUIRED_FILES/DIRS 는 "
        "예전 폴더명(갑제9호증_객관적공법외관 등) 기준이면 누락으로 나올 수 있음. "
        "실제 트리와 맞추려면 해당 스크립트의 기대 경로를 갱신할 것."
    )
    lines.append("")

    lines.append("[구형 첨부_nn_갑제… — 마이그레이션 잔여 여부]")
    leg = sorted(by_cat.get("ATTACH_LEGACY", []))
    if leg:
        for r in leg:
            lines.append(f"  {r}")
    else:
        lines.append("  (없음)")
    lines.append("")

    text = "\n".join(lines) + "\n"
    OUT.write_text(text, encoding="utf-8")
    so = getattr(sys.stdout, "reconfigure", None)
    if callable(so):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass
    try:
        print(text)
    except UnicodeEncodeError:
        print(f"전수조사 완료. OTHER {len(others)}건 — 본문은 파일 참조.")
    print(f"기록: {OUT}")


if __name__ == "__main__":
    main()
