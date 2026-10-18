$ErrorActionPreference = 'Stop'
$pkg = $env:PACKAGE
if (-not $pkg) { throw 'PACKAGE is not set' }

function Find-Launcher {
  $candidates = @(
    "$env:LOCALAPPDATA\AquaStar\aquastar-lite.exe",
    "$env:LOCALAPPDATA\Programs\AquaStar\aquastar-lite.exe",
    "$env:LOCALAPPDATA\aquastar-lite\aquastar-lite.exe",
    "$env:LOCALAPPDATA\Programs\aquastar-lite\aquastar-lite.exe"
  )
  $hit = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($hit) { return $hit }
  $found = Get-ChildItem -Path $env:LOCALAPPDATA -Filter aquastar-lite.exe -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\players\\' } |
    Select-Object -First 1
  if ($found) { return $found.FullName }
  return $null
}

if ($pkg -eq 'nsis') {
  $setup = Get-ChildItem dist\*setup.exe | Select-Object -First 1
  if (-not $setup) { throw 'setup.exe is missing from dist' }
  $proc = Start-Process -FilePath $setup.FullName -ArgumentList '/S' -PassThru -Wait
  if ($proc.ExitCode -ne 0) { throw "installer exited $($proc.ExitCode)" }
  $exe = $null
  $deadline = (Get-Date).AddSeconds(30)
  do {
    $exe = Find-Launcher
    if ($exe) { break }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  if (-not $exe) { throw 'aquastar-lite.exe was not found after the silent install' }
} elseif ($pkg -eq 'portable') {
  $zip = Get-ChildItem dist\*portable.zip | Select-Object -First 1
  if (-not $zip) { throw 'portable.zip is missing from dist' }
  $dest = Join-Path $env:RUNNER_TEMP 'aquastar-lite-portable'
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Expand-Archive -Path $zip.FullName -DestinationPath $dest
  $exe = Join-Path $dest 'aquastar-lite.exe'
  if (-not (Test-Path $exe)) { throw "missing $exe" }
} else {
  throw "unexpected package $pkg"
}

Write-Host "launcher: $exe"
Add-Content -Path $env:GITHUB_ENV -Value "AQUASTAR_LITE_BIN=$exe"
