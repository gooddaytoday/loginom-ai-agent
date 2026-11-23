LangString VerifyResourcesStatus 1033 "Verifying application resources. This may take a few minutes..."
LangString VerifyResourcesError 1033 "Application resources could not be verified or the verification cache could not be saved. Installation did not complete. Please run the installer again."
LangString VerifyResourcesStatus 1049 "Проверка ресурсов приложения. Это может занять несколько минут..."
LangString VerifyResourcesError 1049 "Не удалось проверить ресурсы приложения или сохранить результат проверки. Установка не завершена. Запустите установщик повторно."

# Preserve electron-builder's full language set with the English source fallback.
!macro VerifyResourcesEnglish LANG
  LangString VerifyResourcesStatus ${LANG} "Verifying application resources. This may take a few minutes..."
  LangString VerifyResourcesError ${LANG} "Application resources could not be verified or the verification cache could not be saved. Installation did not complete. Please run the installer again."
!macroend
!insertmacro VerifyResourcesEnglish 1031
!insertmacro VerifyResourcesEnglish 1036
!insertmacro VerifyResourcesEnglish 3082
!insertmacro VerifyResourcesEnglish 2052
!insertmacro VerifyResourcesEnglish 1028
!insertmacro VerifyResourcesEnglish 1041
!insertmacro VerifyResourcesEnglish 1042
!insertmacro VerifyResourcesEnglish 1040
!insertmacro VerifyResourcesEnglish 1043
!insertmacro VerifyResourcesEnglish 1030
!insertmacro VerifyResourcesEnglish 1053
!insertmacro VerifyResourcesEnglish 1044
!insertmacro VerifyResourcesEnglish 1035
!insertmacro VerifyResourcesEnglish 2070
!insertmacro VerifyResourcesEnglish 1046
!insertmacro VerifyResourcesEnglish 1045
!insertmacro VerifyResourcesEnglish 1058
!insertmacro VerifyResourcesEnglish 1029
!insertmacro VerifyResourcesEnglish 1051
!insertmacro VerifyResourcesEnglish 1038
!insertmacro VerifyResourcesEnglish 1025
!insertmacro VerifyResourcesEnglish 1055
!insertmacro VerifyResourcesEnglish 1054
!insertmacro VerifyResourcesEnglish 1066

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
    ${if} ${isUpdated}
      # Updates are silent; an integrity failure must still explain why the app did not relaunch.
      MessageBox MB_OK|MB_ICONSTOP "$(VerifyResourcesError)"
    ${else}
      MessageBox MB_OK|MB_ICONSTOP "$(VerifyResourcesError)" /SD IDOK
    ${endif}
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
