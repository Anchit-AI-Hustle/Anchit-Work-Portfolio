const fs = require('fs');

const deepDivesHtml = fs.readFileSync('scratch-deep-dives.html', 'utf8');
const chatHtml = fs.readFileSync('scratch-chat.html', 'utf8');
const deepCss = fs.readFileSync('scratch-deep-css.css', 'utf8');
const timelineHtml = fs.readFileSync('scratch-timeline.html', 'utf8');
const highlightsHtml = fs.readFileSync('scratch-highlights.html', 'utf8');
const projectsHtml = fs.readFileSync('scratch-projects.html', 'utf8');

const expDeepHtml = deepDivesHtml.split('id="view-projects"')[0];
const projDeepHtml = '<section class="view" id="view-projects"' + deepDivesHtml.split('id="view-projects"')[1].split('id="view-resume"')[0];
const resumeDeepHtml = '<section class="view" id="view-resume"' + deepDivesHtml.split('id="view-resume"')[1].split('id="view-contact"')[0];
const contactDeepHtml = '<section class="view" id="view-contact"' + deepDivesHtml.split('id="view-contact"')[1];

const cyberMain = '<main>' +
  '<section id="hero">' +
    '<div class="kicker" id="k-kicker">SYSTEM ONLINE // PRODUCT × ENGINEERING × AI</div>' +
    '<h1>' +
      '<span class="glitch go" data-t="ANCHIT">ANCHIT</span><br>' +
      '<span class="l2 glitch" data-t="TANDON">TANDON</span><span class="dot">.</span>' +
    '</h1>' +
    '<p class="lede" id="hero-lede"><b>An engineer who learned to love the funnel.</b></p>' +
    '<div class="scroll-cue">scroll<div class="ln"></div></div>' +
  '</section>' +
  '<div class="marquee"><div class="track mq-track"></div></div>' +
  '<section id="work">' +
    '<div class="eyebrow">02 — The Journey</div>' +
    '<div class="proj" id="proj-list">' + timelineHtml + '</div>' +
  '</section>' +
  '<div class="marquee"><div class="track mq-track"></div></div>' +
  '<section id="exp">' +
    '<div class="eyebrow">03 — Highlights</div>' +
    '<div class="exp" id="exp-list">' + highlightsHtml + '</div>' +
  '</section>' +
  '<div class="marquee"><div class="track mq-track"></div></div>' +
  '<section id="builds">' +
    '<div class="eyebrow">04 — Side Projects</div>' +
    '<div class="stats" id="build-stats">' + projectsHtml + '</div>' +
  '</section>' +
  '<div class="marquee"><div class="track mq-track"></div></div>' +
  '<section id="deep-experience">' +
    '<div class="eyebrow">05 — Experience Deep Dive</div>' + expDeepHtml +
  '</section>' +
  '<div class="marquee"><div class="track mq-track"></div></div>' +
  '<section id="deep-projects">' +
    '<div class="eyebrow">06 — Projects Deep Dive</div>' + projDeepHtml +
  '</section>' +
  '<div class="marquee"><div class="track mq-track"></div></div>' +
  '<section id="chat">' +
    '<div class="eyebrow">07 — Interactive Terminal</div>' + chatHtml +
  '</section>' +
  '<div class="marquee"><div class="track mq-track"></div></div>' +
  '<section id="resume">' +
    '<div class="eyebrow">08 — Resume</div>' + resumeDeepHtml +
  '</section>' +
  '<div class="marquee"><div class="track mq-track"></div></div>' +
  '<section id="contact">' +
    '<div class="eyebrow">09 — Contact</div>' + contactDeepHtml +
  '</section>' +
'</main>';

function patchCyber() {
  let html = fs.readFileSync('cyber/index.html', 'utf8');
  html = html.replace(/<main>[\s\S]*?<\/main>/, () => cyberMain);
  
  if (!html.includes('.work-list {')) {
    html = html.replace('</head>', '  <style>\\n' + deepCss + '\\n</style>\\n</head>');
  }

  html = html.replace(/gsap\.to\("#mq",[\s\S]*?\}\)\;/g, '');
  html = html.replace(/gsap\.to\("#mq2",[\s\S]*?\}\)\;/g, '');
  html = html.replace(/gsap\.to\("#mq3",[\s\S]*?\}\)\;/g, '');
  
  const gsapMq = "  gsap.utils.toArray('.marquee').forEach((mq, i) => {\\n" +
    "    gsap.to(mq.querySelector('.track'), {\\n" +
    "      xPercent: i % 2 === 0 ? -33 : 33,\\n" +
    "      ease: 'none',\\n" +
    "      scrollTrigger: { trigger: mq, scrub: 1, start: 'top bottom', end: 'bottom top' }\\n" +
    "    });\\n" +
    "  });\\n";

  if (!html.includes('gsap.utils.toArray(".marquee")')) {
    html = html.replace(/gsap\.utils\.toArray\("\.sec-h"\)/, gsapMq + '  gsap.utils.toArray(".sec-h")');
  }

  const cyberSpeeches = "  const cyberSpeeches = {\\n" +
    "    'hero': 'Intro. An engineer who learned to love the funnel.',\\n" +
    "    'work': 'The Journey. My career timeline.',\\n" +
    "    'exp': 'Highlights. The numbers that matter.',\\n" +
    "    'builds': 'Side Projects. Built on weekends.',\\n" +
    "    'deep-experience': 'Experience Deep Dive. The complete work history.',\\n" +
    "    'deep-projects': 'Projects Deep Dive. Every product, zero to one.',\\n" +
    "    'chat': 'Interactive Terminal. Talk to my AI persona.',\\n" +
    "    'resume': 'Resume. The one page story.',\\n" +
    "    'contact': 'Contact. Initiate connection.'\\n" +
    "  };";
  html = html.replace(/const cyberSpeeches = \{[\s\S]*?\};/, cyberSpeeches);
  
  html = html.replace(/\['work', 'builds', 'exp', 'chat'\]\.forEach/, "['hero', 'work', 'exp', 'builds', 'deep-experience', 'deep-projects', 'chat', 'resume', 'contact'].forEach");
  
  fs.writeFileSync('cyber/index.html', html);
  console.log('Patched Cyberpunk');
}

function patchNexus() {
  let html = fs.readFileSync('nexus/index.html', 'utf8');
  
  if (!html.includes('.work-list {')) {
    html = html.replace('</head>', '  <style>\\n' + deepCss + '\\n</style>\\n</head>');
  }

  const n1Html = "<h1>Intro</h1><p>An engineer who learned to love the funnel.</p>";

  const newScriptsObj = "    const scripts = {\\n" +
    "      n1: { text: 'System initialized. I am the digital construct of Anchit Tandon. I build things that make money. Let me show you.', html: " + JSON.stringify(n1Html) + " },\\n" +
    "      n2: { text: 'The Journey. A timeline of where I have been and what I have done.', html: " + JSON.stringify(timelineHtml) + " },\\n" +
    "      n3: { text: 'Highlights. You want the numbers. 5X MRR growth. 3 Crore ARR. Ratings 2.4 to 4.0. I engineer the funnel.', html: " + JSON.stringify(highlightsHtml) + " },\\n" +
    "      n4: { text: 'Side Projects. AI-first experiments, shipped on weekends.', html: " + JSON.stringify(projectsHtml) + " },\\n" +
    "      n5: { text: 'Experience Deep Dive. The complete work history across Vahdam, Times Internet, and more.', html: " + JSON.stringify(expDeepHtml) + " },\\n" +
    "      n6: { text: 'Projects Deep Dive. Every major product I have shipped from zero to one.', html: " + JSON.stringify(projDeepHtml) + " },\\n" +
    "      n7: { text: 'Interactive Terminal. Ask me anything directly via the command line below.', html: " + JSON.stringify(chatHtml) + " },\\n" +
    "      n8: { text: 'Resume. The full professional summary on one page.', html: " + JSON.stringify(resumeDeepHtml) + " },\\n" +
    "      n9: { text: 'Contact. Let us initiate a connection.', html: " + JSON.stringify(contactDeepHtml) + " }\\n" +
    "    };\\n" +
    "    const seq = ['n1','n2','n3','n4','n5','n6','n7','n8','n9'];\\n";
  
  html = html.replace(/const scripts = \{[\s\S]*?\};\s*let current = 'intro';\s*const seq = \['intro', 'metrics', 'products', 'builds'\];/, () => newScriptsObj + "    let current = 'n1';");
  
  const newHud = "        <ul id=\"node-list\">\\n" +
    "          <li data-node=\"n1\" class=\"active\"><span class=\"arr\">></span> 01_Intro</li>\\n" +
    "          <li data-node=\"n2\"><span class=\"arr\">></span> 02_The_Journey</li>\\n" +
    "          <li data-node=\"n3\"><span class=\"arr\">></span> 03_Highlights</li>\\n" +
    "          <li data-node=\"n4\"><span class=\"arr\">></span> 04_Side_Projects</li>\\n" +
    "          <li data-node=\"n5\"><span class=\"arr\">></span> 05_Experience_Deep</li>\\n" +
    "          <li data-node=\"n6\"><span class=\"arr\">></span> 06_Projects_Deep</li>\\n" +
    "          <li data-node=\"n7\"><span class=\"arr\">></span> 07_Terminal_Chat</li>\\n" +
    "          <li data-node=\"n8\"><span class=\"arr\">></span> 08_Resume</li>\\n" +
    "          <li data-node=\"n9\"><span class=\"arr\">></span> 09_Contact</li>\\n" +
    "        </ul>\\n";
  html = html.replace(/<ul id="node-list">[\s\S]*?<\/ul>/, () => newHud);
  
  fs.writeFileSync('nexus/index.html', html);
  console.log('Patched Nexus');
}

try {
  patchCyber();
  patchNexus();
} catch(e) {
  console.error(e);
}
