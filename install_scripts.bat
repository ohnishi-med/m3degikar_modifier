@echo off
echo ==============================================
echo Digikar Extension - Tampermonkey Script Installer
echo ==============================================
echo.
echo * NOTE: If you have old Japanese-named scripts installed,
echo * please delete them from Tampermonkey dashboard first!
echo.
echo Ready to install 6 new scripts.
pause

echo.
echo Opening 6 browser tabs...
echo Please click the "Install" button on each tab.
echo.
timeout /t 2 /nobreak > nul

echo 1/6: Opening cell-colorizer...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/cell-colorizer.user.js
timeout /t 1 /nobreak > nul

echo 2/6: Opening bml-submit-detector...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/bml-submit-detector.user.js
timeout /t 1 /nobreak > nul

echo 3/6: Opening drug-master-manager...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/drug-master-manager.user.js
timeout /t 1 /nobreak > nul

echo 4/6: Opening date-insulin-calc...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/date-insulin-calc.user.js
timeout /t 1 /nobreak > nul

echo 5/6: Opening salt-intake-calculator...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/salt-intake-calculator.user.js
timeout /t 1 /nobreak > nul

echo 6/6: Opening hasegawa-hdrs-integration...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/hasegawa-hdrs-integration.user.js
timeout /t 1 /nobreak > nul

echo.
echo ==============================================
echo All 6 tabs have been opened!
echo Once you clicked "Install" on all 6 tabs in your browser,
echo you can close this black window.
echo ==============================================
pause
