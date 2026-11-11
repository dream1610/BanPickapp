!macro customWelcomePage
  !define MUI_BGCOLOR "0B0C0D"
  !define MUI_TEXTCOLOR "F3E9D1"
  !define MUI_WELCOMEPAGE_TITLE "Cài đặt Veto Protocol"
  !define MUI_WELCOMEPAGE_TEXT "Bắt đầu cài đặt Veto Protocol trên máy tính này. Ứng dụng sẽ được cài cho tài khoản Windows hiện tại."
  !define MUI_FINISHPAGE_TITLE "Veto Protocol đã sẵn sàng"
  !define MUI_FINISHPAGE_TEXT "Cài đặt hoàn tất. Mở Veto Protocol để bắt đầu."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro VetoProtocolStartProgressGlow
  !ifndef PBM_SETBARCOLOR
    !define PBM_SETBARCOLOR 0x0409
  !endif
  !ifndef PBM_SETBKCOLOR
    !define PBM_SETBKCOLOR 0x2001
  !endif
  GetDlgItem $0 $HWNDPARENT 1004
  System::Call 'uxtheme::SetWindowTheme(p $0, w "", w "")'
  System::Call 'user32::GetWindowLongW(p $0, i -16) i .r1'
  IntOp $1 $1 | 0x08
  System::Call 'user32::SetWindowLongW(p $0, i -16, i $1) i .r2'
  System::Call 'user32::SetWindowPos(p $0, p 0, i 0, i 0, i 0, i 0, i 0x27) i .r2'
  SendMessage $0 ${PBM_SETBARCOLOR} 0 0x72AED7
  SendMessage $0 ${PBM_SETBKCOLOR} 0 0x00161616
  SendMessage $0 0x040A 1 60
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW VetoProtocolInstallPageShow
  Function VetoProtocolInstallPageShow
    !insertmacro VetoProtocolStartProgressGlow
  FunctionEnd
!macroend

!macro customUnInstall
  !insertmacro VetoProtocolStartProgressGlow
!macroend