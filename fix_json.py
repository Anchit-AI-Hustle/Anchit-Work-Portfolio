import re

with open('index.html', 'r') as f:
    html = f.read()

payload_match = re.search(r'(<script type="application/json" id="sectionsDataPayload">\n)([\s\S]*?)(\n</script>)', html)
if payload_match:
    prefix = payload_match.group(1)
    json_str = payload_match.group(2)
    suffix = payload_match.group(3)
    
    # Replace any </script> inside the JSON string with <\/script>
    json_str = json_str.replace('</script>', '<\\/script>')
    
    new_html = html[:payload_match.start()] + prefix + json_str + suffix + html[payload_match.end():]
    
    with open('index.html', 'w') as f:
        f.write(new_html)
    print("Fixed JSON payload escaping.")
else:
    print("Could not find payload.")
