@echo off
setlocal
REM Starts the experiment server on THIS computer and opens the start page in the browser.
REM The other lab computer opens the address printed in this window ("other computer: ...").
REM Close this window to stop the server. Not needed on the real server (do not upload).
cd /d "%~dp0"
REM An executable on PATH can be a non-working Windows Store alias. Run a probe.
set "PYTHON_EXE="
set "PYTHON_ARGS="
py -3 -c "from http.server import ThreadingHTTPServer" >nul 2>nul
if not errorlevel 1 (
    set "PYTHON_EXE=py"
    set "PYTHON_ARGS=-3"
    goto :start_server
)
python -c "from http.server import ThreadingHTTPServer" >nul 2>nul
if not errorlevel 1 (
    set "PYTHON_EXE=python"
    goto :start_server
)
REM uv-managed Python is not necessarily on PATH. Check its default Windows location.
for /d %%D in ("%APPDATA%\uv\python\cpython-3.*-windows-x86_64-none") do (
    if exist "%%~fD\python.exe" (
        "%%~fD\python.exe" -c "from http.server import ThreadingHTTPServer" >nul 2>nul
        if not errorlevel 1 (
            set "PYTHON_EXE=%%~fD\python.exe"
            goto :start_server
        )
    )
)
echo No working Python 3 interpreter was found.
echo Install Python 3 from python.org and add it to PATH, or install Python with uv.
pause
exit /b 1

:start_server
REM The server opens the browser only after it has successfully bound to the port.
"%PYTHON_EXE%" %PYTHON_ARGS% local_server.py 8000 --open
set "SERVER_EXIT=%ERRORLEVEL%"
echo.
if not "%SERVER_EXIT%"=="0" echo The server could not run. Please check the error above.
pause
exit /b %SERVER_EXIT%
