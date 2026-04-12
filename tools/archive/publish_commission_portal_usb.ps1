#Requires -Version 5.1
# UTF-8 — 이동식 드라이브 루트(F:\ 등)에 포털 배포. 저장소 younsu\USB\ 경로에는 쓰지 않음.
# 증거는 드라이브 루트 `갑호증및법령정보/` 필요. 소스에서 npm ci + vendor:copy 후 복사(오프라인용 public/vendor).
param(
    [string]$UsbDriveLetter = "F",
    [switch]$SkipNpm,
    [switch]$SkipVendorCopy
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$usbRoot = "${UsbDriveLetter}:\"
if (-not (Test-Path -LiteralPath $usbRoot)) {
    Write-Error "드라이브 없음: $usbRoot"
    exit 1
}

$repoYounsu = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$portalSrc = Join-Path $repoYounsu "web\commission-portal"
$webRoot = Join-Path $usbRoot "Web"
$portalDst = Join-Path $webRoot "commission-portal"
$evidence = Join-Path $usbRoot "갑호증및법령정보"

New-Item -ItemType Directory -Path $webRoot -Force | Out-Null

if (-not $SkipNpm) {
    Push-Location $portalSrc
    try {
        npm ci
    } finally {
        Pop-Location
    }
}
if (-not $SkipVendorCopy) {
    Push-Location $portalSrc
    try {
        npm run vendor:copy
    } finally {
        Pop-Location
    }
}

$vendorMarked = Join-Path $portalSrc "public\vendor\marked\marked.esm.js"
if (-not (Test-Path -LiteralPath $vendorMarked)) {
    Write-Warning "public\vendor 가 비었습니다. commission-portal 에서 npm ci 후 npm run vendor:copy 하세요."
}

robocopy $portalSrc $portalDst /E /XD node_modules usb-bundle /R:2 /W:2 | Out-Null

# 행정심판 청구·별지·집행정지 최종 MD → Web\md (USB만 있을 때 tabSources 경로는 start.js 가 Web\md 로 대응)
$portalDataPath = Join-Path $portalSrc "public\data\portal-data.json"
$webMdDst = Join-Path $webRoot "md"
if (Test-Path -LiteralPath $portalDataPath) {
    $raw = [System.IO.File]::ReadAllText($portalDataPath, [System.Text.UTF8Encoding]::new($false))
    $j = $raw | ConvertFrom-Json
    $ts = $j.meta.tabSources
    if ($ts) {
        New-Item -ItemType Directory -Path $webMdDst -Force | Out-Null
        $sep = [IO.Path]::DirectorySeparatorChar
        foreach ($key in @("appeal", "injunction", "gab1", "gab2", "gab3", "gab4")) {
            $rel = [string]$ts.$key
            if ([string]::IsNullOrWhiteSpace($rel)) { continue }
            $leaf = Split-Path -Path ($rel.Replace("\", "/")) -Leaf
            $srcAbs = Join-Path $repoYounsu ($rel.Replace("/", $sep))
            if (Test-Path -LiteralPath $srcAbs) {
                Copy-Item -LiteralPath $srcAbs -Destination (Join-Path $webMdDst $leaf) -Force
            } else {
                Write-Warning "MD 원본 없음(건너뜀): $srcAbs"
            }
        }
        Write-Host "Web\md: $webMdDst"
    }
} else {
    Write-Warning "portal-data.json 없음 — Web\md 복사 생략"
}

$runtimeSrc = Join-Path $portalSrc "usb-bundle\runtime\node-win-x64"
$runtimeDst = Join-Path $webRoot "runtime\node-win-x64"
if (Test-Path -LiteralPath (Join-Path $runtimeSrc "node.exe")) {
    New-Item -ItemType Directory -Path (Split-Path $runtimeDst -Parent) -Force | Out-Null
    robocopy $runtimeSrc $runtimeDst /E /R:2 /W:2 | Out-Null
} else {
    Write-Warning "포터블 Node 없음: $runtimeSrc → .\tools\download_portable_node.ps1 실행 후 다시 publish 하세요."
}

function Replace-PhysicalRootHint {
    param([string]$FilePath, [string]$HintJsonEscaped)
    $enc = New-Object System.Text.UTF8Encoding $false
    $t = [System.IO.File]::ReadAllText($FilePath, $enc)
    $repl = '"physicalRootHint": "' + $HintJsonEscaped + '"'
    $t = [System.Text.RegularExpressions.Regex]::Replace(
        $t,
        '"physicalRootHint"\s*:\s*"[^"]*"',
        $repl
    )
    [System.IO.File]::WriteAllText($FilePath, $t, $enc)
}

$gabJson = Join-Path $portalDst "public\data\repo-folders-gab.json"
$lawJson = Join-Path $portalDst "public\data\repo-folders-law.json"
$gabHint = ($UsbDriveLetter + ':\갑호증및법령정보').Replace('\', '\\')
$lawHint = ($UsbDriveLetter + ':\갑호증및법령정보\법령정보').Replace('\', '\\')
if (Test-Path -LiteralPath $gabJson) { Replace-PhysicalRootHint $gabJson $gabHint }
if (Test-Path -LiteralPath $lawJson) { Replace-PhysicalRootHint $lawJson $lawHint }

$bundle = Join-Path $portalSrc "usb-bundle"
Copy-Item -LiteralPath (Join-Path $bundle "start-portal.ps1") -Destination $webRoot -Force
Copy-Item -LiteralPath (Join-Path $bundle "start-portal.bat") -Destination $webRoot -Force
Copy-Item -LiteralPath (Join-Path $bundle "README_USB.md") -Destination $webRoot -Force
# 드라이브 루트 런처는 tools\sync_commission_usb.ps1 가 단일 이름으로 생성합니다.
# 예전 publish 가 F:\ 에 복사하던 배치는 sync 런처와 중복되므로 더 이상 복사하지 않고, 있으면 제거합니다.
$deprecatedRootLauncher = Join-Path $usbRoot "자동실행_이파일을 더블클릭하면 화면으로 심사를 할 수 있습니다.bat"
if (Test-Path -LiteralPath $deprecatedRootLauncher) {
    Remove-Item -LiteralPath $deprecatedRootLauncher -Force
}

Write-Host "Done: $webRoot"
Write-Host "Evidence folder exists: $(Test-Path -LiteralPath $evidence) -> $evidence"
