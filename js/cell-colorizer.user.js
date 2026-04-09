// ==UserScript==
// @name セル塗り分け
// @namespace http://tampermonkey.net/
// @version 4.4
// @description 発熱外来対応　川口子ども、一人親 医療費対応。
// @author Tsuyoshi Ohnishi
// @match https://digikar.jp/*
// @run-at document-idle
// @updateURL https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/cell-colorizer.user.js
// @downloadURL https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/cell-colorizer.user.js
// ==/UserScript==

// ======================================================================
// 【更新履歴】
// v4.3.2: Git運用と自動配信対応(英字ファイル名リネーム・最適化初版)
//         10台以上のPCへの配信最適化のため、メタデータにアップデートURLを付与。
// ======================================================================

(function() {
    'use strict';

    // ======================================================================
    // 【1】カスタマイズ箇所：固定配色リスト（医師名の色付け）
    // ======================================================================
    const FIXED_DOCTORS = {
        // "医師名 (完全一致)": { background: "背景色 (CSSコード)", color: "文字色 (CSSコード)" }
        "大西　剛史": { background: "#F0F8FF", color: "black" },      // アリスブルー (非常に淡い青)
        "伊東　雅記": { background: "#F0FFF0", color: "black" }      // アイボリーグリーン (非常に淡い緑)
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

    // テーブル内のセルのインデックス定義（0からカウント）
    const FIRST_CELL_INDEX = 0;       // 1列目 (受付番号)
    const AGE_CELL_INDEX = 7;         // 8列目 (年齢)
    const INSURANCE_CELL_INDEX = 8;   // 9列目 (保険)
    const DEPT_CELL_INDEX = 9;        // 10列目 (診療科)
    const DOCTOR_CELL_INDEX = 10;     // 11列目 (医師名)
    const MEMO_CELL_INDEX = 13;       // 14列目 (受付メモ)

    // 全行のセル数 (14列目まで)
    const TOTAL_CELLS_COUNT = MEMO_CELL_INDEX + 1;


    let colorMap = {};
    let toastTimeout; // トーストタイマーのIDを保持
    let toastDelayTimer = null; // エラー予約タイマーのIDを保持

    let observer; // テーブルの変更を監視するObserver
    let isObserverInitialized = false; // Observerが初期化されたかを示すフラグ

    // --- トースト通知機能 ---

    /**
     * 画面下部にトースト通知を表示します。
     * @param {string} message - 表示するメッセージ
     */
    function showToast(message) {
        // 既存のトーストがあれば削除し、タイマーをリセット
        const existingToast = document.getElementById('digikar-colorizer-toast');
        if (existingToast) {
            existingToast.remove();
            clearTimeout(toastTimeout);
        }

        const toast = document.createElement('div');
        toast.id = 'digikar-colorizer-toast';
        toast.textContent = `[Colorizerエラー] ${message}`;

        // CSSスタイルを適用
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: 'rgba(255, 60, 60, 0.9)', // 赤系の警告色
            color: 'white',
            padding: '12px 20px',
            borderRadius: '5px',
            fontSize: '14px',
            zIndex: '99999',
            transition: 'opacity 0.5s ease-in-out',
            opacity: '1',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
        });

        document.body.appendChild(toast);

        // 5秒後にフェードアウトして削除
        toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500); // フェードアウト後にDOMから削除
        }, 5000);
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

    const isCorrectDept = (deptText.includes("小児科") || deptText.includes("自由診療")|| deptText.includes("皮膚科"));

    // 15歳未満 AND 適切な診療科ではない場合に警告
    return !isCorrectDept;
}

    function collectUniqueDoctorNames() {
        const uniqueDoctors = new Set();
        const rows = document.querySelectorAll(`${TABLE_SELECTOR} tbody tr`);
        rows.forEach(row => {
            const allTargetCells = row.querySelectorAll(`td`);

            const doctorCell = allTargetCells[DOCTOR_CELL_INDEX];
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

            // 受付メモ (14列目/インデックス13) まで存在するかチェック
            if (allTargetCells.length < TOTAL_CELLS_COUNT) return;

            // 正常に処理できる行としてカウント
            rowsProcessedCount++;

            // 必須セルを取得
            const ageCell = allTargetCells[AGE_CELL_INDEX];
            const doctorCell = allTargetCells[DOCTOR_CELL_INDEX];
            const deptCell = allTargetCells[DEPT_CELL_INDEX];
            const insuranceCell = allTargetCells[INSURANCE_CELL_INDEX];
            const memoCell = allTargetCells[MEMO_CELL_INDEX];

            // 情報を取得する際には、input/selectの値を優先的に読むように変更
            const ageText = extractCellText(ageCell);
            const deptText = extractCellText(deptCell);
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
            // 2. 行全体のベース色付け (オンライン・発熱外来)
            // ======================================================================
            const isOnlineMemo = memoText.includes("オンライン");
            const isFeverClinic = memoText.includes("発熱外来");

            let rowStyle = null;
            if (isOnlineMemo) rowStyle = ONLINE_MEMO_STYLE;
            if (isFeverClinic) rowStyle = FEVER_CLINIC_STYLE; // 発熱外来を優先（必要に応じて順序を入れ替えてください）

            if (rowStyle) {
                for (let i = 0; i < TOTAL_CELLS_COUNT; i++) {
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

            if (isDeptWarningNeeded) {
                // 10列目（診療科）に警告色を適用 (オンラインの色を上書き)
                deptCell.style.setProperty('background-color', WARNING_STYLE.background);
                deptCell.style.setProperty('color', WARNING_STYLE.color);
            }

            // --- 8th Column (Age) Logic ---
            if (isMinorInAdultDeptWarning) {
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
            // 18歳以下、かつ「自由診療」ではない場合に、公費入力があるかチェック
            const isMinorWithoutChildInsuranceWarning =
                  !deptText.includes("自由診療") &&
                  age <= 18 &&
                  !hasPublicExpense;

            // 9列目に色を付ける必要があるかどうかの判定
            const isInsuranceCellStyleNeeded =
                  (insuranceText === "保険無し" && !deptText.includes("自由診療")) || // 保険入力漏れ　検知
                  (insuranceText !== "保険無し" && deptText.includes("自由診療")) ||  // 自費保険入力　検知
                  isMinorWithoutChildInsuranceWarning;

            if (isInsuranceCellStyleNeeded) {
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

            if (style) {
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

        // 8列目 (年齢) - 通常のテキスト入力 or テキスト表示
        const ageCell = row.querySelectorAll('td')[AGE_CELL_INDEX];
        // 9列目 (保険) - テキスト入力 or テキスト表示
        const insuranceCell = row.querySelectorAll('td')[INSURANCE_CELL_INDEX];
        // 10列目 (診療科) - ドロップダウン (select)
        const deptCell = row.querySelectorAll('td')[DEPT_CELL_INDEX];
        // 14列目 (受付メモ) - テキストエリア (textarea)
        const memoCell = row.querySelectorAll('td')[MEMO_CELL_INDEX];

        // 年齢（inputまたはテキスト表示）
        const ageInput = ageCell ? ageCell.querySelector('input') : null;
        if (ageInput) elementsToWatch.push(ageInput);

        // 保険（inputまたはテキスト表示）
        const insuranceInput = insuranceCell ? insuranceCell.querySelector('input') : null;
        if (insuranceInput) elementsToWatch.push(insuranceInput);

        // 診療科（select）
        const deptSelect = deptCell ? deptCell.querySelector('select') : null;
        if (deptSelect) elementsToWatch.push(deptSelect);

        // メモ（textarea）
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
        history.pushState = function() {
            originalPushState.apply(history, arguments);
            // pushStateの後に非同期で処理を呼び出す
            setTimeout(urlChanged, 0);
        };

        // history.replaceStateを上書き
        history.replaceState = function() {
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