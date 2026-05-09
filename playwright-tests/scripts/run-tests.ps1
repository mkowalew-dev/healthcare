<#
.SYNOPSIS
    Run the CareConnect / MyChart / PACS Playwright login tests.

.DESCRIPTION
    Loads the .env file from the playwright-tests directory, installs
    dependencies if needed, executes all tests, and writes a timestamped
    log to .\logs\.

.PARAMETER TestFilter
    Optional Playwright --grep pattern to run a subset of tests.
    Example: -TestFilter "CareConnect"

.EXAMPLE
    .\scripts\run-tests.ps1
    .\scripts\run-tests.ps1 -TestFilter "PACS"
#>

param(
    [string]$TestFilter = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Paths ────────────────────────────────────────────────────────────────────
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir     = Split-Path -Parent $ScriptDir
$LogDir      = Join-Path $RootDir "logs"
$EnvFile     = Join-Path $RootDir ".env"
$Timestamp   = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile     = Join-Path $LogDir "test-run_$Timestamp.log"

# ── Ensure log directory exists ───────────────────────────────────────────────
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

function Write-Log {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

Write-Log "=== CareConnect Synthetic Test Run ==="
Write-Log "Root directory : $RootDir"
Write-Log "Log file       : $LogFile"

# ── Load .env into the current process environment ────────────────────────────
if (Test-Path $EnvFile) {
    Write-Log "Loading environment from $EnvFile"
    Get-Content $EnvFile | Where-Object { $_ -match '^\s*[^#]\S+=\S' } | ForEach-Object {
        $parts = $_ -split '=', 2
        $key   = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
} else {
    Write-Log "WARNING: .env not found — using defaults / system environment variables"
}

# ── Change to the playwright-tests directory ──────────────────────────────────
Set-Location $RootDir

# ── Install dependencies if node_modules is missing ──────────────────────────
if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Write-Log "node_modules not found — running npm install..."
    npm install 2>&1 | Tee-Object -Append -FilePath $LogFile
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: npm install failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

# ── Install Playwright browser (Chrome) if missing ───────────────────────────
$PlaywrightBrowsers = Join-Path $env:LOCALAPPDATA "ms-playwright"
if (-not (Test-Path $PlaywrightBrowsers)) {
    Write-Log "Playwright browsers not found — running install..."
    npx playwright install chrome 2>&1 | Tee-Object -Append -FilePath $LogFile
}

# ── Build Playwright command ──────────────────────────────────────────────────
$PlaywrightArgs = @("playwright", "test", "--reporter=list")

if ($TestFilter -ne "") {
    $PlaywrightArgs += "--grep"
    $PlaywrightArgs += $TestFilter
    Write-Log "Test filter    : $TestFilter"
}

Write-Log "Running: npx $($PlaywrightArgs -join ' ')"
Write-Log "------------------------------------------------------------"

# ── Execute tests ─────────────────────────────────────────────────────────────
npx @PlaywrightArgs 2>&1 | Tee-Object -Append -FilePath $LogFile
$ExitCode = $LASTEXITCODE

Write-Log "------------------------------------------------------------"
if ($ExitCode -eq 0) {
    Write-Log "RESULT: All tests PASSED"
} else {
    Write-Log "RESULT: One or more tests FAILED (exit $ExitCode)"
}

# ── Prune logs older than 30 days ─────────────────────────────────────────────
Get-ChildItem -Path $LogDir -Filter "test-run_*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

exit $ExitCode
