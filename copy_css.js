const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const sStart = indexHtml.indexOf('<style>');
const sEnd = indexHtml.indexOf('</style>') + 8;
const styleBlock = indexHtml.substring(sStart, sEnd);

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
</style>
`;

function injectStyles(file, themeCss) {
  let html = fs.readFileSync(file, 'utf8');
  // replace existing <style> blocks
  html = html.replace(/<style>[\s\S]*?<\/style>/g, '');
  
  // inject after <head>
  const hStart = html.indexOf('</head>');
  if (hStart !== -1) {
    html = html.substring(0, hStart) + styleBlock + '\n' + themeCss + '\n' + html.substring(hStart);
  }
  
  fs.writeFileSync(file, html);
  console.log('Injected CSS into ' + file);
}

injectStyles('cyber/index.html', cyberTheme);
injectStyles('nexus/index.html', nexusTheme);
