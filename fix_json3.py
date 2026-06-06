with open('index.html', 'r') as f:
    html = f.read()

import re
match = re.search(r'<!-- CONTACT -->",\s*"contact": "(.*?)<script>', html, re.DOTALL)
if match:
    print("Found <script> after contact!")
    print(match.group(1)[-100:])
else:
    print("No <script> found after contact")

