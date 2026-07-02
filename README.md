# 🐇 Dixit Online

An online multiplayer, Dixit-style storytelling board game. Create a room, share the 5-letter code (or invite link), and play with 3–6 friends in real time.

## Rules (same as the board game)

1. Each round one player is the **storyteller**: they secretly pick a card from their hand and give a clue (a word, phrase, sound…).
2. Every other player secretly plays a card from their hand that best fits the clue.
3. All played cards are shuffled and revealed. Everyone except the storyteller votes for the card they think belongs to the storyteller (you can't vote for your own).
4. **Scoring**
   - If *everyone* or *no one* finds the storyteller's card: storyteller gets **0**, everyone else gets **+2**.
   - Otherwise: storyteller and each correct guesser get **+3**.
   - Every vote your own card receives is **+1** (non-storyteller cards).
5. Hands are refilled, the next player becomes storyteller. First to **30 points** wins (or highest score when the deck runs out).
6. **3-player rule**: hands of 7, and non-storytellers play 2 cards each (official variant).

The 84 cards are unique, procedurally generated dreamlike artwork — deterministic per card, rendered as SVG in the browser (no image assets needed).

## Stack

- **Backend**: Node.js, Express, Socket.IO (authoritative game state, spoiler-free per-player views)
- **Frontend**: Vanilla JS SPA + CSS (zero build step)
- Reconnection support: refresh the page mid-game and you rejoin automatically.

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

Open multiple browser tabs (or use a private window) to simulate multiple players.

## Deploy on Render

### Option A — Blueprint (easiest)
1. Push this repo to GitHub.
2. On [Render](https://render.com): **New → Blueprint**, pick the repo. The included [render.yaml](render.yaml) configures everything (free plan).

### Option B — Manual web service
1. **New → Web Service**, connect the repo.
2. Runtime: **Node** · Build command: `npm install` · Start command: `node server/index.js`
3. Plan: Free. Deploy — done.

> Note: on the free plan, Render spins the service down after inactivity; the first visit may take ~30s to wake up. Game rooms live in memory, so a service restart clears active games.

## Project structure

```
server/index.js   # Express + Socket.IO wiring
server/game.js    # Room manager + full game state machine & scoring
public/index.html # SPA shell
public/app.js     # Client: screens, rendering, socket events
public/cards.js   # Procedural SVG card art generator (84 cards)
public/style.css  # Theme
```
