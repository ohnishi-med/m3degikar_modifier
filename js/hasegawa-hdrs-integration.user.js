// ==UserScript==
// @name         長谷川式 (HDS-R) データ連携プログラム
// @namespace    http://tampermonkey.net/
// @version      1.1.5
// @description  スプレッドシートから長谷川式 (HDS-R) の点数を取得し、M3デジカルのカルテに自動入力します
// @author       TsuyoshiOhnishi / Antigravity
// @match        https://*.digikar.jp/*
// @grant        GM_xmlhttpRequest
// @updateURL    https://github.com/ohnishi-med/m3degikar_modifier/raw/main/js/hasegawa-hdrs-integration.user.js
// @downloadURL  https://github.com/ohnishi-med/m3degikar_modifier/raw/main/js/hasegawa-hdrs-integration.user.js
// ==/UserScript==

(function () {
    'use strict';

    // データベースアイコン (C:\Users\coino\Downloads\データベースの無料アイコン2.svg より)
    const HASEGAWA_ICON_SVG = `<svg version="1.1" id="_x32_" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="width: 24px; height: 24px; opacity: 1;" xml:space="preserve">
        <g>
            <path fill="currentColor" d="M507.34,98.426c-5.269-12.142-14.39-22.598-25.948-31.612c-17.387-13.51-40.586-24.054-67.719-31.464
                c-27.134-7.384-58.235-11.534-91.338-11.534c-50.447,0.033-96.203,9.566-130.465,25.734c-17.132,8.126-31.465,17.922-42.002,29.67
                c-5.252,5.877-9.541,12.282-12.545,19.206c-2.997,6.924-4.668,14.39-4.66,22.03v30.08l26.162,19.856v-4.346
                c15.132,13.838,36.379,24.877,61.792,33.052c29.299,9.36,64.204,14.736,101.718,14.736c50.028-0.024,95.371-9.508,129.058-25.421
                c13.55-6.421,25.126-13.93,34.444-22.482v58.845c-1.86,3.992-4.511,7.993-8.1,12.027c-11.591,13.056-32.583,25.355-59.652,33.958
                c-27.067,8.661-60.12,13.814-95.75,13.806c-9.278,0.008-18.3-0.444-27.166-1.111l-22.886,17.37
                c15.946,2.166,32.698,3.368,50.052,3.368c50.028-0.025,95.371-9.516,129.058-25.422c13.55-6.421,25.126-13.928,34.444-22.482
                v58.845c-1.86,3.992-4.511,7.994-8.1,12.035c-11.591,13.057-32.583,25.348-59.652,33.959c-27.067,8.66-60.12,13.813-95.75,13.806
                c-46.232,0.025-88.061-8.751-118.125-22.441l-17.551,13.319c10.184,5.343,21.569,10.019,33.958,14.004
                c29.299,9.36,64.204,14.735,101.718,14.744c50.028-0.024,95.371-9.516,129.058-25.421c13.55-6.422,25.126-13.938,34.444-22.491
                v44.891c0,3.894-0.806,7.689-2.502,11.648c-2.964,6.891-8.941,14.3-18.013,21.355c-13.583,10.611-33.9,20.186-58.531,26.87
                c-24.623,6.701-53.552,10.62-84.455,10.612c-47.08,0.041-89.625-9.146-119.269-23.224c-14.835-6.997-26.36-15.213-33.687-23.454
                c-3.688-4.116-6.339-8.216-8.043-12.159c-1.704-3.96-2.503-7.754-2.511-11.648v-4.602l-24.276,18.423
                c0.741,2.8,1.63,5.557,2.774,8.208c5.276,12.142,14.39,22.597,25.948,31.62c17.395,13.51,40.593,24.055,67.727,31.464
                c27.133,7.384,58.235,11.525,91.337,11.533c50.456-0.041,96.195-9.565,130.457-25.742c17.14-8.124,31.464-17.913,42.001-29.669
                c5.253-5.87,9.55-12.275,12.546-19.206c2.997-6.915,4.676-14.391,4.66-22.03V120.456
                C512.016,112.816,510.337,105.349,507.34,98.426z M485.837,134.409c-1.86,3.993-4.511,8.002-8.1,12.036
                c-11.591,13.064-32.583,25.355-59.652,33.966c-27.067,8.66-60.12,13.813-95.75,13.806c-47.5,0.024-90.448-9.196-120.669-23.536
                c-15.123-7.146-26.994-15.552-34.732-24.236c-3.59-4.034-6.249-8.043-8.11-12.028v-13.962c0.008-3.895,0.807-7.681,2.511-11.641
                c2.964-6.899,8.932-14.3,18.012-21.363c13.576-10.611,33.892-20.185,58.524-26.862c24.631-6.709,53.559-10.62,84.463-10.612
                c47.081-0.041,89.625,9.146,119.262,23.224c14.835,6.989,26.359,15.205,33.686,23.454c3.688,4.116,6.338,8.208,8.052,12.159
                c1.695,3.96,2.502,7.746,2.502,11.641V134.409z" />
            <polygon fill="currentColor" points="238.572,278.663 88.242,164.564 88.242,224.207 0,224.207 0,333.12 88.242,333.12 88.242,392.763" />
        </g>
    </svg>`;

    const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzc1lIfizTbK_5Xiuc7k2YKtck4Z0jAPCLFrn-IaffPXT9F0bFmbX4aNtJSSNs5mb8/exec";

    const modal = document.createElement('div');
    modal.id = 'hasegawa-hdrs-modal';
    Object.assign(modal.style, {
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '320px', background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(15px)',
        borderRadius: '20px', padding: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        zIndex: '10002', display: 'none', textAlign: 'center', fontFamily: 'sans-serif'
    });
    document.body.appendChild(modal);

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
            name: ruby ? Array.from(ruby.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim() : null
        };
    }

    async function runHasegawaIntegration() {
        const patient = extractPatientInfo();
        if (!patient || !patient.id) { alert('患者情報（カルテID）を取得できませんでした。'); return; }

        modal.style.display = 'block';
        modal.innerHTML = `<div style="font-size: 16px; margin-bottom: 20px;">データを取得中...<br><small>${patient.id}: ${patient.name || ''}</small></div>`;

        GM_xmlhttpRequest({
            method: "GET",
            url: `${GAS_ENDPOINT}?id=${patient.id}`,
            onload: function(response) {
                try {
                    const res = JSON.parse(response.responseText);
                    if (res.found) {
                        let html = `<div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">長谷川式 (HDS-R)</div>`;
                        html += `<div style="font-size: 12px; color: #666; margin-bottom: 15px;">最終検査日: ${res.date || '不明'}</div>`;
                        html += `<div style="margin-bottom: 15px; background: rgba(39, 174, 96, 0.1); padding: 15px; border-radius: 12px; border: 1px solid rgba(39, 174, 96, 0.3);">`;
                        html += `<div style="font-size: 12px; color: #27ae60; font-weight: bold;">取得した点数</div>`;
                        html += `<div style="font-size: 32px; font-weight: bold;">${res.score} <small style="font-size: 14px;">点</small></div></div>`;
                        html += `<button id="do-reg-h" style="width: 100%; padding: 12px; background: #27ae60; color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; margin-top: 10px;">この点数をカルテに登録</button>`;
                        html += `<button id="close-modal-h" style="background: none; border: none; color: #666; cursor: pointer; margin-top: 10px;">閉じる</button>`;
                        modal.innerHTML = html;
                        
                        document.getElementById('close-modal-h').onclick = () => modal.style.display = 'none';
                        document.getElementById('do-reg-h').onclick = async () => {
                            const regBtn = document.getElementById('do-reg-h');
                            regBtn.innerText = '登録中...'; regBtn.disabled = true;
                            try {
                                const labTab = Array.from(document.querySelectorAll('li')).find(li => li.innerText.trim() === '検査結果' || Array.from(li.querySelectorAll('span')).some(s => s.innerText.trim() === '検査結果'));
                                if (labTab) { ['mousedown', 'mouseup', 'click'].forEach(t => { const e = new MouseEvent(t, { bubbles: true, cancelable: true, view: document.defaultView }); labTab.dispatchEvent(e); labTab.querySelector('span')?.dispatchEvent(e); }); await new Promise(r => setTimeout(r, 800)); }

                                const add = Array.from(document.querySelectorAll('button.css-1nnxsgs')).find(b => b.querySelector('path')?.getAttribute('d') === 'M13 11h9v2h-9v9h-2v-9H2v-2h9V2h2z');
                                if (!add) throw new Error('「追加（＋）」ボタンが見つかりません');
                                add.click(); await new Promise(r => setTimeout(r, 1000));
                                
                                const scrollContainer = document.querySelector('div[data-scroll="on"]');
                                let status = { score: false, date: false };
                                for (let i = 0; i < 20; i++) {
                                    document.querySelectorAll('.css-1azcrm').forEach(row => {
                                        const label = row.querySelector('label')?.innerText || '';
                                        const input = row.querySelector('input');
                                        if (!input) return;
                                        if ((label.includes('長谷川') || label.includes('HDS-R')) && !status.score) { setNativeValue(input, res.score); status.score = true; }
                                        if (label.includes('検査年月日') && !status.date && res.date) { setNativeValue(input, res.date); status.date = true; }
                                    });
                                    if (status.score && (status.date || !res.date)) break;
                                    if (scrollContainer) { scrollContainer.scrollTop += 300; await new Promise(r => setTimeout(r, 300)); }
                                }
                                
                                const saveBtn = Array.from(document.querySelectorAll('button')).find(b => ['登録','確定','更新'].includes(b.innerText.trim()));
                                if (saveBtn) saveBtn.click();
                                else alert('保存ボタンが見つかりませんでした。手動で保存してください。');

                                modal.style.display = 'none';
                                regBtn.innerText = 'この点数をカルテに登録';
                                regBtn.disabled = false;
                            } catch (e) { alert(e.message); }
                            regBtn.innerText = 'この点数をカルテに登録'; regBtn.disabled = false;
                        };
                    } else {
                        modal.innerHTML = `<div style="color: #e74c3c; margin-bottom: 10px;">データが見つかりませんでした</div><div style="font-size: 12px; color: #888;">ID: ${patient.id}</div><button id="close-modal-err" style="margin-top: 10px; padding: 8px 20px;">閉じる</button>`;
                        document.getElementById('close-modal-err').onclick = () => modal.style.display = 'none';
                    }
                } catch (e) {
                    modal.innerHTML = `<div style="color: #e74c3c;">データ解析エラーが発生しました。</div><button id="close-modal-err">閉じる</button>`;
                    document.getElementById('close-modal-err').onclick = () => modal.style.display = 'none';
                }
            },
            onerror: function() {
                modal.innerHTML = `<div style="color: #e74c3c;">通信エラーが発生しました。</div><button id="close-modal-err">閉じる</button>`;
                document.getElementById('close-modal-err').onclick = () => modal.style.display = 'none';
            }
        });
    }

    function injectButton() {
        if (document.getElementById('hasegawa-hdrs-btn-container')) return;
        
        // ツールバーの取得 (Saltボタンと同様のロジック)
        const toolbar = document.querySelector('.css-12mbokh') || Array.from(document.querySelectorAll('div')).find(d => d.className.includes('css-') && d.querySelector('path')?.getAttribute('d')?.startsWith('M4.65 4h4.905'));
        if (!toolbar) return;

        const container = document.createElement('div');
        container.id = 'hasegawa-hdrs-btn-container';
        container.style.display = 'flex';
        container.style.marginLeft = '4px';

        const hasegawaBtn = document.createElement('span');
        hasegawaBtn.className = 'css-lbdnvw';
        hasegawaBtn.innerHTML = `<button class="css-1nnxsgs css-1jg2kh3" type="button" data-size="xl" data-variant="primary" title="長谷川式(HDS-R)取込"><span class="css-1f2tk15" style="color: #27ae60;">${HASEGAWA_ICON_SVG}</span></button>`;
        hasegawaBtn.onclick = runHasegawaIntegration;

        container.appendChild(hasegawaBtn);

        // 顕微鏡アイコンの隣、または末尾に挿入
        const microscope = Array.from(toolbar.children).find(c => c.querySelector('path')?.getAttribute('d')?.startsWith('M17.75 20v-2.25'));
        
        // 既存のSaltボタンコンテナがあれば、その隣に配置したい
        const saltContainer = document.getElementById('salt-intake-btn-container');
        if (saltContainer) {
            saltContainer.parentNode.insertBefore(container, saltContainer.nextSibling);
        } else if (microscope) {
            toolbar.insertBefore(container, microscope.nextSibling);
        } else {
            toolbar.appendChild(container);
        }
    }

    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(injectButton, 3000);
    setTimeout(injectButton, 1000);
})();
