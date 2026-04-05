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
$repoRoot = Resolve-Path -LiteralPath (Join-Path $portalRoot "..\..")
$env:COMMISSION_REPO_ROOT = $repoRoot.Path
$finalDir = Join-Path $repoRoot.Path "행정심판청구(최종)"
Write-Host "MD 저장·/serve/ 루트: $($repoRoot.Path)"
Write-Host "정본 폴더(없으면 저장 시 생성): $finalDir"

$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$url = "http://127.0.0.1:$port/"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js가 PATH에 없습니다. Node 18 이상을 설치한 뒤 다시 실행하세요."
  exit 1
}

$proc = Start-Process -FilePath "node" -ArgumentList "start.js" `
  -WorkingDirectory $portalRoot -PassThru -WindowStyle Minimized

Start-Sleep -Seconds 2
try {
  Start-Process $url
} catch {
  Write-Host "브라우저를 열 수 없습니다. 직접 주소를 여세요: $url"
}

Write-Host "Commission Portal: $url (PID $($proc.Id), 중지: Stop-Process -Id $($proc.Id))"
Wait-Process -InputObject $proc
