const fs = require('fs');

const switcherHtml = `
<!-- GLOBAL VIEW SWITCHER -->
<div id="globalViewSwitcher" style="position: fixed; bottom: 24px; right: 24px; z-index: 999999; display: flex; gap: 6px; background: rgba(10,10,12,0.85); backdrop-filter: blur(12px); padding: 6px; border-radius: 100px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
  <button onclick="goView('simple')" style="color:#FBF5EC; background:transparent; border:none; border-radius:100px; cursor:pointer; padding:8px 16px; font-family:'Space Grotesk', system-ui, sans-serif; font-size:13px; font-weight:600; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">✦ Editorial</button>
  <button onclick="goView('cyber')" style="color:#ff2b2b; background:transparent; border:none; border-radius:100px; cursor:pointer; padding:8px 16px; font-family:'Space Grotesk', system-ui, sans-serif; font-size:13px; font-weight:600; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,43,43,0.1)'" onmouseout="this.style.background='transparent'">⌁ Cyberpunk</button>
  <button onclick="goView('nexus')" style="color:#00ff88; background:transparent; border:none; border-radius:100px; cursor:pointer; padding:8px 16px; font-family:'Space Grotesk', system-ui, sans-serif; font-size:13px; font-weight:600; transition:all 0.2s;" onmouseover="this.style.background='rgba(0,255,136,0.1)'" onmouseout="this.style.background='transparent'">◎ God Mode</button>
</div>
<script>
  function goView(v) {
    try { localStorage.setItem('anchit-portfolio-view', v); } catch(e){}
    location.href = v === 'simple' ? '/' : '/' + v + '/';
  }
  // Highlight active view
  window.addEventListener('DOMContentLoaded', () => {
    let current = 'simple';
    if(location.pathname.includes('cyber')) current = 'cyber';
    if(location.pathname.includes('nexus')) current = 'nexus';
    const btns = document.getElementById('globalViewSwitcher').querySelectorAll('button');
    if(current === 'simple') btns[0].style.background = 'rgba(255,255,255,0.15)';
    if(current === 'cyber') btns[1].style.background = 'rgba(255,43,43,0.15)';
    if(current === 'nexus') btns[2].style.background = 'rgba(0,255,136,0.15)';
  });
</script>
`;

function inject(file) {
  let html = fs.readFileSync(file, 'utf8');
  // Remove existing global view switcher if exists
  html = html.replace(/<!-- GLOBAL VIEW SWITCHER -->[\s\S]*?<\/script>/, '');
  
  // Inject before </body>
  const bEnd = html.lastIndexOf('</body>');
  if (bEnd !== -1) {
    html = html.substring(0, bEnd) + switcherHtml + '\n' + html.substring(bEnd);
  }
  fs.writeFileSync(file, html);
  console.log('Injected global switcher into ' + file);
}

inject('index.html');
inject('cyber/index.html');
inject('nexus/index.html');
