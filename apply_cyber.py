import json

# Read extracted HTML fragments
with open('scratch-deep-dives.html', 'r') as f: deep_dives = f.read()
with open('scratch-timeline.html', 'r') as f: timeline = f.read()
with open('scratch-highlights.html', 'r') as f: highlights = f.read()
with open('scratch-projects.html', 'r') as f: projects = f.read()

# Extract sections from deep_dives
exp_idx = deep_dives.find('id="view-projects"')
proj_idx = deep_dives.find('id="view-resume"')
resume_idx = deep_dives.find('id="view-contact"')

exp_html = deep_dives[:exp_idx].rsplit('<section class="view"', 1)[0].strip()
proj_html = ('<section class="view" ' + deep_dives[exp_idx:proj_idx]).rsplit('<section class="view"', 1)[0].strip()
resume_html = ('<section class="view" ' + deep_dives[proj_idx:resume_idx]).rsplit('<section class="view"', 1)[0].strip()
contact_html = '<section class="view" ' + deep_dives[resume_idx:].strip()

# Adjust IDs and classes to fit cyberpunk style
# In cyberpunk, sections are <section id="..." class="cyber-section">
# The extracted fragments are <section class="view" id="...">...

def to_cyber_section(html_str, new_id):
    # Replace the opening <section class="view" id="..."> with <section id="..." class="cyber-section">
    import re
    # Find the first > to replace the opening tag
    first_close = html_str.find('>')
    return f'<section id="{new_id}" class="cyber-section">\n' + html_str[first_close+1:]

timeline_sec = to_cyber_section(timeline, 'work')
highlights_sec = to_cyber_section(highlights, 'exp')
projects_sec = to_cyber_section(projects, 'builds')
exp_sec = to_cyber_section(exp_html, 'deep-experience')
proj_sec = to_cyber_section(proj_html, 'deep-projects')
resume_sec = to_cyber_section(resume_html, 'resume')
contact_sec = to_cyber_section(contact_html, 'contact')

with open('cyber/index.html', 'r') as f:
    html = f.read()

# Replace timeline (id="work")
w_start = html.find('<section id="work"')
w_end = html.find('</section>', w_start) + 10
html = html[:w_start] + timeline_sec + html[w_end:]

# Replace highlights (id="exp")
e_start = html.find('<section id="exp"')
e_end = html.find('</section>', e_start) + 10
html = html[:e_start] + highlights_sec + html[e_end:]

# Replace builds (id="builds")
b_start = html.find('<section id="builds"')
b_end = html.find('</section>', b_start) + 10
html = html[:b_start] + projects_sec + html[b_end:]

# Insert deep-experience and deep-projects BEFORE chat
c_start = html.find('<section id="chat"')
html = html[:c_start] + exp_sec + '\n\n' + proj_sec + '\n\n' + html[c_start:]

# Insert resume and contact AFTER chat
# First find the end of the chat section
c_end_inner = html.find('</section>', html.find('<section id="chat"')) + 10
html = html[:c_end_inner] + '\n\n' + resume_sec + '\n\n' + contact_sec + html[c_end_inner:]

# Now update cyberSpeeches
speech_obj = """  const cyberSpeeches = {
    'hero': 'Intro. An engineer who learned to love the funnel.',
    'work': 'The Journey. My career timeline.',
    'exp': 'Highlights. The numbers that matter.',
    'builds': 'Side Projects. Built on weekends.',
    'deep-experience': 'Experience Deep Dive. The complete work history.',
    'deep-projects': 'Projects Deep Dive. Every product, zero to one.',
    'chat': 'Interactive Terminal. Talk to my AI persona.',
    'resume': 'Resume. The one page story.',
    'contact': 'Contact. Initiate connection.'
  };"""

s_start = html.find('  const cyberSpeeches = {')
s_end = html.find('};', s_start) + 2
html = html[:s_start] + speech_obj + html[s_end:]

# Update ScrollTrigger sections
# old: const sections = ['hero','work','exp','builds','chat'];
st_start = html.find("const sections = ['hero'")
if st_start != -1:
    st_end = html.find('];', st_start) + 2
    html = html[:st_start] + "const sections = ['hero','work','exp','builds','deep-experience','deep-projects','chat','resume','contact'];" + html[st_end:]

with open('cyber/index.html', 'w') as f:
    f.write(html)
print("Cyberpunk updated")
