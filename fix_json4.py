with open('index.html', 'r') as f:
    html = f.read()

import re
# Find the start of the payload
start_idx = html.find('<script type="application/json" id="sectionsDataPayload">')
if start_idx != -1:
    content_start = start_idx + len('<script type="application/json" id="sectionsDataPayload">')
    # Find the matching closing script tag that actually ends the json script block
    # It should be followed by another <script> tag for the main js
    end_idx = html.find('</script>\n<script>', content_start)
    if end_idx != -1:
        json_content = html[content_start:end_idx].strip()
        print(f"Extracted json content length: {len(json_content)}")
        # Check if it parses now
        import json
        try:
            # We must escape </script> to make it valid HTML again if we re-insert it
            json_content_fixed = json_content.replace('</script>', '<\\/script>')
            json.loads(json_content_fixed)
            print("JSON is perfectly valid after replacing </script>!")
            
            # Write it back to the file
            new_html = html[:content_start] + "\n" + json_content_fixed + "\n" + html[end_idx:]
            with open('index.html', 'w') as out:
                out.write(new_html)
            print("Successfully fixed index.html!")
        except Exception as e:
            print("Still invalid:", e)
    else:
        print("Could not find end index")
