const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const mStart = indexHtml.indexOf('<main');
const mEnd = indexHtml.lastIndexOf('</main>') + 7;
const mainContent = indexHtml.substring(mStart, mEnd);

function replaceMain(filename) {
  let html = fs.readFileSync(filename, 'utf8');
  const start = html.indexOf('<main>');
  const end = html.lastIndexOf('</main>') + 7;
  
  if (start !== -1 && end !== -1) {
    let newHtml = html.substring(0, start) + mainContent + html.substring(end);
    fs.writeFileSync(filename, newHtml);
    console.log(`Replaced <main> in ${filename}`);
  } else {
    console.log(`Could not find <main> in ${filename}`);
  }
}

replaceMain('cyber/index.html');
// nexus/index.html doesn't have a <main> tag, let's see where to put it
