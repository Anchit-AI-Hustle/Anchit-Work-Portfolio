const fs = require('fs');

const timelineHtml = fs.readFileSync('scratch-timeline.html', 'utf8');
const projectsHtml = fs.readFileSync('scratch-projects.html', 'utf8');
const highlightsHtml = fs.readFileSync('scratch-highlights.html', 'utf8');
const switcherHtml = fs.readFileSync('scratch-switcher.html', 'utf8');
const css1 = fs.readFileSync('scratch-css.css', 'utf8');
const css2 = fs.readFileSync('scratch-css-products.css', 'utf8');

const glassmorphismCss = `
<style>
  ${css1}
  ${css2}
  /* Glassmorphism for unified content */
  .home-timeline, .products-grid, .hero-stats {
    background: rgba(10, 10, 12, 0.6) !important;
    backdrop-filter: blur(24px) saturate(120%) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 24px !important;
    padding: 24px !important;
    box-shadow: 0 32px 64px rgba(0,0,0,0.4) !important;
    margin-bottom: 40px;
  }
  [data-theme="nexus"] .home-timeline, [data-theme="nexus"] .products-grid, [data-theme="nexus"] .hero-stats {
    border-color: rgba(0, 255, 136, 0.15) !important;
  }
  [data-theme="cyber"] .home-timeline, [data-theme="cyber"] .products-grid, [data-theme="cyber"] .hero-stats {
    border-color: rgba(255, 43, 43, 0.15) !important;
  }
</style>
`;

function patchCyber() {
  let html = fs.readFileSync('cyber/index.html', 'utf8');
  
  // Inject CSS
  html = html.replace('</head>', `  ${glassmorphismCss}\n</head>`);
  
  // Add data-theme so border colors apply
  html = html.replace('<body', '<body data-theme="cyber"');
  
  // Replace the inner HTML of the sections
  html = html.replace(/<div class="proj" id="proj-list"><\/div>/, `<div class="proj" id="proj-list">${timelineHtml}</div>`);
  html = html.replace(/<div class="stats" id="build-stats"><\/div>/, `<div class="stats" id="build-stats">${projectsHtml}</div>`);
  html = html.replace(/<div class="exp" id="exp-list"><\/div>/, `<div class="exp" id="exp-list">${highlightsHtml}</div>`);
  
  // Remove the JS that populates them
  html = html.replace(/\$\("#proj-list"\)\.innerHTML = DATA\.work\.map[\s\S]*?\}\)\.join\(""\);/g, '');
  html = html.replace(/\$\("#build-stats"\)\.innerHTML = DATA\.builds\.map[\s\S]*?\}\)\.join\(""\);/g, '');
  html = html.replace(/\$\("#exp-list"\)\.innerHTML = DATA\.experience\.map[\s\S]*?\}\)\.join\(""\);/g, '');
  
  // Patch GSAP to animate the new elements
  html = html.replace(/gsap\.utils\.toArray\("\.proj-row"\)/g, 'gsap.utils.toArray(".home-tl-item, .product-chip, .hero-stat")');

  // Inject global view switcher before </body>
  html = html.replace('</body>', `\n${switcherHtml}\n</body>`);

  fs.writeFileSync('cyber/index.html', html);
  console.log('Patched cyber/index.html');
}

function patchNexus() {
  let html = fs.readFileSync('nexus/index.html', 'utf8');

  // Inject CSS
  html = html.replace('</head>', `  ${glassmorphismCss}\n</head>`);

  // Add data-theme
  html = html.replace('<body', '<body data-theme="nexus"');

  // Fix atrocious noise opacity
  html = html.replace(/<div class="noise"><\/div>/, '<div class="noise" style="opacity: 0.03;"></div>');

  // Replace script objects HTML
  // For metrics:
  html = html.replace(/metrics: \{\s*text: ".*?",\s*html: `[\s\S]*?`\s*\}/, `metrics: { text: "You want the numbers. Fine. 5X MRR growth at Times Internet. Three Crore ARR unlocked. Product ratings from 2.4 to 4.0. I don't just ship features, I engineer the funnel.", html: \`${timelineHtml}\` }`);
  
  // For products:
  html = html.replace(/products: \{\s*text: ".*?",\s*html: `[\s\S]*?`\s*\}/, `products: { text: "I have shipped 11 products total. Ranging from 0-to-1 consumer IPs like the Times Half Marathon, to complex paid wellness subscriptions. All delivered end-to-end.", html: \`${highlightsHtml}\` }`);

  // For builds:
  html = html.replace(/builds: \{\s*text: ".*?",\s*html: `[\s\S]*?`\s*\}/, `builds: { text: "Ah, my side builds. The things I code when I should be sleeping. Music AI, personal operating systems, email generation cascades. It is how I stay sharp technically while leading product.", html: \`${projectsHtml}\` }`);

  // Inject global view switcher before </body>
  html = html.replace('</body>', `\n${switcherHtml}\n</body>`);

  fs.writeFileSync('nexus/index.html', html);
  console.log('Patched nexus/index.html');
}

patchCyber();
patchNexus();
