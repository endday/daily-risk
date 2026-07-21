param(
  [string]$ScriptPath = 'D:\project\ai-project\daily-risk\worker\scripts\sync-sw-industries.ps1',
  [string]$TaskName = 'DailyRisk SW Industry Sync',
  [string]$RunAt = '18:35'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ScriptPath)) {
  throw "Sync script not found: $ScriptPath"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
  "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
)
$trigger = New-ScheduledTaskTrigger -Daily -At $RunAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -User $env:USERNAME -RunLevel Limited -Force |
  Select-Object TaskName, State, @{Name = 'NextRunTime'; Expression = { $_.Triggers[0].StartBoundary } }
