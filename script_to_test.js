\n  function updateGlobalMuteIcon() {\n    const isMuted = localStorage.getItem('anchit-mute') === 'true';\n    const btn = document.getElementById('globalMuteBtn');\n    if (isMuted) {\n      btn.innerHTML = '<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line><path d=\"M9 9v6a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6\"></path><path d=\"M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23\"></path><line x1=\"12\" y1=\"19\" x2=\"12\" y2=\"23\"></line><line x1=\"8\" y1=\"23\" x2=\"16\" y2=\"23\"></line></svg>'; // Mic off\n    } else {\n      btn.innerHTML = '<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z\"></path><path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"></path><line x1=\"12\" y1=\"19\" x2=\"12\" y2=\"23\"></line><line x1=\"8\" y1=\"23\" x2=\"16\" y2=\"23\"></line></svg>'; // Mic on\n    }\n  }\n\n  function toggleGlobalMute() {\n    const isMuted = localStorage.getItem('anchit-mute') === 'true';\n    localStorage.setItem('anchit-mute', !isMuted);\n    updateGlobalMuteIcon();\n    if (!isMuted) { \n      // Muting now -> stop any ongoing speech\n      if (window.speechSynthesis) window.speechSynthesis.cancel();\n      if (window.audioMuted !== undefined) {\n         window.audioMuted = true;\n         if (typeof setPlayerState === 'function') setPlayerState(false);\n      }\n    } else {\n      // Unmuting\n      if (window.audioMuted !== undefined) {\n         window.audioMuted = false;\n      }\n    }\n  }\n\n  function triggerGlobalChatNudge() {\n    if (document.getElementById('cli')) { // Nexus\n      document.getElementById('cli').focus();\n    } else if (document.getElementById('ccInput')) { // Cyber\n      document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });\n      setTimeout(() => document.getElementById('ccInput').focus(), 600);\n    } else if (document.getElementById('view-chat')) { // Simple\n      document.getElementById('view-chat').scrollIntoView({ behavior: 'smooth' });\n      setTimeout(() => {\n        const ci = document.getElementById('chat-input');\n        if(ci) ci.focus();\n      }, 600);\n    }\n  }\n\n  document.addEventListener('DOMContentLoaded', updateGlobalMuteIcon);\n<\/script>"};
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
          speakText("Hi, I am Anchit. Welcome to my interactive portfolio. What's your name?", obChat);
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
      // Simple routing logic based on keywords
      const lower = q.toLowerCase();
      if (lower.includes('metric') || lower.includes('highlight') || lower.includes('roi')) {
        loadSection('highlights');
      } else if (lower.includes('project') || lower.includes('build')) {
        loadSection('projects');
      } else if (lower.includes('timeline') || lower.includes('journey')) {
        loadSection('timeline');
      } else if (lower.includes('deep') || lower.includes('experience')) {
        loadSection('deep_exp');
      } else if (lower.includes('resume')) {
        loadSection('resume');
      } else if (lower.includes('contact')) {
        loadSection('contact');
      } else {
        speakText(`I'm a static AI construct right now, so I don't have an LLM attached to answer arbitrary questions, but I can navigate you! Try asking for my Resume or Projects.`, fcBody);
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

  