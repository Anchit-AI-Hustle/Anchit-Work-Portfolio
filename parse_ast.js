const fs = require('fs');
const js = fs.readFileSync('final_script.js', 'utf8');

try {
  // Use Function to test syntax
  new Function(js);
  console.log("No syntax error found by Function constructor.");
} catch (e) {
  // Try to find exact syntax error using acorn if available, otherwise just print stack
  console.error(e.stack);
}
