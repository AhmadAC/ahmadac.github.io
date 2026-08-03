// atom-builder-ui.js - Handles rendering, Multi-Select Bulk Move, Mobile Scaling, and Auto-Checking for Atom Builder questions

export function setupAtomBuilderUI(container, q, idx) {
    const quizInstance = this; // Capture parent class instance for updateProgress()

    q._isCorrect = false;
    q._userAnswer = null;

    let draggedItems = [];
    let selectedItems = [];
    let selectedZone = null;

    const widgetWrapper = document.createElement('div');
    widgetWrapper.className = 'atom-builder-widget-wrapper';

    // Build the structural HTML layout with responsive scaling wrapper
    widgetWrapper.innerHTML = `
        <div class="atom-builder-container">
            <div class="atom-builder-left">
                <div>
                    <h3>Particle Bank</h3>
                    <div class="ab-bank-zone p-bank" data-zone-type="bank"></div>
                </div>
                <div>
                    <h3>Label Bank</h3>
                    <div class="ab-bank-zone l-bank" data-zone-type="bank"></div>
                </div>
            </div>

            <div class="atom-builder-right">
                <div class="ab-live-tracker">
                    <div class="ab-tracker-item">Protons: <span class="ab-badge ab-proton-badge pending">0/3</span></div>
                    <div class="ab-tracker-item">Neutrons: <span class="ab-badge ab-neutron-badge pending">0/4</span></div>
                    <div class="ab-tracker-item">Shell 1: <span class="ab-badge ab-s1-badge pending">0/2 e⁻</span></div>
                    <div class="ab-tracker-item">Shell 2: <span class="ab-badge ab-s2-badge pending">0/1 e⁻</span></div>
                </div>

                <div class="ab-visual-wrapper">
                    <div class="ab-atom-visual">
                        <svg class="ab-svg-bg" width="550" height="380" viewBox="0 0 550 380">
                            <!-- Shell 2 (Outer) -->
                            <circle cx="260" cy="190" r="150" fill="none" stroke="#BDC3C7" stroke-width="2" stroke-dasharray="8,8" />
                            <!-- Shell 1 (Inner) -->
                            <circle cx="260" cy="190" r="85" fill="none" stroke="#BDC3C7" stroke-width="2" stroke-dasharray="8,8" />
                            
                            <!-- Pointer lines for diagram labels -->
                            <line x1="440" y1="58" x2="330" y2="58" stroke="#95A5A6" stroke-width="2" stroke-dasharray="4,4" />
                            <line x1="440" y1="138" x2="320" y2="138" stroke="#95A5A6" stroke-width="2" stroke-dasharray="4,4" />
                        </svg>

                        <div class="ab-static-key">
                            <div class="ab-key-header">
                                <span class="ab-key-title">Interactive Key</span>
                                <span class="ab-badge ab-key-badge pending">0/3</span>
                            </div>
                            <div class="ab-key-row">
                                <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#E74C3C" stroke="#C0392B" stroke-width="2"/><path d="M 7 12 H 17 M 12 7 V 17" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
                                <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-proton"></div>
                            </div>
                            <div class="ab-key-row">
                                <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#95A5A6" stroke="#7F8C8D" stroke-width="2"/></svg>
                                <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-neutron"></div>
                            </div>
                            <div class="ab-key-row">
                                <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#3498DB" stroke="#2980B9" stroke-width="2"/><path d="M 7 12 H 17" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
                                <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-electron"></div>
                            </div>
                        </div>

                        <div class="ab-drop-zone ab-nucleus" data-zone-type="nucleus">
                            <div class="ab-nucleus-slot" data-accept="neutron" style="left:38px; top:38px;"></div>
                            <div class="ab-nucleus-slot" data-accept="proton" style="left:38px; top:14px;"></div>
                            <div class="ab-nucleus-slot" data-accept="neutron" style="left:59px; top:26px;"></div>
                            <div class="ab-nucleus-slot" data-accept="proton" style="left:59px; top:50px;"></div>
                            <div class="ab-nucleus-slot" data-accept="neutron" style="left:38px; top:62px;"></div>
                            <div class="ab-nucleus-slot" data-accept="proton" style="left:17px; top:50px;"></div>
                            <div class="ab-nucleus-slot" data-accept="neutron" style="left:17px; top:26px;"></div>
                        </div>

                        <!-- Shell 1 Slots -->
                        <div class="ab-drop-zone ab-shell-slot ab-shell1" data-zone-type="shell1" style="left:246px; top:91px;"></div>
                        <div class="ab-drop-zone ab-shell-slot ab-shell1" data-zone-type="shell1" style="left:246px; top:261px;"></div>

                        <!-- Shell 2 Slots -->
                        <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:246px; top:26px;"></div>
                        <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:246px; top:326px;"></div>
                        <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:96px; top:176px;"></div>
                        <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:396px; top:176px;"></div>

                        <!-- Drop Zones for Shell Labels -->
                        <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-shell2" style="left:440px; top:42px;"></div>
                        <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-shell1" style="left:440px; top:122px;"></div>
                    </div>
                </div>

                <div class="ab-extra-tasks">
                    <div class="ab-task-box">
                        <div class="ab-task-header">
                            <h4>1. Select Element Symbol</h4>
                            <span class="ab-badge ab-symbol-badge pending">Pending</span>
                        </div>
                        <div class="ab-symbol-options"></div>
                    </div>
                    <div class="ab-task-box">
                        <div class="ab-task-header">
                            <h4>2. Electron Configuration</h4>
                            <span class="ab-badge ab-config-badge pending">Pending</span>
                        </div>
                        <input type="text" class="ab-config-input" placeholder="(2, 8, 1)">
                    </div>
                </div>
            </div>
        </div>
    `;

    container.appendChild(widgetWrapper);

    // Dynamic Mobile Viewport Scaling Logic
    const visualWrapper = widgetWrapper.querySelector('.ab-visual-wrapper');
    const visual = widgetWrapper.querySelector('.ab-atom-visual');

    const fitVisual = () => {
        if (!visualWrapper || !visual) return;
        const containerWidth = visualWrapper.clientWidth;
        if (containerWidth > 0 && containerWidth < 550) {
            const scale = containerWidth / 550;
            visual.style.transform = `scale(${scale})`;
            visual.style.transformOrigin = 'top left';
            visualWrapper.style.height = `${380 * scale}px`;
        } else {
            visual.style.transform = 'none';
            visualWrapper.style.height = '380px';
        }
    };

    if (window.ResizeObserver && visualWrapper) {
        const ro = new ResizeObserver(() => fitVisual());
        ro.observe(visualWrapper);
    } else {
        window.addEventListener('resize', fitVisual);
    }
    setTimeout(fitVisual, 50);

    // Initializer Data
    const pBank = widgetWrapper.querySelector('.p-bank');
    const lBank = widgetWrapper.querySelector('.l-bank');

    const particleConfig = {
        proton: { color: '#E74C3C', stroke: '#C0392B', svg: '<path d="M 7 12 H 17 M 12 7 V 17" stroke="white" stroke-width="2" stroke-linecap="round"/>' },
        neutron: { color: '#95A5A6', stroke: '#7F8C8D', svg: '' },
        electron: { color: '#3498DB', stroke: '#2980B9', svg: '<path d="M 7 12 H 17" stroke="white" stroke-width="2" stroke-linecap="round"/>' }
    };

    const labels = [
        { id: 'label-proton', text: 'Protons' },
        { id: 'label-neutron', text: 'Neutrons' },
        { id: 'label-electron', text: 'Electrons' },
        { id: 'label-shell1', text: 'Shell 1' },
        { id: 'label-shell2', text: 'Shell 2' }
    ];

    const elementsList = [
        "H","He","Li","Be","B","C","N","O","F","Ne","Na","Mg","Al","Si","P","S","Cl","Ar","K","Ca",
        "Sc","Ti","V","Cr","Mn","Fe","Co","Ni","Cu","Zn","Ga","Ge","As","Se","Br","Kr","Rb","Sr","Y","Zr",
        "Nb","Mo","Tc","Ru","Rh","Pd","Ag","Cd","In","Sn","Sb","Te","I","Xe","Cs","Ba","La","Ce","Pr","Nd",
        "Pm","Sm","Eu","Gd","Tb","Dy","Ho","Er","Tm","Yb","Lu","Hf","Ta","W","Re","Os","Ir","Pt","Au","Hg",
        "Tl","Pb","Bi","Po","At","Rn","Fr","Ra","Ac","Th","Pa","U","Np","Pu","Am","Cm","Bk","Cf","Es","Fm",
        "Md","No","Lr","Rf","Db","Sg","Bh","Hs","Mt","Ds","Rg","Cn","Nh","Fl","Mc","Lv","Ts","Og"
    ];

    // Deselect All Helper
    const deselectAll = () => {
        selectedItems.forEach(item => item.classList.remove('selected'));
        selectedItems = [];
        if (selectedZone) {
            selectedZone.classList.remove('selected-zone');
            selectedZone = null;
        }
    };

    widgetWrapper.addEventListener('click', deselectAll); // Global widget deselect listener

    const createParticleEl = (type) => {
        const el = document.createElement('div');
        el.className = 'ab-particle';
        el.dataset.type = type;
        el.draggable = true;
        const c = particleConfig[type];
        el.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${c.color}" stroke="${c.stroke}" stroke-width="2"/>${c.svg}</svg>`;
        return el;
    };

    // Populate Banks
    for (let i = 0; i < 6; i++) pBank.appendChild(createParticleEl('proton'));
    for (let i = 0; i < 6; i++) pBank.appendChild(createParticleEl('neutron'));
    for (let i = 0; i < 6; i++) pBank.appendChild(createParticleEl('electron'));

    labels.forEach(l => {
        const el = document.createElement('div');
        el.className = 'ab-label-item';
        el.dataset.type = l.id;
        el.draggable = true;
        el.innerText = l.text;
        lBank.appendChild(el);
    });

    // Setup Randomized Symbol Cards
    const symContainer = widgetWrapper.querySelector('.ab-symbol-options');
    let symOpts = [{ z: 3, a: 7, sym: 'Li' }];
    
    while(symOpts.length < 4) {
        let rZ = Math.floor(Math.random() * 118) + 1;
        if (symOpts.find(o => o.z === rZ)) continue;
        let mass = rZ === 1 ? 1 : rZ === 2 ? 4 : Math.round(rZ * 2.1);
        symOpts.push({ z: rZ, a: mass, sym: elementsList[rZ-1] });
    }
    symOpts.sort(() => Math.random() - 0.5);

    symOpts.forEach(opt => {
        const card = document.createElement('div');
        card.className = 'ab-symbol-card';
        card.dataset.z = opt.z;
        card.innerHTML = `<div class="ab-mass">${opt.a}</div><div class="ab-num">${opt.z}</div><div>${opt.sym}</div>`;
        card.onclick = (e) => {
            e.stopPropagation();
            widgetWrapper.querySelectorAll('.ab-symbol-card').forEach(c => c.classList.remove('selected-symbol'));
            card.classList.add('selected-symbol');
            autoCheck();
        };
        symContainer.appendChild(card);
    });

    // Setup Config Input Formatting
    const cfgInput = widgetWrapper.querySelector('.ab-config-input');
    let prevVal = "";
    cfgInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.key.length > 1) return;
        if (!/^\d$/.test(e.key)) e.preventDefault();
    });
    cfgInput.addEventListener('input', function(e) {
        let digits = this.value.replace(/\D/g, '');
        if (e.inputType === 'deleteContentBackward' && digits === prevVal) digits = digits.slice(0, -1);
        prevVal = digits;
        this.value = digits.length > 0 ? '(' + digits.split('').join(', ') + ')' : '';
        autoCheck();
    });

    // Helper that preserves existing badge class names while switching state
    const updateBadgeEl = (badge, curr, target, textPending, textSuccess) => {
        if (!badge) return;
        if (curr === target) {
            badge.classList.remove('pending', 'incorrect');
            badge.classList.add('correct');
            badge.innerText = textSuccess || `${textPending} ✓`;
        } else if (curr > target) {
            badge.classList.remove('pending', 'correct');
            badge.classList.add('incorrect');
            badge.innerText = `${curr}/${target} ✗`;
        } else {
            badge.classList.remove('correct', 'incorrect');
            badge.classList.add('pending');
            badge.innerText = textPending;
        }
    };

    // Main Auto Checker Engine
    const autoCheck = () => {
        const protons = widgetWrapper.querySelectorAll('.ab-nucleus .ab-particle[data-type="proton"]').length;
        const neutrons = widgetWrapper.querySelectorAll('.ab-nucleus .ab-particle[data-type="neutron"]').length;
        const s1 = widgetWrapper.querySelectorAll('.ab-shell1 .ab-particle[data-type="electron"]').length;
        const s2 = widgetWrapper.querySelectorAll('.ab-shell2 .ab-particle[data-type="electron"]').length;

        updateBadgeEl(widgetWrapper.querySelector('.ab-proton-badge'), protons, 3, `${protons}/3`);
        updateBadgeEl(widgetWrapper.querySelector('.ab-neutron-badge'), neutrons, 4, `${neutrons}/4`);
        updateBadgeEl(widgetWrapper.querySelector('.ab-s1-badge'), s1, 2, `${s1}/2 e⁻`);
        updateBadgeEl(widgetWrapper.querySelector('.ab-s2-badge'), s2, 1, `${s2}/1 e⁻`);

        let keyCorrect = 0;
        widgetWrapper.querySelectorAll('.ab-static-key .ab-label-zone').forEach(z => {
            const child = z.children[0];
            if (child && child.dataset.type === z.dataset.accept) {
                keyCorrect++;
                z.classList.add('correct-drop'); z.classList.remove('incorrect-drop');
            } else if (child) {
                z.classList.add('incorrect-drop'); z.classList.remove('correct-drop');
            } else z.classList.remove('correct-drop', 'incorrect-drop');
        });
        updateBadgeEl(widgetWrapper.querySelector('.ab-key-badge'), keyCorrect, 3, `${keyCorrect}/3`, "✓ Complete");

        let diagramLabels = 0;
        widgetWrapper.querySelectorAll('.ab-atom-visual > .ab-label-zone').forEach(z => {
            const child = z.children[0];
            if (child && child.dataset.type === z.dataset.accept) {
                diagramLabels++;
                z.classList.add('correct-drop'); z.classList.remove('incorrect-drop');
            } else if (child) {
                z.classList.add('incorrect-drop'); z.classList.remove('correct-drop');
            } else z.classList.remove('correct-drop', 'incorrect-drop');
        });

        const selSym = widgetWrapper.querySelector('.ab-symbol-card.selected-symbol');
        const symBadge = widgetWrapper.querySelector('.ab-symbol-badge');
        let isSymCorrect = false;
        widgetWrapper.querySelectorAll('.ab-symbol-card').forEach(c => c.classList.remove('correct-card', 'incorrect-card'));
        if (selSym) {
            if (selSym.dataset.z === '3') {
                isSymCorrect = true; selSym.classList.add('correct-card');
                symBadge.classList.remove('pending', 'incorrect');
                symBadge.classList.add('correct');
                symBadge.innerText = '✓ Correct';
            } else {
                selSym.classList.add('incorrect-card');
                symBadge.classList.remove('pending', 'correct');
                symBadge.classList.add('incorrect');
                symBadge.innerText = '✗ Incorrect';
            }
        } else {
            symBadge.classList.remove('correct', 'incorrect');
            symBadge.classList.add('pending');
            symBadge.innerText = 'Pending';
        }

        const cfgVal = cfgInput.value.trim();
        const cfgBadge = widgetWrapper.querySelector('.ab-config-badge');
        let isCfgCorrect = false;
        cfgInput.classList.remove('correct-input', 'incorrect-input');
        if (cfgVal === '(2, 1)') {
            isCfgCorrect = true; cfgInput.classList.add('correct-input');
            cfgBadge.classList.remove('pending', 'incorrect');
            cfgBadge.classList.add('correct');
            cfgBadge.innerText = '✓ Correct';
        } else if (cfgVal.length > 0) {
            cfgInput.classList.add('incorrect-input');
            cfgBadge.classList.remove('pending', 'correct');
            cfgBadge.classList.add('incorrect');
            cfgBadge.innerText = '✗ Incorrect';
        } else {
            cfgBadge.classList.remove('correct', 'incorrect');
            cfgBadge.classList.add('pending');
            cfgBadge.innerText = 'Pending';
        }

        const isAllCorrect = protons === 3 && neutrons === 4 && s1 === 2 && s2 === 1 && keyCorrect === 3 && diagramLabels === 2 && isSymCorrect && isCfgCorrect;
        
        q._isCorrect = isAllCorrect;
        q._userAnswer = isAllCorrect ? "Completed Lithium Atom" : null;
        
        if (quizInstance && typeof quizInstance.updateProgress === 'function') {
            quizInstance.updateProgress();
        }
    };

    // Return to Bank Helper
    const returnToBank = (item) => {
        if (item.dataset.type.startsWith('label')) widgetWrapper.querySelector('.l-bank').appendChild(item);
        else widgetWrapper.querySelector('.p-bank').appendChild(item);
        item.classList.remove('selected');
        autoCheck();
    };

    // Placement Engine
    const tryPlace = (item, type, zone) => {
        if (item.parentElement === zone) {
            item.classList.remove('selected');
            return;
        }

        let slot = null, ok = false;
        const zType = zone.dataset.zoneType;
        
        if (zType === 'nucleus') {
            const empty = Array.from(zone.querySelectorAll(`.ab-nucleus-slot[data-accept="${type}"]`)).filter(s => s.children.length === 0);
            if (empty.length > 0) { slot = empty[0]; ok = true; }
        } else if (zType === 'shell1' || zType === 'shell2') {
            if (type === 'electron' && zone.children.length === 0) { slot = zone; ok = true; }
        } else if (zType === 'label') {
            if (type === zone.dataset.accept && zone.children.length === 0) { slot = zone; ok = true; }
        } else if (zType === 'bank') {
            ok = true; 
            slot = type.startsWith('label') ? widgetWrapper.querySelector('.l-bank') : widgetWrapper.querySelector('.p-bank');
        }

        if (ok && slot) {
            slot.appendChild(item);
            item.classList.remove('selected');
            autoCheck();
        } else {
            zone.appendChild(item);
            item.classList.add('flashing-red');
            item.style.pointerEvents = 'none';
            setTimeout(() => {
                item.classList.remove('flashing-red');
                item.style.pointerEvents = 'auto';
                returnToBank(item);
            }, 1500);
        }
    };

    // --- Interactive Mouse Binding (Multi-Select + Drag-and-Drop) ---
    widgetWrapper.querySelectorAll('.ab-particle, .ab-label-item').forEach(item => {
        // Drag Setup
        item.addEventListener('dragstart', (e) => {
            if (!selectedItems.includes(item)) {
                deselectAll();
                selectedItems = [item];
                item.classList.add('selected');
            }

            draggedItems = [...selectedItems];
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.type);
            draggedItems.forEach(i => i.style.opacity = '0.4');
        });
        
        item.addEventListener('dragend', (e) => {
            draggedItems.forEach(i => i.style.opacity = '1');
            draggedItems = [];
            deselectAll();
        });

        // Multi-Select & Click Setup
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            const isInBank = this.parentElement.classList.contains('ab-bank-zone');

            // Scenario 1: Target Zone is already selected -> place this item into that zone immediately
            if (selectedZone) {
                tryPlace(this, this.dataset.type, selectedZone);
                return;
            }

            // Scenario 2: Item is placed on atom diagram (not in bank)
            if (!isInBank) {
                if (selectedItems.length === 0) {
                    returnToBank(this);
                    deselectAll();
                    return;
                }
            }

            // Scenario 3: Toggle Multi-Selection
            const idx = selectedItems.indexOf(this);
            if (idx > -1) {
                this.classList.remove('selected');
                selectedItems.splice(idx, 1);
            } else {
                this.classList.add('selected');
                selectedItems.push(this);
            }
        });
    });

    widgetWrapper.querySelectorAll('.ab-drop-zone, .ab-bank-zone').forEach(zone => {
        // Drag Receiver
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', (e) => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            if (draggedItems.length > 0) {
                const itemsToDrop = [...draggedItems];
                itemsToDrop.forEach(item => {
                    tryPlace(item, item.dataset.type, zone);
                });
                draggedItems = [];
            } else if (draggedItem) {
                tryPlace(draggedItem, draggedItem.dataset.type, zone);
                draggedItem = null;
            }
            deselectAll();
        });

        // Click Receiver (Zone)
        zone.addEventListener('click', function(e) {
            e.stopPropagation();

            // Bulk Move: If items are multi-selected, place ALL of them into this zone
            if (selectedItems.length > 0) {
                const itemsToPlace = [...selectedItems];
                itemsToPlace.forEach(item => {
                    tryPlace(item, item.dataset.type, this);
                });
                deselectAll();
                return;
            }

            // Toggle Target Zone Selection
            if (selectedZone === this) {
                deselectAll();
            } else {
                deselectAll();
                selectedZone = this;
                this.classList.add('selected-zone');
            }
        });
    });

    autoCheck(); // Trigger initial state check safely
}