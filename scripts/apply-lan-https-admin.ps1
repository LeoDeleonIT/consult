param(
  [string]$RootCertificate = "C:\Users\test\Documents\Consult\.certs\trinity-consult-local-root-ca.cer",
  [int]$Port = 3443
)

$ErrorActionPreference = "Stop"
$statusPath = Join-Path (Split-Path -Parent $RootCertificate) "admin-setup-status.txt"

try {
  Import-Certificate -FilePath $RootCertificate -CertStoreLocation Cert:\LocalMachine\Root | Out-Null

  $ruleName = "Trinity Consult LAN HTTPS $Port"
  $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if (-not $existingRule) {
    New-NetFirewallRule `
      -DisplayName $ruleName `
      -Direction Inbound `
      -Action Allow `
      -Protocol TCP `
      -LocalPort $Port `
      -Profile Private | Out-Null
  } else {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Profile Private -Action Allow | Out-Null
  }

  "OK $(Get-Date -Format o) Imported root certificate and enabled Private TCP $Port firewall rule." |
    Set-Content -LiteralPath $statusPath -Encoding UTF8
} catch {
  "FAILED $(Get-Date -Format o) $($_.Exception.Message)" |
    Set-Content -LiteralPath $statusPath -Encoding UTF8
  throw
}
