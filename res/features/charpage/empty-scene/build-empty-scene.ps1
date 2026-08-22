[CmdletBinding()]
param(
    [string]$FFDecPath = "",
    [string]$OutputPath = ""
)

$ErrorActionPreference = 'Stop'
$featureRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = (Resolve-Path (Join-Path $featureRoot '..\..\..')).Path
$upstreamSwf = Join-Path $PSScriptRoot 'vendor\swf2png-item-base.swf'
$sourceRoot = Join-Path $PSScriptRoot 'scripts'

if (-not $FFDecPath) {
    $candidate = Join-Path $repositoryRoot 'work\charpage-lab\ffdec\ffdec-cli.exe'
    if (Test-Path -LiteralPath $candidate) { $FFDecPath = $candidate }
}
if (-not $FFDecPath -or -not (Test-Path -LiteralPath $FFDecPath)) {
    throw 'FFDec CLI was not found. Pass -FFDecPath with the path to ffdec-cli.exe.'
}
if (-not (Test-Path -LiteralPath $upstreamSwf)) {
    throw "Missing upstream base movie: $upstreamSwf"
}
if (-not $OutputPath) { $OutputPath = Join-Path $featureRoot 'characterB-empty-scene.swf' }

$buildRoot = Join-Path $repositoryRoot 'work\charpage-lab\empty-scene-build'
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
$baseSwf = Join-Path $buildRoot 'empty-scene-source.swf'
$patchedSwf = Join-Path $buildRoot 'empty-scene-patched.swf'

Copy-Item -LiteralPath $upstreamSwf -Destination $baseSwf -Force
& $FFDecPath -importScript $baseSwf $patchedSwf $sourceRoot
if ($LASTEXITCODE -ne 0) { throw "FFDec could not import the Empty Scene scripts (exit $LASTEXITCODE)." }

# AquaStar ships PPAPI Flash 32. The upstream AIR movie is SWF 34, so lowering
# this header is non-negotiable for native Flash compatibility.
& $FFDecPath -header -set version 15 -set width 715px -set height 455px -set framerate 30 $patchedSwf $OutputPath
if ($LASTEXITCODE -ne 0) { throw "FFDec could not write the Empty Scene SWF (exit $LASTEXITCODE)." }

& $FFDecPath -header $OutputPath
if ($LASTEXITCODE -ne 0) { throw "FFDec could not verify the Empty Scene SWF header (exit $LASTEXITCODE)." }

Write-Host "Built $OutputPath"
