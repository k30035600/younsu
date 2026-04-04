# docs/260404 — Word·제출용 TXT 산출

**규칙:** 제출용 **DOCX**·**제출용 TXT**는 **`docs/{yymmdd}/`** 에만 둡니다. **`행정심판청구(최종)/` 직하에는 Markdown 정본만** 두고, Word 파일은 이 폴더로 옮기거나 빌드 스크립트가 여기에 씁니다.

| 산출물 | 생성 |
|--------|------|
| `260404_01_행정심판청구서_최종.docx` | `python docs/scripts/260404_build_final_docx.py --01` |
| `260404_02_집행정지신청서_최종.docx` | `python docs/scripts/260404_build_final_docx.py --02` |
| `260404_*_제출용.txt` | `python docs/scripts/export_submission_txt.py` |

입력 MD는 항상 `행정심판청구(최종)/260404_01_…`, `…/260404_02_…` (접두 `yymmdd_` 가 빌드 스크립트의 날짜 폴더와 맞을 것).

다음 날짜 묶음(예: `260405`)을 만들 때는 **`docs/260405/`** 를 만들고, 스크립트 내 `DOCS_OUT`(또는 동일 패턴)을 그 경로로 바꾸거나 인자화하면 됩니다.

자세한 절차: [최종본-docx-빌드.md](../최종본-docx-빌드.md)
