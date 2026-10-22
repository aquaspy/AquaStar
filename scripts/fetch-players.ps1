$ErrorActionPreference = "Stop"

$desktop = Split-Path -Parent $PSScriptRoot
$jsonPath = Join-Path $desktop "players.json"
$dest = Join-Path $desktop "src-tauri\players"
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

function Expand-NestedWindowsZip([string]$arch, [string]$innerSha, [string]$into) {
    if (-not $innerSha) { return }
    $suffix = switch ($arch) {
        "x86_64" { "windows-x64.zip" }
        "aarch64" { "windows-arm64.zip" }
        default { throw "Artix Ruffle publishes no windows $arch build" }
    }
    $zips = @(Get-ChildItem -LiteralPath $into -Recurse -File | Where-Object { $_.Name.EndsWith($suffix) })
    if ($zips.Count -ne 1) { throw "expected one $suffix in $into, found $($zips.Count)" }
    $got = (Get-FileHash -Algorithm SHA256 -LiteralPath $zips[0].FullName).Hash.ToLower()
    if ($got -ne $innerSha) { throw "inner zip checksum mismatch for $($zips[0].Name)" }
    $nested = Join-Path $into ".nested"
    if (Test-Path -LiteralPath $nested) { Remove-Item -LiteralPath $nested -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $nested | Out-Null
    & "$env:SystemRoot\System32\tar.exe" -xf $zips[0].FullName -C $nested
    if ($LASTEXITCODE -ne 0) { throw "tar.exe failed for nested $($zips[0].Name)" }
    Get-ChildItem -LiteralPath $into -Force | Where-Object { $_.Name -ne ".nested" } | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
    Get-ChildItem -LiteralPath $nested -Force | ForEach-Object {
        Move-Item -LiteralPath $_.FullName -Destination (Join-Path $into $_.Name)
    }
    Remove-Item -LiteralPath $nested -Recurse -Force
}

function Finish-Extract([string]$extract, [string]$exe, [string]$binarySha, [string]$into, [string]$arch, [string]$innerSha) {
    if ($extract -eq "single-exe") {
        Expand-NestedWindowsZip $arch $innerSha $into
        $target = Join-Path $into $exe
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
            $exes = @(Get-ChildItem -LiteralPath $into -Recurse -File -Filter *.exe)
            if ($exes.Count -ne 1) { throw "expected one exe in $into, found $($exes.Count)" }
            Copy-Item -LiteralPath $exes[0].FullName -Destination $target
            if ($exes[0].FullName -ne $target) { Remove-Item -LiteralPath $exes[0].FullName -Force }
        }
    } elseif ($extract) {
        throw "fetch-players.ps1 cannot finish extract $extract"
    }
    if ($binarySha) {
        $got = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $into $exe)).Hash.ToLower()
        if ($got -ne $binarySha) { throw "binary checksum mismatch for $exe" }
    }
}

function Expand-Player([string]$kind, [string]$url, [string]$archive, [string]$into) {
    switch ($kind) {
        "zip" {
            & "$env:SystemRoot\System32\tar.exe" -xf $archive -C $into
            if ($LASTEXITCODE -ne 0) { throw "tar.exe failed for $url" }
        }
        "exe" {
            $path = ($url -split '\?')[0]
            $name = [System.IO.Path]::GetFileName($path)
            Copy-Item -LiteralPath $archive -Destination (Join-Path $into $name)
        }
        "tar.gz" {
            & "$env:SystemRoot\System32\tar.exe" -xzf $archive -C $into
            if ($LASTEXITCODE -ne 0) { throw "tar.exe failed for $url" }
        }
        default { throw "fetch-players.ps1 cannot unpack kind $kind" }
    }
}

function Publish-Player($dir, $sha, $url, $kind, $exe, $extract, $binarySha, $arch, $innerSha) {
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
        Finish-Extract $extract $exe $binarySha $incoming $arch $innerSha
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

$hostArch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "x86_64" }
    "ARM64" { "aarch64" }
    "x86" { "x86" }
    default { throw "fetch-players.ps1 does not know arch $($env:PROCESSOR_ARCHITECTURE)" }
}

$selected = New-Object System.Collections.Generic.List[string]
foreach ($player in $json.players) {
    foreach ($art in $player.artifacts) {
        $also = @()
        if ($null -ne $art.also) { $also = @($art.also) }
        if ($art.os -ne "windows") { continue }
        if ($art.arch -ne $hostArch -and $also -notcontains $hostArch) { continue }
        if (-not $selected.Contains($art.dir)) { $selected.Add($art.dir) }
        $inner = ""
        if ($null -ne $art.innerSha256) { $inner = [string]$art.innerSha256 }
        Publish-Player $art.dir $art.sha256 $art.url $art.kind $art.exe $art.extract $art.binarySha256 $art.arch $inner
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
