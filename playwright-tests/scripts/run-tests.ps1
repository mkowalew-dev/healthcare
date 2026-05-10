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

# -- Check for enterprise policy blocking remote debugging ---------------------
$chromePolicyPath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
if (Test-Path $chromePolicyPath) {
    $rdAllowed = Get-ItemProperty $chromePolicyPath -Name RemoteDebuggingAllowed -ErrorAction SilentlyContinue
    if ($null -ne $rdAllowed -and $rdAllowed.RemoteDebuggingAllowed -eq 0) {
        Write-Log "ERROR: Enterprise policy has disabled Chrome remote debugging (RemoteDebuggingAllowed=0)"
        exit 1
    }
}

$CdpUrl      = "http://127.0.0.1:$DebugPort/json"
$CdpReady    = $false
$ChromeProcess = $null

# -- Reuse Chrome if it is already running with the debug port -----------------
# Skipping kill+restart avoids triggering Chrome's crash-recovery scan on the
# next launch.  The page fixture resets each tab to about:blank between tests,
# so reusing an existing Chrome instance is safe.
try {
    Invoke-WebRequest -Uri $CdpUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
    $CdpReady = $true
    $ChromeProcess = Get-Process -Name chrome -ErrorAction SilentlyContinue | Select-Object -First 1
    Write-Log "Chrome already running on port $DebugPort (PID $($ChromeProcess.Id)) - reusing"
} catch {}

if (-not $CdpReady) {
    # -- Kill any existing Chrome so the profile singleton lock is released ----
    $existingChrome = Get-Process -Name chrome -ErrorAction SilentlyContinue
    if ($existingChrome) {
        Write-Log "Stopping $($existingChrome.Count) existing Chrome process(es)..."
        $existingChrome | Stop-Process -Force
        Start-Sleep -Seconds 3
    }

    # Delete singleton lock files left behind by a force-kill so Chrome does
    # not hang waiting for a response from the dead previous instance.
    $SingletonFiles = @("SingletonLock", "SingletonSocket", "SingletonCookie")
    foreach ($f in $SingletonFiles) {
        $path = Join-Path $UserDataDir $f
        if (Test-Path $path) {
            Remove-Item $path -Force -ErrorAction SilentlyContinue
            Write-Log "Deleted singleton file: $f"
        }
    }

    # Clear session files so Chrome does not restore previous tabs on launch.
    $SessionFiles = @("Current Session", "Current Tabs", "Last Session", "Last Tabs")
    foreach ($f in $SessionFiles) {
        $path = Join-Path (Join-Path $UserDataDir $ProfileDir) $f
        if (Test-Path $path) {
            Remove-Item $path -Force
            Write-Log "Cleared session file: $f"
        }
    }

    # -- Launch Chrome externally with remote-debugging-port ------------------
    # Use Start-Process (UseShellExecute=true) so Chrome gets the proper Window
    # Station / Desktop context it needs to initialise its GUI and message pump.
    # Without ShellExecute, Chrome starts but never binds the debug port.
    $ChromeArgs = "--remote-debugging-port=$DebugPort " +
                  "--user-data-dir=`"$UserDataDir`" " +
                  "--profile-directory=`"$ProfileDir`" " +
                  "--no-restore-session-state " +
                  "--no-default-browser-check " +
                  "--disable-session-crashed-bubble " +
                  "--hide-crash-restore-bubble " +
                  "--no-first-run " +
                  "about:blank"

    Write-Log "Chrome args    : $ChromeArgs"
    Write-Log "Starting Chrome with remote-debugging-port=$DebugPort ..."
    $ChromeProcess = Start-Process -FilePath $ChromeExe -ArgumentList $ChromeArgs -PassThru

    # -- Wait for Chrome CDP to become available (up to ~3 min) ---------------
    # Chrome may run a crash-recovery scan on startup if the previous session
    # was force-killed; the extended timeout accommodates that.
    $MaxWait = 60
    $Elapsed = 0

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
        $portInfo = netstat -an 2>$null | Select-String ":$DebugPort "
        Write-Log $(if ($portInfo) { "Port $DebugPort status: $portInfo" } else { "Port $DebugPort is not bound" })
        Stop-Process -Id $ChromeProcess.Id -Force -ErrorAction SilentlyContinue
        exit 1
    }
}

Write-Log "Chrome CDP ready (PID $($ChromeProcess.Id))"

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

# -- Close Chrome gracefully so the profile is saved cleanly ------------------
# CloseMainWindow() sends WM_CLOSE; Chrome shuts down normally and writes its
# profile state.  A force-kill skips this and leaves the profile in a crashed
# state, causing Chrome to run a lengthy recovery scan on the next launch
# (which is why CDP wasn't binding within the timeout on subsequent runs).
Write-Log "Waiting 5s for TE extension to flush metrics..."
Start-Sleep -Seconds 5

if ($null -ne $ChromeProcess -and -not $ChromeProcess.HasExited) {
    Write-Log "Closing Chrome (PID $($ChromeProcess.Id)) gracefully..."
    $ChromeProcess.CloseMainWindow() | Out-Null
    if (-not $ChromeProcess.WaitForExit(15000)) {
        Write-Log "Graceful close timed out - forcing"
        $ChromeProcess.Kill()
    } else {
        Write-Log "Chrome closed cleanly"
    }
}

# -- Prune logs older than 30 days ---------------------------------------------
Get-ChildItem -Path $LogDir -Filter "test-run_*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

exit $ExitCode
