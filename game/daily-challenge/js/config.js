/* OJASSS Daily Challenge - Island Survival
 * Central configuration. Every timing in the PDF spec lives here.
 * All durations are in SECONDS of GAME TIME (real seconds when timeScale = 1).
 */
window.OJ = window.OJ || {};

OJ.CONFIG = {
  /* ---------- 1. GAME SCHEDULE (spec section 1) ---------- */
  schedule: {
    matchSeconds: 20 * 60,       // each game lasts 20 minutes
    breakSeconds: 10 * 60,       // 10 minute break after the game
    // 20 + 10 = 30 min cycle, running 24 hours a day.
    // Phase is derived from wall-clock so the server "never stops".
    epochMs: Date.UTC(2026, 0, 1, 0, 0, 0), // cycle anchor (UTC)

    shipBoardingSeconds: 45,     // last N seconds of the break = ship cinematic
    resultsSeconds: 150,         // first N seconds of the break = result screen

    highlightEverySeconds: 2 * 60, // section 4: locations highlighted every 2 min
    highlightHoldSeconds: 6,       // how long the highlight stays on the map

    stormStartAtSeconds: 18 * 60   // section 5: storm + horse at 18:00
  },

  /* ---------- Test speed presets ---------- */
  // timeScale multiplies the clock. 1 = real 20+10 schedule.
  speedPresets: [
    { label: '1x  (real 20 + 10 min)', value: 1 },
    { label: '10x (2 min + 1 min)', value: 10 },
    { label: '30x (40 s + 20 s)', value: 30 },
    { label: '60x (20 s + 10 s)', value: 60 }
  ],
  defaultTimeScale: 10,

  /* ---------- 2. MATCH SIZE ---------- */
  match: {
    maxPlayers: 20,              // "Players 20/20" in the mockup
    startingCoins: 50            // every player boards the ship with this
  },

  /* ---------- 3. GUN BATTLE & COINS (spec section 3) ---------- */
  combat: {
    coinsPerHit: 1,              // 1 coin moves from the hit player to the shooter
    // Nobody is eliminated. A hit only moves a coin.
    hitCooldownSeconds: 0.6,     // grace window so one burst can't drain a player
    bulletSpeed: 620,            // px / s
    bulletRangeSeconds: 1.1,
    fireIntervalSeconds: 0.14,
    magazineSize: 30,
    reserveAmmo: 120,
    // Nobody is eliminated, so a 20-minute round needs far more than 150 rounds.
    // The reserve trickles back up (scavenging on the island) instead of running
    // dry after ~20 seconds of sustained fire. See GAME_FLOW.md open question 5.
    reserveRegenPerSecond: 3.5,
    reloadSeconds: 1.8,
    spreadRad: 0.045,
    playerRadius: 16,
    hitRadius: 18
  },

  /* ---------- Movement ---------- */
  movement: {
    walkSpeed: 165,              // px / s
    sprintSpeed: 250,
    swimSpeed: 70,               // in flood water
    shootWhileSwimming: false
  },

  /* ---------- 5. STORM + TREASURE HORSE (spec section 5) ---------- */
  storm: {
    // Water rises from the coast inwards over the final 2 minutes.
    maxFloodRatio: 0.42,         // shrink island radius by up to 42%
    rainDrops: 220
  },
  horse: {
    coins: 500,                  // visible balance on the horse
    coinsPerHit: 1,              // each successful hit gives the shooter 1 coin
    respawnSeconds: 6,           // when its coins run out the SAME horse returns
    radius: 26,
    speed: 95,
    hitCooldownSeconds: 0.12
  },

  /* ---------- Island ---------- */
  island: {
    worldSize: 3000,             // square world, island centred
    radius: 1180,
    hutCount: 26,
    rockCount: 40,
    treeCount: 150
  },

  /* ---------- Bots (stand-ins for the other 19 players) ---------- */
  bots: {
    viewRange: 560,
    fireRange: 480,
    aimErrorRad: 0.14,
    reactionSeconds: 0.35,
    repathSeconds: 4,
    horseGreedDuringStorm: 0.75  // chance a bot prefers the horse over players
  },

  /* ---------- Cosmetic ---------- */
  names: [
    'Player01', 'Player02', 'Player03', 'RaviK', 'Sunitha', 'AjayX', 'Kiran99',
    'Meghana', 'SaiTeja', 'Pavani', 'Harsha', 'Divya', 'NagaRaju', 'Swathi',
    'VamsiG', 'Lakshmi', 'Rohith', 'Bhavani', 'Chaitu', 'Anjali', 'Srikanth',
    'Keerthi', 'Mahesh', 'Tejaswi'
  ]
};
