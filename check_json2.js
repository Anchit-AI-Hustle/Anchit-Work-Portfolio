const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const match = html.match(/<script type="application\/json" id="sectionsDataPayload">([\s\S]*?)<\/script>/);
if (match) {
    const jsonStr = match[1];
    console.log("Snippet near error:");
    console.log(jsonStr.substring(151400, 151500));
}
