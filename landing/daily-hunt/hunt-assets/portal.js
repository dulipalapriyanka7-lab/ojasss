
(()=>{
 const video=document.getElementById('portal-plate'), button=document.getElementById('portal-control');
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 let visible=false, requested=!motion.matches;
 function play(){video.muted=true;video.play().catch(()=>{if(video.paused)button.textContent='Retry background';});}
 function sync(){if(visible&&requested&&!document.hidden)play();else video.pause();}
 function label(){button.textContent=video.paused?'Play background':'Pause background';}
 video.addEventListener('play',label);video.addEventListener('pause',label);
 button.addEventListener('click',()=>{requested=video.paused;if(requested){if(video.error)video.load();play();}else video.pause();});
 new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();}).observe(video.closest('.portal-hero'));
 motion.addEventListener('change',()=>{requested=!motion.matches;sync();});
 document.addEventListener('visibilitychange',sync);
})();
