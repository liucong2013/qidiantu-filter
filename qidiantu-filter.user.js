// ==UserScript==
// @name         起点图表格筛选 (v6.4 移动端优化)
// @namespace    http://tampermonkey.net/
// @version      6.4
// @description  为起点图(qidiantu.com)增加强大的表格筛选和数据分析功能。支持分类和等级的多选过滤、书名热词分析与筛选，并完美兼容网站的懒加载机制，确保筛选对所有数据有效。新增移动端显示优化。
// @author       Gemini
// @homepageURL  https://github.com/liucong2013/qidiantu-filter
// @match        https://www.qidiantu.com/shouding/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 动态添加 viewport meta 标签以优化移动端显示
    function addViewportMeta() {
        if (document.querySelector('meta[name="viewport"]')) return;
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0';
        document.head.appendChild(meta);
    }

    // 由于脚本在 document-start 运行，需要确保 head 元素已存在
    if (document.head) {
        addViewportMeta();
    } else {
        const observer = new MutationObserver(() => {
            if (document.head) {
                addViewportMeta();
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true });
    }

    // --- 样式部分 ---
    GM_addStyle(`
        .gm-sticky-toolbar { position: sticky; top: 0; background-color: #ffffff; padding: 8px 10px; border-bottom: 1px solid #e0e0e0; box-shadow: 0 2px 4px rgba(0,0,0,0.05); z-index: 1001; }
        #gm-hotword-display-area { padding-top: 8px; border-top: 1px dashed #ccc; margin-top: 8px; text-align: center; }
        .gm-hotword-tag { display: inline-block; padding: 3px 8px; margin: 2px; background-color: #e9f5ff; border: 1px solid #d0eaff; border-radius: 4px; cursor: pointer; }
        .gm-hotword-tag.active { background-color: #007bff; color: white; border-color: #0056b3; }
        #gm-hotword-clear-btn { display: none; width: 98%; box-sizing: border-box; margin: 8px auto 0 auto; padding: 4px; background-color: #ffe9e9; border: 1px solid #ffd0d0; border-radius: 4px; cursor: pointer; }
        .gm-multiselect-container { position: relative; display: inline-block; margin-left: 8px; font-weight: normal; vertical-align: middle; }
        .gm-multiselect-button, #gm-analyze-hotwords-btn { padding: 4px 10px; border: 1px solid #ccc; border-radius: 4px; background-color: #f8f8f8; cursor: pointer; }
        .gm-multiselect-button.active { background-color: #007bff; color: white; border-color: #0056b3; }
        .gm-multiselect-dropdown { display: none; position: absolute; background-color: white; border: 1px solid #ccc; border-radius: 4px; padding: 5px; z-index: 1002; max-height: 300px; overflow-y: auto; text-align: left; }
        .gm-multiselect-dropdown.show { display: block; }
        .gm-multiselect-dropdown label { display: block; padding: 3px 5px; white-space: nowrap; }
        .gm-multiselect-dropdown label:hover { background-color: #f0f0f0; }
        .gm-multiselect-clear-btn { position: sticky; top: -5px; z-index: 1; width: calc(100% + 10px); margin: -5px -5px 5px -5px; box-sizing: border-box; padding: 5px; text-align: center; border: none; border-bottom: 1px solid #ddd; background: #f5f5f5; cursor: pointer; }

        /* --- 移动端响应式样式 --- */
        @media (max-width: 768px) {
            body, .table-bordered { font-size: 14px; }
            .gm-sticky-toolbar { padding: 5px; display: flex; flex-direction: column; align-items: stretch; }
            #gm-analyze-hotwords-btn { margin-bottom: 5px; }
            .gm-multiselect-container { margin: 5px 0; display: block; }
            .gm-multiselect-button { width: 100%; box-sizing: border-box; text-align: center; }
            .gm-multiselect-dropdown { width: 98%; box-sizing: border-box; left: 1%; }
            .table-bordered th, .table-bordered td { padding: 4px; white-space: normal !important; }
            .table-bordered th:nth-child(1), .table-bordered td:nth-child(1),
            .table-bordered th:nth-child(3), .table-bordered td:nth-child(3),
            .table-bordered th:nth-child(5), .table-bordered td:nth-child(5) {
                min-width: 50px; /* 调整特定列的最小宽度 */
            }
            .table-bordered th:nth-child(2), .table-bordered td:nth-child(2) {
                min-width: 150px; /* 书名列需要更宽 */
            }
            #gm-hotword-display-area { text-align: left; }
        }
    `);

    let allTableRows = [];
    let categoryFilterControl = null;
    let levelFilterControl = null;
    let activeHotword = null;
    let tableBodyObserver = null; // 新增：用于监听表格内容的观察者

    function updateDisplay() {
        if (!categoryFilterControl || !levelFilterControl) return;
        const selectedCategories = categoryFilterControl.getSelected();
        const selectedLevels = levelFilterControl.getSelected();

        categoryFilterControl.container.querySelector('.gm-multiselect-button').classList.toggle('active', selectedCategories.length > 0);
        levelFilterControl.container.querySelector('.gm-multiselect-button').classList.toggle('active', selectedLevels.length > 0);

        // 每次更新时，都从 DOM 中获取最新的行列表，以应对懒加载
        allTableRows = Array.from(document.querySelectorAll('.table-bordered tbody tr'));

        allTableRows.forEach(row => {
            const category = row.cells[1]?.textContent.trim().match(/\[(.*?)\]/)?.[1] || '';
            const level = row.cells[4]?.textContent.trim() || '';
            const title = row.cells[1]?.querySelector('a')?.textContent.trim() || '';
            const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(category);
            const levelMatch = selectedLevels.length === 0 || selectedLevels.includes(level);
            const hotwordMatch = !activeHotword || title.includes(activeHotword);
            row.style.display = (categoryMatch && levelMatch && hotwordMatch) ? '' : 'none';
        });
    }

    function initializeControls(table) {
        if (document.querySelector('.gm-sticky-toolbar')) return;
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        if (!thead || !tbody) return;

        // 初始获取行数据
        allTableRows = Array.from(tbody.querySelectorAll('tr'));
        if (allTableRows.length === 0) return;

        const toolbar = document.createElement('div');
        toolbar.className = 'gm-sticky-toolbar';
        table.parentNode.insertBefore(toolbar, table);
        const analyzeBtn = document.createElement('button');
        analyzeBtn.id = 'gm-analyze-hotwords-btn';
        analyzeBtn.textContent = '书名热词分析';
        toolbar.appendChild(analyzeBtn);

        const headerRow = thead.querySelector('tr');
        if (!headerRow || headerRow.children.length < 5) return;
        const titleHeader = headerRow.children[1];
        const levelHeader = headerRow.children[4];

        const categoryCounts = {};
        const levelCounts = {};
        allTableRows.forEach(r => {
            const category = r.cells[1]?.textContent.trim().match(/\[(.*?)\]/)?.[1];
            const level = r.cells[4]?.textContent.trim();
            if (category) categoryCounts[category] = (categoryCounts[category] || 0) + 1;
            if (level) levelCounts[level] = (levelCounts[level] || 0) + 1;
        });

        const categoriesWithOptions = Object.entries(categoryCounts).map(([name, count]) => ({ name, count }));
        const levelsWithOptions = Object.entries(levelCounts).map(([name, count]) => ({ name, count }));

        categoryFilterControl = createMultiSelect(categoriesWithOptions, "分类", updateDisplay);
        levelFilterControl = createMultiSelect(levelsWithOptions, "等级", updateDisplay);

        titleHeader.appendChild(categoryFilterControl.container);
        levelHeader.appendChild(levelFilterControl.container);

        analyzeBtn.addEventListener('click', analyzeAndDisplayHotwords);

        // --- 核心修复：监听 tbody 的子节点变化 ---
        if (tableBodyObserver) tableBodyObserver.disconnect(); // 如果已存在，先断开
        tableBodyObserver = new MutationObserver((mutations) => {
            // 检查是否有节点被添加
            const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
            if (hasAddedNodes) {
                console.log('检测到新行，重新应用筛选。');
                updateDisplay(); // 当新行被添加时，重新执行筛选逻辑
            }
        });
        tableBodyObserver.observe(tbody, { childList: true });
    }

    function analyzeAndDisplayHotwords() {
        const toolbar = document.querySelector('.gm-sticky-toolbar');
        let hotwordArea = document.getElementById('gm-hotword-display-area');
        if (hotwordArea) hotwordArea.remove();
        const wordCounts = {};
        const stopWords = new Set(['的', '了', '我', '你', '他', '她', '之', '什么', '一个', '这个', '那个']);
        allTableRows.forEach(r => {
            const originalTitle = r.cells[1]?.querySelector('a')?.textContent.trim();
            if (!originalTitle) return;
            const cleanedTitle = originalTitle.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
            for (let i = 0; i < cleanedTitle.length - 1; i += 2) {
                const word = cleanedTitle.substring(i, i + 2);
                if (word.length === 2 && !stopWords.has(word) && !/\d/.test(word)) {
                    wordCounts[word] = (wordCounts[word] || 0) + 1;
                }
            }
        });
        const sortedWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 30);
        hotwordArea = document.createElement('div');
        hotwordArea.id = 'gm-hotword-display-area';
        toolbar.appendChild(hotwordArea);
        sortedWords.forEach(([word, count]) => {
            const tag = document.createElement('span');
            tag.className = 'gm-hotword-tag';
            tag.textContent = `${word} (${count})`;
            tag.dataset.word = word;
            hotwordArea.appendChild(tag);
        });
        const clearBtn = document.createElement('div');
        clearBtn.id = 'gm-hotword-clear-btn';
        clearBtn.textContent = '清除热词筛选';
        hotwordArea.appendChild(clearBtn);
        hotwordArea.addEventListener('click', e => {
            const target = e.target;
            if (target.classList.contains('gm-hotword-tag')) {
                const word = target.dataset.word;
                if (target.classList.contains('active')) {
                    activeHotword = null;
                    target.classList.remove('active');
                } else {
                    hotwordArea.querySelectorAll('.gm-hotword-tag.active').forEach(t => t.classList.remove('active'));
                    target.classList.add('active');
                    activeHotword = word;
                }
            } else if (target.id === 'gm-hotword-clear-btn') {
                activeHotword = null;
                hotwordArea.querySelectorAll('.gm-hotword-tag.active').forEach(t => t.classList.remove('active'));
            }
            clearBtn.style.display = activeHotword ? 'block' : 'none';
            updateDisplay();
        });
    }

    function createMultiSelect(options, label, onChangeCallback) {
        const container = document.createElement('div');
        container.className = 'gm-multiselect-container';

        container.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
        });

        const button = document.createElement('button');
        button.className = 'gm-multiselect-button';
        button.textContent = label;
        container.appendChild(button);
        const dropdown = document.createElement('div');
        dropdown.className = 'gm-multiselect-dropdown';
        container.appendChild(dropdown);
        dropdown.innerHTML = `<button class="gm-multiselect-clear-btn">全部取消</button>${options.map(opt => `<label><input type="checkbox" value="${opt.name}"> ${opt.name} (${opt.count})</label>`).join('')}`;

        button.addEventListener('click', e => {
            e.stopPropagation();
            document.querySelectorAll('.gm-multiselect-dropdown.show').forEach(d => { if (d !== dropdown) d.classList.remove('show'); });
            dropdown.classList.toggle('show');
        });

        dropdown.addEventListener('change', () => {
            onChangeCallback();
        });

        dropdown.querySelector('.gm-multiselect-clear-btn').addEventListener('click', e => {
            e.stopPropagation();
            dropdown.querySelectorAll('input:checked').forEach(c => { c.checked = false; });
            onChangeCallback();
        });

        document.addEventListener('click', () => dropdown.classList.remove('show'));
        dropdown.addEventListener('click', e => e.stopPropagation());

        return { container, getSelected: () => Array.from(dropdown.querySelectorAll('input:checked')).map(input => input.value) };
    }

    const initialObserver = new MutationObserver((mutationsList, observer) => {
        const table = document.querySelector('.table-bordered');
        if (table) {
            observer.disconnect();
            initializeControls(table);
        }
    });

    initialObserver.observe(document.body, { childList: true, subtree: true });

})();