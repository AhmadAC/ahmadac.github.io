// question-renderers.js - Renderers for MCQ, Class Select, and Complex Matching

import { CLASSES } from './config.js';
import { formatDisplayString, decodeUtf8B64 } from './utils.js';

export function setupMultipleChoiceUI(container, q, idx) {
    let options = [];
    let correctIdx = q['correct ans index'];
    if (typeof correctIdx === 'string' && !isNaN(parseFloat(correctIdx))) {
        correctIdx = parseInt(parseFloat(correctIdx), 10) - 1;
    } else if (typeof correctIdx === 'number') {
        correctIdx = Math.floor(correctIdx) - 1;
    }

    // Load from direct properties: a, b, c, d, e, f, ... (1-6 options)
    for (let i = 0; i < 26; i++) {
        let k = String.fromCharCode(97 + i);
        if (q[k] !== undefined && q[k] !== null && String(q[k]).trim() !== "") {
            let optStr = String(q[k]);
            if (optStr.startsWith("b64:")) {
                optStr = decodeUtf8B64(optStr.substring(4));
            }
            options.push({ text: formatDisplayString(optStr), is_correct: i === correctIdx });
        }
    }

    // Fallback: Load from answers array if provided in JSON
    if (options.length === 0 && Array.isArray(q.answers)) {
        q.answers.forEach((ans, i) => {
            let optText = "";
            let isCorr = false;
            if (typeof ans === 'string') {
                optText = ans;
                isCorr = (i === correctIdx);
            } else if (ans && typeof ans === 'object') {
                optText = ans.text || ans.answer_text || "";
                let weight = ans.weight !== undefined ? parseFloat(ans.weight) : 0;
                isCorr = (ans.is_correct === true) || (weight > 0) || (i === correctIdx);
            }
            if (optText.startsWith("b64:")) {
                optText = decodeUtf8B64(optText.substring(4));
            }
            if (optText.trim() !== "") {
                options.push({ text: formatDisplayString(optText), is_correct: isCorr });
            }
        });
    }

    // Randomize option order for fairness while maintaining correct answer tracking
    options.sort(() => Math.random() - 0.5);

    let newCorrectIdx = options.findIndex(o => o.is_correct);
    q._cToken = btoa(newCorrectIdx.toString());
    delete q['correct ans index']; 

    q._mcqElements = [];
    q._selectedMcqIndex = -1;

    // Display options without letters (a, b, c) or numbers (1, 2, 3)
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
}

export function setupClassSelectionUI(container, q, idx) {
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
}

export function setupComplexMatchingUI(container, q, idx) {
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
}