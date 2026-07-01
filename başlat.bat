@echo off
title Oto Müzik - YouTube MP3 İndirici
color 0F
echo.
echo  ╔══════════════════════════════════════╗
echo  ║        OTO MÜZIK - BAŞLATILIYOR      ║
echo  ║      YouTube MP3 İndirici v1.0       ║
echo  ╚══════════════════════════════════════╝
echo.
echo  [•] Sunucu başlatılıyor...
echo  [•] Tarayıcı otomatik açılacak
echo  [•] Durdurmak için Ctrl+C
echo.

cd /d "%~dp0"
python app.py

if %errorlevel% neq 0 (
    echo.
    echo  [!] HATA: Python çalıştırılamadı!
    echo  [!] Python'un yüklü olduğundan emin olun.
    echo.
    pause
)
