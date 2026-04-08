# -*- coding: utf-8 -*-
"""gab_pdf_orientation_table.md → gab_pdf_orientation_table.html"""
from __future__ import annotations

import html
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MD = REPO / "tools" / "gab_pdf_orientation_table.md"
OUT = REPO / "tools" / "gab_pdf_orientation_table.html"


def parse_md_table(lines: list[str], start: int):
    """Return (header cells, body rows, next line index)."""
    if start >= len(lines) or not lines[start].strip().startswith("|"):
        return [], [], start
    header = [c.strip() for c in lines[start].strip().strip("|").split("|")]
    start += 1
    if start >= len(lines) or not re.match(r"^\|\s*[-:]+", lines[start]):
        return [], [], start
    start += 1
    rows = []
    while start < len(lines):
        line = lines[start].strip()
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        rows.append(cells)
        start += 1
    return header, rows, start


def table_to_html(header: list[str], rows: list[list[str]], caption: str) -> str:
    ths = "".join(f"<th scope='col'>{html.escape(h)}</th>" for h in header)
    trs = []
    for row in rows:
        cells = row + [""] * (len(header) - len(row))
        cells = cells[: len(header)]
        tds = []
        for i, c in enumerate(cells):
            esc = html.escape(c)
            if i == len(cells) - 1 and c in ("가로", "세로"):
                cls = "verdict-l" if c == "가로" else "verdict-p"
                tds.append(f"<td class='{cls}'>{esc}</td>")
            else:
                tds.append(f"<td>{esc}</td>")
        trs.append("<tr>" + "".join(tds) + "</tr>")
    cap = f"<caption>{html.escape(caption)}</caption>" if caption else ""
    return (
        f"<table>{cap}<thead><tr>{ths}</tr></thead><tbody>"
        + "".join(trs)
        + "</tbody></table>"
    )


def main() -> None:
    text = MD.read_text(encoding="utf-8")
    lines = text.splitlines()

    title = "갑호증·법령정보 PDF 전수 — 표시 방향(가로/세로) 검수표"
    intro_paras: list[str] = []
    bullets: list[str] = []

    i = 0
    if lines and lines[0].startswith("# "):
        title = lines[0][2:].strip()
        i = 1
    while i < len(lines):
        line = lines[i]
        if line.startswith("|"):
            break
        if line.startswith("## "):
            break
        if line.startswith("- "):
            bullets.append(line[2:].strip())
        elif line.strip() and not line.startswith("생성:"):
            intro_paras.append(line.strip())
        elif line.startswith("생성:"):
            intro_paras.append(line.strip().replace("`", ""))
        i += 1

    # skip empty
    while i < len(lines) and not lines[i].strip().startswith("|"):
        i += 1

    h1, rows1, i = parse_md_table(lines, i)
    # skip to second table
    while i < len(lines) and not lines[i].strip().startswith("##"):
        i += 1
    sec_title = ""
    if i < len(lines) and lines[i].startswith("## "):
        sec_title = lines[i][3:].strip()
        i += 1
    while i < len(lines) and not lines[i].strip().startswith("|"):
        i += 1
    h2, rows2, _ = parse_md_table(lines, i)

    ul = ""
    if bullets:
        lis = "".join(f"<li>{html.escape(b.replace('**', ''))}</li>" for b in bullets)
        ul = f"<ul>{lis}</ul>"

    intro_html = "".join(f"<p>{html.escape(p)}</p>" for p in intro_paras if p)

    css = """
    :root { --bg: #f1f5f9; --surface: #fff; --border: #cbd5e1; --text: #0f172a; --muted: #64748b; }
    * { box-sizing: border-box; }
    body { font-family: "Malgun Gothic", "맑은 고딕", sans-serif; margin: 0; padding: 1.5rem; background: var(--bg); color: var(--text); line-height: 1.55; }
    main { max-width: 1200px; margin: 0 auto; background: var(--surface); padding: 1.75rem 2rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    h1 { font-size: 1.35rem; margin: 0 0 1rem; border-bottom: 2px solid var(--border); padding-bottom: 0.65rem; }
    h2 { font-size: 1.1rem; margin: 2rem 0 0.75rem; color: #334155; }
    p, ul { font-size: 0.92rem; color: var(--muted); margin: 0.5rem 0; }
    ul { padding-left: 1.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin: 1rem 0; }
    caption { text-align: left; font-weight: 600; color: var(--text); margin-bottom: 0.5rem; }
    th, td { border: 1px solid var(--border); padding: 0.45rem 0.55rem; text-align: left; vertical-align: top; word-break: break-all; }
    thead th { background: #1e3a5f; color: #f8fafc; font-weight: 600; position: sticky; top: 0; z-index: 1; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr:hover { background: #eff6ff; }
    .verdict-l { font-weight: 600; color: #1d4ed8; background: #eff6ff !important; }
    .verdict-p { color: #475569; }
    @media print { body { background: #fff; } main { box-shadow: none; } thead th { background: #334155 !important; -webkit-print-color-adjust: exact; } }
    """

    t1 = table_to_html(h1, rows1, "전수 목록")
    t2 = table_to_html(h2, rows2, sec_title or "판정 근거")

    doc = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(title)}</title>
  <style>{css}</style>
</head>
<body>
  <main>
    <h1>{html.escape(title)}</h1>
    {intro_html}
    {ul}
    {t1}
    <h2>{html.escape(sec_title)}</h2>
    {t2}
  </main>
</body>
</html>
"""
    OUT.write_text(doc, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
