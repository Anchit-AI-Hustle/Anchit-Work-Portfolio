import re

with open('index.html', 'r') as f:
    html = f.read()

# 1. Update #view-chat CSS
chat_css = """
  /* Universal Chat Overrides */
  #view-chat {
    display: flex !important;
    opacity: 1 !important;
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 360px;
    height: 520px;
    max-height: calc(100vh - 100px);
    border-radius: 16px;
    z-index: 9999;
    background: rgba(10, 10, 10, 0.75) !important;
    backdrop-filter: blur(24px) !important;
    -webkit-backdrop-filter: blur(24px) !important;
    border: 1px solid rgba(255, 95, 21, 0.4) !important;
    box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 30px rgba(255, 95, 21, 0.15);
    flex-direction: column;
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    animation: none !important;
    transform: translateY(0);
  }
  
  #view-chat .container {
    height: 100% !important;
    padding: 16px !important;
    max-width: 100% !important;
  }
  
  /* When Chat is ACTIVE from LHS */
  body.view-chat #view-chat {
    bottom: 0;
    right: 0;
    width: calc(100vw - var(--sidebar-w));
    height: calc(100vh - 44px);
    border-radius: 0;
    border: none !important;
    box-shadow: none;
    background: transparent !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  body.sidebar-collapsed.view-chat #view-chat {
    width: calc(100vw - var(--sidebar-w-collapsed));
  }
  @media (max-width: 820px) {
    body.view-chat #view-chat {
      width: 100vw;
      height: calc(100vh - 44px - 58px);
    }
    #view-chat {
      bottom: 80px;
      right: 16px;
      width: calc(100vw - 32px);
      height: 450px;
    }
  }
"""
html = html.replace('  #view-chat { padding-top: 12px; padding-bottom: 0; }', chat_css)

# 2. Remove "Hear this page" CTA from Top bar
html = re.sub(r'<button class="top-bar-cta listen" id="topBarListenBtn".*?</button>', '', html, flags=re.DOTALL)

# 3. Remove "Audio Listener" / "Voice Companion" to prevent duplicate transcript
html = re.sub(r'/\* ============ GLOBAL VOICE COMPANION ============ \*/.*?}\)\(\);', '/* Global Voice Companion Removed to prevent duplicate transcripts */', html, flags=re.DOTALL)

# 4. Remove `playUploadedAudio` to strictly use synthesized TTS
html = re.sub(r'function playUploadedAudio\(viewName\) \{.*?\n    \}', 'function playUploadedAudio(viewName) { return Promise.resolve(false); }', html, flags=re.DOTALL)

# 5. Add custom prompt/info in Universal Chat
chat_head_old = """<div class="title">Talk with Anchit</div>
            <div class="sub">Ask about my work, builds, career, or anything else</div>"""
chat_head_new = """<div class="title">Talk with Anchit (AI)</div>
            <div class="sub">My cloned voice and knowledge base. Ask me anything!</div>"""
html = html.replace(chat_head_old, chat_head_new)

# 6. Change chat avatar to logo-at.jpg
chat_avatar_old = '<div class="chat-head-avatar">A</div>'
chat_avatar_new = '<div class="chat-head-avatar"><img src="assets/logo-at.jpg" style="width:100%; height:100%; object-fit:cover; border-radius:50%;"></div>'
html = html.replace(chat_avatar_old, chat_avatar_new)

with open('index.html', 'w') as f:
    f.write(html)
print("Updated Universal Chat and removed duplicate listeners.")
