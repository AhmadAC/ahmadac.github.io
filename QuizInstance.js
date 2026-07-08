// QuizInstance.js

import { ViewMixin } from './view-mixin.js';
import { QuizRendererMixin } from './quiz-renderer-mixin.js';
import { SubmissionMixin } from './submission-mixin.js';

export class QuizInstance {
    constructor(rootElement) {
        this.root = rootElement;
        this.instanceId = Date.now() + Math.floor(Math.random() * 1000); 
        console.log(`[DEBUG] Initializing QuizInstance ID: ${this.instanceId}`);
        
        this.selectedClass = null;
        this.currentQuizName = null;
        this.isBonus = false; 
        this.currentQuestions = [];
        this.sidebarButtons = [];
        this.matchingStates = {};
        this.selectedBankWord = null;
        this.selectedSlot = null;
        this.activeMatchingQuestionId = null;
        this.finalStudentName = null;
        this.finalStudentClass = null;
        this.finalScore = 0;
        this.finalTotalPossible = 0;
        this.documentBackTarget = 'view-assignments';

        this.views = {
            classSelect: this.root.querySelector('.view-class-select'),
            assignments: this.root.querySelector('.view-assignments'),
            quiz: this.root.querySelector('.view-quiz'),
            results: this.root.querySelector('.view-results'),
            document: this.root.querySelector('.view-document')
        };
        
        this.elements = {
            classGrid: this.root.querySelector('.class-grid'),
            btnResources: this.root.querySelector('.btn-view-resources'),
            btnBackFromDoc: this.root.querySelector('.btn-back-from-document'),
            assignmentsTitle: this.root.querySelector('.assignments-title'),
            currentWeekLbl: this.root.querySelector('.current-week-lbl'),
            assignmentList: this.root.querySelector('.assignment-list'),
            quizTitle: this.root.querySelector('.quiz-title-lbl'),
            quizProgress: this.root.querySelector('.quiz-progress-lbl'),
            stickyBank: this.root.querySelector('.sticky-word-bank'),
            scrollArea: this.root.querySelector('.quiz-scroll-area'),
            sidebarList: this.root.querySelector('.sidebar-list'),
            quizContent: this.root.querySelector('.quiz-content'),
            resultBox: this.root.querySelector('.quiz-result-box'),
            resultText: this.root.querySelector('.quiz-result-text'),
            errorMsg: this.root.querySelector('.quiz-error-msg'),
            btnSubmit: this.root.querySelector('.btn-submit-quiz'),
            btnRedo: this.root.querySelector('.btn-redo-quiz'),
            btnSavePic: this.root.querySelector('.btn-save-picture'),
            resultsList: this.root.querySelector('.results-list'),
            btnJumpTop: this.root.querySelector('.btn-jump-top'),
            btnJumpBottom: this.root.querySelector('.btn-jump-bottom'),
            documentTitle: this.root.querySelector('.document-title-lbl'),
            documentContent: this.root.querySelector('.document-content')
        };
        
        this.init();
    }

    init() {
        this.initClassGrid();
        this.addEventListeners();
    }

    switchView(viewClass) {
        console.log(`[DEBUG][Inst ${this.instanceId}] Switching view to ${viewClass}`);
        Object.values(this.views).forEach(v => {
            if (v) v.classList.remove('active');
        });
        const targetView = this.root.querySelector(`.${viewClass}`);
        if (targetView) targetView.classList.add('active');
    }

    addEventListeners() {
        this.elements.btnResources?.addEventListener('click', () => this.loadResources());
        this.root.querySelector('.btn-view-results')?.addEventListener('click', () => this.showResultsPage());
        this.root.querySelector('.btn-view-bonus')?.addEventListener('click', () => this.loadBonusQuizzes());
        this.root.querySelector('.btn-back-to-class')?.addEventListener('click', () => this.switchView('view-class-select'));
        this.root.querySelector('.btn-back-to-class-from-results')?.addEventListener('click', () => this.switchView('view-class-select'));
        
        this.elements.btnBackFromDoc?.addEventListener('click', () => {
            if (this.elements.documentContent) this.elements.documentContent.innerHTML = ""; 
            this.switchView(this.documentBackTarget || 'view-assignments');
        });

        this.root.querySelectorAll('.btn-back-to-assignments').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.elements.documentContent) this.elements.documentContent.innerHTML = ""; 
                this.switchView('view-assignments');
            });
        });

        this.elements.btnJumpTop?.addEventListener('click', () => this.elements.scrollArea?.scrollTo({ top: 0, behavior: 'smooth' }));
        this.elements.btnJumpBottom?.addEventListener('click', () => this.elements.scrollArea?.scrollTo({ top: this.elements.scrollArea.scrollHeight, behavior: 'smooth' }));
        this.elements.btnSubmit?.addEventListener('click', () => this.submitQuiz());
        this.elements.btnRedo?.addEventListener('click', () => this.resetQuiz());
        this.elements.btnSavePic?.addEventListener('click', () => this.saveResultAsImage());
        this.elements.scrollArea?.addEventListener('scroll', () => this.handleScrollStickyBank());
    }
}

// Bind externalized module methods securely to our Class prototype
Object.assign(QuizInstance.prototype, ViewMixin, QuizRendererMixin, SubmissionMixin);