with open('index.html', 'r') as f:
    html = f.read()
script_content = html.split('<script>')[-1].split('</script>')[0]
lines = script_content.split('\n')
print("--- TOP 50 LINES ---")
print('\n'.join(lines[:50]))
print("\n--- BOTTOM 50 LINES ---")
print('\n'.join(lines[-50:]))
