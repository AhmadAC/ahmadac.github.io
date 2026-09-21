// utils.js

import { appSettings } from './config.js?v=2.2';

export function safeJsonParse(text) {
    if (!text || typeof text !== 'string') return null;
    let clean = text.trim();
    if (!clean) return null;

    // 1. Fast path: Standard native parse
    try {
        return JSON.parse(clean);
    } catch (e) {
        // Fall through to sanitize invalid control characters and backslashes
    }

    // 2. Character-by-character scanner to escape control characters & fix invalid escape sequences inside strings
    try {
        let inString = false;
        let escaped = false;
        let result = '';

        for (let i = 0; i < clean.length; i++) {
            let ch = clean[i];

            if (escaped) {
                if (inString) {
                    if (!/["\\/bfnrtu]/.test(ch)) {
                        result += '\\\\' + ch;
                    } else {
                        result += '\\' + ch;
                    }
                } else {
                    result += '\\' + ch;
                }
                escaped = false;
                continue;
            }

            if (ch === '\\') {
                escaped = true;
                continue;
            }

            if (ch === '"') {
                inString = !inString;
                result += ch;
                continue;
            }

            if (inString) {
                if (ch === '\n') {
                    result += '\\n';
                } else if (ch === '\r') {
                    result += '\\r';
                } else if (ch === '\t') {
                    result += '\\t';
                } else if (ch.charCodeAt(0) < 0x20) {
                    result += '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
                } else {
                    result += ch;
                }
            } else {
                result += ch;
            }
        }

        if (escaped) {
            result += '\\\\';
        }

        result = result.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(result);
    } catch (err) {
        console.error("safeJsonParse error:", err);
        throw err;
    }
}

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

// Strips class, subject, and week code prefixes/suffixes for clean user display
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

// Safely replaces underscores with spaces AND formats fractions with stacked HTML layouts, ignoring HTML tags
export function formatDisplayString(str) {
    if (typeof str !== 'string') return str;
    
    try {
        let formatted = str.replace(/(<[^>]+>)|_/g, (match, p1) => p1 ? p1 : ' ');
        const fractionRegex = /(<[^>]+>)|(?:(?:\(([^)<>]+)\)|([-a-zA-Z0-9.]+))\/(?:\(([^)<>]+)\)|([-a-zA-Z0-9.]+)))/g;
        
        formatted = formatted.replace(fractionRegex, (match, tag, numP, numNP, denP, denNP) => {
            if (tag) return tag;
            
            const num = String(numP !== undefined ? numP : (numNP !== undefined ? numNP : ""));
            const den = String(denP !== undefined ? denP : (denNP !== undefined ? denNP : ""));
            
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
    const showBonus = appSettings.show_bonus === true || appSettings.show_bonus === 'true' || appSettings.show_bonus === 1 || appSettings.show_bonus === '1';
    
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

    const showResults = appSettings.show_results === true || appSettings.show_results === 'true' || appSettings.show_results === 1 || appSettings.show_results === '1';
    
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

    const textBytes = new TextEncoder().encode(text);
    const bits = [];
    const pushBits = (val, len) => {
        for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    pushBits(4, 4);
    pushBits(textBytes.length, 8);
    textBytes.forEach(b => pushBits(b, 8));

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

    for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
            const nr = 18 + r, nc = 18 + c;
            reserved[nr][nc] = true;
            matrix[nr][nc] = (Math.max(Math.abs(r), Math.abs(c)) !== 1) ? 1 : 0;
        }
    }

    for (let i = 8; i <= 16; i++) {
        if (!reserved[6][i]) { reserved[6][i] = true; matrix[6][i] = (i % 2 === 0) ? 1 : 0; }
        if (!reserved[i][6]) { reserved[i][6] = true; matrix[i][6] = (i % 2 === 0) ? 1 : 0; }
    }

    reserved[17][8] = true;
    matrix[17][8] = 1;

    for (let i = 0; i <= 8; i++) {
        reserved[8][i] = true;
        reserved[i][8] = true;
    }
    for (let i = 17; i < N; i++) {
        reserved[8][i] = true;
        reserved[i][8] = true;
    }

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
                    if ((r + col) % 2 === 0) bit ^= 1;
                    matrix[r][col] = bit;
                }
            }
        }
        upwards = !upwards;
    }

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

export function createSvgChart(cfg) {
    if (!cfg || typeof cfg !== 'object') return "";

    const type = (cfg.type || "bar").toLowerCase();
    const width = cfg.width || 560;
    const height = cfg.height || 320;
    const title = cfg.title || "";
    const xLabel = cfg.xLabel || cfg.x_label || "";
    const yLabel = cfg.yLabel || cfg.y_label || "";

    if (type === 'pie') {
        const items = Array.isArray(cfg.data) ? cfg.data : [];
        const total = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0) || 1;
        const cx = 170, cy = 165, r = 110;
        let startAngle = -Math.PI / 2;

        const defaultColors = ["#2ecc71", "#f39c12", "#3498db", "#e74c3c", "#9b59b6", "#1abc9c"];
        let slicesSvg = "";
        let legendSvg = "";

        items.forEach((item, idx) => {
            const val = Number(item.value) || 0;
            const fraction = val / total;
            const sliceAngle = fraction * 2 * Math.PI;
            const endAngle = startAngle + sliceAngle;
            const color = item.color || defaultColors[idx % defaultColors.length];

            const x1 = cx + r * Math.cos(startAngle);
            const y1 = cy + r * Math.sin(startAngle);
            const x2 = cx + r * Math.cos(endAngle);
            const y2 = cy + r * Math.sin(endAngle);
            const largeArc = fraction > 0.5 ? 1 : 0;

            const pathData = fraction >= 0.9999
                ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
                : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

            slicesSvg += `<path d="${pathData}" fill="${color}" stroke="#ffffff" stroke-width="2" class="chart-slice"/>`;

            const percStr = `${Math.round(fraction * 100)}%`;
            const legY = 70 + idx * 36;
            legendSvg += `
                <g class="chart-legend-item">
                    <rect x="320" y="${legY}" width="16" height="16" rx="3" fill="${color}"/>
                    <text x="345" y="${legY + 13}" font-size="12" font-weight="600" class="chart-text">${item.label || ''} (${val}${cfg.unit ? ' ' + cfg.unit : ''} - ${percStr})</text>
                </g>
            `;

            startAngle = endAngle;
        });

        return `
            <svg class="quiz-svg-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
                <rect width="100%" height="100%" fill="none"/>
                <text x="${width / 2}" y="30" text-anchor="middle" font-size="15" font-weight="bold" class="chart-title">${title}</text>
                ${slicesSvg}
                ${legendSvg}
            </svg>
        `;
    }

    const padLeft = 70;
    const padRight = 30;
    const padTop = 50;
    const padBottom = 55;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    if (type === 'bar') {
        const items = Array.isArray(cfg.data) ? cfg.data : [];
        const maxVal = cfg.max || Math.max(...items.map(d => Number(d.value) || 0), 10);
        const yTicksCount = 5;
        let gridSvg = "";

        for (let i = 0; i <= yTicksCount; i++) {
            const v = Math.round((maxVal / yTicksCount) * i);
            const y = padTop + plotH - (i / yTicksCount) * plotH;
            gridSvg += `
                <line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e0e0e0" stroke-width="1" stroke-dasharray="3,3" class="chart-grid"/>
                <text x="${padLeft - 10}" y="${y + 4}" font-size="11" text-anchor="end" class="chart-tick-label">${v}</text>
            `;
        }

        const barWidth = Math.min(65, (plotW / (items.length || 1)) * 0.65);
        const step = plotW / (items.length || 1);
        let barsSvg = "";

        items.forEach((d, idx) => {
            const val = Number(d.value) || 0;
            const barH = (val / maxVal) * plotH;
            const bx = padLeft + idx * step + (step - barWidth) / 2;
            const by = padTop + plotH - barH;
            const barColor = d.color || "#008ee2";

            barsSvg += `
                <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${barColor}" class="chart-bar"/>
                <text x="${(bx + barWidth / 2).toFixed(1)}" y="${(by - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="bold" class="chart-val-label">${val}</text>
                <text x="${(bx + barWidth / 2).toFixed(1)}" y="${padTop + plotH + 18}" text-anchor="middle" font-size="11" font-weight="600" class="chart-cat-label">${d.label || ''}</text>
            `;
        });

        return `
            <svg class="quiz-svg-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
                <text x="${width / 2}" y="28" text-anchor="middle" font-size="15" font-weight="bold" class="chart-title">${title}</text>
                ${gridSvg}
                <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#333333" stroke-width="2" class="chart-axis"/>
                <line x1="${padLeft}" y1="${padTop + plotH}" x2="${padLeft + plotW}" y2="${padTop + plotH}" stroke="#333333" stroke-width="2" class="chart-axis"/>
                ${barsSvg}
                <text x="${padLeft + plotW / 2}" y="${height - 10}" text-anchor="middle" font-size="12" font-weight="bold" class="chart-axis-label">${xLabel}</text>
                <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="12" font-weight="bold" transform="rotate(-90 18 ${padTop + plotH / 2})" class="chart-axis-label">${yLabel}</text>
            </svg>
        `;
    }

    if (type === 'line' || type === 'scatter') {
        const points = Array.isArray(cfg.data) ? cfg.data : [];
        const xMin = cfg.xMin !== undefined ? cfg.xMin : 0;
        const xMax = cfg.xMax || Math.max(...points.map(p => Number(p.x) || 0), 10);
        const yMin = cfg.yMin !== undefined ? cfg.yMin : 0;
        const yMax = cfg.yMax || Math.max(...points.map(p => Number(p.y) || 0), 10);

        const mapX = (vx) => padLeft + ((vx - xMin) / ((xMax - xMin) || 1)) * plotW;
        const mapY = (vy) => padTop + plotH - ((vy - yMin) / ((yMax - yMin) || 1)) * plotH;

        let gridSvg = "";
        const yTicks = 5;
        for (let i = 0; i <= yTicks; i++) {
            const v = Math.round(yMin + (i / yTicks) * (yMax - yMin));
            const y = padTop + plotH - (i / yTicks) * plotH;
            gridSvg += `
                <line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e0e0e0" stroke-width="1" stroke-dasharray="3,3" class="chart-grid"/>
                <text x="${padLeft - 10}" y="${y + 4}" font-size="11" text-anchor="end" class="chart-tick-label">${v}</text>
            `;
        }

        const xTicks = cfg.xTicks || 5;
        for (let i = 0; i <= xTicks; i++) {
            const v = Math.round(xMin + (i / xTicks) * (xMax - xMin));
            const x = padLeft + (i / xTicks) * plotW;
            gridSvg += `
                <line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotH}" stroke="#f0f0f0" stroke-width="1" class="chart-grid"/>
                <text x="${x}" y="${padTop + plotH + 18}" font-size="11" text-anchor="middle" class="chart-tick-label">${v}</text>
            `;
        }

        let dataSvg = "";
        if (type === 'line') {
            const polyPoints = points.map(p => `${mapX(p.x).toFixed(1)},${mapY(p.y).toFixed(1)}`).join(" ");
            dataSvg += `<polyline fill="none" stroke="${cfg.lineColor || '#008ee2'}" stroke-width="3" points="${polyPoints}" class="chart-line"/>`;
        } else if (type === 'scatter' && cfg.trendLine) {
            const x1 = mapX(xMin), y1 = mapY(cfg.trendLine.y1 || yMin);
            const x2 = mapX(xMax), y2 = mapY(cfg.trendLine.y2 || yMax);
            dataSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e74c3c" stroke-width="2" stroke-dasharray="5,5" class="chart-trendline"/>`;
        }

        points.forEach(p => {
            const cx = mapX(p.x);
            const cy = mapY(p.y);
            const pointColor = p.color || (type === 'scatter' ? '#e67e22' : '#008ee2');
            dataSvg += `
                <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5" fill="${pointColor}" stroke="#ffffff" stroke-width="1.5" class="chart-dot"/>
                <text x="${cx.toFixed(1)}" y="${(cy - 8).toFixed(1)}" font-size="10" font-weight="bold" text-anchor="middle" class="chart-val-label">${p.y}</text>
            `;
        });

        return `
            <svg class="quiz-svg-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
                <text x="${width / 2}" y="28" text-anchor="middle" font-size="15" font-weight="bold" class="chart-title">${title}</text>
                ${gridSvg}
                <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#333333" stroke-width="2" class="chart-axis"/>
                <line x1="${padLeft}" y1="${padTop + plotH}" x2="${padLeft + plotW}" y2="${padTop + plotH}" stroke="#333333" stroke-width="2" class="chart-axis"/>
                ${dataSvg}
                <text x="${padLeft + plotW / 2}" y="${height - 12}" text-anchor="middle" font-size="12" font-weight="bold" class="chart-axis-label">${xLabel}</text>
                <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="12" font-weight="bold" transform="rotate(-90 18 ${padTop + plotH / 2})" class="chart-axis-label">${yLabel}</text>
            </svg>
        `;
    }

    return "";
}

// --- Dynamic Floating Popup for Truncated Sentences (Hover + Touch Tap) ---

export function showFloatingTextPopup(targetEl, text) {
    if (!targetEl || !text || !String(text).trim()) return;
    
    let popup = document.getElementById('global-text-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'global-text-popup';
        popup.className = 'text-popup-bubble';
        document.body.appendChild(popup);
        
        popup.addEventListener('click', (e) => {
            e.stopPropagation();
            hideFloatingTextPopup();
        });
    }

    popup.innerText = String(text).trim();
    popup.style.display = 'block';
    popup.classList.remove('hidden');

    const rect = targetEl.getBoundingClientRect();
    const popupWidth = popup.offsetWidth || 280;
    const popupHeight = popup.offsetHeight || 50;

    let top = rect.top - popupHeight - 10;
    if (top < 15) {
        top = rect.bottom + 10;
    }

    let left = rect.left + (rect.width / 2) - (popupWidth / 2);
    const maxLeft = window.innerWidth - popupWidth - 15;
    if (left < 15) left = 15;
    if (left > maxLeft) left = maxLeft;

    popup.style.top = `${Math.max(12, top)}px`;
    popup.style.left = `${Math.max(12, left)}px`;
}

export function hideFloatingTextPopup() {
    const popup = document.getElementById('global-text-popup');
    if (popup) {
        popup.style.display = 'none';
        popup.classList.add('hidden');
    }
}

// Global listener to dismiss floating popup when tapping or clicking outside
document.addEventListener('click', (e) => {
    const popup = document.getElementById('global-text-popup');
    if (popup && popup.style.display !== 'none') {
        if (!e.target.closest('.text-popup-bubble') && !e.target.closest('.quiz-error-msg') && !e.target.closest('.quiz-title-lbl')) {
            hideFloatingTextPopup();
        }
    }
});

window.addEventListener('scroll', () => hideFloatingTextPopup(), { passive: true });