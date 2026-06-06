import re

with open('old_index.html', 'r') as f:
    old_html = f.read()

# Extract from <!-- ============ SIDEBAR ============ --> to </main>
match = re.search(r'(<!-- ============ SIDEBAR ============ -->.*?)<main', old_html, re.DOTALL)
if match:
    layout_html = match.group(1)
    
    with open('index.html', 'r') as f:
        curr_html = f.read()
    
    # Replace the start of main-layout
    curr_html = curr_html.replace('<div id="main-layout">', f'<div id="main-layout">\n{layout_html}\n<main>')
    curr_html = curr_html.replace('<!-- Dynamic Section Injected Here -->\n    </div>', '<!-- Dynamic Section Injected Here -->\n    </div>\n</main>')
    
    with open('index.html', 'w') as f:
        f.write(curr_html)
    print("Injected sidebar and top-bar.")
else:
    print("Could not find layout HTML in old_index.html")
