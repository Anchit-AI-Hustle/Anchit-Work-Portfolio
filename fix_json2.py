import re

with open('index.html', 'r') as f:
    html = f.read()

match = re.search(r'<script type="application/json" id="sectionsDataPayload">([\s\S]*?)</script>', html)
json_str = match.group(1).strip()

if "</script>" in json_str:
    print("Found literal </script> in JSON!")
else:
    print("No literal </script> found")

