# -*- coding: utf-8 -*-
"""돌심방 `행정심판청구서_첨부` 파일이 제출용 최종 MD에 인용·언급되는지 검사.

판정은 **부분 문자열** 기준이며, 계층은 다음 순으로 강함입니다.
  1) 파일 전체 이름 · 확장자 제외 stem 이 말뭉치에 포함
  2) `첨부(갑제N호증)_순번_` 접두 제거 후 slug 가 말뭉치에 포함(길이 14자 이상만)
  3) 파일명 속 `제NNNN-NN호` 고시·행정고시 번호가 말뭉치에 포함
  4) 파일명 속 `1992-586` 형태(연도-번호) 결정·사건번호가 말뭉치에 포함
  5) `NNNNNN_NNNNNN` 형태 촬영·저장 시각 토큰이 말뭉치에 포함

3·4·5는 **동일 키워드를 가진 다른 갑호증**과 겹칠 수 있으므로 「약한 일치」로 보면 됩니다.

  python tools/audit_attachment_cited_in_final.py
  python tools/audit_attachment_cited_in_final.py --out 행정심판청구(제출용)/260409_첨부_최종인용_검사.txt
  python tools/audit_attachment_cited_in_final.py --final-glob "행정심판청구(원본)/제출원문(원본)/*.md"

의존성: 표준 라이브러리만.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from wonmun_paths import latest_yymmdd_md_dir

_REPO = Path(__file__).resolve().parent.parent
_DEFAULT_ATTACH = _REPO / "돌심방자료" / "행정심판청구서_첨부"
_SKIP_NAMES = {"Thumbs.db", "desktop.ini", ".DS_Store"}
_EXT = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".jpe",
    ".png",
    ".gif",
    ".webp",
    ".tif",
    ".tiff",
    ".mp4",
    ".docx",
    ".url",
}

# 첨부(갑제N호증)_07_슬러그… 또는 첨부(갑제N호증)_슬러그…
_RE_ATTACH_PREFIX = re.compile(
    r"^첨부\(갑제\d+호증\)_\d+_(.+)$",
)
_RE_ATTACH_PREFIX_NOSEQ = re.compile(
    r"^첨부\(갑제\d+호증\)_(.+)$",
)
_RE_GOSI = re.compile(r"제\d{4}-\d+호")
# 별지·본문에 "건설부 1992-586" 등으로 적히는 번호
_RE_YEAR_NUM = re.compile(r"(?<![0-9])(?:19|20)\d{2}-\d{3,5}(?![0-9])")
_RE_STAMP = re.compile(r"_(\d{6}_\d{6})(?=\.[^.]+$)")
_SLUG_MIN_LEN = 14


def _read_corpus(paths: list[Path]) -> tuple[str, list[str]]:
    parts: list[str] = []
    labels: list[str] = []
    for p in sorted(paths):
        if not p.is_file():
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except OSError as e:
            print(f"읽기 실패: {p} — {e}", file=sys.stderr)
            continue
        labels.append(str(p.relative_to(_REPO)))
        parts.append(text)
    return "\n".join(parts), labels


def _iter_attach_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    out: list[Path] = []
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        if p.name.startswith(".") or p.name in _SKIP_NAMES:
            continue
        if p.suffix.lower() not in _EXT:
            continue
        out.append(p)
    return out


def _slug_candidates(stem: str) -> list[str]:
    cands: list[str] = []
    m = _RE_ATTACH_PREFIX.match(stem)
    if m:
        cands.append(m.group(1))
    m2 = _RE_ATTACH_PREFIX_NOSEQ.match(stem)
    if m2 and m2.group(1) != stem:
        s = m2.group(1)
        if s not in cands:
            cands.append(s)
    return cands


def classify(name: str, stem: str, corpus: str) -> tuple[str, str]:
    """(등급, 근거 한 줄)."""
    if name in corpus:
        return "파일명_전체일치", f"`{name}`"
    if stem in corpus:
        return "stem_전체일치", f"`{stem}`"

    for slug in _slug_candidates(stem):
        if len(slug) >= _SLUG_MIN_LEN and slug in corpus:
            return "slug_일치", f"`{slug}` (접두 제거)"

    gosis = _RE_GOSI.findall(stem)
    hits = [g for g in gosis if g in corpus]
    if hits:
        return "고시번호_말뭉치출현", ", ".join(f"`{h}`" for h in hits)

    ynums = sorted(set(_RE_YEAR_NUM.findall(stem)))
    yhits = [y for y in ynums if y in corpus]
    if yhits:
        return "연도-번호_말뭉치출현", ", ".join(f"`{h}`" for h in yhits)

    m = _RE_STAMP.search(name)
    if m:
        tok = m.group(1)
        if tok in corpus:
            return "타임스탬프_말뭉치출현", f"`{tok}`"

    return "미검출", ""


def main() -> int:
    ap = argparse.ArgumentParser(description="첨부 폴더 파일의 최종 MD 인용 여부 검사")
    ap.add_argument(
        "--attach",
        type=Path,
        default=_DEFAULT_ATTACH,
        help="첨부 루트",
    )
    ap.add_argument(
        "--final-glob",
        type=str,
        default=None,
        help="최종 문서 MD glob(저장소 루트 기준). 생략 시 제출원문(원본)/*.md",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="보고서 UTF-8 텍스트 경로(미지정 시 stdout)",
    )
    args = ap.parse_args()

    attach = args.attach.resolve() if args.attach.is_absolute() else (_REPO / args.attach).resolve()
    final_glob = args.final_glob
    if not final_glob:
        d = latest_yymmdd_md_dir(_REPO)
        final_glob = str(d.relative_to(_REPO).as_posix()) + "/*.md"
    final_paths = sorted(_REPO.glob(final_glob))
    if not final_paths:
        print(f"최종 MD 없음: glob {final_glob!r} (저장소 루트 기준)", file=sys.stderr)
        return 1

    corpus, corpus_labels = _read_corpus(final_paths)
    if not corpus.strip():
        print("말뭉치가 비었습니다.", file=sys.stderr)
        return 1

    files = _iter_attach_files(attach)
    if not files:
        print(f"첨부 미디어 파일 없음: {attach}", file=sys.stderr)
        return 1

    lines: list[str] = []
    lines.append("=== 첨부 → 제출원문(원본) MD 인용 검사 ===")
    lines.append(f"첨부: {attach.relative_to(_REPO)}")
    lines.append(f"최종 MD ({len(corpus_labels)}개):")
    for lb in corpus_labels:
        lines.append(f"  - {lb}")
    lines.append("")
    lines.append("등급: 파일명/stem > slug > 고시번호 > 연도-번호 > 타임스탬프 > 미검출")
    lines.append("※ 고시·연도-번호·타임스탬프는 다른 갑호증과 문자열이 겹칠 수 있음.")
    lines.append("")

    buckets: dict[str, list[tuple[str, str, str]]] = {
        "파일명_전체일치": [],
        "stem_전체일치": [],
        "slug_일치": [],
        "고시번호_말뭉치출현": [],
        "연도-번호_말뭉치출현": [],
        "타임스탬프_말뭉치출현": [],
        "미검출": [],
    }

    for p in files:
        rel = str(p.relative_to(attach))
        tier, detail = classify(p.name, p.stem, corpus)
        buckets[tier].append((rel, tier, detail))

    order = [
        "파일명_전체일치",
        "stem_전체일치",
        "slug_일치",
        "고시번호_말뭉치출현",
        "연도-번호_말뭉치출현",
        "타임스탬프_말뭉치출현",
        "미검출",
    ]
    for key in order:
        items = buckets[key]
        if not items:
            continue
        lines.append(f"--- [{key}] {len(items)}건 ---")
        for rel, tier, detail in items:
            lines.append(rel)
            if detail:
                lines.append(f"    → {detail}")
        lines.append("")

    summary = ", ".join(f"{k}={len(buckets[k])}" for k in order)
    lines.append("=== 요약 ===")
    lines.append(summary)

    report = "\n".join(lines) + "\n"
    if args.out:
        out_path = args.out.resolve() if args.out.is_absolute() else (_REPO / args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")
        print(f"기록: {out_path.relative_to(_REPO)}")
    else:
        sys.stdout.write(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
