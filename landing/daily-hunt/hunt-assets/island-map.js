
(()=>{
  const canvas=document.getElementById('island-map'), ctx=canvas.getContext('2d');
  if(!ctx)return;
  const texture=document.createElement('canvas');texture.width=texture.height=640;
  const map=texture.getContext('2d'), size=640;
  const sea=map.createLinearGradient(0,0,size,size);sea.addColorStop(0,'#163d47');sea.addColorStop(1,'#0a222b');
  map.fillStyle=sea;map.fillRect(0,0,size,size);
  map.strokeStyle='#ffffff22';map.lineWidth=1;
  for(let i=20;i<size;i+=30){map.beginPath();map.moveTo(i,0);map.lineTo(i,size);map.moveTo(0,i);map.lineTo(size,i);map.stroke();}
  function coast(scale){
    map.beginPath();
    for(let i=0;i<=180;i++){
      const a=i/180*Math.PI*2,r=scale*(1+.15*Math.sin(3*a+.3)+.1*Math.cos(5*a)+.06*Math.sin(11*a));
      const x=320+Math.cos(a)*205*r,y=313+Math.sin(a)*184*r;
      if(!i)map.moveTo(x,y);else map.lineTo(x,y);
    }
    map.closePath();
  }
  coast(1.11);map.strokeStyle='#7fe2d569';map.stroke();
  coast(1);map.fillStyle='#c1a770';map.fill();map.strokeStyle='#f0d298';map.lineWidth=3;map.stroke();
  for(let i=0;i<15;i++){coast(.97-i*.052);map.fillStyle=i%3===0?'#556545':i%3===1?'#48593c':'#3e5039';map.fill();map.strokeStyle='#d4ce992c';map.lineWidth=1;map.stroke();}
  map.setLineDash([6,5]);map.strokeStyle='#ffd281c4';map.lineWidth=2;
  map.beginPath();map.moveTo(185,390);map.quadraticCurveTo(335,430,326,310);map.quadraticCurveTo(310,204,438,207);map.stroke();map.setLineDash([]);
  map.font='bold 14px system-ui';map.fillStyle='#fff5d5';
  for(const [x,y,name] of [[186,390,'WEST DOCK'],[326,310,'HIGH RIDGE'],[438,207,'NORTH OUTPOST']]){
    map.beginPath();map.arc(x,y,5,0,Math.PI*2);map.fill();map.fillText(name,x-36,y+25);
  }
  map.fillStyle='#e8f8ee';map.font='bold 24px system-ui';map.fillText('ONE CHANCE / ISLAND 01',28,44);
  map.font='13px system-ui';map.fillText('RECONNAISSANCE MAP   ·   OJASSS',29,66);
  map.strokeStyle='#adccc6';map.strokeRect(13,13,614,614);

  const n=22, reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0, frame=0, inView=true, held=null, pulse=-1;
  let pullX=0,pullY=0,pullZ=0, vx=0,vy=0,vz=0, gripU=.54,gripV=.58;
  function draw(now){
    frame=0;if(!width||!height)return;
    const elapsed=(now-pulse)/1000;
    const wave=pulse>=0&&elapsed<2?Math.sin(elapsed*12)*Math.exp(-elapsed*2.5)*.17:0;
    const tx=held?held.dx:0,ty=held?held.dy:0,tz=held ? .25+Math.hypot(held.dx,held.dy)*.45 : 0;
    vx=(vx+(tx-pullX)*.10)*.86;pullX+=vx;
    vy=(vy+(ty-pullY)*.10)*.86;pullY+=vy;
    vz=(vz+(tz-pullZ)*.10)*.86;pullZ+=vz;
    ctx.clearRect(0,0,width,height);
    const side=Math.min(width*.85,height*.86), points=[];
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
      const u=i/n,v=j/n, dist=(u-gripU)**2+(v-gripV)**2;
      const weight=Math.min(1, v*3)*Math.exp(-dist*10);
      const ripple=wave*Math.sin(Math.sqrt(dist)*19-elapsed*5)*Math.min(1,v*3);
      const z=weight*pullZ+ripple+v*.025*Math.sin(u*21+v*5);
      const scale=1/(1-z*.8), x=(u-.5+weight*pullX)*scale,y=(v-.5+weight*pullY)*scale;
      points.push([width*.5+side*(x-y*.07),height*.46+side*(y+x*.07),z]);
    }
    function triangle(a,b,c,sx,sy,flip){
      const step=size/n;
      const x0=flip?step:0,y0=flip?step:0;
      const ax=flip?(a[0]-b[0])/step:(b[0]-a[0])/step;
      const ay=flip?(a[1]-b[1])/step:(b[1]-a[1])/step;
      const bx=flip?(a[0]-c[0])/step:(c[0]-a[0])/step;
      const by=flip?(a[1]-c[1])/step:(c[1]-a[1])/step;
      ctx.save();ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.closePath();ctx.clip();
      ctx.transform(ax,ay,bx,by,a[0]-ax*x0-bx*y0,a[1]-ay*x0-by*y0);
      ctx.drawImage(texture,sx,sy,step,step,0,0,step,step);
      ctx.fillStyle='rgba(0,10,15,'+Math.min(.4,Math.abs(a[2]-b[2])*6)+')';ctx.fillRect(0,0,step,step);
      ctx.restore();
    }
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const k=j*(n+1)+i,a=points[k],b=points[k+1],c=points[k+n+1],d=points[k+n+2];
      triangle(a,b,c,i*size/n,j*size/n,false);triangle(d,c,b,i*size/n,j*size/n,true);
    }
    if(held||Math.abs(pullX)+Math.abs(pullY)+Math.abs(pullZ)+Math.abs(vx)+Math.abs(vy)+Math.abs(vz)>.001||(pulse>=0&&elapsed<2))schedule();
  }
  function schedule(){if(!frame&&inView&&!document.hidden)frame=requestAnimationFrame(draw);}
  new ResizeObserver(()=>{
    const r=canvas.getBoundingClientRect(), ratio=Math.min(devicePixelRatio,1.5);
    width=r.width;height=r.height;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);schedule();
  }).observe(canvas);
  new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;schedule();}).observe(canvas);
  document.addEventListener('visibilitychange',schedule);
  canvas.addEventListener('pointerdown',e=>{
    if(reduced.matches||held)return;
    const r=canvas.getBoundingClientRect();
    held={id:e.pointerId,x:e.clientX,y:e.clientY,u:(e.clientX-r.left)/r.width,v:(e.clientY-r.top)/r.height,dx:0,dy:0};
    const side=Math.min(width*.85,height*.86);
    gripU=Math.max(0,Math.min(1,.5+(e.clientX-r.left-width*.5)/side));
    gripV=Math.max(.08,Math.min(1,.5+(e.clientY-r.top-height*.46)/side));
    canvas.setPointerCapture(e.pointerId);schedule();
  });
  canvas.addEventListener('pointermove',e=>{
    if(held?.id!==e.pointerId)return;
    held.dx=Math.max(-.48,Math.min(.48,(e.clientX-held.x)/width));
    held.dy=Math.max(-.48,Math.min(.48,(e.clientY-held.y)/height));
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(held?.id===e.pointerId){if(Math.hypot(held.dx,held.dy)>.04)pulse=performance.now();held=null;schedule();}});
  const ripple=document.getElementById('island-ripple');
  const syncMotion=()=>{ripple.hidden=reduced.matches;canvas.style.touchAction=reduced.matches?'auto':'none';};
  reduced.addEventListener('change',syncMotion);syncMotion();
  ripple.addEventListener('click',()=>{pulse=performance.now();schedule();});
})();
