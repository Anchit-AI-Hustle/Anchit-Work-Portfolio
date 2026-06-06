const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const lines = html.split('\n');
// get lines 2094 to 2446
const scriptLines = lines.slice(2094, 2446);
fs.writeFileSync('script_to_test.js', scriptLines.join('\n'));
