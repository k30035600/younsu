# -*- coding: utf-8 -*-
"""
행정심판청구서(`행정심판청구(최종)/260404_01_행정심판청구서_최종.md` [증거자료 목록]과 동일한 편철 순서)에 따른
증거 파일을 한 곳으로 복사합니다.

- 소스: `갑호증` 루트·하위 폴더, `돌심방자료`(갑11 주민설명회 폴더).
- **동일 SHA256은 1회만 복사**(먼저 목록에 나오는 경로 우선). 생략된 경로는 로그에 기록.
- 400MB 초과 파일은 해시 생략 → 항상 복사(중복 판단 안 함); 로그에 표시.

실행(프로젝트 루트 younsu):
  python tools/copy_evidence_from_petition.py --dry-run
  python tools/copy_evidence_from_petition.py
"""
from __future__ import annotations

import argparse
import hashlib
import re
import shutil
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
GAB = _REPO / "행정심판청구(증거)" / "최종" / "갑호증"
DOL = _REPO / "돌심방자료"
DEFAULT_DEST = _REPO / "행정심판청구(증거)" / "최종" / "증거_청구서기준_복사"
MAX_HASH = 400 * 1024 * 1024
SKIP_NAMES = {"Thumbs.db", "desktop.ini", ".DS_Store"}


def sha256_file(p: Path) -> str | None:
    try:
        sz = p.stat().st_size
        if sz > MAX_HASH:
            return None
        h = hashlib.sha256()
        with p.open("rb") as f:
            for ch in iter(lambda: f.read(1024 * 1024), b""):
                h.update(ch)
        return h.hexdigest()
    except OSError:
        return None


def safe_dest_name(s: str, max_len: int = 180) -> str:
    s = re.sub(r'[<>:"/\\|?*]', "_", s).strip() or "file"
    if len(s) > max_len:
        stem, suf = Path(s).stem, Path(s).suffix
        s = stem[: max_len - len(suf) - 10] + "__trunc" + suf
    return s


def find_gab_glob(pattern: str) -> list[Path]:
    if not GAB.is_dir():
        return []
    return sorted([p for p in GAB.glob(pattern) if p.is_file()])


def find_first_gab(pattern: str) -> Path | None:
    xs = find_gab_glob(pattern)
    return xs[0] if xs else None


def find_jumin_folder() -> Path | None:
    if not DOL.is_dir():
        return None
    for p in DOL.rglob("*"):
        if not p.is_dir():
            continue
        n = p.name
        if "_190724" in n and "주민설명회" in n and "농원" in n:
            return p
    return None


def collect_tagged_files() -> list[tuple[str, Path]]:
    """청구서 [증거자료 목록] 순서. (표시태그, 경로)."""
    out: list[tuple[str, Path]] = []

    def files_only(tag: str, ps: list[Path]) -> None:
        for p in ps:
            out.append((tag, p))

    def tree(tag: str, d: Path | None) -> None:
        if d is None or not d.is_dir():
            return
        for p in sorted(d.rglob("*")):
            if not p.is_file():
                continue
            if p.name in SKIP_NAMES:
                continue
            out.append((tag, p))

    # 1
    for p in find_gab_glob("갑제1-1호증*"):
        out.append(("갑1", p))
    # 2-1, 2-2
    p21 = GAB / "갑제2-1호증_동춘동199_건축물관리대장(폐쇄).jpg"
    if p21.is_file():
        out.append(("갑2-1", p21))
    p22 = GAB / "갑제2-2호증_동춘동199_일반건축물대장.pdf"
    if p22.is_file():
        out.append(("갑2-2", p22))
    # 준공식 분할 갑10-1~10-7은 아래 tree("갑10", …준공식/)에 포함됨(루트 갑제3-n 복사 루프 제거)
    # 4 지적·등부 PDF 및 폐쇄지적도
    for p in find_gab_glob("갑제4-1호증_지적*"):
        out.append(("갑4-1", p))
    for p in find_gab_glob("갑제4-2호증_지적*"):
        out.append(("갑4-2", p))
    for p in find_gab_glob("갑제4-3호증_지적*"):
        out.append(("갑4-3", p))
    # 5-1, 5-2 실시계획 인가고시
    for p in find_gab_glob("갑제5-1호증_인천*"):
        out.append(("갑5-1", p))
    for p in find_gab_glob("갑제5-2호증_인천*"):
        out.append(("갑5-2", p))
    # 6-1 건축과 회신
    for p in find_gab_glob("갑제6-1호증_건축*"):
        out.append(("갑6-1", p))
    # 8·9 동영상: 갑 제6-2호증(구명 갑제6-2증_…통합.mp4 호환)
    _merge_mp4 = GAB / "갑제6-2호증_건축과_도로·통행_동영상(건축과-25898).mp4"
    if not _merge_mp4.is_file():
        _merge_mp4 = GAB / "갑제6-2호증_건축과_도로·통행(건축과-25898)_동영상.mp4"
    if not _merge_mp4.is_file():
        _merge_mp4 = GAB / "갑제6-2증_건축과_도로·통행(건축과-25898)_동영상_통합.mp4"
    p7v = GAB / "갑호증_동춘동198_항공사진.mp4"
    if not p7v.is_file():
        p7v = GAB / "영상_동춘동198_항공사진.mp4"
    if not p7v.is_file() and _merge_mp4.is_file():
        p7v = _merge_mp4
    if not p7v.is_file():
        cands = [p for p in GAB.glob("*.mp4") if p.is_file() and p.stat().st_size < 300 * 1024 * 1024]
        p7v = min(cands, key=lambda p: p.stat().st_size) if cands else p7v
    if p7v.is_file():
        out.append(("갑8", p7v))
    for p in find_gab_glob("갑제8-1호증_항공사진_QR*"):
        out.append(("갑8", p))
    for p in find_gab_glob("QR_갑제8-1호증*"):
        out.append(("갑8", p))
    for p in find_gab_glob("갑제8-2호증_항공사진*.pdf"):
        out.append(("갑8", p))
    # 7-1, 7-2 공원녹지 (실제 폴더 내 파일명 접두; 호증 번호 재배치 시 파일명도 맞출 것)
    for p in find_gab_glob("갑제7-1호증*"):
        out.append(("갑7-1", p))
    for p in find_gab_glob("갑제7-2호증*"):
        out.append(("갑7-2", p))
    p8v = GAB / "갑호증_동춘동198_위법행정.mp4"
    if not p8v.is_file():
        p8v = GAB / "영상_동춘동198_위법행정.mp4"
    if not p8v.is_file() and _merge_mp4.is_file():
        p8v = _merge_mp4
    if not p8v.is_file():
        big = [p for p in GAB.glob("*.mp4") if p.is_file() and p.stat().st_size >= 300 * 1024 * 1024]
        p8v = max(big, key=lambda p: p.stat().st_size) if big else p8v
    if p8v.is_file():
        out.append(("갑9", p8v))
    for p in find_gab_glob("갑제9-1호증_위법행정_QR*"):
        out.append(("갑9", p))
    for p in find_gab_glob("갑제9-2호증_위법한*"):
        out.append(("갑9", p))
    tree("갑10", GAB / "갑제10호증_객관적공법외관(준공식)")
    tree("갑15", GAB / "첨부(갑제1호증)_연수택지개발사업(맹지배경)")
    p73g = GAB / "갑제7-3호증_주위토지통행권 민원회신(공원녹지과-8032).jpg"
    if p73g.is_file():
        out.append(("갑7-3", p73g))
    tree("갑7-3", GAB / "갑제7-3호증_현장_통행관련")
    tree("갑12", GAB / "갑제12호증_20190724_주민설명회_농원근린공원")
    tree("갑12", find_jumin_folder())
    for sub in (
        "갑제13호증_연수구의회_225회",
        "갑제13호증_연수구의회_제225회",
        "첨부(갑제9호증)_2019년 225회 연수구의회(주민청원)",
    ):
        tree("갑13", GAB / sub)
    for p in sorted(GAB.glob("갑제13-*호증_제225회*")):
        if p.is_file():
            out.append(("갑13", p))
    tree("갑2보충", GAB / "첨부(갑제2호증)_동춘동 950-3_통행관련(동춘동 198, 199 외)")
    tree("갑5시도", GAB / "첨부(갑제5호증)_농원근린공원(고시 및 총괄 지형도면)")
    tree("갑5시도", GAB / "갑제5호증_농원근린공원(고시 및 총괄 지형도면)")
    tree("갑10첨부", GAB / "첨부(갑제10호증)_2026년 농원근린공원 준공식(객관적공법외관)")

    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="복사 대상 폴더")
    args = ap.parse_args()
    dest: Path = args.dest

    entries = collect_tagged_files()
    seen_hash: dict[str, Path] = {}
    log: list[str] = [
        f"대상 소스 항목(파일 단위): {len(entries)}",
        f"출력: {dest}",
        "",
    ]
    n_copy = 0
    seq = 0

    for tag, src in entries:
        if not src.is_file():
            log.append(f"MISSING(not file)\t{tag}\t{src}")
            continue
        h = sha256_file(src)
        if h is None:
            rel = src.relative_to(_REPO) if src.is_relative_to(_REPO) else src
            log.append(f"LARGE_NO_HASH\t{tag}\t{rel}\t(size {src.stat().st_size})")
            seq += 1
            name = f"{seq:03d}_{tag}__{safe_dest_name(src.name)}"
            if not args.dry_run:
                dest.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest / name)
            n_copy += 1
            continue
        if h in seen_hash:
            keeper = seen_hash[h]
            log.append(f"DUP_SKIP\t{tag}\t{src}\t==\t{keeper}")
            continue
        seen_hash[h] = src
        seq += 1
        name = f"{seq:03d}_{tag}__{safe_dest_name(src.name)}"
        log.append(f"COPY\t{tag}\t{name}\t<-\t{src}")
        if not args.dry_run:
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest / name)
        n_copy += 1

    log.append("")
    log.append(f"복사(또는 대형 1건씩 복사) 건수: {n_copy}")
    log.append(f"고유 SHA256 수: {len(seen_hash)}")

    logf = Path(__file__).resolve().parent / "copy_evidence_from_petition.log.txt"
    logf.write_text("\n".join(log), encoding="utf-8")
    print("\n".join(log[:30]))
    if len(log) > 30:
        print(f"... 외 {len(log) - 30}줄 → {logf}")
    print(f"로그: {logf}")
    print(f"완료: {n_copy}건 ({'드라이런' if args.dry_run else '복사'})")


if __name__ == "__main__":
    main()
