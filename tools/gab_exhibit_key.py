# -*- coding: utf-8 -*-
"""갑호증 경로에서 논리 호증 번호(‘첨부’ 접두 제외)를 뽑는 보조.

제225회 연수구의회 청원 자료는 **갑 제13-1호증~갑 제13-4호증** 루트 파일명으로 표준화하였습니다(구 `첨부(갑제9호증)_…` 폴더 편철).
다른 `첨부(갑제N호증)_` 폴더는 **표시 번호와 폴더 접두 번호가 다를 수** 있으므로,
자동 대조 시에는 `행정심판청구(최종)/260405/260405_01_행정심판청구서.md` 증거 목록과 함께 확인합니다.
"""
from __future__ import annotations

import re
from pathlib import Path

# 폴더 또는 파일명 선두: 첨부(갑제12호증)_ / 첨부(갑제4-4호증)_
PAT_ATTACH_PAREN = re.compile(
    r"첨부\(갑제(\d+(?:-\d+)?)호증\)",
)


def extract_attach_gab_numbers(text: str) -> list[str]:
    """문자열에 등장하는 `첨부(갑제N호증)` 의 N 목록(중복 유지)."""
    return PAT_ATTACH_PAREN.findall(text)


def primary_folder_gab_key(folder_name: str) -> str | None:
    """하위폴더 1단계 이름에서 첨부(갑제N호증)_ 로 시작하면 N호증 키를 반환."""
    m = PAT_ATTACH_PAREN.match(folder_name)
    return m.group(1) if m else None


def describe_path_for_audit(rel: str) -> str:
    """전수조사 로그용: 상대경로 + (있으면) 첨부 괄호 안 호증번호."""
    parts: list[str] = [rel.replace("\\", "/")]
    p = Path(rel)
    k = primary_folder_gab_key(p.parts[0]) if p.parts else None
    if k:
        parts.append(f"[첨부접두=갑제{k}호증]")
    return " ".join(parts)
