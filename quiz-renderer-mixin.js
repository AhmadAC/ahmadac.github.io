// quiz-renderer-mixin.js

import { CLASSES } from './config.js';
import { normalizeQuizData, quizIndex } from './quiz-data.js';
import { recursiveDecode, formatDisplayString } from './utils.js';

export const QuizRendererMixin = {
    async startQuiz(quizName, isBonus = false) {
        this.isBonus = isBonus;
        console.log(`[DEBUG][Inst ${this.instanceId}] Fetching data for: ${quizName}`);
        this.currentQuizName = quizName;
        this.documentBackTarget = 'view-assignments';
        this._lastActiveIdx = 0; 
        
        if (this.elements.sidebarList) this.elements.sidebarList.innerHTML = "";
        this.sidebarButtons = [];
        this.matchingStates = {};
        
        if (this.elements.quizTitle) this.elements.quizTitle.innerHTML = formatDisplayString(quizName);
        
        // Reset dynamic header UI components
        this.elements.quizProgress?.classList.remove("hidden");
        this.elements.quizScoreLbl?.classList.add("hidden");
        
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
        if (container) {
            const infoSection = container.querySelector('.quiz-info-section');
            container.innerHTML = "";
            if (infoSection) {
                infoSection.classList.add('hidden');
                infoSection.querySelector('.info-content').innerHTML = "";
                container.appendChild(infoSection);
            }
        }
        
        if (this.elements.documentContent) this.elements.documentContent.innerHTML = "Loading...";
        
        this.switchView("view-quiz");
        if (this.elements.scrollArea) this.elements.scrollArea.scrollTop = 0;

        try {
            let urlPath;
            if (this.isBonus) {
                urlPath = `bonus/${encodeURI(quizName)}.json`;
            } else if (quizIndex && quizIndex[quizName]) {
                urlPath = encodeURI(quizIndex[quizName]);
            } else {
                urlPath = encodeURI(quizName + '.json');
            }
            
            const quizPath = `0_Quiz/${urlPath}`;
            
            const res = await fetch(quizPath);
            if (!res.ok) throw new Error(`File missing or server error (${res.status})`);
            
            const rawDataRaw = await res.json();
            const rawData = recursiveDecode(rawDataRaw);
            
            console.log(`[DEBUG][Inst ${this.instanceId}] Raw JSON loaded & decoded successfully.`); 

            if (rawData.metadata && rawData.metadata.type === 'document') {
                this.renderDocument(quizName, rawData);
                return;
            }

            let infoContent = "";
            if (Array.isArray(rawData)) {
                const metaItem = rawData.find(item => item && item.quiz_metadata);
                if (metaItem && metaItem.quiz_metadata.info_content) {
                    infoContent = metaItem.quiz_metadata.info_content;
                }
            } else if (rawData?.quiz_metadata?.info_content) {
                infoContent = rawData.quiz_metadata.info_content;
            }

            const infoSection = this.root.querySelector('.quiz-info-section');
            const infoContentDiv = this.root.querySelector('.info-content');
            if (infoSection && infoContentDiv) {
                if (infoContent) {
                    infoContent = infoContent.replace(/(href|src)=["']([^"']+)["']/gi, (match, attr, url) => {
                        let cleanUrl = url.replace(/\\/g, '/');
                        if (!/^https?:\/\//i.test(cleanUrl) && !/^mailto:/i.test(cleanUrl)) {
                            let filename = cleanUrl.split('/').pop();
                            try { filename = decodeURIComponent(filename); } catch(e) {}
                            filename = encodeURIComponent(filename);
                            cleanUrl = `0_Quiz/media/${filename}`;
                        }
                        return `${attr}="${cleanUrl}"`;
                    });
                    
                    infoContent = infoContent.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
                        let hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
                        let isHtml = hrefMatch && hrefMatch[1] && /\.html?\b/i.test(hrefMatch[1]);
                        let isExternal = hrefMatch && hrefMatch[1] && /^https?:\/\//i.test(hrefMatch[1]);
                        
                        if (isHtml || isExternal) {
                            attrs = attrs.replace(/target=["'][^"']*["']/gi, '');
                            attrs += ' target="_blank"';
                        }
                        return `<a ${attrs}>`;
                    });

                    infoContentDiv.innerHTML = infoContent;
                    infoSection.classList.remove('hidden');
                } else {
                    infoSection.classList.add('hidden');
                    infoContentDiv.innerHTML = "";
                }
            }

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

            let normalized = normalizeQuizData(rawData);

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
                        q.distractors = [];
                    }
                }

                const isComplexMatching = type === 'matching_question' && q.answers && Array.isArray(q.answers) && q.answers.length > 0 && q.answers[0]?.text !== undefined;
                if (isComplexMatching) {
                    q.answers.sort(() => Math.random() - 0.5);
                }
            });

            let quizQuestions = [], adminQuestions = [];
            normalized.forEach(q => {
                let txt = (q['question text'] || q.question_text || q['Question Text'] || q['Question_Text'] || "").toLowerCase();
                
                if (this.isBonus && txt.includes('select your class')) {
                    return; 
                }

                if (txt.includes('select your class') || txt.includes('english name') || txt.includes('your name')) {
                    adminQuestions.push(q);
                } else {
                    quizQuestions.push(q);
                }
            });

            if (randomizeQuestions) {
                quizQuestions.sort(() => Math.random() - 0.5);
            }

            this.currentQuestions = [...quizQuestions, ...adminQuestions];
            this.renderQuiz();
            
        } catch (e) {
            console.error(`[DEBUG][Inst ${this.instanceId}] Load Error:`, e);
            if (container) {
                container.innerHTML += `<p style="color:red; font-weight:bold; padding:20px;">Failed to load data: ${e.message}</p>`;
            }
        }
    },

    renderQuiz() {
        const container = this.elements.quizContent;
        if (!container) return;
        
        this.matchingStates = {};
        this.selectedBankWord = null;
        this.selectedSlot = null;
        this.activeMatchingQuestionId = null;

        let foundFirstAdmin = false;

        this.currentQuestions.forEach((q, idx) => {
            let qNum = idx + 1;
            let type = q.type || q.question_type;
            let qText = q['question text'] || q.question_text || q['Question Text'] || q['Question_Text'];
            
            if (qText) qText = formatDisplayString(String(qText));
            
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
                let exts = cleanUrl.includes('.') ? [''] : ['.png', '.jpg', '.gif'];
                header += `<img class="question-media" src="0_Quiz/media/${cleanUrl}${exts[0]}" onerror="this.onerror=null; this.src='0_Quiz/media/${cleanUrl}${exts[1] || ''}';">`;
            }
            
            frame.innerHTML = header;
            let contentDiv = frame.querySelector('.question-content');

            if (isAdmin && type === 'matching_question') {
                this.setupClassSelectionUI(contentDiv, q, idx);
            } else if (type === 'atom_builder_question') {
                this.setupAtomBuilderUI(contentDiv, q, idx);
            } else if (isComplexMatching) {
                this.setupComplexMatchingUI(contentDiv, q, idx);
            } else if (type === 'multiple_choice_question') {
                this.setupMultipleChoiceUI(contentDiv, q, idx);
            } else if (type === 'essay_question') {
                let inp = document.createElement('input');
                inp.type = "text";
                inp.className = "essay-input";
                inp.oninput = () => {
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
            qBtn.dataset.wrong = "false";
            qBtn.dataset.correct = "false";
            qBtn.dataset.current = "false";
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

        this.updateProgress();
        
        if (this.currentQuestions.length > 0) {
            this.elements.btnJumpTop?.classList.remove("hidden");
            this.elements.btnJumpBottom?.classList.remove("hidden");
        }

        setTimeout(() => {
            this.handleScrollStickyBank();
            this.handleScrollSidebarSync();
        }, 100);
    },

    setupAtomBuilderUI(container, q, idx) {
        q._isCorrect = false;
        q._userAnswer = null;

        const widgetWrapper = document.createElement('div');
        widgetWrapper.className = 'atom-builder-widget-wrapper';

        widgetWrapper.innerHTML = `
            <div class="atom-builder-container">
                <div class="atom-builder-left">
                    <div>
                        <h3>Particle Bank</h3>
                        <div class="ab-bank-zone p-bank" data-zone-type="bank"></div>
                    </div>
                    <div>
                        <h3>Label Bank</h3>
                        <div class="ab-bank-zone l-bank" data-zone-type="bank"></div>
                    </div>
                </div>

                <div class="atom-builder-right">
                    <div class="ab-live-tracker">
                        <div class="ab-tracker-item">Protons: <span class="ab-badge ab-proton-badge pending">0/3</span></div>
                        <div class="ab-tracker-item">Neutrons: <span class="ab-badge ab-neutron-badge pending">0/4</span></div>
                        <div class="ab-tracker-item">Shell 1: <span class="ab-badge ab-s1-badge pending">0/2 e⁻</span></div>
                        <div class="ab-tracker-item">Shell 2: <span class="ab-badge ab-s2-badge pending">0/1 e⁻</span></div>
                    </div>

                    <div class="ab-atom-visual">
                        <svg class="ab-svg-bg" width="550" height="380" viewBox="0 0 550 380">
                            <circle cx="260" cy="190" r="150" fill="none" stroke="#BDC3C7" stroke-width="2" stroke-dasharray="8,8" />
                            <circle cx="260" cy="190" r="85" fill="none" stroke="#BDC3C7" stroke-width="2" stroke-dasharray="8,8" />
                            <line x1="440" y1="58" x2="330" y2="58" stroke="#95A5A6" stroke-width="2" stroke-dasharray="4,4" />
                            <line x1="440" y1="138" x2="320" y2="138" stroke="#95A5A6" stroke-width="2" stroke-dasharray="4,4" />
                        </svg>

                        <div class="ab-static-key">
                            <div class="ab-key-header">
                                <span class="ab-key-title">Interactive Key</span>
                                <span class="ab-badge ab-key-badge pending">0/3</span>
                            </div>
                            <div class="ab-key-row">
                                <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#E74C3C" stroke="#C0392B" stroke-width="2"/><path d="M 7 12 H 17 M 12 7 V 17" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
                                <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-proton"></div>
                            </div>
                            <div class="ab-key-row">
                                <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#95A5A6" stroke="#7F8C8D" stroke-width="2"/></svg>
                                <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-neutron"></div>
                            </div>
                            <div class="ab-key-row">
                                <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#3498DB" stroke="#2980B9" stroke-width="2"/><path d="M 7 12 H 17" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
                                <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-electron"></div>
                            </div>
                        </div>

                        <div class="ab-drop-zone ab-nucleus" data-zone-type="nucleus">
                            <div class="ab-nucleus-slot" data-accept="neutron" style="left:38px; top:38px;"></div>
                            <div class="ab-nucleus-slot" data-accept="proton" style="left:38px; top:14px;"></div>
                            <div class="ab-nucleus-slot" data-accept="neutron" style="left:59px; top:26px;"></div>
                            <div class="ab-nucleus-slot" data-accept="proton" style="left:59px; top:50px;"></div>
                            <div class="ab-nucleus-slot" data-accept="neutron" style="left:38px; top:62px;"></div>
                            <div class="ab-nucleus-slot" data-accept="proton" style="left:17px; top:50px;"></div>
                            <div class="ab-nucleus-slot" data-accept="neutron" style="left:17px; top:26px;"></div>
                        </div>

                        <div class="ab-drop-zone ab-shell-slot ab-shell1" data-zone-type="shell1" style="left:246px; top:91px;"></div>
                        <div class="ab-drop-zone ab-shell-slot ab-shell1" data-zone-type="shell1" style="left:246px; top:261px;"></div>

                        <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:246px; top:26px;"></div>
                        <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:246px; top:326px;"></div>
                        <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:96px; top:176px;"></div>
                        <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:396px; top:176px;"></div>

                        <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-shell2" style="left:440px; top:42px;"></div>
                        <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-shell1" style="left:440px; top:122px;"></div>
                    </div>

                    <div class="ab-extra-tasks">
                        <div class="ab-task-box">
                            <div class="ab-task-header">
                                <h4>1. Select Element Symbol</h4>
                                <span class="ab-badge ab-symbol-badge pending">Pending</span>
                            </div>
                            <div class="ab-symbol-options"></div>
                        </div>
                        <div class="ab-task-box">
                            <div class="ab-task-header">
                                <h4>2. Electron Configuration</h4>
                                <span class="ab-badge ab-config-badge pending">Pending</span>
                            </div>
                            <input type="text" class="ab-config-input" placeholder="(2, 8, 1)">
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(widgetWrapper);

        // Instantiate Particle Items
        const pBank = widgetWrapper.querySelector('.p-bank');
        const lBank = widgetWrapper.querySelector('.l-bank');

        const particleConfig = {
            proton: { color: '#E74C3C', stroke: '#C0392B', svg: '<path d="M 7 12 H 17 M 12 7 V 17" stroke="white" stroke-width="2" stroke-linecap="round"/>' },
            neutron: { color: '#95A5A6', stroke: '#7F8C8D', svg: '' },
            electron: { color: '#3498DB', stroke: '#2980B9', svg: '<path d="M 7 12 H 17" stroke="white" stroke-width="2" stroke-linecap="round"/>' }
        };

        const createParticleEl = (type) => {
            const el = document.createElement('div');
            el.className = 'ab-particle';
            el.dataset.type = type;
            el.draggable = true;
            const c = particleConfig[type];
            el.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${c.color}" stroke="${c.stroke}" stroke-width="2"/>${c.svg}</svg>`;
            return el;
        };

        for (let i = 0; i < 6; i++) pBank.appendChild(createParticleEl('proton'));
        for (let i = 0; i < 6; i++) pBank.appendChild(createParticleEl('neutron'));
        for (let i = 0; i < 6; i++) pBank.appendChild(createParticleEl('electron'));

        const labels = [
            { id: 'label-proton', text: 'Protons' },
            { id: 'label-neutron', text: 'Neutrons' },
            { id: 'label-electron', text: 'Electrons' },
            { id: 'label-shell1', text: 'Shell 1' },
            { id: 'label-shell2', text: 'Shell 2' }
        ];

        labels.forEach(l => {
            const el = document.createElement('div');
            el.className = 'ab-label-item';
            el.dataset.type = l.id;
            el.draggable = true;
            el.innerText = l.text;
            lBank.appendChild(el);
        });

        // Symbols Generation
        const symContainer = widgetWrapper.querySelector('.ab-symbol-options');
        const elementsList = ["H","He","Li","Be","B","C","N","O","F","Ne","Na","Mg","Al"];
        let symOpts = [{ z: 3, a: 7, sym: 'Li' }];
        while(symOpts.length < 4) {
            let rZ = Math.floor(Math.random() * 12) + 1;
            if (symOpts.find(o => o.z === rZ)) continue;
            symOpts.push({ z: rZ, a: Math.round(rZ * 2.1), sym: elementsList[rZ-1] });
        }
        symOpts.sort(() => Math.random() - 0.5);

        symOpts.forEach(opt => {
            const card = document.createElement('div');
            card.className = 'ab-symbol-card';
            card.dataset.z = opt.z;
            card.innerHTML = `<div class="ab-mass">${opt.a}</div><div class="ab-num">${opt.z}</div><div>${opt.sym}</div>`;
            card.onclick = (e) => {
                e.stopPropagation();
                widgetWrapper.querySelectorAll('.ab-symbol-card').forEach(c => c.classList.remove('selected-symbol'));
                card.classList.add('selected-symbol');
                autoCheck();
            };
            symContainer.appendChild(card);
        });

        // Config Input Setup
        const cfgInput = widgetWrapper.querySelector('.ab-config-input');
        let prevVal = "";
        cfgInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.key.length > 1) return;
            if (!/^\d$/.test(e.key)) e.preventDefault();
        });
        cfgInput.addEventListener('input', function(e) {
            let digits = this.value.replace(/\D/g, '');
            if (e.inputType === 'deleteContentBackward' && digits === prevVal) digits = digits.slice(0, -1);
            prevVal = digits;
            this.value = digits.length > 0 ? '(' + digits.split('').join(', ') + ')' : '';
            autoCheck();
        });

        // Drag and Drop & Click Engine
        let selectedItem = null;
        let draggedItem = null;

        const autoCheck = () => {
            const protons = widgetWrapper.querySelectorAll('.ab-nucleus .ab-particle[data-type="proton"]').length;
            const neutrons = widgetWrapper.querySelectorAll('.ab-nucleus .ab-particle[data-type="neutron"]').length;
            const s1 = widgetWrapper.querySelectorAll('.ab-shell1 .ab-particle[data-type="electron"]').length;
            const s2 = widgetWrapper.querySelectorAll('.ab-shell2 .ab-particle[data-type="electron"]').length;

            updateBadgeEl(widgetWrapper.querySelector('.ab-proton-badge'), protons, 3, `${protons}/3`);
            updateBadgeEl(widgetWrapper.querySelector('.ab-neutron-badge'), neutrons, 4, `${neutrons}/4`);
            updateBadgeEl(widgetWrapper.querySelector('.ab-s1-badge'), s1, 2, `${s1}/2 e⁻`);
            updateBadgeEl(widgetWrapper.querySelector('.ab-s2-badge'), s2, 1, `${s2}/1 e⁻`);

            let keyCorrect = 0;
            widgetWrapper.querySelectorAll('.ab-static-key .ab-label-zone').forEach(z => {
                const child = z.children[0];
                if (child && child.dataset.type === z.dataset.accept) {
                    keyCorrect++;
                    z.classList.add('correct-drop'); z.classList.remove('incorrect-drop');
                } else if (child) {
                    z.classList.add('incorrect-drop'); z.classList.remove('correct-drop');
                } else z.classList.remove('correct-drop', 'incorrect-drop');
            });
            updateBadgeEl(widgetWrapper.querySelector('.ab-key-badge'), keyCorrect, 3, `${keyCorrect}/3`, "✓ Complete");

            let diagramLabels = 0;
            widgetWrapper.querySelectorAll('.ab-atom-visual > .ab-label-zone').forEach(z => {
                const child = z.children[0];
                if (child && child.dataset.type === z.dataset.accept) {
                    diagramLabels++;
                    z.classList.add('correct-drop'); z.classList.remove('incorrect-drop');
                } else if (child) {
                    z.classList.add('incorrect-drop'); z.classList.remove('correct-drop');
                } else z.classList.remove('correct-drop', 'incorrect-drop');
            });

            const selSym = widgetWrapper.querySelector('.ab-symbol-card.selected-symbol');
            const symBadge = widgetWrapper.querySelector('.ab-symbol-badge');
            let isSymCorrect = false;
            widgetWrapper.querySelectorAll('.ab-symbol-card').forEach(c => c.classList.remove('correct-card', 'incorrect-card'));
            if (selSym) {
                if (selSym.dataset.z === '3') {
                    isSymCorrect = true; selSym.classList.add('correct-card');
                    symBadge.className = 'ab-badge correct'; symBadge.innerText = '✓ Correct';
                } else {
                    selSym.classList.add('incorrect-card');
                    symBadge.className = 'ab-badge incorrect'; symBadge.innerText = '✗ Incorrect';
                }
            } else { symBadge.className = 'ab-badge pending'; symBadge.innerText = 'Pending'; }

            const cfgVal = cfgInput.value.trim();
            const cfgBadge = widgetWrapper.querySelector('.ab-config-badge');
            let isCfgCorrect = false;
            cfgInput.classList.remove('correct-input', 'incorrect-input');
            if (cfgVal === '(2, 1)') {
                isCfgCorrect = true; cfgInput.classList.add('correct-input');
                cfgBadge.className = 'ab-badge correct'; cfgBadge.innerText = '✓ Correct';
            } else if (cfgVal.length > 0) {
                cfgInput.classList.add('incorrect-input');
                cfgBadge.className = 'ab-badge incorrect'; cfgBadge.innerText = '✗ Incorrect';
            } else { cfgBadge.className = 'ab-badge pending'; cfgBadge.innerText = 'Pending'; }

            const isAllCorrect = protons === 3 && neutrons === 4 && s1 === 2 && s2 === 1 && keyCorrect === 3 && diagramLabels === 2 && isSymCorrect && isCfgCorrect;
            q._isCorrect = isAllCorrect;
            q._userAnswer = isAllCorrect ? "Completed Lithium Atom" : null;
            this.updateProgress();
        };

        const updateBadgeEl = (badge, curr, target, textPending, textSuccess) => {
            if (!badge) return;
            if (curr === target) {
                badge.className = 'ab-badge correct';
                badge.innerText = textSuccess || `${textPending} ✓`;
            } else if (curr > target) {
                badge.className = 'ab-badge incorrect';
                badge.innerText = `${curr}/${target} ✗`;
            } else {
                badge.className = 'ab-badge pending';
                badge.innerText = textPending;
            }
        };

        const returnToBank = (item) => {
            if (item.dataset.type.startsWith('label')) widgetWrapper.querySelector('.l-bank').appendChild(item);
            else widgetWrapper.querySelector('.p-bank').appendChild(item);
            autoCheck();
        };

        const tryPlace = (item, type, zone) => {
            let slot = null, ok = false;
            const zType = zone.dataset.zoneType;
            if (zType === 'nucleus') {
                const empty = Array.from(zone.querySelectorAll(`.ab-nucleus-slot[data-accept="${type}"]`)).filter(s => s.children.length === 0);
                if (empty.length > 0) { slot = empty[0]; ok = true; }
            } else if (zType === 'shell1' || zType === 'shell2') {
                if (type === 'electron' && zone.children.length === 0) { slot = zone; ok = true; }
            } else if (zType === 'label') {
                if (type === zone.dataset.accept && zone.children.length === 0) { slot = zone; ok = true; }
            } else if (zType === 'bank') {
                ok = true; slot = type.startsWith('label') ? widgetWrapper.querySelector('.l-bank') : widgetWrapper.querySelector('.p-bank');
            }

            if (ok && slot) {
                slot.appendChild(item);
                autoCheck();
            } else {
                zone.appendChild(item);
                item.classList.add('flashing-red');
                setTimeout(() => {
                    item.classList.remove('flashing-red');
                    returnToBank(item);
                }, 1500);
            }
        };

        widgetWrapper.querySelectorAll('.ab-particle, .ab-label-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                e.dataTransfer.setData('text/plain', item.dataset.type);
            });
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!item.parentElement.classList.contains('ab-bank-zone')) returnToBank(item);
            });
        });

        widgetWrapper.querySelectorAll('.ab-drop-zone, .ab-bank-zone').forEach(zone => {
            zone.addEventListener('dragover', (e) => e.preventDefault());
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                if (draggedItem) tryPlace(draggedItem, draggedItem.dataset.type, zone);
                draggedItem = null;
            });
        });

        autoCheck();
    },

    setupMultipleChoiceUI(container, q, idx) {
        let options = [];
        let correctIdx = q['correct ans index'];
        if (typeof correctIdx === 'string' && !isNaN(correctIdx)) correctIdx = parseInt(correctIdx, 10) - 1;
        else if (typeof correctIdx === 'number') correctIdx = correctIdx - 1;

        for (let i = 0; i < 26; i++) {
            let k = String.fromCharCode(97 + i);
            if (q[k] !== undefined && q[k] !== null && String(q[k]).trim() !== "") {
                options.push({ text: formatDisplayString(String(q[k])), is_correct: i === correctIdx });
            }
        }
        options.sort(() => Math.random() - 0.5);

        let newCorrectIdx = options.findIndex(o => o.is_correct);
        q._cToken = btoa(newCorrectIdx.toString());
        delete q['correct ans index']; 

        q._mcqElements = [];
        q._selectedMcqIndex = -1;

        options.forEach((opt, i) => {
            let card = document.createElement('div');
            card.className = 'mcq-card';
            card.innerHTML = opt.text;
            
            card.onclick = () => {
                q._selectedMcqIndex = i;
                q._userAnswer = opt.text; 
                
                q._mcqElements.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                
                this.updateProgress();
            };

            q._mcqElements.push(card);
            container.appendChild(card);
        });
    },

    setupClassSelectionUI(container, q, idx) {
        let grid = document.createElement('div');
        grid.className = 'class-btn-group';
        CLASSES.forEach(opt => {
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
    },

    setupComplexMatchingUI(container, q, idx) {
        let pairs = (q.answers || []).map(p => ({
            ...p,
            text: p.text ? formatDisplayString(String(p.text)) : p.text,
            answer_text: p.answer_text ? formatDisplayString(String(p.answer_text)) : p.answer_text
        }));
        let distractors = (q.distractors || []).map(d => formatDisplayString(String(d))); 
        let allAnswers = pairs.map(p => p.answer_text);
        let allWords = [...allAnswers, ...distractors];

        const uniqueWords = [...new Set(allWords)];
        const allowReuse = uniqueWords.length < allWords.length;

        const toB64 = (str) => btoa(unescape(encodeURIComponent(str || "")));

        this.matchingStates[idx] = {
            words: allowReuse ? uniqueWords.sort() : allWords.sort(() => Math.random() - 0.5),
            slots: pairs.map(p => ({ 
                _c: toB64(p.answer_text), 
                current: null 
            })),
            allowReuse: allowReuse
        };

        if (q.answers) {
            q.answers.forEach(p => {
                delete p.answer_text;
                delete p.answer_match_right;
            });
        }
        delete q.distractors;
        delete q.matching_answer_incorrect_matches;

        pairs.forEach((pair, slotIdx) => {
            let row = document.createElement('div');
            row.className = 'match-row';
            row.innerHTML = `
                <div class="match-def">${pair.text}</div>
                <div class="answer-slot" data-slot-index="${slotIdx}">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
            `;
            row.querySelector('.answer-slot').onclick = (e) => this.handleSlotClick(idx, slotIdx, e.target);
            container.appendChild(row);
        });
    },

    handleScrollStickyBank() {
        const area = this.elements.scrollArea;
        const bank = this.elements.stickyBank;
        const mainContent = this.root.querySelector('.quiz-main-content');
        if (!area || !bank || !mainContent) return;
        
        if (this._stickyBankTimer) {
            clearTimeout(this._stickyBankTimer);
        }

        this._stickyBankTimer = setTimeout(() => {
            const mainRect = mainContent.getBoundingClientRect();
            let bestIdx = null;
            let maxVisibleHeight = 0;

            for (const idx in this.matchingStates) {
                let el = this.root.querySelector(`[data-question-index="${idx}"]`);
                if (!el) continue;
                let rect = el.getBoundingClientRect();

                const overlapTop = Math.max(rect.top, mainRect.top);
                const overlapBottom = Math.min(rect.bottom, mainRect.bottom);
                const visibleHeight = overlapBottom - overlapTop;

                if (visibleHeight > 50) { 
                    if (visibleHeight > maxVisibleHeight) {
                        maxVisibleHeight = visibleHeight;
                        bestIdx = idx;
                    }
                }
            }

            const foundVisible = (bestIdx !== null);
            const wasHidden = bank.classList.contains("hidden");
            const shouldBeHidden = !foundVisible;

            if (foundVisible) {
                if (this.activeMatchingQuestionId !== bestIdx) {
                    if (!wasHidden) {
                        const oldHeight = bank.offsetHeight || 0;
                        this.renderStickyBank(bestIdx);
                        const newHeight = bank.offsetHeight || 0;
                        const diff = newHeight - oldHeight;
                        if (diff !== 0) {
                            area.scrollTop = area.scrollTop + diff;
                        }
                    } else {
                        this.renderStickyBank(bestIdx);
                    }
                    this.activeMatchingQuestionId = bestIdx;
                }
            }

            if (wasHidden !== shouldBeHidden) {
                if (shouldBeHidden) {
                    const bankHeight = bank.offsetHeight || 0;
                    bank.classList.add("hidden");
                    if (bankHeight > 0) {
                        area.scrollTop = Math.max(0, area.scrollTop - bankHeight);
                    }
                    this.activeMatchingQuestionId = null;
                } else {
                    bank.classList.remove("hidden");
                    const bankHeight = bank.offsetHeight || 0;
                    if (bankHeight > 0) {
                        area.scrollTop = area.scrollTop + bankHeight;
                    }
                }
            }
        }, 25);
    },

    handleScrollSidebarSync() {
        const area = this.elements.scrollArea;
        const mainContent = this.root.querySelector('.quiz-main-content');
        const sidebar = this.root.querySelector('.quiz-sidebar');
        if (!area || !mainContent || !sidebar) return;

        const mainRect = mainContent.getBoundingClientRect();
        const viewportCenter = mainRect.top + (mainRect.height / 2);
        
        let activeIdx = this._lastActiveIdx !== undefined ? this._lastActiveIdx : 0;
        let found = false;

        for (let idx = 0; idx < this.currentQuestions.length; idx++) {
            const frame = this.root.querySelector(`[data-question-index="${idx}"]`);
            if (!frame) continue;
            const rect = frame.getBoundingClientRect();
            if (rect.top <= viewportCenter && rect.bottom >= viewportCenter) {
                activeIdx = idx;
                found = true;
                break;
            }
        }

        if (!found && this.currentQuestions.length > 0) {
            let minDistance = Infinity;
            let closestIdx = activeIdx;
            for (let idx = 0; idx < this.currentQuestions.length; idx++) {
                const frame = this.root.querySelector(`[data-question-index="${idx}"]`);
                if (!frame) continue;
                const rect = frame.getBoundingClientRect();
                const frameCenter = rect.top + (rect.height / 2);
                const distance = Math.abs(frameCenter - viewportCenter);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestIdx = idx;
                }
            }
            activeIdx = closestIdx;
        }

        this._lastActiveIdx = activeIdx;

        this.sidebarButtons.forEach((btn, i) => {
            if (i === activeIdx) {
                btn.classList.add('active-nav');
                btn.dataset.current = "true";

                const sbRect = sidebar.getBoundingClientRect();
                const btnRect = btn.getBoundingClientRect();
                
                if (btnRect.top < sbRect.top + 10 || btnRect.bottom > sbRect.bottom - 10) {
                    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } else {
                btn.classList.remove('active-nav');
                btn.dataset.current = "false";
            }
        });
    },

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
            btn.innerHTML = word; 

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
    },

    fillSlotWithWord(qIdx, slotIdx, word, providedSlotEl = null) {
        const state = this.matchingStates[qIdx];
        if (!state) return;
        
        if (!state.allowReuse) {
            state.slots.forEach((s, i) => {
                if (s.current === word) {
                    s.current = null;
                    const otherSlotEl = this.root.querySelector(`[data-question-index="${qIdx}"] [data-slot-index="${i}"]`);
                    if (otherSlotEl) {
                        otherSlotEl.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
                        otherSlotEl.className = "answer-slot";
                    }
                }
            });
        }

        state.slots[slotIdx].current = word;
        const targetSlotEl = providedSlotEl || this.selectedSlot?.element || this.root.querySelector(`[data-question-index="${qIdx}"] [data-slot-index="${slotIdx}"]`);

        if (targetSlotEl) {
            targetSlotEl.innerHTML = word; 
            targetSlotEl.className = "answer-slot filled";
        }

        this.selectedBankWord = null;
        this.selectedSlot = null;
        this.updateProgress();
        this.renderStickyBank(qIdx);
    },

    handleSlotClick(qIdx, slotIdx, slotEl) {
        const state = this.matchingStates[qIdx];
        if (!state) return;
        const slotData = state.slots[slotIdx];

        if (slotData.current) {
            slotData.current = null;
            slotEl.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
            slotEl.className = "answer-slot";
            this.updateProgress();
            this.renderStickyBank(qIdx);
            return;
        }

        if (this.selectedBankWord) {
            this.fillSlotWithWord(qIdx, slotIdx, this.selectedBankWord, slotEl);
            return;
        }

        this.selectedSlot?.element?.classList.remove('selected');
        if (this.selectedSlot?.element === slotEl) {
            this.selectedSlot = null;
        } else {
            this.selectedSlot = { qIdx, slotIdx, element: slotEl };
            slotEl.classList.add('selected');
        }
    },

    updateProgress() {
        if (!this.elements.quizProgress) return;
        let answeredCount = 0;
        this.currentQuestions.forEach((q, idx) => {
            let isAnswered = false;
            let type = q.type || q.question_type;
            let isComplexMatching = type === 'matching_question' && q.answers?.[0]?.text !== undefined;
            
            if (type === 'atom_builder_question') {
                if (q._isCorrect) isAnswered = true;
            } else if (isComplexMatching) {
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
};