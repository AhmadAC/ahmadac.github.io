// app.js

import { loadSettings } from './config.js';
import { initDevTools, applyFeatureToggles } from './utils.js';
import { loadCanvasData } from './quiz-data.js';
import { QuizInstance } from './QuizInstance.js';

let viewMode = 1;
let quizInstances = [];

// The main initialization function
function initApp() {
    initDevTools();
    console.log("[DEBUG] Initializing App");
    const viewModeBtn = document.getElementById("view-mode-btn");
    if (viewModeBtn) viewModeBtn.addEventListener("click", cycleViewMode);
    
    // Theme toggler switch setup
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    if (themeToggleBtn) {
        // Read stored user layout theme preference or default to light/day theme
        const savedTheme = localStorage.getItem("app-theme");
        if (savedTheme === "dark") {
            document.body.classList.add("dark-theme");
        }
        
        themeToggleBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark-theme");
            const finalTheme = document.body.classList.contains("dark-theme") ? "dark" : "light";
            localStorage.setItem("app-theme", finalTheme);
            
            // Dynamically sync theme to isolated iframes without resetting the app state
            document.querySelectorAll('.document-iframe').forEach(iframe => {
                try {
                    if (iframe.contentDocument && iframe.contentDocument.body) {
                        if (finalTheme === "dark") {
                            iframe.contentDocument.body.classList.add("dark-theme");
                        } else {
                            iframe.contentDocument.body.classList.remove("dark-theme");
                        }
                    }
                } catch (e) {
                    console.warn("[DEBUG] Could not update iframe theme dynamically:", e);
                }
            });
        });
    }

    // --- NEW: OFFLINE DESKTOP SERVER DETECTION ---
    fetch('/api/status')
        .then(res => res.json())
        .then(data => {
            if (data.is_offline_mode) {
                console.log("[DEBUG] Running in Offline Desktop Mode!");
                window.isOfflineMode = true; // Store globally to alter submit behaviors later
                
                // 1. Show an "Admin Manager" button in the corner
                enableAdminUI();
                
                // 2. Alert the teacher if there are new, unmapped files in the folder!
                if (data.unmapped_quizzes && data.unmapped_quizzes.length > 0) {
                    showNewQuizMappingModal(data.unmapped_quizzes);
                }
            }
        })
        .catch(err => {
            console.log("[DEBUG] Running on standard GitHub Pages web mode.");
            window.isOfflineMode = false;
        });
    
    loadSettings().then(() => {
        return loadCanvasData();
    }).then(() => {
        applyFeatureToggles();
        console.log("[DEBUG] Canvas data loaded. Setting initial view mode to 1.");
        setViewMode(1); // Start with 1 screen
    });
}

// Safely handle the ES Module loading race condition
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    // If the DOM is already ready, run immediately!
    initApp(); 
}

function cycleViewMode() {
    viewMode++;
    if (viewMode > 3) {
        viewMode = 1;
    }
    console.log(`[DEBUG] Cycled View Mode to: ${viewMode} screens`);
    setViewMode(viewMode);
}

function setViewMode(numScreens) {
    const masterContainer = document.getElementById("master-container");
    if (!masterContainer) {
        console.error("[DEBUG] master-container not found in DOM!");
        return;
    }
    
    masterContainer.innerHTML = "";
    quizInstances = [];
    console.log(`[DEBUG] Injecting ${numScreens} quiz instance(s) into the DOM`);

    for (let i = 0; i < numScreens; i++) {
        const template = document.getElementById("quiz-instance-template");
        if (!template) {
            console.error("[DEBUG] quiz-instance-template not found in DOM!");
            continue;
        }
        
        const instanceNode = template.content.cloneNode(true);
        masterContainer.appendChild(instanceNode);
        const rootElement = masterContainer.lastElementChild;
        quizInstances.push(new QuizInstance(rootElement));
    }
}

// --- STUBS FOR OFFLINE ADMIN UI ---
// You will build these out later as you design your HTML/CSS modals
function enableAdminUI() {
    console.log("[DEBUG] Admin UI enabled.");
    // Example: document.getElementById('admin-toggle-btn').classList.remove('hidden');
}

function showNewQuizMappingModal(unmappedQuizzes) {
    console.log("[DEBUG] Unmapped quizzes found in 0_Quiz:", unmappedQuizzes);
    // Example: Inject unmappedQuizzes into a modal popup so you can assign classes to them
}