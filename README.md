# Hearthlight

A 2D top-down action RPG for the browser: a hub village that grows as you win, three dungeons
(Sunken Crypt, Overgrown Ruins, Flooded Grotto) with rooms, doors, keys, traps and chests,
telegraphed enemies, multi-phase bosses, loot with rarities and random stats, an ability-card
loadout, and online co-op for 2 to 4 players.

Everything you see and hear (pixel art, tiles, lighting, particles, sound effects, music) is
generated in code. There are no image, sound or font files.

```
index.html     the whole game client (self-contained, open it directly to play solo)
server.js      the small co-op server (Node.js + ws): room codes, message relay, rejoin
package.json   declares the one dependency (ws)
src/           readable source modules; `node build.js` inlines them into index.html
build.js       the build script (only needed if you edit src/)
```

## Play online

**https://leadergamerhh-ctrl.github.io/hearthlight/** runs the whole game in your browser for
solo play, with nothing to install. Saves stay in your browser.

Co-op from the website uses the public server at `wss://hearthlight.onrender.com` (a free Render
web service running `server.js`; see *Hosting the co-op server on Render*). Free servers sleep
after about 15 idle minutes, so the first player of a session may wait up to a minute while it
wakes; the Co-op screen shows the progress. The server also hosts the game itself at
https://hearthlight.onrender.com.

You can always run your own server instead (below) and open the game from *its* address. Browsers
block a public website from connecting to a server on your own computer, so with a local server,
open `http://localhost:8080` (or its LAN address or a tunnel link) rather than the GitHub Pages site.

## Hosting the co-op server on Render (free)

The repository includes `render.yaml`, so Render can set everything up:

1. Sign in at https://dashboard.render.com (signing in with GitHub is easiest).
2. Choose **New → Blueprint**, connect the `hearthlight` repository, and click **Apply**.
   This creates a free web service named `hearthlight` that runs `npm install` and `node server.js`.
3. When the deploy finishes, the service lives at `https://hearthlight.onrender.com`
   (if Render had to pick a different name, update `ONLINE_SERVER` in `src/08_net.js`,
   run `node build.js`, and push).

New commits to `main` redeploy automatically. The server caps open games at 500, limits how many
messages each connection may send, and keeps no data on disk.

## Story mode

New heroes start in **Story** mode (or pick **Free play** on the new-game screen). The tale of the
Ember Heart runs across five chapters: the prologue at the dying Hearth, one chapter per guardian
(the Hollow King, the Thornmother, the Tidewyrm), and a finale in a fourth dungeon unlocked by
recovering all three shards, **The Hollow Below**, against **The Pale Sovereign**. It has cutscenes
with portraits, an on-screen objective, chapter-aware village dialogue, 16 lore stones to find in
the dungeons, an epilogue and credits. **Tab → Story** shows chapters, collected lore and the current
objective, and can turn story mode on for older saves (finished chapters count as done).
In co-op, dungeon dialogue plays as subtitles that never pause the party.

## Play solo (no server needed)

Double-click `index.html` (or open it in Chrome, Edge or Firefox). Choose **Play**, make a hero, and go.
Solo mode needs no network at all. Saves are stored in the browser (three slots).

## Run the co-op server on your computer

1. Install Node.js 18 or newer from https://nodejs.org (the LTS build is fine).
2. Open a terminal in this folder and install the dependency once:

   ```bash
   npm install
   ```

3. Start the server:

   ```bash
   node server.js
   ```

   It prints the addresses it is reachable on, for example:

   ```
   This computer:     http://localhost:8080
   Same network (LAN): http://192.168.1.23:8080
   ```

   Use another port with `PORT=9000 node server.js` (macOS/Linux) or
   `$env:PORT=9000; node server.js` (Windows PowerShell).

4. Open `http://localhost:8080` in your browser. The server serves the same `index.html`.
5. Pick **Co-op** on the title screen (or press **Tab → Co-op** in game), choose a hero, then
   **Host a game**. You get a 4-letter room code.
6. Friends open the game, choose **Co-op**, enter the code and press **Join**.

The host picks the dungeon at the village gate and the whole party travels together.
Up to 4 players. Each player keeps their own character, inventory and save file.

### Friends on the same Wi-Fi / LAN

Friends open `http://<your-LAN-IP>:8080` (the "Same network" line the server prints).
The server address field in the Co-op screen fills itself in when the page comes from the
server. If the connection fails, allow Node.js through your firewall when Windows asks
(or open TCP port 8080 for private networks).

### Friends over the internet

The game does not publish anything for you. Two common options:

* **A tunnel (easiest, no router changes).** For example with Cloudflare's free tunnel:
  `cloudflared tunnel --url http://localhost:8080`, or with ngrok: `ngrok http 8080`.
  Each prints a public `https://…` address. Send that address to friends; they open it,
  and the game connects back to the same address over `wss://` automatically.
  Stop the tunnel when you are done; anyone with the link can reach the game while it runs.
* **Port forwarding.** Forward TCP port 8080 on your router to your computer's LAN IP, then
  friends open `http://<your-public-IP>:8080`. This exposes the server to the internet for as
  long as it runs, so only do it if you are comfortable with that.

A friend who already has `index.html` can also open their local copy and type the server
address (`ws://host:port` or `wss://tunnel-address`) into the Co-op screen's server field.

## Controls

| Action | Keys |
|---|---|
| Move | W A S D (or arrow keys) |
| Aim | Mouse (J/K attacks aim where you're walking) |
| Light attack (3-hit combo) | Left click / J |
| Heavy attack (breaks shields and poise) | Right click / K |
| Block (tap just before a hit to **parry**) | Hold Shift / L |
| Dodge roll (invulnerable) | Space |
| Ability cards | 1 – 6 |
| Healing flask | Q |
| Interact / talk / open | E |
| Inventory · Character · Map · Pause | Tab or I · C · M · Esc |
| Chat · Ping · "Help!" · "Thanks!" | Enter · G · H · T |
| Mute | N |

**Gamepad** (standard layout, for gameplay; menus use the mouse): left stick move, right stick aim,
X light, Y heavy, A roll, B interact, RB block, LB flask, d-pad cards 1–4, LT/RT cards 5–6,
Start menu, Back map.

**Settings** (Tab → Settings): master/music/effects volume, mute, screen shake, glow (bloom) and
damage numbers.

## How the game is built

* **Simulation and rendering are separate.** All gameplay runs in a fixed 60 Hz step
  (`step()` in `src/11_game.js`); rendering only reads state and interpolates. Entities are
  plain JSON-serializable objects, so the same code runs solo, as host, and as guest.
* **Dungeons are seeded.** Every client generates the identical map from the seed the host
  sends; only room/door/chest *state* travels over the network.

### Combat design notes (what was borrowed and why)

* **Telegraphs (Hades, Zelda).** Every damaging enemy attack has a wind-up: the enemy glows red
  with a short glint sound, and area attacks draw a red zone whose inner fill grows to the edge
  at exactly the moment the hit lands. Aimed attacks track you during the first part of the
  wind-up and then lock, so side-stepping and rolling late is rewarded.
* **Dodge i-frames (Hades, Souls).** The roll is invulnerable for its first 0.27 s of 0.34 s,
  and any attack can be cancelled into a roll after its active frames. Inputs are buffered
  for about 0.16 s so presses are never eaten.
* **Perfect dodge.** Rolling through an attack while invulnerable flashes "DODGE" and refunds
  stamina and a little mana, so good dodging fuels more aggression.
* **Aim assist (Hades).** If an enemy is close to where you're aiming, your swing turns to meet
  it, so near-misses from the mouse being a few degrees off don't whiff.
* **Co-op awareness.** Teammates out of view get an edge-of-screen arrow with their distance,
  which flashes red when they're downed and need a revive.
* **Stamina (Elden Ring).** Attacks, heavy attacks, rolls and blocked hits drain stamina; it
  regenerates after a short delay (slower while blocking). You can act while you have any
  stamina left, but hitting zero makes you wait.
* **Poise and stance (Elden Ring).** Enemies have poise. Heavy hits break it and stagger them.
  Bosses have a stance meter: break it for a long opening. Shields block from the front only;
  flank them, use a heavy attack, or use spells.
* **Boss phases.** Each boss has three phases at 100/60/30 % health. A phase change is a short
  invulnerable roar with a knock-back wave, then new attacks are added and the old ones speed up
  (the Hollow King gains a delayed slam that punishes panic-rolling).
* **Flasks.** Healing has a commitment window (you slow down while drinking) and refills at the
  Hearth, like Estus at a grace.
* **Hit feel.** Hit-stop on each landed blow (longer on heavies and crits), knock-back scaled by
  enemy mass, screen shake, white hit-flash and damage numbers.

### Networking design

**Host-authoritative world, owner-predicted avatars, snapshot interpolation.**

* The host's browser runs the authoritative world: enemies, bosses, rooms, doors, keys,
  pickups and gold, using exactly the same code as solo play. There is no game logic on the
  server; `server.js` only hands out room codes and relays messages. That keeps solo play
  fully offline and makes the server tiny.
* **Client prediction:** every player simulates their own character locally every 1/60 s with
  zero input lag. They send their state 30 times a second.
* **Snapshot interpolation:** the host sends world snapshots 20 times a second. Other players and
  all enemies are drawn 100 ms in the past, blended between the two snapshots around that time
  (the same idea as Valve's Source engine `cl_interp`). Clock offsets are estimated per sender
  from message timestamps.
* **Hits:** each client detects its own hits against what it sees and reports them to the host,
  which applies damage, knock-back, poise and death. The attacker gets instant feedback (flash,
  numbers, hit-stop) without waiting for the round trip.
* **Damage to players is judged by the player's own client** against the interpolated enemy
  attacks it is shown ("favour the defender"), so a dodge that looks successful *is* successful.
  Telegraphs and enemy projectiles are sent once as events with a host timestamp and simulated
  identically on every client, aligned with the interpolated enemies.
* **Reconciliation:** because each player is authoritative over their own avatar, the only
  corrections are explicit ones from the host (for example pulling the party into a room when
  its doors lock), applied as teleports. There is no rewind-and-replay, which suits a
  cooperative game where cheating isn't a concern.
* **Disconnects:** a dropped guest reconnects automatically with a token and is put back into the
  current dungeon. If the host drops, guests wait up to 15 s for the host to reconnect; if the
  host is gone for good, every guest is safely returned to their own village with their loot.
  Enemy health and damage scale with party size.
* Background tabs keep simulating (a Worker timer drives the fixed step when the browser pauses
  animation frames), so a host who alt-tabs doesn't freeze the party.

## Saving

Progress autosaves when you return to the village, buy, upgrade or level up, and can be saved
from **Esc → Game**. Three save slots, with New Game and Delete on the hero screen.
Items found in a dungeon are **unbanked** (marked with a dot) until you walk back through a
portal. If you die, you drop half of the gold found on that run and roughly half of your
unbanked items. Anything in your stash, or carried in from the village, is always safe.

## Credits

Design, code, pixel art, sound effects and music: procedurally generated for this project.
No external assets. Fonts are your system's fonts.
The server uses [ws](https://github.com/websockets/ws) (MIT License).
