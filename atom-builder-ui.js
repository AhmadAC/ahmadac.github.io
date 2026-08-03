// atom-builder-ui.js - Handles rendering and interaction for Atom Builder questions

export function setupAtomBuilderUI(container, q, idx) {
    q._isCorrect = false;
    q._userAnswer = null;

    const widgetWrapper = document.createElement('div');
    widgetWrapper.className = 'atom-builder-widget-wrapper';

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

                <div class="ab-atom-visual">
                    <svg class="ab-svg-bg" width="550" height="380" viewBox="0 0 550 380">
                        <circle cx="260" cy="190" r="150" fill="none" stroke="#BDC3C7" stroke-width="2" stroke-dasharray="8,8" />
                        <circle cx="260" cy="190" r="85" fill="none" stroke="#BDC3C7" stroke-width="2" stroke-dasharray="8,8" />
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

                    <div class="ab-drop-zone ab-shell-slot ab-shell1" data-zone-type="shell1" style="left:246px; top:91px;"></div>
                    <div class="ab-drop-zone ab-shell-slot ab-shell1" data-zone-type="shell1" style="left:246px; top:261px;"></div>

                    <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:246px; top:26px;"></div>
                    <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:246px; top:326px;"></div>
                    <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:96px; top:176px;"></div>
                    <div class="ab-drop-zone ab-shell-slot ab-shell2" data-zone-type="shell2" style="left:396px; top:176px;"></div>

                    <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-shell2" style="left:440px; top:42px;"></div>
                    <div class="ab-drop-zone ab-label-zone" data-zone-type="label" data-accept="label-shell1" style="left:440px; top:122px;"></div>
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

    const pBank = widgetWrapper.querySelector('.p-bank');
    const lBank = widgetWrapper.querySelector('.l-bank');

    const particleConfig = {
        proton: { color: '#E74C3C', stroke: '#C0392B', svg: '<path d="M 7 12 H 17 M 12 7 V 17" stroke="white" stroke-width="2" stroke-linecap="round"/>' },
        neutron: { color: '#95A5A6', stroke: '#7F8C8D', svg: '' },
        electron: { color: '#3498DB', stroke: '#2980B9', svg: '<path d="M 7 12 H 17" stroke="white" stroke-width="2" stroke-linecap="round"/>' }
    };

    const createParticleEl = (type) => {
        const el = document.createElement('div');
        el.className = 'ab-particle';
        el.dataset.type = type;
        el.draggable = true;
        const c = particleConfig[type];
        el.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${c.color}" stroke="${c.stroke}" stroke-width="2"/>${c.svg}</svg>`;
        return el;
    };

    for (let i = 0; i < 6; i++) pBank.appendChild(createParticleEl('proton'));
    for (let i = 0; i < 6; i++) pBank.appendChild(createParticleEl('neutron'));
    for (let i = 0; i < 6; i++) pBank.appendChild(createParticleEl('electron'));

    const labels = [
        { id: 'label-proton', text: 'Protons' },
        { id: 'label-neutron', text: 'Neutrons' },
        { id: 'label-electron', text: 'Electrons' },
        { id: 'label-shell1', text: 'Shell 1' },
        { id: 'label-shell2', text: 'Shell 2' }
    ];

    labels.forEach(l => {
        const el = document.createElement('div');
        el.className = 'ab-label-item';
        el.dataset.type = l.id;
        el.draggable = true;
        el.innerText = l.text;
        lBank.appendChild(el);
    });

    const symContainer = widgetWrapper.querySelector('.ab-symbol-options');
    const elementsList = ["H","He","Li","Be","B","C","N","O","F","Ne","Na","Mg","Al"];
    let symOpts = [{ z: 3, a: 7, sym: 'Li' }];
    while(symOpts.length < 4) {
        let rZ = Math.floor(Math.random() * 12) + 1;
        if (symOpts.find(o => o.z === rZ)) continue;
        symOpts.push({ z: rZ, a: Math.round(rZ * 2.1), sym: elementsList[rZ-1] });
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

    let draggedItem = null;

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
                symBadge.className = 'ab-badge correct'; symBadge.innerText = '✓ Correct';
            } else {
                selSym.classList.add('incorrect-card');
                symBadge.className = 'ab-badge incorrect'; symBadge.innerText = '✗ Incorrect';
            }
        } else { symBadge.className = 'ab-badge pending'; symBadge.innerText = 'Pending'; }

        const cfgVal = cfgInput.value.trim();
        const cfgBadge = widgetWrapper.querySelector('.ab-config-badge');
        let isCfgCorrect = false;
        cfgInput.classList.remove('correct-input', 'incorrect-input');
        if (cfgVal === '(2, 1)') {
            isCfgCorrect = true; cfgInput.classList.add('correct-input');
            cfgBadge.className = 'ab-badge correct'; cfgBadge.innerText = '✓ Correct';
        } else if (cfgVal.length > 0) {
            cfgInput.classList.add('incorrect-input');
            cfgBadge.className = 'ab-badge incorrect'; cfgBadge.innerText = '✗ Incorrect';
        } else { cfgBadge.className = 'ab-badge pending'; cfgBadge.innerText = 'Pending'; }

        const isAllCorrect = protons === 3 && neutrons === 4 && s1 === 2 && s2 === 1 && keyCorrect === 3 && diagramLabels === 2 && isSymCorrect && isCfgCorrect;
        q._isCorrect = isAllCorrect;
        q._userAnswer = isAllCorrect ? "Completed Lithium Atom" : null;
        this.updateProgress();
    };

    const updateBadgeEl = (badge, curr, target, textPending, textSuccess) => {
        if (!badge) return;
        if (curr === target) {
            badge.className = 'ab-badge correct';
            badge.innerText = textSuccess || `${textPending} ✓`;
        } else if (curr > target) {
            badge.className = 'ab-badge incorrect';
            badge.innerText = `${curr}/${target} ✗`;
        } else {
            badge.className = 'ab-badge pending';
            badge.innerText = textPending;
        }
    };

    const returnToBank = (item) => {
        if (item.dataset.type.startsWith('label')) widgetWrapper.querySelector('.l-bank').appendChild(item);
        else widgetWrapper.querySelector('.p-bank').appendChild(item);
        autoCheck();
    };

    const tryPlace = (item, type, zone) => {
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
            ok = true; slot = type.startsWith('label') ? widgetWrapper.querySelector('.l-bank') : widgetWrapper.querySelector('.p-bank');
        }

        if (ok && slot) {
            slot.appendChild(item);
            autoCheck();
        } else {
            zone.appendChild(item);
            item.classList.add('flashing-red');
            setTimeout(() => {
                item.classList.remove('flashing-red');
                returnToBank(item);
            }, 1500);
        }
    };

    widgetWrapper.querySelectorAll('.ab-particle, .ab-label-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            e.dataTransfer.setData('text/plain', item.dataset.type);
        });
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!item.parentElement.classList.contains('ab-bank-zone')) returnToBank(item);
        });
    });

    widgetWrapper.querySelectorAll('.ab-drop-zone, .ab-bank-zone').forEach(zone => {
        zone.addEventListener('dragover', (e) => e.preventDefault());
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedItem) tryPlace(draggedItem, draggedItem.dataset.type, zone);
            draggedItem = null;
        });
    });

    autoCheck();
}