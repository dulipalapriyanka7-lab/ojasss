# OJASSS Daily Challenge — Island Survival (local prototype)

A playable prototype of the game flow in
`OJASSS_Daily_Challenge_Illustrated.pdf`: the 20 + 10 minute 24/7 cycle, the
ship arrival, the Coin-stealing gun battle, the 2-minute location ping, the
final-2-minute storm and Treasure Horse, and the result board.

- **[docs/STORY.md](docs/STORY.md)** — the story bible: world, the rule that
  makes the game, the four beats of a round, tone, and why each rule exists.
- **[docs/GAME_FLOW.md](docs/GAME_FLOW.md)** — the complete flow: master clock,
  every phase, exact rules and numbers, the flow diagram, open questions, and
  what has to move server-side for the real build.

Plain HTML + CSS + canvas. No build step, no dependencies, no framework.

---

## Run it

Double-click `index.html`, or serve it:

```bash
node game/daily-challenge/serve.cjs
```

Then open <http://127.0.0.1:5180>. It is also registered in
`.claude/launch.json` as `daily-challenge`.

---

## Controls

| | |
|---|---|
| Move | `W A S D` / arrow keys, or the on-screen stick |
| Aim | mouse (auto-aims at the nearest target on touch) |
| Fire | left click, `Space`, or the fire button |
| Reload | `R` or the ⟳ button |
| Sprint | `Shift` |

---

## Testing the flow

A real cycle is 30 minutes, so the **Test controls** panel (bottom right)
compresses it:

| Control | What it does |
|---|---|
| **Clock speed** | `1x` is the real 20 + 10 schedule. `10x` = 2 min match + 1 min break. Also `30x`, `60x`. |
| **⏭ Start match** | Registers you and jumps straight to the ship boarding |
| **📍 Next ping** | Jumps to the next 2-minute location highlight |
| **⛈ Jump to storm** | Jumps to 17:57 — storm and Treasure Horse at 18:00 |
| **🏁 Jump to end** | Ends the match and opens the result board |
| **⏸ Pause clock** | Freezes the schedule to inspect a frame |
| **🔁 Force next game** | Ends the cycle and boards the next ship |
| readout | live phase, match time, phase remaining, game # and clock speed |

**Suggested 2-minute test run:** leave the speed at `10x` → **⏭ Start match** →
watch the ship drop → play the fight → **⛈ Jump to storm** → shoot the Horse →
**🏁 Jump to end** → read the board → it returns to the lobby and the next game
starts on its own.

To watch the real thing, set the speed to `1x` and leave it: a match starts
every 30 minutes on its own, with no interaction at all. That is the §6
behaviour — *the server stays online 24/7, no Admin starts a round.*

---

## Files

```
index.html          app shell: side nav + the four screens
css/style.css       all styling, responsive down to phone width
serve.cjs           tiny static server (optional)
js/
  config.js         ← every timing, coin value and tunable lives here
  utils.js          math/format helpers, seeded RNG
  schedule.js       the 24/7 cycle clock; phase is a pure function of time
  island.js         island shape, terrain bake, obstacles, rising flood
  entities.js       player / bullet / horse factories
  bots.js           AI for the other 19 registered players
  engine.js         match loop, the coin-transfer rule, ping, storm, horse
  render.js         canvas: world, storm, minimap, ship cinematic
  ui.js             DOM: lobby, HUD, results, test panel
  main.js           input + the phase state machine
docs/
  STORY.md
  GAME_FLOW.md
```

Tuning anything — match length, starting Coins, Horse balance, ping interval,
flood depth — means editing `js/config.js` and reloading. Nothing else reads a
hard-coded number.

---

## What this prototype is not

- **Not networked.** The other 19 players are bots, and the clock runs in the
  browser. The schedule design is built to move to the server unchanged —
  see the last section of `docs/GAME_FLOW.md`.
- **Not authoritative.** Coins move in browser memory. Before Coins mean
  anything, hit resolution and the Coin ledger must live on the server.
- **No voice chat**, per the PDF's "first version" note.

Ten rules the PDF leaves open (what happens at 0 Coins, whether water costs
Coins, whether the Horse refills forever, and so on) are listed with the
prototype's assumption for each in
[docs/GAME_FLOW.md § 8](docs/GAME_FLOW.md#8-open-questions-for-the-real-build).
Those are product calls, not code.
