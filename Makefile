# Makefile for Translation Tool

.PHONY: dev build build-clean installer clean help windows

# Default target
help:
	@echo "Available targets:"
	@echo "  dev         - Start development server"
	@echo "  build       - Build application for current platform"
	@echo "  build-clean - Build application with clean"
	@echo "  windows     - Build for Windows only"
	@echo "  installer   - Build Windows with installer"
	@echo "  clean       - Clean build directory"
	@echo "  help        - Show this help"

# Development server
dev:
	wails dev

# Build for current platform
build:
	wails build

# Build with clean
build-clean:
	wails build -clean

# Build for Windows (default)
windows: build-clean
	@echo "Building for Windows..."
	wails build -clean -platform windows/amd64
	@mkdir -p build/windows
	@mv build/bin/TranslationTool.exe build/windows/TranslationTool.exe
	@echo "Windows executable: build/windows/TranslationTool.exe"

# Build and create installer for Windows
installer: windows
	@echo "Creating Windows installer..."
	"C:\Program Files (x86)\NSIS\Bin\makensis.exe" -DARG_WAILS_AMD64_BINARY=build/windows/TranslationTool.exe "build/windows/installer/project_simple.nsi"
	@mv build/bin/TranslationTool-amd64-installer.exe build/windows/TranslationTool-installer.exe
	@echo "Windows installer: build/windows/TranslationTool-installer.exe"

# Clean build directory
clean:
	rm -rf build/bin
	rm -rf build/windows
	rm -rf frontend/dist
