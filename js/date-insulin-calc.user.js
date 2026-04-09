// ==UserScript==
// @name          日付・日数 & インスリン計算UI
// @namespace     http://tampermonkey.net/
// @version       5.2
// @description   日付計算とインスリン残量計算（空打ち2単位考慮）をヘッダーに統合
// @author        Tsuyoshi Ohnishi
// @match         https://digikar.jp/*
// @exclude       https://digikar.jp/karte/new_window?viewer=examination_result
// @grant         none
// @updateURL     https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/date-insulin-calc.user.js
// @downloadURL   https://raw.githubusercontent.com/ohnishi-med/m3degikar_modifier/main/js/date-insulin-calc.user.js
// ==/UserScript==

// ======================================================================
// 【更新履歴】
// v5.1: Git運用と自動配信対応(英字ファイル名リネーム・最適化初版)
// v5.2: インスリン計算機能の拡張。ランタスXR、アウィクリなどの規格（総量・空打ち量・投与間隔）に対応。
// ======================================================================

(function() {
    'use strict';

    const CONTAINER_ID = 'karte-calc-fixed-ui';
    const DATE_INPUT_ID = 'calc-input-field';
    const DATE_RESULT_ID = 'calc-result-display';
    const INSULIN_INPUT_ID = 'insulin-input-field';
    const INSULIN_RESULT_ID = 'insulin-result-display';

    let uiElements = {};
    let isInserting = false;
    let currentPathname = location.pathname;

    // --- 計算ロジック ---

    const INSULIN_TYPES = {
        'default': { name: '通常(300)', total: 300, air: 2, interval: 'day' },
        'lantus_xr': { name: 'ﾗﾝﾀｽXR(450)', total: 450, air: 3, interval: 'day' },
        'awiqli_300': { name: 'ｱｳｨｸﾘ(300)', total: 300, air: 10, interval: 'week' },
        'awiqli_700': { name: 'ｱｳｨｸﾘ(700)', total: 700, air: 10, interval: 'week' }
    };

    function calculateInsulin(val, typeKey) {
        const config = INSULIN_TYPES[typeKey] || INSULIN_TYPES['default'];
        // "10-10-10" や "14" や "6-0-6" などの形式を分割
        const doses = val.split('-').map(s => s.trim());
        let totalUnits = 0;
        let shotCount = 0;

        doses.forEach(d => {
            const unit = parseInt(d, 10);
            if (!isNaN(unit) && unit > 0) {
                totalUnits += unit;
                shotCount++; // 注射する回数（0以外）をカウント
            }
        });

        if (shotCount === 0) return null;

        // 1回(1日/1週)あたりの消費量
        const consumption = totalUnits + (shotCount * config.air);
        const intervalsLeft = Math.floor(config.total / consumption);
        const daysLeft = config.interval === 'week' ? intervalsLeft * 7 : intervalsLeft;

        return { days: daysLeft, intervals: intervalsLeft, intervalType: config.interval };
    }

    // --- (日付計算用関数は既存のまま) ---
    function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
    function calculateDaysDiff(t, now) { t.setHours(0,0,0,0); now.setHours(0,0,0,0); return Math.round((t - now) / 86400000); }

    function handleInput() {
        // 日付計算
        const dateIn = document.getElementById(DATE_INPUT_ID);
        const dateRes = document.getElementById(DATE_RESULT_ID);
        const dateVal = dateIn.value.trim();
        if (!dateVal) { dateRes.textContent = ''; }
        else {
            const today = new Date();
            const dateMatch = dateVal.match(/^(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})$/);
            if (dateMatch) {
                const m = parseInt(dateMatch[2], 10) - 1;
                const d = parseInt(dateMatch[3], 10);
                let y = dateMatch[1] ? parseInt(dateMatch[1], 10) : today.getFullYear();
                let target = new Date(y, m, d);
                if (!dateMatch[1] && calculateDaysDiff(target, today) < 0) target = new Date(y + 1, m, d);
                const diff = calculateDaysDiff(target, today);
                dateRes.innerHTML = `<strong>${Math.abs(diff)}</strong>${diff >= 0 ? '日後' : '日経過'}`;
            } else if (!isNaN(dateVal)) {
                const end = addDays(today, parseInt(dateVal, 10));
                dateRes.innerHTML = `→ <strong>${(end.getMonth()+1)}/${end.getDate()}</strong>`;
            }
        }

        // インスリン計算
        const insSelect = document.getElementById('insulin-type-select');
        const typeKey = insSelect ? insSelect.value : 'default';
        const insIn = document.getElementById(INSULIN_INPUT_ID);
        const insRes = document.getElementById(INSULIN_RESULT_ID);
        const insVal = insIn.value.trim();
        if (!insVal) { insRes.textContent = ''; }
        else {
            const res = calculateInsulin(insVal, typeKey);
            if (res) {
                if (res.intervalType === 'week') {
                    insRes.innerHTML = `1本: <strong>${res.days}</strong>日分 (${res.intervals}週分)`;
                } else {
                    insRes.innerHTML = `1本: <strong>${res.days}</strong>日分`;
                }
            } else {
                insRes.textContent = 'err';
            }
        }
    }

    function createUI() {
        if (!document.getElementById(`${CONTAINER_ID}-style`)) {
            const style = document.createElement('style');
            style.id = `${CONTAINER_ID}-style`;
            style.textContent = `
                #${CONTAINER_ID} { display: inline-flex; align-items: center; gap: 10px; font-family: sans-serif; }
                .calc-group { display: flex; align-items: center; background: #f0f0f0; padding: 2px 8px; border-radius: 20px; border: 1px solid #ddd; }
                .calc-input { border: 1px solid #ccc; border-radius: 4px; width: 50px; height: 22px; text-align: center; font-size: 11px; }
                .calc-res { font-size: 11px; margin-left: 6px; white-space: nowrap; min-width: 50px; }
                .label-tag { font-size: 10px; font-weight: bold; margin-right: 4px; color: #666; }
            `;
            document.head.appendChild(style);
        }

        const container = document.createElement('div');
        container.id = CONTAINER_ID;

        // 日付セクション
        const dateGroup = document.createElement('div');
        dateGroup.className = 'calc-group';
        dateGroup.innerHTML = `<span class="label-tag">日</span>
            <input id="${DATE_INPUT_ID}" class="calc-input" placeholder="M/D or N">
            <div id="${DATE_RESULT_ID}" class="calc-res"></div>`;

        // インスリンセクション
        const insGroup = document.createElement('div');
        insGroup.className = 'calc-group';
        
        // オプションタグの生成
        let optionsHtml = '';
        for (const [key, conf] of Object.entries(INSULIN_TYPES)) {
            optionsHtml += `<option value="${key}">${conf.name}</option>`;
        }

        insGroup.innerHTML = `<span class="label-tag">💉</span>
            <select id="insulin-type-select" class="calc-input" style="width:85px; margin-right:4px; padding:0; font-size:10px; cursor:pointer;">
                ${optionsHtml}
            </select>
            <input id="${INSULIN_INPUT_ID}" class="calc-input" style="width:70px;" placeholder="10-0-10">
            <div id="${INSULIN_RESULT_ID}" class="calc-res"></div>`;

        container.appendChild(dateGroup);
        container.appendChild(insGroup);

        return { container };
    }

    function insertUI() {
        const path = location.pathname;
        if (!(path.startsWith('/karte/') && !(path === '/karte/new_window' && location.search.includes('viewer=examination_result')))) {
            const existing = document.getElementById(CONTAINER_ID);
            if (existing) existing.style.display = 'none';
            return;
        }

        const header = document.querySelector('header[role="navigation"]');
        const target = header?.querySelector('span.css-1ypjkz1');
        if (!target || target.contains(document.getElementById(CONTAINER_ID))) return;

        if (!uiElements.container) uiElements = createUI();
        uiElements.container.style.display = 'inline-flex';
        target.prepend(uiElements.container);

        document.getElementById(DATE_INPUT_ID).addEventListener('input', handleInput);
        document.getElementById('insulin-type-select').addEventListener('change', handleInput);
        document.getElementById(INSULIN_INPUT_ID).addEventListener('input', handleInput);
    }

    // SPA監視
    const observer = new MutationObserver(insertUI);
    observer.observe(document.body, { childList: true, subtree: true });
    insertUI();

})();