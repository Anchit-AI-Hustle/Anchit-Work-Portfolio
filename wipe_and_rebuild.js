const fs = require('fs');

const idx = fs.readFileSync('index.html', 'utf8');
const bodyStart = idx.indexOf('<body');
const bodyEnd = idx.lastIndexOf('</body>') + 7;
const indexBody = idx.substring(bodyStart, bodyEnd);

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

function rebuild(file, bgHtml, bgScript) {
  let html = fs.readFileSync(file, 'utf8');
  const bStart = html.indexOf('<body');
  const bEnd = html.lastIndexOf('</body>') + 7;
  
  let newBody = indexBody;
  
  const firstTagEnd = newBody.indexOf('>') + 1;
  newBody = newBody.substring(0, firstTagEnd) + '\n' + bgHtml + '\n' + newBody.substring(firstTagEnd);
  
  const closeBodyIdx = newBody.lastIndexOf('</body>');
  newBody = newBody.substring(0, closeBodyIdx) + '\n' + bgScript + '\n' + newBody.substring(closeBodyIdx);
  
  html = html.substring(0, bStart) + newBody + html.substring(bEnd);
  fs.writeFileSync(file, html);
  console.log('Rebuilt ' + file);
}

rebuild('cyber/index.html', cyberBgHtml, cyberScript);
rebuild('nexus/index.html', nexusBgHtml, nexusScript);
