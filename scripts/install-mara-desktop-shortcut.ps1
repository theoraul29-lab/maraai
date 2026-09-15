$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$launcher = Join-Path $repoRoot 'scripts\mara-desktop.cmd'
$icon = Join-Path $repoRoot 'frontend\public\favicon.ico'
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$shortcutPath = Join-Path $desktop 'Mara.lnk'

if (-not (Test-Path $launcher)) {
  throw "Mara launcher not found: $launcher"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Open Mara Control Center as a local Windows desktop app.'
if (Test-Path $icon) {
  $shortcut.IconLocation = $icon
}
$shortcut.Save()

Write-Host "Mara desktop shortcut installed: $shortcutPath"