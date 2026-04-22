@echo off
REM Wrapper para dar duplo-clique e rodar start.ps1 sem precisar abrir PowerShell.
REM -ExecutionPolicy Bypass afeta apenas este processo; nao muda config global.

pushd "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set EXITCODE=%ERRORLEVEL%
popd

if %EXITCODE% NEQ 0 (
    echo.
    echo [x] start.ps1 retornou codigo %EXITCODE%.
    echo Pressione qualquer tecla para fechar...
    pause >nul
)

exit /b %EXITCODE%
