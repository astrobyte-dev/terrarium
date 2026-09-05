param([switch]$Refresh)
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath('C:/TerrariumBuild/dist/win-unpacked')
$programs = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs'))
$target = [IO.Path]::GetFullPath((Join-Path $programs 'Terrarium-20260906'))
if (-not $target.StartsWith($programs + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected installation target' }
if ((Test-Path -LiteralPath $target) -and -not $Refresh) { throw 'Versioned app directory already exists; inspect before replacing it' }
if (Get-Process Terrarium -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $target 'Terrarium.exe') }) {
    throw 'Updated app is already running; close it before refreshing its files'
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'Terrarium.exe'))) { throw 'Build the desktop package first' }
$backup = Join-Path $env:LOCALAPPDATA ('Terrarium/performance-backups/desktop-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
if (Test-Path -LiteralPath $target) {
    Get-ChildItem -LiteralPath $source | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force }
} else { Copy-Item -LiteralPath $source -Destination $target -Recurse }
$expected = (Get-FileHash -LiteralPath (Join-Path $source 'resources/app.asar') -Algorithm SHA256).Hash
$actual = (Get-FileHash -LiteralPath (Join-Path $target 'resources/app.asar') -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'Staged application checksum mismatch' }
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcut = Join-Path $desktop 'Terrarium.lnk'
if (Test-Path -LiteralPath $shortcut) { Copy-Item -LiteralPath $shortcut -Destination (Join-Path $backup 'Terrarium.lnk') }
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = Join-Path $target 'Terrarium.exe'
$link.WorkingDirectory = $target
$link.IconLocation = $link.TargetPath
$link.Save()
@{ application=$target; shortcut=$shortcut; backup=$backup; asarSha256=$actual; existingAppLeftRunning=$true } | ConvertTo-Json
