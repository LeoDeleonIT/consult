$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Node = Join-Path $ProjectRoot ".tools\node-v22.13.0-win-x64\node.exe"

function Get-ListenerPid {
  param([Parameter(Mandatory = $true)][int]$Port)

  $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
  $line = netstat -ano | Select-String -Pattern $pattern | Select-Object -First 1
  if (-not $line) {
    return $null
  }
  return [int]$line.Matches[0].Groups[1].Value
}

if (-not (Test-Path -LiteralPath $Node)) {
  throw "Portable Node runtime not found at $Node"
}

$AppPid = Get-ListenerPid -Port 3003
if ($AppPid) {
  Write-Host "Trinity Consult app already listening on localhost:3003 (PID $AppPid)."
} else {
  $app = Start-Process -FilePath $Node -ArgumentList @("scripts\start-local-3003.mjs") -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
  Write-Host "Started Trinity Consult app launcher (PID $($app.Id))."
  Start-Sleep -Seconds 8
}

$HttpsPid = Get-ListenerPid -Port 3443
if ($HttpsPid) {
  Write-Host "Trinity Consult HTTPS proxy already listening on 0.0.0.0:3443 (PID $HttpsPid)."
} else {
  $https = Start-Process -FilePath $Node -ArgumentList @("scripts\start-lan-https.mjs") -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
  Write-Host "Started Trinity Consult HTTPS proxy launcher (PID $($https.Id))."
  Start-Sleep -Seconds 3
}

$AppPid = Get-ListenerPid -Port 3003
$HttpsPid = Get-ListenerPid -Port 3443

Write-Host ""
Write-Host "Local app:  http://localhost:3003"
Write-Host "LAN HTTPS: https://10.1.10.122:3443"
Write-Host "Status:    app PID $AppPid, HTTPS PID $HttpsPid"
