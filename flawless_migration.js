const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');

// 1. Extract <main>
const mStart = indexHtml.indexOf('<main');
const mEnd = indexHtml.lastIndexOf('</main>') + 7;
const mainHtml = indexHtml.substring(mStart, mEnd);

// 2. Extract <style>
const sStart = indexHtml.indexOf('<style>');
const sEnd = indexHtml.indexOf('</style>') + 8;
const styleHtml = indexHtml.substring(sStart, sEnd);

const cyberTheme = `
<style>
  :root[data-theme="light"], :root[data-theme="dark"], :root {
    --bg: #050506;
    --bg-elev: #0a0a0c;
    --bg-deep: #000000;
    --ink: #f8f8fa;
    --ink-dim: #a1a1aa;
    --ink-mute: #71717a;
    --rule: rgba(255,255,255,.15);
    --rule-strong: rgba(255,255,255,.3);
    --primary: #ff2b2b;
    --primary-deep: #b81f1f;
    --primary-soft: rgba(255, 43, 43, 0.12);
    --accent: #00e0ff;
    --accent-soft: rgba(0, 224, 255, 0.10);
    --font-display: 'JetBrains Mono', ui-monospace, monospace;
    --font-body: 'Space Grotesk', system-ui, sans-serif;
  }
  #bg-canvas { position:fixed; inset:0; z-index:-1; pointer-events:none; }
</style>
`;

const nexusTheme = `
<style>
  :root[data-theme="light"], :root[data-theme="dark"], :root {
    --bg: #030305;
    --bg-elev: #060608;
    --bg-deep: #000000;
    --ink: #ffffff;
    --ink-dim: #8b8b96;
    --ink-mute: #505060;
    --rule: rgba(0,255,136,0.15);
    --rule-strong: rgba(0,255,136,0.3);
    --primary: #00ff88;
    --primary-deep: #00cc6a;
    --primary-soft: rgba(0, 255, 136, 0.12);
    --accent: #ff2b2b;
    --accent-soft: rgba(255, 43, 43, 0.10);
    --font-display: 'JetBrains Mono', ui-monospace, monospace;
    --font-body: 'JetBrains Mono', ui-monospace, monospace;
  }
  #bg-canvas { position:fixed; inset:0; z-index:-1; pointer-events:none; }
</style>
`;

function migrate(file, themeCss) {
  let html = fs.readFileSync(file, 'utf8');
  
  // Replace <main>
  const mainSt = html.indexOf('<main');
  const mainEn = html.indexOf('</main>') + 7;
  if (mainSt !== -1 && mainEn !== -1) {
    html = html.substring(0, mainSt) + mainHtml + html.substring(mainEn);
  } else {
    // For nexus, maybe no <main>, inject after center-stage or just into body
    const bStart = html.indexOf('<body>');
    html = html.substring(0, bStart + 6) + '\n' + mainHtml + '\n' + html.substring(bStart + 6);
  }
  
  // Inject styles into <head>
  const headEnd = html.indexOf('</head>');
  if (headEnd !== -1) {
    html = html.substring(0, headEnd) + '\n' + styleHtml + '\n' + themeCss + '\n' + html.substring(headEnd);
  }
  
  // Remove the old JSON data structures to prevent memory bloat and confusion
  html = html.replace(/const CONTENT[\s\S]*?const DATA = \{[\s\S]*?const PROJECT_DETAILS = \{[\s\S]*?\};/g, '');
  
  fs.writeFileSync(file, html);
  console.log('Flawlessly migrated ' + file);
}

migrate('cyber/index.html', cyberTheme);
migrate('nexus/index.html', nexusTheme);
