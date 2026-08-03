// matching-bank-handler.js - Handles matching word bank click, placement, and scrolling logic

export function handleScrollStickyBank() {
    const area = this.elements.scrollArea;
    const bank = this.elements.stickyBank;
    const mainContent = this.root.querySelector('.quiz-main-content');
    if (!area || !bank || !mainContent) return;
    
    if (this._stickyBankTimer) {
        clearTimeout(this._stickyBankTimer);
    }

    this._stickyBankTimer = setTimeout(() => {
        const mainRect = mainContent.getBoundingClientRect();
        let bestIdx = null;
        let maxVisibleHeight = 0;

        for (const idx in this.matchingStates) {
            let el = this.root.querySelector(`[data-question-index="${idx}"]`);
            if (!el) continue;
            let rect = el.getBoundingClientRect();

            const overlapTop = Math.max(rect.top, mainRect.top);
            const overlapBottom = Math.min(rect.bottom, mainRect.bottom);
            const visibleHeight = overlapBottom - overlapTop;

            if (visibleHeight > 50) { 
                if (visibleHeight > maxVisibleHeight) {
                    maxVisibleHeight = visibleHeight;
                    bestIdx = idx;
                }
            }
        }

        const foundVisible = (bestIdx !== null);
        const wasHidden = bank.classList.contains("hidden");
        const shouldBeHidden = !foundVisible;

        if (foundVisible) {
            if (this.activeMatchingQuestionId !== bestIdx) {
                if (!wasHidden) {
                    const oldHeight = bank.offsetHeight || 0;
                    this.renderStickyBank(bestIdx);
                    const newHeight = bank.offsetHeight || 0;
                    const diff = newHeight - oldHeight;
                    if (diff !== 0) {
                        area.scrollTop = area.scrollTop + diff;
                    }
                } else {
                    this.renderStickyBank(bestIdx);
                }
                this.activeMatchingQuestionId = bestIdx;
            }
        }

        if (wasHidden !== shouldBeHidden) {
            if (shouldBeHidden) {
                const bankHeight = bank.offsetHeight || 0;
                bank.classList.add("hidden");
                if (bankHeight > 0) {
                    area.scrollTop = Math.max(0, area.scrollTop - bankHeight);
                }
                this.activeMatchingQuestionId = null;
            } else {
                bank.classList.remove("hidden");
                const bankHeight = bank.offsetHeight || 0;
                if (bankHeight > 0) {
                    area.scrollTop = area.scrollTop + bankHeight;
                }
            }
        }
    }, 25);
}

export function renderStickyBank(qIdx) {
    this.activeMatchingQuestionId = qIdx;
    const bank = this.elements.stickyBank;
    if (!bank) return;
    
    bank.innerHTML = "";
    let state = this.matchingStates[qIdx];
    state.words.forEach(word => {
        if (!state.allowReuse && state.slots.some(s => s.current === word)) return;

        let btn = document.createElement('button');
        btn.className = 'word-bank-btn';
        if (this.selectedBankWord === word) btn.classList.add('selected');
        btn.innerHTML = word; 

        btn.onclick = () => {
            if (this.selectedSlot) {
                this.fillSlotWithWord(this.selectedSlot.qIdx, this.selectedSlot.slotIdx, word);
            } else {
                this.selectedBankWord = (this.selectedBankWord === word) ? null : word;
                this.renderStickyBank(qIdx);
            }
        };
        bank.appendChild(btn);
    });
}

export function fillSlotWithWord(qIdx, slotIdx, word, providedSlotEl = null) {
    const state = this.matchingStates[qIdx];
    if (!state) return;
    
    if (!state.allowReuse) {
        state.slots.forEach((s, i) => {
            if (s.current === word) {
                s.current = null;
                const otherSlotEl = this.root.querySelector(`[data-question-index="${qIdx}"] [data-slot-index="${i}"]`);
                if (otherSlotEl) {
                    otherSlotEl.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
                    otherSlotEl.className = "answer-slot";
                }
            }
        });
    }

    state.slots[slotIdx].current = word;
    const targetSlotEl = providedSlotEl || this.selectedSlot?.element || this.root.querySelector(`[data-question-index="${qIdx}"] [data-slot-index="${slotIdx}"]`);

    if (targetSlotEl) {
        targetSlotEl.innerHTML = word; 
        targetSlotEl.className = "answer-slot filled";
    }

    this.selectedBankWord = null;
    this.selectedSlot = null;
    this.updateProgress();
    this.renderStickyBank(qIdx);
}

export function handleSlotClick(qIdx, slotIdx, slotEl) {
    const state = this.matchingStates[qIdx];
    if (!state) return;
    const slotData = state.slots[slotIdx];

    if (slotData.current) {
        slotData.current = null;
        slotEl.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
        slotEl.className = "answer-slot";
        this.updateProgress();
        this.renderStickyBank(qIdx);
        return;
    }

    if (this.selectedBankWord) {
        this.fillSlotWithWord(qIdx, slotIdx, this.selectedBankWord, slotEl);
        return;
    }

    this.selectedSlot?.element?.classList.remove('selected');
    if (this.selectedSlot?.element === slotEl) {
        this.selectedSlot = null;
    } else {
        this.selectedSlot = { qIdx, slotIdx, element: slotEl };
        slotEl.classList.add('selected');
    }
}