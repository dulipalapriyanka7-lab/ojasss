/* The 24/7 cycle clock (spec sections 1 and 6).
 *
 * The whole flow is driven by ONE always-running clock, exactly like the real
 * server would be: nobody starts a match by hand. Phase is a pure function of
 * the clock, so refreshing the page drops you back into whatever is happening
 * right now.
 *
 *   |<------------- 30 min cycle ------------->|
 *   [  MATCH 20:00  ][ RESULTS ][ LOBBY ][SHIP ]
 *                    \________ 10 min break ___/
 */
window.OJ = window.OJ || {};

OJ.Schedule = (function () {
  var C = OJ.CONFIG.schedule;

  var cycleSeconds = C.matchSeconds + C.breakSeconds;

  var state = {
    timeScale: OJ.CONFIG.defaultTimeScale,
    virtualSeconds: 0,   // seconds since the epoch, on the scaled clock
    paused: false
  };

  /** Boot the clock from wall time so it feels like it has been running forever. */
  function init() {
    var realElapsed = (Date.now() - C.epochMs) / 1000;
    state.virtualSeconds = realElapsed * state.timeScale;
  }

  function setTimeScale(scale) {
    state.timeScale = scale;
  }

  function advance(realDtSeconds) {
    if (state.paused) return;
    state.virtualSeconds += realDtSeconds * state.timeScale;
  }

  /** Jump forward to a position inside the CURRENT cycle (never wraps round). */
  function skipWithinCycle(targetPos) {
    var pos = state.virtualSeconds % cycleSeconds;
    if (targetPos <= pos) return false;          // already past it - do nothing
    state.virtualSeconds += (targetPos - pos) + 0.001;
    return true;
  }

  /** Jump forward to a cycle position, wrapping into the next cycle if needed. */
  function skipTo(targetPos) {
    var pos = state.virtualSeconds % cycleSeconds;
    var delta = targetPos - pos;
    if (delta <= 0) delta += cycleSeconds;
    state.virtualSeconds += delta + 0.001;
  }

  /** Force the current cycle to end and the next match to board immediately. */
  function forceNextMatch() {
    skipTo(cycleSeconds - C.shipBoardingSeconds);
  }

  function read() {
    var pos = state.virtualSeconds % cycleSeconds;
    var cycleIndex = Math.floor(state.virtualSeconds / cycleSeconds);

    var resultsEnd = C.matchSeconds + C.resultsSeconds;
    var shipStart = cycleSeconds - C.shipBoardingSeconds;

    var phase, phaseElapsed, phaseTotal;
    if (pos < C.matchSeconds) {
      phase = 'MATCH';       phaseElapsed = pos;                  phaseTotal = C.matchSeconds;
    } else if (pos < resultsEnd) {
      phase = 'RESULTS';     phaseElapsed = pos - C.matchSeconds; phaseTotal = C.resultsSeconds;
    } else if (pos < shipStart) {
      phase = 'LOBBY';       phaseElapsed = pos - resultsEnd;     phaseTotal = shipStart - resultsEnd;
    } else {
      phase = 'SHIP';        phaseElapsed = pos - shipStart;      phaseTotal = C.shipBoardingSeconds;
    }

    return {
      phase: phase,
      cycleIndex: cycleIndex,
      cyclePos: pos,
      matchTime: pos,                               // only meaningful in MATCH
      matchRemaining: Math.max(0, C.matchSeconds - pos),
      phaseElapsed: phaseElapsed,
      phaseRemaining: Math.max(0, phaseTotal - phaseElapsed),
      phaseTotal: phaseTotal,
      // seconds until the next match actually begins (ship drop → 00:00)
      untilNextMatch: pos < C.matchSeconds ? (cycleSeconds - pos) : (cycleSeconds - pos),
      stormActive: pos < C.matchSeconds && pos >= C.stormStartAtSeconds,
      stormProgress: pos < C.matchSeconds
        ? OJ.util.clamp((pos - C.stormStartAtSeconds) / (C.matchSeconds - C.stormStartAtSeconds), 0, 1)
        : 0
    };
  }

  /** Index of the most recent 2-minute location highlight, or -1 before the first. */
  function highlightIndex(matchTime) {
    return Math.floor(matchTime / C.highlightEverySeconds);
  }

  /** 0..1 strength of the location highlight pulse right now. */
  function highlightStrength(matchTime) {
    if (matchTime < C.highlightEverySeconds) return 0;
    var since = matchTime % C.highlightEverySeconds;
    if (since > C.highlightHoldSeconds) return 0;
    return 1 - (since / C.highlightHoldSeconds);
  }

  function secondsToNextHighlight(matchTime) {
    var every = C.highlightEverySeconds;
    return every - (matchTime % every);
  }

  return {
    state: state,
    cycleSeconds: cycleSeconds,
    init: init,
    advance: advance,
    setTimeScale: setTimeScale,
    skipTo: skipTo,
    skipWithinCycle: skipWithinCycle,
    forceNextMatch: forceNextMatch,
    read: read,
    highlightIndex: highlightIndex,
    highlightStrength: highlightStrength,
    secondsToNextHighlight: secondsToNextHighlight
  };
})();
