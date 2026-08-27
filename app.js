// app.js

import { loadSettings, updateAppSettings, getCurrentMondayDateStr, getCurrentTeachingWeekInfo, appSettings, getSubjectsForGrade } from './config.js';
import { initDevTools, applyFeatureToggles, generateQRCodeSVG } from './utils.js';
import { loadCanvasData, loadQuizIndex, loadIgnoreData, setCanvasData, setIgnoreData } from './quiz-data.js';
import { QuizInstance } from './QuizInstance.js';

let viewMode = 1;
export let quizInstances = [];
window.isOfflineMode = false;
window.appConfig = null;

// Global mapping editor state to avoid losing un-rendered rows during search filtering
let mappingState = {};

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

    // Detect offline desktop server and initialize data
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
                    const gradeObj = data.canvas[g];
                    Object.entries(gradeObj).forEach(([k, val]) => {
                        if (typeof val === 'object' && val !== null) {
                            Object.entries(val).forEach(([subK, subVal]) => {
                                if (typeof subVal === 'object' && subVal !== null) {
                                    Object.keys(subVal).forEach(q => existingNames.add(q));
                                } else {
                                    existingNames.add(subK);
                                }
                            });
                        } else {
                            existingNames.add(k);
                        }
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

    // In online mode or fallback mode, load independent static datasets
    if (!window.isOfflineMode) {
        await Promise.all([
            loadSettings(),
            loadQuizIndex(),
            loadIgnoreData(),
            loadCanvasData()
        ]);
    } else {
        await loadQuizIndex();
    }

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
    if (!window.appConfig) window.appConfig = {};
    window.appConfig.autolink = {
        enabled: document.getElementById('autolink-enable').checked,
        webhook_url: document.getElementById('autolink-url').value.trim()
    };
    postConfig({ autolink: window.appConfig.autolink })
        .then(() => window.closeModals())
        .catch(err => alert("Failed to save Autolink configuration: " + err.message));
};

window.openFolderConfigDialog = function() {
    if (!window.appConfig) return alert("Folder configuration requires the Desktop offline application.");
    document.getElementById('folder-path').value = window.appConfig.folder || '0_Quiz';
    
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('folder-modal').classList.remove('hidden');
};

window.saveFolderConfig = function() {
    if (!window.appConfig) window.appConfig = {};
    window.appConfig.folder = document.getElementById('folder-path').value.trim();
    postConfig({ folder: window.appConfig.folder })
        .then(() => {
            alert("Folder configuration saved.\nPlease restart the application for changes to take effect.");
            window.closeModals();
        })
        .catch(err => alert("Failed to save folder configuration: " + err.message));
};

let quizzesToDelete = [];

window.openMappingManager = function() {
    if (!window.appConfig) return alert("Mapping manager requires the Desktop offline application.");
    quizzesToDelete = [];
    
    // Initialize full mappingState for all quizzes so searching doesn't drop quizzes
    mappingState = {};
    const ignoredList = window.appConfig.ignore || [];
    (window.appConfig.quizzes || []).forEach(quiz => {
        mappingState[quiz.name] = {
            isIgnored: ignoredList.includes(quiz.name),
            targets: getQuizMapping(quiz.name, window.appConfig.canvas)
        };
    });

    renderSubjectManager();
    renderMappingList();
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('mapping-modal').classList.remove('hidden');
};

// --- SUBJECT MANAGEMENT GUI (Add, Rename, Remove, Toggle) ---
function renderSubjectManager() {
    const container = document.getElementById('subject-manager-container');
    if (!container) return;
    container.innerHTML = '';

    const currentSubjects = appSettings.subjects || { "6": [], "7": ["Computer Science (CS)", "STEAM"], "8": [] };
    const grades = ["6", "7", "8"];

    grades.forEach(grade => {
        const gradeSec = document.createElement('div');
        gradeSec.className = 'subject-grade-section';

        const gradeHeader = document.createElement('div');
        gradeHeader.className = 'subject-grade-header';
        gradeHeader.innerHTML = `<strong>Grade ${grade} Subjects:</strong>`;

        const subList = document.createElement('div');
        subList.className = 'subject-pills-list';

        const subs = currentSubjects[grade] || [];

        if (subs.length === 0) {
            const noSub = document.createElement('span');
            noSub.className = 'no-subjects-label';
            noSub.innerText = 'No separate subjects (Single Class)';
            subList.appendChild(noSub);
        } else {
            subs.forEach((subName, subIdx) => {
                const pill = document.createElement('div');
                pill.className = 'subject-pill';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'subject-name-text';
                nameSpan.innerText = subName;

                const editBtn = document.createElement('button');
                editBtn.className = 'btn-pill-action btn-rename';
                editBtn.title = 'Rename Subject';
                editBtn.innerText = '✎';
                editBtn.onclick = () => {
                    const newName = prompt(`Rename subject "${subName}" for Grade ${grade}:`, subName);
                    if (newName && newName.trim() && newName.trim() !== subName) {
                        currentSubjects[grade][subIdx] = newName.trim();
                        renderSubjectManager();
                        renderMappingList();
                    }
                };

                const delBtn = document.createElement('button');
                delBtn.className = 'btn-pill-action btn-del';
                delBtn.title = 'Delete Subject';
                delBtn.innerText = '×';
                delBtn.onclick = () => {
                    if (confirm(`Remove subject "${subName}" from Grade ${grade}?`)) {
                        currentSubjects[grade].splice(subIdx, 1);
                        renderSubjectManager();
                        renderMappingList();
                    }
                };

                pill.appendChild(nameSpan);
                pill.appendChild(editBtn);
                pill.appendChild(delBtn);
                subList.appendChild(pill);
            });
        }

        const addRow = document.createElement('div');
        addRow.className = 'subject-add-row';

        const addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.placeholder = `Add subject to Grade ${grade}...`;
        addInput.className = 'subject-add-input';

        const addBtn = document.createElement('button');
        addBtn.className = 'btn-add-subject';
        addBtn.innerText = '+ Add';
        addBtn.onclick = () => {
            const val = addInput.value.trim();
            if (!val) return;
            if (!currentSubjects[grade]) currentSubjects[grade] = [];
            if (!currentSubjects[grade].includes(val)) {
                currentSubjects[grade].push(val);
                addInput.value = '';
                renderSubjectManager();
                renderMappingList();
            } else {
                alert("This subject already exists for Grade " + grade);
            }
        };

        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addBtn.click();
        });

        addRow.appendChild(addInput);
        addRow.appendChild(addBtn);

        gradeSec.appendChild(gradeHeader);
        gradeSec.appendChild(subList);
        gradeSec.appendChild(addRow);
        container.appendChild(gradeSec);
    });
}

function renderMappingList() {
    const list = document.getElementById('mapping-list');
    if (!list) return;
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

    const grades = ["6", "7", "8"];
    const currentSubjects = appSettings.subjects || {};
    
    (window.appConfig?.quizzes || []).forEach(quiz => {
        if (search && !quiz.name.toLowerCase().includes(search)) return;
        if (quizzesToDelete.includes(quiz.name)) return;

        if (!mappingState[quiz.name]) {
            mappingState[quiz.name] = {
                isIgnored: (window.appConfig.ignore || []).includes(quiz.name),
                targets: getQuizMapping(quiz.name, window.appConfig.canvas)
            };
        }

        const currentAssigned = mappingState[quiz.name].targets || [];

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

        const allToggleButtons = [];

        const syncStateFromButtons = () => {
            mappingState[quiz.name].targets = allToggleButtons
                .filter(b => b.classList.contains('active'))
                .map(b => b.dataset.target);
        };

        grades.forEach(grade => {
            const subs = currentSubjects[grade] || [];
            const clsList = [`G${grade}A`, `G${grade}B`, `G${grade}C`];

            if (subs.length > 0) {
                const gradeGroup = document.createElement('div');
                gradeGroup.className = 'grade-subject-group';

                subs.forEach(sub => {
                    const subRow = document.createElement('div');
                    subRow.className = 'subject-toggle-row';

                    const subTag = document.createElement('span');
                    subTag.className = 'subject-tag-label';
                    subTag.innerText = `G${grade} [${sub}]:`;
                    subRow.appendChild(subTag);

                    const subAllBtn = document.createElement('div');
                    subAllBtn.className = 'quick-toggle';
                    subAllBtn.innerText = 'All';

                    const subClassBtns = [];
                    clsList.forEach(cls => {
                        const targetKey = `${cls}::${sub}`;
                        const isAct = currentAssigned.includes(targetKey) || currentAssigned.includes(cls);
                        const btn = document.createElement('div');
                        btn.className = `class-toggle ${isAct ? 'active' : ''}`;
                        btn.innerText = cls;
                        btn.dataset.target = targetKey;
                        btn.dataset.cls = cls;
                        btn.dataset.subject = sub;
                        btn.dataset.grade = grade;
                        btn.onclick = () => {
                            btn.classList.toggle('active');
                            updateSubAllState();
                            syncStateFromButtons();
                        };
                        subClassBtns.push(btn);
                        allToggleButtons.push(btn);
                    });

                    function updateSubAllState() {
                        const allActive = subClassBtns.every(b => b.classList.contains('active'));
                        subAllBtn.classList.toggle('active', allActive);
                    }

                    subAllBtn.onclick = () => {
                        const allActive = subClassBtns.every(b => b.classList.contains('active'));
                        subClassBtns.forEach(b => b.classList.toggle('active', !allActive));
                        updateSubAllState();
                        syncStateFromButtons();
                    };

                    updateSubAllState();

                    subRow.appendChild(subAllBtn);
                    subClassBtns.forEach(b => subRow.appendChild(b));
                    gradeGroup.appendChild(subRow);
                });

                classesCell.appendChild(gradeGroup);
            } else {
                const stdRow = document.createElement('div');
                stdRow.className = 'subject-toggle-row';

                const gradeTag = document.createElement('span');
                gradeTag.className = 'subject-tag-label';
                gradeTag.innerText = `G${grade}:`;
                stdRow.appendChild(gradeTag);

                const gradeAllBtn = document.createElement('div');
                gradeAllBtn.className = 'quick-toggle';
                gradeAllBtn.innerText = 'All';

                const clsBtns = [];
                clsList.forEach(cls => {
                    const isAct = currentAssigned.includes(cls);
                    const btn = document.createElement('div');
                    btn.className = `class-toggle ${isAct ? 'active' : ''}`;
                    btn.innerText = cls;
                    btn.dataset.target = cls;
                    btn.dataset.cls = cls;
                    btn.dataset.grade = grade;
                    btn.onclick = () => {
                        btn.classList.toggle('active');
                        updateGradeAllState();
                        syncStateFromButtons();
                    };
                    clsBtns.push(btn);
                    allToggleButtons.push(btn);
                });

                function updateGradeAllState() {
                    const allActive = clsBtns.every(b => b.classList.contains('active'));
                    gradeAllBtn.classList.toggle('active', allActive);
                }

                gradeAllBtn.onclick = () => {
                    const allActive = clsBtns.every(b => b.classList.contains('active'));
                    clsBtns.forEach(b => b.classList.toggle('active', !allActive));
                    updateGradeAllState();
                    syncStateFromButtons();
                };

                updateGradeAllState();

                stdRow.appendChild(gradeAllBtn);
                clsBtns.forEach(b => stdRow.appendChild(b));
                classesCell.appendChild(stdRow);
            }
        });
        
        const ignoreContainer = document.createElement('div');
        ignoreContainer.style.display = 'flex';
        ignoreContainer.style.alignItems = 'center';
        ignoreContainer.style.gap = '5px';

        const ignoreCb = document.createElement('input');
        ignoreCb.type = 'checkbox';
        ignoreCb.className = 'hide-checkbox';
        ignoreCb.checked = mappingState[quiz.name].isIgnored;
        
        ignoreCb.onchange = () => {
            mappingState[quiz.name].isIgnored = ignoreCb.checked;
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
                delete mappingState[quiz.name];
                renderMappingList();
            }
        };
        actionContainer.appendChild(delBtn);
        
        row.appendChild(nameEl);
        row.appendChild(ptsEl);
        row.appendChild(classesCell);
        row.appendChild(ignoreContainer);
        row.appendChild(actionContainer);
        
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
    let newIgnore = [];
    let updates = [];

    // Read from mappingState directly to ensure un-rendered/searched items are never lost
    Object.entries(mappingState).forEach(([qname, state]) => {
        if (quizzesToDelete.includes(qname)) return;

        if (state.isIgnored) {
            newIgnore.push(qname);
        }
        if (state.targets && state.targets.length > 0) {
            updates.push({ name: qname, targets: state.targets });
        }
    });
    
    // Save Settings (Teaching Week, Feature Toggles, & Subjects)
    const weekInput = document.getElementById('manual-week-input');
    const showBonusCb = document.getElementById('toggle-show-bonus');
    const showResultsCb = document.getElementById('toggle-show-results');

    if (!window.appConfig) window.appConfig = {};
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
    window.appConfig.settings.subjects = appSettings.subjects;

    updateAppSettings(window.appConfig.settings);
    applyFeatureToggles();

    window.appConfig.ignore = newIgnore;
    window.appConfig.canvas = rebuildCanvasJson(window.appConfig.canvas, updates);
    
    // Synchronize global in-memory state immediately
    setCanvasData(window.appConfig.canvas);
    setIgnoreData(newIgnore);

    postConfig({ 
        ignore: newIgnore, 
        canvas: window.appConfig.canvas,
        settings: window.appConfig.settings,
        delete_quizzes: quizzesToDelete 
    }).then(() => {
        window.appConfig.quizzes = (window.appConfig.quizzes || []).filter(q => !quizzesToDelete.includes(q.name));
        quizzesToDelete = [];
        window.closeModals();
        
        quizInstances.forEach(inst => {
            inst.initClassGrid();
            if (inst.selectedClass && inst.views.assignments.classList.contains('active')) {
                inst.loadAssignments(inst.selectedClass, inst.selectedSubject);
            }
        });
    }).catch(err => {
        alert("Failed to save changes to server: " + err.message);
    });
};

function postConfig(payload) {
    if (!window.isOfflineMode) return Promise.resolve();
    return fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP Server Error (${res.status})`);
        return res.json();
    });
}

function getQuizMapping(q_name, data) {
    let assigned = [];
    if (!data) return assigned;
    ["6", "7", "8"].forEach(grade => {
        if (data[grade]) {
            const gradeData = data[grade];
            
            // Check top-level quiz mapping (All classes in grade)
            if (gradeData[q_name] !== undefined && typeof gradeData[q_name] !== 'object') {
                assigned.push(`G${grade}A`, `G${grade}B`, `G${grade}C`);
            }

            // Check class or subject level mappings
            Object.entries(gradeData).forEach(([k, val]) => {
                if (typeof val === 'object' && val !== null) {
                    // Check if k is class (G7A) or Subject (Computer Science (CS))
                    if (k.startsWith(`G${grade}`)) {
                        const cls = k;
                        // Subkeys could be quiz names or subjects
                        Object.entries(val).forEach(([subK, subVal]) => {
                            if (typeof subVal === 'object' && subVal !== null) {
                                // subK is subject
                                if (subVal[q_name] !== undefined) {
                                    assigned.push(`${cls}::${subK}`);
                                }
                            } else if (subK === q_name) {
                                assigned.push(cls);
                            }
                        });
                    } else {
                        // k is subject
                        const subName = k;
                        Object.entries(val).forEach(([subK, subVal]) => {
                            if (typeof subVal === 'object' && subVal !== null) {
                                if (subVal[q_name] !== undefined) {
                                    assigned.push(`${subK}::${subName}`);
                                }
                            } else if (subK === q_name) {
                                [`G${grade}A`, `G${grade}B`, `G${grade}C`].forEach(cls => {
                                    assigned.push(`${cls}::${subName}`);
                                });
                            }
                        });
                    }
                }
            });
        }
    });
    return [...new Set(assigned)];
}

function rebuildCanvasJson(oldData, updates) {
    let finalData = { "6": {}, "7": {}, "8": {} };
    let nowStr = new Date().toISOString();
    
    updates.forEach(u => {
        if (!u.name || !u.targets) return;
        u.targets.forEach(target => {
            let cls = target;
            let subject = null;

            if (target.includes('::')) {
                const parts = target.split('::');
                cls = parts[0];
                subject = parts[1];
            }

            const grade = cls[1];
            if (!finalData[grade]) finalData[grade] = {};

            if (subject) {
                if (!finalData[grade][subject]) finalData[grade][subject] = {};
                if (!finalData[grade][subject][cls]) finalData[grade][subject][cls] = {};

                let ts = nowStr;
                try {
                    if (oldData?.[grade]?.[subject]?.[cls]?.[u.name]) ts = oldData[grade][subject][cls][u.name];
                    else if (oldData?.[grade]?.[cls]?.[subject]?.[u.name]) ts = oldData[grade][cls][subject][u.name];
                    else if (oldData?.[grade]?.[cls]?.[u.name]) ts = oldData[grade][cls][u.name];
                } catch(e) {}

                finalData[grade][subject][cls][u.name] = ts;
            } else {
                if (!finalData[grade][cls]) finalData[grade][cls] = {};

                let ts = nowStr;
                try {
                    if (oldData?.[grade]?.[cls]?.[u.name]) ts = oldData[grade][cls][u.name];
                    else if (oldData?.[grade]?.[u.name]) ts = oldData[grade][u.name];
                } catch(e) {}

                finalData[grade][cls][u.name] = ts;
            }
        });
    });

    return finalData;
}