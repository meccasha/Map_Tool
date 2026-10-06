; Current-user installation. The uninstaller removes only packaged app files.
; User-created research projects are never recursively removed.
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "${PROJECT_DIR}/build/uninstall-files.nsh"
Name "Atlas Ink"
Unicode true
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Atlas Ink"
InstallDirRegKey HKCU "Software\AtlasInk" "InstallDir"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Atlas Ink.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Atlas Ink"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  SetShellVarContext current
  ${IfNot} ${RunningX64}
    MessageBox MB_OK "Atlas Ink requires 64-bit Windows 10 or 11."
    Abort
  ${EndIf}
FunctionEnd
Section "Atlas Ink"
  SetOutPath "$INSTDIR"
  !insertmacro AtlasInstallFiles
  WriteUninstaller "$INSTDIR\Uninstall Atlas Ink.exe"
  CreateDirectory "$SMPROGRAMS\Atlas Ink"
  CreateShortcut "$SMPROGRAMS\Atlas Ink\Atlas Ink.lnk" "$INSTDIR\Atlas Ink.exe"
  CreateShortcut "$SMPROGRAMS\Atlas Ink\Uninstall Atlas Ink.lnk" "$INSTDIR\Uninstall Atlas Ink.exe"
  CreateShortcut "$DESKTOP\Atlas Ink.lnk" "$INSTDIR\Atlas Ink.exe"
  WriteRegStr HKCU "Software\AtlasInk" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtlasInk" "DisplayName" "Atlas Ink"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtlasInk" "DisplayVersion" "1.0.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtlasInk" "Publisher" "Atlas Ink"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtlasInk" "DisplayIcon" "$INSTDIR\Atlas Ink.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtlasInk" "UninstallString" '"$INSTDIR\Uninstall Atlas Ink.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtlasInk" "QuietUninstallString" '"$INSTDIR\Uninstall Atlas Ink.exe" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtlasInk" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtlasInk" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  !insertmacro AtlasUninstallFiles
  Delete /REBOOTOK "$INSTDIR\Uninstall Atlas Ink.exe"
  Delete "$DESKTOP\Atlas Ink.lnk"
  Delete "$SMPROGRAMS\Atlas Ink\Atlas Ink.lnk"
  Delete "$SMPROGRAMS\Atlas Ink\Uninstall Atlas Ink.lnk"
  RMDir "$SMPROGRAMS\Atlas Ink"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AtlasInk"
  DeleteRegKey HKCU "Software\AtlasInk"
SectionEnd
