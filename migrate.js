const fs = require('fs');

const simpleHtml = fs.readFileSync('index.html', 'utf8');
const mainStart = simpleHtml.indexOf('<main');
const mainEnd = simpleHtml.lastIndexOf('</main>') + 7;
const mainHtml = simpleHtml.substring(mainStart, mainEnd);

function migrate(file) {
  let html = fs.readFileSync(file, 'utf8');
  const mStart = html.indexOf('<main');
  let mEnd = html.indexOf('</main>') + 7;
  
  if (mStart === -1 || mEnd === -1) {
    if (file.includes('nexus')) {
      // nexus doesn't have a main tag, inject it inside #hud or main-ui
      const uiStart = html.indexOf('<div class="center-stage" id="main-ui">') + 39;
      html = html.substring(0, uiStart) + '\n' + mainHtml + '\n' + html.substring(uiStart);
    }
  } else {
    html = html.substring(0, mStart) + mainHtml + html.substring(mEnd);
  }
  
  // Remove the old DATA and PROJECT_DETAILS objects
  html = html.replace(/const CONTENT[\s\S]*?const DATA = \{[\s\S]*?const PROJECT_DETAILS = \{[\s\S]*?\};/g, '');
  
  fs.writeFileSync(file, html);
  console.log('Migrated ' + file);
}

migrate('cyber/index.html');
migrate('nexus/index.html');
