import re

with open('index.html', 'r') as f:
    html = f.read()

# 1. Remove the @media query that hides Email and Resume
html = re.sub(r'@media \(max-width: 380px\) \{\s*\.top-bar-link\[aria-label="Email"\],\s*\.top-bar-link\[aria-label="Resume PDF"\] \{ display: none; \}\s*\}', '', html)

# 2. Add Phone Call to top-bar-links
phone_html = """      <a href="tel:+919873945238" class="top-bar-link" aria-label="Phone Call" title="Phone Call">
        <svg class="tb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span class="tb-label">Phone</span>
      </a>"""

if "aria-label=\"Phone Call\"" not in html:
    html = html.replace('      <a href="assets/resume.pdf"', phone_html + '\n      <a href="assets/resume.pdf"')

# 3. Add logo-at.jpg to Sidebar Logo
logo_html_new = """<a class="sidebar-logo" href="#home" data-view="home" aria-label="Home" style="display:flex; flex-direction:column; align-items:center;">
    <img src="assets/logo-at.jpg" alt="Anchit Tandon Logo" style="width: 48px; height: 48px; border-radius: 8px; margin-bottom: 8px; object-fit: cover; border: 1px solid var(--accent);">
    <span>Anchit<span style="display:inline; color:var(--accent);">Tandon.</span></span>
  </a>"""

html = re.sub(r'<a class="sidebar-logo".*?>Anchit<span>Tandon\.</span></a>', logo_html_new, html)

# 4. Remove "Interactive Portfolio" from anywhere in output
html = html.replace('Anchit Tandon — Interactive Portfolio', 'Anchit Tandon')
html = html.replace('Anchit Tandon - Interactive Portfolio', 'Anchit Tandon')
html = html.replace('Interactive Portfolio', 'Portfolio')

with open('index.html', 'w') as f:
    f.write(html)
print("Updated top bar, sidebar logo, and removed hiding queries.")
