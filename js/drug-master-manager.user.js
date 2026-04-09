// ==UserScript==
// @name         採用薬マスター管理ツール
// @match        https://*.digikar.jp/*
// @grant        GM_xmlhttpRequest
// @author       Tsuyoshi Ohnishi
// @version      1.7
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/drug-master-manager.user.js
// @downloadURL  https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/drug-master-manager.user.js
// ==/UserScript==

// ======================================================================
// 【更新履歴】
// v1.1: Git運用と自動配信対応(英字ファイル名リネーム・最適化初版)
//       10台以上のPCへの配信最適化のため、メタデータにアップデートURLを付与。
//       採用薬のオプティミスティックUI反映（タイムラグ解消）を追加。
// v1.2: 作者情報の統一。
// v1.3: 「カプセル」等の一般名詞がマスター登録された際、すべてのカプセル剤が部分一致で採用扱いになるバグを修正。
// v1.6: バージョン1.3の安定版をベースに、「セット」タブでのみ動作を許可する処理を安全に追加。
// v1.7: カルテ（中央パネル）内で入力済みの薬剤のカラーリング機能を追加。あわせてセットタブの安全なカラーリング（ボタン非表示）を実装。
// ======================================================================

(function () {
    'use strict';

    const GAS_URL = "https://script.google.com/macros/s/AKfycbxgFjQwg_OKRyN4jRkh5nl9UsicvvNu3_hcdUtMLGEJ8Gx4WagzyXZ1sTetlXgHrTxZSQ/exec";
    let saiyoMaster = [];

    function normalize(str) {
        if (!str) return "";
        let norm = str
            .replace(/[！-～]/g, function (s) {
                return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
            })
            .replace(/[\s　\u00A0\u3000]+/g, '')
            .replace(/[ー－―ー-]/g, '-')
            .replace(/[（）()「」『』【】[\]]/g, '')
            .toLowerCase()
            .trim();
        
        // 【般】などのマーカー文字が外れた後の「般」「局」等を前方から取り除き、照合精度を上げる
        return norm.replace(/^(般|局|麻|劇|毒)/, '');
    }

    const fetchMaster = () => {
        GM_xmlhttpRequest({
            method: "GET",
            url: GAS_URL,
            onload: function (res) {
                try {
                    saiyoMaster = JSON.parse(res.responseText).map(name => normalize(name));
                } catch (e) { }
            }
        });
    };

    fetchMaster();

    const isSaiyoMatch = (rawText) => {
        const screenName = normalize(rawText);
        if(!screenName) return false;
        return saiyoMaster.some(masterItem => {
            if (!masterItem) return false;
            // 1. 完全一致なら採用
            if (screenName === masterItem) return true;
            // 2. カプセル等の短い単語は前方一致のみ
            if (masterItem.length <= 4) {
                return screenName.startsWith(masterItem) || masterItem.startsWith(screenName);
            }
            // 3. 5文字以上は部分一致許容
            return screenName.includes(masterItem) || masterItem.includes(screenName);
        });
    };

    const updateUI = () => {
        // --- 1. タブの状態判定（右パネル用） ---
        const tabs = document.querySelectorAll('li');
        let isTouyakuActive = false;
        let isSetActive = false;
        tabs.forEach(tab => {
            const text = tab.innerText.trim();
            const bgColor = window.getComputedStyle(tab).backgroundColor;
            const isActive = !bgColor.includes("255, 255, 255") && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent";
            if (text === "投薬" && isActive) isTouyakuActive = true;
            if (text === "セット" && isActive) isSetActive = true;
        });

        // --- 2. 投薬タブ（右パネル）：カラーリング ＆ 「採用」ボタン表示 ---
        if (isTouyakuActive) {
            document.querySelectorAll('a.css-cgnoip').forEach(row => {
                const drugIcon = row.querySelector('[data-treatment-item-type="medication_drug"]');
                if (!drugIcon || row.dataset.processedTouyaku === "true") return;

                const nameSpans = row.querySelectorAll('span.css-q5yng0');
                let allSaiyo = true;

                nameSpans.forEach(span => {
                    const rawName = span.innerText;
                    if (isSaiyoMatch(rawName)) {
                        span.style.fontWeight = "bold";
                    } else {
                        allSaiyo = false;
                        if (!span.querySelector('.saiyo-reg-btn')) {
                            const btn = document.createElement('button');
                            btn.innerText = '採用';
                            btn.className = 'saiyo-reg-btn';
                            btn.style = "margin-left:10px;padding:2px 8px;background-color:#ff9800;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;opacity:1 !important;vertical-align:middle;";

                            btn.onclick = (e) => {
                                e.preventDefault(); e.stopPropagation();
                                if (confirm(`「${rawName}」を採用登録しますか？`)) {
                                    btn.innerText = '..';
                                    GM_xmlhttpRequest({
                                        method: "POST",
                                        url: GAS_URL,
                                        data: JSON.stringify({ name: rawName }),
                                        onload: function (res) {
                                            const result = JSON.parse(res.responseText);
                                            if (result.status === "success") {
                                                const normName = normalize(rawName);
                                                if (!saiyoMaster.includes(normName)) {
                                                    saiyoMaster.push(normName);
                                                }
                                                document.querySelectorAll('[data-processed-touyaku="true"]').forEach(r => {
                                                    delete r.dataset.processedTouyaku;
                                                });
                                                updateUI();
                                                fetchMaster();
                                            } else {
                                                alert("照合失敗\n送信名: " + result.debug.targetNorm);
                                                btn.innerText = '採用';
                                            }
                                        }
                                    });
                                }
                            };
                            span.appendChild(btn);
                        }
                    }
                });

                if (allSaiyo) {
                    row.style.backgroundColor = "#e0f2f1"; // ミントグリーン
                    row.style.borderLeft = "8px solid #009688";
                    row.style.opacity = "1";
                } else {
                    row.style.backgroundColor = "";
                    row.style.borderLeft = "";
                    row.style.opacity = "0.6"; // 未採用があれば薄くする
                }
                row.dataset.processedTouyaku = "true";
            });
        } else {
            // 投薬タブ以外になった時は、追加したボタンやスタイルをリセットする
            document.querySelectorAll('a.css-cgnoip[data-processed-touyaku="true"]').forEach(row => {
                row.style.backgroundColor = ""; row.style.borderLeft = ""; row.style.opacity = "";
                row.querySelectorAll('.saiyo-reg-btn').forEach(b => b.remove());
                row.querySelectorAll('span[style*="bold"]').forEach(s => s.style.fontWeight = "");
                delete row.dataset.processedTouyaku;
            });
        }

        // --- 3. セットタブ（右パネル）：カラーリングのみ（ボタン追加なしで安全） ---
        if (isSetActive) {
            document.querySelectorAll('span.css-q5yng0').forEach(span => {
                if (span.dataset.processedSet === "true") return;
                
                if (isSaiyoMatch(span.innerText)) {
                    span.style.fontWeight = "bold";
                    span.style.backgroundColor = "#e0f2f1"; // 背景ミントグリーン
                    span.style.borderLeft = "4px solid #009688";
                    span.style.paddingLeft = "4px";
                    span.style.borderRadius = "2px";
                }
                span.dataset.processedSet = "true";
            });
        } else {
            // セットタブ以外になった時はリセット
            document.querySelectorAll('span[data-processed-set="true"]').forEach(span => {
                span.style.fontWeight = "";
                span.style.backgroundColor = "";
                span.style.borderLeft = "";
                span.style.paddingLeft = "";
                span.style.borderRadius = "";
                delete span.dataset.processedSet;
            });
        }

        // --- 4. カルテ画面中央パネル：採用薬をカラーリング ---
        // タブの状態に関わらず常に実行する
        const karteRows = document.querySelectorAll('tr.dk-karte-treatment-group-item');
        karteRows.forEach(row => {
            if (row.dataset.processedKarte === "true") return;

            const drugIcon = row.querySelector('[data-treatment-item-type="medication_drug"]');
            if (!drugIcon) return; // 薬以外はスキップ

            const tds = row.querySelectorAll('td.dk-table-karte-cont');
            let nameTd = null;
            let firstTd = tds[0];
            // 薬アイコンが入っているセルの、1つ右のセルが「薬名」
            for (let i = 0; i < tds.length; i++) {
                if (tds[i].contains(drugIcon)) {
                    if (tds[i + 1]) nameTd = tds[i + 1];
                    break;
                }
            }
            if (!nameTd) return;

            // 薬名セルのテキストを抽出し、子要素（svg等）の表示文字を除外して純粋なテキストを取得
            const rawName = nameTd.innerText;
            if (isSaiyoMatch(rawName)) {
                // 採用薬の場合は行の背景色のみ変更（左ボーダーは追加しない）
                row.style.backgroundColor = "#e0f2f1"; // 薄いミントグリーン
                nameTd.style.fontWeight = "bold";
            }
            row.dataset.processedKarte = "true";
        });
    };

    const observer = new MutationObserver(updateUI);
    observer.observe(document.body, { childList: true, subtree: true });
})();