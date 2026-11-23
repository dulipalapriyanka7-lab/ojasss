# OJASSS Daily Challenge — Island Survival
## Complete game flow

Source: `OJASSS_Daily_Challenge_Illustrated.pdf` (sections 1–6 + the 8-panel
illustrated flow). Everything below is implemented in the prototype in this
folder; every number lives in [`js/config.js`](../js/config.js).

---

## 1. The master clock

One always-running clock drives the entire product. **No admin starts a round.**

```
|<--------------------------- 30 min cycle ---------------------------->|
|  MATCH 20:00                        | RESULTS 2:30 | LOBBY 6:45 |SHIP |
|                                     |<------------ 10 min break ------>|
0:00                               20:00          22:30        29:15  30:00
```

| Phase | Length | What the player sees |
|---|---|---|
| `MATCH` | 20:00 | Playing on the island |
| `RESULTS` | 2:30 | Final board, top 3, your rank |
| `LOBBY` | 6:45 | Countdown, roster filling, JOIN GAME |
| `SHIP` | 0:45 | Ship sails in, players drop |

The phase is a **pure function of the clock**, not of events:

```js
pos        = virtualSeconds % 1800
cycleIndex = floor(virtualSeconds / 1800)    // also the match id and map seed
```

Consequences that matter:

- Reload the page mid-round and you land back in whatever is happening *now*.
- Two clients never disagree about the phase — they both read the same clock.
- A server restart loses no schedule state; the clock is derived, not stored.
- The map for a round is seeded from `cycleIndex`, so every client generates
  the identical island without sending any map data.

> In the prototype the clock is client-side and scaled for testing. **In
> production this clock is the server's and the client only reads it.**

---

## 2. Phase: LOBBY (break)

**Shows:** hero banner, `20 mins / 10 mins / 24/7` stats, phase countdown,
`Players n/20` roster, **JOIN GAME**.

**Behaviour**

1. The countdown reads *time until the next match begins*, not time until the
   phase ends.
2. The roster fills over the break — it reaches 20/20 by the time the ship
   boards.
3. Tapping **JOIN GAME** registers you for the **next** ship (`cycleIndex + 1`).
   Once registered you stay registered for every following round while you are
   on the Game tab — you are never dropped back into a queue.
4. Opening the app **mid-match** shows `MATCH IN PROGRESS`, the time remaining,
   and "you are registered for the next one". You cannot join a running round:
   per spec the ship collects players *before* the island, so late entry is not
   possible.

**Exit:** clock reaches the SHIP window → go to SHIP if registered, otherwise
stay in LOBBY and watch the countdown.

---

## 3. Phase: SHIP (spec §2)

**Length:** the last 45 s of the break.

1. Whole island framed on screen, camera static.
2. The OJASSS cargo ship sails in from the west and holds off the coast.
3. `Players 18/20` → `20/20` as the roster closes.
4. `Match starting in 00:45 …`
5. From ~40 % through the phase, the twenty players parachute out and spread
   across the island.

**Exit at 0:00:** every player is placed on land, Coins reset to **50**,
magazine refilled, and the match screen opens.

---

## 4. Phase: MATCH (spec §3–§5)

### 4.1 Start state (per player)

| | |
|---|---|
| Coins | **50** (identical for all 20) |
| Weapon | one rifle, 30-round magazine, 120 in reserve |
| Position | scattered on land, roughly evenly around the island |
| Health | **none — there is no health and no elimination** |

### 4.2 The coin-transfer rule — the core loop

```
bullet hits player
  → shooter.hits++, victim.hits++
  → if victim was hit within the last 0.6 s      → no transfer  (grace window)
  → else if victim.coins == 0                    → no transfer  ("no coins")
  → else  victim.coins -= 1 ; shooter.coins += 1
  → victim KEEPS PLAYING — never eliminated, never respawned
```

- Name tag + live Coin balance float above **every** player (spec §3).
- A feed line is written: `Shooter → Victim  +1 Coin`.
- Coins can never go below zero, and no Coins are created or destroyed between
  players — the player pool is a closed system of `20 × 50 = 1000` Coins until
  the Horse arrives.

**The 0.6 s grace window is an addition, not from the PDF.** Without it, one
held trigger at close range drains a player's whole balance in about two
seconds and the match is decided by who gets the first ambush. See
[Open questions](#8-open-questions-for-the-real-build).

### 4.3 Location highlight (spec §4)

- Every **2:00** of match time, every player's position is captured and pinged
  on the minimap for 6 seconds, with an expanding ring.
- The ping shows the position **at the moment of the ping**, frozen — it is not
  live tracking. Moving immediately after a ping is the counter-play.
- Fires at 2:00, 4:00, 6:00 … 16:00 → **8 pings** before the storm.
- The match countdown never pauses for it (spec: "the game countdown keeps
  running continuously").
- Between pings the minimap shows only **you**, plus the Horse once it is out.

### 4.4 Storm and flood (spec §5)

Begins exactly at **18:00** and runs to 20:00.

- Rain, darkening sky, occasional lightning.
- The sea climbs: the land radius shrinks smoothly to **58 %** of the coastline
  over the two minutes.
- Entering water does **not** cost Coins and does **not** eliminate — it drops
  you to swim speed (70 px/s vs 165 walking) and **you cannot fire while
  swimming**. The flood herds the island together; it does not punish.
- Bots actively run inland as the water rises.

### 4.5 The Treasure Horse (spec §5)

Spawns at **18:00**, at the same moment as the storm.

| | |
|---|---|
| Coins carried | **500**, printed above it and shown as a bar |
| On hit | shooter **+1 Coin**, horse **−1 Coin** |
| Hit cooldown | 0.12 s (so it can be shot fast, but not by every pellet of one frame) |
| Behaviour | wanders the dry land, never attacks, never flees |
| At 0 Coins | despawns, and **the same Horse returns 6 s later with a fresh 500** |
| Chest | **none** — the Horse is the only treasure (spec is explicit) |

Horse Coins are **new money** entering the round. This is what lets the last
two minutes rewrite the leaderboard: 500 Coins is half the entire starting
pool, and it can refill more than once.

### 4.6 HUD during the match

| Element | Position |
|---|---|
| `Players 20/20` | top left |
| `Game Time` countdown | top centre |
| Minimap + `Next ping m:ss` | top right |
| Event feed (`A → B +1 Coin`) | right |
| Your `Coins` + `Rank n/20` | bottom left |
| Joystick | bottom left (touch) |
| Ammo / reload / fire | bottom right |
| Banner (`storm`, `ping`, `game started`) | top centre, transient |

---

## 5. Phase: RESULTS (spec §6)

At **20:00** the match stops and Coins are counted exactly as they stand.

- Sort by Coins desc, tie-break on Coins stolen.
- Podium for #1 / #2 / #3, each with Coins, Coins stolen and Horse hits.
- Your own line: final rank, final Coins, and the breakdown — started with 50,
  stole *n*, lost *n*, took *n* off the Horse.
- The 20 → 10 → Auto → 24/7 strip, and `Next game starts in mm:ss`.

**Exit:** back to LOBBY, already registered for the next ship.

---

## 6. Flow diagram

```
            ┌──────────────────────────────────────────────┐
            │              24/7 SERVER CLOCK               │
            └───────────────────┬──────────────────────────┘
                                v
   ┌────────┐  join   ┌────────┐  t=29:15  ┌──────┐  t=00:00  ┌───────┐
   │ LOBBY  ├────────>│REGISTER├──────────>│ SHIP ├──────────>│ MATCH │
   └────▲───┘         └────────┘           └──────┘           └───┬───┘
        │                                                          │
        │                                      ┌───────────────────┤
        │                                      │ every 2:00  ping  │
        │                                      │ at 18:00  storm + │
        │                                      │           horse   │
        │                                      └───────────────────┤
        │                                                          v
   ┌────┴────┐                                              ┌──────────┐
   │  LOBBY  │<─────────── 10 min break ────────────────────│ RESULTS  │
   └─────────┘                                              └──────────┘
```

---

## 7. Config reference

All of it is in [`js/config.js`](../js/config.js):

```js
schedule.matchSeconds          1200   // 20:00
schedule.breakSeconds           600   // 10:00
schedule.shipBoardingSeconds     45
schedule.resultsSeconds         150
schedule.highlightEverySeconds  120   // the 2-minute ping
schedule.highlightHoldSeconds     6
schedule.stormStartAtSeconds   1080   // 18:00

match.maxPlayers                 20
match.startingCoins              50

combat.coinsPerHit                1
combat.hitCooldownSeconds       0.6   // ← assumption, see below
combat.magazineSize              30
combat.reserveAmmo              120

storm.maxFloodRatio            0.42   // island shrinks to 58%
horse.coins                     500
horse.respawnSeconds              6
```

---

## 8. Open questions for the real build

These are rules the PDF does not settle. The prototype picks a reasonable
default for each so the flow is playable — **every one of them is a product
decision, not a technical one.**

| # | Question | Prototype's choice | Why it matters |
|---|---|---|---|
| 1 | What happens when you shoot a player with **0 Coins**? | Nothing transfers, shows "no coins" | Otherwise a broke player is a free farm or goes negative |
| 2 | Can one burst drain a player instantly? | No — **0.6 s grace** between coin losses | Without it the first ambush decides the round |
| 3 | Does the **rising water** cost Coins or eliminate? | No. Swim speed + cannot fire | PDF says "nobody is eliminated"; a drowning rule would contradict it |
| 4 | Can a player join **mid-match**? | No, registers for the next ship | PDF: the ship collects players, then the island |
| 5 | Is ammo limited for the whole round? | 30 + 120, no pickups | Needs an answer: pickups on the island, or infinite reserve? |
| 6 | Does the **Horse refill forever** or a fixed number of times? | Forever, every 6 s | PDF only says it "returns with new Coins" |
| 7 | Are Coins **real wallet currency** or per-round score? | Per-round score | If real, §1, §2 and the Horse all need anti-abuse and bot-detection rules before launch |
| 8 | What happens to a player who **disconnects** mid-match? | n/a in prototype | Server build must decide: freeze and keep their Coins, or let them be farmed |
| 9 | Fewer than 20 registered when the ship sails? | Always 20 (bots) | Real build: minimum player count, or fill with bots? |
| 10 | Voice chat | Not built | Explicitly deferred in the PDF until its rules are decided |

---

## 9. From prototype to server

The prototype is **client-authoritative** — fine for testing the flow, wrong
for a game where Coins have value. The shape that needs to move server-side:

| Prototype (client) | Production (server) |
|---|---|
| `Schedule` derives the phase from local time | Server owns the clock; client syncs an offset and renders |
| Island seeded from `cycleIndex` locally | Same seed, sent by the server at match start |
| Bullet/hit resolution in the browser | Server resolves every hit; client only predicts |
| `registerHit` moves Coins in local memory | Server transaction, per-match ledger, audit log |
| Bots fill the twenty | Real players; bots only as a documented fallback |
| Horse spawn/refill local | Server-owned entity, one source of truth for its 500 |

The clock design is the part that carries over unchanged, and it is the part
that delivers the §6 promise: **the game server stays online 24/7 and no Admin
starts a round.**
