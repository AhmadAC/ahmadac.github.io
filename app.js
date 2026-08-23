// app.js

import { loadSettings, updateAppSettings, getCurrentMondayDateStr, getCurrentTeachingWeekInfo, appSettings } from './config.js';
import { initDevTools, applyFeatureToggles, generateQRCodeSVG } from './utils.js';
import { loadCanvasData, loadQuizIndex, loadIgnoreData, setCanvasData, setIgnoreData } from './quiz-data.js';
import { QuizInstance } from './QuizInstance.js';

let viewMode = 1;
export let quizInstances = [];
window.isOfflineMode = false;
window.appConfig = null;

// The main fast initialization function
async function initApp() {
    initDevTools();
    console.log("[DEBUG] Initializing App");
    const viewModeBtn = document.getElementById("view-mode-btn");
    if (viewModeBtn) viewModeBtn.addEventListener("click", cycleViewMode);
    
    // Theme toggler switch setup
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    if (themeToggleBtn) {
        const savedTheme = localStorage.getItem("app-theme");
        if (savedTheme === "dark") document.body.classList.add("dark-theme");
        
        themeToggleBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark-theme");
            const finalTheme = document.body.classList.contains("dark-theme") ? "dark" : "light";
            localStorage.setItem("app-theme", finalTheme);
            
            document.querySelectorAll('.document-iframe').forEach(iframe => {
                try {
                    if (iframe.contentDocument && iframe.contentDocument.body) {
                        if (finalTheme === "dark") iframe.contentDocument.body.classList.add("dark-theme");
                        else iframe.contentDocument.body.classList.remove("dark-theme");
                    }
                } catch (e) { }
            });
        });
    }

    // QR Code Modal setup (dismisses when clicking anywhere on the overlay, card, or QR code)
    const qrModalOverlay = document.getElementById("qr-modal-overlay");
    if (qrModalOverlay) {
        qrModalOverlay.addEventListener("click", () => {
            window.closeQRCodeModal();
        });
    }

    // Capture global PySide6 Keyboard shortcuts directly inside the application bounds
    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            window.closeQRCodeModal();
            window.closeModals();
            return;
        }

        if (!window.isOfflineMode) return;

        if (e.ctrlKey) {
            const key = e.key.toLowerCase();
            if (['1', '2', '3'].includes(key)) {
                e.preventDefault();
                setViewMode(parseInt(key, 10));
            } else if (key === '0' || key === 'm') {
                e.preventDefault();
                window.openMappingManager();
            } else if (key === '7') {
                e.preventDefault();
                window.openFolderConfigDialog();
            } else if (key === '8') {
                e.preventDefault();
                window.toggleRearrangeMode();
            } else if (key === '9' || key === 'l') {
                e.preventDefault();
                window.openAutolinkDialog();
            }
        }
    });

    // Detect offline desktop server and parallelize loader execution
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            const data = await res.json();
            window.isOfflineMode = true; 
            window.appConfig = data;
            document.body.classList.add('offline-mode');

            if (data.settings) updateAppSettings(data.settings);
            if (data.canvas) setCanvasData(data.canvas);
            if (data.ignore) setIgnoreData(data.ignore);
            
            // Check for new unmapped files
            const existingNames = new Set();
            const grades = ["6", "7", "8"];
            grades.forEach(g => {
                if (data.canvas && data.canvas[g]) {
                    Object.values(data.canvas[g]).forEach(val => {
                        if (typeof val === 'object') Object.keys(val).forEach(q => existingNames.add(q));
                        else existingNames.add(val);
                    });
                    Object.keys(data.canvas[g]).forEach(k => {
                        if(typeof data.canvas[g][k] !== 'object') existingNames.add(k);
                    });
                }
            });

            const ignored = data.ignore || [];
            const unmapped = (data.quizzes || []).filter(q => !existingNames.has(q.name) && !ignored.includes(q.name));
            if (unmapped.length > 0) {
                window.openMappingManager();
            }
        }
    } catch (err) {
        window.isOfflineMode = false;
        document.body.classList.remove('offline-mode');
    }

    // Load remaining datasets in parallel
    await Promise.all([
        loadSettings(),
        loadQuizIndex(),
        loadIgnoreData(),
        loadCanvasData()
    ]);

    applyFeatureToggles();
    setViewMode(1);
}

// Safely handle DOM loading state
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp(); 
}

function cycleViewMode() {
    viewMode = viewMode >= 3 ? 1 : viewMode + 1;
    setViewMode(viewMode);
}

function setViewMode(numScreens) {
    const masterContainer = document.getElementById("master-container");
    if (!masterContainer) return;
    
    masterContainer.innerHTML = "";
    quizInstances = [];
    
    for (let i = 0; i < numScreens; i++) {
        const template = document.getElementById("quiz-instance-template");
        const instanceNode = template.content.cloneNode(true);
        masterContainer.appendChild(instanceNode);
        const rootElement = masterContainer.lastElementChild;
        quizInstances.push(new QuizInstance(rootElement));
    }
}

// --- GLOBAL QR CODE MODAL HOOKS ---

window.openQRCodeModal = function() {
    const overlay = document.getElementById('qr-modal-overlay');
    const display = document.getElementById('qr-code-display');
    if (!overlay || !display) return;

    display.innerHTML = generateQRCodeSVG("https://ahmadac.github.io", 260);
    overlay.classList.remove('hidden');
};

window.closeQRCodeModal = function() {
    const overlay = document.getElementById('qr-modal-overlay');
    if (overlay) overlay.classList.add('hidden');
};

// --- GLOBAL MODAL AND SHORTCUT HOOKS ---

window.closeModals = function() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.querySelectorAll('.modal-container').forEach(m => m.classList.add('hidden'));
};

window.toggleRearrangeMode = function() {
    document.body.classList.toggle('rearrange-active');
};

window.openAutolinkDialog = function() {
    if (!window.appConfig) return alert("Autolink configuration requires the Desktop offline application.");
    
    const defaultWebhook = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=2cGDgH4Pcdag3rgX3j1BCgZ82ePKwD5S9Kcw84c7G6733Py3AHQnhgBnrqfcqYBu0e8mEpuBTkJj3HgqUstHB3zNoJdadg0y4A2TGOqElbp2";
    const storedUrl = window.appConfig.autolink?.webhook_url;
    
    document.getElementById('autolink-enable').checked = window.appConfig.autolink?.enabled || false;
    document.getElementById('autolink-url').value = storedUrl ? storedUrl : defaultWebhook;
    
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('autolink-modal').classList.remove('hidden');
};

window.saveAutolinkConfig = function() {
    window.appConfig.autolink = {
        enabled: document.getElementById('autolink-enable').checked,
        webhook_url: document.getElementById('autolink-url').value.trim()
    };
    postConfig({ autolink: window.appConfig.autolink });
    window.closeModals();
};

window.openFolderConfigDialog = function() {
    if (!window.appConfig) return alert("Folder configuration requires the Desktop offline application.");
    document.getElementById('folder-path').value = window.appConfig.folder || '0_Quiz';
    
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('folder-modal').classList.remove('hidden');
};

window.saveFolderConfig = function() {
    window.appConfig.folder = document.getElementById('folder-path').value.trim();
    postConfig({ folder: window.appConfig.folder });
    alert("Folder configuration saved.\nPlease restart the application for changes to take effect.");
    window.closeModals();
};

let quizzesToDelete = [];

window.openMappingManager = function() {
    if (!window.appConfig) return alert("Mapping manager requires the Desktop offline application.");
    quizzesToDelete = [];
    renderMappingList();
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('mapping-modal').classList.remove('hidden');
};

function renderMappingList() {
    const list = document.getElementById('mapping-list');
    list.innerHTML = '';
    const search = (document.getElementById('mapping-search').value || "").toLowerCase();

    // Teaching Week Control Bar setup
    const weekDisplay = document.getElementById('current-week-display');
    const weekInput = document.getElementById('manual-week-input');
    const weekInfo = getCurrentTeachingWeekInfo();

    if (weekDisplay) {
        weekDisplay.innerText = `W${weekInfo.weekNum} (${weekInfo.dateString})`;
    }

    if (weekInput) {
        weekInput.value = weekInfo.weekNum;
    }

    // Feature Toggles Checkboxes Setup
    const showBonusCb = document.getElementById('toggle-show-bonus');
    const showResultsCb = document.getElementById('toggle-show-results');

    if (showBonusCb) showBonusCb.checked = !!appSettings.show_bonus;
    if (showResultsCb) showResultsCb.checked = !!appSettings.show_results;
    
    (window.appConfig.quizzes || []).forEach(quiz => {
        if (search && !quiz.name.toLowerCase().includes(search)) return;
        if (quizzesToDelete.includes(quiz.name)) return;

        const row = document.createElement('div');
        row.className = 'mapping-row';
        
        const nameEl = document.createElement('span'); 
        nameEl.className = 'mapping-quiz-name';
        nameEl.innerText = quiz.name;
        
        const ptsEl = document.createElement('span'); 
        ptsEl.className = 'mapping-quiz-pts';
        ptsEl.innerText = `${quiz.points} pts`;
        
        const classesCell = document.createElement('div');
        classesCell.className = 'class-assignment-cell';

        const quickContainer = document.createElement('div');
        quickContainer.className = 'quick-toggles';

        const classesContainer = document.createElement('div');
        classesContainer.className = 'class-toggles';

        const allClasses = ["G6A", "G6B", "G6C", "G7A", "G7B", "G7C", "G8A", "G8B", "G8C"];
        
        // Determine mapping assignment from canvas data
        let assigned = getQuizMapping(quiz.name, window.appConfig.canvas);
        
        allClasses.forEach(cls => {
            const btn = document.createElement('div');
            btn.className = `class-toggle ${assigned.includes(cls) ? 'active' : ''}`;
            btn.innerText = cls;
            btn.dataset.cls = cls;
            btn.dataset.grade = cls[1];
            btn.onclick = () => {
                btn.classList.toggle('active');
                updateGroupToggles();
            };
            classesContainer.appendChild(btn);
        });

        // Quick Group Shortcut Buttons
        const btnAll = document.createElement('div');
        btnAll.className = 'quick-toggle';
        btnAll.innerText = 'All';

        const btnG6 = document.createElement('div');
        btnG6.className = 'quick-toggle';
        btnG6.innerText = 'G6';

        const btnG7 = document.createElement('div');
        btnG7.className = 'quick-toggle';
        btnG7.innerText = 'G7';

        const btnG8 = document.createElement('div');
        btnG8.className = 'quick-toggle';
        btnG8.innerText = 'G8';

        function updateGroupToggles() {
            const activeClasses = Array.from(classesContainer.querySelectorAll('.class-toggle.active')).map(b => b.dataset.cls);
            const hasG6 = ["G6A", "G6B", "G6C"].every(c => activeClasses.includes(c));
            const hasG7 = ["G7A", "G7B", "G7C"].every(c => activeClasses.includes(c));
            const hasG8 = ["G8A", "G8B", "G8C"].every(c => activeClasses.includes(c));
            const hasAll = allClasses.every(c => activeClasses.includes(c));

            btnG6.classList.toggle('active', hasG6);
            btnG7.classList.toggle('active', hasG7);
            btnG8.classList.toggle('active', hasG8);
            btnAll.classList.toggle('active', hasAll);
        }

        btnAll.onclick = () => {
            const activeCount = classesContainer.querySelectorAll('.class-toggle.active').length;
            const shouldSelect = activeCount < allClasses.length;
            classesContainer.querySelectorAll('.class-toggle').forEach(b => b.classList.toggle('active', shouldSelect));
            updateGroupToggles();
        };

        const setupGradeToggle = (btn, grade) => {
            btn.onclick = () => {
                const gradeBtns = classesContainer.querySelectorAll(`.class-toggle[data-grade="${grade}"]`);
                const allActive = Array.from(gradeBtns).every(b => b.classList.contains('active'));
                gradeBtns.forEach(b => b.classList.toggle('active', !allActive));
                updateGroupToggles();
            };
        };

        setupGradeToggle(btnG6, '6');
        setupGradeToggle(btnG7, '7');
        setupGradeToggle(btnG8, '8');

        updateGroupToggles();

        quickContainer.appendChild(btnAll);
        quickContainer.appendChild(btnG6);
        quickContainer.appendChild(btnG7);
        quickContainer.appendChild(btnG8);

        classesCell.appendChild(quickContainer);
        classesCell.appendChild(classesContainer);
        
        const ignoreContainer = document.createElement('div');
        ignoreContainer.style.display = 'flex';
        ignoreContainer.style.alignItems = 'center';
        ignoreContainer.style.gap = '5px';

        const ignoreCb = document.createElement('input');
        ignoreCb.type = 'checkbox';
        ignoreCb.className = 'hide-checkbox';
        ignoreCb.checked = (window.appConfig.ignore || []).includes(quiz.name);
        
        ignoreCb.onchange = () => {
            updateHideAllState();
        };
        ignoreContainer.appendChild(ignoreCb);

        const hideLabel = document.createElement('span');
        hideLabel.innerText = 'Hide';
        hideLabel.style.fontSize = '12px';
        hideLabel.style.color = '#ffffff';
        ignoreContainer.appendChild(hideLabel);
        
        const actionContainer = document.createElement('div');
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete';
        delBtn.innerText = 'Delete';
        delBtn.onclick = () => {
            if (confirm(`Are you sure you want to remove '${quiz.name}'?\nWARNING: This will also PHYSICALLY DELETE the JSON file from your folder on disk!`)) {
                quizzesToDelete.push(quiz.name);
                renderMappingList();
            }
        };
        actionContainer.appendChild(delBtn);
        
        row.appendChild(nameEl);
        row.appendChild(ptsEl);
        row.appendChild(classesCell);
        row.appendChild(ignoreContainer);
        row.appendChild(actionContainer);
        
        row.dataset.quizName = quiz.name;
        row.getAssigned = () => Array.from(classesContainer.querySelectorAll('.class-toggle.active')).map(b => b.dataset.cls || b.innerText);
        row.isIgnored = () => ignoreCb.checked;
        
        list.appendChild(row);
    });

    updateHideAllState();
}

function updateHideAllState() {
    const hideAllCb = document.getElementById('toggle-hide-all');
    if (!hideAllCb) return;
    const allCbs = document.querySelectorAll('#mapping-list .hide-checkbox');
    if (allCbs.length === 0) {
        hideAllCb.checked = false;
        hideAllCb.indeterminate = false;
        return;
    }
    let checkedCount = 0;
    allCbs.forEach(cb => { if (cb.checked) checkedCount++; });
    if (checkedCount === 0) {
        hideAllCb.checked = false;
        hideAllCb.indeterminate = false;
    } else if (checkedCount === allCbs.length) {
        hideAllCb.checked = true;
        hideAllCb.indeterminate = false;
    } else {
        hideAllCb.checked = false;
        hideAllCb.indeterminate = true;
    }
}

document.getElementById('manual-week-input')?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    const weekDisplay = document.getElementById('current-week-display');
    if (!weekDisplay) return;

    if (val !== "" && !isNaN(parseInt(val, 10))) {
        const targetWeekNum = parseInt(val, 10);
        const tempMonday = getCurrentMondayDateStr();
        const tempInfo = getCurrentTeachingWeekInfo({
            anchor_date: tempMonday,
            anchor_week: targetWeekNum,
            manual_week_override: null
        });
        weekDisplay.innerText = `W${tempInfo.weekNum} (${tempInfo.dateString})`;
    } else {
        const weekInfo = getCurrentTeachingWeekInfo();
        weekDisplay.innerText = `W${weekInfo.weekNum} (${weekInfo.dateString})`;
    }
});

document.getElementById('mapping-search')?.addEventListener('input', renderMappingList);

document.getElementById('toggle-hide-all')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    const allCbs = document.querySelectorAll('#mapping-list .hide-checkbox');
    allCbs.forEach(cb => {
        if (cb.checked !== checked) {
            cb.checked = checked;
            cb.dispatchEvent(new Event('change'));
        }
    });
});

window.saveMappingConfig = function() {
    const rows = document.getElementById('mapping-list').querySelectorAll('.mapping-row');
    let newIgnore = [];
    let updates = [];
    
    rows.forEach(row => {
        const qname = row.dataset.quizName;
        if (row.isIgnored()) {
            newIgnore.push(qname);
        }
        
        const targets = row.getAssigned();
        if (targets.length > 0) {
            updates.push({ name: qname, targets: targets });
        }
    });
    
    // Save Settings (Teaching Week & Feature Toggles)
    const weekInput = document.getElementById('manual-week-input');
    const showBonusCb = document.getElementById('toggle-show-bonus');
    const showResultsCb = document.getElementById('toggle-show-results');

    if (!window.appConfig.settings) window.appConfig.settings = {};

    if (weekInput && weekInput.value.trim() !== "" && !isNaN(parseInt(weekInput.value.trim(), 10))) {
        const newWeekNum = parseInt(weekInput.value.trim(), 10);
        const currentMonday = getCurrentMondayDateStr();
        
        window.appConfig.settings.anchor_date = currentMonday;
        window.appConfig.settings.anchor_week = newWeekNum;
        window.appConfig.settings.manual_week_override = null;
    }

    if (showBonusCb) window.appConfig.settings.show_bonus = showBonusCb.checked;
    if (showResultsCb) window.appConfig.settings.show_results = showResultsCb.checked;

    updateAppSettings(window.appConfig.settings);
    applyFeatureToggles();

    window.appConfig.ignore = newIgnore;
    window.appConfig.canvas = rebuildCanvasJson(window.appConfig.canvas, updates);
    
    postConfig({ 
        ignore: newIgnore, 
        canvas: window.appConfig.canvas,
        settings: window.appConfig.settings,
        delete_quizzes: quizzesToDelete 
    }).then(() => {
        window.appConfig.quizzes = window.appConfig.quizzes.filter(q => !quizzesToDelete.includes(q.name));
        window.closeModals();
        
        loadCanvasData().then(() => {
            quizInstances.forEach(inst => {
                if(inst.selectedClass && inst.views.assignments.classList.contains('active')) {
                    inst.loadAssignments(inst.selectedClass);
                }
            });
        });
    });
};

function postConfig(payload) {
    if (!window.isOfflineMode) return Promise.resolve();
    return fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

function getQuizMapping(q_name, data) {
    let assigned = [];
    if (!data) return assigned;
    ["6", "7", "8"].forEach(grade => {
        if (data[grade]) {
            const gradeData = data[grade];
            if (gradeData[q_name] !== undefined && typeof gradeData[q_name] !== 'object') {
                assigned.push(`G${grade}A`, `G${grade}B`, `G${grade}C`);
            } else {
                [`G${grade}A`, `G${grade}B`, `G${grade}C`].forEach(cls => {
                    if (gradeData[cls] && gradeData[cls][q_name] !== undefined) {
                        assigned.push(cls);
                    }
                });
            }
        }
    });
    return [...new Set(assigned)];
}

function rebuildCanvasJson(oldData, updates) {
    let temp = { "6": { "G6A": {}, "G6B": {}, "G6C": {} }, "7": { "G7A": {}, "G7B": {}, "G7C": {} }, "8": { "G8A": {}, "G8B": {}, "G8C": {} } };
    let nowStr = new Date().toISOString();
    
    updates.forEach(u => {
        if (!u.name || !u.targets) return;
        u.targets.forEach(cls => {
            const grade = cls[1];
            if (temp[grade] && temp[grade][cls]) {
                let ts = nowStr;
                if (oldData[grade] && oldData[grade][cls] && oldData[grade][cls][u.name]) ts = oldData[grade][cls][u.name];
                else if (oldData[grade] && oldData[grade][u.name]) ts = oldData[grade][u.name];
                temp[grade][cls][u.name] = ts;
            }
        });
    });
    
    let finalData = { "6": {}, "7": {}, "8": {} };
    ["6", "7", "8"].forEach(grade => {
        const classes = [`G${grade}A`, `G${grade}B`, `G${grade}C`];
        let allQuizzes = new Set();
        classes.forEach(c => Object.keys(temp[grade][c]).forEach(q => allQuizzes.add(q)));
        
        let canBeFlat = true;
        allQuizzes.forEach(q => {
            if (!temp[grade][classes[0]][q] || !temp[grade][classes[1]][q] || !temp[grade][classes[2]][q]) {
                canBeFlat = false;
            }
        });
        
        if (canBeFlat) {
            allQuizzes.forEach(q => finalData[grade][q] = temp[grade][classes[0]][q]);
        } else {
            classes.forEach(c => {
                if (Object.keys(temp[grade][c]).length > 0) {
                    finalData[grade][c] = temp[grade][c];
                }
            });
        }
    });
    return finalData;
}