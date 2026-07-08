// view-mixin.js

import { CLASSES, getCurrentTeachingWeekInfo } from './config.js';
import { canvasData, checkQuizExists } from './quiz-data.js';
import { recursiveDecode, formatDisplayString } from './utils.js';

export const ViewMixin = {
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
    },

    createAssignmentButton(title, exists) {
        let card = document.createElement("div");
        card.className = "assignment-card";

        // Extract Week String (W##)
        let displayTitle = title;
        let weekStr = "Start";
        let wkNumStr = null;
        
        const weekMatch = title.match(/\b(W\d+[A-Za-z]?)\b/i);
        if (weekMatch) {
            weekStr = weekMatch[1].toUpperCase();
            wkNumStr = weekMatch[1].replace(/[^0-9]/g, '');
            
            let cleanTitle = title.replace(new RegExp('\\s*-\\s*' + weekMatch[1], 'i'), '');
            if (cleanTitle === title) cleanTitle = title.replace(new RegExp(weekMatch[1] + '\\s*-\\s*', 'i'), '');
            if (cleanTitle === title) cleanTitle = title.replace(new RegExp('\\b' + weekMatch[1] + '\\b', 'i'), '');
            
            displayTitle = cleanTitle.trim();
            if (!displayTitle) {
                displayTitle = title;
            }
        }
        
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
        
        let titleLbl = document.createElement("div");
        titleLbl.className = "assignment-title-lbl";
        
        let actionBtn = document.createElement("button");
        actionBtn.className = "btn-week-action";
        
        if (!exists) {
            titleLbl.innerText = `${formattedTitle} (File Missing)`;
            titleLbl.classList.add('missing-text');
            card.classList.add('missing-card');
            actionBtn.innerText = weekStr;
            actionBtn.disabled = true;
        } else {
            titleLbl.innerText = formattedTitle;
            actionBtn.innerText = weekStr;
            
            card.onclick = (e) => {
                if(e.target !== actionBtn) {
                    console.log(`[DEBUG][Inst ${this.instanceId}] Assignment selected: ${title}`);
                    this.startQuiz(title);
                }
            };
            actionBtn.onclick = () => {
                console.log(`[DEBUG][Inst ${this.instanceId}] Assignment selected: ${title}`);
                this.startQuiz(title);
            };
        }
        
        card.appendChild(titleLbl);
        if (statusLbl) {
            card.appendChild(statusLbl);
        }
        card.appendChild(actionBtn);
        
        return card;
    },

    async renderPreviousAssignments(titles, buttonToRemove) {
        console.log(`[DEBUG][Inst ${this.instanceId}] Rendering previous assignments...`);
        const list = this.elements.assignmentList;
        if (!list) return;

        const existenceChecks = titles.map(async (title) => {
            const exists = await checkQuizExists(title);
            return { title, exists };
        });

        const results = await Promise.all(existenceChecks);

        // Sort previous assignments using custom logic
        results.sort((a, b) => this.customWeekSort(a.title, b.title));

        const fragment = document.createDocumentFragment();
        results.forEach(result => {
            let card = this.createAssignmentButton(result.title, result.exists);
            fragment.appendChild(card);
        });
        
        list.insertBefore(fragment, buttonToRemove);
        buttonToRemove.remove();
        console.log(`[DEBUG][Inst ${this.instanceId}] Rendered ${results.length} previous assignments.`);
    },

    customWeekSort(titleA, titleB) {
        const getWeek = (str) => {
            const match = str.match(/- W(\d+) -/i) || str.match(/W(\d+)/i);
            return match ? parseInt(match[1], 10) : 0;
        };
        const weekA = getWeek(titleA);
        const weekB = getWeek(titleB);
        
        if (weekA !== weekB) {
            return weekA - weekB; // Numerical sort by week
        }
        // Fallback to alphabetical sorting if week is the same or missing
        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    },

    async loadAssignments(classCode) {
        this.isBonus = false; 
        this.selectedClass = classCode;
        if (this.elements.assignmentsTitle) this.elements.assignmentsTitle.innerText = `Assignments for ${classCode}`;
        
        const weekInfo = getCurrentTeachingWeekInfo();
        if (this.elements.currentWeekLbl) {
            this.elements.currentWeekLbl.innerText = `Current Teaching Week: W${weekInfo.weekNum} (${weekInfo.dateString})`;
        }
        
        const list = this.elements.assignmentList;
        if (!list) return;
        list.innerHTML = "Loading...";
        
        this.switchView("view-assignments");

        let grade = classCode[1];
        let assignmentsDict = {};

        if (canvasData[grade]) {
            let gradeData = canvasData[grade];
            
            // 1. Collect flat assignments for the whole grade
            Object.keys(gradeData).forEach(title => {
                if (typeof gradeData[title] !== 'object') {
                    assignmentsDict[title] = gradeData[title];
                }
            });
            
            // 2. Add class-specific assignments
            if (gradeData[classCode] && typeof gradeData[classCode] === 'object') {
                Object.keys(gradeData[classCode]).forEach(title => {
                    assignmentsDict[title] = gradeData[classCode][title];
                });
            }
        }

        let validTitles = Object.keys(assignmentsDict);
        
        // Custom Week-Based Sort
        validTitles.sort((a, b) => this.customWeekSort(a, b));

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
            let card = this.createAssignmentButton(result.title, result.exists);
            list.appendChild(card);
        });
    },

    async loadBonusQuizzes() {
        this.selectedClass = "Bonus";
        this.isBonus = true;
        
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
                titleLbl.innerText = formatDisplayString(title);
                
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
            list.innerHTML = `<p style='color:#e74c3c; font-weight:bold; padding: 20px;'>Failed to load bonus quizzes. Please create a file at <b>0_Quiz/bonus/bonus_list.json</b> containing an array of quiz names, like:<br><br><code>["Bonus_Quiz_1", "Bonus_Quiz_2"]</code></p>`;
        }
    },

    async loadResources() {
        console.log(`[DEBUG][Inst ${this.instanceId}] Fetching Resources...`);
        this.documentBackTarget = 'view-class-select';
        
        if (this.elements.documentTitle) this.elements.documentTitle.innerText = "Class Resources";
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
            console.error(`[DEBUG][Inst ${this.instanceId}] Load Error:`, e);
            if (this.elements.documentContent) {
                this.elements.documentContent.innerHTML = `<p style="color:red; font-weight:bold; padding:20px; text-align:center;">Failed to load resources: ${e.message}</p>`;
            }
        }
    },

    renderDocument(docName, rawData) {
        console.log(`[DEBUG][Inst ${this.instanceId}] Rendering Document View for: ${docName}`);
        if (this.elements.documentTitle) this.elements.documentTitle.innerText = formatDisplayString(docName);
        
        const container = this.elements.documentContent;
        if (container) {
            container.innerHTML = "";
            const iframe = document.createElement('iframe');
            iframe.className = "document-iframe";
            
            iframe.sandbox = "allow-same-origin allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox";
            
            let htmlContent = rawData.data || "<p style='padding:20px; text-align:center;'>No document content available.</p>";
            
            htmlContent = htmlContent.replace(/color:\s*#e0e0e0;?/gi, '');
            htmlContent = htmlContent.replace(/color:\s*#ffffff;?/gi, '');
            
            htmlContent = htmlContent.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
                attrs = attrs.replace(/target=["'][^"']*["']/gi, '');
                let hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
                let isExternal = hrefMatch && hrefMatch[1] && /^https?:\/\//i.test(hrefMatch[1]);
                
                if (!isExternal) {
                    let isHtml = hrefMatch && hrefMatch[1] && /\.html?\b/i.test(hrefMatch[1]);
                    if (isHtml) {
                        attrs += ` target="_blank"`;
                    } else if (!/download/i.test(attrs)) {
                        let filename = "document";
                        if (hrefMatch && hrefMatch[1]) {
                            let cleanUrl = hrefMatch[1].replace(/\\/g, '/');
                            filename = cleanUrl.split('/').pop();
                        }
                        attrs += ` download="${filename}"`;
                    }
                } else {
                    attrs += ` target="_blank"`;
                }
                return `<a ${attrs}>`;
            });

            if (htmlContent.toLowerCase().includes('<head>')) {
                htmlContent = htmlContent.replace(/<head>/i, '<head><base href="0_Quiz/">');
            } else {
                htmlContent = `<head><base href="0_Quiz/"></head>` + htmlContent;
            }

            // Deep Injection: Add flexible classes that change automatically instead of hard-coded colors
            const dynamicIframeStyle = `
                <style>
                    body.dark-theme { background-color: #1a1a1a !important; color: #f5f8fa !important; }
                    body.dark-theme a { color: #30a2ff !important; }
                    body.dark-theme table, body.dark-theme tr, body.dark-theme td, body.dark-theme th { border-color: #38454f !important; color: #f5f8fa !important; }
                </style>
            `;
            htmlContent = dynamicIframeStyle + htmlContent;

            iframe.srcdoc = htmlContent;
            
            // Sync immediately when the iframe loads up in case Dark mode is currently active
            iframe.onload = () => {
                try {
                    if (document.body.classList.contains('dark-theme') && iframe.contentDocument && iframe.contentDocument.body) {
                        iframe.contentDocument.body.classList.add('dark-theme');
                    }
                } catch(e) {}
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
            card.innerHTML = `<div><p class="res-title">${res.name} (${res.cls})</p><p class="res-detail">${formatDisplayString(res.assignment)}</p></div><div><p class="res-score">${res.best}/${res.total}</p></div>`;
            container.appendChild(card);
        });
    }
};