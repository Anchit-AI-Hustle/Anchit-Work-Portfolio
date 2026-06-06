with open('index.html', 'r') as f:
    html = f.read()

# Replace window.onload with immediate execution inside an IIFE
html = html.replace('window.onload = () => {', '(() => {')
html = html.replace('// New session\n        speakText', '// New session\n        console.log("Starting new session");\n        speakText')
# find the closing bracket for window.onload which is a `};`
# Actually let's just do a string replace for `};` -> `})();` where it matches the onload block.
html = html.replace('      }\n    };\n    \n    window.clearSession = function() {', '      }\n    })();\n    \n    window.clearSession = function() {')
html = html.replace('      }\n    };\n    \n    function loadHistory() {', '      }\n    })();\n    \n    function loadHistory() {')

with open('index.html', 'w') as f:
    f.write(html)
