// ==UserScript==
// @name         推定塩分摂取量計算プログラム
// @namespace    http://tampermonkey.net/
// @version      1.1.2
// @description  M3デジカルの検査結果から推定塩分摂取量をボタン一つで計算・登録します
// @author       TsuyoshiOhnishi
// @match        https://*.digikar.jp/*
// @grant        none
// @updateURL    https://github.com/ohnishi-med/m3degikar_modifier/raw/main/js/salt-intake-calculator.user.js
// @downloadURL  https://github.com/ohnishi-med/m3degikar_modifier/raw/main/js/salt-intake-calculator.user.js
// ==/UserScript==

(function () {
    'use strict';

    /**
     * データ抽出関数群
     */
    function extractData() {
        // SOAPから身長・体重
        const soap = document.querySelector('.ProseMirror')?.innerText || '';
        const height = (soap.match(/【身長】\s*(\d+(\.\d+)?)cm/) || [])[1];
        const weightMatches = [...soap.matchAll(/(\d+\/\d+)\s*(\d+(\.\d+)?)kg/g)];
        const weight = weightMatches.length > 0 ? weightMatches[weightMatches.length - 1][2] : null;

        // ヘッダーから年齢・性別
        const bodyText = document.body.innerText.substring(0, 10000);
        const age = (bodyText.match(/(\d+)歳/) || [])[1];
        const gender = bodyText.includes('女') ? 'female' : 'male';

        // 検査テーブルからNa/Cr
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

    /**
     * UI構築
     */
    const initUI = () => {
        // 起動ボタン
        const trigger = document.createElement('div');
        trigger.id = 'salt-trigger';
        trigger.innerText = '推定塩分計算';
        Object.assign(trigger.style, {
            position: 'fixed', bottom: '20px', right: '20px', padding: '10px 20px',
            background: '#2c3e50', color: 'white', borderRadius: '30px', cursor: 'pointer',
            zIndex: '10000', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
            transition: 'transform 0.2s'
        });
        trigger.onmouseover = () => trigger.style.transform = 'scale(1.05)';
        trigger.onmouseout = () => trigger.style.transform = 'scale(1)';
        document.body.appendChild(trigger);

        // 結果モーダル
        const modal = document.createElement('div');
        modal.id = 'salt-modal';
        Object.assign(modal.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '300px', background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(15px)',
            borderRadius: '20px', padding: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            zIndex: '10001', display: 'none', textAlign: 'center', fontFamily: 'sans-serif'
        });
        document.body.appendChild(modal);

        trigger.onclick = async () => {
            console.log('推定塩分計算: 処理開始');
            
            // 1. 「検査結果」タブを探してクリック
            const labTab = Array.from(document.querySelectorAll('li')).find(li => 
                li.innerText.trim() === '検査結果' || 
                Array.from(li.querySelectorAll('span')).some(s => s.innerText.trim() === '検査結果')
            );

            if (labTab) {
                console.log('検査結果タブを発見:', labTab);
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
                let missing = [];
                if (!data.age) missing.push("年齢");
                if (!data.height) missing.push("身長");
                if (!data.weight) missing.push("体重");
                if (!data.uNa) missing.push("尿中Na");
                if (!data.uCr) missing.push("尿中Cr");
                alert('データが足りません: ' + missing.join(', '));
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
                    const add = document.querySelector('button.css-1nnxsgs');
                    if (!add) throw new Error('追加ボタンが見つかりません');
                    add.click();
                    await new Promise(r => setTimeout(r, 600));

                    const inputs = document.querySelectorAll('input.css-xxqb9b');
                    let target = null;
                    inputs.forEach(i => { if (i.closest('div')?.innerText.includes('塩分摂取量')) target = i; });

                    if (target) {
                        target.value = res.tanaka;
                        target.dispatchEvent(new Event('input', { bubbles: true }));
                        const save = Array.from(document.querySelectorAll('button')).find(b => b.innerText === '登録');
                        if (save) save.click();
                        modal.style.display = 'none';
                        alert('登録しました');
                    }
                } catch (e) { alert(e.message); }
                regBtn.disabled = false;
                regBtn.innerText = 'M3に登録';
            };
        };
    };

    // 初期化（少し待ってから実行）
    setTimeout(initUI, 2000);
})();
