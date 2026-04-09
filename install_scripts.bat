@echo off
chcp 65001 > nul
echo ==============================================
echo デジカル拡張用 Tampermonkeyスクリプト インストーラー
echo ==============================================
echo.
echo ※注意：作業前に、古い日本語名のスクリプトがTampermonkeyに
echo 残っている場合は、二重起動を防ぐために削除しておいてください。
echo.
echo 準備ができたらインストールを開始します。
pause

echo.
echo 4つのインストール画面（タブ）を順番に開きます。
echo それぞれのタブで「インストール」をクリックしてください。
echo.
timeout /t 2 /nobreak > nul

echo 1/4: セル塗り分け を開いています...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/cell-colorizer.user.js
timeout /t 1 /nobreak > nul

echo 2/4: BML送信完了検知 を開いています...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/bml-submit-detector.user.js
timeout /t 1 /nobreak > nul

echo 3/4: 採用薬マスター管理 を開いています...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/drug-master-manager.user.js
timeout /t 1 /nobreak > nul

echo 4/4: 日付・インスリン計算 を開いています...
start https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/date-insulin-calc.user.js
timeout /t 1 /nobreak > nul

echo.
echo ==============================================
echo すべての画面を開きました。
echo ブラウザ上で4つの「インストール」が完了したら終了です。
echo ==============================================
pause
