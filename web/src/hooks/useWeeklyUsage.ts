import { useEffect } from 'react';
import { rpc } from '@/api/client';

export function useWeeklyUsage(userId?: string) {
  useEffect(() => {
    if (!userId) return;
    let interaction = performance.now();
    let previous = interaction;
    let activeSeconds = 0;
    const interact = () => { interaction = performance.now(); };
    const reset = () => { previous = performance.now(); activeSeconds = 0; };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const event of events) window.addEventListener(event, interact, { passive: true });
    document.addEventListener('visibilitychange', reset);
    window.addEventListener('pagehide', reset);
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - previous;
      previous = now;
      const playing = Array.from(document.querySelectorAll('video')).some(video => {
        const rect = video.getBoundingClientRect();
        return !video.paused && !video.seeking && video.readyState >= 3 &&
          rect.bottom > 0 && rect.top < window.innerHeight;
      });
      if (document.hidden || elapsed > 2_000 || (!playing && now - interaction >= 60_000)) {
        activeSeconds = 0;
        return;
      }
      activeSeconds += elapsed / 1000;
      if (activeSeconds >= 10) {
        const seconds = Math.min(15, Math.floor(activeSeconds));
        activeSeconds = 0;
        void rpc('weekly_usage_heartbeat', { seconds }).catch(() => {});
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      for (const event of events) window.removeEventListener(event, interact);
      document.removeEventListener('visibilitychange', reset);
      window.removeEventListener('pagehide', reset);
    };
  }, [userId]);
}
