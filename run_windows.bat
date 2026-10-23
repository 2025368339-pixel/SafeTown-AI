@echo off
setlocal
cd /d "%~dp0"
title SafeTown AI - Desktop and Mobile
where py >nul 2>&1
if %errorlevel%==0 (set "PYTHON=py -3") else (set "PYTHON=python")
%PYTHON% --version
if errorlevel 1 (echo Python 3.10+ required & pause & exit /b 1)
echo Installing Python dependencies...
%PYTHON% -m pip install -r requirements.txt
if errorlevel 1 (echo Dependency install failed & pause & exit /b 1)
echo.
echo ===========================================================
echo DESKTOP: http://127.0.0.1:8002
 echo PHONE: Find your PC IPv4 with ipconfig; open http://PC-IP:8002
 echo        e.g. http://192.168.1.20:8002
 echo Your phone and PC must be on the SAME trusted Wi-Fi.
echo Browser works on Android/iPhone without installing code.
echo Warning: Demo passwords! Do not use public Wi-Fi or port forwarding.
echo Windows Firewall may request permission: Private network ONLY.
echo Keep this window running to serve phones.
echo ===========================================================
 echo.
%PYTHON% -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('192.0.2.1',80)); print('Suggested PHONE URL: http://'+s.getsockname()[0]+':8002');s.close()" 2>nul
start "" "http://127.0.0.1:8002"
%PYTHON% -m uvicorn server:app --host 0.0.0.0 --port 8002
pause
