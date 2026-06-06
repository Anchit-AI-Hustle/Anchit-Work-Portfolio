import re

with open('index.html', 'r') as f:
    html = f.read()

# Remove the broken body::before grain effect entirely
html = re.sub(r'body::before\s*\{[^}]+\}', '', html)

# Inject the strong black and orange overrides
root_overrides = """
:root {
    --bg: #050505 !important;
    --bg-elev: #0a0a0a !important;
    --bg-deep: #000000 !important;
    --ink: #ffffff !important;
    --ink-mute: #888888 !important;
    --ink-dim: #444444 !important;
    --primary: #FF5F15 !important;
    --primary-dim: rgba(255, 95, 21, 0.1) !important;
    --rule: rgba(255, 255, 255, 0.1) !important;
    --accent: #FF5F15 !important;
    --accent-soft: rgba(255, 95, 21, 0.15) !important;
    --sidebar-w: 0px !important; /* Hide sidebar offsets */
}

body {
    background: var(--bg) !important;
    color: var(--ink) !important;
    padding-left: 0 !important;
}

#onboarding {
    background: #050505 !important;
}
"""

html = html.replace('</style>', root_overrides + '\n</style>')

with open('index.html', 'w') as f:
    f.write(html)
