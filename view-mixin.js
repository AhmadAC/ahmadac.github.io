// view-mixin.js

import { CLASSES, getCurrentTeachingWeekInfo, getSubjectsForClass, appSettings, getClassColor, hexToRgba } from './config.js?v=2.2';
import { canvasData, checkQuizExists, ignoreData } from './quiz-data.js?v=2.2';
import { recursiveDecode, formatDisplayString, cleanQuizTitle } from './utils.js?v=2.2';

export const ViewMixin = {
    initClassGrid() {
        if (!this.elements.classGrid) return;
        this.elements.classGrid.innerHTML = "";
        CLASSES.forEach(cls => {
            const btn = document.createElement("button");
            btn.className = "btn-class";
            btn.innerText = cls;

            const colorHex = getClassColor(cls);
            if (colorHex) {
                const overlayColor = hexToRgba(colorHex, 0.2);
                btn.style.background = `linear-gradient(${overlayColor}, ${overlayColor}), var(--card-bg)`;
                btn.style.borderColor = colorHex;
                btn.onmouseenter = () => {
                    btn.style.background = colorHex;
                    btn.style.color = "#ffffff";
                };
                btn.onmouseleave = () => {
                    btn.style.background = `linear-gradient(${overlayColor}, ${overlayColor}), var(--card-bg)`;
                    btn.style.color = "var(--text-dark)";
                };
            }

            btn.onclick = () => {
                console.log(`[DEBUG][Inst ${this.instanceId}] Class selected: ${cls}`);
                this.selectedClass = cls;
                const subjects = getSubjectsForClass(cls);
                if (subjects && subjects.length > 1) {
                    this.showSubjectSelection(cls);
                } else {
                    const singleSub = (subjects && subjects.length === 1) ? subjects[0] : null;
                    this.loadAssignments(cls, singleSub);
                }
            };
            this.elements.classGrid.appendChild(btn);
        });
    },

    showSubjectSelection(classCode) {
        this.selectedClass = classCode;
        this.selectedSubject = null;
        
        const subjects = getSubjectsForClass(classCode);
        if (this.elements.subjectViewTitle) {
            this.elements.subjectViewTitle.innerText = `Select Subject for ${classCode}`;
        }
        
        const grid = this.elements.subjectGrid;
        if (!grid) return;
        grid.innerHTML = "";

        subjects.forEach(subject => {
            const btn = document.createElement("button");
            btn.className = "btn-subject";
            btn.innerText = subject;

            const colorHex = getClassColor(classCode, subject);
            if (colorHex) {
                const overlayColor = hexToRgba(colorHex, 0.2);
                btn.style.background = `linear-gradient(${overlayColor}, ${overlayColor}), var(--card-bg)`;
                btn.style.borderColor = colorHex;
                btn.onmouseenter = () => {
                    btn.style.background = colorHex;
                    btn.style.color = "#ffffff";
                };
                btn.onmouseleave = () => {
                    btn.style.background = `linear-gradient(${overlayColor}, ${overlayColor}), var(--card-bg)`;
                    btn.style.color = "var(--text-dark)";
                };
            }

            btn.onclick = () => {
                console.log(`[DEBUG][Inst ${this.instanceId}] Subject selected: ${subject} for ${classCode}`);
                this.loadAssignments(classCode, subject);
            };
            grid.appendChild(btn);
        });

        this.switchView("view-subject-select");
    },

    createAssignmentButton(title, exists) {
        let card = document.createElement("div");
        card.className = "assignment-card";
        card.dataset.rawTitle = title;

        // Extract Week String (normalize e.g. W05 -> W5, W01 -> W1)
        let weekStr = "Start";
        let wkNumStr = null;
        
        const weekMatch = title.match(/\bW(\d+)([A-Za-z]?)\b/i) || title.match(/_W(\d+)([A-Za-z]?)_/i) || title.match(/W(\d+)([A-Za-z]?)/i);
        if (weekMatch) {
            const wkNum = parseInt(weekMatch[1], 10);
            const suffix = (weekMatch[2] || "").toUpperCase();
            weekStr = `W${wkNum}${suffix}`;
            wkNumStr = String(wkNum);
        }
        
        let displayTitle = cleanQuizTitle(title);
        let formattedTitle = formatDisplayString(displayTitle);

        // Highlight logic for Current and Due weeks
        const weekInfo = getCurrentTeachingWeekInfo();
        const currentWkNum = weekInfo.weekNum;
        const dueWkNum = currentWkNum - 1;
        
        let statusLbl = null;

        if (wkNumStr) {
            const wk = parseInt(wkNumStr, 10);
            if (wk === currentWkNum) {
                card.classList.add('highlight-current');
                statusLbl = document.createElement("div");
                statusLbl.className = "assignment-status-lbl current-status";
                statusLbl.innerText = "This weeks HW";
            } else if (wk === dueWkNum) {
                card.classList.add('highlight-due');
                statusLbl = document.createElement("div");
                statusLbl.className = "assignment-status-lbl due-status";
                statusLbl.innerText = "HW due this Monday 8:30am";
            }
        }
        
        let rearrangeCtrl = document.createElement("div");
        rearrangeCtrl.className = "rearrange-controls";
        
        let handleBtn = document.createElement("span");
        handleBtn.innerText = "☰";
        handleBtn.style.color = "var(--primary)";
        handleBtn.style.fontWeight = "bold";
        handleBtn.style.marginRight = "6px";
        
        let btnUp = document.createElement("button"); 
        btnUp.className = "btn-up"; btnUp.innerText = "▲";
        let btnDown = document.createElement("button"); 
        btnDown.className = "btn-down"; btnDown.innerText = "▼";
        
        btnUp.onclick = (e) => {
            e.stopPropagation();
            if (card.previousElementSibling && !card.previousElementSibling.classList.contains('btn-show-previous')) {
                card.parentNode.insertBefore(card, card.previousElementSibling);
                this.saveCurrentOrder();
            }
        };
        btnDown.onclick = (e) => {
            e.stopPropagation();
            if (card.nextElementSibling) {
                card.parentNode.insertBefore(card.nextElementSibling, card);
                this.saveCurrentOrder();
            }
        };
        
        rearrangeCtrl.appendChild(handleBtn);
        rearrangeCtrl.appendChild(btnUp);
        rearrangeCtrl.appendChild(btnDown);

        let titleLbl = document.createElement("div");
        titleLbl.className = "assignment-title-lbl";
        
        let actionBtn = document.createElement("button");
        actionBtn.className = "btn-week-action";
        
        if (!exists) {
            titleLbl.innerHTML = `${formattedTitle} (File Missing)`;
            titleLbl.classList.add('missing-text');
            card.classList.add('missing-card');
            actionBtn.innerText = weekStr;
            actionBtn.disabled = true;
        } else {
            titleLbl.innerHTML = formattedTitle;
            actionBtn.innerText = weekStr;
            
            card.onclick = (e) => {
                if(e.target !== actionBtn && !rearrangeCtrl.contains(e.target) && !document.body.classList.contains('rearrange-active')) {
                    this.startQuiz(title);
                }
            };
            actionBtn.onclick = () => {
                if(!document.body.classList.contains('rearrange-active')) {
                    this.startQuiz(title);
                }
            };
        }
        
        card.appendChild(rearrangeCtrl);
        card.appendChild(titleLbl);
        if (statusLbl) {
            card.appendChild(statusLbl);
        }
        card.appendChild(actionBtn);
        
        return card;
    },

    saveCurrentOrder() {
        const list = this.elements.assignmentList;
        if (!list) return;
        const cards = list.querySelectorAll('.assignment-card');
        const newOrder = [];
        cards.forEach(c => {
            if (c.dataset.rawTitle) {
                newOrder.push(c.dataset.rawTitle);
            }
        });
        
        const orderKey = this.selectedSubject ? `${this.selectedClass}__${this.selectedSubject}` : this.selectedClass;

        if (!window.appConfig) window.appConfig = {};
        if (!window.appConfig.order) window.appConfig.order = {};
        window.appConfig.order[orderKey] = newOrder;
        
        if (window.isOfflineMode) {
            fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: window.appConfig.order })
            });
        }
    },

    async renderPreviousAssignments(titles, buttonToRemove) {
        const list = this.elements.assignmentList;
        if (!list) return;

        const existenceChecks = titles.map(async (title) => {
            const exists = await checkQuizExists(title);
            return { title, exists };
        });

        const results = await Promise.all(existenceChecks);
        results.sort((a, b) => this.customWeekSort(a.title, b.title));

        const fragment = document.createDocumentFragment();
        results.forEach(result => {
            let card = this.createAssignmentButton(result.title, result.exists);
            fragment.appendChild(card);
        });
        
        list.insertBefore(fragment, buttonToRemove);
        buttonToRemove.remove();
    },

    customWeekSort(titleA, titleB) {
        const getWeek = (str) => {
            const match = str.match(/- W(\d+) -/i) || str.match(/_W(\d+)_/i) || str.match(/W(\d+)/i);
            return match ? parseInt(match[1], 10) : 0;
        };
        const weekA = getWeek(titleA);
        const weekB = getWeek(titleB);
        
        if (weekA !== weekB) {
            return weekA - weekB; 
        }
        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    },

    async loadAssignments(classCode, subject = null) {
        this.isBonus = false; 
        this.selectedClass = classCode;
        this.selectedSubject = subject;

        const subjectLabel = subject ? ` - ${subject}` : '';
        if (this.elements.assignmentsTitle) {
            this.elements.assignmentsTitle.innerText = `Assignments for ${classCode}${subjectLabel}`;
        }
        
        const weekInfo = getCurrentTeachingWeekInfo();
        if (this.elements.currentWeekLbl) {
            this.elements.currentWeekLbl.innerText = `Current Teaching Week: W${weekInfo.weekNum} (${weekInfo.dateString})`;
        }
        
        const list = this.elements.assignmentList;
        if (!list) return;
        list.innerHTML = "Loading...";
        
        // Apply 20% opacity color shade overlay to the assignments view
        const colorHex = getClassColor(classCode, subject);
        if (this.views.assignments) {
            if (colorHex) {
                const overlayColor = hexToRgba(colorHex, 0.2);
                this.views.assignments.style.background = `linear-gradient(${overlayColor}, ${overlayColor}), var(--bg-quiz)`;
            } else {
                this.views.assignments.style.background = "";
            }
        }

        this.switchView("view-assignments");

        let grade = classCode[1];
        let assignmentsDict = {};

        if (canvasData && canvasData[grade]) {
            let gradeData = canvasData[grade];

            // 1. Check grade-level direct assignments
            Object.keys(gradeData).forEach(title => {
                if (typeof gradeData[title] !== 'object' && gradeData[title] !== null) {
                    assignmentsDict[title] = gradeData[title];
                }
            });

            // 2. Check class-level direct assignments
            if (gradeData[classCode] && typeof gradeData[classCode] === 'object') {
                Object.keys(gradeData[classCode]).forEach(title => {
                    if (typeof gradeData[classCode][title] !== 'object' && gradeData[classCode][title] !== null) {
                        assignmentsDict[title] = gradeData[classCode][title];
                    }
                });
            }

            // 3. Check subject-level structures
            if (subject) {
                // canvas[grade][subject]
                if (gradeData[subject] && typeof gradeData[subject] === 'object') {
                    Object.keys(gradeData[subject]).forEach(title => {
                        if (typeof gradeData[subject][title] !== 'object' && gradeData[subject][title] !== null) {
                            assignmentsDict[title] = gradeData[subject][title];
                        }
                    });
                    // canvas[grade][subject][classCode]
                    if (gradeData[subject][classCode] && typeof gradeData[subject][classCode] === 'object') {
                        Object.keys(gradeData[subject][classCode]).forEach(title => {
                            if (typeof gradeData[subject][classCode][title] !== 'object' && gradeData[subject][classCode][title] !== null) {
                                assignmentsDict[title] = gradeData[subject][classCode][title];
                            }
                        });
                    }
                }

                // canvas[grade][classCode][subject]
                if (gradeData[classCode] && typeof gradeData[classCode] === 'object' && gradeData[classCode][subject] && typeof gradeData[classCode][subject] === 'object') {
                    Object.keys(gradeData[classCode][subject]).forEach(title => {
                        if (typeof gradeData[classCode][subject][title] !== 'object' && gradeData[classCode][subject][title] !== null) {
                            assignmentsDict[title] = gradeData[classCode][subject][title];
                        }
                    });
                }
            }
        }

        // Filter out hidden/ignored quizzes without wiping their assignments in canvas.json
        const ignoredList = (window.appConfig && Array.isArray(window.appConfig.ignore)) 
            ? window.appConfig.ignore 
            : (Array.isArray(ignoreData) ? ignoreData : []);
            
        let validTitles = Object.keys(assignmentsDict).filter(t => !ignoredList.includes(t));
        
        validTitles.sort((a, b) => this.customWeekSort(a, b));

        // Inject order.json configuration maps to override standard week alignments
        const orderKey = subject ? `${classCode}__${subject}` : classCode;
        if (window.appConfig && window.appConfig.order) {
            const customList = window.appConfig.order[orderKey] || window.appConfig.order[classCode];
            if (Array.isArray(customList)) {
                const existingCustom = customList.filter(t => validTitles.includes(t));
                const remaining = validTitles.filter(t => !existingCustom.includes(t));
                validTitles = [...existingCustom, ...remaining];
            }
        }

        list.innerHTML = "";

        if (validTitles.length === 0) {
            list.innerHTML = `<p style='color:var(--text-muted); font-style:italic; padding: 20px; text-align:center;'>No assignments found for ${classCode}${subjectLabel}.</p>`;
            return;
        }

        const existenceChecks = validTitles.map(async (title) => {
            const exists = await checkQuizExists(title);
            return { title, exists };
        });

        const results = await Promise.all(existenceChecks);

        results.forEach(result => {
            let card = this.createAssignmentButton(result.title, result.exists);
            list.appendChild(card);
        });
    },

    async loadBonusQuizzes() {
        this.selectedClass = "Bonus";
        this.selectedSubject = null;
        this.isBonus = true;
        
        if (this.views.assignments) {
            this.views.assignments.style.background = "";
        }

        if (this.elements.assignmentsTitle) this.elements.assignmentsTitle.innerText = `Bonus Quizzes`;
        if (this.elements.currentWeekLbl) this.elements.currentWeekLbl.innerText = `Special Bonus Quizzes!`;
        
        const list = this.elements.assignmentList;
        if (!list) return;
        list.innerHTML = "Loading bonus quizzes...";
        
        this.switchView("view-assignments");

        try {
            const res = await fetch('0_Quiz/bonus/bonus_list.json');
            if (!res.ok) throw new Error("File missing");
            const bonusList = await res.json();
            
            list.innerHTML = "";
            if (bonusList.length === 0) {
                list.innerHTML = "<p style='color:#666; font-style:italic;'>No bonus quizzes found.</p>";
                return;
            }

            bonusList.forEach(title => {
                let card = document.createElement("div");
                card.className = "assignment-card highlight-current"; 
                
                let titleLbl = document.createElement("div");
                titleLbl.className = "assignment-title-lbl";
                titleLbl.innerHTML = formatDisplayString(cleanQuizTitle(title));
                
                let actionBtn = document.createElement("button");
                actionBtn.className = "btn-week-action";
                actionBtn.innerText = "Start";
                
                card.onclick = (e) => {
                    if(e.target !== actionBtn) {
                        this.startQuiz(title, true);
                    }
                };
                actionBtn.onclick = () => {
                    this.startQuiz(title, true);
                };
                
                card.appendChild(titleLbl);
                card.appendChild(actionBtn);
                list.appendChild(card);
            });

        } catch (e) {
            console.error(e);
            list.innerHTML = `<p style='color:#e74c3c; font-weight:bold; padding: 20px;'>Failed to load bonus quizzes.</p>`;
        }
    },

    async loadResources() {
        this.documentBackTarget = 'view-class-select';
        
        if (this.elements.documentTitle) this.elements.documentTitle.innerHTML = "Class Resources";
        if (this.elements.documentContent) this.elements.documentContent.innerHTML = "Loading...";
        
        this.switchView("view-document");

        try {
            const res = await fetch(`0_Quiz/media/Resources.json`);
            if (!res.ok) throw new Error(`File missing or server error (${res.status})`);
            
            const rawDataRaw = await res.json();
            const rawData = recursiveDecode(rawDataRaw);
            
            if (rawData.metadata && rawData.metadata.type === 'document') {
                this.renderDocument("Class Resources", rawData);
            } else {
                throw new Error("Resources file is not a valid document format.");
            }
        } catch (e) {
            if (this.elements.documentContent) {
                this.elements.documentContent.innerHTML = `<p style="color:red; font-weight:bold; padding:20px; text-align:center;">Failed to load resources: ${e.message}</p>`;
            }
        }
    },

    renderDocument(docName, rawData) {
        if (this.elements.documentTitle) this.elements.documentTitle.innerHTML = formatDisplayString(cleanQuizTitle(docName));
        
        const container = this.elements.documentContent;
        if (container) {
            container.innerHTML = "";
            const iframe = document.createElement('iframe');
            iframe.className = "document-iframe";
            
            iframe.sandbox = "allow-same-origin allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox";
            
            let htmlContent = rawData.data || "<p style='padding:20px; text-align:center;'>No document content available.</p>";
            
            htmlContent = htmlContent.replace(/color:\s*#e0e0e0;?/gi, '');
            htmlContent = htmlContent.replace(/color:\s*#ffffff;?/gi, '');

            if (htmlContent.toLowerCase().includes('<head>')) {
                htmlContent = htmlContent.replace(/<head>/i, '<head><base href="0_Quiz/">');
            } else {
                htmlContent = `<head><base href="0_Quiz/"></head>` + htmlContent;
            }

            const dynamicIframeStyle = `
                <style>
                    body.dark-theme { background-color: #1a1a1a !important; color: #f5f8fa !important; }
                    body.dark-theme a { color: #30a2ff !important; }
                    body.dark-theme table, body.dark-theme tr, body.dark-theme td, body.dark-theme th { border-color: #38454f !important; color: #f5f8fa !important; }
                </style>
            `;
            htmlContent = dynamicIframeStyle + htmlContent;

            iframe.srcdoc = htmlContent;
            
            iframe.onload = () => {
                try {
                    const doc = iframe.contentDocument;
                    if (!doc) return;
                    if (document.body.classList.contains('dark-theme') && doc.body) {
                        doc.body.classList.add('dark-theme');
                    }

                    // Direct DOM-based link processing that never truncates on apostrophes or special characters
                    doc.querySelectorAll('a').forEach(a => {
                        const rawHref = a.getAttribute('href');
                        if (!rawHref) return;

                        const isExternal = /^https?:\/\//i.test(rawHref) || /^mailto:/i.test(rawHref);
                        if (isExternal) {
                            a.target = "_blank";
                            a.rel = "noopener noreferrer";
                            return;
                        }

                        const isHtml = /\.html?\b/i.test(rawHref);
                        if (isHtml) {
                            a.target = "_blank";
                            return;
                        }

                        // Determine the full filename and extension safely
                        let cleanPath = rawHref.replace(/\\/g, '/');
                        let rawFilename = cleanPath.split('/').pop() || "document.pdf";
                        try { rawFilename = decodeURIComponent(rawFilename); } catch(_) {}

                        let filename = rawFilename;
                        if (cleanPath.toLowerCase().endsWith('.pdf') && !filename.toLowerCase().endsWith('.pdf')) {
                            filename += '.pdf';
                        } else if (!filename.includes('.')) {
                            filename += '.pdf';
                        }

                        // Set the download attribute on the anchor tag itself in DOM
                        a.setAttribute('download', filename);

                        // Attach a top-window blob download handler that guarantees .pdf extension preservation
                        a.addEventListener('click', async (e) => {
                            e.preventDefault();
                            let targetUrl = cleanPath.startsWith('0_Quiz/') ? cleanPath : `0_Quiz/${cleanPath}`;

                            try {
                                const response = await fetch(encodeURI(targetUrl));
                                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                                const blob = await response.blob();
                                const blobUrl = URL.createObjectURL(blob);
                                const downloadLink = document.createElement('a');
                                downloadLink.href = blobUrl;
                                downloadLink.download = filename;
                                document.body.appendChild(downloadLink);
                                downloadLink.click();
                                document.body.removeChild(downloadLink);
                                setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
                            } catch (err) {
                                console.warn("[DEBUG] Blob download failed, falling back to window.open", err);
                                window.open(encodeURI(targetUrl), '_blank');
                            }
                        });
                    });
                } catch(e) {
                    console.error("[DEBUG] Error configuring iframe links:", e);
                }
            };
            
            container.appendChild(iframe);
        }
        
        this.switchView("view-document");
    },

    showResultsPage() {
        this.switchView("view-results");
        const container = this.elements.resultsList;
        if (!container) return;
        container.innerHTML = "";
        let raw = JSON.parse(localStorage.getItem('quiz_results') || '{}');
        let resultsFlat = [];
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
            card.innerHTML = `<div><p class="res-title">${res.name} (${res.cls})</p><p class="res-detail">${formatDisplayString(cleanQuizTitle(res.assignment))}</p></div><div><p class="res-score">${res.best}/${res.total}</p></div>`;
            container.appendChild(card);
        });
    }
};