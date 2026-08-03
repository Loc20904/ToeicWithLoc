/**
 * TOEIC Vocab Master - Local Study Application (Quizlet Alternative)
 * Quizlet-Style Learn Mode:
 * - 10 terms per round (Choice 10 -> Write 10)
 * - Enter key shortcut on feedback overlay to continue instantly without mouse
 * - Zero infinite repeat loop on wrong terms (smart queue interleaving & auto-assistance)
 * - Save learn progress in LocalStorage with Reset button
 * - Synonyms & Illustrative Image display
 * - 0.6s smooth transition, Web Audio API SFX
 */

// Hardcoded Google Sheets Web App API URL (triển khai cứng trực tiếp vào ứng dụng)
const HARDCODED_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxnAtj4u7M184CA9by1ABmYqG5_4mPr3YsVbWYQdAXLpZb6u56P0JO6KIE3dku3vKQq7g/exec";

// Application State
const state = {
  topics: [],
  currentTopic: null,
  currentWordList: [],
  currentIndex: 0,
  isFlipped: false,
  studyFilterMode: 'all', // 'all' or 'starred'
  learnedWords: new Set(JSON.parse(localStorage.getItem('toeic_learned_words') || '[]')),
  starredWords: new Set(JSON.parse(localStorage.getItem('toeic_starred_words') || '[]')),
  speechSpeed: parseFloat(localStorage.getItem('toeic_speech_speed') || '1.0'),
  autoplayInterval: null,
  isAutoplay: false,
  randomWordCount: '20', // '10', '20', '50', 'all', or 'custom'
  customRandomWordCount: 25,
  selectedRandomTopicIds: null, // null means all selected by default

  // Quizlet Learn Mode State (10 terms round batching)
  allTopicWords: [],
  batchIndex: 0,
  batchSize: 10,
  currentBatchWords: [],
  batchChoiceQueue: [], // Phase 1: 10 terms Stage 1 (Choice 1-4)
  batchTypingQueue: [], // Phase 2: 10 terms Stage 2 (Typing Recall)
  currentLearnPhase: 'choice', // 'choice' or 'typing'
  currentLearnItem: null,
  masteredCount: 0,
  totalLearnCount: 0,
  currentDistractors: [],
  isProcessingAnswer: false,

  // Fast Quiz State
  quizIndex: 0,
  quizScore: 0,
  quizList: [],

  // Match Game State
  matchCards: [],
  selectedMatch: null,
  matchTimer: null,
  matchStartTime: 0,
  matchedCount: 0
};

// ----------------------------------------------------
// WEB AUDIO API SOUND EFFECTS SYNTHESIZER (Quizlet SFX)
// ----------------------------------------------------
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Correct Sound Effect (Snappy 2-tone melodic chime: E5 -> B5)
function playCorrectSFX() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc2.frequency.setValueAtTime(987.77, now + 0.08); // B5

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.1);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch (e) {
    console.warn('SFX Error:', e);
  }
}

// 2. Wrong Sound Effect (Soft low 2-tone bump: 220Hz -> 175Hz)
function playWrongSFX() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(175, now + 0.2);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  } catch (e) {
    console.warn('SFX Error:', e);
  }
}

// 3. Completion Sound Effect (Celebratory 4-note arpeggio: C5 -> E5 -> G5 -> C6)
function playCompletionSFX() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);

      gain.gain.setValueAtTime(0.15, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.4);
    });
  } catch (e) {
    console.warn('SFX Error:', e);
  }
}

// DOM Element Selectors
const DOM = {
  sidebar: document.getElementById('sidebar'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  views: document.querySelectorAll('.view-section'),
  menuItems: document.querySelectorAll('.menu-item'),
  sidebarStarredCount: document.getElementById('sidebar-starred-count'),
  
  // Dashboard & Header
  topicsGrid: document.getElementById('topics-grid'),
  statTotalTopics: document.getElementById('stat-total-topics'),
  statTotalWords: document.getElementById('stat-total-words'),
  statLearnedWords: document.getElementById('stat-learned-words'),
  headerTopicTitle: document.getElementById('header-topic-title'),
  globalSearch: document.getElementById('global-search'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  searchKbd: document.getElementById('search-kbd'),
  themeToggle: document.getElementById('theme-toggle'),
  voiceSpeedSelect: document.getElementById('voice-speed-select'),

  // All Vocab View DOM
  navAllVocab: document.getElementById('nav-all-vocab'),
  sidebarAllVocabCount: document.getElementById('sidebar-all-vocab-count'),
  viewAllVocab: document.getElementById('view-all-vocab'),
  btnAllVocabContribute: document.getElementById('btn-all-vocab-contribute'),
  allVocabTopicFilter: document.getElementById('all-vocab-topic-filter'),
  allVocabStatusFilter: document.getElementById('all-vocab-status-filter'),
  allVocabSort: document.getElementById('all-vocab-sort'),
  allVocabFilteredCount: document.getElementById('all-vocab-filtered-count'),
  allVocabTotalCount: document.getElementById('all-vocab-total-count'),
  allVocabGrid: document.getElementById('all-vocab-grid'),

  // Onboarding Tutorial DOM
  modalOnboarding: document.getElementById('modal-onboarding'),
  btnCloseOnboarding: document.getElementById('btn-close-onboarding'),
  btnOpenTutorialNav: document.getElementById('nav-tutorial'),
  btnOpenTutorialHeader: document.getElementById('btn-open-tutorial-header'),
  chkDontShowOnboarding: document.getElementById('chk-dont-show-onboarding'),
  btnOnboardingSkip: document.getElementById('btn-onboarding-skip'),
  btnOnboardingPrev: document.getElementById('btn-onboarding-prev'),
  btnOnboardingNext: document.getElementById('btn-onboarding-next'),

  // Flashcard DOM
  flashcard: document.getElementById('flashcard'),
  fcTopicName: document.getElementById('fc-topic-name'),
  fcTerm: document.getElementById('fc-term'),
  fcIpaFront: document.getElementById('fc-ipa-front'),
  fcPos: document.getElementById('fc-pos'),
  fcSynonym: document.getElementById('fc-synonym'),
  fcDefinition: document.getElementById('fc-definition'),
  fcNote: document.getElementById('fc-note'),
  fcIpaBack: document.getElementById('fc-ipa-back'),
  fcExampleEn: document.getElementById('fc-example-en'),
  fcExampleVi: document.getElementById('fc-example-vi'),
  fcImage: document.getElementById('fc-image'),
  fcCounter: document.getElementById('fc-counter'),
  fcProgressFill: document.getElementById('fc-progress-fill'),

  // Flashcard Buttons
  btnAudioFront: document.getElementById('btn-audio-front'),
  btnAudioBack: document.getElementById('btn-audio-back'),
  btnFcPrev: document.getElementById('btn-fc-prev'),
  btnFcNext: document.getElementById('btn-fc-next'),
  btnResetFlashcards: document.getElementById('btn-reset-flashcards'),
  btnToggleStar: document.getElementById('btn-toggle-star'),
  btnShuffle: document.getElementById('btn-shuffle'),
  btnAutoplay: document.getElementById('btn-autoplay'),
  btnBackToDashboard: document.getElementById('btn-back-to-dashboard'),

  // QUIZLET LEARN MODE DOM
  learnScoreMastered: document.getElementById('learn-score-mastered'),
  learnTotalWordsBadge: document.getElementById('learn-total-words-badge'),
  learnProgressFill: document.getElementById('learn-progress-fill'),
  learnStageBadge: document.getElementById('learn-stage-badge'),
  btnResetLearn: document.getElementById('btn-reset-learn'),
  
  learnCard: document.getElementById('learn-card'),
  learnPos: document.getElementById('learn-pos'),
  learnDefinition: document.getElementById('learn-definition'),
  learnSynonym: document.getElementById('learn-synonym'),
  learnNote: document.getElementById('learn-note'),
  learnImage: document.getElementById('learn-image'),
  btnLearnAudio: document.getElementById('btn-learn-audio'),
  
  // Stage 1 DOM
  learnStageChoice: document.getElementById('learn-stage-choice'),
  learnChoiceGrid: document.getElementById('learn-choice-grid'),
  btnDontKnowChoice: document.getElementById('btn-dont-know-choice'),
  btnFlagChoice: document.getElementById('btn-flag-choice'),
  
  // Stage 2 DOM
  learnStageTyping: document.getElementById('learn-stage-typing'),
  learnTypingForm: document.getElementById('learn-typing-form'),
  learnTypingInput: document.getElementById('learn-typing-input'),
  btnShowHint: document.getElementById('btn-show-hint'),
  btnDontKnowTyping: document.getElementById('btn-dont-know-typing'),
  btnSubmitLearnTyping: document.getElementById('btn-submit-learn-typing'),
  btnFlagTyping: document.getElementById('btn-flag-typing'),
  
  // Feedback Overlay DOM
  learnFeedbackOverlay: document.getElementById('learn-feedback-overlay'),
  learnFeedbackStatus: document.getElementById('learn-feedback-status'),
  feedbackCorrectVal: document.getElementById('feedback-correct-val'),
  feedbackUserRow: document.getElementById('feedback-user-row'),
  feedbackUserVal: document.getElementById('feedback-user-val'),
  btnFeedbackAudio: document.getElementById('btn-feedback-audio'),
  btnContinueLearn: document.getElementById('btn-continue-learn'),

  // Fast Quiz DOM
  quizStep: document.getElementById('quiz-step'),
  quizScore: document.getElementById('quiz-score'),
  quizTerm: document.getElementById('quiz-question-term'),
  quizIpa: document.getElementById('quiz-question-ipa'),
  quizOptions: document.getElementById('quiz-options'),
  quizFeedback: document.getElementById('quiz-feedback'),
  feedbackMsg: document.getElementById('feedback-msg'),
  btnNextQuiz: document.getElementById('btn-next-quiz'),
  btnQuizAudio: document.getElementById('btn-quiz-audio'),

  // Match Game DOM
  matchGrid: document.getElementById('match-grid'),
  matchTimerDisplay: document.getElementById('match-timer'),
  matchVictory: document.getElementById('match-victory'),
  finalMatchTime: document.getElementById('final-match-time'),
  btnRestartMatch: document.getElementById('btn-restart-match'),

  // Starred Words View DOM
  starredCardsGrid: document.getElementById('starred-cards-grid'),

  // Random Practice View DOM
  randomTotalCount: document.getElementById('random-total-count'),
  randomTopicsGrid: document.getElementById('random-topics-checkbox-grid'),
  btnRandomSelectAll: document.getElementById('btn-random-select-all'),
  btnRandomDeselectAll: document.getElementById('btn-random-deselect-all'),
  randomTopicTotalBadge: document.getElementById('random-topic-total-badge'),
  btnCountCustomTrigger: document.getElementById('btn-count-custom-trigger'),
  randomCustomCountInput: document.getElementById('random-custom-count-input'),
  btnRandomStudyFc: document.getElementById('btn-random-study-fc'),
  btnRandomStudyLearn: document.getElementById('btn-random-study-learn'),
  btnRandomStudyQuiz: document.getElementById('btn-random-study-quiz'),
  btnRandomStudyMatch: document.getElementById('btn-random-study-match'),

  // Feedback & Vocab Contribution Modal
  btnOpenFeedback: document.getElementById('btn-open-feedback'),
  btnOpenFeedbackHeader: document.getElementById('btn-open-feedback-header'),
  modalFeedback: document.getElementById('modal-feedback'),
  btnCloseFeedback: document.getElementById('btn-close-feedback'),
  btnCancelFeedback: document.getElementById('btn-cancel-feedback'),
  btnCancelVocab: document.getElementById('btn-cancel-vocab'),
  tabBtnFeedback: document.getElementById('tab-btn-feedback'),
  tabBtnVocab: document.getElementById('tab-btn-vocab'),
  formFeedback: document.getElementById('form-feedback'),
  formVocab: document.getElementById('form-vocab'),
  starRating: document.getElementById('fb-star-rating'),

  // Progress Backup & Sync Elements
  btnExportProgress: document.getElementById('btn-export-progress'),
  btnImportProgress: document.getElementById('btn-import-progress'),
  fileInputProgress: document.getElementById('file-input-progress'),
  syncStatusBadge: document.getElementById('sync-status-badge'),
  syncStatusText: document.getElementById('sync-status-text')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupEventListeners();
  setupSpeechSynthesis();
  await loadDataset();
  await loadProgressFromBackend();

  updateStarredCountsUI();
  const activeView = document.querySelector('.view-section.active');
  if (activeView && activeView.id === 'view-all-vocab') {
    renderAllVocabView();
  }

  window.addEventListener('beforeunload', () => {
    syncProgressToBackend();
  });
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('toeic_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

DOM.themeToggle.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('toeic_theme', newTheme);
  updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
  DOM.themeToggle.innerHTML = theme === 'dark' 
    ? '<i class="fa-solid fa-sun"></i>' 
    : '<i class="fa-solid fa-moon"></i>';
}

// Load Topics Dataset
async function loadDataset() {
  try {
    const customData = localStorage.getItem('toeic_custom_dataset');
    let loadedData = null;
    if (customData) {
      try {
        const parsed = JSON.parse(customData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loadedData = parsed;
        }
      } catch (e) {}
    }
    
    if (!loadedData) {
      const response = await fetch('data/toeic_topics.json');
      loadedData = await response.json();
    }

    state.topics = loadedData || [];
    renderDashboard();
    updateStarredCountsUI();

    const activeView = document.querySelector('.view-section.active');
    if (activeView && activeView.id === 'view-all-vocab') {
      renderAllVocabView();
    }
  } catch (error) {
    console.error('Lỗi khi tải dữ liệu từ vựng:', error);
  }
}

// Virtual Topic Builders for Global Starred & Random Modes
function getVirtualStarredTopic() {
  const allStarredWords = state.topics.flatMap(t => t.words).filter(w => state.starredWords.has(w.id));
  return {
    topic_id: 'starred_all',
    topic_name: 'Thẻ từ đã đánh dấu (Tất cả học phần)',
    icon: '⭐',
    description: 'Tập hợp tất cả các từ vựng bạn đã gắn sao từ mọi học phần',
    words: allStarredWords,
    isVirtual: true
  };
}

function getVirtualRandomTopic(count = state.randomWordCount) {
  let availableTopics = state.topics;
  if (state.selectedRandomTopicIds && state.selectedRandomTopicIds.size > 0) {
    availableTopics = state.topics.filter(t => state.selectedRandomTopicIds.has(t.topic_id));
  }
  
  const allPoolWords = availableTopics.flatMap(t => t.words);
  let shuffled = [...allPoolWords].sort(() => Math.random() - 0.5);

  let targetCount = shuffled.length;
  if (count === 'all') {
    targetCount = shuffled.length;
  } else if (count === 'custom') {
    const customVal = parseInt(DOM.randomCustomCountInput && DOM.randomCustomCountInput.value ? DOM.randomCustomCountInput.value : state.customRandomWordCount, 10);
    if (!isNaN(customVal) && customVal > 0) {
      targetCount = Math.min(customVal, shuffled.length);
    }
  } else {
    const num = parseInt(count, 10);
    if (!isNaN(num) && num > 0) {
      targetCount = Math.min(num, shuffled.length);
    }
  }

  const finalWords = shuffled.slice(0, targetCount);
  return {
    topic_id: 'random_all',
    topic_name: `Ôn ngẫu nhiên (${finalWords.length} từ)`,
    icon: '🎲',
    description: `Từ vựng được trộn ngẫu nhiên từ ${availableTopics.length} học phần`,
    words: finalWords,
    isVirtual: true
  };
}

// Helper to get filtered words according to currentTopic and studyFilterMode
function getFilteredWordList(topic = state.currentTopic, filterMode = state.studyFilterMode) {
  let baseWords = [];
  if (topic && topic.words) {
    baseWords = topic.words;
  } else if (state.topics && state.topics.length > 0) {
    baseWords = state.topics.flatMap(t => t.words);
  }

  if (filterMode === 'starred') {
    return baseWords.filter(w => state.starredWords.has(w.id));
  }
  return [...baseWords];
}

function updateStarredCountsUI() {
  const totalStarred = state.starredWords.size;
  if (DOM.sidebarStarredCount) DOM.sidebarStarredCount.textContent = totalStarred;

  const totalAllWords = state.topics ? state.topics.flatMap(t => t.words).length : 0;
  if (DOM.sidebarAllVocabCount) DOM.sidebarAllVocabCount.textContent = totalAllWords;

  // Update study action counts in Starred View
  const fcCountEl = document.getElementById('starred-count-fc');
  const learnCountEl = document.getElementById('starred-count-learn');
  const quizCountEl = document.getElementById('starred-count-quiz');
  const matchCountEl = document.getElementById('starred-count-match');
  if (fcCountEl) fcCountEl.textContent = totalStarred;
  if (learnCountEl) learnCountEl.textContent = totalStarred;
  if (quizCountEl) quizCountEl.textContent = totalStarred;
  if (matchCountEl) matchCountEl.textContent = totalStarred;

  // Calculate active topic's counts for filter toolbars
  const activeTopicWords = (state.currentTopic && !state.currentTopic.isVirtual) 
    ? state.currentTopic.words 
    : (state.topics ? state.topics.flatMap(t => t.words) : []);
  const allCount = activeTopicWords.length;
  const starredCount = activeTopicWords.filter(w => state.starredWords.has(w.id)).length;

  document.querySelectorAll('.study-filter-group').forEach(group => {
    const countAllEl = group.querySelector('.count-all');
    const countStarredEl = group.querySelector('.count-starred');
    if (countAllEl) countAllEl.textContent = allCount;
    if (countStarredEl) countStarredEl.textContent = starredCount;

    group.querySelectorAll('.btn-filter-mode').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.studyFilterMode);
    });
  });
}

function setStudyFilterMode(newMode) {
  state.studyFilterMode = newMode;
  updateStarredCountsUI();

  const activeView = document.querySelector('.view-section.active');
  const viewId = activeView ? activeView.id.replace('view-', '') : '';

  if (viewId === 'flashcards') {
    state.currentWordList = getFilteredWordList();
    state.currentIndex = 0;
    renderFlashcard();
  } else if (viewId === 'learn') {
    startQuizletLearnMode();
  } else if (viewId === 'quiz') {
    startFastQuizMode();
  } else if (viewId === 'match') {
    startMatchGame();
  }
}

// Render Dashboard View
function renderDashboard() {
  let totalWordsCount = 0;
  DOM.topicsGrid.innerHTML = '';
  updateStarredCountsUI();

  // 1. Render Special Starred Words Summary Card first if starred words exist!
  if (state.starredWords.size > 0) {
    const starredCard = document.createElement('div');
    starredCard.className = 'topic-card starred-summary-card';
    starredCard.style.border = '1.5px solid var(--accent-warning)';
    starredCard.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), var(--bg-card))';
    starredCard.innerHTML = `
      <div class="topic-card-header">
        <div class="topic-icon" style="background: rgba(245, 158, 11, 0.2); color: var(--accent-warning);">⭐</div>
        <div class="topic-info">
          <h3>Thẻ Từ Đã Đánh Dấu</h3>
          <p>Tập hợp tất cả các từ vựng bạn đã gắn sao trên toàn bộ hệ thống</p>
        </div>
      </div>
      <div class="topic-card-body" style="padding: 0 20px 14px;">
        <div style="font-size: 0.85rem; color: var(--accent-warning); font-weight: 600;">
          <i class="fa-solid fa-star"></i> Đã lưu ${state.starredWords.size} từ quan trọng
        </div>
      </div>
      <div class="topic-card-footer">
        <span class="topic-word-count"><i class="fa-solid fa-star" style="color:var(--accent-warning)"></i> ${state.starredWords.size} từ</span>
        <button class="btn-start-study" style="background: linear-gradient(135deg, var(--accent-warning), #d97706); color:#fff;"><i class="fa-solid fa-play"></i> Xem & Học ⭐</button>
      </div>
    `;
    starredCard.addEventListener('click', () => {
      state.currentTopic = getVirtualStarredTopic();
      state.studyFilterMode = 'starred';
      switchView('starred');
    });
    DOM.topicsGrid.appendChild(starredCard);
  }

  // 2. Render Random Practice Summary Card
  const totalAllWordsCount = state.topics.flatMap(t => t.words).length;
  if (totalAllWordsCount > 0) {
    const randomCard = document.createElement('div');
    randomCard.className = 'topic-card random-summary-card';
    randomCard.style.border = '1.5px solid var(--accent-secondary)';
    randomCard.style.background = 'linear-gradient(135deg, rgba(168, 85, 247, 0.12), var(--bg-card))';
    randomCard.innerHTML = `
      <div class="topic-card-header">
        <div class="topic-icon" style="background: rgba(168, 85, 247, 0.2); color: var(--accent-secondary);">🎲</div>
        <div class="topic-info">
          <h3>Ôn Tập Ngẫu Nhiên</h3>
          <p>Trộn ngẫu nhiên các từ vựng từ tất cả các chủ đề để luyện phản xạ</p>
        </div>
      </div>
      <div class="topic-card-body" style="padding: 0 20px 14px;">
        <div style="font-size: 0.85rem; color: var(--accent-secondary); font-weight: 600;">
          <i class="fa-solid fa-shuffle"></i> Tổng kho: ${totalAllWordsCount} từ vựng
        </div>
      </div>
      <div class="topic-card-footer">
        <span class="topic-word-count"><i class="fa-solid fa-dice" style="color:var(--accent-secondary)"></i> Ngẫu nhiên</span>
        <button class="btn-start-study" style="background: linear-gradient(135deg, var(--accent-secondary), #7c3aed); color:#fff;"><i class="fa-solid fa-play"></i> Cấu hình & Ôn</button>
      </div>
    `;
    randomCard.addEventListener('click', () => {
      switchView('random');
    });
    DOM.topicsGrid.appendChild(randomCard);
  }

  state.topics.forEach(topic => {
    totalWordsCount += topic.words.length;
    const learnedInTopic = topic.words.filter(w => state.learnedWords.has(w.id)).length;
    const starredInTopic = topic.words.filter(w => state.starredWords.has(w.id)).length;
    const percent = topic.words.length > 0 ? Math.round((learnedInTopic / topic.words.length) * 100) : 0;
    
    // Get last studied flashcard index position
    const savedFcIndex = parseInt(localStorage.getItem(`toeic_fc_index_${topic.topic_id}`) || '0', 10);
    const lastCardStr = savedFcIndex > 0 ? ` • Thẻ #${savedFcIndex + 1}` : '';

    const starredBadgeBtn = starredInTopic > 0 
      ? `<button class="btn-topic-starred-only" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: var(--accent-warning); padding: 4px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Chỉ học từ đã đánh dấu trong học phần này"><i class="fa-solid fa-star"></i> Học ${starredInTopic} từ ⭐</button>` 
      : '';

    const topicCard = document.createElement('div');
    topicCard.className = 'topic-card';
    topicCard.innerHTML = `
      <div class="topic-card-header">
        <div class="topic-icon">${topic.icon || '📚'}</div>
        <div class="topic-info">
          <h3>${topic.topic_name}</h3>
          <p>${topic.description || 'Các từ vựng TOEIC theo chủ đề'}</p>
        </div>
      </div>
      <div class="topic-card-body" style="padding: 0 20px 14px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 500;">
          <span>Đã thuộc: <strong style="color: var(--accent-success);">${percent}%</strong></span>
          <span>${learnedInTopic}/${topic.words.length} từ${lastCardStr}</span>
        </div>
        <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
          <div style="height: 100%; width: ${percent}%; background: linear-gradient(90deg, var(--accent-primary), var(--accent-success)); border-radius: 10px; transition: width 0.3s ease;"></div>
        </div>
        ${starredBadgeBtn}
      </div>
      <div class="topic-card-footer">
        <span class="topic-word-count"><i class="fa-solid fa-book-bookmark"></i> ${learnedInTopic}/${topic.words.length} từ</span>
        <button class="btn-start-study"><i class="fa-solid fa-play"></i> ${savedFcIndex > 0 ? 'Học tiếp' : 'Học ngay'}</button>
      </div>
    `;

    topicCard.addEventListener('click', (e) => {
      const starredBtn = topicCard.querySelector('.btn-topic-starred-only');
      if (starredBtn && starredBtn.contains(e.target)) {
        e.stopPropagation();
        selectTopic(topic.topic_id, 'starred');
      } else {
        selectTopic(topic.topic_id, 'all');
      }
    });

    DOM.topicsGrid.appendChild(topicCard);
  });

  DOM.statTotalTopics.textContent = state.topics.length;
  DOM.statTotalWords.textContent = totalWordsCount;
  DOM.statLearnedWords.textContent = state.learnedWords.size;
}

// Select a Topic to Study
function selectTopic(topicId, filterMode = 'all') {
  const topic = state.topics.find(t => t.topic_id === topicId);
  if (!topic) return;

  state.currentTopic = topic;
  state.studyFilterMode = filterMode;
  state.currentWordList = getFilteredWordList(topic, filterMode);
  
  // Load saved flashcard card index for this specific topic
  const savedIndex = localStorage.getItem(`toeic_fc_index_${topic.topic_id}`);
  state.currentIndex = savedIndex ? Math.min(parseInt(savedIndex, 10), Math.max(0, state.currentWordList.length - 1)) : 0;
  if (isNaN(state.currentIndex) || state.currentIndex < 0) state.currentIndex = 0;

  const starSuffix = filterMode === 'starred' ? ' (⭐ Từ đánh dấu)' : '';
  DOM.headerTopicTitle.textContent = `${topic.icon || ''} ${topic.topic_name}${starSuffix}`;

  updateStarredCountsUI();
  switchView('flashcards');
  renderFlashcard();
}

function saveFlashcardIndex() {
  if (state.currentTopic && state.currentTopic.topic_id && !state.currentTopic.isVirtual) {
    localStorage.setItem(`toeic_fc_index_${state.currentTopic.topic_id}`, state.currentIndex);
    syncProgressToBackend();
  }
}

// Render Random Practice Setup View (#view-random)
function renderRandomView() {
  if (state.selectedRandomTopicIds === null) {
    state.selectedRandomTopicIds = new Set(state.topics.map(t => t.topic_id));
  }

  if (DOM.randomTopicTotalBadge) DOM.randomTopicTotalBadge.textContent = state.topics.length;

  // Render Topic Checkboxes Grid
  if (DOM.randomTopicsGrid) {
    DOM.randomTopicsGrid.innerHTML = '';
    state.topics.forEach(topic => {
      const isChecked = state.selectedRandomTopicIds.has(topic.topic_id);
      const card = document.createElement('div');
      card.className = `topic-checkbox-card ${isChecked ? 'selected' : ''}`;
      card.innerHTML = `
        <input type="checkbox" ${isChecked ? 'checked' : ''} />
        <div class="topic-checkbox-info">
          <span class="topic-checkbox-name">${topic.icon || '📚'} ${topic.topic_name}</span>
          <span class="topic-checkbox-count">${topic.words.length} từ vựng</span>
        </div>
      `;

      const checkbox = card.querySelector('input[type="checkbox"]');
      card.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        if (checkbox.checked) {
          state.selectedRandomTopicIds.add(topic.topic_id);
          card.classList.add('selected');
        } else {
          state.selectedRandomTopicIds.delete(topic.topic_id);
          card.classList.remove('selected');
        }
        updateRandomViewCounts();
      });

      DOM.randomTopicsGrid.appendChild(card);
    });
  }

  updateRandomViewCounts();
}

function updateRandomViewCounts() {
  let selectedTopics = state.topics;
  if (state.selectedRandomTopicIds && state.selectedRandomTopicIds.size > 0) {
    selectedTopics = state.topics.filter(t => state.selectedRandomTopicIds.has(t.topic_id));
  } else if (state.selectedRandomTopicIds && state.selectedRandomTopicIds.size === 0) {
    selectedTopics = [];
  }

  const totalAvailableWords = selectedTopics.flatMap(t => t.words).length;
  if (DOM.randomTotalCount) DOM.randomTotalCount.textContent = totalAvailableWords;

  document.querySelectorAll('#random-count-group .btn-count-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.count === state.randomWordCount);
  });

  let effectiveCount = 0;
  if (state.randomWordCount === 'all') {
    effectiveCount = totalAvailableWords;
  } else if (state.randomWordCount === 'custom') {
    const customVal = parseInt(DOM.randomCustomCountInput && DOM.randomCustomCountInput.value ? DOM.randomCustomCountInput.value : state.customRandomWordCount, 10);
    effectiveCount = !isNaN(customVal) && customVal > 0 ? Math.min(customVal, totalAvailableWords) : Math.min(20, totalAvailableWords);
  } else {
    const num = parseInt(state.randomWordCount, 10);
    effectiveCount = !isNaN(num) && num > 0 ? Math.min(num, totalAvailableWords) : totalAvailableWords;
  }

  document.querySelectorAll('.random-chosen-count').forEach(el => {
    el.textContent = effectiveCount;
  });
}

function startRandomStudy(studyMode) {
  let selectedTopics = state.topics;
  if (state.selectedRandomTopicIds && state.selectedRandomTopicIds.size > 0) {
    selectedTopics = state.topics.filter(t => state.selectedRandomTopicIds.has(t.topic_id));
  } else if (state.selectedRandomTopicIds && state.selectedRandomTopicIds.size === 0) {
    alert('Vui lòng chọn ít nhất 1 học phần để ôn tập!');
    return;
  }

  const totalAvailableWords = selectedTopics.flatMap(t => t.words).length;
  if (totalAvailableWords === 0) {
    alert('Các học phần đã chọn không có từ vựng nào.');
    return;
  }

  state.currentTopic = getVirtualRandomTopic(state.randomWordCount);
  if (!state.currentTopic.words || state.currentTopic.words.length === 0) {
    alert('Số lượng từ được chọn không hợp lệ!');
    return;
  }

  state.studyFilterMode = 'all';
  state.currentWordList = state.currentTopic.words;
  state.currentIndex = 0;

  DOM.headerTopicTitle.textContent = `${state.currentTopic.icon} ${state.currentTopic.topic_name}`;
  switchView(studyMode);
}

// Navigation & View Switching
function switchView(viewId) {
  DOM.views.forEach(view => view.classList.remove('active'));
  DOM.menuItems.forEach(item => item.classList.remove('active'));

  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) targetView.classList.add('active');

  const activeMenuItem = document.querySelector(`.menu-item[data-view="${viewId}"]`);
  if (activeMenuItem) activeMenuItem.classList.add('active');

  // View Specific Triggers
  if (viewId === 'all-vocab') renderAllVocabView();
  if (viewId === 'starred') {
    state.currentTopic = getVirtualStarredTopic();
    state.studyFilterMode = 'starred';
    renderStarredView();
  }
  if (viewId === 'random') renderRandomView();
  if (viewId === 'flashcards') renderFlashcard();
  if (viewId === 'learn') startQuizletLearnMode();
  if (viewId === 'quiz') startFastQuizMode();
  if (viewId === 'match') startMatchGame();

  updateStarredCountsUI();
}

// Helper to escape HTML characters for safe rendering
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, match => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[match];
  });
}

// Helper to highlight matching text in search results
function highlightText(text, query) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  if (!query) return escapeHTML(str);
  const safeText = escapeHTML(str);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safeText.replace(regex, '<mark class="highlight-text">$1</mark>');
}

// Render All Vocabulary View (#view-all-vocab)
function renderAllVocabView() {
  const container = DOM.allVocabGrid;
  if (!container) return;

  const allWordsWithTopic = [];
  if (state.topics) {
    state.topics.forEach(t => {
      t.words.forEach(w => {
        allWordsWithTopic.push({
          ...w,
          topic_id: t.topic_id,
          topic_name: t.topic_name,
          topic_icon: t.icon || '📚'
        });
      });
    });
  }

  // Populate Topic Filter options dynamically
  if (DOM.allVocabTopicFilter && state.topics && state.topics.length > 0) {
    if (DOM.allVocabTopicFilter.options.length !== state.topics.length + 1) {
      const currentVal = DOM.allVocabTopicFilter.value || 'all';
      DOM.allVocabTopicFilter.innerHTML = '<option value="all">Tất cả học phần</option>';
      state.topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.topic_id;
        opt.textContent = `${t.icon || '📚'} ${t.topic_name} (${t.words.length})`;
        DOM.allVocabTopicFilter.appendChild(opt);
      });
      DOM.allVocabTopicFilter.value = currentVal;
    }
  }

  const query = (DOM.globalSearch ? DOM.globalSearch.value.toLowerCase().trim() : '');
  const selectedTopic = DOM.allVocabTopicFilter ? DOM.allVocabTopicFilter.value : 'all';
  const selectedStatus = DOM.allVocabStatusFilter ? DOM.allVocabStatusFilter.value : 'all';
  const selectedSort = DOM.allVocabSort ? DOM.allVocabSort.value : 'default';

  let filtered = allWordsWithTopic.filter(word => {
    // Topic filter (String conversion to handle number vs string topic_id)
    if (selectedTopic !== 'all' && String(word.topic_id) !== String(selectedTopic)) {
      return false;
    }

    // Status filter
    if (selectedStatus === 'learned' && !state.learnedWords.has(word.id)) return false;
    if (selectedStatus === 'unlearned' && state.learnedWords.has(word.id)) return false;
    if (selectedStatus === 'starred' && !state.starredWords.has(word.id)) return false;

    // Search query filter
    if (query) {
      const synText = getSynonymText(word);
      const termMatch = word.term ? String(word.term).toLowerCase().includes(query) : false;
      const defMatch = word.definition ? String(word.definition).toLowerCase().includes(query) : false;
      const ipaMatch = word.ipa ? String(word.ipa).toLowerCase().includes(query) : false;
      const synMatch = synText ? synText.toLowerCase().includes(query) : false;
      const exEnMatch = word.example_en ? String(word.example_en).toLowerCase().includes(query) : false;
      const exViMatch = word.example_vi ? String(word.example_vi).toLowerCase().includes(query) : false;
      const topicMatch = word.topic_name ? String(word.topic_name).toLowerCase().includes(query) : false;

      return termMatch || defMatch || ipaMatch || synMatch || exEnMatch || exViMatch || topicMatch;
    }

    return true;
  });

  // Sorting
  if (selectedSort === 'az') {
    filtered.sort((a, b) => a.term.localeCompare(b.term));
  } else if (selectedSort === 'za') {
    filtered.sort((a, b) => b.term.localeCompare(a.term));
  } else if (selectedSort === 'topic') {
    filtered.sort((a, b) => a.topic_name.localeCompare(b.topic_name) || a.term.localeCompare(b.term));
  }

  // Update Count Badges
  if (DOM.allVocabFilteredCount) DOM.allVocabFilteredCount.textContent = filtered.length;
  if (DOM.allVocabTotalCount) DOM.allVocabTotalCount.textContent = allWordsWithTopic.length;
  if (DOM.sidebarAllVocabCount) DOM.sidebarAllVocabCount.textContent = allWordsWithTopic.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-all-vocab-state">
        <i class="fa-solid fa-magnifying-glass empty-icon"></i>
        <h3>Không tìm thấy từ vựng nào phù hợp</h3>
        <p>Thử điều chỉnh lại từ khóa tìm kiếm hoặc bỏ chọn các bộ lọc học phần, trạng thái.</p>
        <button class="btn-primary" id="btn-reset-all-vocab-filters">
          <i class="fa-solid fa-rotate-left"></i> Đặt lại tất cả bộ lọc
        </button>
      </div>
    `;
    const btnReset = container.querySelector('#btn-reset-all-vocab-filters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (DOM.globalSearch) DOM.globalSearch.value = '';
        if (DOM.btnClearSearch) DOM.btnClearSearch.classList.add('hidden');
        if (DOM.allVocabTopicFilter) DOM.allVocabTopicFilter.value = 'all';
        if (DOM.allVocabStatusFilter) DOM.allVocabStatusFilter.value = 'all';
        if (DOM.allVocabSort) DOM.allVocabSort.value = 'default';
        renderAllVocabView();
      });
    }
    return;
  }

  container.innerHTML = '';
  filtered.forEach(word => {
    try {
      const isStarred = state.starredWords.has(word.id) || state.starredWords.has(String(word.id));
      const isLearned = state.learnedWords.has(word.id) || state.learnedWords.has(String(word.id));
      const synText = getSynonymText(word);

      const cardEl = document.createElement('div');
      cardEl.className = `all-vocab-card ${isLearned ? 'is-learned' : ''} ${isStarred ? 'is-starred' : ''}`;

      cardEl.innerHTML = `
        <div class="vocab-card-header">
          <span class="vocab-topic-pill" title="Học phần: ${escapeHTML(word.topic_name)}">
            <i class="fa-solid fa-folder"></i> ${escapeHTML(word.topic_name)}
          </span>
          <div class="vocab-card-actions">
            <button class="btn-card-action btn-card-star ${isStarred ? 'active' : ''}" title="${isStarred ? 'Bỏ đánh dấu' : 'Đánh dấu từ quan trọng'}">
              <i class="fa-${isStarred ? 'solid' : 'regular'} fa-star"></i>
            </button>
            <button class="btn-card-action btn-card-learned ${isLearned ? 'active' : ''}" title="${isLearned ? 'Đã thuộc (Nhấp để hủy)' : 'Đánh dấu đã thuộc'}">
              <i class="fa-solid fa-check"></i>
            </button>
          </div>
        </div>

        <div class="vocab-card-body">
          <div class="vocab-term-row">
            <span class="vocab-term">${highlightText(word.term, query)}</span>
            ${word.pos ? `<span class="vocab-pos-badge">${escapeHTML(word.pos)}</span>` : ''}
            <button class="btn-card-audio" title="Nghe phát âm">
              <i class="fa-solid fa-volume-high"></i>
            </button>
          </div>
          ${word.ipa ? `<div class="vocab-ipa">${highlightText(word.ipa, query)}</div>` : ''}
          <div class="vocab-def">${highlightText(word.definition, query)}</div>
          ${synText ? `<div class="vocab-synonym"><i class="fa-solid fa-equals"></i> ${highlightText(synText, query)}</div>` : ''}
          ${word.example_en ? `
            <div class="vocab-example-box">
              <div class="example-en">"${highlightText(word.example_en, query)}"</div>
              ${word.example_vi ? `<div class="example-vi">${highlightText(word.example_vi, query)}</div>` : ''}
            </div>
          ` : ''}
        </div>

        <div class="vocab-card-footer">
          <button class="btn-card-study" title="Mở học phần này trên Flashcard">
            <i class="fa-solid fa-clone"></i> Học Flashcard
          </button>
          <span class="vocab-id-tag">ID: ${escapeHTML(word.id)}</span>
        </div>
      `;

      // Audio click
      const btnAudio = cardEl.querySelector('.btn-card-audio');
      if (btnAudio) {
        btnAudio.addEventListener('click', (e) => {
          e.stopPropagation();
          speakTerm(word.term);
        });
      }

      // Star toggle
      const btnStar = cardEl.querySelector('.btn-card-star');
      if (btnStar) {
        btnStar.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.starredWords.has(word.id)) {
            state.starredWords.delete(word.id);
          } else {
            state.starredWords.add(word.id);
          }
          localStorage.setItem('toeic_starred_words', JSON.stringify([...state.starredWords]));
          syncProgressToBackend();
          renderAllVocabView();
          updateStarredCountsUI();
        });
      }

      // Learned toggle
      const btnLearned = cardEl.querySelector('.btn-card-learned');
      if (btnLearned) {
        btnLearned.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.learnedWords.has(word.id)) {
            state.learnedWords.delete(word.id);
          } else {
            state.learnedWords.add(word.id);
          }
          localStorage.setItem('toeic_learned_words', JSON.stringify([...state.learnedWords]));
          syncProgressToBackend();
          renderAllVocabView();
          renderDashboard();
        });
      }

      // Study Flashcard click
      const btnStudy = cardEl.querySelector('.btn-card-study');
      if (btnStudy) {
        btnStudy.addEventListener('click', (e) => {
          e.stopPropagation();
          const topicObj = state.topics.find(t => String(t.topic_id) === String(word.topic_id));
          if (topicObj) {
            state.currentTopic = topicObj;
            state.currentWordList = topicObj.words;
            state.currentIndex = topicObj.words.findIndex(w => String(w.id) === String(word.id));
            if (state.currentIndex === -1) state.currentIndex = 0;
            switchView('flashcards');
            renderFlashcard();
          }
        });
      }

      container.appendChild(cardEl);
    } catch (err) {
      console.error('Error rendering word card:', word, err);
    }
  });
}

// Render Starred Words View (#view-starred)
function renderStarredView() {
  const container = DOM.starredCardsGrid;
  if (!container) return;

  updateStarredCountsUI();

  const allWords = state.topics.flatMap(t => t.words);
  const starredList = allWords.filter(w => state.starredWords.has(w.id));

  if (starredList.length === 0) {
    container.innerHTML = `
      <div class="empty-starred-state">
        <i class="fa-regular fa-star empty-icon"></i>
        <h3>Chưa có từ vựng nào được đánh dấu</h3>
        <p>Trong khi học Flashcard hoặc làm bài tập, hãy bấm vào biểu tượng <strong>⭐ (Đánh dấu)</strong> để lưu các từ khó cần ôn lại!</p>
        <button class="btn-primary" id="btn-starred-go-dashboard">
          <i class="fa-solid fa-layer-group"></i> Xem danh sách các Học phần
        </button>
      </div>
    `;
    const btnGo = container.querySelector('#btn-starred-go-dashboard');
    if (btnGo) btnGo.addEventListener('click', () => switchView('dashboard'));
    return;
  }

  container.innerHTML = '';
  starredList.forEach(word => {
    const cardEl = document.createElement('div');
    cardEl.className = 'starred-card';
    const synText = getSynonymText(word);
    
    cardEl.innerHTML = `
      <div class="starred-card-top">
        <div>
          <div class="starred-term-title">${word.term}</div>
          <div class="starred-ipa">${word.ipa || ''}</div>
        </div>
        <button class="btn-unstar-card" title="Bỏ đánh dấu từ này">
          <i class="fa-solid fa-star"></i>
        </button>
      </div>
      <div class="starred-card-body">
        <div class="starred-def-main">
          ${word.pos ? `<span class="starred-pos-badge">${word.pos}</span>` : ''}
          ${word.definition}
        </div>
        ${synText ? `<div style="font-size:0.85rem; color:var(--accent-secondary); margin-bottom:4px;">= ${synText}</div>` : ''}
        ${word.example_en ? `<div class="starred-example">"${word.example_en}"</div>` : ''}
      </div>
      <div class="starred-card-footer">
        <button class="btn-audio-mini" style="background:transparent; border:none; color:var(--accent-primary); cursor:pointer; font-size:0.85rem; font-weight:600;" title="Nghe phát âm">
          <i class="fa-solid fa-volume-high"></i> Nghe âm
        </button>
        <span style="font-size:0.75rem; color:var(--text-subtle);"><i class="fa-solid fa-tag"></i> ID: ${word.id}</span>
      </div>
    `;

    cardEl.querySelector('.btn-unstar-card').addEventListener('click', (e) => {
      e.stopPropagation();
      state.starredWords.delete(word.id);
      localStorage.setItem('toeic_starred_words', JSON.stringify([...state.starredWords]));
      syncProgressToBackend();
      renderStarredView();
      renderDashboard();
    });

    cardEl.querySelector('.btn-audio-mini').addEventListener('click', (e) => {
      e.stopPropagation();
      speakTerm(word.term);
    });

    container.appendChild(cardEl);
  });
}

// Helper to get clean synonym text
function getSynonymText(word) {
  if (word.synonym_text) return word.synonym_text;
  if (Array.isArray(word.synonym) && word.synonym.length > 0) return word.synonym.join(', ');
  if (typeof word.synonym === 'string' && word.synonym.trim()) return word.synonym;
  return '';
}

// ----------------------------------------------------
// 1. FLASHCARD CONTROLLER & RENDER
// ----------------------------------------------------
function renderFlashcard() {
  state.currentWordList = getFilteredWordList();

  if (!state.currentWordList || state.currentWordList.length === 0) {
    state.isFlipped = false;
    DOM.flashcard.classList.remove('flipped');
    DOM.fcCounter.textContent = `0 / 0`;
    DOM.fcProgressFill.style.width = `0%`;
    DOM.fcTopicName.textContent = state.currentTopic ? state.currentTopic.topic_name : 'Từ vựng';
    DOM.fcTerm.textContent = state.studyFilterMode === 'starred' ? "Chưa có từ đánh dấu ⭐" : "Chưa có từ vựng";
    DOM.fcIpaFront.textContent = state.studyFilterMode === 'starred' ? "Bấm nút ⭐ trên thẻ để lưu từ cần ôn lại" : "";
    DOM.fcPos.textContent = "";
    DOM.fcSynonym.textContent = "";
    DOM.fcDefinition.textContent = state.studyFilterMode === 'starred' ? "Vui lòng chọn chế độ 'Tất cả' hoặc đánh dấu thêm từ ⭐." : "";
    DOM.fcNote.textContent = "";
    DOM.fcIpaBack.textContent = "";
    DOM.fcExampleEn.textContent = "";
    DOM.fcExampleVi.textContent = "";
    DOM.btnToggleStar.innerHTML = '<i class="fa-regular fa-star"></i>';
    updateStarredCountsUI();
    return;
  }

  if (state.currentIndex >= state.currentWordList.length) {
    state.currentIndex = 0;
  }

  const word = state.currentWordList[state.currentIndex];
  state.isFlipped = false;
  DOM.flashcard.classList.remove('flipped');

  // Populate Front
  DOM.fcTopicName.textContent = state.currentTopic ? state.currentTopic.topic_name : 'Từ vựng';
  DOM.fcTerm.textContent = word.term;
  DOM.fcIpaFront.textContent = word.ipa || '';

  // Populate Back (Formatted 2-Column Structure)
  DOM.fcPos.textContent = word.pos || '';
  
  const synText = getSynonymText(word);
  DOM.fcSynonym.textContent = synText ? `= ${synText}` : '';
  
  DOM.fcDefinition.textContent = word.definition || '';
  DOM.fcNote.textContent = word.note || '';
  DOM.fcIpaBack.textContent = word.ipa || '';
  
  DOM.fcExampleEn.textContent = word.example_en || '';
  DOM.fcExampleVi.textContent = word.example_vi || '';
  DOM.fcImage.src = word.image_url || 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=80';

  // Update Counters & Progress Bar
  const total = state.currentWordList.length;
  const current = state.currentIndex + 1;
  DOM.fcCounter.textContent = `${current} / ${total}`;
  DOM.fcProgressFill.style.width = `${(current / total) * 100}%`;

  // Update Star Icon
  if (state.starredWords.has(word.id)) {
    DOM.btnToggleStar.innerHTML = '<i class="fa-solid fa-star" style="color: var(--accent-warning)"></i>';
  } else {
    DOM.btnToggleStar.innerHTML = '<i class="fa-regular fa-star"></i>';
  }

  updateStarredCountsUI();
  saveFlashcardIndex();
}

function flipFlashcard() {
  state.isFlipped = !state.isFlipped;
  DOM.flashcard.classList.toggle('flipped', state.isFlipped);
}

function nextFlashcard() {
  if (state.currentIndex < state.currentWordList.length - 1) {
    state.currentIndex++;
    renderFlashcard();
    if (state.isAutoplay) speakTerm(state.currentWordList[state.currentIndex].term);
  }
}

function prevFlashcard() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderFlashcard();
  }
}

function resetFlashcards() {
  state.currentIndex = 0;
  state.isFlipped = false;
  DOM.flashcard.classList.remove('flipped');
  renderFlashcard();
}

function toggleStarCurrentWord() {
  const word = state.currentWordList[state.currentIndex];
  if (!word) return;

  if (state.starredWords.has(word.id)) {
    state.starredWords.delete(word.id);
  } else {
    state.starredWords.add(word.id);
  }
  localStorage.setItem('toeic_starred_words', JSON.stringify([...state.starredWords]));
  syncProgressToBackend();
  renderFlashcard();
}

function markWordLearned() {
  const word = state.currentWordList[state.currentIndex];
  if (!word) return;

  state.learnedWords.add(word.id);
  localStorage.setItem('toeic_learned_words', JSON.stringify([...state.learnedWords]));
  syncProgressToBackend();
  renderFlashcard();
  renderDashboard();
  nextFlashcard();
}

function markWordReview() {
  const word = state.currentWordList[state.currentIndex];
  if (!word) return;

  state.learnedWords.delete(word.id);
  localStorage.setItem('toeic_learned_words', JSON.stringify([...state.learnedWords]));
  syncProgressToBackend();
  renderFlashcard();
  renderDashboard();
  nextFlashcard();
}

function shuffleFlashcards() {
  state.currentWordList.sort(() => Math.random() - 0.5);
  state.currentIndex = 0;
  renderFlashcard();
}

function toggleAutoplay() {
  state.isAutoplay = !state.isAutoplay;
  if (state.isAutoplay) {
    DOM.btnAutoplay.classList.add('active');
    DOM.btnAutoplay.innerHTML = '<i class="fa-solid fa-pause"></i> Dừng Autoplay';
    state.autoplayInterval = setInterval(() => {
      if (state.isFlipped) {
        nextFlashcard();
      } else {
        flipFlashcard();
      }
    }, 3500);
  } else {
    DOM.btnAutoplay.classList.remove('active');
    DOM.btnAutoplay.innerHTML = '<i class="fa-solid fa-play"></i> Autoplay';
    clearInterval(state.autoplayInterval);
  }
}

// ----------------------------------------------------
// 2. QUIZLET-STYLE LEARN MODE (10 Terms Round Batching)
// ----------------------------------------------------
function saveLearnProgress(syncBackend = false) {
  if (!state.currentTopic) return;
  const progressData = {
    batchIndex: state.batchIndex,
    masteredCount: state.masteredCount,
    totalLearnCount: state.totalLearnCount
  };
  localStorage.setItem(`toeic_learn_progress_${state.currentTopic.topic_id}`, JSON.stringify(progressData));
  if (syncBackend) {
    syncProgressToBackend();
  }
}

function loadLearnProgress() {
  if (!state.currentTopic) return false;

  const learnedInTopic = state.currentTopic.words.filter(w => state.learnedWords.has(w.id)).length;
  state.masteredCount = learnedInTopic;

  const saved = localStorage.getItem(`toeic_learn_progress_${state.currentTopic.topic_id}`);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      state.batchIndex = typeof data.batchIndex === 'number' ? data.batchIndex : 0;
      return true;
    } catch (e) {
      state.batchIndex = 0;
      return false;
    }
  } else {
    state.batchIndex = 0;
    return false;
  }
}

function resetLearnProgress() {
  if (!state.currentTopic) return;
  if (confirm(`Bạn có chắc chắn muốn đặt lại tiến độ học của phần "${state.currentTopic.topic_name}" để học lại từ đầu?`)) {
    state.currentTopic.words.forEach(w => state.learnedWords.delete(w.id));
    localStorage.setItem('toeic_learned_words', JSON.stringify([...state.learnedWords]));
    localStorage.removeItem(`toeic_learn_progress_${state.currentTopic.topic_id}`);
    syncProgressToBackend();
    
    state.batchIndex = 0;
    state.masteredCount = 0;
    renderDashboard();
    startQuizletLearnMode();
  }
}

function toggleStarLearnWord() {
  if (!state.currentLearnItem || !state.currentLearnItem.word) return;
  const word = state.currentLearnItem.word;

  if (state.starredWords.has(word.id)) {
    state.starredWords.delete(word.id);
  } else {
    state.starredWords.add(word.id);
  }
  localStorage.setItem('toeic_starred_words', JSON.stringify([...state.starredWords]));
  syncProgressToBackend();
  updateStarredCountsUI();

  const isStarred = state.starredWords.has(word.id);
  [DOM.btnFlagChoice, DOM.btnFlagTyping].forEach(btn => {
    if (btn) {
      btn.innerHTML = isStarred 
        ? '<i class="fa-solid fa-star" style="color: var(--accent-warning)"></i>' 
        : '<i class="fa-regular fa-star"></i>';
    }
  });
}

function startQuizletLearnMode() {
  const filtered = getFilteredWordList();
  if (filtered.length === 0) {
    if (state.topics.length > 0 && state.studyFilterMode === 'all') {
      state.currentTopic = state.topics[0];
      state.allTopicWords = getFilteredWordList(state.topics[0], 'all');
    } else {
      state.allTopicWords = [];
    }
  } else {
    state.allTopicWords = filtered;
  }

  if (state.allTopicWords.length === 0) {
    DOM.learnDefinition.textContent = state.studyFilterMode === 'starred' 
      ? "Chưa có từ vựng nào được đánh dấu ⭐ trong phần này!" 
      : "Chưa có từ vựng";
    DOM.learnPos.textContent = "";
    if (DOM.learnSynonym) DOM.learnSynonym.textContent = "";
    DOM.learnNote.textContent = "Vui lòng chọn chế độ 'Tất cả' hoặc đánh dấu thêm từ ⭐ để bắt đầu học.";
    DOM.learnStageChoice.classList.add('hidden');
    DOM.learnStageTyping.classList.add('hidden');
    DOM.learnStageBadge.innerHTML = `<i class="fa-solid fa-circle-info"></i> Trống`;
    DOM.learnTotalWordsBadge.textContent = "0";
    DOM.learnScoreMastered.textContent = "0";
    DOM.learnProgressFill.style.width = "0%";
    updateStarredCountsUI();
    return;
  }

  state.totalLearnCount = state.allTopicWords.length;
  loadLearnProgress();

  state.isProcessingAnswer = false;

  DOM.learnTotalWordsBadge.textContent = state.totalLearnCount;
  DOM.learnScoreMastered.textContent = state.masteredCount;
  const percent = state.totalLearnCount > 0 ? (state.masteredCount / state.totalLearnCount) * 100 : 0;
  DOM.learnProgressFill.style.width = `${percent}%`;

  updateStarredCountsUI();
  startNextBatch();
}

function startNextBatch() {
  // Check if ALL words in current topic are already mastered
  const unmasteredInTopic = state.allTopicWords.filter(w => !state.learnedWords.has(w.id));

  if (unmasteredInTopic.length === 0 && state.allTopicWords.length > 0) {
    // 100% Mastered Completion Screen!
    playCompletionSFX();
    DOM.learnDefinition.textContent = "🎉 Bạn đã thành thạo tất cả từ vựng trong lượt học này!";
    DOM.learnPos.textContent = "";
    if (DOM.learnSynonym) DOM.learnSynonym.textContent = "";
    DOM.learnNote.textContent = "Xuất sắc! Tiến độ đã được lưu lại.";
    DOM.learnStageChoice.classList.add('hidden');
    DOM.learnStageTyping.classList.add('hidden');
    DOM.learnStageBadge.innerHTML = `<i class="fa-solid fa-check"></i> Hoàn thành 100%`;
    syncProgressToBackend();
    return;
  }

  // If batchIndex overflowed beyond available words, snap back to the first unmastered word's batch
  if (state.batchIndex >= state.allTopicWords.length) {
    const firstUnmasteredIdx = state.allTopicWords.findIndex(w => !state.learnedWords.has(w.id));
    if (firstUnmasteredIdx !== -1) {
      state.batchIndex = Math.floor(firstUnmasteredIdx / state.batchSize) * state.batchSize;
    } else {
      state.batchIndex = 0;
    }
    saveLearnProgress(false);
  }

  const slice = state.allTopicWords.slice(state.batchIndex, state.batchIndex + state.batchSize);
  state.currentBatchWords = slice;
  
  // Filter out words that are already mastered in this batch
  const unmasteredBatchWords = state.currentBatchWords.filter(w => !state.learnedWords.has(w.id));
  
  if (unmasteredBatchWords.length === 0) {
    // Current batch is completely mastered -> Move to next batch!
    state.batchIndex += state.batchSize;
    saveLearnProgress(true);
    startNextBatch();
    return;
  }

  // Initialize Phase 1: Unmastered terms in Stage 1 Choice
  state.batchChoiceQueue = unmasteredBatchWords.map(w => ({ word: w, stage: 1, wrongCount: 0 })).sort(() => Math.random() - 0.5);
  state.batchTypingQueue = [];
  state.currentLearnPhase = 'choice';

  renderNextLearnCard();
}

function renderNextLearnCard() {
  state.isProcessingAnswer = false;
  DOM.learnFeedbackOverlay.classList.add('hidden');
  DOM.learnTypingInput.value = '';
  DOM.learnTypingInput.classList.remove('typing-correct-flash');

  // Trigger gentle card transition animation
  DOM.learnCard.classList.remove('card-transition');
  void DOM.learnCard.offsetWidth; // Reflow
  DOM.learnCard.classList.add('card-transition');

  // Phase 1: Choice 1-4 for current batch
  if (state.currentLearnPhase === 'choice') {
    if (state.batchChoiceQueue.length > 0) {
      state.currentLearnItem = state.batchChoiceQueue[0];
      const word = state.currentLearnItem.word;

      DOM.learnPos.textContent = word.pos || '';
      DOM.learnDefinition.textContent = word.definition;
      
      const synText = getSynonymText(word);
      if (DOM.learnSynonym) DOM.learnSynonym.textContent = synText ? `= ${synText}` : '';
      
      DOM.learnNote.textContent = word.note || '';
      DOM.learnImage.src = word.image_url || 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=80';

      const batchStartNum = state.batchIndex + 1;
      const batchEndNum = Math.min(state.batchIndex + state.batchSize, state.allTopicWords.length);
      DOM.learnStageBadge.innerHTML = `<span class="stage-dot"></span> Phase 1: Chọn 1-4 (${batchStartNum}-${batchEndNum})`;
      
      DOM.learnStageChoice.classList.remove('hidden');
      DOM.learnStageTyping.classList.add('hidden');

      // Update flag icon
      const isStarred = state.starredWords.has(word.id);
      [DOM.btnFlagChoice, DOM.btnFlagTyping].forEach(btn => {
        if (btn) btn.innerHTML = isStarred ? '<i class="fa-solid fa-star" style="color: var(--accent-warning)"></i>' : '<i class="fa-regular fa-star"></i>';
      });

      generateChoiceOptions(word);
    } else {
      // Phase 1 choice completed for this batch! Switch to Phase 2 Typing and sync backend!
      state.currentLearnPhase = 'typing';
      syncProgressToBackend();
      renderNextLearnCard();
    }
  } 
  // Phase 2: Typing Recall for current batch
  else if (state.currentLearnPhase === 'typing') {
    if (state.batchTypingQueue.length > 0) {
      state.currentLearnItem = state.batchTypingQueue[0];
      const word = state.currentLearnItem.word;

      DOM.learnPos.textContent = word.pos || '';
      DOM.learnDefinition.textContent = word.definition;

      const synText = getSynonymText(word);
      if (DOM.learnSynonym) DOM.learnSynonym.textContent = synText ? `= ${synText}` : '';

      DOM.learnNote.textContent = word.note || '';
      DOM.learnImage.src = word.image_url || 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=80';

      const batchStartNum = state.batchIndex + 1;
      const batchEndNum = Math.min(state.batchIndex + state.batchSize, state.allTopicWords.length);
      DOM.learnStageBadge.innerHTML = `<span class="stage-dot" style="background: var(--accent-success)"></span> Phase 2: Viết lại (${batchStartNum}-${batchEndNum})`;
      
      DOM.learnStageChoice.classList.add('hidden');
      DOM.learnStageTyping.classList.remove('hidden');

      // Update flag icon
      const isStarred = state.starredWords.has(word.id);
      [DOM.btnFlagChoice, DOM.btnFlagTyping].forEach(btn => {
        if (btn) btn.innerHTML = isStarred ? '<i class="fa-solid fa-star" style="color: var(--accent-warning)"></i>' : '<i class="fa-regular fa-star"></i>';
      });
      
      // Auto-assistance if user struggled on this word
      if (state.currentLearnItem.wrongCount >= 2) {
        DOM.learnTypingInput.value = word.term; // Pre-fill correct spelling so user can press Enter to confirm!
      } else if (state.currentLearnItem.wrongCount === 1) {
        const hintStr = word.term.charAt(0) + ' _ '.repeat(word.term.length - 1);
        DOM.learnTypingInput.placeholder = `Gợi ý: ${hintStr}`;
      } else {
        DOM.learnTypingInput.placeholder = "Nhập Tiếng Anh";
      }

      DOM.learnTypingInput.focus();
    } else {
      // Batch / Phase 2 complete! Move to next batch of 10 terms and sync backend!
      state.batchIndex += state.batchSize;
      saveLearnProgress(true);
      startNextBatch();
    }
  }
}

function generateChoiceOptions(currentWord) {
  const allWords = state.topics.flatMap(t => t.words);
  const distractors = allWords.filter(w => w.id !== currentWord.id).sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [currentWord, ...distractors].sort(() => Math.random() - 0.5);
  state.currentDistractors = options;

  DOM.learnChoiceGrid.innerHTML = '';
  options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'choice-option-btn';
    btn.setAttribute('data-index', idx);
    btn.innerHTML = `
      <span class="choice-num">${idx + 1}</span>
      <span class="choice-text">${opt.term}</span>
    `;

    // Highlight correct answer if user got it wrong twice
    if (state.currentLearnItem && state.currentLearnItem.wrongCount >= 2 && opt.id === currentWord.id) {
      btn.style.border = '2px solid var(--accent-success)';
      btn.style.background = 'rgba(16, 185, 129, 0.15)';
    }

    btn.addEventListener('click', () => handleLearnChoice(opt.id === currentWord.id, opt.term, btn));
    DOM.learnChoiceGrid.appendChild(btn);
  });
}

function handleLearnChoice(isCorrect, chosenTerm, clickedBtn = null) {
  if (state.isProcessingAnswer) return;
  state.isProcessingAnswer = true;

  const currentItem = state.currentLearnItem;

  if (isCorrect) {
    playCorrectSFX();
    if (clickedBtn) clickedBtn.classList.add('correct-flash');
    
    setTimeout(() => {
      // Shift current item out of choice queue
      state.batchChoiceQueue.shift();
      // Add item to typing queue for phase 2
      state.batchTypingQueue.push({ word: currentItem.word, stage: 2, wrongCount: 0 });
      saveLearnProgress();
      renderNextLearnCard();
    }, 600);
  } else {
    playWrongSFX();
    currentItem.wrongCount = (currentItem.wrongCount || 0) + 1;
    showLearnFeedback(currentItem.word, chosenTerm);
    
    state.batchChoiceQueue.shift();
    
    // If wrong 2+ times and queue is empty, auto-promote to Stage 2 typing queue to prevent 1-item infinite loop!
    if (currentItem.wrongCount >= 2 && state.batchChoiceQueue.length === 0) {
      state.batchTypingQueue.push({ word: currentItem.word, stage: 2, wrongCount: currentItem.wrongCount });
    } else {
      // Re-insert at end of choice queue
      state.batchChoiceQueue.push(currentItem);
      
      // If queue only has 1 item, inject a buffer card from current batch so user sees 2 distinct cards
      if (state.batchChoiceQueue.length === 1 && state.currentBatchWords.length > 1) {
        const bufferWord = state.currentBatchWords.find(w => w.id !== currentItem.word.id);
        if (bufferWord) {
          state.batchChoiceQueue.unshift({ word: bufferWord, stage: 1, wrongCount: 0, isBuffer: true });
        }
      }
    }
  }
}

function handleLearnTypingSubmit() {
  if (state.isProcessingAnswer) return;

  const currentItem = state.currentLearnItem;
  const word = currentItem.word;
  const userInput = DOM.learnTypingInput.value.trim().toLowerCase();
  const targetTerm = word.term.toLowerCase();

  if (userInput === targetTerm) {
    state.isProcessingAnswer = true;
    playCorrectSFX();
    DOM.learnTypingInput.classList.add('typing-correct-flash');

    state.masteredCount++;
    state.learnedWords.add(word.id);
    localStorage.setItem('toeic_learned_words', JSON.stringify([...state.learnedWords]));

    DOM.learnScoreMastered.textContent = state.masteredCount;
    DOM.learnProgressFill.style.width = `${(state.masteredCount / state.totalLearnCount) * 100}%`;

    setTimeout(() => {
      state.batchTypingQueue.shift(); // Remove from typing queue
      saveLearnProgress();
      renderDashboard();
      renderNextLearnCard();
    }, 600);
  } else {
    playWrongSFX();
    currentItem.wrongCount = (currentItem.wrongCount || 0) + 1;
    showLearnFeedback(word, userInput);
    
    state.batchTypingQueue.shift();
    state.batchTypingQueue.push(currentItem);

    // If queue only has 1 item, inject a buffer card from current batch
    if (state.batchTypingQueue.length === 1 && state.currentBatchWords.length > 1) {
      const bufferWord = state.currentBatchWords.find(w => w.id !== currentItem.word.id);
      if (bufferWord) {
        state.batchTypingQueue.unshift({ word: bufferWord, stage: 2, wrongCount: 0, isBuffer: true });
      }
    }
  }
}

function showLearnFeedback(word, userTypedVal = "") {
  DOM.learnFeedbackStatus.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Thử lại lần nữa nào!`;
  DOM.feedbackCorrectVal.textContent = word.term;
  
  if (userTypedVal) {
    DOM.feedbackUserRow.classList.remove('hidden');
    DOM.feedbackUserVal.textContent = userTypedVal;
  } else {
    DOM.feedbackUserRow.classList.add('hidden');
  }

  DOM.learnFeedbackOverlay.classList.remove('hidden');
  speakTerm(word.term); // Speak term when mistake is made to reinforce learning
}

// ----------------------------------------------------
// 3. AUDIO TTS (WEB SPEECH API)
// ----------------------------------------------------
function setupSpeechSynthesis() {
  DOM.voiceSpeedSelect.value = state.speechSpeed;
  DOM.voiceSpeedSelect.addEventListener('change', (e) => {
    state.speechSpeed = parseFloat(e.target.value);
    localStorage.setItem('toeic_speech_speed', state.speechSpeed.toString());
  });
}

function speakTerm(text) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = state.speechSpeed;

  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')));
  if (englishVoice) utterance.voice = englishVoice;

  window.speechSynthesis.speak(utterance);
}

// ----------------------------------------------------
// 4. FAST QUIZ MODE (Trắc Nghiệm Nhanh)
// ----------------------------------------------------
function startFastQuizMode() {
  const filtered = getFilteredWordList();
  state.quizList = [...filtered].sort(() => Math.random() - 0.5);
  state.quizIndex = 0;
  state.quizScore = 0;
  DOM.quizScore.textContent = '0';
  updateStarredCountsUI();

  if (state.quizList.length === 0) {
    DOM.quizTerm.textContent = "Chưa có từ vựng nào được đánh dấu ⭐";
    DOM.quizIpa.textContent = "Vui lòng chọn chế độ 'Tất cả' để ôn tập trắc nghiệm.";
    DOM.quizOptions.innerHTML = '';
    DOM.quizFeedback.classList.add('hidden');
    return;
  }

  renderFastQuizQuestion();
}

function renderFastQuizQuestion() {
  DOM.quizFeedback.classList.add('hidden');
  if (state.quizIndex >= state.quizList.length) {
    playCompletionSFX();
    DOM.quizTerm.textContent = "Hoàn thành bài tập!";
    DOM.quizIpa.textContent = `Điểm số của bạn: ${state.quizScore} / ${state.quizList.length}`;
    DOM.quizOptions.innerHTML = `<button class="btn-next-quiz" style="width:100%" onclick="startFastQuizMode()">Học lại bài quiz</button>`;
    return;
  }

  const currentWord = state.quizList[state.quizIndex];
  DOM.quizStep.textContent = `Câu ${state.quizIndex + 1} / ${state.quizList.length}`;
  DOM.quizTerm.textContent = currentWord.term;
  DOM.quizIpa.textContent = currentWord.ipa || '';

  const allWords = state.topics.flatMap(t => t.words);
  const distractors = allWords.filter(w => w.id !== currentWord.id).sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [currentWord, ...distractors].sort(() => Math.random() - 0.5);

  DOM.quizOptions.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option-btn';
    btn.innerHTML = `<span>${opt.pos || ''} ${opt.definition}</span> <i class="fa-regular fa-circle"></i>`;
    btn.addEventListener('click', () => handleFastQuizAnswer(btn, opt.id === currentWord.id, currentWord));
    DOM.quizOptions.appendChild(btn);
  });
}

function handleFastQuizAnswer(selectedBtn, isCorrect, currentWord) {
  const allButtons = DOM.quizOptions.querySelectorAll('.quiz-option-btn');
  allButtons.forEach(btn => btn.style.pointerEvents = 'none');

  if (isCorrect) {
    playCorrectSFX();
    selectedBtn.classList.add('correct');
    selectedBtn.querySelector('i').className = 'fa-solid fa-circle-check';
    state.quizScore++;
    DOM.quizScore.textContent = state.quizScore;
    DOM.feedbackMsg.textContent = "Chính xác! 🎉";
    DOM.feedbackMsg.style.color = "var(--accent-success)";
    speakTerm(currentWord.term);
  } else {
    playWrongSFX();
    selectedBtn.classList.add('wrong');
    selectedBtn.querySelector('i').className = 'fa-solid fa-circle-xmark';
    DOM.feedbackMsg.textContent = `Chưa đúng! Đáp án đúng: ${currentWord.definition}`;
    DOM.feedbackMsg.style.color = "var(--accent-danger)";
  }

  DOM.quizFeedback.classList.remove('hidden');
}

DOM.btnNextQuiz.addEventListener('click', () => {
  state.quizIndex++;
  renderFastQuizQuestion();
});

// ----------------------------------------------------
// 5. MATCH GAME MODE (Ghép Thẻ)
// ----------------------------------------------------
function startMatchGame() {
  const filtered = getFilteredWordList();
  updateStarredCountsUI();
  DOM.matchVictory.classList.add('hidden');

  if (filtered.length === 0) {
    DOM.matchGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">
        <i class="fa-regular fa-star" style="font-size:3rem; margin-bottom:12px; color:var(--accent-warning);"></i>
        <h3>Chưa có từ vựng nào được đánh dấu ⭐</h3>
        <p>Vui lòng chuyển sang chế độ 'Tất cả' để chơi ghép thẻ.</p>
      </div>
    `;
    clearInterval(state.matchTimer);
    DOM.matchTimerDisplay.textContent = '0.0s';
    return;
  }

  const sampleWords = [...filtered].sort(() => Math.random() - 0.5).slice(0, 6);
  
  let cards = [];
  sampleWords.forEach(w => {
    cards.push({ id: w.id, text: w.term, type: 'term' });
    cards.push({ id: w.id, text: w.definition, type: 'def' });
  });

  state.matchCards = cards.sort(() => Math.random() - 0.5);
  state.selectedMatch = null;
  state.matchedCount = 0;

  renderMatchGrid();
  startMatchTimer();
}

function renderMatchGrid() {
  DOM.matchGrid.innerHTML = '';
  state.matchCards.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'match-card';
    cardEl.textContent = card.text;
    cardEl.addEventListener('click', () => handleMatchClick(cardEl, card));
    DOM.matchGrid.appendChild(cardEl);
  });
}

function handleMatchClick(cardEl, card) {
  if (cardEl.classList.contains('matched') || cardEl.classList.contains('selected')) return;

  if (!state.selectedMatch) {
    state.selectedMatch = { el: cardEl, card: card };
    cardEl.classList.add('selected');
  } else {
    const firstMatch = state.selectedMatch;
    if (firstMatch.card.id === card.id && firstMatch.card.type !== card.type) {
      playCorrectSFX();
      cardEl.classList.add('matched');
      firstMatch.el.classList.add('matched');
      state.selectedMatch = null;
      state.matchedCount += 2;

      if (state.matchedCount === state.matchCards.length) {
        clearInterval(state.matchTimer);
        playCompletionSFX();
        DOM.finalMatchTime.textContent = DOM.matchTimerDisplay.textContent;
        DOM.matchVictory.classList.remove('hidden');
      }
    } else {
      playWrongSFX();
      cardEl.classList.add('selected');
      setTimeout(() => {
        cardEl.classList.remove('selected');
        firstMatch.el.classList.remove('selected');
        state.selectedMatch = null;
      }, 500);
    }
  }
}

function startMatchTimer() {
  clearInterval(state.matchTimer);
  state.matchStartTime = Date.now();
  state.matchTimer = setInterval(() => {
    const elapsed = ((Date.now() - state.matchStartTime) / 1000).toFixed(1);
    DOM.matchTimerDisplay.textContent = `${elapsed}s`;
  }, 100);
}

DOM.btnRestartMatch.addEventListener('click', startMatchGame);

// ----------------------------------------------------
// EVENT LISTENERS & KEYBOARD SHORTCUTS
// ----------------------------------------------------
function setupEventListeners() {
  // Sidebar Navigation
  DOM.menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      switchView(view);
    });
  });

  DOM.btnToggleSidebar.addEventListener('click', () => {
    DOM.sidebar.classList.toggle('collapsed');
  });

  // Flashcard Controls
  DOM.flashcard.addEventListener('click', flipFlashcard);
  DOM.btnFcNext.addEventListener('click', (e) => { e.stopPropagation(); nextFlashcard(); });
  DOM.btnFcPrev.addEventListener('click', (e) => { e.stopPropagation(); prevFlashcard(); });
  if (DOM.btnResetFlashcards) {
    DOM.btnResetFlashcards.addEventListener('click', (e) => { e.stopPropagation(); resetFlashcards(); });
  }
  DOM.btnToggleStar.addEventListener('click', (e) => { e.stopPropagation(); toggleStarCurrentWord(); });
  DOM.btnShuffle.addEventListener('click', shuffleFlashcards);
  DOM.btnAutoplay.addEventListener('click', toggleAutoplay);
  DOM.btnBackToDashboard.addEventListener('click', () => switchView('dashboard'));

  // Audio Buttons
  DOM.btnAudioFront.addEventListener('click', (e) => { e.stopPropagation(); speakTerm(state.currentWordList[state.currentIndex].term); });
  DOM.btnAudioBack.addEventListener('click', (e) => { e.stopPropagation(); speakTerm(state.currentWordList[state.currentIndex].term); });
  DOM.btnLearnAudio.addEventListener('click', () => { if (state.currentLearnItem) speakTerm(state.currentLearnItem.word.term); });
  DOM.btnFeedbackAudio.addEventListener('click', () => { if (state.currentLearnItem) speakTerm(state.currentLearnItem.word.term); });
  DOM.btnQuizAudio.addEventListener('click', () => speakTerm(state.quizList[state.quizIndex].term));

  // Reset Learn Progress Button
  if (DOM.btnResetLearn) {
    DOM.btnResetLearn.addEventListener('click', resetLearnProgress);
  }

  // Learn Mode Flag/Star Buttons
  if (DOM.btnFlagChoice) DOM.btnFlagChoice.addEventListener('click', (e) => { e.stopPropagation(); toggleStarLearnWord(); });
  if (DOM.btnFlagTyping) DOM.btnFlagTyping.addEventListener('click', (e) => { e.stopPropagation(); toggleStarLearnWord(); });

  // Study Mode Filter Toggle Buttons ([Tất cả | ⭐ Đã đánh dấu])
  document.querySelectorAll('.btn-filter-mode').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setStudyFilterMode(btn.dataset.mode);
    });
  });

  // Starred View Quick Study Actions
  const btnStarredFc = document.getElementById('btn-starred-study-fc');
  const btnStarredLearn = document.getElementById('btn-starred-study-learn');
  const btnStarredQuiz = document.getElementById('btn-starred-study-quiz');
  const btnStarredMatch = document.getElementById('btn-starred-study-match');

  if (btnStarredFc) btnStarredFc.addEventListener('click', () => { state.currentTopic = getVirtualStarredTopic(); setStudyFilterMode('starred'); switchView('flashcards'); });
  if (btnStarredLearn) btnStarredLearn.addEventListener('click', () => { state.currentTopic = getVirtualStarredTopic(); setStudyFilterMode('starred'); switchView('learn'); });
  if (btnStarredQuiz) btnStarredQuiz.addEventListener('click', () => { state.currentTopic = getVirtualStarredTopic(); setStudyFilterMode('starred'); switchView('quiz'); });
  if (btnStarredMatch) btnStarredMatch.addEventListener('click', () => { state.currentTopic = getVirtualStarredTopic(); setStudyFilterMode('starred'); switchView('match'); });

  // Random Practice View Handlers
  if (DOM.btnRandomSelectAll) {
    DOM.btnRandomSelectAll.addEventListener('click', () => {
      state.selectedRandomTopicIds = new Set(state.topics.map(t => t.topic_id));
      renderRandomView();
    });
  }

  if (DOM.btnRandomDeselectAll) {
    DOM.btnRandomDeselectAll.addEventListener('click', () => {
      state.selectedRandomTopicIds = new Set();
      renderRandomView();
    });
  }

  document.querySelectorAll('#random-count-group .btn-count-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      state.randomWordCount = btn.dataset.count;
      if (btn.dataset.count === 'custom' && DOM.randomCustomCountInput) {
        DOM.randomCustomCountInput.focus();
      }
      updateRandomViewCounts();
    });
  });

  if (DOM.randomCustomCountInput) {
    DOM.randomCustomCountInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val > 0) {
        state.customRandomWordCount = val;
      }
      state.randomWordCount = 'custom';
      updateRandomViewCounts();
    });
    DOM.randomCustomCountInput.addEventListener('focus', () => {
      state.randomWordCount = 'custom';
      updateRandomViewCounts();
    });
  }

  if (DOM.btnRandomStudyFc) DOM.btnRandomStudyFc.addEventListener('click', () => startRandomStudy('flashcards'));
  if (DOM.btnRandomStudyLearn) DOM.btnRandomStudyLearn.addEventListener('click', () => startRandomStudy('learn'));
  if (DOM.btnRandomStudyQuiz) DOM.btnRandomStudyQuiz.addEventListener('click', () => startRandomStudy('quiz'));
  if (DOM.btnRandomStudyMatch) DOM.btnRandomStudyMatch.addEventListener('click', () => startRandomStudy('match'));

  // Quizlet Learn Mode Event Handlers
  DOM.btnDontKnowChoice.addEventListener('click', () => {
    const currentItem = state.currentLearnItem;
    playWrongSFX();
    currentItem.wrongCount = (currentItem.wrongCount || 0) + 1;
    showLearnFeedback(currentItem.word);
    
    state.batchChoiceQueue.shift();
    if (currentItem.wrongCount >= 2 && state.batchChoiceQueue.length === 0) {
      state.batchTypingQueue.push({ word: currentItem.word, stage: 2, wrongCount: currentItem.wrongCount });
    } else {
      state.batchChoiceQueue.push(currentItem);
    }
  });

  DOM.btnDontKnowTyping.addEventListener('click', () => {
    const currentItem = state.currentLearnItem;
    playWrongSFX();
    currentItem.wrongCount = (currentItem.wrongCount || 0) + 1;
    showLearnFeedback(currentItem.word, DOM.learnTypingInput.value.trim());
    
    state.batchTypingQueue.shift();
    state.batchTypingQueue.push(currentItem);
  });
  
  DOM.learnTypingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleLearnTypingSubmit();
  });
  DOM.btnSubmitLearnTyping.addEventListener('click', handleLearnTypingSubmit);

  DOM.btnShowHint.addEventListener('click', () => {
    if (state.currentLearnItem) {
      const term = state.currentLearnItem.word.term;
      DOM.learnTypingInput.value = term.charAt(0) + ' _ '.repeat(term.length - 1);
    }
  });

  DOM.btnContinueLearn.addEventListener('click', () => {
    renderNextLearnCard();
  });

  // Global Search logic -> Searches within All Vocab View
  if (DOM.globalSearch) {
    DOM.globalSearch.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query) {
        if (DOM.btnClearSearch) DOM.btnClearSearch.classList.remove('hidden');
      } else {
        if (DOM.btnClearSearch) DOM.btnClearSearch.classList.add('hidden');
      }

      const activeView = document.querySelector('.view-section.active');
      if (!activeView || activeView.id !== 'view-all-vocab') {
        switchView('all-vocab');
      } else {
        renderAllVocabView();
      }
    });
  }

  if (DOM.btnClearSearch) {
    DOM.btnClearSearch.addEventListener('click', () => {
      if (DOM.globalSearch) DOM.globalSearch.value = '';
      DOM.btnClearSearch.classList.add('hidden');
      if (DOM.globalSearch) DOM.globalSearch.focus();
      renderAllVocabView();
    });
  }

  // All Vocab Filter listeners
  if (DOM.allVocabTopicFilter) DOM.allVocabTopicFilter.addEventListener('change', renderAllVocabView);
  if (DOM.allVocabStatusFilter) DOM.allVocabStatusFilter.addEventListener('change', renderAllVocabView);
  if (DOM.allVocabSort) DOM.allVocabSort.addEventListener('change', renderAllVocabView);

  // Contribute button in All Vocab view
  if (DOM.btnAllVocabContribute) {
    DOM.btnAllVocabContribute.addEventListener('click', () => {
      DOM.modalFeedback.classList.remove('hidden');
      if (DOM.tabBtnVocab) DOM.tabBtnVocab.click();
    });
  }

  // Onboarding Tutorial Controls & Handlers
  let currentOnboardingStep = 1;
  const TOTAL_ONBOARDING_STEPS = 5;

  const openOnboardingModal = (step = 1) => {
    if (!DOM.modalOnboarding) return;
    currentOnboardingStep = step;
    updateOnboardingStepUI();
    DOM.modalOnboarding.classList.remove('hidden');
  };

  const closeOnboardingModal = () => {
    if (!DOM.modalOnboarding) return;
    DOM.modalOnboarding.classList.add('hidden');
    if (DOM.chkDontShowOnboarding && DOM.chkDontShowOnboarding.checked) {
      localStorage.setItem('toeic_onboarding_completed', 'true');
    }
  };

  const updateOnboardingStepUI = () => {
    if (!DOM.modalOnboarding) return;

    const dots = DOM.modalOnboarding.querySelectorAll('.step-dot');
    dots.forEach(dot => {
      const s = parseInt(dot.dataset.step, 10);
      dot.classList.toggle('active', s === currentOnboardingStep);
      dot.classList.toggle('completed', s < currentOnboardingStep);
    });

    const slides = DOM.modalOnboarding.querySelectorAll('.onboarding-slide');
    slides.forEach(slide => {
      const s = parseInt(slide.dataset.step, 10);
      slide.classList.toggle('active', s === currentOnboardingStep);
    });

    if (DOM.btnOnboardingPrev) {
      DOM.btnOnboardingPrev.classList.toggle('hidden', currentOnboardingStep === 1);
    }

    if (DOM.btnOnboardingNext) {
      if (currentOnboardingStep === TOTAL_ONBOARDING_STEPS) {
        DOM.btnOnboardingNext.innerHTML = `Bắt đầu học ngay! 🚀`;
      } else {
        DOM.btnOnboardingNext.innerHTML = `Tiếp theo <i class="fa-solid fa-arrow-right"></i>`;
      }
    }
  };

  // Auto-show tutorial on first visit
  const isOnboardingCompleted = localStorage.getItem('toeic_onboarding_completed') === 'true';
  if (!isOnboardingCompleted) {
    setTimeout(() => {
      openOnboardingModal(1);
    }, 600);
  }

  if (DOM.btnOpenTutorialNav) DOM.btnOpenTutorialNav.addEventListener('click', () => openOnboardingModal(1));
  if (DOM.btnOpenTutorialHeader) DOM.btnOpenTutorialHeader.addEventListener('click', () => openOnboardingModal(1));
  if (DOM.btnCloseOnboarding) DOM.btnCloseOnboarding.addEventListener('click', closeOnboardingModal);
  if (DOM.btnOnboardingSkip) DOM.btnOnboardingSkip.addEventListener('click', () => {
    localStorage.setItem('toeic_onboarding_completed', 'true');
    closeOnboardingModal();
  });

  if (DOM.btnOnboardingPrev) {
    DOM.btnOnboardingPrev.addEventListener('click', () => {
      if (currentOnboardingStep > 1) {
        currentOnboardingStep--;
        updateOnboardingStepUI();
      }
    });
  }

  if (DOM.btnOnboardingNext) {
    DOM.btnOnboardingNext.addEventListener('click', () => {
      if (currentOnboardingStep < TOTAL_ONBOARDING_STEPS) {
        currentOnboardingStep++;
        updateOnboardingStepUI();
      } else {
        localStorage.setItem('toeic_onboarding_completed', 'true');
        closeOnboardingModal();
      }
    });
  }

  if (DOM.modalOnboarding) {
    const dots = DOM.modalOnboarding.querySelectorAll('.step-dot');
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const s = parseInt(dot.dataset.step, 10);
        if (s >= 1 && s <= TOTAL_ONBOARDING_STEPS) {
          currentOnboardingStep = s;
          updateOnboardingStepUI();
        }
      });
    });
  }

  // Keyboard Shortcuts (Space, Enter, 1-4, Arrows, / for Search)
  document.addEventListener('keydown', (e) => {
    // 0. Shortcut '/' to focus search bar
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (DOM.globalSearch) {
        DOM.globalSearch.focus();
        DOM.globalSearch.select();
      }
      return;
    }

    const activeView = document.querySelector('.view-section.active');
    if (!activeView) return;

    // 1. Check if Feedback Overlay is open -> Press Enter or Space to continue instantly!
    if (activeView.id === 'view-learn' && !DOM.learnFeedbackOverlay.classList.contains('hidden')) {
      if (e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        DOM.btnContinueLearn.click();
        return;
      }
    }

    // 2. Flashcard View Shortcuts
    if (activeView.id === 'view-flashcards') {
      if (e.code === 'Space') {
        e.preventDefault();
        flipFlashcard();
      } else if (e.code === 'ArrowRight') {
        nextFlashcard();
      } else if (e.code === 'ArrowLeft') {
        prevFlashcard();
      } else if (e.key === 'r' || e.key === 'R') {
        resetFlashcards();
      }
    }

    // 3. Quizlet Learn Mode Shortcuts (Keys 1, 2, 3, 4 for Stage 1 Choice)
    if (activeView.id === 'view-learn' && DOM.learnFeedbackOverlay.classList.contains('hidden') && !DOM.learnStageChoice.classList.contains('hidden')) {
      if (['1', '2', '3', '4'].includes(e.key)) {
        const optionIdx = parseInt(e.key, 10) - 1;
        if (state.currentDistractors && state.currentDistractors[optionIdx]) {
          const selected = state.currentDistractors[optionIdx];
          const choiceBtns = DOM.learnChoiceGrid.querySelectorAll('.choice-option-btn');
          const clickedBtn = choiceBtns[optionIdx] || null;
          handleLearnChoice(selected.id === state.currentLearnItem.word.id, selected.term, clickedBtn);
        }
      }
    }
  });

  // Feedback & Vocab Contribution Modal Controls
  const openFeedbackModal = () => DOM.modalFeedback.classList.remove('hidden');

  if (DOM.btnOpenFeedback) {
    DOM.btnOpenFeedback.addEventListener('click', openFeedbackModal);
  }
  if (DOM.btnOpenFeedbackHeader) {
    DOM.btnOpenFeedbackHeader.addEventListener('click', openFeedbackModal);
  }
  if (DOM.btnCloseFeedback) {
    DOM.btnCloseFeedback.addEventListener('click', () => DOM.modalFeedback.classList.add('hidden'));
  }
  if (DOM.btnCancelFeedback) {
    DOM.btnCancelFeedback.addEventListener('click', () => DOM.modalFeedback.classList.add('hidden'));
  }
  if (DOM.btnCancelVocab) {
    DOM.btnCancelVocab.addEventListener('click', () => DOM.modalFeedback.classList.add('hidden'));
  }

  // Tab switching
  if (DOM.tabBtnFeedback && DOM.tabBtnVocab) {
    DOM.tabBtnFeedback.addEventListener('click', () => {
      DOM.tabBtnFeedback.classList.add('active');
      DOM.tabBtnVocab.classList.remove('active');
      DOM.formFeedback.classList.remove('hidden');
      DOM.formFeedback.classList.add('active');
      DOM.formVocab.classList.add('hidden');
      DOM.formVocab.classList.remove('active');
    });

    DOM.tabBtnVocab.addEventListener('click', () => {
      DOM.tabBtnVocab.classList.add('active');
      DOM.tabBtnFeedback.classList.remove('active');
      DOM.formVocab.classList.remove('hidden');
      DOM.formVocab.classList.add('active');
      DOM.formFeedback.classList.add('hidden');
      DOM.formFeedback.classList.remove('active');
    });
  }

  // Star rating selection
  let currentRating = 5;
  if (DOM.starRating) {
    const stars = DOM.starRating.querySelectorAll('.star');
    stars.forEach(star => {
      star.addEventListener('click', (e) => {
        currentRating = parseInt(e.target.dataset.value, 10);
        stars.forEach(s => {
          const val = parseInt(s.dataset.value, 10);
          if (val <= currentRating) s.classList.add('active');
          else s.classList.remove('active');
        });
      });
    });
  }

  // Helper function to send payload to Google Sheets Apps Script API
  async function sendToGoogleSheets(payload, statusEl, submitBtn, formEl) {
    const targetUrl = HARDCODED_APPS_SCRIPT_URL;
    
    statusEl.className = 'form-status loading';
    statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tự động lưu dữ liệu vào Google Sheets...';
    submitBtn.disabled = true;

    try {
      if (targetUrl) {
        await fetch(targetUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        console.log('Sending payload (Demo mode):', payload);
        await new Promise(r => setTimeout(r, 600));
      }

      statusEl.className = 'form-status success';
      statusEl.innerHTML = '🎉 Cảm ơn bạn! Đóng góp đã được tự động ghi nhận vào Google Sheet.';
      formEl.reset();
      
      setTimeout(() => {
        DOM.modalFeedback.classList.add('hidden');
        statusEl.className = 'form-status';
        statusEl.innerHTML = '';
      }, 2500);

    } catch (err) {
      console.error('Lỗi khi gửi đóng góp:', err);
      statusEl.className = 'form-status error';
      statusEl.innerHTML = '⚠️ Có lỗi xảy ra khi kết nối API. Vui lòng kiểm tra lại URL Apps Script.';
    } finally {
      submitBtn.disabled = false;
    }
  }

  // Submit Feedback Form
  if (DOM.formFeedback) {
    DOM.formFeedback.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusMsg = document.getElementById('fb-status-msg');
      const submitBtn = document.getElementById('btn-submit-feedback');

      const payload = {
        type: 'feedback',
        name: document.getElementById('fb-name').value.trim(),
        email: document.getElementById('fb-email').value.trim(),
        feedbackType: document.getElementById('fb-type').value,
        rating: currentRating,
        content: document.getElementById('fb-content').value.trim()
      };

      await sendToGoogleSheets(payload, statusMsg, submitBtn, DOM.formFeedback);
    });
  }

  // Dynamic Batch Vocab Rows Manager
  const vocabWordsList = document.getElementById('vocab-words-list');
  const btnAddWordRow = document.getElementById('btn-add-word-row');
  const vocabBatchCount = document.getElementById('vocab-batch-count');

  function updateBatchCount() {
    if (!vocabWordsList || !vocabBatchCount) return;
    const cards = vocabWordsList.querySelectorAll('.word-card-item');
    vocabBatchCount.textContent = `${cards.length} từ`;

    // Update word titles & delete button visibility
    cards.forEach((card, idx) => {
      const titleEl = card.querySelector('.word-card-title');
      const removeBtn = card.querySelector('.btn-remove-word');
      if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-font"></i> Từ vựng #${idx + 1}`;
      if (removeBtn) {
        if (cards.length > 1) removeBtn.classList.remove('hidden');
        else removeBtn.classList.add('hidden');
      }
    });
  }

  if (btnAddWordRow && vocabWordsList) {
    btnAddWordRow.addEventListener('click', () => {
      const currentCards = vocabWordsList.querySelectorAll('.word-card-item');
      const newIndex = currentCards.length;
      
      const newCard = document.createElement('div');
      newCard.className = 'word-card-item';
      newCard.dataset.index = newIndex;
      newCard.innerHTML = `
        <div class="word-card-header">
          <span class="word-card-title"><i class="fa-solid fa-font"></i> Từ vựng #${newIndex + 1}</span>
          <button type="button" class="btn-remove-word" title="Xóa từ này">&times;</button>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Từ vựng (Term) <span class="required">*</span></label>
            <input type="text" class="input-vocab-term" placeholder="Ví dụ: negotiate" required />
          </div>
          <div class="form-group">
            <label>Từ loại</label>
            <select class="input-vocab-pos">
              <option value="v.">Động từ (v.)</option>
              <option value="n.">Danh từ (n.)</option>
              <option value="adj.">Tính từ (adj.)</option>
              <option value="adv.">Trạng từ (adv.)</option>
              <option value="phrase">Cụm từ (phrase)</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>Định nghĩa tiếng Việt <span class="required">*</span></label>
          <input type="text" class="input-vocab-def" placeholder="Ví dụ: đàm phán, thương lượng" required />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Ví dụ minh họa</label>
            <input type="text" class="input-vocab-ex" placeholder="Ví dụ: They negotiated a new contract." />
          </div>
          <div class="form-group">
            <label>Link Hình ảnh (Image URL)</label>
            <input type="url" class="input-vocab-img" placeholder="https://example.com/image.jpg" />
          </div>
        </div>
      `;

      vocabWordsList.appendChild(newCard);
      updateBatchCount();
    });

    // Remove word card delegation
    vocabWordsList.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove-word')) {
        const card = e.target.closest('.word-card-item');
        if (card) {
          card.remove();
          updateBatchCount();
        }
      }
    });
  }

  // Submit Vocab Form (Batch)
  if (DOM.formVocab) {
    DOM.formVocab.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusMsg = document.getElementById('vocab-status-msg');
      const submitBtn = document.getElementById('btn-submit-vocab');
      const topic = document.getElementById('vocab-topic').value.trim();

      const wordCards = vocabWordsList ? vocabWordsList.querySelectorAll('.word-card-item') : [];
      const words = [];

      wordCards.forEach(card => {
        const term = card.querySelector('.input-vocab-term')?.value.trim() || '';
        const pos = card.querySelector('.input-vocab-pos')?.value || '';
        const definition = card.querySelector('.input-vocab-def')?.value.trim() || '';
        const example = card.querySelector('.input-vocab-ex')?.value.trim() || '';
        const image = card.querySelector('.input-vocab-img')?.value.trim() || '';

        if (term || definition) {
          words.push({ term, pos, definition, example, image });
        }
      });

      if (words.length === 0) {
        alert('Vui lòng nhập ít nhất 1 từ vựng!');
        return;
      }

      const payload = {
        type: 'vocabulary',
        topic: topic,
        words: words
      };

      await sendToGoogleSheets(payload, statusMsg, submitBtn, DOM.formVocab);

      // Reset dynamic cards to 1 card after success
      if (vocabWordsList) {
        const cards = vocabWordsList.querySelectorAll('.word-card-item');
        for (let i = 1; i < cards.length; i++) cards[i].remove();
        updateBatchCount();
      }
    });
  }

  // Progress Backup & Export/Import Controls
  if (DOM.btnExportProgress) {
    DOM.btnExportProgress.addEventListener('click', exportProgressToFile);
  }
  if (DOM.btnImportProgress && DOM.fileInputProgress) {
    DOM.btnImportProgress.addEventListener('click', () => DOM.fileInputProgress.click());
    DOM.fileInputProgress.addEventListener('change', importProgressFromFile);
  }
}

// ----------------------------------------------------
// BACKEND PROGRESS SYNC & BACKUP / RESTORE CONTROLLER
// ----------------------------------------------------
let syncTimer = null;

function updateSyncStatus(status, text) {
  if (!DOM.syncStatusBadge) return;
  DOM.syncStatusBadge.className = `sync-status-badge ${status}`;
  if (status === 'syncing') {
    DOM.syncStatusBadge.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> <span id="sync-status-text">${text || 'Đang lưu...'}</span>`;
  } else if (status === 'error') {
    DOM.syncStatusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span id="sync-status-text">${text || 'Lưu local'}</span>`;
  } else {
    DOM.syncStatusBadge.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> <span id="sync-status-text">${text || 'Đã đồng bộ ổ đĩa'}</span>`;
  }
}

function getProgressPayload() {
  const learnProgressObj = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('toeic_learn_progress_') || key.startsWith('toeic_fc_index_')) {
      try {
        learnProgressObj[key] = JSON.parse(localStorage.getItem(key));
      } catch (e) {
        learnProgressObj[key] = localStorage.getItem(key);
      }
    }
  }
  return {
    learnedWords: [...state.learnedWords],
    starredWords: [...state.starredWords],
    learnProgress: learnProgressObj,
    updatedAt: new Date().toISOString()
  };
}

async function syncProgressToBackend() {
  updateSyncStatus('syncing', 'Đang lưu...');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const payload = getProgressPayload();
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        updateSyncStatus('success', 'Đã đồng bộ ổ đĩa');
      } else {
        updateSyncStatus('success', 'Đã lưu (Browser)');
      }
    } catch (err) {
      updateSyncStatus('success', 'Đã lưu (Browser)');
    }
  }, 500);
}

async function loadProgressFromBackend() {
  try {
    const response = await fetch('/api/progress');
    if (response.ok) {
      const data = await response.json();
      let hasNewData = false;

      if (Array.isArray(data.learnedWords) && data.learnedWords.length > 0) {
        data.learnedWords.forEach(id => state.learnedWords.add(id));
        localStorage.setItem('toeic_learned_words', JSON.stringify([...state.learnedWords]));
        hasNewData = true;
      }
      if (Array.isArray(data.starredWords) && data.starredWords.length > 0) {
        data.starredWords.forEach(id => state.starredWords.add(id));
        localStorage.setItem('toeic_starred_words', JSON.stringify([...state.starredWords]));
        hasNewData = true;
      }
      if (data.learnProgress && typeof data.learnProgress === 'object') {
        Object.keys(data.learnProgress).forEach(key => {
          const val = typeof data.learnProgress[key] === 'object' ? JSON.stringify(data.learnProgress[key]) : data.learnProgress[key];
          localStorage.setItem(key, val);
        });
        hasNewData = true;
      }

      if (hasNewData) {
        renderDashboard();
        updateSyncStatus('success', 'Đã đồng bộ ổ đĩa');
      }
    }
  } catch (err) {
    console.warn('Backend sync API unavailable. Using LocalStorage.');
  }
}

function exportProgressToFile() {
  const payload = getProgressPayload();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `toeic_progress_backup_${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importProgressFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data.learnedWords)) {
        state.learnedWords = new Set(data.learnedWords);
        localStorage.setItem('toeic_learned_words', JSON.stringify([...state.learnedWords]));
      }
      if (Array.isArray(data.starredWords)) {
        state.starredWords = new Set(data.starredWords);
        localStorage.setItem('toeic_starred_words', JSON.stringify([...state.starredWords]));
      }
      if (data.learnProgress && typeof data.learnProgress === 'object') {
        Object.keys(data.learnProgress).forEach(key => {
          localStorage.setItem(key, JSON.stringify(data.learnProgress[key]));
        });
      }

      await syncProgressToBackend();
      renderDashboard();
      if (state.currentWordList && state.currentWordList.length > 0) renderFlashcard();
      alert('🎉 Khôi phục tiến độ học thành công!');
    } catch (err) {
      alert('⚠️ File sao lưu JSON không hợp lệ: ' + err.message);
    }
  };
  reader.readAsText(file);
}
