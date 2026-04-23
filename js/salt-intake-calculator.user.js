// ==UserScript==
// @name         推定塩分摂取量計算プログラム
// @namespace    http://tampermonkey.net/
// @version      1.3.1
// @description  M3デジカルの検査結果から推定塩分摂取量をボタン一つで計算・登録します
// @author       TsuyoshiOhnishi
// @match        https://*.digikar.jp/*
// @grant        none
// @updateURL    https://github.com/ohnishi-med/m3degikar_modifier/raw/main/js/salt-intake-calculator.user.js
// @downloadURL  https://github.com/ohnishi-med/m3degikar_modifier/raw/main/js/salt-intake-calculator.user.js
// ==/UserScript==

(function () {
    'use strict';

    // icons8-塩-96.png を元にしたSVGアイコン
    const SALT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12 2c-2.21 0-4 1.79-4 4v1.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6c0-2.21-1.79-4-4-4zm-1.5 2a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1zm1.5 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1zm1.5 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1z"/>
        <path fill="currentColor" d="M8.5 9.5l-.5 10.5c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2l-.5-10.5h-7z"/>
        <path fill="white" d="M11.5 13.5c0-.28.22-.5.5-.5h.5c.28 0 .5.22.5.5v.5c0 .28-.22.5-.5.5h-.5c-.28 0-.5.22-.5.5v.5c0 .28.22.5.5.5h1.5v1h-1.5c-.83 0-1.5-.67-1.5-1.5v-.5c0-.28.22-.5.5-.5h.5c.28 0 .5-.22.5-.5v-.5c0-.28-.22-.5-.5-.5h-.5c-.28 0-.5-.22-.5-.5v-.5z"/>
    </svg>`;

    function setNativeValue(element, value) {
        const { set: valueSetter } = Object.getOwnPropertyDescriptor(element, 'value') || {};
        const prototype = Object.getPrototypeOf(element);
        const { set: prototypeValueSetter } = Object.getOwnPropertyDescriptor(prototype, 'value') || {};

        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
            valueSetter.call(element, value);
        } else {
            element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function extractData() {
        const soap = document.querySelector('.ProseMirror')?.innerText || '';
        const height = (soap.match(/【身長】\s*(\d+(\.\d+)?)cm/) || [])[1];
        const weightMatches = [...soap.matchAll(/(\d+\/\d+)\s*(\d+(\.\d+)?)kg/g)];
        const weight = weightMatches.length > 0 ? weightMatches[weightMatches.length - 1][2] : null;

        const bodyText = document.body.innerText.substring(0, 10000);
        const age = (bodyText.match(/(\d+)歳/) || [])[1];
        const gender = bodyText.includes('女') ? 'female' : 'male';

        let uNa = null, uCr = null;
        document.querySelectorAll('tr').forEach(row => {
            if (row.cells.length < 2) return;
            const t = row.cells[0].innerText;
            if (t.includes('Ｎａ－尿')) uNa = parseFloat(row.cells[row.cells.length - 1].innerText);
            if (t.includes('クレアチニン－尿')) uCr = parseFloat(row.cells[row.cells.length - 1].innerText);
        });

        return { age: parseInt(age), gender, height: parseFloat(height), weight: parseFloat(weight), uNa, uCr };
    }

    function calculate(d) {
        if (!d.age || !d.weight || !d.height || !d.uNa || !d.uCr) return null;
        const uCr_mgdl = d.uCr * 100;
        const uNa_meql = (d.uNa / 23) * 1000;

        const est_ucr_t = -2.04 * d.age + 14.89 * d.weight + 16.14 * d.height - 2244.45;
        const salt_t = (21.98 * Math.pow((uNa_meql / (uCr_mgdl * 10) * est_ucr_t), 0.392)) / 17;

        const est_ucr_k = (d.gender === 'female') ?
            (8.58 * d.weight + 5.09 * d.height - 4.79 * d.age - 67.0) :
            (15.12 * d.weight + 7.39 * d.height - 12.63 * d.age - 79.9);
        const X = (uNa_meql / (uCr_mgdl * 10)) * est_ucr_k;
        const salt_k = (16.3 * Math.sqrt(X)) / 17;

        return { tanaka: salt_t.toFixed(1), kawasaki: salt_k.toFixed(1) };
    }

    const modal = document.createElement('div');
    modal.id = 'salt-modal';
    Object.assign(modal.style, {
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '300px', background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(15px)',
        borderRadius: '20px', padding: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        zIndex: '10001', display: 'none', textAlign: 'center', fontFamily: 'sans-serif'
    });
    document.body.appendChild(modal);

    async function runCalculation() {
        console.log('推定塩分計算: 処理開始');
        const labTab = Array.from(document.querySelectorAll('li')).find(li => 
            li.innerText.trim() === '検査結果' || 
            Array.from(li.querySelectorAll('span')).some(s => s.innerText.trim() === '検査結果')
        );

        if (labTab) {
            const events = ['mousedown', 'mouseup', 'click'];
            events.forEach(type => {
                const event = new MouseEvent(type, { bubbles: true, cancelable: true, view: window });
                labTab.dispatchEvent(event);
                const span = labTab.querySelector('span');
                if (span) span.dispatchEvent(event);
            });
            await new Promise(r => setTimeout(r, 1000));
        }

        const data = extractData();
        const res = calculate(data);

        if (!res) {
            alert('計算に必要なデータ（年齢・身長・体重・尿中Na/Cr）が不足しています。');
            return;
        }

        modal.style.display = 'block';
        modal.innerHTML = `
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 20px;">推定塩分摂取量</div>
            <div style="margin-bottom: 15px; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 10px;">
                <div style="font-size: 12px; color: #666;">田中式</div>
                <div style="font-size: 24px; font-weight: bold;">${res.tanaka} <small>g/日</small></div>
            </div>
            <div style="margin-bottom: 25px; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 10px;">
                <div style="font-size: 12px; color: #666;">川崎式</div>
                <div style="font-size: 24px; font-weight: bold;">${res.kawasaki} <small>g/日</small></div>
            </div>
            <button id="do-reg" style="width: 100%; padding: 12px; background: #27ae60; color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; margin-bottom: 10px;">M3に登録</button>
            <button id="close-modal" style="background: none; border: none; color: #666; cursor: pointer;">閉じる</button>
        `;

        document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
        document.getElementById('do-reg').onclick = async () => {
            const regBtn = document.getElementById('do-reg');
            regBtn.innerText = '登録中...';
            regBtn.disabled = true;

            try {
                const add = Array.from(document.querySelectorAll('button.css-1nnxsgs')).find(b => {
                    const path = b.querySelector('path');
                    return path && path.getAttribute('d') === 'M13 11h9v2h-9v9h-2v-9H2v-2h9V2h2z';
                });
                
                if (!add) throw new Error('「追加（＋）」ボタンが見つかりません');
                add.click();
                await new Promise(r => setTimeout(r, 1000));

                const scrollContainer = document.querySelector('div[data-scroll="on"]');
                if (!scrollContainer) throw new Error('スクロールエリアが見つかりません');

                let filled = { tanaka: false, kawasaki: false };
                for (let i = 0; i < 15; i++) {
                    const rows = document.querySelectorAll('.css-1azcrm');
                    rows.forEach(row => {
                        const label = row.querySelector('label');
                        if (!label) return;
                        const text = label.innerText;
                        const input = row.querySelector('input');
                        if (!input) return;

                        if (text.includes('田中式') && !filled.tanaka) {
                            input.focus();
                            setNativeValue(input, res.tanaka);
                            filled.tanaka = true;
                        } else if (text.includes('川崎式') && !filled.kawasaki) {
                            input.focus();
                            setNativeValue(input, res.kawasaki);
                            filled.kawasaki = true;
                        }
                    });
                    if (filled.tanaka && filled.kawasaki) break;
                    scrollContainer.scrollTop += 300;
                    await new Promise(r => setTimeout(r, 300));
                }

                if (filled.tanaka || filled.kawasaki) {
                    await new Promise(r => setTimeout(r, 800));
                    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => {
                        const txt = b.innerText.trim();
                        return txt === '登録' || txt === '確定' || txt === '更新';
                    });
                    if (saveBtn) {
                        saveBtn.click();
                        modal.style.display = 'none';
                    }
                }
            } catch (e) { alert(e.message); }
            regBtn.disabled = false;
            regBtn.innerText = 'M3に登録';
        };
    }

    function injectButton() {
        if (document.getElementById('salt-intake-btn')) return;

        const toolbar = document.querySelector('.css-12mbokh');
        if (!toolbar) return;

        const btnSpan = document.createElement('span');
        btnSpan.id = 'salt-intake-btn';
        btnSpan.className = 'css-lbdnvw';
        btnSpan.setAttribute('data-state', 'closed');
        btnSpan.title = '推定塩分摂取量計算';

        const button = document.createElement('button');
        button.className = 'css-1nnxsgs css-1jg2kh3';
        button.type = 'button';
        button.setAttribute('data-size', 'xl');
        button.setAttribute('data-variant', 'primary');
        
        const innerSpan = document.createElement('span');
        innerSpan.className = 'css-1f2tk15';
        innerSpan.innerHTML = SALT_ICON_SVG;

        button.appendChild(innerSpan);
        btnSpan.appendChild(button);

        // 顕微鏡アイコン（2番目のボタン）の後ろに挿入
        const microscope = toolbar.children[1];
        if (microscope) {
            toolbar.insertBefore(btnSpan, microscope.nextSibling);
        } else {
            toolbar.appendChild(btnSpan);
        }

        button.onclick = runCalculation;
        console.log('推定塩分ボタンをツールバーにインジェクションしました');
    }

    // 常駐監視：ツールバーが消えたり再描画されたら再インジェクション
    const observer = new MutationObserver(() => {
        injectButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // 初期化の遅延実行
    if (document.readyState === 'complete') {
        setTimeout(injectButton, 2000);
    } else {
        window.addEventListener('load', () => setTimeout(injectButton, 2000));
    }
})();
