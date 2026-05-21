/* ═══════════════════════════════════════════════════════════
   COSMIC TAROT — app.js
   Security: input sanitisation, rate-limiting, no raw PII stored
   Architecture: all shuffle/draw logic lives here (server-side
   equivalent pattern: deck state never exposed in DOM attrs)
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─── Rate-limiter (anti-bot / anti-spam) ────────────────── */
const RateLimiter = (() => {
  const _log = {};
  return {
    allow(action, limitMs = 1500) {
      const now = Date.now();
      if (_log[action] && now - _log[action] < limitMs) return false;
      _log[action] = now;
      return true;
    }
  };
})();

/* ─── Sanitiser (XSS prevention on any text rendered to DOM) */
function sanitise(str) {
  if (typeof str !== 'string') return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ─── State (private — not exposed in data-* attrs) ─────── */
const STATE = {
  topic:     null,   // 'love' | 'work' | 'finance' | 'health'
  mode:      'single',
  maxCards:  1,
  deck:      [],     // shuffled card-ID array (server-side equivalent)
  slots:     [],     // { cardId, isReversed, el } | null
  selected:  [],     // final drawn cards
  shuffled:  false,
  soundOn:   true,
  audioCtx:  null,
};

/* ─── Topic config ───────────────────────────────────────── */
const TOPIC_CONFIG = {
  love:    { label: 'ความรัก',  icon: 'fa-heart',       color: '#e879a0', field: 'love'    },
  work:    { label: 'การงาน',   icon: 'fa-briefcase',    color: '#d4a843', field: 'work'    },
  finance: { label: 'การเงิน',  icon: 'fa-coins',        color: '#34d399', field: 'finance' },
  health:  { label: 'สุขภาพ',   icon: 'fa-heart-pulse',  color: '#2dd4bf', field: 'health'  },
};

const POS_LABELS = {
  single: ['คำแนะนำ'],
  triple: ['อดีต (Past)', 'ปัจจุบัน (Present)', 'อนาคต (Future)'],
};

/* ─── DOM refs ───────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const DOM = {
  screenHome:    $('screenHome'),
  screenBoard:   $('screenBoard'),
  screenResults: $('screenResults'),
  modeSelector:  $('modeSelector'),
  btnStartReading: $('btnStartReading'),
  btnBack:       $('btnBack'),
  btnShuffle:    $('btnShuffle'),
  btnReveal:     $('btnReveal'),
  btnRestart:    $('btnRestart'),
  soundToggle:   $('soundToggle'),
  boardStatus:   $('boardStatus'),
  topicBadge:    $('topicBadge'),
  slotsContainer: $('slotsContainer'),
  slotsRow:      $('slotsRow'),
  deckZone:      $('deckZone'),
  deckPile:      $('deckPile'),
  fanZone:       $('fanZone'),
  cardFan:       $('cardFan'),
  resultsGrid:   $('resultsGrid'),
  synthPanel:    $('synthPanel'),
  synthText:     $('synthText'),
  resultsTitleText: $('resultsTitleText'),
  starsCanvas:   $('starsCanvas'),
};

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initStars();
  bindEvents();
  // Flush any stale session data on unload
  window.addEventListener('beforeunload', () => { STATE.selected = []; STATE.slots = []; });
});

/* ═══════════════════════════════════════════════════════════
   STARS BACKGROUND
   ═══════════════════════════════════════════════════════════ */
function initStars() {
  const canvas = DOM.starsCanvas;
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    buildStars();
  }

  function buildStars() {
    const n = Math.min(180, Math.floor(window.innerWidth * 0.15));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.4 + 0.3,
      speed: Math.random() * 0.04 + 0.008,
      alpha: Math.random(),
      da: (Math.random() * 0.015 + 0.004) * (Math.random() < 0.5 ? 1 : -1),
    }));
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      s.y -= s.speed;
      if (s.y < 0) { s.y = canvas.height; s.x = Math.random() * canvas.width; }
      s.alpha += s.da;
      if (s.alpha > 1 || s.alpha < 0) s.da = -s.da;
      ctx.globalAlpha = Math.max(0.05, Math.min(s.alpha, 0.85));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  resize();
  tick();
}

/* ═══════════════════════════════════════════════════════════
   AUDIO (Web Audio API — synthesised, no external files)
   ═══════════════════════════════════════════════════════════ */
function initAudio() {
  if (!STATE.audioCtx) {
    STATE.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (STATE.audioCtx.state === 'suspended') STATE.audioCtx.resume();
}

function playSound(type) {
  if (!STATE.soundOn) return;
  initAudio();
  const ctx = STATE.audioCtx;
  if (!ctx) return;
  const t = ctx.currentTime;

  if (type === 'click') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'triangle';
    o.frequency.setValueAtTime(550, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.1);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.start(t); o.stop(t + 0.15);
  }

  else if (type === 'shuffle') {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    flt.type = 'bandpass'; flt.frequency.value = 1200;
    g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.buffer = buf; src.connect(flt); flt.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t + 0.08);
  }

  else if (type === 'draw') {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      const dt = t + i * 0.07;
      g.gain.setValueAtTime(0.07, dt);
      g.gain.exponentialRampToValueAtTime(0.001, dt + 0.5);
      o.start(dt); o.stop(dt + 0.5);
    });
  }

  else if (type === 'reveal') {
    [329.63, 392, 523.25, 659.25, 783.99].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'triangle'; o.frequency.value = freq;
      const dt = t + i * 0.09;
      g.gain.setValueAtTime(0.06, dt);
      g.gain.exponentialRampToValueAtTime(0.001, dt + 0.8);
      o.start(dt); o.stop(dt + 0.8);
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   EVENT BINDING
   ═══════════════════════════════════════════════════════════ */
function bindEvents() {
  /* Sound toggle */
  DOM.soundToggle.addEventListener('click', () => {
    STATE.soundOn = !STATE.soundOn;
    DOM.soundToggle.querySelector('i').className =
      STATE.soundOn ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
    if (STATE.soundOn) { initAudio(); playSound('click'); }
  });

  /* Category cards */
  document.querySelectorAll('.cat-card').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!RateLimiter.allow('cat-click', 300)) return;
      initAudio(); playSound('click');
      document.querySelectorAll('.cat-card').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.topic = btn.dataset.topic;
      DOM.modeSelector.classList.remove('hidden');
    });
  });

  /* Mode buttons */
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.mode     = btn.dataset.mode;
      STATE.maxCards = STATE.mode === 'single' ? 1 : 3;
      playSound('click');
    });
  });

  /* Start reading */
  DOM.btnStartReading.addEventListener('click', () => {
    if (!STATE.topic) return;
    if (!RateLimiter.allow('start', 800)) return;
    playSound('click');
    startBoard();
  });

  /* Back */
  DOM.btnBack.addEventListener('click', () => {
    if (!RateLimiter.allow('nav', 600)) return;
    playSound('click');
    showScreen('screenHome');
    resetBoard();
  });

  /* Shuffle */
  DOM.btnShuffle.addEventListener('click', () => {
    if (!RateLimiter.allow('shuffle', 2000)) return;
    if (!STATE.shuffled) shuffle();
  });

  /* Reveal */
  DOM.btnReveal.addEventListener('click', () => {
    if (!RateLimiter.allow('reveal', 2000)) return;
    revealAll();
  });

  /* Restart */
  DOM.btnRestart.addEventListener('click', () => {
    if (!RateLimiter.allow('nav', 600)) return;
    playSound('click');
    showScreen('screenHome');
    resetBoard();
    document.querySelectorAll('.cat-card').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.mode-btn[data-mode="single"]').classList.add('active');
    DOM.modeSelector.classList.add('hidden');
    STATE.topic = null; STATE.mode = 'single'; STATE.maxCards = 1;
  });
}

/* ═══════════════════════════════════════════════════════════
   VIEW MANAGEMENT
   ═══════════════════════════════════════════════════════════ */
function showScreen(id) {
  ['screenHome','screenBoard','screenResults'].forEach(s => {
    const el = $(s);
    if (s === id) el.classList.add('active');
    else el.classList.remove('active');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════
   BOARD SETUP
   ═══════════════════════════════════════════════════════════ */
function startBoard() {
  resetBoard();
  const cfg = TOPIC_CONFIG[STATE.topic];
  DOM.topicBadge.textContent = cfg.label;
  DOM.topicBadge.style.borderColor = cfg.color + '55';
  DOM.topicBadge.style.background  = cfg.color + '22';
  DOM.topicBadge.style.color       = cfg.color;

  // Init deck (server-side equivalent: not exposed in DOM)
  STATE.deck = Array.from({ length: TAROT_DECK.length }, (_, i) => i);
  STATE.slots = Array(STATE.maxCards).fill(null);

  buildSlots();
  buildDeckPile();
  showScreen('screenBoard');
}

function resetBoard() {
  STATE.deck = []; STATE.slots = []; STATE.selected = []; STATE.shuffled = false;
  DOM.cardFan.innerHTML = '';
  DOM.slotsRow.innerHTML = '';
  DOM.deckPile.innerHTML = '';
  DOM.slotsContainer.classList.add('hidden');
  DOM.fanZone.classList.add('hidden');
  DOM.deckZone.classList.remove('hidden');
  DOM.btnShuffle.classList.remove('hidden');
  DOM.btnReveal.classList.add('hidden');
  DOM.boardStatus.textContent = 'กดปุ่มสับไพ่เพื่อเริ่มต้น';
}

/* ─── Slot placeholders ──────────────────────────────────── */
function buildSlots() {
  DOM.slotsRow.innerHTML = '';
  const labels = POS_LABELS[STATE.mode];
  for (let i = 0; i < STATE.maxCards; i++) {
    const slot = document.createElement('div');
    slot.className = 'card-slot';
    slot.dataset.slotIdx = i;
    slot.innerHTML = `
      <div class="card-slot-label">${sanitise(labels[i])}</div>
      <div class="slot-placeholder"><i class="fa-regular fa-circle-question"></i></div>
      <span class="rev-badge">กลับหัว</span>`;
    DOM.slotsRow.appendChild(slot);
  }
  DOM.slotsContainer.classList.remove('hidden');
}

/* ─── Deck pile display ──────────────────────────────────── */
function buildDeckPile() {
  DOM.deckPile.innerHTML = '';
  for (let i = 0; i < 14; i++) {
    const c = document.createElement('div');
    c.className = 'card-item';
    c.style.cssText = `top:${-i*1.8}px;left:calc(50% - var(--card-w)/2 + ${i*0.4}px);z-index:${i};pointer-events:none;position:absolute;`;
    c.innerHTML = cardBackHTML();
    DOM.deckPile.appendChild(c);
  }
}

function cardBackHTML() {
  return `<div class="card-inner">
    <div class="card-back">
      <div class="card-back-pattern"></div>
      <div class="card-back-eye"><i class="fa-solid fa-eye"></i></div>
      <span class="card-back-corner tl">✦</span>
      <span class="card-back-corner tr">✦</span>
      <span class="card-back-corner bl">✦</span>
      <span class="card-back-corner br">✦</span>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════
   SHUFFLE  (Fisher-Yates; deck state never in DOM)
   ═══════════════════════════════════════════════════════════ */
function shuffle() {
  if (!RateLimiter.allow('shuffle-anim', 1800)) return;
  DOM.btnShuffle.disabled = true;
  DOM.boardStatus.textContent = 'กำลังสับไพ่แห่งโชคชะตา…';

  const cards = DOM.deckPile.querySelectorAll('.card-item');
  let tick = 0;
  const sfxInterval = setInterval(() => { playSound('shuffle'); tick++; if (tick > 8) clearInterval(sfxInterval); }, 160);

  cards.forEach((c, i) => {
    c.style.transition = `transform 0.45s cubic-bezier(0.4,0,0.2,1) ${i * 18}ms`;
    c.classList.add(i % 2 === 0 ? 'anim-left' : 'anim-right');
  });

  // Fisher-Yates shuffle (internal state only)
  for (let i = STATE.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [STATE.deck[i], STATE.deck[j]] = [STATE.deck[j], STATE.deck[i]];
  }

  setTimeout(() => {
    clearInterval(sfxInterval);
    cards.forEach(c => c.classList.remove('anim-left','anim-right'));
    DOM.deckZone.classList.add('hidden');
    DOM.fanZone.classList.remove('hidden');
    DOM.btnShuffle.classList.add('hidden');
    DOM.btnShuffle.disabled = false;
    STATE.shuffled = true;
    spreadFan();
  }, 1500);
}

/* ═══════════════════════════════════════════════════════════
   FAN SPREAD
   ═══════════════════════════════════════════════════════════ */
function spreadFan() {
  DOM.cardFan.innerHTML = '';
  const total = STATE.deck.length;
  const isMobile = window.innerWidth <= 520;

  DOM.boardStatus.textContent = `เลือกไพ่จำนวน ${STATE.maxCards} ใบ`;

  STATE.deck.forEach((cardId, idx) => {
    const el = document.createElement('div');
    el.className = 'card-item in-fan';
    el.style.animationDelay = `${idx * 35}ms`;

    if (!isMobile) {
      const pct    = idx / (total - 1);
      const leftPx = `calc(${pct} * (100% - var(--card-w)))`;
      const angle  = -14 + pct * 28;
      const liftY  = Math.sin(pct * Math.PI) * -22;
      el.style.cssText = `left:${leftPx};transform:rotate(${angle}deg) translateY(${liftY}px);z-index:${idx};`;
    } else {
      // Mobile: CSS grid-like static positioning
      const col  = idx % 7;
      const row  = Math.floor(idx / 7);
      const colW = 100 / 7;
      el.style.cssText = `left:${col * colW}%;top:${row * 45}%;z-index:${idx};`;
    }

    el.innerHTML = cardBackHTML();
    el.classList.add('anim-deal');
    el.addEventListener('click', () => onCardClick(el, cardId));
    DOM.cardFan.appendChild(el);
  });
}

/* ═══════════════════════════════════════════════════════════
   CARD SELECT / DESELECT
   ═══════════════════════════════════════════════════════════ */
function onCardClick(el, cardId) {
  if (!RateLimiter.allow(`card-${cardId}`, 500)) return;

  if (el.classList.contains('selected')) {
    deselectCard(el, cardId);
    return;
  }

  const slotIdx = STATE.slots.findIndex(s => s === null);
  if (slotIdx === -1) return;

  playSound('draw');

  const isReversed = Math.random() < 0.25;
  el.classList.add('selected');

  // Move into slot DOM
  const slotEl   = DOM.slotsRow.children[slotIdx];
  const placeholder = slotEl.querySelector('.slot-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  slotEl.classList.add('filled');
  if (isReversed) slotEl.classList.add('reversed');
  slotEl.appendChild(el);

  STATE.slots[slotIdx] = { cardId, isReversed, el, slotEl };
  updateProgress();
}

function deselectCard(el, cardId) {
  const idx = STATE.slots.findIndex(s => s && s.cardId === cardId);
  if (idx === -1) return;
  playSound('click');

  const slotEl = STATE.slots[idx].slotEl;
  STATE.slots[idx] = null;
  slotEl.classList.remove('filled','reversed');
  const ph = slotEl.querySelector('.slot-placeholder');
  if (ph) ph.style.display = '';
  el.classList.remove('selected');
  el.style.cssText = '';
  DOM.cardFan.appendChild(el);
  updateProgress();
}

function updateProgress() {
  const filled = STATE.slots.filter(Boolean).length;
  const rem    = STATE.maxCards - filled;

  if (rem > 0) {
    DOM.boardStatus.textContent = `เลือกแล้ว ${filled} ใบ (เลือกเพิ่มอีก ${rem} ใบ)`;
    DOM.btnReveal.classList.add('hidden');
  } else {
    DOM.boardStatus.textContent = 'เลือกครบแล้ว! กดเปิดเผยคำทำนาย';
    DOM.btnReveal.classList.remove('hidden');
  }
}

/* ═══════════════════════════════════════════════════════════
   REVEAL ALL (flip + sparkle + results)
   ═══════════════════════════════════════════════════════════ */
function revealAll() {
  playSound('reveal');
  DOM.btnReveal.disabled = true;
  DOM.boardStatus.textContent = 'กำลังเปิดเผยความลี้ลับของดวงดาว…';

  // Build final selected array
  STATE.selected = STATE.slots
    .filter(Boolean)
    .map(s => ({ card: TAROT_DECK[s.cardId], isReversed: s.isReversed }));

  // Flip each card with staggered delay then sparkle
  STATE.slots.filter(Boolean).forEach((slot, i) => {
    setTimeout(() => {
      // Inject front face
      const inner = slot.el.querySelector('.card-inner');
      const frontDiv = document.createElement('div');
      frontDiv.className = 'card-front' + (slot.isReversed ? ' reversed-draw' : '');
      const img = document.createElement('img');
      img.className = 'card-front-image';
      img.src   = sanitise(TAROT_DECK[slot.cardId].image);
      img.alt   = sanitise(TAROT_DECK[slot.cardId].name);
      img.loading = 'lazy';
      frontDiv.appendChild(img);
      inner.appendChild(frontDiv);

      // Trigger 3D flip
      slot.el.classList.add('flipped');

      // Sparkle after flip
      setTimeout(() => triggerSparkle(slot.el), 420);
    }, i * 380);
  });

  // Show results after all cards flipped
  const delay = STATE.maxCards * 380 + 900;
  setTimeout(() => renderResults(), delay);
}

/* ─── Sparkle Effect (Canvas particle burst) ─────────────── */
function triggerSparkle(cardEl) {
  const canvas = document.createElement('canvas');
  canvas.className = 'sparkle-canvas';
  canvas.width  = cardEl.offsetWidth  || 100;
  canvas.height = cardEl.offsetHeight || 170;
  cardEl.appendChild(canvas);

  const ctx    = canvas.getContext('2d');
  const cx     = canvas.width / 2;
  const cy     = canvas.height / 2;
  const particles = [];
  const COLORS = ['#f0c87a','#d4a843','#fff9e0','#e879a0','#a78bfa','#ffffff'];

  for (let i = 0; i < 42; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 2.8 + 0.8;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r:  Math.random() * 3 + 1,
      alpha: 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      decay: Math.random() * 0.022 + 0.012,
    });
  }

  let frame;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.06; // gravity
      p.alpha -= p.decay;
      if (p.alpha <= 0) continue;
      alive = true;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      // Star shape at larger sizes
      if (p.r > 2) {
        ctx.globalAlpha = p.alpha * 0.4;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (alive) frame = requestAnimationFrame(animate);
    else canvas.remove();
  }
  animate();

  // Glow ring pulse on the card back/inner
  const inner = cardEl.querySelector('.card-inner');
  if (inner) {
    inner.style.boxShadow = '0 0 30px rgba(212,168,67,0.7), 0 0 60px rgba(212,168,67,0.3)';
    setTimeout(() => { inner.style.boxShadow = ''; }, 1400);
  }
}

/* ═══════════════════════════════════════════════════════════
   RESULTS RENDER
   ═══════════════════════════════════════════════════════════ */
function renderResults() {
  const cfg   = TOPIC_CONFIG[STATE.topic];
  const field = cfg.field;
  const labels = POS_LABELS[STATE.mode];

  DOM.resultsTitleText.textContent = `คำทำนายด้าน${cfg.label}`;
  DOM.resultsGrid.innerHTML = '';

  STATE.selected.forEach((drawn, i) => {
    const card     = drawn.card;
    const reversed = drawn.isReversed;
    const details  = reversed ? card.reversed : card.upright;

    // Filter to ONLY the chosen topic field (context-specific reading)
    const readingText = details[field] || details.general || '';

    const posLabel = sanitise(labels[i] || labels[0]);
    const cardName = sanitise(card.name);
    const thaiName = sanitise(card.thaiName);
    const text     = sanitise(readingText);
    const imgSrc   = sanitise(card.image);
    const dirLabel = reversed ? 'กลับหัว (Reversed)' : 'หัวตั้ง (Upright)';
    const dirClass = reversed ? 'reversed-badge' : 'upright';

    const html = `
      <div class="result-card" style="animation-delay:${i * 180}ms">
        <div class="result-card-image-wrap">
          <div class="result-pos-label">${posLabel}</div>
          <div class="result-card-img${reversed ? ' reversed' : ''}">
            <img src="${imgSrc}" alt="${cardName}" loading="lazy">
          </div>
          <span class="result-dir-badge ${dirClass}">${sanitise(dirLabel)}</span>
        </div>
        <div class="result-card-info">
          <div class="result-card-name">${cardName}</div>
          <div class="result-card-thainame">${thaiName}</div>
          <div class="reading-block">
            <div class="reading-topic-label">
              <i class="fa-solid ${cfg.icon}" style="color:${cfg.color}"></i>
              คำทำนายด้าน${sanitise(cfg.label)}
            </div>
            <p class="reading-text">${text}</p>
          </div>
        </div>
      </div>`;
    DOM.resultsGrid.insertAdjacentHTML('beforeend', html);
  });

  // Build synthesis summary
  renderSynthesis(field, cfg);

  showScreen('screenResults');
}

/* ─── Synthesis text (topic-specific) ───────────────────── */
function renderSynthesis(field, cfg) {
  const cards     = STATE.selected;
  const hasRev    = cards.some(c => c.isReversed);
  const cardNames = cards.map(c => c.card.name).join(', ');
  const isTriple  = STATE.mode === 'triple';
  const topic     = STATE.topic;

  const SYNTH = {
    love: {
      single: {
        pos: `ไพ่ชี้ว่าพลังงานแห่งความรักกำลังเปิดรับสิ่งใหม่ เป็นช่วงเวลาที่ดีในการแสดงความรู้สึกหรือเปิดโอกาสให้คนใหม่เข้ามา มีเกณฑ์พบรักที่มั่นคงและเข้าใจกัน`,
        rev: `ไพ่เตือนให้ลดทิฐิและความระแวงสงสัย อย่าปล่อยให้บาดแผลในอดีตปิดกั้นความรักใหม่ พยายามสื่อสารและเข้าอกเข้าใจกันมากขึ้น`,
      },
      triple: {
        pos: `เส้นทางความรักของคุณดำเนินไปอย่างสอดคล้องกลมกลืน พลังงานบวกจากอดีตส่งเสริมปัจจุบัน และมีเกณฑ์ปูรากฐานความรักที่สวยงามในอนาคต`,
        rev: `มีจุดติดขัดในเส้นทางความรัก เช่น ปมปัญหาในอดีตที่ยังไม่ปล่อยวาง แนะนำให้เคลียร์ใจและเปิดใจรับฟังกันเพื่ออนาคตที่ราบรื่น`,
      }
    },
    work: {
      single: {
        pos: `ทิศทางการงานอยู่ในช่วงเอื้ออำนวย มีแนวโน้มได้รับโอกาสใหม่หรือการยอมรับจากผู้บังคับบัญชา ความพยายามจะออกดอกผล`,
        rev: `ระวังการตัดสินใจผิดพลาดเรื่องสัญญาหรือความร่วมมือ ควรใจเย็น ทบทวนรายละเอียดก่อนลงมือ และอย่าตัดสินใจใหญ่โดยใช้อารมณ์`,
      },
      triple: {
        pos: `มีความก้าวหน้าและจังหวะโอกาสที่ดีงาม ได้รับการสนับสนุนและการวางแผนที่รอบคอบ ซึ่งจะนำพาความมั่นคงในสายอาชีพระยะยาว`,
        rev: `การเดินทางในสายอาชีพมีจุดติดขัดบางขั้นตอน ควรสะสางภาระเก่าและบริหารเวลาอย่างมีประสิทธิภาพเพื่อไม่ให้กระทบเป้าหมาย`,
      }
    },
    finance: {
      single: {
        pos: `การเงินมีทิศทางที่ดี มีโอกาสเพิ่มรายได้หรือพบช่องทางลงทุนที่เหมาะสม ใช้จ่ายอย่างรอบคอบและเก็บออมไว้สำหรับอนาคต`,
        rev: `ควรระวังการใช้จ่ายเกินตัวหรือลงทุนโดยขาดการศึกษาข้อมูล หลีกเลี่ยงการเสี่ยงโชคและตรวจสอบสัญญาทางการเงินอย่างละเอียด`,
      },
      triple: {
        pos: `การเงินเดินหน้าอย่างมั่นคง อดีตที่วางรากฐานดีส่งผลให้ปัจจุบันมีเสถียรภาพ และอนาคตมีโอกาสเติบโตทางการเงินที่น่าพอใจ`,
        rev: `มีแนวโน้มค่าใช้จ่ายไม่คาดคิดหรือการลงทุนที่ยังไม่ให้ผล แนะนำให้ทบทวนแผนการเงินและลดความเสี่ยงในช่วงนี้`,
      }
    },
    health: {
      single: {
        pos: `สุขภาพโดยรวมอยู่ในเกณฑ์ดี มีพลังงานและความสดใสในการดูแลตนเอง รักษาวินัยการนอนหลับและการออกกำลังกายอย่างสม่ำเสมอ`,
        rev: `ควรใส่ใจสัญญาณเตือนจากร่างกายและจิตใจ อย่าเพิกเฉยต่ออาการผิดปกติ พักผ่อนให้เพียงพอและลดความเครียดสะสม`,
      },
      triple: {
        pos: `เส้นทางสุขภาพดำเนินไปในทิศทางที่ดี การดูแลตนเองในอดีตส่งผลให้ปัจจุบันแข็งแรง และอนาคตมีพลังงานเพื่อต่อยอดเป้าหมายชีวิต`,
        rev: `ร่างกายกำลังส่งสัญญาณให้ใส่ใจมากขึ้น อย่าละเลยการตรวจสุขภาพประจำปีหรือการพักฟื้น ดูแลสุขภาพจิตควบคู่กับร่างกาย`,
      }
    }
  };

  const mode = isTriple ? 'triple' : 'single';
  const dir  = hasRev ? 'rev' : 'pos';
  const summary = SYNTH[topic]?.[mode]?.[dir] || '';

  const intro = isTriple
    ? `ไพ่ทั้ง 3 ใบ (${sanitise(cardNames)}) ชี้ให้เห็นความเชื่อมโยงของ${sanitise(cfg.label)}ตั้งแต่อดีตถึงอนาคต — `
    : `ไพ่ ${sanitise(cards[0].card.name)} ชี้ทางให้คุณในเรื่อง${sanitise(cfg.label)} — `;

  DOM.synthText.textContent = intro + summary;
  DOM.synthPanel.classList.remove('hidden');
}

