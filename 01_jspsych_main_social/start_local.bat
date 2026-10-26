@echo off
REM Starts the experiment server on THIS computer and opens the start page in the browser.
REM The other lab computer opens the address printed in this window ("other computer: ...").
REM Close this window to stop the server. Not needed on the real server (do not upload).
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8000/main_social_basic.html"
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 local_server.py 8000
    goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
    python local_server.py 8000
    goto :eof
)
echo Python was not found. Install Python 3 from python.org and run this file again.
pause
