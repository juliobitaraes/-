[CmdletBinding()]
param(
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repositoryRoot 'js'
$destinationRoot = Join-Path $repositoryRoot 'web\js'

if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "Source directory not found: $sourceRoot"
}

$files = Get-ChildItem -LiteralPath $sourceRoot -File -Recurse
$copied = 0

foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($sourceRoot.Length).TrimStart('\')
    $destinationPath = Join-Path $destinationRoot $relativePath
    $destinationDirectory = Split-Path -Parent $destinationPath

    if ($DryRun) {
        Write-Output "Would copy $relativePath"
        continue
    }

    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destinationPath -Force
    $copied++
}

if ($DryRun) {
    Write-Output "Dry run complete: $($files.Count) files would be synchronized."
} else {
    Write-Output "Synchronized $copied files from js to web/js."
}
