import json

# Read extracted HTML fragments
with open('scratch-deep-dives.html', 'r') as f: deep_dives = f.read()
with open('scratch-chat.html', 'r') as f: chat = f.read()
with open('scratch-timeline.html', 'r') as f: timeline = f.read()
with open('scratch-highlights.html', 'r') as f: highlights = f.read()
with open('scratch-projects.html', 'r') as f: projects = f.read()

# Extract sections
exp_idx = deep_dives.find('id="view-projects"')
proj_idx = deep_dives.find('id="view-resume"')
resume_idx = deep_dives.find('id="view-contact"')

exp_html = deep_dives[:exp_idx].rsplit('<section class="view"', 1)[0].strip()
proj_html = ('<section class="view" ' + deep_dives[exp_idx:proj_idx]).rsplit('<section class="view"', 1)[0].strip()
resume_html = ('<section class="view" ' + deep_dives[proj_idx:resume_idx]).rsplit('<section class="view"', 1)[0].strip()
contact_html = '<section class="view" ' + deep_dives[resume_idx:].strip()

# Adjust chat HTML for Nexus to use id="cli"
chat_nexus = chat.replace('id="chatInput"', 'id="cli"').replace('id="chat-input"', 'id="cli"')

n1_html = "<h1>Intro</h1><p>An engineer who learned to love the funnel.</p>"

scripts_obj = f"""    const scripts = {{
      n1: {{ text: 'System initialized. Scanning visitor... Profile matches: Recruiter or Hiring Manager. Excellent. I am the digital construct of Anchit Tandon. I build things that make money. Let me show you.', html: {json.dumps(n1_html)} }},
      n2: {{ text: 'The Journey. A timeline of where I have been and what I have done.', html: {json.dumps(timeline)} }},
      n3: {{ text: 'Highlights. You want the numbers. 5X MRR growth. 3 Crore ARR. Ratings 2.4 to 4.0. I engineer the funnel.', html: {json.dumps(highlights)} }},
      n4: {{ text: 'Side Projects. AI-first experiments, shipped on weekends.', html: {json.dumps(projects)} }},
      n5: {{ text: 'Experience Deep Dive. The complete work history across Vahdam, Times Internet, and more.', html: {json.dumps(exp_html)} }},
      n6: {{ text: 'Projects Deep Dive. Every major product I have shipped from zero to one.', html: {json.dumps(proj_html)} }},
      n7: {{ text: 'Interactive Terminal. Ask me anything directly via the command line below.', html: {json.dumps(chat_nexus)} }},
      n8: {{ text: 'Resume. The full professional summary on one page.', html: {json.dumps(resume_html)} }},
      n9: {{ text: 'Contact. Let us initiate a connection.', html: {json.dumps(contact_html)} }}
    }};
    const seq = ['n1','n2','n3','n4','n5','n6','n7','n8','n9'];
    let current_node_idx = 0;
"""

with open('nexus/index.html', 'r') as f:
    html = f.read()

# Replace scripts object
start_idx = html.find('    const scripts = {')
recruit_idx = html.find('recruit:', start_idx)
end_idx = html.find('}', html.find('}', html.find('html:', recruit_idx))) + 1

if start_idx != -1 and end_idx != -1:
    html = html[:start_idx] + scripts_obj + html[end_idx:]

# Add auto-navigation to onend
html = html.replace(
    "utter.onend = () => { isSpeaking = false; $('#avatar-box').classList.remove('speaking'); };",
    "utter.onend = () => { isSpeaking = false; $('#avatar-box').classList.remove('speaking'); setTimeout(() => { current_node_idx++; if(current_node_idx < seq.length) { triggerNode(seq[current_node_idx]); } }, 1500); };"
)

# Update triggerNode to keep current_node_idx in sync if manually clicked
html = html.replace(
    "function triggerNode(nodeId) {",
    "function triggerNode(nodeId) {\n      current_node_idx = seq.indexOf(nodeId);\n      if(current_node_idx === -1) current_node_idx = seq.length;"
)

# Fix init speech
html = html.replace(
    "speak(scripts.intro.text, scripts.intro.sub);",
    "triggerNode('n1');"
)

# Update HUD buttons
old_buttons = """      <div class="nav-grid">
        <button class="nav-btn hud-element" onclick="triggerNode('metrics')">Node 01<span>Hard Metrics</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('products')">Node 02<span>Products Shipped</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('builds')">Node 03<span>AI Side Builds</span></button>
      </div>
      
      <button class="recruiter-mode hud-element" onclick="triggerNode('recruit')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Bypass BS: Show me the ROI
      </button>"""

new_buttons = """      <div class="nav-grid" style="grid-template-columns: repeat(3, 1fr); gap: 10px; max-height: 40vh; overflow-y: auto; padding-right: 10px;">
        <button class="nav-btn hud-element" onclick="triggerNode('n1')">Node 01<span>Intro</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n2')">Node 02<span>Timeline</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n3')">Node 03<span>Highlights</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n4')">Node 04<span>Side Projects</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n5')">Node 05<span>Experience</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n6')">Node 06<span>Deep Projects</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n7')" data-view="chat">Node 07<span>Interactive Terminal</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n8')">Node 08<span>Resume</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n9')">Node 09<span>Contact</span></button>
      </div>"""

html = html.replace(old_buttons, new_buttons)

with open('nexus/index.html', 'w') as f:
    f.write(html)
print("Nexus updated")
