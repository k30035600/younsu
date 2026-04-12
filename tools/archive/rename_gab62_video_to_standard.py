# -*- coding: utf-8 -*-
"""갑호증 루트에서 구명 MP4를 표준 파일명으로 바꿉니다.

  구: 갑제6-2증_건축과_도로·통행(건축과-25898)_동영상_통합.mp4
  신: 갑제5-2호증_건축과_도로·통행_동영상(건축과-25898).mp4

신 파일이 이미 있으면 아무 것도 하지 않습니다.
"""
from __future__ import annotations

from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
GAB = _REPO / "행정심판청구(제출용)" / "최종" / "갑호증"
OLD = "갑제6-2증_건축과_도로·통행(건축과-25898)_동영상_통합.mp4"
NEW = "갑제5-2호증_건축과_도로·통행_동영상(건축과-25898).mp4"


def main() -> None:
    b = GAB / NEW
    if b.is_file():
        print(f"건너뜀(신 파일 이미 있음): {b}")
        return
    mid = "갑제5-2호증_건축과_도로·통행(건축과-25898)_동영상.mp4"
    for name in (OLD, mid):
        a = GAB / name
        if a.is_file():
            a.rename(b)
            print(f"OK: {name} → {NEW}")
            return
    print(f"건너뜀(구 파일 없음): {OLD} 또는 {mid}")


if __name__ == "__main__":
    main()
