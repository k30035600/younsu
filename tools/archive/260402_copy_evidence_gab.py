# -*- coding: utf-8 -*-
"""돌심방자료 등에서 행정심판 갑호증 예정 자료를 갑호증로 복사·표준 파일명 부여.

원칙: `돌심방자료`에 있는 단일본은 이동·삭제하지 않고 `shutil.copy2` / `copytree` 로 `갑호증`에 사본만 만듭니다.
반대로 원본이 `갑호증`·`판례모음`에만 있으면 먼저 `돌심방자료`에 원본을 두고, 위 폴더에는 복사본만 둡니다(`돌심방자료/분류기준.txt` 참고).

실행(과거 일회성·보관본):
  python tools/archive/260402_copy_evidence_gab.py
"""
from __future__ import annotations

import shutil
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
BASE = _REPO / "행정심판청구(증거)"
SRC_PHOTOS = _REPO / "돌심방자료"
DEST = BASE / "갑호증"
LOG: list[str] = []


def copy_one(src: Path, dest_rel: str) -> bool:
    if not src.is_file():
        LOG.append(f"SKIP(없음): {dest_rel} <- {src}")
        return False
    dest = DEST / dest_rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    LOG.append(f"OK: {dest_rel}")
    return True


def copy_dir_tree(src_dir: Path, dest_sub: str) -> None:
    if not src_dir.is_dir():
        LOG.append(f"SKIP DIR: {src_dir}")
        return
    out = DEST / dest_sub
    if out.exists():
        shutil.rmtree(out, ignore_errors=True)
        if out.exists():
            try:
                out.rmdir()
            except OSError:
                bak = out.with_name(out.name + "._bak_remove")
                if bak.exists():
                    shutil.rmtree(bak, ignore_errors=True)
                try:
                    out.rename(bak)
                except OSError as e:
                    LOG.append(f"FAIL DIR replace {dest_sub}: {e}")
                    return
    shutil.copytree(src_dir, out)
    n = sum(1 for _ in out.rglob("*") if _.is_file())
    LOG.append(f"OK DIR: {dest_sub} ({n} files)")


def find_file(root: Path, predicate) -> Path | None:
    for p in root.rglob("*"):
        if p.is_file() and predicate(p):
            return p
    return None


def find_dir(root: Path, predicate) -> Path | None:
    for p in root.rglob("*"):
        if p.is_dir() and predicate(p):
            return p
    return None


def find_files(root: Path, predicate, limit: int = 500) -> list[Path]:
    out: list[Path] = []
    for p in root.rglob("*"):
        if p.is_file() and predicate(p):
            out.append(p)
            if len(out) >= limit:
                break
    return out


def main() -> None:
    if not SRC_PHOTOS.is_dir():
        raise SystemExit(f"원본 없음: {SRC_PHOTOS}")

    DEST.mkdir(parents=True, exist_ok=True)

    prep_dir = find_dir(
        SRC_PHOTOS,
        lambda p: "준비서면" in p.name and ("2024구합" in str(p) or "54502" in str(p)),
    )

    # 구소송 준비서면(돌심방 단일본) → 갑5·6·6-1 루트 복사만. 부록 폴더는 두지 않음(원본은 돌심방).
    buk = prep_dir
    if buk and buk.is_dir():
        for srcn, dstn in (
            (
                "갑 제28호증_도시계획도로 개설 요청 만원회신(건축과-25898).pdf",
                "갑제4호증_건축과_도로·통행_회신(건축과-25898).pdf",
            ),
            (
                "갑 제20호증_연수구 공원녹지과(2AA-2405-1092919).pdf",
                "갑제5호증_공원녹지과_민원회신(2AA-2405-1092919).pdf",
            ),
            (
                "갑 제18호증_민원회신(접수번호 33589)[농원근린공원 건축법상 진출입로 점용관련.pdf",
                "갑제5-1호증_공원녹지_진출입로점용_민원회신(33589).pdf",
            ),
        ):
            s = buk / srcn
            if s.is_file():
                shutil.copy2(s, DEST / dstn)
                LOG.append(f"OK(준비서면→루트): {dstn}")

    # 갑 1
    p1 = find_file(
        SRC_PHOTOS,
        lambda p: "1966" in p.name
        and ("항공" in p.name or "동춘" in p.name)
        and p.suffix.lower() in (".jpg", ".jpeg", ".pdf"),
    )
    if p1:
        copy_one(p1, f"갑제1-1호증_1966년_항공사진{p1.suffix.lower()}")

    # 갑 2-1, 2-2
    p21 = find_file(
        SRC_PHOTOS,
        lambda p: "199" in p.name
        and ("건축물관리대장" in p.name or "건축물대장" in p.name)
        and "폐쇄" in p.name
        and p.suffix.lower() in (".jpg", ".jpeg", ".pdf"),
    )
    if p21:
        copy_one(p21, f"갑제2-1호증_동춘동199_건축물관리대장(폐쇄){p21.suffix.lower()}")

    p22 = find_file(
        SRC_PHOTOS,
        lambda p: "199" in p.name and "일반건축물대장" in p.name and p.suffix.lower() == ".pdf",
    )
    if p22:
        copy_one(p22, "갑제2-2호증_동춘동199_일반건축물대장.pdf")

    # 갑 3
    p3 = find_file(
        SRC_PHOTOS,
        lambda p: "198" in p.name
        and ("지적" in p.name or "등부" in p.name)
        and p.suffix.lower() in (".jpg", ".pdf"),
    )
    if p3:
        copy_one(p3, f"갑제3호증_지적_등부_관련{p3.suffix.lower()}")

    # 갑 4-1, 4-2
    p41 = find_file(SRC_PHOTOS, lambda p: "2020-233" in p.name.replace(" ", "") and p.suffix.lower() == ".pdf")
    if p41:
        copy_one(p41, "갑제3-1호증_인천시_실시계획인가고시_제2020-233호(당초).pdf")

    p42 = find_file(SRC_PHOTOS, lambda p: "2022-18" in p.name.replace(" ", "") and p.suffix.lower() == ".pdf")
    if p42:
        copy_one(p42, "갑제3-2호증_인천시_실시계획인가고시_제2022-18호(변경).pdf")

    # 갑 7, 8 동영상 (폴더명이 환경마다 달라 DJI_0197_HD_01 위치로도 탐색)
    vdir = find_dir(SRC_PHOTOS, lambda p: "드론" in p.name and "돌심" in p.name)
    if not vdir:
        h01 = find_file(SRC_PHOTOS, lambda p: p.name == "DJI_0197_HD_01.mp4")
        if h01:
            vdir = h01.parent
    if vdir:
        v7 = vdir / "DJI_0197_HD_01.mp4"
        if not v7.is_file():
            cand = list(vdir.glob("DJI_0197*.mp4"))
            v7 = cand[0] if cand else None
        if v7 and isinstance(v7, Path) and v7.is_file():
            copy_one(v7, "갑호증_동춘동198_항공사진.mp4")
        v8 = vdir / "DJI_0197_HD_02.mp4"
        if not v8.is_file():
            v8 = vdir / "DJI_0197.MP4"
        if v8.is_file():
            copy_one(v8, "갑호증_동춘동198_위법행정.mp4")

    # 갑8 PDF·QR(루트) — 돌심 동영상 폴더·소송첨부 등에 분산
    p8pdf = find_file(
        SRC_PHOTOS,
        lambda p: p.suffix.lower() == ".pdf"
        and "1947" in p.name
        and "2023" in p.name
        and ("동춘" in p.name or "198" in p.name or "항공" in p.name),
    )
    if p8pdf:
        copy_one(p8pdf, "갑제7-2호증_항공사진(1947~2023) 증거자료.pdf")
    for p in sorted({q for q in SRC_PHOTOS.rglob("QR_갑제*.png") if q.is_file()}):
        copy_one(p, p.name)

    p9w = find_file(
        SRC_PHOTOS,
        lambda p: p.suffix.lower() == ".pdf"
        and ("위법한선행행정" in p.name.replace(" ", "") or "위법한 선행" in p.name),
    )
    if not p9w:
        p9w = find_file(
            SRC_PHOTOS,
            lambda p: p.suffix.lower() == ".pdf"
            and "위법" in p.name
            and ("선행행정" in p.name or "선행 행정" in p.name)
            and "198" in p.name,
        )
    if p9w:
        copy_one(p9w, "갑제8-2호증_위법한 선행행정행위 증거자료.pdf")

    # 갑14 연수택지·맹지 배경 등 대량 자료는 과거 별도 통합 스크립트로 처리(저장소 미보관)

    # 갑 10 현장 (대표) — 구 갑11
    n10 = 0
    for p in find_files(
        SRC_PHOTOS,
        lambda x: x.suffix.lower() in (".jpg", ".jpeg", ".png")
        and ("950" in x.name or "198" in x.name or "통행" in x.name),
        limit=45,
    ):
        if copy_one(p, f"갑제9호증_현장_통행관련/{n10:02d}_{p.name[:90]}"):
            n10 += 1

    # 갑 제11호증 주민설명회(청구서 번호와 일치)
    d12 = find_dir(
        SRC_PHOTOS,
        lambda p: "_190724" in p.name and "주민설명회" in p.name and "농원" in p.name,
    )
    if d12:
        copy_dir_tree(d12, "갑제11호증_20190724_주민설명회_농원근린공원")

    # 갑 제12호증 연수구의회 225회(청구서 번호와 일치)
    for pat, sub in [
        ("190724_연수구의회 제8대 제225회 자치도시", "01_자치도시위원회_회의록"),
        ("190725_연수구의회 제8대 제225회 본회의", "02_본회의_회의록"),
        ("190725_연수구의회 제8대 제225회 본회의 심사보고서", "03_심사보고서"),
        ("191025_연수구의회의장", "04_의장_의견서"),
    ]:
        hit = find_file(SRC_PHOTOS, lambda p, pat=pat: pat in p.name)
        if hit:
            copy_one(hit, f"갑제12호증_연수구의회_225회/{sub}{hit.suffix.lower()}")

    p35 = find_file(SRC_PHOTOS, lambda p: "갑" in p.name and "35" in p.name and "호증" in p.name)
    if p35:
        copy_one(p35, f"갑제12호증_연수구의회_225회/05_{p35.name}")

    for p in find_files(SRC_PHOTOS, lambda x: "갑 제36호증" in x.name, limit=10):
        copy_one(p, f"갑제12호증_연수구의회_225회/{p.name[:90]}")

    logf = Path(__file__).resolve().parent / "260402_copy_evidence_gab.log.txt"
    logf.write_text("\n".join(LOG), encoding="utf-8")
    print(f"완료: {DEST}")
    print(f"로그: {logf}")
    print(f"항목: {len(LOG)}")


if __name__ == "__main__":
    main()
