import re

with open('index.html', 'r') as f:
    html = f.read()

v1_old = '<span class="work-impact-chip gold">Ratings 2.4 → 4.0</span>'
v1_new = '<span class="work-impact-chip gold">CX Optimization: Ratings 2.4 → 4.0</span>'
html = html.replace(v1_old, v1_new)

v2_old = '<span class="work-impact-chip gold">Daily Revenue Growth</span>'
v2_new = '<span class="work-impact-chip gold">Klaviyo/WebEngage: Sustained Daily Revenue Growth</span>'
html = html.replace(v2_old, v2_new)

t1_old = '<span class="work-impact-chip red">5× Qualified Leads</span>'
t1_new = '<span class="work-impact-chip red">Assisted Buying Funnel: 5× Qualified Leads</span>'
html = html.replace(t1_old, t1_new)

t2_old = '<span class="work-impact-chip">+10% Retention</span>'
t2_new = '<span class="work-impact-chip">A/B Testing: +10% Subscriber Retention</span>'
html = html.replace(t2_old, t2_new)

with open('index.html', 'w') as f:
    f.write(html)
print("Updated metrics.")
