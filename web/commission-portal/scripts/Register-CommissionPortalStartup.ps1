#Requires -Version 5.1
# Windows 시작 프로그램에 Commission Portal 로컬 서버 바로가기를 등록합니다(관리자 권한 불필요).
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$portalRoot = Split-Path -Parent $PSScriptRoot
$runBat = Join-Path $portalRoot "run-local.bat"
if (-not (Test-Path -LiteralPath $runBat)) {
  Write-Error "run-local.bat을 찾을 수 없습니다: $runBat"
  exit 1
}

$startup = [Environment]::GetFolderPath("Startup")
if ([string]::IsNullOrWhiteSpace($startup)) {
  $startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
}
if (-not (Test-Path -LiteralPath $startup)) {
  New-Item -ItemType Directory -Force -Path $startup | Out-Null
}
$lnkPath = Join-Path $startup "Commission Portal (local).lnk"

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnkPath)
$sc.TargetPath = $runBat
$sc.Arguments = ""
$sc.WorkingDirectory = $portalRoot
$sc.Description = "행정심판 commission-portal 로컬 서버 (http://127.0.0.1:8282)"
$sc.Save()

Write-Host "등록됨: $lnkPath"
Write-Host "제거: 위 .lnk 파일을 삭제하거나 이 스크립트 옆의 Unregister 스크립트를 실행하세요."
