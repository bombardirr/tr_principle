# Package script for Translation Tool
param(
    [switch]$Clean,
    [string]$Platform = "all"
)

Write-Host "Packaging Translation Tool distributions..." -ForegroundColor Green

# Define platforms
$platforms = @{
    "windows" = @{
        "folder" = "windows"
        "extension" = ".exe"
        "archive" = "zip"
    }
    "linux" = @{
        "folder" = "linux"
        "extension" = ""
        "archive" = "tar.gz"
    }
    "macos" = @{
        "folder" = "macos"
        "extension" = ""
        "archive" = "tar.gz"
    }
}

# Determine which platforms to package
$packagePlatforms = @()
if ($Platform -eq "all") {
    $packagePlatforms = $platforms.Keys
} else {
    if ($platforms.ContainsKey($Platform)) {
        $packagePlatforms = @($Platform)
    } else {
        Write-Host "Invalid platform: $Platform" -ForegroundColor Red
        Write-Host "Available platforms: all, windows, linux, macos" -ForegroundColor Yellow
        exit 1
    }
}

# Create distributions folder
$distDir = "distributions"
if (!(Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

# Package each platform
foreach ($platform in $packagePlatforms) {
    $platformInfo = $platforms[$platform]
    $folder = $platformInfo.folder
    $extension = $platformInfo.extension
    $archive = $platformInfo.archive
    
    $platformDir = "build\$folder"
    
    if (!(Test-Path $platformDir)) {
        Write-Host "Platform folder $platformDir not found. Run build first!" -ForegroundColor Red
        continue
    }
    
    Write-Host "Packaging $platform..." -ForegroundColor Yellow
    
    $exeName = "TranslationTool$extension"
    $exePath = "$platformDir\$exeName"
    
    if (!(Test-Path $exePath)) {
        Write-Host "Executable $exePath not found!" -ForegroundColor Red
        continue
    }
    
    # Create platform-specific distribution folder
    $distPlatformDir = "$distDir\TranslationTool-$platform"
    if (Test-Path $distPlatformDir) {
        Remove-Item $distPlatformDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $distPlatformDir -Force | Out-Null
    
    # Copy executable
    Copy-Item $exePath "$distPlatformDir\$exeName"
    
    # Copy installer if exists (Windows only)
    $installerPath = "$platformDir\TranslationTool-installer.exe"
    if (Test-Path $installerPath) {
        Copy-Item $installerPath "$distPlatformDir\TranslationTool-installer.exe"
    }
    
    # Create README for platform
    $readmeContent = @"
# Translation Tool - $platform

## Installation

### Windows
1. Run TranslationTool-installer.exe for full installation
2. Or run TranslationTool.exe directly (portable)

### Linux
1. Make executable: chmod +x TranslationTool
2. Run: ./TranslationTool

### macOS
1. Make executable: chmod +x TranslationTool
2. Run: ./TranslationTool

## System Requirements

- Windows 10+ (for Windows version)
- Linux with modern desktop environment
- macOS 10.15+ (for macOS version)

## Features

- Cross-platform translation tool
- Two-panel interface
- Professional translation workflow
- Translation memory support

## Support

For support and updates, visit the project repository.
"@
    
    $readmeContent | Out-File -FilePath "$distPlatformDir\README.md" -Encoding UTF8
    
    # Create archive
    $archiveName = "TranslationTool-$platform-$(Get-Date -Format 'yyyyMMdd').$archive"
    $archivePath = "$distDir\$archiveName"
    
    if ($archive -eq "zip") {
        Compress-Archive -Path $distPlatformDir -DestinationPath $archivePath -Force
    } else {
        # For tar.gz, we'll use 7zip if available, or PowerShell's Compress-Archive
        try {
            # Try to use tar if available (Windows 10+)
            & tar -czf $archivePath -C $distDir "TranslationTool-$platform"
        } catch {
            # Fallback to zip
            $zipName = $archiveName -replace '\.tar\.gz$', '.zip'
            $zipPath = "$distDir\$zipName"
            Compress-Archive -Path $distPlatformDir -DestinationPath $zipPath -Force
            Write-Host "Created ZIP instead of TAR.GZ: $zipName" -ForegroundColor Yellow
        }
    }
    
    Write-Host "Package created: $archivePath" -ForegroundColor Green
}

Write-Host "Packaging completed!" -ForegroundColor Green
Write-Host "Distributions folder: $distDir\" -ForegroundColor Cyan
