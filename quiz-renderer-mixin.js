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
        
        if (this.elements.quizTitle) this.elements.quizTitle.innerText = formatDisplayString(quizName);
        
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
            // Apply Dynamic Indexing route
            const relativePath = quizIndex[quizName] || `${encodeURIComponent(quizName)}.json`;
            const quizPath = this.isBonus ? `0_Quiz/bonus/${encodeURIComponent(quizName)}.json` : `0_Quiz/${encodeURI(relativePath)}`;
            
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
};