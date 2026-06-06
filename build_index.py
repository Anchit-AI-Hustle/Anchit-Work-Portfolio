import os
import json

# Read the extracted sections
def read_file(name):
    if not os.path.exists(name): return ""
    with open(name, "r") as f:
        return f.read()

deep_dives = read_file("scratch-deep-dives.html")
timeline = read_file("scratch-timeline.html")
highlights = read_file("scratch-highlights.html")
projects = read_file("scratch-projects.html")

# Extract the specific sections
exp_idx = deep_dives.find('id="view-projects"')
proj_idx = deep_dives.find('id="view-resume"')
resume_idx = deep_dives.find('id="view-contact"')

exp_html = deep_dives[:exp_idx].rsplit('<section class="view"', 1)[0].strip() if exp_idx != -1 else ""
proj_html = ('<section class="view" ' + deep_dives[exp_idx:proj_idx]).rsplit('<section class="view"', 1)[0].strip() if exp_idx != -1 else ""
resume_html = ('<section class="view" ' + deep_dives[proj_idx:resume_idx]).rsplit('<section class="view"', 1)[0].strip() if proj_idx != -1 else ""
contact_html = '<section class="view" ' + deep_dives[resume_idx:].strip() if resume_idx != -1 else ""

sections_data = {
    "intro": "<h1>Intro</h1><p>An engineer who learned to love the funnel.</p>",
    "timeline": timeline,
    "highlights": highlights,
    "projects": projects,
    "deep_exp": exp_html,
    "deep_proj": proj_html,
    "resume": resume_html,
    "contact": contact_html
}

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Anchit Tandon — Interactive OS</title>
  <style>
    :root {{
      --bg: #050505;
      --bg-panel: #111111;
      --txt: #ffffff;
      --txt-mute: #888888;
      --accent: #FF5F15;
      --accent-hover: #FF7A00;
      --border: rgba(255,255,255,0.1);
      --font-main: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }}
    
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: var(--bg);
      color: var(--txt);
      font-family: var(--font-main);
      overflow-x: hidden;
      height: 100vh;
      display: flex;
    }}

    /* ONBOARDING MODAL */
    #onboarding {{
      position: fixed; inset: 0; z-index: 1000;
      background: var(--bg);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      transition: opacity 0.5s, visibility 0.5s;
    }}
    #onboarding.hidden {{ opacity: 0; visibility: hidden; }}
    
    .chat-container-center {{
      width: 100%; max-width: 600px; padding: 20px;
      display: flex; flex-direction: column; gap: 20px;
    }}

    .bubble {{
      padding: 14px 18px; border-radius: 16px;
      max-width: 80%; line-height: 1.4;
      animation: popIn 0.3s ease forwards;
    }}
    .bubble.system {{
      background: var(--bg-panel); border: 1px solid var(--border);
      align-self: flex-start; border-bottom-left-radius: 4px;
    }}
    .bubble.user {{
      background: var(--accent); color: #000;
      align-self: flex-end; border-bottom-right-radius: 4px;
    }}
    
    @keyframes popIn {{
      0% {{ opacity: 0; transform: translateY(10px); }}
      100% {{ opacity: 1; transform: translateY(0); }}
    }}

    .input-row {{
      display: flex; gap: 10px; margin-top: 10px;
    }}
    input[type="text"] {{
      flex: 1; background: var(--bg-panel); border: 1px solid var(--border);
      color: var(--txt); padding: 14px 20px; border-radius: 99px;
      font-size: 16px; outline: none; transition: border-color 0.2s;
    }}
    input[type="text"]:focus {{ border-color: var(--accent); }}
    
    button.icon-btn {{
      background: var(--bg-panel); border: 1px solid var(--border);
      color: var(--txt); width: 48px; height: 48px; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }}
    button.icon-btn:hover {{ background: var(--border); }}
    button.icon-btn.recording {{ background: var(--accent); color: #000; animation: pulse 1.5s infinite; }}

    @keyframes pulse {{
      0% {{ box-shadow: 0 0 0 0 rgba(255, 95, 21, 0.4); }}
      70% {{ box-shadow: 0 0 0 10px rgba(255, 95, 21, 0); }}
      100% {{ box-shadow: 0 0 0 0 rgba(255, 95, 21, 0); }}
    }}

    .chips-row {{
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;
    }}
    .chip {{
      background: transparent; border: 1px solid var(--accent);
      color: var(--accent); padding: 8px 16px; border-radius: 99px;
      cursor: pointer; font-size: 14px; transition: all 0.2s;
    }}
    .chip:hover {{ background: var(--accent); color: #000; }}

    /* MAIN PORTFOLIO LAYOUT */
    #main-layout {{
      display: flex; width: 100%; height: 100vh;
      opacity: 0; visibility: hidden; transition: opacity 0.5s;
    }}
    #main-layout.active {{ opacity: 1; visibility: visible; }}

    #portfolio-content {{
      flex: 1; overflow-y: auto; padding: 40px; padding-right: 380px;
    }}
    
    /* FLOATING CHAT WIDGET */
    #floating-chat {{
      position: fixed; right: 20px; bottom: 20px;
      width: 340px; height: 500px; max-height: calc(100vh - 40px);
      background: var(--bg-panel); border: 1px solid var(--border);
      border-radius: 20px; display: flex; flex-direction: column;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      z-index: 100;
    }}
    
    .fc-header {{
      padding: 16px 20px; border-bottom: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center;
      font-weight: 600;
    }}
    .fc-body {{
      flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px;
    }}
    .fc-footer {{
      padding: 16px; border-top: 1px solid var(--border);
    }}

    @media (max-width: 768px) {{
      #portfolio-content {{ padding: 20px; padding-bottom: 120px; }}
      #floating-chat {{
        width: calc(100% - 40px); height: 80px; transition: height 0.3s;
      }}
      #floating-chat.expanded {{ height: 400px; }}
    }}
    
    /* Inherited styles for portfolio content from scratch CSS */
    .view {{ display: block !important; padding-bottom: 80px; }}
    h1, h2, h3 {{ color: var(--txt); margin-bottom: 10px; }}
    p {{ color: var(--txt-mute); margin-bottom: 20px; line-height: 1.6; }}
    .eyebrow {{ color: var(--accent); font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; margin-bottom: 8px; }}
  </style>
</head>
<body>

  <!-- ONBOARDING MODAL -->
  <div id="onboarding">
    <div class="chat-container-center">
      <div id="onboarding-chat">
        <!-- Bubbles injected here -->
      </div>
      <div class="input-row" id="onboarding-input-row">
        <input type="text" id="ob-input" placeholder="Type your name..." autocomplete="off">
        <button class="icon-btn" id="ob-mic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </button>
      </div>
    </div>
  </div>

  <!-- MAIN LAYOUT -->
  <div id="main-layout">
    <div id="portfolio-content">
      <!-- Dynamic Section Injected Here -->
    </div>
    
    <div id="floating-chat">
      <div class="fc-header">
        <span><span style="color:var(--accent)">●</span> Agent Anchit</span>
      </div>
      <div class="fc-body" id="fc-body">
        <!-- Persistent chat continues here -->
      </div>
      <div class="fc-footer input-row">
        <input type="text" id="fc-input" placeholder="Ask anything..." autocomplete="off">
        <button class="icon-btn" id="fc-mic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </button>
      </div>
    </div>
  </div>

  <script>
    const sectionsData = {json.dumps(sections_data)};
    const TTS_URL = 'http://localhost:8000/api/tts';
    
    let userName = localStorage.getItem('anchit-user-name') || '';
    let chatHistory = JSON.parse(localStorage.getItem('anchit-chat-history') || '[]');
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
    if ('webkitSpeechRecognition' in window) {{
      recognition = new webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
    }}

    function addBubble(text, type, container) {{
      const b = document.createElement('div');
      b.className = 'bubble ' + type;
      b.innerHTML = text;
      container.appendChild(b);
      container.scrollTop = container.scrollHeight;
      
      // Save history if it's the floating chat
      if (container === fcBody) {{
        chatHistory.push({{ text, type }});
        localStorage.setItem('anchit-chat-history', JSON.stringify(chatHistory));
      }}
    }}

    async function speakText(text, container) {{
      addBubble(text, 'system', container);
      
      try {{
        const res = await fetch(TTS_URL, {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ text }})
        }});
        if (res.ok) {{
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (currentAudio) currentAudio.pause();
          currentAudio = new Audio(url);
          currentAudio.play();
        }} else {{
          console.warn("TTS backend failed, falling back to browser TTS");
          fallbackTTS(text);
        }}
      }} catch (e) {{
        console.warn("TTS connection failed, falling back to browser TTS", e);
        fallbackTTS(text);
      }}
    }}
    
    function fallbackTTS(text) {{
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    }}

    // App Initialization
    window.onload = () => {{
      if (chatHistory.length > 0 && userName) {{
        // Resume session
        obEl.classList.add('hidden');
        mainEl.classList.add('active');
        loadHistory();
        speakText(`Welcome back, ${{userName}}. Should we continue where we left off, or start fresh?`, fcBody);
        
        // Add action chips for Resume
        setTimeout(() => {{
          const chipRow = document.createElement('div');
          chipRow.className = 'chips-row bubble system';
          chipRow.innerHTML = `
            <button class="chip" onclick="clearSession()">Start Fresh</button>
            <button class="chip" onclick="loadSection('highlights')">Show Highlights</button>
          `;
          fcBody.appendChild(chipRow);
          fcBody.scrollTop = fcBody.scrollHeight;
        }}, 1000);
        
      }} else {{
        // New session
        speakText("Hi, I am Anchit. Welcome to my interactive portfolio. What's your name?", obChat);
      }}
    }};
    
    function loadHistory() {{
      fcBody.innerHTML = '';
      chatHistory.forEach(msg => {{
        const b = document.createElement('div');
        b.className = 'bubble ' + msg.type;
        b.innerHTML = msg.text;
        fcBody.appendChild(b);
      }});
      fcBody.scrollTop = fcBody.scrollHeight;
    }}
    
    function clearSession() {{
      chatHistory = [];
      localStorage.removeItem('anchit-chat-history');
      fcBody.innerHTML = '';
      speakText(`Clean slate. I have my Timeline, Hard Metrics, and Deep Projects available. What would you like to see?`, fcBody);
      showBriefChips();
    }}

    // Handle Name Input
    obInput.addEventListener('keypress', (e) => {{
      if (e.key === 'Enter' && obInput.value.trim()) {{
        submitName(obInput.value.trim());
      }}
    }});
    
    function submitName(name) {{
      userName = name;
      localStorage.setItem('anchit-user-name', userName);
      addBubble(name, 'user', obChat);
      obInput.value = '';
      document.getElementById('onboarding-input-row').style.display = 'none';
      
      setTimeout(() => {{
        obEl.classList.add('hidden');
        mainEl.classList.add('active');
        speakText(`Nice to meet you, ${{userName}}. I build things that make money. I can walk you through my timeline, show you hard metrics, or dive into specific projects. What are you looking for?`, fcBody);
        showBriefChips();
      }}, 1000);
    }}
    
    function showBriefChips() {{
      setTimeout(() => {{
        const chipRow = document.createElement('div');
        chipRow.className = 'chips-row bubble system';
        chipRow.innerHTML = `
          <button class="chip" onclick="loadSection('timeline')">View Timeline</button>
          <button class="chip" onclick="loadSection('highlights')">View Metrics</button>
          <button class="chip" onclick="loadSection('projects')">Side Builds</button>
        `;
        fcBody.appendChild(chipRow);
        fcBody.scrollTop = fcBody.scrollHeight;
      }}, 500);
    }}

    // Dynamic Section Loading
    window.loadSection = function(key) {{
      addBubble(`Load ${{key}}`, 'user', fcBody);
      if (sectionsData[key]) {{
        portContent.innerHTML = sectionsData[key];
        speakText(`Loading ${{key}}.`, fcBody);
        
        // Random follow-up nudge
        setTimeout(() => {{
          speakText(`Let me know if you need help finding specific engineering details in this section.`, fcBody);
        }}, 5000);
      }} else {{
        speakText(`I couldn't find that section.`, fcBody);
      }}
    }};

    // Floating Chat Input
    fcInput.addEventListener('keypress', (e) => {{
      if (e.key === 'Enter' && fcInput.value.trim()) {{
        const v = fcInput.value.trim();
        addBubble(v, 'user', fcBody);
        fcInput.value = '';
        handleQuery(v);
      }}
    }});
    
    function handleQuery(q) {{
      // Simple routing logic based on keywords
      const lower = q.toLowerCase();
      if (lower.includes('metric') || lower.includes('highlight') || lower.includes('roi')) {{
        loadSection('highlights');
      }} else if (lower.includes('project') || lower.includes('build')) {{
        loadSection('projects');
      }} else if (lower.includes('timeline') || lower.includes('journey')) {{
        loadSection('timeline');
      }} else if (lower.includes('deep') || lower.includes('experience')) {{
        loadSection('deep_exp');
      }} else if (lower.includes('resume')) {{
        loadSection('resume');
      }} else if (lower.includes('contact')) {{
        loadSection('contact');
      }} else {{
        speakText(`I'm a static AI construct right now, so I don't have an LLM attached to answer arbitrary questions, but I can navigate you! Try asking for my Resume or Projects.`, fcBody);
      }}
    }}

    // Voice to Text Setup
    function setupMic(micBtn, inputEl, callback) {{
      if (!recognition) {{
        micBtn.style.opacity = '0.5';
        return;
      }}
      
      micBtn.addEventListener('click', () => {{
        if (isRecording) {{
          recognition.stop();
          return;
        }}
        
        recognition.start();
        isRecording = true;
        micBtn.classList.add('recording');
        
        recognition.onresult = (e) => {{
          let transcript = '';
          for (let i = e.resultIndex; i < e.results.length; ++i) {{
            transcript += e.results[i][0].transcript;
          }}
          inputEl.value = transcript;
        }};
        
        recognition.onend = () => {{
          isRecording = false;
          micBtn.classList.remove('recording');
          if (inputEl.value.trim()) {{
            callback(inputEl.value.trim());
          }}
        }};
      }});
    }}
    
    setupMic(obMic, obInput, submitName);
    setupMic(fcMic, fcInput, (val) => {{
      addBubble(val, 'user', fcBody);
      fcInput.value = '';
      handleQuery(val);
    }});

  </script>
</body>
</html>
"""

with open('index.html', 'w') as f:
    f.write(html_content)

print("index.html successfully built.")
