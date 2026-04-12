# 시가지건축취체규칙 등 조선총독부 관보 열람용
# - 국사편찬위원회: 해당 기사 직링크 · 관보 검색
# - 국립중앙도서관: 관보 검색 + 원문 스캔 뷰어(제169호 001면)

$urls = @(
    "https://db.history.go.kr/id/gb_1913_02_25_a01690_0010",
    "https://db.history.go.kr/modern/gb/level.do?itemId=gb",
    "http://viewer.nl.go.kr:8080/gwanbo/viewer.jsp?pageId=GB_19130225_BA0169_001",
    "https://www.nl.go.kr/NL/contents/N20302010000.do"
)
foreach ($u in $urls) {
    Start-Process $u
}
