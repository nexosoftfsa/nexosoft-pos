' Lanza iniciar-cloud-api.ps1 sin ninguna ventana visible. El "-WindowStyle
' Hidden" de powershell.exe no siempre alcanza en Windows 11 (en particular
' si Windows Terminal es la app de consola por defecto, igual aparece una
' ventana). WScript.Shell.Run con el modo 0 lo evita de verdad.
Set objFSO = CreateObject("Scripting.FileSystemObject")
carpeta = objFSO.GetParentFolderName(WScript.ScriptFullName)
scriptPs1 = carpeta & "\iniciar-cloud-api.ps1"

Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & scriptPs1 & """", 0, False
