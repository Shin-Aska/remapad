[CmdletBinding()]
param(
    [ValidateSet('all', 'chrome', 'firefox')]
    [string]$Target = 'all'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $RootDir 'dist'
$ManifestDir = Join-Path $RootDir 'manifests'
$SourceDirs = @(
    '_locales',
    'assets',
    'background',
    'content',
    'icons',
    'options',
    'popup',
    'shared'
)

foreach ($sourceDir in $SourceDirs) {
    $sourcePath = Join-Path $RootDir $sourceDir
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
        throw "Missing source directory: $sourceDir"
    }
}

function Read-Manifest {
    param(
        [Parameter(Mandatory)]
        [string]$Browser
    )

    $path = Join-Path $ManifestDir "manifest.$Browser.json"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing $Browser manifest: $path"
    }

    try {
        return Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
    }
    catch {
        throw "Invalid JSON in ${path}: $($_.Exception.Message)"
    }
}

$ChromeManifest = Read-Manifest -Browser 'chrome'
$FirefoxManifest = Read-Manifest -Browser 'firefox'

foreach ($key in @('manifest_version', 'name', 'short_name', 'version', 'description')) {
    $chromeValue = $ChromeManifest.$key
    $firefoxValue = $FirefoxManifest.$key
    if ($chromeValue -ne $firefoxValue) {
        throw "Manifest field '$key' differs: chrome='$chromeValue', firefox='$firefoxValue'"
    }
}

if ($ChromeManifest.name.Length -gt 75) {
    throw 'Chrome manifest name exceeds the 75-character limit'
}
if ($ChromeManifest.description.Length -gt 132) {
    throw 'Chrome manifest description exceeds the 132-character limit'
}

$chromeBackgroundKeys = @($ChromeManifest.background.PSObject.Properties.Name)
if ($chromeBackgroundKeys.Count -ne 1 -or $chromeBackgroundKeys[0] -ne 'service_worker') {
    throw 'Chrome manifest background must contain only service_worker'
}

$firefoxBackgroundKeys = @($FirefoxManifest.background.PSObject.Properties.Name)
if ($firefoxBackgroundKeys.Count -ne 1 -or $firefoxBackgroundKeys[0] -ne 'scripts') {
    throw 'Firefox manifest background must contain only scripts'
}

if ([string]::IsNullOrWhiteSpace($FirefoxManifest.browser_specific_settings.gecko.id)) {
    throw 'Firefox manifest must declare browser_specific_settings.gecko.id'
}

$Version = $ChromeManifest.version

function Build-Browser {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('chrome', 'firefox')]
        [string]$Browser
    )

    $manifestPath = Join-Path $ManifestDir "manifest.$Browser.json"
    $outputDir = Join-Path $DistDir $Browser
    $archivePath = Join-Path $DistDir "remapad-$Browser-$Version.zip"

    $distFullPath = [IO.Path]::GetFullPath($DistDir)
    $outputFullPath = [IO.Path]::GetFullPath($outputDir)
    $allowedOutputPaths = @(
        [IO.Path]::GetFullPath((Join-Path $DistDir 'chrome')),
        [IO.Path]::GetFullPath((Join-Path $DistDir 'firefox'))
    )
    if ($outputFullPath -notin $allowedOutputPaths -or -not $outputFullPath.StartsWith($distFullPath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing unsafe output directory: $outputFullPath"
    }

    if (Test-Path -LiteralPath $outputFullPath) {
        Remove-Item -LiteralPath $outputFullPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $outputFullPath -Force | Out-Null

    foreach ($sourceDir in $SourceDirs) {
        Copy-Item -LiteralPath (Join-Path $RootDir $sourceDir) -Destination $outputFullPath -Recurse
    }
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $outputFullPath 'manifest.json')
    Copy-Item -LiteralPath (Join-Path $RootDir 'LICENSE') -Destination $outputFullPath

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory(
        $outputFullPath,
        $archivePath,
        [IO.Compression.CompressionLevel]::Optimal,
        $false
    )

    Write-Output "Built ${Browser}:"
    Write-Output "  Directory: $outputFullPath"
    Write-Output "  Package:   $archivePath"
}

New-Item -ItemType Directory -Path $DistDir -Force | Out-Null

if ($Target -in @('all', 'chrome')) {
    Build-Browser -Browser 'chrome'
}
if ($Target -in @('all', 'firefox')) {
    Build-Browser -Browser 'firefox'
}
