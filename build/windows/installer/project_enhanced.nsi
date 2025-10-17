Unicode true

####
## Enhanced NSIS installer with shortcut options
####

!include "wails_tools.nsh"

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support
ManifestDPIAware true

!include "MUI.nsh"
!include "nsDialogs.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_ABORTWARNING

# Define custom pages
!define MUI_CUSTOMFUNCTION_GUIINIT onGUIInit

# Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\..\..\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

# Variables for shortcut options
Var CreateDesktopShortcut
Var CreateStartMenuShortcut
Var CreateTaskbarShortcut

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe"
InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
ShowInstDetails show

# Custom page for shortcut options
Page custom ShortcutOptionsPage ShortcutOptionsPageLeave

Function .onInit
   !insertmacro wails.checkArchitecture
   
   # Set default values
   StrCpy $CreateDesktopShortcut "1"
   StrCpy $CreateStartMenuShortcut "1"
   StrCpy $CreateTaskbarShortcut "0"
FunctionEnd

Function onGUIInit
   # Center the window
   System::Call "user32::SetWindowPos(i $HWNDPARENT, i -1, i 0, i 0, i 0, i 0, i 3)"
FunctionEnd

# Custom page for shortcut options
Function ShortcutOptionsPage
   !insertmacro MUI_HEADER_TEXT "Shortcut Options" "Choose where to create shortcuts for ${INFO_PRODUCTNAME}"
   
   nsDialogs::Create 1018
   Pop $0
   
   ${NSD_CreateLabel} 0 10 100% 20u "Select where you want to create shortcuts:"
   
   ${NSD_CreateCheckbox} 10 40 100% 10u "Create desktop shortcut"
   Pop $1
   ${NSD_SetState} $1 $CreateDesktopShortcut
   
   ${NSD_CreateCheckbox} 10 60 100% 10u "Create Start Menu shortcut"
   Pop $2
   ${NSD_SetState} $2 $CreateStartMenuShortcut
   
   ${NSD_CreateCheckbox} 10 80 100% 10u "Pin to taskbar (Windows 10/11)"
   Pop $3
   ${NSD_SetState} $3 $CreateTaskbarShortcut
   
   ${NSD_CreateLabel} 10 100 100% 30u "Note: Taskbar pinning requires Windows 10 or later and may require additional permissions."
   
   nsDialogs::Show
FunctionEnd

Function ShortcutOptionsPageLeave
   ${NSD_GetState} $1 $CreateDesktopShortcut
   ${NSD_GetState} $2 $CreateStartMenuShortcut
   ${NSD_GetState} $3 $CreateTaskbarShortcut
FunctionEnd

# Main installation section
Section "Core Application" SecCore
    SectionIn RO  # This section is required
    
    !insertmacro wails.setShellContext
    !insertmacro wails.webview2runtime
    
    SetOutPath $INSTDIR
    !insertmacro wails.files
    
    # Create shortcuts based on user selection
    ${If} $CreateDesktopShortcut == "1"
        CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    ${EndIf}
    
    ${If} $CreateStartMenuShortcut == "1"
        CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    ${EndIf}
    
    # Taskbar pinning (Windows 10/11)
    ${If} $CreateTaskbarShortcut == "1"
        # Create a temporary shortcut for pinning
        CreateShortCut "$TEMP\${INFO_PRODUCTNAME}_taskbar.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
        
        # Try to pin to taskbar using PowerShell
        ExecWait 'powershell -Command "& {$shell = New-Object -ComObject Shell.Application; $folder = $shell.Namespace(7); $item = $folder.ParseName(\"$TEMP\\${INFO_PRODUCTNAME}_taskbar.lnk\"); if ($item) { $item.InvokeVerb(\"taskbarpin\") } }"'
        
        # Clean up temporary shortcut
        Delete "$TEMP\${INFO_PRODUCTNAME}_taskbar.lnk"
    ${EndIf}
    
    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols
    !insertmacro wails.writeUninstaller
SectionEnd

# Optional section for file associations
Section "File Associations" SecAssociations
    # This section is optional and can be deselected
    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols
SectionEnd

# Section descriptions
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
    !insertmacro MUI_DESCRIPTION_TEXT ${SecCore} "Core application files and required components."
    !insertmacro MUI_DESCRIPTION_TEXT ${SecAssociations} "Associate file types with ${INFO_PRODUCTNAME} (optional)."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

# Uninstaller section
Section "uninstall"
    !insertmacro wails.setShellContext
    
    # Remove WebView2 data
    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}"
    
    # Remove application files
    RMDir /r $INSTDIR
    
    # Remove shortcuts
    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"
    
    # Try to unpin from taskbar
    ExecWait 'powershell -Command "& {$shell = New-Object -ComObject Shell.Application; $folder = $shell.Namespace(7); $item = $folder.ParseName(\"$INSTDIR\\${PRODUCT_EXECUTABLE}\"); if ($item) { $item.InvokeVerb(\"taskbarunpin\") } }"'
    
    !insertmacro wails.unassociateFiles
    !insertmacro wails.unassociateCustomProtocols
    !insertmacro wails.deleteUninstaller
SectionEnd
