#Requires -Version 5.1
# marked·pdfjs-dist 를 public/vendor 로 복사 → CDN 없이(오프라인) 브라우저에서 동작.
$ErrorActionPreference = "Stop"
$portal = Split-Path -Parent $PSScriptRoot
$nm = Join-Path $portal "node_modules"
$v = Join-Path $portal "public\vendor"

$markedSrc = Join-Path $nm "marked\lib\marked.esm.js"
$pdfM = Join-Path $nm "pdfjs-dist\build\pdf.mjs"
$pdfW = Join-Path $nm "pdfjs-dist\build\pdf.worker.mjs"

foreach ($p in @($markedSrc, $pdfM, $pdfW)) {
    if (-not (Test-Path -LiteralPath $p)) {
        Write-Error "없음: $p`ncommission-portal 에서 npm ci 실행 후 다시 시도하세요."
        exit 1
    }
}

New-Item -ItemType Directory -Path (Join-Path $v "marked") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $v "pdfjs") -Force | Out-Null
Copy-Item -LiteralPath $markedSrc -Destination (Join-Path $v "marked\marked.esm.js") -Force
Copy-Item -LiteralPath $pdfM -Destination (Join-Path $v "pdfjs\pdf.mjs") -Force
Copy-Item -LiteralPath $pdfW -Destination (Join-Path $v "pdfjs\pdf.worker.mjs") -Force
Write-Host "OK: $v"
