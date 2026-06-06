const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const match = html.match(/<\/script>\n<script>([\s\S]*?)<\/script>\n<\/body>/);
if (match) {
    const jsStr = match[1];
    fs.writeFileSync('current_script.js', jsStr);
    console.log("Script extracted. Length:", jsStr.length);
} else {
    console.log("Could not find the main script block.");
}
