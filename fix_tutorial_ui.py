import re

with open('index.html', 'r') as f:
    html = f.read()

# 1. Update onboarding background and add the glassmorphism box
# Find: id="onboarding" ... > \n <div class="chat-container-center" style="..."
html = html.replace(
    '#onboarding {\n    background: transparent !important; backdrop-filter: blur(2px);\n}',
    """#onboarding {
    background: rgba(5,5,5,0.85) !important;
    backdrop-filter: blur(16px) !important;
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 10000;
    display: flex; align-items: center; justify-content: center;
}"""
)

# And replace the inline style of chat-container-center inside #onboarding
old_chat_container = '<div class="chat-container-center" style="align-items: center; justify-content: center; height: 100%; display: flex; flex-direction: column;">'
new_chat_container = '<div class="chat-container-center" style="align-items: center; justify-content: center; display: flex; flex-direction: column; background: rgba(20,20,20,0.6); border: 1px solid rgba(255, 95, 21, 0.4); box-shadow: 0 0 50px rgba(255, 95, 21, 0.15), inset 0 0 20px rgba(255, 95, 21, 0.05); border-radius: 24px; padding: 40px; width: 90%; max-width: 500px;">'
html = html.replace(old_chat_container, new_chat_container)

# 2. Update the main-layout visibility in CSS
html = html.replace(
    """#main-layout {
      display: flex; width: 100%; height: 100vh;
      opacity: 0; visibility: hidden; transition: opacity 0.5s;
    }""",
    """#main-layout {
      display: flex; width: 100%; height: 100vh;
      opacity: 1; visibility: visible; transition: opacity 0.5s;
    }"""
)

# 3. Inject the timeline into portfolio-content at initialization
# Find: (() => {
# Append: const portContent = document.getElementById('portfolio-content'); portContent.innerHTML = sectionsData['timeline'];
init_code_old = """    // App Initialization
    (() => {"""
init_code_new = """    // App Initialization
    (() => {
      // Pre-load timeline in the background so it acts like a tutorial overlay
      const pc = document.getElementById('portfolio-content');
      if (pc && sectionsData && sectionsData['timeline']) {
        pc.innerHTML = sectionsData['timeline'];
      }"""
html = html.replace(init_code_old, init_code_new)

# 4. Use the recorded audio for onboarding
audio_logic_old = 'speakText("Hi, I am Anchit. Welcome to my interactive portfolio. What\'s your name?", obChat);'
audio_logic_new = """// Add a system bubble manually and play the actual audio file
          addBubble("Hi, I am Anchit. Welcome to my interactive portfolio. What's your name?", 'system', obChat);
          const introAudio = new Audio('audio/anchit.m4a');
          introAudio.play().catch(e => console.warn('Audio play failed', e));"""
html = html.replace(audio_logic_old, audio_logic_new)

with open('index.html', 'w') as f:
    f.write(html)

print("Tutorial UI and audio changes applied.")
