#Requires -Version 5.1
<#
.SYNOPSIS
  행심위 제출용 USB: 드라이브 루트에 (1) 더블클릭 런처 .bat (2) 번들용 — 포털 + 번들 내부 증거·최종 트리 (3) 갑호증및법령정보 — 저장소 `갑호증 및 법령정보` 전체 미러 (4) 제출원문 — `행정심판청구(최종)` 루트 및 최신 yymmdd 폴더의 .md·.pdf 만(하위 폴더 없음).
  제외: 법령정보\README.md, 최종 README_제출본_백업규칙.md. 구 CommissionReview_USB·행정심판청구서제출서류 폴더는 동기화 시 제거.
  -ClearUsbTargetsBeforeSync -ConfirmClearUsbTargets: 포맷 없이 위 대상·구 폴더·구 런처만 지운 뒤 복사(F: 전체 삭제 아님).

.PARAMETER RepoRoot
  younsu repo root (parent of web\, folders with evidence and final docs).

.PARAMETER BundlePath
  `번들용` 폴더 전체 경로. 비우면 (LauncherDriveRoot)\번들용

.PARAMETER PromptBundlePath
  실행 시 번들 경로를 Read-Host 로 입력(미입력 시 -BundlePath 사용).

.PARAMETER LauncherDriveRoot
  .bat 런처를 둘 드라이브 루트(기본 F:\).

.PARAMETER FormatVolumeF
  번들 경로의 드라이브 문자(예 F:) 볼륨을 NTFS 로 포맷한 뒤 복사. 데이터 전부 삭제. 관리자 권한이 필요할 수 있습니다.

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
$evidenceDirName = U 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0x28, 0xC99D, 0xAC70, 0x29
$finalDirName    = U 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0x28, 0xCD5C, 0xC885, 0x29
$gabSubfolder    = U 0xAC11, 0xD638, 0xC99D
$lawDirName      = U 0xBC95, 0xB839, 0xC815, 0xBCF4
# 증거 단일 트리: …/(증거)/갑호증 및 법령정보/{갑제N호증…, 법령정보}
$unifiedEvidenceTreeName = (U 0xAC11, 0xD638, 0xC99D) + " " + (U 0xBC0F) + " " + (U 0xBC95, 0xB839, 0xC815, 0xBCF4)
$evidenceInnerFinal = U 0xCD5C, 0xC885
$submitDocsDirName = U 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0xC11C, 0xC81C, 0xCD9C, 0xC11C, 0xB958
# 구 제출 폴더명(번들 안·드라이브 루트) — 동기화 시 제거
$legacySubmitDirName = U 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0x5F, 0xC81C, 0xCD9C, 0xC11C, 0xB958
# USB 드라이브 루트(행심위 제출용): 번들용 / 갑호증및법령정보 / 제출원문
$usbBundleFolderName = U 0xBC88, 0xB4E4, 0xC6A9
$usbUnifiedEvidenceUsbName = (U 0xAC11, 0xD638, 0xC99D) + (U 0xBC0F) + (U 0xBC95, 0xB839, 0xC815, 0xBCF4)
$usbSubmitOriginalFolderName = (U 0xC81C, 0xCD9C) + (U 0xC6D0, 0xBB38)
$legacyBundleFolderEnglish = "CommissionReview_USB"
# USB에 넣지 않음: 법령정보 트리의 README.md, 최종 루트의 백업 규칙 MD
$usbExcludeLawReadmeName = "README.md"
$usbExcludeFinalMdName = "README_제출본_백업규칙.md"
# 런처: … 화면에서 시작됩니다.bat (구 이름 … 화면으로 출력됩니다.bat 은 동기화 시 삭제)
$oldKoreanLauncherOutputBat = (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0xAC00, 0x20, 0xD654, 0xBA74, 0xC73C, 0xB85C, 0x20, 0xCD9C, 0xB825, 0xB429, 0xB2C8, 0xB2E4) + ".bat"
$koreanLauncherOnly = (U 0xB354, 0xBE14, 0xD074, 0xB9AD, 0x20, 0xD558, 0xC2DC, 0xBA74, 0x20, 0xD589, 0xC815, 0xC2EC, 0xD310, 0xCCAD, 0xAD6C, 0xAC00, 0x20, 0xD654, 0xBA74, 0xC5D0, 0xC11C, 0x20, 0xC2DC, 0xC791, 0xB429, 0xB2C8, 0xB2E4) + ".bat"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

if ([string]::IsNullOrWhiteSpace($BundlePath)) {
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

function Invoke-RobocopyMirror {
  param([string]$Src, [string]$Dst, [string[]]$Extra = @())
  if (-not (Test-Path -LiteralPath $Src)) {
    Write-Warning "robocopy skip (원본 없음): $Src"
    return
  }
  if (-not (Test-Path -LiteralPath $Dst)) {
    New-Item -ItemType Directory -Force -Path $Dst | Out-Null
  }
  $rcArgs = @($Src, $Dst, "/E", "/COPY:DAT", "/R:2", "/W:2", "/MT:8", "/NFL", "/NDL", "/NJH", "/NJS") + $Extra
  & robocopy.exe @rcArgs
  $code = $LASTEXITCODE
  if ($code -ge 8) {
    throw "robocopy 실패 ($code): $Src -> $Dst"
  }
  Write-Host "robocopy: $Src -> $Dst"
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
  최종 폴더 루트의 .md / .pdf 만 복사(하위 폴더 제외).
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
      @(".md", ".pdf") -contains $_.Extension.ToLowerInvariant() -and
      $_.Name -ne $usbExcludeFinalMdName
    } |
    ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DstDir $_.Name) -Force
      $n++
    }
  Write-Host "Final root .md/.pdf only ($n): $SrcDir -> $DstDir"
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
  행정심판청구(최종) 아래 6자리 날짜 폴더(예: 260407) 중 이름이 가장 큰 폴더의 .md·.pdf 만 제출 루트로 복사.
#>
function Copy-LatestYymmddFinalArtifacts {
  param(
    [string]$SrcDir,
    [string]$DestRoot
  )
  if (-not (Test-Path -LiteralPath $SrcDir) -or -not (Test-Path -LiteralPath $DestRoot)) {
    return 0
  }
  $latest = Get-ChildItem -LiteralPath $SrcDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^[0-9]{6}$' } |
    Sort-Object { [int]$_.Name } -Descending |
    Select-Object -First 1
  if (-not $latest) {
    return 0
  }
  $n = 0
  Get-ChildItem -LiteralPath $latest.FullName -File -ErrorAction SilentlyContinue |
    Where-Object {
      @(".md", ".pdf") -contains $_.Extension.ToLowerInvariant() -and
      $_.Name -ne $usbExcludeFinalMdName
    } |
    ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DestRoot $_.Name) -Force
      $n++
    }
  Write-Host "제출서류 루트에 최신 제출일 폴더 $($latest.Name) .md/.pdf ($n)건"
  return $n
}

<#
  USB 루트: 갑호증및법령정보(증거 통합 미러) + 제출원문(.md/.pdf 만).
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

  Remove-DirectoryForce -Path $destEvidence
  Remove-DirectoryForce -Path $destSubmit
  New-Item -ItemType Directory -Force -Path $destEvidence | Out-Null
  New-Item -ItemType Directory -Force -Path $destSubmit | Out-Null

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

  [void](Copy-FinalRootSubmitArtifacts -SrcDir $FinalSrcRoot -DestRoot $destSubmit)
  [void](Copy-LatestYymmddFinalArtifacts -SrcDir $FinalSrcRoot -DestRoot $destSubmit)
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

  $portal = Join-Path $BundleRoot "portal"
  foreach ($req in @(
      (Join-Path $portal "start.js"),
      (Join-Path $portal "package.json"),
      (Join-Path $portal "public\data\portal-data.json")
    )) {
    if (-not (Test-Path -LiteralPath $req)) {
      [void]$issues.Add("없음: $req")
    }
  }
  $nm = Join-Path $portal "node_modules"
  if (-not (Test-Path -LiteralPath $nm)) {
    [void]$issues.Add("경고: node_modules 없음 — 포털 실행 전 동기화 시 npm install 필요")
  }

  $pdPath = Join-Path $portal "public\data\portal-data.json"
  if (Test-Path -LiteralPath $pdPath) {
    $raw = [System.IO.File]::ReadAllText($pdPath, [System.Text.Encoding]::UTF8)
    $j = $raw | ConvertFrom-Json
    $meta = $j.meta
    if ($null -eq $meta) {
      [void]$issues.Add("portal-data: meta 없음")
    } else {
    $tabs = $meta.tabSources
    if ($null -ne $tabs) {
      foreach ($p in $tabs.PSObject.Properties) {
        $rel = [string]$p.Value
        if ([string]::IsNullOrWhiteSpace($rel)) { continue }
        $relWin = $rel.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        $abs = Join-Path $BundleRoot $relWin
        if (-not (Test-Path -LiteralPath $abs)) {
          [void]$issues.Add("tabSources 누락: $rel")
        }
      }
    }
    $gf = $meta.gabFiles
    if ($null -ne $gf -and $gf.Count -gt 0) {
      $miss = 0
      $logged = 0
      foreach ($row in $gf) {
        $rel = [string]$row.rel
        if ([string]::IsNullOrWhiteSpace($rel)) { continue }
        $abs = Join-Path $BundleRoot ($rel.Replace("/", [System.IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $abs)) {
          $miss++
          if ($logged -lt 8) {
            [void]$issues.Add("gabFiles 누락(예): $rel")
            $logged++
          }
        }
      }
      if ($miss -gt 8) {
        [void]$issues.Add("gabFiles 누락 합계: $miss (번들에 갑호증 전체 미동기화 시 흔함)")
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
        if ($ext -ne ".md" -and $ext -ne ".pdf") {
          [void]$issues.Add("제출원문: .md/.pdf 외 파일 — $($_.Name)")
        }
      }
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
  # 포털 tabSources(`…(최종)/260405(인천행심위)/260405_01_…`)와 사건별 폴더 — 루트 .md만으로는 부족할 수 있음
  Get-ChildItem -LiteralPath $FinalSrcRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^[0-9]{6}$' } |
    ForEach-Object {
      $dstSub = Join-Path $dstFinal $_.Name
      Invoke-RobocopyMirror -Src $_.FullName -Dst $dstSub
    }
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
}
if (-not $evidenceSrc) {
  throw "Evidence folder not found under repo (no $gabSubfolder nor $unifiedEvidenceTreeName child): $RepoRoot"
}

$splitGab = Join-Path $evidenceSrc $gabSubfolder
$unifiedRoot = Join-Path $evidenceSrc $unifiedEvidenceTreeName
$gabRobocopyExtra = @()
if (Test-Path -LiteralPath $splitGab) {
  $srcGabPath = $splitGab
  $srcLawPath = Get-BundleLawDirectory -EvidenceRoot $evidenceSrc -LawDirPart $lawDirName
} elseif (Test-Path -LiteralPath $unifiedRoot) {
  $srcGabPath = $unifiedRoot
  $gabRobocopyExtra = @("/XD", $lawDirName)
  $nestedLaw = Join-Path $unifiedRoot $lawDirName
  $srcLawPath = if (Test-Path -LiteralPath $nestedLaw) { $nestedLaw } else { $null }
} else {
  throw "갑호증 또는 갑호증 및 법령정보 없음: $evidenceSrc"
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
  Invoke-UsbBundleEvidenceAndFinal -BundleRoot $bundle -SrcGab $srcGabPath -SrcLaw $srcLawPath `
    -FinalSrcRoot $finalSrc -GabRobocopyExtra $gabRobocopyExtra
} else {
  $portalSrc = Join-Path $RepoRoot "web\commission-portal"
  if (-not (Test-Path -LiteralPath $portalSrc)) {
    throw "Required path missing: $portalSrc"
  }

  New-Item -ItemType Directory -Force -Path $bundle | Out-Null

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
    npm install --omit=dev 2>&1 | Write-Host
  } finally {
    Pop-Location
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

  # (2)(3) 증거 전체 + 최종 루트 md/pdf
  Invoke-UsbBundleEvidenceAndFinal -BundleRoot $bundle -SrcGab $srcGabPath -SrcLaw $srcLawPath `
    -FinalSrcRoot $finalSrc -GabRobocopyExtra $gabRobocopyExtra
}

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

$embeddedPs = @'
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Show-UsbLauncherError([string]$Message) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
      $Message,
      "행정심판청구 포털",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  } catch { }
}
try {
$root = [System.IO.Path]::GetFullPath($env:USB_LAUNCHER_DIR.TrimEnd('\', '/'))
$bundle = Join-Path $root "__BUNDLE_DIR__"
$portal = Join-Path $bundle "portal"
$env:COMMISSION_REPO_ROOT = $bundle
if (-not (Test-Path -LiteralPath (Join-Path $portal "start.js"))) {
  Show-UsbLauncherError ("USB 번들이 없거나 손상되었습니다. 개발 PC에서 tools\sync_commission_usb.ps1 를 다시 실행하세요.`n`n기대 경로: " + $bundle)
  exit 1
}
$nodeExe = Join-Path $portal "_node\node.exe"
if (-not (Test-Path -LiteralPath $nodeExe)) { $nodeExe = "node" }
$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$url = "http://127.0.0.1:$port/"
Set-Location -LiteralPath $portal
$p = Start-Process -FilePath $nodeExe -ArgumentList "start.js" -WorkingDirectory $portal -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 2
try { Start-Process $url } catch { }
Wait-Process -InputObject $p
} catch {
  Show-UsbLauncherError $_.Exception.Message
  exit 1
}
'@
$embeddedPs = $embeddedPs.Replace("__BUNDLE_DIR__", $bundleFolderName)

$b64 = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($embeddedPs))
$singleBat = @"
@echo off
set "USB_LAUNCHER_DIR=%~dp0"
start "" powershell.exe -WindowStyle Hidden -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $b64
exit /b 0
"@
[System.IO.File]::WriteAllText((Join-Path $lr $koreanLauncherOnly), $singleBat, [System.Text.UTF8Encoding]::new($false))

if (-not $SkipAudit) {
  Invoke-UsbStandaloneAudit -BundleRoot $bundle -DriveRoot $lr `
    -ExpectedLauncherName $koreanLauncherOnly
}

Write-Host ""
Write-Host "Done. 번들(포털) 루트: $bundle"
Write-Host "  portal + $evidenceDirName\갑호증·법령정보 + $finalDirName\ (포털용)"
Write-Host "USB 루트: $(Join-Path $lr $usbUnifiedEvidenceUsbName) | $(Join-Path $lr $usbSubmitOriginalFolderName) | 런처 .bat"
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
