#Requires -Version 5.1
<#
  vm-bootstrap.ps1 - one command from a blank Windows VM to the installed stack.
  Handles every fresh-Windows gotcha internally so there are no manual follow-up
  steps: pins the winget source (msstore often cert-fails on a fresh VM),
  self-relaunches once so a freshly-installed Node lands on PATH, and calls
  npm via npm.cmd so PowerShell's script-execution policy is never in the way.

  Preview only (installs nothing):
      powershell -ExecutionPolicy Bypass -File vm-bootstrap.ps1
  Full install (Ollama, OpenClaw, ComfyUI + fallback brain):
      powershell -ExecutionPolicy Bypass -File vm-bootstrap.ps1 -Run

  Walkthrough + verification: docs\m6d-vm-runbook.md
#>
param([switch]$Run, [switch]$Relaunched)

$ErrorActionPreference = 'Stop'
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Have($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function Section($msg) { Write-Host "`n== $msg ==" -ForegroundColor Cyan }
function RefreshPath {
  $m = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $u = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$m;$u"
}

Section 'Environment'
Write-Host ("OS: {0}" -f (Get-CimInstance Win32_OperatingSystem).Caption)
$haveWinget = Have 'winget'
if ($haveWinget) {
  Write-Host "winget: present"
} else {
  Write-Warning "winget NOT found. Ollama and ComfyUI will show as blockers and the install will refuse. Install 'App Installer' from the Microsoft Store, then re-run."
}

Section 'Node.js'
if (Have 'node') {
  Write-Host ("node present: {0}" -f (node --version))
} elseif ($haveWinget) {
  Write-Host "installing Node.js LTS via winget (silent)..."
  # --source winget is required: a fresh VM's msstore source often fails with a
  # cert error (0x8a15005e) and makes the install ambiguous. Pin winget's source.
  winget install --id OpenJS.NodeJS.LTS --source winget --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  RefreshPath
  if (Have 'node') {
    Write-Host ("node installed: {0}" -f (node --version))
  } elseif (-not $Relaunched) {
    # The installer updated the registry PATH but this process can't see it.
    # Relaunch once in a fresh process (which inherits the new PATH) and continue.
    Write-Host "node installed; relaunching in a fresh shell to pick up PATH..."
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Relaunched')
    if ($Run) { $a += '-Run' }
    $p = Start-Process powershell.exe -ArgumentList $a -Wait -PassThru -NoNewWindow
    exit $p.ExitCode
  } else {
    throw "Node installed but still not on PATH after a relaunch. Open a new PowerShell window and re-run."
  }
} else {
  throw "Node.js is required but winget is unavailable. Install Node LTS from https://nodejs.org, then re-run."
}

# npm.cmd (not the npm.ps1 wrapper) so a Restricted execution policy can't block it.
$npm = 'npm.cmd'

Section 'Dependencies'
if (Test-Path 'package-lock.json') {
  Write-Host "npm ci (reproducible install from the lockfile)..."
  & $npm ci
} else {
  Write-Host "npm install..."
  & $npm install
}
if ($LASTEXITCODE -ne 0) { throw "dependency install failed - check the VM's internet / npm registry access." }

if ($Run) {
  Section 'Install (Ollama, OpenClaw, ComfyUI + fallback brain)'
  & $npm run setup -- --run
  $code = $LASTEXITCODE
  Section 'Done'
  if ($code -eq 0) {
    Write-Host "Install finished. Verify per docs\m6d-vm-runbook.md (Step 4)." -ForegroundColor Green
    Write-Host "Re-run this with -Run once more to confirm it is idempotent (everything should skip)."
  } else {
    Write-Host "Install stopped (exit $code). Fix the cause it printed and re-run -Run; completed steps skip." -ForegroundColor Yellow
  }
  exit $code
}

Section 'Setup preview (read-only - nothing was installed)'
& $npm run setup

Section 'Next'
Write-Host "Plan looks clear? Do the real install with one command:" -ForegroundColor Green
Write-Host "    powershell -ExecutionPolicy Bypass -File vm-bootstrap.ps1 -Run"
