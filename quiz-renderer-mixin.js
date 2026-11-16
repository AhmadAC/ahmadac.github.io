// quiz-renderer-mixin.js - Main Quiz Renderer Mixin Orchestrator

import { normalizeQuizData, quizIndex } from './quiz-data.js?v=2.2';
import { recursiveDecode, formatDisplayString, cleanQuizTitle, safeJsonParse, decodeUtf8B64, createSvgChart, renderMathToHtml } from './utils.js?v=2.2';
import { setupAtomBuilderUI } from './atom-builder-ui.js?v=2.2';
import { setupMultipleChoiceUI, setupClassSelectionUI, setupComplexMatchingUI } from './question-renderers.js?v=2.2';
import { handleScrollStickyBank, renderStickyBank, fillSlotWithWord, handleSlotClick } from './matching-bank-handler.js?v=2.2';

const isClassQuestion = (txt, qType) => {
    const t = (txt || "").toLowerCase();
    const type = (qType || "").toLowerCase();
    if (t.includes('class of lever') || t.includes('lever class') || t.includes('classify') || t.includes('classification')) {
        return false;
    }
    if (t.includes('select your class') || t.includes('select class') || t.includes('choose your class') || t.includes('pick your class')) {
        return true;
    }
    if ((t.includes('grade 6 class') || t.includes('g6a') || t.includes('g7a') || t.includes('g8a')) && t.includes('class')) {
        return true;
    }
    if (t.includes('your class') && (type.includes('multiple_choice') || type.includes('matching') || !type)) {
        return true;
    }
    if ((t.startsWith('class:') || t.startsWith('class :') || t === 'class') && !t.includes('classic')) {
        return true;
    }
    return false;
};

const isNameQuestion = (txt, qType) => {
    const t = (txt || "").toLowerCase();
    const type = (qType || "").toLowerCase();
    if (t.includes('english name') || t.includes('your name') || t.includes('student name') || t.includes('full name')) {
        return true;
    }
    if ((t.startsWith('name:') || t.startsWith('name :') || t === 'name') && type.includes('essay')) {
        return true;
    }
    return false;
};

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
        
        if (this.elements.quizTitle) this.elements.quizTitle.innerHTML = formatDisplayString(cleanQuizTitle(quizName));
        
        this.elements.quizProgress?.classList.remove("hidden");
        this.elements.quizScoreLbl?.classList.add("hidden");
        
        this.elements.resultBox?.classList.add("hidden");
        this.elements.btnSubmit?.classList.remove("hidden");
        if (this.elements.btnSubmit) this.elements.btnSubmit.disabled = false;
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
            
            const textContent = await res.text();
            const rawDataRaw = safeJsonParse(textContent);
            let rawData = recursiveDecode(rawDataRaw);
            
            console.log(`[DEBUG][Inst ${this.instanceId}] Raw JSON loaded & decoded successfully.`); 

            // Auto-detect and unpack if a document-wrapped JSON actually contains quiz data
            if (rawData && rawData.metadata && rawData.metadata.type === 'document') {
                let docData = rawData.data;
                let parsedQuiz = null;

                if (typeof docData === 'string') {
                    let cleanStr = docData.replace(/<br\s*\/?>/gi, '\n')
                                         .replace(/<\/?p[^>]*>/gi, '\n')
                                         .replace(/&quot;/g, '"')
                                         .replace(/&amp;/g, '&')
                                         .replace(/&lt;/g, '<')
                                         .replace(/&gt;/g, '>')
                                         .trim();
                    if (cleanStr.startsWith('[') || cleanStr.startsWith('{')) {
                        try {
                            let parsed = safeJsonParse(cleanStr);
                            parsed = recursiveDecode(parsed);
                            let items = Array.isArray(parsed) ? parsed : (parsed.data || [parsed]);
                            if (Array.isArray(items) && items.some(item => item && (item['question text'] || item['question_text'] || item['type'] || item['question_type'] || item['question number']))) {
                                parsedQuiz = items;
                            }
                        } catch (e) {}
                    }
                } else if (Array.isArray(docData)) {
                    let decodedData = recursiveDecode(docData);
                    if (decodedData.some(item => item && (item['question text'] || item['question_text'] || item['type'] || item['question_type'] || item['question number']))) {
                        parsedQuiz = decodedData;
                    }
                }

                if (parsedQuiz) {
                    rawData = parsedQuiz;
                } else {
                    this.renderDocument(quizName, rawData);
                    return;
                }
            }

            let infoContent = "";
            let isVariationOn = false;

            const checkVariationFlag = (obj) => {
                if (!obj || typeof obj !== 'object') return false;
                const v = obj["variation on"] ?? obj["variation_on"] ?? obj["variations"] ?? obj["variation"];
                if (v === true || v === 1) return true;
                if (typeof v === 'string') {
                    const s = v.trim().toLowerCase();
                    return s === 'true' || s === '1' || s === 'on' || s === 'yes' || s === 'enabled';
                }
                return false;
            };

            if (Array.isArray(rawData)) {
                const metaItem = rawData.find(item => item && item.quiz_metadata);
                if (metaItem && metaItem.quiz_metadata) {
                    if (metaItem.quiz_metadata.info_content) {
                        infoContent = metaItem.quiz_metadata.info_content;
                    }
                    if (checkVariationFlag(metaItem.quiz_metadata)) {
                        isVariationOn = true;
                    }
                }
                if (!isVariationOn) {
                    for (const item of rawData) {
                        if (checkVariationFlag(item)) {
                            isVariationOn = true;
                            break;
                        }
                    }
                }
            } else if (rawData?.quiz_metadata) {
                if (rawData.quiz_metadata.info_content) {
                    infoContent = rawData.quiz_metadata.info_content;
                }
                if (checkVariationFlag(rawData.quiz_metadata) || checkVariationFlag(rawData)) {
                    isVariationOn = true;
                }
            } else if (rawData && typeof rawData === 'object') {
                if (checkVariationFlag(rawData)) {
                    isVariationOn = true;
                }
            }

            this.isVariationOn = isVariationOn;

            const infoSection = this.root.querySelector('.quiz-info-section');
            const infoContentDiv = this.root.querySelector('.info-content');
            if (infoSection && infoContentDiv) {
                if (infoContent) {
                    infoContent = renderMathToHtml(infoContent);

                    infoContent = infoContent.replace(/(href|src)=("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (match, attr, fullVal, dqVal, sqVal, unqVal) => {
                        let url = dqVal !== undefined ? dqVal : (sqVal !== undefined ? sqVal : unqVal);
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
                        let hrefMatch = attrs.match(/href="([^"]*)"/i) || attrs.match(/href='([^']*)'/i) || attrs.match(/href=([^\s>]+)/i);
                        let hrefVal = hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || "") : "";
                        let isHtml = hrefVal && /\.html?\b/i.test(hrefVal);
                        let isExternal = hrefVal && /^https?:\/\//i.test(hrefVal);
                        
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

            // Separate regular quiz questions from admin questions and deduplicate cleanly
            let quizQuestions = [];
            let classQuestions = [];
            let nameQuestions = [];

            normalized.forEach(q => {
                const qHasVar = q["variation on"] ?? q["variation_on"] ?? q["variations"] ?? q["variation"];
                if (qHasVar !== undefined && qHasVar !== null) {
                    const s = typeof qHasVar === 'string' ? qHasVar.trim().toLowerCase() : qHasVar;
                    q._variationOn = (s === true || s === 1 || s === 'true' || s === '1' || s === 'on' || s === 'yes' || s === 'enabled');
                } else {
                    q._variationOn = isVariationOn;
                }

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

                let txt = (q['question text'] || q.question_text || q['Question Text'] || q['Question_Text'] || q.question || "").toLowerCase();
                let qType = (q.type || q.question_type || "").toLowerCase();

                if (isClassQuestion(txt, qType)) {
                    if (!this.isBonus) {
                        classQuestions.push(q);
                    }
                } else if (isNameQuestion(txt, qType)) {
                    nameQuestions.push(q);
                } else {
                    quizQuestions.push(q);
                }
            });

            let maxQNum = quizQuestions.reduce((max, q) => {
                let n = parseFloat(q['question number'] || q.question_number || 0);
                return (!isNaN(n) && n > max) ? n : max;
            }, 0);

            // Deduplicate: Keep exactly ONE English Name question
            let singleNameQ = null;
            if (nameQuestions.length > 0) {
                singleNameQ = nameQuestions.find(q => {
                    let t = (q['question text'] || q.question_text || "").toLowerCase();
                    return t.includes('english name used in class') || t.includes('please write');
                }) || nameQuestions[0];
            } else {
                maxQNum += 1;
                singleNameQ = {
                    "url": "",
                    "question number": maxQNum,
                    "type": "essay_question",
                    "points": 0,
                    "question text": "Please write your English name used in class:"
                };
            }

            // Deduplicate: Keep exactly ONE Class Selection question (unless bonus)
            let singleClassQ = null;
            if (!this.isBonus) {
                if (classQuestions.length > 0) {
                    singleClassQ = classQuestions.find(q => {
                        let t = (q['question text'] || q.question_text || "").toLowerCase();
                        return t.includes('grade 6 class a') || t.includes('g6a');
                    }) || classQuestions[0];
                } else {
                    maxQNum += 1;
                    singleClassQ = {
                        "url": "",
                        "question number": maxQNum,
                        "type": "matching_question",
                        "points": 0,
                        "question text": "Please select your class:<br>G6A = Grade 6 Class A<br>G6B = Grade 6 Class B<br>G6C = Grade 6 Class C<br>G7A = Grade 7 Class A<br>G7B = Grade 7 Class B<br>G7C = Grade 7 Class C<br>G8A = Grade 8 Class A<br>G8B = Grade 8 Class B<br>G8C = Grade 8 Class C"
                    };
                }
            }

            let adminQuestions = [];
            if (singleClassQ) adminQuestions.push(singleClassQ);
            if (singleNameQ) adminQuestions.push(singleNameQ);

            if (randomizeQuestions) {
                const groupOrder = [];
                const groupsMap = new Map();

                quizQuestions.forEach((q, idx) => {
                    let gKey = q.group_id || q.group;
                    if (!gKey && q.chart && typeof q.chart === 'object') {
                        gKey = q.chart.title || JSON.stringify(q.chart);
                    } else if (!gKey && (q.svg || q.question_svg || q.chart_svg)) {
                        gKey = q.svg || q.question_svg || q.chart_svg;
                    }

                    if (gKey) {
                        if (!groupsMap.has(gKey)) {
                            groupsMap.set(gKey, []);
                            groupOrder.push(gKey);
                        }
                        groupsMap.get(gKey).push(q);
                    } else {
                        const uKey = `__single_${idx}`;
                        groupsMap.set(uKey, [q]);
                        groupOrder.push(uKey);
                    }
                });

                const shuffleArray = (arr) => {
                    for (let i = arr.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [arr[i], arr[j]] = [arr[j], arr[i]];
                    }
                    return arr;
                };

                shuffleArray(groupOrder);

                groupOrder.forEach(key => {
                    shuffleArray(groupsMap.get(key));
                });

                quizQuestions = groupOrder.flatMap(key => groupsMap.get(key));
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
            let qTextRaw = q['question text'] || q.question_text || q['Question Text'] || q['Question_Text'] || "";
            
            let embeddedSvg = "";
            let qTextPost = "";
            let svgMatch = String(qTextRaw).match(/(<svg[\s\S]*?<\/svg>)/i);
            if (svgMatch) {
                embeddedSvg = svgMatch[1];
                let parts = String(qTextRaw).split(embeddedSvg);
                qTextRaw = parts[0].trim();
                if (parts.length > 1 && parts[1].trim()) {
                    qTextPost = parts[1].trim().replace(/^(?:<br\s*\/?>\s*)+/i, '').trim();
                }
            }

            let qText = formatDisplayString(String(qTextRaw));
            let qTextPostFormatted = qTextPost ? formatDisplayString(String(qTextPost)) : "";
            
            let qTextLower = (qText || "").toLowerCase();
            let pts = parseInt(q.points || q.points_possible) || 0;
            let isComplexMatching = type === 'matching_question' && q.answers && Array.isArray(q.answers) && q.answers.length > 0 && q.answers[0]?.text !== undefined;
            let isAdmin = isClassQuestion(qTextLower, type) || isNameQuestion(qTextLower, type);
            
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

            let svgMarkup = embeddedSvg;
            if (!svgMarkup) {
                if (q.svg || q.question_svg || q.chart_svg) {
                    let rawSvg = q.svg || q.question_svg || q.chart_svg;
                    if (typeof rawSvg === 'string') {
                        svgMarkup = rawSvg.startsWith('b64:') ? decodeUtf8B64(rawSvg.substring(4)) : rawSvg;
                    }
                } else if (q.chart && typeof q.chart === 'object') {
                    svgMarkup = createSvgChart(q.chart);
                }
            }

            if (svgMarkup) {
                header += `<div class="question-svg-wrapper">${svgMarkup}</div>`;
            }

            if (qTextPostFormatted) {
                header += `<div class="question-text">${qTextPostFormatted}</div>`;
            }
            
            frame.innerHTML = header;
            let contentDiv = frame.querySelector('.question-content');

            if (isAdmin && isClassQuestion(qTextLower, type)) {
                this.setupClassSelectionUI(contentDiv, q, idx);
            } else if (isAdmin && type === 'matching_question') {
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
                };
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

    setupAtomBuilderUI,
    setupMultipleChoiceUI,
    setupClassSelectionUI,
    setupComplexMatchingUI,
    handleScrollStickyBank,
    renderStickyBank,
    fillSlotWithWord,
    handleSlotClick,

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

    updateProgress() {
        if (!this.elements.quizProgress) return;
        let answeredCount = 0;
        this.currentQuestions.forEach((q, idx) => {
            let isAnswered = false;
            let type = q.type || q.question_type;
            let isComplexMatching = type === 'matching_question' && q.answers?.[0]?.text !== undefined;
            let txt = (q['question text'] || q.question_text || "").toLowerCase();
            let isAdmin = isClassQuestion(txt, type) || isNameQuestion(txt, type);
            
            if (type === 'atom_builder_question') {
                if (q._isCorrect) isAnswered = true;
            } else if (isComplexMatching && !isAdmin) {
                let state = this.matchingStates[idx];
                if (state && state.slots.length > 0) {
                    let filled = state.slots.filter(s => s.current !== null).length;
                    if (filled === state.slots.length) isAnswered = true;
                }
            } else if (type === 'multiple_choice_question' && !isAdmin) {
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