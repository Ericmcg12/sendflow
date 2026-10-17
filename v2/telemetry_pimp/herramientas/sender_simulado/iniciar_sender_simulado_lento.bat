@echo off
title Sender simulado (velocidad real del ESP-01S, con descarga)
cd /d "%~dp0"
node sender_simulado.js --lento --con-descarga %*
pause
