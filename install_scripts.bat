@echo off
echo ==============================================
echo Digikar Extension - Tampermonkey Script Installer
echo ==============================================
echo.
echo * NOTE: If you have old Japanese-named scripts installed,
echo * please delete them from Tampermonkey dashboard first!
echo.
echo Ready to install 4 new scripts.
pause

echo.
echo Opening 4 browser tabs...
echo Please click the "Install" button on each tab.
echo.
timeout /t 2 /nobreak > nul

echo 1/4: Opening cell-colorizer...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/cell-colorizer.user.js
timeout /t 1 /nobreak > nul

echo 2/4: Opening bml-submit-detector...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/bml-submit-detector.user.js
timeout /t 1 /nobreak > nul

echo 3/4: Opening drug-master-manager...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/drug-master-manager.user.js
timeout /t 1 /nobreak > nul

echo 4/4: Opening date-insulin-calc...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/date-insulin-calc.user.js
timeout /t 1 /nobreak > nul

echo.
echo ==============================================
echo All 4 tabs have been opened!
echo Once you clicked "Install" on all 4 tabs in your browser,
echo you can close this black window.
echo ==============================================
pause
