const fs = require('fs');

const idxHtml = fs.readFileSync('index.html', 'utf8');

const cyberThemeCss = `
<style>
:root {
  --bg: #050506 !important;
  --bg-deep: #020202 !important;
  --surface: #0a0a0c !important;
  --surface-hover: #121216 !important;
  --primary: #ff2b2b !important;
  --primary-soft: rgba(255, 43, 43, 0.2) !important;
  --ink: #f8f8fa !important;
  --ink-dim: #a0a0aa !important;
  --ink-mute: #60606a !important;
  --rule: rgba(255, 255, 255, 0.1) !important;
  --shadow-sm: 0 4px 12px rgba(255, 43, 43, 0.15) !important;
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.8) !important;
}
/* Premium Glassmorphism & Readability */
.view > .container {
  background: rgba(10, 10, 12, 0.75) !important;
  backdrop-filter: blur(24px) saturate(120%) !important;
  border: 1px solid rgba(255, 43, 43, 0.15) !important;
  border-radius: 24px !important;
  padding: clamp(24px, 4vw, 48px) !important;
  box-shadow: 0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05) !important;
  margin-top: 24px !important;
  margin-bottom: 24px !important;
}
.home-hero h1.name { text-shadow: 0 0 40px rgba(255, 43, 43, 0.4), 0 2px 10px rgba(0,0,0,0.8) !important; color: #fff !important; }
h2.sec-h, .eyebrow { text-shadow: 0 2px 8px rgba(0,0,0,0.8) !important; color: #fff !important; }
.product-chip { background: rgba(20,20,24,0.6) !important; backdrop-filter: blur(12px) !important; }
.product-chip:hover { box-shadow: 0 0 24px rgba(255, 43, 43, 0.2) !important; border-color: rgba(255, 43, 43, 0.5) !important; }
.home-tl-item:hover { background: rgba(255, 43, 43, 0.05) !important; border-radius: 16px !important; }
body { text-shadow: 0 1px 3px rgba(0,0,0,0.9) !important; }
</style>
`;

const cyberBgHtml = `
<canvas id="bg-canvas" style="position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:-2; pointer-events:none;"></canvas>
<div class="noise" style="position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:-1; pointer-events:none; opacity:0.1; background-image:url('data:image/svg+xml,%3Csvg viewBox=\\'0 0 200 200\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cfilter id=\\'n\\'%3E%3CfeTurbulence type=\\'fractalNoise\\' baseFrequency=\\'0.85\\' numOctaves=\\'3\\' stitchTiles=\\'stitch\\'/%3E%3C/filter%3E%3Crect width=\\'100%25\\' height=\\'100%25\\' filter=\\'url(%23n)\\'/%3E%3C/svg%3E');"></div>
<div class="scanlines" style="position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:-1; pointer-events:none; background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.1)); background-size: 100% 4px;"></div>
`;

const cyberScript = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>
<script>
(function(){
  const canvas=document.getElementById("bg-canvas");
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(window.innerWidth,window.innerHeight);
  const scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x050506,0.06);
  const camera=new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,0.1,100);
  camera.position.z=9;
  const group=new THREE.Group(); scene.add(group);
  const geo=new THREE.BufferGeometry();
  const pts=[]; const colors=[];
  const c1=new THREE.Color(0xff2b2b); const c2=new THREE.Color(0x0a0a0c);
  for(let i=0;i<600;i++){
    pts.push((Math.random()-0.5)*30,(Math.random()-0.5)*30,(Math.random()-0.5)*30);
    const c=Math.random()>0.5?c1:c2;
    colors.push(c.r,c.g,c.b);
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const mat=new THREE.PointsMaterial({size:0.1,vertexColors:true,transparent:true,opacity:0.8});
  const points=new THREE.Points(geo,mat);
  group.add(points);
  for(let i=0;i<20;i++){
    const lg=new THREE.BufferGeometry();
    const lpts=[];
    let x=(Math.random()-0.5)*20, y=(Math.random()-0.5)*20, z=(Math.random()-0.5)*20;
    for(let j=0;j<5;j++){ lpts.push(x,y,z); x+=(Math.random()-0.5)*4; y+=(Math.random()-0.5)*4; z+=(Math.random()-0.5)*4; }
    lg.setAttribute('position',new THREE.Float32BufferAttribute(lpts,3));
    const lm=new THREE.LineBasicMaterial({color:0xff2b2b,transparent:true,opacity:0.3});
    group.add(new THREE.Line(lg,lm));
  }
  let time=0;
  function animate(){
    requestAnimationFrame(animate);
    time+=0.005; group.rotation.y=time*0.5; group.rotation.x=time*0.2;
    group.children.forEach(c=>{ if(c.type==='Line'){ c.material.opacity=Math.random()>0.95?0.8:0.2; } });
    renderer.render(scene,camera);
  }
  animate();
  window.addEventListener('resize',()=>{ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); });
})();
</script>
`;

const nexusThemeCss = `
<style>
:root {
  --bg: #030305 !important;
  --bg-deep: #010102 !important;
  --surface: #070908 !important;
  --surface-hover: #0a0f0d !important;
  --primary: #00ff88 !important;
  --primary-soft: rgba(0, 255, 136, 0.2) !important;
  --ink: #e8f5e9 !important;
  --ink-dim: #81c784 !important;
  --ink-mute: #388e3c !important;
  --rule: rgba(0, 255, 136, 0.15) !important;
  --shadow-sm: 0 4px 12px rgba(0, 255, 136, 0.15) !important;
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.8) !important;
}
/* Premium Glassmorphism & Readability */
.view > .container {
  background: rgba(3, 3, 5, 0.8) !important;
  backdrop-filter: blur(24px) saturate(120%) !important;
  border: 1px solid rgba(0, 255, 136, 0.2) !important;
  border-radius: 24px !important;
  padding: clamp(24px, 4vw, 48px) !important;
  box-shadow: 0 32px 64px rgba(0,0,0,0.8), inset 0 1px 0 rgba(0,255,136,0.1) !important;
  margin-top: 24px !important;
  margin-bottom: 24px !important;
}
.home-hero h1.name { text-shadow: 0 0 40px rgba(0, 255, 136, 0.4), 0 2px 10px rgba(0,0,0,0.8) !important; color: #fff !important; }
h2.sec-h, .eyebrow { text-shadow: 0 2px 8px rgba(0,0,0,0.8) !important; color: #fff !important; }
.product-chip { background: rgba(10,14,12,0.6) !important; backdrop-filter: blur(12px) !important; }
.product-chip:hover { box-shadow: 0 0 24px rgba(0, 255, 136, 0.2) !important; border-color: rgba(0, 255, 136, 0.5) !important; }
.home-tl-item:hover { background: rgba(0, 255, 136, 0.05) !important; border-radius: 16px !important; }
body { text-shadow: 0 1px 3px rgba(0,0,0,0.9) !important; }
</style>
`;

const nexusBgHtml = `
<canvas id="bg-canvas" style="position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:-2; pointer-events:none;"></canvas>
<div class="noise" style="position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:-1; pointer-events:none; opacity:0.03; background-image:url('data:image/svg+xml,%3Csvg viewBox=\\'0 0 200 200\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cfilter id=\\'n\\'%3E%3CfeTurbulence type=\\'fractalNoise\\' baseFrequency=\\'0.85\\' numOctaves=\\'3\\' stitchTiles=\\'stitch\\'/%3E%3C/filter%3E%3Crect width=\\'100%25\\' height=\\'100%25\\' filter=\\'url(%23n)\\'/%3E%3C/svg%3E');"></div>
`;

const nexusScript = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>
<script>
(function(){
  const canvas=document.getElementById("bg-canvas");
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(window.innerWidth,window.innerHeight);
  const scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x030305,0.04);
  const camera=new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,0.1,100);
  camera.position.z=12;
  const group=new THREE.Group(); scene.add(group);
  const geo=new THREE.SphereGeometry(6,32,32);
  const mat=new THREE.MeshBasicMaterial({color:0x00ff88,wireframe:true,transparent:true,opacity:0.15});
  const sphere=new THREE.Mesh(geo,mat);
  group.add(sphere);
  const pGeo=new THREE.BufferGeometry();
  const pts=[];
  for(let i=0;i<800;i++){ pts.push((Math.random()-0.5)*40,(Math.random()-0.5)*40,(Math.random()-0.5)*40); }
  pGeo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  const pMat=new THREE.PointsMaterial({color:0x00ff88,size:0.08,transparent:true,opacity:0.6});
  const points=new THREE.Points(pGeo,pMat);
  group.add(points);
  let time=0;
  function animate(){
    requestAnimationFrame(animate);
    time+=0.002; group.rotation.y=time; group.rotation.x=time*0.5;
    sphere.scale.setScalar(1 + Math.sin(time*5)*0.02);
    renderer.render(scene,camera);
  }
  animate();
  window.addEventListener('resize',()=>{ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); });
})();
</script>
`;

function duplicateAndInject(file, themeCss, bgHtml, bgScript) {
  let html = idxHtml;
  
  // Inject theme CSS just before </head>
  const headEnd = html.indexOf('</head>');
  html = html.substring(0, headEnd) + '\n' + themeCss + '\n' + html.substring(headEnd);
  
  // Inject background HTML right after <body>
  const firstTagEnd = html.indexOf('<body') + html.substring(html.indexOf('<body')).indexOf('>') + 1;
  html = html.substring(0, firstTagEnd) + '\n' + bgHtml + '\n' + html.substring(firstTagEnd);
  
  // Inject script just before </body>
  const bodyEnd = html.lastIndexOf('</body>');
  html = html.substring(0, bodyEnd) + '\n' + bgScript + '\n' + html.substring(bodyEnd);
  
  // Fix any local assets path (e.g. assets/ -> ../assets/ if needed, but wait! Vercel serves everything from root, so 'assets/anchit-profile.jpg' works on all paths if it's absolute '/assets/anchit-profile.jpg'.
  // Wait, let's replace 'assets/' with '/assets/' just in case.
  html = html.replace(/href="assets\//g, 'href="/assets/');
  html = html.replace(/src="assets\//g, 'src="/assets/');
  
  // Also fix the local redirect logic in the <head> of index.html that redirects / to /cyber if chosen == 'cyber'
  // But wait, the head has:
  /*
    var chosen = localStorage.getItem(KEY);
    if (chosen && chosen !== 'simple') {
      window.location.replace('/' + chosen + '/');
    }
  */
  // For cyber/index.html, it should ONLY redirect if chosen is NOT 'cyber'.
  // Actually, I can just strip the redirect script from the `<head>` of cyber and nexus to prevent infinite loops.
  html = html.replace(/<script>\s*\(function\(\)\{\s*var KEY='anchit-portfolio-view';[\s\S]*?\}\)\(\);\s*<\/script>/, '');

  fs.writeFileSync(file, html);
  console.log('Successfully cloned and injected ' + file);
}

duplicateAndInject('cyber/index.html', cyberThemeCss, cyberBgHtml, cyberScript);
duplicateAndInject('nexus/index.html', nexusThemeCss, nexusBgHtml, nexusScript);
