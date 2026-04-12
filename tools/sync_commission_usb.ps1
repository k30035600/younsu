#Requires -Version 5.1
<#
.SYNOPSIS
  행심위 제출용 USB: 드라이브 루트에 (1) 더블클릭 런처 (2) 번들용 — 포털 + 번들 내부 증거·원본 트리 (3) **독립 실행용** `갑호증및법령정보` — USB에 이미 있으면 검증만(일치 시 복사 생략) (4) **독립 실행용** `제출원문(PDF)` — 저장소 **`행정심판청구(원본)\제출원문(PDF)\*.pdf` 만** 복사(동일 파일명은 수정 시각 최신 1건). MD 병합은 원본·제출용 각각 `제출원문(MD)` 직하. 포털 `COMMISSION_REPO_ROOT`=드라이브 루트일 때 `start.js` 가 루트 폴더를 사용.
  제외: 법령정보\README.md, 최종 README_제출본_백업규칙.md. 구 CommissionReview_USB·행정심판청구서제출서류 폴더는 동기화 시 제거.
  -ClearUsbTargetsBeforeSync -ConfirmClearUsbTargets: 포맷 없이 위 대상·구 폴더·구 런처만 지운 뒤 복사(F: 전체 삭제 아님).

.PARAMETER RepoRoot
  younsu repo root (parent of web\, folders with evidence and final docs).

.PARAMETER BundlePath
  번들(포털·증거·작업용 트리) 출력 폴더 전체 경로. 비우면 (LauncherDriveRoot)\번들용(한글 이름).

.PARAMETER UseRepoBundle
  `-BundlePath` 가 비어 있을 때 **저장소 루트 아래 `Bundle`** 을 씁니다(예: `D:\OneDrive\Cursor\younsu\Bundle`). USB 루트 동기화는 `-LauncherDriveRoot` 그대로.

.PARAMETER PromptBundlePath
  실행 시 번들 경로를 Read-Host 로 입력(미입력 시 -BundlePath 사용).

.PARAMETER LauncherDriveRoot
  .bat 런처를 둘 드라이브 루트(기본 F:\).

.PARAMETER FormatVolumeF
  번들 경로의 드라이브 문자(예 F:) 볼륨을 NTFS 로 포맷한 뒤 복사. 데이터 전부 삭제. 관리자 권한이 필요할 수 있습니다. **`-UseRepoBundle` 와 함께 쓰지 마세요**(로컬 디스크 포맷 위험).

.PARAMETER ConfirmFormatFDestructive
  -FormatVolumeF 와 반드시 함께 지정. 미지정 시 포맷하지 않습니다.

.PARAMETER WithPortableNode
  portal\_node 에 Node win-x64 포함.

.PARAMETER LauncherOnly
  런처 .bat 만 갱신.

.PARAMETER DataOnly
  포털·npm 생략. 번들(포털) 내 증거·최종 + USB 루트 `갑호증및법령정보`·`제출원문` 만 갱신.

.PARAMETER AuditOnly
  전수조사만.

.PARAMETER SkipAudit
  동기화 끝 전수조사 생략.

.PARAMETER ClearUsbTargetsBeforeSync
  포맷 없이 USB 동기화 대상만 삭제한 뒤 복사합니다. 삭제: 번들용·갑호증및법령정보·제출원문, 구 CommissionReview_USB·행정심판청구서제출서류 등, 구 런처·안내 파일(드라이브 루트). 반드시 -ConfirmClearUsbTargets 와 함께 지정.

.PARAMETER ConfirmClearUsbTargets
  -ClearUsbTargetsBeforeSync 사용 시 필수(오동작 방지).
#>
param(
  [string]$RepoRoot = "",
  [string]$BundlePath = "",
  [switch]$UseRepoBundle,
  [string]$LauncherDriveRoot = "F:\",
  [switch]$PromptBundlePath,
  [switch]$FormatVolumeF,
  [switch]$ConfirmFormatFDestructive,
  [switch]$ClearUsbTargetsBeforeSync,
  [switch]$ConfirmClearUsbTargets,
  [switch]$WithPortableNode,
  [string]$PortableNodeVersion = "v20.18.0",
  [switch]$LauncherOnly,
  [switch]$DataOnly,
  [switch]$AuditOnly,
  [switch]$SkipAudit
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function U([int[]]$codes) {
  return -join ($codes | ForEach-Object { [char]$_ })
}

# Folder names as Unicode code units (avoids .ps1 file encoding issues on Windows PowerShell)
$evidenceDirName = U 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0x28, 0xC81C, 0xCD9C, 0xC6A9, 0x29
# 행정심판청구(원본) — 제출원문(MD) 등 원문 작업 루트
$finalDirName    = U 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0x28, 0xC6D0, 0xBCF8, 0x29
$gabSubfolder    = U 0xAC11, 0xD638, 0xC99D
$lawDirName      = U 0xBC95, 0xB839, 0xC815, 0xBCF4
# 제출용 단일 트리(신규): …/(제출용)/갑호증및법령정보/{갑제N호증…, 법령정보}
$unifiedEvidenceTreeName = (U 0xAC11, 0xD638, 0xC99D) + (U 0xBC0F) + (U 0xBC95, 0xB839, 0xC815, 0xBCF4)
# 구 통합명(공백 포함) — 동기화 시 우선 신규 폴더가 있으면 그쪽을 씀
$unifiedEvidenceTreeNameLegacy = (U 0xAC11, 0xD638, 0xC99D) + " " + (U 0xBC0F) + " " + (U 0xBC95, 0xB839, 0xC815, 0xBCF4)
$evidenceInnerFinal = U 0xCD5C, 0xC885
$submitDocsDirName = U 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0xC11C, 0xC81C, 0xCD9C, 0xC11C, 0xB958
# 구 제출 폴더명(번들 안·드라이브 루트) — 동기화 시 제거
$legacySubmitDirName = U 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0x5F, 0xC81C, 0xCD9C, 0xC11C, 0xB958
# USB 드라이브 루트(행심위 제출용): 번들용 / 갑호증및법령정보 / 제출원문
$usbBundleFolderName = U 0xBC88, 0xB4E4, 0xC6A9
$usbUnifiedEvidenceUsbName = (U 0xAC11, 0xD638, 0xC99D) + (U 0xBC0F) + (U 0xBC95, 0xB839, 0xC815, 0xBCF4)
$usbSubmitOriginalFolderName = (U 0xC81C, 0xCD9C) + (U 0xC6D0, 0xBB38) + "(PDF)"
$usbSubmitOldFlatName = (U 0xC81C, 0xCD9C) + (U 0xC6D0, 0xBB38)
$legacyBundleFolderEnglish = "CommissionReview_USB"
# USB에 넣지 않음: 법령정보 트리의 README.md, 최종 루트의 백업 규칙 MD
$usbExcludeLawReadmeName = "README.md"
$usbExcludeFinalMdName = "README_제출본_백업규칙.md"
# 런처: USB 루트에 생성되는 .bat 이름. 구 이름은 $retiredUsbLauncherBats·$oldKoreanLauncherOutputBat 로 삭제
$oldKoreanLauncherOutputBat = (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0xAC00, 0x20, 0xD654, 0xBA74, 0xC73C, 0xB85C, 0x20, 0xCD9C, 0xB825, 0xB429, 0xB2C8, 0xB2E4) + ".bat"
$koreanLauncherOnly = (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xBA74, 0x20, 0xCCAD, 0xAD6C, 0xC11C, 0x20, 0xBC0F, 0x20, 0xC2E0, 0xCCAD, 0xC11C, 0xB97C, 0x20, 0xD654, 0xBA74, 0xC73C, 0xB85C, 0x20, 0xBCFC, 0x20, 0xC218, 0x20, 0xC788, 0xC2B5, 0xB2C8, 0xB2E4) + ".vbs"
$koreanLauncherOldBat = (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xBA74, 0x20, 0xCCAD, 0xAD6C, 0xC11C, 0x20, 0xBC0F, 0x20, 0xC2E0, 0xCCAD, 0xC11C, 0xB97C, 0x20, 0xD654, 0xBA74, 0xC73C, 0xB85C, 0x20, 0xBCFC, 0x20, 0xC218, 0x20, 0xC788, 0xC2B5, 0xB2C8, 0xB2E4) + ".bat"
# 예전에 USB 루트에 복사하던 이름(「더블클릭을 하면…」) — 동기화 시 제거해 루트 런처는 $koreanLauncherOnly 하나만 유지
$legacyWebLayoutLauncherBat = (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0xC744, 0x20, 0xD558, 0xBA74, 0x20, 0xCCAD, 0xAD6C, 0xC11C, 0x20, 0xBC0F, 0x20, 0xC2E0, 0xCCAD, 0xC11C, 0xB97C, 0x20, 0xD654, 0xBA74, 0xC73C, 0xB85C, 0x20, 0xBCFC, 0x20, 0xC218, 0x20, 0xC788, 0xC2B5, 0xB2C8, 0xB2E4) + ".bat"
$retiredUsbLauncherBats = @(
  (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0xAC00, 0x20, 0xD654, 0xBA74, 0xC5D0, 0xC11C, 0x20, 0xC2DC, 0xC791, 0xB429, 0xB2C8, 0xB2E4) + ".bat",
  (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0xC744, 0x20, 0xD558, 0xBA74, 0x20, 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0xC11C, 0xB97C, 0x20, 0xD654, 0xBA74, 0xC73C, 0xB85C, 0x20, 0xBCFC, 0x20, 0xC218, 0x20, 0xC788, 0xC2B5, 0xB2C8, 0xB2E4) + ".bat",
  (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0xC744, 0x20, 0xD558, 0xBA74, 0x20, 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0xB97C, 0x20, 0xD654, 0xBA74, 0xC73C, 0xB85C, 0x20, 0xD560, 0x20, 0xC218, 0x20, 0xC788, 0xC2B5, 0xB2C8, 0xB2E4) + ".bat",
  # publish_commission_portal_usb.ps1 가 F:\ 루트에 복사하던 Web 연결용 배치(sync 단일 런처와 중복)
  (U 0xC790, 0xB3D9, 0xC2E4, 0xD589, 0x5F, 0xC774, 0xD30C, 0xC77C, 0xC744, 0x20, 0xB354, 0xBE14, 0xD074, 0xB9AD, 0xD558, 0xBA74, 0x20, 0xD654, 0xBA74, 0xC73C, 0xB85C, 0x20, 0xC2EC, 0xC0AC, 0xB97C, 0x20, 0xD560, 0x20, 0xC218, 0x20, 0xC788, 0xC2B5, 0xB2C8, 0xB2E4) + ".bat",
  $legacyWebLayoutLauncherBat,
  $koreanLauncherOldBat
)

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

if ($UseRepoBundle) {
  if (-not [string]::IsNullOrWhiteSpace($BundlePath)) {
    throw "-UseRepoBundle 는 -BundlePath 와 함께 지정하지 마세요."
  }
  $BundlePath = Join-Path $RepoRoot "Bundle"
} elseif ([string]::IsNullOrWhiteSpace($BundlePath)) {
  $lrInit = if ([string]::IsNullOrWhiteSpace($LauncherDriveRoot)) { "F:\" } else { $LauncherDriveRoot }
  $BundlePath = Join-Path ($lrInit.TrimEnd('\', '/')) $usbBundleFolderName
}

if ($PromptBundlePath) {
  Write-Host "USB 번들 폴더 전체 경로를 입력하세요. (Enter = 기본: $BundlePath)"
  $in = Read-Host "경로"
  if (-not [string]::IsNullOrWhiteSpace($in)) {
    $BundlePath = $in.Trim().TrimEnd('\', '/')
  }
}

function Get-DriveLetterFromPath([string]$Path) {
  try {
    $full = [System.IO.Path]::GetFullPath($Path)
  } catch {
    return $null
  }
  if ($full.Length -ge 2 -and $full[1] -eq ':') {
    return [char]::ToUpperInvariant($full[0])
  }
  return $null
}

function Remove-DirectoryForce {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  try {
    [System.IO.Directory]::Delete($Path, $true)
    return
  } catch { }
  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    return
  } catch {
    Write-Warning "Remove-Item failed: $Path — $_"
  }
  $trim = $Path.TrimEnd('\', '/')
  $null = cmd.exe /c "rmdir /s /q `"$trim`""
}

<#
  포맷 없이 USB용으로 쓰던 폴더·F:\ 루트 구 런처만 삭제합니다. 이후 일반 동기화로 다시 복사합니다.
#>
function Invoke-ClearUsbTargetsBeforeSync {
  param(
    [string]$BundleRoot,
    [string]$DriveRoot
  )
  Write-Warning "USB 동기화 대상 삭제(포맷 아님) — 곧 저장소에서 다시 복사합니다."
  Remove-DirectoryForce -Path $BundleRoot
  Remove-DirectoryForce -Path (Join-Path $DriveRoot $usbUnifiedEvidenceUsbName)
  Remove-DirectoryForce -Path (Join-Path $DriveRoot $usbSubmitOriginalFolderName)
  Remove-DirectoryForce -Path (Join-Path $DriveRoot $usbSubmitOldFlatName)
  Remove-DirectoryForce -Path (Join-Path $DriveRoot $submitDocsDirName)
  Remove-DirectoryForce -Path (Join-Path $DriveRoot $legacySubmitDirName)
  Remove-DirectoryForce -Path (Join-Path $DriveRoot $legacyBundleFolderEnglish)

  $typoLauncherBat =
    (U 0xB354, 0xBE14, 0xB9AD, 0xD074, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xC571, 0xC774, 0x20, 0xC2DC, 0xC791, 0xB429, 0xB2C8, 0xB2E4) + ".bat"
  $oldKoreanPs1 =
    (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xC571, 0xC774, 0x20, 0xC2DC, 0xC791, 0xB429, 0xB2C8, 0xB2E4) + ".ps1"
  $oldAppNamedLauncherBat =
    (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xC571, 0xC774, 0x20, 0xC2DC, 0xC791, 0xB429, 0xB2C8, 0xB2E4) + ".bat"
  $oldOutBat = (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0xAC00, 0x20, 0xD654, 0xBA74, 0xC73C, 0xB85C, 0x20, 0xCD9C, 0xB825, 0xB429, 0xB2C8, 0xB2E4) + ".bat"
  foreach ($junk in @(
      (Join-Path $DriveRoot $typoLauncherBat),
      (Join-Path $DriveRoot $oldKoreanPs1),
      (Join-Path $DriveRoot $oldAppNamedLauncherBat),
      (Join-Path $DriveRoot $oldOutBat)
    )) {
    if (Test-Path -LiteralPath $junk) {
      Remove-Item -LiteralPath $junk -Force -ErrorAction SilentlyContinue
    }
  }
  foreach ($rb in $retiredUsbLauncherBats) {
    $rp = Join-Path $DriveRoot $rb
    if (Test-Path -LiteralPath $rp) {
      Remove-Item -LiteralPath $rp -Force -ErrorAction SilentlyContinue
    }
  }
  Get-ChildItem -LiteralPath $DriveRoot -File -ErrorAction SilentlyContinue |
    Where-Object {
      $n = $_.Name
      $n -like "CommissionPortal_*.bat" -or
      $n -like "Start-Commission-Portal.*" -or
      $n -like "Register-Commission-Portal-Startup.bat" -or
      $n -like "Unregister-Commission-Portal-Startup.bat" -or
      $n -eq "COMMISSION_USB_README_KO.txt"
    } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  Write-Host "ClearUsbTargets: 번들용·갑호증및법령정보·제출원문·구 폴더·구 런처 정리."
}

function Format-RobocopyArg([string]$a) {
  if ($a -match '[\s"]') { '"' + ($a.Replace('"', '""')) + '"' } else { $a }
}

function Invoke-RobocopyMirror {
  param([string]$Src, [string]$Dst, [string[]]$Extra = @())
  if (-not (Test-Path -LiteralPath $Src)) {
    Write-Warning "robocopy skip (원본 없음): $Src"
    return
  }
  if (-not (Test-Path -LiteralPath $Dst)) {
    New-Item -ItemType Directory -Force -Path $Dst | Out-Null
  }
  $srcName = [System.IO.Path]::GetFileName($Src.TrimEnd('\','/'))
  $dstName = [System.IO.Path]::GetFileName($Dst.TrimEnd('\','/'))
  $fileCount = (Get-ChildItem -LiteralPath $Src -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
  Write-Host -NoNewline "  $srcName -> $dstName ($fileCount files) ... "
  $rcArgs = @($Src, $Dst, "/MIR", "/COPY:DAT", "/R:2", "/W:2", "/MT:8", "/NJH", "/NJS") + $Extra
  $argLine = ($rcArgs | ForEach-Object { Format-RobocopyArg $_ }) -join ' '
  $oem = [System.Text.Encoding]::GetEncoding(949)
  $pinfo = New-Object System.Diagnostics.ProcessStartInfo
  $pinfo.FileName = "robocopy.exe"
  $pinfo.Arguments = $argLine
  $pinfo.UseShellExecute = $false
  $pinfo.RedirectStandardOutput = $true
  $pinfo.RedirectStandardError = $true
  $pinfo.CreateNoWindow = $true
  $pinfo.StandardOutputEncoding = $oem
  $pinfo.StandardErrorEncoding = $oem
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $pinfo
  [void]$proc.Start()
  while ($null -ne ($line = $proc.StandardOutput.ReadLine())) {
    Write-Host $line
  }
  $errTail = $proc.StandardError.ReadToEnd()
  if ($errTail) { Write-Host $errTail }
  $proc.WaitForExit()
  $code = $proc.ExitCode
  if ($code -ge 8) {
    Write-Host "FAIL ($code)"
    throw "robocopy 실패 ($code): $Src -> $Dst"
  }
  Write-Host "OK"
}

function Get-BundleLawDirectory {
  param([string]$EvidenceRoot, [string]$LawDirPart)
  $candidates = @(
    (Join-Path $EvidenceRoot $LawDirPart),
    (Join-Path (Join-Path $EvidenceRoot $evidenceInnerFinal) $LawDirPart)
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) {
      return $c
    }
  }
  return $null
}

<#
  원본(최종) 폴더 루트의 .md 만 복사(하위 폴더 제외). PDF는 `제출원문(PDF)` 병합 단계만 사용.
#>
function Copy-DirectoryRootMdPdfOnly {
  param(
    [string]$SrcDir,
    [string]$DstDir
  )
  if (-not (Test-Path -LiteralPath $SrcDir)) {
    Write-Warning "Skip (missing src): $SrcDir"
    return 0
  }
  if (Test-Path -LiteralPath $DstDir) {
    Remove-DirectoryForce -Path $DstDir
  }
  New-Item -ItemType Directory -Force -Path $DstDir | Out-Null
  $n = 0
  Get-ChildItem -LiteralPath $SrcDir -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Extension.ToLowerInvariant() -eq ".md" -and $_.Name -ne $usbExcludeFinalMdName
    } |
    ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DstDir $_.Name) -Force
      $n++
    }
  Write-Host "Final root .md only ($n): $SrcDir -> $DstDir"
  return $n
}

<#
  제출서류 루트(이미 존재)에 최종 폴더 직하의 .md·.pdf 만 복사. 하위 폴더를 만들지 않음.
#>
function Copy-FinalRootSubmitArtifacts {
  param(
    [string]$SrcDir,
    [string]$DestRoot
  )
  if (-not (Test-Path -LiteralPath $SrcDir)) {
    Write-Warning "Submit 원문 skip (없음): $SrcDir"
    return 0
  }
  if (-not (Test-Path -LiteralPath $DestRoot)) {
    Write-Warning "Submit 원문 skip (대상 없음): $DestRoot"
    return 0
  }
  $n = 0
  Get-ChildItem -LiteralPath $SrcDir -File -ErrorAction SilentlyContinue |
    Where-Object {
      @(".md", ".pdf") -contains $_.Extension.ToLowerInvariant() -and
      $_.Name -ne $usbExcludeFinalMdName
    } |
    ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DestRoot $_.Name) -Force
      $n++
    }
  Write-Host "제출서류 루트에 원문 .md/.pdf ($n): $SrcDir -> $DestRoot"
  return $n
}

<#
  - MdPdf: `제출원문(MD)` 는 SrcBaseDirs 각각 직하 .md 수집. `제출원문(PDF)` 는 PdfSrcBaseDirs(비어 있으면 SrcBaseDirs) 직하 .pdf 만.
  - PdfOnly: PdfSrcBaseDirs(비어 있으면 SrcBaseDirs) 의 **`제출원문(PDF)/\*.pdf` 직하만**(베이스 루트 .pdf 는 넣지 않음).
  동일 파일명은 LastWriteTimeUtc 최신 1건만 DestRoot 로 복사.
#>
function Get-SubmitMergeCandidateFiles {
  param(
    [string[]]$SrcBaseDirs,
    [ValidateSet("MdPdf", "PdfOnly")]
    [string]$Mode = "MdPdf",
    [string[]]$PdfSrcBaseDirs = @()
  )
  $stem = $usbSubmitOldFlatName
  $submitMdDir = $stem + "(MD)"
  $submitPdfDir = $stem + "(PDF)"
  $list = New-Object System.Collections.ArrayList
  $pdfBases = if ($PdfSrcBaseDirs -and $PdfSrcBaseDirs.Count -gt 0) { $PdfSrcBaseDirs } else { $SrcBaseDirs }

  foreach ($base in $SrcBaseDirs) {
    if ([string]::IsNullOrWhiteSpace($base) -or -not (Test-Path -LiteralPath $base)) {
      continue
    }
    if ($Mode -ne "PdfOnly") {
      $mdDir = Join-Path $base $submitMdDir
      if (Test-Path -LiteralPath $mdDir) {
        Get-ChildItem -LiteralPath $mdDir -File -ErrorAction SilentlyContinue |
          Where-Object {
            $_.Extension.ToLowerInvariant() -eq ".md" -and $_.Name -ne $usbExcludeFinalMdName
          } |
          ForEach-Object { [void]$list.Add($_) }
      }
    }
  }

  foreach ($base in $pdfBases) {
    if ([string]::IsNullOrWhiteSpace($base) -or -not (Test-Path -LiteralPath $base)) {
      continue
    }
    $pdfDir = Join-Path $base $submitPdfDir
    if (Test-Path -LiteralPath $pdfDir) {
      Get-ChildItem -LiteralPath $pdfDir -File -Filter "*.pdf" -ErrorAction SilentlyContinue |
        ForEach-Object { [void]$list.Add($_) }
    }
  }
  return $list
}

function Copy-SubmitMergedToFlat {
  param(
    [string[]]$SrcBaseDirs,
    [string]$DestRoot,
    [ValidateSet("MdPdf", "PdfOnly")]
    [string]$Mode,
    [string[]]$PdfSrcBaseDirs = @()
  )
  if (-not (Test-Path -LiteralPath $DestRoot)) {
    return 0
  }
  $candidates = Get-SubmitMergeCandidateFiles -SrcBaseDirs $SrcBaseDirs -Mode $Mode -PdfSrcBaseDirs $PdfSrcBaseDirs
  if ($candidates.Count -lt 1) {
    return 0
  }
  $groups = $candidates | Group-Object -Property { $_.Name.ToLowerInvariant() }
  $n = 0
  foreach ($g in $groups) {
    $winner = $g.Group |
      Sort-Object @{ Expression = "LastWriteTimeUtc"; Descending = $true }, FullName |
      Select-Object -First 1
    Copy-Item -LiteralPath $winner.FullName -Destination (Join-Path $DestRoot $winner.Name) -Force
    $n++
    if ($g.Count -gt 1) {
      $ts = $winner.LastWriteTime.ToString("yyyy-MM-dd HH:mm")
      Write-Host "  제출원문 최신본: $($winner.Name) <- $($winner.FullName) ($ts, 후보 $($g.Count)건)"
    }
  }
  if ($n -gt 0) {
    $label = if ($Mode -eq "PdfOnly") { "PDF(원본 경로만)" } else { "MD+PDF(원본 PDF 폴더만)" }
    Write-Host "제출원문 병합($label, 수정 시각 우선) $n 건 -> $DestRoot"
  }
  return $n
}

function Copy-SubmitMdPdfSubfoldersToFlatUsb {
  param(
    [string[]]$SrcBaseDirs,
    [string]$DestRoot,
    [string]$PdfFromBaseDir
  )
  if ([string]::IsNullOrWhiteSpace($PdfFromBaseDir)) {
    throw "Copy-SubmitMdPdfSubfoldersToFlatUsb: PdfFromBaseDir required (행정심판청구(원본) 풀패스)"
  }
  return (Copy-SubmitMergedToFlat -SrcBaseDirs $SrcBaseDirs -DestRoot $DestRoot -Mode MdPdf -PdfSrcBaseDirs @($PdfFromBaseDir))
}

<#
  행정심판청구(원본) 아래 `제출원문(원본)` 직하 .md 만 제출 루트로 복사 (`NNNNNN_md`·날짜 폴더 폴백 없음).
#>
function Copy-LatestYymmddFinalArtifacts {
  param(
    [string]$SrcDir,
    [string]$DestRoot
  )
  if (-not (Test-Path -LiteralPath $SrcDir) -or -not (Test-Path -LiteralPath $DestRoot)) {
    return 0
  }
  $fixedWon = Join-Path $SrcDir "제출원문(원본)"
  if (-not (Test-Path -LiteralPath $fixedWon)) {
    return 0
  }
  $n = 0
  Get-ChildItem -LiteralPath $fixedWon -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Extension.ToLowerInvariant() -eq ".md" -and
      $_.Name -ne $usbExcludeFinalMdName
    } |
    ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DestRoot $_.Name) -Force
      $n++
    }
  Write-Host "제출서류 루트에 제출원문(원본) .md ($n)건"
  return $n
}

<#
  증거 소스와 USB 대상을 비교: 파일 수 + 이름 + 크기.
  일치하면 $true(복사 불필요), 불일치하면 throw.
#>
function Test-EvidenceFolderMatch {
  param([string]$SrcDir, [string]$DstDir)
  $srcFiles = @(Get-ChildItem -LiteralPath $SrcDir -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Substring($SrcDir.Length) })
  $dstFiles = @(Get-ChildItem -LiteralPath $DstDir -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Substring($DstDir.Length) })
  if ($srcFiles.Count -ne $dstFiles.Count) {
    throw "갑호증및법령정보 불일치: 파일 수 소스=$($srcFiles.Count) USB=$($dstFiles.Count)"
  }
  for ($i = 0; $i -lt $srcFiles.Count; $i++) {
    $sRel = $srcFiles[$i].FullName.Substring($SrcDir.Length).TrimStart('\','/')
    $dRel = $dstFiles[$i].FullName.Substring($DstDir.Length).TrimStart('\','/')
    if ($sRel -ne $dRel) {
      throw "갑호증및법령정보 불일치: 파일명 [$sRel] vs [$dRel]"
    }
    if ($srcFiles[$i].Length -ne $dstFiles[$i].Length) {
      throw "갑호증및법령정보 불일치: 크기 $sRel (소스=$($srcFiles[$i].Length) USB=$($dstFiles[$i].Length))"
    }
  }
  return $true
}

<#
  USB 루트: 갑호증및법령정보(증거 통합 미러) + 제출원문(PDF만).
  갑호증: USB에 이미 있으면 유효성 검증만 수행, 불일치 시 에러 중단, 일치 시 복사 생략.
  제출원문(PDF): **`행정심판청구(원본)\제출원문(PDF)`** 직하 .pdf 만(동일 파일명은 수정 시각 최신 1건).
  MD는 Bundle\제출원문(MD)\ 에 있으며, 포털이 Bundle/제출원문(MD)/ fallback으로 자동 참조.
#>
function Invoke-UsbDrivePublishedFolders {
  param(
    [string]$DriveRoot,
    [string]$FinalSrcRoot,
    [string]$UnifiedEvidenceRepoRoot,
    [string]$SplitGabSrc,
    [string]$SplitLawSrc,
    [string[]]$GabRobocopyExtra = @()
  )
  $destEvidence = Join-Path $DriveRoot $usbUnifiedEvidenceUsbName
  $destSubmit = Join-Path $DriveRoot $usbSubmitOriginalFolderName

  # --- 갑호증및법령정보: 있으면 검증, 없으면 복사 ---
  $evidenceSrc = if ($UnifiedEvidenceRepoRoot) { $UnifiedEvidenceRepoRoot } else { $SplitGabSrc }
  $evidenceExists = (Test-Path -LiteralPath $destEvidence) -and
    @(Get-ChildItem -LiteralPath $destEvidence -Recurse -File -ErrorAction SilentlyContinue).Count -gt 0

  if ($evidenceExists -and $evidenceSrc -and (Test-Path -LiteralPath $evidenceSrc)) {
    Write-Host -NoNewline "  $usbUnifiedEvidenceUsbName 검증 ... "
    try {
      [void](Test-EvidenceFolderMatch -SrcDir $evidenceSrc -DstDir $destEvidence)
      Write-Host "OK (일치 — 복사 생략)"
    } catch {
      Write-Host "FAIL"
      throw $_.Exception.Message
    }
  } else {
    Remove-DirectoryForce -Path $destEvidence
    New-Item -ItemType Directory -Force -Path $destEvidence | Out-Null
    if ($UnifiedEvidenceRepoRoot) {
      Invoke-RobocopyMirror -Src $UnifiedEvidenceRepoRoot -Dst $destEvidence
    } else {
      if (-not (Test-Path -LiteralPath $SplitGabSrc) -and -not $SplitLawSrc) {
        Write-Warning "USB 갑호증및법령정보: 증거 원본 없음"
      } else {
        if (Test-Path -LiteralPath $SplitGabSrc) {
          Invoke-RobocopyMirror -Src $SplitGabSrc -Dst $destEvidence -Extra $GabRobocopyExtra
        }
        if ($SplitLawSrc) {
          $destLaw = Join-Path $destEvidence $lawDirName
          Invoke-RobocopyMirror -Src $SplitLawSrc -Dst $destLaw -Extra @("/XF", $usbExcludeLawReadmeName)
        }
      }
    }
  }

  # --- 제출원문(PDF) ---
  Remove-DirectoryForce -Path $destSubmit
  $oldFlat = Join-Path $DriveRoot $usbSubmitOldFlatName
  if ((Test-Path -LiteralPath $oldFlat) -and $oldFlat -ne $destSubmit) {
    Remove-DirectoryForce -Path $oldFlat
  }
  New-Item -ItemType Directory -Force -Path $destSubmit | Out-Null

  if (-not (Test-Path -LiteralPath $FinalSrcRoot)) {
    Write-Warning "원본 폴더 없음 — 제출원문(PDF) USB 복사 생략"
  } else {
    $pdfCount = Copy-SubmitMergedToFlat -SrcBaseDirs @($FinalSrcRoot) -DestRoot $destSubmit -Mode PdfOnly
    Write-Host "제출원문(PDF) USB 루트 -> $destSubmit (원본\제출원문(PDF)만, 병합 $pdfCount 건)"
  }
  Write-Host "USB 루트: $usbUnifiedEvidenceUsbName, $usbSubmitOriginalFolderName 갱신"
}

<#
  이전 동기화·수동 복사로 남은 제외 파일·구 제출 폴더를 정리합니다.
#>
function Remove-UsbExcludedPayloadArtifacts {
  param(
    [string]$BundleRoot,
    [string]$DriveRoot
  )
  $bundleLawReadme = Join-Path (Join-Path (Join-Path $BundleRoot $evidenceDirName) $lawDirName) $usbExcludeLawReadmeName
  if (Test-Path -LiteralPath $bundleLawReadme) {
    Remove-Item -LiteralPath $bundleLawReadme -Force -ErrorAction SilentlyContinue
    Write-Host "Removed excluded: $bundleLawReadme"
  }
  $bundleFinalMd = Join-Path (Join-Path $BundleRoot $finalDirName) $usbExcludeFinalMdName
  if (Test-Path -LiteralPath $bundleFinalMd) {
    Remove-Item -LiteralPath $bundleFinalMd -Force -ErrorAction SilentlyContinue
    Write-Host "Removed excluded: $bundleFinalMd"
  }
  $usbLawReadme = Join-Path (Join-Path (Join-Path $DriveRoot $usbUnifiedEvidenceUsbName) $lawDirName) $usbExcludeLawReadmeName
  if (Test-Path -LiteralPath $usbLawReadme) {
    Remove-Item -LiteralPath $usbLawReadme -Force -ErrorAction SilentlyContinue
    Write-Host "Removed excluded: $usbLawReadme"
  }
  $submitRoot = Join-Path $DriveRoot $usbSubmitOriginalFolderName
  if (Test-Path -LiteralPath $submitRoot) {
    $submitFinalMd = Join-Path $submitRoot $usbExcludeFinalMdName
    if (Test-Path -LiteralPath $submitFinalMd) {
      Remove-Item -LiteralPath $submitFinalMd -Force -ErrorAction SilentlyContinue
      Write-Host "Removed excluded: $submitFinalMd"
    }
  }
  $legacyDrive = Join-Path $DriveRoot $legacySubmitDirName
  if (Test-Path -LiteralPath $legacyDrive) {
    Remove-DirectoryForce -Path $legacyDrive
    Write-Host "Removed legacy drive folder: $legacyDrive"
  }
}

function Invoke-UsbStandaloneAudit {
  param(
    [string]$BundleRoot,
    [string]$DriveRoot,
    [string]$ExpectedLauncherName
  )
  Write-Host ""
  Write-Host "=== USB 전수조사 (F: 단독 실행 전 점검) ==="
  $issues = New-Object System.Collections.ArrayList

  $portalCandidates = @(
    (Join-Path $BundleRoot "usb_bundle\commission-portal"),
    (Join-Path $BundleRoot "portal")
  )
  $portal = $null
  foreach ($pc in $portalCandidates) {
    if (Test-Path -LiteralPath (Join-Path $pc "start.js")) { $portal = $pc; break }
  }
  if (-not $portal) {
    [void]$issues.Add("portal 폴더 없음 (usb_bundle\commission-portal 또는 portal)")
  } else {
    foreach ($req in @("start.js", "package.json", "public\data\portal-data.json")) {
      if (-not (Test-Path -LiteralPath (Join-Path $portal $req))) {
        [void]$issues.Add("없음: $req")
      }
    }
    $nm = Join-Path $portal "node_modules"
    if (-not (Test-Path -LiteralPath $nm)) {
      [void]$issues.Add("경고: node_modules 없음")
    }
  }

  $pdPath = if ($portal) { Join-Path $portal "public\data\portal-data.json" } else { "" }
  if (Test-Path -LiteralPath $pdPath) {
    $raw = [System.IO.File]::ReadAllText($pdPath, [System.Text.Encoding]::UTF8)
    $j = $raw | ConvertFrom-Json
    $meta = $j.meta
    if ($null -eq $meta) {
      [void]$issues.Add("portal-data: meta 없음")
    } else {
    $gf = $meta.gabFiles
    if ($null -ne $gf -and $gf.Count -gt 0) {
      $miss = 0
      $logged = 0
      foreach ($row in $gf) {
        $rel = [string]$row.rel
        if ([string]::IsNullOrWhiteSpace($rel)) { continue }
        $relWin = $rel.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        $absD = Join-Path $DriveRoot $relWin
        if (-not (Test-Path -LiteralPath $absD)) {
          $miss++
          if ($logged -lt 5) {
            [void]$issues.Add("gabFiles 누락: $rel")
            $logged++
          }
        }
      }
      if ($miss -gt 5) {
        [void]$issues.Add("gabFiles 누락 합계: $miss")
      }
    }
    }
  }

  $usbEv = Join-Path $DriveRoot $usbUnifiedEvidenceUsbName
  if (-not (Test-Path -LiteralPath $usbEv)) {
    [void]$issues.Add("없음: $usbEv ($usbUnifiedEvidenceUsbName)")
  } else {
    $sub = @(Get-ChildItem -LiteralPath $usbEv -Force -ErrorAction SilentlyContinue)
    if ($sub.Count -lt 1) {
      [void]$issues.Add("경고: $usbUnifiedEvidenceUsbName 비어 있음")
    }
  }

  $submitRoot = Join-Path $DriveRoot $usbSubmitOriginalFolderName
  if (-not (Test-Path -LiteralPath $submitRoot)) {
    [void]$issues.Add("제출원문 폴더 없음: $submitRoot")
  } else {
    Get-ChildItem -LiteralPath $submitRoot -Force -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.PSIsContainer) {
        [void]$issues.Add("제출원문: 하위 폴더 없음 권장 — $($_.Name)")
      } else {
        $ext = $_.Extension.ToLowerInvariant()
        if ($ext -ne ".pdf") {
          [void]$issues.Add("제출원문(PDF): .pdf 외 파일 — $($_.Name) (MD는 Bundle\제출원문(MD)\ 사용)")
        }
      }
    }
  }

  $submitMdBundleName = (U 0xC81C, 0xCD9C) + (U 0xC6D0, 0xBB38) + "(MD)"
  $bundleMdDir = Join-Path (Join-Path $DriveRoot "Bundle") $submitMdBundleName
  if (-not (Test-Path -LiteralPath $bundleMdDir)) {
    [void]$issues.Add("Bundle\$submitMdBundleName 폴더 없음 (포털 MD 원문 누락)")
  } else {
    $mdCount = @(Get-ChildItem -LiteralPath $bundleMdDir -File -Filter "*.md" -ErrorAction SilentlyContinue).Count
    if ($mdCount -lt 1) {
      [void]$issues.Add("Bundle\$submitMdBundleName 비어 있음 (MD 원문 누락)")
    }
  }

  $launcherPath = Join-Path $DriveRoot $ExpectedLauncherName
  if (-not (Test-Path -LiteralPath $launcherPath)) {
    [void]$issues.Add("런처 없음: $launcherPath")
  }
  if (Test-Path -LiteralPath (Join-Path $DriveRoot $oldKoreanLauncherOutputBat)) {
    [void]$issues.Add("구 런처 파일이 남아 있음(삭제 권장): $oldKoreanLauncherOutputBat")
  }

  if ($issues.Count -eq 0) {
    Write-Host "보고된 문제 0건."
  } else {
    Write-Host "보고 $($issues.Count) 건:"
    foreach ($it in $issues) { Write-Host "  - $it" }
  }
  Write-Host "=== 전수조사 끝 ==="
  Write-Host ""
}

<#
  USB 번들 내부: (2) 증거 갑호증·법령정보 전체 트리 (3) 최종 루트 .md/.pdf 만
#>
function Invoke-UsbBundleEvidenceAndFinal {
  param(
    [string]$BundleRoot,
    [string]$SrcGab,
    [string]$SrcLaw,
    [string]$FinalSrcRoot,
    [string[]]$GabRobocopyExtra = @()
  )
  $staleSource = Join-Path $BundleRoot "source"
  if (Test-Path -LiteralPath $staleSource) {
    Remove-DirectoryForce -Path $staleSource
    Write-Host "Removed stale bundle\source"
  }
  $staleSubmit = Join-Path $BundleRoot $submitDocsDirName
  if (Test-Path -LiteralPath $staleSubmit) {
    Remove-DirectoryForce -Path $staleSubmit
    Write-Host "Removed stale bundle\$submitDocsDirName"
  }
  $legacySubmitUnderBundle = Join-Path $BundleRoot $legacySubmitDirName
  if (Test-Path -LiteralPath $legacySubmitUnderBundle) {
    Remove-DirectoryForce -Path $legacySubmitUnderBundle
    Write-Host "Removed legacy bundle\$legacySubmitDirName"
  }

  $bundleEv = Join-Path $BundleRoot $evidenceDirName
  if (Test-Path -LiteralPath $bundleEv) {
    Remove-DirectoryForce -Path $bundleEv
  }
  New-Item -ItemType Directory -Force -Path $bundleEv | Out-Null

  $dstGab = Join-Path $bundleEv $gabSubfolder
  $dstLaw = Join-Path $bundleEv $lawDirName
  $dstFinal = Join-Path $BundleRoot $finalDirName

  if (-not $SrcLaw) {
    Write-Warning "Law folder not found under evidence (tried split layout and unified\$lawDirName)"
  }

  Invoke-RobocopyMirror -Src $SrcGab -Dst $dstGab -Extra $GabRobocopyExtra
  if ($SrcLaw) {
    Invoke-RobocopyMirror -Src $SrcLaw -Dst $dstLaw -Extra @("/XF", $usbExcludeLawReadmeName)
  }
  [void](Copy-DirectoryRootMdPdfOnly -SrcDir $FinalSrcRoot -DstDir $dstFinal)
  $repoRootForBundlePack = Split-Path -Parent $FinalSrcRoot
  $submitPackRootBundle = Join-Path $repoRootForBundlePack $evidenceDirName
  if (Test-Path -LiteralPath $submitPackRootBundle) {
    $nPack = 0
    Get-ChildItem -LiteralPath $submitPackRootBundle -File -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Extension.ToLowerInvariant() -eq ".md" -and $_.Name -ne $usbExcludeFinalMdName
      } |
      ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dstFinal $_.Name) -Force
        $nPack++
      }
    if ($nPack -gt 0) {
      Write-Host "번들 최종 폴더에 제출용 루트 .md 병합 ($nPack): $submitPackRootBundle (PDF는 원본\제출원문(PDF)만)"
    }
  }
  [void](Copy-SubmitMdPdfSubfoldersToFlatUsb -SrcBaseDirs @($FinalSrcRoot, $submitPackRootBundle) -DestRoot $dstFinal -PdfFromBaseDir $FinalSrcRoot)
}

$bundle = $BundlePath.TrimEnd('\', '/')
$bundleFolderName = [System.IO.Path]::GetFileName($bundle)

$lr = if ([string]::IsNullOrWhiteSpace($LauncherDriveRoot)) {
  Split-Path -Parent $bundle
} else {
  $LauncherDriveRoot.TrimEnd('\', '/')
}
if ($lr.Length -eq 2 -and $lr[1] -eq ':') {
  $lr = $lr + '\'
}
if (-not (Test-Path -LiteralPath $lr)) {
  New-Item -ItemType Directory -Force -Path $lr | Out-Null
}

if ($ClearUsbTargetsBeforeSync) {
  if ($AuditOnly -or $LauncherOnly) {
    throw "-ClearUsbTargetsBeforeSync 는 -AuditOnly / -LauncherOnly 와 함께 쓸 수 없습니다."
  }
  if ($FormatVolumeF) {
    throw "-ClearUsbTargetsBeforeSync 는 -FormatVolumeF 와 동시에 지정하지 마세요."
  }
  if (-not $ConfirmClearUsbTargets) {
    throw "-ClearUsbTargetsBeforeSync 는 데이터 삭제입니다. 함께 -ConfirmClearUsbTargets 를 지정하세요."
  }
  Invoke-ClearUsbTargetsBeforeSync -BundleRoot $bundle -DriveRoot $lr
}

if ($FormatVolumeF) {
  if ($UseRepoBundle) {
    throw "-FormatVolumeF 는 -UseRepoBundle 와 함께 사용할 수 없습니다(번들이 저장소 디스크에 있으면 안 됩니다)."
  }
  if ($AuditOnly -or $LauncherOnly) {
    throw "-FormatVolumeF 는 -AuditOnly / -LauncherOnly 와 함께 사용할 수 없습니다."
  }
  if ($DataOnly) {
    throw "-FormatVolumeF 는 -DataOnly 와 함께 사용할 수 없습니다. 포맷 후에는 전체 동기화(포털 포함)를 한 번 실행하세요."
  }
  if (-not $ConfirmFormatFDestructive) {
    throw "-FormatVolumeF 는 데이터 전부 삭제입니다. 함께 -ConfirmFormatFDestructive 를 지정하세요."
  }
  $script:UsbFormatDriveLetter = Get-DriveLetterFromPath $bundle
  if (-not $script:UsbFormatDriveLetter) {
    throw "번들 경로에서 드라이브 문자를 알 수 없습니다: $bundle"
  }
  Write-Warning "===== 드라이브 $($script:UsbFormatDriveLetter): 전체 포맷(NTFS) — 모든 데이터 삭제 ====="
  Format-Volume -DriveLetter $script:UsbFormatDriveLetter -FileSystem NTFS -Confirm:$false -Force -ErrorAction Stop
  Start-Sleep -Seconds 3
  if (-not (Test-Path -LiteralPath $lr)) {
    New-Item -ItemType Directory -Force -Path $lr | Out-Null
  }
}

if ($AuditOnly) {
  if (-not (Test-Path -LiteralPath $bundle)) {
    throw "Bundle not found: $bundle"
  }
  Invoke-UsbStandaloneAudit -BundleRoot $bundle -DriveRoot $lr `
    -ExpectedLauncherName $koreanLauncherOnly
  exit 0
}

if ($LauncherOnly) {
  # 런처만: 아래 증거·최종 경로 검사 생략
} else {
$evidenceSrc = $null
foreach ($d in [System.IO.Directory]::GetDirectories($RepoRoot)) {
  if ([System.IO.Directory]::Exists([System.IO.Path]::Combine($d, $gabSubfolder))) {
    $evidenceSrc = $d
    break
  }
  if ([System.IO.Directory]::Exists([System.IO.Path]::Combine($d, $unifiedEvidenceTreeName))) {
    $evidenceSrc = $d
    break
  }
  if ([System.IO.Directory]::Exists([System.IO.Path]::Combine($d, $unifiedEvidenceTreeNameLegacy))) {
    $evidenceSrc = $d
    break
  }
}
if (-not $evidenceSrc) {
  throw "Evidence folder not found under repo (no $gabSubfolder nor unified evidence child): $RepoRoot"
}

$splitGab = Join-Path $evidenceSrc $gabSubfolder
$unifiedRoot = Join-Path $evidenceSrc $unifiedEvidenceTreeName
$unifiedLegacyRoot = Join-Path $evidenceSrc $unifiedEvidenceTreeNameLegacy
$gabRobocopyExtra = @()
if (Test-Path -LiteralPath $splitGab) {
  $srcGabPath = $splitGab
  $srcLawPath = Get-BundleLawDirectory -EvidenceRoot $evidenceSrc -LawDirPart $lawDirName
} elseif (Test-Path -LiteralPath $unifiedRoot) {
  $srcGabPath = $unifiedRoot
  $gabRobocopyExtra = @("/XD", $lawDirName)
  $nestedLaw = Join-Path $unifiedRoot $lawDirName
  $srcLawPath = if (Test-Path -LiteralPath $nestedLaw) { $nestedLaw } else { $null }
} elseif (Test-Path -LiteralPath $unifiedLegacyRoot) {
  $srcGabPath = $unifiedLegacyRoot
  $gabRobocopyExtra = @("/XD", $lawDirName)
  $nestedLaw = Join-Path $unifiedLegacyRoot $lawDirName
  $srcLawPath = if (Test-Path -LiteralPath $nestedLaw) { $nestedLaw } else { $null }
} else {
  throw "갑호증 또는 갑호증및법령정보(구 갑호증 및 법령정보) 없음: $evidenceSrc"
}

$finalSrc = Join-Path $RepoRoot $finalDirName
if (-not (Test-Path -LiteralPath $finalSrc)) {
  throw "Final-docs folder not found: $finalSrc"
}

if ($DataOnly) {
  if (-not (Test-Path -LiteralPath $bundle)) {
    if (-not $ClearUsbTargetsBeforeSync) {
      throw "Bundle not found: $bundle (full sync 한 번 실행 후 -DataOnly 사용)"
    }
    New-Item -ItemType Directory -Force -Path $bundle | Out-Null
    Write-Host "Created bundle folder after clear: $bundle"
  }
  if (-not $UseRepoBundle) {
    Invoke-UsbBundleEvidenceAndFinal -BundleRoot $bundle -SrcGab $srcGabPath -SrcLaw $srcLawPath `
      -FinalSrcRoot $finalSrc -GabRobocopyExtra $gabRobocopyExtra
  }
} else {
  New-Item -ItemType Directory -Force -Path $bundle | Out-Null

  if ($UseRepoBundle) {
    # build_bundle_usb_bundle.ps1 이 이미 Bundle\usb_bundle 을 빌드했으므로 portal 복사·npm 생략
    Write-Host "  UseRepoBundle: portal 빌드 생략 (build_bundle_usb_bundle.ps1 사용)"
    $portalDst = Join-Path $RepoRoot "Bundle\usb_bundle\commission-portal"
  } else {
    $portalSrc = Join-Path $RepoRoot "web\commission-portal"
    if (-not (Test-Path -LiteralPath $portalSrc)) {
      throw "Required path missing: $portalSrc"
    }

    # (1) web 포털 단독 실행 모듈
    $portalDst = Join-Path $bundle "portal"
    if (Test-Path -LiteralPath $portalDst) {
      Remove-Item -LiteralPath $portalDst -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $portalDst | Out-Null

    Get-ChildItem -LiteralPath $portalSrc -Force | ForEach-Object {
      $name = $_.Name
      if ($name -eq "node_modules") { return }
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $portalDst $name) -Recurse -Force
    }

    Push-Location $portalDst
    try {
      $prevEap = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      Write-Host -NoNewline "  npm install --omit=dev ... "
      npm install --omit=dev 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL"
        $ErrorActionPreference = $prevEap
        throw "npm install failed (exit $LASTEXITCODE)"
      }
      Write-Host "OK"
      $ErrorActionPreference = $prevEap
    } finally {
      Pop-Location
    }
  }

  if ($WithPortableNode) {
    $nodeDir = Join-Path $portalDst "_node"
    $zipName = "node-$PortableNodeVersion-win-x64.zip"
    $zipUrl = "https://nodejs.org/dist/$PortableNodeVersion/$zipName"
    $zipPath = Join-Path $env:TEMP $zipName
    if (-not (Test-Path -LiteralPath (Join-Path $nodeDir "node.exe"))) {
      Write-Host "Downloading portable Node: $zipUrl"
      Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
      if (Test-Path -LiteralPath $nodeDir) { Remove-Item -LiteralPath $nodeDir -Recurse -Force }
      New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
      Expand-Archive -LiteralPath $zipPath -DestinationPath $nodeDir -Force
      $inner = Get-ChildItem -LiteralPath $nodeDir -Directory | Select-Object -First 1
      if ($inner) {
        Get-ChildItem -LiteralPath $inner.FullName | ForEach-Object {
          Move-Item -LiteralPath $_.FullName -Destination (Join-Path $nodeDir $_.Name) -Force
        }
        Remove-Item -LiteralPath $inner.FullName -Recurse -Force
      }
      Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    }
  }

  if (-not $UseRepoBundle) {
    # 독립 USB: Bundle 내부에 증거·최종 복사 (자체 완결형)
    Invoke-UsbBundleEvidenceAndFinal -BundleRoot $bundle -SrcGab $srcGabPath -SrcLaw $srcLawPath `
      -FinalSrcRoot $finalSrc -GabRobocopyExtra $gabRobocopyExtra
  } else {
    Write-Host "UseRepoBundle: Bundle 내 증거 복사 생략 (포털이 repo에서 직접 참조)"
  }
} # end DataOnly else

  if (Test-Path -LiteralPath $unifiedRoot) {
    Invoke-UsbDrivePublishedFolders -DriveRoot $lr -FinalSrcRoot $finalSrc `
      -UnifiedEvidenceRepoRoot $unifiedRoot -SplitGabSrc "" -SplitLawSrc $null -GabRobocopyExtra @()
  } else {
    Invoke-UsbDrivePublishedFolders -DriveRoot $lr -FinalSrcRoot $finalSrc `
      -UnifiedEvidenceRepoRoot $null -SplitGabSrc $srcGabPath -SplitLawSrc $srcLawPath -GabRobocopyExtra $gabRobocopyExtra
  }

  Remove-UsbExcludedPayloadArtifacts -BundleRoot $bundle -DriveRoot $lr

} # end else (not LauncherOnly: resolve paths + DataOnly or full sync)

# Remove prior USB launchers / readme (single-launcher policy)
$typoLauncherBat =
  (U 0xB354, 0xBE14, 0xB9AD, 0xD074, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xC571, 0xC774, 0x20, 0xC2DC, 0xC791, 0xB429, 0xB2C8, 0xB2E4) + ".bat"
$oldKoreanPs1 =
  (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xC571, 0xC774, 0x20, 0xC2DC, 0xC791, 0xB429, 0xB2C8, 0xB2E4) + ".ps1"
$oldAppNamedLauncherBat =
  (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xC571, 0xC774, 0x20, 0xC2DC, 0xC791, 0xB429, 0xB2C8, 0xB2E4) + ".bat"
foreach ($junk in @(
    (Join-Path $lr $typoLauncherBat),
    (Join-Path $lr $oldKoreanPs1),
    (Join-Path $lr $oldAppNamedLauncherBat),
    (Join-Path $lr $oldKoreanLauncherOutputBat)
  )) {
  if (Test-Path -LiteralPath $junk) {
    Remove-Item -LiteralPath $junk -Force
  }
}
foreach ($rb in $retiredUsbLauncherBats) {
  $rp = Join-Path $lr $rb
  if (Test-Path -LiteralPath $rp) {
    Remove-Item -LiteralPath $rp -Force
  }
}
Get-ChildItem -LiteralPath $lr -File -ErrorAction SilentlyContinue |
  Where-Object {
    $n = $_.Name
    $n -like "CommissionPortal_*.bat" -or
    $n -like "Start-Commission-Portal.*" -or
    $n -like "Register-Commission-Portal-Startup.bat" -or
    $n -like "Unregister-Commission-Portal-Startup.bat" -or
    $n -eq "COMMISSION_USB_README_KO.txt"
  } |
  Remove-Item -Force -ErrorAction SilentlyContinue

# UseRepoBundle: 로컬 Bundle → USB\Bundle 복사 (포털 코드 전송)
if ($UseRepoBundle -and -not $LauncherOnly) {
  $bundleUsbDst = Join-Path $lr "Bundle"
  if ($bundle -ne $bundleUsbDst) {
    Invoke-RobocopyMirror -Src $bundle -Dst $bundleUsbDst
  }
}

# USB 루트 런처: VBS (CMD 창 없이 Node 시작)
$vbsSrc = Join-Path (Join-Path $RepoRoot "web") "CommissionPortal-StartHidden.vbs"
if (-not (Test-Path -LiteralPath $vbsSrc)) {
  Write-Error "VBS 런처 소스 없음: $vbsSrc"
  exit 1
}
Copy-Item -LiteralPath $vbsSrc -Destination (Join-Path $lr $koreanLauncherOnly) -Force

$bundleUsbDst = Join-Path $lr "Bundle"

if (-not $SkipAudit) {
  $auditBundle = if ($UseRepoBundle) { Join-Path $lr "Bundle" } else { $bundle }
  Invoke-UsbStandaloneAudit -BundleRoot $auditBundle -DriveRoot $lr `
    -ExpectedLauncherName $koreanLauncherOnly
}

Write-Host ""
Write-Host "Done. 번들(포털) 루트: $bundle"
Write-Host "  portal + $evidenceDirName\갑호증·법령정보 + $finalDirName\ (포털용)"
Write-Host "USB 루트: $(Join-Path $lr $usbUnifiedEvidenceUsbName) | $(Join-Path $lr $usbSubmitOriginalFolderName) | 런처 .vbs"
if ($FormatVolumeF) {
  Write-Host "드라이브 $($script:UsbFormatDriveLetter): 포맷 후 복사 완료."
}
if ($ClearUsbTargetsBeforeSync) {
  Write-Host "대상 삭제 후 복사 완료(포맷 아님)."
}
Write-Host "Launcher: $(Join-Path $lr $koreanLauncherOnly)"
if (-not $WithPortableNode -and -not $LauncherOnly -and -not $DataOnly) {
  Write-Host "Tip: Re-run with -WithPortableNode if target PCs have no Node.js."
}
if ($DataOnly) {
  Write-Host "DataOnly: portal unchanged; use full sync when package.json changes."
}
if (-not $SkipAudit) {
  Write-Host "전수조사만: .\tools\sync_commission_usb.ps1 -AuditOnly"
}

# F:\Bundle·번들용 폴더 숨기기 — USB 루트에서 런처 .vbs 만 노출
$bundleUsbDst = Join-Path $lr "Bundle"
foreach ($hideDir in @($bundleUsbDst, $bundle)) {
  if ((Test-Path -LiteralPath $hideDir) -and $hideDir) {
    attrib +h +r $hideDir 2>$null
    Get-ChildItem $hideDir -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
      $a = $_.Attributes
      $new = $a -bor [System.IO.FileAttributes]::ReadOnly -bor [System.IO.FileAttributes]::Hidden
      if ($new -ne $a) { $_.Attributes = $new }
    }
    Write-Host "Hidden+ReadOnly: $hideDir"
  }
}

# 사전 생성 PDF 썸네일(.thumb.jpg)을 숨김+읽기전용으로 — 실수 삭제 방지
$usbEvDir = Join-Path $lr $usbUnifiedEvidenceUsbName
if (Test-Path -LiteralPath $usbEvDir) {
  Get-ChildItem $usbEvDir -Recurse -Filter "*.thumb.jpg" -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $a = $_.Attributes
    $new = $a -bor [System.IO.FileAttributes]::ReadOnly -bor [System.IO.FileAttributes]::Hidden
    if ($new -ne $a) { $_.Attributes = $new }
  }
  Write-Host "Hidden+ReadOnly: *.thumb.jpg in $usbEvDir"
}
