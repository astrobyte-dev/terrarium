#Requires -Version 5.1
# Run only inside a fresh, disposable Windows VM. This installs and opens the app.
param([string]$BundleDir = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$installer = Join-Path $BundleDir 'Terrarium Setup 0.1.0.exe'
$reportPath = Join-Path $BundleDir 'clean-install-result.json'
$appDir = Join-Path $env:LOCALAPPDATA 'Programs\terrarium'
foreach ($existing in @((Join-Path $env:USERPROFILE '.openclaw'), (Join-Path $env:LOCALAPPDATA 'Terrarium'), (Join-Path $env:APPDATA 'terrarium'), $appDir)) {
    if (Test-Path -LiteralPath $existing) { throw "This is not a clean profile: $existing already exists. Use a fresh VM." }
}
$expected = (Get-Content -LiteralPath (Join-Path $BundleDir 'installer.sha256') -Raw).Trim()
$actual = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'Installer checksum mismatch.' }
$setup = Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
$exe = Join-Path $appDir 'Terrarium.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Installed executable missing: $exe" }
# The application window is needed for the manual first-run checks in README.txt.
$running = Get-Process -Name Terrarium -ErrorAction SilentlyContinue
if (-not $running) { Start-Process -FilePath $exe | Out-Null }
Start-Sleep -Seconds 15
$running = @(Get-Process -Name Terrarium -ErrorAction SilentlyContinue)
$boot = Join-Path $env:LOCALAPPDATA 'Terrarium\gui-boot.log'
$bootText = if (Test-Path -LiteralPath $boot) { Get-Content -LiteralPath $boot -Raw } else { '' }
$result = [ordered]@{
    time = (Get-Date).ToUniversalTime().ToString('o')
    installerSha256 = $actual
    installExitCode = $setup.ExitCode
    executablePresent = $true
    processesRunning = $running.Count
    bootLogPresent = [bool]$bootText
    startupException = [bool]($bootText -match 'uncaughtException')
    manualFirstRun = 'PENDING - follow README.txt and record results'
}
$result | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
if ($running.Count -eq 0 -or -not $bootText -or $result.startupException) { throw "Startup check failed; inspect $reportPath and $boot" }
Write-Host "Install/startup checks passed. Complete the visible first-run checks in README.txt. Report: $reportPath"
