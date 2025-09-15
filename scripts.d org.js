 // --- Firebase Configuration ---
  const firebaseConfig = { apiKey: "AIzaSyDPkUWIrsibI-hzKJ8ljhvawdJ9Nq4-cpE", authDomain: "checkmysteno.firebaseapp.com", projectId: "checkmysteno", storageBucket: "checkmysteno.appspot.com", messagingSenderId: "719325115943", appId: "1:719325115943:web:0dd50a67978816d42a8002" };
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();

  // --- Global State Variables ---
  let player;
  let originalText = "", wordCount = 0, currentPassageTitle = "";
  let totalVideoDuration = 0, currentPlaybackRate = 1, progressInterval;
  let g_collection = "", g_docId = "", candidateId;
  let transcriptionTimerTotalTime = 0, timeLeft = 0, timer = null, timerStarted = false;
  let g_alignment = [];
  let g_lastTypedText = ""; 
  let g_fullMistakes = 0, g_halfMistakes = 0;
  let isReevaluateModeActive = false;
  
  // --- Initialization ---
  document.addEventListener("DOMContentLoaded", () => {
    initializePracticeKC();
  });
  
  async function initializePracticeKC() {
    const accessCode = localStorage.getItem("currentAccessCode");
    if (!accessCode) {
        showErrorModal("Access Denied", "No access code found. Please log in first.");
        document.body.innerHTML = '';
        return;
    }
    candidateId = accessCode;
    document.getElementById('candidate-name-display').textContent = candidateId.toUpperCase();
    
    // Core setup functions
    setupProgressBar();
    setupExtraControls();
    setLogoSource();
    
    // Initial view is always the selection hub
    showView('selection-view');
    initializeEventListeners();
  }

  function setLogoSource() {
    // Paste your Base64 codes in the variables below.
    const sscLogoBase64 = ""; 
    const candidatePhotoBase64 = "";

    const logoImg = document.getElementById('ssc-logo-img');
    const candidatePhotoImg = document.querySelector('.ssc-candidate-photo img');

    if (logoImg && sscLogoBase64) {
        logoImg.src = sscLogoBase64;
    }
    if (candidatePhotoImg && candidatePhotoBase64) {
        candidatePhotoImg.src = candidatePhotoBase64;
    }
  }
  
  // --- UI AND VIEW MANAGEMENT ---
  function showView(viewId) {
      document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
      document.getElementById('exam-view').style.display = 'none';
      
      const viewToShow = document.getElementById(viewId);
      if (viewToShow) {
        viewToShow.style.display = 'block';
      }
      
      if (viewId === 'exam-view') {
        document.querySelector('.app-container').style.display = 'none';
        document.getElementById('exam-view').style.display = 'flex';
      } else {
        document.querySelector('.app-container').style.display = 'block';
      }
      
      if (viewId === 'selection-view') {
          showSelectionHub();
          clearState();
          if(player && typeof player.stopVideo === 'function') player.stopVideo();
      }
  }
  
  function showSelectionHub() {
      document.getElementById('dictation-type-hub').style.display = 'grid';
      document.querySelectorAll('.grid-container').forEach(c => c.style.display = 'none');
  }

  function showDictationGrid(type) {
      document.getElementById('dictation-type-hub').style.display = 'none';
      document.querySelectorAll('.grid-container').forEach(c => c.style.display = 'none');
      
      const containerId = `${type}-view-container`;
      document.getElementById(containerId).style.display = 'block';
  }
  
  function goHome() {
      if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
      showView('selection-view');
  }
  
  function clearStateAndGoBack() {
      showView('selection-view');
  }
  
  // --- DATA LOADING AND GRID RENDERING ---
  async function loadAndRenderCategory(categoryConfig) {
      showDictationGrid(categoryConfig.type);
      const grid = document.getElementById(categoryConfig.gridId);
      grid.innerHTML = '<div class="spinner"></div>';

      try {
          const indexDocRef = db.collection(categoryConfig.indexCollection).doc('main');
          const indexDoc = await indexDocRef.get();

          if (!indexDoc.exists) throw new Error(`${categoryConfig.name} index not found.`);
          
          const indexData = indexDoc.data();
          const totalPassages = indexData.totalPassages || 50;
          const passageStatusMap = indexData.passages || {};

          grid.innerHTML = ''; 

          const renderCard = (docId, data, passageNum) => {
              const card = document.createElement('div');
              card.className = 'passage-card';
              card.dataset.collection = categoryConfig.dataCollection;
              card.dataset.docId = docId;

              let status = data.status || 'unavailable';
              let title = data.title || `${categoryConfig.name} Passage ${passageNum || docId}`;
              let meta = data.meta || categoryConfig.defaultMeta;
              
              let statusTag = '', buttonHtml = '';
              switch(status) {
                  case 'available':
                      statusTag = `<div class="status-tag attempted">Available</div>`;
                      buttonHtml = `<button class="take-test-btn">Take Test</button>`;
                      break;
                  case 'scheduled':
                      statusTag = `<div class="status-tag">Scheduled: ${data.scheduledDate || 'TBA'}</div>`;
                      buttonHtml = `<button class="take-test-btn" disabled>Scheduled</button>`;
                      break;
                  default:
                      statusTag = `<div class="status-tag">Not Available</div>`;
                      buttonHtml = `<button class="take-test-btn" disabled>Not Available</button>`;
                      break;
              }

              card.innerHTML = `
                  <div class="card-header">
                      <div class="card-title-group">
                          <span class="status-dot ${status === 'available' ? 'attempted' : ''}"></span>
                          <h3>${title}</h3>
                      </div>
                      ${statusTag}
                  </div>
                  <div class="card-meta">${meta}</div>
                  <div class="card-buttons">${buttonHtml}</div>
              `;
              grid.appendChild(card);
          };

          if (categoryConfig.docPrefix) {
              for (let i = 1; i <= totalPassages; i++) {
                  const docId = `${categoryConfig.docPrefix}_${String(i).padStart(3, '0')}`;
                  const data = passageStatusMap[docId] || {};
                  renderCard(docId, data, i);
              }
          } else {
              const sortedKeys = Object.keys(passageStatusMap).sort().reverse(); 
              for (const docId of sortedKeys) {
                  const data = passageStatusMap[docId];
                  renderCard(docId, data, null);
              }
          }

      } catch (error) {
          console.error(`Error loading ${categoryConfig.name}:`, error);
          grid.innerHTML = `<p>Could not load ${categoryConfig.name.toLowerCase()}. Please try again.</p>`;
      }
  }

  function loadProgressiveDictations() {
    loadAndRenderCategory({
        type: 'progressive', name: 'Progressive Dictations', gridId: 'progressive-grid',
        indexCollection: 'progressive_index', dataCollection: 'progressive_passages',
        docPrefix: 'prog', defaultMeta: 'Progressive Magazine'
    });
  }
  
  function loadSscPreviousYearDictations() {
      loadAndRenderCategory({
          type: 'ssc-previous-year',
          name: 'SSC Previous Year Dictations',
          gridId: 'ssc-previous-year-grid',
          indexCollection: 'sscPreviousYear_index',
          dataCollection: 'sscPreviousYear_passages',
          docPrefix: null,
          defaultMeta: 'Official SSC Exam Paper'
      });
  }

  function loadGeneralMatterDictations() {
    loadAndRenderCategory({
        type: 'general-matter', name: 'General Matter Dictations', gridId: 'general-matter-grid',
        indexCollection: 'generalMatter_index', dataCollection: 'generalMatter_passages',
        docPrefix: 'gen', defaultMeta: 'General Topic'
    });
  }

  function loadImportantKCDictations() {
    loadAndRenderCategory({
        type: 'important-kc', name: 'Most Important Kailash Chandra', gridId: 'important-kc-grid',
        indexCollection: 'importantKC_index', dataCollection: 'importantKC_passages',
        docPrefix: 'kc', defaultMeta: 'Kailash Chandra Magazine'
    });
  }

  async function loadPractice(collectionName, docId) {
    g_collection = collectionName;
    g_docId = docId;

    if (!collectionName || !docId) {
        showErrorModal("Passage Error", "Could not identify the passage.");
        return;
    }
    
    document.getElementById('fullPageLoader').style.display = 'flex';

    try {
        const docRef = db.collection(collectionName).doc(docId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) throw new Error("Passage data not found.");
        
        const passageData = docSnap.data();
        originalText = passageData.originalText;
        wordCount = passageData.wordCount;
        currentPassageTitle = passageData.title;
        
        saveState({ view: 'player-view', g_collection, g_docId, originalText, wordCount, audioUrl: passageData.audioUrl, title: currentPassageTitle });

        showView('player-view');
        setPlayerLoading(true);
        document.getElementById('player-subtitle').textContent = currentPassageTitle;
        loadVideo(passageData.audioUrl, false);

    } catch (error) { 
        showErrorModal("Loading Error", "Error: " + error.message);
        showView('selection-view');
    } finally {
        document.getElementById('fullPageLoader').style.display = 'none';
    }
  }

  // --- STATE MANAGEMENT ---
  function saveState(state) { localStorage.setItem('stenoState', JSON.stringify(state)); }
  function clearState() { localStorage.removeItem('stenoState'); }
  function restoreSession() {
      const savedState = JSON.parse(localStorage.getItem('stenoState'));
      if (!savedState || savedState.view !== 'exam-view') {
          showView('selection-view');
          return;
      }
      g_collection = savedState.g_collection;
      g_docId = savedState.g_docId;
      originalText = savedState.originalText;
      wordCount = savedState.wordCount;
      currentPassageTitle = savedState.title;
      showView('exam-view');
      document.documentElement.requestFullscreen().catch(err => {});
      document.getElementById('typingBox').value = savedState.typedText || '';
      transcriptionTimerTotalTime = savedState.totalTime;
      timeLeft = savedState.timeLeft;
      timerStarted = true;
      startTimer();
  }
  
  // --- PLAYER AND EXAM LOGIC ---
  function onYouTubeIframeAPIReady() {}
  function extractVideoID(url) { if (typeof url !== 'string') return null; const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/; return (url.match(regex) || [])[1] || null; }
  function loadVideo(url, autoPlay = false) {
    const videoId = extractVideoID(url);
    if (!videoId) {
        showErrorModal("Invalid URL", "Invalid YouTube URL provided: " + url);
        return;
    }
    const onPlayerReady = (event) => {
    totalVideoDuration = event.target.getDuration();
    setPlayerLoading(false);
    setPlaybackSpeed();
};
    if (player && typeof player.loadVideoById === 'function' && player.getIframe()?.isConnected) {
        player.loadVideoById(videoId);
        const readyCheck = setInterval(() => {
            if (player.getDuration() > 0 && player.getPlayerState() !== -1) {
                clearInterval(readyCheck);
                onPlayerReady({target: player});
            }
        }, 100);
    } else {
        if(player && typeof player.destroy === 'function') player.destroy();
        player = new YT.Player('player', {
            height: '1',
            width: '1',
            videoId,
            playerVars: { 'autoplay': autoPlay ? 1 : 0, 'controls': 0 },
            events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
        });
    }
  }
  function onPlayerStateChange(event){
    const playBtn = document.getElementById("playBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    if(event.data === YT.PlayerState.PLAYING){
        playBtn.style.display = 'none'; pauseBtn.style.display = 'flex';
        trackProgress();
    } else {
        playBtn.style.display = 'flex'; pauseBtn.style.display = 'none';
        clearInterval(progressInterval);
    }
  }
  function setPlaybackSpeed(){
      if(!player||!player.setPlaybackRate)return;
      const targetWPM = parseInt(document.getElementById('wpmSpeed').value);
      if(isNaN(targetWPM)||!wordCount||!totalVideoDuration) currentPlaybackRate = 1;
      else { const originalWPM=wordCount/(totalVideoDuration/60); currentPlaybackRate=originalWPM>0?targetWPM/originalWPM:1; }
      player.setPlaybackRate(currentPlaybackRate);
      updateVideoTimeDisplay();
  }
  function togglePlay(){if(!player||!player.getPlayerState)return;player.getPlayerState()===YT.PlayerState.PLAYING?player.pauseVideo():player.playVideo();}
  function restartVideo() { if(player) { player.seekTo(0, true); player.playVideo(); } }
  function seekRelative(seconds) { if (!player || !player.getCurrentTime) return; const newTime = player.getCurrentTime() + seconds; player.seekTo(newTime, true); }
  function trackProgress(){
      clearInterval(progressInterval);
      progressInterval = setInterval(() => {
          if(!player || typeof player.getCurrentTime !== 'function' || !totalVideoDuration) return;
          updateVideoTimeDisplay();
      }, 250);
  }
  function setupProgressBar(){
      document.getElementById("progressBar").addEventListener("click", function(e){
          if(!player || !player.seekTo || !totalVideoDuration) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickPosition = (e.clientX - rect.left) / rect.width;
          player.seekTo(clickPosition * totalVideoDuration, true);
      });
  }
  function formatTime(s){const m=Math.floor(s/60).toString().padStart(2,'0');const sec=Math.round(s%60).toString().padStart(2,'0');return isNaN(m)||isNaN(sec)?"00:00":`${m}:${sec}`}
  function updateVideoTimeDisplay() {
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const rawCurrentTime = player.getCurrentTime();
      const effectiveCurrentTime = rawCurrentTime / currentPlaybackRate;
      const effectiveTotalDuration = totalVideoDuration / currentPlaybackRate;
      document.getElementById("progress-fill").style.width = (rawCurrentTime / totalVideoDuration) * 100 + "%";
      document.getElementById('current-time').innerText = formatTime(effectiveCurrentTime);
      document.getElementById('total-time').innerText = formatTime(effectiveTotalDuration);
  }
  function setPlayerLoading(isLoading) {
      document.getElementById('player-loader').style.display = isLoading ? 'flex' : 'none';
      document.querySelectorAll('#player-view button, #player-view select').forEach(el => {
          if(el.id !== 'startTranscriptionBtn') el.disabled = isLoading;
      });
      document.getElementById('startTranscriptionBtn').disabled = true;
      if (!isLoading) {
          document.getElementById('startTranscriptionBtn').disabled = false;
      }
  }
  function setupExtraControls() {
      document.getElementById('volume-slider').addEventListener('input', (e) => player?.setVolume(e.target.value));
      document.addEventListener('keydown', (e) => {
          if (document.getElementById('player-view').style.display === 'block') {
             if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); togglePlay(); }
             if (e.code === 'ArrowLeft') { e.preventDefault(); seekRelative(-5); }
             if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(5); }
          }
      });
      const today = new Date();
      document.getElementById('exam-date').innerHTML = `<b>Exam Date:</b> ${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
  }
  function adjustSpeed(amount) {
      const select = document.getElementById('wpmSpeed');
      const currentIndex = select.selectedIndex;
      const newIndex = currentIndex + (amount / 5);
      if (newIndex >= 0 && newIndex < select.options.length) {
          select.selectedIndex = newIndex;
          setPlaybackSpeed();
      }
  }
  function showInstructions() {
      if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
      document.getElementById('instructions-modal').classList.add('visible');
  }
  function startTranscriptionTest() {
      document.getElementById('instructions-modal').classList.remove('visible');
      document.documentElement.requestFullscreen().catch(err => console.warn(`Fullscreen failed: ${err.message}.`));
      showView('exam-view');
      transcriptionTimerTotalTime = parseInt(document.getElementById('timer-select').value) * 60;
      timeLeft = transcriptionTimerTotalTime;
      document.getElementById("typingTimerDisplay").innerText = formatTime(timeLeft);
      document.getElementById('typingBox').value = '';
      document.getElementById('typingBox').focus();
      document.getElementById('typingBox').addEventListener('keydown', handleFirstKeydown);
      
      const currentState = JSON.parse(localStorage.getItem('stenoState'));
      saveState({ ...currentState, view: 'exam-view', totalTime: transcriptionTimerTotalTime, timeLeft: timeLeft, typedText: '' });
  }
  function handleFirstKeydown() { if (!timerStarted) { timerStarted = true; startTimer(); document.getElementById('typingBox').removeEventListener('keydown', handleFirstKeydown); } }
  function startTimer() {
      if (timer) return;
      timer = setInterval(() => {
          if (--timeLeft < 0) {
              clearInterval(timer); alert("Time is up! Submitting automatically."); submitTranscription();
          } else {
              document.getElementById("typingTimerDisplay").innerText = formatTime(timeLeft);
              const currentState = JSON.parse(localStorage.getItem('stenoState'));
              if(currentState) saveState({ ...currentState, timeLeft, typedText: document.getElementById('typingBox').value });
          }
      }, 1000);
  }
  function resetTimer() {
    if (timer) clearInterval(timer);
    timer = null; timerStarted = false; timeLeft = transcriptionTimerTotalTime;
    document.getElementById("typingTimerDisplay").innerText = formatTime(timeLeft);
  }
  function normalizeTextForComparison(text) { if (!text) return ""; let normalized = " " + text.toLowerCase() + " "; const replacements = { ' & ': ' and ', ' % ': ' percent ', ' per cent ': ' percent ', ' honourable ': ' hon ', ' honble ': ' hon ', ' hon\'ble ': ' hon ', ' doctor ': ' dr ', ' mister ': ' mr ', ' misses ': ' mrs ', ' governments ': ' govts ', ' government ': ' govt ', ' special ': ' spl ', ' through ': ' thru ', ' department ': ' dept ', ' association ': ' assoc ', ' first ': ' 1st ', ' second ': ' 2nd ', ' third ': ' 3rd ', ' rupees ': ' rs ', ' rupee ': ' re ', ' advertisement ': ' advt ', ' additional ': ' addl ', ' secretary ': ' secy ', ' versus ': ' vs ', ' limited ': ' ltd ', ' private ': ' pvt ', ' number ': ' no ', ' ma\'am ': ' madam ' }; for(const [key, val] of Object.entries(replacements)) { normalized = normalized.replace(new RegExp(key, 'g'), val); } return normalized.replace(/\s+/g, ' ').trim(); }
  const numberWordsMap = { 'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100, 'thousand': 1000, 'million': 1000000, 'billion': 1000000000 };
  function wordToNumber(word) { const cleanWord = (word || "").toLowerCase().replace(/[.,()!?;:'"]+$/,'').replace(/^[.,()!?;:'"]+/,''); if (numberWordsMap[cleanWord] !== undefined) return numberWordsMap[cleanWord]; if (!isNaN(parseFloat(cleanWord)) && isFinite(cleanWord)) return parseFloat(cleanWord); return null; }
  function getSubstitutionCost(o, t, o_orig, t_orig) { const num_o_orig = wordToNumber(o_orig); const num_t_orig = wordToNumber(t_orig); if (num_o_orig !== null && num_t_orig !== null && num_o_orig === num_t_orig) return 0; const clean = s => (s || "").replace(/[.,!?;:'"]+$/,''); const ol_norm = clean(o).toLowerCase(); const tl_norm = clean(t).toLowerCase(); const ol_orig = clean(o_orig).toLowerCase(); const tl_orig = clean(t_orig).toLowerCase(); if (ol_norm === tl_norm) return 0; if (levenshtein(ol_orig, tl_orig) <= 3) return 0.5; return 100; }
  function levenshtein(a,b){if(!a||!b)return(a||"").length+(b||"").length;const dp=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=0;i<=a.length;i++)dp[i][0]=i;for(let j=0;j<=b.length;j++)dp[0][j]=j;for(let i=1;i<=a.length;i++){for(let j=1;j<=b.length;j++){const cost=a[i-1]===b[j-1]?0:1;dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost)}}return dp[a.length][b.length]}
  function escapeHtml(s=""){ return s.toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function calculateAndDisplayResults(originalTextForEval, typedTextForEval, isReevaluation = false) {
    const timeTakenSeconds = (transcriptionTimerTotalTime - timeLeft) > 0 ? (transcriptionTimerTotalTime - timeLeft) : 0;
    const originalWords = originalTextForEval.trim().split(/\s+/).filter(Boolean);
    const typedWords = typedTextForEval.trim().split(/\s+/).filter(Boolean);
    const normOriginalWords = normalizeTextForComparison(originalTextForEval).split(' ');
    const normTypedWords = normalizeTextForComparison(typedTextForEval).split(' ');
    g_alignment = [];
    const dp = Array.from({ length: normOriginalWords.length + 1 }, () => Array(normTypedWords.length + 1).fill(0));
    const trace = Array.from({ length: normOriginalWords.length + 1 }, () => Array(normTypedWords.length + 1).fill(""));
    for (let i = 0; i <= normOriginalWords.length; i++) { dp[i][0] = i; trace[i][0] = 'del'; }
    for (let j = 0; j <= normTypedWords.length; j++) { dp[0][j] = j; trace[0][j] = 'ins'; }
    for (let i = 1; i <= normOriginalWords.length; i++) {
        for (let j = 1; j <= normTypedWords.length; j++) {
            const cost = getSubstitutionCost(normOriginalWords[i - 1], normTypedWords[j - 1], originalWords[i-1] || "", typedWords[j-1] || "");
            const subCost = dp[i - 1][j - 1] + cost;
            const insCost = dp[i][j - 1] + 1;
            const delCost = dp[i - 1][j] + 1;
            const minCost = Math.min(subCost, insCost, delCost);
            dp[i][j] = minCost;
            if (minCost === subCost) { trace[i][j] = (cost === 0) ? "match" : "sub"; } else if (minCost === insCost) { trace[i][j] = "ins"; } else { trace[i][j] = "del"; }
        }
    }
    let minCost = Infinity, bestEndRow = 0;
    if (normTypedWords.length > 0 && normTypedWords[0] !== "") {
        bestEndRow = normOriginalWords.length;
        for (let i = 0; i <= normOriginalWords.length; i++) { if (dp[i][normTypedWords.length] < minCost) { minCost = dp[i][normTypedWords.length]; bestEndRow = i; } }
    } else { minCost = normOriginalWords.length; bestEndRow = 0; }
    for (let k = normOriginalWords.length - 1; k >= bestEndRow; k--) { g_alignment.unshift({ type: "del", o: originalWords[k] }); }
    let i = bestEndRow, j = normTypedWords.length;
    while (i > 0 || j > 0) {
        const action = trace[i]?.[j] || (i > 0 ? 'del' : 'ins');
        if ((action === "match" || action === "sub") && i > 0 && j > 0) { g_alignment.unshift({ type: action, o: originalWords[i-1], t: typedWords[j-1] }); i--; j--; } else if ((action === "ins" || i === 0) && j > 0) { g_alignment.unshift({ type: "ins", t: typedWords[j-1] }); j--; } else if ((action === "del" || j === 0) && i > 0) { g_alignment.unshift({ type: "del", o: originalWords[i-1] }); i--; } else { break; }
    }
    let fullMistakes = 0, halfMistakes = 0, resultHtmlContent = "";
    for (let k = 0; k < g_alignment.length; k++) {
        const entry = g_alignment[k];
        let wordHtml = '', tooltipText = '', statusIcon = '✔️', mistakeType = 'correct';
        if (entry.type === "match") {
            const o = entry.o, t = entry.t; const oBase = o.replace(/[.,]$/, ''); const tBase = t.replace(/[.,]$/, ''); let mistakeHandled = false;
            if (oBase.toLowerCase() === tBase.toLowerCase()) {
                if (oBase !== tBase) { mistakeType = 'capitalization'; tooltipText = `Capitalization: Typed "${escapeHtml(t)}" (was "${escapeHtml(o)}")`; wordHtml = `<span class='highlight capitalization' data-mistake-type='${mistakeType}' data-tooltip-text='${tooltipText}'>${escapeHtml(t)}</span>`; halfMistakes++; mistakeHandled = true; statusIcon = '⚠️'; }
                if (!mistakeHandled) { const oHasDot = o.endsWith('.'); const tHasDot = t.endsWith('.'); const oHasComma = o.endsWith(','); const tHasComma = t.endsWith(','); const dotMismatch = oHasDot !== tHasDot; const commaMismatch = document.getElementById("includeComma")?.checked && (oHasComma !== tHasComma); if (dotMismatch || commaMismatch) { mistakeType = 'punctuation'; tooltipText = `Punctuation: Typed "${escapeHtml(t)}" (was "${escapeHtml(o)}")`; wordHtml = `<span class='highlight punctuation' data-mistake-type='${mistakeType}' data-tooltip-text='${tooltipText}'>${escapeHtml(t)}</span>`; halfMistakes++; mistakeHandled = true; statusIcon = '⚠️'; } }
            }
            if (!mistakeHandled) { wordHtml = `<span>${escapeHtml(t) || ''}</span>`; tooltipText = "Correct"; }
        } else if (entry.type === "del") { mistakeType = 'omission'; tooltipText = `Omitted: "${escapeHtml(entry.o)}"`; wordHtml = `<span class='highlight omission' data-mistake-type='${mistakeType}' data-tooltip-text='${tooltipText}'>(${escapeHtml(entry.o)})</span>`; fullMistakes++; statusIcon = '❌';
        } else if (entry.type === "ins") { mistakeType = 'extra'; tooltipText = `Extra Word: "${escapeHtml(entry.t)}"`; wordHtml = `<span class='highlight extra' data-mistake-type='${mistakeType}' data-tooltip-text='${tooltipText}'>${escapeHtml(entry.t)}</span>`; fullMistakes++; statusIcon = '❌';
        } else if (entry.type === "sub") { mistakeType = 'spelling'; const o = entry.o, t = entry.t; tooltipText = `You typed: "${escapeHtml(t)}" (was "${escapeHtml(o)}")`; wordHtml = `<span class='highlight spelling' data-mistake-type='${mistakeType}' data-tooltip-text='${tooltipText}'>${escapeHtml(t)} (<b>${escapeHtml(o)}</b>)</span>`; halfMistakes++; statusIcon = '⚠️'; }
        entry.mistakeType = mistakeType; entry.statusIcon = statusIcon;
        resultHtmlContent += `<span class="word-wrapper" data-index="${k}" data-status-icon="${statusIcon}" data-mistake-type="${mistakeType}">${wordHtml}</span> `;
    }
    g_fullMistakes = fullMistakes; g_halfMistakes = halfMistakes;
    const totalWords=originalWords.length; const typedWordCount=typedWords.length; const mistakeScore=fullMistakes+halfMistakes*0.5;
    const accuracy = Math.max(0, (((totalWords - mistakeScore) / totalWords) * 100)).toFixed(2);
    const typedCharCount = typedTextForEval.length; let finalTypingSpeed = timeTakenSeconds > 0 ? (typedWordCount / (timeTakenSeconds / 60)).toFixed(2) : "0.00";
    if (isReevaluation) {
        const reevalContainer = document.getElementById('reevaluated-accuracy-container');
        if(reevalContainer) { reevalContainer.innerHTML = `<div class="stats-row"><div class="stat-pill" style="background-color: var(--accent-purple);">Re-evaluated Accuracy: ${accuracy}%</div></div>`; }
        document.getElementById('editableTypedText').innerHTML = resultHtmlContent;
        let originalTextHtml = g_alignment.map((entry, index) => { if (entry.type === 'ins') return ''; return `<span class="word-wrapper" data-index="${index}" data-mistake-type="${entry.mistakeType}">${escapeHtml(entry.o || '')}</span>`; }).join(' ');
        document.getElementById('editableOriginalText').innerHTML = originalTextHtml;
        initializeResultInteractivity();
    } else {
        const resultData = { dictationName: currentPassageTitle, totalWords, typedWords: typedWordCount, fullMistakes, halfMistakes, mistakePercent: (mistakeScore / totalWords * 100).toFixed(2), accuracy, typedKeystrokes: typedCharCount, typingSpeed: finalTypingSpeed, testDate: new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }), highlightedHtml: resultHtmlContent };
        renderResultSheet(resultData, originalTextForEval);
        showView('results-view');
    }
}
  function renderResultSheet(data, originalTextForDisplay) {
    const container = document.getElementById('resultSheetContainer');
    let originalTextHtml = g_alignment.map((entry, index) => { let mistakeType = entry.mistakeType || 'correct'; if (entry.type === 'ins') return ''; return `<span class="word-wrapper" data-index="${index}" data-mistake-type="${mistakeType}">${escapeHtml(entry.o || '')}</span>`; }).join(' ');
    container.innerHTML = ` <div class="result-sheet-container"> <h1>Result Sheet:</h1> <div class="stats-container"> <div class="stats-row"><div class="stat-pill full-width">${escapeHtml(data.dictationName)}</div></div> <div class="stats-row"> <div class="stat-pill"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>Total Words: ${data.totalWords}</div> <div class="stat-pill"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13.25a.75.75 0 00-1.5 0v6.5c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75v-5.5z" clip-rule="evenodd" /></svg>Typed Words: ${data.typedWords}</div> <div class="stat-pill"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13.25a.75.75 0 00-1.5 0v6.5c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75v-5.5z" clip-rule="evenodd" /></svg>Typing Speed: ${data.typingSpeed} WPM</div> <div class="stat-pill red"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" /></svg>Full Mistakes: ${data.fullMistakes}</div> <div class="stat-pill amber"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>Half Mistakes: ${data.halfMistakes}</div> </div> <div class="stats-row"> <div class="stat-pill">Total % of Mistakes: ${data.mistakePercent}%</div> <div class="stat-pill"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>Accuracy: ${data.accuracy}%</div> </div> <div id="reevaluated-accuracy-container"></div> <div class="stats-row"><div class="stat-pill">Test Date: ${escapeHtml(data.testDate)}</div></div> </div> <div class="legend-container"> <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-additions);"></span> Additions / Substitutions</div> <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-omissions);"></span> Omissions</div> <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-spelling);"></span> Spelling Mistakes</div> <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-capitalization);"></span> Capitalization Mistakes</div> <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-punctuation);"></span> Punctuation Mistakes</div> </div> <div class="result-controls"> <div class="filter-section"> <label for="mistakeFilter">Filter Mistakes:</label> <select id="mistakeFilter" onchange="filterMistakes(this.value)"> <option value="all">Show All Mistakes</option> <option value="omission-substitution">Omissions & Additions</option> <option value="omission">Omissions Only</option> <option value="extra">Additions Only</option> <option value="spelling">Spelling Only</option> <option value="capitalization">Capitalization Only</option> <option value="punctuation">Punctuation Only</option> </select> </div> <div class="action-section"><div class="reevaluate-wrapper"><button id="toggleReevaluateBtn" class="view-switch-btn">Enter Re-evaluate Mode</button><span class="tooltip-icon" data-tooltip="Enter a special mode to edit BOTH your text and the original text, then recalculate your score to see the difference.">?</span></div><button id="reportErrorBtn" class="view-switch-btn" style="background-color: #f97316; color: white;">Report Error</button></div> <button id="viewSwitchBtn" class="view-switch-btn">Switch to Top/Bottom View</button> </div> <div id="comparisonColumns" class="columns view-side-by-side"> <div class="col" id="typedCol"> <strong>Your Transcription:</strong> <p id="editableTypedText" contenteditable="false">${data.highlightedHtml}</p> </div> <div class="col" id="originalCol"> <strong>Original Text (Click to edit):</strong> <p id="editableOriginalText" contenteditable="false">${originalTextHtml}</p> </div> </div> </div>`; 
    if (!localStorage.getItem('hideResultsWelcome')) { document.getElementById('resultsWelcomeModal').classList.add('visible'); }
    const switchBtn = document.getElementById('viewSwitchBtn'); const columnsContainer = document.getElementById('comparisonColumns'); const typedCol = document.getElementById('typedCol'); const originalCol = document.getElementById('originalCol'); switchBtn.addEventListener('click', () => { const isSideBySide = columnsContainer.classList.contains('view-side-by-side'); if (isSideBySide) { columnsContainer.classList.remove('view-side-by-side'); columnsContainer.classList.add('view-top-bottom'); columnsContainer.prepend(typedCol); switchBtn.textContent = 'Switch to Side-by-Side View'; } else { columnsContainer.classList.remove('view-top-bottom'); columnsContainer.classList.add('view-side-by-side'); columnsContainer.appendChild(originalCol); switchBtn.textContent = 'Switch to Top/Bottom View'; } }); 
    document.getElementById('printReportBtn').addEventListener('click', () => window.print()); 
    initializeResultInteractivity(); 
}
function initializeResultInteractivity() {
    const columns = document.getElementById('comparisonColumns'); if (!columns) return;
    const originalTextP = document.getElementById('editableOriginalText'); if (originalTextP) { originalTextP.contentEditable = false; }
    columns.addEventListener('click', (e) => { const target = e.target.closest('.word-wrapper'); if (!target) return; const wordIndex = target.dataset.index; if (wordIndex === null) return; document.querySelectorAll('.active-highlight').forEach(el => el.classList.remove('active-highlight')); document.querySelectorAll(`.word-wrapper[data-index="${wordIndex}"]`).forEach(el => el.classList.add('active-highlight')); const parentCol = target.closest('.col'); if (!parentCol) return; const otherColId = parentCol.id === 'typedCol' ? 'originalCol' : 'typedCol'; const correspondingWord = document.querySelector(`#${otherColId} .word-wrapper[data-index="${wordIndex}"]`); if (correspondingWord) { correspondingWord.scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
    document.getElementById('toggleReevaluateBtn').addEventListener('click', toggleReevaluateMode);
    document.getElementById('reportErrorBtn').addEventListener('click', showReportModal);
}
function getCleanTextFromAlignment(type = 'typed') {
    if (!g_alignment || g_alignment.length === 0) return "";
    let textParts = []; g_alignment.forEach(entry => { if (type === 'typed') { if (entry.type === 'match' || entry.type === 'sub' || entry.type === 'ins') { textParts.push(entry.t || ''); } } else { if (entry.type === 'match' || entry.type === 'sub' || entry.type === 'del') { textParts.push(entry.o || ''); } } });
    return textParts.join(' ').replace(/\s+/g, ' ').trim();
}
function toggleReevaluateMode() {
    isReevaluateModeActive = !isReevaluateModeActive;
    const resultsView = document.getElementById('results-view'); const toggleBtn = document.getElementById('toggleReevaluateBtn'); const typedTextP = document.getElementById('editableTypedText'); const originalTextP = document.getElementById('editableOriginalText');
    if (isReevaluateModeActive) { resultsView.classList.add('reevaluate-mode-active'); toggleBtn.textContent = 'Calculate & Exit Mode'; toggleBtn.style.backgroundColor = 'var(--accent-purple)'; toggleBtn.style.color = 'white'; const cleanTypedText = getCleanTextFromAlignment('typed'); const cleanOriginalText = getCleanTextFromAlignment('original'); typedTextP.innerHTML = cleanTypedText; originalTextP.innerHTML = cleanOriginalText; typedTextP.contentEditable = true; originalTextP.contentEditable = true; alert("Re-evaluate Mode is ON. You can now edit both your transcription and the original text.");
    } else { resultsView.classList.remove('reevaluate-mode-active'); toggleBtn.textContent = 'Enter Re-evaluate Mode'; toggleBtn.style.backgroundColor = ''; toggleBtn.style.color = ''; const correctedOriginalText = originalTextP.innerText; const correctedTypedText = typedTextP.innerText; g_lastTypedText = correctedTypedText; typedTextP.contentEditable = false; originalTextP.contentEditable = false; if (!correctedOriginalText) { alert("The original text cannot be empty for re-evaluation."); calculateAndDisplayResults(originalText, g_lastTypedText, true); return; } calculateAndDisplayResults(correctedOriginalText, correctedTypedText, true); alert("Score has been re-evaluated with your corrections. Note: This updated score is for your reference only and is not saved."); }
}
function submitTranscription() {
    const timeTakenSeconds = (transcriptionTimerTotalTime - timeLeft) > 0 ? (transcriptionTimerTotalTime - timeLeft) : 0;
    clearState();
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    try {
        if (!originalText) { throw new Error("Original transcript not found. Please try the test again."); }
        const typedText = document.getElementById('typingBox').value; g_lastTypedText = typedText; 
        if (typedText.trim().split(/\s+/).filter(Boolean).length < 10) { alert("Please type at least 10 words."); goHome(); return; }
        calculateAndDisplayResults(originalText, g_lastTypedText, false);
        const totalWords = originalText.trim().split(/\s+/).filter(Boolean).length; const mistakeScore = g_fullMistakes + g_halfMistakes * 0.5; const accuracy = Math.max(0, (((totalWords - mistakeScore) / totalWords) * 100)).toFixed(2); const typingSpeed = timeTakenSeconds > 0 ? ((typedText.trim().split(/\s+/).filter(Boolean).length) / (timeTakenSeconds / 60)).toFixed(2) : "0.00"; const strokesPerMinute = timeTakenSeconds > 0 ? (typedText.length / timeTakenSeconds) * 60 : 0; const includeCommaMistakes = document.getElementById("includeComma")?.checked || false;
        saveProgressToLocalStorage({ accuracy, typingSpeed });
        saveTranscriptionAttempt(originalText, typedText, accuracy, g_fullMistakes, g_halfMistakes, strokesPerMinute.toFixed(2), timeTakenSeconds, totalWords, includeCommaMistakes);
    } catch (error) { console.error("!!! ERROR during transcription processing:", error); showErrorModal("Result Error", "An error occurred while generating your results. Please try again."); goHome(); }
    resetTimer();
}
function filterMistakes(type) {
    document.querySelectorAll('.active-highlight').forEach(el => el.classList.remove('active-highlight'));
    const wordWrappers = document.querySelectorAll('#comparisonColumns .word-wrapper');
    wordWrappers.forEach(wrapper => { const mistakeType = wrapper.getAttribute('data-mistake-type'); let shouldShow = false; if (type === "all" || mistakeType === 'correct') { shouldShow = true; } else if (type === "omission-substitution") { if (mistakeType === 'omission' || mistakeType === 'extra') { shouldShow = true; } } else { if (mistakeType === type) { shouldShow = true; } } wrapper.style.display = shouldShow ? 'inline' : 'none'; });
}

// THIS IS THE FIXED FUNCTION
async function saveTranscriptionAttempt(original, typed, accuracy, full, half, spm, time, words, includeComma) {
    const attemptsRef = db.collection("testAnalysis").doc(candidateId).collection("attempts");
    if (!attemptsRef) return console.error("Candidate not initialized, cannot save.");
    try { 
        await attemptsRef.add({
            // The 'original' and 'typed' text fields have been removed to save space.
            accuracy: accuracy + "%", 
            fullMistakes: full, 
            halfMistakes: half, 
            strokesPerMinute: spm, 
            timeTakenSeconds: time, 
            totalWords: words, 
            collection: g_collection,
            docId: g_docId,
            // THIS IS THE FIX: Provide a fallback value for the title
            title: currentPassageTitle || g_docId || "Untitled Passage", 
            includeComma: includeComma,
            timestamp: firebase.firestore.FieldValue.serverTimestamp() 
        }); 
        console.log("✅ Attempt saved for", candidateId); 
    } catch (err) { 
        console.error("❌ Failed to save attempt:", err); 
    }
}

function saveProgressToLocalStorage(resultData) {
    if (!candidateId) return; const key = `${g_collection}-${g_docId}`; const progressData = JSON.parse(localStorage.getItem(`stenoProgress_${candidateId}`) || '{}');
    const newScore = { accuracy: parseFloat(resultData.accuracy), wpm: parseFloat(resultData.typingSpeed) };
    const existingScore = progressData[key]; if (!existingScore || newScore.accuracy > existingScore.accuracy) { progressData[key] = newScore; localStorage.setItem(`stenoProgress_${candidateId}`, JSON.stringify(progressData)); }
    localStorage.setItem(`stenoLastAttempt_${candidateId}`, JSON.stringify({ collection: g_collection, docId: g_docId }));
}
function validateReportForm() {
    const errorType = document.getElementById('errorTypeSelect').value; const otherText = document.getElementById('otherErrorText').value.trim(); const submitBtn = document.getElementById('submitReportBtn');
    submitBtn.disabled = !(errorType && otherText);
}
function showReportModal() { document.getElementById('reportErrorModal').classList.add('visible'); validateReportForm(); }
async function submitErrorReport() {
    const reportModal = document.getElementById('reportErrorModal'); const errorType = document.getElementById('errorTypeSelect').value; const otherText = document.getElementById('otherErrorText').value; const correctedText = document.getElementById('editableOriginalText').innerText;
    const reportData = { candidateId: candidateId, collection: g_collection, docId: g_docId, title: currentPassageTitle, originalTextInSystem: originalText, userCorrectedText: correctedText, reason: `${errorType}: ${otherText}`, timestamp: firebase.firestore.FieldValue.serverTimestamp() };
    try { await db.collection("transcriptionReports").add(reportData); alert("Thank you! Your report has been submitted successfully."); reportModal.classList.remove('visible'); } catch (error) { console.error("Error submitting report:", error); alert("Could not submit report. Please check your internet connection."); }
}
function debounce(func, delay) { let timeout; return function(...args) { const context = this; clearTimeout(timeout); timeout = setTimeout(() => func.apply(context, args), delay); }; }
function initializeEventListeners() {
    document.getElementById('cat-prog').addEventListener('click', loadProgressiveDictations);
    document.getElementById('cat-ssc').addEventListener('click', loadSscPreviousYearDictations);
    document.getElementById('cat-gen').addEventListener('click', loadGeneralMatterDictations);
    document.getElementById('cat-kc').addEventListener('click', loadImportantKCDictations);
    document.querySelector('.app-container').addEventListener('click', (e) => { const button = e.target.closest('.take-test-btn'); if (button && !button.disabled) { const card = button.closest('.passage-card'); if (card && card.dataset.collection && card.dataset.docId) { loadPractice(card.dataset.collection, card.dataset.docId); } } });
    document.getElementById('error-close-btn').addEventListener('click', () => { document.getElementById('error-modal').classList.remove('visible'); });
    const welcomeModal = document.getElementById('resultsWelcomeModal');
    document.getElementById('closeWelcomeBtn').addEventListener('click', () => { if (document.getElementById('dontShowAgainCheckbox').checked) { localStorage.setItem('hideResultsWelcome', 'true'); } welcomeModal.classList.remove('visible'); });
    const reportModal = document.getElementById('reportErrorModal');
    document.getElementById('cancelReportBtn').addEventListener('click', () => reportModal.classList.remove('visible'));
    document.getElementById('submitReportBtn').addEventListener('click', submitErrorReport);
    document.getElementById('errorTypeSelect').addEventListener('change', validateReportForm);
    document.getElementById('otherErrorText').addEventListener('input', validateReportForm);
}
function showErrorModal(title, message) { document.getElementById('error-title').textContent = title; document.getElementById('error-message').textContent = message; document.getElementById('error-modal').classList.add('visible'); }
