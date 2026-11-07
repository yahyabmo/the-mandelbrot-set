<# : batch part, which PowerShell reads as a comment
@echo off
setlocal
rem Mandelbrot Odyssey for Windows: double-click this file to install it. It installs Node.js if needed,
rem the app, and shortcuts on the desktop and in the Start menu. The rest of this file is
rem the PowerShell script that does it, which the one-line install of the README also runs.
set "INSTALLER_DIR=%~dp0"
set "INSTALLER_FILE=%~f0"
rem Started from PowerShell 7, Windows PowerShell would look for its modules in those of 7.
set "PSModulePath="
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([IO.File]::ReadAllText($env:INSTALLER_FILE))"
echo.
pause
exit /b
#>

# From the web, in CMD or PowerShell:
#   powershell -c "irm https://raw.githubusercontent.com/yahyabmo/the-mandelbrot-set/main/install-windows.bat | iex"
# To remove it:
#   "%LOCALAPPDATA%\mandelbrot-odyssey\uninstall.cmd"

function Install-App {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  # Windows PowerShell 5 may offer only old TLS versions, which GitHub and nodejs.org refuse.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $Name = 'Mandelbrot Odyssey'
  $Id = 'mandelbrot-odyssey'
  $Repo = 'yahyabmo/the-mandelbrot-set'
  $Comment = 'A real-time journey into the Mandelbrot set'
  $NodeVersion = '24.22.2'

  $Root = Join-Path $env:LOCALAPPDATA $Id
  $Download = Join-Path $Root 'download'

  function Say([string]$text) { Write-Host ''; Write-Host $text -ForegroundColor Cyan }
  function Remove-Folder([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return }
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $path) { cmd.exe /d /c rd /s /q "$path" }
    if (Test-Path -LiteralPath $path) { throw "Could not remove ${path}: close what uses it, then run the installer again." }
  }
  function New-Folder([string]$path) { Remove-Folder $path; New-Item -ItemType Directory -Force -Path $path | Out-Null }
  function Expand-Zip([string]$zip, [string]$dest) {
    # The tar.exe of Windows, there since 2018, is much faster than Expand-Archive.
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path -LiteralPath $tar) {
      & $tar -xf $zip -C $dest
      if ($LASTEXITCODE -eq 0) { return }
    }
    Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
  }
  # .NET rather than Get-FileHash, which lives in a module that may fail to load.
  function Get-Sha256([string]$path) {
    $stream = [IO.File]::OpenRead($path)
    try { return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($stream)).Replace('-', '') } finally { $stream.Dispose() }
  }
  function Get-NodeMajor([string]$exe) {
    try { return [int]((& $exe --version).TrimStart('v').Split('.')[0]) } catch { return 0 }
  }
  # Plain ASCII with Windows line ends, which is what cmd.exe and Windows PowerShell read best.
  function Write-Text([string]$path, [string]$text) {
    [IO.File]::WriteAllText($path, ($text -replace "`r?`n", "`r`n"), [Text.Encoding]::ASCII)
  }

  Say "Installing $Name..."
  New-Item -ItemType Directory -Force -Path $Root | Out-Null

  # 1. Node.js 18 or newer: the one of the system, or a copy of our own, checked against its checksum.
  $Node = $null
  $system = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($system -and (Get-NodeMajor $system.Path) -ge 18 -and (Test-Path -LiteralPath (Join-Path (Split-Path $system.Path) 'npm.cmd'))) {
    $Node = $system.Path
  } elseif ((Get-NodeMajor "$Root\node\node.exe") -ge 18) {
    $Node = "$Root\node\node.exe"
  } else {
    $arch = 'x64'
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arch = 'arm64' }
    $folder = "node-v$NodeVersion-win-$arch"
    Say "Downloading Node.js $NodeVersion..."
    New-Folder $Download
    $zip = Join-Path $Download "$folder.zip"
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$NodeVersion/$folder.zip" -OutFile $zip
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" -OutFile "$Download\SHASUMS256.txt"
    $line = Get-Content -LiteralPath "$Download\SHASUMS256.txt" | Where-Object { $_ -like "*  $folder.zip" } | Select-Object -First 1
    if (-not $line -or (Get-Sha256 $zip) -ne $line.Split(' ')[0]) {
      throw 'The Node.js download is damaged: run the installer again.'
    }
    Expand-Zip $zip $Download
    Remove-Folder "$Root\node"
    Move-Item -LiteralPath (Join-Path $Download $folder) -Destination "$Root\node"
    Remove-Folder $Download
    $Node = "$Root\node\node.exe"
  }
  $NodeDir = Split-Path $Node
  $Npm = Join-Path $NodeDir 'npm.cmd'
  $env:Path = "$NodeDir;$env:Path"

  # 2. The app: the folder this installer is in when it holds the app, otherwise the latest from GitHub.
  $From = $env:INSTALLER_DIR
  $New = Join-Path $Root 'app.new'
  $manifest = $null
  if ($From) { $manifest = Join-Path $From 'package.json' }
  if ($manifest -and (Test-Path -LiteralPath $manifest) -and ((Get-Content -LiteralPath $manifest -Raw) -match ('"name":\s*"' + $Id + '"'))) {
    # Without its last backslash, which would escape the closing quote of the argument.
    $From = $From.TrimEnd('\')
    Say "Copying $Name from $From..."
    Remove-Folder $New
    robocopy $From $New /E /XD node_modules dist .git /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Could not copy $From." }
  } else {
    Say "Downloading $Name..."
    New-Folder $Download
    Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$Repo/zip/refs/heads/main" -OutFile "$Download\app.zip"
    Expand-Zip "$Download\app.zip" $Download
    $top = Get-ChildItem -LiteralPath $Download -Directory | Select-Object -First 1
    Remove-Folder $New
    Move-Item -LiteralPath $top.FullName -Destination $New
    Remove-Folder $Download
  }

  Say 'Installing and building (about a minute the first time)...'
  Push-Location -LiteralPath $New
  try {
    & $Npm ci --no-fund --no-audit --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw 'npm could not install what the app needs: check the connection, then run the installer again.' }
    & $Npm run build --silent
    if ($LASTEXITCODE -ne 0) { throw 'The build failed.' }
  } finally {
    Pop-Location
  }
  # A copy that is running is stopped before it is replaced.
  if (Test-Path -LiteralPath "$Root\app\scripts\launch.js") {
    & $Node "$Root\app\scripts\launch.js" --stop
    Start-Sleep -Milliseconds 500
  }
  Remove-Folder "$Root\app"
  Move-Item -LiteralPath $New -Destination "$Root\app"
  Copy-Item -LiteralPath "$Root\app\docs\icon.ico" -Destination "$Root\icon.ico" -Force

  # 3. The launcher, and the way back. They name no folder of the user, so any name works.
  $nodeCall = 'node'
  if ($Node -eq "$Root\node\node.exe") { $nodeCall = '"%~dp0node\node.exe"' }
  Write-Text "$Root\launch.cmd" @"
@echo off
rem Open $Name in the browser, starting it first if needed. "--stop" stops it.
$nodeCall "%~dp0app\scripts\launch.js" %* || pause
"@
  Write-Text "$Root\uninstall.cmd" @"
@echo off
rem Remove ${Name}: its shortcuts, the app and its copy of Node.js.
call "%~dp0launch.cmd" --stop
cd /d "%TEMP%"
(goto) 2>nul & powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
"@
  Write-Text "$Root\uninstall.ps1" (@'
# Remove the app: its shortcuts, then its folder, the one of this script.
foreach ($dir in [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) {
  Remove-Item -LiteralPath (Join-Path $dir 'APP_NAME.lnk') -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 500
Remove-Item -LiteralPath $PSScriptRoot -Recurse -Force
Write-Host 'APP_NAME is removed.'
'@ -replace 'APP_NAME', $Name)

  # 4. The shortcuts: on the desktop, and in the Start menu.
  $shell = New-Object -ComObject WScript.Shell
  foreach ($dir in [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) {
    $link = $shell.CreateShortcut((Join-Path $dir "$Name.lnk"))
    $link.TargetPath = "$Root\launch.cmd"
    $link.WorkingDirectory = $Root
    $link.IconLocation = "$Root\icon.ico,0"
    $link.Description = $Comment
    $link.Save()
  }

  Say "$Name is installed. Open it from the shortcut on your desktop, or run in CMD:  `"%LOCALAPPDATA%\$Id\launch.cmd`""
  & "$Root\launch.cmd"
}

try {
  Install-App
} catch {
  Write-Host ''
  Write-Host $_.Exception.Message -ForegroundColor Red
}
