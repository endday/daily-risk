param(
  [string]$FreeStockDb = 'D:\project\ai-project\free-stockdb',
  [string]$RepoRoot = 'D:\project\ai-project\daily-risk',
  [int]$UploadDays = 45
)

$ErrorActionPreference = 'Stop'
$logDir = Join-Path $RepoRoot 'logs'
$null = New-Item -ItemType Directory -Force -Path $logDir
$logPath = Join-Path $logDir ("sw-industry-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $logPath -Value $line
  Write-Host $line
}

$updater = Join-Path $FreeStockDb '数据更新.exe'
$source = Join-Path $FreeStockDb 'pybao'
$materializer = Join-Path $RepoRoot 'worker\scripts\materialize-sw-industries.py'

if (-not (Test-Path -LiteralPath $updater)) { throw "free-stockdb updater not found: $updater" }
if (-not (Test-Path -LiteralPath $source)) { throw "free-stockdb pybao not found: $source" }
if (-not (Test-Path -LiteralPath $materializer)) { throw "materializer not found: $materializer" }

$stockDbProcess = Get-Process -Name 'stockdb' -ErrorAction SilentlyContinue
if ($stockDbProcess) {
  throw 'stockdb.exe is running. Stop it before the scheduled data update.'
}

Write-Log 'Starting free-stockdb official updater.'
$updateProcess = Start-Process -FilePath $updater -WorkingDirectory $FreeStockDb -Wait -PassThru -WindowStyle Hidden
if ($updateProcess.ExitCode -ne 0) {
  throw "free-stockdb updater failed with exit code $($updateProcess.ExitCode)"
}

Write-Log "Materializing Shenwan industries and uploading the last $UploadDays days."
& python $materializer --source $source --start 20240101 --end N --upload-days $UploadDays --mode remote
if ($LASTEXITCODE -ne 0) { throw "industry materialization failed with exit code $LASTEXITCODE" }

Write-Log 'Industry synchronization completed.'
