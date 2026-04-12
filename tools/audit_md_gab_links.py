#!/usr/bin/env python3
"""
MD 소스 파일에서 갑호증 링크 전수조사 → HTML 보고서 생성.

검사 항목:
  A. 링크가 달렸지만 portal-data.json에서 해소되지 않는 경우 (잘못된 연결)
  B. 갑호증 텍스트가 있으나 링크가 없는 경우 (누락 링크)
  C. portal-data.json에 등록되어 있으나 어느 MD에서도 인용하지 않는 경우 (미인용)
  D. portal-data.json gabFileRange.rels의 디스크 파일 부재 (파일 누락)
"""
import json, re, os, html as ht
from pathlib import Path
from collections import defaultdict

ROOT = Path(r"d:\OneDrive\Cursor\younsu")
SOURCE = ROOT / "web" / "commission-portal" / "public" / "source"
PORTAL = ROOT / "web" / "commission-portal" / "public" / "data" / "portal-data.json"
DISK   = ROOT / "행정심판청구(제출용)"
OUT    = ROOT / "web" / "commission-portal" / "public" / "helpme.html"

MD_FILES = [
    "행정심판청구.md",
    "집행정지신청.md",
    "별지_갑1호증.md",
    "별지_갑2호증.md",
    "별지_갑3호증.md",
    "별지_갑4호증.md",
]

def load_portal():
    with open(PORTAL, encoding="utf-8") as f:
        return json.load(f)

def build_valid_keys(portal):
    """portal-data.json의 evidence 배열에서 해소 가능한 모든 key를 수집."""
    keys = set()
    for ev in portal["evidence"]:
        keys.add(ev["num"])
        rng = ev.get("gabFileRange")
        if rng and "labels" in rng:
            for lab in rng["labels"]:
                m = re.search(r"제\s*(\d+(?:-\d+)?)\s*호증", lab)
                if m:
                    keys.add(m.group(1))
    return keys

def extract_from_md(md_path):
    """한 MD에서 (line, col, text, link_target_or_None) 목록 반환."""
    text = md_path.read_text(encoding="utf-8")
    results = []
    linked_re  = re.compile(r'\[([^\]]*갑\s*제\s*[\d]+-?\d*호증[^\]]*)\]\(#([^)]+)\)')
    bare_re    = re.compile(r'갑\s*제\s*(\d+(?:-\d+)?)\s*호증')
    for ln_no, line in enumerate(text.splitlines(), 1):
        linked_spans = set()
        for m in linked_re.finditer(line):
            link_text = m.group(1)
            target = m.group(2)
            nums = [mm.group(1) for mm in re.finditer(r'제\s*(\d+(?:-\d+)?)\s*호증', link_text)]
            for n in nums:
                results.append((ln_no, m.start(), link_text.strip(), target, n, "linked"))
            linked_spans.add((m.start(), m.end()))
        for m in bare_re.finditer(line):
            if any(s <= m.start() < e for s, e in linked_spans):
                continue
            num = m.group(1)
            ctx_start = max(0, m.start() - 10)
            ctx_end   = min(len(line), m.end() + 15)
            ctx = line[ctx_start:ctx_end].strip()
            results.append((ln_no, m.start(), ctx, None, num, "bare"))
    return results

def check_disk_rels(portal):
    """portal-data.json의 gabFileRange.rels가 디스크에 존재하는지 확인."""
    issues = []
    for ev in portal["evidence"]:
        rng = ev.get("gabFileRange")
        if not rng:
            continue
        for rel in rng.get("rels", []):
            full = DISK / rel
            if not full.exists():
                issues.append((ev["num"], ev.get("gab", ""), rel))
    return issues

def generate_html(errors_a, errors_b, errors_c, errors_d):
    rows_a, rows_b, rows_c, rows_d = "", "", "", ""

    for e in errors_a:
        rows_a += f"""<tr>
  <td>{ht.escape(e['file'])}</td><td>{e['line']}</td>
  <td><code>#{ht.escape(e['target'])}</code></td>
  <td>{ht.escape(e['num'])}</td>
  <td>{ht.escape(e['context'][:80])}</td>
  <td>{ht.escape(e['reason'])}</td>
</tr>\n"""

    for e in errors_b:
        rows_b += f"""<tr>
  <td>{ht.escape(e['file'])}</td><td>{e['line']}</td>
  <td>{ht.escape(e['num'])}</td>
  <td>{ht.escape(e['context'][:80])}</td>
</tr>\n"""

    for e in errors_c:
        rows_c += f"""<tr>
  <td>{ht.escape(e['num'])}</td><td>{ht.escape(e['gab'])}</td>
</tr>\n"""

    for e in errors_d:
        rows_d += f"""<tr>
  <td>{ht.escape(e['num'])}</td><td>{ht.escape(e['gab'])}</td>
  <td style="word-break:break-all">{ht.escape(e['rel'])}</td>
</tr>\n"""

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>갑호증 링크 전수조사 보고서</title>
<style>
  body {{ font-family: 'Pretendard','Noto Sans KR',sans-serif; margin:2rem; color:#1e293b; }}
  h1 {{ font-size:1.5rem; border-bottom:2px solid #334155; padding-bottom:.4rem; }}
  h2 {{ font-size:1.15rem; margin-top:2rem; color:#0f172a; }}
  .badge {{ display:inline-block; padding:2px 8px; border-radius:4px; font-size:.85rem; font-weight:600; }}
  .err {{ background:#fee2e2; color:#991b1b; }}
  .warn {{ background:#fef3c7; color:#92400e; }}
  .info {{ background:#dbeafe; color:#1e40af; }}
  .ok  {{ background:#d1fae5; color:#065f46; }}
  table {{ border-collapse:collapse; width:100%; margin-top:.5rem; font-size:.9rem; }}
  th,td {{ border:1px solid #cbd5e1; padding:6px 8px; text-align:left; vertical-align:top; }}
  th {{ background:#f1f5f9; font-weight:600; position:sticky; top:0; }}
  tr:nth-child(even) {{ background:#f8fafc; }}
  code {{ background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:.85em; }}
  .summary {{ display:flex; gap:1.5rem; margin:1rem 0; }}
  .summary div {{ padding:.5rem 1rem; border-radius:6px; }}
  .ts {{ color:#64748b; font-size:.85rem; margin-top:2rem; }}
</style>
</head>
<body>
<h1>갑호증 링크 전수조사 보고서</h1>
<div class="summary">
  <div class="{'err' if errors_a else 'ok'}">(A) 잘못된 링크: <b>{len(errors_a)}</b></div>
  <div class="{'warn' if errors_b else 'ok'}">(B) 링크 누락: <b>{len(errors_b)}</b></div>
  <div class="{'info' if errors_c else 'ok'}">(C) 미인용 증거: <b>{len(errors_c)}</b></div>
  <div class="{'err' if errors_d else 'ok'}">(D) 디스크 파일 부재: <b>{len(errors_d)}</b></div>
</div>

<h2><span class="badge err">A</span> 잘못된 링크 — portal-data.json에서 해소 불가</h2>
<p>MD에 <code>[갑 제N호증](#target)</code> 형태의 링크가 있으나, <code>#target</code>이 portal-data.json evidence에 매핑되지 않거나 링크 텍스트의 번호와 target이 불일치하는 경우.</p>
{'<p style="color:#065f46;font-weight:600">해당 없음 ✔</p>' if not errors_a else ''}
<table{'  style="display:none"' if not errors_a else ''}>
<tr><th>파일</th><th>줄</th><th>링크 target</th><th>갑호증 번호</th><th>문맥</th><th>사유</th></tr>
{rows_a}</table>

<h2><span class="badge warn">B</span> 링크 누락 — 갑호증 텍스트만 있고 링크 없음</h2>
<p>MD 본문에 <code>갑 제N호증</code> 텍스트가 있으나 <code>[…](#…)</code> 마크다운 링크가 아닌 경우. 의도적 비링크는 무시 가능.</p>
{'<p style="color:#065f46;font-weight:600">해당 없음 ✔</p>' if not errors_b else ''}
<table{'  style="display:none"' if not errors_b else ''}>
<tr><th>파일</th><th>줄</th><th>번호</th><th>문맥</th></tr>
{rows_b}</table>

<h2><span class="badge info">C</span> 미인용 증거 — portal-data.json에 있으나 MD에서 인용하지 않음</h2>
<p>portal-data.json evidence 항목 중 어느 MD 소스에서도 <code>#N</code> 링크로 인용하지 않는 항목. 번들(gabBundlePrimaryKey)은 부번으로 인용될 수 있으므로 참고 수준.</p>
{'<p style="color:#065f46;font-weight:600">해당 없음 ✔</p>' if not errors_c else ''}
<table{'  style="display:none"' if not errors_c else ''}>
<tr><th>num</th><th>gab</th></tr>
{rows_c}</table>

<h2><span class="badge err">D</span> 디스크 파일 부재 — gabFileRange.rels 경로가 디스크에 없음</h2>
<p>portal-data.json의 <code>gabFileRange.rels</code>에 기재된 파일이 <code>행정심판청구(제출용)/</code> 하위에 존재하지 않는 경우.</p>
{'<p style="color:#065f46;font-weight:600">해당 없음 ✔</p>' if not errors_d else ''}
<table{'  style="display:none"' if not errors_d else ''}>
<tr><th>num</th><th>gab</th><th>rel 경로</th></tr>
{rows_d}</table>

<p class="ts">생성: audit_md_gab_links.py</p>
</body>
</html>"""

def main():
    portal = load_portal()
    valid_keys = build_valid_keys(portal)

    all_linked_targets = set()
    errors_a = []
    errors_b = []

    for md_name in MD_FILES:
        md_path = SOURCE / md_name
        if not md_path.exists():
            continue
        refs = extract_from_md(md_path)
        for ln, col, ctx, target, num, kind in refs:
            if kind == "linked":
                all_linked_targets.add(target)
                if target not in valid_keys:
                    errors_a.append({
                        "file": md_name, "line": ln, "target": target,
                        "num": num, "context": ctx,
                        "reason": f"#{target} → evidence에 num 없음"
                    })
                if num != target:
                    parts = target.split("-")
                    num_parts = num.split("-")
                    if num_parts[0] != parts[0]:
                        errors_a.append({
                            "file": md_name, "line": ln, "target": target,
                            "num": num, "context": ctx,
                            "reason": f"텍스트 번호({num})와 target({target}) 주호증 불일치"
                        })
            else:
                errors_b.append({
                    "file": md_name, "line": ln,
                    "num": num, "context": ctx,
                })

    all_cited_nums = set()
    for md_name in MD_FILES:
        md_path = SOURCE / md_name
        if not md_path.exists():
            continue
        text = md_path.read_text(encoding="utf-8")
        for m in re.finditer(r'\(#(\d+(?:-\d+)?)\)', text):
            all_cited_nums.add(m.group(1))

    errors_c = []
    for ev in portal["evidence"]:
        num = ev["num"]
        if num in all_cited_nums:
            continue
        bpk = ev.get("gabBundlePrimaryKey")
        if bpk and bpk in all_cited_nums:
            continue
        rng = ev.get("gabFileRange")
        if rng and "labels" in rng:
            lab_nums = set()
            for lab in rng["labels"]:
                mm = re.search(r"제\s*(\d+(?:-\d+)?)\s*호증", lab)
                if mm:
                    lab_nums.add(mm.group(1))
            if lab_nums & all_cited_nums:
                continue
        errors_c.append({"num": num, "gab": ev.get("gab", "")})

    disk_issues = check_disk_rels(portal)
    errors_d = [{"num": n, "gab": g, "rel": r} for n, g, r in disk_issues]

    report = generate_html(errors_a, errors_b, errors_c, errors_d)
    OUT.write_text(report, encoding="utf-8")
    print(f"보고서 생성: {OUT}")
    print(f"  (A) 잘못된 링크: {len(errors_a)}")
    print(f"  (B) 링크 누락:   {len(errors_b)}")
    print(f"  (C) 미인용 증거: {len(errors_c)}")
    print(f"  (D) 파일 부재:   {len(errors_d)}")

if __name__ == "__main__":
    main()
