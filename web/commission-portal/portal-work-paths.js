"use strict";

/**
 * 저장소 루트 기준 — commission-portal 이 다루는 작업 트리 폴더 이름(POSIX).
 * `start.js` 와 `GET /api/portal-profile` 의 `workLayout` 이 여기만 본다.
 * (실제 파일 배치·USB 동기화는 tools/sync_commission_usb.ps1 등이 담당.)
 */
const WONMUN_DIR = "행정심판청구(원본)";
const SUBMIT_DIR = "행정심판청구(제출용)";
/** 레이아웃 탐지용(구 트리): `제출용/최종` */
const SUBMIT_LEGACY_FINAL = "최종";
/** 탭·tabSources·저장 허용 제출 원문 MD 디렉터리 */
const WONMUN_SUBMIT_WONMUN = "제출원문(원본)";
/**
 * portal-data·`/serve/` URL 에 쓰는 rel 접두 — 디스크 실물은 `SUBMIT_DIR/EVIDENCE_UNIFIED/…`
 */
const EVIDENCE_UNIFIED = "갑호증및법령정보";
/** 허용 저장 MD(허브·드롭다운 등) */
const WONMUN_WORK_AUX = "작업보조";
/** 레거시 URL·경로 정규화용(현재 클론에 폴더가 없을 수 있음) */
const WONMUN_URL_LEGACY_FINAL = "행정심판청구(최종)";

function workLayoutPayload() {
  return {
    wonmunDir: WONMUN_DIR,
    submitDir: SUBMIT_DIR,
    submitLegacyFinal: SUBMIT_LEGACY_FINAL,
    wonmunSubmitWonmun: WONMUN_SUBMIT_WONMUN,
    evidenceUnified: EVIDENCE_UNIFIED,
    wonmunWorkAux: WONMUN_WORK_AUX,
    wonmunUrlLegacyFinal: WONMUN_URL_LEGACY_FINAL,
  };
}

module.exports = {
  WONMUN_DIR,
  SUBMIT_DIR,
  SUBMIT_LEGACY_FINAL,
  WONMUN_SUBMIT_WONMUN,
  EVIDENCE_UNIFIED,
  WONMUN_WORK_AUX,
  WONMUN_URL_LEGACY_FINAL,
  workLayoutPayload,
};
