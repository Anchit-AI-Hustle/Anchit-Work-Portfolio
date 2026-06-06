import re

with open('index.html', 'r') as f:
    html = f.read()

onboarding_html = """
<!-- ONBOARDING MODAL -->
<div id="onboarding" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(5,5,5,0.4); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); z-index:10000; display:flex; align-items:center; justify-content:center; opacity:0; visibility:hidden; transition:opacity 0.5s, visibility 0.5s;">
  <div class="chat-container-center" style="align-items:center; justify-content:center; display:flex; flex-direction:column; background:rgba(20,20,20,0.85); border:1px solid rgba(255, 95, 21, 0.4); box-shadow:0 0 50px rgba(255, 95, 21, 0.15), inset 0 0 20px rgba(255, 95, 21, 0.05); border-radius:24px; padding:40px; width:90%; max-width:500px; text-align:center;">
    
    <div style="margin-bottom:24px;">
      <img src="assets/logo-at.jpg" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid var(--accent); box-shadow: 0 0 20px rgba(243, 179, 49, 0.5);">
    </div>
    
    <h2 style="font-family:var(--font-display); font-size:28px; font-weight:700; color:#FFF; margin-bottom:12px;">Welcome to my world</h2>
    <p style="color:var(--ink-dim); font-size:16px; margin-bottom:32px; line-height:1.5;">This isn't a normal portfolio. My AI Agent is here to walk you through my builds, metrics, and funnel philosophy.</p>

    <button id="ob-start-btn" style="padding:16px 32px; background:var(--primary); color:#000; font-weight:bold; border-radius:30px; border:none; cursor:pointer; font-size:18px; box-shadow:0 0 20px rgba(255,95,21,0.5); transition:all 0.3s ease;">Meet Anchit Tandon</button>
    
    <div class="input-row" id="onboarding-input-row" style="display:none; width:100%; max-width:400px; margin-top:24px;">
      <input type="text" id="ob-input" placeholder="What's your name?" autocomplete="off" style="flex:1; background:var(--bg-deep); border:1px solid var(--rule); padding:12px 16px; border-radius:24px; color:#FFF; font-size:16px; outline:none;">
      <button class="icon-btn" id="ob-submit" style="background:var(--primary); border:none; color:#000; width:44px; height:44px; border-radius:50%; margin-left:12px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px; height:20px;"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>

  </div>
</div>
"""

# Insert right after <body>
html = html.replace('<body>', '<body>\n' + onboarding_html)

js_logic = """
  // Onboarding Logic
  setTimeout(() => {
    const ob = document.getElementById('onboarding');
    if (ob) {
      ob.style.visibility = 'visible';
      ob.style.opacity = '1';
    }
  }, 800);

  const obStartBtn = document.getElementById('ob-start-btn');
  const obInputRow = document.getElementById('onboarding-input-row');
  const obInput = document.getElementById('ob-input');
  const obSubmit = document.getElementById('ob-submit');

  if (obStartBtn) {
    obStartBtn.addEventListener('click', () => {
      obStartBtn.style.display = 'none';
      obInputRow.style.display = 'flex';
      obInput.focus();
    });
  }

  function finishOnboarding() {
    const ob = document.getElementById('onboarding');
    const name = obInput.value.trim() || 'Guest';
    if (ob) {
      ob.style.opacity = '0';
      setTimeout(() => ob.style.visibility = 'hidden', 500);
    }
    // Open Universal Chat
    document.body.classList.add('view-chat');
    // Scroll to #view-chat
    const c = document.getElementById('view-chat');
    if(c) c.scrollIntoView({behavior:'smooth'});
    
    // Greeting
    setTimeout(() => {
      addBot(`Hey ${name}, I'm Anchit. Welcome. Ask me anything — my work, side projects, or what I'm solving right now.`);
      renderChips(DEFAULT_CHIPS);
    }, 600);
  }

  if (obSubmit) { obSubmit.addEventListener('click', finishOnboarding); }
  if (obInput) { obInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') finishOnboarding(); }); }
"""

# Insert JS logic into the script block
html = html.replace('// ---- In-chat mic: speak', js_logic + '\n\n  // ---- In-chat mic: speak')

with open('index.html', 'w') as f:
    f.write(html)
print("Onboarding popup added.")
