<#
.SYNOPSIS
    Run the CareConnect / MyChart / PACS Playwright login tests.

.DESCRIPTION
    Loads the .env file from the playwright-tests directory, launches Chrome
    externally with a remote-debugging port (so the ThousandEyes extension runs
    without automation flags), connects Playwright via CDP, executes all tests,
    and writes a timestamped log to .\logs\.

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

# -- Resolve Chrome config from environment ------------------------------------
$UserDataDir = $env:CHROME_USER_DATA_DIR
if (-not $UserDataDir) {
    Write-Log "ERROR: CHROME_USER_DATA_DIR is not set in .env"
    exit 1
}

$ProfileDir = if ($env:CHROME_PROFILE_DIR) { $env:CHROME_PROFILE_DIR } else { "Profile 1" }
$DebugPort  = if ($env:CHROME_DEBUG_PORT)  { $env:CHROME_DEBUG_PORT  } else { "9222" }

Write-Log "Chrome profile : $UserDataDir\$ProfileDir"
Write-Log "CDP port       : $DebugPort"

# -- Find Chrome executable ----------------------------------------------------
$ChromeCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$ChromeExe = $ChromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $ChromeExe) {
    Write-Log "ERROR: Chrome executable not found in standard locations"
    exit 1
}
Write-Log "Chrome         : $ChromeExe"

# -- Kill any existing Chrome so the profile singleton lock is released --------
$existingChrome = Get-Process -Name chrome -ErrorAction SilentlyContinue
if ($existingChrome) {
    Write-Log "Stopping $($existingChrome.Count) existing Chrome process(es)..."
    $existingChrome | Stop-Process -Force
    Start-Sleep -Seconds 3
}

# -- Delete Chrome singleton lock files so the new process starts cleanly ------
# Stop-Process -Force exits the process immediately but may leave the lock
# files behind; Chrome finding these on startup can cause it to hang waiting
# for a response from the (now-dead) previous instance.
$SingletonFiles = @("SingletonLock", "SingletonSocket", "SingletonCookie")
foreach ($f in $SingletonFiles) {
    $path = Join-Path $UserDataDir $f
    if (Test-Path $path) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
        Write-Log "Deleted singleton file: $f"
    }
}

# -- Clear Chrome session files so the profile starts with no restored tabs ----
# --no-restore-session-state only suppresses crash recovery; deleting these
# files also overrides the "Continue where you left off" startup preference.
$SessionFiles = @("Current Session", "Current Tabs", "Last Session", "Last Tabs")
foreach ($f in $SessionFiles) {
    $path = Join-Path (Join-Path $UserDataDir $ProfileDir) $f
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Log "Cleared session file: $f"
    }
}

# -- Launch Chrome externally with remote-debugging-port ----------------------
# Running Chrome this way means Playwright's --enable-automation flag is never
# added, so the ThousandEyes Endpoint Agent extension reports metrics normally.
#
# Pass as a single string so PowerShell 5.1 does not re-quote array elements.
# Paths that contain spaces must be quoted inside the value (after =) so Chrome
# receives them as a single argument; unquoted spaces would be split by the
# CRT argument parser and the trailing word would be treated as a URL to open.
$ChromeArgStr = "--remote-debugging-port=$DebugPort " +
                "--user-data-dir=`"$UserDataDir`" " +
                "--profile-directory=`"$ProfileDir`" " +
                "--no-restore-session-state " +
                "--no-default-browser-check " +
                "--disable-session-crashed-bubble " +
                "--hide-crash-restore-bubble " +
                "--no-first-run " +
                "about:blank"

Write-Log "Chrome args    : $ChromeArgStr"
Write-Log "Starting Chrome with remote-debugging-port=$DebugPort ..."
$ChromeProcess = Start-Process -FilePath $ChromeExe -ArgumentList $ChromeArgStr -PassThru

# Verify Chrome did not crash immediately
Start-Sleep -Seconds 3
if ($ChromeProcess.HasExited) {
    Write-Log "ERROR: Chrome exited immediately (exit code: $($ChromeProcess.ExitCode))"
    exit 1
}
Write-Log "Chrome PID     : $($ChromeProcess.Id) (running)"

# -- Wait for Chrome CDP to become available -----------------------------------
$CdpUrl  = "http://127.0.0.1:$DebugPort/json"
$MaxWait = 30
$Elapsed = 0
$CdpReady = $false

while ($Elapsed -lt $MaxWait) {
    if ($ChromeProcess.HasExited) {
        Write-Log "ERROR: Chrome exited while waiting for CDP (exit code: $($ChromeProcess.ExitCode))"
        exit 1
    }
    try {
        Invoke-WebRequest -Uri $CdpUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
        $CdpReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
        $Elapsed++
    }
}

if (-not $CdpReady) {
    Write-Log "ERROR: Chrome CDP not ready after $MaxWait seconds"
    Write-Log "Chrome still running: $(-not $ChromeProcess.HasExited)"
    $portInfo = netstat -an 2>$null | Select-String ":$DebugPort "
    if ($portInfo) {
        Write-Log "Port $DebugPort status: $portInfo"
    } else {
        Write-Log "Port $DebugPort is not bound - Chrome started but never opened debug port"
    }
    Stop-Process -Id $ChromeProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Log "Chrome CDP ready (waited ${Elapsed}s)"

# -- Change to the playwright-tests directory ----------------------------------
Set-Location $RootDir

# -- Install dependencies if node_modules is missing --------------------------
if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Write-Log "node_modules not found - running npm install..."
    npm install 2>&1 | Tee-Object -Append -FilePath $LogFile
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: npm install failed (exit $LASTEXITCODE)"
        Stop-Process -Id $ChromeProcess.Id -Force -ErrorAction SilentlyContinue
        exit $LASTEXITCODE
    }
}

# -- Install Playwright browser (Chrome) if missing ---------------------------
$PlaywrightBrowsers = Join-Path $env:LOCALAPPDATA "ms-playwright"
if (-not (Test-Path $PlaywrightBrowsers)) {
    Write-Log "Playwright browsers not found - running install..."
    npx playwright install chrome 2>&1 | Tee-Object -Append -FilePath $LogFile
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

# -- Stop Chrome - let the extension flush any pending metrics first -----------
# A short grace period gives the TE extension time to report the final page view
# before the process is killed.
Write-Log "Waiting 5s for TE extension to flush metrics..."
Start-Sleep -Seconds 5

if (-not $ChromeProcess.HasExited) {
    Write-Log "Stopping Chrome (PID $($ChromeProcess.Id))..."
    Stop-Process -Id $ChromeProcess.Id -Force -ErrorAction SilentlyContinue
}

# -- Prune logs older than 30 days ---------------------------------------------
Get-ChildItem -Path $LogDir -Filter "test-run_*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

exit $ExitCode
