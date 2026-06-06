import re

with open('index.html', 'r') as f:
    html = f.read()

# Force a pre-rendered bubble in HTML to prove it works
html = html.replace('<div id="onboarding-chat">', '<div id="onboarding-chat" style="border: 2px solid green; min-height: 50px;">\n        <div class="bubble system" style="background: #222; border: 1px solid #444; align-self: flex-start; color: #fff;">[HARDCODED HTML] Testing visibility.</div>')

# Force a JS alert and visual indicator when speakText runs
html = html.replace('speakText("Hi, I am Anchit.', 'document.body.insertAdjacentHTML("beforeend", "<div style=\'position:fixed;top:50px;left:50px;background:yellow;color:black;z-index:999999;padding:10px;\'>JS speakText executed!</div>");\n        speakText("Hi, I am Anchit.')

with open('index.html', 'w') as f:
    f.write(html)
