LangString VerifyResourcesStatus 1033 "Verifying application resources. This may take a few minutes..."
LangString VerifyResourcesError 1033 "Application resources could not be verified or the verification cache could not be saved. Installation did not complete. Please run the installer again."
LangString VerifyResourcesStatus 1049 "Проверка ресурсов приложения. Это может занять несколько минут..."
LangString VerifyResourcesError 1049 "Не удалось проверить ресурсы приложения или сохранить результат проверки. Установка не завершена. Запустите установщик повторно."

!macro customInstall
  # Never skip updates: the final installed bytes and current user's profile
  # must be checked before NSIS can mark the installation successful or launch.
  SetDetailsPrint textonly
  DetailPrint "$(VerifyResourcesStatus)"
  SetDetailsPrint both
  ClearErrors
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --verify-resources' $0
  ${if} ${Errors}
    StrCpy $0 1
  ${endif}
  ${if} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "$(VerifyResourcesError)" /SD IDOK
    SetErrorLevel 1
    Abort
  ${endif}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ReadRegStr $0 HKCU "Software\Classes\loginom-ai-agent\shell\open\command" ""

    # Read the executable, not its arguments. Electron quotes paths with spaces.
    StrCpy $1 $0 1
    StrCpy $2 0
    ${if} $1 == '$\"'
      StrCpy $0 $0 "" 1
      StrCpy $1 '$\"'
    ${else}
      StrCpy $1 " "
    ${endif}
    ${do}
      StrCpy $3 $0 1 $2
      ${if} $3 == ""
      ${orIf} $3 == $1
        ${exitDo}
      ${endif}
      ${if} $1 == " "
      ${andIf} $3 == "$\t"
        ${exitDo}
      ${endif}
      IntOp $2 $2 + 1
    ${loop}
    StrCpy $0 $0 $2

    # Reject relative commands; normalize traversal before checking ownership.
    StrCpy $1 $0 2
    StrCpy $2 $0 2 1
    ${if} $1 == "\\"
    ${orIf} $2 == ":\"
    ${orIf} $2 == ":/"
      GetFullPathName $0 $0
      StrCpy $1 "$INSTDIR\"
      StrLen $2 $1
      StrCpy $0 $0 $2
      ${if} $0 == $1
        DeleteRegKey HKCU "Software\Classes\loginom-ai-agent"
      ${endif}
    ${endif}
  ${endif}
!macroend
