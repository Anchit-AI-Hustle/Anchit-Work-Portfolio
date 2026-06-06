import re
import json

with open('index.html', 'r') as f:
    html = f.read()

# Extract the JSON payload
match = re.search(r'<script type="application/json" id="sectionsDataPayload">([\s\S]*?)</script>', html)
if not match:
    print("Could not find payload")
    exit(1)

json_str = match.group(1).strip()

try:
    data = json.loads(json_str)
    print("JSON parsed successfully in Python!")
except json.JSONDecodeError as e:
    print(f"JSON error at pos {e.pos}: {e.msg}")
    print("Snippet:", json_str[max(0, e.pos-50):e.pos+50])
