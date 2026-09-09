$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $PSScriptRoot
$packageMetadata = Get-Content -LiteralPath (Join-Path $projectDirectory "package.json") -Raw | ConvertFrom-Json
$productName = [string]$packageMetadata.build.productName
$executableName = [string]$packageMetadata.build.win.executableName
$shortcutName = [string]$packageMetadata.build.nsis.shortcutName
$outputDirectory = [string]$packageMetadata.build.directories.output
$version = [string]$packageMetadata.version
$targetArchitectures = @($packageMetadata.build.win.target[0].arch)
if ($targetArchitectures.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$targetArchitectures[0])) {
  throw "Installer smoke requires exactly one configured Windows architecture."
}
$architecture = [string]$targetArchitectures[0]
$installerName = [string]$packageMetadata.build.win.artifactName
$installerName = $installerName.Replace('${version}', $version).Replace('${arch}', $architecture).Replace('${ext}', 'exe')
$installerPath = Join-Path (Join-Path $projectDirectory $outputDirectory) $installerName
$installDirectory = Join-Path $env:LOCALAPPDATA ("Programs\{0}" -f $packageMetadata.name)
$installedExecutable = Join-Path $installDirectory ("{0}.exe" -f $executableName)
$uninstaller = Join-Path $installDirectory ("Uninstall {0}.exe" -f $productName)
$temporaryDirectory = $null
$testFailure = $null

function Resolve-ShellFolder {
  param(
    [Parameter(Mandatory = $true)][string]$DotNetName,
    [Parameter(Mandatory = $true)][string]$RegistryName,
    [Parameter(Mandatory = $true)][string]$Fallback
  )

  $folder = [Environment]::GetFolderPath($DotNetName)
  if ([string]::IsNullOrWhiteSpace($folder)) {
    $shellFolders = Get-ItemProperty -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" -ErrorAction SilentlyContinue
    $folder = [Environment]::ExpandEnvironmentVariables([string]$shellFolders.$RegistryName)
  }
  if ([string]::IsNullOrWhiteSpace($folder)) {
    $folder = $Fallback
  }
  return $folder
}

$desktopDirectory = Resolve-ShellFolder -DotNetName "Desktop" -RegistryName "Desktop" -Fallback (Join-Path $env:USERPROFILE "Desktop")
$programsDirectory = Resolve-ShellFolder -DotNetName "Programs" -RegistryName "Programs" -Fallback (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
$desktopShortcut = Join-Path $desktopDirectory ("{0}.lnk" -f $shortcutName)
$startMenuShortcut = Join-Path $programsDirectory ("{0}.lnk" -f $shortcutName)

function Get-ReedUninstallEntry {
  Get-ChildItem -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
    Get-ItemProperty -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq $productName -or $_.DisplayName -eq ("{0} {1}" -f $productName, $version) }
}

function Wait-Until {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Condition,
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (& $Condition) {
      return
    }
    Start-Sleep -Milliseconds 250
  }
  throw $FailureMessage
}

function Wait-ForProcessExit {
  param(
    [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
    [Parameter(Mandatory = $true)][int]$TimeoutMilliseconds,
    [Parameter(Mandatory = $true)][string]$ProcessName
  )

  if (-not $Process.WaitForExit($TimeoutMilliseconds)) {
    & (Join-Path $env:SystemRoot "System32\taskkill.exe") /PID $Process.Id /T /F 2>$null | Out-Null
    $Process.WaitForExit()
    throw "The Reed $ProcessName did not exit within $([Math]::Round($TimeoutMilliseconds / 1000)) seconds."
  }

  # Flush redirected output streams after the bounded wait completes.
  $Process.WaitForExit()
  $Process.Refresh()
  return [int]$Process.ExitCode
}

function Remove-TestResidue {
  $programsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "Programs"))
  $resolvedInstallDirectory = [IO.Path]::GetFullPath($installDirectory)
  if ((Test-Path -LiteralPath $resolvedInstallDirectory) -and
      $resolvedInstallDirectory.StartsWith($programsRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedInstallDirectory -Recurse -Force -ErrorAction SilentlyContinue
  }

  Remove-Item -LiteralPath $desktopShortcut, $startMenuShortcut -Force -ErrorAction SilentlyContinue
  Get-ReedUninstallEntry | ForEach-Object {
    Remove-Item -LiteralPath $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
  throw "Installer not found: $installerPath"
}

if ((Test-Path -LiteralPath $installDirectory) -or (Get-ReedUninstallEntry) -or
    (Test-Path -LiteralPath $desktopShortcut) -or (Test-Path -LiteralPath $startMenuShortcut)) {
  throw "Installer smoke test refused to replace an existing Reed installation or shortcut."
}

try {
  $installProcess = Start-Process -FilePath $installerPath -ArgumentList "/S" -PassThru -WindowStyle Hidden
  $installExitCode = Wait-ForProcessExit -Process $installProcess -TimeoutMilliseconds 60000 -ProcessName "installer"
  if ($installExitCode -ne 0) {
    throw "The Reed installer exited with code $installExitCode."
  }

  Wait-Until -FailureMessage "The Reed installer did not create the expected application files." -Condition {
    (Test-Path -LiteralPath $installedExecutable -PathType Leaf) -and
    (Test-Path -LiteralPath $uninstaller -PathType Leaf)
  }

  $uninstallEntry = Get-ReedUninstallEntry
  if (-not $uninstallEntry -or $uninstallEntry.DisplayVersion -ne $version) {
    throw "The Reed installer did not register the expected version for the current user."
  }
  if (-not (Test-Path -LiteralPath $desktopShortcut -PathType Leaf) -or
      -not (Test-Path -LiteralPath $startMenuShortcut -PathType Leaf)) {
    throw "The Reed installer did not create the expected shortcuts."
  }

  $temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("reed-installer-smoke-{0}" -f [Guid]::NewGuid())
  New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
  $standardOutput = Join-Path $temporaryDirectory "stdout.txt"
  $standardError = Join-Path $temporaryDirectory "stderr.txt"
  $smokeUserData = Join-Path $temporaryDirectory "user-data"
  $previousSmokeValue = [Environment]::GetEnvironmentVariable("REED_SMOKE_TEST", "Process")

  try {
    [Environment]::SetEnvironmentVariable("REED_SMOKE_TEST", "1", "Process")
    $appProcess = Start-Process -FilePath $installedExecutable `
      -ArgumentList @("--disable-gpu", "--user-data-dir=$smokeUserData") `
      -RedirectStandardOutput $standardOutput -RedirectStandardError $standardError `
      -PassThru -WindowStyle Hidden
    $appExitCode = Wait-ForProcessExit -Process $appProcess -TimeoutMilliseconds 30000 -ProcessName "application startup check"
  } finally {
    [Environment]::SetEnvironmentVariable("REED_SMOKE_TEST", $previousSmokeValue, "Process")
  }

  $startupOutput = (Get-Content -LiteralPath $standardOutput -Raw -ErrorAction SilentlyContinue) +
    (Get-Content -LiteralPath $standardError -Raw -ErrorAction SilentlyContinue)
  if ($appExitCode -ne 0 -or -not $startupOutput.Contains("REED_SMOKE_READY")) {
    throw "The installed Reed application did not complete its renderer startup check (exit $appExitCode). $($startupOutput.Trim())"
  }
} catch {
  $testFailure = $_
} finally {
  if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
    try {
      $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList "/S" -PassThru -WindowStyle Hidden
      $uninstallExitCode = Wait-ForProcessExit -Process $uninstallProcess -TimeoutMilliseconds 60000 -ProcessName "uninstaller"
      if ($uninstallExitCode -ne 0 -and -not $testFailure) {
        $testFailure = "The Reed uninstaller exited with code $uninstallExitCode."
      }
    } catch {
      if (-not $testFailure) {
        $testFailure = $_
      }
    }
  }

  try {
    Wait-Until -FailureMessage "The Reed uninstaller did not remove the installation and registration." -Condition {
      -not (Test-Path -LiteralPath $installDirectory) -and
      -not (Get-ReedUninstallEntry) -and
      -not (Test-Path -LiteralPath $desktopShortcut) -and
      -not (Test-Path -LiteralPath $startMenuShortcut)
    }
  } catch {
    if (-not $testFailure) {
      $testFailure = $_
    }
    Remove-TestResidue
  }

  if ($temporaryDirectory) {
    $resolvedTemporaryDirectory = [IO.Path]::GetFullPath($temporaryDirectory)
    $resolvedTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTemporaryDirectory.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedTemporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

if ($testFailure) {
  throw $testFailure
}

Write-Host "Installer install, renderer startup, shortcut, registration, and uninstall checks passed."
