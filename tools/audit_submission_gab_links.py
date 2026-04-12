# -*- coding: utf-8 -*-
"""제출문(source MD) 갑호증·링크 전수 검수 → 별지 제1호 목록·갑호증및법령정보 폴더와 대조.

  python tools/audit_submission_gab_links.py

출력: 기본 stdout. --out 경로 주면 UTF-8 텍스트 저장.
"""
from __future__ import annotations

import argparse
import re
import unicodedata
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_SOURCE = _REPO / "web" / "commission-portal" / "public" / "source"
_GAB_ROOT = _REPO / "행정심판청구(제출용)" / "갑호증및법령정보"
_BYLAW1_NAME = "별지_갑1호증.md"

# 주호증: `**14. [갑 제14호증](#14)**` 또는 `1. [갑 제10호증](#10)` (부번 아님)
_RE_LINK_MAIN = re.compile(r"\[갑 제(\d+)호증\]\(#\1\)")
_RE_LINK_SUB = re.compile(r"\[갑 제(\d+)-(\d+)호증\]\(#\1-\2\)")
# 마크다운 앵커 링크 대상
_RE_MD_ANCHOR = re.compile(r"\]\(#(\d+(?:-\d+)?)\)")
# 본문에 드러난 갑 부번(플레인·마크다운 공통)
_RE_GAB_KEY = re.compile(
    r"갑\s*제\s*(\d+)(?:-(\d+))?\s*호증",
    re.IGNORECASE,
)
# 틸드/물결 범위 (동일 주번호만 확장)
_RE_RANGE_SAME_MAJOR = re.compile(
    r"갑\s*제\s*(\d+)-(\d+)\s*호증\s*[~～]\s*갑\s*제\s*\1-(\d+)\s*호증",
    re.IGNORECASE,
)
_RE_FILE = re.compile(r"갑제(\d+)-(\d+)(?:호증|증)(?=_|\.)", re.IGNORECASE)
_MEDIA_EXT = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".mp4",
    ".webp",
    ".gif",
    ".tif",
    ".tiff",
}


def parse_bylaw1_keys_and_labels(path: Path) -> dict[str, str]:
    """키 '1-1' 또는 주만 '10' -> 짧은 라벨(파일 전체 스캔)."""
    text = path.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    for m in _RE_LINK_SUB.finditer(text):
        a, b = int(m.group(1)), int(m.group(2))
        key = f"{a}-{b}"
        if key not in out:
            out[key] = f"갑 제{a}-{b}호증"
    for m in _RE_LINK_MAIN.finditer(text):
        n = int(m.group(1))
        key = str(n)
        if key not in out:
            out[key] = f"갑 제{n}호증"
    return out


def expand_range_keys(s: str) -> set[str]:
    """문자열에서 동일 주번호 범위 ~ 패턴을 찾아 부번 키 집합에 합산."""
    extra: set[str] = set()
    for m in _RE_RANGE_SAME_MAJOR.finditer(s):
        maj = int(m.group(1))
        lo = int(m.group(2))
        hi = int(m.group(3))
        if lo > hi:
            lo, hi = hi, lo
        for sub in range(lo, hi + 1):
            extra.add(f"{maj}-{sub}")
    return extra


def collect_keys_from_text(s: str) -> set[str]:
    keys: set[str] = set()
    keys |= expand_range_keys(s)
    for m in _RE_GAB_KEY.finditer(s):
        maj = int(m.group(1))
        sub = m.group(2)
        if sub is not None:
            keys.add(f"{maj}-{int(sub)}")
        else:
            keys.add(str(maj))
    return keys


def collect_md_anchors(s: str) -> set[str]:
    return {m.group(1) for m in _RE_MD_ANCHOR.finditer(s)}


def collect_urls(s: str) -> list[str]:
    """마크다운 (URL) 괄호 안 + 괄호 밖의 URL. 중복·꼬리 제거."""
    seen: set[str] = set()
    out: list[str] = []
    for m in re.finditer(r"\(\s*(https?://[^)\s]+)\s*\)", s):
        u = m.group(1).rstrip(").,;")
        if u not in seen:
            seen.add(u)
            out.append(u)
    for m in re.finditer(r"(?<![(\[])https?://[^\s\)\]<>\"']+", s):
        u = m.group(0).rstrip(").,;")
        if "&gt;" in u:
            u = u.split("&gt;")[0]
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def collect_serve_paths(s: str) -> list[str]:
    return re.findall(r"/serve/[^\s\)\"']+", s)


def folder_files_by_key(root: Path) -> dict[str, list[str]]:
    by_key: dict[str, list[str]] = {}
    if not root.is_dir():
        return by_key
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        if p.suffix.lower() not in _MEDIA_EXT:
            continue
        name = unicodedata.normalize("NFC", p.name)
        m = _RE_FILE.search(name)
        if not m:
            continue
        key = f"{int(m.group(1))}-{int(m.group(2))}"
        rel = p.relative_to(root).as_posix()
        by_key.setdefault(key, []).append(rel)
    return by_key


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=None, help="UTF-8 보고 파일")
    args = ap.parse_args()
    lines: list[str] = []

    def out(s: str = "") -> None:
        lines.append(s)

    bylaw1_path = _SOURCE / _BYLAW1_NAME
    if not bylaw1_path.is_file():
        out(f"오류: 별지1 없음 {bylaw1_path}")
        text = "\n".join(lines)
        print(text)
        return

    canonical = parse_bylaw1_keys_and_labels(bylaw1_path)
    sub_keys = {k for k in canonical if "-" in k}
    main_keys = {k for k in canonical if "-" not in k}

    md_files = sorted(_SOURCE.glob("*.md"))
    out("=== 제출문(포털 source) 갑호증·URL 검수 ===")
    out(f"기준 별지1: {bylaw1_path.relative_to(_REPO)}")
    out(f"별지1 파싱: 주호증 {len(main_keys)}개, 부번 {len(sub_keys)}개 (총 키 {len(canonical)}개)")
    out()

    all_keys_cited: set[str] = set()
    all_anchors: set[str] = set()
    all_urls: list[tuple[str, str]] = []

    for fp in md_files:
        raw = fp.read_text(encoding="utf-8")
        keys = collect_keys_from_text(raw)
        anchors = collect_md_anchors(raw)
        urls = collect_urls(raw)
        serves = collect_serve_paths(raw)
        all_keys_cited |= keys
        all_anchors |= anchors
        for u in urls:
            all_urls.append((fp.name, u))
        out(f"--- 파일: {fp.name} ---")
        out(f"  플레인/범위에서 추출한 갑 키: {len(keys)}개")
        out(f"  마크다운 ]( #앵커 ) 고유 개수: {len(anchors)}개")
        if urls:
            out(f"  http(s) URL: {len(urls)}건")
        if serves:
            out(f"  /serve/ 경로: {len(serves)}건")
        if fp.name == _BYLAW1_NAME:
            out("  (별지1은 기준 목록이므로 누락 검사에서 제외 가능)")
        out()

    # 앵커와 canonical 교집합 — 정의된 호증만
    anchor_keys = set()
    for a in all_anchors:
        if re.fullmatch(r"\d+(?:-\d+)?", a):
            anchor_keys.add(a)

    unknown_from_corpus = sorted(
        all_keys_cited | anchor_keys,
        key=lambda x: (int(x.split("-")[0]), int(x.split("-")[1]) if "-" in x else 0),
    )
    unknown_from_corpus = [k for k in unknown_from_corpus if k not in canonical]

    never_cited = sorted(
        canonical.keys(),
        key=lambda x: (
            int(x.split("-")[0]),
            int(x.split("-")[1]) if "-" in x else -1,
        ),
    )
    cited_union = all_keys_cited | anchor_keys
    never_cited = [k for k in never_cited if k not in cited_union]

    out("=== 요약 ===")
    out(
        f"문서 전체에서 인용된 갑 키(플레인+범위) ∪ 마크다운 #앵커: "
        f"{len(all_keys_cited | anchor_keys)}개 (고유)"
    )
    if unknown_from_corpus:
        out()
        out("【주의】별지1 목록에 없는 키(오타·구버전 범위 등 의심):")
        for k in unknown_from_corpus:
            out(f"  - {k}")
    else:
        out("별지1에 없는 키 참조: 없음.")

    out()
    if never_cited:
        out("【참고】다른 제출문·별지1 본문에서 한 번도 안 잡힌 별지1 키(플레인/앵커 기준):")
        for k in never_cited[:80]:
            out(f"  - {k}  ({canonical.get(k, '')})")
        if len(never_cited) > 80:
            out(f"  ... 외 {len(never_cited) - 80}개")
    else:
        out("미인용 별지1 키: 없음(또는 전부 별지1 자체에만 존재).")

    out()
    out("=== 외부 URL 목록(파일명, URL) ===")
    seen_u = set()
    for fname, u in all_urls:
        if u in seen_u:
            continue
        seen_u.add(u)
        refs = [a for a, b in all_urls if b == u]
        out(f"  {u}")
        out(f"    → {', '.join(sorted(set(refs)))}")

    out()
    out("=== 갑호증및법령정보 폴더 ===")
    if _GAB_ROOT.is_dir():
        by_file = folder_files_by_key(_GAB_ROOT)
        out(f"경로: {_GAB_ROOT.relative_to(_REPO)}")
        out(f"미디어 파일에서 파싱한 부번 키: {len(by_file)}개")
        missing_files = sorted(sub_keys - set(by_file.keys()))
        extra_files = sorted(set(by_file.keys()) - sub_keys)
        if missing_files:
            out()
            out("【폴더에 파일이 없는 별지1 부번 키】(일부는 미제출·다른 경로일 수 있음):")
            for k in missing_files[:60]:
                out(f"  - {k}")
            if len(missing_files) > 60:
                out(f"  ... 외 {len(missing_files) - 60}개")
        else:
            out("별지1 부번 대비 폴더 내 미디어 키 누락: 없음.")
        if extra_files:
            out()
            out("【참고】폴더에만 있고 별지1 부번 줄에 없는 키:")
            for k in extra_files[:40]:
                out(f"  - {k}")
    else:
        out(f"폴더 없음(로컬 미러 없음): {_GAB_ROOT}")

    out()
    out("=== 별지3·별지4 마크다운 링크 []( # ) 개수 ===")
    for name in ("별지_갑3호증.md", "별지_갑4호증.md"):
        p = _SOURCE / name
        if p.is_file():
            t = p.read_text(encoding="utf-8")
            n = len(re.findall(r"\[[^\]]+\]\(#", t))
            out(f"  {name}: `](#` 형태 링크 {n}개 (0이면 앵커 링크 없음; 플레인 텍스트는 decorateCiteLinks로 클릭 가능)")

    text = "\n".join(lines)
    print(text)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
