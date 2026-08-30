// config.js

export const CLASSES = ["G6A", "G6B", "G6C", "G7A", "G7B", "G7C", "G8A", "G8B", "G8C"];

export const CLASS_COLORS = {
    "G6A": "#A569BD", "G6B": "#8B4513", "G6C": "#8B1389",
    "6A": "#A569BD", "6B": "#8B4513", "6C": "#8B1389",
    
    // Grade 7 Computer Science
    "G7A-CS": "#3498DB", "G7B-CS": "#2980B9", "G7C-CS": "#1F618D",
    "7A-CS": "#3498DB", "7B-CS": "#2980B9", "7C-CS": "#1F618D",
    
    // Grade 7 STEAM
    "G7A-STEAM": "#E67E22", "G7B-STEAM": "#D35400", "G7C-STEAM": "#A04000",
    "7A-STEAM": "#E67E22", "7B-STEAM": "#D35400", "7C-STEAM": "#A04000",
    
    // Fallbacks for generic G7
    "G7A": "#3498DB", "G7B": "#2980B9", "G7C": "#1F618D",
    "7A": "#3498DB", "7B": "#2980B9", "7C": "#1F618D",
    
    // Grade 8
    "G8A": "#1ABC9C", "G8B": "#FFB6C1", "G8C": "#D4AC0D",
    "8A": "#1ABC9C", "8B": "#FFB6C1", "8C": "#D4AC0D"
};

export function getClassColor(classCode, subject = null) {
    if (!classCode) return null;
    if (subject) {
        let subKey = subject;
        if (/computer\s*science|cs/i.test(subject)) subKey = "CS";
        else if (/steam/i.test(subject)) subKey = "STEAM";
        const combinedKey = `${classCode}-${subKey}`;
        if (CLASS_COLORS[combinedKey]) return CLASS_COLORS[combinedKey];
    }
    return CLASS_COLORS[classCode] || null;
}

export function hexToRgba(hex, alpha = 0.2) {
    if (!hex) return `rgba(0, 142, 226, ${alpha})`;
    let c = hex.replace('#', '');
    if (c.length === 3) {
        c = c.split('').map(x => x + x).join('');
    }
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export let appSettings = {
    anchor_date: "2026-06-15", // Format YYYY-MM-DD
    anchor_week: 37,
    manual_week_override: null, // Set to a number to manually lock the week (e.g. 38)
    manual_date_string: null,    // Set to manually lock the date string (e.g. "22/06/2026 - 26/06/2026")
    show_bonus: true,          // Toggle Bonus display directly via JSON
    show_results: false,        // Toggle Results display directly via JSON
    subjects: {
        "6": [],
        "7": ["Computer Science (CS)", "STEAM"],
        "8": []
    }
};

export function updateAppSettings(newSettings) {
    if (newSettings && typeof newSettings === 'object') {
        appSettings = { 
            ...appSettings, 
            ...newSettings,
            subjects: {
                "6": (newSettings.subjects && Array.isArray(newSettings.subjects["6"])) ? newSettings.subjects["6"] : (appSettings.subjects?.["6"] || []),
                "7": (newSettings.subjects && Array.isArray(newSettings.subjects["7"])) ? newSettings.subjects["7"] : (appSettings.subjects?.["7"] || ["Computer Science (CS)", "STEAM"]),
                "8": (newSettings.subjects && Array.isArray(newSettings.subjects["8"])) ? newSettings.subjects["8"] : (appSettings.subjects?.["8"] || [])
            }
        };
    }
}

export function getSubjectsForGrade(grade) {
    if (!appSettings.subjects) return [];
    return appSettings.subjects[String(grade)] || [];
}

export function getSubjectsForClass(classCode) {
    if (!classCode || classCode.length < 2) return [];
    const grade = classCode[1];
    return getSubjectsForGrade(grade);
}

export async function loadSettings() {
    try {
        console.log("[DEBUG] Fetching settings.json...");
        const res = await fetch('0_Quiz/settings.json');
        if (res.ok) {
            const customSettings = await res.json();
            updateAppSettings(customSettings);
            console.log("[DEBUG] Loaded custom settings:", appSettings);
        }
    } catch (e) {
        console.log("[DEBUG] No custom settings.json found or failed to load. Using defaults.");
    }
}

export function getCurrentMondayDateStr() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const day = now.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now.getTime() + (diffToMonday * 24 * 60 * 60 * 1000));
    
    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function getCurrentTeachingWeekInfo(overrideSettings) {
    const settings = overrideSettings || appSettings;

    // If a manual override is set in settings.json, use it immediately
    if (settings.manual_week_override !== null && settings.manual_week_override !== undefined) {
        return {
            weekNum: settings.manual_week_override,
            dateString: settings.manual_date_string || "Manual Override Active"
        };
    }

    // Otherwise, parse the anchor date dynamically
    const parts = (settings.anchor_date || "2026-06-15").split('-');
    const anchorDate = new Date(parts[0], parts[1] - 1, parts[2]); // Month is 0-indexed
    const anchorWeek = settings.anchor_week !== undefined ? settings.anchor_week : 1;
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Normalize to midnight to avoid timezone shift errors
    
    const diffMs = now.getTime() - anchorDate.getTime();
    const weeksDiff = Math.floor(diffMs / msPerWeek);
    
    const currentWeekNum = anchorWeek + weeksDiff;
    
    // Calculate Monday and Friday of this teaching week
    const startDate = new Date(anchorDate.getTime() + (weeksDiff * msPerWeek));
    const endDate = new Date(startDate.getTime() + (4 * 24 * 60 * 60 * 1000)); // +4 days = Friday
    
    const formatDate = (dateObj) => {
        const d = String(dateObj.getDate()).padStart(2, '0');
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const y = dateObj.getFullYear();
        return `${d}/${m}/${y}`;
    };

    return {
        weekNum: currentWeekNum,
        dateString: `${formatDate(startDate)} - ${formatDate(endDate)}`
    };
}