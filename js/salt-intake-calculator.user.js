// ==UserScript==
// @name         推定塩分摂取量計算プログラム
// @namespace    http://tampermonkey.net/
// @version      1.5.1
// @description  M3デジカルから推定塩分摂取量、およびFENa/FEUn/FECaの計算を行います
// @author       TsuyoshiOhnishi / Antigravity
// @match        https://*.digikar.jp/*
// @grant        GM_xmlhttpRequest
// @updateURL    https://github.com/ohnishi-med/m3degikar_modifier/raw/main/js/salt-intake-calculator.user.js
// @downloadURL  https://github.com/ohnishi-med/m3degikar_modifier/raw/main/js/salt-intake-calculator.user.js
// ==/UserScript==

(function () {
    'use strict';

    const SALT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12 2c-2.21 0-4 1.79-4 4v1.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6c0-2.21-1.79-4-4-4zm-1.5 2a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1zm1.5 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1zm1.5 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1z"/>
        <path fill="currentColor" d="M8.5 9.5l-.5 10.5c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2l-.5-10.5h-7z"/>
        <path fill="white" d="M11.5 13.5c0-.28.22-.5.5-.5h.5c.28 0 .5.22.5.5v.5c0 .28-.22.5-.5.5h-.5c-.28 0-.5.22-.5.5v.5c0 .28.22.5.5.5h1.5v1h-1.5c-.83 0-1.5-.67-1.5-1.5v-.5c0-.28.22-.5.5-.5h.5c.28 0 .5-.22.5-.5v-.5c0-.28-.22-.5-.5-.5h-.5c-.28 0-.5-.22-.5-.5v-.5z"/>
    </svg>`;

    function setNativeValue(element, value) {
        if (value === undefined || value === null) return;
        const { set: valueSetter } = Object.getOwnPropertyDescriptor(element, 'value') || {};
        const prototype = Object.getPrototypeOf(element);
        const { set: prototypeValueSetter } = Object.getOwnPropertyDescriptor(prototype, 'value') || {};
        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) prototypeValueSetter.call(element, value);
        else if (valueSetter) valueSetter.call(element, value);
        else element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function extractPatientInfo() {
        const header = document.querySelector('.css-ustlin');
        if (!header) return null;
        const spans = header.querySelectorAll(':scope > span');
        const ruby = header.querySelector('ruby');
        return {
            id: spans[0]?.innerText.trim(),
            name: ruby ? Array.from(ruby.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim() : null,
            age: spans[1]?.innerText.trim(),
            gender: header.querySelector('.css-o1cux7 span')?.innerText.trim()
        };
    }

    function extractData() {
        const soap = document.querySelector('.ProseMirror')?.innerText || '';
        const height = (soap.match(/【身長】\s*(\d+(\.\d+)?)cm/) || [])[1];
        const weightMatches = [...soap.matchAll(/(\d+\/\d+)\s*(\d+(\.\d+)?)kg/g)];
        const weight = weightMatches.length > 0 ? weightMatches[weightMatches.length - 1][2] : null;
        const bodyText = document.body.innerText.substring(0, 10000);
        const age = (bodyText.match(/(\d+)歳/) || [])[1];
        const gender = bodyText.includes('女') ? 'female' : 'male';
        let vals = {};
        const getVal = (row) => { const valText = row.cells[row.cells.length - 1].innerText; const val = parseFloat(valText.replace(/[^\d.]/g, '')); return isNaN(val) ? null : val; };
        document.querySelectorAll('tr').forEach(row => {
            if (row.cells.length < 2) return;
            const t = row.cells[0].innerText.trim();
            if (t.includes('Ｎａ－尿')) vals.uNa = getVal(row);
            else if (t.includes('クレアチニン－尿')) vals.uCr = getVal(row);
            else if (t.includes('ＵＮ－尿') || t.includes('尿素窒素－尿')) vals.uUN = getVal(row);
            else if (t.includes('Ｃａ－尿') || t.includes('カルシウム－尿')) vals.uCa = getVal(row);
            else if (t.includes('Ｎａ') || t.includes('ナトリウム')) { if (!vals.sNa) vals.sNa = getVal(row); }
            else if (t.includes('クレアチニン') || t.includes('Ｃｒ')) { if (!vals.sCr) vals.sCr = getVal(row); }
            else if (t.includes('ＵＮ') || t.includes('尿素窒素')) { if (!vals.sUN) vals.sUN = getVal(row); }
            else if (t.includes('Ｃａ') || t.includes('カルシウム')) { if (!vals.sCa) vals.sCa = getVal(row); }
        });
        const dateCells = document.querySelectorAll('div.css-1r9zmi8 table thead th.css-1d2fxl6 button');
        const labDate = dateCells.length > 0 ? dateCells[dateCells.length - 1].innerText.trim() : null;
        return { age: parseInt(age), gender, height: parseFloat(height), weight: parseFloat(weight), ...vals, labDate };
    }

    function calculate(d) {
        const res = { date: d.labDate, items: {}, errors: {} };
        const saltDeps = { age: '年齢', weight: '体重', height: '身長', uNa: '尿中Na', uCr: '尿中Cr' };
        const saltMissing = Object.keys(saltDeps).filter(k => !d[k]);
        if (saltMissing.length === 0) {
            const uCr_mgdl = d.uCr * 100, uNa_meql = (d.uNa / 23) * 1000;
            const est_ucr_t = -2.04 * d.age + 14.89 * d.weight + 16.14 * d.height - 2244.45;
            res.items.tanaka = ((21.98 * Math.pow((uNa_meql / (uCr_mgdl * 10) * est_ucr_t), 0.392)) / 17).toFixed(1);
            const est_ucr_k = (d.gender === 'female') ? (8.58 * d.weight + 5.09 * d.height - 4.79 * d.age - 67.0) : (15.12 * d.weight + 7.39 * d.height - 12.63 * d.age - 79.9);
            res.items.kawasaki = ((16.3 * Math.sqrt((uNa_meql / (uCr_mgdl * 10)) * est_ucr_k)) / 17).toFixed(1);
        } else res.errors.salt = saltMissing.map(k => saltDeps[k]).join(', ');
        const feConfigs = [
            { id: 'fena', label: 'FENa', u: 'uNa', s: 'sNa', uLab: '尿中Na', sLab: '血清Na' },
            { id: 'feun', label: 'FEUn', u: 'uUN', s: 'sUN', uLab: '尿中UN', sLab: '血清UN' },
            { id: 'feca', label: 'FECa', u: 'uCa', s: 'sCa', uLab: '尿中Ca', sLab: '血清Ca' }
        ];
        feConfigs.forEach(cfg => {
            const missing = []; if (!d[cfg.u]) missing.push(cfg.uLab); if (!d[cfg.s]) missing.push(cfg.sLab); if (!d.uCr) missing.push('尿中Cr'); if (!d.sCr) missing.push('血清Cr');
            if (missing.length === 0) res.items[cfg.id] = ((d[cfg.u] * d.sCr) / (d[cfg.s] * d.uCr) * 100).toFixed(cfg.id === 'feun' ? 1 : 2);
            else res.errors[cfg.id] = missing.join(', ');
        });
        return res;
    }

    const modal = document.createElement('div');
    modal.id = 'salt-modal';
    Object.assign(modal.style, { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '320px', background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(15px)', borderRadius: '20px', padding: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', zIndex: '10001', display: 'none', textAlign: 'center', fontFamily: 'sans-serif' });
    document.body.appendChild(modal);

    async function runCalculation() {
        const labTab = Array.from(document.querySelectorAll('li')).find(li => li.innerText.trim() === '検査結果' || Array.from(li.querySelectorAll('span')).some(s => s.innerText.trim() === '検査結果'));
        if (labTab) { ['mousedown', 'mouseup', 'click'].forEach(t => { const e = new MouseEvent(t, { bubbles: true, cancelable: true, view: window }); labTab.dispatchEvent(e); labTab.querySelector('span')?.dispatchEvent(e); }); await new Promise(r => setTimeout(r, 1000)); }
        const data = extractData();
        const res = calculate(data);
        const hasResult = Object.keys(res.items).length > 0;
        if (!hasResult) { alert('計算に必要なデータが不足しています。\n不足: ' + Array.from(new Set(Object.values(res.errors).flatMap(s => s.split(', ')))).join(', ')); return; }
        modal.style.display = 'block';
        let html = `<div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">推定塩分・FE指標</div><div style="font-size: 12px; color: #666; margin-bottom: 15px;">対象日: ${res.date || '不明'}</div>`;
        [{ id: 'tanaka', label: '塩分(田中)', unit: 'g/日' }, { id: 'kawasaki', label: '塩分(川崎)', unit: 'g/日' }, { id: 'fena', label: 'FENa', unit: '%' }, { id: 'feun', label: 'FEUn', unit: '%' }, { id: 'feca', label: 'FECa', unit: '%' }].forEach(r => {
            if (res.items[r.id]) html += `<div style="margin-bottom: 8px; background: rgba(39, 174, 96, 0.08); padding: 8px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(39, 174, 96, 0.2);"><span style="font-size: 12px; color: #27ae60; font-weight: bold;">${r.label}</span><span style="font-size: 18px; font-weight: bold;">${res.items[r.id]} <small style="font-size: 10px;">${r.unit}</small></span></div>`;
            else html += `<div style="margin-bottom: 8px; background: rgba(0, 0, 0, 0.03); padding: 8px; border-radius: 10px; text-align: left; opacity: 0.6;"><div style="font-size: 11px; color: #888;">${r.label} - 計算不可</div><div style="font-size: 9px; color: #aaa;">不足: ${res.errors[r.id === 'tanaka' || r.id === 'kawasaki' ? 'salt' : r.id]}</div></div>`;
        });
        html += `<button id="do-reg" style="width: 100%; padding: 12px; background: #27ae60; color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; margin-top: 10px;">計算済み項目を登録</button><button id="close-modal" style="background: none; border: none; color: #666; cursor: pointer; margin-top: 10px;">閉じる</button>`;
        modal.innerHTML = html;
        document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
        document.getElementById('do-reg').onclick = async () => {
            const regBtn = document.getElementById('do-reg');
            regBtn.innerText = '登録中...'; regBtn.disabled = true;
            try {
                const add = Array.from(document.querySelectorAll('button.css-1nnxsgs')).find(b => b.querySelector('path')?.getAttribute('d') === 'M13 11h9v2h-9v9h-2v-9H2v-2h9V2h2z');
                if (!add) throw new Error('「追加（＋）」ボタンが見つかりません');
                add.click(); await new Promise(r => setTimeout(r, 1000));
                if (res.date) { const dateInput = document.querySelector('input.css-i37t0m'); if (dateInput) setNativeValue(dateInput, res.date); }
                const scrollContainer = document.querySelector('div[data-scroll="on"]');
                const fillMap = { tanaka: '田中式', kawasaki: '川崎式', fena: 'FENa', feun: 'FEUn', feca: 'FECa' };
                let status = {}; Object.keys(res.items).forEach(k => status[k] = false);
                for (let i = 0; i < 20; i++) {
                    document.querySelectorAll('.css-1azcrm').forEach(row => {
                        const label = row.querySelector('label')?.innerText || '';
                        const input = row.querySelector('input');
                        if (!input) return;
                        for (let k in status) { if (label.includes(fillMap[k]) && !status[k]) { input.focus(); setNativeValue(input, res.items[k]); status[k] = true; } }
                    });
                    if (Object.keys(status).every(k => status[k])) break;
                    if (scrollContainer) { scrollContainer.scrollTop += 300; await new Promise(r => setTimeout(r, 300)); }
                }
                await new Promise(r => setTimeout(r, 800));
                const saveBtn = Array.from(document.querySelectorAll('button')).find(b => ['登録','確定','更新'].includes(b.innerText.trim()));
                if (saveBtn) { saveBtn.click(); modal.style.display = 'none'; }
            } catch (e) { alert(e.message); }
            regBtn.disabled = false; regBtn.innerText = '計算済み項目を登録';
        };
    }

    function injectButton() {
        if (document.getElementById('salt-intake-btn-container')) return;
        const toolbar = document.querySelector('.css-12mbokh') || Array.from(document.querySelectorAll('div')).find(d => d.className.includes('css-') && d.querySelector('path')?.getAttribute('d')?.startsWith('M4.65 4h4.905'));
        if (!toolbar) return;

        const container = document.createElement('span');
        container.id = 'salt-intake-btn-container';
        container.style.display = 'inline-flex';
        container.style.gap = '4px';

        const saltBtn = document.createElement('span');
        saltBtn.className = 'css-lbdnvw';
        saltBtn.innerHTML = `<button class="css-1nnxsgs css-1jg2kh3" type="button" data-size="xl" data-variant="primary" title="推定塩分・FE計算" style="pointer-events: auto;"><span class="css-1f2tk15">${SALT_ICON_SVG}</span></button>`;
        
        saltBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            runCalculation();
        }, true);

        container.appendChild(saltBtn);

        const microscope = Array.from(toolbar.children).find(c => c.querySelector('path')?.getAttribute('d')?.startsWith('M17.75 20v-2.25'));
        if (microscope) toolbar.insertBefore(container, microscope.nextSibling); else toolbar.appendChild(container);
    }

    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(injectButton, 3000);
    setTimeout(injectButton, 1000);
})();
