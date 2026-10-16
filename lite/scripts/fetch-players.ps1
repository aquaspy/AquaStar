$ErrorActionPreference = "Stop"

$lite = Split-Path -Parent $PSScriptRoot
$jsonPath = Join-Path $lite "players.json"
$dest = Join-Path $lite "src-tauri\players"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$json = Get-Content -Raw $jsonPath | ConvertFrom-Json

function Test-TreeMatch([string]$dir, [string]$exe, [string]$sha) {
    $exePath = Join-Path $dir $exe
    $stamp = Join-Path $dir ".aquastar-pin"
    if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath $stamp -PathType Leaf)) { return $false }
    $got = ((Get-Content -Raw $stamp) -replace '\s', '')
    return $got -eq $sha
}

function Move-Incoming([string]$incoming, [string]$live, [string]$trash) {
    if (Test-Path -LiteralPath $live) {
        if (Test-Path -LiteralPath $trash) { Remove-Item -LiteralPath $trash -Recurse -Force }
        Move-Item -LiteralPath $live -Destination $trash
    }
    Move-Item -LiteralPath $incoming -Destination $live
    if (Test-Path -LiteralPath $trash) { Remove-Item -LiteralPath $trash -Recurse -Force }
}

function Expand-Player([string]$kind, [string]$url, [string]$archive, [string]$into) {
    switch ($kind) {
        "zip" {
            & tar.exe -xf $archive -C $into
            if ($LASTEXITCODE -ne 0) { throw "tar.exe failed for $url" }
        }
        "exe" {
            $path = ($url -split '\?')[0]
            $name = [System.IO.Path]::GetFileName($path)
            Copy-Item -LiteralPath $archive -Destination (Join-Path $into $name)
        }
        "tar.gz" {
            & tar.exe -xzf $archive -C $into
            if ($LASTEXITCODE -ne 0) { throw "tar.exe failed for $url" }
        }
        default { throw "fetch-players.ps1 cannot unpack kind $kind" }
    }
}

function Publish-Player($dir, $sha, $url, $kind, $exe) {
    $live = Join-Path $dest $dir
    $incoming = Join-Path $dest ".$dir.incoming"
    $trash = Join-Path $dest ".$dir.trash"
    $temp = Join-Path $dest ".$dir.download"

    if (Test-TreeMatch $incoming $exe $sha) {
        Move-Incoming $incoming $live $trash
        return
    }
    if (Test-Path -LiteralPath $incoming) { Remove-Item -LiteralPath $incoming -Recurse -Force }
    if (Test-TreeMatch $live $exe $sha) {
        if (Test-Path -LiteralPath $trash) { Remove-Item -LiteralPath $trash -Recurse -Force }
        return
    }

    try {
        Invoke-WebRequest -Uri $url -OutFile $temp -UseBasicParsing
    } catch {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
        throw
    }
    $got = (Get-FileHash -Algorithm SHA256 -LiteralPath $temp).Hash.ToLower()
    if ($got -ne $sha) {
        Remove-Item -LiteralPath $temp -Force
        throw "checksum mismatch for $url"
    }
    New-Item -ItemType Directory -Force -Path $incoming | Out-Null
    try {
        Expand-Player $kind $url $temp $incoming
        Set-Content -Encoding ascii -Path (Join-Path $incoming ".aquastar-pin") -Value "$sha`n" -NoNewline
        if (-not (Test-TreeMatch $incoming $exe $sha)) {
            throw "unpacked $url is missing $exe"
        }
        Move-Incoming $incoming $live $trash
    } catch {
        if (Test-Path -LiteralPath $incoming) { Remove-Item -LiteralPath $incoming -Recurse -Force }
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
        throw
    }
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
}

$selected = New-Object System.Collections.Generic.List[string]
foreach ($player in $json.players) {
    foreach ($art in $player.artifacts) {
        if ($art.os -ne "windows") { continue }
        if (-not $selected.Contains($player.dir)) { $selected.Add($player.dir) }
        Publish-Player $player.dir $art.sha256 $art.url $art.kind $art.exe
    }
}
if ($selected.Count -eq 0) { throw "players.json has no windows artifacts" }

Get-ChildItem -Force -Directory -LiteralPath $dest | ForEach-Object {
    $name = $_.Name
    $staging = $name -like ".*.incoming" -or $name -like ".*.trash"
    if (-not $selected.Contains($name) -and -not $staging) {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}
