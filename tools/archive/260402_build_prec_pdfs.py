# -*- coding: utf-8 -*-
"""판례별 사건번호·사건명·판시사항·판결요지·주문 PDF 생성 (국가법령정보센터 기준 재추출본).

CASES 목록은 `행정심판청구(원본)` 제출 서면(01·02·03) 및 03_핵심판례_집대성에 등장하는 사건번호와 일치함.
- 적극 인용: 2008두167, 91누13441, 2004두2974, 99다70600, 93누20023, 96누18380, 98두4061, 96누12917, 97누7875, 95누9020 *(91누12529는 원문 확인 곤란·혼동 우려로 제외; 다목 핵심은 2004두2974·96누12917 등으로 정리. 2000두2741도 제외)*
- 법리 정비·참고(본안에서 그대로 대응 인용 아님): 97누8540, **91누5358**(건축법 준공검사 — 다목 **보조**; PDF는 `법령정보/`)

**출력 위치:** 국가법령정보센터 요약 PDF(판례 **재추출본**)는 **`행정심판청구(제출용)/법령정보/`** 에 **`사건번호_사건명.pdf`** 로 둔다(구 트리: `…/증거/최종/법령정보/`). 갑호증 **제출 대상 아님**; 청구서는 사건번호·law.go.kr 원문 인용. **대조·검증을 마친 기존 파일은 삭제하거나 덮어쓰지 않도록** 재실행 시 `python tools/260402_build_prec_pdfs.py --skip-existing` 를 쓴다. **법제처 행정기본법** Q10·Q18은 **`갑제13호증/갑제13-1호증`·`갑제13-2호증`**(각 1페이지 PDF, `pypdf` 필요: `pip install pypdf`). *(구 출력명: `갑제16·17호증_…` 루트)* **전체 원본 PDF**는 `행정심판청구(원본)/행정기본법_질의응답_사례집(최종).pdf` 에 두고, 과거에 판례모음 루트에 두던 `02_…(최종).pdf` 는 **`기타참고/`** 로 옮긴다. 구 `01_`~`11_` 판례모음 경로는 스크립트가 정리한다. 과거에 둔 `*_요약.pdf` 복제본은 스크립트 실행 시 제거한다. **`old/`** 하위는 스크립트가 읽거나 수정하지 않는다. 참고·중복·잡파일·97누8540·91누5358 등은 **`작업/기타참고/`** 등 작업 폴더에 둔다(스크립트 생성분은 **`사건번호_사건명.pdf`**). 구 `판례모음/기타`는 `merge_legacy_panrye_gita()`로 통합. 루트에 남은 중복은 `tidy_panrye_moum_root()`로 같은 `기타참고/`로 옮긴다.

각 CASE에 선택 필드 `citations`: `[{"from": "01 …", "text": "…"}, …]` — PDF 말미에 `[인용 · 출처]` 형식으로 붙임.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from datetime import date
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    print("fpdf2 패키지가 필요합니다: pip install fpdf2", file=sys.stderr)
    raise

try:
    from pypdf import PdfReader as _PypdfReader
    from pypdf import PdfWriter as _PypdfWriter
except ImportError:
    _PypdfReader = None
    _PypdfWriter = None

_REPO = Path(__file__).resolve().parent.parent
_REPO_ROOT = Path(__file__).resolve().parents[2]
ADJ_ROOT = _REPO / "행정심판청구(제출용)"
FINAL_ROOT = _REPO_ROOT / "행정심판청구(원본)"
PANRYE_ROOT = ADJ_ROOT / "판례모음"
GAB_DIR = ADJ_ROOT / "갑호증"
LAW_INFO_DIR = ADJ_ROOT / "법령정보"
ORDERED_DIR = ADJ_ROOT / "(국가법령정보)판례모음"
# law.go.kr 직접 출력 등과 나란히 두는 하위 폴더 — 스크립트가 루트의 `01_`~`11_` PDF와 동일본을 여기로 동기화한다.
LAWINFO_ORIG_DIR = ORDERED_DIR / "법령정보"
# 과거 `기타참고/`에 두던 스크립트 생성·정리분은 `법령정보/`에 통합한다.
MISC_DIR = LAW_INFO_DIR


def _case_pdf_filename(evt: str, case_name: str) -> str:
    """스크립트 내부 키·`법령정보/` 저장 파일명: `사건번호_사건명.pdf`(괄호·공백 제거)."""
    stem = case_name.replace("(", "").replace(")", "").replace(" ", "")
    return f"{evt}_{stem}.pdf"


def _ordered_pdf_filename(order: int, evt: str, case_name: str) -> str:
    """인용 순(참고): `NN_사건번호_사건명.pdf` — 본 스크립트의 주 출력은 `법령정보/` 사건번호 파일명."""
    stem = case_name.replace("(", "").replace(")", "").replace(" ", "")
    return f"{order:02d}_{evt}_{stem}.pdf"


def _law_info_case_path(evt: str, case_name: str) -> Path:
    """`행정심판청구(제출용)/법령정보/사건번호_사건명.pdf` — 갑호증 제출 대상 아님."""
    return LAW_INFO_DIR / _case_pdf_filename(evt, case_name)


# 국가법령정보 재추출 판례 PDF는 `행정심판청구(제출용)/법령정보/`(갑호증 제외). 법제처 Q10·Q18은 `갑제13호증/13-1·13-2`.
CASE_OUT: dict[str, Path] = {
    "2008두167_건축신고불허또는반려처분취소.pdf": _law_info_case_path(
        "2008두167", "건축신고불허(또는반려)처분취소"
    ),
    "96누18380_토지형질변경행위불허가처분취소.pdf": _law_info_case_path(
        "96누18380", "토지형질변경행위불허가처분취소"
    ),
    "2004두2974_주택건설사업계획승인신청반려처분취소.pdf": _law_info_case_path(
        "2004두2974", "주택건설사업계획승인신청반려처분취소"
    ),
    "93누20023_행정처분취소.pdf": _law_info_case_path("93누20023", "행정처분취소"),
    "99다70600_손해배상기.pdf": _law_info_case_path("99다70600", "손해배상(기)"),
    "91누13441_교회건축허가처분취소.pdf": _law_info_case_path(
        "91누13441", "교회건축허가처분취소"
    ),
    "97누7875_주택건설사업계획승인취소처분취소.pdf": _law_info_case_path(
        "97누7875", "주택건설사업계획승인취소처분취소"
    ),
    "96누12917_주택건설사업계획승인신청반려처분취소.pdf": _law_info_case_path(
        "96누12917", "주택건설사업계획승인신청반려처분취소"
    ),
    "95누9020_민영주택건설사업계획승인신청반려처분취소.pdf": _law_info_case_path(
        "95누9020", "민영주택건설사업계획승인신청반려처분취소"
    ),
    "98두4061_폐기물처리업허가신청에대한불허가처분취소.pdf": _law_info_case_path(
        "98두4061", "폐기물처리업허가신청에대한불허가처분취소"
    ),
    "97누8540_개발제한구역내행위허가승인처분취소등.pdf": _law_info_case_path(
        "97누8540", "개발제한구역내행위허가승인처분취소등"
    ),
    "91누5358_준공신청서반려처분취소.pdf": _law_info_case_path(
        "91누5358", "준공신청서반려처분취소"
    ),
}

FONT = Path(r"C:\Windows\Fonts\malgun.ttf")

ADM_PDF_STEM = "행정기본법_질의응답_사례집(최종).pdf"
# 인용: (하위 폴더, 파일명, 원본 1-based 페이지) — Q10·Q18 각 1페이지 → `갑호증/갑제13호증/…`
ADM_LAW_EXCERPT_PAGES: tuple[tuple[str, str, int], ...] = (
    ("갑제13호증", "갑제13-1호증_행정기본법_질의응답_사례집_Q10.pdf", 26),
    ("갑제13호증", "갑제13-2호증_행정기본법_질의응답_사례집_Q18.pdf", 41),
)
ORDERED_ADM_FULL = ORDERED_DIR / f"02_{ADM_PDF_STEM}"


def norm_esc(s: str) -> str:
    """law.go.kr 마크다운 이스케이프 제거."""
    return re.sub(r"\\([.#])", r"\1", s)


class PrecPDF(FPDF):
    def __init__(self) -> None:
        super().__init__()
        self.set_auto_page_break(auto=True, margin=18)
        if not FONT.is_file():
            raise FileNotFoundError(f"한글 폰트 없음: {FONT}")
        self.add_font("K", "", str(FONT))
        self.set_margins(18, 18, 18)

    def section(self, title: str, body: str) -> None:
        self.set_font("K", "", 11)
        self.multi_cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.set_font("K", "", 10)
        self.multi_cell(0, 6, body.strip() or "(없음)", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)


def write_one(pdf: PrecPDF, meta: dict, generated: str) -> None:
    pdf.add_page()
    title = meta["header"]
    pdf.set_font("K", "", 13)
    pdf.multi_cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    if meta.get("verify_note"):
        pdf.set_font("K", "", 9)
        pdf.multi_cell(
            0,
            5,
            "[안내] " + meta["verify_note"],
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(2)
    pdf.section("사건번호", meta["evt"])
    pdf.section("사건명", meta["case_name"])
    pdf.section("판시사항", norm_esc(meta["holdings"]))
    pdf.section("판결요지", norm_esc(meta["summary"]))
    pdf.section("주문", norm_esc(meta["order"]))
    cites = meta.get("citations")
    if cites:
        blocks: list[str] = []
        for item in cites:
            label = (item.get("from") or "서면").strip()
            body = (item.get("text") or "").strip()
            if body:
                blocks.append(f"[인용 · {label}]\n{body}")
        if blocks:
            pdf.section("서면 인용", "\n\n".join(blocks))
    src = meta.get("source", "국가법령정보센터(law.go.kr) 공개 판례")
    pdf.set_font("K", "", 8)
    pdf.set_y(-22)
    pdf.multi_cell(0, 4, f"출처: {src} / PDF 생성: {generated}", new_x="LMARGIN", new_y="NEXT")


# --- 국가법령정보센터 precInfoP.do(evtNo) 기준 재추출 (수집·제출 서면 정합) ---
CASES: list[dict] = [
    {
        "file": _case_pdf_filename("97누8540", "개발제한구역내행위허가승인처분취소등"),
        "header": "대법원 1997. 9. 26. 선고 97누8540 판결",
        "evt": "97누8540",
        "case_name": "개발제한구역내행위허가승인처분취소등",
        "holdings": """[1] 항고소송의 대상이 되는 행정처분의 의의 및 상급행정기관의 하급행정기관에 대한 승인·동의·지시 등이 행정처분에 해당하는지 여부(소극)
[2] 지방자치단체장이 개발제한구역 안에서의 혐오시설 설치허가에 앞서 건설부훈령인 "개발제한구역관리규정"에 의하여 사전승인신청을 함에 따라 건설교통부장관이 한 승인행위가 항고소송의 대상이 되는 행정처분에 해당하는지 여부(소극)""",
        "summary": """[1] 항고소송의 대상이 되는 행정처분은 행정청의 공법상의 행위로서 특정 사항에 대하여 법규에 의한 권리의 설정 또는 의무의 부담을 명하거나 기타 법률상의 효과를 직접 발생케 하는 등 국민의 구체적인 권리 의무에 직접 관계가 있는 행위를 말하는바, 상급행정기관의 하급행정기관에 대한 승인·동의·지시 등은 행정기관 상호간의 내부행위로서 국민의 권리 의무에 직접 영향을 미치는 것이 아니므로 항고소송의 대상이 되는 행정처분에 해당한다고 볼 수 없다.
[2] 지방자치단체장이 당해 토지 일대에 쓰레기매립장을 설치하기로 하면서 당해 토지 일대가 도시계획법상의 개발제한구역 내에 위치함에 따라 스스로 개발제한구역 안에서의 폐기물처리시설 설치허가를 하기에 앞서 지방자치단체장이 도시계획법상의 개발제한구역 안에서의 일정한 행위를 허가함에 있어 개발제한구역 지정의 취지에 어긋나지 않도록 지도·감독하기 위하여 제정된 건설부훈령인 "개발제한구역관리규정"에 따라 건설교통부장관에게 폐기물처리시설 설치허가에 대한 사전승인신청을 하였고, 건설교통부장관이 위 신청을 승인한 경우, 건설교통부장관의 위 승인행위는 지방자치단체장이 도시계획법령에 의하여 행할 수 있는 개발제한구역 안에서의 폐기물처리시설 설치허가와 관련하여 건설교통부장관이 위 "개발제한구역관리규정"에 따라 허가권자인 지방자치단체장에 대한 지도·감독작용으로서 행한 것으로서 행정기관 내부의 행위에 불과하여 국민의 구체적인 권리·의무에 직접적인 변동을 초래하는 것이 아닐 뿐 아니라, 건설교통부장관의 승인행위에 의하여 직접적으로 도시계획이 변경되는 효력이 발생하는 것이 아니므로 결국 건설교통부장관의 위 승인행위는 항고소송의 대상이 되는 행정처분에 해당한다고 볼 수 없다.""",
        "order": "상고를 기각한다. 상고비용은 원고(선정당사자)의 부담으로 한다.",
        "verify_note": "공식 판시는 개발제한구역 사전승인 등 '내부행위의 항고소송 대상 여부' 쟁점임. 행정심판청구 제출 서면에서는 준공 외관 논거로 인용하지 않음(2008두167 중심).",
        "citations": [
            {
                "from": "01 행정심판청구서",
                "text": "(법리 정비) 국가법령정보센터가 공개한 97누8540 판결의 판시는 개발제한구역 내 사업과 관련한 사전승인 등이 항고소송의 대상이 되는 행정처분인지(내부행위 논점)에 관한 것으로, 준공 기념행사·기념석과 같은 사실관계에 그대로 대응시켜 인용하기는 어렵습니다. 본 청구서의 이 부분 논거는 2008두167을 중심으로 구성합니다.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("91누5358", "준공신청서반려처분취소"),
        "header": "대법원 1992. 4. 10. 선고 91누5358 판결",
        "evt": "91누5358",
        "case_name": "준공신청서반려처분취소",
        "holdings": """[1] 준공검사처분은 건축허가사항대로 건축행정목적에 적합한지 심사·확인하고 준공검사필증을 교부하여 수허가자가 건축물을 사용·수익할 수 있게 하는 법률효과를 발생시키는 행정처분인지 여부(적극)
[2] 건축허가내용대로 완공된 건축물의 준공을 거부할 수 있는지, 건축허가에 법령 위반 하자가 있는 경우 허가취소·준공 거부와 이익형량(한정 적극)
[3] 행정청이 택지 수용 등을 전제로 건축을 지시한 뒤 일방적으로 계획을 변경·취소한 사안에서 준공신청서 반려처분이 신뢰보호에 반하는지 여부(한정 적극)""",
        "summary": """준공검사처분은 허가 내용에 맞는 완공 여부를 확인하고 준공검사필증을 교부하여 사용·수익을 가능하게 하는 처분이다. 특단의 사정이 없는 한 허가 내용대로 완공된 건축물의 준공을 거부하기 어렵고, 다만 건축허가에 건축법령 위반의 하자가 있으면 그 정도에 따라 허가를 취소하거나 준공을 거부할 수 있다. 허가 취소에는 수허가자 이익과 공익의 비교형량이 필요하고 개인적 이익 희생이 부득이한 경우가 아니면 함부로 취소할 수 없으며, 준공 거부에도 마찬가지이다. 한편 구체적 사실관계에서 행정의 전제·표명과 장기간의 신뢰 등에 비추어 준공신청 반려가 신뢰보호에 반한다고 본 부분이 있다(국가법령정보센터 【판시사항】·【판결요지】·원문 대조).""",
        "order": "상고를 기각한다. 상고비용은 피고의 부담으로 한다.",
        "verify_note": "건축법상 준공검사 사안. 본건 도시공원 실시계획·준공과 법령·쟁점이 다름. 다목에서는 허가·조건과 준공 단계의 관계·형량을 보조 유추. 구체적 결론은 반려 위법 인정 사례 — 청구 주장과 방향이 완전히 같다고 단정하지 말 것. 주문·판시는 law.go.kr 원문 대조.",
        "citations": [
            {
                "from": "01 행정심판청구서 다목",
                "text": "상위 인가·조건과 후단 준공 관련 처분의 정합성·이익형량을 짧게 짚는 보조 참고. 2004두2974·96누12917 등이 전면.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("96누12917", "주택건설사업계획승인신청반려처분취소"),
        "header": "대법원 1997. 10. 24. 선고 96누12917 판결",
        "evt": "96누12917",
        "case_name": "주택건설사업계획승인신청반려처분취소",
        "holdings": """[1] 주택건설촉진법상의 주택건설사업계획 승인처분이 재량행위인지 여부(적극)
[2] 행정청이 사전입지심의 절차에서 법규에 근거가 없는 건축물의 높이 제한 조건에 위배된다는 이유로 주택건설촉진법에 의한 주택건설사업계획의 승인신청을 반려할 수 있는지 여부(적극)""",
        "summary": """[1] 주택건설촉진법 제33조 제1항에 의한 주택건설사업계획의 승인은 상대방에게 권리나 이익을 부여하는 효과를 수반하는 이른바 수익적 행정처분으로서 법령에 행정처분의 요건에 관하여 일의적으로 규정되어 있지 아니한 이상 행정청의 재량행위에 속한다.
[2] 민영주택건설사업계획의 승인을 위하여 주택건설사업계획이 갖추어야 할 기준이나 이를 심사·확인하는 방법을 정하는 것 역시 법령에 특별히 규정된 바가 없으면 행정청의 재량에 속하는 것이므로, 행정청은 법규에 근거가 없더라도 주택건설사업계획이 입지 등의 면에서 승인기준에 적합한지 여부를 심사·확인하는 방법으로 사전에 입지심의 등의 절차를 거치도록 할 수 있다고 할 것이며, 그와 같은 입지심의에서 부여된 조건이 비록 법령상의 제한에 근거한 것이 아니라 위 사업계획승인에 있어 고려하여야 할 공익상의 필요에 의한 것이라도 그에 있어 재량권의 남용이나 일탈이 없는 이상 그 조건에 위배된다는 이유로 당해 사업계획승인신청을 반려하는 것은 적법하다.""",
        "order": "원심판결을 파기하고 이 사건을 부산고등법원에 환송한다.",
        "citations": [
            {
                "from": "03 핵심판례 집대성",
                "text": "재량 남용·일탈이 없으면 입지심의 조건 위배를 이유로 한 반려가 적법할 수 있음(【판결요지】). 97누7875는 취소+반려가 위법인 사례. 본건 다목 논증은 2004두2974(처분시 기준·처리지연)·이익형량과 접목.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("97누7875", "주택건설사업계획승인취소처분취소"),
        "header": "대법원 1998. 5. 8. 선고 97누7875 판결",
        "evt": "97누7875",
        "case_name": "주택건설사업계획승인취소처분취소",
        "holdings": """[1] 사실상 주택건설사업이 양도·양수되었지만 아직 변경승인을 받기 이전인 경우, 사업계획의 피승인자 및 위 사업계획승인취소처분의 판단 기준이 되는 대상자(=양도인)
[2] 착공기간을 준수하지 아니하였다는 사유로 건축법 제8조 제8항 소정의 취소사유에 관한 부분을 유추적용하여 주택건설사업계획승인을 취소할 수 있는지 여부(한정 적극)
[3] 지방자치단체장이 주택건설사업 주체의 변경승인신청에 대하여 그 사업계획승인을 취소하면서 변경승인신청서를 반려한 조치가 위법하다고 한 사례""",
        "summary": """[1] 주택건설촉진법 제33조 제1항, 구 주택건설촉진법시행규칙(1996. 2. 13. 건설교통부령 제54호로 개정되기 전의 것) 제20조에 의한 주택건설사업계획에 있어서 사업주체변경의 승인은 그로 인하여 사업주체의 변경이라는 공법상의 효과가 발생하므로, 사실상 내지 사법상으로 주택건설사업 등이 양도·양수되었을지라도 아직 변경승인을 받기 이전에는 그 사업계획의 피승인자는 여전히 종전의 사업주체인 양도인이고, 양수인이 아니라 할 것이어서, 사업계획승인취소처분 등의 사유가 있는지의 여부와 취소사유가 있다고 하여 행하는 취소처분은 피승인자인 양도인을 기준으로 판단하여 그 양도인에 대하여 행하여져야 한다.
[2] 주택건설촉진법상의 주택건설사업계획승인과 건축법상의 건축허가는 처분의 주체나 절차 및 효과 등이 서로 다르고, 특히 건축법 제8조 제8항이 소정의 기간 내에 착공하지 아니한 것을 취소사유의 하나로 규정한 것은 시의에 맞는 합리적인 건축규제 등을 기하기 위한 것이나, 주택건설사업은 관할 관청의 주택건설종합계획이 정하는 바에 따라 그 사업을 시행하여야 할 뿐 아니라 통상 그 공사 규모가 크고 이해관계인이 많아 비교적 장기간의 공사준비 기간이 소요되는 점 등을 고려할 때, 주택건설사업계획승인에 관하여 건축법 제8조 제8항의 취소사유에 관한 부분을 그대로 유추적용할 수는 없고, 관할 관청이 주택건설촉진법 제48조의 규정 등에 의하여 주택건설사업계획승인을 취소할 때에는 취소하여야 할 공익상의 필요와 그 취소로 인하여 당사자가 입게 될 기득권과 신뢰 보호, 법률생활의 안정과 침해 등을 비교·교량한 후 공익상의 필요가 당사자가 입을 불이익을 정당화할 만큼 강한 경우에 한하여 취소할 수 있다.
[3] 지방자치단체장이 주택건설사업 주체의 변경승인신청에 대하여 그 사업계획승인을 취소하면서 변경승인신청서를 반려한 조치가 위법하다고 한 사례.""",
        "order": "원심판결을 파기한다.\n사건을 부산고등법원에 환송한다.",
        "citations": [
            {
                "from": "03 핵심판례 집대성",
                "text": "변경승인신청에 대해 사업계획승인 취소와 함께 반려한 조치가 위법하다고 한 사례(【판결요지】 [3]). 이익형량·절차에서 재량 일탈 논의 보조.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("95누9020", "민영주택건설사업계획승인신청반려처분취소"),
        "header": "대법원 1996. 10. 11. 선고 95누9020 판결",
        "evt": "95누9020",
        "case_name": "민영주택건설사업계획승인신청반려처분취소",
        "holdings": """[1] 구 주택건설촉진법상 주택건설사업계획 승인처분이 재량행위인지 여부(적극)
[2] 행정청이 법규에 근거가 없는 사전 입지심의 등을 거치지 않았다는 이유로 구 주택건설촉진법에 의한 주택건설사업계획의 승인신청을 반려할 수 있는지 여부(적극)""",
        "summary": """[1] 구 주택건설촉진법(1994. 1. 7. 법률 제4723호로 개정되기 전의 것) 제33조에 의한 주택건설사업계획의 승인은 상대방에게 권리나 이익을 부여하는 효과를 수반하는 이른바 수익적 행정처분으로서 법령에 행정처분의 요건에 관하여 일의적으로 규정되어 있지 아니한 이상 행정청의 재량행위에 속한다.
[2] 민영주택건설사업계획 승인을 위하여 주택건설사업계획이 갖추어야 할 기준이나 이를 심사·확인하는 방법을 정하는 것 역시 법령에 특별히 규정된 바가 없으면 행정청의 재량에 속하는 것이므로, 행정청은 법규에 근거가 없더라도 주택건설사업계획이 입지 등의 면에서 승인기준에 적합한지 여부를 심사·확인하는 방법으로 사전에 입지심의 등의 절차를 거치도록 할 수 있고, 그것이 객관적으로 합리적이 아니라거나 타당하지 않다고 보이지 아니하는 이상 사전 입지심의 등을 거치지 않은 사업계획의 승인신청을 반려하는 처분을 하였다고 하더라도 그것이 위법하다고 할 수 없다.""",
        "order": "상고를 기각한다. 상고비용은 원고의 부담으로 한다.",
        "citations": [
            {
                "from": "03 핵심판례 집대성",
                "text": "사전 입지심의 미이행만으로 반려한 처분이 곧 위법이라고 단정할 수 없는 취지(【판결요지】 [2]). 테마 5는 97누7875·다목(2004두2974·96누12917)과 함께 읽을 것.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("99다70600", "손해배상(기)"),
        "header": "대법원 2000. 5. 12. 선고 99다70600 판결",
        "evt": "99다70600",
        "case_name": "손해배상(기)",
        "holdings": """[1] 어떠한 행정처분이 후에 항고소송에서 취소된 사실만으로 당해 행정처분이 곧바로 공무원의 고의 또는 과실로 인한 것으로서 불법행위를 구성한다고 단정할 수 있는지 여부(소극) 및 이 경우 국가배상책임의 성립 요건과 그 판단 기준
[2] 개간허가 취소처분이 후에 행정심판 또는 행정소송에서 취소되었으나 담당공무원에게 객관적 주의의무를 결한 직무집행상의 과실이 없다는 이유로 국가배상책임을 부인한 사례
[3] 군수 또는 그 보조 공무원이 구 농지확대개발촉진법 제61조 제2항, 같은법시행령 제1항에 의하여 농수산부장관으로부터 도지사를 거쳐 군수에게 재위임된 국가사무인 개간허가 및 그 취소사무의 처리에 있어 고의 또는 과실로 타인에게 손해를 가한 경우, 국가배상책임의 귀속 주체""",
        "summary": """[1] 어떠한 행정처분이 후에 항고소송에서 취소되었다고 할지라도 그 기판력에 의하여 당해 행정처분이 곧바로 공무원의 고의 또는 과실로 인한 것으로서 불법행위를 구성한다고 단정할 수는 없는 것이고, 그 행정처분의 담당공무원이 보통 일반의 공무원을 표준으로 하여 볼 때 객관적 주의의무를 결하여 그 행정처분이 객관적 정당성을 상실하였다고 인정될 정도에 이른 경우에 국가배상법 제2조 소정의 국가배상책임의 요건을 충족하였다고 봄이 상당할 것이며, 이 때에 객관적 정당성을 상실하였는지 여부는 피침해이익의 종류 및 성질, 침해행위가 되는 행정처분의 태양 및 그 원인, 행정처분의 발동에 대한 피해자측의 관여의 유무, 정도 및 손해의 정도 등 제반 사정을 종합하여 손해의 전보책임을 국가 또는 지방자치단체에게 부담시켜야 할 실질적인 이유가 있는지 여부에 의하여 판단하여야 한다.
[2] 개간허가 취소처분이 후에 행정심판 또는 행정소송에서 취소되었으나 담당공무원에게 객관적 주의의무를 결한 직무집행상의 과실이 없다는 이유로 국가배상책임을 부인한 사례.
[3] 구 농지확대개발촉진법(1994. 12. 22. 법률 제4823호 농어촌정비법 부칙 제2조로 폐지) 제24조와 제27조에 의하여 농수산부장관 소관의 국가사무로 규정되어 있는 개간허가와 개간허가의 취소사무는 같은 법 제61조 제1항, 같은법시행령 제37조 제1항에 의하여 도지사에게 위임되고, 같은 법 제61조 제2항에 근거하여 도지사로부터 하위 지방자치단체장인 군수에게 재위임되었으므로 이른바 기관위임사무라 할 것이고, 이러한 경우 군수는 그 사무의 귀속 주체인 국가 산하 행정기관의 지위에서 그 사무를 처리하는 것에 불과하므로, 군수 또는 군수를 보조하는 공무원이 위임사무처리에 있어 고의 또는 과실로 타인에게 손해를 가하였다 하더라도 원칙적으로 군에는 국가배상책임이 없고 그 사무의 귀속 주체인 국가가 손해배상책임을 지는 것이며, 다만 국가배상법 제6조에 의하여 군이 비용을 부담한다고 볼 수 있는 경우에 한하여 국가와 함께 손해배상책임을 부담한다.""",
        "order": "원심판결 중 피고 패소 부분을 파기하고, 이 부분 사건을 전주지방법원 본원 합의부에 환송한다. 원고의 상고를 기각한다.",
        "citations": [
            {
                "from": "01 행정심판청구서",
                "text": "판례(대법원 99다70600)는 행정처분이 후에 취소되는 경우, 그 집행이 객관적 정당성을 상실하였다면 국가배상책임을 인정합니다. 피청구인의 위법한 준공 강행은 장차 막대한 국가(지자체) 배상 책임을 유발할 수 있는 중대한 과실입니다.",
            },
            {
                "from": "02 집행정지신청서",
                "text": "판례(대법원 99다70600)는 이러한 경우 국가배상책임을 인정하고 있으며, 행정청이 인가 조건 준수 의무를 회피하기 위한 허위 준공 절차를 밟는 것은 중대한 위법입니다.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("91누13441", "교회건축허가처분취소"),
        "header": "대법원 1992. 4. 28. 선고 91누13441 판결",
        "evt": "91누13441",
        "case_name": "교회건축허가처분취소",
        "holdings": "건축공사를 완료하고 준공검사까지 받은 경우 통행권 또는 통행이익을 확보하거나 건축물의 철거 또는 손해배상청구소송을 제기하기 위한 필요성이 있다고 하여 건축허가처분의 취소를 소구할 법률상 이익이 있다고 할 수 있는지 여부(소극)",
        "summary": "건축허가된 부지가 건축법상의 도로로서 출입, 통행하는 데 이용하고 있어서 건축허가처분이 건축법상 보장된 통행권 또는 통행이익을 침해하는 처분이라 하더라도 건축공사를 완료하고 준공검사까지 받았다면 건축허가의 취소를 받아 건축물의 건립을 저지함으로써 통행권 또는 통행이익을 확보할 수 있는 단계는 이미 지났고, 또한 건축허가처분이 취소된다 하여 바로 통행권 또는 통행이익이 확보되는 것도 아니며 민사소송으로 건축물의 철거나 손해배상청구를 하는 경우 건축허가처분의 취소를 명하는 판결이 필요한 것도 아니므로 건축허가처분의 취소를 소구할 법률상 이익이 없다.",
        "order": "상고를 모두 기각한다.\n상고비용은 원고들의 부담으로 한다.",
        "citations": [
            {
                "from": "01 행정심판청구서",
                "text": "판례(대법원 91누13441)에 따르면, \"건축공사를 완료하고 준공검사까지 마친 경우에는 허가처분의 취소를 구할 법률상 이익이 없다\"고 보아 소를 각하할 우려가 매우 큽니다.",
            },
            {
                "from": "02 집행정지신청서",
                "text": "판례(대법원 1992. 4. 28. 선고 91누13441)에 따르면, \"건축공사를 완료하고 준공검사까지 마친 경우에는 허가처분의 취소를 구할 법률상 이익이 상실\"된다고 명시하고 있습니다.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("96누18380", "토지형질변경행위불허가처분취소"),
        "header": "대법원 1997. 9. 12. 선고 96누18380 판결",
        "evt": "96누18380",
        "case_name": "토지형질변경행위불허가처분취소",
        "holdings": """[1] 행정행위에 대하여 신뢰보호의 원칙이 적용되기 위한 요건
[2] 도시계획구역 내 생산녹지로 답인 토지에 대하여 종교회관 건립을 이용목적으로 하는 토지거래계약의 허가를 받으면서 담당공무원이 관련 법규상 허용된다 하여 이를 신뢰하고 건축준비를 하였으나 그 후 토지형질변경허가신청을 불허가 한 것이 신뢰보호원칙에 반한다고 한 사례
[3] [2]항의 경우, 지방자치단체장이 당해 토지에 대한 형질변경을 불허하고 이를 우량농지로 보전하려는 공익보다 형질변경이 가능하리라고 믿은 종교법인이 입게 될 불이익이 더 큰 것이라면 당해 처분이 재량권을 남용한 위법한 처분인지 여부(적극)
[4] 도시계획법시행령 제5조의2에 따라 도시계획구역 안에서 토지형질변경불허가의 대상이 되는 경우에 있어 그 판단 기준""",
        "summary": """[1] 일반적으로 행정상의 법률관계에 있어서 행정청의 행위에 대하여 신뢰보호의 원칙이 적용되기 위하여는, 첫째 행정청이 개인에 대하여 신뢰의 대상이 되는 공적인 견해표명을 하여야 하고, 둘째 행정청의 견해표명이 정당하다고 신뢰한 데에 대하여 그 개인에게 귀책사유가 없어야 하며, 셋째 그 개인이 그 견해표명을 신뢰하고 이에 어떠한 행위를 하였어야 하고, 넷째 행정청이 위 견해표명에 반하는 처분을 함으로써 그 견해표명을 신뢰한 개인의 이익이 침해되는 결과가 초래되어야 하며, 이러한 요건을 충족할 때에는 행정청의 처분은 신뢰보호의 원칙에 반하는 행위로서 위법하게 된다고 할 것이고, 또한 위 요건의 하나인 행정청의 공적 견해표명이 있었는지의 여부를 판단하는 데 있어 반드시 행정조직상의 형식적인 권한분장에 구애될 것은 아니고 담당자의 조직상의 지위와 임무, 당해 언동을 하게 된 구체적인 경위 및 그에 대한 상대방의 신뢰가능성에 비추어 실질에 의하여 판단하여야 한다.
[2] 종교법인이 도시계획구역 내 생산녹지로 답인 토지에 대하여 종교회관 건립을 이용목적으로 하는 토지거래계약의 허가를 받으면서 담당공무원이 관련 법규상 허용된다 하여 이를 신뢰하고 건축준비를 하였으나 그 후 당해 지방자치단체장이 다른 사유를 들어 토지형질변경허가신청을 불허가 한 것이 신뢰보호원칙에 반한다고 한 사례.
[3] 비록 지방자치단체장이 당해 토지형질변경허가를 하였다가 이를 취소·철회하는 것은 아니라 하더라도 지방자치단체장이 토지형질변경이 가능하다는 공적 견해표명을 함으로써 이를 신뢰하게 된 당해 종교법인에 대하여는 그 신뢰를 보호하여야 한다는 점에서 형질변경허가 후 이를 취소·철회하는 경우를 유추·준용하여 그 형질변경허가의 취소·철회에 상당하는 당해 처분으로써 지방자치단체장이 달성하려는 공익 즉, 당해 토지에 대하여 그 형질변경을 불허하고 이를 우량농지로 보전하려는 공익과 위 형질변경이 가능하리라고 믿은 종교법인이 입게 될 불이익을 상호 비교·교량하여 만약 전자가 후자보다 더 큰 것이 아니라면 당해 처분은 비례의 원칙에 위반되는 것으로 재량권을 남용한 위법한 처분이라고 봄이 상당하다.
[4] 도시계획법시행령 제5조의2의 규정에 따르면 도시계획구역 안에서 토지에 대한 형질변경허가신청에 대한 불허가의 대상이 되는 경우는 추상적으로 당해 토지의 합리적인 이용이나 도시계획사업에 지장이 될 우려가 있다는 것만으로는 부족하고 구체적으로 건설부령인 토지의형질변경등행위허가기준등에관한규칙이 정하는 기준에 적합하지 아니한 경우에 한하여 불허가의 대상이 된다고 보아야 한다.""",
        "order": "원심판결을 파기하고 사건을 대전고등법원에 환송한다.",
        "citations": [
            {
                "from": "01 행정심판청구서",
                "text": "실질주의·공적 견해표명 (96누18380 등). 보강: 98두4061은 구청의 사업계획 적정통보 후 법정 요건을 갖추어 허가신청을 하였으나 불허가한 사안에서 신뢰보호·비례·재량권 남용을 들어 불허가 위법을 인정한 원심을 대법원이 유지(피고 상고 기각).",
            },
        ],
    },
    {
        "file": _case_pdf_filename("93누20023", "행정처분취소"),
        "header": "대법원 1994. 1. 28. 선고 93누20023 판결",
        "evt": "93누20023",
        "case_name": "행정처분취소",
        "holdings": "폭 4m 이상인 사실상의 도로가 구 건축법(1975.12.31. 법률 제2852호로 전문 개정되기 전의 것)상의 도로에 해당하는지 여부",
        "summary": """1975.12.31. 법률 제2852호 건축법중개정법률 부칙 제2조는 이 법 시행 당시 종전의 규정에 의한 도로로서 제2조 제15호의 규정에 적합하지 않은 것은 동 규정에도 불구하고 이를 도로로 본다고 규정하고 있고, 그 전의 건축법(1967.3.30. 법률 제1942호) 제2조 제15호는 "도로"라 함은 폭 4미터 이상의 도로와 다음에 게기하는 것의 하나에 해당하는 예정도로로서 폭 4미터 이상의 것을 말한다. 폭 4미터 미만의 도로로서 시장 군수가 지정한 도로도 또한 같다고 규정하고 있으므로, 폭 4미터 이상의 도로는 폭 4미터 미만의 도로와는 달리 시장 군수가 도로로 지정하지 않은 사실상의 도로라 하더라도 건축법상의 "도로"에 해당한다 할 것이니, 사실상의 도로가 그 폭이 4미터 이상으로서 위 1975.12.31.법률 제2852호 시행일 전에 이미 주민들의 통행로로 이용되고 있었다면 이는 건축법상의 도로에 해당한다.""",
        "order": "원심판결을 파기하고,사건을 광주고등법원에 환송한다.",
        "citations": [
            {
                "from": "01 행정심판청구서",
                "text": "대법원 93누20023: 폭 4m 이상 사실상 도로가 구 건축법(1975. 12. 31. 전문 개정) 시행 당시 통행로로 이용된 경우 건축법상 도로에 해당할 수 있다는 취지(01 마목). 조선시가지계획령 특정 조문을 판시 논거로 삼았다고 보기는 어렵고, 일제 시기 법령·도면은 갑호증으로 별도 정리. 멸실·비례(과잉금지) 논지는 동 마목에서 청구인 주장.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("2008두167", "건축신고불허(또는반려)처분취소"),
        "header": "대법원 2010. 11. 18. 선고 2008두167 전원합의체 판결",
        "evt": "2008두167",
        "case_name": "건축신고불허(또는반려)처분취소",
        "holdings": """[1] 행정청의 행위가 항고소송의 대상이 되는지 여부의 판단 기준
[2] 행정청의 건축신고 반려행위 또는 수리거부행위가 항고소송의 대상이 되는지 여부(적극)""",
        "summary": """[1] 행정청의 어떤 행위가 항고소송의 대상이 될 수 있는지의 문제는 추상적·일반적으로 결정할 수 없고, 구체적인 경우 행정처분은 행정청이 공권력의 주체로서 행하는 구체적 사실에 관한 법집행으로서 국민의 권리의무에 직접적으로 영향을 미치는 행위라는 점을 염두에 두고, 관련 법령의 내용과 취지, 그 행위의 주체·내용·형식·절차, 그 행위와 상대방 등 이해관계인이 입는 불이익과의 실질적 견련성, 그리고 법치행정의 원리와 당해 행위에 관련한 행정청 및 이해관계인의 태도 등을 참작하여 개별적으로 결정하여야 한다.
[2] 구 건축법(2008. 3. 21. 법률 제8974호로 전부 개정되기 전의 것) 관련 규정의 내용 및 취지에 의하면, 행정청은 건축신고로써 건축허가가 의제되는 건축물의 경우에도 그 신고 없이 건축이 개시될 경우 건축주 등에 대하여 공사 중지·철거·사용금지 등의 시정명령을 할 수 있고(제69조 제1항), 그 시정명령을 받고 이행하지 않은 건축물에 대하여는 당해 건축물을 사용하여 행할 다른 법령에 의한 영업 기타 행위의 허가를 하지 않도록 요청할 수 있으며(제69조 제2항), 그 요청을 받은 자는 특별한 이유가 없는 한 이에 응하여야 하고(제69조 제3항), 나아가 행정청은 그 시정명령의 이행을 하지 아니한 건축주 등에 대하여는 이행강제금을 부과할 수 있으며(제69조의2 제1항 제1호), 또한 건축신고를 하지 아니한 자는 200만 원 이하의 벌금에 처해질 수 있다(제80조 제1호, 제9조). 이와 같이 건축주 등은 신고제하에서도 건축신고가 반려될 경우 당해 건축물의 건축을 개시하면 시정명령, 이행강제금, 벌금의 대상이 되거나 당해 건축물을 사용하여 행할 행위의 허가가 거부될 우려가 있어 불안정한 지위에 놓이게 된다. 따라서 건축신고 반려행위가 이루어진 단계에서 당사자로 하여금 반려행위의 적법성을 다투어 그 법적 불안을 해소한 다음 건축행위에 나아가도록 함으로써 장차 있을지도 모르는 위험에서 미리 벗어날 수 있도록 길을 열어 주고, 위법한 건축물의 양산과 그 철거를 둘러싼 분쟁을 조기에 근본적으로 해결할 수 있게 하는 것이 법치행정의 원리에 부합한다. 그러므로 건축신고 반려행위는 항고소송의 대상이 된다고 보는 것이 옳다.""",
        "order": "상고를 기각한다. 상고비용은 피고가 부담한다.",
        "citations": [
            {
                "from": "01 행정심판청구서",
                "text": "대법원 2008두167 전원합의체 판결에 따르면, 행정청의 어떤 행위가 항고소송(취소소송)의 대상이 될 수 있는지는 추상적·일반적으로 결정할 수 없고, 관련 법령의 내용과 취지, 행위의 주체·내용·형식·절차, 국민의 권리의무에 대한 실질적 견련성, 법치행정의 원리 등을 참작하여 개별적으로 판단하여야 합니다.",
            },
            {
                "from": "02 집행정지신청서",
                "text": "대법원 2008두167 전원합의체 판결은 행정청의 행위가 쟁송의 대상이 될 수 있는지를 행위의 내용과 국민의 권리의무에 대한 실질적 견련성 등에 비추어 개별적으로 판단할 것을 밝히고, 권리구제 필요가 인정되는 경우 소송 대상 범위를 넓게 해석하였습니다.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("2004두2974", "주택건설사업계획승인신청반려처분취소"),
        "header": "대법원 2006. 8. 25. 선고 2004두2974 판결",
        "evt": "2004두2974",
        "case_name": "주택건설사업계획승인신청반려처분취소",
        "holdings": """[1] 종전 국토이용관리법에 의하여 국토이용계획의 입안내용을 공고한 경우 당해 계획의 수립 및 이의신청에 관하여는 위 법률에 의하도록 한 국토의 계획 및 이용에 관한 법률 부칙(2002. 2. 4.) 제12조 제3항이 헌법상의 평등권을 위배한 규정인지 여부(소극)
[2] 허가신청 후 허가기준이 변경된 경우 변경된 허가기준에 따라 처분을 하여야 하는지 여부(한정 적극)
[3] 건설회사가 종전 국토이용관리법 시행 당시 주택건설사업계획 승인신청을 하였는데, 그 후 국토의 계획 및 이용에 관한 법률의 시행으로 국토이용관리법이 폐지됨에 따라 시장이 신법에 의하여 위 신청을 반려한 사안에서, 시장이 위 신청을 수리하고도 정당한 이유 없이 그 처리를 늦추었다고 볼 수 없다 하여 위 반려처분 당시 적용될 법률은 종전 국토이용관리법이 아니라 국토의 계획 및 이용에 관한 법률이라고 한 사례""",
        "summary": """[1] 국토의 계획 및 이용에 관한 법률 부칙 제12조 제3항은 국토이용계획 입안 내용을 공고한 경우에만 종전 국토이용관리법을 적용하도록 한 것으로, 공고가 없으면 신법 적용으로의 구별에 합리적 이유가 있어 평등권 위배가 아니다.
[2] 허가 등의 행정처분은 원칙적으로 처분시의 법령과 허가기준에 의하여 처리되어야 하고 허가신청 당시의 기준에 따라야 하는 것은 아니며, 비록 허가신청 후 허가기준이 변경되었다 하더라도 그 허가관청이 허가신청을 수리하고도 정당한 이유 없이 그 처리를 늦추어 그 사이에 허가기준이 변경된 것이 아닌 이상 변경된 허가기준에 따라서 처분을 하여야 한다.
[3] 원심은 신청 수리 후 무리한 지연이 없어 반려 당시 신법이 적용되고, 신법상 요건 미충족으로 반려가 적법하다고 보았고 대법원이 이를 수긍(상고 기각).""",
        "order": "상고를 기각한다. 상고비용은 원고가 부담한다.",
        "verify_note": "본건은 도시공원 실시계획 인가·국토계획법 경과와 사실관계가 다를 수 있음. 01 다목은 【판결요지】[2]의 일반 법리를 유추·참고. law.go.kr evtNo=2004두2974 등으로 원문 대조.",
        "citations": [
            {
                "from": "01 행정심판청구서 다목",
                "text": "【판결요지】[2]: 처분시 법령·허가기준, 무리한 지연 없이 기준만 바뀐 것이 아니면 변경 기준으로 처분. 실시계획 인가 부관 이행·준공 절차의 일관성·신속 처리 논증에 유추.",
            },
        ],
    },
    {
        "file": _case_pdf_filename("98두4061", "폐기물처리업허가신청에대한불허가처분취소"),
        "header": "대법원 1998. 5. 8. 선고 98두4061 판결",
        "evt": "98두4061",
        "case_name": "폐기물처리업허가신청에대한불허가처분취소",
        "holdings": """[1] 행정청의 행위에 대하여 신뢰보호의 원칙이 적용되기 위한 일반적 요건
[2] 행정청이 사업계획에 대한 적정통보를 한 뒤 신청인이 법정 허가요건을 갖추어 허가신청을 하였으나 이를 불허가한 처분의 위법성(신뢰보호의 원칙·비례의 원칙·재량권 남용)""",
        "summary": """[1] 일반적으로 행정상의 법률관계에 있어서 행정청의 행위에 대하여 신뢰보호의 원칙이 적용되기 위하여는, 첫째 행정청이 개인에 대하여 신뢰의 대상이 되는 공적인 견해표명을 하여야 하고, 둘째 행정청의 견해표명이 정당하다고 신뢰한 데에 대하여 그 개인에게 귀책사유가 없어야 하며, 셋째 그 개인이 그 견해표명을 신뢰하고 이에 어떠한 행위를 하였어야 하고, 넷째 행정청이 위 견해표명에 반하는 처분을 함으로써 그 견해표명을 신뢰한 개인의 이익이 침해되는 결과가 초래되어야 하며(대법원 1997. 9. 12. 선고 96누18380 판결 등 참조), 어떠한 행정처분이 이러한 요건을 충족할 때에는, 공익 또는 제3자의 정당한 이익을 현저히 해할 우려가 있는 경우가 아닌 한, 신뢰보호의 원칙에 반하는 행위로서 위법하게 된다고 할 것이다.
[2] 구청이 폐기물처리업 사업계획에 대하여 적정통보를 한 뒤 신청인이 상당한 자금·노력으로 법정 허가요건을 갖추어 허가신청을 하였음에도 불허가한 경우, 그 불허가가 신뢰보호의 원칙 및 비례의 원칙에 반하여 재량권을 남용한 위법한 처분이라고 본 원심 판단을 대법원이 수긍하고, 피고(구청장)의 상고를 기각한 사안.""",
        "order": "상고를 기각한다. 상고비용은 피고의 부담으로 한다.",
        "citations": [
            {
                "from": "01 행정심판청구서 나목",
                "text": "96누18380과 같은 신뢰보호 요건을 전제로, 행정청의 사전 견해(적정통보)에 기대하여 요건을 갖춘 뒤 이를 저버린 불허가가 위법하다고 본 원심을 대법원이 유지한 사례(상고인 피고 패소).",
            },
        ],
    },
]


def _misc_unique_sibling(dest: Path) -> Path:
    """같은 부모 아래에서 겹치지 않는 경로를 만든다(파일·폴더 공통)."""
    if not dest.exists():
        return dest
    parent = dest.parent
    if dest.is_file():
        stem, suf = dest.stem, dest.suffix
        for i in range(2, 10000):
            cand = parent / f"{stem}_중복{i}{suf}"
            if not cand.exists():
                return cand
    else:
        name = dest.name
        for i in range(2, 10000):
            cand = parent / f"{name}_중복{i}"
            if not cand.exists():
                return cand
    raise RuntimeError(f"고유 경로 실패: {dest}")


def _relocate_child_into_misc(item: Path, misc: Path) -> None:
    """한 항목(파일 또는 폴더)을 `misc` 루트로 옮긴다. 이름 충돌 시 이름을 바꾼다."""
    try:
        if not item.exists():
            return
        dest = misc / item.name
        if item.resolve() == dest.resolve():
            return
        if not dest.exists():
            shutil.move(str(item), str(dest))
            print("기타참고 평탄화:", item.name, "->", dest.relative_to(_REPO))
            return
        if item.is_file() and dest.is_file():
            u = _misc_unique_sibling(dest)
            shutil.move(str(item), str(u))
            print("기타참고 평탄화(파일 중복):", item.name, "->", u.relative_to(_REPO))
            return
        if item.is_dir() and dest.is_dir():
            u = misc / f"{item.name}_대법원작업잔재"
            k = 0
            cand = u
            while cand.exists():
                k += 1
                cand = misc / f"{item.name}_대법원작업잔재_{k}"
            shutil.move(str(item), str(cand))
            print("기타참고 평탄화(폴더 중복):", item.name, "->", cand.relative_to(_REPO))
            return
        if item.is_file() and dest.is_dir():
            u = _misc_unique_sibling(misc / item.name)
            shutil.move(str(item), str(u))
            print("기타참고 평탄화(파일·폴더명 충돌):", item.name, "->", u.relative_to(_REPO))
            return
        if item.is_dir() and dest.is_file():
            u = _misc_unique_sibling(misc / item.name)
            shutil.move(str(item), str(u))
            print("기타참고 평탄화(폴더·파일명 충돌):", item.name, "->", u.relative_to(_REPO))
    except OSError as e:
        print("경고: 기타참고 평탄화 실패:", item, e)


def flatten_daebub_worktree_in_misc() -> None:
    """`기타참고/대법원_작업잔재` 등 하위 껍질을 없애고 내용만 `기타참고` 루트로 옮긴다."""
    if not MISC_DIR.is_dir():
        return
    for folder in sorted(MISC_DIR.glob("대법원_작업잔재*")):
        if not folder.is_dir():
            continue
        for item in list(folder.iterdir()):
            _relocate_child_into_misc(item, MISC_DIR)
        try:
            folder.rmdir()
            print("제거(빈 폴더):", folder.relative_to(_REPO))
        except OSError:
            try:
                shutil.rmtree(folder)
                print("제거(rmtree):", folder.relative_to(_REPO))
            except OSError as e2:
                left = list(folder.iterdir()) if folder.is_dir() else []
                print(
                    "경고: 빈 껍질 폴더 제거 실패(OneDrive·잠금 가능):",
                    folder.relative_to(_REPO),
                    e2,
                    f"잔여 항목 {len(left)}건 — 탐색기에서 수동 삭제하세요.",
                )


def merge_legacy_panrye_gita() -> None:
    """예전 `판례모음/기타`에 있던 내용을 `행정심판청구(제출용)/최종/기타참고`로 옮긴 뒤 빈 폴더를 제거한다."""
    legacy = PANRYE_ROOT / "기타"
    if not legacy.is_dir():
        return
    MISC_DIR.mkdir(parents=True, exist_ok=True)
    for item in list(legacy.iterdir()):
        dest = MISC_DIR / item.name
        if dest.exists():
            if item.is_dir():
                n = 0
                while dest.exists():
                    n += 1
                    dest = MISC_DIR / f"{item.name}_판례모음기타_{n}"
            else:
                stem, suf = item.stem, item.suffix
                for i in range(2, 999):
                    alt = MISC_DIR / f"{stem}_중복{i}{suf}"
                    if not alt.exists():
                        dest = alt
                        break
        shutil.move(str(item), str(dest))
        print("기타참고 통합:", item.name, "->", dest.relative_to(_REPO))
    if legacy.is_dir():
        try:
            left = list(legacy.iterdir())
            if not left:
                legacy.rmdir()
            else:
                print("경고: 판례모음/기타 잔여 — 수동 확인:", [x.name for x in left[:20]])
        except OSError as e:
            print("경고: 판례모음/기타 제거 실패:", e)


def _resolve_admin_law_full_pdf() -> Path | None:
    """행정기본법 사례집 전체 PDF 경로(원본 루트·인용순 02·판례모음 등)."""
    candidates: list[Path] = [
        FINAL_ROOT / ADM_PDF_STEM,
        ORDERED_ADM_FULL,
        MISC_DIR / ADM_PDF_STEM,
        MISC_DIR / f"02_{ADM_PDF_STEM}",
        PANRYE_ROOT / ADM_PDF_STEM,
    ]
    if PANRYE_ROOT.is_dir():
        candidates += list(PANRYE_ROOT.glob("행정기본법*.pdf"))
    candidates += list(MISC_DIR.glob("행정기본법*.pdf"))
    for p in candidates:
        try:
            if p.is_file():
                return p
        except OSError:
            continue
    return None


def _build_admin_law_excerpt_and_relocate_full() -> None:
    """Q10·Q18 각 1페이지를 `갑호증/갑제13호증/갑제13-1·13-2호증_….pdf`로 두고, 전체본 `02_…(최종).pdf`는 기타참고로 옮긴다."""
    if _PypdfReader is None or _PypdfWriter is None:
        print(
            "경고: pypdf 없음 — 행정기본법 인용 PDF 생략. pip install pypdf",
            file=sys.stderr,
        )
        return
    src = _resolve_admin_law_full_pdf()
    if src is None:
        print("경고: 행정기본법 사례집 전체 PDF를 찾지 못했습니다:", ADM_PDF_STEM)
        return
    try:
        reader = _PypdfReader(str(src))
        n = len(reader.pages)
        GAB_DIR.mkdir(parents=True, exist_ok=True)
        for subdir, out_name, page_1 in ADM_LAW_EXCERPT_PAGES:
            i0 = page_1 - 1
            if i0 < 0 or i0 >= n:
                print(
                    "경고: 행정기본법 인용 페이지 범위 초과 —",
                    out_name,
                    page_1,
                    "총",
                    n,
                    "페이지",
                )
                return
            writer = _PypdfWriter()
            writer.add_page(reader.pages[i0])
            dest_dir = GAB_DIR / subdir
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / out_name
            with dest.open("wb") as f:
                writer.write(f)
            print("작성(법제처·갑호증):", dest.relative_to(_REPO))
        legacy_00 = ORDERED_DIR / "00_행정기본법_질의응답_사례집(인용).pdf"
        if legacy_00.is_file():
            try:
                legacy_00.unlink()
                print("삭제(구 인용 합본):", legacy_00.relative_to(_REPO))
            except OSError as e:
                print("경고: 00_ 인용 합본 삭제 실패:", e)
        for legacy_99 in (
            "99_행정기본법_질의응답_사례집(Q10).pdf",
            "99_행정기본법_질의응답_사례집(Q18).pdf",
        ):
            for folder in (ORDERED_DIR, LAWINFO_ORIG_DIR):
                p = folder / legacy_99
                if p.is_file():
                    try:
                        p.unlink()
                        print("삭제(구 99_·판례모음):", p.relative_to(_REPO))
                    except OSError as e:
                        print("경고: 구 99_ 삭제 실패:", p, e)
    except Exception as e:
        print("경고: 행정기본법 인용 PDF 생성 실패:", e)
        return

    if ORDERED_ADM_FULL.is_file():
        try:
            dest = MISC_DIR / ADM_PDF_STEM
            if dest.is_file() and dest.resolve() != ORDERED_ADM_FULL.resolve():
                dest = _misc_unique_sibling(dest)
            shutil.move(str(ORDERED_ADM_FULL), str(dest))
            print("이동(전체본→기타참고):", ORDERED_ADM_FULL.name, "->", dest.relative_to(_REPO))
        except OSError as e:
            print("경고: 02_ 전체본 기타참고 이동 실패:", e)

    final_copy = FINAL_ROOT / ADM_PDF_STEM
    misc_copy = MISC_DIR / ADM_PDF_STEM
    if final_copy.is_file() and not misc_copy.is_file():
        try:
            shutil.copy2(final_copy, misc_copy)
            print("복사(기타참고·전체본 사본):", misc_copy.relative_to(_REPO))
        except OSError as e:
            print("경고: 기타참고 전체본 복사 실패:", e)


def tidy_panrye_moum_root() -> None:
    """판례모음 루트의 중복 PDF·zip·txt·작업 폴더 등을 `행정심판청구(제출용)/최종/기타참고` 루트로 평탄화(인용순만 제외)."""
    skip: frozenset[str] = frozenset()
    MISC_DIR.mkdir(parents=True, exist_ok=True)
    if not PANRYE_ROOT.is_dir():
        return
    dab = PANRYE_ROOT / "대법원"
    if dab.is_dir():
        for item in list(dab.iterdir()):
            _relocate_child_into_misc(item, MISC_DIR)
        try:
            dab.rmdir()
            print("제거(빈 폴더):", dab.relative_to(_REPO))
        except OSError:
            try:
                shutil.rmtree(dab)
                print("제거(rmtree):", dab.relative_to(_REPO))
            except OSError as e:
                print("경고: 판례모음/대법원 제거 실패 — 수동 삭제:", e)

    for p in list(PANRYE_ROOT.iterdir()):
        if p.name in skip:
            continue
        if p.is_file():
            dest = MISC_DIR / p.name
            if dest.exists() and dest.resolve() != p.resolve():
                stem, suf = dest.stem, dest.suffix
                for i in range(2, 999):
                    alt = MISC_DIR / f"{stem}_중복{i}{suf}"
                    if not alt.exists():
                        dest = alt
                        break
            shutil.move(str(p), str(dest))
            print("기타참고 이동:", p.name, "->", dest.relative_to(_REPO))


def _remove_prior_ordered_prefixes() -> None:
    """2000두2741 제외·인용순 재번호 이전에 쓰이던 접두 파일을 삭제한다(이중 목록 방지)."""
    if not ORDERED_DIR.is_dir():
        return
    obsolete = (
        "04_2000두2741.pdf",
        "04_91누12529.pdf",
        "05_91누12529.pdf",
        "06_93누20023.pdf",
        "07_99다70600.pdf",
        "08_91누13441.pdf",
        "09_97누7875.pdf",
        "10_96누12917.pdf",
        "11_95누9020.pdf",
        "12_98두4061.pdf",
        # 구 `NN_사건번호.pdf`(사건명 없음) — `NN_사건번호_사건명.pdf`로 대체
        "01_2008두167.pdf",
        "03_96누18380.pdf",
        "04_2004두2974.pdf",
        "05_93누20023.pdf",
        "06_99다70600.pdf",
        "07_91누13441.pdf",
        "08_97누7875.pdf",
        "09_96누12917.pdf",
        "10_95누9020.pdf",
        "11_98두4061.pdf",
        "00_행정기본법_질의응답_사례집(인용).pdf",
        "99_행정기본법_질의응답_사례집(Q10).pdf",
        "99_행정기본법_질의응답_사례집(Q18).pdf",
    )
    for name in obsolete:
        p = ORDERED_DIR / name
        if p.is_file():
            try:
                p.unlink()
                print("삭제(구 인용순):", p.relative_to(_REPO))
            except OSError as e:
                print("경고: 구 인용순 PDF 삭제 실패:", p, e)


_ORDERED_ROOT_PDF = re.compile(r"^(0[0-9]|10|11)_.+\.pdf$", re.I)


def _remove_summary_alias_pdfs() -> None:
    """`사건번호_요약.pdf` 형태의 복제본을 제거한다(인용순 `NN_…`만 유지)."""
    targets = [ORDERED_DIR]
    if LAWINFO_ORIG_DIR.is_dir():
        targets.append(LAWINFO_ORIG_DIR)
    for d in targets:
        if not d.is_dir():
            continue
        for p in list(d.iterdir()):
            if not p.is_file() or p.suffix.lower() != ".pdf":
                continue
            if not p.stem.endswith("_요약"):
                continue
            try:
                p.unlink()
                print("삭제(요약 별칭):", p.relative_to(_REPO))
            except OSError as e:
                print("경고: 요약 별칭 삭제 실패:", p, e)


def _purge_legacy_panrye_ordered_pdfs() -> None:
    """과거 `(국가법령정보)판례모음`·`법령정보/`에 두던 `01_`~`11_` 인용순 PDF를 제거한다(주 출력은 `행정심판청구(제출용)/최종/법령정보/` 사건번호 파일)."""
    for d in (ORDERED_DIR, LAWINFO_ORIG_DIR):
        if not d.is_dir():
            continue
        for p in list(d.iterdir()):
            if not p.is_file() or p.suffix.lower() != ".pdf":
                continue
            if not _ORDERED_ROOT_PDF.match(p.name):
                continue
            try:
                p.unlink()
                print("삭제(구 판례모음·인용순):", p.relative_to(_REPO))
            except OSError as e:
                print("경고: 구 인용순 PDF 삭제 실패:", p, e)


def _remove_legacy_ordered_short_pdfs() -> None:
    """구 `NN_사건번호.pdf`만 있던 인용순 파일명이 남아 있고 신규 `NN_사건번호_사건명.pdf`도 있으면 구본을 삭제한다."""
    if not ORDERED_DIR.is_dir():
        return
    for c in CASES:
        new = CASE_OUT[c["file"]]
        if new.parent != ORDERED_DIR:
            continue  # 판례 출력은 `법령정보/` 등으로 이동
        parts = new.name.split("_", 2)
        if len(parts) < 3 or parts[1] != c["evt"]:
            continue
        old = ORDERED_DIR / f"{parts[0]}_{parts[1]}.pdf"
        if (
            old.is_file()
            and new.is_file()
            and old.resolve() != new.resolve()
        ):
            try:
                old.unlink()
                print("삭제(구 인용순 파일명):", old.relative_to(_REPO))
            except OSError as e:
                print("경고: 구 인용순 PDF 삭제 실패:", old, e)


def _remove_legacy_short_misc_pdfs() -> None:
    """구 `사건번호.pdf`만 쓰던 기타참고 파일명이 남아 있고 새 `사건번호_사건명.pdf`도 있으면 구본을 삭제한다."""
    if not MISC_DIR.is_dir():
        return
    for c in CASES:
        old = MISC_DIR / f"{c['evt']}.pdf"
        new = MISC_DIR / c["file"]
        if (
            old.is_file()
            and new.is_file()
            and old.resolve() != new.resolve()
        ):
            try:
                old.unlink()
                print("삭제(구 기타참고 파일명):", old.relative_to(_REPO))
            except OSError as e:
                print("경고: 구 PDF 삭제 실패:", old, e)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="국가법령정보센터 기준 판례 요약 PDF 생성",
    )
    ap.add_argument(
        "--skip-existing",
        action="store_true",
        help="법령정보 등 출력 경로에 동일 파일이 있으면 덮어쓰지 않음(대조 완료본 보호).",
    )
    args = ap.parse_args()
    generated = date.today().isoformat()
    merge_legacy_panrye_gita()
    MISC_DIR.mkdir(parents=True, exist_ok=True)
    flatten_daebub_worktree_in_misc()
    ORDERED_DIR.mkdir(parents=True, exist_ok=True)
    GAB_DIR.mkdir(parents=True, exist_ok=True)
    LAW_INFO_DIR.mkdir(parents=True, exist_ok=True)
    MISC_DIR.mkdir(parents=True, exist_ok=True)
    _remove_prior_ordered_prefixes()
    _remove_summary_alias_pdfs()
    for c in CASES:
        pdf = PrecPDF()
        write_one(pdf, c, generated)
        path = CASE_OUT[c["file"]]
        if args.skip_existing and path.is_file():
            print("건너뜀(기존 유지):", path.relative_to(_REPO))
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        pdf.output(str(path))
        print("작성:", path.relative_to(_REPO))
    _remove_legacy_short_misc_pdfs()
    _remove_legacy_ordered_short_pdfs()
    _build_admin_law_excerpt_and_relocate_full()
    _purge_legacy_panrye_ordered_pdfs()
    tidy_panrye_moum_root()


if __name__ == "__main__":
    main()
