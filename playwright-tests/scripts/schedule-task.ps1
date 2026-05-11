<#
.SYNOPSIS
    Register (or update) a Windows Scheduled Task that runs the CareConnect
    synthetic login tests at a configurable interval.

.DESCRIPTION
    Creates a Task Scheduler task named "CareConnect-Synthetic-Tests" under
    the \CareConnect\ folder.  Re-running the script will overwrite any
    existing task with the same name.

    The task runs as the current user.  If you need it to run even when the
    user is not logged in, provide -RunAsService and set -ServiceUser /
    -ServicePassword, or run the script as an Administrator and choose a
    service account.

.PARAMETER TestOnly
    Run the Playwright tests and exit - do not register the scheduled task.
    Use this to validate configuration before committing to the full provisioning.

.PARAMETER TestsRoot
    Full path to the playwright-tests directory.
    Defaults to the parent of this script's directory.

.PARAMETER IntervalMinutes
    How often to run the tests (minutes).  Default: 5.

.PARAMETER RunAsService
    If set, the task is configured to run whether or not the user is
    logged on (requires elevation and a password).

.PARAMETER ServiceUser
    Domain\User or .\User to run the task under (only with -RunAsService).

.PARAMETER ServicePassword
    Password for -ServiceUser (only with -RunAsService).

.EXAMPLE
    # Validate tests only - no task registered
    .\scripts\schedule-task.ps1 -TestOnly

.EXAMPLE
    # Run every 5 minutes as the current user
    .\scripts\schedule-task.ps1

.EXAMPLE
    # Run every 10 minutes as a service account
    .\scripts\schedule-task.ps1 -IntervalMinutes 10 -RunAsService `
        -ServiceUser "CORP\svc-playwright" -ServicePassword "P@ssw0rd"

.EXAMPLE
    # Remove the task
    Unregister-ScheduledTask -TaskName "CareConnect-Synthetic-Tests" `
        -TaskPath "\CareConnect\" -Confirm:$false
#>

param(
    [switch]$TestOnly,
    [string]$TestsRoot       = "",
    [int]   $IntervalMinutes = 5,
    [switch]$RunAsService,
    [string]$ServiceUser     = "",
    [string]$ServicePassword = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- Resolve paths -------------------------------------------------------------
if ($TestsRoot -eq "") {
    $TestsRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$RunScript  = Join-Path $TestsRoot "scripts\run-tests.ps1"
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path $RunScript)) {
    Write-Error "run-tests.ps1 not found at: $RunScript"
    exit 1
}

# -- Step 1: Run tests ---------------------------------------------------------
if ($TestOnly) {
    Write-Host ""
    Write-Host "Running tests to validate configuration..." -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "Step 1/2 - Running tests to validate configuration..." -ForegroundColor Cyan
}
Write-Host ""

& $PowerShell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File $RunScript
$TestExitCode = $LASTEXITCODE

Write-Host ""
if ($TestExitCode -ne 0) {
    Write-Host "Tests FAILED (exit $TestExitCode)." -ForegroundColor Red
    if (-not $TestOnly) {
        Write-Host "PROVISIONING ABORTED - fix the failures above then re-run this script."
    }
    exit $TestExitCode
}

Write-Host "All tests passed." -ForegroundColor Green

if ($TestOnly) {
    Write-Host ""
    Write-Host "(-TestOnly flag set - skipping scheduled task registration.)"
    exit 0
}

# -- Step 2: Register the scheduled task ---------------------------------------
Write-Host ""
Write-Host "Step 2/2 - Registering Windows Scheduled Task..." -ForegroundColor Cyan
Write-Host ""

$TaskName = "CareConnect-Synthetic-Tests"
$TaskPath = "\CareConnect\"

$Arguments = "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File `"$RunScript`""
$Action    = New-ScheduledTaskAction `
    -Execute  $PowerShell `
    -Argument $Arguments `
    -WorkingDirectory $TestsRoot

$StartTime   = (Get-Date).Date.AddHours(0)
$RepeatEvery = [System.TimeSpan]::FromMinutes($IntervalMinutes)
$Duration    = [System.TimeSpan]::MaxValue

$Trigger = New-ScheduledTaskTrigger -Once -At $StartTime `
    -RepetitionInterval $RepeatEvery `
    -RepetitionDuration $Duration

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit  ([System.TimeSpan]::FromMinutes([Math]::Max(10, $IntervalMinutes * 2))) `
    -MultipleInstances   IgnoreNew `
    -StartWhenAvailable  `
    -RunOnlyIfNetworkAvailable

if ($RunAsService) {
    if ($ServiceUser -eq "" -or $ServicePassword -eq "") {
        Write-Error "-ServiceUser and -ServicePassword are required with -RunAsService"
        exit 1
    }
    $Principal = New-ScheduledTaskPrincipal `
        -UserId    $ServiceUser `
        -LogonType Password `
        -RunLevel  Highest
} else {
    $Principal = New-ScheduledTaskPrincipal `
        -UserId    ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
        -LogonType Interactive `
        -RunLevel  Limited
}

$TaskParams = @{
    TaskName  = $TaskName
    TaskPath  = $TaskPath
    Action    = $Action
    Trigger   = $Trigger
    Settings  = $Settings
    Principal = $Principal
    Force     = $true
}

if ($RunAsService) {
    $TaskParams["Password"] = $ServicePassword
}

Register-ScheduledTask @TaskParams | Out-Null

Write-Host "Scheduled task registered successfully." -ForegroundColor Green
Write-Host ""
Write-Host "  Task name  : $TaskPath$TaskName"
Write-Host "  Interval   : every $IntervalMinutes minute(s)"
Write-Host "  Script     : $RunScript"
Write-Host "  Working dir: $TestsRoot"
Write-Host ""
Write-Host "To view the task:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' -TaskPath '$TaskPath'"
Write-Host ""
Write-Host "To run it immediately:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName' -TaskPath '$TaskPath'"
Write-Host ""
Write-Host "To remove it:"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -TaskPath '$TaskPath' -Confirm:`$false"
