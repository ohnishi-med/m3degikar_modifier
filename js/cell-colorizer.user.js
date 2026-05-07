// ==UserScript==
// @name 受付セル塗り分け
// @namespace http://tampermonkey.net/
// @version 4.3.12
// @description 発熱外来対応　川口子ども、一人親 医療費対応。
// @author Tsuyoshi Ohnishi
// @match https://digikar.jp/*
// @run-at document-idle
// @updateURL https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/cell-colorizer.user.js
// @downloadURL https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/cell-colorizer.user.js
// ==/UserScript==

// ======================================================================
// 【更新履歴】
// v4.3.4: バージョン形式の標準化。
// v4.3.3: 18歳判定の厳密化(年度末考慮)と「会計済」除外。坂口医師の固定色追加。
// ======================================================================

(function () {
    'use strict';

    // ======================================================================
    // 【1】カスタマイズ箇所：固定配色リスト（医師名の色付け）
    // ======================================================================
    const FIXED_DOCTORS = {
        // "医師名 (完全一致)": { background: "背景色 (CSSコード)", color: "文字色 (CSSコード)" }
        "大西　剛史": { background: "#F0F8FF", color: "black" },      // アリスブルー (非常に淡い青)
        "坂口　祐希": { background: "#FFF0F5", color: "black" },      // ラベンダーブラッシュ (非常に淡いピンク)
        "久保　英二": { background: "#F0FFF0", color: "black" }       // アイボリーグリーン (非常に淡い緑)
    };

    // ======================================================================
    // 【2】カスタマイズ箇所：巡回配色リスト（医師名の色付け）
    // ======================================================================
    const COLOR_PALETTE = [
        { background: "#FFF0F5", color: "black" },  // ラベンダーブラッシュ
        { background: "#FFF5EE", color: "black" },  // シーシェル
        { background: "#F5FFFA", color: "black" },  // ミントクリーム
        { background: "#FFFAF0", color: "black" },  // フロラルホワイト
        { background: "#F0FFFF", color: "black" },  // アジュール
        { background: "#FAEBD7", color: "black" }   // アンティークホワイト
    ];

    // ======================================================================
    // 【3】警告色とルールの定義
    // ======================================================================
    const WARNING_STYLE = { background: "#FFEBCC", color: "black" }; // 薄いオレンジ (小児科ルール警告)
    const NO_INSURANCE_STYLE = { background: "#FFFFE0", color: "black" }; // 薄い黄色 (保険無し警告)
    // 💡 オンライン受付メモ用スタイル (淡いパープル)
    const ONLINE_MEMO_STYLE = { background: "#E6E6FA", color: "black" }; // Lavender (淡いパープル)
    // 💡 発熱外来用スタイル (淡いピンク/赤)
    const FEVER_CLINIC_STYLE = { background: "#FFE4E1", color: "black" }; // MistyRose
    // セレクタ定義
    const TABLE_SELECTOR = 'table.css-10z6nof';
    const RECEPTION_URL_PREFIX = 'https://digikar.jp/reception/';

    // 動的に取得されるカラムインデックス（初期値は一般的な配置）
    let columnIndices = {
        status: 3,
        birthday: -1, // デフォルトでは未発見
        age: 6,
        insurance: 7,
        dept: 8,
        doctor: 9,
        patientMemo: 11,
        memo: 12
    };

    let colorMap = {};
    let toastTimeout; // トーストタイマーのIDを保持
    let toastDelayTimer = null; // エラー予約タイマーのIDを保持
    let hasShownBirthdayWarning = false; // 生年月日警告の表示済みフラグ

    let observer; // テーブルの変更を監視するObserver
    let isObserverInitialized = false; // Observerが初期化されたかを示すフラグ

    // --- カラム位置の自動検出 ---

    /**
     * テーブルヘッダーを走査して、必要な情報のカラムインデックスを特定します。
     */
    function updateColumnIndices() {
        const table = document.querySelector(TABLE_SELECTOR);
        if (!table) return;
        const headerCells = table.querySelectorAll('thead th');
        if (headerCells.length === 0) return;

        // 見つかったものだけ更新（見つからない場合は -1）
        const newIndices = { status: -1, birthday: -1, age: -1, insurance: -1, dept: -1, doctor: -1, patientMemo: -1, memo: -1 };

        headerCells.forEach((cell, index) => {
            const text = cell.innerText.trim();
            if (text.includes("ステータス")) newIndices.status = index;
            else if (text.includes("生年月日")) newIndices.birthday = index;
            else if (text.includes("年齢")) newIndices.age = index;
            else if (text.includes("保険")) newIndices.insurance = index;
            else if (text.includes("診療科")) newIndices.dept = index;
            else if (text.includes("医師")) newIndices.doctor = index;
            else if (text.includes("患者メモ")) newIndices.patientMemo = index;
            else if (text.includes("受付メモ")) newIndices.memo = index;
        });

        // 重要なカラムが一つも見つからない場合は、デフォルト値を維持（または前回の値を維持）
        if (newIndices.status !== -1 || newIndices.doctor !== -1) {
            columnIndices = newIndices;
        }

        // 生年月日が非表示の場合、一度だけ通知を出す
        if (columnIndices.birthday === -1 && !hasShownBirthdayWarning) {
            showToast("「生年月日」カラムが非表示です。18歳の精密判定（年度末チェック）を行うには、左上のフィルターアイコンから「生年月日」を表示してください。現在は「年齢」で代用しています。", 8000, "info");
            hasShownBirthdayWarning = true;
        } else if (columnIndices.birthday !== -1) {
            hasShownBirthdayWarning = true; // 表示されているなら今後も出さない
        }
    }

    // --- トースト通知機能 ---

    /**
     * 画面下部にトースト通知を表示します。
     * @param {string} message - 表示するメッセージ
     * @param {number} duration - 表示時間(ms)
     * @param {string} type - 'error' または 'info'
     */
    function showToast(message, duration = 3000, type = "error") {
        // 既存のトーストがあれば削除し、タイマーをリセット
        const existingToast = document.getElementById('digikar-colorizer-toast');
        if (existingToast) {
            existingToast.remove();
            clearTimeout(toastTimeout);
        }

        const toast = document.createElement('div');
        toast.id = 'digikar-colorizer-toast';
        toast.textContent = type === "error" ? `[Colorizerエラー] ${message}` : `[Colorizer] ${message}`;

        // CSSスタイルを適用
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: type === "error" ? 'rgba(255, 60, 60, 0.9)' : 'rgba(50, 50, 50, 0.85)', // エラーは赤、通知は黒
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '13px',
            zIndex: '99999',
            transition: 'opacity 0.5s ease-in-out',
            opacity: '1',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none'
        });

        document.body.appendChild(toast);

        // 数秒後に消去
        toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, duration);
    }

    // --- 処理ロジック関数群 ---

    function extractCellText(cell) {
        let text = '';
        // テキストノードやinput/select/textarea要素から値を取得
        if (cell) {
            const input = cell.querySelector('input, select, textarea');
            if (input) {
                // セレクトボックスの場合は表示されているテキストを取得
                if (input.tagName === 'SELECT' && input.selectedIndex !== -1) {
                    return input.options[input.selectedIndex].text.trim();
                }
                return input.value.trim();
            }
            // 通常のテキストノードから取得
            if (cell.firstChild && cell.firstChild.nodeType === 3) {
                text = cell.firstChild.nodeValue.trim();
            }
            if (!text) {
                text = cell.textContent.trim();
            }
        }
        return text;
    }

    /**
     * Rule 1: 15歳未満が小児科・自由診療・皮膚科以外を受診している場合に警告
     * @param {string} ageText - 年齢テキスト (8列目)
     * @param {string} deptText - 診療科テキスト (10列目)
     * @returns {boolean} - 警告が必要な場合にtrue
     */
    function checkMinorInAdultDept(ageText, deptText) {
        const ageMatch = ageText.match(/^(\d+)/);

        if (!ageMatch) {
            return false;
        }
        const age = parseInt(ageMatch[1], 10);

        if (age >= 15) {
            return false;
        }

        const isCorrectDept = (deptText.includes("小児科") || deptText.includes("自由診療") || deptText.includes("皮膚科"));

        // 15歳未満 AND 適切な診療科ではない場合に警告
        return !isCorrectDept;
    }

    function collectUniqueDoctorNames() {
        const uniqueDoctors = new Set();
        const rows = document.querySelectorAll(`${TABLE_SELECTOR} tbody tr`);
        rows.forEach(row => {
            const allTargetCells = row.querySelectorAll(`td`);

            const doctorCell = (columnIndices.doctor !== -1 && columnIndices.doctor < allTargetCells.length) ? allTargetCells[columnIndices.doctor] : null;
            const doctorName = extractCellText(doctorCell);
            if (doctorName) {
                uniqueDoctors.add(doctorName);
            }
        });
        return Array.from(uniqueDoctors);
    }

    function buildColorMap(allDoctors) {
        const map = { ...FIXED_DOCTORS };
        let paletteIndex = 0;
        allDoctors.forEach(doctorName => {
            if (map.hasOwnProperty(doctorName)) return;
            const style = COLOR_PALETTE[paletteIndex % COLOR_PALETTE.length];
            map[doctorName] = style;
            paletteIndex++;
        });
        return map;
    }

    /**
     * セルを走査し、配色マップと受付ルールに基づいて色を適用します。
     */
    function applyColors() {
        // MutationObserverが発火するたびに、以前のエラー予約タイマーをリセット
        clearTimeout(toastDelayTimer);
        toastDelayTimer = null;

        // 500ms待って、データが読み込まれずにここが実行されたらエラーと見なす
        toastDelayTimer = setTimeout(() => {
            // 500ms経ってもデータが来なかったり、処理が成功しなかった場合はエラー
            showToast("テーブル構造のロードに失敗しました。ページを再読み込みしてください。");
            toastDelayTimer = null; // タイマー実行後はクリア
        }, 500);

        // カラム位置を最新化
        updateColumnIndices();

        // 医師名の色付けマップを再構築
        const uniqueDoctors = collectUniqueDoctorNames();
        colorMap = buildColorMap(uniqueDoctors);

        const rows = document.querySelectorAll(`${TABLE_SELECTOR} tbody tr`);

        // 行が0の場合はスキップ。次の MutationObserver の発火を待つ。
        if (rows.length === 0) {
            // 行数が0（受付0件、またはロード中の過渡期）の場合は、タイマーをキャンセルし、正常終了と見なす
            clearTimeout(toastDelayTimer);
            toastDelayTimer = null;
            return;
        }

        let rowsProcessedCount = 0; // 正常に処理できた行の数を数える

        rows.forEach(row => {
            const allTargetCells = row.querySelectorAll(`td`);

            // 最低限ステータスが見れる程度の列数があるかチェック
            if (allTargetCells.length < 4) return;

            // 正常に処理できる行としてカウント
            rowsProcessedCount++;

            // ヘルパー: セルを安全に取得
            const getCell = (idx) => (idx !== -1 && idx < allTargetCells.length) ? allTargetCells[idx] : null;

            // 各セルの取得
            const statusCell = getCell(columnIndices.status);
            const birthdayCell = getCell(columnIndices.birthday);
            const ageCell = getCell(columnIndices.age);
            const doctorCell = getCell(columnIndices.doctor);
            const deptCell = getCell(columnIndices.dept);
            const insuranceCell = getCell(columnIndices.insurance);
            const patientMemoCell = getCell(columnIndices.patientMemo);
            const memoCell = getCell(columnIndices.memo);

            // テキストの抽出
            const statusText = extractCellText(statusCell);
            const ageText = extractCellText(ageCell);
            const deptText = extractCellText(deptCell);
            const patientMemoText = extractCellText(patientMemoCell);
            const memoText = extractCellText(memoCell);
            const insuranceText = extractCellText(insuranceCell);
            const ageMatch = ageText.match(/^(\d+)/);
            const age = ageMatch ? parseInt(ageMatch[1], 10) : NaN;


            // ======================================================================
            // 1. 各セルの色をリセット（処理を始める前に、以前の色を消去）
            // ======================================================================
            // 全てのセルから色をリセット
            for (let i = 0; i < allTargetCells.length; i++) {
                allTargetCells[i].style.removeProperty('background-color');
                allTargetCells[i].style.removeProperty('color');
            }

            // ======================================================================
            // 2. （削除済：「会計済」でも色付けを継続するように変更）
            // ======================================================================

            // ======================================================================
            // 3. 行全体のベース色付け (オンライン・発熱外来)
            // ======================================================================
            const isOnlineMemo = memoText.includes("オンライン");
            const isFeverClinic = memoText.includes("発熱外来");

            let rowStyle = null;
            if (isOnlineMemo) rowStyle = ONLINE_MEMO_STYLE;
            if (isFeverClinic) rowStyle = FEVER_CLINIC_STYLE; // 発熱外来を優先（必要に応じて順序を入れ替えてください）

            if (rowStyle) {
                for (let i = 0; i < allTargetCells.length; i++) {
                    const cell = allTargetCells[i];
                    cell.style.setProperty('background-color', rowStyle.background);
                    cell.style.setProperty('color', rowStyle.color);
                }
            }


            // ======================================================================
            // 3. 警告ルールの適用 (優先順位：高) - オンラインの色を上書き (重要な警告から順に)
            // ======================================================================

            // Rule 1: 15歳未満が不適切な診療科を受診 (8列目と10列目に影響)
            const isMinorInAdultDeptWarning = checkMinorInAdultDept(ageText, deptText);

            // Rule 2: 15歳以上が小児科を受診 (10列目にのみ影響) - 優先ルール
            const isAdultInPediatricsWarning = age >= 15 && deptText.includes("小児科");

            // --- 10th Column (Dept) Logic --- (最優先警告)
            const isDeptWarningNeeded = isMinorInAdultDeptWarning || isAdultInPediatricsWarning;

            if (isDeptWarningNeeded && deptCell) {
                // 10列目（診療科）に警告色を適用 (オンラインの色を上書き)
                deptCell.style.setProperty('background-color', WARNING_STYLE.background);
                deptCell.style.setProperty('color', WARNING_STYLE.color);
            }

            // --- 8th Column (Age) Logic ---
            if (isMinorInAdultDeptWarning && ageCell) {
                // 8列目（年齢）に警告色を適用 (オンラインの色を上書き)
                ageCell.style.setProperty('background-color', WARNING_STYLE.background);
                ageCell.style.setProperty('color', WARNING_STYLE.color);
            }

            // --- 9th Column (Insurance) Logic ---
            // 【追加】現在の年度末（3/31）を計算
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth() + 1;
            // 4月以降なら来年3月、3月までなら今年3月が年度末
            const limitYear = (currentMonth >= 4) ? currentYear + 1 : currentYear;
            const fiscalYearEnd = new Date(limitYear, 2, 31); // 月は0から始まるので 2 = 3月

            // 【修正】18歳以下の公費チェック対象キーワード（「子」を追加）
            const hasPublicExpense = /(こども|子|ひとり|生活保護|親|障害)/.test(insuranceText);

            // 【修正】18歳の年度末までを対象とする判定
            // 1. 生年月日文字列から西暦年・月・日を抽出 (例: "2007(H19)/07/17" -> 2007, 7, 17)
            const bdayMatch = extractCellText(birthdayCell).match(/^(\d{4}).*\/(\d{2})\/(\d{2})/);
            let isPastFiscalYearEnd = false;

            if (bdayMatch) {
                const bYear = parseInt(bdayMatch[1], 10);
                const bMonth = parseInt(bdayMatch[2], 10);
                const bDay = parseInt(bdayMatch[3], 10);

                // 高校卒業年度の末日（18歳になる年度の3/31）を計算
                // 日本の学制では、4/2生まれ以降はその年の+19年、4/1生まれ以前は+18年の3/31
                const gradYear = (bMonth > 4 || (bMonth === 4 && bDay >= 2)) ? bYear + 19 : bYear + 18;
                const gradDate = new Date(gradYear, 2, 31); // 2=3月

                if (today > gradDate) {
                    isPastFiscalYearEnd = true;
                }
            } else {
                // 生年月日が取れない場合は年齢のみで簡易判定（安全のため19歳以上を対象外とする）
                if (age >= 19) isPastFiscalYearEnd = true;
            }

            // 18歳年度末（または19歳以上）、かつ「自由診療」ではない場合に、公費入力があるかチェック
            // ただし、受付メモに「県外」とある場合は県外在住で子供医療費が使えないため除外する
            const isMinorWithoutChildInsuranceWarning =
                !deptText.includes("自由診療") &&
                !isPastFiscalYearEnd &&
                !hasPublicExpense &&
                !memoText.includes("県外") &&
                !patientMemoText.includes("県外");

            // 9列目に色を付ける必要があるかどうかの判定
            const isInsuranceCellStyleNeeded =
                (insuranceText === "保険無し" && !deptText.includes("自由診療")) || // 保険入力漏れ　検知
                (insuranceText !== "保険無し" && deptText.includes("自由診療")) ||  // 自費保険入力　検知
                isMinorWithoutChildInsuranceWarning;

            if (isInsuranceCellStyleNeeded && insuranceCell) {
                let backgroundStyle = NO_INSURANCE_STYLE.background;
                let colorStyle = NO_INSURANCE_STYLE.color;

                // 新規ルールが最優先で適用される場合は、背景を「あわい黄色」にする
                // ※ここでは、新規ルールが適用された場合に、既存ルールよりも優先して独自の色を適用するロジックにしています。
                if (isMinorWithoutChildInsuranceWarning) {
                    // 例: あわい黄色（Pale yellow/Light Yellow）
                    backgroundStyle = '#FFFFE0';
                    colorStyle = '#000000';
                }
                // 新規ルールが適用されず、既存ルールが適用される場合は、従来のスタイルを維持（初期値のまま）

                insuranceCell.style.setProperty('background-color', backgroundStyle);
                insuranceCell.style.setProperty('color', colorStyle);
            }
            // ======================================================================
            // 4. 医師名の色付けの適用 (優先順位：最高) - 他の色を上書き
            // ======================================================================

            const doctorName = extractCellText(doctorCell);
            const style = colorMap[doctorName];

            if (style && doctorCell) {
                // 11列目（医師名）に色を適用 (オンラインや警告色、またはデフォルト色を上書き)
                doctorCell.style.setProperty('background-color', style.background);
                doctorCell.style.setProperty('color', style.color);

                // ボタンの背景を透明にする処理は維持
                const button = doctorCell.querySelector('button');
                if (button) {
                    button.style.setProperty('background-color', 'transparent');
                }
            }
        });

        // ------------------------------------------------------------------
        // forEachループ終了後、正常なデータ行があればタイマーをキャンセル
        // ------------------------------------------------------------------
        if (rowsProcessedCount > 0) {
            clearTimeout(toastDelayTimer);
            toastDelayTimer = null;
        }
    }


    // --- メイン処理と監視設定 ---

    /**
     * 警告ルールの変更トリガーとなる入力・選択フィールドにイベントリスナーを追加します。
     * @param {HTMLElement} row - 監視対象の行要素
     */
    function attachChangeListeners(row) {
        // ... (変更なし)
        const elementsToWatch = [];

        const cells = row.querySelectorAll('td');
        const getCell = (idx) => (idx !== -1 && idx < cells.length) ? cells[idx] : null;

        // 8列目 (年齢) - 通常のテキスト入力 or テキスト表示
        const ageCell = getCell(columnIndices.age);
        // 9列目 (保険) - テキスト入力 or テキスト表示
        const insuranceCell = getCell(columnIndices.insurance);
        // 10列目 (診療科) - ドロップダウン (select)
        const deptCell = getCell(columnIndices.dept);
        // 11列目付近 (患者メモ) - テキストエリア (textarea) またはテキスト
        const patientMemoCell = getCell(columnIndices.patientMemo);
        // 12列目付近 (受付メモ) - テキストエリア (textarea) またはテキスト
        const memoCell = getCell(columnIndices.memo);

        // 年齢（inputまたはテキスト表示）
        const ageInput = ageCell ? ageCell.querySelector('input') : null;
        if (ageInput) elementsToWatch.push(ageInput);

        // 保険（inputまたはテキスト表示）
        const insuranceInput = insuranceCell ? insuranceCell.querySelector('input') : null;
        if (insuranceInput) elementsToWatch.push(insuranceInput);

        // 診療科（select）
        const deptSelect = deptCell ? deptCell.querySelector('select') : null;
        if (deptSelect) elementsToWatch.push(deptSelect);

        // 患者メモ（textarea等）
        const patientMemoTextarea = patientMemoCell ? patientMemoCell.querySelector('textarea') : null;
        if (patientMemoTextarea) elementsToWatch.push(patientMemoTextarea);

        // 受付メモ（textarea等）
        const memoTextarea = memoCell ? memoCell.querySelector('textarea') : null;
        if (memoTextarea) elementsToWatch.push(memoTextarea);

        // イベントリスナーの追加
        elementsToWatch.forEach(el => {
            el.addEventListener('input', applyColors);
            el.addEventListener('change', applyColors);
        });
    }

    // -------------------------------------------------------------------
    // 💡 テーブルレベルのObserverの起動ロジック
    // -------------------------------------------------------------------

    function initializeObserver() {
        // 既存のObserverがあれば切断
        if (observer) {
            observer.disconnect();
            isObserverInitialized = false;
        }

        const targetTable = document.querySelector(TABLE_SELECTOR);

        if (!targetTable) {
            return;
        }

        // isObserverInitializedのチェックはcheckAndStart()のポーリング内で不要
        console.log("Colorizer: 受付テーブルが見つかりました。行の変更を監視します。");

        observer = new MutationObserver((mutationsList, observer) => {
            let shouldApplyColors = false;

            mutationsList.forEach(mutation => {
                // ノードの追加/削除（行の更新）があれば、色を再適用
                if (mutation.type === 'childList' || mutation.type === 'attributes' || mutation.type === 'characterData') {
                    shouldApplyColors = true;

                    // 新しい行が追加された場合、その行にイベントリスナーを追加
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === 'TR') {
                            attachChangeListeners(node);
                        }
                    });
                }
            });

            if (shouldApplyColors) {
                // イベントのバウンスを防ぐためのディレイ
                if (!window.colorizerTimer) {
                    window.colorizerTimer = setTimeout(() => {
                        applyColors();
                        window.colorizerTimer = null;
                    }, 50); // 50msのディレイ
                }
            }
        });

        // 監視を開始（テーブル自体を監視し、テーブル内の全ての変更を捉える）
        observer.observe(targetTable, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });

        isObserverInitialized = true;

        // 初回実行と、既存の全行へのイベントリスナーの追加
        applyColors();
        document.querySelectorAll(`${TABLE_SELECTOR} tbody tr`).forEach(row => {
            attachChangeListeners(row);
        });
    }

    /**
     * テーブルが出現するまで繰り返しチェックし、出現したら initializeObserver を実行する。
     */
    function checkAndStart() {
        // 処理のディレイを設けることで、コンテンツがロードされるのを待つ
        setTimeout(() => {
            // 処理開始前にURLの再チェックを行う (SPAナビゲーション中の保険)
            if (!window.location.href.startsWith(RECEPTION_URL_PREFIX)) {
                // Reception ページでなければ処理を中止（historyリスナーが次の遷移を捉える）
                return;
            }

            const targetTable = document.querySelector(TABLE_SELECTOR);

            if (targetTable) {
                // テーブルが見つかったら、Observerの設定に移る
                // isObserverInitialized のチェックを追加し、二重起動を防ぐ
                if (!isObserverInitialized) {
                    initializeObserver();
                }
            } else {
                // テーブルが見つからない場合、100ms待って再試行（念のためポーリングも残す）
                setTimeout(checkAndStart, 100);
            }
        }, 100); // 100msのディレイ
    }


    // ======================================================================
    // 💡 修正箇所：ソフトナビゲーション (pushState/replaceState) への対応
    // ======================================================================

    /**
     * history.pushState/replaceState をフックし、URL変更を検知します。
     */
    function setupHistoryListener() {
        console.log("Colorizer: SPAナビゲーションを監視します。");

        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        // ソフトナビゲーションが実行されたときに発火させる関数
        const urlChanged = () => {
            // URLが /reception/ に変わったら処理を再起動
            if (window.location.href.startsWith(RECEPTION_URL_PREFIX)) {
                console.log("Colorizer: URL変更（receptionへ遷移）を検知しました。処理を再起動します。");
                // 既存の Observer をリセットし、再起動
                if (observer) observer.disconnect();
                observer = null; // nullにして二重初期化を防ぐ
                isObserverInitialized = false; // フラグもリセット
                checkAndStart();
            } else {
                // /reception/ 以外のURLに遷移した場合、処理を停止（observerを切断）
                if (observer) {
                    console.log("Colorizer: /reception/ 以外へ遷移しました。Observerを切断します。");
                    observer.disconnect();
                    observer = null;
                    isObserverInitialized = false;
                }
            }
        };

        // history.pushStateを上書き
        history.pushState = function () {
            originalPushState.apply(history, arguments);
            // pushStateの後に非同期で処理を呼び出す
            setTimeout(urlChanged, 0);
        };

        // history.replaceStateを上書き
        history.replaceState = function () {
            originalReplaceState.apply(history, arguments);
            // replaceStateの後に非同期で処理を呼び出す
            setTimeout(urlChanged, 0);
        };

        // ブラウザの戻る/進むボタンに対応
        window.addEventListener('popstate', urlChanged);
    }


    // -------------------------------------------------------------------
    // 💡 実行開始ロジック
    // -------------------------------------------------------------------

    /**
     * 初回実行時、またはSPAナビゲーション発生時に実行されるメイン関数
     */
    function startScript() {
        // URL変更の監視（一度だけ設定すればOK）
        if (!window.history.pushState.isHooked) {
            setupHistoryListener();
            // フック済みフラグを設定し、二重フックを防ぐ
            window.history.pushState.isHooked = true;
        }

        // 初回ロード時にURLが /reception/ であれば即座に起動
        if (window.location.href.startsWith(RECEPTION_URL_PREFIX)) {
            console.log("Colorizer: 初回ロード時、receptionページです。処理を開始します。");
            checkAndStart();
        } else {
            console.log("Colorizer: 初回ロード時、receptionページではありません。次の遷移を待ちます。");
        }
    }


    // 起動：関数を直接呼び出す（UserScriptの初期ロード時）
    startScript();

})();