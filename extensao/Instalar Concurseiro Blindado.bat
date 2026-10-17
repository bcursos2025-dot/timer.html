@echo off
rem Abre o instalador assistido. Funciona sozinho: se o instalar-extensao.ps1 nao estiver
rem na mesma pasta, baixa do site. Nao muda a politica de execucao do Windows.
chcp 65001 >nul
set "PS1=%~dp0instalar-extensao.ps1"
if exist "%PS1%" goto rodar
set "PS1=%TEMP%\cb-instalar-extensao.ps1"
echo Baixando o instalador...
powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://bcursos2025-dot.github.io/timer.html/extensao/instalar-extensao.ps1' -OutFile '%PS1%'"
if not exist "%PS1%" goto falhou
:rodar
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
goto fim
:falhou
echo Nao consegui baixar. Verifique a internet e tente de novo.
pause
:fim
