# Windows Build Information

## Status: ✅ Available

This folder contains the Windows version of Translation Tool.

## What you see here:
- ✅ **TranslationTool.exe** - Main application (~15MB)
- ✅ **TranslationTool-installer.exe** - Windows installer (~6MB)
- ✅ **icon.ico** - Application icon
- ✅ **info.json** - Application metadata
- ✅ **installer/** - NSIS installer scripts

## Installation:

### Option 1: Use installer (recommended)
1. Run `TranslationTool-installer.exe`
2. Follow the installation wizard
3. Choose installation directory
4. Select shortcut options (desktop, start menu)
5. Complete installation

### Option 2: Portable version
1. Run `TranslationTool.exe` directly
2. No installation required
3. Can be moved to any folder

## System Requirements:
- **Windows 10** or later
- **WebView2** (installed automatically if missing)
- **64-bit** architecture

## Features:
- Two-panel interface
- Professional translation workflow
- Translation memory support
- Cross-platform compatibility (when built on other platforms)

## Troubleshooting:
- If WebView2 is missing, the installer will download it automatically
- If the app doesn't start, check Windows Defender/antivirus
- For support, check the project repository

## Build Information:
- **Platform**: Windows x64
- **Framework**: Wails v2
- **Frontend**: Vue.js + TypeScript
- **Backend**: Go
- **Installer**: NSIS

## Next Steps:
- Test the application
- Report any issues
- Check for updates
