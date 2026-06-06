with open('index.html', 'r') as f:
    html = f.read()

head_additions = """  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <meta name="theme-color" content="#FF4D1F">"""

if '<link rel="manifest"' not in html:
    html = html.replace('<title>Anchit Tandon — Interactive OS</title>', f'<title>Anchit Tandon — Interactive OS</title>\n{head_additions}')
    with open('index.html', 'w') as f:
        f.write(html)
    print("Added PWA tags to head.")
else:
    print("PWA tags already exist.")
