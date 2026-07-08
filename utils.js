// utils.js

import { appSettings } from './config.js';

export function decodeUtf8B64(b64) {
    try {
        const binString = atob(b64);
        const bytes = new Uint8Array(binString.length);
        for (let i = 0; i < binString.length; i++) {
            bytes[i] = binString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        console.error("Error decoding base64:", e);
        return b64;
    }
}

export function recursiveDecode(data) {
    if (typeof data === 'string') {
        if (data.startsWith("b64:")) {
            return decodeUtf8B64(data.substring(4));
        }
        return data;
    } else if (Array.isArray(data)) {
        return data.map(item => recursiveDecode(item));
    } else if (data !== null && typeof data === 'object') {
        const decodedObj = {};
        for (const key in data) {
            decodedObj[key] = recursiveDecode(data[key]);
        }
        return decodedObj;
    }
    return data;
}

// Safely replaces underscores with spaces while completely ignoring HTML tags
export function formatDisplayString(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/(<[^>]+>)|_/g, (match, p1) => p1 ? p1 : ' ');
}

export function applyFeatureToggles() {
    // Ensures setting visibility applies to both current UI and future instances dynamically generated
    if (appSettings.show_bonus) {
        document.querySelectorAll('.btn-view-bonus').forEach(btn => btn.classList.remove('hidden'));
        const template = document.getElementById("quiz-instance-template");
        if (template) {
            const templateBtn = template.content.querySelector('.btn-view-bonus');
            if (templateBtn) templateBtn.classList.remove('hidden');
        }
    }
    if (appSettings.show_results) {
        document.querySelectorAll('.btn-view-results').forEach(btn => btn.classList.remove('hidden'));
        const template = document.getElementById("quiz-instance-template");
        if (template) {
            const templateBtn = template.content.querySelector('.btn-view-results');
            if (templateBtn) templateBtn.classList.remove('hidden');
        }
    }
}

export function initDevTools() {
    // Secret trigger for dev tools (results)
    Object.defineProperty(window, 'results', {
        get: function() {
            document.querySelectorAll('.btn-view-results').forEach(btn => {
                btn.classList.remove('hidden');
            });
            
            const template = document.getElementById("quiz-instance-template");
            if (template) {
                const templateBtn = template.content.querySelector('.btn-view-results');
                if (templateBtn) templateBtn.classList.remove('hidden');
            }
            
            return "View All Results button is now visible.";
        }
    });

    // Secret trigger for dev tools (Bonus Quizzes)
    Object.defineProperty(window, 'q', {
        get: function() {
            document.querySelectorAll('.btn-view-bonus').forEach(btn => {
                btn.classList.remove('hidden');
            });
            
            const template = document.getElementById("quiz-instance-template");
            if (template) {
                const templateBtn = template.content.querySelector('.btn-view-bonus');
                if (templateBtn) templateBtn.classList.remove('hidden');
            }
            
            return "Bonus button is now visible.";
        }
    });
}

export function triggerConfetti() {
    try { new Audio('sounds/pop.mp3').play().catch(()=>{}); } catch (e) {}
    if (typeof window.confetti !== 'undefined') {
        let end = Date.now() + 3000;
        (function frame() {
            window.confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 } });
            window.confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 } });
            if (Date.now() < end) requestAnimationFrame(frame);
        }());
    }
}