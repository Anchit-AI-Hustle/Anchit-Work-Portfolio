import re

with open('index.html', 'r') as f:
    html = f.read()

# 1. Change button text
html = html.replace('>Start Experience</button>', '>Meet Anchit Tandon</button>')

# 2. Make onboarding background transparent so the aura shows through
html = html.replace('background: #050505 !important;', 'background: transparent !important; backdrop-filter: blur(2px);')

with open('index.html', 'w') as f:
    f.write(html)

print("Updates applied.")
