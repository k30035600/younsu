' CMD 창 없이 포털 시작 — 저장소: younsu\web\ 이 파일 복사
' USB: F:\행정심판청구_숨김시작.vbs 또는 F:\Bundle\ 에 두면 됩니다(로직은 CommissionPortal-StartHidden.vbs 와 동일).
Option Explicit

Dim sh, fso, d, portal, nodeExe, env, oExec, line, repoRoot, scriptParent, fldr, dTrim, up1, up2, peerDir, peerTrim

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptParent = fso.GetParentFolderName(WScript.ScriptFullName)
d = scriptParent
If Right(d, 1) <> "\" Then d = d & "\"

portal = ""
repoRoot = ""

If fso.FileExists(d & "commission-portal\start.js") Then
  portal = d & "commission-portal"
  dTrim = d
  If Len(dTrim) >= 1 And Right(dTrim, 1) = "\" Then dTrim = Left(dTrim, Len(dTrim) - 1)
  repoRoot = fso.GetParentFolderName(dTrim)
  If Right(repoRoot, 1) <> "\" Then repoRoot = repoRoot & "\"
ElseIf fso.FileExists(d & "Bundle\usb_bundle\commission-portal\start.js") Then
  portal = d & "Bundle\usb_bundle\commission-portal"
  repoRoot = d
ElseIf fso.FileExists(d & "Bundle\commission-portal\start.js") Then
  portal = d & "Bundle\commission-portal"
  repoRoot = d
ElseIf fso.FileExists(d & "Bundle\portal\start.js") Then
  portal = d & "Bundle\portal"
  repoRoot = d
ElseIf fso.FileExists(d & "Web\commission-portal\start.js") Then
  portal = d & "Web\commission-portal"
  repoRoot = d
ElseIf fso.FileExists(d & "번들용\portal\start.js") Then
  portal = d & "번들용\portal"
  repoRoot = d
ElseIf fso.FileExists(d & "portal\start.js") Then
  portal = d & "portal"
  repoRoot = d
ElseIf fso.FileExists(fso.GetParentFolderName(scriptParent) & "\commission-portal\start.js") Then
  peerDir = fso.GetParentFolderName(scriptParent)
  portal = peerDir & "\commission-portal"
  If Right(portal, 1) <> "\" Then portal = portal & "\"
  peerTrim = peerDir
  If Right(peerTrim, 1) = "\" Then peerTrim = Left(peerTrim, Len(peerTrim) - 1)
  repoRoot = fso.GetParentFolderName(peerTrim)
  If Right(repoRoot, 1) <> "\" Then repoRoot = repoRoot & "\"
Else
  On Error Resume Next
  Set fldr = fso.GetFolder(scriptParent)
  On Error GoTo 0
  If Not fldr Is Nothing Then
    If LCase(fldr.Name) = "commission-portal" And fso.FileExists(scriptParent & "\start.js") Then
      portal = scriptParent & "\"
      up1 = fso.GetParentFolderName(scriptParent)
      up2 = fso.GetParentFolderName(up1)
      repoRoot = up2
      If Right(repoRoot, 1) <> "\" Then repoRoot = repoRoot & "\"
    End If
  End If
End If

If Len(portal) = 0 Then
  MsgBox "Portal not found." & vbCrLf & vbCrLf & "Expected one of:" & vbCrLf & "  ...\Bundle\usb_bundle\commission-portal\start.js" & vbCrLf & "  ...\Bundle\commission-portal\start.js" & vbCrLf & "  ...\commission-portal\start.js" & vbCrLf & "  ...\portal\start.js", 48, "Commission portal"
  WScript.Quit 1
End If

nodeExe = portal & "\_node\node.exe"
If Not fso.FileExists(nodeExe) Then
  Dim runtimeNode
  runtimeNode = fso.GetParentFolderName(portal) & "\runtime\node-win-x64\node.exe"
  If fso.FileExists(runtimeNode) Then
    nodeExe = runtimeNode
  End If
End If
If Not fso.FileExists(nodeExe) Then
  nodeExe = ""
  Set oExec = sh.Exec("%ComSpec% /c where node")
  Do While oExec.Status = 0
    WScript.Sleep 50
  Loop
  line = Trim(oExec.StdOut.ReadAll())
  If Len(line) > 0 Then
    If InStr(line, vbCrLf) > 0 Then line = Split(line, vbCrLf)(0)
    If InStr(line, vbLf) > 0 Then line = Split(line, vbLf)(0)
    nodeExe = Trim(line)
  End If
End If

If Len(nodeExe) = 0 Then
  MsgBox "Node.js not found." & vbCrLf & vbCrLf & "Install Node.js, or copy portable node to:" & vbCrLf & portal & "\_node\node.exe", 48, "Commission portal"
  WScript.Quit 1
End If

Dim port, url, http, attempt, ok
port = "8282"
url = "http://127.0.0.1:" & port

Function HealthBodyOk(h)
  Dim hb
  On Error Resume Next
  hb = False
  If Not (h Is Nothing) Then
    If h.Status = 200 Then
      If Trim(h.responseText) = "ok" Then hb = True
    End If
  End If
  On Error GoTo 0
  HealthBodyOk = hb
End Function

' Pre-check: is our portal already running? (8282에 다른 프로그램이 200을 주면 무시)
ok = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.Open "GET", url & "/health", False
http.setRequestHeader "Accept", "text/plain"
http.Send
If HealthBodyOk(http) Then ok = True
Set http = Nothing
On Error GoTo 0

If ok Then
  sh.Run url & "/", 1, False
  WScript.Quit 0
End If

' cmd.exe 의 set VAR=F:\&& 파싱/따옴표 이슈를 피하려면 PROCESS 환경 + 직접 node 실행
sh.CurrentDirectory = portal
Set env = sh.Environment("PROCESS")
env("COMMISSION_REPO_ROOT") = repoRoot
env("PORT") = port
env("COMMISSION_QUIET") = "1"
sh.Run Chr(34) & nodeExe & Chr(34) & " start.js", 0, False

' Wait up to ~8 seconds for server to respond
ok = False
For attempt = 1 To 8
  WScript.Sleep 1000
  On Error Resume Next
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", url & "/health", False
  http.setRequestHeader "Accept", "text/plain"
  http.Send
  If HealthBodyOk(http) Then ok = True
  Set http = Nothing
  On Error GoTo 0
  If ok Then Exit For
Next

If ok Then
  sh.Run url & "/", 1, False
Else
  Dim msg
  msg = "Server did not start." & vbCrLf & vbCrLf
  msg = msg & "Possible causes:" & vbCrLf
  msg = msg & "  - Port " & port & " already in use" & vbCrLf
  msg = msg & "  - Node.js error" & vbCrLf & vbCrLf
  msg = msg & "Check port (PowerShell):" & vbCrLf
  msg = msg & "  Get-NetTCPConnection -LocalPort " & port & " -State Listen" & vbCrLf & vbCrLf
  msg = msg & "node: " & nodeExe & vbCrLf
  msg = msg & "portal: " & portal
  MsgBox msg, 48, "Commission portal"
End If
