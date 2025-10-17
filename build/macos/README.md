# macOS Build Information

## Status: Not Available

This folder is empty because **Wails does not support cross-compilation from Windows to macOS**.

## What you see here:
- ❌ No macOS executable
- ❌ No macOS installer

## Why is this happening?
Wails v2 has limitations:
- **Windows → Linux**: Not supported
- **Windows → macOS**: Not supported
- **Linux → Windows**: Not supported
- **Linux → macOS**: Not supported
- **macOS → Windows**: Not supported
- **macOS → Linux**: Not supported

## How to get macOS version:

### Option 1: Build on macOS machine
```bash
# On a macOS machine:
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails build -platform darwin/amd64
```

### Option 2: Use CI/CD service
- **GitHub Actions** (free for public repos)
- **GitLab CI** (free for public repos)
- **Azure DevOps** (free tier)

### Option 3: Use macOS VM
- VirtualBox with macOS
- VMware with macOS
- **Note**: Requires Apple hardware for legal compliance

## Current status:
- ✅ **Windows**: Available (native platform)
- ❌ **Linux**: Not available (cross-compilation not supported)
- ❌ **macOS**: Not available (cross-compilation not supported)

## Next steps:
1. Use CI/CD service for multi-platform builds
2. Or build on native macOS machine
3. Or use macOS VM (if legally compliant)

For more information, see `build/CROSS_COMPILATION.md`
