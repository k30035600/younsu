# -*- coding: utf-8 -*-
"""갑 제7-1·9-1호증용 QR PNG를 다시 만듭니다.

- **주 파일명**: `갑제7-1호증_항공사진_QR.png`, `갑제8-1호증_위법행정_QR.png`(청구서·감사 스크립트 기준).
- **보조본**: `QR_갑제7-1호증_항공사진.png`, `QR_갑제8-1호증_위법행정.png`(동일 링크).
- 기본 URL은 현재 `갑호증`에 있는 PNG를 OpenCV 등으로 읽었을 때와 동일한 유튜브 링크입니다.
- URL을 바꾸려면 `행정심판청구(제출용)/최종/갑호증/gab_qr_urls.txt`를 만들고 아래 형식으로 두 줄을 적습니다(선택).

    항공=https://youtu.be/...
    위법=https://youtu.be/...

의존성: `pip install "qrcode[pil]"`

실행: 프로젝트 루트(younsu)에서 `python tools/regenerate_gab_qr_png.py`
"""
from __future__ import annotations

import re
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
GAB = _REPO / "행정심판청구(제출용)" / "최종" / "갑호증"
CONFIG = GAB / "gab_qr_urls.txt"

DEFAULT = {
    "항공": "https://youtu.be/nrVMUoRzQ-Q",
    "위법": "https://youtu.be/LCyquvKKdCw",
}
# 각 키당 (주 파일, 보조 QR 파일) — 동일 이미지를 두 경로에 저장
OUT_PATHS: dict[str, tuple[Path, Path]] = {
    "항공": (
        GAB / "갑제7-1호증_항공사진_QR.png",
        GAB / "QR_갑제7-1호증_항공사진.png",
    ),
    "위법": (
        GAB / "갑제8-1호증_위법행정_QR.png",
        GAB / "QR_갑제8-1호증_위법행정.png",
    ),
}


def load_overrides() -> dict[str, str]:
    if not CONFIG.is_file():
        return {}
    text = CONFIG.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^(항공|위법)\s*=\s*(\S+)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def main() -> None:
    try:
        import qrcode
    except ImportError as e:
        raise SystemExit(
            'qrcode 패키지가 없습니다. `pip install "qrcode[pil]"` 후 다시 실행하세요.'
        ) from e

    urls = {**DEFAULT, **load_overrides()}
    GAB.mkdir(parents=True, exist_ok=True)
    for key, (primary, aux) in OUT_PATHS.items():
        url = urls[key]
        qr = qrcode.QRCode(version=None, box_size=8, border=2)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        img = img.resize((300, 300))
        for dest in (primary, aux):
            img.save(dest, format="PNG")
            print("OK", dest.name, "<-", url)


if __name__ == "__main__":
    main()
