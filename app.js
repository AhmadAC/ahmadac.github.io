// app.js

import { loadSettings, updateAppSettings, getCurrentMondayDateStr, getCurrentTeachingWeekInfo, appSettings, getSubjectsForGrade } from './config.js?v=2.2';
import { initDevTools, applyFeatureToggles, generateQRCodeSVG, isHeaderAssignment, cleanQuizTitle } from './utils.js?v=2.2';
import { loadCanvasData, loadQuizIndex, loadIgnoreData, setCanvasData, setIgnoreData, canvasData } from './quiz-data.js?v=2.2';
import { QuizInstance } from './QuizInstance.js?v=2.2';

let viewMode = 1;
export let quizInstances = [];
window.isOfflineMode = false;
window.appConfig = null;

// Global mapping editor state to avoid losing un-rendered rows during search filtering
let mappingState = {};
let quizzesToRename = {}; // Map of { originalNameOnDisk: newName }
let quizzesToDelete = [];

function applyOfflineZoomRestrictions() {
    // Lock viewport scaling for offline desktop executable mode
    const viewportMeta = document.getElementById('app-viewport');
    if (viewportMeta) {
        viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }

    // Intercept and prevent touch and gesture pinch-to-zoom exclusively in offline mode
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false });
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }, { passive: false });
}

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

    // Capture global keyboard shortcuts directly inside the application bounds
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

            // Apply pinch-to-zoom block ONLY for the offline executable mode
            applyOfflineZoomRestrictions();

            if (data.settings) updateAppSettings(data.settings);
            if (data.canvas) setCanvasData(data.canvas);
            if (data.ignore) setIgnoreData(data.ignore);
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

    setViewMode(1);
    applyFeatureToggles();
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
    applyFeatureToggles();
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

window.openMappingManager = function() {
    if (!window.appConfig) return alert("Mapping manager requires the Desktop offline application.");
    quizzesToDelete = [];
    quizzesToRename = {};
    
    // Initialize full mappingState for all quizzes so searching doesn't drop quizzes
    mappingState = {};
    const ignoredList = window.appConfig.ignore || [];
    if (!window.appConfig.quizzes) window.appConfig.quizzes = [];
    
    // Harvest any virtual header items from canvas data so they appear in editor
    const harvestHeaders = (node) => {
        if (!node || typeof node !== 'object') return;
        Object.entries(node).forEach(([k, v]) => {
            if (isHeaderAssignment(k)) {
                if (!window.appConfig.quizzes.some(q => q.name === k)) {
                    window.appConfig.quizzes.push({ name: k, points: 0, isHeader: true });
                }
            } else if (typeof v === 'object') {
                harvestHeaders(v);
            }
        });
    };
    harvestHeaders(window.appConfig.canvas);

    (window.appConfig.quizzes || []).forEach(quiz => {
        mappingState[quiz.name] = {
            isIgnored: ignoredList.includes(quiz.name),
            targets: getQuizMapping(quiz.name, window.appConfig.canvas),
            isHeader: isHeaderAssignment(quiz.name) || !!quiz.isHeader
        };
    });

    renderSubjectManager();
    renderHeaderBuilder();
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
                        renderHeaderBuilder();
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
                        renderHeaderBuilder();
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
                renderHeaderBuilder();
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

// --- ASSIGNMENT HEADER / NOTICE BUILDER GUI ---
function renderHeaderBuilder() {
    const container = document.getElementById('header-class-selector');
    if (!container) return;
    container.innerHTML = '';

    const currentSubjects = appSettings.subjects || {};
    const grades = ["6", "7", "8"];

    grades.forEach(grade => {
        const subs = currentSubjects[grade] || [];
        const clsList = [`G${grade}A`, `G${grade}B`, `G${grade}C`];

        if (subs.length > 0) {
            subs.forEach(sub => {
                clsList.forEach(cls => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'header-class-toggle';
                    btn.innerText = `${cls} [${sub}]`;
                    btn.dataset.target = `${cls}::${sub}`;
                    btn.dataset.grade = grade;
                    btn.dataset.subject = sub;
                    btn.dataset.cls = cls;
                    btn.onclick = () => btn.classList.toggle('active');
                    container.appendChild(btn);
                });
            });
        } else {
            clsList.forEach(cls => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'header-class-toggle';
                btn.innerText = cls;
                btn.dataset.target = cls;
                btn.dataset.grade = grade;
                btn.dataset.cls = cls;
                btn.onclick = () => btn.classList.toggle('active');
                container.appendChild(btn);
            });
        }
    });
}

window.handleHeaderPreset = function(preset) {
    const container = document.getElementById('header-class-selector');
    if (!container) return;
    const toggles = container.querySelectorAll('.header-class-toggle');

    // Update active highlight on preset buttons
    document.querySelectorAll('.header-target-presets .btn-preset').forEach(btn => {
        if (btn.getAttribute('onclick')?.includes(`'${preset}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    if (preset === 'clear') {
        toggles.forEach(t => t.classList.remove('active'));
    } else if (preset === 'all') {
        toggles.forEach(t => t.classList.add('active'));
    } else if (preset === 'cs') {
        toggles.forEach(t => {
            const sub = (t.dataset.subject || "").toLowerCase();
            const cls = (t.dataset.cls || "").toLowerCase();
            if (sub.includes('cs') || sub.includes('computer') || cls.includes('cs')) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }
        });
    } else if (preset === 'steam') {
        toggles.forEach(t => {
            const sub = (t.dataset.subject || "").toLowerCase();
            if (sub.includes('steam')) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }
        });
    } else if (['g6', 'g7', 'g8'].includes(preset)) {
        const gNum = preset[1];
        toggles.forEach(t => {
            if (t.dataset.grade === gNum) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }
        });
    }
};

window.addNewAssignmentHeader = function() {
    const textInput = document.getElementById('new-header-text');
    const weekInput = document.getElementById('new-header-week');
    if (!textInput || !weekInput) return;

    const labelText = textInput.value.trim();
    if (!labelText) {
        alert("Please enter header text (e.g. 'No HW' or 'Midterm Review').");
        textInput.focus();
        return;
    }

    let weekVal = weekInput.value.trim();
    let weekTag = "Notice";
    if (weekVal) {
        weekVal = weekVal.toUpperCase();
        weekTag = weekVal.startsWith('W') ? weekVal : `W${weekVal}`;
    }

    const selectedToggles = document.querySelectorAll('#header-class-selector .header-class-toggle.active');
    const chosenTargets = Array.from(selectedToggles).map(t => t.dataset.target);

    if (chosenTargets.length === 0) {
        alert("Please select at least one class or subject for this header.");
        return;
    }

    const fullHeaderName = `[HEADER] ${labelText} - ${weekTag}`;

    if (mappingState[fullHeaderName]) {
        alert(`A header named "${fullHeaderName}" already exists.`);
        return;
    }

    mappingState[fullHeaderName] = {
        isIgnored: false,
        targets: chosenTargets,
        isHeader: true
    };

    if (!window.appConfig.quizzes) window.appConfig.quizzes = [];
    window.appConfig.quizzes.unshift({
        name: fullHeaderName,
        points: 0,
        isHeader: true
    });

    textInput.value = '';
    weekInput.value = '';
    document.querySelectorAll('#header-class-selector .header-class-toggle').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.header-target-presets .btn-preset').forEach(b => b.classList.remove('active'));

    renderMappingList();
};

window.renameQuizPrompt = function(oldName) {
    const isHeader = isHeaderAssignment(oldName);
    
    let promptMsg = isHeader 
        ? `Rename header text:\n(Currently: "${oldName}")`
        : `Rename assignment:\n(WARNING: This will also rename the original .json file on disk!)\n\nEnter new assignment name:`;
        
    const newNameRaw = prompt(promptMsg, oldName);
    if (newNameRaw === null) return;
    
    let newName = newNameRaw.trim();
    if (!newName) {
        alert("Assignment name cannot be empty.");
        return;
    }
    
    if (newName === oldName) return;

    if (!isHeader && /[\\/:*?"<>|]/.test(newName)) {
        alert("Assignment name cannot contain invalid filename characters: \\ / : * ? \" < > |");
        return;
    }

    if (isHeader && !isHeaderAssignment(newName)) {
        newName = `[HEADER] ${newName}`;
    }

    if (mappingState[newName] && newName !== oldName) {
        alert(`An assignment named "${newName}" already exists in the list.`);
        return;
    }

    // Track rename for disk file renaming on server save
    if (!isHeader) {
        let rootOldName = oldName;
        for (const [orig, curr] of Object.entries(quizzesToRename)) {
            if (curr === oldName) {
                rootOldName = orig;
                break;
            }
        }
        quizzesToRename[rootOldName] = newName;
    }

    // Update mappingState
    if (mappingState[oldName]) {
        mappingState[newName] = mappingState[oldName];
        delete mappingState[oldName];
    } else {
        mappingState[newName] = {
            isIgnored: (window.appConfig?.ignore || []).includes(oldName),
            targets: getQuizMapping(oldName, window.appConfig?.canvas),
            isHeader: isHeader
        };
    }

    // Update in window.appConfig.quizzes
    if (window.appConfig && Array.isArray(window.appConfig.quizzes)) {
        const qObj = window.appConfig.quizzes.find(q => q.name === oldName);
        if (qObj) {
            qObj.name = newName;
        }
    }

    // Update order.json in-memory so position is preserved
    if (window.appConfig && window.appConfig.order) {
        Object.keys(window.appConfig.order).forEach(k => {
            if (Array.isArray(window.appConfig.order[k])) {
                window.appConfig.order[k] = window.appConfig.order[k].map(item => item === oldName ? newName : item);
            }
        });
    }

    // Update ignore array if present
    if (window.appConfig && Array.isArray(window.appConfig.ignore)) {
        const ignIdx = window.appConfig.ignore.indexOf(oldName);
        if (ignIdx > -1) {
            window.appConfig.ignore[ignIdx] = newName;
        }
    }

    renderMappingList();
};

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

        const isHeader = isHeaderAssignment(quiz.name) || !!quiz.isHeader;

        if (!mappingState[quiz.name]) {
            mappingState[quiz.name] = {
                isIgnored: (window.appConfig.ignore || []).includes(quiz.name),
                targets: getQuizMapping(quiz.name, window.appConfig.canvas),
                isHeader: isHeader
            };
        }

        const currentAssigned = mappingState[quiz.name].targets || [];

        const row = document.createElement('div');
        row.className = 'mapping-row';
        
        // Editable Name Element with Pencil Icon
        const nameEl = document.createElement('span'); 
        nameEl.className = 'mapping-quiz-name editable-quiz-name';
        nameEl.title = isHeader ? 'Click to rename header' : 'Click to rename assignment and file';

        if (isHeader) {
            const badge = document.createElement('span');
            badge.className = 'header-item-badge';
            badge.innerText = 'Header';
            nameEl.appendChild(badge);
        }

        const textSpan = document.createElement('span');
        textSpan.className = 'quiz-name-text';
        textSpan.innerText = isHeader ? cleanQuizTitle(quiz.name) : quiz.name;
        nameEl.appendChild(textSpan);

        const editIcon = document.createElement('span');
        editIcon.className = 'edit-pencil-icon';
        editIcon.innerHTML = '&#9998;';
        nameEl.appendChild(editIcon);

        nameEl.onclick = () => window.renameQuizPrompt(quiz.name);
        
        const ptsEl = document.createElement('span'); 
        ptsEl.className = 'mapping-quiz-pts';
        ptsEl.innerText = isHeader ? '0 pts' : `${quiz.points} pts`;
        
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
            const confirmMsg = isHeader
                ? `Remove header '${cleanQuizTitle(quiz.name)}'?`
                : `Are you sure you want to remove '${quiz.name}'?\nWARNING: This will also PHYSICALLY DELETE the JSON file from your folder on disk!`;
            if (confirm(confirmMsg)) {
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

    const renameList = Object.entries(quizzesToRename).map(([old_name, new_name]) => ({ old_name, new_name }));

    window.appConfig.ignore = newIgnore;
    window.appConfig.canvas = rebuildCanvasJson(window.appConfig.canvas, updates, quizzesToRename);
    
    // Synchronize global in-memory state immediately
    setCanvasData(window.appConfig.canvas);
    setIgnoreData(newIgnore);

    postConfig({ 
        ignore: newIgnore, 
        canvas: window.appConfig.canvas,
        settings: window.appConfig.settings,
        order: window.appConfig.order || {},
        delete_quizzes: quizzesToDelete,
        rename_quizzes: renameList
    }).then(() => {
        window.appConfig.quizzes = (window.appConfig.quizzes || []).filter(q => !quizzesToDelete.includes(q.name));
        quizzesToDelete = [];
        quizzesToRename = {};
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
                    if (k.startsWith(`G${grade}`)) {
                        const cls = k;
                        Object.entries(val).forEach(([subK, subVal]) => {
                            if (typeof subVal === 'object' && subVal !== null) {
                                if (subVal[q_name] !== undefined) {
                                    assigned.push(`${cls}::${subK}`);
                                }
                            } else if (subK === q_name) {
                                assigned.push(cls);
                            }
                        });
                    } else {
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

function rebuildCanvasJson(oldData, updates, renamesMap = {}) {
    let finalData = { "6": {}, "7": {}, "8": {} };
    let nowStr = new Date().toISOString();
    
    // Build reverse map to look up previous timestamps if an item was renamed
    const revRenames = {};
    if (renamesMap) {
        Object.entries(renamesMap).forEach(([oldN, newN]) => {
            revRenames[newN] = oldN;
        });
    }

    updates.forEach(u => {
        if (!u.name || !u.targets) return;
        const lookupName = revRenames[u.name] || u.name;

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
                    if (oldData?.[grade]?.[subject]?.[cls]?.[lookupName]) ts = oldData[grade][subject][cls][lookupName];
                    else if (oldData?.[grade]?.[cls]?.[subject]?.[lookupName]) ts = oldData[grade][cls][subject][lookupName];
                    else if (oldData?.[grade]?.[cls]?.[lookupName]) ts = oldData[grade][cls][lookupName];
                    else if (oldData?.[grade]?.[subject]?.[cls]?.[u.name]) ts = oldData[grade][subject][cls][u.name];
                } catch(e) {}

                finalData[grade][subject][cls][u.name] = ts;
            } else {
                if (!finalData[grade][cls]) finalData[grade][cls] = {};

                let ts = nowStr;
                try {
                    if (oldData?.[grade]?.[cls]?.[lookupName]) ts = oldData[grade][cls][lookupName];
                    else if (oldData?.[grade]?.[lookupName]) ts = oldData[grade][lookupName];
                    else if (oldData?.[grade]?.[cls]?.[u.name]) ts = oldData[grade][cls][u.name];
                } catch(e) {}

                finalData[grade][cls][u.name] = ts;
            }
        });
    });

    return finalData;
}