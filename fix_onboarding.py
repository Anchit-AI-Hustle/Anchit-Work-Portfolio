import re

with open('index.html', 'r') as f:
    html = f.read()

# Fix CSS variables for bubbles so they are guaranteed visible
html = html.replace('--bg-deep: #000000 !important;', '--bg-deep: #000000 !important;\n    --bg-panel: #111111 !important;\n    --border: #333333 !important;')

# Replace the Onboarding HTML
new_onboarding_html = """  <!-- ONBOARDING MODAL -->
  <div id="onboarding">
    <div class="chat-container-center" style="align-items: center; justify-content: center; height: 100%; display: flex; flex-direction: column;">
      
      <button id="ob-start-btn" style="padding: 16px 32px; background: var(--primary); color: #000; font-weight: bold; border-radius: 30px; border: none; cursor: pointer; font-size: 18px; box-shadow: 0 0 20px rgba(255,95,21,0.5);">Start Experience</button>
      
      <div id="onboarding-chat" style="display: none; width: 100%; max-width: 500px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px;">
        <!-- Bubbles injected here -->
      </div>
      
      <div class="input-row" id="onboarding-input-row" style="display: none; width: 100%; max-width: 500px;">
        <input type="text" id="ob-input" placeholder="Type your name..." autocomplete="off">
        <button class="icon-btn" id="ob-mic" title="Speak your name">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </button>
      </div>

    </div>
  </div>"""

# Remove the old onboarding HTML (from <!-- ONBOARDING MODAL --> to <!-- MAIN LAYOUT -->)
html = re.sub(r'<!-- ONBOARDING MODAL -->.*?<!-- MAIN LAYOUT -->', new_onboarding_html + '\n\n  <!-- MAIN LAYOUT -->', html, flags=re.DOTALL)

# Inject typewriter effect into addBubble
old_addBubble = """    function addBubble(text, type, container) {
      const b = document.createElement('div');
      b.className = 'bubble ' + type;
      b.innerHTML = text;
      container.appendChild(b);
      container.scrollTop = container.scrollHeight;
    }"""
new_addBubble = """    function addBubble(text, type, container, typewriter = false) {
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
    }"""
html = html.replace(old_addBubble, new_addBubble)

# Update speakText to use typewriter
html = html.replace('addBubble(text, \'system\', container);', 'addBubble(text, \'system\', container, true);')

# Update Initialization to use the Start button
old_init = """    // App Initialization
    (() => {
      // Hide any legacy UI that might conflict from appended sections
      const globalNudge = document.getElementById('globalChatNudge');
      if(globalNudge) globalNudge.style.display = 'none';

      if (chatHistory.length > 0 && userName) {
        document.getElementById('onboarding-input-row').style.display = 'none';
        obEl.classList.add('hidden');
        mainEl.classList.add('active');
        speakText(`Welcome back, ${userName}. What would you like to explore today?`, fcBody);
        
        chatHistory.forEach(msg => {
          addBubble(msg.text, msg.type, fcBody);
        });
      } else {
        // New session
        document.body.insertAdjacentHTML("beforeend", "<div style='position:fixed;top:50px;left:50px;background:yellow;color:black;z-index:999999;padding:10px;'>JS speakText executed!</div>");
        speakText("Hi, I am Anchit. Welcome to my interactive portfolio. What's your name?", obChat);
      }
    })();"""

new_init = """    // App Initialization
    (() => {
      // Hide legacy UI
      const globalNudge = document.getElementById('globalChatNudge');
      if(globalNudge) globalNudge.style.display = 'none';
      
      // Ensure chat is empty and display none initially
      document.getElementById('onboarding-chat').style.display = 'none';
      document.getElementById('onboarding-input-row').style.display = 'none';

      const startBtn = document.getElementById('ob-start-btn');
      startBtn.addEventListener('click', () => {
          startBtn.style.display = 'none';
          document.getElementById('onboarding-chat').style.display = 'flex';
          document.getElementById('onboarding-input-row').style.display = 'flex';
          
          if (chatHistory.length > 0 && userName) {
            document.getElementById('onboarding-input-row').style.display = 'none';
            obEl.classList.add('hidden');
            mainEl.classList.add('active');
            speakText(`Welcome back, ${userName}. What would you like to explore today?`, fcBody);
            
            chatHistory.forEach(msg => {
              addBubble(msg.text, msg.type, fcBody, false);
            });
          } else {
            // New session
            speakText("Hi, I am Anchit. Welcome to my interactive portfolio. What's your name?", document.getElementById('onboarding-chat'));
          }
      });
    })();"""
html = html.replace(old_init, new_init)

with open('index.html', 'w') as f:
    f.write(html)

print("Onboarding flow rewritten.")
