<#
.SYNOPSIS
  一键打包 Windows exe + Android APK。

.DESCRIPTION
  生成离线查询页，再按选择编译桌面端和安卓端，产物放在 release。

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

Step '生成离线票价查询页'
& node scripts/web.mjs
if ($LASTEXITCODE -ne 0) { throw "网页构建失败（退出码 $LASTEXITCODE）" }

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
