import re
import json

with open('index.html', 'r') as f:
    html = f.read()

# Find the start of the sectionsData assignment
start_marker = "const sectionsData = {"
end_marker = "};\n    const TTS_URL"

start_idx = html.find(start_marker)
end_idx = html.find(end_marker)

if start_idx != -1 and end_idx != -1:
    # Extract the payload
    # Note: we include the { and } in the payload
    payload_str = html[start_idx + len("const sectionsData = "): end_idx + 1]
    
    # We replaced \n with \\n earlier. Let's parse it as JSON.
    try:
        data = json.loads(payload_str)
        
        # Now format it nicely as JSON text
        formatted_json = json.dumps(data, indent=2)
        
        # We will replace the JS assignment with a DOM read
        new_js = """const sectionsDataText = document.getElementById('sectionsDataPayload').textContent;
    const sectionsData = JSON.parse(sectionsDataText);"""
        
        # And inject the JSON script block right before the main script block
        # The main script block starts at <script> before start_idx
        script_tag_idx = html.rfind('<script>', 0, start_idx)
        
        json_block = f'<script type="application/json" id="sectionsDataPayload">\n{formatted_json}\n</script>\n'
        
        new_html = html[:script_tag_idx] + json_block + html[script_tag_idx:start_idx] + new_js + html[end_idx + 2:]
        
        with open('index.html', 'w') as f:
            f.write(new_html)
            
        print("Successfully migrated sectionsData to application/json script block.")
    except Exception as e:
        print("Error parsing JSON payload:", e)
else:
    print("Could not find markers.")
