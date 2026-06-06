import re

with open('index.backup.html', 'r') as f:
    backup_html = f.read()
    
# Extract fonts from head
fonts_match = re.search(r'(<link rel="preconnect" href="https://fonts.googleapis.com">.*?</style>)', backup_html, re.DOTALL)
fonts_css = fonts_match.group(1) if fonts_match else ""

with open('index.html', 'r') as f:
    html = f.read()

# Replace <style> with the extracted fonts + <style>
html = html.replace('<style>', fonts_css + '\n  <style>')

# Ensure variables match
with open('index.html', 'w') as f:
    f.write(html)
