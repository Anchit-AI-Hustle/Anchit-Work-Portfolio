import re

with open('index.html', 'r') as f:
    html = f.read()

# 1. Update title
html = html.replace('<title>Anchit Tandon - Interactive Portfolio</title>', '<title>Anchit Tandon</title>')

# 2. Update CSS colors
css_old = """    --bg: #050505 !important;
    --bg-elev: #0a0a0a !important;
    --bg-deep: #000000 !important;
    --bg-panel: #111111 !important;
    --border: #333333 !important;
    --ink: #ffffff !important;
    --ink-mute: #888888 !important;
    --ink-dim: #444444 !important;
    --primary: #FF5F15 !important;
    --primary-dim: rgba(255, 95, 21, 0.1) !important;
    --rule: rgba(255, 255, 255, 0.1) !important;
    --accent: #FF5F15 !important;
    --accent-soft: rgba(255, 95, 21, 0.15) !important;"""

css_new = """    --bg: #050505 !important;
    --bg-elev: rgba(20, 20, 20, 0.6) !important;
    --bg-deep: #000000 !important;
    --bg-panel: rgba(10, 10, 10, 0.7) !important;
    --border: rgba(243, 179, 49, 0.3) !important;
    --ink: #ffffff !important;
    --ink-mute: rgba(255, 255, 255, 0.5) !important;
    --ink-dim: rgba(255, 255, 255, 0.8) !important;
    --primary: #FF5F15 !important;
    --primary-dim: rgba(255, 95, 21, 0.2) !important;
    --rule: rgba(255, 95, 21, 0.2) !important;
    --accent: #F3B331 !important; /* Gold */
    --accent-soft: rgba(243, 179, 49, 0.15) !important;"""
html = html.replace(css_old, css_new)

# Glassmorphism overrides
glassmorphism_css = """
  .sidebar, .top-bar, .floating-chat {
    background: rgba(10, 10, 10, 0.65) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(255, 95, 21, 0.15) !important;
  }
  
  .bubble.system {
    background: rgba(255, 95, 21, 0.1) !important;
    border: 1px solid rgba(255, 95, 21, 0.3) !important;
    color: #F3B331 !important;
  }
  
  .bubble.user {
    background: rgba(243, 179, 49, 0.1) !important;
    border: 1px solid rgba(243, 179, 49, 0.3) !important;
    color: #ffffff !important;
  }
  
  .icon-btn, .btn {
    transition: all 0.3s ease;
  }
  .icon-btn:hover, .btn:hover {
    box-shadow: 0 0 15px rgba(255, 95, 21, 0.4);
    border-color: #F3B331;
  }
"""
# inject right before </style>
html = html.replace('</style>', glassmorphism_css + '\n</style>', 1)

with open('index.html', 'w') as f:
    f.write(html)
print("Updated CSS.")
