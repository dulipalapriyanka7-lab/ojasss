export function secondsUntil(end: number, now: number) {
  return Number.isFinite(end) && Number.isFinite(now) ? Math.max(0, Math.ceil((end - now) / 1000)) : 0;
}

export function countdownParts(seconds: number) {
  return {
    d: Math.floor(seconds / 86400),
    h: Math.floor(seconds % 86400 / 3600),
    m: Math.floor(seconds % 3600 / 60),
    s: seconds % 60,
  };
}
