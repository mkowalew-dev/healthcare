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
    [string]$TestsRoot       = "",
    [int]   $IntervalMinutes = 5,
    [switch]$RunAsService,
    [string]$ServiceUser     = "",
    [string]$ServicePassword = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Resolve paths ─────────────────────────────────────────────────────────────
if ($TestsRoot -eq "") {
    $TestsRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$RunScript = Join-Path $TestsRoot "scripts\run-tests.ps1"
if (-not (Test-Path $RunScript)) {
    Write-Error "run-tests.ps1 not found at: $RunScript"
    exit 1
}

$TaskName   = "CareConnect-Synthetic-Tests"
$TaskPath   = "\CareConnect\"
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

# ── Build the action ──────────────────────────────────────────────────────────
$Arguments = "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File `"$RunScript`""
$Action    = New-ScheduledTaskAction `
    -Execute  $PowerShell `
    -Argument $Arguments `
    -WorkingDirectory $TestsRoot

# ── Build the trigger (repeat every N minutes, indefinitely) ──────────────────
$StartTime   = (Get-Date).Date.AddHours(0)   # midnight today — first fire is next aligned interval
$RepeatEvery = [System.TimeSpan]::FromMinutes($IntervalMinutes)
$Duration    = [System.TimeSpan]::MaxValue    # repeat indefinitely

$Trigger = New-ScheduledTaskTrigger -Once -At $StartTime `
    -RepetitionInterval $RepeatEvery `
    -RepetitionDuration $Duration

# ── Build settings ────────────────────────────────────────────────────────────
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit  ([System.TimeSpan]::FromMinutes([Math]::Max(10, $IntervalMinutes * 2))) `
    -MultipleInstances   IgnoreNew `
    -StartWhenAvailable  `
    -RunOnlyIfNetworkAvailable

# ── Principal (who runs the task) ─────────────────────────────────────────────
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
        -LogonType InteractiveToken `
        -RunLevel  Limited
}

# ── Register (or overwrite) the task ─────────────────────────────────────────
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

Write-Host ""
Write-Host "✓ Scheduled task registered successfully" -ForegroundColor Green
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
