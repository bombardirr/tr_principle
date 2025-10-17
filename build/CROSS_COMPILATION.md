# Cross-compilation Information

## Wails Cross-compilation Limitations

Wails v2 does not support cross-compilation from Windows to other platforms. This means:

- **Windows → Linux**: Not supported
- **Windows → macOS**: Not supported
- **Linux → Windows**: Not supported
- **Linux → macOS**: Not supported
- **macOS → Windows**: Not supported
- **macOS → Linux**: Not supported

## Solutions for Multi-platform Development

### Option 1: Native Build Machines
Build on each target platform:
- **Windows**: Use Windows machine or VM
- **Linux**: Use Linux machine or VM
- **macOS**: Use macOS machine or VM

### Option 2: CI/CD Services
Use cloud services for cross-platform builds:
- **GitHub Actions**: Free for public repos, supports Windows/Linux/macOS
- **GitLab CI**: Free for public repos, supports Windows/Linux/macOS
- **Azure DevOps**: Free tier available
- **CircleCI**: Free tier available

### Option 3: Docker (Linux only)
For Linux builds, you can use Docker:
```bash
# Build Linux version in Docker
docker run --rm -v "$(pwd)":/workspace -w /workspace golang:latest bash -c "
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  wails build -platform linux/amd64
"
```

## Current Build Script Behavior

The build scripts will:
1. ✅ **Windows**: Build successfully (native)
2. ❌ **Linux**: Show warning, skip build
3. ❌ **macOS**: Show warning, skip build

## Recommended Workflow

1. **Development**: Use `wails dev` on your primary platform
2. **Windows builds**: Use `.\build.ps1 -Platform windows`
3. **Multi-platform**: Use CI/CD services or native machines

## CI/CD Example (GitHub Actions)

```yaml
name: Build
on: [push, pull_request]

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, ubuntu-latest, macos-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-go@v3
      with:
        go-version: '1.21'
    
    - name: Install Wails
      run: go install github.com/wailsapp/wails/v2/cmd/wails@latest
    
    - name: Build
      run: wails build -clean
    
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: TranslationTool-${{ matrix.os }}
        path: build/bin/
```
