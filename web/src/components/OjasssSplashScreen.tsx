import {useLayoutEffect,type CSSProperties} from 'react';
import {platform} from '@/lib/platform';

export type SplashPhase = 'starting'|'preparing'|'feed'|'ready'|'error';
const messages: Record<SplashPhase,string> = {
  starting:'Starting OJASSS…',preparing:'Getting things ready…',feed:'Loading your feed…',
  ready:'You’re all set!',error:'OJASSS couldn’t finish loading.',
};

export function OjasssSplashScreen({phase,progress,onRetry}:{phase:SplashPhase;progress?:number;onRetry:()=>void}) {
  useLayoutEffect(()=>{
    document.getElementById('ojasss-static-splash')?.remove();
    const frame=requestAnimationFrame(()=>platform.send({type:'ui_ready'}));
    return ()=>cancelAnimationFrame(frame);
  },[]);
  const failed=phase==='error';
  return <section className="oj-splash" data-exit={phase==='ready'} aria-label="OJASSS startup">
    <span className="oj-splash-wave" aria-hidden/>
    <div className="oj-splash-content">
      <div className="oj-splash-orbit" aria-hidden>
        <span className="oj-splash-ring"/>
        <span className="oj-splash-rotor"><span className="oj-splash-star-glow"><i className="oj-splash-star"/></span></span>
        <img className="oj-splash-logo" src="/brand/logo.png" alt="" width="160" height="160"/>
      </div>
      <strong className="oj-splash-brand">OJASSS</strong>
      <span className="oj-splash-tagline">THE INDIAN MASS POWER APP</span>
      <p className="oj-splash-state" key={phase} role={failed?'alert':'status'}>{messages[phase]}</p>
      {failed?<button type="button" className="oj-splash-retry" onClick={onRetry}>Try again</button>:<>
        <div className="oj-splash-progress" data-pending={progress===undefined} role="progressbar" aria-label="Startup progress" aria-valuenow={progress} style={{'--oj-progress':progress} as CSSProperties}>
          <span className="oj-splash-segment"><span className="oj-splash-star-glow"><i className="oj-splash-star"/></span></span>
        </div>
        {progress!==undefined&&<span className="oj-splash-percent">{progress}%</span>}
      </>}
    </div>
  </section>;
}
