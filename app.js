// app.js

import { loadSettings } from './config.js';
import { initDevTools } from './utils.js';
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
    
    loadSettings().then(() => {
        return loadCanvasData();
    }).then(() => {
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