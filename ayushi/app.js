const root=document.documentElement;
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mobile navigation
const menu=document.querySelector('.menu-toggle');
const nav=document.querySelector('#site-nav');
if(menu&&nav){menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}));}

// Cursor light
window.addEventListener('pointermove',e=>{root.style.setProperty('--mx',`${e.clientX}px`);root.style.setProperty('--my',`${e.clientY}px`);},{passive:true});

// Scroll depth and reveal
const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');revealObserver.unobserve(entry.target);}}),{threshold:.14});
document.querySelectorAll('.reveal').forEach(el=>revealObserver.observe(el));

if(!reduced){
  const depthEls=[...document.querySelectorAll('.scroll-depth')];
  let scheduled=false;
  const updateScroll=()=>{scheduled=false;const y=window.scrollY;root.style.setProperty('--scroll',String(y));depthEls.forEach(el=>{const d=Number(el.dataset.depth||0);el.style.transform=`translate3d(0,${-y*d}px,0) rotateX(${Math.min(11,y*.008)}deg) scale(${Math.max(.88,1-y*.00012)})`;});};
  window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateScroll);}},{passive:true});
  updateScroll();
}

// Pointer tilt cards
if(!reduced){document.querySelectorAll('.tilt-card').forEach(card=>{const strength=Number(card.dataset.tiltStrength||6);card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5;const y=(e.clientY-r.top)/r.height-.5;card.style.transform=`perspective(1100px) rotateX(${-y*strength}deg) rotateY(${x*strength}deg) translateZ(8px)`;});card.addEventListener('pointerleave',()=>{card.style.transform='';});});}

// Print button
const printButton=document.querySelector('[data-print]');
if(printButton)printButton.addEventListener('click',()=>window.print());

// Download the production-ready resume PDF.
const downloadButton=document.querySelector('[data-download-resume]');
if(downloadButton)downloadButton.addEventListener('click',()=>{const a=document.createElement('a');a.href='./assets/Ayushi_Rawat_Resume.pdf';a.download='Ayushi_Rawat_Resume.pdf';document.body.appendChild(a);a.click();a.remove();});

// Lightweight 3D particle field: rotating XYZ points projected to 2D canvas.
const canvas=document.querySelector('#scene');
if(canvas&&!reduced){
  const ctx=canvas.getContext('2d',{alpha:true});
  let width=0,height=0,dpr=1,mouseX=0,mouseY=0,raf=0;
  const points=Array.from({length:115},()=>({x:(Math.random()-.5)*900,y:(Math.random()-.5)*700,z:(Math.random()-.5)*900,s:.45+Math.random()*1.6,p:Math.random()*Math.PI*2}));
  const resize=()=>{dpr=Math.min(1.7,window.devicePixelRatio||1);width=innerWidth;height=innerHeight;canvas.width=width*dpr;canvas.height=height*dpr;canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;ctx.setTransform(dpr,0,0,dpr,0,0);};
  resize();window.addEventListener('resize',resize,{passive:true});window.addEventListener('pointermove',e=>{mouseX=(e.clientX/width-.5);mouseY=(e.clientY/height-.5);},{passive:true});
  const draw=t=>{ctx.clearRect(0,0,width,height);const time=t*.00018;const cx=width*.55,cy=height*.46;const fov=650;for(const pt of points){let x=pt.x,y=pt.y,z=pt.z;const ay=time+mouseX*.28,ax=time*.52-mouseY*.2;let x1=x*Math.cos(ay)-z*Math.sin(ay),z1=x*Math.sin(ay)+z*Math.cos(ay);let y1=y*Math.cos(ax)-z1*Math.sin(ax),z2=y*Math.sin(ax)+z1*Math.cos(ax);z2+=900;const scale=fov/z2;const sx=cx+x1*scale,sy=cy+y1*scale;const alpha=Math.max(0,Math.min(.7,(1-z2/1800)*.75));ctx.beginPath();ctx.fillStyle=`rgba(255,187,79,${alpha})`;ctx.arc(sx,sy,pt.s*scale*2.2,0,Math.PI*2);ctx.fill();}
    ctx.save();ctx.translate(cx,cy);ctx.rotate(time*.55);ctx.strokeStyle='rgba(215,164,65,.11)';ctx.lineWidth=1;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,0,Math.min(width,height)*(.25+i*.08),Math.min(width,height)*(.12+i*.04),i*.55,0,Math.PI*2);ctx.stroke();}ctx.restore();raf=requestAnimationFrame(draw);};
  raf=requestAnimationFrame(draw);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAnimationFrame(raf);else raf=requestAnimationFrame(draw);});
}
