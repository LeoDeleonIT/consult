$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $ProjectRoot ".logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$StatusPath = Join-Path $LogDir "opendental-workstation-config-status.txt"

$LocalSource = Join-Path $LogDir "opendental-source-config.xml"
$Source = if (Test-Path -LiteralPath $LocalSource) { $LocalSource } else { "Z:\CentralManagerConfig.xml" }
$Target = "C:\Program Files (x86)\Open Dental\FreeDentalConfig.xml"

function Write-Status {
  param([Parameter(Mandatory = $true)][string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $StatusPath -Value $line
  Write-Host $Message
}

try {
  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Missing source config: $Source"
  }
  if (-not (Test-Path -LiteralPath (Split-Path -Parent $Target))) {
    throw "Open Dental install folder was not found."
  }

  if (Test-Path -LiteralPath $Target) {
    $backup = "$Target.bak-codex-$(Get-Date -Format yyyyMMddHHmmss)"
    Copy-Item -LiteralPath $Target -Destination $backup -Force
    Write-Status "Backed up existing FreeDentalConfig.xml."
  }

  [xml]$xml = Get-Content -Raw -LiteralPath $Source
  $conn = $xml.ConnectionSettings.DatabaseConnection
  $conn.ComputerName = "10.1.10.182"
  $conn.Database = "Main"
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
  Write-Status "Configured Open Dental workstation: server 10.1.10.182, database Main, then relaunched Open Dental."
} catch {
  Write-Status "FAILED: $($_.Exception.Message)"
  throw
}
