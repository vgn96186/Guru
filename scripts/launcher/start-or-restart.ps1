$ErrorActionPreference = 'Stop'

$Port = if ($env:GURU_LAUNCHER_PORT) { [int]$env:GURU_LAUNCHER_PORT } else { 3100 }
$ScriptsRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = Split-Path -Parent $ScriptsRoot
$ServerPath = Join-Path $PSScriptRoot 'server.js'
$LauncherLogPath = Join-Path $ProjectRoot 'launcher-start.log'

function Write-LauncherLog {
  param([string]$Message)
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $LauncherLogPath -Value "[$stamp] $Message"
}

function Resolve-NodePath {
  try {
    return (Get-Command node -ErrorAction Stop).Source
  } catch {
    # Continue to fallback probes.
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    (Join-Path $env:APPDATA 'nvm\node.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  if ($candidates.Count -gt 0) {
    return $candidates[0]
  }

  return $null
}

$NodePath = Resolve-NodePath
if (-not $NodePath) {
  throw "node.exe was not found. Install Node.js or add it to PATH. See log: $LauncherLogPath"
}

function Get-LauncherPid {
  param(
    [int]$TargetPort = $Port
  )

  $line = netstat -ano |
    Select-String ":$TargetPort" |
    Where-Object { $_.ToString() -match 'LISTENING' } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  $parts = $line.ToString().Trim() -split '\s+'
  return [int]$parts[-1]
}

function Test-GuruLauncher {
  param(
    [int]$TargetPort = $Port
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$TargetPort/" -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -like '*Guru Dev Launcher*'
  } catch {
    return $false
  }
}

function Wait-ForPortToClose {
  param(
    [int]$TargetPort = $Port
  )

  for ($attempt = 0; $attempt -lt 24; $attempt += 1) {
    if (-not (Get-LauncherPid -TargetPort $TargetPort)) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  }

  return $false
}

function Wait-ForLauncherReady {
  param(
    [int]$TargetPort = $Port
  )

  for ($attempt = 0; $attempt -lt 32; $attempt += 1) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$TargetPort/api/status" -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  return $false
}

function Get-FirstFreePort {
  param(
    [int]$PreferredPort = 3100,
    [int]$MaxOffset = 20
  )

  for ($offset = 0; $offset -le $MaxOffset; $offset += 1) {
    $candidate = $PreferredPort + $offset
    if (-not (Get-LauncherPid -TargetPort $candidate)) {
      return $candidate
    }
  }

  return $null
}

try {
  $selectedPort = $Port
  $existingPid = Get-LauncherPid -TargetPort $selectedPort
  if ($existingPid) {
    if (Test-GuruLauncher -TargetPort $selectedPort) {
      Stop-Process -Id $existingPid -Force
      if (-not (Wait-ForPortToClose -TargetPort $selectedPort)) {
        throw "Launcher port $selectedPort did not close after stopping PID $existingPid."
      }
    } else {
      $nextPort = Get-FirstFreePort -PreferredPort ($selectedPort + 1)
      if (-not $nextPort) {
        throw "Port $selectedPort is busy and no fallback port was available."
      }
      Write-LauncherLog "Port $selectedPort is busy with another process. Falling back to port $nextPort."
      $selectedPort = $nextPort
    }
  }

  Write-LauncherLog "Starting Guru launcher on port $selectedPort."
  Write-LauncherLog "Using node at: $NodePath"

  $env:GURU_LAUNCHER_NO_OPEN = '1'
  $env:GURU_LAUNCHER_PORT = "$selectedPort"
  Start-Process -FilePath $NodePath -ArgumentList "`"$ServerPath`"" -WorkingDirectory $ProjectRoot -WindowStyle Hidden

  if (-not (Wait-ForLauncherReady -TargetPort $selectedPort)) {
    throw "Guru launcher did not become ready on http://localhost:$selectedPort."
  }

  $launcherUrl = "http://localhost:$selectedPort"
  try {
    Start-Process $launcherUrl
  } catch {
    try {
      Start-Process -FilePath 'explorer.exe' -ArgumentList $launcherUrl
    } catch {
      Write-Warning "Launcher started but the browser could not be opened automatically."
      Write-LauncherLog 'Browser auto-open failed, but launcher server appears healthy.'
    }
  }

  Write-LauncherLog "Guru launcher is ready at $launcherUrl"
  Write-Output "Guru launcher ready at $launcherUrl"
} catch {
  $message = $_.Exception.Message
  Write-LauncherLog "Launcher failed: $message"
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    [System.Windows.Forms.MessageBox]::Show(
      "Guru Launcher failed to start.`n`n$message`n`nDetails: $LauncherLogPath",
      "Guru Launcher Error",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  } catch {
    # Fall back to console output.
  }
  throw
}
