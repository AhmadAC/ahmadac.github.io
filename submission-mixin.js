// submission-mixin.js

import { triggerConfetti, formatDisplayString } from './utils.js';

export const SubmissionMixin = {
    submitQuiz() {
        let unansweredIndices = [];
        this.currentQuestions.forEach((q, idx) => {
            let type = q.type || q.question_type;
            
            // Check if the title text indicates the question is administrative
            let txt = (q['question text'] || q.question_text || "").toLowerCase();
            let isAdmin = txt.includes('select your class') || txt.includes('english name') || txt.includes('your name');
            
            // Evaluates complex matching questions (ignoring class selection matches)
            let isComplexMatching = type === 'matching_question' && q.answers?.[0]?.text !== undefined && !isAdmin;
            
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
        if (!classAns) classAns = this.isBonus ? "Bonus" : "Unknown";

        if (this.elements.errorMsg) this.elements.errorMsg.innerText = "";
        this.elements.stickyBank?.classList.add("hidden");
        let totalScore = 0, totalPossible = 0;
        let firstWrongIndex = -1;

        this.currentQuestions.forEach((q, idx) => {
            let frame = this.root.querySelector(`[data-question-index="${idx}"]`);
            if (!frame) return;
            let type = q.type || q.question_type, pts = parseInt(q.points || q.points_possible) || 0;
            let qIsWrong = false;
            let qIsCorrect = false;
            
            let txt = (q['question text'] || q.question_text || "").toLowerCase();
            let isAdmin = txt.includes('select your class') || txt.includes('english name') || txt.includes('your name');
            let isComplexMatching = type === 'matching_question' && q.answers?.[0]?.text !== undefined && !isAdmin;
            
            if (isComplexMatching) {
                totalPossible += pts;
                let state = this.matchingStates[idx], correctCount = 0;
                
                const fromB64 = (str) => {
                    try { return decodeURIComponent(escape(atob(str))); }
                    catch(e) { return ""; }
                };

                // Safe-guard condition block checks if matching state was actively populated
                if (state && state.slots) {
                    state.slots.forEach((s, sIdx) => {
                        let slotEl = frame.querySelector(`[data-slot-index="${sIdx}"]`);
                        if (slotEl) {
                            let actualCorrect = fromB64(s._c);
                            slotEl.style.pointerEvents = 'none';
                            if (s.current === actualCorrect) {
                                correctCount++; slotEl.className = "answer-slot correct";
                            } else {
                                slotEl.className = "answer-slot incorrect";
                                // Parse corrective layout values with .innerHTML so fractions render correctly in feedback
                                slotEl.innerHTML = `${s.current || 'Empty'} (Req: ${actualCorrect})`;
                            }
                        }
                    });
                    if (state.slots.length > 0) {
                        if (correctCount < state.slots.length) qIsWrong = true;
                        else if (correctCount === state.slots.length) qIsCorrect = true;
                        totalScore += Math.round((correctCount / state.slots.length) * pts);
                    }
                }
            } else if (type === 'multiple_choice_question') {
                totalPossible += pts;
                let userIdx = q._selectedMcqIndex !== undefined ? q._selectedMcqIndex : -1;
                let isCorrect = false;
                
                let actualCorrectIdx = -1;
                try {
                    actualCorrectIdx = parseInt(atob(q._cToken), 10);
                } catch(e) {}

                q._mcqElements.forEach((card, i) => {
                    card.onclick = null;
                    card.style.pointerEvents = 'none';

                    if (userIdx !== -1) {
                        if (i === userIdx) {
                            if (i === actualCorrectIdx) {
                                card.classList.add('correct');
                                isCorrect = true;
                            } else {
                                card.classList.add('incorrect');
                            }
                        }
                        
                        if (i === actualCorrectIdx && i !== userIdx) {
                            card.classList.add('correct');
                            card.innerHTML += " (Correct Answer)";
                        }
                    }
                });

                if (isCorrect) {
                    qIsCorrect = true;
                    totalScore += pts;
                } else {
                    qIsWrong = true;
                }
            }

            // Record and save the index of the first wrong question containing visual point values
            if (qIsWrong && firstWrongIndex === -1 && pts > 0) {
                firstWrongIndex = idx;
            }

            let btn = this.sidebarButtons[idx];
            if (btn) {
                btn.dataset.highlighted = "false";
                if (pts > 0) {
                    if (qIsWrong) {
                        btn.dataset.wrong = "true";
                        btn.dataset.correct = "false";
                    } else if (qIsCorrect) {
                        btn.dataset.wrong = "false";
                        btn.dataset.correct = "true";
                    }
                }
            }
        });

        this.finalStudentName = nameAns; this.finalStudentClass = classAns;
        this.finalScore = totalScore; this.finalTotalPossible = totalPossible;

        let perc = totalPossible === 0 ? 100 : Math.round((totalScore / totalPossible) * 100);
        let state = perc >= 60 ? "pass" : perc > 0 ? "warning" : "fail";

        if (perc === 100) triggerConfetti();
        
        this.saveResult(this.currentQuizName, nameAns, classAns, totalScore, totalPossible);

        let msg = `Student: ${nameAns} | Class: ${classAns}\nScore: ${totalScore}/${totalPossible} (${perc}%)\n\n`;
        
        // Positive and encouraging language tiers based on percentage (Emojis removed)
        if (perc === 100) {
            msg += "Outstanding! Perfect score!";
        } else if (perc >= 80) {
            msg += "Great job! Keep up the excellent work!";
        } else if (perc >= 60) {
            msg += "Good effort! Review your mistakes and you'll do even better next time!";
        } else if (perc > 0) {
            msg += "We believe in you! Review your mistakes and try again—you've got this!";
        } else {
            msg += "Don't give up! Every mistake is a learning opportunity. Give it another try!";
        }

        this.elements.btnSubmit?.classList.add("hidden");
        if (this.elements.btnSubmit) this.elements.btnSubmit.disabled = true;
        this.elements.btnRedo?.classList.remove("hidden");
        this.elements.btnSavePic?.classList.remove("hidden");
        
        if (this.elements.resultBox && this.elements.resultText) {
            this.elements.resultBox.dataset.status = state;
            this.elements.resultText.innerText = msg;
            this.elements.resultBox.classList.remove("hidden");
        }

        // Show the score permanently at the top in the header
        if (this.elements.quizScoreLbl) {
            this.elements.quizScoreLbl.innerText = `Name: ${nameAns}, Score: ${totalScore}/${totalPossible} (${perc}%)`;
            this.elements.quizScoreLbl.dataset.status = state;
            this.elements.quizScoreLbl.classList.remove("hidden");
        }
        if (this.elements.quizProgress) {
            this.elements.quizProgress.classList.add("hidden");
        }

        // JUMP TO INCORRECT/WRONG REVIEW SYSTEM:
        // Automatically scroll to first wrong question if score is less than 100%, else scroll to results box
        if (firstWrongIndex !== -1) {
            let targetFrame = this.root.querySelector(`[data-question-index="${firstWrongIndex}"]`);
            if (targetFrame && this.elements.scrollArea) {
                let scrollArea = this.elements.scrollArea;
                let offsetTop = targetFrame.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top + scrollArea.scrollTop;
                scrollArea.scrollTo({ top: offsetTop - 10, behavior: 'smooth' });
            }
        } else {
            this.elements.scrollArea?.scrollTo({ top: this.elements.scrollArea.scrollHeight, behavior: 'smooth' });
        }
    },

    resetQuiz() {
        this.startQuiz(this.currentQuizName, this.isBonus);
    },
    
    async submitToTencentWebhook(payload) {
        const TENCENT_URL = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=2cGDgH4Pcdag3rgX3j1BCgZ82ePKwD5S9Kcw84c7G6733Py3AHQnhgBnrqfcqYBu0e8mEpuBTkJj3HgqUstHB3zNoJdadg0y4A2TGOqElbp2";
        const WEBHOOK_URL = "https://corsproxy.io/?" + encodeURIComponent(TENCENT_URL);
        
        const requestBody = {
            "add_records":[
                {
                    "values": {
                        "f04Gwj": String(payload.studentName || "Unknown"),
                        "ftQMc5": String(payload.studentClass || "Unknown"),
                        "ftk5Tx": String(payload.quizName || "Unknown"),
                        "ffFwIh": Number(payload.score || 0),
                        "fn8TJd": Number(payload.totalPossible || 0)
                    }
                }
            ]
        };

        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();
            let successfullyCreated = false;
            if (result.add_records && result.add_records.length > 0) {
                if (result.add_records[0].record_id) {
                    successfullyCreated = true;
                }
            }

            if (result.ret === 0 || result.errcode === 0 || response.ok) {
                return true;
            } else {
                throw new Error(result.errmsg || result.msg || "Failed to submit to Tencent Smartsheet");
            }
        } catch (error) {
            throw error;
        }
    },

    saveResult(quizName, name, cls, score, total) {
        // Local browser storage fallback for Web/GitHub pages
        let data = JSON.parse(localStorage.getItem('quiz_results') || '{}');
        if (!data[cls]) data[cls] = {};
        if (!data[cls][name]) data[cls][name] = {};
        if (!data[cls][name][quizName]) data[cls][name][quizName] = { best: 0, attempts: [] };
        data[cls][name][quizName].attempts.push({ s: score, t: total, ts: new Date().toISOString() });
        if (score > data[cls][name][quizName].best) data[cls][name][quizName].best = score;
        localStorage.setItem('quiz_results', JSON.stringify(data));

        const payload = {
            studentName: name,
            studentClass: cls,
            quizName: quizName,
            score: score,
            totalPossible: total
        };
        
        // IF OFFLINE: Send to local Python Server, which writes QuizResults.json and triggers Tencent webhook safely
        if (window.isOfflineMode) {
            fetch('/api/save_result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(res => {
                if (!res.ok) {
                    console.warn("[DEBUG] Local API failed, falling back to Webhook.");
                    this.submitToTencentWebhook(payload).catch(err => console.error(err));
                }
            }).catch(err => {
                console.warn("[DEBUG] Local API error, falling back to Webhook.", err);
                this.submitToTencentWebhook(payload).catch(err2 => console.error(err2));
            });
        } else {
            // Standard Web Mode using CORS proxy
            this.submitToTencentWebhook(payload).catch(err => {
                console.error("[DEBUG] Failed to submit to Tencent webhook:", err);
            });
        }
    },

    saveResultAsImage() {
        if (!this.finalStudentName || !this.finalStudentClass) {
            return;
        }
        
        const data = [
            { label: "Class", value: this.finalStudentClass },
            { label: "HW", value: formatDisplayString(this.currentQuizName) },
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
        canvas.width = cw1 + cw2; 
        canvas.height = rh * data.length;
        
        ctx.fillStyle = "#ffffff"; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
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
        
        const executeDownload = () => {
            const link = document.createElement('a');
            link.download = `${this.finalStudentClass}_${this.finalStudentName.replace(/[^a-z0-9]/gi, '_')}_${this.currentQuizName.replace(/[^a-z0-9]/gi, '_')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };

        const watermark = new Image();
        watermark.crossOrigin = "Anonymous"; 
        watermark.src = "0_Quiz/media/coopersig.png"; 

        watermark.onload = () => {
            ctx.globalAlpha = 0.2; 
            const scale = Math.min(canvas.width / watermark.width, canvas.height / watermark.height) * 0.9;
            const newW = watermark.width * scale;
            const newH = watermark.height * scale;
            const dx = (canvas.width - newW) / 2;
            const dy = (canvas.height - newH) / 2;
            
            ctx.drawImage(watermark, dx, dy, newW, newH);
            ctx.globalAlpha = 1.0; 
            executeDownload();
        };

        watermark.onerror = () => {
            console.warn("[DEBUG] Watermark not found at 0_Quiz/media/coopersig.png, downloading image without it.");
            executeDownload(); 
        };
    }
};