# -*- coding: utf-8 -*-
"""행정심판청구(최종)/ 정본 Markdown(260404_01·02)에서 제출용 원문만 추출해 .txt로 저장한다.

제외하는 것:
- `[작업]·[검토]·[검수]·[주의]·[편집] ` 로 시작하는 줄
- `> ` 인용(작성자 메모·작업 이력)
- `## [참고]` 이하 전체
- 본문 안 마크다운 `*단일 별표 … 별표*` 구간(편집용 부연)
- HTML 주석 `<!-- ... -->`
- 편철·스크립트·내부 경로 등 제출용에 불필요한 문장·줄(아래 `_cleanup_submission_line` 참고)

`docs/scripts/260404_build_final_docx.py`(정본 MD)의 NOTE 규칙과 맞춤.
출력 txt는 **`docs/{yymmdd}/`** — `yymmdd`는 01번 MD 파일명 6자리 접두 또는 `--yymmdd`.

실행(프로젝트 루트):
  python docs/scripts/export_submission_txt.py
  python docs/scripts/export_submission_txt.py --01

Windows 터미널에서 로그 한글이 여전히 깨지면(보조): python -X utf8 docs/scripts/export_submission_txt.py
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def _configure_stdio_utf8() -> None:
    """Windows 콘솔에서 한글 로그가 깨지지 않도록 stdout/stderr를 UTF-8로 맞춤."""
    if sys.platform != "win32":
        return
    for stream in (sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (OSError, ValueError, AttributeError):
                pass

_REPO = Path(__file__).resolve().parents[2]
_FINAL = _REPO / "행정심판청구(최종)"

_YYMMDD_FROM_STEM = re.compile(r"^(\d{6})_")


def _docs_out_dir(md01: Path, yymmdd_override: str | None) -> Path:
    if yymmdd_override:
        return _REPO / "docs" / yymmdd_override.strip()
    m = _YYMMDD_FROM_STEM.match(md01.name)
    if m:
        return _REPO / "docs" / m.group(1)
    return _REPO / "docs" / "260404"


NOTE_LINE_PREFIXES: tuple[str, ...] = (
    "[편집] ",
    "[검수] ",
    "[검토] ",
    "[주의] ",
    "[작업] ",
)
REF_HEAD = "## [참고]"
_MD_01 = _FINAL / "260404_01_행정심판청구서_최종.md"
_MD_02 = _FINAL / "260404_02_집행정지신청서_최종.md"


def _submission_txt_path(docs_out: Path, md_path: Path) -> Path:
    return docs_out / f"{md_path.stem.replace('_최종', '_제출용')}.txt"


_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
# `**굵게**` 안에 `:`·`*`가 있어도 깨지지 않게: 먼저 `**…**` 를 치환 후 단일 `*…*` 제거
_BOLD_BLOCK = re.compile(r"\*\*.+?\*\*")
_INLINE_STAR = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")

# 제출본에 섞인 초안·편집 메모(본문·갑호증 목록) — 법적 본문("검토·고려" 등)은 건드리지 않음
_SKIP_LINE_PREFIXES: tuple[str, ...] = (
    "편철·전자제출(핵심·보충 구분):",
)


def _cleanup_submission_line(line: str) -> str | None:
    """한 줄에서 제출용에 부적절한 편집 흔적을 제거. 전부 건너뛸 줄이면 None."""
    t = line.strip()
    for pfx in _SKIP_LINE_PREFIXES:
        if t.startswith(pfx):
            return None

    s = line

    # 집행정지: 대리인용 판례 폴더·테마 안내 문장
    s = re.sub(
        r", 본 신청서 한 줄만으로 단정하지 말고 .+?검토합니다\.\s*",
        " ",
        s,
    )
    s = re.sub(r"\s*\[테마 \d+\]\s*", " ", s)

    # 다목: 굵게 제거 후 남는 '보강:' 블록(~ 다음 ' 참고 ' 직전)
    s = re.sub(r" 보강: .+? 참고 ", " 참고 ", s)

    s = re.sub(
        r"\s*구체적 사실주장·표현은 변론·보충서면에서 정리합니다\.\s*",
        " ",
        s,
    )

    s = re.sub(
        r"행정심판청구(증거)/최종/260328_증명취지_일반교통방해\.txt\(증명취지·입증 방향 정리\) 및 선거법위반/ 루트의 별도 자료\(제보·조사의뢰 서면, 준공식 전후 원본 사진 폴더 등\)로 별도 제출·보강할 수 있습니다",
        "필요 시 별도 서면 및 자료로 제출·보강할 수 있습니다",
        s,
    )

    s = re.sub(
        r"1건\(기존 분할 구간을 순차 편집·통합\)으로 편철되어 있으며, 필요 시 .+?바꿔 두어도 무방합니다\. 갑 제5-3호증은 두지 아니합니다\.\s*",
        "1건으로 편철되어 있습니다. ",
        s,
    )

    s = re.sub(
        r"\(기존 소송·민원에서[^)]*번호를 정리합니다\)",
        "",
        s,
    )

    s = re.sub(
        r"\. copy_junggong_photos_to_gab9\.py.+?복사하지 않음\)\.?",
        ".",
        s,
    )
    s = re.sub(r"\. 원본은 선거법위반/.+?\.py\)\.?", ".", s)
    s = re.sub(r" python tools/[^\s\)]+\)?\.?", "", s)

    if "붙임 별첨 제1호" in s and "편철 폴더" in s:
        s = s.split("편철 폴더", 1)[0].rstrip(" ·.") + "."

    s = re.sub(
        r"아래 경로는 모두 행정심판청구(증거)/최종/갑호증\(증거\)/ \(이하 갑호증\(증거\)\) 기준입니다\. 실제 저장 파일명·분할 번호\(예: 갑제6-1호증\) 에 맞추어 본 청구서를 정리하였습니다\. 동영상은 .+?mp4 를 기준으로 하며, 별도 .+?mp4 가 있으면 그 경로를 따를 수 있습니다\.",
        "아래는 갑호증 번호와 제출 자료(파일·폴더)의 대응 요지이며, 동영상은 갑 제6-2호증에 편철된 통합 파일을 기준으로 합니다.",
        s,
    )
    s = re.sub(r"갑호증\(증거\) 루트에 ", "", s)
    s = re.sub(
        r"\(전자제출·USB 목록에서 갑호증으로 묶어 제출·정리 예정\)",
        "(전자제출 시 갑호증으로 제출)",
        s,
    )

    s = re.sub(r" — 루트 ", " — ", s)
    s = re.sub(
        r"\. 갑 제10호증\(준공 외관 전반·폴더 편철\)과 중복되지 않게 루트에 둠\.",
        ".",
        s,
    )
    s = re.sub(r" 및 같은 편철 루트 ", " 및 ", s)
    s = re.sub(r"갑3 루트에 두고 ", "갑 제3호증에 두고 ", s)
    s = re.sub(
        r" 폴더 전체\(파일명 선두 001_.+?편철\.",
        " 폴더.",
        s,
    )
    s = re.sub(
        r"\(갑3 편철; 갑10 폴더 내 동일 촬영 시각 사본은 제외\)",
        "",
        s,
    )
    s = re.sub(
        r"\(01_~05_ 접두 파일 및 갑 제36호증 등 접두 없는 파일명이 함께 있음\)\. 기존 소송의 갑 제35호증 등과 내용 중복 시 병합·참조 가능\.",
        ".",
        s,
    )
    s = re.sub(
        r"\. 파일 선두 001_~008_\(제2013-98호~제2022-18호 순\)\. 그 밖의 구소송 준비서면 갑호증 원본은 돌심방자료 내 2024구합54502\(진영광변호사\) 준비서면 폴더 등에 두며, 갑호증\(증거\)에는 부록 폴더를 두지 않습니다\.",
        ".",
        s,
    )
    s = re.sub(
        r" 증거 편철 순서상 갑 제10호증\(준공\)·갑 제7-3호증\(현장 통행\) 바로 뒤에 두지 않고, 설명회·의회·시도고시\(갑 제12~14호증\)에 이어 배경·보강 자료로 둡니다 — ",
        " — ",
        s,
    )
    s = re.sub(r"\(파일명 선두 순번·해시 접두\)\. 수집 과정상 연수택지 외 공원 관련 자료가 혼재할 수 있음\.", "", s)

    s = re.sub(r"[ \t]{2,}", " ", s).strip()
    return s if s else None


def _strip_inline_star(text: str) -> str:
    saved: list[str] = []

    def _hold(m: re.Match[str]) -> str:
        saved.append(m.group(0))
        return f"\ufffd{len(saved) - 1}\ufffd"

    t = _BOLD_BLOCK.sub(_hold, text)
    t = _INLINE_STAR.sub("", t)
    for i, block in enumerate(saved):
        t = t.replace(f"\ufffd{i}\ufffd", block)
    # 제출용 평문: `**굵게**` → 안쪽 글자만
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    # 인라인 코드 `경로` → 백틱 제거
    t = re.sub(r"`([^`]+)`", r"\1", t)
    t = re.sub(r"[ \t]{2,}", " ", t).rstrip()
    return t


def _is_note_line(stripped: str) -> bool:
    for pfx in sorted(NOTE_LINE_PREFIXES, key=len, reverse=True):
        if stripped.startswith(pfx):
            return True
    return False


def md_to_submission_txt(md_text: str) -> str:
    raw = _HTML_COMMENT.sub("", md_text)
    lines = raw.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    in_reference = False

    for line in lines:
        s = line.rstrip()
        st = s.strip()

        if in_reference:
            continue

        if st == REF_HEAD or st.startswith(REF_HEAD + " "):
            in_reference = True
            continue

        if not st:
            out.append("")
            continue

        if _is_note_line(st):
            continue

        if st.startswith("> "):
            continue

        s = _strip_inline_star(s)
        cleaned = _cleanup_submission_line(s)
        if cleaned is None or not cleaned.strip():
            continue

        out.append(cleaned)

    # 연속 빈 줄 3개 이상 → 2개로
    compact: list[str] = []
    blank_run = 0
    for line in out:
        if line == "":
            blank_run += 1
            if blank_run <= 2:
                compact.append("")
        else:
            blank_run = 0
            compact.append(line)

    return "\n".join(compact).strip() + "\n"


def export_one(md_path: Path, txt_path: Path) -> None:
    if not md_path.is_file():
        print("건너뜀(없음):", md_path, file=sys.stderr)
        return
    text = md_path.read_text(encoding="utf-8")
    submission = md_to_submission_txt(text)
    txt_path.parent.mkdir(parents=True, exist_ok=True)
    txt_path.write_text(submission, encoding="utf-8")
    print("작성:", txt_path.relative_to(_REPO))


def main() -> None:
    _configure_stdio_utf8()
    ap = argparse.ArgumentParser(description="제출용 원문만 txt 추출 → docs/{yymmdd}/")
    ap.add_argument("--01", dest="only01", action="store_true")
    ap.add_argument("--02", dest="only02", action="store_true")
    ap.add_argument(
        "--md01",
        type=Path,
        default=None,
        help=f"청구서 MD (기본: {_MD_01.name})",
    )
    ap.add_argument(
        "--md02",
        type=Path,
        default=None,
        help=f"집행정지 MD (기본: {_MD_02.name})",
    )
    ap.add_argument(
        "--yymmdd",
        default=None,
        metavar="YYMMDD",
        help="출력 폴더 docs/YYMMDD/ (미지정 시 --md01 파일명의 6자리 접두)",
    )
    args = ap.parse_args()

    md01 = args.md01 if args.md01 is not None else _MD_01
    md02 = args.md02 if args.md02 is not None else _MD_02
    docs_out = _docs_out_dir(md01, args.yymmdd)

    do01 = args.only01 or (not args.only01 and not args.only02)
    do02 = args.only02 or (not args.only01 and not args.only02)

    if do01:
        export_one(md01, _submission_txt_path(docs_out, md01))
    if do02:
        export_one(md02, _submission_txt_path(docs_out, md02))


if __name__ == "__main__":
    main()
