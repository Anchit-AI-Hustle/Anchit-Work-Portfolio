import re

with open('index.html', 'r') as f:
    html = f.read()

# I want to find the javascript block at the end
script_start = html.find('const sectionsData = {')

if script_start != -1:
    # Within the script, replace literal newlines that were injected with the CSS fix
    # The injection was:
    # --bg-deep: #000000 !important;
    #     --bg-panel: #111111 !important;
    #     --border: #333333 !important;
    
    # Let's just find that block and replace the newlines with \n
    target = "--bg-deep: #000000 !important;\n    --bg-panel: #111111 !important;\n    --border: #333333 !important;"
    replacement = "--bg-deep: #000000 !important;\\n    --bg-panel: #111111 !important;\\n    --border: #333333 !important;"
    
    # But only inside the sectionsData part!
    before = html[:script_start]
    after = html[script_start:]
    
    after = after.replace(target, replacement)
    
    with open('index.html', 'w') as f:
        f.write(before + after)
        
print("Newlines in JSON string fixed.")
