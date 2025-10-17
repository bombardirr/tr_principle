@echo off
setlocal enabledelayedexpansion

echo Building Translation Tool for Windows...

REM Build for Windows
echo Building for Windows...
wails build -clean -platform windows/amd64
if %ERRORLEVEL% neq 0 (
    echo Windows build failed!
    pause
    exit /b 1
)

REM Create Windows folder and move executable
if not exist "build\windows" mkdir "build\windows"
move "build\bin\TranslationTool.exe" "build\windows\TranslationTool.exe" >nul 2>&1

REM Create Windows installer
echo Creating Windows installer...
"C:\Program Files (x86)\NSIS\Bin\makensis.exe" -DARG_WAILS_AMD64_BINARY=build\windows\TranslationTool.exe "build\windows\installer\project_simple.nsi"
if %ERRORLEVEL% equ 0 (
    move "build\bin\TranslationTool-amd64-installer.exe" "build\windows\TranslationTool-installer.exe" >nul 2>&1
    echo Windows installer created: build\windows\TranslationTool-installer.exe
) else (
    echo Windows installer creation failed!
)

echo Build completed!
echo Windows application ready:
echo   - build\windows\TranslationTool.exe
echo   - build\windows\TranslationTool-installer.exe
pause
