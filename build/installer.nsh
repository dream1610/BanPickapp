!macro customWelcomePage
  !define MUI_BGCOLOR "0B0C0D"
  !define MUI_TEXTCOLOR "F3E9D1"
  !define MUI_WELCOMEPAGE_TITLE "Cài đặt Veto Protocol"
  !define MUI_WELCOMEPAGE_TEXT "Bắt đầu cài đặt Veto Protocol trên máy tính này. Ứng dụng sẽ được cài cho tài khoản Windows hiện tại."
  !define MUI_FINISHPAGE_TITLE "Veto Protocol đã sẵn sàng"
  !define MUI_FINISHPAGE_TEXT "Cài đặt hoàn tất. Mở Veto Protocol để bắt đầu."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  !ifndef PBM_SETBARCOLOR
    !define PBM_SETBARCOLOR 0x0409
  !endif
  !ifndef PBM_SETBKCOLOR
    !define PBM_SETBKCOLOR 0x2001
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW VetoProtocolInstallPageShow
  Function VetoProtocolInstallPageShow
    GetDlgItem $0 $HWNDPARENT 1004
    System::Call 'uxtheme::SetWindowTheme(p $0, w "", w "")'
    SendMessage $0 ${PBM_SETBARCOLOR} 0 0x72AED7
    SendMessage $0 ${PBM_SETBKCOLOR} 0 0x00161616
  FunctionEnd
!macroend