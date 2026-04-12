#Requires -Version 5.1
# USB Web 폴더에서 포털 실행. COMMISSION_REPO_ROOT = USB 드라이브 루트.
# Node: ① runtime\node-win-x64\node.exe (포터블) ② PATH 의 node
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$WebRoot = $PSScriptRoot
$repoRoot = [System.IO.Path]::GetPathRoot($WebRoot)
$evidenceDir = Join-Path $repoRoot "갑호증및법령정보"

if (-not (Test-Path -LiteralPath $evidenceDir)) {
    Write-Error @"
증거 폴더가 없습니다: $evidenceDir
USB 루트에 '갑호증및법령정보' 폴더를 두세요.
"@
    exit 1
}

$portable = Join-Path $WebRoot "runtime\node-win-x64\node.exe"
$nodeExe = $null
if (Test-Path -LiteralPath $portable) {
    $nodeExe = $portable
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeExe = "node"
} else {
    Write-Error @"
Node.js 실행 파일이 없습니다.
  • 저장소에서: .\tools\download_portable_node.ps1 실행 후 Web\runtime\node-win-x64\ 에 배치되도록 publish 하거나,
  • 이 PC에 Node.js 18+ 를 설치하세요.
"@
    exit 1
}

$env:COMMISSION_REPO_ROOT = $repoRoot.TrimEnd('\')
$env:COMMISSION_QUIET = "1"
# PC 전역 PORT=3000 등이 있으면 상속되어 서버·브라우저 포트가 어긋남 → 항상 8282
$env:PORT = "8282"
$portal = Join-Path $WebRoot "commission-portal"

# Mark of the Web 제거
try { Unblock-File -LiteralPath $PSCommandPath -ErrorAction SilentlyContinue } catch { }
if ($nodeExe -and (Test-Path -LiteralPath $nodeExe)) {
  try { Unblock-File -LiteralPath $nodeExe -ErrorAction SilentlyContinue } catch { }
}
$startJs = Join-Path $portal "start.js"
if (-not (Test-Path -LiteralPath $startJs)) {
    Write-Error @"
commission-portal 가 없습니다: $portal
USB 의 usb_bundle 폴더가 온전한지 확인하세요. (commission-portal\start.js)
"@
    exit 1
}
try { Unblock-File -LiteralPath $startJs -ErrorAction SilentlyContinue } catch { }

$nm = Join-Path $portal "node_modules"
if (-not (Test-Path -LiteralPath $nm)) {
    Write-Warning "node_modules 없음 — 개발 PC에서 tools\build_bundle_usb_bundle.ps1 로 번들을 다시 만든 뒤 USB에 복사하세요."
}

$sp = @{
    FilePath               = $nodeExe
    ArgumentList           = "start.js"
    WorkingDirectory       = $portal
    WindowStyle            = "Minimized"
    PassThru               = $true
}
Start-Process @sp | Out-Null

$listenPort = [int]$env:PORT
$url = "http://127.0.0.1:$listenPort/"
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect("127.0.0.1", $listenPort)
        $c.Close()
        $ready = $true
        break
    } catch { }
}

if ($ready) {
    try { Start-Process $url } catch {
        try { Start-Process "msedge.exe" -ArgumentList $url -ErrorAction SilentlyContinue } catch { }
    }
} else {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.MessageBox]::Show(
            "포털 서버가 20초 안에 뜨지 않았습니다.`n`n• 작업 관리자에서 node.exe 가 있는지`n• 백신이 node.exe 를 차단하지 않는지`n• USB 루트에 갑호증및법령정보 폴더가 있는지`n• 포트 $listenPort 가 다른 프로그램에 잡혀 있지 않은지`n`n서버가 뜬 뒤 브라우저 주소창에 직접 입력:`n$url",
            "commission-portal — 연결 실패",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        )
    } catch {
        Write-Host "연결 실패. 브라우저에 직접 입력: $url"
    }
    exit 1
}
