#Requires -Version 5.1
# UTF-8
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$portalRoot = $PSScriptRoot
Set-Location -LiteralPath $portalRoot

if (-not (Test-Path -LiteralPath (Join-Path $portalRoot "node_modules"))) {
  npm install
}

# monorepo 루트(younsu) — /serve/ 경로가 저장소와 맞도록
$portalRoot = $PSScriptRoot
# 한 단계 위가 web, 그 위가 younsu(root)
$repoRoot = Split-Path (Split-Path $portalRoot -Parent) -Parent
$env:COMMISSION_REPO_ROOT = $repoRoot
$finalDir = Join-Path $repoRoot "행정심판청구(원본)"
Write-Host "MD 저장·/serve/ 루트: $repoRoot"
Write-Host "정본 폴더: $finalDir"

$port = if ($env:PORT) { [int]$env:PORT } else { 8282 }
$url = "http://127.0.0.1:$port/"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js가 PATH에 없습니다. Node 18 이상을 설치한 뒤 다시 실행하세요."
  exit 1
}

# 브라우저(Chrome)는 start.js 가 listen 직후 자동으로 엽니다. 끄기: $env:COMMISSION_OPEN_CHROME = "0"
$proc = Start-Process -FilePath "node" -ArgumentList "start.js" `
  -WorkingDirectory $portalRoot -PassThru -WindowStyle Minimized

Write-Host "Commission Portal: $url (PID $($proc.Id), 중지: Stop-Process -Id $($proc.Id))"
Wait-Process -InputObject $proc
