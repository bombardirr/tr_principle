# Build script for Translation Tool
param(
    [switch]$Clean,
    [switch]$Installer,
    [switch]$Dev,
    [string]$Platform = "windows"
)

Write-Host "Building Translation Tool..." -ForegroundColor Green

if ($Dev) {
    Write-Host "Starting development server..." -ForegroundColor Yellow
    wails dev
    exit
}

# Define platforms
$platforms = @{
    "windows" = @{
        "target" = "windows/amd64"
        "folder" = "windows"
        "extension" = ".exe"
    }
    "linux" = @{
        "target" = "linux/amd64"
        "folder" = "linux"
        "extension" = ""
    }
    "macos" = @{
        "target" = "darwin/amd64"
        "folder" = "macos"
        "extension" = ""
    }
}

# Determine which platforms to build
$buildPlatforms = @()
if ($Platform -eq "all") {
    $buildPlatforms = $platforms.Keys
} else {
    if ($platforms.ContainsKey($Platform)) {
        $buildPlatforms = @($Platform)
    } else {
        Write-Host "Invalid platform: $Platform" -ForegroundColor Red
        Write-Host "Available platforms: all, windows, linux, macos" -ForegroundColor Yellow
        exit 1
    }
}

# Build for each platform
foreach ($platform in $buildPlatforms) {
    $platformInfo = $platforms[$platform]
    $target = $platformInfo.target
    $folder = $platformInfo.folder
    $extension = $platformInfo.extension
    
    Write-Host "Building for $platform ($target)..." -ForegroundColor Yellow
    
    # Create platform-specific folder
    $platformDir = "build\$folder"
    if (!(Test-Path $platformDir)) {
        New-Item -ItemType Directory -Path $platformDir -Force | Out-Null
    }
    
    # Build the application
    if ($Clean) {
        wails build -clean -platform $target
    } else {
        wails build -platform $target
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed for $platform!" -ForegroundColor Red
        Write-Host "Note: Cross-compilation from Windows to $platform is not supported by Wails" -ForegroundColor Yellow
        continue
    }
    
    # Move executable to platform folder
    $exeName = "TranslationTool$extension"
    $sourcePath = "build\bin\$exeName"
    $destPath = "$platformDir\$exeName"
    
    if (Test-Path $sourcePath) {
        Move-Item $sourcePath $destPath -Force
        Write-Host "Executable moved to: $destPath" -ForegroundColor Green
    }
    
    # Create installer if requested and platform is Windows
    if ($Installer -and $platform -eq "windows") {
        Write-Host "Creating installer for Windows..." -ForegroundColor Yellow
        
        $nsisPath = "C:\Program Files (x86)\NSIS\Bin\makensis.exe"
        if (Test-Path $nsisPath) {
            $binaryPath = (Resolve-Path "$platformDir\$exeName").Path
            & $nsisPath -DARG_WAILS_AMD64_BINARY="$binaryPath" "build\windows\installer\project_simple.nsi"
            
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Installer creation failed for Windows!" -ForegroundColor Red
            } else {
                $installerPath = "build\bin\TranslationTool-amd64-installer.exe"
                $installerDest = "$platformDir\TranslationTool-installer.exe"
                if (Test-Path $installerPath) {
                    Move-Item $installerPath $installerDest -Force
                    Write-Host "Installer created: $installerDest" -ForegroundColor Green
                }
            }
        } else {
            Write-Host "NSIS not found at $nsisPath" -ForegroundColor Red
            Write-Host "Please install NSIS or update the path in this script" -ForegroundColor Yellow
        }
    }
}

Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host "Platform folders created:" -ForegroundColor Cyan
foreach ($platform in $buildPlatforms) {
    $folder = $platforms[$platform].folder
    Write-Host "  - build\$folder\" -ForegroundColor Cyan
}
