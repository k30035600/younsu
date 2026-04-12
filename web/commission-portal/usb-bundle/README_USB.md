# 행정심판 포털 (USB 독립 실행)

## 저장소 루트와 실제 USB 드라이브 구분

**독립 실행 번들**은 이동식 드라이브 루트(예: `F:\`)의 `Web\`·`갑호증및법령정보\` 입니다. `publish_commission_portal_usb.ps1`은 **`-UsbDriveLetter`로 지정한 드라이브**에만 복사하며, 저장소 안의 `USB\` 같은 로컬 미러 폴더는 도구가 읽지 않습니다(있어도 없어도 됨).

## USB 루트 (예: `F:\`)

| 폴더 | 설명 |
|------|------|
| `갑호증및법령정보\` | 증거·법령 PDF (**필수**) |
| `Web\` | 포털 |

## `Web` 안 구조

| 경로 | 설명 |
|------|------|
| `commission-portal\` | `start.js` + `public\` (서면·정적 파일·**vendor** 오프라인용) |
| `runtime\node-win-x64\` | **포터블 Node** (`node.exe` 등). 없으면 PC에 Node 설치 필요 |
| `start-portal.ps1` / `start-portal.bat` | 실행 |

## 오프라인·Node 미설치 PC에서 쓰려면

1. **포터블 Node** — 개발 PC에서 한 번 실행:
   ```powershell
   .\tools\download_portable_node.ps1
   ```
   그 다음 `publish_commission_portal_usb.ps1` 로 USB에 올리면 `Web\runtime\node-win-x64\` 가 복사됩니다.

2. **브라이브러리 로컬 번들** — `public\vendor\`(marked, pdf.js)가 있어야 CDN 없이 동작합니다. 저장소에서:
   ```powershell
   cd web\commission-portal
   npm ci
   npm run vendor:copy
   ```
   후 USB 배포(`publish_commission_portal_usb.ps1`).

## 실행

`Web\start-portal.bat` 더블클릭 또는 `start-portal.ps1` → `http://127.0.0.1:8282/` (PC 전역 `PORT` 환경 변수와 무관하게 런처가 항상 8282 고정)

`COMMISSION_REPO_ROOT`는 USB 드라이브 루트(예: `F:\`)로 자동 설정됩니다.

**USB·번들**에는 보통 `행정심판청구(원본)` 폴더가 없으므로, 웹 화면은 **제출원문·갑호증·법령·증거 조회 전용**이며 우측 MD 편집기와 「파일 저장(MD)」은 나오지 않습니다. 원문 편집·저장은 저장소 클론에서 `web/commission-portal`을 `npm start` 한 포털에서 하세요.

## 글꼴

나눔고딕/명조는 Google Fonts CDN을 씁니다. **완전 오프라인**이면 시스템 글꼴로 대체됩니다(기능은 동작).

## 다시 만들기

```powershell
.\tools\publish_commission_portal_usb.ps1 -UsbDriveLetter F
```
