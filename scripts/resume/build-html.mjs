// Builds assets/resume.html, the web version of the resume, from the same
// scripts/resume/content.json the PDF renderer reads, so the two never drift.
// Run: node scripts/resume/build-html.mjs
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../../', import.meta.url).pathname;
const c = JSON.parse(await readFile(ROOT + 'scripts/resume/content.json', 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urlOf = Object.fromEntries(c.projects.map((p) => [p.name, p.url]));
const shown = (u) => u.replace(/^https:\/\//, '').replace(/\/$/, '');
const featuredNames = new Set(c.featured.map((f) => f.name));
const rest = c.projects.filter((p) => !featuredNames.has(p.name));

// Split "18K+" into a countable number and its suffix for the count-up.
const countable = (v) => {
  const m = String(v).match(/^(\d+)(.*)$/);
  return m ? `<span class="count" data-to="${m[1]}">${m[1]}</span>${esc(m[2])}` : esc(v);
};

const wins = c.wins.map((w, i) => `
      <li class="win" style="--i:${i}">
        <p class="win-value">${countable(w.value)}</p>
        <p class="win-title">${esc(w.title)}</p>
        <p class="win-text">${esc(w.text)}</p>
      </li>`).join('');

const metrics = c.metrics.map((m) => `<li><b>${esc(m[0])}</b> ${esc(m[1])}</li>`).join('');

const timeline = c.timeline.map((t, i) => {
  const cls = i === c.timeline.length - 1 ? ' now' : (t[2] === 'Times Internet' ? ' promo' : '');
  return `
        <li class="stop${cls}" style="--i:${i}">
          <time>${esc(t[0])}</time>
          <span class="dot" aria-hidden="true"></span>
          <b>${esc(t[1])}</b>
          <span class="org">${esc(t[2])}</span>
        </li>`;
}).join('');

const roles = c.roles.map((r) => `
    <article class="role" data-reveal>
      <header class="role-head">
        <h3>${esc(r.title)}</h3>
        <p class="dates">${esc(r.dates)}</p>
      </header>
      <p class="role-sub">${esc(r.sub)}</p>
      ${r.previous_roles ? `<p class="promoted">${esc(r.previous_roles)}</p>` : ''}
      <ul class="bullets">${r.bullets.map((b, i) => `
        <li style="transition-delay:${i * 70}ms"><b>${esc(b[0])}</b> ${esc(b[1])}</li>`).join('')}
      </ul>
    </article>`).join('');

const earlier = c.earlier.map((e) => `
    <article class="role role-earlier" data-reveal>
      <header class="role-head">
        <h3>${esc(e.title)}</h3>
        <p class="dates">${esc(e.dates)}</p>
      </header>
      <ul class="bullets plain">${e.bullets.map((b, i) => `
        <li style="transition-delay:${i * 70}ms">${esc(b)}</li>`).join('')}
      </ul>
    </article>`).join('');

const featured = c.featured.map((f, i) => {
  const u = urlOf[f.name];
  return `
      <li data-reveal style="transition-delay:${(i % 2) * 90}ms">
        <a class="build" href="${esc(u)}" target="_blank" rel="noopener">
          <h3>${esc(f.name)}</h3>
          <p class="hook">${esc(f.hook)}</p>
          <p class="proof">${esc(f.proof)}</p>
          <p class="link">${esc(shown(u))}</p>
        </a>
      </li>`;
}).join('');

const index = rest.map((p) => `
        <li><a href="${esc(p.url)}" target="_blank" rel="noopener"><b>${esc(p.name)}</b></a> <span>${esc(p.text)}</span></li>`).join('');

const skills = c.skills.map((s) => `<li><b>${esc(s[0])}</b> ${esc(s[1])}</li>`).join('');
const education = c.education.map((e) => `
        <tr><th scope="row">${esc(e[0])}</th><td>${esc(e[1])}</td><td>${esc(e[2])}</td><td>${esc(e[3])}</td></tr>`).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Anchit Tandon | Senior Product Manager &amp; AI Builder | Resume</title>
<meta name="description" content="Anchit Tandon: senior product manager and AI builder. 5× ET Prime Assisted Sales revenue, the Delhi Half Marathon from 0 to 1 (18K+ runners), and ${c.projects.length} products built hands-on.">
<link rel="canonical" href="https://anchit-tandon.com/assets/resume.html">
<meta property="og:title" content="Anchit Tandon | Resume">
<meta property="og:image" content="https://anchit-tandon.com/assets/og/og-default.png">
<link rel="icon" type="image/svg+xml" href="/icons/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root{
  --bg:#0F0D0A;--bg-elev:#1A1814;--bg-deep:#060503;--ink:#FBF5EC;--ink-dim:#A39E94;--ink-mute:#5A554E;
  --rule:#2A261F;--rule-strong:#3D3830;--primary:#FF6940;--primary-deep:#FF4D1F;--primary-soft:rgba(255,105,64,.12);
  --accent:#c9a96e;--accent-warm:#FFB736;
  --font-display:'Fraunces','Times New Roman',serif;--font-body:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;--font-mono:'JetBrains Mono',ui-monospace,monospace;
  --ease:cubic-bezier(.2,.7,.2,1);
}
*{box-sizing:border-box}
html{background:var(--bg);-webkit-text-size-adjust:100%}
body{margin:0;color:var(--ink);font:300 16px/1.6 var(--font-body);overflow-x:clip}
a{color:inherit}
:focus-visible{outline:2px solid var(--primary);outline-offset:3px;border-radius:2px}
.wrap{max-width:920px;margin:0 auto;padding:0 24px}

/* top bar */
.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--rule)}
.bar .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;height:56px}
.bar .me{font:400 20px/1 var(--font-display);text-decoration:none}
.bar nav{display:flex;gap:8px}
.btn{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;font:500 14px/1 var(--font-body);text-decoration:none;border:1px solid var(--rule-strong);color:var(--ink);transition:background-color .2s,border-color .2s}
.btn:hover{border-color:var(--ink-dim)}
.btn.primary{background:var(--primary);border-color:var(--primary);color:#160B06}
.btn.primary:hover{background:var(--primary-deep);border-color:var(--primary-deep)}
.progress{position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--primary);transform-origin:0 50%;transform:scaleX(0)}

/* hero */
.hero{padding:64px 0 40px;position:relative}
.name{font:400 clamp(48px,9vw,96px)/.95 var(--font-display);letter-spacing:-.02em;margin:0;font-variation-settings:'opsz' 144}
.name .l{display:inline-block}
.role-line{margin:18px 0 0;font:500 15px/1.4 var(--font-body);color:var(--primary)}
.tagline{margin:22px 0 0;max-width:30ch;font:italic 300 clamp(22px,3.2vw,31px)/1.3 var(--font-display);color:var(--accent)}
.summary{margin:16px 0 0;max-width:62ch;color:var(--ink-dim)}
.contact{display:flex;flex-wrap:wrap;gap:6px 18px;margin:24px 0 0;padding:0;list-style:none;font-size:15px}
.contact a{text-decoration:none;border-bottom:1px solid var(--rule-strong);transition:border-color .2s,color .2s}
.contact a:hover{color:var(--primary);border-color:var(--primary)}
.contact li:first-child{color:var(--ink-dim)}

/* wins */
.wins{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin:40px 0 0;padding:0;list-style:none;background:var(--rule);border:1px solid var(--rule)}
.win{background:var(--bg);padding:22px 20px 20px}
.win p{margin:0}
.win-value{font:400 clamp(44px,6vw,60px)/1 var(--font-display);color:var(--primary);font-variant-numeric:tabular-nums}
.win-title{margin-top:12px!important;font-weight:500;font-size:15px}
.win-text{margin-top:4px!important;color:var(--ink-dim);font-size:14px;line-height:1.5}
.metrics{display:flex;flex-wrap:wrap;gap:8px 24px;margin:18px 0 0;padding:0;list-style:none;font-size:14px;color:var(--ink-dim)}
.metrics b{color:var(--ink);font-weight:600}

/* career line: the one orchestrated moment */
.career{margin:56px 0 0}
.career ol{position:relative;display:grid;grid-template-columns:repeat(${c.timeline.length},1fr);margin:20px 0 0;padding:0;list-style:none}
.career ol::before{content:"";position:absolute;left:calc(100%/${c.timeline.length * 2});right:calc(100%/${c.timeline.length * 2});top:34px;height:2px;background:linear-gradient(90deg,var(--accent),var(--primary));transform-origin:0 50%}
.stop{display:flex;flex-direction:column;align-items:center;text-align:center;position:relative}
.stop time{font:400 12px/1 var(--font-mono);color:var(--ink-dim);height:22px}
.dot{width:12px;height:12px;border-radius:50%;background:var(--bg);border:2px solid var(--ink-mute);margin:2px 0 12px;position:relative;z-index:1}
.stop.promo .dot{border-color:var(--primary);background:var(--primary)}
.stop.now .dot{width:16px;height:16px;margin-top:0;border-color:var(--primary);background:var(--primary);box-shadow:0 0 0 6px var(--primary-soft)}
.stop b{font-weight:600;font-size:15px}
.stop .org{font-size:13px;color:var(--ink-dim)}

/* sections */
section{margin:64px 0 0}
h2{font:italic 400 clamp(28px,4vw,39px)/1.1 var(--font-display);margin:0 0 8px;color:var(--ink)}
.lede{margin:0 0 20px;color:var(--ink-dim);font-size:15px}
.role{padding:24px 0;border-top:1px solid var(--rule)}
.role-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}
.role h3{margin:0;font:500 20px/1.3 var(--font-body)}
.dates{margin:0;font:400 13px/1 var(--font-mono);color:var(--ink-dim)}
.role-sub{margin:6px 0 0;color:var(--ink-dim);font-size:15px}
.promoted{display:inline-block;margin:12px 0 0;padding:6px 12px;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-weight:500;font-size:14px}
.bullets{margin:14px 0 0;padding:0;list-style:none}
.bullets li{position:relative;padding-left:20px;margin:0 0 10px;color:var(--ink-dim);max-width:76ch}
.bullets li::before{content:"";position:absolute;left:2px;top:.62em;width:7px;height:7px;background:var(--primary)}
.bullets.plain li::before{background:var(--accent)}
.bullets b{color:var(--ink);font-weight:500}

/* featured builds */
.builds{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:8px 0 0;padding:0;list-style:none}
.build{display:block;height:100%;padding:22px 22px 20px;background:var(--bg-elev);border:1px solid var(--rule);text-decoration:none;position:relative;overflow:hidden;transition:transform .3s var(--ease),border-color .3s}
.build::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--primary);transform-origin:50% 100%;transform:scaleY(.25);transition:transform .35s var(--ease)}
.build:hover,.build:focus-visible{transform:translateY(-3px);border-color:var(--rule-strong)}
.build:hover::before,.build:focus-visible::before{transform:scaleY(1)}
.build h3{margin:0;font:400 25px/1.15 var(--font-display)}
.build .hook{margin:8px 0 0;font-weight:500}
.build .proof{margin:6px 0 0;color:var(--ink-dim);font-size:15px}
.build .link{margin:14px 0 0;font:400 12px/1.3 var(--font-mono);color:var(--primary);word-break:break-all}

/* index */
.index{columns:2;column-gap:40px;margin:8px 0 0;padding:0;list-style:none;font-size:15px}
.index li{break-inside:avoid;margin:0 0 10px;color:var(--ink-dim)}
.index a{text-decoration:none}
.index a b{color:var(--ink);font-weight:500;border-bottom:1px solid var(--rule-strong);transition:border-color .2s,color .2s}
.index a:hover b{color:var(--primary);border-color:var(--primary)}
.skills{margin:8px 0 0;padding:0;list-style:none}
.skills li{margin:0 0 10px;color:var(--ink-dim)}
.skills b{color:var(--ink);font-weight:500;margin-right:6px}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;padding:10px 12px 10px 0;border-top:1px solid var(--rule);vertical-align:top;color:var(--ink-dim);font-weight:300}
th{color:var(--ink);font-weight:500}
footer{margin:72px 0 0;padding:28px 0 48px;border-top:1px solid var(--rule);color:var(--ink-dim);font-size:14px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}

/* motion: only when JS is on and the visitor has not asked for less */
.m .name .l{opacity:0;transform:translateY(.35em);transition:opacity .7s var(--ease),transform .7s var(--ease);transition-delay:calc(var(--d) * 28ms)}
.m .role-line,.m .tagline,.m .summary,.m .contact{opacity:0;transform:translateY(10px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.m .role-line{transition-delay:.35s}.m .tagline{transition-delay:.5s}.m .summary{transition-delay:.62s}.m .contact{transition-delay:.72s}
.m .win{opacity:0;transform:translateY(14px);transition:opacity .7s var(--ease),transform .7s var(--ease);transition-delay:calc(.8s + var(--i) * 120ms)}
.m .career ol::before{transform:scaleX(0);transition:transform 1.4s var(--ease) 1.1s}
.m .stop{opacity:0;transform:translateY(8px);transition:opacity .5s var(--ease),transform .5s var(--ease);transition-delay:calc(1.15s + var(--i) * 190ms)}
.m .stop .dot{transform:scale(0);transition:transform .45s cubic-bezier(.3,1.6,.5,1);transition-delay:calc(1.2s + var(--i) * 190ms)}
.m.go .name .l,.m.go .role-line,.m.go .tagline,.m.go .summary,.m.go .contact,.m.go .win,.m.go .stop{opacity:1;transform:none}
.m.go .career ol::before,.m.go .stop .dot{transform:none}
.m [data-reveal]{opacity:0;transform:translateY(16px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.m [data-reveal] .bullets li{opacity:0;transform:translateY(8px);transition:opacity .6s var(--ease),transform .6s var(--ease)}
.m [data-reveal].in,.m [data-reveal].in .bullets li{opacity:1;transform:none}

@media (max-width:760px){
  .wrap{padding:0 18px}
  .hero{padding:40px 0 28px}
  .bar nav .btn:not(.primary){display:none}
  .wins{grid-template-columns:1fr}
  .builds{grid-template-columns:1fr}
  .index{columns:1}
  /* career line turns vertical */
  .career ol{grid-template-columns:1fr;gap:0;padding-left:4px}
  .career ol::before{left:9px;right:auto;top:8px;bottom:8px;width:2px;height:auto;background:linear-gradient(180deg,var(--accent),var(--primary));transform-origin:50% 0}
  .m .career ol::before{transform:scaleY(0)}
  .stop{display:grid;grid-template-columns:28px 1fr;grid-template-areas:"dot role" "dot org" "dot time";align-items:center;text-align:left;padding:6px 0}
  .stop .dot{grid-area:dot;margin:0}
  .stop.now .dot{margin-left:-2px}
  .stop b{grid-area:role}.stop .org{grid-area:org}
  .stop time{grid-area:time;height:auto;font-size:11px;margin-top:2px}
  th,td{display:block;padding:2px 0;border:0}
  tr{display:block;padding:10px 0;border-top:1px solid var(--rule)}
  .role h3{font-size:18px}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}
@media print{
  @page{size:A4;margin:14mm}
  html,body{background:#fff;color:#15120E}
  .bar,footer .btn{display:none}
  .m *{opacity:1!important;transform:none!important}
  .hero{padding:0 0 12px}
  .name{font-size:40px}
  .tagline,.win-value,.promoted,.role-line,.build .link{color:#B8401A}
  .summary,.role-sub,.bullets li,.win-text,.metrics,.stop .org,.dates,.index li,.skills li,th,td,.build .proof,.stop time{color:#4F4A43}
  .win,.build{background:#fff}.wins{background:#ddd;border-color:#ddd}
  .stop b,.bullets b,.role h3,.metrics b,.index a b,.skills b,th,.build h3,.build .hook,.win-title,h2{color:#15120E}
  .dot{background:#fff}
  section{margin-top:24px;break-inside:auto}.role,.build{break-inside:avoid}
}
</style>
</head>
<body>
<header class="bar">
  <div class="wrap">
    <a class="me" href="/">Anchit Tandon</a>
    <nav aria-label="Resume actions">
      <a class="btn" href="mailto:anchit.tandon@gmail.com">Email me</a>
      <a class="btn primary" href="/assets/resume.pdf" download="Anchit-Tandon-Resume.pdf">Download PDF</a>
    </nav>
  </div>
  <span class="progress" aria-hidden="true"></span>
</header>

<main class="wrap">
  <div class="hero">
    <h1 class="name" aria-label="Anchit Tandon">Anchit Tandon</h1>
    <p class="role-line">Senior Product Manager &amp; AI Builder</p>
    <p class="tagline">${esc(c.tagline)}</p>
    <p class="summary">${esc(c.summary)}</p>
    <ul class="contact">
      <li>Delhi, India</li>
      <li><a href="tel:+919873945238">+91 98739 45238</a></li>
      <li><a href="mailto:anchit.tandon@gmail.com">anchit.tandon@gmail.com</a></li>
      <li><a href="https://anchit-tandon.com">anchit-tandon.com</a></li>
      <li><a href="https://linkedin.com/in/anchit-tandon" target="_blank" rel="noopener">LinkedIn</a></li>
    </ul>
    <ul class="wins">${wins}
    </ul>
    <ul class="metrics">${metrics}</ul>
    <div class="career">
      <h2>Career line</h2>
      <ol aria-label="Career progression">${timeline}
      </ol>
    </div>
  </div>

  <section aria-labelledby="exp">
    <h2 id="exp">Experience</h2>${roles}
  </section>

  <section aria-labelledby="early">
    <h2 id="early">Earlier, as an engineer</h2>${earlier}
  </section>

  <section aria-labelledby="feat">
    <h2 id="feat">Featured builds</h2>
    <p class="lede">Six of the ${c.projects.length} products I have built hands-on. Each card opens the live product.</p>
    <ul class="builds">${featured}
    </ul>
  </section>

  <section aria-labelledby="all" data-reveal>
    <h2 id="all">Everything else I have built</h2>
    <ul class="index">${index}
    </ul>
  </section>

  <section aria-labelledby="skills" data-reveal>
    <h2 id="skills">Skills</h2>
    <ul class="skills">${skills}</ul>
  </section>

  <section aria-labelledby="edu" data-reveal>
    <h2 id="edu">Education</h2>
    <table>
      <tbody>${education}
      </tbody>
    </table>
  </section>

  <footer>
    <span>Anchit Tandon, Delhi</span>
    <a class="btn primary" href="/assets/resume.pdf" download="Anchit-Tandon-Resume.pdf">Download PDF</a>
  </footer>
</main>

<script>
(function(){
  var root=document.documentElement;
  var still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Split the name into letters for the opening sequence.
  var name=document.querySelector('.name');
  if(!still&&name){
    var t=name.textContent,out='';
    for(var i=0;i<t.length;i++){out+=t[i]===' '?' ':'<span class="l" aria-hidden="true" style="--d:'+i+'">'+t[i]+'</span>'}
    name.innerHTML=out;
  }
  if(still) return;
  root.classList.add('m');
  // Count-up for the headline numbers.
  function count(el){
    var to=+el.getAttribute('data-to'),t0=null,dur=1100;
    function step(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/dur,1),e=1-Math.pow(1-p,3);el.textContent=Math.round(to*e);if(p<1)requestAnimationFrame(step)}
    el.textContent='0';requestAnimationFrame(step);
  }
  requestAnimationFrame(function(){requestAnimationFrame(function(){
    root.classList.add('go');
    var counts=document.querySelectorAll('.count');
    for(var i=0;i<counts.length;i++){(function(el,k){setTimeout(function(){count(el)},800+k*120)})(counts[i],i)}
  })});
  // Reveal sections as they scroll in.
  var items=document.querySelectorAll('[data-reveal]');
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px',threshold:.08});
    for(var j=0;j<items.length;j++)io.observe(items[j]);
  }else{for(var k=0;k<items.length;k++)items[k].classList.add('in')}
  // Scroll progress, written only while the visitor scrolls.
  var bar=document.querySelector('.progress'),queued=false;
  function paint(){queued=false;var h=document.documentElement.scrollHeight-innerHeight;bar.style.transform='scaleX('+(h>0?Math.min(scrollY/h,1):0)+')'}
  addEventListener('scroll',function(){if(!queued){queued=true;requestAnimationFrame(paint)}},{passive:true});
  // Printing shows everything.
  addEventListener('beforeprint',function(){for(var i=0;i<items.length;i++)items[i].classList.add('in')});
})();
</script>
</body>
</html>
`;
await writeFile(ROOT + 'assets/resume.html', html);
console.log('[resume-html] wrote assets/resume.html');
