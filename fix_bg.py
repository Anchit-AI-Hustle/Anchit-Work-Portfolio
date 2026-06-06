import re

with open('index.html', 'r') as f:
    html = f.read()

target = """body {
    background: var(--bg) !important;
    color: var(--ink) !important;
    padding-left: 0 !important;
}"""

replacement = """body {
    background: var(--bg) !important;
    color: var(--ink) !important;
    padding-left: 0 !important;
    overflow-x: hidden;
}

body::before {
    content: '';
    position: fixed;
    top: 50%;
    left: 50%;
    width: 150vw;
    height: 150vh;
    background: radial-gradient(circle at center, rgba(255, 95, 21, 0.15) 0%, rgba(255, 95, 21, 0.02) 40%, transparent 70%);
    transform: translate(-50%, -50%);
    z-index: -1;
    animation: pulseBg 12s ease-in-out infinite alternate;
    pointer-events: none;
}

@keyframes pulseBg {
    0% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
    100% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
}"""

if target in html:
    new_html = html.replace(target, replacement)
    with open('index.html', 'w') as f:
        f.write(new_html)
    print("Background fixed.")
else:
    print("Target not found.")
