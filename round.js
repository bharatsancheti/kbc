/* ==========================================
   ROUNDS.JS — Round Management Logic
   Round Selector, Rapid Fire, Audio Visual
   ========================================== */

'use strict';

// ============================================================
// GLOBAL ROUND STATE
// ============================================================
let currentRound   = null;   // 'round1A' | 'round1B' | 'rapidfire' | 'audiovisual'
let roundOrder     = ['round1A', 'round1B', 'rapidfire', 'audiovisual'];

// Persistent scores across rounds
let globalScore    = parseInt(localStorage.getItem('kbc_global_score')   || '0');
let globalCorrect  = parseInt(localStorage.getItem('kbc_global_correct') || '0');
let globalWrong    = parseInt(localStorage.getItem('kbc_global_wrong')   || '0');

// Per-round question data
let questionsR1A   = [];
let questionsR1B   = [];
let questionsRF    = [];
let questionsAV    = [];

// Rapid Fire state
let rfIndex        = 0;
let rfCorrect      = 0;
let rfWrong        = 0;
let rfTimer        = null;
let rfTimeLeft     = 10;
let rfAnswered     = false;

// Audio Visual state
let avIndex        = 0;
let avCorrect      = 0;
let avWrong        = 0;
let avSelected     = -1;
let avAnswered     = false;
let avAudioPlayed  = false;

// Admin active round for editing
let adminEditRound = 'round1A';

// ============================================================
// BOOT — load all question sets
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  await loadAllQuestions();
  updateRSScoreboard();
  initBackground();
  initParticles();
  stopAllSounds();
  setTimeout(() => playSound('snd-intro'), 400);
});

async function loadAllQuestions() {
  questionsR1A = await fetchQuestions('questions_round1.json',  'kbc_q_r1a',  getSampleR1A());
  questionsR1B = await fetchQuestions('questions_round1b.json', 'kbc_q_r1b',  getSampleR1B());
  questionsRF  = await fetchQuestions('questions_rapid.json',   'kbc_q_rf',   getSampleRF());
  questionsAV  = await fetchQuestions('questions_av.json',      'kbc_q_av',   getSampleAV());
}

async function fetchQuestions(file, storageKey, fallback) {
  const stored = localStorage.getItem(storageKey);
  if (stored) { try { return JSON.parse(stored); } catch(e) {} }
  try {
    const r = await fetch(file);
    if (!r.ok) throw new Error();
    const data = await r.json();
    localStorage.setItem(storageKey, JSON.stringify(data));
    return data;
  } catch(e) { return fallback; }
}

// ============================================================
// ROUND SELECTOR
// ============================================================
function showRoundSelector() {
  hideAllScreens();
  document.getElementById('round-selector').style.display = 'flex';
  stopAllSounds();
  setTimeout(() => playSound('snd-intro'), 200);
  updateRSScoreboard();
}

function updateRSScoreboard() {
  document.getElementById('rs-total-score').textContent = globalScore;
  document.getElementById('rs-correct').textContent     = globalCorrect;
  document.getElementById('rs-wrong').textContent       = globalWrong;
}

function resetAllScores() {
  if (!confirm('सभी scores reset करें?')) return;
  globalScore = globalCorrect = globalWrong = 0;
  saveGlobalScores();
  updateRSScoreboard();
  showToast('✅ Scores reset!');
}

function saveGlobalScores() {
  localStorage.setItem('kbc_global_score',   globalScore);
  localStorage.setItem('kbc_global_correct', globalCorrect);
  localStorage.setItem('kbc_global_wrong',   globalWrong);
}

// ============================================================
// START ROUND
// ============================================================
function startRound(roundId) {
  currentRound = roundId;
  stopAllSounds();
  hideAllScreens();

  if (roundId === 'round1A') {
    questions = questionsR1A;
    document.getElementById('kbc-round-badge').textContent = 'ROUND 1 — A';
    document.getElementById('kbc-game').style.display = 'block';
    initKBCRound();
  } else if (roundId === 'round1B') {
    questions = questionsR1B;
    document.getElementById('kbc-round-badge').textContent = 'ROUND 1 — B';
    document.getElementById('kbc-game').style.display = 'block';
    initKBCRound();
  } else if (roundId === 'rapidfire') {
    document.getElementById('rapid-game').style.display = 'flex';
    initRapidFire();
  } else if (roundId === 'audiovisual') {
    document.getElementById('av-game').style.display = 'flex';
    initAudioVisual();
  }
}

function hideAllScreens() {
  document.getElementById('round-selector').style.display   = 'none';
  document.getElementById('kbc-game').style.display         = 'none';
  document.getElementById('rapid-game').style.display       = 'none';
  document.getElementById('av-game').style.display          = 'none';
  document.getElementById('round-result-overlay').classList.remove('active');
  document.getElementById('result-screen').classList.remove('active');
}

// ============================================================
// KBC ROUND (Normal) — reuse existing script.js logic
// ============================================================
function initKBCRound() {
  answered       = new Array(questions.length).fill(null);
  currentIndex   = 0;
  selectedOption = -1;
  score          = 0;
  correctCount   = 0;
  wrongCount     = 0;
  lifelineUsed   = { '5050':false, 'poll':false, 'expert':false, 'pass':false };
  removedOptions = [];
  resetLifelines();
  updateScoreboard();
  buildNavGrid();
  loadQuestion(0);
  stopTimer();
  stopAllSounds();
  setTimeout(() => playSound('snd-question'), 300);
}

// Override endCurrentRound (called from nav button in KBC game)
function endCurrentRound() {
  stopTimer();
  stopAllSounds();
  // Add to global scores
  globalScore   += score;
  globalCorrect += correctCount;
  globalWrong   += wrongCount;
  saveGlobalScores();
  showRoundResult(currentRound, score, correctCount, wrongCount);
}

function confirmBackToMenu() {
  if (confirm('Round छोड़कर Menu पर जाएं? Progress खो जाएगी।')) {
    stopTimer();
    stopAllSounds();
    if (rfTimer) clearInterval(rfTimer);
    showRoundSelector();
  }
}

// ============================================================
// SHOW ROUND RESULT
// ============================================================
function showRoundResult(roundId, sc, cor, wr) {
  const total  = cor + wr;
  const pct    = total > 0 ? Math.round(cor / total * 100) : 0;

  const roundNames = {
    round1A: 'Round 1 — A', round1B: 'Round 1 — B',
    rapidfire: 'Rapid Fire Round', audiovisual: 'Audio Visual Round'
  };

  let trophy = '🏅';
  if (pct >= 80) { trophy = '🥇'; launchConfetti(); playSound('snd-winner'); }
  else if (pct >= 60) { trophy = '🥈'; playSound('snd-correct'); }
  else trophy = '🥉';

  document.getElementById('rr-trophy').textContent = trophy;
  document.getElementById('rr-title').textContent  = roundNames[roundId] + ' — Complete!';

  document.getElementById('rr-stats').innerHTML = `
    <div class="rr-stat"><div class="rr-stat-val">${sc}</div><div class="rr-stat-lbl">Score</div></div>
    <div class="rr-stat green"><div class="rr-stat-val">${cor}</div><div class="rr-stat-lbl">सही ✅</div></div>
    <div class="rr-stat red"><div class="rr-stat-val">${wr}</div><div class="rr-stat-lbl">गलत ❌</div></div>
    <div class="rr-stat cyan"><div class="rr-stat-val">${pct}%</div><div class="rr-stat-lbl">% Score</div></div>
  `;

  // Next round button
  const idx     = roundOrder.indexOf(roundId);
  const nextBtn = document.getElementById('rr-next-btn');
  const nextNames = { round1A:'Round 1B ▶', round1B:'Rapid Fire ▶', rapidfire:'Audio Visual ▶', audiovisual:'परिणाम देखें' };
  nextBtn.textContent = nextNames[roundId] || '🏁 Final Result';

  document.getElementById('round-result-overlay').classList.add('active');
}

function goToRoundSelector() {
  document.getElementById('round-result-overlay').classList.remove('active');
  showRoundSelector();
}

function goNextRound() {
  document.getElementById('round-result-overlay').classList.remove('active');
  const idx = roundOrder.indexOf(currentRound);
  if (idx < roundOrder.length - 1) {
    startRound(roundOrder[idx + 1]);
  } else {
    showFinalResult();
  }
}

function showFinalResult() {
  hideAllScreens();
  const total = globalCorrect + globalWrong;
  const pct   = total > 0 ? Math.round(globalCorrect / total * 100) : 0;

  document.getElementById('r-score').textContent   = globalScore;
  document.getElementById('r-correct').textContent = globalCorrect;
  document.getElementById('r-wrong').textContent   = globalWrong;
  document.getElementById('r-pct').textContent     = pct + '%';

  let title = '', msg = '', trophy = '🏆';
  if (pct >= 85) {
    title = 'महापण्डित! अद्भुत!';
    msg   = 'आपने सभी rounds में शानदार प्रदर्शन किया। भगवान महावीर आपको आशीर्वाद दें! 🙏';
    trophy = '🥇'; launchConfetti(); launchFireworks(); playSound('snd-winner');
  } else if (pct >= 65) {
    title = 'शाबाश! उत्तम प्रदर्शन!';
    msg   = 'आपको जैन धर्म का बहुत अच्छा ज्ञान है! 🌸';
    trophy = '🥈'; launchConfetti(); playSound('snd-correct');
  } else {
    title = 'अच्छा प्रयास!';
    msg   = 'जैन आगमों का अध्ययन करें और फिर प्रयास करें! 📖';
    trophy = '📚';
  }

  document.getElementById('result-trophy').textContent   = trophy;
  document.getElementById('result-title').textContent    = title;
  document.getElementById('result-subtitle').textContent = 'सभी Rounds की कुल Score';
  document.getElementById('result-msg').textContent      = msg;
  document.getElementById('result-screen').classList.add('active');
}

function fullReset() {
  globalScore = globalCorrect = globalWrong = 0;
  saveGlobalScores();
  document.getElementById('result-screen').classList.remove('active');
  stopAllSounds();
  showRoundSelector();
}

// ============================================================
// RAPID FIRE ROUND
// ============================================================
function initRapidFire() {
  rfIndex    = 0;
  rfCorrect  = 0;
  rfWrong    = 0;
  rfAnswered = false;

  document.getElementById('rf-correct').textContent = 0;
  document.getElementById('rf-wrong').textContent   = 0;
  document.getElementById('rf-qtotal').textContent  = questionsRF.length;

  buildRFDots();
  loadRFQuestion();
  playSound('snd-question');
}

function buildRFDots() {
  const dots = document.getElementById('rf-dots');
  dots.innerHTML = '';
  questionsRF.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'rf-dot' + (i === 0 ? ' current' : '');
    d.id = `rf-dot-${i}`;
    dots.appendChild(d);
  });
}

function loadRFQuestion() {
  if (rfIndex >= questionsRF.length) { endRapidFire(); return; }

  const q    = questionsRF[rfIndex];
  rfAnswered = false;

  document.getElementById('rf-qnum').textContent    = rfIndex + 1;
  document.getElementById('rf-q-text').textContent  = q.question;
  document.getElementById('rf-answer-reveal').style.display = 'none';
  document.getElementById('rf-correct-btn').disabled = false;
  document.getElementById('rf-wrong-btn').disabled   = false;

  // Animate question card
  const card = document.getElementById('rf-question-card');
  card.style.opacity = '0'; card.style.transform = 'scale(0.95)';
  setTimeout(() => {
    card.style.transition = 'opacity 0.3s, transform 0.3s';
    card.style.opacity = '1'; card.style.transform = 'scale(1)';
  }, 30);

  startRFTimer();
}

function startRFTimer() {
  if (rfTimer) clearInterval(rfTimer);
  rfTimeLeft = 10;
  updateRFTimerDisplay();

  rfTimer = setInterval(() => {
    rfTimeLeft--;
    updateRFTimerDisplay();
    if (rfTimeLeft <= 3) playSound('snd-rapid-tick');
    if (rfTimeLeft <= 0) {
      clearInterval(rfTimer);
      if (!rfAnswered) rfAutoWrong();
    }
  }, 1000);
}

function updateRFTimerDisplay() {
  const bar = document.getElementById('rf-timer-bar');
  const num = document.getElementById('rf-timer-num');
  const pct = (rfTimeLeft / 10) * 100;
  bar.style.width = pct + '%';
  num.textContent = rfTimeLeft;

  bar.className = 'rapid-timer-bar' + (rfTimeLeft <= 3 ? ' danger' : '');
  num.className = 'rapid-timer-num' + (rfTimeLeft <= 3 ? ' danger' : '');
}

function rfAutoWrong() {
  rfAnswered = true;
  rfWrong++;
  document.getElementById('rf-wrong').textContent = rfWrong;
  updateRFDot('wrong');
  showRFAnswer();
  playSound('snd-wrong');
  setTimeout(nextRFQuestion, 2000);
}

function rapidMark(isCorrect) {
  if (rfAnswered) return;
  rfAnswered = true;
  clearInterval(rfTimer);

  if (isCorrect) {
    rfCorrect++;
    document.getElementById('rf-correct').textContent = rfCorrect;
    updateRFDot('correct');
    playSound('snd-correct');
    showToast('✅ सही!');
  } else {
    rfWrong++;
    document.getElementById('rf-wrong').textContent = rfWrong;
    updateRFDot('wrong');
    playSound('snd-wrong');
    showToast('❌ गलत!');
    showRFAnswer();
  }

  document.getElementById('rf-correct-btn').disabled = true;
  document.getElementById('rf-wrong-btn').disabled   = true;
  setTimeout(nextRFQuestion, isCorrect ? 800 : 2000);
}

function rapidSkip() {
  if (rfAnswered) return;
  rfAnswered = true;
  clearInterval(rfTimer);
  updateRFDot('wrong');
  showRFAnswer();
  setTimeout(nextRFQuestion, 1500);
}

function showRFAnswer() {
  const q   = questionsRF[rfIndex];
  const rev = document.getElementById('rf-answer-reveal');
  document.getElementById('rf-answer-text').textContent = q.answer || '—';
  rev.style.display = 'block';
}

function updateRFDot(state) {
  const dot = document.getElementById(`rf-dot-${rfIndex}`);
  if (dot) { dot.className = `rf-dot ${state}`; }
  const next = document.getElementById(`rf-dot-${rfIndex + 1}`);
  if (next) next.classList.add('current');
}

function nextRFQuestion() {
  rfIndex++;
  if (rfIndex >= questionsRF.length) endRapidFire();
  else loadRFQuestion();
}

function endRapidFire() {
  clearInterval(rfTimer);
  stopAllSounds();
  const rfScore  = rfCorrect * 150;
  globalScore   += rfScore;
  globalCorrect += rfCorrect;
  globalWrong   += rfWrong;
  saveGlobalScores();
  showRoundResult('rapidfire', rfScore, rfCorrect, rfWrong);
}

// ============================================================
// AUDIO VISUAL ROUND
// ============================================================
function initAudioVisual() {
  avIndex      = 0;
  avCorrect    = 0;
  avWrong      = 0;
  avSelected   = -1;
  avAnswered   = false;
  avAudioPlayed = false;

  document.getElementById('av-correct').textContent = 0;
  document.getElementById('av-wrong').textContent   = 0;
  document.getElementById('av-qtotal').textContent  = questionsAV.length;

  loadAVQuestion();
  stopAllSounds();
}

function loadAVQuestion() {
  if (avIndex >= questionsAV.length) { endAVRound(); return; }

  const q    = questionsAV[avIndex];
  avSelected  = -1;
  avAnswered  = false;
  avAudioPlayed = false;

  document.getElementById('av-qnum').textContent       = avIndex + 1;
  document.getElementById('av-audio-hint').textContent = q.audioHint || '🎵 Audio सुनें और उत्तर दें';
  document.getElementById('av-q-text').textContent     = q.question;
  document.getElementById('av-lock-confirmation').classList.remove('visible');
  document.getElementById('av-next-btn').style.display = 'none';

  // Set audio source
  const player = document.getElementById('av-audio-player');
  player.src   = q.audioSrc || '';
  player.pause();
  player.currentTime = 0;

  // Reset visualizer
  document.getElementById('av-visualizer').classList.remove('av-playing');

  // Load options
  const letters = ['A','B','C','D'];
  for (let i = 0; i < 4; i++) {
    const btn  = document.getElementById(`av-opt-${i}`);
    const txt  = document.getElementById(`av-opt-text-${i}`);
    const lett = btn.querySelector('.option-letter');
    txt.textContent  = q.options ? (q.options[i] || '—') : '—';
    lett.textContent = letters[i];
    btn.className    = 'option-btn';
    btn.disabled     = false;
    btn.style.animation = 'none';
    void btn.offsetWidth;
    btn.style.animation = '';
  }

  // Animate question
  const card = document.getElementById('av-question-card');
  card.style.opacity = '0';
  setTimeout(() => { card.style.transition='opacity 0.4s'; card.style.opacity='1'; }, 50);
}

function avPlayAudio() {
  const player  = document.getElementById('av-audio-player');
  const visuals = document.getElementById('av-visualizer');
  const btn     = document.getElementById('av-play-btn');

  if (player.src && player.src !== window.location.href) {
    player.play().then(() => {
      visuals.classList.add('av-playing');
      btn.textContent  = '🔊 चल रहा है...';
      btn.disabled     = true;
      avAudioPlayed    = true;
    }).catch(() => {
      showToast('⚠️ Audio file नहीं मिली। sounds/av/ folder में file डालें।');
      // Still allow answering even if audio fails
      avAudioPlayed = true;
    });
  } else {
    showToast('⚠️ Audio file configure नहीं है। Admin से सेट करवाएं।');
    avAudioPlayed = true;
  }
}

function avReplayAudio() {
  const player  = document.getElementById('av-audio-player');
  const visuals = document.getElementById('av-visualizer');
  player.currentTime = 0;
  player.play().then(() => {
    visuals.classList.add('av-playing');
  }).catch(() => {
    showToast('⚠️ Audio replay failed.');
  });
}

function avAudioEnded() {
  document.getElementById('av-visualizer').classList.remove('av-playing');
  document.getElementById('av-play-btn').textContent = '▶ फिर सुनें';
  document.getElementById('av-play-btn').disabled    = false;
}

function avSelectOption(index) {
  if (avAnswered) return;

  if (avSelected !== -1) {
    document.getElementById(`av-opt-${avSelected}`).classList.remove('selected');
  }
  avSelected = index;
  document.getElementById(`av-opt-${index}`).classList.add('selected');
  document.getElementById('av-lock-confirmation').classList.add('visible');
}

function avCancelLock() {
  document.getElementById('av-lock-confirmation').classList.remove('visible');
  if (avSelected !== -1) {
    document.getElementById(`av-opt-${avSelected}`).classList.remove('selected');
  }
  avSelected = -1;
}

function avConfirmLock() {
  if (avSelected === -1) return;
  document.getElementById('av-lock-confirmation').classList.remove('visible');
  stopAllSounds();
  playSound('snd-suspense');

  // Short suspense
  const overlay = document.getElementById('suspense-overlay');
  overlay.classList.add('active');
  document.getElementById('suspense-text').textContent = 'जाँच रहे हैं…';

  setTimeout(() => {
    overlay.classList.remove('active');
    stopSound('snd-suspense');
    avRevealAnswer();
  }, 2500);
}

function avRevealAnswer() {
  const q         = questionsAV[avIndex];
  const isCorrect = (avSelected === q.correct);
  avAnswered = true;

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`av-opt-${i}`);
    btn.disabled = true;
    btn.classList.add('disabled');
  }

  if (isCorrect) {
    avCorrect++;
    document.getElementById('av-correct').textContent = avCorrect;
    document.getElementById(`av-opt-${avSelected}`).classList.remove('selected');
    document.getElementById(`av-opt-${avSelected}`).classList.add('correct');
    playSound('snd-correct');
    launchConfetti();
    showToast('✅ शाबाश! सही उत्तर!');
  } else {
    avWrong++;
    document.getElementById('av-wrong').textContent = avWrong;
    document.getElementById(`av-opt-${avSelected}`).classList.remove('selected');
    document.getElementById(`av-opt-${avSelected}`).classList.add('wrong');
    document.getElementById(`av-opt-${q.correct}`).classList.add('correct');
    playSound('snd-wrong');
    showToast('❌ गलत! सही था: ' + String.fromCharCode(65 + q.correct));
  }

  document.getElementById('av-next-btn').style.display = 'inline-flex';
}

function avNextQuestion() {
  avIndex++;
  if (avIndex >= questionsAV.length) endAVRound();
  else loadAVQuestion();
}

function endAVRound() {
  stopAllSounds();
  const avScore  = avCorrect * 200;
  globalScore   += avScore;
  globalCorrect += avCorrect;
  globalWrong   += avWrong;
  saveGlobalScores();
  showRoundResult('audiovisual', avScore, avCorrect, avWrong);
}

// ============================================================
// ADMIN — multi-round support
// ============================================================
function adminSetRound(roundId) {
  adminEditRound = roundId;
  ['r1a','r1b','rf','av'].forEach(id => {
    document.getElementById(`arb-${id}`)?.classList.remove('admin-btn-active');
  });
  const map = { round1A:'r1a', round1B:'r1b', rapidfire:'rf', audiovisual:'av' };
  document.getElementById(`arb-${map[roundId]}`)?.classList.add('admin-btn-active');

  // Show/hide fields based on round type
  const isRF = roundId === 'rapidfire';
  const isAV = roundId === 'audiovisual';
  document.getElementById('rf-answer-row').style.display    = isRF ? 'block' : 'none';
  document.getElementById('av-audio-row').style.display     = isAV ? 'block' : 'none';
  document.getElementById('options-input-grid').style.display = isRF ? 'none' : 'grid';
  document.getElementById('correct-select-row').style.display = isRF ? 'none' : 'flex';

  clearForm();
  renderAdminList();
}

// Override getAdminQuestions
function getAdminQuestions() {
  if (adminEditRound === 'round1A')    return questionsR1A;
  if (adminEditRound === 'round1B')    return questionsR1B;
  if (adminEditRound === 'rapidfire')  return questionsRF;
  if (adminEditRound === 'audiovisual') return questionsAV;
  return questionsR1A;
}

function getStorageKey() {
  if (adminEditRound === 'round1A')    return 'kbc_q_r1a';
  if (adminEditRound === 'round1B')    return 'kbc_q_r1b';
  if (adminEditRound === 'rapidfire')  return 'kbc_q_rf';
  if (adminEditRound === 'audiovisual') return 'kbc_q_av';
  return 'kbc_q_r1a';
}

// Override renderAdminList to use active round
function renderAdminList() {
  const qs   = getAdminQuestions();
  const list = document.getElementById('admin-questions-list');
  document.getElementById('q-count-admin').textContent = qs.length;
  list.innerHTML = '';

  qs.forEach((q, i) => {
    const row = document.createElement('div');
    row.className = 'admin-q-row';
    row.innerHTML = `
      <span class="admin-q-num">Q${i+1}</span>
      <span class="admin-q-text">${q.question}</span>
      <div class="admin-q-actions">
        <button class="admin-q-btn edit"   onclick="editQuestion(${i})">✏</button>
        <button class="admin-q-btn delete" onclick="deleteQuestion(${i})">🗑</button>
      </div>
    `;
    list.appendChild(row);
  });
}

// Override saveQuestion
function saveQuestion() {
  const isRF = adminEditRound === 'rapidfire';
  const isAV = adminEditRound === 'audiovisual';
  const qText = document.getElementById('q-input').value.trim();
  if (!qText) { showToast('प्रश्न लिखें!'); return; }

  let newQ;
  if (isRF) {
    const ans = document.getElementById('rf-answer').value.trim();
    if (!ans) { showToast('सही उत्तर लिखें!'); return; }
    newQ = { question: qText, answer: ans };
  } else if (isAV) {
    const opts = [
      document.getElementById('o0-input').value.trim(),
      document.getElementById('o1-input').value.trim(),
      document.getElementById('o2-input').value.trim(),
      document.getElementById('o3-input').value.trim()
    ];
    if (opts.some(o => !o)) { showToast('सभी विकल्प भरें!'); return; }
    newQ = {
      question:   qText,
      options:    opts,
      correct:    parseInt(document.getElementById('correct-select').value),
      audioSrc:   document.getElementById('av-audio-src').value.trim()  || '',
      audioHint:  document.getElementById('av-audio-hint').value.trim() || '🎵 Audio सुनें'
    };
  } else {
    const opts = [
      document.getElementById('o0-input').value.trim(),
      document.getElementById('o1-input').value.trim(),
      document.getElementById('o2-input').value.trim(),
      document.getElementById('o3-input').value.trim()
    ];
    if (opts.some(o => !o)) { showToast('सभी विकल्प भरें!'); return; }
    newQ = { question: qText, options: opts, correct: parseInt(document.getElementById('correct-select').value) };
  }

  const qs      = getAdminQuestions();
  const editIdx = parseInt(document.getElementById('edit-index').value);

  if (editIdx >= 0 && editIdx < qs.length) {
    qs[editIdx] = newQ;
    showToast('✅ प्रश्न अपडेट!');
  } else {
    qs.push(newQ);
    showToast('✅ प्रश्न जोड़ा!');
  }

  localStorage.setItem(getStorageKey(), JSON.stringify(qs));
  clearForm();
  renderAdminList();
}

// Override editQuestion
function editQuestion(i) {
  const q   = getAdminQuestions()[i];
  const isRF = adminEditRound === 'rapidfire';
  const isAV = adminEditRound === 'audiovisual';

  document.getElementById('edit-index').value  = i;
  document.getElementById('q-input').value     = q.question;

  if (isRF) {
    document.getElementById('rf-answer').value = q.answer || '';
  } else if (isAV) {
    document.getElementById('av-audio-src').value  = q.audioSrc  || '';
    document.getElementById('av-audio-hint').value = q.audioHint || '';
    document.getElementById('o0-input').value = q.options?.[0] || '';
    document.getElementById('o1-input').value = q.options?.[1] || '';
    document.getElementById('o2-input').value = q.options?.[2] || '';
    document.getElementById('o3-input').value = q.options?.[3] || '';
    document.getElementById('correct-select').value = q.correct ?? 0;
  } else {
    document.getElementById('o0-input').value = q.options?.[0] || '';
    document.getElementById('o1-input').value = q.options?.[1] || '';
    document.getElementById('o2-input').value = q.options?.[2] || '';
    document.getElementById('o3-input').value = q.options?.[3] || '';
    document.getElementById('correct-select').value = q.correct ?? 0;
  }
  document.getElementById('q-input').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// Override deleteQuestion
function deleteQuestion(i) {
  if (!confirm(`प्रश्न ${i+1} हटाएं?`)) return;
  const qs = getAdminQuestions();
  qs.splice(i, 1);
  localStorage.setItem(getStorageKey(), JSON.stringify(qs));
  renderAdminList();
  showToast('हटाया गया।');
}

// Override downloadJSON
function downloadJSON() {
  const qs   = getAdminQuestions();
  const blob = new Blob([JSON.stringify(qs, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = adminEditRound + '_questions.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Override uploadJSON
function uploadJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Invalid');
      localStorage.setItem(getStorageKey(), JSON.stringify(data));
      if (adminEditRound === 'round1A')     questionsR1A = data;
      else if (adminEditRound === 'round1B') questionsR1B = data;
      else if (adminEditRound === 'rapidfire')   questionsRF  = data;
      else if (adminEditRound === 'audiovisual') questionsAV  = data;
      renderAdminList();
      showToast(`✅ ${data.length} प्रश्न upload!`);
    } catch(err) { showToast('❌ JSON फ़ाइल अमान्य: ' + err.message); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Override clearForm
function clearForm() {
  document.getElementById('edit-index').value   = -1;
  document.getElementById('q-input').value      = '';
  document.getElementById('o0-input').value     = '';
  document.getElementById('o1-input').value     = '';
  document.getElementById('o2-input').value     = '';
  document.getElementById('o3-input').value     = '';
  document.getElementById('correct-select').value = 0;
  document.getElementById('rf-answer').value    = '';
  document.getElementById('av-audio-src').value = '';
  document.getElementById('av-audio-hint').value= '';
}

// ============================================================
// FALLBACK SAMPLE DATA
// ============================================================
function getSampleR1A() {
  return [
    { question:"भगवान महावीर का जन्म कहाँ हुआ था?", options:["पावापुरी","कुण्डलपुर","राजगृह","श्रवणबेलगोला"], correct:1 },
    { question:"जैन धर्म में कितने तीर्थंकर हुए हैं?", options:["12","20","24","28"], correct:2 },
    { question:"जैन धर्म का प्रथम तीर्थंकर कौन थे?", options:["महावीर","पार्श्वनाथ","नेमिनाथ","ऋषभदेव (आदिनाथ)"], correct:3 },
    { question:"भगवान महावीर को केवलज्ञान किस आयु में मिला?", options:["30","42","50","72"], correct:1 },
    { question:"जैन धर्म का पवित्र ग्रंथ कौन सा है?", options:["वेद","आगम","त्रिपिटक","गुरुग्रंथ साहिब"], correct:1 }
  ];
}
function getSampleR1B() {
  return [
    { question:"जैन धर्म के पाँच महाव्रतों में पहला क्या है?", options:["सत्य","अहिंसा","अस्तेय","अपरिग्रह"], correct:1 },
    { question:"भगवान महावीर का निर्वाण कहाँ हुआ?", options:["वाराणसी","राजगृह","पावापुरी","गिरनार"], correct:2 },
    { question:"जैन दर्शन में 'अनेकांतवाद' का अर्थ?", options:["एकता का सिद्धांत","अनेक दृष्टिकोणों का सिद्धांत","कर्म का सिद्धांत","मोक्ष का मार्ग"], correct:1 },
    { question:"जैन मोक्ष के त्रिरत्न में क्या शामिल है?", options:["सम्यक् दर्शन, ज्ञान, चारित्र","अहिंसा, सत्य, अस्तेय","तप, दान, भक्ति","ध्यान, उपवास, तीर्थयात्रा"], correct:0 },
    { question:"भगवान पार्श्वनाथ कौन से तीर्थंकर थे?", options:["21वें","22वें","23वें","24वें"], correct:2 }
  ];
}
function getSampleRF() {
  return [
    { question:"महावीर स्वामी का बचपन का नाम?", answer:"वर्धमान" },
    { question:"जैन धर्म के 24वें तीर्थंकर?", answer:"महावीर" },
    { question:"जैन धर्म के 23वें तीर्थंकर?", answer:"पार्श्वनाथ" },
    { question:"नवकार मंत्र में कितने पद हैं?", answer:"5" },
    { question:"श्रवणबेलगोला में किसकी मूर्ति है?", answer:"बाहुबली / गोमटेश्वर" },
    { question:"जैन धर्म के दो संप्रदाय?", answer:"दिगंबर और श्वेतांबर" },
    { question:"महावीर स्वामी की माँ का नाम?", answer:"त्रिशला" },
    { question:"महावीर स्वामी के पिता का नाम?", answer:"सिद्धार्थ" }
  ];
}
function getSampleAV() {
  return [
    { audioSrc:"sounds/av/av1.mp3", audioHint:"🎵 एक जैन स्तुति सुनाई जा रही है...", question:"यह स्तुति किस तीर्थंकर की है?", options:["भगवान महावीर","भगवान पार्श्वनाथ","भगवान ऋषभदेव","भगवान नेमिनाथ"], correct:0 },
    { audioSrc:"sounds/av/av2.mp3", audioHint:"🎵 एक भजन सुनाई दे रहा है...", question:"इस भजन में कौन सा पर्व है?", options:["दीपावली","पर्युषण","महावीर जयंती","दशलक्षण"], correct:2 },
    { audioSrc:"sounds/av/av3.mp3", audioHint:"🎵 ध्यान से सुनें...", question:"यह किस तीर्थ की आरती है?", options:["पावापुरी","श्रवणबेलगोला","गिरनार","सम्मेद शिखर"], correct:3 }
  ];
}

// Init admin panel with Round 1A selected by default
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => adminSetRound('round1A'), 100);
});