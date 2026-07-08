// config.js

export const CLASSES = ["G6A", "G6B", "G6C", "G7A", "G7B", "G7C", "G8A", "G8B", "G8C"];

export let appSettings = {
    anchor_date: "2026-06-15", // Format YYYY-MM-DD
    anchor_week: 37,
    manual_week_override: null, // Set to a number to manually lock the week (e.g. 38)
    manual_date_string: null    // Set to manually lock the date string (e.g. "22/06/2026 - 26/06/2026")
};

export async function loadSettings() {
    try {
        console.log("[DEBUG] Fetching settings.json...");
        const res = await fetch('0_Quiz/settings.json');
        if (res.ok) {
            const customSettings = await res.json();
            appSettings = { ...appSettings, ...customSettings };
            console.log("[DEBUG] Loaded custom settings:", appSettings);
        }
    } catch (e) {
        console.log("[DEBUG] No custom settings.json found or failed to load. Using defaults.");
    }
}

export function getCurrentTeachingWeekInfo() {
    // If a manual override is set in settings.json, use it immediately
    if (appSettings.manual_week_override !== null && appSettings.manual_week_override !== undefined) {
        return {
            weekNum: appSettings.manual_week_override,
            dateString: appSettings.manual_date_string || "Manual Override Active"
        };
    }

    // Otherwise, parse the anchor date dynamically
    const parts = appSettings.anchor_date.split('-');
    const anchorDate = new Date(parts[0], parts[1] - 1, parts[2]); // Month is 0-indexed
    const anchorWeek = appSettings.anchor_week;
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