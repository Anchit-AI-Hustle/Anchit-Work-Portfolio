import re

with open('index.html', 'r') as f:
    html = f.read()

# 1. Strip the data-theme="light" and data-theme="dark" completely and replace with the Black/Orange/Gold theme.
# Find the :root blocks
root_pattern = re.compile(r'/\* ============ DESIGN TOKENS ============\s*\*/.*?(\n  :root \{)', re.DOTALL)
new_root = """/* ============ DESIGN TOKENS ============ */
  :root {
    --bg: #050505;
    --bg-elev: rgba(20, 20, 20, 0.6);
    --bg-deep: #000000;
    --ink: #FFFFFF;
    --ink-dim: rgba(255, 255, 255, 0.7);
    --ink-mute: rgba(255, 255, 255, 0.4);
    --rule: rgba(255, 91, 31, 0.15);
    --rule-strong: rgba(243, 179, 49, 0.3);
    --primary: #ff5b1f; /* Orange */
    --primary-deep: #cc4515;
    --primary-soft: rgba(255, 91, 31, 0.15);
    --accent: #f3b331; /* Gold */
    --accent-soft: rgba(243, 179, 49, 0.15);
    --shadow-sm: 0 2px 10px rgba(255, 91, 31, 0.1);
    --shadow-md: 0 10px 30px rgba(255, 91, 31, 0.15);
    --shadow-lg: 0 30px 60px rgba(255, 91, 31, 0.25);
    --grain-opacity: 0.05;
"""
html = root_pattern.sub(new_root, html)

# 2. Add glassmorphism to Top Nav and Sidebar
html = html.replace('.top-bar {', '.top-bar {\n    backdrop-filter: blur(12px); border-bottom: 1px solid var(--rule);')
html = html.replace('.sidebar {', '.sidebar {\n    backdrop-filter: blur(16px); border-right: 1px solid var(--rule);')

# 3. Add glassmorphism to Floating Chat Widget
html = html.replace('#floatingChatWidget {', '#floatingChatWidget {\n    backdrop-filter: blur(16px); border: 1px solid var(--rule-strong); box-shadow: var(--shadow-lg);')

# 4. Remove all `[data-theme="light"]` and `[data-theme="dark"]` specific overrides to enforce the dark futuristic theme
html = re.sub(r'\[data-theme="light"\][^{]*\{[^}]*\}', '', html)
html = re.sub(r'\[data-theme="dark"\][^{]*\{[^}]*\}', '', html)

with open('index.html', 'w') as f:
    f.write(html)
print("CSS Overhauled.")
