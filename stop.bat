@echo off
REM Wrapper para dar duplo-clique e rodar stop.ps1 sem precisar abrir PowerShell.

pushd "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
set EXITCODE=%ERRORLEVEL%
popd

if %EXITCODE% NEQ 0 (
    echo.
    echo [x] stop.ps1 retornou codigo %EXITCODE%.
    echo Pressione qualquer tecla para fechar...
    pause >nul
)

exit /b %EXITCODE%
