# -*- coding: utf-8 -*-
"""Markdown → HTML → Edge/Chrome headless → PDF (pandoc 불필요).

- 본문: 검정, 양쪽 맞춤(inter-ideograph), 링크 파랑·밑줄
- 원본 MD 상단 `<style>` 블록이 있으면 `<head>`에 합침
- `<!-- ... -->`, 바깥 `<div class="doc-gongmun">` 래퍼는 변환 전 정리

필요:
  - `pip install markdown`
  - Windows: Microsoft Edge 또는 Google Chrome 설치

사용(저장소 루트):

  python tools/md_to_pdf.py --all
  python tools/md_to_pdf.py -i "행정심판청구(최종)/260405/260405_01_행정심판청구서.md"
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_DEFAULT_DIR = _REPO / "행정심판청구(최종)" / "260405"

_PRINT_CSS = """
@page { size: A4; margin: 22mm 18mm 24mm 18mm; }
html { font-size: 11pt; }
body {
  font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif;
  color: #000000;
  line-height: 1.55;
}
p, li, blockquote, td {
  text-align: justify;
  text-justify: inter-ideograph;
  color: #000000;
}
h1 { text-align: center; font-size: 18pt; margin: 0.6em 0 0.8em; }
h2 { font-size: 13pt; margin: 1em 0 0.4em; }
h3 { font-size: 12pt; margin: 0.9em 0 0.35em; }
a {
  color: #0000cc;
  text-decoration: underline;
}
img { max-width: 100%; height: auto; }
blockquote { margin: 0.6em 0; padding-left: 1em; border-left: 3px solid #ccc; }
"""


def _find_chromium() -> Path | None:
    candidates = [
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
        / "Microsoft"
        / "Edge"
        / "Application"
        / "msedge.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))
        / "Microsoft"
        / "Edge"
        / "Application"
        / "msedge.exe",
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
        / "Google"
        / "Chrome"
        / "Application"
        / "chrome.exe",
    ]
    for p in candidates:
        if p.is_file():
            return p
    return None


def _prepare_md_text(raw: str) -> tuple[str, str]:
    """추출한 <style> 내용(없으면 ''), 변환용으로 정리한 MD 본문."""
    styles: list[str] = []

    def grab_style(m: re.Match[str]) -> str:
        styles.append(m.group(1).strip())
        return ""

    s = re.sub(
        r"<style[^>]*>(.*?)</style>",
        grab_style,
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    s = re.sub(r"<!--.*?-->", "", s, flags=re.DOTALL)
    s = re.sub(r'<div\s+class="doc-gongmun"\s*>', "", s, flags=re.IGNORECASE)
    s = s.rstrip()
    if s.lower().endswith("</div>"):
        s = s[: -len("</div>")].rstrip()
    extra_css = "\n".join(styles) if styles else ""
    return extra_css, s.strip() + "\n"


def _md_to_html_fragment(md_body: str) -> str:
    try:
        import markdown
    except ImportError as e:
        raise SystemExit(
            "markdown 패키지가 필요합니다: pip install markdown"
        ) from e
    return markdown.markdown(
        md_body,
        extensions=[
            "extra",
            "tables",
            "sane_lists",
            "fenced_code",
            "nl2br",
        ],
        output_format="html5",
    )


def _build_full_html(extra_from_md: str, body_inner: str) -> str:
    head_css = _PRINT_CSS
    if extra_from_md:
        head_css += "\n/* --- from source MD <style> --- */\n" + extra_from_md
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>document</title>
<style type="text/css">
{head_css}
</style>
</head>
<body>
<div class="doc-gongmun">
{body_inner}
</div>
</body>
</html>
"""


def _html_to_pdf(html_path: Path, pdf_path: Path, browser: Path) -> None:
    html_path = html_path.resolve()
    pdf_path = pdf_path.resolve()
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    uri = html_path.as_uri()
    # Chromium: --no-pdf-header-footer = 날짜/파일명 머리·바닥 숨김
    if pdf_path.is_file():
        pdf_path.unlink(missing_ok=True)
    headless_flags = (["--headless=new"], ["--headless"])
    last_err = ""
    for hf in headless_flags:
        args = [
            str(browser),
            *hf,
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            uri,
        ]
        r = subprocess.run(
            args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
        if r.returncode == 0 and pdf_path.is_file() and pdf_path.stat().st_size > 0:
            return
        last_err = (r.stderr or r.stdout or "").strip() or f"exit {r.returncode}"
    raise RuntimeError(f"PDF 생성 실패: {last_err}")


def convert_md_to_pdf(md_path: Path, pdf_path: Path | None = None) -> Path:
    browser = _find_chromium()
    if browser is None:
        raise RuntimeError(
            "Edge 또는 Chrome 실행 파일을 찾지 못했습니다. "
            "기본 설치 경로(Program Files)를 확인하세요."
        )

    md_path = md_path.resolve()
    out = pdf_path or md_path.with_suffix(".pdf")
    out = out.resolve()

    raw = md_path.read_text(encoding="utf-8")
    extra_css, md_clean = _prepare_md_text(raw)
    inner = _md_to_html_fragment(md_clean)
    html_doc = _build_full_html(extra_css, inner)

    with tempfile.TemporaryDirectory() as td:
        html_file = Path(td) / "body.html"
        html_file.write_text(html_doc, encoding="utf-8")
        _html_to_pdf(html_file, out, browser)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="MD → PDF (Edge/Chrome headless)")
    ap.add_argument(
        "-i",
        "--input",
        type=Path,
        default=None,
        help="입력 .md",
    )
    ap.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="출력 .pdf (기본: 입력과 같은 경로·이름)",
    )
    ap.add_argument(
        "--dir",
        type=Path,
        default=_DEFAULT_DIR,
        help="--all 시 기준 폴더",
    )
    ap.add_argument(
        "--all",
        action="store_true",
        help="260405_01_행정심판청구서.md, 260405_02_집행정지신청서.md 를 PDF로",
    )
    args = ap.parse_args()

    if args.all:
        base = args.dir.resolve()
        pairs = [
            base / "260405_01_행정심판청구서.md",
            base / "260405_02_집행정지신청서.md",
        ]
        for md in pairs:
            if not md.is_file():
                print(f"건너뜀(없음): {md}", file=sys.stderr)
                continue
            try:
                outp = convert_md_to_pdf(md)
                print(f"작성: {outp.relative_to(_REPO)}")
            except Exception as e:
                print(f"오류 {md.name}: {e}", file=sys.stderr)
                return 1
        return 0

    if args.input is None:
        print("-i 또는 --all 을 지정하세요.", file=sys.stderr)
        return 1

    md_in = args.input
    if not md_in.is_absolute():
        md_in = (_REPO / md_in).resolve()
    pdf_out = args.output
    if pdf_out is not None and not pdf_out.is_absolute():
        pdf_out = (_REPO / pdf_out).resolve()

    try:
        outp = convert_md_to_pdf(md_in, pdf_out)
        print(f"작성: {outp.relative_to(_REPO)}")
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
