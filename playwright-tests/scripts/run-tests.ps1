<#
.SYNOPSIS
    Run the CareConnect / MyChart / PACS Playwright login tests.

.DESCRIPTION
    Loads the .env file from the playwright-tests directory, kills any running
    Chrome to release the profile singleton lock, patches the profile's Preferences
    file to clear any crash-recovery state, then executes all tests via
    npx playwright test.  Playwright launches Chrome itself using
    launchPersistentContext so no external debug port is required.

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

# Force UTF-8 so Playwright's Unicode output (checkmarks, box-drawing separators)
# renders correctly instead of garbling as Gce / GoC / GCI etc.
chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding            = [System.Text.Encoding]::UTF8

# -- Paths ---------------------------------------------------------------------
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir     = Split-Path -Parent $ScriptDir
$LogDir      = Join-Path $RootDir "logs"
$EnvFile     = Join-Path $RootDir ".env"
$Timestamp   = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile     = Join-Path $LogDir "test-run_$Timestamp.log"

# -- Ensure log directory exists -----------------------------------------------
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

# -- Load .env into the current process environment ----------------------------
if (Test-Path $EnvFile) {
    Write-Log "Loading environment from $EnvFile"
    Get-Content $EnvFile | Where-Object { $_ -match '^\s*[^#]\S+=\S' } | ForEach-Object {
        $parts = $_ -split '=', 2
        $key   = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
} else {
    Write-Log "WARNING: .env not found - using defaults / system environment variables"
}

# -- Resolve Chrome profile from environment -----------------------------------
$UserDataDir = $env:CHROME_USER_DATA_DIR
if (-not $UserDataDir) {
    Write-Log "ERROR: CHROME_USER_DATA_DIR is not set in .env"
    exit 1
}

$ProfileDir = if ($env:CHROME_PROFILE_DIR) { $env:CHROME_PROFILE_DIR } else { "Profile 1" }

Write-Log "Chrome profile : $UserDataDir\$ProfileDir"

# -- Kill any existing Chrome to release the profile singleton lock ------------
# Use taskkill /F so processes owned by other users/sessions are also
# terminated; Get-Process only sees the current user's processes.
$tasklistOut = & tasklist /FI "IMAGENAME eq chrome.exe" /NH 2>$null
$chromeLines = $tasklistOut | Where-Object { $_ -match 'chrome\.exe' }
if ($chromeLines) {
    Write-Log "Killing existing Chrome processes (all users)..."
    $chromeLines | ForEach-Object { Write-Log "  $_" }
    & taskkill /F /IM chrome.exe /T 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    Write-Log "Chrome killed"
}

# -- Delete singleton lock files so Chrome starts cleanly ----------------------
$SingletonFiles = @("SingletonLock", "SingletonSocket", "SingletonCookie")
foreach ($f in $SingletonFiles) {
    $path = Join-Path $UserDataDir $f
    if (Test-Path $path) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
        Write-Log "Deleted singleton: $f"
    }
}

# -- Patch Preferences to clear crash-recovery state --------------------------
# After a force-kill Chrome sets exit_type to "Crashed", causing the "Restore
# pages?" banner on next launch which can delay extension initialisation.
$PrefsFile = Join-Path (Join-Path $UserDataDir $ProfileDir) "Preferences"
if (Test-Path $PrefsFile) {
    try {
        $prefs = Get-Content $PrefsFile -Raw | ConvertFrom-Json
        if ($null -ne $prefs.profile) {
            $prefs.profile.exit_type     = "Normal"
            $prefs.profile.exited_cleanly = $true
        }
        $prefs | ConvertTo-Json -Depth 100 | Set-Content $PrefsFile -Encoding UTF8
        Write-Log "Cleared crash state in Preferences"
    } catch {
        Write-Log "WARNING: Could not patch Preferences file: $_"
    }
}

# -- Change to the playwright-tests directory ----------------------------------
Set-Location $RootDir

# -- Install dependencies if node_modules is missing --------------------------
if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Write-Log "node_modules not found - running npm install..."
    npm install 2>&1 | Tee-Object -Append -FilePath $LogFile
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: npm install failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

# -- Build Playwright command --------------------------------------------------
$PlaywrightArgs = @("playwright", "test", "--reporter=list")

if ($TestFilter -ne "") {
    $PlaywrightArgs += "--grep"
    $PlaywrightArgs += $TestFilter
    Write-Log "Test filter    : $TestFilter"
}

Write-Log "Running: npx $($PlaywrightArgs -join ' ')"
Write-Log "------------------------------------------------------------"

# -- Execute tests -------------------------------------------------------------
npx @PlaywrightArgs 2>&1 | Tee-Object -Append -FilePath $LogFile
$ExitCode = $LASTEXITCODE

Write-Log "------------------------------------------------------------"
if ($ExitCode -eq 0) {
    Write-Log "RESULT: All tests PASSED"
} else {
    Write-Log "RESULT: One or more tests FAILED (exit $ExitCode)"
}

# -- Prune logs older than 30 days ---------------------------------------------
Get-ChildItem -Path $LogDir -Filter "test-run_*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

exit $ExitCode
