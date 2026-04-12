#Requires -Version 5.1
# Official Node.js Windows x64 zip -> usb-bundle/runtime (no system Node on target PC).
param(
    [string]$Version = "20.18.3",
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $OutDir) {
    $OutDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\web\commission-portal\usb-bundle\runtime\node-win-x64"))
}

$zipName = "node-v$Version-win-x64.zip"
$url = "https://nodejs.org/dist/v$Version/$zipName"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "node-portable-$Version"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$zipPath = Join-Path $tmp $zipName

Write-Host "Download: $url"
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
Expand-Archive -LiteralPath $zipPath -DestinationPath $tmp -Force

$inner = Join-Path $tmp "node-v$Version-win-x64"
if (-not (Test-Path -LiteralPath $inner)) {
    Write-Error "Unexpected zip layout: $inner"
    exit 1
}

if (Test-Path -LiteralPath $OutDir) {
    Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Copy-Item -Path (Join-Path $inner "*") -Destination $OutDir -Recurse -Force

Write-Host "Portable Node OK: $OutDir"
$nodeBin = Join-Path $OutDir "node.exe"
Write-Host "node --version:"
& $nodeBin --version
