@echo off
rem Abre o instalador assistido. O PowerShell roda so com este arquivo,
rem sem mudar a politica de execucao do Windows.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-extensao.ps1"
