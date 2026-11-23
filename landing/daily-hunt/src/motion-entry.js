/* Button bevel adapted from radiumcoders/Shiny Button (21st.dev, demo 13572).
   Spring tilt inspired by ibelick/Tilt (21st.dev, demo 1448); powered by Motion. */
import {animate,inView,scroll} from '../../../web/node_modules/motion/dist/es/index.mjs';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let dispose=()=>{};
function setupMotion(){
 dispose();if(reduced.matches)return;
 const cleanup=[],running=new Set();
 const play=(element,keyframes,options)=>{const animation=animate(element,keyframes,options);running.add(animation);animation.then(()=>running.delete(animation));return animation;};
 const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
 const hero=document.querySelector('.hero'),art=document.querySelector('.hero-art');
 if(fine&&hero&&art){const animation=animate(art,{y:[0,72],scale:[1.04,1.11]},{ease:'linear'});cleanup.push(scroll(animation,{target:hero,offset:['start start','end start']}));cleanup.push(()=>animation.cancel());}
 for(const [index,card] of [...document.querySelectorAll('.feature,.universe-card,.spotlight')].entries()){
  cleanup.push(inView(card,()=>{play(card,{opacity:[0,1],y:[20,0]},{duration:.65,delay:(index%3)*.07,ease:[.22,1,.36,1]});},{amount:.12}));
 }
 if(fine)for(const card of document.querySelectorAll('.feature,.spotlight,.launch-card,.arena-beacon')){
  card.classList.add('motion-tilt-card');let frame=0,rect=null,point={x:0,y:0},rotation=null;
  const update=()=>{frame=0;if(!rect)return;const x=Math.max(-.5,Math.min(.5,(point.x-rect.left)/rect.width-.5)),y=Math.max(-.5,Math.min(.5,(point.y-rect.top)/rect.height-.5));card.style.setProperty('--glow-x',`${(x+.5)*100}%`);card.style.setProperty('--glow-y',`${(y+.5)*100}%`);rotation?.stop();rotation=animate(card,{rotateX:-y*7,rotateY:x*7,y:-3},{type:'spring',stiffness:160,damping:24,mass:.8});};
  const enter=()=>{rect=card.getBoundingClientRect();card.classList.add('is-hovered');};
  const move=e=>{if(e.pointerType==='touch')return;point={x:e.clientX,y:e.clientY};if(!frame)frame=requestAnimationFrame(update);};
  const leave=()=>{cancelAnimationFrame(frame);frame=0;card.classList.remove('is-hovered');rotation?.stop();rotation=animate(card,{rotateX:0,rotateY:0,y:0},{type:'spring',stiffness:150,damping:22});};
  card.addEventListener('pointerenter',enter);card.addEventListener('pointermove',move);card.addEventListener('pointerleave',leave);
  cleanup.push(()=>{cancelAnimationFrame(frame);rotation?.stop();card.removeEventListener('pointerenter',enter);card.removeEventListener('pointermove',move);card.removeEventListener('pointerleave',leave);card.classList.remove('motion-tilt-card','is-hovered');card.style.removeProperty('transform');});
 }
 dispose=()=>{cleanup.forEach(fn=>fn());running.forEach(animation=>animation.stop());running.clear();document.querySelectorAll('.feature,.universe-card,.spotlight').forEach(el=>{el.style.removeProperty('opacity');el.style.removeProperty('transform');});};
}
setupMotion();reduced.addEventListener('change',setupMotion);
