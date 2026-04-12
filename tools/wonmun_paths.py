# -*- coding: utf-8 -*-
"""행정심판청구(원본) 아래 제출 원문 MD — `제출원문(원본)/` 만 (레거시 `NNNNNN_md` 미사용).

폴더 이름은 `web/commission-portal/portal-work-paths.js`(wonmunDir, wonmunSubmitWonmun)와 동일하게 둔다.
포털 탭에 실제로 쓰는 경로는 `public/data/portal-data.json`의 `meta.tabSources`가 우선한다.
"""

from __future__ import annotations

from pathlib import Path

_SUBMIT_WONMUN = "제출원문(원본)"


def wonmun_root(repo: Path) -> Path:
    return repo / "행정심판청구(원본)"


def latest_yymmdd_md_under(wonmun_dir: Path) -> Path:
    """`행정심판청구(원본)/제출원문(원본)` 경로(폴더가 없어도 기대 경로를 반환)."""
    return wonmun_dir / _SUBMIT_WONMUN


def latest_yymmdd_md_dir(repo: Path) -> Path:
    """저장소 루트 기준 원문 MD 루트 — 항상 `…/제출원문(원본)`."""
    return latest_yymmdd_md_under(wonmun_root(repo))


def appeal_md_path(repo: Path) -> Path:
    return latest_yymmdd_md_dir(repo) / "행정심판청구서.md"
