<#
.SYNOPSIS
    Run the CareConnect / MyChart / PACS Playwright login tests.

.DESCRIPTION
    Loads the .env file, creates an NTFS junction so Chrome's non-default-dir
    check passes, launches Chrome externally with a remote-debugging port (so
    no Playwright automation flags are injected and the ThousandEyes extension
    reports real metrics), connects Playwright via CDP, executes all tests, and
    writes a timestamped log to .\logs\.

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

# Force UTF-8 so Playwright's Unicode output renders correctly.
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

# -- Load .env ----------------------------------------------------------------
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

# -- Resolve Chrome config ----------------------------------------------------
$UserDataDir = $env:CHROME_USER_DATA_DIR
if (-not $UserDataDir) {
    Write-Log "ERROR: CHROME_USER_DATA_DIR is not set in .env"
    exit 1
}

$ProfileDir = if ($env:CHROME_PROFILE_DIR) { $env:CHROME_PROFILE_DIR } else { "Profile 1" }
$DebugPort  = if ($env:CHROME_DEBUG_PORT)  { $env:CHROME_DEBUG_PORT  } else { "9222" }

# -- Redirect default Chrome user data dir via NTFS junction ------------------
# Chrome 148+ blocks --remote-debugging-port when --user-data-dir equals
# Chrome's own default path (%LOCALAPPDATA%\Google\Chrome\User Data).
# Chrome compares the literal path string, not the resolved filesystem path,
# so an NTFS junction at a non-default location bypasses the block.
# mklink /J does not require admin rights.
$DefaultChromeDir = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
if ([System.IO.Path]::GetFullPath($UserDataDir) -eq [System.IO.Path]::GetFullPath($DefaultChromeDir)) {
    $JunctionDir = "C:\TE-Chrome-Profile"
    if (-not (Test-Path $JunctionDir)) {
        Write-Log "Creating NTFS junction: $JunctionDir -> $UserDataDir"
        cmd /c mklink /J "$JunctionDir" "$UserDataDir" 2>&1 | Out-Null
    }
    Write-Log "Redirecting user data dir via junction: $JunctionDir"
    $UserDataDir = $JunctionDir
    [System.Environment]::SetEnvironmentVariable("CHROME_USER_DATA_DIR", $JunctionDir, "Process")
}

Write-Log "Chrome profile : $UserDataDir\$ProfileDir"
Write-Log "CDP port       : $DebugPort"

# -- Find Chrome executable ---------------------------------------------------
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

$CdpUrl        = "http://127.0.0.1:$DebugPort/json"
$CdpReady      = $false
$ChromeProcess = $null

# -- Reuse Chrome if already running on the debug port ------------------------
try {
    Invoke-WebRequest -Uri $CdpUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
    $CdpReady = $true
    $ChromeProcess = Get-Process -Name chrome -ErrorAction SilentlyContinue | Select-Object -First 1
    Write-Log "Chrome already running on port $DebugPort (PID $($ChromeProcess.Id)) - reusing"
} catch {}

if (-not $CdpReady) {
    # -- Kill any existing Chrome to release the profile singleton lock --------
    $tasklistOut = & tasklist /FI "IMAGENAME eq chrome.exe" /NH 2>$null
    $chromeLines = $tasklistOut | Where-Object { $_ -match 'chrome\.exe' }
    if ($chromeLines) {
        Write-Log "Killing existing Chrome processes (all users)..."
        $chromeLines | ForEach-Object { Write-Log "  $_" }
        & taskkill /F /IM chrome.exe /T 2>&1 | Out-Null
        Start-Sleep -Seconds 2
        Write-Log "Chrome killed"
    }

    # -- Delete singleton lock files ------------------------------------------
    $SingletonFiles = @("SingletonLock", "SingletonSocket", "SingletonCookie")
    foreach ($f in $SingletonFiles) {
        $path = Join-Path $UserDataDir $f
        if (Test-Path $path) {
            Remove-Item $path -Force -ErrorAction SilentlyContinue
            Write-Log "Deleted singleton: $f"
        }
    }

    # -- Clear session files to prevent restore-tabs prompt -------------------
    $SessionFiles = @("Current Session", "Current Tabs", "Last Session", "Last Tabs")
    foreach ($f in $SessionFiles) {
        $path = Join-Path (Join-Path $UserDataDir $ProfileDir) $f
        if (Test-Path $path) {
            Remove-Item $path -Force -ErrorAction SilentlyContinue
            Write-Log "Cleared session file: $f"
        }
    }

    # -- Patch Preferences to clear crash-recovery state ---------------------
    $PrefsFile = Join-Path (Join-Path $UserDataDir $ProfileDir) "Preferences"
    if (Test-Path $PrefsFile) {
        try {
            $prefs = Get-Content $PrefsFile -Raw | ConvertFrom-Json
            if ($null -ne $prefs.profile) {
                $prefs.profile.exit_type = "Normal"
                if ($null -eq $prefs.profile.PSObject.Properties["exited_cleanly"]) {
                    $prefs.profile | Add-Member -NotePropertyName "exited_cleanly" -NotePropertyValue $true
                } else {
                    $prefs.profile.exited_cleanly = $true
                }
            }
            $prefs | ConvertTo-Json -Depth 100 | Set-Content $PrefsFile -Encoding UTF8
            Write-Log "Cleared crash state in Preferences"
        } catch {
            Write-Log "WARNING: Could not patch Preferences file: $_"
        }
    }

    # -- Launch Chrome externally with remote-debugging-port ------------------
    # Use Start-Process (UseShellExecute=true) so Chrome gets the proper Window
    # Station / Desktop context.  The junction path is non-default so Chrome
    # will bind the debug port without requiring a GPO policy.
    $ChromeArgs = "--remote-debugging-port=$DebugPort " +
                  "--remote-allow-origins=http://127.0.0.1:$DebugPort " +
                  "--user-data-dir=`"$UserDataDir`" " +
                  "--profile-directory=`"$ProfileDir`" " +
                  "--no-default-browser-check " +
                  "--no-first-run " +
                  "about:blank"

    Write-Log "Starting Chrome with remote-debugging-port=$DebugPort ..."
    $ChromeProcess = Start-Process -FilePath $ChromeExe -ArgumentList $ChromeArgs -PassThru

    Start-Sleep -Seconds 3
    $tasklistAfter = & tasklist /FI "IMAGENAME eq chrome.exe" /NH /V 2>$null
    $tasklistAfter | Where-Object { $_ -match 'chrome\.exe' } | ForEach-Object { Write-Log "Chrome proc: $_" }

    # -- Wait for Chrome CDP (up to 60s) --------------------------------------
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

# -- Change to the playwright-tests directory ---------------------------------
Set-Location $RootDir

# -- Install dependencies if node_modules is missing -------------------------
if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Write-Log "node_modules not found - running npm install..."
    npm install 2>&1 | Tee-Object -Append -FilePath $LogFile
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: npm install failed (exit $LASTEXITCODE)"
        Stop-Process -Id $ChromeProcess.Id -Force -ErrorAction SilentlyContinue
        exit $LASTEXITCODE
    }
}

# -- Build Playwright command -------------------------------------------------
$PlaywrightArgs = @("playwright", "test", "--reporter=list")
if ($TestFilter -ne "") {
    $PlaywrightArgs += "--grep"
    $PlaywrightArgs += $TestFilter
    Write-Log "Test filter    : $TestFilter"
}

Write-Log "Running: npx $($PlaywrightArgs -join ' ')"
Write-Log "------------------------------------------------------------"

# -- Execute tests ------------------------------------------------------------
npx @PlaywrightArgs 2>&1 | Tee-Object -Append -FilePath $LogFile
$ExitCode = $LASTEXITCODE

Write-Log "------------------------------------------------------------"
if ($ExitCode -eq 0) {
    Write-Log "RESULT: All tests PASSED"
} else {
    Write-Log "RESULT: One or more tests FAILED (exit $ExitCode)"
}

# -- Close Chrome gracefully so the TE extension can flush metrics ------------
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

# -- Prune logs older than 30 days --------------------------------------------
Get-ChildItem -Path $LogDir -Filter "test-run_*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

exit $ExitCode
