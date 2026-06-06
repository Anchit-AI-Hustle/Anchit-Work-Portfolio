
    const sectionsDataText = document.getElementById('sectionsDataPayload').textContent;
    const sectionsData = JSON.parse(sectionsDataText);
    const TTS_URL = 'http://localhost:8000/api/tts';
    
    let userName = '';
    let chatHistory = [];
    
    // Robust storage wrapper to handle file:// protocol restrictions or corrupted data
    const Storage = {
        get: (key) => {
            try { return localStorage.getItem(key); } catch(e) { return null; }
        },
        set: (key, val) => {
            try { localStorage.setItem(key, val); } catch(e) { }
        },
        remove: (key) => {
            try { localStorage.removeItem(key); } catch(e) { }
        }
    };

    userName = Storage.get('anchit-user-name') || '';
    try {
        const h = Storage.get('anchit-chat-history');
        if (h && h !== 'undefined') {
            chatHistory = JSON.parse(h);
        }
    } catch(e) {
        console.warn('History parse failed');
    }
    let isRecording = false;
    let recognition = null;
    let currentAudio = null;

    // Elements
    const obEl = document.getElementById('onboarding');
    const obChat = document.getElementById('onboarding-chat');
    const obInput = document.getElementById('ob-input');
    const obMic = document.getElementById('ob-mic');
    
    const mainEl = document.getElementById('main-layout');
    const portContent = document.getElementById('portfolio-content');
    const fcBody = document.getElementById('fc-body');
    const fcInput = document.getElementById('fc-input');
    const fcMic = document.getElementById('fc-mic');
    
    // Init Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
    }

    function addBubble(text, type, container, typewriter = false) {
      const b = document.createElement('div');
      b.className = 'bubble ' + type;
      container.appendChild(b);
      container.scrollTop = container.scrollHeight;
      
      if (typewriter && type === 'system') {
        let i = 0;
        b.innerHTML = '';
        const interval = setInterval(() => {
          b.innerHTML += text.charAt(i);
          i++;
          if (i >= text.length) clearInterval(interval);
          container.scrollTop = container.scrollHeight;
        }, 30); // 30ms per character
      } else {
        b.innerHTML = text;
      }
      
      // Save history if it's the floating chat
      if (container === fcBody) {
        chatHistory.push({ text, type });
        Storage.set('anchit-chat-history', JSON.stringify(chatHistory));
      }
    }

    async function speakText(text, container) {
      addBubble(text, 'system', container, true);
      
      try {
        const res = await fetch(TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (currentAudio) currentAudio.pause();
          currentAudio = new Audio(url);
          currentAudio.play();
        } else {
          console.warn("TTS backend failed, falling back to browser TTS");
          fallbackTTS(text);
        }
      } catch (e) {
        console.warn("TTS connection failed, falling back to browser TTS", e);
        fallbackTTS(text);
      }
    }
    
    function fallbackTTS(text) {
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    }

    // App Initialization
    (() => {
      // Pre-load timeline in the background so it acts like a tutorial overlay
      const pc = document.getElementById('portfolio-content');
      if (pc && sectionsData && sectionsData['timeline']) {
        pc.innerHTML = sectionsData['timeline'];
      }
      // Hide any legacy UI that might conflict from appended sections
      const globalNudge = document.getElementById('globalChatNudge');
      if(globalNudge) globalNudge.style.display = 'none';

      const startBtn = document.getElementById('ob-start-btn');
      startBtn.addEventListener('click', () => {
        startBtn.style.display = 'none';
        document.getElementById('onboarding-chat').style.display = 'flex';
        document.getElementById('onboarding-input-row').style.display = 'flex';

        if (chatHistory.length > 0 && userName) {
          // Resume session
          obEl.classList.add('hidden');
          mainEl.classList.add('active');
          loadHistory();
          speakText(`Welcome back, ${userName}. Should we continue where we left off, or start fresh?`, fcBody);
          
          // Add action chips for Resume
          setTimeout(() => {
            const chipRow = document.createElement('div');
            chipRow.className = 'chips-row bubble system';
            chipRow.innerHTML = `
              <button class="chip" onclick="clearSession()">Start Fresh</button>
              <button class="chip" onclick="loadSection('highlights')">Show Highlights</button>
            `;
            fcBody.appendChild(chipRow);
            fcBody.scrollTop = fcBody.scrollHeight;
          }, 1000);
          
        } else {
          // New session
          console.log("Starting new session");
          // Add a system bubble manually and play the actual audio file
          addBubble("Hi, I am Anchit. Welcome to my interactive portfolio. What's your name?", 'system', obChat);
          const introAudio = new Audio('audio/anchit.m4a');
          introAudio.play().catch(e => console.warn('Audio play failed', e));
        }
      });
    })();
    
    function loadHistory() {
      fcBody.innerHTML = '';
      chatHistory.forEach(msg => {
        const b = document.createElement('div');
        b.className = 'bubble ' + msg.type;
        b.innerHTML = msg.text;
        fcBody.appendChild(b);
      });
      fcBody.scrollTop = fcBody.scrollHeight;
    }
    
    window.clearSession = function() {
      chatHistory = [];
      Storage.remove('anchit-chat-history');
      fcBody.innerHTML = '';
      speakText(`Clean slate. I have my Timeline, Hard Metrics, and Deep Projects available. What would you like to see?`, fcBody);
      showBriefChips();
    }

    // Handle Name Input
    obInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && obInput.value.trim()) {
        submitName(obInput.value.trim());
      }
    });
    
    function submitName(name) {
      userName = name;
      Storage.set('anchit-user-name', userName);
      addBubble(name, 'user', obChat);
      obInput.value = '';
      document.getElementById('onboarding-input-row').style.display = 'none';
      
      setTimeout(() => {
        obEl.classList.add('hidden');
        mainEl.classList.add('active');
        speakText(`Nice to meet you, ${userName}. I build things that make money. I can walk you through my timeline, show you hard metrics, or dive into specific projects. What are you looking for?`, fcBody);
        showBriefChips();
      }, 1000);
    }
    
    function showBriefChips() {
      setTimeout(() => {
        const chipRow = document.createElement('div');
        chipRow.className = 'chips-row bubble system';
        chipRow.innerHTML = `
          <button class="chip" onclick="loadSection('timeline')">View Timeline</button>
          <button class="chip" onclick="loadSection('highlights')">View Metrics</button>
          <button class="chip" onclick="loadSection('projects')">Side Builds</button>
        `;
        fcBody.appendChild(chipRow);
        fcBody.scrollTop = fcBody.scrollHeight;
      }, 500);
    }

    // Dynamic Section Loading
    window.loadSection = function(key) {
      addBubble(`Load ${key}`, 'user', fcBody);
      if (sectionsData[key]) {
        portContent.innerHTML = sectionsData[key];
        // hide legacy widgets inside loaded content
        const gn = portContent.querySelectorAll('#globalChatNudge, #floatingChatWidget');
        gn.forEach(e => e.style.display = 'none');
        
        speakText(`Loading ${key}.`, fcBody);
        
        // Random follow-up nudge
        setTimeout(() => {
          speakText(`Let me know if you need help finding specific engineering details in this section.`, fcBody);
        }, 8000);
      } else {
        speakText(`I couldn't find that section.`, fcBody);
      }
    };

    // Floating Chat Input
    fcInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && fcInput.value.trim()) {
        const v = fcInput.value.trim();
        addBubble(v, 'user', fcBody);
        fcInput.value = '';
        handleQuery(v);
      }
    });
    
    function handleQuery(q) {
      const lower = q.toLowerCase();
      
      const intents = {
        'highlights': ['metric', 'highlight', 'roi', 'growth', 'result', 'impact', 'number', 'revenue', 'arr', 'mrr'],
        'projects': ['project', 'build', 'side', 'experiment', 'hobby', 'app', 'tool'],
        'deep_exp': ['experience', 'work', 'job', 'history', 'times internet', 'vahdam', 'career', 'role'],
        'timeline': ['timeline', 'journey', 'path', 'story'],
        'intro': ['about', 'who are you', 'intro', 'bio'],
        'contact': ['contact', 'email', 'message', 'reach', 'talk', 'chat with anchit']
      };
      
      let matchedSection = null;
      for (const [section, keywords] of Object.entries(intents)) {
        if (keywords.some(kw => lower.includes(kw))) {
          matchedSection = section;
          break;
        }
      }
      
      if (matchedSection) {
        let msg = '';
        if (matchedSection === 'highlights') msg = "I've pulled up the key metrics and ROI from Anchit's major product launches.";
        if (matchedSection === 'projects') msg = "Loading his AI and side builds. He engineers these end-to-end.";
        if (matchedSection === 'deep_exp') msg = "Navigating to his professional product history across Vahdam and Times Internet.";
        if (matchedSection === 'timeline') msg = "Here is the timeline of his journey from engineering to product management.";
        if (matchedSection === 'intro') msg = "Here is a quick overview of who Anchit is.";
        if (matchedSection === 'contact') msg = "Bringing up his contact details so you can reach out directly.";
        
        speakText(msg, fcBody);
        setTimeout(() => loadSection(matchedSection), 100);
      } else {
        speakText(`I am the autonomous brain navigating this OS. Ask me to show you his metrics, side projects, work history, or contact details, and I will drive the UI for you.`, fcBody);
      }
    }

    // Voice to Text Setup
    function setupMic(micBtn, inputEl, callback) {
      if (!recognition) {
        micBtn.style.opacity = '0.5';
        return;
      }
      
      micBtn.addEventListener('click', () => {
        if (isRecording) {
          recognition.stop();
          return;
        }
        
        recognition.start();
        isRecording = true;
        micBtn.classList.add('recording');
        
        recognition.onresult = (e) => {
          let transcript = '';
          for (let i = e.resultIndex; i < e.results.length; ++i) {
            transcript += e.results[i][0].transcript;
          }
          inputEl.value = transcript;
        };
        
        recognition.onend = () => {
          isRecording = false;
          micBtn.classList.remove('recording');
          if (inputEl.value.trim()) {
            callback(inputEl.value.trim());
          }
        };
      });
    }
    
    setupMic(obMic, obInput, submitName);
    setupMic(fcMic, fcInput, (val) => {
      addBubble(val, 'user', fcBody);
      fcInput.value = '';
      handleQuery(val);
    });

  