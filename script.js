/* ==========================================
   KBC JAIN DHARMA QUIZ — SCRIPT.JS
   Complete Game Logic
   ========================================== */

'use strict';

// ============================================================
// STATE
// ============================================================
let questions        = [];
let currentIndex     = 0;
let selectedOption   = -1;
let answered         = [];       // 'correct' | 'wrong' | 'skipped' | null per question
let score            = 0;
let correctCount     = 0;
let wrongCount       = 0;

let lifelineUsed = { '5050': false, 'poll': false, 'expert': false, 'pass': false };
let removedOptions   = [];       // indices hidden by 50:50

// Timer state
let timerMode        = 0;        // 0 = off
let timerValue       = 0;
let timerInterval    = null;
let timerMax         = 0;
let timerWarnPlayed  = false;

// Admin state
let adminPassword    = localStorage.getItem('kbc_admin_pw') || 'jain1234';
let adminLoggedIn    = false;

// ============================================================
// AUDIO HELPERS
// ============================================================
function playSound(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch(e) {}
}

function stopSound(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.pause();
  el.currentTime = 0;
}

function stopAllSounds() {
  ['snd-intro','snd-question','snd-suspense','snd-correct','snd-wrong','snd-lifeline','snd-winner','snd-timer-warn']
    .forEach(stopSound);
}

// ============================================================
// QUESTIONS LOADING
// ============================================================
async function loadQuestions() {
  // Try localStorage first (admin edits persist)
  const stored = localStorage.getItem('kbc_questions');
  if (stored) {
    try {
      questions = JSON.parse(stored);
      initGame();
      return;
    } catch(e) {}
  }
  // Load from JSON file
  try {
    const resp = await fetch('questions.json');
    if (!resp.ok) throw new Error('Failed');
    questions = await resp.json();
    localStorage.setItem('kbc_questions', JSON.stringify(questions));
    initGame();
  } catch(e) {
    questions = getFallbackQuestions();
    initGame();
  }
}

function getFallbackQuestions() {
  return [
    { question: "भगवान महावीर का जन्म कहाँ हुआ था?", options: ["पावापुरी","कुण्डलपुर","राजगृह","श्रवणबेलगोला"], correct: 1 },
    { question: "जैन धर्म में कितने तीर्थंकर हुए हैं?", options: ["12","20","24","28"], correct: 2 },
    { question: "जैन धर्म का प्रथम तीर्थंकर कौन थे?", options: ["महावीर","पार्श्वनाथ","नेमिनाथ","ऋषभदेव (आदिनाथ)"], correct: 3 }
  ];
}

// ============================================================
// INIT
// ============================================================
function initGame() {
  answered       = new Array(questions.length).fill(null);
  currentIndex   = 0;
  selectedOption = -1;
  score          = 0;
  correctCount   = 0;
  wrongCount     = 0;
  lifelineUsed   = { '5050': false, 'poll': false, 'expert': false, 'pass': false };
  removedOptions = [];

  updateScoreboard();
  buildNavGrid();
  loadQuestion(0);
  initBackground();
  initParticles();
  resetLifelines();
  stopAllSounds();
  setTimeout(() => playSound('snd-intro'), 300);
}

function resetGame() {
  document.getElementById('result-screen').classList.remove('active');
  stopAllSounds();
  initGame();
}

// ============================================================
// QUESTION DISPLAY
// ============================================================
function loadQuestion(index) {
  if (index < 0 || index >= questions.length) return;
  currentIndex   = index;
  selectedOption = -1;
  removedOptions = [];

  const q    = questions[index];
  const card = document.getElementById('question-card');

  // Animate in
  card.style.opacity = '0';
  card.style.transform = 'translateY(12px)';
  setTimeout(() => {
    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    card.style.opacity    = '1';
    card.style.transform  = 'translateY(0)';
  }, 30);

  document.getElementById('question-text').textContent = q.question;

  const letters = ['A','B','C','D'];
  for (let i = 0; i < 4; i++) {
    const btn  = document.getElementById(`opt-${i}`);
    const txt  = document.getElementById(`opt-text-${i}`);
    const lett = btn.querySelector('.option-letter');
    txt.textContent     = q.options[i] || '—';
    lett.textContent    = letters[i];
    btn.className       = 'option-btn';
    btn.disabled        = false;
    btn.style.animation = 'none';
    btn.style.opacity   = '1';
    btn.style.filter    = 'none';
    void btn.offsetWidth;
    btn.style.animation = '';
  }

  hideLockConfirmation();
  updateCounter();
  updateNavGrid();
  updateProgress();
  updateNavButtons();
  stopTimer();

  if (timerMode > 0) startTimer(timerMode);

  playSound('snd-question');

  // If already answered, show result state
  const prev = answered[index];
  if (prev === 'correct' || prev === 'wrong') {
    showAnswerState(index);
    disableOptions();
  }
  if (prev === 'skipped') {
    disableOptions();
  }
}

function showAnswerState(index) {
  const q    = questions[index];
  const hist = answered[index];
  // We don't know which option was picked (not stored), so just highlight correct
  const correctBtn = document.getElementById(`opt-${q.correct}`);
  correctBtn.classList.add('correct');
  correctBtn.disabled = true;
}

// ============================================================
// OPTION SELECTION
// ============================================================
function selectOption(index) {
  if (answered[currentIndex] !== null) return;

  // Deselect previous
  if (selectedOption !== -1) {
    const prev = document.getElementById(`opt-${selectedOption}`);
    if (prev) prev.classList.remove('selected');
  }

  selectedOption = index;
  const btn = document.getElementById(`opt-${index}`);
  btn.classList.add('selected');

  showLockConfirmation();
}

function showLockConfirmation() {
  const conf = document.getElementById('lock-confirmation');
  conf.classList.add('visible');
}

function hideLockConfirmation() {
  document.getElementById('lock-confirmation').classList.remove('visible');
}

function cancelLock() {
  hideLockConfirmation();
  if (selectedOption !== -1) {
    const btn = document.getElementById(`opt-${selectedOption}`);
    if (btn) btn.classList.remove('selected');
  }
  selectedOption = -1;
}

function confirmLock() {
  if (selectedOption === -1) return;
  hideLockConfirmation();
  stopTimer();
  showSuspense();
}

// ============================================================
// SUSPENSE + REVEAL
// ============================================================
function showSuspense() {
  const overlay = document.getElementById('suspense-overlay');
  const text    = document.getElementById('suspense-text');
  overlay.classList.add('active');
  playSound('snd-suspense');

  const messages = ['सोच रहे हैं…', 'जाँच रहे हैं…', 'उत्तर आ रहा है…'];
  let mi = 0;
  const msgInterval = setInterval(() => {
    text.textContent = messages[mi % messages.length];
    mi++;
  }, 800);

  setTimeout(() => {
    clearInterval(msgInterval);
    overlay.classList.remove('active');
    stopSound('snd-suspense');
    revealAnswer();
  }, 3000);
}

function revealAnswer() {
  const q    = questions[currentIndex];
  const isCorrect = (selectedOption === q.correct);

  disableOptions();

  if (isCorrect) {
    answered[currentIndex] = 'correct';
    score       += getPointsForQuestion(currentIndex);
    correctCount++;

    document.getElementById(`opt-${selectedOption}`).classList.remove('selected');
    document.getElementById(`opt-${selectedOption}`).classList.add('correct');

    stopSound('snd-question');
    playSound('snd-correct');
    launchConfetti();
    showToast('✅ शाबाश! सही उत्तर!');
  } else {
    answered[currentIndex] = 'wrong';
    wrongCount++;

    document.getElementById(`opt-${selectedOption}`).classList.remove('selected');
    document.getElementById(`opt-${selectedOption}`).classList.add('wrong');
    document.getElementById(`opt-${q.correct}`).classList.add('correct');

    stopSound('snd-question');
    playSound('snd-wrong');
    showToast('❌ गलत उत्तर! सही था: ' + String.fromCharCode(65 + q.correct));
  }

  updateScoreboard();
  updateNavGrid();
  selectedOption = -1;
}

function getPointsForQuestion(index) {
  // Tiered scoring: earlier questions = lower points
  const tier = Math.floor(index / 5);
  return [100, 200, 500, 1000][tier] || 1000;
}

function disableOptions() {
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`opt-${i}`);
    if (btn) { btn.disabled = true; btn.classList.add('disabled'); }
  }
}

// ============================================================
// NAVIGATION
// ============================================================
function nextQuestion() {
  if (currentIndex < questions.length - 1) {
    loadQuestion(currentIndex + 1);
  } else {
    showResult();
  }
}

function prevQuestion() {
  if (currentIndex > 0) {
    loadQuestion(currentIndex - 1);
  }
}

function randomQuestion() {
  const unanswered = questions.map((_, i) => i).filter(i => answered[i] === null);
  if (unanswered.length === 0) { showToast('सभी प्रश्न हल हो गए! 🎉'); return; }
  const rand = unanswered[Math.floor(Math.random() * unanswered.length)];
  loadQuestion(rand);
}

function goToQuestion(index) { loadQuestion(index); }

function updateNavButtons() {
  document.getElementById('btn-prev').disabled = (currentIndex === 0);
  document.getElementById('btn-next').textContent =
    currentIndex === questions.length - 1 ? '🏁 परिणाम' : 'अगला ▶';
}

// ============================================================
// UI UPDATES
// ============================================================
function updateScoreboard() {
  document.getElementById('score-display').textContent   = score;
  document.getElementById('correct-display').textContent = correctCount;
  document.getElementById('wrong-display').textContent   = wrongCount;
  const pct = (correctCount + wrongCount) > 0
    ? Math.round((correctCount / (correctCount + wrongCount)) * 100) + '%'
    : '0%';
  document.getElementById('pct-display').textContent = pct;
}

function updateCounter() {
  document.getElementById('q-counter').textContent =
    `प्रश्न ${currentIndex + 1} / ${questions.length}`;
}

function updateProgress() {
  const pct = ((currentIndex + 1) / questions.length) * 100;
  document.getElementById('q-progress-fill').style.width = pct + '%';
}

function buildNavGrid() {
  const grid = document.getElementById('q-nav-grid');
  grid.innerHTML = '';
  questions.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className   = 'q-nav-dot';
    dot.textContent = i + 1;
    dot.onclick     = () => goToQuestion(i);
    dot.id          = `nav-dot-${i}`;
    grid.appendChild(dot);
  });
}

function updateNavGrid() {
  questions.forEach((_, i) => {
    const dot = document.getElementById(`nav-dot-${i}`);
    if (!dot) return;
    dot.className = 'q-nav-dot';
    if (i === currentIndex)         dot.classList.add('current');
    if (answered[i] === 'correct')  dot.classList.add('answered-correct');
    if (answered[i] === 'wrong')    dot.classList.add('answered-wrong');
    if (answered[i] === 'skipped')  dot.classList.add('skipped');
  });
}

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), duration);
}

// ============================================================
// LIFELINES
// ============================================================
function resetLifelines() {
  ['5050','poll','expert','pass'].forEach(id => {
    lifelineUsed[id] = false;
    const btn = document.getElementById(`ll-${id}`);
    if (btn) btn.classList.remove('used');
  });
}

function markLifelineUsed(id) {
  lifelineUsed[id] = true;
  const btn = document.getElementById(`ll-${id}`);
  if (btn) btn.classList.add('used');
  playSound('snd-lifeline');
}

function use5050() {
  if (lifelineUsed['5050'] || answered[currentIndex] !== null) return;
  if (selectedOption !== -1) { showToast('पहले चयन रद्द करें'); return; }

  const q       = questions[currentIndex];
  const wrong   = [0,1,2,3].filter(i => i !== q.correct);
  const toHide  = wrong.sort(() => Math.random() - 0.5).slice(0, 2);

  toHide.forEach(i => {
    const btn = document.getElementById(`opt-${i}`);
    btn.classList.add('removed');
    btn.disabled = true;
  });

  removedOptions = toHide;
  markLifelineUsed('5050');
  showToast('50:50 — दो गलत विकल्प हटाए गए!');
}

function useAudiencePoll() {
  if (lifelineUsed['poll'] || answered[currentIndex] !== null) return;

  const q        = questions[currentIndex];
  const letters  = ['A','B','C','D'];
  const base     = [8, 7, 5, 10];         // random noise
  let   correct  = 55 + Math.floor(Math.random() * 20); // correct gets ~55-75%
  let   rest     = 100 - correct;

  const others = [0,1,2,3].filter(i => i !== q.correct);
  const splits = splitRandom(rest, 3);
  const data   = [0,0,0,0];
  data[q.correct] = correct;
  others.forEach((idx, j) => { data[idx] = splits[j]; });

  const overlay = document.getElementById('poll-overlay');
  const bars    = document.getElementById('poll-bars');
  bars.innerHTML = '';

  data.forEach((pct, i) => {
    const row = document.createElement('div');
    row.className = 'poll-row';
    row.innerHTML = `
      <span class="poll-label">${letters[i]}</span>
      <div class="poll-bar-track">
        <div class="poll-bar-fill ${i === q.correct ? 'winner' : ''}" data-pct="${pct}">
          <span class="poll-pct">0%</span>
        </div>
      </div>
    `;
    bars.appendChild(row);
  });

  overlay.classList.add('visible');
  markLifelineUsed('poll');

  // Animate bars
  setTimeout(() => {
    bars.querySelectorAll('.poll-bar-fill').forEach(fill => {
      const pct = fill.dataset.pct;
      fill.style.width = pct + '%';
      fill.querySelector('.poll-pct').textContent = pct + '%';
    });
  }, 100);
}

function splitRandom(total, n) {
  const parts = [];
  let rem = total;
  for (let i = 0; i < n - 1; i++) {
    const p = Math.floor(Math.random() * (rem - (n - i - 1))) + 1;
    parts.push(p); rem -= p;
  }
  parts.push(rem);
  return parts;
}

function closePoll() { document.getElementById('poll-overlay').classList.remove('visible'); }

function useExpert() {
  if (lifelineUsed['expert'] || answered[currentIndex] !== null) return;

  const q       = questions[currentIndex];
  const letters = ['A','B','C','D'];
  // Expert has ~80% chance of being correct
  const isCorrect = Math.random() < 0.8;
  const wrong   = [0,1,2,3].filter(i => i !== q.correct);
  const suggestion = isCorrect ? q.correct : wrong[Math.floor(Math.random() * wrong.length)];

  document.getElementById('expert-suggestion').textContent =
    `विकल्प ${letters[suggestion]}: "${q.options[suggestion]}"`;

  document.getElementById('expert-overlay').classList.add('visible');
  markLifelineUsed('expert');
}

function closeExpert() { document.getElementById('expert-overlay').classList.remove('visible'); }

function usePass() {
  if (lifelineUsed['pass'] || answered[currentIndex] !== null) return;

  answered[currentIndex] = 'skipped';
  markLifelineUsed('pass');
  disableOptions();
  hideLockConfirmation();
  selectedOption = -1;
  updateNavGrid();
  showToast('प्रश्न छोड़ा गया — स्कोर सुरक्षित है!');

  setTimeout(() => {
    if (currentIndex < questions.length - 1) nextQuestion();
  }, 1200);
}

// ============================================================
// TIMER
// ============================================================
const CIRCUMFERENCE = 2 * Math.PI * 34; // r=34

function setTimer(seconds) {
  timerMode = seconds;
  ['off','30','60','90'].forEach(v => {
    const btn = document.getElementById(`tb-${v}`);
    if (btn) btn.classList.toggle('active', (v === 'off' ? 0 : parseInt(v)) === seconds);
  });
  stopTimer();
  if (seconds > 0) {
    startTimer(seconds);
  } else {
    document.getElementById('timer-number').textContent = '—';
    document.getElementById('timer-ring').style.strokeDashoffset = '0';
    document.getElementById('timer-circle').className = 'timer-circle';
  }
}

function startTimer(seconds) {
  timerMax         = seconds;
  timerValue       = seconds;
  timerWarnPlayed  = false;

  updateTimerDisplay(seconds, seconds);

  timerInterval = setInterval(() => {
    timerValue--;
    updateTimerDisplay(timerValue, timerMax);

    if (timerValue <= 10 && !timerWarnPlayed) {
      timerWarnPlayed = true;
      playSound('snd-timer-warn');
    }

    if (timerValue <= 0) {
      stopTimer();
      handleTimerExpiry();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateTimerDisplay(val, max) {
  const ring    = document.getElementById('timer-ring');
  const numEl   = document.getElementById('timer-number');
  const circle  = document.getElementById('timer-circle');
  const ratio   = Math.max(val / max, 0);
  const offset  = CIRCUMFERENCE * (1 - ratio);

  ring.style.strokeDasharray  = CIRCUMFERENCE;
  ring.style.strokeDashoffset = offset;
  numEl.textContent            = val;

  circle.className = 'timer-circle';
  if (val <= Math.floor(max * 0.25)) circle.classList.add('danger');
  else if (val <= Math.floor(max * 0.5)) circle.classList.add('warning');
}

function handleTimerExpiry() {
  if (answered[currentIndex] !== null) return;
  showToast('⏰ समय समाप्त! अगला प्रश्न...');
  answered[currentIndex] = 'wrong';

  const q = questions[currentIndex];
  document.getElementById(`opt-${q.correct}`).classList.add('correct');
  disableOptions();
  wrongCount++;
  updateScoreboard();
  updateNavGrid();

  stopSound('snd-question');
  playSound('snd-wrong');

  setTimeout(() => {
    if (currentIndex < questions.length - 1) nextQuestion();
    else showResult();
  }, 2000);
}

// ============================================================
// RESULT SCREEN
// ============================================================
function showResult() {
  stopTimer();
  stopAllSounds();

  const total    = correctCount + wrongCount;
  const pct      = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const answered_ = questions.length - answered.filter(a => a === null).length;

  document.getElementById('r-score').textContent   = score;
  document.getElementById('r-correct').textContent = correctCount;
  document.getElementById('r-wrong').textContent   = wrongCount;
  document.getElementById('r-pct').textContent     = pct + '%';

  let msg = '', title = '', trophy = '🏆';

  if (pct >= 90) {
    title  = 'अद्भुत! महापण्डित!';
    msg    = 'आपने असाधारण ज्ञान का परिचय दिया। भगवान महावीर आपको आशीर्वाद दें! 🙏';
    trophy = '🥇';
    playSound('snd-winner');
    launchFireworks();
    launchConfetti();
  } else if (pct >= 70) {
    title  = 'शाबाश! उत्तम प्रदर्शन!';
    msg    = 'आपको जैन धर्म का बहुत अच्छा ज्ञान है। अभ्यास जारी रखें! 🌸';
    trophy = '🥈';
    playSound('snd-correct');
    launchConfetti();
  } else if (pct >= 50) {
    title  = 'अच्छा प्रयास!';
    msg    = 'अभी और अध्ययन की आवश्यकता है। जैन आगमों का अध्ययन करें! 📖';
    trophy = '🥉';
  } else {
    title  = 'प्रयास सराहनीय है!';
    msg    = 'जैन धर्म के ग्रंथ पढ़ें और फिर प्रयास करें। ज्ञान ही मोक्ष का मार्ग है! 🙏';
    trophy = '📚';
  }

  document.getElementById('result-trophy').textContent   = trophy;
  document.getElementById('result-title').textContent    = title;
  document.getElementById('result-subtitle').textContent = `${answered_} में से ${questions.length} प्रश्नों का उत्तर दिया`;
  document.getElementById('result-msg').textContent      = msg;

  document.getElementById('result-screen').classList.add('active');
}

// ============================================================
// CONFETTI & FIREWORKS
// ============================================================
const CONFETTI_COLORS = ['#FFD700','#FF6D00','#00E676','#00E5FF','#FF1744','#E040FB','#FFEB3B','#FF4081'];

function launchConfetti() {
  const container = document.getElementById('confetti-container');
  for (let i = 0; i < 80; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetto';
      const size  = 6 + Math.random() * 10;
      const left  = Math.random() * 100;
      const dur   = 2 + Math.random() * 2;
      const drift = (Math.random() - 0.5) * 200;
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

      el.style.cssText = `
        left: ${left}%;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        --drift: ${drift}px;
        animation-duration: ${dur}s;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      `;
      container.appendChild(el);
      setTimeout(() => el.remove(), dur * 1000 + 200);
    }, i * 30);
  }
}

function launchFireworks() {
  const container = document.getElementById('confetti-container');
  for (let b = 0; b < 5; b++) {
    setTimeout(() => {
      const cx  = 20 + Math.random() * 60;
      const cy  = 10 + Math.random() * 50;
      for (let p = 0; p < 20; p++) {
        const el    = document.createElement('div');
        el.className = 'firework';
        const angle  = (p / 20) * Math.PI * 2;
        const dist   = 60 + Math.random() * 80;
        const fx     = Math.cos(angle) * dist;
        const fy     = Math.sin(angle) * dist;
        const color  = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

        el.style.cssText = `
          left: ${cx}%; top: ${cy}%;
          background: ${color};
          --fx: ${fx}px; --fy: ${fy}px;
          animation-duration: ${0.6 + Math.random() * 0.4}s;
        `;
        container.appendChild(el);
        setTimeout(() => el.remove(), 1200);
      }
    }, b * 300);
  }
}

// ============================================================
// ANIMATED BACKGROUND (starfield)
// ============================================================
function initBackground() {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let   W, H, stars = [], animFrame;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.3 + Math.random() * 1.5,
      speed: 0.05 + Math.random() * 0.15,
      opacity: 0.1 + Math.random() * 0.7,
      pulse: Math.random() * Math.PI * 2
    }));
  }

  function draw(ts) {
    ctx.clearRect(0, 0, W, H);

    // Deep navy radial gradient
    const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H) * 0.8);
    grad.addColorStop(0,   'rgba(7,32,80,0.6)');
    grad.addColorStop(0.5, 'rgba(4,21,51,0.4)');
    grad.addColorStop(1,   'rgba(2,11,28,0.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Stars
    stars.forEach(s => {
      s.pulse += 0.02;
      const op = s.opacity * (0.6 + 0.4 * Math.sin(s.pulse));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,215,0,${op})`;
      ctx.fill();
      s.y -= s.speed;
      if (s.y < -5) { s.y = H + 5; s.x = Math.random() * W; }
    });

    animFrame = requestAnimationFrame(draw);
  }

  if (animFrame) cancelAnimationFrame(animFrame);
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(draw);
}

// ============================================================
// FLOATING PARTICLES
// ============================================================
function initParticles() {
  const container = document.getElementById('particles-container');
  container.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    const p    = document.createElement('div');
    p.className = 'particle';
    const size = 2 + Math.random() * 4;
    const dur  = 8 + Math.random() * 12;
    const left = Math.random() * 100;
    const delay= Math.random() * 10;
    const hue  = Math.random() > 0.5 ? 'rgba(255,215,0' : 'rgba(0,229,255';
    p.style.cssText = `
      width: ${size}px; height: ${size}px;
      left: ${left}%;
      background: ${hue},0.6);
      animation-duration: ${dur}s;
      animation-delay: ${delay}s;
    `;
    container.appendChild(p);
  }
}

// ============================================================
// FULLSCREEN
// ============================================================
document.getElementById('fullscreen-btn').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    document.getElementById('fullscreen-btn').textContent = '✕';
  } else {
    document.exitFullscreen();
    document.getElementById('fullscreen-btn').textContent = '⛶';
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    document.getElementById('fullscreen-btn').textContent = '⛶';
  }
});

// ============================================================
// ADMIN PANEL
// ============================================================
function openAdmin() {
  document.getElementById('admin-modal').classList.add('active');
  document.getElementById('admin-login-screen').style.display    = adminLoggedIn ? 'none' : 'block';
  document.getElementById('admin-panel-content').style.display   = adminLoggedIn ? 'block' : 'none';
  document.getElementById('admin-pw-input').value = '';
  if (adminLoggedIn) renderAdminList();
}

function closeAdmin() {
  document.getElementById('admin-modal').classList.remove('active');
}

function adminLogin() {
  const pw = document.getElementById('admin-pw-input').value;
  if (pw === adminPassword) {
    adminLoggedIn = true;
    document.getElementById('admin-login-screen').style.display   = 'none';
    document.getElementById('admin-panel-content').style.display  = 'block';
    renderAdminList();
  } else {
    const input = document.getElementById('admin-pw-input');
    input.style.borderColor = 'var(--red-wrong)';
    input.style.animation   = 'shakeAnim 0.5s ease';
    setTimeout(() => {
      input.style.borderColor = '';
      input.style.animation   = '';
    }, 600);
  }
}

function changePassword() {
  const val = document.getElementById('new-pw').value.trim();
  if (!val || val.length < 4) { showToast('पासवर्ड कम से कम 4 अक्षर का होना चाहिए'); return; }
  adminPassword = val;
  localStorage.setItem('kbc_admin_pw', val);
  document.getElementById('new-pw').value = '';
  showToast('✅ पासवर्ड बदला गया!');
}

function renderAdminList() {
  const list = document.getElementById('admin-questions-list');
  document.getElementById('q-count-admin').textContent = questions.length;
  list.innerHTML = '';

  questions.forEach((q, i) => {
    const row = document.createElement('div');
    row.className  = 'admin-q-row';
    row.innerHTML  = `
      <span class="admin-q-num">Q${i+1}</span>
      <span class="admin-q-text">${q.question}</span>
      <div class="admin-q-actions">
        <button class="admin-q-btn edit" onclick="editQuestion(${i})">✏</button>
        <button class="admin-q-btn delete" onclick="deleteQuestion(${i})">🗑</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function editQuestion(i) {
  const q = questions[i];
  document.getElementById('edit-index').value     = i;
  document.getElementById('q-input').value        = q.question;
  document.getElementById('o0-input').value       = q.options[0] || '';
  document.getElementById('o1-input').value       = q.options[1] || '';
  document.getElementById('o2-input').value       = q.options[2] || '';
  document.getElementById('o3-input').value       = q.options[3] || '';
  document.getElementById('correct-select').value = q.correct;
  document.getElementById('q-input').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('q-input').focus();
}

function deleteQuestion(i) {
  if (!confirm(`प्रश्न ${i+1} हटाएं?`)) return;
  questions.splice(i, 1);
  answered.splice(i, 1);
  saveQuestionsToStorage();
  renderAdminList();
  buildNavGrid();
  if (currentIndex >= questions.length) currentIndex = Math.max(0, questions.length - 1);
  if (questions.length > 0) loadQuestion(currentIndex);
  showToast('प्रश्न हटाया गया।');
}

function saveQuestion() {
  const qText = document.getElementById('q-input').value.trim();
  if (!qText) { showToast('प्रश्न लिखें!'); return; }

  const opts = [
    document.getElementById('o0-input').value.trim(),
    document.getElementById('o1-input').value.trim(),
    document.getElementById('o2-input').value.trim(),
    document.getElementById('o3-input').value.trim()
  ];

  if (opts.some(o => !o)) { showToast('सभी विकल्प भरें!'); return; }

  const correct = parseInt(document.getElementById('correct-select').value);
  const editIdx = parseInt(document.getElementById('edit-index').value);

  const newQ = { question: qText, options: opts, correct };

  if (editIdx >= 0 && editIdx < questions.length) {
    questions[editIdx] = newQ;
    showToast('✅ प्रश्न अपडेट किया!');
  } else {
    questions.push(newQ);
    answered.push(null);
    showToast('✅ नया प्रश्न जोड़ा!');
  }

  saveQuestionsToStorage();
  clearForm();
  renderAdminList();
  buildNavGrid();
  updateCounter();
  updateProgress();
}

function clearForm() {
  document.getElementById('edit-index').value     = -1;
  document.getElementById('q-input').value        = '';
  document.getElementById('o0-input').value       = '';
  document.getElementById('o1-input').value       = '';
  document.getElementById('o2-input').value       = '';
  document.getElementById('o3-input').value       = '';
  document.getElementById('correct-select').value = 0;
}

function saveQuestionsToStorage() {
  localStorage.setItem('kbc_questions', JSON.stringify(questions));
}

function downloadJSON() {
  const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'questions.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ JSON डाउनलोड हो रहा है...');
}

function uploadJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Invalid');
      // Basic validation
      data.forEach((q, i) => {
        if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correct !== 'number')
          throw new Error(`Q${i+1} invalid format`);
      });
      questions = data;
      answered  = new Array(questions.length).fill(null);
      saveQuestionsToStorage();
      renderAdminList();
      buildNavGrid();
      loadQuestion(0);
      showToast(`✅ ${questions.length} प्रश्न लोड किए!`);
    } catch(err) {
      showToast('❌ JSON फ़ाइल अमान्य है: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', e => {
  // Only if not in admin modal / input focused
  if (document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA') return;
  if (document.getElementById('admin-modal').classList.contains('active')) return;

  switch(e.key) {
    case 'ArrowRight': nextQuestion(); break;
    case 'ArrowLeft':  prevQuestion(); break;
    case 'a': case 'A': selectOption(0); break;
    case 'b': case 'B': selectOption(1); break;
    case 'c': case 'C': selectOption(2); break;
    case 'd': case 'D': selectOption(3); break;
    case 'Enter':
      if (document.getElementById('lock-confirmation').classList.contains('visible')) confirmLock();
      break;
    case 'Escape':
      cancelLock();
      closePoll();
      closeExpert();
      break;
    case 'f': case 'F':
      document.getElementById('fullscreen-btn').click(); break;
    case 'r': case 'R': randomQuestion(); break;
  }
});

// ============================================================
// BOOT
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  loadQuestions();
});