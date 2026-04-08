# -*- coding: utf-8 -*-
"""Tesseract + pytesseract — 한글(kor)·영어(eng).

- 엔진: 기본 `C:\\Program Files\\Tesseract-OCR\\tesseract.exe` (환경변수 TESSERACT_CMD 로 덮어쓰기)
- tessdata: `tools/tesseract-user-tessdata/` (kor.traineddata + eng.traineddata)
  시스템 `Program Files\\Tesseract-OCR\\tessdata` 에 쓰기 권한이 있으면 kor 만 복사해도 됨.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_TOOLS = Path(__file__).resolve().parent
_USER_TESSDATA = _TOOLS / "tesseract-user-tessdata"


def configure_pytesseract() -> None:
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = os.environ.get(
        "TESSERACT_CMD",
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    )


def tessdata_config_arg() -> str:
    d = _USER_TESSDATA.resolve()
    if not d.is_dir():
        raise FileNotFoundError(f"tessdata 폴더 없음: {d}")
    # 따옴표 없이 전달(Windows에서 `"경로"/kor.traineddata` 로 깨지는 것 방지)
    return f"--tessdata-dir {d.as_posix()}"


def ocr_image(path: str | Path, *, lang: str = "kor+eng") -> str:
    from PIL import Image
    import pytesseract

    configure_pytesseract()
    p = Path(path)
    cfg = tessdata_config_arg()
    return pytesseract.image_to_string(Image.open(p), lang=lang, config=cfg)


def main() -> int:
    if len(sys.argv) < 2:
        print("사용: python tools/tesseract_ocr.py <이미지경로>", file=sys.stderr)
        return 2
    text = ocr_image(sys.argv[1])
    sys.stdout.reconfigure(encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
