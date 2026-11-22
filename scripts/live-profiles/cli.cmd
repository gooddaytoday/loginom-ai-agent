@echo off
rem B3.3 (stand.sh user): install the 0.4.0 CLI for this user and try to save a Loginom connection without a Loginom server.
cd /d C:\lab\b33\u
if not exist cli040 mkdir cli040
tar -xf C:\lab\b33\dist\cli-0.4.0.zip -C cli040 || exit /b 1
call cli040\install.cmd
echo install exit %errorlevel%
set CLI=%LOCALAPPDATA%\Programs\loginom-ai-agent-cli\bin\loginom-ai-agent-cli.exe
if not exist "%CLI%" for /r "%LOCALAPPDATA%\Programs\loginom-ai-agent-cli" %%f in (loginom-ai-agent-cli.exe loginom-ai-agent-cli.cmd) do set CLI=%%f
echo cli %CLI%
call "%CLI%" --version
echo {"url":"http://127.0.0.1:9/","username":"b33","password":"b33-made-up-loginom-password"}| call "%CLI%" loginom setup --stdin-json --format json
echo setup exit %errorlevel%
call "%CLI%" loginom status --format json
