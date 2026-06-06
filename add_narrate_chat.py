import re

with open('index.html', 'r') as f:
    html = f.read()

chat_head_new = """<div class="title">Talk with Anchit (AI)</div>
            <div class="sub">My cloned voice and knowledge base. Ask me anything!</div>"""

chat_head_with_button = """<div class="title" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
              <span>Talk with Anchit (AI)</span>
              <button id="chatNarrateBtn" style="background:var(--primary); color:#000; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">Hear me narrate</button>
            </div>
            <div class="sub">My cloned voice and knowledge base. Ask me anything!</div>"""

html = html.replace(chat_head_new, chat_head_with_button)

# Also need to bind #chatNarrateBtn to the TTS logic!
# Previously it was bound to #topBarListenBtn, so I'll just change the JS to listen to #chatNarrateBtn
html = html.replace("document.getElementById('topBarListenBtn')", "document.getElementById('chatNarrateBtn')")

with open('index.html', 'w') as f:
    f.write(html)
print("Added Narrate Page button to Universal Chat.")
