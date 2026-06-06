const fs = require('fs');
let html = fs.readFileSync('nexus/index.html', 'utf8');

const newNav = `      <div class="nav-grid" style="grid-template-columns: repeat(2, 1fr);">
        <button class="nav-btn hud-element" onclick="triggerNode('n2')">Node 02<span>The Journey</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n3')">Node 03<span>Highlights</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n4')">Node 04<span>Side Projects</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n5')">Node 05<span>Experience Deep Dive</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n6')">Node 06<span>Projects Deep Dive</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n7')">Node 07<span>Interactive Terminal</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n8')">Node 08<span>Resume</span></button>
        <button class="nav-btn hud-element" onclick="triggerNode('n9')">Node 09<span>Contact</span></button>
      </div>`;

html = html.replace(/<div class="nav-grid">[\s\S]*?<\/div>/, newNav);
fs.writeFileSync('nexus/index.html', html);
