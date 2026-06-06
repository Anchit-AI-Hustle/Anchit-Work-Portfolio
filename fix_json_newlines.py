import re

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
    payload = html[start_idx + len("const sectionsData = "): end_idx + 1]
    
    # The payload has literal newlines in it (which breaks JS syntax)
    # Let's replace literal newlines with "\\n"
    fixed_payload = payload.replace("\n", "\\n")
    
    # Now replace the old payload with the fixed one
    new_html = html[:start_idx + len("const sectionsData = ")] + fixed_payload + html[end_idx + 1:]
    
    with open('index.html', 'w') as f:
        f.write(new_html)
        
    print("Fixed literal newlines inside sectionsData.")
else:
    print("Could not find markers.")
