#Requires -Version 5.1
# UTF-8
# 포트 8282 고정. 기존 LISTENING 프로세스 종료 후 node start.js 를 새 cmd 창에서 실행합니다.
# Chrome 자동 실행은 start.js(tryOpenChromeWithUrl)에서 처리합니다. 끄기: COMMISSION_OPEN_CHROME=0
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Port = 8282
$root = $PSScriptRoot
Set-Location -LiteralPath $root

Write-Host ""
Write-Host "============================================"
Write-Host "  commission-portal 서버 시작 (포트 $Port 고정)"
Write-Host "============================================"
Write-Host ""

Write-Host "$(Get-Date -Format 'HH:mm:ss') 포트 $Port LISTENING 프로세스 종료..."
$done = @{}
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $id = $_.OwningProcess
    if (-not $done.ContainsKey($id)) {
        $done[$id] = $true
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        Write-Host "  PID $id 종료"
    }
}
if ($done.Count -eq 0) {
    Write-Host "  (해당 포트에서 LISTENING 프로세스 없음)"
}

Start-Sleep -Seconds 1

$startJs = Join-Path $root "start.js"
if (-not (Test-Path -LiteralPath $startJs)) {
    Write-Error "start.js 가 없습니다. 이 스크립트를 commission-portal 폴더에 두세요."
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node 가 PATH 에 없습니다. Node.js 18+ 를 설치하세요."
    exit 1
}

Write-Host "$(Get-Date -Format 'HH:mm:ss') 서버를 새 cmd 창에서 띄웁니다. 종료는 그 창에서 Ctrl+C."
Write-Host ""

$env:PORT = "$Port"
Start-Process cmd.exe -ArgumentList @(
    "/k",
    "chcp 65001 >nul && cd /d `"$root`" && set PORT=$Port && node start.js"
) -WindowStyle Normal
