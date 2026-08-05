$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $ProjectRoot ".logs"
$BackupDir = Join-Path $ProjectRoot ".backups"
New-Item -ItemType Directory -Force -Path $LogDir, $BackupDir | Out-Null

$StatusPath = Join-Path $LogDir "pearl2-db-hosts-fix-status.txt"
$HostsPath = "C:\Windows\System32\drivers\etc\hosts"
$BackupPath = Join-Path $BackupDir "hosts.bak-codex-$(Get-Date -Format yyyyMMddHHmmss)"

function Write-Status {
  param([Parameter(Mandatory = $true)][string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $StatusPath -Value $line
  Write-Host $Message
}

try {
  Copy-Item -LiteralPath $HostsPath -Destination $BackupPath -Force

  $content = Get-Content -Raw -LiteralPath $HostsPath
  $lines = $content -split "`r?`n"
  $kept = $lines | Where-Object { $_ -notmatch "(?i)\bpearl2-db\b" }
  $entry = @(
    "",
    "# Codex Open Dental workstation fix: force local LAN DB server instead of NetBird DNS.",
    "10.1.10.182 pearl2-db PEARL2-DB pearl2-db.TDCorp PEARL2-DB.TDCorp pearl2-db.netbird.selfhosted PEARL2-DB.netbird.selfhosted"
  )
  $newContent = (($kept + $entry) -join "`r`n").TrimEnd() + "`r`n"
  Set-Content -LiteralPath $HostsPath -Value $newContent -Encoding ASCII
  ipconfig /flushdns | Out-Null

  Write-Status "Updated hosts file for pearl2-db -> 10.1.10.182. Backup: $BackupPath"
} catch {
  Write-Status "FAILED: $($_.Exception.Message)"
  throw
}
