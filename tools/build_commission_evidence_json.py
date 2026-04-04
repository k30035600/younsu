# -*- coding: utf-8 -*-
"""
청구서 정본 MD의 [증거자료 목록]을 읽어 commission-portal용 JSON을 생성합니다.

실행(프로젝트 루트 younsu):
  python tools/build_commission_evidence_json.py

「부터~까지」분할 묶음(포털 UI와 동일 규칙):
  evidence 행에 gabBundlePrimaryKey, gabFileRange.rels·labels·firstRel·lastRel을 두면
  web/commission-portal/public/app.js 가 통합 호증명 선택·분할 파일 개별 선택 모두
  우측 참조 패널에 rels 전체(썸네일 그리드)를 표시한다. (특정 호증만이 아니라 동일 필드면 전부.)

  merge_all_gab_range_rows()가 갑9 준공식(9-1~9-7)·갑10 주민설명회(10-1~10-6)·갑12·갑13·4·5a·5b·6·7·8·9 등 구간을 한 행으로 병합하고
  gabBundlePrimaryKey를 넣어 드롭다운에 묶음(__REF_GAB_BUNDLE__)이 생긴다.
  추가 구간은 merge_gab*_range_rows 패턴으로 이 파일에 넣고 merge_all_gab_range_rows에 연결한다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_MD = _REPO / "행정심판청구(최종)" / "260404_01_행정심판청구서_최종.md"
_OUT = _REPO / "web" / "commission-portal" / "public" / "data" / "portal-data.json"

# 실제 편철 루트: `행정심판청구(증거)/갑호증/갑제N호증/파일`
GAB_DIR_REL = "행정심판청구(증거)/갑호증"
# 제출 전·작업본이 위 루트에 없을 때 보조 스캔(전수조사 등)
GAB_SURVEY_DIR_REL = "행정심판청구(증거)/갑호증 전수조사"
# 국가법령정보 대조용 검증본(갑호증 제외) — `행정심판청구(증거)/최종/법령정보/`
LAW_INFO_DIR_REL = "행정심판청구(증거)/최종/법령정보"
# 우측 패널 「첨부」 — `행정심판청구(증거)/최종/첨부/` (갑호증 루트와 별도)
ATTACH_DIR_REL = "행정심판청구(증거)/최종/첨부"
_VIEWABLE_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4"}


def _gab_dir(folder: str, filename: str) -> str:
    """folder 예: `갑제4호증` — 저장소 상대 posix 경로."""
    return f"{GAB_DIR_REL}/{folder}/{filename}".replace("\\", "/")


# 번호 줄: "1-1. 갑 제1-1호증:" / "1-4. [갑 제1-4호증](#1-4)(취지)" / "10. 갑 제10호증(보충(보강)):"
_GAB_HEADER = re.compile(
    r"^(\d+(?:-\d+)?)\.\s+"
    r"(?:\[\s*)?(갑 제\d+(?:-\d+)?호증(?:\(보충\(보강\)\))?)\s*"
    r"(?:\]\([^)]*\))?\s*"
    r"(?:[:：]\s*)?(.*)$"
)


def _strip_gab_header_bold(line: str) -> str:
    """갑호증 번호 줄에서 볼드 마커만 제거(레거시 `**갑 제…**` 호환)."""
    return line.strip().replace("**", "")

# 갑10: 조성계획 변경 주민설명회(10-1~10-6)
_G10 = "갑제10호증"
GAB10_JUNGGONG_RANGE_NUMS = ("10-1", "10-2", "10-3", "10-4", "10-5", "10-6")
GAB10_JUNGGONG_FIRST_REL = _gab_dir(
    _G10, "갑제10-1호증_농원근린공원 조성계획변경 주민설명회.jpg"
)
GAB10_JUNGGONG_LAST_REL = _gab_dir(
    _G10, "갑제10-6호증_농원근린공원 조성계획변경_주민설명회(인천일보).jpg"
)
GAB10_JUNGGONG_RELS: list[str] = [
    _gab_dir(_G10, "갑제10-1호증_농원근린공원 조성계획변경 주민설명회.jpg"),
    _gab_dir(_G10, "갑제10-2호증_농원근린공원 조성계획변경 주민설명회.jpg"),
    _gab_dir(_G10, "갑제10-3호증_농원근린공원 조성계획변경 주민설명회.jpg"),
    _gab_dir(_G10, "갑제10-4호증_농원근린공원 조성계획변경 주민설명회.jpg"),
    _gab_dir(_G10, "갑제10-5호증_농원근린공원 조성계획변경_주민설명회(조성계획도).jpg"),
    _gab_dir(_G10, "갑제10-6호증_농원근린공원 조성계획변경_주민설명회(인천일보).jpg"),
]
GAB10_JUNGGONG_LABELS: list[str] = [f"갑 제{n}호증" for n in GAB10_JUNGGONG_RANGE_NUMS]

# 갑4-1~4-4 (실시계획 인가고시·사무위임 조례 등)
_G4 = "갑제4호증"
GAB4_RANGE_NUMS = ("4-1", "4-2", "4-3", "4-4")
GAB4_FIRST_REL = _gab_dir(
    _G4, "갑제4-1호증_인천시_실시계획인가고시_제2020-233호(당초).pdf"
)
GAB4_LAST_REL = _gab_dir(
    _G4,
    "갑제4-4호증_[별표1] 구청장에게 위임하는 사항(제2조 관련)(인천시 사무위임 조례).pdf",
)
GAB4_RELS: list[str] = [
    GAB4_FIRST_REL,
    _gab_dir(_G4, "갑제4-2호증_인천시_실시계획인가고시_제2022-18호(변경).pdf"),
    _gab_dir(_G4, "갑제4-3호증_인천시_사무위임조례(제7665호).pdf"),
    GAB4_LAST_REL,
]
GAB4_LABELS: list[str] = [f"갑 제{n}호증" for n in GAB4_RANGE_NUMS]

# 갑1 분할 1-1~1-13 — `갑호증 전수조사`·루트 편철 파일명 `갑제1-n호증_*` 기준(빌드 시 디스크 스캔)
_GAB1_MINOR_RE = re.compile(r"갑제1-(\d+)호증", re.I)
_GAB_DETAIL_BACKTICK_FILE = re.compile(
    r"`([^`]+\.(?:pdf|jpe?g|png|gif|webp|mp4))`", re.I
)
GAB1_MAX_MINOR = 13


def _gab1_hits_to_rels_labels(hits: list[tuple[int, str]]) -> tuple[list[str], list[str]] | None:
    if not hits:
        return None
    hits.sort(key=lambda x: (x[0], x[1]))
    seen: set[int] = set()
    rels: list[str] = []
    labels: list[str] = []
    for n, rel in hits:
        if n in seen:
            continue
        seen.add(n)
        rels.append(rel)
        labels.append(f"갑 제1-{n}호증")
    return rels, labels


def collect_gab1_split_rels_from_gabfiles(
    gab_files: list[dict],
) -> tuple[list[str], list[str]] | None:
    """미리 모은 뷰어 가능 파일 목록에서 `갑제1-n호증`만 모아 1≤n≤13 순서로 정렬."""
    hits: list[tuple[int, str]] = []
    for item in gab_files or []:
        rel = str(item.get("rel") or "")
        leaf = rel.replace("\\", "/").split("/")[-1]
        m = _GAB1_MINOR_RE.search(leaf)
        if not m:
            continue
        n = int(m.group(1))
        if 1 <= n <= GAB1_MAX_MINOR:
            hits.append((n, rel))
    return _gab1_hits_to_rels_labels(hits)


def collect_gab1_split_rels_from_disk() -> tuple[list[str], list[str]] | None:
    """`최종/갑호증`·`갑호증 전수조사` 등 저장소 내 직접 rglob(목록이 비어 있어도 갑1 분할 수집)."""
    hits: list[tuple[int, str]] = []
    for root in (_GAB_ROOT, _GAB_SURVEY_ROOT):
        if not root.is_dir():
            continue
        for p in root.rglob("*"):
            if not p.is_file() or p.suffix.lower() not in _VIEWABLE_EXT:
                continue
            m = _GAB1_MINOR_RE.search(p.name)
            if not m:
                continue
            n = int(m.group(1))
            if 1 <= n <= GAB1_MAX_MINOR:
                try:
                    rel = p.relative_to(_REPO).as_posix()
                except ValueError:
                    continue
                hits.append((n, rel))
    return _gab1_hits_to_rels_labels(hits)


def collect_gab1_split_rels_from_subrows(
    subs: list[dict],
) -> tuple[list[str], list[str]] | None:
    """청구서에 파싱된 1-n 행 detail 백틱 파일명으로 rel 구성(디스크 없을 때)."""
    subs_sorted = sorted(
        subs, key=lambda r: int(str(r.get("num") or "").split("-")[1])
    )
    rels: list[str] = []
    labels: list[str] = []
    for r in subs_sorted:
        m = _GAB_DETAIL_BACKTICK_FILE.search(r.get("detail") or "")
        if not m:
            continue
        fn = m.group(1).strip()
        if "첨부(" in fn or "갑제1-" not in fn:
            continue
        if "/" not in fn.replace("\\", "/"):
            rels.append(_gab_dir("갑제1호증", fn))
        else:
            rels.append(f"{GAB_DIR_REL}/{fn}".replace("\\", "/"))
        labels.append(str(r.get("gab") or "").strip())
    if len(rels) < 1:
        return None
    return rels, labels


def merge_gab1_split_rows(
    rows: list[dict], gab_files: list[dict]
) -> list[dict]:
    """갑 제1호증(본문 목록)의 분할 1-1~1-13을 한 행(1a·__GAB_BUNDLE__:1a)으로 병합."""
    subs = [
        r
        for r in rows
        if re.fullmatch(r"1-\d+", str(r.get("num") or ""))
        and "(보충(보강))" not in str(r.get("gab") or "")
    ]
    parent_1 = next(
        (
            r
            for r in rows
            if r.get("num") == "1"
            and "갑 제1호증" in str(r.get("gab") or "")
            and "(보충(보강))" not in str(r.get("gab") or "")
        ),
        None,
    )
    rels_labels = collect_gab1_split_rels_from_gabfiles(gab_files)
    if rels_labels is None:
        rels_labels = collect_gab1_split_rels_from_disk()
    if rels_labels is None and subs:
        rels_labels = collect_gab1_split_rels_from_subrows(subs)
    if rels_labels is None and subs:
        subs_sorted = sorted(
            subs,
            key=lambda r: int(str(r.get("num") or "1-0").split("-", 1)[1]),
        )
        labels_meta = [str(r.get("gab") or "").strip() for r in subs_sorted]
        first_lab = labels_meta[0] if labels_meta else "갑 제1-1호증"
        last_lab = labels_meta[-1] if labels_meta else "갑 제1-9호증"
        gab_title = (
            f"{first_lab}~{last_lab}"
            if len(labels_meta) > 1
            else (first_lab or "갑 제1호증")
        )
        summary_base = (
            str(parent_1.get("summary") or "").strip()
            if parent_1
            else "갑 제1호증 분할(연수택지·지적공부 등)"
        )
        bullet_parts = [
            f"- **{r.get('num')}** {str(r.get('gab') or '').strip()}: "
            f"{str(r.get('summary') or '').strip()}"
            for r in subs_sorted
        ]
        detail = (
            "**갑 제1호증** 입증상 묶음(청구서 증거 목록).\n\n"
            + "\n".join(bullet_parts)
            + "\n\n빌드 시 `행정심판청구(증거)/최종/갑호증` 또는 `갑호증 전수조사` 아래 "
            "`갑제1-n호증` 파일이 있으면 이 행이 파일 구간·그리드로 다시 병합됩니다."
        )
        summary = f"{summary_base} — 청구서 분할 {len(subs_sorted)}건"
        st = ("갑 제1호증 " + gab_title + " " + summary + " " + detail).replace(
            "*", " "
        )
        merged_meta: dict = {
            "num": "1a",
            "gab": gab_title,
            "tier": "core",
            "summary": summary[:500] + ("…" if len(summary) > 500 else ""),
            "detail": detail,
            "searchText": st,
        }
        out_meta: list[dict] = []
        inserted_m = False
        for r in rows:
            n = r.get("num")
            g = str(r.get("gab") or "")
            is_parent_1 = (
                n == "1" and "갑 제1호증" in g and "(보충(보강))" not in g
            )
            is_sub_1 = bool(re.fullmatch(r"1-\d+", str(n or ""))) and (
                "(보충(보강))" not in g
            )
            if not inserted_m and (is_parent_1 or is_sub_1):
                out_meta.append(merged_meta)
                inserted_m = True
            if is_parent_1 or is_sub_1:
                continue
            out_meta.append(r)
        if not inserted_m:
            out_meta.insert(0, merged_meta)
        return out_meta
    rels, labels = rels_labels
    first_rel, last_rel = rels[0], rels[-1]
    last_lab = labels[-1] if labels else "갑 제1-13호증"
    gab_title = (
        "갑 제1-1호증~갑 제1-13호증"
        if len(rels) >= GAB1_MAX_MINOR
        else f"갑 제1-1호증~{last_lab}"
    )
    summary_base = (
        str(parent_1.get("summary") or "").strip()
        if parent_1
        else "갑 제1호증 분할(연수택지·지적공부 등)"
    )
    summary = (
        f"{summary_base} — 파일 {len(rels)}건(전수조사·갑제1-n호증)"
        if summary_base
        else f"갑 제1호증 분할 파일 {len(rels)}건"
    )
    detail = (
        "**갑 제1호증** 입증상 묶음 — 분할 **갑 제1-1호증**부터 "
        f"**{last_lab}**까지(`갑호증/갑제1호증/` `갑제1-n호증_` 파일명).\n\n"
        f"{first_rel}\n\n부터\n\n{last_rel}\n\n까지"
    )
    st = f"갑 제1호증 갑1-1 갑1-13 {gab_title} " + detail.replace("*", " ")
    merged: dict = {
        "num": "1a",
        "gab": gab_title,
        "tier": "core",
        "gabBundlePrimaryKey": "1a",
        "summary": summary[:500] + ("…" if len(summary) > 500 else ""),
        "detail": detail,
        "searchText": st,
        "gabFileRange": {
            "firstRel": first_rel,
            "lastRel": last_rel,
            "rels": rels,
            "labels": labels,
        },
    }
    out: list[dict] = []
    inserted = False
    for r in rows:
        n = r.get("num")
        g = str(r.get("gab") or "")
        is_parent_1 = (
            n == "1" and "갑 제1호증" in g and "(보충(보강))" not in g
        )
        is_sub_1 = bool(re.fullmatch(r"1-\d+", str(n or ""))) and (
            "(보충(보강))" not in g
        )
        if not inserted and (is_parent_1 or is_sub_1):
            out.append(merged)
            inserted = True
        if is_parent_1 or is_sub_1:
            continue
        out.append(r)
    if not inserted:
        out.insert(0, merged)
    return out


# 갑5-1~5-2 (건축과 동영상·회신 PDF — 실제 편철: 5-1 MP4, 5-2 회신)
_G5 = "갑제5호증"
GAB5A_RANGE_NUMS = ("5-1", "5-2")
GAB5A_FIRST_REL = _gab_dir(_G5, "갑제5-1호증_건축과_도로·통행 동영상.mp4")
GAB5A_LAST_REL = _gab_dir(
    _G5, "갑제5-2호증_건축과_도로·통행_회신(건축과-25898).pdf"
)
GAB5A_RELS: list[str] = [GAB5A_FIRST_REL, GAB5A_LAST_REL]
GAB5A_LABELS: list[str] = ["갑 제5-1호증", "갑 제5-2호증"]

# 갑5-3~5-4 (청구서에 행이 있을 때만 병합; 파일은 갑4 폴더와 동일 계열일 수 있음)
GAB5B_RANGE_NUMS = ("5-3", "5-4")
GAB5B_FIRST_REL = _gab_dir(_G4, "갑제4-3호증_인천시_사무위임조례(제7665호).pdf")
GAB5B_LAST_REL = _gab_dir(
    _G4,
    "갑제4-4호증_[별표1] 구청장에게 위임하는 사항(제2조 관련)(인천시 사무위임 조례).pdf",
)
GAB5B_RELS: list[str] = [GAB5B_FIRST_REL, GAB5B_LAST_REL]
GAB5B_LABELS: list[str] = ["갑 제5-3호증", "갑 제5-4호증"]

# 갑8-1~8-2 (위법 선행행정 동영상·PDF)
_G8 = "갑제8호증"
GAB8_RANGE_NUMS = ("8-1", "8-2")
GAB8_FIRST_REL = _gab_dir(_G8, "갑제8-1호증_위법한 선행행정 동영상.mp4")
GAB8_LAST_REL = _gab_dir(_G8, "갑제8-2호증_위법한 선행행정 출력물.pdf")
GAB8_LABELS_BASE: list[str] = ["갑 제8-1호증", "갑 제8-2호증"]

# 갑9-1~9-7 (2026. 3. 13. 준공식 분할)
_G9 = "갑제9호증"
GAB9_JUNGGONG_RANGE_NUMS = tuple(f"9-{n}" for n in range(1, 8))
GAB9_JUNGGONG_FIRST_REL = _gab_dir(
    _G9, "갑제9-1호증_농원근린공원 준공식(현수막)_260313_124719.jpg"
)
GAB9_JUNGGONG_LAST_REL = _gab_dir(
    _G9, "갑제9-7호증_농원근린공원 준공식(출구)_260313_144915.jpg"
)
GAB9_JUNGGONG_RELS: list[str] = [
    _gab_dir(_G9, "갑제9-1호증_농원근린공원 준공식(현수막)_260313_124719.jpg"),
    _gab_dir(_G9, "갑제9-2호증_농원근린공원 준공식(안내)_260313_132836.jpg"),
    _gab_dir(_G9, "갑제9-3호증_농원근린공원 준공식(입구)_260313_132906.jpg"),
    _gab_dir(_G9, "갑제9-4호증_농원근린공원 준공식(기념식수)_260313_125151.jpg"),
    _gab_dir(_G9, "갑제9-5호증_농원근린공원 준공식(기념석)_260313_125206.jpg"),
    _gab_dir(_G9, "갑제9-6호증_동원근린공원 준공식(팜플릿)_260313_132950.jpg"),
    _gab_dir(_G9, "갑제9-7호증_농원근린공원 준공식(출구)_260313_144915.jpg"),
]
GAB9_JUNGGONG_LABELS: list[str] = [f"갑 제{n}호증" for n in GAB9_JUNGGONG_RANGE_NUMS]

# 갑12-1~12-4 (제225회 연수구의회)
_G12 = "갑제12호증"
GAB12_RANGE_NUMS = ("12-1", "12-2", "12-3", "12-4")
GAB12_FIRST_REL = _gab_dir(
    _G12, "갑제12-1호증_제225회_연수구의회_자치도시위원회_회의록.pdf"
)
GAB12_LAST_REL = _gab_dir(
    _G12, "갑제12-4호증_제225회_연수구의회_청원_심사보고서.pdf"
)
GAB12_RELS: list[str] = [
    GAB12_FIRST_REL,
    _gab_dir(_G12, "갑제12-2호증_제225회_연수구의회_본회의_회의록.pdf"),
    _gab_dir(_G12, "갑제12-3호증_제225회_연수구의회_의장_의견서.jpg"),
    GAB12_LAST_REL,
]
GAB12_LABELS: list[str] = [f"갑 제{n}호증" for n in GAB12_RANGE_NUMS]

# 갑13-1~13-2 (행정기본법 질의응답 발췌)
_G13 = "갑제13호증"
GAB13_RANGE_NUMS = ("13-1", "13-2")
GAB13_FIRST_REL = _gab_dir(_G13, "갑제13-1호증_행정기본법_질의응답_사례집_Q10.pdf")
GAB13_LAST_REL = _gab_dir(_G13, "갑제13-2호증_행정기본법_질의응답_사례집_Q18.pdf")
GAB13_RELS: list[str] = [GAB13_FIRST_REL, GAB13_LAST_REL]
GAB13_LABELS: list[str] = ["갑 제13-1호증", "갑 제13-2호증"]

# 갑6-1~6-3 (공원녹지과 민원회신 등)
_G6 = "갑제6호증"
GAB6_RANGE_NUMS = ("6-1", "6-2", "6-3")
GAB6_FIRST_REL = _gab_dir(
    _G6, "갑제6-1호증_공원녹지과_민원회신(2AA-2405-1092919).pdf"
)
GAB6_LAST_REL = _gab_dir(
    _G6, "갑제6-3호증_공원녹지과_주위토지통행권 민원회신(8032).jpg"
)
GAB6_RELS: list[str] = [
    GAB6_FIRST_REL,
    _gab_dir(_G6, "갑제6-2호증_공원녹지과_진출입로점용관련_민원회신(33589).pdf"),
    GAB6_LAST_REL,
]
GAB6_LABELS: list[str] = [f"갑 제{n}호증" for n in GAB6_RANGE_NUMS]

# 갑 제7-1호증, 갑 제7-2호증 — 항공 주제 동영상·시계열 PDF
_G7 = "갑제7호증"
GAB7_PAIR_FIRST_REL = _gab_dir(
    _G7, "갑제7-1호증_항공사진(1947~2023) 동영상.mp4"
)
GAB7_PAIR_LAST_REL = _gab_dir(
    _G7, "갑제7-2호증_항공사진(1947~2023) 출력물.pdf"
)
GAB7_PAIR_RELS: list[str] = [GAB7_PAIR_FIRST_REL, GAB7_PAIR_LAST_REL]
GAB7_PAIR_LABELS: list[str] = ["갑 제7-1호증", "갑 제7-2호증"]

_GAB_ROOT = _REPO / GAB_DIR_REL
_GAB_SURVEY_ROOT = _REPO / GAB_SURVEY_DIR_REL


def _gab_rel_if_exists(folder: str, filename: str) -> str | None:
    p = _GAB_ROOT / folder / filename
    if p.is_file():
        return _gab_dir(folder, filename)
    return None


def build_gab8_rels_labels() -> tuple[list[str], list[str]]:
    """갑8-1 MP4·갑8-2 PDF(파일명이 다르면 `갑제8호증` 폴더에서 glob)."""
    d8 = _GAB_ROOT / _G8
    first = _gab_rel_if_exists(_G8, Path(GAB8_FIRST_REL).name)
    if not first and d8.is_dir():
        cands = sorted(d8.glob("갑제8-1호증_*.mp4"))
        if cands:
            first = _gab_dir(_G8, cands[0].name)
    first = first or GAB8_FIRST_REL
    last = _gab_rel_if_exists(_G8, Path(GAB8_LAST_REL).name) or GAB8_LAST_REL
    return [first, last], list(GAB8_LABELS_BASE)


def merge_gab7_pair_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑7-1·갑7-2 행을 포털 묶음 한 행으로 병합(실제 파일은 `갑제7-1호증_`·`갑제7-2호증_`)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if (
            r.get("num") == "7-1"
            and i + 1 < len(rows)
            and rows[i + 1].get("num") == "7-2"
        ):
            leaf7a = Path(GAB7_PAIR_FIRST_REL).name
            leaf7b = Path(GAB7_PAIR_LAST_REL).name
            detail = (
                f"**갑 제7-1호증** — `{leaf7a}`\n"
                f"**갑 제7-2호증** — `{leaf7b}`"
            )
            st = (
                "갑 제7-1호증 갑 제7-2호증 항공 동영상 시계열 PDF "
                + detail.replace("*", " ").replace("`", " ")
            )
            out.append(
                {
                    "num": "7",
                    "gab": "갑 제7-1호증~갑 제7-2호증",
                    "tier": "core",
                    "summary": "항공 주제 동영상·시계열 PDF(갑 제7-1호증, 갑 제7-2호증)",
                    "detail": detail,
                    "searchText": st,
                    "gabBundlePrimaryKey": "7",
                    "gabFileRange": {
                        "firstRel": GAB7_PAIR_FIRST_REL,
                        "lastRel": GAB7_PAIR_LAST_REL,
                        "rels": list(GAB7_PAIR_RELS),
                        "labels": list(GAB7_PAIR_LABELS),
                    },
                }
            )
            i += 2
            continue
        out.append(r)
        i += 1
    return out


def inject_gab7_pair_bundle_row(rows: list[dict]) -> list[dict]:
    """증거 목록에 7-1·7-2가 따로 남아 있지 않은 예외 시 묶음 필드만 보강(일반적으로 merge가 처리)."""
    out: list[dict] = []
    for r in rows:
        if (
            r.get("num") == "7"
            and "갑 제7-1호증~갑 제7-2호증" in r.get("gab", "")
            and not (r.get("gabFileRange") or {}).get("rels")
        ):
            r2 = dict(r)
            r2["gabBundlePrimaryKey"] = "7"
            r2["summary"] = r2.get("summary") or (
                "항공 주제 동영상·시계열 PDF(갑 제7-1호증, 갑 제7-2호증)"
            )
            r2["gabFileRange"] = {
                "firstRel": GAB7_PAIR_FIRST_REL,
                "lastRel": GAB7_PAIR_LAST_REL,
                "rels": list(GAB7_PAIR_RELS),
                "labels": list(GAB7_PAIR_LABELS),
            }
            out.append(r2)
        else:
            out.append(r)
    return out


def merge_gab10_junggong_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑10-1~10-6 행을 하나로 병합(조성계획 변경 주민설명회·__REF_GAB_BUNDLE__:10a)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if r.get("num") == "10-1":
            seq: list[dict] = []
            j = i
            while j < len(rows) and rows[j].get("num") in GAB10_JUNGGONG_RANGE_NUMS:
                seq.append(rows[j])
                j += 1
            if len(seq) == len(GAB10_JUNGGONG_RANGE_NUMS):
                detail = (
                    "조성계획 변경 **주민설명회** 관련 사진 — **갑 제10-1호증**부터 "
                    "**갑 제10-6호증**까지.\n\n"
                    f"`{GAB_DIR_REL}/{_G10}/` 에 `갑제10-1호증_`~`갑제10-6호증_` 파일명으로 편철.\n\n"
                    "**시작 파일**부터 **끝 파일**까지:\n\n"
                    f"{GAB10_JUNGGONG_FIRST_REL}\n\n"
                    "부터\n\n"
                    f"{GAB10_JUNGGONG_LAST_REL}\n\n"
                    "까지"
                )
                st = (
                    "갑 제10-1호증 갑 제10-2호증 갑 제10-3호증 갑 제10-4호증 "
                    "갑 제10-5호증 갑 제10-6호증 주민설명회 조성계획변경 "
                    + detail.replace("*", " ")
                )
                out.append(
                    {
                        "num": "10a",
                        "gab": "갑 제10-1호증~갑 제10-6호증",
                        "tier": "core",
                        "gabBundlePrimaryKey": "10a",
                        "summary": (
                            "조성계획 변경 주민설명회(갑 제10-1호증~갑 제10-6호증)"
                        ),
                        "detail": detail,
                        "searchText": (
                            "갑 제10호증 갑10-1 갑10-2 갑10-3 갑10-4 갑10-5 갑10-6 "
                            + st
                        ),
                        "gabFileRange": {
                            "firstRel": GAB10_JUNGGONG_FIRST_REL,
                            "lastRel": GAB10_JUNGGONG_LAST_REL,
                            "rels": GAB10_JUNGGONG_RELS,
                            "labels": GAB10_JUNGGONG_LABELS,
                        },
                    }
                )
                i = j
                continue
        out.append(r)
        i += 1
    return out


def merge_gab12_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑12-1~12-4 행을 하나로 병합(포털 드롭다운 묶음·__REF_GAB_BUNDLE__:12)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if r.get("num") == "12-1":
            seq: list[dict] = []
            j = i
            while j < len(rows) and rows[j].get("num") in GAB12_RANGE_NUMS:
                seq.append(rows[j])
                j += 1
            if len(seq) == len(GAB12_RANGE_NUMS):
                detail = (
                    "제225회 연수구의회 청원·회의록 등 — **갑 제12-1호증**부터 "
                    f"**갑 제12-4호증**까지 `{GAB_DIR_REL}/{_G12}/` 분할 편철.\n\n"
                    f"{GAB12_FIRST_REL}\n\n"
                    "부터\n\n"
                    f"{GAB12_LAST_REL}\n\n"
                    "까지"
                )
                st = (
                    "갑 제12-1호증 갑 제12-2호증 갑 제12-3호증 갑 제12-4호증 "
                    "225회 연수구의회 청원 심사보고서 의장 자치도시 "
                    + detail.replace("*", " ")
                )
                out.append(
                    {
                        "num": "12",
                        "gab": "갑 제12호증(제225회 연수구의회)",
                        "tier": "supplement",
                        "gabBundlePrimaryKey": "12",
                        "summary": (
                            "제225회 연수구의회(갑 제12-1호증~갑 제12-4호증)"
                        ),
                        "detail": detail,
                        "searchText": "갑 제12호증 갑12-1 갑12-2 갑12-3 갑12-4 " + st,
                        "gabFileRange": {
                            "firstRel": GAB12_FIRST_REL,
                            "lastRel": GAB12_LAST_REL,
                            "rels": GAB12_RELS,
                            "labels": GAB12_LABELS,
                        },
                    }
                )
                i = j
                continue
        out.append(r)
        i += 1
    return out


def merge_gab13_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑13-1~13-2 행을 하나로 병합(포털 드롭다운 묶음·__REF_GAB_BUNDLE__:13)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if r.get("num") == "13-1":
            seq: list[dict] = []
            j = i
            while j < len(rows) and rows[j].get("num") in GAB13_RANGE_NUMS:
                seq.append(rows[j])
                j += 1
            if len(seq) == len(GAB13_RANGE_NUMS):
                detail = (
                    "법제처 「행정기본법」 질의응답 사례집 발췌 — **갑 제13-1호증**부터 "
                    f"**갑 제13-2호증**까지 `{GAB_DIR_REL}/{_G13}/` 분할 편철.\n\n"
                    f"{GAB13_FIRST_REL}\n\n"
                    "부터\n\n"
                    f"{GAB13_LAST_REL}\n\n"
                    "까지"
                )
                st = (
                    "갑 제13-1호증 갑 제13-2호증 행정기본법 Q10 Q18 "
                    + detail.replace("*", " ")
                )
                out.append(
                    {
                        "num": "13",
                        "gab": "갑 제13호증(행정기본법 질의응답 발췌)",
                        "tier": "supplement",
                        "gabBundlePrimaryKey": "13",
                        "summary": (
                            "행정기본법 질의응답 발췌(갑 제13-1호증~갑 제13-2호증)"
                        ),
                        "detail": detail,
                        "searchText": "갑 제13호증 갑13-1 갑13-2 " + st,
                        "gabFileRange": {
                            "firstRel": GAB13_FIRST_REL,
                            "lastRel": GAB13_LAST_REL,
                            "rels": GAB13_RELS,
                            "labels": GAB13_LABELS,
                        },
                    }
                )
                i = j
                continue
        out.append(r)
        i += 1
    return out


def merge_gab4_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑4-1~4-4 행을 하나로 병합(포털 드롭다운 묶음·__REF_GAB_BUNDLE__:4)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if r.get("num") == "4-1":
            seq: list[dict] = []
            j = i
            while j < len(rows) and rows[j].get("num") in GAB4_RANGE_NUMS:
                seq.append(rows[j])
                j += 1
            if len(seq) == len(GAB4_RANGE_NUMS):
                detail = (
                    "농원근린공원 **실시계획 인가 고시**(당초·변경) 및 **사무위임 조례·별표** — "
                    "**갑 제4-1호증**부터 **갑 제4-4호증**까지 "
                    f"`{GAB_DIR_REL}/{_G4}/` 편철.\n\n"
                    f"{GAB4_FIRST_REL}\n\n"
                    "부터\n\n"
                    f"{GAB4_LAST_REL}\n\n"
                    "까지"
                )
                st = (
                    "갑 제4-1호증 갑 제4-2호증 갑 제4-3호증 갑 제4-4호증 "
                    "실시계획 인가고시 사무위임 조례 별표 "
                    + detail.replace("*", " ")
                )
                out.append(
                    {
                        "num": "4",
                        "gab": "갑 제4호증",
                        "tier": "core",
                        "gabBundlePrimaryKey": "4",
                        "summary": (
                            "실시계획 인가고시·위임 사무(갑 제4-1호증~갑 제4-4호증)"
                        ),
                        "detail": detail,
                        "searchText": "갑 제4호증 갑4-1 갑4-2 갑4-3 갑4-4 " + st,
                        "gabFileRange": {
                            "firstRel": GAB4_FIRST_REL,
                            "lastRel": GAB4_LAST_REL,
                            "rels": GAB4_RELS,
                            "labels": GAB4_LABELS,
                        },
                    }
                )
                i = j
                continue
        out.append(r)
        i += 1
    return out


def merge_gab5a_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑5-1~5-2 행 병합(묶음 __REF_GAB_BUNDLE__:5a, 인가고시)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if r.get("num") == "5-1":
            seq: list[dict] = []
            j = i
            while j < len(rows) and rows[j].get("num") in GAB5A_RANGE_NUMS:
                seq.append(rows[j])
                j += 1
            if len(seq) == len(GAB5A_RANGE_NUMS):
                detail = (
                    "연수구 **건축과** 도로·통행 — **갑 제5-1호증**(동영상)·**갑 제5-2호증**(회신) "
                    "같은 편철 루트.\n\n"
                    f"{GAB5A_FIRST_REL}\n\n"
                    "부터\n\n"
                    f"{GAB5A_LAST_REL}\n\n"
                    "까지"
                )
                st = (
                    "갑 제5-1호증 갑 제5-2호증 건축과 도로 통행 동영상 회신 "
                    + detail.replace("*", " ")
                )
                out.append(
                    {
                        "num": "5",
                        "gab": "갑 제5호증(건축과 도로·통행)",
                        "tier": "core",
                        "gabBundlePrimaryKey": "5a",
                        "summary": "건축과 도로·통행(갑 제5-1호증 동영상~갑 제5-2호증 회신)",
                        "detail": detail,
                        "searchText": "갑 제5호증 갑5-1 갑5-2 5a " + st,
                        "gabFileRange": {
                            "firstRel": GAB5A_FIRST_REL,
                            "lastRel": GAB5A_LAST_REL,
                            "rels": GAB5A_RELS,
                            "labels": GAB5A_LABELS,
                        },
                    }
                )
                i = j
                continue
        out.append(r)
        i += 1
    return out


def merge_gab5b_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑5-3~5-4 행 병합(묶음 __REF_GAB_BUNDLE__:5b, 사무위임 조례 — 별도 통합 호증명)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if r.get("num") == "5-3":
            seq: list[dict] = []
            j = i
            while j < len(rows) and rows[j].get("num") in GAB5B_RANGE_NUMS:
                seq.append(rows[j])
                j += 1
            if len(seq) == len(GAB5B_RANGE_NUMS):
                detail = (
                    "「인천광역시 사무위임 조례」 등 — **갑 제5-3호증**·**갑 제5-4호증** "
                    "같은 편철 루트.\n\n"
                    f"{GAB5B_FIRST_REL}\n\n"
                    "부터\n\n"
                    f"{GAB5B_LAST_REL}\n\n"
                    "까지"
                )
                st = "갑 제5-3호증 갑 제5-4호증 사무위임 조례 " + detail.replace(
                    "*", " "
                )
                out.append(
                    {
                        "num": "5b",
                        "gab": "갑 제5호증(사무위임 조례)",
                        "tier": "core",
                        "gabBundlePrimaryKey": "5b",
                        "summary": "사무위임 조례(갑 제5-3호증~갑 제5-4호증)",
                        "detail": detail,
                        "searchText": "갑 제5호증 갑5-3 갑5-4 5b " + st,
                        "gabFileRange": {
                            "firstRel": GAB5B_FIRST_REL,
                            "lastRel": GAB5B_LAST_REL,
                            "rels": GAB5B_RELS,
                            "labels": GAB5B_LABELS,
                        },
                    }
                )
                i = j
                continue
        out.append(r)
        i += 1
    return out


def merge_gab6_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑6-1~6-3 행을 하나로 병합(포털 드롭다운 묶음·__REF_GAB_BUNDLE__:6)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if r.get("num") == "6-1":
            seq: list[dict] = []
            j = i
            while j < len(rows) and rows[j].get("num") in GAB6_RANGE_NUMS:
                seq.append(rows[j])
                j += 1
            if len(seq) == len(GAB6_RANGE_NUMS):
                detail = (
                    "연수구 **공원녹지과** 민원회신 등 — **갑 제6-1호증**부터 "
                    f"**갑 제6-3호증**까지 `{GAB_DIR_REL}/{_G6}/` 편철.\n\n"
                    f"{GAB6_FIRST_REL}\n\n"
                    "부터\n\n"
                    f"{GAB6_LAST_REL}\n\n"
                    "까지"
                )
                st = (
                    "갑 제6-1호증 갑 제6-2호증 갑 제6-3호증 공원녹지 민원회신 "
                    + detail.replace("*", " ")
                )
                out.append(
                    {
                        "num": "6",
                        "gab": "갑 제6호증",
                        "tier": "core",
                        "gabBundlePrimaryKey": "6",
                        "summary": "공원녹지과 민원회신(갑 제6-1호증~갑 제6-3호증)",
                        "detail": detail,
                        "searchText": "갑 제6호증 갑6-1 갑6-2 갑6-3 " + st,
                        "gabFileRange": {
                            "firstRel": GAB6_FIRST_REL,
                            "lastRel": GAB6_LAST_REL,
                            "rels": GAB6_RELS,
                            "labels": GAB6_LABELS,
                        },
                    }
                )
                i = j
                continue
        out.append(r)
        i += 1
    return out


def merge_gab8_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑8-1~8-2 행을 하나로 병합(포털 드롭다운 묶음·__REF_GAB_BUNDLE__:8)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if r.get("num") == "8-1":
            seq: list[dict] = []
            j = i
            while j < len(rows) and rows[j].get("num") in GAB8_RANGE_NUMS:
                seq.append(rows[j])
                j += 1
            if len(seq) == len(GAB8_RANGE_NUMS):
                rels8, labels8 = build_gab8_rels_labels()
                fr8, lr8 = rels8[0], rels8[-1]
                detail = (
                    "**위법한 선행행정** 주제 동영상·PDF — **갑 제8-1호증**부터 "
                    "**갑 제8-2호증**까지 "
                    f"`{GAB_DIR_REL}/{_G8}/` 편철.\n\n"
                    f"{fr8}\n\n"
                    "부터\n\n"
                    f"{lr8}\n\n"
                    "까지"
                )
                st = "갑 제8-1호증 갑 제8-2호증 위법 선행행정 동영상 PDF " + detail.replace(
                    "*", " "
                )
                out.append(
                    {
                        "num": "8",
                        "gab": "갑 제8호증",
                        "tier": "core",
                        "gabBundlePrimaryKey": "8",
                        "summary": "위법 선행행정 동영상·PDF(갑 제8-1호증~갑 제8-2호증)",
                        "detail": detail,
                        "searchText": "갑 제8호증 갑8-1 갑8-2 " + st,
                        "gabFileRange": {
                            "firstRel": fr8,
                            "lastRel": lr8,
                            "rels": rels8,
                            "labels": labels8,
                        },
                    }
                )
                i = j
                continue
        out.append(r)
        i += 1
    return out


def merge_gab9_range_rows(rows: list[dict]) -> list[dict]:
    """연속된 갑9-1~9-7 행을 하나로 병합(준공식 사진·__REF_GAB_BUNDLE__:9)."""
    out: list[dict] = []
    i = 0
    while i < len(rows):
        r = rows[i]
        if r.get("num") == "9-1":
            seq: list[dict] = []
            j = i
            while j < len(rows) and rows[j].get("num") in GAB9_JUNGGONG_RANGE_NUMS:
                seq.append(rows[j])
                j += 1
            if len(seq) == len(GAB9_JUNGGONG_RANGE_NUMS):
                detail = (
                    "2026. 3. 13. **준공식** 현장 사진 — **갑 제9-1호증**부터 "
                    f"**갑 제9-7호증**까지 `{GAB_DIR_REL}/{_G9}/` 편철.\n\n"
                    f"{GAB9_JUNGGONG_FIRST_REL}\n\n"
                    "부터\n\n"
                    f"{GAB9_JUNGGONG_LAST_REL}\n\n"
                    "까지"
                )
                st = (
                    "갑 제9-1호증 갑 제9-2호증 갑 제9-3호증 갑 제9-4호증 "
                    "갑 제9-5호증 갑 제9-6호증 갑 제9-7호증 준공식 "
                    + detail.replace("*", " ")
                )
                out.append(
                    {
                        "num": "9",
                        "gab": "갑 제9호증",
                        "tier": "core",
                        "gabBundlePrimaryKey": "9",
                        "summary": "준공식 현장 사진(갑 제9-1호증~갑 제9-7호증)",
                        "detail": detail,
                        "searchText": (
                            "갑 제9호증 갑9-1 갑9-2 갑9-3 갑9-4 갑9-5 갑9-6 갑9-7 "
                            + st
                        ),
                        "gabFileRange": {
                            "firstRel": GAB9_JUNGGONG_FIRST_REL,
                            "lastRel": GAB9_JUNGGONG_LAST_REL,
                            "rels": GAB9_JUNGGONG_RELS,
                            "labels": GAB9_JUNGGONG_LABELS,
                        },
                    }
                )
                i = j
                continue
        out.append(r)
        i += 1
    return out


def merge_all_gab_range_rows(
    rows: list[dict], gab_files: list[dict]
) -> list[dict]:
    """「부터~까지」분할 통합 병합. 순서: 갑1→7→10→12→13→4→5a→5b→6→8→9."""
    rows = merge_gab1_split_rows(rows, gab_files)
    rows = merge_gab7_pair_range_rows(rows)
    return inject_gab7_pair_bundle_row(
        merge_gab9_range_rows(
            merge_gab8_range_rows(
                merge_gab6_range_rows(
                    merge_gab5b_range_rows(
                        merge_gab5a_range_rows(
                            merge_gab4_range_rows(
                                merge_gab13_range_rows(
                                    merge_gab12_range_rows(
                                        merge_gab10_junggong_range_rows(rows)
                                    )
                                )
                            )
                        )
                    )
                )
            )
        )
    )


def _major_from_label(label: str) -> int:
    m = re.search(r"갑 제(\d+)", label)
    return int(m.group(1)) if m else 0


def _tier(label: str) -> str:
    # 갑 제1호증(보충)·갑 제5호증(보충) 등 번호만으로는 major<10 이어도 보충인 경우
    if "(보충(보강))" in label:
        return "supplement"
    return "supplement" if _major_from_label(label) >= 10 else "core"


def _is_evidence_list_header_line(line: str) -> bool:
    s = line.strip()
    return "**[증거자료 목록]**" in line or s == "[증거자료 목록]" or s.startswith(
        "[증거자료 목록]"
    )


def extract_evidence_section_markdown(text: str) -> str:
    """청구서 MD에서 **[증거자료 목록]** 블록만 추출(증거 탭 원문)."""
    lines = text.splitlines()
    out: list[str] = []
    in_block = False
    for line in lines:
        if _is_evidence_list_header_line(line):
            in_block = True
        if not in_block:
            continue
        if line.strip().startswith("**붙임**"):
            break
        if line.strip() == "---" and len(out) > 1:
            break
        out.append(line)
    body = "\n".join(out).strip()
    if not body:
        body = (
            "## [증거자료 목록]\n\n"
            "_청구서 정본에서 증거자료 목록 블록을 찾지 못했습니다._"
        )
    return body


def parse_evidence_block(text: str) -> list[dict]:
    lines = text.splitlines()
    in_block = False
    rows: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if _is_evidence_list_header_line(line):
            in_block = True
            i += 1
            continue
        if not in_block:
            i += 1
            continue
        if line.strip().startswith("**붙임**") or line.strip() == "---":
            break
        if line.strip().startswith("**편철") and "증거자료 목록" not in line:
            i += 1
            continue
        if not line.strip() or line.strip().startswith("아래 경로"):
            i += 1
            continue
        m = _GAB_HEADER.match(_strip_gab_header_bold(line))
        if not m:
            i += 1
            continue
        num, gab, rest = m.group(1), m.group(2), m.group(3)
        parts: list[str] = []
        if rest.strip():
            parts.append(rest.strip())
        i += 1
        while i < len(lines):
            ln = lines[i]
            s = ln.strip()
            if _GAB_HEADER.match(_strip_gab_header_bold(ln)):
                break
            if s.startswith("**국가법령정보센터 인용 판례"):
                break
            if s.startswith("**붙임**") or s == "---":
                break
            i += 1
            if not s:
                continue
            parts.append(s)
        full_rest = " ".join(parts)
        summary = full_rest
        if " — " in full_rest:
            summary = full_rest.split(" — ", 1)[0].strip()
        elif " - " in full_rest:
            summary = full_rest.split(" - ", 1)[0].strip()
        search = f"{gab} {full_rest}".replace("`", " ")
        rows.append(
            {
                "num": num,
                "gab": gab.strip(),
                "tier": _tier(gab),
                "summary": summary[:500] + ("…" if len(summary) > 500 else ""),
                "detail": full_rest.strip(),
                "searchText": search,
            }
        )
    return rows


def _prefix_from_submission_md(md_path: Path) -> str:
    return md_path.name.split("_")[0]


def _iso_date_from_submission_prefix(prefix: str) -> str:
    """파일명 접두 `yymmdd`(예: 260331) → `YYYY-MM-DD`."""
    if len(prefix) >= 6 and prefix[:6].isdigit():
        p = prefix[:6]
        return f"20{p[0:2]}-{p[2:4]}-{p[4:6]}"
    return "2026-03-31"


_GAB_FILE_SORT = re.compile(r"갑제(\d+)(?:-(\d+))?(?:호증|증)")


def _gab_sort_key_from_rel(rel: str) -> tuple[int, int, str]:
    """드롭다운·목록용: 갑제1 < 갑제2-1 < 갑제10 (문자열 정렬이 아닌 호증 번호 순)."""
    m = _GAB_FILE_SORT.search(rel)
    if not m:
        return (9999, 9999, rel)
    major = int(m.group(1))
    minor = int(m.group(2)) if m.group(2) else 0
    return (major, minor, rel)


def list_law_info_verification_pdfs() -> list[dict]:
    """국가법령정보 대조·검증용 PDF — `행정심판청구(증거)/최종/법령정보/` (갑호증 제출 대상 아님)."""
    root = _REPO / LAW_INFO_DIR_REL
    if not root.is_dir():
        return []
    out: list[dict] = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix.lower() != ".pdf":
            continue
        if p.name.startswith("."):
            continue
        try:
            rel_full = p.relative_to(_REPO)
        except ValueError:
            continue
        label = str(p.relative_to(root)).replace("\\", "/")
        out.append({"label": label, "rel": rel_full.as_posix()})
    out.sort(key=lambda x: (x["rel"], x["label"]))
    return out


def merge_gab_viewable_lists(*lists: list[dict]) -> list[dict]:
    """여러 폴더 스캔 결과를 rel 기준 중복 제거 후 갑 번호 순 정렬."""
    seen: set[str] = set()
    out: list[dict] = []
    for lst in lists:
        for it in lst:
            r = str(it.get("rel") or "")
            if not r or r in seen:
                continue
            seen.add(r)
            out.append(it)
    out.sort(key=lambda x: _gab_sort_key_from_rel(x["rel"]))
    return out


def list_viewable_under_repo_rel(dir_rel: str, *, sort_gab: bool = False) -> list[dict]:
    """저장소 기준 상대 폴더 아래의 PDF·이미지 파일 목록(하위 폴더 포함)."""
    root = _REPO / dir_rel
    if not root.is_dir():
        return []
    out: list[dict] = []
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        if p.name.startswith("."):
            continue
        if p.suffix.lower() not in _VIEWABLE_EXT:
            continue
        try:
            rel_full = p.relative_to(_REPO)
        except ValueError:
            continue
        label = str(p.relative_to(root)).replace("\\", "/")
        out.append({"label": label, "rel": rel_full.as_posix()})
    if sort_gab:
        out.sort(key=lambda x: _gab_sort_key_from_rel(x["rel"]))
    return out


def build_meta(md_path: Path) -> dict:
    prefix = _prefix_from_submission_md(md_path)
    # 포털 `/serve/` 경로 = 저장소 상대 경로. 제출 정본은 `행정심판청구(최종)/`(start.js가 `행정심판최종본/` 폴더만 있는 클론은 거울 경로로 대체).
    final_root = "행정심판청구(최종)"
    folder_dated = f"{final_root}/{prefix}"
    tab_sources = {
        "overview": f"{folder_dated}/{prefix}_00_개요_README_younsu_허브.md",
        "appeal": f"{final_root}/{prefix}_01_행정심판청구서_최종.md",
        "gab": f"{folder_dated}/{prefix}_별지_갑호증_목록_드롭다운.md",
        "appendix": f"{final_root}/{prefix}_별지_사실관계_시간축_정리표.md",
        "injunction": f"{final_root}/{prefix}_02_집행정지신청서_최종.md",
    }
    return {
        "siteTitle": "농원근린공원 행정심판청구",
        "siteSubtitle": "집행정지신청 병합 · 인천광역시 행정심판위원회 심리 참고",
        "updated": _iso_date_from_submission_prefix(prefix),
        "disclaimer": (
            "본 화면은 인천광역시 행정심판위원회 심리 참고용입니다.\n"
            "증거의 효력과 원본은 전자제출본과 제출 매체를 따르며, 미주·각주는 본문 아래에 따로 표시합니다."
        ),
        "footerLine": "",  # main()에서 채움
        "tabSources": tab_sources,
        "appeal": {
            "heading": "행정심판 청구",
            "case": "농원근린공원 사실상 준공처분 취소 및 인가 조건(통행 확보) 이행 청구",
            "party": "청구인 김찬식(연수구 동춘동 198번지 일원 대표) / 피청구인 인천광역시 연수구청장",
            "points": [
                "핵심 갑호증(갑 제1호증 분할 1-1~1-13, 갑 제2호증~갑 제7-2호증, 갑 제8-1·8-2호증, 갑 제9-1·9-7호증 등): 본문 쟁점별 직접 인용.",
                "보충 갑호증(갑 제10호증 이하): 전자매체(USB) 편철·증거총목과 함께 제출.",
                "인용 대법원 등 판례: 국가법령정보센터 사건번호·원문(갑호증 제외). 검증본은 `행정심판청구(증거)/최종/법령정보/`.",
                "증거 실물·파일명은 청구서 「증거 편철·파일명·전수조사 유의」 및 tools/audit_gab_evidence_folder.py·survey_gab_evidence_full.py 로 본 화면·제출본을 맞출 것.",
            ],
        },
        "injunction": {
            "heading": "집행정지 신청",
            "case": "농원근린공원 준공 절차 및 후속 행정행위 집행정지",
            "party": "신청인 김찬식 외 주민 일동 / 피신청인 인천광역시 연수구청장",
            "points": [
                "본안 행정심판과 동시 제출·갑호증 편철은 본 청구서 증거 목록과 동일(집행정지신청서 붙임 참조).",
                "긴급성·회복하기 어려운 손해 등은 집행정지신청서 본문(대법원 91누13441 등)에 정리.",
            ],
        },
        "searchHints": [
            "호증 번호(예: 6-1, 10)",
            "키워드(항공, 지적, 실시계획, 건축과, 공원녹지, 준공식, 주민설명회, 의회, 택지)",
        ],
    }


def main() -> None:
    if not _MD.is_file():
        raise FileNotFoundError(f"청구서 MD 없음: {_MD}")
    md_path = _MD
    raw = md_path.read_text(encoding="utf-8")
    gab_files = merge_gab_viewable_lists(
        list_viewable_under_repo_rel(GAB_DIR_REL, sort_gab=True),
        list_viewable_under_repo_rel(GAB_SURVEY_DIR_REL, sort_gab=True),
    )
    evidence = merge_all_gab_range_rows(parse_evidence_block(raw), gab_files)
    meta = build_meta(md_path)
    meta["evidenceTabMarkdown"] = extract_evidence_section_markdown(raw)
    meta["precedentFiles"] = list_law_info_verification_pdfs()
    meta["gabFiles"] = gab_files
    meta["attachFiles"] = list_viewable_under_repo_rel(ATTACH_DIR_REL)
    meta["footerLine"] = (
        f"자료 기준일: {meta['updated']}. "
        f"증거 목록은 청구서 정본과 같으며, 갑8·갑9 묶음에는 디스크에 있는 갑8-1·갑9-1 주제 MP4가 자동 병치됩니다."
    )
    out = {"meta": meta, "evidence": evidence}
    _OUT.parent.mkdir(parents=True, exist_ok=True)
    _OUT.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(evidence)} items -> {_OUT.relative_to(_REPO)}")


if __name__ == "__main__":
    main()
