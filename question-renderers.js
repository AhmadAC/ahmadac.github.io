// question-renderers.js - Renderers for MCQ, Class Select, and Complex Matching

import { CLASSES } from './config.js?v=2.2';
import { formatDisplayString, decodeUtf8B64 } from './utils.js?v=2.2';

export function extractOptionVariations(val, key, qObj) {
    let rawList = [];

    if (Array.isArray(val)) {
        rawList.push(...val);
    } else if (val && typeof val === 'object') {
        if (Array.isArray(val.variations)) {
            rawList.push(...val.variations);
        } else if (val.text) {
            rawList.push(val.text);
            if (Array.isArray(val.synonyms)) rawList.push(...val.synonyms);
        } else {
            rawList.push(...Object.values(val));
        }
    } else if (val !== undefined && val !== null) {
        let strVal = String(val).trim();
        if (strVal !== "") {
            if (strVal.includes("|||")) {
                rawList.push(...strVal.split("|||").map(s => s.trim()).filter(Boolean));
            } else if (strVal.includes(";;;")) {
                rawList.push(...strVal.split(";;;").map(s => s.trim()).filter(Boolean));
            } else {
                rawList.push(strVal);
            }
        }
    }

    if (key && qObj) {
        const suffixes = ['1', '2', '3', '_1', '_2', '_3', '_var1', '_var2', '_var3', '_variation1', '_variation2', '_variation3'];
        suffixes.forEach(suf => {
            const siblingKey = key + suf;
            if (qObj[siblingKey] !== undefined && qObj[siblingKey] !== null && String(qObj[siblingKey]).trim() !== "") {
                rawList.push(String(qObj[siblingKey]).trim());
            }
        });
        const varArrKey = key + '_variations';
        if (Array.isArray(qObj[varArrKey])) {
            rawList.push(...qObj[varArrKey]);
        }
    }

    let cleaned = [];
    rawList.forEach(item => {
        if (item === undefined || item === null) return;
        let s = String(item).trim();
        if (!s) return;
        if (s.startsWith("b64:")) {
            s = decodeUtf8B64(s.substring(4));
        }
        if (s && !cleaned.includes(s)) {
            cleaned.push(s);
        }
    });

    if (cleaned.length > 3) {
        cleaned = cleaned.slice(0, 3);
    }

    return cleaned;
}

export function setupMultipleChoiceUI(container, q, idx) {
    const isVariationOn = q._variationOn ?? (this && this.isVariationOn) ?? false;

    let options = [];
    let correctIdx = q['correct ans index'];
    if (typeof correctIdx === 'string' && !isNaN(parseFloat(correctIdx))) {
        correctIdx = parseInt(parseFloat(correctIdx), 10) - 1;
    } else if (typeof correctIdx === 'number') {
        correctIdx = Math.floor(correctIdx) - 1;
    }

    for (let i = 0; i < 26; i++) {
        let k = String.fromCharCode(97 + i);
        let variations = extractOptionVariations(q[k], k, q);

        if (variations.length > 0) {
            let chosenText = "";
            if (isVariationOn && variations.length > 1) {
                const randIndex = Math.floor(Math.random() * variations.length);
                chosenText = variations[randIndex];
            } else {
                chosenText = variations[0];
            }

            options.push({
                text: formatDisplayString(chosenText),
                is_correct: i === correctIdx
            });
        }
    }

    if (options.length === 0 && Array.isArray(q.answers)) {
        q.answers.forEach((ans, i) => {
            let variations = [];
            let isCorr = false;
            if (typeof ans === 'string' || Array.isArray(ans)) {
                variations = extractOptionVariations(ans, null, null);
                isCorr = (i === correctIdx);
            } else if (ans && typeof ans === 'object') {
                let weight = ans.weight !== undefined ? parseFloat(ans.weight) : 0;
                isCorr = (ans.is_correct === true) || (weight > 0) || (i === correctIdx);
                if (ans.variations) {
                    variations = extractOptionVariations(ans.variations, null, null);
                } else {
                    variations = extractOptionVariations(ans.text || ans.answer_text || "", null, null);
                }
            }

            if (variations.length > 0) {
                let chosenText = (isVariationOn && variations.length > 1)
                    ? variations[Math.floor(Math.random() * variations.length)]
                    : variations[0];

                options.push({
                    text: formatDisplayString(chosenText),
                    is_correct: isCorr
                });
            }
        });
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
            
            if (typeof this.updateProgress === 'function') {
                this.updateProgress();
            }
        };

        q._mcqElements.push(card);
        container.appendChild(card);
    });
}

export function setupClassSelectionUI(container, q, idx) {
    let grid = document.createElement('div');
    grid.className = 'class-btn-group';
    
    // Automatically pre-select class if known from the class selection screen
    const preselectedClass = this?.selectedClass || null;

    CLASSES.forEach(opt => {
        let btn = document.createElement('div');
        btn.className = 'class-btn-radio';
        btn.innerText = opt;

        if (preselectedClass && opt === preselectedClass && !q._userAnswer) {
            btn.classList.add('checked');
            q._userAnswer = opt;
        }

        btn.onclick = () => {
            Array.from(grid.children).forEach(c => c.classList.remove('checked'));
            btn.classList.add('checked');
            q._userAnswer = opt;
            if (typeof this.updateProgress === 'function') {
                this.updateProgress();
            }
        };
        grid.appendChild(btn);
    });
    container.appendChild(grid);
}

export function setupComplexMatchingUI(container, q, idx) {
    const isVariationOn = q._variationOn ?? (this && this.isVariationOn) ?? false;

    let pairs = (q.answers || []).map(p => {
        let rightText = p.answer_text !== undefined ? p.answer_text : p.answer_match_right;
        if (p.variations || p.answer_variations) {
            let rightVars = extractOptionVariations(p.variations || p.answer_variations, null, null);
            if (rightVars.length > 0) {
                rightText = (isVariationOn && rightVars.length > 1)
                    ? rightVars[Math.floor(Math.random() * rightVars.length)]
                    : rightVars[0];
            }
        }
        return {
            ...p,
            text: p.text ? formatDisplayString(String(p.text)) : p.text,
            answer_text: rightText ? formatDisplayString(String(rightText)) : rightText
        };
    });

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
        row.querySelector('.answer-slot').onclick = (e) => {
            if (typeof this.handleSlotClick === 'function') {
                this.handleSlotClick(idx, slotIdx, e.target);
            }
        };
        container.appendChild(row);
    });
}

