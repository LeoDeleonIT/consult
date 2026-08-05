$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $ProjectRoot ".logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$StatusPath = Join-Path $LogDir "opendental-database-config-status.txt"

$Target = "C:\Program Files (x86)\Open Dental\FreeDentalConfig.xml"

function Write-Status {
  param([Parameter(Mandatory = $true)][string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $StatusPath -Value $line
  Write-Host $Message
}

try {
  if (-not (Test-Path -LiteralPath $Target)) {
    throw "Missing Open Dental config: $Target"
  }

  $backup = "$Target.bak-codex-$(Get-Date -Format yyyyMMddHHmmss)"
  Copy-Item -LiteralPath $Target -Destination $backup -Force

  [xml]$xml = Get-Content -Raw -LiteralPath $Target
  $conn = $xml.ConnectionSettings.DatabaseConnection
  $conn.ComputerName = "pearl2-db"
  $conn.Database = "ypb"
  $conn.NoShowOnStartup = "False"

  $settings = New-Object System.Xml.XmlWriterSettings
  $settings.Indent = $true
  $settings.Encoding = [System.Text.UTF8Encoding]::new($false)
  $writer = [System.Xml.XmlWriter]::Create($Target, $settings)
  $xml.Save($writer)
  $writer.Close()

  Get-Process -Name OpenDental -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
  Start-Process -FilePath "C:\Program Files (x86)\Open Dental\OpenDental.exe" -Verb RunAs
  Write-Status "Set Open Dental workstation config to server pearl2-db, database ypb, then relaunched Open Dental. Backup: $backup"
} catch {
  Write-Status "FAILED: $($_.Exception.Message)"
  throw
}
