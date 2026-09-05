$ErrorActionPreference = 'Stop'
$taskDataDir = Join-Path $env:LOCALAPPDATA 'Terrarium'
$backupPath = Join-Path $taskDataDir 'performance-backups/ollama-environment.json'
$values = @{ OLLAMA_FLASH_ATTENTION='1'; OLLAMA_KV_CACHE_TYPE='q8_0'; OLLAMA_NUM_PARALLEL='1'; OLLAMA_MAX_LOADED_MODELS='1' }
if (-not (Test-Path -LiteralPath $backupPath)) {
    $before = @{}
    foreach ($name in $values.Keys) { $before[$name] = [Environment]::GetEnvironmentVariable($name, 'User') }
    $before | ConvertTo-Json | Set-Content -LiteralPath $backupPath -Encoding UTF8
}
foreach ($entry in $values.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'User') }
$nodePath = (Get-Command node.exe).Source
$brokerPath = Join-Path $taskDataDir 'runtime/inference-server.cjs'
$launcherPath = Join-Path $taskDataDir 'runtime/start-inference.ps1'
$launcher = "& '" + $nodePath.Replace("'", "''") + "' '" + $brokerPath.Replace("'", "''") + "'"
Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcherPath + '"')
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Terrarium Inference' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Terrarium local GPU scheduling and provider budget' -Force | Out-Null
Write-Output 'Performance settings saved for future Ollama starts; hidden coordinator logon task installed.'
