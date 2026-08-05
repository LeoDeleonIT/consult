param(
  [string]$LanIp = "10.1.10.122",
  [int]$Port = 3443
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root ".certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$rootName = "Trinity Consult Local Pilot Root CA"
$serverName = "Trinity Consult LAN Pilot $LanIp"
$rootCer = Join-Path $certDir "trinity-consult-local-root-ca.cer"
$serverPfx = Join-Path $certDir "trinity-consult-lan.pfx"
$passPath = Join-Path $certDir "trinity-consult-lan.pass"

if (-not (Test-Path -LiteralPath $passPath)) {
  $bytes = New-Object byte[] 32
  $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_") |
    Set-Content -LiteralPath $passPath -Encoding ASCII -NoNewline
}

$passPlain = Get-Content -LiteralPath $passPath -Raw
$pass = ConvertTo-SecureString $passPlain -AsPlainText -Force

$rootCert = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.Subject -eq "CN=$rootName" } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $rootCert) {
  $rootCert = New-SelfSignedCertificate `
    -Type Custom `
    -Subject "CN=$rootName" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -KeyUsage CertSign, CRLSign, DigitalSignature `
    -NotAfter (Get-Date).AddYears(5) `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.19={critical}{text}ca=TRUE&pathlength=1")
}

$san = "2.5.29.17={text}DNS=consult.trinity.local&DNS=monitoring-bot&DNS=localhost&IPAddress=$LanIp&IPAddress=127.0.0.1"
$serverCert = New-SelfSignedCertificate `
  -Type Custom `
  -Subject "CN=$LanIp" `
  -Signer $rootCert `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -NotAfter (Get-Date).AddDays(397) `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @($san, "2.5.29.37={text}1.3.6.1.5.5.7.3.1")

Export-Certificate -Cert $rootCert -FilePath $rootCer | Out-Null
Export-PfxCertificate -Cert $serverCert -FilePath $serverPfx -Password $pass | Out-Null
Import-Certificate -FilePath $rootCer -CertStoreLocation Cert:\CurrentUser\Root | Out-Null

$existingRule = Get-NetFirewallRule -DisplayName "Trinity Consult LAN HTTPS $Port" -ErrorAction SilentlyContinue
if (-not $existingRule) {
  New-NetFirewallRule `
    -DisplayName "Trinity Consult LAN HTTPS $Port" `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Private | Out-Null
}

[pscustomobject]@{
  LanUrl = "https://$LanIp`:$Port"
  RootCertificate = $rootCer
  ServerPfx = $serverPfx
  FirewallRule = "Trinity Consult LAN HTTPS $Port"
}
