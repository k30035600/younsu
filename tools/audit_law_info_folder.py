# -*- coding: utf-8 -*-
"""법령정보(판례 PDF) 전수 점검: 통합·레거시 경로 목록, 사건번호 추출, 동일 사건 중복 알림.

실행(프로젝트 루트):
  python tools/audit_law_info_folder.py

산출:
  행정심판청구(증거)/YYMMDD_법령정보_전수점검.txt

`build_commission_evidence_json.py`의 `LAW_INFO_*_RELS`·사건번호 규칙과 동일합니다.
"""
from __future__ import annotations

import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

_TOOLS = Path(__file__).resolve().parent
_REPO = _TOOLS.parent
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

import build_commission_evidence_json as cej  # noqa: E402


def _cases_to_rels(items: list[dict]) -> tuple[dict[str, list[str]], list[dict]]:
    by_case: dict[str, list[str]] = defaultdict(list)
    no_id: list[dict] = []
    for it in items:
        rel = str(it.get("rel") or "")
        ids = cej._all_case_ids_from_precedent_item(it)
        if not ids:
            no_id.append(it)
            continue
        for cid in ids:
            by_case[cid].append(rel)
    return dict(by_case), no_id


def main() -> None:
    out_path = (
        _REPO
        / "행정심판청구(증거)"
        / f"{date.today().strftime('%y%m%d')}_법령정보_전수점검.txt"
    )
    evid = _REPO / "행정심판청구(증거)"
    if not evid.is_dir():
        print(f"없음: {evid}", file=sys.stderr)
        sys.exit(1)

    legacy = cej._list_law_pdf_items_for_rels(cej.LAW_INFO_LEGACY_RELS)
    under_gab = cej._list_law_pdf_items_for_rels(cej.LAW_INFO_UNDER_GAB_RELS)
    merged = cej.merge_precedent_pdf_entries(legacy, under_gab)

    l_by, _ = _cases_to_rels(legacy)
    g_by, _ = _cases_to_rels(under_gab)
    all_items = legacy + under_gab
    _, all_no = _cases_to_rels(all_items)

    lines: list[str] = [
        "=== 법령정보(판례 PDF) 전수점검 ===",
        f"레거시: {', '.join(cej.LAW_INFO_LEGACY_RELS)}",
        f"갑호증 하위: {', '.join(cej.LAW_INFO_UNDER_GAB_RELS)}",
        "",
        f"[요약] 레거시 PDF: {len(legacy)}건 | 갑호증/법령정보: {len(under_gab)}건 | 병합(포털 precedent) 고유: {len(merged)}건",
        "",
    ]

    dup_all = {k: v for k, v in _cases_to_rels(all_items)[0].items() if len(set(v)) > 1}
    lines.append("[동일 사건번호·서로 다른 파일 — 전체]")
    if dup_all:
        for cid in sorted(dup_all.keys()):
            for r in sorted(set(dup_all[cid])):
                lines.append(f"  ⚠ {cid}  →  {r}")
    else:
        lines.append("  (없음)")
    lines.append("")

    lines.append("[레거시에만 있음 — 통합 폴더로 옮길지 검토]")
    only_l = sorted(cid for cid in l_by if cid not in g_by)
    if only_l:
        for cid in only_l:
            for r in sorted(set(l_by[cid])):
                lines.append(f"  {cid}  {r}")
    else:
        lines.append("  (없음)")
    lines.append("")

    lines.append("[갑호증/법령정보에만 있음]")
    only_g = sorted(cid for cid in g_by if cid not in l_by)
    if only_g:
        for cid in only_g:
            for r in sorted(set(g_by[cid])):
                lines.append(f"  {cid}  {r}")
    else:
        lines.append("  (없음)")
    lines.append("")

    lines.append("[사건번호 미검출 PDF — 정독·수동 대조]")
    for it in sorted(all_no, key=lambda x: x.get("rel") or ""):
        lines.append(f"  ? {it.get('rel')}")
    if not all_no:
        lines.append("  (없음)")
    lines.append("")

    lines.append("[레거시 전체 목록]")
    for it in legacy:
        lines.append(f"  {it.get('rel')}")
    if not legacy:
        lines.append("  (없음)")
    lines.append("")
    lines.append("[갑호증/법령정보 전체 목록]")
    for it in under_gab:
        lines.append(f"  {it.get('rel')}")
    if not under_gab:
        lines.append("  (없음)")
    lines.append("")

    text = "\n".join(lines) + "\n"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    so = getattr(sys.stdout, "reconfigure", None)
    if callable(so):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass
    try:
        print(text)
    except UnicodeEncodeError:
        print(
            f"점검 완료. 레거시 {len(legacy)}건, 갑/법 {len(under_gab)}건 — 본문은 파일 참조."
        )
    print(f"기록: {out_path}")


if __name__ == "__main__":
    main()
