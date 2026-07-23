// app.js

import { loadSettings } from './config.js';
import { initDevTools, applyFeatureToggles } from './utils.js';
import { loadCanvasData, loadQuizIndex } from './quiz-data.js';
import { QuizInstance } from './QuizInstance.js';

let viewMode = 1;
export let quizInstances = [];
window.isOfflineMode = false;
window.appConfig = null;

// The main initialization function
function initApp() {
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

    // Capture global PySide6 Keyboard shortcuts directly inside the application bounds
    document.addEventListener('keydown', (e) => {
        // STRICT GUARD: Only allow shortcuts if we are running from the offline Python server
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

    // Detect if we are serving from the offline desktop server by hitting config unified endpoint
    fetch('/api/config')
        .then(res => {
            if(res.ok) return res.json();
            throw new Error("Not offline server.");
        })
        .then(data => {
            if (data.is_offline_mode) {
                console.log("[DEBUG] Running in Offline Desktop Mode via Unified API!");
                window.isOfflineMode = true; 
                window.appConfig = data;
                
                // Show modal automatically if new unmapped files exist
                const existingNames = new Set();
                const grades = ["6", "7", "8"];
                grades.forEach(g => {
                    if (data.canvas[g]) {
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
                const unmapped = data.quizzes.filter(q => !existingNames.has(q.name) && !ignored.includes(q.name));
                
                if (unmapped.length > 0) {
                    // Force the mapper window open on launch if there are new unhandled quizzes
                    window.openMappingManager();
                }
            }
        })
        .catch(err => {
            console.log("[DEBUG] Running on standard GitHub Pages web mode.");
            window.isOfflineMode = false;
        })
        .finally(() => {
            // Sequence critical loaders
            loadSettings().then(() => {
                return loadQuizIndex(); // Inject dynamic paths BEFORE checking Canvas
            }).then(() => {
                return loadCanvasData();
            }).then(() => {
                applyFeatureToggles();
                console.log("[DEBUG] Data loaded. Setting initial view mode to 1.");
                setViewMode(1);
            });
        });
}

// Safely handle the ES Module loading race condition
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
    
    // Automatically load the default webhook URL from the submission script if it was originally empty
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
    
    window.appConfig.quizzes.forEach(quiz => {
        if (search && !quiz.name.toLowerCase().includes(search)) return;
        if (quizzesToDelete.includes(quiz.name)) return;

        const row = document.createElement('div');
        row.className = 'mapping-row';
        
        const nameEl = document.createElement('span'); 
        nameEl.innerText = quiz.name;
        nameEl.style.fontWeight = "bold";
        
        const ptsEl = document.createElement('span'); 
        ptsEl.innerText = `${quiz.points} pts`;
        
        const classesContainer = document.createElement('div');
        classesContainer.className = 'class-toggles';
        const allClasses = ["G6A", "G6B", "G6C", "G7A", "G7B", "G7C", "G8A", "G8B", "G8C"];
        
        // Determine mapping assignment from memory
        let assigned = getQuizMapping(quiz.name, window.appConfig.canvas);
        
        allClasses.forEach(cls => {
            const btn = document.createElement('div');
            btn.className = `class-toggle ${assigned.includes(cls) ? 'active' : ''}`;
            btn.innerText = cls;
            btn.onclick = () => btn.classList.toggle('active');
            classesContainer.appendChild(btn);
        });
        
        const ignoreContainer = document.createElement('div');
        const ignoreCb = document.createElement('input');
        ignoreCb.type = 'checkbox';
        ignoreCb.checked = (window.appConfig.ignore || []).includes(quiz.name);
        ignoreCb.onchange = () => {
            if (ignoreCb.checked) {
                classesContainer.style.opacity = '0.5';
                classesContainer.style.pointerEvents = 'none';
            } else {
                classesContainer.style.opacity = '1';
                classesContainer.style.pointerEvents = 'auto';
            }
        };
        ignoreCb.onchange(); // trigger immediate evaluation
        ignoreContainer.appendChild(ignoreCb);
        
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
        row.appendChild(classesContainer);
        row.appendChild(ignoreContainer);
        row.appendChild(actionContainer);
        
        row.dataset.quizName = quiz.name;
        row.getAssigned = () => Array.from(classesContainer.querySelectorAll('.active')).map(b => b.innerText);
        row.isIgnored = () => ignoreCb.checked;
        
        list.appendChild(row);
    });
}

document.getElementById('mapping-search')?.addEventListener('input', renderMappingList);

window.saveMappingConfig = function() {
    const rows = document.getElementById('mapping-list').querySelectorAll('.mapping-row');
    let newIgnore = [];
    let updates = [];
    
    rows.forEach(row => {
        const qname = row.dataset.quizName;
        if (row.isIgnored()) {
            newIgnore.push(qname);
        } else {
            const targets = row.getAssigned();
            if (targets.length > 0) {
                updates.push({ name: qname, targets: targets });
            }
        }
    });
    
    window.appConfig.ignore = newIgnore;
    window.appConfig.canvas = rebuildCanvasJson(window.appConfig.canvas, updates);
    
    postConfig({ 
        ignore: newIgnore, 
        canvas: window.appConfig.canvas,
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