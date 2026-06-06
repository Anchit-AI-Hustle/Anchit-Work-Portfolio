const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

const bodyStart = indexHtml.indexOf('<body');
const bodyEnd = indexHtml.lastIndexOf('</body>') + 7;
let bodyContent = indexHtml.substring(bodyStart, bodyEnd);

// For cyber/index.html
let cyberHtml = fs.readFileSync('cyber/index.html', 'utf8');
const cBodyStart = cyberHtml.indexOf('<body');
const cBodyEnd = cyberHtml.lastIndexOf('</body>') + 7;

// Replace cyber body with simple body
let newCyber = cyberHtml.substring(0, cBodyStart) + bodyContent + cyberHtml.substring(cBodyEnd);
fs.writeFileSync('cyber/index.html', newCyber);

// For nexus/index.html
let nexusHtml = fs.readFileSync('nexus/index.html', 'utf8');
const nBodyStart = nexusHtml.indexOf('<body');
const nBodyEnd = nexusHtml.lastIndexOf('</body>') + 7;

// Replace nexus body with simple body
let newNexus = nexusHtml.substring(0, nBodyStart) + bodyContent + nexusHtml.substring(nBodyEnd);
fs.writeFileSync('nexus/index.html', newNexus);

console.log('Replaced bodies!');
