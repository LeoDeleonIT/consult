param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupPath)) {
  throw "Backup archive was not found: $BackupPath"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "trinity-consult-restore-test"
$testPath = Join-Path $tempRoot ([Guid]::NewGuid().ToString("N"))
$resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
$resolvedTestPath = [System.IO.Path]::GetFullPath($testPath)

if (-not $resolvedTestPath.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Restore test path escaped the expected temp root."
}

New-Item -ItemType Directory -Force -Path $testPath | Out-Null

try {
  Expand-Archive -LiteralPath $BackupPath -DestinationPath $testPath -Force
  $d1 = Get-ChildItem -LiteralPath $testPath -Recurse -Directory | Where-Object { $_.Name -eq "d1" } | Select-Object -First 1
  $r2 = Get-ChildItem -LiteralPath $testPath -Recurse -Directory | Where-Object { $_.Name -eq "r2" } | Select-Object -First 1
  $files = Get-ChildItem -LiteralPath $testPath -Recurse -File

  if (-not $d1) {
    throw "Restore test did not find a D1 directory."
  }

  if (-not $r2) {
    throw "Restore test did not find an R2 directory."
  }

  [pscustomobject]@{
    BackupPath = $BackupPath
    RestoreTestPath = $testPath
    FileCount = ($files | Measure-Object).Count
    HasD1 = $true
    HasR2 = $true
    Passed = $true
  }
} finally {
  $full = [System.IO.Path]::GetFullPath($testPath)
  if ($full.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction SilentlyContinue
  }
}
