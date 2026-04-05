# -*- coding: utf-8 -*-
"""DOCX 파일을 PDF로 변환한다. Microsoft Word(docx2pdf) 또는 LibreOffice(soffice)."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

# Word PDF보내기 형식
_WD_EXPORT_FORMAT_PDF = 17


def _convert_docx_via_word_com(docx_path: Path, pdf_path: Path, errs: list[str]) -> bool:
    """Word COM(ExportAsFixedFormat). pywin32는 키워드 인자 매핑이 불안정해 위치 인자만 사용."""
    try:
        import win32com.client  # type: ignore[import-untyped]
    except ImportError:
        return False
    word = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(str(docx_path), ReadOnly=True)
        try:
            doc.ExportAsFixedFormat(str(pdf_path), _WD_EXPORT_FORMAT_PDF)
        finally:
            doc.Close(False)
        return pdf_path.is_file() and pdf_path.stat().st_size > 0
    except Exception as e:
        errs.append(f"Word COM: {e}")
        return False
    finally:
        if word is not None:
            try:
                word.Quit()
            except Exception:
                pass


def _soffice_candidates() -> list[Path]:
    out: list[Path] = []
    for base in (
        Path(r"C:\Program Files\LibreOffice\program\soffice.exe"),
        Path(r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"),
    ):
        if base.is_file():
            out.append(base)
    w = shutil.which("soffice")
    if w:
        out.append(Path(w))
    return out


def convert_docx_to_pdf(docx_path: Path, pdf_path: Path) -> None:
    docx_path = docx_path.resolve()
    pdf_path = pdf_path.resolve()
    if not docx_path.is_file():
        raise FileNotFoundError(str(docx_path))
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    errs: list[str] = []

    # Windows: Word COM이 동작하면 docx2pdf(진행 표시줄·Open.SaveAs 오류)보다 안정적
    if sys.platform == "win32" and _convert_docx_via_word_com(docx_path, pdf_path, errs):
        return

    try:
        from docx2pdf import convert  # type: ignore[import-untyped]

        convert(str(docx_path), str(pdf_path))
        if pdf_path.is_file() and pdf_path.stat().st_size > 0:
            return
        errs.append("docx2pdf: 출력 PDF가 비어 있거나 생성되지 않음")
    except ImportError:
        errs.append("docx2pdf 미설치: pip install docx2pdf (Microsoft Word 필요)")
    except Exception as e:
        errs.append(f"docx2pdf: {e}")

    if sys.platform != "win32" and _convert_docx_via_word_com(docx_path, pdf_path, errs):
        return

    for soffice in _soffice_candidates():
        outdir = pdf_path.parent
        try:
            r = subprocess.run(
                [
                    str(soffice),
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(outdir),
                    str(docx_path),
                ],
                capture_output=True,
                text=True,
                timeout=180,
            )
        except (OSError, subprocess.TimeoutExpired) as e:
            errs.append(f"LibreOffice {soffice}: {e}")
            continue
        produced = outdir / (docx_path.stem + ".pdf")
        if r.returncode == 0 and produced.is_file() and produced.stat().st_size > 0:
            if produced.resolve() != pdf_path.resolve():
                produced.replace(pdf_path)
            return
        errs.append(f"LibreOffice exit {r.returncode}: {(r.stderr or r.stdout or '').strip()[:200]}")

    msg = (
        "DOCX→PDF 변환 실패.\n"
        "  - Windows: Microsoft Word 설치 후 `pip install docx2pdf`\n"
        "  - 또는 LibreOffice 설치(https://www.libreoffice.org/)\n"
        "상세: " + "; ".join(errs)
    )
    print(msg, file=sys.stderr)
    raise RuntimeError(msg)
