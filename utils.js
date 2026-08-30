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

// Strips class, subject, and week code prefixes/suffixes (e.g., "G7_CS_W05_", "G7 CS W01 ", "W01_") for clean user display
export function cleanQuizTitle(title) {
    if (typeof title !== 'string') return title;
    let clean = title.replace(/^G\d+[_ \-]*(?:[A-Za-z0-9()]+[_ \-]+)?W\d+[A-Za-z]?[_ \-]*/i, '');
    clean = clean.replace(/^W\d+[A-Za-z]?[_ \-]*/i, '');
    clean = clean.replace(/\s*-\s*W\d+[A-Za-z]?\s*$/i, '');
    clean = clean.replace(/[_ \-]+W\d+[A-Za-z]?$/i, '');
    clean = clean.trim();
    if (!clean) return title;
    return clean;
}

// Safely replaces underscores with spaces AND formats fractions (e.g. 2/3, a/b, (bc)/a) with stacked HTML layouts, completely ignoring HTML tags
export function formatDisplayString(str) {
    if (typeof str !== 'string') return str;
    
    try {
        // 1. Replace underscores with spaces, skipping HTML tags
        let formatted = str.replace(/(<[^>]+>)|_/g, (match, p1) => p1 ? p1 : ' ');
        
        // 2. Format fractions (like 2/3, a/b, (bc)/a), skipping HTML tags
        // Matches algebraic fractions and smoothly strips wrapping parentheses if they surround the numerator/denominator
        const fractionRegex = /(<[^>]+>)|(?:(?:\(([^)<>]+)\)|([-a-zA-Z0-9.]+))\/(?:\(([^)<>]+)\)|([-a-zA-Z0-9.]+)))/g;
        
        formatted = formatted.replace(fractionRegex, (match, tag, numP, numNP, denP, denNP) => {
            if (tag) return tag; // Keep HTML tags untouched
            
            // Safely verify existence and cast to string to prevent any unexpected undefined TypeError crashes
            const num = String(numP !== undefined ? numP : (numNP !== undefined ? numNP : ""));
            const den = String(denP !== undefined ? denP : (denNP !== undefined ? denNP : ""));
            
            // Exclude generic English word/word matches like "pressure/Wind"
            // If neither was explicitly wrapped in parentheses, and either side is a multi-letter string containing no digits, skip formatting.
            if (numP === undefined && denP === undefined) {
                const isNumWord = /[a-zA-Z]/.test(num) && num.length >= 2 && !/[0-9]/.test(num);
                const isDenWord = /[a-zA-Z]/.test(den) && den.length >= 2 && !/[0-9]/.test(den);
                if (isNumWord || isDenWord) {
                    return match;
                }
            }
            
            return `<span class="fraction"><span class="numerator">${num}</span><span class="denominator">${den}</span></span>`;
        });
        
        return formatted;
    } catch (e) {
        console.error("formatDisplayString error:", e);
        return str; 
    }
}

export function applyFeatureToggles() {
    // Ensures setting visibility applies to both current UI and future instances dynamically generated
    const showBonus = !!appSettings.show_bonus;
    document.querySelectorAll('.btn-view-bonus').forEach(btn => {
        if (showBonus) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    });
    const template = document.getElementById("quiz-instance-template");
    if (template) {
        const templateBtn = template.content.querySelector('.btn-view-bonus');
        if (templateBtn) {
            if (showBonus) templateBtn.classList.remove('hidden');
            else templateBtn.classList.add('hidden');
        }
    }

    const showResults = !!appSettings.show_results;
    document.querySelectorAll('.btn-view-results').forEach(btn => {
        if (showResults) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    });
    if (template) {
        const templateBtn = template.content.querySelector('.btn-view-results');
        if (templateBtn) {
            if (showResults) templateBtn.classList.remove('hidden');
            else templateBtn.classList.add('hidden');
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

// Generates an offline standalone SVG QR Code for URLs without any external dependencies
export function generateQRCodeSVG(text = "https://ahmadac.github.io", size = 220) {
    const GF256_EXP = new Uint8Array(512);
    const GF256_LOG = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF256_EXP[i] = x;
        GF256_EXP[i + 255] = x;
        GF256_LOG[x] = i;
        x = (x << 1) ^ ((x & 0x80) ? 0x11d : 0);
    }

    const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];

    const rsGenPoly = (degree) => {
        let poly = [1];
        for (let i = 0; i < degree; i++) {
            const next = [1, GF256_EXP[i]];
            const newPoly = new Uint8Array(poly.length + 1);
            for (let j = 0; j < poly.length; j++) {
                newPoly[j] ^= gfMul(poly[j], next[0]);
                newPoly[j + 1] ^= gfMul(poly[j], next[1]);
            }
            poly = Array.from(newPoly);
        }
        return poly;
    };

    const rsCalc = (data, eccLen) => {
        const gen = rsGenPoly(eccLen);
        const msg = new Uint8Array(data.length + eccLen);
        msg.set(data);
        for (let i = 0; i < data.length; i++) {
            const coef = msg[i];
            if (coef !== 0) {
                for (let j = 0; j < gen.length; j++) {
                    msg[i + j] ^= gfMul(gen[j], coef);
                }
            }
        }
        return Array.from(msg.slice(data.length));
    };

    // QR Version 2 (25x25), ECL M (28 data codewords, 16 EC codewords)
    const textBytes = new TextEncoder().encode(text);
    const bits = [];
    const pushBits = (val, len) => {
        for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    pushBits(4, 4); // Byte mode indicator
    pushBits(textBytes.length, 8); // Character count indicator
    textBytes.forEach(b => pushBits(b, 8));

    // Terminator
    const remainingToCapacity = 28 * 8 - bits.length;
    pushBits(0, Math.min(4, remainingToCapacity));
    while (bits.length % 8 !== 0) bits.push(0);

    const padBytes = [0xEC, 0x11];
    let padIdx = 0;
    while (bits.length < 28 * 8) {
        pushBits(padBytes[padIdx % 2], 8);
        padIdx++;
    }

    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
        dataCodewords.push(byte);
    }

    const ecCodewords = rsCalc(dataCodewords, 16);
    const allCodewords = [...dataCodewords, ...ecCodewords];

    const N = 25;
    const matrix = Array.from({ length: N }, () => Array(N).fill(null));
    const reserved = Array.from({ length: N }, () => Array(N).fill(false));

    const setFinder = (r0, c0) => {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const nr = r0 + r, nc = c0 + c;
                if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
                    reserved[nr][nc] = true;
                    if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
                        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
                        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                        matrix[nr][nc] = isBorder || isCenter ? 1 : 0;
                    } else {
                        matrix[nr][nc] = 0;
                    }
                }
            }
        }
    };

    setFinder(0, 0);
    setFinder(0, 18);
    setFinder(18, 0);

    // Alignment pattern at (18, 18)
    for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
            const nr = 18 + r, nc = 18 + c;
            reserved[nr][nc] = true;
            matrix[nr][nc] = (Math.max(Math.abs(r), Math.abs(c)) !== 1) ? 1 : 0;
        }
    }

    // Timing patterns
    for (let i = 8; i <= 16; i++) {
        if (!reserved[6][i]) { reserved[6][i] = true; matrix[6][i] = (i % 2 === 0) ? 1 : 0; }
        if (!reserved[i][6]) { reserved[i][6] = true; matrix[i][6] = (i % 2 === 0) ? 1 : 0; }
    }

    // Dark module
    reserved[17][8] = true;
    matrix[17][8] = 1;

    // Reserve Format info spots
    for (let i = 0; i <= 8; i++) {
        reserved[8][i] = true;
        reserved[i][8] = true;
    }
    for (let i = 17; i < N; i++) {
        reserved[8][i] = true;
        reserved[i][8] = true;
    }

    // Place data bits
    let bitIdx = 0;
    const allBits = [];
    allCodewords.forEach(b => {
        for (let i = 7; i >= 0; i--) allBits.push((b >> i) & 1);
    });

    let upwards = true;
    for (let c = N - 1; c > 0; c -= 2) {
        if (c === 6) c--;
        for (let step = 0; step < N; step++) {
            const r = upwards ? (N - 1 - step) : step;
            for (let dc = 0; dc < 2; dc++) {
                const col = c - dc;
                if (!reserved[r][col]) {
                    let bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
                    // Apply Mask 0: (row + col) % 2 === 0
                    if ((r + col) % 2 === 0) bit ^= 1;
                    matrix[r][col] = bit;
                }
            }
        }
        upwards = !upwards;
    }

    // Format bits for ECL M (00), Mask 0 (000) -> 0x5412 / 101010000010010
    const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
    const fmtCoords1 = [
        [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
    ];
    const fmtCoords2 = [
        [24,8],[23,8],[22,8],[21,8],[20,8],[19,8],[18,8],[17,8],
        [8,17],[8,18],[8,19],[8,20],[8,21],[8,22],[8,23],[8,24]
    ];

    formatBits.forEach((bit, i) => {
        const [r1, c1] = fmtCoords1[i];
        matrix[r1][c1] = bit;
        const [r2, c2] = fmtCoords2[i];
        matrix[r2][c2] = bit;
    });

    const margin = 2;
    const totalDim = N + margin * 2;
    let pathData = "";

    for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
            if (matrix[r][c] === 1) {
                pathData += `M${c + margin},${r + margin}h1v1h-1z `;
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="${size}" height="${size}" shape-rendering="crispEdges">
        <rect width="100%" height="100%" fill="#ffffff" rx="1"/>
        <path d="${pathData}" fill="#000000"/>
    </svg>`;
}