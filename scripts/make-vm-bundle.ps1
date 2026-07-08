#Requires -Version 5.1
<#
  make-vm-bundle.ps1 - produce dist\terrarium-vm-bundle.zip: the source tree a
  fresh VM needs, minus node_modules/.git/dist (the VM does a clean `npm ci`
  from the committed lockfile). There's no git remote to clone from, so this zip
  is how the code reaches the VM. See docs\m6d-vm-runbook.md.

      powershell -ExecutionPolicy Bypass -File scripts\make-vm-bundle.ps1

  Note: zip entries use Windows '\' separators (Compress-Archive on PS 5.1) -
  fine for the Windows VM target; unzip with Expand-Archive or Explorer.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)  # scripts\ -> repo root
$dist = Join-Path $root 'dist'
$zip = Join-Path $dist 'terrarium-vm-bundle.zip'
$staging = Join-Path $env:TEMP ("terrarium-bundle-" + [Guid]::NewGuid().ToString('N'))

New-Item -ItemType Directory -Force -Path $dist | Out-Null
New-Item -ItemType Directory -Force -Path $staging | Out-Null
if (Test-Path -LiteralPath $zip) { [System.IO.File]::Delete($zip) }

Write-Host "Staging source (excluding node_modules, .git, dist)..."
$skip = @('node_modules', '.git', 'dist')
Get-ChildItem -Force -Path $root | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $staging $_.Name) -Recurse -Force
}
# Workspaces hoist to the root node_modules, but drop any nested copies just in case.
$nested = Get-ChildItem -Path $staging -Recurse -Directory -Filter 'node_modules' -ErrorAction SilentlyContinue
if ($nested) { $nested | ForEach-Object { [System.IO.Directory]::Delete($_.FullName, $true) } }

# Sanity: the pieces the VM run depends on must be present in the staging tree.
$required = @(
  'package.json', 'package-lock.json', 'vm-bootstrap.ps1',
  'docs\m6d-vm-runbook.md', 'packages\core\scripts\setup.ts'
)
foreach ($rel in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $staging $rel))) { throw "bundle is missing required file: $rel" }
}

Write-Host "Compressing..."
$items = Get-ChildItem -Force -LiteralPath $staging | Select-Object -ExpandProperty FullName
Compress-Archive -LiteralPath $items -DestinationPath $zip -CompressionLevel Optimal
[System.IO.Directory]::Delete($staging, $true)

$sizeMb = [math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 1)
Write-Host ""
Write-Host ("Bundle ready: {0} ({1} MB)" -f $zip, $sizeMb) -ForegroundColor Green
Write-Host "Copy it to the VM, unzip, then run:  powershell -ExecutionPolicy Bypass -File vm-bootstrap.ps1"
