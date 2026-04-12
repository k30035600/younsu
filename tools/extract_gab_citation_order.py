# -*- coding: utf-8 -*-
"""청구서 본문에서 갑호증이 처음 등장하는 순서 추출(참고표용)."""
import re
from pathlib import Path


def extract_order(md_text: str) -> list[str]:
    marker = "**[증거자료 목록]**"
    if marker in md_text:
        body = md_text.split(marker)[0]
    else:
        body = md_text

    # 이전 실행으로 남은 「본문 인용 순서(참고)」 표는 추출에 포함하지 않음(자기 참조 방지)
    body = re.sub(
        r"(?ms)^### 본문 인용 순서\(참고\).*?^\n---\s*\n",
        "",
        body,
        count=1,
    )

    events: list[tuple[int, str]] = []

    for m in re.finditer(r"갑\s*제\s*(\d+(?:-\d+)?)\s*호증", body):
        events.append((m.start(), m.group(1)))

    # 청구 취지 등: 갑제10-1호증부터 (공백 없는 표기)
    for m in re.finditer(r"갑제(\d+(?:-\d+)?)호증", body):
        events.append((m.start(), m.group(1)))

    for m in re.finditer(r"갑\s*제\s*(\d+)\s*~\s*(\d+)\s*호증", body):
        a, b = int(m.group(1)), int(m.group(2))
        for n in range(a, b + 1):
            events.append((m.start(), str(n)))

    events.sort(key=lambda x: x[0])
    seen: set[str] = set()
    order: list[str] = []
    for _, key in events:
        if key not in seen:
            seen.add(key)
            order.append(key)
    return order


def markdown_block(order: list[str]) -> str:
    lines = [
        "### 본문 인용 순서(참고)",
        "",
        "**갑호증 번호(편철·파일명·증거자료 목록의 나열 순서)는 변경하지 않았습니다.** 아래는 본 청구서 본문에서 **「갑 제○호증」 및 `갑제○호증` 표기가 처음 등장하는 순서**만을 정리한 참고표입니다(증거자료 목록의 번호 순서와 다를 수 있습니다). 본문을 수정한 뒤에는 `tools/extract_gab_citation_order.py --markdown` 실행 결과로 이 절을 갱신할 수 있습니다.",
        "",
        "| 순서 | 갑호증 |",
        "| --- | --- |",
    ]
    for i, k in enumerate(order, 1):
        lines.append(f"| {i} | 갑 제{k}호증 |")
    return "\n".join(lines)


def main() -> None:
    import argparse

    p = argparse.ArgumentParser(description="청구서 본문에서 갑호증 첫 등장 순서 추출")
    p.add_argument(
        "--markdown",
        action="store_true",
        help="마크다운 절(표 포함)만 출력 — 청구서의 「본문 인용 순서(참고)」 갱신용",
    )
    args = p.parse_args()

    root = Path(__file__).resolve().parents[1]
    path = root / "행정심판청구(원본)" / "260405(인천행심위)" / "260405_01_행정심판청구서.md"
    text = path.read_text(encoding="utf-8")
    order = extract_order(text)
    if args.markdown:
        print(markdown_block(order))
    else:
        for i, k in enumerate(order, 1):
            print(f"{i}\t갑 제{k}호증")


if __name__ == "__main__":
    main()
