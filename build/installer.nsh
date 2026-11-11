!ifdef MUI_BGCOLOR
  !undef MUI_BGCOLOR
!endif
!define MUI_BGCOLOR "191919"
!ifdef MUI_TEXTCOLOR
  !undef MUI_TEXTCOLOR
!endif
!define MUI_TEXTCOLOR "F4E8D3"
!ifdef MUI_INSTFILESPAGE_COLORS
  !undef MUI_INSTFILESPAGE_COLORS
!endif
!define MUI_INSTFILESPAGE_COLORS "F4E8D3 191919"

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro VetoProtocolStartProgressGlow STATUS_TEXT
  System::Call 'user32::SetWindowTextW(p $HWNDPARENT, w "Veto Protocol")'
  GetDlgItem $0 $HWNDPARENT 1004
  GetDlgItem $1 $HWNDPARENT 1006
  System::Call 'user32::SetWindowTextW(p $1, w "${STATUS_TEXT}")'
  System::Call 'uxtheme::SetWindowTheme(p $0, w "", w "")'
  System::Call 'user32::GetWindowLongW(p $0, i -16) i .r1'
  IntOp $1 $1 | 0x08
  System::Call 'user32::SetWindowLongW(p $0, i -16, i $1) i .r2'
  System::Call 'user32::SetWindowPos(p $0, p 0, i 0, i 0, i 0, i 0, i 0x27) i .r2'
  SendMessage $0 0x0409 0 0x002AA5D6
  SendMessage $0 0x2001 0 0x00242424
  SendMessage $0 0x040A 1 80
!macroend

!ifdef BUILD_UNINSTALLER
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.VetoProtocolProgressPageShow
  Function un.VetoProtocolProgressPageShow
    !insertmacro VetoProtocolStartProgressGlow "Đang gỡ Veto Protocol..."
  FunctionEnd
!else
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW VetoProtocolProgressPageShow
  Function VetoProtocolProgressPageShow
    !insertmacro VetoProtocolStartProgressGlow "Đang cài đặt Veto Protocol..."
  FunctionEnd
!endif

!macro customUnInstall
  !insertmacro VetoProtocolStartProgressGlow "Đang gỡ Veto Protocol..."
!macroend