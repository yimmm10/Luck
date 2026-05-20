/**
 * Cosmic Tarot App Logic - Security Hardened Version
 * Protected against common web vulnerabilities like XSS.
 */
(() => {
    "use strict";

    // --- Security Utilities ---
    /**
     * Escapes HTML special characters to prevent XSS.
     */
    function escapeHTML(str) {
        if (!str) return "";
        const htmlEntities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return String(str).replace(/[&<>"']/g, s => htmlEntities[s]);
    }

    // State Variables
    let selectedMode = 'single'; // 'single' or 'triple'
    let selectedTopic = 'general'; // 'general', 'work', or 'love'
    let selectedCards = []; // Store drawn card objects: { card, isReversed, index }
    let slots = []; // Store references to card objects in selection slots
    let deck = []; // Shuffled list of card IDs (0-21)
    let isShuffled = false;
    let maxCardsToSelect = 1;
    let soundEnabled = true;
    let audioCtx = null;

    // DOM Elements - Using const and querySelector for better security/performance
    const views = {
        modeSelection: document.getElementById('modeSelection'),
        boardView: document.getElementById('boardView'),
        resultsView: document.getElementById('resultsView')
    };

    const buttons = {
        soundToggle: document.getElementById('soundToggle'),
        btnBackToModes: document.getElementById('btnBackToModes'),
        btnShuffle: document.getElementById('btnShuffle'),
        btnConfirmReveal: document.getElementById('btnConfirmReveal'),
        btnRestart: document.getElementById('btnRestart')
    };

    const elements = {
        starsCanvas: document.getElementById('starsCanvas'),
        instructionText: document.getElementById('instructionText'),
        deckContainer: document.getElementById('deckContainer'),
        deckPile: document.getElementById('deckPile'),
        fanContainer: document.getElementById('fanContainer'),
        cardFan: document.getElementById('cardFan'),
        selectedSlotsContainer: document.getElementById('selectedSlotsContainer'),
        selectedSlots: document.getElementById('selectedSlots'),
        resultsGrid: document.getElementById('resultsGrid'),
        overallSummaryText: document.getElementById('overallSummaryText')
    };

    // Initialize App
    document.addEventListener('DOMContentLoaded', () => {
        initStarsBackground();
        setupEventListeners();
        resetState();
    });

    // --- Stars Canvas Animation ---
    function initStarsBackground() {
        const canvas = elements.starsCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let stars = [];
        const starCount = window.innerWidth < 768 ? 60 : 150;

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        class Star {
            constructor() {
                this.reset();
            }

            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 1.5 + 0.5;
                this.speed = Math.random() * 0.05 + 0.01;
                this.alpha = Math.random();
                this.alphaChange = Math.random() * 0.02 + 0.005;
            }

            update() {
                this.y -= this.speed;
                if (this.y < 0) {
                    this.y = canvas.height;
                    this.x = Math.random() * canvas.width;
                }

                // Twinkle
                this.alpha += this.alphaChange;
                if (this.alpha > 1 || this.alpha < 0) {
                    this.alphaChange = -this.alphaChange;
                }
            }

            draw() {
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, Math.min(this.alpha, 0.8))})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function setupStars() {
            stars = [];
            for (let i = 0; i < starCount; i++) {
                stars.push(new Star());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.forEach(star => {
                star.update();
                star.draw();
            });
            requestAnimationFrame(animate);
        }

        window.addEventListener('resize', () => {
            resizeCanvas();
            setupStars();
        });

        resizeCanvas();
        setupStars();
        animate();
    }

    // --- Audio Synthesis System (Web Audio API) ---
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playSynthesizedSound(type) {
        if (!soundEnabled) return;
        initAudio();
        if (!audioCtx) return;

        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;

        if (type === 'click') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);

            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

            osc.start(now);
            osc.stop(now + 0.15);
        } 
        else if (type === 'shuffle') {
            const bufferSize = audioCtx.sampleRate * 0.1;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1000;

            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);

            noise.start(now);
            noise.stop(now + 0.1);
        } 
        else if (type === 'draw') {
            const frequencies = [523.25, 659.25, 783.99, 1046.50];
            frequencies.forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.06);

                gain.gain.setValueAtTime(0.08, now + idx * 0.06);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.4);

                osc.start(now + idx * 0.06);
                osc.stop(now + idx * 0.06 + 0.4);
            });
        } 
        else if (type === 'complete') {
            const chord = [329.63, 392.00, 523.25, 659.25];
            chord.forEach((freq) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.8);

                gain.gain.setValueAtTime(0.06, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

                osc.start(now);
                osc.stop(now + 1.0);
            });
        }
    }

    // --- Setup Interactions & Listeners ---
    function setupEventListeners() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                initAudio();
                playSynthesizedSound('click');
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedMode = btn.getAttribute('data-mode');
            });
        });

        document.querySelectorAll('.feature-item').forEach(item => {
            item.addEventListener('click', () => {
                initAudio();
                playSynthesizedSound('click');
                document.querySelectorAll('.feature-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                selectedTopic = item.getAttribute('data-topic');
                setTimeout(() => {
                    selectMode(selectedMode);
                }, 150);
            });
        });

        buttons.soundToggle.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            const icon = buttons.soundToggle.querySelector('i');
            if (soundEnabled) {
                icon.className = 'fa-solid fa-volume-high';
                playSynthesizedSound('click');
            } else {
                icon.className = 'fa-solid fa-volume-xmark';
            }
        });

        buttons.btnBackToModes.addEventListener('click', () => {
            playSynthesizedSound('click');
            showView('modeSelection');
            resetState();
        });

        buttons.btnShuffle.addEventListener('click', () => {
            triggerShuffleAnimation();
        });

        buttons.btnConfirmReveal.addEventListener('click', () => {
            playSynthesizedSound('complete');
            buttons.btnConfirmReveal.classList.add('hidden');
            elements.instructionText.textContent = 'มวลหมู่ดาวกำลังจัดเรียงถ้อยคำแห่งโชคชะตา...';

            selectedCards = slots.map(slot => ({
                card: TAROT_DECK[slot.cardId],
                isReversed: slot.isReversed,
                fanIndex: slot.fanIndex
            }));

            slots.forEach(slot => {
                if (slot) {
                    slot.cardElement.classList.add('flipped');
                    if (slot.isReversed) {
                        const cardFront = slot.cardElement.querySelector('.card-front');
                        cardFront.classList.add('reversed-draw');
                    }
                }
            });

            setTimeout(() => {
                showResults();
            }, 1800);
        });

        buttons.btnRestart.addEventListener('click', () => {
            playSynthesizedSound('click');
            showView('modeSelection');
            resetState();
        });
    }

    function showView(viewId) {
        Object.keys(views).forEach(key => {
            if (key === viewId) {
                views[key].classList.add('active');
            } else {
                views[key].classList.remove('active');
            }
        });
    }

    function resetState() {
        selectedCards = [];
        isShuffled = false;
        deck = Array.from({ length: TAROT_DECK.length }, (_, i) => i);
        selectedTopic = 'general';
        
        buttons.btnShuffle.classList.remove('hidden');
        buttons.btnConfirmReveal.classList.add('hidden');
        elements.instructionText.textContent = 'น้อมจิตสู่สมาธิ แล้วกดปุ่ม "สับไพ่" เพื่อเปิดประตูสู่คำทำนาย';
        elements.cardFan.innerHTML = '';
        elements.resultsGrid.innerHTML = '';
        
        if (elements.selectedSlotsContainer) {
            elements.selectedSlotsContainer.classList.add('hidden');
        }
        if (elements.selectedSlots) {
            elements.selectedSlots.innerHTML = '';
        }
        slots = [];
        
        if (elements.deckContainer) elements.deckContainer.classList.remove('hidden');
        if (elements.fanContainer) elements.fanContainer.classList.add('hidden');
        
        buildInitialDeckPile();
    }

    function selectMode(mode) {
        initAudio();
        playSynthesizedSound('click');
        selectedMode = mode;
        maxCardsToSelect = (mode === 'single') ? 1 : 3;
        initSlots();
        showView('boardView');
    }

    function buildInitialDeckPile() {
        elements.deckPile.innerHTML = '';
        const cardCount = 15;
        for (let i = 0; i < cardCount; i++) {
            const mockCard = document.createElement('div');
            mockCard.className = 'card-item';
            mockCard.style.top = `${-i * 2}px`;
            mockCard.style.left = `calc(50% - (var(--card-width) / 2) + ${i * 0.5}px)`;
            mockCard.style.zIndex = i;
            mockCard.style.pointerEvents = 'none';
            
            mockCard.innerHTML = `
                <div class="card-inner">
                    <div class="card-back">
                        <div class="card-back-pattern"></div>
                        <div class="card-back-corner top-left">✦</div>
                        <div class="card-back-corner top-right">✦</div>
                        <div class="card-back-corner bottom-left">✦</div>
                        <div class="card-back-corner bottom-right">✦</div>
                    </div>
                </div>
            `;
            elements.deckPile.appendChild(mockCard);
        }
    }

    function triggerShuffleAnimation() {
        playSynthesizedSound('click');
        buttons.btnShuffle.disabled = true;
        elements.instructionText.textContent = 'ห้วงจักรวาลกำลังสลับสับเปลี่ยนกงล้อแห่งโชคชะตา...';

        let soundInterval = setInterval(() => {
            playSynthesizedSound('shuffle');
        }, 150);

        const cards = elements.deckPile.querySelectorAll('.card-item');
        cards.forEach((card, idx) => {
            if (idx % 2 === 0) {
                card.classList.add('shuffling-left');
            } else {
                card.classList.add('shuffling-right');
            }
        });

        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        setTimeout(() => {
            clearInterval(soundInterval);
            cards.forEach(card => {
                card.classList.remove('shuffling-left', 'shuffling-right');
            });

            elements.deckPile.innerHTML = '';
            if (elements.deckContainer) elements.deckContainer.classList.add('hidden');
            if (elements.fanContainer) elements.fanContainer.classList.remove('hidden');
            buttons.btnShuffle.classList.add('hidden');
            spreadCardFan();
            buttons.btnShuffle.disabled = false;
            isShuffled = true;
        }, 1500);
    }

    function spreadCardFan() {
        elements.cardFan.innerHTML = '';
        elements.instructionText.textContent = `จงเลือกสื่อกลางแห่งชะตาชีวิตจำนวน ${maxCardsToSelect} ใบ`;

        const totalCards = deck.length;
        const isMobile = window.innerWidth <= 600;

        deck.forEach((cardId, index) => {
            const cardItem = document.createElement('div');
            cardItem.className = 'card-item';
            cardItem.setAttribute('data-card-id', cardId);
            cardItem.setAttribute('data-index', index);

            const percent = index / (totalCards - 1);
            const spreadRange = isMobile ? 90 : 80;
            const leftPos = (50 - spreadRange / 2) + (percent * spreadRange);
            cardItem.style.left = `${leftPos}%`;
            
            const maxRotation = isMobile ? 12 : 25;
            const angle = -maxRotation + (percent * (maxRotation * 2));
            const arcHeight = isMobile ? 40 : 50;
            const translateY = Math.sin(percent * Math.PI) * -arcHeight;
            
            cardItem.style.transform = `translateX(-50%) rotate(${angle}deg) translateY(${translateY}px)`;
            cardItem.style.zIndex = index;

            // Safe Template Construction
            const safeImgSrc = escapeHTML(TAROT_IMAGES[cardId]);
            const safeCardName = escapeHTML(TAROT_DECK[cardId].name);

            cardItem.innerHTML = `
                <div class="card-inner">
                    <div class="card-back">
                        <div class="card-back-pattern"></div>
                        <div class="card-back-corner top-left">✦</div>
                        <div class="card-back-corner top-right">✦</div>
                        <div class="card-back-corner bottom-left">✦</div>
                        <div class="card-back-corner bottom-right">✦</div>
                    </div>
                    <div class="card-front">
                        <img class="card-front-image" src="${safeImgSrc}" alt="${safeCardName}" loading="lazy">
                    </div>
                </div>
            `;

            cardItem.addEventListener('click', () => {
                selectCard(cardItem, cardId, index);
            });

            elements.cardFan.appendChild(cardItem);
        });
    }

    function initSlots() {
        if (elements.selectedSlotsContainer) {
            elements.selectedSlotsContainer.classList.remove('hidden');
        }
        if (elements.selectedSlots) {
            elements.selectedSlots.innerHTML = '';
            slots = Array.from({ length: maxCardsToSelect }, () => null);

            const labels = maxCardsToSelect === 1 
                ? ['คำแนะนำประจำวัน']
                : ['อดีต (Past)', 'ปัจจุบัน (Present)', 'อนาคต (Future)'];

            for (let i = 0; i < maxCardsToSelect; i++) {
                const slotEl = document.createElement('div');
                slotEl.className = 'card-slot';
                
                const labelEl = document.createElement('div');
                labelEl.className = 'card-slot-label';
                labelEl.textContent = labels[i]; // safe as labels are static
                slotEl.appendChild(labelEl);
                
                elements.selectedSlots.appendChild(slotEl);
            }
        }
    }

    function selectCard(cardElement, cardId, fanIndex) {
        if (cardElement.classList.contains('selected')) {
            deselectCard(cardElement);
            return;
        }

        const slotIndex = slots.findIndex(s => s === null);
        if (slotIndex === -1) return;

        playSynthesizedSound('draw');

        if (!cardElement.dataset.origLeft) cardElement.dataset.origLeft = cardElement.style.left;
        if (!cardElement.dataset.origTransform) cardElement.dataset.origTransform = cardElement.style.transform;
        if (!cardElement.dataset.origZIndex) cardElement.dataset.origZIndex = cardElement.style.zIndex;

        const isReversed = Math.random() < 0.25;

        cardElement.classList.add('selected');
        cardElement.style.left = '0';
        cardElement.style.transform = 'none';
        cardElement.style.zIndex = '100';
        
        const slotElement = elements.selectedSlots.children[slotIndex];
        slotElement.classList.add('active');
        slotElement.appendChild(cardElement);

        slots[slotIndex] = {
            cardId: cardId,
            cardElement: cardElement,
            isReversed: isReversed,
            fanIndex: fanIndex
        };

        updateSelectionProgress();
    }

    function deselectCard(cardElement) {
        const slotIndex = slots.findIndex(s => s && s.cardElement === cardElement);
        if (slotIndex === -1) return;

        playSynthesizedSound('click');

        slots[slotIndex] = null;
        const slotElement = elements.selectedSlots.children[slotIndex];
        slotElement.classList.remove('active');

        cardElement.classList.remove('selected');
        elements.cardFan.appendChild(cardElement);

        cardElement.style.left = cardElement.dataset.origLeft || '50%';
        cardElement.style.transform = cardElement.dataset.origTransform || 'translateX(-50%)';
        cardElement.style.zIndex = cardElement.dataset.origZIndex || '';

        buttons.btnConfirmReveal.classList.add('hidden');
        updateSelectionProgress();
    }

    function updateSelectionProgress() {
        const filledCount = slots.filter(s => s !== null).length;
        const remaining = maxCardsToSelect - filledCount;

        if (remaining > 0) {
            elements.instructionText.textContent = `เลือกแล้ว ${filledCount} ใบ (ยังขาดอีก ${remaining} ใบ เพื่อให้ครบกระบวนความ)`;
            buttons.btnConfirmReveal.classList.add('hidden');
        } else {
            elements.instructionText.textContent = 'ไพ่ถูกเลือกครบถ้วนแล้ว พร้อมรับฟังคำชี้แนะจากสรวงสวรรค์';
            buttons.btnConfirmReveal.classList.remove('hidden');
        }
    }

    function showResults() {
        showView('resultsView');
        elements.resultsGrid.innerHTML = '';

        selectedCards.forEach((drawn, index) => {
            const tarotCard = drawn.card;
            const isReversed = drawn.isReversed;
            const details = isReversed ? tarotCard.reversed : tarotCard.upright;
            
            let positionLabel = 'คำชี้แนะจากสรวงสวรรค์';
            if (selectedMode === 'triple') {
                if (index === 0) positionLabel = 'ปฐมบท: อดีตที่ผ่านมา (The Past)';
                if (index === 1) positionLabel = 'ปัจจุบันกาล: สิ่งที่เผชิญ (The Present)';
                if (index === 2) positionLabel = 'ปัจฉิมบท: อนาคตที่กำลังอุบัติ (The Future)';
            } else {
                positionLabel = 'อักขระชี้ทางชีวิต (The Core Guidance)';
            }

            const directionLabel = isReversed ? 'กลับหัว (Reversed)' : 'หัวตั้ง (Upright)';
            const directionClass = isReversed ? 'direction-reversed' : 'direction-upright';

            const allSections = [
                { key: 'general', icon: 'fa-compass', label: 'คำทำนายโดยรวม', text: details.general },
                { key: 'work', icon: 'fa-briefcase', label: 'ด้านการงาน', text: details.work },
                { key: 'finance', icon: 'fa-sack-dollar', label: 'ด้านการเงิน', text: details.finance || details.work },
                { key: 'love', icon: 'fa-heart', label: 'ด้านความรัก', text: details.love },
                { key: 'education', icon: 'fa-graduation-cap', label: 'ด้านการเรียน', text: details.education || details.general },
                { key: 'health', icon: 'fa-notes-medical', label: 'ด้านสุขภาพ', text: details.health || details.general },
                { key: 'social', icon: 'fa-users', label: 'ด้านบริวารและสังคม', text: details.social || details.general },
                { key: 'fortune', icon: 'fa-percent', label: 'ด้านโชคลาภ', text: details.fortune || details.general }
            ];

            let sections = allSections.filter(s => s.key === selectedTopic);

            // Safe building of sections
            const sectionsHtml = sections.map((sec) => {
                return `
                    <div class="meaning-section">
                        <strong><i class="fa-solid ${escapeHTML(sec.icon)}"></i> ${escapeHTML(sec.label)}</strong>
                        <p>${escapeHTML(sec.text)}</p>
                    </div>
                `;
            }).join('');

            const resultCardHtml = `
                <div class="result-item-card" style="animation-delay: ${index * 0.2}s">
                    <div class="result-card-display">
                        <span class="card-draw-position">${escapeHTML(positionLabel)}</span>
                        <div class="card-item-static ${isReversed ? 'reversed-draw' : ''}">
                            <img class="card-front-image" src="${escapeHTML(TAROT_IMAGES[drawn.card.id])}" alt="${escapeHTML(tarotCard.name)}" loading="lazy">
                        </div>
                        <span class="card-draw-direction ${escapeHTML(directionClass)}">
                            <i class="fa-solid ${isReversed ? 'fa-arrow-down' : 'fa-arrow-up'}"></i> ${escapeHTML(directionLabel)}
                        </span>
                    </div>
                    <div class="result-info">
                        <div class="result-info-header">
                            <h3>${escapeHTML(tarotCard.name)}</h3>
                            <span class="card-translation">${escapeHTML(tarotCard.thaiName)}</span>
                        </div>
                        <div class="result-meanings">
                            ${sectionsHtml}
                        </div>
                    </div>
                </div>
            `;
            elements.resultsGrid.insertAdjacentHTML('beforeend', resultCardHtml);
        });

        generateSynthesisText();
    }

    function generateSynthesisText() {
        let summaryText = '';
        const hasReversed = selectedCards.some(c => c.isReversed);
        const firstCard = selectedCards[0].card;
        
        const topicLabels = {
            work: 'วิถีแห่งการงาน',
            finance: 'กระแสแห่งการเงิน',
            love: 'เส้นทางแห่งความรัก',
            education: 'ปัญญาและการเรียนรู้',
            health: 'พลังแห่งพละกำลังและสุขภาพ',
            fortune: 'โชคลาภและวาสนา'
        };

        const topicName = topicLabels[selectedTopic] || 'ชะตาชีวิตโดยรวม';

        if (selectedMode === 'single') {
            summaryText = `ห้วงดวงดาวชี้แนะว่า <strong>${escapeHTML(topicName)}</strong> ของคุณถูกถักทอด้วยพลังของไพ่ <strong>${escapeHTML(firstCard.name)}</strong> (${escapeHTML(firstCard.thaiName.split('(')[0].trim())}). `;
            
            if (selectedTopic === 'love') {
                if (selectedCards[0].isReversed) {
                    summaryText += `กระแสรักในยามนี้ปรากฏเงาแห่งความสับสน แนะนำให้คุณใช้ความสงบสยบความเคลื่อนไหว ลดอคติที่บดบังทัศนวิสัยของหัวใจ แล้วแสงแห่งความเข้าใจจะนำพาสันติสุขกลับคืนมา`;
                } else {
                    summaryText += `รังสีแห่งเสน่ห์ดึงดูดกำลังเปล่งประกาย พลังงานบวกจากดวงดาวจะนำพาความสอดคล้องกลมกลืนมาสู่ความสัมพันธ์ หากโสดจะได้พบพานผู้นำพาความชื่นฉ่ำมาสู่ดวงใจ`;
                }
            } else if (selectedTopic === 'work') {
                if (selectedCards[0].isReversed) {
                    summaryText += `ครรลองแห่งการงานอาจพบจุดสะดุดหรือความล่าช้าอันมิอาจเลี่ยงได้ ควรรอบคอบในการวางแผนและระวังการสื่อสารที่คลาดเคลื่อน ใช้ความอดทนประดุจสายน้ำที่ค่อยๆ กัดเซาะอุปสรรค`;
                } else {
                    summaryText += `จังหวะแห่งความรุ่งโรจน์กำลังมาเยือน ความอุตสาหะของคุณจะสัมฤทธิผลเป็นที่ประจักษ์แก่สายตาผู้คน มีโอกาสได้รับโอกาสทองหรือการเกื้อหนุนจากผู้มีอำนาจวาสนา`;
                }
            } else {
                if (selectedCards[0].isReversed) {
                    summaryText += `ไพ่สื่อถึงความจำเป็นในการหยุดนิ่งเพื่อทบทวนทิศทางชีวิต ระมัดระวังอารมณ์ที่อาจแปรปรวนตามอิทธิพลของดวงดาวที่ติดขัด การปล่อยวางจะเป็นกุญแจสำคัญสู่ความสงบในจิตวิญญาณ`;
                } else {
                    summaryText += `ชะตาชีวิตโดยรวมอยู่ในเกณฑ์ที่เปี่ยมด้วยพลังสร้างสรรค์ หากดำรงชีวิตด้วยสติและปัญญา จักสามารถเปลี่ยนอุปสรรคให้เป็นบันไดสู่ความสำเร็จได้อย่างน่าอัศจรรย์`;
                }
            }
        } else {
            const cardNames = selectedCards.map(c => `<strong>${escapeHTML(c.card.thaiName.split('(')[0].trim())}</strong>`).join(', ');
            summaryText = `กระแสพลังงานจากสรวงสวรรค์ที่ผ่านไพ่ทั้ง 3 ใบ ได้แก่ ${cardNames} ได้ร้อยเรียงเรื่องราวแห่ง <strong>${escapeHTML(topicName)}</strong> ของคุณผ่านกาลเวลาจากอดีต สู่ปัจจุบัน และปูทางสู่อนาคตที่กำลังจะมาถึง. `;
            
            if (hasReversed) {
                summaryText += `แม้ภาพรวมจะปรากฏความติดขัดของพลังงานในบางช่วงจังหวะชีวิต แต่นั่นคือบทเรียนเพื่อการตื่นรู้และแก้ไข แนะนำให้คุณเผชิญหน้ากับความจริงด้วยความกล้าหาญ แล้วพายุแห่งความสับสนจะมลายหายไปเอง`;
            } else {
                summaryText += `เส้นทางเดินของชีวิตมีความสอดคล้องกับกฎแห่งธรรมชาติอย่างงดงาม พลังบุญหนุนนำให้เกิดความราบรื่นในทุกย่างก้าว ถือเป็นนิมิตหมายอันดีที่จะริเริ่มหรือต่อยอดความสำเร็จให้มั่นคงถาวรสืบไป`;
            }
        }

        elements.overallSummaryText.innerHTML = summaryText; // summaryText is now pre-sanitized
    }
})();


