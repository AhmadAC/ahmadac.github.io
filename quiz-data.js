// quiz-data.js

import { recursiveDecode } from './utils.js';

export let canvasData = {}; 
export let quizIndex = {};

export async function loadCanvasData() {
    try {
        console.log("[DEBUG] Fetching canvas.json...");
        const response = await fetch('0_Quiz/canvas.json');
        if (!response.ok) throw new Error(`Could not find canvas.json (Status: ${response.status})`);
        const rawCanvas = await response.json();
        canvasData = recursiveDecode(rawCanvas);
        console.log("[DEBUG] Successfully loaded canvas.json:", canvasData);
    } catch (e) {
        console.warn("[DEBUG] Using fallback empty canvas.json structure. Error:", e.message);
        canvasData = { "6": {}, "7": {}, "8": {} };
    }
}

export async function loadQuizIndex() {
    try {
        console.log("[DEBUG] Fetching quiz_index.json...");
        const res = await fetch(`0_Quiz/quiz_index.json?t=${Date.now()}`);
        if (res.ok) {
            quizIndex = await res.json();
            console.log("[DEBUG] Loaded quiz index dynamically:", Object.keys(quizIndex).length, "items.");
        }
    } catch (e) {
        console.log("[DEBUG] No quiz_index.json found or failed to load. Defaulting to flat structure.");
    }
}

export async function checkQuizExists(quizName) {
    try {
        // Query the dynamic index or fallback to the exact encoded name
        const relativePath = quizIndex[quizName] || `${encodeURIComponent(quizName)}.json`;
        const cacheBuster = `?t=${Date.now()}`;
        
        // Use encodeURI (not Component) on relative paths so subfolders '/' are maintained correctly
        const res = await fetch(`0_Quiz/${encodeURI(relativePath)}${cacheBuster}`);
        
        if (!res.ok) console.warn(`[DEBUG] checkQuizExists failed for ${quizName}`);
        return res.ok;
    } catch {
        console.warn(`[DEBUG] checkQuizExists network error for ${quizName}`);
        return false;
    }
}

export function normalizeQuizData(raw) {
    let items = [];
    if (Array.isArray(raw)) {
        raw.forEach(item => {
            if (Array.isArray(item)) {
                let obj = {
                    'question_name': item[0],
                    'id': item[1],
                    'type': item[2],
                    'points': item[4],
                    'question text': item[5],
                    'url': item[6],
                    'correct ans index': item[7],
                    'answers': item[8]
                };
                for (let i = 9; i < item.length; i++) {
                    if (item[i] !== undefined && item[i] !== null && String(item[i]).trim() !== "") {
                        obj[String.fromCharCode(97 + i - 9)] = item[i];
                    }
                }
                items.push(obj);
            } else {
                items.push(item);
            }
        });
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

    items.forEach(item => {
        for (let key in item) {
            let val = item[key];
            if (typeof val === 'string' && val.trim().startsWith('[') && val.trim().endsWith(']')) {
                try {
                    let jsonStr = val.replace(/'/g, '"');
                    item[key] = JSON.parse(jsonStr);
                    item[key] = recursiveDecode(item[key]); 
                } catch(e) { }
            }
        }
        
        let shifted = false;
        for (let i = 97; i <= 122; i++) {
            let k = String.fromCharCode(i);
            if (item[k] !== undefined && (Array.isArray(item[k]) || typeof item[k] === 'object')) {
                shifted = true;
                item['answers'] = item[k];
                break;
            }
        }
        if (shifted) {
            let real_options = [];
            for (let i = 97; i <= 122; i++) {
                let k = String.fromCharCode(i);
                if (item[k] !== undefined) {
                    if (!Array.isArray(item[k]) && typeof item[k] !== 'object') {
                        real_options.push(item[k]);
                    }
                    delete item[k];
                }
            }
            real_options.forEach((opt, i) => {
                item[String.fromCharCode(97 + i)] = opt;
            });
        }
    });
    
    const filtered = items.filter(d => 
        d['question text'] || d['question_text'] || 
        d['Question Text'] || d['Question_Text'] ||
        d.question || d.Question
    );
    console.log(`[DEBUG] Normalized quiz data from ${raw ? 'object/array' : 'null'} into ${filtered.length} usable questions.`);
    return filtered;
}