import json

with open('manifest.json', 'r') as f:
    data = json.load(f)

data['start_url'] = '/?source=pwa'

if 'shortcuts' in data:
    for s in data['shortcuts']:
        if '/cyber/' in s['url']:
            s['url'] = s['url'].replace('/cyber/', '/')

if 'share_target' in data and 'action' in data['share_target']:
    data['share_target']['action'] = data['share_target']['action'].replace('/cyber/', '/')

with open('manifest.json', 'w') as f:
    json.dump(data, f, indent=2)

print("Updated manifest.json.")
