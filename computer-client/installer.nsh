; installer.nsh — runs during NSIS install/uninstall
; Adds the client to Windows startup (runs on login, hidden, in tray)

!macro customInstall
  ; Add to Windows startup registry so it auto-runs on login
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" \
    "MarioGamingClient" '"$INSTDIR\Mario Gaming Client.exe" --hidden'
  
  ; Also add to all-users startup folder as backup
  CreateShortCut "$SMSTARTUP\Mario Gaming Client.lnk" \
    "$INSTDIR\Mario Gaming Client.exe" "--hidden" \
    "$INSTDIR\Mario Gaming Client.exe" 0 SW_SHOWMINIMIZED
!macroend

!macro customUninstall
  ; Remove from startup
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "MarioGamingClient"
  Delete "$SMSTARTUP\Mario Gaming Client.lnk"
!macroend
