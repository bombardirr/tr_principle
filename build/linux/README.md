# Linux Build Information

## Status: Not Available

This folder is empty because **Wails does not support cross-compilation from Windows to Linux**.

## What you see here:
- ❌ No Linux executable
- ❌ No Linux installer

## Why is this happening?
Wails v2 has limitations:
- **Windows → Linux**: Not supported
- **Windows → macOS**: Not supported
- **Linux → Windows**: Not supported
- **Linux → macOS**: Not supported
- **macOS → Windows**: Not supported
- **macOS → Linux**: Not supported

## How to get Linux version:

### Option 1: Build on Linux machine
```bash
# On a Linux machine:
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails build -platform linux/amd64
```

### Option 2: Use CI/CD service
- **GitHub Actions** (free for public repos)
- **GitLab CI** (free for public repos)
- **Azure DevOps** (free tier)

### Option 3: Use Docker (Linux only)
```bash
docker run --rm -v "$(pwd)":/workspace -w /workspace golang:latest bash -c "
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  wails build -platform linux/amd64
"
```

## Current status:
- ✅ **Windows**: Available (native platform)
- ❌ **Linux**: Not available (cross-compilation not supported)
- ❌ **macOS**: Not available (cross-compilation not supported)

## Next steps:
1. Use CI/CD service for multi-platform builds
2. Or build on native Linux/macOS machines
3. Or use Docker for Linux builds

For more information, see `build/CROSS_COMPILATION.md`
