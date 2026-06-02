@echo off
title Download Gambar Produk - Makmur Grosir
echo ================================================
echo    MAKMUR GROSIR - DOWNLOAD GAMBAR PRODUK
echo ================================================
echo.
echo Script ini akan mencari dan mendownload gambar
echo produk dari Lazada / Tokopedia / Bing.
echo.
echo Pilih mode:
echo    [1] Test - 10 produk (untuk coba-coba)
echo    [2] Full - Semua 2.781 produk (lama!)
echo    [3] Resume - Ulang produk yang gagal
echo    [0] Keluar
echo.
set /p choice="Pilihan (0-3): "

if "%choice%"=="1" goto test
if "%choice%"=="2" goto full
if "%choice%"=="3" goto resume
if "%choice%"=="0" goto end
echo Pilihan tidak valid!
pause
goto end

:test
echo.
echo Menjalankan test 10 produk...
node scripts/download_images.js --mode=quick
goto done

:full
echo.
echo Menjalankan download SEMUA produk...
echo Ini akan memakan waktu LAMA (beberapa jam)!
echo.
set /p confirm="Lanjutkan? (y/n): "
if /i not "%confirm%"=="y" goto end
node scripts/download_images.js --mode=full
goto done

:resume
echo.
echo Melanjutkan produk yang gagal...
node scripts/download_images.js --mode=resume
goto done

:done
echo.
echo ================================================
echo    SELESAI! Gambar tersimpan di assets/images/
echo ================================================
pause
goto end

:end
exit
