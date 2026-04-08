# -*- coding: utf-8 -*-
"""증거·첨부 폴더 트리 비교: SHA256 동일 파일, PDF 페이지·용량, 1:1 텍스트/OCR 비교.

[트리 vs 트리]
  python tools/compare_evidence_trees.py \\
    "돌심방자료/행정심판청구서_첨부" \\
    "행정심판청구(증거)/갑호증"

[단일 쌍 — 해시·크기·(PDF)쪽 수]
  python tools/compare_evidence_trees.py --pair "a.pdf" "b.pdf"

[단일 쌍 — PDF 본문 텍스트 diff(추출 가능한 PDF만)]
  python tools/compare_evidence_trees.py --pair "a.pdf" "b.pdf" --pdf-text-diff

[단일 쌍 — 이미지 OCR 후 유사도( difflib; Tesseract·requirements-ocr.txt )]
  python tools/compare_evidence_trees.py --pair "a.jpg" "b.jpg" --ocr-diff

산출: --out 미지정 시 stdout + UTF-8, --out 경로 지정 시 해당 .txt 에 기록.

의존성: 해시·크기만이면 표준 라이브러리만으로 동작. PDF 페이지·텍스트는
  pip install -r tools/requirements-evidence-compare.txt
OCR 은 pip install -r tools/requirements-ocr.txt 및 Tesseract 설치.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from collections import defaultdict
from difflib import SequenceMatcher, unified_diff
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_SKIP_NAMES = {"Thumbs.db", "desktop.ini", ".DS_Store"}
_VIEW_EXT = {".pdf", ".jpg", ".jpeg", ".jpe", ".png", ".gif", ".webp", ".tif", ".tiff", ".mp4", ".docx"}


def _repo_path(s: str) -> Path:
    p = Path(s.strip())
    if p.is_absolute():
        return p.resolve()
    return (_REPO / p).resolve()


def sha256_file(path: Path, *, max_bytes: int | None) -> str | None:
    try:
        sz = path.stat().st_size
        if max_bytes is not None and sz > max_bytes:
            return None
        h = hashlib.sha256()
        with path.open("rb") as f:
            for ch in iter(lambda: f.read(1024 * 1024), b""):
                h.update(ch)
        return h.hexdigest()
    except OSError:
        return None


def pdf_page_count(path: Path) -> int | None:
    try:
        from pypdf import PdfReader

        with path.open("rb") as f:
            r = PdfReader(f)
            return len(r.pages)
    except Exception:
        pass
    try:
        import fitz

        doc = fitz.open(path)
        try:
            return len(doc)
        finally:
            doc.close()
    except Exception:
        return None


def pdf_extract_text(path: Path, *, max_pages: int = 50) -> str:
    parts: list[str] = []
    try:
        from pypdf import PdfReader

        with path.open("rb") as f:
            r = PdfReader(f)
            for i, page in enumerate(r.pages):
                if i >= max_pages:
                    parts.append(f"\n[… {len(r.pages) - max_pages}쪽 생략 …]\n")
                    break
                t = page.extract_text() or ""
                parts.append(t)
        return "\n".join(parts)
    except Exception:
        pass
    try:
        import fitz

        doc = fitz.open(path)
        try:
            n = min(len(doc), max_pages)
            for i in range(n):
                parts.append(doc.load_page(i).get_text() or "")
            if len(doc) > max_pages:
                parts.append(f"\n[… {len(doc) - max_pages}쪽 생략 …]\n")
        finally:
            doc.close()
        return "\n".join(parts)
    except Exception:
        return ""


def iter_evidence_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    out: list[Path] = []
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        if p.name.startswith(".") or p.name in _SKIP_NAMES:
            continue
        suf = p.suffix.lower()
        if suf not in _VIEW_EXT and suf:
            continue
        if not suf:
            continue
        out.append(p)
    return out


def index_by_hash(
    files: list[Path],
    *,
    root: Path,
    max_hash_bytes: int | None,
) -> tuple[dict[str, list[str]], list[tuple[str, int, int | None]]]:
    """hash -> rel posix 목록, 및 (rel, size, pages|None) 전체 행."""
    hash_to_rels: dict[str, list[str]] = defaultdict(list)
    rows: list[tuple[str, int, int | None]] = []
    for p in files:
        try:
            sz = p.stat().st_size
        except OSError:
            continue
        rel = p.relative_to(root).as_posix()
        pages = pdf_page_count(p) if p.suffix.lower() == ".pdf" else None
        rows.append((rel, sz, pages))
        digest = sha256_file(p, max_bytes=max_hash_bytes)
        if digest:
            hash_to_rels[digest].append(rel)
    return dict(hash_to_rels), rows


def basename_index(rels: list[str]) -> dict[str, list[str]]:
    d: dict[str, list[str]] = defaultdict(list)
    for r in rels:
        d[Path(r).name].append(r)
    return dict(d)


def run_tree_compare(
    left_root: Path,
    right_root: Path,
    *,
    max_hash_bytes: int | None,
    out_lines: list[str],
) -> None:
    lf = iter_evidence_files(left_root)
    rf = iter_evidence_files(right_root)
    left_h, left_rows = index_by_hash(lf, root=left_root, max_hash_bytes=max_hash_bytes)
    right_h, right_rows = index_by_hash(rf, root=right_root, max_hash_bytes=max_hash_bytes)

    left_rels = [r for r, _, _ in left_rows]
    right_rels = [r for r, _, _ in right_rows]
    left_set, right_set = set(left_rels), set(right_rels)

    out_lines.append("=== 트리 비교 ===")
    out_lines.append(f"왼쪽: {left_root} ({len(left_rels)} 파일)")
    out_lines.append(f"오른쪽: {right_root} ({len(right_rels)} 파일)")
    out_lines.append("")

    out_lines.append("[1] SHA256 기준 — 양쪽에 동일 바이트 존재 (내용 동일)")
    same_hash = sorted(set(left_h.keys()) & set(right_h.keys()))
    if not same_hash:
        out_lines.append("  (없음 — 해시 스킵된 대용량만 있거나 공통 해시 없음)")
    for h in same_hash:
        la, ra = left_h[h], right_h[h]
        out_lines.append(f"  {h[:16]}…")
        for x in la:
            out_lines.append(f"    ← {x}")
        for x in ra:
            out_lines.append(f"    → {x}")
    out_lines.append("")

    out_lines.append("[2] 상대 경로 동일 — 한쪽에만 있음")
    only_l = sorted(left_set - right_set)
    only_r = sorted(right_set - left_set)
    out_lines.append(f"  왼쪽만 ({len(only_l)}건)")
    for x in only_l[:500]:
        out_lines.append(f"    {x}")
    if len(only_l) > 500:
        out_lines.append(f"    … 외 {len(only_l) - 500}건")
    out_lines.append(f"  오른쪽만 ({len(only_r)}건)")
    for x in only_r[:500]:
        out_lines.append(f"    {x}")
    if len(only_r) > 500:
        out_lines.append(f"    … 외 {len(only_r) - 500}건")
    out_lines.append("")

    out_lines.append("[3] 파일명 동일·경로는 다름 — SHA256 로 내용 동일 여부")
    bl = basename_index(left_rels)
    br = basename_index(right_rels)
    common_names = sorted(set(bl.keys()) & set(br.keys()))
    same_content = 0
    diff_content = 0
    pair_budget = 150
    for name in common_names:
        for lr in bl[name]:
            for rr in br[name]:
                if pair_budget <= 0:
                    break
                if lr == rr:
                    continue
                lp = left_root / lr
                rp = right_root / rr
                hl = sha256_file(lp, max_bytes=max_hash_bytes)
                hr = sha256_file(rp, max_bytes=max_hash_bytes)
                if hl and hr and hl == hr:
                    same_content += 1
                    pair_budget -= 1
                    out_lines.append(f"  동일 내용: {name}")
                    out_lines.append(f"    ← {lr}")
                    out_lines.append(f"    → {rr}")
                elif hl and hr:
                    diff_content += 1
                    pair_budget -= 1
                    sl = lp.stat().st_size
                    sr = rp.stat().st_size
                    pl = pdf_page_count(lp) if lp.suffix.lower() == ".pdf" else None
                    pr = pdf_page_count(rp) if rp.suffix.lower() == ".pdf" else None
                    out_lines.append(f"  다른 내용(동명): {name}")
                    out_lines.append(f"    ← {lr}  size={sl:,}  pdf_pages={pl}")
                    out_lines.append(f"    → {rr}  size={sr:,}  pdf_pages={pr}")
                    out_lines.append(f"    hash  {hl[:12]}… / {hr[:12]}…")
            if pair_budget <= 0:
                break
        if pair_budget <= 0:
            out_lines.append("  … 동명 쌍 비교는 최대 150건만 상세 표시")
            break
    if not common_names:
        out_lines.append("  (공통 파일명 없음)")
    out_lines.append("")
    out_lines.append(f"  요약: 동명·다른 경로 중 내용 동일 {same_content}쌍, 내용 다름 {diff_content}쌍")
    out_lines.append("")

    out_lines.append("[4] 용량 동일·해시 다름 — PDF면 페이지 수 표시 (재스캔·압축 차이 등 의심 시 눈으로 확인)")
    size_map_l: dict[int, list[str]] = defaultdict(list)
    size_map_r: dict[int, list[str]] = defaultdict(list)
    hash_by_rel_l = {}
    hash_by_rel_r = {}
    for p in lf:
        rel = p.relative_to(left_root).as_posix()
        try:
            sz = p.stat().st_size
        except OSError:
            continue
        size_map_l[sz].append(rel)
        d = sha256_file(p, max_bytes=max_hash_bytes)
        if d:
            hash_by_rel_l[rel] = d
    for p in rf:
        rel = p.relative_to(right_root).as_posix()
        try:
            sz = p.stat().st_size
        except OSError:
            continue
        size_map_r[sz].append(rel)
        d = sha256_file(p, max_bytes=max_hash_bytes)
        if d:
            hash_by_rel_r[rel] = d

    shown = 0
    for sz in sorted(set(size_map_l.keys()) & set(size_map_r.keys())):
        for lr in size_map_l[sz]:
            for rr in size_map_r[sz]:
                hl = hash_by_rel_l.get(lr)
                hr = hash_by_rel_r.get(rr)
                if not hl or not hr or hl == hr:
                    continue
                lp = left_root / lr
                rp = right_root / rr
                pl = pdf_page_count(lp) if lp.suffix.lower() == ".pdf" else None
                pr = pdf_page_count(rp) if rp.suffix.lower() == ".pdf" else None
                out_lines.append(f"  size={sz:,} bytes  hash 다름")
                out_lines.append(f"    ← {lr}  pages={pl}")
                out_lines.append(f"    → {rr}  pages={pr}")
                shown += 1
                if shown >= 200:
                    out_lines.append("  … 최대 200건만 표시")
                    break
            if shown >= 200:
                break
        if shown >= 200:
            break
    if shown == 0:
        out_lines.append("  (해시 스킵 제외 후 해당 없음)")
    out_lines.append("")

    out_lines.append("[5] 안내")
    out_lines.append("  - 동일 SHA256 = 바이트 단위 동일(스캔·재저장 없이 복사본일 때).")
    out_lines.append("  - 해시 다름이어도 PDF 페이지·용량이 같으면 ‘다른 압축/메타’일 수 있어 뷰어로 확인하세요.")
    out_lines.append("  - 스캔 PDF는 텍스트 추출·OCR 이 빈 값일 수 있습니다.")
    out_lines.append("  - 대용량은 --skip-hash-mb 0 으로 전부 해시(시간·디스크 부하 증가).")


def run_pair(
    p1: Path,
    p2: Path,
    *,
    max_hash_bytes: int | None,
    pdf_text_diff: bool,
    ocr_diff: bool,
    out_lines: list[str],
) -> None:
    out_lines.append("=== 단일 쌍 비교 ===")
    out_lines.append(f"A: {p1}")
    out_lines.append(f"B: {p2}")
    if not p1.is_file() or not p2.is_file():
        out_lines.append("오류: 파일이 없습니다.")
        return
    try:
        s1, s2 = p1.stat().st_size, p2.stat().st_size
    except OSError as e:
        out_lines.append(f"오류: {e}")
        return
    out_lines.append(f"크기: A={s1:,}  B={s2:,}")
    h1 = sha256_file(p1, max_bytes=max_hash_bytes)
    h2 = sha256_file(p2, max_bytes=max_hash_bytes)
    if h1 is None or h2 is None:
        out_lines.append("SHA256: (스킵 — --skip-hash-mb 조정)")
    else:
        out_lines.append(f"SHA256 A: {h1}")
        out_lines.append(f"SHA256 B: {h2}")
        out_lines.append(f"바이트 동일: {'예' if h1 == h2 else '아니오'}")
    suf1, suf2 = p1.suffix.lower(), p2.suffix.lower()
    if suf1 == ".pdf" and suf2 == ".pdf":
        n1, n2 = pdf_page_count(p1), pdf_page_count(p2)
        out_lines.append(f"PDF 페이지: A={n1}  B={n2}")
        if pdf_text_diff:
            t1 = pdf_extract_text(p1)
            t2 = pdf_extract_text(p2)
            out_lines.append("")
            out_lines.append("[PDF 추출 텍스트 unified diff — 앞 400줄]")
            diff = list(
                unified_diff(
                    t1.splitlines(),
                    t2.splitlines(),
                    fromfile=str(p1),
                    tofile=str(p2),
                    lineterm="",
                )
            )
            for ln in diff[:400]:
                out_lines.append(ln)
            if len(diff) > 400:
                out_lines.append("… (잘림)")
    img_ext = {".jpg", ".jpeg", ".jpe", ".png", ".gif", ".webp", ".tif", ".tiff"}
    if ocr_diff:
        if suf1 not in img_ext or suf2 not in img_ext:
            out_lines.append("--ocr-diff 는 두 파일 모두 이미지일 때만 사용하세요.")
        else:
            try:
                import importlib.util

                spec = importlib.util.spec_from_file_location(
                    "tesseract_ocr", _REPO / "tools" / "tesseract_ocr.py"
                )
                if spec is None or spec.loader is None:
                    raise ImportError("tesseract_ocr 로드 실패")
                tess = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(tess)

                t1 = tess.ocr_image(p1)
                t2 = tess.ocr_image(p2)
                ratio = SequenceMatcher(None, t1, t2).ratio()
                out_lines.append("")
                out_lines.append(f"[OCR 유사도(문자열)] SequenceMatcher.ratio = {ratio:.4f}")
                out_lines.append("--- A OCR 앞 2000자 ---")
                out_lines.append(t1[:2000] + ("…" if len(t1) > 2000 else ""))
                out_lines.append("--- B OCR 앞 2000자 ---")
                out_lines.append(t2[:2000] + ("…" if len(t2) > 2000 else ""))
            except Exception as e:
                out_lines.append(f"OCR 실패: {e}")
                out_lines.append("pip install -r tools/requirements-ocr.txt 및 Tesseract 설치를 확인하세요.")


def main() -> int:
    ap = argparse.ArgumentParser(description="증거 폴더 트리 또는 단일 파일 쌍 비교")
    ap.add_argument("left", nargs="?", help="왼쪽 루트(상대 경로는 저장소 루트 기준)")
    ap.add_argument("right", nargs="?", help="오른쪽 루트")
    ap.add_argument("--pair", nargs=2, metavar=("P1", "P2"), help="트리 대신 두 파일만 비교")
    ap.add_argument("--out", type=Path, default=None, help="보고서 UTF-8 텍스트 경로")
    ap.add_argument(
        "--skip-hash-mb",
        type=float,
        default=400.0,
        help="이 크기(MB) 초과 파일은 SHA256 생략(0이면 전부 해시)",
    )
    ap.add_argument("--pdf-text-diff", action="store_true", help="--pair 가 둘 다 PDF일 때 추출 텍스트 diff")
    ap.add_argument("--ocr-diff", action="store_true", help="--pair 가 둘 다 이미지일 때 OCR 유사도")
    args = ap.parse_args()

    max_hash = None if args.skip_hash_mb <= 0 else int(args.skip_hash_mb * 1024 * 1024)
    lines: list[str] = []

    if args.pair:
        run_pair(
            _repo_path(args.pair[0]),
            _repo_path(args.pair[1]),
            max_hash_bytes=max_hash,
            pdf_text_diff=args.pdf_text_diff,
            ocr_diff=args.ocr_diff,
            out_lines=lines,
        )
    else:
        if not args.left or not args.right:
            ap.error("트리 모드: left right 두 인자 또는 --pair P1 P2")
        run_tree_compare(
            _repo_path(args.left),
            _repo_path(args.right),
            max_hash_bytes=max_hash,
            out_lines=lines,
        )

    text = "\n".join(lines) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")
    so = getattr(sys.stdout, "reconfigure", None)
    if callable(so):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass
    try:
        print(text, end="")
    except UnicodeEncodeError:
        print(text.encode("utf-8", errors="replace").decode("utf-8", errors="replace"), end="")
    if args.out:
        print(f"기록: {args.out.resolve()}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
