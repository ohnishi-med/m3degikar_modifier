// ==UserScript==
// @name         採用薬マスター管理ツール
// @match        https://*.digikar.jp/*
// @grant        GM_xmlhttpRequest
// @author       Tsuyoshi Ohnishi
// @version      1.6
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

    const updateUI = () => {
        // 1. 「投薬」または「セット」タブがアクティブかチェック
        const tabs = document.querySelectorAll('li');
        let isTargetTabActive = false;
        tabs.forEach(tab => {
            const tabText = tab.innerText.trim();
            if (tabText === "投薬" || tabText === "セット") {
                const style = window.getComputedStyle(tab);
                const bgColor = style.backgroundColor;
                if (!bgColor.includes("255, 255, 255") && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
                    isTargetTabActive = true;
                }
            }
        });

        // 非アクティブ時はリセットして終了（診察タブなどでの表示防止）
        if (!isTargetTabActive) {
            document.querySelectorAll('a.css-cgnoip[data-processed="true"]').forEach(row => {
                row.style.backgroundColor = ""; row.style.borderLeft = ""; row.style.opacity = "";
                row.querySelectorAll('.saiyo-reg-btn').forEach(b => b.remove());
                delete row.dataset.processed;
            });
            return;
        }

        const rows = document.querySelectorAll('a.css-cgnoip');
        rows.forEach(row => {
            // 薬アイコンがない行はスキップ
            const drugIcon = row.querySelector('[data-treatment-item-type="medication_drug"]');
            if (!drugIcon || row.dataset.processed === "true") return;

            const nameSpans = row.querySelectorAll('span.css-q5yng0');
            let allSaiyo = true;

            nameSpans.forEach(span => {
                const rawName = span.innerText;
                const screenName = normalize(rawName);

                // 部分一致判定 (誤判定回避フィルター付き)
                const isSaiyo = saiyoMaster.some(masterItem => {
                    if (!masterItem) return false;
                    
                    // 1. 完全一致なら採用
                    if (screenName === masterItem) return true;
                    
                    // 2. マスター側に「カプセル」(4文字以下)などが登録されている場合、
                    // 「エソメプラゾールカプセル」の後半に部分一致して誤判定するのを防ぐため、
                    // 4文字以下の短い単語の場合は「前方一致のみ」を許可する
                    if (masterItem.length <= 4) {
                        return screenName.startsWith(masterItem) || masterItem.startsWith(screenName);
                    }

                    // 3. 5文字以上であれば、従来通り部分一致も許容
                    return screenName.includes(masterItem) || masterItem.includes(screenName);
                });

                if (isSaiyo) {
                    span.style.fontWeight = "bold";
                } else {
                    allSaiyo = false;
                    // 未採用の薬の横にだけボタンを出す
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
                                            // オプティミスティックUI: ローカルのマスタに即座に追加
                                            const normName = normalize(rawName);
                                            if (!saiyoMaster.includes(normName)) {
                                                saiyoMaster.push(normName);
                                            }

                                            // 画面上の全要素の処理済みフラグをリセットし、即時描画
                                            document.querySelectorAll('a.css-cgnoip[data-processed="true"]').forEach(r => {
                                                delete r.dataset.processed;
                                            });
                                            updateUI();

                                            fetchMaster();
                                        } else {
                                            let msg = `照合失敗\n送信名(正規化): ${result.debug.targetNorm}\n`;
                                            msg += `マスタ生データ例: [${result.debug.masterRawSample}]\n`;
                                            msg += `マスタ正規化例: ${result.debug.masterNormSample}`;
                                            alert(msg);
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

            // --- デザインの適用（以前のスタイルを復刻） ---
            if (allSaiyo) {
                row.style.backgroundColor = "#e0f2f1"; // ミントグリーン
                row.style.borderLeft = "8px solid #009688"; // 左側の太線
                row.style.opacity = "1";
            } else {
                row.style.backgroundColor = "";
                row.style.borderLeft = "";
                row.style.opacity = "0.6"; // 未採用があれば行全体を薄く
            }
            row.dataset.processed = "true";
        });
    };

    const observer = new MutationObserver(updateUI);
    observer.observe(document.body, { childList: true, subtree: true });
})();