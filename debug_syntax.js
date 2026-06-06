const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Find the script block
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
const scriptContent = html.substring(scriptStart + 8, scriptEnd);

fs.writeFileSync('extracted_script.js', scriptContent);
