// --- GLOBAL APP MANAGEMENT ---
let viewMode = 1;
let quizInstances =[];
let canvasData = {}; // Shared across all instances
const CLASSES =["G6A", "G6B", "G6C", "G7A", "G7B", "G7C", "G8A", "G8B", "G8C"];

document.addEventListener("DOMContentLoaded", () => {
    console.log("[DEBUG] DOMContentLoaded - Initializing App");
    const viewModeBtn = document.getElementById("view-mode-btn");
    if (viewModeBtn) viewModeBtn.addEventListener("click", cycleViewMode);
    
    loadCanvasData().then(() => {
        console.log("[DEBUG] Canvas data loaded. Setting initial view mode to 1.");
        setViewMode(1); // Start with 1 screen
    });
});

function cycleViewMode() {
    viewMode++;
    if (viewMode > 3) {
        viewMode = 1;
    }
    console.log(`[DEBUG] Cycled View Mode to: ${viewMode} screens`);
    setViewMode(viewMode);
}

function setViewMode(numScreens) {
    const masterContainer = document.getElementById("master-container");
    if (!masterContainer) {
        console.error("[DEBUG] master-container not found in DOM!");
        return;
    }
    
    masterContainer.innerHTML = "";
    quizInstances =[];
    console.log(`[DEBUG] Injecting ${numScreens} quiz instance(s) into the DOM`);

    for (let i = 0; i < numScreens; i++) {
        const template = document.getElementById("quiz-instance-template");
        if (!template) {
            console.error("[DEBUG] quiz-instance-template not found in DOM!");
            continue;
        }
        
        const instanceNode = template.content.cloneNode(true);
        masterContainer.appendChild(instanceNode);
        const rootElement = masterContainer.lastElementChild;
        quizInstances.push(new QuizInstance(rootElement));
    }
}

async function loadCanvasData() {
    try {
        console.log("[DEBUG] Fetching canvas.json...");
        const response = await fetch('0_Quiz/canvas.json');
        if (!response.ok) throw new Error(`Could not find canvas.json (Status: ${response.status})`);
        canvasData = await response.json();
        console.log("[DEBUG] Successfully loaded canvas.json:", canvasData);
    } catch (e) {
        console.warn("[DEBUG] Using fallback empty canvas.json structure. Error:", e.message);
        canvasData = { "6": {}, "7": {}, "8": {} };
    }
}

async function checkQuizExists(quizName) {
    try {
        const res = await fetch(`0_Quiz/${quizName}.json`, { method: 'HEAD' });
        if (!res.ok) console.warn(`[DEBUG] checkQuizExists failed for ${quizName}.json`);
        return res.ok;
    } catch {
        console.warn(`[DEBUG] checkQuizExists network error for ${quizName}.json`);
        return false;
    }
}

function normalizeQuizData(raw) {
    let items =[];
    if (Array.isArray(raw)) {
        items = raw;
    } else if (raw && typeof raw === 'object') {
        if (raw.multisheet && Array.isArray(raw.sheets)) {
            raw.sheets.forEach(sheet => {
                if (sheet.data && sheet.headers) {
                    sheet.data.forEach(row => {
                        let item = {};
                        sheet.headers.forEach((h, i) => item[h] = row[i]);
                        items.push(item);
                    });
                }
            });
        } else if (raw.data && raw.headers) {
            raw.data.forEach(row => {
                let item = {};
                raw.headers.forEach((h, i) => item[h] = row[i]);
                items.push(item);
            });
        } else {
            Object.values(raw).forEach(val => {
                if (val && typeof val === 'object') items.push(val);
            });
        }
    }
    
    const filtered = items.filter(d => 
        d['question text'] || d['question_text'] || 
        d['Question Text'] || d['Question_Text'] ||
        d.question || d.Question
    );
    console.log(`[DEBUG] Normalized quiz data from ${raw ? 'object/array' : 'null'} into ${filtered.length} usable questions.`);
    return filtered;
}

// --- QUIZ INSTANCE CLASS ---
class QuizInstance {
    constructor(rootElement) {
        this.root = rootElement;
        this.instanceId = Date.now() + Math.floor(Math.random() * 1000); 
        console.log(`[DEBUG] Initializing QuizInstance ID: ${this.instanceId}`);
        
        this.selectedClass = null;
        this.currentQuizName = null;
        this.currentQuestions =[];
        this.sidebarButtons =[];
        this.matchingStates = {};
        this.selectedBankWord = null;
        this.selectedSlot = null;
        this.activeMatchingQuestionId = null;
        this.finalStudentName = null;
        this.finalStudentClass = null;
        this.finalScore = 0;
        this.finalTotalPossible = 0;

        this.views = {
            classSelect: this.root.querySelector('.view-class-select'),
            assignments: this.root.querySelector('.view-assignments'),
            quiz: this.root.querySelector('.view-quiz'),
            results: this.root.querySelector('.view-results')
        };
        
        this.elements = {
            classGrid: this.root.querySelector('.class-grid'),
            assignmentsTitle: this.root.querySelector('.assignments-title'),
            assignmentList: this.root.querySelector('.assignment-list'),
            quizTitle: this.root.querySelector('.quiz-title-lbl'),
            quizProgress: this.root.querySelector('.quiz-progress-lbl'),
            stickyBank: this.root.querySelector('.sticky-word-bank'),
            scrollArea: this.root.querySelector('.quiz-scroll-area'),
            sidebarList: this.root.querySelector('.sidebar-list'),
            quizContent: this.root.querySelector('.quiz-content'),
            resultBox: this.root.querySelector('.quiz-result-box'),
            resultText: this.root.querySelector('.quiz-result-text'),
            errorMsg: this.root.querySelector('.quiz-error-msg'),
            btnSubmit: this.root.querySelector('.btn-submit-quiz'),
            btnRedo: this.root.querySelector('.btn-redo-quiz'),
            btnSavePic: this.root.querySelector('.btn-save-picture'),
            resultsList: this.root.querySelector('.results-list'),
            btnJumpTop: this.root.querySelector('.btn-jump-top'),
            btnJumpBottom: this.root.querySelector('.btn-jump-bottom')
        };
        
        this.init();
    }

    init() {
        this.initClassGrid();
        this.addEventListeners();
    }

    switchView(viewClass) {
        console.log(`[DEBUG][Inst ${this.instanceId}] Switching view to ${viewClass}`);
        Object.values(this.views).forEach(v => {
            if (v) v.classList.remove('active');
        });
        const targetView = this.root.querySelector(`.${viewClass}`);
        if (targetView) targetView.classList.add('active');
    }

    addEventListeners() {
        this.root.querySelector('.btn-view-results')?.addEventListener('click', () => this.showResultsPage());
        this.root.querySelector('.btn-back-to-class')?.addEventListener('click', () => this.switchView('view-class-select'));
        this.root.querySelector('.btn-back-to-class-from-results')?.addEventListener('click', () => this.switchView('view-class-select'));
        this.root.querySelector('.btn-back-to-assignments')?.addEventListener('click', () => this.switchView('view-assignments'));

        this.elements.btnJumpTop?.addEventListener('click', () => this.elements.scrollArea?.scrollTo({ top: 0, behavior: 'smooth' }));
        this.elements.btnJumpBottom?.addEventListener('click', () => this.elements.scrollArea?.scrollTo({ top: this.elements.scrollArea.scrollHeight, behavior: 'smooth' }));
        this.elements.btnSubmit?.addEventListener('click', () => this.submitQuiz());
        this.elements.btnRedo?.addEventListener('click', () => this.resetQuiz());
        this.elements.btnSavePic?.addEventListener('click', () => this.saveResultAsImage());
        this.elements.scrollArea?.addEventListener('scroll', () => this.handleScrollStickyBank());
    }

    initClassGrid() {
        if (!this.elements.classGrid) return;
        this.elements.classGrid.innerHTML = "";
        CLASSES.forEach(cls => {
            const btn = document.createElement("button");
            btn.className = "btn-class";
            btn.innerText = cls;
            btn.onclick = () => {
                console.log(`[DEBUG][Inst ${this.instanceId}] Class selected: ${cls}`);
                this.loadAssignments(cls);
            };
            this.elements.classGrid.appendChild(btn);
        });
    }

    createAssignmentButton(title, exists) {
        let btn = document.createElement("button");
        btn.className = "btn-assignment";
        if (!exists) {
            btn.innerText = `${title} (File Missing)`;
            btn.disabled = true;
        } else {
            btn.innerText = title;
            btn.onclick = () => {
                console.log(`[DEBUG][Inst ${this.instanceId}] Assignment selected: ${title}`);
                this.startQuiz(title);
            };
        }
        return btn;
    }

    async renderPreviousAssignments(titles, buttonToRemove) {
        console.log(`[DEBUG][Inst ${this.instanceId}] Rendering previous assignments...`);
        const list = this.elements.assignmentList;
        if (!list) return;

        const existenceChecks = titles.map(async (title) => {
            const exists = await checkQuizExists(title);
            return { title, exists };
        });

        const results = await Promise.all(existenceChecks);

        results.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));

        const fragment = document.createDocumentFragment();
        results.forEach(result => {
            let btn = this.createAssignmentButton(result.title, result.exists);
            fragment.appendChild(btn);
        });
        
        list.insertBefore(fragment, buttonToRemove);
        buttonToRemove.remove();
        console.log(`[DEBUG][Inst ${this.instanceId}] Rendered ${results.length} previous assignments.`);
    }

    async loadAssignments(classCode) {
        this.selectedClass = classCode;
        if (this.elements.assignmentsTitle) this.elements.assignmentsTitle.innerText = `Assignments for ${classCode}`;
        
        const list = this.elements.assignmentList;
        if (!list) return;
        list.innerHTML = "Loading...";
        
        this.switchView("view-assignments");

        let grade = classCode[1];
        let assignmentsDict = {};

        if (grade === '6' && canvasData['6']?.[classCode]) {
            assignmentsDict = canvasData['6'][classCode];
        } else if (grade === '7' && canvasData['7']) {
            assignmentsDict = canvasData['7'];
        } else if (grade === '8' && canvasData['8']) {
            assignmentsDict = canvasData['8'];
        }

        let validTitles = Object.keys(assignmentsDict).filter(k => typeof assignmentsDict[k] !== 'object');
        validTitles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        list.innerHTML = "";

        if (validTitles.length === 0) {
            console.warn(`[DEBUG][Inst ${this.instanceId}] No assignments found in canvas.json for class ${classCode}`);
            list.innerHTML = "<p style='color:#666; font-style:italic;'>No assignments found.</p>";
            return;
        }

        const latestTitles = validTitles.slice(-5);
        const previousTitles = validTitles.slice(0, -5);

        if (previousTitles.length > 0) {
            const showMoreBtn = document.createElement("button");
            showMoreBtn.className = "btn-show-previous";
            showMoreBtn.innerText = `Show ${previousTitles.length} previous assignments...`;
            showMoreBtn.onclick = () => {
                showMoreBtn.innerText = "Loading...";
                showMoreBtn.disabled = true;
                this.renderPreviousAssignments(previousTitles, showMoreBtn);
            };
            list.appendChild(showMoreBtn);
        }

        console.log(`[DEBUG][Inst ${this.instanceId}] Checking existence of ${latestTitles.length} latest assignments...`);
        const existenceChecks = latestTitles.map(async (title) => {
            const exists = await checkQuizExists(title);
            return { title, exists };
        });

        const results = await Promise.all(existenceChecks);

        results.forEach(result => {
            let btn = this.createAssignmentButton(result.title, result.exists);
            list.appendChild(btn);
        });
    }

    async startQuiz(quizName) {
        console.log(`[DEBUG][Inst ${this.instanceId}] Fetching quiz data for: ${quizName}`);
        this.currentQuizName = quizName;
        
        if (this.elements.sidebarList) this.elements.sidebarList.innerHTML = "";
        this.sidebarButtons =[];
        
        if (this.elements.quizTitle) this.elements.quizTitle.innerText = quizName;
        this.elements.resultBox?.classList.add("hidden");
        this.elements.btnSubmit?.classList.remove("hidden");
        this.elements.btnSubmit.disabled = false;
        this.elements.btnRedo?.classList.add("hidden");
        this.elements.btnSavePic?.classList.add("hidden");
        if (this.elements.errorMsg) this.elements.errorMsg.innerText = "";
        this.elements.stickyBank?.classList.add("hidden");
        this.elements.btnJumpTop?.classList.add("hidden");
        this.elements.btnJumpBottom?.classList.add("hidden");

        const container = this.elements.quizContent;
        if (container) container.innerHTML = "Loading...";
        
        this.switchView("view-quiz");
        if (this.elements.scrollArea) this.elements.scrollArea.scrollTop = 0;

        try {
            const res = await fetch(`0_Quiz/${quizName}.json`);
            if (!res.ok) throw new Error(`File missing or server error (${res.status})`);
            const rawData = await res.json();
            console.log(`[DEBUG][Inst ${this.instanceId}] Raw quiz JSON loaded successfully.`, rawData);

            let randomizeQuestions = true;
            if (Array.isArray(rawData)) {
                const metaItem = rawData.find(item => item && item.quiz_metadata);
                if (metaItem && metaItem.quiz_metadata.randomize_questions !== undefined) {
                    randomizeQuestions = metaItem.quiz_metadata.randomize_questions;
                }
            } else if (rawData?.quiz_metadata) {
                if (rawData.quiz_metadata.randomize_questions !== undefined) {
                    randomizeQuestions = rawData.quiz_metadata.randomize_questions;
                }
            }
            console.log(`[DEBUG][Inst ${this.instanceId}] Randomize Questions setting:`, randomizeQuestions);

            let normalized = normalizeQuizData(rawData);

            // Normalize complex matching questions to support standard Canvas Format vs Raw format
            normalized.forEach(q => {
                const type = q.type || q.question_type;
                
                if (type === 'matching_question') {
                    if (Array.isArray(q.answers)) {
                        q.answers.forEach(p => {
                            if (p.answer_match_left !== undefined && p.text === undefined) p.text = String(p.answer_match_left);
                            if (p.answer_match_right !== undefined && p.answer_text === undefined) p.answer_text = String(p.answer_match_right);
                        });
                    }
                    
                    let distRaw = q.distractors || q.matching_answer_incorrect_matches;
                    if (typeof distRaw === 'string') {
                        q.distractors = distRaw.split('\n').map(d => d.trim()).filter(d => d.length > 0);
                    } else if (Array.isArray(distRaw)) {
                        q.distractors = distRaw;
                    } else {
                        q.distractors =[];
                    }
                }

                const isComplexMatching = type === 'matching_question' && q.answers && Array.isArray(q.answers) && q.answers.length > 0 && q.answers[0]?.text !== undefined;
                if (isComplexMatching) {
                    q.answers.sort(() => Math.random() - 0.5);
                }
            });

            let quizQuestions =[], adminQuestions =[];
            normalized.forEach(q => {
                let txt = (q['question text'] || q.question_text || q['Question Text'] || q['Question_Text'] || "").toLowerCase();
                if (txt.includes('select your class') || txt.includes('english name') || txt.includes('your name')) {
                    adminQuestions.push(q);
                } else {
                    quizQuestions.push(q);
                }
            });

            if (randomizeQuestions) {
                quizQuestions.sort(() => Math.random() - 0.5);
            }

            this.currentQuestions =[...quizQuestions, ...adminQuestions];
            console.log(`[DEBUG][Inst ${this.instanceId}] Total processed questions:`, this.currentQuestions.length);
            this.renderQuiz();
            
        } catch (e) {
            console.error(`[DEBUG][Inst ${this.instanceId}] Quiz Load Error:`, e);
            if (container) {
                container.innerHTML = `<p style="color:red; font-weight:bold; padding:20px;">Failed to load quiz data: ${e.message}</p>`;
            }
        }
    }

    renderQuiz() {
        console.log(`[DEBUG][Inst ${this.instanceId}] Rendering ${this.currentQuestions.length} questions to DOM.`);
        const container = this.elements.quizContent;
        if (!container) return;
        
        container.innerHTML = "";
        this.matchingStates = {};
        this.selectedBankWord = null;
        this.selectedSlot = null;
        this.activeMatchingQuestionId = null;

        let foundFirstAdmin = false;

        this.currentQuestions.forEach((q, idx) => {
            let qNum = idx + 1;
            let type = q.type || q.question_type;
            let qText = q['question text'] || q.question_text || q['Question Text'] || q['Question_Text'];
            let qTextLower = (qText || "").toLowerCase();
            let pts = parseInt(q.points || q.points_possible) || 0;
            let isComplexMatching = type === 'matching_question' && q.answers && Array.isArray(q.answers) && q.answers.length > 0 && q.answers[0]?.text !== undefined;
            let isAdmin = qTextLower.includes('select your class') || qTextLower.includes('english name') || qTextLower.includes('your name');
            
            let frame = document.createElement('div');
            frame.className = "question-frame";
            frame.dataset.questionIndex = idx;

            if (isAdmin && !foundFirstAdmin) {
                let spacer = document.createElement('div');
                spacer.style.height = "35vh";
                spacer.style.display = "flex";
                spacer.style.flexDirection = "column";
                spacer.style.alignItems = "center";
                spacer.style.justifyContent = "center";
                
                let hintLbl = document.createElement('div');
                hintLbl.innerText = "More questions below";
                hintLbl.style.color = "#666666";
                hintLbl.style.fontSize = "18px";
                hintLbl.style.fontWeight = "bold";
                hintLbl.style.fontStyle = "italic";
                
                let arrowBtn = document.createElement('button');
                arrowBtn.innerText = "▼";
                arrowBtn.style.background = "transparent";
                arrowBtn.style.color = "#111111";
                arrowBtn.style.fontSize = "80px";
                arrowBtn.style.border = "none";
                arrowBtn.style.marginTop = "-10px";
                arrowBtn.style.cursor = "pointer";
                arrowBtn.title = "Scroll down to finish the quiz";
                
                arrowBtn.onclick = () => {
                    let scrollArea = this.elements.scrollArea;
                    if (scrollArea) {
                        let offsetTop = frame.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top + scrollArea.scrollTop;
                        scrollArea.scrollTo({ top: offsetTop - 10, behavior: 'smooth' });
                    }
                };
                
                spacer.appendChild(hintLbl);
                spacer.appendChild(arrowBtn);
                container.appendChild(spacer);
                foundFirstAdmin = true;
            }
            
            let header = `
                <div class="question-header">
                    <span class="question-header-num">Question ${qNum}</span>
                    <span class="question-header-pts">${pts > 0 ? pts + ' pts' : ''}</span>
                </div>
                <div class="question-content">
                    <div class="question-text">${qText}</div>`;

            let url = q.url || q.question_url;
            if (url && url.trim()) {
                let cleanUrl = url.trim();
                let exts = cleanUrl.includes('.') ? [''] :['.png', '.jpg', '.gif'];
                header += `<img class="question-media" src="0_Quiz/media/${cleanUrl}${exts[0]}" onerror="this.onerror=null; this.src='0_Quiz/media/${cleanUrl}${exts[1] || ''}';">`;
            }
            
            frame.innerHTML = header;
            let contentDiv = frame.querySelector('.question-content');

            if (isComplexMatching) {
                this.setupComplexMatchingUI(contentDiv, q, idx);
            } else if (type === 'multiple_choice_question') {
                this.setupMultipleChoiceUI(contentDiv, q, idx);
            } else if (type === 'essay_question') {
                let inp = document.createElement('input');
                inp.type = "text";
                inp.className = "essay-input";
                inp.oninput = () => {
                    console.log(`[DEBUG][Inst ${this.instanceId}] Essay Q${qNum} typed. Value:`, inp.value.trim());
                    this.updateProgress();
                }
                contentDiv.appendChild(inp);
            } else if (type === 'matching_question') {
                this.setupClassSelectionUI(contentDiv, q, idx);
            }
            container.appendChild(frame);

            let qBtn = document.createElement("button");
            qBtn.className = "btn-sidebar-q";
            qBtn.innerText = `Q${qNum}`;
            qBtn.dataset.answered = "false";
            qBtn.dataset.highlighted = "false";
            qBtn.onclick = () => {
                let scrollArea = this.elements.scrollArea;
                if (scrollArea) {
                    let offsetTop = frame.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top + scrollArea.scrollTop;
                    scrollArea.scrollTo({ top: offsetTop - 10, behavior: 'smooth' });
                }
            };
            
            if (this.elements.sidebarList) {
                this.elements.sidebarList.appendChild(qBtn);
            }
            this.sidebarButtons.push(qBtn);
        });

        let endSpacer = document.createElement('div');
        endSpacer.style.height = "15vh";
        endSpacer.style.pointerEvents = "none";
        container.appendChild(endSpacer);

        if (this.currentQuestions.length > 0) {
            if (this.elements.btnJumpBottom) {
                this.elements.btnJumpBottom.innerText = `Q${this.currentQuestions.length}`;
                this.elements.btnJumpBottom.classList.remove("hidden");
            }
            this.elements.btnJumpTop?.classList.remove("hidden");
        }

        console.log(`[DEBUG][Inst ${this.instanceId}] Quiz rendered. Updating progress...`);
        this.updateProgress();
    }

    setupMultipleChoiceUI(container, q, idx) {
        let options =[];
        let correctIdx = q['correct ans index'];
        if (typeof correctIdx === 'string' && !isNaN(correctIdx)) correctIdx = parseInt(correctIdx, 10) - 1;
        else if (typeof correctIdx === 'number') correctIdx = correctIdx - 1;

        for (let i = 0; i < 26; i++) {
            let k = String.fromCharCode(97 + i);
            if (q[k] !== undefined && q[k] !== null && String(q[k]).trim() !== "") {
                options.push({ text: String(q[k]), is_correct: i === correctIdx });
            }
        }
        options.sort(() => Math.random() - 0.5);

        q._correctOptionText = (options.find(o => o.is_correct) || {}).text;
        q._mcqElements =[];
        q._selectedMcqIndex = -1;

        options.forEach((opt, i) => {
            let card = document.createElement('div');
            card.className = 'mcq-card';
            card.innerHTML = opt.text;
            card.dataset.isCorrect = opt.is_correct;
            
            card.onclick = () => {
                console.log(`[DEBUG][Inst ${this.instanceId}] MCQ Q${idx+1} answered: ${opt.text}`);
                q._selectedMcqIndex = i;
                q._userAnswer = opt.text; 
                
                q._mcqElements.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                
                this.updateProgress();
            };

            q._mcqElements.push(card);
            container.appendChild(card);
        });
    }

    setupClassSelectionUI(container, q, idx) {
        let grid = document.createElement('div');
        grid.className = 'class-btn-group';
        CLASSES.forEach(opt => {
            let btn = document.createElement('div');
            btn.className = 'class-btn-radio';
            btn.innerText = opt;
            btn.onclick = () => {
                console.log(`[DEBUG][Inst ${this.instanceId}] Class/Admin Q${idx+1} selected: ${opt}`);
                Array.from(grid.children).forEach(c => c.classList.remove('checked'));
                btn.classList.add('checked');
                q._userAnswer = opt;
                this.updateProgress();
            };
            grid.appendChild(btn);
        });
        container.appendChild(grid);
    }

    setupComplexMatchingUI(container, q, idx) {
        let pairs = q.answers ||[];
        // Normalization moved to startQuiz guarantees q.distractors is an array now.
        let distractors = q.distractors ||[]; 
        let allAnswers = pairs.map(p => p.answer_text);
        let allWords =[...allAnswers, ...distractors];

        const uniqueWords =[...new Set(allWords)];
        const allowReuse = uniqueWords.length < allWords.length;

        this.matchingStates[idx] = {
            words: allowReuse ? uniqueWords.sort() : allWords.sort(() => Math.random() - 0.5),
            slots: pairs.map(p => ({ correct: p.answer_text, current: null })),
            allowReuse: allowReuse
        };

        pairs.forEach((pair, slotIdx) => {
            let row = document.createElement('div');
            row.className = 'match-row';
            row.innerHTML = `
                <div class="match-def">${pair.text}</div>
                <div class="answer-slot" data-slot-index="${slotIdx}">_____________</div>
            `;
            row.querySelector('.answer-slot').onclick = (e) => this.handleSlotClick(idx, slotIdx, e.target);
            container.appendChild(row);
        });
    }

    handleScrollStickyBank() {
        const area = this.elements.scrollArea;
        const bank = this.elements.stickyBank;
        if (!area || !bank) return;
        
        let foundVisible = false;

        for (const idx in this.matchingStates) {
            let el = this.root.querySelector(`[data-question-index="${idx}"]`);
            if (!el) continue;
            let rect = el.getBoundingClientRect();
            let areaRect = area.getBoundingClientRect();

            if (rect.bottom > areaRect.top + 50 && rect.top < areaRect.bottom - 50) {
                if (this.activeMatchingQuestionId !== idx) {
                    console.log(`[DEBUG][Inst ${this.instanceId}] Sticky bank activated for matching Q${parseInt(idx)+1}`);
                    this.renderStickyBank(idx);
                }
                foundVisible = true;
                break;
            }
        }
        bank.classList.toggle("hidden", !foundVisible);
        if (!foundVisible) this.activeMatchingQuestionId = null;
    }

    renderStickyBank(qIdx) {
        this.activeMatchingQuestionId = qIdx;
        const bank = this.elements.stickyBank;
        if (!bank) return;
        
        bank.innerHTML = "";
        let state = this.matchingStates[qIdx];
        state.words.forEach(word => {
            if (!state.allowReuse && state.slots.some(s => s.current === word)) return;

            let btn = document.createElement('button');
            btn.className = 'word-bank-btn';
            if (this.selectedBankWord === word) btn.classList.add('selected');
            btn.innerText = word;

            btn.onclick = () => {
                if (this.selectedSlot) {
                    this.fillSlotWithWord(this.selectedSlot.qIdx, this.selectedSlot.slotIdx, word);
                } else {
                    this.selectedBankWord = (this.selectedBankWord === word) ? null : word;
                    this.renderStickyBank(qIdx);
                }
            };
            bank.appendChild(btn);
        });
    }

    fillSlotWithWord(qIdx, slotIdx, word) {
        console.log(`[DEBUG][Inst ${this.instanceId}] Matching Q${parseInt(qIdx)+1} Slot ${slotIdx} filled with: ${word}`);
        const state = this.matchingStates[qIdx];
        if (!state) return;
        
        if (!state.allowReuse) {
            state.slots.forEach((s, i) => {
                if (s.current === word) {
                    s.current = null;
                    const otherSlotEl = this.root.querySelector(`[data-question-index="${qIdx}"] [data-slot-index="${i}"]`);
                    if (otherSlotEl) {
                        otherSlotEl.innerText = "_____________";
                        otherSlotEl.className = "answer-slot";
                    }
                }
            });
        }

        state.slots[slotIdx].current = word;
        const targetSlotEl = this.selectedSlot?.element || this.root.querySelector(`[data-question-index="${qIdx}"][data-slot-index="${slotIdx}"]`);

        if (targetSlotEl) {
            targetSlotEl.innerText = word;
            targetSlotEl.className = "answer-slot filled";
        }

        this.selectedBankWord = null;
        this.selectedSlot = null;
        this.updateProgress();
        this.renderStickyBank(qIdx);
    }

    handleSlotClick(qIdx, slotIdx, slotEl) {
        const state = this.matchingStates[qIdx];
        if (!state) return;
        const slotData = state.slots[slotIdx];

        if (slotData.current) {
            console.log(`[DEBUG][Inst ${this.instanceId}] Matching Q${parseInt(qIdx)+1} Slot ${slotIdx} cleared.`);
            slotData.current = null;
            slotEl.innerText = "_____________";
            slotEl.className = "answer-slot";
            this.updateProgress();
            this.renderStickyBank(qIdx);
            return;
        }

        if (this.selectedBankWord) {
            this.fillSlotWithWord(qIdx, slotIdx, this.selectedBankWord);
            return;
        }

        this.selectedSlot?.element?.classList.remove('selected');
        if (this.selectedSlot?.element === slotEl) {
            this.selectedSlot = null;
        } else {
            this.selectedSlot = { qIdx, slotIdx, element: slotEl };
            slotEl.classList.add('selected');
        }
    }

    updateProgress() {
        if (!this.elements.quizProgress) return;
        let answeredCount = 0;
        this.currentQuestions.forEach((q, idx) => {
            let isAnswered = false;
            let type = q.type || q.question_type;
            let isComplexMatching = type === 'matching_question' && q.answers?.[0]?.text !== undefined;
            
            if (isComplexMatching) {
                let state = this.matchingStates[idx];
                if (state && state.slots.length > 0) {
                    let filled = state.slots.filter(s => s.current !== null).length;
                    if (filled === state.slots.length) isAnswered = true;
                }
            } else if (type === 'multiple_choice_question') {
                if (q._selectedMcqIndex !== undefined && q._selectedMcqIndex !== -1) isAnswered = true;
            } else if (type === 'essay_question') {
                let val = this.root.querySelector(`[data-question-index="${idx}"] .essay-input`)?.value?.trim();
                if (val) isAnswered = true;
            } else if (q._userAnswer) {
                isAnswered = true;
            }
            
            if (isAnswered) answeredCount++;
            
            let btn = this.sidebarButtons[idx];
            if (btn) {
                if (isAnswered) {
                    btn.dataset.answered = "true";
                    btn.dataset.highlighted = "false";
                } else {
                    btn.dataset.answered = "false";
                    if (isComplexMatching && this.matchingStates[idx]?.slots.some(s => s.current !== null)) {
                        btn.dataset.highlighted = "false";
                    }
                }
            }
        });
        this.elements.quizProgress.innerText = `${answeredCount}/${this.currentQuestions.length}`;
    }

    submitQuiz() {
        console.log(`[DEBUG][Inst ${this.instanceId}] Submit button clicked. Validating answers...`);
        let unansweredIndices =[];
        this.currentQuestions.forEach((q, idx) => {
            let type = q.type || q.question_type;
            let isComplexMatching = type === 'matching_question' && q.answers?.[0]?.text !== undefined;
            
            if (isComplexMatching) {
                let state = this.matchingStates[idx];
                if (!state || state.slots.filter(s => s.current !== null).length < state.slots.length) {
                    unansweredIndices.push(idx);
                }
            } else if (type === 'multiple_choice_question') {
                if (q._selectedMcqIndex === undefined || q._selectedMcqIndex === -1) {
                    unansweredIndices.push(idx);
                }
            } else if (type === 'essay_question') {
                let val = this.root.querySelector(`[data-question-index="${idx}"] .essay-input`)?.value?.trim();
                if (!val) unansweredIndices.push(idx);
            } else {
                if (!q._userAnswer) unansweredIndices.push(idx);
            }
        });

        if (unansweredIndices.length > 0) {
            console.warn(`[DEBUG][Inst ${this.instanceId}] Quiz missing answers at indices:`, unansweredIndices);
            this.currentQuestions.forEach((q, idx) => {
                let btn = this.sidebarButtons[idx];
                if (btn) {
                    if (unansweredIndices.includes(idx)) {
                        btn.dataset.highlighted = "true";
                        btn.dataset.answered = "false";
                    } else {
                        btn.dataset.highlighted = "false";
                        btn.dataset.answered = "true";
                    }
                }
            });
            
            let firstUnansweredFrame = this.root.querySelector(`[data-question-index="${unansweredIndices[0]}"]`);
            if (firstUnansweredFrame && this.elements.scrollArea) {
                let scrollArea = this.elements.scrollArea;
                let offsetTop = firstUnansweredFrame.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top + scrollArea.scrollTop;
                scrollArea.scrollTo({ top: offsetTop - 10, behavior: 'smooth' });
            }
            
            if (this.elements.errorMsg) {
                this.elements.errorMsg.innerText = "Please answer all questions. Check the orange buttons on the right.";
            }
            return;
        }

        console.log(`[DEBUG][Inst ${this.instanceId}] All questions answered. Grading...`);
        let nameAns = null, classAns = null;
        this.currentQuestions.forEach((q, idx) => {
            const txt = (q['question text'] || q.question_text || "").toLowerCase();
            if (q.type === 'essay_question' && txt.includes('name')) {
                nameAns = this.root.querySelector(`[data-question-index="${idx}"] .essay-input`)?.value.trim();
            } else if (q.type === 'matching_question' && txt.includes('class')) {
                classAns = q._userAnswer;
            }
        });

        if (!nameAns) nameAns = "Unknown";
        if (!classAns) classAns = "Unknown";

        if (this.elements.errorMsg) this.elements.errorMsg.innerText = "";
        this.elements.stickyBank?.classList.add("hidden");
        let totalScore = 0, totalPossible = 0;

        this.currentQuestions.forEach((q, idx) => {
            let frame = this.root.querySelector(`[data-question-index="${idx}"]`);
            if (!frame) return;
            let type = q.type || q.question_type, pts = parseInt(q.points || q.points_possible) || 0;
            
            if (type === 'matching_question' && q.answers?.[0]?.text !== undefined) {
                totalPossible += pts;
                let state = this.matchingStates[idx], correctCount = 0;
                state.slots.forEach((s, sIdx) => {
                    let slotEl = frame.querySelector(`[data-slot-index="${sIdx}"]`);
                    if (slotEl) {
                        slotEl.style.pointerEvents = 'none';
                        if (s.current === s.correct) {
                            correctCount++; slotEl.className = "answer-slot correct";
                        } else {
                            slotEl.className = "answer-slot incorrect";
                            slotEl.innerText = `${s.current || 'Empty'} (Req: ${s.correct})`;
                        }
                    }
                });
                if (state.slots.length > 0) totalScore += Math.round((correctCount / state.slots.length) * pts);
            } else if (type === 'multiple_choice_question') {
                totalPossible += pts;
                let userIdx = q._selectedMcqIndex !== undefined ? q._selectedMcqIndex : -1;
                let isCorrect = false;

                q._mcqElements.forEach((card, i) => {
                    card.onclick = null;
                    card.style.pointerEvents = 'none';

                    if (userIdx !== -1) {
                        if (i === userIdx) {
                            if (card.dataset.isCorrect === 'true') {
                                card.classList.add('correct');
                                isCorrect = true;
                            } else {
                                card.classList.add('incorrect');
                            }
                        }
                        
                        if (card.dataset.isCorrect === 'true' && i !== userIdx) {
                            card.classList.add('correct');
                            card.innerHTML += " (Correct Answer)";
                        }
                    }
                });

                if (isCorrect) totalScore += pts;
            }
        });

        this.finalStudentName = nameAns; this.finalStudentClass = classAns;
        this.finalScore = totalScore; this.finalTotalPossible = totalPossible;

        let perc = totalPossible === 0 ? 100 : Math.round((totalScore / totalPossible) * 100);
        let state = perc >= 60 ? "pass" : perc > 0 ? "warning" : "fail";

        console.log(`[DEBUG][Inst ${this.instanceId}] Final Score: ${totalScore}/${totalPossible} (${perc}%)`);

        if (perc === 100) triggerConfetti();
        
        console.log(`[DEBUG][Inst ${this.instanceId}] Saving result to Cloud/Storage...`);
        this.saveResult(this.currentQuizName, nameAns, classAns, totalScore, totalPossible);

        let msg = `Student: ${nameAns} | Class: ${classAns}\nScore: ${totalScore}/${totalPossible} (${perc}%)`;
        if (state === "fail") msg += "\n\nPlease Try Again";

        this.elements.btnSubmit?.classList.add("hidden");
        this.elements.btnSubmit.disabled = true;
        this.elements.btnRedo?.classList.remove("hidden");
        this.elements.btnSavePic?.classList.remove("hidden");
        if (this.elements.resultBox && this.elements.resultText) {
            this.elements.resultBox.dataset.status = state;
            this.elements.resultText.innerText = msg;
            this.elements.resultBox.classList.remove("hidden");
        }
        this.elements.scrollArea?.scrollTo({ top: this.elements.scrollArea.scrollHeight, behavior: 'smooth' });
    }

    resetQuiz() {
        console.log(`[DEBUG][Inst ${this.instanceId}] Resetting quiz...`);
        this.startQuiz(this.currentQuizName);
    }
    
    async submitToGoogleForms(payload) {
        // --- GOOGLE FORMS CONFIGURATION ---
        const GOOGLE_FORM_ACTION_URL = "https://docs.google.com/forms/d/e/1FAIpQLScWKKkcGj1kOkhxsxU2eH0P5_TZANSZ7pbCUklzdvWKfhmbug/formResponse";
        
        const fieldMap = {
            studentName: "entry.745060881",
            studentClass: "entry.1524443816",
            quizName: "entry.182191353",
            score: "entry.113183733",
            totalPossible: "entry.536891228",
        };
        // ----------------------------------

        console.log(`[DEBUG][Inst ${this.instanceId}] Preparing to submit to Google Forms.`);
        console.log(`[DEBUG][Inst ${this.instanceId}] Payload data:`, payload);

        const formData = new FormData();

        for (const key in payload) {
            if (fieldMap[key]) {
                formData.append(fieldMap[key], payload[key]);
            }
        }

        try {
            console.log(`[DEBUG][Inst ${this.instanceId}] Sending POST request to Google (no-cors)...`);
            // We must use mode: 'no-cors' so the browser doesn't block the background request.
            await fetch(GOOGLE_FORM_ACTION_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: formData,
            });
            
            // With 'no-cors', Google processes the data but hides the response status.
            // If it didn't throw a JavaScript execution network error, it succeeded!
            console.log("[DEBUG] ✅ Score successfully submitted to Google Forms!");
        } catch (error) {
            console.error("[DEBUG] ❌ Network error while submitting to Google Forms:", error);
        }
    }

    saveResult(quizName, name, cls, score, total) {
        console.log(`[DEBUG][Inst ${this.instanceId}] Saving to localStorage backup...`);
        // 1. Save to local storage as a backup
        let data = JSON.parse(localStorage.getItem('quiz_results') || '{}');
        if (!data[cls]) data[cls] = {};
        if (!data[cls][name]) data[cls][name] = {};
        if (!data[cls][name][quizName]) data[cls][name][quizName] = { best: 0, attempts: [] };
        data[cls][name][quizName].attempts.push({ s: score, t: total, ts: new Date().toISOString() });
        if (score > data[cls][name][quizName].best) data[cls][name][quizName].best = score;
        localStorage.setItem('quiz_results', JSON.stringify(data));
        console.log(`[DEBUG][Inst ${this.instanceId}] LocalStorage save complete.`);

        // 2. Prepare and send data to Google Forms
        const payload = {
            studentName: name,
            studentClass: cls,
            quizName: quizName,
            score: score,
            totalPossible: total
        };
        
        this.submitToGoogleForms(payload);
    }

    saveResultAsImage() {
        console.log(`[DEBUG][Inst ${this.instanceId}] Generating image for download...`);
        if (!this.finalStudentName || !this.finalStudentClass) {
            console.warn("[DEBUG] Missing student name or class for image generation.");
            return;
        }
        const data =[
            { label: "Class", value: this.finalStudentClass },
            { label: "HW", value: this.currentQuizName },
            { label: "Name", value: this.finalStudentName },
            { label: "Score", value: `${this.finalScore} / ${this.finalTotalPossible}` }
        ];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const font = "bold 22px sans-serif", rh = 50, pad = 20, bw = 2;
        ctx.font = font;
        let lw = Math.max(...data.map(d => ctx.measureText(d.label).width));
        let vw = Math.max(...data.map(d => ctx.measureText(d.value).width));
        const cw1 = lw + pad * 2, cw2 = vw + pad * 2;
        canvas.width = cw1 + cw2; canvas.height = rh * data.length;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        data.forEach((row, i) => {
            const y = i * rh;
            ctx.fillStyle = "#e1f0fa"; ctx.fillRect(0, y, cw1, rh);
            ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = "#005a9e"; ctx.fillText(row.label, cw1 / 2, y + rh / 2);
            ctx.fillStyle = "#2d3b45"; ctx.fillText(row.value, cw1 + cw2 / 2, y + rh / 2);
        });
        ctx.strokeStyle = "#999"; ctx.lineWidth = bw;
        ctx.beginPath(); ctx.moveTo(cw1, 0); ctx.lineTo(cw1, canvas.height); ctx.stroke();
        for (let i = 1; i < data.length; i++) {
            ctx.beginPath(); ctx.moveTo(0, i * rh); ctx.lineTo(canvas.width, i * rh); ctx.stroke();
        }
        ctx.strokeRect(bw/2, bw/2, canvas.width-bw, canvas.height-bw);
        const link = document.createElement('a');
        link.download = `${this.finalStudentClass}_${this.finalStudentName.replace(/[^a-z0-9]/gi, '_')}_${this.currentQuizName.replace(/[^a-z0-9]/gi, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        console.log(`[DEBUG][Inst ${this.instanceId}] Image download triggered: ${link.download}`);
    }

    showResultsPage() {
        console.log(`[DEBUG][Inst ${this.instanceId}] Displaying LocalStorage Results Page.`);
        this.switchView("view-results");
        const container = this.elements.resultsList;
        if (!container) return;
        container.innerHTML = "";
        let raw = JSON.parse(localStorage.getItem('quiz_results') || '{}');
        let resultsFlat =[];
        Object.entries(raw).forEach(([cls, students]) => {
            Object.entries(students).forEach(([name, quizzes]) => {
                Object.entries(quizzes).forEach(([qName, data]) => {
                    let last = data.attempts.at(-1);
                    resultsFlat.push({ cls, name, assignment: qName, best: data.best, total: last?.t || 0 });
                });
            });
        });
        if (resultsFlat.length === 0) {
            container.innerHTML = "<p style='color:#666; font-style:italic;'>No results found yet.</p>";
            return;
        }
        resultsFlat.sort((a,b) => a.cls.localeCompare(b.cls) || a.name.localeCompare(b.name));
        resultsFlat.forEach(res => {
            let card = document.createElement("div");
            card.className = "result-card";
            card.innerHTML = `<div><p class="res-title">${res.name} (${res.cls})</p><p class="res-detail">${res.assignment}</p></div><div><p class="res-score">${res.best}/${res.total}</p></div>`;
            container.appendChild(card);
        });
    }
}

function triggerConfetti() {
    console.log("[DEBUG] Triggering Confetti! 🎉");
    try { new Audio('sounds/pop.mp3').play().catch(()=>{}); } catch (e) {}
    if (typeof confetti !== 'undefined') {
        let end = Date.now() + 3000;
        (function frame() {
            confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 } });
            confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 } });
            if (Date.now() < end) requestAnimationFrame(frame);
        }());
    }
}