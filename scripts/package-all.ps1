<#
.SYNOPSIS
  一键打包 Windows exe + Android APK。

.DESCRIPTION
  按顺序跑数据管线（build.py）→ 桌面端 → 安卓端，产物落 release/。
  与 FxxkBox 的 package-all.ps1 同构，但去掉了授权/反逆向环节。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\package-all.ps1
  powershell -ExecutionPolicy Bypass -File scripts\package-all.ps1 -SkipAndroid
  powershell -ExecutionPolicy Bypass -File scripts\package-all.ps1 -DesktopOnly
#>
[CmdletBinding()]
param(
  [switch]$SkipWindows,
  [switch]$SkipAndroid,
  [switch]$DesktopOnly,
  [switch]$Installer
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }

Step '数据管线 build.py（生成 HTML / CSV / XLSX）'
& 'D:\Program Files\Python314\python.exe' build.py
if ($LASTEXITCODE -ne 0) { throw "build.py 失败（退出码 $LASTEXITCODE）" }

if ($DesktopOnly) { $SkipAndroid = $true }

if (-not $SkipWindows) {
  Step 'Windows 桌面端'
  $args = @('scripts/desktop.mjs', 'build')
  if ($Installer) { $args += '--installer' }
  & node @args
  if ($LASTEXITCODE -ne 0) { throw "桌面端构建失败（退出码 $LASTEXITCODE）" }
}

if (-not $SkipAndroid) {
  Step 'Android APK'
  & node scripts/android.mjs build --apk --target aarch64
  if ($LASTEXITCODE -ne 0) { throw "安卓端构建失败（退出码 $LASTEXITCODE）" }
}

Step '产物清单'
Get-ChildItem -Path release -Recurse -File |
  Where-Object { $_.Name -notlike 'README.md' -and $_.Name -ne '.gitkeep' } |
  ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1)
    '{0,-46} {1,10:N2} MB' -f $rel, ($_.Length / 1MB)
  }
