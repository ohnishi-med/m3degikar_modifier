// ==UserScript==
// @name         デジカルBML送信完了検知
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  「送信」完了後、右側のBMLボタンの色のみを変える（1回:黄、2回以上:赤）
// @author       Gemini
// @match        https://digikar.jp/karte/patients/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/bml-submit-detector.user.js
// @downloadURL  https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/bml-submit-detector.user.js
// ==/UserScript==

// ======================================================================
// 【更新履歴】
// v2.4: Git運用と自動配信対応(英字ファイル名リネーム・最適化初版)
//       10台以上のPCへの配信最適化のため、メタデータにアップデートURLを付与。
// v2.5: 会計送信等での誤作動を防止するため、BML送信特有のダイアログメッセージ検知を追加。
// v2.6: 3回目以降の送信時、ボタン右上に青文字で回数バッジを表示するよう対応。
// ======================================================================

(function () {
    'use strict';

    // 送信完了回数を記録
    let bmlCompleteCount = 0;

    // ターゲットのBMLボタン（緑色・顕微鏡アイコン）を特定
    const getBmlButton = () => {
        const buttons = document.querySelectorAll('button.css-1jg2kh3[data-variant="primary"]');
        for (let btn of buttons) {
            // アイコンのSVGパスでBMLボタンであることを特定
            if (btn.innerHTML.includes('M17.75 20v-2.25h-3A2.25')) {
                return btn;
            }
        }
        return null;
    };

    // 見た目を更新する関数
    const updateStyle = () => {
        const btn = getBmlButton();
        if (!btn || bmlCompleteCount === 0) return;

        // 子要素の絶対配置のため、ボタン自体をrelativeにする
        if (window.getComputedStyle(btn).position === 'static') {
            btn.style.position = 'relative';
        }

        if (bmlCompleteCount === 1) {
            // 1回送信済み：黄色
            btn.style.setProperty('background-color', '#FFD700', 'important');
            btn.style.setProperty('color', '#000', 'important');
        } else if (bmlCompleteCount >= 2) {
            // 2回以上送信済み：赤色
            btn.style.setProperty('background-color', '#FF4500', 'important');
            btn.style.setProperty('color', '#fff', 'important');
            
            if (bmlCompleteCount >= 3) {
                // 3回目以降：右上に回数バッジを表示
                let badge = btn.querySelector('.bml-count-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'bml-count-badge';
                    Object.assign(badge.style, {
                        position: 'absolute',
                        top: '2px',
                        right: '4px',
                        color: '#1a73e8', // 視認性の良い青色
                        fontSize: '14px',
                        fontWeight: 'bold',
                        lineHeight: '1',
                        zIndex: '10'
                    });
                    btn.appendChild(badge);
                }
                badge.textContent = bmlCompleteCount;
            }
        }
    };

    // クリックイベントの監視
    document.addEventListener('click', function (e) {
        // ダイアログ内の「送信」ボタンが押されたときのみカウントアップ
        if (e.target.tagName === 'BUTTON' && e.target.textContent.trim() === '送信') {
            // ダイアログ内にBML専用のメッセージが含まれるかチェック
            if (document.body.innerText.includes('カルテの検査内容を依頼送信しますか？')) {
                bmlCompleteCount++;
                // ダイアログが閉じるのを待って反映
                setTimeout(updateStyle, 500);
            }
        }
    }, true);

    // 画面の再描画（カルテの切り替えなど）を監視して色を維持
    const observer = new MutationObserver(() => {
        if (bmlCompleteCount > 0) {
            updateStyle();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();