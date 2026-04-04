이 폴더는 일회성·과거 마이그레이션·드물게만 쓰는 스크립트를 둡니다.
루트 tools/에는 전수조사·포털 JSON·QR·감사 등 반복 사용 도구만 둡니다.

실행 시 저장소 루트에서:
  python tools/archive/<스크립트명>.py

스크립트 내부 _REPO 는 Path(__file__).resolve().parents[2] (archive 한 단계 깊음).

보관 목록(요지):
  _merge_260402_from_260330.py     — 260330→260402 병합(일회성)
  _migrate_evidence_path_to_final.py — 증거 경로에 최종/ 삽입(일회성)
  260402_copy_evidence_gab.py       — 돌심방→갑호증 복사(구 트리)
  260402_organize_folders.py        — 증거 폴더 정리(일회성)
  260402_dedupe_misc_zip.py         — 법령정보·판례모음 중복 정리(일회성)
  copy_junggong_photos_to_gab9.py   — 준공식 사진→갑9(일회성)
  rename_gab62_video_to_standard.py — 구 MP4 파일명 표준화(일회성)
  strip_gab_body_noise_renumber.py  — 본문 잡표기 제거·재번호(일회성)
  move_haengjeong_housekeeping_to_temp.py — 루트기록→temp (temp 사용 시)

현행 증거 경로·빌드: 행정심판청구(증거)/최종/, docs/scripts/, 루트 tools/.
