const fs = require('fs');

const cyberCss = `
  /* Premium Glassmorphism & Readability */
  .view > .container {
    background: rgba(10, 10, 12, 0.75) !important;
    backdrop-filter: blur(24px) saturate(120%) !important;
    border: 1px solid rgba(255, 43, 43, 0.15) !important;
    border-radius: 24px !important;
    padding: clamp(24px, 4vw, 48px) !important;
    box-shadow: 0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05) !important;
    margin-top: 24px !important;
    margin-bottom: 24px !important;
  }
  .home-hero h1.name { text-shadow: 0 0 40px rgba(255, 43, 43, 0.4), 0 2px 10px rgba(0,0,0,0.8) !important; }
  h2.sec-h, .eyebrow { text-shadow: 0 2px 8px rgba(0,0,0,0.8) !important; }
  .product-chip { background: rgba(20,20,24,0.6) !important; backdrop-filter: blur(12px) !important; }
  .product-chip:hover { box-shadow: 0 0 24px rgba(255, 43, 43, 0.2) !important; border-color: rgba(255, 43, 43, 0.5) !important; }
  .home-tl-item:hover { background: rgba(255, 43, 43, 0.05) !important; border-radius: 16px !important; }
  body { text-shadow: 0 1px 3px rgba(0,0,0,0.9) !important; }
`;

const nexusCss = `
  /* Premium Glassmorphism & Readability */
  .view > .container {
    background: rgba(3, 3, 5, 0.8) !important;
    backdrop-filter: blur(24px) saturate(120%) !important;
    border: 1px solid rgba(0, 255, 136, 0.2) !important;
    border-radius: 24px !important;
    padding: clamp(24px, 4vw, 48px) !important;
    box-shadow: 0 32px 64px rgba(0,0,0,0.8), inset 0 1px 0 rgba(0,255,136,0.1) !important;
    margin-top: 24px !important;
    margin-bottom: 24px !important;
  }
  .home-hero h1.name { text-shadow: 0 0 40px rgba(0, 255, 136, 0.4), 0 2px 10px rgba(0,0,0,0.8) !important; }
  h2.sec-h, .eyebrow { text-shadow: 0 2px 8px rgba(0,0,0,0.8) !important; }
  .product-chip { background: rgba(10,14,12,0.6) !important; backdrop-filter: blur(12px) !important; }
  .product-chip:hover { box-shadow: 0 0 24px rgba(0, 255, 136, 0.2) !important; border-color: rgba(0, 255, 136, 0.5) !important; }
  .home-tl-item:hover { background: rgba(0, 255, 136, 0.05) !important; border-radius: 16px !important; }
  body { text-shadow: 0 1px 3px rgba(0,0,0,0.9) !important; }
`;

function processFile(file, css) {
  let html = fs.readFileSync(file, 'utf8');
  
  // 1. Replace jpg with png
  html = html.replace(/assets\/anchit-profile\.jpg/g, 'assets/anchit-profile.png');
  
  // 2. Inject CSS if provided
  if (css) {
    const sEnd = html.lastIndexOf('</style>');
    if (sEnd !== -1) {
      html = html.substring(0, sEnd) + '\n' + css + '\n' + html.substring(sEnd);
    }
  }
  
  fs.writeFileSync(file, html);
  console.log('Enhanced ' + file);
}

processFile('index.html', '');
processFile('cyber/index.html', cyberCss);
processFile('nexus/index.html', nexusCss);
