import json

with open('scratch-deep-dives.html', 'r') as f:
    deep_dives = f.read()

with open('scratch-chat.html', 'r') as f:
    chat = f.read()
    
with open('scratch-timeline.html', 'r') as f:
    timeline = f.read()
    
with open('scratch-highlights.html', 'r') as f:
    highlights = f.read()

with open('scratch-projects.html', 'r') as f:
    projects = f.read()

# Parse deep dives correctly without hanging tags
exp_idx = deep_dives.find('id="view-projects"')
proj_idx = deep_dives.find('id="view-resume"')
resume_idx = deep_dives.find('id="view-contact"')

exp_html = deep_dives[:exp_idx]
# Fix the hanging <section class="view"
exp_html = exp_html.rsplit('<section class="view"', 1)[0].strip()

proj_html = '<section class="view" ' + deep_dives[exp_idx:proj_idx]
proj_html = proj_html.rsplit('<section class="view"', 1)[0].strip()

resume_html = '<section class="view" ' + deep_dives[proj_idx:resume_idx]
resume_html = resume_html.rsplit('<section class="view"', 1)[0].strip()

contact_html = '<section class="view" ' + deep_dives[resume_idx:]

n1_html = "<h1>Intro</h1><p>An engineer who learned to love the funnel.</p>"

scripts_obj = f"""    const scripts = {{
      n1: {{ text: 'System initialized. I am the digital construct of Anchit Tandon. I build things that make money. Let me show you.', html: {json.dumps(n1_html)} }},
      n2: {{ text: 'The Journey. A timeline of where I have been and what I have done.', html: {json.dumps(timeline)} }},
      n3: {{ text: 'Highlights. You want the numbers. 5X MRR growth. 3 Crore ARR. Ratings 2.4 to 4.0. I engineer the funnel.', html: {json.dumps(highlights)} }},
      n4: {{ text: 'Side Projects. AI-first experiments, shipped on weekends.', html: {json.dumps(projects)} }},
      n5: {{ text: 'Experience Deep Dive. The complete work history across Vahdam, Times Internet, and more.', html: {json.dumps(exp_html)} }},
      n6: {{ text: 'Projects Deep Dive. Every major product I have shipped from zero to one.', html: {json.dumps(proj_html)} }},
      n7: {{ text: 'Interactive Terminal. Ask me anything directly via the command line below.', html: {json.dumps(chat)} }},
      n8: {{ text: 'Resume. The full professional summary on one page.', html: {json.dumps(resume_html)} }},
      n9: {{ text: 'Contact. Let us initiate a connection.', html: {json.dumps(contact_html)} }}
    }};
    const seq = ['n1','n2','n3','n4','n5','n6','n7','n8','n9'];
    let current_node_idx = 0;
"""

with open('nexus/index.html', 'r') as f:
    html = f.read()

start_idx = html.find('    const scripts = {')
# find end of scripts object by searching for the end of recruit:
recruit_idx = html.find('recruit:', start_idx)
end_idx = html.find('}', html.find('}', html.find('html:', recruit_idx))) + 1 # End of the scripts object }

if start_idx != -1 and recruit_idx != -1:
    new_html = html[:start_idx] + scripts_obj + html[end_idx:]
    
    # We also need to fix auto-nav which uses `intro` and `scripts[intro]`
    # and maybe change triggerNode or `seq` logic.
    new_html = new_html.replace("speak(scripts.intro.text, scripts.intro.sub);", "speak(scripts.n1.text); $('#modal-content').innerHTML = scripts.n1.html; $('#modal-wrapper').classList.add('open');")
    
    with open('nexus/index.html', 'w') as f:
        f.write(new_html)
    print("Replaced nexus scripts successfully.")
else:
    print("Failed to find boundaries")
