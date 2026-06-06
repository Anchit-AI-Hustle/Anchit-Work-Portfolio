const fs = require('fs');

const widgetHtml = `
<!-- GLOBAL NUDGE WIDGET -->
<div id="globalNudgeWidget" style="position: fixed; bottom: 80px; right: 24px; z-index: 999999; display: flex; flex-direction: column; gap: 12px; align-items: flex-end;">
  <!-- Mute Toggle -->
  <button id="globalMuteBtn" onclick="toggleGlobalMute()" style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: rgba(10,10,12,0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 32px rgba(0,0,0,0.4); color: #fff; cursor: pointer; transition: all 0.2s;" aria-label="Toggle Audio">
    <!-- Icon injected via JS -->
  </button>
  
  <!-- Talk With Me Nudge -->
  <button id="globalChatNudge" onclick="triggerGlobalChatNudge()" style="display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 100px; background: var(--primary, #00FF88); border: none; box-shadow: 0 8px 32px rgba(0, 255, 136, 0.4); color: #000; cursor: pointer; transition: all 0.2s; font-family: 'Space Grotesk', system-ui, sans-serif; font-size: 14px; font-weight: 700;">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    Talk With Me
  </button>
</div>

<script>
  function updateGlobalMuteIcon() {
    const isMuted = localStorage.getItem('anchit-mute') === 'true';
    const btn = document.getElementById('globalMuteBtn');
    if (isMuted) {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>'; // Mic off
    } else {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>'; // Mic on
    }
  }

  function toggleGlobalMute() {
    const isMuted = localStorage.getItem('anchit-mute') === 'true';
    localStorage.setItem('anchit-mute', !isMuted);
    updateGlobalMuteIcon();
    if (!isMuted) { 
      // Muting now -> stop any ongoing speech
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (window.audioMuted !== undefined) {
         window.audioMuted = true;
         if (typeof setPlayerState === 'function') setPlayerState(false);
      }
    } else {
      // Unmuting
      if (window.audioMuted !== undefined) {
         window.audioMuted = false;
      }
    }
  }

  function triggerGlobalChatNudge() {
    if (document.getElementById('cli')) { // Nexus
      document.getElementById('cli').focus();
    } else if (document.getElementById('ccInput')) { // Cyber
      document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => document.getElementById('ccInput').focus(), 600);
    } else if (document.getElementById('view-chat')) { // Simple
      document.getElementById('view-chat').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        const ci = document.getElementById('chat-input');
        if(ci) ci.focus();
      }, 600);
    }
  }

  document.addEventListener('DOMContentLoaded', updateGlobalMuteIcon);
</script>
`;

const mobileFixes = `
<style>
  @media (max-width: 600px) {
    .home-timeline, .products-grid, .hero-stats {
      padding: 16px !important;
      margin-bottom: 24px !important;
    }
    .hero-stats {
      grid-template-columns: 1fr !important;
    }
    .products-grid {
      grid-template-columns: 1fr !important;
    }
    .home-tl-item {
      padding-right: 0 !important;
    }
    #globalNudgeWidget {
      bottom: 60px !important;
      right: 16px !important;
    }
    #globalViewSwitcher {
      bottom: 16px !important;
      right: 16px !important;
    }
  }
</style>
`;

// Helper to inject just before </body>
function injectWidgetAndFixes(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('globalNudgeWidget')) return; // already injected
  
  // Inject mobile fixes into head
  html = html.replace('</head>', `  ${mobileFixes}\n</head>`);
  
  // Inject widget before body closes
  html = html.replace('</body>', `\n${widgetHtml}\n</body>`);
  
  fs.writeFileSync(filePath, html);
}

// 1. Patch Simple View
let indexHtml = fs.readFileSync('index.html', 'utf8');
if (!indexHtml.includes('globalNudgeWidget')) {
  indexHtml = indexHtml.replace('</head>', `  ${mobileFixes}\n</head>`);
  indexHtml = indexHtml.replace('</body>', `\n${widgetHtml}\n</body>`);
  
  // Connect topBarListenBtn to localstorage mute state logic if needed, but it's an explicit action so it's fine.
  // The main thing is muting stops current audio. toggleGlobalMute() handles that.
  fs.writeFileSync('index.html', indexHtml);
}

// 2. Patch Nexus (God Mode)
injectWidgetAndFixes('nexus/index.html');
let nexusHtml = fs.readFileSync('nexus/index.html', 'utf8');
// Hook speak()
nexusHtml = nexusHtml.replace(
  /function speak\(text\)\s*\{/,
  `function speak(text) {
    if (localStorage.getItem('anchit-mute') === 'true') return;`
);
// Also hook the init synth to ensure it doesn't speak intro if muted
nexusHtml = nexusHtml.replace(
  /synth\.speak\(utter\);/,
  `if (localStorage.getItem('anchit-mute') !== 'true') synth.speak(utter);`
);
fs.writeFileSync('nexus/index.html', nexusHtml);

// 3. Patch Cyberpunk
injectWidgetAndFixes('cyber/index.html');
let cyberHtml = fs.readFileSync('cyber/index.html', 'utf8');

// Inject audio narrative engine for cyber
const cyberAudioScript = `
<script>
  // Cyberpunk Audio Narrative Engine
  const cyberSpeeches = {
    'work': "Selected Work. Things I shipped end-to-end.",
    'builds': "Side Builds. AI-first experiments shipped after hours.",
    'exp': "The Path. Where I have operated and scaled systems.",
    'chat': "Interactive Terminal. Query the system or talk to my AI persona."
  };
  
  let lastSpoken = '';
  
  function cyberSpeak(text) {
    if (localStorage.getItem('anchit-mute') === 'true') return;
    if (!window.speechSynthesis) return;
    if (lastSpoken === text) return;
    lastSpoken = text;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.1;
    utter.pitch = 0.8; // Cyberpunk deep voice
    const voices = window.speechSynthesis.getVoices();
    const pref = voices.find(v => v.name.includes('Daniel') || v.name.includes('Google UK English Male'));
    if (pref) utter.voice = pref;
    window.speechSynthesis.speak(utter);
  }

  // Use Intersection Observer to read sections as you scroll
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            if (cyberSpeeches[id]) {
              cyberSpeak(cyberSpeeches[id]);
            }
          }
        });
      }, { threshold: 0.5 });
      
      ['work', 'builds', 'exp', 'chat'].forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      });
    }
  });
</script>
`;
if (!cyberHtml.includes('cyberSpeeches')) {
  cyberHtml = cyberHtml.replace('</body>', `\n${cyberAudioScript}\n</body>`);
  // also change globalChatNudge to use a red accent in cyber
  cyberHtml = cyberHtml.replace('var(--primary, #00FF88)', '#FF2B2B');
  cyberHtml = cyberHtml.replace('rgba(0, 255, 136, 0.4)', 'rgba(255, 43, 43, 0.4)');
  fs.writeFileSync('cyber/index.html', cyberHtml);
}

console.log("All views patched with Mobile UI, Global Mute, and Chat Nudge.");
