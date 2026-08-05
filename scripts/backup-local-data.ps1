param(
  [string]$BackupDir = ".backups"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $root ".wrangler\state\v3"
$backupRoot = Join-Path $root $BackupDir

if (-not (Test-Path -LiteralPath $statePath)) {
  throw "Local Wrangler state was not found at $statePath"
}

$running = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -in @("node", "cmd", "npm") -and $_.Path -like "$root*" }

if ($running) {
  throw "Stop the local app before backup. Project-local Node/npm/cmd processes are still running."
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$backupPath = Join-Path $backupRoot "trinity-consult-local-data-$timestamp.zip"

Compress-Archive -LiteralPath $statePath -DestinationPath $backupPath -CompressionLevel Optimal

[pscustomobject]@{
  BackupPath = $backupPath
  SourcePath = $statePath
  IncludesEnvLocal = $false
  CreatedAtUtc = $timestamp
}
