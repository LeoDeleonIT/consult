$ErrorActionPreference = "Stop"

$server = "10.1.10.182"
$share = "\\$server\OpenDentImages"
$drive = "Z"
$setupPath = "$drive`:\SetupFiles"

Write-Host ""
Write-Host "Open Dental share mapper"
Write-Host "Server/share: $share"
Write-Host ""
Write-Host "Use the Windows/server username format IT gave you, for example:"
Write-Host "  PEARL2-DB\username"
Write-Host "  PEARL2\username"
Write-Host "  TDCorp\username"
Write-Host ""

cmd.exe /c "net use $drive`: /delete /y" | Out-Null
cmd.exe /c "net use $share /delete /y" | Out-Null
cmd.exe /c "net use \\PEARL2-DB\OpenDentImages /delete /y" | Out-Null

$credential = Get-Credential -Message "Enter credentials allowed to access $share"

try {
  New-PSDrive -Name $drive -PSProvider FileSystem -Root $share -Persist -Credential $credential | Out-Null
  Write-Host ""
  Write-Host "Mapped $drive`: to $share"
  if (Test-Path -LiteralPath $setupPath) {
    Write-Host "Opening $setupPath"
    Start-Process explorer.exe $setupPath
  } else {
    Write-Host "Mapped successfully, but $setupPath was not found."
    Write-Host "Opening $drive`:\ instead."
    Start-Process explorer.exe "$drive`:\"
  }
} catch {
  Write-Host ""
  Write-Host "Mapping failed:"
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "If this says access denied, the credential is not allowed on PEARL2-DB or the server blocks this workstation/user."
  Write-Host "If it says network path not found, SMB/file sharing is blocked even though the server answers ping/NetBIOS."
}

Write-Host ""
Write-Host "Press Enter to close this window."
Read-Host | Out-Null
