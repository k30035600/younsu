#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$startup = [Environment]::GetFolderPath("Startup")
if ([string]::IsNullOrWhiteSpace($startup)) {
  $startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
}
$lnkPath = Join-Path $startup "Commission Portal (local).lnk"
if (Test-Path -LiteralPath $lnkPath) {
  Remove-Item -LiteralPath $lnkPath -Force
  Write-Host "제거됨: $lnkPath"
} else {
  Write-Host "바로가기가 없습니다: $lnkPath"
}
