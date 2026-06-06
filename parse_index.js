const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const mainStart = html.indexOf('<main');
const mainEnd = html.indexOf('</main>') + 7;
const mainContent = html.substring(mainStart, mainEnd);
console.log(mainContent.substring(0, 500));
console.log("... " + mainContent.length + " bytes total");
