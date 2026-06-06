const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const match = html.match(/<script type="application\/json" id="sectionsDataPayload">([\s\S]*?)<\/script>/);
if (match) {
    const jsonStr = match[1];
    try {
        JSON.parse(jsonStr);
        console.log("JSON parsed successfully in Node.");
    } catch (e) {
        console.error("JSON parse error:", e.message);
    }
} else {
    console.log("Payload script tag not found.");
}
