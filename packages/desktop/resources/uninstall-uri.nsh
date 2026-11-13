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
