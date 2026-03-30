// --- GLOBAL APP MANAGEMENT ---
let viewMode = 1;
let quizInstances =[];
let canvasData = {}; // Shared across all instances
const CLASSES =["G6A", "G6B", "G6C", "G7A", "G7B", "G7C", "G8A", "G8B", "G8C"];

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("view-mode-btn").addEventListener("click", cycleViewMode);
    loadCanvasData().then(() => {
        setViewMode(1); // Start with 1 screen
    });
});

function cycleViewMode() {
    viewMode++;
    if (viewMode > 3) {
        viewMode = 1;
    }
    setViewMode(viewMode);
}

function setViewMode(numScreens) {
    const masterContainer = document.getElementById("master-container");
    masterContainer.innerHTML = "";
    quizInstances =[];

    for (let i = 0; i < numScreens; i++) {
        const template = document.getElementById("quiz-instance-template");
        const instanceNode = template.content.cloneNode(true);
        masterContainer.appendChild(instanceNode);
        const rootElement = masterContainer.lastElementChild;
        quizInstances.push(new QuizInstance(rootElement));
    }
}

async function loadCanvasData() {
    try {
        const response = await fetch('0_Quiz/canvas.json');
        if (!response.ok) throw new Error("Could not find canvas.json");
        canvasData = await response.json();
    } catch (e) {
        console.warn("Using fallback empty canvas.json structure", e);
        canvasData = { "6": {}, "7": {}, "8": {} };
    }
}

async function checkQuizExists(quizName) {
    try {
        const res = await fetch(`0_Quiz/${quizName}.json`, { method: 'HEAD' });
        return res.ok;
    } catch {
        return false;
    }
}

function normalizeQuizData(raw) {
    let items =[];
    if (Array.isArray(raw)) {
        items = raw;
    } else if (raw.multisheet && Array.isArray(raw.sheets)) {
        raw.sheets.forEach(sheet => {
            if(sheet.data && sheet.headers) {
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
    }
    return items.filter(d => d['question text'] || d['question_text']);
}

// --- QUIZ INSTANCE CLASS ---
class QuizInstance {
    constructor(rootElement) {
        this.root = rootElement;
        this.selectedClass = null;
        this.currentQuizName = null;
        this.currentQuestions =[];
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
            quizContent: this.root.querySelector('.quiz-content'),
            resultBox: this.root.querySelector('.quiz-result-box'),
            resultText: this.root.querySelector('.quiz-result-text'),
            errorMsg: this.root.querySelector('.quiz-error-msg'),
            btnSubmit: this.root.querySelector('.btn-submit-quiz'),
            btnRedo: this.root.querySelector('.btn-redo-quiz'),
            btnSavePic: this.root.querySelector('.btn-save-picture'),
            resultsList: this.root.querySelector('.results-list'),
        };
        this.init();
    }

    init() {
        this.initClassGrid();
        this.addEventListeners();
    }

    switchView(viewClass) {
        Object.values(this.views).forEach(v => v.classList.remove('active'));
        this.root.querySelector(`.${viewClass}`).classList.add('active');
    }
    
    addEventListeners() {
        this.root.querySelector('.btn-view-results').addEventListener('click', () => this.showResultsPage());
        this.root.querySelector('.btn-back-to-class').addEventListener('click', () => this.switchView('view-class-select'));
        this.root.querySelector('.btn-back-to-class-from-results').addEventListener('click', () => this.switchView('view-class-select'));
        this.root.querySelector('.btn-back-to-assignments').addEventListener('click', () => this.switchView('view-assignments'));
        this.elements.btnSubmit.addEventListener('click', () => this.submitQuiz());
        this.elements.btnRedo.addEventListener('click', () => this.resetQuiz());
        this.elements.btnSavePic.addEventListener('click', () => this.saveResultAsImage());
        this.elements.scrollArea.addEventListener('scroll', () => this.handleScrollStickyBank());
    }

    initClassGrid() {
        this.elements.classGrid.innerHTML = "";
        CLASSES.forEach(cls => {
            const btn = document.createElement("button");
            btn.className = "btn-class";
            btn.innerText = cls;
            btn.onclick = () => this.loadAssignments(cls);
            this.elements.classGrid.appendChild(btn);
        });
    }

    async loadAssignments(classCode) {
        this.selectedClass = classCode;
        this.elements.assignmentsTitle.innerText = `Assignments for ${classCode}`;
        const list = this.elements.assignmentList;
        list.innerHTML = "Loading...";
        this.switchView("view-assignments");
        
        let grade = classCode[1];
        let assignmentsDict = {};
        if (grade === '6' && canvasData['6'] && canvasData['6'][classCode]) {
            assignmentsDict = canvasData['6'][classCode];
        } else if (grade === '7' && canvasData['7']) {
            assignmentsDict = canvasData['7'];
        } else if (grade === '8' && canvasData['8']) {
            assignmentsDict = canvasData['8'];
        }
        
        let validTitles = Object.keys(assignmentsDict).filter(k => typeof assignmentsDict[k] !== 'object');
        validTitles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        
        if (validTitles.length === 0) {
            list.innerHTML = "<p style='color:#666; font-style:italic;'>No assignments found.</p>";
            return;
        }

        const existenceChecks = validTitles.map(async (title) => {
            const exists = await checkQuizExists(title);
            return { title, exists };
        });

        const results = await Promise.all(existenceChecks);
        
        list.innerHTML = "";
        results.forEach(result => {
            let btn = document.createElement("button");
            btn.className = "btn-assignment";
            if (!result.exists) {
                btn.innerText = `${result.title} (File Missing)`;
                btn.disabled = true;
            } else {
                btn.innerText = result.title;
                btn.onclick = () => this.startQuiz(result.title);
            }
            list.appendChild(btn);
        });
    }
    
    async startQuiz(quizName) {
        this.currentQuizName = quizName;
        this.elements.quizTitle.innerText = quizName;
        this.elements.resultBox.classList.add("hidden");
        this.elements.btnSubmit.classList.remove("hidden");
        this.elements.btnRedo.classList.add("hidden");
        this.elements.btnSavePic.classList.add("hidden");
        this.elements.errorMsg.innerText = "";
        this.elements.stickyBank.classList.add("hidden");
        
        const container = this.elements.quizContent;
        container.innerHTML = "Loading...";
        this.switchView("view-quiz");
        this.elements.scrollArea.scrollTop = 0;

        try {
            const res = await fetch(`0_Quiz/${quizName}.json`);
            const rawData = await res.json();
            
            let normalized = normalizeQuizData(rawData);

            normalized.forEach(q => {
                const type = q.type || q.question_type;
                const isComplexMatching = type === 'matching_question' && q.answers && Array.isArray(q.answers) && q.answers.length > 0 && q.answers[0].text;
                if (isComplexMatching) {
                    q.answers.sort(() => Math.random() - 0.5);
                }
            });

            let quizQuestions = [], adminQuestions =[];
            normalized.forEach(q => {
                let txt = (q['question text'] || q.question_text || "").toLowerCase();
                if (txt.includes('select your class') || txt.includes('english name') || txt.includes('your name')) {
                    adminQuestions.push(q);
                } else {
                    quizQuestions.push(q);
                }
            });
            quizQuestions.sort(() => Math.random() - 0.5); 
            this.currentQuestions = [...quizQuestions, ...adminQuestions];
            
            this.renderQuiz();
        } catch (e) {
            container.innerHTML = `<p style="color:red">Failed to load quiz data: ${e.message}</p>`;
        }
    }
    
    renderQuiz() {
        const container = this.elements.quizContent;
        container.innerHTML = "";
        this.matchingStates = {};
        this.selectedBankWord = null;
        this.selectedSlot = null;
        this.activeMatchingQuestionId = null;

        let foundFirstAdmin = false;

        this.currentQuestions.forEach((q, idx) => {
            let qNum = idx + 1;
            let type = q.type || q.question_type;
            let qText = q['question text'] || q.question_text;
            let qTextLower = (qText || "").toLowerCase();
            let pts = parseInt(q.points || q.points_possible) || 0;
            let isComplexMatching = type === 'matching_question' && q.answers && Array.isArray(q.answers) && q.answers.length > 0 && q.answers[0].text;
            
            let isAdmin = qTextLower.includes('select your class') || qTextLower.includes('english name') || qTextLower.includes('your name');

            if (isAdmin && !foundFirstAdmin) {
                let spacer = document.createElement('div');
                spacer.style.height = "65vh";
                spacer.style.pointerEvents = "none";
                container.appendChild(spacer);
                foundFirstAdmin = true;
            }

            let frame = document.createElement('div');
            frame.className = "question-frame";
            frame.dataset.questionIndex = idx;

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
                let exts = cleanUrl.includes('.') ? [''] : ['.png', '.jpg', '.gif'];
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
                inp.oninput = () => this.updateProgress();
                contentDiv.appendChild(inp);
            } else if (type === 'matching_question') {
                this.setupClassSelectionUI(contentDiv, q, idx);
            }
            container.appendChild(frame);
        });
        
        this.updateProgress();
    }
    
    setupMultipleChoiceUI(container, q, idx) {
        let options = [];
        let correctIdx = q['correct ans index'];
        if (typeof correctIdx === 'string' && !isNaN(correctIdx)) correctIdx = parseInt(correctIdx) - 1;
        else if (typeof correctIdx === 'number') correctIdx = correctIdx - 1;

        for (let i = 0; i < 26; i++) {
            let k = String.fromCharCode(97 + i);
            if (q[k] !== undefined && q[k] !== null && String(q[k]).trim() !== "") {
                options.push({ text: String(q[k]), is_correct: i === correctIdx });
            }
        }
        options.sort(() => Math.random() - 0.5);

        q._correctOptionText = (options.find(o => o.is_correct) || {}).text;

        options.forEach(opt => {
            let row = document.createElement('div');
            row.className = 'mcq-option';
            let rad = document.createElement('input');
            rad.type = "radio";
            rad.name = `mcq-${idx}-${this.root.id}`; 
            rad.value = opt.text;
            rad.onchange = () => this.updateProgress();
            
            let lbl = document.createElement('label');
            lbl.innerText = opt.text;
            lbl.onclick = () => { rad.checked = true; this.updateProgress(); };
            
            lbl.dataset.isCorrect = opt.is_correct;
            
            row.appendChild(rad);
            row.appendChild(lbl);
            container.appendChild(row);
        });
    }

    setupClassSelectionUI(container, q, idx) {
        let grid = document.createElement('div');
        grid.className = 'class-btn-group';
        let options =[];
        for (let i = 0; i < 26; i++) {
            let k = String.fromCharCode(97 + i);
            if (q[k] && String(q[k]).toLowerCase() !== "your class:") options.push(q[k]);
        }
        
        options.forEach(opt => {
            let btn = document.createElement('div');
            btn.className = 'class-btn-radio';
            btn.innerText = opt;
            btn.onclick = () => {
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
        let distractors = q.distractors || q.matching_answer_incorrect_matches || [];
        let allAnswers = pairs.map(p => p.answer_text);
        let allWords = [...allAnswers, ...distractors];
        
        const uniqueWords = [...new Set(allWords)];
        const allowReuse = uniqueWords.length < allAnswers.length;

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
        let foundVisible = false;

        for (const idx in this.matchingStates) {
            let el = this.root.querySelector(`[data-question-index="${idx}"]`);
            if (!el) continue;
            let rect = el.getBoundingClientRect();
            let areaRect = area.getBoundingClientRect();
            
            if (rect.bottom > areaRect.top + 50 && rect.top < areaRect.bottom - 50) {
                if (this.activeMatchingQuestionId !== idx) {
                    this.renderStickyBank(idx);
                }
                foundVisible = true;
                break;
            }
        }
        if (!foundVisible) {
            bank.classList.add("hidden");
            this.activeMatchingQuestionId = null;
        } else {
            bank.classList.remove("hidden");
        }
    }
    
    renderStickyBank(qIdx) {
        this.activeMatchingQuestionId = qIdx;
        const bank = this.elements.stickyBank;
        bank.innerHTML = "";
        
        let state = this.matchingStates[qIdx];
        state.words.forEach(word => {
            if (!state.allowReuse) {
                let isUsed = state.slots.some(s => s.current === word);
                if (isUsed) return;
            }
            
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
        const state = this.matchingStates[qIdx];
        const slotData = state.slots[slotIdx];

        if (!state.allowReuse) {
            state.slots.forEach((s, i) => {
                if (s.current === word) {
                    s.current = null;
                    const otherSlotEl = this.root.querySelector(`[data-question-index="${qIdx}"] [data-slot-index="${i}"]`);
                    if(otherSlotEl) {
                        otherSlotEl.innerText = "_____________";
                        otherSlotEl.className = "answer-slot";
                    }
                }
            });
        }

        slotData.current = word;
        const targetSlotEl = this.selectedSlot ? this.selectedSlot.element : this.root.querySelector(`[data-question-index="${qIdx}"] [data-slot-index="${slotIdx}"]`);
        
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
        const slotData = state.slots[slotIdx];

        if (slotData.current) {
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

        if (this.selectedSlot && this.selectedSlot.element) {
            this.selectedSlot.element.classList.remove('selected');
        }

        if (this.selectedSlot && this.selectedSlot.element === slotEl) {
            this.selectedSlot = null;
        } else { 
            this.selectedSlot = { qIdx, slotIdx, element: slotEl };
            slotEl.classList.add('selected');
        }
    }
    
    updateProgress() {
        let answered = 0;
        this.currentQuestions.forEach((q, idx) => {
            let type = q.type || q.question_type;
            let isComplexMatching = type === 'matching_question' && q.answers && Array.isArray(q.answers) && q.answers.length > 0 && q.answers[0].text;
            
            if (isComplexMatching) {
                let state = this.matchingStates[idx];
                if (state && state.slots.some(s => s.current !== null)) answered++;
            } else if (type === 'multiple_choice_question') {
                if (this.root.querySelector(`input[name^="mcq-${idx}"]:checked`)) answered++;
            } else if (type === 'essay_question') {
                let frame = this.root.querySelector(`[data-question-index="${idx}"]`);
                if (frame.querySelector('.essay-input').value.trim()) answered++;
            } else if (type === 'matching_question') {
                if (q._userAnswer) answered++;
            }
        });
        this.elements.quizProgress.innerText = `${answered}/${this.currentQuestions.length}`;
    }

    submitQuiz() {
        let nameAns = null;
        let classAns = null;
    
        // PHASE 1: VALIDATION
        this.currentQuestions.forEach((q, idx) => {
            const frame = this.root.querySelector(`[data-question-index="${idx}"]`);
            const txt = (q['question text'] || q.question_text || "").toLowerCase();
            const type = q.type || q.question_type;
    
            if (type === 'essay_question' && txt.includes('name')) {
                nameAns = frame.querySelector('.essay-input').value.trim();
            } 
            // This is the fix: Directly check for the property set by the class selection UI.
            // This is robust and doesn't rely on complex/inconsistent flags.
            else if (type === 'matching_question' && txt.includes('class')) {
                classAns = q._userAnswer;
            }
        });
    
        if (!nameAns || !classAns) {
            let missing = [];
            if (!nameAns) missing.push("your name");
            if (!classAns) missing.push("your class");
            this.elements.errorMsg.innerText = "Please enter " + missing.join(" and ") + ".";
            return;
        }
    
        // PHASE 2: GRADING & LOCKING
        this.elements.errorMsg.innerText = "";
        this.elements.stickyBank.classList.add("hidden");
        let totalScore = 0, totalPossible = 0;
    
        this.currentQuestions.forEach((q, idx) => {
            let frame = this.root.querySelector(`[data-question-index="${idx}"]`);
            let txt = (q['question text'] || q.question_text || "").toLowerCase();
            let type = q.type || q.question_type;
            let isComplexMatching = type === 'matching_question' && q.answers && Array.isArray(q.answers) && q.answers.length > 0 && q.answers[0].text;
            let pts = parseInt(q.points || q.points_possible) || 0;

            if (type === 'essay_question' && txt.includes('name')) {
                frame.querySelector('.essay-input').disabled = true;
            } else if (type === 'matching_question' && !isComplexMatching && txt.includes('class')) {
                frame.querySelectorAll('.class-btn-radio').forEach(b => b.style.pointerEvents = 'none');
            }

            if (isComplexMatching) {
                totalPossible += pts;
                let state = this.matchingStates[idx];
                let correctCount = 0;
                state.slots.forEach((s, sIdx) => {
                    let slotEl = frame.querySelector(`[data-slot-index="${sIdx}"]`);
                    slotEl.style.pointerEvents = 'none';
                    if (s.current === s.correct) {
                        correctCount++;
                        slotEl.className = "answer-slot correct";
                    } else {
                        slotEl.className = "answer-slot incorrect";
                        slotEl.innerText = `${s.current || 'Empty'} (Req: ${s.correct})`;
                    }
                });
                if (state.slots.length > 0) totalScore += Math.round((correctCount / state.slots.length) * pts);
            } else if (type === 'multiple_choice_question') {
                totalPossible += pts;
                frame.querySelectorAll('input[type="radio"]').forEach(rad => rad.disabled = true);
                let checkedRad = frame.querySelector('input[type="radio"]:checked');
                
                frame.querySelectorAll('label').forEach(lbl => {
                    lbl.onclick = null;
                    if (lbl.dataset.isCorrect === 'true') lbl.classList.add('correct-answer-show');
                });

                if (checkedRad && checkedRad.value === q._correctOptionText) {
                    totalScore += pts;
                } else if (checkedRad) {
                    checkedRad.nextElementSibling.style.color = "#ee0000";
                    checkedRad.nextElementSibling.style.fontWeight = "bold";
                }
            }
        });
    
        this.finalStudentName = nameAns;
        this.finalStudentClass = classAns;
        this.finalScore = totalScore;
        this.finalTotalPossible = totalPossible;
    
        let perc = totalPossible === 0 ? 100 : Math.round((totalScore / totalPossible) * 100);
        let state = perc >= 60 ? "pass" : perc > 0 ? "warning" : "fail";
        
        if (perc === 100) triggerConfetti();
        if (state !== "fail" || totalPossible === 0) {
            this.saveResult(this.currentQuizName, nameAns, classAns, totalScore, totalPossible);
        }
    
        let msg = `Student: ${nameAns} | Class: ${classAns}\nScore: ${totalScore} / ${totalPossible} (${perc}%)`;
        if (state === "warning") msg += "\n\nGreat start! Your score has been saved.";
        else if (state === "fail") msg += "\n\nPlease Try Again";
        
        this.elements.btnSubmit.classList.add("hidden");
        this.elements.btnRedo.classList.remove("hidden");
        this.elements.btnSavePic.classList.remove("hidden");
        
        this.elements.resultBox.dataset.status = state;
        this.elements.resultText.innerText = msg;
        this.elements.resultBox.classList.remove("hidden");
        this.elements.scrollArea.scrollTop = this.elements.scrollArea.scrollHeight;
    }
    
    resetQuiz() {
        this.startQuiz(this.currentQuizName);
    }

    saveResult(quizName, name, cls, score, total) {
        let data = JSON.parse(localStorage.getItem('quiz_results') || '{}');
        if (!data[cls]) data[cls] = {};
        if (!data[cls][name]) data[cls][name] = {};
        if (!data[cls][name][quizName]) data[cls][name][quizName] = { best: 0, attempts: [] };

        let ts = new Date().toISOString();
        data[cls][name][quizName].attempts.push({ s: score, t: total, ts: ts });
        if (score > data[cls][name][quizName].best) data[cls][name][quizName].best = score;
        localStorage.setItem('quiz_results', JSON.stringify(data));
    }
    
    saveResultAsImage() {
        const data =[
            { label: "Class", value: this.finalStudentClass },
            { label: "HW", value: this.currentQuizName },
            { label: "Name", value: this.finalStudentName },
            { label: "Score", value: `${this.finalScore} / ${this.finalTotalPossible}` }
        ];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const font = "bold 22px sans-serif";
        const rowHeight = 50;
        const cellPadding = 20;
        const borderWidth = 2;
        const headerBgColor = "#e1f0fa";
        const headerTextColor = "#005a9e";
        const valueTextColor = "#2d3b45";
        const borderColor = "#999";
        ctx.font = font;
        let maxLabelWidth = 0;
        data.forEach(d => {
            const width = ctx.measureText(d.label).width;
            if (width > maxLabelWidth) maxLabelWidth = width;
        });
        let maxValueWidth = 0;
        data.forEach(d => {
            const width = ctx.measureText(d.value).width;
            if (width > maxValueWidth) maxValueWidth = width;
        });
        const col1Width = maxLabelWidth + (cellPadding * 2);
        const col2Width = maxValueWidth + (cellPadding * 2);
        canvas.width = col1Width + col2Width;
        canvas.height = rowHeight * data.length;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        data.forEach((row, i) => {
            const y = i * rowHeight;
            ctx.fillStyle = headerBgColor;
            ctx.fillRect(0, y, col1Width, rowHeight);
            ctx.font = font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = headerTextColor;
            ctx.fillText(row.label, col1Width / 2, y + rowHeight / 2);
            ctx.fillStyle = valueTextColor;
            ctx.fillText(row.value, col1Width + (col2Width / 2), y + rowHeight / 2);
        });
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.beginPath();
        ctx.moveTo(col1Width, 0);
        ctx.lineTo(col1Width, canvas.height);
        ctx.stroke();
        for(let i = 1; i < data.length; i++) {
            const y = i * rowHeight;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        ctx.strokeRect(borderWidth / 2, borderWidth / 2, canvas.width - borderWidth, canvas.height - borderWidth);
        const link = document.createElement('a');
        const safeName = this.finalStudentName.replace(/[^a-z0-9]/gi, '_');
        const safeQuizName = this.currentQuizName.replace(/[^a-z0-9]/gi, '_');
        link.download = `${this.finalStudentClass}_${safeName}_${safeQuizName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    showResultsPage() {
        this.switchView("view-results");
        const container = this.elements.resultsList;
        container.innerHTML = "";
        let raw = JSON.parse(localStorage.getItem('quiz_results') || '{}');
        let resultsFlat =[];
        for (const [cls, students] of Object.entries(raw)) {
            for (const[name, quizzes] of Object.entries(students)) {
                for (const [qName, data] of Object.entries(quizzes)) {
                    let lastAttempt = data.attempts[data.attempts.length - 1];
                    resultsFlat.push({
                        cls, name, assignment: qName, 
                        best: data.best, total: lastAttempt ? lastAttempt.t : 0
                    });
                }
            }
        }
        if (resultsFlat.length === 0) {
            container.innerHTML = "<p style='color:#666; font-style:italic;'>No results found yet.</p>";
            return;
        }
        resultsFlat.sort((a, b) => a.cls.localeCompare(b.cls) || a.name.localeCompare(b.name));
        resultsFlat.forEach(res => {
            let card = document.createElement("div");
            card.className = "result-card";
            card.innerHTML = `
                <div>
                    <p class="res-title">${res.name} (${res.cls})</p>
                    <p class="res-detail">${res.assignment}</p>
                </div>
                <div>
                    <p class="res-score">${res.best}/${res.total}</p>
                </div>`;
            container.appendChild(card);
        });
    }
}

// --- GLOBAL HELPERS ---
function triggerConfetti() {
    try {
        let audio = new Audio('sounds/pop.mp3');
        audio.play().catch(e => console.warn("Audio play blocked by browser:", e));
    } catch (e) {
        console.warn("Audio not supported or file missing:", e);
    }

    if (typeof confetti !== 'undefined') {
        let duration = 3000;
        let end = Date.now() + duration;
        (function frame() {
            confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 } });
            confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 } });
            if (Date.now() < end) requestAnimationFrame(frame);
        }());
    }
}