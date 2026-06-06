import re
import json

with open('index.html', 'r') as f:
    html = f.read()

# 1. Update LHS Sidebar logo
old_logo = '<a class="sidebar-logo" href="#home" data-view="home" aria-label="Home">Anchit<span>Tandon.</span></a>'
new_logo = '''<a class="sidebar-logo" href="#home" data-view="home" aria-label="Home" style="margin-bottom: 24px; display: block; text-align: center;">
  <img src="assets/logo-at.jpg" alt="Anchit Tandon Logo" style="width: 80%; border-radius: 50%; border: 2px solid rgba(255, 95, 21, 0.6); box-shadow: 0 0 20px rgba(255, 95, 21, 0.3); transition: all 0.3s ease;" onmouseover="this.style.boxShadow='0 0 35px rgba(255, 95, 21, 0.8)';" onmouseout="this.style.boxShadow='0 0 20px rgba(255, 95, 21, 0.3)';">
</a>'''
html = html.replace(old_logo, new_logo)

# 2. Update collapsed sidebar CSS so the image handles it
css_old = "  body.sidebar-collapsed .sidebar-logo::before { content: \"A\"; font-size: 18px; }"
css_new = "  body.sidebar-collapsed .sidebar-logo img { width: 40px; height: 40px; }\n  body.sidebar-collapsed .sidebar-logo::before { display: none; }"
html = html.replace(css_old, css_new)

# 3. Add it to the homepage (intro section) inside sectionsDataPayload
payload_match = re.search(r'<script type="application/json" id="sectionsDataPayload">\n(.*?)\n</script>', html, re.DOTALL)
if payload_match:
    payload_str = payload_match.group(1)
    data = json.loads(payload_str)
    
    # Original intro
    if 'intro' in data:
        # Check if we already have it
        if 'logo-at.jpg' not in data['intro']:
            hero_html = '''
            <div class="section-head reveal" style="text-align: center; margin-top: 40px; margin-bottom: 40px;">
              <img src="assets/logo-at.jpg" alt="AT Logo" style="width: 150px; border-radius: 50%; border: 3px solid var(--primary); box-shadow: 0 0 40px rgba(255,95,21,0.4); margin-bottom: 24px;">
              <h1 class="display-lg">BUILDING <em>AI.</em></h1>
              <h1 class="display-lg">CREATING <em>IMPACT.</em></h1>
              <h1 class="display-lg" style="color: var(--primary);">AUTOMATING THE FUTURE.</h1>
            </div>
            '''
            data['intro'] = hero_html + data['intro']
    
    new_payload = json.dumps(data, indent=2)
    # Fix the script escaping again
    new_payload = new_payload.replace('</script>', '<\\/script>')
    
    html = html[:payload_match.start(1)] + new_payload + html[payload_match.end(1):]

with open('index.html', 'w') as f:
    f.write(html)

print("Updated Logos")
