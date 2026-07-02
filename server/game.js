'use strict';

const TOTAL_CARDS = 84;
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;
const WIN_SCORE = 30;

const PHASES = {
  LOBBY: 'lobby',
  CLUE: 'clue',
  SUBMIT: 'submit',
  VOTE: 'vote',
  REVEAL: 'reveal',
  GAMEOVER: 'gameover',
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeDeck() {
  return shuffle(Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1));
}

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = []; // { id, name, socketId, connected, score, hand, submitted, vote, lastDelta }
    this.hostId = null;
    this.phase = PHASES.LOBBY;
    this.deck = [];
    this.round = 0;
    this.storytellerIndex = -1;
    this.clue = '';
    this.storytellerCard = null;
    this.tableCards = []; // [{ cardId, ownerId }] shuffled when voting starts
    this.roundSummary = null;
    this.winnerIds = [];
    this.createdAt = Date.now();
  }

  get handSize() {
    return this.players.length === 3 ? 7 : 6;
  }

  get requiredSubmissions() {
    // Official 3-player rule: non-storytellers each play 2 cards.
    return this.players.length === 3 ? 2 : 1;
  }

  get storyteller() {
    return this.players[this.storytellerIndex] || null;
  }

  findPlayer(playerId) {
    return this.players.find((p) => p.id === playerId) || null;
  }

  addPlayer(name, socketId) {
    if (this.phase !== PHASES.LOBBY) throw new Error('Game already in progress');
    if (this.players.length >= MAX_PLAYERS) throw new Error('Room is full (max 6 players)');
    const clean = String(name || '').trim().slice(0, 20);
    if (!clean) throw new Error('Name is required');
    if (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('That name is already taken in this room');
    }
    const player = {
      id: makeId(),
      name: clean,
      socketId,
      connected: true,
      score: 0,
      hand: [],
      submitted: [],
      vote: null,
      lastDelta: 0,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    return player;
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    if (this.hostId === playerId && this.players.length) {
      this.hostId = this.players[0].id;
    }
    if (this.phase !== PHASES.LOBBY && idx <= this.storytellerIndex && this.storytellerIndex > 0) {
      this.storytellerIndex--;
    }
  }

  /** Player intentionally exits the room (any phase). */
  leave(playerId) {
    const p = this.findPlayer(playerId);
    if (!p) return;
    if (this.phase === PHASES.LOBBY || this.phase === PHASES.GAMEOVER) {
      this.removePlayer(playerId);
      return;
    }
    const idx = this.players.indexOf(p);
    const wasStoryteller = this.storyteller?.id === playerId;
    this.removePlayer(playerId);
    if (this.players.length < MIN_PLAYERS) {
      this.endGame();
      return;
    }
    if (this.phase === PHASES.REVEAL) return; // round already scored
    if (wasStoryteller) {
      // Abort the round: everyone takes their played cards back, next player tells the story.
      for (const q of this.players) {
        q.hand.push(...q.submitted);
        q.submitted = [];
        q.vote = null;
      }
      this.storytellerIndex = idx % this.players.length;
      this.round--; // beginRound() re-increments
      this.beginRound();
    } else {
      // Pull their cards off the table and void any votes cast on them.
      const gone = new Set(this.tableCards.filter((t) => t.ownerId === playerId).map((t) => t.cardId));
      if (gone.size) {
        this.tableCards = this.tableCards.filter((t) => !gone.has(t.cardId));
        for (const q of this.players) {
          if (q.vote !== null && gone.has(q.vote)) q.vote = null;
        }
      }
      this.checkSubmissionsComplete();
      this.checkVotesComplete();
    }
  }

  /** Host ends the game early — final scores decide the winner. */
  hostEndGame(playerId) {
    if (playerId !== this.hostId) throw new Error('Only the host can end the game');
    if (this.phase === PHASES.LOBBY || this.phase === PHASES.GAMEOVER) {
      throw new Error('No game in progress');
    }
    this.endGame();
  }

  markDisconnected(playerId) {
    const p = this.findPlayer(playerId);
    if (!p) return;
    if (this.phase === PHASES.LOBBY) {
      this.removePlayer(playerId);
    } else {
      p.connected = false;
      // Progress may now be unblocked if we were waiting on this player.
      this.checkSubmissionsComplete();
      this.checkVotesComplete();
    }
  }

  reconnect(playerId, socketId) {
    const p = this.findPlayer(playerId);
    if (!p) return null;
    p.connected = true;
    p.socketId = socketId;
    return p;
  }

  start(playerId) {
    if (playerId !== this.hostId) throw new Error('Only the host can start the game');
    if (this.phase !== PHASES.LOBBY) throw new Error('Game already started');
    if (this.players.length < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players`);
    this.deck = makeDeck();
    this.round = 0;
    for (const p of this.players) {
      p.score = 0;
      p.hand = this.deck.splice(0, this.handSize);
    }
    this.storytellerIndex = Math.floor(Math.random() * this.players.length);
    this.beginRound();
  }

  beginRound() {
    this.round++;
    this.phase = PHASES.CLUE;
    this.clue = '';
    this.storytellerCard = null;
    this.tableCards = [];
    this.roundSummary = null;
    for (const p of this.players) {
      p.submitted = [];
      p.vote = null;
      p.lastDelta = 0;
    }
  }

  giveClue(playerId, cardId, clue) {
    if (this.phase !== PHASES.CLUE) throw new Error('Not the clue phase');
    const st = this.storyteller;
    if (!st || st.id !== playerId) throw new Error('You are not the storyteller');
    const cleanClue = String(clue || '').trim().slice(0, 120);
    if (!cleanClue) throw new Error('A clue is required');
    if (!st.hand.includes(cardId)) throw new Error('Card not in your hand');
    this.clue = cleanClue;
    this.storytellerCard = cardId;
    st.submitted = [cardId];
    st.hand = st.hand.filter((c) => c !== cardId);
    this.phase = PHASES.SUBMIT;
  }

  submitCards(playerId, cardIds) {
    if (this.phase !== PHASES.SUBMIT) throw new Error('Not the submission phase');
    const p = this.findPlayer(playerId);
    if (!p) throw new Error('Player not found');
    if (p.id === this.storyteller?.id) throw new Error('Storyteller already played');
    if (p.submitted.length) throw new Error('You already submitted');
    const ids = [...new Set(cardIds)];
    if (ids.length !== this.requiredSubmissions) {
      throw new Error(`You must play exactly ${this.requiredSubmissions} card(s)`);
    }
    if (!ids.every((c) => p.hand.includes(c))) throw new Error('Card not in your hand');
    p.submitted = ids;
    p.hand = p.hand.filter((c) => !ids.includes(c));
    this.checkSubmissionsComplete();
  }

  checkSubmissionsComplete() {
    if (this.phase !== PHASES.SUBMIT) return;
    const pending = this.players.filter(
      (p) => p.id !== this.storyteller?.id && p.connected && !p.submitted.length
    );
    if (pending.length) return;
    this.tableCards = shuffle(
      this.players.flatMap((p) => p.submitted.map((cardId) => ({ cardId, ownerId: p.id })))
    );
    this.phase = PHASES.VOTE;
  }

  vote(playerId, cardId) {
    if (this.phase !== PHASES.VOTE) throw new Error('Not the voting phase');
    const p = this.findPlayer(playerId);
    if (!p) throw new Error('Player not found');
    if (p.id === this.storyteller?.id) throw new Error('The storyteller does not vote');
    if (p.vote !== null) throw new Error('You already voted');
    const entry = this.tableCards.find((t) => t.cardId === cardId);
    if (!entry) throw new Error('Card is not on the table');
    if (entry.ownerId === playerId) throw new Error('You cannot vote for your own card');
    p.vote = cardId;
    this.checkVotesComplete();
  }

  checkVotesComplete() {
    if (this.phase !== PHASES.VOTE) return;
    const pending = this.players.filter(
      (p) => p.id !== this.storyteller?.id && p.connected && p.vote === null
    );
    if (pending.length) return;
    this.scoreRound();
  }

  scoreRound() {
    const st = this.storyteller;
    const voters = this.players.filter((p) => p.id !== st.id && p.vote !== null);
    const correct = voters.filter((p) => p.vote === this.storytellerCard);
    const allOrNone = correct.length === 0 || (voters.length > 0 && correct.length === voters.length);

    for (const p of this.players) p.lastDelta = 0;

    if (allOrNone) {
      for (const p of this.players) {
        if (p.id !== st.id) p.lastDelta += 2;
      }
    } else {
      st.lastDelta += 3;
      for (const p of correct) p.lastDelta += 3;
    }
    // +1 per vote received on your own (non-storyteller) card
    for (const voter of voters) {
      const entry = this.tableCards.find((t) => t.cardId === voter.vote);
      if (entry && entry.ownerId !== st.id) {
        const owner = this.findPlayer(entry.ownerId);
        if (owner) owner.lastDelta += 1;
      }
    }
    for (const p of this.players) p.score += p.lastDelta;

    this.roundSummary = {
      clue: this.clue,
      storytellerId: st.id,
      storytellerCard: this.storytellerCard,
      allFound: voters.length > 0 && correct.length === voters.length,
      noneFound: correct.length === 0,
      cards: this.tableCards.map((t) => ({
        cardId: t.cardId,
        ownerId: t.ownerId,
        ownerName: this.findPlayer(t.ownerId)?.name || '?',
        isStoryteller: t.ownerId === st.id,
        voters: voters.filter((v) => v.vote === t.cardId).map((v) => v.name),
      })),
      deltas: this.players.map((p) => ({ id: p.id, name: p.name, delta: p.lastDelta, score: p.score })),
    };
    this.phase = PHASES.REVEAL;
  }

  nextRound(playerId) {
    if (this.phase !== PHASES.REVEAL) throw new Error('Not in reveal phase');
    if (playerId !== this.hostId && playerId !== this.storyteller?.id) {
      throw new Error('Only the host or storyteller can continue');
    }
    // Check win condition
    const winners = this.players.filter((p) => p.score >= WIN_SCORE);
    // Refill hands; if the deck runs dry the game ends.
    const cardsNeeded = this.players.reduce((n, p) => n + (this.handSize - p.hand.length), 0);
    if (winners.length || this.deck.length < cardsNeeded) {
      this.endGame();
      return;
    }
    for (const p of this.players) {
      while (p.hand.length < this.handSize && this.deck.length) {
        p.hand.push(this.deck.shift());
      }
    }
    // Advance storyteller to the next connected player
    for (let i = 1; i <= this.players.length; i++) {
      const idx = (this.storytellerIndex + i) % this.players.length;
      if (this.players[idx].connected) {
        this.storytellerIndex = idx;
        break;
      }
    }
    this.beginRound();
  }

  endGame() {
    const top = Math.max(...this.players.map((p) => p.score));
    this.winnerIds = this.players.filter((p) => p.score === top).map((p) => p.id);
    this.phase = PHASES.GAMEOVER;
  }

  playAgain(playerId) {
    if (this.phase !== PHASES.GAMEOVER) throw new Error('Game is not over');
    if (playerId !== this.hostId) throw new Error('Only the host can restart');
    this.phase = PHASES.LOBBY;
    this.round = 0;
    this.winnerIds = [];
    this.roundSummary = null;
    for (const p of this.players) {
      p.score = 0;
      p.hand = [];
      p.submitted = [];
      p.vote = null;
      p.lastDelta = 0;
    }
    // Drop players who left during the game
    this.players = this.players.filter((p) => p.connected);
    if (!this.players.some((p) => p.id === this.hostId) && this.players.length) {
      this.hostId = this.players[0].id;
    }
  }

  isEmpty() {
    return this.players.every((p) => !p.connected) || this.players.length === 0;
  }

  /** Personalized, spoiler-free view of the room for one player. */
  stateFor(playerId) {
    const me = this.findPlayer(playerId);
    const st = this.storyteller;
    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      clue: this.phase === PHASES.CLUE ? '' : this.clue,
      deckCount: this.deck.length,
      requiredSubmissions: this.requiredSubmissions,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      winScore: WIN_SCORE,
      hostId: this.hostId,
      storytellerId: st ? st.id : null,
      winnerIds: this.winnerIds,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        score: p.score,
        isHost: p.id === this.hostId,
        isStoryteller: st ? p.id === st.id : false,
        hasSubmitted: p.submitted.length > 0,
        hasVoted: p.vote !== null,
      })),
      you: me
        ? {
            id: me.id,
            hand: me.hand,
            submitted: me.submitted,
            vote: me.vote,
            isHost: me.id === this.hostId,
            isStoryteller: st ? me.id === st.id : false,
          }
        : null,
      // During voting only card ids are visible (owners hidden)
      tableCards:
        this.phase === PHASES.VOTE
          ? this.tableCards.map((t) => ({ cardId: t.cardId, isMine: t.ownerId === playerId }))
          : [],
      roundSummary: this.phase === PHASES.REVEAL || this.phase === PHASES.GAMEOVER ? this.roundSummary : null,
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  create() {
    const room = new Room(this.generateCode());
    this.rooms.set(room.code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').trim().toUpperCase()) || null;
  }

  delete(code) {
    this.rooms.delete(code);
  }

  cleanup() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.isEmpty() && now - room.createdAt > 60_000) {
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = { RoomManager, Room, PHASES };
