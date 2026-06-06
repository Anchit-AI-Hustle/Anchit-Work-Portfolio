const fs = require('fs');
const json = fs.readFileSync('sectionsData.json', 'utf8');
try {
  JSON.parse(json);
  console.log("sectionsData.json is perfectly valid.");
} catch(e) {
  console.log("sectionsData.json is invalid:", e.message);
}
